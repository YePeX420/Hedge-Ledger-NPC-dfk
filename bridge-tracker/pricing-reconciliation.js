import { db } from '../server/db.js';
import { bridgeEvents, unpricedTokens, historicalPrices } from '../shared/schema.ts';
import { eq, isNull, sql, and, inArray } from 'drizzle-orm';
import { ethers } from 'ethers';
import Decimal from 'decimal.js';

const RPC_URL = 'https://subnets.avax.network/defi-kingdoms/dfk-chain/rpc';

const PAIR_ABI = [
  'function token0() view returns (address)',
  'function token1() view returns (address)',
  'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
];

const ERC20_ABI = [
  'function decimals() view returns (uint8)',
];

const KNOWN_STABLES = [
  '0x3ad9dfe640e1a9cc1d9b0948620820d975c3803a', // USDC on DFK
];

const KNOWN_JEWEL = '0xccb93dabd71c8dad03fc4ce5559dc3d89f67a260';

export async function markDeprecatedTokens(verbose = true) {
  if (verbose) console.log('[PricingReconciliation] Marking deprecated tokens...');

  const deprecated = await db.select()
    .from(unpricedTokens)
    .where(eq(unpricedTokens.pricingStatus, 'deprecated'));

  if (deprecated.length === 0) {
    if (verbose) console.log('[PricingReconciliation] No deprecated tokens found');
    return { updated: 0 };
  }

  const deprecatedAddresses = deprecated.map(t => t.tokenAddress.toLowerCase());
  
  if (verbose) console.log(`[PricingReconciliation] Found ${deprecatedAddresses.length} deprecated tokens`);

  const result = await db.execute(sql`
    UPDATE bridge_events 
    SET 
      usd_value = '0.00',
      token_price_usd = '0.000000',
      pricing_source = 'DEPRECATED_TOKEN'
    WHERE 
      usd_value IS NULL 
      AND LOWER(token_address) IN (${sql.join(deprecatedAddresses.map(a => sql`${a}`), sql`, `)})
    RETURNING id
  `);

  const updatedCount = Array.isArray(result) ? result.length : (result.rowCount || 0);

  if (verbose) {
    console.log(`[PricingReconciliation] Marked ${updatedCount} events as DEPRECATED_TOKEN (usd_value=0)`);
  }

  return { updated: updatedCount, deprecatedTokens: deprecatedAddresses };
}

export async function deriveDexPrices(verbose = true) {
  if (verbose) console.log('[PricingReconciliation] Checking DEX-derivable tokens...');

  const dexDerivable = await db.select()
    .from(unpricedTokens)
    .where(eq(unpricedTokens.pricingStatus, 'dex_derivable'));

  if (dexDerivable.length === 0) {
    if (verbose) console.log('[PricingReconciliation] No DEX-derivable tokens found');
    return { updated: 0, skipped: [] };
  }

  const skipped = [];

  for (const token of dexDerivable) {
    if (verbose) {
      console.log(`[PricingReconciliation] Token ${token.tokenSymbol} (${token.tokenAddress}) has DEX liquidity but no external price feed.`);
      console.log(`[PricingReconciliation] Skipping DEX derivation - historical per-event pricing requires block-timestamp snapshots.`);
      console.log(`[PricingReconciliation] Token flagged for manual review or future historical price implementation.`);
    }
    
    skipped.push({
      tokenAddress: token.tokenAddress,
      tokenSymbol: token.tokenSymbol,
      lpPairAddress: token.lpPairAddress,
      totalEvents: token.totalEvents,
    });

    await db.update(unpricedTokens)
      .set({ 
        pricingStatus: 'needs_manual_review',
        updatedAt: new Date() 
      })
      .where(eq(unpricedTokens.tokenAddress, token.tokenAddress));
  }

  if (verbose) {
    console.log(`[PricingReconciliation] DEX derivation skipped ${skipped.length} tokens (require historical pricing implementation)`);
  }

  return { updated: 0, skipped };
}

async function getDexDerivedPrice(provider, tokenAddress, pairAddress) {
  try {
    const pair = new ethers.Contract(pairAddress, PAIR_ABI, provider);
    
    const [token0, token1, reserves] = await Promise.all([
      pair.token0(),
      pair.token1(),
      pair.getReserves(),
    ]);

    const token0Lower = token0.toLowerCase();
    const token1Lower = token1.toLowerCase();
    const targetLower = tokenAddress.toLowerCase();

    const isToken0 = token0Lower === targetLower;
    const pairedToken = isToken0 ? token1Lower : token0Lower;
    
    const targetReserve = isToken0 ? reserves.reserve0 : reserves.reserve1;
    const pairedReserve = isToken0 ? reserves.reserve1 : reserves.reserve0;

    const pairedDecimals = await getTokenDecimals(provider, isToken0 ? token1 : token0);
    const targetDecimals = await getTokenDecimals(provider, tokenAddress);

    const targetReserveDecimal = new Decimal(targetReserve.toString()).div(new Decimal(10).pow(targetDecimals));
    const pairedReserveDecimal = new Decimal(pairedReserve.toString()).div(new Decimal(10).pow(pairedDecimals));

    if (targetReserveDecimal.eq(0)) return null;

    const priceInPaired = pairedReserveDecimal.div(targetReserveDecimal);

    let pairedUsdPrice = 1.0;
    
    if (KNOWN_STABLES.includes(pairedToken)) {
      pairedUsdPrice = 1.0;
    } else if (pairedToken === KNOWN_JEWEL) {
      const jewelPrice = await getJewelCurrentPrice();
      pairedUsdPrice = jewelPrice || 0.15;
    } else {
      pairedUsdPrice = 0.15;
    }

    return priceInPaired.times(pairedUsdPrice).toNumber();
  } catch (err) {
    console.error('[PricingReconciliation] getDexDerivedPrice error:', err.message);
    return null;
  }
}

async function getTokenDecimals(provider, tokenAddress) {
  try {
    const token = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
    return Number(await token.decimals());
  } catch {
    return 18;
  }
}

async function getJewelCurrentPrice() {
  try {
    const response = await fetch('https://coins.llama.fi/prices/current/dfk:0xccb93dabd71c8dad03fc4ce5559dc3d89f67a260');
    const data = await response.json();
    return data.coins?.['dfk:0xccb93dabd71c8dad03fc4ce5559dc3d89f67a260']?.price || 0.15;
  } catch {
    return 0.15;
  }
}

async function updateEventsWithPrice(tokenAddress, price, source, verbose) {
  const result = await db.execute(sql`
    UPDATE bridge_events 
    SET 
      usd_value = ROUND(CAST(amount AS NUMERIC) * ${price}, 2),
      token_price_usd = ${price.toFixed(6)},
      pricing_source = ${source}
    WHERE 
      usd_value IS NULL 
      AND LOWER(token_address) = LOWER(${tokenAddress})
      AND amount IS NOT NULL
      AND amount != ''
    RETURNING id
  `);

  return Array.isArray(result) ? result.length : (result.rowCount || 0);
}

export async function verifyPricingComplete() {
  const unpricedCount = await db.select({ count: sql`count(*)::int` })
    .from(bridgeEvents)
    .where(
      and(
        isNull(bridgeEvents.usdValue),
        eq(bridgeEvents.bridgeType, 'token')
      )
    );

  const count = unpricedCount[0]?.count || 0;
  
  if (count > 0) {
    const breakdown = await db.execute(sql`
      SELECT 
        token_symbol,
        token_address,
        COUNT(*) as event_count
      FROM bridge_events
      WHERE usd_value IS NULL AND bridge_type = 'token'
      GROUP BY token_symbol, token_address
      ORDER BY event_count DESC
      LIMIT 10
    `);
    
    return {
      complete: false,
      unpricedCount: count,
      breakdown: Array.isArray(breakdown) ? breakdown : (breakdown.rows || []),
    };
  }

  return { complete: true, unpricedCount: 0 };
}

export async function getReconciliationSummary() {
  const netBridged = await db.execute(sql`
    SELECT 
      direction,
      SUM(COALESCE(CAST(usd_value AS NUMERIC), 0)) as total_usd,
      COUNT(*) as event_count,
      COUNT(*) FILTER (WHERE usd_value IS NOT NULL) as priced_count,
      COUNT(*) FILTER (WHERE usd_value IS NULL) as unpriced_count
    FROM bridge_events
    WHERE bridge_type = 'token'
    GROUP BY direction
  `);

  const bySource = await db.execute(sql`
    SELECT 
      pricing_source,
      COUNT(*) as event_count,
      SUM(COALESCE(CAST(usd_value AS NUMERIC), 0)) as total_usd
    FROM bridge_events
    WHERE bridge_type = 'token' AND pricing_source IS NOT NULL
    GROUP BY pricing_source
    ORDER BY event_count DESC
  `);

  const bridgedData = Array.isArray(netBridged) ? netBridged : (netBridged.rows || []);
  const sourceData = Array.isArray(bySource) ? bySource : (bySource.rows || []);

  const inRow = bridgedData.find(r => r.direction === 'in');
  const outRow = bridgedData.find(r => r.direction === 'out');

  const totalIn = parseFloat(inRow?.total_usd || 0);
  const totalOut = parseFloat(outRow?.total_usd || 0);
  const netFlow = totalIn - totalOut;

  return {
    bridgedIn: {
      totalUsd: totalIn,
      eventCount: parseInt(inRow?.event_count || 0),
      pricedCount: parseInt(inRow?.priced_count || 0),
      unpricedCount: parseInt(inRow?.unpriced_count || 0),
    },
    bridgedOut: {
      totalUsd: totalOut,
      eventCount: parseInt(outRow?.event_count || 0),
      pricedCount: parseInt(outRow?.priced_count || 0),
      unpricedCount: parseInt(outRow?.unpriced_count || 0),
    },
    netFlow,
    byPricingSource: sourceData.map(row => ({
      source: row.pricing_source,
      eventCount: parseInt(row.event_count || 0),
      totalUsd: parseFloat(row.total_usd || 0),
    })),
  };
}

export async function runFullReconciliation(verbose = true) {
  console.log('[PricingReconciliation] Starting full reconciliation pipeline...');
  console.log('='.repeat(60));

  console.log('\n[Step 1] Marking deprecated tokens...');
  const deprecatedResult = await markDeprecatedTokens(verbose);
  
  console.log('\n[Step 2] Deriving DEX prices...');
  const dexResult = await deriveDexPrices(verbose);
  
  console.log('\n[Step 3] Verifying pricing completeness...');
  const verification = await verifyPricingComplete();
  
  if (!verification.complete) {
    console.log(`[WARNING] ${verification.unpricedCount} events still unpriced:`);
    verification.breakdown.forEach(row => {
      console.log(`  - ${row.token_symbol || 'UNKNOWN'}: ${row.event_count} events`);
    });
  } else {
    console.log('[SUCCESS] All token bridge events are priced');
  }

  console.log('\n[Step 4] Generating reconciliation summary...');
  const summary = await getReconciliationSummary();
  
  console.log('\n' + '='.repeat(60));
  console.log('RECONCILIATION SUMMARY');
  console.log('='.repeat(60));
  console.log(`\nBridged IN:  $${summary.bridgedIn.totalUsd.toLocaleString()} (${summary.bridgedIn.eventCount} events)`);
  console.log(`Bridged OUT: $${summary.bridgedOut.totalUsd.toLocaleString()} (${summary.bridgedOut.eventCount} events)`);
  console.log(`Net Flow:    $${summary.netFlow.toLocaleString()}`);
  console.log('\nBy Pricing Source:');
  summary.byPricingSource.forEach(row => {
    console.log(`  - ${row.source}: ${row.eventCount} events, $${row.totalUsd.toLocaleString()}`);
  });
  console.log('='.repeat(60));

  return {
    deprecatedUpdated: deprecatedResult.updated,
    dexUpdated: dexResult.updated,
    pricingComplete: verification.complete,
    unpricedRemaining: verification.unpricedCount,
    summary,
  };
}
