(function () {
  'use strict';

  if (window.__dfkNetworkCaptureInit) return;
  window.__dfkNetworkCaptureInit = true;

  const MAX_LOG_ENTRIES = 200;
  const log = [];
  let panelOpen = false;
  let transportDetected = false;
  let panelOpenEntryCount = 0;

  function classifyTransport(entry) {
    const url = (entry.url || '').toLowerCase();
    const body = (entry.requestBody || '').toLowerCase();

    if (url.includes('graphql') || body.includes('"query"') || body.includes('"mutation"')) {
      return 'graphql';
    }
    if (url.includes('/combat') || url.includes('/battle')) {
      return 'rest-combat';
    }
    if (url.includes('/hunt')) {
      return 'rest-hunt';
    }
    if (url.includes('ws://') || url.includes('wss://')) {
      return 'websocket';
    }
    return 'unknown';
  }

  function addEntry(entry) {
    entry.capturedAt = Date.now();
    entry.panelOpenAtCapture = panelOpen;
    entry.transport = classifyTransport(entry);
    log.push(entry);
    if (log.length > MAX_LOG_ENTRIES) log.shift();

    if (entry.panelOpenAtCapture) {
      panelOpenEntryCount++;
      if (!transportDetected && panelOpenEntryCount >= 3) {
        transportDetected = true;
        console.info('[DFK] Battle-log transport detected: ' + entry.transport + ' — ' + entry.url);
      }
    }

    const shouldNormalize =
      !!window.__dfkNormalizeNetworkPayload &&
      (
        entry.panelOpenAtCapture ||
        entry.transport === 'graphql' ||
        entry.transport === 'rest-combat' ||
        entry.transport === 'rest-hunt' ||
        entry.transport === 'websocket' ||
        /combat|battle|hunt/i.test(entry.url || '')
      );

    if (shouldNormalize) {
      try {
        window.__dfkNormalizeNetworkPayload(entry);
      } catch (e) {
        console.warn('[DFK NetworkCapture] Normalizer error:', e);
      }
    }
  }

  function detectPanelOpen() {
    const selectors = [
      '.battle-log', '.combat-log',
      '[class*="battle-log"]', '[class*="combat-log"]',
      '[class*="battleLog"]', '[class*="BattleLog"]',
      '#battle-log', '#combat-log',
    ];
    for (const sel of selectors) {
      if (document.querySelector(sel)) return true;
    }
    return false;
  }

  const panelObserver = new MutationObserver(() => {
    panelOpen = detectPanelOpen();
  });

  if (document.body) {
    panelObserver.observe(document.body, { childList: true, subtree: true });
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      panelObserver.observe(document.body, { childList: true, subtree: true });
    });
  }

  function stringifyBody(body) {
    if (body == null) return null;
    if (typeof body === 'string') return body;
    if (body instanceof FormData || body instanceof Blob || body instanceof ArrayBuffer || body instanceof ReadableStream) return null;
    try { return JSON.stringify(body); } catch (_) { return null; }
  }

  const origFetch = window.fetch;
  window.fetch = function (...args) {
    const request = args[0];
    let url = '';
    let method = 'GET';
    let requestBody = null;

    if (typeof request === 'string') {
      url = request;
    } else if (request instanceof Request) {
      url = request.url;
      method = request.method || 'GET';
    }

    if (args[1]) {
      method = args[1].method || method;
      requestBody = stringifyBody(args[1].body);
    }

    if (!requestBody && request instanceof Request && request.method && request.method !== 'GET') {
      try {
        var clonedReq = request.clone();
        clonedReq.text().then(function (t) {
          if (t) requestBody = t;
        }).catch(function () {});
      } catch (_) {}
    }

    return origFetch.apply(this, args).then(response => {
      const cloned = response.clone();
      cloned.text().then(text => {
        addEntry({
          url,
          method: method.toUpperCase(),
          requestBody: requestBody,
          responseBody: text,
        });
      }).catch(() => {});
      return response;
    });
  };

  const origXHROpen = XMLHttpRequest.prototype.open;
  const origXHRSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this._dfkMethod = method;
    this._dfkUrl = url;
    return origXHROpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function (body) {
    let requestBody = body;
    if (typeof requestBody === 'object' && requestBody !== null && !(requestBody instanceof FormData) && !(requestBody instanceof Blob) && !(requestBody instanceof ArrayBuffer)) {
      try { requestBody = JSON.stringify(requestBody); } catch (_) {}
    }
    this._dfkRequestBody = typeof requestBody === 'string' ? requestBody : null;

    this.addEventListener('load', function () {
      try {
        addEntry({
          url: this._dfkUrl || '',
          method: (this._dfkMethod || 'GET').toUpperCase(),
          requestBody: this._dfkRequestBody,
          responseBody: this.responseText || '',
        });
      } catch (_) {}
    });

    return origXHRSend.call(this, body);
  };

  function normalizeWsPayload(data, callback) {
    if (typeof data === 'string') {
      callback(data);
      return;
    }

    if (data instanceof Blob && typeof data.text === 'function') {
      data.text().then(callback).catch(() => {});
      return;
    }

    if (data instanceof ArrayBuffer) {
      try {
        const decoded = new TextDecoder().decode(data);
        callback(decoded);
      } catch (_) {}
      return;
    }

    if (ArrayBuffer.isView(data)) {
      try {
        const decoded = new TextDecoder().decode(data);
        callback(decoded);
      } catch (_) {}
      return;
    }
  }

  const NativeWebSocket = window.WebSocket;
  if (typeof NativeWebSocket === 'function') {
    const WrappedWebSocket = function (url, protocols) {
      const socket = protocols !== undefined
        ? new NativeWebSocket(url, protocols)
        : new NativeWebSocket(url);

      socket.addEventListener('message', function (event) {
        normalizeWsPayload(event.data, function (text) {
          if (!text) return;
          addEntry({
            url: String(url || ''),
            method: 'WS_MESSAGE',
            requestBody: null,
            responseBody: text,
          });
        });
      });

      return socket;
    };

    WrappedWebSocket.prototype = NativeWebSocket.prototype;
    Object.setPrototypeOf(WrappedWebSocket, NativeWebSocket);
    WrappedWebSocket.CONNECTING = NativeWebSocket.CONNECTING;
    WrappedWebSocket.OPEN = NativeWebSocket.OPEN;
    WrappedWebSocket.CLOSING = NativeWebSocket.CLOSING;
    WrappedWebSocket.CLOSED = NativeWebSocket.CLOSED;

    window.WebSocket = WrappedWebSocket;
  }

  window.__dfkRawNetworkLog = log;

  window.__dfkNetworkCapture = {
    get log() { return log; },
    clear: function () {
      log.length = 0;
      panelOpenEntryCount = 0;
      transportDetected = false;
      console.info('[DFK NetworkCapture] Log cleared');
    },
    summary: function () {
      const total = log.length;
      const panelOpenCount = log.filter(e => e.panelOpenAtCapture).length;
      const transports = {};
      log.forEach(e => {
        transports[e.transport] = (transports[e.transport] || 0) + 1;
      });
      return {
        totalEntries: total,
        panelOpenEntries: panelOpenCount,
        transportBreakdown: transports,
        panelCurrentlyOpen: panelOpen,
      };
    },
  };

  document.addEventListener('dfk-request-network-log', function () {
    var snapshot = log.slice(-50).map(function (e) {
      return {
        url: (e.url || '').slice(0, 500),
        method: e.method || 'unknown',
        requestBody: e.requestBody ? e.requestBody.slice(0, 200) : null,
        responseBody: (e.responseBody || '').slice(0, 300),
        transport: e.transport || 'unknown',
        panelOpenAtCapture: !!e.panelOpenAtCapture,
        classified: e.classified,
        capturedAt: e.capturedAt,
      };
    });
    document.dispatchEvent(new CustomEvent('dfk-network-log-response', {
      detail: JSON.parse(JSON.stringify({
        totalEntries: log.length,
        panelCurrentlyOpen: panelOpen,
        entries: snapshot,
      })),
    }));
  });

  panelOpen = detectPanelOpen();

  console.log('[DFK NetworkCapture] Installed (fetch + XHR + WebSocket interception active)');
})();
