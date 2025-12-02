/**
 * hero-yield-model.js
 *
 * Estimate gardening quest APR based on a wallet's hero roster.
 * This is intentionally an approximation, not an exact replication
 * of in-game formulas, but it's consistent and tunable.
 *
 * The goal: map hero stats → a multiplier between
 *   gardeningQuestAPR.worst and gardeningQuestAPR.best
 */

function safeNum(v) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Compute a normalized "gardener score" between 0 and 1
 * based on:
 * - level
 * - gardening skill
 * - INT + WIS
 * - rarity
 * - profession match (gardening)
 */
export function computeHeroGardeningScore(hero) {
  if (!hero) return 0;

  const level = safeNum(hero.level);
  const gardening = safeNum(hero.gardening) / 10; // comes in tenths
  const intStat = safeNum(hero.intelligence);
  const wisStat = safeNum(hero.wisdom);

  // Basic stat buckets
  const gardeningScore = Math.min(gardening / 100, 1); // 0–1 if 0–100
  const intWisScore = Math.min(((intStat + wisStat) / 2) / 100, 1); // average vs 100
  const levelScore = Math.min(level / 100, 1); // cap at level 100

  // Rarity bonus (0 → 0, 1 → +5%, 2 → +10%, 3 → +20%, 4 → +30%)
  const rarity = safeNum(hero.rarity);
  const rarityBonus = [0, 0.05, 0.1, 0.2, 0.3][rarity] ?? 0;

  // Profession match bonus if hero is actually a gardener
  const profession = (hero.professionStr || '').toLowerCase();
  const professionBonus = profession === 'gardening' ? 0.15 : 0;

  // Weighted combination
  let baseScore =
    0.45 * gardeningScore +
    0.3 * intWisScore +
    0.25 * levelScore;

  baseScore *= 1 + rarityBonus + professionBonus;

  // Clamp 0–1
  if (baseScore < 0) baseScore = 0;
  if (baseScore > 1.2) baseScore = 1.2; // allow slight overshoot
  return Math.min(baseScore, 1);
}

/**
 * Given a set of heroes, return the best gardening score (0–1)
 * and the hero that produced it.
 */
export function getBestGardener(heroes = []) {
  if (!heroes || heroes.length === 0) {
    return { bestScore: 0, bestHero: null };
  }

  let bestScore = 0;
  let bestHero = null;

  for (const hero of heroes) {
    const score = computeHeroGardeningScore(hero);
    if (score > bestScore) {
      bestScore = score;
      bestHero = hero;
    }
  }

  return { bestScore, bestHero };
}

/**
 * Estimate the quest APR for a wallet in a given pool.
 *
 * Inputs:
 *  - heroes: full hero roster (from GraphQL)
 *  - gardeningQuestAPR: { worst, best } for the pool
 *  - hasLinkedWallet: boolean, whether we're actually modeling for a real wallet
 *
 * Returns:
 *  {
 *    currentQuestAPR,   // what we estimate user is actually getting now
 *    bestQuestAPR,      // theoretical best for that pool
 *    baselineQuestAPR,  // generic baseline (worst)
 *    bestHero           // hero object we used (can be null)
 *  }
 */
export function estimateQuestAprForWallet(heroes = [], gardeningQuestAPR, hasLinkedWallet = true) {
  const worst = safeNum(gardeningQuestAPR?.worst);
  const best = safeNum(gardeningQuestAPR?.best);

  // If we have no quest APR data at all, bail early
  if (!Number.isFinite(worst) && !Number.isFinite(best)) {
    return {
      currentQuestAPR: 0,
      bestQuestAPR: 0,
      baselineQuestAPR: 0,
      bestHero: null
    };
  }

  // Ensure ordering makes sense
  const questWorst = Math.min(worst, best);
  const questBest = Math.max(worst, best);

  // Generic baseline is always "worst" APR
  const baselineQuestAPR = questWorst;

  // If we don't have a linked wallet / heroes, fall back to baseline
  if (!hasLinkedWallet || !heroes || heroes.length === 0) {
    return {
      currentQuestAPR: baselineQuestAPR,
      bestQuestAPR: questBest,
      baselineQuestAPR,
      bestHero: null
    };
  }

  const { bestScore, bestHero } = getBestGardener(heroes);

  // Map 0–1 score to [worst, best] quest APR
  const currentQuestAPR =
    questWorst + (questBest - questWorst) * Math.max(0, Math.min(bestScore, 1));

  return {
    currentQuestAPR,
    bestQuestAPR: questBest,
    baselineQuestAPR,
    bestHero
  };
}
This module does not get used by anything yet until we plug it in. That keeps things safe.

2️⃣ Update wallet-lp-detector.js to use hero model
Now we wire hero-aware APR into generatePoolOptimizations.

Below is a full replacement for wallet-lp-detector.js that:

Keeps all exports the same:

detectWalletLPPositions

formatLPPositionsSummary

generatePoolOptimizations

getGenericPoolAprView

formatGenericPoolAprAnswer

formatOptimizationReport

Uses getUserGardenPositions from onchain-data.js (already done)

New: imports and uses estimateQuestAprForWallet from hero-yield-model.js

Still works when heroes array is empty (falls back to old behavior)

wallet-lp-detector.js
js
Copy code
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
import { estimateQuestAprForWallet } from './hero-yield-model.js';
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

        const stakedFormatted =
          userPos.stakedAmount ?? ethers.formatUnits(stakedAmountRaw, 18);

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
  const totalValue = positions
    .reduce((sum, p) => sum + parseFloat(p.userTVL || 0), 0)
    .toFixed(2);

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
 * - hasLinkedWallet = true  → "Before" APR = fee + harvesting + CURRENT quest APR
 *   (derived from hero stats using hero-yield-model)
 * - hasLinkedWallet = false → "Before" APR = fee + harvesting + WORST quest APR (generic)
 */
export function generatePoolOptimizations(positions, heroes = [], options = {}) {
  const { hasLinkedWallet = true } = options;
  const recommendations = [];

  for (const position of positions) {
    const { pairName, poolData, userTVL } = position;
    const { fee24hAPR, harvesting24hAPR, gardeningQuestAPR } = poolData || {};

    const feeAPR = parseAPR(fee24hAPR);
    const harvestingAPR = parseAPR(harvesting24hAPR);
    const questRange = parseQuestAPRRange(gardeningQuestAPR);

    const baseAPR = feeAPR + harvestingAPR;

    // Use hero-yield-model to estimate the wallet's current quest APR
    const {
      currentQuestAPR,
      bestQuestAPR,
      baselineQuestAPR,
      bestHero
    } = estimateQuestAprForWallet(
      heroes,
      { worst: questRange.worst, best: questRange.best },
      hasLinkedWallet
    );

    // BEFORE = what user is likely getting now
    const beforeAPR = baseAPR + currentQuestAPR;
    // AFTER = best-case hero/pet setup
    const afterAPR = baseAPR + bestQuestAPR;

    // Determine pool strategy based on APR composition (fee vs emissions)
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
        'Prioritize your highest INT + WIS gardeners (strong gardening stat and profession match). These pools get a big lift from optimized questing.';
      petRecommendation =
        'Gardening pets that boost CRYSTAL / JEWEL emissions are ideal. Look for pets with gardening yield bonuses or quest stamina reduction.';
    } else {
      poolType = 'Balanced (Fees + Emissions)';
      heroRecommendation =
        'Use mid to high level heroes (40–80) with decent INT/WIS and gardening profession. You don’t need your absolute best hero here, but a good gardener still matters.';
      petRecommendation =
        'Either trading or gardening pets work. Prefer gardening pets if you want to push the upper end of the APR range.';
    }

    // If we identified a "bestHero", add a more specific hint
    if (bestHero) {
      heroRecommendation += `\n\nBest candidate right now looks like **Hero #${
        bestHero.normalizedId || bestHero.id
      }** (Lvl ${bestHero.level}, Gardening ${(bestHero.gardening / 10).toFixed(
        1
      )}, INT ${bestHero.intelligence}, WIS ${bestHero.wisdom}).`;
    }

    const positionValue = (() => {
      const n = parseFloat(userTVL);
      return isNaN(n) ? 0 : n;
    })();

    const currentYieldLow = beforeAPR;
    const currentYieldHigh = afterAPR;

    let yieldImprovementPct;
    if (currentYieldLow > 0.1) {
      yieldImprovementPct =
        ((currentYieldHigh - currentYieldLow) / currentYieldLow) * 100;
    } else {
      yieldImprovementPct = currentYieldHigh - currentYieldLow;
    }

    const annualGainLow = (positionValue * currentYieldLow) / 100;
    const annualGainHigh = (positionValue * currentYieldHigh) / 100;
    const additionalGain = annualGainHigh - annualGainLow;

    recommendations.push({
      pairName,
      poolType,
      userTVL: positionValue.toFixed(2),
      currentYield: {
        worst: currentYieldLow.toFixed(2) + '%',
        best: currentYieldHigh.toFixed(2) + '%'
      },
      annualReturn: {
        worst: `$${annualGainLow.toFixed(2)}`,
        best: `$${annualGainHigh.toFixed(2)}`,
        additionalGain: `$${additionalGain.toFixed(2)}`
      },
      yieldImprovement:
        (yieldImprovementPct >= 0 ? '+' : '') +
        yieldImprovementPct.toFixed(1) +
        (currentYieldLow > 0.1 ? '% vs current' : '% absolute'),
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
    positions: positions.length,
    totalValueUSD: positions
      .reduce((sum, p) => sum + parseFloat(p.userTVL || 0), 0)
      .toFixed(2),
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

  let report = `**📊 Summary**\n`;
  report += `- Total Positions: ${optimization.positions}\n`;
  report += `- Total Value: $${optimization.totalValueUSD}\n\n`;

  for (const rec of optimization.recommendations) {
    report += `### ${rec.pairName}\n`;
    report += `**Pool Type:** ${rec.poolType} | **Your Position:** $${rec.userTVL}\n\n`;

    report += `**📈 Before vs After**\n`;
    report += `\`\`\`\n`;
    report += `BEFORE (Current gardening setup):\n`;
    report += `  APR: ${rec.currentYield.worst}\n`;
    report += `  Annual Return: ${rec.annualReturn.worst}\n\n`;
    report += `AFTER (Optimized heroes + pets):\n`;
    report += `  APR: ${rec.currentYield.best}\n`;
    report += `  Annual Return: ${rec.annualReturn.best}\n\n`;
    report += `GAIN: ${rec.annualReturn.additionalGain} (${rec.yieldImprovement})\n`;
    report += `\`\`\`\n\n`;

    report += `**🦸 Recommended Setup**\n`;
    report += `${rec.heroRecommendation}\n`;
    report += `${rec.petRecommendation}\n\n`;

    report += `**APR Breakdown:**\n`;
    report += `- Fee APR: ${rec.aprBreakdown.fee}\n`;
    report += `- Harvesting APR: ${rec.aprBreakdown.harvesting}\n`;
    report += `- Quest Boost Range: ${rec.aprBreakdown.questBoost}\n\n`;
    report += `---\n\n`;
  }

  return report;
}