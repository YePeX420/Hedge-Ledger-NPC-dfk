import { db } from './db';
import { enemyStateActionExamples, learnedEnemyPolicyProfiles } from '@shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import { buildStateKey, bucketHpPercent, bucketMpPercent, STATE_FEATURE_SCHEMA_VERSION } from './pve-feature-extractor';
import type { StateFeatures } from './pve-feature-extractor';

const LAPLACE_ALPHA = 1.0;

interface FrequencyTable {
  [stateKey: string]: {
    [action: string]: number;
  };
}

interface TargetFrequencyTable {
  [stateActionKey: string]: {
    [target: string]: number;
  };
}

export interface BehaviorAggregation {
  abilityUseRates: Record<string, number>;
  reuseGaps: Record<string, { mean: number; min: number; max: number }>;
  targetingDistribution: Record<string, Record<string, number>>;
}

function aggregateBehaviorProfile(
  examples: Array<{ chosenAction: string; chosenTarget: string | null; turn: number }>,
): BehaviorAggregation {
  const actionCounts: Record<string, number> = {};
  const targetCounts: Record<string, Record<string, number>> = {};
  const actionTurns: Record<string, number[]> = {};

  for (const ex of examples) {
    actionCounts[ex.chosenAction] = (actionCounts[ex.chosenAction] || 0) + 1;
    if (!actionTurns[ex.chosenAction]) actionTurns[ex.chosenAction] = [];
    actionTurns[ex.chosenAction].push(ex.turn);
    if (ex.chosenTarget) {
      if (!targetCounts[ex.chosenAction]) targetCounts[ex.chosenAction] = {};
      targetCounts[ex.chosenAction][ex.chosenTarget] = (targetCounts[ex.chosenAction][ex.chosenTarget] || 0) + 1;
    }
  }

  const total = examples.length || 1;
  const abilityUseRates: Record<string, number> = {};
  for (const [action, count] of Object.entries(actionCounts)) {
    abilityUseRates[action] = Math.round((count / total) * 1000) / 1000;
  }

  const reuseGaps: Record<string, { mean: number; min: number; max: number }> = {};
  for (const [action, turns] of Object.entries(actionTurns)) {
    if (turns.length < 2) continue;
    const sorted = turns.sort((a, b) => a - b);
    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      gaps.push(sorted[i] - sorted[i - 1]);
    }
    if (gaps.length > 0) {
      reuseGaps[action] = {
        mean: Math.round((gaps.reduce((s, g) => s + g, 0) / gaps.length) * 100) / 100,
        min: Math.min(...gaps),
        max: Math.max(...gaps),
      };
    }
  }

  const targetingDistribution: Record<string, Record<string, number>> = {};
  for (const [action, targets] of Object.entries(targetCounts)) {
    const actionTotal = Object.values(targets).reduce((s, v) => s + v, 0) || 1;
    targetingDistribution[action] = {};
    for (const [target, count] of Object.entries(targets)) {
      targetingDistribution[action][target] = Math.round((count / actionTotal) * 1000) / 1000;
    }
  }

  return { abilityUseRates, reuseGaps, targetingDistribution };
}

export async function rebuildPolicyProfile(encounterType: string, enemyType: string): Promise<{
  sampleCount: number;
  profileVersion: number;
  behaviorAggregation: BehaviorAggregation;
}> {
  const examples = await db
    .select()
    .from(enemyStateActionExamples)
    .where(and(
      eq(enemyStateActionExamples.encounterType, encounterType),
      eq(enemyStateActionExamples.enemyType, enemyType),
    ));

  if (examples.length === 0) {
    return { sampleCount: 0, profileVersion: 0, behaviorAggregation: { abilityUseRates: {}, reuseGaps: {}, targetingDistribution: {} } };
  }

  const behaviorAggregation = aggregateBehaviorProfile(examples);

  const actionFreqs: FrequencyTable = {};
  const targetFreqs: TargetFrequencyTable = {};
  const allActions = new Set<string>();
  const allTargets = new Set<string>();

  for (const ex of examples) {
    const features = ex.stateFeaturesJson as StateFeatures;
    if (!features) continue;

    const stateKey = buildStateKey(features);
    allActions.add(ex.chosenAction);
    if (ex.chosenTarget) allTargets.add(ex.chosenTarget);

    if (!actionFreqs[stateKey]) actionFreqs[stateKey] = {};
    actionFreqs[stateKey][ex.chosenAction] = (actionFreqs[stateKey][ex.chosenAction] || 0) + 1;

    const stateActionKey = `${stateKey}|${ex.chosenAction}`;
    if (!targetFreqs[stateActionKey]) targetFreqs[stateActionKey] = {};
    if (ex.chosenTarget) {
      targetFreqs[stateActionKey][ex.chosenTarget] = (targetFreqs[stateActionKey][ex.chosenTarget] || 0) + 1;
    }
  }

  const actionProbModel: Record<string, Record<string, number>> = {};
  const actionArr = Array.from(allActions);

  for (const [stateKey, counts] of Object.entries(actionFreqs)) {
    const totalWithSmoothing = Object.values(counts).reduce((s, v) => s + v, 0) + LAPLACE_ALPHA * actionArr.length;
    actionProbModel[stateKey] = {};
    for (const action of actionArr) {
      const count = counts[action] || 0;
      actionProbModel[stateKey][action] = (count + LAPLACE_ALPHA) / totalWithSmoothing;
    }
  }

  const targetProbModel: Record<string, Record<string, number>> = {};
  const targetArr = Array.from(allTargets);

  for (const [stateActionKey, counts] of Object.entries(targetFreqs)) {
    const totalWithSmoothing = Object.values(counts).reduce((s, v) => s + v, 0) + LAPLACE_ALPHA * Math.max(targetArr.length, 1);
    targetProbModel[stateActionKey] = {};
    for (const target of targetArr) {
      const count = counts[target] || 0;
      targetProbModel[stateActionKey][target] = (count + LAPLACE_ALPHA) / totalWithSmoothing;
    }
  }

  const confidenceModel: Record<string, number> = {};
  for (const [stateKey, counts] of Object.entries(actionFreqs)) {
    const total = Object.values(counts).reduce((s, v) => s + v, 0);
    confidenceModel[stateKey] = Math.min(1.0, total / 50);
  }

  const existing = await db
    .select()
    .from(learnedEnemyPolicyProfiles)
    .where(and(
      eq(learnedEnemyPolicyProfiles.encounterType, encounterType),
      eq(learnedEnemyPolicyProfiles.enemyType, enemyType),
    ))
    .orderBy(desc(learnedEnemyPolicyProfiles.profileVersion))
    .limit(1);

  const profileVersion = existing.length > 0 ? (existing[0].profileVersion + 1) : 1;

  if (existing.length > 0) {
    await db
      .update(learnedEnemyPolicyProfiles)
      .set({
        profileVersion,
        stateFeatureSchemaVersion: STATE_FEATURE_SCHEMA_VERSION,
        actionProbabilityModelJson: actionProbModel,
        targetProbabilityModelJson: targetProbModel,
        confidenceModelJson: confidenceModel,
        sampleCount: examples.length,
        updatedAt: new Date(),
      })
      .where(eq(learnedEnemyPolicyProfiles.id, existing[0].id));
  } else {
    await db.insert(learnedEnemyPolicyProfiles).values({
      encounterType,
      enemyType,
      profileVersion,
      stateFeatureSchemaVersion: STATE_FEATURE_SCHEMA_VERSION,
      actionProbabilityModelJson: actionProbModel,
      targetProbabilityModelJson: targetProbModel,
      confidenceModelJson: confidenceModel,
      sampleCount: examples.length,
    });
  }

  return { sampleCount: examples.length, profileVersion, behaviorAggregation };
}

export async function getLearnedPolicy(
  encounterType: string,
  enemyType: string,
  features: StateFeatures,
): Promise<{
  policy: Record<string, number> | null;
  targetPolicy: Record<string, Record<string, number>> | null;
  sampleCount: number;
  confidence: number;
}> {
  const profiles = await db
    .select()
    .from(learnedEnemyPolicyProfiles)
    .where(and(
      eq(learnedEnemyPolicyProfiles.encounterType, encounterType),
      eq(learnedEnemyPolicyProfiles.enemyType, enemyType),
    ))
    .orderBy(desc(learnedEnemyPolicyProfiles.profileVersion))
    .limit(1);

  if (profiles.length === 0) {
    return { policy: null, targetPolicy: null, sampleCount: 0, confidence: 0 };
  }

  const profile = profiles[0];
  const actionModel = profile.actionProbabilityModelJson as Record<string, Record<string, number>>;
  const targetModel = profile.targetProbabilityModelJson as Record<string, Record<string, number>> | null;
  const confidenceModel = profile.confidenceModelJson as Record<string, number>;

  const stateKey = buildStateKey(features);
  let policy = actionModel[stateKey] || null;
  const confidence = confidenceModel[stateKey] || 0;

  let resolvedStateKey = stateKey;
  if (!policy) {
    const bucketKeys = Object.keys(actionModel);
    const partialKey = stateKey.split('|').slice(0, 3).join('|');
    const fallback = bucketKeys.find(k => k.startsWith(partialKey));
    if (fallback) {
      resolvedStateKey = fallback;
      return {
        policy: actionModel[fallback],
        targetPolicy: extractTargetPolicy(targetModel, fallback),
        sampleCount: profile.sampleCount,
        confidence: Math.max(0, (confidenceModel[fallback] || 0) * 0.7),
      };
    }
  }

  return {
    policy,
    targetPolicy: extractTargetPolicy(targetModel, resolvedStateKey),
    sampleCount: profile.sampleCount,
    confidence,
  };
}

function extractTargetPolicy(
  targetModel: Record<string, Record<string, number>> | null,
  stateKey: string,
): Record<string, Record<string, number>> | null {
  if (!targetModel) return null;
  const result: Record<string, Record<string, number>> = {};
  const prefix = `${stateKey}|`;
  for (const [key, probs] of Object.entries(targetModel)) {
    if (key.startsWith(prefix)) {
      const actionPart = key.slice(prefix.length);
      result[actionPart] = probs;
    }
  }
  return Object.keys(result).length > 0 ? result : null;
}
