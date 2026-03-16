/**
 * Extension Engine — 2-Ply Deterministic Beam
 * Hero action → weighted enemy response → score delta.
 * Uses resolver for EV rather than sampling.
 * Returns ranked RecommendationResult.
 */

(function () {
  if (typeof window !== 'undefined' && window.__dfkBeam) return;

  function simulateHeroAction(action, combatState) {
    const hero = combatState.heroes.find(h => h.slot === combatState.activeHeroSlot);
    if (!hero) return combatState;

    const resolver = window.__dfkResolver;
    if (!resolver) return combatState;

    const newState = deepCloneState(combatState);
    const newHero = newState.heroes.find(h => h.slot === hero.slot);

    if (action.manaCost > 0 && newHero) {
      newHero.mp = Math.max(0, newHero.mp - action.manaCost);
    }

    if (action.abilityData && action.abilityData.amnesia > 0 && newHero) {
      newHero.amnesiaLocks[action.abilityData.id || action.name] = action.abilityData.amnesia;
    }

    if (action.type === 'basic_attack' || (action.abilityData && action.abilityData.damageFormula)) {
      const target = newState.enemies.find(e => e.slot === action.targetSlot && e.isAlive);
      if (target && newHero) {
        const dmgType = action.abilityData && action.abilityData.damageFormula &&
          action.abilityData.damageFormula.includes('SPELL') ? 'magical' : 'physical';
        const result = resolver.resolveFinalDamage(newHero, target, action.abilityData, dmgType);
        target.hp = Math.max(0, target.hp - result.expectedDamage);
        if (target.hp <= 0) {
          target.isAlive = false;
        }
      }
    }

    if (action.abilityData && action.abilityData.healFormula) {
      const target = newState.heroes.find(h => h.slot === action.targetSlot && h.isAlive);
      if (target && newHero) {
        const healAmount = resolver.resolveHealAmount(newHero, target, action.abilityData);
        target.hp = Math.min(target.maxHp, target.hp + healAmount);
      }
    }

    if (action.type === 'consumable' && action.consumableData) {
      applyConsumableEffects(action.consumableData, action.targetSlot, newState);
    }

    return newState;
  }

  function applyConsumableEffects(consumable, targetSlot, state) {
    for (const effect of (consumable.effects || [])) {
      if (effect.type === 'heal_percent_max_hp') {
        const target = state.heroes.find(h => h.slot === targetSlot && h.isAlive);
        if (target) {
          const heal = (effect.valuePct / 100) * target.maxHp;
          target.hp = Math.min(target.maxHp, target.hp + heal);
        }
      } else if (effect.type === 'restore_percent_max_mp') {
        const target = state.heroes.find(h => h.slot === targetSlot && h.isAlive);
        if (target) {
          const restore = (effect.valuePct / 100) * target.maxMp;
          target.mp = Math.min(target.maxMp, target.mp + restore);
        }
      }
    }
  }

  function predictEnemyResponse(combatState) {
    const dataLoader = window.__dfkDataLoader;
    const resolver = window.__dfkResolver;
    if (!dataLoader || !resolver) return null;

    const livingEnemies = combatState.enemies.filter(e => e.isAlive);
    if (livingEnemies.length === 0) return null;

    const responseState = deepCloneState(combatState);
    const heroTargets = responseState.heroes.filter(h => h.isAlive);
    if (heroTargets.length === 0) return responseState;

    for (const enemy of livingEnemies) {
      const policy = dataLoader.getEnemyPolicyById(enemy.enemyId);
      const weights = getEnemyActionWeights(enemy, policy, combatState);

      for (const hero of heroTargets) {
        if (!hero.isAlive) continue;

        let weightedDmgToThisHero = 0;
        for (const [actionName, weight] of Object.entries(weights)) {
          if (weight <= 0) continue;

          const abilityData = dataLoader.getAbilityByName(actionName);
          const dmgType = abilityData && abilityData.damageFormula &&
            abilityData.damageFormula.includes('SPELL') ? 'magical' : 'physical';
          const dmgResult = resolver.resolveFinalDamage(enemy, hero, abilityData, dmgType);

          const targetingWeight = 1 / heroTargets.filter(h => h.isAlive).length;
          weightedDmgToThisHero += weight * dmgResult.expectedDamage * targetingWeight;
        }

        hero.hp = Math.max(0, hero.hp - Math.round(weightedDmgToThisHero));
        if (hero.hp <= 0) hero.isAlive = false;
      }
    }

    return responseState;
  }

  function getEnemyActionWeights(enemy, policy, combatState) {
    const weights = {};

    if (policy && policy.defaultWeights) {
      Object.assign(weights, policy.defaultWeights);

      if (policy.conditionalRules) {
        for (const rule of policy.conditionalRules) {
          if (evaluateCondition(rule.condition, enemy, combatState)) {
            weights[rule.action] = rule.weightOverride;
          }
        }
      }
    } else {
      weights['Basic Attack'] = 1.0;
    }

    const total = Object.values(weights).reduce((s, v) => s + v, 0);
    if (total > 0) {
      for (const k of Object.keys(weights)) {
        weights[k] /= total;
      }
    }

    return weights;
  }

  function evaluateCondition(condition, enemy, combatState) {
    switch (condition) {
      case 'target_hp_below_50': {
        const heroes = combatState.heroes.filter(h => h.isAlive);
        return heroes.some(h => h.hp / Math.max(1, h.maxHp) < 0.5);
      }
      case 'ally_damaged': {
        const allies = combatState.enemies.filter(e => e.isAlive && e.slot !== enemy.slot);
        return allies.some(a => a.hp < a.maxHp);
      }
      case 'ally_damaged_and_big_boar_present': {
        const allies = combatState.enemies.filter(e => e.isAlive);
        return allies.some(a => a.hp < a.maxHp) && allies.some(a => a.name.toLowerCase().includes('mama'));
      }
      case 'allies_alive_gt_1': {
        return combatState.enemies.filter(e => e.isAlive).length > 1;
      }
      case 'heroes_alive_gte_2': {
        return combatState.heroes.filter(h => h.isAlive).length >= 2;
      }
      case 'allies_dead_gt_0': {
        const allE = combatState.allEnemies || combatState.enemies;
        return allE.some(e => !e.isAlive);
      }
      case 'ally_hp_below_60': {
        const allies = combatState.enemies.filter(e => e.isAlive);
        return allies.some(a => a.hp / Math.max(1, a.maxHp) < 0.6);
      }
      case 'hero_channeling':
        return false;
      case 'ally_dead': {
        const allE = combatState.allEnemies || combatState.enemies;
        return allE.some(e => !e.isAlive);
      }
      default:
        return false;
    }
  }

  function evaluateStateScore(state) {
    let score = 0;

    const heroHpTotal = state.heroes.filter(h => h.isAlive).reduce((s, h) => s + h.hp, 0);
    const heroMaxHpTotal = state.heroes.reduce((s, h) => s + h.maxHp, 0);
    const heroHpPct = heroMaxHpTotal > 0 ? heroHpTotal / heroMaxHpTotal : 0;

    const enemyHpTotal = state.enemies.filter(e => e.isAlive).reduce((s, e) => s + e.hp, 0);
    const enemyMaxHpTotal = state.enemies.reduce((s, e) => s + e.maxHp, 0);
    const enemyHpPct = enemyMaxHpTotal > 0 ? enemyHpTotal / enemyMaxHpTotal : 0;

    const heroesAlive = state.heroes.filter(h => h.isAlive).length;
    const enemiesAlive = state.enemies.filter(e => e.isAlive).length;

    score += heroHpPct * 40;
    score += (1 - enemyHpPct) * 35;
    score += heroesAlive * 10;
    score -= enemiesAlive * 5;

    const heroMpTotal = state.heroes.filter(h => h.isAlive).reduce((s, h) => s + h.mp, 0);
    const heroMaxMpTotal = state.heroes.reduce((s, h) => s + h.maxMp, 0);
    if (heroMaxMpTotal > 0) {
      score += (heroMpTotal / heroMaxMpTotal) * 5;
    }

    return score;
  }

  function beam2Ply(combatState) {
    const actionGen = window.__dfkActionGenerator;
    const heuristics = window.__dfkHeuristics;

    if (!actionGen || !heuristics) {
      return createFallbackResult();
    }

    const candidates = actionGen.generateActions(combatState);
    if (candidates.length === 0) {
      return createFallbackResult();
    }

    const prunedCandidates = heuristics.scoreAndPrune(candidates, combatState);

    const baselineScore = evaluateStateScore(combatState);

    const beamResults = prunedCandidates.map(scored => {
      const afterHero = simulateHeroAction(scored.action, combatState);
      const afterEnemy = predictEnemyResponse(afterHero);
      const finalState = afterEnemy || afterHero;
      const finalScore = evaluateStateScore(finalState);
      const scoreDelta = finalScore - baselineScore;

      return {
        action: scored.action,
        score: scored.score + (scoreDelta / 100),
        damageEv: scored.damageEv,
        survivalGain: scored.survivalGain,
        utilityScore: scored.utilityScore,
        resourceEfficiency: scored.resourceEfficiency,
        reasoning: [
          ...scored.reasoning,
          `2-ply score delta: ${scoreDelta > 0 ? '+' : ''}${scoreDelta.toFixed(1)}`,
        ],
      };
    });

    beamResults.sort((a, b) => b.score - a.score);

    const best = beamResults[0];
    const second = beamResults[1];
    const evMargin = second ? best.score - second.score : best.score;
    const confidence = computeConfidence(best, beamResults, combatState);

    return {
      recommendedAction: best.action,
      rankedActions: beamResults.slice(0, 4),
      confidence,
      evMargin: Math.round(evMargin * 1000) / 1000,
      reasoning: generateTopLevelReasoning(best, beamResults, combatState),
    };
  }

  function computeConfidence(best, allResults, combatState) {
    let confidence = 0.5;

    if (allResults.length <= 1) {
      confidence = 0.9;
    } else {
      const second = allResults[1];
      const margin = best.score - second.score;
      if (margin > 0.3) confidence = 0.85;
      else if (margin > 0.1) confidence = 0.7;
      else confidence = 0.5;
    }

    const enemiesAlive = combatState.enemies.filter(e => e.isAlive).length;
    if (enemiesAlive <= 1) confidence = Math.min(1, confidence + 0.1);

    return Math.round(confidence * 100) / 100;
  }

  function generateTopLevelReasoning(best, allResults, combatState) {
    const reasons = [];

    if (best.action.type === 'basic_attack') {
      reasons.push(`Recommend Basic Attack — efficient no-cost damage`);
    } else if (best.action.type === 'ability') {
      reasons.push(`Recommend ${best.action.name} — ${best.damageEv > 0 ? `${best.damageEv} expected damage` : 'tactical advantage'}`);
    } else if (best.action.type === 'consumable') {
      reasons.push(`Recommend ${best.action.name} — ${best.survivalGain > 0 ? 'survival priority' : 'utility'}`);
    }

    if (best.reasoning.length > 0) {
      reasons.push(...best.reasoning.slice(0, 3));
    }

    const heroesLow = combatState.heroes.filter(h => h.isAlive && h.hp / Math.max(1, h.maxHp) < 0.3);
    if (heroesLow.length > 0) {
      reasons.push(`Warning: ${heroesLow.map(h => h.name).join(', ')} critically low HP`);
    }

    return reasons;
  }

  function createFallbackResult() {
    return {
      recommendedAction: {
        type: 'basic_attack',
        id: 'basic_attack_0',
        name: 'Basic Attack',
        manaCost: 0,
        targetSlot: 0,
        targetType: 'enemy',
        abilityData: null,
        consumableData: null,
      },
      rankedActions: [],
      confidence: 0.1,
      evMargin: 0,
      reasoning: ['Insufficient data for recommendation — defaulting to Basic Attack'],
    };
  }

  function deepCloneState(state) {
    return JSON.parse(JSON.stringify(state));
  }

  function getRecommendation(snapshot, unitSnapshots) {
    const normalizer = window.__dfkNormalizer;
    if (!normalizer) {
      console.error('[DFK Engine] Normalizer not loaded');
      return createFallbackResult();
    }

    const combatState = normalizer.normalize(snapshot, unitSnapshots);
    if (!combatState) {
      return createFallbackResult();
    }

    return beam2Ply(combatState);
  }

  const beam = { beam2Ply, getRecommendation, simulateHeroAction, predictEnemyResponse, evaluateStateScore };

  if (typeof window !== 'undefined') {
    window.__dfkBeam = beam;
    window.__dfkGetRecommendation = getRecommendation;
  }
})();
