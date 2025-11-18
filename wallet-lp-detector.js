/**
 * Wallet LP Token Detection
 * 
 * Scans user wallets for LP token holdings in Crystalvale garden pools.
 * Maps LP tokens to pool data for yield optimization recommendations.
 */

import { ethers } from 'ethers';
import { getCachedPoolAnalytics } from './pool-cache.js';
import erc20ABI from './ERC20.json' with { type: 'json' };
import lpStakingABI from './LPStakingDiamond.json' with { type: 'json' };

// DFK Chain configuration
const DFK_CHAIN_RPC = 'https://subnets.avax.network/defi-kingdoms/dfk-chain/rpc';
const provider = new ethers.JsonRpcProvider(DFK_CHAIN_RPC);

// LP Staking contract (where garden LP tokens are deposited)
const LP_STAKING_ADDRESS = '0xB04e8D6aED037904B77A9F0b08002592925833b7';
const stakingContract = new ethers.Contract(LP_STAKING_ADDRESS, lpStakingABI, provider);

/**
 * Detect LP token holdings in a wallet
 * @param {string} walletAddress - Ethereum wallet address
 * @returns {Promise<Array>} Array of LP positions with pool data
 */
export async function detectWalletLPPositions(walletAddress) {
  try {
    console.log(`[LP Detector] Scanning wallet ${walletAddress} for LP positions...`);
    
    // Get cached pool analytics
    const cached = getCachedPoolAnalytics();
    if (!cached || !cached.data) {
      console.error('[LP Detector] Pool cache not available');
      return [];
    }
    
    const pools = cached.data;
    const positions = [];
    
    // Query each pool for user's STAKED LP tokens
    for (const pool of pools) {
      try {
        // Get staked amount from LP Staking contract
        const userInfo = await stakingContract.userInfo(pool.pid, walletAddress);
        const stakedAmount = userInfo.amount; // Staked LP tokens in this pool
        
        // Only include pools where user has staked LP tokens
        if (stakedAmount > 0n) {
          const stakedFormatted = ethers.formatUnits(stakedAmount, 18);
          
          // Calculate USD value of position using BigInt arithmetic
          const lpContract = new ethers.Contract(pool.lpToken, erc20ABI, provider);
          const totalSupply = await lpContract.totalSupply();
          
          // Avoid precision loss: scale by 1e6, divide, then convert
          const PRECISION = 1000000n;
          const userShareScaled = (stakedAmount * PRECISION) / totalSupply;
          const userShareOfPool = Number(userShareScaled) / 1000000;
          
          // Parse TVL safely with fallback (handle both string and number)
          const poolTVL = typeof pool.totalTVL === 'number' 
            ? pool.totalTVL 
            : parseFloat(pool.totalTVL?.replace(/[^0-9.]/g, '') || '0');
          const userTVL = poolTVL * userShareOfPool;
          
          positions.push({
            pid: pool.pid,
            pairName: pool.pairName,
            lpToken: pool.lpToken,
            lpBalance: stakedFormatted,
            lpBalanceRaw: stakedAmount.toString(),
            userTVL: userTVL.toFixed(2),
            shareOfPool: (userShareOfPool * 100).toFixed(4) + '%',
            poolData: {
              totalTVL: pool.totalTVL,
              fee24hAPR: pool.fee24hAPR,
              harvesting24hAPR: pool.harvesting24hAPR,
              gardeningQuestAPR: pool.gardeningQuestAPR,
              totalAPR: pool.totalAPR,
              token0: pool.token0,
              token1: pool.token1
            }
          });
          
          console.log(`[LP Detector] Found STAKED position: ${pool.pairName} (${stakedFormatted} LP tokens, $${userTVL.toFixed(2)} TVL)`);
        }
      } catch (err) {
        console.error(`[LP Detector] Error checking pool ${pool.pid}:`, err.message);
      }
    }
    
    console.log(`[LP Detector] Found ${positions.length} LP positions for wallet ${walletAddress}`);
    return positions;
    
  } catch (error) {
    console.error('[LP Detector] Error detecting LP positions:', error);
    return [];
  }
}

/**
 * Format LP positions for AI summary (no yields shown)
 * @param {Array} positions - Array of LP position objects
 * @returns {string} Formatted summary text
 */
export function formatLPPositionsSummary(positions) {
  if (!positions || positions.length === 0) {
    return "No LP token positions found in your wallet.";
  }
  
  const poolList = positions.map(p => p.pairName).join(', ');
  const totalValue = positions.reduce((sum, p) => sum + parseFloat(p.userTVL), 0).toFixed(2);
  
  return `I found ${positions.length} garden pool${positions.length > 1 ? 's' : ''}: **${poolList}** (Total value: $${totalValue})`;
}

/**
 * Generate hero/pet optimization recommendations for LP positions
 * @param {Array} positions - Array of LP position objects
 * @param {Array} heroes - User's hero roster (from GraphQL)
 * @returns {Object} Optimization recommendations
 */
export function generatePoolOptimizations(positions, heroes = []) {
  const recommendations = [];
  
  for (const position of positions) {
    const { pairName, poolData, userTVL } = position;
    const { fee24hAPR, harvesting24hAPR, gardeningQuestAPR } = poolData;
    
    // Parse APR values safely with fallbacks
    const feeAPR = parseFloat((fee24hAPR || '0').replace('%', '') || '0');
    const harvestingAPR = parseFloat((harvesting24hAPR || '0').replace('%', '') || '0');
    const worstQuestAPR = parseFloat((gardeningQuestAPR?.worst || '0').replace('%', '') || '0');
    const bestQuestAPR = parseFloat((gardeningQuestAPR?.best || '0').replace('%', '') || '0');
    
    // Determine pool strategy based on APR composition
    const feeVsEmission = feeAPR / (harvestingAPR || 1);
    let poolType;
    let heroRecommendation;
    let petRecommendation;
    
    if (feeVsEmission > 2.0) {
      // Fee-dominant pool (passive yield, less hero-dependent)
      poolType = 'Fee-Dominant (Stable Passive Income)';
      heroRecommendation = 'Any available hero works well. Focus on maximizing gardening skill for slight boost.';
      petRecommendation = 'Trading pets (boost fee collection) are optimal.';
    } else if (feeVsEmission < 0.5) {
      // Emission-dominant pool (high hero boost potential)
      poolType = 'Emission-Dominant (High Hero Boost Potential)';
      heroRecommendation = 'Prioritize heroes with high INT + WIS + Level. Best: Level 100 heroes with INT/WIS 80+. Use heroes with **Rapid Renewal** passive for 1.43x quest frequency boost.';
      petRecommendation = 'Gardening pets (boost CRYSTAL emissions) are optimal. Look for pets with gardening yield bonuses.';
    } else {
      // Balanced pool
      poolType = 'Balanced (Fees + Emissions)';
      heroRecommendation = 'Use mid-tier heroes (Level 40-60, INT/WIS 40+) to balance quest frequency and boost effectiveness.';
      petRecommendation = 'Either trading or gardening pets work well. Choose based on availability.';
    }
    
    // Calculate yield improvement from hero optimization
    const currentYieldLow = feeAPR + harvestingAPR + worstQuestAPR;
    const currentYieldHigh = feeAPR + harvestingAPR + bestQuestAPR;
    const yieldImprovement = ((currentYieldHigh - currentYieldLow) / currentYieldLow * 100).toFixed(1);
    
    // Calculate annual USD gain from optimization
    const annualGainLow = (parseFloat(userTVL) * currentYieldLow / 100).toFixed(2);
    const annualGainHigh = (parseFloat(userTVL) * currentYieldHigh / 100).toFixed(2);
    const additionalGain = (parseFloat(annualGainHigh) - parseFloat(annualGainLow)).toFixed(2);
    
    recommendations.push({
      pairName,
      poolType,
      userTVL,
      currentYield: {
        worst: currentYieldLow.toFixed(2) + '%',
        best: currentYieldHigh.toFixed(2) + '%'
      },
      annualReturn: {
        worst: `$${annualGainLow}`,
        best: `$${annualGainHigh}`,
        additionalGain: `$${additionalGain}`
      },
      yieldImprovement: `+${yieldImprovement}%`,
      heroRecommendation,
      petRecommendation,
      aprBreakdown: {
        fee: fee24hAPR || 'N/A',
        harvesting: harvesting24hAPR || 'N/A',
        questBoost: (gardeningQuestAPR?.worst && gardeningQuestAPR?.best) 
          ? `${gardeningQuestAPR.worst} - ${gardeningQuestAPR.best}` 
          : 'N/A'
      }
    });
  }
  
  return {
    positions: positions.length,
    totalValueUSD: positions.reduce((sum, p) => sum + parseFloat(p.userTVL), 0).toFixed(2),
    recommendations
  };
}

/**
 * Format optimization recommendations for AI response
 * @param {Object} optimization - Optimization data from generatePoolOptimizations
 * @returns {string} Formatted text
 */
export function formatOptimizationReport(optimization) {
  if (!optimization || !optimization.recommendations || optimization.recommendations.length === 0) {
    return "No optimization recommendations available.";
  }
  
  let report = `**📊 Summary**\n`;
  report += `- Total Positions: ${optimization.positions}\n`;
  report += `- Total Value: $${optimization.totalValueUSD}\n\n`;
  
  for (const rec of optimization.recommendations) {
    report += `### ${rec.pairName}\n`;
    report += `**Pool Type:** ${rec.poolType} | **Your Position:** $${rec.userTVL}\n\n`;
    
    report += `**📈 Before vs After**\n`;
    report += `\`\`\`\n`;
    report += `BEFORE (No Optimization):\n`;
    report += `  APR: ${rec.currentYield.worst}\n`;
    report += `  Annual Return: ${rec.annualReturn.worst}\n\n`;
    report += `AFTER (Optimized):\n`;
    report += `  APR: ${rec.currentYield.best}\n`;
    report += `  Annual Return: ${rec.annualReturn.best}\n\n`;
    report += `GAIN: +${rec.additionalGain}/year (${rec.yieldImprovement})\n`;
    report += `\`\`\`\n\n`;
    
    report += `**🦸 Recommended Setup**\n`;
    report += `${rec.heroRecommendation}\n`;
    report += `${rec.petRecommendation}\n\n`;
    
    report += `**📋 How to Run Gardening Quests**\n`;
    report += `1. Go to the **Seed Box** in Crystalvale\n`;
    report += `2. Select your assigned hero (${rec.poolType === 'fee-dominant' ? 'high WIS' : 'high STR/DEX'})\n`;
    report += `3. Link your assigned pet (if you have one)\n`;
    report += `4. Choose the **${rec.pairName}** pool\n`;
    report += `5. Send hero on quest (costs stamina, earns JEWEL + pool fees)\n`;
    report += `6. Claim rewards after quest completes\n\n`;
    
    report += `**APR Breakdown:**\n`;
    report += `- Fee APR: ${rec.aprBreakdown.fee}\n`;
    report += `- Harvesting APR: ${rec.aprBreakdown.harvesting}\n`;
    report += `- Quest Boost Range: ${rec.aprBreakdown.questBoost}\n\n`;
    report += `---\n\n`;
  }
  
  return report;
}
