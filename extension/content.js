/**
 * DFK Hunt Companion — Content Script
 * Entry point injected into game.defikingdoms.com.
 * Initializes the event emission bridge and coordinates parser modules.
 * Calls local engine for recommendations after each turn snapshot.
 *
 * Session ID detection strategy:
 *   1. URL pattern matching
 *   2. DOM heading/title scan
 *   3. SPA route change hooks (pushState + popstate + polling)
 *   4. Synthetic key from first turn event team composition (fallback)
 */

(function () {
  console.log('[DFK Companion] Content script loading on', window.location.href);
  if (window.__dfkCompanionInit) { console.log('[DFK Companion] Already initialized, skipping'); return; }
  window.__dfkCompanionInit = true;

  let debugMode = false;
  let sessionHuntId = null;
  let turnEventBuffer = [];
  const DEDUP_WINDOW_MS = 500;
  const recentEvents = [];
  let engineReady = false;
  let lastRecommendation = null;
  let unitSnapshotCache = [];
  let syntheticKeyGenerated = false;
  const COMBAT_FRAME_VERSION = 1;
  let extensionContextStale = false;

  window.__dfkSessionId = null;
  window.__dfkSessionIdSource = null;
  window.__dfkLastRecommendation = null;

  function isDuplicate(event) {
    const now = Date.now();
    const sig = JSON.stringify({ type: event.type, turn: event.turn, actor: event.actor, ability: event.ability, damage: event.damage });
    const cutoff = now - DEDUP_WINDOW_MS;
    for (let i = recentEvents.length - 1; i >= 0; i--) {
      if (recentEvents[i].ts < cutoff) break;
      if (recentEvents[i].sig === sig) return true;
    }
    recentEvents.push({ ts: now, sig });
    if (recentEvents.length > 50) recentEvents.shift();
    return false;
  }

  window.__dfkDebugMode = false;

  window.__dfkBattleLogNetworkActive = false;
  window.__dfkNetworkLogCache = null;

  function isInvalidRuntimeError(err) {
    const text = String(err?.message || err || '');
    return /Extension context invalidated|context invalidated|Receiving end does not exist/i.test(text);
  }

  function markExtensionContextStale(reason) {
    if (extensionContextStale) return;
    extensionContextStale = true;
    window.__dfkExtensionContextStale = true;
    console.warn('[DFK Companion] Extension context stale:', reason || 'unknown');
    if (typeof window.__dfkUpdateDiagBar === 'function') {
      window.__dfkUpdateDiagBar('[EXT STALE WARN] Refresh DFK tab');
    }
    const body = document.getElementById('dfk-engine-body');
    if (body) {
      body.innerHTML = '<div style="color:#d8a05b;">Extension reloaded. Refresh this DFK tab to resume live capture.</div>';
    }
  }

  function runtimeReady() {
    return !extensionContextStale && !!(chrome?.runtime?.id);
  }

  function safeSendRuntimeMessage(message) {
    if (!runtimeReady()) return Promise.resolve(false);
    try {
      const result = chrome.runtime.sendMessage(message);
      if (result && typeof result.catch === 'function') {
        return result.then(() => true).catch((err) => {
          if (isInvalidRuntimeError(err)) {
            markExtensionContextStale(err.message || err);
          }
          return false;
        });
      }
      return Promise.resolve(true);
    } catch (err) {
      if (isInvalidRuntimeError(err)) {
        markExtensionContextStale(err.message || err);
      }
      return Promise.resolve(false);
    }
  }

  function safeStorageGet(keys, callback) {
    if (!runtimeReady() || !chrome?.storage?.local?.get) {
      callback({});
      return;
    }
    try {
      chrome.storage.local.get(keys, (result) => {
        if (chrome.runtime?.lastError) {
          if (isInvalidRuntimeError(chrome.runtime.lastError.message || chrome.runtime.lastError)) {
            markExtensionContextStale(chrome.runtime.lastError.message);
          }
          callback({});
          return;
        }
        callback(result || {});
      });
    } catch (err) {
      if (isInvalidRuntimeError(err)) {
        markExtensionContextStale(err.message || err);
      }
      callback({});
    }
  }

  document.addEventListener('dfk-network-event', function (e) {
    var data = e.detail;
    if (data && data.source === 'network') {
      window.__dfkEmitEvent('battle_log_event', data);
    }
  });

  document.addEventListener('dfk-network-log-response', function (e) {
    window.__dfkNetworkLogCache = e.detail;
    safeSendRuntimeMessage({ type: 'network_diag', data: e.detail });
  });

  window.__dfkEmitEvent = function (type, data) {
    const payload = { ...data, _contentScriptTs: Date.now() };
    if (extensionContextStale) return;

    if (type === 'battle_log_event') {
      if (data.source === 'network' && !window.__dfkBattleLogNetworkActive) {
        window.__dfkBattleLogNetworkActive = true;
        console.log('[DFK] Network source active — DOM parser suppressed for this session');
      }
      if (isDuplicate(data)) return;
      if (debugMode) storeLocally(payload);
      turnEventBuffer.push(payload);
      flushTurnEvent(payload);
      maybeBuildSyntheticSessionId();
    } else if (type === 'turn_snapshot') {
      if (debugMode) storeLocally(payload);
      payload.combatFrame = buildCombatFrame(payload, payload.source || 'dom', null);
      safeSendRuntimeMessage({ type: 'state_snapshot', data: payload });
      runLocalRecommendation(payload);
    } else if (type === 'unit_snapshot') {
      if (debugMode) storeLocally(payload);
      safeSendRuntimeMessage({ type: 'unit_snapshot', data: payload });
      cacheUnitSnapshot(payload);
    }
  };

  function cacheUnitSnapshot(snapshot) {
    const existing = unitSnapshotCache.findIndex(
      u => u.unitName === snapshot.unitName && u.unitSide === snapshot.unitSide
    );
    if (existing >= 0) {
      unitSnapshotCache[existing] = snapshot;
    } else {
      unitSnapshotCache.push(snapshot);
      if (unitSnapshotCache.length > 20) unitSnapshotCache.shift();
    }
  }

  function normalizeId(value) {
    return String(value || 'unknown')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'unknown';
  }

  function buildUnitId(side, slot, name) {
    return `${side}:${slot == null ? 'na' : slot}:${normalizeId(name)}`;
  }

  function toStatusInstances(values, category) {
    return (values || []).map((value) => {
      const raw = typeof value === 'object' && value !== null
        ? String(value.sourceText || value.name || value.id || '').trim()
        : String(value || '').trim();
      const stackMatch = raw.match(/(?:x|stack(?:s)?\s*:?\s*)(\d+)/i);
      const turnMatch = raw.match(/(\d+)\s*(?:turn|tick)/i);
      const cleanName = raw
        .replace(/(?:x|stack(?:s)?\s*:?\s*)\d+/gi, '')
        .replace(/\d+\s*(?:turn|tick)s?/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
      return {
        id: normalizeId(cleanName || raw || category),
        name: cleanName || raw || category,
        category,
        stacks: stackMatch ? parseInt(stackMatch[1], 10) : null,
        durationTurns: turnMatch ? parseInt(turnMatch[1], 10) : null,
        iconUrl: typeof value === 'object' && value !== null ? (value.iconUrl || null) : null,
        sourceText: raw || null,
        tooltipTitle: typeof value === 'object' && value !== null ? (value.tooltipTitle || null) : null,
        tooltipSubtitle: typeof value === 'object' && value !== null ? (value.tooltipSubtitle || null) : null,
        tooltipBullets: typeof value === 'object' && value !== null && Array.isArray(value.tooltipBullets)
          ? value.tooltipBullets.map((line) => String(line || '').trim()).filter(Boolean)
          : [],
        tooltipNote: typeof value === 'object' && value !== null ? (value.tooltipNote || null) : null,
        dispellable: typeof value === 'object' && value !== null && typeof value.dispellable === 'boolean'
          ? value.dispellable
          : null,
        amnesiaAbilityName: typeof value === 'object' && value !== null ? (value.amnesiaAbilityName || null) : null,
        amnesiaTurns: typeof value === 'object' && value !== null && Number.isFinite(Number(value.amnesiaTurns))
          ? Number(value.amnesiaTurns)
          : null,
      };
    }).filter((status) => !!status.name);
  }

  function latestHeroDetailSnapshot() {
    for (let i = unitSnapshotCache.length - 1; i >= 0; i--) {
      if (unitSnapshotCache[i]?.heroDetail) return unitSnapshotCache[i].heroDetail;
    }
    return null;
  }

  function captureVisibleHeroPortraits() {
    const portraits = new Map();
    Array.from(document.querySelectorAll('img[src*="heroes.defikingdoms.com/image/"]')).forEach((img) => {
      const src = img.currentSrc || img.src || '';
      const match = String(src).match(/\/image\/[^/]+\/(\d+)(?:[/?#]|$)/i);
      if (!match) return;
      portraits.set(match[1], src);
    });
    return portraits;
  }

  function captureVisibleHeroPortraitList() {
    const seen = new Set();
    const portraits = [];
    Array.from(document.querySelectorAll('img[src*="heroes.defikingdoms.com/image/"]')).forEach((img) => {
      const src = img.currentSrc || img.src || '';
      const match = String(src).match(/\/image\/[^/]+\/(\d+)(?:[/?#]|$)/i);
      if (!match) return;
      const heroId = match[1];
      if (seen.has(heroId)) return;
      seen.add(heroId);
      portraits.push({ heroId, src });
    });
    return portraits;
  }

  function captureVisibleEnemyPortraits() {
    const portraits = new Map();
    Array.from(document.querySelectorAll('img[src*="/assets/avatars/"]')).forEach((img) => {
      const src = img.currentSrc || img.src || '';
      if (/baby_boar_portrait_2\.png/i.test(src)) {
        portraits.set('baby_boar_2', src);
      } else if (/baby_boar_portrait\.png/i.test(src)) {
        portraits.set('baby_boar_1', src);
      } else if (/mama_boar_portrait\.png/i.test(src)) {
        portraits.set('big_boar', src);
      }
    });
    return portraits;
  }

  function buildCombatants(turnState) {
    const modalSnapshots = new Map();
    unitSnapshotCache.forEach((snapshot) => {
      const key = `${snapshot.unitSide || 'player'}:${normalizeId(snapshot.unitName)}`;
      modalSnapshots.set(key, snapshot);
    });
    const profiles = (((typeof window !== 'undefined' && window.__dfkHeroProfiles) || [])).map((profile, index) => ({
      ...profile,
      _index: index,
      _heroId: String(profile?.heroId || profile?.id || '').trim(),
      _nameKey: normalizeId(profile?.unitName || profile?.name || profile?.displayName || ''),
      _slot: Number.isFinite(Number(profile?.slot)) ? Number(profile.slot) : index,
    }));
    const profileBySlot = new Map();
    profiles.forEach((profile) => {
      profileBySlot.set(profile._slot, profile);
    });
    const heroPortraits = captureVisibleHeroPortraits();
    const orderedHeroPortraits = captureVisibleHeroPortraitList();
    const enemyPortraits = captureVisibleEnemyPortraits();

    const resolvePlayerProfile = (unit, ordinal) => {
      const normalizedUnitName = normalizeId(unit?.name);
      const byName = normalizedUnitName
        ? profiles.find((profile) => profile._nameKey && profile._nameKey === normalizedUnitName)
        : null;
      if (byName) return byName;
      const bySlot = profileBySlot.get(unit?.slot ?? null);
      if (bySlot) return bySlot;
      return profiles[ordinal] || null;
    };

    const buildCombatant = (unit, side, ordinal = 0) => {
      const key = `${side}:${normalizeId(unit.name)}`;
      const modal = modalSnapshots.get(key);
      const profile = side === 'player' ? resolvePlayerProfile(unit, ordinal) : null;
      const portraitHeroId = String(profile?._heroId || profile?.heroId || '');
      const orderedPortrait = side === 'player' ? (orderedHeroPortraits[ordinal]?.src || null) : null;
      const heroPortrait = side === 'player'
        ? (heroPortraits.get(portraitHeroId) || orderedPortrait)
        : null;
      const enemyPortrait = side === 'enemy' ? enemyPortraits.get(normalizeId(unit.name)) : null;
      const buffs = toStatusInstances([...(unit.buffs || []), ...(modal?.buffs || [])], 'buff');
      const debuffs = toStatusInstances([...(unit.debuffs || []), ...(modal?.debuffs || [])], 'debuff');
      const name = unit.name || modal?.unitName || `${side}-${unit.slot}`;
      return {
        unitId: buildUnitId(side, unit.slot, name),
        side,
        slot: unit.slot ?? null,
        name,
        normalizedId: normalizeId(name),
        iconUrl: unit.iconUrl || modal?.iconUrl || heroPortrait || enemyPortrait || null,
        heroClass: side === 'player' ? (profile?.mainClass || modal?.heroDetail?.heroClass || null) : null,
        heroId: side === 'player' ? (portraitHeroId || null) : null,
        currentHp: unit.hp ?? modal?.stats?.hp ?? null,
        maxHp: unit.maxHp ?? modal?.stats?.maxHp ?? null,
        currentMp: unit.mp ?? modal?.stats?.mp ?? null,
        maxMp: unit.maxMp ?? modal?.stats?.maxMp ?? null,
        isAlive: (unit.hp ?? modal?.stats?.hp ?? 1) > 0,
        buffs,
        debuffs,
        visibleEffects: [...buffs, ...debuffs],
        equipment: {
          primaryArms: modal?.items?.slice(0, 2) || [],
          secondaryArms: modal?.items?.slice(2, 4) || [],
          items: modal?.items || [],
        },
        stats: { ...(modal?.baseStats || {}), ...(modal?.stats || {}) },
        resistances: modal?.heroDetail?.resistances || {},
        heroDetail: modal?.heroDetail || null,
        sourceConfidence: modal ? Math.max(modal.parseConfidence || 0, 0.7) : 0.55,
      };
    };

    return [
      ...(turnState.heroes || []).map((unit, index) => buildCombatant(unit, 'player', index)),
      ...(turnState.enemies || []).map((unit, index) => buildCombatant(unit, 'enemy', index)),
    ];
  }

  function buildBattleLogEntry(event) {
    const outcomes = [];
    const rawText = event.rawText || '';
    if (/critical strike/i.test(rawText)) outcomes.push('critical');
    if (/resisted/i.test(rawText)) outcomes.push('resisted');
    if (/block/i.test(rawText)) outcomes.push('blocked');
    if (/miss/i.test(rawText)) outcomes.push('miss');
    return {
      turnNumber: event.turn || 0,
      actorName: event.actor || null,
      actorSide: event.actorSide === 'enemy' ? 'enemy' : event.actorSide === 'player' ? 'player' : null,
      actorSlot: null,
      ability: event.ability || null,
      actionType: event.ability ? 'ability' : 'unknown',
      targetName: event.target || null,
      targetSide: event.targetSide === 'player' ? 'player' : 'enemy',
      targetSlot: null,
      targets: event.target ? [{
        name: event.target,
        side: event.targetSide === 'player' ? 'player' : 'enemy',
        damage: event.damage ?? null,
        statusesApplied: toStatusInstances(event.effects || [], 'debuff'),
      }] : [],
      damageType: event.damageType || null,
      manaDelta: event.manaDelta ?? null,
      statusApplications: toStatusInstances(event.effects || [], 'debuff'),
      outcomes,
      rawText,
      sourceConfidence: event.parseConfidence || 0.5,
    };
  }

  function buildCombatFrame(turnState, source, battleLogEntry) {
    const combatants = buildCombatants(turnState);
    const activePlayerBySlot = combatants.find((unit) => unit.side === 'player' && unit.slot === turnState.activeHeroSlot);
    const activePlayerByName = !activePlayerBySlot
      ? combatants.find((unit) => unit.side === 'player' && normalizeId(unit.name) === normalizeId(turnState.activeUnit))
      : null;
    const resolvedActivePlayer = activePlayerBySlot || activePlayerByName || null;
    const activeSide = resolvedActivePlayer ? 'player' : null;
    const selectedTargetUnit = combatants.find((unit) => unit.name === turnState.selectedTarget);
    const heroDetail = latestHeroDetailSnapshot();
    const legalActions = (turnState.legalActions || []).map((action) => ({
      name: action.name,
      skillId: action.skillId || null,
      type: action.type || (String(action.name || '').toLowerCase().includes('attack') ? 'basic_attack' : 'skill'),
      group: action.group || null,
      available: action.available !== false,
      requiresTarget: action.requiresTarget !== false,
      sourceConfidence: action.sourceConfidence || 0.75,
      iconUrl: action.iconUrl || null,
    }));
    const legalConsumables = (turnState.legalConsumables || []).map((action) => ({
      ...action,
      type: 'consumable',
      available: action.available !== false,
      sourceConfidence: action.sourceConfidence || 0.6,
      iconUrl: action.iconUrl || null,
    }));
    return {
      version: COMBAT_FRAME_VERSION,
      turnNumber: turnState.turnNumber || 0,
      encounterType: combatants.some((unit) => unit.side === 'enemy' && unit.normalizedId.includes('boar')) ? 'boar_hunt' : null,
      combatants,
      activeTurn: {
        activeUnitId: resolvedActivePlayer?.unitId || (activeSide ? buildUnitId(activeSide, turnState.activeHeroSlot, turnState.activeUnit) : null),
        activeSide,
        activeSlot: resolvedActivePlayer?.slot ?? turnState.activeHeroSlot ?? null,
        selectedTargetId: selectedTargetUnit?.unitId || null,
        selectedTargetSide: selectedTargetUnit?.side || turnState.selectedTargetSide || null,
        legalActions,
        legalConsumables,
        visibleLockouts: {},
        battleBudgetRemaining: turnState.battleBudgetRemaining ?? null,
      },
      turnOrder: turnState.turnOrder || [],
      battleLogEntries: battleLogEntry ? [battleLogEntry] : [],
      heroDetail: heroDetail ? {
        unitId: heroDetail.name ? buildUnitId('player', turnState.activeHeroSlot, heroDetail.name) : null,
        ...heroDetail,
      } : null,
      captureMeta: {
        version: COMBAT_FRAME_VERSION,
        huntId: sessionHuntId,
        sessionToken: null,
        source: source || 'dom',
        capturedAt: Date.now(),
        parserVersion: `extension/${COMBAT_FRAME_VERSION}`,
        confidence: {
          combatants: combatants.length > 0 ? 0.75 : 0.2,
          activeTurn: legalActions.length > 0 ? 0.8 : 0.4,
          turnOrder: (turnState.turnOrder || []).length > 0 ? 0.8 : 0.1,
          heroDetail: heroDetail ? 0.85 : 0.1,
        },
      },
    };
  }

  function runLocalRecommendation(turnSnapshot) {
    if (!engineReady) return;
    if (!window.__dfkGetRecommendation) return;
    if (!turnSnapshot?.activeUnit || turnSnapshot.activeHeroSlot == null) {
      updateOverlayEngineStatus(true, 'Waiting for active hero/action panel...');
      return;
    }
    if ((!turnSnapshot.legalActions || turnSnapshot.legalActions.length === 0) &&
        (!turnSnapshot.legalConsumables || turnSnapshot.legalConsumables.length === 0)) {
      updateOverlayEngineStatus(true, 'Waiting for legal actions from command panel...');
      return;
    }

    try {
      const result = window.__dfkGetRecommendation(turnSnapshot, unitSnapshotCache);
      lastRecommendation = result;
      window.__dfkLastRecommendation = result;
      console.log('[DFK Engine] Recommendation:', result);
      updateOverlay(result);
    } catch (err) {
      console.error('[DFK Engine] Recommendation error:', err);
    }
  }

  async function initEngine() {
    if (window.__dfkDataLoader) {
      try {
        await window.__dfkDataLoader.loadAllData();
        if (window.__dfkDataLoader.isLoaded()) {
          engineReady = true;
          console.log('[DFK Engine] Engine initialized successfully');
          updateOverlayEngineStatus(true);
        } else {
          console.error('[DFK Engine] Data loader reports not loaded after loadAllData');
          updateOverlayEngineStatus(false, 'Data loader failed');
        }
      } catch (err) {
        console.error('[DFK Engine] Failed to initialize engine:', err);
        updateOverlayEngineStatus(false, err.message);
      }
    } else {
      console.warn('[DFK Engine] Data loader not available');
      updateOverlayEngineStatus(false, 'Data loader not found');
    }
  }

  function updateOverlayEngineStatus(ready, errorMsg) {
    const bodyEl = document.getElementById('dfk-engine-body');
    if (!bodyEl) return;
    if (ready) {
      bodyEl.innerHTML = `<div style="color: #4a6a55;">${escapeHtml(errorMsg || 'Engine ready. Waiting for combat data...')}</div>`;
    } else {
      bodyEl.innerHTML = `<div style="color: #997744;">Engine: ${errorMsg || 'not ready'} (parsers still active)</div>`;
    }
  }

  // ── Hunt / Session ID detection ───────────────────────────────────────────

  function detectFromUrl(url) {
    const m = url.match(/hunt[_-]?id[=:/]([\w-]+)/i) ||
              url.match(/huntId=([\w-]+)/i) ||
              url.match(/\/hunt\/([\w-]+)/i) ||
              url.match(/\/battle\/([\w-]+)/i) ||
              url.match(/\/combat\/([\w-]+)/i) ||
              url.match(/\/pve\/([\w-]+)/i) ||
              url.match(/\/void-hunt/i);
    if (m) {
      const raw = m[1] || 'void-hunt';
      const heroIds = extractHeroIdsFromSegment(raw);
      return { id: raw, source: 'url', heroIds };
    }
    if (/game\.defikingdoms\.com/i.test(url)) {
      const hash = url.split('#')[1];
      if (hash) {
        const hm = hash.match(/hunt|battle|combat|pve/i);
        if (hm) return { id: hash.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 20) || 'hash-session', source: 'url-hash', heroIds: [] };
      }
    }
    return null;
  }

  function extractHeroIdsFromSegment(segment) {
    if (!segment) return [];
    if (/^\d+-\d+$/.test(segment)) return [];
    const parts = segment.split('-').filter(p => /^\d+$/.test(p) && p.length >= 3);
    return parts;
  }

  function detectWalletFromPage() {
    const el = document.querySelector('[data-wallet],[data-address],[class*="wallet-address"],[class*="walletAddress"]');
    if (el) {
      const addr = el.getAttribute('data-wallet') || el.getAttribute('data-address') || el.textContent.trim();
      if (/^0x[a-fA-F0-9]{40}$/.test(addr)) return addr;
    }
    const allText = document.querySelectorAll('span,div,p');
    for (const node of allText) {
      const text = node.textContent.trim();
      if (/^0x[a-fA-F0-9]{40}$/.test(text)) return text;
    }
    return null;
  }

  function detectFromDom() {
    const el = document.querySelector('[data-hunt-id],[data-battle-id],[data-session-id]');
    if (el) {
      const id = el.getAttribute('data-hunt-id') || el.getAttribute('data-battle-id') || el.getAttribute('data-session-id');
      if (id) return { id, source: 'dom-attr' };
    }
    const headings = document.querySelectorAll('h1,h2,h3,[class*="title"],[class*="heading"],[class*="encounter"],[class*="battle-name"]');
    for (const h of headings) {
      const m = h.textContent.match(/hunt\s+#?(\w+)|encounter\s+#?(\w+)|battle\s+#?(\w+)/i);
      if (m) return { id: m[1] || m[2] || m[3], source: 'dom-heading' };
    }
    const titleMatch = document.title.match(/Hunt #?(\w+)|Battle #?(\w+)/i);
    if (titleMatch) return { id: titleMatch[1] || titleMatch[2], source: 'page-title' };
    const combatUI = document.querySelector('.hero-abilities,.mana-bar,.custom-progress-bar');
    if (combatUI) {
      const ts = Date.now().toString(36).slice(-6);
      return { id: `dfk-combat-${ts}`, source: 'dom-combat-ui' };
    }
    return null;
  }

  function applySessionId(detection) {
    if (!detection) return;
    const { id, source, heroIds } = detection;
    if (id && id !== sessionHuntId) {
      sessionHuntId = id;
      window.__dfkSessionId = id;
      window.__dfkSessionIdSource = source;
      console.log(`[DFK] Session ID detected: ${id} (${source})`);

      const wallet = detectWalletFromPage();
      const msg = { type: 'hunt_id_detected', huntId: id, source };
      if (heroIds && heroIds.length > 0) msg.heroIds = heroIds;
      if (wallet) msg.wallet = wallet;
      safeSendRuntimeMessage(msg);
    }
  }

  window.__dfkDetectSession = function () {
    const url = window.location.href;
    applySessionId(detectFromUrl(url) || detectFromDom());
  };

  // Synthetic key from team composition — fires after first two battle log events
  function maybeBuildSyntheticSessionId() {
    if (syntheticKeyGenerated || sessionHuntId) return;
    if (turnEventBuffer.length < 1) return;

    const ts = window.__dfkGetTurnState ? window.__dfkGetTurnState() : {};
    const heroes = ts.heroes || [];
    const enemies = ts.enemies || [];
    const actors = turnEventBuffer.slice(0, 5).map(e => e.actor || '?');

    const heroKey = actors.slice(0, 3).map(n => n[0] || '?').join('');
    const enemyKey = (enemies.slice(0, 2).map(e => (e.name || 'E').slice(0, 3))).join('-') || 'unk';
    const tsBucket = Math.floor(Date.now() / 60000);
    const synKey = `syn-${heroKey}-${enemyKey}-${tsBucket}`;

    syntheticKeyGenerated = true;
    sessionHuntId = synKey;
    window.__dfkSessionId = synKey;
    window.__dfkSessionIdSource = 'synthetic';
    console.log('[DFK] Synthetic session ID generated:', synKey);
    safeSendRuntimeMessage({ type: 'hunt_id_detected', huntId: synKey, source: 'synthetic' });
  }

  // ── SPA route change hooks ────────────────────────────────────────────────

  function installSpaHooks() {
    try {
      const origPushState = history.pushState.bind(history);
      history.pushState = function (...args) {
        origPushState(...args);
        window.__dfkDetectSession();
      };
      const origReplaceState = history.replaceState.bind(history);
      history.replaceState = function (...args) {
        origReplaceState(...args);
        window.__dfkDetectSession();
      };
    } catch (_) {}

    window.addEventListener('popstate', window.__dfkDetectSession);
    window.addEventListener('hashchange', window.__dfkDetectSession);
  }

  // ── Overlay ───────────────────────────────────────────────────────────────

  let overlayEl = null;
  let diagBarEl = null;

  function createOverlay() {
    if (overlayEl) return;

    overlayEl = document.createElement('div');
    overlayEl.id = 'dfk-engine-overlay';
    overlayEl.style.cssText = `
      position: fixed;
      bottom: 12px;
      right: 12px;
      width: 320px;
      max-height: 280px;
      background: rgba(15, 15, 25, 0.92);
      color: #e0e0e0;
      border: 1px solid rgba(100, 140, 255, 0.3);
      border-radius: 8px;
      padding: 10px 12px;
      font-family: 'Segoe UI', system-ui, sans-serif;
      font-size: 12px;
      line-height: 1.4;
      z-index: 999999;
      overflow-y: auto;
      pointer-events: auto;
      box-shadow: 0 4px 20px rgba(0,0,0,0.5);
      transition: opacity 0.2s;
    `;

    const header = document.createElement('div');
    header.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;';
    header.innerHTML = `
      <span style="font-weight: 600; color: #8cacff; font-size: 11px; letter-spacing: 0.5px;">HEDGE LEDGER ENGINE</span>
      <span id="dfk-engine-toggle" style="cursor: pointer; color: #666; font-size: 14px; line-height: 1;">_</span>
    `;
    overlayEl.appendChild(header);

    // Live diagnostic status bar — always visible
    diagBarEl = document.createElement('div');
    diagBarEl.id = 'dfk-diag-bar';
    diagBarEl.style.cssText = `
      font-size: 10px;
      color: #556;
      margin-bottom: 6px;
      padding-bottom: 5px;
      border-bottom: 1px solid rgba(255,255,255,0.07);
      letter-spacing: 0.2px;
      font-family: monospace;
    `;
    diagBarEl.textContent = '[LOG ✗] [0H 0E] [0 ACT ⚠] [T0] [NO SESS ⚠]';
    overlayEl.appendChild(diagBarEl);

    const body = document.createElement('div');
    body.id = 'dfk-engine-body';
    body.innerHTML = '<div style="color: #888; font-style: italic;">Loading engine...</div>';
    overlayEl.appendChild(body);

    document.body.appendChild(overlayEl);

    // Expose the diag bar update hook so turnState.js can push status without tight coupling
    window.__dfkUpdateDiagBar = function (statusText) {
      if (diagBarEl) {
        diagBarEl.textContent = statusText;
        const hasWarning = statusText.includes('⚠');
        diagBarEl.style.color = hasWarning ? '#997744' : '#4a6a55';
      }
    };

    let minimized = false;
    const toggle = overlayEl.querySelector('#dfk-engine-toggle');
    toggle.addEventListener('click', () => {
      minimized = !minimized;
      body.style.display = minimized ? 'none' : 'block';
      diagBarEl.style.display = minimized ? 'none' : 'block';
      toggle.textContent = minimized ? '+' : '_';
      overlayEl.style.maxHeight = minimized ? '32px' : '280px';
    });
  }

  function updateOverlay(result) {
    if (!overlayEl) return;
    const body = overlayEl.querySelector('#dfk-engine-body');
    if (!body) return;
    if (!result || !result.recommendedAction) return;

    const rec = result.recommendedAction;
    const confidence = Math.round((result.confidence || 0) * 100);
    const evMargin = result.evMargin != null ? result.evMargin.toFixed(3) : '—';

    let html = `
      <div style="margin-bottom: 6px;">
        <div style="font-weight: 600; color: #a0cfff; font-size: 13px;">${escapeHtml(rec.name)}</div>
        <div style="color: #888; font-size: 11px;">${rec.type.replace('_', ' ')} ${rec.targetType !== 'self' && rec.targetSlot != null ? '→ slot ' + rec.targetSlot : ''}</div>
      </div>
      <div style="display: flex; gap: 12px; margin-bottom: 6px; font-size: 11px;">
        <span>Confidence: <strong style="color: ${confidence >= 70 ? '#7cff7c' : confidence >= 50 ? '#ffd27c' : '#ff7c7c'}">${confidence}%</strong></span>
        <span>EV margin: <strong>${evMargin}</strong></span>
      </div>
    `;

    if (result.reasoning && result.reasoning.length > 0) {
      html += '<div style="border-top: 1px solid rgba(255,255,255,0.08); padding-top: 4px; margin-top: 2px;">';
      for (const reason of result.reasoning.slice(0, 4)) {
        html += `<div style="color: #aaa; font-size: 11px; margin-bottom: 2px;">${escapeHtml(reason)}</div>`;
      }
      html += '</div>';
    }

    if (result.rankedActions && result.rankedActions.length > 1) {
      html += '<div style="border-top: 1px solid rgba(255,255,255,0.08); padding-top: 4px; margin-top: 4px; font-size: 10px; color: #777;">';
      html += '<div style="margin-bottom: 2px; font-weight: 600;">Alternatives:</div>';
      for (let i = 1; i < Math.min(result.rankedActions.length, 4); i++) {
        const alt = result.rankedActions[i];
        html += `<div>${i + 1}. ${escapeHtml(alt.action.name)} (score: ${alt.score.toFixed(3)})</div>`;
      }
      html += '</div>';
    }

    body.innerHTML = html;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function buildKeyedHpState(turnState) {
    const state = {};
    (turnState.heroes || []).forEach(u => {
      state[`hero_${u.slot ?? 0}`] = { hp: u.hp, maxHp: u.maxHp };
    });
    (turnState.enemies || []).forEach(u => {
      state[`enemy_${u.slot ?? 0}`] = { hp: u.hp, maxHp: u.maxHp };
    });
    return state;
  }

  function buildKeyedMpState(turnState) {
    const state = {};
    (turnState.heroes || []).forEach(u => {
      if (u.mp != null) state[`hero_${u.slot ?? 0}`] = { mp: u.mp, maxMp: u.maxMp };
    });
    return state;
  }

  function flushTurnEvent(event) {
    const turnState = window.__dfkGetTurnState ? window.__dfkGetTurnState() : {};
    const battleLogEntry = buildBattleLogEntry(event);
    const combatFrame = buildCombatFrame(turnState, event.source || 'dom', battleLogEntry);
    safeSendRuntimeMessage({
      type: 'turn_event',
      data: {
        huntId: sessionHuntId,
        turnNumber: event.turn,
        actorSide: event.actorSide,
        actorSlot: null,
        skillId: null,
        ability: event.ability,
        actor: event.actor,
        target: event.target,
        damage: event.damage,
        manaDelta: event.manaDelta,
        damageType: event.damageType,
        effects: event.effects || [],
        rawText: event.rawText,
        hpState: buildKeyedHpState(turnState),
        mpState: buildKeyedMpState(turnState),
        legalActions: (turnState.legalActions || []).map(a => a.name),
        activeHeroSlot: turnState.activeHeroSlot ?? null,
        battleBudgetRemaining: turnState.battleBudgetRemaining ?? null,
        legalConsumables: turnState.legalConsumables || [],
        turnOrder: turnState.turnOrder || [],
        combatFrame,
        parseConfidence: event.parseConfidence,
        source: event.source || 'dom',
        capturedAt: event.capturedAt,
        _debug: event._debug || undefined,
      },
    });
  }

  const LOCAL_STORAGE_KEY = 'dfk_companion_snapshots';
  function storeLocally(event) {
    try {
      const stored = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEY) || '[]');
      stored.push(event);
      if (stored.length > 100) stored.shift();
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(stored));
    } catch (_) {}
  }

  // ── Init ──────────────────────────────────────────────────────────────────

  function init() {
    console.log('[DFK Companion] init() starting');

    createOverlay();

    window.__dfkDetectSession();

    safeStorageGet(['debugMode', 'sessionToken', 'hostUrl'], (result) => {
      debugMode = !!result.debugMode;
      window.__dfkDebugMode = debugMode;

      const urlDetection = detectFromUrl(window.location.href);
      const wallet = detectWalletFromPage();
      safeSendRuntimeMessage({
        type: 'content_ready',
        huntId: sessionHuntId,
        url: window.location.href,
        heroIds: urlDetection?.heroIds || [],
        wallet: wallet || null,
      });
    });

    installSpaHooks();

    setInterval(window.__dfkDetectSession, 3000);

    initEngine();
  }

  let heroProfiles = null;
  window.__dfkHeroProfiles = null;

  function applyHeroProfiles(profiles) {
    if (!profiles || !Array.isArray(profiles) || profiles.length === 0) return;
    heroProfiles = profiles;
    window.__dfkHeroProfiles = profiles;

    const classNames = profiles.map(h => `${h.mainClass} Lv${h.level} (ID:${h.heroId})`).join(', ');
    console.log(`[DFK Engine] Hero profiles loaded: ${classNames}`);

    if (typeof window.__dfkUpdateDiagBar === 'function') {
      const classSummary = profiles.map(h => h.mainClass || '?').join('/');
      window.__dfkUpdateDiagBar(`[HEROES: ${classSummary}]`);
    }

    const bodyEl = document.getElementById('dfk-engine-body');
    if (bodyEl && !lastRecommendation) {
      bodyEl.innerHTML = `<div style="color: #4a6a55;">Heroes loaded: ${profiles.map(h => h.mainClass).join(', ')}. Waiting for combat...</div>`;
    }
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'debug_mode_changed') {
      debugMode = msg.enabled;
      window.__dfkDebugMode = debugMode;
    } else if (msg.type === 'hero_profile_loaded') {
      applyHeroProfiles(msg.heroes);
    } else if (msg.type === 'execute_companion_action') {
      try {
        const result = typeof window.__dfkExecuteCombatAction === 'function'
          ? window.__dfkExecuteCombatAction(msg.action || null)
          : { ok: false, error: 'executor_unavailable' };
        sendResponse && sendResponse(result);
      } catch (err) {
        sendResponse && sendResponse({ ok: false, error: err?.message || 'execute_failed' });
      }
      return true;
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
