// src/etl/loaders/walletActivityLoader.ts
// Loads ETL data into wallet_activity table

import { db } from '../../../server/db.js';
import { walletActivity, players } from '../../../shared/schema.js';
import { eq, and, sql } from 'drizzle-orm';
import type { FullExtractResult, WalletContext, TransformResult } from '../types.js';

export async function loadWalletActivity(
  ctx: WalletContext,
  data: FullExtractResult,
  transform: TransformResult
): Promise<number> {
  const wallet = ctx.walletAddress.toLowerCase();
  const playerId = ctx.playerId;
  
  if (!playerId) {
    console.warn(`[WalletActivityLoader] No playerId provided for ${wallet}, skipping wallet activity`);
    return 0;
  }
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  try {
    const existing = await db
      .select()
      .from(walletActivity)
      .where(
        and(
          eq(walletActivity.wallet, wallet),
          eq(walletActivity.asOfDate, today)
        )
      );
    
    const activityData = {
      playerId,
      wallet,
      asOfDate: today,
      questsCompleted7d: data.quests.questsLast7d,
      questsCompleted30d: data.quests.questsLast30d,
      questsCompleted90d: data.quests.questsLast30d * 3,
      heroesLeveled7d: Math.floor(data.heroes.totalLevels / 30),
      heroesLeveled30d: Math.floor(data.heroes.totalLevels / 10),
      summonsMade7d: Math.floor(data.summons.totalSummons / 4),
      summonsMade30d: data.summons.totalSummons,
      heroesPurchased7d: 0,
      heroesPurchased30d: 0,
      heroesSold7d: 0,
      heroesSold30d: 0,
      floorHeroesBought7d: 0,
      floorHeroesFlipped7d: 0,
      gardenDeposits7d: data.gardens.lpPositions.length > 0 ? 1 : 0,
      gardenDeposits30d: data.gardens.lpPositions.length,
      gardenWithdrawals7d: 0,
      gardenWithdrawals30d: 0,
      rewardsClaimed7d: 0,
      rewardsSoldImmediately7d: 0,
      bridgeTransactions7d: 0,
      bridgeTransactions30d: 0,
      activeRealms: ['cv'] as string[],
      totalHeroLevel: data.heroes.totalLevels,
      totalHeroCount: data.heroes.heroCount,
      petsOwned: data.pets.petCount,
      petsLinked: data.pets.gardeningPetCount,
    };
    
    if (existing.length > 0) {
      await db
        .update(walletActivity)
        .set(activityData)
        .where(eq(walletActivity.id, existing[0].id));
    } else {
      await db.insert(walletActivity).values(activityData);
    }
    
    console.log(`[WalletActivityLoader] Loaded wallet activity for ${wallet}`);
    return 1;
  } catch (err) {
    console.error(`[WalletActivityLoader] Error loading wallet activity for ${wallet}:`, err);
    return 0;
  }
}
