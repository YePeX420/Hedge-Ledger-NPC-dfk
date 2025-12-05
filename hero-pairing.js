/**
 * Hero Pairing Detection Module
 * 
 * Detects hero pairs in gardening quests using blockchain quest data.
 * - Heroes in the same quest are paired together
 * - Uses QuestCoreV3.getActiveQuests() to fetch active quest data
 * - Queries historical QuestReward events to identify JEWEL vs CRYSTAL farmer role
 */

import { ethers } from 'ethers';
import { readFileSync } from 'fs';
import { decodeCurrentQuest, groupHeroesByGardenPool } from './garden-pairs.js';

const DFK_RPC = 'https://subnets.avax.network/defi-kingdoms/dfk-chain/rpc';

const QUESTCORE_V3_ADDRESS = '0x530fff22987E137e7C8D2aDcC4c15eb45b4FA752';

const CRYSTAL_TOKEN = '0x04b9dA42306B023f3572e106B11D82aAd9D32EBb';
const JEWEL_TOKEN = '0xCCb93dABD71c8Dad03Fc4CE5559dC3D89F67a260';

const GARDEN_POOLS = {
  0: 'wJEWEL-xJEWEL',
  1: 'CRYSTAL-AVAX',
  2: 'CRYSTAL-wJEWEL',
  3: 'CRYSTAL-USDC',
  4: 'ETH-USDC',
  5: 'wJEWEL-USDC',
  6: 'CRYSTAL-ETH',
  7: 'CRYSTAL-BTC.b',
  8: 'CRYSTAL-KLAY',
  9: 'wJEWEL-KLAY',
  10: 'wJEWEL-AVAX',
  11: 'wJEWEL-BTC.b',
  12: 'wJEWEL-ETH',
  13: 'BTC.b-USDC',
};

const GARDENING_QUEST_ADDRESS = '0x6FF019415Ee105aCF2Ac52483A33F5B43eaDB8d0'.toLowerCase();

// Training quest contract addresses (Crystalvale)
const TRAINING_QUEST_ADDRESSES = {
  '0xad3cfe4b4a0f685a0f93e5ebba3e5a896be8d466': { type: 'training', stat: 'Strength' },
  '0xe4154b6e5d240507f9699c730a496790a722e53e': { type: 'training', stat: 'Agility' },
  '0x0594d86b2923076a2316eaea4e1ca286daa142c1': { type: 'training', stat: 'Endurance' },
  '0x6c7b60d60ce5276ed70f42c8d3b929585a70cdcc': { type: 'training', stat: 'Wisdom' },
  '0xb9e7889259f6d8c66f3ffb2ef8abaaf7a1c07ecc': { type: 'training', stat: 'Dexterity' },
  '0xc3e0e22e2b028d63c96a1a39fe84e4e80d7085e1': { type: 'training', stat: 'Vitality' },
  '0xc3c12dac81d6f6ab77d28c64e2c04c1b14062a86': { type: 'training', stat: 'Intelligence' },
  '0xe7be1d2c2d2e8e47ac4e1e8c9916e6d8e5cba7c3': { type: 'training', stat: 'Luck' },
};

// Other expedition quest types
const PROFESSION_QUEST_ADDRESSES = {
  '0x569424c5ee13884a193773fdc5d1c5f79c443a51': { type: 'fishing', name: 'Fishing' },
  '0x407ab39b3675f29a719476af6eb3b9e5d93969e6': { type: 'foraging', name: 'Foraging' },
  '0xe259e8386d38467f0e7f2681d2c9e40625f44f63': { type: 'mining', name: 'Gold Mining' },
  '0x6f64fccbe6ec6c8a4c7e122eede7c7dd6b5e1c19': { type: 'mining', name: 'JEWEL Mining' },
};

/**
 * Get quest type info from quest address
 * @param {string} questAddress - Quest contract address
 * @returns {Object} Quest type info {type, name, stat, poolId}
 */
export function getQuestTypeFromAddress(questAddress) {
  const addr = (questAddress || '').toLowerCase();
  
  if (addr === GARDENING_QUEST_ADDRESS) {
    return { type: 'gardening', name: 'Gardening' };
  }
  
  const training = TRAINING_QUEST_ADDRESSES[addr];
  if (training) {
    return { type: 'training', name: `${training.stat} Training`, stat: training.stat };
  }
  
  const profession = PROFESSION_QUEST_ADDRESSES[addr];
  if (profession) {
    return profession;
  }
  
  return { type: 'unknown', name: 'Unknown Quest' };
}

const QUESTCORE_ABI = [
  'function getActiveQuests(address _address) view returns (tuple(uint256 id, address questAddress, uint256[] heroes, address player, uint256 startTime, uint256 startBlock, uint256 completeAtTime, uint8 attempts, uint8 status)[])',
  'function quests(uint256 questId) view returns (uint256 id, bytes32 questInstanceId, address questAddress, uint8 questType, uint256 level, uint256[] heroes, address player, uint256 startBlock, uint256 startAtTime, uint256 completeAtTime, uint8 attempts, uint8 status)',
  'function getAccountExpeditionsWithAssociatedQuests(address _playerAddress) view returns (tuple(uint256 expeditionId, tuple(uint40 lastClaimedAt, uint24 iterationsToProcess, uint24 remainingIterations, uint16 escrowedPetTreats, uint32 escrowedStaminaPotions, uint16 globalSettings, uint40 iterationTime, uint40 claimStartBlock, uint24 feePerStamina) expedition, tuple(uint256 id, uint256 questInstanceId, uint8 level, uint256[] heroes, address player, uint256 startBlock, uint256 startAtTime, uint256 completeAtTime, uint8 attempts, uint8 status, uint8 questType) quest, uint256 escrowedFee, uint8 foodType)[])',
];

const ERC20_TRANSFER_TOPIC = ethers.id('Transfer(address,address,uint256)');
const QUEST_REWARD_TOPIC = ethers.id('QuestReward(uint256,address,uint256,address,uint256)');

const provider = new ethers.JsonRpcProvider(DFK_RPC);
const questContract = new ethers.Contract(QUESTCORE_V3_ADDRESS, QUESTCORE_ABI, provider);

const QUEST_REWARD_ABI = [
  'event QuestReward(uint256 indexed questId, address indexed player, uint256 heroId, address rewardItem, uint256 itemQuantity)',
];

/**
 * Fetch all active quests for a wallet address
 * @param {string} walletAddress - Player wallet address
 * @returns {Promise<Array>} Array of active quest data
 */
export async function getActiveQuests(walletAddress) {
  try {
    console.log(`[HeroPairing] Fetching active quests for ${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`);
    
    const quests = await questContract.getActiveQuests(walletAddress);
    console.log(`[HeroPairing] Found ${quests.length} active quests`);
    
    return quests.map(q => ({
      questId: Number(q.id),
      questAddress: q.questAddress,
      heroIds: q.heroes.map(h => Number(h)),
      player: q.player,
      startTime: Number(q.startTime),
      completeAtTime: Number(q.completeAtTime),
      attempts: Number(q.attempts),
      status: Number(q.status),
    }));
  } catch (err) {
    console.error(`[HeroPairing] Error fetching active quests:`, err.message);
    return [];
  }
}

/**
 * Get quest details by quest ID
 * @param {number} questId - Quest ID
 * @returns {Promise<Object|null>} Quest data or null
 */
export async function getQuestById(questId) {
  try {
    const quest = await questContract.quests(questId);
    if (Number(quest.id) === 0) return null;
    
    return {
      questId: Number(quest.id),
      questInstanceId: quest.questInstanceId,
      questAddress: quest.questAddress,
      questType: Number(quest.questType),
      level: Number(quest.level),
      heroIds: quest.heroes.map(h => Number(h)),
      player: quest.player,
      startTime: Number(quest.startAtTime),
      completeAtTime: Number(quest.completeAtTime),
      attempts: Number(quest.attempts),
      status: Number(quest.status),
    };
  } catch (err) {
    console.error(`[HeroPairing] Error fetching quest ${questId}:`, err.message);
    return null;
  }
}

/**
 * Normalize hero ID by removing chain prefixes
 * @param {number|bigint} id - Hero ID (may include chain prefix)
 * @returns {number} Normalized hero ID
 */
function normalizeHeroId(id) {
  const num = Number(id);
  if (num >= 2_000_000_000_000) return num - 2_000_000_000_000;
  if (num >= 1_000_000_000_000) return num - 1_000_000_000_000;
  return num;
}

// Training quest stat mappings (questType values for training when level=10, attempts=5)
const TRAINING_STATS = {
  0: 'Vitality',
  1: 'Strength',
  2: 'Agility',
  3: 'Endurance',
  4: 'Wisdom',
  5: 'Dexterity',
  6: 'Intelligence',
  7: 'Luck',
};

/**
 * Determine the quest type from expedition data patterns
 * @param {Object} exp - Expedition object from contract
 * @returns {Object} Quest type info {type, name, poolId, stat}
 */
function classifyExpeditionQuest(exp) {
  const level = Number(exp.quest.level);
  const attempts = Number(exp.quest.attempts);
  const heroCount = exp.quest.heroes.length;
  const questType = Number(exp.quest.questType);
  
  // Gardening pattern: level=10, attempts=25, heroes=2, questType 1-13
  if (level === 10 && attempts === 25 && heroCount === 2 && questType >= 1 && questType <= 13) {
    return {
      type: 'gardening',
      name: `Gardening: ${GARDEN_POOLS[questType] || 'Pool ' + questType}`,
      poolId: questType,
    };
  }
  
  // Training pattern: level=10, attempts=5 (per iteration)
  if (level === 10 && attempts === 5) {
    const stat = TRAINING_STATS[questType] || `Stat ${questType}`;
    return {
      type: 'training',
      name: `${stat} Training`,
      stat,
    };
  }
  
  // Foraging/Fishing pattern: level=0, various attempts
  if (level === 0) {
    if (questType === 0) {
      // Could be foraging or fishing - check by hero count patterns
      return {
        type: 'profession',
        name: 'Foraging/Fishing',
      };
    }
  }
  
  // Level 1 quests are typically low-level training or exploration
  if (level === 1) {
    if (attempts === 5) {
      const stat = TRAINING_STATS[questType] || `Stat ${questType}`;
      return {
        type: 'training',
        name: `${stat} Training (Lvl 1)`,
        stat,
      };
    }
  }
  
  return {
    type: 'unknown',
    name: `Unknown Quest (level=${level}, attempts=${attempts}, type=${questType})`,
  };
}

/**
 * Format iteration time as HH:MM:SS
 */
function formatIterationTime(seconds) {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${hours}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * Fetch ALL expedition data for a wallet (gardening, training, foraging, etc.)
 * Used for hero debug to show what quest each hero is in.
 * 
 * @param {string} walletAddress - Player wallet address
 * @returns {Promise<Object>} All expedition data grouped by type
 */
export async function getAllExpeditions(walletAddress) {
  try {
    console.log(`[HeroPairing] Fetching all expeditions for ${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`);
    
    const expeditions = await questContract.getAccountExpeditionsWithAssociatedQuests(walletAddress);
    
    const all = [];
    const heroToQuest = new Map();
    const byType = { gardening: [], training: [], profession: [], unknown: [] };
    
    for (const exp of expeditions) {
      const questInfo = classifyExpeditionQuest(exp);
      const heroIds = exp.quest.heroes.map(h => normalizeHeroId(h));
      const iterationTime = Number(exp.expedition.iterationTime);
      
      const questData = {
        expeditionId: Number(exp.expeditionId),
        questId: Number(exp.quest.id),
        heroIds,
        attempts: Number(exp.quest.attempts),
        level: Number(exp.quest.level),
        questType: Number(exp.quest.questType),
        iterationTime,
        iterationTimeStr: formatIterationTime(iterationTime),
        remainingIterations: Number(exp.expedition.remainingIterations),
        ...questInfo,
      };
      
      all.push(questData);
      byType[questInfo.type]?.push(questData) || byType.unknown.push(questData);
      
      for (const heroId of heroIds) {
        heroToQuest.set(heroId, questData);
      }
    }
    
    console.log(`[HeroPairing] Found ${all.length} expeditions: ${byType.gardening.length} gardening, ${byType.training.length} training, ${byType.profession.length} profession`);
    
    return {
      all,
      byType,
      heroToQuest,
    };
  } catch (err) {
    console.error(`[HeroPairing] Error fetching all expeditions:`, err.message);
    return null;
  }
}

/**
 * Fetch GARDENING expedition data with hero pairs from the blockchain
 * This is the most accurate source for gardening pair information.
 * 
 * @param {string} walletAddress - Player wallet address
 * @returns {Promise<Object>} Gardening expedition data grouped by pool
 */
export async function getExpeditionPairs(walletAddress) {
  try {
    console.log(`[HeroPairing] Fetching expeditions for ${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`);
    
    const expeditions = await questContract.getAccountExpeditionsWithAssociatedQuests(walletAddress);
    
    const pairs = [];
    const poolPairs = {};
    const heroToPair = new Map();
    let skippedCount = 0;
    
    // Debug: Collect all expedition patterns to understand what's being skipped
    const patternCounts = new Map();
    const heroCountPatterns = new Map();
    
    console.log(`[HeroPairing] Total expeditions from contract: ${expeditions.length}`);
    
    for (const exp of expeditions) {
      const level = Number(exp.quest.level);
      const attempts = Number(exp.quest.attempts);
      const heroCount = exp.quest.heroes.length;
      const questType = Number(exp.quest.questType);
      const heroIds = exp.quest.heroes.map(h => normalizeHeroId(h));
      
      // Debug: Log pattern for each expedition
      const patternKey = `L${level}_A${attempts}_H${heroCount}_T${questType}`;
      patternCounts.set(patternKey, (patternCounts.get(patternKey) || 0) + 1);
      
      // Track heroCount patterns specifically
      if (!heroCountPatterns.has(heroCount)) {
        heroCountPatterns.set(heroCount, []);
      }
      if (heroCountPatterns.get(heroCount).length < 3) {
        heroCountPatterns.get(heroCount).push({ level, attempts, questType, heroIds: heroIds.slice(0, 2) });
      }
      
      // Gardening pattern: level=10, attempts=25, heroes=2, questType 1-13
      const isGardening = level === 10 && attempts === 25 && heroCount === 2 && questType >= 1 && questType <= 13;
      
      if (!isGardening) {
        skippedCount++;
        continue;
      }
      
      const poolId = questType;
      const iterationTime = Number(exp.expedition.iterationTime);
      const remainingIterations = Number(exp.expedition.remainingIterations);
      
      const pairData = {
        expeditionId: Number(exp.expeditionId),
        questId: Number(exp.quest.id),
        poolId,
        poolName: GARDEN_POOLS[poolId] || `Pool ${poolId}`,
        heroIds,
        attempts,
        iterationTime,
        iterationTimeStr: formatIterationTime(iterationTime),
        remainingIterations,
        isGardening: true,
        detectionMethod: 'expedition_api',
      };
      
      pairs.push(pairData);
      
      if (!poolPairs[poolId]) {
        poolPairs[poolId] = [];
      }
      poolPairs[poolId].push(pairData);
      
      for (const heroId of heroIds) {
        heroToPair.set(heroId, pairData);
      }
    }
    
    // Debug: Output pattern analysis
    console.log(`[HeroPairing] === EXPEDITION PATTERN ANALYSIS ===`);
    console.log(`[HeroPairing] Pattern counts (L=level, A=attempts, H=heroes, T=questType):`);
    const sortedPatterns = [...patternCounts.entries()].sort((a, b) => b[1] - a[1]);
    for (const [pattern, count] of sortedPatterns.slice(0, 15)) {
      console.log(`[HeroPairing]   ${pattern}: ${count} expeditions`);
    }
    console.log(`[HeroPairing] Hero count distribution:`);
    for (const [hCount, samples] of heroCountPatterns.entries()) {
      console.log(`[HeroPairing]   ${hCount} heroes: ${samples.length} sample(s) - first: L${samples[0]?.level}_A${samples[0]?.attempts}_T${samples[0]?.questType} heroIds=[${samples[0]?.heroIds?.join(',')}]`);
    }
    console.log(`[HeroPairing] === END PATTERN ANALYSIS ===`);
    
    console.log(`[HeroPairing] ✅ Found ${pairs.length} gardening pairs across ${Object.keys(poolPairs).length} pools (skipped ${skippedCount} non-gardening)`);
    
    return {
      pools: poolPairs,
      pairs,
      heroToPair,
      source: 'expedition_api',
    };
  } catch (err) {
    console.error(`[HeroPairing] Error fetching expeditions:`, err.message);
    return null;
  }
}

/**
 * Fallback: Detect gardening heroes from hero.currentQuest field
 * Used when getActiveQuests contract call fails
 * 
 * @param {Array} heroes - Array of hero objects with currentQuest field
 * @returns {Object} Detected pairs grouped by pool
 */
function detectPairsFromCurrentQuest(heroes) {
  const poolHeroes = new Map();
  
  console.log(`[HeroPairing] Using currentQuest fallback for ${heroes.length} heroes...`);
  
  for (const h of heroes) {
    const hero = h.hero || h;
    const questHex = hero.currentQuest;
    const decoded = decodeCurrentQuest(questHex);
    
    if (decoded.isGardening && decoded.poolId !== null) {
      if (!poolHeroes.has(decoded.poolId)) {
        poolHeroes.set(decoded.poolId, []);
      }
      poolHeroes.get(decoded.poolId).push(h);
    }
  }
  
  console.log(`[HeroPairing] Found gardening heroes in ${poolHeroes.size} pools via currentQuest`);
  
  const pairs = [];
  const poolPairs = {};
  const heroToPair = new Map();
  
  for (const [poolId, poolHeroList] of poolHeroes.entries()) {
    poolPairs[poolId] = [];
    
    for (let i = 0; i < poolHeroList.length; i += 2) {
      const h1 = poolHeroList[i];
      const h2 = poolHeroList[i + 1];
      
      const hero1 = h1.hero || h1;
      const hero2 = h2 ? (h2.hero || h2) : null;
      
      const heroId1 = Number(hero1.normalizedId || hero1.id);
      const heroId2 = hero2 ? Number(hero2.normalizedId || hero2.id) : null;
      
      const pairData = {
        questId: null,
        poolId,
        poolName: GARDEN_POOLS[poolId] || `Pool ${poolId}`,
        heroIds: hero2 ? [heroId1, heroId2] : [heroId1],
        heroes: hero2 ? [h1, h2] : [h1],
        startTime: null,
        completeAtTime: null,
        attempts: 25,
        isGardening: true,
        detectionMethod: 'currentQuest_fallback',
      };
      
      pairs.push(pairData);
      poolPairs[poolId].push(pairData);
      
      heroToPair.set(heroId1, pairData);
      if (heroId2) heroToPair.set(heroId2, pairData);
    }
    
    console.log(`[HeroPairing] Pool ${poolId} (${GARDEN_POOLS[poolId]}): ${poolHeroList.length} heroes -> ${poolPairs[poolId].length} pairs`);
  }
  
  console.log(`[HeroPairing] ✅ Fallback Detection Summary:`);
  console.log(`  - Total gardening heroes: ${[...poolHeroes.values()].reduce((a, b) => a + b.length, 0)}`);
  console.log(`  - Total pairs: ${pairs.length}`);
  console.log(`  - Pools with heroes: ${poolHeroes.size}`);
  
  return {
    pools: poolPairs,
    pairs,
    unpairedHeroes: [],
    heroToPair,
  };
}

/**
 * Detect hero pairs from active gardening quests
 * Heroes in the same quest struct are paired together.
 * 
 * Detection priority:
 * 1. Try getAccountExpeditionsWithAssociatedQuests() for accurate expedition data
 * 2. Fall back to getActiveQuests() for regular quests
 * 3. Fall back to hero.currentQuest decoding (least accurate)
 * 
 * @param {string} walletAddress - Player wallet address
 * @param {Array} heroes - Array of hero objects with currentQuest field
 * @returns {Promise<Object>} Detected pairs grouped by pool
 */
export async function detectHeroPairs(walletAddress, heroes = []) {
  // First try the expedition API (most accurate for long-running gardening)
  const expeditionResult = await getExpeditionPairs(walletAddress);
  
  if (expeditionResult && expeditionResult.pairs.length > 0) {
    console.log(`[HeroPairing] Using expedition API data (${expeditionResult.pairs.length} pairs)`);
    return {
      pools: expeditionResult.pools,
      pairs: expeditionResult.pairs,
      unpairedHeroes: [],
      heroToPair: expeditionResult.heroToPair,
      source: 'expedition_api',
    };
  }
  
  // Fall back to active quests (for non-expedition questing)
  const activeQuests = await getActiveQuests(walletAddress);
  
  if (activeQuests.length === 0) {
    console.log(`[HeroPairing] No active quests from contract, falling back to hero.currentQuest detection`);
    return detectPairsFromCurrentQuest(heroes);
  }
  
  const pairs = [];
  const heroToPair = new Map();
  const poolPairs = {};
  const skippedQuests = [];
  
  for (const quest of activeQuests) {
    if (quest.heroIds.length < 2) {
      console.log(`[HeroPairing] Quest ${quest.questId}: skipping (only ${quest.heroIds.length} hero)`);
      continue;
    }
    
    let poolId = null;
    let isGardening = false;
    
    try {
      const fullQuestData = await getQuestById(quest.questId);
      if (fullQuestData && fullQuestData.questType !== undefined) {
        const questType = fullQuestData.questType;
        if (questType >= 0 && questType <= 13 && GARDEN_POOLS[questType] !== undefined) {
          poolId = questType;
          isGardening = true;
          console.log(`[HeroPairing] Quest ${quest.questId}: poolId=${poolId} (${GARDEN_POOLS[poolId]}) from questType`);
        }
      }
    } catch (e) {
      console.warn(`[HeroPairing] Quest ${quest.questId}: failed to fetch full quest data: ${e.message}`);
    }
    
    if (!isGardening) {
      const addressMatch = quest.questAddress?.toLowerCase() === GARDENING_QUEST_ADDRESS;
      if (addressMatch) {
        isGardening = true;
        console.log(`[HeroPairing] Quest ${quest.questId}: identified as gardening via questAddress`);
      }
    }
    
    if (!isGardening) {
      const heroesInQuest = heroes.filter(h => {
        const heroId = h.normalizedId || h.id;
        return quest.heroIds.includes(Number(heroId));
      });
      
      for (const hero of heroesInQuest) {
        const decoded = decodeCurrentQuest(hero.currentQuest);
        if (decoded.isGardening && decoded.poolId !== null) {
          poolId = decoded.poolId;
          isGardening = true;
          console.log(`[HeroPairing] Quest ${quest.questId}: poolId=${poolId} from hero.currentQuest`);
          break;
        }
      }
    }
    
    if (!isGardening) {
      console.log(`[HeroPairing] Quest ${quest.questId}: skipping (not a gardening quest)`);
      continue;
    }
    
    if (poolId === null) {
      const heroesInQuest = heroes.filter(h => {
        const heroId = h.normalizedId || h.id;
        return quest.heroIds.includes(Number(heroId));
      });
      
      for (const hero of heroesInQuest) {
        const decoded = decodeCurrentQuest(hero.currentQuest);
        if (decoded.poolId !== null) {
          poolId = decoded.poolId;
          console.log(`[HeroPairing] Quest ${quest.questId}: poolId=${poolId} from hero.currentQuest (fallback)`);
          break;
        }
      }
    }
    
    const heroesInQuest = heroes.filter(h => {
      const heroId = h.normalizedId || h.id;
      return quest.heroIds.includes(Number(heroId));
    });
    
    const pairData = {
      questId: quest.questId,
      poolId,
      poolName: poolId !== null ? (GARDEN_POOLS[poolId] || `Pool ${poolId}`) : 'Unknown Pool',
      heroIds: quest.heroIds,
      heroes: heroesInQuest,
      startTime: quest.startTime,
      completeAtTime: quest.completeAtTime,
      attempts: quest.attempts,
      isGardening: true,
    };
    
    pairs.push(pairData);
    
    for (const heroId of quest.heroIds) {
      heroToPair.set(heroId, pairData);
    }
    
    if (poolId !== null) {
      if (!poolPairs[poolId]) {
        poolPairs[poolId] = [];
      }
      poolPairs[poolId].push(pairData);
    }
  }
  
  const allQuestHeroIds = new Set(pairs.flatMap(p => p.heroIds));
  
  const gardeningHeroes = heroes.filter(h => {
    const decoded = decodeCurrentQuest(h.currentQuest);
    if (decoded.isGardening) return true;
    return allQuestHeroIds.has(Number(h.normalizedId || h.id));
  });
  
  const unpairedHeroes = gardeningHeroes.filter(h => {
    const heroId = Number(h.normalizedId || h.id);
    return !allQuestHeroIds.has(heroId);
  });
  
  console.log(`[HeroPairing] ✅ Detection Summary:`);
  console.log(`  - Total active quests: ${activeQuests.length}`);
  console.log(`  - Gardening pairs detected: ${pairs.length}`);
  console.log(`  - Pools with pairs: ${Object.keys(poolPairs).length}`);
  if (unpairedHeroes.length > 0) {
    console.log(`  - Unpaired gardening heroes: ${unpairedHeroes.length}`);
  }
  
  return {
    pools: poolPairs,
    pairs,
    unpairedHeroes,
    heroToPair,
  };
}

/**
 * Query historical QuestReward events to determine which token each hero received.
 * This identifies whether a hero farms JEWEL or CRYSTAL in their gardening quests.
 * 
 * QuestReward event signature:
 *   QuestReward(uint256 indexed questId, address indexed player, uint256 heroId, address rewardItem, uint256 itemQuantity)
 * 
 * @param {string} walletAddress - Player wallet address
 * @param {Array<number>} heroIds - Hero IDs to check
 * @param {number} lookbackBlocks - How many blocks to search (default 100000 ~3 days)
 * @returns {Promise<Map<number, string>>} Map of heroId -> 'JEWEL' | 'CRYSTAL' (only for known roles)
 */
export async function getHeroRewardHistory(walletAddress, heroIds, lookbackBlocks = 100000) {
  const heroRewardRoles = new Map();
  
  try {
    const latestBlock = await provider.getBlockNumber();
    const fromBlock = Math.max(0, latestBlock - lookbackBlocks);
    
    console.log(`[HeroPairing] Querying QuestReward events from block ${fromBlock} to ${latestBlock}...`);
    
    const playerTopic = ethers.zeroPadValue(walletAddress.toLowerCase(), 32);
    
    const questRewardLogs = await provider.getLogs({
      address: QUESTCORE_V3_ADDRESS,
      topics: [
        QUEST_REWARD_TOPIC,
        null,
        playerTopic,
      ],
      fromBlock,
      toBlock: 'latest',
    });
    
    console.log(`[HeroPairing] Found ${questRewardLogs.length} QuestReward events for player`);
    
    if (questRewardLogs.length === 0) {
      console.log(`[HeroPairing] No reward history found, using position heuristic`);
      return heroRewardRoles;
    }
    
    const iface = new ethers.Interface(QUEST_REWARD_ABI);
    
    const heroRewards = new Map();
    
    for (const log of questRewardLogs) {
      try {
        const decoded = iface.decodeEventLog('QuestReward', log.data, log.topics);
        const heroId = Number(decoded.heroId);
        const rewardItem = decoded.rewardItem.toLowerCase();
        
        if (!heroIds.includes(heroId)) continue;
        
        if (rewardItem === CRYSTAL_TOKEN.toLowerCase()) {
          if (!heroRewards.has(heroId)) heroRewards.set(heroId, []);
          heroRewards.get(heroId).push('CRYSTAL');
        } else if (rewardItem === JEWEL_TOKEN.toLowerCase()) {
          if (!heroRewards.has(heroId)) heroRewards.set(heroId, []);
          heroRewards.get(heroId).push('JEWEL');
        }
      } catch (e) {
        continue;
      }
    }
    
    for (const [heroId, rewards] of heroRewards.entries()) {
      const crystalCount = rewards.filter(r => r === 'CRYSTAL').length;
      const jewelCount = rewards.filter(r => r === 'JEWEL').length;
      
      if (crystalCount > jewelCount) {
        heroRewardRoles.set(heroId, 'CRYSTAL');
        console.log(`[HeroPairing] Hero #${heroId}: CRYSTAL farmer (${crystalCount} CRYSTAL, ${jewelCount} JEWEL rewards)`);
      } else if (jewelCount > crystalCount) {
        heroRewardRoles.set(heroId, 'JEWEL');
        console.log(`[HeroPairing] Hero #${heroId}: JEWEL farmer (${jewelCount} JEWEL, ${crystalCount} CRYSTAL rewards)`);
      }
    }
    
    return heroRewardRoles;
  } catch (err) {
    console.error(`[HeroPairing] Error querying reward history:`, err.message);
    return heroRewardRoles;
  }
}

/**
 * Assign JEWEL/CRYSTAL roles to paired heroes based on reward history or position
 * 
 * Role assignment priority:
 * 1. Both heroes have distinct roles from reward history (most reliable)
 * 2. Only one hero has known role - assign opposite to the other
 * 3. Both heroes have same role (conflict) or no data - fall back to position heuristic
 * 
 * Position heuristic (when no/conflicting data):
 * - First hero in the pair = JEWEL farmer
 * - Second hero in the pair = CRYSTAL farmer
 * 
 * @param {Object} pairData - Pair data from detectHeroPairs
 * @param {Map<number, string>} rewardHistory - Optional reward history map
 * @returns {Object} Pair with roles assigned
 */
export function assignRolesToPair(pairData, rewardHistory = null) {
  const { heroIds, heroes } = pairData;
  
  if (heroIds.length < 2) {
    return {
      ...pairData,
      jewelHeroId: heroIds[0] || null,
      crystalHeroId: null,
      rolesSource: 'single_hero',
    };
  }
  
  const hero1Id = heroIds[0];
  const hero2Id = heroIds[1];
  
  if (rewardHistory) {
    const hero1Role = rewardHistory.get(hero1Id);
    const hero2Role = rewardHistory.get(hero2Id);
    
    if (hero1Role && hero2Role && hero1Role !== hero2Role) {
      const jewelHeroId = hero1Role === 'JEWEL' ? hero1Id : hero2Id;
      const crystalHeroId = hero1Role === 'CRYSTAL' ? hero1Id : hero2Id;
      return {
        ...pairData,
        jewelHeroId,
        crystalHeroId,
        rolesSource: 'reward_history_both',
      };
    }
    
    if (hero1Role && !hero2Role) {
      const jewelHeroId = hero1Role === 'JEWEL' ? hero1Id : hero2Id;
      const crystalHeroId = hero1Role === 'CRYSTAL' ? hero1Id : hero2Id;
      return {
        ...pairData,
        jewelHeroId,
        crystalHeroId,
        rolesSource: 'reward_history_hero1',
      };
    }
    
    if (!hero1Role && hero2Role) {
      const jewelHeroId = hero2Role === 'JEWEL' ? hero2Id : hero1Id;
      const crystalHeroId = hero2Role === 'CRYSTAL' ? hero2Id : hero1Id;
      return {
        ...pairData,
        jewelHeroId,
        crystalHeroId,
        rolesSource: 'reward_history_hero2',
      };
    }
    
    if (hero1Role && hero2Role && hero1Role === hero2Role) {
      console.warn(`[HeroPairing] Role conflict for pair ${hero1Id}/${hero2Id}: both show ${hero1Role}, using heuristic`);
    }
  }
  
  return {
    ...pairData,
    jewelHeroId: hero1Id,
    crystalHeroId: hero2Id,
    rolesSource: 'position_heuristic',
  };
}

/**
 * Full hero pairing detection with role assignment
 * 
 * @param {string} walletAddress - Player wallet address
 * @param {Array} heroes - Array of hero objects
 * @param {boolean} queryRewardHistory - Whether to query historical rewards (slower but more accurate)
 * @returns {Promise<Object>} Complete pairing data with roles
 */
export async function detectPairsWithRoles(walletAddress, heroes, queryRewardHistory = true) {
  const pairingResult = await detectHeroPairs(walletAddress, heroes);
  
  let rewardHistory = null;
  if (queryRewardHistory && pairingResult.pairs.length > 0) {
    const allHeroIds = pairingResult.pairs.flatMap(p => p.heroIds);
    console.log(`[HeroPairing] Querying reward history for ${allHeroIds.length} heroes...`);
    rewardHistory = await getHeroRewardHistory(walletAddress, allHeroIds);
  }
  
  const pairsWithRoles = pairingResult.pairs.map(pair => {
    return assignRolesToPair(pair, rewardHistory);
  });
  
  const poolsWithRoles = {};
  for (const [poolId, poolPairs] of Object.entries(pairingResult.pools)) {
    poolsWithRoles[poolId] = poolPairs.map(pair => assignRolesToPair(pair, rewardHistory));
  }
  
  const verifiedCount = pairsWithRoles.filter(p => 
    p.rolesSource === 'reward_history_both' || 
    p.rolesSource === 'reward_history_hero1' || 
    p.rolesSource === 'reward_history_hero2'
  ).length;
  const heuristicCount = pairsWithRoles.filter(p => p.rolesSource === 'position_heuristic').length;
  
  return {
    pools: poolsWithRoles,
    pairs: pairsWithRoles,
    unpairedHeroes: pairingResult.unpairedHeroes,
    rewardHistory,
    summary: {
      totalPairs: pairsWithRoles.length,
      totalPoolsWithPairs: Object.keys(poolsWithRoles).length,
      unpairedCount: pairingResult.unpairedHeroes.length,
      verifiedRoles: verifiedCount,
      heuristicRoles: heuristicCount,
    },
  };
}

/**
 * Format hero pairs for Discord output
 * @param {Object} pairingResult - Result from detectPairsWithRoles
 * @returns {string} Formatted Discord message
 */
export function formatPairsForDiscord(pairingResult) {
  const lines = ['**🌱 Detected Garden Pairs:**\n'];
  
  if (pairingResult.pairs.length === 0) {
    lines.push('No active gardening pairs detected.');
    return lines.join('\n');
  }
  
  const poolGroups = {};
  for (const pair of pairingResult.pairs) {
    const poolId = pair.poolId;
    if (!poolGroups[poolId]) {
      poolGroups[poolId] = [];
    }
    poolGroups[poolId].push(pair);
  }
  
  for (const [poolId, pairs] of Object.entries(poolGroups)) {
    const poolName = GARDEN_POOLS[poolId] || `Pool ${poolId}`;
    lines.push(`\n**Pool ${poolId}: ${poolName}**`);
    
    for (let i = 0; i < pairs.length; i++) {
      const pair = pairs[i];
      const isVerified = pair.rolesSource?.startsWith('reward_history');
      const roleSource = isVerified ? '(verified)' : '(heuristic)';
      
      lines.push(`  Pair ${i + 1} ${roleSource}:`);
      lines.push(`    JEWEL: Hero #${pair.jewelHeroId}`);
      lines.push(`    CRYSTAL: Hero #${pair.crystalHeroId}`);
    }
  }
  
  if (pairingResult.unpairedHeroes.length > 0) {
    lines.push(`\n**⚠️ Unpaired Gardening Heroes:**`);
    for (const hero of pairingResult.unpairedHeroes) {
      const heroId = hero.normalizedId || hero.id;
      lines.push(`  - Hero #${heroId}`);
    }
  }
  
  const summary = pairingResult.summary;
  lines.push(`\n**Summary:** ${summary.totalPairs} pairs across ${summary.totalPoolsWithPairs} pools`);
  if (summary.verifiedRoles > 0 || summary.heuristicRoles > 0) {
    lines.push(`  Roles: ${summary.verifiedRoles} verified from reward history, ${summary.heuristicRoles} assigned by position`);
  }
  
  return lines.join('\n');
}

export default {
  getActiveQuests,
  getQuestById,
  detectHeroPairs,
  detectPairsWithRoles,
  getHeroRewardHistory,
  assignRolesToPair,
  formatPairsForDiscord,
  GARDEN_POOLS,
};
