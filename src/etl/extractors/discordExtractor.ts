// src/etl/extractors/discordExtractor.ts
// Extracts Discord interaction data for ETL pipeline

import { db } from '../../../server/db.js';
import { players, interactionMessages, walletLinks } from '../../../shared/schema.js';
import { eq, sql, and, gte, inArray } from 'drizzle-orm';
import type { ExtractedDiscordData, WalletContext } from '../types.js';

/**
 * Compute account age using MIN(firstDfkTxTimestamp) across all wallets in the cluster.
 * This ensures cluster-level aggregation per the ETL specification.
 */
async function computeClusterAccountAgeDays(ctx: WalletContext, fallbackPlayer: any): Promise<number> {
  const clusterKey = ctx.clusterKey;
  
  if (clusterKey) {
    try {
      const clusterWallets = await db
        .select({ address: walletLinks.address })
        .from(walletLinks)
        .where(eq(walletLinks.clusterKey, clusterKey));
      
      if (clusterWallets.length > 0) {
        const walletAddresses = clusterWallets.map((w: { address: string }) => w.address.toLowerCase());
        const walletArrayLiteral = `{${walletAddresses.join(',')}}`;
        
        const result = await db.execute(sql`
          SELECT MIN(first_dfk_tx_timestamp) as earliest_tx
          FROM players
          WHERE LOWER(primary_wallet) = ANY(${sql.raw(`'${walletArrayLiteral}'::text[]`)})
             OR EXISTS (
               SELECT 1 FROM json_array_elements_text(COALESCE(wallets, '[]'::json)) elem
               WHERE LOWER(elem) = ANY(${sql.raw(`'${walletArrayLiteral}'::text[]`)})
             )
        `);
        
        const earliestTx = result.rows?.[0]?.earliest_tx;
        if (earliestTx) {
          const firstTxDate = new Date(earliestTx);
          const now = new Date();
          const diffMs = now.getTime() - firstTxDate.getTime();
          return Math.floor(diffMs / (1000 * 60 * 60 * 24));
        }
      }
    } catch (err) {
      console.warn(`[DiscordExtractor] Error computing cluster account age:`, err);
    }
  }
  
  if (fallbackPlayer?.firstDfkTxTimestamp) {
    const firstTxDate = new Date(fallbackPlayer.firstDfkTxTimestamp);
    const now = new Date();
    const diffMs = now.getTime() - firstTxDate.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }
  
  return 0;
}

export async function extractDiscordData(ctx: WalletContext): Promise<ExtractedDiscordData> {
  const userId = ctx.userId;
  const playerId = ctx.playerId;
  
  if (!userId && !playerId) {
    return {
      messagesToHedge: 0,
      hedgeDayStreak: 0,
      totalSessions: 0,
      accountAgeDays: 0,
    };
  }
  
  try {
    let player;
    
    if (playerId) {
      const players_ = await db.select().from(players).where(eq(players.id, playerId));
      player = players_[0];
    } else if (userId) {
      const players_ = await db.select().from(players).where(eq(players.discordId, userId));
      player = players_[0];
    }
    
    if (!player) {
      return {
        messagesToHedge: 0,
        hedgeDayStreak: 0,
        totalSessions: 0,
        accountAgeDays: 0,
      };
    }
    
    const messagesToHedge = player.totalMessages || 0;
    const totalSessions = player.totalSessions || 0;
    
    const accountAgeDays = await computeClusterAccountAgeDays(ctx, player);
    
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    const recentMessages = await db
      .select({ date: sql<string>`DATE(${interactionMessages.timestamp})` })
      .from(interactionMessages)
      .where(
        and(
          eq(interactionMessages.playerId, player.id),
          gte(interactionMessages.timestamp, sevenDaysAgo)
        )
      )
      .groupBy(sql`DATE(${interactionMessages.timestamp})`)
      .orderBy(sql`DATE(${interactionMessages.timestamp}) DESC`);
    
    let hedgeDayStreak = 0;
    const today = new Date().toISOString().split('T')[0];
    let checkDate = today;
    
    for (const row of recentMessages) {
      if (row.date === checkDate) {
        hedgeDayStreak++;
        const prev = new Date(checkDate);
        prev.setDate(prev.getDate() - 1);
        checkDate = prev.toISOString().split('T')[0];
      } else {
        break;
      }
    }
    
    return {
      messagesToHedge,
      hedgeDayStreak,
      totalSessions,
      accountAgeDays,
    };
  } catch (err) {
    console.error(`[DiscordExtractor] Error extracting Discord data:`, err);
    return {
      messagesToHedge: 0,
      hedgeDayStreak: 0,
      totalSessions: 0,
      accountAgeDays: 0,
    };
  }
}
