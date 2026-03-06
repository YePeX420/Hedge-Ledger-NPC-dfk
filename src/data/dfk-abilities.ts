// DFK Ability data extracted from the DFK game client (game.defikingdoms.com)
// Active skills (DSe) and passive skills (O9t) indexed by traitId
// These correspond to hero.active1/active2 and hero.passive1/passive2 fields

export type AbilityRarity = 'basic' | 'advanced' | 'elite' | 'exalted';

export interface Ability {
  key: string;
  label: string;
  rarity: AbilityRarity;
  traitId: number;
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
