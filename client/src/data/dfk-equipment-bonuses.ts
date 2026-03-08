// Context-sensitive equipment bonus code maps for DFK.
// Do NOT merge these into a single global enum — the same code number means
// different things depending on which contract/slot it comes from.
//
// Source: DFK official developer docs (WeaponCore / ArmorCore / AccessoryCore).
// BonusScalar scale: divided by 10_000 for percentage effects (working approximation).

// ─── Bonus Maps ───────────────────────────────────────────────────────────────

export const WEAPON_BONUS = {
  20: 'blkChance',
  21: 'sblkChance',
  22: 'critDamage',
  23: 'critStrikeChance',
  25: 'pierce',
  26: 'blkReduction',
  27: 'sblkReduction',
  28: 'magicDamageUp_healPotencyDown',
  29: 'healPotencyUp_magicDamageDown',
  30: 'physAndMagicDefDown',
  31: 'healPotencyDown',
  32: 'magicDamage',
  33: 'physicalDamage',
  34: 'retaliateAny',
  35: 'retaliatePhysical',
  36: 'retaliateMagical',
  41: 'critHealChance',
} as const;

export const ARMOR_BONUS = {
  1: 'blkChance',
  2: 'sblkChance',
  3: 'blkReduction',
  4: 'sblkReduction',
  5: 'physAccuracy',
  6: 'magicAccuracy',
  7: 'speed',
  8: 'evasion',
  29: 'physDefPct',
  30: 'magicDefPct',
  31: 'physAccuracyDown',
  32: 'magicAccuracyDown',
  33: 'physicalDamage',
  34: 'magicDamage',
  35: 'riposte',
  39: 'retaliatePhysical',
  41: 'recoveryChance',
  54: 'speedDown',
  55: 'healingPotencyDown',
  56: 'critLifesteal',
  57: 'critStrikeChance',
  58: 'channelTimeReduction',
  // Prefix doublers (36-53) — handled separately in processArmorBonuses
  36: '__double_ifAccessory',
  37: '__double_ifOffhand',
  38: '__double_if1HSword',
  42: '__double_if2HSword',
  43: '__double_if1HAxe',
  44: '__double_if2HAxe',
  45: '__double_if1HMace',
  46: '__double_if2HMace',
  47: '__double_if1HSpear',
  48: '__double_if2HSpear',
  49: '__double_ifWand',
  50: '__double_ifStaff',
  51: '__double_ifGloves',
  52: '__double_ifBow',
  53: '__double_ifDagger',
} as const;

export const ACCESSORY_BONUS = {
  1: 'physAccuracy',
  2: 'magicAccuracy',
  3: 'blkChance',
  4: 'sblkChance',
  5: 'speed',
  6: 'evasion',
  26: 'critDamage',
  27: 'physDefPct',
  28: 'magicDefPct',
  29: 'physAccuracyDown',
  30: 'magicAccuracyDown',
  31: 'physicalDamage',
  32: 'magicDamage',
  33: 'riposte',
  34: 'attackPct',
  35: 'spellPct',
  37: 'physDamageReduction',
  38: 'magicDamageReduction',
} as const;

export const OFFHAND_BONUS = {
  1: 'blkChance',
  2: 'blkReduction',
  3: 'sblkChance',
  4: 'sblkReduction',
  5: 'riposte',
  6: 'physDefFlat',
  7: 'magicDefFlat',
  8: 'pullRes',
  9: 'pushRes',
} as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function getAccessoryBonusTable(equipmentType: number) {
  if (equipmentType === 1) return ACCESSORY_BONUS;
  if (equipmentType === 2 || equipmentType === 3) return OFFHAND_BONUS;
  return null;
}

/**
 * Official DFK encoding from weapon docs.
 * Raw values >= 128 encode a negative speed modifier.
 * e.g. raw=5 → +5, raw=133 → -5 (128+5, Math.floor(133/128)=1 → (1-2)*5 = -5)
 */
export function decodeWeaponSpeedModifier(raw: number): number {
  if (!raw) return 0;
  return (1 - 2 * Math.floor(raw / 128)) * (raw % 128);
}

// ─── Aggregated bonus output ──────────────────────────────────────────────────

export interface EquipmentBonuses {
  blkChance: number;
  sblkChance: number;
  blkReduction: number;
  sblkReduction: number;
  physicalDamage: number;
  magicDamage: number;
  retaliateAny: number;
  retaliatePhysical: number;
  retaliateMagical: number;
  riposte: number;
  recoveryChance: number;
  critStrikeChance: number;
  critHealChance: number;
  critDamage: number;
  critLifesteal: number;
  physDefPct: number;
  magicDefPct: number;
  physDefFlat: number;
  magicDefFlat: number;
  speed: number;
  speedDown: number;
  evasion: number;
  physAccuracy: number;
  magicAccuracy: number;
  physAccuracyDown: number;
  magicAccuracyDown: number;
  physDamageReduction: number;
  magicDamageReduction: number;
  attackPct: number;
  spellPct: number;
  pierce: number;
  pullRes: number;
  pushRes: number;
  healingPotencyDown: number;
  channelTimeReduction: number;
}

function zeroEquipBonuses(): EquipmentBonuses {
  return {
    blkChance: 0, sblkChance: 0, blkReduction: 0, sblkReduction: 0,
    physicalDamage: 0, magicDamage: 0,
    retaliateAny: 0, retaliatePhysical: 0, retaliateMagical: 0, riposte: 0,
    recoveryChance: 0, critStrikeChance: 0, critHealChance: 0, critDamage: 0, critLifesteal: 0,
    physDefPct: 0, magicDefPct: 0, physDefFlat: 0, magicDefFlat: 0,
    speed: 0, speedDown: 0, evasion: 0,
    physAccuracy: 0, magicAccuracy: 0, physAccuracyDown: 0, magicAccuracyDown: 0,
    physDamageReduction: 0, magicDamageReduction: 0,
    attackPct: 0, spellPct: 0, pierce: 0, pullRes: 0, pushRes: 0,
    healingPotencyDown: 0, channelTimeReduction: 0,
  };
}

function applyBonus(
  acc: EquipmentBonuses,
  effectKey: string,
  scalar: number,
  contrib: Partial<Record<keyof EquipmentBonuses, number>>
): void {
  if (!effectKey || effectKey.startsWith('__')) return;
  const key = effectKey as keyof EquipmentBonuses;
  if (!(key in acc)) return;
  const value = scalar / 10_000;
  acc[key] = (acc[key] as number) + value;
  contrib[key] = ((contrib[key] as number) ?? 0) + value;
}

// Process up to 4 bonus slots from a weapon (WeaponCore)
function processWeaponBonuses(
  bonus1: number, scalar1: number,
  bonus2: number, scalar2: number,
  bonus3: number, scalar3: number,
  bonus4: number, scalar4: number,
  acc: EquipmentBonuses
): void {
  const slots: [number, number][] = [
    [bonus1, scalar1], [bonus2, scalar2], [bonus3, scalar3], [bonus4, scalar4],
  ];
  const dummy: Partial<Record<keyof EquipmentBonuses, number>> = {};
  for (const [code, scalar] of slots) {
    if (!code) continue;
    const effectKey = (WEAPON_BONUS as any)[code];
    if (effectKey) applyBonus(acc, effectKey, scalar, dummy);
  }
}

// Process up to 5 bonus slots from an armor (ArmorCore), with prefix-doubler logic.
// Prefix doublers (codes 36-53): double all bonuses contributed earlier in this armor's slot list.
function processArmorBonuses(
  bonus1: number, scalar1: number,
  bonus2: number, scalar2: number,
  bonus3: number, scalar3: number,
  bonus4: number, scalar4: number,
  bonus5: number, scalar5: number,
  acc: EquipmentBonuses
): void {
  const slots: [number, number][] = [
    [bonus1, scalar1], [bonus2, scalar2], [bonus3, scalar3], [bonus4, scalar4], [bonus5, scalar5],
  ];
  // Running contributions from THIS armor — used to apply prefix doublers correctly
  const contrib: Partial<Record<keyof EquipmentBonuses, number>> = {};

  for (const [code, scalar] of slots) {
    if (!code) continue;
    const effectKey = (ARMOR_BONUS as any)[code];
    if (!effectKey) continue;

    if (effectKey.startsWith('__double_')) {
      // Prefix doubler: add the running contributions again (doubling them in the total)
      for (const [key, val] of Object.entries(contrib) as [keyof EquipmentBonuses, number][]) {
        acc[key] = (acc[key] as number) + val;
        // Compound — re-add to contrib so subsequent doublers stack
        contrib[key] = ((contrib[key] as number) ?? 0) + val;
      }
    } else {
      applyBonus(acc, effectKey, scalar, contrib);
    }
  }
}

// Process up to 5 bonus slots from an accessory or offhand (AccessoryCore).
// Route by equipmentType: 1=Accessory, 2/3=Offhand/Shield/Focus
function processAccessoryBonuses(
  equipmentType: number,
  bonus1: number, scalar1: number,
  bonus2: number, scalar2: number,
  bonus3: number, scalar3: number,
  bonus4: number, scalar4: number,
  bonus5: number, scalar5: number,
  acc: EquipmentBonuses
): void {
  const table = getAccessoryBonusTable(equipmentType);
  if (!table) return;
  const slots: [number, number][] = [
    [bonus1, scalar1], [bonus2, scalar2], [bonus3, scalar3], [bonus4, scalar4], [bonus5, scalar5],
  ];
  const dummy: Partial<Record<keyof EquipmentBonuses, number>> = {};
  for (const [code, scalar] of slots) {
    if (!code) continue;
    const effectKey = (table as any)[code];
    if (effectKey) applyBonus(acc, effectKey, scalar, dummy);
  }
}

// ─── Hero-level entry point ───────────────────────────────────────────────────

interface BonusSlots4 {
  bonus1: number; bonus2: number; bonus3: number; bonus4: number;
  bonusScalar1: number; bonusScalar2: number; bonusScalar3: number; bonusScalar4: number;
  speedModifier?: number;
}
interface BonusSlots5 {
  bonus1: number; bonus2: number; bonus3: number; bonus4: number; bonus5: number;
  bonusScalar1: number; bonusScalar2: number; bonusScalar3: number; bonusScalar4: number; bonusScalar5: number;
}
interface AccessorySlots extends BonusSlots5 { equipmentType: number; }

interface HeroEquipmentInput {
  weapon1?: BonusSlots4 | null;
  weapon2?: BonusSlots4 | null;
  armor?: BonusSlots5 | null;
  accessory?: AccessorySlots | null;
  offhand1?: AccessorySlots | null;
  offhand2?: AccessorySlots | null;
}

export function computeEquipmentBonuses(hero: HeroEquipmentInput): EquipmentBonuses {
  const acc = zeroEquipBonuses();

  if (hero.weapon1) {
    const w = hero.weapon1;
    processWeaponBonuses(
      w.bonus1, w.bonusScalar1, w.bonus2, w.bonusScalar2,
      w.bonus3, w.bonusScalar3, w.bonus4, w.bonusScalar4,
      acc
    );
    acc.speed += decodeWeaponSpeedModifier(w.speedModifier ?? 0);
  }

  if (hero.weapon2) {
    const w = hero.weapon2;
    processWeaponBonuses(
      w.bonus1, w.bonusScalar1, w.bonus2, w.bonusScalar2,
      w.bonus3, w.bonusScalar3, w.bonus4, w.bonusScalar4,
      acc
    );
    acc.speed += decodeWeaponSpeedModifier(w.speedModifier ?? 0);
  }

  if (hero.armor) {
    const a = hero.armor;
    processArmorBonuses(
      a.bonus1, a.bonusScalar1, a.bonus2, a.bonusScalar2,
      a.bonus3, a.bonusScalar3, a.bonus4, a.bonusScalar4,
      a.bonus5, a.bonusScalar5,
      acc
    );
  }

  if (hero.accessory) {
    const x = hero.accessory;
    processAccessoryBonuses(
      x.equipmentType,
      x.bonus1, x.bonusScalar1, x.bonus2, x.bonusScalar2,
      x.bonus3, x.bonusScalar3, x.bonus4, x.bonusScalar4,
      x.bonus5, x.bonusScalar5,
      acc
    );
  }

  if (hero.offhand1) {
    const o = hero.offhand1;
    processAccessoryBonuses(
      o.equipmentType,
      o.bonus1, o.bonusScalar1, o.bonus2, o.bonusScalar2,
      o.bonus3, o.bonusScalar3, o.bonus4, o.bonusScalar4,
      o.bonus5, o.bonusScalar5,
      acc
    );
  }

  if (hero.offhand2) {
    const o = hero.offhand2;
    processAccessoryBonuses(
      o.equipmentType,
      o.bonus1, o.bonusScalar1, o.bonus2, o.bonusScalar2,
      o.bonus3, o.bonusScalar3, o.bonus4, o.bonusScalar4,
      o.bonus5, o.bonusScalar5,
      acc
    );
  }

  return acc;
}
