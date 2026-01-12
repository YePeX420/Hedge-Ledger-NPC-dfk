/**
 * Sale Ingestion Service
 * 
 * Detects hero sales via delta comparison between listing snapshots.
 * Runs hourly to:
 * 1. Snapshot current tavern listings
 * 2. Compare with previous snapshot to detect removed heroes (sold/delisted)
 * 3. Store detected sales in tavern_hero_sales with hero traits snapshot
 * 4. Update demand metrics based on sale velocity
 */

import { db } from '../../../server/db.js';
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

async function ensureSaleTablesExist() {
  await db.execute(sql`
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
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL
    )
  `);
  
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS tavern_listing_snapshots_snapshot_idx 
    ON tavern_listing_snapshots(snapshot_id)
  `);
  
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS tavern_listing_snapshots_hero_idx 
    ON tavern_listing_snapshots(hero_id)
  `);
}

export async function takeListingSnapshot() {
  const snapshotId = `snap_${Date.now()}_${nanoid(6)}`;
  console.log(`[SaleIngestion] Taking listing snapshot ${snapshotId}...`);
  
  try {
    await ensureSaleTablesExist();
    
    const heroes = await db.execute(sql`
      SELECT 
        hero_id,
        realm,
        price_native,
        native_token,
        main_class,
        sub_class,
        profession,
        rarity,
        level,
        generation,
        summons,
        max_summons,
        trait_score
      FROM tavern_heroes
    `);
    
    const heroList = Array.isArray(heroes) ? heroes : (heroes.rows || []);
    console.log(`[SaleIngestion] Found ${heroList.length} heroes in tavern`);
    
    if (heroList.length === 0) {
      console.log('[SaleIngestion] No heroes in tavern, skipping snapshot');
      return { ok: true, snapshotId, heroCount: 0 };
    }
    
    const batchSize = 100;
    let inserted = 0;
    
    for (let i = 0; i < heroList.length; i += batchSize) {
      const batch = heroList.slice(i, i + batchSize);
      
      const values = batch.map(h => sql`(
        ${snapshotId},
        ${h.hero_id},
        ${h.realm},
        ${h.price_native},
        ${h.native_token},
        ${h.main_class},
        ${h.sub_class},
        ${h.profession},
        ${h.rarity},
        ${h.level},
        ${h.generation},
        ${h.summons},
        ${h.max_summons},
        ${h.trait_score}
      )`);
      
      await db.execute(sql`
        INSERT INTO tavern_listing_snapshots (
          snapshot_id, hero_id, realm, price_native, native_token,
          main_class, sub_class, profession, rarity, level,
          generation, summons, max_summons, trait_score
        ) VALUES ${sql.join(values, sql`, `)}
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
    
    const snapshots = await db.execute(sql`
      SELECT DISTINCT snapshot_id, MIN(created_at) as created_at
      FROM tavern_listing_snapshots
      GROUP BY snapshot_id
      ORDER BY MIN(created_at) DESC
      LIMIT 2
    `);
    
    const snapshotList = Array.isArray(snapshots) ? snapshots : (snapshots.rows || []);
    
    if (snapshotList.length < 2) {
      console.log('[SaleIngestion] Need at least 2 snapshots for comparison');
      return { ok: true, salesDetected: 0, message: 'Waiting for more snapshots' };
    }
    
    const currentSnapshotId = snapshotList[0].snapshot_id;
    const previousSnapshotId = snapshotList[1].snapshot_id;
    
    console.log(`[SaleIngestion] Comparing ${previousSnapshotId} -> ${currentSnapshotId}`);
    
    const removedHeroes = await db.execute(sql`
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
        prev.created_at as listed_at
      FROM tavern_listing_snapshots prev
      LEFT JOIN tavern_listing_snapshots curr 
        ON prev.hero_id = curr.hero_id 
        AND curr.snapshot_id = ${currentSnapshotId}
      WHERE prev.snapshot_id = ${previousSnapshotId}
        AND curr.hero_id IS NULL
    `);
    
    const removedList = Array.isArray(removedHeroes) ? removedHeroes : (removedHeroes.rows || []);
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
    const existingSale = await db.execute(sql`
      SELECT id FROM tavern_sales 
      WHERE hero_id = ${parseInt(hero.hero_id)} 
      AND sale_timestamp > NOW() - INTERVAL '24 hours'
    `);
    
    const existingList = Array.isArray(existingSale) ? existingSale : (existingSale.rows || []);
    if (existingList.length > 0) {
      return { wasSale: false, reason: 'Already recorded' };
    }
    
    const tokenSymbol = hero.native_token || (hero.realm === 'cv' ? 'CRYSTAL' : 'JEWEL');
    
    await db.execute(sql`
      INSERT INTO tavern_sales (
        hero_id, realm, sale_timestamp, token_address, token_symbol,
        price_amount, is_floor_hero, as_of_date
      ) VALUES (
        ${parseInt(hero.hero_id)},
        ${hero.realm},
        CURRENT_TIMESTAMP,
        '',
        ${tokenSymbol},
        ${hero.price_native || '0'},
        ${hero.rarity === 0 && hero.level <= 1},
        CURRENT_DATE
      )
      ON CONFLICT (hero_id, sale_timestamp) DO NOTHING
    `);
    
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
    const saleResult = await db.execute(sql`
      SELECT id FROM tavern_sales 
      WHERE hero_id = ${parseInt(hero.hero_id)}
      ORDER BY sale_timestamp DESC
      LIMIT 1
    `);
    
    const saleList = Array.isArray(saleResult) ? saleResult : (saleResult.rows || []);
    if (saleList.length === 0) return;
    
    const saleId = saleList[0].id;
    
    const existingSnapshot = await db.execute(sql`
      SELECT id FROM hero_snapshots WHERE sale_id = ${saleId}
    `);
    
    const snapshotList = Array.isArray(existingSnapshot) ? existingSnapshot : (existingSnapshot.rows || []);
    if (snapshotList.length > 0) return;
    
    await db.execute(sql`
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
    `);
  } catch (err) {
    console.error(`[SaleIngestion] Error recording hero snapshot:`, err.message);
  }
}

async function updateListingHistory(hero, status) {
  try {
    await db.execute(sql`
      INSERT INTO tavern_listing_history (
        hero_id, realm, snapshot_at, price_native, native_token,
        main_class, sub_class, profession, rarity, level,
        generation, summons, max_summons, trait_score, status, status_changed_at
      ) VALUES (
        ${hero.hero_id},
        ${hero.realm},
        CURRENT_TIMESTAMP,
        ${hero.price_native},
        ${hero.native_token},
        ${hero.main_class},
        ${hero.sub_class},
        ${hero.profession},
        ${hero.rarity},
        ${hero.level},
        ${hero.generation},
        ${hero.summons},
        ${hero.max_summons},
        ${hero.trait_score},
        ${status},
        CURRENT_TIMESTAMP
      )
    `);
  } catch (err) {
    console.error(`[SaleIngestion] Error updating listing history:`, err.message);
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
    await db.execute(sql`
      DELETE FROM tavern_listing_snapshots
      WHERE created_at < NOW() - INTERVAL '7 days'
    `);
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
    let query;
    if (realm) {
      query = sql`
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
      query = sql`
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
    
    const result = await db.execute(query);
    return Array.isArray(result) ? result : (result.rows || []);
  } catch (err) {
    console.error('[SaleIngestion] getSalesStats error:', err.message);
    return [];
  }
}

export async function getRecentSales(limit = 50, realm = null) {
  try {
    let query;
    if (realm) {
      query = sql`
        SELECT 
          ts.*, 
          hs.main_class, hs.sub_class, hs.rarity, hs.level, hs.profession
        FROM tavern_sales ts
        LEFT JOIN hero_snapshots hs ON ts.id = hs.sale_id
        WHERE ts.realm = ${realm}
        ORDER BY ts.sale_timestamp DESC
        LIMIT ${limit}
      `;
    } else {
      query = sql`
        SELECT 
          ts.*, 
          hs.main_class, hs.sub_class, hs.rarity, hs.level, hs.profession
        FROM tavern_sales ts
        LEFT JOIN hero_snapshots hs ON ts.id = hs.sale_id
        ORDER BY ts.sale_timestamp DESC
        LIMIT ${limit}
      `;
    }
    
    const result = await db.execute(query);
    return Array.isArray(result) ? result : (result.rows || []);
  } catch (err) {
    console.error('[SaleIngestion] getRecentSales error:', err.message);
    return [];
  }
}
