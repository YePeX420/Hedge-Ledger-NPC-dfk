/**
 * DFK Stat Reconciliation Engine
 * Compares observed in-game stats against backend-computed expected values.
 * Uses the same formulas as bot.js: speed/eva/blk/sblk/pRed/mRed formulas
 * and armor scalar derivations from _heroCombatExtras.
 */

import { ENEMY_CATALOG, type EnemyEntry } from './pve-enemy-catalog';

export interface ObservedStats {
  hp?: number;
  mp?: number;
  atk?: number;
  spellPower?: number;
  pDef?: number;
  mDef?: number;
  speed?: number;
  pAcc?: number;
  mAcc?: number;
  eva?: number;
  pRed?: number;
  mRed?: number;
  csc?: number;
  cdm?: number;
  blk?: number;
  sblk?: number;
  [key: string]: number | undefined;
}

export interface StatDiff {
  field: string;
  observed: number;
  expected: number;
  delta: number;
  suspectedCause: string;
}

export interface ReconciliationResult {
  observed: ObservedStats;
  expected: ObservedStats;
  diffs: StatDiff[];
  notes: string[];
}

export interface HeroBaseStats {
  str: number;
  dex: number;
  agi: number;
  int: number;
  wis: number;
  vit: number;
  end: number;
  lck: number;
  level: number;
  hp?: number;
  mp?: number;
  mainClass?: string;
}

const RECONCILE_FIELDS = [
  'hp', 'mp', 'atk', 'pDef', 'mDef', 'speed', 'pAcc', 'eva',
  'pRed', 'mRed', 'csc', 'cdm', 'blk', 'sblk',
];

/**
 * Compute expected hero stats using the same formulas as bot.js.
 * From bot.js lines 19252-19257:
 *   speed = Math.round(agi * 1.7 * level / 100)
 *   eva   = Math.round((agi * 1.5 + lck * 0.5) * level / 10000)
 *   blk   = Math.round((dex * 1.5 + lck * 0.5) * level / 10000)
 *   sblk  = Math.round((int * 1.5 + lck * 0.5) * level / 10000)
 *   pRed  = Math.round((end * 1.0 + agi * 0.5) * level / 5)
 *   mRed  = Math.round((int * 1.0 + end * 0.5) * level / 5)
 *
 * HP/MP/ATK use base game formula (no level scaling — values are raw stat caps):
 *   HP  = vit * 10 + end * 5 + level * 15 + 100
 *   MP  = wis * 8 + int * 4 + level * 6 + 50
 *   ATK = str * 2 + dex
 *   pDef = end * 1.5 + vit * 0.5
 *   mDef = wis * 1.5 + int * 0.5
 *   pAcc = dex * 1.5 + lck * 0.3
 *   csc  = min(100, lck * 0.4 + dex * 0.1)
 *   cdm  = 150 + lck * 0.3
 */
function computeExpectedHeroStats(base: HeroBaseStats): ObservedStats {
  const { str, dex, agi, int: intelligence, wis, vit, end, lck, level } = base;

  // Use raw hp/mp from hero data if provided (most accurate — these are on-chain)
  const hp = base.hp ?? Math.round(vit * 10 + end * 5 + level * 15 + 100);
  const mp = base.mp ?? Math.round(wis * 8 + intelligence * 4 + level * 6 + 50);

  // These match the bot.js formula pipeline (lines 19252-19257 in bot.js)
  const speed = Math.round(agi * 1.7 * level / 100);
  const eva   = Math.round((agi * 1.5 + lck * 0.5) * level / 10000);
  const blk   = Math.round((dex * 1.5 + lck * 0.5) * level / 10000);
  const sblk  = Math.round((intelligence * 1.5 + lck * 0.5) * level / 10000);
  const pRed  = Math.round((end * 1.0 + agi * 0.5) * level / 5);
  const mRed  = Math.round((intelligence * 1.0 + end * 0.5) * level / 5);

  // Remaining stats — baseline without equipment
  const atk       = Math.round(str * 2 + dex);
  const pDef      = Math.round(end * 1.5 + vit * 0.5);
  const mDef      = Math.round(wis * 1.5 + intelligence * 0.5);
  const pAcc      = Math.round(dex * 1.5 + lck * 0.3);
  const csc       = Math.min(100, Math.round(lck * 0.4 + dex * 0.1));
  const cdm       = Math.round(150 + lck * 0.3);

  return { hp, mp, atk, pDef, mDef, speed, pAcc, eva, pRed, mRed, csc, cdm, blk, sblk };
}

function computeExpectedEnemyStats(enemy: EnemyEntry): ObservedStats {
  return {
    hp:    enemy.hp,
    mp:    enemy.mp,
    atk:   enemy.atk,
    pDef:  enemy.def,
    mDef:  enemy.mdef,
    speed: enemy.spd,
    eva:   Math.round((enemy.eva ?? 0) * 100),
    csc:   Math.round((enemy.crit ?? 0) * 100),
    cdm:   150,
    pRed:  0,
    mRed:  0,
    pAcc:  0,
    blk:   0,
    sblk:  0,
  };
}

function guessCause(field: string, delta: number, hasEquipment: boolean): string {
  const absDelta = Math.abs(delta);
  if (absDelta === 0) return 'match';

  if (field === 'hp' || field === 'mp') {
    if (delta > 0) return hasEquipment ? 'equipment or buff bonus' : 'possible buff or passive bonus';
    return 'possible damage taken, debuff, or incomplete formula';
  }

  if (field === 'atk' || field === 'spellPower') {
    return delta > 0
      ? (hasEquipment ? 'weapon base damage or buff' : 'buff or passive not modeled')
      : 'debuff or missing base formula component';
  }

  if (field === 'pDef' || field === 'mDef') {
    return delta > 0
      ? (hasEquipment ? 'armor stat bonus (physDefScalar × END or magicDefScalar × WIS)' : 'buff or passive bonus')
      : 'debuff or missing armor modifier';
  }

  if (field === 'speed') {
    return delta > 0
      ? (hasEquipment ? 'weapon speedModifier or armor speed bonus' : 'buff or Speed passive')
      : 'debuff or Exhaust effect';
  }

  if (field === 'eva' || field === 'blk' || field === 'sblk') {
    return delta > 0
      ? (hasEquipment ? 'evasion/block item bonus or buff' : 'buff or passive effect')
      : 'debuff reducing dodge or block';
  }

  if (field === 'pRed' || field === 'mRed') {
    return delta > 0
      ? (hasEquipment ? 'armor physDef%/magDef% scalar or accessory' : 'buff or passive reduction bonus')
      : 'debuff or missing reduction formula';
  }

  if (field === 'csc' || field === 'cdm') {
    return delta > 0
      ? (hasEquipment ? 'critStrikeChance/critDamage equipment bonus' : 'passive or buff effect')
      : 'debuff or formula undercount';
  }

  if (field === 'pAcc' || field === 'mAcc') {
    return delta > 0
      ? (hasEquipment ? 'weapon accuracy bonus (pAccuracyAtRequirement)' : 'buff or passive')
      : 'accuracy debuff or missing weapon bonus';
  }

  if (absDelta <= 3) return 'rounding difference — likely formula match';
  if (hasEquipment && delta > 0) return 'equipment modifier not present in base formula';
  return 'formula deviation — may need revision';
}

export function reconcileStats(
  observed: ObservedStats,
  options: {
    enemyId?: string;
    heroBaseStats?: HeroBaseStats;
    hasEquipment?: boolean;
  }
): ReconciliationResult {
  const notes: string[] = [];
  let expected: ObservedStats = {};

  if (options.enemyId) {
    const normalized = options.enemyId.toUpperCase().replace(/[\s-]+/g, '_');
    const enemy = ENEMY_CATALOG[normalized];
    if (!enemy) {
      notes.push(`Enemy '${options.enemyId}' not found in catalog — using observed as baseline`);
      expected = { ...observed };
    } else {
      expected = computeExpectedEnemyStats(enemy);
      notes.push(`Compared against enemy catalog: ${enemy.name} (Tier ${enemy.tier})`);
    }
  } else if (options.heroBaseStats) {
    expected = computeExpectedHeroStats(options.heroBaseStats);
    notes.push(`Expected stats computed from base attributes using bot.js formulas (Lv${options.heroBaseStats.level})`);
    if (options.hasEquipment) {
      notes.push('Hero has equipment — positive deltas likely reflect weapon/armor bonuses not in base formula');
    }
  } else {
    notes.push('No unit context provided — pass enemyId for enemies or baseStats from unitSnapshot for heroes');
    return { observed, expected: {}, diffs: [], notes };
  }

  const diffs: StatDiff[] = [];

  for (const field of RECONCILE_FIELDS) {
    const obs = observed[field];
    const exp = expected[field];
    if (obs === undefined || exp === undefined) continue;

    const delta = obs - exp;
    if (Math.abs(delta) > 0.5) {
      diffs.push({
        field,
        observed: obs,
        expected: exp,
        delta: Math.round(delta * 100) / 100,
        suspectedCause: guessCause(field, delta, options.hasEquipment ?? false),
      });
    }
  }

  if (diffs.length === 0) {
    notes.push('All observed stats match expected values within tolerance');
  } else {
    notes.push(`${diffs.length} stat(s) differ from expected values`);
  }

  return { observed, expected, diffs, notes };
}
