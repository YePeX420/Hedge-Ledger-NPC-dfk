// garden-optimization-handler.js

import {
  detectWalletLPPositions,
  formatLPPositionsSummary,
  generatePoolOptimizations,
  formatOptimizationReport,
} from './wallet-lp-detector.js';
import { getAllHeroesByOwner } from './onchain-data.js';
import { isPaymentBypassEnabled } from './debug-settings.js';

/**
 * Split a long message into chunks that fit within Discord's 2000 char limit
 */
function splitMessage(text, maxLength = 1900) {
  if (text.length <= maxLength) return [text];
  
  const chunks = [];
  const lines = text.split('\n');
  let currentChunk = '';
  
  for (const line of lines) {
    if ((currentChunk + '\n' + line).length > maxLength && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      currentChunk = line;
    } else {
      currentChunk += (currentChunk ? '\n' : '') + line;
    }
  }
  
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks;
}

/**
 * Handle garden optimization DM flow
 * 
 * @param {Object} message - Discord message object
 * @param {Object} playerData - Player data from database
 * @param {Object} options - Options
 * @param {boolean} options.runOptimization - If true, run full optimization. If false, just show teaser.
 */
export async function handleGardenOptimizationDM(message, playerData, options = {}) {
  const { runOptimization = false } = options;
  const username = message.author.username;
  const wallet = playerData?.primaryWallet;

  if (!wallet) {
    await message.reply(
      "I don't have a wallet linked for you yet. Send me your DFK wallet address and I'll scan your gardens."
    );
    return { success: false, reason: 'no_wallet' };
  }

  console.log(`[GardenOpt] ${runOptimization ? 'Running' : 'Scanning'} for ${username} / ${wallet}`);

  // --- TEASER MODE (runOptimization: false) ---
  // Just scan wallet and show pool summary + payment instructions
  if (!runOptimization) {
    await message.reply(
      'Hold on a moment while I scan for your garden pools.\n\n[Scanning your wallet on DFK Chain...]'
    );

    let positions;
    try {
      positions = await detectWalletLPPositions(wallet);
    } catch (err) {
      console.error('[GardenOpt] Failed to detect LP positions:', err);
      await message.reply('Something went wrong while scanning your wallet. Please try again.');
      return { success: false, reason: 'scan_error' };
    }

    if (!positions || positions.length === 0) {
      await message.reply(
        "I couldn't find any LP tokens staked in the Crystalvale gardens for your linked wallet."
      );
      return { success: false, reason: 'no_positions' };
    }

    const summary = formatLPPositionsSummary(positions);
    const bypass = isPaymentBypassEnabled?.() ?? false;

    if (bypass) {
      await message.reply(
        `${summary}\n\n` +
        `🧪 Payment bypass is enabled. Say **proceed** to run your optimization now!`
      );
    } else {
      await message.reply(
        `${summary}\n\n` +
        `Full optimization (hero & pet assignments + APR uplift) costs **25 JEWEL**.\n\n` +
        `Say **proceed** to confirm, then send 25 JEWEL to my wallet and paste the transaction hash with \`tx:<hash>\`.`
      );
    }
    
    return { success: true, positions };
  }

  // --- OPTIMIZATION MODE (runOptimization: true) ---
  // Run full hero/pet optimization and generate report
  try {
    await message.reply('⏳ Running garden optimization... analyzing your heroes and pools...');

    // Re-scan positions to ensure we have fresh data
    let positions;
    try {
      positions = await detectWalletLPPositions(wallet);
    } catch (err) {
      console.error('[GardenOpt] Failed to detect LP positions:', err);
      await message.reply('Something went wrong while scanning your wallet. Please try again.');
      return { success: false, reason: 'scan_error' };
    }

    if (!positions || positions.length === 0) {
      await message.reply(
        "I couldn't find any LP tokens staked in the Crystalvale gardens for your linked wallet."
      );
      return { success: false, reason: 'no_positions' };
    }

    const heroesRaw = await getAllHeroesByOwner(wallet);
    const heroes = Array.isArray(heroesRaw) ? heroesRaw : [];

    console.log(`[GardenOpt] Found ${positions.length} pools, ${heroes.length} heroes`);

    const optimization = await generatePoolOptimizations(positions, heroes, {
      hasLinkedWallet: true,
    });
    
    // Log what the optimizer returns so we can debug
    console.log(`[GardenOpt] Optimizer returned: ${optimization?.recommendations?.length || 0} recommendations for ${optimization?.positions || 0} positions, TVL=$${optimization?.totalValueUSD || 0}`);
    
    const report = formatOptimizationReport(optimization);

    // Split long reports into multiple messages to avoid Discord's 2000 char limit
    const chunks = splitMessage(report);
    for (const chunk of chunks) {
      await message.reply(chunk);
    }

    await message.reply('✅ Optimization complete! Let me know if you have any questions.');
    return { success: true, optimization };
  } catch (err) {
    console.error('[GardenOpt] ERROR:', err?.stack || err);
    await message.reply(
      'I hit a snag while running the optimization. Try again in a moment.'
    );
    return { success: false, reason: 'optimization_error' };
  }
}
