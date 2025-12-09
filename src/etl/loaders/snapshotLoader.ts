// src/etl/loaders/snapshotLoader.ts
// Loads snapshot data into wallet_snapshots, wallet_power_snapshots tables

import { db } from '../../../server/db.js';
import { walletSnapshots, walletPowerSnapshots } from '../../../shared/schema.js';
import type { FullExtractResult, WalletContext } from '../types.js';

export async function loadWalletSnapshot(
  ctx: WalletContext,
  data: FullExtractResult
): Promise<number> {
  const wallet = ctx.walletAddress.toLowerCase();
  const playerId = ctx.playerId;
  const now = new Date();
  
  if (!playerId) {
    console.warn(`[SnapshotLoader] No playerId for ${wallet}, skipping wallet snapshot`);
    return 0;
  }
  
  try {
    await db.insert(walletSnapshots).values({
      playerId,
      wallet,
      asOfDate: now,
      jewelBalance: String(Math.floor(data.portfolio.jewelBalance)),
      crystalBalance: String(Math.floor(data.portfolio.crystalBalance)),
      cJewelBalance: String(Math.floor(data.portfolio.cJewelBalance)),
    });
    
    console.log(`[SnapshotLoader] Created wallet snapshot for ${wallet}`);
    return 1;
  } catch (err) {
    if ((err as any)?.code === '23505') {
      console.log(`[SnapshotLoader] Snapshot already exists for ${wallet} today`);
      return 0;
    }
    console.error(`[SnapshotLoader] Error creating wallet snapshot for ${wallet}:`, err);
    return 0;
  }
}

export async function loadPowerSnapshot(
  ctx: WalletContext,
  data: FullExtractResult
): Promise<number> {
  const wallet = ctx.walletAddress.toLowerCase();
  const clusterKey = ctx.clusterKey;
  const now = new Date();
  
  if (!clusterKey) {
    return 0;
  }
  
  try {
    const heroValue = data.heroes.heroCount * 50;
    const levelValue = data.heroes.totalLevels * 5;
    const petValue = data.pets.petCount * 30;
    const lpValue = data.gardens.totalLPValue * 0.1;
    const balanceValue = data.portfolio.jewelEquivalentBalance * 0.05;
    
    const totalPower = Math.floor(heroValue + levelValue + petValue + lpValue + balanceValue);
    
    await db.insert(walletPowerSnapshots).values({
      clusterKey,
      address: wallet,
      totalPower,
      heroCount: data.heroes.heroCount,
      totalLevels: data.heroes.totalLevels,
      petCount: data.pets.petCount,
      lpValue: String(Math.floor(data.gardens.totalLPValue)),
      tokenBalance: String(Math.floor(data.portfolio.jewelEquivalentBalance)),
      takenAt: now,
    });
    
    console.log(`[SnapshotLoader] Created power snapshot for ${wallet} (power: ${totalPower})`);
    return 1;
  } catch (err) {
    console.error(`[SnapshotLoader] Error creating power snapshot for ${wallet}:`, err);
    return 0;
  }
}
