// src/etl/extractors/tournamentExtractor.ts
// Extracts METIS Tournament data for ETL pipeline
// Cluster-aware aggregation - uses future tournament_entries/matches tables when available

import type { ExtractedTournamentData, WalletContext } from '../types.js';
import { db } from '../../../server/db.js';
import { sql } from 'drizzle-orm';

export async function extractTournamentData(ctx: WalletContext): Promise<ExtractedTournamentData> {
  const wallet = ctx.walletAddress.toLowerCase();
  const clusterKey = ctx.clusterKey;
  
  try {
    // Check if tournament_entries table exists
    const tableExists = await db.execute(sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'tournament_entries'
      ) as exists
    `);
    
    if (!(tableExists as any)?.[0]?.exists) {
      // Table doesn't exist yet - return zeros gracefully
      return {
        entries: 0,
        wins: 0,
        topFinish: false,
      };
    }
    
    // Query tournament data for cluster or single wallet
    let entryResult: any[];
    let matchResult: any[];
    let topFinishResult: any[];
    
    if (clusterKey) {
      entryResult = await db.execute(sql`
        SELECT COUNT(*) as entries
        FROM tournament_entries
        WHERE cluster_key = ${clusterKey}
      `);
      
      matchResult = await db.execute(sql`
        SELECT COUNT(*) as wins
        FROM tournament_matches
        WHERE cluster_key = ${clusterKey} AND result = 'WIN'
      `);
      
      topFinishResult = await db.execute(sql`
        SELECT COUNT(*) > 0 as top_finish
        FROM tournament_entries
        WHERE cluster_key = ${clusterKey} AND final_rank <= 3
      `);
    } else {
      entryResult = await db.execute(sql`
        SELECT COUNT(*) as entries
        FROM tournament_entries
        WHERE wallet_address = ${wallet}
      `);
      
      matchResult = await db.execute(sql`
        SELECT COUNT(*) as wins
        FROM tournament_matches
        WHERE wallet_address = ${wallet} AND result = 'WIN'
      `);
      
      topFinishResult = await db.execute(sql`
        SELECT COUNT(*) > 0 as top_finish
        FROM tournament_entries
        WHERE wallet_address = ${wallet} AND final_rank <= 3
      `);
    }
    
    const entryRow = entryResult[0] || {};
    const matchRow = matchResult[0] || {};
    const topFinishRow = topFinishResult[0] || {};
    
    return {
      entries: parseInt(entryRow.entries || '0', 10),
      wins: parseInt(matchRow.wins || '0', 10),
      topFinish: Boolean(topFinishRow.top_finish),
    };
  } catch (err) {
    // Tables may not exist or other error - return zeros gracefully
    console.warn(`[TournamentExtractor] Error extracting tournament data for ${wallet}:`, err);
    return {
      entries: 0,
      wins: 0,
      topFinish: false,
    };
  }
}
