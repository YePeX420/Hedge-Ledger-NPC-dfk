import { getAllPoolAnalytics } from './garden-analytics.js';
import { promises as fs } from 'fs';
import path from 'path';

const REFRESH_INTERVAL_MS = 20 * 60 * 1000; // 20 minutes
const MAX_TIMING_HISTORY = 10; // Keep last 10 refresh times for averages
const CACHE_DIR = '.cache';
const CACHE_FILE_PATH = path.join(CACHE_DIR, 'pool-analytics.json');
const MAX_CACHE_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours - reject cache older than this

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
    
    // Save cache to disk for next startup
    await saveCache();
  } catch (error) {
    console.error('[PoolCache] ❌ Failed to refresh cache:', error.message);
    // Keep old cache data if refresh fails
  } finally {
    cache.isRefreshing = false;
  }
}

/**
 * Save cache to disk for persistence across restarts
 */
async function saveCache() {
  try {
    // Ensure cache directory exists
    await fs.mkdir(CACHE_DIR, { recursive: true });
    
    const cacheData = {
      data: cache.data,
      lastUpdated: cache.lastUpdated?.toISOString(),
      timingHistory: cache.timingHistory,
      version: '1.0'
    };
    
    // Custom replacer to handle BigInt values
    const bigIntReplacer = (key, value) => {
      if (typeof value === 'bigint') {
        return value.toString();
      }
      return value;
    };
    
    await fs.writeFile(CACHE_FILE_PATH, JSON.stringify(cacheData, bigIntReplacer, 2), 'utf8');
    console.log(`[PoolCache] 💾 Cache saved to disk (${cache.data.length} pools)`);
  } catch (error) {
    console.error('[PoolCache] ❌ Failed to save cache to disk:', error.message);
  }
}

/**
 * Load cache from disk if available and not too old
 * @returns {boolean} True if cache was loaded successfully
 */
async function loadCache() {
  try {
    const fileContent = await fs.readFile(CACHE_FILE_PATH, 'utf8');
    const cacheData = JSON.parse(fileContent);
    
    // Validate cache version and structure
    if (!cacheData.version || !cacheData.data || !cacheData.lastUpdated) {
      console.log('[PoolCache] ⚠️ Invalid cache file format, will refresh from blockchain');
      return false;
    }
    
    const lastUpdated = new Date(cacheData.lastUpdated);
    const ageMs = Date.now() - lastUpdated.getTime();
    const ageMinutes = Math.floor(ageMs / 60000);
    
    // Reject cache if too old
    if (ageMs > MAX_CACHE_AGE_MS) {
      console.log(`[PoolCache] ⏰ Cached data is ${ageMinutes} minutes old (max: ${MAX_CACHE_AGE_MS / 60000} min), will refresh`);
      return false;
    }
    
    // Load cache data
    cache.data = cacheData.data;
    cache.lastUpdated = lastUpdated;
    cache.timingHistory = cacheData.timingHistory || [];
    
    console.log(`[PoolCache] 📂 Loaded cache from disk (${cache.data.length} pools, ${ageMinutes} min old)`);
    console.log(`[PoolCache] ✅ Cache ready immediately - background refresh will update soon`);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log('[PoolCache] No cached data found, performing initial refresh...');
    } else {
      console.error('[PoolCache] ❌ Failed to load cache from disk:', error.message);
    }
    return false;
  }
}

/**
 * Initialize the pool cache system
 * Performs initial cache population and starts background refresh
 */
export async function initializePoolCache() {
  console.log('[PoolCache] Initializing pool analytics cache...');
  console.log(`[PoolCache] Refresh interval: ${REFRESH_INTERVAL_MS / 60000} minutes`);
  
  // Try to load cache from disk first for instant availability
  const cacheLoaded = await loadCache();
  
  // If cache wasn't loaded, perform initial refresh
  // If cache was loaded, still refresh in background to get fresh data
  if (!cacheLoaded) {
    await refreshCache();
  } else {
    // Cache loaded successfully, refresh in background without blocking startup
    console.log('[PoolCache] Scheduling background refresh for fresh data...');
    refreshCache().catch(err => {
      console.error('[PoolCache] Background refresh failed:', err.message);
    });
  }
  
  // Start background refresh cycle
  if (refreshInterval) {
    clearInterval(refreshInterval);
  }
  
  refreshInterval = setInterval(refreshCache, REFRESH_INTERVAL_MS);
  
  console.log('[PoolCache] Background refresh cycle started');
}

/**
 * Check if cache is ready for queries
 * @returns {boolean} True if cache has been populated
 */
export function isCacheReady() {
  return cache.data !== null && cache.data.length > 0;
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
 * Normalize token names for fuzzy matching
 * @param {string} text - Token name or search query
 * @returns {string} Normalized text
 */
function normalizeTokenName(text) {
  if (!text) return '';
  
  // Convert to lowercase and remove common separators
  let normalized = text.toLowerCase().replace(/[-\s]/g, '');
  
  // Map common variations (e.g., JEWEL and WJEWEL are treated as equivalent)
  const tokenAliases = {
    'jewel': 'wjewel',
    'wjewel': 'wjewel',
    'xjewel': 'xjewel'  // xJEWEL is different (staked JEWEL)
  };
  
  // Replace known aliases
  for (const [alias, canonical] of Object.entries(tokenAliases)) {
    if (normalized.includes(alias)) {
      normalized = normalized.replace(new RegExp(alias, 'g'), canonical);
    }
  }
  
  return normalized;
}

/**
 * Search for pools by name or token symbols (case-insensitive partial match)
 * @param {string} query - Pool name or token symbol query
 * @returns {Array} Matching pools
 */
export function searchCachedPools(query) {
  const cached = getCachedPoolAnalytics();
  if (!cached) return [];
  
  const lowerQuery = query.toLowerCase();
  const normalizedQuery = normalizeTokenName(query);
  
  return cached.data.filter(pool => {
    // Exact/substring match on pair name (e.g., "CRYSTAL-AVAX")
    if (pool.pairName && pool.pairName.toLowerCase().includes(lowerQuery)) {
      return true;
    }
    
    // Exact/substring match on individual token symbols
    if (pool.token0?.symbol && pool.token0.symbol.toLowerCase().includes(lowerQuery)) {
      return true;
    }
    
    if (pool.token1?.symbol && pool.token1.symbol.toLowerCase().includes(lowerQuery)) {
      return true;
    }
    
    // Fuzzy match: normalize both query and pool name to handle JEWEL/WJEWEL variations
    const normalizedPairName = normalizeTokenName(pool.pairName);
    if (normalizedPairName.includes(normalizedQuery)) {
      return true;
    }
    
    return false;
  });
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
