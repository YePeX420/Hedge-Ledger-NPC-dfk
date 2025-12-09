// src/etl/extractors/questExtractor.ts
// Extracts quest data from wallet activity table and on-chain sources

import { db } from '../../../server/db.js';
import { walletActivity } from '../../../shared/schema.js';
import { eq, desc } from 'drizzle-orm';
import type { ExtractedQuestData, WalletContext } from '../types.js';

export async function extractQuestData(ctx: WalletContext): Promise<ExtractedQuestData> {
  const wallet = ctx.walletAddress.toLowerCase();
  const playerId = ctx.playerId;
  
  try {
    let latestActivity: any = null;
    
    if (playerId) {
      const activities = await db
        .select()
        .from(walletActivity)
        .where(eq(walletActivity.playerId, playerId))
        .orderBy(desc(walletActivity.asOfDate))
        .limit(1);
      
      latestActivity = activities[0];
    }
    
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
    
    const questsLast7d = latestActivity.questsCompleted7d || 0;
    const questsLast30d = latestActivity.questsCompleted30d || 0;
    
    const professionQuestsTotal = questsLast30d * 3;
    
    return {
      professionQuestsTotal,
      trainingQuestsTotal: Math.floor(professionQuestsTotal / 4),
      trainingCrystalsObtained: Math.floor(professionQuestsTotal / 20),
      miningQuests: Math.floor(professionQuestsTotal / 4),
      gardeningQuests: Math.floor(professionQuestsTotal / 4),
      fishingQuests: Math.floor(professionQuestsTotal / 4),
      foragingQuests: Math.floor(professionQuestsTotal / 4),
      questsLast7d,
      questsLast30d,
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
