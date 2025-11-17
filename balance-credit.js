/**
 * Balance Credit System
 * 
 * Credits JEWEL balances when deposits are detected on-chain.
 * Updates lifetime deposits and player tier classification.
 * 
 * Architecture:
 * - Called by transaction monitor callback when deposit matches
 * - Atomic update: balance + lifetime deposits + tier + deposit status
 * - Tier thresholds: free (<100), bronze (100-499), silver (500-1999), gold (2000-9999), whale (≥10000)
 * 
 * Precision:
 * - Uses Decimal.js for all JEWEL arithmetic
 * - Stores exact amounts in NUMERIC(30,18) columns
 * - Credits based on requestedAmountJewel (not uniqueAmountJewel)
 */

import Decimal from 'decimal.js';
import { db } from './server/db.js';
import { jewelBalances, depositRequests } from './shared/schema.ts';
import { eq, and, sql } from 'drizzle-orm';

// Tier thresholds (lifetime deposits)
const TIER_THRESHOLDS = {
  bronze: new Decimal(100),
  silver: new Decimal(500),
  gold: new Decimal(2000),
  whale: new Decimal(10000)
};

/**
 * Calculate player tier based on lifetime deposits
 * 
 * @param {string} lifetimeDepositsJewel - Lifetime deposits (JEWEL string)
 * @returns {string} - Tier: 'free', 'bronze', 'silver', 'gold', 'whale'
 */
function calculateTier(lifetimeDepositsJewel) {
  const lifetime = new Decimal(lifetimeDepositsJewel);
  
  if (lifetime.greaterThanOrEqualTo(TIER_THRESHOLDS.whale)) {
    return 'whale';
  } else if (lifetime.greaterThanOrEqualTo(TIER_THRESHOLDS.gold)) {
    return 'gold';
  } else if (lifetime.greaterThanOrEqualTo(TIER_THRESHOLDS.silver)) {
    return 'silver';
  } else if (lifetime.greaterThanOrEqualTo(TIER_THRESHOLDS.bronze)) {
    return 'bronze';
  } else {
    return 'free';
  }
}

/**
 * Credit JEWEL balance for confirmed deposit
 * 
 * @param {object} match - Matched deposit from transaction monitor
 * @param {object} match.depositRequest - Deposit request record
 * @param {object} match.transaction - Transaction details (hash, blockNumber, from, amountJewel, timestamp)
 * @returns {object} - Updated balance record
 */
export async function creditBalance(match) {
  const { depositRequest, transaction } = match;
  
  console.log(`[Credit] Processing deposit for player #${depositRequest.playerId}`);
  console.log(`[Credit] Amount: ${depositRequest.requestedAmountJewel} JEWEL`);
  console.log(`[Credit] Transaction: ${transaction.hash}`);
  
  try {
    // Use database transaction for atomic balance credit + deposit completion
    const result = await db.transaction(async (tx) => {
      // 1. Lock deposit request row and verify it's still pending (idempotency guard)
      const lockedDeposit = await tx
        .select()
        .from(depositRequests)
        .where(
          and(
            eq(depositRequests.id, depositRequest.id),
            eq(depositRequests.status, 'pending')
          )
        )
        .limit(1)
        .for('update'); // FOR UPDATE lock
      
      if (lockedDeposit.length === 0) {
        // Deposit already processed or expired - safe no-op
        console.log(`[Credit] Deposit #${depositRequest.id} already processed - skipping`);
        return { alreadyProcessed: true };
      }
      
      const depositAmount = new Decimal(depositRequest.requestedAmountJewel);
      let balanceRecord;
      
      // 2. Get current balance or create new record
      const existingBalance = await tx
        .select()
        .from(jewelBalances)
        .where(eq(jewelBalances.playerId, depositRequest.playerId))
        .limit(1);
      
      if (existingBalance.length === 0) {
        // Create new balance record
        const newLifetime = depositAmount.toString();
        const tier = calculateTier(newLifetime);
        
        console.log(`[Credit] Creating new balance record (tier: ${tier})`);
        
        const [created] = await tx
          .insert(jewelBalances)
          .values({
            playerId: depositRequest.playerId,
            balanceJewel: depositAmount.toString(),
            lifetimeDepositsJewel: depositAmount.toString(),
            tier,
            createdAt: sql`CURRENT_TIMESTAMP`,
            updatedAt: sql`CURRENT_TIMESTAMP`
          })
          .returning();
        
        balanceRecord = created;
      } else {
        // Update existing balance
        const current = existingBalance[0];
        const currentBalance = new Decimal(current.balanceJewel);
        const currentLifetime = new Decimal(current.lifetimeDepositsJewel);
        
        const newBalance = currentBalance.plus(depositAmount);
        const newLifetime = currentLifetime.plus(depositAmount);
        const tier = calculateTier(newLifetime.toString());
        
        console.log(`[Credit] Updating balance: ${current.balanceJewel} → ${newBalance.toString()} JEWEL`);
        console.log(`[Credit] Lifetime deposits: ${current.lifetimeDepositsJewel} → ${newLifetime.toString()} JEWEL`);
        console.log(`[Credit] Tier: ${current.tier} → ${tier}`);
        
        const [updated] = await tx
          .update(jewelBalances)
          .set({
            balanceJewel: newBalance.toString(),
            lifetimeDepositsJewel: newLifetime.toString(),
            tier,
            updatedAt: sql`CURRENT_TIMESTAMP`
          })
          .where(eq(jewelBalances.playerId, depositRequest.playerId))
          .returning();
        
        balanceRecord = updated;
      }
      
      // 3. Mark deposit request as completed (with status='pending' guard)
      const completedRows = await tx
        .update(depositRequests)
        .set({
          status: 'completed',
          completedAt: sql`CURRENT_TIMESTAMP`,
          transactionHash: transaction.hash,
          actualAmountReceived: transaction.amountJewel,
          senderWallet: transaction.from
        })
        .where(
          and(
            eq(depositRequests.id, depositRequest.id),
            eq(depositRequests.status, 'pending') // Guard against double-processing
          )
        );
      
      // Verify deposit was actually marked completed (paranoid check)
      if (completedRows.length === 0) {
        throw new Error(`Failed to mark deposit #${depositRequest.id} as completed - concurrent update detected`);
      }
      
      return { balanceRecord };
    });
    
    // Check if deposit was already processed
    if (result.alreadyProcessed) {
      return {
        success: true,
        alreadyProcessed: true,
        playerId: depositRequest.playerId,
        transaction: {
          hash: transaction.hash,
          blockNumber: transaction.blockNumber,
          amount: depositRequest.requestedAmountJewel
        }
      };
    }
    
    console.log(`[Credit] Deposit completed successfully!`);
    console.log(`[Credit] New balance: ${result.balanceRecord.balanceJewel} JEWEL (tier: ${result.balanceRecord.tier})`);
    
    return {
      success: true,
      playerId: depositRequest.playerId,
      balanceRecord: result.balanceRecord,
      transaction: {
        hash: transaction.hash,
        blockNumber: transaction.blockNumber,
        amount: depositRequest.requestedAmountJewel
      }
    };
  } catch (err) {
    console.error(`[Credit] Error crediting balance:`, err.message);
    throw new Error(`Failed to credit balance: ${err.message}`);
  }
}

/**
 * Get player balance
 * 
 * @param {number} playerId - Player's database ID
 * @returns {object} - Balance record or null
 */
export async function getBalance(playerId) {
  try {
    const balance = await db
      .select()
      .from(jewelBalances)
      .where(eq(jewelBalances.playerId, playerId))
      .limit(1);
    
    return balance.length > 0 ? balance[0] : null;
  } catch (err) {
    console.error(`[Credit] Error fetching balance for player #${playerId}:`, err.message);
    return null;
  }
}

/**
 * Check if player has sufficient balance
 * 
 * @param {number} playerId - Player's database ID
 * @param {string} requiredAmountJewel - Required amount in JEWEL (string)
 * @returns {boolean} - True if sufficient balance
 */
export async function hasSufficientBalance(playerId, requiredAmountJewel) {
  const balance = await getBalance(playerId);
  if (!balance) return false;
  
  const current = new Decimal(balance.balanceJewel);
  const required = new Decimal(requiredAmountJewel);
  
  return current.greaterThanOrEqualTo(required);
}

/**
 * Deduct JEWEL from balance (for query costs)
 * 
 * @param {number} playerId - Player's database ID
 * @param {string} amountJewel - Amount to deduct (JEWEL string)
 * @param {string} reason - Reason for deduction (e.g., 'hero_query', 'garden_apr')
 * @returns {object} - Updated balance record
 */
export async function deductBalance(playerId, amountJewel, reason = 'query') {
  try {
    const balance = await getBalance(playerId);
    if (!balance) {
      throw new Error(`No balance record found for player #${playerId}`);
    }
    
    const current = new Decimal(balance.balanceJewel);
    const deduction = new Decimal(amountJewel);
    
    if (current.lessThan(deduction)) {
      throw new Error(`Insufficient balance: ${current.toString()} < ${deduction.toString()} JEWEL`);
    }
    
    const newBalance = current.minus(deduction);
    
    console.log(`[Credit] Deducting ${amountJewel} JEWEL from player #${playerId} (${reason})`);
    console.log(`[Credit] Balance: ${current.toString()} → ${newBalance.toString()} JEWEL`);
    
    const [updated] = await db
      .update(jewelBalances)
      .set({
        balanceJewel: newBalance.toString(),
        updatedAt: sql`CURRENT_TIMESTAMP`
      })
      .where(eq(jewelBalances.playerId, playerId))
      .returning();
    
    return {
      success: true,
      playerId,
      balanceRecord: updated,
      deduction: {
        amount: amountJewel,
        reason
      }
    };
  } catch (err) {
    console.error(`[Credit] Error deducting balance:`, err.message);
    throw err;
  }
}
