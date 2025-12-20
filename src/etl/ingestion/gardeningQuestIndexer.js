import { ethers } from 'ethers';
import { db } from '../../../server/db.js';
import { gardeningQuestRewards, gardeningQuestIndexerProgress } from '../../../shared/schema.js';
import { eq, sql, desc } from 'drizzle-orm';

const DFK_CHAIN_RPC = 'https://subnets.avax.network/defi-kingdoms/dfk-chain/rpc';
const QUEST_CORE_V3 = '0x530fff22987E137e7C8D2aDcC4c15eb45b4FA752';
// RewardMinted events are emitted from the QuestReward contract, NOT Quest Core V3
const QUEST_REWARD_CONTRACT = '0x39a06d3e1b6b1b24c477d90770f317abb4b8f928';

const DFK_GENESIS_BLOCK = 0;
const BLOCKS_PER_QUERY = 2000;
const INCREMENTAL_BATCH_SIZE = 200000;
const AUTO_RUN_INTERVAL_MS = 60 * 1000;

export const GARDENING_WORKERS = 5;
export const MIN_GARDENING_WORKERS = 3;

const GARDENING_QUEST_ADDRESS = '0x6FF019415Ee105aCF2Ac52483A33F5B43eaDB8d0';

const CRYSTAL_ADDRESS = '0x04b9dA42306B023f3572e106B11972dE7f66e4F7'.toLowerCase();
const JEWEL_ADDRESS = '0xCCb93dABD71c8Dad03Fc4CE5559dC3D89F67a260'.toLowerCase();

const TOKEN_SYMBOLS = {
  [CRYSTAL_ADDRESS]: 'CRYSTAL',
  [JEWEL_ADDRESS]: 'JEWEL',
};

const QUEST_CORE_ABI = [
  'event RewardMinted(uint256 indexed questId, address indexed player, uint256 heroId, address indexed reward, uint256 amount, uint256 data)',
  'event QuestCompleted(uint256 indexed questId, address indexed player, uint256 indexed heroId, tuple(uint256 id, uint256 questInstanceId, uint8 level, uint256[] heroes, address player, uint256 startBlock, uint256 startAtTime, uint256 completeAtTime, uint8 attempts, uint8 status, uint8 questType) quest)',
  'event ExpeditionIterationProcessed(uint256 indexed expeditionId, uint256 indexed questId, address indexed player, uint256[] heroIds, uint256 iterationsProcessed, uint256 totalFee, uint40 lastClaimedAt, uint16 staminaPotions, uint16 petTreats)',
  'function getQuest(uint256 _questId) view returns (tuple(uint256 id, uint256 questInstanceId, uint8 level, uint256[] heroes, address player, uint256 startBlock, uint256 startAtTime, uint256 completeAtTime, uint8 attempts, uint8 status, uint8 questType))',
];

const questTypeCache = new Map();

const liveProgress = new Map();
const workerLiveProgress = new Map();
const autoRunIntervals = new Map();
const runningWorkers = new Map();
const donorReservations = new Map();

let activeWorkerCount = 0;

export function getGardeningQuestLiveProgress() {
  return liveProgress.get('gardening_quest') || null;
}

function updateLiveProgress(updates) {
  const current = liveProgress.get('gardening_quest') || {
    isRunning: false,
    currentBlock: 0,
    targetBlock: 0,
    genesisBlock: 0,
    eventsFound: 0,
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
  liveProgress.set('gardening_quest', updated);
  return updated;
}

function clearLiveProgress() {
  liveProgress.delete('gardening_quest');
}

function getWorkerKey(workerId) {
  return `gardening_quest_worker_${workerId}`;
}

function getWorkerIndexerName(workerId) {
  return `gardening_quest_worker_${workerId}`;
}

function updateWorkerLiveProgress(workerId, updates) {
  const key = getWorkerKey(workerId);
  const current = workerLiveProgress.get(key) || {
    workerId,
    isRunning: false,
    currentBlock: 0,
    targetBlock: 0,
    rangeStart: 0,
    rangeEnd: null,
    eventsFound: 0,
    batchesCompleted: 0,
    startedAt: null,
    lastBatchAt: null,
    percentComplete: 0,
    completedAt: null,
  };
  const updated = { ...current, ...updates };
  if (updates.percentComplete === undefined && updated.targetBlock > updated.rangeStart) {
    const totalBlocks = updated.targetBlock - updated.rangeStart;
    const indexedBlocks = updated.currentBlock - updated.rangeStart;
    updated.percentComplete = Math.min(100, Math.max(0, (indexedBlocks / totalBlocks) * 100));
  }
  workerLiveProgress.set(key, updated);
  return updated;
}

function clearWorkerLiveProgress(workerId) {
  workerLiveProgress.delete(getWorkerKey(workerId));
}

export function getGardeningWorkersLiveProgress() {
  const workers = [];
  for (let w = 0; w < GARDENING_WORKERS; w++) {
    const progress = workerLiveProgress.get(getWorkerKey(w));
    if (progress) {
      workers.push({ workerId: w, ...progress });
    }
  }
  return workers;
}

let providerInstance = null;
let questContractInstance = null;
let rewardContractInstance = null;

// ABI for the QuestReward contract that emits RewardMinted events
const QUEST_REWARD_ABI = [
  'event RewardMinted(uint256 indexed questId, address indexed player, uint256 heroId, address indexed reward, uint256 amount, uint256 data)',
];

export function getProvider() {
  if (!providerInstance) {
    providerInstance = new ethers.JsonRpcProvider(DFK_CHAIN_RPC);
  }
  return providerInstance;
}

export function getQuestContract() {
  if (!questContractInstance) {
    questContractInstance = new ethers.Contract(QUEST_CORE_V3, QUEST_CORE_ABI, getProvider());
  }
  return questContractInstance;
}

// Get the reward contract for querying RewardMinted events
export function getRewardContract() {
  if (!rewardContractInstance) {
    rewardContractInstance = new ethers.Contract(QUEST_REWARD_CONTRACT, QUEST_REWARD_ABI, getProvider());
  }
  return rewardContractInstance;
}

export async function getLatestBlock() {
  const provider = getProvider();
  return provider.getBlockNumber();
}

export function getIndexerName() {
  return 'gardening_quest';
}

let tablesInitialized = false;

async function ensureTablesExist() {
  if (tablesInitialized) return;
  
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS gardening_quest_indexer_progress (
        id SERIAL PRIMARY KEY,
        indexer_name TEXT NOT NULL UNIQUE,
        last_indexed_block BIGINT NOT NULL DEFAULT 0,
        genesis_block BIGINT NOT NULL DEFAULT 0,
        range_start BIGINT,
        range_end BIGINT,
        status TEXT NOT NULL DEFAULT 'idle',
        total_events_indexed INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
      )
    `);
    
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS gardening_quest_rewards (
        id SERIAL PRIMARY KEY,
        quest_id BIGINT NOT NULL,
        hero_id BIGINT NOT NULL,
        player TEXT NOT NULL,
        pool_id INTEGER NOT NULL,
        reward_token TEXT NOT NULL,
        reward_symbol TEXT,
        reward_amount NUMERIC(38, 18) NOT NULL,
        source TEXT DEFAULT 'manual_quest',
        expedition_id BIGINT,
        block_number BIGINT NOT NULL,
        tx_hash TEXT NOT NULL,
        log_index INTEGER NOT NULL,
        timestamp TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
      )
    `);
    
    // Add new columns if they don't exist (for existing tables)
    await db.execute(sql`ALTER TABLE gardening_quest_rewards ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual_quest'`);
    await db.execute(sql`ALTER TABLE gardening_quest_rewards ADD COLUMN IF NOT EXISTS expedition_id BIGINT`);
    
    await db.execute(sql`CREATE INDEX IF NOT EXISTS gardening_quest_rewards_hero_idx ON gardening_quest_rewards(hero_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS gardening_quest_rewards_player_idx ON gardening_quest_rewards(player)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS gardening_quest_rewards_pool_idx ON gardening_quest_rewards(pool_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS gardening_quest_rewards_token_idx ON gardening_quest_rewards(reward_token)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS gardening_quest_rewards_source_idx ON gardening_quest_rewards(source)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS gardening_quest_rewards_timestamp_idx ON gardening_quest_rewards(timestamp)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS gardening_quest_rewards_block_idx ON gardening_quest_rewards(block_number)`);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS gardening_quest_rewards_unique_idx ON gardening_quest_rewards(tx_hash, log_index)`);
    
    tablesInitialized = true;
    console.log('[GardeningQuest] ✓ Tables initialized');
  } catch (error) {
    if (error.code === '42P07') {
      tablesInitialized = true;
    } else {
      console.error('[GardeningQuest] Error creating tables:', error.message);
    }
  }
}

export async function getIndexerProgress(indexerName) {
  await ensureTablesExist();
  const [progress] = await db.select()
    .from(gardeningQuestIndexerProgress)
    .where(eq(gardeningQuestIndexerProgress.indexerName, indexerName))
    .limit(1);
  return progress;
}

export async function initIndexerProgress(indexerName, genesisBlock = DFK_GENESIS_BLOCK) {
  const existing = await getIndexerProgress(indexerName);
  if (existing) return existing;
  
  await db.insert(gardeningQuestIndexerProgress).values({
    indexerName,
    lastIndexedBlock: genesisBlock,
    genesisBlock,
    status: 'idle',
    totalEventsIndexed: 0,
  });
  
  return getIndexerProgress(indexerName);
}

async function initWorkerProgress(workerId, rangeStart, rangeEnd) {
  const indexerName = getWorkerIndexerName(workerId);
  const existing = await getIndexerProgress(indexerName);
  
  if (existing) {
    await db.update(gardeningQuestIndexerProgress)
      .set({
        rangeStart,
        rangeEnd,
        status: 'idle',
        updatedAt: sql`CURRENT_TIMESTAMP`,
      })
      .where(eq(gardeningQuestIndexerProgress.indexerName, indexerName));
    return;
  }
  
  await db.insert(gardeningQuestIndexerProgress).values({
    indexerName,
    lastIndexedBlock: rangeStart,
    genesisBlock: rangeStart,
    rangeStart,
    rangeEnd,
    status: 'idle',
    totalEventsIndexed: 0,
  });
}

export async function updateIndexerProgress(indexerName, updates) {
  await db.update(gardeningQuestIndexerProgress)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(gardeningQuestIndexerProgress.indexerName, indexerName));
}

// Fetch quest type from on-chain if not available in logs
async function getQuestTypeFromChain(questId) {
  if (questTypeCache.has(questId)) {
    return questTypeCache.get(questId);
  }
  
  try {
    const questContract = getQuestContract();
    const quest = await questContract.getQuest(questId);
    const questType = Number(quest.questType);
    questTypeCache.set(questId, questType);
    return questType;
  } catch (e) {
    return null;
  }
}

// Returns Map<questId, { questType, source, expeditionId }> for all quests in a transaction
async function getQuestInfoMapFromTx(txHash) {
  const questInfoMap = new Map();
  
  try {
    const provider = getProvider();
    const tx = await provider.getTransactionReceipt(txHash);
    if (!tx) return questInfoMap;
    
    const questContract = getQuestContract();
    const questCompletedTopic = questContract.interface.getEvent('QuestCompleted').topicHash;
    const expeditionIterationTopic = questContract.interface.getEvent('ExpeditionIterationProcessed').topicHash;
    
    // Parse all QuestCompleted events - these are manual quests
    for (const log of tx.logs) {
      if (log.topics[0] === questCompletedTopic) {
        try {
          const parsed = questContract.interface.parseLog({
            topics: log.topics,
            data: log.data,
          });
          const questId = Number(parsed.args.questId);
          const questType = Number(parsed.args.quest.questType);
          questTypeCache.set(questId, questType);
          questInfoMap.set(questId, {
            questType,
            source: 'manual_quest',
            expeditionId: null,
          });
        } catch (e) {
          continue;
        }
      }
    }
    
    // Parse all ExpeditionIterationProcessed events - these are expedition rewards
    for (const log of tx.logs) {
      if (log.topics[0] === expeditionIterationTopic) {
        try {
          const parsed = questContract.interface.parseLog({
            topics: log.topics,
            data: log.data,
          });
          const questId = Number(parsed.args.questId);
          const expeditionId = Number(parsed.args.expeditionId);
          
          // Check if we already have questType from a QuestCompleted event in this tx
          if (questInfoMap.has(questId)) {
            const existing = questInfoMap.get(questId);
            questInfoMap.set(questId, {
              questType: existing.questType,
              source: 'expedition',
              expeditionId,
            });
            continue;
          }
          
          // Try to find questType from quest events in same tx first
          let questType = null;
          for (const qLog of tx.logs) {
            if (qLog.address.toLowerCase() === QUEST_CORE_V3.toLowerCase()) {
              try {
                const qParsed = questContract.interface.parseLog({
                  topics: qLog.topics,
                  data: qLog.data,
                });
                if (qParsed.args.quest && qParsed.args.quest.questType !== undefined) {
                  const foundQuestId = qParsed.args.questId ? Number(qParsed.args.questId) : null;
                  if (foundQuestId === questId || foundQuestId === null) {
                    questType = Number(qParsed.args.quest.questType);
                    break;
                  }
                }
              } catch (e) {
                continue;
              }
            }
          }
          
          // If still no questType, fetch from chain
          if (questType === null) {
            questType = await getQuestTypeFromChain(questId);
          }
          
          questInfoMap.set(questId, {
            questType,
            source: 'expedition',
            expeditionId,
          });
        } catch (e) {
          continue;
        }
      }
    }
    
    return questInfoMap;
  } catch (e) {
    return questInfoMap;
  }
}

async function indexBlockRange(fromBlock, toBlock, indexerName, workerId = null) {
  // Use the reward contract for querying RewardMinted events (they're emitted from QuestReward, not QuestCore)
  const rewardContract = getRewardContract();
  const provider = getProvider();
  
  let currentBlock = fromBlock;
  let totalEventsFound = 0;
  let batchCount = 0;
  
  const rewardMintedFilter = rewardContract.filters.RewardMinted();
  
  while (currentBlock <= toBlock) {
    const endBlock = Math.min(currentBlock + BLOCKS_PER_QUERY - 1, toBlock);
    
    try {
      const logs = await rewardContract.queryFilter(rewardMintedFilter, currentBlock, endBlock);
      
      let eventsInBatch = 0;
      if (logs.length > 0) {
        const events = [];
        const txQuestInfoMaps = new Map(); // txHash -> Map<questId, questInfo>
        
        for (const log of logs) {
          const txHash = log.transactionHash;
          const questId = Number(log.args.questId);
          
          // Get quest info map for this transaction (cached)
          if (!txQuestInfoMaps.has(txHash)) {
            const questInfoMap = await getQuestInfoMapFromTx(txHash);
            txQuestInfoMaps.set(txHash, questInfoMap);
          }
          
          const questInfoMap = txQuestInfoMaps.get(txHash);
          const questInfo = questInfoMap.get(questId);
          
          // Include gardening quests (types 0-14) from both manual quests and expeditions
          if (questInfo && questInfo.questType !== null && questInfo.questType >= 0 && questInfo.questType <= 14) {
            const block = await provider.getBlock(log.blockNumber);
            const rewardAddress = log.args.reward.toLowerCase();
            const rewardSymbol = TOKEN_SYMBOLS[rewardAddress] || 'ITEM';
            
            events.push({
              questId,
              heroId: Number(log.args.heroId),
              player: log.args.player.toLowerCase(),
              poolId: questInfo.questType,
              rewardToken: rewardAddress,
              rewardSymbol,
              rewardAmount: ethers.formatEther(log.args.amount),
              source: questInfo.source,
              expeditionId: questInfo.expeditionId,
              blockNumber: log.blockNumber,
              txHash: log.transactionHash,
              logIndex: log.index,
              timestamp: new Date(block.timestamp * 1000),
            });
          }
        }
        
        if (events.length > 0) {
          await db.insert(gardeningQuestRewards)
            .values(events)
            .onConflictDoNothing();
          
          totalEventsFound += events.length;
          eventsInBatch = events.length;
        }
      }
      
      batchCount++;
      currentBlock = endBlock + 1;
      
      if (workerId !== null) {
        updateWorkerLiveProgress(workerId, {
          currentBlock: endBlock,
          eventsFound: totalEventsFound,
          batchesCompleted: batchCount,
          lastBatchAt: new Date().toISOString(),
        });
      } else {
        updateLiveProgress({
          currentBlock: endBlock,
          eventsFound: totalEventsFound,
          batchesCompleted: batchCount,
          lastBatchAt: new Date().toISOString(),
        });
      }
      
      await updateIndexerProgress(indexerName, {
        lastIndexedBlock: endBlock,
        totalEventsIndexed: sql`${gardeningQuestIndexerProgress.totalEventsIndexed} + ${eventsInBatch}`,
      });
      
      if (batchCount % 50 === 0) {
        const prefix = workerId !== null ? `[GardeningQuest W${workerId}]` : '[GardeningQuest]';
        console.log(`${prefix} Block ${endBlock}/${toBlock} (${((endBlock - fromBlock) / (toBlock - fromBlock) * 100).toFixed(1)}%) - ${totalEventsFound} rewards found`);
      }
      
    } catch (error) {
      const prefix = workerId !== null ? `[GardeningQuest W${workerId}]` : '[GardeningQuest]';
      console.error(`${prefix} Error indexing blocks ${currentBlock}-${endBlock}:`, error.message);
      await updateIndexerProgress(indexerName, {
        status: 'error',
        lastError: error.message,
      });
      throw error;
    }
  }
  
  return { totalEventsFound, batchCount };
}

async function runGardeningWorkerBatch(workerId) {
  const indexerName = getWorkerIndexerName(workerId);
  
  if (runningWorkers.get(indexerName)) {
    return { status: 'already_running' };
  }
  
  runningWorkers.set(indexerName, true);
  
  const progress = await getIndexerProgress(indexerName);
  if (!progress) {
    runningWorkers.set(indexerName, false);
    return { status: 'no_progress_record' };
  }
  
  const workerInfo = autoRunIntervals.get(getWorkerKey(workerId));
  const workerTargetBlock = workerInfo?.rangeEnd || progress.rangeEnd || await getLatestBlock();
  
  const startBlock = progress.lastIndexedBlock + 1;
  const endBlock = Math.min(startBlock + INCREMENTAL_BATCH_SIZE - 1, workerTargetBlock);
  
  if (startBlock > workerTargetBlock) {
    runningWorkers.set(indexerName, false);
    updateWorkerLiveProgress(workerId, { completedAt: new Date().toISOString(), percentComplete: 100 });
    return { status: 'completed' };
  }
  
  await updateIndexerProgress(indexerName, { status: 'running' });
  
  updateWorkerLiveProgress(workerId, {
    isRunning: true,
    currentBlock: startBlock,
    targetBlock: workerTargetBlock,
    rangeStart: progress.rangeStart || progress.genesisBlock,
    rangeEnd: workerTargetBlock,
    startedAt: new Date().toISOString(),
  });
  
  try {
    const result = await indexBlockRange(startBlock, endBlock, indexerName, workerId);
    
    const isComplete = endBlock >= workerTargetBlock;
    
    await db.update(gardeningQuestIndexerProgress)
      .set({
        status: isComplete ? 'complete' : 'idle',
        updatedAt: sql`CURRENT_TIMESTAMP`,
      })
      .where(eq(gardeningQuestIndexerProgress.indexerName, indexerName));
    
    updateWorkerLiveProgress(workerId, {
      isRunning: false,
      currentBlock: endBlock,
      completedAt: isComplete ? new Date().toISOString() : null,
      percentComplete: isComplete ? 100 : undefined,
    });
    
    runningWorkers.set(indexerName, false);
    
    console.log(`[GardeningQuest W${workerId}] Batch done: ${result.totalEventsFound} events in ${result.batchCount} batches`);
    
    return {
      status: isComplete ? 'completed' : 'batch_done',
      eventsFound: result.totalEventsFound,
      blocksIndexed: endBlock - startBlock,
      currentBlock: endBlock,
      targetBlock: workerTargetBlock,
    };
  } catch (err) {
    console.error(`[GardeningQuest W${workerId}] Error:`, err.message);
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
    
    const reservationKey = `gardening_${w}`;
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
  
  const reservationKey = `gardening_${bestDonor.workerId}`;
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
  
  await db.update(gardeningQuestIndexerProgress)
    .set({
      rangeEnd: stealInfo.newDonorRangeEnd,
      updatedAt: sql`CURRENT_TIMESTAMP`,
    })
    .where(eq(gardeningQuestIndexerProgress.indexerName, donorIndexerName));
  
  const donorKey = getWorkerKey(stealInfo.donorWorkerId);
  const donorWorkerInfo = autoRunIntervals.get(donorKey);
  if (donorWorkerInfo) {
    donorWorkerInfo.rangeEnd = stealInfo.newDonorRangeEnd;
  }
  
  await db.update(gardeningQuestIndexerProgress)
    .set({
      rangeStart: stealInfo.newRangeStart,
      rangeEnd: stealInfo.newRangeEnd,
      lastIndexedBlock: stealInfo.newRangeStart,
      genesisBlock: stealInfo.newRangeStart,
      status: 'idle',
      updatedAt: sql`CURRENT_TIMESTAMP`,
    })
    .where(eq(gardeningQuestIndexerProgress.indexerName, thiefIndexerName));
  
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
  
  console.log(`[GardeningQuest] Worker ${thiefWorkerId} stole ${stealInfo.blocksStolen.toLocaleString()} blocks from worker ${stealInfo.donorWorkerId}`);
}

async function startGardeningWorkerAutoRun(workerId, rangeStart, rangeEnd, intervalMs = AUTO_RUN_INTERVAL_MS) {
  const key = getWorkerKey(workerId);
  if (autoRunIntervals.has(key)) {
    console.log(`[GardeningQuest] Worker ${workerId} already running`);
    return { status: 'already_running', workerId };
  }
  
  console.log(`[GardeningQuest] Starting worker ${workerId} (blocks ${rangeStart.toLocaleString()}-${rangeEnd ? rangeEnd.toLocaleString() : 'latest'}, interval: ${intervalMs / 1000}s)`);
  
  clearWorkerLiveProgress(workerId);
  await initWorkerProgress(workerId, rangeStart, rangeEnd);
  
  updateWorkerLiveProgress(workerId, {
    isRunning: false,
    currentBlock: rangeStart,
    targetBlock: rangeEnd || rangeStart,
    rangeStart,
    rangeEnd,
    eventsFound: 0,
    batchesCompleted: 0,
    percentComplete: 0,
    completedAt: null,
  });
  
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
  
  const offsetMs = Math.floor((workerId / GARDENING_WORKERS) * intervalMs);
  
  (async () => {
    try {
      if (offsetMs > 0) {
        await new Promise(r => setTimeout(r, offsetMs));
      }
      console.log(`[GardeningQuest] Initial batch for worker ${workerId} (offset ${(offsetMs / 1000).toFixed(1)}s)`);
      await runGardeningWorkerBatch(workerId);
      info.lastRunAt = new Date().toISOString();
      info.runsCompleted++;
    } catch (err) {
      console.error(`[GardeningQuest] Initial error for worker ${workerId}:`, err.message);
    }
  })();
  
  info.interval = setInterval(async () => {
    if (!autoRunIntervals.has(key)) return;
    
    try {
      const result = await runGardeningWorkerBatch(workerId);
      info.lastRunAt = new Date().toISOString();
      info.runsCompleted++;
      
      if (result.status === 'completed') {
        const stealInfo = findWorkToSteal(workerId);
        if (stealInfo) {
          await applyWorkSteal(workerId, stealInfo);
          console.log(`[GardeningQuest] Worker ${workerId} continuing with stolen work`);
        } else {
          console.log(`[GardeningQuest] Worker ${workerId} completed, no work to steal`);
        }
      }
    } catch (err) {
      console.error(`[GardeningQuest] Worker ${workerId} error:`, err.message);
    }
  }, intervalMs);
  
  return { status: 'started', workerId, rangeStart, rangeEnd };
}

export async function startGardeningWorkersAutoRun(intervalMs = AUTO_RUN_INTERVAL_MS, targetWorkers = GARDENING_WORKERS) {
  let workerCount = Math.min(targetWorkers, GARDENING_WORKERS);
  let latestBlock;
  
  try {
    latestBlock = await getLatestBlock();
  } catch (err) {
    console.error('[GardeningQuest] Failed to get latest block:', err.message);
    await new Promise(r => setTimeout(r, 2000));
    try {
      latestBlock = await getLatestBlock();
    } catch (err2) {
      console.error('[GardeningQuest] RPC unavailable, cannot start workers');
      return { status: 'rpc_failed', error: err2.message };
    }
  }
  
  const blocksPerWorker = Math.ceil(latestBlock / workerCount);
  
  console.log(`[GardeningQuest] Starting ${workerCount} workers (${blocksPerWorker.toLocaleString()} blocks each, latest: ${latestBlock.toLocaleString()})`);
  
  const results = [];
  let consecutiveFailures = 0;
  const MAX_CONSECUTIVE_FAILURES = 2;
  
  for (let w = 0; w < workerCount; w++) {
    const rangeStart = w * blocksPerWorker;
    const rangeEnd = (w === workerCount - 1) ? null : (w + 1) * blocksPerWorker;
    
    await new Promise(r => setTimeout(r, 500));
    
    try {
      const result = await startGardeningWorkerAutoRun(w, rangeStart, rangeEnd, intervalMs);
      results.push(result);
      consecutiveFailures = 0;
    } catch (err) {
      consecutiveFailures++;
      console.error(`[GardeningQuest] Worker ${w} failed to start:`, err.message);
      
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES && workerCount > MIN_GARDENING_WORKERS) {
        const newWorkerCount = workerCount - 1;
        console.warn(`[GardeningQuest] RPC failsafe: Reducing from ${workerCount} to ${newWorkerCount} workers`);
        
        stopGardeningWorkersAutoRun();
        
        await new Promise(r => setTimeout(r, 3000));
        return startGardeningWorkersAutoRun(intervalMs, newWorkerCount);
      }
      
      results.push({ status: 'failed', workerId: w, error: err.message });
    }
  }
  
  const started = results.filter(r => r.status === 'started').length;
  activeWorkerCount = started;
  
  return { status: 'workers_started', workersStarted: started, targetWorkers: workerCount, results };
}

export function stopGardeningWorkersAutoRun() {
  let stopped = 0;
  for (let w = 0; w < GARDENING_WORKERS; w++) {
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
    const indexerName = getWorkerIndexerName(w);
    runningWorkers.delete(indexerName);
  }
  activeWorkerCount = 0;
  donorReservations.clear();
  console.log(`[GardeningQuest] Stopped ${stopped} workers`);
  return stopped;
}

export async function runGardeningQuestIndexer() {
  const indexerName = getIndexerName();
  
  const progress = await initIndexerProgress(indexerName);
  if (progress.status === 'running') {
    console.log('[GardeningQuest] Indexer already running');
    return { status: 'already_running' };
  }
  
  const latestBlock = await getLatestBlock();
  const startBlock = progress.lastIndexedBlock + 1;
  const targetBlock = Math.min(startBlock + INCREMENTAL_BATCH_SIZE, latestBlock);
  
  if (startBlock >= latestBlock) {
    console.log('[GardeningQuest] Already at latest block');
    return { status: 'up_to_date', lastBlock: progress.lastIndexedBlock };
  }
  
  console.log(`[GardeningQuest] Starting indexer from block ${startBlock} to ${targetBlock}`);
  
  await updateIndexerProgress(indexerName, { status: 'running' });
  
  updateLiveProgress({
    isRunning: true,
    currentBlock: startBlock,
    targetBlock,
    genesisBlock: progress.genesisBlock,
    eventsFound: 0,
    batchesCompleted: 0,
    startedAt: new Date().toISOString(),
  });
  
  try {
    const result = await indexBlockRange(startBlock, targetBlock, indexerName);
    
    await updateIndexerProgress(indexerName, {
      status: 'idle',
      lastIndexedBlock: targetBlock,
    });
    
    updateLiveProgress({
      isRunning: false,
      completedAt: new Date().toISOString(),
      percentComplete: 100,
    });
    
    console.log(`[GardeningQuest] Completed: ${result.totalEventsFound} rewards indexed in ${result.batchCount} batches`);
    
    return {
      status: 'completed',
      eventsIndexed: result.totalEventsFound,
      blocksProcessed: targetBlock - startBlock + 1,
      lastBlock: targetBlock,
    };
    
  } catch (error) {
    updateLiveProgress({ isRunning: false });
    throw error;
  }
}

export function startGardeningQuestAutoRun(useParallelWorkers = true) {
  if (useParallelWorkers) {
    return startGardeningWorkersAutoRun();
  }
  
  if (autoRunIntervals.has('gardening_quest')) {
    return { status: 'already_running' };
  }
  
  const intervalId = setInterval(async () => {
    try {
      const progress = getGardeningQuestLiveProgress();
      if (progress?.isRunning) {
        return;
      }
      await runGardeningQuestIndexer();
    } catch (err) {
      console.error('[GardeningQuest] Auto-run error:', err.message);
    }
  }, AUTO_RUN_INTERVAL_MS);
  
  autoRunIntervals.set('gardening_quest', intervalId);
  runGardeningQuestIndexer().catch(e => console.error('[GardeningQuest] Initial run error:', e.message));
  
  return { status: 'started', interval: AUTO_RUN_INTERVAL_MS };
}

export function stopGardeningQuestAutoRun() {
  let stoppedAny = false;
  
  const singleInterval = autoRunIntervals.get('gardening_quest');
  if (singleInterval) {
    clearInterval(singleInterval);
    autoRunIntervals.delete('gardening_quest');
    console.log('[GardeningQuest] Single auto-run stopped');
    stoppedAny = true;
  }
  
  const workersStoppedCount = stopGardeningWorkersAutoRun();
  if (workersStoppedCount > 0) {
    stoppedAny = true;
  }
  
  return stoppedAny;
}

export function isGardeningQuestAutoRunning() {
  if (autoRunIntervals.has('gardening_quest')) return true;
  for (let w = 0; w < GARDENING_WORKERS; w++) {
    if (autoRunIntervals.has(getWorkerKey(w))) return true;
  }
  return false;
}

export function getGardeningWorkersStatus() {
  const workers = [];
  for (let w = 0; w < GARDENING_WORKERS; w++) {
    const key = getWorkerKey(w);
    const info = autoRunIntervals.get(key);
    const progress = workerLiveProgress.get(key);
    if (info || progress) {
      workers.push({
        workerId: w,
        isActive: !!info,
        ...progress,
        runsCompleted: info?.runsCompleted || 0,
        lastRunAt: info?.lastRunAt,
      });
    }
  }
  return {
    activeWorkers: activeWorkerCount,
    maxWorkers: GARDENING_WORKERS,
    minWorkers: MIN_GARDENING_WORKERS,
    workers,
  };
}

export async function getGardeningQuestStatus() {
  const indexerName = getIndexerName();
  const progress = await getIndexerProgress(indexerName);
  const liveProgressData = getGardeningQuestLiveProgress();
  const workersStatus = getGardeningWorkersStatus();
  
  const [stats] = await db.select({
    totalRewards: sql`COUNT(*)`,
    crystalCount: sql`COUNT(*) FILTER (WHERE ${gardeningQuestRewards.rewardSymbol} = 'CRYSTAL')`,
    jewelCount: sql`COUNT(*) FILTER (WHERE ${gardeningQuestRewards.rewardSymbol} = 'JEWEL')`,
    uniqueHeroes: sql`COUNT(DISTINCT ${gardeningQuestRewards.heroId})`,
    uniquePlayers: sql`COUNT(DISTINCT ${gardeningQuestRewards.player})`,
    totalCrystal: sql`COALESCE(SUM(CASE WHEN ${gardeningQuestRewards.rewardSymbol} = 'CRYSTAL' THEN ${gardeningQuestRewards.rewardAmount}::numeric ELSE 0 END), 0)`,
    totalJewel: sql`COALESCE(SUM(CASE WHEN ${gardeningQuestRewards.rewardSymbol} = 'JEWEL' THEN ${gardeningQuestRewards.rewardAmount}::numeric ELSE 0 END), 0)`,
  }).from(gardeningQuestRewards);
  
  return {
    indexerProgress: progress,
    liveProgress: liveProgressData,
    isAutoRunning: isGardeningQuestAutoRunning(),
    workers: workersStatus,
    stats: {
      totalRewards: Number(stats.totalRewards),
      crystalCount: Number(stats.crystalCount),
      jewelCount: Number(stats.jewelCount),
      uniqueHeroes: Number(stats.uniqueHeroes),
      uniquePlayers: Number(stats.uniquePlayers),
      totalCrystal: parseFloat(stats.totalCrystal),
      totalJewel: parseFloat(stats.totalJewel),
    },
  };
}

export async function getHeroRewards(heroId, limit = 100) {
  const rewards = await db.select()
    .from(gardeningQuestRewards)
    .where(eq(gardeningQuestRewards.heroId, heroId))
    .orderBy(desc(gardeningQuestRewards.timestamp))
    .limit(limit);
  
  return rewards;
}

export async function getPlayerRewards(player, limit = 100) {
  const rewards = await db.select()
    .from(gardeningQuestRewards)
    .where(eq(gardeningQuestRewards.player, player.toLowerCase()))
    .orderBy(desc(gardeningQuestRewards.timestamp))
    .limit(limit);
  
  return rewards;
}

export async function getRewardsByPool(poolId, limit = 100) {
  const rewards = await db.select()
    .from(gardeningQuestRewards)
    .where(eq(gardeningQuestRewards.poolId, poolId))
    .orderBy(desc(gardeningQuestRewards.timestamp))
    .limit(limit);
  
  return rewards;
}

export async function getHeroStats(heroId) {
  const [stats] = await db.select({
    totalQuests: sql`COUNT(DISTINCT ${gardeningQuestRewards.questId})`,
    totalCrystal: sql`COALESCE(SUM(CASE WHEN ${gardeningQuestRewards.rewardSymbol} = 'CRYSTAL' THEN ${gardeningQuestRewards.rewardAmount}::numeric ELSE 0 END), 0)`,
    totalJewel: sql`COALESCE(SUM(CASE WHEN ${gardeningQuestRewards.rewardSymbol} = 'JEWEL' THEN ${gardeningQuestRewards.rewardAmount}::numeric ELSE 0 END), 0)`,
    manualQuestCount: sql`COUNT(DISTINCT ${gardeningQuestRewards.questId}) FILTER (WHERE COALESCE(${gardeningQuestRewards.source}, 'manual_quest') = 'manual_quest')`,
    expeditionCount: sql`COUNT(DISTINCT ${gardeningQuestRewards.questId}) FILTER (WHERE ${gardeningQuestRewards.source} = 'expedition')`,
    firstQuest: sql`MIN(${gardeningQuestRewards.timestamp})`,
    lastQuest: sql`MAX(${gardeningQuestRewards.timestamp})`,
  })
    .from(gardeningQuestRewards)
    .where(eq(gardeningQuestRewards.heroId, heroId));
  
  return {
    heroId,
    totalQuests: Number(stats.totalQuests),
    totalCrystal: parseFloat(stats.totalCrystal),
    totalJewel: parseFloat(stats.totalJewel),
    manualQuestCount: Number(stats.manualQuestCount),
    expeditionCount: Number(stats.expeditionCount),
    firstQuest: stats.firstQuest,
    lastQuest: stats.lastQuest,
  };
}

export async function resetGardeningQuestIndexer(clearRewards = true) {
  console.log('[GardeningQuest] Resetting indexer...');
  
  stopGardeningWorkersAutoRun();
  
  const hasActiveWorkers = Array.from(runningWorkers.values()).some(v => v === true);
  if (hasActiveWorkers) {
    console.log('[GardeningQuest] Waiting for active batches to complete...');
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  
  await db.delete(gardeningQuestIndexerProgress);
  console.log('[GardeningQuest] ✓ Cleared indexer progress');
  
  if (clearRewards) {
    await db.delete(gardeningQuestRewards);
    console.log('[GardeningQuest] ✓ Cleared rewards data');
  }
  
  clearLiveProgress();
  
  console.log('[GardeningQuest] ✓ Reset complete - ready for fresh scan');
  return { success: true, clearedRewards: clearRewards };
}
