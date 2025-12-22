/**
 * Gardening Yield Calculator Service
 * 
 * Uses the official DFK gardening formula:
 * earnRate (per stamina) = rewardPool * poolAllocation * LPOwned * heroFactor / ((300 - 50*geneBonus) * rewardModBase)
 * 
 * Where:
 * - heroFactor = 0.1 + (WIS + VIT) / 1222.22 + GrdSkl / 244.44
 * - geneBonus = 1 if hero has gardening gene, 0 otherwise
 * - rewardModBase = 72 if GrdSkl >= 10, 144 otherwise
 * - Minimum reward = 0.0002 per stamina
 */

import { ethers } from 'ethers';
import { GraphQLClient, gql } from 'graphql-request';

const DFK_CHAIN_RPC = 'https://subnets.avax.network/defi-kingdoms/dfk-chain/rpc';
const DFK_GRAPHQL_ENDPOINT = 'https://api.defikingdoms.com/graphql';
const graphqlClient = new GraphQLClient(DFK_GRAPHQL_ENDPOINT);
const QUEST_REWARD_FUND = '0x1137643FE14b032966a59Acd68EBf3c1271Df316';
const CRYSTAL_TOKEN = '0x04b9dA42306B023f3572e106B11D82aAd9D32EBb';
const JEWEL_TOKEN = '0xCCb93dABD71c8Dad03Fc4CE5559dC3D89F67a260';
const MASTER_GARDENER_V2 = '0xB04e8D6aED037904B77A9F0b08002592925833b7';

const ERC20_ABI = ['function balanceOf(address owner) view returns (uint256)'];
const MASTER_GARDENER_ABI = [
  'function poolInfo(uint256 pid) view returns (address lpToken, uint256 allocPoint, uint256 lastRewardTime, uint256 accRewardPerShare)',
  'function totalAllocPoint() view returns (uint256)',
  'function userInfo(uint256 pid, address user) view returns (uint256 amount, int256 rewardDebt, uint256 lastDepositTimestamp)',
];

const POOL_NAMES = {
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

const MIN_REWARD_PER_STAMINA = 0.0002;

let cachedRewardPools = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60 * 1000;

/**
 * Calculate hero gardening factor
 * Formula: 0.1 + (WIS+VIT)/1222.22 + GrdSkl/244.44
 */
export function calculateHeroFactor(wisdom, vitality, gardeningSkill) {
  const grdSkl = gardeningSkill / 10;
  return 0.1 + (wisdom + vitality) / 1222.22 + grdSkl / 244.44;
}

/**
 * Get Quest Reward Fund balances
 */
export async function getQuestRewardFundBalances(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cachedRewardPools && (now - cacheTimestamp) < CACHE_TTL_MS) {
    return cachedRewardPools;
  }
  
  try {
    const provider = new ethers.JsonRpcProvider(DFK_CHAIN_RPC);
    const crystalContract = new ethers.Contract(CRYSTAL_TOKEN, ERC20_ABI, provider);
    const jewelContract = new ethers.Contract(JEWEL_TOKEN, ERC20_ABI, provider);
    
    const [crystalBal, jewelBal] = await Promise.all([
      crystalContract.balanceOf(QUEST_REWARD_FUND),
      jewelContract.balanceOf(QUEST_REWARD_FUND),
    ]);
    
    cachedRewardPools = {
      crystalPool: parseFloat(ethers.formatEther(crystalBal)),
      jewelPool: parseFloat(ethers.formatEther(jewelBal)),
    };
    cacheTimestamp = now;
    
    return cachedRewardPools;
  } catch (err) {
    console.error('[GardeningCalc] Error fetching reward fund:', err.message);
    if (cachedRewardPools) return cachedRewardPools;
    return { crystalPool: 0, jewelPool: 0 };
  }
}

/**
 * Get pool allocation percentage
 */
export async function getPoolAllocation(poolId) {
  try {
    const provider = new ethers.JsonRpcProvider(DFK_CHAIN_RPC);
    const gardener = new ethers.Contract(MASTER_GARDENER_V2, MASTER_GARDENER_ABI, provider);
    
    const [poolInfo, totalAllocPoint] = await Promise.all([
      gardener.poolInfo(poolId),
      gardener.totalAllocPoint(),
    ]);
    
    const allocPoint = Number(poolInfo.allocPoint);
    const totalAlloc = Number(totalAllocPoint);
    
    return totalAlloc > 0 ? allocPoint / totalAlloc : 0;
  } catch (err) {
    console.error('[GardeningCalc] Error fetching pool allocation:', err.message);
    return 0;
  }
}

/**
 * Get user's LP share in a pool
 */
export async function getUserLpShare(poolId, userAddress) {
  try {
    const provider = new ethers.JsonRpcProvider(DFK_CHAIN_RPC);
    const gardener = new ethers.Contract(MASTER_GARDENER_V2, MASTER_GARDENER_ABI, provider);
    const poolInfo = await gardener.poolInfo(poolId);
    
    const lpTokenAddress = poolInfo.lpToken || poolInfo[0];
    const lpContract = new ethers.Contract(lpTokenAddress, ERC20_ABI, provider);
    
    const [userInfo, poolTotal] = await Promise.all([
      gardener.userInfo(poolId, userAddress),
      lpContract.balanceOf(MASTER_GARDENER_V2),
    ]);
    
    const userAmount = parseFloat(ethers.formatEther(userInfo.amount || userInfo[0]));
    const totalAmount = parseFloat(ethers.formatEther(poolTotal));
    
    return {
      userLp: userAmount,
      poolTotalLp: totalAmount,
      lpShare: totalAmount > 0 ? userAmount / totalAmount : 0,
    };
  } catch (err) {
    console.error('[GardeningCalc] Error fetching LP share:', err.message);
    return { userLp: 0, poolTotalLp: 0, lpShare: 0 };
  }
}

/**
 * Calculate yield per stamina using the official formula
 * 
 * earnRate = rewardPool * poolAllocation * LPOwned * heroFactor / ((300 - 50*geneBonus) * rewardModBase)
 * 
 * @param {Object} params
 * @param {number} params.rewardPool - Quest Reward Fund balance (CRYSTAL or JEWEL)
 * @param {number} params.poolAllocation - Pool's share of emissions (0-1)
 * @param {number} params.lpOwned - User's share of pool LP (0-1)
 * @param {number} params.heroFactor - Hero factor from calculateHeroFactor()
 * @param {boolean} params.hasGardeningGene - Whether hero has gardening profession gene
 * @param {number} params.gardeningSkill - Hero's gardening skill (0-100 scale)
 * @param {number} params.petMultiplier - Pet bonus multiplier (default 1.0)
 * @returns {number} Tokens earned per stamina spent
 */
export function calculateYieldPerStamina({
  rewardPool,
  poolAllocation,
  lpOwned,
  heroFactor,
  hasGardeningGene = false,
  gardeningSkill = 0,
  petMultiplier = 1.0,
}) {
  const geneBonus = hasGardeningGene ? 1 : 0;
  const grdSkillForFormula = gardeningSkill / 10;
  const rewardModBase = grdSkillForFormula >= 10 ? 72 : 144;
  const divisor = (300 - (50 * geneBonus)) * rewardModBase;
  
  let earnRatePerStam = (rewardPool * poolAllocation * lpOwned * heroFactor) / divisor;
  earnRatePerStam *= petMultiplier;
  
  return Math.max(earnRatePerStam, MIN_REWARD_PER_STAMINA);
}

/**
 * Calculate total rewards for a gardening run
 * 
 * @param {Object} params - All calculation parameters
 * @param {number} params.poolId - Garden pool ID (0-13)
 * @param {string} params.playerAddress - Player wallet address
 * @param {number} params.wisdom - Hero wisdom stat
 * @param {number} params.vitality - Hero vitality stat  
 * @param {number} params.gardeningSkill - Hero gardening skill (0-100)
 * @param {boolean} params.hasGardeningGene - Has gardening profession gene
 * @param {number} params.stamina - Stamina to spend
 * @param {number} params.petBonusPct - Pet Power Surge bonus percentage (0-100)
 * @param {number} params.skilledGreenskeeperBonus - Pet Skilled Greenskeeper bonus (0-100)
 * @param {boolean} params.petFed - Whether pet is fed
 * @returns {Promise<Object>} Calculated rewards
 */
export async function calculateGardeningRewards(params) {
  const {
    poolId,
    playerAddress,
    wisdom,
    vitality,
    gardeningSkill,
    hasGardeningGene = false,
    stamina,
    petBonusPct = 0,
    skilledGreenskeeperBonus = 0,
    petFed = true,
    lpShareOverride = null,
  } = params;
  
  const [rewardFund, poolAllocation, lpInfo] = await Promise.all([
    getQuestRewardFundBalances(),
    getPoolAllocation(poolId),
    lpShareOverride !== null 
      ? Promise.resolve({ lpShare: lpShareOverride, userLp: 0, poolTotalLp: 0 })
      : getUserLpShare(poolId, playerAddress),
  ]);
  
  const effectiveGrdSkill = skilledGreenskeeperBonus > 0 && petFed
    ? gardeningSkill + skilledGreenskeeperBonus
    : gardeningSkill;
  
  const heroFactor = calculateHeroFactor(wisdom, vitality, effectiveGrdSkill);
  
  const petMultiplier = petFed && petBonusPct > 0 
    ? 1 + petBonusPct / 100 
    : 1.0;
  
  const crystalPerStamina = calculateYieldPerStamina({
    rewardPool: rewardFund.crystalPool,
    poolAllocation,
    lpOwned: lpInfo.lpShare,
    heroFactor,
    hasGardeningGene,
    gardeningSkill: effectiveGrdSkill,
    petMultiplier,
  });
  
  const jewelPerStamina = calculateYieldPerStamina({
    rewardPool: rewardFund.jewelPool,
    poolAllocation,
    lpOwned: lpInfo.lpShare,
    heroFactor,
    hasGardeningGene,
    gardeningSkill: effectiveGrdSkill,
    petMultiplier,
  });
  
  return {
    poolId,
    poolName: POOL_NAMES[poolId] || `Pool ${poolId}`,
    inputs: {
      wisdom,
      vitality,
      gardeningSkill,
      effectiveGrdSkill,
      hasGardeningGene,
      stamina,
      petBonusPct,
      skilledGreenskeeperBonus,
      petFed,
    },
    formula: {
      heroFactor,
      petMultiplier,
      poolAllocation,
      lpShare: lpInfo.lpShare,
      userLp: lpInfo.userLp,
      poolTotalLp: lpInfo.poolTotalLp,
      rewardModBase: effectiveGrdSkill >= 100 ? 72 : 144,
      geneBonus: hasGardeningGene ? 1 : 0,
    },
    rewardFund: {
      crystalPool: rewardFund.crystalPool,
      jewelPool: rewardFund.jewelPool,
    },
    perStamina: {
      crystal: crystalPerStamina,
      jewel: jewelPerStamina,
    },
    totalRewards: {
      crystal: crystalPerStamina * stamina,
      jewel: jewelPerStamina * stamina,
    },
  };
}

/**
 * Calculate rewards for two heroes (dual-hero gardening quest)
 * One hero earns JEWEL, the other earns CRYSTAL
 * 
 * @param {Object} params - Dual hero parameters
 * @param {number} params.poolId - Garden pool ID
 * @param {string} params.playerAddress - Player wallet address  
 * @param {number} params.lpShareOverride - Manual LP share override (0-1)
 * @param {Object} params.jewelHero - JEWEL hero parameters
 * @param {Object} params.crystalHero - CRYSTAL hero parameters
 */
export async function calculateDualHeroRewards(params) {
  const {
    poolId,
    playerAddress,
    lpShareOverride = null,
    jewelHero,
    crystalHero,
  } = params;

  const [rewardFund, poolAllocation, lpInfo] = await Promise.all([
    getQuestRewardFundBalances(),
    getPoolAllocation(poolId),
    lpShareOverride !== null
      ? Promise.resolve({ lpShare: lpShareOverride, userLp: 0, poolTotalLp: 0 })
      : getUserLpShare(poolId, playerAddress),
  ]);

  // Calculate JEWEL hero rewards
  const jewelEffectiveGrdSkill = jewelHero.skilledGreenskeeperBonus > 0 && jewelHero.petFed
    ? jewelHero.gardeningSkill + jewelHero.skilledGreenskeeperBonus
    : jewelHero.gardeningSkill;
  
  const jewelHeroFactor = calculateHeroFactor(jewelHero.wisdom, jewelHero.vitality, jewelEffectiveGrdSkill);
  
  const jewelPetMultiplier = jewelHero.petFed && jewelHero.petBonusPct > 0
    ? 1 + jewelHero.petBonusPct / 100
    : 1.0;

  const jewelPerStamina = calculateYieldPerStamina({
    rewardPool: rewardFund.jewelPool,
    poolAllocation,
    lpOwned: lpInfo.lpShare,
    heroFactor: jewelHeroFactor,
    hasGardeningGene: jewelHero.hasGardeningGene,
    gardeningSkill: jewelEffectiveGrdSkill,
    petMultiplier: jewelPetMultiplier,
  });

  // Calculate CRYSTAL hero rewards
  const crystalEffectiveGrdSkill = crystalHero.skilledGreenskeeperBonus > 0 && crystalHero.petFed
    ? crystalHero.gardeningSkill + crystalHero.skilledGreenskeeperBonus
    : crystalHero.gardeningSkill;

  const crystalHeroFactor = calculateHeroFactor(crystalHero.wisdom, crystalHero.vitality, crystalEffectiveGrdSkill);

  const crystalPetMultiplier = crystalHero.petFed && crystalHero.petBonusPct > 0
    ? 1 + crystalHero.petBonusPct / 100
    : 1.0;

  const crystalPerStamina = calculateYieldPerStamina({
    rewardPool: rewardFund.crystalPool,
    poolAllocation,
    lpOwned: lpInfo.lpShare,
    heroFactor: crystalHeroFactor,
    hasGardeningGene: crystalHero.hasGardeningGene,
    gardeningSkill: crystalEffectiveGrdSkill,
    petMultiplier: crystalPetMultiplier,
  });

  return {
    poolId,
    poolName: POOL_NAMES[poolId] || `Pool ${poolId}`,
    jewelHero: {
      heroId: jewelHero.heroId || '',
      heroFactor: jewelHeroFactor,
      petMultiplier: jewelPetMultiplier,
      reward: jewelPerStamina * jewelHero.stamina,
      perStamina: jewelPerStamina,
    },
    crystalHero: {
      heroId: crystalHero.heroId || '',
      heroFactor: crystalHeroFactor,
      petMultiplier: crystalPetMultiplier,
      reward: crystalPerStamina * crystalHero.stamina,
      perStamina: crystalPerStamina,
    },
    shared: {
      poolAllocation,
      lpShare: lpInfo.lpShare,
      userLp: lpInfo.userLp,
      poolTotalLp: lpInfo.poolTotalLp,
    },
    rewardFund: {
      crystalPool: rewardFund.crystalPool,
      jewelPool: rewardFund.jewelPool,
    },
    totalRewards: {
      jewel: jewelPerStamina * jewelHero.stamina,
      crystal: crystalPerStamina * crystalHero.stamina,
    },
  };
}

export { POOL_NAMES, MIN_REWARD_PER_STAMINA };

// ==========================================
// Hero and Pet Lookup Functions
// ==========================================

const PETCORE_ADDRESS = '0x1990F87d6BC9D9385917E3EDa0A7674411C3Cd7F';
const PET_CORE_ABI = [
  'function getPetV2(uint256 petId) view returns (tuple(uint256 id, uint8 originId, string name, uint8 season, uint8 eggType, uint8 rarity, uint8 element, uint8 bonusCount, uint8 profBonus, uint8 profBonusScalar, uint8 craftBonus, uint8 craftBonusScalar, uint8 combatBonus, uint8 combatBonusScalar, uint16 appearance, uint8 background, uint8 shiny, uint64 hungryAt, uint64 equippableAt, uint256 equippedTo, address fedBy, uint8 foodType))',
];

const POWER_SURGE_IDS = [90, 170];
const SKILLED_GREENSKEEPER_IDS = [7, 86, 166];

/**
 * Fetch hero stats by ID from DFK GraphQL API
 */
export async function getHeroStatsById(heroId) {
  try {
    const query = gql`
      query GetHero($heroId: ID!) {
        hero(id: $heroId) {
          id
          normalizedId
          mainClassStr
          subClassStr
          professionStr
          level
          wisdom
          vitality
          gardening
          statGenes
        }
      }
    `;
    
    const data = await graphqlClient.request(query, { heroId: String(heroId) });
    if (!data?.hero) {
      return { ok: false, error: 'Hero not found' };
    }
    
    const hero = data.hero;
    const hasGardeningGene = hero.professionStr?.toLowerCase() === 'gardening';
    
    return {
      ok: true,
      heroId: hero.normalizedId || hero.id,
      class: hero.mainClassStr,
      subClass: hero.subClassStr,
      profession: hero.professionStr,
      level: hero.level,
      wisdom: hero.wisdom || 0,
      vitality: hero.vitality || 0,
      gardeningSkill: hero.gardening || 0,
      hasGardeningGene,
      stamina: 25 + Math.floor((hero.level || 1) / 5),
    };
  } catch (err) {
    console.error('[GardeningCalc] Error fetching hero:', err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * Fetch pet data by ID and extract gardening bonuses
 */
export async function getPetBonusesById(petId) {
  try {
    const provider = new ethers.JsonRpcProvider(DFK_CHAIN_RPC);
    const petContract = new ethers.Contract(PETCORE_ADDRESS, PET_CORE_ABI, provider);
    
    const pet = await petContract.getPetV2(petId);
    
    const eggType = Number(pet.eggType);
    const profBonus = Number(pet.profBonus);
    const profBonusScalar = Number(pet.profBonusScalar);
    const hungryAt = Number(pet.hungryAt);
    
    const result = {
      ok: true,
      petId: pet.id.toString(),
      name: pet.name,
      eggType,
      rarity: Number(pet.rarity),
      isGardeningPet: eggType === 2,
      profBonus,
      profBonusScalar,
      hungryAt,
      isFed: Date.now() / 1000 < hungryAt,
      powerSurgeBonus: 0,
      skilledGreenskeeperBonus: 0,
      bonusType: null,
    };
    
    if (eggType === 2) {
      if (POWER_SURGE_IDS.includes(profBonus)) {
        result.powerSurgeBonus = profBonusScalar;
        result.bonusType = 'Power Surge';
      } else if (SKILLED_GREENSKEEPER_IDS.includes(profBonus)) {
        result.skilledGreenskeeperBonus = profBonusScalar;
        result.bonusType = 'Skilled Greenskeeper';
      }
    }
    
    return result;
  } catch (err) {
    console.error('[GardeningCalc] Error fetching pet:', err.message);
    return { ok: false, error: err.message };
  }
}

/**
 * Get all user LP positions across pools
 */
export async function getUserPoolPositions(userAddress) {
  try {
    const provider = new ethers.JsonRpcProvider(DFK_CHAIN_RPC);
    const gardener = new ethers.Contract(MASTER_GARDENER_V2, MASTER_GARDENER_ABI, provider);
    
    const positions = [];
    
    for (let poolId = 0; poolId <= 13; poolId++) {
      try {
        const [poolInfo, userInfo, totalAlloc] = await Promise.all([
          gardener.poolInfo(poolId),
          gardener.userInfo(poolId, userAddress),
          gardener.totalAllocPoint(),
        ]);
        
        const userAmount = parseFloat(ethers.formatEther(userInfo.amount || userInfo[0]));
        if (userAmount > 0) {
          const lpTokenAddress = poolInfo.lpToken || poolInfo[0];
          const lpContract = new ethers.Contract(lpTokenAddress, ERC20_ABI, provider);
          const poolTotal = await lpContract.balanceOf(MASTER_GARDENER_V2);
          const poolTotalAmount = parseFloat(ethers.formatEther(poolTotal));
          
          positions.push({
            poolId,
            poolName: POOL_NAMES[poolId],
            userLp: userAmount,
            poolTotalLp: poolTotalAmount,
            lpShare: poolTotalAmount > 0 ? userAmount / poolTotalAmount : 0,
            lpSharePct: poolTotalAmount > 0 ? (userAmount / poolTotalAmount * 100).toFixed(4) : '0',
            allocPoint: Number(poolInfo.allocPoint || poolInfo[1]),
            totalAllocPoint: Number(totalAlloc),
          });
        }
      } catch (err) {
        console.warn(`[GardeningCalc] Error checking pool ${poolId}:`, err.message);
      }
    }
    
    return { ok: true, positions };
  } catch (err) {
    console.error('[GardeningCalc] Error fetching user positions:', err.message);
    return { ok: false, error: err.message, positions: [] };
  }
}
