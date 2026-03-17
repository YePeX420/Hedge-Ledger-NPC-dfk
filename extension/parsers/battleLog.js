/**
 * Battle Log Parser
 * Watches the DFK battle log container via MutationObserver.
 * Extracts structured turn events with confidence scores.
 *
 * Selector strategy:
 *   Tier A/C — class/id selectors (standard approach)
 *   Tier D   — content-pattern scan: find the container whose children most
 *              closely match "X uses Y on Z for N damage" turn event text.
 *              Fires only when no class-based selector matches anything.
 *
 * Sets window.__dfkBattleLogAttached (bool) and window.__dfkBattleLogSelector (string)
 * so window.__dfkDiag() can report attach status without polling this file.
 */
console.log('[DFK BattleLog] Script file loaded');

(function () {
  if (typeof window.__dfkBattleLogParser !== 'undefined') return;
  window.__dfkBattleLogParser = true;

  window.__dfkBattleLogAttached = false;
  window.__dfkBattleLogSelector = null;

  window.__dfkSelectorDiag = window.__dfkSelectorDiag || {};

  const BATTLE_LOG_SELECTORS = [
    '.battle-log',
    '.combat-log',
    '[class*="battle-log"]',
    '[class*="combat-log"]',
    '[class*="battleLog"]',
    '[class*="BattleLog"]',
    '[class*="battle_log"]',
    '[class*="combat_log"]',
    '#battle-log',
    '#combat-log',
    '[id*="battle-log"]',
    '[id*="combat-log"]',
  ];

  const DFK_TURN_EVENT_PATTERN = /\[(?:AH|AR|AT|DF|SP|SU|MN|TH):\s.*\]\s*performed\s+\w/i;

  const GENERIC_TURN_EVENT_PATTERN = /uses?\s+\w|attacks?\s+\w|casts?\s+\w|strikes?\s+\w|charges?\s+\w|\bdeals?\s+\d|\bfor\s+\d+\s+damage|\bperformed\s+\w/i;

  const DFK_LOG_ENTRY_BG = 'rgb(234, 220, 184)';

  const CONFIDENCE = { ATTRIBUTE: 1.0, REGEX: 0.5, MISSING: 0.0 };

  function extractField(el, attrs, patterns, rawText) {
    for (const attr of attrs) {
      const v = el.getAttribute && el.getAttribute(attr);
      if (v) return { value: v, confidence: CONFIDENCE.ATTRIBUTE, source: `attr:${attr}` };
    }
    for (const { regex, group } of patterns) {
      const m = rawText.match(regex);
      if (m) {
        const value = m[group || 1] || m[0];
        return { value: value.trim(), confidence: CONFIDENCE.REGEX, source: `regex:${regex.toString()}` };
      }
    }
    return { value: null, confidence: CONFIDENCE.MISSING, source: 'missing' };
  }

  function parseActorSide(rawText) {
    const bracketMatch = rawText.match(/\[(AH|AR|AT|DF|SP|SU|MN|TH):/);
    if (bracketMatch) {
      const prefix = bracketMatch[1];
      if (prefix === 'TH') {
        return { value: 'enemy', confidence: 0.9, source: `bracket-prefix:${prefix}` };
      }
      return { value: 'player', confidence: 0.9, source: `bracket-prefix:${prefix}` };
    }
    const lc = rawText.toLowerCase();
    if (lc.includes('enemy') || lc.includes('monster') || lc.includes('boar') || lc.includes('dark')) {
      return { value: 'enemy', confidence: 0.5, source: 'regex:enemy-keywords' };
    }
    return { value: 'player', confidence: 0.3, source: 'heuristic:default-player' };
  }

  function parseDamageType(rawText) {
    const lc = rawText.toLowerCase();
    if (lc.includes('magic') || lc.includes('spell') || lc.includes('fire') || lc.includes('ice') || lc.includes('lightning')) {
      return { value: 'magical', confidence: 0.6, source: 'regex:magic-keywords' };
    }
    if (lc.includes('true') || lc.includes('pure')) {
      return { value: 'true', confidence: 0.6, source: 'regex:true-keywords' };
    }
    return { value: 'physical', confidence: 0.3, source: 'heuristic:default-physical' };
  }

  function parseLogEntry(el, turnCounter) {
    const rawText = el.textContent || '';
    const debugMode = window.__dfkDebugMode || false;

    const actor = extractField(el,
      ['data-actor', 'data-actor-name'],
      [
        { regex: /\[(?:AH|AR|AT|DF|SP|SU|MN|TH):\s*([^\]]+)\]/i },
        { regex: /^([A-Za-z][A-Za-z\s'-]+?)\s+(?:uses|attacks|casts|strikes|charges|performed)/i },
        { regex: /^([A-Za-z][A-Za-z\s'-]+?)(?:\s*\[P\d\])?(?:\s*:)/ },
      ],
      rawText
    );

    const ability = extractField(el,
      ['data-ability', 'data-skill'],
      [
        { regex: /performed\s+([A-Za-z][A-Za-z\s'-]+?)(?:\s+and\s+|\s+on\s+|\s+against\s+|\s+for\s+|\.|!|,|$)/i },
        { regex: /uses?\s+([A-Za-z][A-Za-z\s'-]+?)(?:\s+on|\s+against|\s+for|\.|!|$)/i },
        { regex: /casts?\s+([A-Za-z][A-Za-z\s'-]+?)(?:\s+on|\s+against|\s+for|\.|!|$)/i },
        { regex: /:\s*([A-Za-z][A-Za-z\s'-]{2,30})\s*(?:on|against|-|\()/i },
      ],
      rawText
    );

    const target = extractField(el,
      ['data-target', 'data-target-name'],
      [
        { regex: /(?:on|against|hits?)\s+([A-Za-z][A-Za-z\s'-]+?)(?:\s+for|\s*[!.]|,|$)/i },
        { regex: /(?:on|against)\s+([A-Za-z][A-Za-z\s'0-9-]+)/i },
      ],
      rawText
    );

    const damage = extractField(el,
      ['data-damage'],
      [
        { regex: /(?:deals?|for|inflicts?)\s+([\d,]+)\s*(?:damage|dmg)/i },
        { regex: /[-]\s*([\d,]+)\s*(?:HP|hp)/i },
        { regex: /\b([\d]{1,6})\s*(?:damage|dmg)\b/i },
      ],
      rawText
    );
    const damageNum = damage.value ? parseInt(damage.value.replace(/,/g, ''), 10) : null;

    const manaDelta = extractField(el,
      ['data-mana-delta', 'data-mp-cost'],
      [
        { regex: /[-+]([\d]+)\s*(?:MP|mp|mana)/i },
        { regex: /(?:MP|mana):\s*[-+]?([\d]+)/i },
      ],
      rawText
    );
    const manaDeltaNum = manaDelta.value ? -parseInt(manaDelta.value, 10) : null;

    const actorPos = extractField(el,
      ['data-actor-position', 'data-actor-slot'],
      [{ regex: /\[P(\d)\]/i }],
      rawText
    );

    const targetPos = extractField(el,
      ['data-target-position', 'data-target-slot'],
      [{ regex: /on\s+.*\[P(\d)\]/i }],
      rawText
    );

    const effectMatches = rawText.match(/(?:inflicts?|applies?|causes?)\s+([A-Za-z][A-Za-z\s]+?)(?:\.|!|,|$)/ig) || [];
    const effects = effectMatches.map(m => m.replace(/^(?:inflicts?|applies?|causes?)\s+/i, '').trim());

    const actorSide = parseActorSide(rawText);
    const damageType = parseDamageType(rawText);

    const fieldConfidence = {
      actor: actor.confidence,
      ability: ability.confidence,
      target: target.confidence,
      damage: damage.confidence,
      manaDelta: manaDelta.confidence,
      actorSide: actorSide.confidence,
      damageType: damageType.confidence,
      actorPosition: actorPos.confidence,
    };

    const event = {
      type: 'battle_log_event',
      turn: turnCounter,
      actor: actor.value,
      actorSide: actorSide.value,
      actorPosition: actorPos.value ? `P${actorPos.value}` : null,
      ability: ability.value,
      target: target.value,
      targetSide: actorSide.value === 'player' ? 'enemy' : 'player',
      targetPosition: targetPos.value ? `P${targetPos.value}` : null,
      damageType: damageType.value,
      damage: isNaN(damageNum) ? null : damageNum,
      manaDelta: isNaN(manaDeltaNum) ? null : manaDeltaNum,
      effects,
      rawText: rawText.trim(),
      capturedAt: Date.now(),
      parseConfidence: (actor.confidence + ability.confidence + damage.confidence) / 3,
      fieldConfidence,
    };

    if (debugMode) {
      event._debug = {
        actor: { ...actor },
        ability: { ...ability },
        target: { ...target },
        damage: { ...damage },
        manaDelta: { ...manaDelta },
        actorSide: { ...actorSide },
        damageType: { ...damageType },
        actorPosition: { ...actorPos },
        selectorUsed: el._dfkSelector || 'unknown',
      };
    }

    return event;
  }

  let turnCounter = 0;
  let observer = null;
  let logContainer = null;

  // ── Tier C: class/id selector search ─────────────────────────────────────

  function findLogBySelector() {
    const diagCounts = {};
    for (const sel of BATTLE_LOG_SELECTORS) {
      const el = document.querySelector(sel);
      diagCounts[sel] = el ? 1 : 0;
      if (el) {
        window.__dfkSelectorDiag.battle_log = { attached: false, tier: 'C', selector: sel, diagCounts };
        return { el, selector: sel };
      }
    }
    window.__dfkSelectorDiag.battle_log = { attached: false, tier: 'C', selector: null, diagCounts };
    return null;
  }

  // ── Tier D: find battle log by content pattern ────────────────────────────

  function findLogByInlineStyle() {
    const normalizedTarget = DFK_LOG_ENTRY_BG.replace(/\s/g, '');
    const allDivs = document.querySelectorAll('div');
    for (const div of allDivs) {
      const bg = div.style.backgroundColor;
      if (bg && bg.replace(/\s/g, '') === normalizedTarget) {
        let container = div.parentElement;
        for (let depth = 0; depth < 5 && container; depth++) {
          let styledCount = 0;
          const descendants = container.querySelectorAll('div');
          for (const d of descendants) {
            const dbg = d.style.backgroundColor;
            if (dbg && dbg.replace(/\s/g, '') === normalizedTarget) styledCount++;
            if (styledCount >= 2) break;
          }
          if (styledCount >= 1) {
            const cs = window.getComputedStyle(container);
            const isScrollable = cs.overflowY === 'auto' || cs.overflowY === 'scroll' || cs.overflow === 'auto' || cs.overflow === 'scroll';
            if (isScrollable || styledCount >= 2 || depth >= 2) {
              console.log(`[DFK] Tier D-style: battle log container found (${styledCount} styled entries, depth ${depth}, scrollable=${isScrollable})`);
              window.__dfkSelectorDiag.battle_log = { attached: false, tier: 'D-style', selector: 'inline-bg-color', styledEntries: styledCount, depth };
              return { el: container, selector: 'tier-D:inline-bg-color' };
            }
          }
          container = container.parentElement;
        }
        if (div.parentElement) {
          console.log('[DFK] Tier D-style: using immediate parent as battle log container');
          window.__dfkSelectorDiag.battle_log = { attached: false, tier: 'D-style', selector: 'inline-bg-color-fallback', styledEntries: 1 };
          return { el: div.parentElement, selector: 'tier-D:inline-bg-color-fallback' };
        }
      }
    }
    return null;
  }

  function findLogByContent() {
    let best = null, bestScore = 0;
    const candidates = document.querySelectorAll('div,ul,ol,section,aside,nav');
    for (const el of candidates) {
      if (el.children.length < 1 || el.children.length > 500) continue;
      let score = 0;
      for (const child of el.children) {
        if (DFK_TURN_EVENT_PATTERN.test(child.textContent)) score += 2;
        else if (GENERIC_TURN_EVENT_PATTERN.test(child.textContent)) score += 1;
      }
      if (score > bestScore) {
        best = el;
        bestScore = score;
      }
    }
    if (bestScore >= 1) {
      console.log(`[DFK] Tier D battle log detected (score=${bestScore} across children)`);
      window.__dfkSelectorDiag.battle_log = { attached: false, tier: 'D', selector: 'content-pattern', matchScore: bestScore };
      return { el: best, selector: 'tier-D:content-pattern' };
    }
    return null;
  }

  function findLogContainer() {
    return findLogBySelector() || findLogByInlineStyle() || findLogByContent();
  }

  // ── Observer attachment ───────────────────────────────────────────────────

  function attachObserver(container, selector) {
    if (observer) observer.disconnect();
    logContainer = container;
    const processedSet = new WeakSet();

    observer = new MutationObserver((mutations) => {
      for (const mut of mutations) {
        if (mut.target !== container && !container.contains(mut.target)) continue;
        for (const node of mut.addedNodes) {
          if (node.nodeType !== 1) continue;
          if (processedSet.has(node)) continue;
          const text = (node.textContent || '').trim();
          if (!text || text.length < 3) continue;
          processedSet.add(node);
          if (window.__dfkBattleLogNetworkActive) continue;
          node._dfkSelector = selector;
          turnCounter++;
          const event = parseLogEntry(node, turnCounter);
          if (window.__dfkAdvanceTurn) window.__dfkAdvanceTurn(turnCounter);
          window.__dfkEmitEvent('battle_log_event', event);
        }
      }
    });

    observer.observe(container, { childList: true, subtree: true });

    window.__dfkBattleLogAttached = true;
    window.__dfkBattleLogSelector = selector;
    if (window.__dfkSelectorDiag.battle_log) {
      window.__dfkSelectorDiag.battle_log.attached = true;
    }

    console.log('[DFK] Battle log parser attached to', selector);
  }

  function tryAttach() {
    const found = findLogContainer();
    if (found) {
      attachObserver(found.el, found.selector);
      return true;
    }
    return false;
  }

  console.log('[DFK BattleLog] Parser loaded, polling every 2s for log container');

  setInterval(() => {
    if (!window.__dfkBattleLogAttached) {
      tryAttach();
    } else if (logContainer && !document.body.contains(logContainer)) {
      console.log('[DFK BattleLog] Log container removed from DOM (modal closed), resetting');
      window.__dfkBattleLogAttached = false;
      window.__dfkBattleLogSelector = null;
      if (observer) { observer.disconnect(); observer = null; }
      logContainer = null;
    }
  }, 2000);
})();
