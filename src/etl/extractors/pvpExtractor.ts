// src/etl/extractors/pvpExtractor.ts
// Extracts PvP match data for ETL pipeline
// Cluster-aware aggregation using pvp_matches table
// Computes win streaks and flawless victory detection

import type { ExtractedPvpData, WalletContext } from '../types.js';
import { db } from '../../../server/db.js';
import { pvpMatches } from '../../../shared/schema.js';
import { eq, and, desc } from 'drizzle-orm';

export async function extractPvpData(ctx: WalletContext): Promise<ExtractedPvpData> {
  const wallet = ctx.walletAddress.toLowerCase();
  const clusterKey = ctx.clusterKey;
  
  try {
    let matches: any[] = [];
    
    if (clusterKey) {
      matches = await db
        .select()
        .from(pvpMatches)
        .where(
          and(
            eq(pvpMatches.clusterKey, clusterKey),
            eq(pvpMatches.isRanked, true)
          )
        )
        .orderBy(desc(pvpMatches.matchedAt));
    } else {
      matches = await db
        .select()
        .from(pvpMatches)
        .where(
          and(
            eq(pvpMatches.walletAddress, wallet),
            eq(pvpMatches.isRanked, true)
          )
        )
        .orderBy(desc(pvpMatches.matchedAt));
    }
    
    if (!matches || matches.length === 0) {
      return {
        matchesPlayed: 0,
        wins: 0,
        bestWinStreak: 0,
        flawlessVictory: false,
      };
    }
    
    const matchesPlayed = matches.length;
    const winningMatches = matches.filter(m => m.outcome === 'WIN');
    const wins = winningMatches.length;
    
    const flawlessVictory = winningMatches.some(m => m.heroDeaths === 0);
    
    let bestWinStreak = 0;
    let currentStreak = 0;
    
    for (const match of matches) {
      if (match.outcome === 'WIN') {
        currentStreak++;
        if (currentStreak > bestWinStreak) {
          bestWinStreak = currentStreak;
        }
      } else {
        currentStreak = 0;
      }
    }
    
    return {
      matchesPlayed,
      wins,
      bestWinStreak,
      flawlessVictory,
    };
  } catch (err) {
    console.error(`[PvpExtractor] Error extracting PvP data for ${wallet}:`, err);
    return {
      matchesPlayed: 0,
      wins: 0,
      bestWinStreak: 0,
      flawlessVictory: false,
    };
  }
}
