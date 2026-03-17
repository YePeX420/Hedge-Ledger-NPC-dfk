const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const backgroundPath = path.join(__dirname, '..', 'extension', 'background.js');
const backgroundCode = fs.readFileSync(backgroundPath, 'utf8');

function buildChrome(initialStorage) {
  const storage = { ...initialStorage };
  const runtimeMessageListeners = [];

  const chrome = {
    runtime: {
      onMessage: {
        addListener(listener) {
          runtimeMessageListeners.push(listener);
        },
      },
      onInstalled: {
        addListener() {},
      },
      sendMessage() {
        return Promise.resolve();
      },
      getManifest() {
        return {
          name: 'Hedge Ledger Companion',
          version: '1.0.0',
          manifest_version: 3,
        };
      },
    },
    storage: {
      local: {
        get(keys, callback) {
          if (Array.isArray(keys)) {
            const result = {};
            keys.forEach((key) => {
              if (Object.prototype.hasOwnProperty.call(storage, key)) {
                result[key] = storage[key];
              }
            });
            callback(result);
            return;
          }
          if (typeof keys === 'string') {
            callback({ [keys]: storage[keys] });
            return;
          }
          if (keys && typeof keys === 'object') {
            const result = {};
            Object.keys(keys).forEach((key) => {
              result[key] = Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : keys[key];
            });
            callback(result);
            return;
          }
          callback({ ...storage });
        },
        set(values, callback) {
          Object.assign(storage, values);
          if (callback) callback();
        },
      },
    },
    tabs: {
      query(_queryInfo, callback) {
        callback([]);
      },
      sendMessage() {
        return Promise.resolve();
      },
    },
  };

  return {
    chrome,
    storage,
    runtimeMessageListeners,
  };
}

function createSandbox(initialStorage = {}, fetchImpl) {
  const { chrome, storage, runtimeMessageListeners } = buildChrome(initialStorage);
  const quietConsole = {
    log() {},
    warn() {},
    error: console.error.bind(console),
  };

  class FakeWebSocket {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;

    constructor(url) {
      this.url = url;
      this.readyState = FakeWebSocket.CONNECTING;
    }

    send() {}

    close() {
      this.readyState = FakeWebSocket.CLOSED;
      if (typeof this.onclose === 'function') this.onclose();
    }
  }

  const sandbox = {
    chrome,
    fetch: fetchImpl || (async () => ({ ok: true, json: async () => ({ ok: true }) })),
    WebSocket: FakeWebSocket,
    navigator: {
      userAgent: 'SupportBundleTest/1.0',
      platform: 'test-platform',
    },
    console: quietConsole,
    URL,
    URLSearchParams,
    Date,
    JSON,
    Math,
    Promise,
    Array,
    Object,
    String,
    Number,
    Boolean,
    RegExp,
    setTimeout() {
      return 1;
    },
    clearTimeout() {},
  };

  vm.runInNewContext(backgroundCode, sandbox, { filename: backgroundPath });

  return {
    storage,
    runtimeMessageListeners,
  };
}

function createHarness(initialStorage = {}, fetchImpl) {
  const { storage, runtimeMessageListeners } = createSandbox(initialStorage, fetchImpl);
  assert(runtimeMessageListeners.length > 0, 'Expected background message listener to be registered');
  const listener = runtimeMessageListeners[0];

  function sendMessage(message) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const maybeAsync = listener(message, {}, (response) => {
        settled = true;
        resolve(response);
      });
      if (maybeAsync !== true && !settled) {
        resolve(undefined);
      }
      setTimeout(() => {
        if (!settled) reject(new Error(`Timed out waiting for response to ${message.type}`));
      }, 100);
    });
  }

  return {
    storage,
    sendMessage,
  };
}

async function exportBundle(initialStorage) {
  const harness = createHarness(initialStorage);
  const response = await harness.sendMessage({ type: 'export_support_bundle' });
  assert(response && response.ok, 'Expected support bundle export to succeed');
  return response.bundle;
}

async function testLoggedOutBundle() {
  const bundle = await exportBundle({});
  assert.deepStrictEqual(
    Object.keys(bundle),
    ['meta', 'connection', 'auth', 'session', 'capture', 'errors', 'diagnostics'],
    'Support bundle top-level sections are incomplete',
  );
  assert.strictEqual(bundle.auth.user, null, 'Logged-out bundle should not include a user');
  assert.strictEqual(bundle.auth.mode, 'manual_or_none', 'Logged-out bundle should report manual_or_none');
}

async function testRedactionAndVisibility() {
  const rawSessionToken = 'sess_secret_abcdef123456';
  const rawAuthToken = 'ext_secret_1234567890';
  const rawCookie = 'user_session=supersecretcookie';
  const rawPassword = 'hunter2';
  const rawAuthHeader = 'Bearer extension-super-secret';

  const bundle = await exportBundle({
    extensionAuthToken: rawAuthToken,
    extensionUser: { id: 7, username: 'testuser1', allowedTabs: ['pve-hunts'] },
    ownedCompanionSessions: [{
      id: 5,
      label: 'Boar Hunt',
      status: 'in_progress',
      hunt_id: '53935-762160',
      session_token: rawSessionToken,
      requires_tab_refresh: true,
    }],
    selectedCompanionSessionId: 5,
    sessionToken: rawSessionToken,
    currentHuntId: '53935-762160',
    currentTurnNumber: 12,
    backgroundDebugMode: true,
    lastRecommendation: {
      recommendations: [{ action: 'Strike', targetType: 'enemy', targetSlot: 1, totalScore: 8.2 }],
    },
    lastUnitSnapshot: {
      unitName: 'Zermol',
      authorization: rawAuthHeader,
      password: rawPassword,
    },
    lastReconcileResult: {
      ok: true,
      cookie: rawCookie,
    },
    localSnapshots: [{
      ts: Date.now(),
      data: {
        type: 'state_snapshot',
        turnNumber: 12,
        huntId: '53935-762160',
        combatFrame: {
          version: 1,
          turnNumber: 12,
          combatants: [{}, {}],
          turnOrder: [{}],
          battleLogEntries: [{}],
          activeTurn: {
            activeUnitId: 'hero-0',
            activeSide: 1,
            activeSlot: 0,
            selectedTargetId: 'enemy-1',
            legalActions: [{ id: 'attack' }, { id: 'skill-1' }],
            legalConsumables: [{ id: 'potion' }],
            battleBudgetRemaining: 11,
          },
          captureMeta: {
            huntId: '53935-762160',
            sessionToken: rawSessionToken,
            source: 'dom',
          },
        },
      },
    }],
    recentApiFailures: [{
      ts: Date.now(),
      scope: 'extension_login',
      path: '/api/user/extension/login',
      details: {
        authorization: rawAuthHeader,
        password: rawPassword,
      },
    }],
    recentServerErrors: [{
      ts: Date.now(),
      message: 'Server error',
      details: {
        cookie: rawCookie,
      },
    }],
  });

  const serialized = JSON.stringify(bundle);

  assert(serialized.includes('testuser1'), 'Username should remain visible');
  assert(serialized.includes('53935-762160'), 'Hunt ID should remain visible');
  assert(serialized.includes('"selectedSessionId":5'), 'Selected session id should remain visible');

  assert(!serialized.includes(rawSessionToken), 'Raw session token leaked into support bundle');
  assert(!serialized.includes(rawAuthToken), 'Raw auth token leaked into support bundle');
  assert(!serialized.includes(rawCookie), 'Raw cookie leaked into support bundle');
  assert(!serialized.includes(rawPassword), 'Raw password leaked into support bundle');
  assert(!serialized.includes(rawAuthHeader), 'Raw authorization header leaked into support bundle');

  assert(bundle.session.sessionToken.includes('***'), 'Session token was not redacted');
  assert(bundle.auth.authToken.includes('***'), 'Auth token was not redacted');
  assert(bundle.capture.latestUnitSnapshot.authorization.includes('***'), 'Unit snapshot authorization was not redacted');
  assert(bundle.capture.latestReconcileResult.cookie.includes('***'), 'Reconcile cookie was not redacted');
}

async function testBoundedTransitionHistory() {
  const harness = createHarness({
    selectedCompanionSessionId: 22,
    sessionToken: 'sess_transition_test_1234',
    requiresTabRefresh: true,
  });

  for (let i = 0; i < 40; i += 1) {
    await harness.sendMessage({ type: 'hunt_id_detected', huntId: `53935-7621${String(i).padStart(2, '0')}`, source: 'test' });
  }

  const response = await harness.sendMessage({ type: 'export_support_bundle' });
  assert(response && response.ok, 'Expected bundle export after transition spam');
  assert(response.bundle.errors.stateTransitions.length <= 25, 'State transition history should be bounded');
}

async function main() {
  await testLoggedOutBundle();
  await testRedactionAndVisibility();
  await testBoundedTransitionHistory();
  console.log('Support bundle smoke tests passed.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
