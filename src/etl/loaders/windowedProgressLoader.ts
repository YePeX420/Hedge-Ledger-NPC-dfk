// src/etl/loaders/windowedProgressLoader.ts
// Computes 180-day rolling window challenge progress and writes to challenge_progress_windowed table

import { db } from '../../../server/db.js';
import { challengeProgressWindowed, huntingEncounters, pvpMatches, challenges, challengeTiers, playerChallengeProgress } from '../../../shared/schema.js';
import { eq, and, gte, sql, desc } from 'drizzle-orm';
import type { FullExtractResult, WalletContext, TransformResult } from '../types.js';
import { METRIC_REGISTRY } from '../types.js';
import { HEDGE_CHALLENGE_CONFIG } from '../../data/challengeConfig.js';

const WINDOW_DAYS = 180;
const WINDOW_KEY = '180d';

const EVENT_BACKED_SOURCES = ['onchain_hunting', 'onchain_pvp'] as const;

export async function loadWindowedProgress(
  ctx: WalletContext,
  data: FullExtractResult,
  transform: TransformResult
): Promise<number> {
  const clusterKey = ctx.clusterKey;
  
  if (!clusterKey) {
    console.warn(`[WindowedProgressLoader] No clusterKey provided, skipping windowed progress`);
    return 0;
  }
  
  let updated = 0;
  const now = new Date();
  const windowStart = new Date(now.getTime() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
  
  for (const challenge of HEDGE_CHALLENGE_CONFIG.challenges) {
    if (!challenge.isActive) continue;
    
    if (isPrestigeChallenge(challenge)) {
      continue;
    }
    
    try {
      let value: number | null = null;
      
      if (isEventBackedSource(challenge.metricSource)) {
        value = await computeEventBackedValue(challenge, clusterKey, windowStart);
      } else {
        value = computeSnapshotValue(challenge, data, transform);
      }
      
      if (value === null) continue;
      
      const numericValue = Math.floor(value);
      const tierCode = computeTierCode(challenge, numericValue);
      
      await db
        .insert(challengeProgressWindowed)
        .values({
          clusterId: clusterKey,
          challengeKey: challenge.key,
          windowKey: WINDOW_KEY,
          value: numericValue.toString(),
          tierCode,
          computedAt: now,
        })
        .onConflictDoUpdate({
          target: [
            challengeProgressWindowed.clusterId,
            challengeProgressWindowed.challengeKey,
            challengeProgressWindowed.windowKey,
          ],
          set: {
            value: numericValue.toString(),
            tierCode,
            computedAt: now,
          },
        });
      
      updated++;
      
      if (tierCode) {
        await checkAndSetFoundersMark(clusterKey, challenge.key, tierCode, challenge);
      }
    } catch (err) {
      console.error(`[WindowedProgressLoader] Error processing challenge ${challenge.key}:`, err);
    }
  }
  
  console.log(`[WindowedProgressLoader] Updated ${updated} windowed progress records for cluster ${clusterKey}`);
  return updated;
}

function isPrestigeChallenge(challenge: any): boolean {
  if (challenge.categoryKey === 'prestige_overall' || 
      challenge.categoryKey === 'summoning_prestige' ||
      challenge.categoryKey === 'epic_feats') {
    return true;
  }
  
  const tiers = challenge.tiers || [];
  return tiers.some((t: any) => t.isPrestige === true);
}

function isEventBackedSource(source: string): boolean {
  return EVENT_BACKED_SOURCES.includes(source as any);
}

async function computeEventBackedValue(
  challenge: any,
  clusterKey: string,
  windowStart: Date
): Promise<number | null> {
  const { metricSource, metricKey } = challenge;
  
  if (metricSource === 'onchain_hunting') {
    return computeHuntingValue(metricKey, clusterKey, windowStart);
  }
  
  if (metricSource === 'onchain_pvp') {
    return computePvpValue(metricKey, clusterKey, windowStart);
  }
  
  return null;
}

async function computeHuntingValue(
  metricKey: string,
  clusterKey: string,
  windowStart: Date
): Promise<number> {
  const encounters = await db
    .select()
    .from(huntingEncounters)
    .where(
      and(
        eq(huntingEncounters.clusterKey, clusterKey),
        gte(huntingEncounters.encounteredAt, windowStart)
      )
    );
  
  if (!encounters.length) return 0;
  
  const winningEncounters = encounters.filter((e: typeof encounters[0]) => e.result === 'WIN');
  
  type EncounterRow = typeof encounters[0];
  
  switch (metricKey) {
    case 'wins':
      return winningEncounters.length;
    case 'motherclucker_kills':
      return winningEncounters.filter((e: EncounterRow) => e.enemyId === 'MOTHERCLUCKER').length;
    case 'mad_boar_kills':
      return winningEncounters.filter((e: EncounterRow) => e.enemyId === 'MAD_BOAR').length;
    case 'relics_found':
      let relics = 0;
      for (const e of encounters) {
        if (Array.isArray(e.drops)) {
          for (const drop of e.drops as Array<{ itemId: string; quantity: number }>) {
            if (isRelicDrop(drop.itemId)) {
              relics += drop.quantity || 1;
            }
          }
        }
      }
      return relics;
    case 'clucker_miracle':
      return winningEncounters.some(
        (e: EncounterRow) => e.enemyId === 'MOTHERCLUCKER' && e.survivingHeroCount === 1 && e.survivingHeroHp === 1
      ) ? 1 : 0;
    default:
      return 0;
  }
}

async function computePvpValue(
  metricKey: string,
  clusterKey: string,
  windowStart: Date
): Promise<number> {
  const matches = await db
    .select()
    .from(pvpMatches)
    .where(
      and(
        eq(pvpMatches.clusterKey, clusterKey),
        gte(pvpMatches.matchedAt, windowStart)
      )
    );
  
  if (!matches.length) return 0;
  
  type MatchRow = typeof matches[0];
  
  switch (metricKey) {
    case 'matches_played':
      return matches.length;
    case 'wins':
      return matches.filter((m: MatchRow) => m.outcome === 'WIN').length;
    case 'best_win_streak':
      let maxStreak = 0;
      let currentStreak = 0;
      const sorted = [...matches].sort((a: MatchRow, b: MatchRow) => 
        new Date(a.matchedAt).getTime() - new Date(b.matchedAt).getTime()
      );
      for (const m of sorted) {
        if (m.outcome === 'WIN') {
          currentStreak++;
          maxStreak = Math.max(maxStreak, currentStreak);
        } else {
          currentStreak = 0;
        }
      }
      return maxStreak;
    case 'flawless_victory':
      return matches.some((m: MatchRow) => m.outcome === 'WIN' && m.heroDeaths === 0) ? 1 : 0;
    default:
      return 0;
  }
}

function computeSnapshotValue(
  challenge: any,
  data: FullExtractResult,
  transform: TransformResult
): number | null {
  const { metricSource, metricKey } = challenge;
  
  const registryKey = `${metricSource}:${metricKey}`;
  const metric = METRIC_REGISTRY[registryKey];
  
  if (metric) {
    const value = metric.extractor(data);
    return typeof value === 'boolean' ? (value ? 1 : 0) : (value as number);
  }
  
  if (metricSource === 'behavior_model') {
    const behaviorMetrics = transform.behaviorMetrics as Record<string, any>;
    const camelKey = metricKey.replace(/_([a-z])/g, (_: string, letter: string) => letter.toUpperCase());
    if (camelKey in behaviorMetrics) {
      const val = behaviorMetrics[camelKey];
      return typeof val === 'boolean' ? (val ? 1 : 0) : val;
    }
  }
  
  return null;
}

function computeTierCode(challenge: any, value: number): string | null {
  const tiers = challenge.tiers || [];
  let highestTier: string | null = null;
  
  for (const tier of tiers) {
    if (value >= tier.thresholdValue) {
      highestTier = tier.tierCode;
    }
  }
  
  return highestTier;
}

function getTopTierCode(challenge: any): string | null {
  const tiers = challenge.tiers || [];
  if (!tiers.length) return null;
  
  const sorted = [...tiers].sort((a: any, b: any) => (b.sortOrder || 0) - (a.sortOrder || 0));
  return sorted[0]?.tierCode || null;
}

async function checkAndSetFoundersMark(
  clusterKey: string,
  challengeKey: string,
  achievedTier: string,
  challenge: any
): Promise<void> {
  const topTier = getTopTierCode(challenge);
  
  if (!topTier || achievedTier !== topTier) return;
  
  const existing = await db
    .select()
    .from(playerChallengeProgress)
    .where(
      and(
        eq(playerChallengeProgress.clusterId, clusterKey),
        eq(playerChallengeProgress.challengeKey, challengeKey)
      )
    );
  
  if (existing.length > 0 && !existing[0].foundersMarkAchieved) {
    await db
      .update(playerChallengeProgress)
      .set({
        foundersMarkAchieved: true,
        foundersMarkAt: new Date(),
      })
      .where(eq(playerChallengeProgress.id, existing[0].id));
    
    console.log(`[WindowedProgressLoader] Set Founder's Mark for ${clusterKey} on challenge ${challengeKey}`);
  }
}

const RELIC_ITEMS = [
  'ANCIENT_RELIC',
  'SACRED_RELIC',
  'MYSTICAL_RELIC',
  'DIVINE_RELIC',
];

function isRelicDrop(itemId: string): boolean {
  return RELIC_ITEMS.includes(itemId);
}
