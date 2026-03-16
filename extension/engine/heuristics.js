/**
 * Extension Engine — Heuristic Scorer & Top-K Pruner
 * Ranks candidates by estimated damage EV, survival gain, utility, and resource efficiency.
 * Weights: damage EV 35%, survival gain 30%, utility 20%, resource efficiency 15%
 */

(function () {
  if (typeof window !== 'undefined' && window.__dfkHeuristics) return;

  const WEIGHTS = {
    damageEv: 0.35,
    survivalGain: 0.30,
    utility: 0.20,
    resourceEfficiency: 0.15,
  };

  const TOP_K = 4;

  function quickScore(action, combatState) {
    const hero = combatState.heroes.find(h => h.slot === combatState.activeHeroSlot);
    if (!hero) return { score: 0, damageEv: 0, survivalGain: 0, utilityScore: 0, resourceEfficiency: 0, reasoning: ['No active hero'] };

    const resolver = window.__dfkResolver;
    if (!resolver) return { score: 0, damageEv: 0, survivalGain: 0, utilityScore: 0, resourceEfficiency: 0, reasoning: ['Resolver not loaded'] };

    const reasoning = [];
    let damageEv = 0;
    let survivalGain = 0;
    let utilityScore = 0;
    let resourceEfficiency = 1.0;

    if (action.type === 'basic_attack' || (action.abilityData && action.abilityData.damageFormula)) {
      const target = combatState.enemies.find(e => e.slot === action.targetSlot && e.isAlive);
      if (target) {
        const dmgType = action.abilityData && action.abilityData.damageFormula &&
          action.abilityData.damageFormula.includes('SPELL') ? 'magical' : 'physical';
        const result = resolver.resolveFinalDamage(hero, target, action.abilityData, dmgType);
        damageEv = result.expectedDamage;

        if (damageEv >= target.hp) {
          damageEv *= 1.5;
          reasoning.push(`Can eliminate ${target.name} (${target.hp} HP remaining)`);
        }

        const targetHpPct = target.hp / Math.max(1, target.maxHp);
        if (targetHpPct < 0.3) {
          damageEv *= 1.2;
          reasoning.push(`${target.name} is low HP (${Math.round(targetHpPct * 100)}%)`);
        }

        reasoning.push(`Expected damage: ${result.expectedDamage} (hit: ${Math.round(result.hitChance * 100)}%)`);
      }
    }

    if (action.abilityData && action.abilityData.healFormula) {
      const target = combatState.heroes.find(h => h.slot === action.targetSlot && h.isAlive);
      if (target) {
        const healAmount = resolver.resolveHealAmount(hero, target, action.abilityData);
        const hpDeficit = target.maxHp - target.hp;
        const effectiveHeal = Math.min(healAmount, hpDeficit);
        survivalGain = effectiveHeal;

        const hpPct = target.hp / Math.max(1, target.maxHp);
        if (hpPct < 0.3) {
          survivalGain *= 2.0;
          reasoning.push(`Critical heal needed for ${target.name} (${Math.round(hpPct * 100)}% HP)`);
        } else if (hpPct < 0.5) {
          survivalGain *= 1.3;
          reasoning.push(`Healing ${target.name} (${Math.round(hpPct * 100)}% HP)`);
        }
      }
    }

    if (action.type === 'consumable') {
      const consumable = action.consumableData;
      if (consumable) {
        const target = combatState.heroes.find(h => h.slot === action.targetSlot && h.isAlive) || hero;
        for (const effect of (consumable.effects || [])) {
          if (effect.type === 'heal_percent_max_hp') {
            const hpDeficit = target.maxHp - target.hp;
            const healAmount = (effect.valuePct / 100) * target.maxHp;
            const effectiveHeal = Math.min(healAmount, hpDeficit);
            survivalGain += effectiveHeal;

            const hpPct = target.hp / Math.max(1, target.maxHp);
            if (hpPct < 0.3) {
              survivalGain *= 2.0;
              reasoning.push(`Emergency heal for ${target.name}`);
            }
          } else if (effect.type === 'restore_percent_max_mp') {
            const mpDeficit = target.maxMp - target.mp;
            const restoreAmount = (effect.valuePct / 100) * target.maxMp;
            resourceEfficiency += Math.min(restoreAmount, mpDeficit) * 0.5;
            reasoning.push(`MP restore for ${target.name}`);
          } else if (effect.type === 'cleanse' || effect.type === 'purify') {
            utilityScore += 30;
            reasoning.push(`Cleanse effect`);
          } else if (effect.type.includes('damage_up') || effect.type.includes('accuracy')) {
            utilityScore += 20;
            reasoning.push(`Buff: ${effect.type}`);
          }
        }
      }
    }

    if (action.abilityData && action.abilityData.effects) {
      for (const effect of action.abilityData.effects) {
        const effectType = (effect.type || '').toLowerCase();
        if (effectType.includes('stun') || effectType.includes('silence') || effectType.includes('daze')) {
          const chance = parseChanceFormula(effect.chanceFormula, hero);
          utilityScore += 40 * chance;
          reasoning.push(`CC effect: ${effect.type} (${Math.round(chance * 100)}% chance)`);
        } else if (effectType.includes('taunt')) {
          utilityScore += 25;
          reasoning.push('Taunt effect');
        } else if (effectType.includes('pdef') || effectType.includes('mdef') || effectType.includes('block')) {
          survivalGain += 15;
          reasoning.push(`Defensive buff: ${effect.type}`);
        } else if (effectType.includes('bleed') || effectType.includes('burn') || effectType.includes('poison')) {
          utilityScore += 15;
          reasoning.push(`DoT: ${effect.type}`);
        }
      }
    }

    if (action.manaCost > 0) {
      const mpPct = hero.mp / Math.max(1, hero.maxMp);
      const costRatio = action.manaCost / Math.max(1, hero.maxMp);
      if (costRatio > 0.3 && mpPct < 0.4) {
        resourceEfficiency *= 0.5;
        reasoning.push(`High MP cost (${action.manaCost}) with low MP (${Math.round(mpPct * 100)}%)`);
      } else if (costRatio < 0.1) {
        resourceEfficiency *= 1.1;
      }
    }

    if (action.type === 'basic_attack') {
      resourceEfficiency *= 1.2;
    }

    const maxDmg = Math.max(1, hero.atk * 2);
    const maxHp = Math.max(1, hero.maxHp);

    const normDamage = Math.min(1, damageEv / maxDmg);
    const normSurvival = Math.min(1, survivalGain / maxHp);
    const normUtility = Math.min(1, utilityScore / 50);
    const normResource = Math.min(1.5, resourceEfficiency);

    const score =
      WEIGHTS.damageEv * normDamage +
      WEIGHTS.survivalGain * normSurvival +
      WEIGHTS.utility * normUtility +
      WEIGHTS.resourceEfficiency * normResource;

    return {
      score,
      damageEv,
      survivalGain,
      utilityScore,
      resourceEfficiency,
      reasoning,
    };
  }

  function parseChanceFormula(formula, hero) {
    if (!formula) return 0.3;
    try {
      const bs = hero.baseStats || {};
      const cleaned = formula
        .replace(/%\s*$/, '/100')
        .replace(/\bSTR\b/g, bs.str || 10)
        .replace(/\bDEX\b/g, bs.dex || 10)
        .replace(/\bAGI\b/g, bs.agi || 10)
        .replace(/\bINT\b/g, bs.int || 10)
        .replace(/\bWIS\b/g, bs.wis || 10)
        .replace(/\bVIT\b/g, bs.vit || 10)
        .replace(/\bEND\b/g, bs.end || 10)
        .replace(/\bLCK\b/g, bs.lck || 10)
        .replace(/%/g, '/100');
      const result = Function('"use strict"; return (' + cleaned + ')')();
      return typeof result === 'number' ? Math.max(0, Math.min(1, result)) : 0.3;
    } catch (e) {
      return 0.3;
    }
  }

  function pruneTopK(scoredActions, k) {
    k = k || TOP_K;
    return scoredActions
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }

  function scoreAndPrune(actions, combatState) {
    const scored = actions.map(action => {
      const result = quickScore(action, combatState);
      return {
        action,
        ...result,
      };
    });
    return pruneTopK(scored, TOP_K);
  }

  const heuristics = { quickScore, pruneTopK, scoreAndPrune, WEIGHTS, TOP_K };

  if (typeof window !== 'undefined') {
    window.__dfkHeuristics = heuristics;
  }
})();
