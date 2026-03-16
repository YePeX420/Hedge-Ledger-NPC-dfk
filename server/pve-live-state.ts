import type { EncounterSnapshot, UnitSnapshot } from './pve-feature-extractor';

export interface TelemetryUnit {
  name: string;
  type: string;
  level?: number;
  side: 'a' | 'b';
  currentHp: number | null;
  maxHp: number | null;
  currentMp: number | null;
  maxMp: number | null;
  stats?: Record<string, number | null>;
  buffs: string[];
  debuffs: string[];
  position: number | null;
  isChanneling: boolean;
  isAlive: boolean;
  visibleAbilityAvailability?: Record<string, boolean>;
  visibleLockouts?: Record<string, number>;
}

export interface TelemetryEncounterState {
  encounterType: string;
  turn: number;
  battleBudgetRemaining: number | null;
  consumableQuantities: Record<string, number>;
  units: TelemetryUnit[];
  eggState?: { rocbocEggs: number };
}

export function buildEncounterSnapshot(telemetry: TelemetryEncounterState): EncounterSnapshot {
  const unitSnapshots: UnitSnapshot[] = telemetry.units.map(u => ({
    name: u.name,
    type: u.type,
    side: u.side === 'a' ? 'enemy' : 'ally',
    currentHp: u.currentHp,
    maxHp: u.maxHp,
    currentMp: u.currentMp,
    maxMp: u.maxMp,
    position: u.position,
    isAlive: u.isAlive,
    buffs: u.buffs,
    debuffs: u.debuffs,
    isChanneling: u.isChanneling,
    stats: u.stats,
  }));

  const lockoutStates: Record<string, Record<string, number>> = {};
  for (const u of telemetry.units) {
    if (u.visibleLockouts) {
      lockoutStates[u.name] = u.visibleLockouts;
    }
  }

  return {
    encounterType: telemetry.encounterType,
    turn: telemetry.turn,
    battleBudgetRemaining: telemetry.battleBudgetRemaining,
    consumableQuantities: telemetry.consumableQuantities,
    units: unitSnapshots,
    lockoutStates,
  };
}

export function inferEncounterType(enemyNames: string[]): string {
  const normalized = enemyNames.map(n => n.toLowerCase().replace(/\s+/g, '_'));
  if (normalized.some(n => n.includes('boar'))) return 'boar_hunt';
  if (normalized.some(n => n.includes('motherclucker') || n.includes('rocboc'))) return 'bad_motherclucker';
  return 'unknown';
}

export function buildTelemetryFromRawState(rawState: Record<string, unknown>): TelemetryEncounterState | null {
  try {
    const units = (rawState.units as Array<Record<string, unknown>>) || [];
    const telemetryUnits: TelemetryUnit[] = units.map(u => ({
      name: (u.name as string) || 'Unknown',
      type: (u.type as string) || 'unknown',
      level: u.level as number | undefined,
      side: (u.side as 'a' | 'b') || 'b',
      currentHp: u.currentHp as number | null ?? null,
      maxHp: u.maxHp as number | null ?? null,
      currentMp: u.currentMp as number | null ?? null,
      maxMp: u.maxMp as number | null ?? null,
      stats: (u.stats as Record<string, number | null>) || {},
      buffs: (u.buffs as string[]) || [],
      debuffs: (u.debuffs as string[]) || [],
      position: u.position as number | null ?? null,
      isChanneling: (u.isChanneling as boolean) || false,
      isAlive: u.isAlive !== false,
      visibleAbilityAvailability: u.visibleAbilityAvailability as Record<string, boolean> | undefined,
      visibleLockouts: u.visibleLockouts as Record<string, number> | undefined,
    }));

    const encounterType = (rawState.encounterType as string) || inferEncounterType(telemetryUnits.map(u => u.name));

    return {
      encounterType,
      turn: (rawState.turn as number) || 0,
      battleBudgetRemaining: rawState.battleBudgetRemaining as number | null ?? null,
      consumableQuantities: (rawState.consumableQuantities as Record<string, number>) || {},
      units: telemetryUnits,
      eggState: rawState.eggState as { rocbocEggs: number } | undefined,
    };
  } catch {
    return null;
  }
}
