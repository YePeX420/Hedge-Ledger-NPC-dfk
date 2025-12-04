// price-feed.js
// Token price feed integration for Fair Value Engine
// Uses garden analytics on-chain price graph (USDC-anchored BFS)

import { buildPriceGraph } from './garden-analytics.js';
import { ethers } from 'ethers';
import Decimal from 'decimal.js';

// Token addresses on DFK Chain (Crystalvale)
// Note: ETH address is from the LP pools (0xfbdf...58852), not the old WETH.e (0xfBDF...d3f8)
const TOKEN_ADDRESSES = {
  CRYSTAL: '0x04b9dA42306B023f3572e106B11D82aAd9D32EBb',
  JEWEL: '0xCCb93dABD71c8Dad03Fc4CE5559dC3D89F67a260',
  USDC: '0x3AD9DFE640E1A9Cc1D9B0948620820D975c3803a',
  WETH: '0xfbdf0e31808d0aa7b9509aa6abc9754e48c58852', // Correct ETH address from LP pools
  WAVAX: '0xB57B60DeBDB0b8172bb6316a9164bd3C695F133a',
};

// Cache price graph for a short time to avoid excessive RPC calls
let priceGraphCache = null;
let cacheTimestamp = 0;
const CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

// Track if a build is already in progress to avoid concurrent builds
let buildInProgress = null;

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
  
  // If a build is already in progress, wait for it
  if (buildInProgress) {
    return buildInProgress;
  }
  
  // Build fresh price graph (mark as in progress to avoid concurrent builds)
  console.log('🔄 Building fresh price graph from on-chain data...');
  buildInProgress = buildPriceGraph().finally(() => {
    buildInProgress = null;
  });
  const priceGraph = await buildInProgress;
  
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
 * Convert token amount to USD using true arbitrary precision math (supports 256-bit wei)
 * Uses decimal.js for full precision throughout - returns formatted string to avoid IEEE-754 limits
 * @param {string} tokenAddress - Token contract address
 * @param {string|number|bigint} amount - Token amount (in wei/smallest unit)
 * @param {number} decimals - Token decimals (default: 18)
 * @returns {Promise<string|null>} USD value as string with 2 decimal places (or null if conversion fails)
 */
export async function convertToUSD(tokenAddress, amount, decimals = 18) {
  try {
    const price = await getTokenPrice(tokenAddress);
    
    // Validate price exists and is positive
    if (!price || price <= 0 || !isFinite(price)) {
      console.warn(`⚠️ Invalid price for token ${tokenAddress}: ${price}`);
      return null;
    }
    
    // Use Decimal.js for arbitrary precision math (supports 256-bit values)
    let amountDecimal;
    let divisorDecimal;
    let tokenAmountDecimal;
    let priceDecimal;
    let usdValueDecimal;
    
    try {
      // Convert wei amount to Decimal (handles 256-bit strings safely)
      amountDecimal = new Decimal(amount.toString());
      
      // Validate amount is non-negative
      if (amountDecimal.isNegative()) {
        console.warn(`⚠️ Negative amount: ${amount}`);
        return null;
      }
      
      // Create divisor for decimal conversion (10^decimals)
      divisorDecimal = new Decimal(10).pow(decimals);
      
      // Divide to get token amount (stays in arbitrary precision)
      tokenAmountDecimal = amountDecimal.div(divisorDecimal);
      
      // Convert price to Decimal
      priceDecimal = new Decimal(price.toString());
      
      // Multiply to get USD value (stays in arbitrary precision)
      usdValueDecimal = tokenAmountDecimal.mul(priceDecimal);
      
      // Validate result is non-negative
      if (usdValueDecimal.isNegative()) {
        console.warn(`⚠️ Negative USD value`);
        return null;
      }
      
    } catch (err) {
      console.error(`Error in decimal arithmetic:`, err.message);
      return null;
    }
    
    // Return formatted string with 2 decimal places (cents precision)
    // Stays in arbitrary precision - never converts to IEEE-754 double
    return usdValueDecimal.toFixed(2);
    
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
