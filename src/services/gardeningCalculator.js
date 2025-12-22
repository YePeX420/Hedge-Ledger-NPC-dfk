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

const DFK_CHAIN_RPC = 'https://subnets.avax.network/defi-kingdoms/dfk-chain/rpc';
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

export { POOL_NAMES, MIN_REWARD_PER_STAMINA };
