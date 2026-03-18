/**
 * Stat Panel Parser
 * Detects when a hero or enemy stat panel opens and extracts all visible stats.
 *
 * Diagnostic: populates window.__dfkSelectorDiag['stat_panels'] with match counts
 * per selector so window.__dfkDiag() can report which selectors are finding panels.
 */
console.log('[DFK StatPanel] Script file loaded');

(function () {
  if (typeof window.__dfkStatPanelParser !== 'undefined') return;
  window.__dfkStatPanelParser = true;

  window.__dfkSelectorDiag = window.__dfkSelectorDiag || {};

  const PANEL_SELECTORS = [
    '.hero-stats',
    '.unit-stats',
    '.stat-panel',
    '[class*="hero-stats"]',
    '[class*="HeroStats"]',
    '[class*="stat-panel"]',
    '[class*="StatPanel"]',
    '[class*="unit-detail"]',
    '.character-sheet',
    '.mana-bar',
    '.hero-abilities',
  ];

  const STAT_LABEL_MAP = {
    'hp': 'hp', 'health': 'hp', 'hit points': 'hp',
    'mp': 'mp', 'mana': 'mp', 'magic points': 'mp',
    'atk': 'atk', 'attack': 'atk', 'strength': 'str',
    'str': 'str', 'dex': 'dex', 'agi': 'agi', 'int': 'int',
    'wis': 'wis', 'vit': 'vit', 'end': 'end', 'endurance': 'end',
    'lck': 'lck', 'luck': 'lck',
    'pacc': 'pAcc', 'p acc': 'pAcc', 'physical accuracy': 'pAcc',
    'macc': 'mAcc', 'm acc': 'mAcc', 'magic accuracy': 'mAcc',
    'csc': 'csc', 'critical strike chance': 'csc',
    'cdm': 'cdm', 'critical damage': 'cdm',
    'chc': 'chc', 'critical hit chance': 'chc',
    'pdef': 'pDef', 'p def': 'pDef', 'physical defense': 'pDef', 'physical defence': 'pDef',
    'mdef': 'mDef', 'm def': 'mDef', 'magic defense': 'mDef', 'magic defence': 'mDef',
    'pred': 'pRed', 'p red': 'pRed', 'physical reduction': 'pRed',
    'mred': 'mRed', 'm red': 'mRed', 'magic reduction': 'mRed',
    'blk': 'blk', 'block': 'blk',
    'sblk': 'sblk', 'spell block': 'sblk',
    'rec': 'rec', 'recovery': 'rec',
    'ser': 'ser',
    'spd': 'speed', 'speed': 'speed',
    'eva': 'eva', 'evasion': 'eva', 'dodge': 'eva',
    'spell power': 'spellPower', 'spell': 'spellPower',
    'level': 'level', 'lvl': 'level',
  };

  function extractNumber(str) {
    if (!str) return null;
    const m = str.replace(/,/g, '').match(/([\d.]+)/);
    return m ? parseFloat(m[1]) : null;
  }

  function extractHpMp(text) {
    const m = text.match(/([\d,]+)\s*\/\s*([\d,]+)/);
    if (m) return { current: parseInt(m[1].replace(/,/g, ''), 10), max: parseInt(m[2].replace(/,/g, ''), 10) };
    return null;
  }

  function normalizeText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

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
    const scanNodes = [el, ...(el.querySelectorAll ? Array.from(el.querySelectorAll('*')).slice(0, 8) : [])];
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
      const file = (parts[parts.length - 1] || '').replace(/\.(png|jpg|jpeg|webp|gif|svg)$/i, '');
      return normalizeText(file.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' '));
    } catch (_) {
      return '';
    }
  }

  function parsePercentOrNumber(str) {
    if (!str) return null;
    const match = String(str).replace(/,/g, '').match(/(-?\d+(?:\.\d+)?)(%?)/);
    if (!match) return null;
    return parseFloat(match[1]);
  }

  function sectionSlice(rawText, heading, nextHeadings) {
    const lower = rawText.toLowerCase();
    const start = lower.indexOf(String(heading || '').toLowerCase());
    if (start === -1) return '';
    const after = rawText.slice(start + String(heading).length);
    let end = after.length;
    nextHeadings.forEach((next) => {
      const idx = after.toLowerCase().indexOf(String(next).toLowerCase());
      if (idx !== -1 && idx < end) end = idx;
    });
    return after.slice(0, end);
  }

  function parseSectionPairs(sectionText, labels) {
    const output = {};
    labels.forEach((label) => {
      const regex = new RegExp(`${label.replace(/\s+/g, '\\s+')}\\s+(-?\\d+(?:\\.\\d+)?%?)`, 'i');
      const match = sectionText.match(regex);
      if (match) {
        output[label.replace(/\s+/g, '_')] = parsePercentOrNumber(match[1]);
      }
    });
    return output;
  }

  function collectAssetLabels(panelEl, predicate) {
    const values = [];
    panelEl.querySelectorAll('img,[style*="background-image"]').forEach((el) => {
      const url = extractImageUrl(el);
      if (!url || !predicate(url, el)) return;
      const label = normalizeText(
        el.getAttribute?.('alt') ||
        el.getAttribute?.('title') ||
        el.getAttribute?.('aria-label') ||
        el.getAttribute?.('data-name') ||
        labelFromAssetUrl(url)
      );
      if (label) values.push(label);
    });
    return uniqueStrings(values);
  }

  function uniqueStrings(values) {
    return [...new Set((values || []).map(v => (v || '').trim()).filter(Boolean))];
  }

  function parseStatusText(text, category) {
    const raw = (text || '').trim();
    const stackMatch = raw.match(/(?:x|stack(?:s)?\s*:?\s*)(\d+)/i);
    const turnsMatch = raw.match(/(\d+)\s*(?:turn|tick)/i);
    const cleanName = raw
      .replace(/(?:x|stack(?:s)?\s*:?\s*)\d+/gi, '')
      .replace(/\d+\s*(?:turn|tick)s?/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
    return {
      id: (cleanName || raw || category).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, ''),
      name: cleanName || raw || category,
      category: category || 'unknown',
      stacks: stackMatch ? parseInt(stackMatch[1], 10) : null,
      durationTurns: turnsMatch ? parseInt(turnsMatch[1], 10) : null,
      sourceText: raw || null,
    };
  }

  function collectLabeledValues(panelEl, labels) {
    const matches = [];
    const allEls = panelEl.querySelectorAll('*');
    allEls.forEach((el) => {
      const text = (el.textContent || '').trim();
      if (!text) return;
      const lower = text.toLowerCase();
      if (labels.some(label => lower.includes(label))) {
        matches.push(text);
      }
    });
    return uniqueStrings(matches);
  }

  function parsePanel(panelEl, selector) {
    const debugMode = window.__dfkDebugMode || false;
    const rawText = panelEl.textContent || '';
    const snapshot = {
      type: 'unit_snapshot',
      capturedAt: Date.now(),
      panelSelector: selector,
      stats: {},
      baseStats: {},
      modifiers: {},
      dynamicScores: {},
      resistances: {},
      buffs: [],
      debuffs: [],
      traits: [],
      abilities: [],
      items: [],
      primaryArms: [],
      secondaryArms: [],
      iconUrl: null,
      heroDetail: null,
      parseConfidence: 0,
    };

    const debugMeta = {};

    const unitNameEl = panelEl.querySelector('[class*="name"],[class*="Name"],[class*="hero-name"],[class*="unit-name"],[data-name]');
    if (unitNameEl) {
      snapshot.unitName = unitNameEl.textContent.trim();
      if (debugMode) debugMeta.unitName = { source: unitNameEl.className, value: snapshot.unitName };
    }

    const portraitImg = Array.from(panelEl.querySelectorAll('img,[style*="background-image"]'))
      .map((el) => extractImageUrl(el))
      .find((url) => url && !/ability-icons|traits|class-icons|hero-frame|item|equipment/i.test(url));
    if (portraitImg) {
      snapshot.iconUrl = portraitImg;
      if (debugMode) debugMeta.iconUrl = { source: 'portrait-scan', value: portraitImg };
    }

    const sideAttr = panelEl.getAttribute('data-side') || panelEl.getAttribute('data-unit-side');
    if (sideAttr) {
      snapshot.unitSide = sideAttr;
    } else {
      const panelText = rawText.toLowerCase();
      snapshot.unitSide = panelText.includes('enemy') || panelText.includes('monster') ? 'enemy' : 'player';
    }

    const hpEl = panelEl.querySelector('.progress-text,[class*="hp"],[class*="HP"],[data-hp],[data-stat="hp"]');
    if (hpEl) {
      const hpParsed = extractHpMp(hpEl.textContent || '');
      if (hpParsed) {
        snapshot.stats.hp = hpParsed.current;
        snapshot.stats.maxHp = hpParsed.max;
        if (debugMode) debugMeta.hp = { source: hpEl.className, raw: hpEl.textContent.trim(), ...hpParsed };
      }
    }

    const mpEl = panelEl.querySelector('[class*="mp"],[class*="MP"],[data-mp],[data-stat="mp"]');
    if (mpEl) {
      const mpParsed = extractHpMp(mpEl.textContent || '');
      if (mpParsed) {
        snapshot.stats.mp = mpParsed.current;
        snapshot.stats.maxMp = mpParsed.max;
        if (debugMode) debugMeta.mp = { source: mpEl.className, raw: mpEl.textContent.trim(), ...mpParsed };
      }
    }

    if (!snapshot.stats.hp || !snapshot.stats.mp) {
      const progressTexts = panelEl.querySelectorAll('.progress-text');
      progressTexts.forEach((ptEl, idx) => {
        const parsed = extractHpMp(ptEl.textContent || '');
        if (!parsed) return;
        if (idx === 0 && !snapshot.stats.hp) {
          snapshot.stats.hp = parsed.current;
          snapshot.stats.maxHp = parsed.max;
          if (debugMode) debugMeta.hp = { source: 'progress-text[0]', raw: ptEl.textContent.trim(), ...parsed };
        } else if (idx === 1 && !snapshot.stats.mp) {
          snapshot.stats.mp = parsed.current;
          snapshot.stats.maxMp = parsed.max;
          if (debugMode) debugMeta.mp = { source: 'progress-text[1]', raw: ptEl.textContent.trim(), ...parsed };
        }
      });
    }

    const levelEl = panelEl.querySelector('[class*="level"],[class*="Level"],[data-level]');
    if (levelEl) {
      const lv = extractNumber(levelEl.textContent);
      if (lv !== null) {
        snapshot.level = lv;
        if (debugMode) debugMeta.level = { source: levelEl.className, value: lv };
      }
    }

    const statRows = panelEl.querySelectorAll('[class*="stat-row"],[class*="StatRow"],[class*="stat-item"],[class*="StatItem"],[data-stat]');
    statRows.forEach(row => {
      const labelEl = row.querySelector('[class*="label"],[class*="Label"],[class*="name"],[class*="Name"]');
      const valueEl = row.querySelector('[class*="value"],[class*="Value"],[class*="stat-value"],[class*="StatValue"]');
      if (!labelEl || !valueEl) return;
      const labelText = labelEl.textContent.trim().toLowerCase();
      const statKey = STAT_LABEL_MAP[labelText];
      if (!statKey) return;
      const val = extractNumber(valueEl.textContent);
      if (val !== null) {
        const section = ['str', 'dex', 'agi', 'int', 'wis', 'vit', 'end', 'lck'].includes(statKey) ? 'baseStats' : 'stats';
        snapshot[section][statKey] = val;
        if (debugMode) debugMeta[statKey] = { source: row.className, labelRaw: labelText, valueRaw: valueEl.textContent.trim(), parsed: val };
      }
    });

    const dataStatEls = panelEl.querySelectorAll('[data-stat]');
    dataStatEls.forEach(el => {
      const key = el.getAttribute('data-stat');
      const mapped = STAT_LABEL_MAP[key.toLowerCase()] || key;
      const val = extractNumber(el.textContent || el.getAttribute('data-value'));
      if (val !== null) {
        snapshot.stats[mapped] = val;
        if (debugMode) debugMeta[mapped] = { source: `data-stat=${key}`, value: val };
      }
    });

    const buffEls = panelEl.querySelectorAll('[class*="buff"],[class*="Buff"],[data-effect-type="buff"]');
    buffEls.forEach(el => {
      const name = el.getAttribute('data-name') || el.getAttribute('title') || el.textContent.trim();
      if (name && !snapshot.buffs.includes(name)) snapshot.buffs.push(name);
    });

    const debuffEls = panelEl.querySelectorAll('[class*="debuff"],[class*="Debuff"],[data-effect-type="debuff"]');
    debuffEls.forEach(el => {
      const name = el.getAttribute('data-name') || el.getAttribute('title') || el.textContent.trim();
      if (name && !snapshot.debuffs.includes(name)) snapshot.debuffs.push(name);
    });

    const traitEls = panelEl.querySelectorAll('[class*="trait"],[class*="Trait"],[data-trait]');
    traitEls.forEach(el => {
      const name = el.getAttribute('data-name') || el.getAttribute('title') || el.textContent.trim();
      if (name) snapshot.traits.push(name);
    });

    const abilityEls = panelEl.querySelectorAll('[class*="ability"],[class*="Ability"],[class*="skill"],[class*="Skill"],[data-ability]');
    abilityEls.forEach(el => {
      const name = el.getAttribute('data-name') || el.getAttribute('title') || el.textContent.trim();
      if (name && name.length < 50) snapshot.abilities.push(name);
    });

    const itemEls = panelEl.querySelectorAll('[class*="item"],[class*="equipment"],[class*="Equipment"],[data-item]');
    itemEls.forEach(el => {
      const name = el.getAttribute('data-name') || el.getAttribute('title') || el.textContent.trim();
      if (name && name.length < 60) snapshot.items.push(name);
    });

    snapshot.abilities = uniqueStrings(snapshot.abilities.concat(collectAssetLabels(panelEl, (url) => /ability-icons/i.test(url))));
    snapshot.traits = uniqueStrings(snapshot.traits.concat(collectAssetLabels(panelEl, (url) => /traits/i.test(url))));
    snapshot.items = uniqueStrings(snapshot.items.concat(collectAssetLabels(panelEl, (url) => /item|consum|potion|philter/i.test(url))));

    const allHeadings = [
      'current conditions',
      'primary arms',
      'secondary arms',
      'vitals',
      'base stats',
      'modifiers',
      'dynamic stat scores',
      'status effect resistance',
      'traits',
      'abilities',
      'items',
      'level',
    ];
    const baseStatsSection = sectionSlice(rawText, 'base stats', allHeadings);
    const modifiersSection = sectionSlice(rawText, 'modifiers', allHeadings);
    const dynamicScoresSection = sectionSlice(rawText, 'dynamic stat scores', allHeadings);
    const resistancesSection = sectionSlice(rawText, 'status effect resistance', allHeadings);
    const primaryArmsSection = sectionSlice(rawText, 'primary arms', allHeadings);
    const secondaryArmsSection = sectionSlice(rawText, 'secondary arms', allHeadings);

    Object.assign(snapshot.baseStats, parseSectionPairs(baseStatsSection, ['str', 'agi', 'end', 'wis', 'dex', 'vit', 'int', 'lck']));
    Object.assign(snapshot.modifiers, parseSectionPairs(modifiersSection, ['pdm', 'mdm', 'ret', 'prc', 'rip', 'bfr', 'lsp', 'mcp']));
    Object.assign(snapshot.dynamicScores, parseSectionPairs(dynamicScoresSection, ['str', 'agi', 'end', 'wis', 'dex', 'vit', 'int', 'lck']));
    Object.assign(snapshot.resistances, parseSectionPairs(resistancesSection, [
      'banish', 'berserk', 'bleed', 'blind', 'poison', 'pull', 'push', 'silence', 'sleep', 'slow', 'stun', 'taunt',
      'fear', 'intimidate', 'mana burn', 'negate', 'burn', 'confuse', 'daze', 'disarm', 'ethereal', 'exhaust', 'chill'
    ]));

    snapshot.primaryArms = uniqueStrings(snapshot.primaryArms.concat(collectAssetLabels(panelEl, (url, el) => {
      const context = normalizeText(el.closest('div')?.textContent || '');
      return /primary arms/i.test(context) || /weapon|arms/i.test(primaryArmsSection) && /item|equipment|weapon/i.test(url);
    })));
    snapshot.secondaryArms = uniqueStrings(snapshot.secondaryArms.concat(collectAssetLabels(panelEl, (url, el) => {
      const context = normalizeText(el.closest('div')?.textContent || '');
      return /secondary arms/i.test(context) || /weapon|arms/i.test(secondaryArmsSection) && /item|equipment|weapon/i.test(url);
    })));

    const titleText = rawText.toLowerCase();
    const likelyHeroDetail = titleText.includes('current conditions') ||
      titleText.includes('base stats') ||
      titleText.includes('status effect resistance') ||
      titleText.includes('dynamic stat scores');

    if (likelyHeroDetail) {
      const traitTexts = collectLabeledValues(panelEl, ['trait', 'traits']);
      const passiveTexts = uniqueStrings(snapshot.abilities.filter(name => /passive/i.test(name)).concat(collectLabeledValues(panelEl, ['passive'])));
      const abilityTexts = uniqueStrings(snapshot.abilities.concat(collectLabeledValues(panelEl, ['abilities'])));

      snapshot.heroDetail = {
        name: snapshot.unitName || null,
        level: snapshot.level || null,
        iconUrl: snapshot.iconUrl || null,
        vitals: {
          hp: snapshot.stats.hp ?? null,
          maxHp: snapshot.stats.maxHp ?? null,
          mp: snapshot.stats.mp ?? null,
          maxMp: snapshot.stats.maxMp ?? null,
        },
        baseStats: { ...snapshot.baseStats },
        stats: { ...snapshot.baseStats, ...snapshot.stats },
        dynamicScores: { ...snapshot.dynamicScores },
        modifiers: { ...snapshot.modifiers },
        resistances: { ...snapshot.resistances },
        traits: uniqueStrings(snapshot.traits.concat(traitTexts)),
        passives: passiveTexts,
        abilities: abilityTexts,
        items: uniqueStrings(snapshot.items),
        primaryArms: [...snapshot.primaryArms],
        secondaryArms: [...snapshot.secondaryArms],
      };
    }

    snapshot.buffs = uniqueStrings(snapshot.buffs);
    snapshot.debuffs = uniqueStrings(snapshot.debuffs);
    snapshot.traits = uniqueStrings(snapshot.traits);
    snapshot.abilities = uniqueStrings(snapshot.abilities);
    snapshot.items = uniqueStrings(snapshot.items);

    const filledStats = Object.keys(snapshot.stats).length +
      Object.keys(snapshot.baseStats).length +
      Object.keys(snapshot.modifiers).length +
      Object.keys(snapshot.dynamicScores).length +
      Object.keys(snapshot.resistances).length;
    snapshot.parseConfidence = Math.min(1.0, filledStats / 24);

    snapshot.fieldConfidence = {};
    for (const [key, val] of Object.entries(snapshot.stats)) {
      const meta = debugMeta[key];
      snapshot.fieldConfidence[key] = meta ? (meta.source?.startsWith('data-stat') ? 1.0 : 0.7) : 0.5;
    }
    for (const [key, val] of Object.entries(snapshot.baseStats)) {
      const meta = debugMeta[key];
      snapshot.fieldConfidence[key] = meta ? (meta.source?.startsWith('data-stat') ? 1.0 : 0.7) : 0.5;
    }

    if (debugMode) snapshot._debug = debugMeta;

    return snapshot;
  }

  let visiblePanels = new Set();
  const snapshotPanelMap = new WeakMap();

  function recordPanelSelectorDiag(diagCounts) {
    const total = Object.values(diagCounts).reduce((s, n) => s + n, 0);
    window.__dfkSelectorDiag['stat_panels'] = { total, bySelector: diagCounts, recordedAt: Date.now() };
  }

  function checkPanels(root) {
    const diagCounts = {};
    for (const sel of PANEL_SELECTORS) {
      const panels = root.querySelectorAll(sel);
      diagCounts[sel] = panels.length;
      panels.forEach(panel => {
        if (!visiblePanels.has(panel)) {
          visiblePanels.add(panel);
          const snapshot = parsePanel(panel, sel);
          snapshotPanelMap.set(panel, snapshot);
          window.__dfkEmitEvent('unit_snapshot', snapshot);
          window.__dfkCurrentUnitSnapshot = snapshot;
        }
      });
    }
    recordPanelSelectorDiag(diagCounts);
    visiblePanels.forEach(panel => {
      if (!document.body.contains(panel)) {
        visiblePanels.delete(panel);
        const removedSnapshot = snapshotPanelMap.get(panel);
        if (removedSnapshot && removedSnapshot === window.__dfkCurrentUnitSnapshot) {
          window.__dfkCurrentUnitSnapshot = null;
        }
        snapshotPanelMap.delete(panel);
      }
    });
  }

  // ── Polling (replaces body-level MutationObserver to avoid feedback loops) ─

  function startPolling() {
    setInterval(() => checkPanels(document.body), 500);
  }

  if (document.body) {
    startPolling();
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      startPolling();
    });
  }

  window.__dfkGetCurrentSnapshot = () => window.__dfkCurrentUnitSnapshot || null;
})();
