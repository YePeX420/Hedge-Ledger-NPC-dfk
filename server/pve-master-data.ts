import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, 'data');

export interface MasterAbility {
  id: string;
  class: string;
  discipline: string;
  tier: number;
  type: 'active' | 'passive' | 'triggered_passive';
  name: string;
  manaCost: number;
  range: number | string;
  accModifierPct: number;
  channelInitiative: number;
  initiativeGain: number;
  initiativeLoss: number;
  amnesia: number;
  damageFormula: string | null;
  healFormula: string | null;
  barrierFormula?: string | null;
  wardFormula?: string | null;
  targeting: {
    targetType: string;
    targetCount: number;
    positionRules?: string | null;
    random: boolean;
    hits: number;
  };
  effects: Array<Record<string, unknown>>;
  delayedEffects?: Array<{ delayTicks: number; effect: Record<string, unknown> }>;
  combo: { condition: string; effects: Array<Record<string, unknown>> } | null;
  penalties: Array<Record<string, unknown>>;
  passiveRules: Array<Record<string, unknown>>;
  conditionalRules?: Array<Record<string, unknown>>;
  stackLimit: number | null;
  notes: string[];
  sourceConfidence: 'validated_screenshot' | 'doc_based' | 'inferred';
}

export interface MasterConsumable {
  id: string;
  name: string;
  type: string;
  weight: number;
  initiativeModifier: number;
  targeting: string;
  durationTicks?: number;
  effectDescription: string;
  effects: Array<Record<string, unknown>>;
  notes?: string[];
}

export interface MasterStatus {
  id: string;
  name: string;
  category: string;
  durationUnit: string;
  stacks: string;
  affectedBySER: boolean;
  affectedByPurify: boolean;
  affectedByCleanse: boolean;
  blockedByUnstoppable: boolean;
  notes: string[];
}

let _abilities: MasterAbility[] | null = null;
let _consumables: MasterConsumable[] | null = null;
let _statuses: Map<string, MasterStatus> | null = null;
let _abilityByName: Map<string, MasterAbility> | null = null;
let _abilityById: Map<string, MasterAbility> | null = null;

function loadAbilities(): MasterAbility[] {
  if (_abilities) return _abilities;
  try {
    const raw = JSON.parse(readFileSync(join(DATA_DIR, 'abilities.master.json'), 'utf-8'));
    _abilities = raw.abilities as MasterAbility[];
    _abilityByName = new Map(_abilities.map(a => [a.name.toLowerCase(), a]));
    _abilityById = new Map(_abilities.map(a => [a.id, a]));
    console.log(`[MasterData] Loaded ${_abilities.length} abilities`);
  } catch (err) {
    console.error('[MasterData] Failed to load abilities.master.json:', err);
    _abilities = [];
    _abilityByName = new Map();
    _abilityById = new Map();
  }
  return _abilities!;
}

function loadConsumables(): MasterConsumable[] {
  if (_consumables) return _consumables;
  try {
    const raw = JSON.parse(readFileSync(join(DATA_DIR, 'consumables.master.json'), 'utf-8'));
    _consumables = raw.consumables as MasterConsumable[];
    console.log(`[MasterData] Loaded ${_consumables.length} consumables`);
  } catch (err) {
    console.error('[MasterData] Failed to load consumables.master.json:', err);
    _consumables = [];
  }
  return _consumables!;
}

function loadStatuses(): Map<string, MasterStatus> {
  if (_statuses) return _statuses;
  try {
    const raw = JSON.parse(readFileSync(join(DATA_DIR, 'statuses.master.json'), 'utf-8'));
    const list = raw.statuses as MasterStatus[];
    _statuses = new Map(list.map(s => [s.id, s]));
    console.log(`[MasterData] Loaded ${_statuses.size} statuses`);
  } catch (err) {
    console.error('[MasterData] Failed to load statuses.master.json:', err);
    _statuses = new Map();
  }
  return _statuses!;
}

export function getAbilityByName(name: string): MasterAbility | undefined {
  loadAbilities();
  return _abilityByName!.get(name.toLowerCase());
}

export function getAbilityById(id: string): MasterAbility | undefined {
  loadAbilities();
  return _abilityById!.get(id);
}

export function getAbilitiesForClass(className: string): MasterAbility[] {
  loadAbilities();
  const lower = className.toLowerCase();
  return _abilities!.filter(a => a.class.toLowerCase() === lower);
}

export function getActiveAbilitiesForClass(className: string): MasterAbility[] {
  return getAbilitiesForClass(className).filter(a => a.type === 'active');
}

export function getAllConsumables(): MasterConsumable[] {
  return loadConsumables();
}

export function getConsumableById(id: string): MasterConsumable | undefined {
  return loadConsumables().find(c => c.id === id);
}

export function getStatusDef(id: string): MasterStatus | undefined {
  loadStatuses();
  return _statuses!.get(id);
}

export interface StatBlock {
  str: number;
  dex: number;
  agi: number;
  int: number;
  wis: number;
  vit: number;
  end: number;
  lck: number;
  attack?: number;
  spell?: number;
  speed?: number;
  ap?: number;
}

function deriveAttack(stats: StatBlock): number {
  if (stats.attack != null) return stats.attack;
  return stats.str * 2 + Math.floor(stats.dex * 0.5);
}

function deriveSpell(stats: StatBlock): number {
  if (stats.spell != null) return stats.spell;
  return stats.int + stats.wis;
}

export function evaluateFormula(formula: string, stats: StatBlock, targetAgi?: number): number {
  if (!formula) return 0;

  const attack = deriveAttack(stats);
  const spell = deriveSpell(stats);
  const ap = stats.ap ?? 0;

  let expr = formula
    .replace(/\bATTACK\b/g, String(attack))
    .replace(/\bSPELL\b/g, String(spell))
    .replace(/\bAP\b/g, String(ap))
    .replace(/\bSTR\.S\b/g, String(stats.str))
    .replace(/\bDEX\.S\b/g, String(stats.dex))
    .replace(/\bAGI\.S\b/g, String(stats.agi))
    .replace(/\bINT\.S\b/g, String(stats.int))
    .replace(/\bWIS\.S\b/g, String(stats.wis))
    .replace(/\bVIT\.S\b/g, String(stats.vit))
    .replace(/\bEND\.S\b/g, String(stats.end))
    .replace(/\bLCK\.S\b/g, String(stats.lck))
    .replace(/\bSTR\b/g, String(stats.str))
    .replace(/\bDEX\b/g, String(stats.dex))
    .replace(/\bAGI\b/g, String(stats.agi))
    .replace(/\bINT\b/g, String(stats.int))
    .replace(/\bWIS\b/g, String(stats.wis))
    .replace(/\bVIT\b/g, String(stats.vit))
    .replace(/\bEND\b/g, String(stats.end))
    .replace(/\bLCK\b/g, String(stats.lck))
    .replace(/\bTARGET_AGI\b/g, String(targetAgi ?? 30))
    .replace(/%/g, '')
    .replace(/\bceil\(/g, 'Math.ceil(');

  if (/RNG\((\d+),(\d+)\)/.test(expr)) {
    const match = expr.match(/RNG\((\d+),(\d+)\)/);
    if (match) {
      const lo = parseInt(match[1]);
      const hi = parseInt(match[2]);
      const avg = (lo + hi) / 2;
      expr = expr.replace(/RNG\(\d+,\d+\)/, String(avg));
    }
  }

  try {
    const result = Function(`"use strict"; return (${expr})`)();
    return typeof result === 'number' && isFinite(result) ? result : 0;
  } catch {
    return 0;
  }
}

export function inferAbilityType(ability: MasterAbility): 'physical_damage' | 'magical_damage' | 'heal' | 'barrier' | 'buff' | 'debuff' | 'cc' | 'passive' | 'redirect' | 'aoe_damage' {
  if (ability.type === 'passive') return 'passive';

  if (ability.healFormula) return 'heal';
  if (ability.barrierFormula || ability.wardFormula) return 'barrier';

  const hasRedirect = ability.effects.some(e => (e.type as string)?.includes('Redirect') || (e.type as string)?.includes('redirect'));
  if (hasRedirect) return 'redirect';

  const hasAoe = ability.targeting.targetType === 'all_enemies' || ability.targeting.targetType === 'all_enemies_and_party_buff';
  const hasPhysicalDamage = ability.damageFormula && (
    ability.damageFormula.includes('ATTACK') ||
    ability.damageFormula.includes('STR') ||
    ability.damageFormula.includes('DEX')
  );
  const hasMagicalDamage = ability.damageFormula && (
    ability.damageFormula.includes('SPELL') ||
    ability.damageFormula.includes('INT') ||
    ability.damageFormula.includes('WIS')
  );

  if (ability.damageFormula) {
    if (hasAoe) return 'aoe_damage';
    if (hasMagicalDamage && !hasPhysicalDamage) return 'magical_damage';
    return 'physical_damage';
  }

  const hasCc = ability.effects.some(e => {
    const t = (e.type as string) ?? '';
    return ['stun', 'silence', 'daze', 'taunt', 'fear', 'slow', 'root'].includes(t);
  });
  if (hasCc) return 'cc';

  const hasDebuff = ability.effects.some(e => {
    const t = (e.type as string) ?? '';
    return t.includes('Down') || t.includes('down') || t.includes('bleed') || t.includes('burn') || t.includes('chill') || t.includes('poison') || t.includes('intimidate');
  });
  if (hasDebuff) return 'debuff';

  return 'buff';
}

export function mapTargetType(ability: MasterAbility): 'single_enemy' | 'aoe_enemy' | 'single_ally' | 'self' | 'aoe_ally' {
  const tt = ability.targeting.targetType;
  if (tt === 'self') return 'self';
  if (tt === 'all_allies') return 'aoe_ally';
  if (tt === 'all_enemies' || tt === 'all_enemies_and_party_buff') return 'aoe_enemy';
  if (tt === 'ally' || tt === 'party_member') return 'single_ally';
  return 'single_enemy';
}

export function getInitiativePenaltyScore(ability: MasterAbility): number {
  const loss = ability.initiativeLoss ?? 0;
  const channel = ability.channelInitiative ?? 0;
  return -(loss + channel) / 1000;
}

export function isHighVarianceAbility(ability: MasterAbility): boolean {
  const tt = ability.targeting.targetType;
  const hasFriendlyFire = ability.effects.some(e => (e.type as string)?.includes('friendlyFire') || (e.type as string)?.includes('friendly_fire'));
  const isRandom = ability.targeting.random === true;
  const hasRngFormula = ability.damageFormula?.includes('RNG(') ?? false;
  return hasFriendlyFire || (isRandom && tt === 'random_enemy') || hasRngFormula;
}

export function getConsumableSurvivalLift(consumable: MasterConsumable, currentHp: number, maxHp: number, currentMp: number, maxMp: number): number {
  for (const effect of consumable.effects) {
    const type = effect.type as string;
    if (type === 'heal_percent_max_hp') {
      const pct = (effect.valuePct as number) / 100;
      const heal = Math.min(maxHp * pct, maxHp - currentHp);
      return heal / maxHp;
    }
    if (type === 'restore_percent_max_mp') {
      const pct = (effect.valuePct as number) / 100;
      const restore = Math.min(maxMp * pct, maxMp - currentMp);
      return (restore / maxMp) * 0.4;
    }
  }
  return 0;
}

export function preloadMasterData(): void {
  loadAbilities();
  loadConsumables();
  loadStatuses();
}
