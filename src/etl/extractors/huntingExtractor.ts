// src/etl/extractors/huntingExtractor.ts
// Extracts hunting encounter data for ETL pipeline
// Cluster-aware aggregation using hunting_encounters table

import type { ExtractedHuntingData, WalletContext } from '../types.js';
import { db } from '../../../server/db.js';
import { huntingEncounters, RELIC_DROP_TABLE } from '../../../shared/schema.js';
import { eq, and, or, sql } from 'drizzle-orm';

export async function extractHuntingData(ctx: WalletContext): Promise<ExtractedHuntingData> {
  const wallet = ctx.walletAddress.toLowerCase();
  const clusterKey = ctx.clusterKey;
  
  try {
    let encounters: any[] = [];
    
    if (clusterKey) {
      encounters = await db
        .select()
        .from(huntingEncounters)
        .where(eq(huntingEncounters.clusterKey, clusterKey));
    } else {
      encounters = await db
        .select()
        .from(huntingEncounters)
        .where(eq(huntingEncounters.walletAddress, wallet));
    }
    
    if (!encounters || encounters.length === 0) {
      return {
        wins: 0,
        mothercluckerKills: 0,
        madBoarKills: 0,
        relicsFound: 0,
        cluckerMiracle: false,
      };
    }
    
    const winningEncounters = encounters.filter(e => e.result === 'WIN');
    const wins = winningEncounters.length;
    
    const mothercluckerKills = winningEncounters.filter(
      e => e.enemyId === 'MOTHERCLUCKER'
    ).length;
    
    const madBoarKills = winningEncounters.filter(
      e => e.enemyId === 'MAD_BOAR'
    ).length;
    
    let relicsFound = 0;
    for (const encounter of encounters) {
      if (Array.isArray(encounter.drops)) {
        for (const drop of encounter.drops) {
          if (RELIC_DROP_TABLE.includes(drop.itemId as any)) {
            relicsFound += drop.quantity || 1;
          }
        }
      }
    }
    
    const cluckerMiracle = winningEncounters.some(
      e => 
        e.enemyId === 'MOTHERCLUCKER' && 
        e.survivingHeroCount === 1 && 
        e.survivingHeroHp === 1
    );
    
    return {
      wins,
      mothercluckerKills,
      madBoarKills,
      relicsFound,
      cluckerMiracle,
    };
  } catch (err) {
    console.error(`[HuntingExtractor] Error extracting hunting data for ${wallet}:`, err);
    return {
      wins: 0,
      mothercluckerKills: 0,
      madBoarKills: 0,
      relicsFound: 0,
      cluckerMiracle: false,
    };
  }
}
