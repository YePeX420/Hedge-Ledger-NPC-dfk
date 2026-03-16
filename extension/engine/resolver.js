/**
 * Extension Engine — Combat Resolver
 * Centralised resolveHitChance, resolveBlockChance, resolveSpellBlockChance,
 * resolveFinalDamage using analytical expected values (no randomness).
 * Based on dfk-combat-formulas.ts formulas.
 */

(function () {
  if (typeof window !== 'undefined' && window.__dfkResolver) return;

  const STAT_COEFFICIENTS = {
    STR: { A: 0.115, B: -0.020675, C: -0.281925, D: 2.245, E: 24.995, dim: 0.10 },
    DEX: { A: 0.115, B: -0.019425, C: -0.428175, D: 2.370, E: 21.870, dim: 0.10 },
    AGI: { A: 0.115, B: -0.020050, C: -0.312550, D: 2.3075, E: 21.9325, dim: 0.10 },
    VIT: { A: 0.115, B: -0.051925, C: -0.425675, D: 1.995, E: 19.245, dim: 0.10 },
    END: { A: 0.115, B: -0.036300, C: -0.431300, D: 2.120, E: 20.120, dim: 0.10 },
    INT: { A: 0.115, B: -0.003800, C: -0.298800, D: 2.495, E: 24.745, dim: 0.10 },
    WIS: { A: 0.115, B: -0.003800, C: -0.298800, D: 2.495, E: 24.745, dim: 0.10 },
    LCK: { A: 0.115, B: -0.0147375, C: -0.4627375, D: 2.120, E: 19.1325, dim: 0.10 },
  };

  const DOUBLE_STAT_COEFFICIENTS = {
    EVA: {
      stat1: { A: 0.092, B: -0.01604, C: -0.25004, D: 2.3075, E: 21.9325 },
      stat2: { F: 0.023, G: -0.0029475, H: -0.0925475, I: 2.12, J: 19.1325 },
      dim: 0.10
    },
    Block: {
      stat1: { A: 0.092, B: -0.01554, C: -0.34254, D: 2.37, E: 21.87 },
      stat2: { F: 0.023, G: -0.0029475, H: -0.0925475, I: 2.12, J: 19.1325 },
      dim: 0.10
    },
    SpellBlock: {
      stat1: { A: 0.092, B: -0.00304, C: -0.23904, D: 2.495, E: 24.745 },
      stat2: { F: 0.023, G: -0.0029475, H: -0.0925475, I: 2.12, J: 19.1325 },
      dim: 0.10
    },
  };

  function singleStatScore(statVal, avgLevel, coeff) {
    let result = (coeff.A * statVal + coeff.B * avgLevel + coeff.C) / (coeff.D * avgLevel + coeff.E);
    if (result > coeff.dim) {
      result = coeff.dim + (result - coeff.dim) / 3;
    }
    return result;
  }

  function doubleStatScore(stat1Val, stat2Val, avgLevel, coeff) {
    const part1 = (coeff.stat1.A * stat1Val + coeff.stat1.B * avgLevel + coeff.stat1.C) / (coeff.stat1.D * avgLevel + coeff.stat1.E);
    const part2 = (coeff.stat2.F * stat2Val + coeff.stat2.G * avgLevel + coeff.stat2.H) / (coeff.stat2.I * avgLevel + coeff.stat2.J);
    let result = part1 + part2;
    if (result > coeff.dim) {
      result = coeff.dim + (result - coeff.dim) / 3;
    }
    return result;
  }

  function resolveHitChance(attacker, defender, abilityData) {
    const avgLevel = Math.max(1, (attacker.level + defender.level) / 2);
    const bs = attacker.baseStats || {};
    const dbs = defender.baseStats || {};

    const accModPct = abilityData && abilityData.accModifierPct ? abilityData.accModifierPct / 100 : 0;

    const pAccScore = attacker.pAcc > 0
      ? attacker.pAcc / 100
      : singleStatScore(bs.dex || 10, avgLevel, STAT_COEFFICIENTS.DEX) + 0.7;

    const evaScore = doubleStatScore(
      dbs.agi || defender.eva || 10,
      dbs.lck || 10,
      avgLevel,
      DOUBLE_STAT_COEFFICIENTS.EVA
    );

    const hitChance = Math.max(0.05, Math.min(0.95, pAccScore + accModPct - evaScore));
    return hitChance;
  }

  function resolveBlockChance(defender) {
    const avgLevel = Math.max(1, defender.level || 1);
    const dbs = defender.baseStats || {};

    if (dbs.dex || dbs.lck) {
      const blockScore = doubleStatScore(
        dbs.dex || 10,
        dbs.lck || 10,
        avgLevel,
        DOUBLE_STAT_COEFFICIENTS.Block
      );
      return Math.max(0, Math.min(0.75, blockScore));
    }

    const blkPct = defender.blk || 0;
    return Math.max(0, Math.min(0.75, blkPct / 100));
  }

  function resolveSpellBlockChance(defender) {
    const avgLevel = Math.max(1, defender.level || 1);
    const dbs = defender.baseStats || {};

    if (dbs.int || dbs.lck) {
      const sblkScore = doubleStatScore(
        dbs.int || 10,
        dbs.lck || 10,
        avgLevel,
        DOUBLE_STAT_COEFFICIENTS.SpellBlock
      );
      return Math.max(0, Math.min(0.75, sblkScore));
    }

    const sblkPct = defender.sblk || 0;
    return Math.max(0, Math.min(0.75, sblkPct / 100));
  }

  function resolveCritChance(attacker) {
    const avgLevel = Math.max(1, attacker.level || 1);
    const bs = attacker.baseStats || {};

    if (bs.lck) {
      const critScore = singleStatScore(bs.lck, avgLevel, STAT_COEFFICIENTS.LCK);
      return Math.max(0, Math.min(0.50, critScore));
    }

    const critPct = attacker.crit || 5;
    return Math.max(0, Math.min(0.50, critPct / 100));
  }

  function evaluateDamageFormula(formula, attacker) {
    if (!formula) return attacker.atk;
    try {
      const ATTACK = attacker.atk || 10;
      const SPELL = attacker.mAcc || attacker.atk || 10;
      const bs = attacker.baseStats || {};
      const STR = bs.str || 10;
      const DEX = bs.dex || 10;
      const AGI = bs.agi || 10;
      const INT = bs.int || 10;
      const WIS = bs.wis || 10;
      const VIT = bs.vit || 10;
      const END = bs.end || 10;
      const LCK = bs.lck || 10;

      const cleaned = formula
        .replace(/\bATTACK\b/g, ATTACK)
        .replace(/\bSPELL\b/g, SPELL)
        .replace(/\bSTR\b/g, STR)
        .replace(/\bDEX\b/g, DEX)
        .replace(/\bAGI\b/g, AGI)
        .replace(/\bINT\b/g, INT)
        .replace(/\bWIS\b/g, WIS)
        .replace(/\bVIT\b/g, VIT)
        .replace(/\bEND\b/g, END)
        .replace(/\bLCK\b/g, LCK)
        .replace(/ceil\(/g, 'Math.ceil(')
        .replace(/floor\(/g, 'Math.floor(')
        .replace(/%/g, '/100');

      const result = Function('"use strict"; return (' + cleaned + ')')();
      return typeof result === 'number' && isFinite(result) ? result : attacker.atk;
    } catch (e) {
      return attacker.atk;
    }
  }

  function resolveFinalDamage(attacker, defender, abilityData, damageType) {
    const isPhysical = damageType !== 'magical';

    let baseDamage;
    if (abilityData && abilityData.damageFormula) {
      baseDamage = evaluateDamageFormula(abilityData.damageFormula, attacker);
    } else {
      baseDamage = attacker.atk;
    }

    const def = isPhysical ? (defender.pDef || 0) : (defender.mDef || 0);
    const reduction = isPhysical ? (defender.pRed || 0) : (defender.mRed || 0);

    const defMultiplier = Math.max(0.1, 1 - (def / (def + 100)));
    const redMultiplier = Math.max(0.1, 1 - (reduction / 100));

    const hitChance = resolveHitChance(attacker, defender, abilityData);
    const blockChance = isPhysical ? resolveBlockChance(defender) : resolveSpellBlockChance(defender);
    const critChance = resolveCritChance(attacker);
    const critMultiplier = (attacker.critDmg || 150) / 100;

    const rawDmg = baseDamage * defMultiplier * redMultiplier;
    const normalDmg = rawDmg;
    const critDmg = rawDmg * critMultiplier;
    const blockedDmg = rawDmg * 0.25;

    const evDamage = hitChance * (
      blockChance * blockedDmg +
      (1 - blockChance) * (
        critChance * critDmg +
        (1 - critChance) * normalDmg
      )
    );

    return {
      expectedDamage: Math.max(0, Math.round(evDamage)),
      rawDamage: Math.round(rawDmg),
      hitChance,
      blockChance,
      critChance,
      defMultiplier,
      baseDamage: Math.round(baseDamage),
    };
  }

  function resolveHealAmount(healer, target, abilityData) {
    if (!abilityData || !abilityData.healFormula) return 0;
    const baseHeal = evaluateDamageFormula(abilityData.healFormula, healer);
    return Math.max(0, Math.round(baseHeal));
  }

  const resolver = {
    resolveHitChance,
    resolveBlockChance,
    resolveSpellBlockChance,
    resolveCritChance,
    resolveFinalDamage,
    resolveHealAmount,
    evaluateDamageFormula,
    singleStatScore,
    doubleStatScore,
  };

  if (typeof window !== 'undefined') {
    window.__dfkResolver = resolver;
  }
})();
