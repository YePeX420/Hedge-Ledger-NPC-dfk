// DFK Global Ability Formulas — extracted from DFK game bundle (game.defikingdoms.com)
// Used for pre/during match comp analysis and DPS projections.
// Keys match the label field in ACTIVE_SKILLS / PASSIVE_SKILLS in dfk-abilities.ts

export interface HeroStats {
  str: number;
  dex: number;
  agi: number;
  int: number;
  wis: number;
  vit: number;
  end: number;
  lck: number;
}

export type AbilityType =
  | 'physical_damage'
  | 'magical_damage'
  | 'heal'
  | 'buff'
  | 'debuff'
  | 'cc'
  | 'passive';

export type CcType =
  | 'stun'
  | 'exhaust'
  | 'daze'
  | 'deathmark'
  | 'poison'
  | null;

export type TargetType =
  | 'single_enemy'
  | 'aoe_enemy'
  | 'single_ally'
  | 'self'
  | 'aoe_ally';

export interface AbilityFormula {
  type: AbilityType;
  manaCost: number;
  formulaStr: string;
  formulaFn: (stats: HeroStats) => number;
  ccType: CcType;
  targetType: TargetType;
  description: string;
}

// ─── Active Skill Formulas ────────────────────────────────────────────────────

export const ABILITY_FORMULAS: Record<string, AbilityFormula> = {

  // ── Basic Actives ──────────────────────────────────────────────────────────

  'Poisoned Blade': {
    type: 'physical_damage',
    manaCost: 20,
    formulaStr: '0.5×(STR+DEX) + 0.5×DEX + poison DoT',
    formulaFn: (s) => 0.5 * (s.str + s.dex) + 0.5 * s.dex,
    ccType: 'poison',
    targetType: 'single_enemy',
    description: 'Deals physical damage and applies a poison damage-over-time effect that persists for several turns.',
  },

  'Blinding Winds': {
    type: 'physical_damage',
    manaCost: 15,
    formulaStr: '0.75×(STR+DEX) + 0.5×AGI',
    formulaFn: (s) => 0.75 * (s.str + s.dex) + 0.5 * s.agi,
    ccType: null,
    targetType: 'single_enemy',
    description: 'Deals physical damage and reduces the target\'s accuracy, causing them to miss attacks more frequently.',
  },

  'Heal': {
    type: 'heal',
    manaCost: 25,
    formulaStr: '1.0×INT + 1.5×WIS + 0.5×VIT',
    formulaFn: (s) => 1.0 * s.int + 1.5 * s.wis + 0.5 * s.vit,
    ccType: null,
    targetType: 'single_ally',
    description: 'Restores HP to a single ally. Scales strongly with Wisdom and Intelligence.',
  },

  'Cleanse': {
    type: 'buff',
    manaCost: 15,
    formulaStr: '0 damage — removes all debuffs',
    formulaFn: (_s) => 0,
    ccType: null,
    targetType: 'single_ally',
    description: 'Removes all debuffs and status effects from a single ally. No damage.',
  },

  'Iron Skin': {
    type: 'buff',
    manaCost: 20,
    formulaStr: '0 damage — DEF +END×0.5',
    formulaFn: (_s) => 0,
    ccType: null,
    targetType: 'self',
    description: 'Grants a large defensive boost to self for several turns. Scales with Endurance.',
  },

  'Speed': {
    type: 'buff',
    manaCost: 15,
    formulaStr: '0 damage — AGI +AGI×0.4',
    formulaFn: (_s) => 0,
    ccType: null,
    targetType: 'self',
    description: 'Greatly increases own Agility (initiative order), allowing the hero to act before opponents. Scales with AGI.',
  },

  'Critical Aim': {
    type: 'buff',
    manaCost: 15,
    formulaStr: '0 damage — crit rate +LCK×0.3',
    formulaFn: (_s) => 0,
    ccType: null,
    targetType: 'self',
    description: 'Increases critical hit rate for the next several attacks. Scales with Luck.',
  },

  'Deathmark': {
    type: 'debuff',
    manaCost: 20,
    formulaStr: '0 damage — target takes +25% damage',
    formulaFn: (_s) => 0,
    ccType: 'deathmark',
    targetType: 'single_enemy',
    description: 'Marks an enemy target, causing them to take 25% increased damage from all sources for the rest of the battle.',
  },

  // ── Advanced Actives ───────────────────────────────────────────────────────

  'Exhaust': {
    type: 'cc',
    manaCost: 30,
    formulaStr: '0 damage — drains WIS×0.8 mana',
    formulaFn: (_s) => 0,
    ccType: 'exhaust',
    targetType: 'single_enemy',
    description: 'Advanced. Drains a large portion of the target\'s mana pool, disrupting their ability rotation. Scales with Wisdom.',
  },

  'Daze': {
    type: 'cc',
    manaCost: 25,
    formulaStr: '0 damage — reduces ATK and AGI',
    formulaFn: (_s) => 0,
    ccType: 'daze',
    targetType: 'single_enemy',
    description: 'Advanced. Reduces the target\'s attack power and agility for several turns, slowing their offense and initiative.',
  },

  'Explosion': {
    type: 'magical_damage',
    manaCost: 35,
    formulaStr: '1.5×(INT+WIS) + 0.5×INT, AOE',
    formulaFn: (s) => 1.5 * (s.int + s.wis) + 0.5 * s.int,
    ccType: null,
    targetType: 'aoe_enemy',
    description: 'Advanced. Deals heavy magical damage to all enemies. Strong AOE burst. Scales with Intelligence and Wisdom.',
  },

  'Hardened Shield': {
    type: 'buff',
    manaCost: 25,
    formulaStr: '0 damage — DEF +END×0.75, team buff',
    formulaFn: (_s) => 0,
    ccType: null,
    targetType: 'aoe_ally',
    description: 'Advanced. Grants a significant defensive boost to the entire team for multiple turns. Scales with Endurance.',
  },

  // ── Elite Actives ──────────────────────────────────────────────────────────

  'Stun': {
    type: 'cc',
    manaCost: 35,
    formulaStr: '0 damage — disables target 1 turn',
    formulaFn: (_s) => 0,
    ccType: 'stun',
    targetType: 'single_enemy',
    description: 'Elite. Stuns a single enemy, preventing them from acting for one full turn. Most powerful single-target CC.',
  },

  'Second Wind': {
    type: 'heal',
    manaCost: 40,
    formulaStr: '50% max HP self-heal + VIT×0.5',
    formulaFn: (s) => s.vit * 0.5,
    ccType: null,
    targetType: 'self',
    description: 'Elite. Restores approximately 50% of maximum HP to self in one action. Powerful self-sustain for solo heroes.',
  },

  // ── Exalted Actives ────────────────────────────────────────────────────────

  'Resurrection': {
    type: 'heal',
    manaCost: 60,
    formulaStr: '50% max HP revive on fallen ally + VIT×0.3',
    formulaFn: (s) => s.vit * 0.3,
    ccType: null,
    targetType: 'single_ally',
    description: 'Exalted. Revives a fallen ally with approximately 50% of their maximum HP. Game-changing in multi-hero formats.',
  },

  // ─── Passive Abilities ────────────────────────────────────────────────────

  'Duelist': {
    type: 'passive',
    manaCost: 0,
    formulaStr: '+LCK×0.3% crit damage',
    formulaFn: (s) => s.lck * 0.3,
    ccType: null,
    targetType: 'self',
    description: 'Increases critical hit damage multiplier. Scales with Luck. Excellent for burst damage builds.',
  },

  'Clutch': {
    type: 'passive',
    manaCost: 0,
    formulaStr: '+ATK×0.25 when HP < 30%',
    formulaFn: (s) => (s.str + s.dex) * 0.25,
    ccType: null,
    targetType: 'self',
    description: 'Boosts attack power when the hero\'s HP falls below 30%. Activates automatically in desperate situations.',
  },

  'Foresight': {
    type: 'passive',
    manaCost: 0,
    formulaStr: '+AGI×0.4% dodge chance',
    formulaFn: (s) => s.agi * 0.4,
    ccType: null,
    targetType: 'self',
    description: 'Passively increases evasion/dodge chance. Scales with Agility. Strong against physical attackers.',
  },

  'Headstrong': {
    type: 'passive',
    manaCost: 0,
    formulaStr: 'CC resist +END×0.3%',
    formulaFn: (s) => s.end * 0.3,
    ccType: null,
    targetType: 'self',
    description: 'Reduces duration and chance of crowd control effects landing. Scales with Endurance.',
  },

  'Clear Vision': {
    type: 'passive',
    manaCost: 0,
    formulaStr: '+DEX×0.4% accuracy',
    formulaFn: (s) => s.dex * 0.4,
    ccType: null,
    targetType: 'self',
    description: 'Increases accuracy (hit rate), ensuring attacks land more reliably. Scales with Dexterity.',
  },

  'Fearless': {
    type: 'passive',
    manaCost: 0,
    formulaStr: '+STR×0.3 ATK when HP < 50%',
    formulaFn: (s) => s.str * 0.3,
    ccType: null,
    targetType: 'self',
    description: 'Increases attack power when the hero\'s HP drops below 50%. Rewards aggressive play at low health.',
  },

  'Chatterbox': {
    type: 'passive',
    manaCost: 0,
    formulaStr: 'Reduces ally cooldowns by 1 turn (WIS-scaled)',
    formulaFn: (s) => s.wis * 0.2,
    ccType: null,
    targetType: 'aoe_ally',
    description: 'Reduces cooldown timers on allies\' abilities, letting the team use powerful skills more frequently. Scales with Wisdom.',
  },

  'Stalwart': {
    type: 'passive',
    manaCost: 0,
    formulaStr: '+VIT×0.5 max HP',
    formulaFn: (s) => s.vit * 0.5,
    ccType: null,
    targetType: 'self',
    description: 'Permanently increases maximum HP. Scales with Vitality. Improves survivability across the board.',
  },

  'Leadership': {
    type: 'passive',
    manaCost: 0,
    formulaStr: 'Team +STR×0.2 ATK & +AGI×0.15 AGI (advanced)',
    formulaFn: (s) => s.str * 0.2,
    ccType: null,
    targetType: 'aoe_ally',
    description: 'Advanced. Passively boosts attack power and agility for all allies. One of the strongest team-wide passive buffs.',
  },

  'Efficient': {
    type: 'passive',
    manaCost: 0,
    formulaStr: 'Mana cost -WIS×0.3 (advanced)',
    formulaFn: (s) => s.wis * 0.3,
    ccType: null,
    targetType: 'self',
    description: 'Advanced. Reduces the mana cost of all this hero\'s abilities, allowing more skill usage per battle. Scales with Wisdom.',
  },

  'Menacing': {
    type: 'passive',
    manaCost: 0,
    formulaStr: '+INT×0.25 debuff potency (advanced)',
    formulaFn: (s) => s.int * 0.25,
    ccType: null,
    targetType: 'single_enemy',
    description: 'Advanced. Increases the effectiveness and duration of debuffs applied by this hero. Scales with Intelligence.',
  },

  'Toxic': {
    type: 'passive',
    manaCost: 0,
    formulaStr: '+DEX×0.35 poison DoT damage (advanced)',
    formulaFn: (s) => s.dex * 0.35,
    ccType: 'poison',
    targetType: 'single_enemy',
    description: 'Advanced. Amplifies poison and damage-over-time effects applied by this hero. Scales with Dexterity.',
  },

  'Giant Slayer': {
    type: 'passive',
    manaCost: 0,
    formulaStr: '+15% dmg vs targets >80% HP (elite)',
    formulaFn: (_s) => 0,
    ccType: null,
    targetType: 'single_enemy',
    description: 'Elite. Deals bonus damage to high-HP targets. Powerful for burst openers and punishing tanky opponents.',
  },

  'Last Stand': {
    type: 'passive',
    manaCost: 0,
    formulaStr: '+STR×0.8 ATK when HP < 15% (elite)',
    formulaFn: (s) => s.str * 0.8,
    ccType: null,
    targetType: 'self',
    description: 'Elite. Massively increases attack power when near death (< 15% HP). Can turn the tide in desperate situations.',
  },

  'Second Life': {
    type: 'passive',
    manaCost: 0,
    formulaStr: 'Revive once at 30% HP (exalted)',
    formulaFn: (_s) => 0,
    ccType: null,
    targetType: 'self',
    description: 'Exalted. Once per battle, if this hero would die, they are revived at approximately 30% HP. Effectively doubles their life.',
  },
};

// ─── Projection helpers ───────────────────────────────────────────────────────

export function projectHeroOutput(stats: HeroStats, abilities: {
  active1: string | null;
  active2: string | null;
  passive1: string | null;
  passive2: string | null;
}) {
  let physDps = 0;
  let magicDps = 0;
  let healValue = 0;
  let ccCount = 0;
  const ccTypes: string[] = [];
  const passiveFlags: string[] = [];

  const allAbilities = [
    { name: abilities.active1, slot: 'active' },
    { name: abilities.active2, slot: 'active' },
    { name: abilities.passive1, slot: 'passive' },
    { name: abilities.passive2, slot: 'passive' },
  ];

  for (const { name } of allAbilities) {
    if (!name) continue;
    const f = ABILITY_FORMULAS[name];
    if (!f) continue;

    const val = f.formulaFn(stats);

    if (f.type === 'physical_damage') physDps += val;
    else if (f.type === 'magical_damage') magicDps += val;
    else if (f.type === 'heal') healValue += val;

    if (f.ccType) {
      ccCount++;
      if (!ccTypes.includes(f.ccType)) ccTypes.push(f.ccType);
    }

    if (f.type === 'passive') {
      passiveFlags.push(name);
    }
  }

  return { physDps, magicDps, healValue, ccCount, ccTypes, passiveFlags };
}
