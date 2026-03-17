(function () {
  'use strict';

  if (window.__dfkNetworkNormalizerInit) return;
  window.__dfkNetworkNormalizerInit = true;

  function tryParseJSON(str) {
    if (!str || typeof str !== 'string') return null;
    try { return JSON.parse(str); } catch (_) { return null; }
  }

  function normalizeId(value) {
    return String(value || 'unknown')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'unknown';
  }

  function inferSide(name, fallback) {
    if (fallback === 'enemy' || fallback === 'player') return fallback;
    return /boar|enemy|monster|clucker|rocboc|wolf/i.test(String(name || '')) ? 'enemy' : 'player';
  }

  function buildTurnOrderEntry(raw, index) {
    if (!raw || typeof raw !== 'object') return null;

    const combatant = raw.combatant && typeof raw.combatant === 'object' ? raw.combatant : null;
    const name =
      raw.name ||
      raw.unitName ||
      raw.actorName ||
      raw.combatantName ||
      combatant?.name ||
      combatant?.displayName ||
      null;
    const ticksValue =
      raw.ticksUntilTurn ??
      raw.ticks_until_turn ??
      raw.ticks ??
      raw.tick ??
      raw.queuePosition ??
      raw.queue_position ??
      null;

    if (!name || ticksValue == null || ticksValue === '') return null;

    const side = inferSide(
      name,
      raw.side ||
        raw.actorSide ||
        combatant?.side ||
        (raw.activeSide === -1 ? 'enemy' : raw.activeSide === 1 ? 'player' : null)
    );

    const slotValue =
      raw.slot ??
      raw.actorSlot ??
      raw.position ??
      combatant?.slot ??
      combatant?.position ??
      null;
    const numericSlot =
      slotValue == null || slotValue === ''
        ? null
        : Number.isFinite(Number(slotValue))
          ? Number(slotValue)
          : null;
    const ticksUntilTurn = Number.parseFloat(String(ticksValue).replace(/[^0-9.\-]+/g, ''));
    if (!Number.isFinite(ticksUntilTurn)) return null;

    return {
      unitId: `${side}:${numericSlot == null ? 'na' : numericSlot}:${normalizeId(name)}`,
      name: String(name).trim(),
      side,
      slot: numericSlot,
      ticksUntilTurn,
      ordinal: index,
      source: 'network',
    };
  }

  function extractTurnOrderCandidates(node, depth, matches) {
    if (!node || depth > 8) return;

    if (Array.isArray(node)) {
      if (node.length > 0) {
        const entries = node
          .map((item, index) => buildTurnOrderEntry(item, index))
          .filter(Boolean);
        if (entries.length >= 2) matches.push(entries);
      }

      for (let i = 0; i < node.length; i += 1) {
        extractTurnOrderCandidates(node[i], depth + 1, matches);
      }
      return;
    }

    if (typeof node !== 'object') return;

    for (const [key, value] of Object.entries(node)) {
      if (Array.isArray(value)) {
        const entries = value
          .map((item, index) => buildTurnOrderEntry(item, index))
          .filter(Boolean);

        if (entries.length >= 2 && /(turn.?order|queue|initiative|timeline|pending|upcoming|combatant|tick)/i.test(key)) {
          matches.push(entries);
        } else if (entries.length >= 3) {
          matches.push(entries);
        }
      }

      extractTurnOrderCandidates(value, depth + 1, matches);
    }
  }

  function extractTurnOrder(data) {
    if (!data || typeof data !== 'object') return [];
    const matches = [];
    extractTurnOrderCandidates(data, 0, matches);
    if (matches.length === 0) return [];

    const best = matches.sort((a, b) => b.length - a.length)[0] || [];
    const seen = new Set();
    return best.filter((entry) => {
      const key = `${entry.unitId}:${entry.ticksUntilTurn}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function mapActionToEvent(action, index) {
    return {
      type: 'battle_log_event',
      turn: action.turn || action.turnNumber || index + 1,
      actor: action.actor || action.actorName || action.heroName || action.sourceName || null,
      actorSide: action.actorSide || (action.isEnemy ? 'enemy' : 'player'),
      actorPosition: action.actorPosition || action.actorSlot || null,
      ability: action.ability || action.abilityName || action.skillName || action.actionName || null,
      target: action.target || action.targetName || null,
      targetSide: action.targetSide || null,
      targetPosition: action.targetPosition || action.targetSlot || null,
      damageType: action.damageType || 'physical',
      damage: action.damage != null ? Number(action.damage) : null,
      manaDelta: action.manaDelta != null ? Number(action.manaDelta) : (action.mpCost != null ? -Number(action.mpCost) : null),
      effects: action.effects || action.statusEffects || [],
      rawText: action.rawText || action.text || action.description || '',
      capturedAt: Date.now(),
      parseConfidence: 1.0,
      source: 'network',
      fieldConfidence: {
        actor: 1.0,
        ability: 1.0,
        target: 1.0,
        damage: action.damage != null ? 1.0 : 0.0,
        manaDelta: (action.manaDelta != null || action.mpCost != null) ? 1.0 : 0.0,
        actorSide: 1.0,
        damageType: action.damageType ? 1.0 : 0.3,
        actorPosition: action.actorPosition || action.actorSlot ? 1.0 : 0.0,
      },
    };
  }

  function extractActionsFromGraphQL(data) {
    if (!data || typeof data !== 'object') return null;

    const gqlData = data.data || data;

    for (const key of Object.keys(gqlData)) {
      const val = gqlData[key];
      if (Array.isArray(val) && val.length > 0) {
        const first = val[0];
        if (first && typeof first === 'object' && (first.actor || first.actorName || first.heroName || first.ability || first.abilityName || first.damage != null || first.turn != null)) {
          return val;
        }
      }
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        for (const subKey of Object.keys(val)) {
          const subVal = val[subKey];
          if (Array.isArray(subVal) && subVal.length > 0) {
            const first = subVal[0];
            if (first && typeof first === 'object' && (first.actor || first.actorName || first.heroName || first.ability || first.abilityName || first.damage != null || first.turn != null)) {
              return subVal;
            }
          }
        }
      }
    }
    return null;
  }

  function extractActionsFromREST(data) {
    if (!data || typeof data !== 'object') return null;

    for (const key of ['turns', 'actions', 'battleLog', 'combatLog', 'events', 'log']) {
      if (Array.isArray(data[key]) && data[key].length > 0) {
        return data[key];
      }
    }

    if (Array.isArray(data) && data.length > 0) {
      const first = data[0];
      if (first && typeof first === 'object' && (first.actor || first.actorName || first.ability || first.damage != null)) {
        return data;
      }
    }

    return null;
  }

  window.__dfkNormalizeNetworkPayload = function (entry) {
    const parsed = tryParseJSON(entry.responseBody);
    if (!parsed) {
      entry.classified = false;
      return [];
    }

    let actions = null;

    if (entry.transport === 'graphql') {
      actions = extractActionsFromGraphQL(parsed);
    }

    if (!actions) {
      actions = extractActionsFromREST(parsed);
    }

    if (!actions) {
      actions = extractActionsFromGraphQL(parsed);
    }

    const turnOrder = extractTurnOrder(parsed);
    if (turnOrder.length > 0) {
      entry.classifiedTurnOrder = true;
      document.dispatchEvent(new CustomEvent('dfk-network-turn-order', {
        detail: JSON.parse(JSON.stringify({
          entries: turnOrder,
          capturedAt: Date.now(),
          url: entry.url || null,
          transport: entry.transport || 'unknown',
        })),
      }));
    }

    if (!actions || actions.length === 0) {
      entry.classified = turnOrder.length > 0;
      return [];
    }

    entry.classified = true;
    const events = actions.map((a, i) => mapActionToEvent(a, i));

    for (const evt of events) {
      document.dispatchEvent(new CustomEvent('dfk-network-event', {
        detail: JSON.parse(JSON.stringify(evt)),
      }));
    }

    return events;
  };

  console.log('[DFK NetworkNormalizer] Installed');
})();
