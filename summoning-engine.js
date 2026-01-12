/**
 * Hero Summoning Probability Engine
 * 
 * Calculates offspring trait probabilities using DeFi Kingdoms genetics system.
 * Uses weighted gene selection: D=75%, R1=18.75%, R2=4.6875%, R3=1.5625%
 * Includes class mutation system for advanced/elite/exalted classes.
 * 
 * IMPORTANT: This engine produces ACTUAL ON-CHAIN CONTRACT ODDS, not display-only
 * visualizations. The dfk-adventures.herokuapp.com calculator uses a different
 * "tier reassignment" display model that shows higher percentages for elite skills
 * (e.g., 33.98% for Stun vs our 14.06%). Our 14.06% is mathematically correct per
 * the DFK smart contract logic:
 * - P(Stun) = P(D+D) × P(mutation) = 0.75 × 0.75 × 0.25 = 14.0625%
 * 
 * Algorithm:
 * 1. For each of 16 position combinations (P1.D×P2.D, P1.D×P2.R1, etc.)
 * 2. Calculate combination weight (e.g., 0.75 × 0.75 = 0.5625)
 * 3. 50% chance P1's gene selected, 50% chance P2's gene selected
 * 4. If genes form mutation pair:
 *    - 25% mutation rate for Basic→Advanced and Advanced→Elite
 *    - 12.5% mutation rate for Elite→Exalted (e.g., Resurrection)
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

const MUTATION_CHANCE_STANDARD = 0.25;  // Basic→Advanced, Advanced→Elite
const MUTATION_CHANCE_EXALTED = 0.125;  // Elite→Exalted (Transcendent)

// Exalted/Transcendent skill outcomes - these use the lower 12.5% mutation rate
const EXALTED_SKILLS = new Set(['Resurrection', 'Second Life', 'DreadKnight']);

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
 *    - 25% mutation rate for Basic→Advanced and Advanced→Elite
 *    - 12.5% mutation rate for Elite→Exalted (e.g., Resurrection, Second Life, DreadKnight)
 *    - Remaining probability: one of the parent genes is selected (50/50)
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
        // Use lower mutation rate for exalted/transcendent outcomes (12.5%)
        const mutationChance = EXALTED_SKILLS.has(mutatedTrait) 
          ? MUTATION_CHANCE_EXALTED 
          : MUTATION_CHANCE_STANDARD;
        
        const mutationProb = combinationWeight * mutationChance * 100;
        const nonMutationProb = combinationWeight * (1 - mutationChance) * 100;
        
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
        // Mutation possible - 25% chance for visual trait mutations (no exalted visual traits)
        const mutationProb = combinationWeight * MUTATION_CHANCE_STANDARD * 100;
        const nonMutationProb = combinationWeight * (1 - MUTATION_CHANCE_STANDARD) * 100;
        
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
 * Skill Tier Mapping for TTS (Trait Tier Score) Calculation
 * Basic = 0 points, Advanced = 1 point, Elite = 2 points, Transcendent/Exalted = 3 points
 * Max TTS = 12 (all 4 ability slots at Transcendent)
 * 
 * Mappings from gene-decoder.js ACTIVE_GENES and PASSIVE_GENES arrays
 */
const SKILL_TIERS = {
  // Active Skills - Basic (Tier 0) - gene indices 0-7
  'Poisoned Blade': 0,  // gene 0
  'Blinding Winds': 0,  // gene 1
  'Heal': 0,            // gene 2
  'Cleanse': 0,         // gene 3
  'Iron Skin': 0,       // gene 4
  'Speed': 0,           // gene 5
  'Critical Aim': 0,    // gene 6
  'Deathmark': 0,       // gene 7
  
  // Active Skills - Advanced (Tier 1) - gene indices 16-19
  'Exhaust': 1,          // gene 16
  'Daze': 1,             // gene 17
  'Explosion': 1,        // gene 18
  'Hardened Shield': 1,  // gene 19
  
  // Active Skills - Elite (Tier 2) - gene indices 24-25
  'Stun': 2,             // gene 24
  'Second Wind': 2,      // gene 25
  
  // Active Skills - Exalted/Transcendent (Tier 3) - gene index 28
  'Resurrection': 3,     // gene 28
  
  // Passive Skills - Basic (Tier 0) - gene indices 0-7
  'Duelist': 0,       // gene 0
  'Clutch': 0,        // gene 1
  'Foresight': 0,     // gene 2
  'Headstrong': 0,    // gene 3
  'Clear Vision': 0,  // gene 4
  'Fearless': 0,      // gene 5
  'Chatterbox': 0,    // gene 6
  'Stalwart': 0,      // gene 7
  
  // Passive Skills - Advanced (Tier 1) - gene indices 16-19
  'Leadership': 1,    // gene 16
  'Efficient': 1,     // gene 17
  'Intimidation': 1,  // gene 18 - Enemies deal -5% damage (max 15%)
  'Menacing': 1,      // alias for Intimidation (legacy)
  'Toxic': 1,         // gene 19
  
  // Passive Skills - Elite (Tier 2) - gene indices 24-25
  'Giant Slayer': 2,  // gene 24
  'Last Stand': 2,    // gene 25
  
  // Passive Skills - Exalted/Transcendent (Tier 3) - gene index 28
  'Second Life': 3,   // gene 28
  
  // Fallback for Unknown skills
  'Unknown15': 0
};

/**
 * Get skill tier for a skill name
 * @param {string} skillName - The skill name
 * @returns {number} Tier value (0-3)
 */
export function getSkillTierByName(skillName) {
  const tier = SKILL_TIERS[skillName];
  if (tier === undefined && skillName && !skillName.startsWith('Unknown')) {
    console.warn(`[TTS] Unknown skill name: "${skillName}" - defaulting to tier 0`);
  }
  return tier ?? 0;
}

/**
 * Calculate probability distribution of achieving different TTS values
 * for an offspring from two parent heroes.
 * 
 * Each skill slot produces ONE outcome. TTS is the sum of tiers across all 4 slots.
 * 
 * @param {Object} probs - Summoning probabilities from calculateSummoningProbabilities
 *                         Must have active1, active2, passive1, passive2 probability maps
 * @returns {Object} { ttsProbabilities: {[tts]: probability}, expectedTTS: number }
 */
export function calculateTTSProbabilities(probs) {
  // Convert skill probabilities to tier probabilities for each slot
  function getSlotTierProbs(skillProbs) {
    const tierProbs = { 0: 0, 1: 0, 2: 0, 3: 0 };
    if (!skillProbs || typeof skillProbs !== 'object') {
      tierProbs[0] = 100; // Default to Basic
      return tierProbs;
    }
    for (const [skill, prob] of Object.entries(skillProbs)) {
      const tier = getSkillTierByName(skill);
      tierProbs[tier] = (tierProbs[tier] || 0) + prob;
    }
    // Normalize to 100%
    const total = Object.values(tierProbs).reduce((a, b) => a + b, 0);
    if (total > 0 && Math.abs(total - 100) > 0.1) {
      for (const tier of Object.keys(tierProbs)) {
        tierProbs[tier] = (tierProbs[tier] / total) * 100;
      }
    }
    return tierProbs;
  }
  
  const active1Tiers = getSlotTierProbs(probs.active1);
  const active2Tiers = getSlotTierProbs(probs.active2);
  const passive1Tiers = getSlotTierProbs(probs.passive1);
  const passive2Tiers = getSlotTierProbs(probs.passive2);
  
  // Calculate TTS distribution by iterating all tier combinations
  const ttsProbabilities = {};
  for (let t1 = 0; t1 <= 3; t1++) {
    for (let t2 = 0; t2 <= 3; t2++) {
      for (let t3 = 0; t3 <= 3; t3++) {
        for (let t4 = 0; t4 <= 3; t4++) {
          const tts = t1 + t2 + t3 + t4;
          const prob = (active1Tiers[t1] / 100) * (active2Tiers[t2] / 100) * 
                       (passive1Tiers[t3] / 100) * (passive2Tiers[t4] / 100) * 100;
          if (prob > 0) {
            ttsProbabilities[tts] = (ttsProbabilities[tts] || 0) + prob;
          }
        }
      }
    }
  }
  
  // Calculate expected TTS
  let expectedTTS = 0;
  for (const [tts, prob] of Object.entries(ttsProbabilities)) {
    expectedTTS += parseInt(tts) * prob / 100;
  }
  
  // Calculate probability of achieving TTS >= targetTTS (cumulative)
  const cumulativeProbs = {};
  for (let target = 0; target <= 12; target++) {
    let cumProb = 0;
    for (const [tts, prob] of Object.entries(ttsProbabilities)) {
      if (parseInt(tts) >= target) {
        cumProb += prob;
      }
    }
    cumulativeProbs[target] = Math.round(cumProb * 100) / 100;
  }
  
  return {
    ttsProbabilities: Object.fromEntries(
      Object.entries(ttsProbabilities)
        .map(([tts, prob]) => [tts, Math.round(prob * 100) / 100])
        .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
    ),
    cumulativeProbs,
    expectedTTS: Math.round(expectedTTS * 100) / 100,
    slotTierProbs: {
      active1: active1Tiers,
      active2: active2Tiers,
      passive1: passive1Tiers,
      passive2: passive2Tiers
    }
  };
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
