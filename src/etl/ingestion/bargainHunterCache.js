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
 * Ensure the cache table exists
 */
async function ensureCacheTable() {
  const { rawPg } = await import('../../../server/db.js');
  
  await rawPg`
    CREATE TABLE IF NOT EXISTS bargain_hunter_cache (
      summon_type TEXT PRIMARY KEY,
      total_heroes INTEGER NOT NULL DEFAULT 0,
      total_pairs_scored INTEGER NOT NULL DEFAULT 0,
      token_prices JSON,
      top_pairs JSON,
      computed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;
}

/**
 * Check if tavern_heroes table exists and has data
 */
async function checkTavernHeroesTable() {
  const { rawPg } = await import('../../../server/db.js');
  
  try {
    const result = await rawPg`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'tavern_heroes'
      ) as exists
    `;
    if (!result[0]?.exists) {
      return { exists: false, count: 0 };
    }
    
    const countResult = await rawPg`SELECT COUNT(*) as cnt FROM tavern_heroes`;
    return { exists: true, count: parseInt(countResult[0]?.cnt || 0) };
  } catch (e) {
    return { exists: false, count: 0 };
  }
}

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
  const { calculateSummoningProbabilities, calculateTSProbabilities, calculateEliteExaltedChances } = await import('../../../summoning-engine.js');
  
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
  
  // Group heroes by rarity and take cheapest from each rarity tier
  // This ensures we have heroes from all rarity levels for fair comparisons
  const HEROES_PER_RARITY = 300; // 300 per rarity x 5 rarities = up to 1500 heroes
  const HIGH_LEVEL_PER_RARITY = 150; // Additional 150 heroes level 10+ per rarity
  const HIGH_LEVEL_THRESHOLD = 10;
  
  const heroesByRarity = { 0: [], 1: [], 2: [], 3: [], 4: [] };
  const highLevelByRarity = { 0: [], 1: [], 2: [], 3: [], 4: [] };
  
  for (const h of eligibleHeroes) {
    const rarity = h.rarity || 0;
    if (rarity >= 0 && rarity <= 4) {
      heroesByRarity[rarity].push(h);
      // Also track high-level heroes separately
      if ((h.level || 1) >= HIGH_LEVEL_THRESHOLD) {
        highLevelByRarity[rarity].push(h);
      }
    }
  }
  
  // Sort each rarity by price and take cheapest
  const selectedHeroIds = new Set();
  const selectedHeroes = [];
  const RARITY_LABELS = ['Common', 'Uncommon', 'Rare', 'Legendary', 'Mythic'];
  
  for (let r = 0; r <= 4; r++) {
    // Take cheapest 300 from each rarity
    heroesByRarity[r].sort((a, b) => (parseFloat(a.price_native) || 0) - (parseFloat(b.price_native) || 0));
    const cheapest = heroesByRarity[r].slice(0, HEROES_PER_RARITY);
    for (const h of cheapest) {
      if (!selectedHeroIds.has(h.hero_id)) {
        selectedHeroIds.add(h.hero_id);
        selectedHeroes.push(h);
      }
    }
    
    // Also take up to 150 high-level heroes (level 10+) per rarity, sorted by price
    // This ensures level filters work across all rarities
    highLevelByRarity[r].sort((a, b) => (parseFloat(a.price_native) || 0) - (parseFloat(b.price_native) || 0));
    let highLevelAdded = 0;
    for (const h of highLevelByRarity[r]) {
      if (!selectedHeroIds.has(h.hero_id)) {
        selectedHeroIds.add(h.hero_id);
        selectedHeroes.push(h);
        highLevelAdded++;
        if (highLevelAdded >= HIGH_LEVEL_PER_RARITY) break;
      }
    }
    
    const totalForRarity = cheapest.length + highLevelAdded;
    console.log(`[BargainCache] ${RARITY_LABELS[r]}: ${heroesByRarity[r].length} available, ${cheapest.length} cheapest + ${highLevelAdded} high-level = ${totalForRarity} selected`);
  }
  
  eligibleHeroes = selectedHeroes;
  console.log(`[BargainCache] Selected ${eligibleHeroes.length} heroes across all rarities (including high-level heroes)`);
  
  // Skill ID to name mappings (same as gene-decoder.js)
  const ACTIVE_GENES = {
    0: 'Poisoned Blade', 1: 'Blinding Winds', 2: 'Heal', 3: 'Cleanse',
    4: 'Iron Skin', 5: 'Speed', 6: 'Critical Aim', 7: 'Deathmark',
    16: 'Exhaust', 17: 'Daze', 18: 'Explosion', 19: 'Hardened Shield',
    24: 'Stun', 25: 'Second Wind', 28: 'Resurrection'
  };
  const PASSIVE_GENES = {
    0: 'Duelist', 1: 'Clutch', 2: 'Foresight', 3: 'Headstrong',
    4: 'Clear Vision', 5: 'Fearless', 6: 'Chatterbox', 7: 'Stalwart',
    16: 'Leadership', 17: 'Efficient', 18: 'Intimidation', 19: 'Toxic',
    24: 'Giant Slayer', 25: 'Last Stand', 28: 'Second Life'
  };
  
  // All known active skill names for validation
  const ACTIVE_SKILL_NAMES = new Set(Object.values(ACTIVE_GENES));
  const PASSIVE_SKILL_NAMES = new Set(Object.values(PASSIVE_GENES));
  
  // Convert ability_X format, raw ID, or pass through valid skill name
  function getActiveSkillName(val) {
    if (!val) return 'Poisoned Blade';
    // If already a valid skill name string, pass through
    if (typeof val === 'string' && ACTIVE_SKILL_NAMES.has(val)) {
      return val;
    }
    // Handle ability_X format
    if (typeof val === 'string' && val.startsWith('ability_')) {
      const id = parseInt(val.replace('ability_', ''));
      return ACTIVE_GENES[id] || 'Poisoned Blade';
    }
    // Handle numeric ID
    const id = parseInt(val);
    if (isNaN(id)) return 'Poisoned Blade';
    return ACTIVE_GENES[id] || 'Poisoned Blade';
  }
  function getPassiveSkillName(val) {
    if (!val) return 'Duelist';
    // If already a valid skill name string, pass through
    if (typeof val === 'string' && PASSIVE_SKILL_NAMES.has(val)) {
      return val;
    }
    // Handle ability_X format
    if (typeof val === 'string' && val.startsWith('ability_')) {
      const id = parseInt(val.replace('ability_', ''));
      return PASSIVE_GENES[id] || 'Duelist';
    }
    // Handle numeric ID
    const id = parseInt(val);
    if (isNaN(id)) return 'Duelist';
    return PASSIVE_GENES[id] || 'Duelist';
  }
  
  // Build genetics from indexed data - must match structure expected by calculateSummoningProbabilities
  function buildGeneticsFromIndex(h) {
    return {
      mainClass: { dominant: h.main_class, R1: h.main_class_r1, R2: h.main_class_r2, R3: h.main_class_r3 },
      subClass: { dominant: h.sub_class, R1: h.sub_class_r1, R2: h.sub_class_r2, R3: h.sub_class_r3 },
      profession: { dominant: h.profession, R1: h.profession, R2: h.profession, R3: h.profession },
      active1: { 
        dominant: getActiveSkillName(h.active1), 
        R1: getActiveSkillName(h.active1_r1), 
        R2: getActiveSkillName(h.active1_r2), 
        R3: getActiveSkillName(h.active1_r3) 
      },
      active2: { 
        dominant: getActiveSkillName(h.active2), 
        R1: getActiveSkillName(h.active2_r1), 
        R2: getActiveSkillName(h.active2_r2), 
        R3: getActiveSkillName(h.active2_r3) 
      },
      passive1: { 
        dominant: getPassiveSkillName(h.passive1), 
        R1: getPassiveSkillName(h.passive1_r1), 
        R2: getPassiveSkillName(h.passive1_r2), 
        R3: getPassiveSkillName(h.passive1_r3) 
      },
      passive2: { 
        dominant: getPassiveSkillName(h.passive2), 
        R1: getPassiveSkillName(h.passive2_r1), 
        R2: getPassiveSkillName(h.passive2_r2), 
        R3: getPassiveSkillName(h.passive2_r3) 
      },
      // Visual genes required by summoning engine - use placeholder values since we don't need visual results
      visual: {
        gender: { dominant: 0, R1: 0, R2: 0, R3: 0 },
        headAppendage: { dominant: 0, R1: 0, R2: 0, R3: 0 },
        backAppendage: { dominant: 0, R1: 0, R2: 0, R3: 0 },
        background: { dominant: 0, R1: 0, R2: 0, R3: 0 },
        hairStyle: { dominant: 0, R1: 0, R2: 0, R3: 0 },
        hairColor: { dominant: 0, R1: 0, R2: 0, R3: 0 },
        eyeColor: { dominant: 0, R1: 0, R2: 0, R3: 0 },
        skinColor: { dominant: 0, R1: 0, R2: 0, R3: 0 },
        appendageColor: { dominant: 0, R1: 0, R2: 0, R3: 0 },
        backAppendageColor: { dominant: 0, R1: 0, R2: 0, R3: 0 },
        visualUnknown1: { dominant: 0, R1: 0, R2: 0, R3: 0 },
        visualUnknown2: { dominant: 0, R1: 0, R2: 0, R3: 0 }
      },
      // Stat boost and element genes - use placeholders
      statBoost1: { dominant: 0, R1: 0, R2: 0, R3: 0 },
      statBoost2: { dominant: 0, R1: 0, R2: 0, R3: 0 },
      element: { dominant: 0, R1: 0, R2: 0, R3: 0 },
      // Crafting genes - use placeholders
      crafting1: { dominant: 0, R1: 0, R2: 0, R3: 0 },
      crafting2: { dominant: 0, R1: 0, R2: 0, R3: 0 }
    };
  }
  
  // Pre-build genetics cache
  const geneticsCache = new Map();
  let genesBuilt = 0;
  for (const h of eligibleHeroes) {
    if (h.main_class_r1 !== null) {
      geneticsCache.set(String(h.hero_id), buildGeneticsFromIndex(h));
      genesBuilt++;
    }
  }
  console.log(`[BargainCache] Built genetics for ${genesBuilt} heroes (${eligibleHeroes.length - genesBuilt} missing r1 genes)`);
  
  // Group heroes by realm
  const byRealm = { cv: [], sd: [] };
  for (const h of eligibleHeroes) {
    if (byRealm[h.realm]) byRealm[h.realm].push(h);
  }
  console.log(`[BargainCache] Realm breakdown: CV=${byRealm.cv.length}, SD=${byRealm.sd.length}`);
  
  // Generate all same-realm pairs and score them
  const allPairs = [];
  let skippedNoGenetics = 0;
  let skippedProbError = 0;
  const RARITY_NAMES = ['Common', 'Uncommon', 'Rare', 'Legendary', 'Mythic'];
  
  // Summon cost formulas - matching bot.js for consistency
  // Each hero pays: baseCost + (perChildIncrease * summonsDone) + (generationIncrease * generation)
  function calculateSummonTokenCost(generation, totalSummoned, useDarkSummon = false) {
    const baseCost = 6;
    const perChildIncrease = 2;
    const generationIncrease = 10;
    let cost = baseCost + (perChildIncrease * totalSummoned) + (generationIncrease * generation);
    if (generation === 0 && cost > 30) cost = 30;
    if (useDarkSummon) cost = cost / 4;
    return cost;
  }
  
  // Class tier determines tear requirements - each hero contributes tears based on their class
  const CLASS_TIERS = {
    // Basic classes
    'Warrior': 'basic', 'Knight': 'basic', 'Thief': 'basic', 'Archer': 'basic',
    'Priest': 'basic', 'Wizard': 'basic', 'Monk': 'basic', 'Pirate': 'basic',
    // Advanced classes
    'Paladin': 'advanced', 'DarkKnight': 'advanced', 'Summoner': 'advanced', 'Ninja': 'advanced',
    'Shapeshifter': 'advanced', 'Bard': 'advanced', 'Seer': 'advanced', 'Berserker': 'advanced',
    // Elite classes
    'Legionnaire': 'elite', 'SpellBow': 'elite', 'Scholar': 'elite',
    // Exalted classes
    'DreadKnight': 'exalted', 'Dragoon': 'exalted', 'Sage': 'exalted'
  };
  const TEAR_BY_TIER = { basic: 10, advanced: 40, elite: 70, exalted: 100 };
  
  function getClassTier(className) {
    return CLASS_TIERS[className] || 'basic';
  }
  function getTearCountForClass(className) {
    const tier = getClassTier(className);
    return TEAR_BY_TIER[tier] || 10;
  }
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
        const summons1 = hero1.summons || 0;
        const summons2 = hero2.summons || 0;
        
        // Calculate costs - BOTH heroes pay fees (matching bot.js)
        const purchaseCost = (parseFloat(hero1.price_native) || 0) + (parseFloat(hero2.price_native) || 0);
        const summonCost1 = calculateSummonTokenCost(gen1, summons1, isDarkSummon);
        const summonCost2 = calculateSummonTokenCost(gen2, summons2, isDarkSummon);
        const summonTokenCost = summonCost1 + summonCost2;
        
        // Tears - BOTH heroes contribute based on their class tier (dark summon = 0 tears)
        const tearCount1 = isDarkSummon ? 0 : getTearCountForClass(hero1.main_class);
        const tearCount2 = isDarkSummon ? 0 : getTearCountForClass(hero2.main_class);
        const tearCount = tearCount1 + tearCount2;
        const tearCost = tearCount * tearPriceNative;
        const totalCost = purchaseCost + summonTokenCost + tearCost;
        const totalCostUsd = totalCost * tokenPrice;
        
        // Get genetics
        const genetics1 = geneticsCache.get(String(hero1.hero_id));
        const genetics2 = geneticsCache.get(String(hero2.hero_id));
        
        if (!genetics1 || !genetics2) {
          skippedNoGenetics++;
          continue;
        }
        
        // Calculate probabilities
        const rarity1 = RARITY_NAMES[hero1.rarity] || 'Common';
        const rarity2 = RARITY_NAMES[hero2.rarity] || 'Common';
        
        try {
          const probs = calculateSummoningProbabilities(genetics1, genetics2, rarity1, rarity2);
          if (!probs) {
            continue;
          }
          const tsData = calculateTSProbabilities(probs);
          
          // Calculate elite and exalted chances
          const eliteExalted = calculateEliteExaltedChances(tsData?.slotTierProbs);
          
          const expectedTS = tsData?.expectedTS || 0;
          // Use totalCost as denominator since USD prices may not be available
          const efficiency = totalCost > 0 ? expectedTS / totalCost : 0;
          
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
            // Cost breakdown for display
            costs: {
              purchaseCost: Math.round(purchaseCost * 100) / 100,
              summonTokenCost: Math.round(summonTokenCost * 100) / 100,
              tearCount,
              tearCost: Math.round(tearCost * 100) / 100
            },
            totalCost: Math.round(totalCost * 100) / 100,
            totalCostUsd: Math.round(totalCostUsd * 100) / 100,
            efficiency,
            eliteChance: eliteExalted.eliteChance,
            exaltedChance: eliteExalted.exaltedChance,
            maxSlotElite: eliteExalted.maxSlotElite || 0,
            maxSlotExalted: eliteExalted.maxSlotExalted || 0,
            ts: {
              expected: expectedTS,
              distribution: tsData?.tsProbabilities || {},
              cumulativeProbs: tsData?.cumulativeProbs || {}
            }
          });
        } catch (err) {
          skippedProbError++;
          // Skip pairs that fail probability calculation
        }
      }
    }
  }
  
  console.log(`[BargainCache] Scored ${allPairs.length} pairs for ${summonType} summoning (skipped: ${skippedNoGenetics} no-genetics, ${skippedProbError} prob-errors)`);
  
  // Group pairs by minimum rarity of the pair (the lower rarity determines pair tier)
  // This ensures we have top pairs for each rarity level
  const pairsByMinRarity = { 0: [], 1: [], 2: [], 3: [], 4: [] }; // Common(0) to Mythic(4)
  
  for (const pair of allPairs) {
    const minRarity = Math.min(pair.hero1.rarity, pair.hero2.rarity);
    pairsByMinRarity[minRarity].push(pair);
  }
  
  // Sort each rarity group by efficiency and take top N per group
  const PAIRS_PER_RARITY = 200; // 200 pairs per rarity = up to 1000 total
  const topPairs = [];
  
  for (let rarity = 0; rarity <= 4; rarity++) {
    const rarityPairs = pairsByMinRarity[rarity];
    rarityPairs.sort((a, b) => b.efficiency - a.efficiency);
    const topForRarity = rarityPairs.slice(0, PAIRS_PER_RARITY);
    topPairs.push(...topForRarity);
    console.log(`[BargainCache] Rarity ${RARITY_NAMES[rarity]}: ${rarityPairs.length} pairs, keeping top ${topForRarity.length}`);
  }
  
  // Final sort by efficiency for overall display
  topPairs.sort((a, b) => b.efficiency - a.efficiency);
  
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
    
    // Ensure cache table exists
    await ensureCacheTable();
    
    // Check if tavern_heroes table exists and has data
    const tavernStatus = await checkTavernHeroesTable();
    if (!tavernStatus.exists) {
      console.log('[BargainCache] tavern_heroes table does not exist. Run Tavern Indexer first.');
      cacheState.isRunning = false;
      cacheState.error = 'tavern_heroes table missing';
      return { status: 'error', error: 'Run the Tavern Indexer first to populate hero data' };
    }
    if (tavernStatus.count === 0) {
      console.log('[BargainCache] tavern_heroes table is empty. Run Tavern Indexer first.');
      cacheState.isRunning = false;
      cacheState.error = 'No heroes indexed';
      return { status: 'error', error: 'No heroes indexed. Run the Tavern Indexer first.' };
    }
    
    console.log(`[BargainCache] Found ${tavernStatus.count} heroes in tavern_heroes table`);
    
    // Mark cache as building (keep old 'ready' cache visible during build)
    await rawPg`DELETE FROM bargain_hunter_cache WHERE status = 'building'`;
    
    // Score regular summoning pairs
    console.log('[BargainCache] Scoring regular summoning pairs...');
    const regularResult = await scorePairsForCache('regular', 1000);
    
    // Insert new 'building' cache for regular (atomic swap step 1)
    await rawPg`
      INSERT INTO bargain_hunter_cache (summon_type, status, total_heroes, total_pairs_scored, token_prices, top_pairs, build_progress, build_started_at, computed_at)
      VALUES (
        'regular',
        'building',
        ${regularResult.totalHeroes},
        ${regularResult.totalPairsScored},
        ${JSON.stringify(regularResult.tokenPrices)}::json,
        ${JSON.stringify(regularResult.pairs)}::json,
        50,
        ${new Date().toISOString()},
        CURRENT_TIMESTAMP
      )
    `;
    cacheState.regularPairs = regularResult.totalPairsScored;
    
    // Score dark summoning pairs
    console.log('[BargainCache] Scoring dark summoning pairs...');
    const darkResult = await scorePairsForCache('dark', 1000);
    
    // Insert new 'building' cache for dark
    await rawPg`
      INSERT INTO bargain_hunter_cache (summon_type, status, total_heroes, total_pairs_scored, token_prices, top_pairs, build_progress, build_started_at, computed_at)
      VALUES (
        'dark',
        'building',
        ${darkResult.totalHeroes},
        ${darkResult.totalPairsScored},
        ${JSON.stringify(darkResult.tokenPrices)}::json,
        ${JSON.stringify(darkResult.pairs)}::json,
        100,
        ${new Date().toISOString()},
        CURRENT_TIMESTAMP
      )
    `;
    cacheState.darkPairs = darkResult.totalPairsScored;
    
    // Atomic swap: delete old 'ready' rows and promote 'building' to 'ready'
    console.log('[BargainCache] Performing atomic swap...');
    await rawPg`DELETE FROM bargain_hunter_cache WHERE status = 'ready'`;
    await rawPg`UPDATE bargain_hunter_cache SET status = 'ready', build_progress = 100 WHERE status = 'building'`;
    
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
 * Get cache status for UI display
 */
export async function getCacheStatus() {
  try {
    const { rawPg } = await import('../../../server/db.js');
    
    // Get both ready and building caches
    const result = await rawPg`
      SELECT summon_type, status, total_heroes, total_pairs_scored, build_progress, build_started_at, computed_at
      FROM bargain_hunter_cache
      ORDER BY summon_type, status
    `;
    
    const status = {
      regular: { ready: null, building: null },
      dark: { ready: null, building: null },
      isBuilding: cacheState.isRunning,
      lastRun: cacheState.lastRun,
      error: cacheState.error
    };
    
    for (const row of (result || [])) {
      const data = {
        totalHeroes: row.total_heroes,
        totalPairsScored: row.total_pairs_scored,
        buildProgress: row.build_progress,
        buildStartedAt: row.build_started_at,
        computedAt: row.computed_at
      };
      if (row.summon_type === 'regular') {
        status.regular[row.status] = data;
      } else if (row.summon_type === 'dark') {
        status.dark[row.status] = data;
      }
    }
    
    return status;
  } catch (error) {
    console.error('[BargainCache] Error getting cache status:', error.message);
    return {
      regular: { ready: null, building: null },
      dark: { ready: null, building: null },
      isBuilding: cacheState.isRunning,
      lastRun: cacheState.lastRun,
      error: error.message
    };
  }
}

/**
 * Get cached bargain pairs (only returns 'ready' status cache)
 */
export async function getCachedBargainPairs(summonType = 'regular') {
  try {
    const { rawPg } = await import('../../../server/db.js');
    
    // Only get 'ready' cache - 'building' is kept separate until swap
    const result = await rawPg`
      SELECT * FROM bargain_hunter_cache 
      WHERE summon_type = ${summonType} AND status = 'ready'
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
      computedAt: cache.computed_at,
      status: cache.status
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
