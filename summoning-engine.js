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
  const results = {
    // Stat genes
    class: calculateTraitProbabilities(parent1Genetics.mainClass, parent2Genetics.mainClass),
    subClass: calculateTraitProbabilities(parent1Genetics.subClass, parent2Genetics.subClass),
    profession: calculateTraitProbabilities(parent1Genetics.profession, parent2Genetics.profession),
    
    // Passive abilities
    passive1: calculateTraitProbabilities(parent1Genetics.passive1, parent2Genetics.passive1),
    passive2: calculateTraitProbabilities(parent1Genetics.passive2, parent2Genetics.passive2),
    
    // Active abilities
    active1: calculateTraitProbabilities(parent1Genetics.active1, parent2Genetics.active1),
    active2: calculateTraitProbabilities(parent1Genetics.active2, parent2Genetics.active2),
    
    // Stat boosts
    statBoost1: calculateTraitProbabilities(parent1Genetics.statBoost1, parent2Genetics.statBoost1),
    statBoost2: calculateTraitProbabilities(parent1Genetics.statBoost2, parent2Genetics.statBoost2),
    
    // Element
    element: calculateTraitProbabilities(parent1Genetics.element, parent2Genetics.element),
    
    // Visual genes (note: under 'visual' sub-object)
    gender: calculateTraitProbabilities(parent1Genetics.visual.gender, parent2Genetics.visual.gender),
    headAppendage: calculateTraitProbabilities(parent1Genetics.visual.headAppendage, parent2Genetics.visual.headAppendage),
    backAppendage: calculateTraitProbabilities(parent1Genetics.visual.backAppendage, parent2Genetics.visual.backAppendage),
    background: calculateTraitProbabilities(parent1Genetics.visual.background, parent2Genetics.visual.background),
    hairStyle: calculateTraitProbabilities(parent1Genetics.visual.hairStyle, parent2Genetics.visual.hairStyle),
    hairColor: calculateTraitProbabilities(parent1Genetics.visual.hairColor, parent2Genetics.visual.hairColor),
    eyeColor: calculateTraitProbabilities(parent1Genetics.visual.eyeColor, parent2Genetics.visual.eyeColor),
    skinColor: calculateTraitProbabilities(parent1Genetics.visual.skinColor, parent2Genetics.visual.skinColor),
    appendageColor: calculateTraitProbabilities(parent1Genetics.visual.appendageColor, parent2Genetics.visual.appendageColor),
    backAppendageColor: calculateTraitProbabilities(parent1Genetics.visual.backAppendageColor, parent2Genetics.visual.backAppendageColor),
    visualUnknown1: calculateTraitProbabilities(parent1Genetics.visual.visualUnknown1, parent2Genetics.visual.visualUnknown1),
    visualUnknown2: calculateTraitProbabilities(parent1Genetics.visual.visualUnknown2, parent2Genetics.visual.visualUnknown2),
    
    // Rarity
    rarity: calculateRarityDistribution(parent1Rarity, parent2Rarity)
  };
  
  return results;
}

/**
 * Calculate probability distribution for a single trait using 4x4 genetics
 * @param {Object} parent1Trait - Trait object with { dominant, R1, R2, R3 } genes
 * @param {Object} parent2Trait - Trait object with { dominant, R1, R2, R3 } genes
 * @returns {Object} Probability distribution { traitValue: percentage }
 */
export function calculateTraitProbabilities(parent1Trait, parent2Trait) {
  const genePositions = ['dominant', 'R1', 'R2', 'R3'];
  const outcomes = {};
  
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
      }
      
      // Possibility 2: gene2 becomes dominant
      if (value2) {
        outcomes[value2] = (outcomes[value2] || 0) + 3.125; // 50% of 6.25%
      }
    }
  }
  
  // Round to 2 decimal places and sort by probability
  const sorted = Object.entries(outcomes)
    .map(([trait, prob]) => [trait, Math.round(prob * 100) / 100])
    .sort((a, b) => b[1] - a[1]);
  
  return Object.fromEntries(sorted);
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
