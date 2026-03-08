// DFK Ability data extracted from the DFK game client (game.defikingdoms.com)
// Active skills (DSe) and passive skills (O9t) indexed by traitId
// These correspond to hero.active1/active2 and hero.passive1/passive2 fields
// Passive effect values sourced from: docs.defikingdoms.com/gameplay/combat (last verified 2026-03)

export type AbilityRarity = 'basic' | 'advanced' | 'elite' | 'exalted';

export interface Ability {
  key: string;
  label: string;
  rarity: AbilityRarity;
  traitId: number;
}

// ─── Passive Skill Effects ────────────────────────────────────────────────────
// Numeric combat effects for each passive skill.
// Static bonuses apply before combat (always on).
// crossTeam: true means the skill's effect is applied against / to the opposing team,
//   not just as a self-benefit (Leadership buffs own allies; Menacing debuffs enemies).

export interface PassiveEffect {
  evaBonus?: number;
  blkBonus?: number;
  sblkBonus?: number;
  serBonus?: number;
  statusResistNote?: string;
  conditionalNote?: string;
  crossTeam?: boolean;
  survivabilityScore?: number;
  dpsScore?: number;
}

export const PASSIVE_EFFECTS: Record<number, PassiveEffect> = {
  // Basic 1 — Duelist
  // Gain +2.5% Block and Spell Block. When fighting 1v1, +20% damage dealt.
  0:  { blkBonus: 0.025, sblkBonus: 0.025, dpsScore: 0.02,
        conditionalNote: '+20% dmg when 1v1' },

  // Basic 2 — Clutch
  // +20% damage dealt when below 25% HP.
  1:  { survivabilityScore: 0.02,
        conditionalNote: '+20% dmg when HP <25%' },

  // Basic 3 — Foresight
  // Gain +3% Evasion.
  2:  { evaBonus: 0.03, dpsScore: 0.01,
        conditionalNote: '+3% EVA (always on)' },

  // Basic 4 — Headstrong
  // +32.5% Daze resistance, +2.5% Status Effect Resistance.
  3:  { serBonus: 0.025, statusResistNote: 'Daze -32.5%',
        conditionalNote: '+32.5% Daze resist, +2.5% SER' },

  // Basic 5 — Clear Vision
  // +32.5% Blind resistance, +2.5% Status Effect Resistance.
  4:  { serBonus: 0.025, statusResistNote: 'Blind -32.5%',
        conditionalNote: '+32.5% Blind resist, +2.5% SER' },

  // Basic 6 — Fearless
  // +32.5% Fear resistance, +2.5% Status Effect Resistance.
  5:  { serBonus: 0.025, statusResistNote: 'Fear -32.5%',
        conditionalNote: '+32.5% Fear resist, +2.5% SER' },

  // Basic 7 — Chatterbox
  // +32.5% Silence resistance, +2.5% Status Effect Resistance.
  6:  { serBonus: 0.025, statusResistNote: 'Silence -32.5%',
        conditionalNote: '+32.5% Silence resist, +2.5% SER' },

  // Basic 8 — Stalwart
  // +32.5% POISON resistance, +2.5% Status Effect Resistance.
  // NOTE: This is Poison resist — NOT knockback/push resist.
  7:  { serBonus: 0.025, statusResistNote: 'Poison -32.5%',
        conditionalNote: '+32.5% Poison resist, +2.5% SER' },

  // Advanced 1 — Leadership
  // Each ALLY deals +5% more damage (max +15% across 3 heroes).
  // crossTeam: true — boosts own team's effective DPS output.
  16: { crossTeam: true,
        conditionalNote: '+5% ally dmg per hero (cap +15%)' },

  // Advanced 2 — Efficient
  // -10% Mana consumption.
  17: { conditionalNote: '-10% Mana cost' },

  // Advanced 3 — Menacing
  // Enemies deal -5% less damage (max -15% across 3 heroes).
  // crossTeam: true — reduces the OPPOSING team's effective DPS.
  18: { crossTeam: true,
        conditionalNote: '-5% enemy dmg per hero (cap -15%)' },

  // Advanced 4 — Toxic
  // Each hit gains +3% chance to apply Poison.
  19: { dpsScore: 0.03,
        conditionalNote: '+3% Poison chance per hit' },

  // Elite 1 — Giant Slayer
  // +10% damage if target has more HP; +20% if target has 2× HP (Hero only).
  24: { dpsScore: 0.04,
        conditionalNote: '+10%/+20% dmg vs HP-heavy targets' },

  // Elite 2 — Last Stand
  // When HP drops below 30%, damage is capped so ≥10% HP remains, then
  // +300% P.DEF and M.DEF for 15 ticks. Once per battle.
  25: { survivabilityScore: 0.06,
        conditionalNote: 'HP floor at 10% + +300% P/M.DEF for 15 ticks (1× per battle)' },

  // Exalted 1 — Second Life
  // Upon death, revive with 35% HP, Exhausted for 1 turn, +750 Initiative. Once per battle.
  28: { survivabilityScore: 0.15,
        conditionalNote: 'Revive at 35% HP, +750 Initiative (1× per battle)' },
};

export function getPassiveEffects(traitId: number | null | undefined): PassiveEffect | null {
  if (traitId == null) return null;
  return PASSIVE_EFFECTS[traitId] ?? null;
}

// ─── Active Skills (DSe in DFK game client) ──────────────────────────────────
// hero.active1 and hero.active2 are traitIds into this table

export const ACTIVE_SKILLS: Record<number, Ability> = {
  0:  { key: 'Basic1',    label: 'Poisoned Blade',  rarity: 'basic',    traitId: 0  },
  1:  { key: 'Basic2',    label: 'Blinding Winds',  rarity: 'basic',    traitId: 1  },
  2:  { key: 'Basic3',    label: 'Heal',             rarity: 'basic',    traitId: 2  },
  3:  { key: 'Basic4',    label: 'Cleanse',          rarity: 'basic',    traitId: 3  },
  4:  { key: 'Basic5',    label: 'Iron Skin',        rarity: 'basic',    traitId: 4  },
  5:  { key: 'Basic6',    label: 'Speed',            rarity: 'basic',    traitId: 5  },
  6:  { key: 'Basic7',    label: 'Critical Aim',     rarity: 'basic',    traitId: 6  },
  7:  { key: 'Basic8',    label: 'Deathmark',        rarity: 'basic',    traitId: 7  },
  16: { key: 'Advanced1', label: 'Exhaust',          rarity: 'advanced', traitId: 16 },
  17: { key: 'Advanced2', label: 'Daze',             rarity: 'advanced', traitId: 17 },
  18: { key: 'Advanced3', label: 'Explosion',        rarity: 'advanced', traitId: 18 },
  19: { key: 'Advanced4', label: 'Hardened Shield',  rarity: 'advanced', traitId: 19 },
  24: { key: 'Elite1',    label: 'Stun',             rarity: 'elite',    traitId: 24 },
  25: { key: 'Elite2',    label: 'Second Wind',      rarity: 'elite',    traitId: 25 },
  28: { key: 'Exalted1',  label: 'Resurrection',     rarity: 'exalted',  traitId: 28 },
};

// ─── Passive Skills (O9t in DFK game client) ─────────────────────────────────
// hero.passive1 and hero.passive2 are traitIds into this table

export const PASSIVE_SKILLS: Record<number, Ability> = {
  0:  { key: 'Basic1',    label: 'Duelist',       rarity: 'basic',    traitId: 0  },
  1:  { key: 'Basic2',    label: 'Clutch',        rarity: 'basic',    traitId: 1  },
  2:  { key: 'Basic3',    label: 'Foresight',     rarity: 'basic',    traitId: 2  },
  3:  { key: 'Basic4',    label: 'Headstrong',    rarity: 'basic',    traitId: 3  },
  4:  { key: 'Basic5',    label: 'Clear Vision',  rarity: 'basic',    traitId: 4  },
  5:  { key: 'Basic6',    label: 'Fearless',      rarity: 'basic',    traitId: 5  },
  6:  { key: 'Basic7',    label: 'Chatterbox',    rarity: 'basic',    traitId: 6  },
  7:  { key: 'Basic8',    label: 'Stalwart',      rarity: 'basic',    traitId: 7  },
  16: { key: 'Advanced1', label: 'Leadership',    rarity: 'advanced', traitId: 16 },
  17: { key: 'Advanced2', label: 'Efficient',     rarity: 'advanced', traitId: 17 },
  18: { key: 'Advanced3', label: 'Menacing',      rarity: 'advanced', traitId: 18 },
  19: { key: 'Advanced4', label: 'Toxic',         rarity: 'advanced', traitId: 19 },
  24: { key: 'Elite1',    label: 'Giant Slayer',  rarity: 'elite',    traitId: 24 },
  25: { key: 'Elite2',    label: 'Last Stand',    rarity: 'elite',    traitId: 25 },
  28: { key: 'Exalted1',  label: 'Second Life',   rarity: 'exalted',  traitId: 28 },
};

// ─── Rarity display helpers ───────────────────────────────────────────────────

export const ABILITY_RARITY_COLORS: Record<AbilityRarity, string> = {
  basic:    'text-muted-foreground',
  advanced: 'text-blue-400',
  elite:    'text-purple-400',
  exalted:  'text-amber-400',
};

export const ABILITY_RARITY_BORDER: Record<AbilityRarity, string> = {
  basic:    'border-border',
  advanced: 'border-blue-500/40',
  elite:    'border-purple-500/40',
  exalted:  'border-amber-500/40',
};

// ─── Lookup functions ─────────────────────────────────────────────────────────

export function getActiveSkill(traitId: number | null | undefined): Ability | null {
  if (traitId == null) return null;
  return ACTIVE_SKILLS[traitId] ?? null;
}

export function getPassiveSkill(traitId: number | null | undefined): Ability | null {
  if (traitId == null) return null;
  return PASSIVE_SKILLS[traitId] ?? null;
}

export function getActiveSkillName(traitId: number | null | undefined): string | null {
  return getActiveSkill(traitId)?.label ?? null;
}

export function getPassiveSkillName(traitId: number | null | undefined): string | null {
  return getPassiveSkill(traitId)?.label ?? null;
}

// ─── Crafting professions (W8 in DFK game client) ────────────────────────────
// stat indices: 0=STR, 1=DEX, 2=AGI, 3=INT, 4=WIS, 5=VIT, 6=END, 7=LCK

export const CRAFTING_PROFESSIONS = {
  Blacksmithing:  { stat1: 0, stat2: 6, element: 0  },
  Goldsmithing:   { stat1: 1, stat2: 7, element: 2  },
  Armorsmithing:  { stat1: 4, stat2: 2, element: 4  },
  Woodworking:    { stat1: 3, stat2: 1, element: 6  },
  Leatherworking: { stat1: 2, stat2: 0, element: 8  },
  Tailoring:      { stat1: 6, stat2: 4, element: 10 },
  Enchanting:     { stat1: 5, stat2: 3, element: 12 },
  Alchemy:        { stat1: 7, stat2: 5, element: 14 },
} as const;
