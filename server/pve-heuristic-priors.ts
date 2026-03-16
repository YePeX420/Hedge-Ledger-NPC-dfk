import type { StateFeatures } from './pve-feature-extractor';

export interface HeuristicPriors {
  [actionName: string]: number;
}

function normalize(priors: HeuristicPriors): HeuristicPriors {
  const total = Object.values(priors).reduce((s, v) => s + v, 0);
  if (total === 0) return priors;
  const result: HeuristicPriors = {};
  for (const [k, v] of Object.entries(priors)) {
    result[k] = v / total;
  }
  return result;
}

export function getBabyBoarPriors(features: StateFeatures, availableActions: string[]): HeuristicPriors {
  const priors: HeuristicPriors = {};
  for (const a of availableActions) priors[a] = 0.1;

  if (availableActions.includes("Lil' Gore")) priors["Lil' Gore"] = 0.30;
  if (availableActions.includes('Charm')) priors['Charm'] = 0.15;

  if (availableActions.includes('Head Butt')) {
    priors['Head Butt'] = features.enemyHpPercent !== null && features.enemyHpPercent < 50 ? 0.35 : 0.20;
  }

  if (availableActions.includes('Nuzzle')) {
    const anyAllyDamaged = features.lowestEnemyHpPercent !== null && features.lowestEnemyHpPercent < 100;
    const bigBoarPresent = features.alliesAliveCount !== null && features.alliesAliveCount > 1;
    priors['Nuzzle'] = anyAllyDamaged && bigBoarPresent ? 0.45 : anyAllyDamaged ? 0.30 : 0.10;
  }

  return normalize(priors);
}

export function getMamaBoarPriors(features: StateFeatures, availableActions: string[]): HeuristicPriors {
  const priors: HeuristicPriors = {};
  for (const a of availableActions) priors[a] = 0.1;

  if (availableActions.includes('Gore')) priors['Gore'] = 0.25;

  if (availableActions.includes('Grunt')) {
    priors['Grunt'] = (features.alliesAliveCount ?? 0) > 1 ? 0.35 : 0.15;
  }

  if (availableActions.includes('Rampage')) {
    const goodConditions = (features.enemiesAliveCount ?? 0) >= 2;
    priors['Rampage'] = goodConditions ? 0.35 : 0.20;
  }

  if (availableActions.includes('Wild Charge')) {
    priors['Wild Charge'] = (features.enemiesAliveCount ?? 0) >= 2 ? 0.30 : 0.15;
  }

  return normalize(priors);
}

export function getBadMothercluckerPriors(features: StateFeatures, availableActions: string[]): HeuristicPriors {
  const priors: HeuristicPriors = {};
  for (const a of availableActions) priors[a] = 0.1;

  if (availableActions.includes('Beak Strike')) priors['Beak Strike'] = 0.20;

  if (availableActions.includes('Body Slam')) {
    priors['Body Slam'] = (features.enemiesAliveCount ?? 0) >= 2 ? 0.25 : 0.15;
  }

  if (availableActions.includes('Mighty Gust')) {
    priors['Mighty Gust'] = (features.enemiesAliveCount ?? 0) >= 2 ? 0.30 : 0.20;
  }

  if (availableActions.includes('Lay Egg')) {
    priors['Lay Egg'] = (features.alliesDeadCount ?? 0) > 0 ? 0.45 : 0.05;
  }

  const hardboiledActive = features.activePassiveFlags.includes('hardboiled_active') ||
    (features.alliesDeadCount ?? 0) > 0 ||
    features.currentDebuffFlags.some(d => d.toLowerCase().includes('taunt'));
  if (hardboiledActive) {
    const aggressiveActions = ['Beak Strike', 'Body Slam', 'Mighty Gust'];
    for (const k of Object.keys(priors)) {
      if (aggressiveActions.includes(k)) {
        priors[k] *= 1.30;
      }
    }
  }

  return normalize(priors);
}

export function getBabyRocbocPriors(features: StateFeatures, availableActions: string[]): HeuristicPriors {
  const priors: HeuristicPriors = {};
  for (const a of availableActions) priors[a] = 0.1;

  if (availableActions.includes('Pecky Blinder')) priors['Pecky Blinder'] = 0.40;

  if (availableActions.includes('Cheep')) {
    const mothercluckerDamaged = features.enemyHpPercent !== null && features.enemyHpPercent < 60;
    const heroChanneling = features.anyEnemyChanneling;
    const allyUnderThreat = (features.alliesDeadCount ?? 0) > 0;
    priors['Cheep'] = (mothercluckerDamaged || heroChanneling || allyUnderThreat) ? 0.45 : 0.20;
  }

  if (availableActions.includes('Ominous Entrance')) {
    priors['Ominous Entrance'] = 0.05;
  }

  return normalize(priors);
}

export function getHeuristicPriors(enemyType: string, features: StateFeatures, availableActions: string[]): HeuristicPriors {
  const type = enemyType.toLowerCase().replace(/\s+/g, '_');

  switch (type) {
    case 'baby_boar': return getBabyBoarPriors(features, availableActions);
    case 'mama_boar': return getMamaBoarPriors(features, availableActions);
    case 'bad_motherclucker': return getBadMothercluckerPriors(features, availableActions);
    case 'baby_rocboc': return getBabyRocbocPriors(features, availableActions);
    default: {
      const uniform: HeuristicPriors = {};
      for (const a of availableActions) {
        uniform[a] = 1.0 / availableActions.length;
      }
      return uniform;
    }
  }
}
