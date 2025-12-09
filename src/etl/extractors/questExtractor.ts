// src/etl/extractors/questExtractor.ts
// Extracts quest data from wallet activity table and on-chain sources

import { db } from '../../../server/db.js';
import { walletActivity } from '../../../shared/schema.js';
import { eq, desc } from 'drizzle-orm';
import type { ExtractedQuestData, WalletContext } from '../types.js';

export async function extractQuestData(ctx: WalletContext): Promise<ExtractedQuestData> {
  const wallet = ctx.walletAddress.toLowerCase();
  
  try {
    const activities = await db
      .select()
      .from(walletActivity)
      .where(eq(walletActivity.wallet, wallet))
      .orderBy(desc(walletActivity.asOfDate))
      .limit(1);
    
    const latestActivity = activities[0];
    
    if (!latestActivity) {
      return {
        professionQuestsTotal: 0,
        trainingQuestsTotal: 0,
        trainingCrystalsObtained: 0,
        miningQuests: 0,
        gardeningQuests: 0,
        fishingQuests: 0,
        foragingQuests: 0,
        questsLast7d: 0,
        questsLast30d: 0,
      };
    }
    
    const professionQuestsTotal = 
      (latestActivity.miningQuestsLifetime || 0) +
      (latestActivity.gardeningQuestsLifetime || 0) +
      (latestActivity.fishingQuestsLifetime || 0) +
      (latestActivity.foragingQuestsLifetime || 0);
    
    return {
      professionQuestsTotal,
      trainingQuestsTotal: latestActivity.trainingQuestsLifetime || 0,
      trainingCrystalsObtained: latestActivity.trainingCrystalsLifetime || 0,
      miningQuests: latestActivity.miningQuestsLifetime || 0,
      gardeningQuests: latestActivity.gardeningQuestsLifetime || 0,
      fishingQuests: latestActivity.fishingQuestsLifetime || 0,
      foragingQuests: latestActivity.foragingQuestsLifetime || 0,
      questsLast7d: latestActivity.questsCompleted7d || 0,
      questsLast30d: latestActivity.questsCompleted30d || 0,
    };
  } catch (err) {
    console.error(`[QuestExtractor] Error extracting quest data for ${wallet}:`, err);
    return {
      professionQuestsTotal: 0,
      trainingQuestsTotal: 0,
      trainingCrystalsObtained: 0,
      miningQuests: 0,
      gardeningQuests: 0,
      fishingQuests: 0,
      foragingQuests: 0,
      questsLast7d: 0,
      questsLast30d: 0,
    };
  }
}
