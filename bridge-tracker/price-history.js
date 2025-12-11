import { db } from '../server/db.js';
import { historicalPrices } from '../shared/schema.js';
import { eq, and, gte, lte, desc } from 'drizzle-orm';

const COINGECKO_IDS = {
  JEWEL: 'defi-kingdoms',
  XJEWEL: 'defi-kingdoms',  // xJEWEL tracks JEWEL price (staking wrapper)
  CRYSTAL: 'defi-kingdoms-crystal',
  USDC: 'usd-coin',
  ETH: 'ethereum',
  AVAX: 'avalanche-2',
  BTC: 'bitcoin',
  KAIA: 'kaia',  // Formerly KLAY/Klaytn, rebranded to KAIA
  KLAY: 'kaia',  // Legacy KLAY symbol also maps to KAIA
  FTM: 'fantom',
  MATIC: 'polygon-ecosystem-token',  // Rebranded to POL
  POL: 'polygon-ecosystem-token',    // New POL symbol
  WETH: 'ethereum',
  WBTC: 'bitcoin',
  'BTC.b': 'bitcoin',  // Avalanche bridged BTC
};

// Chain:address format for tokens - used for historical prices when coingecko IDs fail
// This format works better for DefiLlama historical API
const CHAIN_ADDRESS_IDS = {
  KAIA: 'klaytn:0x0000000000000000000000000000000000000000',  // Native KLAY/KAIA
  KLAY: 'klaytn:0x0000000000000000000000000000000000000000',
  MATIC: 'polygon:0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270', // WMATIC on Polygon
  POL: 'polygon:0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',   // Same as MATIC
  AVAX: 'avax:0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7',     // WAVAX on Avalanche
  FTM: 'fantom:0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83',    // WFTM on Fantom
  ETH: 'ethereum:0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',  // WETH on mainnet
  WETH: 'ethereum:0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH on mainnet
};

const COINGECKO_RATE_LIMIT_MS = 6500;
let lastCoinGeckoRequest = 0;

async function rateLimitedCoinGeckoFetch(url) {
  const now = Date.now();
  const timeSinceLastRequest = now - lastCoinGeckoRequest;
  
  if (timeSinceLastRequest < COINGECKO_RATE_LIMIT_MS) {
    await new Promise(r => setTimeout(r, COINGECKO_RATE_LIMIT_MS - timeSinceLastRequest));
  }
  
  lastCoinGeckoRequest = Date.now();
  
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json'
    }
  });
  
  if (!response.ok) {
    if (response.status === 429) {
      console.log('[PriceHistory] CoinGecko rate limited, waiting 60s...');
      await new Promise(r => setTimeout(r, 60000));
      return rateLimitedCoinGeckoFetch(url);
    }
    throw new Error(`CoinGecko API error: ${response.status}`);
  }
  
  return response.json();
}

async function fetchFromDefiLlama(tokenSymbol, timestamp) {
  const unixTs = Math.floor(new Date(timestamp).getTime() / 1000);
  
  // Try chain:address format first for tokens that have it (more reliable for historical)
  const chainAddressId = CHAIN_ADDRESS_IDS[tokenSymbol];
  if (chainAddressId) {
    try {
      const url = `https://coins.llama.fi/prices/historical/${unixTs}/${chainAddressId}`;
      const response = await fetch(url, {
        headers: { 'Accept': 'application/json' }
      });
      
      if (response.ok) {
        const data = await response.json();
        const price = data?.coins?.[chainAddressId]?.price;
        if (price && price > 0) {
          return price;
        }
      }
    } catch (err) {
      // Fall through to coingecko ID
    }
  }
  
  // Fall back to coingecko ID format
  const coingeckoId = COINGECKO_IDS[tokenSymbol];
  if (!coingeckoId) {
    console.log(`[PriceHistory] Unknown token: ${tokenSymbol}`);
    return null;
  }
  
  const url = `https://coins.llama.fi/prices/historical/${unixTs}/coingecko:${coingeckoId}`;
  
  try {
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' }
    });
    
    if (!response.ok) {
      console.log(`[PriceHistory] DefiLlama no price for ${tokenSymbol}, trying CoinGecko...`);
      return null;
    }
    
    const data = await response.json();
    const coinKey = `coingecko:${coingeckoId}`;
    const price = data?.coins?.[coinKey]?.price;
    
    if (price && price > 0) {
      return price;
    }
  } catch (err) {
    console.error(`[PriceHistory] DefiLlama fetch error:`, err.message);
  }
  
  return null;
}

async function fetchFromDefiLlamaBatch(tokens, timestamp) {
  const unixTs = Math.floor(new Date(timestamp).getTime() / 1000);
  
  // Build coin IDs: prefer chain:address format, fall back to coingecko:id
  const tokenKeyMap = {}; // Maps API key back to token symbol
  const coinIdList = [];
  
  for (const token of tokens) {
    // Prefer chain:address format (works better for historical prices)
    if (CHAIN_ADDRESS_IDS[token]) {
      const chainAddr = CHAIN_ADDRESS_IDS[token];
      coinIdList.push(chainAddr);
      tokenKeyMap[chainAddr] = token;
    } else if (COINGECKO_IDS[token]) {
      const cgKey = `coingecko:${COINGECKO_IDS[token]}`;
      coinIdList.push(cgKey);
      tokenKeyMap[cgKey] = token;
    }
  }
  
  if (coinIdList.length === 0) return {};
  
  const url = `https://coins.llama.fi/prices/historical/${unixTs}/${coinIdList.join(',')}`;
  
  try {
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' }
    });
    
    if (!response.ok) {
      console.log(`[PriceHistory] DefiLlama batch error: ${response.status}`);
      return {};
    }
    
    const data = await response.json();
    const prices = {};
    
    // Map responses back to token symbols
    for (const [apiKey, tokenSymbol] of Object.entries(tokenKeyMap)) {
      const price = data?.coins?.[apiKey]?.price;
      if (price && price > 0) {
        prices[tokenSymbol] = price;
      }
    }
    
    return prices;
  } catch (err) {
    console.error(`[PriceHistory] DefiLlama batch error:`, err.message);
    return {};
  }
}

async function fetchFromCoinGecko(tokenSymbol, timestamp) {
  const coingeckoId = COINGECKO_IDS[tokenSymbol];
  if (!coingeckoId) return null;
  
  const date = new Date(timestamp);
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  const dateStr = `${dd}-${mm}-${yyyy}`;
  
  const url = `https://api.coingecko.com/api/v3/coins/${coingeckoId}/history?date=${dateStr}`;
  
  try {
    const data = await rateLimitedCoinGeckoFetch(url);
    return data?.market_data?.current_price?.usd || null;
  } catch (err) {
    console.error(`[PriceHistory] CoinGecko error for ${tokenSymbol}:`, err.message);
    return null;
  }
}

export async function fetchCurrentPrices() {
  const tokens = Object.keys(COINGECKO_IDS);
  const coinIds = Object.values(COINGECKO_IDS).map(id => `coingecko:${id}`).join(',');
  const url = `https://coins.llama.fi/prices/current/${coinIds}`;
  
  try {
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json' }
    });
    
    if (response.ok) {
      const data = await response.json();
      const prices = {};
      
      for (const [symbol, coingeckoId] of Object.entries(COINGECKO_IDS)) {
        const coinKey = `coingecko:${coingeckoId}`;
        const price = data?.coins?.[coinKey]?.price;
        if (price && price > 0) {
          prices[symbol] = price;
        }
      }
      
      if (Object.keys(prices).length > 0) {
        return prices;
      }
    }
  } catch (err) {
    console.log('[PriceHistory] DefiLlama current prices failed, trying CoinGecko...');
  }
  
  const ids = Object.values(COINGECKO_IDS).join(',');
  const cgUrl = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`;
  
  const data = await rateLimitedCoinGeckoFetch(cgUrl);
  
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

  let price = await fetchFromDefiLlama(tokenSymbol, timestamp);
  let source = 'defillama';
  
  if (!price) {
    console.log(`[PriceHistory] DefiLlama no price for ${tokenSymbol}, trying CoinGecko...`);
    price = await fetchFromCoinGecko(tokenSymbol, timestamp);
    source = 'coingecko';
  }
  
  if (price) {
    await db.insert(historicalPrices).values({
      tokenSymbol,
      priceUsd: price.toString(),
      timestamp: hourStart,
      source
    }).onConflictDoNothing();
    
    return price;
  }
  
  return null;
}

export async function fetchHistoricalPricesBatch(tokenSymbols, timestamp) {
  const hourStart = new Date(timestamp);
  hourStart.setMinutes(0, 0, 0);
  
  const results = {};
  const needsFetch = [];
  
  for (const symbol of tokenSymbols) {
    const cached = await db.select()
      .from(historicalPrices)
      .where(
        and(
          eq(historicalPrices.tokenSymbol, symbol),
          eq(historicalPrices.timestamp, hourStart)
        )
      )
      .limit(1);
    
    if (cached.length > 0) {
      results[symbol] = parseFloat(cached[0].priceUsd);
    } else {
      needsFetch.push(symbol);
    }
  }
  
  if (needsFetch.length > 0) {
    const fetched = await fetchFromDefiLlamaBatch(needsFetch, timestamp);
    const stillMissing = [];
    
    for (const symbol of needsFetch) {
      const price = fetched[symbol];
      if (price) {
        results[symbol] = price;
        await db.insert(historicalPrices).values({
          tokenSymbol: symbol,
          priceUsd: price.toString(),
          timestamp: hourStart,
          source: 'defillama'
        }).onConflictDoNothing();
      } else {
        stillMissing.push(symbol);
      }
    }
    
    for (const symbol of stillMissing) {
      const price = await fetchFromCoinGecko(symbol, timestamp);
      if (price) {
        results[symbol] = price;
        await db.insert(historicalPrices).values({
          tokenSymbol: symbol,
          priceUsd: price.toString(),
          timestamp: hourStart,
          source: 'coingecko'
        }).onConflictDoNothing();
      }
    }
  }
  
  return results;
}

export async function fetchRangeHourly(tokenSymbol, fromTimestamp, toTimestamp) {
  const coingeckoId = COINGECKO_IDS[tokenSymbol];
  if (!coingeckoId) return [];

  const fromTs = Math.floor(new Date(fromTimestamp).getTime() / 1000);
  const toTs = Math.floor(new Date(toTimestamp).getTime() / 1000);

  const url = `https://api.coingecko.com/api/v3/coins/${coingeckoId}/market_chart/range?vs_currency=usd&from=${fromTs}&to=${toTs}`;

  try {
    const data = await rateLimitedCoinGeckoFetch(url);
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
