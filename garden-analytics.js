import { ethers } from 'ethers';
import lpStakingABI from './LPStakingDiamond.json' with { type: 'json' };
import uniswapPairABI from './UniswapV2Pair.json' with { type: 'json' };
import uniswapFactoryABI from './UniswapV2Factory.json' with { type: 'json' };
import erc20ABI from './ERC20.json' with { type: 'json' };
import questCoreABI from './QuestCoreV3.json' with { type: 'json' };
import { computeFeeAprPct } from './apr-utils.js';
import { getLatestAggregate } from './src/etl/aggregation/poolDailyAggregator.js';

// DFK Chain configuration
const DFK_CHAIN_RPC = 'https://subnets.avax.network/defi-kingdoms/dfk-chain/rpc';
const LP_STAKING_ADDRESS = '0xB04e8D6aED037904B77A9F0b08002592925833b7';
const QUEST_CORE_V3_ADDRESS = '0x530fff22987E137e7C8D2aDcC4c15eb45b4FA752';
const UNISWAP_V2_FACTORY = '0x794C07912474351b3134E6D6B3B7b3b4A07cbAAa';
const USDC_ADDRESS = '0x3AD9DFE640E1A9Cc1D9B0948620820D975c3803a'; // USDC.e on DFK Chain
const LEGACY_GARDENER = '0x57dec9cc7f492d6583c773e2e7ad66dcdc6940fb'; // V1 Legacy gardener (still has staked LP)
const BLOCKS_PER_DAY = 43200; // ~2 second blocks

// LP Fee Rate: 0.20% of swap volume goes to LPs (from 0.30% total swap fee)
// See apr-utils.js for full fee distribution documentation
const LP_FEE_RATE = 0.002; // 0.20% LP share of swap fees

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
    let fromBlock = await findBlockAtOrAfter(startTimestamp, latestBlock);
    let toBlock = await findBlockAtOrBefore(endTimestamp, latestBlock);
    
    // Sanity check: if fromBlock >= toBlock, the binary search failed (RPC errors)
    // Fall back to estimated block range based on ~2 second block time
    if (fromBlock >= toBlock) {
      console.warn(`[BlockRange] Invalid range detected (${fromBlock} >= ${toBlock}), using estimated blocks`);
      const secondsPerBlock = 2;
      const now = Math.floor(Date.now() / 1000);
      const blocksToStart = Math.floor((now - startTimestamp) / secondsPerBlock);
      const blocksToEnd = Math.floor((now - endTimestamp) / secondsPerBlock);
      fromBlock = latestBlock - blocksToStart;
      toBlock = latestBlock - blocksToEnd;
      console.log(`[BlockRange] Estimated: ${fromBlock} to ${toBlock} (${toBlock - fromBlock} blocks)`);
    }
    
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
 * Build FOCUSED price graph using only the 14 garden pool LPs + key bridging pairs
 * MUCH faster than enumerating all 577 factory pairs
 */
export async function buildFocusedPriceGraph(gardenPools) {
  const priceGraph = new Map(); // token address -> USD price
  const edges = new Map(); // token -> [{partner, rate}]
  
  // Set USDC anchor price
  priceGraph.set(USDC_ADDRESS.toLowerCase(), 1.0);
  
  // Key bridging pairs for price propagation (USDC pairs to bootstrap pricing)
  // These are the correct LP addresses from DFK staking contract
  const KEY_PAIRS = [
    '0xCF329b34049033dE26e4449aeBCb41f1992724D3', // wJEWEL-USDC (pid 5)
    '0x04Dec678825b8DfD2D0d9bD83B538bE3fbDA2926', // CRYSTAL-USDC (pid 3)
    '0x7d4daa9eB74264b082A92F3f559ff167224484aC', // ETH-USDC (pid 4)
    '0x59D642B471dd54207Cb1CDe2e7507b0Ce1b1a6a5', // BTC.b-USDC (pid 13)
  ];
  
  // Collect LP tokens from garden pools + key bridging pairs
  const lpTokens = new Set();
  
  // Add garden pool LP tokens
  for (const pool of gardenPools) {
    if (pool.lpToken) {
      lpTokens.add(pool.lpToken.toLowerCase());
    }
  }
  
  // Add key bridging pairs
  for (const pair of KEY_PAIRS) {
    lpTokens.add(pair.toLowerCase());
  }
  
  console.log(`Building focused price graph from ${lpTokens.size} LP tokens...`);
  
  // Fetch LP details in parallel batches (batch size 6 for RPC friendliness)
  const BATCH_SIZE = 6;
  const lpArray = Array.from(lpTokens);
  const allDetails = [];
  
  for (let i = 0; i < lpArray.length; i += BATCH_SIZE) {
    const batch = lpArray.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(lp => getLPTokenDetails(lp).catch(() => null))
    );
    allDetails.push(...batchResults.filter(d => d !== null));
  }
  
  // Build edges from LP details
  for (const details of allDetails) {
    const token0 = details.token0.address.toLowerCase();
    const token1 = details.token1.address.toLowerCase();
    
    const reserve0Float = parseFloat(ethers.formatUnits(details.reserve0, details.token0.decimals));
    const reserve1Float = parseFloat(ethers.formatUnits(details.reserve1, details.token1.decimals));
    
    if (reserve0Float === 0 || reserve1Float === 0) continue;
    
    const rate01 = reserve0Float / reserve1Float;
    const rate10 = reserve1Float / reserve0Float;
    
    if (!edges.has(token0)) edges.set(token0, []);
    if (!edges.has(token1)) edges.set(token1, []);
    
    edges.get(token0).push({ partner: token1, rate: rate01 });
    edges.get(token1).push({ partner: token0, rate: rate10 });
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
  
  console.log(`Focused price graph built: ${priceGraph.size} tokens priced`);
  
  return priceGraph;
}

/**
 * Build on-chain price graph using BFS from USDC anchor
 * Enumerates ALL LP pairs from factory for accurate pricing
 * NOTE: This is SLOW (~2-5 min). Use buildFocusedPriceGraph for fast results.
 */
export async function buildPriceGraph() {
  const priceGraph = new Map(); // token address -> USD price
  const edges = new Map(); // token -> [{partner, rate}]
  
  // Known token addresses for debugging
  const KNOWN_TOKENS = {
    USDC: USDC_ADDRESS.toLowerCase(),
    WETH: '0xfbdf0e31808d0aa7b9509aa6abc9754e48c58852'.toLowerCase(), // Correct ETH address from LP pools
    WAVAX: '0xB57B60DeBDB0b8172bb6316a9164bd3C695F133a'.toLowerCase(),
    CRYSTAL: '0x04b9dA42306B023f3572e106B11D82aAd9D32EBb'.toLowerCase(),
    JEWEL: '0xCCb93dABD71c8Dad03Fc4CE5559dC3D89F67a260'.toLowerCase(),
  };
  
  // Priority direct USDC pairs for accurate pricing (processed first)
  const PRIORITY_PAIRS = [
    '0x7d4daa9eB74264b082A92F3f559ff167224484aC', // ETH-USDC (pid 4)
    '0x04Dec678825b8DfD2D0d9bD83B538bE3fbDA2926', // CRYSTAL-USDC (pid 3)
    '0xCF329b34049033dE26e4449aeBCb41f1992724D3', // wJEWEL-USDC (pid 5)
    '0x59D642B471dd54207Cb1CDe2e7507b0Ce1b1a6a5', // BTC.b-USDC (pid 13)
  ];
  
  // Secondary pairs for tokens not directly paired with USDC
  const SECONDARY_PAIRS = [
    '0x9f378F48d0c1328fd0C80d7Ae544C6CadB5Ba99E', // CRYSTAL-AVAX (pid 1) - for AVAX pricing via CRYSTAL
    '0x78C893E262e2681Dbd6B6eBA6CCA2AaD45de19AD', // CRYSTAL-ETH (pid 6) - backup for ETH
    '0xF3EabeD6Bd905e0FcD68FC3dBCd6e3A4aEE55E98', // wJEWEL-AVAX (pid 10) - backup for AVAX
  ];
  
  // Set USDC anchor price
  priceGraph.set(USDC_ADDRESS.toLowerCase(), 1.0);
  
  // Process priority pairs FIRST to establish accurate base prices
  console.log('[PriceGraph] Processing priority USDC pairs first...');
  for (const pairAddress of [...PRIORITY_PAIRS, ...SECONDARY_PAIRS]) {
    try {
      const details = await getLPTokenDetails(pairAddress);
      const token0 = details.token0.address.toLowerCase();
      const token1 = details.token1.address.toLowerCase();
      
      const reserve0Float = parseFloat(ethers.formatUnits(details.reserve0, details.token0.decimals));
      const reserve1Float = parseFloat(ethers.formatUnits(details.reserve1, details.token1.decimals));
      
      if (reserve0Float === 0 || reserve1Float === 0) {
        console.log(`[PriceGraph] Skipping ${details.pairName} - zero reserves`);
        continue;
      }
      
      const rate01 = reserve0Float / reserve1Float;
      const rate10 = reserve1Float / reserve0Float;
      
      if (!edges.has(token0)) edges.set(token0, []);
      if (!edges.has(token1)) edges.set(token1, []);
      
      // Add to FRONT of edges array to prioritize these rates
      edges.get(token0).unshift({ partner: token1, rate: rate01 });
      edges.get(token1).unshift({ partner: token0, rate: rate10 });
      
      console.log(`[PriceGraph] Priority: ${details.pairName} r0=${reserve0Float.toFixed(4)} r1=${reserve1Float.toFixed(4)}`);
    } catch (err) {
      console.log(`[PriceGraph] Failed to load priority pair ${pairAddress}: ${err.message}`);
    }
  }
  
  // Enumerate all LP pairs from factory
  const allPairs = await enumerateAllPairs();
  console.log(`[PriceGraph] Building from ${allPairs.length} factory LP pairs...`);
  
  // Build edges from ALL LP pairs (not just staked ones)
  for (const pairAddress of allPairs) {
    // Skip priority pairs (already processed)
    if (PRIORITY_PAIRS.includes(pairAddress) || SECONDARY_PAIRS.includes(pairAddress)) continue;
    
    try {
      const details = await getLPTokenDetails(pairAddress);
      const token0 = details.token0.address.toLowerCase();
      const token1 = details.token1.address.toLowerCase();
      
      const reserve0Float = parseFloat(ethers.formatUnits(details.reserve0, details.token0.decimals));
      const reserve1Float = parseFloat(ethers.formatUnits(details.reserve1, details.token1.decimals));
      
      if (reserve0Float === 0 || reserve1Float === 0) continue;
      
      const rate01 = reserve0Float / reserve1Float;
      const rate10 = reserve1Float / reserve0Float;
      
      // Add to END of edges array (lower priority than direct USDC pairs)
      if (!edges.has(token0)) edges.set(token0, []);
      if (!edges.has(token1)) edges.set(token1, []);
      
      edges.get(token0).push({ partner: token1, rate: rate01 });
      edges.get(token1).push({ partner: token0, rate: rate10 });
    } catch (err) {
      continue;
    }
  }
  
  // BFS to propagate prices from USDC (priority edges processed first due to unshift)
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
  
  // Debug: Log prices for key tokens
  console.log(`[PriceGraph] Key token prices:`);
  console.log(`  USDC: $${priceGraph.get(KNOWN_TOKENS.USDC)?.toFixed(4) || 'N/A'}`);
  console.log(`  CRYSTAL: $${priceGraph.get(KNOWN_TOKENS.CRYSTAL)?.toFixed(4) || 'N/A'}`);
  console.log(`  JEWEL: $${priceGraph.get(KNOWN_TOKENS.JEWEL)?.toFixed(4) || 'N/A'}`);
  console.log(`  ETH: $${priceGraph.get(KNOWN_TOKENS.WETH)?.toFixed(2) || 'N/A'}`);
  console.log(`  AVAX: $${priceGraph.get(KNOWN_TOKENS.WAVAX)?.toFixed(4) || 'N/A'}`);
  
  console.log(`[PriceGraph] Built: ${priceGraph.size} tokens priced`);
  
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
 * Now checks for indexed aggregate data first, falling back to RPC queries
 */
export async function calculate24hFeeAPR(lpAddress, lpDetails, priceGraph, stakedLiquidity, blockRange = null, pid = null) {
  try {
    // Check for recent indexed data first (if pid is provided)
    if (pid !== null) {
      try {
        const aggregate = await getLatestAggregate(pid);
        if (aggregate) {
          const aggregateDate = new Date(aggregate.date);
          const now = new Date();
          const daysDiff = (now.getTime() - aggregateDate.getTime()) / (1000 * 60 * 60 * 24);
          
          // Use indexed data if it's from the last 2 days
          if (daysDiff <= 2) {
            const volume24h = parseFloat(aggregate.volume24h) || 0;
            const fees24h = parseFloat(aggregate.fees24h) || 0;
            const feeApr = parseFloat(aggregate.feeApr) || 0;
            
            console.log(`[FeeAPR] Pool ${pid}: Using indexed data from ${aggregate.date} (volume=$${volume24h.toFixed(2)}, fees=$${fees24h.toFixed(2)}, APR=${feeApr.toFixed(2)}%)`);
            
            return {
              feeAPR: feeApr,
              volume24hUSD: volume24h,
              fees24hUSD: fees24h,
              swapCount: aggregate.swapCount24h || 0,
              source: 'indexed'
            };
          }
        }
      } catch (indexErr) {
        console.log(`[FeeAPR] Pool ${pid}: Indexed data unavailable, falling back to RPC (${indexErr.message})`);
      }
    }
    
    // Fallback to RPC query for swap events
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
    
    // Calculate fee revenue using LP fee rate (0.20% of 0.30% total swap fee)
    const dailyFeesUSD = totalVolumeUSD * LP_FEE_RATE;
    
    // Calculate APR using centralized utility
    if (stakedLiquidity === 0) return { feeAPR: 0, volume24hUSD: totalVolumeUSD, fees24hUSD: dailyFeesUSD, swapCount: swapEvents.length, source: 'rpc' };
    
    // Use centralized APR calculation from apr-utils
    const feeAPR = computeFeeAprPct({ volume24hUsd: totalVolumeUSD, poolTvlUsd: stakedLiquidity });
    
    return {
      feeAPR,
      volume24hUSD: totalVolumeUSD,
      fees24hUSD: dailyFeesUSD,
      swapCount: swapEvents.length,
      source: 'rpc'
    };
  } catch (err) {
    console.error('Error calculating fee APR:', err.message);
    return { feeAPR: 0, volume24hUSD: 0, fees24hUSD: 0, swapCount: 0, source: 'error' };
  }
}

/**
 * Calculate emission APR from RewardCollected events (previous UTC day)
 * Now checks for indexed aggregate data first, falling back to RPC queries
 */
export async function calculateEmissionAPR(pid, rewardTokenPrice, stakedLiquidity, blockRange = null) {
  try {
    // Check for recent indexed data first
    try {
      const aggregate = await getLatestAggregate(pid);
      if (aggregate) {
        const aggregateDate = new Date(aggregate.date);
        const now = new Date();
        const daysDiff = (now.getTime() - aggregateDate.getTime()) / (1000 * 60 * 60 * 24);
        
        // Use indexed data if it's from the last 2 days
        if (daysDiff <= 2) {
          const rewardsFloat = parseFloat(aggregate.rewards24h) || 0;
          const rewardsUsd = parseFloat(aggregate.rewardsUsd24h) || 0;
          const harvestApr = parseFloat(aggregate.harvestApr) || 0;
          
          console.log(`[EmissionAPR] Pool ${pid}: Using indexed data from ${aggregate.date} (rewards=${rewardsFloat.toFixed(4)}, USD=$${rewardsUsd.toFixed(2)}, APR=${harvestApr.toFixed(2)}%)`);
          
          return {
            emissionAPR: harvestApr,
            rewards24hUSD: rewardsUsd,
            rewardTokenAmount: rewardsFloat,
            eventCount: aggregate.rewardEventCount24h || 0,
            source: 'indexed'
          };
        }
      }
    } catch (indexErr) {
      console.log(`[EmissionAPR] Pool ${pid}: Indexed data unavailable, falling back to RPC (${indexErr.message})`);
    }
    
    // Fallback to RPC query for reward events
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
    if (stakedLiquidity === 0) return { emissionAPR: 0, rewards24hUSD: 0, rewardTokenAmount: 0, eventCount: 0, source: 'rpc' };
    const emissionAPR = (rewards24hUSD / stakedLiquidity) * 365 * 100;
    
    return {
      emissionAPR,
      rewards24hUSD,
      rewardTokenAmount: rewardsFloat,
      eventCount: rewardEvents.length,
      source: 'rpc'
    };
  } catch (err) {
    console.error('Error calculating emission APR:', err.message);
    return { emissionAPR: 0, rewards24hUSD: 0, rewardTokenAmount: 0, eventCount: 0, source: 'error' };
  }
}

/**
 * Get V1 staked LP amount from legacy gardener contract
 * @param {string} lpAddress - LP token address
 * @returns {Promise<number>} V1 staked LP amount as float
 */
async function getV1StakedAmount(lpAddress) {
  try {
    const lpContract = new ethers.Contract(lpAddress, uniswapPairABI, provider);
    const v1Balance = await lpContract.balanceOf(LEGACY_GARDENER);
    return parseFloat(ethers.formatEther(v1Balance));
  } catch (err) {
    console.error(`Error getting V1 staked for ${lpAddress}:`, err.message);
    return 0;
  }
}

/**
 * Calculate TVL from reserves and token prices
 * Uses float math for precision (matching valueBreakdown.ts approach)
 * 
 * @param {Object} lpDetails - LP token details from getLPTokenDetails
 * @param {Map} priceGraph - Token price map
 * @param {bigint} v2StakedBigInt - V2 staked LP amount (from Master Gardener V2)
 * @param {number} v1StakedFloat - V1 staked LP amount as float (from Legacy Gardener balance)
 */
export function calculateTVL(lpDetails, priceGraph, v2StakedBigInt, v1StakedFloat = 0) {
  const token0Price = priceGraph.get(lpDetails.token0.address.toLowerCase()) || 0;
  const token1Price = priceGraph.get(lpDetails.token1.address.toLowerCase()) || 0;
  
  // Convert reserves to USD
  const reserve0Float = parseFloat(ethers.formatUnits(lpDetails.reserve0, lpDetails.token0.decimals));
  const reserve1Float = parseFloat(ethers.formatUnits(lpDetails.reserve1, lpDetails.token1.decimals));
  
  const totalPoolLiquidityUSD = (reserve0Float * token0Price) + (reserve1Float * token1Price);
  
  // Convert BigInt values to float for ratio calculations (matching valueBreakdown.ts)
  const totalSupplyFloat = parseFloat(ethers.formatEther(lpDetails.totalSupply));
  const v2StakedFloat = parseFloat(ethers.formatEther(v2StakedBigInt));
  
  if (totalSupplyFloat === 0) {
    return { 
      tvlUSD: 0, 
      stakedLiquidityUSD: 0, 
      v1LiquidityUSD: 0,
      stakedRatio: 0 
    };
  }
  
  // Calculate ratios using float math (matching valueBreakdown.ts)
  const v2Ratio = v2StakedFloat / totalSupplyFloat;
  const v1Ratio = v1StakedFloat / totalSupplyFloat;
  
  // Calculate USD values
  const v2LiquidityUSD = totalPoolLiquidityUSD * v2Ratio;
  const v1LiquidityUSD = totalPoolLiquidityUSD * v1Ratio;
  
  // Total staked = V2 + V1
  const totalStakedRatio = v2Ratio + v1Ratio;
  const totalStakedLiquidityUSD = v2LiquidityUSD + v1LiquidityUSD;
  
  return {
    tvlUSD: totalStakedLiquidityUSD,      // Total staked TVL (V1 + V2)
    stakedLiquidityUSD: v2LiquidityUSD,   // V2 only (gets CRYSTAL rewards)
    v1LiquidityUSD,                        // V1 only (no CRYSTAL rewards)
    stakedRatio: totalStakedRatio,         // Combined staked ratio
    v2Ratio,
    v1Ratio
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
    
    // Get V1 staked amount from legacy gardener
    const v1Staked = await getV1StakedAmount(pool.lpToken);
    
    // Calculate TVL (now includes both V2 and V1 staked amounts)
    const tvlData = calculateTVL(lpDetails, priceGraph, pool.totalStaked, v1Staked);
    
    // Calculate 24h fee APR (use total pool TVL including V1+V2, pass pid for indexed data lookup)
    const feeData = await calculate24hFeeAPR(pool.lpToken, lpDetails, priceGraph, tvlData.tvlUSD, blockRange, pid);
    
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
export async function getAllPoolAnalytics(limit = 100) {
  try {
    const stageStart = Date.now();
    
    // Stage 1: Discover all pools ONCE
    console.log('[Analytics] Stage 1/5: Discovering pools...');
    const allPools = await discoverPools();
    const stage1Duration = ((Date.now() - stageStart) / 1000).toFixed(1);
    console.log(`[Analytics] ✓ Discovered ${allPools.length} pools (${stage1Duration}s)`);
    
    // Stage 2: Build FOCUSED price graph from garden pools (FAST)
    console.log('[Analytics] Stage 2/5: Building focused price graph...');
    const stage2Start = Date.now();
    const priceGraph = await buildFocusedPriceGraph(allPools);
    const stage2Duration = ((Date.now() - stage2Start) / 1000).toFixed(1);
    console.log(`[Analytics] ✓ Focused price graph built (${stage2Duration}s)`);
    
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
    const poolsToProcess = allPools.length; // ALWAYS process all pools, ignore limit
    console.log(`[Analytics] Stage 5/5: Analyzing ${poolsToProcess} pools...`);
    const results = [];
    
    for (let i = 0; i < poolsToProcess; i++) {
      try {
        const pool = allPools[i];
        const poolStart = Date.now();
        
        // Get LP details
        const lpDetails = await getLPTokenDetails(pool.lpToken);
        
        // Progress indicator for each pool
        console.log(`[Analytics]   Pool ${i + 1}/${poolsToProcess}: ${lpDetails.pairName}`);
        
        // Get V1 staked amount from legacy gardener
        const v1Staked = await getV1StakedAmount(pool.lpToken);
        
        // Calculate TVL (now includes both V2 and V1 staked amounts)
        const tvlData = calculateTVL(lpDetails, priceGraph, pool.totalStaked, v1Staked);
        
        // Calculate 24h fee APR (use total pool TVL including V1+V2, pass pid for indexed data lookup)
        const feeData = await calculate24hFeeAPR(pool.lpToken, lpDetails, priceGraph, tvlData.tvlUSD, blockRange, pool.pid);
        
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
 * Check if a hero is on a gardening expedition
 * Expeditions are detected if remainingIterations > 0
 * For gardening expeditions, we need to call getHeroQuest to get the questType/poolId
 * 
 * @param {string} heroId - Hero ID
 * @returns {Promise<Object|null>} { poolId, expeditionDetails, questDetails } or null if not on expedition
 */
async function getHeroGardeningExpedition(heroId) {
  try {
    const expedition = await questCoreContract.getHeroExpedition(heroId);
    
    // Check if expedition is active (remainingIterations > 0)
    if (!expedition) {
      return null; // No expedition
    }
    
    const remainingIter = expedition.remainingIterations.toString();
    if (remainingIter === '0') {
      return null; // Expedition inactive
    }
    
    // Expedition is active, now get quest details to determine pool
    const questDetails = await getHeroQuestDetails(heroId);
    if (!questDetails) {
      console.log(`[Expedition] Hero #${heroId}: ⚠️ Active expedition but no quest details`);
      return null;
    }
    
    // Check if it's a gardening expedition (questType = poolId 0-13)
    const poolId = questDetails.questType;
    
    if (poolId >= 0 && poolId <= 13) {
      console.log(`[Expedition] Hero #${heroId}: ✅ Pool #${poolId} (${remainingIter} iterations)`);
      return {
        poolId,
        questDetails,
        expeditionDetails: {
          lastClaimedAt: expedition.lastClaimedAt.toString(),
          remainingIterations: expedition.remainingIterations.toString(),
          iterationsToProcess: expedition.iterationsToProcess.toString()
        },
        isExpedition: true
      };
    }
    
    // Non-gardening expedition (mining/fishing/foraging)
    return null;
  } catch (err) {
    // Silent fail - expedition functions might not exist on older contracts
    return null;
  }
}

/**
 * Check if a hero is on a gardening quest (regular or expedition)
 * For gardening quests, questType matches the poolId (0-13 for DFK Chain)
 * 
 * @param {string} heroId - Hero ID
 * @returns {Promise<Object|null>} { poolId, questDetails, isExpedition } or null if not gardening
 */
export async function getHeroGardeningAssignment(heroId) {
  try {
    // First check if hero is on a gardening expedition
    const expeditionAssignment = await getHeroGardeningExpedition(heroId);
    if (expeditionAssignment) {
      // Add stamina tracking for expeditions
      const staminaPerQuest = expeditionAssignment.questDetails.attempts || 5;
      return {
        ...expeditionAssignment,
        staminaUsed: staminaPerQuest
      };
    }
    
    // If not on expedition, check regular quest
    const questDetails = await getHeroQuestDetails(heroId);
    
    if (!questDetails) {
      return null;
    }
    
    // Gardening quests have questType = poolId (0-13 for DFK Chain)
    // Valid pool IDs: 0-13 based on LP Staking contract
    const poolId = questDetails.questType;
    if (poolId >= 0 && poolId <= 13) {
      const staminaPerQuest = questDetails.attempts || 5;
      return {
        poolId,
        questDetails,
        isExpedition: false,
        staminaUsed: staminaPerQuest
      };
    }
    
    return null; // Not a gardening quest (mining/fishing/foraging/etc.)
  } catch (err) {
    console.error(`Error checking gardening assignment for hero #${heroId}:`, err.message);
    return null;
  }
}

/**
 * Get all wallets that have staked LP in a pool by scanning Deposit/Withdraw events
 * Returns current staked balances and last activity for each wallet
 * 
 * Note: Uses a default fromBlock of ~90 days ago for reasonable performance.
 * This covers most active staking activity. For complete history, pass fromBlock=0.
 * 
 * @param {number} pid - Pool ID
 * @param {number} fromBlock - Start block for event scanning (default: ~90 days ago)
 * @returns {Promise<Array<{wallet: string, stakedLP: string, lastActivity: Object}>>}
 */
export async function getAllPoolStakers(pid, fromBlock = null) {
  try {
    const currentBlock = await provider.getBlockNumber();
    
    // Default to ~7 days ago (~2 second blocks = 43200 blocks/day)
    // This provides fast scans (~300K blocks = ~150 RPC calls) while catching recent activity
    // For complete staker lists, combine with known wallets from registered players
    if (fromBlock === null) {
      const blocksFor7Days = 43200 * 7; // ~302K blocks
      fromBlock = Math.max(0, currentBlock - blocksFor7Days);
    }
    
    console.log(`[AllStakers] Scanning pool ${pid} from block ${fromBlock} to ${currentBlock} (${currentBlock - fromBlock} blocks)`);
    
    // Query Deposit events for this pool
    const depositFilter = stakingContract.filters.Deposit(null, pid);
    const depositEvents = await queryEventsInChunks(
      stakingContract,
      depositFilter,
      fromBlock,
      currentBlock,
      2048
    );
    
    // Query Withdraw events for this pool
    const withdrawFilter = stakingContract.filters.Withdraw(null, pid);
    const withdrawEvents = await queryEventsInChunks(
      stakingContract,
      withdrawFilter,
      fromBlock,
      currentBlock,
      2048
    );
    
    console.log(`[AllStakers] Found ${depositEvents.length} deposits, ${withdrawEvents.length} withdrawals`);
    
    // Build set of unique wallets and track last activity
    const walletActivity = new Map(); // wallet -> { type, amount, blockNumber, txHash }
    
    for (const event of depositEvents) {
      const wallet = event.args.user.toLowerCase();
      const existing = walletActivity.get(wallet);
      if (!existing || event.blockNumber > existing.blockNumber) {
        walletActivity.set(wallet, {
          type: 'Deposit',
          amount: ethers.formatEther(event.args.amount),
          blockNumber: event.blockNumber,
          txHash: event.transactionHash
        });
      }
    }
    
    for (const event of withdrawEvents) {
      const wallet = event.args.user.toLowerCase();
      const existing = walletActivity.get(wallet);
      if (!existing || event.blockNumber > existing.blockNumber) {
        walletActivity.set(wallet, {
          type: 'Withdraw',
          amount: ethers.formatEther(event.args.amount),
          blockNumber: event.blockNumber,
          txHash: event.transactionHash
        });
      }
    }
    
    console.log(`[AllStakers] Found ${walletActivity.size} unique wallets`);
    
    // Get current staked balance for each wallet using getUserInfo
    const stakers = [];
    const wallets = Array.from(walletActivity.keys());
    
    // Batch calls in groups of 10 to avoid RPC overload
    const BATCH_SIZE = 10;
    for (let i = 0; i < wallets.length; i += BATCH_SIZE) {
      const batch = wallets.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(async (wallet) => {
          try {
            const userInfo = await stakingContract.getUserInfo(pid, wallet);
            return {
              wallet,
              stakedLP: ethers.formatEther(userInfo.amount),
              stakedLPRaw: userInfo.amount.toString(),
              lastDepositTimestamp: userInfo.lastDepositTimestamp?.toString() || '0',
              lastActivity: walletActivity.get(wallet)
            };
          } catch (err) {
            console.error(`[AllStakers] Error fetching userInfo for ${wallet}:`, err.message);
            return {
              wallet,
              stakedLP: '0',
              stakedLPRaw: '0',
              lastDepositTimestamp: '0',
              lastActivity: walletActivity.get(wallet)
            };
          }
        })
      );
      stakers.push(...batchResults);
      
      // Small delay between batches
      if (i + BATCH_SIZE < wallets.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    // Filter to only wallets with current balance > 0 and sort by staked amount (descending)
    const activeStakers = stakers
      .filter(s => parseFloat(s.stakedLP) > 0)
      .sort((a, b) => parseFloat(b.stakedLP) - parseFloat(a.stakedLP));
    
    console.log(`[AllStakers] ${activeStakers.length} wallets currently staking in pool ${pid}`);
    
    return activeStakers;
  } catch (err) {
    console.error(`[AllStakers] Error scanning pool ${pid}:`, err.message);
    throw err;
  }
}
