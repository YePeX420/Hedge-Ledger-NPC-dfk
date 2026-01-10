/**
 * Visual Trait Mutation Maps for DeFi Kingdoms Summoning
 * 
 * Visual traits follow a mutation tree where combining two genes of the same tier
 * can produce a higher tier gene through mutation.
 * 
 * Tier structure:
 * - Basic (B1-B12): Gene IDs 0-11
 * - Advanced (A1-A6): Gene IDs 16-21
 * - Elite (E1-E3): Gene IDs 24-26
 * - Exalted/Transcendent (X1): Gene ID 28
 * 
 * Mutation happens when two CONSECUTIVE basic genes combine.
 * Pattern: 0+1, 2+3, 4+5, 6+7, 8+9, 10+11
 * The mutation probability follows the same genetics weights as trait inheritance.
 */

/**
 * Hair Style Mutation Map
 * Maps pairs of hair style gene IDs to their mutation result
 * 
 * Basic → Advanced (consecutive pairs):
 * B1(0) + B2(1) → A1(16)   Battle Hawk + Wolf Mane → Gruff
 * B3(2) + B4(3) → A2(17)   Enchanter + Wild Growth → Rogue Locs
 * B5(4) + B6(5) → A3(18)   Pixel + Sunrise → Stone Cold
 * B7(6) + B8(7) → A4(19)   Bouffant + Agleam Spike → Zinra's Tail
 * B9(8) + B10(9) → A5(20)  Wayfinder + Faded Topknot → Hedgehog
 * B11(10) + B12(11) → A6(21) Side Shave + Ronin → Delinquent
 * 
 * Advanced → Elite:
 * A1(16) + A2(17) → E1(24) Gruff + Rogue Locs → Skegg
 * A3(18) + A4(19) → E2(25) Stone Cold + Zinra's Tail → Shinobi
 * A5(20) + A6(21) → E3(26) Hedgehog + Delinquent → Sonjo
 * 
 * Elite → Exalted:
 * E1(24) + E2(25) → X1(28) Skegg + Shinobi → Perfect Form
 * E2(25) + E3(26) → X1(28) Shinobi + Sonjo → Perfect Form
 */
export const HAIR_STYLE_MUTATION_MAP = {
  // Basic → Advanced (consecutive pairs)
  '0+1': 16, '1+0': 16,     // Battle Hawk + Wolf Mane → Gruff
  '2+3': 17, '3+2': 17,     // Enchanter + Wild Growth → Rogue Locs
  '4+5': 18, '5+4': 18,     // Pixel + Sunrise → Stone Cold
  '6+7': 19, '7+6': 19,     // Bouffant + Agleam Spike → Zinra's Tail
  '8+9': 20, '9+8': 20,     // Wayfinder + Faded Topknot → Hedgehog
  '10+11': 21, '11+10': 21, // Side Shave + Ronin → Delinquent
  // Advanced → Elite
  '16+17': 24, '17+16': 24, // Gruff + Rogue Locs → Skegg
  '18+19': 25, '19+18': 25, // Stone Cold + Zinra's Tail → Shinobi
  '20+21': 26, '21+20': 26, // Hedgehog + Delinquent → Sonjo
  // Elite → Exalted
  '24+25': 28, '25+24': 28, // Skegg + Shinobi → Perfect Form
  '25+26': 28, '26+25': 28, // Shinobi + Sonjo → Perfect Form
};

/**
 * Hair Color Mutation Map
 * Basic (0-11) → Advanced (16-21) → Elite (24-26) → Exalted (28)
 * Consecutive pairs: 0+1, 2+3, 4+5, 6+7, 8+9, 10+11
 */
export const HAIR_COLOR_MUTATION_MAP = {
  // Basic → Advanced (consecutive pairs)
  '0+1': 16, '1+0': 16,
  '2+3': 17, '3+2': 17,
  '4+5': 18, '5+4': 18,
  '6+7': 19, '7+6': 19,
  '8+9': 20, '9+8': 20,
  '10+11': 21, '11+10': 21,
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
 * Consecutive pairs: 0+1, 2+3, 4+5, 6+7, 8+9, 10+11
 */
export const HEAD_APPENDAGE_MUTATION_MAP = {
  // Basic → Advanced (consecutive pairs)
  '0+1': 16, '1+0': 16,
  '2+3': 17, '3+2': 17,
  '4+5': 18, '5+4': 18,
  '6+7': 19, '7+6': 19,
  '8+9': 20, '9+8': 20,
  '10+11': 21, '11+10': 21,
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
 * Consecutive pairs: 0+1, 2+3, 4+5, 6+7, 8+9, 10+11
 */
export const BACK_APPENDAGE_MUTATION_MAP = {
  // Basic → Advanced (consecutive pairs)
  '0+1': 16, '1+0': 16,
  '2+3': 17, '3+2': 17,
  '4+5': 18, '5+4': 18,
  '6+7': 19, '7+6': 19,
  '8+9': 20, '9+8': 20,
  '10+11': 21, '11+10': 21,
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
 * Consecutive pairs: 0+1, 2+3, 4+5, 6+7, 8+9, 10+11
 */
export const APPENDAGE_COLOR_MUTATION_MAP = {
  // Basic → Advanced (consecutive pairs)
  '0+1': 16, '1+0': 16,
  '2+3': 17, '3+2': 17,
  '4+5': 18, '5+4': 18,
  '6+7': 19, '7+6': 19,
  '8+9': 20, '9+8': 20,
  '10+11': 21, '11+10': 21,
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
 * Consecutive pairs: 0+1, 2+3, 4+5, 6+7, 8+9, 10+11
 */
export const EYE_COLOR_MUTATION_MAP = {
  // Basic → Advanced (consecutive pairs)
  '0+1': 16, '1+0': 16,
  '2+3': 17, '3+2': 17,
  '4+5': 18, '5+4': 18,
  '6+7': 19, '7+6': 19,
  '8+9': 20, '9+8': 20,
  '10+11': 21, '11+10': 21,
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
 * Consecutive pairs: 0+1, 2+3, 4+5, 6+7, 8+9, 10+11
 */
export const SKIN_COLOR_MUTATION_MAP = {
  // Basic → Advanced (consecutive pairs)
  '0+1': 16, '1+0': 16,
  '2+3': 17, '3+2': 17,
  '4+5': 18, '5+4': 18,
  '6+7': 19, '7+6': 19,
  '8+9': 20, '9+8': 20,
  '10+11': 21, '11+10': 21,
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
