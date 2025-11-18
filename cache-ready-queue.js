/**
 * Cache-Ready Queue System
 * 
 * Handles users who request garden optimization before pool cache is ready.
 * Queues their requests and automatically sends notifications when cache completes.
 */

import { isCacheReady } from './pool-cache.js';
import { detectWalletLPPositions } from './wallet-lp-detector.js';
import { db } from './server/db.js';
import { players, gardenOptimizations } from './shared/schema.js';
import { eq, and } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

const POLL_INTERVAL_MS = 10000; // Check every 10 seconds

// In-memory queue: Map<discordUserId, { username, wallet, requestedAt }>
const waitingQueue = new Map();

let pollInterval = null;
let discordClient = null;
let isProcessingQueue = false; // Re-entrancy guard

/**
 * Add a user to the waiting queue
 * @param {string} discordUserId - Discord user ID
 * @param {string} username - Discord username
 * @param {string} wallet - User's wallet address
 */
export function addToWaitingQueue(discordUserId, username, wallet) {
  console.log(`[CacheQueue] Adding user ${username} to waiting queue`);
  
  waitingQueue.set(discordUserId, {
    username,
    wallet,
    requestedAt: new Date()
  });
  
  console.log(`[CacheQueue] Queue size: ${waitingQueue.size}`);
}

/**
 * Remove a user from the waiting queue
 * @param {string} discordUserId - Discord user ID
 */
export function removeFromWaitingQueue(discordUserId) {
  const removed = waitingQueue.delete(discordUserId);
  if (removed) {
    console.log(`[CacheQueue] Removed user from waiting queue. Queue size: ${waitingQueue.size}`);
  }
  return removed;
}

/**
 * Get current queue size
 * @returns {number} Number of users waiting
 */
export function getQueueSize() {
  return waitingQueue.size;
}

/**
 * Process all queued users once cache is ready
 */
async function processQueue() {
  // Re-entrancy guard: prevent overlapping executions
  if (isProcessingQueue) {
    return;
  }
  
  if (waitingQueue.size === 0) {
    return; // Nothing to process
  }
  
  if (!isCacheReady()) {
    return; // Cache still not ready
  }
  
  try {
    isProcessingQueue = true; // Acquire lock
    console.log(`[CacheQueue] 🎉 Cache is ready! Processing ${waitingQueue.size} queued optimization requests...`);
    
    // Process all queued users
    for (const [discordUserId, userData] of waitingQueue.entries()) {
      try {
        console.log(`[CacheQueue] Processing optimization for ${userData.username}...`);
        
        // Send DM notification
        const user = await discordClient.users.fetch(discordUserId);
        await user.send("🎉 *pulls out freshly polished ledger* Alright, the garden data is ready. Let me analyze your LP positions now...");
        
        // Detect LP positions
        const positions = await detectLPPositions(userData.wallet);
        
        if (!positions || positions.length === 0) {
          await user.send("Hmm. No garden LP positions found in your wallet. Make sure you have LP tokens staked in Crystalvale pools, then try again.");
          waitingQueue.delete(discordUserId);
          continue;
        }
        
        // Find player record
        const playerRecord = await db
          .select()
          .from(players)
          .where(eq(players.discordId, discordUserId))
          .limit(1);
        
        if (!playerRecord || playerRecord.length === 0) {
          console.error(`[CacheQueue] Player record not found for ${discordUserId}`);
          await user.send("❌ Internal error: Player record not found. Please contact support.");
          waitingQueue.delete(discordUserId);
          continue;
        }
        
        const playerId = playerRecord[0].id;
        
        // Create optimization request
        const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours
        
        await db.insert(gardenOptimizations).values({
          playerId,
          status: 'awaiting_payment',
          requestedAt: new Date(),
          expiresAt,
          expectedAmountJewel: '25.0',
          fromWallet: userData.wallet.toLowerCase(),
          lpSnapshot: sql`${JSON.stringify(positions)}::json`
        });
        
        console.log(`[CacheQueue] ✅ Created optimization request for ${userData.username}`);
        
        // Send payment instructions
        const PAYMENT_WALLET = '0x498BC270C4215Ca62D9023a3D97c5CAdCD7c99e1';
        
        let message = `📊 **Garden Optimization Analysis Ready**\n\n`;
        message += `Found **${positions.length} LP position${positions.length === 1 ? '' : 's'}** in your wallet:\n`;
        
        positions.forEach((pos, i) => {
          const valueUSD = pos.valueUSD ? `$${parseFloat(pos.valueUSD).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}` : 'N/A';
          message += `${i + 1}. **${pos.pairName}** - ${pos.stakedFormatted} LP (${valueUSD})\n`;
        });
        
        message += `\n💎 **Optimization Service: 25 JEWEL**\n\n`;
        message += `To receive your personalized garden yield optimization report:\n`;
        message += `1. Send **exactly 25 JEWEL** to: \`${PAYMENT_WALLET}\`\n`;
        message += `2. Payment must come from your registered wallet: \`${userData.wallet}\`\n`;
        message += `3. You have **2 hours** from now to complete payment\n\n`;
        message += `Once I detect your payment, I'll automatically analyze your heroes and LP positions to recommend the optimal garden assignments for maximum yield. You'll receive:\n`;
        message += `• Before/after JEWEL yield comparison\n`;
        message += `• Specific hero-to-pool assignments\n`;
        message += `• Daily, weekly, and monthly earning projections\n\n`;
        message += `*taps quill impatiently* Send the JEWEL when you're ready.`;
        
        await user.send(message);
        
        // Remove from queue
        waitingQueue.delete(discordUserId);
        
      } catch (error) {
        console.error(`[CacheQueue] ❌ Error processing ${userData.username}:`, error.message);
        
        try {
          const user = await discordClient.users.fetch(discordUserId);
          await user.send("❌ Something went wrong processing your optimization request. Please try again with 'optimize my gardens'.");
        } catch (dmError) {
          console.error(`[CacheQueue] Failed to send error DM to ${discordUserId}`);
        }
        
        waitingQueue.delete(discordUserId);
      }
    }
    
    console.log(`[CacheQueue] ✅ Queue processing complete`);
  } finally {
    isProcessingQueue = false; // Release lock
    console.log(`[CacheQueue] 🔓 Lock released, ready for next poll`);
  }
}

/**
 * Poll for cache readiness and process queue
 */
async function pollCacheStatus() {
  try {
    await processQueue();
  } catch (error) {
    console.error('[CacheQueue] Error during poll:', error.message);
  }
}

/**
 * Initialize the cache-ready queue system
 * @param {Client} client - Discord client instance
 */
export function initializeCacheQueue(client) {
  if (!client) {
    throw new Error('[CacheQueue] Discord client is required');
  }
  
  discordClient = client;
  
  console.log('[CacheQueue] Initializing cache-ready queue system...');
  console.log(`[CacheQueue] Poll interval: ${POLL_INTERVAL_MS / 1000}s`);
  
  // Clear existing interval if any
  if (pollInterval) {
    clearInterval(pollInterval);
  }
  
  // Start polling
  pollInterval = setInterval(pollCacheStatus, POLL_INTERVAL_MS);
  
  console.log('[CacheQueue] ✅ Queue monitor started');
}

/**
 * Stop the queue monitor (for cleanup)
 */
export function stopCacheQueue() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
    console.log('[CacheQueue] Queue monitor stopped');
  }
}
