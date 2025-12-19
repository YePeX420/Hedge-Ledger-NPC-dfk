import Decimal from 'decimal.js';

const CEX_ORDER_BOOK_APIS: Record<string, { url: string; parseResponse: (data: any) => OrderBook }> = {
  kucoin: {
    url: 'https://api.kucoin.com/api/v1/market/orderbook/level2_100?symbol=JEWEL-USDT',
    parseResponse: (data: any): OrderBook => ({
      exchange: 'KuCoin',
      pair: 'JEWEL-USDT',
      bids: (data.data?.bids || []).map((b: string[]) => [parseFloat(b[0]), parseFloat(b[1])]),
      asks: (data.data?.asks || []).map((a: string[]) => [parseFloat(a[0]), parseFloat(a[1])]),
      timestamp: Date.now(),
    }),
  },
  gate: {
    url: 'https://api.gateio.ws/api/v4/spot/order_book?currency_pair=JEWEL_USDT&limit=100',
    parseResponse: (data: any): OrderBook => ({
      exchange: 'Gate.io',
      pair: 'JEWEL-USDT',
      bids: (data.bids || []).map((b: string[]) => [parseFloat(b[0]), parseFloat(b[1])]),
      asks: (data.asks || []).map((a: string[]) => [parseFloat(a[0]), parseFloat(a[1])]),
      timestamp: Date.now(),
    }),
  },
  mexc: {
    url: 'https://api.mexc.com/api/v3/depth?symbol=JEWELUSDT&limit=100',
    parseResponse: (data: any): OrderBook => ({
      exchange: 'MEXC',
      pair: 'JEWEL-USDT',
      bids: (data.bids || []).map((b: string[]) => [parseFloat(b[0]), parseFloat(b[1])]),
      asks: (data.asks || []).map((a: string[]) => [parseFloat(a[0]), parseFloat(a[1])]),
      timestamp: Date.now(),
    }),
  },
};

interface OrderBook {
  exchange: string;
  pair: string;
  bids: [number, number][]; // [price, size]
  asks: [number, number][]; // [price, size]
  timestamp: number;
}

interface CexLiquidityResult {
  exchange: string;
  pair: string;
  midPrice: number;
  bidDepthUSD: number;
  askDepthUSD: number;
  totalDepthUSD: number;
  spread: number;
  spreadPercent: number;
  depthBand: string;
  timestamp: string;
  error?: string;
}

interface CexLiquiditySummary {
  exchanges: CexLiquidityResult[];
  totalLiquidityUSD: number;
  averageSpread: number;
  depthBand: string;
  updatedAt: string;
  failedCount: number;
  totalCount: number;
}

interface FetchResult {
  orderBook: OrderBook | null;
  httpSuccess: boolean;  // true if HTTP 2xx, even if data is empty
}

async function fetchOrderBook(exchangeId: string): Promise<FetchResult> {
  const config = CEX_ORDER_BOOK_APIS[exchangeId];
  if (!config) return { orderBook: null, httpSuccess: false };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    
    const response = await fetch(config.url, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'HedgeLedger/1.0',
      },
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      console.warn(`[CEX] ${exchangeId} API returned ${response.status}`);
      return { orderBook: null, httpSuccess: false };
    }
    
    const data = await response.json();
    const orderBook = config.parseResponse(data);
    
    // Even if order book is empty, this was a successful HTTP request
    return { orderBook, httpSuccess: true };
  } catch (error: any) {
    console.warn(`[CEX] Failed to fetch ${exchangeId} order book:`, error.message);
    return { orderBook: null, httpSuccess: false };
  }
}

function calculateDepthInBand(
  orderBook: OrderBook,
  bandPercent: number = 2
): { midPrice: number; bidDepthUSD: number; askDepthUSD: number; spread: number } {
  if (!orderBook.bids.length || !orderBook.asks.length) {
    return { midPrice: 0, bidDepthUSD: 0, askDepthUSD: 0, spread: 0 };
  }

  const bestBid = orderBook.bids[0][0];
  const bestAsk = orderBook.asks[0][0];
  const midPrice = (bestBid + bestAsk) / 2;
  const spread = bestAsk - bestBid;
  
  const bandMultiplier = bandPercent / 100;
  const minBidPrice = midPrice * (1 - bandMultiplier);
  const maxAskPrice = midPrice * (1 + bandMultiplier);
  
  // Bids are sorted high-to-low, stop when price falls below band
  let bidDepthUSD = new Decimal(0);
  for (const [price, size] of orderBook.bids) {
    if (price < minBidPrice) break; // Stop at band boundary
    bidDepthUSD = bidDepthUSD.plus(new Decimal(price).times(size));
  }
  
  // Asks are sorted low-to-high, stop when price exceeds band
  let askDepthUSD = new Decimal(0);
  for (const [price, size] of orderBook.asks) {
    if (price > maxAskPrice) break; // Stop at band boundary
    askDepthUSD = askDepthUSD.plus(new Decimal(price).times(size));
  }
  
  return {
    midPrice,
    bidDepthUSD: bidDepthUSD.toNumber(),
    askDepthUSD: askDepthUSD.toNumber(),
    spread,
  };
}

export async function getCexLiquidity(bandPercent: number = 2): Promise<CexLiquiditySummary> {
  const exchanges = Object.keys(CEX_ORDER_BOOK_APIS);
  const results: CexLiquidityResult[] = [];
  
  console.log(`[CEX] Fetching order books from ${exchanges.length} exchanges...`);
  
  const orderBookPromises = exchanges.map(async (exchangeId) => {
    const { orderBook, httpSuccess } = await fetchOrderBook(exchangeId);
    const exchangeName = CEX_ORDER_BOOK_APIS[exchangeId].url.includes('kucoin') ? 'KuCoin' :
                         CEX_ORDER_BOOK_APIS[exchangeId].url.includes('gate') ? 'Gate.io' : 'MEXC';
    
    // HTTP failure (non-2xx or network error)
    if (!httpSuccess) {
      return {
        exchange: exchangeName,
        pair: 'JEWEL-USDT',
        midPrice: 0,
        bidDepthUSD: 0,
        askDepthUSD: 0,
        totalDepthUSD: 0,
        spread: 0,
        spreadPercent: 0,
        depthBand: `±${bandPercent}%`,
        timestamp: new Date().toISOString(),
        error: 'Failed to fetch order book',
      };
    }
    
    // HTTP success but empty/null data - this is valid, just no liquidity
    if (!orderBook || !orderBook.bids.length || !orderBook.asks.length) {
      return {
        exchange: exchangeName,
        pair: 'JEWEL-USDT',
        midPrice: 0,
        bidDepthUSD: 0,
        askDepthUSD: 0,
        totalDepthUSD: 0,
        spread: 0,
        spreadPercent: 0,
        depthBand: `±${bandPercent}%`,
        timestamp: new Date().toISOString(),
        // No error - this is a successful fetch with zero liquidity
      };
    }
    
    const depth = calculateDepthInBand(orderBook, bandPercent);
    const spreadPercent = depth.midPrice > 0 ? (depth.spread / depth.midPrice) * 100 : 0;
    
    return {
      exchange: orderBook.exchange,
      pair: orderBook.pair,
      midPrice: depth.midPrice,
      bidDepthUSD: depth.bidDepthUSD,
      askDepthUSD: depth.askDepthUSD,
      totalDepthUSD: depth.bidDepthUSD + depth.askDepthUSD,
      spread: depth.spread,
      spreadPercent,
      depthBand: `±${bandPercent}%`,
      timestamp: new Date(orderBook.timestamp).toISOString(),
    };
  });
  
  const fetchedResults = await Promise.all(orderBookPromises);
  results.push(...fetchedResults);
  
  const failedResults = results.filter(r => r.error);
  const successfulResults = results.filter(r => !r.error);
  const totalLiquidityUSD = successfulResults.reduce((sum, r) => sum + r.totalDepthUSD, 0);
  const averageSpread = successfulResults.length > 0
    ? successfulResults.reduce((sum, r) => sum + r.spreadPercent, 0) / successfulResults.length
    : 0;
  
  console.log(`[CEX] Fetched ${successfulResults.length}/${exchanges.length} order books, total liquidity: $${totalLiquidityUSD.toFixed(2)}`);
  
  return {
    exchanges: results,
    totalLiquidityUSD,
    averageSpread,
    depthBand: `±${bandPercent}%`,
    updatedAt: new Date().toISOString(),
    failedCount: failedResults.length,
    totalCount: results.length,
  };
}

export async function getCoinGeckoJewelMarkets(): Promise<any> {
  try {
    const response = await fetch(
      'https://api.coingecko.com/api/v3/coins/defi-kingdoms?tickers=true&market_data=true',
      {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'HedgeLedger/1.0',
        },
      }
    );
    
    if (!response.ok) {
      console.warn(`[CEX] CoinGecko API returned ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    
    const cexTickers = (data.tickers || []).filter((t: any) => {
      const marketType = t.market?.identifier || '';
      return !['uniswap', 'sushiswap', 'pangolin', 'trader_joe', 'defi_kingdoms'].some(
        dex => marketType.toLowerCase().includes(dex)
      );
    });
    
    return {
      symbol: data.symbol,
      name: data.name,
      marketCap: data.market_data?.market_cap?.usd || 0,
      totalVolume24h: data.market_data?.total_volume?.usd || 0,
      price: data.market_data?.current_price?.usd || 0,
      cexMarkets: cexTickers.map((t: any) => ({
        exchange: t.market?.name || 'Unknown',
        pair: `${t.base}/${t.target}`,
        price: t.last,
        volume24h: t.converted_volume?.usd || 0,
        bidAskSpread: t.bid_ask_spread_percentage,
        trustScore: t.trust_score,
      })),
    };
  } catch (error: any) {
    console.error('[CEX] Failed to fetch CoinGecko markets:', error.message);
    return null;
  }
}
