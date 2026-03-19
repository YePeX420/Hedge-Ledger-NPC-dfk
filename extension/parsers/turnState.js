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
  let latestModalTurnOrder = {
    entries: [],
    capturedAt: 0,
    turnNumber: null,
  };
  let lastTurnOrderPrimeAt = 0;
  let turnOrderPrimeInFlight = false;
  let lastUserInteractionAt = Date.now();
  let lastCommandPanelDebug = null;
  const ENABLE_TURN_ORDER_AUTO_PRIME = true;

  // ── Helpers ───────────────────────────────────────────────────────────────

  function extractNumber(text) {
    if (!text) return null;
    const m = text.replace(/,/g, '').match(/([\d]+)/);
    return m ? parseInt(m[1], 10) : null;
  }

  function normalizeText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function normalizedName(value) {
    return normalizeText(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  }

  window.addEventListener('pointerdown', () => {
    lastUserInteractionAt = Date.now();
  }, true);
  window.addEventListener('keydown', () => {
    lastUserInteractionAt = Date.now();
  }, true);

  function extractImageUrl(el) {
    if (!el) return null;
    if (el.tagName === 'IMG') {
      const src = el.currentSrc || el.src || el.getAttribute('src');
      return src ? String(src) : null;
    }
    const nestedImg = el.querySelector?.('img');
    if (nestedImg) {
      const src = nestedImg.currentSrc || nestedImg.src || nestedImg.getAttribute('src');
      if (src) return String(src);
    }
    const scanNodes = [el, ...(el.querySelectorAll ? Array.from(el.querySelectorAll('*')).slice(0, 10) : [])];
    for (const node of scanNodes) {
      try {
        const bg = window.getComputedStyle(node).backgroundImage || '';
        const match = bg.match(/url\((['"]?)(.*?)\1\)/i);
        if (match?.[2] && !/^data:/i.test(match[2])) return match[2];
      } catch (_) {}
    }
    return null;
  }

  function labelFromAssetUrl(url) {
    if (!url) return '';
    try {
      const cleanUrl = String(url).split('#')[0].split('?')[0];
      const parts = cleanUrl.split('/').filter(Boolean);
      if (parts.length === 0) return '';
      const file = parts[parts.length - 1].replace(/\.(png|jpg|jpeg|webp|gif|svg)$/i, '');
      const parent = parts.length > 1 ? parts[parts.length - 2] : '';
      const base = file
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/[_-]+/g, ' ')
        .trim();
      if (!base) return '';
      if (/^(icon|ability|skill|item|consumable)$/i.test(base) && parent) {
        return parent
          .replace(/([a-z])([A-Z])/g, '$1 $2')
          .replace(/[_-]+/g, ' ')
          .trim();
      }
      return base;
    } catch (_) {
      return '';
    }
  }

  function findPortraitImage(name, side) {
    const key = normalizedName(name);
    if (!key) return null;
    if (side === 'player') {
      const activePanel = document.querySelector('.hero-ui-panel-active-content.highlightedCard, .hero-ui-panel-active-content');
      const activeName = activePanel ? normalizedName(inferHeroNameFromPanel(activePanel)) : null;
      if (activePanel && activeName && activeName === key) {
        const activePortrait = activePanel.querySelector('.hero-img img, .hero-img-container .hero-img img');
        const imageUrl = extractImageUrl(activePortrait || activePanel);
        if (imageUrl) return imageUrl;
      }
    }
    const selectors = side === 'enemy'
      ? ['[class*="enemy"] img', '[class*="monster"] img', '[class*="enemy"] [style*="background-image"]', '[class*="monster"] [style*="background-image"]']
      : ['[class*="hero"] img', '[class*="player"] img', '[class*="hero"] [style*="background-image"]', '[class*="player"] [style*="background-image"]'];
    for (const sel of selectors) {
      const nodes = Array.from(document.querySelectorAll(sel)).filter(isVisible).slice(0, 40);
      for (const node of nodes) {
        const contextText = normalizeText(node.closest?.('div,section,article,aside')?.textContent || '');
        if (!contextText) continue;
        const normalizedContext = normalizedName(contextText);
        if (!normalizedContext.includes(key) && !key.includes(normalizedContext)) continue;
        const imageUrl = extractImageUrl(node);
        if (imageUrl) return imageUrl;
      }
    }
    return null;
  }

  function inferStatusIconUrl(name) {
    const key = normalizedName(name);
    if (!key) return null;
    const candidates = Array.from(document.querySelectorAll('img,[style*="background-image"],[title],[aria-label]'))
      .filter(isVisible)
      .slice(0, 500);
    for (const el of candidates) {
      const label = normalizeText(
        el.getAttribute?.('alt') ||
        el.getAttribute?.('title') ||
        el.getAttribute?.('aria-label') ||
        el.textContent
      );
      if (!label) continue;
      const normalizedLabel = normalizedName(label);
      if (!normalizedLabel.includes(key) && !key.includes(normalizedLabel)) continue;
      const imageUrl = extractImageUrl(el);
      if (imageUrl) return imageUrl;
    }
    return null;
  }

  function currentHuntKey() {
    const match = String(window.location.href || '').match(/\/hunt\/(\d+-\d+)/i);
    return match ? match[1] : null;
  }

  function getHeroProfiles() {
    return (typeof window !== 'undefined' && Array.isArray(window.__dfkHeroProfiles))
      ? window.__dfkHeroProfiles
      : [];
  }

  function normalizeHeroId(value) {
    return String(value || '').trim();
  }

  function getOrderedHeroProfiles() {
    return getHeroProfiles()
      .map((profile, index) => ({ ...profile, _index: index }))
      .sort((a, b) => {
        const aSlot = Number.isFinite(Number(a.slot)) ? Number(a.slot) : a._index;
        const bSlot = Number.isFinite(Number(b.slot)) ? Number(b.slot) : b._index;
        return aSlot - bSlot;
      });
  }

  function turnOrderCaptureKey() {
    const huntKey = currentHuntKey();
    return huntKey ? `dfk_turn_order_captured:${huntKey}` : null;
  }

  function hasCapturedTurnOrderForHunt() {
    try {
      const key = turnOrderCaptureKey();
      return key ? window.sessionStorage.getItem(key) === '1' : false;
    } catch (_) {
      return false;
    }
  }

  function markTurnOrderCapturedForHunt() {
    try {
      const key = turnOrderCaptureKey();
      if (key) window.sessionStorage.setItem(key, '1');
    } catch (_) {}
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

  function isUiChromeLabel(name) {
    return /^(menu|battle logs?|flee|observe|recommend|auto|manual|copy|archive|selected|open|close|logout|refresh sessions?)$/i.test(normalizeText(name));
  }

  function classifyActionGroup(name) {
    const lower = String(name || '').toLowerCase();
    if (/^(attack|swap|skip)$/.test(lower)) return 'actions';
    if (/(potion|tonic|philter|frame|stone|elixir|consum)/.test(lower)) return 'items';
    if (/(passive|deathmark|blinding winds|hero frame)/.test(lower)) return 'abilities';
    return 'skills';
  }

  function isVisiblyUnavailable(el) {
    if (!el) return false;
    const nodes = [el];
    let parent = el.parentElement;
    for (let i = 0; i < 3 && parent; i += 1) {
      nodes.push(parent);
      parent = parent.parentElement;
    }
    if (el.querySelectorAll) {
      nodes.push(...Array.from(el.querySelectorAll('*')).slice(0, 6));
    }
    return nodes.some((node) => {
      try {
        const style = window.getComputedStyle(node);
        const opacity = parseFloat(style.opacity || '1');
        const filter = String(style.filter || '');
        const className = String(node.className || '');
        return opacity < 0.85 ||
          /grayscale|brightness\(0\.[0-8]\)/i.test(filter) ||
          /disabled|inactive|cooldown|locked|unavailable|spent|used/i.test(className);
      } catch (_) {
        return false;
      }
    });
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

  function extractButtonLabel(btn) {
    if (!btn) return '';
    const direct = [
      btn.getAttribute('data-action'),
      btn.getAttribute('data-skill'),
      btn.getAttribute('data-ability'),
      btn.getAttribute('data-name'),
      btn.getAttribute('title'),
      btn.getAttribute('aria-label'),
      btn.textContent,
    ];
    for (const value of direct) {
      const clean = normalizeText(value);
      if (clean) return clean;
    }
    const child = btn.querySelector('img[alt],img[title],[title],[aria-label]');
    if (!child) return '';
    const childLabel = normalizeText(
      child.getAttribute('alt') ||
      child.getAttribute('title') ||
      child.getAttribute('aria-label') ||
      child.textContent
    );
    if (childLabel) return childLabel;
    return normalizeText(labelFromAssetUrl(extractImageUrl(btn)));
  }

  function isLikelyCombatantName(value) {
    const text = normalizeText(value);
    if (!text || text.length < 3 || text.length > 48) return false;
    if (/^(actions|skills|abilities|passives|items|battle budget|hp|mp|fx)$/i.test(text)) return false;
    if (/^\d+(?:\/\d+)?$/.test(text)) return false;
    return /[a-z]/i.test(text);
  }

  function countVisibleButtons(root) {
    if (!root) return 0;
    return Array.from(root.querySelectorAll('button,[role="button"]')).filter(isVisible).length;
  }

  function findCommandPanelRoot() {
    const seeds = Array.from(document.querySelectorAll('div,section,article,p,span'))
      .filter((el) => {
        if (!isVisible(el)) return false;
        const text = normalizeText(el.textContent);
        return /battle budget|actions|skills|abilities|passives/i.test(text);
      })
      .slice(0, 80);

    let best = null;
    let bestScore = 0;
    const seen = new Set();

    seeds.forEach((seed) => {
      let node = seed;
      for (let depth = 0; depth < 6 && node; depth += 1) {
        if (seen.has(node)) {
          node = node.parentElement;
          continue;
        }
        seen.add(node);
        if (!isVisible(node)) {
          node = node.parentElement;
          continue;
        }
        const rect = node.getBoundingClientRect();
        const text = normalizeText(node.textContent);
        const buttons = countVisibleButtons(node);
        let score = 0;
        if (rect.top > window.innerHeight * 0.5) score += 4;
        if (rect.width > window.innerWidth * 0.15) score += 2;
        if (/battle budget/i.test(text)) score += 7;
        if (/\bactions\b/i.test(text)) score += 3;
        if (/\bskills\b/i.test(text)) score += 3;
        if (/\babilities\b/i.test(text)) score += 3;
        if (/\bpassives\b/i.test(text)) score += 2;
        if (buttons >= 3 && buttons <= 20) score += Math.min(buttons, 8);
        if (score > bestScore) {
          best = node;
          bestScore = score;
        }
        node = node.parentElement;
      }
    });

    lastCommandPanelDebug = best ? {
      detected: true,
      score: bestScore,
      text: normalizeText(best.textContent).slice(0, 240),
      buttonCount: countVisibleButtons(best),
      rect: (() => {
        const rect = best.getBoundingClientRect();
        return { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height) };
      })(),
    } : {
      detected: false,
      score: 0,
      text: null,
      buttonCount: 0,
      rect: null,
    };

    window.__dfkSelectorDiag.command_panel = lastCommandPanelDebug;
    return best;
  }

  function inferHeroNameFromPanel(panel) {
    if (!panel) return null;
    const panelRect = panel.getBoundingClientRect();
    const candidates = Array.from(panel.querySelectorAll('h1,h2,h3,h4,div,span,p'))
      .filter(isVisible)
      .map((el) => {
        const text = normalizeText(el.textContent);
        if (!isLikelyCombatantName(text)) return null;
        if (/hp|mp|fx|actions|skills|abilities|passives|battle budget/i.test(text)) return null;
        const elRect = el.getBoundingClientRect();
        const fontSize = parseFloat(window.getComputedStyle(el).fontSize || '0') || 0;
        let score = fontSize;
        if (elRect.left < panelRect.left + panelRect.width * 0.45) score += 10;
        if (elRect.top < panelRect.top + panelRect.height * 0.45) score += 10;
        if (text.includes(' ')) score += 4;
        if (text.length >= 8) score += 2;
        return { text, score };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score);
    return candidates[0]?.text || null;
  }

  function matchHeroByName(name, heroes) {
    const norm = normalizedName(name);
    if (!norm) return null;
    return (heroes || []).find((hero) => normalizedName(hero.name) === norm)
      || (heroes || []).find((hero) => normalizedName(hero.name).includes(norm) || norm.includes(normalizedName(hero.name)))
      || null;
  }

  function extractActionFromBtn(btn) {
    if (btn.disabled || btn.getAttribute('aria-disabled') === 'true') return null;
    const iconUrl = extractImageUrl(btn);
    const className = String(btn.className || '');
    const parentClassName = String(btn.parentElement?.className || '');
    if (/hero-info-button/i.test(className) || /hero-info-button/i.test(parentClassName)) return null;
    if (iconUrl && /^data:/i.test(iconUrl)) return null;
    const name = extractButtonLabel(btn) || labelFromAssetUrl(iconUrl);
    const skillId = btn.getAttribute('data-skill-id') || btn.getAttribute('data-action-id') || null;
    if (!name || name.length < 2 || name.length > 50) return null;
    if (isUiChromeLabel(name)) return null;
    if (/hero frame/i.test(name)) return null;
    const lower = name.toLowerCase();
    if (/^[a-z0-9+/=_-]{18,}$/i.test(name) || /[a-z0-9]{6,}[A-Z][a-z0-9]{6,}/.test(name)) return null;
    if (!iconUrl && /[=]|(?:[a-z0-9]{5,}\s+){2,}[a-z0-9]{5,}/i.test(name)) return null;
    let group = 'skills';
    if (/^(attack|swap|skip)$/i.test(name)) group = 'actions';
    else if (/(potion|tonic|philter|frame|stone|elixir|consum)/i.test(lower)) group = 'items';
    else if (/(passive|deathmark|blinding winds)/i.test(lower)) group = 'abilities';
    return {
      name: name.slice(0, 40),
      skillId,
      type: lower.includes('attack') ? 'basic_attack' : 'skill',
      group,
      available: !isVisiblyUnavailable(btn),
      requiresTarget: !lower.includes('self'),
      sourceConfidence: 0.8,
      iconUrl,
      _el: btn,
    };
  }

  function findActionPanelByStructure() {
    const commandPanel = findCommandPanelRoot();
    if (commandPanel) return commandPanel;
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

  function readLegalActions(commandPanel) {
    const actions = [];
    const diagCounts = {};
    let tier = null;
    const panel = commandPanel || findActionPanelByStructure();

    // Tier A: semantic data attributes
    for (const sel of ACTION_TIER_A) {
      let count = 0;
      (panel || document).querySelectorAll(sel).forEach(btn => {
        if (!isVisible(btn)) return;
        const a = extractActionFromBtn(btn);
        if (a) { actions.push(a); count++; }
      });
      diagCounts[`A:${sel}`] = count;
    }
    if (actions.length > 0) { tier = 'A'; }

    // Tier B: aria-label on any button (only if Tier A found nothing)
    if (actions.length === 0) {
      let count = 0;
      (panel || document).querySelectorAll('button[aria-label],[role="button"][aria-label]').forEach(btn => {
        if (!isVisible(btn)) return;
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
        (panel || document).querySelectorAll(sel).forEach(btn => {
          if (!isVisible(btn)) return;
          const a = extractActionFromBtn(btn);
          if (a) { actions.push(a); count++; }
        });
        diagCounts[`C:${sel}`] = count;
      }
      if (actions.length > 0) tier = 'C';
    }

    // Tier D: structural scan (only if still nothing)
    if (actions.length === 0) {
      if (panel) {
        let count = 0;
        panel.querySelectorAll('button:not([disabled]),[role="button"]').forEach(btn => {
          if (!isVisible(btn)) return;
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
    window.__dfkSelectorDiag.action_button_texts = dedupeActions(actions).map((a) => a.name);

    return dedupeActions(actions).map(({ _el, ...rest }) => rest);
  }

  function normalizeActionIdentity(value) {
    return normalizeText(String(value || ''))
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  function findActionMatch(actionName, actionGroup) {
    const panel = findCommandPanelRoot() || findActionPanelByStructure();
    if (!panel) return null;

    const targetName = normalizeActionIdentity(actionName);
    const candidates = [];

    panel.querySelectorAll('button,[role="button"],img[alt],img[title],[title],[data-name]').forEach((el) => {
      if (!isVisible(el)) return;
      const action = extractActionFromBtn(el);
      if (!action) return;
      if (action.available === false) return;
      const parsedGroup = action.group || classifyActionGroup(action.name || '');
      candidates.push({
        el: action._el || el,
        name: normalizeActionIdentity(action.name),
        group: parsedGroup,
        confidence: action.sourceConfidence || 0,
      });
    });

    const exactGroupMatch = candidates.find((candidate) => candidate.name === targetName && (!actionGroup || candidate.group === actionGroup));
    if (exactGroupMatch) return exactGroupMatch.el;

    const exactMatch = candidates.find((candidate) => candidate.name === targetName);
    if (exactMatch) return exactMatch.el;

    return null;
  }

  function clickResolvedElement(el) {
    if (!el) return false;
    try {
      el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
      el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      if (typeof el.click === 'function') el.click();
      return true;
    } catch (_) {
      return false;
    }
  }

  function executeCompanionAction(payload) {
    const actionName = payload?.name || null;
    if (!actionName) {
      return { ok: false, error: 'missing_action_name' };
    }
    const actionGroup = payload?.group || null;
    const match = findActionMatch(actionName, actionGroup);
    if (!match) {
      return { ok: false, error: 'action_not_found', actionName, actionGroup };
    }
    const clicked = clickResolvedElement(match);
    return {
      ok: clicked,
      error: clicked ? null : 'click_failed',
      actionName,
      actionGroup,
    };
  }

  // ── Active unit & target ──────────────────────────────────────────────────

  function readActiveUnit(commandPanel, heroes, turnOrder) {
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
    const panelHeroName = inferHeroNameFromPanel(commandPanel);
    if (panelHeroName) {
      const matched = matchHeroByName(panelHeroName, heroes);
      diagCounts.panelHeroName = matched ? 1 : 0;
      recordSelectorDiag('active_unit', diagCounts);
      window.__dfkSelectorDiag.active_panel_hero_name = panelHeroName;
      return { name: matched?.name || panelHeroName, slot: matched?.slot ?? null };
    }
    const nextPlayer = (turnOrder || []).find((entry) => entry.side === 'player');
    if (nextPlayer) {
      const matched = matchHeroByName(nextPlayer.name, heroes);
      diagCounts.turnOrderPlayer = matched ? 1 : 0;
      recordSelectorDiag('active_unit', diagCounts);
      return { name: matched?.name || nextPlayer.name, slot: matched?.slot ?? null };
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

  function readBattleBudget(commandPanel) {
    const allText = (commandPanel || document).querySelectorAll('span,div,p');
    for (const el of allText) {
      if (!isVisible(el)) continue;
      const text = (el.textContent || '').trim();
      const match = text.match(/battle budget:\s*(\d+)/i);
      if (match) return parseInt(match[1], 10);
    }
    return null;
  }

  function readConsumables(commandPanel) {
    const list = [];
    const seen = new Set();
    (commandPanel || document).querySelectorAll('.items-main button,.items-main img,[class*="item-section"] button,[class*="item-section"] img,[title],[data-name],[class*="consum"],[class*="item"]').forEach((el) => {
      if (!isVisible(el)) return;
      const iconUrl = extractImageUrl(el);
      const name = normalizeText(
        el.getAttribute('data-name') ||
        el.getAttribute('title') ||
        el.getAttribute('alt') ||
        el.getAttribute('aria-label') ||
        el.textContent ||
        labelFromAssetUrl(iconUrl)
      );
      if (!name) return;
      const lower = name.toLowerCase();
      if (/battle budget|stone\d*|^\d+$|hero frame/.test(lower)) return;
      if (!/(potion|tonic|philter|consum|stone|item)/i.test(lower)) return;
      if (isUiChromeLabel(name)) return;
      if (iconUrl && /^data:/i.test(iconUrl)) return;
      if (seen.has(lower)) return;
      seen.add(lower);
      list.push({
        name,
        skillId: null,
        type: 'consumable',
        available: !isVisiblyUnavailable(el),
        sourceConfidence: 0.6,
        iconUrl,
      });
    });
    return list;
  }

  function readEnemyStatusEffects() {
    function extractTrackerTooltipMeta(tooltipEl, rawName) {
      const candidates = [
        tooltipEl,
        tooltipEl?.querySelector?.('img')?.parentElement || null,
        tooltipEl?.parentElement || null,
      ].filter(Boolean);
      const tippyOwner = candidates.find((candidate) => candidate && candidate._tippy?.props?.content);
      const content = tippyOwner?._tippy?.props?.content || null;
      if (!content) return null;

      const extractTextLines = (value) => {
        const raw = String(value || '').replace(/\r/g, '\n');
        return raw
          .split(/\n+/)
          .map((line) => normalizeText(line))
          .filter(Boolean);
      };

      let lines = [];
      let title = '';
      if (typeof content === 'string') {
        lines = extractTextLines(content);
        title = lines[0] || normalizeText(rawName);
      } else if (content && typeof content === 'object') {
        const titleNode = content.querySelector?.('.tracker-name');
        const infoNode = content.querySelector?.('.tracker-info') || content;
        title = normalizeText(titleNode?.textContent || rawName);
        if (infoNode?.children?.length) {
          lines = Array.from(infoNode.children)
            .map((child) => normalizeText(child.innerText || child.textContent || ''))
            .filter(Boolean)
            .filter((line) => line !== title);
        } else {
          lines = extractTextLines(content.innerText || content.textContent || '');
          if (lines[0] === title) lines = lines.slice(1);
        }
      }

      if (!title) title = normalizeText(rawName);
      const isSubtitle = (line) => /^(can|cannot)\b|^passive\b|^mana cost\b|^range\b/i.test(line);
      const subtitle = lines[0] && isSubtitle(lines[0]) ? lines.shift() : null;
      const bullets = lines.filter(Boolean);
      const amnesiaLine = bullets.find((line) => /cannot use .+ for \d+ turns?/i.test(line)) || null;
      const amnesiaMatch = amnesiaLine ? amnesiaLine.match(/cannot use\s+(.+?)\s+for\s+(\d+)\s+turn/i) : null;
      const dispellable = subtitle
        ? /can be dispelled|can be cleansed/i.test(subtitle)
          ? true
          : /cannot be dispelled|cannot be cleansed/i.test(subtitle)
          ? false
          : null
        : null;
      return {
        tooltipTitle: title || null,
        tooltipSubtitle: subtitle || null,
        tooltipBullets: bullets,
        tooltipNote: null,
        dispellable,
        amnesiaAbilityName: amnesiaMatch ? normalizeText(amnesiaMatch[1]) : null,
        amnesiaTurns: amnesiaMatch ? parseInt(amnesiaMatch[2], 10) : null,
      };
    }

    const effectMap = {};
    document.querySelectorAll('.enemy-content-item').forEach((card) => {
      if (!isVisible(card)) return;
      const name = normalizeText(card.querySelector('.enemy-name')?.textContent || inferUnitNameFromContext(card));
      const key = normalizedName(name);
      if (!key) return;
      const effects = Array.from(card.querySelectorAll('._statusEffectTooltip_1gdgx_82')).map((tooltip, index) => {
        const img = tooltip.querySelector('img');
        const iconUrl = img ? extractImageUrl(img) : null;
        const rawName = normalizeText(
          img?.getAttribute('alt') ||
          img?.getAttribute('title') ||
          img?.getAttribute('aria-label') ||
          labelFromAssetUrl(iconUrl) ||
          `effect_${index + 1}`
        );
        if (!rawName && !iconUrl) return null;
        const countText = normalizeText(tooltip.textContent || '');
        const stacks = /^\d+$/.test(countText) ? parseInt(countText, 10) : null;
        const tooltipMeta = extractTrackerTooltipMeta(tooltip, rawName);
        return {
          id: normalizedName(rawName || `effect_${index + 1}`),
          name: rawName || `Effect ${index + 1}`,
          category: 'status',
          stacks,
          durationTurns: stacks,
          iconUrl,
          sourceText: countText || null,
          tooltipTitle: tooltipMeta?.tooltipTitle || null,
          tooltipSubtitle: tooltipMeta?.tooltipSubtitle || null,
          tooltipBullets: tooltipMeta?.tooltipBullets || [],
          tooltipNote: tooltipMeta?.tooltipNote || null,
          dispellable: tooltipMeta?.dispellable ?? null,
          amnesiaAbilityName: tooltipMeta?.amnesiaAbilityName || null,
          amnesiaTurns: tooltipMeta?.amnesiaTurns ?? null,
        };
      }).filter(Boolean);
      if (effects.length > 0) effectMap[key] = effects;
    });
    return effectMap;
  }

  function readTurnOrderModal() {
    function buildEntry(name, ticksUntilTurn, ordinal) {
      const side = /boar|enemy|monster|clucker|rocboc|wolf/i.test(name) ? 'enemy' : 'player';
      const slotMatch = name.match(/(\d+)$/);
      return {
        unitId: `${side}:${slotMatch ? slotMatch[1] : 'na'}:${normalizedName(name)}`,
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

    const normalizedEntries = entries
      .filter((entry, index, arr) => arr.findIndex((other) => other.unitId === entry.unitId && other.ticksUntilTurn === entry.ticksUntilTurn) === index)
      .slice(0, 12);
    if (normalizedEntries.length > 0) {
      latestModalTurnOrder = {
        entries: normalizedEntries,
        capturedAt: Date.now(),
        turnNumber: currentTurnState?.turnNumber ?? null,
      };
    }
    return normalizedEntries;
  }

  function resolveStripPlayerIdentity(heroImgUrl, playerOrdinal, overallOrdinal) {
    const match = String(heroImgUrl || '').match(/\/image\/[^/]+\/(\d+)(?:[/?#]|$)/i);
    const heroId = match ? match[1] : null;
    const profiles = getOrderedHeroProfiles();
    const profile = heroId
      ? profiles.find((candidate) =>
          normalizeHeroId(candidate.heroId || candidate.id || candidate.normalizedId || '') === heroId)
      : (profiles[playerOrdinal] || null);
    const name = normalizeText(profile?.unitName || profile?.name || profile?.displayName || '');
    const slot = profile?.slot != null ? Number(profile.slot) : playerOrdinal;
    return {
      unitId: `player:${slot == null ? 'na' : slot}:${normalizedName(name || heroId || `player_${playerOrdinal}`)}`,
      name: name || `Hero ${playerOrdinal + 1}`,
      side: 'player',
      slot,
      ticksUntilTurn: null,
      ordinal: overallOrdinal,
      heroId: profile?.heroId ? String(profile.heroId) : heroId,
      heroClass: profile?.mainClass || null,
      level: profile?.level != null ? Number(profile.level) : null,
      iconUrl: heroImgUrl || null,
    };
  }

  function resolveStripEnemyIdentity(enemyImgs, enemyOrdinal, overallOrdinal) {
    const urls = Array.isArray(enemyImgs) ? enemyImgs.map((value) => String(value || '')) : [];
    const url = urls.find((value) => /\/assets\/avatars\//i.test(value)) || '';
    let name = `Enemy ${enemyOrdinal + 1}`;
    let slot = null;
    if (/baby_boar_portrait_2/i.test(url)) {
      name = 'Baby Boar 2';
      slot = 2;
    } else if (/baby_boar_portrait/i.test(url)) {
      name = 'Baby Boar 1';
      slot = 1;
    } else if (/mama_boar_portrait/i.test(url)) {
      name = 'Big Boar';
    }
    return {
      unitId: `enemy:${slot == null ? 'na' : slot}:${normalizedName(name)}`,
      name,
      side: 'enemy',
      slot,
      ticksUntilTurn: null,
      ordinal: overallOrdinal,
      heroId: null,
      heroClass: null,
      level: null,
      iconUrl: url || null,
    };
  }

  function readTurnOrderStrip() {
    const buttons = findTurnIndicatorButtons();
    let playerOrdinal = 0;
    let enemyOrdinal = 0;
    const rows = buttons.map((btn, overallOrdinal) => {
      const heroImgEl = btn.querySelector('div.hero-img img');
      const heroImg = heroImgEl?.currentSrc || heroImgEl?.getAttribute('src') || null;
      const enemyImgs = Array.from(btn.querySelectorAll('._enemyContainer_hjm7j_177 img')).map((img) => img.currentSrc || img.getAttribute('src'));
      if (heroImg) {
        const row = resolveStripPlayerIdentity(heroImg, playerOrdinal, overallOrdinal);
        playerOrdinal += 1;
        return row;
      }
      if (enemyImgs.length > 0) {
        const row = resolveStripEnemyIdentity(enemyImgs, enemyOrdinal, overallOrdinal);
        enemyOrdinal += 1;
        return row;
      }
      return null;
    }).filter(Boolean);

    return rows.filter((entry, index, arr) =>
      arr.findIndex((other) => other.unitId === entry.unitId && other.ordinal === entry.ordinal) === index,
    );
  }

  function mergeTurnOrderEntries(baseEntries, detailEntries) {
    const base = Array.isArray(baseEntries) ? baseEntries : [];
    const detail = Array.isArray(detailEntries) ? detailEntries : [];
    if (base.length === 0) return detail.slice(0, 12);
    if (detail.length === 0) return base.slice(0, 12);

    const usedDetailIndexes = new Set();
    const merged = base.map((baseEntry, index) => {
      const byUnitId = detail.findIndex((candidate, detailIndex) =>
        !usedDetailIndexes.has(detailIndex) && candidate.unitId === baseEntry.unitId);
      const byName = byUnitId >= 0 ? byUnitId : detail.findIndex((candidate, detailIndex) =>
        !usedDetailIndexes.has(detailIndex) &&
        normalizedName(candidate.name) === normalizedName(baseEntry.name));
      const byOrdinal = byName >= 0 ? byName : detail.findIndex((candidate, detailIndex) =>
        !usedDetailIndexes.has(detailIndex) && candidate.ordinal === index);
      const matchIndex = byOrdinal;
      if (matchIndex < 0) return baseEntry;
      usedDetailIndexes.add(matchIndex);
      const match = detail[matchIndex];
      return {
        ...baseEntry,
        unitId: match.unitId || baseEntry.unitId,
        name: match.name || baseEntry.name,
        side: match.side || baseEntry.side,
        slot: match.slot != null ? match.slot : baseEntry.slot,
        ticksUntilTurn: match.ticksUntilTurn != null ? match.ticksUntilTurn : baseEntry.ticksUntilTurn,
      };
    });

    const remaining = detail.filter((_, index) => !usedDetailIndexes.has(index));
    return [...merged, ...remaining].slice(0, 12).map((entry, ordinal) => ({ ...entry, ordinal }));
  }

  function getFreshModalTurnOrder() {
    const entries = Array.isArray(latestModalTurnOrder.entries) ? latestModalTurnOrder.entries : [];
    if (entries.length === 0) return [];
    const ageMs = Date.now() - (latestModalTurnOrder.capturedAt || 0);
    if (ageMs > 30000) return [];
    return entries;
  }

  function readTurnOrder() {
    const recentNetworkEntries = Array.isArray(latestNetworkTurnOrder.entries) ? latestNetworkTurnOrder.entries : [];
    const networkIsFresh = recentNetworkEntries.length > 0 && (Date.now() - (latestNetworkTurnOrder.capturedAt || 0)) < 30000;
    if (networkIsFresh) {
      window.__dfkSelectorDiag.turn_order_source = 'network';
      window.__dfkSelectorDiag.turn_order_transport = latestNetworkTurnOrder.transport || null;
      if (recentNetworkEntries.length > 0) markTurnOrderCapturedForHunt();
      return recentNetworkEntries.slice(0, 12);
    }

    const stripEntries = readTurnOrderStrip();
    const modalEntries = readTurnOrderModal();
    const cachedModalEntries = modalEntries.length > 0 ? modalEntries : getFreshModalTurnOrder();
    const mergedEntries = mergeTurnOrderEntries(stripEntries, cachedModalEntries);
    window.__dfkSelectorDiag.turn_order_source =
      cachedModalEntries.length > 0 && stripEntries.length > 0 ? 'strip+modal'
      : cachedModalEntries.length > 0 ? 'modal'
      : stripEntries.length > 0 ? 'strip'
      : 'none';
    window.__dfkSelectorDiag.turn_order_strip_count = stripEntries.length;
    window.__dfkSelectorDiag.turn_order_modal_count = cachedModalEntries.length;
    window.__dfkSelectorDiag.turn_order_modal_age_ms = latestModalTurnOrder.capturedAt ? (Date.now() - latestModalTurnOrder.capturedAt) : null;
    if (cachedModalEntries.length > 0) markTurnOrderCapturedForHunt();
    return mergedEntries;
  }

  function isVisible(el) {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.pointerEvents === 'none') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function findTurnIndicatorButtons() {
    return Array.from(document.querySelectorAll('button,[role="button"]'))
      .filter((el) => {
        const classText = typeof el.className === 'string' ? el.className : '';
        return /turnindicator|timeline/i.test(classText);
      })
      .filter(isVisible)
      .sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);
  }

  function findVisibleCloseButton() {
    return Array.from(document.querySelectorAll('button,[role="button"],div,span'))
      .filter(isVisible)
      .find((el) => {
        const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
        const aria = (el.getAttribute('aria-label') || '').trim();
        return /^x$/i.test(text) || /close/i.test(aria) || /modalclose|closebutton/i.test(String(el.className || ''));
      }) || null;
  }

  function tryAutoPrimeTurnOrder() {
    if (!ENABLE_TURN_ORDER_AUTO_PRIME) {
      window.__dfkSelectorDiag.turn_order_auto_prime_disabled = true;
      return;
    }
    if (turnOrderPrimeInFlight) return;
    if (document.visibilityState === 'hidden') return;
    const freshModalEntries = getFreshModalTurnOrder();
    const freshModalTurnNumber = latestModalTurnOrder.turnNumber;
    const currentTurnNumber = currentTurnState?.turnNumber ?? null;
    if (hasCapturedTurnOrderForHunt() && freshModalEntries.length > 0 && (freshModalTurnNumber == null || currentTurnNumber == null || freshModalTurnNumber === currentTurnNumber)) {
      window.__dfkSelectorDiag.turn_order_auto_prime_complete = true;
      return;
    }
    if ((Date.now() - lastTurnOrderPrimeAt) < 30000) return;
    if (readTurnOrderModal().length > 0) return;
    if ((Date.now() - lastUserInteractionAt) < 4000) {
      window.__dfkSelectorDiag.turn_order_auto_prime_skipped = 'recent_interaction';
      return;
    }

    const buttons = findTurnIndicatorButtons();
    if (buttons.length === 0) return;

    turnOrderPrimeInFlight = true;
    lastTurnOrderPrimeAt = Date.now();
    window.__dfkSelectorDiag.turn_order_auto_prime_at = lastTurnOrderPrimeAt;
    window.__dfkSelectorDiag.turn_order_auto_prime_count = buttons.length;

    try {
      buttons[0].click();
    } catch (_) {
      turnOrderPrimeInFlight = false;
      return;
    }

    const captureDelays = [120, 350, 700];
    captureDelays.forEach((delay) => {
      window.setTimeout(() => emitSnapshot(), delay);
    });

    window.setTimeout(() => {
      if (readTurnOrderModal().length > 0) {
        markTurnOrderCapturedForHunt();
      }
      const closeBtn = findVisibleCloseButton();
      if (closeBtn) {
        try { closeBtn.click(); } catch (_) {}
      }
      turnOrderPrimeInFlight = false;
    }, 1200);
  }

  // ── Snapshot builder ──────────────────────────────────────────────────────

  function buildTurnSnapshot() {
    const hpReadings = readHpBars();
    const mpReadings = readMpBars();
    const turnOrder = readTurnOrder();
    const commandPanel = findCommandPanelRoot();

    const unitMap = {};
    hpReadings.forEach(u => {
      const key = `${u.side}:${u.name || u.slot}`;
      if (!unitMap[key] || (u.hp != null && unitMap[key].hp == null)) {
        unitMap[key] = { ...u, iconUrl: findPortraitImage(u.name, u.side) };
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
    const activeUnit = readActiveUnit(commandPanel, heroes, turnOrder);
    const legalActions = readLegalActions(commandPanel);
    const selectedTarget = readSelectedTarget();
    const battleBudgetRemaining = readBattleBudget(commandPanel);
    const legalConsumables = readConsumables(commandPanel);
    const enemyEffectsByName = readEnemyStatusEffects();

    enemies.forEach((enemy) => {
      const effects = enemyEffectsByName[normalizedName(enemy.name)] || [];
      enemy.buffs = effects;
      enemy.debuffs = [];
      enemy.visibleEffects = effects;
    });

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
        _debug: {
          commandPanel: lastCommandPanelDebug,
          activePanelHeroName: window.__dfkSelectorDiag.active_panel_hero_name || null,
          actionButtonTexts: window.__dfkSelectorDiag.action_button_texts || [],
          actionButtonIconUrls: (legalActions || []).map((action) => action.iconUrl).filter(Boolean),
          consumableIconUrls: (legalConsumables || []).map((item) => item.iconUrl).filter(Boolean),
          turnOrder: {
            source: window.__dfkSelectorDiag.turn_order_source || null,
            stripCount: window.__dfkSelectorDiag.turn_order_strip_count ?? null,
            modalCount: window.__dfkSelectorDiag.turn_order_modal_count ?? null,
            modalAgeMs: window.__dfkSelectorDiag.turn_order_modal_age_ms ?? null,
            networkCount: window.__dfkSelectorDiag.turn_order_network_count ?? null,
            transport: window.__dfkSelectorDiag.turn_order_transport || null,
            autoPrimeAt: window.__dfkSelectorDiag.turn_order_auto_prime_at || null,
            autoPrimeCount: window.__dfkSelectorDiag.turn_order_auto_prime_count ?? null,
            autoPrimeSkipped: window.__dfkSelectorDiag.turn_order_auto_prime_skipped || null,
          },
        },
      };
    }

  function emitSnapshot() {
    const snapshot = buildTurnSnapshot();
    window.__dfkEmitEvent('turn_snapshot', snapshot);
    const hasTurnOrderTicks = (snapshot.turnOrder || []).some((entry) => entry.ticksUntilTurn != null);
    if (!hasTurnOrderTicks) {
      tryAutoPrimeTurnOrder();
    }
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
  window.__dfkExecuteCombatAction = executeCompanionAction;

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
