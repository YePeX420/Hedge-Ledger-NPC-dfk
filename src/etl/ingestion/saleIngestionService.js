/**
 * Sale Ingestion Service
 * 
 * Detects hero sales via delta comparison between listing snapshots.
 * Runs hourly to:
 * 1. Snapshot current tavern listings
 * 2. Compare with previous snapshot to detect removed heroes (sold/delisted)
 * 3. Store detected sales in tavern_sales with hero traits snapshot
 * 4. Update demand metrics based on sale velocity
 * 
 * Also provides:
 * - Hero Price Tool: given a hero ID, fetches hero data and triangulates price from sales
 * - Flippable Heroes Finder: scans tavern for underpriced heroes with flip profit estimates
 */

import { db, rawPg } from '../../../server/db.js';
import { sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';

const SNAPSHOT_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

let saleIngestionState = {
  isRunning: false,
  lastSnapshotAt: null,
  lastReconciliationAt: null,
  salesDetected: 0,
  delistingsDetected: 0,
  errors: []
};

let autoRunInterval = null;

const PROFESSION_CLASS_MAP = {
  'mining': ['DarkKnight', 'Warrior', 'Knight', 'Paladin', 'Berserker', 'Legionnaire'],
  'gardening': ['Sage', 'Wizard', 'Scholar', 'Summoner', 'Seer', 'Bard'],
  'fishing': ['Pirate', 'Monk', 'Ninja', 'Shapeshifter', 'Dragoon', 'SpellBow'],
  'foraging': ['Thief', 'Archer', 'Priest', 'DreadKnight', 'Ranger']
};

function computeProfessionMatch(mainClass, profession) {
  if (!mainClass || !profession) return false;
  const matchClasses = PROFESSION_CLASS_MAP[profession] || [];
  return matchClasses.includes(mainClass);
}

function getTraitScoreBand(traitScore) {
  if (traitScore == null) return 'unknown';
  if (traitScore >= 80) return 'elite';
  if (traitScore >= 50) return 'strong';
  if (traitScore >= 20) return 'average';
  return 'basic';
}

const STAT_BOOST_NAMES = {
  0: 'STR', 2: 'AGI', 4: 'INT', 6: 'WIS', 8: 'LCK', 10: 'DEX', 12: 'VIT', 14: 'END'
};

function decodeStatBoostsFromGenes(statGenes) {
  if (!statGenes) return { boost1: null, boost2: null };
  try {
    const kai = '123456789abcdefghijkmnopqrstuvwx';
    const genesBigInt = BigInt(statGenes);
    let kaiString = '';
    let temp = genesBigInt;
    for (let i = 0; i < 48; i++) {
      kaiString = kai[Number(temp % 32n)] + kaiString;
      temp = temp / 32n;
    }
    const boost1Dominant = kai.indexOf(kaiString[31]);
    const boost2Dominant = kai.indexOf(kaiString[35]);
    return {
      boost1: STAT_BOOST_NAMES[boost1Dominant] || null,
      boost2: STAT_BOOST_NAMES[boost2Dominant] || null
    };
  } catch {
    return { boost1: null, boost2: null };
  }
}

async function ensureSaleTablesExist() {
  await rawPg`
    CREATE TABLE IF NOT EXISTS tavern_listing_snapshots (
      id SERIAL PRIMARY KEY,
      snapshot_id TEXT NOT NULL,
      hero_id TEXT NOT NULL,
      realm TEXT NOT NULL,
      price_native NUMERIC(30, 8),
      native_token TEXT,
      main_class TEXT,
      sub_class TEXT,
      profession TEXT,
      rarity INTEGER,
      level INTEGER,
      generation INTEGER,
      summons INTEGER,
      max_summons INTEGER,
      trait_score INTEGER,
      profession_match BOOLEAN DEFAULT FALSE,
      stat_boost_1 TEXT,
      stat_boost_2 TEXT,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
    )
  `;
  
  await rawPg`CREATE INDEX IF NOT EXISTS tavern_listing_snapshots_snapshot_idx ON tavern_listing_snapshots(snapshot_id)`;
  await rawPg`CREATE INDEX IF NOT EXISTS tavern_listing_snapshots_hero_idx ON tavern_listing_snapshots(hero_id)`;
  
  await rawPg`
    CREATE TABLE IF NOT EXISTS tavern_sales (
      id SERIAL PRIMARY KEY,
      hero_id INTEGER NOT NULL,
      realm TEXT NOT NULL,
      sale_timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
      token_address TEXT,
      token_symbol TEXT,
      price_amount NUMERIC(30, 8),
      is_floor_hero BOOLEAN DEFAULT FALSE,
      as_of_date DATE,
      main_class TEXT,
      sub_class TEXT,
      profession TEXT,
      rarity INTEGER,
      level INTEGER,
      generation INTEGER,
      summons INTEGER,
      max_summons INTEGER,
      trait_score INTEGER,
      profession_match BOOLEAN DEFAULT FALSE,
      stat_boost_1 TEXT,
      stat_boost_2 TEXT,
      trait_score_band TEXT,
      UNIQUE(hero_id, sale_timestamp)
    )
  `;
  
  await rawPg`ALTER TABLE tavern_sales ADD COLUMN IF NOT EXISTS main_class TEXT`;
  await rawPg`ALTER TABLE tavern_sales ADD COLUMN IF NOT EXISTS sub_class TEXT`;
  await rawPg`ALTER TABLE tavern_sales ADD COLUMN IF NOT EXISTS profession TEXT`;
  await rawPg`ALTER TABLE tavern_sales ADD COLUMN IF NOT EXISTS rarity INTEGER`;
  await rawPg`ALTER TABLE tavern_sales ADD COLUMN IF NOT EXISTS level INTEGER`;
  await rawPg`ALTER TABLE tavern_sales ADD COLUMN IF NOT EXISTS generation INTEGER`;
  await rawPg`ALTER TABLE tavern_sales ADD COLUMN IF NOT EXISTS summons INTEGER`;
  await rawPg`ALTER TABLE tavern_sales ADD COLUMN IF NOT EXISTS max_summons INTEGER`;
  await rawPg`ALTER TABLE tavern_sales ADD COLUMN IF NOT EXISTS trait_score INTEGER`;
  await rawPg`ALTER TABLE tavern_sales ADD COLUMN IF NOT EXISTS profession_match BOOLEAN DEFAULT FALSE`;
  await rawPg`ALTER TABLE tavern_sales ADD COLUMN IF NOT EXISTS stat_boost_1 TEXT`;
  await rawPg`ALTER TABLE tavern_sales ADD COLUMN IF NOT EXISTS stat_boost_2 TEXT`;
  await rawPg`ALTER TABLE tavern_sales ADD COLUMN IF NOT EXISTS trait_score_band TEXT`;

  await rawPg`CREATE INDEX IF NOT EXISTS tavern_sales_realm_idx ON tavern_sales(realm)`;
  await rawPg`CREATE INDEX IF NOT EXISTS tavern_sales_timestamp_idx ON tavern_sales(sale_timestamp DESC)`;
  await rawPg`CREATE INDEX IF NOT EXISTS tavern_sales_class_idx ON tavern_sales(main_class)`;
  await rawPg`CREATE INDEX IF NOT EXISTS tavern_sales_rarity_idx ON tavern_sales(rarity)`;
  await rawPg`CREATE INDEX IF NOT EXISTS tavern_sales_profession_match_idx ON tavern_sales(profession_match)`;
  await rawPg`CREATE INDEX IF NOT EXISTS tavern_sales_trait_band_idx ON tavern_sales(trait_score_band)`;
  
  await rawPg`
    CREATE TABLE IF NOT EXISTS hero_snapshots (
      id SERIAL PRIMARY KEY,
      sale_id INTEGER REFERENCES tavern_sales(id),
      hero_id INTEGER NOT NULL,
      rarity INTEGER,
      main_class TEXT,
      sub_class TEXT,
      level INTEGER,
      profession TEXT,
      summons_remaining INTEGER,
      max_summons INTEGER,
      strength INTEGER DEFAULT 0,
      agility INTEGER DEFAULT 0,
      dexterity INTEGER DEFAULT 0,
      vitality INTEGER DEFAULT 0,
      intelligence INTEGER DEFAULT 0,
      wisdom INTEGER DEFAULT 0,
      luck INTEGER DEFAULT 0,
      advanced_genes INTEGER DEFAULT 0,
      elite_genes INTEGER DEFAULT 0,
      exalted_genes INTEGER DEFAULT 0
    )
  `;
  
  await rawPg`
    CREATE TABLE IF NOT EXISTS tavern_listing_history (
      id SERIAL PRIMARY KEY,
      hero_id TEXT NOT NULL,
      realm TEXT,
      snapshot_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      price_native NUMERIC(30, 8),
      native_token TEXT,
      main_class TEXT,
      sub_class TEXT,
      profession TEXT,
      rarity INTEGER,
      level INTEGER,
      generation INTEGER,
      summons INTEGER,
      max_summons INTEGER,
      trait_score INTEGER,
      profession_match BOOLEAN DEFAULT FALSE,
      stat_boost_1 TEXT,
      stat_boost_2 TEXT,
      status TEXT,
      status_changed_at TIMESTAMPTZ
    )
  `;

  await rawPg`ALTER TABLE tavern_listing_snapshots ADD COLUMN IF NOT EXISTS profession_match BOOLEAN DEFAULT FALSE`;
  await rawPg`ALTER TABLE tavern_listing_snapshots ADD COLUMN IF NOT EXISTS stat_boost_1 TEXT`;
  await rawPg`ALTER TABLE tavern_listing_snapshots ADD COLUMN IF NOT EXISTS stat_boost_2 TEXT`;
  await rawPg`ALTER TABLE tavern_listing_history ADD COLUMN IF NOT EXISTS profession_match BOOLEAN DEFAULT FALSE`;
  await rawPg`ALTER TABLE tavern_listing_history ADD COLUMN IF NOT EXISTS stat_boost_1 TEXT`;
  await rawPg`ALTER TABLE tavern_listing_history ADD COLUMN IF NOT EXISTS stat_boost_2 TEXT`;
  
  await rawPg`
    CREATE TABLE IF NOT EXISTS tavern_demand_metrics (
      id SERIAL PRIMARY KEY,
      realm TEXT NOT NULL,
      main_class TEXT NOT NULL,
      sub_class TEXT,
      profession TEXT,
      rarity INTEGER,
      level_band TEXT,
      profession_match BOOLEAN,
      trait_score_band TEXT,
      avg_trait_score NUMERIC(10, 2),
      pct_profession_match NUMERIC(5, 2),
      as_of_date DATE DEFAULT CURRENT_DATE,
      sales_count_7d INTEGER DEFAULT 0,
      sales_count_30d INTEGER DEFAULT 0,
      avg_time_on_market_hours NUMERIC(10, 2),
      median_price_native NUMERIC(30, 8),
      demand_score NUMERIC(10, 2) DEFAULT 0,
      velocity_score NUMERIC(10, 2) DEFAULT 0,
      liquidity_score NUMERIC(10, 2) DEFAULT 0,
      UNIQUE(realm, main_class, as_of_date)
    )
  `;
  
  await rawPg`ALTER TABLE tavern_demand_metrics ADD COLUMN IF NOT EXISTS profession_match BOOLEAN`;
  await rawPg`ALTER TABLE tavern_demand_metrics ADD COLUMN IF NOT EXISTS trait_score_band TEXT`;
  await rawPg`ALTER TABLE tavern_demand_metrics ADD COLUMN IF NOT EXISTS avg_trait_score NUMERIC(10, 2)`;
  await rawPg`ALTER TABLE tavern_demand_metrics ADD COLUMN IF NOT EXISTS pct_profession_match NUMERIC(5, 2)`;
  
  await rawPg`CREATE INDEX IF NOT EXISTS tavern_demand_metrics_date_idx ON tavern_demand_metrics(as_of_date DESC)`;
}

export async function takeListingSnapshot() {
  const snapshotId = `snap_${Date.now()}_${nanoid(6)}`;
  console.log(`[SaleIngestion] Taking listing snapshot ${snapshotId}...`);
  
  try {
    await ensureSaleTablesExist();
    
    const tableCheck = await rawPg`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'tavern_heroes'
      ) as exists
    `;
    
    if (!tableCheck[0]?.exists) {
      console.log('[SaleIngestion] tavern_heroes table does not exist yet - waiting for Tavern Indexer to run');
      return { ok: true, snapshotId, heroCount: 0 };
    }
    
    const heroList = await rawPg`
      SELECT 
        hero_id, realm, price_native, native_token,
        main_class, sub_class, profession, rarity, level,
        generation, summons, max_summons, trait_score,
        stat_genes
      FROM tavern_heroes
    `;
    
    console.log(`[SaleIngestion] Found ${heroList.length} heroes in tavern`);
    
    if (heroList.length === 0) {
      console.log('[SaleIngestion] No heroes in tavern, skipping snapshot');
      return { ok: true, snapshotId, heroCount: 0 };
    }
    
    const batchSize = 100;
    let inserted = 0;
    
    for (let i = 0; i < heroList.length; i += batchSize) {
      const batch = heroList.slice(i, i + batchSize);
      
      const values = batch.map(h => {
        const profMatch = computeProfessionMatch(h.main_class, h.profession);
        const boosts = decodeStatBoostsFromGenes(h.stat_genes);
        return `(
          '${snapshotId}',
          '${h.hero_id}',
          '${h.realm || 'unknown'}',
          ${h.price_native != null ? h.price_native : 'NULL'},
          ${h.native_token ? `'${h.native_token}'` : 'NULL'},
          ${h.main_class ? `'${h.main_class}'` : 'NULL'},
          ${h.sub_class ? `'${h.sub_class}'` : 'NULL'},
          ${h.profession ? `'${h.profession}'` : 'NULL'},
          ${h.rarity != null ? h.rarity : 'NULL'},
          ${h.level != null ? h.level : 'NULL'},
          ${h.generation != null ? h.generation : 'NULL'},
          ${h.summons != null ? h.summons : 'NULL'},
          ${h.max_summons != null ? h.max_summons : 'NULL'},
          ${h.trait_score != null ? h.trait_score : 'NULL'},
          ${profMatch},
          ${boosts.boost1 ? `'${boosts.boost1}'` : 'NULL'},
          ${boosts.boost2 ? `'${boosts.boost2}'` : 'NULL'}
        )`;
      }).join(',');
      
      await rawPg.unsafe(`
        INSERT INTO tavern_listing_snapshots (
          snapshot_id, hero_id, realm, price_native, native_token,
          main_class, sub_class, profession, rarity, level,
          generation, summons, max_summons, trait_score,
          profession_match, stat_boost_1, stat_boost_2
        ) VALUES ${values}
      `);
      
      inserted += batch.length;
    }
    
    console.log(`[SaleIngestion] Snapshot ${snapshotId} saved with ${inserted} heroes`);
    saleIngestionState.lastSnapshotAt = new Date();
    
    return { ok: true, snapshotId, heroCount: inserted };
  } catch (err) {
    console.error('[SaleIngestion] Snapshot error:', err.message);
    saleIngestionState.errors.push({ at: new Date(), error: err.message });
    return { ok: false, error: err.message };
  }
}

export async function reconcileSales() {
  console.log('[SaleIngestion] Starting sale reconciliation...');
  
  try {
    await ensureSaleTablesExist();
    
    const snapshotList = await rawPg`
      SELECT DISTINCT snapshot_id, MIN(created_at) as created_at
      FROM tavern_listing_snapshots
      GROUP BY snapshot_id
      ORDER BY MIN(created_at) DESC
      LIMIT 2
    `;
    
    if (snapshotList.length < 2) {
      console.log('[SaleIngestion] Need at least 2 snapshots for comparison');
      return { ok: true, salesDetected: 0, message: 'Waiting for more snapshots' };
    }
    
    const currentSnapshotId = snapshotList[0].snapshot_id;
    const previousSnapshotId = snapshotList[1].snapshot_id;
    
    console.log(`[SaleIngestion] Comparing ${previousSnapshotId} -> ${currentSnapshotId}`);
    
    const removedList = await rawPg`
      SELECT 
        prev.hero_id,
        prev.realm,
        prev.price_native,
        prev.native_token,
        prev.main_class,
        prev.sub_class,
        prev.profession,
        prev.rarity,
        prev.level,
        prev.generation,
        prev.summons,
        prev.max_summons,
        prev.trait_score,
        prev.profession_match,
        prev.stat_boost_1,
        prev.stat_boost_2,
        prev.created_at as listed_at
      FROM tavern_listing_snapshots prev
      LEFT JOIN tavern_listing_snapshots curr 
        ON prev.hero_id = curr.hero_id 
        AND curr.snapshot_id = ${currentSnapshotId}
      WHERE prev.snapshot_id = ${previousSnapshotId}
        AND curr.hero_id IS NULL
    `;
    
    console.log(`[SaleIngestion] Found ${removedList.length} heroes removed from listings`);
    
    let salesCount = 0;
    let delistCount = 0;
    
    for (const hero of removedList) {
      const saleResult = await recordPotentialSale(hero);
      if (saleResult.wasSale) {
        salesCount++;
      } else {
        delistCount++;
      }
    }
    
    saleIngestionState.salesDetected += salesCount;
    saleIngestionState.delistingsDetected += delistCount;
    saleIngestionState.lastReconciliationAt = new Date();
    
    console.log(`[SaleIngestion] Reconciliation complete: ${salesCount} sales, ${delistCount} delistings`);
    
    if (salesCount > 0) {
      try {
        await computeDemandMetrics();
      } catch (err) {
        console.error('[SaleIngestion] Demand metrics computation error:', err.message);
      }
    }
    
    return { 
      ok: true, 
      salesDetected: salesCount, 
      delistingsDetected: delistCount,
      previousSnapshot: previousSnapshotId,
      currentSnapshot: currentSnapshotId
    };
  } catch (err) {
    console.error('[SaleIngestion] Reconciliation error:', err.message);
    saleIngestionState.errors.push({ at: new Date(), error: err.message });
    return { ok: false, error: err.message };
  }
}

async function recordPotentialSale(hero) {
  try {
    const existingSale = await rawPg`
      SELECT id FROM tavern_sales 
      WHERE hero_id = ${parseInt(hero.hero_id)} 
      AND sale_timestamp > NOW() - INTERVAL '24 hours'
    `;
    
    if (existingSale.length > 0) {
      return { wasSale: false, reason: 'Already recorded' };
    }
    
    const tokenSymbol = hero.native_token || (hero.realm === 'cv' ? 'CRYSTAL' : 'JEWEL');
    const isFloor = (hero.rarity === 0 || hero.rarity === null) && (hero.level <= 1 || hero.level === null);
    
    const profMatch = hero.profession_match || computeProfessionMatch(hero.main_class, hero.profession);
    const traitBand = getTraitScoreBand(hero.trait_score);
    
    await rawPg`
      INSERT INTO tavern_sales (
        hero_id, realm, sale_timestamp, token_address, token_symbol,
        price_amount, is_floor_hero, as_of_date,
        main_class, sub_class, profession, rarity, level,
        generation, summons, max_summons, trait_score,
        profession_match, stat_boost_1, stat_boost_2, trait_score_band
      ) VALUES (
        ${parseInt(hero.hero_id)},
        ${hero.realm || 'unknown'},
        CURRENT_TIMESTAMP,
        '',
        ${tokenSymbol},
        ${hero.price_native || '0'},
        ${isFloor},
        CURRENT_DATE,
        ${hero.main_class || null},
        ${hero.sub_class || null},
        ${hero.profession || null},
        ${hero.rarity != null ? hero.rarity : null},
        ${hero.level != null ? hero.level : null},
        ${hero.generation != null ? hero.generation : null},
        ${hero.summons != null ? hero.summons : null},
        ${hero.max_summons != null ? hero.max_summons : null},
        ${hero.trait_score != null ? hero.trait_score : null},
        ${profMatch},
        ${hero.stat_boost_1 || null},
        ${hero.stat_boost_2 || null},
        ${traitBand}
      )
      ON CONFLICT (hero_id, sale_timestamp) DO NOTHING
    `;
    
    await recordHeroSnapshot(hero);
    await updateListingHistory(hero, 'sold');
    
    return { wasSale: true };
  } catch (err) {
    console.error(`[SaleIngestion] Error recording sale for hero ${hero.hero_id}:`, err.message);
    return { wasSale: false, reason: err.message };
  }
}

async function recordHeroSnapshot(hero) {
  try {
    const saleList = await rawPg`
      SELECT id FROM tavern_sales 
      WHERE hero_id = ${parseInt(hero.hero_id)}
      ORDER BY sale_timestamp DESC
      LIMIT 1
    `;
    
    if (saleList.length === 0) return;
    
    const saleId = saleList[0].id;
    
    const snapshotList = await rawPg`
      SELECT id FROM hero_snapshots WHERE sale_id = ${saleId}
    `;
    
    if (snapshotList.length > 0) return;
    
    await rawPg`
      INSERT INTO hero_snapshots (
        sale_id, hero_id, rarity, main_class, sub_class, level, profession,
        summons_remaining, max_summons, strength, agility, dexterity,
        vitality, intelligence, wisdom, luck, advanced_genes, elite_genes, exalted_genes
      ) VALUES (
        ${saleId},
        ${parseInt(hero.hero_id)},
        ${hero.rarity || 0},
        ${hero.main_class || 'Unknown'},
        ${hero.sub_class || 'Unknown'},
        ${hero.level || 1},
        ${hero.profession || 'mining'},
        ${hero.summons || 0},
        ${hero.max_summons || 0},
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0
      )
    `;
  } catch (err) {
    console.error(`[SaleIngestion] Error recording hero snapshot:`, err.message);
  }
}

async function updateListingHistory(hero, status) {
  try {
    const profMatch = hero.profession_match || computeProfessionMatch(hero.main_class, hero.profession);
    await rawPg`
      INSERT INTO tavern_listing_history (
        hero_id, realm, snapshot_at, price_native, native_token,
        main_class, sub_class, profession, rarity, level,
        generation, summons, max_summons, trait_score,
        profession_match, stat_boost_1, stat_boost_2,
        status, status_changed_at
      ) VALUES (
        ${hero.hero_id},
        ${hero.realm || 'unknown'},
        CURRENT_TIMESTAMP,
        ${hero.price_native || null},
        ${hero.native_token || null},
        ${hero.main_class || null},
        ${hero.sub_class || null},
        ${hero.profession || null},
        ${hero.rarity != null ? hero.rarity : null},
        ${hero.level != null ? hero.level : null},
        ${hero.generation != null ? hero.generation : null},
        ${hero.summons != null ? hero.summons : null},
        ${hero.max_summons != null ? hero.max_summons : null},
        ${hero.trait_score != null ? hero.trait_score : null},
        ${profMatch},
        ${hero.stat_boost_1 || null},
        ${hero.stat_boost_2 || null},
        ${status},
        CURRENT_TIMESTAMP
      )
    `;
  } catch (err) {
    console.error(`[SaleIngestion] Error updating listing history:`, err.message);
  }
}

export async function computeDemandMetrics() {
  console.log('[SaleIngestion] Computing demand metrics...');
  
  try {
    await ensureSaleTablesExist();
    
    const salesByClass = await rawPg`
      SELECT 
        realm,
        main_class,
        sub_class,
        rarity,
        COUNT(*) FILTER (WHERE sale_timestamp > NOW() - INTERVAL '7 days') as sales_7d,
        COUNT(*) FILTER (WHERE sale_timestamp > NOW() - INTERVAL '30 days') as sales_30d,
        AVG(price_amount::NUMERIC) FILTER (WHERE sale_timestamp > NOW() - INTERVAL '30 days') as avg_price,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY price_amount::NUMERIC) 
          FILTER (WHERE sale_timestamp > NOW() - INTERVAL '30 days') as median_price,
        AVG(trait_score) FILTER (WHERE sale_timestamp > NOW() - INTERVAL '30 days') as avg_trait_score,
        ROUND(100.0 * COUNT(*) FILTER (WHERE profession_match = true AND sale_timestamp > NOW() - INTERVAL '30 days') / 
          NULLIF(COUNT(*) FILTER (WHERE sale_timestamp > NOW() - INTERVAL '30 days'), 0), 1) as pct_profession_match,
        MODE() WITHIN GROUP (ORDER BY trait_score_band) 
          FILTER (WHERE sale_timestamp > NOW() - INTERVAL '30 days') as top_trait_band
      FROM tavern_sales
      WHERE main_class IS NOT NULL
        AND sale_timestamp > NOW() - INTERVAL '30 days'
      GROUP BY realm, main_class, sub_class, rarity
      ORDER BY COUNT(*) DESC
    `;
    
    if (salesByClass.length === 0) {
      console.log('[SaleIngestion] No sales data for demand metrics');
      return { ok: true, metricsComputed: 0 };
    }
    
    await rawPg`DELETE FROM tavern_demand_metrics WHERE as_of_date = CURRENT_DATE`;
    
    const maxSales30d = Math.max(...salesByClass.map(r => parseInt(r.sales_30d) || 1));
    
    let metricsComputed = 0;
    
    for (const row of salesByClass) {
      const sales7d = parseInt(row.sales_7d) || 0;
      const sales30d = parseInt(row.sales_30d) || 0;
      
      const velocityScore = sales30d > 0 ? Math.round((sales7d / Math.max(sales30d, 1)) * 100 * 100) / 100 : 0;
      const demandScore = Math.round((sales30d / maxSales30d) * 100 * 100) / 100;
      const liquidityScore = Math.min(100, Math.round(sales30d * 3.33 * 100) / 100);
      
      await rawPg`
        INSERT INTO tavern_demand_metrics (
          realm, main_class, sub_class, rarity, as_of_date,
          sales_count_7d, sales_count_30d, median_price_native,
          demand_score, velocity_score, liquidity_score,
          avg_trait_score, pct_profession_match, trait_score_band
        ) VALUES (
          ${row.realm},
          ${row.main_class},
          ${row.sub_class || null},
          ${row.rarity != null ? row.rarity : null},
          CURRENT_DATE,
          ${sales7d},
          ${sales30d},
          ${row.median_price || null},
          ${demandScore},
          ${velocityScore},
          ${liquidityScore},
          ${row.avg_trait_score != null ? Math.round(row.avg_trait_score * 100) / 100 : null},
          ${row.pct_profession_match != null ? parseFloat(row.pct_profession_match) : null},
          ${row.top_trait_band || null}
        )
      `;
      
      metricsComputed++;
    }
    
    console.log(`[SaleIngestion] Computed ${metricsComputed} demand metrics`);
    return { ok: true, metricsComputed };
  } catch (err) {
    console.error('[SaleIngestion] computeDemandMetrics error:', err.message);
    return { ok: false, error: err.message };
  }
}

export async function runFullIngestionCycle() {
  if (saleIngestionState.isRunning) {
    console.log('[SaleIngestion] Cycle already running, skipping');
    return { ok: false, reason: 'Already running' };
  }
  
  saleIngestionState.isRunning = true;
  
  try {
    const snapshotResult = await takeListingSnapshot();
    if (!snapshotResult.ok) {
      throw new Error(`Snapshot failed: ${snapshotResult.error}`);
    }
    
    const reconcileResult = await reconcileSales();
    
    await cleanupOldSnapshots();
    
    saleIngestionState.isRunning = false;
    
    return {
      ok: true,
      snapshot: snapshotResult,
      reconciliation: reconcileResult
    };
  } catch (err) {
    saleIngestionState.isRunning = false;
    console.error('[SaleIngestion] Cycle error:', err.message);
    return { ok: false, error: err.message };
  }
}

async function cleanupOldSnapshots() {
  try {
    await rawPg`
      DELETE FROM tavern_listing_snapshots
      WHERE created_at < NOW() - INTERVAL '7 days'
    `;
    console.log('[SaleIngestion] Cleaned up old snapshots (>7 days)');
  } catch (err) {
    console.error('[SaleIngestion] Cleanup error:', err.message);
  }
}

export function startAutoIngestion(intervalMs = SNAPSHOT_INTERVAL_MS) {
  if (autoRunInterval) {
    console.log('[SaleIngestion] Auto ingestion already running');
    return;
  }
  
  console.log(`[SaleIngestion] Starting auto ingestion every ${intervalMs / 60000} minutes`);
  
  autoRunInterval = setInterval(async () => {
    console.log('[SaleIngestion] Auto ingestion triggered');
    await runFullIngestionCycle();
  }, intervalMs);
  
  runFullIngestionCycle();
}

export function stopAutoIngestion() {
  if (autoRunInterval) {
    clearInterval(autoRunInterval);
    autoRunInterval = null;
    console.log('[SaleIngestion] Auto ingestion stopped');
  }
}

export function getSaleIngestionStatus() {
  return {
    ...saleIngestionState,
    autoRunActive: !!autoRunInterval
  };
}

export async function getSalesStats(realm = null, days = 30) {
  try {
    let result;
    if (realm) {
      result = await rawPg`
        SELECT 
          realm,
          COUNT(*) as total_sales,
          AVG(price_amount::NUMERIC) as avg_price,
          MIN(price_amount::NUMERIC) as min_price,
          MAX(price_amount::NUMERIC) as max_price
        FROM tavern_sales
        WHERE realm = ${realm}
          AND sale_timestamp > NOW() - INTERVAL '1 day' * ${days}
        GROUP BY realm
      `;
    } else {
      result = await rawPg`
        SELECT 
          realm,
          COUNT(*) as total_sales,
          AVG(price_amount::NUMERIC) as avg_price,
          MIN(price_amount::NUMERIC) as min_price,
          MAX(price_amount::NUMERIC) as max_price
        FROM tavern_sales
        WHERE sale_timestamp > NOW() - INTERVAL '1 day' * ${days}
        GROUP BY realm
      `;
    }
    return result;
  } catch (err) {
    console.error('[SaleIngestion] getSalesStats error:', err.message);
    return [];
  }
}

export async function getRecentSales(limit = 50, realm = null) {
  try {
    let result;
    if (realm) {
      result = await rawPg`
        SELECT 
          ts.id, ts.hero_id, ts.realm, ts.sale_timestamp, ts.token_symbol, ts.price_amount,
          ts.main_class, ts.sub_class, ts.profession, ts.rarity, ts.level,
          ts.generation, ts.summons, ts.max_summons, ts.trait_score,
          ts.profession_match, ts.stat_boost_1, ts.stat_boost_2, ts.trait_score_band,
          hs.main_class as hs_main_class, hs.sub_class as hs_sub_class, 
          hs.rarity as hs_rarity, hs.level as hs_level, hs.profession as hs_profession
        FROM tavern_sales ts
        LEFT JOIN hero_snapshots hs ON ts.id = hs.sale_id
        WHERE ts.realm = ${realm}
        ORDER BY ts.sale_timestamp DESC
        LIMIT ${limit}
      `;
    } else {
      result = await rawPg`
        SELECT 
          ts.id, ts.hero_id, ts.realm, ts.sale_timestamp, ts.token_symbol, ts.price_amount,
          ts.main_class, ts.sub_class, ts.profession, ts.rarity, ts.level,
          ts.generation, ts.summons, ts.max_summons, ts.trait_score,
          ts.profession_match, ts.stat_boost_1, ts.stat_boost_2, ts.trait_score_band,
          hs.main_class as hs_main_class, hs.sub_class as hs_sub_class, 
          hs.rarity as hs_rarity, hs.level as hs_level, hs.profession as hs_profession
        FROM tavern_sales ts
        LEFT JOIN hero_snapshots hs ON ts.id = hs.sale_id
        ORDER BY ts.sale_timestamp DESC
        LIMIT ${limit}
      `;
    }
    return result;
  } catch (err) {
    console.error('[SaleIngestion] getRecentSales error:', err.message);
    return [];
  }
}

export async function getDemandMetrics(realm = null) {
  try {
    await ensureSaleTablesExist();
    
    let result;
    if (realm) {
      result = await rawPg`
        SELECT id, realm, main_class, sub_class, profession, rarity, level_band,
          sales_count_7d, sales_count_30d, avg_time_on_market_hours, median_price_native,
          demand_score, velocity_score, liquidity_score,
          avg_trait_score, pct_profession_match, trait_score_band,
          as_of_date
        FROM tavern_demand_metrics 
        WHERE realm = ${realm}
        ORDER BY as_of_date DESC, demand_score DESC
        LIMIT 100
      `;
    } else {
      result = await rawPg`
        SELECT id, realm, main_class, sub_class, profession, rarity, level_band,
          sales_count_7d, sales_count_30d, avg_time_on_market_hours, median_price_native,
          demand_score, velocity_score, liquidity_score,
          avg_trait_score, pct_profession_match, trait_score_band,
          as_of_date
        FROM tavern_demand_metrics 
        ORDER BY as_of_date DESC, demand_score DESC
        LIMIT 100
      `;
    }
    return result;
  } catch (err) {
    console.error('[SaleIngestion] getDemandMetrics error:', err.message);
    return [];
  }
}

export async function initializeSaleTables() {
  try {
    await ensureSaleTablesExist();
    console.log('[SaleIngestion] Tables initialized');
    return { ok: true };
  } catch (err) {
    console.error('[SaleIngestion] Table initialization error:', err.message);
    return { ok: false, error: err.message };
  }
}

const RARITY_NAMES = ['Common', 'Uncommon', 'Rare', 'Legendary', 'Mythic'];

function computePriceStats(prices) {
  if (!prices || prices.length === 0) return null;
  
  const sorted = [...prices].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const avg = sum / sorted.length;
  const median = sorted.length % 2 === 0
    ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
    : sorted[Math.floor(sorted.length / 2)];
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  
  const p10 = sorted[Math.floor(sorted.length * 0.1)] || min;
  const p25 = sorted[Math.floor(sorted.length * 0.25)] || min;
  const p75 = sorted[Math.floor(sorted.length * 0.75)] || max;
  const p90 = sorted[Math.floor(sorted.length * 0.9)] || max;
  
  const variance = sorted.reduce((acc, p) => acc + Math.pow(p - avg, 2), 0) / sorted.length;
  const stdDev = Math.sqrt(variance);
  const cv = (stdDev / avg) * 100;
  
  let confidence = 'low';
  if (sorted.length >= 20 && cv < 50) confidence = 'high';
  else if (sorted.length >= 10 && cv < 75) confidence = 'medium';
  else if (sorted.length >= 5 && cv < 100) confidence = 'medium-low';
  
  return {
    avg: Math.round(avg * 100) / 100,
    median: Math.round(median * 100) / 100,
    min: Math.round(min * 100) / 100,
    max: Math.round(max * 100) / 100,
    p10: Math.round(p10 * 100) / 100,
    p25: Math.round(p25 * 100) / 100,
    p75: Math.round(p75 * 100) / 100,
    p90: Math.round(p90 * 100) / 100,
    stdDev: Math.round(stdDev * 100) / 100,
    cv: Math.round(cv),
    confidence,
    sampleSize: sorted.length
  };
}

export async function getHeroPriceByHeroId(heroId) {
  try {
    await ensureSaleTablesExist();
    
    const numericId = parseInt(heroId);
    if (isNaN(numericId)) {
      return { ok: false, error: 'Invalid hero ID' };
    }
    
    let hero = null;

    try {
      const tavernHeroCheck = await rawPg`
        SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tavern_heroes') as exists
      `;
      if (tavernHeroCheck[0]?.exists) {
        const tavernHero = await rawPg`
          SELECT 
            hero_id, normalized_id, realm, main_class, sub_class, profession,
            rarity, level, generation, summons, max_summons,
            strength, agility, intelligence, wisdom, luck, dexterity, vitality, endurance,
            hp, mp, stamina, active1, active2, passive1, passive2,
            trait_score, combat_power, price_native, native_token,
            stat_genes, visual_genes
          FROM tavern_heroes
          WHERE normalized_id = ${numericId} OR hero_id = ${heroId.toString()}
          LIMIT 1
        `;
    
        if (tavernHero.length > 0) {
          const h = tavernHero[0];
          hero = {
            heroId: h.hero_id,
            normalizedId: h.normalized_id || numericId,
            realm: h.realm,
            mainClass: h.main_class,
            subClass: h.sub_class,
            profession: h.profession,
            rarity: h.rarity,
            rarityName: RARITY_NAMES[h.rarity] || `Rarity${h.rarity}`,
            level: h.level,
            generation: h.generation,
            summons: h.summons,
            maxSummons: h.max_summons,
            stats: {
              strength: h.strength, agility: h.agility, intelligence: h.intelligence,
              wisdom: h.wisdom, luck: h.luck, dexterity: h.dexterity,
              vitality: h.vitality, endurance: h.endurance
            },
            traitScore: h.trait_score,
            combatPower: h.combat_power,
            currentListingPrice: h.price_native ? parseFloat(h.price_native) : null,
            nativeToken: h.native_token,
            isForSale: h.price_native != null && parseFloat(h.price_native) > 0,
            source: 'tavern_index'
          };
        }
      }
    } catch (err) {
      console.log(`[HeroPriceTool] Tavern heroes table not available, falling back to GraphQL: ${err.message}`);
    }
    
    if (!hero) {
      try {
        const { getHeroById } = await import('../../../onchain-data.js');
        const gqlHero = await getHeroById(numericId);
        if (gqlHero) {
          const realm = gqlHero.network === 'dfk' ? 'cv' : 'sd';
          hero = {
            heroId: gqlHero.id,
            normalizedId: numericId,
            realm,
            mainClass: gqlHero.mainClassStr,
            subClass: gqlHero.subClassStr,
            profession: gqlHero.professionStr,
            rarity: gqlHero.rarity,
            rarityName: RARITY_NAMES[gqlHero.rarity] || `Rarity${gqlHero.rarity}`,
            level: gqlHero.level,
            generation: gqlHero.generation,
            summons: gqlHero.summons,
            maxSummons: gqlHero.maxSummons,
            stats: {
              strength: gqlHero.strength, agility: gqlHero.agility, intelligence: gqlHero.intelligence,
              wisdom: gqlHero.wisdom, luck: gqlHero.luck, dexterity: gqlHero.dexterity,
              vitality: gqlHero.vitality, endurance: gqlHero.endurance
            },
            traitScore: 0,
            combatPower: (gqlHero.strength || 0) + (gqlHero.agility || 0) + (gqlHero.intelligence || 0) + 
                        (gqlHero.wisdom || 0) + (gqlHero.luck || 0) + (gqlHero.dexterity || 0) + 
                        (gqlHero.vitality || 0) + (gqlHero.endurance || 0),
            currentListingPrice: gqlHero.salePrice ? parseFloat(gqlHero.salePrice) / 1e18 : null,
            nativeToken: realm === 'cv' ? 'CRYSTAL' : 'JEWEL',
            isForSale: gqlHero.salePrice && parseFloat(gqlHero.salePrice) > 0,
            source: 'graphql'
          };
        }
      } catch (err) {
        console.error(`[HeroPriceTool] GraphQL lookup failed for hero ${numericId}:`, err.message);
      }
    }
    
    if (!hero) {
      return { ok: false, error: `Hero ${heroId} not found in tavern index or blockchain` };
    }
    
    const tiers = [
      { label: 'exact', where: buildSalesFilter(hero, 'exact') },
      { label: 'tight', where: buildSalesFilter(hero, 'tight') },
      { label: 'broad', where: buildSalesFilter(hero, 'broad') },
    ];
    
    let salesData = [];
    let matchTier = 'none';
    let priceStats = null;
    
    for (const tier of tiers) {
      const results = await tier.where;
      const prices = results
        .map(s => parseFloat(s.price_amount))
        .filter(p => !isNaN(p) && p > 0);
      
      if (prices.length >= 3) {
        salesData = results;
        matchTier = tier.label;
        priceStats = computePriceStats(prices);
        break;
      }
      if (prices.length > 0 && !salesData.length) {
        salesData = results;
        matchTier = tier.label;
        priceStats = computePriceStats(prices);
      }
    }
    
    let estimatedValue = null;
    let flipOpportunity = null;
    
    if (priceStats) {
      estimatedValue = {
        fairValue: priceStats.median,
        buyBelow: priceStats.p25,
        sellAbove: priceStats.p75,
        premiumPrice: priceStats.p90,
        bargainPrice: priceStats.p10,
        token: hero.nativeToken || (hero.realm === 'cv' ? 'CRYSTAL' : 'JEWEL'),
        confidence: priceStats.confidence,
        matchTier,
        sampleSize: priceStats.sampleSize,
        priceVariation: priceStats.cv
      };
      
      if (hero.isForSale && hero.currentListingPrice > 0) {
        const discount = ((estimatedValue.fairValue - hero.currentListingPrice) / estimatedValue.fairValue) * 100;
        const potentialProfit = estimatedValue.fairValue - hero.currentListingPrice;
        
        flipOpportunity = {
          currentPrice: hero.currentListingPrice,
          estimatedValue: estimatedValue.fairValue,
          discount: Math.round(discount * 10) / 10,
          potentialProfit: Math.round(potentialProfit * 100) / 100,
          isUnderpriced: discount > 15,
          verdict: discount > 40 ? 'STRONG BUY' : discount > 20 ? 'BUY' : discount > 0 ? 'FAIR' : 'OVERPRICED'
        };
      }
    }
    
    return {
      ok: true,
      hero,
      estimatedValue,
      flipOpportunity,
      comparableSales: salesData.slice(0, 15).map(s => ({
        heroId: s.hero_id,
        price: parseFloat(s.price_amount),
        token: s.token_symbol,
        saleDate: s.sale_timestamp,
        mainClass: s.main_class,
        subClass: s.sub_class,
        rarity: s.rarity,
        level: s.level,
        profession: s.profession,
        realm: s.realm,
        professionMatch: s.profession_match || false,
        traitScore: s.trait_score || null,
        traitScoreBand: s.trait_score_band || null,
        statBoost1: s.stat_boost_1 || null,
        statBoost2: s.stat_boost_2 || null
      })),
      matchTier
    };
  } catch (err) {
    console.error('[HeroPriceTool] Error:', err.message);
    return { ok: false, error: err.message };
  }
}

async function buildSalesFilter(hero, tier) {
  const realm = hero.realm;
  const mainClass = hero.mainClass;
  const rarity = hero.rarity;
  const level = hero.level || 1;
  const subClass = hero.subClass;
  
  const cols = `id, hero_id, realm, sale_timestamp, token_symbol, price_amount,
    main_class, sub_class, profession, rarity, level,
    generation, summons, max_summons, trait_score,
    profession_match, stat_boost_1, stat_boost_2, trait_score_band`;
  
  switch (tier) {
    case 'exact':
      return rawPg`
        SELECT ${rawPg.unsafe(cols)},
          COALESCE(trait_score, 0) as ts
        FROM tavern_sales
        WHERE realm = ${realm}
          AND main_class = ${mainClass}
          AND rarity = ${rarity}
          AND level BETWEEN ${Math.max(1, level - 2)} AND ${level + 2}
          AND (sub_class = ${subClass} OR sub_class IS NULL)
          AND sale_timestamp > NOW() - INTERVAL '30 days'
          AND price_amount > 0
        ORDER BY 
          CASE WHEN profession_match = true THEN 0 ELSE 1 END,
          ABS(COALESCE(trait_score, 0) - ${hero.traitScore || 0}),
          sale_timestamp DESC
        LIMIT 100
      `;
    case 'tight':
      return rawPg`
        SELECT ${rawPg.unsafe(cols)},
          COALESCE(trait_score, 0) as ts
        FROM tavern_sales
        WHERE realm = ${realm}
          AND main_class = ${mainClass}
          AND rarity = ${rarity}
          AND level BETWEEN ${Math.max(1, level - 5)} AND ${level + 5}
          AND sale_timestamp > NOW() - INTERVAL '60 days'
          AND price_amount > 0
        ORDER BY 
          ABS(COALESCE(trait_score, 0) - ${hero.traitScore || 0}),
          sale_timestamp DESC
        LIMIT 200
      `;
    case 'broad':
      return rawPg`
        SELECT ${rawPg.unsafe(cols)},
          COALESCE(trait_score, 0) as ts
        FROM tavern_sales
        WHERE realm = ${realm}
          AND main_class = ${mainClass}
          AND (rarity = ${rarity} OR rarity BETWEEN ${Math.max(0, rarity - 1)} AND ${rarity + 1})
          AND sale_timestamp > NOW() - INTERVAL '90 days'
          AND price_amount > 0
        ORDER BY sale_timestamp DESC
        LIMIT 300
      `;
    default:
      return [];
  }
}

export async function findFlippableHeroes(options = {}) {
  try {
    await ensureSaleTablesExist();
    
    const {
      realm = null,
      minDiscount = 20,
      minConfidence = 'medium-low',
      limit = 50,
      maxPrice = null,
      mainClass = null
    } = options;

    const tableCheck = await rawPg`
      SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tavern_heroes') as exists
    `;
    if (!tableCheck[0]?.exists) {
      return { ok: true, flippable: [], message: 'Tavern heroes table not found. Run tavern indexer first to populate hero data.', totalScanned: 0, totalSalesData: 0, matchesFound: 0 };
    }
    
    let tavernHeroes;
    if (realm && mainClass) {
      tavernHeroes = await rawPg`
        SELECT 
          hero_id, normalized_id, realm, main_class, sub_class, profession,
          rarity, level, generation, summons, max_summons,
          trait_score, combat_power, price_native, native_token
        FROM tavern_heroes
        WHERE realm = ${realm} AND main_class = ${mainClass}
          AND price_native > 0
        ORDER BY price_native ASC
        LIMIT 500
      `;
    } else if (realm) {
      tavernHeroes = await rawPg`
        SELECT 
          hero_id, normalized_id, realm, main_class, sub_class, profession,
          rarity, level, generation, summons, max_summons,
          trait_score, combat_power, price_native, native_token
        FROM tavern_heroes
        WHERE realm = ${realm} AND price_native > 0
        ORDER BY price_native ASC
        LIMIT 500
      `;
    } else {
      tavernHeroes = await rawPg`
        SELECT 
          hero_id, normalized_id, realm, main_class, sub_class, profession,
          rarity, level, generation, summons, max_summons,
          trait_score, combat_power, price_native, native_token
        FROM tavern_heroes
        WHERE price_native > 0
        ORDER BY price_native ASC
        LIMIT 500
      `;
    }
    
    if (tavernHeroes.length === 0) {
      return { ok: true, flippable: [], message: 'No tavern heroes found. Run tavern indexer first.' };
    }
    
    const allRecentSales = await rawPg`
      SELECT 
        main_class, sub_class, rarity, level, realm, profession,
        price_amount, token_symbol, sale_timestamp
      FROM tavern_sales
      WHERE sale_timestamp > NOW() - INTERVAL '60 days'
        AND price_amount > 0
        AND main_class IS NOT NULL
      ORDER BY sale_timestamp DESC
    `;
    
    if (allRecentSales.length === 0) {
      return { ok: true, flippable: [], message: 'No sales data yet. Run ingestion cycles to build sales history first.' };
    }
    
    const salesIndex = {};
    for (const sale of allRecentSales) {
      const key = `${sale.realm}|${sale.main_class}|${sale.rarity}`;
      if (!salesIndex[key]) salesIndex[key] = [];
      salesIndex[key].push(sale);
    }
    
    const confidenceOrder = ['high', 'medium', 'medium-low', 'low'];
    const minConfIdx = confidenceOrder.indexOf(minConfidence);
    
    const flippable = [];
    
    for (const hero of tavernHeroes) {
      const listingPrice = parseFloat(hero.price_native);
      if (!listingPrice || listingPrice <= 0) continue;
      if (maxPrice && listingPrice > maxPrice) continue;
      
      const heroLevel = hero.level || 1;
      
      const exactKey = `${hero.realm}|${hero.main_class}|${hero.rarity}`;
      const broadKey1 = `${hero.realm}|${hero.main_class}|${Math.max(0, (hero.rarity || 0) - 1)}`;
      const broadKey2 = `${hero.realm}|${hero.main_class}|${Math.min(4, (hero.rarity || 0) + 1)}`;
      
      let matchedSales = [];
      
      const exactSales = salesIndex[exactKey] || [];
      const levelMatched = exactSales.filter(s => {
        const sl = s.level || 1;
        return Math.abs(sl - heroLevel) <= 5;
      });
      
      if (levelMatched.length >= 3) {
        matchedSales = levelMatched;
      } else {
        matchedSales = exactSales;
        if (matchedSales.length < 3) {
          const broad1 = salesIndex[broadKey1] || [];
          const broad2 = salesIndex[broadKey2] || [];
          matchedSales = [...matchedSales, ...broad1, ...broad2];
        }
      }
      
      if (matchedSales.length < 2) continue;
      
      const prices = matchedSales
        .map(s => parseFloat(s.price_amount))
        .filter(p => !isNaN(p) && p > 0);
      
      if (prices.length < 2) continue;
      
      const stats = computePriceStats(prices);
      if (!stats) continue;
      
      const confIdx = confidenceOrder.indexOf(stats.confidence);
      if (confIdx > minConfIdx) continue;
      
      const fairValue = stats.median;
      const discount = ((fairValue - listingPrice) / fairValue) * 100;
      
      if (discount < minDiscount) continue;
      
      const potentialProfit = fairValue - listingPrice;
      
      flippable.push({
        heroId: hero.hero_id,
        normalizedId: hero.normalized_id,
        realm: hero.realm,
        mainClass: hero.main_class,
        subClass: hero.sub_class,
        profession: hero.profession,
        rarity: hero.rarity,
        rarityName: RARITY_NAMES[hero.rarity] || `Rarity${hero.rarity}`,
        level: hero.level,
        generation: hero.generation,
        traitScore: hero.trait_score,
        combatPower: hero.combat_power,
        listingPrice: Math.round(listingPrice * 100) / 100,
        estimatedValue: Math.round(fairValue * 100) / 100,
        discount: Math.round(discount * 10) / 10,
        potentialProfit: Math.round(potentialProfit * 100) / 100,
        confidence: stats.confidence,
        sampleSize: stats.sampleSize,
        token: hero.native_token || (hero.realm === 'cv' ? 'CRYSTAL' : 'JEWEL'),
        verdict: discount > 40 ? 'STRONG BUY' : discount > 25 ? 'BUY' : 'POSSIBLE BUY',
        sellTarget: Math.round(stats.p75 * 100) / 100,
        premiumTarget: Math.round(stats.p90 * 100) / 100
      });
    }
    
    flippable.sort((a, b) => {
      const confA = confidenceOrder.indexOf(a.confidence);
      const confB = confidenceOrder.indexOf(b.confidence);
      if (confA !== confB) return confA - confB;
      return b.discount - a.discount;
    });
    
    return {
      ok: true,
      flippable: flippable.slice(0, limit),
      totalScanned: tavernHeroes.length,
      totalSalesData: allRecentSales.length,
      matchesFound: flippable.length
    };
  } catch (err) {
    console.error('[FlippableHeroes] Error:', err.message);
    return { ok: false, error: err.message };
  }
}

export async function getHeroPriceRecommendation(params) {
  try {
    await ensureSaleTablesExist();
    
    const { mainClass, rarity, levelMin, levelMax, profession, realm } = params;
    
    const allSales = await rawPg`
      SELECT 
        ts.hero_id,
        ts.price_amount,
        ts.token_symbol,
        ts.sale_timestamp,
        ts.realm,
        COALESCE(ts.main_class, hs.main_class) as main_class,
        COALESCE(ts.sub_class, hs.sub_class) as sub_class,
        COALESCE(ts.rarity, hs.rarity) as rarity,
        COALESCE(ts.level, hs.level) as level,
        COALESCE(ts.profession, hs.profession) as profession
      FROM tavern_sales ts
      LEFT JOIN hero_snapshots hs ON ts.id = hs.sale_id
      WHERE ts.sale_timestamp > NOW() - INTERVAL '30 days'
      ORDER BY ts.sale_timestamp DESC
      LIMIT 500
    `;
    
    let similarSales = allSales.filter(s => {
      if (realm && s.realm !== realm) return false;
      if (mainClass && s.main_class !== mainClass) return false;
      if (rarity !== undefined && rarity !== null && rarity !== '' && s.rarity !== parseInt(rarity)) return false;
      if (levelMin && (s.level === null || s.level < parseInt(levelMin))) return false;
      if (levelMax && (s.level === null || s.level > parseInt(levelMax))) return false;
      if (profession && s.profession !== profession) return false;
      return true;
    }).slice(0, 100);
    
    if (similarSales.length === 0) {
      return {
        ok: true,
        recommendation: null,
        similarSalesCount: 0,
        message: 'No similar sales found. Try broadening your criteria.'
      };
    }
    
    const prices = similarSales
      .map(s => parseFloat(s.price_amount))
      .filter(p => !isNaN(p) && p > 0);
    
    if (prices.length === 0) {
      return {
        ok: true,
        recommendation: null,
        similarSalesCount: similarSales.length,
        message: 'No valid price data found.'
      };
    }
    
    const stats = computePriceStats(prices);
    
    const token = similarSales[0]?.token_symbol || (realm === 'cv' ? 'CRYSTAL' : 'JEWEL');
    
    return {
      ok: true,
      recommendation: {
        buyLow: stats.p10,
        buyFair: stats.p25,
        marketMedian: stats.median,
        marketAverage: stats.avg,
        sellFair: stats.p75,
        sellHigh: stats.p90,
        priceRange: { min: stats.min, max: stats.max },
        token,
        confidence: stats.confidence,
        sampleSize: stats.sampleSize,
        priceVariation: stats.cv
      },
      recentSales: similarSales.slice(0, 10).map(s => ({
        heroId: s.hero_id,
        price: parseFloat(s.price_amount),
        token: s.token_symbol,
        saleDate: s.sale_timestamp,
        mainClass: s.main_class,
        rarity: s.rarity,
        level: s.level,
        profession: s.profession
      })),
      similarSalesCount: similarSales.length
    };
  } catch (err) {
    console.error('[SaleIngestion] getHeroPriceRecommendation error:', err.message);
    return { ok: false, error: err.message };
  }
}
