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
import {
  HAIR_STYLE_MUTATION_MAP,
  HAIR_COLOR_MUTATION_MAP,
  HEAD_APPENDAGE_MUTATION_MAP,
  BACK_APPENDAGE_MUTATION_MAP,
  APPENDAGE_COLOR_MUTATION_MAP,
  EYE_COLOR_MUTATION_MAP,
  SKIN_COLOR_MUTATION_MAP
} from './visual-mutation-maps.js';

const GENE_WEIGHTS = {
  dominant: 0.75,
  R1: 0.1875,
  R2: 0.046875,
  R3: 0.015625
};

const GENE_POSITIONS = ['dominant', 'R1', 'R2', 'R3'];

/**
 * Correct DFK Class Mutation Map
 * Based on official Hero Class Summoning Tree image
 * 
 * BASIC → ADVANCED:
 * - Warrior + Knight → Paladin
 * - Thief + Archer → DarkKnight  
 * - Priest + Wizard → Summoner
 * - Monk + Pirate → Ninja
 * - Berserker + Seer → Shapeshifter
 * - Legionnaire + Scholar → Bard
 * 
 * ADVANCED → ELITE:
 * - Paladin + DarkKnight → Dragoon
 * - Summoner + Ninja → Sage
 * - Shapeshifter + Bard → Spellbow
 * 
 * ELITE → EXALTED:
 * - Dragoon + Sage → DreadKnight (only this combo)
 */
const CLASS_MUTATION_MAP = {
  // Basic → Advanced (from official Hero Class Summoning Tree)
  'Warrior+Knight': 'Paladin',
  'Knight+Warrior': 'Paladin',
  'Thief+Archer': 'DarkKnight',
  'Archer+Thief': 'DarkKnight',
  'Priest+Wizard': 'Summoner',
  'Wizard+Priest': 'Summoner',
  'Monk+Pirate': 'Ninja',
  'Pirate+Monk': 'Ninja',
  'Berserker+Seer': 'Shapeshifter',
  'Seer+Berserker': 'Shapeshifter',
  'Legionnaire+Scholar': 'Bard',
  'Scholar+Legionnaire': 'Bard',
  // Advanced → Elite
  'Paladin+DarkKnight': 'Dragoon',
  'DarkKnight+Paladin': 'Dragoon',
  'Summoner+Ninja': 'Sage',
  'Ninja+Summoner': 'Sage',
  'Shapeshifter+Bard': 'Spellbow',
  'Bard+Shapeshifter': 'Spellbow',
  // Elite → Exalted (only Dragoon+Sage)
  'Dragoon+Sage': 'DreadKnight',
  'Sage+Dragoon': 'DreadKnight'
};

const MUTATION_CHANCE = 0.25;

/**
 * Active Skill Mutation Map
 * Based on official DFK Skill Summoning Tree
 * 
 * BASIC → ADVANCED:
 * - Poisoned Blade + Blinding Winds → Exhaust
 * - Heal + Cleanse → Daze
 * - Iron Skin + Speed → Explosion
 * - Critical Aim + Deathmark → Hardened Shield
 * 
 * ADVANCED → ELITE:
 * - Exhaust + Daze → Stun
 * - Explosion + Hardened Shield → Second Wind
 * 
 * ELITE → TRANSCENDANT:
 * - Stun + Second Wind → Resurrection
 */
const ACTIVE_SKILL_MUTATION_MAP = {
  // Basic → Advanced
  'Poisoned Blade+Blinding Winds': 'Exhaust',
  'Blinding Winds+Poisoned Blade': 'Exhaust',
  'Heal+Cleanse': 'Daze',
  'Cleanse+Heal': 'Daze',
  'Iron Skin+Speed': 'Explosion',
  'Speed+Iron Skin': 'Explosion',
  'Critical Aim+Deathmark': 'Hardened Shield',
  'Deathmark+Critical Aim': 'Hardened Shield',
  // Advanced → Elite
  'Exhaust+Daze': 'Stun',
  'Daze+Exhaust': 'Stun',
  'Explosion+Hardened Shield': 'Second Wind',
  'Hardened Shield+Explosion': 'Second Wind',
  // Elite → Transcendant
  'Stun+Second Wind': 'Resurrection',
  'Second Wind+Stun': 'Resurrection'
};

/**
 * Passive Skill Mutation Map
 * Based on official DFK Skill Summoning Tree
 * 
 * BASIC → ADVANCED:
 * - Duelist + Clutch → Leadership
 * - Foresight + Headstrong → Efficient
 * - Clear Vision + Fearless → Intimidation
 * - Chatterbox + Stalwart → Toxic
 * 
 * ADVANCED → ELITE:
 * - Leadership + Efficient → Giant Slayer
 * - Intimidation + Toxic → Last Stand
 * 
 * ELITE → TRANSCENDANT:
 * - Giant Slayer + Last Stand → Second Life
 */
const PASSIVE_SKILL_MUTATION_MAP = {
  // Basic → Advanced
  'Duelist+Clutch': 'Leadership',
  'Clutch+Duelist': 'Leadership',
  'Foresight+Headstrong': 'Efficient',
  'Headstrong+Foresight': 'Efficient',
  'Clear Vision+Fearless': 'Intimidation',
  'Fearless+Clear Vision': 'Intimidation',
  'Chatterbox+Stalwart': 'Toxic',
  'Stalwart+Chatterbox': 'Toxic',
  // Advanced → Elite
  'Leadership+Efficient': 'Giant Slayer',
  'Efficient+Leadership': 'Giant Slayer',
  'Intimidation+Toxic': 'Last Stand',
  'Toxic+Intimidation': 'Last Stand',
  // Elite → Transcendant
  'Giant Slayer+Last Stand': 'Second Life',
  'Last Stand+Giant Slayer': 'Second Life'
};

/**
 * Helper to extract gene ID values from visual trait object
 * Visual traits from hero-genetics.js have both names (dominant, R1...) and IDs (dominantValue, R1Value...)
 * This extracts the ID values for summoning calculations
 */
function extractVisualGeneIds(visualTrait) {
  if (!visualTrait) return null;
  
  // If trait has *Value fields, extract them
  if (visualTrait.dominantValue !== undefined) {
    return {
      dominant: visualTrait.dominantValue,
      R1: visualTrait.R1Value,
      R2: visualTrait.R2Value,
      R3: visualTrait.R3Value
    };
  }
  
  // Otherwise, trait already uses gene IDs directly (e.g., gender)
  return visualTrait;
}

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
  const classData = calculateTraitWithMutations(parent1Genetics.mainClass, parent2Genetics.mainClass, CLASS_MUTATION_MAP);
  const subClassData = calculateTraitWithMutations(parent1Genetics.subClass, parent2Genetics.subClass, CLASS_MUTATION_MAP);
  
  // Skill traits use their own mutation maps
  const passive1Data = calculateTraitWithMutations(parent1Genetics.passive1, parent2Genetics.passive1, PASSIVE_SKILL_MUTATION_MAP);
  const passive2Data = calculateTraitWithMutations(parent1Genetics.passive2, parent2Genetics.passive2, PASSIVE_SKILL_MUTATION_MAP);
  const active1Data = calculateTraitWithMutations(parent1Genetics.active1, parent2Genetics.active1, ACTIVE_SKILL_MUTATION_MAP);
  const active2Data = calculateTraitWithMutations(parent1Genetics.active2, parent2Genetics.active2, ACTIVE_SKILL_MUTATION_MAP);
  
  // Non-mutation traits use standard probability calculation
  const professionData = calculateTraitProbabilities(parent1Genetics.profession, parent2Genetics.profession);
  const statBoost1Data = calculateTraitProbabilities(parent1Genetics.statBoost1, parent2Genetics.statBoost1);
  const statBoost2Data = calculateTraitProbabilities(parent1Genetics.statBoost2, parent2Genetics.statBoost2);
  const elementData = calculateTraitProbabilities(parent1Genetics.element, parent2Genetics.element);
  
  // Visual traits - extract gene ID values and use visual mutation maps
  const genderData = calculateTraitProbabilities(parent1Genetics.visual.gender, parent2Genetics.visual.gender);
  const headAppData = calculateVisualTraitWithMutations(
    extractVisualGeneIds(parent1Genetics.visual.headAppendage), 
    extractVisualGeneIds(parent2Genetics.visual.headAppendage),
    HEAD_APPENDAGE_MUTATION_MAP
  );
  const backAppData = calculateVisualTraitWithMutations(
    extractVisualGeneIds(parent1Genetics.visual.backAppendage), 
    extractVisualGeneIds(parent2Genetics.visual.backAppendage),
    BACK_APPENDAGE_MUTATION_MAP
  );
  const bgData = calculateTraitProbabilities(
    extractVisualGeneIds(parent1Genetics.visual.background), 
    extractVisualGeneIds(parent2Genetics.visual.background)
  );
  const hairStyleData = calculateVisualTraitWithMutations(
    extractVisualGeneIds(parent1Genetics.visual.hairStyle), 
    extractVisualGeneIds(parent2Genetics.visual.hairStyle),
    HAIR_STYLE_MUTATION_MAP
  );
  const hairColorData = calculateVisualTraitWithMutations(
    extractVisualGeneIds(parent1Genetics.visual.hairColor), 
    extractVisualGeneIds(parent2Genetics.visual.hairColor),
    HAIR_COLOR_MUTATION_MAP
  );
  const eyeColorData = calculateVisualTraitWithMutations(
    extractVisualGeneIds(parent1Genetics.visual.eyeColor), 
    extractVisualGeneIds(parent2Genetics.visual.eyeColor),
    EYE_COLOR_MUTATION_MAP
  );
  const skinColorData = calculateVisualTraitWithMutations(
    extractVisualGeneIds(parent1Genetics.visual.skinColor), 
    extractVisualGeneIds(parent2Genetics.visual.skinColor),
    SKIN_COLOR_MUTATION_MAP
  );
  const appColorData = calculateVisualTraitWithMutations(
    extractVisualGeneIds(parent1Genetics.visual.appendageColor), 
    extractVisualGeneIds(parent2Genetics.visual.appendageColor),
    APPENDAGE_COLOR_MUTATION_MAP
  );
  const backAppColorData = calculateVisualTraitWithMutations(
    extractVisualGeneIds(parent1Genetics.visual.backAppendageColor), 
    extractVisualGeneIds(parent2Genetics.visual.backAppendageColor),
    APPENDAGE_COLOR_MUTATION_MAP
  );
  const vu1Data = calculateTraitProbabilities(
    extractVisualGeneIds(parent1Genetics.visual.visualUnknown1), 
    extractVisualGeneIds(parent2Genetics.visual.visualUnknown1)
  );
  const vu2Data = calculateTraitProbabilities(
    extractVisualGeneIds(parent1Genetics.visual.visualUnknown2), 
    extractVisualGeneIds(parent2Genetics.visual.visualUnknown2)
  );
  
  // Crafting traits - extract gene ID values (use same function as visual traits)
  const craft1Data = calculateTraitProbabilities(
    extractVisualGeneIds(parent1Genetics.crafting1), 
    extractVisualGeneIds(parent2Genetics.crafting1)
  );
  const craft2Data = calculateTraitProbabilities(
    extractVisualGeneIds(parent1Genetics.crafting2), 
    extractVisualGeneIds(parent2Genetics.crafting2)
  );
  
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
 * Calculate trait probabilities WITH mutation handling
 * 
 * For each of the 16 gene position combinations:
 * 1. Calculate combination weight (P1.pos × P2.pos)
 * 2. Check if the two genes form a mutation pair
 * 3. If mutation pair:
 *    - 25% chance: mutated trait is selected
 *    - 75% chance: one of the parent genes is selected (50/50)
 * 4. If not mutation pair:
 *    - P1 gene gets 50%, P2 gene gets 50%
 * 
 * @param {Object} parent1Trait - Parent 1 genes {dominant, R1, R2, R3}
 * @param {Object} parent2Trait - Parent 2 genes {dominant, R1, R2, R3}
 * @param {Object} mutationMap - Map of gene pairs to mutated outcomes
 * @returns {Object} { probabilities, mutations }
 */
function calculateTraitWithMutations(parent1Trait, parent2Trait, mutationMap) {
  const outcomes = {};
  const mutations = new Set();
  
  // Get dominant traits for marking recessive mutations
  const parent1Dominant = parent1Trait.dominant;
  const parent2Dominant = parent2Trait.dominant;
  
  // Iterate through all 16 gene position combinations
  for (const pos1 of GENE_POSITIONS) {
    for (const pos2 of GENE_POSITIONS) {
      const gene1 = parent1Trait[pos1];
      const gene2 = parent2Trait[pos2];
      
      if (gene1 === undefined || gene1 === null || gene2 === undefined || gene2 === null) continue;
      
      // Calculate weight for this position combination
      const weight1 = GENE_WEIGHTS[pos1];
      const weight2 = GENE_WEIGHTS[pos2];
      const combinationWeight = weight1 * weight2;
      
      // Check if this gene pair can mutate
      const mutationKey = `${gene1}+${gene2}`;
      const mutatedTrait = mutationMap[mutationKey];
      
      if (mutatedTrait) {
        // Mutation is possible!
        // 25% chance: mutated trait is selected
        // 75% chance: one of the parent genes is selected (50/50)
        const mutationProb = combinationWeight * MUTATION_CHANCE * 100;
        const nonMutationProb = combinationWeight * (1 - MUTATION_CHANCE) * 100;
        
        // Add mutation outcome
        outcomes[mutatedTrait] = (outcomes[mutatedTrait] || 0) + mutationProb;
        mutations.add(mutatedTrait);
        
        // Add non-mutation outcomes (50/50 between the two genes)
        outcomes[gene1] = (outcomes[gene1] || 0) + (nonMutationProb * 0.5);
        outcomes[gene2] = (outcomes[gene2] || 0) + (nonMutationProb * 0.5);
      } else {
        // No mutation possible - standard 50/50 selection
        const prob = combinationWeight * 100;
        outcomes[gene1] = (outcomes[gene1] || 0) + (prob * 0.5);
        outcomes[gene2] = (outcomes[gene2] || 0) + (prob * 0.5);
      }
      
      // Mark recessive genes as mutations (for highlighting) - only if NOT a skill mutation result
      if (gene1 !== parent1Dominant && gene1 !== parent2Dominant && !mutationMap[`${gene1}+${gene1}`]) {
        // Don't mark base genes as mutations - only mark actual mutation results
      }
      if (gene2 !== parent1Dominant && gene2 !== parent2Dominant && !mutationMap[`${gene2}+${gene2}`]) {
        // Don't mark base genes as mutations - only mark actual mutation results
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
  
  if (!parent1Trait || !parent2Trait) {
    return { probabilities: {}, mutations: new Set() };
  }
  
  // Iterate through all 16 gene position combinations
  for (const pos1 of GENE_POSITIONS) {
    for (const pos2 of GENE_POSITIONS) {
      const gene1 = parent1Trait[pos1];
      const gene2 = parent2Trait[pos2];
      
      const weight1 = GENE_WEIGHTS[pos1];
      const weight2 = GENE_WEIGHTS[pos2];
      const combinationWeight = weight1 * weight2 * 100;
      
      // 50/50 chance between the two genes
      if (gene1 !== undefined && gene1 !== null) {
        outcomes[gene1] = (outcomes[gene1] || 0) + (combinationWeight * 0.5);
      }
      
      if (gene2 !== undefined && gene2 !== null) {
        outcomes[gene2] = (outcomes[gene2] || 0) + (combinationWeight * 0.5);
      }
    }
  }
  
  // Sort by probability and round
  const sorted = Object.entries(outcomes)
    .map(([trait, prob]) => [trait, Math.round(prob * 100) / 100])
    .sort((a, b) => b[1] - a[1]);
  
  // No mutations for traits without mutation maps (stat boosts, elements, visuals)
  return {
    probabilities: Object.fromEntries(sorted),
    mutations: new Set()
  };
}

/**
 * Calculate probability distribution for visual traits WITH mutation support
 * Uses numeric gene IDs and the visual mutation maps to calculate mutation outcomes
 * 
 * @param {Object} parent1Trait - Trait object with { dominant, R1, R2, R3 } gene IDs (numbers)
 * @param {Object} parent2Trait - Trait object with { dominant, R1, R2, R3 } gene IDs (numbers)
 * @param {Object} mutationMap - The visual mutation map (e.g., HAIR_STYLE_MUTATION_MAP)
 * @returns {Object} { probabilities: {...}, mutations: Set }
 */
export function calculateVisualTraitWithMutations(parent1Trait, parent2Trait, mutationMap) {
  const outcomes = {};
  const mutations = new Set();
  
  if (!parent1Trait || !parent2Trait) {
    return { probabilities: {}, mutations: new Set() };
  }
  
  // Iterate through all 16 gene position combinations
  for (const pos1 of GENE_POSITIONS) {
    for (const pos2 of GENE_POSITIONS) {
      const gene1 = parent1Trait[pos1];
      const gene2 = parent2Trait[pos2];
      
      if (gene1 === undefined || gene1 === null || gene2 === undefined || gene2 === null) {
        continue;
      }
      
      const weight1 = GENE_WEIGHTS[pos1];
      const weight2 = GENE_WEIGHTS[pos2];
      const combinationWeight = weight1 * weight2;
      
      // Check for mutation - using numeric gene IDs
      const mutationKey = `${gene1}+${gene2}`;
      const mutatedGene = mutationMap[mutationKey];
      
      if (mutatedGene !== undefined && gene1 !== gene2) {
        // Mutation possible - 25% chance to produce mutation result
        const mutationProb = combinationWeight * MUTATION_CHANCE * 100;
        const nonMutationProb = combinationWeight * (1 - MUTATION_CHANCE) * 100;
        
        // Add mutation outcome
        outcomes[mutatedGene] = (outcomes[mutatedGene] || 0) + mutationProb;
        mutations.add(mutatedGene);
        
        // Add non-mutation outcomes (50/50 between the two genes)
        outcomes[gene1] = (outcomes[gene1] || 0) + (nonMutationProb * 0.5);
        outcomes[gene2] = (outcomes[gene2] || 0) + (nonMutationProb * 0.5);
      } else {
        // No mutation possible - standard 50/50 selection
        const prob = combinationWeight * 100;
        outcomes[gene1] = (outcomes[gene1] || 0) + (prob * 0.5);
        outcomes[gene2] = (outcomes[gene2] || 0) + (prob * 0.5);
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
