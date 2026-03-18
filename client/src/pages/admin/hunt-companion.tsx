import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Swords, Loader2, Copy, Check, Wifi, WifiOff, Heart, Zap,
  Shield, ChevronDown, ChevronUp, Bot, Sparkles, Target,
  Skull, Activity, Radio, Brain, FlaskConical, Lock, Unlock,
  AlertTriangle, TrendingUp, Eye, Play, Pause, ScrollText, RefreshCw, Info,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { apiRequest } from '@/lib/queryClient';
import { CombatAssetChip, formatCombatName } from '@/lib/dfk-combat-icons';
import { cn } from '@/lib/utils';

interface HeroSnapshot {
  slot: number;
  heroId: string;
  mainClass: string;
  iconUrl?: string | null;
  level: number;
  currentHp: number;
  maxHp: number;
  currentMp: number;
  maxMp: number;
  isAlive: boolean;
  statuses?: Array<{ id: string; name: string; category: string; stacks: number | null; durationTurns: number | null }>;
}

interface EnemySnapshot {
  enemyId: string;
  iconUrl?: string | null;
  currentHp: number;
  maxHp: number;
  currentMp?: number | null;
  maxMp?: number | null;
  isDead?: boolean;
  debuffs: string[];
  buffs?: string[];
  statuses?: Array<{ id: string; name: string; category: string; stacks: number | null; durationTurns: number | null }>;
}

interface Recommendation {
  rank: number;
  action: string;
  skillName: string;
  targetType: string;
  targetSlot: number | null;
  damageEv: number;
  killChance: number;
  survivalDelta: number;
  debuffValue: number;
  manaEfficiency: number;
  totalScore: number;
  reasoning: string;
}

interface TurnEvent {
  turnNumber: number;
  actorSide: string;
  actorSlot: number | null;
  skillId?: string;
  actor?: string | null;
  ability?: string | null;
  targets?: Array<{ slot: number; hpBefore: number; hpAfter: number; damage: number }>;
}

interface BattleStateMsg {
  turnNumber: number;
  activeHeroSlot: number;
  heroes: HeroSnapshot[];
  enemies: EnemySnapshot[];
  combatFrame?: CombatFrame | null;
}

interface StatusInstance {
  id: string;
  name: string;
  category: string;
  stacks: number | null;
  durationTurns: number | null;
  iconUrl?: string | null;
}

interface HeroDetailData {
  name: string | null;
  level: number | null;
  heroClass?: string | null;
  iconUrl?: string | null;
  vitals: Record<string, number | null>;
  baseStats?: Record<string, number | null>;
  stats: Record<string, number | null>;
  dynamicScores?: Record<string, number | null>;
  modifiers?: Record<string, number | null>;
  resistances: Record<string, number | null>;
  traits?: string[];
  passives: string[];
  abilities: string[];
  items: string[];
  primaryArms?: string[];
  secondaryArms?: string[];
}

interface CombatFrame {
  version: number;
  turnNumber: number;
  encounterType: string | null;
  combatants: Array<{
    unitId: string;
    side: 'player' | 'enemy';
    slot: number | null;
    name: string;
    normalizedId: string;
    iconUrl?: string | null;
    heroClass?: string | null;
    heroId?: string | null;
    currentHp: number | null;
    maxHp: number | null;
    currentMp: number | null;
    maxMp: number | null;
    isAlive: boolean;
    buffs: StatusInstance[];
    debuffs: StatusInstance[];
    visibleEffects: StatusInstance[];
    equipment: { primaryArms: string[]; secondaryArms: string[]; items: string[] };
    stats: Record<string, number | null>;
    resistances?: Record<string, number | null>;
    heroDetail?: HeroDetailData | null;
    sourceConfidence: number;
  }>;
  activeTurn: {
    activeUnitId: string | null;
    activeSide: 'player' | 'enemy' | null;
    activeSlot: number | null;
    selectedTargetId: string | null;
    selectedTargetSide: 'player' | 'enemy' | null;
    legalActions: Array<{ name: string; skillId?: string | null; type: string; group?: string | null; available: boolean; sourceConfidence: number; iconUrl?: string | null }>;
    legalConsumables: Array<{ name: string; type: string; available: boolean; sourceConfidence: number; iconUrl?: string | null }>;
    visibleLockouts: Record<string, number | null>;
    battleBudgetRemaining: number | null;
  };
  turnOrder: Array<{ unitId: string; name: string; side: 'player' | 'enemy'; slot: number | null; ticksUntilTurn: number | null; ordinal: number }>;
  battleLogEntries: Array<{ turnNumber: number; actorName: string | null; ability: string | null; outcomes: string[]; rawText?: string | null }>;
  heroDetail: HeroDetailData | null;
  captureMeta: {
    source: string;
    capturedAt: number;
    confidence: Record<string, number>;
  };
}

interface SessionData {
  id: number;
  session_token: string;
  status: string;
  label?: string | null;
  owner_user_id?: string | null;
  owner_username?: string | null;
  wallet_address?: string;
  hunt_id?: string | null;
  latest_hunt_id?: string | null;
  created_at: string;
  last_seen_at: string;
  selected_by_extension_at?: string | null;
  refresh_required_at?: string | null;
  completed_at?: string | null;
  archived_at?: string | null;
  connected_clients?: number;
  requires_tab_refresh?: boolean;
}

interface CompanionSessionListResponse {
  ok: boolean;
  sessions: SessionData[];
}

interface CompanionSessionDetailResponse {
  ok: boolean;
  session: SessionData;
  turnEvents?: TurnEvent[];
  heroStates?: HeroStateRaw[] | null;
  enemyId?: string | null;
  combatFrame?: CombatFrame | null;
  connectedClients?: number;
  latestHuntId?: string | null;
}

interface HeroStateRaw {
  slot?: number;
  heroId?: string;
  mainClass?: string;
  level?: number;
  currentHp?: number;
  hp?: number;
  maxHp?: number;
  currentMp?: number;
  mp?: number;
  maxMp?: number;
}

interface FirebaseUnit {
  side?: 1 | -1;
  slot?: number;
  unitId?: string;
  name: string;
  hp: number | null;
  maxHp: number | null;
  mp: number | null;
  maxMp: number | null;
  isDead: boolean;
  statuses?: Array<{ id: string | null; name: string | null; turnsLeft: number | null }>;
}

interface FirebaseTurn {
  turnId: string;
  round: number | null;
  turn: number | null;
  activeSide: number | null;
  activeSlot: number | null;
  actionType: string | null;
  battleLog: string | null;
}

interface FirebaseBattleState {
  ok: boolean;
  huntRef: string;
  meta: {
    hasWinner: boolean | null;
    winnerSide: number | null;
    scenarioId: string | null;
    combatType: string | null;
    turnCount: number | null;
    allTurnCount: number | null;
    sessionStatus: number | null;
    created: string | null;
    modified: string | null;
    chainId: number | null;
    playerUids: unknown;
  } | null;
  latestCombatants: Record<string, Record<string, FirebaseUnit>> | null;
  normalizedCombatants: {
    heroes: FirebaseUnit[];
    enemies: FirebaseUnit[];
  };
  turns: FirebaseTurn[];
  currentTurn: FirebaseTurn | null;
  totalTurns: number;
  lastModified: string | null;
}

interface DomActionState {
  combatFrame: CombatFrame | null;
  activeHeroSlot: number | null;
  activeUnitId: string | null;
  legalActions: string[];
  legalConsumables: string[];
  selectedTargetId: string | null;
  battleBudgetRemaining: number | null;
  source: string | null;
}

interface EnemyPrediction {
  enemy: string;
  legalActions: string[];
  availability: Array<{ name: string; available: boolean; reason: string }>;
  heuristicPriors: Record<string, number>;
  learnedPolicy: Record<string, number> | null;
  finalPolicy: Record<string, number>;
  confidence: number;
  sampleCount: number;
  consumableOptions: Array<{ name: string; cost: number; available: boolean }>;
  reasoning: string[];
  executionMode: string;
  execution?: {
    actionType: string;
    abilityName: string;
    targetSlot?: number;
    dispatch?: {
      uiAction: string;
      buttonLabel: string;
      requiresTargetSelection: boolean;
      targetSelectionStrategy: string;
      confirmAfterSelect: boolean;
      fallbackOnMiss: string;
    };
    turnSync?: {
      expectNewTurnAfterAction: boolean;
      timeoutMs: number;
      expectedStateChanges: string[];
    };
  };
  simulation?: {
    rankedCandidates: Array<{
      action: string;
      type: string;
      compositeScore: number;
      survivalProbability: number;
      killProbability: number;
      expectedDamage: number;
      expectedIncomingDamage: number;
      consumableValue: number;
      budgetCost: number;
      simulationCount: number;
      fallbackMode: boolean;
    }>;
    degraded: boolean;
    totalSimulations: number;
  } | null;
  safetyCheck: {
    canAutoExecute: boolean;
    blockReasons: string[];
    checksPassed: string[];
  };
}

type ExecutionModeType = 'observe_only' | 'recommend_and_confirm' | 'auto_execute';

function normalizeFirebaseStatuses(unit: FirebaseUnit | undefined): StatusInstance[] {
  return (unit?.statuses || [])
    .filter((status) => status?.name)
    .map((status) => ({
      id: status.id || status.name || 'status',
      name: status.name || 'Status',
      category: 'debuff',
      stacks: null,
      durationTurns: status.turnsLeft ?? null,
    }));
}

function firebaseToHeroSnapshot(unit: FirebaseUnit, fallbackSlot: number): HeroSnapshot {
  return {
    slot: unit.slot ?? fallbackSlot,
    heroId: unit.unitId || String(unit.slot ?? fallbackSlot),
    mainClass: unit.name || 'Hero',
    level: 0,
    currentHp: unit.hp ?? 0,
    maxHp: unit.maxHp ?? 0,
    currentMp: unit.mp ?? 0,
    maxMp: unit.maxMp ?? 0,
    isAlive: !unit.isDead,
    statuses: normalizeFirebaseStatuses(unit),
  };
}

interface PredictedEnemyContext {
  enemy: EnemySnapshot | null;
  displayName: string | null;
  source: 'turn_order' | 'fallback';
  ticksUntilTurn: number | null;
}

function firebaseToEnemySnapshot(unit: FirebaseUnit, fallbackIndex: number): EnemySnapshot {
  const enemyId = (unit.name || `Enemy ${fallbackIndex + 1}`).trim().replace(/\s+/g, '_').toUpperCase();
  const statuses = normalizeFirebaseStatuses(unit);
  return {
    enemyId,
    currentHp: unit.hp ?? 0,
    maxHp: unit.maxHp ?? 0,
    currentMp: unit.mp,
    debuffs: statuses.map((status) => status.name),
    buffs: [],
    statuses,
  };
}

function buildFirebaseBattleView(firebaseState: FirebaseBattleState | undefined, combatFrame: CombatFrame | null): BattleStateMsg | null {
  if (!firebaseState?.normalizedCombatants) return null;
  const heroes = (firebaseState.normalizedCombatants.heroes || []).map(firebaseToHeroSnapshot);
  const enemies = (firebaseState.normalizedCombatants.enemies || []).map(firebaseToEnemySnapshot);
  const activeHeroSlot = firebaseState.currentTurn?.activeSide === 1
    ? (firebaseState.currentTurn.activeSlot ?? combatFrame?.activeTurn.activeSlot ?? 0)
    : (combatFrame?.activeTurn.activeSlot ?? 0);

  if (heroes.length === 0 && enemies.length === 0) return null;

  return {
    turnNumber: firebaseState.currentTurn?.turn ?? firebaseState.meta?.turnCount ?? 0,
    activeHeroSlot,
    heroes,
    enemies,
    combatFrame,
  };
}

function buildFirebaseTurnFeed(firebaseState: FirebaseBattleState | undefined): TurnEvent[] {
  function parseTurnActor(turn: FirebaseTurn): { actorSide: string; actor: string | null } {
    const rawText = turn.battleLog || '';
    const actorMatch = rawText.match(/^\[(A[HE]|P\d+|E\d+|H\d+|M\d+)\s*:\s*([^\]]+)\]/i);
    if (!actorMatch) {
      return {
        actorSide: turn.activeSide === 1 ? 'player' : turn.activeSide === -1 ? 'enemy' : 'unknown',
        actor: turn.activeSide === 1
          ? `Hero ${turn.activeSlot ?? '?'}`
          : turn.activeSide === -1
          ? `Enemy ${turn.activeSlot ?? '?'}`
          : null,
      };
    }

    const actorTag = actorMatch[1].toUpperCase();
    const actorName = actorMatch[2].trim();
    const actorSide = actorTag.includes('H') || actorTag.startsWith('P')
      ? 'player'
      : actorTag.includes('E') || actorTag.startsWith('M')
      ? 'enemy'
      : /boar|clucker|enemy|monster|rocboc|wolf/i.test(actorName)
      ? 'enemy'
      : 'player';

    return { actorSide, actor: actorName };
  }

  function parseTurnAbility(turn: FirebaseTurn): string | null {
    if (turn.actionType) return turn.actionType;
    const rawText = turn.battleLog || '';
    const performedMatch = rawText.match(/performed\s+(.+?)(?:\s+and|\.)/i);
    return performedMatch?.[1]?.trim() || turn.battleLog || null;
  }

  return (firebaseState?.turns || [])
    .slice(-10)
    .reverse()
    .map((turn) => {
      const actorInfo = parseTurnActor(turn);
      return {
        turnNumber: turn.turn ?? 0,
        actorSide: actorInfo.actorSide,
        actorSlot: turn.activeSlot ?? null,
        skillId: turn.actionType || undefined,
        actor: actorInfo.actor,
        ability: parseTurnAbility(turn),
        targets: [],
      };
    });
}

function areTurnFeedsEqual(a: TurnEvent[], b: TurnEvent[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((turn, index) => {
    const other = b[index];
    return (
      turn.turnNumber === other.turnNumber &&
      turn.actorSide === other.actorSide &&
      turn.actorSlot === other.actorSlot &&
      turn.skillId === other.skillId &&
      turn.actor === other.actor &&
      turn.ability === other.ability
    );
  });
}

function areBattleStatesEqual(a: BattleStateMsg | null, b: BattleStateMsg | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.turnNumber !== b.turnNumber || a.activeHeroSlot !== b.activeHeroSlot) return false;
  if (a.heroes.length !== b.heroes.length || a.enemies.length !== b.enemies.length) return false;

  const heroesEqual = a.heroes.every((hero, index) => {
    const other = b.heroes[index];
    return (
      hero.slot === other.slot &&
      hero.heroId === other.heroId &&
      hero.currentHp === other.currentHp &&
      hero.maxHp === other.maxHp &&
      hero.currentMp === other.currentMp &&
      hero.maxMp === other.maxMp &&
      hero.isAlive === other.isAlive
    );
  });
  if (!heroesEqual) return false;

  return a.enemies.every((enemy, index) => {
    const other = b.enemies[index];
    return (
      enemy.enemyId === other.enemyId &&
      enemy.currentHp === other.currentHp &&
      enemy.maxHp === other.maxHp &&
      enemy.currentMp === other.currentMp &&
      enemy.maxMp === other.maxMp &&
      enemy.isDead === other.isDead &&
      enemy.debuffs.length === other.debuffs.length
    );
  });
}

function formatEnemyDisplayName(enemyId: string | null | undefined): string {
  if (!enemyId) return 'Unknown Enemy';
  return enemyId
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function normalizeLookupKey(value: string | null | undefined): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function getPredictedEnemyContext(
  battleState: BattleStateMsg | null,
  combatFrame: CombatFrame | null,
): PredictedEnemyContext {
  const enemies = battleState?.enemies || [];
  const firstLivingEnemy = enemies.find((enemy) => enemy.currentHp > 0) || enemies[0] || null;
  const upcomingEnemy = (combatFrame?.turnOrder || []).find((entry) => entry.side === 'enemy');

  if (!upcomingEnemy) {
    return {
      enemy: firstLivingEnemy,
      displayName: firstLivingEnemy ? formatEnemyDisplayName(firstLivingEnemy.enemyId) : null,
      source: 'fallback',
      ticksUntilTurn: null,
    };
  }

  const matchedEnemy = enemies.find((enemy) =>
    normalizeLookupKey(enemy.enemyId) === normalizeLookupKey(upcomingEnemy.name) ||
    normalizeLookupKey(formatEnemyDisplayName(enemy.enemyId)) === normalizeLookupKey(upcomingEnemy.name),
  ) || firstLivingEnemy;

  return {
    enemy: matchedEnemy,
    displayName: upcomingEnemy.name || (matchedEnemy ? formatEnemyDisplayName(matchedEnemy.enemyId) : null),
    source: 'turn_order',
    ticksUntilTurn: upcomingEnemy.ticksUntilTurn ?? null,
  };
}

function buildDomActionState(combatFrame: CombatFrame | null): DomActionState {
  return {
    combatFrame,
    activeHeroSlot: combatFrame?.activeTurn.activeSlot ?? null,
    activeUnitId: combatFrame?.activeTurn.activeUnitId ?? null,
    legalActions: (combatFrame?.activeTurn.legalActions || [])
      .filter((action) => action.available !== false)
      .map((action) => action.name)
      .filter(Boolean),
    legalConsumables: (combatFrame?.activeTurn.legalConsumables || [])
      .filter((item) => item.available !== false)
      .map((item) => item.name)
      .filter(Boolean),
    selectedTargetId: combatFrame?.activeTurn.selectedTargetId ?? null,
    battleBudgetRemaining: combatFrame?.activeTurn.battleBudgetRemaining ?? null,
    source: combatFrame?.captureMeta.source ?? null,
  };
}

function getSyncIssues(firebaseState: FirebaseBattleState | undefined, domActionState: DomActionState): string[] {
  const issues: string[] = [];
  if (!firebaseState) return issues;

  if (domActionState.activeHeroSlot == null) {
    issues.push('DOM action state could not identify the active hero slot.');
  }

  if (domActionState.legalActions.length === 0) {
    issues.push('No legal actions were captured from the command panel.');
  }

  if (domActionState.legalActions.length === 1 && domActionState.legalActions[0].toLowerCase() === 'menu') {
    issues.push('DOM action capture only found the menu button, so recommendations are blocked.');
  }

  return issues;
}

function findCombatantByHeroSnapshot(combatFrame: CombatFrame | null, hero: HeroSnapshot) {
  if (!combatFrame) return null;
  return combatFrame.combatants.find((unit) =>
    unit.side === 'player' && (
      unit.slot === hero.slot ||
      normalizeLookupKey(unit.name) === normalizeLookupKey(hero.mainClass) ||
      normalizeLookupKey(unit.name) === normalizeLookupKey(hero.heroId)
    )
  ) || null;
}

function findCombatantByEnemySnapshot(combatFrame: CombatFrame | null, enemy: EnemySnapshot) {
  if (!combatFrame) return null;
  const displayName = formatEnemyDisplayName(enemy.enemyId);
  return combatFrame.combatants.find((unit) =>
    unit.side === 'enemy' && (
      normalizeLookupKey(unit.name) === normalizeLookupKey(displayName) ||
      normalizeLookupKey(unit.normalizedId) === normalizeLookupKey(enemy.enemyId)
    )
  ) || null;
}

function findCombatantByActorLabel(
  combatFrame: CombatFrame | null,
  actorLabel: string,
  actorSide: string,
) {
  if (!combatFrame) return null;
  const normalizedActor = normalizeLookupKey(actorLabel);
  const desiredSide = actorSide === 'hero' || actorSide === 'player' ? 'player' : actorSide === 'enemy' ? 'enemy' : null;
  return combatFrame.combatants.find((unit) => {
    if (desiredSide && unit.side !== desiredSide) return false;
    return (
      normalizeLookupKey(unit.name) === normalizedActor ||
      normalizeLookupKey(unit.normalizedId) === normalizedActor ||
      normalizeLookupKey(unit.unitId) === normalizedActor
    );
  }) || null;
}

function HpBar({ current, max, label, color }: { current: number; max: number; label: string; color: string }) {
  const pct = max > 0 ? Math.round((current / max) * 100) : 0;
  const barColor = pct > 60 ? 'bg-green-500' : pct > 30 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className="space-y-0.5" data-testid={`hp-bar-${label}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
        <span className="text-[10px] font-mono text-muted-foreground">{current}/{max}</span>
      </div>
      <div className="h-2 rounded-full bg-muted/40 overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-300 ${color || barColor}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function StatusBadges({ statuses }: { statuses: StatusInstance[] | undefined }) {
  if (!statuses || statuses.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {statuses.map((status) => (
        <Badge key={`${status.category}-${status.id}-${status.stacks ?? 'na'}-${status.durationTurns ?? 'na'}`} variant="secondary" className="text-[9px] inline-flex items-center gap-1">
          <CombatAssetChip kind="status" name={status.name} imageUrl={status.iconUrl} size="xs" />
          {formatCombatName(status.name)}
          {status.stacks ? ` x${status.stacks}` : ''}
          {status.durationTurns ? ` ${status.durationTurns}t` : ''}
        </Badge>
      ))}
    </div>
  );
}

function parseUnitIdParts(unitId: string | null | undefined) {
  const raw = String(unitId || '');
  if (!raw) return { side: null, slot: null, key: null };
  const [side, slot, ...rest] = raw.split(':');
  return {
    side: side || null,
    slot: slot && slot !== 'na' ? Number(slot) : null,
    key: rest.join(':') || null,
  };
}

function formatStatLabel(key: string) {
  return String(key || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function DetailMetricGrid({
  title,
  values,
  emptyLabel,
}: {
  title: string;
  values: Record<string, number | null | undefined>;
  emptyLabel: string;
}) {
  const entries = Object.entries(values || {}).filter(([, value]) => value != null);
  return (
    <div className="rounded-md border border-muted-foreground/10 bg-muted/10 p-3">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <div className="grid grid-cols-2 gap-2 text-xs">
        {entries.map(([key, value]) => (
          <div key={key} className="flex items-center justify-between gap-2 rounded bg-background/40 px-2 py-1">
            <span className="text-muted-foreground">{formatStatLabel(key)}</span>
            <span className="font-mono">{String(value)}</span>
          </div>
        ))}
        {entries.length === 0 && (
          <p className="text-xs text-muted-foreground">{emptyLabel}</p>
        )}
      </div>
    </div>
  );
}

function DetailChipGroup({
  title,
  names,
  kind,
  emptyLabel,
}: {
  title: string;
  names: string[];
  kind?: 'ability' | 'consumable';
  emptyLabel: string;
}) {
  const uniqueNames = [...new Set((names || []).filter(Boolean))];
  return (
    <div>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <div className="flex flex-wrap gap-1">
        {uniqueNames.map((name) => (
          <Badge key={name} variant={kind ? 'secondary' : 'outline'} className="text-[10px] inline-flex items-center gap-1">
            {kind && <CombatAssetChip kind={kind} name={name} size="xs" />}
            {formatCombatName(name)}
          </Badge>
        ))}
        {uniqueNames.length === 0 && <span className="text-xs text-muted-foreground">{emptyLabel}</span>}
      </div>
    </div>
  );
}

function CombatantDetailDialog({
  open,
  onOpenChange,
  combatant,
  heroDetail,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  combatant: CombatFrame['combatants'][number] | null;
  heroDetail: HeroDetailData | null;
}) {
  const isMatchingHeroDetail = combatant && heroDetail && heroDetail.name && normalizeLookupKey(heroDetail.name) === normalizeLookupKey(combatant.name);
  const shownHeroDetail = (combatant?.heroDetail || null) || (isMatchingHeroDetail ? heroDetail : null);
  const shownVitals = shownHeroDetail?.vitals || {};
  const shownBaseStats = shownHeroDetail?.baseStats || {};
  const shownStats = shownHeroDetail?.stats || combatant?.stats || {};
  const shownModifiers = shownHeroDetail?.modifiers || {};
  const shownDynamicScores = shownHeroDetail?.dynamicScores || {};
  const shownResistances = shownHeroDetail?.resistances || combatant?.resistances || {};
  const shownAbilities = shownHeroDetail?.abilities || [];
  const shownPassives = shownHeroDetail?.passives || [];
  const shownTraits = shownHeroDetail?.traits || [];
  const shownItems = shownHeroDetail?.items || combatant?.equipment?.items || [];
  const shownPrimaryArms = shownHeroDetail?.primaryArms || combatant?.equipment?.primaryArms || [];
  const shownSecondaryArms = shownHeroDetail?.secondaryArms || combatant?.equipment?.secondaryArms || [];
  const vitalPairs = [
    ['HP', shownVitals.hp ?? combatant?.currentHp, shownVitals.maxHp ?? combatant?.maxHp],
    ['MP', shownVitals.mp ?? combatant?.currentMp, shownVitals.maxMp ?? combatant?.maxMp],
  ].filter(([, current, max]) => current != null || max != null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            {combatant && (
              <CombatAssetChip
                kind={combatant.side === 'player' ? 'hero' : 'enemy'}
                name={combatant.name}
                secondaryLabel={shownHeroDetail?.heroClass || combatant.heroClass || null}
                imageUrl={shownHeroDetail?.iconUrl || combatant.iconUrl || null}
                size="md"
              />
            )}
            <span>{combatant ? formatCombatName(combatant.name) : 'Combatant details'}</span>
          </DialogTitle>
          <DialogDescription>
            {combatant
              ? isMatchingHeroDetail
                ? 'Captured from the live hunt panel and latest hero detail modal.'
                : 'Captured from the current live combat frame.'
              : 'No combatant selected.'}
          </DialogDescription>
        </DialogHeader>
        {!combatant ? (
          <p className="text-sm text-muted-foreground">No detail available.</p>
        ) : (
          <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr_1fr]">
            <div className="space-y-4 xl:min-w-0">
              <div className="rounded-md border border-muted-foreground/10 bg-muted/10 p-3">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Current Conditions</p>
                  {shownHeroDetail?.level != null && (
                    <Badge variant="outline" className="text-[10px] font-mono">Level {shownHeroDetail.level}</Badge>
                  )}
                </div>
                <div className="space-y-2">
                  {vitalPairs.map(([label, current, max]) => (
                    <HpBar
                      key={String(label)}
                      current={Number(current ?? 0)}
                      max={Number(max ?? current ?? 0)}
                      label={String(label)}
                      color={label === 'HP' ? 'bg-green-500' : 'bg-blue-500'}
                    />
                  ))}
                </div>
                <div className="mt-3">
                  <StatusBadges statuses={combatant.visibleEffects} />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <DetailChipGroup
                  title="Primary Arms"
                  names={shownPrimaryArms}
                  emptyLabel="No captured primary arms."
                />
                <DetailChipGroup
                  title="Secondary Arms"
                  names={shownSecondaryArms}
                  emptyLabel="No captured secondary arms."
                />
              </div>

              <DetailMetricGrid title="Vitals" values={shownStats} emptyLabel="No captured vitals/stats." />
            </div>

            <div className="space-y-4">
              <DetailMetricGrid title="Base Stats" values={shownBaseStats} emptyLabel="No captured base stats." />
              <DetailMetricGrid title="Modifiers" values={shownModifiers} emptyLabel="No captured modifiers." />
              <DetailMetricGrid title="Dynamic Stat Scores" values={shownDynamicScores} emptyLabel="No captured dynamic scores." />
            </div>

            <div className="space-y-4">
              <DetailMetricGrid title="Status Effect Resistance" values={shownResistances} emptyLabel="No captured resistances." />
              <div className="rounded-md border border-muted-foreground/10 bg-muted/10 p-3 space-y-3">
                <DetailChipGroup title="Traits" names={shownTraits} emptyLabel="No captured traits." />
                <DetailChipGroup title="Passives" names={shownPassives} emptyLabel="No captured passives." />
                <DetailChipGroup title="Abilities" names={shownAbilities} kind="ability" emptyLabel="No captured abilities." />
                <DetailChipGroup title="Items" names={shownItems} kind="consumable" emptyLabel="No captured items." />
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function CombatantStatusCard({
  combatant,
  kind,
  isActive,
  onInspect,
}: {
  combatant: {
    name: string;
    iconUrl?: string | null;
    heroClass?: string | null;
    currentHp: number;
    maxHp: number;
    currentMp?: number | null;
    maxMp?: number | null;
    isAlive?: boolean;
    statuses?: StatusInstance[];
  };
  kind: 'hero' | 'enemy';
  isActive?: boolean;
  onInspect?: () => void;
}) {
  const isHero = kind === 'hero';
  return (
    <div
      className={cn(
        'rounded-md border border-muted-foreground/10 p-3 transition-colors',
        isHero ? 'bg-muted/20' : 'bg-muted/10',
        isActive && 'ring-1 ring-emerald-400/50 bg-emerald-500/10',
        combatant.isAlive === false && 'opacity-60',
      )}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <CombatAssetChip kind={kind} name={combatant.name} secondaryLabel={combatant.heroClass || null} imageUrl={combatant.iconUrl || null} size="md" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{formatCombatName(combatant.name)}</p>
            <div className="flex flex-wrap items-center gap-1">
              {isActive && (
                <Badge className="animate-pulse bg-emerald-500 text-[10px] text-black hover:bg-emerald-500">
                  <Activity className="mr-1 h-3 w-3" /> Active Turn
                </Badge>
              )}
              {combatant.isAlive === false && <Badge variant="destructive" className="text-[10px]">KO</Badge>}
            </div>
          </div>
        </div>
        {onInspect && (
          <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={onInspect}>
            <Info className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
      <HpBar current={combatant.currentHp} max={combatant.maxHp} label="HP" color={isHero ? 'bg-green-500' : 'bg-red-500'} />
      {combatant.currentMp != null && combatant.maxMp != null && combatant.maxMp > 0 && (
        <div className="mt-2">
          <HpBar current={combatant.currentMp} max={combatant.maxMp} label="MP" color="bg-blue-500" />
        </div>
      )}
      <StatusBadges statuses={combatant.statuses} />
    </div>
  );
}

function classifyActiveTurnAction(action: CombatFrame['activeTurn']['legalActions'][number]) {
  const lower = String(action.name || '').toLowerCase();
  if (action.group) return action.group;
  if (/^(attack|swap|skip)$/.test(lower)) return 'actions';
  if (/(potion|tonic|philter|frame|stone|elixir|consum)/.test(lower)) return 'items';
  if (/(passive|deathmark|blinding winds|hero frame)/.test(lower)) return 'abilities';
  return 'skills';
}

function ActiveTurnActionGrid({
  title,
  actions,
  kind,
}: {
  title: string;
  actions: Array<{ name: string; iconUrl?: string | null; available: boolean }>;
  kind: 'ability' | 'consumable';
}) {
  if (actions.length === 0) return null;
  return (
    <div className="space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <div className="flex flex-wrap gap-2">
        {actions.map((action) => (
          <button
            key={`${title}-${action.name}`}
            type="button"
            disabled
            className={cn(
              'inline-flex items-center gap-2 rounded-md border px-2 py-1 text-[11px] transition-colors',
              action.available
                ? 'border-muted-foreground/20 bg-muted/20 text-foreground'
                : 'border-muted-foreground/10 bg-muted/10 text-muted-foreground opacity-70',
            )}
          >
            <CombatAssetChip kind={kind} name={action.name} imageUrl={action.iconUrl || null} size="xs" />
            <span>{formatCombatName(action.name)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ActiveTurnPanel({
  combatFrame,
  onInspectCombatant,
}: {
  combatFrame: CombatFrame | null;
  onInspectCombatant: (unitId: string | null) => void;
}) {
  const actions = combatFrame?.activeTurn.legalActions || [];
  const consumables = combatFrame?.activeTurn.legalConsumables || [];
  const activeCombatant = combatFrame?.combatants.find((unit) => unit.unitId === combatFrame.activeTurn.activeUnitId)
    || (combatFrame?.activeTurn.activeUnitId ? null : null);
  const selectedTarget = combatFrame?.combatants.find((unit) => unit.unitId === combatFrame.activeTurn.selectedTargetId) || null;
  const activeLabel = activeCombatant?.name || parseUnitIdParts(combatFrame?.activeTurn.activeUnitId).key || null;
  const groupedActions = {
    actions: actions.filter((action) => classifyActiveTurnAction(action) === 'actions'),
    skills: actions.filter((action) => classifyActiveTurnAction(action) === 'skills'),
    abilities: actions.filter((action) => classifyActiveTurnAction(action) === 'abilities'),
  };
  const groupedItems = [
    ...actions.filter((action) => classifyActiveTurnAction(action) === 'items').map((action) => ({
      name: action.name,
      iconUrl: action.iconUrl || null,
      available: action.available,
    })),
    ...consumables.map((item) => ({
      name: item.name,
      iconUrl: item.iconUrl || null,
      available: item.available,
    })),
  ];
  return (
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Active Turn</p>
            {combatFrame?.activeTurn.activeSide === 'player' && (
              <Badge className="animate-pulse bg-emerald-500 text-[10px] text-black hover:bg-emerald-500">
                <Activity className="mr-1 h-3 w-3" /> Your Turn
              </Badge>
            )}
          </div>
          {!combatFrame ? (
            <p className="text-xs text-muted-foreground text-center py-4">Waiting for combat frame...</p>
          ) : (
            <>
              <div className={cn(
                'rounded-md border p-3 space-y-3',
                combatFrame.activeTurn.activeSide === 'player'
                  ? 'border-emerald-400/40 bg-emerald-500/10'
                  : 'border-muted-foreground/10 bg-muted/10',
              )}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <CombatAssetChip
                      kind={activeCombatant?.side === 'enemy' ? 'enemy' : 'hero'}
                      name={activeCombatant?.name || activeLabel || 'Unknown'}
                      secondaryLabel={activeCombatant?.heroClass || null}
                      imageUrl={activeCombatant?.iconUrl || null}
                      size="md"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{formatCombatName(activeCombatant?.name || activeLabel || 'Unknown')}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {combatFrame.activeTurn.activeSide === 'player' ? 'Player action window' : 'Observed from live DOM'}
                      </p>
                    </div>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 shrink-0"
                    onClick={() => onInspectCombatant(combatFrame.activeTurn.activeUnitId)}
                  >
                    <Info className="h-4 w-4" />
                  </Button>
                </div>
                {activeCombatant && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <HpBar current={activeCombatant.currentHp} max={activeCombatant.maxHp} label="HP" color="bg-green-500" />
                      {activeCombatant.currentMp != null && activeCombatant.maxMp != null && activeCombatant.maxMp > 0 && (
                        <HpBar current={activeCombatant.currentMp} max={activeCombatant.maxMp} label="MP" color="bg-blue-500" />
                      )}
                    </div>
                    <div className="space-y-2">
                      <div className="text-[11px]">Budget: <span className="font-mono">{combatFrame.activeTurn.battleBudgetRemaining ?? 'n/a'}</span></div>
                      <div className="text-[11px]">Source: <span className="font-mono">{combatFrame.captureMeta.source}</span></div>
                    </div>
                  </div>
                )}
                <div className="space-y-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">FX</p>
                  {activeCombatant?.visibleEffects?.length ? (
                    <StatusBadges statuses={activeCombatant.visibleEffects} />
                  ) : (
                    <p className="text-xs text-muted-foreground">No visible effects</p>
                  )}
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <ActiveTurnActionGrid title="Actions" actions={groupedActions.actions} kind="ability" />
                  <ActiveTurnActionGrid title="Skills" actions={groupedActions.skills} kind="ability" />
                  <ActiveTurnActionGrid title="Abilities" actions={groupedActions.abilities} kind="ability" />
                  <ActiveTurnActionGrid title="Items" actions={groupedItems} kind="consumable" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="col-span-2">
                  Selected:
                  <span className="ml-1 inline-flex items-center gap-1">
                    {selectedTarget ? (
                      <>
                        <CombatAssetChip kind={selectedTarget.side === 'enemy' ? 'enemy' : 'hero'} name={selectedTarget.name} secondaryLabel={selectedTarget.heroClass || null} imageUrl={selectedTarget.iconUrl || null} size="xs" />
                        <span>{formatCombatName(selectedTarget.name)}</span>
                      </>
                    ) : (
                      <span className="font-mono">None</span>
                    )}
                  </span>
                </div>
              </div>
              {actions.length === 0 && groupedItems.length === 0 && (
                <p className="text-xs text-muted-foreground">No actions parsed from the command panel.</p>
              )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function TurnOrderPanel({ combatFrame }: { combatFrame: CombatFrame | null }) {
  const rows = combatFrame?.turnOrder || [];
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Turn Order</p>
        <div className="space-y-1 max-h-[220px] overflow-y-auto">
          {rows.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">Turn-order modal has not been captured yet.</p>}
          {rows.map((row) => (
            <div key={`${row.unitId}-${row.ordinal}`} className="flex items-center justify-between gap-2 text-[11px] p-2 rounded bg-muted/20">
              <div className="flex items-center gap-2 min-w-0">
                <CombatAssetChip
                  kind={row.side === 'player' ? 'hero' : 'enemy'}
                  name={row.name}
                  secondaryLabel={combatFrame?.combatants.find((unit) => unit.unitId === row.unitId)?.heroClass || null}
                  imageUrl={combatFrame?.combatants.find((unit) => unit.unitId === row.unitId)?.iconUrl || null}
                  size="xs"
                />
                <span className={cn('truncate', row.side === 'player' ? 'text-blue-400' : 'text-red-400')}>{formatCombatName(row.name)}</span>
              </div>
              <span className="font-mono">{row.ticksUntilTurn ?? 'n/a'}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ReconciliationPanel({ combatFrame, firebaseData }: { combatFrame: CombatFrame | null; firebaseData: any }) {
  const framePlayers = combatFrame?.combatants.filter((c) => c.side === 'player') || [];
  const firebasePlayers = Object.values(firebaseData?.latestCombatants?.['1'] || {}) as FirebaseUnit[];
  const mismatches = framePlayers.map((player, index) => {
    const firebaseUnit = firebasePlayers[index];
    if (!firebaseUnit) return null;
    const hpMismatch = player.currentHp !== null && firebaseUnit.hp !== null && player.currentHp !== firebaseUnit.hp;
    const mpMismatch = player.currentMp !== null && firebaseUnit.mp !== null && player.currentMp !== firebaseUnit.mp;
    if (!hpMismatch && !mpMismatch) return null;
    return { name: player.name, hp: [player.currentHp, firebaseUnit.hp], mp: [player.currentMp, firebaseUnit.mp] };
  }).filter(Boolean) as Array<{ name: string; hp: [number | null, number | null]; mp: [number | null, number | null] }>;

  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">Reconciliation</p>
        {!combatFrame ? (
          <p className="text-xs text-muted-foreground text-center py-4">No combat frame yet.</p>
        ) : mismatches.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">No HP/MP drift detected against loaded Firebase state.</p>
        ) : (
          <div className="space-y-2">
            {mismatches.map((mismatch) => (
              <div key={mismatch.name} className="rounded bg-amber-500/10 p-2 text-[11px]">
                <div className="font-medium">{mismatch.name}</div>
                <div className="text-muted-foreground">HP extension/firebase: {mismatch.hp[0] ?? 'n/a'} / {mismatch.hp[1] ?? 'n/a'}</div>
                <div className="text-muted-foreground">MP extension/firebase: {mismatch.mp[0] ?? 'n/a'} / {mismatch.mp[1] ?? 'n/a'}</div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EnemyIntelligencePanel({
  prediction,
  isLoading,
  predictedEnemy,
}: {
  prediction: EnemyPrediction | null;
  isLoading: boolean;
  predictedEnemy: PredictedEnemyContext;
}) {
  const [showPolicyBreakdown, setShowPolicyBreakdown] = useState(false);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3 flex items-center gap-1">
            <Brain className="w-3.5 h-3.5" /> Enemy Intelligence
          </p>
          <div className="flex items-center justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground/40" />
            <span className="text-xs text-muted-foreground ml-2">Analyzing enemy behavior...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!prediction || prediction.legalActions.length === 0) {
    return (
      <Card>
        <CardContent className="p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3 flex items-center gap-1">
            <Brain className="w-3.5 h-3.5" /> Enemy Intelligence
          </p>
          <p className="text-xs text-muted-foreground text-center py-4" data-testid="text-no-intel">Not enough data for enemy prediction</p>
        </CardContent>
      </Card>
    );
  }

  const sortedActions = Object.entries(prediction.finalPolicy).sort((a, b) => b[1] - a[1]);
  const topAction = sortedActions[0];
  const confidenceColor = prediction.confidence > 0.7 ? 'text-green-500' : prediction.confidence > 0.4 ? 'text-amber-500' : 'text-red-400';
  const targetStatuses = predictedEnemy.enemy?.statuses || [];
  const amnesiaStatuses = targetStatuses.filter((status) => /amnesia/i.test(status.name));

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
            <Brain className="w-3.5 h-3.5" /> Enemy Intelligence
          </p>
          <div className="flex items-center gap-1.5">
            <Badge variant="outline" className="text-[10px] font-mono" data-testid="badge-confidence">
              <TrendingUp className="w-3 h-3 mr-0.5" />
              {Math.round(prediction.confidence * 100)}%
            </Badge>
            <Badge variant="secondary" className="text-[10px]" data-testid="badge-sample-count">
              {prediction.sampleCount} samples
            </Badge>
          </div>
        </div>

        {predictedEnemy.displayName && (
          <div className="p-3 rounded-md bg-muted/10 border border-muted-foreground/10 mb-3" data-testid="prediction-target-enemy">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {predictedEnemy.source === 'turn_order' ? 'Next Acting Enemy' : 'Prediction Target'}
                </p>
                <div className="flex items-center gap-2">
                  <CombatAssetChip kind="enemy" name={predictedEnemy.displayName} imageUrl={predictedEnemy.enemy?.iconUrl || null} size="md" />
                  <p className="text-sm font-semibold">{formatCombatName(predictedEnemy.displayName)}</p>
                </div>
              </div>
              {predictedEnemy.ticksUntilTurn !== null && (
                <Badge variant="outline" className="text-[10px] font-mono">
                  {predictedEnemy.ticksUntilTurn.toFixed(3)} ticks
                </Badge>
              )}
            </div>
            {targetStatuses.length > 0 && <StatusBadges statuses={targetStatuses} />}
            {amnesiaStatuses.length > 0 && (
              <p className="text-[10px] text-amber-300 mt-1">
                Amnesia effects: {amnesiaStatuses.map((status) => status.name).join(', ')}
              </p>
            )}
            {predictedEnemy.source !== 'turn_order' && (
              <p className="text-[10px] text-muted-foreground mt-1">
                Turn-order modal has not been captured yet, so this uses the first living enemy as the prediction target.
              </p>
            )}
          </div>
        )}

        {topAction && (
          <div className="p-3 rounded-md bg-muted/20 border border-muted-foreground/10 mb-3" data-testid="prediction-top-action">
            <div className="flex items-center gap-2 mb-1">
              <CombatAssetChip kind="ability" name={topAction[0]} size="sm" />
              <span className="text-sm font-semibold">{formatCombatName(topAction[0])}</span>
              <span className={`text-xs font-mono ${confidenceColor}`}>
                {Math.round(topAction[1] * 100)}%
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground">Most likely next enemy action</p>
          </div>
        )}

        <div className="mb-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Ability Availability</p>
          <div className="flex flex-wrap gap-1" data-testid="ability-availability-grid">
            {(prediction.availability || []).map((a) => (
              <Badge
                key={a.name}
                variant={a.available ? 'default' : 'secondary'}
                className="text-[9px] inline-flex items-center gap-1"
                data-testid={`ability-${a.name.replace(/\s+/g, '-').toLowerCase()}`}
              >
                <CombatAssetChip kind="ability" name={a.name} size="xs" />
                {a.available ? <Unlock className="w-2.5 h-2.5 mr-0.5" /> : <Lock className="w-2.5 h-2.5 mr-0.5" />}
                {formatCombatName(a.name)}
              </Badge>
            ))}
          </div>
        </div>

        <Button
          size="sm"
          variant="ghost"
          onClick={() => setShowPolicyBreakdown(!showPolicyBreakdown)}
          data-testid="button-policy-breakdown"
        >
          {showPolicyBreakdown ? <ChevronUp className="w-3.5 h-3.5 mr-1" /> : <ChevronDown className="w-3.5 h-3.5 mr-1" />}
          Policy Breakdown
        </Button>

        {showPolicyBreakdown && (
          <div className="mt-2 space-y-2 pt-2 border-t border-muted-foreground/10" data-testid="policy-breakdown">
            <div className="grid grid-cols-3 gap-1 text-[10px] font-mono text-muted-foreground">
              <span className="font-semibold">Action</span>
              <span className="font-semibold">Heuristic</span>
              <span className="font-semibold">Final</span>
            </div>
            {sortedActions.map(([action, prob]) => (
              <div key={action} className="grid grid-cols-3 gap-1 text-[10px] font-mono">
                <span className="truncate">{action}</span>
                <span>{Math.round((prediction.heuristicPriors[action] || 0) * 100)}%</span>
                <span>{Math.round(prob * 100)}%</span>
              </div>
            ))}
          </div>
        )}

        {prediction.reasoning.length > 0 && (
          <div className="mt-3 space-y-1" data-testid="prediction-reasoning">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Reasoning</p>
            {prediction.reasoning.map((r, i) => (
              <p key={i} className="text-[10px] text-muted-foreground">• {r}</p>
            ))}
          </div>
        )}

        {prediction.simulation && prediction.simulation.rankedCandidates.length > 0 && (
          <div className="mt-3 pt-3 border-t border-muted-foreground/10" data-testid="simulation-results">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                <Activity className="w-3 h-3" /> Monte Carlo Simulation
              </p>
              <div className="flex items-center gap-1">
                <Badge variant="outline" className="text-[9px] font-mono" data-testid="badge-sim-count">
                  {prediction.simulation.totalSimulations} sims
                </Badge>
                {prediction.simulation.degraded && (
                  <Badge variant="secondary" className="text-[9px]" data-testid="badge-sim-degraded">
                    <AlertTriangle className="w-2.5 h-2.5 mr-0.5" /> degraded
                  </Badge>
                )}
              </div>
            </div>
            <div className="space-y-1.5">
              {prediction.simulation.rankedCandidates.map((c, i) => (
                <div key={c.action} className="flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono p-1.5 rounded-md bg-muted/10" data-testid={`sim-candidate-${i}`}>
                  <div className="flex items-center gap-1.5">
                    <span className="text-muted-foreground w-3">{i + 1}.</span>
                    <span className="font-semibold">{c.action}</span>
                    {c.fallbackMode && <Badge variant="secondary" className="text-[8px] no-default-hover-elevate no-default-active-elevate">fallback</Badge>}
                  </div>
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <span title="Composite Score">score: {c.compositeScore.toFixed(3)}</span>
                    <span title="Survival">surv: {Math.round(c.survivalProbability * 100)}%</span>
                    {c.budgetCost > 0 && <span title="Budget Cost">-{c.budgetCost}g</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ConsumableStrategyPanel({ prediction, battleBudget }: {
  prediction: EnemyPrediction | null;
  battleBudget: number | null;
}) {
  if (!prediction) {
    return (
      <Card>
        <CardContent className="p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3 flex items-center gap-1">
            <FlaskConical className="w-3.5 h-3.5" /> Consumable Strategy
          </p>
          <p className="text-xs text-muted-foreground text-center py-4" data-testid="text-no-consumable-data">Waiting for battle data...</p>
        </CardContent>
      </Card>
    );
  }

  const consumables = prediction.consumableOptions || [];

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
            <FlaskConical className="w-3.5 h-3.5" /> Consumable Strategy
          </p>
          {battleBudget !== null && (
            <Badge variant="outline" className="text-[10px] font-mono" data-testid="badge-budget">
              Budget: {battleBudget}
            </Badge>
          )}
        </div>

        {consumables.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-2">No consumable data available</p>
        ) : (
          <div className="space-y-2" data-testid="consumable-list">
            {consumables.map((c) => (
              <div key={c.name} className="flex flex-wrap items-center justify-between gap-2 p-2 rounded-md bg-muted/20 border border-muted-foreground/10">
                <div className="flex items-center gap-2">
                  <CombatAssetChip kind="consumable" name={c.name} size="sm" />
                  <span className="text-xs font-medium">{formatCombatName(c.name)}</span>
                  <Badge variant="secondary" className="text-[9px]">Cost: {c.cost}</Badge>
                </div>
                <Badge variant={c.available ? 'default' : 'secondary'} className="text-[9px]">
                  {c.available ? 'Available' : 'Unavailable'}
                </Badge>
              </div>
            ))}
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge
            variant={prediction.confidence > 0.5 ? 'default' : 'secondary'}
            className="text-[9px]"
            data-testid="badge-sim-confidence"
          >
            Sim Confidence: {Math.round(prediction.confidence * 100)}%
          </Badge>
          {prediction.safetyCheck && !prediction.safetyCheck.canAutoExecute && prediction.safetyCheck.blockReasons.length > 0 && (
            <Badge variant="secondary" className="text-[9px]" data-testid="badge-safety-block">
              <AlertTriangle className="w-2.5 h-2.5 mr-0.5" />
              {prediction.safetyCheck.blockReasons[0]}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ExecutionModeSelector({ mode, onChange }: { mode: ExecutionModeType; onChange: (m: ExecutionModeType) => void }) {
  const modes: { value: ExecutionModeType; label: string; icon: typeof Eye }[] = [
    { value: 'observe_only', label: 'Observe', icon: Eye },
    { value: 'recommend_and_confirm', label: 'Recommend', icon: Brain },
    { value: 'auto_execute', label: 'Auto', icon: Play },
  ];

  return (
    <div className="flex items-center gap-1" data-testid="execution-mode-selector">
      {modes.map((m) => (
        <Button
          key={m.value}
          size="sm"
          variant={mode === m.value ? 'default' : 'ghost'}
          onClick={() => onChange(m.value)}
          data-testid={`button-mode-${m.value}`}
        >
          <m.icon className="w-3.5 h-3.5 mr-1" />
          {m.label}
        </Button>
      ))}
    </div>
  );
}

function RecommendationCard({ rec, onExplain, isExplaining, explanation }: {
  rec: Recommendation;
  onExplain: () => void;
  isExplaining: boolean;
  explanation: string | null;
}) {
  const [showDetail, setShowDetail] = useState(false);
  const scoreColor = rec.totalScore > 0.6 ? 'text-green-500' : rec.totalScore > 0.3 ? 'text-amber-500' : 'text-muted-foreground';

  return (
    <div
      className="p-3 rounded-md bg-muted/20 border border-muted-foreground/10 space-y-2"
      data-testid={`recommendation-${rec.rank}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={rec.rank === 1 ? 'default' : 'outline'} className="text-[10px] font-mono">
          #{rec.rank}
        </Badge>
        <span className="font-medium text-sm">{rec.action}</span>
        <span className={`text-xs font-mono ml-auto ${scoreColor}`}>
          {(rec.totalScore * 100).toFixed(0)}pts
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {rec.damageEv > 0 && (
          <Badge variant="secondary" className="text-[10px]">
            <Swords className="w-3 h-3 mr-0.5" />
            {rec.damageEv} dmg
          </Badge>
        )}
        {rec.killChance > 0 && (
          <Badge variant={rec.killChance >= 0.5 ? 'default' : 'secondary'} className="text-[10px]">
            <Skull className="w-3 h-3 mr-0.5" />
            {Math.round(rec.killChance * 100)}% kill
          </Badge>
        )}
        {rec.debuffValue > 0 && (
          <Badge variant="secondary" className="text-[10px]">
            <Target className="w-3 h-3 mr-0.5" />
            CC {(rec.debuffValue * 100).toFixed(0)}%
          </Badge>
        )}
      </div>

      <p className="text-xs text-muted-foreground">{rec.reasoning}</p>

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setShowDetail(!showDetail)}
          data-testid={`button-detail-${rec.rank}`}
        >
          {showDetail ? <ChevronUp className="w-3.5 h-3.5 mr-1" /> : <ChevronDown className="w-3.5 h-3.5 mr-1" />}
          Details
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={onExplain}
          disabled={isExplaining}
          data-testid={`button-explain-${rec.rank}`}
        >
          {isExplaining ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Bot className="w-3.5 h-3.5 mr-1" />}
          Explain
        </Button>
      </div>

      {showDetail && (
        <div className="grid grid-cols-2 gap-1 text-[10px] text-muted-foreground pt-1 border-t border-muted-foreground/10">
          <span>Damage EV: {rec.damageEv}</span>
          <span>Kill Chance: {Math.round(rec.killChance * 100)}%</span>
          <span>Survival Delta: {rec.survivalDelta}</span>
          <span>Debuff Value: {rec.debuffValue}</span>
          <span>Mana Efficiency: {rec.manaEfficiency}</span>
          <span>Total Score: {rec.totalScore}</span>
        </div>
      )}

      {explanation && (
        <div className="p-2 rounded bg-muted/30 border border-muted-foreground/10" data-testid={`explanation-${rec.rank}`}>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1">
            <Sparkles className="w-3 h-3" /> AI Explanation
          </p>
          <p className="text-xs leading-relaxed whitespace-pre-wrap">{explanation}</p>
        </div>
      )}
    </div>
  );
}

export default function HuntCompanion() {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<SessionData | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(() => {
    if (typeof window === 'undefined') return null;
    const stored = window.localStorage.getItem('pve-companion-selected-session-id');
    if (!stored) return null;
    const parsed = Number(stored);
    return Number.isFinite(parsed) ? parsed : null;
  });
  const [copied, setCopied] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [battleState, setBattleState] = useState<BattleStateMsg | null>(null);
  const [combatFrame, setCombatFrame] = useState<CombatFrame | null>(null);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [turnFeed, setTurnFeed] = useState<TurnEvent[]>([]);
  const [explanations, setExplanations] = useState<Record<number, string>>({});
  const [enemyPrediction, setEnemyPrediction] = useState<EnemyPrediction | null>(null);
  const [executionMode, setExecutionMode] = useState<ExecutionModeType>('observe_only');
  const [battleBudget, setBattleBudget] = useState<number | null>(null);
  const [latestHuntId, setLatestHuntId] = useState<string | null>(null);
  const [showBattleLog, setShowBattleLog] = useState(false);
  const [turnCount, setTurnCount] = useState(0);
  const [inspectedCombatantId, setInspectedCombatantId] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const turnFeedRef = useRef<HTMLDivElement>(null);

  const sessionListQuery = useQuery<CompanionSessionListResponse>({
    queryKey: ['/api/user/pve/companion/sessions'],
    refetchInterval: 5000,
    queryFn: async () => {
      const resp = await fetch('/api/user/pve/companion/sessions');
      if (!resp.ok) throw new Error('Failed to load companion sessions');
      return resp.json();
    },
  });

  const createSessionMutation = useMutation({
    mutationFn: async (label?: string) => {
      const resp = await fetch('/api/user/pve/companion/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: label || null }),
      });
      if (!resp.ok) throw new Error('Failed to create session');
      return resp.json();
    },
    onSuccess: (data) => {
      if (data.ok && data.session) {
        setSelectedSessionId(data.session.id);
        queryClient.invalidateQueries({ queryKey: ['/api/user/pve/companion/sessions'] });
      }
    },
  });

  const archiveSessionMutation = useMutation({
    mutationFn: async (sessionId: number) => {
      const resp = await fetch(`/api/user/pve/companion/sessions/${sessionId}/archive`, { method: 'POST' });
      if (!resp.ok) throw new Error('Failed to archive session');
      return resp.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['/api/user/pve/companion/sessions'] });
      if (selectedSessionId === session?.id) {
        setSelectedSessionId(null);
      }
    },
  });

  const sessionStatusQuery = useQuery<CompanionSessionDetailResponse>({
    queryKey: ['/api/user/pve/companion/sessions', selectedSessionId],
    enabled: !!selectedSessionId && !sessionListQuery.isLoading,
    refetchInterval: 5000,
    queryFn: async () => {
      const resp = await fetch(`/api/user/pve/companion/sessions/${selectedSessionId}`);
      if (!resp.ok) throw new Error('Failed');
      return resp.json();
    },
  });

  const firebaseLogQuery = useQuery<FirebaseBattleState>({
    queryKey: ['/api/admin/pve/firebase-hunt-log', latestHuntId],
    enabled: !!latestHuntId,
    refetchInterval: (query) => {
      const data = query.state.data as FirebaseBattleState | undefined;
      return data?.meta?.hasWinner === false ? 5000 : false;
    },
    queryFn: async () => {
      const resp = await fetch(`/api/admin/pve/firebase-hunt-log?huntRef=${latestHuntId}`);
      if (!resp.ok) throw new Error('Failed to fetch battle log');
      return resp.json();
    },
  });

  const explainMutation = useMutation({
    mutationFn: async ({ rec, recIndex }: { rec: Recommendation; recIndex: number }) => {
      const resp = await apiRequest('POST', '/api/admin/pve/companion/explain', {
        recommendation: rec,
        battleState,
        enemyId: battleState?.enemies?.[0]?.enemyId || null,
      });
      const data = await resp.json();
      return { explanation: data.explanation, recIndex };
    },
    onSuccess: (data) => {
      setExplanations(prev => ({ ...prev, [data.recIndex]: data.explanation }));
    },
  });

  const predictMutation = useMutation({
    mutationFn: async () => {
      const primaryEnemy = getPredictedEnemyContext(battleState, combatFrame).enemy;
      if (!primaryEnemy) return null;
      const enemyId = primaryEnemy.enemyId || '';
      const enemyType = enemyId.toLowerCase().replace(/\s+/g, '_');
      const encounterType = enemyType.includes('boar') ? 'boar_hunt' : 'bad_motherclucker';
      const heroes = battleState?.heroes || [];
      const hero0 = heroes[0];
      const liveState = {
        enemyHp: primaryEnemy.currentHp,
        enemyMaxHp: primaryEnemy.maxHp,
        enemyMp: primaryEnemy.currentMp ?? null,
        enemyMaxMp: primaryEnemy.maxMp ?? null,
        enemyHpPct: primaryEnemy.maxHp > 0 ? primaryEnemy.currentHp / primaryEnemy.maxHp : 1.0,
        heroHp: hero0?.currentHp ?? null,
        heroMaxHp: hero0?.maxHp ?? null,
        heroMp: hero0?.currentMp ?? null,
        heroMaxMp: hero0?.maxMp ?? null,
        heroHpPct: hero0 && hero0.maxHp > 0 ? hero0.currentHp / hero0.maxHp : 1.0,
        heroes: heroes.map((h) => ({
          name: h.heroId || `Hero-${h.slot}`,
          currentHp: h.currentHp,
          maxHp: h.maxHp,
          currentMp: h.currentMp,
          maxMp: h.maxMp,
          buffs: [] as string[],
          debuffs: [] as string[],
          isAlive: h.isAlive,
        })),
        turnNumber: battleState?.turnNumber || 1,
        activeBuffs: [] as string[],
        activeDebuffs: (primaryEnemy.statuses || []).map((status) => status.name).filter(Boolean),
        battleBudgetRemaining: battleBudget,
      };
      const resp = await apiRequest('POST', '/api/dfk/predict-enemy-action', {
        encounterType,
        enemyName: enemyId,
        enemyType,
        executionMode,
        liveState,
      });
      const json = await resp.json();
      if (json?.budget !== undefined) {
        setBattleBudget(json.budget);
      }
      return json;
    },
    onSuccess: (data) => {
      if (data?.ok) {
        setEnemyPrediction(data as EnemyPrediction);
      }
    },
  });

  const connectWs = useCallback(() => {
    if (!session?.session_token || wsRef.current) return;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/companion`);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'join', sessionToken: session.session_token }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'joined') {
          setWsConnected(true);
        } else if (msg.type === 'hunt_id_update') {
          if (msg.huntId) setLatestHuntId(msg.huntId);
        } else if (msg.type === 'recommendation') {
          setRecommendations(msg.recommendations || []);
          if (msg.combatFrame) setCombatFrame(msg.combatFrame);
        } else if (msg.type === 'state_update') {
          if (msg.heroes && !firebaseLogQuery.data) {
            setBattleState(prev => {
              if (!prev) {
                return {
                  turnNumber: 0,
                  activeHeroSlot: 0,
                  heroes: msg.heroes,
                  enemies: msg.enemies || [],
                };
              }
              return {
                ...prev,
                heroes: msg.heroes || prev.heroes,
                enemies: msg.enemies || prev.enemies,
              };
            });
          }
          if (msg.combatFrame) setCombatFrame(msg.combatFrame);
        } else if (msg.type === 'turn_state') {
          if (msg.battleState && !firebaseLogQuery.data) setBattleState(msg.battleState);
          if (msg.combatFrame) setCombatFrame(msg.combatFrame);
        } else if (msg.type === 'turn_update') {
          if (!firebaseLogQuery.data) {
            setTurnFeed(prev => [...prev.slice(-9), { turnNumber: msg.turnNumber, actorSide: msg.actorSide, actorSlot: msg.actorSlot, skillId: msg.skillId, actor: msg.actor || null, ability: msg.ability || null, effects: msg.effects }]);
          }
          if (msg.combatFrame) setCombatFrame(msg.combatFrame);
        } else if (msg.type === 'error') {
          console.error('[WS] Error:', msg.message);
        }
      } catch (e) {
        console.error('[WS] Parse error:', e);
      }
    };

    ws.onclose = () => {
      setWsConnected(false);
      wsRef.current = null;
    };

    ws.onerror = () => {
      setWsConnected(false);
      wsRef.current = null;
    };
  }, [session?.session_token, firebaseLogQuery.data]);

  useEffect(() => {
    const sessions: SessionData[] = sessionListQuery.data?.sessions || [];
    if (sessions.length === 0) {
      setSession(null);
      return;
    }

    const nextSelected = sessions.find((candidate) => candidate.id === selectedSessionId && !candidate.archived_at)
      || sessions.find((candidate) => !candidate.archived_at)
      || sessions[0];

    if (!nextSelected) return;
    if (nextSelected.id !== selectedSessionId) {
      setSelectedSessionId(nextSelected.id);
      return;
    }
    setSession((prev) => (prev?.id === nextSelected.id ? { ...prev, ...nextSelected } : nextSelected));
  }, [sessionListQuery.data, selectedSessionId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (selectedSessionId) {
      window.localStorage.setItem('pve-companion-selected-session-id', String(selectedSessionId));
    } else {
      window.localStorage.removeItem('pve-companion-selected-session-id');
    }
  }, [selectedSessionId]);

  useEffect(() => {
    setWsConnected(false);
    setLatestHuntId(session?.hunt_id || session?.latest_hunt_id || null);
    setBattleState(null);
    setCombatFrame(null);
    setRecommendations([]);
    setTurnFeed([]);
    setEnemyPrediction(null);
    setTurnCount(0);
    setShowBattleLog(false);
  }, [selectedSessionId]);

  useEffect(() => {
    if (session?.session_token && !wsRef.current) {
      connectWs();
    }
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [session?.session_token, connectWs]);

  useEffect(() => {
    const data = sessionStatusQuery.data;
    if (!data) return;
    if (data.session) {
      setSession((prev) => {
        if (
          prev?.id === data.session.id &&
          prev?.status === data.session.status &&
          prev?.hunt_id === data.session.hunt_id &&
          prev?.latest_hunt_id === data.session.latest_hunt_id &&
          prev?.last_seen_at === data.session.last_seen_at &&
          prev?.connected_clients === data.session.connected_clients
        ) {
          return prev;
        }
        return data.session;
      });
    }

    const serverTurnCount = data.turnEvents?.length ?? 0;
    if (!firebaseLogQuery.data && serverTurnCount > 0) {
      const nextTurnFeed = data.turnEvents.slice(-10).reverse();
      setTurnFeed((prev) => (areTurnFeedsEqual(prev, nextTurnFeed) ? prev : nextTurnFeed));
    }
    if (!firebaseLogQuery.data) {
      setTurnCount((prev) => (prev === serverTurnCount ? prev : serverTurnCount));
    }

    if (data.latestHuntId) {
      setLatestHuntId((prev) => (prev === data.latestHuntId ? prev : data.latestHuntId));
    }

    if (data.heroStates && !firebaseLogQuery.data) {
      const rawStates = data.heroStates as HeroStateRaw[];
      const heroes: HeroSnapshot[] = rawStates.map((h, i) => ({
        slot: h.slot ?? i,
        heroId: h.heroId || String(i),
        mainClass: h.mainClass || '?',
        level: h.level || 0,
        currentHp: h.currentHp ?? h.hp ?? 0,
        maxHp: h.maxHp ?? 0,
        currentMp: h.currentMp ?? h.mp ?? 0,
        maxMp: h.maxMp ?? 0,
        isAlive: (h.currentHp ?? h.hp ?? 0) > 0,
      }));
      const enemyId = data.enemyId || null;
      setBattleState((prev) => {
        const heroesNeedSeeding = !prev ||
          prev.heroes.length === 0 ||
          prev.heroes.every(h => h.currentHp === 0 && h.maxHp > 0);
        if (!heroesNeedSeeding) return prev;
        return {
          turnNumber: prev?.turnNumber ?? serverTurnCount,
          activeHeroSlot: prev?.activeHeroSlot ?? 0,
          heroes,
          enemies: prev?.enemies?.length ? prev.enemies : (enemyId ? [{ enemyId, currentHp: 0, maxHp: 0, debuffs: [] }] : []),
        };
      });
    }
    if (data.combatFrame) {
      setCombatFrame((prev) => {
        const prevCapturedAt = prev?.captureMeta?.capturedAt ?? null;
        const nextCapturedAt = data.combatFrame?.captureMeta?.capturedAt ?? null;
        if (prevCapturedAt === nextCapturedAt && prev?.turnNumber === data.combatFrame?.turnNumber) {
          return prev;
        }
        return data.combatFrame;
      });
    }
  }, [sessionStatusQuery.data, firebaseLogQuery.data]);

  useEffect(() => {
    if (!firebaseLogQuery.data) return;
    const firebaseBattleView = buildFirebaseBattleView(firebaseLogQuery.data, combatFrame);
    if (firebaseBattleView) {
      setBattleState((prev) => (areBattleStatesEqual(prev, firebaseBattleView) ? prev : firebaseBattleView));
      const nextTurnCount = firebaseLogQuery.data.totalTurns || firebaseBattleView.turnNumber || 0;
      setTurnCount((prev) => (prev === nextTurnCount ? prev : nextTurnCount));
      const nextTurnFeed = buildFirebaseTurnFeed(firebaseLogQuery.data);
      setTurnFeed((prev) => (areTurnFeedsEqual(prev, nextTurnFeed) ? prev : nextTurnFeed));
    }
  }, [firebaseLogQuery.data]);

  useEffect(() => {
    if (!firebaseLogQuery.data || !combatFrame) return;
    setBattleState((prev) => {
      if (!prev) return prev;
      const nextActiveHeroSlot = combatFrame.activeTurn.activeSlot ?? prev.activeHeroSlot;
      if (prev.activeHeroSlot === nextActiveHeroSlot && prev.combatFrame === combatFrame) {
        return prev;
      }
      return {
        ...prev,
        activeHeroSlot: nextActiveHeroSlot,
        combatFrame,
      };
    });
  }, [firebaseLogQuery.data, combatFrame]);

  const domActionState = buildDomActionState(combatFrame);
  const syncIssues = getSyncIssues(firebaseLogQuery.data, domActionState);
  const predictedEnemyContext = getPredictedEnemyContext(battleState, combatFrame);
  const enemyPredictionReady = !!firebaseLogQuery.data &&
    !!battleState?.enemies?.length;
  const recommendationReady = enemyPredictionReady &&
    syncIssues.length === 0 &&
    !!battleState?.enemies?.length;
  const inspectedCombatant = combatFrame?.combatants.find((unit) => unit.unitId === inspectedCombatantId) || null;

  useEffect(() => {
    if (domActionState.battleBudgetRemaining != null) {
      setBattleBudget(domActionState.battleBudgetRemaining);
    }
  }, [domActionState.battleBudgetRemaining]);

  useEffect(() => {
    if (!enemyPredictionReady) {
      setEnemyPrediction(null);
      return;
    }
    predictMutation.mutate();
  }, [enemyPredictionReady, battleState?.turnNumber, battleState?.enemies?.length, executionMode, predictedEnemyContext.displayName]);

  useEffect(() => {
    if (!recommendationReady) {
      setRecommendations([]);
      return;
    }
  }, [recommendationReady]);

  const copyToken = () => {
    if (session?.session_token) {
      navigator.clipboard.writeText(session.session_token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const hasLiveData = battleState !== null;

  return (
    <>
    <div className="p-4 md:p-6 max-w-[1400px] mx-auto" data-testid="hunt-companion-page">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-2">
          <Radio className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-bold">Hunt Companion</h1>
          {wsConnected && (
            <Badge variant="default" className="text-[10px]">
              <Wifi className="w-3 h-3 mr-1" /> LIVE
            </Badge>
          )}
          {firebaseLogQuery.data?.meta?.hasWinner === false && (
            <Badge variant="outline" className="text-[10px]">
              <Activity className="w-3 h-3 mr-1" /> Firebase
            </Badge>
          )}
        </div>
      </div>

      <Card className="mb-4">
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Owned Sessions</p>
              <p className="text-sm text-muted-foreground">
                Refreshing the page restores the selected session instead of minting a new token.
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => createSessionMutation.mutate()}
              disabled={createSessionMutation.isPending}
              data-testid="button-create-owned-session"
            >
              {createSessionMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Radio className="w-4 h-4 mr-2" />}
              Create Session
            </Button>
          </div>

          {sessionListQuery.isLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading companion sessions...
            </div>
          )}

          {sessionListQuery.isError && (
            <div className="flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
              <AlertTriangle className="w-4 h-4" />
              Unable to load owned companion sessions for this account.
            </div>
          )}

          {Array.isArray(sessionListQuery.data?.sessions) && sessionListQuery.data.sessions.length > 0 && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              {sessionListQuery.data.sessions.map((candidate: SessionData) => (
                <div
                  key={candidate.id}
                  className={`rounded-lg border p-3 space-y-2 ${candidate.id === session?.id ? 'border-primary bg-primary/5' : 'border-border bg-card'}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{candidate.label || candidate.hunt_id || `Session #${candidate.id}`}</p>
                      <p className="text-xs text-muted-foreground font-mono truncate">
                        {candidate.session_token}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-1">
                      <Badge variant={candidate.id === session?.id ? 'default' : 'secondary'} className="text-[10px]">
                        {candidate.id === session?.id ? 'Open' : candidate.status}
                      </Badge>
                      {candidate.requires_tab_refresh && (
                        <Badge variant="outline" className="text-[10px] text-amber-300 border-amber-500/40">
                          Refresh Tab
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <div>Hunt: {candidate.hunt_id || candidate.latest_hunt_id || '--'}</div>
                    <div>Clients: {candidate.connected_clients ?? 0}</div>
                    <div>Seen: {candidate.last_seen_at ? new Date(candidate.last_seen_at).toLocaleString() : 'n/a'}</div>
                    <div>Status: {candidate.status}</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant={candidate.id === session?.id ? 'secondary' : 'outline'}
                      onClick={() => setSelectedSessionId(candidate.id)}
                      data-testid={`button-open-session-${candidate.id}`}
                    >
                      {candidate.id === session?.id ? 'Selected' : 'Open'}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        navigator.clipboard.writeText(candidate.session_token);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      }}
                      data-testid={`button-copy-session-token-${candidate.id}`}
                    >
                      {copied && candidate.id === session?.id ? <Check className="w-3.5 h-3.5 mr-1 text-green-500" /> : <Copy className="w-3.5 h-3.5 mr-1" />}
                      Copy Token
                    </Button>
                    {!candidate.archived_at && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => archiveSessionMutation.mutate(candidate.id)}
                        disabled={archiveSessionMutation.isPending}
                        data-testid={`button-archive-session-${candidate.id}`}
                      >
                        Archive
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {!session && (
        <Card>
          <CardContent className="py-16 text-center">
            <Radio className="w-12 h-12 mx-auto mb-4 text-muted-foreground/30" />
            <p className="text-muted-foreground mb-4">
              Create or reopen an owned companion session to receive live battle recommendations during PVE hunts.
            </p>
            <Button
              onClick={() => createSessionMutation.mutate()}
              disabled={createSessionMutation.isPending}
              data-testid="button-create-session"
            >
              {createSessionMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Radio className="w-4 h-4 mr-2" />
              )}
              Start Companion Session
            </Button>
          </CardContent>
        </Card>
      )}

      {session && !hasLiveData && (
        <div className="space-y-4">
          <Card>
            <CardContent className="p-6">
              <div className="flex flex-wrap items-start gap-4">
                <div className="flex-1 min-w-[240px]">
                  <p className="text-sm font-semibold mb-2 flex items-center gap-2">
                    {wsConnected ? (
                      <><Wifi className="w-4 h-4 text-green-500" /> Connected — Waiting for battle data</>
                    ) : (
                      <><WifiOff className="w-4 h-4 text-muted-foreground" /> Pairing</>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground mb-4">
                    The extension can now log into your account and attach this owned session automatically. The token remains available as a fallback/debug pairing path.
                  </p>

                  <div className="flex items-center gap-2 mb-4">
                    <code className="flex-1 px-3 py-2 rounded-md bg-muted font-mono text-sm select-all" data-testid="text-session-token">
                      {session.session_token}
                    </code>
                    <Button size="icon" variant="outline" onClick={copyToken} data-testid="button-copy-token">
                      {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                    </Button>
                  </div>

                  <div className="space-y-1 text-xs text-muted-foreground">
                    <p>1. Install the DFK Hunt Companion Chrome Extension</p>
                    <p>2. Log into the extension and select this session, or paste the token manually</p>
                    <p>3. Refresh the DFK hunt tab if the extension was just reloaded</p>
                    <p>4. Enter a PVE Hunt battle in DeFi Kingdoms</p>
                  </div>
                </div>

                  <div className="w-full md:w-auto">
                    <div className="p-3 rounded-md bg-muted/30 space-y-1 text-xs">
                      <p className="font-semibold text-muted-foreground uppercase tracking-wide text-[10px]">Session Info</p>
                      <div className="flex items-center gap-1">
                        <span>Status:</span>
                        <Badge variant={wsConnected ? 'default' : 'secondary'} className="text-[10px]">
                          {wsConnected ? 'Connected' : session.status}
                        </Badge>
                      </div>
                      <p className="font-mono text-muted-foreground/60">ID: {session.id}</p>
                      {session.hunt_id && <p>Hunt: {session.hunt_id}</p>}
                      {session.requires_tab_refresh && <p className="text-amber-300">Refresh the DFK hunt tab to reattach capture.</p>}
                    {session.wallet_address && <p className="font-mono">Wallet: {session.wallet_address.slice(0, 6)}...{session.wallet_address.slice(-4)}</p>}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {!wsConnected && (
            <div className="text-center">
              <Button variant="outline" onClick={connectWs} data-testid="button-reconnect">
                <Wifi className="w-4 h-4 mr-2" />
                Reconnect WebSocket
              </Button>
            </div>
          )}
        </div>
      )}

      {session && hasLiveData && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-1 space-y-4">
            {firebaseLogQuery.data && (
              <Card>
                <CardContent className="p-4 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Firebase Battle State</p>
                    <Badge variant={firebaseLogQuery.data.meta?.hasWinner ? 'secondary' : 'default'} className="text-[10px]">
                      {firebaseLogQuery.data.meta?.hasWinner ? 'Finished' : 'Live'}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
                    <div>Hunt: <span className="font-mono">{firebaseLogQuery.data.huntRef}</span></div>
                    <div>Turns: <span className="font-mono">{firebaseLogQuery.data.totalTurns}</span></div>
                    <div>Round: <span className="font-mono">{firebaseLogQuery.data.currentTurn?.round ?? 'n/a'}</span></div>
                    <div>Actor: <span className="font-mono">{firebaseLogQuery.data.currentTurn?.activeSide === 1 ? `Hero ${firebaseLogQuery.data.currentTurn?.activeSlot ?? '?'}` : firebaseLogQuery.data.currentTurn?.activeSide === -1 ? `Enemy ${firebaseLogQuery.data.currentTurn?.activeSlot ?? '?'}` : 'Unknown'}</span></div>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardContent className="p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3 flex items-center gap-1">
                  <Shield className="w-3.5 h-3.5" /> Party Status
                </p>
                <div className="space-y-3">
                  {battleState.heroes.map((hero) => (
                    <CombatantStatusCard
                      key={hero.slot}
                      combatant={{
                        name: hero.mainClass || hero.heroId || `Hero ${hero.slot}`,
                        iconUrl: hero.iconUrl || findCombatantByHeroSnapshot(combatFrame, hero)?.iconUrl || null,
                        heroClass: hero.mainClass || findCombatantByHeroSnapshot(combatFrame, hero)?.heroClass || null,
                        currentHp: hero.currentHp,
                        maxHp: hero.maxHp,
                        currentMp: hero.currentMp,
                        maxMp: hero.maxMp,
                        isAlive: hero.isAlive,
                        statuses: hero.statuses,
                      }}
                      kind="hero"
                      isActive={hero.slot === battleState.activeHeroSlot}
                      onInspect={() => setInspectedCombatantId(findCombatantByHeroSnapshot(combatFrame, hero)?.unitId || null)}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>

            {battleState.enemies.length > 0 && (
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3 flex items-center gap-1">
                    <Skull className="w-3.5 h-3.5" /> Enemy Status
                  </p>
                  <div className="space-y-3">
                    {battleState.enemies.map((enemy, i) => {
                      const matchedEnemy = findCombatantByEnemySnapshot(combatFrame, enemy);
                      return (
                        <CombatantStatusCard
                          key={i}
                          combatant={{
                            name: formatEnemyDisplayName(enemy.enemyId),
                            iconUrl: enemy.iconUrl || matchedEnemy?.iconUrl || null,
                            currentHp: enemy.currentHp,
                            maxHp: enemy.maxHp,
                            currentMp: enemy.currentMp ?? null,
                            maxMp: enemy.maxMp ?? null,
                            isAlive: !enemy.isDead && enemy.currentHp > 0,
                            statuses: enemy.statuses || (enemy.debuffs || []).map((d) => ({ id: d, name: d, category: 'debuff', stacks: null, durationTurns: null })),
                          }}
                          kind="enemy"
                          isActive={matchedEnemy?.unitId != null && combatFrame?.activeTurn.activeUnitId === matchedEnemy.unitId}
                          onInspect={() => setInspectedCombatantId(matchedEnemy?.unitId || null)}
                        />
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardContent className="p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1">
                  <Activity className="w-3.5 h-3.5" /> Turn Feed
                </p>
                <div ref={turnFeedRef} className="space-y-1 max-h-[200px] overflow-y-auto" data-testid="turn-feed">
                  {turnFeed.length === 0 && (
                    <p className="text-xs text-muted-foreground/60 text-center py-4">Waiting for turn data...</p>
                  )}
                  {turnFeed.map((turn, i) => {
                    const actorLabel = turn.actor
                      ? turn.actor
                      : turn.actorSide === 'hero' || turn.actorSide === 'player'
                      ? `Hero ${turn.actorSlot ?? '?'}`
                      : `Enemy ${turn.actorSlot ?? '?'}`;
                    const abilityLabel = turn.ability || turn.skillId;
                    const actorCombatant = findCombatantByActorLabel(combatFrame, actorLabel, turn.actorSide);
                    return (
                      <div key={i} className="flex flex-wrap items-center gap-1.5 text-[10px] p-1 rounded bg-muted/20">
                        <Badge variant="outline" className="text-[9px] font-mono">T{turn.turnNumber}</Badge>
                        <div className="flex items-center gap-1">
                          <CombatAssetChip
                            kind={turn.actorSide === 'hero' || turn.actorSide === 'player' ? 'hero' : 'enemy'}
                            name={actorLabel}
                            secondaryLabel={actorCombatant?.heroClass || null}
                            imageUrl={actorCombatant?.iconUrl || null}
                            size="xs"
                          />
                          <span className={turn.actorSide === 'hero' || turn.actorSide === 'player' ? 'text-blue-400' : 'text-red-400'}>
                            {formatCombatName(actorLabel)}
                          </span>
                        </div>
                        {abilityLabel && (
                          <span className="inline-flex items-center gap-1 text-muted-foreground">
                            <CombatAssetChip kind="ability" name={abilityLabel} size="xs" />
                            {formatCombatName(abilityLabel)}
                          </span>
                        )}
                        {turn.targets?.map((t, j) => (
                          <span key={j} className={t.damage > 0 ? 'text-red-400' : t.damage < 0 ? 'text-green-400' : 'text-muted-foreground'}>
                            {t.damage > 0 ? `-${t.damage}` : t.damage < 0 ? `+${Math.abs(t.damage)}` : '0'}
                          </span>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-2 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <ExecutionModeSelector mode={executionMode} onChange={setExecutionMode} />
              <div className="flex items-center gap-1 flex-wrap">
                {enemyPrediction?.safetyCheck && (
                  <Badge
                    variant={enemyPrediction.safetyCheck.canAutoExecute ? 'default' : 'secondary'}
                    className="text-[9px]"
                    data-testid="badge-safety-status"
                  >
                    {enemyPrediction.safetyCheck.canAutoExecute ? 'Safe' : 'Manual'}
                  </Badge>
                )}
                {enemyPrediction?.executionMode && (
                  <Badge variant="outline" className="text-[9px]" data-testid="badge-effective-mode">
                    {enemyPrediction.executionMode === 'auto_execute' ? 'Auto' :
                     enemyPrediction.executionMode === 'recommend_and_confirm' ? 'Confirm' : 'Observe'}
                  </Badge>
                )}
                {enemyPrediction?.execution?.dispatch && (
                  <Badge variant="outline" className="text-[9px]" data-testid="badge-dispatch-action">
                    {enemyPrediction.execution.dispatch.uiAction.replace(/_/g, ' ')}
                    {enemyPrediction.execution.dispatch.requiresTargetSelection && ' + target'}
                  </Badge>
                )}
                {enemyPrediction?.safetyCheck && enemyPrediction.safetyCheck.blockReasons.length > 0 && (
                  <Badge variant="secondary" className="text-[9px]" data-testid="badge-safety-blocks">
                    <AlertTriangle className="w-2.5 h-2.5 mr-0.5" />
                    {enemyPrediction.safetyCheck.blockReasons.length} block{enemyPrediction.safetyCheck.blockReasons.length > 1 ? 's' : ''}
                  </Badge>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <EnemyIntelligencePanel
                prediction={enemyPredictionReady ? enemyPrediction : null}
                isLoading={enemyPredictionReady && predictMutation.isPending}
                predictedEnemy={predictedEnemyContext}
              />
              <ConsumableStrategyPanel
                prediction={enemyPredictionReady ? enemyPrediction : null}
                battleBudget={battleBudget}
              />
                <ActiveTurnPanel combatFrame={combatFrame} onInspectCombatant={setInspectedCombatantId} />
                <TurnOrderPanel combatFrame={combatFrame} />
              </div>

            {syncIssues.length > 0 && (
              <Card>
                <CardContent className="p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-400 mb-2 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" /> Synchronization Warning
                  </p>
                  <div className="space-y-1 text-xs text-muted-foreground">
                    {syncIssues.map((issue) => (
                      <p key={issue}>{issue}</p>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardContent className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1">
                    <Zap className="w-3.5 h-3.5" /> Recommended Actions
                  </p>
                  <Badge variant="outline" className="text-[10px] font-mono">
                    Turn {battleState.turnNumber}
                  </Badge>
                </div>

                {!recommendationReady && (
                  <div className="py-8 text-center">
                    <AlertTriangle className="w-6 h-6 mx-auto mb-2 text-amber-400/70" />
                    <p className="text-xs text-muted-foreground">Recommendations are blocked until Firebase battle state and DOM action state agree.</p>
                  </div>
                )}

                {recommendationReady && recommendations.length === 0 && (
                  <div className="py-8 text-center">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-muted-foreground/40" />
                    <p className="text-xs text-muted-foreground">Waiting for turn data to generate recommendations...</p>
                  </div>
                )}

                <div className="space-y-3" data-testid="recommendations-list">
                  {recommendationReady && recommendations.slice(0, 3).map((rec) => (
                    <RecommendationCard
                      key={rec.rank}
                      rec={rec}
                      onExplain={() => explainMutation.mutate({ rec, recIndex: rec.rank })}
                      isExplaining={explainMutation.isPending && explainMutation.variables?.recIndex === rec.rank}
                      explanation={explanations[rec.rank] || null}
                    />
                  ))}
                </div>

                {recommendationReady && enemyPrediction && recommendations.length > 0 && (
                  <div className="mt-3 p-2 rounded-md bg-muted/10 border border-muted-foreground/10" data-testid="survival-probability">
                    <div className="flex flex-wrap items-center gap-2 text-[10px]">
                      {enemyPrediction.simulation?.rankedCandidates?.[0] ? (
                        <>
                          <span className="text-muted-foreground">Survival Probability:</span>
                          <span className="font-mono font-semibold">
                            {Math.round(enemyPrediction.simulation.rankedCandidates[0].survivalProbability * 100)}%
                          </span>
                          <span className="text-muted-foreground">|</span>
                          <span className="text-muted-foreground">Kill Probability:</span>
                          <span className="font-mono font-semibold">
                            {Math.round(enemyPrediction.simulation.rankedCandidates[0].killProbability * 100)}%
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="text-muted-foreground">Policy Confidence:</span>
                          <span className="font-mono font-semibold">
                            {Math.round(enemyPrediction.confidence * 100)}%
                          </span>
                        </>
                      )}
                      <span className="text-muted-foreground">|</span>
                      <span className="text-muted-foreground">Predicted Enemy:</span>
                      <span className="font-mono">{Object.entries(enemyPrediction.finalPolicy).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Unknown'}</span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Session Info</p>
                  <Badge variant={wsConnected ? 'default' : 'secondary'} className="text-[10px]">
                    {wsConnected ? <><Wifi className="w-3 h-3 mr-1" /> Connected</> : <><WifiOff className="w-3 h-3 mr-1" /> Disconnected</>}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-muted-foreground">
                  <div>Token: <code className="font-mono text-[10px]">{session.session_token.slice(0, 8)}...</code></div>
                  {session.hunt_id && <div>Hunt: {session.hunt_id}</div>}
                  {session.wallet_address && <div className="font-mono">Wallet: {session.wallet_address.slice(0, 6)}...{session.wallet_address.slice(-4)}</div>}
                  <div>Turns: {turnCount}</div>
                </div>
              </CardContent>
            </Card>

            <ReconciliationPanel combatFrame={combatFrame} firebaseData={firebaseLogQuery.data} />
          </div>
        </div>
      )}

      {session && latestHuntId && (
        <div className="mt-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <button
                  className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1 hover:text-foreground transition-colors"
                  onClick={() => setShowBattleLog(v => !v)}
                  data-testid="button-toggle-battle-log"
                >
                  <ScrollText className="w-3.5 h-3.5" />
                  Firebase Battle Log
                  {showBattleLog ? <ChevronUp className="w-3.5 h-3.5 ml-1" /> : <ChevronDown className="w-3.5 h-3.5 ml-1" />}
                </button>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px] font-mono">{latestHuntId}</Badge>
                  {showBattleLog && firebaseLogQuery.data?.meta && !firebaseLogQuery.data.meta.hasWinner && (
                    <Badge variant="default" className="text-[10px]">
                      <Activity className="w-3 h-3 mr-0.5" /> Live
                    </Badge>
                  )}
                  {showBattleLog && firebaseLogQuery.data?.meta?.hasWinner && (
                    <Badge variant="secondary" className="text-[10px]">Finished</Badge>
                  )}
                  {showBattleLog && (
                    <Button size="icon" variant="ghost" onClick={() => firebaseLogQuery.refetch()} data-testid="button-refresh-battle-log">
                      <RefreshCw className={`w-3.5 h-3.5 ${firebaseLogQuery.isFetching ? 'animate-spin' : ''}`} />
                    </Button>
                  )}
                </div>
              </div>

              {showBattleLog && (
                <>
                  {firebaseLogQuery.isLoading && (
                    <div className="flex items-center justify-center py-6">
                      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground/40 mr-2" />
                      <span className="text-xs text-muted-foreground">Loading battle log from Firebase...</span>
                    </div>
                  )}

                  {firebaseLogQuery.isError && (
                    <p className="text-xs text-red-400 text-center py-4">Failed to load battle log. Check hunt ID format (chainId-huntId).</p>
                  )}

                  {firebaseLogQuery.data?.ok && (
                    <div className="space-y-4">
                      {firebaseLogQuery.data.latestCombatants && (
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-blue-400 mb-2 flex items-center gap-1">
                              <Shield className="w-3 h-3" /> Heroes
                            </p>
                            <div className="space-y-2">
                              {(Object.values(firebaseLogQuery.data.latestCombatants['1'] || {}) as FirebaseUnit[]).map((unit, i) => {
                                const hp = unit.hp;
                                const maxHp = unit.maxHp;
                                const pct = hp !== null && maxHp !== null && maxHp > 0 ? Math.max(0, Math.min(100, (hp / maxHp) * 100)) : null;
                                const barColor = unit.isDead ? 'bg-muted-foreground/40' : pct !== null && pct > 60 ? 'bg-green-500' : pct !== null && pct > 30 ? 'bg-yellow-500' : 'bg-red-500';
                                return (
                                  <div key={i} className={`p-2 rounded-md border space-y-1.5 ${unit.isDead ? 'opacity-50 bg-muted/20' : 'bg-card'}`}>
                                    <div className="flex items-center justify-between gap-1">
                                      <div className="flex items-center gap-1 min-w-0">
                                        {unit.isDead ? <Skull className="w-3 h-3 text-muted-foreground shrink-0" /> : <Shield className="w-3 h-3 text-blue-400 shrink-0" />}
                                        <span className="text-[11px] font-medium truncate">{unit.name}</span>
                                      </div>
                                      {hp !== null && maxHp !== null && <span className="text-[10px] text-muted-foreground shrink-0">{hp}/{maxHp}</span>}
                                    </div>
                                    <div className="h-1.5 rounded-sm bg-muted w-full overflow-hidden">
                                      <div className={`h-full rounded-sm transition-all duration-500 ${barColor}`} style={{ width: pct !== null ? `${pct}%` : '0%' }} />
                                    </div>
                                    {unit.mp !== null && unit.maxMp !== null && unit.maxMp > 0 && (
                                      <div className="h-1 rounded-sm bg-muted w-full overflow-hidden">
                                        <div className="h-full rounded-sm bg-blue-500 transition-all duration-500" style={{ width: `${Math.max(0, Math.min(100, (unit.mp / unit.maxMp) * 100))}%` }} />
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-wide text-red-400 mb-2 flex items-center gap-1">
                              <Swords className="w-3 h-3" /> Enemies
                            </p>
                            <div className="space-y-2">
                              {(Object.values(firebaseLogQuery.data.latestCombatants['-1'] || {}) as FirebaseUnit[]).map((unit, i) => {
                                const hp = unit.hp;
                                const maxHp = unit.maxHp;
                                const pct = hp !== null && maxHp !== null && maxHp > 0 ? Math.max(0, Math.min(100, (hp / maxHp) * 100)) : null;
                                const barColor = unit.isDead ? 'bg-muted-foreground/40' : pct !== null && pct > 60 ? 'bg-green-500' : pct !== null && pct > 30 ? 'bg-yellow-500' : 'bg-red-500';
                                return (
                                  <div key={i} className={`p-2 rounded-md border space-y-1.5 ${unit.isDead ? 'opacity-50 bg-muted/20' : 'bg-card'}`}>
                                    <div className="flex items-center justify-between gap-1">
                                      <div className="flex items-center gap-1 min-w-0">
                                        {unit.isDead ? <Skull className="w-3 h-3 text-muted-foreground shrink-0" /> : <Swords className="w-3 h-3 text-red-400 shrink-0" />}
                                        <span className="text-[11px] font-medium truncate">{unit.name}</span>
                                      </div>
                                      {hp !== null && maxHp !== null && <span className="text-[10px] text-muted-foreground shrink-0">{hp}/{maxHp}</span>}
                                    </div>
                                    <div className="h-1.5 rounded-sm bg-muted w-full overflow-hidden">
                                      <div className={`h-full rounded-sm transition-all duration-500 ${barColor}`} style={{ width: pct !== null ? `${pct}%` : '0%' }} />
                                    </div>
                                    {unit.mp !== null && unit.maxMp !== null && unit.maxMp > 0 && (
                                      <div className="h-1 rounded-sm bg-muted w-full overflow-hidden">
                                        <div className="h-full rounded-sm bg-blue-500 transition-all duration-500" style={{ width: `${Math.max(0, Math.min(100, (unit.mp / unit.maxMp) * 100))}%` }} />
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      )}

                      {firebaseLogQuery.data.turns.length > 0 && (
                        <div>
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                            Turn Log ({firebaseLogQuery.data.totalTurns} turns)
                          </p>
                          <div className="space-y-1 max-h-[300px] overflow-y-auto" data-testid="firebase-turn-log">
                            {(firebaseLogQuery.data.turns as FirebaseTurn[]).slice().reverse().map((turn) => (
                              <div key={turn.turnId} className="flex flex-wrap items-start gap-2 p-1.5 rounded bg-muted/15 text-[10px]">
                                <Badge variant="outline" className="text-[9px] font-mono shrink-0">
                                  R{turn.round} T{turn.turn}
                                </Badge>
                                {turn.activeSide !== null && (
                                  <span className={turn.activeSide === 1 ? 'text-blue-400 shrink-0' : 'text-red-400 shrink-0'}>
                                    {turn.activeSide === 1 ? 'Hero' : 'Enemy'} {turn.activeSlot ?? ''}
                                  </span>
                                )}
                                {turn.actionType && (
                                  <span className="text-muted-foreground shrink-0">{turn.actionType}</span>
                                )}
                                {turn.battleLog && (
                                  <span className="text-foreground/80 flex-1 min-w-0 leading-relaxed">{turn.battleLog}</span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {firebaseLogQuery.data.turns.length === 0 && (
                        <p className="text-xs text-muted-foreground text-center py-4">No turns recorded yet.</p>
                      )}
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </div>
        )}
      </div>
      <CombatantDetailDialog
        open={!!inspectedCombatantId}
        onOpenChange={(open) => {
          if (!open) setInspectedCombatantId(null);
        }}
        combatant={inspectedCombatant}
        heroDetail={combatFrame?.heroDetail || null}
      />
    </>
    );
  }
