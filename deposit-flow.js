/**
 * JEWEL Deposit Flow - Unique Amount Generation
 * 
 * Generates unique decimal JEWEL amounts for deposit tracking.
 * Users send exact amount to Hedge's wallet for automatic credit.
 * 
 * PRODUCTION-READY PRECISION:
 * ✅ String-only contract enforced - rejects numeric inputs to prevent IEEE-754 precision loss
 * ✅ Validates decimal format (e.g., "10", "10.5", "10.123456")
 * ✅ Validates ≥1 JEWEL minimum
 * ✅ Validates ≤18 decimal places (ERC-20 standard)
 * ✅ All arithmetic uses Decimal.js (no .toNumber() anywhere)
 * ✅ Stores exact requestedAmount and uniqueAmount
 * 
 * REMAINING MVP LIMITATIONS (future enhancements):
 * - 6-decimal uniqueness may have collisions under high volume (consider 8-12 decimals)
 * - 10-retry collision limit is arbitrary (should loop until success with timeout)
 * 
 * Production-Ready Architecture (per architect review):
 * - Accept baseAmountJewel as validated decimal string (≤18 decimals, ≥1 JEWEL)
 * - Use 8-12 decimal precision for uniqueness with crypto-secure randomness
 * - Store both decimal and wei representations for reconciliation
 * - Transaction-based insertion with collision metrics and observability hooks
 * - Unlimited retries with timeout instead of hard limit
 */

import { Decimal } from 'decimal.js';
import crypto from 'crypto';
import { db } from './server/db.js';
import { depositRequests } from './shared/schema.ts';
import { eq, and, lt } from 'drizzle-orm';

// Hedge's receiving wallet
export const HEDGE_WALLET = '0x498BC270C4215Ca62D9023a3D97c5CAdCD7c99e1';

// Deposit config
export const DEPOSIT_EXPIRY_HOURS = 24;
export const MIN_DEPOSIT_JEWEL = 1; // Minimum 1 JEWEL deposit
export const DECIMAL_PRECISION = 6; // 6 decimal places for uniqueness

/**
 * Generate a unique decimal amount for deposit matching
 * 
 * Adds uniqueness while staying within 18-decimal DB limit (NUMERIC(30,18)).
 * Strategy: Append random suffix up to 18 total decimals.
 * 
 * Examples:
 * - base="10" (0 decimals) → unique="10.123456" (6 decimals)
 * - base="10.123456" (6 decimals) → unique="10.123456789012" (12 decimals)
 * - base="10.123456789012" (12 decimals) → unique="10.123456789012123456" (18 decimals)
 * - base="10.123456789012345678" (18 decimals) → uniqueness by modifying last 6 digits
 * 
 * @param {Decimal|string} baseAmount - Base amount in JEWEL
 * @returns {string} - Unique amount (≤18 decimals to fit NUMERIC(30,18))
 */
export function generateUniqueAmount(baseAmount) {
  // Convert to Decimal if not already
  const base = baseAmount instanceof Decimal ? baseAmount : new Decimal(baseAmount);
  
  if (base.lessThan(MIN_DEPOSIT_JEWEL)) {
    throw new Error(`Minimum deposit is ${MIN_DEPOSIT_JEWEL} JEWEL`);
  }

  // Determine how many decimals the base has
  const baseDecimals = base.decimalPlaces() || 0;
  const MAX_DB_DECIMALS = 18; // NUMERIC(30,18) schema constraint
  
  // Generate random 6-digit suffix
  const randomSuffix = crypto.randomInt(0, 999999);
  
  let uniqueAmount;
  
  if (baseDecimals + DECIMAL_PRECISION <= MAX_DB_DECIMALS) {
    // Case 1: Base + 6 random decimals fits within 18 decimals
    // Append suffix at higher precision without exceeding 18 total
    const suffixDivisor = new Decimal(10).pow(baseDecimals + DECIMAL_PRECISION);
    const suffixFraction = new Decimal(randomSuffix).dividedBy(suffixDivisor);
    uniqueAmount = base.plus(suffixFraction);
    const targetDecimals = baseDecimals + DECIMAL_PRECISION;
    return uniqueAmount.toFixed(targetDecimals);
  } else {
    // Case 2: Base already has >12 decimals - modify last digits for uniqueness
    // Replace last 6 decimal digits with random value
    // Example: "10.123456789012345678" → "10.123456789012123456"
    const baseStr = base.toFixed(MAX_DB_DECIMALS); // Ensure exactly 18 decimals
    const baseWithoutLast6 = baseStr.slice(0, -DECIMAL_PRECISION);
    const randomLast6 = randomSuffix.toString().padStart(DECIMAL_PRECISION, '0');
    return baseWithoutLast6 + randomLast6;
  }
}

/**
 * Create a deposit request
 * 
 * @param {number} playerId - Player's database ID
 * @param {string} baseAmountJewel - Requested deposit amount (MUST BE STRING for precision)
 * @returns {object} - Deposit request details
 * @throws {Error} If baseAmountJewel is not a string or invalid
 */
export async function createDepositRequest(playerId, baseAmountJewel) {
  // CRITICAL: Enforce string-only contract to prevent JSON number precision loss
  if (typeof baseAmountJewel !== 'string') {
    throw new Error(
      `baseAmountJewel must be a string to preserve precision. ` +
      `Received ${typeof baseAmountJewel}. ` +
      `Convert to string at caller: JSON.stringify() or String().`
    );
  }

  // Validate string format (must be valid decimal)
  if (!/^[0-9]+(\.[0-9]+)?$/.test(baseAmountJewel)) {
    throw new Error(
      `Invalid baseAmountJewel format: "${baseAmountJewel}". ` +
      `Must be a decimal string (e.g., "10", "10.5", "10.123456").`
    );
  }
  
  // Parse to Decimal for validation
  const baseAmount = new Decimal(baseAmountJewel);
  
  // Validate minimum deposit
  if (baseAmount.lessThan(MIN_DEPOSIT_JEWEL)) {
    throw new Error(`Minimum deposit is ${MIN_DEPOSIT_JEWEL} JEWEL (got ${baseAmountJewel})`);
  }
  
  // Validate precision (max 18 decimals for ERC-20 tokens)
  const decimalPlaces = baseAmount.decimalPlaces();
  if (decimalPlaces && decimalPlaces > 18) {
    throw new Error(
      `Maximum precision is 18 decimal places (ERC-20 standard). ` +
      `Got ${decimalPlaces} decimals in "${baseAmountJewel}".`
    );
  }
  // Clean up expired requests first
  await cancelExpiredRequests();

  // Check for existing pending request (FIX: use and() for multiple conditions)
  const existing = await db.select()
    .from(depositRequests)
    .where(and(
      eq(depositRequests.playerId, playerId),
      eq(depositRequests.status, 'pending')
    ));

  if (existing.length > 0) {
    // Return existing pending request
    const pending = existing[0];
    const expiresIn = Math.floor((new Date(pending.expiresAt) - new Date()) / 1000 / 60); // minutes
    
    // Clamp to zero to prevent negative expiry (safety check)
    const clampedExpiry = Math.max(0, expiresIn);
    
    return {
      requestedAmount: pending.requestedAmountJewel, // FIX: Include base amount for reconciliation
      uniqueAmount: pending.uniqueAmountJewel,
      hedgeWallet: pending.hedgeWallet,
      expiresAt: pending.expiresAt,
      expiresInMinutes: clampedExpiry,
      requestId: pending.id,
      isExisting: true
    };
  }

  // Generate unique amount (retry on collision)
  let uniqueAmount;
  let attempts = 0;
  const maxAttempts = 10;

  while (attempts < maxAttempts) {
    // FIX: Pass Decimal directly to preserve precision (no .toNumber())
    uniqueAmount = generateUniqueAmount(baseAmount);
    
    // Check if amount already exists (FIX: removed duplicate where)
    const collision = await db.select()
      .from(depositRequests)
      .where(eq(depositRequests.uniqueAmountJewel, uniqueAmount));

    if (collision.length === 0) {
      break; // Unique amount found
    }

    attempts++;
  }

  if (attempts >= maxAttempts) {
    throw new Error('Failed to generate unique deposit amount. Please try again.');
  }

  // Create expiry time (24h from now)
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + DEPOSIT_EXPIRY_HOURS);

  // Store requested amount exactly as provided (FIX: no rounding)
  const requestedAmountPrecise = baseAmount.toString();

  // Insert deposit request
  const [request] = await db.insert(depositRequests).values({
    playerId,
    requestedAmountJewel: requestedAmountPrecise, // Store exact amount for reconciliation
    uniqueAmountJewel: uniqueAmount,
    hedgeWallet: HEDGE_WALLET,
    status: 'pending',
    expiresAt
  }).returning();

  return {
    requestedAmount: request.requestedAmountJewel, // FIX: Include base amount in API response
    uniqueAmount: request.uniqueAmountJewel,
    hedgeWallet: request.hedgeWallet,
    expiresAt: request.expiresAt,
    expiresInMinutes: DEPOSIT_EXPIRY_HOURS * 60,
    requestId: request.id,
    isExisting: false
  };
}

/**
 * Format deposit instructions for Discord
 * 
 * @param {object} depositRequest - Deposit request details
 * @returns {string} - Formatted Discord message
 */
export function formatDepositInstructions(depositRequest) {
  const { uniqueAmount, hedgeWallet, expiresInMinutes, isExisting } = depositRequest;

  const hours = Math.floor(expiresInMinutes / 60);
  const minutes = expiresInMinutes % 60;
  const expiryText = hours > 0 
    ? `${hours}h ${minutes}m` 
    : `${minutes} minutes`;

  const prefix = isExisting 
    ? "You already have a pending deposit request."
    : "Got it! Here's your unique deposit amount.";

  return `${prefix}

**💎 Deposit Instructions:**

1. **Send EXACTLY this amount:** \`${uniqueAmount}\` JEWEL
2. **To this wallet:** \`${hedgeWallet}\`
3. **Network:** DFK Chain (Crystalvale)

**⏰ Important:**
- This unique amount expires in **${expiryText}**
- Send the EXACT amount (including decimals)
- Your balance will be credited automatically within ~5 minutes
- Incorrect amounts cannot be processed

**💡 Tip:** Copy the exact amount to avoid errors. The decimal places help me match your payment automatically.

Once you've sent the JEWEL, I'll detect it and credit your account. You'll receive a confirmation message when the deposit is processed.`;
}

/**
 * Cancel expired deposit requests
 * 
 * @returns {object} - { count: number, cancelledIds: array } - Cancellation results
 */
/**
 * Request a deposit (wrapper for createDepositRequest with Discord context)
 * 
 * @param {string} discordId - Discord user ID
 * @param {string} username - Discord username
 * @param {string} baseAmountJewel - Base amount (optional, defaults to 10 JEWEL)
 * @returns {object} - {discordId, amountJewel, depositAddress, expiresAt}
 */
export async function requestDeposit(discordId, username, baseAmountJewel = '10') {
  // This is a simplified wrapper - in production, you'd look up/create player ID
  // For now, we'll use a temporary approach that doesn't require player lookup
  const { Decimal } = await import('decimal.js');
  const base = new Decimal(baseAmountJewel);
  
  // Generate unique amount
  const uniqueAmount = generateUniqueAmount(base);
  
  // Return deposit instructions without storing in DB (for MVP)
  // TODO: Implement full player lookup + DB storage in next iteration
  return {
    discordId,
    username,
    amountJewel: uniqueAmount,
    depositAddress: HEDGE_WALLET,
    expiresAt: new Date(Date.now() + DEPOSIT_EXPIRY_HOURS * 60 * 60 * 1000)
  };
}

export async function cancelExpiredRequests() {
  const now = new Date();

  // FIX: Return cancelled IDs for monitoring/logging
  const cancelled = await db.update(depositRequests)
    .set({ status: 'expired' })
    .where(
      and(
        eq(depositRequests.status, 'pending'),
        lt(depositRequests.expiresAt, now)
      )
    )
    .returning({ id: depositRequests.id, playerId: depositRequests.playerId });

  return {
    count: cancelled.length,
    cancelledIds: cancelled.map(r => r.id),
    cancelledPlayers: cancelled.map(r => r.playerId)
  };
}
