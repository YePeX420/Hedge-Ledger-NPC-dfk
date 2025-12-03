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
import {
  averageQuestApr,
  buildGardenHeroProfile,
  findOptimalAttempts,
  simulateGardeningDailyYield,
} from './hero-yield-model.js';
// Price imports: Only used by generatePoolOptimizations (full optimization), not by detectWalletLPPositions (teaser).
// The slow 577-pair build is acceptable during full optimization since user has already paid.
import { getCrystalPrice, getJewelPrice } from './price-feed.js';
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

    // NOTE: This teaser path uses cached pool analytics for TVL/APR - no price fetches needed.
    // Price fetches are only used by generatePoolOptimizations for full optimization reports.

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

        // Daily yields are computed in generatePoolOptimizations with full price data
        // For the teaser, we just need TVL and APR from cached analytics
        poolData.daily = { jewel: 0, crystal: 0 };

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
 * Shows honest TVL status - approx value if available, or "still loading" if not
 */
export function formatLPPositionsSummary(positions) {
  if (!positions || positions.length === 0) {
    return 'No LP token positions found in your wallet.';
  }

  const poolList = positions.map((p) => p.pairName).join(', ');
  const totalValueNum = positions.reduce((acc, p) => {
    const val = parseFloat(p?.userTVL ?? '0');
    return Number.isFinite(val) ? acc + val : acc;
  }, 0);

  // Only show dollar value if we have meaningful TVL data (> $1)
  const hasValue = Number.isFinite(totalValueNum) && totalValueNum > 1;
  const valueStr = hasValue
    ? `(Approx. total value: $${totalValueNum.toFixed(0)})`
    : `(Detailed $ value is still loading — I'll include it in your optimization report.)`;

  return `I found ${positions.length} garden pool${
    positions.length > 1 ? 's' : ''
  }: **${poolList}** ${valueStr}`;
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
 * Generate hero/pet optimization recommendations for LP positions using real
 * gardening simulation (VIT/WIS + gardening skill + gene + stamina regen).
 *
 * Modes:
 * - hasLinkedWallet = true  → "Before" APR models current hero roster
 * - hasLinkedWallet = false → "Before" APR falls back to worst quest APR
 */
export async function generatePoolOptimizations(
  positions,
  heroes = [],
  options = {}
) {
  const { hasLinkedWallet = true } = options;
  const recommendations = [];

  const safePositions = Array.isArray(positions) ? positions : [];
  
  // Debug logging
  console.log(`[Opt] Starting optimization: positions=${safePositions.length}, heroes=${Array.isArray(heroes) ? heroes.length : 0}, hasLinkedWallet=${hasLinkedWallet}`);
  
  const priceData = await Promise.all([
    getJewelPrice().catch(() => 0),
    getCrystalPrice().catch(() => 0),
  ]);
  const jewelPrice = priceData[0] || 0;
  const crystalPrice = priceData[1] || 0;
  
  console.log(`[Opt] Prices: JEWEL=$${jewelPrice.toFixed(4)}, CRYSTAL=$${crystalPrice.toFixed(4)}`);

  const heroProfiles = (Array.isArray(heroes) ? heroes : [])
    .map((hero) => buildGardenHeroProfile(hero, {}, hero.heroMeta || {}))
    .sort((a, b) => b.gardenScore - a.gardenScore);
  
  console.log(`[Opt] Built ${heroProfiles.length} hero profiles for gardening`);

  for (const position of safePositions) {
    const { pairName, poolData, userTVL } = position;
    const { fee24hAPR, harvesting24hAPR, gardeningQuestAPR } = poolData || {};

    const feeAPR = parseAPR(fee24hAPR);
    const harvestingAPR = parseAPR(harvesting24hAPR);
    const { worst: worstQuestAPR, best: bestQuestAPR } =
      parseQuestAPRRange(gardeningQuestAPR);

    const baseAPR = feeAPR + harvestingAPR;

    const positionValue = (() => {
      const n = parseFloat(userTVL);
      return Number.isFinite(n) ? n : 0;
    })();

    // Per-pool logging
    console.log(`[Opt] Pool=${pairName}: TVL=$${positionValue.toFixed(2)}, feeAPR=${feeAPR.toFixed(2)}%, harvestAPR=${harvestingAPR.toFixed(2)}%, questAPR=${worstQuestAPR.toFixed(2)}-${bestQuestAPR.toFixed(2)}%`);

    const poolMeta = { gardeningQuestAPR: { best: `${bestQuestAPR}%` } };

    const currentHeroes = hasLinkedWallet
      ? heroProfiles.slice(0, 6)
      : [];

    const optimizedHeroes = heroProfiles.slice(0, 6);

    const defaultAttempts = 25;
    const beforeQuestAPR = currentHeroes.length
      ? averageQuestApr(currentHeroes, poolMeta, defaultAttempts)
      : worstQuestAPR;

    const bestAttempt = optimizedHeroes.length
      ? findOptimalAttempts({
          hero: optimizedHeroes[0].hero,
          heroMeta: optimizedHeroes[0].heroMeta,
          poolMeta,
        })
      : { attempts: defaultAttempts, eff: beforeQuestAPR };

    const afterQuestAPR = optimizedHeroes.length
      ? averageQuestApr(optimizedHeroes, poolMeta, bestAttempt.attempts)
      : bestQuestAPR;

    const beforeAPR = baseAPR + beforeQuestAPR;
    const afterAPR = baseAPR + afterQuestAPR;
    
    // Log improvement calculation
    const absGainAPR = afterAPR - beforeAPR;
    const annualGainUSD = positionValue * (absGainAPR / 100);
    console.log(`[Opt] Pool=${pairName}: beforeAPR=${beforeAPR.toFixed(2)}%, afterAPR=${afterAPR.toFixed(2)}%, gain=${absGainAPR.toFixed(2)}% (~$${annualGainUSD.toFixed(2)}/yr)`);

    const feeVsEmission = harvestingAPR === 0 ? Infinity : feeAPR / harvestingAPR;
    let poolType;
    let heroRecommendation;
    let petRecommendation;

    if (feeVsEmission > 2.0) {
      poolType = 'Fee-Dominant (Stable Passive Income)';
      heroRecommendation =
        'Any available hero works well. Focus on maximizing VIT/WIS plus gardening skill for consistent quest boosts.';
      petRecommendation =
        'Trading or fee-boosting pets are optimal. Gardening pets still add a small bonus.';
    } else if (feeVsEmission < 0.5) {
      poolType = 'Emission-Dominant (High Hero Boost Potential)';
      heroRecommendation =
        'Prioritize high VIT/WIS gardeners with strong gardening skill and the gardening gene. These stats directly amplify gardening rewards.';
      petRecommendation =
        'Gardening pets that boost CRYSTAL / JEWEL emissions are ideal. Look for pets with gardening yield bonuses or quest stamina reduction.';
    } else {
      poolType = 'Balanced (Fees + Emissions)';
      heroRecommendation =
        'Use mid to high level heroes with solid VIT/WIS, gardening skill, and (ideally) the gardening gene for steady boosts.';
      petRecommendation =
        'Either trading or gardening pets work. Gardening pets help push the upper end of the APR range.';
    }

    if (optimizedHeroes[0]) {
      const h = optimizedHeroes[0].hero;
      heroRecommendation += `\n\nTop gardener right now looks like **Hero #${
        h.normalizedId || h.id
      }** (Lvl ${h.level || 0}, Gardening ${((h.gardening || 0) / 10).toFixed(
        1
      )}, VIT ${h.vitality || 0}, WIS ${h.wisdom || 0}).`;
    }

    const safe = (n) => (Number.isFinite(n) ? n : 0);
    const currentYieldLow = safe(beforeAPR);
    const currentYieldHigh = safe(afterAPR);

    const absGain = currentYieldHigh - currentYieldLow;
    const relGain = currentYieldLow > 0.1
      ? ((currentYieldHigh - currentYieldLow) / currentYieldLow) * 100
      : absGain;

    const yieldImprovementLabel = currentYieldLow > 0.1
      ? `${safe(relGain).toFixed(1)}% vs current`
      : `${safe(absGain).toFixed(1)}% absolute`;

    const annualGainLow = safe(positionValue * (currentYieldLow / 100));
    const annualGainHigh = safe(positionValue * (currentYieldHigh / 100));

    const computeDailyTokens = (questApr) => {
      const annualQuestUsd = safe(positionValue * (questApr / 100));
      const dailyQuestUsd = annualQuestUsd / 365;
      const jewelPerDay = jewelPrice > 0 ? (dailyQuestUsd * 0.5) / jewelPrice : 0;
      const crystalPerDay = crystalPrice > 0 ? (dailyQuestUsd * 0.5) / crystalPrice : 0;
      return {
        jewel: jewelPerDay,
        crystal: crystalPerDay,
      };
    };

    const dailyBefore = computeDailyTokens(beforeQuestAPR);
    const dailyAfter = computeDailyTokens(afterQuestAPR);

    const attemptDelta = optimizedHeroes.length
      ? simulateGardeningDailyYield(
          {
            hero: optimizedHeroes[0].hero,
            heroMeta: optimizedHeroes[0].heroMeta,
            poolMeta,
          },
          bestAttempt.attempts
        )
      : null;

    recommendations.push({
      pairName,
      poolType,
      userTVL: positionValue.toFixed(2),
      currentYield: {
        worst: `${currentYieldLow.toFixed(2)}%`,
        best: `${currentYieldHigh.toFixed(2)}%`,
      },
      annualReturn: {
        worst: `$${annualGainLow.toFixed(2)}`,
        best: `$${annualGainHigh.toFixed(2)}`,
        additionalGain: `$${(annualGainHigh - annualGainLow).toFixed(2)}`,
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
            : 'N/A',
      },
      optimalAttempts: bestAttempt,
      beforeQuestAPR,
      afterQuestAPR,
      daily: {
        before: dailyBefore,
        after: dailyAfter,
      },
      iterationSeconds: attemptDelta?.iterationSeconds || null,
    });
    
    console.log(`[Opt] ✓ Added recommendation for ${pairName}`);
  }

  console.log(`[Opt] COMPLETE: Generated ${recommendations.length} recommendations for ${safePositions.length} positions`);
  
  return {
    positions: safePositions.length,
    totalValueUSD: (() => {
      const sum = safePositions.reduce((acc, p) => {
        const val = parseFloat(p?.userTVL ?? '0');
        return Number.isFinite(val) ? acc + val : acc;
      }, 0);
      return Number.isFinite(sum) ? sum.toFixed(2) : '0.00';
    })(),
    recommendations,
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
    const dailyBefore = rec?.daily?.before;
    const dailyAfter = rec?.daily?.after;

    report += `### ${rec.pairName || 'Unknown Pool'}\n`;
    report += `**Pool Type:** ${rec.poolType || 'N/A'} | **Your Position:** $${rec.userTVL ?? '0.00'}\n\n`;

    report += `**📈 Before vs After**\n`;
    report += `\`\`\`\n`;
    report += `BEFORE (Current gardening setup):\n`;
    report += `  APR: ${currentYield.worst ?? 'N/A'}\n`;
    report += `  Annual Return: ${annualReturn.worst ?? 'N/A'}\n`;
    if (dailyBefore) {
      report += `  Tokens/day: ${dailyBefore.jewel?.toFixed?.(2) ?? '0.00'} JEWEL, ${
        dailyBefore.crystal?.toFixed?.(2) ?? '0.00'
      } CRYSTAL\n\n`;
    } else {
      report += `\n`;
    }
    report += `AFTER (Optimized heroes + pets):\n`;
    report += `  APR: ${currentYield.best ?? 'N/A'}\n`;
    report += `  Annual Return: ${annualReturn.best ?? 'N/A'}\n`;
    if (dailyAfter) {
      report += `  Tokens/day: ${dailyAfter.jewel?.toFixed?.(2) ?? '0.00'} JEWEL, ${
        dailyAfter.crystal?.toFixed?.(2) ?? '0.00'
      } CRYSTAL\n\n`;
    } else {
      report += `\n`;
    }
    const gain = rec?.annualReturn?.additionalGain ?? '$0.00';
    report += `GAIN: ${gain}/year (${rec.yieldImprovement || ''})\n`;
    report += `\`\`\`\n\n`;

    report += `**🦸 Recommended Setup**\n`;
    report += `${rec.heroRecommendation || 'No hero recommendation available.'}\n`;
    report += `${rec.petRecommendation || 'No pet recommendation available.'}\n\n`;

    report += `**APR Breakdown:**\n`;
    report += `- Fee APR: ${aprBreakdown.fee ?? 'N/A'}\n`;
    report += `- Harvesting APR: ${aprBreakdown.harvesting ?? 'N/A'}\n`;
    report += `- Quest Boost Range: ${aprBreakdown.questBoost ?? 'N/A'}\n\n`;
    if (rec?.optimalAttempts?.attempts) {
      report += `- Optimal attempts/run: ${rec.optimalAttempts.attempts} (vs 25 baseline)\n`;
    }
    report += `---\n\n`;
  }

  return report;
}