export const COMBAT_FRAME_VERSION = 1;

export type CombatFrameSource = 'dom' | 'network' | 'firebase' | 'synthetic';
export type CombatantSide = 'player' | 'enemy';

export interface StatusInstance {
  id: string;
  name: string;
  category: 'buff' | 'debuff' | 'unknown';
  stacks: number | null;
  durationTurns: number | null;
  sourceText?: string | null;
}

export interface EquipmentSummary {
  primaryArms: string[];
  secondaryArms: string[];
  items: string[];
}

export interface CombatantSnapshot {
  unitId: string;
  side: CombatantSide;
  slot: number | null;
  name: string;
  normalizedId: string;
  currentHp: number | null;
  maxHp: number | null;
  currentMp: number | null;
  maxMp: number | null;
  isAlive: boolean;
  buffs: StatusInstance[];
  debuffs: StatusInstance[];
  visibleEffects: StatusInstance[];
  equipment: EquipmentSummary;
  stats: Record<string, number | null>;
  resistances?: Record<string, number | null>;
  sourceConfidence: number;
}

export interface ActionAvailability {
  name: string;
  skillId?: string | null;
  type: 'basic_attack' | 'skill' | 'consumable' | 'unknown';
  available: boolean;
  manaCost?: number | null;
  budgetCost?: number | null;
  cooldownTurns?: number | null;
  requiresTarget?: boolean | null;
  targetType?: string | null;
  sourceConfidence: number;
}

export interface TurnOrderEntry {
  unitId: string;
  name: string;
  side: CombatantSide;
  slot: number | null;
  ticksUntilTurn: number | null;
  ordinal: number;
}

export interface BattleLogTargetDelta {
  unitId?: string | null;
  name?: string | null;
  side?: CombatantSide | null;
  slot?: number | null;
  damage?: number | null;
  heal?: number | null;
  hpBefore?: number | null;
  hpAfter?: number | null;
  mpBefore?: number | null;
  mpAfter?: number | null;
  statusesApplied?: StatusInstance[];
}

export interface BattleLogEvent {
  turnNumber: number;
  actorName: string | null;
  actorSide: CombatantSide | null;
  actorSlot: number | null;
  ability: string | null;
  actionType: string | null;
  targetName: string | null;
  targetSide: CombatantSide | null;
  targetSlot: number | null;
  targets: BattleLogTargetDelta[];
  damageType?: string | null;
  manaDelta?: number | null;
  statusApplications: StatusInstance[];
  outcomes: string[];
  rawText?: string | null;
  sourceConfidence: number;
}

export interface HeroDetailSnapshot {
  unitId: string | null;
  name: string | null;
  level: number | null;
  vitals: Record<string, number | null>;
  stats: Record<string, number | null>;
  dynamicScores: Record<string, number | null>;
  modifiers: Record<string, number | null>;
  resistances: Record<string, number | null>;
  traits: string[];
  passives: string[];
  abilities: string[];
  items: string[];
}

export interface ActiveTurnSnapshot {
  activeUnitId: string | null;
  activeSide: CombatantSide | null;
  activeSlot: number | null;
  selectedTargetId: string | null;
  selectedTargetSide: CombatantSide | null;
  legalActions: ActionAvailability[];
  legalConsumables: ActionAvailability[];
  visibleLockouts: Record<string, number | null>;
  battleBudgetRemaining: number | null;
}

export interface CaptureMeta {
  version: number;
  huntId: string | null;
  sessionToken: string | null;
  source: CombatFrameSource;
  capturedAt: number;
  parserVersion: string;
  confidence: Record<string, number>;
}

export interface CombatFrame {
  version: number;
  turnNumber: number;
  encounterType: string | null;
  combatants: CombatantSnapshot[];
  activeTurn: ActiveTurnSnapshot;
  turnOrder: TurnOrderEntry[];
  battleLogEntries: BattleLogEvent[];
  heroDetail: HeroDetailSnapshot | null;
  captureMeta: CaptureMeta;
}

export function normalizeCombatantName(value: string | null | undefined): string {
  return String(value || 'Unknown').trim();
}

export function normalizeId(value: string | null | undefined): string {
  return normalizeCombatantName(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'unknown';
}

export function buildUnitId(side: CombatantSide, slot: number | null | undefined, name: string | null | undefined): string {
  const slotPart = slot == null || Number.isNaN(slot) ? 'na' : String(slot);
  return `${side}:${slotPart}:${normalizeId(name)}`;
}

export function parseStatusText(input: string | null | undefined, category: 'buff' | 'debuff' | 'unknown' = 'unknown'): StatusInstance {
  const raw = normalizeCombatantName(input);
  const stackMatch = raw.match(/(?:x|stack(?:s)?\s*:?\s*)(\d+)/i);
  const turnsMatch = raw.match(/(\d+)\s*(?:turn|tick)/i);
  const name = raw
    .replace(/\((.*?)\)/g, '$1')
    .replace(/(?:x|stack(?:s)?\s*:?\s*)\d+/gi, '')
    .replace(/\d+\s*(?:turn|tick)s?/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  return {
    id: normalizeId(name || raw),
    name: name || raw,
    category,
    stacks: stackMatch ? Number(stackMatch[1]) : null,
    durationTurns: turnsMatch ? Number(turnsMatch[1]) : null,
    sourceText: raw || null,
  };
}

export function toStatusInstances(values: Array<string | StatusInstance> | null | undefined, category: 'buff' | 'debuff' | 'unknown'): StatusInstance[] {
  if (!values) return [];
  return values
    .map((value) => typeof value === 'string' ? parseStatusText(value, category) : { ...value, category: value.category || category })
    .filter((value) => !!value.name);
}
