import { db } from '../server/db.js';
import { bridgeEvents } from '../shared/schema.js';
import { eq, isNull, sql, and, gte, lte } from 'drizzle-orm';
import { getPriceAtTimestamp, fetchHistoricalPrice } from './price-history.js';

const BATCH_SIZE = 100;
const DELAY_BETWEEN_BATCHES_MS = 1000;

let enrichmentRunning = false;
let enrichmentAbort = false;

export function isEnrichmentRunning() {
  return enrichmentRunning;
}

export function abortEnrichment() {
  enrichmentAbort = true;
}

export async function getUnpricedEventCount() {
  const result = await db.select({ count: sql`count(*)::int` })
    .from(bridgeEvents)
    .where(isNull(bridgeEvents.usdValue));
  return result[0]?.count || 0;
}

export async function getUnpricedEventsByDateToken() {
  const result = await db.execute(sql`
    SELECT 
      date_trunc('day', block_timestamp) as event_date,
      token_symbol,
      count(*) as event_count
    FROM bridge_events
    WHERE usd_value IS NULL AND token_symbol IS NOT NULL
    GROUP BY date_trunc('day', block_timestamp), token_symbol
    ORDER BY event_date ASC
    LIMIT 100
  `);
  return result.rows || [];
}

export async function enrichEventsForDateToken(eventDate, tokenSymbol, verbose = false) {
  const dayStart = new Date(eventDate);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(eventDate);
  dayEnd.setUTCHours(23, 59, 59, 999);

  // Skip non-token events (heroes, pets, equipment have null tokenSymbol or 'HERO'/'PET' etc)
  if (!tokenSymbol || tokenSymbol === 'HERO' || tokenSymbol === 'PET' || tokenSymbol === 'EQUIPMENT') {
    return { updated: 0, skipped: 0 };
  }

  const price = await getPriceAtTimestamp(tokenSymbol, dayStart);
  
  if (!price || isNaN(price)) {
    if (verbose) {
      console.log(`[PriceEnrichment] No price found for ${tokenSymbol} on ${dayStart.toISOString().split('T')[0]}`);
    }
    return { updated: 0, skipped: 0 };
  }

  const events = await db.select()
    .from(bridgeEvents)
    .where(
      and(
        eq(bridgeEvents.tokenSymbol, tokenSymbol),
        isNull(bridgeEvents.usdValue),
        gte(bridgeEvents.blockTimestamp, dayStart),
        lte(bridgeEvents.blockTimestamp, dayEnd)
      )
    );

  let updated = 0;
  let skipped = 0;
  for (const event of events) {
    try {
      // Skip events with null or invalid amounts
      if (!event.amount || event.amount === '' || event.amount === 'null') {
        skipped++;
        continue;
      }

      const amount = parseFloat(event.amount);
      if (isNaN(amount) || amount <= 0) {
        skipped++;
        continue;
      }

      const usdValue = amount * price;
      
      // Guard against NaN results
      if (isNaN(usdValue)) {
        console.warn(`[PriceEnrichment] NaN result for event ${event.id}: amount=${event.amount}, price=${price}`);
        skipped++;
        continue;
      }
      
      await db.update(bridgeEvents)
        .set({
          usdValue: usdValue.toFixed(2),
          tokenPriceUsd: price.toFixed(6),
        })
        .where(eq(bridgeEvents.id, event.id));
      
      updated++;
    } catch (err) {
      console.error(`[PriceEnrichment] Error updating event ${event.id}:`, err.message);
      skipped++;
    }
  }

  if (verbose && updated > 0) {
    console.log(`[PriceEnrichment] ${tokenSymbol} on ${dayStart.toISOString().split('T')[0]}: $${price.toFixed(4)} - Updated ${updated} events`);
  }

  return { updated, skipped };
}

export async function runPriceEnrichment(options = {}) {
  const { verbose = true, maxBatches = 1000 } = options;

  if (enrichmentRunning) {
    console.log('[PriceEnrichment] Already running, skipping...');
    return { status: 'already_running' };
  }

  enrichmentRunning = true;
  enrichmentAbort = false;

  try {
    const unpricedCount = await getUnpricedEventCount();
    console.log(`[PriceEnrichment] Starting enrichment. ${unpricedCount} events need prices.`);

    let totalUpdated = 0;
    let batchCount = 0;

    while (!enrichmentAbort && batchCount < maxBatches) {
      const dateTokenGroups = await getUnpricedEventsByDateToken();
      
      if (dateTokenGroups.length === 0) {
        console.log('[PriceEnrichment] All events have prices!');
        break;
      }

      for (const group of dateTokenGroups) {
        if (enrichmentAbort) break;
        
        const { updated } = await enrichEventsForDateToken(
          group.event_date,
          group.token_symbol,
          verbose
        );
        totalUpdated += updated;

        await new Promise(r => setTimeout(r, DELAY_BETWEEN_BATCHES_MS));
      }

      batchCount++;
    }

    const remainingCount = await getUnpricedEventCount();
    console.log(`[PriceEnrichment] Complete. Updated ${totalUpdated} events. ${remainingCount} still need prices.`);

    return {
      status: enrichmentAbort ? 'aborted' : 'complete',
      totalUpdated,
      remainingCount,
    };

  } finally {
    enrichmentRunning = false;
  }
}

let enrichmentInterval = null;

export function startEnrichmentScheduler(intervalMs = 10 * 60 * 1000) {
  if (enrichmentInterval) {
    console.log('[EnrichmentScheduler] Already running');
    return;
  }

  console.log(`[EnrichmentScheduler] Starting (interval: ${intervalMs / 1000}s)`);

  runPriceEnrichment({ verbose: true, maxBatches: 10 }).catch(console.error);

  enrichmentInterval = setInterval(async () => {
    try {
      await runPriceEnrichment({ verbose: true, maxBatches: 10 });
    } catch (err) {
      console.error('[EnrichmentScheduler] Error:', err.message);
    }
  }, intervalMs);
}

export function stopEnrichmentScheduler() {
  if (enrichmentInterval) {
    clearInterval(enrichmentInterval);
    enrichmentInterval = null;
    console.log('[EnrichmentScheduler] Stopped');
  }
}

// Parallel price enrichment with multiple workers
let parallelEnrichmentState = {
  running: false,
  workersTotal: 0,
  startedAt: null,
  workers: new Map(),
};

export function isParallelEnrichmentRunning() {
  return parallelEnrichmentState.running;
}

export function getParallelEnrichmentStatus() {
  return {
    running: parallelEnrichmentState.running,
    workersTotal: parallelEnrichmentState.workersTotal,
    startedAt: parallelEnrichmentState.startedAt,
    workers: Array.from(parallelEnrichmentState.workers.entries()).map(([id, w]) => ({
      workerId: id,
      ...w,
    })),
  };
}

export async function runParallelPriceEnrichment(options = {}) {
  const { 
    workersTotal = 8, 
    verbose = true, 
    maxBatchesPerWorker = 50,
  } = options;

  if (parallelEnrichmentState.running) {
    console.log('[ParallelEnrichment] Already running, skipping...');
    return { status: 'already_running' };
  }

  const unpricedCount = await getUnpricedEventCount();
  if (unpricedCount === 0) {
    console.log('[ParallelEnrichment] No events need prices, skipping...');
    return { status: 'no_work', unpricedCount: 0 };
  }

  console.log(`[ParallelEnrichment] Starting ${workersTotal} workers. ${unpricedCount} events need prices.`);

  parallelEnrichmentState.running = true;
  parallelEnrichmentState.workersTotal = workersTotal;
  parallelEnrichmentState.startedAt = new Date();
  parallelEnrichmentState.workers.clear();

  // Get all date/token groups to distribute among workers
  const allGroups = await getAllUnpricedGroups();
  
  if (allGroups.length === 0) {
    console.log('[ParallelEnrichment] No date/token groups to process');
    parallelEnrichmentState.running = false;
    return { status: 'complete', totalUpdated: 0 };
  }

  console.log(`[ParallelEnrichment] Found ${allGroups.length} date/token groups to process`);

  // Distribute groups among workers (round-robin)
  const workerGroups = Array.from({ length: workersTotal }, () => []);
  allGroups.forEach((group, idx) => {
    workerGroups[idx % workersTotal].push(group);
  });

  const workerPromises = [];

  for (let workerId = 1; workerId <= workersTotal; workerId++) {
    const groups = workerGroups[workerId - 1];
    
    parallelEnrichmentState.workers.set(workerId, {
      running: true,
      groupsTotal: groups.length,
      groupsProcessed: 0,
      eventsUpdated: 0,
      lastUpdate: new Date(),
    });

    const workerLoop = async () => {
      let eventsUpdated = 0;
      let groupsProcessed = 0;

      for (const group of groups) {
        if (!parallelEnrichmentState.running) break;

        try {
          const { updated } = await enrichEventsForDateToken(
            group.event_date,
            group.token_symbol,
            verbose
          );
          eventsUpdated += updated;
          groupsProcessed++;

          parallelEnrichmentState.workers.set(workerId, {
            running: true,
            groupsTotal: groups.length,
            groupsProcessed,
            eventsUpdated,
            lastUpdate: new Date(),
          });

          // Small delay to avoid rate limiting
          await new Promise(r => setTimeout(r, 200));
        } catch (err) {
          console.error(`[ParallelEnrichment] Worker ${workerId} error:`, err.message);
        }
      }

      parallelEnrichmentState.workers.set(workerId, {
        running: false,
        groupsTotal: groups.length,
        groupsProcessed,
        eventsUpdated,
        lastUpdate: new Date(),
        complete: true,
      });

      if (verbose) {
        console.log(`[ParallelEnrichment] Worker ${workerId} complete: ${eventsUpdated} events updated`);
      }

      return eventsUpdated;
    };

    workerPromises.push(workerLoop());
  }

  // Wait for all workers in background
  Promise.all(workerPromises)
    .then((results) => {
      const totalUpdated = results.reduce((sum, n) => sum + n, 0);
      console.log(`[ParallelEnrichment] All workers complete. Total updated: ${totalUpdated}`);
      parallelEnrichmentState.running = false;
    })
    .catch((error) => {
      console.error('[ParallelEnrichment] Worker error:', error);
      parallelEnrichmentState.running = false;
    });

  return { 
    status: 'started', 
    workersTotal, 
    groupsTotal: allGroups.length,
    unpricedCount,
  };
}

export function stopParallelEnrichment() {
  if (parallelEnrichmentState.running) {
    console.log('[ParallelEnrichment] Stopping workers...');
    parallelEnrichmentState.running = false;
    return true;
  }
  return false;
}

async function getAllUnpricedGroups() {
  const result = await db.execute(sql`
    SELECT 
      date_trunc('day', block_timestamp) as event_date,
      token_symbol,
      count(*) as event_count
    FROM bridge_events
    WHERE usd_value IS NULL 
      AND token_symbol IS NOT NULL
      AND token_symbol NOT IN ('HERO', 'PET', 'EQUIPMENT')
    GROUP BY date_trunc('day', block_timestamp), token_symbol
    ORDER BY event_date ASC
  `);
  return result.rows || [];
}
