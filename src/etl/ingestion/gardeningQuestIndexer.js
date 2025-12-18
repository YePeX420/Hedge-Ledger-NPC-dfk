import { ethers } from 'ethers';
import { db } from '../../../server/db.js';
import { gardeningQuestRewards, gardeningQuestIndexerProgress } from '../../../shared/schema.js';
import { eq, sql, desc } from 'drizzle-orm';

const DFK_CHAIN_RPC = 'https://subnets.avax.network/defi-kingdoms/dfk-chain/rpc';
const QUEST_CORE_V3 = '0x530fff22987E137e7C8D2aDcC4c15eb45b4FA752';

const DFK_GENESIS_BLOCK = 0;
const BLOCKS_PER_QUERY = 2000;
const INCREMENTAL_BATCH_SIZE = 200000;
const AUTO_RUN_INTERVAL_MS = 60 * 1000;

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
];

const liveProgress = new Map();
let autoRunInterval = null;
let isAutoRunning = false;

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

let providerInstance = null;
let questContractInstance = null;

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
        block_number BIGINT NOT NULL,
        tx_hash TEXT NOT NULL,
        log_index INTEGER NOT NULL,
        timestamp TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
      )
    `);
    
    await db.execute(sql`CREATE INDEX IF NOT EXISTS gardening_quest_rewards_hero_idx ON gardening_quest_rewards(hero_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS gardening_quest_rewards_player_idx ON gardening_quest_rewards(player)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS gardening_quest_rewards_pool_idx ON gardening_quest_rewards(pool_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS gardening_quest_rewards_token_idx ON gardening_quest_rewards(reward_token)`);
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

export async function updateIndexerProgress(indexerName, updates) {
  await db.update(gardeningQuestIndexerProgress)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(gardeningQuestIndexerProgress.indexerName, indexerName));
}

async function getQuestTypeFromTx(txHash) {
  try {
    const provider = getProvider();
    const tx = await provider.getTransactionReceipt(txHash);
    if (!tx) return null;
    
    const questContract = getQuestContract();
    const questCompletedTopic = questContract.interface.getEvent('QuestCompleted').topicHash;
    
    for (const log of tx.logs) {
      if (log.topics[0] === questCompletedTopic) {
        try {
          const parsed = questContract.interface.parseLog({
            topics: log.topics,
            data: log.data,
          });
          return parsed.args.quest.questType;
        } catch (e) {
          continue;
        }
      }
    }
    return null;
  } catch (e) {
    return null;
  }
}

async function indexBlockRange(fromBlock, toBlock, indexerName) {
  const contract = getQuestContract();
  const provider = getProvider();
  
  let currentBlock = fromBlock;
  let totalEventsFound = 0;
  let batchCount = 0;
  
  const rewardMintedFilter = contract.filters.RewardMinted();
  
  while (currentBlock <= toBlock) {
    const endBlock = Math.min(currentBlock + BLOCKS_PER_QUERY - 1, toBlock);
    
    try {
      const logs = await contract.queryFilter(rewardMintedFilter, currentBlock, endBlock);
      
      if (logs.length > 0) {
        const events = [];
        const txQuestTypes = new Map();
        
        for (const log of logs) {
          const txHash = log.transactionHash;
          
          if (!txQuestTypes.has(txHash)) {
            const questType = await getQuestTypeFromTx(txHash);
            txQuestTypes.set(txHash, questType);
          }
          
          const questType = txQuestTypes.get(txHash);
          
          if (questType !== null && questType >= 0 && questType <= 14) {
            const block = await provider.getBlock(log.blockNumber);
            const rewardAddress = log.args.reward.toLowerCase();
            const rewardSymbol = TOKEN_SYMBOLS[rewardAddress] || 'ITEM';
            
            events.push({
              questId: Number(log.args.questId),
              heroId: Number(log.args.heroId),
              player: log.args.player.toLowerCase(),
              poolId: questType,
              rewardToken: rewardAddress,
              rewardSymbol,
              rewardAmount: ethers.formatEther(log.args.amount),
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
        }
      }
      
      batchCount++;
      currentBlock = endBlock + 1;
      
      updateLiveProgress({
        currentBlock: endBlock,
        eventsFound: totalEventsFound,
        batchesCompleted: batchCount,
        lastBatchAt: new Date().toISOString(),
      });
      
      await updateIndexerProgress(indexerName, {
        lastIndexedBlock: endBlock,
        totalEventsIndexed: sql`${gardeningQuestIndexerProgress.totalEventsIndexed} + ${events?.length || 0}`,
      });
      
      if (batchCount % 50 === 0) {
        console.log(`[GardeningQuest] Block ${endBlock}/${toBlock} (${((endBlock - fromBlock) / (toBlock - fromBlock) * 100).toFixed(1)}%) - ${totalEventsFound} rewards found`);
      }
      
    } catch (error) {
      console.error(`[GardeningQuest] Error indexing blocks ${currentBlock}-${endBlock}:`, error.message);
      await updateIndexerProgress(indexerName, {
        status: 'error',
        lastError: error.message,
      });
      throw error;
    }
  }
  
  return { totalEventsFound, batchCount };
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

export function startGardeningQuestAutoRun() {
  if (autoRunInterval) {
    console.log('[GardeningQuest] Auto-run already started');
    return { status: 'already_running' };
  }
  
  isAutoRunning = true;
  console.log('[GardeningQuest] Starting auto-run...');
  
  runGardeningQuestIndexer().catch(e => console.error('[GardeningQuest] Auto-run error:', e.message));
  
  autoRunInterval = setInterval(async () => {
    if (!isAutoRunning) return;
    
    try {
      const progress = getGardeningQuestLiveProgress();
      if (progress?.isRunning) {
        return;
      }
      await runGardeningQuestIndexer();
    } catch (error) {
      console.error('[GardeningQuest] Auto-run iteration error:', error.message);
    }
  }, AUTO_RUN_INTERVAL_MS);
  
  return { status: 'started', interval: AUTO_RUN_INTERVAL_MS };
}

export function stopGardeningQuestAutoRun() {
  isAutoRunning = false;
  if (autoRunInterval) {
    clearInterval(autoRunInterval);
    autoRunInterval = null;
    console.log('[GardeningQuest] Auto-run stopped');
    return { status: 'stopped' };
  }
  return { status: 'not_running' };
}

export function isGardeningQuestAutoRunning() {
  return isAutoRunning && autoRunInterval !== null;
}

export async function getGardeningQuestStatus() {
  const indexerName = getIndexerName();
  const progress = await getIndexerProgress(indexerName);
  const liveProgress = getGardeningQuestLiveProgress();
  
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
    liveProgress,
    isAutoRunning: isGardeningQuestAutoRunning(),
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
    firstQuest: stats.firstQuest,
    lastQuest: stats.lastQuest,
  };
}
