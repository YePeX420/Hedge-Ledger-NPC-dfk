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
  if (window.__dfkCompanionInit) return;
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

  window.__dfkEmitEvent = function (type, data) {
    const payload = { ...data, _contentScriptTs: Date.now() };

    if (type === 'battle_log_event') {
      if (isDuplicate(data)) return;
      if (debugMode) storeLocally(payload);
      turnEventBuffer.push(payload);
      flushTurnEvent(payload);
      maybeBuildSyntheticSessionId();
    } else if (type === 'turn_snapshot') {
      if (debugMode) storeLocally(payload);
      chrome.runtime.sendMessage({ type: 'state_snapshot', data: payload }).catch(() => {});
      runLocalRecommendation(payload);
    } else if (type === 'unit_snapshot') {
      if (debugMode) storeLocally(payload);
      chrome.runtime.sendMessage({ type: 'unit_snapshot', data: payload }).catch(() => {});
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

  function runLocalRecommendation(turnSnapshot) {
    if (!engineReady) return;
    if (!window.__dfkGetRecommendation) return;

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
          createOverlay();
        } else {
          console.error('[DFK Engine] Data loader reports not loaded after loadAllData');
        }
      } catch (err) {
        console.error('[DFK Engine] Failed to initialize engine:', err);
      }
    } else {
      console.warn('[DFK Engine] Data loader not available');
    }
  }

  // ── Hunt / Session ID detection ───────────────────────────────────────────

  function detectFromUrl(url) {
    const m = url.match(/hunt[_-]?id[=:/](\w+)/i) ||
              url.match(/huntId=(\w+)/i) ||
              url.match(/\/hunt\/(\w+)/i) ||
              url.match(/\/battle\/(\w+)/i) ||
              url.match(/\/combat\/(\w+)/i);
    return m ? { id: m[1], source: 'url' } : null;
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
    return null;
  }

  function applySessionId(detection) {
    if (!detection) return;
    const { id, source } = detection;
    if (id && id !== sessionHuntId) {
      sessionHuntId = id;
      window.__dfkSessionId = id;
      window.__dfkSessionIdSource = source;
      console.log(`[DFK] Session ID detected: ${id} (${source})`);
      chrome.runtime.sendMessage({ type: 'hunt_id_detected', huntId: id, source }).catch(() => {});
    }
  }

  window.__dfkDetectSession = function () {
    const url = window.location.href;
    applySessionId(detectFromUrl(url) || detectFromDom());
  };

  // Synthetic key from team composition — fires after first two battle log events
  function maybeBuildSyntheticSessionId() {
    if (syntheticKeyGenerated || sessionHuntId) return;
    if (turnEventBuffer.length < 2) return;

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
    chrome.runtime.sendMessage({ type: 'hunt_id_detected', huntId: synKey, source: 'synthetic' }).catch(() => {});
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
    body.innerHTML = '<div style="color: #888; font-style: italic;">Waiting for combat data...</div>';
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
    chrome.runtime.sendMessage({
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
        parseConfidence: event.parseConfidence,
        capturedAt: event.capturedAt,
        _debug: event._debug || undefined,
      },
    }).catch(() => {});
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
    // Run session detection with all strategies
    window.__dfkDetectSession();

    chrome.storage.local.get(['debugMode', 'sessionToken', 'hostUrl'], (result) => {
      debugMode = !!result.debugMode;
      window.__dfkDebugMode = debugMode;

      chrome.runtime.sendMessage({
        type: 'content_ready',
        huntId: sessionHuntId,
        url: window.location.href,
      }).catch(() => {});
    });

    // Install SPA navigation hooks
    installSpaHooks();

    // Poll for session ID changes (handles hash routers and deferred DOM population)
    setInterval(window.__dfkDetectSession, 3000);

    initEngine();
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'debug_mode_changed') {
      debugMode = msg.enabled;
      window.__dfkDebugMode = debugMode;
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
