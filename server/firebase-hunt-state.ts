export interface FirebaseStatusTracker {
  id: string | null;
  name: string | null;
  turnsLeft: number | null;
}

export interface FirebaseCombatantState {
  side: 1 | -1;
  slot: number;
  unitId: string;
  name: string;
  hp: number | null;
  maxHp: number | null;
  mp: number | null;
  maxMp: number | null;
  isDead: boolean;
  statuses: FirebaseStatusTracker[];
}

export interface FirebaseTurnState {
  turnId: string;
  turn: number | null;
  round: number | null;
  activeSide: number | null;
  activeSlot: number | null;
  actionType: string | null;
  battleLog: string | null;
  afterHp: Record<string, Record<string, number | null>> | null;
}

export interface FirebaseBattleMeta {
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
}

export interface FirebaseBattleState {
  huntRef: string;
  meta: FirebaseBattleMeta | null;
  latestCombatants: Record<string, Record<string, any>> | null;
  normalizedCombatants: {
    heroes: FirebaseCombatantState[];
    enemies: FirebaseCombatantState[];
  };
  turns: FirebaseTurnState[];
  currentTurn: FirebaseTurnState | null;
  totalTurns: number;
  lastModified: string | null;
}

function toNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function makeCombatantState(sideKey: string, slotKey: string, unit: any): FirebaseCombatantState {
  const baseCombatant = unit?.baseCombatant || {};
  const side = sideKey === '-1' ? -1 : 1;
  const slot = Number(slotKey);
  const name = baseCombatant.name || baseCombatant.id || `Unit ${slotKey}`;
  const hp = toNumber(unit?.health);
  const maxHp = toNumber(baseCombatant.hp);
  const mp = toNumber(unit?.mana ?? baseCombatant.mp);
  const maxMp = toNumber(baseCombatant.maxMana ?? baseCombatant.maxMp ?? baseCombatant.mp);
  const statuses = Array.isArray(unit?.channelingTrackers)
    ? unit.channelingTrackers.map((tracker: any) => ({
        id: tracker?.channelId || tracker?.id || null,
        name: tracker?.displayName || tracker?.channelId || tracker?.id || null,
        turnsLeft: toNumber(tracker?.turnsRemaining ?? tracker?.duration),
      }))
    : [];

  return {
    side,
    slot,
    unitId: `${side}:${slot}:${String(name).toLowerCase().replace(/\s+/g, '_')}`,
    name,
    hp,
    maxHp,
    mp,
    maxMp,
    isDead: (hp ?? 1) <= 0,
    statuses,
  };
}

function buildLatestCombatants(lastTurnWithState: any) {
  if (!lastTurnWithState?.afterDeckStates) return null;
  const latestCombatants: Record<string, Record<string, any>> = {};
  for (const [side, slots] of Object.entries(lastTurnWithState.afterDeckStates)) {
    latestCombatants[side] = {};
    for (const [slot, unit] of Object.entries((slots as Record<string, any>) || {})) {
      const state = makeCombatantState(side, slot, unit);
      latestCombatants[side][slot] = {
        name: state.name,
        hp: state.hp,
        maxHp: state.maxHp,
        mp: state.mp,
        maxMp: state.maxMp,
        debuffs: state.statuses,
        isDead: state.isDead,
      };
    }
  }
  return latestCombatants;
}

function normalizeCombatants(lastTurnWithState: any) {
  const heroes: FirebaseCombatantState[] = [];
  const enemies: FirebaseCombatantState[] = [];
  if (!lastTurnWithState?.afterDeckStates) {
    return { heroes, enemies };
  }

  for (const [side, slots] of Object.entries(lastTurnWithState.afterDeckStates)) {
    for (const [slot, unit] of Object.entries((slots as Record<string, any>) || {})) {
      const state = makeCombatantState(side, slot, unit);
      if (state.side === 1) heroes.push(state);
      else enemies.push(state);
    }
  }

  heroes.sort((a, b) => a.slot - b.slot);
  enemies.sort((a, b) => a.slot - b.slot);
  return { heroes, enemies };
}

function normalizeTurn(doc: any): FirebaseTurnState {
  return {
    turnId: doc._id,
    turn: toNumber(doc.currentTurnCount),
    round: toNumber(doc.currentRoundCount),
    activeSide: toNumber(doc.activeSide),
    activeSlot: toNumber(doc.activeSlot),
    actionType: doc.attackOutcome?.attackType || null,
    battleLog: doc.attackOutcome?.battleLog || null,
    afterHp: doc.afterDeckStates
      ? Object.fromEntries(
          Object.entries(doc.afterDeckStates).map(([side, slots]) => [
            side,
            Object.fromEntries(
              Object.entries((slots as Record<string, any>) || {}).map(([slot, unit]) => [slot, toNumber((unit as any)?.health)]),
            ),
          ]),
        )
      : null,
  };
}

export function buildFirebaseBattleState(huntRef: string, battleMeta: any, allDocs: any[]): FirebaseBattleState {
  const lastTurnWithState = [...allDocs].reverse().find((doc) => doc.afterDeckStates);
  const latestCombatants = buildLatestCombatants(lastTurnWithState);
  const normalizedCombatants = normalizeCombatants(lastTurnWithState);
  const turns = allDocs.map(normalizeTurn);
  const currentTurn = turns.length > 0 ? turns[turns.length - 1] : null;

  return {
    huntRef,
    meta: battleMeta
      ? {
          hasWinner: battleMeta.hasWinner ?? null,
          winnerSide: toNumber(battleMeta.winnerSide),
          scenarioId: battleMeta.scenarioId ?? null,
          combatType: battleMeta.combatType ?? null,
          turnCount: toNumber(battleMeta.turnCount),
          allTurnCount: toNumber(battleMeta.allTurnCount),
          sessionStatus: toNumber(battleMeta.sessionStatus),
          created: battleMeta.created ?? null,
          modified: battleMeta.modified ?? null,
          chainId: toNumber(battleMeta.chainId),
          playerUids: battleMeta.playerUids ?? null,
        }
      : null,
    latestCombatants,
    normalizedCombatants,
    turns,
    currentTurn,
    totalTurns: allDocs.length,
    lastModified: battleMeta?.modified ?? null,
  };
}
