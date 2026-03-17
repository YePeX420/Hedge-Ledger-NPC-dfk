/**
 * DFK Hunt Companion — Popup UI
 * Handles all popup interactions: token/host config, status updates,
 * recommendation card, debug mode, reconciliation diff table.
 */

'use strict';

const STATUS_LABELS = {
  connected: 'Connected',
  joined: 'Active',
  connecting: 'Connecting...',
  disconnected: 'Disconnected',
  error: 'Connection error',
  no_token: 'No token set',
  invalid_token: 'Invalid token',
};

let debugMode = false;
let reconcileMode = false;
let lastSnapshots = [];
let lastRecommendation = null;
let lastReconcileResult = null;
let currentStatus = null;

function el(id) { return document.getElementById(id); }

function setStatusDot(status) {
  const dot = el('status-dot');
  dot.className = `status-dot status-${status}`;
  el('status-text').textContent = STATUS_LABELS[status] || status;
}

function updateHuntInfo(huntId, turnNumber, queueLength) {
  if (huntId != null) el('hunt-id').textContent = huntId;
  if (turnNumber != null) el('turn-counter').textContent = turnNumber;
  if (queueLength != null) el('http-queue').textContent = queueLength;
}

function renderAuthAndSessions(status) {
  currentStatus = status;
  const authUser = status?.authUser || null;
  el('auth-logged-out').classList.toggle('hidden', !!authUser);
  el('auth-logged-in').classList.toggle('hidden', !authUser);
  el('auth-error').textContent = '';

  if (authUser) {
    el('auth-user-label').textContent = `Signed in as ${authUser.username || authUser.displayName || authUser.ownerUserId || 'user'}`;
  }

  const notice = el('refresh-required-notice');
  notice.classList.toggle('hidden', !status?.requiresTabRefresh);

  const list = el('session-list');
  list.innerHTML = '';
  const sessions = Array.isArray(status?.ownedCompanionSessions) ? status.ownedCompanionSessions : [];

  if (sessions.length === 0) {
    list.innerHTML = `<div class="session-item"><div class="session-meta">${authUser ? 'No owned companion sessions yet.' : 'Log in to load your owned companion sessions.'}</div></div>`;
    return;
  }

  sessions.forEach((session) => {
    const item = document.createElement('div');
    item.className = `session-item ${session.id === status.selectedCompanionSessionId ? 'selected' : ''}`;
    const label = session.label || session.hunt_id || `Session #${session.id}`;
    const lastSeen = session.last_seen_at ? new Date(session.last_seen_at).toLocaleString() : 'n/a';
    const hunt = session.hunt_id || session.latest_hunt_id || '--';
    item.innerHTML = `
      <div class="session-row">
        <div>
          <div class="session-label">${label}</div>
          <div class="session-meta">Status: ${session.status || 'waiting'} | Hunt: ${hunt}</div>
          <div class="session-meta">Last seen: ${lastSeen}</div>
        </div>
        <button class="btn btn-ghost btn-sm">${session.id === status.selectedCompanionSessionId ? 'Selected' : 'Use'}</button>
      </div>
    `;
    const btn = item.querySelector('button');
    btn.disabled = session.id === status.selectedCompanionSessionId;
    btn.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'select_companion_session', sessionId: session.id }, (res) => {
        if (chrome.runtime.lastError || !res?.ok) {
          el('auth-error').textContent = res?.error || chrome.runtime.lastError?.message || 'Failed to select session';
          return;
        }
        loadAndRender();
      });
    });
    list.appendChild(item);
  });
}

function renderRecommendation(data) {
  if (!data || !data.recommendations || data.recommendations.length === 0) {
    el('rec-empty').classList.remove('hidden');
    el('rec-content').classList.add('hidden');
    return;
  }

  el('rec-empty').classList.add('hidden');
  el('rec-content').classList.remove('hidden');

  const recs = data.recommendations;
  const best = recs[0];

  const getScore = (r) => r.scoreTotal ?? r.totalScore ?? null;
  const getDmgEv = (r) => r.damageEV ?? r.damageEv ?? 0;

  el('rec-move').textContent = best.skillName || best.action || '--';
  el('rec-target').textContent = best.targetType
    ? `Target: ${best.targetType}${best.targetSlot != null ? ` (slot ${best.targetSlot})` : ''}`
    : '';
  const bestScore = getScore(best);
  el('rec-score').textContent = typeof bestScore === 'number' ? bestScore.toFixed(1) : '--';

  const tags = el('rec-tags');
  tags.innerHTML = '';
  const reasonTags = Array.isArray(best.reasonTags) ? best.reasonTags : [];
  if (reasonTags.length === 0) {
    if (best.killChance > 0.5) reasonTags.push(`Kill ${Math.round(best.killChance * 100)}%`);
    if (getDmgEv(best) > 0) reasonTags.push(`DMG EV ${Math.round(getDmgEv(best))}`);
    if (best.survivalDelta > 0) reasonTags.push('Survival+');
    if (best.debuffValue > 0) reasonTags.push('Debuff');
    if (best.manaEfficiency > 1) reasonTags.push('Mana eff.');
  }
  reasonTags.forEach(tag => {
    const span = document.createElement('span');
    span.className = 'rec-tag';
    span.textContent = tag;
    tags.appendChild(span);
  });

  const alt2 = recs[1];
  if (alt2) {
    el('rec-alt2').textContent = alt2.skillName || alt2.action || '--';
    const a2Score = getScore(alt2);
    el('rec-alt2-score').textContent = typeof a2Score === 'number' ? a2Score.toFixed(1) : '';
  }

  const risky = recs.find((r, i) => {
    const rScore = getScore(r);
    return i > 0 && r.killChance > 0.3 && rScore < bestScore * 0.8;
  });
  if (risky) {
    el('rec-risky').textContent = risky.skillName || risky.action || '--';
    const rScore = getScore(risky);
    el('rec-risky-score').textContent = typeof rScore === 'number' ? rScore.toFixed(1) : '';
  } else {
    el('rec-risky').textContent = '--';
    el('rec-risky-score').textContent = '';
  }
}

function renderDebugEvents(snapshots) {
  const list = el('event-list');
  list.innerHTML = '';
  const failures = [];

  const recent = snapshots.slice(-30).reverse();
  recent.forEach(snap => {
    const d = snap.data || snap;
    const row = document.createElement('div');
    row.className = 'event-item';

    const ts = document.createElement('span');
    ts.className = 'event-ts';
    const t = new Date(snap.ts || d.capturedAt || Date.now());
    ts.textContent = `${t.getHours().toString().padStart(2,'0')}:${t.getMinutes().toString().padStart(2,'0')}:${t.getSeconds().toString().padStart(2,'0')}`;

    const body = document.createElement('span');
    body.className = 'event-body';

    if (d.type === 'battle_log_event' || d.type === 'turn_event') {
      const conf = d.parseConfidence ?? 1;
      const confClass = conf >= 0.8 ? 'conf-high' : conf >= 0.5 ? 'conf-mid' : 'conf-low';
      let html = `<span class="${confClass}">[${(conf * 100).toFixed(0)}%]</span> Turn ${d.turn || d.turnNumber || '?'}: ${d.actor || '?'} → ${d.ability || '?'} → ${d.target || '?'} (${d.damage ?? '?'} dmg)`;
      if (d._debug) {
        const fields = Object.entries(d._debug).filter(([k]) => k !== 'selectorUsed');
        if (fields.length > 0) {
          html += '<div style="margin-top:2px;font-size:10px;color:#64748b">';
          fields.forEach(([k, v]) => {
            const fc = (v.confidence ?? 0) >= 0.8 ? 'conf-high' : (v.confidence ?? 0) >= 0.5 ? 'conf-mid' : 'conf-low';
            html += `<span class="${fc}">${k}:</span> ${v.source || '?'} `;
          });
          html += '</div>';
        }
      }
      body.innerHTML = html;
      if (conf < 0.5) failures.push(`T${d.turn}: low confidence parse (${(conf*100).toFixed(0)}%) — "${(d.rawText||'').slice(0,40)}"`);
    } else if (d.type === 'unit_snapshot') {
      let text = `Snapshot: ${d.unitName || 'unknown'} (${d.unitSide || '?'}) — ${Object.keys(d.stats||{}).length} stats`;
      if (d._debug) {
        const dbgFields = Object.entries(d._debug);
        if (dbgFields.length > 0) {
          text += '\n';
          dbgFields.forEach(([k, v]) => { text += ` ${k}:${v.source || '?'}`; });
        }
      }
      body.textContent = text;
    } else if (d.type === 'state_snapshot' || d.type === 'turn_snapshot') {
      body.textContent = `State: T${d.turnNumber||'?'}, ${(d.heroes||[]).length}h/${(d.enemies||[]).length}e, ${(d.legalActions||[]).length} actions`;
    } else {
      body.textContent = JSON.stringify(d).slice(0, 80);
    }

    row.appendChild(ts);
    row.appendChild(body);
    list.appendChild(row);
  });

  const failEl = el('parse-failures');
  if (failures.length > 0) {
    failEl.textContent = 'Parse failures: ' + failures.join(' | ');
  } else {
    failEl.textContent = '';
  }
}

function renderReconcileTable(result) {
  if (!result || !result.diffs) {
    el('reconcile-result-wrapper').classList.add('hidden');
    return;
  }
  el('reconcile-result-wrapper').classList.remove('hidden');
  const tbody = el('reconcile-table-body');
  tbody.innerHTML = '';
  result.diffs.forEach(diff => {
    const absDelta = Math.abs(diff.delta || 0);
    const cls = absDelta === 0 ? 'diff-ok' : absDelta < 10 ? 'diff-warn' : 'diff-error';
    const tr = document.createElement('tr');
    tr.className = cls;
    tr.innerHTML = `
      <td>${diff.field}</td>
      <td>${diff.observed ?? '--'}</td>
      <td>${diff.expected ?? '--'}</td>
      <td>${diff.delta != null ? (diff.delta > 0 ? '+' : '') + diff.delta : '--'}</td>
      <td style="color:#94a3b8;font-size:10px">${diff.suspectedCause || ''}</td>
    `;
    tbody.appendChild(tr);
  });
}

function loadAndRender() {
  chrome.runtime.sendMessage({ type: 'get_status' }, (status) => {
    if (chrome.runtime.lastError || !status) return;
    setStatusDot(status.status);
    updateHuntInfo(status.huntId, status.turnNumber, status.queueLength);
    renderAuthAndSessions(status);
    if (status.sessionToken) el('token-input').value = status.sessionToken;
    if (status.hostUrl) el('host-input').value = status.hostUrl;
  });

  chrome.storage.local.get(['sessionToken', 'hostUrl', 'debugMode', 'localSnapshots', 'lastRecommendation', 'lastReconcileResult'], (result) => {
    if (!el('token-input').value && result.sessionToken) el('token-input').value = result.sessionToken;
    if (!el('host-input').value && result.hostUrl) el('host-input').value = result.hostUrl;

    debugMode = !!result.debugMode;
    el('debug-toggle').checked = debugMode;
    el('debug-section').classList.toggle('hidden', !debugMode);

    if (result.localSnapshots) {
      lastSnapshots = result.localSnapshots;
      if (debugMode) renderDebugEvents(lastSnapshots);
    }

    if (result.lastRecommendation) {
      renderRecommendation(result.lastRecommendation);
    }

    if (result.lastReconcileResult) {
      renderReconcileTable(result.lastReconcileResult);
    }
  });
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'status_update') setStatusDot(msg.status);
  if (msg.type === 'turn_counter') updateHuntInfo(null, msg.turnNumber, null);
  if (msg.type === 'hunt_id_update') updateHuntInfo(msg.huntId, null, null);
  if (msg.type === 'extension_state_update') loadAndRender();
  if (msg.type === 'recommendation') {
    renderRecommendation(msg.data);
    lastRecommendation = msg.data;
  }
  if (msg.type === 'reconcile_result') {
    el('reconcile-status').textContent = `Reconciled. ${(msg.result.diffs || []).length} diffs found.`;
    el('reconcile-status').style.color = '#10b981';
    renderReconcileTable(msg.result);
  }
  if (msg.type === 'reconcile_error') {
    el('reconcile-status').textContent = `Error: ${msg.message}`;
    el('reconcile-status').style.color = '#ef4444';
  }
});

el('save-token-btn').addEventListener('click', () => {
  const token = el('token-input').value.trim();
  if (!token) return;
  chrome.runtime.sendMessage({ type: 'set_token', token });
  el('save-token-btn').textContent = 'Saved';
  setTimeout(() => { el('save-token-btn').textContent = 'Save'; }, 1500);
});

el('login-btn').addEventListener('click', () => {
  const username = el('login-username').value.trim();
  const password = el('login-password').value;
  if (!username || !password) {
    el('auth-error').textContent = 'Username and password are required.';
    return;
  }
  el('auth-error').textContent = '';
  chrome.runtime.sendMessage({ type: 'extension_login', username, password }, (res) => {
    if (chrome.runtime.lastError || !res?.ok) {
      el('auth-error').textContent = res?.error || chrome.runtime.lastError?.message || 'Login failed';
      return;
    }
    el('login-password').value = '';
    loadAndRender();
  });
});

el('logout-btn').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'extension_logout' }, () => {
    el('login-password').value = '';
    loadAndRender();
  });
});

el('refresh-sessions-btn').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'refresh_companion_sessions' }, (res) => {
    if (chrome.runtime.lastError || !res?.ok) {
      el('auth-error').textContent = res?.error || chrome.runtime.lastError?.message || 'Failed to refresh sessions';
      return;
    }
    loadAndRender();
  });
});

el('create-session-btn').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'create_companion_session', label: el('new-session-label').value.trim() || null }, (res) => {
    if (chrome.runtime.lastError || !res?.ok) {
      el('auth-error').textContent = res?.error || chrome.runtime.lastError?.message || 'Failed to create session';
      return;
    }
    el('new-session-label').value = '';
    loadAndRender();
  });
});

el('copy-token-btn').addEventListener('click', () => {
  const token = el('token-input').value.trim();
  if (token) {
    navigator.clipboard.writeText(token).then(() => {
      el('copy-token-btn').textContent = 'Copied';
      setTimeout(() => { el('copy-token-btn').textContent = 'Copy'; }, 1500);
    });
  }
});

el('save-host-btn').addEventListener('click', () => {
  const host = el('host-input').value.trim();
  if (!host) return;
  chrome.runtime.sendMessage({ type: 'set_host', host });
  el('save-host-btn').textContent = 'Set!';
  setTimeout(() => { el('save-host-btn').textContent = 'Set'; }, 1500);
});

el('debug-toggle').addEventListener('change', (e) => {
  debugMode = e.target.checked;
  el('debug-section').classList.toggle('hidden', !debugMode);
  chrome.runtime.sendMessage({ type: 'debug_mode_changed', enabled: debugMode });
  if (debugMode) renderDebugEvents(lastSnapshots);
});

el('reconcile-toggle').addEventListener('change', (e) => {
  reconcileMode = e.target.checked;
  el('reconcile-section').classList.toggle('hidden', !reconcileMode);
});

el('export-btn').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'get_snapshots' }, (res) => {
    const data = JSON.stringify(res?.snapshots || [], null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dfk-companion-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });
});

el('copy-snapshot-btn').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'get_snapshots' }, (res) => {
    const snaps = res?.snapshots || [];
    const latest = snaps[snaps.length - 1];
    if (latest) {
      navigator.clipboard.writeText(JSON.stringify(latest, null, 2)).then(() => {
        el('copy-snapshot-btn').textContent = 'Copied!';
        setTimeout(() => { el('copy-snapshot-btn').textContent = 'Copy Latest'; }, 1500);
      });
    }
  });
});

el('clear-btn').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'clear_snapshots' }, () => {
    lastSnapshots = [];
    el('event-list').innerHTML = '';
    el('parse-failures').textContent = '';
  });
});

el('reconcile-btn').addEventListener('click', () => {
  chrome.storage.local.get(['lastUnitSnapshot'], (result) => {
    const snapshot = result.lastUnitSnapshot;
    if (!snapshot) {
      el('reconcile-status').textContent = 'No stat panel captured yet. Open a hero/enemy panel in-game first.';
      el('reconcile-status').style.color = '#f59e0b';
      return;
    }
    el('reconcile-status').textContent = 'Reconciling...';
    el('reconcile-status').style.color = '#64748b';
    chrome.runtime.sendMessage({ type: 'reconcile', snapshot });
  });
});

el('open-companion-link').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.storage.local.get(['hostUrl'], (result) => {
    const host = result.hostUrl || 'https://your-app.replit.app';
    const url = `${host.replace(/\/+$/, '')}/admin/hunt-companion`;
    chrome.tabs.create({ url });
  });
});

document.addEventListener('DOMContentLoaded', loadAndRender);
loadAndRender();
