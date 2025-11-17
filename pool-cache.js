import { getAllPoolAnalytics } from './garden-analytics.js';

const REFRESH_INTERVAL_MS = 20 * 60 * 1000; // 20 minutes

let cache = {
  data: null,
  lastUpdated: null,
  isRefreshing: false
};

let refreshInterval = null;

/**
 * Refresh the pool analytics cache from blockchain
 */
async function refreshCache() {
  if (cache.isRefreshing) {
    console.log('[PoolCache] Refresh already in progress, skipping...');
    return;
  }

  try {
    cache.isRefreshing = true;
    console.log('[PoolCache] Starting cache refresh...');
    const startTime = Date.now();

    const analytics = await getAllPoolAnalytics();
    
    cache.data = analytics;
    cache.lastUpdated = new Date();
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[PoolCache] ✅ Cache refreshed successfully in ${duration}s`);
    console.log(`[PoolCache] Cached ${analytics.length} pools. Next refresh in ${REFRESH_INTERVAL_MS / 60000} minutes.`);
  } catch (error) {
    console.error('[PoolCache] ❌ Failed to refresh cache:', error.message);
    // Keep old cache data if refresh fails
  } finally {
    cache.isRefreshing = false;
  }
}

/**
 * Initialize the pool cache system
 * Performs initial cache population and starts background refresh
 */
export async function initializePoolCache() {
  console.log('[PoolCache] Initializing pool analytics cache...');
  console.log(`[PoolCache] Refresh interval: ${REFRESH_INTERVAL_MS / 60000} minutes`);
  
  // Initial cache population
  await refreshCache();
  
  // Start background refresh cycle
  if (refreshInterval) {
    clearInterval(refreshInterval);
  }
  
  refreshInterval = setInterval(refreshCache, REFRESH_INTERVAL_MS);
  
  console.log('[PoolCache] Background refresh cycle started');
}

/**
 * Get cached pool analytics data
 * @returns {Object} { data: Array, lastUpdated: Date, ageMinutes: number } or null if not initialized
 */
export function getCachedPoolAnalytics() {
  if (!cache.data || !cache.lastUpdated) {
    return null;
  }
  
  const ageMs = Date.now() - cache.lastUpdated.getTime();
  const ageMinutes = Math.floor(ageMs / 60000);
  
  return {
    data: cache.data,
    lastUpdated: cache.lastUpdated,
    ageMinutes
  };
}

/**
 * Get a specific pool from cache by PID
 * @param {number} pid - Pool ID
 * @returns {Object|null} Pool data or null
 */
export function getCachedPool(pid) {
  const cached = getCachedPoolAnalytics();
  if (!cached) return null;
  
  return cached.data.find(pool => pool.pid === pid) || null;
}

/**
 * Search for pools by name (case-insensitive partial match)
 * @param {string} query - Pool name query
 * @returns {Array} Matching pools
 */
export function searchCachedPools(query) {
  const cached = getCachedPoolAnalytics();
  if (!cached) return [];
  
  const lowerQuery = query.toLowerCase();
  return cached.data.filter(pool => 
    pool.name.toLowerCase().includes(lowerQuery)
  );
}

/**
 * Stop the background refresh cycle (for graceful shutdown)
 */
export function stopPoolCache() {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
    console.log('[PoolCache] Background refresh stopped');
  }
}
