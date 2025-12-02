// garden-optimization-handler.js

import {
  detectWalletLPPositions,
  generatePoolOptimizations,
  formatOptimizationReport,
} from './wallet-lp-detector.js';
import { getAllHeroesByOwner } from './onchain-data.js';
import { isPaymentBypassEnabled } from './debug-settings.js';

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

  const poolNames = positions.map((p) => p.pairName).join(', ');
  const totalValueNum = positions.reduce((sum, p) => sum + parseFloat(p.userTVL || 0), 0);
  const totalValueStr = isNaN(totalValueNum) ? 'N/A' : `$${totalValueNum.toFixed(0)}`;

  const bypass = isPaymentBypassEnabled?.() ?? false;

  if (!bypass) {
    await message.reply(
      `I found you're staking in ${positions.length} pool${
        positions.length > 1 ? 's' : ''
      }: ${poolNames} (Total value: ${totalValueStr}).\n\n` +
        `Full optimization (hero & pet assignments + APR uplift) costs **25 JEWEL**. ` +
        `If you want to proceed, send 25 JEWEL to my wallet and paste the transaction hash here.`
    );
    return;
  }

  await message.reply(
    `🧪 Payment bypass is enabled for testing, so I'll skip the 25 JEWEL step and run your optimization now.`
  );

  try {
    const heroesData = await getAllHeroesByOwner(wallet);
    const heroes = Array.isArray(heroesData) ? heroesData : [];
    const optimization = generatePoolOptimizations(positions, heroes, {
      hasLinkedWallet: true,
    });
    const report = formatOptimizationReport(optimization);
    await message.reply(report);
  } catch (err) {
    console.error('[GardenOptimization] Error:', err);
    await message.reply('Something went wrong during optimization. Please try again.');
  }
}
