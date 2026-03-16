/**
 * DFK Hunt Companion — Content Script
 * Entry point injected into game.defikingdoms.com.
 * Initializes the event emission bridge and coordinates parser modules.
 */

(function () {
  if (window.__dfkCompanionInit) return;
  window.__dfkCompanionInit = true;

  let debugMode = false;
  let sessionHuntId = null;
  let turnEventBuffer = [];
  const DEDUP_WINDOW_MS = 500;
  const recentEvents = [];

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
    } else if (type === 'unit_snapshot') {
      if (debugMode) storeLocally(payload);
      chrome.runtime.sendMessage({ type: 'unit_snapshot', data: payload }).catch(() => {});
    }
  };

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
