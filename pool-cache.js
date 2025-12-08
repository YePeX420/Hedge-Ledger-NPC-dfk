// pool-cache.js
//
// Simple in-memory cache for DFK garden pools WITH full analytics (TVL, APRs).
//
// Source of truth: garden-analytics.getAllPoolAnalytics() (includes TVL)
// Fallback: onchain-data.getGardenPools('dfk') (basic data only)
//
// Exports:
//
//  - getCachedPoolAnalytics() → { data: [...], lastUpdated }
//  - getCachedPool(pid)       → single pool or null
//  - searchCachedPools(q)     → fuzzy search
//  - forceRefreshPoolCache()  → manual refresh
//  - initializePoolCache()    → call on startup
//  - stopPoolCache()          → legacy no-op
//  - isCacheReady()           → true if cache has pools (for cache-ready-queue)
//
// Default export includes all of the above.

import { getGardenPools } from './onchain-data.js';
import { getAllPoolAnalytics } from './garden-analytics.js';

// In-memory cache structure
let CACHE = {
  data: [],
  lastUpdated: 0,
};

const REFRESH_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

// --------------------------
// Internal: build cache entry from basic pool data (fallback)
// --------------------------
function buildBasicCacheEntry(pool) {
  // pool from getGardenPools has:
  // { pid, pair, lpToken, allocPoint, allocPercent, totalStaked, ... }
  return {
    pid: pool.pid,
    pairName: pool.pair,
    lpToken: pool.lpToken,

    // TVL & APR placeholders (basic fallback - no real values)
    totalTVL: 0,
    volume24hUSD: 0,
    fees24hUSD: 0,
    fee24hAPR: '0%',
    harvesting24hAPR: '0%',
    gardeningQuestAPR: { worst: '0%', best: '0%' },
    totalAPR: '0%',

    token0: pool.token0 || null,
    token1: pool.token1 || null,

    lastUpdated: Date.now(),
  };
}

// --------------------------
// Internal: build cache entry from full analytics (preferred)
// --------------------------
function buildAnalyticsCacheEntry(pool) {
  // pool from getAllPoolAnalytics has full data including TVL
  return {
    pid: pool.pid,
    pairName: pool.pairName || pool.pair,
    lpToken: pool.lpToken,

    // Real TVL and APR values from analytics
    totalTVL: pool.totalTVL || 0,
    v2TVL: pool.v2TVL || 0, // V2 staked TVL only (for accurate position calculations)
    volume24hUSD: pool.volume24hUSD || 0,
    fees24hUSD: pool.fees24hUSD || 0,
    fee24hAPR: pool.fee24hAPR || '0%',
    harvesting24hAPR: pool.harvesting24hAPR || '0%',
    gardeningQuestAPR: pool.gardeningQuestAPR || { worst: '0%', best: '0%' },
    totalAPR: pool.totalAPR || '0%',

    token0: pool.token0?.symbol || pool.token0 || null,
    token1: pool.token1?.symbol || pool.token1 || null,

    lastUpdated: Date.now(),
  };
}

// --------------------------
// Helper: timeout promise
// --------------------------
function timeoutPromise(ms, message) {
  return new Promise((_, reject) => 
    setTimeout(() => reject(new Error(message)), ms)
  );
}

// --------------------------
// Internal: refresh function (tries full analytics first, falls back to basic)
// --------------------------
async function refreshPoolCache() {
  try {
    console.log('[pool-cache] Refreshing pool cache from garden-analytics...');
    
    // Try full analytics first (has real TVL data) with 30s timeout
    try {
      const pools = await Promise.race([
        getAllPoolAnalytics(14), // 14 pools max
        timeoutPromise(30000, 'Analytics timeout after 30s')
      ]);
      
      // getAllPoolAnalytics returns an array directly (not { pools: [...] })
      if (Array.isArray(pools) && pools.length > 0) {
        const entries = pools.map(buildAnalyticsCacheEntry);
        
        CACHE = {
          data: entries,
          lastUpdated: Date.now(),
        };
        
        console.log(`[pool-cache] ✓ Cache refreshed with ${entries.length} pools (full analytics with TVL).`);
        return CACHE;
      }
    } catch (analyticsErr) {
      console.warn('[pool-cache] Full analytics failed, falling back to basic data:', analyticsErr.message);
    }
    
    // Fallback to basic pool data (no TVL)
    console.log('[pool-cache] Falling back to basic pool data...');
    const dfkPools = await getGardenPools('dfk');

    if (!dfkPools || dfkPools.length === 0) {
      console.warn(
        '[pool-cache] No pools returned from onchain-data. Keeping existing cache.'
      );
      return CACHE;
    }

    const entries = dfkPools.map(buildBasicCacheEntry);

    CACHE = {
      data: entries,
      lastUpdated: Date.now(),
    };

    console.log(`[pool-cache] ✓ Cache refreshed with ${entries.length} pools (basic, no TVL).`);
    return CACHE;
  } catch (err) {
    console.error('[pool-cache] Error refreshing pool cache:', err.message);
    return CACHE;
  }
}

// --------------------------
// Public: get full cache
// --------------------------
export function getCachedPoolAnalytics() {
  const now = Date.now();
  const age = now - CACHE.lastUpdated;

  if (age > REFRESH_INTERVAL_MS) {
    // fire-and-forget refresh in background
    refreshPoolCache().catch((err) =>
      console.error('[pool-cache] Background refresh failed:', err.message)
    );
  }

  return CACHE;
}

// --------------------------
// Public: legacy single-pool helper
// --------------------------
export function getCachedPool(pid) {
  const cache = getCachedPoolAnalytics();
  if (!cache?.data) return null;
  return cache.data.find((p) => p.pid === pid) || null;
}

// --------------------------
// Public: legacy search helper
// --------------------------
export function searchCachedPools(query) {
  const q = String(query || '').toLowerCase().trim();
  const cache = getCachedPoolAnalytics();
  if (!cache?.data || !q) return cache.data || [];

  return cache.data.filter((p) => {
    const pair = (p.pairName || '').toLowerCase();
    const token0 = (p.token0 || '').toLowerCase();
    const token1 = (p.token1 || '').toLowerCase();
    return pair.includes(q) || token0.includes(q) || token1.includes(q);
  });
}

// --------------------------
// Public: manual refresh
// --------------------------
export async function forceRefreshPoolCache() {
  console.log('[pool-cache] Force refresh requested.');
  return await refreshPoolCache();
}

// --------------------------
// Public: initialize on startup (fast start with background analytics)
// --------------------------
export async function initializePoolCache() {
  console.log('[pool-cache] Initializing pool cache...');
  
  // FAST: Get basic pool data first so bot can start
  try {
    console.log('[pool-cache] Loading basic pool data for fast startup...');
    const dfkPools = await getGardenPools('dfk');
    
    if (dfkPools && dfkPools.length > 0) {
      CACHE = {
        data: dfkPools.map(buildBasicCacheEntry),
        lastUpdated: Date.now(),
      };
      console.log(`[pool-cache] ✓ Fast startup with ${dfkPools.length} pools (basic data).`);
    }
  } catch (err) {
    console.warn('[pool-cache] Failed to load basic pools:', err.message);
  }
  
  // BACKGROUND: Load full analytics (async, don't await)
  console.log('[pool-cache] Starting background analytics refresh...');
  loadFullAnalyticsBackground().catch(err => {
    console.warn('[pool-cache] Background analytics failed:', err.message);
  });
}

// --------------------------
// Internal: load full analytics in background (no timeout)
// --------------------------
async function loadFullAnalyticsBackground() {
  try {
    const pools = await getAllPoolAnalytics(14);
    
    // getAllPoolAnalytics returns an array directly (not { pools: [...] })
    if (Array.isArray(pools) && pools.length > 0) {
      const entries = pools.map(buildAnalyticsCacheEntry);
      
      CACHE = {
        data: entries,
        lastUpdated: Date.now(),
      };
      
      console.log(`[pool-cache] ✓ Background analytics complete: ${entries.length} pools with real TVL.`);
    } else {
      console.warn('[pool-cache] Background analytics returned no pools');
    }
  } catch (err) {
    console.warn('[pool-cache] Background analytics failed:', err.message);
  }
}

// --------------------------
// Public: is cache ready? (used by cache-ready-queue.js)
// --------------------------
export function isCacheReady() {
  const cache = getCachedPoolAnalytics();
  return Array.isArray(cache.data) && cache.data.length > 0;
}

// --------------------------
// Public: stop cache (legacy no-op)
// Some older code imports stopPoolCache to clear intervals.
// We don't use an interval anymore, so this is intentionally a no-op.
// --------------------------
export function stopPoolCache() {
  console.log(
    '[pool-cache] stopPoolCache called (noop in current implementation).'
  );
}

// Default export
export default {
  getCachedPoolAnalytics,
  getCachedPool,
  searchCachedPools,
  forceRefreshPoolCache,
  initializePoolCache,
  isCacheReady,
  stopPoolCache,
};