/**
 * Extension Engine — Legal Action Generator
 * Enumerates all legal CandidateAction[] for the active hero.
 * Checks amnesia locks, MP cost, target availability, and silence.
 */

(function () {
  if (typeof window !== 'undefined' && window.__dfkActionGenerator) return;

  function generateActions(combatState) {
    const actions = [];
    const activeSlot = combatState.activeHeroSlot;
    if (activeSlot == null) return actions;

    const hero = combatState.heroes.find(h => h.slot === activeSlot);
    if (!hero || !hero.isAlive) return actions;

    const livingEnemies = combatState.enemies.filter(e => e.isAlive);
    const livingHeroes = combatState.heroes.filter(h => h.isAlive);
    const isSilenced = hero.debuffs.some(d => d.toLowerCase().includes('silence'));

    actions.push(...generateBasicAttackActions(hero, livingEnemies));

    if (!isSilenced) {
      actions.push(...generateAbilityActions(hero, livingEnemies, livingHeroes, combatState));
    }

    actions.push(...generateConsumableActions(hero, livingHeroes, combatState));

    return filterByLegalActionNames(actions, combatState.legalActionNames);
  }

  function generateBasicAttackActions(hero, livingEnemies) {
    const actions = [];
    for (const enemy of livingEnemies) {
      actions.push({
        type: 'basic_attack',
        id: `basic_attack_${enemy.slot}`,
        name: 'Basic Attack',
        manaCost: 0,
        targetSlot: enemy.slot,
        targetType: 'enemy',
        abilityData: null,
        consumableData: null,
      });
    }
    if (livingEnemies.length === 0) {
      actions.push({
        type: 'basic_attack',
        id: 'basic_attack_0',
        name: 'Basic Attack',
        manaCost: 0,
        targetSlot: 0,
        targetType: 'enemy',
        abilityData: null,
        consumableData: null,
      });
    }
    return actions;
  }

  function generateAbilityActions(hero, livingEnemies, livingHeroes, combatState) {
    const actions = [];
    const dataLoader = window.__dfkDataLoader;
    if (!dataLoader || !dataLoader.isLoaded()) return actions;

    let heroAbilities = [];
    if (hero.heroClass) {
      heroAbilities = dataLoader.getActiveAbilitiesByClass(hero.heroClass);
    }

    const legalNames = combatState.legalActionNames.map(n => n.toLowerCase());
    if (heroAbilities.length === 0 && legalNames.length > 0) {
      for (const name of combatState.legalActionNames) {
        if (name.toLowerCase() === 'basic attack') continue;
        const ability = dataLoader.getAbilityByName(name);
        if (ability && ability.type === 'active') {
          heroAbilities.push(ability);
        }
      }
    }

    for (const ability of heroAbilities) {
      if (ability.type !== 'active') continue;

      const amnesiaRemaining = hero.amnesiaLocks[ability.id] || hero.amnesiaLocks[ability.name] || 0;
      if (amnesiaRemaining > 0) continue;

      if (ability.manaCost > 0 && hero.mp < ability.manaCost) continue;

      const targeting = ability.targeting || {};
      const targetType = targeting.targetType || 'enemy';

      if (targetType === 'enemy') {
        for (const enemy of livingEnemies) {
          if (ability.range && typeof ability.range === 'number') {
            if (enemy.position > ability.range) continue;
          }
          actions.push({
            type: 'ability',
            id: `${ability.id}_${enemy.slot}`,
            name: ability.name,
            manaCost: ability.manaCost || 0,
            targetSlot: enemy.slot,
            targetType: 'enemy',
            abilityData: ability,
            consumableData: null,
          });
        }
      } else if (targetType === 'self') {
        actions.push({
          type: 'ability',
          id: ability.id,
          name: ability.name,
          manaCost: ability.manaCost || 0,
          targetSlot: hero.slot,
          targetType: 'self',
          abilityData: ability,
          consumableData: null,
        });
      } else if (targetType === 'ally' || targetType === 'single_ally') {
        for (const ally of livingHeroes) {
          actions.push({
            type: 'ability',
            id: `${ability.id}_${ally.slot}`,
            name: ability.name,
            manaCost: ability.manaCost || 0,
            targetSlot: ally.slot,
            targetType: 'ally',
            abilityData: ability,
            consumableData: null,
          });
        }
      }
    }

    return actions;
  }

  function generateConsumableActions(hero, livingHeroes, combatState) {
    const actions = [];
    const dataLoader = window.__dfkDataLoader;
    if (!dataLoader || !dataLoader.isLoaded()) return actions;

    const consumables = combatState.consumables || [];
    for (const inv of consumables) {
      const consumable = dataLoader.getConsumableById(inv.id) || dataLoader.getConsumableByName(inv.name);
      if (!consumable) continue;
      if (inv.count != null && inv.count <= 0) continue;

      const targeting = consumable.targeting || 'single_ally';
      if (targeting === 'single_ally') {
        for (const ally of livingHeroes) {
          actions.push({
            type: 'consumable',
            id: `${consumable.id}_${ally.slot}`,
            name: consumable.name,
            manaCost: 0,
            targetSlot: ally.slot,
            targetType: 'ally',
            abilityData: null,
            consumableData: consumable,
          });
        }
      } else if (targeting === 'all_party_members') {
        actions.push({
          type: 'consumable',
          id: consumable.id,
          name: consumable.name,
          manaCost: 0,
          targetSlot: null,
          targetType: 'ally',
          abilityData: null,
          consumableData: consumable,
        });
      }
    }

    return actions;
  }

  function filterByLegalActionNames(actions, legalNames) {
    if (!legalNames || legalNames.length === 0) return actions;

    const legalSet = new Set(legalNames.map(n => n.toLowerCase()));

    if (legalSet.size === 0) return actions;

    return actions.filter(a => {
      if (legalSet.has(a.name.toLowerCase())) return true;
      if (a.type === 'basic_attack' && legalSet.has('attack')) return true;
      if (a.type === 'basic_attack' && legalSet.has('basic attack')) return true;
      return false;
    });
  }

  const actionGenerator = { generateActions };

  if (typeof window !== 'undefined') {
    window.__dfkActionGenerator = actionGenerator;
  }
})();
