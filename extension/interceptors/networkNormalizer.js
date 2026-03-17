(function () {
  'use strict';

  if (window.__dfkNetworkNormalizerInit) return;
  window.__dfkNetworkNormalizerInit = true;

  function tryParseJSON(str) {
    if (!str || typeof str !== 'string') return null;
    try { return JSON.parse(str); } catch (_) { return null; }
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

    if (!actions || actions.length === 0) {
      entry.classified = false;
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
