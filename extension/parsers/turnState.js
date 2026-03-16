/**
 * Turn State Aggregator
 * Synthesizes a full turn_snapshot from battle log events + HP/MP readings.
 * Tracks active unit, legal action buttons, selected target, HP/MP for all visible units.
 */

(function () {
  if (typeof window.__dfkTurnStateParser !== 'undefined') return;
  window.__dfkTurnStateParser = true;

  const HP_BAR_SELECTORS = [
    '[class*="hp-bar"]', '[class*="HpBar"]', '[class*="health-bar"]', '[class*="HealthBar"]',
    '[data-unit-hp]', '[class*="hero-hp"]', '[class*="HeroHp"]',
  ];

  const ACTION_BUTTON_SELECTORS = [
    '[class*="action-btn"]', '[class*="ActionBtn"]',
    '[class*="skill-btn"]', '[class*="SkillBtn"]',
    '[class*="action-button"]', '[class*="ActionButton"]',
    'button[data-action]', 'button[data-skill]',
    '[class*="combat-action"]',
  ];

  const ACTIVE_UNIT_SELECTORS = [
    '[class*="active-unit"]', '[class*="ActiveUnit"]',
    '[class*="current-turn"]', '[class*="CurrentTurn"]',
    '[data-active="true"]',
  ];

  const TARGET_SELECTORS = [
    '[class*="selected-target"]', '[class*="SelectedTarget"]',
    '[data-selected="true"]', '[class*="target-selected"]',
  ];

  let currentTurnState = {
    turnNumber: 0,
    activeUnit: null,
    activeHeroSlot: null,
    legalActions: [],
    selectedTarget: null,
    heroes: [],
    enemies: [],
    lastUpdated: null,
  };

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

  function readHpBars() {
    const units = [];
    for (const sel of HP_BAR_SELECTORS) {
      document.querySelectorAll(sel).forEach((el, i) => {
        const hp = extractHpMp(el);
        if (!hp) return;
        const slot = parseInt(el.getAttribute('data-slot') || el.getAttribute('data-index') || `${i}`, 10);
        const side = el.getAttribute('data-side') || (el.closest('[class*="enemy"]') ? 'enemy' : 'player');
        const name = el.getAttribute('data-name') || el.getAttribute('data-unit-name') ||
          el.closest('[data-name]')?.getAttribute('data-name') || null;
        units.push({ slot, side, name, hp: hp.current, maxHp: hp.max });
      });
    }
    return units;
  }

  function readMpBars() {
    const units = [];
    const mpSelectors = HP_BAR_SELECTORS.map(s => s.replace(/hp/gi, 'mp').replace(/health/gi, 'mana'));
    for (const sel of mpSelectors) {
      document.querySelectorAll(sel).forEach((el, i) => {
        const mp = extractHpMp(el);
        if (!mp) return;
        const slot = parseInt(el.getAttribute('data-slot') || el.getAttribute('data-index') || `${i}`, 10);
        units.push({ slot, mp: mp.current, maxMp: mp.max });
      });
    }
    return units;
  }

  function readLegalActions() {
    const actions = [];
    for (const sel of ACTION_BUTTON_SELECTORS) {
      document.querySelectorAll(sel).forEach(btn => {
        if (btn.disabled || btn.getAttribute('aria-disabled') === 'true') return;
        const name = btn.getAttribute('data-action') || btn.getAttribute('data-skill') ||
          btn.getAttribute('data-ability') || btn.textContent.trim();
        const skillId = btn.getAttribute('data-skill-id') || btn.getAttribute('data-action-id') || null;
        if (name && !actions.find(a => a.name === name)) {
          actions.push({ name: name.slice(0, 40), skillId });
        }
      });
    }
    return actions;
  }

  function readActiveUnit() {
    for (const sel of ACTIVE_UNIT_SELECTORS) {
      const el = document.querySelector(sel);
      if (el) {
        const name = el.getAttribute('data-name') || el.getAttribute('data-unit-name') || el.textContent.trim().slice(0, 40);
        const slot = el.getAttribute('data-slot') ? parseInt(el.getAttribute('data-slot'), 10) : null;
        return { name, slot };
      }
    }
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

  function buildTurnSnapshot() {
    const hpReadings = readHpBars();
    const mpReadings = readMpBars();
    const activeUnit = readActiveUnit();
    const legalActions = readLegalActions();
    const selectedTarget = readSelectedTarget();

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
      selectedTarget: selectedTarget?.name || null,
      heroes,
      enemies,
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
  }

  window.__dfkAdvanceTurn = (turnNumber) => {
    if (turnNumber > currentTurnState.turnNumber) {
      currentTurnState.turnNumber = turnNumber;
    }
  };

  window.__dfkGetTurnState = () => currentTurnState;

  const hpObserver = new MutationObserver(() => {
    emitSnapshot();
  });

  function attachHpObservers() {
    const target = document.body || document.documentElement;
    hpObserver.observe(target, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['data-hp', 'data-mp', 'style', 'class'],
    });
  }

  if (document.body) {
    attachHpObservers();
  } else {
    document.addEventListener('DOMContentLoaded', attachHpObservers);
  }

  setInterval(emitSnapshot, 5000);
})();
