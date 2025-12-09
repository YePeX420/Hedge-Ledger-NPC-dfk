// src/etl/transformers/index.ts
// Main transformer orchestrator

import type { FullExtractResult, TransformResult, BehaviorMetrics } from '../types.js';
import { computeBehaviorMetrics } from './behaviorTransformer.js';

export function transformData(data: FullExtractResult): TransformResult {
  console.log(`[ETL:Transform] Computing behavior metrics...`);
  
  const behaviorMetrics = computeBehaviorMetrics(data);
  
  const stats30d = {
    questsCompleted: data.quests.questsLast30d || 0,
    heroesLeveled: Math.floor(data.heroes.totalLevels / 10),
    summonsMade: data.summons.totalSummons || 0,
    lpDeposits: data.gardens.lpPositions.length,
  };
  
  const statsLifetime = {
    totalQuests: data.quests.professionQuestsTotal + data.quests.trainingQuestsTotal,
    totalSummons: data.summons.totalSummons,
    totalLevelUps: data.heroes.totalLevels,
  };
  
  console.log(`[ETL:Transform] Transform complete:`, {
    questDayStreak: behaviorMetrics.questDayStreak,
    extractorScoreInverted: behaviorMetrics.extractorScoreInverted,
    totalQuests: statsLifetime.totalQuests,
  });
  
  return {
    behaviorMetrics,
    stats30d,
    statsLifetime,
  };
}

export { computeBehaviorMetrics };
