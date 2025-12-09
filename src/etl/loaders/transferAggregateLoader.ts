// src/etl/loaders/transferAggregateLoader.ts
// Loads transfer aggregate data for smurf detection

import { db } from '../../../server/db.js';
import { walletTransferAggregates } from '../../../shared/schema.js';
import { eq, and, gte, lte } from 'drizzle-orm';
import type { WalletContext, FullExtractResult } from '../types.js';

const WINDOW_30D_MS = 30 * 24 * 60 * 60 * 1000;

export async function loadTransferAggregate(
  ctx: WalletContext,
  data: FullExtractResult
): Promise<number> {
  const wallet = ctx.walletAddress.toLowerCase();
  const clusterKey = ctx.clusterKey;
  const now = new Date();
  const windowStart = new Date(now.getTime() - WINDOW_30D_MS);
  
  if (!clusterKey) {
    return 0;
  }
  
  try {
    const existing = await db
      .select()
      .from(walletTransferAggregates)
      .where(
        and(
          eq(walletTransferAggregates.address, wallet),
          gte(walletTransferAggregates.windowStart, windowStart),
          lte(walletTransferAggregates.windowEnd, now)
        )
      );
    
    const transferData = {
      clusterKey,
      address: wallet,
      windowStart,
      windowEnd: now,
      inboundHeroCount: 0,
      outboundHeroCount: 0,
      inboundJewelAmount: String(0),
      outboundJewelAmount: String(0),
      uniqueCounterparties: 0,
      updatedAt: now,
    };
    
    if (existing.length > 0) {
      await db
        .update(walletTransferAggregates)
        .set(transferData)
        .where(eq(walletTransferAggregates.id, existing[0].id));
    } else {
      await db.insert(walletTransferAggregates).values(transferData);
    }
    
    console.log(`[TransferAggregateLoader] Updated transfer aggregate for ${wallet}`);
    return 1;
  } catch (err) {
    console.error(`[TransferAggregateLoader] Error updating transfer aggregate for ${wallet}:`, err);
    return 0;
  }
}
