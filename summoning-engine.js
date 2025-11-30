/**
 * Hero Summoning Probability Engine
 * 
 * Calculates offspring trait probabilities using 4x4 Mendelian genetics.
 * Each parent contributes one of their 4 genes (D, R1, R2, R3) randomly.
 * This creates 16 possible combinations per trait.
 */

import { calculateRarityDistribution } from './rarity-calculator.js';

/**
 * Calculate all summoning probabilities for two parent heroes
 * @param {Object} parent1Genetics - Full genetics object from hero-genetics.js
 * @param {Object} parent2Genetics - Full genetics object from hero-genetics.js
 * @param {string} parent1Rarity - Parent 1 rarity ('Common', 'Uncommon', etc.)
 * @param {string} parent2Rarity - Parent 2 rarity
 * @returns {Object} Complete probability distributions for all traits
 */
export function calculateSummoningProbabilities(parent1Genetics, parent2Genetics, parent1Rarity, parent2Rarity) {
  // Calculate each trait with mutation tracking
  const classData = calculateTraitProbabilities(parent1Genetics.mainClass, parent2Genetics.mainClass);
  const subClassData = calculateTraitProbabilities(parent1Genetics.subClass, parent2Genetics.subClass);
  const professionData = calculateTraitProbabilities(parent1Genetics.profession, parent2Genetics.profession);
  const passive1Data = calculateTraitProbabilities(parent1Genetics.passive1, parent2Genetics.passive1);
  const passive2Data = calculateTraitProbabilities(parent1Genetics.passive2, parent2Genetics.passive2);
  const active1Data = calculateTraitProbabilities(parent1Genetics.active1, parent2Genetics.active1);
  const active2Data = calculateTraitProbabilities(parent1Genetics.active2, parent2Genetics.active2);
  const statBoost1Data = calculateTraitProbabilities(parent1Genetics.statBoost1, parent2Genetics.statBoost1);
  const statBoost2Data = calculateTraitProbabilities(parent1Genetics.statBoost2, parent2Genetics.statBoost2);
  const elementData = calculateTraitProbabilities(parent1Genetics.element, parent2Genetics.element);
  const genderData = calculateTraitProbabilities(parent1Genetics.visual.gender, parent2Genetics.visual.gender);
  const headAppData = calculateTraitProbabilities(parent1Genetics.visual.headAppendage, parent2Genetics.visual.headAppendage);
  const backAppData = calculateTraitProbabilities(parent1Genetics.visual.backAppendage, parent2Genetics.visual.backAppendage);
  const bgData = calculateTraitProbabilities(parent1Genetics.visual.background, parent2Genetics.visual.background);
  const hairStyleData = calculateTraitProbabilities(parent1Genetics.visual.hairStyle, parent2Genetics.visual.hairStyle);
  const hairColorData = calculateTraitProbabilities(parent1Genetics.visual.hairColor, parent2Genetics.visual.hairColor);
  const eyeColorData = calculateTraitProbabilities(parent1Genetics.visual.eyeColor, parent2Genetics.visual.eyeColor);
  const skinColorData = calculateTraitProbabilities(parent1Genetics.visual.skinColor, parent2Genetics.visual.skinColor);
  const appColorData = calculateTraitProbabilities(parent1Genetics.visual.appendageColor, parent2Genetics.visual.appendageColor);
  const backAppColorData = calculateTraitProbabilities(parent1Genetics.visual.backAppendageColor, parent2Genetics.visual.backAppendageColor);
  const vu1Data = calculateTraitProbabilities(parent1Genetics.visual.visualUnknown1, parent2Genetics.visual.visualUnknown1);
  const vu2Data = calculateTraitProbabilities(parent1Genetics.visual.visualUnknown2, parent2Genetics.visual.visualUnknown2);
  
  const results = {
    // Stat genes - probabilities
    class: classData.probabilities,
    subClass: subClassData.probabilities,
    profession: professionData.probabilities,
    passive1: passive1Data.probabilities,
    passive2: passive2Data.probabilities,
    active1: active1Data.probabilities,
    active2: active2Data.probabilities,
    statBoost1: statBoost1Data.probabilities,
    statBoost2: statBoost2Data.probabilities,
    element: elementData.probabilities,
    
    // Visual genes - probabilities
    gender: genderData.probabilities,
    headAppendage: headAppData.probabilities,
    backAppendage: backAppData.probabilities,
    background: bgData.probabilities,
    hairStyle: hairStyleData.probabilities,
    hairColor: hairColorData.probabilities,
    eyeColor: eyeColorData.probabilities,
    skinColor: skinColorData.probabilities,
    appendageColor: appColorData.probabilities,
    backAppendageColor: backAppColorData.probabilities,
    visualUnknown1: vu1Data.probabilities,
    visualUnknown2: vu2Data.probabilities,
    
    // Rarity
    rarity: calculateRarityDistribution(parent1Rarity, parent2Rarity),
    
    // Mutation sets for highlighting
    mutations: {
      class: classData.mutations,
      subClass: subClassData.mutations,
      profession: professionData.mutations,
      passive1: passive1Data.mutations,
      passive2: passive2Data.mutations,
      active1: active1Data.mutations,
      active2: active2Data.mutations,
      statBoost1: statBoost1Data.mutations,
      statBoost2: statBoost2Data.mutations,
      element: elementData.mutations,
      gender: genderData.mutations,
      headAppendage: headAppData.mutations,
      backAppendage: backAppData.mutations,
      background: bgData.mutations,
      hairStyle: hairStyleData.mutations,
      hairColor: hairColorData.mutations,
      eyeColor: eyeColorData.mutations,
      skinColor: skinColorData.mutations,
      appendageColor: appColorData.mutations,
      backAppendageColor: backAppColorData.mutations,
      visualUnknown1: vu1Data.mutations,
      visualUnknown2: vu2Data.mutations
    }
  };
  
  return results;
}

/**
 * Calculate probability distribution for a single trait using 4x4 genetics
 * Also tracks which traits are mutations (not in either parent's dominant gene)
 * @param {Object} parent1Trait - Trait object with { dominant, R1, R2, R3 } genes
 * @param {Object} parent2Trait - Trait object with { dominant, R1, R2, R3 } genes
 * @returns {Object} { probabilities: {...}, mutations: Set }
 */
export function calculateTraitProbabilities(parent1Trait, parent2Trait) {
  const genePositions = ['dominant', 'R1', 'R2', 'R3'];
  const outcomes = {};
  const mutations = new Set();
  
  // Track parent dominant traits
  const parent1Dominant = parent1Trait.dominant;
  const parent2Dominant = parent2Trait.dominant;
  
  // 4x4 grid: each parent contributes one of their 4 genes
  for (const gene1 of genePositions) {
    for (const gene2 of genePositions) {
      // Get the trait values from each parent's gene position
      const value1 = parent1Trait[gene1];
      const value2 = parent2Trait[gene2];
      
      // Each combination has equal probability (1/16 = 6.25%)
      // The dominant gene determines the expressed trait
      // We'll count both possibilities (gene1 as D or gene2 as D)
      
      // Possibility 1: gene1 becomes dominant
      if (value1) {
        outcomes[value1] = (outcomes[value1] || 0) + 3.125; // 50% of 6.25%
        // Mark as mutation if not in either parent's dominant gene
        if (value1 !== parent1Dominant && value1 !== parent2Dominant) {
          mutations.add(value1);
        }
      }
      
      // Possibility 2: gene2 becomes dominant
      if (value2) {
        outcomes[value2] = (outcomes[value2] || 0) + 3.125; // 50% of 6.25%
        // Mark as mutation if not in either parent's dominant gene
        if (value2 !== parent1Dominant && value2 !== parent2Dominant) {
          mutations.add(value2);
        }
      }
    }
  }
  
  // Round to 2 decimal places and sort by probability
  const sorted = Object.entries(outcomes)
    .map(([trait, prob]) => [trait, Math.round(prob * 100) / 100])
    .sort((a, b) => b[1] - a[1]);
  
  return {
    probabilities: Object.fromEntries(sorted),
    mutations: mutations
  };
}

/**
 * Get top N most likely outcomes for a trait
 * @param {Object} probabilities - Probability distribution
 * @param {number} topN - Number of top results to return
 * @returns {Array} Array of [trait, probability] tuples
 */
export function getTopOutcomes(probabilities, topN = 5) {
  return Object.entries(probabilities)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN);
}

/**
 * Calculate class-specific summoning probabilities (handles subclass logic)
 * @param {Object} parent1Class - Parent 1 class genes
 * @param {Object} parent2Class - Parent 2 class genes
 * @returns {Object} { mainClass: probabilities, subClass: probabilities }
 */
export function calculateClassProbabilities(parent1Class, parent2Class, parent1SubClass, parent2SubClass) {
  const mainClassProbs = calculateTraitProbabilities(parent1Class, parent2Class);
  const subClassProbs = calculateTraitProbabilities(parent1SubClass, parent2SubClass);
  
  return {
    mainClass: mainClassProbs,
    subClass: subClassProbs
  };
}

/**
 * Format probabilities for Discord display
 * @param {Object} probabilities 
 * @param {number} maxItems - Maximum items to show
 * @returns {string} Formatted string
 */
export function formatProbabilities(probabilities, maxItems = 10) {
  const entries = Object.entries(probabilities)
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxItems);
  
  return entries
    .map(([trait, prob]) => `${trait}: ${prob}%`)
    .join('\n');
}

/**
 * Create a summary of the most interesting summoning outcomes
 * @param {Object} allProbabilities - Full probability results
 * @returns {Object} Summary object with key highlights
 */
export function createSummoningSummary(allProbabilities) {
  const topClass = getTopOutcomes(allProbabilities.class, 3);
  const topRarity = getTopOutcomes(allProbabilities.rarity, 2);
  const topProfession = getTopOutcomes(allProbabilities.profession, 3);
  
  return {
    mostLikelyClass: topClass[0],
    topClasses: topClass,
    mostLikelyRarity: topRarity[0],
    rarityDistribution: allProbabilities.rarity,
    topProfessions: topProfession,
    hasLegendaryChance: allProbabilities.rarity.Legendary > 0,
    hasMythicChance: allProbabilities.rarity.Mythic > 0
  };
}
