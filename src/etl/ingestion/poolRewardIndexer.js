import { ethers } from 'ethers';
import { db } from '../../../server/db.js';
import { poolRewardEvents, poolEventIndexerProgress } from '../../../shared/schema.js';
import { eq, and, sql, desc } from 'drizzle-orm';

const DFK_CHAIN_RPC = 'https://subnets.avax.network/defi-kingdoms/dfk-chain/rpc';
const MASTER_GARDENER_V2 = '0xB04e8D6aED037904B77A9F0b08002592925833b7';

const DFK_GENESIS_BLOCK = 0;
const BLOCKS_PER_QUERY = 2000;
const INCREMENTAL_BATCH_SIZE = 10000;

const MASTER_GARDENER_ABI = [
  'event Harvest(address indexed user, uint256 indexed pid, uint256 amount)',
  'function getPoolLength() view returns (uint256)',
];

const liveProgress = new Map();

export function getRewardLiveProgress(pid) {
  return liveProgress.get(`rewards_${pid}`) || null;
}

export function getAllRewardLiveProgress() {
  const result = [];
  for (const [key, progress] of liveProgress.entries()) {
    if (key.startsWith('rewards_')) {
      const pid = parseInt(key.replace('rewards_', ''));
      result.push({ pid, ...progress });
    }
  }
  return result;
}

function updateLiveProgress(pid, updates) {
  const key = `rewards_${pid}`;
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
  liveProgress.delete(`rewards_${pid}`);
}

let providerInstance = null;
let gardenerContractInstance = null;

export function getProvider() {
  if (!providerInstance) {
    providerInstance = new ethers.JsonRpcProvider(DFK_CHAIN_RPC);
  }
  return providerInstance;
}

export function getGardenerContract() {
  if (!gardenerContractInstance) {
    gardenerContractInstance = new ethers.Contract(MASTER_GARDENER_V2, MASTER_GARDENER_ABI, getProvider());
  }
  return gardenerContractInstance;
}

export async function getLatestBlock() {
  const provider = getProvider();
  return provider.getBlockNumber();
}

export function getRewardIndexerName(pid) {
  return `rewards_pool_${pid}`;
}

export async function getRewardIndexerProgress(indexerName) {
  const [progress] = await db.select()
    .from(poolEventIndexerProgress)
    .where(eq(poolEventIndexerProgress.indexerName, indexerName))
    .limit(1);
  return progress;
}

export async function initRewardIndexerProgress(indexerName, pid, genesisBlock = DFK_GENESIS_BLOCK) {
  const existing = await getRewardIndexerProgress(indexerName);
  if (existing) return existing;
  
  await db.insert(poolEventIndexerProgress).values({
    indexerName,
    indexerType: 'rewards',
    pid,
    lpToken: MASTER_GARDENER_V2,
    lastIndexedBlock: genesisBlock,
    genesisBlock,
    status: 'idle',
    totalEventsIndexed: 0,
  });
  
  return getRewardIndexerProgress(indexerName);
}

export async function updateRewardIndexerProgress(indexerName, updates) {
  await db.update(poolEventIndexerProgress)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(poolEventIndexerProgress.indexerName, indexerName));
}

export async function getAllRewardIndexerProgress() {
  return db.select()
    .from(poolEventIndexerProgress)
    .where(eq(poolEventIndexerProgress.indexerType, 'rewards'))
    .orderBy(poolEventIndexerProgress.pid);
}

async function queryRewardEventsInChunks(contract, pid, fromBlock, toBlock, maxChunkSize = BLOCKS_PER_QUERY) {
  const allEvents = [];
  const filter = contract.filters.Harvest(null, pid);
  
  if (toBlock - fromBlock <= maxChunkSize) {
    try {
      return await contract.queryFilter(filter, fromBlock, toBlock);
    } catch (err) {
      console.error(`[PoolRewardIndexer] Error querying rewards ${fromBlock}-${toBlock}:`, err.message);
      return [];
    }
  }
  
  for (let start = fromBlock; start <= toBlock; start += maxChunkSize) {
    const end = Math.min(start + maxChunkSize - 1, toBlock);
    try {
      const events = await contract.queryFilter(filter, start, end);
      allEvents.push(...events);
    } catch (err) {
      console.error(`[PoolRewardIndexer] Error querying rewards ${start}-${end}:`, err.message);
    }
    await new Promise(r => setTimeout(r, 50));
  }
  
  return allEvents;
}

export async function indexPoolRewardEvents(pid, fromBlock, toBlock) {
  const contract = getGardenerContract();
  const events = await queryRewardEventsInChunks(contract, pid, fromBlock, toBlock);
  return events;
}

export async function saveRewardEvents(pid, events) {
  if (!events || events.length === 0) return { saved: 0 };
  
  const provider = getProvider();
  let saved = 0;
  
  for (const event of events) {
    try {
      const block = await provider.getBlock(event.blockNumber);
      const timestamp = block ? new Date(block.timestamp * 1000) : new Date();
      
      await db.insert(poolRewardEvents).values({
        pid,
        blockNumber: event.blockNumber,
        txHash: event.transactionHash,
        logIndex: event.index,
        user: event.args.user.toLowerCase(),
        rewardAmount: ethers.formatEther(event.args.amount),
        timestamp,
      }).onConflictDoNothing();
      saved++;
    } catch (err) {
      if (!err.message.includes('duplicate') && !err.message.includes('unique constraint')) {
        console.error(`[PoolRewardIndexer] Error saving reward event:`, err.message);
      }
    }
    await new Promise(r => setTimeout(r, 10));
  }
  
  return { saved };
}

const runningWorkers = new Map();

export function isRewardWorkerRunning(indexerName) {
  return runningWorkers.get(indexerName) === true;
}

export async function runRewardIncrementalBatch(pid, options = {}) {
  const {
    batchSize = INCREMENTAL_BATCH_SIZE,
  } = options;
  
  const indexerName = getRewardIndexerName(pid);
  
  if (runningWorkers.get(indexerName)) {
    console.log(`[PoolRewardIndexer] Indexer ${indexerName} already running, skipping...`);
    return { status: 'already_running' };
  }
  
  runningWorkers.set(indexerName, true);
  const startTime = Date.now();
  
  try {
    let progress = await initRewardIndexerProgress(indexerName, pid);
    const latestBlock = await getLatestBlock();
    
    const startBlock = progress.lastIndexedBlock;
    const endBlock = Math.min(startBlock + batchSize, latestBlock);
    
    const existingLive = getRewardLiveProgress(pid);
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
    
    console.log(`[PoolRewardIndexer] Pool ${pid}: Indexing rewards from blocks ${startBlock} to ${endBlock} (${endBlock - startBlock} blocks)`);
    
    await updateRewardIndexerProgress(indexerName, { status: 'running' });
    
    const events = await indexPoolRewardEvents(pid, startBlock, endBlock);
    console.log(`[PoolRewardIndexer] Pool ${pid}: Found ${events.length} reward events`);
    
    const { saved } = await saveRewardEvents(pid, events);
    
    const runtimeMs = Date.now() - startTime;
    const totalEventsIndexed = (progress.totalEventsIndexed || 0) + events.length;
    
    await updateRewardIndexerProgress(indexerName, {
      lastIndexedBlock: endBlock,
      totalEventsIndexed,
      status: endBlock >= latestBlock ? 'complete' : 'idle',
    });
    
    const currentLive = getRewardLiveProgress(pid);
    const caughtUp = endBlock >= latestBlock;
    updateLiveProgress(pid, {
      isRunning: isRewardAutoRunning(pid) && !caughtUp,
      currentBlock: endBlock,
      targetBlock: latestBlock,
      totalEventsFound: totalEventsIndexed,
      batchesCompleted: (currentLive?.batchesCompleted || 0) + 1,
      lastBatchAt: new Date().toISOString(),
      lastBatchEventsFound: events.length,
      percentComplete: caughtUp ? 100 : undefined,
      completedAt: caughtUp ? new Date().toISOString() : currentLive?.completedAt,
    });
    
    console.log(`[PoolRewardIndexer] Pool ${pid}: Complete. ${events.length} rewards found, ${saved} saved in ${(runtimeMs / 1000).toFixed(1)}s`);
    
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
    console.error(`[PoolRewardIndexer] Pool ${pid} error:`, error);
    
    await updateRewardIndexerProgress(indexerName, {
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

export async function getRewardEventsForPool(pid, limit = 100) {
  return db.select()
    .from(poolRewardEvents)
    .where(eq(poolRewardEvents.pid, pid))
    .orderBy(desc(poolRewardEvents.blockNumber))
    .limit(limit);
}

export async function getRewardEventCountForPool(pid, sinceTimestamp) {
  const result = await db.select({ count: sql`count(*)::int` })
    .from(poolRewardEvents)
    .where(and(
      eq(poolRewardEvents.pid, pid),
      sql`${poolRewardEvents.timestamp} >= ${sinceTimestamp}`
    ));
  return result[0]?.count || 0;
}

export async function getRewardsSumForPool(pid, sinceTimestamp) {
  const result = await db.select({ 
    sum: sql`COALESCE(SUM(${poolRewardEvents.rewardAmount}::numeric), 0)::text`
  })
    .from(poolRewardEvents)
    .where(and(
      eq(poolRewardEvents.pid, pid),
      sql`${poolRewardEvents.timestamp} >= ${sinceTimestamp}`
    ));
  return result[0]?.sum || '0';
}

export async function resetRewardIndexerProgress(pid) {
  const indexerName = getRewardIndexerName(pid);
  
  await db.delete(poolEventIndexerProgress)
    .where(eq(poolEventIndexerProgress.indexerName, indexerName));
  
  await db.delete(poolRewardEvents)
    .where(eq(poolRewardEvents.pid, pid));
  
  console.log(`[PoolRewardIndexer] Reset reward indexer for pool ${pid}`);
  return { reset: true };
}

const autoRunIntervals = new Map();

export function isRewardAutoRunning(pid) {
  return autoRunIntervals.has(`rewards_${pid}`);
}

export function getRewardAutoRunStatus() {
  const status = [];
  for (const [key, info] of autoRunIntervals.entries()) {
    if (key.startsWith('rewards_')) {
      const pid = parseInt(key.replace('rewards_', ''));
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

export function startRewardAutoRun(pid, intervalMs = 5 * 60 * 1000) {
  const key = `rewards_${pid}`;
  if (autoRunIntervals.has(key)) {
    console.log(`[PoolRewardIndexer] Auto-run already running for pool ${pid}`);
    return { status: 'already_running', pid };
  }
  
  console.log(`[PoolRewardIndexer] Starting reward auto-run for pool ${pid} (interval: ${intervalMs / 1000}s)`);
  
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
      console.log(`[PoolRewardIndexer] Reward auto-run initial batch for pool ${pid}`);
      await runRewardIncrementalBatch(pid);
      info.lastRunAt = new Date().toISOString();
      info.runsCompleted++;
    } catch (err) {
      console.error(`[PoolRewardIndexer] Auto-run initial error for pool ${pid}:`, err.message);
    }
  })();
  
  info.interval = setInterval(async () => {
    if (!autoRunIntervals.has(key)) {
      return;
    }
    try {
      console.log(`[PoolRewardIndexer] Reward auto-run batch for pool ${pid}`);
      const result = await runRewardIncrementalBatch(pid);
      info.lastRunAt = new Date().toISOString();
      info.runsCompleted++;
      
      if (result.status === 'complete' && result.blocksRemaining === 0) {
        console.log(`[PoolRewardIndexer] Pool ${pid} reward indexer is fully synced`);
      }
    } catch (err) {
      console.error(`[PoolRewardIndexer] Auto-run error for pool ${pid}:`, err.message);
    }
  }, intervalMs);
  
  return { 
    status: 'started', 
    pid, 
    intervalMs,
    startedAt: info.startedAt,
  };
}

export function stopRewardAutoRun(pid) {
  const key = `rewards_${pid}`;
  const info = autoRunIntervals.get(key);
  
  if (!info) {
    console.log(`[PoolRewardIndexer] No reward auto-run active for pool ${pid}`);
    return { status: 'not_running', pid };
  }
  
  clearInterval(info.interval);
  autoRunIntervals.delete(key);
  clearLiveProgress(pid);
  
  console.log(`[PoolRewardIndexer] Stopped reward auto-run for pool ${pid} (completed ${info.runsCompleted} runs)`);
  
  return { 
    status: 'stopped', 
    pid,
    runsCompleted: info.runsCompleted,
    startedAt: info.startedAt,
    stoppedAt: new Date().toISOString(),
  };
}

export function stopAllRewardAutoRuns() {
  const stopped = [];
  
  for (const [key, info] of autoRunIntervals.entries()) {
    if (key.startsWith('rewards_')) {
      clearInterval(info.interval);
      const pid = parseInt(key.replace('rewards_', ''));
      stopped.push({ pid, runsCompleted: info.runsCompleted });
    }
  }
  
  for (const key of Array.from(autoRunIntervals.keys())) {
    if (key.startsWith('rewards_')) {
      autoRunIntervals.delete(key);
    }
  }
  
  console.log(`[PoolRewardIndexer] Stopped all reward auto-runs (${stopped.length} pools)`);
  return { status: 'all_stopped', stopped };
}
