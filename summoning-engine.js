/**
 * Hero Summoning Probability Engine
 * 
 * Calculates offspring trait probabilities using DeFi Kingdoms genetics system.
 * Uses weighted gene selection: D=75%, R1=18.75%, R2=5.5%, R3=0.75%
 * Includes class mutation system for advanced/elite/exalted classes.
 * 
 * Algorithm:
 * 1. For each of 16 position combinations (P1.D×P2.D, P1.D×P2.R1, etc.)
 * 2. Calculate combination weight (e.g., 0.75 × 0.75 = 0.5625)
 * 3. 50% chance P1's gene selected, 50% chance P2's gene selected
 * 4. If genes form mutation pair, 25% of the time mutated class is chosen instead
 */

import { calculateRarityDistribution } from './rarity-calculator.js';

const GENE_WEIGHTS = {
  dominant: 0.75,
  R1: 0.1875,
  R2: 0.055,
  R3: 0.0075
};

const GENE_POSITIONS = ['dominant', 'R1', 'R2', 'R3'];

/**
 * Correct DFK Class Mutation Map
 * Based on official DFK documentation and user-verified data
 * 
 * BASIC → ADVANCED:
 * - Knight + Warrior → Paladin
 * - Knight + Thief → DarkKnight  
 * - Priest + Wizard → Summoner
 * - Pirate + Monk → Ninja
 * - Thief + Pirate → Shapeshifter
 * - Archer + Monk → Bard
 * 
 * ADVANCED → ELITE:
 * - Paladin + DarkKnight → Dragoon
 * - Summoner + Ninja → Sage
 * - Shapeshifter + Bard → Spellbow
 * 
 * ELITE → EXALTED:
 * - Dragoon + Sage → DreadKnight
 * - Dragoon + Spellbow → DreadKnight
 * - Sage + Spellbow → DreadKnight
 */
const CLASS_MUTATION_MAP = {
  // Basic → Advanced
  'Knight+Warrior': 'Paladin',
  'Warrior+Knight': 'Paladin',
  'Knight+Thief': 'DarkKnight',
  'Thief+Knight': 'DarkKnight',
  'Priest+Wizard': 'Summoner',
  'Wizard+Priest': 'Summoner',
  'Pirate+Monk': 'Ninja',
  'Monk+Pirate': 'Ninja',
  'Thief+Pirate': 'Shapeshifter',
  'Pirate+Thief': 'Shapeshifter',
  'Archer+Monk': 'Bard',
  'Monk+Archer': 'Bard',
  // Advanced → Elite
  'Paladin+DarkKnight': 'Dragoon',
  'DarkKnight+Paladin': 'Dragoon',
  'Summoner+Ninja': 'Sage',
  'Ninja+Summoner': 'Sage',
  'Shapeshifter+Bard': 'Spellbow',
  'Bard+Shapeshifter': 'Spellbow',
  // Elite → Exalted
  'Dragoon+Sage': 'DreadKnight',
  'Sage+Dragoon': 'DreadKnight',
  'Dragoon+Spellbow': 'DreadKnight',
  'Spellbow+Dragoon': 'DreadKnight',
  'Sage+Spellbow': 'DreadKnight',
  'Spellbow+Sage': 'DreadKnight'
};

const MUTATION_CHANCE = 0.25;

/**
 * Calculate all summoning probabilities for two parent heroes
 * @param {Object} parent1Genetics - Full genetics object from hero-genetics.js
 * @param {Object} parent2Genetics - Full genetics object from hero-genetics.js
 * @param {string} parent1Rarity - Parent 1 rarity ('Common', 'Uncommon', etc.)
 * @param {string} parent2Rarity - Parent 2 rarity
 * @returns {Object} Complete probability distributions for all traits
 */
export function calculateSummoningProbabilities(parent1Genetics, parent2Genetics, parent1Rarity, parent2Rarity) {
  // Class traits use mutation system
  const classData = calculateClassWithMutations(parent1Genetics.mainClass, parent2Genetics.mainClass);
  const subClassData = calculateClassWithMutations(parent1Genetics.subClass, parent2Genetics.subClass);
  
  // Non-class traits use standard probability calculation
  const professionData = calculateTraitProbabilities(parent1Genetics.profession, parent2Genetics.profession);
  const passive1Data = calculateTraitProbabilities(parent1Genetics.passive1, parent2Genetics.passive1);
  const passive2Data = calculateTraitProbabilities(parent1Genetics.passive2, parent2Genetics.passive2);
  const active1Data = calculateTraitProbabilities(parent1Genetics.active1, parent2Genetics.active1);
  const active2Data = calculateTraitProbabilities(parent1Genetics.active2, parent2Genetics.active2);
  const statBoost1Data = calculateTraitProbabilities(parent1Genetics.statBoost1, parent2Genetics.statBoost1);
  const statBoost2Data = calculateTraitProbabilities(parent1Genetics.statBoost2, parent2Genetics.statBoost2);
  const elementData = calculateTraitProbabilities(parent1Genetics.element, parent2Genetics.element);
  
  // Visual traits
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
  
  // Crafting traits
  const craft1Data = calculateTraitProbabilities(parent1Genetics.crafting1, parent2Genetics.crafting1);
  const craft2Data = calculateTraitProbabilities(parent1Genetics.crafting2, parent2Genetics.crafting2);
  
  const results = {
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
    crafting1: craft1Data.probabilities,
    crafting2: craft2Data.probabilities,
    rarity: calculateRarityDistribution(parent1Rarity, parent2Rarity),
    mutations: {
      class: Array.from(classData.mutations),
      subClass: Array.from(subClassData.mutations),
      profession: Array.from(professionData.mutations),
      passive1: Array.from(passive1Data.mutations),
      passive2: Array.from(passive2Data.mutations),
      active1: Array.from(active1Data.mutations),
      active2: Array.from(active2Data.mutations),
      statBoost1: Array.from(statBoost1Data.mutations),
      statBoost2: Array.from(statBoost2Data.mutations),
      element: Array.from(elementData.mutations),
      gender: Array.from(genderData.mutations),
      headAppendage: Array.from(headAppData.mutations),
      backAppendage: Array.from(backAppData.mutations),
      background: Array.from(bgData.mutations),
      hairStyle: Array.from(hairStyleData.mutations),
      hairColor: Array.from(hairColorData.mutations),
      eyeColor: Array.from(eyeColorData.mutations),
      skinColor: Array.from(skinColorData.mutations),
      appendageColor: Array.from(appColorData.mutations),
      backAppendageColor: Array.from(backAppColorData.mutations),
      visualUnknown1: Array.from(vu1Data.mutations),
      visualUnknown2: Array.from(vu2Data.mutations),
      crafting1: Array.from(craft1Data.mutations),
      crafting2: Array.from(craft2Data.mutations)
    }
  };
  
  return results;
}

/**
 * Calculate class probabilities WITH mutation handling
 * 
 * For each of the 16 gene position combinations:
 * 1. Calculate combination weight (P1.pos × P2.pos)
 * 2. Check if the two genes form a mutation pair
 * 3. If mutation pair:
 *    - 75% of the time (no mutation): P1 gene gets 50%, P2 gene gets 50%
 *    - 25% of the time (mutation): mutated class gets 100%
 * 4. If not mutation pair:
 *    - P1 gene gets 50%, P2 gene gets 50%
 * 
 * @param {Object} parent1Trait - Parent 1 class genes {dominant, R1, R2, R3}
 * @param {Object} parent2Trait - Parent 2 class genes {dominant, R1, R2, R3}
 * @returns {Object} { probabilities, mutations }
 */
function calculateClassWithMutations(parent1Trait, parent2Trait) {
  const outcomes = {};
  const mutations = new Set();
  
  // Get dominant classes for marking recessive mutations
  const parent1Dominant = parent1Trait.dominant;
  const parent2Dominant = parent2Trait.dominant;
  
  // Iterate through all 16 gene position combinations
  for (const pos1 of GENE_POSITIONS) {
    for (const pos2 of GENE_POSITIONS) {
      const gene1 = parent1Trait[pos1];
      const gene2 = parent2Trait[pos2];
      
      if (!gene1 || !gene2) continue;
      
      // Calculate weight for this position combination
      const weight1 = GENE_WEIGHTS[pos1];
      const weight2 = GENE_WEIGHTS[pos2];
      const combinationWeight = weight1 * weight2;
      
      // Check if this gene pair can mutate
      const mutationKey = `${gene1}+${gene2}`;
      const mutatedClass = CLASS_MUTATION_MAP[mutationKey];
      
      if (mutatedClass) {
        // Mutation is possible!
        // 25% chance: mutated class is selected
        // 75% chance: one of the parent genes is selected (50/50)
        const mutationProb = combinationWeight * MUTATION_CHANCE * 100;
        const nonMutationProb = combinationWeight * (1 - MUTATION_CHANCE) * 100;
        
        // Add mutation outcome
        outcomes[mutatedClass] = (outcomes[mutatedClass] || 0) + mutationProb;
        mutations.add(mutatedClass);
        
        // Add non-mutation outcomes (50/50 between the two genes)
        outcomes[gene1] = (outcomes[gene1] || 0) + (nonMutationProb * 0.5);
        outcomes[gene2] = (outcomes[gene2] || 0) + (nonMutationProb * 0.5);
      } else {
        // No mutation possible - standard 50/50 selection
        const prob = combinationWeight * 100;
        outcomes[gene1] = (outcomes[gene1] || 0) + (prob * 0.5);
        outcomes[gene2] = (outcomes[gene2] || 0) + (prob * 0.5);
      }
      
      // Mark recessive genes as mutations (for highlighting)
      if (gene1 !== parent1Dominant && gene1 !== parent2Dominant) {
        mutations.add(gene1);
      }
      if (gene2 !== parent1Dominant && gene2 !== parent2Dominant) {
        mutations.add(gene2);
      }
    }
  }
  
  // Sort by probability and round
  const sorted = Object.entries(outcomes)
    .map(([trait, prob]) => [trait, Math.round(prob * 100) / 100])
    .filter(([, prob]) => prob > 0)
    .sort((a, b) => b[1] - a[1]);
  
  return {
    probabilities: Object.fromEntries(sorted),
    mutations
  };
}

/**
 * Calculate probability distribution for a single trait (non-class traits)
 * Uses standard weighted genetics: D=75%, R1=18.75%, R2=5.5%, R3=0.75%
 * 
 * @param {Object} parent1Trait - Trait object with { dominant, R1, R2, R3 } genes
 * @param {Object} parent2Trait - Trait object with { dominant, R1, R2, R3 } genes
 * @returns {Object} { probabilities: {...}, mutations: Set }
 */
export function calculateTraitProbabilities(parent1Trait, parent2Trait) {
  const outcomes = {};
  const mutations = new Set();
  
  if (!parent1Trait || !parent2Trait) {
    return { probabilities: {}, mutations };
  }
  
  const parent1Dominant = parent1Trait.dominant;
  const parent2Dominant = parent2Trait.dominant;
  
  // Iterate through all 16 gene position combinations
  for (const pos1 of GENE_POSITIONS) {
    for (const pos2 of GENE_POSITIONS) {
      const gene1 = parent1Trait[pos1];
      const gene2 = parent2Trait[pos2];
      
      const weight1 = GENE_WEIGHTS[pos1];
      const weight2 = GENE_WEIGHTS[pos2];
      const combinationWeight = weight1 * weight2 * 100;
      
      // 50/50 chance between the two genes
      if (gene1) {
        outcomes[gene1] = (outcomes[gene1] || 0) + (combinationWeight * 0.5);
        if (gene1 !== parent1Dominant && gene1 !== parent2Dominant) {
          mutations.add(gene1);
        }
      }
      
      if (gene2) {
        outcomes[gene2] = (outcomes[gene2] || 0) + (combinationWeight * 0.5);
        if (gene2 !== parent1Dominant && gene2 !== parent2Dominant) {
          mutations.add(gene2);
        }
      }
    }
  }
  
  // Sort by probability and round
  const sorted = Object.entries(outcomes)
    .map(([trait, prob]) => [trait, Math.round(prob * 100) / 100])
    .sort((a, b) => b[1] - a[1]);
  
  return {
    probabilities: Object.fromEntries(sorted),
    mutations
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
  const mainClassProbs = calculateClassWithMutations(parent1Class, parent2Class);
  const subClassProbs = calculateClassWithMutations(parent1SubClass, parent2SubClass);
  
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
