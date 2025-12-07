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
