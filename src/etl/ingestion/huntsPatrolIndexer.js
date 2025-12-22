// src/etl/ingestion/huntsPatrolIndexer.js
// Multi-chain PVE indexer for Hunts (DFK Chain) and Patrols (Metis)
// Tracks completions, rewards, pet bonuses, and hero/equipment snapshots
// for calculating accurate drop rates with the formula:
// baseRate = observedRate - (0.0002 × partyLCK) - petBonus

import { ethers } from 'ethers';
import { sql } from 'drizzle-orm';
import { db } from '../../../server/db.js';
import { isScavengerBonus, getScavengerLootBonus } from '../../../pet-data.js';

// Configuration
const BLOCKS_PER_QUERY = 2000;
const BATCH_SIZE = 100000;
const AUTO_RUN_INTERVAL_MS = 60 * 1000;

// Contract addresses and RPC URLs
const DFK_CHAIN_RPC = 'https://subnets.avax.network/defi-kingdoms/dfk-chain/rpc';
const DFK_ARCHIVE_RPC = 'https://avax-dfk.gateway.pokt.network/v1/lb/6244818c00b9f0003ad1b619/ext/bc/q2aTwKuyzgs8pynF7UXBZCU7DejbZbZ6EUyHr3JQzYgwNPUPi/rpc';
const METIS_RPC = 'https://andromeda.metis.io/?owner=1088';
const METIS_ARCHIVE_RPC = 'https://rpc.ankr.com/metis';

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
        hero_ids INTEGER[],
        party_luck INTEGER,
        pet_ids INTEGER[],
        pet_bonus_tier INTEGER,
        scavenger_bonus_pct INTEGER,
        completed_at TIMESTAMP NOT NULL
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
        hero_ids INTEGER[],
        party_luck INTEGER,
        pet_ids INTEGER[],
        pet_bonus_active BOOLEAN DEFAULT FALSE,
        pet_bonus_tier INTEGER,
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
  
  const existing = await db.execute(sql`
    SELECT id FROM pve_loot_items WHERE chain_id = ${chainId} AND item_address = ${normalizedAddress}
  `);
  
  if (existing[0]) {
    return existing[0].id;
  }
  
  const inserted = await db.execute(sql`
    INSERT INTO pve_loot_items (item_address, chain_id) 
    VALUES (${normalizedAddress}, ${chainId})
    ON CONFLICT (chain_id, item_address) DO UPDATE SET item_address = EXCLUDED.item_address
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
      
      const logs = await provider.getLogs({
        address: config.contractAddress,
        topics: [topicsToQuery],
        fromBlock: currentBlock,
        toBlock: endBlock,
      });
      
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
            activityId = Number(huntData.huntDataId);
            playerAddress = huntData.player.toLowerCase();
            heroIds = (huntData.heroIds || []).map(h => BigInt(h));
            
            if (!parsed.args.huntWon && parsed.args[2] === false) {
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
          const heroIdNums = heroIds.map(h => Number(h));
          const petIdNums = petIds.map(p => Number(p));
          
          await db.execute(sql`
            INSERT INTO pve_completions (
              tx_hash, block_number, chain_id, activity_id, player_address, 
              hero_ids, party_luck, pet_ids, scavenger_bonus_pct, completed_at
            ) VALUES (
              ${txHash}, ${completionLog.blockNumber}, ${config.chainId}, ${activityIdInDb},
              ${playerAddress}, ${heroIdNums}, ${partyLuck}, 
              ${petIdNums}, ${scavengerBonusPct}, ${completedAt}
            )
            ON CONFLICT (tx_hash) DO NOTHING
          `);
          totalCompletionsFound++;
          
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
            
            await db.execute(sql`
              INSERT INTO pve_reward_events (
                tx_hash, log_index, block_number, chain_id, activity_id, item_id,
                amount, player_address, hero_ids, party_luck, pet_ids, 
                pet_bonus_active, scavenger_bonus_pct
              ) VALUES (
                ${txHash}, ${rewardLog.index}, ${rewardLog.blockNumber}, ${config.chainId},
                ${activityIdInDb}, ${itemId}, ${amount}, ${playerAddress},
                ${heroIdNums}, ${partyLuck}, ${petIdNums},
                ${petIds.length > 0}, ${scavengerBonusPct}
              )
              ON CONFLICT (tx_hash, log_index) DO NOTHING
            `);
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
            
            await db.execute(sql`
              INSERT INTO pve_reward_events (
                tx_hash, log_index, block_number, chain_id, activity_id, item_id,
                amount, player_address, hero_ids, party_luck, pet_ids,
                pet_bonus_active, scavenger_bonus_pct
              ) VALUES (
                ${txHash}, ${eqLog.index}, ${eqLog.blockNumber}, ${config.chainId},
                ${activityIdInDb}, ${itemId}, 1, ${playerAddress},
                ${heroIdNums}, ${partyLuck}, ${petIdNums},
                ${petIds.length > 0}, ${scavengerBonusPct}
              )
              ON CONFLICT (tx_hash, log_index) DO NOTHING
            `);
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

// Run a single batch for a chain
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
    const latestBlock = await provider.getBlockNumber();
    
    const startBlock = checkpoint.last_indexed_block + 1;
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

// Get indexer status for all chains
export async function getPVEIndexerStatus() {
  const dfkCheckpoint = await getCheckpoint(CHAIN_CONFIGS.dfk.chainId);
  const metisCheckpoint = await getCheckpoint(CHAIN_CONFIGS.metis.chainId);
  
  return {
    dfk: {
      chainId: CHAIN_CONFIGS.dfk.chainId,
      checkpoint: dfkCheckpoint,
      liveProgress: liveProgress.get('dfk'),
      isAutoRunning: autoRunIntervals.has('pve_dfk'),
      timing: getTimingInfo('dfk'),
    },
    metis: {
      chainId: CHAIN_CONFIGS.metis.chainId,
      checkpoint: metisCheckpoint,
      liveProgress: liveProgress.get('metis'),
      isAutoRunning: autoRunIntervals.has('pve_metis'),
      timing: getTimingInfo('metis'),
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
