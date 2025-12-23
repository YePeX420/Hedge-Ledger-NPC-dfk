// src/etl/ingestion/huntsPatrolIndexer.js
// Multi-chain PVE indexer for Hunts (DFK Chain) and Patrols (Metis)
// Tracks completions, rewards, pet bonuses, and hero/equipment snapshots
// for calculating accurate drop rates with the formula:
// baseRate = observedRate - (0.0002 × partyLCK) - petBonus

import { ethers } from 'ethers';
import { sql } from 'drizzle-orm';
import { db, rawPg, rawTextPg, execRawSQL } from '../../../server/db.js';
import { isScavengerBonus, getScavengerLootBonus } from '../../../pet-data.js';

// Configuration
const BLOCKS_PER_QUERY = 2000;
const BATCH_SIZE = 100000;
const AUTO_RUN_INTERVAL_MS = 60 * 1000;

// Worker configuration (5 workers with work-stealing)
export const PVE_WORKERS = 5;
export const MIN_PVE_WORKERS = 1;
const MIN_BLOCKS_TO_STEAL = 500000;

// Contract addresses and RPC URLs
const DFK_CHAIN_RPC = 'https://subnets.avax.network/defi-kingdoms/dfk-chain/rpc';
// Note: Archive RPC using same public endpoint (limited historical data but works)
const DFK_ARCHIVE_RPC = 'https://subnets.avax.network/defi-kingdoms/dfk-chain/rpc';
const METIS_RPC = 'https://andromeda.metis.io/?owner=1088';
// Note: Using same endpoint for archive since free archive RPCs are unavailable
const METIS_ARCHIVE_RPC = 'https://andromeda.metis.io/?owner=1088';

// DFK Chain contracts
const HUNTS_DIAMOND = '0xEaC69796Cff468ED1694A6FfAc4cbC23bbe33aFa';
const HERO_CONTRACT_DFK = '0xEb9B61B145D6489Be575D3603F4a704810e143dF';
const PET_CONTRACT_DFK = '0x1990F87d6BC9D9385917E3EDa0A7674411C3Cd7F';

// Metis contracts
const PVP_DIAMOND_METIS = '0xc7681698B14a2381d9f1eD69FC3D27F33965b53B';
const PET_CONTRACT_METIS = '0x74cE6E7cEF79F5ae6363c6CB1F6c2b528E92D7c7';

// Event topic hashes
const HUNT_REWARD_EVENTS = {
  HuntRewardMinted: ethers.id('HuntRewardMinted(uint256,address,address,uint256,uint256)'),
  HuntEquipmentMinted: ethers.id('HuntEquipmentMinted(uint256,address,address,uint8,uint16,uint8,uint256)'),
  HuntCompleted: ethers.id('HuntCompleted(uint256,(uint256,uint256,uint256,uint256[],address,uint8,uint256,uint256[],uint256,uint256,(address,uint16,uint16)[]),bool,uint256[])'),
  HuntPetBonusReceived: ethers.id('HuntPetBonusReceived(uint256,address,uint256,uint256)'),
};

const PATROL_REWARD_EVENTS = {
  PatrolRewardMinted: ethers.id('PatrolRewardMinted(uint256,address,address,uint256,uint256)'),
  PatrolEquipmentMinted: ethers.id('PatrolEquipmentMinted(uint256,address,address,uint256,uint256,uint256,uint256)'),
  PatrolCompleted: ethers.id('PatrolCompleted(uint256,address,uint256,bool)'),
};

// ABIs (minimal for event parsing and state queries)
const HUNTS_DIAMOND_ABI = [
  'event HuntRewardMinted(uint256 indexed huntId, address indexed player, address indexed item, uint256 amount, uint256 data)',
  'event HuntEquipmentMinted(uint256 indexed huntId, address indexed item, address indexed player, uint8 equipmentType, uint16 displayId, uint8 rarity, uint256 nftId)',
  'event HuntCompleted(uint256 huntId, tuple(uint256 huntDataId, uint256 huntId, uint256 createdBlock, uint256[] heroIds, address player, uint8 status, uint256 startBlock, uint256[] orderedRandoms, uint256 currentTurn, uint256 currentDamage, tuple(address item, uint16 amount, uint16 data)[] rewards) hunt, bool huntWon, uint256[] heroIds)',
  'event HuntPetBonusReceived(uint256 indexed questId, address indexed player, uint256 heroId, uint256 petId)',
];

const PVP_DIAMOND_ABI = [
  'event PatrolRewardMinted(uint256 indexed patrolId, address indexed player, address indexed item, uint256 amount, uint256 data)',
  'event PatrolEquipmentMinted(uint256 indexed huntId, address indexed item, address indexed player, uint256 equipmentType, uint256 displayId, uint256 rarity, uint256 nftId)',
  'event PatrolCompleted(uint256 indexed patrolId, address indexed player, uint256 fightsCompleted, bool patrolWon)',
];

const HERO_CORE_ABI = [
  'function getHeroV3(uint256 _id) external view returns (tuple(uint256 id, tuple(uint256 summonedTime, uint256 nextSummonTime, uint256 summonerId, uint256 assistantId, uint32 summons, uint32 maxSummons) summoningInfo, tuple(uint256 statGenes, uint256 visualGenes, uint8 rarity, bool shiny, uint16 generation, uint32 firstName, uint32 lastName, uint8 shinyStyle, uint8 class, uint8 subClass) info, tuple(uint256 staminaFullAt, uint256 hpFullAt, uint256 mpFullAt, uint16 level, uint64 xp, address currentQuest, uint8 sp, uint8 status) state, tuple(uint16 strength, uint16 intelligence, uint16 wisdom, uint16 luck, uint16 agility, uint16 vitality, uint16 endurance, uint16 dexterity, uint16 hp, uint16 mp, uint16 stamina) stats, tuple(uint16 strength, uint16 intelligence, uint16 wisdom, uint16 luck, uint16 agility, uint16 vitality, uint16 endurance, uint16 dexterity, uint16 hpSm, uint16 hpRg, uint16 hpLg, uint16 mpSm, uint16 mpRg, uint16 mpLg) primaryStatGrowth, tuple(uint16 strength, uint16 intelligence, uint16 wisdom, uint16 luck, uint16 agility, uint16 vitality, uint16 endurance, uint16 dexterity, uint16 hpSm, uint16 hpRg, uint16 hpLg, uint16 mpSm, uint16 mpRg, uint16 mpLg) secondaryStatGrowth, tuple(uint16 mining, uint16 gardening, uint16 foraging, uint16 fishing) professions))',
];

const PET_CORE_ABI = [
  'function getPetV2(uint256 _id) external view returns (tuple(uint256 id, uint8 originId, string name, uint8 season, uint8 eggType, uint8 rarity, uint8 element, uint8 bonusCount, uint8 profBonus, uint8 profBonusScalar, uint8 craftBonus, uint8 craftBonusScalar, uint8 combatBonus, uint8 combatBonusScalar, uint16 appearance, uint8 background, uint8 shiny, uint64 hungryAt, uint64 equippableAt, uint256 equippedTo))',
];

// Chain configurations
const CHAIN_CONFIGS = {
  dfk: {
    chainId: 53935,
    rpcUrl: DFK_CHAIN_RPC,
    archiveRpcUrl: DFK_ARCHIVE_RPC,
    contractAddress: HUNTS_DIAMOND,
    heroContract: HERO_CONTRACT_DFK,
    petContract: PET_CONTRACT_DFK,
    activityType: 'hunt',
    abi: HUNTS_DIAMOND_ABI,
  },
  metis: {
    chainId: 1088,
    rpcUrl: METIS_RPC,
    archiveRpcUrl: METIS_ARCHIVE_RPC,
    contractAddress: PVP_DIAMOND_METIS,
    heroContract: PVP_DIAMOND_METIS, // Same contract (Diamond pattern)
    petContract: PET_CONTRACT_METIS,
    activityType: 'patrol',
    abi: PVP_DIAMOND_ABI,
  },
};

// Live progress tracking
const liveProgress = new Map();
const runningIndexers = new Map();
const autoRunIntervals = new Map();
const autoRunTiming = new Map(); // Tracks { startedAt, lastRunAt, intervalMs }

// Worker tracking
const workerLiveProgress = new Map(); // Per-worker progress
const runningWorkers = new Map(); // Which workers are currently running
const donorReservations = new Map(); // Work-stealing reservations
let activeWorkerCount = {}; // { dfk: 5, metis: 5 }

// Retry wrapper with exponential backoff for RPC calls
const MAX_RETRIES = 5;
const INITIAL_RETRY_DELAY_MS = 1000;

async function withRetry(fn, context = 'RPC call', chain = 'unknown') {
  let lastError;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const isRetryable = 
        error.message?.includes('socket hang up') ||
        error.message?.includes('ECONNRESET') ||
        error.message?.includes('ETIMEDOUT') ||
        error.message?.includes('ENOTFOUND') ||
        error.message?.includes('network') ||
        error.code === 'ECONNRESET' ||
        error.code === 'ETIMEDOUT' ||
        error.code === 'UND_ERR_SOCKET';
      
      if (!isRetryable || attempt === MAX_RETRIES - 1) {
        throw error;
      }
      
      const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt);
      console.warn(`[PVE ${chain}] ${context} failed (attempt ${attempt + 1}/${MAX_RETRIES}): ${error.message}. Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

// Worker helpers
function getWorkerKey(chain, workerId) {
  return `pve_${chain}_w${workerId}`;
}

function getWorkerIndexerName(chain, workerId) {
  return `pve_${chain}_worker_${workerId}`;
}

function updateWorkerLiveProgress(chain, workerId, updates) {
  const key = getWorkerKey(chain, workerId);
  const current = workerLiveProgress.get(key) || {};
  workerLiveProgress.set(key, { ...current, ...updates });
}

function clearWorkerLiveProgress(chain, workerId) {
  workerLiveProgress.delete(getWorkerKey(chain, workerId));
}

// Get all worker progress for a chain
export function getAllWorkerProgress(chain) {
  const workers = [];
  const count = activeWorkerCount[chain] || PVE_WORKERS;
  for (let w = 0; w < count; w++) {
    const key = getWorkerKey(chain, w);
    workers.push({
      workerId: w,
      progress: workerLiveProgress.get(key) || null,
      isRunning: runningWorkers.get(getWorkerIndexerName(chain, w)) || false,
    });
  }
  return workers;
}

// Known DFK item addresses to names (for drop rate display)
const KNOWN_ITEMS = {
  // DFK Chain Hunt Items
  '0x8e32ddd6b75314aa78fd99952299f21ff4441839': { name: 'Gaia\'s Tears', type: 'consumable', rarity: 'common' },
  '0x41a73e10b92d6e81d758d74b0c8eb7a8dd3df9a8': { name: 'Gold', type: 'currency', rarity: 'common' },
  '0x04b43d632f34ba4d4d72b0dc2dc4b30402e5cf88': { name: 'Rawhide', type: 'material', rarity: 'common' },
  '0x4ff5c7c8ce6e6ae3f35c1cb47e3bae8da4f5f230': { name: 'Tusk', type: 'material', rarity: 'common' },
  '0xe4cfee5bf05cef3418da74cfb89727d8e4fee9fa': { name: 'Shvas Rune', type: 'rune', rarity: 'common' },
  '0x4f60a160d8c2dddaafe16fcc57566db84d674bd6': { name: 'Petals', type: 'material', rarity: 'common' },
  '0x6d605303e9ac53c59a3da1ece36c9660c7a71da5': { name: 'Ambertaffy', type: 'material', rarity: 'common' },
  '0x0776b936344de7bd58a4738306a6c76835ce5d3f': { name: 'Lesser Stamina Potion', type: 'consumable', rarity: 'common' },
  '0xb5fd382ecb76e917fa6e27e5ab4e01c9c7c3f7a4': { name: 'Sailfish', type: 'material', rarity: 'uncommon' },
  '0x66f5bfd910cd83d3766c4b39d13730c911b2d286': { name: 'Boar Hide', type: 'material', rarity: 'common' },
  '0xcdffe898e687e941b124dfb7d24983266492ef1d': { name: 'Feather', type: 'material', rarity: 'common' },
  '0x5f753dccda6f5b1b71e5b5c396d030e22b1bd2af': { name: 'Stamina Potion', type: 'consumable', rarity: 'uncommon' },
  '0xc6030afa09edc1cb0b9c1d81f3f2e406a74d14d0': { name: 'Greater Stamina Potion', type: 'consumable', rarity: 'rare' },
  
  // Metis Patrol Items
  '0xb16838fc6eae51faea13fbeb655bde8bf702d5c2': { name: 'JEWEL', type: 'currency', rarity: 'common' },
  '0xa4f8d1b4f8f1363f0fc8d6189089ff068c800ab4': { name: 'Dark Crystal', type: 'material', rarity: 'uncommon' },
  '0x4bc4bbdf294eeb3017fb4bd7806b6d61d74e85bb': { name: 'Void Essence', type: 'material', rarity: 'rare' },
};

// Provider instances (cached)
const providers = new Map();
const archiveProviders = new Map();
const contracts = new Map();

export function getProvider(chain) {
  if (!providers.has(chain)) {
    providers.set(chain, new ethers.JsonRpcProvider(CHAIN_CONFIGS[chain].rpcUrl));
  }
  return providers.get(chain);
}

export function getArchiveProvider(chain) {
  if (!archiveProviders.has(chain)) {
    archiveProviders.set(chain, new ethers.JsonRpcProvider(CHAIN_CONFIGS[chain].archiveRpcUrl));
  }
  return archiveProviders.get(chain);
}

export function getContract(chain) {
  const key = `${chain}_main`;
  if (!contracts.has(key)) {
    const config = CHAIN_CONFIGS[chain];
    contracts.set(key, new ethers.Contract(config.contractAddress, config.abi, getProvider(chain)));
  }
  return contracts.get(key);
}

export function getHeroContract(chain) {
  const key = `${chain}_hero`;
  if (!contracts.has(key)) {
    const config = CHAIN_CONFIGS[chain];
    contracts.set(key, new ethers.Contract(config.heroContract, HERO_CORE_ABI, getArchiveProvider(chain)));
  }
  return contracts.get(key);
}

export function getPetContract(chain) {
  const key = `${chain}_pet`;
  if (!contracts.has(key)) {
    const config = CHAIN_CONFIGS[chain];
    contracts.set(key, new ethers.Contract(config.petContract, PET_CORE_ABI, getArchiveProvider(chain)));
  }
  return contracts.get(key);
}

// Get live progress for a chain
export function getPVEIndexerLiveProgress(chain) {
  if (chain) {
    return liveProgress.get(chain) || null;
  }
  const result = {};
  for (const [key, value] of liveProgress) {
    result[key] = value;
  }
  return result;
}

function updateLiveProgress(chain, updates) {
  const current = liveProgress.get(chain) || {
    chain,
    isRunning: false,
    currentBlock: 0,
    targetBlock: 0,
    startBlock: 0,
    eventsFound: 0,
    completionsFound: 0,
    batchesCompleted: 0,
    startedAt: null,
    lastBatchAt: null,
    percentComplete: 0,
    completedAt: null,
    lastError: null,
  };
  const updated = { ...current, ...updates };
  if (updates.percentComplete === undefined && updated.targetBlock > updated.startBlock) {
    const totalBlocks = updated.targetBlock - updated.startBlock;
    const indexedBlocks = updated.currentBlock - updated.startBlock;
    updated.percentComplete = Math.min(100, Math.max(0, (indexedBlocks / totalBlocks) * 100));
  }
  liveProgress.set(chain, updated);
  return updated;
}

// Initialize PVE tables if they don't exist
let tablesInitialized = false;

async function initializePVETables() {
  if (tablesInitialized) return;
  
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS pve_activities (
        id SERIAL PRIMARY KEY,
        chain_id INTEGER NOT NULL,
        activity_type VARCHAR(20) NOT NULL,
        activity_id INTEGER NOT NULL,
        name VARCHAR(100) NOT NULL,
        contract_address VARCHAR(42) NOT NULL,
        UNIQUE(chain_id, activity_type, activity_id)
      )
    `);
    
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS pve_loot_items (
        id SERIAL PRIMARY KEY,
        chain_id INTEGER NOT NULL,
        item_address VARCHAR(42) NOT NULL,
        name VARCHAR(100),
        item_type VARCHAR(50),
        rarity VARCHAR(20),
        UNIQUE(chain_id, item_address)
      )
    `);
    
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS pve_completions (
        id SERIAL PRIMARY KEY,
        tx_hash VARCHAR(66) UNIQUE NOT NULL,
        block_number BIGINT NOT NULL,
        chain_id INTEGER NOT NULL,
        activity_id INTEGER REFERENCES pve_activities(id),
        player_address VARCHAR(42) NOT NULL,
        party_luck INTEGER,
        scavenger_bonus_pct INTEGER,
        completed_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS pve_reward_events (
        id SERIAL PRIMARY KEY,
        tx_hash VARCHAR(66) NOT NULL,
        log_index INTEGER NOT NULL,
        block_number BIGINT NOT NULL,
        chain_id INTEGER NOT NULL,
        activity_id INTEGER REFERENCES pve_activities(id),
        item_id INTEGER REFERENCES pve_loot_items(id),
        amount INTEGER DEFAULT 1,
        player_address VARCHAR(42) NOT NULL,
        party_luck INTEGER,
        pet_bonus_active BOOLEAN DEFAULT FALSE,
        scavenger_bonus_pct INTEGER,
        UNIQUE(tx_hash, log_index)
      )
    `);
    
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS pve_indexer_checkpoints (
        chain_id INTEGER PRIMARY KEY,
        last_indexed_block BIGINT NOT NULL DEFAULT 0,
        total_completions INTEGER DEFAULT 0,
        total_rewards INTEGER DEFAULT 0,
        status VARCHAR(20) DEFAULT 'idle',
        last_indexed_at TIMESTAMP,
        last_error TEXT
      )
    `);
    
    // Add scavenger_bonus_pct column to existing tables (migration for existing schemas)
    try {
      await db.execute(sql`
        ALTER TABLE pve_completions ADD COLUMN IF NOT EXISTS scavenger_bonus_pct INTEGER
      `);
    } catch (e) {
      // Column may already exist, ignore error
    }
    
    try {
      await db.execute(sql`
        ALTER TABLE pve_reward_events ADD COLUMN IF NOT EXISTS scavenger_bonus_pct INTEGER
      `);
    } catch (e) {
      // Column may already exist, ignore error
    }
    
    // Seed initial data
    await db.execute(sql`
      INSERT INTO pve_activities (chain_id, activity_type, activity_id, name, contract_address) VALUES
      (53935, 'hunt', 1, 'Mad Boar', '0xEaC69796Cff468ED1694A6FfAc4cbC23bbe33aFa'),
      (53935, 'hunt', 2, 'Bad Motherclucker', '0xEaC69796Cff468ED1694A6FfAc4cbC23bbe33aFa')
      ON CONFLICT (chain_id, activity_type, activity_id) DO NOTHING
    `);
    
    await db.execute(sql`
      INSERT INTO pve_activities (chain_id, activity_type, activity_id, name, contract_address) VALUES
      (1088, 'patrol', 1, 'Night Raid', '0xc7681698B14a2381d9f1eD69FC3D27F33965b53B'),
      (1088, 'patrol', 2, 'Dark Water', '0xc7681698B14a2381d9f1eD69FC3D27F33965b53B'),
      (1088, 'patrol', 3, 'Blood Moon Rising', '0xc7681698B14a2381d9f1eD69FC3D27F33965b53B')
      ON CONFLICT (chain_id, activity_type, activity_id) DO NOTHING
    `);
    
    await db.execute(sql`
      INSERT INTO pve_indexer_checkpoints (chain_id, last_indexed_block, status) VALUES
      (53935, 50000000, 'idle'),
      (1088, 18000000, 'idle')
      ON CONFLICT (chain_id) DO NOTHING
    `);
    
    console.log('[PVE] Initialized database tables');
    tablesInitialized = true;
  } catch (error) {
    console.error('[PVE] Error initializing tables:', error.message);
    throw error;
  }
}

// Get checkpoint from database
async function getCheckpoint(chainId) {
  await initializePVETables();
  const result = await db.execute(sql`
    SELECT * FROM pve_indexer_checkpoints WHERE chain_id = ${chainId}
  `);
  return result[0] || null;
}

// Get or create activity by type and ID
async function getActivityDbId(chainId, activityType, activityId) {
  const result = await db.execute(sql`
    SELECT id FROM pve_activities 
    WHERE chain_id = ${chainId} AND activity_type = ${activityType} AND activity_id = ${activityId}
  `);
  return result[0]?.id || null;
}

// Get or create loot item
async function getOrCreateLootItem(chainId, itemAddress) {
  const normalizedAddress = itemAddress.toLowerCase();
  
  // Look up known item metadata
  const knownItem = KNOWN_ITEMS[normalizedAddress];
  const itemName = knownItem?.name || null;
  const itemType = knownItem?.type || null;
  const itemRarity = knownItem?.rarity || null;
  
  const existing = await db.execute(sql`
    SELECT id, name FROM pve_loot_items WHERE chain_id = ${chainId} AND item_address = ${normalizedAddress}
  `);
  
  if (existing[0]) {
    // Update name if it was null but we now know it
    if (!existing[0].name && itemName) {
      await db.execute(sql`
        UPDATE pve_loot_items SET name = ${itemName}, item_type = ${itemType}, rarity = ${itemRarity}
        WHERE id = ${existing[0].id}
      `);
    }
    return existing[0].id;
  }
  
  const inserted = await db.execute(sql`
    INSERT INTO pve_loot_items (item_address, chain_id, name, item_type, rarity) 
    VALUES (${normalizedAddress}, ${chainId}, ${itemName}, ${itemType}, ${itemRarity})
    ON CONFLICT (chain_id, item_address) DO UPDATE SET 
      name = COALESCE(pve_loot_items.name, EXCLUDED.name),
      item_type = COALESCE(pve_loot_items.item_type, EXCLUDED.item_type),
      rarity = COALESCE(pve_loot_items.rarity, EXCLUDED.rarity)
    RETURNING id
  `);
  
  return inserted[0].id;
}

// Fetch hero stats at a specific block for luck calculation
async function getHeroStatsAtBlock(chain, heroId, blockNumber) {
  try {
    const heroContract = getHeroContract(chain);
    const hero = await heroContract.getHeroV3(heroId, { blockTag: blockNumber });
    return {
      luck: Number(hero.stats.luck),
    };
  } catch (error) {
    console.error(`[PVE ${chain}] Error fetching hero ${heroId} at block ${blockNumber}:`, error.message);
    return null;
  }
}

// Calculate party luck from hero IDs
async function calculatePartyLuck(chain, heroIds, blockNumber) {
  let totalLuck = 0;
  for (const heroId of heroIds) {
    if (heroId > 0n) {
      const stats = await getHeroStatsAtBlock(chain, heroId, blockNumber);
      if (stats) {
        totalLuck += stats.luck;
      }
    }
  }
  return totalLuck;
}

// Get pet Scavenger loot bonus percentage (0 if no Scavenger bonus, 10-25 if Scavenger)
// Scavenger is a combat bonus that increases loot drop chance
// IDs: 60 (common), 139 (rare), 219 (mythic)
async function getScavengerBonusPct(chain, petId, blockNumber) {
  if (petId <= 0n) return 0;
  
  try {
    const petContract = getPetContract(chain);
    const pet = await petContract.getPetV2(petId, { blockTag: blockNumber });
    const combatBonus = Number(pet.combatBonus);
    
    // Check if this pet has Scavenger bonus
    if (isScavengerBonus(combatBonus)) {
      // Return the actual combatBonusScalar which is the loot bonus percentage (10-25)
      return Number(pet.combatBonusScalar) || 0;
    }
    
    return 0;
  } catch (error) {
    console.error(`[PVE ${chain}] Error fetching pet ${petId}:`, error.message);
    return 0;
  }
}

// Index block range for a specific chain
async function indexBlockRange(chain, fromBlock, toBlock) {
  const config = CHAIN_CONFIGS[chain];
  const contract = getContract(chain);
  const provider = getProvider(chain);
  
  let currentBlock = fromBlock;
  let totalRewardsFound = 0;
  let totalCompletionsFound = 0;
  let batchCount = 0;
  
  // Get event topics based on chain
  const completedTopic = config.activityType === 'hunt' 
    ? HUNT_REWARD_EVENTS.HuntCompleted 
    : PATROL_REWARD_EVENTS.PatrolCompleted;
  const rewardTopic = config.activityType === 'hunt'
    ? HUNT_REWARD_EVENTS.HuntRewardMinted
    : PATROL_REWARD_EVENTS.PatrolRewardMinted;
  const equipmentTopic = config.activityType === 'hunt'
    ? HUNT_REWARD_EVENTS.HuntEquipmentMinted
    : PATROL_REWARD_EVENTS.PatrolEquipmentMinted;
  const petBonusTopic = config.activityType === 'hunt'
    ? HUNT_REWARD_EVENTS.HuntPetBonusReceived
    : null;
  
  while (currentBlock <= toBlock) {
    const endBlock = Math.min(currentBlock + BLOCKS_PER_QUERY - 1, toBlock);
    
    try {
      // Fetch all relevant logs in one query
      const topicsToQuery = [completedTopic, rewardTopic, equipmentTopic].filter(Boolean);
      
      const logs = await withRetry(() => provider.getLogs({
        address: config.contractAddress,
        topics: [topicsToQuery],
        fromBlock: currentBlock,
        toBlock: endBlock,
      }), `getLogs ${currentBlock}-${endBlock}`, chain);
      
      // Group logs by transaction
      const txLogs = new Map();
      for (const log of logs) {
        const txHash = log.transactionHash;
        if (!txLogs.has(txHash)) {
          txLogs.set(txHash, []);
        }
        txLogs.get(txHash).push(log);
      }
      
      // Process each transaction
      for (const [txHash, logsInTx] of txLogs) {
        // Find completion event
        const completionLog = logsInTx.find(log => log.topics[0] === completedTopic);
        if (!completionLog) continue;
        
        try {
          const iface = contract.interface;
          let activityId;
          let playerAddress;
          let heroIds = [];
          
          if (config.activityType === 'hunt') {
            // Parse HuntCompleted event
            const parsed = iface.parseLog({
              topics: completionLog.topics,
              data: completionLog.data,
            });
            if (!parsed) continue;
            
            const huntData = parsed.args.hunt || parsed.args[1];
            
            // NOTE: The ABI tuple field names are swapped in ethers parsing:
            // huntData[0] / huntData.huntDataId = actual huntId (instance ID)
            // huntData[1] / huntData.huntId = actual huntDataId (activity type: 1=Mad Boar, 2=Bad Motherclucker)
            // So we use index 1 to get the activity type
            activityId = Number(huntData[1] || huntData.huntId);
            playerAddress = (huntData[4] || huntData.player).toLowerCase();
            heroIds = (huntData[3] || huntData.heroIds || []).map(h => BigInt(h));
            
            const huntWon = parsed.args.huntWon ?? parsed.args[2];
            if (!huntWon) {
              continue; // Hunt was lost
            }
          } else {
            // Parse PatrolCompleted event
            const parsed = iface.parseLog({
              topics: completionLog.topics,
              data: completionLog.data,
            });
            if (!parsed) continue;
            
            activityId = Number(parsed.args[0]);
            playerAddress = (parsed.args.player || parsed.args[1]).toLowerCase();
            
            if (!parsed.args.patrolWon && parsed.args[3] === false) {
              continue; // Patrol was lost
            }
            
            // Default to trial 1 for now
            activityId = 1;
          }
          
          // Get activity database ID
          const activityIdInDb = await getActivityDbId(config.chainId, config.activityType, activityId);
          if (!activityIdInDb) {
            console.warn(`[PVE ${chain}] Unknown activity: ${config.activityType} ${activityId}`);
            continue;
          }
          
          // Calculate party luck (expensive - needs archive RPC)
          let partyLuck = null;
          if (heroIds.length > 0) {
            partyLuck = await calculatePartyLuck(chain, heroIds, completionLog.blockNumber);
          }
          
          // Find pet bonus events in this tx (for hunts)
          const petBonusLogs = petBonusTopic 
            ? logsInTx.filter(log => log.topics[0] === petBonusTopic)
            : [];
          const petIds = petBonusLogs.map(log => {
            const parsed = iface.parseLog({ topics: log.topics, data: log.data });
            return parsed ? BigInt(parsed.args.petId || parsed.args[3]) : 0n;
          }).filter(p => p > 0n);
          
          let scavengerBonusPct = null;
          if (petIds.length > 0) {
            for (const petId of petIds) {
              const bonusPct = await getScavengerBonusPct(chain, petId, completionLog.blockNumber);
              if (bonusPct > (scavengerBonusPct || 0)) {
                scavengerBonusPct = bonusPct;
              }
            }
          }
          
          // Get block timestamp
          const block = await provider.getBlock(completionLog.blockNumber);
          const completedAt = block ? new Date(block.timestamp * 1000) : new Date();
          
          // Insert completion record
          // Convert hero/pet IDs to strings for BIGINT array (avoids JS number precision loss)
          const heroIdStrs = heroIds.map(h => String(h));
          const petIdStrs = petIds.map(p => String(p));
          const safePartyLuck = partyLuck ?? 0;
          const safeScavengerBonus = scavengerBonusPct ?? 0;
          const completedAtIso = completedAt.toISOString();
          
          try {
            // Store hero/pet IDs as JSON strings (TEXT column)
            // Escape single quotes for SQL safety
            const heroIdsJson = JSON.stringify(heroIds.map(h => String(h))).replace(/'/g, "''");
            const petIdsJson = JSON.stringify(petIds.map(p => String(p))).replace(/'/g, "''");
            
            // Use execRawSQL with .unsafe() - completely bypass all type inference
            // Omit hero/pet columns to avoid Neon pooler type caching issues
            const insertSQL = `
              INSERT INTO pve_completions (
                tx_hash, block_number, chain_id, activity_id, player_address, 
                party_luck, scavenger_bonus_pct, completed_at
              ) VALUES (
                '${txHash}', ${completionLog.blockNumber}, ${config.chainId}, ${activityIdInDb},
                '${playerAddress}', ${safePartyLuck}, ${safeScavengerBonus}, '${completedAtIso}'
              )
              ON CONFLICT (tx_hash) DO NOTHING
              RETURNING id
            `;
            const result = await execRawSQL(insertSQL);
            console.log(`[PVE ${chain}] Inserted completion tx=${txHash.slice(0,10)}... result=`, result?.length > 0 ? `id=${result[0].id}` : 'conflict/skipped');
            totalCompletionsFound++;
          } catch (insertError) {
            console.error(`[PVE ${chain}] Completion insert error:`, insertError);
            console.error(`[PVE ${chain}] Error code:`, insertError?.code, 'Detail:', insertError?.detail);
            continue;
          }
          
          // Process reward events
          const rewardLogs = logsInTx.filter(log => log.topics[0] === rewardTopic);
          for (const rewardLog of rewardLogs) {
            const parsed = iface.parseLog({
              topics: rewardLog.topics,
              data: rewardLog.data,
            });
            if (!parsed) continue;
            
            const itemAddress = (parsed.args.item || parsed.args[2]).toLowerCase();
            const amount = Number(parsed.args.amount || parsed.args[3] || 1);
            
            const itemId = await getOrCreateLootItem(config.chainId, itemAddress);
            
            // Use execRawSQL with .unsafe() - completely bypass all type inference
            // Omit hero/pet columns to avoid Neon pooler type caching issues
            const rewardSQL = `
              INSERT INTO pve_reward_events (
                tx_hash, log_index, block_number, chain_id, activity_id, item_id,
                amount, player_address, party_luck, pet_bonus_active, scavenger_bonus_pct
              ) VALUES (
                '${txHash}', ${rewardLog.index}, ${rewardLog.blockNumber}, ${config.chainId},
                ${activityIdInDb}, ${itemId}, ${amount}, '${playerAddress}',
                ${partyLuck || 0}, ${petIds.length > 0}, ${scavengerBonusPct || 0}
              )
              ON CONFLICT (tx_hash, log_index) DO NOTHING
            `;
            await execRawSQL(rewardSQL);
            totalRewardsFound++;
          }
          
          // Process equipment minted events
          const equipmentLogs = logsInTx.filter(log => log.topics[0] === equipmentTopic);
          for (const eqLog of equipmentLogs) {
            const parsed = iface.parseLog({
              topics: eqLog.topics,
              data: eqLog.data,
            });
            if (!parsed) continue;
            
            const itemAddress = (parsed.args.item || parsed.args[1]).toLowerCase();
            const itemId = await getOrCreateLootItem(config.chainId, itemAddress);
            
            // Use execRawSQL with .unsafe() - completely bypass all type inference
            // Omit hero/pet columns to avoid Neon pooler type caching issues
            const eqSQL = `
              INSERT INTO pve_reward_events (
                tx_hash, log_index, block_number, chain_id, activity_id, item_id,
                amount, player_address, party_luck, pet_bonus_active, scavenger_bonus_pct
              ) VALUES (
                '${txHash}', ${eqLog.index}, ${eqLog.blockNumber}, ${config.chainId},
                ${activityIdInDb}, ${itemId}, 1, '${playerAddress}',
                ${partyLuck || 0}, ${petIds.length > 0}, ${scavengerBonusPct || 0}
              )
              ON CONFLICT (tx_hash, log_index) DO NOTHING
            `;
            await execRawSQL(eqSQL);
            totalRewardsFound++;
          }
          
        } catch (parseError) {
          console.error(`[PVE ${chain}] Error parsing tx ${txHash}:`, parseError.message);
          continue;
        }
      }
      
      batchCount++;
      currentBlock = endBlock + 1;
      
      updateLiveProgress(chain, {
        currentBlock: endBlock,
        eventsFound: totalRewardsFound,
        completionsFound: totalCompletionsFound,
        batchesCompleted: batchCount,
        lastBatchAt: new Date().toISOString(),
      });
      
      // Update checkpoint in DB
      await db.execute(sql`
        UPDATE pve_indexer_checkpoints 
        SET last_indexed_block = ${endBlock},
            total_completions = total_completions + ${totalCompletionsFound},
            total_rewards = total_rewards + ${totalRewardsFound},
            last_indexed_at = NOW()
        WHERE chain_id = ${config.chainId}
      `);
      
      if (batchCount % 25 === 0) {
        console.log(`[PVE ${chain}] Block ${endBlock}/${toBlock} (${((endBlock - fromBlock) / (toBlock - fromBlock) * 100).toFixed(1)}%) - ${totalCompletionsFound} completions, ${totalRewardsFound} rewards`);
      }
      
    } catch (error) {
      console.error(`[PVE ${chain}] Error indexing blocks ${currentBlock}-${endBlock}:`, error.message);
      updateLiveProgress(chain, { lastError: error.message });
      await db.execute(sql`
        UPDATE pve_indexer_checkpoints 
        SET status = 'error', last_error = ${error.message}
        WHERE chain_id = ${config.chainId}
      `);
      throw error;
    }
  }
  
  return { totalRewardsFound, totalCompletionsFound, batchCount };
}

// Worker-based batch indexing (processes a range assigned to a worker)
async function indexWorkerBlockRange(chain, workerId, fromBlock, toBlock) {
  const config = CHAIN_CONFIGS[chain];
  const provider = getArchiveProvider(chain);
  
  let totalRewardsFound = 0;
  let totalCompletionsFound = 0;
  let batchCount = 0;
  let currentBlock = fromBlock;
  
  while (currentBlock <= toBlock) {
    const endBlock = Math.min(currentBlock + BLOCKS_PER_QUERY - 1, toBlock);
    
    try {
      // Same indexing logic as indexBlockRange
      const logs = await withRetry(() => provider.getLogs({
        address: config.contractAddress,
        fromBlock: currentBlock,
        toBlock: endBlock,
      }), `getLogs ${currentBlock}-${endBlock}`, chain);
      
      // Group by tx
      const byTx = new Map();
      for (const log of logs) {
        const key = log.transactionHash;
        if (!byTx.has(key)) byTx.set(key, []);
        byTx.get(key).push(log);
      }
      
      const completedTopic = config.activityType === 'hunt' 
        ? HUNT_REWARD_EVENTS.HuntCompleted 
        : PATROL_REWARD_EVENTS.PatrolCompleted;
      const rewardTopic = config.activityType === 'hunt'
        ? HUNT_REWARD_EVENTS.HuntRewardMinted
        : PATROL_REWARD_EVENTS.PatrolRewardMinted;
      const equipmentTopic = config.activityType === 'hunt'
        ? HUNT_REWARD_EVENTS.HuntEquipmentMinted
        : PATROL_REWARD_EVENTS.PatrolEquipmentMinted;
      
      const iface = new ethers.Interface(config.abi);
      
      for (const [txHash, logsInTx] of byTx) {
        const completionLog = logsInTx.find(l => l.topics[0] === completedTopic);
        if (!completionLog) continue;
        
        try {
          const parsed = iface.parseLog({
            topics: completionLog.topics,
            data: completionLog.data,
          });
          if (!parsed) continue;
          
          let activityIdOnChain, playerAddress, heroIds, petIds, partyLuck, victory;
          
          if (config.activityType === 'hunt') {
            const huntTuple = parsed.args[1] || parsed.args.hunt;
            // NOTE: The ABI tuple field names are swapped in ethers parsing:
            // huntTuple[0] / huntTuple.huntDataId = actual huntId (instance ID)
            // huntTuple[1] / huntTuple.huntId = actual huntDataId (activity type: 1=Mad Boar, 2=Bad Motherclucker)
            // So we use index 1 to get the activity type
            activityIdOnChain = (huntTuple[1] || huntTuple.huntId).toString();
            playerAddress = (huntTuple[4] || huntTuple.player).toLowerCase();
            heroIds = Array.from(huntTuple[3] || huntTuple.heroIds || []).map(h => h.toString());
            const victory = parsed.args[2] || parsed.args.huntWon;
            if (!victory) continue; // Skip lost hunts
            petIds = [];
            partyLuck = 0;
          } else {
            activityIdOnChain = (parsed.args[0] || parsed.args.patrolId).toString();
            playerAddress = (parsed.args[1] || parsed.args.player).toLowerCase();
            victory = parsed.args[3] || parsed.args.patrolWon;
            heroIds = [];
            petIds = [];
            partyLuck = 0;
          }
          
          const heroIdNums = heroIds.map(h => parseInt(h));
          const petIdNums = petIds.map(p => parseInt(p));
          
          let scavengerBonusPct = 0;
          
          const activityIdInDb = await getActivityDbId(config.chainId, config.activityType, parseInt(activityIdOnChain));
          if (!activityIdInDb) {
            console.warn(`[PVE ${chain} W${workerId}] Unknown activity: ${config.activityType} ${activityIdOnChain}`);
            continue;
          }
          
          // Get block timestamp for completed_at
          const block = await provider.getBlock(completionLog.blockNumber);
          const completedAt = block ? new Date(Number(block.timestamp) * 1000) : new Date();
          
          // Use execRawSQL with .unsafe() - completely bypass all type inference
          // Omit hero/pet columns to avoid Neon pooler type caching issues
          const completedAtIsoW = completedAt.toISOString();
          
          const completionSQLW = `
            INSERT INTO pve_completions (
              tx_hash, block_number, chain_id, activity_id, player_address,
              party_luck, scavenger_bonus_pct, completed_at
            ) VALUES (
              '${txHash}', ${completionLog.blockNumber}, ${config.chainId},
              ${activityIdInDb}, '${playerAddress}',
              ${partyLuck}, ${scavengerBonusPct}, '${completedAtIsoW}'
            )
            ON CONFLICT (tx_hash) DO NOTHING
          `;
          await execRawSQL(completionSQLW);
          totalCompletionsFound++;
          
          // Process reward events
          const rewardLogs = logsInTx.filter(log => log.topics[0] === rewardTopic);
          for (const rLog of rewardLogs) {
            const rParsed = iface.parseLog({ topics: rLog.topics, data: rLog.data });
            if (!rParsed) continue;
            
            const itemAddress = (rParsed.args.item || rParsed.args[2]).toLowerCase();
            const amount = parseInt((rParsed.args.amount || rParsed.args[3]).toString());
            const itemId = await getOrCreateLootItem(config.chainId, itemAddress);
            
            // Use execRawSQL with .unsafe() - completely bypass all type inference
            // Omit hero/pet columns to avoid Neon pooler type caching issues
            const rewardSQLW = `
              INSERT INTO pve_reward_events (
                tx_hash, log_index, block_number, chain_id, activity_id, item_id,
                amount, player_address, party_luck, pet_bonus_active, scavenger_bonus_pct
              ) VALUES (
                '${txHash}', ${rLog.index}, ${rLog.blockNumber}, ${config.chainId},
                ${activityIdInDb}, ${itemId}, ${amount}, '${playerAddress}',
                ${partyLuck}, ${petIds.length > 0}, ${scavengerBonusPct}
              )
              ON CONFLICT (tx_hash, log_index) DO NOTHING
            `;
            await execRawSQL(rewardSQLW);
            totalRewardsFound++;
          }
          
          // Process equipment events
          const equipLogs = logsInTx.filter(log => log.topics[0] === equipmentTopic);
          for (const eLog of equipLogs) {
            const eParsed = iface.parseLog({ topics: eLog.topics, data: eLog.data });
            if (!eParsed) continue;
            
            const itemAddress = (eParsed.args.item || eParsed.args[1]).toLowerCase();
            const itemId = await getOrCreateLootItem(config.chainId, itemAddress);
            
            // Use execRawSQL with .unsafe() - completely bypass all type inference
            // Omit hero/pet columns to avoid Neon pooler type caching issues
            const eqSQLW = `
              INSERT INTO pve_reward_events (
                tx_hash, log_index, block_number, chain_id, activity_id, item_id,
                amount, player_address, party_luck, pet_bonus_active, scavenger_bonus_pct
              ) VALUES (
                '${txHash}', ${eLog.index}, ${eLog.blockNumber}, ${config.chainId},
                ${activityIdInDb}, ${itemId}, 1, '${playerAddress}',
                ${partyLuck}, ${petIds.length > 0}, ${scavengerBonusPct}
              )
              ON CONFLICT (tx_hash, log_index) DO NOTHING
            `;
            await execRawSQL(eqSQLW);
            totalRewardsFound++;
          }
        } catch (parseError) {
          console.error(`[PVE ${chain} W${workerId}] Parse/insert error for tx ${txHash}:`, parseError.message);
          continue;
        }
      }
      
      batchCount++;
      currentBlock = endBlock + 1;
      
      // Update worker progress
      updateWorkerLiveProgress(chain, workerId, {
        currentBlock: endBlock,
        eventsFound: totalRewardsFound,
        completionsFound: totalCompletionsFound,
        batchesCompleted: batchCount,
        lastBatchAt: new Date().toISOString(),
      });
      
      // Update checkpoint in DB
      await db.execute(sql`
        UPDATE pve_indexer_checkpoints 
        SET last_indexed_block = ${endBlock},
            total_completions = total_completions + ${totalCompletionsFound},
            total_rewards = total_rewards + ${totalRewardsFound},
            last_indexed_at = NOW()
        WHERE chain_id = ${config.chainId}
      `);
      
      if (batchCount % 25 === 0) {
        console.log(`[PVE ${chain} W${workerId}] Block ${endBlock}/${toBlock} - ${totalCompletionsFound} completions, ${totalRewardsFound} rewards`);
      }
      
    } catch (error) {
      console.error(`[PVE ${chain} W${workerId}] Error at block ${currentBlock}:`, error.message);
      throw error;
    }
  }
  
  return { totalRewardsFound, totalCompletionsFound, batchCount };
}

// Run a single batch for a worker
async function runPVEWorkerBatch(chain, workerId) {
  const config = CHAIN_CONFIGS[chain];
  const indexerName = getWorkerIndexerName(chain, workerId);
  
  if (runningWorkers.get(indexerName)) {
    return { status: 'already_running' };
  }
  
  runningWorkers.set(indexerName, true);
  
  try {
    const workerInfo = autoRunIntervals.get(getWorkerKey(chain, workerId));
    if (!workerInfo) {
      runningWorkers.set(indexerName, false);
      return { status: 'no_worker_info' };
    }
    
    const provider = getProvider(chain);
    const latestBlock = await withRetry(() => provider.getBlockNumber(), 'getBlockNumber', chain);
    const workerTargetBlock = workerInfo.rangeEnd || latestBlock;
    
    const startBlock = workerInfo.currentBlock + 1;
    const endBlock = Math.min(startBlock + BATCH_SIZE - 1, workerTargetBlock);
    
    if (startBlock > workerTargetBlock) {
      runningWorkers.set(indexerName, false);
      updateWorkerLiveProgress(chain, workerId, { completedAt: new Date().toISOString(), percentComplete: 100 });
      return { status: 'completed' };
    }
    
    updateWorkerLiveProgress(chain, workerId, {
      isRunning: true,
      currentBlock: startBlock,
      targetBlock: workerTargetBlock,
      startedAt: new Date().toISOString(),
    });
    
    const result = await indexWorkerBlockRange(chain, workerId, startBlock, endBlock);
    
    // Update worker's current block
    workerInfo.currentBlock = endBlock;
    
    const isComplete = endBlock >= workerTargetBlock;
    
    updateWorkerLiveProgress(chain, workerId, {
      isRunning: false,
      currentBlock: endBlock,
      completedAt: isComplete ? new Date().toISOString() : null,
      percentComplete: isComplete ? 100 : ((endBlock - workerInfo.rangeStart) / (workerTargetBlock - workerInfo.rangeStart) * 100),
    });
    
    runningWorkers.set(indexerName, false);
    
    console.log(`[PVE ${chain} W${workerId}] Batch done: ${result.totalCompletionsFound} completions, ${result.totalRewardsFound} rewards`);
    
    return {
      status: isComplete ? 'completed' : 'batch_done',
      completionsFound: result.totalCompletionsFound,
      rewardsFound: result.totalRewardsFound,
      blocksIndexed: endBlock - startBlock + 1,
      currentBlock: endBlock,
      targetBlock: workerTargetBlock,
    };
    
  } catch (error) {
    console.error(`[PVE ${chain} W${workerId}] Batch error:`, error.message);
    runningWorkers.set(indexerName, false);
    updateWorkerLiveProgress(chain, workerId, { isRunning: false, lastError: error.message });
    return { status: 'error', error: error.message };
  }
}

// Work-stealing: Find work from another worker
function findWorkToSteal(chain, thiefWorkerId) {
  const RESERVATION_TIMEOUT_MS = 60000;
  
  let bestDonor = null;
  let maxRemainingBlocks = 0;
  const now = Date.now();
  const count = activeWorkerCount[chain] || PVE_WORKERS;
  
  for (let w = 0; w < count; w++) {
    if (w === thiefWorkerId) continue;
    
    const key = getWorkerKey(chain, w);
    const workerInfo = autoRunIntervals.get(key);
    if (!workerInfo) continue;
    
    const reservationKey = `pve_${chain}_${w}`;
    const reservedAt = donorReservations.get(reservationKey);
    if (reservedAt && (now - reservedAt) < RESERVATION_TIMEOUT_MS) {
      continue;
    }
    
    const progress = workerLiveProgress.get(key);
    if (!progress || progress.completedAt) continue;
    
    const currentBlock = workerInfo.currentBlock || workerInfo.rangeStart || 0;
    const targetBlock = workerInfo.rangeEnd;
    
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
  
  const reservationKey = `pve_${chain}_${bestDonor.workerId}`;
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

// Apply work-stealing
async function applyWorkSteal(chain, thiefWorkerId, stealInfo) {
  // Update donor's range
  const donorKey = getWorkerKey(chain, stealInfo.donorWorkerId);
  const donorWorkerInfo = autoRunIntervals.get(donorKey);
  if (donorWorkerInfo) {
    donorWorkerInfo.rangeEnd = stealInfo.newDonorRangeEnd;
  }
  
  // Update thief's range
  const thiefKey = getWorkerKey(chain, thiefWorkerId);
  const thiefWorkerInfo = autoRunIntervals.get(thiefKey);
  if (thiefWorkerInfo) {
    thiefWorkerInfo.rangeStart = stealInfo.newRangeStart;
    thiefWorkerInfo.rangeEnd = stealInfo.newRangeEnd;
    thiefWorkerInfo.currentBlock = stealInfo.newRangeStart;
  }
  
  updateWorkerLiveProgress(chain, thiefWorkerId, {
    rangeStart: stealInfo.newRangeStart,
    rangeEnd: stealInfo.newRangeEnd,
    currentBlock: stealInfo.newRangeStart,
    targetBlock: stealInfo.newRangeEnd,
    completedAt: null,
    percentComplete: 0,
  });
  
  donorReservations.delete(stealInfo.reservationKey);
  
  console.log(`[PVE ${chain}] Worker ${thiefWorkerId} stole ${stealInfo.blocksStolen.toLocaleString()} blocks from worker ${stealInfo.donorWorkerId}`);
}

// Start a single worker's auto-run
async function startPVEWorkerAutoRun(chain, workerId, rangeStart, rangeEnd, intervalMs = AUTO_RUN_INTERVAL_MS) {
  const key = getWorkerKey(chain, workerId);
  if (autoRunIntervals.has(key)) {
    console.log(`[PVE ${chain}] Worker ${workerId} already running`);
    return { status: 'already_running', workerId };
  }
  
  console.log(`[PVE ${chain}] Starting worker ${workerId} (blocks ${rangeStart.toLocaleString()}-${rangeEnd ? rangeEnd.toLocaleString() : 'latest'}, interval: ${intervalMs / 1000}s)`);
  
  clearWorkerLiveProgress(chain, workerId);
  
  updateWorkerLiveProgress(chain, workerId, {
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
    currentBlock: rangeStart,
    startedAt: new Date().toISOString(),
    lastRunAt: null,
    runsCompleted: 0,
    interval: null,
  };
  
  autoRunIntervals.set(key, info);
  
  // Stagger worker starts
  const offsetMs = Math.floor((workerId / PVE_WORKERS) * intervalMs);
  
  (async () => {
    try {
      if (offsetMs > 0) {
        await new Promise(r => setTimeout(r, offsetMs));
      }
      console.log(`[PVE ${chain}] Initial batch for worker ${workerId} (offset ${(offsetMs / 1000).toFixed(1)}s)`);
      await runPVEWorkerBatch(chain, workerId);
      info.lastRunAt = new Date().toISOString();
      info.runsCompleted++;
    } catch (err) {
      console.error(`[PVE ${chain}] Initial error for worker ${workerId}:`, err.message);
    }
  })();
  
  info.interval = setInterval(async () => {
    if (!autoRunIntervals.has(key)) return;
    
    try {
      const result = await runPVEWorkerBatch(chain, workerId);
      info.lastRunAt = new Date().toISOString();
      info.runsCompleted++;
      
      // Work-stealing when completed
      if (result.status === 'completed') {
        const stealInfo = findWorkToSteal(chain, workerId);
        if (stealInfo) {
          await applyWorkSteal(chain, workerId, stealInfo);
          console.log(`[PVE ${chain}] Worker ${workerId} continuing with stolen work`);
        } else {
          console.log(`[PVE ${chain}] Worker ${workerId} completed, no work to steal`);
        }
      }
    } catch (err) {
      console.error(`[PVE ${chain}] Worker ${workerId} error:`, err.message);
    }
  }, intervalMs);
  
  return { status: 'started', workerId, rangeStart, rangeEnd };
}

// Start all workers for a chain (new parallel auto-run)
export async function startPVEWorkersAutoRun(chain, intervalMs = AUTO_RUN_INTERVAL_MS, targetWorkers = PVE_WORKERS) {
  const config = CHAIN_CONFIGS[chain];
  let workerCount = Math.min(targetWorkers, PVE_WORKERS);
  let latestBlock;
  
  try {
    const provider = getProvider(chain);
    latestBlock = await withRetry(() => provider.getBlockNumber(), 'getBlockNumber (init)', chain);
  } catch (err) {
    console.error(`[PVE ${chain}] RPC unavailable, cannot start workers`);
    return { status: 'rpc_failed', error: err.message };
  }
  
  // Get checkpoint to know where to start from
  const checkpoint = await getCheckpoint(config.chainId);
  const startFromBlock = parseInt(checkpoint?.last_indexed_block) || 0;
  const totalBlocks = latestBlock - startFromBlock;
  const blocksPerWorker = Math.ceil(totalBlocks / workerCount);
  
  console.log(`[PVE ${chain}] Starting ${workerCount} workers (${blocksPerWorker.toLocaleString()} blocks each, from ${startFromBlock.toLocaleString()} to ${latestBlock.toLocaleString()})`);
  
  activeWorkerCount[chain] = workerCount;
  
  // Set timing for countdown
  const now = Date.now();
  autoRunTiming.set(`pve_${chain}`, {
    startedAt: now,
    lastRunAt: now,
    intervalMs,
    workerCount,
  });
  
  const results = [];
  
  for (let w = 0; w < workerCount; w++) {
    const rangeStart = startFromBlock + (w * blocksPerWorker);
    const rangeEnd = (w === workerCount - 1) ? latestBlock : (startFromBlock + ((w + 1) * blocksPerWorker) - 1);
    
    await new Promise(r => setTimeout(r, 500));
    
    try {
      const result = await startPVEWorkerAutoRun(chain, w, rangeStart, rangeEnd, intervalMs);
      results.push(result);
    } catch (err) {
      console.error(`[PVE ${chain}] Worker ${w} failed to start:`, err.message);
    }
  }
  
  return {
    status: 'started',
    chain,
    workerCount,
    blocksPerWorker,
    totalBlocks,
    workers: results,
  };
}

// Stop all workers for a chain
export function stopPVEWorkersAutoRun(chain) {
  const count = activeWorkerCount[chain] || PVE_WORKERS;
  let stoppedCount = 0;
  
  for (let w = 0; w < count; w++) {
    const key = getWorkerKey(chain, w);
    const workerInfo = autoRunIntervals.get(key);
    if (workerInfo && workerInfo.interval) {
      clearInterval(workerInfo.interval);
      autoRunIntervals.delete(key);
      clearWorkerLiveProgress(chain, w);
      stoppedCount++;
    }
  }
  
  autoRunTiming.delete(`pve_${chain}`);
  activeWorkerCount[chain] = 0;
  
  console.log(`[PVE ${chain}] Stopped ${stoppedCount} workers`);
  
  return { status: 'stopped', stoppedCount };
}

// Run a single batch for a chain (legacy single-threaded, kept for compatibility)
export async function runPVEIndexerBatch(chain) {
  const config = CHAIN_CONFIGS[chain];
  
  if (runningIndexers.get(chain)) {
    return { status: 'already_running' };
  }
  
  runningIndexers.set(chain, true);
  
  try {
    const checkpoint = await getCheckpoint(config.chainId);
    if (!checkpoint) {
      runningIndexers.set(chain, false);
      return { status: 'no_checkpoint' };
    }
    
    const provider = getProvider(chain);
    const latestBlock = await withRetry(() => provider.getBlockNumber(), 'getBlockNumber', chain);
    
    const lastIndexedBlock = parseInt(checkpoint.last_indexed_block) || 0;
    const startBlock = lastIndexedBlock + 1;
    const endBlock = Math.min(startBlock + BATCH_SIZE - 1, latestBlock);
    
    if (startBlock > latestBlock) {
      runningIndexers.set(chain, false);
      return { status: 'up_to_date', currentBlock: checkpoint.last_indexed_block };
    }
    
    await db.execute(sql`
      UPDATE pve_indexer_checkpoints SET status = 'running' WHERE chain_id = ${config.chainId}
    `);
    
    updateLiveProgress(chain, {
      isRunning: true,
      currentBlock: startBlock,
      targetBlock: endBlock,
      startBlock: checkpoint.last_indexed_block,
      startedAt: new Date().toISOString(),
    });
    
    console.log(`[PVE ${chain}] Starting batch from block ${startBlock} to ${endBlock}`);
    
    const result = await indexBlockRange(chain, startBlock, endBlock);
    
    const isComplete = endBlock >= latestBlock;
    
    await db.execute(sql`
      UPDATE pve_indexer_checkpoints 
      SET status = ${isComplete ? 'complete' : 'idle'}
      WHERE chain_id = ${config.chainId}
    `);
    
    updateLiveProgress(chain, {
      isRunning: false,
      currentBlock: endBlock,
      completedAt: isComplete ? new Date().toISOString() : null,
      percentComplete: isComplete ? 100 : undefined,
    });
    
    runningIndexers.set(chain, false);
    
    console.log(`[PVE ${chain}] Batch complete: ${result.totalCompletionsFound} completions, ${result.totalRewardsFound} rewards in ${result.batchCount} batches`);
    
    return {
      status: isComplete ? 'completed' : 'batch_done',
      completionsFound: result.totalCompletionsFound,
      rewardsFound: result.totalRewardsFound,
      blocksIndexed: endBlock - startBlock + 1,
      currentBlock: endBlock,
      targetBlock: latestBlock,
    };
    
  } catch (error) {
    console.error(`[PVE ${chain}] Batch error:`, error.message);
    runningIndexers.set(chain, false);
    updateLiveProgress(chain, { isRunning: false, lastError: error.message });
    return { status: 'error', error: error.message };
  }
}

// Start auto-run for a chain
export function startPVEIndexerAutoRun(chain) {
  const key = `pve_${chain}`;
  
  if (autoRunIntervals.has(key)) {
    console.log(`[PVE ${chain}] Auto-run already active`);
    return { status: 'already_running' };
  }
  
  console.log(`[PVE ${chain}] Starting auto-run with ${AUTO_RUN_INTERVAL_MS / 1000}s interval`);
  
  const now = Date.now();
  autoRunTiming.set(key, {
    startedAt: now,
    lastRunAt: now,
    intervalMs: AUTO_RUN_INTERVAL_MS,
  });
  
  const interval = setInterval(async () => {
    try {
      // Update lastRunAt when batch starts
      const timing = autoRunTiming.get(key);
      if (timing) {
        timing.lastRunAt = Date.now();
        autoRunTiming.set(key, timing);
      }
      await runPVEIndexerBatch(chain);
    } catch (error) {
      console.error(`[PVE ${chain}] Auto-run error:`, error.message);
    }
  }, AUTO_RUN_INTERVAL_MS);
  
  autoRunIntervals.set(key, interval);
  
  // Run immediately
  runPVEIndexerBatch(chain).catch(console.error);
  
  return { status: 'started' };
}

// Stop auto-run for a chain
export function stopPVEIndexerAutoRun(chain) {
  const key = `pve_${chain}`;
  
  const interval = autoRunIntervals.get(key);
  if (interval) {
    clearInterval(interval);
    autoRunIntervals.delete(key);
    autoRunTiming.delete(key);
    console.log(`[PVE ${chain}] Auto-run stopped`);
    return { status: 'stopped' };
  }
  
  return { status: 'not_running' };
}

// Helper to calculate next run time
function getTimingInfo(chain) {
  const key = `pve_${chain}`;
  const timing = autoRunTiming.get(key);
  if (!timing) return null;
  
  const nextRunAt = timing.lastRunAt + timing.intervalMs;
  return {
    lastRunAt: timing.lastRunAt,
    nextRunAt,
    intervalMs: timing.intervalMs,
  };
}

// Check if workers are running for a chain
function isWorkersRunning(chain) {
  const count = activeWorkerCount[chain] || 0;
  if (count === 0) return false;
  for (let w = 0; w < count; w++) {
    if (autoRunIntervals.has(getWorkerKey(chain, w))) return true;
  }
  return false;
}

// Get indexer status for all chains
export async function getPVEIndexerStatus() {
  const dfkCheckpoint = await getCheckpoint(CHAIN_CONFIGS.dfk.chainId);
  const metisCheckpoint = await getCheckpoint(CHAIN_CONFIGS.metis.chainId);
  
  // Check for worker-based auto-run OR legacy single-threaded
  const dfkAutoRunning = isWorkersRunning('dfk') || autoRunIntervals.has('pve_dfk');
  const metisAutoRunning = isWorkersRunning('metis') || autoRunIntervals.has('pve_metis');
  
  return {
    dfk: {
      chainId: CHAIN_CONFIGS.dfk.chainId,
      checkpoint: dfkCheckpoint,
      liveProgress: liveProgress.get('dfk'),
      isAutoRunning: dfkAutoRunning,
      timing: getTimingInfo('dfk'),
      workerCount: activeWorkerCount['dfk'] || 0,
      workers: getAllWorkerProgress('dfk'),
    },
    metis: {
      chainId: CHAIN_CONFIGS.metis.chainId,
      checkpoint: metisCheckpoint,
      liveProgress: liveProgress.get('metis'),
      isAutoRunning: metisAutoRunning,
      timing: getTimingInfo('metis'),
      workerCount: activeWorkerCount['metis'] || 0,
      workers: getAllWorkerProgress('metis'),
    },
  };
}

// Reset indexer to a specific block
export async function resetPVEIndexer(chain, toBlock) {
  const config = CHAIN_CONFIGS[chain];
  
  // Stop auto-run if active
  stopPVEIndexerAutoRun(chain);
  
  // Wait for any running batch to complete
  while (runningIndexers.get(chain)) {
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // Reset checkpoint
  await db.execute(sql`
    UPDATE pve_indexer_checkpoints 
    SET last_indexed_block = ${toBlock}, 
        status = 'idle',
        total_completions = 0,
        total_rewards = 0,
        last_error = NULL
    WHERE chain_id = ${config.chainId}
  `);
  
  // Clear live progress
  liveProgress.delete(chain);
  
  console.log(`[PVE ${chain}] Reset to block ${toBlock}`);
  
  return { status: 'reset', toBlock };
}

// Calculate drop stats for a specific activity/item combination
// scavengerBonusPct: optional filter for specific Scavenger bonus percentage (10-25)
export async function calculateDropStats(activityId, itemId, scavengerBonusPct = null) {
  // Get total drops with average luck and average Scavenger bonus
  let dropsQuery;
  if (scavengerBonusPct !== null) {
    dropsQuery = sql`
      SELECT COUNT(*) as count, AVG(party_luck) as avg_luck, AVG(scavenger_bonus_pct) as avg_scavenger_bonus
      FROM pve_reward_events 
      WHERE activity_id = ${activityId} AND item_id = ${itemId} AND scavenger_bonus_pct = ${scavengerBonusPct}
    `;
  } else {
    dropsQuery = sql`
      SELECT COUNT(*) as count, AVG(party_luck) as avg_luck, AVG(COALESCE(scavenger_bonus_pct, 0)) as avg_scavenger_bonus
      FROM pve_reward_events 
      WHERE activity_id = ${activityId} AND item_id = ${itemId}
    `;
  }
  const dropsResult = await db.execute(dropsQuery);
  
  // Get total completions
  let completionsQuery;
  if (scavengerBonusPct !== null) {
    completionsQuery = sql`
      SELECT COUNT(*) as count
      FROM pve_completions 
      WHERE activity_id = ${activityId} AND scavenger_bonus_pct = ${scavengerBonusPct}
    `;
  } else {
    completionsQuery = sql`
      SELECT COUNT(*) as count
      FROM pve_completions 
      WHERE activity_id = ${activityId}
    `;
  }
  const completionsResult = await db.execute(completionsQuery);
  
  const totalDrops = parseInt(dropsResult[0]?.count || '0');
  const totalCompletions = parseInt(completionsResult[0]?.count || '0');
  const avgLuck = parseFloat(dropsResult[0]?.avg_luck || '0');
  const avgScavengerBonus = parseFloat(dropsResult[0]?.avg_scavenger_bonus || '0');
  
  if (totalCompletions === 0) {
    return null;
  }
  
  // Calculate observed rate
  const observedRate = totalDrops / totalCompletions;
  
  // Calculate base rate: baseRate = observedRate - (0.0002 × avgPartyLCK) - scavengerBonus
  // Scavenger bonus is stored as percentage (10-25), convert to decimal
  const scavengerBonusValue = avgScavengerBonus / 100;
  const luckContribution = 0.0002 * avgLuck;
  const calculatedBaseRate = Math.max(0, observedRate - luckContribution - scavengerBonusValue);
  
  // Wilson score confidence interval
  const z = 1.96; // 95% confidence
  const n = totalCompletions;
  const p = observedRate;
  const denominator = 1 + z * z / n;
  const center = (p + z * z / (2 * n)) / denominator;
  const margin = z * Math.sqrt((p * (1 - p) + z * z / (4 * n)) / n) / denominator;
  
  return {
    totalDrops,
    totalCompletions,
    avgPartyLuck: avgLuck,
    avgScavengerBonusPct: avgScavengerBonus,
    observedRate,
    luckContribution,
    scavengerBonusValue,
    calculatedBaseRate,
    confidenceLower: Math.max(0, center - margin),
    confidenceUpper: Math.min(1, center + margin),
  };
}

// Backfill known item names for existing items in the database
export async function backfillItemNames() {
  await initializePVETables();
  
  let updated = 0;
  for (const [address, metadata] of Object.entries(KNOWN_ITEMS)) {
    // Update all items matching this address, not just null ones
    const result = await db.execute(sql`
      UPDATE pve_loot_items 
      SET name = ${metadata.name}, item_type = ${metadata.type}, rarity = ${metadata.rarity}
      WHERE item_address = ${address}
    `);
    if (result.rowCount > 0) {
      updated += result.rowCount;
    }
  }
  
  console.log(`[PVE] Backfilled ${updated} item names`);
  return { updated, knownItems: Object.keys(KNOWN_ITEMS).length };
}
