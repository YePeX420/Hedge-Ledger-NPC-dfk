/**
 * Bargain Hunter Cache Service
 * 
 * Pre-computes and caches hero pair scores for fast Bargain Hunter page loads.
 * Runs after tavern indexer completes to ensure fresh data.
 */

import { db } from '../../../server/db.js';
import { sql } from 'drizzle-orm';

// Cache state tracking
let cacheState = {
  isRunning: false,
  lastRun: null,
  regularPairs: 0,
  darkPairs: 0,
  error: null
};

/**
 * Fetch current token prices from the DEX price graph
 */
async function getTokenPrices() {
  const CRYSTAL_ADDRESS = '0x04b9dA42306B023f3572e106B11D82aAd9D32EBb'.toLowerCase();
  const JEWEL_ADDRESS = '0xCCb93dABD71c8Dad03Fc4CE5559dC3D89F67a260'.toLowerCase();
  
  let crystalPriceUsd = 0;
  let jewelPriceUsd = 0;
  
  try {
    const { rawPg } = await import('../../../server/db.js');
    
    // Get from fast focused price graph (DFK DEX prices)
    const priceResult = await rawPg`
      SELECT token_address, price_usd 
      FROM token_price_graph 
      WHERE token_address IN (${CRYSTAL_ADDRESS}, ${JEWEL_ADDRESS})
    `;
    
    for (const row of priceResult) {
      const addr = row.token_address?.toLowerCase();
      const price = parseFloat(row.price_usd) || 0;
      if (addr === CRYSTAL_ADDRESS) crystalPriceUsd = price;
      if (addr === JEWEL_ADDRESS) jewelPriceUsd = price;
    }
  } catch (e) {
    console.error('[BargainCache] Error fetching prices:', e.message);
  }
  
  return { CRYSTAL: crystalPriceUsd, JEWEL: jewelPriceUsd };
}

/**
 * Score all hero pairs for bargain hunting and cache results
 * @param {string} summonType - 'regular' or 'dark'
 * @param {number} limit - Max pairs to cache (default 1000)
 */
async function scorePairsForCache(summonType = 'regular', limit = 1000) {
  const { rawPg } = await import('../../../server/db.js');
  const { decodeStatGenes } = await import('../../../gene-decoder.js');
  const { calculateSummoningProbabilities, calculateTTSProbabilities } = await import('../../../bot.js');
  
  const isDarkSummon = summonType === 'dark';
  const prices = await getTokenPrices();
  
  // Fetch all indexed heroes with complete genes
  const heroesResult = await rawPg`
    SELECT * FROM tavern_heroes 
    WHERE genes_status = 'complete'
    ORDER BY price_native ASC NULLS LAST
  `;
  
  const heroes = heroesResult || [];
  console.log(`[BargainCache] Loaded ${heroes.length} heroes with complete genes`);
  
  if (heroes.length < 2) {
    console.log('[BargainCache] Not enough heroes to score pairs');
    return { pairs: [], totalHeroes: heroes.length, totalPairsScored: 0 };
  }
  
  // Filter heroes based on summon type
  let eligibleHeroes = heroes.filter(h => {
    const summonsRemaining = (h.max_summons || 0) - (h.summons || 0);
    // Dark summon can use any hero; regular summon needs summons remaining
    if (!isDarkSummon && summonsRemaining < 1) return false;
    return true;
  });
  
  console.log(`[BargainCache] ${eligibleHeroes.length} eligible heroes for ${summonType} summoning`);
  
  // Build genetics from indexed data
  function buildGeneticsFromIndex(h) {
    return {
      statGenes: {
        class: { dominant: h.main_class, R1: h.main_class_r1, R2: h.main_class_r2, R3: h.main_class_r3 },
        subClass: { dominant: h.sub_class, R1: h.sub_class_r1, R2: h.sub_class_r2, R3: h.sub_class_r3 },
        profession: { dominant: h.profession, R1: h.profession, R2: h.profession, R3: h.profession },
        active1: { dominant: h.active1, R1: h.active1_r1, R2: h.active1_r2, R3: h.active1_r3 },
        active2: { dominant: h.active2, R1: h.active2_r1, R2: h.active2_r2, R3: h.active2_r3 },
        passive1: { dominant: h.passive1, R1: h.passive1_r1, R2: h.passive1_r2, R3: h.passive1_r3 },
        passive2: { dominant: h.passive2, R1: h.passive2_r1, R2: h.passive2_r2, R3: h.passive2_r3 }
      }
    };
  }
  
  // Pre-build genetics cache
  const geneticsCache = new Map();
  for (const h of eligibleHeroes) {
    if (h.main_class_r1 !== null) {
      geneticsCache.set(String(h.hero_id), buildGeneticsFromIndex(h));
    }
  }
  
  // Group heroes by realm
  const byRealm = { cv: [], sd: [] };
  for (const h of eligibleHeroes) {
    if (byRealm[h.realm]) byRealm[h.realm].push(h);
  }
  
  // Generate all same-realm pairs and score them
  const allPairs = [];
  const RARITY_NAMES = ['Common', 'Uncommon', 'Rare', 'Legendary', 'Mythic'];
  
  // Summon cost formulas
  const getBaseSummonCost = (gen) => 6 + (gen * 2);
  const getTearCount = (gen1, gen2) => Math.max(1, Math.floor((gen1 + gen2 + 2) / 4));
  const tearPriceNative = 0.05;
  
  for (const realm of ['cv', 'sd']) {
    const realmHeroes = byRealm[realm] || [];
    if (realmHeroes.length < 2) continue;
    
    const tokenPrice = realm === 'cv' ? prices.CRYSTAL : prices.JEWEL;
    const nativeToken = realm === 'cv' ? 'CRYSTAL' : 'JEWEL';
    
    // Generate all unique pairs
    for (let i = 0; i < realmHeroes.length; i++) {
      for (let j = i + 1; j < realmHeroes.length; j++) {
        const hero1 = realmHeroes[i];
        const hero2 = realmHeroes[j];
        
        const gen1 = hero1.generation || 0;
        const gen2 = hero2.generation || 0;
        
        // Calculate costs
        const purchaseCost = (parseFloat(hero1.price_native) || 0) + (parseFloat(hero2.price_native) || 0);
        let summonTokenCost = getBaseSummonCost(Math.max(gen1, gen2));
        if (isDarkSummon) summonTokenCost = summonTokenCost / 4;
        
        const tearCount = getTearCount(gen1, gen2);
        const tearCost = tearCount * tearPriceNative;
        const totalCost = purchaseCost + summonTokenCost + tearCost;
        const totalCostUsd = totalCost * tokenPrice;
        
        // Get genetics
        const genetics1 = geneticsCache.get(String(hero1.hero_id));
        const genetics2 = geneticsCache.get(String(hero2.hero_id));
        
        if (!genetics1 || !genetics2) continue;
        
        // Calculate probabilities
        const rarity1 = RARITY_NAMES[hero1.rarity] || 'Common';
        const rarity2 = RARITY_NAMES[hero2.rarity] || 'Common';
        
        try {
          const probs = calculateSummoningProbabilities(genetics1, genetics2, rarity1, rarity2);
          const ttsData = calculateTTSProbabilities(probs);
          
          const expectedTTS = ttsData?.expectedTTS || 0;
          const efficiency = totalCostUsd > 0 ? expectedTTS / totalCostUsd : 0;
          
          allPairs.push({
            hero1: {
              id: String(hero1.hero_id),
              normalizedId: hero1.normalized_id || 0,
              mainClass: hero1.main_class,
              subClass: hero1.sub_class,
              profession: hero1.profession,
              rarity: hero1.rarity,
              level: hero1.level || 1,
              generation: gen1,
              summonsRemaining: (hero1.max_summons || 0) - (hero1.summons || 0),
              summons: hero1.summons || 0,
              price: parseFloat(hero1.price_native) || 0,
              token: nativeToken,
              realm
            },
            hero2: {
              id: String(hero2.hero_id),
              normalizedId: hero2.normalized_id || 0,
              mainClass: hero2.main_class,
              subClass: hero2.sub_class,
              profession: hero2.profession,
              rarity: hero2.rarity,
              level: hero2.level || 1,
              generation: gen2,
              summonsRemaining: (hero2.max_summons || 0) - (hero2.summons || 0),
              summons: hero2.summons || 0,
              price: parseFloat(hero2.price_native) || 0,
              token: nativeToken,
              realm
            },
            realm,
            totalCost: Math.round(totalCost * 100) / 100,
            totalCostUsd: Math.round(totalCostUsd * 100) / 100,
            efficiency,
            tts: {
              expected: expectedTTS,
              distribution: ttsData?.distribution || {},
              cumulativeProbs: ttsData?.cumulativeProbs || {}
            }
          });
        } catch (err) {
          // Skip pairs that fail probability calculation
        }
      }
    }
  }
  
  console.log(`[BargainCache] Scored ${allPairs.length} pairs for ${summonType} summoning`);
  
  // Sort by TTS efficiency (TTS per dollar) and take top N
  allPairs.sort((a, b) => b.efficiency - a.efficiency);
  const topPairs = allPairs.slice(0, limit);
  
  return {
    pairs: topPairs,
    totalHeroes: eligibleHeroes.length,
    totalPairsScored: allPairs.length,
    tokenPrices: prices
  };
}

/**
 * Refresh the bargain hunter cache for both summon types
 */
export async function refreshBargainHunterCache() {
  if (cacheState.isRunning) {
    console.log('[BargainCache] Already running, skipping');
    return { status: 'already_running' };
  }
  
  cacheState.isRunning = true;
  cacheState.error = null;
  const startTime = Date.now();
  
  try {
    const { rawPg } = await import('../../../server/db.js');
    
    console.log('[BargainCache] Starting cache refresh...');
    
    // Score regular summoning pairs
    console.log('[BargainCache] Scoring regular summoning pairs...');
    const regularResult = await scorePairsForCache('regular', 1000);
    
    // Store regular cache
    await rawPg`
      INSERT INTO bargain_hunter_cache (summon_type, total_heroes, total_pairs_scored, token_prices, top_pairs, computed_at)
      VALUES (
        'regular',
        ${regularResult.totalHeroes},
        ${regularResult.totalPairsScored},
        ${JSON.stringify(regularResult.tokenPrices)}::json,
        ${JSON.stringify(regularResult.pairs)}::json,
        CURRENT_TIMESTAMP
      )
      ON CONFLICT (summon_type) DO UPDATE SET
        total_heroes = EXCLUDED.total_heroes,
        total_pairs_scored = EXCLUDED.total_pairs_scored,
        token_prices = EXCLUDED.token_prices,
        top_pairs = EXCLUDED.top_pairs,
        computed_at = EXCLUDED.computed_at
    `;
    cacheState.regularPairs = regularResult.totalPairsScored;
    
    // Score dark summoning pairs
    console.log('[BargainCache] Scoring dark summoning pairs...');
    const darkResult = await scorePairsForCache('dark', 1000);
    
    // Store dark cache
    await rawPg`
      INSERT INTO bargain_hunter_cache (summon_type, total_heroes, total_pairs_scored, token_prices, top_pairs, computed_at)
      VALUES (
        'dark',
        ${darkResult.totalHeroes},
        ${darkResult.totalPairsScored},
        ${JSON.stringify(darkResult.tokenPrices)}::json,
        ${JSON.stringify(darkResult.pairs)}::json,
        CURRENT_TIMESTAMP
      )
      ON CONFLICT (summon_type) DO UPDATE SET
        total_heroes = EXCLUDED.total_heroes,
        total_pairs_scored = EXCLUDED.total_pairs_scored,
        token_prices = EXCLUDED.token_prices,
        top_pairs = EXCLUDED.top_pairs,
        computed_at = EXCLUDED.computed_at
    `;
    cacheState.darkPairs = darkResult.totalPairsScored;
    
    const duration = Date.now() - startTime;
    cacheState.lastRun = new Date().toISOString();
    cacheState.isRunning = false;
    
    console.log(`[BargainCache] Cache refresh complete in ${Math.round(duration / 1000)}s`);
    console.log(`[BargainCache] Regular: ${regularResult.totalPairsScored} pairs, Dark: ${darkResult.totalPairsScored} pairs`);
    
    return {
      status: 'success',
      regular: { totalPairs: regularResult.totalPairsScored, cached: regularResult.pairs.length },
      dark: { totalPairs: darkResult.totalPairsScored, cached: darkResult.pairs.length },
      duration
    };
    
  } catch (error) {
    console.error('[BargainCache] Error refreshing cache:', error.message);
    cacheState.error = error.message;
    cacheState.isRunning = false;
    
    return { status: 'error', error: error.message };
  }
}

/**
 * Get cached bargain pairs
 */
export async function getCachedBargainPairs(summonType = 'regular') {
  try {
    const { rawPg } = await import('../../../server/db.js');
    
    const result = await rawPg`
      SELECT * FROM bargain_hunter_cache WHERE summon_type = ${summonType}
    `;
    
    if (!result || result.length === 0) {
      return null;
    }
    
    const cache = result[0];
    return {
      pairs: cache.top_pairs || [],
      totalHeroes: cache.total_heroes || 0,
      totalPairsScored: cache.total_pairs_scored || 0,
      tokenPrices: cache.token_prices || {},
      computedAt: cache.computed_at
    };
    
  } catch (error) {
    console.error('[BargainCache] Error reading cache:', error.message);
    return null;
  }
}

/**
 * Get cache status
 */
export function getCacheStatus() {
  return { ...cacheState };
}
