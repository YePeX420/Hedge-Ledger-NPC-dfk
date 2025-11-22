// hero-genetics.js
// DeFi Kingdoms hero gene decoding system
// Decodes raw gene data into dominant + R1/R2/R3 recessives for all traits

// ========== TRAIT MAPPING TABLES ==========

// Hero Classes (mainClass and subClass)
const CLASSES = {
  0: 'Warrior',
  1: 'Knight',
  2: 'Thief',
  3: 'Archer',
  4: 'Priest',
  5: 'Wizard',
  6: 'Monk',
  7: 'Pirate',
  8: 'Berserker',
  9: 'Seer',
  10: 'Legionnaire',
  11: 'Scholar',
  12: 'Paladin',
  13: 'DarkKnight',
  14: 'Summoner',
  15: 'Ninja',
  16: 'Shapeshifter',
  17: 'Bard'
};

// Professions
const PROFESSIONS = {
  0: 'Mining',
  2: 'Gardening',
  4: 'Foraging',
  6: 'Fishing'
};

// Elements
const ELEMENTS = {
  0: 'Fire',
  1: 'Water',
  2: 'Earth',
  3: 'Wind',
  4: 'Lightning',
  5: 'Ice',
  6: 'Light',
  7: 'Dark'
};

// Stat Growth Types
const STAT_GROWTH = {
  0: 'Very Low',
  1: 'Low',
  2: 'Medium',
  3: 'High',
  4: 'Very High'
};

// Background/Visual trait mappings (for visualGenes)
const BACKGROUNDS = {
  0: 'Desert',
  2: 'Forest',
  4: 'Plains',
  6: 'Island',
  8: 'Swamp',
  10: 'Mountains',
  12: 'City',
  14: 'Arctic'
};

// ========== GENE EXTRACTION UTILITIES ==========

/**
 * Convert hex string to BigInt for bit manipulation
 */
function hexToBigInt(hexString) {
  if (!hexString) return 0n;
  // Remove '0x' prefix if present
  const cleaned = hexString.startsWith('0x') ? hexString.slice(2) : hexString;
  return BigInt('0x' + cleaned);
}

/**
 * Extract bits from a gene at a specific position
 * @param {BigInt} genes - The gene data as BigInt
 * @param {number} position - Bit position to start extraction
 * @param {number} length - Number of bits to extract
 * @returns {number} - Extracted value as number
 */
function extractBits(genes, position, length) {
  const mask = (1n << BigInt(length)) - 1n;
  return Number((genes >> BigInt(position)) & mask);
}

/**
 * Extract a trait with all 4 positions (dominant, R1, R2, R3)
 * @param {BigInt} genes - The gene data as BigInt
 * @param {number} startPos - Starting bit position for this trait
 * @param {number} bitsPerGene - Bits per gene position (typically 4 or 8)
 * @param {Object} mapping - The trait mapping table
 * @returns {Object} - { dominant, R1, R2, R3 }
 */
function extractTrait(genes, startPos, bitsPerGene, mapping) {
  const positions = ['dominant', 'R1', 'R2', 'R3'];
  const result = {};
  
  for (let i = 0; i < 4; i++) {
    const position = startPos + (i * bitsPerGene);
    const geneCode = extractBits(genes, position, bitsPerGene);
    result[positions[i]] = mapping[geneCode] || `Unknown(${geneCode})`;
  }
  
  return result;
}

// ========== MAIN DECODER FUNCTION ==========

/**
 * Decode hero genes into structured trait data
 * @param {Object} hero - Hero object from GraphQL (must include genes field)
 * @returns {Object} - Decoded genetics with dominant + R1/R2/R3 for each trait
 */
export function decodeHeroGenes(hero) {
  if (!hero) {
    throw new Error('Hero object is required');
  }

  // Parse raw genes
  const genesBigInt = hexToBigInt(hero.genes);
  const visualGenesBigInt = hexToBigInt(hero.visualGenes);
  const statGenesBigInt = hero.statGenes ? hexToBigInt(hero.statGenes) : 0n;

  // DFK gene layout (approximate positions based on standard encoding):
  // Positions are in bits, reading right-to-left from the uint256
  
  // Main genes (hero.genes):
  // - Class: bits 0-31 (8 bits per position, 4 positions)
  // - SubClass: bits 32-63
  // - Profession: bits 64-95
  // - Element: bits 96-127
  // - Stat growth genes are in separate statGenes field
  
  const decoded = {
    id: hero.id,
    normalizedId: hero.normalizedId || hero.id,
    realm: hero.network || hero.originRealm || 'unknown',
    
    // Extract main traits
    mainClass: extractTrait(genesBigInt, 0, 8, CLASSES),
    subClass: extractTrait(genesBigInt, 32, 8, CLASSES),
    profession: extractTrait(genesBigInt, 64, 8, PROFESSIONS),
    element: extractTrait(genesBigInt, 96, 8, ELEMENTS),
    
    // Extract stat growth traits (from statGenes if available)
    stats: {
      strength: extractTrait(statGenesBigInt, 0, 4, STAT_GROWTH),
      intelligence: extractTrait(statGenesBigInt, 16, 4, STAT_GROWTH),
      wisdom: extractTrait(statGenesBigInt, 32, 4, STAT_GROWTH),
      luck: extractTrait(statGenesBigInt, 48, 4, STAT_GROWTH),
      agility: extractTrait(statGenesBigInt, 64, 4, STAT_GROWTH),
      vitality: extractTrait(statGenesBigInt, 80, 4, STAT_GROWTH),
      endurance: extractTrait(statGenesBigInt, 96, 4, STAT_GROWTH),
      dexterity: extractTrait(statGenesBigInt, 112, 4, STAT_GROWTH)
    },
    
    // Extract visual traits (from visualGenes if available)
    visual: {
      background: extractTrait(visualGenesBigInt, 0, 8, BACKGROUNDS)
    },
    
    // Raw gene data (for debugging/verification)
    raw: {
      genes: hero.genes,
      visualGenes: hero.visualGenes,
      statGenes: hero.statGenes
    }
  };

  return decoded;
}

/**
 * Check if a hero has a specific profession gene (any position)
 * Useful for garden optimization to detect profession bonuses
 * @param {Object} decodedGenes - Output from decodeHeroGenes()
 * @param {string} professionName - e.g. 'Gardening', 'Mining', 'Fishing'
 * @returns {boolean} - True if hero has the profession gene in any position
 */
export function hasProfessionGene(decodedGenes, professionName) {
  if (!decodedGenes || !decodedGenes.profession) return false;
  
  const prof = decodedGenes.profession;
  return prof.dominant === professionName ||
         prof.R1 === professionName ||
         prof.R2 === professionName ||
         prof.R3 === professionName;
}

/**
 * Get profession gene bonus (1 if has gene, 0 otherwise)
 * This matches the DFK garden formula: geneBonus = 1 if gardening gene, else 0
 * @param {Object} decodedGenes - Output from decodeHeroGenes()
 * @param {string} professionName - e.g. 'Gardening'
 * @returns {number} - 1 or 0
 */
export function getProfessionGeneBonus(decodedGenes, professionName) {
  return hasProfessionGene(decodedGenes, professionName) ? 1 : 0;
}

/**
 * Batch decode multiple heroes
 * @param {Array} heroes - Array of hero objects from GraphQL
 * @returns {Array} - Array of decoded genetics
 */
export function decodeMultipleHeroes(heroes) {
  if (!Array.isArray(heroes)) {
    throw new Error('heroes must be an array');
  }
  
  return heroes.map(hero => {
    try {
      return decodeHeroGenes(hero);
    } catch (err) {
      console.error(`[HeroGenetics] Failed to decode hero ${hero.id}:`, err.message);
      return null;
    }
  }).filter(Boolean);
}

export default {
  decodeHeroGenes,
  hasProfessionGene,
  getProfessionGeneBonus,
  decodeMultipleHeroes
};
