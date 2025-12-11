// src/etl/loaders/challengeProgressLoader.ts
// Loads computed metrics into player_challenge_progress table

import { db } from '../../../server/db.js';
import { playerChallengeProgress, challengeTiers, challenges } from '../../../shared/schema.js';
import { eq, and, sql } from 'drizzle-orm';
import type { FullExtractResult, WalletContext, TransformResult } from '../types.js';
import { METRIC_REGISTRY } from '../types.js';
import { HEDGE_CHALLENGE_CONFIG } from '../../data/challengeConfig.js';

export async function loadChallengeProgress(
  ctx: WalletContext,
  data: FullExtractResult,
  transform: TransformResult
): Promise<number> {
  const { userId, walletAddress, clusterKey } = ctx;
  
  if (!userId) {
    console.warn(`[ChallengeProgressLoader] No userId provided, skipping challenge progress update`);
    return 0;
  }
  
  let updated = 0;
  const now = new Date();
  
  for (const challenge of HEDGE_CHALLENGE_CONFIG.challenges) {
    if (!challenge.isActive) continue;
    
    try {
      const value = computeChallengeValue(challenge, data, transform);
      
      if (value === null || value === undefined) continue;
      
      const numericValue = typeof value === 'boolean' ? (value ? 1 : 0) : Math.floor(value);
      
      const highestTier = computeHighestTier(challenge, numericValue);
      
      const existing = await db
        .select()
        .from(playerChallengeProgress)
        .where(
          and(
            eq(playerChallengeProgress.userId, userId),
            eq(playerChallengeProgress.challengeKey, challenge.key)
          )
        );
      
      if (existing.length > 0) {
        const prev = existing[0];
        const shouldUpdate = numericValue !== prev.currentValue || 
          (highestTier && highestTier !== prev.highestTierAchieved);
        
        if (shouldUpdate) {
          await db
            .update(playerChallengeProgress)
            .set({
              currentValue: numericValue,
              highestTierAchieved: highestTier || prev.highestTierAchieved,
              achievedAt: highestTier && highestTier !== prev.highestTierAchieved ? now : prev.achievedAt,
              lastUpdated: now,
              updatedAt: now,
              walletAddress,
              clusterId: clusterKey || prev.clusterId,
            })
            .where(eq(playerChallengeProgress.id, prev.id));
          updated++;
        }
      } else {
        await db.insert(playerChallengeProgress).values({
          userId,
          walletAddress,
          clusterId: clusterKey,
          challengeKey: challenge.key,
          currentValue: numericValue,
          highestTierAchieved: highestTier,
          achievedAt: highestTier ? now : null,
          lastUpdated: now,
          updatedAt: now,
        });
        updated++;
      }
    } catch (err) {
      console.error(`[ChallengeProgressLoader] Error processing challenge ${challenge.key}:`, err);
    }
  }
  
  console.log(`[ChallengeProgressLoader] Updated ${updated} challenge progress records for user ${userId}`);
  return updated;
}

function computeChallengeValue(
  challenge: any,
  data: FullExtractResult,
  transform: TransformResult
): number | boolean | null {
  const { metricSource, metricKey } = challenge;
  
  const registryKey = `${metricSource}:${metricKey}`;
  const metric = METRIC_REGISTRY[registryKey];
  
  if (metric) {
    return metric.extractor(data);
  }
  
  if (metricSource === 'behavior_model') {
    const behaviorMetrics = transform.behaviorMetrics as Record<string, any>;
    const camelKey = metricKey.replace(/_([a-z])/g, (_: string, letter: string) => letter.toUpperCase());
    if (camelKey in behaviorMetrics) {
      return behaviorMetrics[camelKey];
    }
  }
  
  console.warn(`[ChallengeProgressLoader] No extractor found for ${registryKey}`);
  return null;
}

function computeHighestTier(challenge: any, value: number): string | null {
  const tiers = challenge.tiers || [];
  let highestTier: string | null = null;
  
  for (const tier of tiers) {
    if (value >= tier.thresholdValue) {
      highestTier = tier.tierCode;
    }
  }
  
  return highestTier;
}
