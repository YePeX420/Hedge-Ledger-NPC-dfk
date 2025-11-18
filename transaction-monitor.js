/**
 * DFK Chain Transaction Monitor
 * 
 * Monitors blockchain for incoming JEWEL deposits to Hedge's wallet.
 * Matches transfers to pending deposit requests and triggers balance credits.
 * 
 * Architecture:
 * - Polls DFK Chain RPC every 30 seconds for new blocks
 * - Queries Transfer events for JEWEL token
 * - Filters transfers where to = Hedge's wallet
 * - Matches transfer amounts (wei) to deposit requests (uniqueAmountJewel)
 * - Returns matched deposits for crediting (Task 7)
 * 
 * Precision Strategy:
 * - Transfer amounts are in wei (18 decimals): "10500000000000000000" = 10.5 JEWEL
 * - Convert to human-readable JEWEL using ethers.formatEther()
 * - Match against uniqueAmountJewel from deposit requests
 * - Use Decimal.js for exact comparison (no floating point errors)
 */

import { ethers } from 'ethers';
import Decimal from 'decimal.js';
import erc20ABI from './ERC20.json' with { type: 'json' };
import { db } from './server/db.js';
import { depositRequests, gardenOptimizations } from './shared/schema.js';
import { eq, and, lt } from 'drizzle-orm';

// Configuration
const DFK_CHAIN_RPC = 'https://subnets.avax.network/defi-kingdoms/dfk-chain/rpc';
const JEWEL_TOKEN_ADDRESS = '0x77f2656d04E158f915bC22f07B779D94c1DC47Ff'; // JEWEL on DFK Chain
const HEDGE_WALLET_ADDRESS = '0x498BC270C4215Ca62D9023a3D97c5CAdCD7c99e1'; // Hedge's wallet
const POLL_INTERVAL_MS = 30000; // 30 seconds
const BLOCK_BATCH_SIZE = 1000; // Process 1000 blocks per query (prevents RPC timeouts)

// Initialize provider and contract
const provider = new ethers.JsonRpcProvider(DFK_CHAIN_RPC);
const jewelContract = new ethers.Contract(JEWEL_TOKEN_ADDRESS, erc20ABI, provider);

// Track last processed block to avoid re-processing
let lastProcessedBlock = null;
let pollingTimer = null; // Store timeout ID for clean shutdown

/**
 * Convert wei amount to JEWEL string with exact precision
 * 
 * @param {bigint} weiAmount - Amount in wei (18 decimals)
 * @returns {string} - Amount in JEWEL (e.g., "10.5")
 */
function weiToJewel(weiAmount) {
  // ethers.formatEther converts wei to ether/JEWEL string
  return ethers.formatEther(weiAmount);
}

/**
 * Find pending deposit request matching the transfer amount
 * 
 * Enhanced matching strategy to handle RPC rounding:
 * 1. Try exact match on uniqueAmountJewel
 * 2. Try exact match on requestedAmountJewel
 * 3. Try tolerance match (±1 wei) on uniqueAmountJewel
 * 
 * @param {string} amountJewel - Transfer amount in JEWEL (e.g., "10.123456")
 * @param {string} fromAddress - Sender address (for verification)
 * @returns {object|null} - Matching deposit request or null
 */
async function findMatchingDeposit(amountJewel, fromAddress) {
  try {
    // Query all pending deposit requests
    const pending = await db
      .select()
      .from(depositRequests)
      .where(eq(depositRequests.status, 'pending'));
    
    if (pending.length === 0) {
      return null;
    }
    
    const transferAmount = new Decimal(amountJewel);
    const ONE_WEI = new Decimal('0.000000000000000001'); // 1 wei in JEWEL
    
    // Strategy 1: Exact match on uniqueAmountJewel
    for (const request of pending) {
      const uniqueAmount = new Decimal(request.uniqueAmountJewel);
      if (transferAmount.equals(uniqueAmount)) {
        console.log(`[Monitor] ✅ Exact match on uniqueAmount: ${amountJewel} JEWEL from ${fromAddress}`);
        console.log(`[Monitor] Request #${request.id} for player #${request.playerId}`);
        return request;
      }
    }
    
    // Strategy 2: Exact match on requestedAmountJewel (user might have sent exact requested amount)
    for (const request of pending) {
      const requestedAmount = new Decimal(request.requestedAmountJewel);
      if (transferAmount.equals(requestedAmount)) {
        console.log(`[Monitor] ✅ Exact match on requestedAmount: ${amountJewel} JEWEL from ${fromAddress}`);
        console.log(`[Monitor] Request #${request.id} for player #${request.playerId}`);
        return request;
      }
    }
    
    // Strategy 3: Tolerance match (±1 wei) on uniqueAmountJewel to handle RPC rounding
    for (const request of pending) {
      const uniqueAmount = new Decimal(request.uniqueAmountJewel);
      const diff = transferAmount.minus(uniqueAmount).abs();
      
      if (diff.lessThanOrEqualTo(ONE_WEI)) {
        console.log(`[Monitor] ✅ Tolerance match (±1 wei): ${amountJewel} JEWEL from ${fromAddress}`);
        console.log(`[Monitor] Request #${request.id} for player #${request.playerId} (diff: ${diff.toString()} JEWEL)`);
        return request;
      }
    }
    
    // No match found
    console.log(`[Monitor] ⚠️ No match for ${amountJewel} JEWEL transfer from ${fromAddress}`);
    console.log(`[Monitor] Pending requests: ${pending.length}`);
    return null;
  } catch (err) {
    console.error('[Monitor] Error finding matching deposit:', err.message);
    return null;
  }
}

/**
 * Find pending garden optimization matching transfer amount and sender wallet
 * 
 * Strategy:
 * - Query all awaiting_payment optimizations
 * - Match amount: ~25 JEWEL (with ±0.1 tolerance)
 * - Verify sender wallet matches fromWallet field
 * - Ensure not expired
 * 
 * @param {string} amountJewel - Transfer amount in JEWEL
 * @param {string} fromAddress - Sender address (must match fromWallet)
 * @returns {object|null} - Matching optimization request or null
 */
async function findMatchingGardenOptimization(amountJewel, fromAddress) {
  try {
    // Query all pending garden optimizations
    const pending = await db
      .select()
      .from(gardenOptimizations)
      .where(eq(gardenOptimizations.status, 'awaiting_payment'));
    
    if (pending.length === 0) {
      return null;
    }
    
    const transferAmount = new Decimal(amountJewel);
    const EXPECTED_AMOUNT = new Decimal('25'); // 25 JEWEL
    const TOLERANCE = new Decimal('0.1'); // Allow ±0.1 JEWEL tolerance
    
    for (const request of pending) {
      // Check if amount matches (25 JEWEL ±0.1)
      const expectedAmount = new Decimal(request.expectedAmountJewel);
      const diff = transferAmount.minus(expectedAmount).abs();
      
      if (diff.lessThanOrEqualTo(TOLERANCE)) {
        // Check if sender wallet matches
        const fromWalletLower = request.fromWallet.toLowerCase();
        const senderLower = fromAddress.toLowerCase();
        
        if (fromWalletLower === senderLower) {
          // Check if not expired
          const now = new Date();
          if (now < new Date(request.expiresAt)) {
            console.log(`[Monitor] ✅ Garden optimization payment matched: ${amountJewel} JEWEL`);
            console.log(`[Monitor] Optimization #${request.id} for player #${request.playerId}`);
            console.log(`[Monitor] Sender verified: ${fromAddress}`);
            return request;
          } else {
            console.log(`[Monitor] ⏰ Garden optimization #${request.id} expired (sent anyway)`);
          }
        } else {
          console.log(`[Monitor] ⚠️ Wallet mismatch for optimization #${request.id}`);
          console.log(`[Monitor] Expected: ${request.fromWallet}, Got: ${fromAddress}`);
        }
      }
    }
    
    return null;
  } catch (err) {
    console.error('[Monitor] Error finding garden optimization:', err.message);
    return null;
  }
}

/**
 * Scan for native JEWEL transfers in block range
 * Native transfers are direct value transfers (like ETH), not ERC20 token transfers
 * 
 * @param {number} fromBlock - Start block
 * @param {number} toBlock - End block
 * @returns {Array} - Array of native JEWEL transfers
 */
async function scanNativeTransfers(fromBlock, toBlock) {
  const nativeTransfers = [];
  
  try {
    // Scan each block for transactions to Hedge's wallet
    for (let blockNum = fromBlock; blockNum <= toBlock; blockNum++) {
      const block = await provider.getBlock(blockNum, true); // true = include transactions
      
      if (!block || !block.transactions) {
        continue;
      }
      
      // Check each transaction in the block
      for (const tx of block.transactions) {
        // Check if transaction is to Hedge's wallet and has native value
        if (tx.to && tx.to.toLowerCase() === HEDGE_WALLET_ADDRESS.toLowerCase() && tx.value > 0n) {
          // Get transaction receipt to ensure it succeeded
          const receipt = await provider.getTransactionReceipt(tx.hash);
          
          if (receipt && receipt.status === 1) {
            // Transaction succeeded
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
 * Process Transfer events from a block range
 * Now scans BOTH ERC20 token transfers AND native JEWEL transfers
 * 
 * @param {number} fromBlock - Start block (inclusive)
 * @param {number} toBlock - End block (inclusive)
 * @returns {Object} - Object with depositMatches and optimizationMatches arrays
 */
async function processBlockRange(fromBlock, toBlock) {
  try {
    console.log(`[Monitor] Scanning blocks ${fromBlock}-${toBlock} for JEWEL deposits...`);
    
    // Scan both ERC20 transfers and native transfers in parallel
    const [erc20Events, nativeTransfers] = await Promise.all([
      // Query ERC20 Transfer events where to = Hedge's wallet
      (async () => {
        try {
          const filter = jewelContract.filters.Transfer(null, HEDGE_WALLET_ADDRESS);
          return await jewelContract.queryFilter(filter, fromBlock, toBlock);
        } catch (err) {
          console.error(`[Monitor] Error querying ERC20 events:`, err.message);
          return [];
        }
      })(),
      // Scan for native JEWEL transfers
      scanNativeTransfers(fromBlock, toBlock)
    ]);
    
    console.log(`[Monitor] Found ${erc20Events.length} ERC20 transfers + ${nativeTransfers.length} native transfers`);
    
    const depositMatches = [];
    const optimizationMatches = [];
    const processedTxHashes = new Set(); // Prevent duplicate processing
    
    // Process ERC20 transfers
    for (const event of erc20Events) {
      const { from, value } = event.args;
      const amountJewel = weiToJewel(value);
      const txHash = event.transactionHash;
      const blockNumber = event.blockNumber;
      
      if (processedTxHashes.has(txHash)) {
        continue; // Skip duplicates
      }
      processedTxHashes.add(txHash);
      
      console.log(`[Monitor] ERC20 Transfer: ${amountJewel} JEWEL from ${from} (tx: ${txHash})`);
      
      // Try to match to a pending deposit request
      const matchedRequest = await findMatchingDeposit(amountJewel, from);
      
      if (matchedRequest) {
        depositMatches.push({
          depositRequest: matchedRequest,
          transaction: {
            hash: txHash,
            blockNumber,
            from,
            amountJewel,
            timestamp: (await provider.getBlock(blockNumber)).timestamp
          }
        });
        continue; // Don't try to match as optimization if already matched as deposit
      }
      
      // Try to match to a pending garden optimization
      const matchedOptimization = await findMatchingGardenOptimization(amountJewel, from);
      
      if (matchedOptimization) {
        optimizationMatches.push({
          optimization: matchedOptimization,
          transaction: {
            hash: txHash,
            blockNumber,
            from,
            amountJewel,
            timestamp: (await provider.getBlock(blockNumber)).timestamp
          }
        });
      }
    }
    
    // Process native transfers
    for (const transfer of nativeTransfers) {
      const { hash: txHash, from, amountJewel, blockNumber, timestamp } = transfer;
      
      if (processedTxHashes.has(txHash)) {
        continue; // Skip duplicates
      }
      processedTxHashes.add(txHash);
      
      // Try to match to a pending deposit request
      const matchedRequest = await findMatchingDeposit(amountJewel, from);
      
      if (matchedRequest) {
        depositMatches.push({
          depositRequest: matchedRequest,
          transaction: {
            hash: txHash,
            blockNumber,
            from,
            amountJewel,
            timestamp
          }
        });
        continue; // Don't try to match as optimization if already matched as deposit
      }
      
      // Try to match to a pending garden optimization
      const matchedOptimization = await findMatchingGardenOptimization(amountJewel, from);
      
      if (matchedOptimization) {
        optimizationMatches.push({
          optimization: matchedOptimization,
          transaction: {
            hash: txHash,
            blockNumber,
            from,
            amountJewel,
            timestamp
          }
        });
      }
    }
    
    return { depositMatches, optimizationMatches };
  } catch (err) {
    console.error(`[Monitor] Error processing blocks ${fromBlock}-${toBlock}:`, err.message);
    return { depositMatches: [], optimizationMatches: [] };
  }
}

/**
 * Start monitoring loop
 * 
 * Polls for new blocks every POLL_INTERVAL_MS and processes Transfer events.
 * Calls onDepositMatched() for deposit requests and onOptimizationMatched() for garden optimizations.
 * 
 * Startup behavior:
 * - Looks back BLOCK_BATCH_SIZE blocks to catch pending deposits
 * - Processes all missed blocks before entering polling mode
 * - Ensures pre-existing transfers are matched and credited
 * 
 * @param {Function} onDepositMatched - Callback when deposit is matched (receives match object)
 * @param {Function} onOptimizationMatched - Callback when garden optimization payment is matched
 */
export async function startMonitoring(onDepositMatched, onOptimizationMatched) {
  console.log('[Monitor] Starting DFK Chain transaction monitor...');
  console.log(`[Monitor] Watching JEWEL token: ${JEWEL_TOKEN_ADDRESS}`);
  console.log(`[Monitor] Hedge wallet: ${HEDGE_WALLET_ADDRESS}`);
  
  // Initialize last processed block with conservative lookback
  // Deposit requests expire after 24h, so look back 48h to be safe
  if (!lastProcessedBlock) {
    const currentBlock = await provider.getBlockNumber();
    const BLOCKS_PER_HOUR = 1800; // 2s blocks
    const LOOKBACK_HOURS = 48; // Cover all pending deposits (expire after 24h)
    const lookbackBlocks = BLOCKS_PER_HOUR * LOOKBACK_HOURS;
    
    lastProcessedBlock = Math.max(0, currentBlock - lookbackBlocks);
    
    console.log(`[Monitor] Starting from block ${lastProcessedBlock} (current: ${currentBlock})`);
    console.log(`[Monitor] Looking back ${LOOKBACK_HOURS} hours (${lookbackBlocks} blocks) to catch pending deposits`);
    console.log(`[Monitor] Catching up on ${currentBlock - lastProcessedBlock} blocks...`);
  }
  
  // Catch-up phase: process all missed blocks before polling
  const currentBlock = await provider.getBlockNumber();
  let catchUpBlock = lastProcessedBlock;
  
  while (catchUpBlock < currentBlock) {
    const fromBlock = catchUpBlock + 1;
    const toBlock = Math.min(currentBlock, fromBlock + BLOCK_BATCH_SIZE - 1);
    
    console.log(`[Monitor] Catch-up: processing blocks ${fromBlock}-${toBlock}`);
    const { depositMatches, optimizationMatches } = await processBlockRange(fromBlock, toBlock);
    
    // Trigger callbacks for deposit matches
    for (const match of depositMatches) {
      if (onDepositMatched) {
        await onDepositMatched(match);
      }
    }
    
    // Trigger callbacks for optimization matches
    for (const match of optimizationMatches) {
      if (onOptimizationMatched) {
        await onOptimizationMatched(match);
      }
    }
    
    catchUpBlock = toBlock;
    lastProcessedBlock = toBlock;
  }
  
  console.log('[Monitor] Catch-up complete. Entering polling mode...');
  
  // Polling loop
  const poll = async () => {
    try {
      // Guard against null lastProcessedBlock (safety check)
      if (lastProcessedBlock === null) {
        console.warn('[Monitor] lastProcessedBlock is null - monitor may have been stopped');
        return;
      }
      
      const currentBlock = await provider.getBlockNumber();
      
      // Process new blocks if any
      if (currentBlock > lastProcessedBlock) {
        const fromBlock = lastProcessedBlock + 1;
        const toBlock = Math.min(currentBlock, fromBlock + BLOCK_BATCH_SIZE - 1);
        
        const { depositMatches, optimizationMatches } = await processBlockRange(fromBlock, toBlock);
        
        // Trigger callbacks for deposit matches
        for (const match of depositMatches) {
          if (onDepositMatched) {
            await onDepositMatched(match);
          }
        }
        
        // Trigger callbacks for optimization matches
        for (const match of optimizationMatches) {
          if (onOptimizationMatched) {
            await onOptimizationMatched(match);
          }
        }
        
        lastProcessedBlock = toBlock;
      }
    } catch (err) {
      console.error('[Monitor] Polling error:', err.message);
    }
    
    // Schedule next poll (only if not stopped)
    if (lastProcessedBlock !== null) {
      pollingTimer = setTimeout(poll, POLL_INTERVAL_MS);
    }
  };
  
  // Start polling
  poll();
}

/**
 * Manual payment verification - Check recent blocks for payments
 * Called when user says "sent" or "done" after payment request
 * 
 * @param {number} playerId - Player's database ID
 * @param {string} service - Service type ('garden_optimization' or 'deposit')
 * @returns {Promise<object|null>} - Matched payment or null
 */
export async function verifyRecentPayment(playerId, service = 'garden_optimization') {
  try {
    console.log(`[Manual Verify] Checking recent payments for player ${playerId}, service: ${service}`);
    
    // Get current block
    const currentBlock = await provider.getBlockNumber();
    const lookbackBlocks = 500; // ~30-40 minutes on DFK Chain (1-2 second blocks)
    const fromBlock = currentBlock - lookbackBlocks;
    
    console.log(`[Manual Verify] Scanning blocks ${fromBlock}-${currentBlock}`);
    
    // Scan for transfers
    const filter = jewelContract.filters.Transfer(null, HEDGE_WALLET_ADDRESS);
    const events = await jewelContract.queryFilter(filter, fromBlock, currentBlock);
    
    console.log(`[Manual Verify] Found ${events.length} transfers in recent blocks`);
    
    if (events.length === 0) {
      return null;
    }
    
    // Check each transfer
    for (const event of events) {
      const { from, value } = event.args;
      const amountJewel = weiToJewel(value);
      const txHash = event.transactionHash;
      
      if (service === 'garden_optimization') {
        // Check if this matches a pending optimization for this player
        const pendingOptimizations = await db
          .select()
          .from(gardenOptimizations)
          .where(
            and(
              eq(gardenOptimizations.playerId, playerId),
              eq(gardenOptimizations.status, 'awaiting_payment')
            )
          );
        
        for (const opt of pendingOptimizations) {
          const transferAmount = new Decimal(amountJewel);
          const expectedAmount = new Decimal(opt.expectedAmountJewel);
          const TOLERANCE = new Decimal('0.1');
          const diff = transferAmount.minus(expectedAmount).abs();
          
          if (diff.lessThanOrEqualTo(TOLERANCE)) {
            // Check wallet match
            const fromWalletLower = opt.fromWallet.toLowerCase();
            const senderLower = from.toLowerCase();
            
            if (fromWalletLower === senderLower) {
              // Check not expired
              const now = new Date();
              if (now < new Date(opt.expiresAt)) {
                console.log(`[Manual Verify] ✅ Found payment! ${amountJewel} JEWEL (tx: ${txHash})`);
                return {
                  found: true,
                  optimization: opt,
                  transaction: {
                    hash: txHash,
                    amountJewel,
                    from
                  }
                };
              }
            }
          }
        }
      }
    }
    
    console.log(`[Manual Verify] No matching payment found in recent blocks`);
    return { found: false };
    
  } catch (err) {
    console.error('[Manual Verify] Error:', err.message);
    return { found: false, error: err.message };
  }
}

/**
 * Stop monitoring (for testing/shutdown)
 */
export function stopMonitoring() {
  console.log('[Monitor] Stopping transaction monitor...');
  
  // Clear polling timer to stop scheduled polls
  if (pollingTimer) {
    clearTimeout(pollingTimer);
    pollingTimer = null;
  }
  
  lastProcessedBlock = null;
}

/**
 * Get monitoring status
 */
export async function getMonitorStatus() {
  try {
    const currentBlock = await provider.getBlockNumber();
    const isMonitoring = lastProcessedBlock !== null;
    
    return {
      currentBlock,
      lastProcessedBlock: lastProcessedBlock !== null ? lastProcessedBlock : 'not started',
      blocksBehind: isMonitoring ? currentBlock - lastProcessedBlock : 0,
      monitoring: isMonitoring
    };
  } catch (err) {
    return {
      error: err.message,
      monitoring: false,
      lastProcessedBlock: 'error'
    };
  }
}
