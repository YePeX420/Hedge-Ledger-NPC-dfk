/**
 * Tavern Heroes Indexer
 * 
 * Indexes heroes for sale from DFK marketplace (Crystalvale + Sundered Isles)
 * Refreshes every 30 minutes with parallel workers
 * Pre-computes Team Trait Scores (TTS) for tournament filtering
 */

import { db } from '../../../server/db.js';
import { sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { lookupStone } from '../../data/enhancementStones.js';

// Configuration
const DFK_TAVERN_API = 'https://api.defikingdoms.com/communityAllPublicHeroSaleAuctions';
const NUM_WORKERS = 3;
const BATCH_SIZE = 100;
const AUTO_RUN_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
const FETCH_LIMIT = 500; // Max heroes to fetch per realm

// Hero ID ranges for realm detection
const CV_ID_MIN = BigInt("1000000000000");
const CV_ID_MAX = BigInt("2000000000000");

// Class and profession mappings
const CLASS_NAMES = {
  0: 'Warrior', 1: 'Knight', 2: 'Thief', 3: 'Archer', 4: 'Priest', 5: 'Wizard',
  6: 'Monk', 7: 'Pirate', 8: 'Berserker', 9: 'Seer', 10: 'Legionnaire', 11: 'Scholar',
  16: 'Paladin', 17: 'DarkKnight', 18: 'Summoner', 19: 'Ninja', 20: 'Shapeshifter',
  21: 'Bard', 24: 'Dragoon', 25: 'Sage', 26: 'SpellBow', 28: 'DreadKnight'
};

const PROFESSION_NAMES = {
  0: 'mining', 2: 'gardening', 4: 'fishing', 6: 'foraging'
};

// State management
let indexerState = {
  isRunning: false,
  startedAt: null,
  batchId: null,
  workers: [],
  totalHeroesIndexed: 0,
  errors: []
};

let autoRunInterval = null;
let tablesInitialized = false;

// ============================================================================
// TRAIT SCORE CALCULATION
// ============================================================================

/**
 * Calculate trait tier points from ability ID
 * Active: IDs 0-14 → Basic (0-7)=0, Advanced (8-11)=1, Elite (12-13)=2, Exalted (14)=3
 * Passive: IDs 16-30 → Basic (16-23)=0, Advanced (24-27)=1, Elite (28-29)=2, Exalted (30)=3
 */
function getAbilityTierPoints(abilitySlot) {
  if (abilitySlot == null) return 0;
  
  let id;
  if (typeof abilitySlot === 'string') {
    const match = abilitySlot.match(/ability_(\d+)/);
    if (!match) return 0;
    id = parseInt(match[1], 10);
  } else {
    id = abilitySlot;
  }
  
  // Active abilities (0-14)
  if (id >= 0 && id <= 14) {
    if (id <= 7) return 0;      // Basic
    if (id <= 11) return 1;     // Advanced
    if (id <= 13) return 2;     // Elite
    return 3;                   // Exalted (14)
  }
  
  // Passive abilities (16-30)
  if (id >= 16 && id <= 30) {
    if (id <= 23) return 0;     // Basic
    if (id <= 27) return 1;     // Advanced
    if (id <= 29) return 2;     // Elite
    return 3;                   // Exalted (30)
  }
  
  return 0;
}

function calculateHeroTraitScore(hero) {
  return getAbilityTierPoints(hero.active1) +
         getAbilityTierPoints(hero.active2) +
         getAbilityTierPoints(hero.passive1) +
         getAbilityTierPoints(hero.passive2);
}

// ============================================================================
// DATABASE OPERATIONS
// ============================================================================

async function ensureTablesExist() {
  if (tablesInitialized) return;
  
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS tavern_heroes (
        id SERIAL PRIMARY KEY,
        hero_id TEXT NOT NULL UNIQUE,
        normalized_id BIGINT NOT NULL,
        realm TEXT NOT NULL,
        main_class TEXT NOT NULL,
        sub_class TEXT,
        profession TEXT,
        rarity INTEGER NOT NULL DEFAULT 0,
        level INTEGER NOT NULL DEFAULT 1,
        generation INTEGER NOT NULL DEFAULT 0,
        summons INTEGER NOT NULL DEFAULT 0,
        max_summons INTEGER NOT NULL DEFAULT 0,
        strength INTEGER DEFAULT 0,
        agility INTEGER DEFAULT 0,
        intelligence INTEGER DEFAULT 0,
        wisdom INTEGER DEFAULT 0,
        luck INTEGER DEFAULT 0,
        dexterity INTEGER DEFAULT 0,
        vitality INTEGER DEFAULT 0,
        endurance INTEGER DEFAULT 0,
        hp INTEGER DEFAULT 0,
        mp INTEGER DEFAULT 0,
        stamina INTEGER DEFAULT 25,
        active1 TEXT,
        active2 TEXT,
        passive1 TEXT,
        passive2 TEXT,
        trait_score INTEGER NOT NULL DEFAULT 0,
        combat_power INTEGER NOT NULL DEFAULT 0,
        sale_price TEXT,
        price_native NUMERIC(30, 8),
        native_token TEXT,
        indexed_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
        batch_id TEXT
      )
    `);
    
    await db.execute(sql`CREATE INDEX IF NOT EXISTS tavern_heroes_realm_idx ON tavern_heroes(realm)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS tavern_heroes_main_class_idx ON tavern_heroes(main_class)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS tavern_heroes_trait_score_idx ON tavern_heroes(trait_score)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS tavern_heroes_price_native_idx ON tavern_heroes(price_native)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS tavern_heroes_batch_id_idx ON tavern_heroes(batch_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS tavern_heroes_rarity_idx ON tavern_heroes(rarity)`);
    
    // Add combat_power column if it doesn't exist (migration for existing tables)
    // This must run BEFORE index creation that uses this column
    try {
      await db.execute(sql`ALTER TABLE tavern_heroes ADD COLUMN IF NOT EXISTS combat_power INTEGER NOT NULL DEFAULT 0`);
    } catch (err) {
      if (!err.message?.includes('already exists') && !err.message?.includes('duplicate column')) {
        console.log('[TavernIndexer] Note: combat_power column check:', err.message);
      }
    }
    
    // Add summon_stone column to track Enhancement Stone usage during summoning
    // Null address (0x000...000) = no stone used, real address = stone contract was used
    try {
      await db.execute(sql`ALTER TABLE tavern_heroes ADD COLUMN IF NOT EXISTS summon_stone TEXT`);
    } catch (err) {
      if (!err.message?.includes('already exists') && !err.message?.includes('duplicate column')) {
        console.log('[TavernIndexer] Note: summon_stone column check:', err.message);
      }
    }
    
    // Add stone_tier (lesser/normal/greater) and stone_type (might/finesse/etc) for decoded stone info
    try {
      await db.execute(sql`ALTER TABLE tavern_heroes ADD COLUMN IF NOT EXISTS stone_tier TEXT`);
      await db.execute(sql`ALTER TABLE tavern_heroes ADD COLUMN IF NOT EXISTS stone_type TEXT`);
    } catch (err) {
      if (!err.message?.includes('already exists') && !err.message?.includes('duplicate column')) {
        console.log('[TavernIndexer] Note: stone_tier/stone_type column check:', err.message);
      }
    }
    
    // Add statGenes and visualGenes columns for Summon Sniper feature
    try {
      await db.execute(sql`ALTER TABLE tavern_heroes ADD COLUMN IF NOT EXISTS stat_genes TEXT`);
      await db.execute(sql`ALTER TABLE tavern_heroes ADD COLUMN IF NOT EXISTS visual_genes TEXT`);
    } catch (err) {
      if (!err.message?.includes('already exists') && !err.message?.includes('duplicate column')) {
        console.log('[TavernIndexer] Note: stat_genes/visual_genes column check:', err.message);
      }
    }
    
    // Now create indexes that depend on combat_power
    await db.execute(sql`CREATE INDEX IF NOT EXISTS tavern_heroes_combat_power_idx ON tavern_heroes(combat_power DESC)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS tavern_heroes_tournament_ready_idx ON tavern_heroes(rarity, combat_power DESC, price_native ASC)`);
    
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS tavern_indexer_progress (
        id SERIAL PRIMARY KEY,
        realm TEXT NOT NULL UNIQUE,
        heroes_indexed INTEGER DEFAULT 0,
        last_batch_id TEXT,
        status TEXT NOT NULL DEFAULT 'idle',
        last_error TEXT,
        last_run_at TIMESTAMPTZ,
        last_success_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
      )
    `);
    
    // Initialize progress records for both realms
    await db.execute(sql`
      INSERT INTO tavern_indexer_progress (realm, status)
      VALUES ('cv', 'idle'), ('sd', 'idle')
      ON CONFLICT (realm) DO NOTHING
    `);
    
    tablesInitialized = true;
    console.log('[TavernIndexer] Tables initialized');
  } catch (error) {
    console.error('[TavernIndexer] Failed to initialize tables:', error.message);
    throw error;
  }
}

async function updateProgress(realm, updates) {
  try {
    // Simple status update using drizzle sql template
    if (updates.status) {
      await db.execute(sql`
        UPDATE tavern_indexer_progress 
        SET status = ${updates.status}, updated_at = NOW()
        WHERE realm = ${realm}
      `);
    }
    
    if (updates.heroesIndexed !== undefined) {
      await db.execute(sql`
        UPDATE tavern_indexer_progress 
        SET heroes_indexed = ${updates.heroesIndexed}, updated_at = NOW()
        WHERE realm = ${realm}
      `);
    }
    
    if (updates.lastBatchId) {
      await db.execute(sql`
        UPDATE tavern_indexer_progress 
        SET last_batch_id = ${updates.lastBatchId}, updated_at = NOW()
        WHERE realm = ${realm}
      `);
    }
    
    if (updates.lastRunAt) {
      await db.execute(sql`
        UPDATE tavern_indexer_progress 
        SET last_run_at = ${updates.lastRunAt}, updated_at = NOW()
        WHERE realm = ${realm}
      `);
    }
    
    if (updates.lastSuccessAt) {
      await db.execute(sql`
        UPDATE tavern_indexer_progress 
        SET last_success_at = ${updates.lastSuccessAt}, updated_at = NOW()
        WHERE realm = ${realm}
      `);
    }
    
    if (updates.lastError) {
      await db.execute(sql`
        UPDATE tavern_indexer_progress 
        SET last_error = ${updates.lastError}, updated_at = NOW()
        WHERE realm = ${realm}
      `);
    }
  } catch (error) {
    console.error(`[TavernIndexer] Failed to update progress for ${realm}:`, error.message);
  }
}

// ============================================================================
// HERO FETCHING AND PROCESSING
// ============================================================================

function weiToToken(weiStr) {
  if (!weiStr) return 0;
  try {
    const wei = BigInt(weiStr);
    const whole = wei / BigInt(1e18);
    const frac = Number(wei % BigInt(1e18)) / 1e18;
    return Number(whole) + frac;
  } catch {
    return 0;
  }
}

async function fetchHeroesFromAPI(offset = 0, limit = BATCH_SIZE) {
  try {
    const response = await fetch(DFK_TAVERN_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit, offset })
    });
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.error(`[TavernIndexer] API fetch failed (offset=${offset}):`, error.message);
    throw error;
  }
}

function normalizeHero(apiHero, batchId) {
  const heroId = String(apiHero.id || apiHero.heroId);
  const heroIdBigInt = BigInt(heroId);
  const normalizedId = Number(heroIdBigInt % BigInt(1000000000000));
  
  // Determine realm from hero ID
  let realm = 'unknown';
  if (heroIdBigInt >= CV_ID_MIN && heroIdBigInt < CV_ID_MAX) {
    realm = 'cv';
  } else if (heroIdBigInt >= CV_ID_MAX) {
    realm = 'sd';
  }
  
  const mainClassRaw = apiHero.mainClass ?? apiHero.mainClassStr;
  const subClassRaw = apiHero.subClass ?? apiHero.subClassStr;
  const professionRaw = apiHero.profession ?? apiHero.professionStr;
  
  const mainClass = CLASS_NAMES[parseInt(mainClassRaw)] || `Class${mainClassRaw}`;
  const subClass = subClassRaw != null ? (CLASS_NAMES[parseInt(subClassRaw)] || `Class${subClassRaw}`) : null;
  const profession = PROFESSION_NAMES[parseInt(professionRaw)] || `profession${professionRaw}`;
  
  // Format abilities
  const active1 = apiHero.active1 != null ? `ability_${apiHero.active1}` : null;
  const active2 = apiHero.active2 != null ? `ability_${apiHero.active2}` : null;
  const passive1 = apiHero.passive1 != null ? `ability_${apiHero.passive1}` : null;
  const passive2 = apiHero.passive2 != null ? `ability_${apiHero.passive2}` : null;
  
  // Calculate TTS
  const traitScore = calculateHeroTraitScore({ active1, active2, passive1, passive2 });
  
  // Calculate Combat Power (sum of 8 primary stats)
  const combatPower = (apiHero.strength ?? 0) + (apiHero.agility ?? 0) + 
                      (apiHero.intelligence ?? 0) + (apiHero.wisdom ?? 0) + 
                      (apiHero.luck ?? 0) + (apiHero.dexterity ?? 0) + 
                      (apiHero.vitality ?? 0) + (apiHero.endurance ?? 0);
  
  // Price handling
  const priceField = apiHero.startingPrice || apiHero.salePrice || apiHero.price;
  const priceNative = weiToToken(priceField);
  const nativeToken = realm === 'cv' ? 'CRYSTAL' : 'JEWEL';
  
  // Enhancement Stone tracking - null address means no stone used
  const NULL_ADDRESS = '0x0000000000000000000000000000000000000000';
  const summonStone = apiHero.summonStone && apiHero.summonStone !== NULL_ADDRESS 
    ? apiHero.summonStone 
    : null;
  
  // Decode stone tier and type from contract address
  const stoneInfo = lookupStone(summonStone);
  const stoneTier = stoneInfo?.tier || null;
  const stoneType = stoneInfo?.type || null;
  
  // Capture raw gene strings for summoning calculations
  const statGenes = apiHero.statGenes || null;
  const visualGenes = apiHero.visualGenes || null;
  
  return {
    heroId,
    normalizedId,
    realm,
    mainClass,
    subClass,
    profession,
    rarity: apiHero.rarity ?? 0,
    level: apiHero.level ?? 1,
    generation: apiHero.generation ?? 0,
    summons: apiHero.summons ?? 0,
    maxSummons: apiHero.maxSummons ?? 0,
    strength: apiHero.strength ?? 0,
    agility: apiHero.agility ?? 0,
    intelligence: apiHero.intelligence ?? 0,
    wisdom: apiHero.wisdom ?? 0,
    luck: apiHero.luck ?? 0,
    dexterity: apiHero.dexterity ?? 0,
    vitality: apiHero.vitality ?? 0,
    endurance: apiHero.endurance ?? 0,
    hp: apiHero.hp ?? 0,
    mp: apiHero.mp ?? 0,
    stamina: apiHero.stamina ?? 25,
    active1,
    active2,
    passive1,
    passive2,
    traitScore,
    combatPower,
    summonStone,
    stoneTier,
    stoneType,
    statGenes,
    visualGenes,
    salePrice: priceField || '0',
    priceNative,
    nativeToken,
    batchId
  };
}

async function upsertHeroes(heroes) {
  if (heroes.length === 0) return 0;
  
  let inserted = 0;
  
  for (const hero of heroes) {
    try {
      await db.execute(sql`
        INSERT INTO tavern_heroes (
          hero_id, normalized_id, realm, main_class, sub_class, profession,
          rarity, level, generation, summons, max_summons,
          strength, agility, intelligence, wisdom, luck, dexterity, vitality, endurance, hp, mp, stamina,
          active1, active2, passive1, passive2, trait_score, combat_power, summon_stone, stone_tier, stone_type,
          stat_genes, visual_genes,
          sale_price, price_native, native_token, batch_id, indexed_at
        ) VALUES (
          ${hero.heroId}, ${hero.normalizedId}, ${hero.realm}, ${hero.mainClass}, ${hero.subClass}, ${hero.profession},
          ${hero.rarity}, ${hero.level}, ${hero.generation}, ${hero.summons}, ${hero.maxSummons},
          ${hero.strength}, ${hero.agility}, ${hero.intelligence}, ${hero.wisdom}, ${hero.luck}, ${hero.dexterity}, ${hero.vitality}, ${hero.endurance}, ${hero.hp}, ${hero.mp}, ${hero.stamina},
          ${hero.active1}, ${hero.active2}, ${hero.passive1}, ${hero.passive2}, ${hero.traitScore}, ${hero.combatPower}, ${hero.summonStone}, ${hero.stoneTier}, ${hero.stoneType},
          ${hero.statGenes}, ${hero.visualGenes},
          ${hero.salePrice}, ${hero.priceNative}, ${hero.nativeToken}, ${hero.batchId}, NOW()
        )
        ON CONFLICT (hero_id) DO UPDATE SET
          normalized_id = EXCLUDED.normalized_id,
          realm = EXCLUDED.realm,
          main_class = EXCLUDED.main_class,
          sub_class = EXCLUDED.sub_class,
          profession = EXCLUDED.profession,
          rarity = EXCLUDED.rarity,
          level = EXCLUDED.level,
          generation = EXCLUDED.generation,
          summons = EXCLUDED.summons,
          max_summons = EXCLUDED.max_summons,
          strength = EXCLUDED.strength,
          agility = EXCLUDED.agility,
          intelligence = EXCLUDED.intelligence,
          wisdom = EXCLUDED.wisdom,
          luck = EXCLUDED.luck,
          dexterity = EXCLUDED.dexterity,
          vitality = EXCLUDED.vitality,
          endurance = EXCLUDED.endurance,
          hp = EXCLUDED.hp,
          mp = EXCLUDED.mp,
          stamina = EXCLUDED.stamina,
          active1 = EXCLUDED.active1,
          active2 = EXCLUDED.active2,
          passive1 = EXCLUDED.passive1,
          passive2 = EXCLUDED.passive2,
          trait_score = EXCLUDED.trait_score,
          combat_power = EXCLUDED.combat_power,
          summon_stone = EXCLUDED.summon_stone,
          stone_tier = EXCLUDED.stone_tier,
          stone_type = EXCLUDED.stone_type,
          stat_genes = EXCLUDED.stat_genes,
          visual_genes = EXCLUDED.visual_genes,
          sale_price = EXCLUDED.sale_price,
          price_native = EXCLUDED.price_native,
          native_token = EXCLUDED.native_token,
          batch_id = EXCLUDED.batch_id,
          indexed_at = NOW()
      `);
      inserted++;
    } catch (error) {
      console.error(`[TavernIndexer] Failed to upsert hero ${hero.heroId}:`, error.message);
    }
  }
  
  return inserted;
}

async function cleanupOldHeroes(batchId) {
  try {
    const result = await db.execute(sql`
      DELETE FROM tavern_heroes 
      WHERE batch_id != ${batchId} OR batch_id IS NULL
    `);
    return result.rowCount || 0;
  } catch (error) {
    console.error('[TavernIndexer] Failed to cleanup old heroes:', error.message);
    return 0;
  }
}

// ============================================================================
// WORKER SYSTEM
// ============================================================================

async function runWorker(workerId, offset, limit, batchId) {
  const workerLabel = `W${workerId}`;
  
  try {
    indexerState.workers[workerId] = {
      id: workerId,
      status: 'fetching',
      offset,
      limit,
      heroesProcessed: 0,
      startedAt: new Date().toISOString()
    };
    
    console.log(`[TavernIndexer ${workerLabel}] Fetching offset=${offset}, limit=${limit}`);
    
    const apiHeroes = await fetchHeroesFromAPI(offset, limit);
    
    if (apiHeroes.length === 0) {
      indexerState.workers[workerId].status = 'done';
      console.log(`[TavernIndexer ${workerLabel}] No heroes at offset=${offset}`);
      return { workerId, heroesProcessed: 0 };
    }
    
    indexerState.workers[workerId].status = 'processing';
    
    // Normalize and calculate TTS
    const normalizedHeroes = apiHeroes
      .map(h => normalizeHero(h, batchId))
      .filter(h => h.realm === 'cv' || h.realm === 'sd'); // Skip legacy heroes
    
    // Upsert to database
    const inserted = await upsertHeroes(normalizedHeroes);
    
    indexerState.workers[workerId].status = 'done';
    indexerState.workers[workerId].heroesProcessed = inserted;
    indexerState.totalHeroesIndexed += inserted;
    
    console.log(`[TavernIndexer ${workerLabel}] Processed ${inserted} heroes`);
    
    return { workerId, heroesProcessed: inserted };
  } catch (error) {
    indexerState.workers[workerId].status = 'error';
    indexerState.workers[workerId].error = error.message;
    indexerState.errors.push({ workerId, error: error.message, at: new Date().toISOString() });
    console.error(`[TavernIndexer ${workerLabel}] Error:`, error.message);
    return { workerId, heroesProcessed: 0, error: error.message };
  }
}

// ============================================================================
// MAIN INDEXING FUNCTION
// ============================================================================

async function runFullIndex() {
  if (indexerState.isRunning) {
    console.log('[TavernIndexer] Already running, skipping');
    return { status: 'already_running' };
  }
  
  await ensureTablesExist();
  
  const batchId = nanoid(12);
  
  indexerState = {
    isRunning: true,
    startedAt: new Date().toISOString(),
    batchId,
    workers: [],
    totalHeroesIndexed: 0,
    errors: []
  };
  
  console.log(`[TavernIndexer] Starting full index, batchId=${batchId}`);
  
  // Update progress for both realms
  await updateProgress('cv', { status: 'running', lastRunAt: new Date().toISOString() });
  await updateProgress('sd', { status: 'running', lastRunAt: new Date().toISOString() });
  
  try {
    // Create work assignments for parallel workers
    const workAssignments = [];
    for (let i = 0; i < NUM_WORKERS; i++) {
      const offset = i * BATCH_SIZE;
      workAssignments.push({ workerId: i, offset, limit: BATCH_SIZE });
    }
    
    // First round - parallel fetch
    const firstRoundResults = await Promise.all(
      workAssignments.map(w => runWorker(w.workerId, w.offset, w.limit, batchId))
    );
    
    // Continue fetching until we get empty results
    let currentOffset = NUM_WORKERS * BATCH_SIZE;
    let consecutiveEmpty = 0;
    
    while (currentOffset < FETCH_LIMIT && consecutiveEmpty < 2) {
      const batchResults = await Promise.all(
        Array.from({ length: NUM_WORKERS }, (_, i) => {
          const offset = currentOffset + (i * BATCH_SIZE);
          if (offset >= FETCH_LIMIT) return Promise.resolve({ heroesProcessed: 0 });
          return runWorker(i, offset, BATCH_SIZE, batchId);
        })
      );
      
      const totalInBatch = batchResults.reduce((sum, r) => sum + (r.heroesProcessed || 0), 0);
      if (totalInBatch === 0) {
        consecutiveEmpty++;
      } else {
        consecutiveEmpty = 0;
      }
      
      currentOffset += NUM_WORKERS * BATCH_SIZE;
    }
    
    // Cleanup old heroes not in this batch
    const removed = await cleanupOldHeroes(batchId);
    console.log(`[TavernIndexer] Cleaned up ${removed} stale heroes`);
    
    // Count by realm - handle different result formats
    const cvCountResult = await db.execute(sql`SELECT COUNT(*) as count FROM tavern_heroes WHERE realm = 'cv' AND batch_id = ${batchId}`);
    const sdCountResult = await db.execute(sql`SELECT COUNT(*) as count FROM tavern_heroes WHERE realm = 'sd' AND batch_id = ${batchId}`);
    
    // Handle both array and .rows formats
    const cvRows = Array.isArray(cvCountResult) ? cvCountResult : (cvCountResult.rows || []);
    const sdRows = Array.isArray(sdCountResult) ? sdCountResult : (sdCountResult.rows || []);
    const cvHeroes = parseInt(cvRows[0]?.count || 0);
    const sdHeroes = parseInt(sdRows[0]?.count || 0);
    
    // Update final progress
    await updateProgress('cv', { 
      status: 'idle', 
      heroesIndexed: cvHeroes, 
      lastBatchId: batchId,
      lastSuccessAt: new Date().toISOString()
    });
    await updateProgress('sd', { 
      status: 'idle', 
      heroesIndexed: sdHeroes, 
      lastBatchId: batchId,
      lastSuccessAt: new Date().toISOString()
    });
    
    indexerState.isRunning = false;
    
    console.log(`[TavernIndexer] Complete: ${cvHeroes} CV, ${sdHeroes} SD heroes indexed`);
    
    return {
      status: 'success',
      batchId,
      totalHeroes: indexerState.totalHeroesIndexed,
      cvHeroes,
      sdHeroes,
      duration: Date.now() - new Date(indexerState.startedAt).getTime()
    };
    
  } catch (error) {
    console.error('[TavernIndexer] Fatal error:', error.message);
    
    await updateProgress('cv', { status: 'error', lastError: error.message });
    await updateProgress('sd', { status: 'error', lastError: error.message });
    
    indexerState.isRunning = false;
    indexerState.errors.push({ error: error.message, at: new Date().toISOString() });
    
    return { status: 'error', error: error.message };
  }
}

// ============================================================================
// AUTO-RUN SCHEDULER
// ============================================================================

export function startAutoRun(intervalMs = AUTO_RUN_INTERVAL_MS) {
  if (autoRunInterval) {
    console.log('[TavernIndexer] Auto-run already active');
    return { status: 'already_running' };
  }
  
  console.log(`[TavernIndexer] Starting auto-run (interval: ${intervalMs / 1000}s)`);
  
  // Run immediately on start
  runFullIndex().catch(err => console.error('[TavernIndexer] Initial run error:', err.message));
  
  // Schedule recurring runs
  autoRunInterval = setInterval(() => {
    runFullIndex().catch(err => console.error('[TavernIndexer] Scheduled run error:', err.message));
  }, intervalMs);
  
  return { status: 'started', intervalMs };
}

export function stopAutoRun() {
  if (!autoRunInterval) {
    return { status: 'not_running' };
  }
  
  clearInterval(autoRunInterval);
  autoRunInterval = null;
  console.log('[TavernIndexer] Auto-run stopped');
  
  return { status: 'stopped' };
}

// ============================================================================
// STATUS AND QUERIES
// ============================================================================

export function getIndexerStatus() {
  return {
    isRunning: indexerState.isRunning,
    startedAt: indexerState.startedAt,
    batchId: indexerState.batchId,
    totalHeroesIndexed: indexerState.totalHeroesIndexed,
    workers: indexerState.workers,
    errors: indexerState.errors.slice(-5),
    autoRunActive: !!autoRunInterval
  };
}

export async function getIndexerProgress() {
  await ensureTablesExist();
  
  const result = await db.execute(sql`
    SELECT * FROM tavern_indexer_progress ORDER BY realm
  `);
  
  return Array.isArray(result) ? result : (result.rows || []);
}

export async function getTavernHeroes(options = {}) {
  await ensureTablesExist();
  
  const { 
    realm, 
    minTts, 
    maxTts, 
    minRarity, 
    maxRarity, 
    minCombatPower, 
    maxCombatPower,
    minLevel,
    maxLevel,
    mainClass,
    sortBy = 'price', // 'price', 'combat_power', 'value' (combat_power/price)
    sortOrder = 'asc',
    limit = 100, 
    offset = 0 
  } = options;
  
  // Validate string inputs to prevent SQL injection
  const validRealms = ['cv', 'sd'];
  const validSortBy = ['price', 'combat_power', 'value', 'level', 'tts'];
  const validSortOrder = ['asc', 'desc'];
  
  const safeRealm = realm && validRealms.includes(realm) ? realm : null;
  const safeSortBy = validSortBy.includes(sortBy) ? sortBy : 'price';
  const safeSortOrder = validSortOrder.includes(sortOrder) ? sortOrder : 'asc';
  const safeLimit = Math.min(Math.max(1, parseInt(limit) || 100), 500);
  const safeOffset = Math.max(0, parseInt(offset) || 0);
  
  // Validate mainClass (alphanumeric only)
  const safeMainClass = mainClass && /^[A-Za-z0-9]+$/.test(mainClass) ? mainClass : null;
  
  // Use parameterized queries with drizzle sql template
  // Build query dynamically but safely
  let result;
  
  // SECURITY: All queries use only parameterized values and static SQL fragments
  // No sql.raw() usage - sort order is determined by branching logic, not string interpolation
  
  // Helper to execute query with proper sort order (no sql.raw)
  const executeWithSort = async (baseQuery, sortType) => {
    // sortType is validated against whitelist above, so we can safely branch
    // Using static SQL fragments only - no dynamic string building
    if (sortType === 'value') {
      // Value sort: combat_power / price (higher = better deal)
      return await baseQuery('value');
    } else if (sortType === 'combat_power' && safeSortOrder === 'desc') {
      return await baseQuery('cp_desc');
    } else if (sortType === 'combat_power') {
      return await baseQuery('cp_asc');
    } else if (safeSortOrder === 'desc') {
      return await baseQuery('price_desc');
    } else {
      return await baseQuery('price_asc');
    }
  };

  // Parse minLevel for tournament-ready filtering (default 10 for tournaments)
  const safeMinLevel = minLevel !== undefined ? Math.max(1, parseInt(minLevel) || 1) : null;

  // Tournament-ready query: minRarity + minCombatPower + realm + optional minLevel
  if (safeRealm && minRarity !== undefined && minCombatPower !== undefined) {
    const minRarityVal = parseInt(minRarity);
    const minCpVal = parseInt(minCombatPower);
    const levelFilter = safeMinLevel || 1;
    
    result = await executeWithSort(async (sort) => {
      if (sort === 'value') {
        return await db.execute(sql`
          SELECT * FROM tavern_heroes 
          WHERE realm = ${safeRealm} AND rarity >= ${minRarityVal} AND combat_power >= ${minCpVal} AND level >= ${levelFilter}
          ORDER BY (combat_power / NULLIF(price_native, 0)) DESC NULLS LAST
          LIMIT ${safeLimit} OFFSET ${safeOffset}
        `);
      } else if (sort === 'cp_desc') {
        return await db.execute(sql`
          SELECT * FROM tavern_heroes 
          WHERE realm = ${safeRealm} AND rarity >= ${minRarityVal} AND combat_power >= ${minCpVal} AND level >= ${levelFilter}
          ORDER BY combat_power DESC NULLS LAST
          LIMIT ${safeLimit} OFFSET ${safeOffset}
        `);
      } else if (sort === 'cp_asc') {
        return await db.execute(sql`
          SELECT * FROM tavern_heroes 
          WHERE realm = ${safeRealm} AND rarity >= ${minRarityVal} AND combat_power >= ${minCpVal} AND level >= ${levelFilter}
          ORDER BY combat_power ASC NULLS LAST
          LIMIT ${safeLimit} OFFSET ${safeOffset}
        `);
      } else if (sort === 'price_desc') {
        return await db.execute(sql`
          SELECT * FROM tavern_heroes 
          WHERE realm = ${safeRealm} AND rarity >= ${minRarityVal} AND combat_power >= ${minCpVal} AND level >= ${levelFilter}
          ORDER BY price_native DESC NULLS LAST
          LIMIT ${safeLimit} OFFSET ${safeOffset}
        `);
      } else {
        return await db.execute(sql`
          SELECT * FROM tavern_heroes 
          WHERE realm = ${safeRealm} AND rarity >= ${minRarityVal} AND combat_power >= ${minCpVal} AND level >= ${levelFilter}
          ORDER BY price_native ASC NULLS LAST
          LIMIT ${safeLimit} OFFSET ${safeOffset}
        `);
      }
    }, safeSortBy);
  } else if (safeRealm && minRarity !== undefined) {
    const minRarityVal = parseInt(minRarity);
    const levelFilter = safeMinLevel || 1;
    result = await db.execute(sql`
      SELECT * FROM tavern_heroes 
      WHERE realm = ${safeRealm} AND rarity >= ${minRarityVal} AND level >= ${levelFilter}
      ORDER BY price_native ASC NULLS LAST
      LIMIT ${safeLimit} OFFSET ${safeOffset}
    `);
  } else if (safeRealm && minCombatPower !== undefined) {
    const minCpVal = parseInt(minCombatPower);
    const levelFilter = safeMinLevel || 1;
    result = await db.execute(sql`
      SELECT * FROM tavern_heroes 
      WHERE realm = ${safeRealm} AND combat_power >= ${minCpVal} AND level >= ${levelFilter}
      ORDER BY price_native ASC NULLS LAST
      LIMIT ${safeLimit} OFFSET ${safeOffset}
    `);
  } else if (minRarity !== undefined && minCombatPower !== undefined) {
    const minRarityVal = parseInt(minRarity);
    const minCpVal = parseInt(minCombatPower);
    const levelFilter = safeMinLevel || 1;
    
    result = await executeWithSort(async (sort) => {
      if (sort === 'value') {
        return await db.execute(sql`
          SELECT * FROM tavern_heroes 
          WHERE rarity >= ${minRarityVal} AND combat_power >= ${minCpVal} AND level >= ${levelFilter}
          ORDER BY (combat_power / NULLIF(price_native, 0)) DESC NULLS LAST
          LIMIT ${safeLimit} OFFSET ${safeOffset}
        `);
      } else {
        return await db.execute(sql`
          SELECT * FROM tavern_heroes 
          WHERE rarity >= ${minRarityVal} AND combat_power >= ${minCpVal} AND level >= ${levelFilter}
          ORDER BY price_native ASC NULLS LAST
          LIMIT ${safeLimit} OFFSET ${safeOffset}
        `);
      }
    }, safeSortBy);
  } else if (minRarity !== undefined) {
    const minRarityVal = parseInt(minRarity);
    const levelFilter = safeMinLevel || 1;
    result = await db.execute(sql`
      SELECT * FROM tavern_heroes 
      WHERE rarity >= ${minRarityVal} AND level >= ${levelFilter}
      ORDER BY price_native ASC NULLS LAST
      LIMIT ${safeLimit} OFFSET ${safeOffset}
    `);
  } else if (safeRealm && maxTts !== undefined) {
    const levelFilter = safeMinLevel || 1;
    result = await db.execute(sql`
      SELECT * FROM tavern_heroes 
      WHERE realm = ${safeRealm} AND trait_score <= ${parseInt(maxTts)} AND level >= ${levelFilter}
      ORDER BY price_native ASC NULLS LAST
      LIMIT ${safeLimit} OFFSET ${safeOffset}
    `);
  } else if (safeRealm) {
    const levelFilter = safeMinLevel || 1;
    result = await db.execute(sql`
      SELECT * FROM tavern_heroes 
      WHERE realm = ${safeRealm} AND level >= ${levelFilter}
      ORDER BY price_native ASC NULLS LAST
      LIMIT ${safeLimit} OFFSET ${safeOffset}
    `);
  } else if (maxTts !== undefined) {
    const levelFilter = safeMinLevel || 1;
    result = await db.execute(sql`
      SELECT * FROM tavern_heroes 
      WHERE trait_score <= ${parseInt(maxTts)} AND level >= ${levelFilter}
      ORDER BY price_native ASC NULLS LAST
      LIMIT ${safeLimit} OFFSET ${safeOffset}
    `);
  } else {
    const levelFilter = safeMinLevel || 1;
    result = await db.execute(sql`
      SELECT * FROM tavern_heroes 
      WHERE level >= ${levelFilter}
      ORDER BY price_native ASC NULLS LAST
      LIMIT ${safeLimit} OFFSET ${safeOffset}
    `);
  }
  
  return Array.isArray(result) ? result : (result.rows || []);
}

export async function getTavernStats() {
  await ensureTablesExist();
  
  const result = await db.execute(sql`
    SELECT 
      realm,
      COUNT(*) as total_heroes,
      AVG(trait_score) as avg_tts,
      MIN(price_native) as min_price,
      MAX(price_native) as max_price,
      AVG(price_native) as avg_price
    FROM tavern_heroes
    GROUP BY realm
  `);
  
  return Array.isArray(result) ? result : (result.rows || []);
}

export async function resetTavernIndex() {
  await ensureTablesExist();
  
  console.log('[TavernIndexer] Resetting tavern index - clearing all heroes...');
  
  await db.execute(sql`DELETE FROM tavern_heroes`);
  await db.execute(sql`DELETE FROM tavern_indexer_progress`);
  
  console.log('[TavernIndexer] Reset complete - tavern heroes cleared');
  
  return { ok: true, message: 'Tavern index reset' };
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  runFullIndex as triggerTavernIndex,
  ensureTablesExist as initializeTavernTables
};
