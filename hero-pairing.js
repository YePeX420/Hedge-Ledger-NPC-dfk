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

const QUESTCORE_ABI = [
  'function getActiveQuests(address _address) view returns (tuple(uint256 id, address questAddress, uint256[] heroes, address player, uint256 startTime, uint256 startBlock, uint256 completeAtTime, uint8 attempts, uint8 status)[])',
  'function quests(uint256 questId) view returns (tuple(uint256 id, bytes20 questInstanceId, address questAddress, uint8 questType, uint256 level, uint256[] heroes, address player, uint256 startAtTime, uint256 startBlock, uint256 completeAtTime, uint8 attempts, uint8 status))',
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
 * Pool ID detection priority:
 * 1. Query full quest data via getQuestById() to get questType (= pool ID for gardening)
 * 2. Check if questAddress matches gardening quest address
 * 3. Fall back to hero.currentQuest decoding
 * 
 * @param {string} walletAddress - Player wallet address
 * @param {Array} heroes - Array of hero objects with currentQuest field
 * @returns {Promise<Object>} Detected pairs grouped by pool
 */
export async function detectHeroPairs(walletAddress, heroes = []) {
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
