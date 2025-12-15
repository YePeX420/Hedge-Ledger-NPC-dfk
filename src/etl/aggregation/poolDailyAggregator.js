import { db } from '../../../server/db.js';
import { poolSwapEvents, poolRewardEvents, poolDailyAggregates } from '../../../shared/schema.js';
import { eq, and, sql, gte, lt } from 'drizzle-orm';
import { ethers } from 'ethers';

const DFK_CHAIN_RPC = 'https://subnets.avax.network/defi-kingdoms/dfk-chain/rpc';
const MASTER_GARDENER_V2 = '0xB04e8D6aED037904B77A9F0b08002592925833b7';

const LP_STAKING_ABI = [
  'function getPoolInfo(uint256 pid) view returns (address lpToken, uint256 allocPoint, uint256 lastRewardBlock, uint256 accRewardPerShare, uint256 totalStaked)',
];

const LP_PAIR_ABI = [
  'function token0() view returns (address)',
  'function token1() view returns (address)',
  'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
  'function totalSupply() view returns (uint256)',
];

let providerInstance = null;
let stakingContractInstance = null;

function getProvider() {
  if (!providerInstance) {
    providerInstance = new ethers.JsonRpcProvider(DFK_CHAIN_RPC);
  }
  return providerInstance;
}

function getStakingContract() {
  if (!stakingContractInstance) {
    stakingContractInstance = new ethers.Contract(MASTER_GARDENER_V2, LP_STAKING_ABI, getProvider());
  }
  return stakingContractInstance;
}

function get8pmEtCutoff(date = new Date()) {
  const dateStr = date.toISOString().split('T')[0];
  const etTime = new Date(`${dateStr}T20:00:00`);
  const isDst = isEasternDst(date);
  const offsetHours = isDst ? 4 : 5;
  const utcTime = new Date(etTime.getTime() + offsetHours * 60 * 60 * 1000);
  return utcTime;
}

function isEasternDst(date) {
  const year = date.getFullYear();
  const marchSecondSunday = new Date(year, 2, 1);
  while (marchSecondSunday.getDay() !== 0) {
    marchSecondSunday.setDate(marchSecondSunday.getDate() + 1);
  }
  marchSecondSunday.setDate(marchSecondSunday.getDate() + 7);
  const novemberFirstSunday = new Date(year, 10, 1);
  while (novemberFirstSunday.getDay() !== 0) {
    novemberFirstSunday.setDate(novemberFirstSunday.getDate() + 1);
  }
  return date >= marchSecondSunday && date < novemberFirstSunday;
}

function getDateForCutoff(cutoffTime) {
  const dayBefore = new Date(cutoffTime.getTime() - 12 * 60 * 60 * 1000);
  return dayBefore.toISOString().split('T')[0];
}

export async function computeDailyAggregate(pid, dateStr = null) {
  const now = new Date();
  const targetDate = dateStr || getDateForCutoff(get8pmEtCutoff(now));
  
  const endCutoff = get8pmEtCutoff(new Date(targetDate));
  const startCutoff = new Date(endCutoff.getTime() - 24 * 60 * 60 * 1000);
  
  console.log(`[DailyAggregator] Computing aggregate for pool ${pid} on ${targetDate}`);
  console.log(`[DailyAggregator] Period: ${startCutoff.toISOString()} to ${endCutoff.toISOString()}`);
  
  const swapStats = await db.select({
    count: sql`count(*)::int`,
    totalAmount0In: sql`COALESCE(SUM(${poolSwapEvents.amount0In}::numeric), 0)::text`,
    totalAmount1In: sql`COALESCE(SUM(${poolSwapEvents.amount1In}::numeric), 0)::text`,
    totalAmount0Out: sql`COALESCE(SUM(${poolSwapEvents.amount0Out}::numeric), 0)::text`,
    totalAmount1Out: sql`COALESCE(SUM(${poolSwapEvents.amount1Out}::numeric), 0)::text`,
  })
    .from(poolSwapEvents)
    .where(and(
      eq(poolSwapEvents.pid, pid),
      gte(poolSwapEvents.timestamp, startCutoff),
      lt(poolSwapEvents.timestamp, endCutoff)
    ));
  
  const rewardStats = await db.select({
    count: sql`count(*)::int`,
    totalRewards: sql`COALESCE(SUM(${poolRewardEvents.rewardAmount}::numeric), 0)::text`,
  })
    .from(poolRewardEvents)
    .where(and(
      eq(poolRewardEvents.pid, pid),
      gte(poolRewardEvents.timestamp, startCutoff),
      lt(poolRewardEvents.timestamp, endCutoff)
    ));
  
  const totalAmount0 = parseFloat(swapStats[0].totalAmount0In) + parseFloat(swapStats[0].totalAmount0Out);
  const totalAmount1 = parseFloat(swapStats[0].totalAmount1In) + parseFloat(swapStats[0].totalAmount1Out);
  const volumeEstimate = totalAmount0 + totalAmount1;
  const fees = volumeEstimate * 0.003;
  const rewards24h = rewardStats[0].totalRewards || '0';
  
  let tvl = 0;
  let stakedLp = '0';
  try {
    const contract = getStakingContract();
    const poolInfo = await contract.getPoolInfo(pid);
    const lpAddress = poolInfo.lpToken;
    stakedLp = ethers.formatEther(poolInfo.totalStaked);
    
    const lpContract = new ethers.Contract(lpAddress, LP_PAIR_ABI, getProvider());
    const [reserves, totalSupply] = await Promise.all([
      lpContract.getReserves(),
      lpContract.totalSupply(),
    ]);
    
    const reserve0 = parseFloat(ethers.formatEther(reserves[0]));
    const reserve1 = parseFloat(ethers.formatEther(reserves[1]));
    const totalSupplyFloat = parseFloat(ethers.formatEther(totalSupply));
    const stakedFloat = parseFloat(stakedLp);
    
    if (totalSupplyFloat > 0) {
      const lpRatio = stakedFloat / totalSupplyFloat;
      tvl = (reserve0 + reserve1) * lpRatio * 2;
    }
  } catch (err) {
    console.error(`[DailyAggregator] Error fetching TVL for pool ${pid}:`, err.message);
  }
  
  let feeApr = 0;
  let harvestApr = 0;
  if (tvl > 0) {
    feeApr = (fees / tvl) * 365 * 100;
    const crystalPrice = 0.05;
    const rewardsUsd = parseFloat(rewards24h) * crystalPrice;
    harvestApr = (rewardsUsd / tvl) * 365 * 100;
  }
  const totalApr = feeApr + harvestApr;
  
  const aggregateData = {
    pid,
    date: targetDate,
    volume24h: volumeEstimate.toFixed(2),
    fees24h: fees.toFixed(2),
    rewards24h,
    rewardsUsd24h: (parseFloat(rewards24h) * 0.05).toFixed(2),
    tvl: tvl.toFixed(2),
    stakedLp,
    feeApr: feeApr.toFixed(4),
    harvestApr: harvestApr.toFixed(4),
    totalApr: totalApr.toFixed(4),
    swapCount24h: swapStats[0].count || 0,
    rewardEventCount24h: rewardStats[0].count || 0,
  };
  
  await db.insert(poolDailyAggregates)
    .values(aggregateData)
    .onConflictDoUpdate({
      target: [poolDailyAggregates.pid, poolDailyAggregates.date],
      set: {
        volume24h: aggregateData.volume24h,
        fees24h: aggregateData.fees24h,
        rewards24h: aggregateData.rewards24h,
        rewardsUsd24h: aggregateData.rewardsUsd24h,
        tvl: aggregateData.tvl,
        stakedLp: aggregateData.stakedLp,
        feeApr: aggregateData.feeApr,
        harvestApr: aggregateData.harvestApr,
        totalApr: aggregateData.totalApr,
        swapCount24h: aggregateData.swapCount24h,
        rewardEventCount24h: aggregateData.rewardEventCount24h,
        updatedAt: new Date(),
      },
    });
  
  console.log(`[DailyAggregator] Pool ${pid} ${targetDate}: TVL=$${tvl.toFixed(2)}, Fees=$${fees.toFixed(2)}, APR=${totalApr.toFixed(2)}%`);
  
  return aggregateData;
}

export async function computeAllPoolAggregates(dateStr = null) {
  const poolIds = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
  const results = [];
  
  for (const pid of poolIds) {
    try {
      const result = await computeDailyAggregate(pid, dateStr);
      results.push(result);
    } catch (err) {
      console.error(`[DailyAggregator] Error computing aggregate for pool ${pid}:`, err.message);
      results.push({ pid, error: err.message });
    }
    await new Promise(r => setTimeout(r, 100));
  }
  
  return results;
}

export async function getLatestAggregate(pid) {
  const [latest] = await db.select()
    .from(poolDailyAggregates)
    .where(eq(poolDailyAggregates.pid, pid))
    .orderBy(sql`${poolDailyAggregates.date} DESC`)
    .limit(1);
  return latest;
}

export async function getAggregateHistory(pid, days = 30) {
  return db.select()
    .from(poolDailyAggregates)
    .where(eq(poolDailyAggregates.pid, pid))
    .orderBy(sql`${poolDailyAggregates.date} DESC`)
    .limit(days);
}

export async function getAllLatestAggregates() {
  const subquery = db.select({
    pid: poolDailyAggregates.pid,
    maxDate: sql`MAX(${poolDailyAggregates.date})`.as('max_date'),
  })
    .from(poolDailyAggregates)
    .groupBy(poolDailyAggregates.pid)
    .as('latest');
  
  return db.select()
    .from(poolDailyAggregates)
    .innerJoin(subquery, and(
      eq(poolDailyAggregates.pid, subquery.pid),
      eq(poolDailyAggregates.date, subquery.maxDate)
    ))
    .orderBy(poolDailyAggregates.pid);
}

let aggregationSchedule = null;

export function startDailyAggregationSchedule() {
  if (aggregationSchedule) {
    console.log('[DailyAggregator] Schedule already running');
    return { status: 'already_running' };
  }
  
  const runAggregation = async () => {
    const now = new Date();
    console.log(`[DailyAggregator] Running scheduled aggregation at ${now.toISOString()}`);
    try {
      await computeAllPoolAggregates();
      console.log('[DailyAggregator] Scheduled aggregation complete');
    } catch (err) {
      console.error('[DailyAggregator] Scheduled aggregation error:', err.message);
    }
  };
  
  aggregationSchedule = setInterval(runAggregation, 24 * 60 * 60 * 1000);
  
  const now = new Date();
  const nextCutoff = get8pmEtCutoff(now);
  if (nextCutoff <= now) {
    nextCutoff.setDate(nextCutoff.getDate() + 1);
  }
  const msUntilCutoff = nextCutoff.getTime() - now.getTime();
  
  setTimeout(() => {
    runAggregation();
    aggregationSchedule = setInterval(runAggregation, 24 * 60 * 60 * 1000);
  }, msUntilCutoff);
  
  console.log(`[DailyAggregator] Schedule started. Next run at ${nextCutoff.toISOString()}`);
  return { status: 'started', nextRunAt: nextCutoff.toISOString() };
}

export function stopDailyAggregationSchedule() {
  if (aggregationSchedule) {
    clearInterval(aggregationSchedule);
    aggregationSchedule = null;
    console.log('[DailyAggregator] Schedule stopped');
    return { status: 'stopped' };
  }
  return { status: 'not_running' };
}
