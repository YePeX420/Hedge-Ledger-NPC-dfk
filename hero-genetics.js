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
 * NOTE: DFK GraphQL API doesn't expose raw gene data (genes/visualGenes/statGenes fields don't exist)
 * We use the already-decoded string fields and mark recessives as Unknown
 * 
 * @param {Object} hero - Hero object from GraphQL
 * @returns {Object} - Decoded genetics with dominant + R1/R2/R3 (recessives Unknown without raw data)
 */
export function decodeHeroGenes(hero) {
  if (!hero) {
    throw new Error('Hero object is required');
  }

  // DFK GraphQL API provides decoded dominant traits as strings
  // Raw gene data is not exposed, so we can't decode recessives
  // advancedGenes/eliteGenes/exaltedGenes are structured objects, not raw hex
  
  const decoded = {
    id: hero.id,
    normalizedId: hero.normalizedId || hero.id,
    realm: hero.network || hero.originRealm || 'unknown',
    
    // Use provided string fields for dominant, mark recessives as Unknown
    mainClass: {
      dominant: hero.mainClassStr || 'Unknown',
      R1: 'Unknown',
      R2: 'Unknown',
      R3: 'Unknown'
    },
    subClass: {
      dominant: hero.subClassStr || 'Unknown',
      R1: 'Unknown',
      R2: 'Unknown',
      R3: 'Unknown'
    },
    profession: {
      dominant: hero.professionStr || 'Unknown',
      R1: 'Unknown',
      R2: 'Unknown',
      R3: 'Unknown'
    },
    element: {
      dominant: 'Unknown', // Not exposed in basic hero query
      R1: 'Unknown',
      R2: 'Unknown',
      R3: 'Unknown'
    },
    
    // Stats - we don't have growth type data without raw genes
    stats: {
      strength: { dominant: 'Unknown', R1: 'Unknown', R2: 'Unknown', R3: 'Unknown' },
      intelligence: { dominant: 'Unknown', R1: 'Unknown', R2: 'Unknown', R3: 'Unknown' },
      wisdom: { dominant: 'Unknown', R1: 'Unknown', R2: 'Unknown', R3: 'Unknown' },
      luck: { dominant: 'Unknown', R1: 'Unknown', R2: 'Unknown', R3: 'Unknown' },
      agility: { dominant: 'Unknown', R1: 'Unknown', R2: 'Unknown', R3: 'Unknown' },
      vitality: { dominant: 'Unknown', R1: 'Unknown', R2: 'Unknown', R3: 'Unknown' },
      endurance: { dominant: 'Unknown', R1: 'Unknown', R2: 'Unknown', R3: 'Unknown' },
      dexterity: { dominant: 'Unknown', R1: 'Unknown', R2: 'Unknown', R3: 'Unknown' }
    },
    
    // Visual traits
    visual: {
      background: { dominant: 'Unknown', R1: 'Unknown', R2: 'Unknown', R3: 'Unknown' }
    },
    
    // Note about limitations
    _note: 'Recessive genes (R1/R2/R3) are Unknown - DFK GraphQL API does not expose raw gene data'
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
