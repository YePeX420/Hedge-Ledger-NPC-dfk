/**
 * Stat Panel Parser
 * Detects when a hero or enemy stat panel opens and extracts all visible stats.
 */

(function () {
  if (typeof window.__dfkStatPanelParser !== 'undefined') return;
  window.__dfkStatPanelParser = true;

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

  function parsePanel(panelEl, selector) {
    const debugMode = window.__dfkDebugMode || false;
    const rawText = panelEl.textContent || '';
    const snapshot = {
      type: 'unit_snapshot',
      capturedAt: Date.now(),
      panelSelector: selector,
      stats: {},
      baseStats: {},
      buffs: [],
      debuffs: [],
      traits: [],
      abilities: [],
      items: [],
      parseConfidence: 0,
    };

    const debugMeta = {};

    const unitNameEl = panelEl.querySelector('[class*="name"],[class*="Name"],[class*="hero-name"],[class*="unit-name"],[data-name]');
    if (unitNameEl) {
      snapshot.unitName = unitNameEl.textContent.trim();
      if (debugMode) debugMeta.unitName = { source: unitNameEl.className, value: snapshot.unitName };
    }

    const sideAttr = panelEl.getAttribute('data-side') || panelEl.getAttribute('data-unit-side');
    if (sideAttr) {
      snapshot.unitSide = sideAttr;
    } else {
      const panelText = rawText.toLowerCase();
      snapshot.unitSide = panelText.includes('enemy') || panelText.includes('monster') ? 'enemy' : 'player';
    }

    const hpEl = panelEl.querySelector('[class*="hp"],[class*="HP"],[data-hp],[data-stat="hp"]');
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

    const filledStats = Object.keys(snapshot.stats).length + Object.keys(snapshot.baseStats).length;
    snapshot.parseConfidence = Math.min(1.0, filledStats / 12);

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
  let panelObserver = null;
  const snapshotPanelMap = new WeakMap();

  function checkPanels(root) {
    for (const sel of PANEL_SELECTORS) {
      const panels = root.querySelectorAll(sel);
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

  panelObserver = new MutationObserver(() => {
    checkPanels(document.body);
  });

  if (document.body) {
    panelObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
    checkPanels(document.body);
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      panelObserver.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
      checkPanels(document.body);
    });
  }

  window.__dfkGetCurrentSnapshot = () => window.__dfkCurrentUnitSnapshot || null;
})();
