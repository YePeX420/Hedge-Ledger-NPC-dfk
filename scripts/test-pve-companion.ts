import { readFileSync } from 'fs';
import assert from 'assert';
import { normalizeCombatFrame, buildFallbackEnemyEntry, enrichBattleStateFromCombatFrame, summarizeCombatFrameBattleState } from '../server/pve-combat-frame.ts';
import { buildFirebaseBattleState } from '../server/firebase-hunt-state.ts';
import { buildBattleStateFromTurnEvents, scoreActions } from '../server/pve-scoring-engine.ts';

const fixturePath = new URL('../server/fixtures/pve-companion-53935-762160.json', import.meta.url);
const raw = JSON.parse(readFileSync(fixturePath, 'utf-8'));
const frame = normalizeCombatFrame(raw);

assert.equal(frame.version, 1);
assert.equal(frame.turnNumber, 2);
assert.equal(frame.combatants.length, 2);
assert.equal(frame.activeTurn.legalActions.length, 2);
assert.equal(frame.turnOrder[1]?.ticksUntilTurn, 0.162);
assert.equal(frame.heroDetail?.passives[0], 'Foresight');

const firebaseFallbackState = buildFirebaseBattleState('53935-762160', null, [{
  _id: '1',
  currentTurnCount: 1,
  currentRoundCount: 1,
  activeSide: 1,
  activeSlot: 0,
  beforeDeckStates: {
    '1': {
      '0': {
        baseCombatant: { name: 'Hero One', hp: 100, mp: 50 },
        health: 90,
        mana: 40,
        channelingTrackers: [],
      },
    },
    '-1': {
      '0': {
        baseCombatant: { name: 'Baby Boar', hp: 80, mp: 0 },
        health: 70,
        mana: 0,
        channelingTrackers: [],
      },
    },
  },
}]);

assert.equal(firebaseFallbackState.normalizedCombatants.heroes.length, 1);
assert.equal(firebaseFallbackState.normalizedCombatants.enemies.length, 1);
assert.equal(firebaseFallbackState.latestCombatants?.['1']?.['0']?.hp, 90);
assert.equal(firebaseFallbackState.currentTurn?.turn, 1);
assert.equal(firebaseFallbackState.deckStateSource, 'beforeDeckStates');

const heroStates = [
  {
    heroId: '1',
    slot: 0,
    mainClass: 'Paladin',
    level: 20,
    currentHp: 100,
    maxHp: 100,
    currentMp: 50,
    maxMp: 50,
    stats: { str: 10, dex: 10, agi: 10, int: 10, wis: 10, vit: 10, end: 10, lck: 10 },
    active1: 'Poisoned Blade',
    active2: 'Heal',
    passive1: 'Foresight',
    passive2: null,
    buffs: [],
    debuffs: [],
    isAlive: true,
  },
];

const fallbackEnemy = buildFallbackEnemyEntry('baby_boar', frame);
assert.equal(fallbackEnemy.name, 'Baby Boar 1');
assert.ok(fallbackEnemy.hp >= 500);

const battleState = buildBattleStateFromTurnEvents(heroStates, fallbackEnemy, [], 0, 11, { MinorPotion: 1 });
const enriched = enrichBattleStateFromCombatFrame(battleState, frame, fallbackEnemy);

assert.equal(enriched.heroes[0].currentHp, 1416);
assert.equal(enriched.enemies[0].currentHp, 689);
assert.equal(enriched.battleBudgetRemaining, 11);

const initiativeHistory = [{
  snapshotId: 'turn-snapshot-1',
  capturedAt: Date.now() - 2000,
  turnNumber: 1,
  source: 'runtime_fresh',
  signature: '1|player:0:hero:player:0:1.2:3:0',
  activeTurnUnitId: 'player:0:hero',
  entries: [
    {
      unitId: 'player:0:hero',
      name: 'Hero 1',
      side: 'player',
      slot: 0,
      ticksUntilTurn: 1.2,
      totalTicks: 3,
      turnType: 0,
      ordinal: 0,
      heroId: '1',
      heroClass: 'Paladin',
      level: 20,
      source: 'runtime_fresh',
    },
    {
      unitId: 'enemy:0:baby_boar_1',
      name: 'Baby Boar 1',
      side: 'enemy',
      slot: 0,
      ticksUntilTurn: 2.4,
      totalTicks: 3,
      turnType: 0,
      ordinal: 1,
      source: 'runtime_fresh',
    },
  ],
}];

const initiativeDelta = {
  snapshotId: 'turn-snapshot-2',
  previousSnapshotId: 'turn-snapshot-1',
  capturedAt: Date.now(),
  previousCapturedAt: Date.now() - 2000,
  turnNumber: 2,
  previousTurnNumber: 1,
  source: 'runtime_fresh',
  orderChanged: true,
  activeTurnChanged: false,
  activeTurnBeforeUnitId: 'player:0:hero',
  activeTurnAfterUnitId: 'player:0:hero',
  added: [],
  removed: [],
  changed: [{
    unitId: 'player:0:hero',
    name: 'Hero 1',
    side: 'player',
    slot: 0,
    beforeTicksUntilTurn: 1.2,
    afterTicksUntilTurn: 0.4,
    ticksDelta: -0.8,
    beforeTotalTicks: 3,
    afterTotalTicks: 3,
    totalTicksDelta: 0,
    beforeOrdinal: 0,
    afterOrdinal: 0,
    turnTypeChanged: false,
  }],
  orderBefore: ['player:0:hero', 'enemy:0:baby_boar_1'],
  orderAfter: ['player:0:hero', 'enemy:0:baby_boar_1'],
  signatureBefore: '1|player:0:hero|player:0:hero:player:0:1.2:3:0|enemy:0:baby_boar_1:enemy:0:2.4:3:0',
  signatureAfter: '2|player:0:hero|player:0:hero:player:0:0.4:3:0|enemy:0:baby_boar_1:enemy:0:2.4:3:0',
};

const augmentedFrame = normalizeCombatFrame({
  ...raw,
  turnOrderHistory: initiativeHistory,
  turnOrderDelta: initiativeDelta,
});

const diagnosticFrame = normalizeCombatFrame({
  ...raw,
  turnOrderDiagnostics: {
    snapshotId: 'turn-snapshot-2',
    signature: '2|player:0:hero|player:0:hero:player:0:0.4:3:0|enemy:0:baby_boar_1:enemy:0:2.4:3:0',
    capturedAt: Date.now(),
    turnNumber: 2,
    selectedSource: 'runtime_fresh',
    selectedKind: 'runtime',
    selectedConfidence: 0.98,
    selectedReason: 'runtime extractor returned rows',
    selectedEntries: raw.turnOrder,
    candidates: [
      {
        kind: 'runtime',
        source: 'runtime_fresh',
        transport: null,
        count: raw.turnOrder.length,
        fresh: true,
        ageMs: 120,
        confidence: 0.98,
        reason: 'runtime extractor returned rows',
        matchedFields: ['unitId', 'name', 'side', 'slot', 'ticksUntilTurn'],
        rejectedFields: ['heroId'],
        entries: raw.turnOrder,
      },
      {
        kind: 'network',
        source: 'network_fresh',
        transport: 'websocket',
        count: raw.turnOrder.length,
        fresh: true,
        ageMs: 220,
        confidence: 0.92,
        reason: 'fresh network payload',
        matchedFields: ['unitId', 'name', 'side'],
        rejectedFields: ['heroClass'],
        entries: raw.turnOrder,
      },
      {
        kind: 'strip',
        source: 'strip',
        transport: null,
        count: raw.turnOrder.length,
        fresh: true,
        ageMs: 0,
        confidence: 0.7,
        reason: 'visible turn indicator strip rows',
        matchedFields: ['unitId', 'name'],
        rejectedFields: ['ticksUntilTurn'],
        entries: raw.turnOrder,
      },
      {
        kind: 'modal',
        source: 'modal_text',
        transport: null,
        count: 0,
        fresh: false,
        ageMs: null,
        confidence: 0,
        reason: 'no visible turn order modal rows',
        matchedFields: [],
        rejectedFields: ['unitId'],
        entries: [],
      },
    ],
    rankingReasons: [
      'runtime-first selection',
      'network fallback only applies when runtime data is missing or malformed',
      'strip and modal sources are diagnostics-only',
    ],
    fieldMatches: ['unitId', 'name', 'side', 'slot', 'ticksUntilTurn'],
    fieldRejections: ['heroId'],
    deltaSummary: {
      snapshotId: 'turn-snapshot-2',
      previousSnapshotId: 'turn-snapshot-1',
      capturedAt: Date.now(),
      previousCapturedAt: Date.now() - 2000,
      turnNumber: 2,
      previousTurnNumber: 1,
      orderChanged: true,
      activeTurnChanged: false,
      addedCount: 0,
      removedCount: 0,
      changedCount: 1,
      signatureBefore: 'before',
      signatureAfter: 'after',
    },
    historyCount: 1,
    liveCaptureMode: 'runtime_first',
  },
});

assert.equal(augmentedFrame.turnOrderHistory?.length, 1);
assert.equal(augmentedFrame.turnOrderDelta?.orderChanged, true);
assert.equal(diagnosticFrame.turnOrderDiagnostics?.selectedKind, 'runtime');
assert.equal(diagnosticFrame.turnOrderDiagnostics?.candidates.length, 4);
assert.equal(diagnosticFrame.turnOrderDiagnostics?.deltaSummary?.changedCount, 1);
assert.ok(diagnosticFrame.turnOrderDiagnostics?.fieldMatches.includes('ticksUntilTurn'));

const diagnosticSummary = summarizeCombatFrameBattleState(diagnosticFrame, enriched);
assert.equal(diagnosticSummary.turnOrderDiagnostics?.selectedSource, 'runtime_fresh');
assert.equal(diagnosticSummary.turnOrderDiagnostics?.candidateCount, 4);

const enrichedWithInitiative = enrichBattleStateFromCombatFrame(
  battleState,
  augmentedFrame,
  fallbackEnemy,
);
const recommendations = scoreActions(enrichedWithInitiative);
assert.ok(recommendations.length > 0);
assert.ok(recommendations.some((recommendation) => Math.abs(recommendation.initiativeTempo ?? 0) > 0));
assert.ok(recommendations.some((recommendation) => /tempo/i.test(recommendation.reasoning)));

const turnStateSource = readFileSync(new URL('../extension/parsers/turnState.js', import.meta.url), 'utf-8');
const contentSource = readFileSync(new URL('../extension/content.js', import.meta.url), 'utf-8');
assert.ok(turnStateSource.includes('const ENABLE_TURN_ORDER_AUTO_PRIME = false;'));
assert.ok(turnStateSource.includes('turn_order_diagnostics = turnOrderDiagnostics'));
assert.ok(!turnStateSource.includes('tryAutoPrimeTurnOrder();\n    }\n    updateDiagStatusLine();'));
assert.ok(contentSource.includes('turnOrderDiagnostics: turnState.turnOrderDiagnostics || null'));

console.log('pve-companion test passed');
