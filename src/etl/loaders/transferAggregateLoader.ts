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
  const now = new Date();
  const windowStart = new Date(now.getTime() - WINDOW_30D_MS);
  
  try {
    const existing = await db
      .select()
      .from(walletTransferAggregates)
      .where(
        and(
          eq(walletTransferAggregates.address, wallet),
          gte(walletTransferAggregates.windowStart, windowStart)
        )
      );
    
    const transferData = {
      address: wallet,
      windowStart,
      windowEnd: now,
      inboundPowerDelta: 0,
      outboundPowerDelta: 0,
      inboundTxCount: 0,
      outboundTxCount: 0,
      meta: {
        heroTransfers: 0,
        tokenTransfersUsd: 0,
      },
    };
    
    if (existing.length > 0) {
      await db
        .update(walletTransferAggregates)
        .set({
          windowEnd: now,
        })
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
