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
 * Collect all wallet addresses for a player (primaryWallet + wallets array)
 * Returns deduplicated, lowercase list
 */
function getAllPlayerWallets(player) {
  const walletSet = new Set();
  
  // Add primary wallet
  if (player.primaryWallet) {
    walletSet.add(player.primaryWallet.toLowerCase());
  }
  
  // Add wallets from JSON array
  if (Array.isArray(player.wallets)) {
    for (const w of player.wallets) {
      if (typeof w === 'string' && w.length > 0) {
        walletSet.add(w.toLowerCase());
      }
    }
  }
  
  return Array.from(walletSet);
}

/**
 * Find players without cached DFK Age and compute it
 * Uses MIN(firstDfkTxTimestamp) across ALL wallets in the player's cluster
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
            // Get all wallets in this player's cluster
            const allWallets = getAllPlayerWallets(player);
            
            if (allWallets.length === 0) {
              console.log(`[DfkAgeCache] ⚠️  ${player.discordUsername}: No wallets linked`);
              return;
            }
            
            console.log(`[DfkAgeCache] Computing DFK Age for ${player.discordUsername} across ${allWallets.length} wallet(s)...`);
            
            // Fetch first transaction timestamp from each wallet
            const timestamps = await Promise.all(
              allWallets.map(wallet => onchain.getFirstDfkTxTimestamp(wallet))
            );
            
            // Filter out null values and find the minimum (earliest) timestamp
            const validTimestamps = timestamps.filter(ts => ts !== null && ts > 0);
            
            if (validTimestamps.length === 0) {
              console.log(`[DfkAgeCache] ⚠️  ${player.discordUsername}: No DFK transactions found across ${allWallets.length} wallet(s)`);
              return;
            }
            
            // Use MIN timestamp (earliest activity across all wallets in cluster)
            const earliestTimestampMs = Math.min(...validTimestamps);
            const firstTxDate = new Date(earliestTimestampMs);
            
            await db
              .update(players)
              .set({
                firstDfkTxTimestamp: firstTxDate,
                updatedAt: new Date()
              })
              .where(eq(players.id, player.id));
            
            const ageDays = onchain.calculateDfkAgeDays(earliestTimestampMs);
            console.log(`[DfkAgeCache] ✅ ${player.discordUsername}: DFK Age = ${ageDays} days (earliest tx across ${allWallets.length} wallet(s): ${firstTxDate.toISOString()})`);
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
