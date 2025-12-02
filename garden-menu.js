/**
 * Garden Menu System
 * 
 * Handles the DM garden menu interface that routes users to:
 * - Free features (walkthrough, IL explanation, APR viewing)
 * - Tier 1 (2 JEWEL): Garden insights
 * - Tier 2 (25 JEWEL): Full optimization
 */

import { EmbedBuilder } from 'discord.js';
import { db } from './server/db.js';
import { players } from './shared/schema.ts';
import { eq } from 'drizzle-orm';

/**
 * Menu Context Tracking
 * Tracks users who recently saw the menu so we can detect numeric selections (1-5)
 * Map: discordId -> timestamp of when menu was shown
 */
const menuContext = new Map();
const MENU_CONTEXT_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Display the garden menu to a user
 * 
 * @param {object} interaction - Discord interaction or message
 * @param {string} discordId - User's Discord ID
 * @returns {Promise<void>}
 */
async function showGardenMenu(interaction, discordId) {
  const embed = new EmbedBuilder()
    .setColor(0x2ecc71) // Green color for gardens
    .setTitle('Garden Services')
    .setDescription(`I can help you with your Gardens! Choose an option:

**1** — Gardens Walkthrough (Free Unlimited)
Learn how liquidity pools, staking, and expeditions work in Crystalvale.

**2** — Understand Impermanent Loss (Free Unlimited)
Understand the risks of providing liquidity before you start.

**3** — View Crystalvale APRs (Free once per day, then 1 JEWEL)
See current fee APRs, distribution APRs, and total yields for all pools.

**4** — Show Your Pools & Current Yield (Premium Tier 1 — 2 JEWEL)
Analyze your LP positions, hero assignments, and inefficiencies.

**5** — Optimize Your Gardens (Premium Tier 2 — 25 JEWEL)
Get optimized expedition assignments and future yield projections.

**To select**: Reply with a number (1-5), keyword, or describe what you need.`)
    .setFooter({ text: 'Crystalvale Gardens • Powered by Hedge Ledger' })
    .setTimestamp();

  // Reply with embed (works for Discord Message objects in DM context)
  // Message objects have .reply() method by default
  if (typeof interaction.reply === 'function') {
    await interaction.reply({ embeds: [embed] });
    
    // Mark user as being in menu context (for next 5 minutes)
    menuContext.set(discordId, Date.now());
    console.log(`[Garden Menu] Set menu context for user ${discordId}`);
  } else {
    console.error('[Garden Menu] Invalid interaction object - missing reply method');
    throw new Error('Cannot display garden menu - invalid interaction object');
  }
}

/**
 * Parse user selection from menu
 * Returns the intent name based on user's input
 * 
 * @param {string} message - User's message
 * @returns {string|null} - Intent name or null if no match
 */
function parseMenuSelection(message) {
  const lowerMsg = message.toLowerCase().trim();

  // Numerical selection
  if (lowerMsg === '1') return 'garden_walkthrough';
  if (lowerMsg === '2') return 'garden_IL';
  if (lowerMsg === '3') return 'garden_aprs';
  if (lowerMsg === '4') return 'garden_insights_tier1';
  if (lowerMsg === '5') return 'garden_optimization_dm_redirect';

  // Keyword matching for Option 1 (Walkthrough)
  if (/\b(walkthrough|tutorial|guide|learn|explain.*garden|how.*gardens?.*work)\b/i.test(message)) {
    return 'garden_walkthrough';
  }

  // Keyword matching for Option 2 (IL)
  if (/\b(il|impermanent.*loss|loss|risk)\b/i.test(message)) {
    return 'garden_IL';
  }

  // Keyword matching for Option 3 (APRs)
  if (/\b(apr|aprs|rates?|view.*pool|pool.*rates?|show.*apr|current.*apr)\b/i.test(message)) {
    return 'garden_aprs';
  }

  // Keyword matching for Option 4 (Insights)
  if (/\b(my.*pool|show.*my|my.*yield|my.*garden|current.*yield|what.*earning|pools?.*current)\b/i.test(message)) {
    return 'garden_insights_tier1';
  }

  // Keyword matching for Option 5 (Optimization)
  if (/\b(optimize|optimise|best|maximize|maximise|improve|fix.*garden)\b/i.test(message)) {
    return 'garden_optimization_dm_redirect';
  }

  return null;
}

/**
 * Check if a message should trigger the garden menu
 * (general garden mentions without specific optimization/APR requests)
 * 
 * @param {string} message - User's message
 * @returns {boolean}
 */
function shouldShowGardenMenu(message) {
  const lowerMsg = message.toLowerCase();

  // Garden trigger keywords (specific to Crystalvale gardens - NOT generic "yield")
  const gardenTriggers = /\b(garden|gardens|expedition|lp\s+yield|garden\s+yield|gardening.*help|explain.*gardens?|show.*my.*gardens?|farming.*jewel|farming.*crystal)\b/i;

  if (!gardenTriggers.test(message)) {
    return false;
  }

  // Direct routing exceptions - these should NOT show menu
  
  // Exception 1: Optimization keywords → direct to Tier 2
  if (/\b(optimize|optimise|best.*setup|maximize|maximise|fix.*my.*gardeners?)\b/i.test(message)) {
    return false;
  }

  // Exception 2: APR keywords → direct to Option 3
  if (/\b(aprs?|rates?.*today|garden.*aprs?|apr.*now)\b/i.test(message)) {
    return false;
  }

  // If garden keywords present and no direct routing exceptions, show menu
  return true;
}

/**
 * Get today's date in YYYY-MM-DD format (UTC)
 */
function getTodayUTC() {
  return new Date().toISOString().split('T')[0];
}

/**
 * Check if user has used their free APR lookup today
 * 
 * @param {string} discordId - User's Discord ID
 * @returns {Promise<boolean>} - true if already used today, false if still free
 */
async function hasUsedFreeAPRToday(discordId) {
  const player = await db.select()
    .from(players)
    .where(eq(players.discordId, discordId))
    .limit(1);

  if (!player || player.length === 0) {
    return false; // New user, hasn't used free lookup
  }

  const lastCheckDate = player[0].lastGardenAPRCheckDate;
  const today = getTodayUTC();

  return lastCheckDate === today;
}

/**
 * Mark that user has used their free APR lookup today
 * Ensures player record exists (upsert pattern for DM users)
 * 
 * @param {string} discordId - User's Discord ID
 * @param {string} discordUsername - User's Discord username (required for new player records)
 */
async function markAPRCheckUsed(discordId, discordUsername) {
  const today = getTodayUTC();

  // Upsert: insert if doesn't exist (with all required fields), update if it does
  // This handles DM users who haven't been registered yet
  await db.insert(players)
    .values({
      discordId,
      discordUsername,
      lastGardenAPRCheckDate: today,
      wallets: []
    })
    .onConflictDoUpdate({
      target: players.discordId,
      set: { lastGardenAPRCheckDate: today }
    });
}

/**
 * Route menu selection to appropriate handler
 * 
 * @param {string} intent - The selected intent
 * @param {object} interaction - Discord interaction/message
 * @param {string} discordId - User's Discord ID
 * @returns {Promise<string>} - Handler result or instruction for next step
 */
async function routeMenuSelection(intent, interaction, discordId) {
  switch (intent) {
    case 'garden_walkthrough':
      return {
        type: 'knowledge',
        topic: 'gardens',
        message: 'Opening gardens walkthrough...'
      };

    case 'garden_IL':
      return {
        type: 'knowledge',
        topic: 'impermanent_loss',
        message: 'Opening impermanent loss explanation...'
      };

    case 'garden_aprs':
      // Check if user has already used free lookup today
      const alreadyUsed = await hasUsedFreeAPRToday(discordId);
      if (alreadyUsed) {
        return {
          type: 'payment_required',
          service: 'garden_aprs',
          amount: 1,
          message: 'You\'ve already used your free APR lookup today. This lookup costs 1 JEWEL.'
        };
      } else {
        return {
          type: 'pool_aprs',
          free: true,
          message: 'Fetching current Crystalvale APRs (free)...'
        };
      }

    case 'garden_insights_tier1':
      return {
        type: 'payment_required',
        service: 'garden_insights_tier1',
        amount: 2,
        message: 'Garden Insights costs 2 JEWEL. I\'ll analyze your LP positions and hero assignments.'
      };

    case 'garden_optimization_dm_redirect':
      return {
        type: 'info',
        message:
          'Garden optimization now runs directly in DMs. Send "Optimize gardens" to start a scan and deterministic optimization.'
      };

    default:
      return {
        type: 'error',
        message: 'Invalid selection. Please choose an option 1-5.'
      };
  }
}

/**
 * Check if user is currently in menu context (recently saw the menu)
 * 
 * @param {string} discordId - User's Discord ID
 * @returns {boolean} - true if user recently saw the menu
 */
function isInMenuContext(discordId) {
  const menuShownAt = menuContext.get(discordId);
  if (!menuShownAt) {
    return false;
  }

  const elapsed = Date.now() - menuShownAt;
  if (elapsed > MENU_CONTEXT_EXPIRY_MS) {
    // Context expired, clean it up
    menuContext.delete(discordId);
    return false;
  }

  return true;
}

/**
 * Clear menu context for a user (called after they make a selection)
 * 
 * @param {string} discordId - User's Discord ID
 */
function clearMenuContext(discordId) {
  menuContext.delete(discordId);
}

export {
  showGardenMenu,
  parseMenuSelection,
  shouldShowGardenMenu,
  hasUsedFreeAPRToday,
  markAPRCheckUsed,
  routeMenuSelection,
  getTodayUTC,
  isInMenuContext,
  clearMenuContext
};
