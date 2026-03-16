import type { BlendedPolicy } from './pve-policy-blender';
import type { LockoutState } from './pve-availability-engine';

const DEFAULT_SIMULATION_COUNT = 100;
const MIN_SIMULATIONS = 50;
const MAX_SIMULATIONS = 200;
const MAX_DEPTH = 4;
const TIME_BUDGET_MS = 400;

const SCORE_WEIGHTS = {
  survival: 0.35,
  kill: 0.25,
  damage: 0.20,
  control: 0.10,
  resource: 0.10,
};

export interface AbilityProfile {
  abilityName: string;
  formulaJson: Record<string, unknown> | null;
  manaCost: number;
  amnesiaTurns: number;
  effectsJson: Array<Record<string, unknown>> | null;
  range: string | null;
  specialRules: Record<string, unknown>;
  passiveFlag: boolean;
}

export interface SimulationCandidate {
  actionName: string;
  actionType: 'skill' | 'basic_attack' | 'health_vial' | 'mana_vial' | 'save_budget';
  manaCost: number;
  budgetCost: number;
}

export interface SimulationResult {
  candidate: SimulationCandidate;
  expectedDamage: number;
  expectedIncomingDamage: number;
  survivalProbability: number;
  killProbability: number;
  statusEffectValue: number;
  consumableValue: number;
  battleBudgetCost: number;
  expectedTurnsToWin: number;
  compositeScore: number;
  simulationCount: number;
  fallbackMode: boolean;
}

export interface TelemetryStats {
  ATK?: number;
  DEX?: number;
  STR?: number;
  INT?: number;
  WIS?: number;
  SPELL?: number;
  VIT?: number;
  END?: number;
  LCK?: number;
  AGI?: number;
  [key: string]: number | undefined;
}

export interface SimulationConfig {
  simulationCount?: number;
  timeBudgetMs?: number;
  maxDepth?: number;
  abilityProfiles?: AbilityProfile[];
  enemyTelemetryStats?: TelemetryStats;
  heroTelemetryStats?: TelemetryStats;
  heroDamageRange?: { min: number; max: number };
  enemyAlliesAlive?: number;
  enemyAlliesDead?: number;
  policyConfidence?: number;
}

interface StatusEffect {
  type: string;
  turnsRemaining: number;
  magnitude: number;
}

interface SimState {
  heroHp: number;
  heroMaxHp: number;
  heroMp: number;
  heroMaxMp: number;
  enemyHp: number;
  enemyMaxHp: number;
  enemyMp: number;
  turnsElapsed: number;
  survived: boolean;
  enemyKilled: boolean;
  totalDamageDealt: number;
  totalDamageTaken: number;
  statusEffectsApplied: number;
  budgetSpent: number;
  lockouts: LockoutState;
  heroStatusEffects: StatusEffect[];
  enemyStatusEffects: StatusEffect[];
  enemyChanneling: string | null;
  channelTurnsRemaining: number;
  enemyAlliesAlive: number;
  enemyAlliesDead: number;
  isExhausted: boolean;
  hardboiledActive: boolean;
  resilientActive: boolean;
}

function sampleAction(policy: Record<string, number>): string {
  const rand = Math.random();
  let cumulative = 0;
  for (const [action, prob] of Object.entries(policy)) {
    cumulative += prob;
    if (rand <= cumulative) return action;
  }
  const actions = Object.keys(policy);
  return actions[actions.length - 1] || 'basic_attack';
}

function applyConfidenceShaping(
  policy: Record<string, number>,
  confidence: number,
): Record<string, number> {
  const actions = Object.keys(policy);
  if (actions.length <= 1) return policy;

  const uniform = 1.0 / actions.length;

  const shaped: Record<string, number> = {};
  let total = 0;
  for (const action of actions) {
    const blended = confidence * (policy[action] || 0) + (1 - confidence) * uniform;
    shaped[action] = blended;
    total += blended;
  }

  if (total > 0) {
    for (const action of actions) {
      shaped[action] /= total;
    }
  }
  return shaped;
}

let _simulationDegraded = false;
const _degradationReasons: Set<string> = new Set();

export function isSimulationDegraded(): boolean {
  return _simulationDegraded;
}

export function getDegradationReasons(): string[] {
  return Array.from(_degradationReasons);
}

function addDegradationReason(reason: string): void {
  _simulationDegraded = true;
  _degradationReasons.add(reason);
}

function evaluateFormulaJson(
  formulaJson: Record<string, unknown> | null,
  telemetryStats?: TelemetryStats,
  variance: number = 0.15,
): number {
  if (!formulaJson) {
    addDegradationReason('missing_formula_json');
    return 0;
  }

  const base = formulaJson.base as string | undefined;
  if (!base || base === 'none') return 0;

  if (!telemetryStats) {
    addDegradationReason('missing_telemetry_stats');
    return 0;
  }

  const stats = telemetryStats;

  const scaling = formulaJson.scaling as Array<{ stat: string; coeff: number }> | undefined;
  if (scaling && scaling.length > 0) {
    let totalDamage = 0;
    let missingStats = false;
    for (const s of scaling) {
      const statKey = s.stat.toUpperCase();
      const statVal = stats[statKey];
      if (statVal === undefined) {
        addDegradationReason(`missing_stat_${statKey}`);
        missingStats = true;
        continue;
      }
      totalDamage += s.coeff * statVal;
    }
    if (totalDamage === 0 && missingStats) {
      return 0;
    }
    if (totalDamage === 0) return 0;
    return Math.round(totalDamage * (1 - variance + Math.random() * variance * 2));
  }

  if (typeof base === 'string') {
    const scalingMatch = base.match(/(\d+(?:\.\d+)?)\s*\*\s*(\w+)/);
    if (scalingMatch) {
      const coeff = parseFloat(scalingMatch[1]);
      const statKey = scalingMatch[2].toUpperCase();
      const statVal = stats[statKey];
      if (statVal === undefined) {
        addDegradationReason(`missing_stat_${statKey}`);
        return 0;
      }
      return Math.round(coeff * statVal * (1 - variance + Math.random() * variance * 2));
    }
  }

  addDegradationReason('unrecognized_formula_format');
  return 0;
}

function evaluateMultiHitFormula(
  formulaJson: Record<string, unknown> | null,
  enemyStats?: TelemetryStats,
): number {
  if (!formulaJson) return 0;
  const hits = formulaJson.hits as Array<Record<string, unknown>> | undefined;
  if (!hits || hits.length === 0) return evaluateFormulaJson(formulaJson, enemyStats);

  let totalDmg = 0;
  for (const hit of hits) {
    totalDmg += evaluateFormulaJson(hit, enemyStats, 0.20);
  }
  return totalDmg;
}

interface EnemyActionResult {
  damage: number;
  statusEffects: Array<{ type: string; chance: number; applied: boolean; duration: number }>;
  healAmount: number;
  selfExhausted: boolean;
  channelStarted: string | null;
  channelTurns: number;
  eggsTransformed: number;
  selfBuffs: Array<{ type: string; value: number; duration: number }>;
}

function simulateEnemyAction(
  actionName: string,
  profiles: AbilityProfile[],
  state: SimState,
  enemyStats?: TelemetryStats,
): EnemyActionResult {
  const result: EnemyActionResult = {
    damage: 0,
    statusEffects: [],
    healAmount: 0,
    selfExhausted: false,
    channelStarted: null,
    channelTurns: 0,
    eggsTransformed: 0,
    selfBuffs: [],
  };

  const profile = profiles.find(p => p.abilityName === actionName);
  if (!profile) {
    result.damage = evaluateFormulaJson(null, enemyStats);
    return result;
  }

  if (profile.passiveFlag) return result;

  const isHeal = (profile.formulaJson?.type as string) === 'heal';

  if (isHeal) {
    result.healAmount = evaluateFormulaJson(profile.formulaJson, enemyStats);
    return result;
  }

  const hasChanneling = profile.specialRules?.channel as number | undefined;
  if (hasChanneling && hasChanneling > 0) {
    result.channelStarted = actionName;
    result.channelTurns = hasChanneling;
    return result;
  }

  const hasMultiHit = (profile.formulaJson?.hits as unknown[])?.length > 0;
  result.damage = hasMultiHit
    ? evaluateMultiHitFormula(profile.formulaJson, enemyStats)
    : evaluateFormulaJson(profile.formulaJson, enemyStats);

  if (state.hardboiledActive) {
    result.damage = Math.round(result.damage * 1.10);
  }

  if (profile.effectsJson && profile.effectsJson.length > 0) {
    for (const eff of profile.effectsJson) {
      const effType = eff.type as string;
      if (!effType) continue;

      if (eff.target === 'self' || eff.target === 'allies' || eff.target === 'party') {
        const val = (eff.value as number) || 0;
        const dur = (eff.duration as number) || 2;
        result.selfBuffs.push({ type: effType, value: val, duration: dur });
        continue;
      }

      if (effType === 'Exhausted' && eff.target === 'self') {
        result.selfExhausted = true;
        continue;
      }

      if (effType === 'Transform') {
        result.eggsTransformed = Math.min(state.enemyAlliesDead, 2);
        continue;
      }

      const chance = (eff.chance as number) || 0.3;
      const duration = (eff.duration as number) || 2;
      const applied = Math.random() < chance;
      result.statusEffects.push({ type: effType, chance, applied, duration });
    }
  }

  if (profile.specialRules?.self_exhausted) {
    result.selfExhausted = true;
  }

  return result;
}

function simulateHeroDamage(candidate: SimulationCandidate, heroDamageRange?: { min: number; max: number }): number {
  if (candidate.actionType === 'health_vial' || candidate.actionType === 'mana_vial' || candidate.actionType === 'save_budget') {
    return 0;
  }
  if (!heroDamageRange) {
    addDegradationReason('missing_hero_damage_range');
    return 0;
  }
  return Math.round(heroDamageRange.min + Math.random() * (heroDamageRange.max - heroDamageRange.min));
}

function advanceLockouts(lockouts: LockoutState): LockoutState {
  const next: LockoutState = {};
  for (const [key, val] of Object.entries(lockouts)) {
    if (val > 1) next[key] = val - 1;
  }
  return next;
}

function applyAmnesiaFromAction(lockouts: LockoutState, actionName: string, profiles: AbilityProfile[]): LockoutState {
  const newLockouts = { ...lockouts };
  const profile = profiles.find(p => p.abilityName === actionName);
  if (profile) {
    if (profile.amnesiaTurns > 0) {
      newLockouts[actionName] = profile.amnesiaTurns;
    }
    const crossLockout = profile.specialRules?.cross_ability_lockout as
      { target_ability: string; amnesia_applied: number } | undefined;
    if (crossLockout) {
      newLockouts[crossLockout.target_ability] = crossLockout.amnesia_applied;
    }
  }
  return newLockouts;
}

function isActionAvailable(actionName: string, lockouts: LockoutState, profiles: AbilityProfile[], currentMp?: number): boolean {
  if (lockouts[actionName] && lockouts[actionName] > 0) return false;
  const profile = profiles.find(p => p.abilityName === actionName);
  if (profile?.passiveFlag) return false;
  if (profile && currentMp !== undefined && profile.manaCost > 0 && currentMp < profile.manaCost) return false;
  return true;
}

function filterPolicyByAvailability(
  policy: Record<string, number>,
  lockouts: LockoutState,
  profiles: AbilityProfile[],
  currentMp?: number,
): Record<string, number> {
  const filtered: Record<string, number> = {};
  let total = 0;
  for (const [action, prob] of Object.entries(policy)) {
    if (isActionAvailable(action, lockouts, profiles, currentMp)) {
      filtered[action] = prob;
      total += prob;
    }
  }
  if (total === 0) return policy;
  for (const key of Object.keys(filtered)) {
    filtered[key] /= total;
  }
  return filtered;
}

function tickStatusEffects(effects: StatusEffect[]): StatusEffect[] {
  return effects
    .map(e => ({ ...e, turnsRemaining: e.turnsRemaining - 1 }))
    .filter(e => e.turnsRemaining > 0);
}

function applyBleedDamage(effects: StatusEffect[]): number {
  const bleeds = effects.filter(e => e.type === 'Bleed');
  return bleeds.reduce((acc, b) => acc + Math.round(b.magnitude), 0);
}

function applyPassiveRecovery(state: SimState, profiles: AbilityProfile[]): void {
  const resilientProfile = profiles.find(p => p.abilityName === 'Resilient' && p.passiveFlag);
  if (!resilientProfile) return;

  const triggerDebuffs = ['blind', 'poison', 'burn', 'chill'];
  const hasTriggering = state.enemyStatusEffects.some(e =>
    triggerDebuffs.some(d => e.type.toLowerCase().includes(d))
  );

  if (hasTriggering) {
    state.resilientActive = true;
    const recovery = Math.round(state.enemyMaxHp * 0.05);
    state.enemyHp = Math.min(state.enemyMaxHp, state.enemyHp + recovery);
  } else {
    state.resilientActive = false;
  }
}

function checkHardboiledActivation(state: SimState): void {
  const isTaunted = state.enemyStatusEffects.some(e => e.type === 'Taunt');
  state.hardboiledActive = isTaunted || state.enemyAlliesDead > 0;
}

function resolveChanneling(state: SimState, profiles: AbilityProfile[], enemyStats?: TelemetryStats): number {
  if (!state.enemyChanneling || state.channelTurnsRemaining > 0) {
    if (state.channelTurnsRemaining > 0) state.channelTurnsRemaining--;
    return 0;
  }

  const profile = profiles.find(p => p.abilityName === state.enemyChanneling);
  if (!profile) {
    state.enemyChanneling = null;
    return 0;
  }

  const damage = evaluateFormulaJson(profile.formulaJson, enemyStats);
  state.enemyChanneling = null;

  if (profile.effectsJson) {
    for (const eff of profile.effectsJson) {
      const effType = eff.type as string;
      if (!effType || effType === 'Exhausted') continue;
      if (eff.target === 'self' || eff.target === 'allies' || eff.target === 'party') continue;
      const chance = (eff.chance as number) || 0.3;
      if (Math.random() < chance) {
        state.heroStatusEffects.push({
          type: effType,
          turnsRemaining: (eff.duration as number) || 2,
          magnitude: (eff.value as number) || 0,
        });
      }
    }
  }

  if (profile.specialRules?.self_exhausted) {
    state.isExhausted = true;
  }

  return damage;
}

function runSingleSimulation(
  candidate: SimulationCandidate,
  enemyPolicy: Record<string, number>,
  initialState: SimState,
  maxDepth: number,
  abilityProfiles: AbilityProfile[],
  enemyStats?: TelemetryStats,
  heroDamageRange?: { min: number; max: number },
): SimState {
  const state: SimState = {
    ...initialState,
    lockouts: { ...initialState.lockouts },
    heroStatusEffects: [...initialState.heroStatusEffects],
    enemyStatusEffects: [...initialState.enemyStatusEffects],
  };

  checkHardboiledActivation(state);

  if (candidate.actionType === 'health_vial') {
    state.heroHp = Math.min(state.heroMaxHp, state.heroHp + Math.round(state.heroMaxHp * 0.35));
    state.budgetSpent += candidate.budgetCost;
  } else if (candidate.actionType === 'mana_vial') {
    state.heroMp = Math.min(state.heroMaxMp, state.heroMp + Math.round(state.heroMaxMp * 0.35));
    state.budgetSpent += candidate.budgetCost;
  } else if (candidate.actionType !== 'save_budget') {
    const dmg = simulateHeroDamage(candidate, heroDamageRange);
    state.totalDamageDealt += dmg;
    state.enemyHp -= dmg;
    state.heroMp = Math.max(0, state.heroMp - candidate.manaCost);
  }

  if (state.enemyHp <= 0) {
    state.enemyKilled = true;
    return state;
  }

  for (let turn = 0; turn < maxDepth && state.survived && !state.enemyKilled; turn++) {
    state.lockouts = advanceLockouts(state.lockouts);

    const bleedDmg = applyBleedDamage(state.heroStatusEffects);
    state.heroHp -= bleedDmg;
    state.totalDamageTaken += bleedDmg;
    if (state.heroHp <= 0) { state.survived = false; break; }

    const enemyBleedDmg = applyBleedDamage(state.enemyStatusEffects);
    state.enemyHp -= enemyBleedDmg;
    state.totalDamageDealt += enemyBleedDmg;
    if (state.enemyHp <= 0) { state.enemyKilled = true; break; }

    applyPassiveRecovery(state, abilityProfiles);
    checkHardboiledActivation(state);

    const channelDmg = resolveChanneling(state, abilityProfiles, enemyStats);
    if (channelDmg > 0) {
      state.totalDamageTaken += channelDmg;
      state.heroHp -= channelDmg;
      if (state.heroHp <= 0) { state.survived = false; break; }
    }

    if (!state.enemyChanneling && !state.isExhausted) {
      const availablePolicy = filterPolicyByAvailability(enemyPolicy, state.lockouts, abilityProfiles, state.enemyMp);
      const enemyAction = sampleAction(availablePolicy);
      const actionResult = simulateEnemyAction(enemyAction, abilityProfiles, state, enemyStats);

      const usedProfile = abilityProfiles.find(p => p.abilityName === enemyAction);
      if (usedProfile && usedProfile.manaCost > 0) {
        state.enemyMp = Math.max(0, state.enemyMp - usedProfile.manaCost);
      }

      state.lockouts = applyAmnesiaFromAction(state.lockouts, enemyAction, abilityProfiles);

      if (actionResult.channelStarted) {
        state.enemyChanneling = actionResult.channelStarted;
        state.channelTurnsRemaining = actionResult.channelTurns;
      } else {
        if (actionResult.healAmount > 0) {
          state.enemyHp = Math.min(state.enemyMaxHp, state.enemyHp + actionResult.healAmount);
        }

        state.totalDamageTaken += actionResult.damage;
        state.heroHp -= actionResult.damage;

        for (const eff of actionResult.statusEffects) {
          if (eff.applied) {
            state.heroStatusEffects.push({
              type: eff.type,
              turnsRemaining: eff.duration,
              magnitude: eff.type === 'Bleed' ? Math.round(state.heroMaxHp * 0.03) : 0,
            });
            state.statusEffectsApplied++;
          }
        }

        if (actionResult.selfExhausted) {
          state.isExhausted = true;
        }

        if (actionResult.eggsTransformed > 0) {
          state.enemyAlliesDead = Math.max(0, state.enemyAlliesDead - actionResult.eggsTransformed);
          state.enemyAlliesAlive += actionResult.eggsTransformed;
        }
      }
    } else if (state.isExhausted) {
      state.isExhausted = false;
    }

    state.turnsElapsed++;

    if (state.heroHp <= 0) {
      state.survived = false;
      break;
    }

    const heroDmg = simulateHeroDamage(candidate, heroDamageRange);
    state.totalDamageDealt += heroDmg;
    state.enemyHp -= heroDmg;
    state.turnsElapsed++;

    if (state.enemyHp <= 0) {
      state.enemyKilled = true;
      break;
    }

    state.heroStatusEffects = tickStatusEffects(state.heroStatusEffects);
    state.enemyStatusEffects = tickStatusEffects(state.enemyStatusEffects);
  }

  return state;
}

export function runMonteCarloSimulation(
  candidates: SimulationCandidate[],
  enemyPolicy: BlendedPolicy,
  heroHp: number,
  heroMaxHp: number,
  heroMp: number,
  heroMaxMp: number,
  enemyHp: number,
  enemyMaxHp: number,
  enemyMp: number,
  battleBudgetRemaining: number | null,
  config?: SimulationConfig,
): SimulationResult[] {
  _simulationDegraded = false;
  _degradationReasons.clear();
  const simCount = Math.max(MIN_SIMULATIONS, Math.min(MAX_SIMULATIONS, config?.simulationCount || DEFAULT_SIMULATION_COUNT));
  const timeBudget = config?.timeBudgetMs || TIME_BUDGET_MS;
  const maxDepth = config?.maxDepth || MAX_DEPTH;
  const profiles = config?.abilityProfiles || [];
  const enemyStats = config?.enemyTelemetryStats;
  const heroDmgRange = config?.heroDamageRange;
  const initialEnemyAlliesAlive = config?.enemyAlliesAlive ?? 0;
  const initialEnemyAlliesDead = config?.enemyAlliesDead ?? 0;
  const policyConfidence = config?.policyConfidence ?? 1.0;
  const shapedPolicy = applyConfidenceShaping(enemyPolicy.finalPolicy, policyConfidence);
  const startTime = Date.now();
  const results: SimulationResult[] = [];
  let fallbackMode = false;

  for (const candidate of candidates) {
    if (Date.now() - startTime > timeBudget) {
      fallbackMode = true;
      const deterministicScore = computeDeterministicScore(candidate, heroHp, heroMaxHp, enemyHp, enemyMaxHp, battleBudgetRemaining);
      results.push({
        candidate,
        expectedDamage: 0,
        expectedIncomingDamage: 0,
        survivalProbability: 0.5,
        killProbability: 0,
        statusEffectValue: 0,
        consumableValue: candidate.actionType === 'health_vial' || candidate.actionType === 'mana_vial' ? 0.3 : 0,
        battleBudgetCost: candidate.budgetCost,
        expectedTurnsToWin: 10,
        compositeScore: deterministicScore,
        simulationCount: 0,
        fallbackMode: true,
      });
      continue;
    }

    let totalSurvived = 0;
    let totalKilled = 0;
    let totalDmg = 0;
    let totalIncoming = 0;
    let totalStatus = 0;
    let totalTurns = 0;
    let actualSimCount = 0;

    for (let i = 0; i < simCount; i++) {
      if (Date.now() - startTime > timeBudget) break;

      _simulationDegraded = false;

      const initialState: SimState = {
        heroHp, heroMaxHp, heroMp, heroMaxMp,
        enemyHp, enemyMaxHp, enemyMp,
        turnsElapsed: 0,
        survived: true,
        enemyKilled: false,
        totalDamageDealt: 0,
        totalDamageTaken: 0,
        statusEffectsApplied: 0,
        budgetSpent: 0,
        lockouts: {},
        heroStatusEffects: [],
        enemyStatusEffects: [],
        enemyChanneling: null,
        channelTurnsRemaining: 0,
        enemyAlliesAlive: initialEnemyAlliesAlive,
        enemyAlliesDead: initialEnemyAlliesDead,
        isExhausted: false,
        hardboiledActive: false,
        resilientActive: false,
      };

      const result = runSingleSimulation(candidate, shapedPolicy, initialState, maxDepth, profiles, enemyStats, heroDmgRange);
      if (result.survived) totalSurvived++;
      if (result.enemyKilled) totalKilled++;
      totalDmg += result.totalDamageDealt;
      totalIncoming += result.totalDamageTaken;
      totalStatus += result.statusEffectsApplied;
      totalTurns += result.turnsElapsed;
      actualSimCount++;
    }

    const n = Math.max(1, actualSimCount);
    const survivalProb = totalSurvived / n;
    const killProb = totalKilled / n;
    const avgDmg = totalDmg / n;
    const avgIncoming = totalIncoming / n;
    const avgTurns = totalTurns / n;
    const statusVal = totalStatus / n;

    const normSurvival = survivalProb;
    const normKill = killProb;
    const normDamage = Math.min(1, avgDmg / Math.max(1, enemyMaxHp));
    const normControl = Math.min(1, statusVal / 2);
    const normResource = candidate.budgetCost === 0 ? 0.5 :
      battleBudgetRemaining !== null ? Math.max(0, 1 - candidate.budgetCost / Math.max(1, battleBudgetRemaining)) : 0.3;

    const consumableValue = candidate.actionType === 'health_vial'
      ? Math.max(0, 1 - heroHp / heroMaxHp)
      : candidate.actionType === 'mana_vial'
        ? Math.max(0, 1 - heroMp / heroMaxMp) * 0.7
        : 0;

    const compositeScore =
      SCORE_WEIGHTS.survival * normSurvival +
      SCORE_WEIGHTS.kill * normKill +
      SCORE_WEIGHTS.damage * normDamage +
      SCORE_WEIGHTS.control * normControl +
      SCORE_WEIGHTS.resource * normResource;

    results.push({
      candidate,
      expectedDamage: Math.round(avgDmg),
      expectedIncomingDamage: Math.round(avgIncoming),
      survivalProbability: Math.round(survivalProb * 100) / 100,
      killProbability: Math.round(killProb * 100) / 100,
      statusEffectValue: Math.round(statusVal * 100) / 100,
      consumableValue: Math.round(consumableValue * 100) / 100,
      battleBudgetCost: candidate.budgetCost,
      expectedTurnsToWin: Math.round(avgTurns * 10) / 10,
      compositeScore: Math.round(compositeScore * 1000) / 1000,
      simulationCount: actualSimCount,
      fallbackMode: false,
    });
  }

  results.sort((a, b) => b.compositeScore - a.compositeScore);
  return results;
}

function computeDeterministicScore(
  candidate: SimulationCandidate,
  heroHp: number,
  heroMaxHp: number,
  enemyHp: number,
  enemyMaxHp: number,
  battleBudgetRemaining: number | null,
): number {
  if (candidate.actionType === 'health_vial') {
    return heroHp / heroMaxHp < 0.4 ? 0.7 : 0.3;
  }
  if (candidate.actionType === 'mana_vial') {
    return 0.35;
  }
  if (candidate.actionType === 'save_budget') {
    return 0.2;
  }
  const hpRatio = enemyHp / Math.max(1, enemyMaxHp);
  return 0.5 + (1 - hpRatio) * 0.2;
}
