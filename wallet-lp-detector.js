/**
 * Wallet LP Token Detection
 * 
 * Scans user wallets for LP token holdings in Crystalvale garden pools.
 * Maps LP tokens to pool data for yield optimization recommendations.
 * Uses official DFK documentation pool list as source of truth.
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

// Official DFK Chain garden pools from documentation
// https://devs.defikingdoms.com/contracts/gardens
const OFFICIAL_GARDEN_POOLS = [
  { pid: 0, name: 'wJEWEL-xJEWEL', lpToken: '0x6AC38A4C112F125eac0eBDbaDBed0BC8F4575d0d' },
  { pid: 1, name: 'CRYSTAL-AVAX', lpToken: '0x9f378F48d0c1328fd0C80d7Ae544C6CadB5Ba99E' },
  { pid: 2, name: 'CRYSTAL-wJEWEL', lpToken: '0x48658E69D741024b4686C8f7b236D3F1D291f386' },
  { pid: 3, name: 'CRYSTAL-USDC', lpToken: '0x04Dec678825b8DfD2D0d9bD83B538bE3fbDA2926' },
  { pid: 4, name: 'ETH-USDC', lpToken: '0x7d4daa9eB74264b082A92F3f559ff167224484aC' },
  { pid: 5, name: 'wJEWEL-USDC', lpToken: '0xCF329b34049033dE26e4449aeBCb41f1992724D3' },
  { pid: 6, name: 'CRYSTAL-ETH', lpToken: '0x78C893E262e2681Dbd6B6eBA6CCA2AaD45de19AD' },
  { pid: 7, name: 'CRYSTAL-BTC.b', lpToken: '0x00BD81c9bAc29a3b6aea7ABc92d2C9a3366Bb4dD' },
  { pid: 8, name: 'CRYSTAL-KLAY', lpToken: '0xaFC1fBc3F3fB517EB54Bb2472051A6f0b2105320' },
  { pid: 9, name: 'wJEWEL-KLAY', lpToken: '0x561091E2385C90d41b4c0dAef651A4b33E1a5CfE' },
  { pid: 10, name: 'wJEWEL-AVAX', lpToken: '0xF3EabeD6Bd905e0FcD68FC3dBCd6e3A4aEE55E98' },
  { pid: 11, name: 'wJEWEL-BTC.b', lpToken: '0xfAa8507e822397bd56eFD4480Fb12ADC41ff940B' },
  { pid: 12, name: 'wJEWEL-ETH', lpToken: '0x79724B6996502afc773feB3Ff8Bb3C23ADf2854B' },
  { pid: 13, name: 'BTC.b-USDC', lpToken: '0x59D642B471dd54207Cb1CDe2e7507b0Ce1b1a6a5' }
];

/**
 * Detect LP token holdings in a wallet
 * Uses official pool list for detection, falls back to cache for analytics
 * @param {string} walletAddress - Ethereum wallet address
 * @returns {Promise<Array>} Array of LP positions with pool data
 */
export async function detectWalletLPPositions(walletAddress) {
  try {
    console.log(`[LP Detector] Scanning wallet ${walletAddress} for LP positions...`);
    
    // Get cached pool analytics for enriched data (TVL, APR, etc)
    const cached = getCachedPoolAnalytics();
    const cachedPools = cached?.data || [];
    
    console.log(`[LP Detector] Using official DFK pool list + ${cachedPools.length} cached pools for analytics...`);
    
    // Build pool lookup from cache (pid -> full analytics)
    const poolAnalyticsMap = new Map();
    for (const cachedPool of cachedPools) {
      poolAnalyticsMap.set(cachedPool.pid, cachedPool);
    }
    
    const positions = [];
    
    // Check each official pool
    for (const officialPool of OFFICIAL_GARDEN_POOLS) {
      try {
        const pid = officialPool.pid;
        
        // Query user's staked amount in this specific pool
        const userInfo = await stakingContract.userInfo(pid, walletAddress);
        const stakedAmount = userInfo.amount;
        
        if (stakedAmount > 0n) {
          const stakedFormatted = ethers.formatUnits(stakedAmount, 18);
          
          // Look up cached analytics for this pool
          const cachedAnalytics = poolAnalyticsMap.get(pid);
          
          let userTVL = '0.00';
          let poolData = null;
          
          if (cachedAnalytics) {
            // Calculate USD value using cached pool data
            try {
              const lpContract = new ethers.Contract(officialPool.lpToken, erc20ABI, provider);
              const totalSupply = await lpContract.totalSupply();
              
              // Avoid precision loss: scale by 1e6, divide, then convert
              const PRECISION = 1000000n;
              const userShareScaled = (stakedAmount * PRECISION) / totalSupply;
              const userShareOfPool = Number(userShareScaled) / 1000000;
              
              // Parse TVL safely with fallback (handle both string and number)
              const poolTVL = typeof cachedAnalytics.totalTVL === 'number' 
                ? cachedAnalytics.totalTVL 
                : parseFloat(cachedAnalytics.totalTVL?.replace(/[^0-9.]/g, '') || '0');
              userTVL = (poolTVL * userShareOfPool).toFixed(2);
              
              poolData = {
                totalTVL: cachedAnalytics.totalTVL,
                fee24hAPR: cachedAnalytics.fee24hAPR,
                harvesting24hAPR: cachedAnalytics.harvesting24hAPR,
                gardeningQuestAPR: cachedAnalytics.gardeningQuestAPR,
                totalAPR: cachedAnalytics.totalAPR,
                token0: cachedAnalytics.token0,
                token1: cachedAnalytics.token1
              };
            } catch (err) {
              console.warn(`[LP Detector] Could not calculate USD value for pool ${pid}:`, err.message);
              poolData = {
                totalTVL: cachedAnalytics.totalTVL,
                fee24hAPR: cachedAnalytics.fee24hAPR,
                harvesting24hAPR: cachedAnalytics.harvesting24hAPR,
                gardeningQuestAPR: cachedAnalytics.gardeningQuestAPR,
                totalAPR: cachedAnalytics.totalAPR,
                token0: cachedAnalytics.token0,
                token1: cachedAnalytics.token1
              };
            }
          } else {
            // No cache data, create minimal pool object
            poolData = {
              totalTVL: 'N/A',
              fee24hAPR: 'N/A',
              harvesting24hAPR: 'N/A',
              gardeningQuestAPR: { worst: 'N/A', best: 'N/A' },
              totalAPR: 'N/A',
              token0: null,
              token1: null
            };
          }
          
          positions.push({
            pid,
            pairName: officialPool.name,
            lpToken: officialPool.lpToken,
            lpBalance: stakedFormatted,
            lpBalanceRaw: stakedAmount.toString(),
            userTVL,
            shareOfPool: cachedAnalytics ? (
              (() => {
                const lpContract = new ethers.Contract(officialPool.lpToken, erc20ABI, provider);
                return lpContract.totalSupply().then(ts => {
                  const PRECISION = 1000000n;
                  const userShareScaled = (stakedAmount * PRECISION) / ts;
                  return ((Number(userShareScaled) / 1000000) * 100).toFixed(4) + '%';
                }).catch(() => 'N/A');
              })()
            ) : 'N/A',
            poolData
          });
          
          console.log(`[LP Detector] ✅ PID ${pid} (${officialPool.name}): Found ${stakedFormatted} LP tokens staked`);
        }
      } catch (err) {
        console.error(`[LP Detector] Error checking PID ${officialPool.pid}:`, err.message);
      }
    }
    
    console.log(`[LP Detector] ✅ Found ${positions.length}/${OFFICIAL_GARDEN_POOLS.length} LP positions for wallet ${walletAddress}`);
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
  const totalValue = positions.reduce((sum, p) => sum + parseFloat(p.userTVL || 0), 0).toFixed(2);
  
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
    totalValueUSD: positions.reduce((sum, p) => sum + parseFloat(p.userTVL || 0), 0).toFixed(2),
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
