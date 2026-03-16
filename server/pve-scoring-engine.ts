import { type EnemyEntry, getEnemyDamagePerTurn } from './pve-enemy-catalog';

export interface HeroState {
  heroId: string;
  slot: number;
  mainClass: string;
  level: number;
  currentHp: number;
  maxHp: number;
  currentMp: number;
  maxMp: number;
  stats: {
    str: number;
    dex: number;
    agi: number;
    int: number;
    wis: number;
    vit: number;
    end: number;
    lck: number;
  };
  active1: string | null;
  active2: string | null;
  passive1: string | null;
  passive2: string | null;
  buffs: string[];
  debuffs: string[];
  isAlive: boolean;
}

export interface EnemyState {
  enemyId: string;
  currentHp: number;
  maxHp: number;
  currentMp: number;
  buffs: string[];
  debuffs: string[];
}

export interface BattleState {
  turnNumber: number;
  activeHeroSlot: number;
  heroes: HeroState[];
  enemies: EnemyState[];
  enemy: EnemyEntry;
}

export interface Recommendation {
  rank: number;
  action: string;
  skillName: string;
  targetType: string;
  targetSlot: number | null;
  damageEv: number;
  killChance: number;
  survivalDelta: number;
  debuffValue: number;
  manaEfficiency: number;
  totalScore: number;
  reasoning: string;
}

interface AbilityFormula {
  type: 'physical_damage' | 'magical_damage' | 'heal' | 'buff' | 'debuff' | 'cc' | 'passive';
  manaCost: number;
  formulaFn: (stats: { str: number; dex: number; agi: number; int: number; wis: number; vit: number; end: number; lck: number }) => number;
  ccType: string | null;
  targetType: 'single_enemy' | 'aoe_enemy' | 'single_ally' | 'self' | 'aoe_ally';
}

const ABILITY_FORMULAS: Record<string, AbilityFormula> = {
  'Poisoned Blade': { type: 'physical_damage', manaCost: 20, formulaFn: (s) => 0.5 * (s.str + s.dex) + 0.5 * s.dex, ccType: 'poison', targetType: 'single_enemy' },
  'Blinding Winds': { type: 'physical_damage', manaCost: 15, formulaFn: (s) => 0.75 * (s.str + s.dex) + 0.5 * s.agi, ccType: null, targetType: 'single_enemy' },
  'Heal': { type: 'heal', manaCost: 25, formulaFn: (s) => 1.0 * s.int + 1.5 * s.wis + 0.5 * s.vit, ccType: null, targetType: 'single_ally' },
  'Cleanse': { type: 'buff', manaCost: 15, formulaFn: () => 0, ccType: null, targetType: 'single_ally' },
  'Iron Skin': { type: 'buff', manaCost: 20, formulaFn: () => 0, ccType: null, targetType: 'self' },
  'Speed': { type: 'buff', manaCost: 15, formulaFn: () => 0, ccType: null, targetType: 'self' },
  'Critical Aim': { type: 'buff', manaCost: 15, formulaFn: () => 0, ccType: null, targetType: 'self' },
  'Deathmark': { type: 'debuff', manaCost: 20, formulaFn: () => 0, ccType: 'deathmark', targetType: 'single_enemy' },
  'Exhaust': { type: 'cc', manaCost: 30, formulaFn: () => 0, ccType: 'exhaust', targetType: 'single_enemy' },
  'Daze': { type: 'cc', manaCost: 25, formulaFn: () => 0, ccType: 'daze', targetType: 'single_enemy' },
  'Explosion': { type: 'magical_damage', manaCost: 35, formulaFn: (s) => 1.5 * (s.int + s.wis) + 0.5 * s.int, ccType: null, targetType: 'aoe_enemy' },
  'Hardened Shield': { type: 'buff', manaCost: 25, formulaFn: () => 0, ccType: null, targetType: 'aoe_ally' },
  'Stun': { type: 'cc', manaCost: 35, formulaFn: () => 0, ccType: 'stun', targetType: 'single_enemy' },
  'Second Wind': { type: 'heal', manaCost: 40, formulaFn: (s) => s.vit * 0.5, ccType: null, targetType: 'self' },
  'Resurrection': { type: 'heal', manaCost: 60, formulaFn: (s) => s.vit * 0.3, ccType: null, targetType: 'single_ally' },
};

const BASIC_ATTACK: AbilityFormula = {
  type: 'physical_damage',
  manaCost: 0,
  formulaFn: (s) => 0.8 * s.str + 0.3 * s.dex,
  ccType: null,
  targetType: 'single_enemy',
};

const SCORE_WEIGHTS = {
  damageEv: 0.35,
  killChance: 0.25,
  survivalDelta: 0.20,
  debuffValue: 0.10,
  manaEfficiency: 0.10,
};

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function computePhysicalDamage(rawDmg: number, enemyDef: number): number {
  const reduction = enemyDef / (enemyDef + 100);
  return Math.max(1, Math.round(rawDmg * (1 - reduction)));
}

function computeMagicalDamage(rawDmg: number, enemyMdef: number): number {
  const reduction = enemyMdef / (enemyMdef + 80);
  return Math.max(1, Math.round(rawDmg * (1 - reduction)));
}

function computeHealValue(rawHeal: number): number {
  return Math.round(rawHeal);
}

function computeKillChance(damage: number, enemyCurrentHp: number): number {
  if (damage >= enemyCurrentHp) return 1.0;
  if (damage <= 0) return 0;
  const ratio = damage / enemyCurrentHp;
  return clamp(ratio * ratio, 0, 0.99);
}

function computeSurvivalDelta(hero: HeroState, enemy: EnemyEntry, actionType: string): number {
  const enemyDpt = getEnemyDamagePerTurn(enemy);
  const turnsToKillHero = hero.currentHp / Math.max(1, enemyDpt - hero.stats.end * 0.5);
  if (actionType === 'heal' || actionType === 'buff') return 0.3;
  if (actionType === 'cc') return 0.5;
  const hpPercent = hero.currentHp / hero.maxHp;
  if (hpPercent < 0.3) return -0.2;
  return clamp(turnsToKillHero / 10, -1, 1) * 0.1;
}

function computeDebuffValue(ccType: string | null, enemy: EnemyEntry, enemyState: EnemyState): number {
  if (!ccType) return 0;
  const resistance = enemy.resistances[ccType as keyof typeof enemy.resistances] || 0;
  const successChance = 1 - resistance;
  const alreadyApplied = enemyState.debuffs.includes(ccType);
  const baseValue: Record<string, number> = {
    stun: 1.0,
    daze: 0.6,
    exhaust: 0.5,
    poison: 0.4,
    deathmark: 0.7,
  };
  const value = (baseValue[ccType] || 0.3) * successChance;
  return alreadyApplied ? value * 0.3 : value;
}

function computeManaEfficiency(damage: number, manaCost: number, heroMp: number): number {
  if (manaCost === 0) return 0.5;
  if (heroMp < manaCost) return -1;
  const ratio = damage / Math.max(1, manaCost);
  return clamp(ratio / 10, 0, 1);
}

function enumerateActions(hero: HeroState): Array<{ skillName: string; formula: AbilityFormula }> {
  const actions: Array<{ skillName: string; formula: AbilityFormula }> = [];
  actions.push({ skillName: 'Basic Attack', formula: BASIC_ATTACK });
  const skills = [hero.active1, hero.active2];
  for (const skillName of skills) {
    if (!skillName) continue;
    const formula = ABILITY_FORMULAS[skillName];
    if (formula && formula.type !== 'passive') {
      actions.push({ skillName, formula });
    }
  }
  return actions;
}

function getTargetSlots(formula: AbilityFormula, heroes: HeroState[], enemies: EnemyState[]): Array<{ slot: number | null; targetType: string }> {
  switch (formula.targetType) {
    case 'single_enemy':
      return enemies.map((_, i) => ({ slot: i, targetType: 'enemy' }));
    case 'aoe_enemy':
      return [{ slot: null, targetType: 'all_enemies' }];
    case 'single_ally':
      return heroes.filter(h => h.isAlive).map(h => ({ slot: h.slot, targetType: 'ally' }));
    case 'self':
      return [{ slot: null, targetType: 'self' }];
    case 'aoe_ally':
      return [{ slot: null, targetType: 'all_allies' }];
    default:
      return [{ slot: null, targetType: 'unknown' }];
  }
}

export function scoreActions(state: BattleState): Recommendation[] {
  const hero = state.heroes.find(h => h.slot === state.activeHeroSlot);
  if (!hero || !hero.isAlive) return [];

  const actions = enumerateActions(hero);
  const recommendations: Recommendation[] = [];

  for (const { skillName, formula } of actions) {
    if (formula.manaCost > hero.currentMp && formula.manaCost > 0) continue;

    const targets = getTargetSlots(formula, state.heroes, state.enemies);

    for (const target of targets) {
      let damageEv = 0;
      let killChance = 0;
      let reasoning = '';

      const rawValue = formula.formulaFn(hero.stats);

      if (formula.type === 'physical_damage') {
        damageEv = computePhysicalDamage(rawValue, state.enemy.def);
        if (target.slot !== null && state.enemies[target.slot]) {
          killChance = computeKillChance(damageEv, state.enemies[target.slot].currentHp);
          reasoning = `Deals ~${damageEv} physical damage to enemy slot ${target.slot} (${state.enemies[target.slot].currentHp} HP remaining)`;
        } else {
          reasoning = `Deals ~${damageEv} physical damage`;
        }
      } else if (formula.type === 'magical_damage') {
        damageEv = computeMagicalDamage(rawValue, state.enemy.mdef);
        if (formula.targetType === 'aoe_enemy') {
          const totalDmg = damageEv * state.enemies.length;
          damageEv = totalDmg;
          reasoning = `Deals ~${Math.round(totalDmg / state.enemies.length)} magical damage to each of ${state.enemies.length} enemies`;
          killChance = Math.max(...state.enemies.map(e => computeKillChance(Math.round(totalDmg / state.enemies.length), e.currentHp)));
        } else if (target.slot !== null && state.enemies[target.slot]) {
          killChance = computeKillChance(damageEv, state.enemies[target.slot].currentHp);
          reasoning = `Deals ~${damageEv} magical damage`;
        }
      } else if (formula.type === 'heal') {
        const healAmt = computeHealValue(rawValue);
        if (formula.targetType === 'self') {
          const missing = hero.maxHp - hero.currentHp;
          damageEv = Math.min(healAmt + hero.maxHp * 0.5, missing);
          reasoning = `Heals self for ~${Math.round(damageEv)} HP (${Math.round(hero.currentHp / hero.maxHp * 100)}% HP)`;
        } else if (target.slot !== null) {
          const ally = state.heroes.find(h => h.slot === target.slot);
          if (ally) {
            const missing = ally.maxHp - ally.currentHp;
            damageEv = Math.min(healAmt, missing);
            reasoning = `Heals ally slot ${target.slot} for ~${Math.round(damageEv)} HP (${Math.round(ally.currentHp / ally.maxHp * 100)}% HP)`;
          }
        }
      } else if (formula.type === 'buff') {
        damageEv = 0;
        reasoning = `Applies ${skillName} buff`;
      } else if (formula.type === 'cc' || formula.type === 'debuff') {
        damageEv = 0;
        reasoning = `Applies ${formula.ccType || skillName} to enemy`;
      }

      const survivalDelta = computeSurvivalDelta(hero, state.enemy, formula.type);
      const primaryEnemy = state.enemies[0] || { debuffs: [] } as EnemyState;
      const debuffValue = computeDebuffValue(formula.ccType, state.enemy, primaryEnemy);
      const manaEfficiency = computeManaEfficiency(damageEv, formula.manaCost, hero.currentMp);

      const maxDmg = hero.maxHp * 2;
      const normDamage = clamp(damageEv / maxDmg, 0, 1);
      const normKill = killChance;
      const normSurvival = clamp((survivalDelta + 1) / 2, 0, 1);
      const normDebuff = debuffValue;
      const normMana = clamp((manaEfficiency + 1) / 2, 0, 1);

      const totalScore =
        SCORE_WEIGHTS.damageEv * normDamage +
        SCORE_WEIGHTS.killChance * normKill +
        SCORE_WEIGHTS.survivalDelta * normSurvival +
        SCORE_WEIGHTS.debuffValue * normDebuff +
        SCORE_WEIGHTS.manaEfficiency * normMana;

      const healPriority = formula.type === 'heal' && hero.currentHp / hero.maxHp < 0.3 ? 0.3 : 0;
      const ccPriority = (formula.type === 'cc' && formula.ccType === 'stun' && !primaryEnemy.debuffs.includes('stun')) ? 0.15 : 0;

      recommendations.push({
        rank: 0,
        action: `${skillName}${target.slot !== null ? ` → ${target.targetType} ${target.slot}` : ''}`,
        skillName,
        targetType: target.targetType,
        targetSlot: target.slot,
        damageEv: Math.round(damageEv),
        killChance: Math.round(killChance * 100) / 100,
        survivalDelta: Math.round(survivalDelta * 100) / 100,
        debuffValue: Math.round(debuffValue * 100) / 100,
        manaEfficiency: Math.round(manaEfficiency * 100) / 100,
        totalScore: Math.round((totalScore + healPriority + ccPriority) * 1000) / 1000,
        reasoning,
      });
    }
  }

  recommendations.sort((a, b) => b.totalScore - a.totalScore);
  recommendations.forEach((r, i) => { r.rank = i + 1; });

  return recommendations;
}

export function buildBattleStateFromTurnEvents(
  heroes: HeroState[],
  enemyEntry: EnemyEntry,
  turnEvents: Array<{
    turnNumber: number;
    actorSide: string;
    actorSlot: number;
    skillId?: string;
    targets?: Array<{ slot: number; hpBefore: number; hpAfter: number; damage: number }>;
    hpState?: Record<string, { current: number; max: number }>;
    mpState?: Record<string, { current: number; max: number }>;
    effects?: Array<{ type: string; target: string; value: number }>;
  }>,
  activeHeroSlot: number
): BattleState {
  const latestHpState = turnEvents.length > 0 ? turnEvents[turnEvents.length - 1].hpState : null;
  const latestMpState = turnEvents.length > 0 ? turnEvents[turnEvents.length - 1].mpState : null;

  if (latestHpState) {
    for (const hero of heroes) {
      const key = `hero_${hero.slot}`;
      if (latestHpState[key]) {
        hero.currentHp = latestHpState[key].current;
        hero.maxHp = latestHpState[key].max;
        hero.isAlive = hero.currentHp > 0;
      }
    }
  }

  if (latestMpState) {
    for (const hero of heroes) {
      const key = `hero_${hero.slot}`;
      if (latestMpState[key]) {
        hero.currentMp = latestMpState[key].current;
        hero.maxMp = latestMpState[key].max;
      }
    }
  }

  const enemyHpKey = 'enemy_0';
  const enemyCurrentHp = latestHpState && latestHpState[enemyHpKey]
    ? latestHpState[enemyHpKey].current
    : enemyEntry.hp;

  const enemyDebuffs: string[] = [];
  for (const event of turnEvents) {
    if (event.effects) {
      for (const effect of event.effects) {
        if (effect.target.startsWith('enemy') && !enemyDebuffs.includes(effect.type)) {
          enemyDebuffs.push(effect.type);
        }
      }
    }
  }

  return {
    turnNumber: turnEvents.length > 0 ? turnEvents[turnEvents.length - 1].turnNumber : 0,
    activeHeroSlot,
    heroes,
    enemies: [{
      enemyId: enemyEntry.id,
      currentHp: enemyCurrentHp,
      maxHp: enemyEntry.hp,
      currentMp: enemyEntry.mp,
      buffs: [],
      debuffs: enemyDebuffs,
    }],
    enemy: enemyEntry,
  };
}
