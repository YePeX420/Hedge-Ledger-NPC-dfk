import { ethers } from 'ethers';
import { db } from '../../../server/db.js';
import { poolStakersV1, poolRewardEventsV1, poolEventIndexerProgressV1 } from '../../../shared/schema.js';
import { eq, and, sql, desc } from 'drizzle-orm';

const DFK_CHAIN_RPC = 'https://subnets.avax.network/defi-kingdoms/dfk-chain/rpc';
const MASTER_GARDENER_V1 = '0x57dec9cc7f492d6583c773e2e7ad66dcdc6940fb'; // Legacy V1 Gardener

const DFK_GENESIS_BLOCK = 0;
const BLOCKS_PER_QUERY = 2000;
const INCREMENTAL_BATCH_SIZE = 200000;
const AUTO_RUN_INTERVAL_MS = 60 * 1000;
export const WORKERS_PER_POOL_V1 = 5;
export const MIN_WORKERS_PER_POOL_V1 = 3;

const poolWorkerCountsV1 = new Map();

const MASTER_GARDENER_V1_ABI = [
  'event Deposit(address indexed user, uint256 indexed pid, uint256 amount)',
  'event Withdraw(address indexed user, uint256 indexed pid, uint256 amount)',
  'event EmergencyWithdraw(address indexed user, uint256 indexed pid, uint256 amount)',
  'function userInfo(uint256 pid, address user) view returns (uint256 amount, uint256 rewardDebt)',
  'function poolInfo(uint256 pid) view returns (address lpToken, uint256 allocPoint, uint256 lastRewardBlock, uint256 accJewelPerShare)',
  'function poolLength() view returns (uint256)',
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

const liveProgressV1 = new Map();

function getWorkerKeyV1(pid, workerId = 0) {
  return `unified_v1_${pid}_w${workerId}`;
}

export function getUnifiedLiveProgressV1(pid, workerId = null) {
  if (workerId !== null) {
    return liveProgressV1.get(getWorkerKeyV1(pid, workerId)) || null;
  }
  const workers = [];
  for (let w = 0; w < WORKERS_PER_POOL_V1; w++) {
    const progress = liveProgressV1.get(getWorkerKeyV1(pid, w));
    if (progress) workers.push({ workerId: w, ...progress });
  }
  const legacy = liveProgressV1.get(`unified_v1_${pid}`);
  if (legacy && workers.length === 0) return legacy;
  if (workers.length === 0) return null;
  
  const aggregated = {
    isRunning: workers.some(w => w.isRunning),
    currentBlock: Math.max(...workers.map(w => w.currentBlock || 0)),
    targetBlock: Math.max(...workers.map(w => w.targetBlock || 0)),
    genesisBlock: Math.min(...workers.map(w => w.genesisBlock || 0)),
    stakersFound: workers.reduce((sum, w) => sum + (w.stakersFound || 0), 0),
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

export function getAllUnifiedLiveProgressV1() {
  const result = [];
  const poolIds = new Set();
  for (const key of liveProgressV1.keys()) {
    const match = key.match(/unified_v1_(\d+)(?:_w\d+)?$/);
    if (match) poolIds.add(parseInt(match[1]));
  }
  for (const pid of Array.from(poolIds).sort((a, b) => a - b)) {
    const progress = getUnifiedLiveProgressV1(pid);
    if (progress) result.push({ pid, ...progress });
  }
  return result;
}

function updateLiveProgressV1(pid, updates, workerId = 0) {
  const key = getWorkerKeyV1(pid, workerId);
  const current = liveProgressV1.get(key) || {
    isRunning: false,
    currentBlock: 0,
    targetBlock: 0,
    genesisBlock: 0,
    rangeStart: 0,
    rangeEnd: 0,
    stakersFound: 0,
    rewardsFound: 0,
    batchesCompleted: 0,
    startedAt: null,
    lastBatchAt: null,
    percentComplete: 0,
    completedAt: null,
    workerId,
  };
  const updated = { ...current, ...updates, workerId };
  if (updates.percentComplete === undefined && updated.rangeEnd > updated.rangeStart) {
    const totalBlocks = updated.rangeEnd - updated.rangeStart;
    const indexedBlocks = updated.currentBlock - updated.rangeStart;
    updated.percentComplete = Math.min(100, Math.max(0, (indexedBlocks / totalBlocks) * 100));
  }
  liveProgressV1.set(key, updated);
  return updated;
}

function clearLiveProgressV1(pid, workerId = null) {
  if (workerId !== null) {
    liveProgressV1.delete(getWorkerKeyV1(pid, workerId));
  } else {
    for (let w = 0; w < WORKERS_PER_POOL_V1; w++) {
      liveProgressV1.delete(getWorkerKeyV1(pid, w));
    }
    liveProgressV1.delete(`unified_v1_${pid}`);
  }
}

let providerInstanceV1 = null;
let gardenerContractV1Instance = null;
let profilesContractV1Instance = null;

export function getProviderV1() {
  if (!providerInstanceV1) {
    providerInstanceV1 = new ethers.JsonRpcProvider(DFK_CHAIN_RPC);
  }
  return providerInstanceV1;
}

export function getGardenerContractV1() {
  if (!gardenerContractV1Instance) {
    gardenerContractV1Instance = new ethers.Contract(MASTER_GARDENER_V1, MASTER_GARDENER_V1_ABI, getProviderV1());
  }
  return gardenerContractV1Instance;
}

export function getProfilesContractV1() {
  if (!profilesContractV1Instance) {
    profilesContractV1Instance = new ethers.Contract(PROFILES_CONTRACT, PROFILES_ABI, getProviderV1());
  }
  return profilesContractV1Instance;
}

export async function getLatestBlockV1() {
  const provider = getProviderV1();
  return provider.getBlockNumber();
}

export async function getPoolLPTokenV1(pid) {
  try {
    const contract = getGardenerContractV1();
    const poolInfo = await contract.poolInfo(pid);
    return poolInfo.lpToken || poolInfo[0];
  } catch (err) {
    console.error(`[V1Indexer] Error getting LP token for pool ${pid}:`, err.message);
    return null;
  }
}

export async function getSummonerNameV1(walletAddress) {
  try {
    const contract = getProfilesContractV1();
    const profile = await contract.addressToProfile(walletAddress);
    return profile.name && profile.name.length > 0 ? profile.name : null;
  } catch (err) {
    return null;
  }
}

export async function batchGetSummonerNamesV1(walletAddresses, batchSize = 10) {
  const results = new Map();
  for (let i = 0; i < walletAddresses.length; i += batchSize) {
    const batch = walletAddresses.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(async (addr) => {
        const name = await getSummonerNameV1(addr);
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

export async function getCurrentStakedBalanceV1(pid, wallet) {
  try {
    const contract = getGardenerContractV1();
    const userInfo = await contract.userInfo(pid, wallet);
    return ethers.formatEther(userInfo.amount || userInfo[0]);
  } catch (err) {
    console.error(`[V1Indexer] Error getting userInfo for ${wallet}:`, err.message);
    return '0';
  }
}

export function getUnifiedIndexerNameV1(pid, workerId = null) {
  if (workerId !== null && workerId > 0) {
    return `unified_v1_pool_${pid}_w${workerId}`;
  }
  return `unified_v1_pool_${pid}`;
}

export async function getUnifiedIndexerProgressV1(indexerName) {
  const [progress] = await db.select()
    .from(poolEventIndexerProgressV1)
    .where(eq(poolEventIndexerProgressV1.indexerName, indexerName))
    .limit(1);
  return progress;
}

export async function initUnifiedIndexerProgressV1(indexerName, pid, lpToken, genesisBlock = DFK_GENESIS_BLOCK, rangeEnd = null) {
  const existing = await getUnifiedIndexerProgressV1(indexerName);
  if (existing) return existing;
  
  await db.insert(poolEventIndexerProgressV1).values({
    indexerName,
    indexerType: 'unified_v1',
    pid,
    lpToken,
    lastIndexedBlock: genesisBlock,
    genesisBlock,
    rangeEnd: rangeEnd || null,
    status: 'idle',
    totalEventsIndexed: 0,
  });
  
  return getUnifiedIndexerProgressV1(indexerName);
}

export async function updateUnifiedIndexerProgressV1(indexerName, updates) {
  await db.update(poolEventIndexerProgressV1)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(poolEventIndexerProgressV1.indexerName, indexerName));
}

export async function getAllUnifiedIndexerProgressV1() {
  return db.select()
    .from(poolEventIndexerProgressV1)
    .where(eq(poolEventIndexerProgressV1.indexerType, 'unified_v1'))
    .orderBy(poolEventIndexerProgressV1.pid);
}

async function queryEventsInChunksV1(contract, filter, fromBlock, toBlock, maxChunkSize = BLOCKS_PER_QUERY) {
  const allEvents = [];
  
  if (toBlock - fromBlock <= maxChunkSize) {
    try {
      return await contract.queryFilter(filter, fromBlock, toBlock);
    } catch (err) {
      console.error(`[V1Indexer] Error querying events ${fromBlock}-${toBlock}:`, err.message);
      return [];
    }
  }
  
  for (let start = fromBlock; start <= toBlock; start += maxChunkSize) {
    const end = Math.min(start + maxChunkSize - 1, toBlock);
    try {
      const events = await contract.queryFilter(filter, start, end);
      allEvents.push(...events);
    } catch (err) {
      console.error(`[V1Indexer] Error querying events ${start}-${end}:`, err.message);
    }
    await new Promise(r => setTimeout(r, 50));
  }
  
  return allEvents;
}

export async function indexAllPoolEventsV1(pid, fromBlock, toBlock) {
  const gardenerContract = getGardenerContractV1();
  
  const [depositEvents, withdrawEvents, emergencyEvents] = await Promise.all([
    queryEventsInChunksV1(gardenerContract, gardenerContract.filters.Deposit(null, pid), fromBlock, toBlock),
    queryEventsInChunksV1(gardenerContract, gardenerContract.filters.Withdraw(null, pid), fromBlock, toBlock),
    queryEventsInChunksV1(gardenerContract, gardenerContract.filters.EmergencyWithdraw(null, pid), fromBlock, toBlock),
  ]);
  
  return {
    deposits: depositEvents.map(e => ({ ...e, eventType: 'Deposit' })),
    withdraws: withdrawEvents.map(e => ({ ...e, eventType: 'Withdraw' })),
    emergencyWithdraws: emergencyEvents.map(e => ({ ...e, eventType: 'EmergencyWithdraw' })),
  };
}

async function saveStakerUpdatesV1(pid, stakerUpdates) {
  if (!stakerUpdates || stakerUpdates.length === 0) return { upserted: 0 };
  
  let upserted = 0;
  
  for (const staker of stakerUpdates) {
    try {
      await db.insert(poolStakersV1).values({
        wallet: staker.wallet.toLowerCase(),
        pid,
        stakedLP: staker.stakedLP,
        summonerName: staker.summonerName || null,
        lastActivityType: staker.lastActivityType,
        lastActivityAmount: staker.lastActivityAmount,
        lastActivityBlock: staker.lastActivityBlock,
        lastActivityTxHash: staker.lastActivityTxHash,
      }).onConflictDoUpdate({
        target: [poolStakersV1.wallet, poolStakersV1.pid],
        set: {
          stakedLP: staker.stakedLP,
          summonerName: staker.summonerName || sql`${poolStakersV1.summonerName}`,
          lastActivityType: staker.lastActivityType,
          lastActivityAmount: staker.lastActivityAmount,
          lastActivityBlock: staker.lastActivityBlock,
          lastActivityTxHash: staker.lastActivityTxHash,
          lastUpdatedAt: new Date(),
        },
      });
      upserted++;
    } catch (err) {
      console.error(`[V1Indexer] Error upserting staker ${staker.wallet}:`, err.message);
    }
  }
  
  return { upserted };
}

const runningWorkersV1 = new Map();

export function isUnifiedWorkerRunningV1(indexerName) {
  return runningWorkersV1.get(indexerName) === true;
}

export async function runUnifiedIncrementalBatchV1(pid, options = {}) {
  const {
    batchSize = INCREMENTAL_BATCH_SIZE,
    lookupSummonerNames = true,
    workerId = 0,
    rangeStart = null,
    rangeEnd = null,
  } = options;
  
  const indexerName = getUnifiedIndexerNameV1(pid, workerId);
  
  if (runningWorkersV1.get(indexerName)) {
    console.log(`[V1Indexer] Indexer ${indexerName} already running, skipping...`);
    return { status: 'already_running' };
  }
  
  runningWorkersV1.set(indexerName, true);
  const startTime = Date.now();
  
  try {
    const lpToken = await getPoolLPTokenV1(pid);
    if (!lpToken) {
      runningWorkersV1.set(indexerName, false);
      return { status: 'error', error: 'Could not get LP token address' };
    }
    
    const workerGenesisBlock = rangeStart !== null ? rangeStart : DFK_GENESIS_BLOCK;
    let progress = await initUnifiedIndexerProgressV1(indexerName, pid, lpToken, workerGenesisBlock, rangeEnd);
    const latestBlock = await getLatestBlockV1();
    
    const workerTargetBlock = (progress.rangeEnd !== null && progress.rangeEnd !== undefined) 
      ? Math.min(progress.rangeEnd, latestBlock) 
      : latestBlock;
    
    const startBlock = progress.lastIndexedBlock;
    const endBlock = Math.min(startBlock + batchSize, workerTargetBlock);
    
    const existingLive = getUnifiedLiveProgressV1(pid, workerId);
    const dbGenesisBlock = progress.genesisBlock || 0;
    updateLiveProgressV1(pid, {
      isRunning: true,
      currentBlock: startBlock,
      targetBlock: workerTargetBlock,
      genesisBlock: dbGenesisBlock,
      rangeStart: workerGenesisBlock,
      rangeEnd: workerTargetBlock,
      stakersFound: existingLive?.stakersFound || 0,
      rewardsFound: existingLive?.rewardsFound || 0,
      batchesCompleted: existingLive?.batchesCompleted || 0,
      startedAt: existingLive?.startedAt || new Date().toISOString(),
      lastBatchAt: null,
    }, workerId);
    
    if (startBlock >= workerTargetBlock) {
      runningWorkersV1.set(indexerName, false);
      updateLiveProgressV1(pid, { 
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
    console.log(`[V1Indexer] Pool ${pid}${workerLabel}: Indexing blocks ${startBlock} to ${endBlock} (${endBlock - startBlock} blocks)`);
    
    await updateUnifiedIndexerProgressV1(indexerName, { status: 'running' });
    
    const events = await indexAllPoolEventsV1(pid, startBlock, endBlock);
    
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
      console.log(`[V1Indexer] Pool ${pid}: Looking up summoner names for ${wallets.length} wallets...`);
      summonerNames = await batchGetSummonerNamesV1(wallets, 10);
    }
    
    const stakerUpdates = [];
    for (const wallet of wallets) {
      const currentBalance = await getCurrentStakedBalanceV1(pid, wallet);
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
    
    const stakerResult = await saveStakerUpdatesV1(pid, stakerUpdates);
    
    const runtimeMs = Date.now() - startTime;
    const totalEvents = stakerEvents.length;
    const totalEventsIndexed = (progress.totalEventsIndexed || 0) + totalEvents;
    
    const uniqueStakersResult = await db.select({ count: sql`count(*)::int` })
      .from(poolStakersV1)
      .where(and(
        eq(poolStakersV1.pid, pid),
        sql`CAST(${poolStakersV1.stakedLP} AS NUMERIC) > 0`
      ));
    const totalStakers = uniqueStakersResult[0]?.count || 0;
    
    await updateUnifiedIndexerProgressV1(indexerName, {
      lastIndexedBlock: endBlock,
      totalEventsIndexed,
      status: endBlock >= latestBlock ? 'complete' : 'idle',
    });
    
    const currentLive = getUnifiedLiveProgressV1(pid, workerId);
    const workerTarget = (progress.rangeEnd !== null && progress.rangeEnd !== undefined) 
      ? Math.min(progress.rangeEnd, latestBlock) 
      : latestBlock;
    const caughtUp = endBlock >= workerTarget;
    updateLiveProgressV1(pid, {
      isRunning: isUnifiedAutoRunningV1(pid, workerId) && !caughtUp,
      currentBlock: endBlock,
      targetBlock: workerTarget,
      stakersFound: (currentLive?.stakersFound || 0) + stakerResult.upserted,
      rewardsFound: currentLive?.rewardsFound || 0,
      batchesCompleted: (currentLive?.batchesCompleted || 0) + 1,
      lastBatchAt: new Date().toISOString(),
      percentComplete: caughtUp ? 100 : undefined,
      completedAt: caughtUp ? new Date().toISOString() : currentLive?.completedAt,
    }, workerId);
    
    console.log(`[V1Indexer] Pool ${pid}${workerLabel}: ${stakerEvents.length} staker events in ${(runtimeMs / 1000).toFixed(1)}s`);
    
    runningWorkersV1.set(indexerName, false);
    
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
      runtimeMs,
    };
  } catch (error) {
    runningWorkersV1.set(indexerName, false);
    const workerLabel = workerId > 0 ? ` (w${workerId})` : '';
    console.error(`[V1Indexer] Pool ${pid}${workerLabel} error:`, error);
    
    await updateUnifiedIndexerProgressV1(indexerName, {
      status: 'error',
      lastError: error.message,
    });
    
    updateLiveProgressV1(pid, {
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

export async function getPoolStakersFromDBV1(pid, limit = 500) {
  return db.select()
    .from(poolStakersV1)
    .where(eq(poolStakersV1.pid, pid))
    .orderBy(desc(poolStakersV1.stakedLP))
    .limit(limit);
}

export async function getActivePoolStakersFromDBV1(pid, limit = 500) {
  return db.select()
    .from(poolStakersV1)
    .where(and(
      eq(poolStakersV1.pid, pid),
      sql`CAST(${poolStakersV1.stakedLP} AS NUMERIC) > 0`
    ))
    .orderBy(desc(poolStakersV1.stakedLP))
    .limit(limit);
}

export async function resetUnifiedIndexerProgressV1(pid) {
  for (let w = 0; w < WORKERS_PER_POOL_V1; w++) {
    const indexerName = getUnifiedIndexerNameV1(pid, w);
    await db.delete(poolEventIndexerProgressV1)
      .where(eq(poolEventIndexerProgressV1.indexerName, indexerName));
  }
  const legacyName = getUnifiedIndexerNameV1(pid, null);
  await db.delete(poolEventIndexerProgressV1)
    .where(eq(poolEventIndexerProgressV1.indexerName, legacyName));
  
  await db.delete(poolStakersV1)
    .where(eq(poolStakersV1.pid, pid));
  
  await db.delete(poolRewardEventsV1)
    .where(eq(poolRewardEventsV1.pid, pid));
  
  clearLiveProgressV1(pid);
  
  console.log(`[V1Indexer] Reset V1 indexer for pool ${pid} (all workers)`);
  return { reset: true };
}

const autoRunIntervalsV1 = new Map();

function getAutoRunKeyV1(pid, workerId = 0) {
  return `unified_v1_${pid}_w${workerId}`;
}

// Track donors currently being stolen from (prevents race conditions)
// Reservations are explicitly released after steal completes; timeout is only a failsafe for crashes
const donorReservationsV1 = new Map(); // key: "pid_workerId" -> timestamp

// Work-stealing: Find work from slowest worker in the same pool
// Uses reservation system to prevent race conditions
function findWorkToStealV1(pid, thiefWorkerId) {
  const MIN_BLOCKS_TO_STEAL = 500000; // Don't steal less than 500k blocks
  const RESERVATION_TIMEOUT_MS = 60000; // Failsafe: reservations expire after 60s if not released
  
  let bestDonor = null;
  let maxRemainingBlocks = 0;
  const now = Date.now();
  
  for (let w = 0; w < WORKERS_PER_POOL_V1; w++) {
    if (w === thiefWorkerId) continue;
    
    const key = getAutoRunKeyV1(pid, w);
    const workerInfo = autoRunIntervalsV1.get(key);
    if (!workerInfo) continue;
    
    // Check if this donor is already reserved (race condition prevention)
    const reservationKey = `${pid}_${w}`;
    const reservedAt = donorReservationsV1.get(reservationKey);
    if (reservedAt && (now - reservedAt) < RESERVATION_TIMEOUT_MS) {
      continue; // Skip reserved donors
    }
    
    const progress = liveProgressV1.get(getWorkerKeyV1(pid, w));
    if (!progress || progress.completedAt) continue;
    
    const currentBlock = progress.currentBlock || workerInfo.rangeStart || 0;
    const targetBlock = progress.targetBlock || workerInfo.rangeEnd;
    
    if (!targetBlock) continue;
    
    const remainingBlocks = targetBlock - currentBlock;
    
    if (remainingBlocks > maxRemainingBlocks && remainingBlocks > MIN_BLOCKS_TO_STEAL * 2) {
      maxRemainingBlocks = remainingBlocks;
      bestDonor = {
        workerId: w,
        currentBlock,
        targetBlock,
        remainingBlocks,
      };
    }
  }
  
  if (!bestDonor) return null;
  
  // Reserve this donor immediately to prevent race conditions
  const reservationKey = `${pid}_${bestDonor.workerId}`;
  donorReservationsV1.set(reservationKey, now);
  
  const blocksToSteal = Math.floor(bestDonor.remainingBlocks / 2);
  if (blocksToSteal < MIN_BLOCKS_TO_STEAL) {
    donorReservationsV1.delete(reservationKey); // Release reservation
    return null;
  }
  
  const newRangeStart = bestDonor.targetBlock - blocksToSteal;
  const newRangeEnd = bestDonor.targetBlock;
  
  return {
    donorWorkerId: bestDonor.workerId,
    donorCurrentBlock: bestDonor.currentBlock,
    newDonorRangeEnd: newRangeStart,
    newRangeStart,
    newRangeEnd,
    blocksStolen: blocksToSteal,
    reservationKey, // Used to release reservation after completion
  };
}

// Release a donor reservation after work-stealing is complete
function releaseDonorReservationV1(reservationKey) {
  donorReservationsV1.delete(reservationKey);
}

// Reassign a V1 worker's range (for work-stealing)
async function reassignWorkerRangeV1(pid, workerId, newRangeStart, newRangeEnd) {
  const key = getAutoRunKeyV1(pid, workerId);
  const workerInfo = autoRunIntervalsV1.get(key);
  if (!workerInfo) return false;
  
  workerInfo.rangeStart = newRangeStart;
  workerInfo.rangeEnd = newRangeEnd;
  
  const indexerName = getUnifiedIndexerNameV1(pid, workerId);
  await db.update(poolEventIndexerProgressV1)
    .set({
      lastIndexedBlock: newRangeStart,
      rangeStart: newRangeStart,
      rangeEnd: newRangeEnd,
      status: 'running',
    })
    .where(eq(poolEventIndexerProgressV1.indexerName, indexerName));
  
  updateLiveProgressV1(pid, {
    isRunning: true,
    currentBlock: newRangeStart,
    targetBlock: newRangeEnd,
    rangeStart: newRangeStart,
    rangeEnd: newRangeEnd,
    percentComplete: 0,
    completedAt: null,
  }, workerId);
  
  return true;
}

// Shrink a donor V1 worker's range after work was stolen
async function shrinkWorkerRangeV1(pid, workerId, newRangeEnd) {
  const key = getAutoRunKeyV1(pid, workerId);
  const workerInfo = autoRunIntervalsV1.get(key);
  if (!workerInfo) return false;
  
  workerInfo.rangeEnd = newRangeEnd;
  
  const indexerName = getUnifiedIndexerNameV1(pid, workerId);
  await db.update(poolEventIndexerProgressV1)
    .set({ rangeEnd: newRangeEnd })
    .where(eq(poolEventIndexerProgressV1.indexerName, indexerName));
  
  const progress = liveProgressV1.get(getWorkerKeyV1(pid, workerId));
  if (progress) {
    updateLiveProgressV1(pid, {
      targetBlock: newRangeEnd,
      rangeEnd: newRangeEnd,
    }, workerId);
  }
  
  return true;
}

export function isUnifiedAutoRunningV1(pid, workerId = null) {
  if (workerId !== null) {
    return autoRunIntervalsV1.has(getAutoRunKeyV1(pid, workerId));
  }
  for (let w = 0; w < WORKERS_PER_POOL_V1; w++) {
    if (autoRunIntervalsV1.has(getAutoRunKeyV1(pid, w))) return true;
  }
  return false;
}

export function getUnifiedAutoRunStatusV1() {
  const status = [];
  for (const [key, info] of autoRunIntervalsV1.entries()) {
    const match = key.match(/unified_v1_(\d+)_w(\d+)/);
    if (match) {
      const pid = parseInt(match[1]);
      status.push({
        pid,
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

export function getPoolWorkerCountV1(pid) {
  return poolWorkerCountsV1.get(pid) || 0;
}

export function getPoolWorkerCountSummaryV1() {
  const summary = {};
  for (const [pid, count] of poolWorkerCountsV1.entries()) {
    summary[pid] = count;
  }
  return {
    maxWorkersPerPool: WORKERS_PER_POOL_V1,
    minWorkersPerPool: MIN_WORKERS_PER_POOL_V1,
    poolCounts: summary,
    totalWorkers: Array.from(poolWorkerCountsV1.values()).reduce((sum, c) => sum + c, 0),
  };
}

export async function startUnifiedWorkerAutoRunV1(pid, workerId, rangeStart, rangeEnd, intervalMs = AUTO_RUN_INTERVAL_MS) {
  const key = getAutoRunKeyV1(pid, workerId);
  if (autoRunIntervalsV1.has(key)) {
    console.log(`[V1Indexer] Worker ${workerId} already running for pool ${pid}`);
    return { status: 'already_running', pid, workerId };
  }
  
  const workerLabel = `V1 pool ${pid} worker ${workerId}`;
  console.log(`[V1Indexer] Starting ${workerLabel} (blocks ${rangeStart}-${rangeEnd || 'latest'}, interval: ${intervalMs / 1000}s)`);
  
  clearLiveProgressV1(pid, workerId);
  
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
  
  autoRunIntervalsV1.set(key, info);
  
  const totalPools = ALL_POOL_IDS_V1.length;
  const maxTotalWorkers = totalPools * WORKERS_PER_POOL_V1;
  const workerIndex = pid * WORKERS_PER_POOL_V1 + workerId;
  const offsetMs = Math.floor((workerIndex / maxTotalWorkers) * intervalMs);
  
  (async () => {
    try {
      if (offsetMs > 0) {
        await new Promise(r => setTimeout(r, offsetMs));
      }
      console.log(`[V1Indexer] Initial batch for ${workerLabel} (offset ${(offsetMs/1000).toFixed(1)}s)`);
      await runUnifiedIncrementalBatchV1(pid, { workerId, rangeStart, rangeEnd });
      info.lastRunAt = new Date().toISOString();
      info.runsCompleted++;
    } catch (err) {
      console.error(`[V1Indexer] Initial error for ${workerLabel}:`, err.message);
    }
  })();
  
  info.interval = setInterval(async () => {
    if (!autoRunIntervalsV1.has(key)) return;
    
    // Read current range from info (may have been updated by work-stealing)
    const currentRangeStart = info.rangeStart;
    const currentRangeEnd = info.rangeEnd;
    
    try {
      const result = await runUnifiedIncrementalBatchV1(pid, { 
        workerId, 
        rangeStart: currentRangeStart, 
        rangeEnd: currentRangeEnd 
      });
      info.lastRunAt = new Date().toISOString();
      info.runsCompleted++;
      
      if (result.status === 'complete') {
        console.log(`[V1Indexer] ${workerLabel} completed its range`);
        
        // Try to steal work from another worker in this pool
        const stolen = findWorkToStealV1(pid, workerId);
        if (stolen) {
          try {
            console.log(`[V1Indexer] ${workerLabel} stealing ${(stolen.blocksStolen / 1000000).toFixed(1)}M blocks from worker ${stolen.donorWorkerId}`);
            
            // Shrink the donor worker's range first (prevents overlap)
            await shrinkWorkerRangeV1(pid, stolen.donorWorkerId, stolen.newDonorRangeEnd);
            
            // Reassign this worker to the stolen range
            await reassignWorkerRangeV1(pid, workerId, stolen.newRangeStart, stolen.newRangeEnd);
            
            console.log(`[V1Indexer] ${workerLabel} now working on blocks ${stolen.newRangeStart.toLocaleString()}-${stolen.newRangeEnd.toLocaleString()}`);
          } finally {
            // Always release the reservation
            releaseDonorReservationV1(stolen.reservationKey);
          }
        }
      }
    } catch (err) {
      console.error(`[V1Indexer] Error for ${workerLabel}:`, err.message);
    }
  }, intervalMs);
  
  return { status: 'started', pid, workerId, rangeStart, rangeEnd, intervalMs, offsetMs };
}

export async function startPoolWorkersAutoRunV1(pid, intervalMs = AUTO_RUN_INTERVAL_MS, targetWorkers = WORKERS_PER_POOL_V1) {
  let workerCount = Math.min(targetWorkers, WORKERS_PER_POOL_V1);
  let latestBlock;
  
  try {
    latestBlock = await getLatestBlockV1();
  } catch (err) {
    console.error(`[V1Indexer] Failed to get latest block for pool ${pid}:`, err.message);
    await new Promise(r => setTimeout(r, 2000));
    try {
      latestBlock = await getLatestBlockV1();
    } catch (err2) {
      console.error(`[V1Indexer] RPC unavailable, cannot start pool ${pid}`);
      return { status: 'rpc_failed', pid, error: err2.message };
    }
  }
  
  const blocksPerWorker = Math.ceil(latestBlock / workerCount);
  
  console.log(`[V1Indexer] Starting ${workerCount} workers for V1 pool ${pid} (${blocksPerWorker.toLocaleString()} blocks each)`);
  
  const results = [];
  let consecutiveFailures = 0;
  const MAX_CONSECUTIVE_FAILURES = 2;
  
  for (let w = 0; w < workerCount; w++) {
    const rangeStart = w * blocksPerWorker;
    const rangeEnd = (w === workerCount - 1) ? null : (w + 1) * blocksPerWorker;
    
    await new Promise(r => setTimeout(r, 500));
    
    try {
      const result = await startUnifiedWorkerAutoRunV1(pid, w, rangeStart, rangeEnd, intervalMs);
      results.push(result);
      consecutiveFailures = 0;
    } catch (err) {
      consecutiveFailures++;
      console.error(`[V1Indexer] Worker ${w} failed to start for pool ${pid}:`, err.message);
      
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES && workerCount > MIN_WORKERS_PER_POOL_V1) {
        const newWorkerCount = workerCount - 1;
        console.warn(`[V1Indexer] RPC failsafe: Reducing V1 pool ${pid} from ${workerCount} to ${newWorkerCount} workers`);
        stopUnifiedAutoRunV1(pid);
        await new Promise(r => setTimeout(r, 3000));
        return startPoolWorkersAutoRunV1(pid, intervalMs, newWorkerCount);
      }
      
      results.push({ status: 'failed', pid, workerId: w, error: err.message });
    }
  }
  
  const started = results.filter(r => r.status === 'started').length;
  poolWorkerCountsV1.set(pid, started);
  
  return { status: 'pool_started', pid, workersStarted: started, targetWorkers: workerCount, results };
}

export function stopUnifiedAutoRunV1(pid, workerId = null) {
  const stopped = [];
  
  if (workerId !== null) {
    const key = getAutoRunKeyV1(pid, workerId);
    const info = autoRunIntervalsV1.get(key);
    if (info) {
      clearInterval(info.interval);
      autoRunIntervalsV1.delete(key);
      clearLiveProgressV1(pid, workerId);
      stopped.push({ pid, workerId, runsCompleted: info.runsCompleted });
    }
  } else {
    for (let w = 0; w < WORKERS_PER_POOL_V1; w++) {
      const key = getAutoRunKeyV1(pid, w);
      const info = autoRunIntervalsV1.get(key);
      if (info) {
        clearInterval(info.interval);
        autoRunIntervalsV1.delete(key);
        clearLiveProgressV1(pid, w);
        stopped.push({ pid, workerId: w, runsCompleted: info.runsCompleted });
      }
    }
    poolWorkerCountsV1.delete(pid);
  }
  
  if (stopped.length === 0) {
    console.log(`[V1Indexer] No workers active for V1 pool ${pid}`);
    return { status: 'not_running', pid };
  }
  
  console.log(`[V1Indexer] Stopped ${stopped.length} workers for V1 pool ${pid}`);
  return { status: 'stopped', pid, stopped };
}

export function stopAllUnifiedAutoRunsV1() {
  const stopped = [];
  
  for (const [key, info] of autoRunIntervalsV1.entries()) {
    if (key.startsWith('unified_v1_')) {
      clearInterval(info.interval);
      const match = key.match(/unified_v1_(\d+)_w(\d+)/);
      if (match) {
        stopped.push({ pid: parseInt(match[1]), workerId: parseInt(match[2]), runsCompleted: info.runsCompleted });
      }
    }
  }
  
  for (const key of Array.from(autoRunIntervalsV1.keys())) {
    if (key.startsWith('unified_v1_')) {
      autoRunIntervalsV1.delete(key);
    }
  }
  
  for (const pid of ALL_POOL_IDS_V1) {
    clearLiveProgressV1(pid);
  }
  
  console.log(`[V1Indexer] Stopped all V1 auto-runs (${stopped.length} workers)`);
  return { status: 'all_stopped', stopped, totalWorkers: stopped.length };
}

// V1 has the same pool IDs as V2
const ALL_POOL_IDS_V1 = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];

export async function startAllUnifiedAutoRunV1(intervalMs = AUTO_RUN_INTERVAL_MS) {
  const maxWorkers = ALL_POOL_IDS_V1.length * WORKERS_PER_POOL_V1;
  console.log(`[V1Indexer] Starting up to ${maxWorkers} V1 workers (max ${WORKERS_PER_POOL_V1} per pool × ${ALL_POOL_IDS_V1.length} pools, min ${MIN_WORKERS_PER_POOL_V1} on RPC failures)...`);
  
  const results = [];
  for (const pid of ALL_POOL_IDS_V1) {
    const poolResult = await startPoolWorkersAutoRunV1(pid, intervalMs);
    results.push(poolResult);
    await new Promise(r => setTimeout(r, 1000));
  }
  
  const started = results.reduce((sum, r) => sum + (r.workersStarted || 0), 0);
  const workerSummary = getPoolWorkerCountSummaryV1();
  
  console.log(`[V1Indexer] Started ${started} V1 workers across ${ALL_POOL_IDS_V1.length} pools`);
  
  return {
    status: 'all_started',
    started,
    totalPools: ALL_POOL_IDS_V1.length,
    maxWorkersPerPool: WORKERS_PER_POOL_V1,
    minWorkersPerPool: MIN_WORKERS_PER_POOL_V1,
    workerSummary,
    results,
  };
}

// Get total V1 staked amount for a pool (for TVL calculations)
export async function getTotalV1StakedForPool(pid) {
  const result = await db.select({
    totalStaked: sql`COALESCE(SUM(CAST(${poolStakersV1.stakedLP} AS NUMERIC)), 0)::text`,
    stakerCount: sql`COUNT(*)::int`,
  })
    .from(poolStakersV1)
    .where(and(
      eq(poolStakersV1.pid, pid),
      sql`CAST(${poolStakersV1.stakedLP} AS NUMERIC) > 0`
    ));
  
  return {
    totalStaked: result[0]?.totalStaked || '0',
    stakerCount: result[0]?.stakerCount || 0,
  };
}

// Get V1 staked totals for all pools
export async function getAllV1StakedTotals() {
  const results = await db.select({
    pid: poolStakersV1.pid,
    totalStaked: sql`COALESCE(SUM(CAST(${poolStakersV1.stakedLP} AS NUMERIC)), 0)::text`,
    stakerCount: sql`COUNT(*)::int`,
  })
    .from(poolStakersV1)
    .where(sql`CAST(${poolStakersV1.stakedLP} AS NUMERIC) > 0`)
    .groupBy(poolStakersV1.pid)
    .orderBy(poolStakersV1.pid);
  
  return results;
}
