/**
 * DFK Hunt Companion — Background Service Worker
 * Manages WebSocket connection to Hedge Ledger backend.
 * Falls back to HTTP POST queue when socket is unavailable.
 * Stores session token, host URL, and last 100 snapshots in chrome.storage.local.
 */

const DEFAULT_HOST = 'https://hedge-ledger.replit.app';
const DFK_GRAPHQL_ENDPOINT = 'https://api.defikingdoms.com/graphql';
const WS_PATH = '/ws/companion';
const HTTP_EVENT_PATH = '/api/dfk/telemetry/event';
const HTTP_SNAPSHOT_PATH = '/api/dfk/telemetry/snapshot';
const RECONCILE_PATH = '/api/dfk/reconcile';
const HUNT_HEROES_PATH = '/api/dfk/hunt-heroes';

let ws = null;
let sessionToken = null;
let hostUrl = DEFAULT_HOST;
let isJoined = false;
let reconnectDelay = 1000;
let reconnectTimer = null;
let currentHuntId = null;
let currentTurnNumber = 0;
let currentHeroProfiles = null;
let heroProfileHuntId = null;
let heroProfileFetching = false;

const httpQueue = [];
let flushingQueue = false;

const MAX_LOCAL_SNAPSHOTS = 100;
let localSnapshots = [];

let connectionStatus = 'disconnected';

function isSecureHost(url) {
  return /^https:\/\//i.test(url);
}

function validateHost(url) {
  if (!url) return false;
  if (!isSecureHost(url)) return false;
  try { new URL(url); return true; } catch (_) { return false; }
}

function getWsUrl() {
  const base = hostUrl.replace(/^https:\/\//i, '').replace(/\/+$/, '');
  return `wss://${base}${WS_PATH}`;
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
      flushHttpQueue();
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
    if (currentHuntId) {
      sendWsMessage({ type: 'request_hero_profiles', huntId: currentHuntId });
    }
  } else if (msg.type === 'hero_profile') {
    const heroes = (msg.heroes || []).map(mapHeroProfile);
    if (heroes.length > 0) {
      currentHeroProfiles = heroes;
      heroProfileHuntId = msg.huntId || currentHuntId;
      chrome.storage.local.set({ currentHeroProfiles: heroes, heroProfileHuntId });
      console.log(`[HeroProfile] Received ${heroes.length} profiles via WS`);
      broadcastToContentScripts({ type: 'hero_profile_loaded', heroes, huntId: heroProfileHuntId });
    }
  } else if (msg.type === 'recommendation') {
    const recData = msg.data || msg;
    const normalized = {
      recommendations: recData.recommendations || recData.data || (Array.isArray(recData) ? recData : []),
    };
    broadcast({ type: 'recommendation', data: normalized });
    chrome.storage.local.set({ lastRecommendation: normalized });
  } else if (msg.type === 'turn_state') {
    broadcast({ type: 'turn_state', data: msg });
  } else if (msg.type === 'error') {
    broadcast({ type: 'server_error', message: msg.message });
    if (msg.message === 'Invalid session token') {
      setStatus('invalid_token');
    }
  }
}

function sendWsMessage(msg) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    try { ws.send(JSON.stringify(msg)); } catch (_) {}
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
    chrome.storage.local.set({ httpQueue });
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
        chrome.storage.local.set({ httpQueue });
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

async function fetchHeroProfilesDirect(heroIds) {
  if (!heroIds || heroIds.length === 0) return null;

  const HERO_FIELDS = `
    id normalizedId mainClassStr subClassStr professionStr
    rarity level generation
    strength dexterity agility intelligence wisdom vitality endurance luck
    hp mp active1 active2 passive1 passive2 currentQuest
  `;
  const query = `query GetHeroes($ids: [ID!]!) { heroes(where: { id_in: $ids }) { ${HERO_FIELDS} } }`;

  try {
    const res = await fetch(DFK_GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: { ids: heroIds } }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (json.errors) return null;
    return (json.data?.heroes || []).map(mapHeroProfile);
  } catch (err) {
    console.warn('[HeroProfile] Direct GraphQL fetch failed:', err.message);
    return null;
  }
}

async function fetchHeroProfilesViaBackend(heroIds, wallet, huntId) {
  const base = hostUrl.replace(/\/+$/, '');
  const params = new URLSearchParams();
  if (huntId) params.set('huntId', huntId);
  if (heroIds && heroIds.length > 0) params.set('heroIds', heroIds.join(','));
  if (wallet) params.set('wallet', wallet);
  if (params.toString() === '') return null;

  try {
    const res = await fetch(`${base}${HUNT_HEROES_PATH}?${params.toString()}`);
    if (!res.ok) return null;
    const json = await res.json();
    return json.ok ? json.heroes : null;
  } catch (err) {
    console.warn('[HeroProfile] Backend fetch failed:', err.message);
    return null;
  }
}

function mapHeroProfile(raw) {
  return {
    heroId: String(raw.id || raw.normalizedId || ''),
    normalizedId: String(raw.normalizedId || raw.id || ''),
    mainClass: raw.mainClassStr || raw.mainClass || '',
    subClass: raw.subClassStr || raw.subClass || '',
    level: raw.level || 1,
    rarity: raw.rarity || 0,
    stats: {
      str: raw.strength || raw.stats?.str || 0,
      dex: raw.dexterity || raw.stats?.dex || 0,
      agi: raw.agility || raw.stats?.agi || 0,
      int: raw.intelligence || raw.stats?.int || 0,
      wis: raw.wisdom || raw.stats?.wis || 0,
      vit: raw.vitality || raw.stats?.vit || 0,
      end: raw.endurance || raw.stats?.end || 0,
      lck: raw.luck || raw.stats?.lck || 0,
    },
    hp: raw.hp || 0,
    mp: raw.mp || 0,
    active1: raw.active1 || null,
    active2: raw.active2 || null,
    passive1: raw.passive1 || null,
    passive2: raw.passive2 || null,
  };
}

async function fetchAndBroadcastHeroProfiles(huntId, heroIds, wallet) {
  if (heroProfileFetching) return;
  if (heroProfileHuntId === huntId && currentHeroProfiles) return;

  heroProfileFetching = true;
  console.log(`[HeroProfile] Fetching hero profiles for hunt ${huntId}...`);

  try {
    let profiles = null;

    if (heroIds && heroIds.length > 0) {
      profiles = await fetchHeroProfilesDirect(heroIds);
    }

    if (!profiles && wallet) {
      profiles = await fetchHeroProfilesViaBackend(null, wallet, huntId);
    }

    if (!profiles && heroIds && heroIds.length > 0) {
      profiles = await fetchHeroProfilesViaBackend(heroIds, null, huntId);
    }

    if (!profiles) {
      profiles = await fetchHeroProfilesViaBackend(null, null, huntId);
    }

    if (profiles && profiles.length > 0) {
      currentHeroProfiles = profiles;
      heroProfileHuntId = huntId;
      chrome.storage.local.set({ currentHeroProfiles: profiles, heroProfileHuntId: huntId });

      const classNames = profiles.map(h => `${h.mainClass} Lv${h.level}`).join(', ');
      console.log(`[HeroProfile] Loaded ${profiles.length} heroes: ${classNames}`);

      broadcastToContentScripts({ type: 'hero_profile_loaded', heroes: profiles, huntId });
    } else {
      console.warn('[HeroProfile] No hero profiles found for hunt', huntId);
    }
  } catch (err) {
    console.error('[HeroProfile] Error fetching profiles:', err);
  } finally {
    heroProfileFetching = false;
  }
}

function broadcastToContentScripts(msg) {
  broadcast(msg);
  chrome.tabs.query({ url: '*://game.defikingdoms.com/*' }, (tabs) => {
    for (const tab of (tabs || [])) {
      chrome.tabs.sendMessage(tab.id, msg).catch(() => {});
    }
  });
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
    chrome.storage.local.set({ lastUnitSnapshot: d });

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
    if (msg.huntId) {
      currentHuntId = msg.huntId;
      fetchAndBroadcastHeroProfiles(msg.huntId, msg.heroIds || null, msg.wallet || null);
    }
    if (currentHeroProfiles && currentHeroProfiles.length > 0) {
      broadcastToContentScripts({ type: 'hero_profile_loaded', heroes: currentHeroProfiles, huntId: heroProfileHuntId });
    }

  } else if (msg.type === 'hunt_id_detected') {
    currentHuntId = msg.huntId;
    broadcast({ type: 'hunt_id_update', huntId: currentHuntId });
    sendWsMessage({ type: 'request_hero_profiles', huntId: msg.huntId, heroIds: msg.heroIds || [], wallet: msg.wallet || null });
    fetchAndBroadcastHeroProfiles(msg.huntId, msg.heroIds || null, msg.wallet || null);

  } else if (msg.type === 'fetch_hero_profiles') {
    fetchAndBroadcastHeroProfiles(
      msg.huntId || currentHuntId,
      msg.heroIds || null,
      msg.wallet || null
    );

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
    const candidate = (msg.host || '').trim();
    if (!validateHost(candidate)) {
      broadcast({ type: 'server_error', message: 'Host must use https:// (secure connection required)' });
      sendResponse && sendResponse({ ok: false, error: 'https required' });
      return;
    }
    hostUrl = candidate;
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

chrome.storage.local.get(['sessionToken', 'hostUrl', 'localSnapshots', 'httpQueue'], (result) => {
  if (result.sessionToken) sessionToken = result.sessionToken;
  if (result.hostUrl) hostUrl = result.hostUrl;
  if (result.localSnapshots) localSnapshots = result.localSnapshots;
  if (Array.isArray(result.httpQueue)) httpQueue.push(...result.httpQueue);
  connect();
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({ localSnapshots: [], debugMode: false });
});
