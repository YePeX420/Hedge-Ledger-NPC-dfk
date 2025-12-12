import { db } from '../server/db.js';
import { bridgeEvents, unpricedTokens } from '../shared/schema.ts';
import { eq, isNull, sql, and, desc } from 'drizzle-orm';
import { getPriceAtTimestamp } from './price-history.js';
import { ethers } from 'ethers';

const RPC_URL = 'https://subnets.avax.network/defi-kingdoms/dfk-chain/rpc';
const UNISWAP_FACTORY = '0x794C07912474351b3134E6D6B3B7b3b4A07cbAAa';

const FACTORY_ABI = [
  'function allPairsLength() view returns (uint256)',
  'function allPairs(uint256) view returns (address)',
];

const PAIR_ABI = [
  'function token0() view returns (address)',
  'function token1() view returns (address)',
  'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
  'function totalSupply() view returns (uint256)',
];

const ERC20_ABI = [
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
];

async function getProvider() {
  return new ethers.JsonRpcProvider(RPC_URL);
}

export async function analyzeUnpricedTokens(verbose = true) {
  if (verbose) console.log('[UnpricedAnalyzer] Starting analysis of unpriced tokens...');

  const unpricedByToken = await db.execute(sql`
    SELECT 
      token_address,
      token_symbol,
      MIN(block_timestamp) as first_seen,
      MAX(block_timestamp) as last_seen,
      COUNT(*) as event_count
    FROM bridge_events
    WHERE usd_value IS NULL 
      AND token_address IS NOT NULL
      AND bridge_type = 'token'
    GROUP BY token_address, token_symbol
    ORDER BY event_count DESC
  `);

  const tokens = Array.isArray(unpricedByToken) ? unpricedByToken : (unpricedByToken.rows || []);
  
  if (verbose) console.log(`[UnpricedAnalyzer] Found ${tokens.length} tokens with unpriced events`);

  const provider = await getProvider();
  const lpPairs = await discoverLpPairs(provider);
  
  const results = [];
  
  for (const token of tokens) {
    const tokenAddr = token.token_address?.toLowerCase();
    if (!tokenAddr) continue;

    const hasDexLiquidity = lpPairs.has(tokenAddr);
    const lpPairAddress = lpPairs.get(tokenAddr)?.pairAddress || null;
    
    const hasExternalPrice = await checkExternalPrice(token.token_symbol, token.first_seen);
    
    let pricingStatus = 'unknown';
    if (hasExternalPrice) {
      pricingStatus = 'priced';
    } else if (hasDexLiquidity) {
      pricingStatus = 'dex_derivable';
    } else {
      pricingStatus = 'deprecated';
    }

    const firstSeen = token.first_seen ? new Date(token.first_seen) : null;
    const lastSeen = token.last_seen ? new Date(token.last_seen) : null;

    await db.insert(unpricedTokens)
      .values({
        tokenAddress: tokenAddr,
        tokenSymbol: token.token_symbol || null,
        firstSeenTimestamp: firstSeen,
        lastSeenTimestamp: lastSeen,
        totalEvents: parseInt(token.event_count) || 0,
        hasDexLiquidity,
        hasExternalPrice,
        pricingStatus,
        lpPairAddress,
        lastCheckedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: unpricedTokens.tokenAddress,
        set: {
          tokenSymbol: token.token_symbol || null,
          lastSeenTimestamp: lastSeen,
          totalEvents: parseInt(token.event_count) || 0,
          hasDexLiquidity,
          hasExternalPrice,
          pricingStatus,
          lpPairAddress,
          lastCheckedAt: new Date(),
          updatedAt: new Date(),
        },
      });

    results.push({
      tokenAddress: tokenAddr,
      symbol: token.token_symbol,
      eventCount: parseInt(token.event_count) || 0,
      pricingStatus,
      hasDexLiquidity,
      hasExternalPrice,
    });

    if (verbose) {
      console.log(`[UnpricedAnalyzer] ${token.token_symbol || 'UNKNOWN'} (${tokenAddr.slice(0,10)}...): ${pricingStatus} - ${token.event_count} events`);
    }
  }

  const summary = {
    total: results.length,
    deprecated: results.filter(r => r.pricingStatus === 'deprecated').length,
    dexDerivable: results.filter(r => r.pricingStatus === 'dex_derivable').length,
    priced: results.filter(r => r.pricingStatus === 'priced').length,
    totalEvents: results.reduce((sum, r) => sum + r.eventCount, 0),
  };

  if (verbose) {
    console.log(`[UnpricedAnalyzer] Summary:`);
    console.log(`  - Deprecated (no price possible): ${summary.deprecated} tokens`);
    console.log(`  - DEX Derivable: ${summary.dexDerivable} tokens`);
    console.log(`  - Has External Price: ${summary.priced} tokens`);
    console.log(`  - Total unpriced events: ${summary.totalEvents}`);
  }

  return { tokens: results, summary };
}

async function discoverLpPairs(provider) {
  const lpMap = new Map();
  
  try {
    const factory = new ethers.Contract(UNISWAP_FACTORY, FACTORY_ABI, provider);
    const pairCount = await factory.allPairsLength();
    
    for (let i = 0; i < Number(pairCount); i++) {
      try {
        const pairAddress = await factory.allPairs(i);
        const pair = new ethers.Contract(pairAddress, PAIR_ABI, provider);
        
        const [token0, token1, reserves] = await Promise.all([
          pair.token0(),
          pair.token1(),
          pair.getReserves(),
        ]);

        const reserve0 = Number(reserves.reserve0);
        const reserve1 = Number(reserves.reserve1);
        
        const token0Lower = token0.toLowerCase();
        const token1Lower = token1.toLowerCase();
        
        if (!lpMap.has(token0Lower) || lpMap.get(token0Lower).reserves < reserve0) {
          lpMap.set(token0Lower, { pairAddress, reserves: reserve0, pairedWith: token1Lower });
        }
        if (!lpMap.has(token1Lower) || lpMap.get(token1Lower).reserves < reserve1) {
          lpMap.set(token1Lower, { pairAddress, reserves: reserve1, pairedWith: token0Lower });
        }

        await new Promise(r => setTimeout(r, 50));
      } catch (err) {
        continue;
      }
    }
  } catch (err) {
    console.error('[UnpricedAnalyzer] Error discovering LP pairs:', err.message);
  }

  return lpMap;
}

async function checkExternalPrice(tokenSymbol, timestamp) {
  if (!tokenSymbol || tokenSymbol === 'UNKNOWN') return false;
  
  try {
    const price = await getPriceAtTimestamp(tokenSymbol, timestamp);
    return price !== null && !isNaN(price) && price > 0;
  } catch (err) {
    return false;
  }
}

export async function getUnpricedTokenSummary() {
  const result = await db.select({
    pricingStatus: unpricedTokens.pricingStatus,
    count: sql`count(*)::int`,
    totalEvents: sql`sum(total_events)::int`,
  })
    .from(unpricedTokens)
    .groupBy(unpricedTokens.pricingStatus);
  
  return result;
}

export async function getDeprecatedTokens() {
  return db.select()
    .from(unpricedTokens)
    .where(eq(unpricedTokens.pricingStatus, 'deprecated'));
}

export async function getDexDerivableTokens() {
  return db.select()
    .from(unpricedTokens)
    .where(eq(unpricedTokens.pricingStatus, 'dex_derivable'));
}
