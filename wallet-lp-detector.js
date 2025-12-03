/**
 * Wallet LP Token Detection
 *
 * Scans user wallets for LP token holdings in Crystalvale garden pools.
 * Uses onchain-data's getUserGardenPositions as the single source of truth
 * for which pools the user is actually in, and pool-cache for APR analytics.
 */

import { ethers } from 'ethers';
import { getCachedPoolAnalytics } from './pool-cache.js';
import { getUserGardenPositions } from './onchain-data.js';
import erc20ABI from './ERC20.json' with { type: 'json' };

// DFK Chain configuration (for LP totalSupply)
const DFK_CHAIN_RPC = 'https://subnets.avax.network/defi-kingdoms/dfk-chain/rpc';
const provider = new ethers.JsonRpcProvider(DFK_CHAIN_RPC);

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

// -------------------------------
// Main: Detect LP positions
// -------------------------------
export async function detectWalletLPPositions(walletAddress) {
  try {
    console.log(`[LP Detector] Scanning wallet ${walletAddress} for LP positions...`);

    // Get user's staked positions from the canonical onchain layer (DFK realm only)
    const userPositions = await getUserGardenPositions(walletAddress, 'dfk');
    const userPosByPid = new Map();
    for (const pos of userPositions) {
      userPosByPid.set(pos.pid, pos);
    }
    console.log(`[LP Detector] onchain-data reports ${userPositions.length} DFK positions for this wallet`);

    // Get cached pool analytics for enriched data (TVL, APR, etc.)
    const cached = getCachedPoolAnalytics();
    const cachedPools = cached?.data || [];

    console.log(`[LP Detector] Using ${cachedPools.length} cached pools for analytics on top of official list...`);

    const poolAnalyticsMap = new Map();
    for (const cachedPool of cachedPools) {
      poolAnalyticsMap.set(cachedPool.pid, cachedPool);
    }

    const positions = [];

    // Iterate official pools, but only consider those where onchain-data says user has a position
    for (const officialPool of OFFICIAL_GARDEN_POOLS) {
      const { pid, name, lpToken } = officialPool;

      const userPos = userPosByPid.get(pid);
      if (!userPos) continue; // no stake in this pool

      try {
        // staked amount from onchain-data (canonical)
        const stakedAmountRaw = BigInt(userPos.stakedAmountRaw ?? 0n);
        if (stakedAmountRaw <= 0n) continue;

        const stakedFormatted = userPos.stakedAmount ?? ethers.formatUnits(stakedAmountRaw, 18);

        // Cached analytics for this pool
        const cachedAnalytics = poolAnalyticsMap.get(pid);

        let userTVL = '0.00';
        let shareOfPool = 'N/A';
        let poolData = null;

        if (cachedAnalytics) {
          try {
            // Use ERC20 totalSupply to compute share of pool
            const lpContract = new ethers.Contract(lpToken, erc20ABI, provider);
            const totalSupply = await lpContract.totalSupply();

            const PRECISION = 1000000n;
            const userShareScaled = (stakedAmountRaw * PRECISION) / totalSupply;
            const userShareOfPool = Number(userShareScaled) / 1_000_000;

            // Parse TVL safely with fallback
            const poolTVL =
              typeof cachedAnalytics.totalTVL === 'number'
                ? cachedAnalytics.totalTVL
                : parseFloat(
                    String(cachedAnalytics.totalTVL ?? '')
                      .replace(/[^0-9.]/g, '') || '0'
                  );

            userTVL = (poolTVL * userShareOfPool).toFixed(2);
            shareOfPool = (userShareOfPool * 100).toFixed(4) + '%';

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
            console.warn(
              `[LP Detector] Could not calculate USD value / share for pool ${pid}:`,
              err.message
            );
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
          // No cache data, minimal object so UI doesn't break
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
          pairName: name,
          lpToken,
          lpBalance: stakedFormatted,
          lpBalanceRaw: stakedAmountRaw.toString(),
          userTVL,
          shareOfPool,
          poolData
        });

        console.log(
          `[LP Detector] ✅ PID ${pid} (${name}): ${stakedFormatted} LP, share ${shareOfPool}, TVL ~$${userTVL}`
        );
      } catch (err) {
        console.error(`[LP Detector] Error processing PID ${pid}:`, err.message);
      }
    }

    console.log(
      `[LP Detector] ✅ Found ${positions.length}/${OFFICIAL_GARDEN_POOLS.length} LP positions for wallet ${walletAddress}`
    );
    return positions;
  } catch (error) {
    console.error('[LP Detector] Error detecting LP positions:', error);
    return [];
  }
}

/**
 * Format LP positions for AI summary (no yields shown)
 */
export function formatLPPositionsSummary(positions) {
  if (!positions || positions.length === 0) {
    return 'No LP token positions found in your wallet.';
  }

  const poolList = positions.map((p) => p.pairName).join(', ');
  const totalValue = (() => {
    const sum = positions.reduce((acc, p) => {
      const val = parseFloat(p?.userTVL ?? '0');
      return Number.isFinite(val) ? acc + val : acc;
    }, 0);
    return Number.isFinite(sum) ? sum.toFixed(2) : '0.00';
  })();

  return `I found ${positions.length} garden pool${
    positions.length > 1 ? 's' : ''
  }: **${poolList}** (Total value: $${totalValue})`;
}

// -------------------------------
// APR / Yield modeling helpers
// -------------------------------
function parseAPR(value) {
  if (value == null) return 0;
  if (typeof value === 'number') return value;
  const cleaned = String(value).replace(/[^0-9.\-]/g, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}

function parseQuestAPRRange(gardeningQuestAPR) {
  if (!gardeningQuestAPR) {
    return { worst: 0, best: 0 };
  }
  const worst = parseAPR(gardeningQuestAPR.worst);
  const best = parseAPR(gardeningQuestAPR.best);
  if (best < worst) {
    return { worst, best: worst };
  }
  return { worst, best };
}

/**
 * Generate hero/pet optimization recommendations for LP positions
 *
 * Modes:
 * - hasLinkedWallet = true  → "Before" APR = fee + harvesting + CURRENT quest APR (approx midpoint of range)
 * - hasLinkedWallet = false → "Before" APR = fee + harvesting + WORST quest APR (generic answer)
 */
export function generatePoolOptimizations(positions, heroes = [], options = {}) {
  const { hasLinkedWallet = true } = options;
  const recommendations = [];

  const safePositions = Array.isArray(positions) ? positions : [];

  for (const position of safePositions) {
    const { pairName, poolData, userTVL } = position;
    const { fee24hAPR, harvesting24hAPR, gardeningQuestAPR } = poolData || {};

    const feeAPR = parseAPR(fee24hAPR);
    const harvestingAPR = parseAPR(harvesting24hAPR);
    const { worst: worstQuestAPR, best: bestQuestAPR } =
      parseQuestAPRRange(gardeningQuestAPR);

    const baseAPR = feeAPR + harvestingAPR;

    // Current quest APR estimate
    const currentQuestAPR = hasLinkedWallet
      ? (worstQuestAPR + bestQuestAPR) / 2
      : worstQuestAPR;

    const beforeAPR = baseAPR + currentQuestAPR;
    const afterAPR = baseAPR + bestQuestAPR;

    const feeVsEmission = harvestingAPR === 0 ? Infinity : feeAPR / harvestingAPR;
    let poolType;
    let heroRecommendation;
    let petRecommendation;

    if (feeVsEmission > 2.0) {
      poolType = 'Fee-Dominant (Stable Passive Income)';
      heroRecommendation =
        'Any available hero works well. Focus on maximizing gardening skill for a small but steady boost.';
      petRecommendation =
        'Trading or fee-boosting pets are optimal. Gardening pets are a plus but not mandatory here.';
    } else if (feeVsEmission < 0.5) {
      poolType = 'Emission-Dominant (High Hero Boost Potential)';
      heroRecommendation =
        'Prioritize your highest INT + WIS heroes. Best: high level (60+) gardeners with strong profession bonuses. These pools get a big lift from optimized questing.';
      petRecommendation =
        'Gardening pets that boost CRYSTAL / JEWEL emissions are ideal. Look for pets with gardening yield bonuses or quest stamina reduction.';
    } else {
      poolType = 'Balanced (Fees + Emissions)';
      heroRecommendation =
        'Use mid to high level heroes (40–80) with decent INT/WIS and gardening profession. You don’t need your absolute best hero here, but a good gardener still matters.';
      petRecommendation =
        'Either trading or gardening pets work. Prefer gardening pets if you want to push the upper end of the APR range.';
    }

    const positionValue = (() => {
      const n = parseFloat(userTVL);
      return Number.isFinite(n) ? n : 0;
    })();

    const currentYieldLow = Number.isFinite(beforeAPR) ? beforeAPR : 0;
    const currentYieldHigh = Number.isFinite(afterAPR) ? afterAPR : 0;

    const formatAPR = (value) => {
      const safe = Number.isFinite(value) ? value : 0;
      return `${safe.toFixed(2)}%`;
    };

    const formatDollars = (value) => {
      const safe = Number.isFinite(value) ? value : 0;
      return `$${safe.toFixed(2)}`;
    };

    let yieldImprovementLabel;
    if (currentYieldLow > 0.1) {
      const pct = ((currentYieldHigh - currentYieldLow) / currentYieldLow) * 100;
      if (Number.isFinite(pct)) {
        yieldImprovementLabel = `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}% vs current`;
      } else {
        const absoluteDelta = currentYieldHigh - currentYieldLow;
        const safeDelta = Number.isFinite(absoluteDelta) ? absoluteDelta : 0;
        yieldImprovementLabel = `${safeDelta >= 0 ? '+' : ''}${safeDelta.toFixed(1)}% absolute`;
      }
    } else {
      const absoluteDelta = currentYieldHigh - currentYieldLow;
      const safeDelta = Number.isFinite(absoluteDelta) ? absoluteDelta : 0;
      yieldImprovementLabel = `${safeDelta >= 0 ? '+' : ''}${safeDelta.toFixed(1)}% absolute`;
    }

    const annualGainLow = Number.isFinite(positionValue) && Number.isFinite(currentYieldLow)
      ? (positionValue * currentYieldLow) / 100
      : 0;
    const annualGainHigh = Number.isFinite(positionValue) && Number.isFinite(currentYieldHigh)
      ? (positionValue * currentYieldHigh) / 100
      : 0;
    const additionalGain = annualGainHigh - annualGainLow;

    recommendations.push({
      pairName,
      poolType,
      userTVL: positionValue.toFixed(2),
      currentYield: {
        worst: formatAPR(currentYieldLow),
        best: formatAPR(currentYieldHigh)
      },
      annualReturn: {
        worst: formatDollars(annualGainLow),
        best: formatDollars(annualGainHigh),
        additionalGain: formatDollars(additionalGain)
      },
      yieldImprovement: yieldImprovementLabel,
      heroRecommendation,
      petRecommendation,
      aprBreakdown: {
        fee: fee24hAPR || 'N/A',
        harvesting: harvesting24hAPR || 'N/A',
        questBoost:
          gardeningQuestAPR?.worst && gardeningQuestAPR?.best
            ? `${gardeningQuestAPR.worst} - ${gardeningQuestAPR.best}`
            : 'N/A'
      }
    });
  }

  return {
    positions: safePositions.length,
    totalValueUSD: (() => {
      const sum = safePositions.reduce((acc, p) => {
        const val = parseFloat(p?.userTVL ?? '0');
        return Number.isFinite(val) ? acc + val : acc;
      }, 0);
      return Number.isFinite(sum) ? sum.toFixed(2) : '0.00';
    })(),
    recommendations
  };
}

// -------------------------------
// Generic APR view (no wallet linked)
// -------------------------------
export function getGenericPoolAprView() {
  const cached = getCachedPoolAnalytics();
  const cachedPools = cached?.data || [];

  const poolAnalyticsMap = new Map();
  for (const p of cachedPools) {
    poolAnalyticsMap.set(p.pid, p);
  }

  const view = [];

  for (const pool of OFFICIAL_GARDEN_POOLS) {
    const analytics = poolAnalyticsMap.get(pool.pid);
    if (!analytics) continue;

    const fee = parseAPR(analytics.fee24hAPR);
    const harvesting = parseAPR(analytics.harvesting24hAPR);
    const { worst, best } = parseQuestAPRRange(analytics.gardeningQuestAPR);
    const base = fee + harvesting;

    const genericBefore = base + worst;
    const fullyOptimized = base + best;

    view.push({
      pid: pool.pid,
      pairName: pool.name,
      totalTVL: analytics.totalTVL,
      feeAPR: fee,
      harvestingAPR: harvesting,
      questAPRWorst: worst,
      questAPRBest: best,
      totalAPRRange: {
        worst: genericBefore,
        best: fullyOptimized
      }
    });
  }

  view.sort((a, b) => {
    const tA =
      typeof a.totalTVL === 'number'
        ? a.totalTVL
        : parseFloat(String(a.totalTVL).replace(/[^0-9.]/g, '') || '0');
    const tB =
      typeof b.totalTVL === 'number'
        ? b.totalTVL
        : parseFloat(String(b.totalTVL).replace(/[^0-9.]/g, '') || '0');
    return tB - tA;
  });

  return view;
}

export function formatGenericPoolAprAnswer(poolsView, maxPools = 6) {
  if (!poolsView || poolsView.length === 0) {
    return "Right now I don't have reliable APR data for the gardens. Try again in a bit and I'll refresh my analytics.";
  }

  const top = poolsView.slice(0, maxPools);

  let text = `Here’s a quick look at some of the main Crystalvale gardens right now (approximate ranges):\n\n`;

  for (const p of top) {
    const tvlRaw =
      typeof p.totalTVL === 'number'
        ? p.totalTVL
        : parseFloat(String(p.totalTVL).replace(/[^0-9.]/g, '') || '0');

    const tvl = isNaN(tvlRaw) ? 'N/A' : `$${tvlRaw.toFixed(0)}`;
    const worst = p.totalAPRRange.worst.toFixed(1);
    const best = p.totalAPRRange.best.toFixed(1);

    text += `**${p.pairName}**\n`;
    text += `- TVL: ${tvl}\n`;
    text += `- Fee APR: ${p.feeAPR.toFixed(1)}%\n`;
    text += `- Emission APR: ${p.harvestingAPR.toFixed(1)}%\n`;
    text += `- Gardening Boost (heroes + pets): ~${p.questAPRWorst.toFixed(
      1
    )}% → ${p.questAPRBest.toFixed(1)}%\n`;
    text += `- **Total APR Range:** ~${worst}% → ${best}% (depending on how strong your gardening setup is)\n\n`;
  }

  text += `If you ever want me to talk about **your actual positions** instead of general ranges, link a wallet and I’ll run the full optimization on your pools.`;

  return text;
}

/**
 * Format optimization recommendations for AI response
 */
export function formatOptimizationReport(optimization) {
  if (
    !optimization ||
    !optimization.recommendations ||
    optimization.recommendations.length === 0
  ) {
    return 'No optimization recommendations available.';
  }

  const totalPositions = Number.isFinite(optimization.positions)
    ? optimization.positions
    : Array.isArray(optimization.recommendations)
      ? optimization.recommendations.length
      : 0;
  const totalValue = optimization.totalValueUSD ?? '0.00';

  let report = `**📊 Summary**\n`;
  report += `- Total Positions: ${totalPositions}\n`;
  report += `- Total Value: $${totalValue}\n\n`;

  for (const rec of optimization.recommendations) {
    if (!rec) continue;

    const currentYield = rec.currentYield || {};
    const annualReturn = rec.annualReturn || {};
    const aprBreakdown = rec.aprBreakdown || {};

    report += `### ${rec.pairName || 'Unknown Pool'}\n`;
    report += `**Pool Type:** ${rec.poolType || 'N/A'} | **Your Position:** $${rec.userTVL ?? '0.00'}\n\n`;

    report += `**📈 Before vs After**\n`;
    report += `\`\`\`\n`;
    report += `BEFORE (Current gardening setup):\n`;
    report += `  APR: ${currentYield.worst ?? 'N/A'}\n`;
    report += `  Annual Return: ${annualReturn.worst ?? 'N/A'}\n\n`;
    report += `AFTER (Optimized heroes + pets):\n`;
    report += `  APR: ${currentYield.best ?? 'N/A'}\n`;
    report += `  Annual Return: ${annualReturn.best ?? 'N/A'}\n\n`;
    report += `GAIN: ${annualReturn.additionalGain ?? 'N/A'} (${rec.yieldImprovement ?? 'N/A'})\n`;
    report += `\`\`\`\n\n`;

    report += `**🦸 Recommended Setup**\n`;
    report += `${rec.heroRecommendation || 'No hero recommendation available.'}\n`;
    report += `${rec.petRecommendation || 'No pet recommendation available.'}\n\n`;

    report += `**APR Breakdown:**\n`;
    report += `- Fee APR: ${aprBreakdown.fee ?? 'N/A'}\n`;
    report += `- Harvesting APR: ${aprBreakdown.harvesting ?? 'N/A'}\n`;
    report += `- Quest Boost Range: ${aprBreakdown.questBoost ?? 'N/A'}\n\n`;
    report += `---\n\n`;
  }

  return report;
}