/**
 * DFK Stat Reconciliation Engine
 *
 * Compares observed in-game stats against backend-computed expected values.
 * Uses the SAME formula pipeline as bot.js:
 *   - Speed/eva/blk/sblk/pRed/mRed base stat formulas (lines 19252-19257 in bot.js)
 *   - _decodeWeaponSpeed / _applySlots / _heroCombatExtras equipment pipeline
 *     (lines 11036-11115 in bot.js), replicated here so this module can be
 *     imported as a TypeScript file without coupling to the bot runtime.
 */

import { ENEMY_CATALOG, type EnemyEntry } from './pve-enemy-catalog';

// ─── Interfaces ──────────────────────────────────────────────────────────────

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

/** Shape of a single equipment item as stored in dfk_bout_heroes weapon/armor JSON columns */
export interface EquipmentItem {
  baseDamage?: number;
  speedModifier?: number;
  bonus1?: number; bonus2?: number; bonus3?: number; bonus4?: number; bonus5?: number;
  bonusScalar1?: number; bonusScalar2?: number; bonusScalar3?: number; bonusScalar4?: number; bonusScalar5?: number;
  rawPhysDefense?: number; physDefScalar?: number; pDefScalarMax?: number;
  rawMagicDefense?: number; magicDefScalar?: number; mDefScalarMax?: number;
  evasion?: number;
  equipmentType?: number;
}

export interface HeroEquipment {
  weapon1?: EquipmentItem | null;
  weapon2?: EquipmentItem | null;
  armor?: EquipmentItem | null;
  accessory?: EquipmentItem | null;
  offhand1?: EquipmentItem | null;
  offhand2?: EquipmentItem | null;
  pet?: { combatBonus?: number; combatBonusScalar?: number } | null;
}

// ─── Equipment formula pipeline — mirrors bot.js lines 11036-11115 ────────────

/**
 * Decode weapon speed modifier.
 * raw >= 128 → negative (raw=133 → -5). From bot.js _decodeWeaponSpeed().
 */
function _decodeWeaponSpeed(raw: number): number {
  if (!raw) return 0;
  return (1 - 2 * Math.floor(raw / 128)) * (raw % 128);
}

// Bonus code → effect key maps (exact copies from bot.js lines 11042-11054)
const _WEAPON_BONUS: Record<number, string> = {
  22: 'critDamage', 23: 'critStrikeChance', 33: 'physicalDamage', 32: 'magicDamage',
  30: 'physAndMagicDefDown', 20: 'blkChance', 21: 'sblkChance',
};
const _ARMOR_BONUS: Record<number, string> = {
  7: 'speed', 8: 'evasion', 29: 'physDefPct', 30: 'magicDefPct',
  33: 'physicalDamage', 34: 'magicDamage', 57: 'critStrikeChance',
};
const _ACCESSORY_BONUS: Record<number, string> = {
  5: 'speed', 6: 'evasion', 27: 'physDefPct', 28: 'magicDefPct',
  29: 'critDamage', 30: 'lifesteal', 26: 'critDamage',
};
const _OFFHAND_BONUS: Record<number, string> = { 5: 'speed', 6: 'evasion', 27: 'physDefPct', 28: 'magicDefPct' };

/** Apply bonus/scalar slot pairs into accumulator — from bot.js _applySlots() */
function _applySlots(slots: [number | undefined, number | undefined][], table: Record<number, string>, acc: Record<string, number>) {
  for (const [code, scalar] of slots) {
    if (!code) continue;
    const k = table[code];
    if (k) acc[k] = (acc[k] ?? 0) + (scalar ?? 0) / 10_000;
  }
}

interface CombatExtras {
  speedBonus: number; critBonus: number; physDmgPct: number; magDmgPct: number;
  physDefPct: number; magDefPct: number; evaBonus: number; weaponDmg: number;
  armorPDef: number; armorMDef: number; armorEva: number;
  blkChance: number; sblkChance: number; critStrikeChance: number; critDamage: number;
  lifesteal: number;
}

/**
 * Aggregate equipment + pet bonuses into a flat extras object.
 * Mirrors _heroCombatExtras() in bot.js (lines 11065-11115), adapted for TypeScript.
 */
function _heroCombatExtras(h: HeroEquipment, heroStats: HeroBaseStats): CombatExtras {
  const acc: Record<string, number> = {
    speedBonus: 0, critBonus: 0, physDmgPct: 0, magDmgPct: 0,
    physDefPct: 0, magDefPct: 0, evaBonus: 0, weaponDmg: 0,
    armorPDef: 0, armorMDef: 0, armorEva: 0,
    blkChance: 0, sblkChance: 0, critStrikeChance: 0, critDamage: 0, lifesteal: 0,
  };

  if (h.weapon1) {
    const w = h.weapon1;
    acc.weaponDmg += w.baseDamage ?? 0;
    acc.speedBonus += _decodeWeaponSpeed(w.speedModifier ?? 0);
    _applySlots([
      [w.bonus1, w.bonusScalar1], [w.bonus2, w.bonusScalar2],
      [w.bonus3, w.bonusScalar3], [w.bonus4, w.bonusScalar4],
    ], _WEAPON_BONUS, acc);
  }
  if (h.weapon2) {
    const w = h.weapon2;
    acc.weaponDmg += (w.baseDamage ?? 0) * 0.5;
    acc.speedBonus += _decodeWeaponSpeed(w.speedModifier ?? 0);
    _applySlots([
      [w.bonus1, w.bonusScalar1], [w.bonus2, w.bonusScalar2],
      [w.bonus3, w.bonusScalar3], [w.bonus4, w.bonusScalar4],
    ], _WEAPON_BONUS, acc);
  }
  if (h.armor) {
    const a = h.armor;
    const WIS = heroStats.wis, END = heroStats.end;
    const rawPD = a.rawPhysDefense ?? 0;
    const rawMD = a.rawMagicDefense ?? 0;
    const pDefMax = a.pDefScalarMax ?? rawPD * 2;
    const mDefMax = a.mDefScalarMax ?? rawMD * 2;
    acc.armorPDef = rawPD + Math.min((a.physDefScalar ?? 0) / 100 * END, pDefMax);
    acc.armorMDef = rawMD + Math.min((a.magicDefScalar ?? 0) / 100 * WIS, mDefMax);
    acc.armorEva  = a.evasion ?? 0;
    _applySlots([
      [a.bonus1, a.bonusScalar1], [a.bonus2, a.bonusScalar2], [a.bonus3, a.bonusScalar3],
      [a.bonus4, a.bonusScalar4], [a.bonus5, a.bonusScalar5],
    ], _ARMOR_BONUS, acc);
  }
  for (const item of [h.accessory, h.offhand1, h.offhand2].filter(Boolean) as EquipmentItem[]) {
    const tbl = item.equipmentType === 1 ? _ACCESSORY_BONUS : _OFFHAND_BONUS;
    _applySlots([
      [item.bonus1, item.bonusScalar1], [item.bonus2, item.bonusScalar2],
      [item.bonus3, item.bonusScalar3], [item.bonus4, item.bonusScalar4],
      [item.bonus5, item.bonusScalar5],
    ], tbl, acc);
  }

  // Pet bonuses — same PET_MAP as bot.js lines 11104-11112
  if (h.pet?.combatBonus != null) {
    const raw = h.pet.combatBonus;
    const base = raw <= 79 ? raw : raw <= 158 ? raw - 79 : raw - 159;
    const val = (h.pet.combatBonusScalar ?? 0) / 10_000;
    const PET_MAP: Record<number, string> = {
      2: 'blkChance', 3: 'sblkChance', 4: 'recoveryChance', 5: 'magDefPct', 6: 'physDefPct',
      7: 'critStrikeChance', 8: 'physDmgPct', 9: 'magDmgPct', 25: 'evaBonus', 26: 'speedBonus',
      46: 'physAcc', 47: 'magAcc', 48: 'omniDef', 50: 'lifesteal', 63: 'magDmgRed', 64: 'physDmgRed',
    };
    const eff = PET_MAP[base];
    if (eff === 'omniDef') { acc.physDefPct += val; acc.magDefPct += val; }
    else if (eff) acc[eff] = (acc[eff] ?? 0) + val;
  }

  return acc as CombatExtras;
}

// ─── Stat computation ──────────────────────────────────────────────────────────

const RECONCILE_FIELDS = [
  'hp', 'mp', 'atk', 'pDef', 'mDef', 'speed', 'pAcc', 'eva',
  'pRed', 'mRed', 'csc', 'cdm', 'blk', 'sblk',
];

/**
 * Compute expected hero stats using the same formulas as bot.js (lines 19252-19257)
 * plus equipment extras from _heroCombatExtras when equipment data is available.
 */
function computeExpectedHeroStats(base: HeroBaseStats, equipment?: HeroEquipment): ObservedStats {
  const { str, dex, agi, int: intelligence, wis, vit, end, lck, level } = base;

  // Raw on-chain HP/MP if available, else formula estimate
  const hp = base.hp ?? Math.round(vit * 10 + end * 5 + level * 15 + 100);
  const mp = base.mp ?? Math.round(wis * 8 + intelligence * 4 + level * 6 + 50);

  // Bot.js formula pipeline (lines 19252-19257)
  const speed = Math.round(agi * 1.7 * level / 100);
  const eva   = Math.round((agi * 1.5 + lck * 0.5) * level / 10000);
  const blk   = Math.round((dex * 1.5 + lck * 0.5) * level / 10000);
  const sblk  = Math.round((intelligence * 1.5 + lck * 0.5) * level / 10000);
  const pRed  = Math.round((end * 1.0 + agi * 0.5) * level / 5);
  const mRed  = Math.round((intelligence * 1.0 + end * 0.5) * level / 5);

  // Base combat stats (no level scaling — raw attribute contributions)
  const atk  = Math.round(str * 2 + dex);
  const pDef = Math.round(end * 1.5 + vit * 0.5);
  const mDef = Math.round(wis * 1.5 + intelligence * 0.5);
  const pAcc = Math.round(dex * 1.5 + lck * 0.3);
  const csc  = Math.min(100, Math.round(lck * 0.4 + dex * 0.1));
  const cdm  = Math.round(150 + lck * 0.3);

  let result: ObservedStats = { hp, mp, atk, pDef, mDef, speed, pAcc, eva, pRed, mRed, csc, cdm, blk, sblk };

  // Apply equipment extras using the same _heroCombatExtras pipeline from bot.js
  if (equipment) {
    const ex = _heroCombatExtras(equipment, base);

    // Speed: base + weapon speed modifier + armor/accessory speed bonus (as flat bonus)
    result.speed = Math.round(speed + ex.speedBonus + (ex['speed'] ?? 0) * speed);

    // Eva: base + armor raw evasion / 10000 + accessory evasion pct
    const armorEvaPct = ex.armorEva / 10_000;
    result.eva = Math.round(eva + armorEvaPct * eva + (ex.evaBonus ?? 0) * eva);

    // pDef / mDef: base + armor stat scalars
    result.pDef = Math.round(pDef + ex.armorPDef + (ex.physDefPct ?? 0) * pDef);
    result.mDef = Math.round(mDef + ex.armorMDef + (ex.magDefPct ?? 0) * mDef);

    // ATK: base + weapon base damage
    result.atk = Math.round(atk + ex.weaponDmg);

    // BLK / SBLK: base + weapon blkChance/sblkChance bonus scalars
    result.blk  = Math.round(blk  + (ex.blkChance  ?? 0) * blk);
    result.sblk = Math.round(sblk + (ex.sblkChance ?? 0) * sblk);

    // CSC: base + weapon/pet critStrikeChance bonus
    result.csc = Math.min(100, Math.round(csc + (ex.critStrikeChance ?? 0) * 100));

    // CDM: base + critDamage bonus (as pct)
    result.cdm = Math.round(cdm + (ex.critDamage ?? 0) * 100);
  }

  return result;
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

// ─── Cause classification ─────────────────────────────────────────────────────

function guessCause(field: string, delta: number, hasEquipment: boolean): string {
  const absDelta = Math.abs(delta);
  if (absDelta === 0) return 'match';

  if (field === 'hp' || field === 'mp') {
    return delta > 0
      ? (hasEquipment ? 'equipment or buff bonus' : 'possible buff or passive bonus')
      : 'possible damage taken, debuff, or formula deviation';
  }
  if (field === 'atk' || field === 'spellPower') {
    return delta > 0
      ? (hasEquipment ? 'weapon base damage or physical damage% bonus' : 'buff or passive not modeled')
      : 'debuff or missing base formula component';
  }
  if (field === 'pDef' || field === 'mDef') {
    return delta > 0
      ? (hasEquipment ? 'armor stat bonus (physDefScalar × END or magicDefScalar × WIS)' : 'buff or passive bonus')
      : 'debuff or armor modifier not in snapshot';
  }
  if (field === 'speed') {
    return delta > 0
      ? (hasEquipment ? 'weapon speedModifier or armor/accessory speed bonus' : 'buff or Speed passive')
      : 'debuff or Exhaust effect';
  }
  if (field === 'eva' || field === 'blk' || field === 'sblk') {
    return delta > 0
      ? (hasEquipment ? 'evasion/block item bonus or pet/passive buff' : 'buff or passive effect')
      : 'debuff reducing dodge or block';
  }
  if (field === 'pRed' || field === 'mRed') {
    return delta > 0
      ? (hasEquipment ? 'armor physDef%/magDef% scalar or accessory reduction' : 'buff or passive reduction bonus')
      : 'debuff or formula undercount';
  }
  if (field === 'csc' || field === 'cdm') {
    return delta > 0
      ? (hasEquipment ? 'critStrikeChance/critDamage equipment bonus' : 'passive or buff effect')
      : 'debuff or formula undercount';
  }
  if (field === 'pAcc' || field === 'mAcc') {
    return delta > 0
      ? (hasEquipment ? 'weapon pAccuracyAtRequirement bonus or accessory' : 'buff or passive')
      : 'accuracy debuff or missing weapon bonus';
  }

  if (absDelta <= 3) return 'rounding difference — likely formula match';
  return hasEquipment && delta > 0
    ? 'equipment modifier not fully accounted for'
    : 'formula deviation — may need further investigation';
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function reconcileStats(
  observed: ObservedStats,
  options: {
    enemyId?: string;
    heroBaseStats?: HeroBaseStats;
    heroEquipment?: HeroEquipment;
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
    const equipment = options.heroEquipment;
    expected = computeExpectedHeroStats(options.heroBaseStats, equipment ?? undefined);
    const eqNote = equipment
      ? 'with equipment bonuses applied via _heroCombatExtras pipeline'
      : 'base stats only — no equipment snapshot provided';
    notes.push(`Expected stats computed from base attributes using bot.js formulas (Lv${options.heroBaseStats.level}), ${eqNote}`);
    if (options.hasEquipment && !equipment) {
      notes.push('Hero has equipment (items[] in snapshot) but full item data not available — deltas may reflect unmodeled equipment bonuses');
    }
  } else {
    notes.push('No unit context provided — pass enemyId or baseStats from unitSnapshot');
    return { observed, expected: {}, diffs: [], notes };
  }

  const diffs: StatDiff[] = [];
  const hasEquip = !!(options.heroEquipment || options.hasEquipment);

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
        suspectedCause: guessCause(field, delta, hasEquip),
      });
    }
  }

  notes.push(diffs.length === 0
    ? 'All observed stats match expected values within tolerance'
    : `${diffs.length} stat(s) differ from expected values`);

  return { observed, expected, diffs, notes };
}
