/**
 * Turn State Aggregator
 * Synthesizes a full turn_snapshot from battle log events + HP/MP readings.
 * Tracks active unit, legal action buttons, selected target, HP/MP for all visible units.
 *
 * Tiered selector strategy:
 *   Tier A — semantic data attributes (highest confidence, most stable)
 *   Tier B — aria-label and visible button text
 *   Tier C — class pattern matching (current approach, kept as fallback)
 *   Tier D — structural DOM inference (last resort: find panel by shape, not by name)
 *
 * Diagnostic: call window.__dfkDiag() from the browser console at any time.
 */

(function () {
  if (typeof window.__dfkTurnStateParser !== 'undefined') return;
  window.__dfkTurnStateParser = true;

  window.__dfkSelectorDiag = window.__dfkSelectorDiag || {};

  // ── Tier A: stable semantic data attributes ──────────────────────────────
  const ACTION_TIER_A = [
    'button[data-action]',
    'button[data-skill]',
    'button[data-ability]',
    '[data-action-type="skill"]',
    '[data-action-type="ability"]',
    '[data-action-type="attack"]',
  ];

  // ── Tier C: class pattern matching ──
  // DFK-specific stable (non-hashed) selectors come first
  const ACTION_TIER_C = [
    '.hero-abilities button',
    '.hero-abilities [role="button"]',
    '[class*="action-btn"]', '[class*="ActionBtn"]',
    '[class*="skill-btn"]', '[class*="SkillBtn"]',
    '[class*="action-button"]', '[class*="ActionButton"]',
    '[class*="combat-action"]', '[class*="CombatAction"]',
    '[class*="ability-btn"]', '[class*="AbilityBtn"]',
  ];

  const HP_BAR_SELECTORS = [
    '.mana-bar .progress-text',
    '.progress-text',
    '.mana-bar',
    '.custom-progress-bar',
    '[data-unit-hp]', '[data-hp]',
    '[class*="hp-bar"]', '[class*="HpBar"]',
    '[class*="health-bar"]', '[class*="HealthBar"]',
    '[class*="hero-hp"]', '[class*="HeroHp"]',
  ];

  const ACTIVE_UNIT_SELECTORS = [
    '[data-active="true"]', '[data-current-turn="true"]',
    '[class*="active-unit"]', '[class*="ActiveUnit"]',
    '[class*="current-turn"]', '[class*="CurrentTurn"]',
    '.turn-count-label',
  ];

  const TARGET_SELECTORS = [
    '[data-selected="true"]', '[data-targeted="true"]',
    '[class*="selected-target"]', '[class*="SelectedTarget"]',
    '[class*="target-selected"]',
  ];

  let currentTurnState = {
    turnNumber: 0,
    activeUnit: null,
    activeHeroSlot: null,
    legalActions: [],
    legalConsumables: [],
    selectedTarget: null,
    selectedTargetSide: null,
    heroes: [],
    enemies: [],
    battleBudgetRemaining: null,
    turnOrder: [],
    lastUpdated: null,
  };

  let latestNetworkTurnOrder = {
    entries: [],
    capturedAt: 0,
    url: null,
    transport: null,
  };

  // ── Helpers ───────────────────────────────────────────────────────────────

  function extractNumber(text) {
    if (!text) return null;
    const m = text.replace(/,/g, '').match(/([\d]+)/);
    return m ? parseInt(m[1], 10) : null;
  }

  function extractHpMp(el) {
    const text = el.textContent || '';
    const attr = el.getAttribute('data-hp') || el.getAttribute('data-unit-hp');
    if (attr) {
      const m = attr.match(/([\d]+)\/([\d]+)/);
      if (m) return { current: parseInt(m[1], 10), max: parseInt(m[2], 10) };
      return { current: parseInt(attr, 10), max: null };
    }
    const m = text.match(/([\d,]+)\s*\/\s*([\d,]+)/);
    if (m) return { current: parseInt(m[1].replace(/,/g, ''), 10), max: parseInt(m[2].replace(/,/g, ''), 10) };
    const single = extractNumber(text);
    if (single !== null) return { current: single, max: null };
    return null;
  }

  function recordSelectorDiag(category, bySelector) {
    const total = Object.values(bySelector).reduce((s, n) => s + n, 0);
    window.__dfkSelectorDiag[category] = { total, bySelector, recordedAt: Date.now() };
  }

  // ── HP bar reading ────────────────────────────────────────────────────────

  function inferUnitNameFromContext(el) {
    let node = el;
    for (let i = 0; i < 6; i++) {
      node = node?.parentElement;
      if (!node) break;
      const nameEl = node.querySelector('[class*="name"],[class*="Name"],[class*="hero-name"],[class*="unit-name"],.turn-count-label');
      if (nameEl) {
        const text = nameEl.textContent.trim();
        if (text && text.length > 1 && text.length < 50 && !/^\d+$/.test(text)) return text;
      }
    }
    return null;
  }

  function inferSideFromPosition(el) {
    if (el.closest('[class*="enemy"]')) return 'enemy';
    if (el.closest('[class*="Enemy"]')) return 'enemy';
    if (el.closest('[class*="monster"]')) return 'enemy';
    if (el.closest('[class*="hero"]')) return 'player';
    if (el.closest('[class*="player"]')) return 'player';
    const rect = el.getBoundingClientRect();
    const viewW = window.innerWidth;
    if (rect.left > viewW * 0.55) return 'enemy';
    if (rect.right < viewW * 0.45) return 'player';
    return 'player';
  }

  function readHpBars() {
    const units = [];
    const seen = new Set();
    const diagCounts = {};

    for (const sel of HP_BAR_SELECTORS) {
      let count = 0;
      document.querySelectorAll(sel).forEach((el, i) => {
        if (seen.has(el)) return;
        const hp = extractHpMp(el);
        if (!hp) return;
        seen.add(el);
        count++;
        const slot = parseInt(el.getAttribute('data-slot') || el.getAttribute('data-index') || `${i}`, 10);
        const side = el.getAttribute('data-side') || inferSideFromPosition(el);
        const name = el.getAttribute('data-name') || el.getAttribute('data-unit-name') ||
          el.closest('[data-name]')?.getAttribute('data-name') || inferUnitNameFromContext(el);
        units.push({ slot, side, name, hp: hp.current, maxHp: hp.max });
      });
      diagCounts[sel] = count;
    }

    // Tier D: scan leaf nodes for NNN/NNN pattern when standard selectors miss
    if (units.length === 0) {
      const combatRoot = document.body;
      const walker = document.createTreeWalker(combatRoot, NodeFilter.SHOW_TEXT, null);
      let node;
      while ((node = walker.nextNode())) {
        const text = node.textContent.trim();
        if (/^\d{1,6}\/\d{1,6}$/.test(text)) {
          const el = node.parentElement;
          if (!el || seen.has(el)) continue;
          const hp = extractHpMp(el);
          if (!hp) continue;
          seen.add(el);
          const side = inferSideFromPosition(el);
          const name = inferUnitNameFromContext(el);
          units.push({ slot: units.length, side, name, hp: hp.current, maxHp: hp.max, _tier: 'D' });
        }
      }
      diagCounts['tier-D-text-scan'] = units.length;
    }

    recordSelectorDiag('hp_bars', diagCounts);
    return units;
  }

  function readMpBars() {
    const units = [];
    const mpSelectors = HP_BAR_SELECTORS.map(s => s.replace(/hp/gi, 'mp').replace(/health/gi, 'mana'));
    const diagCounts = {};
    for (const sel of mpSelectors) {
      let count = 0;
      document.querySelectorAll(sel).forEach((el, i) => {
        const mp = extractHpMp(el);
        if (!mp) return;
        count++;
        const slot = parseInt(el.getAttribute('data-slot') || el.getAttribute('data-index') || `${i}`, 10);
        units.push({ slot, mp: mp.current, maxMp: mp.max });
      });
      diagCounts[sel] = count;
    }
    recordSelectorDiag('mp_bars', diagCounts);
    return units;
  }

  // ── Legal action reading — tiered ─────────────────────────────────────────

  function dedupeActions(actions) {
    const seen = new Set();
    return actions.filter(a => {
      const key = a.name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function extractActionFromBtn(btn) {
    if (btn.disabled || btn.getAttribute('aria-disabled') === 'true') return null;
    const name = btn.getAttribute('data-action') || btn.getAttribute('data-skill') ||
      btn.getAttribute('data-ability') || btn.getAttribute('aria-label') ||
      btn.textContent.trim();
    const skillId = btn.getAttribute('data-skill-id') || btn.getAttribute('data-action-id') || null;
    if (!name || name.length < 2 || name.length > 50) return null;
    const lower = name.toLowerCase();
    return {
      name: name.slice(0, 40),
      skillId,
      type: lower.includes('attack') ? 'basic_attack' : 'skill',
      available: true,
      requiresTarget: !lower.includes('self'),
      sourceConfidence: 0.8,
      _el: btn,
    };
  }

  function findActionPanelByStructure() {
    const dfkPanel = document.querySelector('.hero-abilities');
    if (dfkPanel) {
      const buttons = dfkPanel.querySelectorAll('button:not([disabled]),[role="button"]');
      if (buttons.length >= 1) return dfkPanel;
    }
    const candidates = document.querySelectorAll(
      '[class*="action"],[class*="skill"],[class*="combat"],[class*="ability"],[class*="menu"]'
    );
    let best = null, bestScore = 0;
    for (const el of candidates) {
      const buttons = el.querySelectorAll('button:not([disabled])');
      if (buttons.length < 2 || buttons.length > 12) continue;
      const textButtons = [...buttons].filter(b => {
        const t = b.textContent.trim();
        return t.length >= 2 && t.length <= 40 && !/^\d+$/.test(t);
      });
      if (textButtons.length >= 2 && textButtons.length > bestScore) {
        best = el;
        bestScore = textButtons.length;
      }
    }
    return best;
  }

  function readLegalActions() {
    const actions = [];
    const diagCounts = {};
    let tier = null;

    // Tier A: semantic data attributes
    for (const sel of ACTION_TIER_A) {
      let count = 0;
      document.querySelectorAll(sel).forEach(btn => {
        const a = extractActionFromBtn(btn);
        if (a) { actions.push(a); count++; }
      });
      diagCounts[`A:${sel}`] = count;
    }
    if (actions.length > 0) { tier = 'A'; }

    // Tier B: aria-label on any button (only if Tier A found nothing)
    if (actions.length === 0) {
      let count = 0;
      document.querySelectorAll('button[aria-label],[role="button"][aria-label]').forEach(btn => {
        const a = extractActionFromBtn(btn);
        if (a) { actions.push(a); count++; }
      });
      diagCounts['B:aria-label'] = count;
      if (actions.length > 0) tier = 'B';
    }

    // Tier C: class pattern matching (only if Tiers A+B found nothing)
    if (actions.length === 0) {
      for (const sel of ACTION_TIER_C) {
        let count = 0;
        document.querySelectorAll(sel).forEach(btn => {
          const a = extractActionFromBtn(btn);
          if (a) { actions.push(a); count++; }
        });
        diagCounts[`C:${sel}`] = count;
      }
      if (actions.length > 0) tier = 'C';
    }

    // Tier D: structural scan (only if still nothing)
    if (actions.length === 0) {
      const panel = findActionPanelByStructure();
      if (panel) {
        let count = 0;
        panel.querySelectorAll('button:not([disabled])').forEach(btn => {
          const a = extractActionFromBtn(btn);
          if (a) { actions.push(a); count++; }
        });
        diagCounts['D:structural'] = count;
        if (actions.length > 0) tier = 'D';
      } else {
        diagCounts['D:structural'] = 0;
      }
    }

    recordSelectorDiag('action_buttons', diagCounts);
    window.__dfkSelectorDiag.action_tier_used = tier;

    return dedupeActions(actions).map(({ _el, ...rest }) => rest);
  }

  // ── Active unit & target ──────────────────────────────────────────────────

  function readActiveUnit() {
    const diagCounts = {};
    for (const sel of ACTIVE_UNIT_SELECTORS) {
      const el = document.querySelector(sel);
      diagCounts[sel] = el ? 1 : 0;
      if (el) {
        const name = el.getAttribute('data-name') || el.getAttribute('data-unit-name') || el.textContent.trim().slice(0, 40);
        const slot = el.getAttribute('data-slot') ? parseInt(el.getAttribute('data-slot'), 10) : null;
        recordSelectorDiag('active_unit', diagCounts);
        return { name, slot };
      }
    }
    recordSelectorDiag('active_unit', diagCounts);
    return null;
  }

  function readSelectedTarget() {
    for (const sel of TARGET_SELECTORS) {
      const el = document.querySelector(sel);
      if (el) {
        const name = el.getAttribute('data-name') || el.getAttribute('data-unit-name') || el.textContent.trim().slice(0, 40);
        const side = el.getAttribute('data-side') || null;
        return { name, side };
      }
    }
    return null;
  }

  function readBattleBudget() {
    const allText = document.querySelectorAll('span,div,p');
    for (const el of allText) {
      const text = (el.textContent || '').trim();
      const match = text.match(/battle budget:\s*(\d+)/i);
      if (match) return parseInt(match[1], 10);
    }
    return null;
  }

  function readConsumables() {
    const list = [];
    const seen = new Set();
    document.querySelectorAll('[title],[data-name],[class*="consum"],[class*="item"]').forEach((el) => {
      const name = el.getAttribute('data-name') || el.getAttribute('title') || '';
      if (!name) return;
      const lower = name.toLowerCase();
      if (!/(potion|tonic|philter|consum|stone|item)/i.test(lower)) return;
      if (seen.has(lower)) return;
      seen.add(lower);
      list.push({
        name,
        skillId: null,
        type: 'consumable',
        available: true,
        sourceConfidence: 0.6,
      });
    });
    return list;
  }

  function readTurnOrderModal() {
    function isVisible(el) {
      if (!el) return false;
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    }

    function buildEntry(name, ticksUntilTurn, ordinal) {
      const side = /boar|enemy|monster|clucker|rocboc|wolf/i.test(name) ? 'enemy' : 'player';
      const slotMatch = name.match(/(\d+)$/);
      return {
        unitId: `${side}:${slotMatch ? slotMatch[1] : 'na'}:${name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
        name,
        side,
        slot: slotMatch ? parseInt(slotMatch[1], 10) : null,
        ticksUntilTurn,
        ordinal,
      };
    }

    function findTurnOrderRoot() {
      const headings = [...document.querySelectorAll('h1,h2,h3,h4,div,p,span')]
        .filter((el) => isVisible(el) && /turn order/i.test((el.textContent || '').trim()));

      for (const heading of headings) {
        let node = heading;
        for (let depth = 0; depth < 5 && node; depth += 1) {
          const text = (node.textContent || '').replace(/\s+/g, ' ').trim();
          if (/ticks until turn/i.test(text) && /combatant:/i.test(text)) return node;
          node = node.parentElement;
        }
      }
      return null;
    }

    const entries = [];
    const root = findTurnOrderRoot();
    const textNodes = root ? root.querySelectorAll('div,li') : document.querySelectorAll('div,li');

    textNodes.forEach((el, index) => {
      if (!isVisible(el)) return;
      const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
      const inlineMatch = text.match(/Combatant:\s*(.+?)\s*Ticks Until Turn:\s*([\d.]+)/i);
      if (inlineMatch) {
        entries.push(buildEntry(inlineMatch[1].trim(), parseFloat(inlineMatch[2]), entries.length || index));
        return;
      }

      const lines = (el.textContent || '')
        .split(/\n+/)
        .map((line) => line.replace(/\s+/g, ' ').trim())
        .filter(Boolean);
      const combatantLine = lines.find((line) => /^Combatant:/i.test(line));
      const ticksLine = lines.find((line) => /^Ticks Until Turn:/i.test(line));
      if (!combatantLine || !ticksLine) return;

      const name = combatantLine.replace(/^Combatant:\s*/i, '').trim();
      const ticksMatch = ticksLine.match(/([\d.]+)/);
      if (!name || !ticksMatch) return;

      entries.push(buildEntry(name, parseFloat(ticksMatch[1]), entries.length || index));
    });

    return entries
      .filter((entry, index, arr) => arr.findIndex((other) => other.unitId === entry.unitId && other.ticksUntilTurn === entry.ticksUntilTurn) === index)
      .slice(0, 12);
  }

  function readTurnOrder() {
    const recentNetworkEntries = Array.isArray(latestNetworkTurnOrder.entries) ? latestNetworkTurnOrder.entries : [];
    const networkIsFresh = recentNetworkEntries.length > 0 && (Date.now() - (latestNetworkTurnOrder.capturedAt || 0)) < 30000;
    if (networkIsFresh) {
      window.__dfkSelectorDiag.turn_order_source = 'network';
      window.__dfkSelectorDiag.turn_order_transport = latestNetworkTurnOrder.transport || null;
      return recentNetworkEntries.slice(0, 12);
    }

    const modalEntries = readTurnOrderModal();
    window.__dfkSelectorDiag.turn_order_source = modalEntries.length > 0 ? 'modal' : 'none';
    return modalEntries;
  }

  // ── Snapshot builder ──────────────────────────────────────────────────────

  function buildTurnSnapshot() {
    const hpReadings = readHpBars();
    const mpReadings = readMpBars();
    const activeUnit = readActiveUnit();
    const legalActions = readLegalActions();
    const selectedTarget = readSelectedTarget();
    const battleBudgetRemaining = readBattleBudget();
    const legalConsumables = readConsumables();
    const turnOrder = readTurnOrder();

    const unitMap = {};
    hpReadings.forEach(u => {
      const key = `${u.side}:${u.name || u.slot}`;
      if (!unitMap[key] || (u.hp != null && unitMap[key].hp == null)) {
        unitMap[key] = { ...u };
      }
    });
    mpReadings.forEach(u => {
      const key = `player:${u.name || u.slot}`;
      if (unitMap[key]) {
        unitMap[key].mp = u.mp;
        unitMap[key].maxMp = u.maxMp;
      }
    });

    const heroes = Object.values(unitMap).filter(u => u.side === 'player');
    const enemies = Object.values(unitMap).filter(u => u.side === 'enemy');

    currentTurnState = {
      ...currentTurnState,
      activeUnit: activeUnit?.name || null,
      activeHeroSlot: activeUnit?.slot ?? null,
      legalActions,
      legalConsumables,
      selectedTarget: selectedTarget?.name || null,
      selectedTargetSide: selectedTarget?.side || null,
      heroes,
      enemies,
      battleBudgetRemaining,
      turnOrder,
      lastUpdated: Date.now(),
    };

    return {
      type: 'turn_snapshot',
      ...currentTurnState,
    };
  }

  function emitSnapshot() {
    const snapshot = buildTurnSnapshot();
    window.__dfkEmitEvent('turn_snapshot', snapshot);
    updateDiagStatusLine();
  }

  // ── Diagnostic status line (for overlay) ─────────────────────────────────

  function updateDiagStatusLine() {
    const ts = currentTurnState;
    const logOk = !!(window.__dfkBattleLogAttached);
    const sessId = window.__dfkSessionId || null;
    const sessShort = sessId ? sessId.toString().slice(-4) : null;

    const profiles = (typeof window !== 'undefined' && window.__dfkHeroProfiles) || [];
    const profileAbilityCount = profiles.reduce((sum, p) => {
      return sum + (p.active1 ? 1 : 0) + (p.active2 ? 1 : 0);
    }, 0);

    const actCount = profileAbilityCount > 0 ? profileAbilityCount : ts.legalActions.length;
    const actionWarn = actCount === 0 ? ' ⚠' : '';

    window.__dfkDiagStatus = [
      logOk ? '[LOG ✓]' : '[LOG ✗]',
      `[${ts.heroes.length}H ${ts.enemies.length}E]`,
      `[${actCount} ACT${actionWarn}]`,
      `[T${ts.turnNumber}]`,
      sessShort ? `[SESS ${sessShort}]` : '[NO SESS ⚠]',
    ].join(' ');

    if (window.__dfkUpdateDiagBar) window.__dfkUpdateDiagBar(window.__dfkDiagStatus);
  }

  // ── Public API ────────────────────────────────────────────────────────────

  window.__dfkAdvanceTurn = (turnNumber) => {
    if (turnNumber > currentTurnState.turnNumber) {
      currentTurnState.turnNumber = turnNumber;
    }
  };

  window.__dfkGetTurnState = () => currentTurnState;

  window.__dfkDiag = function () {
    const ts = currentTurnState;
    const report = {
      url: window.location.href,
      title: document.title,
      battleLogAttached: !!(window.__dfkBattleLogAttached),
      battleLogSelector: window.__dfkBattleLogSelector || null,
      heroCount: ts.heroes.length,
      enemyCount: ts.enemies.length,
      legalActionCount: ts.legalActions.length,
      legalActionNames: ts.legalActions.map(a => a.name),
      legalActionTierUsed: window.__dfkSelectorDiag?.action_tier_used || null,
      activeUnit: ts.activeUnit,
      turnNumber: ts.turnNumber,
      lastUpdatedMsAgo: ts.lastUpdated ? Date.now() - ts.lastUpdated : null,
      sessionId: window.__dfkSessionId || null,
      sessionIdSource: window.__dfkSessionIdSource || null,
      engineReady: !!(window.__dfkDataLoader?.isLoaded?.()),
      lastRecommendation: window.__dfkLastRecommendation || null,
      selectorDiag: window.__dfkSelectorDiag || {},
    };

    document.dispatchEvent(new CustomEvent('dfk-request-network-log'));

    var networkSection = null;
    try {
      var cached = window.__dfkNetworkLogCache;
      if (cached) {
        var panelOpenCount = 0;
        var detectedTransport = 'none';
        var entries = cached.entries || [];
        for (var ni = 0; ni < entries.length; ni++) {
          if (entries[ni].panelOpenAtCapture) {
            panelOpenCount++;
            if (detectedTransport === 'none' && entries[ni].transport && entries[ni].transport !== 'unknown') {
              detectedTransport = entries[ni].transport;
            }
          }
        }
        var lastEntries = entries.slice(-3).map(function (e) {
          return {
            url: (e.url || '').slice(0, 500),
            method: e.method || 'unknown',
            responseBody: (e.responseBody || '').slice(0, 300),
            transport: e.transport || 'unknown',
            panelOpenAtCapture: !!e.panelOpenAtCapture,
            classified: e.classified,
          };
        });
        networkSection = {
          totalCaptured: cached.totalEntries || 0,
          panelOpenEntries: panelOpenCount,
          detectedTransport: detectedTransport,
          networkActive: !!window.__dfkBattleLogNetworkActive,
          lastEntries: lastEntries,
        };
      } else {
        networkSection = {
          totalCaptured: 0,
          panelOpenEntries: 0,
          detectedTransport: 'none',
          networkActive: !!window.__dfkBattleLogNetworkActive,
          lastEntries: [],
          note: 'No network log data received from MAIN world yet',
        };
      }
    } catch (_) {
      networkSection = { error: 'Failed to read network capture log' };
    }
    report.networkCapture = networkSection;

    console.group('[DFK Diagnostic Report]');
    console.table({
      'Battle log attached': report.battleLogAttached,
      'Battle log selector': report.battleLogSelector,
      'Heroes found': report.heroCount,
      'Enemies found': report.enemyCount,
      'Legal actions': report.legalActionCount,
      'Action tier used': report.legalActionTierUsed,
      'Active unit': report.activeUnit,
      'Turn #': report.turnNumber,
      'Last update (ms ago)': report.lastUpdatedMsAgo,
      'Session ID': report.sessionId,
      'Session ID source': report.sessionIdSource,
      'Engine ready': report.engineReady,
      'Network active': report.networkCapture ? report.networkCapture.networkActive : false,
    });
    if (report.legalActionNames.length) {
      console.log('Legal actions:', report.legalActionNames);
    }
    if (report.lastRecommendation) {
      console.log('Last recommendation:', report.lastRecommendation);
    }
    if (Object.keys(report.selectorDiag).length) {
      console.log('Selector match counts:', report.selectorDiag);
    }
    if (networkSection) {
      console.group('Network Capture');
      console.log('Total captured:', networkSection.totalCaptured);
      console.log('Panel-open entries:', networkSection.panelOpenEntries);
      console.log('Detected transport:', networkSection.detectedTransport);
      console.log('Network source active:', networkSection.networkActive);
      if (networkSection.lastEntries && networkSection.lastEntries.length > 0) {
        console.log('Last entries:');
        for (var li = 0; li < networkSection.lastEntries.length; li++) {
          var le = networkSection.lastEntries[li];
          console.log('  ' + le.method + ' ' + le.url);
          if (le.requestBody) {
            console.log('    request body (truncated):', (le.requestBody || '').slice(0, 200));
          }
          console.log('    response (first 300 chars):', le.responseBody);
        }
      }
      console.groupEnd();
    }
    console.groupEnd();

    return report;
  };

  // ── Polling (replaces body-level MutationObserver to avoid feedback loops) ─

  function scheduleModalCapture(reason) {
    const delays = [120, 350, 700];
    delays.forEach((delay) => {
      window.setTimeout(() => {
        emitSnapshot();
      }, delay);
    });
    window.__dfkSelectorDiag.modal_capture_reason = reason;
    window.__dfkSelectorDiag.modal_capture_scheduled_at = Date.now();
  }

  document.addEventListener('dfk-network-turn-order', function (event) {
    const detail = event.detail || {};
    const entries = Array.isArray(detail.entries) ? detail.entries : [];
    if (entries.length === 0) return;

    latestNetworkTurnOrder = {
      entries,
      capturedAt: detail.capturedAt || Date.now(),
      url: detail.url || null,
      transport: detail.transport || null,
    };
    window.__dfkSelectorDiag.turn_order_network_last_seen = latestNetworkTurnOrder.capturedAt;
    window.__dfkSelectorDiag.turn_order_network_count = entries.length;
    emitSnapshot();
  });

  document.addEventListener('click', (event) => {
    const target = event.target && event.target.closest ? event.target.closest('button,[role="button"],img') : null;
    if (!target) return;

    const text = ((target.textContent || '') + ' ' + (target.getAttribute('aria-label') || '') + ' ' + (target.getAttribute('alt') || ''))
      .replace(/\s+/g, ' ')
      .trim();
    const classText = typeof target.className === 'string' ? target.className : '';

    if (/turnindicator|timeline/i.test(classText) || /turn order/i.test(text)) {
      scheduleModalCapture('turn_order_trigger');
      return;
    }

    if (/battle logs?/i.test(text)) {
      scheduleModalCapture('battle_logs_trigger');
    }
  }, true);

  setInterval(emitSnapshot, 1000);
})();
