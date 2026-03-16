import type { EnemyAbilityCatalog } from '@shared/schema';

export interface AbilityAvailability {
  abilityName: string;
  available: boolean;
  reason: string;
  amnesiaRemaining: number;
  manaSufficient: boolean;
  rangeValid: boolean;
  channelReady: boolean;
  crossLockout: boolean;
}

export interface LockoutState {
  [abilityName: string]: number;
}

export function checkAbilityAvailability(
  ability: EnemyAbilityCatalog,
  currentMp: number | null,
  lockoutState: LockoutState,
  isChanneling: boolean,
  allyDeadCount: number,
  anyEnemyChanneling: boolean,
  liveAvailabilityOverride?: Record<string, boolean>,
  targetableEnemyCount?: number,
): AbilityAvailability {
  if (ability.passiveFlag) {
    return {
      abilityName: ability.abilityName,
      available: false,
      reason: 'passive',
      amnesiaRemaining: 0,
      manaSufficient: true,
      rangeValid: true,
      channelReady: true,
      crossLockout: false,
    };
  }

  if (liveAvailabilityOverride && ability.abilityName in liveAvailabilityOverride) {
    const overridden = liveAvailabilityOverride[ability.abilityName];
    return {
      abilityName: ability.abilityName,
      available: overridden,
      reason: overridden ? 'live_override_available' : 'live_override_locked',
      amnesiaRemaining: lockoutState[ability.abilityName] || 0,
      manaSufficient: true,
      rangeValid: true,
      channelReady: true,
      crossLockout: false,
    };
  }

  const amnesiaRemaining = lockoutState[ability.abilityName] || 0;
  if (amnesiaRemaining > 0) {
    return {
      abilityName: ability.abilityName,
      available: false,
      reason: `amnesia_${amnesiaRemaining}_turns`,
      amnesiaRemaining,
      manaSufficient: true,
      rangeValid: true,
      channelReady: true,
      crossLockout: false,
    };
  }

  const manaSufficient = currentMp === null || currentMp >= ability.manaCost;
  if (!manaSufficient) {
    return {
      abilityName: ability.abilityName,
      available: false,
      reason: 'insufficient_mana',
      amnesiaRemaining: 0,
      manaSufficient: false,
      rangeValid: true,
      channelReady: true,
      crossLockout: false,
    };
  }

  const range = ability.range;
  const SELF_TARGETING_RANGES = ['self', 'ally', 'self_and_allies', 'party'];
  const ENEMY_TARGETING_RANGES = ['single', 'melee', 'ranged', 'all_enemies'];

  if (range && ENEMY_TARGETING_RANGES.includes(range) && targetableEnemyCount !== undefined && targetableEnemyCount === 0) {
    return {
      abilityName: ability.abilityName,
      available: false,
      reason: 'no_valid_targets_in_range',
      amnesiaRemaining: 0,
      manaSufficient: true,
      rangeValid: false,
      channelReady: true,
      crossLockout: false,
    };
  }

  if (range === 'dead_allies' && allyDeadCount === 0) {
    return {
      abilityName: ability.abilityName,
      available: false,
      reason: 'no_dead_allies_for_range',
      amnesiaRemaining: 0,
      manaSufficient: true,
      rangeValid: false,
      channelReady: true,
      crossLockout: false,
    };
  }

  if (range && !SELF_TARGETING_RANGES.includes(range) && !ENEMY_TARGETING_RANGES.includes(range) && range !== 'dead_allies' && range !== 'unknown') {
    return {
      abilityName: ability.abilityName,
      available: false,
      reason: `unrecognized_range_${range}`,
      amnesiaRemaining: 0,
      manaSufficient: true,
      rangeValid: false,
      channelReady: true,
      crossLockout: false,
    };
  }

  const specialRules = ability.specialRulesJson as Record<string, unknown> || {};

  if (specialRules.condition === 'only_when_no_enemy_channeling' && anyEnemyChanneling) {
    return {
      abilityName: ability.abilityName,
      available: false,
      reason: 'enemy_channeling_blocks',
      amnesiaRemaining: 0,
      manaSufficient: true,
      rangeValid: false,
      channelReady: true,
      crossLockout: false,
    };
  }

  if (specialRules.transforms_dead_allies && allyDeadCount === 0) {
    return {
      abilityName: ability.abilityName,
      available: false,
      reason: 'no_dead_allies_to_transform',
      amnesiaRemaining: 0,
      manaSufficient: true,
      rangeValid: false,
      channelReady: true,
      crossLockout: false,
    };
  }

  if (isChanneling && !specialRules.usable_while_channeling) {
    return {
      abilityName: ability.abilityName,
      available: false,
      reason: 'currently_channeling',
      amnesiaRemaining: 0,
      manaSufficient: true,
      rangeValid: true,
      channelReady: false,
      crossLockout: false,
    };
  }

  if (specialRules.requires_channel_complete && !isChanneling) {
    return {
      abilityName: ability.abilityName,
      available: false,
      reason: 'requires_channel_not_active',
      amnesiaRemaining: 0,
      manaSufficient: true,
      rangeValid: true,
      channelReady: false,
      crossLockout: false,
    };
  }

  return {
    abilityName: ability.abilityName,
    available: true,
    reason: 'available',
    amnesiaRemaining: 0,
    manaSufficient: true,
    rangeValid: true,
    channelReady: true,
    crossLockout: false,
  };
}

export function getAvailableActions(
  abilities: EnemyAbilityCatalog[],
  currentMp: number | null,
  lockoutState: LockoutState,
  isChanneling: boolean,
  allyDeadCount: number,
  anyEnemyChanneling: boolean,
  liveOverride?: Record<string, boolean>,
  targetableEnemyCount?: number,
): AbilityAvailability[] {
  return abilities.map(a => checkAbilityAvailability(
    a, currentMp, lockoutState, isChanneling, allyDeadCount, anyEnemyChanneling, liveOverride, targetableEnemyCount,
  ));
}

export function updateLockoutsAfterAction(
  lockoutState: LockoutState,
  abilities: EnemyAbilityCatalog[],
  usedAbilityName: string,
): LockoutState {
  const newState = { ...lockoutState };

  for (const key of Object.keys(newState)) {
    if (newState[key] > 0) newState[key]--;
  }

  const usedAbility = abilities.find(a => a.abilityName === usedAbilityName);
  if (usedAbility && usedAbility.amnesiaTurns > 0) {
    newState[usedAbilityName] = usedAbility.amnesiaTurns;
  }

  if (usedAbility) {
    const specialRules = usedAbility.specialRulesJson as Record<string, unknown> || {};
    const crossLockout = specialRules.cross_ability_lockout as { target_ability: string; amnesia_applied: number } | undefined;
    if (crossLockout) {
      newState[crossLockout.target_ability] = crossLockout.amnesia_applied;
    }
  }

  return newState;
}

export function checkPassiveActivation(
  ability: EnemyAbilityCatalog,
  context: {
    isTaunted: boolean;
    allyDeadCount: number;
    debuffs: string[];
  },
): { active: boolean; effects: string[] } {
  if (!ability.passiveFlag) return { active: false, effects: [] };

  const specialRules = ability.specialRulesJson as Record<string, unknown> || {};

  if (specialRules.conditional === 'taunted_or_ally_dead') {
    const active = context.isTaunted || context.allyDeadCount > 0;
    return {
      active,
      effects: active ? ['+10% ATK', '+10% SPD', '+50% Push on hit'] : [],
    };
  }

  const effectsJson = ability.effectsJson as Array<Record<string, unknown>> || [];
  for (const eff of effectsJson) {
    const condition = eff.condition as string;
    if (condition === 'while_blinded_poisoned_burned_chilled') {
      const matching = ['blind', 'poison', 'burn', 'chill'].filter(d =>
        context.debuffs.some(db => db.toLowerCase().includes(d))
      );
      return { active: matching.length > 0, effects: matching.length > 0 ? ['+5% Recovery'] : [] };
    }
  }

  return { active: false, effects: [] };
}
