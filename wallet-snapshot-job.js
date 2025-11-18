/**
 * Wallet Snapshot Background Job
 * 
 * Captures daily balance snapshots for all registered player wallets.
 * Used for 7-day % change tracking in the admin dashboard.
 * 
 * Runs daily at UTC midnight.
 */

import { db } from './server/db.js';
import { players, walletSnapshots } from './shared/schema.ts';
import { sql } from 'drizzle-orm';
import { batchFetchWalletBalances } from './blockchain-balance-fetcher.js';

const SNAPSHOT_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
let snapshotTimer = null;

/**
 * Calculate UTC midnight for the current day
 */
function getCurrentUtcMidnight() {
  const now = new Date();
  const utcMidnight = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    0, 0, 0, 0
  ));
  return utcMidnight;
}

/**
 * Execute a daily snapshot for all registered players
 */
export async function captureWalletSnapshots() {
  try {
    const asOfDate = getCurrentUtcMidnight();
    console.log(`[SnapshotJob] Starting wallet snapshot capture for ${asOfDate.toISOString()}`);
    
    // Get all players with linked wallets
    const playersWithWallets = await db
      .select({
        id: players.id,
        primaryWallet: players.primaryWallet,
        wallets: players.wallets
      })
      .from(players)
      .where(sql`${players.primaryWallet} IS NOT NULL OR ${players.wallets} IS NOT NULL`);
    
    if (playersWithWallets.length === 0) {
      console.log('[SnapshotJob] No players with wallets found, skipping snapshot');
      return;
    }
    
    console.log(`[SnapshotJob] Found ${playersWithWallets.length} player(s) with wallets`);
    
    // Build map of player ID -> wallet addresses
    const playerWalletMap = new Map();
    const allWallets = [];
    
    for (const player of playersWithWallets) {
      if (player.primaryWallet) {
        playerWalletMap.set(player.id, player.primaryWallet);
        allWallets.push(player.primaryWallet);
      }
    }
    
    if (allWallets.length === 0) {
      console.log('[SnapshotJob] No primary wallets found, skipping snapshot');
      return;
    }
    
    console.log(`[SnapshotJob] Fetching balances for ${allWallets.length} wallet(s)...`);
    
    // Fetch all balances from blockchain
    const balances = await batchFetchWalletBalances(allWallets);
    
    // Prepare snapshot records
    const snapshotRecords = [];
    for (const [playerId, walletAddress] of playerWalletMap.entries()) {
      const balance = balances.get(walletAddress);
      if (balance) {
        snapshotRecords.push({
          playerId,
          wallet: walletAddress,
          asOfDate,
          jewelBalance: balance.jewel,
          crystalBalance: balance.crystal,
          cjewelBalance: balance.cjewel
        });
      }
    }
    
    if (snapshotRecords.length === 0) {
      console.log('[SnapshotJob] No balance data retrieved, skipping snapshot save');
      return;
    }
    
    // Insert all snapshots in a single transaction
    console.log(`[SnapshotJob] Saving ${snapshotRecords.length} snapshot(s) to database...`);
    await db.insert(walletSnapshots).values(snapshotRecords).onConflictDoNothing();
    
    console.log(`[SnapshotJob] ✅ Successfully captured ${snapshotRecords.length} wallet snapshot(s)`);
    
  } catch (err) {
    console.error('[SnapshotJob] ❌ Error capturing wallet snapshots:', err.message);
    console.error(err);
  }
}

/**
 * Calculate milliseconds until next UTC midnight
 */
function msUntilNextUtcMidnight() {
  const now = Date.now();
  const nextMidnight = new Date(Date.UTC(
    new Date().getUTCFullYear(),
    new Date().getUTCMonth(),
    new Date().getUTCDate() + 1,
    0, 0, 0, 0
  ));
  return nextMidnight.getTime() - now;
}

/**
 * Start the background snapshot job
 * Runs daily at UTC midnight
 */
export async function startSnapshotJob() {
  console.log('[SnapshotJob] Starting daily wallet snapshot job...');
  
  // Run initial snapshot immediately (useful for testing and initial setup)
  await captureWalletSnapshots();
  
  // Schedule next run at UTC midnight
  const scheduleNextRun = () => {
    const msUntilNext = msUntilNextUtcMidnight();
    const nextRunTime = new Date(Date.now() + msUntilNext);
    console.log(`[SnapshotJob] Next snapshot scheduled for ${nextRunTime.toISOString()} (in ${(msUntilNext / 1000 / 60 / 60).toFixed(2)} hours)`);
    
    snapshotTimer = setTimeout(async () => {
      await captureWalletSnapshots();
      scheduleNextRun(); // Schedule next run after completion
    }, msUntilNext);
  };
  
  scheduleNextRun();
  console.log('[SnapshotJob] ✅ Snapshot job started');
}

/**
 * Stop the background snapshot job
 */
export function stopSnapshotJob() {
  if (snapshotTimer !== null) {
    clearTimeout(snapshotTimer);
    snapshotTimer = null;
    console.log('[SnapshotJob] Snapshot job stopped');
  }
}
