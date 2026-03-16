/**
 * DFK Hunt Companion — Background Service Worker
 * Manages WebSocket connection to Hedge Ledger backend.
 * Falls back to HTTP POST queue when socket is unavailable.
 * Stores session token, host URL, and last 100 snapshots in chrome.storage.local.
 */

const DEFAULT_HOST = 'https://your-replit-app.replit.app';
const WS_PATH = '/ws/companion';
const HTTP_EVENT_PATH = '/api/dfk/telemetry/event';
const HTTP_SNAPSHOT_PATH = '/api/dfk/telemetry/snapshot';
const RECONCILE_PATH = '/api/dfk/reconcile';

let ws = null;
let sessionToken = null;
let hostUrl = DEFAULT_HOST;
let isJoined = false;
let reconnectDelay = 1000;
let reconnectTimer = null;
let currentHuntId = null;
let currentTurnNumber = 0;

const httpQueue = [];
let flushingQueue = false;

const MAX_LOCAL_SNAPSHOTS = 100;
let localSnapshots = [];

let connectionStatus = 'disconnected';

function getWsUrl() {
  const base = hostUrl.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const proto = hostUrl.startsWith('https') ? 'wss' : 'ws';
  return `${proto}://${base}${WS_PATH}`;
}

function broadcast(msg) {
  chrome.runtime.sendMessage(msg).catch(() => {});
}

function setStatus(status) {
  connectionStatus = status;
  broadcast({ type: 'status_update', status });
}

function connect() {
  if (!sessionToken) {
    setStatus('no_token');
    return;
  }
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

  try {
    ws = new WebSocket(getWsUrl());
    setStatus('connecting');

    ws.onopen = () => {
      reconnectDelay = 1000;
      setStatus('connected');
      ws.send(JSON.stringify({ type: 'join', sessionToken }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        handleServerMessage(msg);
      } catch (_) {}
    };

    ws.onerror = () => {
      setStatus('error');
    };

    ws.onclose = () => {
      ws = null;
      isJoined = false;
      setStatus('disconnected');
      scheduleReconnect();
    };
  } catch (err) {
    setStatus('error');
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, reconnectDelay);
  reconnectDelay = Math.min(reconnectDelay * 2, 30000);
}

function handleServerMessage(msg) {
  if (msg.type === 'joined') {
    isJoined = true;
    setStatus('joined');
    broadcast({ type: 'joined', sessionId: msg.sessionId, existingTurns: msg.existingTurns });
  } else if (msg.type === 'recommendation') {
    broadcast({ type: 'recommendation', data: msg });
    chrome.storage.local.set({ lastRecommendation: msg });
  } else if (msg.type === 'turn_state') {
    broadcast({ type: 'turn_state', data: msg });
  } else if (msg.type === 'error') {
    broadcast({ type: 'server_error', message: msg.message });
    if (msg.message === 'Invalid session token') {
      setStatus('invalid_token');
    }
  }
}

function sendOrQueue(wsMsg, httpPath, httpBody) {
  if (ws && ws.readyState === WebSocket.OPEN && isJoined) {
    try {
      ws.send(JSON.stringify(wsMsg));
      return;
    } catch (_) {}
  }
  if (sessionToken && httpPath) {
    httpQueue.push({ path: httpPath, body: { ...httpBody, sessionToken } });
    flushHttpQueue();
  }
}

async function flushHttpQueue() {
  if (flushingQueue || httpQueue.length === 0) return;
  flushingQueue = true;
  const base = hostUrl.replace(/\/+$/, '');
  while (httpQueue.length > 0) {
    const item = httpQueue[0];
    try {
      const res = await fetch(`${base}${item.path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item.body),
      });
      if (res.ok) {
        httpQueue.shift();
      } else {
        break;
      }
    } catch (_) {
      break;
    }
  }
  flushingQueue = false;
}

function storeSnapshot(data) {
  localSnapshots.push({ ts: Date.now(), data });
  if (localSnapshots.length > MAX_LOCAL_SNAPSHOTS) localSnapshots.shift();
  chrome.storage.local.set({ localSnapshots });
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'turn_event') {
    const d = msg.data;
    if (d.turnNumber > currentTurnNumber) currentTurnNumber = d.turnNumber;

    storeSnapshot({ type: 'turn_event', ...d });

    sendOrQueue(
      {
        type: 'turn_event',
        huntId: currentHuntId || d.huntId,
        turnNumber: d.turnNumber,
        actorSide: d.actorSide,
        actorSlot: d.actorSlot,
        skillId: d.skillId,
        targets: d.target ? [d.target] : [],
        hpState: d.hpState,
        mpState: d.mpState || {},
        effects: d.effects || [],
        legalActions: d.legalActions || [],
        activeHeroSlot: d.activeHeroSlot,
        enemyId: d.enemyId || null,
        rawText: d.rawText,
      },
      HTTP_EVENT_PATH,
      {
        huntSessionId: null,
        turnNumber: d.turnNumber,
        actor: d.actor,
        actorSide: d.actorSide,
        target: d.target,
        ability: d.ability,
        damage: d.damage,
        manaDelta: d.manaDelta,
        effects: d.effects || [],
        rawText: d.rawText,
      }
    );

    broadcast({ type: 'turn_counter', turnNumber: currentTurnNumber });

  } else if (msg.type === 'state_snapshot') {
    const d = msg.data;
    storeSnapshot({ type: 'state_snapshot', ...d });

    sendOrQueue(
      {
        type: 'state_snapshot',
        heroes: d.heroes || [],
        enemies: d.enemies || [],
        huntId: currentHuntId,
        walletAddress: null,
      },
      HTTP_SNAPSHOT_PATH,
      {
        type: 'turn',
        huntSessionId: null,
        turnNumber: d.turnNumber || currentTurnNumber,
        fullState: d,
      }
    );

  } else if (msg.type === 'unit_snapshot') {
    const d = msg.data;
    storeSnapshot({ type: 'unit_snapshot', ...d });

    if (sessionToken) {
      const base = hostUrl.replace(/\/+$/, '');
      fetch(`${base}${HTTP_SNAPSHOT_PATH}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionToken,
          type: 'unit',
          huntSessionId: null,
          unitName: d.unitName || null,
          unitSide: d.unitSide || 'player',
          stats: d.stats || {},
        }),
      }).catch(() => {});
    }

  } else if (msg.type === 'content_ready') {
    if (msg.huntId) currentHuntId = msg.huntId;

  } else if (msg.type === 'hunt_id_detected') {
    currentHuntId = msg.huntId;
    broadcast({ type: 'hunt_id_update', huntId: currentHuntId });

  } else if (msg.type === 'get_status') {
    sendResponse({
      status: connectionStatus,
      isJoined,
      huntId: currentHuntId,
      turnNumber: currentTurnNumber,
      queueLength: httpQueue.length,
    });
    return true;

  } else if (msg.type === 'get_snapshots') {
    sendResponse({ snapshots: localSnapshots });
    return true;

  } else if (msg.type === 'clear_snapshots') {
    localSnapshots = [];
    chrome.storage.local.set({ localSnapshots: [] });
    sendResponse({ ok: true });
    return true;

  } else if (msg.type === 'set_token') {
    sessionToken = msg.token;
    isJoined = false;
    chrome.storage.local.set({ sessionToken });
    if (ws) ws.close();
    connect();

  } else if (msg.type === 'set_host') {
    hostUrl = msg.host;
    isJoined = false;
    chrome.storage.local.set({ hostUrl });
    if (ws) ws.close();
    connect();

  } else if (msg.type === 'reconcile') {
    const base = hostUrl.replace(/\/+$/, '');
    fetch(`${base}${RECONCILE_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionToken, unitSnapshot: msg.snapshot }),
    })
      .then(r => r.json())
      .then(result => {
        chrome.storage.local.set({ lastReconcileResult: result });
        broadcast({ type: 'reconcile_result', result });
      })
      .catch(err => broadcast({ type: 'reconcile_error', message: err.message }));

  } else if (msg.type === 'debug_mode_changed') {
    chrome.storage.local.set({ debugMode: msg.enabled });
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, msg).catch(() => {});
      });
    });
  }
});

chrome.storage.local.get(['sessionToken', 'hostUrl', 'localSnapshots'], (result) => {
  if (result.sessionToken) sessionToken = result.sessionToken;
  if (result.hostUrl) hostUrl = result.hostUrl;
  if (result.localSnapshots) localSnapshots = result.localSnapshots;
  connect();
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ localSnapshots: [], debugMode: false });
});
