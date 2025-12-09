// src/etl/extractors/meditationExtractor.ts
// Extracts meditation data for ETL pipeline

import { db } from '../../../server/db.js';
import { walletActivity } from '../../../shared/schema.js';
import { eq, desc } from 'drizzle-orm';
import type { ExtractedMeditationData, WalletContext } from '../types.js';

export async function extractMeditationData(ctx: WalletContext): Promise<ExtractedMeditationData> {
  const wallet = ctx.walletAddress.toLowerCase();
  
  try {
    const activities = await db
      .select()
      .from(walletActivity)
      .where(eq(walletActivity.wallet, wallet))
      .orderBy(desc(walletActivity.asOfDate))
      .limit(1);
    
    const latestActivity = activities[0];
    
    return {
      crystalsUsedTotal: latestActivity?.meditationCrystalsUsed || 0,
      totalMeditations: latestActivity?.meditationsLifetime || 0,
      totalStatGain: latestActivity?.meditationStatGainTotal || 0,
      perfectMeditations: latestActivity?.perfectMeditations || 0,
    };
  } catch (err) {
    console.error(`[MeditationExtractor] Error extracting meditation data for ${wallet}:`, err);
    return {
      crystalsUsedTotal: 0,
      totalMeditations: 0,
      totalStatGain: 0,
      perfectMeditations: 0,
    };
  }
}
