// quick-data-fetcher.js
// Lightweight data fetching for DM responses (uses cached analytics)

import * as analytics from './garden-analytics.js';
import * as onchain from './onchain-data.js';
import { getCachedPoolAnalytics, getCachedPool, searchCachedPools } from './pool-cache.js';

// Cache pool list to avoid repeated queries
let cachedPoolList = null;
let cacheTimestamp = 0;
const CACHE_TTL = 300000; // 5 minutes

/**
 * Get basic pool list (lightweight - no APR calculations)
 */
export async function getPoolList() {
  const now = Date.now();
  
  // Return cached if still valid
  if (cachedPoolList && (now - cacheTimestamp) < CACHE_TTL) {
    return cachedPoolList;
  }
  
  try {
    const pools = await analytics.discoverPools();
    cachedPoolList = pools;
    cacheTimestamp = now;
    return pools;
  } catch (err) {
    console.error('Error fetching pool list:', err);
    // Return cached even if expired, better than nothing
    return cachedPoolList || [];
  }
}

/**
 * Find pool by name/symbol (fast lookup, no analytics)
 */
export async function findPoolByName(searchTerm) {
  const pools = await getPoolList();
  const lowerSearch = searchTerm.toLowerCase();
  
  return pools.find(pool => {
    const symbolLower = pool.lpTokenSymbol.toLowerCase();
    const token0Lower = pool.token0Symbol.toLowerCase();
    const token1Lower = pool.token1Symbol.toLowerCase();
    
    return symbolLower.includes(lowerSearch) ||
           token0Lower.includes(lowerSearch) ||
           token1Lower.includes(lowerSearch) ||
           lowerSearch.includes(token0Lower) ||
           lowerSearch.includes(token1Lower);
  });
}

/**
 * Get pool analytics from cache (instant response)
 * @param {number} pid - Pool ID
 * @returns {Object|null} Pool analytics with cache metadata
 */
export async function getPoolAnalyticsWithTimeout(pid, timeoutMs = 45000) {
  const cached = getCachedPool(pid);
  
  if (cached) {
    const cacheInfo = getCachedPoolAnalytics();
    return {
      ...cached,
      _cached: true,
      _cacheAge: cacheInfo.ageMinutes,
      _lastUpdated: cacheInfo.lastUpdated
    };
  }
  
  // If cache not initialized yet, fall back to live query
  console.log(`[QuickData] Cache miss for pool ${pid}, fetching live data...`);
  try {
    const liveData = await withTimeout(
      analytics.getPoolAnalytics(pid),
      timeoutMs,
      `Pool ${pid} analytics timed out after ${timeoutMs}ms`
    );
    
    // Add metadata to match cached structure
    return {
      ...liveData,
      _cached: false,
      _cacheAge: null,
      _lastUpdated: null
    };
  } catch (error) {
    console.error(`[QuickData] Live fetch failed for pool ${pid}:`, error.message);
    return null;
  }
}

/**
 * Get all pools analytics from cache (instant response)
 * @param {number} limit - Max pools to return
 * @returns {Object} Pool analytics with cache metadata
 */
export async function getAllPoolAnalyticsWithTimeout(limit = 10, timeoutMs = 60000) {
  const cached = getCachedPoolAnalytics();
  
  if (cached) {
    const pools = cached.data.slice(0, limit);
    return {
      pools,
      _cached: true,
      _cacheAge: cached.ageMinutes,
      _lastUpdated: cached.lastUpdated,
      _totalPools: cached.data.length
    };
  }
  
  // If cache not initialized yet, fall back to live query
  console.log('[QuickData] Cache not initialized, fetching live data...');
  try {
    const liveData = await withTimeout(
      analytics.getAllPoolAnalytics(limit),
      timeoutMs,
      `All pools analytics timed out after ${timeoutMs}ms`
    );
    
    // Wrap in same structure as cached response
    return {
      pools: liveData,
      _cached: false,
      _cacheAge: null,
      _lastUpdated: null,
      _totalPools: liveData.length
    };
  } catch (error) {
    // Return empty structure on error
    return {
      pools: [],
      _cached: false,
      _cacheAge: null,
      _lastUpdated: null,
      _totalPools: 0,
      _error: error.message
    };
  }
}

/**
 * Search for pools by name using cache (instant response)
 * @param {string} query - Pool name search query
 * @returns {Array} Matching pools with cache metadata
 */
export async function searchPoolsQuick(query) {
  const results = searchCachedPools(query);
  const cached = getCachedPoolAnalytics();
  
  if (results && cached) {
    return {
      pools: results,
      _cached: true,
      _cacheAge: cached.ageMinutes,
      _lastUpdated: cached.lastUpdated
    };
  }
  
  return { pools: [], _cached: false };
}

/**
 * Get wallet rewards quickly (only check specific pool if provided)
 */
export async function getWalletRewardsQuick(walletAddress, specificPid = null) {
  if (specificPid !== null) {
    // Just check one pool
    const rewards = await analytics.getUserPendingRewards(walletAddress, specificPid);
    return [{ pid: specificPid, rewards }];
  }
  
  // Check top 5 pools only to avoid long delays
  const pools = await getPoolList();
  const topPools = pools.slice(0, 5);
  
  const rewardsPromises = topPools.map(async (pool) => {
    try {
      const rewards = await analytics.getUserPendingRewards(walletAddress, pool.pid);
      return { 
        pid: pool.pid, 
        lpTokenSymbol: pool.lpTokenSymbol,
        rewards 
      };
    } catch (err) {
      console.error(`Error getting rewards for pool ${pool.pid}:`, err.message);
      return { pid: pool.pid, lpTokenSymbol: pool.lpTokenSymbol, rewards: '0' };
    }
  });
  
  return Promise.all(rewardsPromises);
}

/**
 * Get marketplace heroes with proper filtering
 */
export async function getMarketHeroesFiltered(options = {}) {
  const { 
    mainClass = null, 
    maxPrice = null,
    sortBy = 'price_asc',
    limit = 10 
  } = options;
  
  // Use existing onchain function
  let heroes = await onchain.getCheapestHeroes(mainClass, limit * 2); // Get more to filter
  
  if (!heroes || heroes.length === 0) {
    return [];
  }
  
  // Filter by max price if specified
  if (maxPrice !== null) {
    heroes = heroes.filter(hero => {
      const price = parseFloat(onchain.weiToToken(hero.salePrice));
      return price <= maxPrice;
    });
  }
  
  // Sort
  if (sortBy === 'price_asc') {
    heroes.sort((a, b) => {
      const priceA = parseFloat(onchain.weiToToken(a.salePrice));
      const priceB = parseFloat(onchain.weiToToken(b.salePrice));
      return priceA - priceB;
    });
  }
  
  // Return limited results
  return heroes.slice(0, limit);
}

/**
 * Generic timeout wrapper
 */
function withTimeout(promise, timeoutMs, errorMsg) {
  return Promise.race([
    promise,
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error(errorMsg)), timeoutMs)
    )
  ]);
}

/**
 * Wrap any function call with timeout and error handling
 */
export async function safeDataFetch(fetchFn, fallbackValue = null, timeoutMs = 30000) {
  try {
    return await withTimeout(fetchFn(), timeoutMs, 'Data fetch timed out');
  } catch (err) {
    console.error('Safe data fetch error:', err.message);
    return fallbackValue;
  }
}
