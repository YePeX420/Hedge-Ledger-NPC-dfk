import { ethers } from 'ethers';
import { db } from '../../../server/db.js';
import { poolSwapEvents, poolEventIndexerProgress } from '../../../shared/schema.js';
import { eq, and, sql, desc } from 'drizzle-orm';

const DFK_CHAIN_RPC = 'https://subnets.avax.network/defi-kingdoms/dfk-chain/rpc';
const LP_STAKING_ADDRESS = '0xB04e8D6aED037904B77A9F0b08002592925833b7';

const DFK_GENESIS_BLOCK = 0;
const BLOCKS_PER_QUERY = 2000;
const INCREMENTAL_BATCH_SIZE = 10000;

const LP_STAKING_ABI = [
  'function getPoolInfo(uint256 pid) view returns (address lpToken, uint256 allocPoint, uint256 lastRewardBlock, uint256 accRewardPerShare, uint256 totalStaked)',
  'function getPoolLength() view returns (uint256)',
];

const LP_PAIR_ABI = [
  'event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)',
  'function token0() view returns (address)',
  'function token1() view returns (address)',
  'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
  'function totalSupply() view returns (uint256)',
];

const liveProgress = new Map();

export function getSwapLiveProgress(pid) {
  return liveProgress.get(`swaps_${pid}`) || null;
}

export function getAllSwapLiveProgress() {
  const result = [];
  for (const [key, progress] of liveProgress.entries()) {
    if (key.startsWith('swaps_')) {
      const pid = parseInt(key.replace('swaps_', ''));
      result.push({ pid, ...progress });
    }
  }
  return result;
}

function updateLiveProgress(pid, updates) {
  const key = `swaps_${pid}`;
  const current = liveProgress.get(key) || {
    isRunning: false,
    currentBlock: 0,
    targetBlock: 0,
    totalEventsFound: 0,
    batchesCompleted: 0,
    startedAt: null,
    lastBatchAt: null,
    lastBatchEventsFound: 0,
    percentComplete: 0,
    completedAt: null,
  };
  const updated = { ...current, ...updates };
  if (updates.percentComplete === undefined && updated.targetBlock > 0) {
    updated.percentComplete = Math.min(100, (updated.currentBlock / updated.targetBlock) * 100);
  }
  liveProgress.set(key, updated);
  return updated;
}

function clearLiveProgress(pid) {
  liveProgress.delete(`swaps_${pid}`);
}

let providerInstance = null;
let stakingContractInstance = null;
const lpContractCache = new Map();

export function getProvider() {
  if (!providerInstance) {
    providerInstance = new ethers.JsonRpcProvider(DFK_CHAIN_RPC);
  }
  return providerInstance;
}

export function getStakingContract() {
  if (!stakingContractInstance) {
    stakingContractInstance = new ethers.Contract(LP_STAKING_ADDRESS, LP_STAKING_ABI, getProvider());
  }
  return stakingContractInstance;
}

export function getLPContract(lpTokenAddress) {
  const key = lpTokenAddress.toLowerCase();
  if (!lpContractCache.has(key)) {
    lpContractCache.set(key, new ethers.Contract(lpTokenAddress, LP_PAIR_ABI, getProvider()));
  }
  return lpContractCache.get(key);
}

export async function getLatestBlock() {
  const provider = getProvider();
  return provider.getBlockNumber();
}

export async function getPoolLPToken(pid) {
  try {
    const contract = getStakingContract();
    const poolInfo = await contract.getPoolInfo(pid);
    return poolInfo.lpToken;
  } catch (err) {
    console.error(`[PoolSwapIndexer] Error getting LP token for pool ${pid}:`, err.message);
    return null;
  }
}

export function getSwapIndexerName(pid) {
  return `swaps_pool_${pid}`;
}

export async function getSwapIndexerProgress(indexerName) {
  const [progress] = await db.select()
    .from(poolEventIndexerProgress)
    .where(eq(poolEventIndexerProgress.indexerName, indexerName))
    .limit(1);
  return progress;
}

export async function initSwapIndexerProgress(indexerName, pid, lpToken, genesisBlock = DFK_GENESIS_BLOCK) {
  const existing = await getSwapIndexerProgress(indexerName);
  if (existing) return existing;
  
  await db.insert(poolEventIndexerProgress).values({
    indexerName,
    indexerType: 'swaps',
    pid,
    lpToken,
    lastIndexedBlock: genesisBlock,
    genesisBlock,
    status: 'idle',
    totalEventsIndexed: 0,
  });
  
  return getSwapIndexerProgress(indexerName);
}

export async function updateSwapIndexerProgress(indexerName, updates) {
  await db.update(poolEventIndexerProgress)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(poolEventIndexerProgress.indexerName, indexerName));
}

export async function getAllSwapIndexerProgress() {
  return db.select()
    .from(poolEventIndexerProgress)
    .where(eq(poolEventIndexerProgress.indexerType, 'swaps'))
    .orderBy(poolEventIndexerProgress.pid);
}

async function querySwapEventsInChunks(contract, fromBlock, toBlock, maxChunkSize = BLOCKS_PER_QUERY) {
  const allEvents = [];
  const filter = contract.filters.Swap();
  
  if (toBlock - fromBlock <= maxChunkSize) {
    try {
      return await contract.queryFilter(filter, fromBlock, toBlock);
    } catch (err) {
      console.error(`[PoolSwapIndexer] Error querying swaps ${fromBlock}-${toBlock}:`, err.message);
      return [];
    }
  }
  
  for (let start = fromBlock; start <= toBlock; start += maxChunkSize) {
    const end = Math.min(start + maxChunkSize - 1, toBlock);
    try {
      const events = await contract.queryFilter(filter, start, end);
      allEvents.push(...events);
    } catch (err) {
      console.error(`[PoolSwapIndexer] Error querying swaps ${start}-${end}:`, err.message);
    }
    await new Promise(r => setTimeout(r, 50));
  }
  
  return allEvents;
}

export async function indexPoolSwapEvents(pid, lpToken, fromBlock, toBlock) {
  const lpContract = getLPContract(lpToken);
  const events = await querySwapEventsInChunks(lpContract, fromBlock, toBlock);
  return events;
}

export async function saveSwapEvents(pid, lpToken, events) {
  if (!events || events.length === 0) return { saved: 0 };
  
  const provider = getProvider();
  let saved = 0;
  
  for (const event of events) {
    try {
      const block = await provider.getBlock(event.blockNumber);
      const timestamp = block ? new Date(block.timestamp * 1000) : new Date();
      
      await db.insert(poolSwapEvents).values({
        pid,
        lpToken: lpToken.toLowerCase(),
        blockNumber: event.blockNumber,
        txHash: event.transactionHash,
        logIndex: event.index,
        sender: event.args.sender.toLowerCase(),
        recipient: event.args.to.toLowerCase(),
        amount0In: ethers.formatEther(event.args.amount0In),
        amount1In: ethers.formatEther(event.args.amount1In),
        amount0Out: ethers.formatEther(event.args.amount0Out),
        amount1Out: ethers.formatEther(event.args.amount1Out),
        timestamp,
      }).onConflictDoNothing();
      saved++;
    } catch (err) {
      if (!err.message.includes('duplicate') && !err.message.includes('unique constraint')) {
        console.error(`[PoolSwapIndexer] Error saving swap event:`, err.message);
      }
    }
    await new Promise(r => setTimeout(r, 10));
  }
  
  return { saved };
}

const runningWorkers = new Map();

export function isSwapWorkerRunning(indexerName) {
  return runningWorkers.get(indexerName) === true;
}

export async function runSwapIncrementalBatch(pid, options = {}) {
  const {
    batchSize = INCREMENTAL_BATCH_SIZE,
  } = options;
  
  const indexerName = getSwapIndexerName(pid);
  
  if (runningWorkers.get(indexerName)) {
    console.log(`[PoolSwapIndexer] Indexer ${indexerName} already running, skipping...`);
    return { status: 'already_running' };
  }
  
  runningWorkers.set(indexerName, true);
  const startTime = Date.now();
  
  try {
    const lpToken = await getPoolLPToken(pid);
    if (!lpToken) {
      runningWorkers.set(indexerName, false);
      return { status: 'error', error: 'Could not get LP token address' };
    }
    
    let progress = await initSwapIndexerProgress(indexerName, pid, lpToken);
    const latestBlock = await getLatestBlock();
    
    const startBlock = progress.lastIndexedBlock;
    const endBlock = Math.min(startBlock + batchSize, latestBlock);
    
    const existingLive = getSwapLiveProgress(pid);
    updateLiveProgress(pid, {
      isRunning: true,
      currentBlock: startBlock,
      targetBlock: latestBlock,
      totalEventsFound: existingLive?.totalEventsFound || progress.totalEventsIndexed || 0,
      batchesCompleted: existingLive?.batchesCompleted || 0,
      startedAt: existingLive?.startedAt || new Date().toISOString(),
      lastBatchAt: null,
    });
    
    if (startBlock >= latestBlock) {
      runningWorkers.set(indexerName, false);
      updateLiveProgress(pid, { 
        isRunning: false, 
        currentBlock: latestBlock,
        targetBlock: latestBlock,
        percentComplete: 100,
        completedAt: new Date().toISOString(),
      });
      return {
        status: 'complete',
        message: 'Already at latest block',
        startBlock,
        endBlock: startBlock,
        latestBlock,
        eventsFound: 0,
        runtimeMs: Date.now() - startTime,
      };
    }
    
    console.log(`[PoolSwapIndexer] Pool ${pid}: Indexing swaps from blocks ${startBlock} to ${endBlock} (${endBlock - startBlock} blocks)`);
    
    await updateSwapIndexerProgress(indexerName, { status: 'running' });
    
    const events = await indexPoolSwapEvents(pid, lpToken, startBlock, endBlock);
    console.log(`[PoolSwapIndexer] Pool ${pid}: Found ${events.length} swap events`);
    
    const { saved } = await saveSwapEvents(pid, lpToken, events);
    
    const runtimeMs = Date.now() - startTime;
    const totalEventsIndexed = (progress.totalEventsIndexed || 0) + events.length;
    
    await updateSwapIndexerProgress(indexerName, {
      lastIndexedBlock: endBlock,
      totalEventsIndexed,
      status: endBlock >= latestBlock ? 'complete' : 'idle',
    });
    
    const currentLive = getSwapLiveProgress(pid);
    const caughtUp = endBlock >= latestBlock;
    updateLiveProgress(pid, {
      isRunning: isSwapAutoRunning(pid) && !caughtUp,
      currentBlock: endBlock,
      targetBlock: latestBlock,
      totalEventsFound: totalEventsIndexed,
      batchesCompleted: (currentLive?.batchesCompleted || 0) + 1,
      lastBatchAt: new Date().toISOString(),
      lastBatchEventsFound: events.length,
      percentComplete: caughtUp ? 100 : undefined,
      completedAt: caughtUp ? new Date().toISOString() : currentLive?.completedAt,
    });
    
    console.log(`[PoolSwapIndexer] Pool ${pid}: Complete. ${events.length} swaps found, ${saved} saved in ${(runtimeMs / 1000).toFixed(1)}s`);
    
    runningWorkers.set(indexerName, false);
    
    return {
      status: 'success',
      pid,
      startBlock,
      endBlock,
      latestBlock,
      blocksRemaining: latestBlock - endBlock,
      eventsFound: events.length,
      eventsSaved: saved,
      runtimeMs,
    };
  } catch (error) {
    runningWorkers.set(indexerName, false);
    console.error(`[PoolSwapIndexer] Pool ${pid} error:`, error);
    
    await updateSwapIndexerProgress(indexerName, {
      status: 'error',
      lastError: error.message,
    });
    
    updateLiveProgress(pid, {
      isRunning: false,
      lastError: error.message,
    });
    
    return {
      status: 'error',
      error: error.message,
      runtimeMs: Date.now() - startTime,
    };
  }
}

export async function getSwapEventsForPool(pid, limit = 100) {
  return db.select()
    .from(poolSwapEvents)
    .where(eq(poolSwapEvents.pid, pid))
    .orderBy(desc(poolSwapEvents.blockNumber))
    .limit(limit);
}

export async function getSwapEventCountForPool(pid, sinceTimestamp) {
  const result = await db.select({ count: sql`count(*)::int` })
    .from(poolSwapEvents)
    .where(and(
      eq(poolSwapEvents.pid, pid),
      sql`${poolSwapEvents.timestamp} >= ${sinceTimestamp}`
    ));
  return result[0]?.count || 0;
}

export async function resetSwapIndexerProgress(pid) {
  const indexerName = getSwapIndexerName(pid);
  
  await db.delete(poolEventIndexerProgress)
    .where(eq(poolEventIndexerProgress.indexerName, indexerName));
  
  await db.delete(poolSwapEvents)
    .where(eq(poolSwapEvents.pid, pid));
  
  console.log(`[PoolSwapIndexer] Reset swap indexer for pool ${pid}`);
  return { reset: true };
}

const autoRunIntervals = new Map();

export function isSwapAutoRunning(pid) {
  return autoRunIntervals.has(`swaps_${pid}`);
}

export function getSwapAutoRunStatus() {
  const status = [];
  for (const [key, info] of autoRunIntervals.entries()) {
    if (key.startsWith('swaps_')) {
      const pid = parseInt(key.replace('swaps_', ''));
      status.push({
        pid,
        intervalMs: info.intervalMs,
        startedAt: info.startedAt,
        lastRunAt: info.lastRunAt,
        runsCompleted: info.runsCompleted,
      });
    }
  }
  return status;
}

export function startSwapAutoRun(pid, intervalMs = 5 * 60 * 1000) {
  const key = `swaps_${pid}`;
  if (autoRunIntervals.has(key)) {
    console.log(`[PoolSwapIndexer] Auto-run already running for pool ${pid}`);
    return { status: 'already_running', pid };
  }
  
  console.log(`[PoolSwapIndexer] Starting swap auto-run for pool ${pid} (interval: ${intervalMs / 1000}s)`);
  
  clearLiveProgress(pid);
  
  const info = {
    intervalMs,
    startedAt: new Date().toISOString(),
    lastRunAt: null,
    runsCompleted: 0,
    interval: null,
  };
  
  autoRunIntervals.set(key, info);
  
  (async () => {
    try {
      console.log(`[PoolSwapIndexer] Swap auto-run initial batch for pool ${pid}`);
      await runSwapIncrementalBatch(pid);
      info.lastRunAt = new Date().toISOString();
      info.runsCompleted++;
    } catch (err) {
      console.error(`[PoolSwapIndexer] Auto-run initial error for pool ${pid}:`, err.message);
    }
  })();
  
  info.interval = setInterval(async () => {
    if (!autoRunIntervals.has(key)) {
      return;
    }
    try {
      console.log(`[PoolSwapIndexer] Swap auto-run batch for pool ${pid}`);
      const result = await runSwapIncrementalBatch(pid);
      info.lastRunAt = new Date().toISOString();
      info.runsCompleted++;
      
      if (result.status === 'complete' && result.blocksRemaining === 0) {
        console.log(`[PoolSwapIndexer] Pool ${pid} swap indexer is fully synced`);
      }
    } catch (err) {
      console.error(`[PoolSwapIndexer] Auto-run error for pool ${pid}:`, err.message);
    }
  }, intervalMs);
  
  return { 
    status: 'started', 
    pid, 
    intervalMs,
    startedAt: info.startedAt,
  };
}

export function stopSwapAutoRun(pid) {
  const key = `swaps_${pid}`;
  const info = autoRunIntervals.get(key);
  
  if (!info) {
    console.log(`[PoolSwapIndexer] No swap auto-run active for pool ${pid}`);
    return { status: 'not_running', pid };
  }
  
  clearInterval(info.interval);
  autoRunIntervals.delete(key);
  clearLiveProgress(pid);
  
  console.log(`[PoolSwapIndexer] Stopped swap auto-run for pool ${pid} (completed ${info.runsCompleted} runs)`);
  
  return { 
    status: 'stopped', 
    pid,
    runsCompleted: info.runsCompleted,
    startedAt: info.startedAt,
    stoppedAt: new Date().toISOString(),
  };
}

export function stopAllSwapAutoRuns() {
  const stopped = [];
  
  for (const [key, info] of autoRunIntervals.entries()) {
    if (key.startsWith('swaps_')) {
      clearInterval(info.interval);
      const pid = parseInt(key.replace('swaps_', ''));
      stopped.push({ pid, runsCompleted: info.runsCompleted });
    }
  }
  
  for (const key of Array.from(autoRunIntervals.keys())) {
    if (key.startsWith('swaps_')) {
      autoRunIntervals.delete(key);
    }
  }
  
  console.log(`[PoolSwapIndexer] Stopped all swap auto-runs (${stopped.length} pools)`);
  return { status: 'all_stopped', stopped };
}
