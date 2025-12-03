/**
 * Garden Pairs Model
 * 
 * Each Crystalvale garden pool can hold up to 3 "pairs" of heroes:
 * - Each pair has 1 hero farming JEWEL + 1 hero farming the power token (e.g., CRYSTAL)
 * - Total: up to 6 heroes per pool (3 JEWEL + 3 power token)
 * 
 * This module models garden assignments and optimizes hero/pet placement.
 */

import { computeHeroGardeningFactor, computeStaminaPerDay } from './hero-yield-model.js';

/**
 * Decode hero currentQuest field to extract quest type and pool ID
 * 
 * Format: 0x01 [questType] [profession] [poolId] 00...
 * - questType 0x05 = expedition
 * - profession 0x0a = gardening
 * - poolId = garden pool ID (matches PID in GARDEN_POOLS)
 * 
 * @param {string} currentQuest - Hex string like "0x01050a0200000000000000000000000000000000"
 * @returns {{isGardening: boolean, poolId: number|null, questType: string}}
 */
export function decodeCurrentQuest(currentQuest) {
  if (!currentQuest || currentQuest === '0x0000000000000000000000000000000000000000') {
    return { isGardening: false, poolId: null, questType: 'none' };
  }
  
  const hex = currentQuest.toLowerCase().replace('0x', '');
  if (hex.length < 8) {
    return { isGardening: false, poolId: null, questType: 'unknown' };
  }
  
  const byte1 = parseInt(hex.substring(2, 4), 16);
  const byte2 = parseInt(hex.substring(4, 6), 16);
  const byte3 = parseInt(hex.substring(6, 8), 16);
  
  const QUEST_EXPEDITION = 0x05;
  const PROF_GARDENING = 0x0a;
  const QUEST_TRAINING = 0x06;
  const PROF_FORAGING = 0x02;
  const PROF_FISHING = 0x03;
  const PROF_MINING_GOLD = 0x01;
  
  if (byte1 === QUEST_EXPEDITION && byte2 === PROF_GARDENING) {
    return { isGardening: true, poolId: byte3, questType: 'gardening' };
  }
  
  if (byte1 === QUEST_TRAINING) {
    return { isGardening: false, poolId: null, questType: 'training' };
  }
  
  if (byte1 === QUEST_EXPEDITION) {
    if (byte2 === PROF_FORAGING) return { isGardening: false, poolId: null, questType: 'foraging' };
    if (byte2 === PROF_FISHING) return { isGardening: false, poolId: null, questType: 'fishing' };
    if (byte2 === PROF_MINING_GOLD) return { isGardening: false, poolId: null, questType: 'mining' };
    return { isGardening: false, poolId: null, questType: 'expedition' };
  }
  
  return { isGardening: false, poolId: null, questType: 'other' };
}

/**
 * Group heroes by the garden pool they are currently questing in
 * @param {Array} heroes - Array of hero objects with currentQuest field
 * @returns {Map<number, Array>} Map of poolId -> heroes currently gardening that pool
 */
export function groupHeroesByGardenPool(heroes) {
  const poolHeroes = new Map();
  
  console.log(`[GroupHeroes] Scanning ${heroes.length} heroes for active garden quests...`);
  
  for (const h of heroes) {
    const hero = h.hero || h;
    const questHex = hero.currentQuest;
    const { isGardening, poolId, questType } = decodeCurrentQuest(questHex);
    
    // Debug first few heroes
    if (poolHeroes.size < 3 || isGardening) {
      console.log(`[GroupHeroes] Hero ${hero.normalizedId || hero.id}: quest=${questHex?.substring(0,18) || 'null'}, isGardening=${isGardening}, poolId=${poolId}, type=${questType}`);
    }
    
    if (isGardening && poolId !== null) {
      if (!poolHeroes.has(poolId)) {
        poolHeroes.set(poolId, []);
      }
      poolHeroes.get(poolId).push(h);
    }
  }
  
  console.log(`[GroupHeroes] Found gardening heroes in ${poolHeroes.size} pools: ${[...poolHeroes.entries()].map(([pid, arr]) => `Pool${pid}:${arr.length}`).join(', ')}`);
  
  return poolHeroes;
}

/**
 * @typedef {'JEWEL' | 'CRYSTAL'} GardenRole
 * 
 * @typedef {Object} GardenSlot
 * @property {number|null} heroId - Hero ID in this slot
 * @property {number|null} petId - Pet ID attached to this hero
 * @property {GardenRole} role - 'JEWEL' or 'CRYSTAL' (power token)
 * @property {number} dailyJewel - Estimated JEWEL/day from this hero+pet
 * @property {number} dailyCrystal - Estimated power token/day from this hero+pet
 * @property {Object|null} hero - Full hero object
 * @property {Object|null} heroMeta - Hero metadata (hasRapidRenewal, etc.)
 * 
 * @typedef {Object} GardenPair
 * @property {number} pairIndex - 1, 2, or 3
 * @property {GardenSlot|null} jewel - Hero slot for JEWEL farming
 * @property {GardenSlot|null} crystal - Hero slot for power token farming
 * 
 * @typedef {Object} PoolAssignment
 * @property {string} pairName - e.g., 'CRYSTAL-wJEWEL'
 * @property {number} pid - Pool ID
 * @property {GardenPair[]} before - Current assignments (up to 3 pairs)
 * @property {GardenPair[]} after - Optimized assignments (up to 3 pairs)
 * @property {Object} metrics - Before/after metrics
 */

/**
 * Compute garden score for a hero (used for ranking and allocation)
 * Score = gardeningFactor * staminaPerDay
 */
export function computeGardenScore(hero, heroMeta = {}) {
  const factor = computeHeroGardeningFactor(hero);
  const staminaPerDay = computeStaminaPerDay(hero, { 
    hasRapidRenewal: heroMeta?.hasRapidRenewal 
  });
  return {
    factor,
    staminaPerDay,
    score: factor * staminaPerDay
  };
}

/**
 * Build a GardenSlot from a hero
 * 
 * Applies pet garden bonuses to yield calculations when the hero has an equipped
 * gardening pet. Pet bonus increases quest rewards by the pet's gathering bonus %.
 */
export function buildGardenSlot(hero, heroMeta, role, tokenPrices = {}) {
  if (!hero) return null;
  
  const { factor, staminaPerDay, score } = computeGardenScore(hero, heroMeta);
  const { jewelPrice = 0, crystalPrice = 0 } = tokenPrices;
  
  // Base daily quest USD value from hero stats
  let dailyQuestUsd = score * 0.1;
  
  // Apply pet garden bonus if hero has a gardening pet equipped
  const petBonus = heroMeta?.petGardenBonus || {};
  const petBonusPct = petBonus?.questBonusPct || 0;
  if (petBonusPct > 0) {
    dailyQuestUsd *= (1 + petBonusPct / 100);
  }
  
  const dailyJewel = jewelPrice > 0 ? (dailyQuestUsd * 0.5) / jewelPrice : 0;
  const dailyCrystal = crystalPrice > 0 ? (dailyQuestUsd * 0.5) / crystalPrice : 0;
  
  // Calculate effective garden score with pet bonus
  const effectiveScore = score * (1 + petBonusPct / 100);
  
  return {
    heroId: hero.normalizedId || hero.id,
    petId: heroMeta?.petId || null,
    pet: heroMeta?.pet || null,
    role,
    dailyJewel,
    dailyCrystal,
    hero,
    heroMeta: heroMeta || {},
    gardenScore: score,
    effectiveScore,
    factor,
    staminaPerDay,
    hasRapidRenewal: !!heroMeta?.hasRapidRenewal,
    hasGardeningGene: !!hero.hasGardeningGene || hero.professionStr?.toLowerCase() === 'gardening',
    petBonusPct
  };
}

/**
 * Build a GardenPair from two heroes (JEWEL + CRYSTAL)
 */
export function buildGardenPair(pairIndex, jewelHero, crystalHero, tokenPrices = {}) {
  const jewelMeta = jewelHero?.heroMeta || {};
  const crystalMeta = crystalHero?.heroMeta || {};
  
  return {
    pairIndex,
    jewel: jewelHero ? buildGardenSlot(jewelHero.hero || jewelHero, jewelMeta, 'JEWEL', tokenPrices) : null,
    crystal: crystalHero ? buildGardenSlot(crystalHero.hero || crystalHero, crystalMeta, 'CRYSTAL', tokenPrices) : null
  };
}

/**
 * Detect current garden assignments from hero quest data
 * 
 * Note: In the current implementation, we don't have direct quest-to-pool mapping
 * from the GraphQL data. This function uses heuristics and may need enhancement
 * when more detailed quest data becomes available.
 */
export function detectCurrentAssignments(heroes, positions, tokenPrices = {}) {
  const assignments = [];
  
  const gardeningHeroes = heroes.filter(h => {
    const hero = h.hero || h;
    return hero.currentQuest && hero.currentQuest !== '0x0000000000000000000000000000000000000000';
  });
  
  console.log(`[GardenPairs] Detected ${gardeningHeroes.length} heroes currently on quests`);
  
  const scoredHeroes = heroes
    .map(h => {
      const hero = h.hero || h;
      const heroMeta = h.heroMeta || {};
      const { score } = computeGardenScore(hero, heroMeta);
      return { hero, heroMeta, score };
    })
    .sort((a, b) => b.score - a.score);
  
  for (const position of positions) {
    const pairs = [];
    const heroesForPool = scoredHeroes.slice(0, 6);
    
    for (let i = 0; i < 3; i++) {
      const jewelHero = heroesForPool[i] || null;
      const crystalHero = heroesForPool[i + 3] || null;
      
      if (jewelHero || crystalHero) {
        pairs.push(buildGardenPair(i + 1, jewelHero, crystalHero, tokenPrices));
      }
    }
    
    assignments.push({
      pairName: position.pairName,
      pid: position.pid,
      before: pairs,
      after: [],
      metrics: {}
    });
  }
  
  return assignments;
}

/**
 * Allocate heroes optimally across pools
 * 
 * Strategy:
 * 1. Sort pools by user TVL (highest first - most important)
 * 2. Sort heroes by garden score (best gardeners first)
 * 3. Allocate best heroes to highest-value pools
 * 4. Each hero can only be used once across all pools
 * 5. Each pool gets up to 6 heroes (3 JEWEL + 3 CRYSTAL)
 */
export function allocateHeroesToPools(heroes, positions, tokenPrices = {}) {
  const scoredHeroes = heroes
    .map((h, idx) => {
      const hero = h.hero || h;
      const heroMeta = h.heroMeta || {};
      const { score, factor, staminaPerDay } = computeGardenScore(hero, heroMeta);
      return { 
        hero, 
        heroMeta, 
        score, 
        factor, 
        staminaPerDay,
        originalIndex: idx, 
        used: false 
      };
    })
    .sort((a, b) => b.score - a.score);
  
  const sortedPositions = [...positions].sort((a, b) => {
    const tvlA = parseFloat(a.userTVL || 0);
    const tvlB = parseFloat(b.userTVL || 0);
    return tvlB - tvlA;
  });
  
  const allocations = [];
  
  for (const position of sortedPositions) {
    const poolAllocation = {
      pairName: position.pairName,
      pid: position.pid,
      pairs: [],
      totalScore: 0
    };
    
    const availableHeroes = scoredHeroes.filter(h => !h.used);
    const poolHeroes = availableHeroes.slice(0, 6);
    
    poolHeroes.forEach(h => h.used = true);
    
    const jewelHeroes = poolHeroes.slice(0, 3);
    const crystalHeroes = poolHeroes.slice(3, 6);
    
    for (let i = 0; i < 3; i++) {
      const jewelHero = jewelHeroes[i] || null;
      const crystalHero = crystalHeroes[i] || null;
      
      if (jewelHero || crystalHero) {
        const pair = buildGardenPair(i + 1, jewelHero, crystalHero, tokenPrices);
        poolAllocation.pairs.push(pair);
        
        if (pair.jewel) poolAllocation.totalScore += pair.jewel.gardenScore;
        if (pair.crystal) poolAllocation.totalScore += pair.crystal.gardenScore;
      }
    }
    
    allocations.push(poolAllocation);
  }
  
  return allocations;
}

/**
 * Find heroes with Rapid Renewal and suggest optimal placement
 */
export function analyzeRapidRenewal(heroes) {
  const rrHeroes = [];
  const nonRrHeroes = [];
  
  for (const h of heroes) {
    const hero = h.hero || h;
    const heroMeta = h.heroMeta || {};
    const { score, factor, staminaPerDay } = computeGardenScore(hero, heroMeta);
    
    const entry = {
      heroId: hero.normalizedId || hero.id,
      hero,
      heroMeta,
      score,
      factor,
      staminaPerDay,
      hasRapidRenewal: !!heroMeta?.hasRapidRenewal,
      level: hero.level || 0,
      gardeningSkill: (hero.gardening || 0) / 10,
      hasGardeningGene: !!hero.hasGardeningGene || hero.professionStr?.toLowerCase() === 'gardening'
    };
    
    if (heroMeta?.hasRapidRenewal) {
      rrHeroes.push(entry);
    } else {
      nonRrHeroes.push(entry);
    }
  }
  
  rrHeroes.sort((a, b) => b.score - a.score);
  nonRrHeroes.sort((a, b) => b.score - a.score);
  
  const suggestions = [];
  
  const rrByScore = [...rrHeroes].sort((a, b) => b.score - a.score);
  const candidatesForRR = nonRrHeroes
    .filter(h => h.factor > (rrByScore[rrByScore.length - 1]?.factor || 0) * 1.1)
    .slice(0, 3);
  
  for (const candidate of candidatesForRR) {
    const baseScore = candidate.score;
    const withRRStamina = computeStaminaPerDay(candidate.hero, { hasRapidRenewal: true });
    const withRRScore = candidate.factor * withRRStamina;
    const improvement = ((withRRScore - baseScore) / baseScore) * 100;
    
    if (improvement > 20) {
      suggestions.push({
        heroId: candidate.heroId,
        hero: candidate.hero,
        currentScore: baseScore,
        withRRScore,
        improvement: improvement.toFixed(1),
        reason: `Level ${candidate.level} hero with ${candidate.gardeningSkill.toFixed(1)} gardening skill would gain ${improvement.toFixed(0)}% productivity with Rapid Renewal`
      });
    }
  }
  
  return {
    currentRR: rrHeroes,
    recommended: suggestions,
    summary: {
      totalWithRR: rrHeroes.length,
      potentialCandidates: suggestions.length
    }
  };
}

/**
 * Format a hero slot with pet info for DM output
 */
function formatSlotWithPet(slot, tokenLabel) {
  if (!slot) return `  - ${tokenLabel}: (empty slot)\n`;
  
  const hero = slot.hero || {};
  const heroId = slot.heroId;
  const level = hero.level || 0;
  const gardening = ((hero.gardening || 0) / 10).toFixed(1);
  
  // Build status icons
  const icons = [];
  if (slot.hasRapidRenewal) icons.push('[RR]');
  if (slot.hasGardeningGene) icons.push('[G]');
  const iconStr = icons.length > 0 ? ' ' + icons.join('') : '';
  
  // Pet info
  let petStr = '';
  if (slot.petId && slot.petBonusPct > 0) {
    petStr = ` + Pet #${slot.petId} (+${slot.petBonusPct}%)`;
  } else if (slot.petId) {
    petStr = ` + Pet #${slot.petId}`;
  }
  
  // Token output
  const tokenValue = tokenLabel === 'JEWEL' 
    ? slot.dailyJewel?.toFixed(2) || '0.00'
    : slot.dailyCrystal?.toFixed(2) || '0.00';
  
  return `  - ${tokenLabel}: Hero #${heroId}${iconStr} (L${level}, G${gardening})${petStr} → ~${tokenValue} ${tokenLabel}/day\n`;
}

/**
 * Format garden pairs for Discord DM output
 * Shows hero+pet pairings with RR status and yield estimates
 */
export function formatPairsForDM(pairs, label = 'Assignments') {
  if (!pairs || pairs.length === 0) {
    return `**${label}:** No hero assignments`;
  }
  
  let output = `**${label}:**\n`;
  
  for (const pair of pairs) {
    output += `- **Pair ${pair.pairIndex}:**\n`;
    output += formatSlotWithPet(pair.jewel, 'JEWEL');
    output += formatSlotWithPet(pair.crystal, 'CRYSTAL');
  }
  
  return output;
}

/**
 * Format Rapid Renewal suggestions for Discord DM output
 */
export function formatRRSuggestions(rrAnalysis) {
  if (!rrAnalysis) return '';
  
  const { currentRR, recommended, summary } = rrAnalysis;
  
  let output = '\n**Rapid Renewal Status:**\n';
  
  if (currentRR.length > 0) {
    output += `- Currently active on: ${currentRR.map(h => `Hero #${h.heroId}`).join(', ')}\n`;
  } else {
    output += `- No heroes currently have Rapid Renewal\n`;
  }
  
  if (recommended.length > 0) {
    output += `\n**Rapid Renewal Suggestions:**\n`;
    for (const rec of recommended) {
      output += `- Hero #${rec.heroId}: +${rec.improvement}% productivity if RR applied\n`;
    }
  }
  
  return output;
}

export default {
  decodeCurrentQuest,
  groupHeroesByGardenPool,
  computeGardenScore,
  buildGardenSlot,
  buildGardenPair,
  detectCurrentAssignments,
  allocateHeroesToPools,
  analyzeRapidRenewal,
  formatPairsForDM,
  formatRRSuggestions
};
