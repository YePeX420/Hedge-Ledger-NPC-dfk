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

export async function handleGardenOptimizationDM(message, playerData) {
  const username = message.author.username;

  const wallet = playerData?.primaryWallet;

  if (!wallet) {
    await message.reply(
      "I don't have a wallet linked for you yet. Send me your DFK wallet address and I'll scan your gardens."
    );
    return;
  }

  console.log(`[GardenOpt] Running optimization for ${username} / ${wallet}`);

  await message.reply(
    'Hold on a moment while I scan for your garden pools.\n\n[Scanning your wallet on DFK Chain...]'
  );

  let positions;
  try {
    positions = await detectWalletLPPositions(wallet);
  } catch (err) {
    console.error('[GardenOptimization] Failed to detect LP positions:', err);
    await message.reply('Something went wrong while scanning your wallet. Please try again.');
    return;
  }

  if (!positions || positions.length === 0) {
    await message.reply(
      "I couldn't find any LP tokens staked in the Crystalvale gardens for your linked wallet."
    );
    return;
  }

  const summary = formatLPPositionsSummary(positions);

  const bypass = isPaymentBypassEnabled?.() ?? false;

  if (!bypass) {
    await message.reply(
      `${summary}\n\n` +
        `Full optimization (hero & pet assignments + APR uplift) costs **25 JEWEL**. ` +
        `If you want to proceed, send 25 JEWEL to my wallet and paste the transaction hash here with \`tx:<hash>\`.`
    );
    return;
  }

  try {
    await message.reply(
      `🧪 Payment bypass is enabled for testing, so I'm skipping the 25 JEWEL step and running your optimization now.`
    );

    const heroesRaw = await getAllHeroesByOwner(wallet);
    const heroes = Array.isArray(heroesRaw) ? heroesRaw : [];

    const optimization = generatePoolOptimizations(positions, heroes, {
      hasLinkedWallet: true,
    });
    const report = formatOptimizationReport(optimization);

    // Split long reports into multiple messages to avoid Discord's 2000 char limit
    const chunks = splitMessage(report);
    for (const chunk of chunks) {
      await message.reply(chunk);
    }
  } catch (err) {
    console.error('[GardenOpt][bypass] ERROR:', err?.stack || err);
    await message.reply(
      'I hit a snag while running the optimization. Try again in a moment, or turn off payment bypass to use the standard flow.'
    );
  }
}
