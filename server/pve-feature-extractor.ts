export const STATE_FEATURE_SCHEMA_VERSION = 1;

export interface StateFeatures {
  schemaVersion: number;
  encounterType: string;
  enemyType: string;
  currentTurn: number;
  enemyHpPercent: number | null;
  enemyMpPercent: number | null;
  enemyPosition: number | null;
  alliesAliveCount: number | null;
  alliesDeadCount: number | null;
  enemiesAliveCount: number | null;
  targetableEnemyCount: number | null;
  currentBuffFlags: string[];
  currentDebuffFlags: string[];
  activePassiveFlags: string[];
  channelingState: boolean;
  lockoutState: Record<string, number>;
  availableActions: string[];
  targetFrontlineCount: number | null;
  lowestEnemyHpPercent: number | null;
  anyEnemyChanneling: boolean;
  battleBudgetRemaining: number | null;
  consumableAvailabilitySummary: Record<string, number>;
}

export interface UnitSnapshot {
  name: string;
  type: string;
  side: 'ally' | 'enemy';
  currentHp: number | null;
  maxHp: number | null;
  currentMp: number | null;
  maxMp: number | null;
  position: number | null;
  isAlive: boolean;
  buffs: string[];
  debuffs: string[];
  isChanneling: boolean;
  stats?: Record<string, number | null>;
}

export interface EncounterSnapshot {
  encounterType: string;
  turn: number;
  battleBudgetRemaining: number | null;
  consumableQuantities: Record<string, number>;
  units: UnitSnapshot[];
  lockoutStates: Record<string, Record<string, number>>;
}

export function extractStateFeatures(
  snapshot: EncounterSnapshot,
  enemyName: string,
  availableActions: string[],
): StateFeatures {
  const actualEnemy = snapshot.units.find(u => u.name === enemyName && u.side === 'enemy')
    || snapshot.units.find(u => u.name === enemyName);

  const enemySide = actualEnemy?.side || 'enemy';
  const allies = snapshot.units.filter(u => u.side === enemySide);
  const enemies = snapshot.units.filter(u => u.side !== enemySide);

  const enemyHpPercent = actualEnemy && actualEnemy.maxHp && actualEnemy.currentHp !== null
    ? Math.round((actualEnemy.currentHp / actualEnemy.maxHp) * 100)
    : null;

  const enemyMpPercent = actualEnemy && actualEnemy.maxMp && actualEnemy.currentMp !== null
    ? Math.round((actualEnemy.currentMp / actualEnemy.maxMp) * 100)
    : null;

  const aliveAllies = allies.filter(u => u.isAlive);
  const deadAllies = allies.filter(u => !u.isAlive);
  const aliveEnemies = enemies.filter(u => u.isAlive);

  const lowestEnemyHp = aliveEnemies.reduce<number | null>((min, u) => {
    if (u.maxHp && u.currentHp !== null) {
      const pct = (u.currentHp / u.maxHp) * 100;
      return min === null ? pct : Math.min(min, pct);
    }
    return min;
  }, null);

  const lockouts = snapshot.lockoutStates[enemyName] || {};

  const activePassiveFlags: string[] = [];
  const debuffs = actualEnemy?.debuffs || [];
  const isTaunted = debuffs.some(d => d.toLowerCase().includes('taunt'));
  if (isTaunted || deadAllies.length > 0) {
    activePassiveFlags.push('hardboiled_active');
  }
  const statusDebuffs = ['blind', 'poison', 'burn', 'chill'];
  if (debuffs.some(d => statusDebuffs.some(s => d.toLowerCase().includes(s)))) {
    activePassiveFlags.push('resilient_active');
  }

  return {
    schemaVersion: STATE_FEATURE_SCHEMA_VERSION,
    encounterType: snapshot.encounterType,
    enemyType: actualEnemy?.type || 'unknown',
    currentTurn: snapshot.turn,
    enemyHpPercent,
    enemyMpPercent,
    enemyPosition: actualEnemy?.position ?? null,
    alliesAliveCount: aliveAllies.length,
    alliesDeadCount: deadAllies.length,
    enemiesAliveCount: aliveEnemies.length,
    targetableEnemyCount: aliveEnemies.length,
    currentBuffFlags: actualEnemy?.buffs || [],
    currentDebuffFlags: debuffs,
    activePassiveFlags,
    channelingState: actualEnemy?.isChanneling || false,
    lockoutState: lockouts,
    availableActions,
    targetFrontlineCount: aliveEnemies.filter(u => (u.position ?? 0) <= 1).length,
    lowestEnemyHpPercent: lowestEnemyHp,
    anyEnemyChanneling: aliveEnemies.some(u => u.isChanneling),
    battleBudgetRemaining: snapshot.battleBudgetRemaining,
    consumableAvailabilitySummary: snapshot.consumableQuantities,
  };
}

export function bucketHpPercent(hp: number | null): string {
  if (hp === null) return 'unknown';
  if (hp <= 0) return 'dead';
  if (hp <= 25) return 'critical';
  if (hp <= 50) return 'low';
  if (hp <= 75) return 'mid';
  return 'high';
}

export function bucketMpPercent(mp: number | null): string {
  if (mp === null) return 'unknown';
  if (mp <= 0) return 'empty';
  if (mp <= 25) return 'low';
  if (mp <= 50) return 'mid';
  return 'high';
}

export function buildStateKey(features: StateFeatures): string {
  const parts = [
    features.encounterType,
    features.enemyType,
    bucketHpPercent(features.enemyHpPercent),
    bucketMpPercent(features.enemyMpPercent),
    `allies${features.alliesAliveCount ?? 'unk'}`,
    `dead${features.alliesDeadCount ?? 'unk'}`,
    `enemies${features.enemiesAliveCount ?? 'unk'}`,
    features.channelingState ? 'channeling' : 'normal',
    features.anyEnemyChanneling ? 'enemy_ch' : 'no_enemy_ch',
  ];
  return parts.join('|');
}
