/**
 * Pricing Engine
 * 
 * Calculates query costs with 3x profitability margin.
 * Supports dynamic pricing modifiers (new player discount, whale priority).
 * 
 * Base Rate Philosophy:
 * - Cover OpenAI API costs (GPT-4o-mini)
 * - 3x margin for sustainability
 * - Simple round numbers for user clarity
 * 
 * Query Types:
 * - hero: Basic hero lookup/analysis
 * - hero_advanced: Deep genetics + market analysis
 * - garden_basic: Pool APR overview (FREE TIER: 1/day)
 * - garden_premium: Full analytics with historical data
 * - fve: Fair value estimation with market comps
 * - summon: Breeding recommendation engine (FREE TIER: 1/day)
 * - nav: Navigation/walkthrough queries (FREE TIER: unlimited)
 */

import Decimal from 'decimal.js';
import { db } from './server/db.js';
import { pricingConfig } from './shared/schema.ts';
import { eq } from 'drizzle-orm';

// Base rates (JEWEL) with 3x profitability margin
// Estimated from OpenAI GPT-4o-mini costs at $500/JEWEL
const DEFAULT_BASE_RATES = {
  hero: new Decimal('0.01'),           // Basic hero data query
  hero_advanced: new Decimal('0.05'),  // Genetics + FVE integrated analysis
  garden_basic: new Decimal('0'),      // Free tier available
  garden_premium: new Decimal('0.05'), // Full analytics with charts
  fve: new Decimal('0.1'),             // Fair value estimation engine
  summon: new Decimal('0.05'),         // Breeding calculator (free tier available)
  nav: new Decimal('0'),               // Navigation always free
};

// Pricing modifiers (from pricingConfig DB table)
const DEFAULT_MODIFIERS = {
  new_player_threshold: new Decimal('100'),  // <100 JEWEL lifetime deposits
  new_player_discount: new Decimal('0.5'),   // 50% off for new players
  whale_threshold: new Decimal('10000'),     // ≥10k JEWEL lifetime = whale tier
  whale_priority_multiplier: new Decimal('5'), // 5x cost for instant processing
  peak_hours: [12, 13, 14, 18, 19, 20],     // UTC hours with higher demand
  peak_multiplier: new Decimal('1.2')        // 20% surge pricing
};

// Cache for pricing config (reload from DB periodically)
let cachedBaseRates = { ...DEFAULT_BASE_RATES };
let cachedModifiers = { ...DEFAULT_MODIFIERS };
let lastConfigLoad = null;
const CONFIG_CACHE_MS = 60000; // Reload config every 60 seconds

/**
 * Load pricing configuration from database
 * Falls back to defaults if DB is empty
 */
async function loadPricingConfig() {
  try {
    // Check cache
    const now = Date.now();
    if (lastConfigLoad && (now - lastConfigLoad) < CONFIG_CACHE_MS) {
      return; // Use cached config
    }
    
    // Load base rates from DB
    const baseRatesConfig = await db
      .select()
      .from(pricingConfig)
      .where(eq(pricingConfig.configKey, 'base_rates'))
      .limit(1);
    
    if (baseRatesConfig.length > 0) {
      const rates = baseRatesConfig[0].configValue;
      // Convert to Decimal objects
      Object.keys(rates).forEach(key => {
        cachedBaseRates[key] = new Decimal(rates[key]);
      });
    }
    
    // Load modifiers from DB
    const modifiersConfig = await db
      .select()
      .from(pricingConfig)
      .where(eq(pricingConfig.configKey, 'modifiers'))
      .limit(1);
    
    if (modifiersConfig.length > 0) {
      const mods = modifiersConfig[0].configValue;
      // Convert numeric values to Decimal
      Object.keys(mods).forEach(key => {
        if (typeof mods[key] === 'number' || typeof mods[key] === 'string') {
          cachedModifiers[key] = new Decimal(mods[key]);
        } else {
          cachedModifiers[key] = mods[key]; // Keep arrays as-is
        }
      });
    }
    
    lastConfigLoad = now;
    console.log('[Pricing] Loaded config from database');
  } catch (err) {
    console.error('[Pricing] Error loading config, using defaults:', err.message);
  }
}

/**
 * Get base cost for a query type
 * 
 * @param {string} queryType - Query type (hero, garden_premium, fve, etc.)
 * @returns {Decimal} - Base cost in JEWEL
 */
export async function getBaseCost(queryType) {
  await loadPricingConfig();
  
  const baseCost = cachedBaseRates[queryType];
  if (!baseCost) {
    throw new Error(`Unknown query type: ${queryType}`);
  }
  
  return baseCost;
}

/**
 * Calculate final cost with dynamic pricing modifiers
 * 
 * @param {string} queryType - Query type
 * @param {object} playerContext - Player context (tier, lifetimeDeposits, etc.)
 * @param {object} options - Pricing options (priority, timestamp)
 * @returns {object} - { baseCost, modifiers: [], finalCost, breakdown }
 */
export async function calculateCost(queryType, playerContext, options = {}) {
  await loadPricingConfig();
  
  const baseCost = await getBaseCost(queryType);
  let finalCost = baseCost;
  const modifiers = [];
  
  // Free queries (nav, free tier items)
  if (baseCost.isZero()) {
    return {
      baseCost: baseCost.toString(),
      modifiers: ['free_tier'],
      finalCost: '0',
      breakdown: 'Free query (navigation or free tier quota)'
    };
  }
  
  // New player discount (<100 JEWEL lifetime deposits = 50% off)
  const lifetime = new Decimal(playerContext.lifetimeDepositsJewel || '0');
  if (lifetime.lessThan(cachedModifiers.new_player_threshold)) {
    finalCost = finalCost.times(cachedModifiers.new_player_discount);
    modifiers.push(`new_player_discount:${cachedModifiers.new_player_discount.times(100)}%`);
  }
  
  // Whale priority (5x for instant processing)
  if (options.priority && lifetime.greaterThanOrEqualTo(cachedModifiers.whale_threshold)) {
    finalCost = finalCost.times(cachedModifiers.whale_priority_multiplier);
    modifiers.push(`whale_priority:${cachedModifiers.whale_priority_multiplier}x`);
  }
  
  // Peak hour surge pricing (20% increase)
  const timestamp = options.timestamp || Date.now();
  const hour = new Date(timestamp).getUTCHours();
  if (cachedModifiers.peak_hours.includes(hour)) {
    finalCost = finalCost.times(cachedModifiers.peak_multiplier);
    modifiers.push(`peak_hour:${cachedModifiers.peak_multiplier}x`);
  }
  
  // Build breakdown string
  let breakdown = `Base: ${baseCost.toString()} JEWEL`;
  if (modifiers.length > 0) {
    breakdown += ` | Modifiers: ${modifiers.join(', ')}`;
  }
  breakdown += ` → Final: ${finalCost.toString()} JEWEL`;
  
  return {
    baseCost: baseCost.toString(),
    modifiers,
    finalCost: finalCost.toFixed(18), // Full precision for balance deduction
    breakdown
  };
}

/**
 * Check if query type is free tier eligible
 * 
 * @param {string} queryType - Query type
 * @returns {boolean} - True if free tier eligible
 */
export function isFreeTierEligible(queryType) {
  const freeTierQueries = ['nav', 'garden_basic', 'summon'];
  return freeTierQueries.includes(queryType);
}

/**
 * Get pricing summary for all query types
 * 
 * @param {object} playerContext - Player context for discount calculation
 * @returns {Array} - Array of {queryType, baseCost, finalCost, discount}
 */
export async function getPricingSummary(playerContext) {
  await loadPricingConfig();
  
  const summary = [];
  
  for (const [queryType, baseCost] of Object.entries(cachedBaseRates)) {
    const { finalCost, modifiers } = await calculateCost(queryType, playerContext);
    
    summary.push({
      queryType,
      baseCost: baseCost.toString(),
      finalCost,
      modifiers,
      freeTier: isFreeTierEligible(queryType)
    });
  }
  
  return summary;
}

/**
 * Initialize default pricing config in database
 * Call this once on bot startup to ensure config exists
 */
export async function initializePricingConfig() {
  try {
    // Check if base_rates exists
    const existing = await db
      .select()
      .from(pricingConfig)
      .where(eq(pricingConfig.configKey, 'base_rates'))
      .limit(1);
    
    if (existing.length === 0) {
      // Insert default base rates
      const ratesObj = {};
      Object.entries(DEFAULT_BASE_RATES).forEach(([key, value]) => {
        ratesObj[key] = value.toString();
      });
      
      await db.insert(pricingConfig).values({
        configKey: 'base_rates',
        configValue: ratesObj,
        description: 'Base query costs in JEWEL (3x profitability margin)',
        updatedBy: 'system'
      });
      
      console.log('[Pricing] Initialized base_rates config');
    }
    
    // Check if modifiers exist
    const existingMods = await db
      .select()
      .from(pricingConfig)
      .where(eq(pricingConfig.configKey, 'modifiers'))
      .limit(1);
    
    if (existingMods.length === 0) {
      // Insert default modifiers
      const modsObj = {};
      Object.entries(DEFAULT_MODIFIERS).forEach(([key, value]) => {
        modsObj[key] = value instanceof Decimal ? value.toString() : value;
      });
      
      await db.insert(pricingConfig).values({
        configKey: 'modifiers',
        configValue: modsObj,
        description: 'Dynamic pricing modifiers (discounts, surge pricing)',
        updatedBy: 'system'
      });
      
      console.log('[Pricing] Initialized modifiers config');
    }
  } catch (err) {
    console.error('[Pricing] Error initializing config:', err.message);
  }
}
