/**
 * Visual Trait Mutation Maps for DeFi Kingdoms Summoning
 * 
 * Visual traits follow a mutation tree where combining two genes of the same tier
 * can produce a higher tier gene through mutation.
 * 
 * Tier structure:
 * - Basic (B1-B16): Gene IDs 0-15
 * - Advanced (A1-A6): Gene IDs 16-21
 * - Elite (E1-E3): Gene IDs 24-26
 * - Exalted/Transcendent (X1): Gene ID 28
 * 
 * Mutation happens when two different genes combine and match a mutation pair.
 * The mutation probability follows the same genetics weights as trait inheritance.
 */

/**
 * Hair Style Mutation Map
 * Maps pairs of hair style gene IDs to their mutation result
 * 
 * Basic → Advanced:
 * B1(0) + B3(2) → A1(16)   Battle Hawk + Pixel → Gruff
 * B2(1) + B4(3) → A2(17)   Wolf Mane + Mohawk → Rogue Locs
 * B5(4) + B7(6) → A3(18)   Blade Runner + Tornado → Frizz Out
 * B6(5) + B8(7) → A4(19)   Wild Flow + Curly → Bedhead
 * B9(8) + B11(10) → A5(20) Side Part + Center Part → Fire Swept
 * B10(9) + B12(11) → A6(21) Bob + Fade → Electro
 * 
 * Advanced → Elite:
 * A1(16) + A2(17) → E1(24) Gruff + Rogue Locs → Royalty
 * A3(18) + A4(19) → E2(25) Frizz Out + Bedhead → Crown
 * A5(20) + A6(21) → E3(26) Fire Swept + Electro → Celestial
 * 
 * Elite → Exalted:
 * E1(24) + E2(25) → X1(28) Royalty + Crown → Divine
 * E2(25) + E3(26) → X1(28) Crown + Celestial → Divine
 */
export const HAIR_STYLE_MUTATION_MAP = {
  // Basic → Advanced
  '0+2': 16, '2+0': 16,     // Battle Hawk + Pixel → Gruff
  '1+3': 17, '3+1': 17,     // Wolf Mane + Mohawk → Rogue Locs
  '4+6': 18, '6+4': 18,     // Blade Runner + Tornado → Frizz Out
  '5+7': 19, '7+5': 19,     // Wild Flow + Curly → Bedhead
  '8+10': 20, '10+8': 20,   // Side Part + Center Part → Fire Swept
  '9+11': 21, '11+9': 21,   // Bob + Fade → Electro
  // Advanced → Elite
  '16+17': 24, '17+16': 24, // Gruff + Rogue Locs → Royalty
  '18+19': 25, '19+18': 25, // Frizz Out + Bedhead → Crown
  '20+21': 26, '21+20': 26, // Fire Swept + Electro → Celestial
  // Elite → Exalted
  '24+25': 28, '25+24': 28, // Royalty + Crown → Divine
  '25+26': 28, '26+25': 28, // Crown + Celestial → Divine
};

/**
 * Hair Color Mutation Map
 * Basic (0-15) → Advanced (16-21) → Elite (24-26) → Exalted (28)
 */
export const HAIR_COLOR_MUTATION_MAP = {
  // Basic → Advanced
  '0+2': 16, '2+0': 16,     // Pair 1 → A1
  '1+3': 17, '3+1': 17,     // Pair 2 → A2
  '4+6': 18, '6+4': 18,     // Pair 3 → A3
  '5+7': 19, '7+5': 19,     // Pair 4 → A4
  '8+10': 20, '10+8': 20,   // Pair 5 → A5
  '9+11': 21, '11+9': 21,   // Pair 6 → A6
  // Advanced → Elite
  '16+17': 24, '17+16': 24,
  '18+19': 25, '19+18': 25,
  '20+21': 26, '21+20': 26,
  // Elite → Exalted
  '24+25': 28, '25+24': 28,
  '25+26': 28, '26+25': 28,
};

/**
 * Head Appendage Mutation Map
 * Follows same tier structure as other visual traits
 */
export const HEAD_APPENDAGE_MUTATION_MAP = {
  // Basic → Advanced
  '0+2': 16, '2+0': 16,
  '1+3': 17, '3+1': 17,
  '4+6': 18, '6+4': 18,
  '5+7': 19, '7+5': 19,
  '8+10': 20, '10+8': 20,
  '9+11': 21, '11+9': 21,
  // Advanced → Elite
  '16+17': 24, '17+16': 24,
  '18+19': 25, '19+18': 25,
  '20+21': 26, '21+20': 26,
  // Elite → Exalted
  '24+25': 28, '25+24': 28,
  '25+26': 28, '26+25': 28,
};

/**
 * Back Appendage Mutation Map
 */
export const BACK_APPENDAGE_MUTATION_MAP = {
  // Basic → Advanced
  '0+2': 16, '2+0': 16,
  '1+3': 17, '3+1': 17,
  '4+6': 18, '6+4': 18,
  '5+7': 19, '7+5': 19,
  '8+10': 20, '10+8': 20,
  '9+11': 21, '11+9': 21,
  // Advanced → Elite
  '16+17': 24, '17+16': 24,
  '18+19': 25, '19+18': 25,
  '20+21': 26, '21+20': 26,
  // Elite → Exalted
  '24+25': 28, '25+24': 28,
  '25+26': 28, '26+25': 28,
};

/**
 * Appendage Color Mutation Map
 */
export const APPENDAGE_COLOR_MUTATION_MAP = {
  // Basic → Advanced
  '0+2': 16, '2+0': 16,
  '1+3': 17, '3+1': 17,
  '4+6': 18, '6+4': 18,
  '5+7': 19, '7+5': 19,
  '8+10': 20, '10+8': 20,
  '9+11': 21, '11+9': 21,
  // Advanced → Elite
  '16+17': 24, '17+16': 24,
  '18+19': 25, '19+18': 25,
  '20+21': 26, '21+20': 26,
  // Elite → Exalted
  '24+25': 28, '25+24': 28,
  '25+26': 28, '26+25': 28,
};

/**
 * Eye Color Mutation Map
 */
export const EYE_COLOR_MUTATION_MAP = {
  // Basic → Advanced
  '0+2': 16, '2+0': 16,
  '1+3': 17, '3+1': 17,
  '4+6': 18, '6+4': 18,
  '5+7': 19, '7+5': 19,
  '8+10': 20, '10+8': 20,
  '9+11': 21, '11+9': 21,
  // Advanced → Elite
  '16+17': 24, '17+16': 24,
  '18+19': 25, '19+18': 25,
  '20+21': 26, '21+20': 26,
  // Elite → Exalted
  '24+25': 28, '25+24': 28,
  '25+26': 28, '26+25': 28,
};

/**
 * Skin Color Mutation Map
 */
export const SKIN_COLOR_MUTATION_MAP = {
  // Basic → Advanced
  '0+2': 16, '2+0': 16,
  '1+3': 17, '3+1': 17,
  '4+6': 18, '6+4': 18,
  '5+7': 19, '7+5': 19,
  '8+10': 20, '10+8': 20,
  '9+11': 21, '11+9': 21,
  // Advanced → Elite
  '16+17': 24, '17+16': 24,
  '18+19': 25, '19+18': 25,
  '20+21': 26, '21+20': 26,
  // Elite → Exalted
  '24+25': 28, '25+24': 28,
  '25+26': 28, '26+25': 28,
};

/**
 * Get mutation result for a visual trait gene combination
 * @param {number} gene1 - First parent's gene ID
 * @param {number} gene2 - Second parent's gene ID
 * @param {Object} mutationMap - The mutation map for the trait
 * @returns {number|null} Mutated gene ID or null if no mutation
 */
export function getVisualMutation(gene1, gene2, mutationMap) {
  if (gene1 === gene2) return null; // Same genes don't mutate
  const key = `${gene1}+${gene2}`;
  return mutationMap[key] ?? null;
}

/**
 * Check if a gene ID is a mutation result (Advanced tier or higher)
 * @param {number} geneId - Gene ID to check
 * @returns {boolean} True if this is a mutation result
 */
export function isMutationResult(geneId) {
  // Gene IDs 16+ are mutation results (Advanced, Elite, Exalted tiers)
  return geneId >= 16;
}

/**
 * Get the tier name for a gene ID
 * @param {number} geneId - Gene ID
 * @returns {string} Tier name
 */
export function getGeneTier(geneId) {
  if (geneId >= 28) return 'Exalted';
  if (geneId >= 24) return 'Elite';
  if (geneId >= 16) return 'Advanced';
  return 'Basic';
}
