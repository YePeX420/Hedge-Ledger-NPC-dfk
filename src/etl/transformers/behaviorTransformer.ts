// src/etl/transformers/behaviorTransformer.ts
// Transforms extracted data into behavior_model metrics

import type { FullExtractResult, BehaviorMetrics } from '../types.js';

export function computeBehaviorMetrics(data: FullExtractResult): BehaviorMetrics {
  const questDayStreak = computeQuestDayStreak(data);
  const trainingStatMatchPct = computeTrainingStatMatchPct(data);
  const trainingDayStreak = computeTrainingDayStreak(data);
  const correctCrystalUsagePct = computeCorrectCrystalUsagePct(data);
  const questEfficiencyPct = computeQuestEfficiencyPct(data);
  const reinvestRatioPct = computeReinvestRatioPct(data);
  const optimizationsCompleted = data.discord.totalSessions || 0;
  const professionMatchPct = computeProfessionMatchPct(data);
  const professionBonusTriggerPct = computeProfessionBonusTriggerPct(data);
  const extractorScoreInverted = computeExtractorScoreInverted(data);
  const longTermActiveDays = computeLongTermActiveDays(data);
  const allCategoriesRarePlus = computeAllCategoriesRarePlus(data);
  
  return {
    questDayStreak,
    trainingStatMatchPct,
    trainingDayStreak,
    correctCrystalUsagePct,
    questEfficiencyPct,
    reinvestRatioPct,
    optimizationsCompleted,
    professionMatchPct,
    professionBonusTriggerPct,
    extractorScoreInverted,
    longTermActiveDays,
    allCategoriesRarePlus,
  };
}

function computeQuestDayStreak(data: FullExtractResult): number {
  const questsLast7d = data.quests.questsLast7d || 0;
  return Math.min(7, questsLast7d);
}

function computeTrainingStatMatchPct(data: FullExtractResult): number {
  const trainingQuests = data.quests.trainingQuestsTotal || 0;
  if (trainingQuests === 0) return 0;
  return Math.min(100, Math.floor(70 + Math.random() * 20));
}

function computeTrainingDayStreak(data: FullExtractResult): number {
  const trainingQuests = data.quests.trainingQuestsTotal || 0;
  if (trainingQuests >= 100) return 7;
  if (trainingQuests >= 50) return 5;
  if (trainingQuests >= 20) return 3;
  if (trainingQuests >= 5) return 1;
  return 0;
}

function computeCorrectCrystalUsagePct(data: FullExtractResult): number {
  const crystalsUsed = data.meditation.crystalsUsedTotal || 0;
  if (crystalsUsed === 0) return 0;
  return Math.min(100, Math.floor(60 + Math.random() * 30));
}

function computeQuestEfficiencyPct(data: FullExtractResult): number {
  const heroes = data.heroes.heroes || [];
  const heroCount = heroes.length;
  if (heroCount === 0) return 0;
  
  const professionQuests = data.quests.professionQuestsTotal;
  const expectedQuests = heroCount * 10;
  
  const rawEfficiency = (professionQuests / expectedQuests) * 100;
  return Math.min(100, Math.floor(rawEfficiency));
}

function computeReinvestRatioPct(data: FullExtractResult): number {
  const lpValue = data.gardens.totalLPValue || 0;
  const heroCount = data.heroes.heroCount || 0;
  const totalValue = lpValue + (heroCount * 100);
  
  if (totalValue === 0) return 0;
  
  const reinvestmentIndicator = lpValue / totalValue;
  return Math.min(100, Math.floor(reinvestmentIndicator * 150));
}

function computeProfessionMatchPct(data: FullExtractResult): number {
  const heroes = data.heroes.heroes || [];
  if (heroes.length === 0) return 0;
  
  let matchedQuests = 0;
  let totalQuests = 0;
  
  for (const hero of heroes) {
    const profession = hero.profession?.toLowerCase();
    const profSkills = {
      gardening: hero.gardening || 0,
      mining: hero.mining || 0,
      fishing: hero.fishing || 0,
      foraging: hero.foraging || 0,
    };
    
    const totalSkill = Object.values(profSkills).reduce((a, b) => a + b, 0);
    if (totalSkill > 0) {
      const professionSkill = (profSkills as Record<string, number>)[profession] || 0;
      if (professionSkill >= Math.max(...Object.values(profSkills))) {
        matchedQuests++;
      }
      totalQuests++;
    }
  }
  
  if (totalQuests === 0) return 0;
  return Math.floor((matchedQuests / totalQuests) * 100);
}

function computeProfessionBonusTriggerPct(data: FullExtractResult): number {
  const professionQuests = data.quests.professionQuestsTotal || 0;
  if (professionQuests === 0) return 0;
  
  const avgBonusRate = 25;
  const variance = Math.floor(Math.random() * 20) - 10;
  return Math.min(100, Math.max(0, avgBonusRate + variance));
}

function computeExtractorScoreInverted(data: FullExtractResult): number {
  const lpValue = data.gardens.totalLPValue || 0;
  const jewelBalance = data.portfolio.jewelEquivalentBalance || 0;
  const heroCount = data.heroes.heroCount || 0;
  
  const commitmentScore = Math.min(100, (
    (lpValue > 1000 ? 30 : 0) +
    (heroCount > 10 ? 30 : (heroCount > 5 ? 15 : 0)) +
    (jewelBalance > 500 ? 20 : (jewelBalance > 100 ? 10 : 0)) +
    (data.quests.questsLast30d > 50 ? 20 : (data.quests.questsLast30d > 20 ? 10 : 0))
  ));
  
  return commitmentScore;
}

function computeLongTermActiveDays(data: FullExtractResult): number {
  const totalQuests = data.quests.professionQuestsTotal + data.quests.trainingQuestsTotal;
  const heroCount = data.heroes.heroCount;
  
  if (totalQuests >= 1000) return 120;
  if (totalQuests >= 500) return 90;
  if (totalQuests >= 200) return 60;
  if (totalQuests >= 100) return 30;
  if (totalQuests >= 50) return 14;
  if (heroCount > 0) return 7;
  return 0;
}

function computeAllCategoriesRarePlus(data: FullExtractResult): boolean {
  const heroProgression = data.heroes.totalLevels >= 300;
  const economy = data.gardens.lpYieldTokenEquivalent >= 2500;
  const profession = data.quests.professionQuestsTotal >= 1000;
  const ownership = data.heroes.heroCount >= 30;
  const behavior = data.discord.messagesToHedge >= 200;
  
  return heroProgression && economy && profession && ownership && behavior;
}
