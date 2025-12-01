/**
 * DFK Chain Transaction Monitor V2 - RouteScan API Fast Scanner
 * 
 * Uses RouteScan blockchain explorer API for reliable, instant payment verification.
 * 
 * Architecture:
 * - RouteScan API: Single HTTP request, no block limits, instant response
 * - Multi-chain: Queries both DFK Chain (53935) and Metis Andromeda (1088)
 * - Payment matching: Filters transfers TO Hedge wallet FROM user wallet, checks amount
 * - Auto-expiry: Jobs expire after 2 hours if no payment detected
 */

import Decimal from 'decimal.js';
import { db } from './server/db.js';
import { gardenOptimizations } from './shared/schema.js';
import { eq } from 'drizzle-orm';
import * as paymentJobs from './payment-jobs.js';

// Configuration
const HEDGE_WALLET_ADDRESS = '0x498BC270C4215Ca62D9023a3D97c5CAdCD7c99e1';
const POLL_INTERVAL_MS = 30000; // 30 seconds

// RouteScan API configuration (DFK Chain and Metis Andromeda)
const CHAINS = [
  { id: 53935, name: 'DFK Chain' },
  { id: 1088, name: 'Metis Andromeda' }
];

// Polling control
let pollingTimer = null;
let isRunning = false;
let manualVerifyInProgress = false; // Mutex for fast-track scans

/**
 * Fetch transfers from RouteScan for a specific wallet across all chains
 * Returns unified format for all transfers TO Hedge wallet
 */
async function fetchTransfersFromRouteScan(fromWallet) {
  const fromWalletLower = fromWallet.toLowerCase();
  const hedgeWalletLower = HEDGE_WALLET_ADDRESS.toLowerCase();
  const allTransfers = [];

  for (const chain of CHAINS) {
    try {
      const url = `https://api.routescan.io/v2/network/mainnet/evm/${chain.id}/address/${fromWalletLower}/transactions`;
      const response = await fetch(url);

      if (!response.ok) {
        console.error(`[API] Failed to fetch ${chain.name}: HTTP ${response.status}`);
        continue;
      }

      const data = await response.json();

      if (!data.items || data.items.length === 0) {
        continue;
      }

      // Filter for incoming transfers (to = Hedge wallet, value > 0)
      const incoming = data.items
        .filter(tx =>
          tx.to?.toLowerCase() === hedgeWalletLower &&
          tx.value &&
          BigInt(tx.value) > 0n &&
          tx.status === true // Only successful transactions
        )
        .map(tx => ({
          hash: tx.id,
          from: tx.from,
          to: tx.to,
          amountJewel: (Number(BigInt(tx.value)) / 1e18).toString(),
          value: tx.value,
          blockNumber: tx.blockNumber,
          timestamp: new Date(tx.timestamp),
          type: 'native',
          chain: chain.name
        }));

      allTransfers.push(...incoming);
    } catch (err) {
      console.error(`[API] Error fetching ${chain.name}:`, err.message);
    }
  }

  // Sort by timestamp (most recent first)
  return allTransfers.sort((a, b) => b.timestamp - a.timestamp);
}

/**
 * Check if transfer matches a payment job
 */
function matchesJob(transfer, job) {
  const transferAmount = new Decimal(transfer.amountJewel);
  const expectedAmount = new Decimal(job.expectedAmount);
  const TOLERANCE = new Decimal('0.1'); // ±0.1 JEWEL

  // Check amount match
  const diff = transferAmount.minus(expectedAmount).abs();
  if (!diff.lessThanOrEqualTo(TOLERANCE)) {
    return false;
  }

  // Check wallet match
  const fromWalletLower = job.fromWallet.toLowerCase();
  const senderLower = transfer.from.toLowerCase();

  return fromWalletLower === senderLower;
}

/**
 * Mark payment as verified in database
 */
async function markPaymentVerified(job, transfer) {
  try {
    await db
      .update(gardenOptimizations)
      .set({
        status: 'payment_verified',
        paymentVerifiedAt: new Date(),
        paidAmountJewel: transfer.amountJewel,
        paidAt: transfer.timestamp,
        txHash: transfer.hash,
        updatedAt: new Date()
      })
      .where(eq(gardenOptimizations.id, job.jobId));

    console.log(`[Monitor] ✅ Payment verified for job #${job.jobId}`);
    console.log(`[Monitor] Amount: ${transfer.amountJewel} JEWEL from ${transfer.from}`);
    console.log(`[Monitor] TX: ${transfer.hash}`);
    console.log(`[Monitor] Chain: ${transfer.chain}`);

    // Remove from active jobs
    paymentJobs.cancelJob(job.jobId);

    return true;
  } catch (err) {
    console.error(`[Monitor] Error marking payment verified:`, err.message);
    return false;
  }
}

/**
 * Scan for specific job's payment using RouteScan API
 */
async function scanJob(job) {
  try {
    console.log(`[Job #${job.jobId}] Scanning for payment from ${job.fromWallet.slice(0, 6)}...`);

    // Fetch all transfers from user's wallet
    const transfers = await fetchTransfersFromRouteScan(job.fromWallet);

    if (transfers.length === 0) {
      console.log(`[Job #${job.jobId}] No transfers found from wallet`);
      return;
    }

    console.log(`[Job #${job.jobId}] Found ${transfers.length} transfers from wallet`);

    // Check each transfer against this job
    for (const transfer of transfers) {
      if (matchesJob(transfer, job)) {
        // Payment found!
        console.log(`[Job #${job.jobId}] ✅ PAYMENT MATCHED! ${transfer.amountJewel} JEWEL from ${transfer.from}`);
        await markPaymentVerified(job, transfer);
        return;
      }
    }

    console.log(`[Job #${job.jobId}] No matching payment found (checked ${transfers.length} transfers)`);
  } catch (err) {
    console.error(`[Job #${job.jobId}] Error scanning:`, err.message);
  }
}

/**
 * Mark expired jobs
 */
async function expireOldJobs() {
  const now = new Date();
  const activeJobs = paymentJobs.getActiveJobs();

  for (const job of activeJobs) {
    if (job.expiresAt < now) {
      // Mark as expired in database
      await db
        .update(gardenOptimizations)
        .set({
          status: 'expired',
          updatedAt: new Date()
        })
        .where(eq(gardenOptimizations.id, job.jobId));

      console.log(`[Monitor] ⏰ Job #${job.jobId} expired (no payment received)`);

      // Remove from active jobs
      paymentJobs.cancelJob(job.jobId);
    }
  }
}

/**
 * Main polling loop - API-based scanner
 */
async function poll() {
  try {
    const activeJobs = paymentJobs.getActiveJobs();

    if (activeJobs.length === 0) {
      // No active jobs, skip scanning
      return;
    }

    console.log(`[Monitor] Polling ${activeJobs.length} active job(s)...`);

    // Scan each active job in parallel
    await Promise.all(activeJobs.map(job => scanJob(job)));

    // Expire old jobs
    await expireOldJobs();
  } catch (err) {
    console.error('[Monitor] Polling error:', err.message);
  } finally {
    // Schedule next poll
    if (isRunning) {
      pollingTimer = setTimeout(poll, POLL_INTERVAL_MS);
    }
  }
}

/**
 * Start monitoring
 */
export async function startMonitoring() {
  if (isRunning) {
    console.log('[Monitor] Already running');
    return;
  }

  console.log('[Monitor] Starting RouteScan-based payment monitor...');
  console.log(`[Monitor] Hedge wallet: ${HEDGE_WALLET_ADDRESS}`);

  // Load active jobs from database
  await paymentJobs.loadActiveJobs();

  const jobCount = paymentJobs.getActiveJobCount();
  console.log(`[Monitor] Monitoring ${jobCount} active payment jobs`);

  isRunning = true;

  // Start polling
  poll();
}

/**
 * Stop monitoring
 */
export function stopMonitoring() {
  console.log('[Monitor] Stopping payment monitor...');
  isRunning = false;

  if (pollingTimer) {
    clearTimeout(pollingTimer);
    pollingTimer = null;
  }
}

/**
 * Manual fast-track verification using RouteScan API
 * User types "sent/paid/done" → immediately check for payment
 */
export async function verifyRecentPayment(jobId) {
  // Mutex: Prevent concurrent fast-track scans
  if (manualVerifyInProgress) {
    console.log(`[Manual Verify] Scan already in progress, skipping duplicate request`);
    return {
      found: false,
      reason: 'Verification in progress',
      message: 'Already checking for your payment. Please wait...'
    };
  }

  manualVerifyInProgress = true;
  const scanStart = Date.now();

  try {
    const job = paymentJobs.getJob(jobId);

    if (!job) {
      console.log(`[Manual Verify] Job #${jobId} not found in active jobs`);
      return { found: false, reason: 'Job not active' };
    }

    console.log(`[Manual Verify] Fast-track scan for job #${jobId}`);

    // Fetch all transfers from user's wallet
    const transfers = await fetchTransfersFromRouteScan(job.fromWallet);

    if (transfers.length === 0) {
      const scanDuration = ((Date.now() - scanStart) / 1000).toFixed(1);
      console.log(`[Manual Verify] No transfers found (${scanDuration}s)`);

      return {
        found: false,
        reason: 'No transfers found',
        message: 'No transactions found from your wallet yet. Please ensure you sent 25 JEWEL to the correct address.'
      };
    }

    console.log(`[Manual Verify] Found ${transfers.length} transfers from wallet`);

    // Check each transfer against this job
    for (const transfer of transfers) {
      if (matchesJob(transfer, job)) {
        // Payment found!
        const scanDuration = ((Date.now() - scanStart) / 1000).toFixed(1);
        console.log(`[Manual Verify] ✅ Payment found in ${scanDuration}s`);

        await markPaymentVerified(job, transfer);
        return {
          found: true,
          transfer,
          message: `Payment verified! ${transfer.amountJewel} JEWEL received.`
        };
      }
    }

    const scanDuration = ((Date.now() - scanStart) / 1000).toFixed(1);
    console.log(
      `[Manual Verify] No matching payment found among ${transfers.length} transfers (scan took ${scanDuration}s)`
    );

    return {
      found: false,
      reason: 'No matching payment found',
      message: 'No payment detected yet. Please ensure you sent exactly 25 JEWEL to the correct address.'
    };
  } catch (err) {
    const scanDuration = ((Date.now() - scanStart) / 1000).toFixed(1);
    console.error(`[Manual Verify] Error after ${scanDuration}s:`, err.message);

    return {
      found: false,
      reason: 'Error during verification',
      error: err.message
    };
  } finally {
    manualVerifyInProgress = false;
  }
}

/**
 * Direct verification via RouteScan API
 * Verify a specific transaction hash instantly
 *
 * @param {string} txHash - Transaction hash from user
 * @param {number} jobId - Garden optimization job ID
 * @returns {Promise<{success: boolean, error?: string, payment?: object}>}
 */
export async function verifyTransactionHash(txHash, jobId) {
  try {
    console.log(`[Monitor] Verifying tx ${txHash} for job #${jobId}`);

    // Fetch job details
    const job = await db
      .select()
      .from(gardenOptimizations)
      .where(eq(gardenOptimizations.id, jobId))
      .limit(1);

    if (job.length === 0) {
      return { success: false, error: 'Job not found' };
    }

    const optimization = job[0];

    // Check if job is in correct status
    if (optimization.status !== 'awaiting_payment') {
      return {
        success: false,
        error: `Job is already ${optimization.status}`
      };
    }

    // Check if job is expired
    if (new Date() > new Date(optimization.expiresAt)) {
      return { success: false, error: 'Job has expired' };
    }

    // Fetch transfers from user wallet via RouteScan
    const transfers = await fetchTransfersFromRouteScan(optimization.fromWallet);

    // Find matching transaction
    const matchingTx = transfers.find(
      tx =>
        tx.hash.toLowerCase() === txHash.toLowerCase() &&
        tx.to.toLowerCase() === HEDGE_WALLET_ADDRESS.toLowerCase()
    );

    if (!matchingTx) {
      return {
        success: false,
        error: 'Transaction not found in wallet history or not sent to Hedge wallet'
      };
    }

    // Check amount
    const expectedAmount = new Decimal(optimization.expectedAmountJewel || '25');
    const actualAmount = new Decimal(matchingTx.amountJewel);

    if (actualAmount.lt(expectedAmount)) {
      return {
        success: false,
        error: `Payment amount ${actualAmount.toFixed(2)} JEWEL is less than expected ${expectedAmount.toFixed(
          2
        )} JEWEL`
      };
    }

    // All checks passed - mark as verified
    await db
      .update(gardenOptimizations)
      .set({
        status: 'payment_verified',
        paymentVerifiedAt: new Date(),
        paidAmountJewel: matchingTx.amountJewel,
        paidAt: matchingTx.timestamp,
        txHash: txHash,
        updatedAt: new Date()
      })
      .where(eq(gardenOptimizations.id, jobId));

    console.log(`[Monitor] ✅ Verified payment for job #${jobId}: ${actualAmount.toFixed(2)} JEWEL`);

    // Remove from active jobs tracking
    paymentJobs.cancelJob(jobId);

    return {
      success: true,
      payment: {
        txHash,
        from: matchingTx.from,
        amount: matchingTx.amountJewel,
        timestamp: matchingTx.timestamp,
        chain: matchingTx.chain
      }
    };
  } catch (err) {
    console.error(`[Monitor] Error verifying transaction:`, err.message);
    return {
      success: false,
      error: `Verification error: ${err.message}`
    };
  }
}

/**
 * Initialize existing jobs from database
 */
export async function initializeExistingJobs() {
  try {
    const pendingOptimizations = await db
      .select()
      .from(gardenOptimizations)
      .where(eq(gardenOptimizations.status, 'awaiting_payment'));

    console.log(`[Monitor] Loading ${pendingOptimizations.length} existing payment jobs from database...`);

    for (const opt of pendingOptimizations) {
      paymentJobs.registerJob({
        id: opt.id,
        playerId: opt.playerId,
        fromWallet: opt.fromWallet,
        expectedAmountJewel: opt.expectedAmountJewel,
        requestedAt: opt.requestedAt,
        expiresAt: opt.expiresAt,
        startBlock: opt.startBlock || 0,
        lastScannedBlock: opt.lastScannedBlock || 0
      });
    }
  } catch (err) {
    console.error('[Monitor] Error initializing existing jobs:', err.message);
  }
}
