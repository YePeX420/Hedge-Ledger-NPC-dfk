import {
  COMBAT_FRAME_VERSION,
  buildUnitId,
  normalizeId,
  toStatusInstances,
  type ActionAvailability,
  type BattleLogEvent,
  type CombatFrame,
  type CombatantSnapshot,
  type CombatantSide,
  type HeroDetailSnapshot,
  type StatusInstance,
  type TurnOrderEntry,
} from '../shared/pveCombatFrame';
import type { BattleState, EnemyState, HeroState } from './pve-scoring-engine';
import type { EnemyEntry } from './pve-enemy-catalog';

export interface CompanionSessionFrameState {
  latestFrame: CombatFrame | null;
  rawFrames: CombatFrame[];
}

function toSide(value: string | null | undefined): CombatantSide {
  return String(value || '').toLowerCase() === 'enemy' ? 'enemy' : 'player';
}

export function inferEncounterType(combatants: CombatantSnapshot[]): string | null {
  const enemyNames = combatants.filter((c) => c.side === 'enemy').map((c) => c.normalizedId);
  if (enemyNames.some((name) => name.includes('boar'))) return 'boar_hunt';
  if (enemyNames.some((name) => name.includes('motherclucker') || name.includes('rocboc'))) return 'bad_motherclucker';
  return enemyNames.length > 0 ? 'unknown' : null;
}

export function getPrimaryEnemyId(frame: CombatFrame | null): string | null {
  const firstEnemy = frame?.combatants.find((combatant) => combatant.side === 'enemy');
  return firstEnemy?.normalizedId || null;
}

function ensureHeroState(baseHero: HeroState, combatant?: CombatantSnapshot | null): HeroState {
  if (!combatant) return baseHero;
  return {
    ...baseHero,
    currentHp: combatant.currentHp ?? baseHero.currentHp,
    maxHp: combatant.maxHp ?? baseHero.maxHp,
    currentMp: combatant.currentMp ?? baseHero.currentMp,
    maxMp: combatant.maxMp ?? baseHero.maxMp,
    buffs: combatant.buffs.map((status) => status.id),
    debuffs: combatant.debuffs.map((status) => status.id),
    isAlive: combatant.isAlive,
    combatStats: {
      ...baseHero.combatStats,
      attack: combatant.stats.attack ?? baseHero.combatStats?.attack,
      spell: combatant.stats.spell ?? baseHero.combatStats?.spell,
      speed: combatant.stats.speed ?? baseHero.combatStats?.speed,
    },
  };
}

function combatantToEnemyState(enemyId: string, combatant: CombatantSnapshot, fallbackEnemy: EnemyEntry): EnemyState {
  return {
    enemyId,
    currentHp: combatant.currentHp ?? fallbackEnemy.hp,
    maxHp: combatant.maxHp ?? fallbackEnemy.hp,
    currentMp: combatant.currentMp ?? fallbackEnemy.mp,
    buffs: combatant.buffs.map((status) => status.id),
    debuffs: combatant.debuffs.map((status) => status.id),
  };
}

export function enrichBattleStateFromCombatFrame(
  battleState: BattleState,
  frame: CombatFrame | null,
  fallbackEnemy: EnemyEntry,
): BattleState {
  if (!frame) return battleState;

  const players = frame.combatants.filter((combatant) => combatant.side === 'player');
  const enemies = frame.combatants.filter((combatant) => combatant.side === 'enemy');
  const heroMap = new Map(players.map((combatant) => [combatant.slot ?? -1, combatant] as const));

  return {
    ...battleState,
    turnNumber: frame.turnNumber || battleState.turnNumber,
    activeHeroSlot: frame.activeTurn.activeSlot ?? battleState.activeHeroSlot,
    heroes: battleState.heroes.map((hero) => ensureHeroState(hero, heroMap.get(hero.slot))),
    enemies: enemies.length > 0
      ? enemies.map((combatant) => combatantToEnemyState(combatant.normalizedId || fallbackEnemy.id, combatant, fallbackEnemy))
      : battleState.enemies,
    battleBudgetRemaining: frame.activeTurn.battleBudgetRemaining ?? battleState.battleBudgetRemaining ?? null,
  };
}

export function summarizeCombatFrameBattleState(frame: CombatFrame | null, battleState: BattleState) {
  const statuses = (combatant: CombatantSnapshot) => [...combatant.buffs, ...combatant.debuffs];
  return {
    turnNumber: battleState.turnNumber,
    activeHeroSlot: battleState.activeHeroSlot,
    heroes: battleState.heroes.map((hero) => {
      const source = frame?.combatants.find((combatant) => combatant.side === 'player' && combatant.slot === hero.slot);
      return {
        slot: hero.slot,
        heroId: hero.heroId,
        currentHp: hero.currentHp,
        maxHp: hero.maxHp,
        currentMp: hero.currentMp,
        maxMp: hero.maxMp,
        isAlive: hero.isAlive,
        mainClass: hero.mainClass,
        statuses: source ? statuses(source) : [],
      };
    }),
    enemies: battleState.enemies.map((enemy, index) => {
      const source = frame?.combatants.filter((combatant) => combatant.side === 'enemy')[index];
      return {
        enemyId: enemy.enemyId,
        currentHp: enemy.currentHp,
        maxHp: enemy.maxHp,
        currentMp: enemy.currentMp,
        debuffs: enemy.debuffs,
        buffs: enemy.buffs,
        statuses: source ? statuses(source) : [],
      };
    }),
    combatFrame: frame,
  };
}

export function buildFallbackEnemyEntry(enemyId: string | null | undefined, frame: CombatFrame | null): EnemyEntry {
  const enemyCombatants = frame?.combatants.filter((combatant) => combatant.side === 'enemy') || [];
  const primaryEnemy = enemyCombatants[0];
  const inferredHp = primaryEnemy?.maxHp ?? 500;
  const inferredMp = primaryEnemy?.maxMp ?? 50;
  const inferredStats = primaryEnemy?.stats || {};
  return {
    id: (enemyId || primaryEnemy?.normalizedId || 'UNKNOWN_ENEMY').toUpperCase(),
    name: primaryEnemy?.name || enemyId || 'Unknown Enemy',
    tier: 1,
    hp: inferredHp,
    mp: inferredMp,
    atk: inferredStats.attack ?? 50,
    def: inferredStats.pDef ?? inferredStats.def ?? 25,
    matk: inferredStats.spellPower ?? inferredStats.spell ?? 20,
    mdef: inferredStats.mDef ?? 20,
    spd: inferredStats.speed ?? 35,
    eva: (inferredStats.eva ?? 5) / 100,
    crit: (inferredStats.chc ?? 5) / 100,
    resistances: {
      stun: 0.1,
      poison: 0.1,
      exhaust: 0.1,
      daze: 0.1,
    },
    abilities: [
      {
        name: 'Basic Attack',
        type: 'physical_damage',
        baseDamage: Math.max(20, inferredStats.attack ?? 40),
        manaCost: 0,
        cooldown: 0,
        targetType: 'single_enemy',
        weight: 1,
      },
    ],
    description: 'Fallback enemy inferred from live combat telemetry.',
  };
}

export function normalizeCombatFrame(raw: Record<string, any>): CombatFrame {
  const combatants: CombatantSnapshot[] = (raw.combatants || []).map((combatant: Record<string, any>) => {
    const side = toSide(combatant.side);
    const slot = combatant.slot == null ? null : Number(combatant.slot);
    const name = combatant.name || 'Unknown';
    return {
      unitId: combatant.unitId || buildUnitId(side, slot, name),
      side,
      slot,
      name,
      normalizedId: combatant.normalizedId || normalizeId(name),
      currentHp: combatant.currentHp ?? null,
      maxHp: combatant.maxHp ?? null,
      currentMp: combatant.currentMp ?? null,
      maxMp: combatant.maxMp ?? null,
      isAlive: combatant.isAlive !== false && (combatant.currentHp ?? 1) > 0,
      buffs: toStatusInstances(combatant.buffs, 'buff'),
      debuffs: toStatusInstances(combatant.debuffs, 'debuff'),
      visibleEffects: toStatusInstances(combatant.visibleEffects || [], 'unknown'),
      equipment: combatant.equipment || { primaryArms: [], secondaryArms: [], items: [] },
      stats: combatant.stats || {},
      resistances: combatant.resistances || {},
      sourceConfidence: combatant.sourceConfidence ?? 0.5,
    };
  });

  const heroDetailRaw = raw.heroDetail || null;
  const heroDetail: HeroDetailSnapshot | null = heroDetailRaw ? {
    unitId: heroDetailRaw.unitId || null,
    name: heroDetailRaw.name || null,
    level: heroDetailRaw.level ?? null,
    vitals: heroDetailRaw.vitals || {},
    stats: heroDetailRaw.stats || {},
    dynamicScores: heroDetailRaw.dynamicScores || {},
    modifiers: heroDetailRaw.modifiers || {},
    resistances: heroDetailRaw.resistances || {},
    traits: heroDetailRaw.traits || [],
    passives: heroDetailRaw.passives || [],
    abilities: heroDetailRaw.abilities || [],
    items: heroDetailRaw.items || [],
  } : null;

  return {
    version: raw.version || COMBAT_FRAME_VERSION,
    turnNumber: raw.turnNumber || 0,
    encounterType: raw.encounterType || inferEncounterType(combatants),
    combatants,
    activeTurn: {
      activeUnitId: raw.activeTurn?.activeUnitId || null,
      activeSide: raw.activeTurn?.activeSide ? toSide(raw.activeTurn.activeSide) : null,
      activeSlot: raw.activeTurn?.activeSlot ?? null,
      selectedTargetId: raw.activeTurn?.selectedTargetId || null,
      selectedTargetSide: raw.activeTurn?.selectedTargetSide ? toSide(raw.activeTurn.selectedTargetSide) : null,
      legalActions: (raw.activeTurn?.legalActions || []) as ActionAvailability[],
      legalConsumables: (raw.activeTurn?.legalConsumables || []) as ActionAvailability[],
      visibleLockouts: raw.activeTurn?.visibleLockouts || {},
      battleBudgetRemaining: raw.activeTurn?.battleBudgetRemaining ?? null,
    },
    turnOrder: ((raw.turnOrder || []) as TurnOrderEntry[]).map((entry, index) => ({
      ...entry,
      side: toSide(entry.side),
      ordinal: entry.ordinal ?? index,
    })),
    battleLogEntries: ((raw.battleLogEntries || []) as BattleLogEvent[]).map((entry) => ({
      ...entry,
      actorSide: entry.actorSide ? toSide(entry.actorSide) : null,
      targetSide: entry.targetSide ? toSide(entry.targetSide) : null,
      statusApplications: toStatusInstances(entry.statusApplications as StatusInstance[] || [], 'unknown'),
    })),
    heroDetail,
    captureMeta: {
      version: raw.captureMeta?.version || COMBAT_FRAME_VERSION,
      huntId: raw.captureMeta?.huntId || null,
      sessionToken: raw.captureMeta?.sessionToken || null,
      source: raw.captureMeta?.source || 'dom',
      capturedAt: raw.captureMeta?.capturedAt || Date.now(),
      parserVersion: raw.captureMeta?.parserVersion || `combat-frame/${COMBAT_FRAME_VERSION}`,
      confidence: raw.captureMeta?.confidence || {},
    },
  };
}
