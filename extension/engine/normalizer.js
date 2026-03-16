/**
 * Extension Engine — State Normalizer
 * Converts telemetry snapshots from parsers into canonical CombatState.
 * Uses formation data for initial enemy positions when telemetry is incomplete.
 */

(function () {
  if (typeof window !== 'undefined' && window.__dfkNormalizer) return;

  function normalizeCombatant(raw, side, slot) {
    const state = window.__dfkEngineState;
    const stats = raw.stats || {};
    const baseStats = raw.baseStats || {};

    return state.createDefaultCombatant({
      slot: raw.slot ?? slot,
      position: raw.position ?? (slot + 1),
      side: side,
      name: raw.name || raw.unitName || 'Unknown',
      heroClass: raw.heroClass || raw.class || null,
      level: raw.level || stats.level || 1,
      hp: raw.hp ?? stats.hp ?? 100,
      maxHp: raw.maxHp ?? stats.maxHp ?? 100,
      mp: raw.mp ?? stats.mp ?? 50,
      maxMp: raw.maxMp ?? stats.maxMp ?? 50,
      atk: stats.atk ?? stats.attack ?? 10,
      pDef: stats.pDef ?? 5,
      mDef: stats.mDef ?? 5,
      pAcc: stats.pAcc ?? 80,
      mAcc: stats.mAcc ?? 80,
      eva: stats.eva ?? 5,
      blk: stats.blk ?? 3,
      sblk: stats.sblk ?? 0,
      speed: stats.speed ?? 40,
      crit: stats.csc ?? stats.chc ?? 5,
      critDmg: stats.cdm ?? 150,
      pRed: stats.pRed ?? 0,
      mRed: stats.mRed ?? 0,
      ser: stats.ser ?? 0,
      rec: stats.rec ?? 0,
      baseStats: {
        str: baseStats.str ?? 10,
        dex: baseStats.dex ?? 10,
        agi: baseStats.agi ?? 10,
        int: baseStats.int ?? 10,
        wis: baseStats.wis ?? 10,
        vit: baseStats.vit ?? 10,
        end: baseStats.end ?? 10,
        lck: baseStats.lck ?? 10,
      },
      buffs: raw.buffs || [],
      debuffs: raw.debuffs || [],
      abilities: raw.abilities || [],
      amnesiaLocks: raw.amnesiaLocks || {},
      isAlive: (raw.hp ?? stats.hp ?? 1) > 0,
      enemyId: raw.enemyId || null,
    });
  }

  function parseSlotToIndex(slot) {
    if (typeof slot === 'number') return slot;
    if (typeof slot === 'string') {
      const m = slot.match(/p?(\d+)/i);
      if (m) return parseInt(m[1], 10) - 1;
    }
    return 0;
  }

  function seedEnemiesFromEncounter(enemyNames) {
    const dataLoader = window.__dfkDataLoader;
    if (!dataLoader || !dataLoader.isLoaded()) return null;

    const encounter = dataLoader.findEncounterByEnemyNames(enemyNames);
    if (!encounter) return null;

    const state = window.__dfkEngineState;
    return encounter.formation.map((f, i) => {
      const slotIdx = parseSlotToIndex(f.slot ?? i);
      const bs = f.baseStats || {};
      return state.createDefaultCombatant({
        slot: slotIdx,
        position: f.position ?? (slotIdx + 1),
        side: 'enemy',
        name: f.name || f.displayName || 'Unknown',
        level: f.level || 1,
        hp: bs.hp || 100,
        maxHp: bs.hp || 100,
        mp: bs.mp || 0,
        maxMp: bs.mp || 0,
        atk: bs.atk || 10,
        pDef: bs.pDef || 5,
        mDef: bs.mDef || 5,
        eva: bs.eva || 5,
        blk: bs.blk || 3,
        sblk: bs.sblk || 0,
        speed: bs.speed || 40,
        isAlive: true,
        enemyId: f.enemyId || f.enemyType,
      });
    });
  }

  function mergeEnemyWithFormation(telemetryEnemy, formationEnemy) {
    if (!formationEnemy) return telemetryEnemy;
    return {
      ...formationEnemy,
      ...telemetryEnemy,
      hp: telemetryEnemy.hp ?? formationEnemy.hp,
      maxHp: telemetryEnemy.maxHp ?? formationEnemy.maxHp,
      atk: telemetryEnemy.atk || formationEnemy.atk,
      pDef: telemetryEnemy.pDef || formationEnemy.pDef,
      mDef: telemetryEnemy.mDef || formationEnemy.mDef,
      enemyId: formationEnemy.enemyId || telemetryEnemy.enemyId,
      name: telemetryEnemy.name || formationEnemy.name,
    };
  }

  function normalize(turnSnapshot, unitSnapshots) {
    const state = window.__dfkEngineState;
    if (!state) {
      console.error('[DFK Engine] State module not loaded');
      return null;
    }

    unitSnapshots = unitSnapshots || [];

    const heroes = (turnSnapshot.heroes || []).map((h, i) => {
      const unitSnap = unitSnapshots.find(
        u => u.unitSide === 'player' && (u.unitName === h.name || u.slot === h.slot)
      );
      const merged = unitSnap ? { ...h, stats: unitSnap.stats, baseStats: unitSnap.baseStats, abilities: unitSnap.abilities, buffs: unitSnap.buffs, debuffs: unitSnap.debuffs, level: unitSnap.level } : h;
      return normalizeCombatant(merged, 'hero', i);
    });

    let enemies = (turnSnapshot.enemies || []).map((e, i) =>
      normalizeCombatant(e, 'enemy', i)
    );

    const enemyNames = enemies.map(e => e.name).filter(n => n && n !== 'Unknown');
    if (enemyNames.length > 0) {
      const formationEnemies = seedEnemiesFromEncounter(enemyNames);
      if (formationEnemies) {
        enemies = enemies.map((e, i) => {
          const formMatch = formationEnemies.find(
            f => f.name.toLowerCase() === e.name.toLowerCase() && f.slot === e.slot
          ) || formationEnemies.find(
            f => f.name.toLowerCase() === e.name.toLowerCase()
          );
          return mergeEnemyWithFormation(e, formMatch);
        });

        formationEnemies.forEach(f => {
          if (!enemies.find(e => e.slot === f.slot && e.name.toLowerCase() === f.name.toLowerCase())) {
            enemies.push(f);
          }
        });
      }
    }

    const legalActionNames = (turnSnapshot.legalActions || []).map(a =>
      typeof a === 'string' ? a : a.name
    );

    const encounterType = detectEncounterType(enemyNames);

    const consumables = extractConsumables(turnSnapshot, legalActionNames);

    return state.createDefaultCombatState({
      turnNumber: turnSnapshot.turnNumber || 0,
      activeHeroSlot: turnSnapshot.activeHeroSlot ?? null,
      heroes,
      enemies: enemies.filter(e => e.isAlive),
      legalActionNames,
      selectedTarget: turnSnapshot.selectedTarget || null,
      consumables,
      encounterType,
      allEnemies: [...enemies],
    });
  }

  function extractConsumables(turnSnapshot, legalActionNames) {
    const consumables = [];

    if (turnSnapshot.consumables && turnSnapshot.consumables.length > 0) {
      for (const c of turnSnapshot.consumables) {
        consumables.push({
          id: c.id || c.name,
          name: c.name,
          count: c.count ?? c.quantity ?? 1,
        });
      }
      return consumables;
    }

    if (turnSnapshot.inventory && turnSnapshot.inventory.length > 0) {
      for (const item of turnSnapshot.inventory) {
        if (item.type === 'consumable' || item.usableInCombat) {
          consumables.push({
            id: item.id || item.name,
            name: item.name,
            count: item.count ?? item.quantity ?? 1,
          });
        }
      }
      return consumables;
    }

    const dataLoader = window.__dfkDataLoader;
    if (dataLoader && dataLoader.isLoaded() && legalActionNames.length > 0) {
      for (const actionName of legalActionNames) {
        const consumable = dataLoader.getConsumableByName(actionName);
        if (consumable) {
          consumables.push({
            id: consumable.id,
            name: consumable.name,
            count: 1,
          });
        }
      }
    }

    return consumables;
  }

  function detectEncounterType(enemyNames) {
    const names = enemyNames.map(n => n.toLowerCase());
    if (names.some(n => n.includes('boar'))) return 'boar';
    if (names.some(n => n.includes('rocboc') || n.includes('motherclucker'))) return 'rocboc';
    return null;
  }

  const normalizer = { normalize, normalizeCombatant, seedEnemiesFromEncounter };

  if (typeof window !== 'undefined') {
    window.__dfkNormalizer = normalizer;
  }
})();
