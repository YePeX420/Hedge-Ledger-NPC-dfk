import { readFileSync } from 'fs';
import assert from 'assert';
import { normalizeCombatFrame, buildFallbackEnemyEntry, enrichBattleStateFromCombatFrame } from '../server/pve-combat-frame.ts';
import { buildBattleStateFromTurnEvents } from '../server/pve-scoring-engine.ts';

const fixturePath = new URL('../server/fixtures/pve-companion-53935-762160.json', import.meta.url);
const raw = JSON.parse(readFileSync(fixturePath, 'utf-8'));
const frame = normalizeCombatFrame(raw);

assert.equal(frame.version, 1);
assert.equal(frame.turnNumber, 2);
assert.equal(frame.combatants.length, 2);
assert.equal(frame.activeTurn.legalActions.length, 2);
assert.equal(frame.turnOrder[1]?.ticksUntilTurn, 0.162);
assert.equal(frame.heroDetail?.passives[0], 'Foresight');

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

console.log('pve-companion test passed');
