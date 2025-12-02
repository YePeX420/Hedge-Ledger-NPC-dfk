// garden-optimization-handler.js

import {
  detectWalletLPPositions,
  generatePoolOptimizations,
  formatOptimizationReport,
} from './wallet-lp-detector.js';
import { getAllHeroesByOwner } from './onchain-data.js';
import { isPaymentBypassEnabled } from './debug-settings.js';
import { db } from './server/db.js';
import { players } from './shared/schema.ts';
import { eq } from 'drizzle-orm';

export async function handleGardenOptimizationDM(message) {
  const discordId = message.author.id;

  // 1) Find player's linked wallet
  const rows = await db
    .select()
    .from(players)
    .where(eq(players.discordId, discordId))
    .limit(1);

  if (!rows || rows.length === 0 || !rows[0].primaryWallet) {
    await message.reply(
      "I don't have a wallet linked for you yet. Send me your DFK wallet address and I'll scan your gardens."
    );
    return;
  }

  const wallet = rows[0].primaryWallet;

  await message.reply(
    "Hold on a moment while I scan for your garden pools.\n\n[Scanning your wallet on DFK Chain...]"
  );

  // 2) Real positions
  const positions = await detectWalletLPPositions(wallet);

  if (!positions || positions.length === 0) {
    await message.reply(
      "I couldn't find any LP tokens staked in the Crystalvale gardens for your linked wallet."
    );
    return;
  }

  // Build teaser summary
  const poolNames = positions.map((p) => p.pairName).join(', ');
  const totalValueNum = positions.reduce(
    (sum, p) => sum + parseFloat(p.userTVL || 0),
    0
  );
  const totalValueStr = isNaN(totalValueNum)
    ? 'N/A'
    : `$${totalValueNum.toFixed(0)}`;

  const bypass = isPaymentBypassEnabled();

  if (!bypass) {
    // Normal production behavior: teaser + cost, stop here
    await message.reply(
      `I found you're staking in ${positions.length} pool${
        positions.length > 1 ? 's' : ''
      }: ${poolNames} (Total value: ${totalValueStr}).\n\n` +
        `Full optimization (hero & pet assignments + APR uplift) costs **25 JEWEL**. ` +
        `If you want to proceed, send 25 JEWEL to my wallet and paste the transaction hash here.`
    );
    return;
  }

  // 3) BYPASS MODE: skip payment for testing, run full optimization now
  await message.reply(
    `🧪 Payment bypass is enabled for testing, so I'll skip the 25 JEWEL step and run your optimization now.`
  );

  const heroes = await getAllHeroesByOwner(wallet);
  const optimization = generatePoolOptimizations(positions, heroes, {
    hasLinkedWallet: true,
  });
  const report = formatOptimizationReport(optimization);

  await message.reply(report);
}
