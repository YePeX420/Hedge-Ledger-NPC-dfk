// src/etl/loaders/walletActivityLoader.ts
// Loads ETL data into wallet_activity table

import { db } from '../../../server/db.js';
import { walletActivity } from '../../../shared/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import type { FullExtractResult, WalletContext, TransformResult } from '../types.js';

export async function loadWalletActivity(
  ctx: WalletContext,
  data: FullExtractResult,
  transform: TransformResult
): Promise<number> {
  const wallet = ctx.walletAddress.toLowerCase();
  const today = new Date().toISOString().split('T')[0];
  
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
      wallet,
      asOfDate: today,
      questsCompleted7d: data.quests.questsLast7d,
      questsCompleted30d: data.quests.questsLast30d,
      miningQuestsLifetime: data.quests.miningQuests,
      gardeningQuestsLifetime: data.quests.gardeningQuests,
      fishingQuestsLifetime: data.quests.fishingQuests,
      foragingQuestsLifetime: data.quests.foragingQuests,
      trainingQuestsLifetime: data.quests.trainingQuestsTotal,
      trainingCrystalsLifetime: data.quests.trainingCrystalsObtained,
      heroCount: data.heroes.heroCount,
      totalHeroLevels: data.heroes.totalLevels,
      summonsMade30d: data.summons.totalSummons,
      petCount: data.pets.petCount,
      meditationsLifetime: data.meditation.totalMeditations,
      meditationCrystalsUsed: data.meditation.crystalsUsedTotal,
      meditationStatGainTotal: data.meditation.totalStatGain,
      perfectMeditations: data.meditation.perfectMeditations,
      lpPositionCount: data.gardens.lpPositions.length,
      totalLpValue: Math.floor(data.gardens.totalLPValue),
      jewelBalance: Math.floor(data.portfolio.jewelBalance),
      crystalBalance: Math.floor(data.portfolio.crystalBalance),
      cJewelBalance: Math.floor(data.portfolio.cJewelBalance),
      jewelEquivalent: Math.floor(data.portfolio.jewelEquivalentBalance),
      discordMessages: data.discord.messagesToHedge,
      discordStreak: data.discord.hedgeDayStreak,
      paymentsSent: Math.floor(data.payments.jewelSentToHedge),
      questEfficiencyPct: transform.behaviorMetrics.questEfficiencyPct,
      extractorScore: 100 - transform.behaviorMetrics.extractorScoreInverted,
      updatedAt: new Date(),
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
