/**
 * React Runtime Extractor
 * Provides shape-based readers for DFK React state.
 *
 * This file is loaded in both:
 * - MAIN world: performs the actual React fiber/props traversal
 * - ISOLATED world: exposes bridge helpers used by the rest of the extension
 */

(function () {
  const RUNTIME_CACHE_TTL_MS = 15000;
  const REQUEST_EVENT = 'dfk-react-runtime-request';
  const ROOT_ATTR = 'data-dfk-react-runtime-root';
  const RESPONSE_ATTR_PREFIX = 'data-dfk-react-runtime-response-';
  const MAIN_WORLD_INIT = '__dfkReactRuntimeMainInit';
  const ISOLATED_WORLD_INIT = '__dfkReactRuntimeIsolatedInit';
  const MAIN_WORLD = !(typeof chrome !== 'undefined' && chrome?.runtime?.id);

  function isObject(value) {
    return !!value && typeof value === 'object';
  }

  function toNumber(value) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function nowMs() {
    return typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();
  }

  function createRuntimeMetrics() {
    return {
      cacheHit: false,
      usedContainerRef: false,
      usedDeepFind: false,
      visitedNodes: 0,
      durationMs: 0,
      anchorSource: null,
      seedCount: 0,
    };
  }

  function buildTurnEntryKey(entry) {
    if (!entry) return 'na';
    return [
      entry.side ?? 'na',
      entry.slot ?? 'na',
      entry.ticks ?? 'na',
      entry.totalTicks ?? 'na',
      entry.turnType ?? 'na',
    ].join(':');
  }

  function buildSelectedTurnKey(entry) {
    return entry ? buildTurnEntryKey(entry) : 'none';
  }

  function buildBattleDataSignature(battleData) {
    if (!battleData || typeof battleData !== 'object') return 'none';
    return [
      battleData.sessionId || '',
      battleData.scenarioId || '',
      battleData.turnCount ?? '',
      battleData.roundCount ?? '',
      battleData.totalTicks ?? '',
      battleData.lastPlayedAttack || '',
      JSON.stringify(battleData.nextPlayTurn || null),
    ].join('|');
  }

  function buildCombatantKey(runtime) {
    const baseCombatant = runtime?.baseCombatant || null;
    const location = runtime?.currentLocation || {};
    if (baseCombatant?.id) return `id:${baseCombatant.id}`;
    if (baseCombatant?.name) {
      return `name:${String(baseCombatant.name).toLowerCase().replace(/[^a-z0-9]+/g, '_')}:${location.side ?? 'na'}`;
    }
    return 'unknown';
  }

  function simplifyFirestoreValue(node, depth = 0) {
    if (!node || depth > 5) return null;
    if (Object.prototype.hasOwnProperty.call(node, 'stringValue')) return node.stringValue;
    if (Object.prototype.hasOwnProperty.call(node, 'integerValue')) return toNumber(node.integerValue);
    if (Object.prototype.hasOwnProperty.call(node, 'doubleValue')) return toNumber(node.doubleValue);
    if (Object.prototype.hasOwnProperty.call(node, 'booleanValue')) return !!node.booleanValue;
    if (Object.prototype.hasOwnProperty.call(node, 'timestampValue')) return node.timestampValue;
    if (Object.prototype.hasOwnProperty.call(node, 'nullValue')) return null;
    if (node.arrayValue) {
      const values = Array.isArray(node.arrayValue.values) ? node.arrayValue.values : [];
      return values.map((value) => simplifyFirestoreValue(value, depth + 1));
    }
    if (node.mapValue) {
      const out = {};
      const fields = node.mapValue.fields || {};
      Object.entries(fields).slice(0, 80).forEach(([key, value]) => {
        out[key] = simplifyFirestoreValue(value, depth + 1);
      });
      return out;
    }
    return null;
  }

  function extractBattleDataFields(battleData) {
    const fields = battleData?._document?.data?.value?.mapValue?.fields || null;
    if (!fields) return null;
    return simplifyFirestoreValue({ mapValue: { fields } }, 0);
  }

  function simplifyTurnEntry(entry) {
    if (!entry || !isObject(entry)) return null;
    const initiativeTurn = isObject(entry.initiativeTurn) ? entry.initiativeTurn : entry;
    const playTurn = initiativeTurn.playTurn || {};
    return {
      side: toNumber(playTurn.side),
      slot: toNumber(playTurn.slot),
      ticks: toNumber(initiativeTurn.ticks),
      totalTicks: toNumber(initiativeTurn.totalTicks),
      turnType: toNumber(entry.turnType),
    };
  }

  function simplifyAttackConfig(config) {
    if (!config || !isObject(config)) return null;
    return {
      attackId: config.attackId || null,
      attackType: config.attackType || null,
      attackCategory: toNumber(config.attackCategory),
      attackRange: toNumber(config.attackRange),
      attackStyle: config.attackStyle || null,
      combatantClassification: config.combatantClassification || null,
      damageType: toNumber(config.damageType),
      degreeOfDifficulty: toNumber(config.degreeOfDifficulty),
      discipline: toNumber(config.discipline),
      influence: toNumber(config.influence),
      levelMultiplier: toNumber(config.levelMultiplier),
      levelZeroManaCost: toNumber(config.levelZeroManaCost),
      initiative: toNumber(config.initiative),
      itemWeight: toNumber(config.itemWeight),
      animationDuration: toNumber(config.animationDuration),
      skillPoints: toNumber(config.skillPoints),
      charges: toNumber(config.charges),
      bonusValue: toNumber(config.bonusValue),
      imagePath: config.imagePath || null,
      internalOutcomeCalculations: config.internalOutcomeCalculations === true,
      shouldBypassTaunt: config.shouldBypassTaunt === true,
      shouldAllowDeadTargets: config.shouldAllowDeadTargets === true,
      weaponTypeRequirements: Array.isArray(config.weaponTypeRequirements) ? config.weaponTypeRequirements : [],
    };
  }

  function simplifyAttackHistoryEntry(entry) {
    if (!entry || !isObject(entry)) return null;
    const attackConfig = entry.attackConfig || null;
    return {
      attackId: entry.attackId || attackConfig?.attackId || null,
      attackType: attackConfig?.attackType || null,
      targetSide: toNumber(entry.targetSide),
      targetSlot: toNumber(entry.targetSlot),
    };
  }

  function simplifyComboTracker(tracker) {
    if (!tracker || !isObject(tracker)) return null;
    const config = tracker.comboTrackerConfig || {};
    return {
      comboTrackerId: config.comboTrackerId || null,
      comboTrackerType: config.comboTrackerType || null,
      heroType: config.heroType || null,
      attackHistory: Array.isArray(config.attackHistory)
        ? config.attackHistory.map(simplifyAttackHistoryEntry).filter(Boolean)
        : [],
    };
  }

  function simplifyPassiveTracker(tracker) {
    if (!tracker || !isObject(tracker)) return null;
    const config = tracker.trackerConfig || {};
    return {
      trackerType: tracker.constructor?.name || null,
      charges: toNumber(config.charges),
      forgottenAttack: config.forgottenAttack?.attackId || config.forgottenAttack?.attackType || null,
      immuneToCleanse: config.immuneToCleanse === true,
      immuneToDeath: config.immuneToDeath === true,
      immuneToDispel: config.immuneToDispel === true,
      criticalStrikeChance: toNumber(config.criticalStrikeChance),
    };
  }

  function simplifyDurationTracker(tracker) {
    if (!tracker || !isObject(tracker)) return null;
    return {
      currentInitiative: toNumber(tracker.currentInitiative),
      requiredTicks: Array.isArray(tracker.requiredTicks)
        ? tracker.requiredTicks.map((value) => toNumber(value)).filter((value) => value != null)
        : [],
      totalTurns: toNumber(tracker.totalTurns),
    };
  }

  function simplifyBaseCombatant(baseCombatant) {
    if (!baseCombatant || !isObject(baseCombatant)) return null;
    return {
      id: baseCombatant.id || null,
      name: baseCombatant.name || null,
      level: toNumber(baseCombatant.level),
      combatantType: toNumber(baseCombatant.combatantType),
      mainClassStr: baseCombatant.mainClassStr || null,
      subClassStr: baseCombatant.subClassStr || null,
      professionStr: baseCombatant.professionStr || null,
      hp: toNumber(baseCombatant.hp),
      mp: toNumber(baseCombatant.mp),
      strength: toNumber(baseCombatant.strength),
      dexterity: toNumber(baseCombatant.dexterity),
      agility: toNumber(baseCombatant.agility),
      intelligence: toNumber(baseCombatant.intelligence),
      wisdom: toNumber(baseCombatant.wisdom),
      vitality: toNumber(baseCombatant.vitality),
      endurance: toNumber(baseCombatant.endurance),
      luck: toNumber(baseCombatant.luck),
    };
  }

  function simplifyEquipmentConfig(config) {
    if (!config || !isObject(config)) return null;
    return {
      equipmentId: config.equipmentId || null,
      equipmentName: config.equipmentName || null,
      displayId: toNumber(config.displayId),
      level: toNumber(config.level),
      rarity: config.rarity || null,
      weaponType: config.weaponType || null,
      weaponRange: config.weaponRange || null,
      speedModifier: toNumber(config.speedModifier),
    };
  }

  function serializeResult(result) {
    if (!result) return { runtime: null, cache: null, metrics: null, invalidationReason: 'no_result' };
    const cache = result.cache ? {
      capturedAt: result.cache.capturedAt || null,
      selectedTurnKey: result.cache.selectedTurnKey || null,
      turnsSignature: result.cache.turnsSignature || null,
      battleDataSignature: result.cache.battleDataSignature || null,
      combatantKey: result.cache.combatantKey || null,
    } : null;
    return {
      runtime: result.runtime || null,
      cache,
      metrics: result.metrics || null,
      invalidationReason: result.invalidationReason || null,
    };
  }

  function requestMainWorldRuntime(kind, rootEl) {
    const startedAt = nowMs();
    const metrics = createRuntimeMetrics();
    if (!rootEl || !document?.documentElement) {
      metrics.durationMs = nowMs() - startedAt;
      return { runtime: null, cache: null, metrics, invalidationReason: 'no_root' };
    }

    const requestId = `${kind}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const responseAttr = `${RESPONSE_ATTR_PREFIX}${requestId}`;

    try {
      rootEl.setAttribute(ROOT_ATTR, requestId);
      document.dispatchEvent(new CustomEvent(REQUEST_EVENT, {
        detail: {
          kind,
          requestId,
          rootAttr: ROOT_ATTR,
          responseAttr,
        },
      }));

      const raw = document.documentElement.getAttribute(responseAttr);
      if (!raw) {
        metrics.durationMs = nowMs() - startedAt;
        return { runtime: null, cache: null, metrics, invalidationReason: 'no_main_response' };
      }

      const parsed = JSON.parse(raw);
      if (!parsed?.metrics) parsed.metrics = metrics;
      if (parsed.metrics.durationMs == null) parsed.metrics.durationMs = nowMs() - startedAt;
      return parsed;
    } catch (err) {
      metrics.durationMs = nowMs() - startedAt;
      return {
        runtime: null,
        cache: null,
        metrics,
        invalidationReason: err?.message || 'bridge_failed',
      };
    } finally {
      try { rootEl.removeAttribute(ROOT_ATTR); } catch (_) {}
      try { document.documentElement.removeAttribute(responseAttr); } catch (_) {}
    }
  }

  if (!MAIN_WORLD) {
    if (window[ISOLATED_WORLD_INIT]) return;
    window[ISOLATED_WORLD_INIT] = true;

    window.__dfkReactRuntime = {
      extractBattleDataFields,
      extractTurnOrderRuntime(rootEl) {
        return requestMainWorldRuntime('turnOrder', rootEl).runtime;
      },
      extractTurnOrderRuntimeCached(rootEl) {
        return requestMainWorldRuntime('turnOrder', rootEl);
      },
      extractCombatantRuntime(rootEl) {
        return requestMainWorldRuntime('combatant', rootEl).runtime;
      },
      extractCombatantRuntimeCached(rootEl) {
        return requestMainWorldRuntime('combatant', rootEl);
      },
      extractTurnOrderRuntimeFromContainer() {
        return null;
      },
      extractCombatantRuntimeFromContainer() {
        return null;
      },
      getReactSeedsFromNode() {
        return [];
      },
    };
    return;
  }

  if (window[MAIN_WORLD_INIT]) return;
  window[MAIN_WORLD_INIT] = true;

  let mainTurnOrderCache = null;
  let mainCombatantCache = null;

  function ownPropertyValues(target) {
    if (!target) return [];
    try {
      return Object.getOwnPropertyNames(target)
        .filter((key) =>
          /^__(reactFiber|reactProps|reactContainer)\$/i.test(key) ||
          key === '_reactRootContainer')
        .map((key) => target[key])
        .filter((value) => value && (typeof value === 'object' || typeof value === 'function'));
    } catch (_) {
      return [];
    }
  }

  function getReactSeedsFromNode(node) {
    const seeds = [];
    const seen = new Set();
    let current = node;
    for (let depth = 0; current && depth < 14; depth += 1) {
      ownPropertyValues(current).forEach((value) => {
        if (seen.has(value)) return;
        seen.add(value);
        seeds.push(value);
      });
      current = current.parentElement;
    }
    return seeds;
  }

  function getTraversalChildren(value) {
    if (!value) return [];
    if (Array.isArray(value)) {
      return value.slice(0, 40).filter((item) => item && (typeof item === 'object' || typeof item === 'function'));
    }
    if (!isObject(value) && typeof value !== 'function') return [];

    const children = [];
    const pushed = new Set();
    const priorityKeys = [
      'memoizedState',
      'memoizedProps',
      'pendingProps',
      'stateNode',
      'return',
      'child',
      'sibling',
      'alternate',
      'dependencies',
      'memoizedValue',
      'baseState',
      'queue',
      'value',
      'data',
      'battleData',
      'combatant',
      'heroState',
      'props',
      'next',
      'selectedTurn',
      'turns',
    ];

    function pushChild(child) {
      if (!child || (typeof child !== 'object' && typeof child !== 'function')) return;
      if (pushed.has(child)) return;
      pushed.add(child);
      children.push(child);
    }

    priorityKeys.forEach((key) => {
      try {
        if (key in value) pushChild(value[key]);
      } catch (_) {}
    });

    let keys = [];
    try {
      keys = Object.getOwnPropertyNames(value).slice(0, 50);
    } catch (_) {
      return children;
    }

    keys.forEach((key) => {
      if (priorityKeys.includes(key)) return;
      if (/^__(react|zone)/i.test(key)) return;
      if (/^(ownerDocument|document|defaultView|parentNode|parentElement|previousSibling|nextSibling|firstChild|lastChild)$/i.test(key)) return;
      try {
        pushChild(value[key]);
      } catch (_) {}
    });

    return children;
  }

  function deepFind(seedValues, predicate, maxNodes = 6000, metrics) {
    const queue = Array.isArray(seedValues) ? [...seedValues] : [seedValues];
    const visited = new Set();
    while (queue.length > 0 && visited.size < maxNodes) {
      const current = queue.shift();
      if (!current || (typeof current !== 'object' && typeof current !== 'function')) continue;
      if (visited.has(current)) continue;
      visited.add(current);

      let matched = false;
      try {
        matched = !!predicate(current);
      } catch (_) {}
      if (matched) {
        if (metrics) metrics.visitedNodes = visited.size;
        return current;
      }

      getTraversalChildren(current).forEach((child) => {
        if (!visited.has(child)) queue.push(child);
      });
    }
    if (metrics) metrics.visitedNodes = visited.size;
    return null;
  }

  function uniqueNodeCandidates(candidates) {
    const unique = [];
    const seen = new Set();
    candidates.forEach(({ node, source }) => {
      if (!node || seen.has(node)) return;
      seen.add(node);
      unique.push({ node, source });
    });
    return unique;
  }

  function collectTurnOrderCandidates(rootEl) {
    const candidates = [{ node: rootEl, source: 'root' }];
    const heading = rootEl?.querySelector?.('h1,h2,h3,h4,div,p,span');
    if (heading && /turn order/i.test((heading.textContent || '').trim())) {
      candidates.push({ node: heading, source: 'heading' });
    }
    const modalRoot = rootEl?.closest?.('[role="dialog"], .modal-blocker, [class*="modal"], [class*="dialog"]');
    if (modalRoot) candidates.push({ node: modalRoot, source: 'dialog_root' });
    let current = rootEl?.parentElement || null;
    for (let depth = 0; current && depth < 6; depth += 1) {
      candidates.push({ node: current, source: depth === 0 ? 'ancestor' : `ancestor_${depth}` });
      current = current.parentElement;
    }
    return uniqueNodeCandidates(candidates);
  }

  function getRequestRoot(detail) {
    const requestId = detail?.requestId || null;
    const rootAttr = detail?.rootAttr || ROOT_ATTR;
    if (!requestId) return null;
    const escapedId = typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
      ? CSS.escape(requestId)
      : requestId.replace(/"/g, '\\"');
    return document.querySelector(`[${rootAttr}="${escapedId}"]`);
  }

  function isTurnOrderContainer(candidate) {
    if (!candidate || !isObject(candidate)) return false;
    if (candidate.type === 'TurnOrder' && Array.isArray(candidate.data?.turns)) return true;
    if (candidate.isOpen === true && Array.isArray(candidate.data?.turns)) return true;
    return false;
  }

  function extractTurnOrderRuntimeFromContainer(container, metrics) {
    if (!isTurnOrderContainer(container)) return null;
    const turns = Array.isArray(container.data?.turns)
      ? container.data.turns.map(simplifyTurnEntry).filter(Boolean)
      : [];
    const selectedTurn = container.data?.selectedTurn ? simplifyTurnEntry(container.data.selectedTurn) : null;
    const battleData = extractBattleDataFields(container.data?.battleData);
    return {
      type: container.type || 'TurnOrder',
      isOpen: container.isOpen !== false,
      turns,
      selectedTurn,
      battleData,
      metrics: metrics || createRuntimeMetrics(),
    };
  }

  function extractTurnOrderRuntimeCached(rootEl, previousCache) {
    const startedAt = nowMs();
    const metrics = createRuntimeMetrics();
    let invalidationReason = null;
    let container = null;

    if (!rootEl) {
      metrics.durationMs = nowMs() - startedAt;
      return { runtime: null, cache: null, metrics, invalidationReason: 'no_root' };
    }

    if (previousCache?.rootEl && previousCache.rootEl !== rootEl) {
      invalidationReason = 'root_changed';
    }

    if (previousCache?.containerRef && previousCache.rootEl === rootEl && isTurnOrderContainer(previousCache.containerRef)) {
      container = previousCache.containerRef;
      metrics.cacheHit = true;
      metrics.usedContainerRef = true;
      metrics.anchorSource = 'cached_container';
    }

    if (!container) {
      const candidates = collectTurnOrderCandidates(rootEl);
      for (const candidate of candidates) {
        const seeds = getReactSeedsFromNode(candidate.node);
        if (seeds.length === 0) continue;
        metrics.usedDeepFind = true;
        metrics.seedCount = Math.max(metrics.seedCount, seeds.length);
        metrics.anchorSource = candidate.source;
        container = deepFind(seeds, isTurnOrderContainer, 7000, metrics);
        if (container) break;
      }
      if (!container && !invalidationReason) {
        invalidationReason = metrics.seedCount > 0 ? 'container_not_found' : 'no_react_seeds';
      }
    }

    const runtime = extractTurnOrderRuntimeFromContainer(container, metrics);
    if (!runtime || !Array.isArray(runtime.turns) || runtime.turns.length === 0) {
      metrics.durationMs = nowMs() - startedAt;
      return {
        runtime: null,
        cache: null,
        metrics,
        invalidationReason: invalidationReason || 'empty_turns',
      };
    }

    const turnsSignature = runtime.turns.map(buildTurnEntryKey).join('|');
    const selectedTurnKey = buildSelectedTurnKey(runtime.selectedTurn);
    const battleDataSignature = buildBattleDataSignature(runtime.battleData);
    const previousAgeMs = previousCache?.capturedAt ? Date.now() - previousCache.capturedAt : null;
    if (!invalidationReason && previousCache) {
      if (previousCache.turnsSignature && previousCache.turnsSignature !== turnsSignature) invalidationReason = 'turns_changed';
      else if (previousCache.selectedTurnKey && previousCache.selectedTurnKey !== selectedTurnKey) invalidationReason = 'selected_turn_changed';
      else if (previousCache.battleDataSignature && previousCache.battleDataSignature !== battleDataSignature) invalidationReason = 'battle_data_changed';
      else if (previousAgeMs != null && previousAgeMs > RUNTIME_CACHE_TTL_MS) invalidationReason = 'cache_expired';
    }

    metrics.durationMs = nowMs() - startedAt;
    const cache = {
      rootEl,
      containerRef: container,
      capturedAt: Date.now(),
      selectedTurnKey,
      turnsSignature,
      battleDataSignature,
      entries: runtime.turns,
      battleData: runtime.battleData,
    };
    return {
      runtime: {
        ...runtime,
        metrics,
      },
      cache,
      metrics,
      invalidationReason,
    };
  }

  function isCombatantContainer(candidate) {
    if (!candidate || !isObject(candidate)) return false;
    const baseCombatant = candidate.baseCombatant || candidate.heroState?.baseCombatant || null;
    const attackConfigs = candidate.attackConfigs || [];
    return isObject(baseCombatant) && Array.isArray(attackConfigs) && attackConfigs.length > 0;
  }

  function extractCombatantRuntimeFromContainer(combatant, metrics) {
    if (!isCombatantContainer(combatant)) return null;
    const heroState = combatant.heroState || {};
    return {
      baseCombatant: simplifyBaseCombatant(combatant.baseCombatant || heroState.baseCombatant),
      currentLocation: {
        side: toNumber(combatant.currentLocation?.side ?? heroState.currentLocation?.side),
        slot: toNumber(combatant.currentLocation?.slot ?? heroState.currentLocation?.slot),
      },
      health: toNumber(combatant.health),
      mana: toNumber(combatant.mana),
      attackConfigs: Array.isArray(combatant.attackConfigs)
        ? combatant.attackConfigs.map(simplifyAttackConfig).filter(Boolean)
        : [],
      comboTrackers: Array.isArray(heroState.comboTrackers)
        ? heroState.comboTrackers.map(simplifyComboTracker).filter(Boolean)
        : [],
      durationTracker: simplifyDurationTracker(heroState.durationTracker || combatant.durationTracker),
      passiveTrackers: Array.isArray(heroState.passiveTrackers)
        ? heroState.passiveTrackers.map(simplifyPassiveTracker).filter(Boolean)
        : [],
      weaponConfigs: Array.isArray(combatant.weaponConfigs)
        ? combatant.weaponConfigs.map(simplifyEquipmentConfig).filter(Boolean)
        : [],
      armorConfigs: Array.isArray(combatant.armorConfigs)
        ? combatant.armorConfigs.map(simplifyEquipmentConfig).filter(Boolean)
        : [],
      combatantAccessory: simplifyEquipmentConfig(combatant.combatantAccessory),
      combatantOffhands: Array.isArray(combatant.combatantOffhands)
        ? combatant.combatantOffhands.map(simplifyEquipmentConfig).filter(Boolean)
        : [],
      battleData: extractBattleDataFields(combatant.battleData || null),
      metrics: metrics || createRuntimeMetrics(),
    };
  }

  function extractCombatantRuntimeCached(rootEl, previousCache) {
    const startedAt = nowMs();
    const metrics = createRuntimeMetrics();
    let invalidationReason = null;
    let container = null;

    if (!rootEl) {
      metrics.durationMs = nowMs() - startedAt;
      return { runtime: null, cache: null, metrics, invalidationReason: 'no_root' };
    }

    if (previousCache?.rootEl && previousCache.rootEl !== rootEl) {
      invalidationReason = 'root_changed';
    }

    if (previousCache?.containerRef && previousCache.rootEl === rootEl && isCombatantContainer(previousCache.containerRef)) {
      container = previousCache.containerRef;
      metrics.cacheHit = true;
      metrics.usedContainerRef = true;
      metrics.anchorSource = 'cached_container';
    }

    if (!container) {
      const seeds = getReactSeedsFromNode(rootEl);
      if (seeds.length > 0) {
        metrics.usedDeepFind = true;
        metrics.seedCount = seeds.length;
        metrics.anchorSource = 'root';
        container = deepFind(seeds, isCombatantContainer, 9000, metrics);
      }
      if (!container && !invalidationReason) {
        invalidationReason = seeds.length > 0 ? 'container_not_found' : 'no_react_seeds';
      }
    }

    const runtime = extractCombatantRuntimeFromContainer(container, metrics);
    if (!runtime || !runtime.baseCombatant) {
      metrics.durationMs = nowMs() - startedAt;
      return {
        runtime: null,
        cache: null,
        metrics,
        invalidationReason: invalidationReason || 'empty_combatant',
      };
    }

    const combatantKey = buildCombatantKey(runtime);
    const previousAgeMs = previousCache?.capturedAt ? Date.now() - previousCache.capturedAt : null;
    if (!invalidationReason && previousCache) {
      if (previousCache.combatantKey && previousCache.combatantKey !== combatantKey) invalidationReason = 'combatant_changed';
      else if (previousAgeMs != null && previousAgeMs > RUNTIME_CACHE_TTL_MS) invalidationReason = 'cache_expired';
    }

    metrics.durationMs = nowMs() - startedAt;
    const cache = {
      rootEl,
      containerRef: container,
      capturedAt: Date.now(),
      combatantKey,
      result: runtime,
    };
    return {
      runtime: {
        ...runtime,
        combatantKey,
        metrics,
      },
      cache,
      metrics,
      invalidationReason,
    };
  }

  document.addEventListener(REQUEST_EVENT, (event) => {
    const detail = event.detail || {};
    const rootEl = getRequestRoot(detail);
    const responseAttr = detail.responseAttr || null;
    if (!responseAttr || !document?.documentElement) return;

    let payload = null;
    if (detail.kind === 'turnOrder') {
      const result = extractTurnOrderRuntimeCached(rootEl, mainTurnOrderCache);
      if (result?.cache?.containerRef) {
        mainTurnOrderCache = result.cache;
      } else if (result?.invalidationReason === 'root_changed') {
        mainTurnOrderCache = null;
      }
      payload = serializeResult(result);
    } else if (detail.kind === 'combatant') {
      const result = extractCombatantRuntimeCached(rootEl, mainCombatantCache);
      if (result?.cache?.containerRef) {
        mainCombatantCache = result.cache;
      } else if (result?.invalidationReason === 'root_changed') {
        mainCombatantCache = null;
      }
      payload = serializeResult(result);
    }

    if (!payload) {
      payload = {
        runtime: null,
        cache: null,
        metrics: createRuntimeMetrics(),
        invalidationReason: 'unknown_kind',
      };
    }

    try {
      document.documentElement.setAttribute(responseAttr, JSON.stringify(payload));
    } catch (_) {}
  }, true);

  window.__dfkReactRuntime = {
    extractBattleDataFields,
    extractTurnOrderRuntime(rootEl) {
      return extractTurnOrderRuntimeCached(rootEl, mainTurnOrderCache).runtime;
    },
    extractTurnOrderRuntimeCached(rootEl, previousCache) {
      const result = extractTurnOrderRuntimeCached(rootEl, previousCache || mainTurnOrderCache);
      if (result?.cache?.containerRef) mainTurnOrderCache = result.cache;
      return result;
    },
    extractTurnOrderRuntimeFromContainer,
    extractCombatantRuntime(rootEl) {
      return extractCombatantRuntimeCached(rootEl, mainCombatantCache).runtime;
    },
    extractCombatantRuntimeCached(rootEl, previousCache) {
      const result = extractCombatantRuntimeCached(rootEl, previousCache || mainCombatantCache);
      if (result?.cache?.containerRef) mainCombatantCache = result.cache;
      return result;
    },
    extractCombatantRuntimeFromContainer,
    getReactSeedsFromNode,
  };
})();
