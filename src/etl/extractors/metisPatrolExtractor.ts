// src/etl/extractors/metisPatrolExtractor.ts
// Extracts METIS patrol encounter data for ETL pipeline
// Cluster-aware aggregation - uses future metis_patrol_events table when available

import type { ExtractedMetisPatrolData, WalletContext } from '../types.js';
import { db } from '../../../server/db.js';
import { sql } from 'drizzle-orm';

export async function extractMetisPatrolData(ctx: WalletContext): Promise<ExtractedMetisPatrolData> {
  const wallet = ctx.walletAddress.toLowerCase();
  const clusterKey = ctx.clusterKey;
  
  try {
    // Check if metis_patrol_events table exists
    const tableExists = await db.execute(sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'metis_patrol_events'
      ) as exists
    `);
    
    if (!(tableExists as any)?.[0]?.exists) {
      // Table doesn't exist yet - return zeros gracefully
      return {
        wins: 0,
        eliteWins: 0,
      };
    }
    
    // Query patrol events for cluster or single wallet
    let result: any[];
    
    if (clusterKey) {
      result = await db.execute(sql`
        SELECT 
          COUNT(*) FILTER (WHERE result = 'WIN') as wins,
          COUNT(*) FILTER (WHERE result = 'WIN' AND difficulty IN ('ELITE', 'BOSS', 'LEGENDARY')) as elite_wins
        FROM metis_patrol_events
        WHERE cluster_key = ${clusterKey}
      `);
    } else {
      result = await db.execute(sql`
        SELECT 
          COUNT(*) FILTER (WHERE result = 'WIN') as wins,
          COUNT(*) FILTER (WHERE result = 'WIN' AND difficulty IN ('ELITE', 'BOSS', 'LEGENDARY')) as elite_wins
        FROM metis_patrol_events
        WHERE wallet_address = ${wallet}
      `);
    }
    
    const row = result[0] || {};
    
    return {
      wins: parseInt(row.wins || '0', 10),
      eliteWins: parseInt(row.elite_wins || '0', 10),
    };
  } catch (err) {
    // Table may not exist or other error - return zeros gracefully
    console.warn(`[MetisPatrolExtractor] Error extracting patrol data for ${wallet}:`, err);
    return {
      wins: 0,
      eliteWins: 0,
    };
  }
}
