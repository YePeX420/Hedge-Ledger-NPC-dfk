/**
 * Battle Log Parser
 * Watches the DFK battle log container via MutationObserver.
 * Extracts structured turn events with confidence scores.
 */

(function () {
  if (typeof window.__dfkBattleLogParser !== 'undefined') return;
  window.__dfkBattleLogParser = true;

  const BATTLE_LOG_SELECTORS = [
    '.battle-log',
    '.combat-log',
    '[class*="battle-log"]',
    '[class*="combat-log"]',
    '[class*="battleLog"]',
    '[class*="BattleLog"]',
    '#battle-log',
  ];

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

  function parseActorSide(rawText, actorName) {
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
        { regex: /^([A-Za-z][A-Za-z\s'-]+?)\s+(?:uses|attacks|casts|strikes|charges)/i },
        { regex: /^([A-Za-z][A-Za-z\s'-]+?)(?:\s*\[P\d\])?(?:\s*:)/ },
      ],
      rawText
    );

    const ability = extractField(el,
      ['data-ability', 'data-skill'],
      [
        { regex: /uses?\s+([A-Za-z][A-Za-z\s'-]+?)(?:\s+on|\s+against|\s+for|\.|!|$)/i },
        { regex: /casts?\s+([A-Za-z][A-Za-z\s'-]+?)(?:\s+on|\s+against|\s+for|\.|!|$)/i },
        { regex: /:\s*([A-Za-z][A-Za-z\s'-]{2,30})\s*(?:on|against|-|\()/i },
      ],
      rawText
    );

    const target = extractField(el,
      ['data-target', 'data-target-name'],
      [
        { regex: /(?:on|against|hits?)\s+([A-Za-z][A-Za-z\s'-]+?)(?:\s+for|\s*[!.]|$)/i },
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

    const actorSide = parseActorSide(rawText, actor.value);
    const damageType = parseDamageType(rawText);

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

  function findLogContainer() {
    for (const sel of BATTLE_LOG_SELECTORS) {
      const el = document.querySelector(sel);
      if (el) return { el, selector: sel };
    }
    return null;
  }

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
          node._dfkSelector = selector;
          turnCounter++;
          const event = parseLogEntry(node, turnCounter);
          window.__dfkEmitEvent('battle_log_event', event);
        }
      }
    });

    observer.observe(container, { childList: true, subtree: true });
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

  if (!tryAttach()) {
    const domObserver = new MutationObserver(() => {
      if (tryAttach()) domObserver.disconnect();
    });
    domObserver.observe(document.body || document.documentElement, { childList: true, subtree: true });
  }
})();
