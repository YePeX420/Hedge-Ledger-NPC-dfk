/**
 * DFK Age Cache - Background job to compute and cache player DFK Age
 * Runs periodically to populate firstDfkTxTimestamp for players who don't have it yet
 */

import { db } from './server/db.js';
import { players } from './shared/schema.ts';
import { eq, isNull } from 'drizzle-orm';
import * as onchain from './onchain-data.js';

let dfkAgeCacheJobStarted = false;

/**
 * Start background job to compute DFK Age for uncached players
 */
export async function startDfkAgeCache() {
  if (dfkAgeCacheJobStarted) return;
  dfkAgeCacheJobStarted = true;
  
  console.log('[DfkAgeCache] Starting background job...');
  
  // Run immediately on startup
  await computePendingDfkAges();
  
  // Then run every 6 hours to compute for any new players
  setInterval(async () => {
    try {
      await computePendingDfkAges();
    } catch (err) {
      console.error('[DfkAgeCache] Error in background job:', err.message);
    }
  }, 6 * 60 * 60 * 1000); // 6 hours
  
  console.log('[DfkAgeCache] ✅ Background job started');
}

/**
 * Find players without cached DFK Age and compute it
 */
async function computePendingDfkAges() {
  try {
    // Find players with wallet but no cached firstDfkTxTimestamp
    const uncachedPlayers = await db
      .select()
      .from(players)
      .where(
        isNull(players.firstDfkTxTimestamp)
      );
    
    if (uncachedPlayers.length === 0) {
      console.log('[DfkAgeCache] No uncached players to process');
      return;
    }
    
    console.log(`[DfkAgeCache] Found ${uncachedPlayers.length} uncached player(s), computing DFK Age...`);
    
    // Process in batches of 3 to avoid overwhelming the RPC
    const batchSize = 3;
    for (let i = 0; i < uncachedPlayers.length; i += batchSize) {
      const batch = uncachedPlayers.slice(i, i + batchSize);
      
      await Promise.all(
        batch.map(async (player) => {
          try {
            if (!player.primaryWallet) return;
            
            console.log(`[DfkAgeCache] Computing DFK Age for ${player.discordUsername}...`);
            
            // Fetch first transaction timestamp from blockchain
            const firstTxTimestampMs = await onchain.getFirstDfkTxTimestamp(player.primaryWallet);
            
            if (firstTxTimestampMs) {
              // Convert to Date object and cache in database
              const firstTxDate = new Date(firstTxTimestampMs);
              
              await db
                .update(players)
                .set({
                  firstDfkTxTimestamp: firstTxDate,
                  updatedAt: new Date()
                })
                .where(eq(players.id, player.id));
              
              const ageDays = onchain.calculateDfkAgeDays(firstTxTimestampMs);
              console.log(`[DfkAgeCache] ✅ ${player.discordUsername}: DFK Age = ${ageDays} days (first tx: ${firstTxDate.toISOString()})`);
            } else {
              console.log(`[DfkAgeCache] ⚠️  ${player.discordUsername}: Could not determine first DFK transaction`);
            }
          } catch (err) {
            console.warn(`[DfkAgeCache] Error computing DFK age for ${player.discordUsername}:`, err.message);
          }
        })
      );
    }
    
    console.log('[DfkAgeCache] ✅ Batch complete');
  } catch (err) {
    console.error('[DfkAgeCache] Error fetching uncached players:', err.message);
  }
}
