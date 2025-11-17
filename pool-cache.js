import { getAllPoolAnalytics } from './garden-analytics.js';

const REFRESH_INTERVAL_MS = 20 * 60 * 1000; // 20 minutes
const MAX_TIMING_HISTORY = 10; // Keep last 10 refresh times for averages

let cache = {
  data: null,
  lastUpdated: null,
  isRefreshing: false,
  timingHistory: [], // Array of refresh durations in seconds
  stageTiming: null // Last refresh stage breakdown
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
    const startTime = Date.now();
    
    // Show estimate based on historical data
    if (cache.timingHistory.length > 0) {
      const avgTime = cache.timingHistory.reduce((a, b) => a + b, 0) / cache.timingHistory.length;
      console.log(`[PoolCache] Starting cache refresh... (estimated ${avgTime.toFixed(1)}s based on last ${cache.timingHistory.length} runs)`);
    } else {
      console.log('[PoolCache] Starting cache refresh...');
    }

    const analytics = await getAllPoolAnalytics();
    
    cache.data = analytics;
    cache.lastUpdated = new Date();
    
    const duration = (Date.now() - startTime) / 1000;
    
    // Store timing history
    cache.timingHistory.push(duration);
    if (cache.timingHistory.length > MAX_TIMING_HISTORY) {
      cache.timingHistory.shift(); // Remove oldest
    }
    
    // Calculate average
    const avgTime = cache.timingHistory.reduce((a, b) => a + b, 0) / cache.timingHistory.length;
    
    console.log(`[PoolCache] ✅ Cache refreshed successfully in ${duration.toFixed(1)}s (avg: ${avgTime.toFixed(1)}s)`);
    console.log(`[PoolCache] Cached ${analytics.length} pools. Next refresh in ${REFRESH_INTERVAL_MS / 60000} minutes.`);
    
    // Performance alert if significantly slower than average
    if (cache.timingHistory.length >= 3 && duration > avgTime * 1.5) {
      console.warn(`[PoolCache] ⚠️ Slow refresh detected: ${duration.toFixed(1)}s (${((duration / avgTime - 1) * 100).toFixed(0)}% slower than avg)`);
    }
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
