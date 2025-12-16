import { ethers } from 'ethers';
import { db } from '../../../server/db.js';
import { poolStakers, poolSwapEvents, poolRewardEvents, poolEventIndexerProgress } from '../../../shared/schema.js';
import { eq, and, sql, desc } from 'drizzle-orm';

const DFK_CHAIN_RPC = 'https://subnets.avax.network/defi-kingdoms/dfk-chain/rpc';
const MASTER_GARDENER_V2 = '0xB04e8D6aED037904B77A9F0b08002592925833b7';

const DFK_GENESIS_BLOCK = 0;
const BLOCKS_PER_QUERY = 2000;
const INCREMENTAL_BATCH_SIZE = 200000; // 200k blocks per batch for faster indexing
const AUTO_RUN_INTERVAL_MS = 60 * 1000; // 1 minute between batches
const WORKERS_PER_POOL = 3; // Number of parallel workers per pool

const MASTER_GARDENER_ABI = [
  'event Deposit(address indexed user, uint256 indexed pid, uint256 amount)',
  'event Withdraw(address indexed user, uint256 indexed pid, uint256 amount)',
  'event EmergencyWithdraw(address indexed user, uint256 indexed pid, uint256 amount)',
  'event Harvest(address indexed user, uint256 indexed pid, uint256 amount)',
  'function userInfo(uint256 pid, address user) view returns (uint256 amount, int256 rewardDebt, uint256 lastDepositTimestamp)',
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

const PROFILES_CONTRACT = '0xC4cD8C09D1A90b21Be417be91A81603B03993E81';
const PROFILES_ABI = [
  {
    inputs: [{ name: '', type: 'address' }],
    name: 'addressToProfile',
    outputs: [
      { name: 'owner', type: 'address' },
      { name: 'name', type: 'string' },
      { name: 'created', type: 'uint64' },
      { name: 'nftId', type: 'uint256' },
      { name: 'picId', type: 'uint8' },
      { name: 'heroId', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
];

const liveProgress = new Map();

// Generate key for a specific worker (workerId=0 for legacy single-worker mode)
function getWorkerKey(pid, workerId = 0) {
  return `unified_${pid}_w${workerId}`;
}

export function getUnifiedLiveProgress(pid, workerId = null) {
  // If workerId is specified, get that specific worker
  if (workerId !== null) {
    return liveProgress.get(getWorkerKey(pid, workerId)) || null;
  }
  // Otherwise return combined progress for all workers of this pool
  const workers = [];
  for (let w = 0; w < WORKERS_PER_POOL; w++) {
    const progress = liveProgress.get(getWorkerKey(pid, w));
    if (progress) workers.push({ workerId: w, ...progress });
  }
  // Also check legacy key (for backward compatibility)
  const legacy = liveProgress.get(`unified_${pid}`);
  if (legacy && workers.length === 0) {
    return legacy;
  }
  if (workers.length === 0) return null;
  
  // Aggregate worker progress
  const aggregated = {
    isRunning: workers.some(w => w.isRunning),
    currentBlock: Math.max(...workers.map(w => w.currentBlock || 0)),
    targetBlock: Math.max(...workers.map(w => w.targetBlock || 0)),
    genesisBlock: Math.min(...workers.map(w => w.genesisBlock || 0)),
    stakersFound: workers.reduce((sum, w) => sum + (w.stakersFound || 0), 0),
    swapsFound: workers.reduce((sum, w) => sum + (w.swapsFound || 0), 0),
    rewardsFound: workers.reduce((sum, w) => sum + (w.rewardsFound || 0), 0),
    batchesCompleted: workers.reduce((sum, w) => sum + (w.batchesCompleted || 0), 0),
    startedAt: workers[0]?.startedAt,
    lastBatchAt: workers.map(w => w.lastBatchAt).filter(Boolean).sort().pop() || null,
    percentComplete: workers.reduce((sum, w) => sum + (w.percentComplete || 0), 0) / workers.length,
    completedAt: workers.every(w => w.completedAt) ? workers.map(w => w.completedAt).sort().pop() : null,
    workers,
  };
  return aggregated;
}

export function getAllUnifiedLiveProgress() {
  const result = [];
  // Group by pool ID
  const poolIds = new Set();
  for (const key of liveProgress.keys()) {
    const match = key.match(/unified_(\d+)(?:_w\d+)?$/);
    if (match) poolIds.add(parseInt(match[1]));
  }
  for (const pid of Array.from(poolIds).sort((a, b) => a - b)) {
    const progress = getUnifiedLiveProgress(pid);
    if (progress) result.push({ pid, ...progress });
  }
  return result;
}

function updateLiveProgress(pid, updates, workerId = 0) {
  const key = getWorkerKey(pid, workerId);
  const current = liveProgress.get(key) || {
    isRunning: false,
    currentBlock: 0,
    targetBlock: 0,
    genesisBlock: 0,
    rangeStart: 0,
    rangeEnd: 0,
    stakersFound: 0,
    swapsFound: 0,
    rewardsFound: 0,
    batchesCompleted: 0,
    startedAt: null,
    lastBatchAt: null,
    percentComplete: 0,
    completedAt: null,
    workerId,
  };
  const updated = { ...current, ...updates, workerId };
  // Calculate percent complete within this worker's assigned range
  if (updates.percentComplete === undefined && updated.rangeEnd > updated.rangeStart) {
    const totalBlocks = updated.rangeEnd - updated.rangeStart;
    const indexedBlocks = updated.currentBlock - updated.rangeStart;
    updated.percentComplete = Math.min(100, Math.max(0, (indexedBlocks / totalBlocks) * 100));
  }
  liveProgress.set(key, updated);
  return updated;
}

function clearLiveProgress(pid, workerId = null) {
  if (workerId !== null) {
    liveProgress.delete(getWorkerKey(pid, workerId));
  } else {
    // Clear all workers for this pool
    for (let w = 0; w < WORKERS_PER_POOL; w++) {
      liveProgress.delete(getWorkerKey(pid, w));
    }
    // Also clear legacy key
    liveProgress.delete(`unified_${pid}`);
  }
}

let providerInstance = null;
let gardenerContractInstance = null;
let profilesContractInstance = null;
const lpContractCache = new Map();

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

export function getProfilesContract() {
  if (!profilesContractInstance) {
    profilesContractInstance = new ethers.Contract(PROFILES_CONTRACT, PROFILES_ABI, getProvider());
  }
  return profilesContractInstance;
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
    const contract = getGardenerContract();
    const poolInfo = await contract.getPoolInfo(pid);
    return poolInfo.lpToken;
  } catch (err) {
    console.error(`[UnifiedIndexer] Error getting LP token for pool ${pid}:`, err.message);
    return null;
  }
}

export async function getSummonerName(walletAddress) {
  try {
    const contract = getProfilesContract();
    const profile = await contract.addressToProfile(walletAddress);
    return profile.name && profile.name.length > 0 ? profile.name : null;
  } catch (err) {
    return null;
  }
}

export async function batchGetSummonerNames(walletAddresses, batchSize = 10) {
  const results = new Map();
  
  for (let i = 0; i < walletAddresses.length; i += batchSize) {
    const batch = walletAddresses.slice(i, i + batchSize);
    
    const batchResults = await Promise.all(
      batch.map(async (addr) => {
        const name = await getSummonerName(addr);
        return { addr: addr.toLowerCase(), name };
      })
    );
    
    for (const { addr, name } of batchResults) {
      results.set(addr, name);
    }
    
    await new Promise(r => setTimeout(r, 50));
  }
  
  return results;
}

export async function getCurrentStakedBalance(pid, wallet) {
  try {
    const contract = getGardenerContract();
    const userInfo = await contract.userInfo(pid, wallet);
    return ethers.formatEther(userInfo.amount);
  } catch (err) {
    console.error(`[UnifiedIndexer] Error getting userInfo for ${wallet}:`, err.message);
    return '0';
  }
}

export function getUnifiedIndexerName(pid, workerId = null) {
  if (workerId !== null && workerId > 0) {
    return `unified_pool_${pid}_w${workerId}`;
  }
  return `unified_pool_${pid}`;
}

export async function getUnifiedIndexerProgress(indexerName) {
  const [progress] = await db.select()
    .from(poolEventIndexerProgress)
    .where(eq(poolEventIndexerProgress.indexerName, indexerName))
    .limit(1);
  return progress;
}

export async function initUnifiedIndexerProgress(indexerName, pid, lpToken, genesisBlock = DFK_GENESIS_BLOCK, rangeEnd = null) {
  const existing = await getUnifiedIndexerProgress(indexerName);
  if (existing) return existing;
  
  await db.insert(poolEventIndexerProgress).values({
    indexerName,
    indexerType: 'unified',
    pid,
    lpToken,
    lastIndexedBlock: genesisBlock,
    genesisBlock,
    rangeEnd: rangeEnd || null, // Worker's assigned end block (null = track to latest)
    status: 'idle',
    totalEventsIndexed: 0,
  });
  
  return getUnifiedIndexerProgress(indexerName);
}

export async function updateUnifiedIndexerProgress(indexerName, updates) {
  await db.update(poolEventIndexerProgress)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(poolEventIndexerProgress.indexerName, indexerName));
}

export async function getAllUnifiedIndexerProgress() {
  return db.select()
    .from(poolEventIndexerProgress)
    .where(eq(poolEventIndexerProgress.indexerType, 'unified'))
    .orderBy(poolEventIndexerProgress.pid);
}

async function queryEventsInChunks(contract, filter, fromBlock, toBlock, maxChunkSize = BLOCKS_PER_QUERY) {
  const allEvents = [];
  
  if (toBlock - fromBlock <= maxChunkSize) {
    try {
      return await contract.queryFilter(filter, fromBlock, toBlock);
    } catch (err) {
      console.error(`[UnifiedIndexer] Error querying events ${fromBlock}-${toBlock}:`, err.message);
      return [];
    }
  }
  
  for (let start = fromBlock; start <= toBlock; start += maxChunkSize) {
    const end = Math.min(start + maxChunkSize - 1, toBlock);
    try {
      const events = await contract.queryFilter(filter, start, end);
      allEvents.push(...events);
    } catch (err) {
      console.error(`[UnifiedIndexer] Error querying events ${start}-${end}:`, err.message);
    }
    await new Promise(r => setTimeout(r, 50));
  }
  
  return allEvents;
}

export async function indexAllPoolEvents(pid, lpToken, fromBlock, toBlock) {
  const gardenerContract = getGardenerContract();
  const lpContract = getLPContract(lpToken);
  
  const [depositEvents, withdrawEvents, emergencyEvents, harvestEvents, swapEvents] = await Promise.all([
    queryEventsInChunks(gardenerContract, gardenerContract.filters.Deposit(null, pid), fromBlock, toBlock),
    queryEventsInChunks(gardenerContract, gardenerContract.filters.Withdraw(null, pid), fromBlock, toBlock),
    queryEventsInChunks(gardenerContract, gardenerContract.filters.EmergencyWithdraw(null, pid), fromBlock, toBlock),
    queryEventsInChunks(gardenerContract, gardenerContract.filters.Harvest(null, pid), fromBlock, toBlock),
    queryEventsInChunks(lpContract, lpContract.filters.Swap(), fromBlock, toBlock),
  ]);
  
  return {
    deposits: depositEvents.map(e => ({ ...e, eventType: 'Deposit' })),
    withdraws: withdrawEvents.map(e => ({ ...e, eventType: 'Withdraw' })),
    emergencyWithdraws: emergencyEvents.map(e => ({ ...e, eventType: 'EmergencyWithdraw' })),
    harvests: harvestEvents,
    swaps: swapEvents,
  };
}

async function saveStakerUpdates(pid, stakerUpdates) {
  if (!stakerUpdates || stakerUpdates.length === 0) return { upserted: 0 };
  
  let upserted = 0;
  
  for (const staker of stakerUpdates) {
    try {
      await db.insert(poolStakers).values({
        wallet: staker.wallet.toLowerCase(),
        pid,
        stakedLP: staker.stakedLP,
        summonerName: staker.summonerName || null,
        lastActivityType: staker.lastActivityType,
        lastActivityAmount: staker.lastActivityAmount,
        lastActivityBlock: staker.lastActivityBlock,
        lastActivityTxHash: staker.lastActivityTxHash,
      }).onConflictDoUpdate({
        target: [poolStakers.wallet, poolStakers.pid],
        set: {
          stakedLP: staker.stakedLP,
          summonerName: staker.summonerName || sql`${poolStakers.summonerName}`,
          lastActivityType: staker.lastActivityType,
          lastActivityAmount: staker.lastActivityAmount,
          lastActivityBlock: staker.lastActivityBlock,
          lastActivityTxHash: staker.lastActivityTxHash,
          lastUpdatedAt: new Date(),
        },
      });
      upserted++;
    } catch (err) {
      console.error(`[UnifiedIndexer] Error upserting staker ${staker.wallet}:`, err.message);
    }
  }
  
  return { upserted };
}

async function saveSwapEvents(pid, lpToken, events) {
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
        console.error(`[UnifiedIndexer] Error saving swap event:`, err.message);
      }
    }
    await new Promise(r => setTimeout(r, 10));
  }
  
  return { saved };
}

async function saveRewardEvents(pid, events) {
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
        console.error(`[UnifiedIndexer] Error saving reward event:`, err.message);
      }
    }
    await new Promise(r => setTimeout(r, 10));
  }
  
  return { saved };
}

const runningWorkers = new Map();

export function isUnifiedWorkerRunning(indexerName) {
  return runningWorkers.get(indexerName) === true;
}

export async function runUnifiedIncrementalBatch(pid, options = {}) {
  const {
    batchSize = INCREMENTAL_BATCH_SIZE,
    lookupSummonerNames = true,
    workerId = 0,
    rangeStart = null, // Worker's assigned start block
    rangeEnd = null,   // Worker's assigned end block (null = track to latest)
  } = options;
  
  const indexerName = getUnifiedIndexerName(pid, workerId);
  
  if (runningWorkers.get(indexerName)) {
    console.log(`[UnifiedIndexer] Indexer ${indexerName} already running, skipping...`);
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
    
    // Worker's genesis is either specified rangeStart or default
    const workerGenesisBlock = rangeStart !== null ? rangeStart : DFK_GENESIS_BLOCK;
    let progress = await initUnifiedIndexerProgress(indexerName, pid, lpToken, workerGenesisBlock, rangeEnd);
    const latestBlock = await getLatestBlock();
    
    // Worker's target is either its assigned rangeEnd or latest block
    const workerTargetBlock = (progress.rangeEnd !== null && progress.rangeEnd !== undefined) 
      ? Math.min(progress.rangeEnd, latestBlock) 
      : latestBlock;
    
    const startBlock = progress.lastIndexedBlock;
    const endBlock = Math.min(startBlock + batchSize, workerTargetBlock);
    
    const existingLive = getUnifiedLiveProgress(pid, workerId);
    const dbGenesisBlock = progress.genesisBlock || 0;
    updateLiveProgress(pid, {
      isRunning: true,
      currentBlock: startBlock,
      targetBlock: workerTargetBlock,
      genesisBlock: dbGenesisBlock,
      rangeStart: workerGenesisBlock,
      rangeEnd: workerTargetBlock,
      stakersFound: existingLive?.stakersFound || 0,
      swapsFound: existingLive?.swapsFound || 0,
      rewardsFound: existingLive?.rewardsFound || 0,
      batchesCompleted: existingLive?.batchesCompleted || 0,
      startedAt: existingLive?.startedAt || new Date().toISOString(),
      lastBatchAt: null,
    }, workerId);
    
    if (startBlock >= workerTargetBlock) {
      runningWorkers.set(indexerName, false);
      updateLiveProgress(pid, { 
        isRunning: false, 
        currentBlock: workerTargetBlock,
        targetBlock: workerTargetBlock,
        percentComplete: 100,
        completedAt: new Date().toISOString(),
      }, workerId);
      return {
        status: 'complete',
        message: workerId > 0 ? `Worker ${workerId} reached assigned range end` : 'Already at latest block',
        startBlock,
        endBlock: startBlock,
        latestBlock,
        workerTargetBlock,
        workerId,
        runtimeMs: Date.now() - startTime,
      };
    }
    
    const workerLabel = workerId > 0 ? ` (w${workerId})` : '';
    console.log(`[UnifiedIndexer] Pool ${pid}${workerLabel}: Indexing blocks ${startBlock} to ${endBlock} (${endBlock - startBlock} blocks)`);
    
    await updateUnifiedIndexerProgress(indexerName, { status: 'running' });
    
    const events = await indexAllPoolEvents(pid, lpToken, startBlock, endBlock);
    
    const stakerEvents = [...events.deposits, ...events.withdraws, ...events.emergencyWithdraws];
    const walletLastActivity = new Map();
    
    for (const event of stakerEvents) {
      const wallet = event.args.user.toLowerCase();
      const existing = walletLastActivity.get(wallet);
      
      if (!existing || event.blockNumber > existing.blockNumber) {
        walletLastActivity.set(wallet, {
          wallet,
          eventType: event.eventType,
          amount: ethers.formatEther(event.args.amount),
          blockNumber: event.blockNumber,
          txHash: event.transactionHash,
        });
      }
    }
    
    const wallets = Array.from(walletLastActivity.keys());
    
    let summonerNames = new Map();
    if (lookupSummonerNames && wallets.length > 0) {
      console.log(`[UnifiedIndexer] Pool ${pid}: Looking up summoner names for ${wallets.length} wallets...`);
      summonerNames = await batchGetSummonerNames(wallets, 10);
    }
    
    const stakerUpdates = [];
    for (const wallet of wallets) {
      const currentBalance = await getCurrentStakedBalance(pid, wallet);
      const activity = walletLastActivity.get(wallet);
      
      stakerUpdates.push({
        wallet,
        stakedLP: currentBalance,
        summonerName: summonerNames.get(wallet) || null,
        lastActivityType: activity.eventType,
        lastActivityAmount: activity.amount,
        lastActivityBlock: activity.blockNumber,
        lastActivityTxHash: activity.txHash,
      });
      
      await new Promise(r => setTimeout(r, 20));
    }
    
    const [stakerResult, swapResult, rewardResult] = await Promise.all([
      saveStakerUpdates(pid, stakerUpdates),
      saveSwapEvents(pid, lpToken, events.swaps),
      saveRewardEvents(pid, events.harvests),
    ]);
    
    const runtimeMs = Date.now() - startTime;
    const totalEvents = stakerEvents.length + events.swaps.length + events.harvests.length;
    const totalEventsIndexed = (progress.totalEventsIndexed || 0) + totalEvents;
    
    const uniqueStakersResult = await db.select({ count: sql`count(*)::int` })
      .from(poolStakers)
      .where(and(
        eq(poolStakers.pid, pid),
        sql`CAST(${poolStakers.stakedLP} AS NUMERIC) > 0`
      ));
    const totalStakers = uniqueStakersResult[0]?.count || 0;
    
    await updateUnifiedIndexerProgress(indexerName, {
      lastIndexedBlock: endBlock,
      totalEventsIndexed,
      status: endBlock >= latestBlock ? 'complete' : 'idle',
    });
    
    const currentLive = getUnifiedLiveProgress(pid, workerId);
    const workerTarget = (progress.rangeEnd !== null && progress.rangeEnd !== undefined) 
      ? Math.min(progress.rangeEnd, latestBlock) 
      : latestBlock;
    const caughtUp = endBlock >= workerTarget;
    updateLiveProgress(pid, {
      isRunning: isUnifiedAutoRunning(pid, workerId) && !caughtUp,
      currentBlock: endBlock,
      targetBlock: workerTarget,
      stakersFound: (currentLive?.stakersFound || 0) + stakerResult.upserted,
      swapsFound: (currentLive?.swapsFound || 0) + swapResult.saved,
      rewardsFound: (currentLive?.rewardsFound || 0) + rewardResult.saved,
      batchesCompleted: (currentLive?.batchesCompleted || 0) + 1,
      lastBatchAt: new Date().toISOString(),
      percentComplete: caughtUp ? 100 : undefined,
      completedAt: caughtUp ? new Date().toISOString() : currentLive?.completedAt,
    }, workerId);
    
    console.log(`[UnifiedIndexer] Pool ${pid}${workerLabel}: ${stakerEvents.length} staker events, ${events.swaps.length} swaps, ${events.harvests.length} rewards in ${(runtimeMs / 1000).toFixed(1)}s`);
    
    runningWorkers.set(indexerName, false);
    
    return {
      status: 'success',
      pid,
      startBlock,
      endBlock,
      latestBlock,
      blocksRemaining: latestBlock - endBlock,
      stakerEvents: stakerEvents.length,
      stakersUpdated: stakerResult.upserted,
      totalActiveStakers: totalStakers,
      swapsFound: events.swaps.length,
      swapsSaved: swapResult.saved,
      rewardsFound: events.harvests.length,
      rewardsSaved: rewardResult.saved,
      runtimeMs,
    };
  } catch (error) {
    runningWorkers.set(indexerName, false);
    const workerLabel = workerId > 0 ? ` (w${workerId})` : '';
    console.error(`[UnifiedIndexer] Pool ${pid}${workerLabel} error:`, error);
    
    await updateUnifiedIndexerProgress(indexerName, {
      status: 'error',
      lastError: error.message,
    });
    
    updateLiveProgress(pid, {
      isRunning: false,
      lastError: error.message,
    }, workerId);
    
    return {
      status: 'error',
      error: error.message,
      workerId,
      runtimeMs: Date.now() - startTime,
    };
  }
}

export async function getPoolStakersFromDB(pid, limit = 500) {
  return db.select()
    .from(poolStakers)
    .where(eq(poolStakers.pid, pid))
    .orderBy(desc(poolStakers.stakedLP))
    .limit(limit);
}

export async function getActivePoolStakersFromDB(pid, limit = 500) {
  return db.select()
    .from(poolStakers)
    .where(and(
      eq(poolStakers.pid, pid),
      sql`CAST(${poolStakers.stakedLP} AS NUMERIC) > 0`
    ))
    .orderBy(desc(poolStakers.stakedLP))
    .limit(limit);
}

export async function updateSummonerNamesForPool(pid, batchSize = 50) {
  console.log(`[UnifiedIndexer] Updating summoner names for pool ${pid}...`);
  
  const stakers = await db.select()
    .from(poolStakers)
    .where(and(
      eq(poolStakers.pid, pid),
      sql`${poolStakers.summonerName} IS NULL`,
      sql`CAST(${poolStakers.stakedLP} AS NUMERIC) > 0`
    ))
    .limit(batchSize);
  
  if (stakers.length === 0) {
    console.log(`[UnifiedIndexer] No stakers without summoner names for pool ${pid}`);
    return { updated: 0 };
  }
  
  const wallets = stakers.map(s => s.wallet);
  const names = await batchGetSummonerNames(wallets, 10);
  
  let updated = 0;
  for (const staker of stakers) {
    const name = names.get(staker.wallet);
    if (name) {
      await db.update(poolStakers)
        .set({ summonerName: name, lastUpdatedAt: new Date() })
        .where(and(
          eq(poolStakers.wallet, staker.wallet),
          eq(poolStakers.pid, pid)
        ));
      updated++;
    }
  }
  
  console.log(`[UnifiedIndexer] Updated ${updated} summoner names for pool ${pid}`);
  return { updated, checked: stakers.length };
}

export async function resetUnifiedIndexerProgress(pid) {
  // Delete progress for all workers of this pool
  for (let w = 0; w < WORKERS_PER_POOL; w++) {
    const indexerName = getUnifiedIndexerName(pid, w);
    await db.delete(poolEventIndexerProgress)
      .where(eq(poolEventIndexerProgress.indexerName, indexerName));
  }
  // Also delete legacy single-worker progress
  const legacyName = getUnifiedIndexerName(pid, null);
  await db.delete(poolEventIndexerProgress)
    .where(eq(poolEventIndexerProgress.indexerName, legacyName));
  
  await db.delete(poolStakers)
    .where(eq(poolStakers.pid, pid));
  
  await db.delete(poolSwapEvents)
    .where(eq(poolSwapEvents.pid, pid));
  
  await db.delete(poolRewardEvents)
    .where(eq(poolRewardEvents.pid, pid));
  
  clearLiveProgress(pid);
  
  console.log(`[UnifiedIndexer] Reset unified indexer for pool ${pid} (all workers)`);
  return { reset: true };
}

const autoRunIntervals = new Map();

// Generate key for auto-run interval map
function getAutoRunKey(pid, workerId = 0) {
  return `unified_${pid}_w${workerId}`;
}

export function isUnifiedAutoRunning(pid, workerId = null) {
  if (workerId !== null) {
    return autoRunIntervals.has(getAutoRunKey(pid, workerId));
  }
  // Check if any worker is running for this pool
  for (let w = 0; w < WORKERS_PER_POOL; w++) {
    if (autoRunIntervals.has(getAutoRunKey(pid, w))) return true;
  }
  return false;
}

export function getUnifiedAutoRunStatus() {
  const status = [];
  for (const [key, info] of autoRunIntervals.entries()) {
    const match = key.match(/unified_(\d+)_w(\d+)/);
    if (match) {
      status.push({
        pid: parseInt(match[1]),
        workerId: parseInt(match[2]),
        intervalMs: info.intervalMs,
        startedAt: info.startedAt,
        lastRunAt: info.lastRunAt,
        runsCompleted: info.runsCompleted,
        rangeStart: info.rangeStart,
        rangeEnd: info.rangeEnd,
      });
    }
  }
  return status.sort((a, b) => a.pid === b.pid ? a.workerId - b.workerId : a.pid - b.pid);
}

// Start a single worker for a pool with specific block range
export async function startUnifiedWorkerAutoRun(pid, workerId, rangeStart, rangeEnd, intervalMs = AUTO_RUN_INTERVAL_MS) {
  const key = getAutoRunKey(pid, workerId);
  if (autoRunIntervals.has(key)) {
    console.log(`[UnifiedIndexer] Worker ${workerId} already running for pool ${pid}`);
    return { status: 'already_running', pid, workerId };
  }
  
  const workerLabel = `pool ${pid} worker ${workerId}`;
  console.log(`[UnifiedIndexer] Starting ${workerLabel} (blocks ${rangeStart}-${rangeEnd || 'latest'}, interval: ${intervalMs / 1000}s)`);
  
  clearLiveProgress(pid, workerId);
  
  const info = {
    intervalMs,
    workerId,
    rangeStart,
    rangeEnd,
    startedAt: new Date().toISOString(),
    lastRunAt: null,
    runsCompleted: 0,
    interval: null,
  };
  
  autoRunIntervals.set(key, info);
  
  // Calculate offset to stagger workers (distributes 42 workers across the interval period)
  // Each worker starts at a different time offset to avoid RPC saturation
  const workerIndex = pid * WORKERS_PER_POOL + workerId; // 0-41
  const offsetMs = Math.floor((workerIndex / 42) * intervalMs); // Spread evenly
  
  // Run initial batch with offset delay
  (async () => {
    try {
      // Wait for offset before initial batch
      if (offsetMs > 0) {
        await new Promise(r => setTimeout(r, offsetMs));
      }
      console.log(`[UnifiedIndexer] Initial batch for ${workerLabel} (offset ${(offsetMs/1000).toFixed(1)}s)`);
      await runUnifiedIncrementalBatch(pid, { workerId, rangeStart, rangeEnd });
      info.lastRunAt = new Date().toISOString();
      info.runsCompleted++;
    } catch (err) {
      console.error(`[UnifiedIndexer] Initial error for ${workerLabel}:`, err.message);
    }
  })();
  
  // Set up recurring batch with same offset
  info.interval = setInterval(async () => {
    if (!autoRunIntervals.has(key)) return;
    try {
      const result = await runUnifiedIncrementalBatch(pid, { workerId, rangeStart, rangeEnd });
      info.lastRunAt = new Date().toISOString();
      info.runsCompleted++;
      
      if (result.status === 'complete') {
        console.log(`[UnifiedIndexer] ${workerLabel} completed its range`);
      }
    } catch (err) {
      console.error(`[UnifiedIndexer] Error for ${workerLabel}:`, err.message);
    }
  }, intervalMs);
  
  return { status: 'started', pid, workerId, rangeStart, rangeEnd, intervalMs, offsetMs };
}

// Start all workers for a single pool (splits block range among WORKERS_PER_POOL workers)
export async function startPoolWorkersAutoRun(pid, intervalMs = AUTO_RUN_INTERVAL_MS) {
  const latestBlock = await getLatestBlock();
  const blocksPerWorker = Math.ceil(latestBlock / WORKERS_PER_POOL);
  
  console.log(`[UnifiedIndexer] Starting ${WORKERS_PER_POOL} workers for pool ${pid} (${blocksPerWorker.toLocaleString()} blocks each)`);
  
  const results = [];
  for (let w = 0; w < WORKERS_PER_POOL; w++) {
    const rangeStart = w * blocksPerWorker;
    // Last worker tracks to latest, others have fixed end
    const rangeEnd = (w === WORKERS_PER_POOL - 1) ? null : (w + 1) * blocksPerWorker;
    
    // Stagger worker starts by 500ms to avoid RPC burst
    await new Promise(r => setTimeout(r, 500));
    
    const result = await startUnifiedWorkerAutoRun(pid, w, rangeStart, rangeEnd, intervalMs);
    results.push(result);
  }
  
  const started = results.filter(r => r.status === 'started').length;
  return { status: 'pool_started', pid, workersStarted: started, results };
}

// Legacy single-worker start (for backward compatibility)
export function startUnifiedAutoRun(pid, intervalMs = AUTO_RUN_INTERVAL_MS) {
  return startUnifiedWorkerAutoRun(pid, 0, 0, null, intervalMs);
}

export function stopUnifiedAutoRun(pid, workerId = null) {
  const stopped = [];
  
  if (workerId !== null) {
    // Stop specific worker
    const key = getAutoRunKey(pid, workerId);
    const info = autoRunIntervals.get(key);
    if (info) {
      clearInterval(info.interval);
      autoRunIntervals.delete(key);
      clearLiveProgress(pid, workerId);
      stopped.push({ pid, workerId, runsCompleted: info.runsCompleted });
    }
  } else {
    // Stop all workers for this pool
    for (let w = 0; w < WORKERS_PER_POOL; w++) {
      const key = getAutoRunKey(pid, w);
      const info = autoRunIntervals.get(key);
      if (info) {
        clearInterval(info.interval);
        autoRunIntervals.delete(key);
        clearLiveProgress(pid, w);
        stopped.push({ pid, workerId: w, runsCompleted: info.runsCompleted });
      }
    }
  }
  
  if (stopped.length === 0) {
    console.log(`[UnifiedIndexer] No workers active for pool ${pid}`);
    return { status: 'not_running', pid };
  }
  
  console.log(`[UnifiedIndexer] Stopped ${stopped.length} workers for pool ${pid}`);
  return { status: 'stopped', pid, stopped };
}

export function stopAllUnifiedAutoRuns() {
  const stopped = [];
  
  for (const [key, info] of autoRunIntervals.entries()) {
    if (key.startsWith('unified_')) {
      clearInterval(info.interval);
      const match = key.match(/unified_(\d+)_w(\d+)/);
      if (match) {
        stopped.push({ pid: parseInt(match[1]), workerId: parseInt(match[2]), runsCompleted: info.runsCompleted });
      }
    }
  }
  
  for (const key of Array.from(autoRunIntervals.keys())) {
    if (key.startsWith('unified_')) {
      autoRunIntervals.delete(key);
    }
  }
  
  // Clear all live progress
  for (const pid of ALL_POOL_IDS) {
    clearLiveProgress(pid);
  }
  
  console.log(`[UnifiedIndexer] Stopped all auto-runs (${stopped.length} workers)`);
  return { status: 'all_stopped', stopped, totalWorkers: stopped.length };
}

// All known pool IDs (Master Gardener V2 pools)
const ALL_POOL_IDS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];

// Start all workers for all pools (14 pools × 3 workers = 42 total workers)
export async function startAllUnifiedAutoRun(intervalMs = AUTO_RUN_INTERVAL_MS) {
  const totalWorkers = ALL_POOL_IDS.length * WORKERS_PER_POOL;
  console.log(`[UnifiedIndexer] Starting ${totalWorkers} workers (${WORKERS_PER_POOL} per pool × ${ALL_POOL_IDS.length} pools)...`);
  
  const results = [];
  for (const pid of ALL_POOL_IDS) {
    const poolResult = await startPoolWorkersAutoRun(pid, intervalMs);
    results.push(poolResult);
    // Small delay between pools to spread RPC load
    await new Promise(r => setTimeout(r, 1000));
  }
  
  const started = results.reduce((sum, r) => sum + r.workersStarted, 0);
  
  console.log(`[UnifiedIndexer] Started ${started} workers across ${ALL_POOL_IDS.length} pools`);
  
  return {
    status: 'all_started',
    started,
    totalPools: ALL_POOL_IDS.length,
    workersPerPool: WORKERS_PER_POOL,
    results,
  };
}
