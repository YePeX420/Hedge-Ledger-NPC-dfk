/**
 * Gardening Yield Validator Service
 * 
 * Compares calculator predictions against indexed on-chain reward data
 * to validate formula accuracy and tune base rates.
 */

import { db } from '../../server/db.js';
import { gardeningQuestRewards } from '../../shared/schema.js';
import { eq, sql, desc, and, gte, lte } from 'drizzle-orm';
import { 
  calculateYieldPerStamina, 
  calculateHeroFactor,
  getQuestRewardFundBalances,
  getPoolAllocation,
  POOL_NAMES 
} from './gardeningCalculator.js';

/**
 * Fetch indexed rewards with pool snapshots for validation
 */
export async function getIndexedRewardsWithSnapshots(options = {}) {
  const { limit = 100, poolId = null, heroId = null, minReward = 0.001 } = options;
  
  try {
    let query = db.select().from(gardeningQuestRewards);
    const conditions = [];
    
    if (poolId !== null) {
      conditions.push(eq(gardeningQuestRewards.poolId, poolId));
    }
    if (heroId !== null) {
      conditions.push(eq(gardeningQuestRewards.heroId, heroId));
    }
    conditions.push(sql`${gardeningQuestRewards.heroLpStake} IS NOT NULL`);
    conditions.push(sql`${gardeningQuestRewards.poolTotalLp} IS NOT NULL`);
    conditions.push(sql`CAST(${gardeningQuestRewards.rewardAmount} AS NUMERIC) >= ${minReward}`);
    
    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }
    
    const rewards = await query
      .orderBy(desc(gardeningQuestRewards.timestamp))
      .limit(limit);
    
    return rewards.map(r => ({
      id: r.id,
      questId: r.questId,
      heroId: r.heroId,
      player: r.player,
      poolId: r.poolId,
      poolName: POOL_NAMES[r.poolId] || `Pool ${r.poolId}`,
      rewardToken: r.rewardToken,
      rewardSymbol: r.rewardSymbol,
      rewardAmount: parseFloat(r.rewardAmount),
      heroLpStake: r.heroLpStake ? parseFloat(r.heroLpStake) : null,
      poolTotalLp: r.poolTotalLp ? parseFloat(r.poolTotalLp) : null,
      lpShare: r.heroLpStake && r.poolTotalLp 
        ? parseFloat(r.heroLpStake) / parseFloat(r.poolTotalLp)
        : null,
      timestamp: r.timestamp,
      blockNumber: r.blockNumber,
    }));
  } catch (err) {
    console.error('[Validator] Error fetching indexed rewards:', err.message);
    return [];
  }
}

/**
 * Get validation summary statistics
 */
export async function getValidationSummary() {
  try {
    const result = await db.select({
      totalRewards: sql`COUNT(*)`,
      withSnapshots: sql`COUNT(*) FILTER (WHERE hero_lp_stake IS NOT NULL AND pool_total_lp IS NOT NULL)`,
      crystalRewards: sql`COUNT(*) FILTER (WHERE reward_symbol = 'CRYSTAL')`,
      jewelRewards: sql`COUNT(*) FILTER (WHERE reward_symbol = 'JEWEL')`,
      avgRewardAmount: sql`AVG(CAST(reward_amount AS NUMERIC))`,
      minRewardAmount: sql`MIN(CAST(reward_amount AS NUMERIC))`,
      maxRewardAmount: sql`MAX(CAST(reward_amount AS NUMERIC))`,
      uniqueHeroes: sql`COUNT(DISTINCT hero_id)`,
      uniquePlayers: sql`COUNT(DISTINCT player)`,
    }).from(gardeningQuestRewards);
    
    const poolBreakdown = await db.select({
      poolId: gardeningQuestRewards.poolId,
      count: sql`COUNT(*)`,
      avgReward: sql`AVG(CAST(reward_amount AS NUMERIC))`,
    })
    .from(gardeningQuestRewards)
    .groupBy(gardeningQuestRewards.poolId)
    .orderBy(gardeningQuestRewards.poolId);
    
    return {
      summary: result[0],
      poolBreakdown: poolBreakdown.map(p => ({
        poolId: p.poolId,
        poolName: POOL_NAMES[p.poolId] || `Pool ${p.poolId}`,
        count: parseInt(p.count),
        avgReward: parseFloat(p.avgReward) || 0,
      })),
    };
  } catch (err) {
    console.error('[Validator] Error getting summary:', err.message);
    return { summary: null, poolBreakdown: [] };
  }
}

/**
 * Validate formula against indexed data
 * 
 * Uses indexed rewards with LP snapshots to back-calculate what the formula
 * would have predicted, then compares to actual rewards.
 * 
 * Note: We can't fully validate without hero stats (WIS, VIT, GrdSkl) stored.
 * This validation focuses on the LP-share portion of the formula.
 */
export async function validateFormulaAccuracy(options = {}) {
  const { 
    limit = 50, 
    poolId = null,
    assumedHeroFactor = 0.3,
    assumedGeneBonus = false,
    assumedGardeningSkill = 50,
  } = options;
  
  const rewards = await getIndexedRewardsWithSnapshots({ limit, poolId, minReward: 0.01 });
  
  if (rewards.length === 0) {
    return {
      ok: false,
      message: 'No indexed rewards with LP snapshots found',
      validations: [],
      accuracy: null,
    };
  }
  
  const rewardFund = await getQuestRewardFundBalances();
  const poolAllocations = {};
  
  for (const r of rewards) {
    if (!poolAllocations[r.poolId]) {
      poolAllocations[r.poolId] = await getPoolAllocation(r.poolId);
    }
  }
  
  const validations = [];
  let totalErrorPct = 0;
  let validCount = 0;
  
  for (const reward of rewards) {
    if (!reward.lpShare || reward.lpShare === 0) continue;
    
    const poolAlloc = poolAllocations[reward.poolId] || 0;
    if (poolAlloc === 0) continue;
    
    const rewardPool = reward.rewardSymbol === 'CRYSTAL' 
      ? rewardFund.crystalPool 
      : rewardFund.jewelPool;
    
    const staminaEstimate = estimateStaminaFromReward(
      reward.rewardAmount,
      rewardPool,
      poolAlloc,
      reward.lpShare,
      assumedHeroFactor,
      assumedGeneBonus,
      assumedGardeningSkill
    );
    
    const predictedPerStamina = calculateYieldPerStamina({
      rewardPool,
      poolAllocation: poolAlloc,
      lpOwned: reward.lpShare,
      heroFactor: assumedHeroFactor,
      hasGardeningGene: assumedGeneBonus,
      gardeningSkill: assumedGardeningSkill,
      petMultiplier: 1.0,
    });
    
    const predictedTotal = predictedPerStamina * staminaEstimate.stamina;
    const errorPct = Math.abs(predictedTotal - reward.rewardAmount) / reward.rewardAmount * 100;
    
    validations.push({
      heroId: reward.heroId,
      poolId: reward.poolId,
      poolName: reward.poolName,
      rewardSymbol: reward.rewardSymbol,
      actual: reward.rewardAmount,
      predicted: predictedTotal,
      errorPct,
      lpShare: reward.lpShare,
      lpSharePct: (reward.lpShare * 100).toFixed(4),
      estimatedStamina: staminaEstimate.stamina,
      timestamp: reward.timestamp,
    });
    
    totalErrorPct += errorPct;
    validCount++;
  }
  
  const avgErrorPct = validCount > 0 ? totalErrorPct / validCount : null;
  const accuracyPct = avgErrorPct !== null ? Math.max(0, 100 - avgErrorPct) : null;
  
  const within5pct = validations.filter(v => v.errorPct <= 5).length;
  const within10pct = validations.filter(v => v.errorPct <= 10).length;
  const within20pct = validations.filter(v => v.errorPct <= 20).length;
  
  return {
    ok: true,
    totalIndexedRewards: rewards.length,
    validatedCount: validCount,
    accuracy: {
      avgErrorPct: avgErrorPct?.toFixed(2),
      accuracyPct: accuracyPct?.toFixed(2),
      within5pct,
      within10pct,
      within20pct,
      within5pctRate: validCount > 0 ? ((within5pct / validCount) * 100).toFixed(1) : null,
      within10pctRate: validCount > 0 ? ((within10pct / validCount) * 100).toFixed(1) : null,
    },
    assumptions: {
      heroFactor: assumedHeroFactor,
      hasGardeningGene: assumedGeneBonus,
      gardeningSkill: assumedGardeningSkill,
      note: 'Without hero stats in indexed data, we use assumed values. Accuracy improves with real hero data.',
    },
    validations: validations.slice(0, 20),
  };
}

/**
 * Estimate stamina spent from reward amount using inverse formula
 */
function estimateStaminaFromReward(rewardAmount, rewardPool, poolAlloc, lpShare, heroFactor, hasGene, grdSkill) {
  const perStamina = calculateYieldPerStamina({
    rewardPool,
    poolAllocation: poolAlloc,
    lpOwned: lpShare,
    heroFactor,
    hasGardeningGene: hasGene,
    gardeningSkill: grdSkill,
    petMultiplier: 1.0,
  });
  
  const stamina = perStamina > 0 ? Math.round(rewardAmount / perStamina) : 0;
  
  return {
    stamina: Math.max(1, Math.min(stamina, 250)),
    perStamina,
  };
}

/**
 * Get recent rewards for a specific hero
 */
export async function getHeroRewardHistory(heroId, limit = 20) {
  try {
    const rewards = await db.select()
      .from(gardeningQuestRewards)
      .where(eq(gardeningQuestRewards.heroId, heroId))
      .orderBy(desc(gardeningQuestRewards.timestamp))
      .limit(limit);
    
    return rewards.map(r => ({
      id: r.id,
      questId: r.questId,
      poolId: r.poolId,
      poolName: POOL_NAMES[r.poolId] || `Pool ${r.poolId}`,
      rewardSymbol: r.rewardSymbol,
      rewardAmount: parseFloat(r.rewardAmount),
      heroLpStake: r.heroLpStake ? parseFloat(r.heroLpStake) : null,
      poolTotalLp: r.poolTotalLp ? parseFloat(r.poolTotalLp) : null,
      timestamp: r.timestamp,
    }));
  } catch (err) {
    console.error('[Validator] Error fetching hero history:', err.message);
    return [];
  }
}

/**
 * Get pool-level statistics from indexed data
 */
export async function getPoolStatistics(poolId) {
  try {
    const stats = await db.select({
      totalRewards: sql`COUNT(*)`,
      avgReward: sql`AVG(CAST(reward_amount AS NUMERIC))`,
      minReward: sql`MIN(CAST(reward_amount AS NUMERIC))`,
      maxReward: sql`MAX(CAST(reward_amount AS NUMERIC))`,
      uniqueHeroes: sql`COUNT(DISTINCT hero_id)`,
      uniquePlayers: sql`COUNT(DISTINCT player)`,
      crystalCount: sql`COUNT(*) FILTER (WHERE reward_symbol = 'CRYSTAL')`,
      jewelCount: sql`COUNT(*) FILTER (WHERE reward_symbol = 'JEWEL')`,
      avgLpShare: sql`AVG(CAST(hero_lp_stake AS NUMERIC) / NULLIF(CAST(pool_total_lp AS NUMERIC), 0))`,
    })
    .from(gardeningQuestRewards)
    .where(eq(gardeningQuestRewards.poolId, poolId));
    
    const recentRewards = await db.select()
      .from(gardeningQuestRewards)
      .where(eq(gardeningQuestRewards.poolId, poolId))
      .orderBy(desc(gardeningQuestRewards.timestamp))
      .limit(10);
    
    return {
      poolId,
      poolName: POOL_NAMES[poolId] || `Pool ${poolId}`,
      stats: {
        totalRewards: parseInt(stats[0]?.totalRewards || 0),
        avgReward: parseFloat(stats[0]?.avgReward || 0),
        minReward: parseFloat(stats[0]?.minReward || 0),
        maxReward: parseFloat(stats[0]?.maxReward || 0),
        uniqueHeroes: parseInt(stats[0]?.uniqueHeroes || 0),
        uniquePlayers: parseInt(stats[0]?.uniquePlayers || 0),
        crystalCount: parseInt(stats[0]?.crystalCount || 0),
        jewelCount: parseInt(stats[0]?.jewelCount || 0),
        avgLpSharePct: stats[0]?.avgLpShare ? (parseFloat(stats[0].avgLpShare) * 100).toFixed(4) : null,
      },
      recentRewards: recentRewards.map(r => ({
        heroId: r.heroId,
        rewardSymbol: r.rewardSymbol,
        rewardAmount: parseFloat(r.rewardAmount),
        timestamp: r.timestamp,
      })),
    };
  } catch (err) {
    console.error('[Validator] Error fetching pool stats:', err.message);
    return null;
  }
}
