// pool-cache.js
//
// Simple in-memory cache for DFK garden pools WITH full analytics (TVL, APRs).
//
// Source of truth: garden-analytics.getAllPoolAnalytics() (includes TVL)
// Fallback: Database cache (persisted from last run)
// Last resort: onchain-data.getGardenPools('dfk') (basic data only)
//
// Startup flow:
//  1. Load from database cache (fast, real values from previous run)
//  2. Background refresh from blockchain (updates in-memory + database)
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
import { rawPg } from './server/db.js';

// In-memory cache structure
let CACHE = {
  data: [],
  lastUpdated: 0,
};

const REFRESH_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

// --------------------------
// Internal: Load cached analytics from database (fast startup with real values)
// --------------------------
async function loadFromDatabase() {
  try {
    const result = await rawPg`
      SELECT 
        pid, pair_name, lp_token, total_tvl, v1_tvl, v2_tvl, total_staked,
        volume_24h_usd, fees_24h_usd, fee_24h_apr, harvesting_24h_apr,
        gardening_quest_apr_worst, gardening_quest_apr_best, total_apr,
        token0, token1, updated_at
      FROM pool_analytics_cache
      ORDER BY pid ASC
    `;
    
    if (result.length === 0) {
      console.log('[pool-cache] No cached data in database yet');
      return null;
    }
    
    const entries = result.map(row => ({
      pid: row.pid,
      pairName: row.pair_name,
      lpToken: row.lp_token,
      totalTVL: parseFloat(row.total_tvl) || 0,
      v1TVL: parseFloat(row.v1_tvl) || 0,
      v2TVL: parseFloat(row.v2_tvl) || 0,
      totalStaked: row.total_staked || '0',
      volume24hUSD: parseFloat(row.volume_24h_usd) || 0,
      fees24hUSD: parseFloat(row.fees_24h_usd) || 0,
      fee24hAPR: row.fee_24h_apr || '0%',
      harvesting24hAPR: row.harvesting_24h_apr || '0%',
      gardeningQuestAPR: {
        worst: row.gardening_quest_apr_worst || '0%',
        best: row.gardening_quest_apr_best || '0%',
      },
      totalAPR: row.total_apr || '0%',
      token0: row.token0,
      token1: row.token1,
      lastUpdated: new Date(row.updated_at).getTime(),
    }));
    
    console.log(`[pool-cache] ✓ Loaded ${entries.length} pools from database cache`);
    return entries;
  } catch (err) {
    console.warn('[pool-cache] Failed to load from database:', err.message);
    return null;
  }
}

// --------------------------
// Internal: Save cache entries to database for next startup
// --------------------------
async function saveToDatabase(entries) {
  if (!entries || entries.length === 0) return;
  
  try {
    // Ensure table exists
    await rawPg`
      CREATE TABLE IF NOT EXISTS pool_analytics_cache (
        id SERIAL PRIMARY KEY,
        pid INTEGER NOT NULL UNIQUE,
        pair_name TEXT NOT NULL,
        lp_token TEXT NOT NULL,
        total_tvl NUMERIC(38, 2) DEFAULT 0,
        v1_tvl NUMERIC(38, 2) DEFAULT 0,
        v2_tvl NUMERIC(38, 2) DEFAULT 0,
        total_staked TEXT DEFAULT '0',
        volume_24h_usd NUMERIC(38, 2) DEFAULT 0,
        fees_24h_usd NUMERIC(38, 2) DEFAULT 0,
        fee_24h_apr TEXT DEFAULT '0%',
        harvesting_24h_apr TEXT DEFAULT '0%',
        gardening_quest_apr_worst TEXT DEFAULT '0%',
        gardening_quest_apr_best TEXT DEFAULT '0%',
        total_apr TEXT DEFAULT '0%',
        token0 TEXT,
        token1 TEXT,
        updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
      )
    `;
    
    for (const entry of entries) {
      await rawPg`
        INSERT INTO pool_analytics_cache (
          pid, pair_name, lp_token, total_tvl, v1_tvl, v2_tvl, total_staked,
          volume_24h_usd, fees_24h_usd, fee_24h_apr, harvesting_24h_apr,
          gardening_quest_apr_worst, gardening_quest_apr_best, total_apr,
          token0, token1, updated_at
        ) VALUES (
          ${entry.pid},
          ${entry.pairName || ''},
          ${entry.lpToken || ''},
          ${entry.totalTVL || 0},
          ${entry.v1TVL || 0},
          ${entry.v2TVL || 0},
          ${entry.totalStaked || '0'},
          ${entry.volume24hUSD || 0},
          ${entry.fees24hUSD || 0},
          ${entry.fee24hAPR || '0%'},
          ${entry.harvesting24hAPR || '0%'},
          ${entry.gardeningQuestAPR?.worst || '0%'},
          ${entry.gardeningQuestAPR?.best || '0%'},
          ${entry.totalAPR || '0%'},
          ${entry.token0 || null},
          ${entry.token1 || null},
          CURRENT_TIMESTAMP
        )
        ON CONFLICT (pid) DO UPDATE SET
          pair_name = EXCLUDED.pair_name,
          lp_token = EXCLUDED.lp_token,
          total_tvl = EXCLUDED.total_tvl,
          v1_tvl = EXCLUDED.v1_tvl,
          v2_tvl = EXCLUDED.v2_tvl,
          total_staked = EXCLUDED.total_staked,
          volume_24h_usd = EXCLUDED.volume_24h_usd,
          fees_24h_usd = EXCLUDED.fees_24h_usd,
          fee_24h_apr = EXCLUDED.fee_24h_apr,
          harvesting_24h_apr = EXCLUDED.harvesting_24h_apr,
          gardening_quest_apr_worst = EXCLUDED.gardening_quest_apr_worst,
          gardening_quest_apr_best = EXCLUDED.gardening_quest_apr_best,
          total_apr = EXCLUDED.total_apr,
          token0 = EXCLUDED.token0,
          token1 = EXCLUDED.token1,
          updated_at = CURRENT_TIMESTAMP
      `;
    }
    
    console.log(`[pool-cache] ✓ Saved ${entries.length} pools to database cache`);
  } catch (err) {
    console.warn('[pool-cache] Failed to save to database:', err.message);
  }
}

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
    totalStaked: pool.totalStaked || '0', // Total LP staked in pool
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
    v1TVL: pool.v1TVL || 0, // V1 legacy staked TVL (for accurate total TVL)
    v2TVL: pool.v2TVL || 0, // V2 staked TVL only (for accurate position calculations)
    totalStaked: pool.totalStaked || '0', // Total LP staked in pool (for accurate pool share %)
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
        
        // Save to database for fast startup next time
        saveToDatabase(entries).catch(err => console.warn('[pool-cache] Failed to save to DB:', err.message));
        
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
// Public: initialize on startup (fast start with database cache, then background refresh)
// --------------------------
export async function initializePoolCache() {
  console.log('[pool-cache] Initializing pool cache...');
  
  // FAST: Load from database first (real values from previous run)
  try {
    const dbEntries = await loadFromDatabase();
    if (dbEntries && dbEntries.length > 0) {
      CACHE = {
        data: dbEntries,
        lastUpdated: Date.now(),
      };
      console.log(`[pool-cache] ✓ Fast startup with ${dbEntries.length} pools from database cache`);
    } else {
      // No database cache - fall back to basic pool data
      console.log('[pool-cache] No database cache, loading basic pool data...');
      const dfkPools = await getGardenPools('dfk');
      
      if (dfkPools && dfkPools.length > 0) {
        CACHE = {
          data: dfkPools.map(buildBasicCacheEntry),
          lastUpdated: Date.now(),
        };
        console.log(`[pool-cache] ✓ Fast startup with ${dfkPools.length} pools (basic data).`);
      }
    }
  } catch (err) {
    console.warn('[pool-cache] Failed to load initial data:', err.message);
    // Last resort - try basic pool data
    try {
      const dfkPools = await getGardenPools('dfk');
      if (dfkPools && dfkPools.length > 0) {
        CACHE = {
          data: dfkPools.map(buildBasicCacheEntry),
          lastUpdated: Date.now(),
        };
      }
    } catch (e) {
      console.warn('[pool-cache] Basic pool fallback also failed:', e.message);
    }
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
      
      // Save to database for fast startup next time
      await saveToDatabase(entries);
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