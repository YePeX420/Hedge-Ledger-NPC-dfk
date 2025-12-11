// src/etl/extractors/influenceExtractor.ts
// Extracts METIS Influence prediction data for ETL pipeline
// Cluster-aware aggregation - uses future influence_predictions table when available

import type { ExtractedInfluenceData, WalletContext } from '../types.js';
import { db } from '../../../server/db.js';
import { sql } from 'drizzle-orm';

export async function extractInfluenceData(ctx: WalletContext): Promise<ExtractedInfluenceData> {
  const wallet = ctx.walletAddress.toLowerCase();
  const clusterKey = ctx.clusterKey;
  
  try {
    // Check if influence_predictions table exists
    const tableExists = await db.execute(sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'influence_predictions'
      ) as exists
    `);
    
    if (!(tableExists as any)?.[0]?.exists) {
      // Table doesn't exist yet - return zeros gracefully
      return {
        betsWon: 0,
      };
    }
    
    // Query influence predictions for cluster or single wallet
    let result: any[];
    
    if (clusterKey) {
      result = await db.execute(sql`
        SELECT COUNT(*) as bets_won
        FROM influence_predictions
        WHERE cluster_key = ${clusterKey} AND result = 'CORRECT'
      `);
    } else {
      result = await db.execute(sql`
        SELECT COUNT(*) as bets_won
        FROM influence_predictions
        WHERE wallet_address = ${wallet} AND result = 'CORRECT'
      `);
    }
    
    const row = result[0] || {};
    
    return {
      betsWon: parseInt(row.bets_won || '0', 10),
    };
  } catch (err) {
    // Table may not exist or other error - return zeros gracefully
    console.warn(`[InfluenceExtractor] Error extracting influence data for ${wallet}:`, err);
    return {
      betsWon: 0,
    };
  }
}
