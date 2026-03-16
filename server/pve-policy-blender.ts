import type { StateFeatures } from './pve-feature-extractor';
import type { HeuristicPriors } from './pve-heuristic-priors';

const BASE_LEARNED_WEIGHT = 0.60;
const BASE_HEURISTIC_WEIGHT = 0.40;
const MIN_SAMPLES_FOR_FULL_WEIGHT = 50;

export interface ConfidenceDegradation {
  dimension: string;
  factor: number;
  reason: string;
}

export interface BlendedPolicy {
  legalActions: string[];
  heuristicPriors: Record<string, number>;
  learnedPolicy: Record<string, number> | null;
  finalPolicy: Record<string, number>;
  confidence: number;
  sampleCount: number;
  learnedWeight: number;
  heuristicWeight: number;
  reasoning: string[];
  confidenceDegradations: ConfidenceDegradation[];
}

export function blendPolicies(
  legalActions: string[],
  heuristicPriors: HeuristicPriors,
  learnedPolicy: Record<string, number> | null,
  sampleCount: number,
  baseConfidence: number,
  features: StateFeatures,
): BlendedPolicy {
  const reasoning: string[] = [];
  const degradations: ConfidenceDegradation[] = [];
  let confidence = Math.max(0.1, baseConfidence);

  let learnedWeight = BASE_LEARNED_WEIGHT;
  let heuristicWeight = BASE_HEURISTIC_WEIGHT;

  if (sampleCount < MIN_SAMPLES_FOR_FULL_WEIGHT) {
    const ratio = sampleCount / MIN_SAMPLES_FOR_FULL_WEIGHT;
    learnedWeight = BASE_LEARNED_WEIGHT * ratio;
    heuristicWeight = 1.0 - learnedWeight;
    reasoning.push(`Low sample count (${sampleCount}/${MIN_SAMPLES_FOR_FULL_WEIGHT}): learned weight reduced to ${(learnedWeight * 100).toFixed(0)}%`);
    degradations.push({
      dimension: 'sample_count',
      factor: 0.5 + ratio * 0.5,
      reason: `Only ${sampleCount} of ${MIN_SAMPLES_FOR_FULL_WEIGHT} samples available`,
    });
    confidence *= 0.5 + ratio * 0.5;
  }

  if (!learnedPolicy) {
    learnedWeight = 0;
    heuristicWeight = 1.0;
    reasoning.push('No learned policy available: using heuristic priors only');
    degradations.push({
      dimension: 'no_learned_policy',
      factor: 0.7,
      reason: 'No learned policy profile exists — relying entirely on heuristic priors',
    });
    confidence *= 0.7;
  }

  const hasUnresolved = legalActions.some(a => a === 'Ominous Entrance');
  if (hasUnresolved) {
    confidence *= 0.7;
    reasoning.push('Unresolved ability present: confidence reduced by 30%');
    degradations.push({
      dimension: 'unresolved_ability',
      factor: 0.7,
      reason: 'Ominous Entrance has unknown effects — behavior model incomplete',
    });
  }

  if (features.enemyHpPercent === null) {
    confidence *= 0.8;
    reasoning.push('Missing enemy HP data: confidence reduced by 20%');
    degradations.push({
      dimension: 'missing_enemy_hp',
      factor: 0.8,
      reason: 'Enemy HP not available from telemetry',
    });
  }

  if (features.enemyMpPercent === null) {
    confidence *= 0.85;
    reasoning.push('Missing enemy MP data: confidence reduced by 15%');
    degradations.push({
      dimension: 'missing_enemy_mp',
      factor: 0.85,
      reason: 'Enemy MP not available — mana-gated ability legality uncertain',
    });
  }

  if (features.alliesAliveCount === null || features.enemiesAliveCount === null) {
    confidence *= 0.6;
    reasoning.push('Missing unit count telemetry: confidence significantly reduced');
    degradations.push({
      dimension: 'missing_unit_telemetry',
      factor: 0.6,
      reason: 'No live unit counts — state-dependent priors unreliable',
    });
  }

  if (features.channelingState) {
    reasoning.push('Enemy is channeling — action set constrained to channel resolution');
    degradations.push({
      dimension: 'channeling_active',
      factor: 0.9,
      reason: 'Enemy currently channeling — limited action prediction scope',
    });
    confidence *= 0.9;
  }

  if (features.activePassiveFlags.includes('hardboiled_active')) {
    reasoning.push('Hardboiled passive active — aggressive actions boosted');
  }

  if (features.activePassiveFlags.includes('resilient_active')) {
    reasoning.push('Resilient passive active — enemy recovering HP each turn');
  }

  if (features.alliesDeadCount > 0) {
    reasoning.push(`${features.alliesDeadCount} dead allies — Lay Egg / Nuzzle prioritized, Hardboiled may activate`);
  }

  if (Object.keys(features.lockoutState).length > 0) {
    const locked = Object.entries(features.lockoutState)
      .filter(([_, v]) => v > 0)
      .map(([k, v]) => `${k}(${v}t)`);
    if (locked.length > 0) {
      reasoning.push(`Lockouts active: ${locked.join(', ')}`);
    }
  }

  if (features.battleBudgetRemaining !== null && features.battleBudgetRemaining <= 3) {
    reasoning.push(`Low battle budget (${features.battleBudgetRemaining}) — consumable options limited`);
  }

  const finalPolicy: Record<string, number> = {};
  let total = 0;

  for (const action of legalActions) {
    const hProb = heuristicPriors[action] || (1.0 / legalActions.length);
    const lProb = learnedPolicy ? (learnedPolicy[action] || 0) : 0;

    finalPolicy[action] = heuristicWeight * hProb + learnedWeight * lProb;
    total += finalPolicy[action];
  }

  if (total > 0) {
    for (const action of legalActions) {
      finalPolicy[action] /= total;
    }
  }

  const topAction = Object.entries(finalPolicy).sort((a, b) => b[1] - a[1])[0];
  if (topAction) {
    reasoning.push(`Top predicted action: ${topAction[0]} (${(topAction[1] * 100).toFixed(0)}%)`);
  }

  return {
    legalActions,
    heuristicPriors: Object.fromEntries(legalActions.map(a => [a, heuristicPriors[a] || 0])),
    learnedPolicy,
    finalPolicy,
    confidence: Math.max(0, Math.min(1, confidence)),
    sampleCount,
    learnedWeight,
    heuristicWeight,
    reasoning,
    confidenceDegradations: degradations,
  };
}
