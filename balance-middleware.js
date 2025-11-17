/**
 * Balance Check Middleware
 * 
 * Guards query execution behind balance checks:
 * 1. Calculate query cost (base + dynamic pricing)
 * 2. Check if player has sufficient balance
 * 3. Execute query if approved
 * 4. Deduct cost atomically after success
 * 5. Log cost to queryCosts table
 * 
 * Free Tier Handling:
 * - nav queries: Always free (no balance check)
 * - garden_basic: Free with 1/day quota
 * - summon: Free with 1/day quota
 * - All other queries: Paid only
 * 
 * Flow:
 * checkBalance() → executeQuery() → deductCost() → logCost()
 */

import Decimal from 'decimal.js';
import { db } from './server/db.js';
import { jewelBalances, queryCosts, players } from './shared/schema.js';
import { calculateCost, isFreeTierEligible } from './pricing-engine.js';
import { eq, and, gte, sql } from 'drizzle-orm';

/**
 * Check if player has sufficient balance for a query
 * 
 * @param {string} discordId - Player's Discord ID
 * @param {string} queryType - Query type (hero, garden_premium, etc.)
 * @param {object} options - Pricing options (priority, timestamp)
 * @returns {object} - { approved: boolean, cost, balance, reason }
 */
export async function checkBalance(discordId, queryType, options = {}) {
  try {
    // Get player record
    let player = await db
      .select()
      .from(players)
      .where(eq(players.discordId, discordId))
      .limit(1);
    
    let playerId;
    
    if (player.length === 0) {
      // Create new player record with username (required field)
      const newPlayer = await db
        .insert(players)
        .values({
          discordId,
          discordUsername: options.username || discordId // Use provided username or fallback to ID
        })
        .returning();
      
      playerId = newPlayer[0].id;
      
      // Create corresponding jewelBalances record
      await db.insert(jewelBalances).values({
        playerId,
        balanceJewel: '0',
        lifetimeDepositsJewel: '0',
        tier: 'free'
      });
    } else {
      playerId = player[0].id;
    }
    
    // Get balance record (separate table)
    const balanceRecord = await db
      .select()
      .from(jewelBalances)
      .where(eq(jewelBalances.playerId, playerId))
      .limit(1);
    
    const lifetimeDeposits = balanceRecord.length > 0 
      ? balanceRecord[0].lifetimeDepositsJewel 
      : '0';
    const tier = balanceRecord.length > 0 
      ? balanceRecord[0].tier 
      : 'free';
    
    // Calculate cost with dynamic pricing
    const playerContext = {
      lifetimeDepositsJewel: lifetimeDeposits,
      tier
    };
    
    const { baseCost, finalCost, modifiers, breakdown } = await calculateCost(
      queryType,
      playerContext,
      options
    );
    
    // Free queries (nav, free tier with quota)
    if (new Decimal(finalCost).isZero()) {
      // Check free tier quota if applicable
      if (isFreeTierEligible(queryType) && queryType !== 'nav') {
        const quotaCheck = await checkFreeTierQuota(discordId, queryType);
        if (!quotaCheck.allowed) {
          return {
            approved: false,
            cost: finalCost,
            balance: '0',
            reason: quotaCheck.reason,
            freeTierExhausted: true,
            playerId
          };
        }
      }
      
      return {
        approved: true,
        cost: '0',
        balance: 'N/A',
        reason: 'Free tier query',
        freeTier: true,
        breakdown,
        modifiers,
        playerId
      };
    }
    
    // Get current balance (already fetched above)
    const currentBalance = balanceRecord.length > 0
      ? new Decimal(balanceRecord[0].balanceJewel)
      : new Decimal('0');
    
    const costDecimal = new Decimal(finalCost);
    
    // Check if balance is sufficient
    if (currentBalance.lessThan(costDecimal)) {
      return {
        approved: false,
        cost: finalCost,
        balance: currentBalance.toString(),
        reason: `Insufficient balance. Need ${finalCost} JEWEL, have ${currentBalance.toString()} JEWEL`,
        breakdown
      };
    }
    
    // Balance is sufficient
    return {
      approved: true,
      cost: finalCost,
      balance: currentBalance.toString(),
      reason: 'Sufficient balance',
      breakdown,
      modifiers,
      playerId
    };
    
  } catch (err) {
    console.error('[Balance] Error checking balance:', err);
    return {
      approved: false,
      cost: '0',
      balance: '0',
      reason: `System error: ${err.message}`
    };
  }
}

/**
 * Check free tier quota (1 per UTC day)
 * 
 * @param {string} discordId - Player's Discord ID
 * @param {string} queryType - Query type (garden_basic, summon)
 * @returns {object} - { allowed: boolean, remaining: number, reason }
 */
async function checkFreeTierQuota(discordId, queryType) {
  try {
    // Get player record
    const player = await db
      .select()
      .from(players)
      .where(eq(players.discordId, discordId))
      .limit(1);
    
    if (player.length === 0) {
      return { allowed: true, remaining: 1, reason: 'New player' };
    }
    
    // Get start of current UTC day
    const now = new Date();
    const utcDayStart = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      0, 0, 0, 0
    ));
    
    // Count free tier queries today (use timestamp field, not createdAt)
    const todayCount = await db
      .select({ count: sql`count(*)` })
      .from(queryCosts)
      .where(and(
        eq(queryCosts.playerId, player[0].id),
        eq(queryCosts.queryType, queryType),
        eq(queryCosts.freeTierUsed, true),
        gte(queryCosts.timestamp, utcDayStart)
      ));
    
    const count = parseInt(todayCount[0]?.count || 0);
    const limit = 1; // 1 per day for free tier
    
    if (count >= limit) {
      return {
        allowed: false,
        remaining: 0,
        reason: `Free tier quota exhausted. You've used ${count}/${limit} free ${queryType} queries today (resets at 00:00 UTC)`
      };
    }
    
    return {
      allowed: true,
      remaining: limit - count,
      reason: `Free tier available (${limit - count} remaining today)`
    };
    
  } catch (err) {
    console.error('[Balance] Error checking free tier quota:', err);
    return {
      allowed: false,
      remaining: 0,
      reason: `System error: ${err.message}`
    };
  }
}

/**
 * Deduct cost from player's balance (atomic transaction)
 * 
 * @param {number} playerId - Player's database ID (not discordId)
 * @param {string} costJewel - Cost in JEWEL (string, e.g., '0.005')
 * @returns {object} - { success: boolean, newBalance, error }
 */
export async function deductCost(playerId, costJewel) {
  try {
    // Free queries = no deduction (caller should skip this function for zero cost)
    if (new Decimal(costJewel).isZero()) {
      throw new Error('deductCost() should not be called for zero-cost queries');
    }
    
    // Atomic deduction with FOR UPDATE lock
    const result = await db.transaction(async (tx) => {
      // Lock balance row by playerId
      const balance = await tx
        .select()
        .from(jewelBalances)
        .where(eq(jewelBalances.playerId, playerId))
        .for('update')
        .limit(1);
      
      if (balance.length === 0) {
        throw new Error('No balance record found');
      }
      
      const current = new Decimal(balance[0].balanceJewel);
      const cost = new Decimal(costJewel);
      const newBalance = current.minus(cost);
      
      // Prevent negative balance
      if (newBalance.lessThan(0)) {
        throw new Error('Insufficient balance during deduction');
      }
      
      // Update balance and lastQueryAt timestamp
      await tx
        .update(jewelBalances)
        .set({
          balanceJewel: newBalance.toFixed(18),
          lastQueryAt: new Date()
        })
        .where(eq(jewelBalances.playerId, playerId));
      
      return { newBalance: newBalance.toFixed(18) };
    });
    
    console.log(`[Balance] Deducted ${costJewel} JEWEL from playerId ${playerId}. New balance: ${result.newBalance}`);
    
    return {
      success: true,
      newBalance: result.newBalance,
      reason: 'Cost deducted successfully'
    };
    
  } catch (err) {
    console.error('[Balance] Error deducting cost:', err);
    return {
      success: false,
      newBalance: '0',
      error: err.message
    };
  }
}

/**
 * Log query cost to database (for analytics)
 * 
 * @param {object} params - Query cost parameters
 * @returns {boolean} - Success status
 */
export async function logQueryCost(params) {
  try {
    const {
      playerId,
      queryType,
      toolsUsed = [], // Array of tool names used (e.g., ['get_hero_info'])
      tokensUsed,
      openaiCostUsd,
      priceChargedJewel,
      jewelPriceUsd,
      freeTierUsed = false,
      discountApplied = null,
      userMessage = null
    } = params;
    
    // Calculate costs and profit
    const replitCostUsd = '0.0001'; // $0.0001 per query (hosting overhead)
    const totalCostUsd = new Decimal(openaiCostUsd).plus(replitCostUsd);
    const revenueUsd = new Decimal(priceChargedJewel).times(jewelPriceUsd);
    const profitUsd = revenueUsd.minus(totalCostUsd);
    const profitMargin = totalCostUsd.isZero()
      ? new Decimal('0')
      : profitUsd.dividedBy(totalCostUsd).times(100);
    
    // Insert query cost record
    await db.insert(queryCosts).values({
      playerId,
      queryType,
      toolsUsed, // JSON array of tools used
      timestamp: new Date(),
      tokensUsed,
      openaiCostUsd: openaiCostUsd.toString(),
      replitCostUsd: replitCostUsd.toString(),
      totalCostUsd: totalCostUsd.toFixed(6),
      priceChargedJewel: priceChargedJewel.toString(),
      jewelPriceUsd: jewelPriceUsd.toString(),
      revenueUsd: revenueUsd.toFixed(6),
      profitUsd: profitUsd.toFixed(6),
      profitMargin: profitMargin.toFixed(2),
      userMessage,
      freeTierUsed,
      discountApplied
    });
    
    console.log(`[Balance] Logged cost: ${priceChargedJewel} JEWEL (${queryType}) for playerId ${playerId}`);
    
    return true;
  } catch (err) {
    console.error('[Balance] Error logging query cost:', err);
    return false;
  }
}

/**
 * Execute a query with balance checks and cost deduction
 * Wrapper function that handles the full lifecycle
 * 
 * @param {string} discordId - Player's Discord ID
 * @param {string} queryType - Query type
 * @param {function} queryFn - Async function that executes the query
 * @param {object} options - Pricing options
 * @returns {object} - { success, data, error, cost }
 */
export async function executeWithBalanceCheck(discordId, queryType, queryFn, options = {}) {
  try {
    // 1. Check balance
    const balanceCheck = await checkBalance(discordId, queryType, options);
    
    if (!balanceCheck.approved) {
      return {
        success: false,
        error: balanceCheck.reason,
        cost: balanceCheck.cost,
        balance: balanceCheck.balance,
        freeTierExhausted: balanceCheck.freeTierExhausted || false
      };
    }
    
    // 2. Execute query
    const queryResult = await queryFn();
    
    let newBalance;
    const isFreeQuery = new Decimal(balanceCheck.cost).isZero();
    
    if (isFreeQuery) {
      // 3a. Free query - skip deduction, get current balance for display
      const currentBalance = await db
        .select()
        .from(jewelBalances)
        .where(eq(jewelBalances.playerId, balanceCheck.playerId))
        .limit(1);
      
      newBalance = currentBalance.length > 0 
        ? currentBalance[0].balanceJewel 
        : '0';
    } else {
      // 3b. Paid query - deduct cost atomically
      const deduction = await deductCost(balanceCheck.playerId, balanceCheck.cost);
      
      if (!deduction.success) {
        return {
          success: false,
          error: `Query succeeded but cost deduction failed: ${deduction.error}`,
          data: queryResult,
          cost: balanceCheck.cost
        };
      }
      
      newBalance = deduction.newBalance;
    }
    
    // 4. Log cost (best effort, don't fail query if logging fails)
    // IMPORTANT: Always log with numeric values (use '0' instead of 'N/A')
    await logQueryCost({
      playerId: balanceCheck.playerId,
      queryType,
      toolsUsed: queryResult.toolsUsed || [],
      tokensUsed: queryResult.tokensUsed || 0,
      openaiCostUsd: queryResult.openaiCostUsd || '0',
      priceChargedJewel: balanceCheck.cost, // Always numeric (0 for free)
      jewelPriceUsd: options.jewelPriceUsd || '0.5',
      freeTierUsed: balanceCheck.freeTier || false,
      discountApplied: balanceCheck.modifiers?.join(',') || null,
      userMessage: queryResult.userMessage || null
    });
    
    return {
      success: true,
      data: queryResult,
      cost: balanceCheck.cost,
      newBalance,
      breakdown: balanceCheck.breakdown
    };
    
  } catch (err) {
    console.error('[Balance] Error in executeWithBalanceCheck:', err);
    return {
      success: false,
      error: `System error: ${err.message}`,
      cost: '0'
    };
  }
}
