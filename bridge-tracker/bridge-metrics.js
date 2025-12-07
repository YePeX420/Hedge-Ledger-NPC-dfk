import { db } from '../server/db.js';
import { bridgeEvents, walletBridgeMetrics, players } from '../shared/schema.js';
import { eq, sql, and, desc } from 'drizzle-orm';
import { getPriceAtTimestamp, fetchCurrentPrices } from './price-history.js';

const TOKEN_DECIMALS = {
  CRYSTAL: 18,
  JEWEL: 18,
  USDC: 6,
  ETH: 18,
  AVAX: 18,
  BTC: 8,
  KAIA: 18
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
  
  let rawAmount;
  try {
    if (event.amount.startsWith('0x')) {
      rawAmount = BigInt(event.amount);
    } else {
      rawAmount = BigInt(event.amount);
    }
  } catch {
    return null;
  }
  
  const amount = Number(rawAmount) / Math.pow(10, decimals);
  
  return {
    usdValue: amount * price,
    tokenPriceUsd: price,
    humanAmount: amount
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
          usdValue: result.usdValue.toFixed(2),
          tokenPriceUsd: result.tokenPriceUsd.toFixed(6)
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

  let totalBridgedInUsd = 0;
  let totalBridgedOutUsd = 0;
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
      const usd = parseFloat(event.usdValue);
      const symbol = event.tokenSymbol || 'UNKNOWN';
      
      if (event.direction === 'in') {
        totalBridgedInUsd += usd;
        bridgeInByToken[symbol] = (bridgeInByToken[symbol] || 0) + usd;
      } else {
        totalBridgedOutUsd += usd;
        bridgeOutByToken[symbol] = (bridgeOutByToken[symbol] || 0) + usd;
      }
    }
  }

  const netExtractedUsd = totalBridgedOutUsd - totalBridgedInUsd;

  const extractorFlags = [];
  if (netExtractedUsd > 100) {
    extractorFlags.push('net_extractor');
  }
  if (netExtractedUsd > 1000) {
    extractorFlags.push('significant_extractor');
  }
  if (netExtractedUsd > 10000) {
    extractorFlags.push('major_extractor');
  }

  const bridgeRatio = totalBridgedInUsd > 0 
    ? totalBridgedOutUsd / totalBridgedInUsd 
    : (totalBridgedOutUsd > 0 ? 10 : 0);
  
  let extractorScore = Math.min(10, bridgeRatio * 2);
  if (netExtractedUsd < 0) extractorScore = 0;

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
