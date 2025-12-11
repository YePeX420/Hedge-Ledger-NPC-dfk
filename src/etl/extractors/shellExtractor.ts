// src/etl/extractors/shellExtractor.ts
// Extracts METIS shell economy data for ETL pipeline
// Cluster-aware aggregation - uses future shell_events/raffle_entries tables when available

import type { ExtractedShellData, WalletContext } from '../types.js';
import { db } from '../../../server/db.js';
import { sql } from 'drizzle-orm';

export async function extractShellData(ctx: WalletContext): Promise<ExtractedShellData> {
  const wallet = ctx.walletAddress.toLowerCase();
  const clusterKey = ctx.clusterKey;
  
  try {
    // Check if shell_events table exists
    const tableExists = await db.execute(sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'shell_events'
      ) as exists
    `);
    
    if (!(tableExists as any)?.[0]?.exists) {
      // Table doesn't exist yet - return zeros gracefully
      return {
        shellsCollected: 0,
        raffleEntries: 0,
        raffleWin: false,
      };
    }
    
    // Query shell data for cluster or single wallet
    let shellResult: any[];
    let raffleResult: any[];
    
    if (clusterKey) {
      shellResult = await db.execute(sql`
        SELECT COALESCE(SUM(shell_amount), 0) as shells_collected
        FROM shell_events
        WHERE cluster_key = ${clusterKey} AND event_type = 'EARN'
      `);
      
      raffleResult = await db.execute(sql`
        SELECT 
          COUNT(*) as raffle_entries,
          COUNT(*) FILTER (WHERE result = 'WIN') > 0 as raffle_win
        FROM shell_raffle_entries
        WHERE cluster_key = ${clusterKey}
      `);
    } else {
      shellResult = await db.execute(sql`
        SELECT COALESCE(SUM(shell_amount), 0) as shells_collected
        FROM shell_events
        WHERE wallet_address = ${wallet} AND event_type = 'EARN'
      `);
      
      raffleResult = await db.execute(sql`
        SELECT 
          COUNT(*) as raffle_entries,
          COUNT(*) FILTER (WHERE result = 'WIN') > 0 as raffle_win
        FROM shell_raffle_entries
        WHERE wallet_address = ${wallet}
      `);
    }
    
    const shellRow = shellResult[0] || {};
    const raffleRow = raffleResult[0] || {};
    
    return {
      shellsCollected: parseInt(shellRow.shells_collected || '0', 10),
      raffleEntries: parseInt(raffleRow.raffle_entries || '0', 10),
      raffleWin: Boolean(raffleRow.raffle_win),
    };
  } catch (err) {
    // Tables may not exist or other error - return zeros gracefully
    console.warn(`[ShellExtractor] Error extracting shell data for ${wallet}:`, err);
    return {
      shellsCollected: 0,
      raffleEntries: 0,
      raffleWin: false,
    };
  }
}
