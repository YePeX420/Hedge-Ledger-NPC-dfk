/**
 * Garden Optimization Processor
 * 
 * Background poller that processes verified garden optimization payments.
 * 
 * Flow:
 * 1. Poll for optimizations with status='payment_verified'
 * 2. Update status to 'processing'
 * 3. Fetch user's heroes from blockchain
 * 4. Generate optimization report using stored LP snapshot
 * 5. Send DM to user with full report
 * 6. Update status to 'completed' with report payload
 * 7. Handle errors by marking status='failed'
 */

import { db } from './server/db.js';
import { gardenOptimizations, players, jewelBalances } from './shared/schema.ts';
import { eq, and, sql } from 'drizzle-orm';
import { analyzeCurrentAssignments } from './garden-analyzer.js';
import { optimizeHeroAssignments, calculateImprovement } from './garden-optimizer.js';
import { generateOptimizationMessages } from './report-formatter.js';
import { getCachedPoolAnalytics, waitForCacheReady } from './pool-cache.js';

const POLL_INTERVAL_MS = 30000; // 30 seconds
const DISCORD_MESSAGE_LIMIT = 2000; // Discord's message character limit
let pollingTimer = null;
let discordClient = null; // Will be set by bot.js

/**
 * Split a long message into chunks that fit Discord's 2000 character limit
 * @param {string} message - The full message to split
 * @returns {string[]} - Array of message chunks
 */
function splitMessage(message) {
  if (message.length <= DISCORD_MESSAGE_LIMIT) {
    return [message];
  }
  
  const chunks = [];
  let currentChunk = '';
  const lines = message.split('\n');
  
  for (const line of lines) {
    // If adding this line would exceed the limit, save current chunk and start new one
    if (currentChunk.length + line.length + 1 > DISCORD_MESSAGE_LIMIT) {
      if (currentChunk.length > 0) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
      }
      
      // If a single line is longer than the limit, split it by words
      if (line.length > DISCORD_MESSAGE_LIMIT) {
        const words = line.split(' ');
        let wordChunk = '';
        
        for (const word of words) {
          if (wordChunk.length + word.length + 1 > DISCORD_MESSAGE_LIMIT) {
            chunks.push(wordChunk.trim());
            wordChunk = word + ' ';
          } else {
            wordChunk += word + ' ';
          }
        }
        
        if (wordChunk.trim().length > 0) {
          currentChunk = wordChunk;
        }
      } else {
        currentChunk = line + '\n';
      }
    } else {
      currentChunk += line + '\n';
    }
  }
  
  // Add the last chunk
  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks;
}

/**
 * Initialize the processor with Discord client
 * @param {Client} client - Discord.js client instance
 */
export function initializeProcessor(client) {
  discordClient = client;
  console.log('[OptimizationProcessor] Initialized with Discord client');
}

/**
 * Process a single verified optimization
 * @param {Object} optimization - Optimization record from database
 */
async function processOptimization(optimization) {
  try {
    console.log(`[OptimizationProcessor] Processing optimization #${optimization.id}`);
    
    // Atomically update to processing (prevents race condition)
    const updateResult = await db.update(gardenOptimizations)
      .set({ 
        status: 'processing',
        updatedAt: new Date()
      })
      .where(and(
        eq(gardenOptimizations.id, optimization.id),
        eq(gardenOptimizations.status, 'payment_verified') // Only transition from payment_verified
      ))
      .returning();
    
    // Verify status transition succeeded (guards against race)
    if (!updateResult || updateResult.length === 0) {
      console.log(`[OptimizationProcessor] ⚠️ Optimization #${optimization.id} already being processed - skipping`);
      return;
    }
    
    // Get player data for Discord ID
    const [playerData] = await db
      .select()
      .from(players)
      .where(eq(players.id, optimization.playerId))
      .limit(1);
    
    if (!playerData) {
      throw new Error(`Player #${optimization.playerId} not found`);
    }
    
    // Analyze current state and optimize
    const walletAddress = optimization.fromWallet;
    console.log(`[OptimizationProcessor] Analyzing wallet ${walletAddress}...`);

    // Step 1: Ensure cache is ready before running expensive analysis
    const poolCache = await waitForCacheReady({
      onWait: (elapsedSeconds) => {
        if (elapsedSeconds % 15 === 0) {
          console.log(`[OptimizationProcessor] Waiting for pool cache readiness... (${elapsedSeconds}s)`);
        }
      }
    });

    // Step 2: Analyze current assignments (fetches heroes, pets, maps them to pools)
    const currentState = await analyzeCurrentAssignments(walletAddress, poolCache.data);
    console.log(`[OptimizationProcessor] Current state: ${currentState.totalHeroes} heroes, ${currentState.totalPets} pets`);

    // Step 3: Get pool analytics data
    const pools = getCachedPoolAnalytics();
    if (!pools || !pools.data || pools.data.length === 0) {
      throw new Error('Pool cache is empty - unable to optimize');
    }

    // Step 4: Run optimization algorithm
    const optimizedState = optimizeHeroAssignments(
      currentState.heroes,
      currentState.pets,
      pools.data,
      10 // Max 10 heroes
    );

    // Step 5: Calculate improvement metrics
    const improvement = calculateImprovement(currentState, optimizedState);
    console.log(`[OptimizationProcessor] Improvement: ${improvement.absoluteImprovement.toFixed(2)}% APR`);

    // Step 6: Generate all messages (3 messages total, possibly split into more chunks)
    const messages = generateOptimizationMessages(currentState, optimizedState, improvement);
    
    // Add Hedge's signature to the last message
    const lastMessage = messages[messages.length - 1] + 
      `\n\n---\n\n*Payment confirmed! That 25 JEWEL is staying in my ledger forever, by the way.* <:hedge_evil:1439395005499441236>`;
    messages[messages.length - 1] = lastMessage;
    
    // Send DM to user
    if (!discordClient) {
      throw new Error('Discord client not initialized');
    }
    
    const user = await discordClient.users.fetch(playerData.discordId);
    
    console.log(`[OptimizationProcessor] Sending report in ${messages.length} message(s)`);
    
    for (let i = 0; i < messages.length; i++) {
      await user.send(messages[i]);
      // Small delay between messages to avoid rate limiting
      if (i < messages.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    console.log(`[OptimizationProcessor] Sent optimization report to user ${playerData.discordUsername}`);
    
    // Update status to completed with report payload
    const reportPayload = {
      currentState: {
        totalHeroes: currentState.totalHeroes,
        totalPets: currentState.totalPets,
        activeGardeningHeroes: currentState.activeGardeningHeroes,
        totalCurrentAPR: currentState.totalCurrentAPR,
        assignments: currentState.assignments
      },
      optimizedState: {
        assignments: optimizedState.assignments,
        totalOptimizedAPR: optimizedState.totalOptimizedAPR,
        heroesUsed: optimizedState.heroesUsed,
        petsUsed: optimizedState.petsUsed
      },
      improvement
    };
    
    await db.update(gardenOptimizations)
      .set({
        status: 'completed',
        completedAt: new Date(),
        reportPayload: sql`${JSON.stringify(reportPayload)}::json`, // Explicit JSON cast
        updatedAt: new Date()
      })
      .where(eq(gardenOptimizations.id, optimization.id));
    
    // Update or create jewelBalances record to track lifetime deposits
    const paymentAmount = optimization.expectedAmountJewel || '25';
    console.log(`[OptimizationProcessor] Updating jewelBalances for player #${optimization.playerId}, adding ${paymentAmount} JEWEL`);
    
    // Check if jewelBalances record exists
    const existingBalance = await db
      .select()
      .from(jewelBalances)
      .where(eq(jewelBalances.playerId, optimization.playerId))
      .limit(1);
    
    if (existingBalance.length > 0) {
      // Update existing record - increment both balance and lifetime deposits
      await db.update(jewelBalances)
        .set({
          balanceJewel: sql`${jewelBalances.balanceJewel} + ${paymentAmount}`,
          lifetimeDepositsJewel: sql`${jewelBalances.lifetimeDepositsJewel} + ${paymentAmount}`,
          lastDepositAt: new Date(),
          updatedAt: new Date()
        })
        .where(eq(jewelBalances.playerId, optimization.playerId));
      console.log(`[OptimizationProcessor] ✅ Updated jewelBalances for player #${optimization.playerId}`);
    } else {
      // Create new record with initial balance
      await db.insert(jewelBalances).values({
        playerId: optimization.playerId,
        balanceJewel: paymentAmount,
        lifetimeDepositsJewel: paymentAmount,
        tier: 'free',
        lastDepositAt: new Date(),
        updatedAt: new Date()
      });
      console.log(`[OptimizationProcessor] ✅ Created jewelBalances record for player #${optimization.playerId}`);
    }
    
    console.log(`[OptimizationProcessor] ✅ Completed optimization #${optimization.id}`);
    
  } catch (err) {
    console.error(`[OptimizationProcessor] ❌ Error processing optimization #${optimization.id}:`, err.message);
    
    // Mark as failed with error message
    await db.update(gardenOptimizations)
      .set({
        status: 'failed',
        errorMessage: err.message,
        updatedAt: new Date()
      })
      .where(eq(gardenOptimizations.id, optimization.id));
  }
}

/**
 * Poll for verified optimizations and process them
 */
async function pollForVerifiedOptimizations() {
  try {
    // Query for all payment_verified optimizations
    const verified = await db
      .select()
      .from(gardenOptimizations)
      .where(eq(gardenOptimizations.status, 'payment_verified'));
    
    if (verified.length > 0) {
      console.log(`[OptimizationProcessor] Found ${verified.length} verified optimization(s) to process`);
      
      // Process each one sequentially
      for (const optimization of verified) {
        await processOptimization(optimization);
      }
    }
  } catch (err) {
    console.error('[OptimizationProcessor] Polling error:', err.message);
  }
}

/**
 * Start the background poller
 */
export async function startProcessor() {
  console.log('[OptimizationProcessor] Starting background processor...');
  console.log(`[OptimizationProcessor] Poll interval: ${POLL_INTERVAL_MS}ms`);
  
  // Run initial poll
  await pollForVerifiedOptimizations();
  
  // Set up recurring poll
  const poll = async () => {
    await pollForVerifiedOptimizations();
    
    // Schedule next poll
    if (pollingTimer !== null) {
      pollingTimer = setTimeout(poll, POLL_INTERVAL_MS);
    }
  };
  
  // Start polling
  pollingTimer = setTimeout(poll, POLL_INTERVAL_MS);
  
  console.log('[OptimizationProcessor] ✅ Background processor started');
}

/**
 * Stop the background poller
 */
export function stopProcessor() {
  console.log('[OptimizationProcessor] Stopping background processor...');
  
  if (pollingTimer) {
    clearTimeout(pollingTimer);
    pollingTimer = null;
  }
}
