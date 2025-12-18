import { ethers } from 'ethers';
import { db } from '../../../server/db.js';
import { poolStakersHarmony, poolEventIndexerProgressHarmony } from '../../../shared/schema.js';
import { eq, and, sql, desc } from 'drizzle-orm';

const HARMONY_RPC = 'https://api.harmony.one';
const HARMONY_RPC_BACKUP = 'https://rpc.ankr.com/harmony';
const MASTER_GARDENER_HARMONY = '0xdb30643c71ac9e2122ca0341ed77d09d5f99f924';
const PROFILES_CONTRACT_HARMONY = '0xabd4741948374b1f5dd5dd7599ac1f85a34cacdd';

const HARMONY_GENESIS_BLOCK = 16350000;
const BLOCKS_PER_QUERY = 2000;
const INCREMENTAL_BATCH_SIZE = 200000;
const AUTO_RUN_INTERVAL_MS = 60 * 1000;
export const WORKERS_PER_POOL_HARMONY = 5;
export const MIN_WORKERS_PER_POOL_HARMONY = 3;

const poolWorkerCountsHarmony = new Map();

const MASTER_GARDENER_HARMONY_ABI = [
  'event Deposit(address indexed user, uint256 indexed pid, uint256 amount)',
  'event Withdraw(address indexed user, uint256 indexed pid, uint256 amount)',
  'event EmergencyWithdraw(address indexed user, uint256 indexed pid, uint256 amount)',
  'function userInfo(uint256 pid, address user) view returns (uint256 amount, uint256 rewardDebt)',
  'function poolInfo(uint256 pid) view returns (address lpToken, uint256 allocPoint, uint256 lastRewardBlock, uint256 accJewelPerShare)',
  'function poolLength() view returns (uint256)',
];

const PROFILES_ABI_HARMONY = [
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

const liveProgressHarmony = new Map();

let harmonyTablesInitialized = false;

export async function ensureHarmonyTablesExist() {
  if (harmonyTablesInitialized) return;
  
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS pool_stakers_harmony (
        id SERIAL PRIMARY KEY,
        wallet TEXT NOT NULL,
        pid INTEGER NOT NULL,
        staked_lp NUMERIC(38, 18) NOT NULL DEFAULT '0',
        summoner_name TEXT,
        last_activity_type TEXT,
        last_activity_amount NUMERIC(38, 18),
        last_activity_block BIGINT,
        last_activity_tx_hash TEXT,
        last_updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS pool_stakers_harmony_wallet_pid_idx ON pool_stakers_harmony(wallet, pid)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS pool_stakers_harmony_pid_idx ON pool_stakers_harmony(pid)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS pool_stakers_harmony_staked_lp_idx ON pool_stakers_harmony(staked_lp)`);
    
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS pool_event_indexer_progress_harmony (
        id SERIAL PRIMARY KEY,
        indexer_name TEXT NOT NULL UNIQUE,
        indexer_type TEXT NOT NULL,
        pid INTEGER NOT NULL,
        lp_token TEXT,
        last_indexed_block BIGINT NOT NULL,
        genesis_block BIGINT NOT NULL,
        range_end BIGINT,
        status TEXT NOT NULL DEFAULT 'idle',
        total_events_indexed INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    await db.execute(sql`CREATE INDEX IF NOT EXISTS pool_event_indexer_progress_harmony_pid_idx ON pool_event_indexer_progress_harmony(pid)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS pool_event_indexer_progress_harmony_type_idx ON pool_event_indexer_progress_harmony(indexer_type)`);
    
    harmonyTablesInitialized = true;
    console.log('[HarmonyIndexer] ✓ Tables initialized');
  } catch (error) {
    if (error.code === '42P07') {
      harmonyTablesInitialized = true;
    } else {
      console.error('[HarmonyIndexer] Error creating tables:', error.message);
    }
  }
}

function getWorkerKeyHarmony(pid, workerId = 0) {
  return `harmony_${pid}_w${workerId}`;
}

export function getUnifiedLiveProgressHarmony(pid, workerId = null) {
  if (workerId !== null) {
    return liveProgressHarmony.get(getWorkerKeyHarmony(pid, workerId)) || null;
  }
  const workers = [];
  for (let w = 0; w < WORKERS_PER_POOL_HARMONY; w++) {
    const progress = liveProgressHarmony.get(getWorkerKeyHarmony(pid, w));
    if (progress) workers.push({ workerId: w, ...progress });
  }
  const legacy = liveProgressHarmony.get(`harmony_${pid}`);
  if (legacy && workers.length === 0) return legacy;
  if (workers.length === 0) return null;
  
  const aggregated = {
    isRunning: workers.some(w => w.isRunning),
    currentBlock: Math.max(...workers.map(w => w.currentBlock || 0)),
    targetBlock: Math.max(...workers.map(w => w.targetBlock || 0)),
    genesisBlock: Math.min(...workers.map(w => w.genesisBlock || 0)),
    stakersFound: workers.reduce((sum, w) => sum + (w.stakersFound || 0), 0),
    batchesCompleted: workers.reduce((sum, w) => sum + (w.batchesCompleted || 0), 0),
    startedAt: workers[0]?.startedAt,
    lastBatchAt: workers.map(w => w.lastBatchAt).filter(Boolean).sort().pop() || null,
    percentComplete: workers.reduce((sum, w) => sum + (w.percentComplete || 0), 0) / workers.length,
    completedAt: workers.every(w => w.completedAt) ? workers.map(w => w.completedAt).sort().pop() : null,
    workers,
  };
  return aggregated;
}

export function getAllUnifiedLiveProgressHarmony() {
  const result = [];
  const poolIds = new Set();
  for (const key of liveProgressHarmony.keys()) {
    const match = key.match(/harmony_(\d+)(?:_w\d+)?$/);
    if (match) poolIds.add(parseInt(match[1]));
  }
  for (const pid of Array.from(poolIds).sort((a, b) => a - b)) {
    const progress = getUnifiedLiveProgressHarmony(pid);
    if (progress) result.push({ pid, ...progress });
  }
  return result;
}

function updateLiveProgressHarmony(pid, updates, workerId = 0) {
  const key = getWorkerKeyHarmony(pid, workerId);
  const current = liveProgressHarmony.get(key) || {
    isRunning: false,
    currentBlock: 0,
    targetBlock: 0,
    genesisBlock: 0,
    rangeStart: 0,
    rangeEnd: 0,
    stakersFound: 0,
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
  liveProgressHarmony.set(key, updated);
  return updated;
}

function clearLiveProgressHarmony(pid, workerId = null) {
  if (workerId !== null) {
    liveProgressHarmony.delete(getWorkerKeyHarmony(pid, workerId));
  } else {
    for (let w = 0; w < WORKERS_PER_POOL_HARMONY; w++) {
      liveProgressHarmony.delete(getWorkerKeyHarmony(pid, w));
    }
    liveProgressHarmony.delete(`harmony_${pid}`);
  }
}

let providerInstanceHarmony = null;
let gardenerContractHarmonyInstance = null;
let profilesContractHarmonyInstance = null;

export function getProviderHarmony() {
  if (!providerInstanceHarmony) {
    providerInstanceHarmony = new ethers.JsonRpcProvider(HARMONY_RPC);
  }
  return providerInstanceHarmony;
}

export function getGardenerContractHarmony() {
  if (!gardenerContractHarmonyInstance) {
    gardenerContractHarmonyInstance = new ethers.Contract(MASTER_GARDENER_HARMONY, MASTER_GARDENER_HARMONY_ABI, getProviderHarmony());
  }
  return gardenerContractHarmonyInstance;
}

export function getProfilesContractHarmony() {
  if (!profilesContractHarmonyInstance) {
    profilesContractHarmonyInstance = new ethers.Contract(PROFILES_CONTRACT_HARMONY, PROFILES_ABI_HARMONY, getProviderHarmony());
  }
  return profilesContractHarmonyInstance;
}

export async function getLatestBlockHarmony() {
  const provider = getProviderHarmony();
  return provider.getBlockNumber();
}

export async function getPoolLPTokenHarmony(pid) {
  try {
    const contract = getGardenerContractHarmony();
    const poolInfo = await contract.poolInfo(pid);
    return poolInfo.lpToken || poolInfo[0];
  } catch (err) {
    console.error(`[HarmonyIndexer] Error getting LP token for pool ${pid}:`, err.message);
    return null;
  }
}

export async function getPoolLengthHarmony() {
  try {
    const contract = getGardenerContractHarmony();
    const length = await contract.poolLength();
    return Number(length);
  } catch (err) {
    console.error(`[HarmonyIndexer] Error getting pool length:`, err.message);
    return 0;
  }
}

export async function getSummonerNameHarmony(walletAddress) {
  try {
    const contract = getProfilesContractHarmony();
    const profile = await contract.addressToProfile(walletAddress);
    return profile.name || null;
  } catch (err) {
    return null;
  }
}

export async function batchGetSummonerNamesHarmony(walletAddresses, batchSize = 10) {
  const results = new Map();
  for (let i = 0; i < walletAddresses.length; i += batchSize) {
    const batch = walletAddresses.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(async (addr) => {
        const name = await getSummonerNameHarmony(addr);
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

export async function getCurrentStakedBalanceHarmony(pid, wallet) {
  try {
    const contract = getGardenerContractHarmony();
    const userInfo = await contract.userInfo(pid, wallet);
    return ethers.formatEther(userInfo.amount || userInfo[0]);
  } catch (err) {
    console.error(`[HarmonyIndexer] Error getting userInfo for ${wallet}:`, err.message);
    return '0';
  }
}

export function getUnifiedIndexerNameHarmony(pid, workerId = null) {
  if (workerId !== null && workerId > 0) {
    return `harmony_pool_${pid}_w${workerId}`;
  }
  return `harmony_pool_${pid}`;
}

export async function getUnifiedIndexerProgressHarmony(indexerName) {
  const [progress] = await db.select()
    .from(poolEventIndexerProgressHarmony)
    .where(eq(poolEventIndexerProgressHarmony.indexerName, indexerName))
    .limit(1);
  return progress;
}

export async function initUnifiedIndexerProgressHarmony(indexerName, pid, lpToken, genesisBlock = HARMONY_GENESIS_BLOCK, rangeEnd = null) {
  const existing = await getUnifiedIndexerProgressHarmony(indexerName);
  if (existing) return existing;
  
  await db.insert(poolEventIndexerProgressHarmony).values({
    indexerName,
    indexerType: 'harmony',
    pid,
    lpToken,
    lastIndexedBlock: genesisBlock,
    genesisBlock,
    rangeEnd: rangeEnd || null,
    status: 'idle',
    totalEventsIndexed: 0,
  });
  
  return getUnifiedIndexerProgressHarmony(indexerName);
}

export async function updateUnifiedIndexerProgressHarmony(indexerName, updates) {
  await db.update(poolEventIndexerProgressHarmony)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(poolEventIndexerProgressHarmony.indexerName, indexerName));
}

export async function getAllUnifiedIndexerProgressHarmony() {
  await ensureHarmonyTablesExist();
  return db.select()
    .from(poolEventIndexerProgressHarmony)
    .where(eq(poolEventIndexerProgressHarmony.indexerType, 'harmony'))
    .orderBy(poolEventIndexerProgressHarmony.pid);
}

async function queryEventsInChunksHarmony(contract, filter, fromBlock, toBlock, maxChunkSize = BLOCKS_PER_QUERY) {
  const allEvents = [];
  
  if (toBlock - fromBlock <= maxChunkSize) {
    try {
      return await contract.queryFilter(filter, fromBlock, toBlock);
    } catch (err) {
      console.error(`[HarmonyIndexer] Error querying events ${fromBlock}-${toBlock}:`, err.message);
      return [];
    }
  }
  
  for (let start = fromBlock; start <= toBlock; start += maxChunkSize) {
    const end = Math.min(start + maxChunkSize - 1, toBlock);
    try {
      const events = await contract.queryFilter(filter, start, end);
      allEvents.push(...events);
    } catch (err) {
      console.error(`[HarmonyIndexer] Error querying events ${start}-${end}:`, err.message);
    }
    await new Promise(r => setTimeout(r, 50));
  }
  
  return allEvents;
}

export async function indexAllPoolEventsHarmony(pid, fromBlock, toBlock) {
  const gardenerContract = getGardenerContractHarmony();
  
  const [depositEvents, withdrawEvents, emergencyEvents] = await Promise.all([
    queryEventsInChunksHarmony(gardenerContract, gardenerContract.filters.Deposit(null, pid), fromBlock, toBlock),
    queryEventsInChunksHarmony(gardenerContract, gardenerContract.filters.Withdraw(null, pid), fromBlock, toBlock),
    queryEventsInChunksHarmony(gardenerContract, gardenerContract.filters.EmergencyWithdraw(null, pid), fromBlock, toBlock),
  ]);
  
  return {
    deposits: depositEvents.map(e => ({ ...e, eventType: 'Deposit' })),
    withdraws: withdrawEvents.map(e => ({ ...e, eventType: 'Withdraw' })),
    emergencyWithdraws: emergencyEvents.map(e => ({ ...e, eventType: 'EmergencyWithdraw' })),
  };
}

async function saveStakerUpdatesHarmony(pid, stakerUpdates) {
  if (!stakerUpdates || stakerUpdates.length === 0) return { upserted: 0 };
  
  let upserted = 0;
  
  for (const staker of stakerUpdates) {
    try {
      await db.insert(poolStakersHarmony).values({
        wallet: staker.wallet.toLowerCase(),
        pid,
        stakedLP: staker.stakedLP,
        summonerName: staker.summonerName || null,
        lastActivityType: staker.lastActivityType,
        lastActivityAmount: staker.lastActivityAmount,
        lastActivityBlock: staker.lastActivityBlock,
        lastActivityTxHash: staker.lastActivityTxHash,
      }).onConflictDoUpdate({
        target: [poolStakersHarmony.wallet, poolStakersHarmony.pid],
        set: {
          stakedLP: staker.stakedLP,
          summonerName: staker.summonerName || sql`${poolStakersHarmony.summonerName}`,
          lastActivityType: staker.lastActivityType,
          lastActivityAmount: staker.lastActivityAmount,
          lastActivityBlock: staker.lastActivityBlock,
          lastActivityTxHash: staker.lastActivityTxHash,
          lastUpdatedAt: new Date(),
        },
      });
      upserted++;
    } catch (err) {
      console.error(`[HarmonyIndexer] Error upserting staker ${staker.wallet}:`, err.message);
    }
  }
  
  return { upserted };
}

const runningWorkersHarmony = new Map();

export function isUnifiedWorkerRunningHarmony(indexerName) {
  return runningWorkersHarmony.get(indexerName) === true;
}

export async function runUnifiedIncrementalBatchHarmony(pid, options = {}) {
  const {
    batchSize = INCREMENTAL_BATCH_SIZE,
    lookupSummonerNames = true,
    workerId = 0,
    rangeStart = null,
    rangeEnd = null,
  } = options;
  
  const indexerName = getUnifiedIndexerNameHarmony(pid, workerId);
  
  if (runningWorkersHarmony.get(indexerName)) {
    console.log(`[HarmonyIndexer] Indexer ${indexerName} already running, skipping...`);
    return { status: 'already_running' };
  }
  
  runningWorkersHarmony.set(indexerName, true);
  const startTime = Date.now();
  
  try {
    const lpToken = await getPoolLPTokenHarmony(pid);
    if (!lpToken) {
      runningWorkersHarmony.set(indexerName, false);
      return { status: 'error', error: 'Could not get LP token address' };
    }
    
    const workerGenesisBlock = rangeStart !== null ? rangeStart : HARMONY_GENESIS_BLOCK;
    let progress = await initUnifiedIndexerProgressHarmony(indexerName, pid, lpToken, workerGenesisBlock, rangeEnd);
    const latestBlock = await getLatestBlockHarmony();
    
    const workerTargetBlock = (progress.rangeEnd !== null && progress.rangeEnd !== undefined) 
      ? Math.min(progress.rangeEnd, latestBlock) 
      : latestBlock;
    
    const startBlock = progress.lastIndexedBlock;
    const endBlock = Math.min(startBlock + batchSize, workerTargetBlock);
    
    const existingLive = getUnifiedLiveProgressHarmony(pid, workerId);
    const dbGenesisBlock = progress.genesisBlock || 0;
    updateLiveProgressHarmony(pid, {
      isRunning: true,
      currentBlock: startBlock,
      targetBlock: workerTargetBlock,
      genesisBlock: dbGenesisBlock,
      rangeStart: workerGenesisBlock,
      rangeEnd: workerTargetBlock,
      stakersFound: existingLive?.stakersFound || 0,
      batchesCompleted: existingLive?.batchesCompleted || 0,
      startedAt: existingLive?.startedAt || new Date().toISOString(),
      lastBatchAt: null,
    }, workerId);
    
    if (startBlock >= workerTargetBlock) {
      runningWorkersHarmony.set(indexerName, false);
      updateLiveProgressHarmony(pid, { 
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
    console.log(`[HarmonyIndexer] Pool ${pid}${workerLabel}: Indexing blocks ${startBlock} to ${endBlock} (${endBlock - startBlock} blocks)`);
    
    await updateUnifiedIndexerProgressHarmony(indexerName, { status: 'running' });
    
    const events = await indexAllPoolEventsHarmony(pid, startBlock, endBlock);
    
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
      console.log(`[HarmonyIndexer] Pool ${pid}: Looking up summoner names for ${wallets.length} wallets...`);
      summonerNames = await batchGetSummonerNamesHarmony(wallets, 10);
    }
    
    const stakerUpdates = [];
    for (const wallet of wallets) {
      const activity = walletLastActivity.get(wallet);
      const currentBalance = await getCurrentStakedBalanceHarmony(pid, wallet);
      
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
    
    const saveResult = await saveStakerUpdatesHarmony(pid, stakerUpdates);
    
    await updateUnifiedIndexerProgressHarmony(indexerName, {
      lastIndexedBlock: endBlock,
      status: endBlock >= workerTargetBlock ? 'complete' : 'idle',
      totalEventsIndexed: (progress.totalEventsIndexed || 0) + stakerEvents.length,
    });
    
    const existingProgress = getUnifiedLiveProgressHarmony(pid, workerId);
    updateLiveProgressHarmony(pid, {
      isRunning: false,
      currentBlock: endBlock,
      stakersFound: (existingProgress?.stakersFound || 0) + stakerUpdates.length,
      batchesCompleted: (existingProgress?.batchesCompleted || 0) + 1,
      lastBatchAt: new Date().toISOString(),
      completedAt: endBlock >= workerTargetBlock ? new Date().toISOString() : null,
    }, workerId);
    
    runningWorkersHarmony.set(indexerName, false);
    
    const runtimeMs = Date.now() - startTime;
    console.log(`[HarmonyIndexer] Pool ${pid}${workerLabel}: Completed batch in ${runtimeMs}ms. Found ${stakerEvents.length} events, updated ${saveResult.upserted} stakers.`);
    
    return {
      status: endBlock >= workerTargetBlock ? 'complete' : 'partial',
      startBlock,
      endBlock,
      latestBlock,
      workerTargetBlock,
      eventsFound: stakerEvents.length,
      stakersUpdated: saveResult.upserted,
      workerId,
      runtimeMs,
    };
  } catch (err) {
    runningWorkersHarmony.set(indexerName, false);
    console.error(`[HarmonyIndexer] Error in runUnifiedIncrementalBatchHarmony:`, err);
    await updateUnifiedIndexerProgressHarmony(indexerName, {
      status: 'error',
      lastError: err.message,
    });
    updateLiveProgressHarmony(pid, { isRunning: false }, workerId);
    return { status: 'error', error: err.message };
  }
}

const autoRunIntervalsHarmony = new Map();

export function startAutoRunHarmony(pid, options = {}) {
  const key = `harmony_${pid}`;
  if (autoRunIntervalsHarmony.has(key)) {
    console.log(`[HarmonyIndexer] Auto-run already active for pool ${pid}`);
    return { status: 'already_running' };
  }
  
  const { workerCount = WORKERS_PER_POOL_HARMONY } = options;
  poolWorkerCountsHarmony.set(pid, workerCount);
  
  console.log(`[HarmonyIndexer] Starting auto-run for pool ${pid} with ${workerCount} workers`);
  
  const runAllWorkers = async () => {
    const currentWorkerCount = poolWorkerCountsHarmony.get(pid) || workerCount;
    const promises = [];
    for (let w = 0; w < currentWorkerCount; w++) {
      promises.push(runUnifiedIncrementalBatchHarmony(pid, { ...options, workerId: w }));
    }
    await Promise.all(promises);
  };
  
  runAllWorkers();
  
  const interval = setInterval(runAllWorkers, AUTO_RUN_INTERVAL_MS);
  autoRunIntervalsHarmony.set(key, interval);
  
  return { status: 'started', workerCount };
}

export function stopAutoRunHarmony(pid) {
  const key = `harmony_${pid}`;
  const interval = autoRunIntervalsHarmony.get(key);
  if (interval) {
    clearInterval(interval);
    autoRunIntervalsHarmony.delete(key);
    poolWorkerCountsHarmony.delete(pid);
    console.log(`[HarmonyIndexer] Stopped auto-run for pool ${pid}`);
    return { status: 'stopped' };
  }
  return { status: 'not_running' };
}

export function isAutoRunActiveHarmony(pid) {
  return autoRunIntervalsHarmony.has(`harmony_${pid}`);
}

export async function getPoolStakersHarmony(pid) {
  return db.select()
    .from(poolStakersHarmony)
    .where(eq(poolStakersHarmony.pid, pid))
    .orderBy(desc(poolStakersHarmony.stakedLP));
}

export async function getPoolStakersCountHarmony(pid) {
  const result = await db.select({ count: sql`count(*)::int` })
    .from(poolStakersHarmony)
    .where(and(
      eq(poolStakersHarmony.pid, pid),
      sql`${poolStakersHarmony.stakedLP} > 0`
    ));
  return result[0]?.count || 0;
}

export async function getTotalStakedHarmony(pid) {
  const result = await db.select({ total: sql`sum(${poolStakersHarmony.stakedLP})` })
    .from(poolStakersHarmony)
    .where(eq(poolStakersHarmony.pid, pid));
  return result[0]?.total || '0';
}

export async function getHarmonyPoolStats() {
  await ensureHarmonyTablesExist();
  const poolLength = await getPoolLengthHarmony();
  const stats = [];
  
  for (let pid = 0; pid < Math.min(poolLength, 20); pid++) {
    const lpToken = await getPoolLPTokenHarmony(pid);
    if (!lpToken || lpToken === '0x0000000000000000000000000000000000000000') continue;
    
    const stakerCount = await getPoolStakersCountHarmony(pid);
    const totalStaked = await getTotalStakedHarmony(pid);
    const progress = getUnifiedLiveProgressHarmony(pid);
    const isAutoRunning = isAutoRunActiveHarmony(pid);
    
    stats.push({
      pid,
      lpToken,
      stakerCount,
      totalStaked,
      isRunning: progress?.isRunning || false,
      isAutoRunning,
      percentComplete: progress?.percentComplete || 0,
      workers: progress?.workers || [],
    });
  }
  
  return stats;
}

export async function resetPoolProgressHarmony(pid) {
  const workerCount = poolWorkerCountsHarmony.get(pid) || WORKERS_PER_POOL_HARMONY;
  
  for (let w = 0; w < workerCount; w++) {
    const indexerName = getUnifiedIndexerNameHarmony(pid, w);
    await db.delete(poolEventIndexerProgressHarmony)
      .where(eq(poolEventIndexerProgressHarmony.indexerName, indexerName));
    clearLiveProgressHarmony(pid, w);
  }
  
  const mainIndexerName = getUnifiedIndexerNameHarmony(pid, null);
  await db.delete(poolEventIndexerProgressHarmony)
    .where(eq(poolEventIndexerProgressHarmony.indexerName, mainIndexerName));
  clearLiveProgressHarmony(pid, null);
  
  console.log(`[HarmonyIndexer] Reset progress for pool ${pid}`);
  return { status: 'reset', pid };
}
