/**
 * DeFi Kingdoms Visual Gene Decoder
 * 
 * Based on the degenking library implementation
 * Visual genes are converted to Kai (base-32) format, then extracted
 */

// ============================================================================
// VISUAL TRAIT MAPPINGS
// ============================================================================

const GENDER_MAP = {
  0: 'Male',
  1: 'Female',
  2: 'Unknown2',
  3: 'Unknown3',
  4: 'Unknown4',
  5: 'Unknown5',
  6: 'Unknown6',
  7: 'Unknown7',
  8: 'Unknown8',
  9: 'Unknown9',
  10: 'Unknown10',
  11: 'Unknown11',
  12: 'Unknown12',
  13: 'Unknown13',
  14: 'Unknown14',
  15: 'Unknown15'
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
  7: 'Arctic'
};

// Hair color palette
const HAIR_COLORS = [
  '#C0C0C0',   // 0 - Silver
  '#4B3621',   // 1 - Dark Brown
  '#8B4513',   // 2 - Brown
  '#D2691E',   // 3 - Light Brown
  '#FFD700',   // 4 - Golden
  '#FFFF00',   // 5 - Yellow
  '#FF6347',   // 6 - Red
  '#8B0000',   // 7 - Dark Red
  '#000000',   // 8 - Black
  '#FF69B4',   // 9 - Pink
  '#9370DB',   // 10 - Purple
  '#00CED1',   // 11 - Cyan
  '#228B22',   // 12 - Green
  '#FFFFFF',   // 13 - White
  '#FF8C00',   // 14 - Orange
  '#4169E1'    // 15 - Blue
];

// Eye color palette
const EYE_COLORS = [
  '#8B4513',   // 0 - Brown
  '#4169E1',   // 1 - Blue
  '#228B22',   // 2 - Green
  '#808080',   // 3 - Gray
  '#9370DB',   // 4 - Purple
  '#FF6347',   // 5 - Red
  '#00CED1',   // 6 - Cyan
  '#FFD700',   // 7 - Gold
  '#000000',   // 8 - Black
  '#FF69B4',   // 9 - Pink
  '#FFFF00',   // 10 - Yellow
  '#FFFFFF',   // 11 - White
  '#FF8C00',   // 12 - Orange
  '#00FF00',   // 13 - Lime
  '#8B0000',   // 14 - Dark Red
  '#C0C0C0'    // 15 - Silver
];

// Skin tone palette
const SKIN_COLORS = [
  '#FFF5E1',   // 0 - Porcelain
  '#FFE4C4',   // 1 - Cream
  '#F5DEB3',   // 2 - Wheat
  '#DEB887',   // 3 - Tan
  '#D2B48C',   // 4 - Light Brown
  '#BC8F8F',   // 5 - Rosy Brown
  '#CD853F',   // 6 - Peru
  '#8B4513',   // 7 - Brown
  '#654321',   // 8 - Dark Brown
  '#87CEEB',   // 9 - Blue (Aquatic)
  '#00FF00',   // 10 - Green (Orc)
  '#9370DB',   // 11 - Purple (Mystic)
  '#FFB6C1',   // 12 - Pink (Fae)
  '#808080',   // 13 - Gray (Stone)
  '#FFFFFF',   // 14 - White (Undead)
  '#FF6347'    // 15 - Red (Demon)
];

// Visual trait order (matches degenking VISUAL_GENE_MAP)
const VISUAL_TRAIT_ORDER = [
  'gender',
  'headAppendage',
  'backAppendage',
  'background',
  'hairStyle',
  'hairColor',
  'visualUnknown1',
  'eyeColor',
  'skinColor',
  'appendageColor',
  'backAppendageColor',
  'visualUnknown2'
];

// ============================================================================
// GENE CONVERSION FUNCTIONS (Based on degenking)
// ============================================================================

/**
 * Convert genes to Kai (base-32) representation
 * @param {BigInt} genes - The visual genes as BigInt
 * @returns {string} Kai representation
 */
function genesToKai(genes) {
  const ALPHABET = '123456789abcdefghijkmnopqrstuvwx';
  const BASE = BigInt(ALPHABET.length);
  
  let buf = '';
  while (genes >= BASE) {
    const mod = Number(genes % BASE);
    buf = ALPHABET[mod] + buf;
    genes = genes / BASE;
  }
  
  if (genes > 0n) {
    buf = ALPHABET[Number(genes)] + buf;
  }
  
  // Pad to 48 characters (12 traits × 4 genes each)
  while (buf.length < 48) {
    buf = ALPHABET[0] + buf;
  }
  
  return buf;
}

/**
 * Convert Kai character to decimal
 * @param {string} kai - Single Kai character
 * @returns {number} Decimal value (0-31)
 */
function kai2dec(kai) {
  const ALPHABET = '123456789abcdefghijkmnopqrstuvwx';
  return ALPHABET.indexOf(kai);
}

/**
 * Gets color hex code from palette
 * @param {Array} palette - Color palette array
 * @param {number} index - Color index
 * @returns {string} Hex color code
 */
function getColorHex(palette, index) {
  return palette[index % palette.length] || '#FFFFFF';
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
 * Fully decodes visual genes using Kai conversion (matches degenking implementation)
 * @param {string|BigInt} visualGenes - The visualGenes value
 * @returns {Object} Decoded visual traits with hex colors and names
 */
function decodeVisualGenes(visualGenes) {
  const genesBigInt = typeof visualGenes === 'string' ? BigInt(visualGenes) : visualGenes;
  
  // Convert to Kai representation
  const rawKai = genesToKai(genesBigInt);
  
  const decoded = {};
  const recessives = {};
  
  // Extract traits (4 Kai characters per trait = D, R1, R2, R3)
  for (let i = 0; i < rawKai.length; i++) {
    const traitIndex = Math.floor(i / 4);
    const trait = VISUAL_TRAIT_ORDER[traitIndex];
    
    if (!trait) continue;
    
    const kai = rawKai[i];
    const valueNum = kai2dec(kai);
    
    // Initialize trait storage
    if (!decoded[trait]) {
      decoded[trait] = { d: null, r1: null, r2: null, r3: null };
    }
    
    // Assign to proper gene position (reverse order: R3, R2, R1, D)
    const position = i % 4;
    if (position === 0) decoded[trait].r3 = valueNum;
    else if (position === 1) decoded[trait].r2 = valueNum;
    else if (position === 2) decoded[trait].r1 = valueNum;
    else if (position === 3) decoded[trait].d = valueNum;
  }
  
  // Format output with names and hex colors
  return {
    gender: {
      d: { value: decoded.gender.d, name: getTraitName(GENDER_MAP, decoded.gender.d) },
      r1: { value: decoded.gender.r1, name: getTraitName(GENDER_MAP, decoded.gender.r1) },
      r2: { value: decoded.gender.r2, name: getTraitName(GENDER_MAP, decoded.gender.r2) },
      r3: { value: decoded.gender.r3, name: getTraitName(GENDER_MAP, decoded.gender.r3) }
    },
    
    headAppendage: {
      d: { value: decoded.headAppendage.d, name: getTraitName(HEAD_APPENDAGE_MAP, decoded.headAppendage.d) },
      r1: { value: decoded.headAppendage.r1, name: getTraitName(HEAD_APPENDAGE_MAP, decoded.headAppendage.r1) },
      r2: { value: decoded.headAppendage.r2, name: getTraitName(HEAD_APPENDAGE_MAP, decoded.headAppendage.r2) },
      r3: { value: decoded.headAppendage.r3, name: getTraitName(HEAD_APPENDAGE_MAP, decoded.headAppendage.r3) }
    },
    
    backAppendage: {
      d: { value: decoded.backAppendage.d, name: getTraitName(BACK_APPENDAGE_MAP, decoded.backAppendage.d) },
      r1: { value: decoded.backAppendage.r1, name: getTraitName(BACK_APPENDAGE_MAP, decoded.backAppendage.r1) },
      r2: { value: decoded.backAppendage.r2, name: getTraitName(BACK_APPENDAGE_MAP, decoded.backAppendage.r2) },
      r3: { value: decoded.backAppendage.r3, name: getTraitName(BACK_APPENDAGE_MAP, decoded.backAppendage.r3) }
    },
    
    background: {
      d: { value: decoded.background.d, name: getTraitName(BACKGROUND_MAP, decoded.background.d) },
      r1: { value: decoded.background.r1, name: getTraitName(BACKGROUND_MAP, decoded.background.r1) },
      r2: { value: decoded.background.r2, name: getTraitName(BACKGROUND_MAP, decoded.background.r2) },
      r3: { value: decoded.background.r3, name: getTraitName(BACKGROUND_MAP, decoded.background.r3) }
    },
    
    hairStyle: {
      d: { value: decoded.hairStyle.d, name: `Style ${decoded.hairStyle.d}` },
      r1: { value: decoded.hairStyle.r1, name: `Style ${decoded.hairStyle.r1}` },
      r2: { value: decoded.hairStyle.r2, name: `Style ${decoded.hairStyle.r2}` },
      r3: { value: decoded.hairStyle.r3, name: `Style ${decoded.hairStyle.r3}` }
    },
    
    hairColor: {
      d: { value: decoded.hairColor.d, hex: getColorHex(HAIR_COLORS, decoded.hairColor.d) },
      r1: { value: decoded.hairColor.r1, hex: getColorHex(HAIR_COLORS, decoded.hairColor.r1) },
      r2: { value: decoded.hairColor.r2, hex: getColorHex(HAIR_COLORS, decoded.hairColor.r2) },
      r3: { value: decoded.hairColor.r3, hex: getColorHex(HAIR_COLORS, decoded.hairColor.r3) }
    },
    
    eyeColor: {
      d: { value: decoded.eyeColor.d, hex: getColorHex(EYE_COLORS, decoded.eyeColor.d) },
      r1: { value: decoded.eyeColor.r1, hex: getColorHex(EYE_COLORS, decoded.eyeColor.r1) },
      r2: { value: decoded.eyeColor.r2, hex: getColorHex(EYE_COLORS, decoded.eyeColor.r2) },
      r3: { value: decoded.eyeColor.r3, hex: getColorHex(EYE_COLORS, decoded.eyeColor.r3) }
    },
    
    skinColor: {
      d: { value: decoded.skinColor.d, hex: getColorHex(SKIN_COLORS, decoded.skinColor.d) },
      r1: { value: decoded.skinColor.r1, hex: getColorHex(SKIN_COLORS, decoded.skinColor.r1) },
      r2: { value: decoded.skinColor.r2, hex: getColorHex(SKIN_COLORS, decoded.skinColor.r2) },
      r3: { value: decoded.skinColor.r3, hex: getColorHex(SKIN_COLORS, decoded.skinColor.r3) }
    },
    
    appendageColor: {
      d: { value: decoded.appendageColor.d, hex: getColorHex(HAIR_COLORS, decoded.appendageColor.d) },
      r1: { value: decoded.appendageColor.r1, hex: getColorHex(HAIR_COLORS, decoded.appendageColor.r1) },
      r2: { value: decoded.appendageColor.r2, hex: getColorHex(HAIR_COLORS, decoded.appendageColor.r2) },
      r3: { value: decoded.appendageColor.r3, hex: getColorHex(HAIR_COLORS, decoded.appendageColor.r3) }
    },
    
    backAppendageColor: {
      d: { value: decoded.backAppendageColor.d, hex: getColorHex(HAIR_COLORS, decoded.backAppendageColor.d) },
      r1: { value: decoded.backAppendageColor.r1, hex: getColorHex(HAIR_COLORS, decoded.backAppendageColor.r1) },
      r2: { value: decoded.backAppendageColor.r2, hex: getColorHex(HAIR_COLORS, decoded.backAppendageColor.r2) },
      r3: { value: decoded.backAppendageColor.r3, hex: getColorHex(HAIR_COLORS, decoded.backAppendageColor.r3) }
    },
    
    visualUnknown1: {
      d: { value: decoded.visualUnknown1.d },
      r1: { value: decoded.visualUnknown1.r1 },
      r2: { value: decoded.visualUnknown1.r2 },
      r3: { value: decoded.visualUnknown1.r3 }
    },
    
    visualUnknown2: {
      d: { value: decoded.visualUnknown2.d },
      r1: { value: decoded.visualUnknown2.r1 },
      r2: { value: decoded.visualUnknown2.r2 },
      r3: { value: decoded.visualUnknown2.r3 }
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
