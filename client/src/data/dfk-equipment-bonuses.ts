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
  statusEffectResistance: number;
  critStrikeChance: number;
  critHealChance: number;
  critDamage: number;
  critLifesteal: number;
  lifesteal: number;
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
  // Specific status-effect resistances from armor bonus codes 10-23 (code → fraction)
  specificResists: Record<number, number>;
}

// Human-readable names for armor resistance bonus codes 10-23
export const ARMOR_RESIST_NAMES: Record<number, string> = {
  10: 'Blind',
  11: 'Silence',
  12: 'Fear',
  13: 'Stun',
  14: 'Bleed',
  15: 'Daze',
  16: 'Exhaust',
  17: 'Slow',
  18: 'Knockback',
  19: 'Poison',
  20: 'Sleep',
  21: 'Pull',
  22: 'Push',
  23: 'Charm',
};

function zeroEquipBonuses(): EquipmentBonuses {
  return {
    blkChance: 0, sblkChance: 0, blkReduction: 0, sblkReduction: 0,
    physicalDamage: 0, magicDamage: 0,
    retaliateAny: 0, retaliatePhysical: 0, retaliateMagical: 0, riposte: 0,
    recoveryChance: 0, statusEffectResistance: 0,
    critStrikeChance: 0, critHealChance: 0, critDamage: 0, critLifesteal: 0, lifesteal: 0,
    physDefPct: 0, magicDefPct: 0, physDefFlat: 0, magicDefFlat: 0,
    speed: 0, speedDown: 0, evasion: 0,
    physAccuracy: 0, magicAccuracy: 0, physAccuracyDown: 0, magicAccuracyDown: 0,
    physDamageReduction: 0, magicDamageReduction: 0,
    attackPct: 0, spellPct: 0, pierce: 0, pullRes: 0, pushRes: 0,
    healingPotencyDown: 0, channelTimeReduction: 0,
    specificResists: {},
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

    // Resistance codes 10-23: accumulate into specificResists keyed by code
    if (code >= 10 && code <= 23) {
      const frac = scalar / 10_000;
      acc.specificResists[code] = (acc.specificResists[code] ?? 0) + frac;
      continue;
    }

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

// ─── Pet bonus system ────────────────────────────────────────────────────────
// Pet combatBonus encodes both the skill and star tier in a single integer:
//   rawId 1-79  → 1-star (base code = rawId)
//   rawId 80-158 → 2-star (base code = rawId - 79)
//   rawId 160+   → 3-star (base code = rawId - 159)
// combatBonusScalar / 10_000 gives the decimal fraction.

export const PET_COMBAT_BASE_NAMES: Record<number, string> = {
  0: 'None', 2: 'Stone Hide', 3: 'Arcane Shell', 4: 'Recuperate',
  5: 'Magical Shell', 6: 'Heavy Hide', 7: 'Vorpal Soul', 8: 'Sharpened Claws',
  9: 'Attuned', 10: 'Hard Head', 11: 'Harder Head', 12: 'Graceful',
  13: 'Diamond Hands', 14: 'Impenetrable', 15: 'Resilient', 16: 'Relentless',
  17: 'Outspoken', 18: 'Lucid', 19: 'Brave', 20: 'Confident', 21: 'Inner Lids',
  22: 'Insulated', 23: 'Moist', 24: 'Studious', 25: 'Slippery', 26: 'Blur',
  27: 'Divine Intervention', 28: 'Rune Sniffer', 29: 'Threaten', 30: 'Hobble',
  31: 'Shock', 32: 'Bop', 33: 'Hush', 34: 'Befuddle', 35: 'Petrify',
  36: 'Tug', 37: 'Gash', 38: 'Infect', 39: 'Gouge', 40: 'Bruise', 41: 'Expose',
  42: 'Flash', 43: 'Mystify', 44: 'Freeze', 45: 'Char', 46: 'Good Eye',
  47: 'Third Eye', 48: 'Omni Shell', 49: 'Hardy Constitution', 50: 'Vampiric',
  51: 'Meat Shield', 52: 'Super Meat Shield', 53: 'Flow State', 54: 'Cleansing Aura',
  55: 'Lick Wounds', 56: 'Rescuer', 57: 'Amplify', 58: 'Intercept',
  59: 'Conservative', 60: 'Scavenger', 61: 'Ultra Conservative', 62: 'Reflector',
  63: 'Null Field', 64: 'Brick Wall', 65: 'Purifying Aura', 66: 'Swift Cast',
  67: 'Total Recall', 68: 'Zoomy', 69: 'Skin of Teeth', 70: 'Rebalance',
  71: 'Guardian Shell', 72: 'Healing Bond', 73: 'Foil', 74: 'Quicksand',
  75: 'Beastly Roar', 76: 'Maul', 77: 'Thwack', 78: 'Protective Coat',
};

export function decodePetBaseCode(rawId: number): number {
  if (rawId >= 160) return rawId - 159;
  if (rawId >= 80) return rawId - 79;
  return rawId;
}

export function decodePetStars(rawId: number): number {
  if (rawId >= 160) return 3;
  if (rawId >= 80) return 2;
  if (rawId >= 1) return 1;
  return 0;
}

export function getPetBonusName(rawId: number): string {
  const base = decodePetBaseCode(rawId);
  const stars = decodePetStars(rawId);
  const name = PET_COMBAT_BASE_NAMES[base] ?? `Bonus ${rawId}`;
  if (!stars) return name;
  const starStr = stars === 3 ? ' (★★★)' : stars === 2 ? ' (★★)' : ' (★)';
  return name + starStr;
}

// Maps base pet combat code → which EquipmentBonuses field it affects.
// 'omniDef' means both physDefPct + magicDefPct.
const PET_BASE_STAT_MAP: Record<number, keyof EquipmentBonuses | 'omniDef'> = {
  2: 'blkChance',              // Stone Hide
  3: 'sblkChance',             // Arcane Shell
  4: 'recoveryChance',         // Recuperate
  5: 'magicDefPct',            // Magical Shell
  6: 'physDefPct',             // Heavy Hide
  7: 'critStrikeChance',       // Vorpal Soul
  8: 'attackPct',              // Sharpened Claws
  9: 'spellPct',               // Attuned
  25: 'evasion',               // Slippery
  26: 'speed',                 // Blur
  27: 'critHealChance',        // Divine Intervention
  46: 'physAccuracy',          // Good Eye
  47: 'magicAccuracy',         // Third Eye
  48: 'omniDef',               // Omni Shell → both physDefPct + magicDefPct
  49: 'statusEffectResistance',// Hardy Constitution (SER — status effect resist)
  50: 'lifesteal',             // Vampiric
  63: 'magicDamageReduction',  // Null Field
  64: 'physDamageReduction',   // Brick Wall
};

// Short display label for pet bonus codes that don't map to an EquipmentBonuses field.
// Used in the hero modal to annotate what the pet's bonus affects.
const PET_STAT_LABEL_MAP: Record<number, string> = {
  10: 'Daze Resist',     // Hard Head
  11: 'Stun Resist',     // Harder Head
  12: 'Push/Pull Resist',// Graceful
  13: 'Disarm Resist',   // Diamond Hands
  14: 'Bleed Resist',    // Impenetrable
  15: 'Poison Resist',   // Resilient
  16: 'Slow Resist',     // Relentless
  17: 'Silence Resist',  // Outspoken
  18: 'Confuse Resist',  // Lucid
  19: 'Fear Resist',     // Brave
  20: 'Intimidate Resist',// Confident
  21: 'Blind Resist',    // Inner Lids
  22: 'Chill Resist',    // Insulated
  23: 'Burn Resist',     // Moist
  24: 'XP Bonus',        // Studious
  28: 'Rune Drop',       // Rune Sniffer
  51: 'Barrier (self)',  // Meat Shield
  52: 'Barrier (party)', // Super Meat Shield
  60: 'Rare Loot',       // Scavenger
};

export function getPetStatLabel(rawId: number): string | null {
  const base = decodePetBaseCode(rawId);
  return PET_STAT_LABEL_MAP[base] ?? null;
}

export function computePetBonuses(
  pet: { combatBonus: number; combatBonusScalar: number } | null | undefined
): Partial<EquipmentBonuses> {
  if (!pet || !pet.combatBonus) return {};
  const base = decodePetBaseCode(pet.combatBonus);
  const effect = PET_BASE_STAT_MAP[base];
  if (!effect) return {};
  const value = (pet.combatBonusScalar ?? 0) / 10_000;
  if (effect === 'omniDef') {
    return { physDefPct: value, magicDefPct: value };
  }
  return { [effect]: value };
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
