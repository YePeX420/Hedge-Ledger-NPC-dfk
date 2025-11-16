// price-feed.js
// Token price feed integration for Fair Value Engine
// Uses garden analytics on-chain price graph (USDC-anchored BFS)

import { buildPriceGraph } from './garden-analytics.js';
import { ethers } from 'ethers';

// Token addresses on DFK Chain (Crystalvale)
const TOKEN_ADDRESSES = {
  CRYSTAL: '0x04b9dA42306B023f3572e106B11D82aAd9D32EBb',
  JEWEL: '0xCCb93dABD71c8Dad03Fc4CE5559dC3D89F67a260',
  USDC: '0x3AD9DFE640E1A9Cc1D9B0948620820D975c3803a',
  WETH: '0xfBDF0E31808d0aa7b9509AA6aBC9F6985eABd3f8',
  WAVAX: '0xB57B60DeBDB0b8172bb6316a9164bd3C695F133a',
};

// Cache price graph for a short time to avoid excessive RPC calls
let priceGraphCache = null;
let cacheTimestamp = 0;
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Get current price graph (with caching and validation)
 * @returns {Promise<Map>} Price graph (token address -> USD price)
 */
async function getPriceGraph() {
  const now = Date.now();
  
  // Return cached price graph if still valid
  if (priceGraphCache && (now - cacheTimestamp < CACHE_DURATION_MS)) {
    return priceGraphCache;
  }
  
  // Build fresh price graph
  console.log('🔄 Building fresh price graph from on-chain data...');
  const priceGraph = await buildPriceGraph();
  
  // Validate that price graph has critical payment tokens
  const crystalPrice = priceGraph.get(TOKEN_ADDRESSES.CRYSTAL.toLowerCase());
  const jewelPrice = priceGraph.get(TOKEN_ADDRESSES.JEWEL.toLowerCase());
  const usdcPrice = priceGraph.get(TOKEN_ADDRESSES.USDC.toLowerCase());
  
  // Check USDC anchor (should be ~$1.00)
  if (!usdcPrice || Math.abs(usdcPrice - 1.0) > 0.1) {
    console.error('❌ USDC price anchor invalid:', usdcPrice);
    throw new Error('Price graph validation failed - USDC anchor missing or incorrect');
  }
  
  // Check CRYSTAL (primary payment token for Crystalvale)
  if (!crystalPrice || crystalPrice <= 0) {
    console.error('❌ CRYSTAL price missing or invalid:', crystalPrice);
    throw new Error('Price graph incomplete - CRYSTAL price not found');
  }
  
  // Check JEWEL (primary payment token for Serendale)
  if (!jewelPrice || jewelPrice <= 0) {
    console.warn('⚠️ JEWEL price missing or invalid:', jewelPrice);
    // Don't throw - JEWEL might not be available on all chains
  }
  
  console.log(`✅ Price graph validated: USDC=$${usdcPrice.toFixed(4)}, CRYSTAL=$${crystalPrice.toFixed(4)}, JEWEL=$${jewelPrice?.toFixed(4) || 'N/A'}`);
  
  priceGraphCache = priceGraph;
  cacheTimestamp = now;
  
  return priceGraphCache;
}

/**
 * Get USD price for a token
 * @param {string} tokenAddress - Token contract address
 * @returns {Promise<number>} USD price
 */
export async function getTokenPrice(tokenAddress) {
  const priceGraph = await getPriceGraph();
  const price = priceGraph.get(tokenAddress.toLowerCase()) || 0;
  
  if (price === 0) {
    console.warn(`⚠️ Price not found for token: ${tokenAddress}`);
  }
  
  return price;
}

/**
 * Get USD price for CRYSTAL token
 * @returns {Promise<number>} CRYSTAL price in USD
 */
export async function getCrystalPrice() {
  return getTokenPrice(TOKEN_ADDRESSES.CRYSTAL);
}

/**
 * Get USD price for JEWEL token
 * @returns {Promise<number>} JEWEL price in USD
 */
export async function getJewelPrice() {
  return getTokenPrice(TOKEN_ADDRESSES.JEWEL);
}

/**
 * Convert token amount to USD using arbitrary precision math
 * @param {string} tokenAddress - Token contract address
 * @param {string|number|bigint} amount - Token amount (in wei/smallest unit)
 * @param {number} decimals - Token decimals (default: 18)
 * @returns {Promise<number|null>} USD value (or null if conversion fails)
 */
export async function convertToUSD(tokenAddress, amount, decimals = 18) {
  try {
    const price = await getTokenPrice(tokenAddress);
    
    // Validate price exists and is positive
    if (!price || price <= 0 || !isFinite(price)) {
      console.warn(`⚠️ Invalid price for token ${tokenAddress}: ${price}`);
      return null;
    }
    
    // Convert wei to token amount as string (maintains full precision)
    let tokenAmountStr;
    try {
      tokenAmountStr = ethers.formatUnits(amount.toString(), decimals);
    } catch (err) {
      console.error(`Error formatting amount ${amount}:`, err.message);
      return null;
    }
    
    // Use FixedNumber for arbitrary precision multiplication
    // This avoids IEEE-754 precision loss for large values
    let tokenAmountFixed;
    let priceFixed;
    let usdValueFixed;
    
    try {
      tokenAmountFixed = ethers.FixedNumber.fromString(tokenAmountStr);
      priceFixed = ethers.FixedNumber.fromString(price.toString());
      usdValueFixed = tokenAmountFixed.mul(priceFixed);
    } catch (err) {
      console.error(`Error in fixed-point arithmetic:`, err.message);
      return null;
    }
    
    // Convert to regular number for storage (only at the final step)
    const usdValue = parseFloat(usdValueFixed.toString());
    
    // Final sanity checks
    if (!isFinite(usdValue) || usdValue < 0) {
      console.warn(`⚠️ Invalid USD value: ${usdValue}`);
      return null;
    }
    
    // Guard against overflow (larger than JS can safely represent)
    if (usdValue > Number.MAX_SAFE_INTEGER) {
      console.warn(`⚠️ USD value too large: $${usdValue} (exceeds MAX_SAFE_INTEGER)`);
      return null;
    }
    
    return usdValue;
  } catch (error) {
    console.error(`Error converting to USD:`, error.message);
    return null;
  }
}

/**
 * Infer token symbol from address
 * @param {string} tokenAddress - Token contract address
 * @returns {string} Token symbol
 */
export function inferTokenSymbol(tokenAddress) {
  const addr = tokenAddress.toLowerCase();
  
  if (addr === TOKEN_ADDRESSES.CRYSTAL.toLowerCase()) return 'CRYSTAL';
  if (addr === TOKEN_ADDRESSES.JEWEL.toLowerCase()) return 'JEWEL';
  if (addr === TOKEN_ADDRESSES.USDC.toLowerCase()) return 'USDC';
  if (addr === TOKEN_ADDRESSES.WETH.toLowerCase()) return 'WETH';
  if (addr === TOKEN_ADDRESSES.WAVAX.toLowerCase()) return 'WAVAX';
  
  return 'UNKNOWN';
}

/**
 * Get prices for multiple tokens at once (efficient batch operation)
 * @param {Array<string>} tokenAddresses - Array of token addresses
 * @returns {Promise<Map>} Map of token address -> USD price
 */
export async function getBatchPrices(tokenAddresses) {
  const priceGraph = await getPriceGraph();
  const prices = new Map();
  
  for (const address of tokenAddresses) {
    const price = priceGraph.get(address.toLowerCase()) || 0;
    prices.set(address.toLowerCase(), price);
  }
  
  return prices;
}

/**
 * Clear price cache (useful for forcing fresh data)
 */
export function clearPriceCache() {
  priceGraphCache = null;
  cacheTimestamp = 0;
  console.log('🗑️ Price cache cleared');
}

// Export token addresses for convenience
export { TOKEN_ADDRESSES };
