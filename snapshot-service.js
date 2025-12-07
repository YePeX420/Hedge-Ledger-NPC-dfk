// snapshot-service.js
// Build a cached daily snapshot of a player's DFK footprint.
//
// This is intentionally opinionated but lightweight:
// - Uses your existing onchain-data + wallet-lp-detector helpers
// - Safe fallbacks so one bad wallet doesn't crash the job

import * as onchain from "./onchain-data.js";
import { fetchWalletBalances, fetchCJewelLockTime } from "./blockchain-balance-fetcher.js";
import { detectWalletLPPositions } from "./wallet-lp-detector.js";

/**
 * Build a daily snapshot for a single wallet.
 *
 * @param {string} walletAddress  0x... address
 * @returns {Promise<object>}     Snapshot object, safe even on partial failure
 */
export async function buildPlayerSnapshot(walletAddress) {
  const wallet = walletAddress?.toLowerCase();
  if (!wallet || !wallet.startsWith("0x") || wallet.length !== 42) {
    throw new Error(`Invalid wallet address for snapshot: ${walletAddress}`);
  }

  const snapshot = {
    wallet,
    heroCount: 0,
    gen0Count: 0,
    influence: 0,
    totalLPValue: 0,
    jewelBalance: 0,
    crystalBalance: 0,
    cJewelBalance: 0,
    cJewelLockDaysRemaining: null,
    dfkAgeDays: null,
    firstTxAt: null,
    lpPositions: [],
    updatedAt: new Date().toISOString(),
  };

  try {
    // Heroes
    const heroes = await onchain.getAllHeroesByOwner(wallet);
    snapshot.heroCount = heroes.length;

    const { gen0Count, heroAge } = onchain.calculateHeroMetrics(heroes);
    snapshot.gen0Count = gen0Count;
    snapshot.heroAge = heroAge;

    // Influence (Metis)
    snapshot.influence = await onchain.getPlayerInfluence(wallet);

    // Balances
    try {
      const balances = await fetchWalletBalances(wallet);
      snapshot.jewelBalance = parseFloat(balances.jewel || "0");
      snapshot.crystalBalance = parseFloat(balances.crystal || "0");
      snapshot.cJewelBalance = parseFloat(balances.cjewel || "0");
    } catch (err) {
      console.warn(`[Snapshot] Balance fetch failed for ${wallet}:`, err.message);
    }

    // cJEWEL lock time
    try {
      const lockInfo = await fetchCJewelLockTime(wallet);
      if (lockInfo) {
        snapshot.cJewelLockDaysRemaining = lockInfo.lockDaysRemaining;
      }
    } catch (err) {
      console.warn(`[Snapshot] cJEWEL lock time fetch failed for ${wallet}:`, err.message);
    }

    // LP positions (Crystalvale gardens only for now)
    try {
      const positions = await detectWalletLPPositions(wallet);
      snapshot.lpPositions = positions || [];
      snapshot.totalLPValue = snapshot.lpPositions.reduce(
        (sum, p) => sum + parseFloat(p.userTVL || "0"),
        0
      );
    } catch (err) {
      console.warn(`[Snapshot] LP detection failed for ${wallet}:`, err.message);
    }

    // DFK age
    try {
      const firstTxMs = await onchain.getFirstDfkTxTimestamp(wallet);
      if (firstTxMs) {
        snapshot.dfkAgeDays = onchain.calculateDfkAgeDays(firstTxMs);
        snapshot.firstTxAt = new Date(firstTxMs).toISOString();
      }
    } catch (err) {
      console.warn(`[Snapshot] Age calculation failed for ${wallet}:`, err.message);
    }
  } catch (err) {
    console.error(`[Snapshot] Fatal error while building snapshot for ${wallet}:`, err.message);
  }

  snapshot.updatedAt = new Date().toISOString();
  return snapshot;
}
