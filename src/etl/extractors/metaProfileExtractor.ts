// src/etl/extractors/metaProfileExtractor.ts
// Extracts derived meta profile data for ETL pipeline
// Computes composite scores from other extracted data and challenge progress

import type { ExtractedMetaProfileData, WalletContext, FullExtractResult } from '../types.js';
import { db } from '../../../server/db.js';
import { playerChallengeProgress, challenges } from '../../../shared/schema.js';
import { eq, and, sql } from 'drizzle-orm';

// Score weights for composite calculations
const SUMMONING_WEIGHTS = {
  mutagenicSpecialist: 2,
  mythmaker: 5,
  royalLineage: 3,
  summonerOfLegends: 10,
};

const PVP_WEIGHTS = {
  wins: 0.1,
  bestWinStreak: 2,
  flawlessVictory: 10,
};

const METIS_WEIGHTS = {
  eliteWins: 3,
  shellsCollected: 0.1,
  betsWon: 2,
  raffleWin: 20,
  topFinish: 15,
};

export async function extractMetaProfileData(
  ctx: WalletContext, 
  fullData?: FullExtractResult
): Promise<ExtractedMetaProfileData> {
  const playerId = ctx.playerId;
  const clusterKey = ctx.clusterKey;
  
  try {
    // Get all player IDs linked to this cluster for aggregation
    let playerIds: number[] = [];
    if (playerId) {
      playerIds = [playerId];
    }
    if (clusterKey) {
      try {
        const linkedPlayers = await db.execute(sql`
          SELECT DISTINCT wl.player_id as player_id
          FROM wallet_links wl
          WHERE wl.cluster_key = ${clusterKey} AND wl.player_id IS NOT NULL
        `);
        const linkedIds = (linkedPlayers as any[])?.map(r => r.player_id).filter(Boolean) || [];
        playerIds = Array.from(new Set([...playerIds, ...linkedIds]));
      } catch {
        // Table may not exist
      }
    }
    
    // 1. Count prestige achievements unlocked (batched query across all linked players)
    // Use Promise.all with parameterized queries for security and batching
    let prestigeUnlockedCount = 0;
    if (playerIds.length > 0) {
      try {
        // Batch into chunks of 100 to avoid query limits, use parameterized queries
        const BATCH_SIZE = 100;
        const uniqueChallenges = new Set<string>();
        
        for (let i = 0; i < playerIds.length; i += BATCH_SIZE) {
          const batch = playerIds.slice(i, i + BATCH_SIZE);
          // Query each player ID with proper parameterization
          const results = await Promise.all(
            batch.map(pid => 
              db.execute(sql`
                SELECT pcp.challenge_key
                FROM player_challenge_progress pcp
                INNER JOIN challenges c ON pcp.challenge_key = c.key
                WHERE pcp.player_id = ${pid}
                  AND pcp.unlocked = true
                  AND c.meta::text LIKE '%prestige%'
              `).catch(() => [])
            )
          );
          
          for (const result of results) {
            for (const row of result as any[]) {
              if (row?.challenge_key) {
                uniqueChallenges.add(row.challenge_key);
              }
            }
          }
        }
        
        prestigeUnlockedCount = uniqueChallenges.size;
      } catch (e) {
        // Tables may not exist - silently fail
        console.debug('[MetaProfile] Prestige query failed:', e);
      }
    }
    
    // 2. Count categories with exalted tier achievements (batched query across all linked players)
    let exaltedCategoryCount = 0;
    if (playerIds.length > 0) {
      try {
        // Batch into chunks of 100 to avoid query limits, use parameterized queries
        const BATCH_SIZE = 100;
        const uniqueCategories = new Set<string>();
        
        for (let i = 0; i < playerIds.length; i += BATCH_SIZE) {
          const batch = playerIds.slice(i, i + BATCH_SIZE);
          // Query each player ID with proper parameterization
          const results = await Promise.all(
            batch.map(pid => 
              db.execute(sql`
                SELECT c.category_key
                FROM player_challenge_progress pcp
                INNER JOIN challenges c ON pcp.challenge_key = c.key
                WHERE pcp.player_id = ${pid}
                  AND pcp.current_tier = 'EXALTED'
              `).catch(() => [])
            )
          );
          
          for (const result of results) {
            for (const row of result as any[]) {
              if (row?.category_key) {
                uniqueCategories.add(row.category_key);
              }
            }
          }
        }
        
        exaltedCategoryCount = uniqueCategories.size;
      } catch (e) {
        // Tables may not exist - silently fail
        console.debug('[MetaProfile] Exalted query failed:', e);
      }
    }
    
    // 3. Calculate summoning prestige score
    let summoningPrestigeScore = 0;
    if (fullData) {
      const summonsData = fullData.summons;
      summoningPrestigeScore = 
        (summonsData.summonsHighTierGenes * SUMMONING_WEIGHTS.mutagenicSpecialist) +
        (summonsData.summonsMythicRarity * SUMMONING_WEIGHTS.mythmaker);
      
      // Check if Summoner of Legends is unlocked (any mythic)
      if (summonsData.summonsMythicRarity > 0) {
        summoningPrestigeScore += SUMMONING_WEIGHTS.summonerOfLegends;
      }
    }
    
    // 4. Calculate PvP mastery score
    let pvpMasteryScore = 0;
    if (fullData) {
      const pvpData = fullData.pvp;
      pvpMasteryScore = 
        (pvpData.wins * PVP_WEIGHTS.wins) +
        (pvpData.bestWinStreak * PVP_WEIGHTS.bestWinStreak) +
        (pvpData.flawlessVictory ? PVP_WEIGHTS.flawlessVictory : 0);
    }
    
    // 5. Calculate METIS mastery score
    let metisMasteryScore = 0;
    if (fullData) {
      const metisPatrolData = fullData.metisPatrol;
      const shellData = fullData.shells;
      const influenceData = fullData.influence;
      const tournamentData = fullData.tournaments;
      
      metisMasteryScore = 
        (metisPatrolData.eliteWins * METIS_WEIGHTS.eliteWins) +
        (shellData.shellsCollected * METIS_WEIGHTS.shellsCollected) +
        (influenceData.betsWon * METIS_WEIGHTS.betsWon) +
        (shellData.raffleWin ? METIS_WEIGHTS.raffleWin : 0) +
        (tournamentData.topFinish ? METIS_WEIGHTS.topFinish : 0);
    }
    
    return {
      prestigeUnlockedCount,
      exaltedCategoryCount,
      summoningPrestigeScore: Math.round(summoningPrestigeScore),
      pvpMasteryScore: Math.round(pvpMasteryScore),
      metisMasteryScore: Math.round(metisMasteryScore),
    };
  } catch (err) {
    console.warn(`[MetaProfileExtractor] Error extracting meta profile data:`, err);
    return {
      prestigeUnlockedCount: 0,
      exaltedCategoryCount: 0,
      summoningPrestigeScore: 0,
      pvpMasteryScore: 0,
      metisMasteryScore: 0,
    };
  }
}
