import { Router, Request, Response } from 'express';
import { db } from '../db';
import {
  enemyAbilityCatalog,
  enemyActionObservations,
  enemyStateEstimates,
  enemyStateActionExamples,
  combatSessionTurnLogs,
  recommendationOutcomes,
  consumableOutcomeExamples,
  consumableRecommendationSnapshots,
  encounterConfig,
  enemyBehaviorProfiles,
  learnedEnemyPolicyProfiles,
} from '@shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import { extractStateFeatures, buildStateKey } from '../pve-feature-extractor';
import type { EncounterSnapshot, StateFeatures } from '../pve-feature-extractor';
import { getAvailableActions, updateLockoutsAfterAction } from '../pve-availability-engine';
import { getHeuristicPriors } from '../pve-heuristic-priors';
import { getLearnedPolicy, rebuildPolicyProfile } from '../pve-policy-learner';
import { blendPolicies } from '../pve-policy-blender';
import { runMonteCarloSimulation, isSimulationDegraded, getDegradationReasons, type SimulationCandidate } from '../pve-monte-carlo';
import { runSafetyChecks, buildActionExecution, buildTurnLogEntry, executeActionPipeline, type ExecutionMode, type ExecutionContext } from '../pve-execution-controller';
import { buildEncounterSnapshot, buildTelemetryFromRawState, type TelemetryEncounterState } from '../pve-live-state';
import { ENEMY_ABILITY_SEED, ENCOUNTER_CONFIG_SEED, syncEnemyKnowledgeToKB } from '../pve-catalog-seed';

function parseRawStateFeatures(raw: Record<string, unknown>): StateFeatures {
  return {
    schemaVersion: (raw.schemaVersion as number) || 1,
    encounterType: (raw.encounterType as string) || '',
    enemyType: (raw.enemyType as string) || '',
    currentTurn: (raw.currentTurn as number) || 0,
    enemyHpPercent: (raw.enemyHpPercent as number) ?? null,
    enemyMpPercent: (raw.enemyMpPercent as number) ?? null,
    enemyPosition: (raw.enemyPosition as number) ?? null,
    alliesAliveCount: (raw.alliesAliveCount as number) ?? null,
    alliesDeadCount: (raw.alliesDeadCount as number) ?? null,
    enemiesAliveCount: (raw.enemiesAliveCount as number) ?? null,
    targetableEnemyCount: (raw.targetableEnemyCount as number) ?? null,
    currentBuffFlags: (raw.currentBuffFlags as string[]) || [],
    currentDebuffFlags: (raw.currentDebuffFlags as string[]) || [],
    activePassiveFlags: (raw.activePassiveFlags as string[]) || [],
    channelingState: Boolean(raw.channelingState),
    lockoutState: (raw.lockoutState as Record<string, number>) || {},
    availableActions: (raw.availableActions as string[]) || [],
    targetFrontlineCount: (raw.targetFrontlineCount as number) ?? null,
    lowestEnemyHpPercent: (raw.lowestEnemyHpPercent as number) ?? null,
    anyEnemyChanneling: Boolean(raw.anyEnemyChanneling),
    battleBudgetRemaining: (raw.battleBudgetRemaining as number) ?? null,
    consumableAvailabilitySummary: (raw.consumableAvailabilitySummary as Record<string, number>) || {},
  };
}

export const enemyIntelligenceRouter = Router();

enemyIntelligenceRouter.post('/seed-catalog', async (_req: Request, res: Response) => {
  try {
    let abilitiesUpserted = 0;
    for (const ability of ENEMY_ABILITY_SEED) {
      await db.insert(enemyAbilityCatalog).values(ability)
        .onConflictDoUpdate({
          target: [enemyAbilityCatalog.enemyType, enemyAbilityCatalog.abilityName, enemyAbilityCatalog.version],
          set: {
            manaCost: ability.manaCost,
            range: ability.range,
            formulaJson: ability.formulaJson,
            effectsJson: ability.effectsJson,
            passiveFlag: ability.passiveFlag,
            amnesiaTurns: ability.amnesiaTurns,
            specialRulesJson: ability.specialRulesJson,
            confidenceLevel: ability.confidenceLevel,
          },
        });
      abilitiesUpserted++;
    }

    let configsUpserted = 0;
    for (const config of ENCOUNTER_CONFIG_SEED) {
      await db.insert(encounterConfig).values(config)
        .onConflictDoUpdate({
          target: encounterConfig.encounterType,
          set: {
            startingBattleBudget: config.startingBattleBudget,
            consumableCatalogJson: config.consumableCatalogJson,
            version: config.version,
          },
        });
      configsUpserted++;
    }

    const kbSync = await syncEnemyKnowledgeToKB();

    res.json({ ok: true, abilitiesUpserted, configsUpserted, knowledgeBase: kbSync });
  } catch (e: unknown) {
    console.error('[EnemyIntel] Seed error:', e);
    res.status(500).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});

enemyIntelligenceRouter.get('/catalog', async (req: Request, res: Response) => {
  try {
    const enemyType = req.query.enemy_type as string | undefined;
    const conditions = enemyType ? eq(enemyAbilityCatalog.enemyType, enemyType) : undefined;
    const abilities = conditions
      ? await db.select().from(enemyAbilityCatalog).where(conditions)
      : await db.select().from(enemyAbilityCatalog);
    res.json({ ok: true, count: abilities.length, abilities });
  } catch (e: unknown) {
    res.status(500).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});

enemyIntelligenceRouter.get('/encounter-config', async (_req: Request, res: Response) => {
  try {
    const configs = await db.select().from(encounterConfig);
    res.json({ ok: true, configs });
  } catch (e: unknown) {
    res.status(500).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});

enemyIntelligenceRouter.post('/enemy-observation', async (req: Request, res: Response) => {
  try {
    const {
      sessionId, encounterType, huntId, turn,
      enemyName, enemyType, actionName, target,
      observedManaBefore, observedManaAfter,
      lockoutState: rawLockoutState, rawLogText,
      liveState,
    } = req.body;

    if (!sessionId || !encounterType || !enemyName || !enemyType || !actionName || turn === undefined) {
      return res.status(400).json({ ok: false, error: 'Missing required fields' });
    }

    const numSessionId = typeof sessionId === 'number' ? sessionId : parseInt(sessionId, 10);
    if (isNaN(numSessionId)) {
      return res.status(400).json({ ok: false, error: 'sessionId must be numeric' });
    }

    await db.insert(enemyActionObservations).values({
      sessionId: numSessionId,
      encounterType,
      huntId,
      turn,
      enemyName,
      enemyType,
      actionName,
      target,
      observedManaBefore,
      observedManaAfter,
      lockoutStateJson: rawLockoutState || {},
      rawLogText,
    });

    const abilities = await db.select().from(enemyAbilityCatalog)
      .where(eq(enemyAbilityCatalog.enemyType, enemyType));

    const lockoutState = rawLockoutState || {};
    const availability = getAvailableActions(
      abilities, observedManaBefore ?? observedManaAfter, lockoutState, false, 0, false
    );
    const availableActionNames = availability.filter(a => a.available).map(a => a.abilityName);
    const updatedLockouts = updateLockoutsAfterAction(lockoutState, abilities, actionName);

    let stateFeatures = null;
    if (liveState) {
      const telemetry = buildTelemetryFromRawState(liveState);
      if (telemetry) {
        const snapshot = buildEncounterSnapshot(telemetry);
        stateFeatures = extractStateFeatures(snapshot, enemyName, availableActionNames);
      }
    }

    if (stateFeatures) {
      await db.insert(enemyStateActionExamples).values({
        sessionId: numSessionId,
        encounterType,
        huntId,
        turn,
        enemyName,
        enemyType,
        stateFeaturesJson: stateFeatures as unknown as Record<string, unknown>,
        chosenAction: actionName,
        chosenTarget: target,
        availableActionsJson: availableActionNames,
      });
    }

    await db.insert(enemyStateEstimates).values({
      sessionId: numSessionId,
      encounterType,
      huntId,
      turn,
      enemyName,
      currentStateJson: { lockouts: updatedLockouts, mp: observedManaAfter },
      inferredAvailableActionsJson: availableActionNames,
      predictedActionProbsJson: {},
      confidence: stateFeatures ? 0.6 : 0.3,
    });

    await db.insert(combatSessionTurnLogs).values({
      sessionId: numSessionId,
      encounterType,
      turn,
      executionMode: 'observe_only',
      recommendedActionJson: {},
      executedActionJson: { action: actionName, target },
      simulationCount: 0,
      safetyCheckStatus: 'passed',
      safetyChecksPassed: ['observation_logged'],
    });

    res.json({
      ok: true,
      updatedLockouts,
      availableActions: availableActionNames,
      stateFeatures: stateFeatures ? buildStateKey(stateFeatures) : null,
    });
  } catch (e: unknown) {
    console.error('[EnemyIntel] Observation error:', e);
    res.status(500).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});

enemyIntelligenceRouter.post('/predict-enemy-action', async (req: Request, res: Response) => {
  try {
    const { encounterType, enemyName, enemyType, liveState, lockoutState, executionMode } = req.body;

    if (!encounterType || !enemyName || !enemyType) {
      return res.status(400).json({ ok: false, error: 'Missing required fields' });
    }

    let abilities = await db.select().from(enemyAbilityCatalog)
      .where(eq(enemyAbilityCatalog.enemyType, enemyType));

    if (abilities.length === 0) {
      const seedEntries = ENEMY_ABILITY_SEED.filter(s => s.enemyType === enemyType);
      if (seedEntries.length > 0) {
        await db.insert(enemyAbilityCatalog).values(seedEntries).onConflictDoNothing();
        abilities = await db.select().from(enemyAbilityCatalog)
          .where(eq(enemyAbilityCatalog.enemyType, enemyType));

        const configSeed = ENCOUNTER_CONFIG_SEED.find(c => c.encounterType === encounterType);
        if (configSeed) {
          await db.insert(encounterConfig).values(configSeed).onConflictDoNothing();
        }
      }
    }

    if (abilities.length === 0) {
      return res.json({
        ok: true,
        enemy: enemyName,
        legalActions: [],
        heuristicPriors: {},
        learnedPolicy: null,
        finalPolicy: {},
        confidence: 0,
        sampleCount: 0,
        reasoning: ['No abilities found in catalog for this enemy type'],
      });
    }

    let currentMp: number | null = null;
    let snapshot: EncounterSnapshot | null = null;
    let isChanneling = false;
    let allyDeadCount = 0;
    let anyEnemyChanneling = false;
    let liveOverride: Record<string, boolean> | undefined;

    if (liveState) {
      let telemetry: TelemetryEncounterState | null = null;

      if (liveState.units && Array.isArray(liveState.units)) {
        telemetry = buildTelemetryFromRawState(liveState);
      } else {
        telemetry = {
          encounterType,
          turn: liveState.turnNumber || 0,
          battleBudgetRemaining: liveState.battleBudgetRemaining ?? null,
          consumableQuantities: liveState.consumableQuantities || {},
          units: [
            {
              name: enemyName,
              type: enemyType,
              side: 'a' as const,
              currentHp: liveState.enemyHp ?? null,
              maxHp: liveState.enemyMaxHp ?? null,
              currentMp: liveState.enemyMp ?? null,
              maxMp: liveState.enemyMaxMp ?? null,
              buffs: liveState.activeBuffs || [],
              debuffs: liveState.activeDebuffs || [],
              position: liveState.enemyPosition ?? null,
              isChanneling: liveState.enemyChanneling || false,
              isAlive: (liveState.enemyHpPct ?? 1) > 0,
              visibleAbilityAvailability: liveState.abilityAvailability,
              visibleLockouts: lockoutState,
            },
            ...(liveState.heroes || []).map((h: Record<string, unknown>) => ({
              name: (h.name as string) || 'Hero',
              type: 'hero',
              side: 'b' as const,
              currentHp: (h.currentHp as number) ?? null,
              maxHp: (h.maxHp as number) ?? null,
              currentMp: (h.currentMp as number) ?? null,
              maxMp: (h.maxMp as number) ?? null,
              buffs: (h.buffs as string[]) || [],
              debuffs: (h.debuffs as string[]) || [],
              position: (h.position as number) ?? null,
              isChanneling: (h.isChanneling as boolean) || false,
              isAlive: h.isAlive !== undefined ? Boolean(h.isAlive) : ((h.currentHp as number ?? h.hpPercent as number ?? 1) > 0),
            })),
          ],
          eggState: liveState.eggState,
        };
      }

      if (telemetry) {
        snapshot = buildEncounterSnapshot(telemetry);
        const unit = telemetry.units.find(u => u.name === enemyName);
        if (unit) {
          currentMp = unit.currentMp;
          isChanneling = unit.isChanneling;
          liveOverride = unit.visibleAbilityAvailability;
        }
        const enemies = telemetry.units.filter(u => u.side === 'b');
        allyDeadCount = telemetry.units.filter(u => u.side === 'a' && !u.isAlive).length;
        anyEnemyChanneling = enemies.some(u => u.isChanneling);
      }
    }

    const resolvedLockouts = lockoutState || {};
    const targetableCount = snapshot ? snapshot.units.filter(u => u.side === 'ally' && u.isAlive).length : undefined;
    const availability = getAvailableActions(
      abilities, currentMp, resolvedLockouts, isChanneling, allyDeadCount, anyEnemyChanneling, liveOverride, targetableCount
    );
    const legalActions = availability.filter(a => a.available).map(a => a.abilityName);

    if (legalActions.length === 0) {
      return res.json({
        ok: true,
        enemy: enemyName,
        legalActions: [],
        availability: availability.map(a => ({ name: a.abilityName, available: a.available, reason: a.reason })),
        heuristicPriors: {},
        learnedPolicy: null,
        finalPolicy: {},
        confidence: 0,
        sampleCount: 0,
        reasoning: ['No legal actions available — all abilities locked or insufficient mana'],
      });
    }

    const dummyFeatures = snapshot
      ? extractStateFeatures(snapshot, enemyName, legalActions)
      : {
          schemaVersion: 1, encounterType, enemyType, currentTurn: 0,
          enemyHpPercent: null, enemyMpPercent: null, enemyPosition: null,
          alliesAliveCount: null, alliesDeadCount: null,
          enemiesAliveCount: null, targetableEnemyCount: null,
          currentBuffFlags: [], currentDebuffFlags: [], activePassiveFlags: [],
          channelingState: false, lockoutState: lockoutState || {},
          availableActions: legalActions, targetFrontlineCount: null,
          lowestEnemyHpPercent: null, anyEnemyChanneling: false,
          battleBudgetRemaining: null, consumableAvailabilitySummary: {},
        };

    const heuristicPriors = getHeuristicPriors(enemyType, dummyFeatures, legalActions);

    const learned = await getLearnedPolicy(encounterType, enemyType, dummyFeatures);

    const blended = blendPolicies(
      legalActions,
      heuristicPriors,
      learned.policy,
      learned.sampleCount,
      learned.confidence,
      dummyFeatures,
    );

    const stateKey = buildStateKey(dummyFeatures);
    const recentExamples = await db.select().from(enemyStateActionExamples)
      .where(and(
        eq(enemyStateActionExamples.enemyType, enemyType),
        eq(enemyStateActionExamples.encounterType, encounterType),
      ))
      .orderBy(desc(enemyStateActionExamples.createdAt))
      .limit(10);

    const matchingExamples = recentExamples.filter(e => {
      const raw = e.stateFeaturesJson as Record<string, unknown> | null;
      if (!raw) return false;
      try {
        const parsed = parseRawStateFeatures(raw);
        const key = buildStateKey(parsed);
        return key === stateKey || key.split('|').slice(0, 3).join('|') === stateKey.split('|').slice(0, 3).join('|');
      } catch { return false; }
    }).slice(0, 5);

    const hasUnresolved = legalActions.includes('Ominous Entrance');
    const configs = await db.select().from(encounterConfig)
      .where(eq(encounterConfig.encounterType, encounterType));
    const config = configs[0];

    const liveBudget = liveState?.battleBudgetRemaining;
    const budgetRemaining = liveBudget !== undefined && liveBudget !== null ? liveBudget : null;
    const consumableQuantities: Record<string, number> = liveState?.consumableQuantities || {};
    const consumableOptions: Array<{ name: string; cost: number; available: boolean; reason?: string }> = [];
    if (config?.consumableCatalogJson) {
      const catalog = config.consumableCatalogJson as Array<Record<string, unknown>>;
      for (const item of catalog) {
        const cost = item.cost as number;
        const name = item.name as string;
        const qtyRemaining = consumableQuantities[name];
        const quantityKnown = qtyRemaining !== undefined;
        const hasQuantity = quantityKnown && qtyRemaining > 0;
        const hasBudget = budgetRemaining === null || budgetRemaining >= cost;
        const available = hasQuantity && hasBudget;
        const reasons: string[] = [];
        if (!quantityKnown) reasons.push(`${name} quantity unverifiable (not in live telemetry)`);
        else if (!hasQuantity) reasons.push(`no ${name} remaining`);
        if (!hasBudget) reasons.push(`insufficient budget (need ${cost}, have ${budgetRemaining})`);
        consumableOptions.push({
          name,
          cost,
          available,
          reason: reasons.length > 0 ? reasons.join('; ') : undefined,
        });
      }
    }

    const mode = (executionMode as ExecutionMode) || 'observe_only';
    const consumablesHaveLiveQuantities = Object.keys(consumableQuantities).length > 0;
    const budgetHasLiveValue = liveState?.battleBudgetRemaining !== undefined && liveState?.battleBudgetRemaining !== null;
    const stateHasLiveTelemetry = liveState && liveState.heroHp != null && liveState.enemyHp != null;
    const safetyContext: ExecutionContext = {
      confidence: blended.confidence,
      confidenceThreshold: 0.5,
      hasUnresolvedAbility: hasUnresolved,
      consumablesVerifiable: consumablesHaveLiveQuantities,
      budgetVerifiable: budgetHasLiveValue,
      uiStateMatch: stateHasLiveTelemetry === true,
      unexpectedPopup: liveState?.unexpectedPopup === true,
      stateSynced: stateHasLiveTelemetry === true && liveState.turnNumber != null,
    };
    const safety = runSafetyChecks(mode, safetyContext);

    const budget = budgetRemaining;

    const topEnemyAction = Object.entries(blended.finalPolicy)
      .sort((a, b) => b[1] - a[1])[0];

    let simulationResults: import('../pve-monte-carlo').SimulationResult[] | null = null;
    let simulationDegraded = false;
    let simDegradationReasons: string[] = [];
    const hasLiveHpState = liveState && (liveState.heroHp != null || liveState.heroes?.length > 0);
    if (hasLiveHpState && topEnemyAction) {
      const heroHp = liveState.heroHp ?? (liveState.heroes?.[0]?.currentHp);
      const heroMaxHp = liveState.heroMaxHp ?? (liveState.heroes?.[0]?.maxHp);
      const heroMp = liveState.heroMp ?? (liveState.heroes?.[0]?.currentMp);
      const heroMaxMp = liveState.heroMaxMp ?? (liveState.heroes?.[0]?.maxMp);
      const enemyHpVal = liveState.enemyHp;
      const enemyMaxHpVal = liveState.enemyMaxHp;
      const enemyMpVal = liveState.enemyMp;

      if (heroHp != null && heroMaxHp != null && enemyHpVal != null && enemyMaxHpVal != null) {
        const currentHeroMp = heroMp ?? 0;
        const simCandidates: SimulationCandidate[] = [
          { actionName: 'Basic Attack', actionType: 'basic_attack', manaCost: 0, budgetCost: 0 },
          { actionName: 'Save Budget', actionType: 'save_budget', manaCost: 0, budgetCost: 0 },
        ];
        const heroSkills = Array.isArray(liveState.heroSkills) ? liveState.heroSkills : [];
        for (const skill of heroSkills) {
          const sName = skill.name || skill.abilityName || '';
          const sMana = skill.manaCost || 0;
          if (!sName || sName === 'Basic Attack') continue;
          const isLocked = skill.lockedOut === true || (skill.lockoutTurns && skill.lockoutTurns > 0);
          const noMana = sMana > 0 && currentHeroMp < sMana;
          if (!isLocked && !noMana) {
            simCandidates.push({
              actionName: sName,
              actionType: 'skill',
              manaCost: sMana,
              budgetCost: 0,
            });
          }
        }
        for (const opt of consumableOptions) {
          if (opt.available) {
            const aType = opt.name.toLowerCase().includes('health') ? 'health_vial' as const
              : opt.name.toLowerCase().includes('mana') ? 'mana_vial' as const : null;
            if (aType) simCandidates.push({ actionName: opt.name, actionType: aType, manaCost: 0, budgetCost: opt.cost });
          }
        }
        const abilityProfiles = abilities.map(a => ({
          abilityName: a.abilityName,
          formulaJson: a.formulaJson || null,
          manaCost: a.manaCost,
          amnesiaTurns: a.amnesiaTurns,
          effectsJson: a.effectsJson || null,
          range: a.range || null,
          specialRules: (a.specialRulesJson as Record<string, unknown>) || {},
          passiveFlag: a.passiveFlag,
        }));

        const enemyTelemetryStats: Record<string, number> | undefined = liveState.enemyStats || undefined;
        const heroTelemetryStats: Record<string, number> | undefined = liveState.heroStats || undefined;

        let heroDamageRange: { min: number; max: number } | undefined;
        if (heroTelemetryStats) {
          const atk = heroTelemetryStats.ATK || heroTelemetryStats.atk || 0;
          const str = heroTelemetryStats.STR || heroTelemetryStats.str || 0;
          const baseDmg = Math.max(1, Math.round((atk + str * 0.5) * 0.8));
          heroDamageRange = { min: Math.round(baseDmg * 0.85), max: Math.round(baseDmg * 1.15) };
        } else if (enemyMaxHpVal > 0) {
          const estimatedDmg = Math.round(enemyMaxHpVal * 0.08);
          heroDamageRange = { min: Math.max(1, Math.round(estimatedDmg * 0.7)), max: Math.round(estimatedDmg * 1.3) };
        }

        simDegradationReasons = [];
        if (!enemyTelemetryStats) simDegradationReasons.push('enemy_stats_missing_pre_sim');
        if (!heroTelemetryStats) simDegradationReasons.push('hero_stats_missing_pre_sim');
        if (!heroDamageRange) simDegradationReasons.push('hero_damage_range_unknown_pre_sim');

        const enemySideAlive = snapshot ? snapshot.units.filter(u => u.side === 'enemy' && u.isAlive).length : 0;
        const enemySideDead = snapshot ? snapshot.units.filter(u => u.side === 'enemy' && !u.isAlive).length : 0;

        simulationResults = runMonteCarloSimulation(
          simCandidates, blended,
          heroHp, heroMaxHp,
          currentHeroMp, heroMaxMp ?? 100,
          enemyHpVal, enemyMaxHpVal, enemyMpVal ?? 0,
          budgetRemaining,
          {
            abilityProfiles, enemyTelemetryStats, heroTelemetryStats, heroDamageRange,
            enemyAlliesAlive: Math.max(0, enemySideAlive - 1),
            enemyAlliesDead: enemySideDead,
            policyConfidence: blended.confidence,
          },
        );
        const mcReasons = getDegradationReasons();
        simDegradationReasons = [...simDegradationReasons, ...mcReasons];
        simulationDegraded = isSimulationDegraded() || simDegradationReasons.length > 0;
      }
    }

    const topPlayerCandidate = simulationResults?.[0]?.candidate;
    const playerRecommendedAction = topPlayerCandidate?.actionName || 'Basic Attack';
    const execution = buildActionExecution(playerRecommendedAction, undefined, learned.targetPolicy || null);

    const parsedSessionId = liveState?.sessionId != null
      ? (typeof liveState.sessionId === 'number' ? liveState.sessionId : parseInt(liveState.sessionId, 10))
      : null;
    if (parsedSessionId !== null && isNaN(parsedSessionId)) throw new Error('Invalid sessionId — must be numeric');

    if (parsedSessionId !== null) {
      const turnLog = buildTurnLogEntry(
        parsedSessionId,
        encounterType,
        liveState.currentTurn || 0,
        mode,
        safety,
        playerRecommendedAction,
        execution.targetSlot,
        undefined,
        undefined,
        blended.confidence,
      );
      await db.insert(combatSessionTurnLogs).values({
        sessionId: parsedSessionId,
        encounterType: turnLog.encounterType,
        huntId: liveState.huntId || null,
        turn: turnLog.turn,
        executionMode: turnLog.executionMode,
        recommendedActionJson: { action: turnLog.recommendedAction, target: turnLog.recommendedTarget },
        executedActionJson: turnLog.executedAction ? { action: turnLog.executedAction, target: turnLog.executedTarget } : {},
        simulationCount: simulationResults?.reduce((s, r) => s + r.simulationCount, 0) || 0,
        safetyCheckStatus: safety.blockReasons.length === 0 ? 'passed' : 'blocked',
        safetyChecksPassed: safety.checksPassed,
        safetyStatusJson: {
          effectiveMode: turnLog.effectiveMode,
          blockReasons: turnLog.safetyBlockReasons,
          confidence: turnLog.confidence,
        },
        stateFeaturesJson: dummyFeatures as unknown as Record<string, unknown>,
      }).catch((e: Error) => console.warn('[EnemyIntel] Turn log insert failed:', e.message));
    }

    if (consumableOptions.length > 0 && parsedSessionId !== null) {
      const bestConsumable = consumableOptions.find(o => o.available);
      db.insert(consumableRecommendationSnapshots).values({
        sessionId: parsedSessionId,
        encounterType,
        huntId: liveState.huntId || null,
        turn: liveState.currentTurn || 0,
        unitName: enemyName,
        startingBattleBudget: config?.startingBattleBudget || null,
        remainingBattleBudget: budgetRemaining,
        consumableStateJson: {
          options: consumableOptions.map(o => ({ name: o.name, available: o.available, cost: o.cost })),
        },
        candidateActionsJson: consumableOptions.filter(o => o.available).map(o => ({
          name: o.name, cost: o.cost, type: o.name.toLowerCase().includes('health') ? 'health_vial' : 'mana_vial',
        })),
        chosenRecommendationJson: bestConsumable ? { name: bestConsumable.name, cost: bestConsumable.cost } : null,
        reasoningJson: simulationDegraded
          ? ['Simulation degraded — consumable recommendation based on heuristic']
          : ['Consumable evaluation based on simulation results'],
      }).catch((e: Error) => console.warn('[EnemyIntel] Consumable snapshot insert failed:', e.message));
    }

    res.json({
      ok: true,
      enemy: enemyName,
      legalActions,
      availability: availability.map(a => ({ name: a.abilityName, available: a.available, reason: a.reason })),
      heuristicPriors: blended.heuristicPriors,
      learnedPolicy: blended.learnedPolicy,
      finalPolicy: blended.finalPolicy,
      confidence: blended.confidence,
      sampleCount: blended.sampleCount,
      stateKey,
      stateFeatures: dummyFeatures,
      nearestExamples: matchingExamples.map(e => ({
        action: e.chosenAction,
        target: e.chosenTarget,
        turn: e.turn,
        stateKey: (() => {
          const raw = e.stateFeaturesJson as Record<string, unknown> | null;
          if (!raw) return null;
          try { return buildStateKey(parseRawStateFeatures(raw)); } catch { return null; }
        })(),
        at: e.createdAt,
      })),
      learnedTargetPolicy: learned.targetPolicy || null,
      consumableOptions,
      reasoning: blended.reasoning,
      confidenceDegradations: blended.confidenceDegradations,
      blendingDetails: {
        learnedWeight: blended.learnedWeight,
        heuristicWeight: blended.heuristicWeight,
        sampleCountForBlend: blended.sampleCount,
      },
      playerRecommendation: {
        action: playerRecommendedAction,
        actionType: execution.actionType,
        source: simulationResults ? 'simulation' : 'heuristic_fallback',
      },
      enemyPrediction: topEnemyAction ? { action: topEnemyAction[0], probability: topEnemyAction[1] } : null,
      executionMode: safety.effectiveMode,
      budget,
      execution,
      simulation: simulationResults ? {
        rankedCandidates: simulationResults.map(r => ({
          action: r.candidate.actionName,
          type: r.candidate.actionType,
          compositeScore: r.compositeScore,
          survivalProbability: r.survivalProbability,
          killProbability: r.killProbability,
          expectedDamage: r.expectedDamage,
          expectedIncomingDamage: r.expectedIncomingDamage,
          consumableValue: r.consumableValue,
          budgetCost: r.battleBudgetCost,
          simulationCount: r.simulationCount,
          fallbackMode: r.fallbackMode,
        })),
        degraded: simulationDegraded,
        degradationReasons: simDegradationReasons,
        totalSimulations: simulationResults.reduce((s, r) => s + r.simulationCount, 0),
      } : null,
      safetyCheck: {
        canAutoExecute: safety.canAutoExecute,
        blockReasons: safety.blockReasons,
        checksPassed: safety.checksPassed,
      },
    });
  } catch (e: unknown) {
    console.error('[EnemyIntel] Predict error:', e);
    res.status(500).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});

enemyIntelligenceRouter.post('/simulate', async (req: Request, res: Response) => {
  try {
    const {
      encounterType, enemyType, liveState,
      heroHp, heroMaxHp, heroMp, heroMaxMp,
      enemyHp, enemyMaxHp, enemyMp, enemyMaxMp,
      battleBudgetRemaining,
      candidates: rawCandidates,
      lockoutState,
      enemyAlliesAlive: reqEnemyAlliesAlive,
      enemyAlliesDead: reqEnemyAlliesDead,
    } = req.body;

    const abilities = await db.select().from(enemyAbilityCatalog)
      .where(eq(enemyAbilityCatalog.enemyType, enemyType));

    const resolvedEnemyMp = enemyMp ?? null;
    const availability = getAvailableActions(abilities, resolvedEnemyMp, lockoutState || {}, false, 0, false);
    const legalActions = availability.filter(a => a.available).map(a => a.abilityName);

    const dummyFeatures = {
      schemaVersion: 1, encounterType, enemyType, currentTurn: 0,
      enemyHpPercent: enemyMaxHp ? Math.round((enemyHp / enemyMaxHp) * 100) : null,
      enemyMpPercent: resolvedEnemyMp !== null && (enemyMaxMp || enemyMaxHp) ? Math.round((resolvedEnemyMp / (enemyMaxMp || enemyMaxHp)) * 100) : null,
      enemyPosition: null,
      alliesAliveCount: null, alliesDeadCount: null,
      enemiesAliveCount: null, targetableEnemyCount: null,
      currentBuffFlags: [], currentDebuffFlags: [], activePassiveFlags: [],
      channelingState: false, lockoutState: lockoutState || {},
      availableActions: legalActions, targetFrontlineCount: null,
      lowestEnemyHpPercent: null, anyEnemyChanneling: false,
      battleBudgetRemaining, consumableAvailabilitySummary: {},
    };

    const heuristicPriors = getHeuristicPriors(enemyType, dummyFeatures, legalActions);
    const learned = await getLearnedPolicy(encounterType, enemyType, dummyFeatures);
    const blended = blendPolicies(legalActions, heuristicPriors, learned.policy, learned.sampleCount, learned.confidence, dummyFeatures);

    const budgetLeft = battleBudgetRemaining ?? null;
    const consumableQty: Record<string, number> = liveState?.consumableQuantities || {};

    const isConsumableLegal = (name: string, cost: number): boolean => {
      if (budgetLeft === null || budgetLeft < cost) return false;
      const qty = consumableQty[name];
      if (qty === undefined || qty <= 0) return false;
      return true;
    };

    const defaultCandidates: SimulationCandidate[] = [
      { actionName: 'Basic Attack', actionType: 'basic_attack', manaCost: 0, budgetCost: 0 },
      { actionName: 'Save Budget', actionType: 'save_budget', manaCost: 0, budgetCost: 0 },
    ];
    if (isConsumableLegal('Health Vial', 3)) {
      defaultCandidates.push({ actionName: 'Health Vial', actionType: 'health_vial', manaCost: 0, budgetCost: 3 });
    }
    if (isConsumableLegal('Mana Vial', 3)) {
      defaultCandidates.push({ actionName: 'Mana Vial', actionType: 'mana_vial', manaCost: 0, budgetCost: 3 });
    }
    const candidates: SimulationCandidate[] = rawCandidates
      ? (rawCandidates as SimulationCandidate[]).filter((c: SimulationCandidate) => {
          const isConsumable = c.actionType === 'health_vial' || c.actionType === 'mana_vial';
          return isConsumable ? isConsumableLegal(c.actionName, c.budgetCost) : true;
        })
      : defaultCandidates;

    const abilityProfiles = abilities.map(a => ({
      abilityName: a.abilityName,
      formulaJson: a.formulaJson || null,
      manaCost: a.manaCost,
      amnesiaTurns: a.amnesiaTurns,
      effectsJson: a.effectsJson || null,
      range: a.range || null,
      specialRules: (a.specialRulesJson as Record<string, unknown>) || {},
      passiveFlag: a.passiveFlag,
    }));

    if (heroHp == null || heroMaxHp == null || enemyHp == null || enemyMaxHp == null) {
      return res.status(400).json({
        ok: false,
        error: 'Missing required telemetry fields: heroHp, heroMaxHp, enemyHp, enemyMaxHp must be provided from live state',
        requiredFields: ['heroHp', 'heroMaxHp', 'enemyHp', 'enemyMaxHp'],
      });
    }

    const results = runMonteCarloSimulation(
      candidates, blended,
      heroHp, heroMaxHp,
      heroMp ?? 0, heroMaxMp ?? heroHp,
      enemyHp, enemyMaxHp, enemyMp ?? 0,
      battleBudgetRemaining,
      {
        abilityProfiles,
        enemyAlliesAlive: reqEnemyAlliesAlive ?? 0,
        enemyAlliesDead: reqEnemyAlliesDead ?? 0,
        policyConfidence: blended.confidence,
      },
    );

    const degraded = isSimulationDegraded();
    const degradationReasons = getDegradationReasons();
    res.json({ ok: true, results, enemyPolicy: blended.finalPolicy, degraded, degradationReasons });
  } catch (e: unknown) {
    console.error('[EnemyIntel] Simulate error:', e);
    res.status(500).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});

enemyIntelligenceRouter.post('/enemy-profile/rebuild/:enemyKey', async (req: Request, res: Response) => {
  try {
    const [encounterType, enemyType] = req.params.enemyKey.split(':');
    if (!encounterType || !enemyType) {
      return res.status(400).json({ ok: false, error: 'enemyKey format: encounterType:enemyType' });
    }

    const result = await rebuildPolicyProfile(encounterType, enemyType);
    res.json({ ok: true, ...result });
  } catch (e: unknown) {
    console.error('[EnemyIntel] Rebuild error:', e);
    res.status(500).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});

enemyIntelligenceRouter.post('/recommendation-outcome', async (req: Request, res: Response) => {
  try {
    const {
      sessionId, encounterType, huntId, turn,
      recommendedAction, executedAction,
      stateBefore, stateAfter,
      outcomeDelta, survivedNextCycle, fightWon,
    } = req.body;

    const numSessionId = typeof sessionId === 'number' ? sessionId : parseInt(sessionId, 10);
    if (isNaN(numSessionId)) {
      return res.status(400).json({ ok: false, error: 'sessionId must be numeric' });
    }
    await db.insert(recommendationOutcomes).values({
      sessionId: numSessionId,
      encounterType,
      huntId,
      turn,
      recommendedActionJson: recommendedAction || {},
      executedActionJson: executedAction || {},
      stateBeforeJson: stateBefore || {},
      stateAfterJson: stateAfter || {},
      outcomeDeltaJson: outcomeDelta || {},
      survivedNextCycle,
      fightWon,
    });

    res.json({ ok: true });
  } catch (e: unknown) {
    console.error('[EnemyIntel] Outcome error:', e);
    res.status(500).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});

enemyIntelligenceRouter.post('/consumable-outcome', async (req: Request, res: Response) => {
  try {
    const {
      sessionId, encounterType, huntId, turn,
      consumableState, recommendedConsumableAction,
      executedConsumableAction, outcomeDelta,
    } = req.body;

    const numSessionId2 = typeof sessionId === 'number' ? sessionId : parseInt(sessionId, 10);
    if (isNaN(numSessionId2)) {
      return res.status(400).json({ ok: false, error: 'sessionId must be numeric' });
    }
    await db.insert(consumableOutcomeExamples).values({
      sessionId: numSessionId2,
      encounterType,
      huntId,
      turn,
      consumableStateJson: consumableState || {},
      recommendedConsumableActionJson: recommendedConsumableAction || {},
      executedConsumableActionJson: executedConsumableAction || {},
      outcomeDeltaJson: outcomeDelta || {},
    });

    res.json({ ok: true });
  } catch (e: unknown) {
    console.error('[EnemyIntel] Consumable outcome error:', e);
    res.status(500).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});

enemyIntelligenceRouter.post('/execute', async (req: Request, res: Response) => {
  try {
    const {
      sessionId, encounterType, turn,
      recommendedAction, targetSlot, targetPolicy,
      requestedMode, confidence, confidenceThreshold,
      consumablesVerifiable, budgetVerifiable,
      uiState,
    } = req.body;

    if (!recommendedAction || !uiState) {
      return res.status(400).json({ ok: false, error: 'recommendedAction and uiState are required' });
    }

    const executionContext: ExecutionContext = {
      confidence: confidence ?? 0.5,
      confidenceThreshold: confidenceThreshold ?? 0.6,
      hasUnresolvedAbility: false,
      consumablesVerifiable: consumablesVerifiable ?? false,
      budgetVerifiable: budgetVerifiable ?? false,
      uiStateMatch: true,
      unexpectedPopup: uiState.popupPresent ?? false,
      stateSynced: true,
    };

    const safetyResult = runSafetyChecks(requestedMode || 'recommend_and_confirm', executionContext);
    const execution = buildActionExecution(recommendedAction, targetSlot, targetPolicy);
    const result = executeActionPipeline(execution, safetyResult, {
      turnNumber: turn ?? 0,
      heroHp: uiState.heroHp ?? 0,
      heroMp: uiState.heroMp ?? 0,
      enemyHp: uiState.enemyHp ?? 0,
      battleBudgetRemaining: uiState.battleBudgetRemaining ?? null,
      abilityButtonsVisible: uiState.abilityButtonsVisible ?? [],
      consumableButtonsVisible: uiState.consumableButtonsVisible ?? [],
      popupPresent: uiState.popupPresent ?? false,
    });

    const numExecSessionId = sessionId != null ? (typeof sessionId === 'number' ? sessionId : parseInt(sessionId, 10)) : null;
    const validExecSessionId = numExecSessionId !== null && !isNaN(numExecSessionId) ? numExecSessionId : null;

    const turnLog = buildTurnLogEntry(
      validExecSessionId ?? 0,
      encounterType || 'unknown',
      turn ?? 0,
      requestedMode || 'recommend_and_confirm',
      safetyResult,
      recommendedAction,
      targetSlot,
      result.success ? result.actionExecuted : undefined,
      result.targetSlot,
      confidence ?? 0,
    );

    if (validExecSessionId !== null) {
      db.insert(combatSessionTurnLogs).values({
        sessionId: validExecSessionId,
        encounterType: encounterType || 'unknown',
        huntId: null,
        turn: turn ?? 0,
        executionMode: requestedMode || 'recommend_and_confirm',
        recommendedActionJson: { action: recommendedAction, targetSlot },
        executedActionJson: result.success ? { action: result.actionExecuted, targetSlot: result.targetSlot } : {},
        simulationCount: 0,
        safetyCheckStatus: safetyResult.canAutoExecute ? 'passed' : 'blocked',
        safetyChecksPassed: safetyResult.checksPassed,
        safetyStatusJson: { blockReasons: safetyResult.blockReasons, effectiveMode: safetyResult.effectiveMode },
        stateFeaturesJson: uiState,
      }).catch((e: Error) => console.warn('[EnemyIntel] Turn log insert failed:', e.message));
    }

    res.json({
      ok: true,
      advisory: true,
      description: 'Execution descriptor for browser extension consumption. The backend validates the action against reported UI state and produces step-by-step dispatch instructions. Actual UI interaction must be performed by the extension client.',
      executionResult: result,
      dispatch: execution.dispatch,
      turnSync: execution.turnSync,
      safetyCheck: safetyResult,
      turnLog,
    });
  } catch (e: unknown) {
    console.error('[EnemyIntel] Execute error:', e);
    res.status(500).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});

enemyIntelligenceRouter.get('/behavior-profiles', async (req: Request, res: Response) => {
  try {
    const encounterType = req.query.encounter_type as string | undefined;
    const conditions = encounterType ? eq(enemyBehaviorProfiles.encounterType, encounterType) : undefined;
    const profiles = conditions
      ? await db.select().from(enemyBehaviorProfiles).where(conditions)
      : await db.select().from(enemyBehaviorProfiles);
    res.json({ ok: true, profiles });
  } catch (e: unknown) {
    res.status(500).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});

enemyIntelligenceRouter.get('/learned-policies', async (req: Request, res: Response) => {
  try {
    const encounterType = req.query.encounter_type as string | undefined;
    const conditions = encounterType ? eq(learnedEnemyPolicyProfiles.encounterType, encounterType) : undefined;
    const policies = conditions
      ? await db.select().from(learnedEnemyPolicyProfiles).where(conditions)
      : await db.select().from(learnedEnemyPolicyProfiles);
    res.json({ ok: true, policies });
  } catch (e: unknown) {
    res.status(500).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
  }
});

const POLICY_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const ENEMY_TYPES_TO_REFRESH = [
  { encounterType: 'boar_hunt', enemyType: 'baby_boar' },
  { encounterType: 'boar_hunt', enemyType: 'mama_boar' },
  { encounterType: 'bad_motherclucker', enemyType: 'bad_motherclucker' },
  { encounterType: 'bad_motherclucker', enemyType: 'baby_rocboc' },
];

let policyRefreshTimer: ReturnType<typeof setInterval> | null = null;

async function seedCatalogIfEmpty(): Promise<void> {
  try {
    const existing = await db.select().from(enemyAbilityCatalog).limit(1);
    if (existing.length > 0) {
      console.log('[EnemyIntel] Catalog already seeded, skipping');
      return;
    }
    console.log('[EnemyIntel] Seeding enemy ability catalog...');
    await db.insert(enemyAbilityCatalog).values(ENEMY_ABILITY_SEED).onConflictDoNothing();
    for (const cfg of ENCOUNTER_CONFIG_SEED) {
      await db.insert(encounterConfig).values(cfg).onConflictDoNothing();
    }
    const seededCount = await db.select().from(enemyAbilityCatalog);
    console.log(`[EnemyIntel] Catalog seeded: ${seededCount.length} abilities, ${ENCOUNTER_CONFIG_SEED.length} encounter configs`);
  } catch (e) {
    console.error('[EnemyIntel] Catalog seed error:', e);
  }
}

export function startPolicyRefreshJob(): void {
  if (policyRefreshTimer) return;

  seedCatalogIfEmpty();
  console.log('[EnemyIntel] Background policy refresh job started (every 5 min)');
  policyRefreshTimer = setInterval(async () => {
    for (const { encounterType, enemyType } of ENEMY_TYPES_TO_REFRESH) {
      try {
        const result = await rebuildPolicyProfile(encounterType, enemyType);
        if (result.sampleCount > 0) {
          console.log(`[EnemyIntel] Policy refreshed: ${enemyType} (${encounterType}) - ${result.sampleCount} samples, v${result.profileVersion}`);
        }

        const agg = result.behaviorAggregation;
        await db.insert(enemyBehaviorProfiles).values({
          encounterType,
          enemyType,
          abilityUseRates: agg.abilityUseRates,
          reuseGaps: agg.reuseGaps,
          targetingDistribution: agg.targetingDistribution,
          confidenceScore: Math.min(1.0, result.sampleCount / 100),
          sampleCount: result.sampleCount,
        }).onConflictDoUpdate({
          target: [enemyBehaviorProfiles.encounterType, enemyBehaviorProfiles.enemyType],
          set: {
            abilityUseRates: agg.abilityUseRates,
            reuseGaps: agg.reuseGaps,
            targetingDistribution: agg.targetingDistribution,
            confidenceScore: Math.min(1.0, result.sampleCount / 100),
            sampleCount: result.sampleCount,
            updatedAt: new Date(),
          },
        });
      } catch (e) {
        console.error(`[EnemyIntel] Policy refresh failed for ${enemyType}:`, e);
      }
    }
  }, POLICY_REFRESH_INTERVAL_MS);
}

enemyIntelligenceRouter.post('/session-close', async (req: Request, res: Response) => {
  try {
    const { encounterType, enemyType, sessionId } = req.body;
    if (!encounterType || !enemyType) {
      return res.status(400).json({ ok: false, error: 'encounterType and enemyType required' });
    }

    const result = await rebuildPolicyProfile(encounterType, enemyType);
    const agg = result.behaviorAggregation;
    await db.insert(enemyBehaviorProfiles).values({
      encounterType,
      enemyType,
      abilityUseRates: agg.abilityUseRates,
      reuseGaps: agg.reuseGaps,
      targetingDistribution: agg.targetingDistribution,
      confidenceScore: Math.min(1.0, result.sampleCount / 100),
      sampleCount: result.sampleCount,
    }).onConflictDoUpdate({
      target: [enemyBehaviorProfiles.encounterType, enemyBehaviorProfiles.enemyType],
      set: {
        abilityUseRates: agg.abilityUseRates,
        reuseGaps: agg.reuseGaps,
        targetingDistribution: agg.targetingDistribution,
        confidenceScore: Math.min(1.0, result.sampleCount / 100),
        sampleCount: result.sampleCount,
        updatedAt: new Date(),
      },
    });

    console.log(`[EnemyIntel] Session-close policy rebuild: ${enemyType} (${encounterType}) - ${result.sampleCount} samples, v${result.profileVersion}`);
    res.json({
      ok: true,
      encounterType,
      enemyType,
      sessionId,
      profileVersion: result.profileVersion,
      sampleCount: result.sampleCount,
    });
  } catch (error) {
    console.error('[EnemyIntel] Session close error:', error);
    res.status(500).json({ ok: false, error: 'Session close failed' });
  }
});

export function stopPolicyRefreshJob(): void {
  if (policyRefreshTimer) {
    clearInterval(policyRefreshTimer);
    policyRefreshTimer = null;
  }
}
