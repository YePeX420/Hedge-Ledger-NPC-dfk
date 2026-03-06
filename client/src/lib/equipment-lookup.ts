export const EQUIPMENT_BONUS = {
  weapon: {
    1: "banish_on_hit_proc_pct",
    2: "bleed_on_hit_proc_pct",
    3: "blind_on_hit_proc_pct",
    4: "burn_on_hit_proc_pct",
    5: "chill_on_hit_proc_pct",
    6: "confuse_on_hit_proc_pct",
    7: "daze_on_hit_proc_pct",
    8: "disarm_on_hit_proc_pct",
    9: "fear_on_hit_proc_pct",
    10: "intimidate_on_hit_proc_pct",
    11: "poison_on_hit_proc_pct",
    12: "pull_on_hit_proc_pct",
    13: "push_on_hit_proc_pct",
    14: "silence_on_hit_proc_pct",
    15: "sleep_on_hit_proc_pct",
    16: "slow_on_hit_proc_pct",
    17: "stun_on_hit_proc_pct",
    18: "taunt_on_hit_proc_pct",
    19: "daze_on_basic_vs_channeling_proc_pct",
    20: "block_chance_pct",
    21: "spell_block_chance_pct",
    22: "crit_damage_multiplier_flat",
    23: "crit_chance_pct",
    24: "crit_lifesteal_pct",
    25: "pierce_pct",
    26: "block_damage_reduction_pct",
    27: "spell_block_damage_reduction_pct",
    28: "mag_damage_up_heal_down_pct_each",
    29: "heal_up_mag_damage_down_pct_each",
    30: "phys_and_mag_def_down_pct_each",
    31: "healing_potency_down_pct",
    32: "mag_damage_pct",
    33: "phys_damage_pct",
    34: "retaliate1_on_any_damage_proc_pct",
    35: "retaliate1_on_phys_damage_proc_pct",
    36: "retaliate1_on_mag_damage_proc_pct",
    37: "crit_inflicts_bleed_proc_pct",
    38: "crit_inflicts_poison_proc_pct",
    39: "crit_inflicts_daze_proc_pct",
    40: "crit_heal_cleanse_proc_pct",
    41: "crit_heal_chance_pct",
  },

  armor: {
    1: "block_chance_pct",
    2: "spell_block_chance_pct",
    3: "block_damage_reduction_pct",
    4: "spell_block_damage_reduction_pct",
    5: "phys_accuracy_pct",
    6: "mag_accuracy_pct",
    7: "speed_pct",
    8: "evasion_pct",
    9: "status_effect_res_pct",
    10: "banish_res_pct",
    11: "bleed_res_pct",
    12: "blind_res_pct",
    13: "burn_res_pct",
    14: "chill_res_pct",
    15: "confuse_res_pct",
    16: "daze_res_pct",
    17: "disarm_res_pct",
    18: "fear_res_pct",
    19: "intimidate_res_pct",
    20: "poison_res_pct",
    21: "pull_res_pct",
    22: "push_res_pct",
    23: "silence_res_pct",
    24: "sleep_res_pct",
    25: "slow_res_pct",
    26: "stun_res_pct",
    27: "taunt_res_pct",
    28: "crit_mult_flat",
    29: "phys_def_pct",
    30: "mag_def_pct",
    31: "phys_accuracy_down_pct",
    32: "mag_accuracy_down_pct",
    33: "phys_damage_pct",
    34: "mag_damage_pct",
    35: "riposte_pct",
    36: "double_prev_if_accessory_x",
    37: "double_prev_if_offhand_x",
    38: "double_prev_if_1h_sword_x",
    39: "retaliate1_on_phys_damage_proc_pct",
    40: "initiative_after_successful_block_flat",
    41: "recovery_chance_pct",
    42: "double_prev_if_2h_sword_x",
    43: "double_prev_if_1h_axe_x",
    44: "double_prev_if_2h_axe_x",
    45: "double_prev_if_1h_mace_x",
    46: "double_prev_if_2h_mace_x",
    47: "double_prev_if_1h_spear_x",
    48: "double_prev_if_2h_spear_x",
    49: "double_prev_if_wand_x",
    50: "double_prev_if_staff_x",
    51: "double_prev_if_gloves_x",
    52: "double_prev_if_bow_x",
    53: "double_prev_if_dagger_x",
    54: "speed_down_pct",
    55: "healing_potency_down_pct",
    56: "crit_lifesteal_pct",
    57: "crit_chance_pct",
    58: "channeling_time_reduction_pct",
  },

  accessory: {
    1: "phys_accuracy_pct",
    2: "mag_accuracy_pct",
    3: "block_chance_pct",
    4: "spell_block_chance_pct",
    5: "speed_pct",
    6: "evasion_pct",
    7: "status_effect_res_pct",
    8: "banish_res_pct",
    9: "bleed_res_pct",
    10: "blind_res_pct",
    11: "burn_res_pct",
    12: "chill_res_pct",
    13: "confuse_res_pct",
    14: "daze_res_pct",
    15: "disarm_res_pct",
    16: "fear_res_pct",
    17: "intimidate_res_pct",
    18: "poison_res_pct",
    19: "pull_res_pct",
    20: "push_res_pct",
    21: "silence_res_pct",
    22: "sleep_res_pct",
    23: "slow_res_pct",
    24: "stun_res_pct",
    25: "taunt_res_pct",
    26: "crit_mult_flat",
    27: "phys_def_pct",
    28: "mag_def_pct",
    29: "phys_accuracy_down_pct",
    30: "mag_accuracy_down_pct",
    31: "phys_damage_pct",
    32: "mag_damage_pct",
    33: "riposte_pct",
    34: "attack_pct",
    35: "spell_pct",
    36: "ability_id",
    37: "phys_damage_reduction_pct",
    38: "mag_damage_reduction_pct",
    39: "consumable_budget_cost_minus_2_proc_pct",
    230: "duel_score_flat",
    231: "duel_score_roll_xy",
    232: "defend_champion_matching_background_proc_pct",
    233: "defend_champion_duel_score_flat",
    234: "defend_champion_duel_score_roll_xy",
  },

  offhand: {
    1: "block_chance_pct",
    2: "block_damage_reduction_pct",
    3: "spell_block_chance_pct",
    4: "spell_block_damage_reduction_pct",
    5: "riposte_pct",
    6: "pdef_flat",
    7: "mdef_flat",
    8: "pull_res_pct",
    9: "push_res_pct",
  },
} as const;

export type EquipmentFamily = keyof typeof EQUIPMENT_BONUS;

export const ABILITY_CODE_TO_SLOT: Record<number, string> = {
  0: "Basic1",
  1: "Basic2",
  2: "Basic3",
  3: "Basic4",
  4: "Basic5",
  5: "Basic6",
  6: "Basic7",
  7: "Basic8",
  16: "Advanced1",
  17: "Advanced2",
  18: "Advanced3",
  19: "Advanced4",
  24: "Elite1",
  25: "Elite2",
  28: "Exalted1",
};

export const ACTIVE_TRAIT_BY_CODE: Record<number, { slot: string; name: string }> = {
  0: { slot: "Basic1", name: "Poisoned Blade" },
  1: { slot: "Basic2", name: "Blinding Winds" },
  2: { slot: "Basic3", name: "Heal" },
  3: { slot: "Basic4", name: "Cleanse" },
  4: { slot: "Basic5", name: "Iron Skin" },
  5: { slot: "Basic6", name: "Speed" },
  6: { slot: "Basic7", name: "Critical Aim" },
  7: { slot: "Basic8", name: "Deathmark" },
  16: { slot: "Advanced1", name: "Exhaust" },
  17: { slot: "Advanced2", name: "Daze" },
  18: { slot: "Advanced3", name: "Explosion" },
  19: { slot: "Advanced4", name: "Hardened Shield" },
  24: { slot: "Elite1", name: "Stun" },
  25: { slot: "Elite2", name: "Second Wind" },
  28: { slot: "Exalted1", name: "Resurrection" },
};

export const PASSIVE_TRAIT_BY_CODE: Record<number, { slot: string; name: string }> = {
  0: { slot: "Basic1", name: "Duelist" },
  1: { slot: "Basic2", name: "Clutch" },
  2: { slot: "Basic3", name: "Foresight" },
  3: { slot: "Basic4", name: "Headstrong" },
  4: { slot: "Basic5", name: "Clear Vision" },
  5: { slot: "Basic6", name: "Fearless" },
  6: { slot: "Basic7", name: "Chatterbox" },
  7: { slot: "Basic8", name: "Stalwart" },
  16: { slot: "Advanced1", name: "Leadership" },
  17: { slot: "Advanced2", name: "Efficient" },
  18: { slot: "Advanced3", name: "Menacing" },
  19: { slot: "Advanced4", name: "Toxic" },
  24: { slot: "Elite1", name: "Giant Slayer" },
  25: { slot: "Elite2", name: "Last Stand" },
  28: { slot: "Exalted1", name: "Second Life" },
};

export interface DecodedBonus {
  key: string;
  label: string;
  scalar: number;
  packedX?: number;
  packedY?: number;
  abilityInfo?: {
    code: number;
    slot: string | null;
    active: string | null;
    passive: string | null;
  };
  note?: string;
}

export function decodeEquipmentBonus(
  family: string,
  bonusId: number,
  bonusScalar: number
): DecodedBonus {
  const table = (EQUIPMENT_BONUS as any)[family];
  const key: string = table?.[bonusId] ?? `unknown_bonus_${bonusId}`;

  if (family === "accessory" && bonusId === 36) {
    const code = bonusScalar;
    return {
      key,
      label: `Gain Ability: ${ACTIVE_TRAIT_BY_CODE[code]?.name ?? PASSIVE_TRAIT_BY_CODE[code]?.name ?? `Code ${code}`}`,
      scalar: bonusScalar,
      abilityInfo: {
        code,
        slot: ABILITY_CODE_TO_SLOT[code] ?? null,
        active: ACTIVE_TRAIT_BY_CODE[code]?.name ?? null,
        passive: PASSIVE_TRAIT_BY_CODE[code]?.name ?? null,
      },
    };
  }

  if (family === "accessory" && (bonusId === 231 || bonusId === 234)) {
    const packedX = bonusScalar & 255;
    const packedY = bonusScalar >> 8;
    return {
      key,
      label: formatKeyLabel(key) + ` (X=${packedX}, Y=${packedY})`,
      scalar: bonusScalar,
      packedX,
      packedY,
    };
  }

  if (family === "armor" && bonusId >= 36 && bonusId <= 53) {
    return {
      key,
      label: formatKeyLabel(key) + ` [synergy param: ${bonusScalar}]`,
      scalar: bonusScalar,
      note: "Conditional synergy multiplier — secondary identifier stored in scalar (type TBD)",
    };
  }

  return {
    key,
    label: formatBonusLabel(key, bonusScalar),
    scalar: bonusScalar,
  };
}

function formatKeyLabel(key: string): string {
  return key
    .replace(/_pct$/, "")
    .replace(/_flat$/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, c => c.toUpperCase());
}

export function formatBonusLabel(key: string, scalar: number): string {
  const label = formatKeyLabel(key);
  if (key.endsWith("_pct")) {
    return `${label}: ${(scalar / 10).toFixed(1)}%`;
  }
  if (key.endsWith("_flat")) {
    return `${label}: ${scalar}`;
  }
  return `${label}: ${scalar}`;
}
