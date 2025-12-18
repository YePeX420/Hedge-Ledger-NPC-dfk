import { ethers } from 'ethers';
import { db } from '../../../server/db.js';
import { jewelerStakers, jewelerEvents, jewelerRatioHistory, jewelerIndexerProgress } from '../../../shared/schema.js';
import { eq, sql, desc } from 'drizzle-orm';

const DFK_CHAIN_RPC = 'https://subnets.avax.network/defi-kingdoms/dfk-chain/rpc';
const CJEWEL_ADDRESS = '0x9ed2c155632C042CB8bC20634571fF1CA26f5742';
const JEWEL_ADDRESS = '0xCCb93dABD71c8Dad03Fc4CE5559dC3D89F67a260';

const DFK_GENESIS_BLOCK = 0;
const BLOCKS_PER_QUERY = 2000;
const INCREMENTAL_BATCH_SIZE = 200000;
const AUTO_RUN_INTERVAL_MS = 60 * 1000;

export const JEWELER_WORKERS = 5;
export const MIN_JEWELER_WORKERS = 3;

const CJEWEL_ABI = [
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  'function balanceOf(address owner) view returns (uint256)',
  'function totalSupply() view returns (uint256)',
  'function getUserInfo(address _addr) view returns (uint256 amount, uint256 cJewelBalance, uint256 end, uint256 rewardPerSharePaid, uint256 rewards)',
];

const JEWEL_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
];

const PROFILE_CONTRACTS = {
  crystalvale: {
    rpc: DFK_CHAIN_RPC,
    address: '0xC4cD8C09D1A90b21Be417be91A81603B03993E81',
  },
  harmony: {
    rpc: 'https://api.harmony.one',
    address: '0x6391F796D56201D279a42fD3141aDa7e26A3B4A5',
  },
  klaytn: {
    rpc: 'https://public-en.node.kaia.io',
    address: '0xe1b8C354BE50357c2ab90A962254526d08aF0D2D',
  },
};

const PROFILES_ABI = [
  {
    inputs: [{ name: '', type: 'address' }],
    name: 'addressToProfile',
    outputs: [
      { name: 'owner', type: 'address' },
      { name: 'name', type: 'string' },
      { name: 'created', type: 'uint64' },
      { name: 'nftId', type: 'uint256' },
      { name: 'collectionId', type: 'uint256' },
      { name: 'picUri', type: 'string' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
];

const liveProgress = new Map();

export function getJewelerLiveProgress() {
  return liveProgress.get('jeweler') || null;
}

function updateLiveProgress(updates) {
  const current = liveProgress.get('jeweler') || {
    isRunning: false,
    currentBlock: 0,
    targetBlock: 0,
    genesisBlock: 0,
    eventsFound: 0,
    stakersFound: 0,
    batchesCompleted: 0,
    startedAt: null,
    lastBatchAt: null,
    percentComplete: 0,
    completedAt: null,
  };
  const updated = { ...current, ...updates };
  if (updates.percentComplete === undefined && updated.targetBlock > updated.genesisBlock) {
    const totalBlocks = updated.targetBlock - updated.genesisBlock;
    const indexedBlocks = updated.currentBlock - updated.genesisBlock;
    updated.percentComplete = Math.min(100, Math.max(0, (indexedBlocks / totalBlocks) * 100));
  }
  liveProgress.set('jeweler', updated);
  return updated;
}

function clearLiveProgress() {
  liveProgress.delete('jeweler');
}

let providerInstance = null;
let cjewelContractInstance = null;
let jewelContractInstance = null;
const profileProviders = new Map();
const profileContracts = new Map();

export function getProvider() {
  if (!providerInstance) {
    providerInstance = new ethers.JsonRpcProvider(DFK_CHAIN_RPC);
  }
  return providerInstance;
}

export function getCjewelContract() {
  if (!cjewelContractInstance) {
    cjewelContractInstance = new ethers.Contract(CJEWEL_ADDRESS, CJEWEL_ABI, getProvider());
  }
  return cjewelContractInstance;
}

export function getJewelContract() {
  if (!jewelContractInstance) {
    jewelContractInstance = new ethers.Contract(JEWEL_ADDRESS, JEWEL_ABI, getProvider());
  }
  return jewelContractInstance;
}

export function getProfilesContract(realm = 'crystalvale') {
  if (!profileContracts.has(realm)) {
    const config = PROFILE_CONTRACTS[realm];
    if (!config) {
      throw new Error(`Unknown realm: ${realm}`);
    }
    if (!profileProviders.has(realm)) {
      profileProviders.set(realm, new ethers.JsonRpcProvider(config.rpc));
    }
    profileContracts.set(realm, new ethers.Contract(config.address, PROFILES_ABI, profileProviders.get(realm)));
  }
  return profileContracts.get(realm);
}

export async function getSummonerName(wallet) {
  try {
    const { getSummonerName: getMultiRealmSummonerName } = await import('../../../src/services/profileLookupService.js');
    return await getMultiRealmSummonerName(wallet);
  } catch (err) {
    return null;
  }
}

async function getBlockTimestamp(blockNumber) {
  try {
    const block = await getProvider().getBlock(blockNumber);
    return block ? new Date(Number(block.timestamp) * 1000) : new Date();
  } catch (err) {
    return new Date();
  }
}

export async function getJewelerRatio() {
  const cjewelContract = getCjewelContract();
  const jewelContract = getJewelContract();
  
  const [totalCjewelSupply, jewelBalance] = await Promise.all([
    cjewelContract.totalSupply(),
    jewelContract.balanceOf(CJEWEL_ADDRESS),
  ]);
  
  const cjewelSupply = parseFloat(ethers.formatEther(totalCjewelSupply));
  const jewelLocked = parseFloat(ethers.formatEther(jewelBalance));
  
  const ratio = cjewelSupply > 0 ? jewelLocked / cjewelSupply : 1;
  
  return {
    ratio,
    totalJewelLocked: jewelLocked,
    totalCjewelSupply: cjewelSupply,
  };
}

export async function getOrCreateIndexerProgress() {
  const [existing] = await db.select()
    .from(jewelerIndexerProgress)
    .where(eq(jewelerIndexerProgress.indexerName, 'jeweler'))
    .limit(1);
  
  if (existing) {
    return existing;
  }
  
  const [created] = await db.insert(jewelerIndexerProgress)
    .values({
      indexerName: 'jeweler',
      lastIndexedBlock: DFK_GENESIS_BLOCK,
      genesisBlock: DFK_GENESIS_BLOCK,
      status: 'idle',
      totalEventsIndexed: 0,
      totalStakersFound: 0,
    })
    .returning();
  
  return created;
}

export async function queryTransferEvents(fromBlock, toBlock) {
  const cjewelContract = getCjewelContract();
  const filter = cjewelContract.filters.Transfer();
  const events = await cjewelContract.queryFilter(filter, fromBlock, toBlock);
  return events;
}

export async function processTransferEvent(event, blockTimestamp) {
  const from = event.args[0].toLowerCase();
  const to = event.args[1].toLowerCase();
  const value = ethers.formatEther(event.args[2]);
  const blockNumber = event.blockNumber;
  const txHash = event.transactionHash;
  const logIndex = event.index;
  
  const zeroAddress = '0x0000000000000000000000000000000000000000';
  
  if (from === zeroAddress) {
    await db.insert(jewelerEvents)
      .values({
        blockNumber,
        txHash,
        logIndex,
        eventType: 'Deposit',
        user: to,
        jewelAmount: '0',
        cjewelAmount: value,
        timestamp: blockTimestamp,
      })
      .onConflictDoNothing();
    
    await upsertStaker(to, 'Deposit', value, blockNumber, txHash);
    return { type: 'Deposit', user: to };
  }
  
  if (to === zeroAddress) {
    await db.insert(jewelerEvents)
      .values({
        blockNumber,
        txHash,
        logIndex,
        eventType: 'Withdraw',
        user: from,
        jewelAmount: '0',
        cjewelAmount: value,
        timestamp: blockTimestamp,
      })
      .onConflictDoNothing();
    
    await upsertStaker(from, 'Withdraw', value, blockNumber, txHash);
    return { type: 'Withdraw', user: from };
  }
  
  return null;
}

export async function upsertStaker(wallet, activityType, amount, blockNumber, txHash) {
  const walletLower = wallet.toLowerCase();
  
  const cjewelContract = getCjewelContract();
  let cjewelBalance = '0';
  let lockEnd = null;
  
  try {
    const [balance, userInfo] = await Promise.all([
      cjewelContract.balanceOf(wallet),
      cjewelContract.getUserInfo(wallet),
    ]);
    cjewelBalance = ethers.formatEther(balance);
    
    const lockEndTimestamp = Number(userInfo.end);
    if (lockEndTimestamp > 0) {
      lockEnd = new Date(lockEndTimestamp * 1000);
    }
  } catch (err) {
    console.error(`[JewelerIndexer] Failed to get cJEWEL info for ${wallet}:`, err.message);
  }
  
  const [existing] = await db.select()
    .from(jewelerStakers)
    .where(eq(jewelerStakers.wallet, walletLower))
    .limit(1);
  
  if (existing) {
    await db.update(jewelerStakers)
      .set({
        cjewelBalance,
        lockEnd,
        lastActivityType: activityType,
        lastActivityAmount: amount,
        lastActivityBlock: blockNumber,
        lastActivityTxHash: txHash,
        lastUpdatedAt: sql`CURRENT_TIMESTAMP`,
      })
      .where(eq(jewelerStakers.wallet, walletLower));
  } else {
    const summonerName = await getSummonerName(wallet);
    
    await db.insert(jewelerStakers)
      .values({
        wallet: walletLower,
        cjewelBalance,
        lockEnd,
        summonerName,
        lastActivityType: activityType,
        lastActivityAmount: amount,
        lastActivityBlock: blockNumber,
        lastActivityTxHash: txHash,
      })
      .onConflictDoNothing();
  }
}

const autoRunIntervals = new Map();
const runningWorkers = new Map();
const workerLiveProgress = new Map();
const donorReservations = new Map();
let activeWorkerCount = 0;

function getWorkerIndexerName(workerId) {
  return `jeweler_w${workerId}`;
}

function getWorkerKey(workerId) {
  return `jeweler_w${workerId}`;
}

export function getJewelerWorkerProgress(workerId) {
  return workerLiveProgress.get(getWorkerKey(workerId)) || null;
}

export function getAllJewelerWorkersProgress() {
  const workers = [];
  for (let w = 0; w < JEWELER_WORKERS; w++) {
    const progress = workerLiveProgress.get(getWorkerKey(w));
    if (progress) {
      workers.push({ workerId: w, ...progress });
    }
  }
  return workers;
}

function updateWorkerLiveProgress(workerId, updates) {
  const key = getWorkerKey(workerId);
  const current = workerLiveProgress.get(key) || {
    isRunning: false,
    currentBlock: 0,
    targetBlock: 0,
    rangeStart: 0,
    rangeEnd: null,
    eventsFound: 0,
    stakersFound: 0,
    batchesCompleted: 0,
    startedAt: null,
    lastBatchAt: null,
    percentComplete: 0,
    completedAt: null,
  };
  const updated = { ...current, ...updates };
  if (updates.percentComplete === undefined && updated.rangeEnd && updated.rangeEnd > updated.rangeStart) {
    const totalBlocks = updated.rangeEnd - updated.rangeStart;
    const indexedBlocks = updated.currentBlock - updated.rangeStart;
    updated.percentComplete = Math.min(100, Math.max(0, (indexedBlocks / totalBlocks) * 100));
  }
  workerLiveProgress.set(key, updated);
  return updated;
}

function clearWorkerLiveProgress(workerId) {
  workerLiveProgress.delete(getWorkerKey(workerId));
}

async function initWorkerProgress(workerId, rangeStart, rangeEnd) {
  const indexerName = getWorkerIndexerName(workerId);
  
  const [existing] = await db.select()
    .from(jewelerIndexerProgress)
    .where(eq(jewelerIndexerProgress.indexerName, indexerName))
    .limit(1);
  
  if (existing) {
    if (existing.rangeStart !== rangeStart || existing.rangeEnd !== rangeEnd) {
      await db.update(jewelerIndexerProgress)
        .set({
          rangeStart,
          rangeEnd,
          lastIndexedBlock: rangeStart,
          genesisBlock: rangeStart,
          status: 'idle',
          updatedAt: sql`CURRENT_TIMESTAMP`,
        })
        .where(eq(jewelerIndexerProgress.indexerName, indexerName));
      return { ...existing, rangeStart, rangeEnd, lastIndexedBlock: rangeStart, genesisBlock: rangeStart };
    }
    return existing;
  }
  
  const [created] = await db.insert(jewelerIndexerProgress)
    .values({
      indexerName,
      lastIndexedBlock: rangeStart,
      genesisBlock: rangeStart,
      rangeStart,
      rangeEnd,
      status: 'idle',
      totalEventsIndexed: 0,
      totalStakersFound: 0,
    })
    .returning();
  
  return created;
}

async function getLatestBlock() {
  const provider = getProvider();
  return await provider.getBlockNumber();
}

export async function runJewelerWorkerBatch(workerId, options = {}) {
  const {
    batchSize = INCREMENTAL_BATCH_SIZE,
  } = options;
  
  const indexerName = getWorkerIndexerName(workerId);
  
  if (runningWorkers.get(indexerName)) {
    console.log(`[JewelerIndexer] Worker ${workerId} already running, skipping...`);
    return { status: 'already_running' };
  }
  
  runningWorkers.set(indexerName, true);
  
  try {
    const [progress] = await db.select()
      .from(jewelerIndexerProgress)
      .where(eq(jewelerIndexerProgress.indexerName, indexerName))
      .limit(1);
    
    if (!progress) {
      runningWorkers.set(indexerName, false);
      return { status: 'error', error: 'No progress record found' };
    }
    
    const latestBlock = await getLatestBlock();
    const workerTargetBlock = progress.rangeEnd !== null ? Math.min(progress.rangeEnd, latestBlock) : latestBlock;
    const startBlock = progress.lastIndexedBlock;
    const endBlock = Math.min(startBlock + batchSize, workerTargetBlock);
    
    updateWorkerLiveProgress(workerId, {
      isRunning: true,
      currentBlock: startBlock,
      targetBlock: workerTargetBlock,
      rangeStart: progress.rangeStart || 0,
      rangeEnd: progress.rangeEnd,
      startedAt: new Date().toISOString(),
    });
    
    if (startBlock >= workerTargetBlock) {
      runningWorkers.set(indexerName, false);
      updateWorkerLiveProgress(workerId, {
        isRunning: false,
        currentBlock: workerTargetBlock,
        targetBlock: workerTargetBlock,
        percentComplete: 100,
        completedAt: new Date().toISOString(),
      });
      return { status: 'completed', message: 'Worker reached target block' };
    }
    
    console.log(`[JewelerIndexer] Worker ${workerId}: blocks ${startBlock.toLocaleString()} -> ${endBlock.toLocaleString()} (target: ${workerTargetBlock.toLocaleString()})`);
    
    let totalEvents = 0;
    let uniqueStakers = new Set();
    let currentBlock = startBlock;
    let batchesCompleted = 0;
    
    while (currentBlock <= endBlock) {
      const fromBlock = currentBlock;
      const toBlock = Math.min(currentBlock + BLOCKS_PER_QUERY - 1, endBlock);
      
      try {
        const events = await queryTransferEvents(fromBlock, toBlock);
        
        if (events.length > 0) {
          const blockTimestamp = await getBlockTimestamp(fromBlock);
          
          for (const event of events) {
            const result = await processTransferEvent(event, blockTimestamp);
            if (result) {
              totalEvents++;
              uniqueStakers.add(result.user.toLowerCase());
            }
          }
        }
        
        batchesCompleted++;
        currentBlock = toBlock + 1;
        
        updateWorkerLiveProgress(workerId, {
          currentBlock,
          eventsFound: totalEvents,
          stakersFound: uniqueStakers.size,
          batchesCompleted,
          lastBatchAt: new Date().toISOString(),
        });
        
        await db.update(jewelerIndexerProgress)
          .set({
            lastIndexedBlock: toBlock,
            totalEventsIndexed: sql`total_events_indexed + ${events.length}`,
            totalStakersFound: sql`GREATEST(total_stakers_found, ${uniqueStakers.size})`,
            status: 'running',
            updatedAt: sql`CURRENT_TIMESTAMP`,
          })
          .where(eq(jewelerIndexerProgress.indexerName, indexerName));
        
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (err) {
        console.error(`[JewelerIndexer] Worker ${workerId} error ${fromBlock}-${toBlock}:`, err.message);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    const isComplete = endBlock >= workerTargetBlock;
    
    await db.update(jewelerIndexerProgress)
      .set({
        status: isComplete ? 'complete' : 'idle',
        updatedAt: sql`CURRENT_TIMESTAMP`,
      })
      .where(eq(jewelerIndexerProgress.indexerName, indexerName));
    
    updateWorkerLiveProgress(workerId, {
      isRunning: false,
      currentBlock: endBlock,
      completedAt: isComplete ? new Date().toISOString() : null,
      percentComplete: isComplete ? 100 : undefined,
    });
    
    runningWorkers.set(indexerName, false);
    
    console.log(`[JewelerIndexer] Worker ${workerId} batch done: ${totalEvents} events, ${uniqueStakers.size} stakers`);
    
    return {
      status: isComplete ? 'completed' : 'batch_done',
      eventsFound: totalEvents,
      stakersFound: uniqueStakers.size,
      blocksIndexed: endBlock - startBlock,
      currentBlock: endBlock,
      targetBlock: workerTargetBlock,
    };
  } catch (err) {
    console.error(`[JewelerIndexer] Worker ${workerId} error:`, err.message);
    runningWorkers.set(indexerName, false);
    updateWorkerLiveProgress(workerId, { isRunning: false });
    return { status: 'error', error: err.message };
  }
}

function findWorkToSteal(thiefWorkerId) {
  const MIN_BLOCKS_TO_STEAL = 500000;
  const RESERVATION_TIMEOUT_MS = 60000;
  
  let bestDonor = null;
  let maxRemainingBlocks = 0;
  const now = Date.now();
  
  for (let w = 0; w < activeWorkerCount; w++) {
    if (w === thiefWorkerId) continue;
    
    const key = getWorkerKey(w);
    const workerInfo = autoRunIntervals.get(key);
    if (!workerInfo) continue;
    
    const reservationKey = `jeweler_${w}`;
    const reservedAt = donorReservations.get(reservationKey);
    if (reservedAt && (now - reservedAt) < RESERVATION_TIMEOUT_MS) {
      continue;
    }
    
    const progress = workerLiveProgress.get(key);
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
  
  const reservationKey = `jeweler_${bestDonor.workerId}`;
  donorReservations.set(reservationKey, now);
  
  const blocksToSteal = Math.floor(bestDonor.remainingBlocks / 2);
  if (blocksToSteal < MIN_BLOCKS_TO_STEAL) {
    donorReservations.delete(reservationKey);
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
    reservationKey,
  };
}

async function applyWorkSteal(thiefWorkerId, stealInfo) {
  const donorIndexerName = getWorkerIndexerName(stealInfo.donorWorkerId);
  const thiefIndexerName = getWorkerIndexerName(thiefWorkerId);
  
  await db.update(jewelerIndexerProgress)
    .set({
      rangeEnd: stealInfo.newDonorRangeEnd,
      updatedAt: sql`CURRENT_TIMESTAMP`,
    })
    .where(eq(jewelerIndexerProgress.indexerName, donorIndexerName));
  
  const donorKey = getWorkerKey(stealInfo.donorWorkerId);
  const donorWorkerInfo = autoRunIntervals.get(donorKey);
  if (donorWorkerInfo) {
    donorWorkerInfo.rangeEnd = stealInfo.newDonorRangeEnd;
  }
  
  await db.update(jewelerIndexerProgress)
    .set({
      rangeStart: stealInfo.newRangeStart,
      rangeEnd: stealInfo.newRangeEnd,
      lastIndexedBlock: stealInfo.newRangeStart,
      genesisBlock: stealInfo.newRangeStart,
      status: 'idle',
      updatedAt: sql`CURRENT_TIMESTAMP`,
    })
    .where(eq(jewelerIndexerProgress.indexerName, thiefIndexerName));
  
  const thiefKey = getWorkerKey(thiefWorkerId);
  const thiefWorkerInfo = autoRunIntervals.get(thiefKey);
  if (thiefWorkerInfo) {
    thiefWorkerInfo.rangeStart = stealInfo.newRangeStart;
    thiefWorkerInfo.rangeEnd = stealInfo.newRangeEnd;
  }
  
  updateWorkerLiveProgress(thiefWorkerId, {
    rangeStart: stealInfo.newRangeStart,
    rangeEnd: stealInfo.newRangeEnd,
    currentBlock: stealInfo.newRangeStart,
    targetBlock: stealInfo.newRangeEnd,
    completedAt: null,
    percentComplete: 0,
  });
  
  donorReservations.delete(stealInfo.reservationKey);
  
  console.log(`[JewelerIndexer] Worker ${thiefWorkerId} stole ${stealInfo.blocksStolen.toLocaleString()} blocks from worker ${stealInfo.donorWorkerId}`);
}

async function startJewelerWorkerAutoRun(workerId, rangeStart, rangeEnd, intervalMs = AUTO_RUN_INTERVAL_MS) {
  const key = getWorkerKey(workerId);
  if (autoRunIntervals.has(key)) {
    console.log(`[JewelerIndexer] Worker ${workerId} already running`);
    return { status: 'already_running', workerId };
  }
  
  console.log(`[JewelerIndexer] Starting worker ${workerId} (blocks ${rangeStart.toLocaleString()}-${rangeEnd ? rangeEnd.toLocaleString() : 'latest'}, interval: ${intervalMs / 1000}s)`);
  
  clearWorkerLiveProgress(workerId);
  await initWorkerProgress(workerId, rangeStart, rangeEnd);
  
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
  
  const offsetMs = Math.floor((workerId / JEWELER_WORKERS) * intervalMs);
  
  (async () => {
    try {
      if (offsetMs > 0) {
        await new Promise(r => setTimeout(r, offsetMs));
      }
      console.log(`[JewelerIndexer] Initial batch for worker ${workerId} (offset ${(offsetMs / 1000).toFixed(1)}s)`);
      await runJewelerWorkerBatch(workerId);
      info.lastRunAt = new Date().toISOString();
      info.runsCompleted++;
    } catch (err) {
      console.error(`[JewelerIndexer] Initial error for worker ${workerId}:`, err.message);
    }
  })();
  
  info.interval = setInterval(async () => {
    if (!autoRunIntervals.has(key)) return;
    
    try {
      const result = await runJewelerWorkerBatch(workerId);
      info.lastRunAt = new Date().toISOString();
      info.runsCompleted++;
      
      if (result.status === 'completed') {
        const stealInfo = findWorkToSteal(workerId);
        if (stealInfo) {
          await applyWorkSteal(workerId, stealInfo);
          console.log(`[JewelerIndexer] Worker ${workerId} continuing with stolen work`);
        } else {
          console.log(`[JewelerIndexer] Worker ${workerId} completed, no work to steal`);
        }
      }
    } catch (err) {
      console.error(`[JewelerIndexer] Worker ${workerId} error:`, err.message);
    }
  }, intervalMs);
  
  return { status: 'started', workerId, rangeStart, rangeEnd };
}

export async function startJewelerWorkersAutoRun(intervalMs = AUTO_RUN_INTERVAL_MS, targetWorkers = JEWELER_WORKERS) {
  let workerCount = Math.min(targetWorkers, JEWELER_WORKERS);
  let latestBlock;
  
  try {
    latestBlock = await getLatestBlock();
  } catch (err) {
    console.error('[JewelerIndexer] Failed to get latest block:', err.message);
    await new Promise(r => setTimeout(r, 2000));
    try {
      latestBlock = await getLatestBlock();
    } catch (err2) {
      console.error('[JewelerIndexer] RPC unavailable, cannot start workers');
      return { status: 'rpc_failed', error: err2.message };
    }
  }
  
  const blocksPerWorker = Math.ceil(latestBlock / workerCount);
  
  console.log(`[JewelerIndexer] Starting ${workerCount} workers (${blocksPerWorker.toLocaleString()} blocks each, latest: ${latestBlock.toLocaleString()})`);
  
  const results = [];
  let consecutiveFailures = 0;
  const MAX_CONSECUTIVE_FAILURES = 2;
  
  for (let w = 0; w < workerCount; w++) {
    const rangeStart = w * blocksPerWorker;
    const rangeEnd = (w === workerCount - 1) ? null : (w + 1) * blocksPerWorker;
    
    await new Promise(r => setTimeout(r, 500));
    
    try {
      const result = await startJewelerWorkerAutoRun(w, rangeStart, rangeEnd, intervalMs);
      results.push(result);
      consecutiveFailures = 0;
    } catch (err) {
      consecutiveFailures++;
      console.error(`[JewelerIndexer] Worker ${w} failed to start:`, err.message);
      
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES && workerCount > MIN_JEWELER_WORKERS) {
        const newWorkerCount = workerCount - 1;
        console.warn(`[JewelerIndexer] RPC failsafe: Reducing from ${workerCount} to ${newWorkerCount} workers`);
        
        stopJewelerWorkersAutoRun();
        
        await new Promise(r => setTimeout(r, 3000));
        return startJewelerWorkersAutoRun(intervalMs, newWorkerCount);
      }
      
      results.push({ status: 'failed', workerId: w, error: err.message });
    }
  }
  
  const started = results.filter(r => r.status === 'started').length;
  activeWorkerCount = started;
  
  return { status: 'workers_started', workersStarted: started, targetWorkers: workerCount, results };
}

export function stopJewelerWorkersAutoRun() {
  let stopped = 0;
  for (let w = 0; w < JEWELER_WORKERS; w++) {
    const key = getWorkerKey(w);
    const info = autoRunIntervals.get(key);
    if (info) {
      if (info.interval) {
        clearInterval(info.interval);
      }
      autoRunIntervals.delete(key);
      clearWorkerLiveProgress(w);
      stopped++;
    }
  }
  activeWorkerCount = 0;
  donorReservations.clear();
  console.log(`[JewelerIndexer] Stopped ${stopped} workers`);
  return stopped;
}

export function stopJewelerAutoRun() {
  let stoppedAny = false;
  
  const singleInterval = autoRunIntervals.get('jeweler');
  if (singleInterval) {
    clearInterval(singleInterval);
    autoRunIntervals.delete('jeweler');
    console.log('[JewelerIndexer] Single auto-run stopped');
    stoppedAny = true;
  }
  
  const workersStoppedCount = stopJewelerWorkersAutoRun();
  if (workersStoppedCount > 0) {
    stoppedAny = true;
  }
  
  return stoppedAny;
}

export function startJewelerAutoRun(useParallelWorkers = true) {
  if (useParallelWorkers) {
    return startJewelerWorkersAutoRun();
  }
  
  if (autoRunIntervals.has('jeweler')) {
    return false;
  }
  
  const intervalId = setInterval(async () => {
    try {
      const progress = getJewelerLiveProgress();
      if (progress?.isRunning) {
        return;
      }
      await runJewelerIndexer();
    } catch (err) {
      console.error('[JewelerIndexer] Auto-run error:', err.message);
    }
  }, AUTO_RUN_INTERVAL_MS);
  
  autoRunIntervals.set('jeweler', intervalId);
  console.log('[JewelerIndexer] Auto-run started');
  
  runJewelerIndexer().catch(err => {
    console.error('[JewelerIndexer] Initial run error:', err.message);
  });
  
  return true;
}

export function isJewelerAutoRunning() {
  if (autoRunIntervals.has('jeweler')) return true;
  for (let w = 0; w < JEWELER_WORKERS; w++) {
    if (autoRunIntervals.has(getWorkerKey(w))) return true;
  }
  return false;
}

export function getJewelerWorkersStatus() {
  const workers = [];
  for (let w = 0; w < JEWELER_WORKERS; w++) {
    const key = getWorkerKey(w);
    const info = autoRunIntervals.get(key);
    const progress = workerLiveProgress.get(key);
    if (info || progress) {
      workers.push({
        workerId: w,
        isRunning: !!info,
        ...info,
        progress: progress || null,
      });
    }
  }
  return {
    activeWorkers: activeWorkerCount,
    maxWorkers: JEWELER_WORKERS,
    minWorkers: MIN_JEWELER_WORKERS,
    workers,
  };
}

export async function refreshAllStakerBalances() {
  console.log('[JewelerIndexer] Starting balance refresh for all stakers...');
  
  const allStakers = await db.select({ wallet: jewelerStakers.wallet })
    .from(jewelerStakers)
    .orderBy(desc(jewelerStakers.lastUpdatedAt));
  
  console.log(`[JewelerIndexer] Refreshing ${allStakers.length} stakers...`);
  
  const cjewelContract = getCjewelContract();
  let updated = 0;
  let errors = 0;
  
  for (const staker of allStakers) {
    try {
      const [balance, userInfo] = await Promise.all([
        cjewelContract.balanceOf(staker.wallet),
        cjewelContract.getUserInfo(staker.wallet),
      ]);
      
      const cjewelBalance = ethers.formatEther(balance);
      const lockEndTimestamp = Number(userInfo.end);
      const lockEnd = lockEndTimestamp > 0 ? new Date(lockEndTimestamp * 1000) : null;
      const summonerName = await getSummonerName(staker.wallet);
      
      await db.update(jewelerStakers)
        .set({
          cjewelBalance,
          lockEnd,
          summonerName,
          lastUpdatedAt: sql`CURRENT_TIMESTAMP`,
        })
        .where(eq(jewelerStakers.wallet, staker.wallet));
      
      updated++;
      
      if (updated % 50 === 0) {
        console.log(`[JewelerIndexer] Refreshed ${updated}/${allStakers.length} stakers`);
      }
      
      await new Promise(resolve => setTimeout(resolve, 50));
    } catch (err) {
      errors++;
      if (errors <= 5) {
        console.error(`[JewelerIndexer] Error refreshing ${staker.wallet}:`, err.message);
      }
    }
  }
  
  console.log(`[JewelerIndexer] Balance refresh complete: ${updated} updated, ${errors} errors`);
  return { updated, errors, total: allStakers.length };
}

export async function runJewelerIndexer() {
  const indexerProgress = await getOrCreateIndexerProgress();
  
  if (indexerProgress.status === 'running') {
    console.log('[JewelerIndexer] Already running');
    return { success: false, message: 'Already running' };
  }
  
  const provider = getProvider();
  const latestBlock = await provider.getBlockNumber();
  const startBlock = indexerProgress.lastIndexedBlock + 1;
  const targetBlock = Math.min(startBlock + INCREMENTAL_BATCH_SIZE, latestBlock);
  
  if (startBlock >= latestBlock) {
    console.log('[JewelerIndexer] Already synced to latest block');
    return { success: true, message: 'Already synced' };
  }
  
  await db.update(jewelerIndexerProgress)
    .set({ status: 'running', updatedAt: sql`CURRENT_TIMESTAMP` })
    .where(eq(jewelerIndexerProgress.indexerName, 'jeweler'));
  
  updateLiveProgress({
    isRunning: true,
    currentBlock: startBlock,
    targetBlock,
    genesisBlock: indexerProgress.genesisBlock,
    eventsFound: 0,
    stakersFound: 0,
    batchesCompleted: 0,
    startedAt: new Date().toISOString(),
    percentComplete: 0,
  });
  
  console.log(`[JewelerIndexer] Starting from block ${startBlock} to ${targetBlock}`);
  
  let totalEvents = 0;
  let uniqueStakers = new Set();
  let currentBlock = startBlock;
  let batchesCompleted = 0;
  
  try {
    while (currentBlock <= targetBlock) {
      const fromBlock = currentBlock;
      const toBlock = Math.min(currentBlock + BLOCKS_PER_QUERY - 1, targetBlock);
      
      try {
        const events = await queryTransferEvents(fromBlock, toBlock);
        
        if (events.length > 0) {
          const blockTimestamp = await getBlockTimestamp(fromBlock);
          
          for (const event of events) {
            const result = await processTransferEvent(event, blockTimestamp);
            if (result) {
              totalEvents++;
              uniqueStakers.add(result.user.toLowerCase());
            }
          }
        }
        
        batchesCompleted++;
        currentBlock = toBlock + 1;
        
        updateLiveProgress({
          currentBlock,
          eventsFound: totalEvents,
          stakersFound: uniqueStakers.size,
          batchesCompleted,
          lastBatchAt: new Date().toISOString(),
        });
        
        await db.update(jewelerIndexerProgress)
          .set({
            lastIndexedBlock: toBlock,
            totalEventsIndexed: sql`total_events_indexed + ${events.length}`,
            totalStakersFound: uniqueStakers.size,
            updatedAt: sql`CURRENT_TIMESTAMP`,
          })
          .where(eq(jewelerIndexerProgress.indexerName, 'jeweler'));
        
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (err) {
        console.error(`[JewelerIndexer] Error querying events ${fromBlock}-${toBlock}:`, err.message);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    const ratioData = await getJewelerRatio();
    await db.insert(jewelerRatioHistory)
      .values({
        blockNumber: targetBlock,
        ratio: ratioData.ratio.toString(),
        totalJewelLocked: ratioData.totalJewelLocked.toString(),
        totalCjewelSupply: ratioData.totalCjewelSupply.toString(),
        timestamp: new Date(),
      })
      .onConflictDoNothing();
    
    await db.update(jewelerIndexerProgress)
      .set({
        status: 'complete',
        updatedAt: sql`CURRENT_TIMESTAMP`,
      })
      .where(eq(jewelerIndexerProgress.indexerName, 'jeweler'));
    
    updateLiveProgress({
      isRunning: false,
      completedAt: new Date().toISOString(),
      percentComplete: 100,
    });
    
    console.log(`[JewelerIndexer] Completed: ${totalEvents} events, ${uniqueStakers.size} stakers`);
    
    return {
      success: true,
      eventsFound: totalEvents,
      stakersFound: uniqueStakers.size,
      blocksIndexed: targetBlock - startBlock + 1,
    };
  } catch (err) {
    console.error('[JewelerIndexer] Error:', err.message);
    
    await db.update(jewelerIndexerProgress)
      .set({
        status: 'error',
        lastError: err.message,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      })
      .where(eq(jewelerIndexerProgress.indexerName, 'jeweler'));
    
    updateLiveProgress({ isRunning: false });
    
    return { success: false, error: err.message };
  }
}

export async function getJewelerLeaderboard(limit = 50) {
  const stakers = await db.select()
    .from(jewelerStakers)
    .orderBy(desc(jewelerStakers.cjewelBalance))
    .limit(limit);
  
  const ratioData = await getJewelerRatio();
  const ratio = ratioData.ratio || 1;
  
  const enrichedStakers = stakers.map(staker => ({
    ...staker,
    stakedJewel: (parseFloat(staker.cjewelBalance || '0') * ratio).toFixed(4),
  }));
  
  return enrichedStakers;
}

export async function getJewelerAPR() {
  const history = await db.select()
    .from(jewelerRatioHistory)
    .orderBy(desc(jewelerRatioHistory.timestamp))
    .limit(100);
  
  if (history.length < 2) {
    return { apr: 0, apr7d: 0, apr30d: 0, currentRatio: history[0]?.ratio || 1 };
  }
  
  const latestRatio = parseFloat(history[0].ratio);
  const latestTime = new Date(history[0].timestamp).getTime();
  
  let apr7d = 0;
  let apr30d = 0;
  
  const sevenDaysAgo = latestTime - 7 * 24 * 60 * 60 * 1000;
  const thirtyDaysAgo = latestTime - 30 * 24 * 60 * 60 * 1000;
  
  for (const h of history) {
    const time = new Date(h.timestamp).getTime();
    const ratio = parseFloat(h.ratio);
    
    if (time <= sevenDaysAgo && apr7d === 0) {
      const daysDiff = (latestTime - time) / (24 * 60 * 60 * 1000);
      const ratioChange = (latestRatio - ratio) / ratio;
      apr7d = (ratioChange / daysDiff) * 365 * 100;
    }
    
    if (time <= thirtyDaysAgo && apr30d === 0) {
      const daysDiff = (latestTime - time) / (24 * 60 * 60 * 1000);
      const ratioChange = (latestRatio - ratio) / ratio;
      apr30d = (ratioChange / daysDiff) * 365 * 100;
    }
  }
  
  const oldestRatio = parseFloat(history[history.length - 1].ratio);
  const oldestTime = new Date(history[history.length - 1].timestamp).getTime();
  const daysDiff = (latestTime - oldestTime) / (24 * 60 * 60 * 1000);
  const ratioChange = (latestRatio - oldestRatio) / oldestRatio;
  const aprOverall = daysDiff > 0 ? (ratioChange / daysDiff) * 365 * 100 : 0;
  
  return {
    apr: aprOverall,
    apr7d: apr7d || aprOverall,
    apr30d: apr30d || aprOverall,
    currentRatio: latestRatio,
  };
}

export async function getJewelerStats() {
  const [indexerProgress] = await db.select()
    .from(jewelerIndexerProgress)
    .where(eq(jewelerIndexerProgress.indexerName, 'jeweler'))
    .limit(1);
  
  const [stakerCount] = await db.select({ count: sql`count(*)` })
    .from(jewelerStakers);
  
  const ratioData = await getJewelerRatio();
  const aprData = await getJewelerAPR();
  
  return {
    totalStakers: parseInt(stakerCount?.count || '0'),
    totalJewelLocked: ratioData.totalJewelLocked,
    totalCjewelSupply: ratioData.totalCjewelSupply,
    currentRatio: ratioData.ratio,
    ...aprData,
    indexerProgress: indexerProgress || null,
    liveProgress: getJewelerLiveProgress(),
    isAutoRunning: isJewelerAutoRunning(),
  };
}
