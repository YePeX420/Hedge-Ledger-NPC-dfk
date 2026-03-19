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
  type TurnOrderDelta,
  type TurnOrderDeltaChange,
  type TurnOrderDeltaSummary,
  type TurnOrderDiagnosticCandidate,
  type TurnOrderDiagnostics,
  type TurnOrderHistoryEntry,
  type TurnOrderEntry,
  type TurnOrderSourceKind,
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

function toNullableNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function compareNullableNumbers(a: number | null | undefined, b: number | null | undefined): number {
  const left = a == null ? Number.POSITIVE_INFINITY : a;
  const right = b == null ? Number.POSITIVE_INFINITY : b;
  if (left !== right) return left - right;
  return 0;
}

function normalizeTurnOrderEntry(entry: Record<string, any>, ordinal: number): TurnOrderEntry {
  const side = toSide(entry.side);
  const slot = entry.slot == null ? null : Number(entry.slot);
  const name = String(entry.name || 'Unknown').trim();
  const unitId = entry.unitId || buildUnitId(side, slot, name);
  return {
    unitId,
    name,
    side,
    slot: Number.isFinite(slot) ? slot : null,
    ticksUntilTurn: toNullableNumber(entry.ticksUntilTurn ?? entry.ticks ?? null),
    totalTicks: toNullableNumber(entry.totalTicks ?? null),
    turnType: toNullableNumber(entry.turnType ?? null),
    ordinal: Number.isFinite(Number(entry.ordinal)) ? Number(entry.ordinal) : ordinal,
    heroId: entry.heroId != null ? String(entry.heroId) : null,
    heroClass: entry.heroClass != null ? String(entry.heroClass) : null,
    level: toNullableNumber(entry.level ?? null),
    iconUrl: entry.iconUrl != null ? String(entry.iconUrl) : null,
    source: entry.source != null ? String(entry.source) : null,
  };
}

function sortTurnOrderEntries(entries: Array<Record<string, any>>): TurnOrderEntry[] {
  return (entries || [])
    .map((entry, index) => normalizeTurnOrderEntry(entry, index))
    .sort((a, b) => {
      const tickCompare = compareNullableNumbers(a.ticksUntilTurn, b.ticksUntilTurn);
      if (tickCompare !== 0) return tickCompare;
      const totalTickCompare = compareNullableNumbers(a.totalTicks, b.totalTicks);
      if (totalTickCompare !== 0) return totalTickCompare;
      const sideCompare = String(a.side).localeCompare(String(b.side));
      if (sideCompare !== 0) return sideCompare;
      const slotCompare = compareNullableNumbers(a.slot, b.slot);
      if (slotCompare !== 0) return slotCompare;
      const unitCompare = String(a.unitId).localeCompare(String(b.unitId));
      if (unitCompare !== 0) return unitCompare;
      return compareNullableNumbers(a.ordinal, b.ordinal);
    })
    .map((entry, index) => ({
      ...entry,
      ordinal: index,
    }));
}

function buildTurnOrderSignature(entries: TurnOrderEntry[], turnNumber: number | null, activeTurnUnitId: string | null): string {
  return [
    turnNumber ?? 'na',
    activeTurnUnitId || 'na',
    ...(entries || []).map((entry) => [
      entry.unitId,
      entry.side,
      entry.slot ?? 'na',
      entry.ticksUntilTurn ?? 'na',
      entry.totalTicks ?? 'na',
      entry.turnType ?? 'na',
    ].join(':')),
  ].join('|');
}

function summarizeTurnOrderEntry(entry: TurnOrderEntry): TurnOrderEntry {
  return {
    ...entry,
    source: entry.source || null,
  };
}

function normalizeTurnOrderHistoryEntry(entry: Record<string, any>, index: number): TurnOrderHistoryEntry | null {
  if (!entry || typeof entry !== 'object') return null;
  const entries = Array.isArray(entry.entries) ? sortTurnOrderEntries(entry.entries) : [];
  return {
    snapshotId: String(entry.snapshotId || `turn_snapshot_${index}`),
    capturedAt: toNullableNumber(entry.capturedAt) ?? Date.now(),
    turnNumber: toNullableNumber(entry.turnNumber),
    source: entry.source != null ? String(entry.source) : null,
    signature: String(entry.signature || buildTurnOrderSignature(entries, toNullableNumber(entry.turnNumber), entry.activeTurnUnitId != null ? String(entry.activeTurnUnitId) : null)),
    activeTurnUnitId: entry.activeTurnUnitId != null ? String(entry.activeTurnUnitId) : null,
    entries,
  };
}

function normalizeTurnOrderDeltaChange(entry: Record<string, any>): TurnOrderDeltaChange | null {
  if (!entry || typeof entry !== 'object') return null;
  return {
    unitId: String(entry.unitId || 'unknown'),
    name: String(entry.name || 'Unknown'),
    side: toSide(entry.side),
    slot: entry.slot == null ? null : Number(entry.slot),
    beforeTicksUntilTurn: toNullableNumber(entry.beforeTicksUntilTurn ?? null),
    afterTicksUntilTurn: toNullableNumber(entry.afterTicksUntilTurn ?? null),
    ticksDelta: toNullableNumber(entry.ticksDelta ?? null),
    beforeTotalTicks: toNullableNumber(entry.beforeTotalTicks ?? null),
    afterTotalTicks: toNullableNumber(entry.afterTotalTicks ?? null),
    totalTicksDelta: toNullableNumber(entry.totalTicksDelta ?? null),
    beforeOrdinal: toNullableNumber(entry.beforeOrdinal ?? null),
    afterOrdinal: toNullableNumber(entry.afterOrdinal ?? null),
    turnTypeChanged: entry.turnTypeChanged === true,
  };
}

function normalizeTurnOrderDelta(entry: Record<string, any> | null): TurnOrderDelta | null {
  if (!entry || typeof entry !== 'object') return null;
  const added = Array.isArray(entry.added) ? sortTurnOrderEntries(entry.added) : [];
  const removed = Array.isArray(entry.removed) ? sortTurnOrderEntries(entry.removed) : [];
  const changed = Array.isArray(entry.changed)
    ? entry.changed.map(normalizeTurnOrderDeltaChange).filter(Boolean) as TurnOrderDeltaChange[]
    : [];
  const orderAfter = Array.isArray(entry.orderAfter) ? entry.orderAfter.map((value) => String(value)) : [];
  const orderBefore = Array.isArray(entry.orderBefore) ? entry.orderBefore.map((value) => String(value)) : [];
  return {
    snapshotId: String(entry.snapshotId || 'turn_delta'),
    previousSnapshotId: entry.previousSnapshotId != null ? String(entry.previousSnapshotId) : null,
    capturedAt: toNullableNumber(entry.capturedAt) ?? Date.now(),
    previousCapturedAt: toNullableNumber(entry.previousCapturedAt ?? null),
    turnNumber: toNullableNumber(entry.turnNumber),
    previousTurnNumber: toNullableNumber(entry.previousTurnNumber ?? null),
    source: entry.source != null ? String(entry.source) : null,
    orderChanged: entry.orderChanged === true,
    activeTurnChanged: entry.activeTurnChanged === true,
    activeTurnBeforeUnitId: entry.activeTurnBeforeUnitId != null ? String(entry.activeTurnBeforeUnitId) : null,
    activeTurnAfterUnitId: entry.activeTurnAfterUnitId != null ? String(entry.activeTurnAfterUnitId) : null,
    added,
    removed,
    changed,
    orderBefore,
    orderAfter,
    signatureBefore: entry.signatureBefore != null ? String(entry.signatureBefore) : null,
    signatureAfter: String(entry.signatureAfter || ''),
  };
}

function summarizeTurnOrderHistory(entry: TurnOrderHistoryEntry | null) {
  if (!entry) return null;
  return {
    snapshotId: entry.snapshotId,
    capturedAt: entry.capturedAt,
    turnNumber: entry.turnNumber,
    source: entry.source,
    signature: entry.signature,
    activeTurnUnitId: entry.activeTurnUnitId,
    entryCount: Array.isArray(entry.entries) ? entry.entries.length : 0,
    entries: entry.entries.slice(0, 12).map(summarizeTurnOrderEntry),
  };
}

function summarizeTurnOrderDelta(delta: TurnOrderDelta | null) {
  if (!delta) return null;
  return {
    snapshotId: delta.snapshotId,
    previousSnapshotId: delta.previousSnapshotId,
    capturedAt: delta.capturedAt,
    previousCapturedAt: delta.previousCapturedAt,
    turnNumber: delta.turnNumber,
    previousTurnNumber: delta.previousTurnNumber,
    source: delta.source,
    orderChanged: delta.orderChanged,
    activeTurnChanged: delta.activeTurnChanged,
    activeTurnBeforeUnitId: delta.activeTurnBeforeUnitId,
    activeTurnAfterUnitId: delta.activeTurnAfterUnitId,
    addedCount: delta.added.length,
    removedCount: delta.removed.length,
    changedCount: delta.changed.length,
    orderBefore: delta.orderBefore,
    orderAfter: delta.orderAfter,
    signatureBefore: delta.signatureBefore,
    signatureAfter: delta.signatureAfter,
    changes: delta.changed.slice(0, 12),
  };
}

function summarizeTurnOrderDiagnostics(diagnostics: TurnOrderDiagnostics | null) {
  if (!diagnostics) return null;
  return {
    snapshotId: diagnostics.snapshotId,
    signature: diagnostics.signature,
    capturedAt: diagnostics.capturedAt,
    turnNumber: diagnostics.turnNumber,
    selectedSource: diagnostics.selectedSource,
    selectedKind: diagnostics.selectedKind,
    selectedConfidence: diagnostics.selectedConfidence,
    selectedReason: diagnostics.selectedReason,
    selectedEntryCount: Array.isArray(diagnostics.selectedEntries) ? diagnostics.selectedEntries.length : 0,
    candidateCount: Array.isArray(diagnostics.candidates) ? diagnostics.candidates.length : 0,
    rankingReasons: diagnostics.rankingReasons,
    fieldMatches: diagnostics.fieldMatches,
    fieldRejections: diagnostics.fieldRejections,
    deltaSummary: diagnostics.deltaSummary,
    historyCount: diagnostics.historyCount,
    liveCaptureMode: diagnostics.liveCaptureMode,
  };
}

function normalizeTurnOrderEntriesPreserveOrder(entries: Array<Record<string, any>>): TurnOrderEntry[] {
  return (entries || []).map((entry, index) => normalizeTurnOrderEntry(entry, index));
}

const TURN_ORDER_FIELD_KEYS = [
  'unitId',
  'name',
  'side',
  'slot',
  'ticksUntilTurn',
  'totalTicks',
  'turnType',
  'heroId',
  'heroClass',
  'level',
  'iconUrl',
] as const;

function buildTurnOrderFieldSummary(entries: TurnOrderEntry[]) {
  const matched: string[] = [];
  const rejected: string[] = [];
  for (const key of TURN_ORDER_FIELD_KEYS) {
    const hasValue = (entries || []).some((entry) => (entry as Record<string, any>)[key] != null && (entry as Record<string, any>)[key] !== '');
    (hasValue ? matched : rejected).push(key);
  }
  return { matched, rejected };
}

function toTurnOrderSourceKind(value: unknown): TurnOrderSourceKind {
  if (value === 'runtime') return 'runtime';
  if (value === 'network') return 'network';
  if (value === 'modal') return 'modal';
  if (value === 'strip') return 'strip';
  return 'none';
}

function normalizeTurnOrderDeltaSummary(raw: Record<string, any> | null): TurnOrderDeltaSummary | null {
  if (!raw || typeof raw !== 'object') return null;
  return {
    snapshotId: raw.snapshotId != null ? String(raw.snapshotId) : null,
    previousSnapshotId: raw.previousSnapshotId != null ? String(raw.previousSnapshotId) : null,
    capturedAt: toNullableNumber(raw.capturedAt ?? null),
    previousCapturedAt: toNullableNumber(raw.previousCapturedAt ?? null),
    turnNumber: toNullableNumber(raw.turnNumber ?? null),
    previousTurnNumber: toNullableNumber(raw.previousTurnNumber ?? null),
    orderChanged: raw.orderChanged === true,
    activeTurnChanged: raw.activeTurnChanged === true,
    addedCount: Number.isFinite(Number(raw.addedCount))
      ? Number(raw.addedCount)
      : Array.isArray(raw.added) ? raw.added.length : 0,
    removedCount: Number.isFinite(Number(raw.removedCount))
      ? Number(raw.removedCount)
      : Array.isArray(raw.removed) ? raw.removed.length : 0,
    changedCount: Number.isFinite(Number(raw.changedCount))
      ? Number(raw.changedCount)
      : Array.isArray(raw.changed) ? raw.changed.length : 0,
    signatureBefore: raw.signatureBefore != null ? String(raw.signatureBefore) : null,
    signatureAfter: raw.signatureAfter != null ? String(raw.signatureAfter) : null,
  };
}

function normalizeTurnOrderDiagnosticCandidate(entry: Record<string, any>): TurnOrderDiagnosticCandidate | null {
  if (!entry || typeof entry !== 'object') return null;
  const normalizedEntries = Array.isArray(entry.entries)
    ? normalizeTurnOrderEntriesPreserveOrder(entry.entries).slice(0, 12)
    : [];
  const fieldSummary = buildTurnOrderFieldSummary(normalizedEntries);
  return {
    kind: toTurnOrderSourceKind(entry.kind),
    source: entry.source != null ? String(entry.source) : null,
    transport: entry.transport != null ? String(entry.transport) : null,
    count: Number.isFinite(Number(entry.count)) ? Number(entry.count) : normalizedEntries.length,
    fresh: entry.fresh === true,
    ageMs: toNullableNumber(entry.ageMs ?? null),
    confidence: Number.isFinite(Number(entry.confidence)) ? Number(entry.confidence) : 0,
    reason: entry.reason != null ? String(entry.reason) : null,
    matchedFields: Array.isArray(entry.matchedFields) && entry.matchedFields.length > 0
      ? entry.matchedFields.map((value: any) => String(value))
      : fieldSummary.matched,
    rejectedFields: Array.isArray(entry.rejectedFields) && entry.rejectedFields.length > 0
      ? entry.rejectedFields.map((value: any) => String(value))
      : fieldSummary.rejected,
    entries: normalizedEntries,
  };
}

function normalizeTurnOrderDiagnostics(raw: Record<string, any> | null): TurnOrderDiagnostics | null {
  if (!raw || typeof raw !== 'object') return null;
  const selectedEntries = Array.isArray(raw.selectedEntries)
    ? sortTurnOrderEntries(raw.selectedEntries)
    : Array.isArray(raw.turnOrder)
      ? sortTurnOrderEntries(raw.turnOrder)
      : [];
  const candidates = Array.isArray(raw.candidates)
    ? raw.candidates.map((candidate: Record<string, any>) => normalizeTurnOrderDiagnosticCandidate(candidate)).filter(Boolean) as TurnOrderDiagnosticCandidate[]
    : [];
  const selectedFieldSummary = buildTurnOrderFieldSummary(selectedEntries);
  return {
    snapshotId: raw.snapshotId != null ? String(raw.snapshotId) : null,
    signature: raw.signature != null ? String(raw.signature) : null,
    capturedAt: toNullableNumber(raw.capturedAt ?? null),
    turnNumber: toNullableNumber(raw.turnNumber ?? null),
    selectedSource: raw.selectedSource != null ? String(raw.selectedSource) : null,
    selectedKind: toTurnOrderSourceKind(raw.selectedKind),
    selectedConfidence: Number.isFinite(Number(raw.selectedConfidence)) ? Number(raw.selectedConfidence) : 0,
    selectedReason: raw.selectedReason != null ? String(raw.selectedReason) : null,
    selectedEntries,
    candidates,
    rankingReasons: Array.isArray(raw.rankingReasons)
      ? raw.rankingReasons.map((value: any) => String(value)).filter(Boolean)
      : [],
    fieldMatches: Array.isArray(raw.fieldMatches) && raw.fieldMatches.length > 0
      ? raw.fieldMatches.map((value: any) => String(value)).filter(Boolean)
      : selectedFieldSummary.matched,
    fieldRejections: Array.isArray(raw.fieldRejections) && raw.fieldRejections.length > 0
      ? raw.fieldRejections.map((value: any) => String(value)).filter(Boolean)
      : selectedFieldSummary.rejected,
    deltaSummary: normalizeTurnOrderDeltaSummary(raw.deltaSummary || raw.delta || raw.turnOrderDelta || null),
    historyCount: Number.isFinite(Number(raw.historyCount)) ? Number(raw.historyCount) : 0,
    liveCaptureMode: raw.liveCaptureMode === 'network_fallback'
      ? 'network_fallback'
      : raw.liveCaptureMode === 'diagnostic_only'
        ? 'diagnostic_only'
        : 'runtime_first',
  };
}

function detectActiveTurnUnitId(entries: TurnOrderEntry[]): string | null {
  return entries[0]?.unitId || null;
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
    turnOrder: frame.turnOrder,
    turnOrderHistory: frame.turnOrderHistory || battleState.turnOrderHistory || [],
    turnOrderDelta: frame.turnOrderDelta ?? battleState.turnOrderDelta ?? null,
    activeTurnUnitId: frame.activeTurn.activeUnitId || detectActiveTurnUnitId(frame.turnOrder),
  };
}

export function summarizeCombatFrameBattleState(frame: CombatFrame | null, battleState: BattleState) {
  const statuses = (combatant: CombatantSnapshot) => [...combatant.buffs, ...combatant.debuffs];
  return {
    turnNumber: battleState.turnNumber,
    activeHeroSlot: battleState.activeHeroSlot,
    activeTurnUnitId: battleState.activeTurnUnitId ?? frame?.activeTurn.activeUnitId ?? null,
    turnOrderCount: Array.isArray(frame?.turnOrder) ? frame.turnOrder.length : 0,
    turnOrderHistoryCount: Array.isArray(frame?.turnOrderHistory) ? frame.turnOrderHistory.length : 0,
    turnOrderDelta: summarizeTurnOrderDelta(frame?.turnOrderDelta || null),
    turnOrderDiagnostics: summarizeTurnOrderDiagnostics(frame?.turnOrderDiagnostics || null),
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

  const turnOrder = sortTurnOrderEntries(Array.isArray(raw.turnOrder) ? raw.turnOrder : []);
  const turnOrderHistory = Array.isArray(raw.turnOrderHistory)
    ? raw.turnOrderHistory.map((entry: Record<string, any>, index: number) => normalizeTurnOrderHistoryEntry(entry, index)).filter(Boolean) as TurnOrderHistoryEntry[]
    : [];
  const turnOrderDelta = raw.turnOrderDelta ? normalizeTurnOrderDelta(raw.turnOrderDelta) : null;
  const turnOrderDiagnostics = normalizeTurnOrderDiagnostics(raw.turnOrderDiagnostics || raw._debug?.turnOrderDiagnostics || null);

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
    turnOrder,
    turnOrderHistory,
    turnOrderDelta,
    turnOrderDiagnostics,
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
