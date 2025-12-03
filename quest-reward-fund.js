/**
 * Quest Reward Fund Integration
 * 
 * Fetches the CRYSTAL and JEWEL reward pool balances from the Quest Fund contract
 * for use in yield calculations.
 * 
 * Contract: 0x1137643FE14b032966a59Acd68EBf3c1271Df316 (DFK Chain)
 */

import { ethers } from 'ethers';

const DFK_RPC = 'https://subnets.avax.network/defi-kingdoms/dfk-chain/rpc';

const QUEST_REWARD_FUND = '0x1137643FE14b032966a59Acd68EBf3c1271Df316';

const CRYSTAL_TOKEN = '0x04b9dA42306B023f3572e106B11D82aAd9D32EBb';
const JEWEL_TOKEN = '0xCCb93dABD71c8Dad03Fc4CE5559dC3D89F67a260';

const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
];

const provider = new ethers.JsonRpcProvider(DFK_RPC);

let cachedRewardPools = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Fetch the Quest Reward Fund balances
 * @param {boolean} forceRefresh - Force a fresh fetch, ignoring cache
 * @returns {Promise<{crystalPool: number, jewelPool: number, ratio: number}>}
 */
export async function getQuestRewardFundBalances(forceRefresh = false) {
  const now = Date.now();
  
  if (!forceRefresh && cachedRewardPools && (now - cacheTimestamp) < CACHE_TTL_MS) {
    return cachedRewardPools;
  }
  
  try {
    console.log('[QuestRewardFund] Fetching reward pool balances...');
    
    const crystalContract = new ethers.Contract(CRYSTAL_TOKEN, ERC20_ABI, provider);
    const jewelContract = new ethers.Contract(JEWEL_TOKEN, ERC20_ABI, provider);
    
    const [crystalBal, jewelBal, nativeBal] = await Promise.all([
      crystalContract.balanceOf(QUEST_REWARD_FUND),
      jewelContract.balanceOf(QUEST_REWARD_FUND),
      provider.getBalance(QUEST_REWARD_FUND),
    ]);
    
    const crystalPool = Number(ethers.formatEther(crystalBal));
    const jewelWrapped = Number(ethers.formatEther(jewelBal));
    const jewelNative = Number(ethers.formatEther(nativeBal));
    const jewelPool = jewelWrapped + jewelNative;
    
    const ratio = jewelPool > 0 ? crystalPool / jewelPool : Infinity;
    
    cachedRewardPools = {
      crystalPool,
      jewelPool,
      ratio,
      timestamp: now,
    };
    cacheTimestamp = now;
    
    console.log(`[QuestRewardFund] CRYSTAL: ${crystalPool.toLocaleString()}, JEWEL: ${jewelPool.toLocaleString()}, Ratio: ${ratio.toFixed(4)}`);
    
    return cachedRewardPools;
  } catch (err) {
    console.error('[QuestRewardFund] Error fetching balances:', err.message);
    
    if (cachedRewardPools) {
      console.log('[QuestRewardFund] Using cached values');
      return cachedRewardPools;
    }
    
    return {
      crystalPool: 7_785_000,
      jewelPool: 600_000,
      ratio: 12.975,
      timestamp: now,
      isDefault: true,
    };
  }
}

/**
 * Calculate the expected CRYSTAL and JEWEL yield per attempt based on reward pool ratio
 * 
 * The yield formula is based on the relative size of the reward pools:
 * - Larger pool = higher yield per attempt
 * - Pool ratio determines token distribution
 * 
 * @param {Object} options - Calculation options
 * @param {number} options.baseYieldPerAttempt - Base yield per attempt (default: 2.0)
 * @returns {Promise<{crystalPerAttempt: number, jewelPerAttempt: number}>}
 */
export async function getYieldRatesFromRewardPool(options = {}) {
  const { baseYieldPerAttempt = 2.0 } = options;
  
  const { crystalPool, jewelPool, ratio } = await getQuestRewardFundBalances();
  
  const totalPool = crystalPool + jewelPool;
  const crystalWeight = crystalPool / totalPool;
  const jewelWeight = jewelPool / totalPool;
  
  const crystalPerAttempt = baseYieldPerAttempt * (1 + crystalWeight);
  const jewelPerAttempt = baseYieldPerAttempt * jewelWeight * 0.15;
  
  return {
    crystalPerAttempt,
    jewelPerAttempt,
    poolData: {
      crystalPool,
      jewelPool,
      ratio,
      crystalWeight,
      jewelWeight,
    },
  };
}

export { QUEST_REWARD_FUND, CRYSTAL_TOKEN, JEWEL_TOKEN };
