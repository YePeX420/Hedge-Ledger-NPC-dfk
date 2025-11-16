import { ethers } from 'ethers';
import lpStakingABI from './LPStakingDiamond.json' with { type: 'json' };
import uniswapPairABI from './UniswapV2Pair.json' with { type: 'json' };
import erc20ABI from './ERC20.json' with { type: 'json' };

// DFK Chain configuration
const DFK_CHAIN_RPC = 'https://subnets.avax.network/defi-kingdoms/dfk-chain/rpc';
const LP_STAKING_ADDRESS = '0xB04e8D6aED037904B77A9F0b08002592925833b7';
const USDC_ADDRESS = '0x3AD9DFE640E1A9Cc1D9B0948620820D975c3803a'; // USDC.e on DFK Chain
const BLOCKS_PER_DAY = 43200; // ~2 second blocks
const FEE_RATE = 0.0025; // 0.25% swap fee

const provider = new ethers.JsonRpcProvider(DFK_CHAIN_RPC);
const stakingContract = new ethers.Contract(LP_STAKING_ADDRESS, lpStakingABI, provider);

// Export for use in bot.js when building shared data
export { stakingContract };

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
 */
export async function buildPriceGraph(pools) {
  const priceGraph = new Map(); // token address -> USD price
  const edges = new Map(); // token -> [{partner, rate}]
  
  // Set USDC anchor price
  priceGraph.set(USDC_ADDRESS.toLowerCase(), 1.0);
  
  // Build edges from LP pairs
  for (const pool of pools) {
    const details = await getLPTokenDetails(pool.lpToken);
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
  
  return priceGraph;
}

/**
 * Calculate 24h fee APR from Swap events
 */
export async function calculate24hFeeAPR(lpAddress, lpDetails, priceGraph, stakedLiquidity) {
  try {
    const currentBlock = await provider.getBlockNumber();
    const fromBlock = currentBlock - BLOCKS_PER_DAY;
    
    const lpContract = new ethers.Contract(lpAddress, uniswapPairABI, provider);
    
    // Get Swap events from last 24h
    const swapEvents = await lpContract.queryFilter(
      lpContract.filters.Swap(),
      fromBlock,
      currentBlock
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
 * Calculate emission APR from RewardCollected events
 */
export async function calculateEmissionAPR(pid, rewardTokenPrice, stakedLiquidity) {
  try {
    const currentBlock = await provider.getBlockNumber();
    const fromBlock = currentBlock - BLOCKS_PER_DAY;
    
    // Get RewardCollected events for this pool
    const rewardEvents = await stakingContract.queryFilter(
      stakingContract.filters.RewardCollected(pid),
      fromBlock,
      currentBlock
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
  
  return {
    tvlUSD: totalLiquidityUSD,
    stakedLiquidityUSD,
    stakedRatio
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
    const priceGraph = sharedData?.priceGraph || await buildPriceGraph(allPools);
    
    // Use shared CRYSTAL price or fetch from graph
    const CRYSTAL_ADDRESS = '0x04b9dA42306B023f3572e106B11D82aAd9D32EBb';
    const crystalPrice = sharedData?.crystalPrice ?? (priceGraph.get(CRYSTAL_ADDRESS.toLowerCase()) || 0);
    
    // Calculate TVL
    const tvlData = calculateTVL(lpDetails, priceGraph, pool.totalStaked);
    
    // Calculate 24h fee APR
    const feeData = await calculate24hFeeAPR(pool.lpToken, lpDetails, priceGraph, tvlData.stakedLiquidityUSD);
    
    // Calculate emission APR
    const emissionData = await calculateEmissionAPR(pid, crystalPrice, tvlData.stakedLiquidityUSD);
    
    // Calculate total APR
    const totalAPR = feeData.feeAPR + emissionData.emissionAPR;
    
    // Use shared total alloc point or fetch fresh
    const totalAllocPoint = sharedData?.totalAllocPoint || await stakingContract.getTotalAllocPoint();
    const allocPercent = (Number(pool.allocPoint) / Number(totalAllocPoint)) * 100;
    
    return {
      pid,
      pairName: lpDetails.pairName,
      lpToken: pool.lpToken,
      token0: lpDetails.token0,
      token1: lpDetails.token1,
      allocPoint: pool.allocPoint.toString(),
      allocPercent: allocPercent.toFixed(2) + '%',
      totalStaked: ethers.formatUnits(pool.totalStaked, 18),
      tvlUSD: tvlData.tvlUSD,
      stakedLiquidityUSD: tvlData.stakedLiquidityUSD,
      stakedRatio: (tvlData.stakedRatio * 100).toFixed(2) + '%',
      feeAPR: feeData.feeAPR.toFixed(2) + '%',
      emissionAPR: emissionData.emissionAPR.toFixed(2) + '%',
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
    // Discover all pools ONCE
    const allPools = await discoverPools();
    
    // Build price graph ONCE for all pools
    const priceGraph = await buildPriceGraph(allPools);
    
    // Get CRYSTAL price ONCE
    const CRYSTAL_ADDRESS = '0x04b9dA42306B023f3572e106B11D82aAd9D32EBb';
    const crystalPrice = priceGraph.get(CRYSTAL_ADDRESS.toLowerCase()) || 0;
    
    // Get total alloc point ONCE
    const totalAllocPoint = await stakingContract.getTotalAllocPoint();
    
    const results = [];
    
    // Process each pool with shared data
    for (let i = 0; i < Math.min(allPools.length, limit); i++) {
      try {
        const pool = allPools[i];
        
        // Get LP details
        const lpDetails = await getLPTokenDetails(pool.lpToken);
        
        // Calculate TVL
        const tvlData = calculateTVL(lpDetails, priceGraph, pool.totalStaked);
        
        // Calculate 24h fee APR
        const feeData = await calculate24hFeeAPR(pool.lpToken, lpDetails, priceGraph, tvlData.stakedLiquidityUSD);
        
        // Calculate emission APR
        const emissionData = await calculateEmissionAPR(pool.pid, crystalPrice, tvlData.stakedLiquidityUSD);
        
        // Calculate total APR
        const totalAPR = feeData.feeAPR + emissionData.emissionAPR;
        
        // Calculate allocation percentage
        const allocPercent = (Number(pool.allocPoint) / Number(totalAllocPoint)) * 100;
        
        results.push({
          pid: pool.pid,
          pairName: lpDetails.pairName,
          lpToken: pool.lpToken,
          token0: lpDetails.token0,
          token1: lpDetails.token1,
          allocPoint: pool.allocPoint.toString(),
          allocPercent: allocPercent.toFixed(2) + '%',
          totalStaked: ethers.formatUnits(pool.totalStaked, 18),
          tvlUSD: tvlData.tvlUSD,
          stakedLiquidityUSD: tvlData.stakedLiquidityUSD,
          stakedRatio: (tvlData.stakedRatio * 100).toFixed(2) + '%',
          feeAPR: feeData.feeAPR.toFixed(2) + '%',
          emissionAPR: emissionData.emissionAPR.toFixed(2) + '%',
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
