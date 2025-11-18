import { ethers } from 'ethers';
import lpStakingABI from './LPStakingDiamond.json' with { type: 'json' };
import uniswapPairABI from './UniswapV2Pair.json' with { type: 'json' };
import uniswapFactoryABI from './UniswapV2Factory.json' with { type: 'json' };
import erc20ABI from './ERC20.json' with { type: 'json' };
import questCoreABI from './QuestCoreV3.json' with { type: 'json' };

// DFK Chain configuration
const DFK_CHAIN_RPC = 'https://subnets.avax.network/defi-kingdoms/dfk-chain/rpc';
const LP_STAKING_ADDRESS = '0xB04e8D6aED037904B77A9F0b08002592925833b7';
const QUEST_CORE_V3_ADDRESS = '0x530fff22987E137e7C8D2aDcC4c15eb45b4FA752';
const UNISWAP_V2_FACTORY = '0x794C07912474351b3134E6D6B3B7b3b4A07cbAAa';
const USDC_ADDRESS = '0x3AD9DFE640E1A9Cc1D9B0948620820D975c3803a'; // USDC.e on DFK Chain
const BLOCKS_PER_DAY = 43200; // ~2 second blocks
const FEE_RATE = 0.0025; // 0.25% swap fee

const provider = new ethers.JsonRpcProvider(DFK_CHAIN_RPC);
const stakingContract = new ethers.Contract(LP_STAKING_ADDRESS, lpStakingABI, provider);
const questCoreContract = new ethers.Contract(QUEST_CORE_V3_ADDRESS, questCoreABI, provider);
const factoryContract = new ethers.Contract(UNISWAP_V2_FACTORY, uniswapFactoryABI, provider);

// Export for use in bot.js when building shared data
export { stakingContract, questCoreContract };

/**
 * Find first block whose timestamp is >= targetTimestamp
 */
async function findBlockAtOrAfter(targetTimestamp, latestBlock) {
  let low = 0;
  let high = latestBlock;
  let result = latestBlock;
  
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    try {
      const block = await provider.getBlock(mid);
      if (!block) {
        high = mid - 1;
        continue;
      }
      
      if (block.timestamp >= targetTimestamp) {
        result = mid;
        high = mid - 1; // Continue searching for earlier block
      } else {
        low = mid + 1;
      }
    } catch (err) {
      high = mid - 1;
    }
  }
  
  return result;
}

/**
 * Find last block whose timestamp is <= targetTimestamp
 */
async function findBlockAtOrBefore(targetTimestamp, latestBlock) {
  let low = 0;
  let high = latestBlock;
  let result = 0;
  
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    try {
      const block = await provider.getBlock(mid);
      if (!block) {
        high = mid - 1;
        continue;
      }
      
      if (block.timestamp <= targetTimestamp) {
        result = mid;
        low = mid + 1; // Continue searching for later block
      } else {
        high = mid - 1;
      }
    } catch (err) {
      high = mid - 1;
    }
  }
  
  return result;
}

/**
 * Get block range for previous UTC day (00:00:00 - 23:59:59 yesterday)
 */
export async function getPreviousUTCDayBlockRange() {
  try {
    const latestBlock = await provider.getBlockNumber();
    const latestBlockData = await provider.getBlock(latestBlock);
    const currentTimestamp = latestBlockData.timestamp;
    
    // Get previous UTC day boundaries
    const currentDate = new Date(currentTimestamp * 1000);
    const currentUTCDate = new Date(Date.UTC(
      currentDate.getUTCFullYear(),
      currentDate.getUTCMonth(),
      currentDate.getUTCDate()
    ));
    
    // Previous day start: yesterday at 00:00:00 UTC
    const previousDayStart = new Date(currentUTCDate);
    previousDayStart.setUTCDate(previousDayStart.getUTCDate() - 1);
    const startTimestamp = Math.floor(previousDayStart.getTime() / 1000);
    
    // Previous day end: yesterday at 23:59:59 UTC
    const previousDayEnd = new Date(currentUTCDate);
    previousDayEnd.setUTCSeconds(previousDayEnd.getUTCSeconds() - 1);
    const endTimestamp = Math.floor(previousDayEnd.getTime() / 1000);
    
    // Find corresponding blocks
    // fromBlock: First block at or after 00:00:00 UTC yesterday
    // toBlock: Last block at or before 23:59:59 UTC yesterday
    const fromBlock = await findBlockAtOrAfter(startTimestamp, latestBlock);
    const toBlock = await findBlockAtOrBefore(endTimestamp, latestBlock);
    
    console.log(`Previous UTC day: ${previousDayStart.toISOString()} to ${previousDayEnd.toISOString()}`);
    console.log(`Block range: ${fromBlock} to ${toBlock} (${toBlock - fromBlock} blocks)`);
    
    return { fromBlock, toBlock, startTimestamp, endTimestamp };
  } catch (err) {
    console.error('Error calculating UTC day block range:', err.message);
    // Fallback to rolling 24h
    const currentBlock = await provider.getBlockNumber();
    return {
      fromBlock: currentBlock - BLOCKS_PER_DAY,
      toBlock: currentBlock,
      startTimestamp: null,
      endTimestamp: null
    };
  }
}

/**
 * Enumerate all LP pairs from UniswapV2Factory
 */
export async function enumerateAllPairs() {
  try {
    const pairsLength = await factoryContract.allPairsLength();
    const pairs = [];
    
    console.log(`Enumerating ${pairsLength} LP pairs from factory...`);
    
    for (let i = 0; i < pairsLength; i++) {
      try {
        const pairAddress = await factoryContract.allPairs(i);
        pairs.push(pairAddress);
      } catch (err) {
        console.error(`Error fetching pair ${i}:`, err.message);
      }
    }
    
    return pairs;
  } catch (err) {
    console.error('Error enumerating pairs from factory:', err.message);
    return [];
  }
}

/**
 * Discover all pools from staking contract
 */
export async function discoverPools() {
  const poolLength = await stakingContract.getPoolLength();
  const pools = [];
  
  for (let pid = 0; pid < poolLength; pid++) {
    try {
      const poolInfo = await stakingContract.getPoolInfo(pid);
      pools.push({
        pid,
        lpToken: poolInfo.lpToken,
        allocPoint: poolInfo.allocPoint,
        totalStaked: poolInfo.totalStaked,
        lastRewardBlock: poolInfo.lastRewardBlock,
        accRewardPerShare: poolInfo.accRewardPerShare
      });
    } catch (err) {
      console.error(`Error fetching pool ${pid}:`, err.message);
    }
  }
  
  return pools;
}

/**
 * Get LP token details (token0, token1, reserves, totalSupply)
 */
export async function getLPTokenDetails(lpAddress) {
  const lpContract = new ethers.Contract(lpAddress, uniswapPairABI, provider);
  
  const [token0Address, token1Address, reserves, totalSupply] = await Promise.all([
    lpContract.token0(),
    lpContract.token1(),
    lpContract.getReserves(),
    lpContract.totalSupply()
  ]);
  
  // Get token metadata
  const token0Contract = new ethers.Contract(token0Address, erc20ABI, provider);
  const token1Contract = new ethers.Contract(token1Address, erc20ABI, provider);
  
  const [symbol0, symbol1, decimals0, decimals1] = await Promise.all([
    token0Contract.symbol().catch(() => 'UNKNOWN'),
    token1Contract.symbol().catch(() => 'UNKNOWN'),
    token0Contract.decimals().catch(() => 18),
    token1Contract.decimals().catch(() => 18)
  ]);
  
  return {
    token0: {
      address: token0Address,
      symbol: symbol0,
      decimals: decimals0
    },
    token1: {
      address: token1Address,
      symbol: symbol1,
      decimals: decimals1
    },
    reserve0: reserves.reserve0,
    reserve1: reserves.reserve1,
    totalSupply,
    pairName: `${symbol0}-${symbol1}`
  };
}

/**
 * Build on-chain price graph using BFS from USDC anchor
 * Enumerates ALL LP pairs from factory for accurate pricing
 */
export async function buildPriceGraph() {
  const priceGraph = new Map(); // token address -> USD price
  const edges = new Map(); // token -> [{partner, rate}]
  
  // Set USDC anchor price
  priceGraph.set(USDC_ADDRESS.toLowerCase(), 1.0);
  
  // Enumerate all LP pairs from factory
  const allPairs = await enumerateAllPairs();
  
  console.log(`Building price graph from ${allPairs.length} LP pairs...`);
  
  // Build edges from ALL LP pairs (not just staked ones)
  for (const pairAddress of allPairs) {
    try {
      const details = await getLPTokenDetails(pairAddress);
      const token0 = details.token0.address.toLowerCase();
      const token1 = details.token1.address.toLowerCase();
      
      // Calculate exchange rates (price propagation)
      // In a constant product AMM: if we know token0 price, token1 price = token0 price * (reserve0 / reserve1)
      // This is because: 1 token1 = (reserve0 / reserve1) token0
      const reserve0Float = parseFloat(ethers.formatUnits(details.reserve0, details.token0.decimals));
      const reserve1Float = parseFloat(ethers.formatUnits(details.reserve1, details.token1.decimals));
      
      if (reserve0Float === 0 || reserve1Float === 0) continue;
      
      // Price multiplier when propagating from token0 to token1
      const rate01 = reserve0Float / reserve1Float; // token1Price = token0Price * rate01
      // Price multiplier when propagating from token1 to token0  
      const rate10 = reserve1Float / reserve0Float; // token0Price = token1Price * rate10
      
      // Add bidirectional edges
      if (!edges.has(token0)) edges.set(token0, []);
      if (!edges.has(token1)) edges.set(token1, []);
      
      edges.get(token0).push({ partner: token1, rate: rate01 });
      edges.get(token1).push({ partner: token0, rate: rate10 });
    } catch (err) {
      // Skip pairs with errors (likely invalid or deprecated pairs)
      continue;
    }
  }
  
  // BFS to propagate prices from USDC
  const queue = [USDC_ADDRESS.toLowerCase()];
  const visited = new Set([USDC_ADDRESS.toLowerCase()]);
  
  while (queue.length > 0) {
    const current = queue.shift();
    const currentPrice = priceGraph.get(current);
    
    const neighbors = edges.get(current) || [];
    for (const { partner, rate } of neighbors) {
      if (!visited.has(partner)) {
        visited.add(partner);
        priceGraph.set(partner, currentPrice * rate);
        queue.push(partner);
      }
    }
  }
  
  console.log(`Price graph built: ${priceGraph.size} tokens priced`);
  
  return priceGraph;
}

/**
 * Helper function to chunk large block ranges into smaller segments
 * RPC has a 2048-block limit for event queries
 */
async function queryEventsInChunks(contract, filter, fromBlock, toBlock, maxChunkSize = 2048) {
  const allEvents = [];
  const totalBlocks = toBlock - fromBlock;
  
  // If range is within limit, query directly
  if (totalBlocks <= maxChunkSize) {
    return await contract.queryFilter(filter, fromBlock, toBlock);
  }
  
  // Otherwise, chunk the queries
  for (let start = fromBlock; start <= toBlock; start += maxChunkSize) {
    const end = Math.min(start + maxChunkSize - 1, toBlock);
    try {
      const events = await contract.queryFilter(filter, start, end);
      allEvents.push(...events);
    } catch (err) {
      console.error(`Error querying events from ${start} to ${end}:`, err.message);
    }
  }
  
  return allEvents;
}

/**
 * Calculate 24h fee APR from Swap events (previous UTC day)
 */
export async function calculate24hFeeAPR(lpAddress, lpDetails, priceGraph, stakedLiquidity, blockRange = null) {
  try {
    // Use provided block range (previous UTC day) or calculate fresh
    const range = blockRange || await getPreviousUTCDayBlockRange();
    const { fromBlock, toBlock } = range;
    
    const lpContract = new ethers.Contract(lpAddress, uniswapPairABI, provider);
    
    // Get Swap events from previous UTC day (chunked to avoid RPC limit)
    const swapEvents = await queryEventsInChunks(
      lpContract,
      lpContract.filters.Swap(),
      fromBlock,
      toBlock
    );
    
    // Calculate total volume in USD
    let totalVolumeUSD = 0;
    
    const token0Price = priceGraph.get(lpDetails.token0.address.toLowerCase()) || 0;
    const token1Price = priceGraph.get(lpDetails.token1.address.toLowerCase()) || 0;
    
    for (const event of swapEvents) {
      const amount0In = parseFloat(ethers.formatUnits(event.args.amount0In, lpDetails.token0.decimals));
      const amount1In = parseFloat(ethers.formatUnits(event.args.amount1In, lpDetails.token1.decimals));
      const amount0Out = parseFloat(ethers.formatUnits(event.args.amount0Out, lpDetails.token0.decimals));
      const amount1Out = parseFloat(ethers.formatUnits(event.args.amount1Out, lpDetails.token1.decimals));
      
      // Volume is the input amount (what user sold)
      const volume0USD = amount0In * token0Price;
      const volume1USD = amount1In * token1Price;
      totalVolumeUSD += volume0USD + volume1USD;
    }
    
    // Calculate fee revenue
    const dailyFeesUSD = totalVolumeUSD * FEE_RATE;
    
    // Calculate APR
    if (stakedLiquidity === 0) return 0;
    const feeAPR = (dailyFeesUSD / stakedLiquidity) * 365 * 100;
    
    return {
      feeAPR,
      volume24hUSD: totalVolumeUSD,
      fees24hUSD: dailyFeesUSD,
      swapCount: swapEvents.length
    };
  } catch (err) {
    console.error('Error calculating fee APR:', err.message);
    return { feeAPR: 0, volume24hUSD: 0, fees24hUSD: 0, swapCount: 0 };
  }
}

/**
 * Calculate emission APR from RewardCollected events (previous UTC day)
 */
export async function calculateEmissionAPR(pid, rewardTokenPrice, stakedLiquidity, blockRange = null) {
  try {
    // Use provided block range (previous UTC day) or calculate fresh
    const range = blockRange || await getPreviousUTCDayBlockRange();
    const { fromBlock, toBlock } = range;
    
    // Get RewardCollected events for this pool (chunked to avoid RPC limit)
    const rewardEvents = await queryEventsInChunks(
      stakingContract,
      stakingContract.filters.RewardCollected(pid),
      fromBlock,
      toBlock
    );
    
    // Sum total rewards
    let totalRewards = 0n;
    for (const event of rewardEvents) {
      totalRewards += event.args.amount;
    }
    
    // Convert to USD
    const rewardsFloat = parseFloat(ethers.formatUnits(totalRewards, 18)); // CRYSTAL is 18 decimals
    const rewards24hUSD = rewardsFloat * rewardTokenPrice;
    
    // Calculate APR
    if (stakedLiquidity === 0) return 0;
    const emissionAPR = (rewards24hUSD / stakedLiquidity) * 365 * 100;
    
    return {
      emissionAPR,
      rewards24hUSD,
      rewardTokenAmount: rewardsFloat,
      eventCount: rewardEvents.length
    };
  } catch (err) {
    console.error('Error calculating emission APR:', err.message);
    return { emissionAPR: 0, rewards24hUSD: 0, rewardTokenAmount: 0, eventCount: 0 };
  }
}

/**
 * Calculate TVL from reserves and token prices (using BigInt precision)
 */
export function calculateTVL(lpDetails, priceGraph, totalStaked) {
  const token0Price = priceGraph.get(lpDetails.token0.address.toLowerCase()) || 0;
  const token1Price = priceGraph.get(lpDetails.token1.address.toLowerCase()) || 0;
  
  // Convert reserves to USD using high precision
  const reserve0Float = parseFloat(ethers.formatUnits(lpDetails.reserve0, lpDetails.token0.decimals));
  const reserve1Float = parseFloat(ethers.formatUnits(lpDetails.reserve1, lpDetails.token1.decimals));
  
  const totalLiquidityUSD = (reserve0Float * token0Price) + (reserve1Float * token1Price);
  
  // Calculate staked ratio using BigInt to maintain precision
  if (lpDetails.totalSupply === 0n) {
    return { 
      tvlUSD: totalLiquidityUSD, 
      stakedLiquidityUSD: 0, 
      stakedRatio: 0 
    };
  }
  
  // Use BigInt ratio calculation for high precision
  // stakedRatio = totalStaked / totalSupply (both in 1e18 units)
  // Multiply by 1e6 for precision before converting to float
  const PRECISION = 1_000_000n;
  const stakedRatioBigInt = (totalStaked * PRECISION) / lpDetails.totalSupply;
  const stakedRatio = Number(stakedRatioBigInt) / Number(PRECISION);
  
  const stakedLiquidityUSD = totalLiquidityUSD * stakedRatio;
  
  // Calculate V1 TVL (legacy staking - still has liquidity but no CRYSTAL rewards)
  const v1LiquidityUSD = totalLiquidityUSD - stakedLiquidityUSD;
  
  return {
    tvlUSD: totalLiquidityUSD,
    stakedLiquidityUSD,
    v1LiquidityUSD,
    stakedRatio
  };
}

/**
 * Calculate gardening quest APR range based on hero stats and Rapid Renewal
 * Formula (approximate): Boost % = (INT + WIS + Level) × Gardening Skill × Multiplier
 * Returns additional APR from hero boost (not base emissions)
 * Best hero calculation includes Rapid Renewal frequency multiplier
 */
export function calculateGardeningQuestAPR(baseEmissionAPR) {
  // Worst hero: Level 1, INT=5, WIS=5, Gardening Skill=0 (no profession gene, no Rapid Renewal)
  const worstHero = {
    level: 1,
    int: 5,
    wis: 5,
    gardeningSkill: 0
  };
  
  // Best hero: Level 100, INT=80, WIS=80, Gardening Skill=10 (maxed Wizard with profession gene + Rapid Renewal)
  const bestHero = {
    level: 100,
    int: 80,
    wis: 80,
    gardeningSkill: 10
  };
  
  // Boost multiplier calibrated to give ~0-30% boost range
  const MULTIPLIER = 0.00012;
  
  // Calculate per-quest boost percentage for each hero
  const worstPerQuestBoost = (worstHero.int + worstHero.wis + worstHero.level) * worstHero.gardeningSkill * MULTIPLIER;
  const bestPerQuestBoost = (bestHero.int + bestHero.wis + bestHero.level) * bestHero.gardeningSkill * MULTIPLIER;
  
  // Rapid Renewal frequency multiplier (for best hero only)
  // Base stamina recharge: 1200 seconds (20 min per stamina)
  // Level discount without RR: 2 seconds/level
  // Level discount with RR: 5 seconds/level
  // For level 100 hero:
  //   Without RR: 1200 - (100 × 2) = 1000 sec/stamina
  //   With RR: 1200 - (100 × 5) = 700 sec/stamina
  //   Frequency increase: 1000/700 = 1.4286x (42.86% more quests/year)
  const BASE_STAMINA_RECHARGE = 1200; // seconds
  const DISCOUNT_PER_LEVEL_WITHOUT_RR = 2; // seconds
  const DISCOUNT_PER_LEVEL_WITH_RR = 5; // seconds
  
  const rechargeTimeWithoutRR = BASE_STAMINA_RECHARGE - (bestHero.level * DISCOUNT_PER_LEVEL_WITHOUT_RR);
  const rechargeTimeWithRR = BASE_STAMINA_RECHARGE - (bestHero.level * DISCOUNT_PER_LEVEL_WITH_RR);
  const rapidRenewalFrequencyMultiplier = rechargeTimeWithoutRR / rechargeTimeWithRR;
  
  // Total boost for best hero = per-quest boost × Rapid Renewal frequency boost
  // This represents: (1 + perQuestBoost) × rapidRenewalMultiplier - 1
  const bestTotalBoost = (1 + bestPerQuestBoost) * rapidRenewalFrequencyMultiplier - 1;
  
  // Additional APR from gardening quest
  const worstQuestAPR = baseEmissionAPR * worstPerQuestBoost;
  const bestQuestAPR = baseEmissionAPR * bestTotalBoost;
  
  return {
    worstQuestAPR,
    bestQuestAPR,
    worstBoost: worstPerQuestBoost * 100,  // Convert to percentage
    bestBoost: bestTotalBoost * 100,
    rapidRenewalMultiplier: rapidRenewalFrequencyMultiplier
  };
}

/**
 * Get comprehensive pool analytics (with optional shared data for performance)
 * 
 * @param {number} pid - Pool ID
 * @param {object} sharedData - Optional shared computation results to avoid recomputation
 * @param {Array} sharedData.allPools - Pre-fetched pool list
 * @param {Map} sharedData.priceGraph - Pre-built price graph
 * @param {number} sharedData.crystalPrice - Pre-fetched CRYSTAL price
 * @param {bigint} sharedData.totalAllocPoint - Pre-fetched total allocation point
 * @param {object} sharedData.blockRange - Pre-calculated block range for previous UTC day
 */
export async function getPoolAnalytics(pid, sharedData = null) {
  try {
    // Use shared data if provided, otherwise fetch fresh
    const allPools = sharedData?.allPools || await discoverPools();
    const pool = allPools.find(p => p.pid === pid);
    
    if (!pool) {
      throw new Error(`Pool ${pid} not found`);
    }
    
    // Get LP details
    const lpDetails = await getLPTokenDetails(pool.lpToken);
    
    // Use shared price graph or build new one
    const priceGraph = sharedData?.priceGraph || await buildPriceGraph();
    
    // Use shared CRYSTAL price or fetch from graph
    const CRYSTAL_ADDRESS = '0x04b9dA42306B023f3572e106B11D82aAd9D32EBb';
    const crystalPrice = sharedData?.crystalPrice ?? (priceGraph.get(CRYSTAL_ADDRESS.toLowerCase()) || 0);
    
    // Use shared block range or fetch fresh
    const blockRange = sharedData?.blockRange || await getPreviousUTCDayBlockRange();
    
    // Calculate TVL
    const tvlData = calculateTVL(lpDetails, priceGraph, pool.totalStaked);
    
    // Calculate 24h fee APR (use total pool TVL including V1+V2)
    const feeData = await calculate24hFeeAPR(pool.lpToken, lpDetails, priceGraph, tvlData.tvlUSD, blockRange);
    
    // Calculate emission APR (use only V2 staked amount - only V2 gets CRYSTAL rewards)
    const emissionData = await calculateEmissionAPR(pid, crystalPrice, tvlData.stakedLiquidityUSD, blockRange);
    
    // Calculate gardening quest APR range (additional yield from hero boost)
    const gardeningQuestData = calculateGardeningQuestAPR(emissionData.emissionAPR);
    
    // Calculate total APR (fees + harvesting + best gardening quest boost)
    const totalAPR = feeData.feeAPR + emissionData.emissionAPR + gardeningQuestData.bestQuestAPR;
    
    return {
      pid,
      pairName: lpDetails.pairName,
      lpToken: pool.lpToken,
      token0: lpDetails.token0,
      token1: lpDetails.token1,
      allocPoint: pool.allocPoint.toString(),
      totalStaked: ethers.formatUnits(pool.totalStaked, 18),
      v1TVL: tvlData.v1LiquidityUSD,
      v2TVL: tvlData.stakedLiquidityUSD,
      totalTVL: tvlData.tvlUSD,
      stakedRatio: (tvlData.stakedRatio * 100).toFixed(2) + '%',
      fee24hAPR: feeData.feeAPR.toFixed(2) + '%',
      harvesting24hAPR: emissionData.emissionAPR.toFixed(2) + '%',
      gardeningQuestAPR: {
        worst: gardeningQuestData.worstQuestAPR.toFixed(2) + '%',
        best: gardeningQuestData.bestQuestAPR.toFixed(2) + '%',
        worstBoost: gardeningQuestData.worstBoost.toFixed(2) + '%',
        bestBoost: gardeningQuestData.bestBoost.toFixed(2) + '%'
      },
      totalAPR: totalAPR.toFixed(2) + '%',
      volume24hUSD: feeData.volume24hUSD,
      fees24hUSD: feeData.fees24hUSD,
      rewards24hUSD: emissionData.rewards24hUSD,
      crystalPrice,
      tokenPrices: {
        [lpDetails.token0.symbol]: priceGraph.get(lpDetails.token0.address.toLowerCase()) || 0,
        [lpDetails.token1.symbol]: priceGraph.get(lpDetails.token1.address.toLowerCase()) || 0
      }
    };
  } catch (err) {
    console.error('Error getting pool analytics:', err);
    throw err;
  }
}

/**
 * Get analytics for all pools (optimized - builds price graph once)
 */
export async function getAllPoolAnalytics(limit = 20) {
  try {
    const stageStart = Date.now();
    
    // Stage 1: Discover all pools ONCE
    console.log('[Analytics] Stage 1/5: Discovering pools...');
    const allPools = await discoverPools();
    const stage1Duration = ((Date.now() - stageStart) / 1000).toFixed(1);
    console.log(`[Analytics] ✓ Discovered ${allPools.length} pools (${stage1Duration}s)`);
    
    // Stage 2: Build price graph ONCE for all pools
    console.log('[Analytics] Stage 2/5: Building price graph...');
    const stage2Start = Date.now();
    const priceGraph = await buildPriceGraph();
    const stage2Duration = ((Date.now() - stage2Start) / 1000).toFixed(1);
    console.log(`[Analytics] ✓ Price graph built (${stage2Duration}s)`);
    
    // Stage 3: Get CRYSTAL price and metadata ONCE
    console.log('[Analytics] Stage 3/5: Getting token prices...');
    const CRYSTAL_ADDRESS = '0x04b9dA42306B023f3572e106B11D82aAd9D32EBb';
    const crystalPrice = priceGraph.get(CRYSTAL_ADDRESS.toLowerCase()) || 0;
    const totalAllocPoint = await stakingContract.getTotalAllocPoint();
    console.log(`[Analytics] ✓ Token prices ready`);
    
    // Stage 4: Get block range for previous UTC day ONCE
    console.log('[Analytics] Stage 4/5: Calculating block range...');
    const blockRange = await getPreviousUTCDayBlockRange();
    console.log(`[Analytics] ✓ Block range calculated`);
    
    // Stage 5: Process each pool with shared data
    console.log(`[Analytics] Stage 5/5: Analyzing ${Math.min(allPools.length, limit)} pools...`);
    const results = [];
    const poolsToProcess = Math.min(allPools.length, limit);
    
    for (let i = 0; i < poolsToProcess; i++) {
      try {
        const pool = allPools[i];
        const poolStart = Date.now();
        
        // Get LP details
        const lpDetails = await getLPTokenDetails(pool.lpToken);
        
        // Progress indicator for each pool
        console.log(`[Analytics]   Pool ${i + 1}/${poolsToProcess}: ${lpDetails.pairName}`);
        
        // Calculate TVL
        const tvlData = calculateTVL(lpDetails, priceGraph, pool.totalStaked);
        
        // Calculate 24h fee APR (use total pool TVL including V1+V2)
        const feeData = await calculate24hFeeAPR(pool.lpToken, lpDetails, priceGraph, tvlData.tvlUSD, blockRange);
        
        // Calculate emission APR (use only V2 staked amount - only V2 gets CRYSTAL rewards)
        const emissionData = await calculateEmissionAPR(pool.pid, crystalPrice, tvlData.stakedLiquidityUSD, blockRange);
        
        // Calculate gardening quest APR range (additional yield from hero boost)
        const gardeningQuestData = calculateGardeningQuestAPR(emissionData.emissionAPR);
        
        // Calculate total APR (fees + harvesting + best gardening quest boost)
        const totalAPR = feeData.feeAPR + emissionData.emissionAPR + gardeningQuestData.bestQuestAPR;
        
        results.push({
          pid: pool.pid,
          pairName: lpDetails.pairName,
          lpToken: pool.lpToken,
          token0: lpDetails.token0,
          token1: lpDetails.token1,
          allocPoint: pool.allocPoint.toString(),
          totalStaked: ethers.formatUnits(pool.totalStaked, 18),
          v1TVL: tvlData.v1LiquidityUSD,
          v2TVL: tvlData.stakedLiquidityUSD,
          totalTVL: tvlData.tvlUSD,
          stakedRatio: (tvlData.stakedRatio * 100).toFixed(2) + '%',
          fee24hAPR: feeData.feeAPR.toFixed(2) + '%',
          harvesting24hAPR: emissionData.emissionAPR.toFixed(2) + '%',
          gardeningQuestAPR: {
            worst: gardeningQuestData.worstQuestAPR.toFixed(2) + '%',
            best: gardeningQuestData.bestQuestAPR.toFixed(2) + '%',
            worstBoost: gardeningQuestData.worstBoost.toFixed(2) + '%',
            bestBoost: gardeningQuestData.bestBoost.toFixed(2) + '%'
          },
          totalAPR: totalAPR.toFixed(2) + '%',
          volume24hUSD: feeData.volume24hUSD,
          fees24hUSD: feeData.fees24hUSD,
          rewards24hUSD: emissionData.rewards24hUSD,
          crystalPrice,
          tokenPrices: {
            [lpDetails.token0.symbol]: priceGraph.get(lpDetails.token0.address.toLowerCase()) || 0,
            [lpDetails.token1.symbol]: priceGraph.get(lpDetails.token1.address.toLowerCase()) || 0
          }
        });
      } catch (err) {
        console.error(`Failed to get analytics for pool ${i}:`, err.message);
      }
    }
    
    // Sort by total APR descending
    results.sort((a, b) => parseFloat(b.totalAPR) - parseFloat(a.totalAPR));
    
    const totalDuration = ((Date.now() - stageStart) / 1000).toFixed(1);
    console.log(`[Analytics] ✓ Completed all stages in ${totalDuration}s - ${results.length} pools ready`);
    
    return results;
  } catch (err) {
    console.error('Error in getAllPoolAnalytics:', err);
    throw err;
  }
}

/**
 * Get user's pending rewards
 */
export async function getUserPendingRewards(walletAddress, pid) {
  try {
    const pendingRewards = await stakingContract.getPendingRewards(pid, walletAddress);
    return ethers.formatUnits(pendingRewards, 18);
  } catch (err) {
    console.error('Error getting pending rewards:', err.message);
    return '0';
  }
}

/**
 * Get hero's quest details from QuestCoreV3 contract
 * 
 * @param {string} heroId - Hero ID
 * @returns {Promise<Object|null>} Quest details or null if not on a quest
 */
export async function getHeroQuestDetails(heroId) {
  try {
    const quest = await questCoreContract.getHeroQuest(heroId);
    
    // Check if quest exists (id !== 0)
    if (quest.id.toString() === '0') {
      return null;
    }
    
    return {
      id: quest.id.toString(),
      questInstanceId: quest.questInstanceId.toString(),
      level: quest.level,
      heroes: quest.heroes.map(h => h.toString()),
      player: quest.player,
      startBlock: quest.startBlock.toString(),
      startAtTime: quest.startAtTime.toString(),
      completeAtTime: quest.completeAtTime.toString(),
      attempts: quest.attempts,
      status: quest.status,
      questType: quest.questType // For gardening: questType = poolId (0-13)
    };
  } catch (err) {
    console.error(`Error getting quest details for hero #${heroId}:`, err.message);
    return null;
  }
}

/**
 * Check if a hero is on a gardening quest
 * For gardening quests, questType matches the poolId (0-13 for DFK Chain)
 * 
 * @param {string} heroId - Hero ID
 * @returns {Promise<Object|null>} { poolId, questDetails } or null if not gardening
 */
export async function getHeroGardeningAssignment(heroId) {
  try {
    const questDetails = await getHeroQuestDetails(heroId);
    
    if (!questDetails) {
      return null;
    }
    
    // Gardening quests have questType = poolId (0-13 for DFK Chain)
    // Valid pool IDs: 0-13 based on LP Staking contract
    const poolId = questDetails.questType;
    if (poolId >= 0 && poolId <= 13) {
      return {
        poolId,
        questDetails
      };
    }
    
    return null; // Not a gardening quest (mining/fishing/foraging/etc.)
  } catch (err) {
    console.error(`Error checking gardening assignment for hero #${heroId}:`, err.message);
    return null;
  }
}
