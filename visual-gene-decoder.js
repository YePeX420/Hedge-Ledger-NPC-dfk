/**
 * DeFi Kingdoms Visual Gene Decoder
 * 
 * Visual genes use 8-bit encoding for colors (0-255) instead of 4-bit like stat genes.
 * This decoder properly extracts colors, appendages, and backgrounds with hex codes and names.
 */

// ============================================================================
// VISUAL TRAIT MAPPINGS
// ============================================================================

const GENDER_MAP = {
  0: 'Male',
  1: 'Female',
  2: 'Unknown',
  3: 'Unknown',
  4: 'Unknown',
  5: 'Unknown',
  6: 'Unknown',
  7: 'Unknown',
  8: 'Unknown'
};

const HEAD_APPENDAGE_MAP = {
  0: 'None',
  1: 'Kitsune Ears',
  2: 'Satyr Horns',
  3: 'Ram Horns',
  4: 'Imp Horns',
  5: 'Cat Ears',
  6: 'Minotaur Horns',
  7: 'Faun Horns',
  8: 'Draconic Horns',
  9: 'Fae Circlet',
  10: 'Ragfly Antennae',
  11: 'Royal Crown',
  16: 'Jagged Horns',
  17: 'Spindle Horns',
  18: 'Bear Ears',
  19: 'Antennae',
  20: 'Fallen Angel Coronet',
  21: 'Power Horn',
  24: 'Wood Elf Ears',
  25: 'Snow Elf Ears',
  26: 'Cranial Wings',
  28: 'Insight Jewel'
};

const BACK_APPENDAGE_MAP = {
  0: 'None',
  1: 'Dragon Wings',
  2: 'Angel Wings',
  3: 'Demon Wings',
  4: 'Fairy Wings',
  5: 'Cape',
  6: 'Skeletal Wings',
  7: 'Mechanical Wings'
};

const BACKGROUND_MAP = {
  0: 'Desert',
  1: 'Forest',
  2: 'Plains',
  3: 'Island',
  4: 'Swamp',
  5: 'Mountains',
  6: 'City',
  7: 'Arctic',
  8: 'Volcano'
};

// Hair color palette (indexed 0-255, but DFK uses specific subset)
const HAIR_COLORS = {
  0: '#C0C0C0',   // Silver
  1: '#4B3621',   // Dark Brown
  2: '#8B4513',   // Brown
  3: '#D2691E',   // Light Brown
  4: '#FFD700',   // Golden
  5: '#FFFF00',   // Yellow
  6: '#FF6347',   // Red
  7: '#8B0000',   // Dark Red
  8: '#000000',   // Black
  9: '#FF69B4',   // Pink
  10: '#9370DB',  // Purple
  11: '#00CED1',  // Cyan
  12: '#228B22',  // Green
  13: '#FFFFFF',  // White
  14: '#FF8C00',  // Orange
  15: '#4169E1'   // Blue
};

// Eye color palette
const EYE_COLORS = {
  0: '#8B4513',   // Brown
  1: '#4169E1',   // Blue
  2: '#228B22',   // Green
  3: '#808080',   // Gray
  4: '#9370DB',   // Purple
  5: '#FF6347',   // Red
  6: '#00CED1',   // Cyan
  7: '#FFD700',   // Gold
  8: '#000000',   // Black
  9: '#FF69B4',   // Pink
  10: '#FFFF00',  // Yellow
  11: '#FFFFFF',  // White
  12: '#FF8C00',  // Orange
  13: '#00FF00',  // Lime
  14: '#8B0000',  // Dark Red
  15: '#C0C0C0'   // Silver
};

// Skin tone palette
const SKIN_COLORS = {
  0: '#FFF5E1',   // Porcelain
  1: '#FFE4C4',   // Cream
  2: '#F5DEB3',   // Wheat
  3: '#DEB887',   // Tan
  4: '#D2B48C',   // Light Brown
  5: '#BC8F8F',   // Rosy Brown
  6: '#CD853F',   // Peru
  7: '#8B4513',   // Brown
  8: '#654321',   // Dark Brown
  9: '#00FF00',   // Green (Orc)
  10: '#87CEEB',  // Blue (Aquatic)
  11: '#9370DB',  // Purple (Mystic)
  12: '#FFB6C1',  // Pink (Fae)
  13: '#808080',  // Gray (Stone)
  14: '#FFFFFF',  // White (Undead)
  15: '#FF6347'   // Red (Demon)
};

// Appendage colors (matches hair colors)
const APPENDAGE_COLORS = HAIR_COLORS;
const BACK_APPENDAGE_COLORS = HAIR_COLORS;

// ============================================================================
// GENE EXTRACTION FUNCTIONS
// ============================================================================

/**
 * Extracts an 8-bit gene value (for colors)
 * @param {BigInt} genes - The visual genes as BigInt
 * @param {number} bitOffset - Starting bit position
 * @returns {number} Gene value (0-255)
 */
function extract8BitGene(genes, bitOffset) {
  const shifted = genes >> BigInt(bitOffset);
  const masked = shifted & BigInt(0xFF); // 8 bits
  return Number(masked);
}

/**
 * Extracts a 4-bit gene value (for non-color traits)
 * @param {BigInt} genes - The visual genes as BigInt
 * @param {number} bitOffset - Starting bit position
 * @returns {number} Gene value (0-15)
 */
function extract4BitGene(genes, bitOffset) {
  const shifted = genes >> BigInt(bitOffset);
  const masked = shifted & BigInt(0xF); // 4 bits
  return Number(masked);
}

/**
 * Decodes a single visual trait with proper bit widths
 * Visual genes structure (from LSB to MSB):
 * - Gender: 2 bits (positions 0-1)
 * - Head Appendage: 8 bits (positions 2-9)
 * - Back Appendage: 8 bits (positions 10-17)
 * - Background: 8 bits (positions 18-25)
 * - Hair Style: 8 bits (positions 26-33)
 * - Hair Color: 8 bits (positions 34-41)
 * - Visual Unknown 1: 8 bits (positions 42-49)
 * - Eye Color: 8 bits (positions 50-57)
 * - Skin Color: 8 bits (positions 58-65)
 * - Appendage Color: 8 bits (positions 66-73)
 * - Back Appendage Color: 8 bits (positions 74-81)
 * - Visual Unknown 2: 8 bits (positions 82-89)
 * 
 * Each trait has D + R1 + R2 + R3 (4 genes total)
 */
function decodeVisualTrait(genes, traitName, baseOffset, bitWidth = 8) {
  const genesBigInt = typeof genes === 'string' ? BigInt(genes) : genes;
  
  const extractFunc = bitWidth === 8 ? extract8BitGene : extract4BitGene;
  
  // Extract all 4 genes for this trait (D, R1, R2, R3)
  const d = extractFunc(genesBigInt, baseOffset);
  const r1 = extractFunc(genesBigInt, baseOffset + bitWidth);
  const r2 = extractFunc(genesBigInt, baseOffset + bitWidth * 2);
  const r3 = extractFunc(genesBigInt, baseOffset + bitWidth * 3);
  
  return { d, r1, r2, r3 };
}

/**
 * Gets color hex code from palette
 * @param {Object} palette - Color palette object
 * @param {number} index - Color index
 * @returns {string} Hex color code
 */
function getColorHex(palette, index) {
  return palette[index] || palette[index % 16] || '#FFFFFF';
}

/**
 * Gets trait name from mapping
 * @param {Object} mapping - Trait name mapping
 * @param {number} value - Trait value
 * @returns {string} Trait name
 */
function getTraitName(mapping, value) {
  return mapping[value] || `Unknown${value}`;
}

// ============================================================================
// MAIN DECODING FUNCTION
// ============================================================================

/**
 * Fully decodes visual genes with proper 8-bit color extraction
 * @param {string|BigInt} visualGenes - The visualGenes value
 * @returns {Object} Decoded visual traits with hex colors and names
 */
function decodeVisualGenes(visualGenes) {
  const genesBigInt = typeof visualGenes === 'string' ? BigInt(visualGenes) : visualGenes;
  
  // Extract each trait with proper offsets and bit widths
  // Note: Gender uses 2 bits, everything else uses 8 bits
  const gender = decodeVisualTrait(genesBigInt, 'gender', 0, 2);
  const headAppendage = decodeVisualTrait(genesBigInt, 'headAppendage', 2, 8);
  const backAppendage = decodeVisualTrait(genesBigInt, 'backAppendage', 34, 8);
  const background = decodeVisualTrait(genesBigInt, 'background', 66, 8);
  const hairStyle = decodeVisualTrait(genesBigInt, 'hairStyle', 98, 8);
  const hairColor = decodeVisualTrait(genesBigInt, 'hairColor', 130, 8);
  const visualUnknown1 = decodeVisualTrait(genesBigInt, 'visualUnknown1', 162, 8);
  const eyeColor = decodeVisualTrait(genesBigInt, 'eyeColor', 194, 8);
  const skinColor = decodeVisualTrait(genesBigInt, 'skinColor', 226, 8);
  const appendageColor = decodeVisualTrait(genesBigInt, 'appendageColor', 258, 8);
  const backAppendageColor = decodeVisualTrait(genesBigInt, 'backAppendageColor', 290, 8);
  const visualUnknown2 = decodeVisualTrait(genesBigInt, 'visualUnknown2', 322, 8);
  
  // Format output with names and hex colors
  return {
    gender: {
      d: { value: gender.d, name: getTraitName(GENDER_MAP, gender.d) },
      r1: { value: gender.r1, name: getTraitName(GENDER_MAP, gender.r1) },
      r2: { value: gender.r2, name: getTraitName(GENDER_MAP, gender.r2) },
      r3: { value: gender.r3, name: getTraitName(GENDER_MAP, gender.r3) }
    },
    
    headAppendage: {
      d: { value: headAppendage.d, name: getTraitName(HEAD_APPENDAGE_MAP, headAppendage.d) },
      r1: { value: headAppendage.r1, name: getTraitName(HEAD_APPENDAGE_MAP, headAppendage.r1) },
      r2: { value: headAppendage.r2, name: getTraitName(HEAD_APPENDAGE_MAP, headAppendage.r2) },
      r3: { value: headAppendage.r3, name: getTraitName(HEAD_APPENDAGE_MAP, headAppendage.r3) }
    },
    
    backAppendage: {
      d: { value: backAppendage.d, name: getTraitName(BACK_APPENDAGE_MAP, backAppendage.d) },
      r1: { value: backAppendage.r1, name: getTraitName(BACK_APPENDAGE_MAP, backAppendage.r1) },
      r2: { value: backAppendage.r2, name: getTraitName(BACK_APPENDAGE_MAP, backAppendage.r2) },
      r3: { value: backAppendage.r3, name: getTraitName(BACK_APPENDAGE_MAP, backAppendage.r3) }
    },
    
    background: {
      d: { value: background.d, name: getTraitName(BACKGROUND_MAP, background.d) },
      r1: { value: background.r1, name: getTraitName(BACKGROUND_MAP, background.r1) },
      r2: { value: background.r2, name: getTraitName(BACKGROUND_MAP, background.r2) },
      r3: { value: background.r3, name: getTraitName(BACKGROUND_MAP, background.r3) }
    },
    
    hairStyle: {
      d: { value: hairStyle.d, name: `Style ${hairStyle.d}` },
      r1: { value: hairStyle.r1, name: `Style ${hairStyle.r1}` },
      r2: { value: hairStyle.r2, name: `Style ${hairStyle.r2}` },
      r3: { value: hairStyle.r3, name: `Style ${hairStyle.r3}` }
    },
    
    hairColor: {
      d: { value: hairColor.d, hex: getColorHex(HAIR_COLORS, hairColor.d) },
      r1: { value: hairColor.r1, hex: getColorHex(HAIR_COLORS, hairColor.r1) },
      r2: { value: hairColor.r2, hex: getColorHex(HAIR_COLORS, hairColor.r2) },
      r3: { value: hairColor.r3, hex: getColorHex(HAIR_COLORS, hairColor.r3) }
    },
    
    eyeColor: {
      d: { value: eyeColor.d, hex: getColorHex(EYE_COLORS, eyeColor.d) },
      r1: { value: eyeColor.r1, hex: getColorHex(EYE_COLORS, eyeColor.r1) },
      r2: { value: eyeColor.r2, hex: getColorHex(EYE_COLORS, eyeColor.r2) },
      r3: { value: eyeColor.r3, hex: getColorHex(EYE_COLORS, eyeColor.r3) }
    },
    
    skinColor: {
      d: { value: skinColor.d, hex: getColorHex(SKIN_COLORS, skinColor.d) },
      r1: { value: skinColor.r1, hex: getColorHex(SKIN_COLORS, skinColor.r1) },
      r2: { value: skinColor.r2, hex: getColorHex(SKIN_COLORS, skinColor.r2) },
      r3: { value: skinColor.r3, hex: getColorHex(SKIN_COLORS, skinColor.r3) }
    },
    
    appendageColor: {
      d: { value: appendageColor.d, hex: getColorHex(APPENDAGE_COLORS, appendageColor.d) },
      r1: { value: appendageColor.r1, hex: getColorHex(APPENDAGE_COLORS, appendageColor.r1) },
      r2: { value: appendageColor.r2, hex: getColorHex(APPENDAGE_COLORS, appendageColor.r2) },
      r3: { value: appendageColor.r3, hex: getColorHex(APPENDAGE_COLORS, appendageColor.r3) }
    },
    
    backAppendageColor: {
      d: { value: backAppendageColor.d, hex: getColorHex(BACK_APPENDAGE_COLORS, backAppendageColor.d) },
      r1: { value: backAppendageColor.r1, hex: getColorHex(BACK_APPENDAGE_COLORS, backAppendageColor.r1) },
      r2: { value: backAppendageColor.r2, hex: getColorHex(BACK_APPENDAGE_COLORS, backAppendageColor.r2) },
      r3: { value: backAppendageColor.r3, hex: getColorHex(BACK_APPENDAGE_COLORS, backAppendageColor.r3) }
    },
    
    visualUnknown1: {
      d: { value: visualUnknown1.d },
      r1: { value: visualUnknown1.r1 },
      r2: { value: visualUnknown1.r2 },
      r3: { value: visualUnknown1.r3 }
    },
    
    visualUnknown2: {
      d: { value: visualUnknown2.d },
      r1: { value: visualUnknown2.r1 },
      r2: { value: visualUnknown2.r2 },
      r3: { value: visualUnknown2.r3 }
    }
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  decodeVisualGenes,
  GENDER_MAP,
  HEAD_APPENDAGE_MAP,
  BACK_APPENDAGE_MAP,
  BACKGROUND_MAP,
  HAIR_COLORS,
  EYE_COLORS,
  SKIN_COLORS
};

export default {
  decodeVisualGenes,
  GENDER_MAP,
  HEAD_APPENDAGE_MAP,
  BACK_APPENDAGE_MAP,
  BACKGROUND_MAP,
  HAIR_COLORS,
  EYE_COLORS,
  SKIN_COLORS
};
