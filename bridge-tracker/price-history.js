import { db } from '../server/db.js';
import { historicalPrices } from '../shared/schema.js';
import { eq, and, gte, lte, desc } from 'drizzle-orm';

const COINGECKO_IDS = {
  JEWEL: 'defi-kingdoms',
  CRYSTAL: 'defi-kingdoms-crystal',
  USDC: 'usd-coin',
  ETH: 'ethereum',
  AVAX: 'avalanche-2',
  BTC: 'bitcoin',
  KAIA: 'klaytn',
  FTM: 'fantom',
  MATIC: 'matic-network'
};

const RATE_LIMIT_MS = 6500;
let lastRequestTime = 0;

async function rateLimitedFetch(url) {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  
  if (timeSinceLastRequest < RATE_LIMIT_MS) {
    await new Promise(r => setTimeout(r, RATE_LIMIT_MS - timeSinceLastRequest));
  }
  
  lastRequestTime = Date.now();
  
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json'
    }
  });
  
  if (!response.ok) {
    if (response.status === 429) {
      console.log('[PriceHistory] Rate limited, waiting 60s...');
      await new Promise(r => setTimeout(r, 60000));
      return rateLimitedFetch(url);
    }
    throw new Error(`CoinGecko API error: ${response.status}`);
  }
  
  return response.json();
}

export async function fetchCurrentPrices() {
  const ids = Object.values(COINGECKO_IDS).join(',');
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`;
  
  const data = await rateLimitedFetch(url);
  
  const prices = {};
  for (const [symbol, id] of Object.entries(COINGECKO_IDS)) {
    if (data[id]?.usd) {
      prices[symbol] = data[id].usd;
    }
  }
  
  return prices;
}

export async function fetchHistoricalPrice(tokenSymbol, timestamp) {
  const coingeckoId = COINGECKO_IDS[tokenSymbol];
  if (!coingeckoId) {
    console.log(`[PriceHistory] Unknown token: ${tokenSymbol}`);
    return null;
  }

  const hourStart = new Date(timestamp);
  hourStart.setMinutes(0, 0, 0);

  const cached = await db.select()
    .from(historicalPrices)
    .where(
      and(
        eq(historicalPrices.tokenSymbol, tokenSymbol),
        eq(historicalPrices.timestamp, hourStart)
      )
    )
    .limit(1);

  if (cached.length > 0) {
    return parseFloat(cached[0].priceUsd);
  }

  const date = new Date(timestamp);
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  const dateStr = `${dd}-${mm}-${yyyy}`;

  const url = `https://api.coingecko.com/api/v3/coins/${coingeckoId}/history?date=${dateStr}`;
  
  try {
    const data = await rateLimitedFetch(url);
    const price = data?.market_data?.current_price?.usd;
    
    if (price) {
      await db.insert(historicalPrices).values({
        tokenSymbol,
        priceUsd: price.toString(),
        timestamp: hourStart,
        source: 'coingecko'
      }).onConflictDoNothing();
      
      return price;
    }
  } catch (err) {
    console.error(`[PriceHistory] Error fetching ${tokenSymbol} price for ${dateStr}:`, err.message);
  }
  
  return null;
}

export async function fetchRangeHourly(tokenSymbol, fromTimestamp, toTimestamp) {
  const coingeckoId = COINGECKO_IDS[tokenSymbol];
  if (!coingeckoId) return [];

  const fromTs = Math.floor(new Date(fromTimestamp).getTime() / 1000);
  const toTs = Math.floor(new Date(toTimestamp).getTime() / 1000);

  const url = `https://api.coingecko.com/api/v3/coins/${coingeckoId}/market_chart/range?vs_currency=usd&from=${fromTs}&to=${toTs}`;

  try {
    const data = await rateLimitedFetch(url);
    const prices = data?.prices || [];

    const hourlyPrices = [];
    const seenHours = new Set();

    for (const [ts, price] of prices) {
      const hourStart = new Date(ts);
      hourStart.setMinutes(0, 0, 0);
      const hourKey = hourStart.toISOString();

      if (!seenHours.has(hourKey)) {
        seenHours.add(hourKey);
        hourlyPrices.push({
          tokenSymbol,
          priceUsd: price.toString(),
          timestamp: hourStart,
          source: 'coingecko'
        });
      }
    }

    if (hourlyPrices.length > 0) {
      for (const price of hourlyPrices) {
        await db.insert(historicalPrices).values(price).onConflictDoNothing();
      }
    }

    return hourlyPrices;
  } catch (err) {
    console.error(`[PriceHistory] Error fetching range for ${tokenSymbol}:`, err.message);
    return [];
  }
}

export async function getPriceAtTimestamp(tokenSymbol, timestamp) {
  const hourStart = new Date(timestamp);
  hourStart.setMinutes(0, 0, 0);

  const cached = await db.select()
    .from(historicalPrices)
    .where(
      and(
        eq(historicalPrices.tokenSymbol, tokenSymbol),
        eq(historicalPrices.timestamp, hourStart)
      )
    )
    .limit(1);

  if (cached.length > 0) {
    return parseFloat(cached[0].priceUsd);
  }

  const nearby = await db.select()
    .from(historicalPrices)
    .where(
      and(
        eq(historicalPrices.tokenSymbol, tokenSymbol),
        lte(historicalPrices.timestamp, hourStart)
      )
    )
    .orderBy(desc(historicalPrices.timestamp))
    .limit(1);

  if (nearby.length > 0) {
    return parseFloat(nearby[0].priceUsd);
  }

  return await fetchHistoricalPrice(tokenSymbol, timestamp);
}

export async function backfillPrices(tokenSymbol, days = 365) {
  const now = Date.now();
  const from = now - (days * 24 * 60 * 60 * 1000);
  
  console.log(`[PriceHistory] Backfilling ${tokenSymbol} prices for last ${days} days`);
  
  const prices = await fetchRangeHourly(tokenSymbol, from, now);
  console.log(`[PriceHistory] Cached ${prices.length} hourly prices for ${tokenSymbol}`);
  
  return prices.length;
}

export async function backfillAllTokens(days = 365) {
  const results = {};
  
  for (const symbol of Object.keys(COINGECKO_IDS)) {
    try {
      results[symbol] = await backfillPrices(symbol, days);
      await new Promise(r => setTimeout(r, 2000));
    } catch (err) {
      console.error(`[PriceHistory] Failed to backfill ${symbol}:`, err.message);
      results[symbol] = 0;
    }
  }
  
  return results;
}
