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
    class: calculateTraitProbabilities(parent1Genetics.statGenes.class, parent2Genetics.statGenes.class),
    subClass: calculateTraitProbabilities(parent1Genetics.statGenes.subClass, parent2Genetics.statGenes.subClass),
    profession: calculateTraitProbabilities(parent1Genetics.statGenes.profession, parent2Genetics.statGenes.profession),
    
    // Passive abilities
    passive1: calculateTraitProbabilities(parent1Genetics.statGenes.passive1, parent2Genetics.statGenes.passive1),
    passive2: calculateTraitProbabilities(parent1Genetics.statGenes.passive2, parent2Genetics.statGenes.passive2),
    
    // Active abilities
    active1: calculateTraitProbabilities(parent1Genetics.statGenes.active1, parent2Genetics.statGenes.active1),
    active2: calculateTraitProbabilities(parent1Genetics.statGenes.active2, parent2Genetics.statGenes.active2),
    
    // Stat boosts
    statBoost1: calculateTraitProbabilities(parent1Genetics.statGenes.statBoost1, parent2Genetics.statGenes.statBoost1),
    statBoost2: calculateTraitProbabilities(parent1Genetics.statGenes.statBoost2, parent2Genetics.statGenes.statBoost2),
    
    // Element
    element: calculateTraitProbabilities(parent1Genetics.statGenes.element, parent2Genetics.statGenes.element),
    
    // Background
    background: calculateTraitProbabilities(parent1Genetics.statGenes.background, parent2Genetics.statGenes.background),
    
    // Visual genes
    gender: calculateTraitProbabilities(parent1Genetics.visualGenes.gender, parent2Genetics.visualGenes.gender),
    headAppendage: calculateTraitProbabilities(parent1Genetics.visualGenes.headAppendage, parent2Genetics.visualGenes.headAppendage),
    backAppendage: calculateTraitProbabilities(parent1Genetics.visualGenes.backAppendage, parent2Genetics.visualGenes.backAppendage),
    background: calculateTraitProbabilities(parent1Genetics.visualGenes.background, parent2Genetics.visualGenes.background),
    hairStyle: calculateTraitProbabilities(parent1Genetics.visualGenes.hairStyle, parent2Genetics.visualGenes.hairStyle),
    hairColor: calculateTraitProbabilities(parent1Genetics.visualGenes.hairColor, parent2Genetics.visualGenes.hairColor),
    eyeColor: calculateTraitProbabilities(parent1Genetics.visualGenes.eyeColor, parent2Genetics.visualGenes.eyeColor),
    skinColor: calculateTraitProbabilities(parent1Genetics.visualGenes.skinColor, parent2Genetics.visualGenes.skinColor),
    appendageColor: calculateTraitProbabilities(parent1Genetics.visualGenes.appendageColor, parent2Genetics.visualGenes.appendageColor),
    backAppendageColor: calculateTraitProbabilities(parent1Genetics.visualGenes.backAppendageColor, parent2Genetics.visualGenes.backAppendageColor),
    visualUnknown1: calculateTraitProbabilities(parent1Genetics.visualGenes.visualUnknown1, parent2Genetics.visualGenes.visualUnknown1),
    visualUnknown2: calculateTraitProbabilities(parent1Genetics.visualGenes.visualUnknown2, parent2Genetics.visualGenes.visualUnknown2),
    
    // Rarity
    rarity: calculateRarityDistribution(parent1Rarity, parent2Rarity)
  };
  
  return results;
}

/**
 * Calculate probability distribution for a single trait using 4x4 genetics
 * @param {Object} parent1Trait - Trait object with { D, R1, R2, R3 } genes
 * @param {Object} parent2Trait - Trait object with { D, R1, R2, R3 } genes
 * @returns {Object} Probability distribution { traitValue: percentage }
 */
export function calculateTraitProbabilities(parent1Trait, parent2Trait) {
  const genePositions = ['D', 'R1', 'R2', 'R3'];
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
