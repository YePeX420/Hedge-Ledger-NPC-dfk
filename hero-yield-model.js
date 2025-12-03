// hero-yield-model.js
// Accurate gardening simulation helpers for Hedge Ledger

function safeNum(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

// Hero gardening factor (per-stamina productivity)
export function computeHeroGardeningFactor(hero) {
  const wis = hero?.wisdom ?? 0;
  const vit = hero?.vitality ?? 0;
  const gardeningSkill = (hero?.gardening ?? 0) / 10;
  const hasGardenGene =
    hero?.professionStr?.toLowerCase() === 'gardening' ||
    hero?.hasGardeningGene === true;

  const baseFactor =
    0.1 + (wis + vit) / 1222.22 + gardeningSkill / 244.44;

  const geneMult = hasGardenGene ? 1.2 : 1.0;

  return baseFactor * geneMult;
}

// Stamina regeneration per day with Rapid Renewal
export function computeStaminaPerDay(hero, { hasRapidRenewal } = {}) {
  const baseTickSeconds = 20 * 60; // 20 minutes per stam
  let tickSeconds = baseTickSeconds;

  if (hasRapidRenewal) {
    const reduction = safeNum(hero?.level) * 3; // 3 seconds removed per level
    tickSeconds = baseTickSeconds - reduction;
    const minTickSeconds = 5 * 60;
    if (tickSeconds < minTickSeconds) tickSeconds = minTickSeconds;
  }

  return (24 * 60 * 60) / tickSeconds;
}

// Simulate attempts per iteration & find optimal
export function simulateGardeningDailyYield(config, attemptsPerIteration) {
  const factor = computeHeroGardeningFactor(config.hero);
  const stamPerDay = computeStaminaPerDay(config.hero, {
    hasRapidRenewal: config.heroMeta?.hasRapidRenewal,
  });

  // quest duration per stam: 12 mins (10 with Gardening gene)
  const questDurationPerStamMinutes = config.hero?.hasGardeningGene ? 10 : 12;
  const questDurationSeconds =
    attemptsPerIteration * questDurationPerStamMinutes * 60;

  // regen time for that many stamina
  const regenSeconds = (attemptsPerIteration / stamPerDay) * 86400;

  const iterationSeconds = questDurationSeconds + regenSeconds;

  const itersPerDay = 86400 / iterationSeconds;

  // scale APR relative to heroFactor
  const baselineFactor = 0.1 + (50 + 50) / 1222.22;
  const scale = factor / baselineFactor;

  const baseQuestApr = parseFloat(
    (config.poolMeta?.gardeningQuestAPR?.best || '0').replace('%', '')
  );

  const heroQuestApr = baseQuestApr * scale;

  return {
    iterationSeconds,
    staminaPerDay: stamPerDay,
    heroQuestApr,
    itersPerDay,
  };
}

export function findOptimalAttempts(config) {
  let best = { attempts: 1, eff: 0 };
  for (let n = 1; n <= 35; n++) {
    const r = simulateGardeningDailyYield(config, n);
    if (r.heroQuestApr > best.eff) best = { attempts: n, eff: r.heroQuestApr };
  }
  return best;
}

export function buildGardenHeroProfile(hero, poolMeta, heroMeta = {}) {
  const factor = computeHeroGardeningFactor(hero);
  const staminaPerDay = computeStaminaPerDay(hero, {
    hasRapidRenewal: heroMeta?.hasRapidRenewal,
  });
  return {
    hero,
    heroMeta,
    factor,
    staminaPerDay,
    gardenScore: factor * staminaPerDay,
    simulation: simulateGardeningDailyYield({ hero, heroMeta, poolMeta }, 25),
  };
}

export function averageQuestApr(heroes, poolMeta, attemptsPerIteration = 25) {
  if (!heroes || heroes.length === 0) return 0;

  const sims = heroes.map((h) =>
    simulateGardeningDailyYield(
      { hero: h.hero || h, heroMeta: h.heroMeta || {}, poolMeta },
      attemptsPerIteration
    )
  );

  const total = sims.reduce((sum, s) => sum + safeNum(s.heroQuestApr), 0);
  return total / sims.length;
}
