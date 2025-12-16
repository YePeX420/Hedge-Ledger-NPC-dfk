import { ethers } from 'ethers';
import { db } from '../../../server/db.js';
import { poolStakers, poolSwapEvents, poolRewardEvents, poolEventIndexerProgress } from '../../../shared/schema.js';
import { eq, and, sql, desc } from 'drizzle-orm';

const DFK_CHAIN_RPC = 'https://subnets.avax.network/defi-kingdoms/dfk-chain/rpc';
const MASTER_GARDENER_V2 = '0xB04e8D6aED037904B77A9F0b08002592925833b7';

const DFK_GENESIS_BLOCK = 0;
const BLOCKS_PER_QUERY = 2000;
const INCREMENTAL_BATCH_SIZE = 100000; // 10x batch size for faster indexing

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

export function getUnifiedLiveProgress(pid) {
  return liveProgress.get(`unified_${pid}`) || null;
}

export function getAllUnifiedLiveProgress() {
  const result = [];
  for (const [key, progress] of liveProgress.entries()) {
    if (key.startsWith('unified_')) {
      const pid = parseInt(key.replace('unified_', ''));
      result.push({ pid, ...progress });
    }
  }
  return result;
}

function updateLiveProgress(pid, updates) {
  const key = `unified_${pid}`;
  const current = liveProgress.get(key) || {
    isRunning: false,
    currentBlock: 0,
    targetBlock: 0,
    genesisBlock: 0,
    stakersFound: 0,
    swapsFound: 0,
    rewardsFound: 0,
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
  liveProgress.set(key, updated);
  return updated;
}

function clearLiveProgress(pid) {
  liveProgress.delete(`unified_${pid}`);
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

export function getUnifiedIndexerName(pid) {
  return `unified_pool_${pid}`;
}

export async function getUnifiedIndexerProgress(indexerName) {
  const [progress] = await db.select()
    .from(poolEventIndexerProgress)
    .where(eq(poolEventIndexerProgress.indexerName, indexerName))
    .limit(1);
  return progress;
}

export async function initUnifiedIndexerProgress(indexerName, pid, lpToken, genesisBlock = DFK_GENESIS_BLOCK) {
  const existing = await getUnifiedIndexerProgress(indexerName);
  if (existing) return existing;
  
  await db.insert(poolEventIndexerProgress).values({
    indexerName,
    indexerType: 'unified',
    pid,
    lpToken,
    lastIndexedBlock: genesisBlock,
    genesisBlock,
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
  } = options;
  
  const indexerName = getUnifiedIndexerName(pid);
  
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
    
    let progress = await initUnifiedIndexerProgress(indexerName, pid, lpToken);
    const latestBlock = await getLatestBlock();
    
    const startBlock = progress.lastIndexedBlock;
    const endBlock = Math.min(startBlock + batchSize, latestBlock);
    
    const existingLive = getUnifiedLiveProgress(pid);
    const dbGenesisBlock = progress.genesisBlock || 0;
    updateLiveProgress(pid, {
      isRunning: true,
      currentBlock: startBlock,
      targetBlock: latestBlock,
      genesisBlock: dbGenesisBlock > 0 ? dbGenesisBlock : (existingLive?.genesisBlock || dbGenesisBlock),
      stakersFound: existingLive?.stakersFound || 0,
      swapsFound: existingLive?.swapsFound || 0,
      rewardsFound: existingLive?.rewardsFound || 0,
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
        runtimeMs: Date.now() - startTime,
      };
    }
    
    console.log(`[UnifiedIndexer] Pool ${pid}: Indexing all events from blocks ${startBlock} to ${endBlock} (${endBlock - startBlock} blocks)`);
    
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
    
    const currentLive = getUnifiedLiveProgress(pid);
    const caughtUp = endBlock >= latestBlock;
    updateLiveProgress(pid, {
      isRunning: isUnifiedAutoRunning(pid) && !caughtUp,
      currentBlock: endBlock,
      targetBlock: latestBlock,
      stakersFound: (currentLive?.stakersFound || 0) + stakerResult.upserted,
      swapsFound: (currentLive?.swapsFound || 0) + swapResult.saved,
      rewardsFound: (currentLive?.rewardsFound || 0) + rewardResult.saved,
      batchesCompleted: (currentLive?.batchesCompleted || 0) + 1,
      lastBatchAt: new Date().toISOString(),
      percentComplete: caughtUp ? 100 : undefined,
      completedAt: caughtUp ? new Date().toISOString() : currentLive?.completedAt,
    });
    
    console.log(`[UnifiedIndexer] Pool ${pid}: Complete. ${stakerEvents.length} staker events, ${events.swaps.length} swaps, ${events.harvests.length} rewards in ${(runtimeMs / 1000).toFixed(1)}s`);
    
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
    console.error(`[UnifiedIndexer] Pool ${pid} error:`, error);
    
    await updateUnifiedIndexerProgress(indexerName, {
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
  const indexerName = getUnifiedIndexerName(pid);
  
  await db.delete(poolEventIndexerProgress)
    .where(eq(poolEventIndexerProgress.indexerName, indexerName));
  
  await db.delete(poolStakers)
    .where(eq(poolStakers.pid, pid));
  
  await db.delete(poolSwapEvents)
    .where(eq(poolSwapEvents.pid, pid));
  
  await db.delete(poolRewardEvents)
    .where(eq(poolRewardEvents.pid, pid));
  
  clearLiveProgress(pid);
  
  console.log(`[UnifiedIndexer] Reset unified indexer for pool ${pid}`);
  return { reset: true };
}

const autoRunIntervals = new Map();

export function isUnifiedAutoRunning(pid) {
  return autoRunIntervals.has(`unified_${pid}`);
}

export function getUnifiedAutoRunStatus() {
  const status = [];
  for (const [key, info] of autoRunIntervals.entries()) {
    if (key.startsWith('unified_')) {
      const pid = parseInt(key.replace('unified_', ''));
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

export function startUnifiedAutoRun(pid, intervalMs = 5 * 60 * 1000) {
  const key = `unified_${pid}`;
  if (autoRunIntervals.has(key)) {
    console.log(`[UnifiedIndexer] Auto-run already running for pool ${pid}`);
    return { status: 'already_running', pid };
  }
  
  console.log(`[UnifiedIndexer] Starting unified auto-run for pool ${pid} (interval: ${intervalMs / 1000}s)`);
  
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
      console.log(`[UnifiedIndexer] Auto-run initial batch for pool ${pid}`);
      await runUnifiedIncrementalBatch(pid);
      info.lastRunAt = new Date().toISOString();
      info.runsCompleted++;
    } catch (err) {
      console.error(`[UnifiedIndexer] Auto-run initial error for pool ${pid}:`, err.message);
    }
  })();
  
  info.interval = setInterval(async () => {
    if (!autoRunIntervals.has(key)) {
      return;
    }
    try {
      console.log(`[UnifiedIndexer] Auto-run batch for pool ${pid}`);
      const result = await runUnifiedIncrementalBatch(pid);
      info.lastRunAt = new Date().toISOString();
      info.runsCompleted++;
      
      if (result.status === 'complete' && result.blocksRemaining === 0) {
        console.log(`[UnifiedIndexer] Pool ${pid} is fully synced, waiting for new blocks`);
      }
    } catch (err) {
      console.error(`[UnifiedIndexer] Auto-run error for pool ${pid}:`, err.message);
    }
  }, intervalMs);
  
  return { 
    status: 'started', 
    pid, 
    intervalMs,
    startedAt: info.startedAt,
  };
}

export function stopUnifiedAutoRun(pid) {
  const key = `unified_${pid}`;
  const info = autoRunIntervals.get(key);
  
  if (!info) {
    console.log(`[UnifiedIndexer] No auto-run active for pool ${pid}`);
    return { status: 'not_running', pid };
  }
  
  clearInterval(info.interval);
  autoRunIntervals.delete(key);
  clearLiveProgress(pid);
  
  console.log(`[UnifiedIndexer] Stopped auto-run for pool ${pid} (completed ${info.runsCompleted} runs)`);
  
  return { 
    status: 'stopped', 
    pid,
    runsCompleted: info.runsCompleted,
    startedAt: info.startedAt,
    stoppedAt: new Date().toISOString(),
  };
}

export function stopAllUnifiedAutoRuns() {
  const stopped = [];
  
  for (const [key, info] of autoRunIntervals.entries()) {
    if (key.startsWith('unified_')) {
      clearInterval(info.interval);
      const pid = parseInt(key.replace('unified_', ''));
      stopped.push({ pid, runsCompleted: info.runsCompleted });
    }
  }
  
  for (const key of Array.from(autoRunIntervals.keys())) {
    if (key.startsWith('unified_')) {
      autoRunIntervals.delete(key);
    }
  }
  
  console.log(`[UnifiedIndexer] Stopped all auto-runs (${stopped.length} pools)`);
  return { status: 'all_stopped', stopped };
}

// All known pool IDs (Master Gardener V2 pools)
const ALL_POOL_IDS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];

export function startAllUnifiedAutoRun(intervalMs = 5 * 60 * 1000) {
  console.log(`[UnifiedIndexer] Starting auto-run for all ${ALL_POOL_IDS.length} pools...`);
  
  const results = [];
  for (const pid of ALL_POOL_IDS) {
    const result = startUnifiedAutoRun(pid, intervalMs);
    results.push({ pid, ...result });
  }
  
  const started = results.filter(r => r.status === 'started').length;
  const alreadyRunning = results.filter(r => r.status === 'already_running').length;
  
  console.log(`[UnifiedIndexer] Started ${started} workers, ${alreadyRunning} already running`);
  
  return {
    status: 'all_started',
    started,
    alreadyRunning,
    total: ALL_POOL_IDS.length,
    results,
  };
}
