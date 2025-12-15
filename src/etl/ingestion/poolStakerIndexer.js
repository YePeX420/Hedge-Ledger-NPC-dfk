import { ethers } from 'ethers';
import { db } from '../../../server/db.js';
import { poolStakers, poolStakerIndexerProgress } from '../../../shared/schema.js';
import { eq, and, sql, desc } from 'drizzle-orm';

const DFK_CHAIN_RPC = 'https://subnets.avax.network/defi-kingdoms/dfk-chain/rpc';
const LP_STAKING_ADDRESS = '0xB04e8D6aED037904B77A9F0b08002592925833b7';

const DFK_GENESIS_BLOCK = 0;
const BLOCKS_PER_QUERY = 2000;
const INCREMENTAL_BATCH_SIZE = 10000;

const LP_STAKING_ABI = [
  'event Deposit(address indexed user, uint256 indexed pid, uint256 amount)',
  'event Withdraw(address indexed user, uint256 indexed pid, uint256 amount)',
  'event EmergencyWithdraw(address indexed user, uint256 indexed pid, uint256 amount)',
  'function userInfo(uint256 pid, address user) view returns (uint256 amount, int256 rewardDebt, uint256 lastDepositTimestamp)',
  'function getPoolLength() view returns (uint256)',
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

let providerInstance = null;
let stakingContractInstance = null;
let profilesContractInstance = null;

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

export function getProfilesContract() {
  if (!profilesContractInstance) {
    profilesContractInstance = new ethers.Contract(PROFILES_CONTRACT, PROFILES_ABI, getProvider());
  }
  return profilesContractInstance;
}

export async function getLatestBlock() {
  const provider = getProvider();
  return provider.getBlockNumber();
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

export function getIndexerName(pid) {
  return `pool_${pid}`;
}

export function getWorkerIndexerName(pid, workerId, workersTotal) {
  return `pool_${pid}_worker_${workerId}_of_${workersTotal}`;
}

export async function getIndexerProgress(indexerName) {
  const [progress] = await db.select()
    .from(poolStakerIndexerProgress)
    .where(eq(poolStakerIndexerProgress.indexerName, indexerName))
    .limit(1);
  return progress;
}

export async function initIndexerProgress(indexerName, pid, genesisBlock = DFK_GENESIS_BLOCK) {
  const existing = await getIndexerProgress(indexerName);
  if (existing) return existing;
  
  await db.insert(poolStakerIndexerProgress).values({
    indexerName,
    pid,
    lastIndexedBlock: genesisBlock,
    genesisBlock,
    status: 'idle',
    totalEventsIndexed: 0,
    totalStakersFound: 0,
  });
  
  return getIndexerProgress(indexerName);
}

export async function updateIndexerProgress(indexerName, updates) {
  await db.update(poolStakerIndexerProgress)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(poolStakerIndexerProgress.indexerName, indexerName));
}

export async function getAllIndexerProgress() {
  return db.select()
    .from(poolStakerIndexerProgress)
    .orderBy(poolStakerIndexerProgress.pid);
}

async function queryEventsInChunks(contract, filter, fromBlock, toBlock, maxChunkSize = BLOCKS_PER_QUERY) {
  const allEvents = [];
  const totalBlocks = toBlock - fromBlock;
  
  if (totalBlocks <= maxChunkSize) {
    try {
      return await contract.queryFilter(filter, fromBlock, toBlock);
    } catch (err) {
      console.error(`[PoolStakerIndexer] Error querying events ${fromBlock}-${toBlock}:`, err.message);
      return [];
    }
  }
  
  for (let start = fromBlock; start <= toBlock; start += maxChunkSize) {
    const end = Math.min(start + maxChunkSize - 1, toBlock);
    try {
      const events = await contract.queryFilter(filter, start, end);
      allEvents.push(...events);
    } catch (err) {
      console.error(`[PoolStakerIndexer] Error querying events ${start}-${end}:`, err.message);
    }
    await new Promise(r => setTimeout(r, 50));
  }
  
  return allEvents;
}

export async function indexPoolEvents(pid, fromBlock, toBlock) {
  const contract = getStakingContract();
  
  const depositFilter = contract.filters.Deposit(null, pid);
  const withdrawFilter = contract.filters.Withdraw(null, pid);
  const emergencyFilter = contract.filters.EmergencyWithdraw(null, pid);
  
  const [depositEvents, withdrawEvents, emergencyEvents] = await Promise.all([
    queryEventsInChunks(contract, depositFilter, fromBlock, toBlock),
    queryEventsInChunks(contract, withdrawFilter, fromBlock, toBlock),
    queryEventsInChunks(contract, emergencyFilter, fromBlock, toBlock),
  ]);
  
  const allEvents = [
    ...depositEvents.map(e => ({ ...e, eventType: 'Deposit' })),
    ...withdrawEvents.map(e => ({ ...e, eventType: 'Withdraw' })),
    ...emergencyEvents.map(e => ({ ...e, eventType: 'EmergencyWithdraw' })),
  ];
  
  allEvents.sort((a, b) => a.blockNumber - b.blockNumber);
  
  return allEvents;
}

export async function savePoolStakers(pid, stakerUpdates) {
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
      console.error(`[PoolStakerIndexer] Error upserting staker ${staker.wallet}:`, err.message);
    }
  }
  
  return { upserted };
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

export async function getCurrentStakedBalance(pid, wallet) {
  try {
    const contract = getStakingContract();
    const userInfo = await contract.userInfo(pid, wallet);
    return ethers.formatEther(userInfo.amount);
  } catch (err) {
    console.error(`[PoolStakerIndexer] Error getting userInfo for ${wallet}:`, err.message);
    return '0';
  }
}

const runningWorkers = new Map();

export function isWorkerRunning(indexerName) {
  return runningWorkers.get(indexerName) === true;
}

export async function runIncrementalBatch(pid, options = {}) {
  const {
    batchSize = INCREMENTAL_BATCH_SIZE,
    lookupSummonerNames = true,
  } = options;
  
  const indexerName = getIndexerName(pid);
  
  if (runningWorkers.get(indexerName)) {
    console.log(`[PoolStakerIndexer] Indexer ${indexerName} already running, skipping...`);
    return { status: 'already_running' };
  }
  
  runningWorkers.set(indexerName, true);
  const startTime = Date.now();
  
  try {
    let progress = await initIndexerProgress(indexerName, pid);
    const latestBlock = await getLatestBlock();
    
    const startBlock = progress.lastIndexedBlock;
    const endBlock = Math.min(startBlock + batchSize, latestBlock);
    
    if (startBlock >= latestBlock) {
      runningWorkers.set(indexerName, false);
      return {
        status: 'complete',
        message: 'Already at latest block',
        startBlock,
        endBlock: startBlock,
        latestBlock,
        eventsFound: 0,
        stakersUpdated: 0,
        runtimeMs: Date.now() - startTime,
      };
    }
    
    console.log(`[PoolStakerIndexer] Pool ${pid}: Indexing blocks ${startBlock} to ${endBlock} (${endBlock - startBlock} blocks)`);
    
    await updateIndexerProgress(indexerName, { status: 'running' });
    
    const events = await indexPoolEvents(pid, startBlock, endBlock);
    console.log(`[PoolStakerIndexer] Pool ${pid}: Found ${events.length} events`);
    
    const walletLastActivity = new Map();
    
    for (const event of events) {
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
    console.log(`[PoolStakerIndexer] Pool ${pid}: ${wallets.length} unique wallets affected`);
    
    let summonerNames = new Map();
    if (lookupSummonerNames && wallets.length > 0) {
      console.log(`[PoolStakerIndexer] Pool ${pid}: Looking up summoner names...`);
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
    
    const { upserted } = await savePoolStakers(pid, stakerUpdates);
    
    const runtimeMs = Date.now() - startTime;
    
    const uniqueStakersResult = await db.select({ count: sql`count(*)::int` })
      .from(poolStakers)
      .where(and(
        eq(poolStakers.pid, pid),
        sql`CAST(${poolStakers.stakedLP} AS NUMERIC) > 0`
      ));
    const totalStakers = uniqueStakersResult[0]?.count || 0;
    
    await updateIndexerProgress(indexerName, {
      lastIndexedBlock: endBlock,
      totalEventsIndexed: (progress.totalEventsIndexed || 0) + events.length,
      totalStakersFound: totalStakers,
      status: endBlock >= latestBlock ? 'complete' : 'idle',
    });
    
    console.log(`[PoolStakerIndexer] Pool ${pid}: Complete. ${events.length} events, ${upserted} stakers updated in ${(runtimeMs / 1000).toFixed(1)}s`);
    
    runningWorkers.set(indexerName, false);
    
    return {
      status: 'success',
      pid,
      startBlock,
      endBlock,
      latestBlock,
      blocksRemaining: latestBlock - endBlock,
      eventsFound: events.length,
      stakersUpdated: upserted,
      totalActiveStakers: totalStakers,
      runtimeMs,
    };
  } catch (error) {
    runningWorkers.set(indexerName, false);
    console.error(`[PoolStakerIndexer] Pool ${pid} error:`, error);
    
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

export async function updateSummonerNamesForPool(pid, batchSize = 50) {
  console.log(`[PoolStakerIndexer] Updating summoner names for pool ${pid}...`);
  
  const stakers = await db.select()
    .from(poolStakers)
    .where(and(
      eq(poolStakers.pid, pid),
      sql`${poolStakers.summonerName} IS NULL`,
      sql`CAST(${poolStakers.stakedLP} AS NUMERIC) > 0`
    ))
    .limit(batchSize);
  
  if (stakers.length === 0) {
    console.log(`[PoolStakerIndexer] No stakers without summoner names for pool ${pid}`);
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
  
  console.log(`[PoolStakerIndexer] Updated ${updated} summoner names for pool ${pid}`);
  return { updated, checked: stakers.length };
}

export async function resetIndexerProgress(pid) {
  const indexerName = getIndexerName(pid);
  
  await db.delete(poolStakerIndexerProgress)
    .where(eq(poolStakerIndexerProgress.indexerName, indexerName));
  
  await db.delete(poolStakers)
    .where(eq(poolStakers.pid, pid));
  
  console.log(`[PoolStakerIndexer] Reset indexer for pool ${pid}`);
  return { reset: true };
}

// Auto-run scheduler system
const autoRunIntervals = new Map();

export function isAutoRunning(pid) {
  return autoRunIntervals.has(pid);
}

export function getAutoRunStatus() {
  const status = [];
  for (const [pid, info] of autoRunIntervals.entries()) {
    status.push({
      pid,
      intervalMs: info.intervalMs,
      startedAt: info.startedAt,
      lastRunAt: info.lastRunAt,
      runsCompleted: info.runsCompleted,
    });
  }
  return status;
}

export function startAutoRun(pid, intervalMs = 5 * 60 * 1000) {
  if (autoRunIntervals.has(pid)) {
    console.log(`[PoolStakerIndexer] Auto-run already running for pool ${pid}`);
    return { status: 'already_running', pid };
  }
  
  console.log(`[PoolStakerIndexer] Starting auto-run for pool ${pid} (interval: ${intervalMs / 1000}s)`);
  
  const info = {
    intervalMs,
    startedAt: new Date().toISOString(),
    lastRunAt: null,
    runsCompleted: 0,
    interval: null,
  };
  
  // Set the map entry FIRST to prevent duplicate starts
  autoRunIntervals.set(pid, info);
  
  // Run immediately on start (async, non-blocking)
  (async () => {
    try {
      console.log(`[PoolStakerIndexer] Auto-run initial batch for pool ${pid}`);
      await runIncrementalBatch(pid);
      info.lastRunAt = new Date().toISOString();
      info.runsCompleted++;
    } catch (err) {
      console.error(`[PoolStakerIndexer] Auto-run initial error for pool ${pid}:`, err.message);
    }
  })();
  
  // Then run on interval
  info.interval = setInterval(async () => {
    // Skip if auto-run was stopped
    if (!autoRunIntervals.has(pid)) {
      return;
    }
    try {
      console.log(`[PoolStakerIndexer] Auto-run batch for pool ${pid}`);
      const result = await runIncrementalBatch(pid);
      info.lastRunAt = new Date().toISOString();
      info.runsCompleted++;
      
      // If we've caught up to the latest block, we can just wait for next interval
      if (result.status === 'complete' && result.blocksRemaining === 0) {
        console.log(`[PoolStakerIndexer] Pool ${pid} is fully synced, waiting for new blocks`);
      }
    } catch (err) {
      console.error(`[PoolStakerIndexer] Auto-run error for pool ${pid}:`, err.message);
    }
  }, intervalMs);
  
  return { 
    status: 'started', 
    pid, 
    intervalMs,
    startedAt: info.startedAt,
  };
}

export function stopAutoRun(pid) {
  const info = autoRunIntervals.get(pid);
  
  if (!info) {
    console.log(`[PoolStakerIndexer] No auto-run active for pool ${pid}`);
    return { status: 'not_running', pid };
  }
  
  clearInterval(info.interval);
  autoRunIntervals.delete(pid);
  
  console.log(`[PoolStakerIndexer] Stopped auto-run for pool ${pid} (completed ${info.runsCompleted} runs)`);
  
  return { 
    status: 'stopped', 
    pid,
    runsCompleted: info.runsCompleted,
    startedAt: info.startedAt,
    stoppedAt: new Date().toISOString(),
  };
}

export function stopAllAutoRuns() {
  const stopped = [];
  
  for (const [pid, info] of autoRunIntervals.entries()) {
    clearInterval(info.interval);
    stopped.push({ pid, runsCompleted: info.runsCompleted });
  }
  
  autoRunIntervals.clear();
  console.log(`[PoolStakerIndexer] Stopped all auto-runs (${stopped.length} pools)`);
  
  return { status: 'all_stopped', stopped };
}
