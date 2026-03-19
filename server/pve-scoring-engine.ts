import { type EnemyEntry, getEnemyDamagePerTurn } from './pve-enemy-catalog';
import {
  getAbilityByName,
  getActiveAbilitiesForClass,
  getAllConsumables,
  evaluateFormula,
  inferAbilityType,
  mapTargetType,
  getInitiativePenaltyScore,
  isHighVarianceAbility,
  getConsumableSurvivalLift,
  type MasterAbility,
  type MasterConsumable,
  type StatBlock,
} from './pve-master-data';

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
  combatStats?: {
    attack?: number;
    spell?: number;
    speed?: number;
  };
  arcanePower?: number;
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
  battleBudgetRemaining?: number | null;
  consumableQuantities?: Record<string, number>;
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
  initiativePenalty: number;
  totalScore: number;
  reasoning: string;
  highVariance?: boolean;
}

const SCORE_WEIGHTS = {
  damageEv: 0.30,
  killChance: 0.25,
  survivalDelta: 0.20,
  debuffValue: 0.10,
  manaEfficiency: 0.08,
  initiativeValue: 0.07,
};

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function buildStatBlock(hero: HeroState): StatBlock {
  return {
    str: hero.stats.str,
    dex: hero.stats.dex,
    agi: hero.stats.agi,
    int: hero.stats.int,
    wis: hero.stats.wis,
    vit: hero.stats.vit,
    end: hero.stats.end,
    lck: hero.stats.lck,
    attack: hero.combatStats?.attack,
    spell: hero.combatStats?.spell,
    speed: hero.combatStats?.speed,
    ap: hero.arcanePower ?? 0,
  };
}

function computePhysicalDamage(rawDmg: number, enemyDef: number): number {
  const reduction = enemyDef / (enemyDef + 100);
  return Math.max(1, Math.round(rawDmg * (1 - reduction)));
}

function computeMagicalDamage(rawDmg: number, enemyMdef: number): number {
  const reduction = enemyMdef / (enemyMdef + 80);
  return Math.max(1, Math.round(rawDmg * (1 - reduction)));
}

function computeKillChance(damage: number, enemyCurrentHp: number): number {
  if (damage >= enemyCurrentHp) return 1.0;
  if (damage <= 0) return 0;
  const ratio = damage / enemyCurrentHp;
  return clamp(ratio * ratio, 0, 0.99);
}

function computeSurvivalDelta(hero: HeroState, enemy: EnemyEntry, abilityType: string): number {
  const enemyDpt = getEnemyDamagePerTurn(enemy);
  const turnsToKillHero = hero.currentHp / Math.max(1, enemyDpt - hero.stats.end * 0.5);
  if (abilityType === 'heal' || abilityType === 'barrier') return 0.3;
  if (abilityType === 'redirect') return 0.4;
  if (abilityType === 'cc') return 0.5;
  if (abilityType === 'buff') return 0.15;
  const hpPercent = hero.currentHp / hero.maxHp;
  if (hpPercent < 0.3) return -0.1;
  return clamp(turnsToKillHero / 10, -1, 1) * 0.1;
}

function computeDebuffValue(ability: MasterAbility, enemy: EnemyEntry, enemyState: EnemyState): number {
  const ccTypes = ['stun', 'silence', 'daze', 'taunt', 'fear', 'slow', 'root', 'bleed', 'poison', 'burn', 'chill', 'intimidate'];
  let maxValue = 0;

  for (const effect of ability.effects) {
    const type = (effect.type as string) ?? '';
    const matched = ccTypes.find(cc => type.toLowerCase().includes(cc));
    if (matched) {
      const resistance = (enemy.resistances as Record<string, number>)[matched] || 0;
      const successChance = 1 - resistance;
      const alreadyApplied = enemyState.debuffs.includes(matched);
      const baseValue: Record<string, number> = {
        stun: 1.0, silence: 0.8, taunt: 0.7, daze: 0.6, fear: 0.6,
        bleed: 0.5, slow: 0.4, intimidate: 0.4, poison: 0.4,
        burn: 0.35, chill: 0.35, root: 0.45,
      };
      const value = (baseValue[matched] || 0.3) * successChance;
      const effective = alreadyApplied ? value * 0.3 : value;
      if (effective > maxValue) maxValue = effective;
    }
  }
  return maxValue;
}

function computeManaEfficiency(damageEv: number, manaCost: number, heroMp: number): number {
  if (manaCost === 0) return 0.5;
  if (heroMp < manaCost) return -1;
  const ratio = damageEv / Math.max(1, manaCost);
  return clamp(ratio / 10, 0, 1);
}

function getAccuracyPenaltyMultiplier(accModifierPct: number): number {
  if (accModifierPct >= 0) return 1.0;
  const penalty = Math.abs(accModifierPct) / 100;
  return Math.max(0.4, 1 - penalty);
}

interface ActionCandidate {
  skillName: string;
  ability: MasterAbility | null;
  manaCost: number;
  isConsumable?: boolean;
  consumable?: MasterConsumable;
  budgetCost?: number;
  initiativeMod?: number;
}

function enumerateActions(hero: HeroState, state: BattleState, legalActions?: string[]): ActionCandidate[] {
  const candidates: ActionCandidate[] = [];
  const seen = new Set<string>();

  const addSkill = (name: string) => {
    if (seen.has(name)) return;
    seen.add(name);
    if (name === 'Basic Attack' || name === 'basic_attack') {
      candidates.push({ skillName: 'Basic Attack', ability: null, manaCost: 0 });
      return;
    }
    const ability = getAbilityByName(name);
    if (ability && ability.type !== 'passive') {
      if (ability.manaCost <= hero.currentMp) {
        candidates.push({ skillName: name, ability, manaCost: ability.manaCost });
      }
    }
  };

  if (legalActions && legalActions.length > 0) {
    for (const name of legalActions) addSkill(name);
  } else {
    addSkill('Basic Attack');
    if (hero.active1) addSkill(hero.active1);
    if (hero.active2) addSkill(hero.active2);
    const classAbilities = getActiveAbilitiesForClass(hero.mainClass);
    for (const ab of classAbilities) {
      if (ab.manaCost <= hero.currentMp) {
        if (!seen.has(ab.name)) {
          seen.add(ab.name);
          candidates.push({ skillName: ab.name, ability: ab, manaCost: ab.manaCost });
        }
      }
    }
  }

  const budgetRemaining = state.battleBudgetRemaining ?? null;
  if (budgetRemaining !== null && budgetRemaining > 0) {
    const allConsumables = getAllConsumables();
    const quantities = state.consumableQuantities ?? {};
    for (const consumable of allConsumables) {
      if (consumable.weight > budgetRemaining) continue;
      const qty = quantities[consumable.id] ?? quantities[consumable.name] ?? 0;
      if (qty <= 0) continue;
      const key = `consumable:${consumable.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push({
        skillName: consumable.name,
        ability: null,
        manaCost: 0,
        isConsumable: true,
        consumable,
        budgetCost: consumable.weight,
        initiativeMod: consumable.initiativeModifier,
      });
    }
  }

  return candidates;
}

function getTargetSlots(
  ability: MasterAbility | null,
  heroes: HeroState[],
  enemies: EnemyState[],
): Array<{ slot: number | null; targetType: string }> {
  if (!ability) {
    return enemies.map((_, i) => ({ slot: i, targetType: 'enemy' }));
  }
  const mapped = mapTargetType(ability);
  switch (mapped) {
    case 'self':
      return [{ slot: null, targetType: 'self' }];
    case 'aoe_ally':
      return [{ slot: null, targetType: 'all_allies' }];
    case 'aoe_enemy':
      return [{ slot: null, targetType: 'all_enemies' }];
    case 'single_ally':
      return heroes.filter(h => h.isAlive).map(h => ({ slot: h.slot, targetType: 'ally' }));
    case 'single_enemy':
    default:
      return enemies.map((_, i) => ({ slot: i, targetType: 'enemy' }));
  }
}

export function scoreActions(state: BattleState, legalActions?: string[]): Recommendation[] {
  const hero = state.heroes.find(h => h.slot === state.activeHeroSlot);
  if (!hero || !hero.isAlive) return [];

  const statBlock = buildStatBlock(hero);
  const candidates = enumerateActions(hero, state, legalActions);
  const recommendations: Recommendation[] = [];

  for (const candidate of candidates) {
    if (candidate.isConsumable && candidate.consumable) {
      const consumable = candidate.consumable;
      const survivalLift = getConsumableSurvivalLift(
        consumable,
        hero.currentHp, hero.maxHp,
        hero.currentMp, hero.maxMp,
      );

      const initMod = consumable.initiativeModifier ?? 0;
      const initPenaltyScore = initMod / 1000;
      const budgetOpportunityCost = (candidate.budgetCost ?? 0) / Math.max(1, state.battleBudgetRemaining ?? 1);

      const healEffect = consumable.effects.find((e: Record<string, unknown>) => (e.type as string) === 'heal_percent_max_hp');
      const manaEffect = consumable.effects.find((e: Record<string, unknown>) => (e.type as string) === 'restore_percent_max_mp');
      const hpUrgency = hero.currentHp / hero.maxHp < 0.4 ? 0.3 : 0;
      const mpUrgency = hero.currentMp / hero.maxMp < 0.3 ? 0.2 : 0;

      let reasoning = `${consumable.name} (${consumable.weight}pts budget)`;
      if (healEffect) {
        const pct = healEffect.valuePct as number;
        const heal = Math.round(hero.maxHp * pct / 100);
        reasoning += ` — heals ~${heal} HP (${pct}% max HP)`;
      }
      if (manaEffect) {
        const pct = manaEffect.valuePct as number;
        const restore = Math.round(hero.maxMp * pct / 100);
        reasoning += ` — restores ~${restore} MP (${pct}% max MP)`;
      }
      if (initMod < 0) reasoning += ` [${initMod} initiative]`;

      const baseScore = survivalLift * 0.5 + hpUrgency + mpUrgency - budgetOpportunityCost * 0.2;
      const totalScore = clamp(baseScore + initPenaltyScore, 0, 2);

      recommendations.push({
        rank: 0,
        action: `${consumable.name} → hero ${hero.slot}`,
        skillName: consumable.name,
        targetType: 'ally',
        targetSlot: hero.slot,
        damageEv: 0,
        killChance: 0,
        survivalDelta: survivalLift,
        debuffValue: 0,
        manaEfficiency: 0,
        initiativePenalty: initMod,
        totalScore: Math.round(totalScore * 1000) / 1000,
        reasoning,
      });
      continue;
    }

    const { ability, skillName } = candidate;
    const targets = getTargetSlots(ability, state.heroes, state.enemies);

    for (const target of targets) {
      let damageEv = 0;
      let killChance = 0;
      let reasoning = '';

      const abilityType = ability ? inferAbilityType(ability) : 'physical_damage';
      const accMult = ability ? getAccuracyPenaltyMultiplier(ability.accModifierPct ?? 0) : 1.0;
      const initPenalty = ability ? getInitiativePenaltyScore(ability) : 0;
      const highVariance = ability ? isHighVarianceAbility(ability) : false;

      if (!ability) {
        const rawDmg = statBlock.attack != null
          ? statBlock.attack * 0.8
          : hero.stats.str * 1.6 + hero.stats.dex * 0.3;
        damageEv = computePhysicalDamage(rawDmg * accMult, state.enemy.def);
        if (target.slot !== null && state.enemies[target.slot]) {
          killChance = computeKillChance(damageEv, state.enemies[target.slot].currentHp);
          reasoning = `Basic attack: ~${damageEv} physical damage`;
        }
      } else if (abilityType === 'physical_damage' && ability.damageFormula) {
        const rawDmg = evaluateFormula(ability.damageFormula, statBlock);
        const effDmg = rawDmg * accMult;
        if (ability.targeting.targetType === 'all_enemies') {
          const perEnemy = computePhysicalDamage(effDmg, state.enemy.def);
          damageEv = perEnemy * state.enemies.length;
          killChance = Math.max(...state.enemies.map(e => computeKillChance(perEnemy, e.currentHp)));
          reasoning = `~${perEnemy} physical to each of ${state.enemies.length} enemies`;
        } else {
          damageEv = computePhysicalDamage(effDmg, state.enemy.def);
          if (ability.targeting.hits > 1) damageEv = Math.round(damageEv * ability.targeting.hits);
          if (target.slot !== null && state.enemies[target.slot]) {
            killChance = computeKillChance(damageEv, state.enemies[target.slot].currentHp);
          }
          reasoning = `~${damageEv} physical${ability.targeting.hits > 1 ? ` (${ability.targeting.hits} hits)` : ''}`;
          if (ability.accModifierPct < 0) reasoning += ` [ACC ${ability.accModifierPct}%]`;
        }
      } else if ((abilityType === 'magical_damage' || abilityType === 'aoe_damage') && ability.damageFormula) {
        const rawDmg = evaluateFormula(ability.damageFormula, statBlock);
        const effDmg = rawDmg * accMult;
        if (ability.targeting.targetType === 'all_enemies') {
          const perEnemy = computeMagicalDamage(effDmg, state.enemy.mdef);
          damageEv = perEnemy * state.enemies.length;
          killChance = Math.max(...state.enemies.map(e => computeKillChance(perEnemy, e.currentHp)));
          reasoning = `~${perEnemy} magic to each of ${state.enemies.length} enemies`;
        } else {
          damageEv = computeMagicalDamage(effDmg, state.enemy.mdef);
          if (target.slot !== null && state.enemies[target.slot]) {
            killChance = computeKillChance(damageEv, state.enemies[target.slot].currentHp);
          }
          reasoning = `~${damageEv} magical damage`;
        }
      } else if (abilityType === 'heal' && ability.healFormula) {
        const rawHeal = evaluateFormula(ability.healFormula, statBlock);
        if (target.slot !== null) {
          const ally = state.heroes.find(h => h.slot === target.slot);
          if (ally) {
            const missing = ally.maxHp - ally.currentHp;
            damageEv = Math.min(rawHeal, missing);
            reasoning = `Heals ally ${target.slot} for ~${Math.round(damageEv)} HP (${Math.round(ally.currentHp / ally.maxHp * 100)}% HP)`;
          }
        } else {
          damageEv = Math.min(rawHeal, hero.maxHp - hero.currentHp);
          reasoning = `Heals self for ~${Math.round(damageEv)} HP`;
        }
      } else if (abilityType === 'barrier' && (ability.barrierFormula || ability.wardFormula)) {
        const formula = ability.barrierFormula || ability.wardFormula || '';
        const barrierHp = evaluateFormula(formula, statBlock);
        damageEv = barrierHp;
        reasoning = `Applies barrier/ward for ~${Math.round(barrierHp)} HP`;
      } else if (abilityType === 'redirect') {
        damageEv = 0;
        reasoning = `${skillName} — damage redirect active`;
      } else if (abilityType === 'cc') {
        damageEv = 0;
        reasoning = `${skillName} — control/disruption`;
      } else if (abilityType === 'debuff') {
        damageEv = ability.damageFormula
          ? computePhysicalDamage(evaluateFormula(ability.damageFormula, statBlock) * accMult, state.enemy.def)
          : 0;
        reasoning = `${skillName} — debuff application${damageEv > 0 ? ` + ~${damageEv} dmg` : ''}`;
      } else {
        damageEv = 0;
        reasoning = `${skillName} — ${abilityType}`;
      }

      const survivalDelta = computeSurvivalDelta(hero, state.enemy, abilityType);
      const primaryEnemy = state.enemies[0] || ({ debuffs: [] } as EnemyState);
      const debuffValue = ability ? computeDebuffValue(ability, state.enemy, primaryEnemy) : 0;
      const manaEfficiency = computeManaEfficiency(damageEv, candidate.manaCost, hero.currentMp);

      const maxDmg = hero.maxHp * 2;
      const normDamage = clamp(damageEv / maxDmg, 0, 1);
      const normKill = killChance;
      const normSurvival = clamp((survivalDelta + 1) / 2, 0, 1);
      const normDebuff = debuffValue;
      const normMana = clamp((manaEfficiency + 1) / 2, 0, 1);
      const normInitiative = clamp((initPenalty + 1) / 2, 0, 1);

      let totalScore =
        SCORE_WEIGHTS.damageEv * normDamage +
        SCORE_WEIGHTS.killChance * normKill +
        SCORE_WEIGHTS.survivalDelta * normSurvival +
        SCORE_WEIGHTS.debuffValue * normDebuff +
        SCORE_WEIGHTS.manaEfficiency * normMana +
        SCORE_WEIGHTS.initiativeValue * normInitiative;

      if (abilityType === 'heal' && hero.currentHp / hero.maxHp < 0.3) totalScore += 0.3;
      if (abilityType === 'cc' && !primaryEnemy.debuffs.includes('stun') && ability?.effects.some(e => (e.type as string) === 'stun')) totalScore += 0.15;
      if (abilityType === 'barrier' && hero.currentHp / hero.maxHp < 0.5) totalScore += 0.15;
      if (highVariance) totalScore = Math.min(totalScore, 0.7);

      const executeEffect = ability?.effects.find(e => (e.type as string) === 'execute');
      if (executeEffect && state.enemies.some(e => e.currentHp / e.maxHp < 0.12)) totalScore += 0.25;

      if (ability?.channelInitiative && ability.channelInitiative >= 700) {
        totalScore -= 0.05;
        reasoning += ` [channels ${ability.channelInitiative} init]`;
      }

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
        initiativePenalty: ability?.initiativeLoss ?? 0,
        totalScore: Math.round(totalScore * 1000) / 1000,
        reasoning,
        highVariance: highVariance || undefined,
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
  activeHeroSlot: number,
  battleBudgetRemaining?: number | null,
  consumableQuantities?: Record<string, number>,
): BattleState {
  const clonedHeroes: HeroState[] = heroes.map(h => ({
    ...h,
    stats: { ...h.stats },
    buffs: [...(h.buffs ?? [])],
    debuffs: [...(h.debuffs ?? [])],
  }));

  const latestHpState = turnEvents.length > 0 ? turnEvents[turnEvents.length - 1].hpState : null;
  const latestMpState = turnEvents.length > 0 ? turnEvents[turnEvents.length - 1].mpState : null;

  if (latestHpState) {
    for (const hero of clonedHeroes) {
      const key = `hero_${hero.slot}`;
      if (latestHpState[key]) {
        hero.currentHp = latestHpState[key].current;
        hero.maxHp = latestHpState[key].max;
        hero.isAlive = hero.currentHp > 0;
      }
    }
  }

  if (latestMpState) {
    for (const hero of clonedHeroes) {
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
    heroes: clonedHeroes,
    enemies: [{
      enemyId: enemyEntry.id,
      currentHp: enemyCurrentHp,
      maxHp: enemyEntry.hp,
      currentMp: enemyEntry.mp,
      buffs: [],
      debuffs: enemyDebuffs,
    }],
    enemy: enemyEntry,
    battleBudgetRemaining: battleBudgetRemaining ?? null,
    consumableQuantities: consumableQuantities ?? {},
  };
}
