/**
 * Wallet LP Token Detection
 * 
 * Scans user wallets for LP token holdings in Crystalvale garden pools.
 * Maps LP tokens to pool data for yield optimization recommendations.
 */

import { ethers } from 'ethers';
import { getCachedPoolAnalytics } from './pool-cache.js';
import erc20ABI from './ERC20.json' with { type: 'json' };

// DFK Chain configuration
const DFK_CHAIN_RPC = 'https://subnets.avax.network/defi-kingdoms/dfk-chain/rpc';
const provider = new ethers.JsonRpcProvider(DFK_CHAIN_RPC);

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
    
    // Query each pool's LP token for user balance
    for (const pool of pools) {
      try {
        const lpContract = new ethers.Contract(pool.lpToken, erc20ABI, provider);
        const balance = await lpContract.balanceOf(walletAddress);
        
        // Only include pools where user has LP tokens
        if (balance > 0n) {
          const balanceFormatted = ethers.formatUnits(balance, 18);
          
          // Calculate USD value of position using BigInt arithmetic
          const totalSupply = await lpContract.totalSupply();
          
          // Avoid precision loss: scale by 1e6, divide, then convert
          const PRECISION = 1000000n;
          const userShareScaled = (balance * PRECISION) / totalSupply;
          const userShareOfPool = Number(userShareScaled) / 1000000;
          
          // Parse TVL safely with fallback
          const poolTVL = parseFloat(pool.totalTVL?.replace(/[^0-9.]/g, '') || '0');
          const userTVL = poolTVL * userShareOfPool;
          
          positions.push({
            pid: pool.pid,
            pairName: pool.pairName,
            lpToken: pool.lpToken,
            lpBalance: balanceFormatted,
            lpBalanceRaw: balance.toString(),
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
          
          console.log(`[LP Detector] Found position: ${pool.pairName} (${balanceFormatted} LP tokens, $${userTVL.toFixed(2)} TVL)`);
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
  
  let report = `## Garden Optimization Analysis\n\n`;
  report += `**Total Positions:** ${optimization.positions}\n`;
  report += `**Total Value:** $${optimization.totalValueUSD}\n\n`;
  
  for (const rec of optimization.recommendations) {
    report += `### ${rec.pairName}\n`;
    report += `**Pool Type:** ${rec.poolType}\n`;
    report += `**Your Position:** $${rec.userTVL}\n\n`;
    
    report += `**Current Yield Range:**\n`;
    report += `- Worst scenario (no optimization): ${rec.currentYield.worst} (${rec.annualReturn.worst}/year)\n`;
    report += `- Best scenario (optimized): ${rec.currentYield.best} (${rec.annualReturn.best}/year)\n`;
    report += `- Potential gain: **${rec.additionalGain}** additional per year (${rec.yieldImprovement} improvement)\n\n`;
    
    report += `**Hero Assignment:**\n${rec.heroRecommendation}\n\n`;
    report += `**Pet Assignment:**\n${rec.petRecommendation}\n\n`;
    
    report += `**APR Breakdown:**\n`;
    report += `- Fee APR: ${rec.aprBreakdown.fee}\n`;
    report += `- Harvesting APR: ${rec.aprBreakdown.harvesting}\n`;
    report += `- Quest Boost Range: ${rec.aprBreakdown.questBoost}\n\n`;
    report += `---\n\n`;
  }
  
  return report;
}
