import { ethers } from 'ethers';
import { db } from '../server/db.js';
import { bridgeEvents, bridgeIndexerProgress } from '../shared/schema.js';
import { 
  DFK_CHAIN_ID, 
  BRIDGE_CONTRACTS, 
  TOKEN_ADDRESSES, 
  TOKEN_DECIMALS, 
  TOKEN_ADDRESS_TO_SYMBOL,
  KNOWN_BRIDGE_ADDRESSES,
  ERC20_TRANSFER_TOPIC 
} from './contracts.js';
import { hexToDecimalString, formatTokenAmount } from './bigint-utils.js';
import { eq, desc, and, sql, isNull } from 'drizzle-orm';

// DFK Chain genesis is block 0, but Synapse bridge activity started later
// We'll discover the actual first block with bridge events
const DFK_CHAIN_GENESIS = 0;
const MAIN_INDEXER_NAME = 'synapse_main';

const RPC_URL = BRIDGE_CONTRACTS.dfkChain.rpcUrl;
const SYNAPSE_BRIDGE = BRIDGE_CONTRACTS.dfkChain.synapseBridge.toLowerCase();
const BLOCKS_PER_QUERY = 2000;

const SYNAPSE_EVENTS = {
  TokenDeposit: ethers.id('TokenDeposit(address,uint256,address,uint256)'),
  TokenDepositAndSwap: ethers.id('TokenDepositAndSwap(address,uint256,address,uint256,uint8,uint8,uint256,uint256)'),
  TokenRedeem: ethers.id('TokenRedeem(address,uint256,address,uint256)'),
  TokenRedeemAndSwap: ethers.id('TokenRedeemAndSwap(address,uint256,address,uint256,uint8,uint8,uint256,uint256)'),
  TokenMint: ethers.id('TokenMint(address,address,uint256,uint256,bytes32)'),
  TokenMintAndSwap: ethers.id('TokenMintAndSwap(address,address,uint256,uint256,uint8,uint8,uint256,uint256,bool,bytes32)'),
  TokenWithdraw: ethers.id('TokenWithdraw(address,address,uint256,uint256,bytes32)'),
  TokenWithdrawAndRemove: ethers.id('TokenWithdrawAndRemove(address,address,uint256,uint256,uint8,uint256,uint256,bool,bytes32)')
};

const TOKEN_CONFIG = Object.entries(TOKEN_ADDRESSES.dfkChain).map(([symbol, address]) => ({
  symbol,
  address: address.toLowerCase(),
  decimals: TOKEN_DECIMALS[symbol] || 18
}));

function getTokenSymbol(address) {
  const normalized = address?.toLowerCase();
  return TOKEN_ADDRESS_TO_SYMBOL[normalized] || 'UNKNOWN';
}

function getTokenDecimals(symbol) {
  return TOKEN_DECIMALS[symbol] || 18;
}

function isBridgeAddress(address) {
  return KNOWN_BRIDGE_ADDRESSES.has(address?.toLowerCase());
}

let providerInstance = null;

export async function getProvider() {
  if (!providerInstance) {
    providerInstance = new ethers.JsonRpcProvider(RPC_URL);
  }
  return providerInstance;
}

export async function getLatestBlock() {
  const provider = await getProvider();
  return provider.getBlockNumber();
}

function decodeAddress(topic) {
  if (!topic) return null;
  return '0x' + topic.slice(26).toLowerCase();
}

function decodeUint256(data, offset = 0) {
  const start = 2 + (offset * 64);
  const hex = data.slice(start, start + 64);
  return '0x' + hex;
}

async function parseSynapseEvent(log, provider) {
  const topic0 = log.topics[0];
  
  let direction, wallet, tokenAddress, amount, chainId;
  
  try {
    const outboundEvents = [
      SYNAPSE_EVENTS.TokenDeposit, 
      SYNAPSE_EVENTS.TokenDepositAndSwap,
      SYNAPSE_EVENTS.TokenRedeem, 
      SYNAPSE_EVENTS.TokenRedeemAndSwap
    ];
    const inboundEvents = [
      SYNAPSE_EVENTS.TokenMint, 
      SYNAPSE_EVENTS.TokenMintAndSwap,
      SYNAPSE_EVENTS.TokenWithdraw, 
      SYNAPSE_EVENTS.TokenWithdrawAndRemove
    ];
    
    if (outboundEvents.includes(topic0)) {
      direction = 'out';
      wallet = decodeAddress(log.topics[1]);
      const chainIdHex = decodeUint256(log.data, 0);
      chainId = Number(BigInt(chainIdHex));
      tokenAddress = '0x' + log.data.slice(2 + 64 + 24, 2 + 64 + 64).toLowerCase();
      amount = decodeUint256(log.data, 2);
    } else if (inboundEvents.includes(topic0)) {
      direction = 'in';
      wallet = decodeAddress(log.topics[1]);
      tokenAddress = '0x' + log.data.slice(2 + 24, 2 + 64).toLowerCase();
      amount = decodeUint256(log.data, 1);
      chainId = 0;
    } else {
      return null;
    }
    
    const tokenSymbol = getTokenSymbol(tokenAddress);
    const tokenDecimals = getTokenDecimals(tokenSymbol);
    const block = await provider.getBlock(log.blockNumber);
    
    return {
      wallet,
      bridgeType: 'token',
      direction,
      tokenAddress,
      tokenSymbol,
      amount: formatTokenAmount(amount, tokenDecimals),
      srcChainId: direction === 'out' ? DFK_CHAIN_ID : chainId || 0,
      dstChainId: direction === 'out' ? chainId || 0 : DFK_CHAIN_ID,
      txHash: log.transactionHash,
      blockNumber: log.blockNumber,
      blockTimestamp: new Date(block.timestamp * 1000)
    };
  } catch (err) {
    console.error('[SynapseEvent] Parse error:', err.message);
    return null;
  }
}

export async function indexSynapseBridgeEvents(fromBlock, toBlock, options = {}) {
  const { verbose = false } = options;
  const provider = await getProvider();
  
  const results = [];
  
  const eventTopics = Object.values(SYNAPSE_EVENTS);
  
  try {
    const filter = {
      address: SYNAPSE_BRIDGE,
      topics: [eventTopics],
      fromBlock,
      toBlock
    };
    
    const logs = await provider.getLogs(filter);
    
    if (verbose && logs.length > 0) {
      console.log(`[SynapseIndex] Found ${logs.length} bridge events in blocks ${fromBlock}-${toBlock}`);
    }
    
    for (const log of logs) {
      const event = await parseSynapseEvent(log, provider);
      if (event) {
        results.push(event);
      }
    }
  } catch (err) {
    console.error(`[SynapseIndex] Error querying bridge events:`, err.message);
  }
  
  return results;
}

export async function indexTokenTransfers(fromBlock, toBlock, options = {}) {
  const { verbose = false } = options;
  const provider = await getProvider();
  
  const results = [];
  
  for (const token of TOKEN_CONFIG) {
    try {
      const filter = {
        address: token.address,
        topics: [ERC20_TRANSFER_TOPIC],
        fromBlock,
        toBlock
      };
      
      const logs = await provider.getLogs(filter);
      
      for (const log of logs) {
        try {
          const from = decodeAddress(log.topics[1]);
          const to = decodeAddress(log.topics[2]);
          const rawValue = log.data;
          
          const fromIsBridge = isBridgeAddress(from);
          const toIsBridge = isBridgeAddress(to);
          
          if (!fromIsBridge && !toIsBridge) continue;
          
          let direction, wallet;
          if (fromIsBridge && !toIsBridge) {
            direction = 'in';
            wallet = to;
          } else if (!fromIsBridge && toIsBridge) {
            direction = 'out';
            wallet = from;
          } else {
            continue;
          }
          
          const block = await provider.getBlock(log.blockNumber);
          
          results.push({
            wallet,
            bridgeType: 'token',
            direction,
            tokenAddress: token.address,
            tokenSymbol: token.symbol,
            amount: formatTokenAmount(rawValue, token.decimals),
            srcChainId: direction === 'in' ? 0 : DFK_CHAIN_ID,
            dstChainId: direction === 'in' ? DFK_CHAIN_ID : 0,
            txHash: log.transactionHash,
            blockNumber: log.blockNumber,
            blockTimestamp: new Date(block.timestamp * 1000),
          });
        } catch (err) {
          if (verbose) console.error(`[TokenIndex] Error processing log:`, err.message);
        }
      }
      
      if (verbose && results.length > 0) {
        console.log(`[TokenIndex] ${token.symbol}: ${results.length} transfers in blocks ${fromBlock}-${toBlock}`);
      }
    } catch (err) {
      console.error(`[TokenIndex] Error querying ${token.symbol}:`, err.message);
    }
  }
  
  return results;
}

export async function saveBridgeEvents(events) {
  if (!events.length) return { inserted: 0, skipped: 0 };
  
  let inserted = 0;
  let skipped = 0;

  for (const event of events) {
    try {
      await db.insert(bridgeEvents).values({
        wallet: event.wallet,
        bridgeType: event.bridgeType,
        direction: event.direction,
        tokenAddress: event.tokenAddress || null,
        tokenSymbol: event.tokenSymbol || null,
        amount: event.amount || null,
        assetId: null,
        srcChainId: event.srcChainId,
        dstChainId: event.dstChainId,
        txHash: event.txHash,
        blockNumber: Number(event.blockNumber),
        blockTimestamp: event.blockTimestamp,
      }).onConflictDoNothing();
      inserted++;
    } catch (err) {
      if (err.code === '23505') {
        skipped++;
      } else {
        console.error(`[BridgeIndexer] Error inserting event:`, err.message);
      }
    }
  }

  return { inserted, skipped };
}

export async function runFullIndex(options = {}) {
  console.log('[BridgeIndexer] === runFullIndex ENTERED ===');
  console.log('[BridgeIndexer] Options received:', JSON.stringify(options));
  
  const { 
    startBlock = null, 
    endBlock = null,
    batchSize = BLOCKS_PER_QUERY,
    verbose = false,
    useSynapseEvents = true
  } = options;

  console.log('[BridgeIndexer] Options parsed:', { startBlock, endBlock, batchSize, verbose, useSynapseEvents });
  
  let provider, latestBlock;
  try {
    console.log('[BridgeIndexer] Getting provider...');
    provider = await getProvider();
    console.log('[BridgeIndexer] Provider obtained, getting block number...');
    latestBlock = await provider.getBlockNumber();
    console.log('[BridgeIndexer] Latest block:', latestBlock);
  } catch (providerError) {
    console.error('[BridgeIndexer] FATAL: Provider/block error:', providerError);
    console.error('[BridgeIndexer] Provider error stack:', providerError?.stack);
    throw providerError;
  }
  
  const from = startBlock || latestBlock - 100000;
  const to = endBlock || latestBlock;

  console.log(`[BridgeIndexer] Starting index from block ${from} to ${to}`);
  console.log(`[BridgeIndexer] Method: ${useSynapseEvents ? 'Synapse Bridge Events' : 'ERC20 Transfers'}`);
  
  let totalEvents = 0;
  let totalInserted = 0;

  for (let block = from; block < to; block += batchSize) {
    const batchEnd = Math.min(block + batchSize - 1, to);
    
    try {
      let events;
      if (useSynapseEvents) {
        events = await indexSynapseBridgeEvents(block, batchEnd, { verbose });
      } else {
        events = await indexTokenTransfers(block, batchEnd, { verbose });
      }
      
      const { inserted, skipped } = await saveBridgeEvents(events);
      
      totalEvents += events.length;
      totalInserted += inserted;
      
      if (verbose || events.length > 0) {
        console.log(`[BridgeIndexer] Blocks ${block}-${batchEnd}: ${events.length} events, ${inserted} inserted`);
      }
    } catch (err) {
      console.error(`[BridgeIndexer] Error in batch ${block}-${batchEnd}:`, err.message);
    }

    await new Promise(r => setTimeout(r, 100));
  }

  console.log(`[BridgeIndexer] Complete. Total: ${totalEvents} events, ${totalInserted} inserted`);
  return { totalEvents, totalInserted };
}

export async function indexWallet(wallet, options = {}) {
  const { verbose = false, lookbackBlocks = 500000 } = options;
  const normalizedWallet = wallet.toLowerCase();
  const walletTopic = '0x000000000000000000000000' + normalizedWallet.slice(2);
  
  if (verbose) console.log(`[BridgeIndexer] Indexing wallet ${normalizedWallet} on-chain`);
  
  const provider = await getProvider();
  const latestBlock = await provider.getBlockNumber();
  const startBlock = latestBlock - lookbackBlocks;
  
  const allEvents = [];
  
  const eventTopics = Object.values(SYNAPSE_EVENTS);
  
  try {
    const filter = {
      address: SYNAPSE_BRIDGE,
      topics: [eventTopics, walletTopic],
      fromBlock: startBlock,
      toBlock: latestBlock
    };
    
    const logs = await provider.getLogs(filter);
    
    if (verbose) {
      console.log(`[BridgeIndexer] Found ${logs.length} Synapse events for wallet`);
    }
    
    for (const log of logs) {
      const event = await parseSynapseEvent(log, provider);
      if (event) {
        allEvents.push(event);
      }
    }
  } catch (err) {
    console.error(`[BridgeIndexer] Error querying Synapse events for wallet:`, err.message);
  }
  
  for (const token of TOKEN_CONFIG) {
    try {
      const filterOut = {
        address: token.address,
        topics: [ERC20_TRANSFER_TOPIC, walletTopic],
        fromBlock: startBlock,
        toBlock: latestBlock
      };
      
      const filterIn = {
        address: token.address,
        topics: [ERC20_TRANSFER_TOPIC, null, walletTopic],
        fromBlock: startBlock,
        toBlock: latestBlock
      };
      
      const [logsOut, logsIn] = await Promise.all([
        provider.getLogs(filterOut),
        provider.getLogs(filterIn)
      ]);
      
      const allLogs = [...logsOut, ...logsIn];
      const seenTxs = new Set(allEvents.map(e => e.txHash));
      
      for (const log of allLogs) {
        if (seenTxs.has(log.transactionHash)) continue;
        
        try {
          const from = decodeAddress(log.topics[1]);
          const to = decodeAddress(log.topics[2]);
          
          const fromIsBridge = isBridgeAddress(from);
          const toIsBridge = isBridgeAddress(to);
          
          if (!fromIsBridge && !toIsBridge) continue;
          
          let direction, eventWallet;
          if (fromIsBridge && to === normalizedWallet) {
            direction = 'in';
            eventWallet = to;
          } else if (from === normalizedWallet && toIsBridge) {
            direction = 'out';
            eventWallet = from;
          } else {
            continue;
          }
          
          const block = await provider.getBlock(log.blockNumber);
          
          allEvents.push({
            wallet: eventWallet,
            bridgeType: 'token',
            direction,
            tokenAddress: token.address,
            tokenSymbol: token.symbol,
            amount: formatTokenAmount(log.data, token.decimals),
            srcChainId: direction === 'in' ? 0 : DFK_CHAIN_ID,
            dstChainId: direction === 'in' ? DFK_CHAIN_ID : 0,
            txHash: log.transactionHash,
            blockNumber: log.blockNumber,
            blockTimestamp: new Date(block.timestamp * 1000),
          });
          
          seenTxs.add(log.transactionHash);
        } catch (err) {
          if (verbose) console.error(`[BridgeIndexer] Error processing log:`, err.message);
        }
      }
    } catch (err) {
      console.error(`[BridgeIndexer] Error querying ${token.symbol} for wallet:`, err.message);
    }
  }
  
  if (allEvents.length > 0) {
    await saveBridgeEvents(allEvents);
  }
  
  if (verbose) {
    console.log(`[BridgeIndexer] Indexed ${allEvents.length} events for wallet ${normalizedWallet}`);
  }
  
  return allEvents;
}

export async function getWalletEvents(wallet, limit = 100) {
  return db.select()
    .from(bridgeEvents)
    .where(eq(bridgeEvents.wallet, wallet.toLowerCase()))
    .orderBy(desc(bridgeEvents.blockTimestamp))
    .limit(limit);
}

// ============================================================================
// PROGRESS TRACKING FOR RESUMABLE INDEXING
// ============================================================================

export async function getIndexerProgress(indexerName = MAIN_INDEXER_NAME) {
  const [progress] = await db.select()
    .from(bridgeIndexerProgress)
    .where(eq(bridgeIndexerProgress.indexerName, indexerName))
    .limit(1);
  return progress;
}

export async function initIndexerProgress(indexerName = MAIN_INDEXER_NAME, genesisBlock = DFK_CHAIN_GENESIS) {
  const existing = await getIndexerProgress(indexerName);
  if (existing) return existing;
  
  await db.insert(bridgeIndexerProgress).values({
    indexerName,
    lastIndexedBlock: genesisBlock,
    genesisBlock,
    status: 'idle',
    totalEventsIndexed: 0,
    eventsNeedingPrices: 0,
  });
  
  return getIndexerProgress(indexerName);
}

export async function updateIndexerProgress(indexerName, updates) {
  await db.update(bridgeIndexerProgress)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(bridgeIndexerProgress.indexerName, indexerName));
}

export async function getEventsNeedingPrices() {
  const result = await db.select({ count: sql`count(*)::int` })
    .from(bridgeEvents)
    .where(isNull(bridgeEvents.usdValue));
  return result[0]?.count || 0;
}

// ============================================================================
// INCREMENTAL BATCH INDEXING (10K blocks at a time, manually triggered)
// ============================================================================

const INCREMENTAL_BATCH_SIZE = 10000;
let incrementalBatchRunning = false;

export function isIncrementalBatchRunning() {
  return incrementalBatchRunning;
}

export async function runIncrementalBatch(options = {}) {
  const {
    batchSize = INCREMENTAL_BATCH_SIZE,
    indexerName = MAIN_INDEXER_NAME,
  } = options;

  if (incrementalBatchRunning) {
    console.log('[IncrementalBatch] Already running, skipping...');
    return { status: 'already_running' };
  }

  incrementalBatchRunning = true;
  const startTime = Date.now();

  try {
    // Initialize or get existing progress
    let progress = await initIndexerProgress(indexerName);
    const provider = await getProvider();
    const latestBlock = await provider.getBlockNumber();

    const startBlock = progress.lastIndexedBlock;
    const endBlock = Math.min(startBlock + batchSize, latestBlock);

    // Check if we're already at the latest block
    if (startBlock >= latestBlock) {
      incrementalBatchRunning = false;
      return {
        status: 'complete',
        message: 'Already at latest block',
        startBlock,
        endBlock: startBlock,
        latestBlock,
        eventsFound: 0,
        eventsInserted: 0,
        runtimeMs: Date.now() - startTime,
      };
    }

    console.log(`[IncrementalBatch] Indexing blocks ${startBlock} to ${endBlock} (${endBlock - startBlock} blocks)`);

    let totalEvents = 0;
    let totalInserted = 0;

    // Index in smaller sub-batches for RPC limits
    for (let subBlock = startBlock; subBlock < endBlock; subBlock += BLOCKS_PER_QUERY) {
      const subEnd = Math.min(subBlock + BLOCKS_PER_QUERY - 1, endBlock);
      
      const events = await indexSynapseBridgeEvents(subBlock, subEnd, { verbose: false });
      const { inserted } = await saveBridgeEvents(events);
      
      totalEvents += events.length;
      totalInserted += inserted;

      // Small delay to avoid RPC rate limits
      await new Promise(r => setTimeout(r, 50));
    }

    const runtimeMs = Date.now() - startTime;
    const eventsNeedingPrices = await getEventsNeedingPrices();

    // Update progress with batch runtime tracking
    const newTotalBatchCount = (progress.totalBatchCount || 0) + 1;
    const newTotalBatchRuntimeMs = (progress.totalBatchRuntimeMs || 0) + runtimeMs;

    await updateIndexerProgress(indexerName, {
      lastIndexedBlock: endBlock,
      totalEventsIndexed: (progress.totalEventsIndexed || 0) + totalInserted,
      eventsNeedingPrices,
      lastBatchRuntimeMs: runtimeMs,
      totalBatchCount: newTotalBatchCount,
      totalBatchRuntimeMs: newTotalBatchRuntimeMs,
      status: endBlock >= latestBlock ? 'complete' : 'idle',
    });

    const avgRuntimeMs = Math.round(newTotalBatchRuntimeMs / newTotalBatchCount);

    console.log(`[IncrementalBatch] Complete: ${totalEvents} events found, ${totalInserted} inserted in ${(runtimeMs / 1000).toFixed(1)}s`);
    console.log(`[IncrementalBatch] Avg runtime: ${(avgRuntimeMs / 1000).toFixed(1)}s over ${newTotalBatchCount} batches`);

    incrementalBatchRunning = false;

    return {
      status: 'success',
      startBlock,
      endBlock,
      latestBlock,
      blocksRemaining: latestBlock - endBlock,
      eventsFound: totalEvents,
      eventsInserted: totalInserted,
      runtimeMs,
      avgRuntimeMs,
      totalBatchCount: newTotalBatchCount,
    };
  } catch (error) {
    incrementalBatchRunning = false;
    console.error('[IncrementalBatch] Error:', error);
    
    await updateIndexerProgress(indexerName, {
      status: 'error',
      lastError: error.message,
    });

    return {
      status: 'error',
      error: error.message,
      runtimeMs: Date.now() - startTime,
    };
  }
}

// ============================================================================
// FULL HISTORICAL SYNC (Resumable from genesis)
// ============================================================================

let historicalSyncRunning = false;
let historicalSyncAbort = false;

export function isHistoricalSyncRunning() {
  return historicalSyncRunning;
}

export function abortHistoricalSync() {
  historicalSyncAbort = true;
}

export async function runHistoricalSync(options = {}) {
  const {
    batchSize = 10000, // Larger batches for historical data
    verbose = true,
    indexerName = MAIN_INDEXER_NAME,
  } = options;

  if (historicalSyncRunning) {
    console.log('[HistoricalSync] Already running, skipping...');
    return { status: 'already_running' };
  }

  historicalSyncRunning = true;
  historicalSyncAbort = false;

  try {
    // Initialize or get existing progress
    let progress = await initIndexerProgress(indexerName);
    const provider = await getProvider();
    const latestBlock = await provider.getBlockNumber();

    // Update status to running
    await updateIndexerProgress(indexerName, {
      status: 'running',
      startedAt: new Date(),
      targetBlock: latestBlock,
    });

    console.log(`[HistoricalSync] Starting from block ${progress.lastIndexedBlock} to ${latestBlock}`);
    console.log(`[HistoricalSync] ${latestBlock - progress.lastIndexedBlock} blocks remaining`);

    let currentBlock = progress.lastIndexedBlock;
    let totalEventsThisRun = 0;
    let totalInsertedThisRun = 0;

    while (currentBlock < latestBlock && !historicalSyncAbort) {
      const batchEnd = Math.min(currentBlock + batchSize, latestBlock);

      try {
        // Index in smaller sub-batches for RPC limits
        let batchEvents = 0;
        let batchInserted = 0;

        for (let subBlock = currentBlock; subBlock < batchEnd; subBlock += BLOCKS_PER_QUERY) {
          const subEnd = Math.min(subBlock + BLOCKS_PER_QUERY - 1, batchEnd);
          
          const events = await indexSynapseBridgeEvents(subBlock, subEnd, { verbose: false });
          const { inserted } = await saveBridgeEvents(events);
          
          batchEvents += events.length;
          batchInserted += inserted;

          // Small delay to avoid RPC rate limits
          await new Promise(r => setTimeout(r, 50));
        }

        totalEventsThisRun += batchEvents;
        totalInsertedThisRun += batchInserted;

        // Update progress in database
        const eventsNeedingPrices = await getEventsNeedingPrices();
        await updateIndexerProgress(indexerName, {
          lastIndexedBlock: batchEnd,
          totalEventsIndexed: progress.totalEventsIndexed + totalInsertedThisRun,
          eventsNeedingPrices,
        });

        const percentComplete = ((batchEnd / latestBlock) * 100).toFixed(2);
        if (verbose) {
          console.log(`[HistoricalSync] Blocks ${currentBlock}-${batchEnd}: ${batchEvents} events, ${batchInserted} inserted (${percentComplete}% complete)`);
        }

        currentBlock = batchEnd;

      } catch (err) {
        console.error(`[HistoricalSync] Error at block ${currentBlock}:`, err.message);
        await updateIndexerProgress(indexerName, {
          status: 'error',
          lastError: err.message,
        });
        // Continue from error point after a delay
        await new Promise(r => setTimeout(r, 5000));
      }
    }

    // Update final status
    const finalStatus = historicalSyncAbort ? 'idle' : (currentBlock >= latestBlock ? 'completed' : 'idle');
    const eventsNeedingPrices = await getEventsNeedingPrices();
    
    await updateIndexerProgress(indexerName, {
      status: finalStatus,
      completedAt: finalStatus === 'completed' ? new Date() : null,
      eventsNeedingPrices,
    });

    console.log(`[HistoricalSync] Finished. Total this run: ${totalEventsThisRun} events, ${totalInsertedThisRun} inserted`);
    
    return { 
      status: finalStatus, 
      totalEvents: totalEventsThisRun, 
      totalInserted: totalInsertedThisRun,
      lastBlock: currentBlock,
    };

  } finally {
    historicalSyncRunning = false;
  }
}

// ============================================================================
// MAINTENANCE MODE (Catch up with new blocks periodically)
// ============================================================================

let maintenanceInterval = null;

export async function runMaintenanceSync(options = {}) {
  const { lookbackBlocks = 5000, verbose = false } = options;
  
  const provider = await getProvider();
  const latestBlock = await provider.getBlockNumber();
  const startBlock = latestBlock - lookbackBlocks;

  console.log(`[MaintenanceSync] Scanning recent blocks ${startBlock}-${latestBlock}`);

  let totalEvents = 0;
  let totalInserted = 0;

  for (let block = startBlock; block < latestBlock; block += BLOCKS_PER_QUERY) {
    const batchEnd = Math.min(block + BLOCKS_PER_QUERY - 1, latestBlock);
    
    try {
      const events = await indexSynapseBridgeEvents(block, batchEnd, { verbose: false });
      const { inserted } = await saveBridgeEvents(events);
      
      totalEvents += events.length;
      totalInserted += inserted;

      if (verbose && events.length > 0) {
        console.log(`[MaintenanceSync] Blocks ${block}-${batchEnd}: ${events.length} events, ${inserted} inserted`);
      }
    } catch (err) {
      console.error(`[MaintenanceSync] Error at block ${block}:`, err.message);
    }

    await new Promise(r => setTimeout(r, 50));
  }

  if (totalInserted > 0) {
    console.log(`[MaintenanceSync] Complete: ${totalEvents} events, ${totalInserted} new`);
  }

  return { totalEvents, totalInserted };
}

export function startMaintenanceScheduler(intervalMs = 30 * 60 * 1000) { // Default: every 30 minutes
  if (maintenanceInterval) {
    console.log('[MaintenanceScheduler] Already running');
    return;
  }

  console.log(`[MaintenanceScheduler] Starting (interval: ${intervalMs / 1000}s)`);
  
  maintenanceInterval = setInterval(async () => {
    try {
      await runMaintenanceSync({ verbose: true });
    } catch (err) {
      console.error('[MaintenanceScheduler] Error:', err.message);
    }
  }, intervalMs);
}

export function stopMaintenanceScheduler() {
  if (maintenanceInterval) {
    clearInterval(maintenanceInterval);
    maintenanceInterval = null;
    console.log('[MaintenanceScheduler] Stopped');
  }
}

// Main execution when run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('[BridgeIndexer] Starting full index...');
  runFullIndex({ verbose: true })
    .then((result) => {
      console.log('[BridgeIndexer] Complete:', result);
      process.exit(0);
    })
    .catch((err) => {
      console.error('[BridgeIndexer] Error:', err);
      process.exit(1);
    });
}
