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
 * Find pool by name/symbol (fast lookup from cache)
 */
export async function findPoolByName(searchTerm) {
  // Use cached pool search which has enriched data with symbols
  const cachedResults = searchCachedPools(searchTerm);
  
  if (cachedResults && cachedResults.length > 0) {
    return cachedResults[0]; // Return first match
  }
  
  // Fallback to basic pool list if cache not ready
  const pools = await getPoolList();
  const lowerSearch = searchTerm.toLowerCase();
  
  return pools.find(pool => {
    // Handle both enriched and basic pool structures safely
    // Only match if the fields exist and are non-empty
    
    // Enriched structure fields (from analytics cache)
    const pairName = pool.pairName?.toLowerCase();
    const token0SymbolNested = pool.token0?.symbol?.toLowerCase();
    const token1SymbolNested = pool.token1?.symbol?.toLowerCase();
    
    // Basic structure fields (from discoverPools)
    const lpTokenSymbol = pool.lpTokenSymbol?.toLowerCase();
    const token0SymbolFlat = pool.token0Symbol?.toLowerCase();
    const token1SymbolFlat = pool.token1Symbol?.toLowerCase();
    
    // Check pair name first (enriched data)
    if (pairName && pairName.includes(lowerSearch)) {
      return true;
    }
    
    // Check LP token symbol (basic data)
    if (lpTokenSymbol && lpTokenSymbol.includes(lowerSearch)) {
      return true;
    }
    
    // Check token0 symbol (both structures)
    const token0 = token0SymbolNested || token0SymbolFlat;
    if (token0 && (token0.includes(lowerSearch) || lowerSearch.includes(token0))) {
      return true;
    }
    
    // Check token1 symbol (both structures)
    const token1 = token1SymbolNested || token1SymbolFlat;
    if (token1 && (token1.includes(lowerSearch) || lowerSearch.includes(token1))) {
      return true;
    }
    
    return false;
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
    const cachedPool = getCachedPool(specificPid);
    return [{ 
      pid: specificPid, 
      pairName: cachedPool?.pairName || `Pool ${specificPid}`,
      rewards 
    }];
  }
  
  // Use cached analytics data which has pool names
  const cached = getCachedPoolAnalytics();
  if (cached) {
    const topPools = cached.data.slice(0, 5);
    
    const rewardsPromises = topPools.map(async (pool) => {
      try {
        const rewards = await analytics.getUserPendingRewards(walletAddress, pool.pid);
        return { 
          pid: pool.pid, 
          pairName: pool.pairName,
          rewards 
        };
      } catch (err) {
        console.error(`Error getting rewards for pool ${pool.pid}:`, err.message);
        return { pid: pool.pid, pairName: pool.pairName, rewards: '0' };
      }
    });
    
    return Promise.all(rewardsPromises);
  }
  
  // Fallback if cache not ready - check basic pool list and fetch LP details
  const pools = await getPoolList();
  const topPools = pools.slice(0, 5);
  
  const rewardsPromises = topPools.map(async (pool) => {
    try {
      const [rewards, lpDetails] = await Promise.all([
        analytics.getUserPendingRewards(walletAddress, pool.pid),
        analytics.getLPTokenDetails(pool.lpToken).catch(() => null)
      ]);
      
      const pairName = lpDetails?.pairName || `Pool ${pool.pid}`;
      
      return { 
        pid: pool.pid, 
        pairName,
        rewards 
      };
    } catch (err) {
      console.error(`Error getting rewards for pool ${pool.pid}:`, err.message);
      return { pid: pool.pid, pairName: `Pool ${pool.pid}`, rewards: '0' };
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
