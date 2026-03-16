/**
 * Extension Engine — Canonical State Types & Structures
 * Defines CombatState, CombatantState, CandidateAction, RecommendationResult
 * Used throughout the local simulation engine.
 */

/**
 * @typedef {Object} CombatantState
 * @property {number} slot
 * @property {number} position
 * @property {'hero'|'enemy'} side
 * @property {string} name
 * @property {string|null} heroClass
 * @property {number} level
 * @property {number} hp
 * @property {number} maxHp
 * @property {number} mp
 * @property {number} maxMp
 * @property {number} atk
 * @property {number} pDef
 * @property {number} mDef
 * @property {number} pAcc
 * @property {number} mAcc
 * @property {number} eva
 * @property {number} blk
 * @property {number} sblk
 * @property {number} speed
 * @property {number} crit
 * @property {number} critDmg
 * @property {number} pRed
 * @property {number} mRed
 * @property {number} ser
 * @property {number} rec
 * @property {Object} baseStats
 * @property {string[]} buffs
 * @property {string[]} debuffs
 * @property {string[]} abilities
 * @property {Object<string, number>} amnesiaLocks - ability id -> turns remaining
 * @property {boolean} isAlive
 * @property {string|null} enemyId
 */

/**
 * @typedef {Object} CombatState
 * @property {number} turnNumber
 * @property {number|null} activeHeroSlot
 * @property {CombatantState[]} heroes
 * @property {CombatantState[]} enemies
 * @property {string[]} legalActionNames
 * @property {string|null} selectedTarget
 * @property {Object[]} consumables
 * @property {string|null} encounterType
 */

/**
 * @typedef {Object} CandidateAction
 * @property {string} type - 'ability'|'basic_attack'|'consumable'
 * @property {string} id
 * @property {string} name
 * @property {number} manaCost
 * @property {number|null} targetSlot
 * @property {'enemy'|'ally'|'self'} targetType
 * @property {Object|null} abilityData
 * @property {Object|null} consumableData
 */

/**
 * @typedef {Object} RecommendationResult
 * @property {CandidateAction} recommendedAction
 * @property {ScoredAction[]} rankedActions
 * @property {number} confidence
 * @property {number} evMargin
 * @property {string[]} reasoning
 */

/**
 * @typedef {Object} ScoredAction
 * @property {CandidateAction} action
 * @property {number} score
 * @property {number} damageEv
 * @property {number} survivalGain
 * @property {number} utilityScore
 * @property {number} resourceEfficiency
 * @property {string[]} reasoning
 */

function createDefaultCombatant(overrides) {
  return {
    slot: 0,
    position: 1,
    side: 'hero',
    name: 'Unknown',
    heroClass: null,
    level: 1,
    hp: 100,
    maxHp: 100,
    mp: 50,
    maxMp: 50,
    atk: 10,
    pDef: 5,
    mDef: 5,
    pAcc: 80,
    mAcc: 80,
    eva: 5,
    blk: 3,
    sblk: 0,
    speed: 40,
    crit: 5,
    critDmg: 150,
    pRed: 0,
    mRed: 0,
    ser: 0,
    rec: 0,
    baseStats: {},
    buffs: [],
    debuffs: [],
    abilities: [],
    amnesiaLocks: {},
    isAlive: true,
    enemyId: null,
    ...overrides,
  };
}

function createDefaultCombatState(overrides) {
  return {
    turnNumber: 0,
    activeHeroSlot: null,
    heroes: [],
    enemies: [],
    allEnemies: [],
    legalActionNames: [],
    selectedTarget: null,
    consumables: [],
    encounterType: null,
    ...overrides,
  };
}

if (typeof window !== 'undefined') {
  window.__dfkEngineState = { createDefaultCombatant, createDefaultCombatState };
}
