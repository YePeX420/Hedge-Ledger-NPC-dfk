/**
 * apr-utils.js - Centralized APR calculation utilities for DeFi Kingdoms gardens
 * 
 * This module provides consistent, documented APR calculations for:
 * - Fee APR: From DEX swap fees (0.20% LP share of 0.30% total fee)
 * - Harvest APR: Emissions + 10% power-token LP staking rewards
 * 
 * Fee Distribution (DFK Swap Fees):
 *   Total swap fee: 0.30%
 *   - 0.20% → LP providers (used in Fee APR)
 *   - 0.10% → Jeweler/Quest/Dev/Burn split
 * 
 * Power Token Fee Distribution:
 *   - 15% → Burned
 *   - 10% → LP Staking Rewards (boosts Harvest APR)
 *   - 15% → Jeweler Rewards
 *   - 30% → Quest Reward Fund
 *   - 30% → Dev Fund
 */

/**
 * LP share of swap fees (0.20% of the 0.30% total swap fee)
 */
const LP_FEE_RATE = 0.002;

/**
 * Computes the fee APR for liquidity providers from swap fees.
 * Uses 0.20% LP share of swap fees, not the full 0.30% total fee.
 *
 * Formula:
 *   userFees24h  = volume24hUsd * 0.002 * (userTvlUsd / poolTvlUsd)
 *   aprUser      = userFees24h * 365 / userTvlUsd
 * 
 * Which simplifies to:
 *   aprPool = volume24hUsd * 0.002 * 365 / poolTvlUsd
 *
 * @param {Object} params
 * @param {number} params.volume24hUsd - 24h swap volume for this pool in USD
 * @param {number} params.poolTvlUsd - Pool TVL in USD (staked liquidity)
 * @returns {number} Fee APR as a percentage (e.g., 5.5 means 5.5%)
 */
export function computeFeeAprPct({ volume24hUsd, poolTvlUsd }) {
  if (!poolTvlUsd || poolTvlUsd <= 0 || !volume24hUsd || volume24hUsd <= 0) {
    return 0;
  }

  const apr = (volume24hUsd * LP_FEE_RATE * 365) / poolTvlUsd;
  return apr * 100;
}

/**
 * Computes fee APR with additional debug information including pool share.
 * Useful for debug tools and detailed breakdowns.
 *
 * @param {Object} params
 * @param {number} params.volume24hUsd - 24h swap volume for this pool in USD
 * @param {number} params.poolTvlUsd - Pool TVL in USD (staked liquidity)
 * @param {number} [params.userTvlUsd] - Optional: user's position value in USD
 * @returns {Object} { poolAprPct, userAprPct, share, fees24hUsd, userFees24hUsd }
 */
export function computeFeeAprWithShare({ volume24hUsd, poolTvlUsd, userTvlUsd }) {
  const poolAprPct = computeFeeAprPct({ volume24hUsd, poolTvlUsd });
  
  const share = userTvlUsd && poolTvlUsd > 0 ? userTvlUsd / poolTvlUsd : undefined;
  const fees24hUsd = volume24hUsd > 0 ? volume24hUsd * LP_FEE_RATE : 0;
  const userFees24hUsd = share !== undefined ? fees24hUsd * share : undefined;
  
  return {
    poolAprPct,
    userAprPct: poolAprPct,
    share,
    fees24hUsd,
    userFees24hUsd,
    lpFeeRate: LP_FEE_RATE,
    lpFeeRatePct: LP_FEE_RATE * 100
  };
}

/**
 * Returns the harvest APR from analytics.
 * 
 * Harvest APR includes:
 * - CRYSTAL/JADE block/epoch emissions
 * - 10% of power-token in-game fees routed to LP staking rewards
 * 
 * We treat analytics as the source of truth and don't re-derive the 10% split.
 *
 * @param {Object} params
 * @param {number} [params.harvestAprPctFromAnalytics] - Harvest APR from garden-analytics
 * @returns {number} Harvest APR as a percentage
 */
export function getHarvestAprPct({ harvestAprPctFromAnalytics }) {
  if (!harvestAprPctFromAnalytics || !Number.isFinite(harvestAprPctFromAnalytics)) {
    return 0;
  }
  return harvestAprPctFromAnalytics;
}

/**
 * Computes total base APR (Fee + Harvest, no questing).
 *
 * @param {Object} params
 * @param {number} params.feeAprPct - Fee APR percentage
 * @param {number} params.harvestAprPct - Harvest APR percentage
 * @returns {number} Total base APR as a percentage
 */
export function computeTotalBaseAprPct({ feeAprPct, harvestAprPct }) {
  return (feeAprPct || 0) + (harvestAprPct || 0);
}

/**
 * Formats APR debug output for a pool.
 * Used by debug commands to provide transparent, traceable math.
 *
 * @param {Object} params
 * @param {string} params.poolName - Pool name (e.g., "CRYSTAL-WJEWEL")
 * @param {number} params.volume24hUsd - 24h volume in USD
 * @param {number} params.poolTvlUsd - Pool TVL in USD
 * @param {number} [params.userTvlUsd] - User's position in USD (optional)
 * @param {number} params.harvestAprPct - Harvest APR from analytics
 * @returns {string} Formatted debug output
 */
export function formatAprDebugOutput({ poolName, volume24hUsd, poolTvlUsd, userTvlUsd, harvestAprPct }) {
  const feeData = computeFeeAprWithShare({ volume24hUsd, poolTvlUsd, userTvlUsd });
  const totalBaseApr = computeTotalBaseAprPct({ 
    feeAprPct: feeData.poolAprPct, 
    harvestAprPct 
  });
  
  let output = [];
  output.push('--- Garden APR Debug ---');
  output.push(`Pool: ${poolName}`);
  output.push(`24h Volume (USD): $${volume24hUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  output.push(`Pool TVL (USD):   $${poolTvlUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  
  if (userTvlUsd !== undefined) {
    output.push(`Your TVL (USD):   $${userTvlUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    if (feeData.share !== undefined) {
      output.push(`Your pool share:  ${(feeData.share * 100).toFixed(6)}%`);
    }
  }
  
  output.push('');
  output.push('Fee APR (LP share only, 0.20% of swaps):');
  output.push(`  Daily fees to LPs: $${feeData.fees24hUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
  output.push(`  Fee APR (pool-level): ${feeData.poolAprPct.toFixed(4)}%`);
  
  output.push('');
  output.push('Harvest APR (emissions + 10% power-token LP staking rewards):');
  output.push(`  Harvest APR: ${harvestAprPct.toFixed(4)}%`);
  
  output.push('');
  output.push('Total Base APR (Fee + Harvest, no questing):');
  output.push(`  Total Base APR: ${totalBaseApr.toFixed(4)}%`);
  
  return output.join('\n');
}

/**
 * Get fee distribution explanation text.
 * Useful for educational displays.
 */
export function getFeeDistributionExplanation() {
  return `
DFK Fee Distribution:

Swap Fee (0.30% total):
  • 0.20% → LP Providers (used in Fee APR)
  • 0.10% → Jeweler/Quest/Dev/Burn

Power Token In-Game Fees:
  • 15% → Burned
  • 10% → LP Staking Rewards (boosts Harvest APR)
  • 15% → Jeweler Rewards
  • 30% → Quest Reward Fund
  • 30% → Dev Fund
`.trim();
}

export default {
  computeFeeAprPct,
  computeFeeAprWithShare,
  getHarvestAprPct,
  computeTotalBaseAprPct,
  formatAprDebugOutput,
  getFeeDistributionExplanation,
  LP_FEE_RATE
};
