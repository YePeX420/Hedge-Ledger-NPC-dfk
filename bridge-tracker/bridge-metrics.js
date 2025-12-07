import { db } from '../server/db.js';
import { bridgeEvents, walletBridgeMetrics, players } from '../shared/schema.js';
import { eq, sql, and, desc } from 'drizzle-orm';
import { getPriceAtTimestamp, fetchCurrentPrices } from './price-history.js';
import { tokenAmountToUsd, addUsd, subtractUsd, parseUsdToNumber } from './bigint-utils.js';
import Decimal from 'decimal.js';

const TOKEN_DECIMALS = {
  CRYSTAL: 18,
  JEWEL: 18,
  USDC: 6,
  ETH: 18,
  AVAX: 18,
  BTC: 8,
  KAIA: 18,
  FTM: 18,
  MATIC: 18
};

export async function calculateEventUsdValue(event) {
  if (!event.amount || event.bridgeType !== 'token') {
    return null;
  }

  const tokenSymbol = event.tokenSymbol;
  if (!tokenSymbol || tokenSymbol === 'UNKNOWN') {
    return null;
  }

  const price = await getPriceAtTimestamp(tokenSymbol, event.blockTimestamp);
  if (!price) return null;

  const decimals = TOKEN_DECIMALS[tokenSymbol] || 18;
  const result = tokenAmountToUsd(event.amount, decimals, price);
  
  if (!result) return null;
  
  return {
    usdValue: result.usdValue,
    tokenPriceUsd: price.toFixed(6),
    humanAmount: result.tokenAmount
  };
}

export async function updateEventUsdValues(wallet) {
  const events = await db.select()
    .from(bridgeEvents)
    .where(
      and(
        eq(bridgeEvents.wallet, wallet.toLowerCase()),
        sql`${bridgeEvents.usdValue} IS NULL`,
        sql`${bridgeEvents.amount} IS NOT NULL`
      )
    );

  let updated = 0;
  
  for (const event of events) {
    const result = await calculateEventUsdValue(event);
    if (result) {
      await db.update(bridgeEvents)
        .set({
          usdValue: result.usdValue,
          tokenPriceUsd: result.tokenPriceUsd
        })
        .where(eq(bridgeEvents.id, event.id));
      updated++;
    }
  }

  return updated;
}

export async function computeWalletMetrics(wallet) {
  const normalizedWallet = wallet.toLowerCase();

  const events = await db.select()
    .from(bridgeEvents)
    .where(eq(bridgeEvents.wallet, normalizedWallet))
    .orderBy(bridgeEvents.blockTimestamp);

  if (events.length === 0) {
    return null;
  }

  let totalBridgedInUsd = new Decimal('0');
  let totalBridgedOutUsd = new Decimal('0');
  const bridgeInByToken = {};
  const bridgeOutByToken = {};
  let firstBridgeAt = null;
  let lastBridgeAt = null;
  let maxBlockNumber = 0;

  for (const event of events) {
    if (!firstBridgeAt || new Date(event.blockTimestamp) < new Date(firstBridgeAt)) {
      firstBridgeAt = event.blockTimestamp;
    }
    if (!lastBridgeAt || new Date(event.blockTimestamp) > new Date(lastBridgeAt)) {
      lastBridgeAt = event.blockTimestamp;
    }
    if (event.blockNumber > maxBlockNumber) {
      maxBlockNumber = event.blockNumber;
    }

    if (event.usdValue) {
      const usd = new Decimal(event.usdValue);
      const symbol = event.tokenSymbol || 'UNKNOWN';
      
      if (event.direction === 'in') {
        totalBridgedInUsd = totalBridgedInUsd.plus(usd);
        bridgeInByToken[symbol] = new Decimal(bridgeInByToken[symbol] || '0').plus(usd).toFixed(2);
      } else {
        totalBridgedOutUsd = totalBridgedOutUsd.plus(usd);
        bridgeOutByToken[symbol] = new Decimal(bridgeOutByToken[symbol] || '0').plus(usd).toFixed(2);
      }
    }
  }

  const netExtractedUsd = totalBridgedOutUsd.minus(totalBridgedInUsd);

  const extractorFlags = [];
  const netExtracted = netExtractedUsd.toNumber();
  if (netExtracted > 100) {
    extractorFlags.push('net_extractor');
  }
  if (netExtracted > 1000) {
    extractorFlags.push('significant_extractor');
  }
  if (netExtracted > 10000) {
    extractorFlags.push('major_extractor');
  }

  const totalIn = totalBridgedInUsd.toNumber();
  const totalOut = totalBridgedOutUsd.toNumber();
  const bridgeRatio = totalIn > 0 
    ? totalOut / totalIn 
    : (totalOut > 0 ? 10 : 0);
  
  let extractorScore = Math.min(10, bridgeRatio * 2);
  if (netExtracted < 0) extractorScore = 0;

  const player = await db.select()
    .from(players)
    .where(sql`LOWER(${players.wallet}) = ${normalizedWallet}`)
    .limit(1);

  return {
    wallet: normalizedWallet,
    playerId: player[0]?.id || null,
    totalBridgedInUsd: totalBridgedInUsd.toFixed(2),
    totalBridgedOutUsd: totalBridgedOutUsd.toFixed(2),
    netExtractedUsd: netExtractedUsd.toFixed(2),
    bridgeInByToken,
    bridgeOutByToken,
    heroesIn: 0,
    heroesOut: 0,
    petsIn: 0,
    petsOut: 0,
    equipmentIn: 0,
    equipmentOut: 0,
    firstBridgeAt,
    lastBridgeAt,
    lastProcessedBlock: maxBlockNumber,
    totalTransactions: events.length,
    extractorScore: extractorScore.toFixed(2),
    extractorFlags
  };
}

export async function saveWalletMetrics(metrics) {
  await db.insert(walletBridgeMetrics)
    .values(metrics)
    .onConflictDoUpdate({
      target: walletBridgeMetrics.wallet,
      set: {
        playerId: metrics.playerId,
        totalBridgedInUsd: metrics.totalBridgedInUsd,
        totalBridgedOutUsd: metrics.totalBridgedOutUsd,
        netExtractedUsd: metrics.netExtractedUsd,
        bridgeInByToken: metrics.bridgeInByToken,
        bridgeOutByToken: metrics.bridgeOutByToken,
        heroesIn: metrics.heroesIn,
        heroesOut: metrics.heroesOut,
        petsIn: metrics.petsIn,
        petsOut: metrics.petsOut,
        equipmentIn: metrics.equipmentIn,
        equipmentOut: metrics.equipmentOut,
        firstBridgeAt: metrics.firstBridgeAt,
        lastBridgeAt: metrics.lastBridgeAt,
        lastProcessedBlock: metrics.lastProcessedBlock,
        totalTransactions: metrics.totalTransactions,
        extractorScore: metrics.extractorScore,
        extractorFlags: metrics.extractorFlags,
        updatedAt: new Date()
      }
    });
}

export async function refreshWalletMetrics(wallet) {
  await updateEventUsdValues(wallet);
  const metrics = await computeWalletMetrics(wallet);
  
  if (metrics) {
    await saveWalletMetrics(metrics);
  }
  
  return metrics;
}

export async function getTopExtractors(limit = 50) {
  return db.select()
    .from(walletBridgeMetrics)
    .where(sql`${walletBridgeMetrics.netExtractedUsd}::numeric > 0`)
    .orderBy(desc(sql`${walletBridgeMetrics.netExtractedUsd}::numeric`))
    .limit(limit);
}

export async function getWalletSummary(wallet) {
  const metrics = await db.select()
    .from(walletBridgeMetrics)
    .where(eq(walletBridgeMetrics.wallet, wallet.toLowerCase()))
    .limit(1);

  if (metrics.length === 0) {
    return null;
  }

  return metrics[0];
}

export async function getAllTrackedWallets() {
  return db.selectDistinct({ wallet: bridgeEvents.wallet })
    .from(bridgeEvents);
}

export async function refreshAllMetrics() {
  const wallets = await getAllTrackedWallets();
  console.log(`[BridgeMetrics] Refreshing metrics for ${wallets.length} wallets`);
  
  let processed = 0;
  for (const { wallet } of wallets) {
    try {
      await refreshWalletMetrics(wallet);
      processed++;
    } catch (err) {
      console.error(`[BridgeMetrics] Error refreshing ${wallet}:`, err.message);
    }
  }
  
  console.log(`[BridgeMetrics] Refreshed ${processed}/${wallets.length} wallets`);
  return processed;
}

export async function backfillUsdValues() {
  console.log('[BridgeMetrics] Starting USD value backfill...');
  
  const events = await db.select()
    .from(bridgeEvents)
    .where(
      and(
        sql`${bridgeEvents.usdValue} IS NULL`,
        sql`${bridgeEvents.amount} IS NOT NULL`,
        eq(bridgeEvents.bridgeType, 'token')
      )
    )
    .limit(1000);
  
  console.log(`[BridgeMetrics] Found ${events.length} events needing USD values`);
  
  let updated = 0;
  let failed = 0;
  
  for (const event of events) {
    try {
      const result = await calculateEventUsdValue(event);
      if (result) {
        await db.update(bridgeEvents)
          .set({
            usdValue: result.usdValue,
            tokenPriceUsd: result.tokenPriceUsd
          })
          .where(eq(bridgeEvents.id, event.id));
        updated++;
      } else {
        failed++;
      }
    } catch (err) {
      console.error(`[BridgeMetrics] Error updating event ${event.id}:`, err.message);
      failed++;
    }
    
    await new Promise(r => setTimeout(r, 200));
  }
  
  console.log(`[BridgeMetrics] Backfill complete: ${updated} updated, ${failed} failed`);
  return { updated, failed };
}

export async function getOverviewStats() {
  const totalWallets = await db.select({ count: sql`COUNT(DISTINCT wallet)` })
    .from(bridgeEvents);
  
  const totalEvents = await db.select({ count: sql`COUNT(*)` })
    .from(bridgeEvents);
  
  const extractors = await db.select({ count: sql`COUNT(*)` })
    .from(walletBridgeMetrics)
    .where(sql`${walletBridgeMetrics.netExtractedUsd}::numeric > 0`);
  
  const totalExtracted = await db.select({ 
    sum: sql`COALESCE(SUM(${walletBridgeMetrics.netExtractedUsd}::numeric), 0)` 
  })
    .from(walletBridgeMetrics)
    .where(sql`${walletBridgeMetrics.netExtractedUsd}::numeric > 0`);
  
  return {
    totalWallets: totalWallets[0]?.count || 0,
    totalEvents: totalEvents[0]?.count || 0,
    extractorCount: extractors[0]?.count || 0,
    totalExtractedUsd: totalExtracted[0]?.sum?.toString() || '0'
  };
}
