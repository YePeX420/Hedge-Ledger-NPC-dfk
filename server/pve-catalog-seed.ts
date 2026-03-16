import type { InsertEnemyAbilityCatalog, InsertEncounterConfig } from '@shared/schema';
import { combatKeywords, combatSkills } from '@shared/schema';
import { db } from './db';
import { sql, eq, and } from 'drizzle-orm';

export const ENEMY_ABILITY_SEED: InsertEnemyAbilityCatalog[] = [
  {
    enemyType: 'baby_boar',
    abilityName: "Lil' Gore",
    manaCost: 0,
    range: 'melee',
    formulaJson: { base: '1.0*ATK', scaling: [{ stat: 'ATK', coeff: 1.0 }] },
    effectsJson: [
      { type: 'Bleed', chance: 0.40 },
      { type: 'Daze', chance: 0.10 },
      { type: 'Push', chance: 0.15 },
    ],
    passiveFlag: false,
    amnesiaTurns: 0,
    specialRulesJson: {},
    confidenceLevel: 'known',
    version: 1,
  },
  {
    enemyType: 'baby_boar',
    abilityName: 'Charm',
    manaCost: 1,
    range: 'ranged',
    formulaJson: { base: 'none', effect: 'Pull' },
    effectsJson: [{ type: 'Pull', chance: 0.50, targets: ['P3', 'P2'] }],
    passiveFlag: false,
    amnesiaTurns: 0,
    specialRulesJson: {},
    confidenceLevel: 'known',
    version: 1,
  },
  {
    enemyType: 'baby_boar',
    abilityName: 'Head Butt',
    manaCost: 2,
    range: 'ranged',
    formulaJson: { base: '1.2*ATK+1.0*DEX', scaling: [{ stat: 'ATK', coeff: 1.2 }, { stat: 'DEX', coeff: 1.0 }] },
    effectsJson: [{ type: 'Daze', chance: 0.60, duration: 1 }],
    passiveFlag: false,
    amnesiaTurns: 3,
    specialRulesJson: { condition: 'only_when_no_enemy_channeling' },
    confidenceLevel: 'known',
    version: 1,
  },
  {
    enemyType: 'baby_boar',
    abilityName: 'Nuzzle',
    manaCost: 3,
    range: 'ally',
    formulaJson: { base: '2.0*SPELL+1.5*WIS', scaling: [{ stat: 'SPELL', coeff: 2.0 }, { stat: 'WIS', coeff: 1.5 }], type: 'heal' },
    effectsJson: [
      { type: 'Cleanse', chance: 1.0 },
      { type: 'BonusHeal', condition: 'big_boar_present' },
      { type: 'ATK_Buff', value: 0.30, duration: 2, condition: 'big_boar_present' },
    ],
    passiveFlag: false,
    amnesiaTurns: 5,
    specialRulesJson: { conditional_bonus: 'big_boar_present_bonus_heal_and_atk_buff' },
    confidenceLevel: 'known',
    version: 1,
  },
  {
    enemyType: 'baby_boar',
    abilityName: 'Resilient',
    manaCost: 0,
    range: 'self',
    formulaJson: {},
    effectsJson: [{ type: 'Recovery', value: 0.05, condition: 'while_blinded_poisoned_burned_chilled' }],
    passiveFlag: true,
    amnesiaTurns: 0,
    specialRulesJson: { passive: true },
    confidenceLevel: 'known',
    version: 1,
  },

  {
    enemyType: 'mama_boar',
    abilityName: 'Gore',
    manaCost: 0,
    range: 'melee',
    formulaJson: { base: '1.5*ATK', scaling: [{ stat: 'ATK', coeff: 1.5 }] },
    effectsJson: [{ type: 'Bleed', chance: 0.70 }],
    passiveFlag: false,
    amnesiaTurns: 0,
    specialRulesJson: {},
    confidenceLevel: 'known',
    version: 1,
  },
  {
    enemyType: 'mama_boar',
    abilityName: 'Grunt',
    manaCost: 1,
    range: 'self_and_allies',
    formulaJson: {},
    effectsJson: [
      { type: 'Taunt', chance: 0.80, duration: 2 },
      { type: 'BLK_Buff', value: 0.20, duration: 2, target: 'self' },
      { type: 'AGI_Buff', value: 0.10, duration: 2, target: 'self' },
      { type: 'ATK_Buff', value: 0.30, duration: 1, target: 'allies' },
    ],
    passiveFlag: false,
    amnesiaTurns: 3,
    specialRulesJson: {},
    confidenceLevel: 'known',
    version: 1,
  },
  {
    enemyType: 'mama_boar',
    abilityName: 'Rampage',
    manaCost: 4,
    range: 'all_enemies',
    formulaJson: {
      hits: [
        { base: '2.5*ATK+2.5*STR', scaling: [{ stat: 'ATK', coeff: 2.5 }, { stat: 'STR', coeff: 2.5 }], targeting: 'random' },
        { base: '2.0*ATK+2.0*STR', scaling: [{ stat: 'ATK', coeff: 2.0 }, { stat: 'STR', coeff: 2.0 }], targeting: 'random' },
      ],
    },
    effectsJson: [
      { type: 'Daze', chance: 0.50, perHit: true },
      { type: 'Bleed', chance: 0.75, stacks: 3, perHit: true },
    ],
    passiveFlag: false,
    amnesiaTurns: 0,
    specialRulesJson: { self_buffs: true },
    confidenceLevel: 'known',
    version: 1,
  },
  {
    enemyType: 'mama_boar',
    abilityName: 'Wild Charge',
    manaCost: 4,
    range: 'all_enemies',
    formulaJson: { base: '1.8*ATK+2.0*DEX+1.0*STR', scaling: [{ stat: 'ATK', coeff: 1.8 }, { stat: 'DEX', coeff: 2.0 }, { stat: 'STR', coeff: 1.0 }], perTarget: true },
    effectsJson: [
      { type: 'Stun', chance: 0.25 },
      { type: 'Daze', chance: 0.50 },
      { type: 'Exhausted', target: 'self' },
    ],
    passiveFlag: false,
    amnesiaTurns: 5,
    specialRulesJson: { channel: 1, self_exhausted: true },
    confidenceLevel: 'known',
    version: 1,
  },
  {
    enemyType: 'mama_boar',
    abilityName: 'Resilient',
    manaCost: 0,
    range: 'self',
    formulaJson: {},
    effectsJson: [{ type: 'Recovery', value: 0.05, condition: 'while_blinded_poisoned_burned_chilled' }],
    passiveFlag: true,
    amnesiaTurns: 0,
    specialRulesJson: { passive: true },
    confidenceLevel: 'known',
    version: 1,
  },

  {
    enemyType: 'bad_motherclucker',
    abilityName: 'Beak Strike',
    manaCost: 0,
    range: 'melee',
    formulaJson: { base: '1.6*ATK', scaling: [{ stat: 'ATK', coeff: 1.6 }] },
    effectsJson: [{ type: 'Bleed', chance: 0.50 }],
    passiveFlag: false,
    amnesiaTurns: 0,
    specialRulesJson: {},
    confidenceLevel: 'known',
    version: 1,
  },
  {
    enemyType: 'bad_motherclucker',
    abilityName: 'Body Slam',
    manaCost: 3,
    range: 'all_enemies',
    formulaJson: { base: '1.8*ATK', scaling: [{ stat: 'ATK', coeff: 1.8 }], perTarget: true },
    effectsJson: [
      { type: 'Stun', chance: 0.60 },
      { type: 'Exhausted', target: 'self' },
    ],
    passiveFlag: false,
    amnesiaTurns: 6,
    specialRulesJson: { self_exhausted: true },
    confidenceLevel: 'known',
    version: 1,
  },
  {
    enemyType: 'bad_motherclucker',
    abilityName: 'Mighty Gust',
    manaCost: 3,
    range: 'all_enemies',
    formulaJson: { base: '1.5*ATK', scaling: [{ stat: 'ATK', coeff: 1.5 }], perTarget: true },
    effectsJson: [
      { type: 'Slow', chance: 0.80 },
      { type: 'Blind', chance: 0.40 },
      { type: 'Push', chain: true },
      { type: 'EVA_Buff', value: 0.10, duration: 2, target: 'party' },
    ],
    passiveFlag: false,
    amnesiaTurns: 5,
    specialRulesJson: { channel: 1, cross_ability_lockout: { target_ability: 'Body Slam', amnesia_applied: 2 } },
    confidenceLevel: 'known',
    version: 1,
  },
  {
    enemyType: 'bad_motherclucker',
    abilityName: 'Lay Egg',
    manaCost: 5,
    range: 'dead_allies',
    formulaJson: {},
    effectsJson: [
      { type: 'Transform', description: 'up_to_2_dead_baby_rocbocs_into_rocboc_eggs' },
      { type: 'ATK_Buff', value: 0.10, duration: 8, stacking: true },
    ],
    passiveFlag: false,
    amnesiaTurns: 3,
    specialRulesJson: { transforms_dead_allies: true, max_targets: 2 },
    confidenceLevel: 'known',
    version: 1,
  },
  {
    enemyType: 'bad_motherclucker',
    abilityName: 'Resilient',
    manaCost: 0,
    range: 'self',
    formulaJson: {},
    effectsJson: [{ type: 'Recovery', value: 0.05, condition: 'while_blinded_poisoned_burned_chilled' }],
    passiveFlag: true,
    amnesiaTurns: 0,
    specialRulesJson: { passive: true },
    confidenceLevel: 'known',
    version: 1,
  },
  {
    enemyType: 'bad_motherclucker',
    abilityName: 'Hardboiled',
    manaCost: 0,
    range: 'self',
    formulaJson: {},
    effectsJson: [
      { type: 'ATK_Buff', value: 0.10, condition: 'while_taunted_or_ally_dead' },
      { type: 'SPD_Buff', value: 0.10, condition: 'while_taunted_or_ally_dead' },
      { type: 'Push', chance: 0.50, condition: 'while_taunted_or_ally_dead', onHit: true },
    ],
    passiveFlag: true,
    amnesiaTurns: 0,
    specialRulesJson: { passive: true, conditional: 'taunted_or_ally_dead' },
    confidenceLevel: 'known',
    version: 1,
  },

  {
    enemyType: 'baby_rocboc',
    abilityName: 'Pecky Blinder',
    manaCost: 0,
    range: 'melee',
    formulaJson: { base: '1.3*ATK', scaling: [{ stat: 'ATK', coeff: 1.3 }] },
    effectsJson: [{ type: 'Blind', chance: 0.15 }],
    passiveFlag: false,
    amnesiaTurns: 0,
    specialRulesJson: {},
    confidenceLevel: 'known',
    version: 1,
  },
  {
    enemyType: 'baby_rocboc',
    abilityName: 'Cheep',
    manaCost: 2,
    range: 'party',
    formulaJson: {},
    effectsJson: [
      { type: 'DamageRedirect', value: 0.40, duration: 2, description: 'redirect_40pct_rocboc_targeted_damage' },
      { type: 'Confuse', chance: 0.50, targets: 'channeling_or_random_enemy' },
    ],
    passiveFlag: false,
    amnesiaTurns: 2,
    specialRulesJson: {},
    confidenceLevel: 'known',
    version: 1,
  },
  {
    enemyType: 'baby_rocboc',
    abilityName: 'Ominous Entrance',
    manaCost: 0,
    range: 'unknown',
    formulaJson: {},
    effectsJson: [],
    passiveFlag: false,
    amnesiaTurns: 0,
    specialRulesJson: { tooltip_unknown: true },
    confidenceLevel: 'unresolved',
    version: 1,
  },
];

export const ENCOUNTER_CONFIG_SEED: InsertEncounterConfig[] = [
  {
    encounterType: 'boar_hunt',
    startingBattleBudget: 11,
    consumableCatalogJson: [
      { name: 'Health Vial', cost: 3, effect: 'moderate_hp_restore', initiativePenalty: -300 },
      { name: 'Mana Vial', cost: 3, effect: 'restore_35pct_total_mana', initiativePenalty: -300 },
    ],
    version: 1,
  },
  {
    encounterType: 'bad_motherclucker',
    startingBattleBudget: 15,
    consumableCatalogJson: [
      { name: 'Health Vial', cost: 3, effect: 'moderate_hp_restore', initiativePenalty: -300 },
      { name: 'Mana Vial', cost: 3, effect: 'restore_35pct_total_mana', initiativePenalty: -300 },
    ],
    version: 1,
  },
];

export const STATUS_EFFECT_DEFINITIONS: Record<string, { description: string; category: string }> = {
  Bleed: { description: 'Damage over time, stacks reduce HP each turn', category: 'debuff' },
  Daze: { description: 'Reduces evasion and may cause missed actions', category: 'debuff' },
  Taunt: { description: 'Forces enemies to target the taunting unit', category: 'debuff' },
  Exhaust: { description: 'Reduces speed significantly, limits actions', category: 'debuff' },
  Slow: { description: 'Reduces action speed', category: 'debuff' },
  Blind: { description: 'Reduces accuracy of attacks', category: 'debuff' },
  Confuse: { description: 'May cause unit to act randomly or skip turn', category: 'debuff' },
  Push: { description: 'Moves target to a different position', category: 'positional' },
  Stun: { description: 'Prevents all actions for duration', category: 'hard_cc' },
  Haste: { description: 'Increases action speed', category: 'buff' },
  Channeling: { description: 'Unit is charging an ability, vulnerable but preparing powerful attack', category: 'state' },
};

export const ENCOUNTER_MECHANICS: Record<string, string> = {
  Amnesia: 'After using an ability, the unit cannot use it again for N turns. Tracked per ability independently.',
  CrossAbilityLockout: 'Some abilities apply Amnesia to other abilities when used. E.g. Mighty Gust applies Amnesia 2 to Body Slam.',
  Hardboiled: 'Passive: While Taunted or any ally is dead, gain +10% ATK, +10% SPD, +50% Push chance on hit.',
  Resilient: 'Passive: +5% Recovery while Blinded, Poisoned, Burned, or Chilled.',
  EggTransformation: 'Lay Egg transforms up to 2 dead Baby Rocbocs into Rocboc Eggs. Grants stacking +10% ATK for 8 turns.',
};

export async function syncEnemyKnowledgeToKB(): Promise<{ keywordsUpserted: number; skillsUpserted: number }> {
  const sourceUrl = 'pve-catalog-seed:auto-sync';
  let keywordsUpserted = 0;
  let skillsUpserted = 0;

  for (const [keyword, def] of Object.entries(STATUS_EFFECT_DEFINITIONS)) {
    await db.insert(combatKeywords).values({
      keyword: `PvE:${keyword}`,
      definition: `[PvE Status Effect - ${def.category}] ${def.description}`,
      sourceUrl,
    }).onConflictDoUpdate({
      target: combatKeywords.keyword,
      set: {
        definition: `[PvE Status Effect - ${def.category}] ${def.description}`,
        lastSeenAt: sql`CURRENT_TIMESTAMP`,
      },
    });
    keywordsUpserted++;
  }

  for (const [mechanic, description] of Object.entries(ENCOUNTER_MECHANICS)) {
    await db.insert(combatKeywords).values({
      keyword: `PvE:Mechanic:${mechanic}`,
      definition: `[PvE Encounter Mechanic] ${description}`,
      sourceUrl,
    }).onConflictDoUpdate({
      target: combatKeywords.keyword,
      set: {
        definition: `[PvE Encounter Mechanic] ${description}`,
        lastSeenAt: sql`CURRENT_TIMESTAMP`,
      },
    });
    keywordsUpserted++;
  }

  for (const ability of ENEMY_ABILITY_SEED) {
    const formulaStr = ability.formulaJson?.base as string || 'none';
    const effects = (ability.effectsJson as Array<Record<string, unknown>>)?.map(e => e.type).join(', ') || 'none';
    const descriptionRaw = `[PvE Enemy Ability] ${ability.enemyType} — ${ability.abilityName}. ` +
      `Formula: ${formulaStr}. Mana: ${ability.manaCost}. Range: ${ability.range}. ` +
      `Effects: ${effects}. Amnesia: ${ability.amnesiaTurns} turns. ` +
      `${ability.passiveFlag ? 'PASSIVE.' : ''}`;

    const existingSkill = await db.select({ id: combatSkills.id })
      .from(combatSkills)
      .where(and(
        eq(combatSkills.class, `PvE:${ability.enemyType}`),
        eq(combatSkills.ability, ability.abilityName),
      ))
      .limit(1);

    const skillData = {
      class: `PvE:${ability.enemyType}`,
      tier: 0,
      discipline: ability.passiveFlag ? 'passive' : 'active',
      ability: ability.abilityName,
      descriptionRaw,
      range: ability.range === 'melee' ? 1 : ability.range === 'ranged' ? 3 : 0,
      manaCost: String(ability.manaCost),
      tags: [
        `pve_enemy`,
        ability.enemyType,
        ability.passiveFlag ? 'passive' : 'active',
        ...(ability.effectsJson as Array<Record<string, unknown>>)?.map(e => String(e.type || '')) || [],
      ],
      sourceUrl,
    };

    if (existingSkill.length > 0) {
      await db.update(combatSkills)
        .set({
          descriptionRaw: skillData.descriptionRaw,
          range: skillData.range,
          manaCost: skillData.manaCost,
          tags: skillData.tags,
          lastSeenAt: sql`CURRENT_TIMESTAMP`,
        })
        .where(eq(combatSkills.id, existingSkill[0].id));
    } else {
      await db.insert(combatSkills).values(skillData);
    }
    skillsUpserted++;
  }

  return { keywordsUpserted, skillsUpserted };
}
