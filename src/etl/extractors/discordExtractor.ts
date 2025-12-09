// src/etl/extractors/discordExtractor.ts
// Extracts Discord interaction data for ETL pipeline

import { db } from '../../../server/db.js';
import { players, interactionMessages, interactionSessions } from '../../../shared/schema.js';
import { eq, sql, and, gte } from 'drizzle-orm';
import type { ExtractedDiscordData, WalletContext } from '../types.js';

export async function extractDiscordData(ctx: WalletContext): Promise<ExtractedDiscordData> {
  const userId = ctx.userId;
  const playerId = ctx.playerId;
  
  if (!userId && !playerId) {
    return {
      messagesToHedge: 0,
      hedgeDayStreak: 0,
      totalSessions: 0,
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
      };
    }
    
    const messagesToHedge = player.totalMessages || 0;
    const totalSessions = player.totalSessions || 0;
    
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
    };
  } catch (err) {
    console.error(`[DiscordExtractor] Error extracting Discord data:`, err);
    return {
      messagesToHedge: 0,
      hedgeDayStreak: 0,
      totalSessions: 0,
    };
  }
}
