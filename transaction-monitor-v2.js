/**
 * DFK Chain Transaction Monitor V2 - Per-Job Fast Scanner
 * 
 * Critical Fix: Uses per-job block scanning instead of global historical backfill.
 * Each payment job tracks its own startBlock and scans only relevant blocks.
 * 
 * Architecture:
 * - Fast Scanner: Scans only from job.startBlock → current for active jobs
 * - No global 48h backlog dependency - jobs can be verified immediately
 * - Manual trigger: User types "sent/paid/done" → scan last 1000 blocks
 * - Auto-expiry: Jobs expire after 2 hours if no payment detected
 */

import { ethers } from 'ethers';
import Decimal from 'decimal.js';
import erc20ABI from './ERC20.json' with { type: 'json' };
import { db } from './server/db.js';
import { gardenOptimizations } from './shared/schema.js';
import { eq } from 'drizzle-orm';
import * as paymentJobs from './payment-jobs.js';

// Configuration
const DFK_CHAIN_RPC = 'https://subnets.avax.network/defi-kingdoms/dfk-chain/rpc';
const JEWEL_TOKEN_ADDRESS = '0x77f2656d04E158f915bC22f07B779D94c1DC47Ff';
const HEDGE_WALLET_ADDRESS = '0x498BC270C4215Ca62D9023a3D97c5CAdCD7c99e1';
const POLL_INTERVAL_MS = 30000; // 30 seconds
const CHUNK_SIZE = 50; // Small chunks for native transfer support

// Initialize provider and contract
const provider = new ethers.JsonRpcProvider(DFK_CHAIN_RPC);
const jewelContract = new ethers.Contract(JEWEL_TOKEN_ADDRESS, erc20ABI, provider);

// Polling control
let pollingTimer = null;
let isRunning = false;
let manualVerifyInProgress = false; // Mutex for fast-track scans

/**
 * Convert wei amount to JEWEL string
 */
function weiToJewel(weiAmount) {
  return ethers.formatEther(weiAmount);
}

/**
 * Scan for native JEWEL transfers in block range
 */
async function scanNativeTransfers(fromBlock, toBlock) {
  const nativeTransfers = [];
  
  try {
    for (let blockNum = fromBlock; blockNum <= toBlock; blockNum++) {
      const block = await provider.getBlock(blockNum, true);
      
      if (!block || !block.transactions) {
        continue;
      }
      
      for (const tx of block.transactions) {
        if (tx.to && tx.to.toLowerCase() === HEDGE_WALLET_ADDRESS.toLowerCase() && tx.value > 0n) {
          const receipt = await provider.getTransactionReceipt(tx.hash);
          
          if (receipt && receipt.status === 1) {
            const amountJewel = weiToJewel(tx.value);
            
            nativeTransfers.push({
              hash: tx.hash,
              from: tx.from,
              value: tx.value,
              amountJewel,
              blockNumber: blockNum,
              timestamp: block.timestamp,
              type: 'native'
            });
            
            console.log(`[Monitor] Native JEWEL: ${amountJewel} JEWEL from ${tx.from} (tx: ${tx.hash})`);
          }
        }
      }
    }
  } catch (err) {
    console.error(`[Monitor] Error scanning native transfers:`, err.message);
  }
  
  return nativeTransfers;
}

/**
 * Scan block range for both ERC20 and native transfers
 */
async function scanBlockRange(fromBlock, toBlock) {
  try {
    const [erc20Events, nativeTransfers] = await Promise.all([
      (async () => {
        try {
          const filter = jewelContract.filters.Transfer(null, HEDGE_WALLET_ADDRESS);
          return await jewelContract.queryFilter(filter, fromBlock, toBlock);
        } catch (err) {
          console.error(`[Monitor] Error querying ERC20:`, err.message);
          return [];
        }
      })(),
      scanNativeTransfers(fromBlock, toBlock)
    ]);
    
    // Normalize all transfers to unified format
    const allTransfers = [];
    
    for (const event of erc20Events) {
      const { from, value } = event.args;
      allTransfers.push({
        hash: event.transactionHash,
        from,
        amountJewel: weiToJewel(value),
        blockNumber: event.blockNumber,
        type: 'ERC20'
      });
    }
    
    for (const transfer of nativeTransfers) {
      allTransfers.push({
        hash: transfer.hash,
        from: transfer.from,
        amountJewel: transfer.amountJewel,
        blockNumber: transfer.blockNumber,
        type: 'native'
      });
    }
    
    return allTransfers;
  } catch (err) {
    console.error(`[Monitor] Error scanning blocks ${fromBlock}-${toBlock}:`, err.message);
    return [];
  }
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
        paidAmountJewel: transfer.amountJewel, // Audit trail
        paidAt: new Date(), // Payment timestamp
        txHash: transfer.hash,
        lastScannedBlock: transfer.blockNumber,
        updatedAt: new Date()
      })
      .where(eq(gardenOptimizations.id, job.jobId));
    
    console.log(`[Monitor] ✅ Payment verified for job #${job.jobId}`);
    console.log(`[Monitor] Amount: ${transfer.amountJewel} JEWEL from ${transfer.from}`);
    console.log(`[Monitor] TX: ${transfer.hash}`);
    
    // Remove from active jobs
    paymentJobs.cancelJob(job.jobId);
    
    return true;
  } catch (err) {
    console.error(`[Monitor] Error marking payment verified:`, err.message);
    return false;
  }
}

/**
 * Scan specific job's block range
 */
async function scanJob(job, currentBlock) {
  const fromBlock = job.lastScannedBlock + 1;
  
  if (fromBlock > currentBlock) {
    return; // No new blocks to scan
  }
  
  console.log(`[Job #${job.jobId}] Scanning blocks ${fromBlock} → ${currentBlock} (${currentBlock - fromBlock + 1} blocks)`);
  
  // Scan in small chunks
  let chunkStart = fromBlock;
  
  while (chunkStart <= currentBlock) {
    const chunkEnd = Math.min(chunkStart + CHUNK_SIZE - 1, currentBlock);
    
    const transfers = await scanBlockRange(chunkStart, chunkEnd);
    
    if (transfers.length > 0) {
      console.log(`[Job #${job.jobId}] Found ${transfers.length} JEWEL transfers in blocks ${chunkStart}-${chunkEnd}`);
    }
    
    // Check each transfer against this job
    for (const transfer of transfers) {
      if (matchesJob(transfer, job)) {
        // Payment found!
        console.log(`[Job #${job.jobId}] ✅ PAYMENT MATCHED! ${transfer.amountJewel} JEWEL from ${transfer.from}`);
        await markPaymentVerified(job, transfer);
        return; // Job complete
      }
    }
    
    chunkStart = chunkEnd + 1;
  }
  
  console.log(`[Job #${job.jobId}] No payment found, updated scan to block ${currentBlock}`);
  
  // Update lastScannedBlock even if no match
  paymentJobs.updateLastScannedBlock(job.jobId, currentBlock);
  
  // Persist to database
  await db
    .update(gardenOptimizations)
    .set({ 
      lastScannedBlock: currentBlock,
      updatedAt: new Date()
    })
    .where(eq(gardenOptimizations.id, job.jobId));
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
 * Main polling loop - per-job fast scanner
 */
async function poll() {
  try {
    const currentBlock = await provider.getBlockNumber();
    const activeJobs = paymentJobs.getActiveJobs();
    
    if (activeJobs.length === 0) {
      // No active jobs, skip scanning
      return;
    }
    
    // Scan each active job in parallel
    await Promise.all(
      activeJobs.map(job => scanJob(job, currentBlock))
    );
    
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
  
  console.log('[Monitor] Starting per-job payment monitor...');
  console.log(`[Monitor] JEWEL token: ${JEWEL_TOKEN_ADDRESS}`);
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
 * Manual fast-track verification
 * User types "sent/paid/done" → immediately scan last 1000 blocks
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
    
    const currentBlock = await provider.getBlockNumber();
    const lookbackBlocks = 1000; // ~30 minutes
    const startBlock = Math.max(job.startBlock, currentBlock - lookbackBlocks);
    
    console.log(`[Manual Verify] Scanning blocks ${startBlock}-${currentBlock} (${currentBlock - startBlock + 1} blocks)`);
    
    // Scan in chunks
    let chunkStart = startBlock;
    
    while (chunkStart <= currentBlock) {
      const chunkEnd = Math.min(chunkStart + CHUNK_SIZE - 1, currentBlock);
      
      const transfers = await scanBlockRange(chunkStart, chunkEnd);
      
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
      
      chunkStart = chunkEnd + 1;
    }
    
    const scanDuration = ((Date.now() - scanStart) / 1000).toFixed(1);
    console.log(`[Manual Verify] No matching payment found in last 1000 blocks (scan took ${scanDuration}s)`);
    
    return { 
      found: false, 
      reason: 'No payment found in recent blocks',
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
 * Direct transaction hash verification (Option 1: Manual fast-track)
 * Instantly verify a specific transaction without scanning blocks
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
    
    // Fetch transaction receipt
    const receipt = await provider.getTransactionReceipt(txHash);
    
    if (!receipt) {
      return { success: false, error: 'Transaction not found on blockchain' };
    }
    
    // Check transaction success
    if (receipt.status !== 1) {
      return { success: false, error: 'Transaction failed on blockchain' };
    }
    
    // Fetch transaction details
    const tx = await provider.getTransaction(txHash);
    
    if (!tx) {
      return { success: false, error: 'Transaction details not found' };
    }
    
    // Verify recipient
    if (!tx.to || tx.to.toLowerCase() !== HEDGE_WALLET_ADDRESS.toLowerCase()) {
      return { 
        success: false, 
        error: `Transaction was sent to ${tx.to}, expected ${HEDGE_WALLET_ADDRESS}` 
      };
    }
    
    // Verify sender
    if (tx.from.toLowerCase() !== optimization.fromWallet.toLowerCase()) {
      return { 
        success: false, 
        error: `Transaction was sent from ${tx.from}, expected ${optimization.fromWallet}` 
      };
    }
    
    // Verify amount (native JEWEL transfer)
    const expectedAmount = new Decimal(optimization.expectedAmountJewel || '25');
    const actualAmount = new Decimal(weiToJewel(tx.value));
    
    if (actualAmount.lt(expectedAmount)) {
      return { 
        success: false, 
        error: `Payment amount ${actualAmount.toFixed(2)} JEWEL is less than expected ${expectedAmount.toFixed(2)} JEWEL` 
      };
    }
    
    // All checks passed - mark as verified
    await db
      .update(gardenOptimizations)
      .set({
        status: 'payment_verified',
        paymentVerifiedAt: new Date(),
        txHash: txHash,
        updatedAt: new Date()
      })
      .where(eq(gardenOptimizations.id, jobId));
    
    console.log(`[Monitor] ✅ Verified payment for job #${jobId}: ${actualAmount.toFixed(2)} JEWEL`);
    
    // Remove from active jobs tracking
    paymentJobs.removeJob(jobId);
    
    return {
      success: true,
      payment: {
        txHash,
        from: tx.from,
        amount: actualAmount.toFixed(2),
        blockNumber: receipt.blockNumber
      }
    };
    
  } catch (err) {
    console.error(`[Monitor] Error verifying tx ${txHash}:`, err.message);
    return { 
      success: false, 
      error: `Verification failed: ${err.message}` 
    };
  }
}

/**
 * Backward compatibility: Initialize existing jobs
 * Called once to migrate existing awaiting_payment jobs
 */
export async function initializeExistingJobs() {
  try {
    const currentBlock = await provider.getBlockNumber();
    
    const pending = await db
      .select()
      .from(gardenOptimizations)
      .where(eq(gardenOptimizations.status, 'awaiting_payment'));
    
    let initialized = 0;
    
    for (const job of pending) {
      // Set startBlock and lastScannedBlock if not set
      if (!job.startBlock) {
        await db
          .update(gardenOptimizations)
          .set({
            startBlock: currentBlock,
            lastScannedBlock: currentBlock - 1,
            updatedAt: new Date()
          })
          .where(eq(gardenOptimizations.id, job.id));
        
        initialized++;
      }
    }
    
    console.log(`[Monitor] Initialized ${initialized} existing jobs with current block ${currentBlock}`);
    return initialized;
  } catch (err) {
    console.error('[Monitor] Error initializing existing jobs:', err.message);
    return 0;
  }
}
