/**
 * DFK Hunt Companion — Content Script
 * Entry point injected into game.defikingdoms.com.
 * Initializes the event emission bridge and coordinates parser modules.
 * Calls local engine for recommendations after each turn snapshot.
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

  let overlayEl = null;

  function createOverlay() {
    if (overlayEl) return;

    overlayEl = document.createElement('div');
    overlayEl.id = 'dfk-engine-overlay';
    overlayEl.style.cssText = `
      position: fixed;
      bottom: 12px;
      right: 12px;
      width: 300px;
      max-height: 260px;
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
    header.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;';
    header.innerHTML = `
      <span style="font-weight: 600; color: #8cacff; font-size: 11px; letter-spacing: 0.5px;">HEDGE LEDGER ENGINE</span>
      <span id="dfk-engine-toggle" style="cursor: pointer; color: #666; font-size: 14px; line-height: 1;">_</span>
    `;
    overlayEl.appendChild(header);

    const body = document.createElement('div');
    body.id = 'dfk-engine-body';
    body.innerHTML = '<div style="color: #888; font-style: italic;">Waiting for combat data...</div>';
    overlayEl.appendChild(body);

    document.body.appendChild(overlayEl);

    let minimized = false;
    const toggle = overlayEl.querySelector('#dfk-engine-toggle');
    toggle.addEventListener('click', () => {
      minimized = !minimized;
      body.style.display = minimized ? 'none' : 'block';
      toggle.textContent = minimized ? '+' : '_';
      overlayEl.style.maxHeight = minimized ? '32px' : '260px';
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

  function detectHuntId() {
    const url = window.location.href;
    const m = url.match(/hunt[_-]?id[=:/](\d+)/i) || url.match(/huntId=(\d+)/i);
    if (m) return m[1];
    const el = document.querySelector('[data-hunt-id]');
    if (el) return el.getAttribute('data-hunt-id');
    const titleMatch = document.title.match(/Hunt #?(\d+)/i);
    if (titleMatch) return titleMatch[1];
    return null;
  }

  function init() {
    sessionHuntId = detectHuntId();
    chrome.storage.local.get(['debugMode', 'sessionToken', 'hostUrl'], (result) => {
      debugMode = !!result.debugMode;
      window.__dfkDebugMode = debugMode;

      chrome.runtime.sendMessage({
        type: 'content_ready',
        huntId: sessionHuntId,
        url: window.location.href,
      }).catch(() => {});
    });

    setInterval(() => {
      const huntId = detectHuntId();
      if (huntId && huntId !== sessionHuntId) {
        sessionHuntId = huntId;
        chrome.runtime.sendMessage({ type: 'hunt_id_detected', huntId }).catch(() => {});
      }
    }, 3000);

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
