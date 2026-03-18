/**
 * DFK Hunt Companion — Background Service Worker
 * Manages WebSocket connection to Hedge Ledger backend.
 * Falls back to HTTP POST queue when socket is unavailable.
 * Stores session token, host URL, and last 100 snapshots in chrome.storage.local.
 */

const DEFAULT_HOST = 'https://99e8884e-26c1-4bc2-b03b-8d2a99f99522-00-1tjgo05cqvn3q.riker.replit.dev';
const LEGACY_DEFAULT_HOSTS = new Set([
  'https://hedge-ledger.replit.app',
]);
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
let perSessionTurnCount = 0;
let lastBroadcastHuntId = null;
let currentHeroProfiles = null;
let heroProfileHuntId = null;
let heroProfileFetching = false;
let extensionAuthToken = null;
let extensionUser = null;
let ownedCompanionSessions = [];
let selectedCompanionSessionId = null;
let requiresTabRefresh = false;
let lastRecommendation = null;
let lastUnitSnapshot = null;
let lastReconcileResult = null;
let lastContentReadyAt = null;
let lastContentReadyUrl = null;
let lastHuntDetectedAt = null;
let lastSuccessfulJoinAt = null;
let lastNetworkDiag = null;
let recentApiFailures = [];
let recentServerErrors = [];
let recentStateTransitions = [];
let backgroundDebugMode = false;

const httpQueue = [];
let flushingQueue = false;

const MAX_LOCAL_SNAPSHOTS = 100;
const MAX_RECENT_DIAGNOSTICS = 25;
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

function normalizeStoredHost(url) {
  const candidate = String(url || '').trim().replace(/\/+$/, '');
  if (!candidate) return DEFAULT_HOST;
  if (LEGACY_DEFAULT_HOSTS.has(candidate)) return DEFAULT_HOST;
  return candidate;
}

function getWsUrl() {
  const base = hostUrl.replace(/^https:\/\//i, '').replace(/\/+$/, '');
  return `wss://${base}${WS_PATH}`;
}

function broadcast(msg) {
  chrome.runtime.sendMessage(msg).catch(() => {});
}

function pushRecent(list, entry, max = MAX_RECENT_DIAGNOSTICS) {
  list.push({ ts: Date.now(), ...entry });
  if (list.length > max) list.shift();
}

function recordStateTransition(event, details = {}) {
  pushRecent(recentStateTransitions, { event, details });
  persistExtensionState();
}

function recordApiFailure(scope, path, error, extra = {}) {
  pushRecent(recentApiFailures, {
    scope,
    path,
    message: String(error?.message || error || 'Unknown error'),
    status: error?.status ?? null,
    details: extra,
  });
  persistExtensionState();
}

function recordServerError(message, extra = {}) {
  pushRecent(recentServerErrors, {
    message: String(message || 'Unknown server error'),
    details: extra,
  });
  persistExtensionState();
}

function redactSecret(value) {
  if (value == null) return null;
  const text = String(value);
  if (!text) return '';
  if (text.length <= 8) return `${text.slice(0, 2)}***`;
  return `${text.slice(0, 4)}***${text.slice(-4)}`;
}

function redactObject(value) {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map(redactObject);
  if (typeof value !== 'object') return value;
  const out = {};
  for (const [key, inner] of Object.entries(value)) {
    if (/token|password|authorization|cookie/i.test(key)) {
      out[key] = redactSecret(inner);
    } else {
      out[key] = redactObject(inner);
    }
  }
  return out;
}

function summarizeOwnedSession(session) {
  if (!session) return null;
  return {
    id: session.id,
    label: session.label || null,
    status: session.status || null,
    huntId: session.hunt_id || session.latest_hunt_id || null,
    requiresTabRefresh: !!session.requires_tab_refresh,
    selectedByExtensionAt: session.selected_by_extension_at || null,
    lastSeenAt: session.last_seen_at || null,
    connectedClients: session.connected_clients ?? null,
    sessionToken: redactSecret(session.session_token),
  };
}

function summarizeSnapshot(snapshot) {
  if (!snapshot) return null;
  const data = snapshot.data || snapshot;
  return {
    type: data.type || null,
    ts: snapshot.ts || data.capturedAt || null,
    turnNumber: data.turnNumber || data.turn || null,
    huntId: data.huntId || data.combatFrame?.captureMeta?.huntId || null,
    actor: data.actor || null,
    ability: data.ability || null,
    source: data.source || data.combatFrame?.captureMeta?.source || null,
    parseConfidence: data.parseConfidence ?? null,
    debug: redactObject(data._debug || null),
  };
}

function summarizeCombatFrame(frame) {
  if (!frame) return null;
  return {
    version: frame.version || null,
    turnNumber: frame.turnNumber || null,
    encounterType: frame.encounterType || null,
    activeTurn: frame.activeTurn ? {
      activeUnitId: frame.activeTurn.activeUnitId || null,
      activeSide: frame.activeTurn.activeSide || null,
      activeSlot: frame.activeTurn.activeSlot ?? null,
      selectedTargetId: frame.activeTurn.selectedTargetId || null,
      legalActionCount: Array.isArray(frame.activeTurn.legalActions) ? frame.activeTurn.legalActions.length : 0,
      legalConsumableCount: Array.isArray(frame.activeTurn.legalConsumables) ? frame.activeTurn.legalConsumables.length : 0,
      battleBudgetRemaining: frame.activeTurn.battleBudgetRemaining ?? null,
    } : null,
    combatantCount: Array.isArray(frame.combatants) ? frame.combatants.length : 0,
    turnOrderCount: Array.isArray(frame.turnOrder) ? frame.turnOrder.length : 0,
    battleLogCount: Array.isArray(frame.battleLogEntries) ? frame.battleLogEntries.length : 0,
    captureMeta: redactObject(frame.captureMeta || {}),
  };
}

function summarizeRecommendation(rec) {
  if (!rec) return null;
  return redactObject({
    recommendationCount: Array.isArray(rec.recommendations) ? rec.recommendations.length : 0,
    topRecommendation: Array.isArray(rec.recommendations) && rec.recommendations[0] ? {
      action: rec.recommendations[0].action || rec.recommendations[0].skillName || null,
      targetType: rec.recommendations[0].targetType || null,
      targetSlot: rec.recommendations[0].targetSlot ?? null,
      totalScore: rec.recommendations[0].totalScore ?? rec.recommendations[0].scoreTotal ?? null,
    } : null,
  });
}

function buildSupportBundle() {
  const manifest = chrome.runtime.getManifest();
  const selectedSession = ownedCompanionSessions.find((session) => session.id === selectedCompanionSessionId) || null;
  const latestSnapshot = localSnapshots[localSnapshots.length - 1]?.data || null;
  return {
    meta: {
      generatedAt: new Date().toISOString(),
      bundleVersion: 1,
      extensionName: manifest.name,
      extensionVersion: manifest.version,
      manifestVersion: manifest.manifest_version,
      userAgent: navigator.userAgent,
      platform: navigator.platform || null,
    },
    connection: {
      backendHost: hostUrl,
      websocketStatus: connectionStatus,
      joined: isJoined,
      queueLength: httpQueue.length,
      reconnectDelay,
      reconnectScheduled: !!reconnectTimer,
      lastSuccessfulJoinAt,
    },
    auth: {
      mode: extensionAuthToken ? 'extension_account' : 'manual_or_none',
      user: extensionUser ? {
        id: extensionUser.id ?? null,
        username: extensionUser.username || extensionUser.displayName || null,
        allowedTabs: extensionUser.allowedTabs || [],
      } : null,
      authToken: redactSecret(extensionAuthToken),
      selectedSessionId: selectedCompanionSessionId,
    },
    session: {
      sessionToken: redactSecret(sessionToken),
      currentHuntId,
      currentTurnNumber,
      perSessionTurnCount,
      requiresTabRefresh,
      selectedSession: summarizeOwnedSession(selectedSession),
      ownedSessions: ownedCompanionSessions.map(summarizeOwnedSession),
    },
    capture: {
      latestRecommendation: summarizeRecommendation(lastRecommendation),
      latestUnitSnapshot: redactObject(lastUnitSnapshot),
      latestReconcileResult: redactObject(lastReconcileResult),
      latestCombatFrame: summarizeCombatFrame(latestSnapshot?.combatFrame || null),
      latestSnapshotDebug: redactObject(latestSnapshot?._debug || null),
      recentSnapshots: localSnapshots.slice(-20).map(summarizeSnapshot),
      heroProfileSummary: Array.isArray(currentHeroProfiles) ? currentHeroProfiles.map((hero) => ({
        heroId: hero.heroId || null,
        normalizedId: hero.normalizedId || null,
        mainClass: hero.mainClass || null,
        level: hero.level || null,
      })) : [],
    },
    errors: {
      apiFailures: redactObject(recentApiFailures),
      serverErrors: redactObject(recentServerErrors),
      stateTransitions: redactObject(recentStateTransitions),
    },
    diagnostics: {
      debugMode: backgroundDebugMode,
      lastContentReadyAt,
      lastContentReadyUrl,
      lastHuntDetectedAt,
      lastHeroProfileHuntId: heroProfileHuntId,
      networkCapture: redactObject(lastNetworkDiag),
      extensionContextLikelyStale: requiresTabRefresh,
      localSnapshotCount: localSnapshots.length,
      recentApiFailureCount: recentApiFailures.length,
      recentServerErrorCount: recentServerErrors.length,
      recentTransitionCount: recentStateTransitions.length,
    },
  };
}

function persistExtensionState() {
  chrome.storage.local.set({
    sessionToken,
    hostUrl,
    extensionAuthToken,
    extensionUser,
    ownedCompanionSessions,
    selectedCompanionSessionId,
    requiresTabRefresh,
    currentHuntId,
    lastRecommendation,
    lastUnitSnapshot,
    lastReconcileResult,
    lastContentReadyAt,
    lastContentReadyUrl,
    lastHuntDetectedAt,
    lastSuccessfulJoinAt,
    lastNetworkDiag,
    backgroundDebugMode,
    recentApiFailures,
    recentServerErrors,
    recentStateTransitions,
  });
}

function broadcastExtensionState() {
  broadcast({
    type: 'extension_state_update',
    authUser: extensionUser,
    ownedCompanionSessions,
    selectedCompanionSessionId,
    requiresTabRefresh,
    sessionToken,
    huntId: currentHuntId,
  });
}

function buildApiUrl(path) {
  const base = hostUrl.replace(/\/+$/, '');
  return `${base}${path}`;
}

function buildAuthHeaders(extraHeaders = {}) {
  const headers = { ...extraHeaders };
  if (extensionAuthToken) {
    headers.Authorization = `Bearer ${extensionAuthToken}`;
  }
  return headers;
}

async function authedJsonFetch(path, options = {}) {
  const response = await fetch(buildApiUrl(path), {
    ...options,
    headers: buildAuthHeaders(options.headers || {}),
  });
  let json = null;
  try {
    json = await response.json();
  } catch (_) {}
  if (!response.ok || !json?.ok) {
    const message = json?.error || `Request failed (${response.status})`;
    const err = new Error(message);
    err.status = response.status;
    recordApiFailure('authed_json_fetch', path, err, { method: options.method || 'GET' });
    throw err;
  }
  return json;
}

function clearOwnedSessionSelection() {
  recordStateTransition('clear_owned_session_selection');
  selectedCompanionSessionId = null;
  ownedCompanionSessions = [];
  extensionUser = null;
  extensionAuthToken = null;
  sessionToken = null;
  currentHuntId = null;
  currentTurnNumber = 0;
  perSessionTurnCount = 0;
  requiresTabRefresh = false;
}

function setSelectedSession(session, markRefresh = true) {
  if (!session) return;
  recordStateTransition('select_session', { sessionId: session.id, huntId: session.hunt_id || session.latest_hunt_id || null, markRefresh: !!markRefresh });
  selectedCompanionSessionId = session.id;
  sessionToken = session.session_token || sessionToken;
  currentHuntId = session.hunt_id || session.latest_hunt_id || null;
  currentTurnNumber = 0;
  perSessionTurnCount = 0;
  lastBroadcastHuntId = currentHuntId;
  requiresTabRefresh = markRefresh;
  persistExtensionState();
  broadcastExtensionState();
  if (ws) ws.close();
  connect();
}

async function refreshOwnedSessions(options = {}) {
  if (!extensionAuthToken) {
    ownedCompanionSessions = [];
    extensionUser = null;
    persistExtensionState();
    broadcastExtensionState();
    return [];
  }

  try {
    const data = await authedJsonFetch('/api/user/extension/session');
    extensionUser = data.user || extensionUser;
    ownedCompanionSessions = Array.isArray(data.sessions) ? data.sessions : [];

    const selected = ownedCompanionSessions.find((session) => session.id === selectedCompanionSessionId);
    if (selected) {
      if (!sessionToken || sessionToken !== selected.session_token) {
        sessionToken = selected.session_token;
      }
      currentHuntId = selected.hunt_id || selected.latest_hunt_id || null;
      requiresTabRefresh = Boolean(selected.requires_tab_refresh) || requiresTabRefresh;
    } else if (!options.preserveSelection) {
      const nextSession = ownedCompanionSessions.find((session) => !session.archived_at) || ownedCompanionSessions[0] || null;
      if (nextSession) {
        setSelectedSession(nextSession, false);
      } else {
        selectedCompanionSessionId = null;
      }
    }

    persistExtensionState();
    broadcastExtensionState();
    return ownedCompanionSessions;
  } catch (err) {
    if (err.status === 401) {
      clearOwnedSessionSelection();
      persistExtensionState();
      broadcastExtensionState();
    }
    throw err;
  }
}

async function loginExtensionAccount(username, password) {
  const response = await fetch(buildApiUrl('/api/user/extension/login'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json?.ok) {
    recordApiFailure('extension_login', '/api/user/extension/login', new Error(json?.error || 'Extension login failed'), { status: response.status, username });
    throw new Error(json?.error || 'Extension login failed');
  }

  extensionAuthToken = json.authToken || null;
  extensionUser = json.user || null;
  ownedCompanionSessions = Array.isArray(json.sessions) ? json.sessions : [];
  recordStateTransition('extension_login_success', { username });

  const selected = ownedCompanionSessions.find((session) => session.id === selectedCompanionSessionId)
    || ownedCompanionSessions.find((session) => !session.archived_at)
    || ownedCompanionSessions[0]
    || null;

  if (selected) {
    setSelectedSession(selected, false);
  } else {
    persistExtensionState();
    broadcastExtensionState();
  }

  return {
    user: extensionUser,
    sessions: ownedCompanionSessions,
    selectedSessionId: selected?.id || null,
  };
}

async function logoutExtensionAccount() {
  if (extensionAuthToken) {
    try {
      await authedJsonFetch('/api/user/extension/logout', { method: 'POST' });
    } catch (_) {}
  }
  clearOwnedSessionSelection();
  recordStateTransition('extension_logout');
  persistExtensionState();
  broadcastExtensionState();
  if (ws) ws.close();
}

async function createOwnedCompanionSession(label) {
  const data = await authedJsonFetch('/api/user/pve/companion/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ label: label || null }),
  });
  if (data.session) {
    await selectOwnedCompanionSession(data.session.id);
  }
  return data.session || null;
}

async function selectOwnedCompanionSession(sessionId) {
  const data = await authedJsonFetch(`/api/user/pve/companion/sessions/${sessionId}/select`, {
    method: 'POST',
  });
  await refreshOwnedSessions({ preserveSelection: true });
  if (data.session) {
    setSelectedSession(data.session, true);
  }
  return data.session;
}

function setStatus(status) {
  connectionStatus = status;
  recordStateTransition('connection_status', { status });
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
      lastSuccessfulJoinAt = new Date().toISOString();
      recordStateTransition('ws_open', { sessionToken: redactSecret(sessionToken) });
      setStatus('connected');
      ws.send(JSON.stringify({ type: 'join', sessionToken }));
      flushHttpQueue();
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        handleServerMessage(msg);
      } catch (err) {
        recordServerError('Failed to parse websocket message', { message: String(err?.message || err || 'parse') });
      }
    };

    ws.onerror = () => {
      recordServerError('WebSocket error');
      setStatus('error');
    };

    ws.onclose = () => {
      ws = null;
      isJoined = false;
      recordStateTransition('ws_close', { sessionToken: redactSecret(sessionToken) });
      setStatus('disconnected');
      scheduleReconnect();
    };
  } catch (err) {
    recordApiFailure('ws_connect', WS_PATH, err);
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
    recordStateTransition('joined', { sessionId: msg.sessionId, existingTurns: msg.existingTurns || 0 });
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
    lastRecommendation = normalized;
    broadcast({ type: 'recommendation', data: normalized });
    chrome.storage.local.set({ lastRecommendation: normalized });
  } else if (msg.type === 'turn_state') {
    broadcast({ type: 'turn_state', data: msg });
  } else if (msg.type === 'execute_action') {
    dispatchActionToContentScripts(msg.action || null).then((result) => {
      broadcast({ type: 'execute_action_result', action: msg.action || null, result });
    });
  } else if (msg.type === 'error') {
    recordServerError(msg.message, { type: 'server_error' });
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
        let responseText = '';
        try {
          responseText = await res.text();
        } catch (_) {}
        recordApiFailure('http_queue', item.path, new Error(`HTTP ${res.status}`), {
          status: res.status,
          response: responseText ? responseText.slice(0, 500) : null,
        });
        break;
      }
    } catch (_) {
      recordApiFailure('http_queue', item.path, new Error('Queue flush failed'));
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
    return json.heroes || null;
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
  if (heroProfileHuntId === huntId && currentHeroProfiles && currentHeroProfiles.length > 1) return;

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

async function dispatchActionToContentScripts(action) {
  return new Promise((resolve) => {
    chrome.tabs.query({ url: '*://game.defikingdoms.com/*' }, async (tabs) => {
      for (const tab of (tabs || [])) {
        try {
          const result = await chrome.tabs.sendMessage(tab.id, { type: 'execute_companion_action', action });
          if (result?.ok) {
            recordStateTransition('execute_action_success', {
              actionName: action?.name || null,
              actionGroup: action?.group || null,
              tabId: tab.id,
            });
            resolve(result);
            return;
          }
        } catch (_) {}
      }
      recordStateTransition('execute_action_failed', {
        actionName: action?.name || null,
        actionGroup: action?.group || null,
      });
      resolve({ ok: false, error: 'no_matching_tab' });
    });
  });
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'turn_event') {
    const d = msg.data;
    if (d.turnNumber > currentTurnNumber) currentTurnNumber = d.turnNumber;

    // Track per-session sequential turn count (reset on new hunt)
    const eventHuntId = currentHuntId || d.huntId;
    if (eventHuntId && eventHuntId !== lastBroadcastHuntId) {
      perSessionTurnCount = 0;
      lastBroadcastHuntId = eventHuntId;
    }
    perSessionTurnCount++;

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
        legalConsumables: d.legalConsumables || [],
        activeHeroSlot: d.activeHeroSlot,
        battleBudgetRemaining: d.battleBudgetRemaining ?? null,
        turnOrder: d.turnOrder || [],
        combatFrame: d.combatFrame || null,
        enemyId: d.enemyId || null,
        rawText: d.rawText,
      },
      HTTP_EVENT_PATH,
      {
        huntSessionId: null,
        turnNumber: d.turnNumber,
        actor: d.actor,
        actorSide: d.actorSide,
        actorSlot: d.actorSlot,
        target: d.target,
        ability: d.ability,
        damage: d.damage,
        manaDelta: d.manaDelta,
        effects: d.effects || [],
        activeHeroSlot: d.activeHeroSlot != null ? d.activeHeroSlot : null,
        huntId: currentHuntId || d.huntId || null,
        battleBudgetRemaining: d.battleBudgetRemaining ?? null,
        combatFrame: d.combatFrame || null,
        rawText: d.rawText,
      }
    );

    broadcast({ type: 'turn_counter', turnNumber: perSessionTurnCount, rawTurnNumber: currentTurnNumber });

  } else if (msg.type === 'state_snapshot') {
    const d = msg.data;
    storeSnapshot({ type: 'state_snapshot', ...d });

    sendOrQueue(
      {
        type: 'state_snapshot',
        heroes: d.heroes || [],
        enemies: d.enemies || [],
        combatFrame: d.combatFrame || null,
        huntId: currentHuntId,
        walletAddress: null,
      },
      HTTP_SNAPSHOT_PATH,
      {
        type: 'turn',
        huntSessionId: null,
        turnNumber: d.turnNumber || currentTurnNumber,
        fullState: d,
        combatFrame: d.combatFrame || null,
      }
    );

  } else if (msg.type === 'unit_snapshot') {
    const d = msg.data;
    storeSnapshot({ type: 'unit_snapshot', ...d });
    lastUnitSnapshot = d;
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
    lastContentReadyAt = new Date().toISOString();
    lastContentReadyUrl = msg.url || null;
    recordStateTransition('content_ready', { huntId: msg.huntId || null, url: msg.url || null });
    requiresTabRefresh = false;
    if (msg.huntId) {
      currentHuntId = msg.huntId;
      fetchAndBroadcastHeroProfiles(msg.huntId, msg.heroIds || null, msg.wallet || null);
    }
    persistExtensionState();
    broadcastExtensionState();
    if (currentHeroProfiles && currentHeroProfiles.length > 0) {
      broadcastToContentScripts({ type: 'hero_profile_loaded', heroes: currentHeroProfiles, huntId: heroProfileHuntId });
    }

  } else if (msg.type === 'hunt_id_detected') {
    currentHuntId = msg.huntId;
    lastHuntDetectedAt = new Date().toISOString();
    recordStateTransition('hunt_id_detected', { huntId: currentHuntId, source: msg.source || null });
    persistExtensionState();
    broadcastExtensionState();
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
      turnNumber: perSessionTurnCount,
      rawTurnNumber: currentTurnNumber,
      queueLength: httpQueue.length,
      authUser: extensionUser,
      ownedCompanionSessions,
      selectedCompanionSessionId,
      requiresTabRefresh,
      sessionToken,
      hostUrl,
      recentApiFailureCount: recentApiFailures.length,
      recentServerErrorCount: recentServerErrors.length,
      recentTransitionCount: recentStateTransitions.length,
      lastContentReadyAt,
      lastHuntDetectedAt,
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

  } else if (msg.type === 'network_diag') {
    lastNetworkDiag = msg.data || null;
    chrome.storage.local.set({ lastNetworkDiag });
    sendResponse({ ok: true });
    return true;

  } else if (msg.type === 'export_support_bundle') {
    try {
      sendResponse({ ok: true, bundle: buildSupportBundle() });
    } catch (err) {
      recordApiFailure('support_bundle', 'local_export', err);
      sendResponse({ ok: false, error: err.message || 'Failed to build support bundle' });
    }
    return true;

  } else if (msg.type === 'set_token') {
    sessionToken = msg.token;
    isJoined = false;
    selectedCompanionSessionId = null;
    requiresTabRefresh = false;
    persistExtensionState();
    broadcastExtensionState();
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
    persistExtensionState();
    broadcastExtensionState();
    if (ws) ws.close();
    connect();

  } else if (msg.type === 'extension_login') {
    loginExtensionAccount(msg.username, msg.password)
      .then((state) => sendResponse({ ok: true, ...state }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;

  } else if (msg.type === 'extension_logout') {
    logoutExtensionAccount()
      .then(() => sendResponse({ ok: true }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;

  } else if (msg.type === 'refresh_companion_sessions') {
    refreshOwnedSessions({ preserveSelection: true })
      .then((sessions) => sendResponse({ ok: true, sessions, user: extensionUser, selectedCompanionSessionId }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;

  } else if (msg.type === 'create_companion_session') {
    createOwnedCompanionSession(msg.label || null)
      .then((session) => sendResponse({ ok: true, session }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;

  } else if (msg.type === 'select_companion_session') {
    selectOwnedCompanionSession(msg.sessionId)
      .then((session) => sendResponse({ ok: true, session }))
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;

  } else if (msg.type === 'reconcile') {
    const base = hostUrl.replace(/\/+$/, '');
    fetch(`${base}${RECONCILE_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionToken, unitSnapshot: msg.snapshot }),
    })
      .then(r => r.json())
      .then(result => {
        lastReconcileResult = result;
        chrome.storage.local.set({ lastReconcileResult: result });
        broadcast({ type: 'reconcile_result', result });
      })
      .catch(err => {
        recordApiFailure('reconcile', RECONCILE_PATH, err);
        broadcast({ type: 'reconcile_error', message: err.message });
      });

  } else if (msg.type === 'debug_mode_changed') {
    backgroundDebugMode = !!msg.enabled;
    chrome.storage.local.set({ debugMode: msg.enabled });
    persistExtensionState();
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => {
        chrome.tabs.sendMessage(tab.id, msg).catch(() => {});
      });
    });
  }
});

chrome.storage.local.get(['sessionToken', 'hostUrl', 'localSnapshots', 'httpQueue', 'extensionAuthToken', 'extensionUser', 'ownedCompanionSessions', 'selectedCompanionSessionId', 'requiresTabRefresh', 'currentHuntId', 'lastRecommendation', 'lastUnitSnapshot', 'lastReconcileResult', 'lastContentReadyAt', 'lastContentReadyUrl', 'lastHuntDetectedAt', 'lastSuccessfulJoinAt', 'lastNetworkDiag', 'backgroundDebugMode', 'recentApiFailures', 'recentServerErrors', 'recentStateTransitions'], (result) => {
  if (result.sessionToken) sessionToken = result.sessionToken;
  const normalizedHost = normalizeStoredHost(result.hostUrl);
  if (normalizedHost !== hostUrl) hostUrl = normalizedHost;
  if (result.localSnapshots) localSnapshots = result.localSnapshots;
  if (Array.isArray(result.httpQueue)) httpQueue.push(...result.httpQueue);
  if (result.extensionAuthToken) extensionAuthToken = result.extensionAuthToken;
  if (result.extensionUser) extensionUser = result.extensionUser;
  if (Array.isArray(result.ownedCompanionSessions)) ownedCompanionSessions = result.ownedCompanionSessions;
  if (result.selectedCompanionSessionId) selectedCompanionSessionId = result.selectedCompanionSessionId;
  if (typeof result.requiresTabRefresh === 'boolean') requiresTabRefresh = result.requiresTabRefresh;
  if (result.currentHuntId) currentHuntId = result.currentHuntId;
  if (result.lastRecommendation) lastRecommendation = result.lastRecommendation;
  if (result.lastUnitSnapshot) lastUnitSnapshot = result.lastUnitSnapshot;
  if (result.lastReconcileResult) lastReconcileResult = result.lastReconcileResult;
  if (result.lastContentReadyAt) lastContentReadyAt = result.lastContentReadyAt;
  if (result.lastContentReadyUrl) lastContentReadyUrl = result.lastContentReadyUrl;
  if (result.lastHuntDetectedAt) lastHuntDetectedAt = result.lastHuntDetectedAt;
  if (result.lastSuccessfulJoinAt) lastSuccessfulJoinAt = result.lastSuccessfulJoinAt;
  if (result.lastNetworkDiag) lastNetworkDiag = result.lastNetworkDiag;
  if (typeof result.backgroundDebugMode === 'boolean') backgroundDebugMode = result.backgroundDebugMode;
  if (Array.isArray(result.recentApiFailures)) recentApiFailures = result.recentApiFailures;
  if (Array.isArray(result.recentServerErrors)) recentServerErrors = result.recentServerErrors;
  if (Array.isArray(result.recentStateTransitions)) recentStateTransitions = result.recentStateTransitions;
  if (normalizedHost !== (result.hostUrl || DEFAULT_HOST)) {
    chrome.storage.local.set({ hostUrl: normalizedHost });
  }
  connect();
  if (extensionAuthToken) {
    refreshOwnedSessions({ preserveSelection: true }).catch((err) => {
      console.warn('[ExtensionAuth] Session refresh failed:', err.message);
    });
  }
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['selectedCompanionSessionId'], (result) => {
    const nextRequiresRefresh = !!result.selectedCompanionSessionId;
    requiresTabRefresh = nextRequiresRefresh;
    chrome.storage.local.set({ localSnapshots: [], debugMode: false, requiresTabRefresh: nextRequiresRefresh });
  });
});
