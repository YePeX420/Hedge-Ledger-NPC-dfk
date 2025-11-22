/**
 * DeFi Kingdoms Hero Gene Decoder
 * 
 * Decodes the bit-packed statGenes and visualGenes into individual traits
 * with dominant (D) and recessive (R1, R2, R3) values.
 * 
 * Each hero has 24 genetic traits (12 stat + 12 visual), stored as two large integers.
 * Each trait consists of 4 genes (D, R1, R2, R3), each using 4 bits (0-15).
 * 
 * Format: [4 bits D][4 bits R1][4 bits R2][4 bits R3] = 16 bits per trait
 */

// ============================================================================
// TRAIT MAPPINGS
// ============================================================================

const CLASS_GENES = [
  'Warrior',      // 0
  'Knight',       // 1
  'Thief',        // 2
  'Archer',       // 3
  'Priest',       // 4
  'Wizard',       // 5
  'Monk',         // 6
  'Pirate',       // 7
  'Berserker',    // 8 (Advanced)
  'Paladin',      // 9 (Advanced)
  'DarkKnight',   // 10 (Advanced)
  'Summoner',     // 11 (Advanced)
  'Ninja',        // 12 (Advanced)
  'Shapeshifter', // 13 (Advanced)
  'Bard',         // 14 (Advanced)
  'Dragoon'       // 15 (Advanced)
];

const PROFESSION_GENES = [
  'Mining',    // 0
  'Gardening', // 1
  'Foraging',  // 2
  'Fishing',   // 3
  'Unknown4',  // 4
  'Unknown5',  // 5
  'Unknown6',  // 6
  'Unknown7',  // 7
  'Unknown8',  // 8
  'Unknown9',  // 9
  'Unknown10', // 10
  'Unknown11', // 11
  'Unknown12', // 12
  'Unknown13', // 13
  'Unknown14', // 14
  'Unknown15'  // 15
];

const PASSIVE_GENES = [
  'Basic1',   // 0
  'Basic2',   // 1
  'Basic3',   // 2
  'Basic4',   // 3
  'Basic5',   // 4
  'Basic6',   // 5
  'Basic7',   // 6
  'Basic8',   // 7
  'Advanced1', // 8
  'Advanced2', // 9
  'Advanced3', // 10
  'Advanced4', // 11
  'Elite1',    // 12
  'Elite2',    // 13
  'Exalted1',  // 14
  'Exalted2'   // 15
];

const ACTIVE_GENES = [
  'Basic1',   // 0
  'Basic2',   // 1
  'Basic3',   // 2
  'Basic4',   // 3
  'Basic5',   // 4
  'Basic6',   // 5
  'Basic7',   // 6
  'Basic8',   // 7
  'Advanced1', // 8
  'Advanced2', // 9
  'Advanced3', // 10
  'Advanced4', // 11
  'Elite1',    // 12
  'Elite2',    // 13
  'Exalted1',  // 14
  'Exalted2'   // 15
];

const STAT_BOOST_GENES = [
  'STR',  // 0
  'AGI',  // 1
  'INT',  // 2
  'WIS',  // 3
  'LCK',  // 4
  'VIT',  // 5
  'END',  // 6
  'DEX',  // 7
  'HP',   // 8
  'MP',   // 9
  'Unknown10', // 10
  'Unknown11', // 11
  'Unknown12', // 12
  'Unknown13', // 13
  'Unknown14', // 14
  'Unknown15'  // 15
];

const ELEMENT_GENES = [
  'Fire',     // 0
  'Water',    // 1
  'Earth',    // 2
  'Wind',     // 3
  'Lightning', // 4
  'Ice',      // 5
  'Light',    // 6
  'Dark',     // 7
  'Unknown8', // 8
  'Unknown9', // 9
  'Unknown10', // 10
  'Unknown11', // 11
  'Unknown12', // 12
  'Unknown13', // 13
  'Unknown14', // 14
  'Unknown15'  // 15
];

const GENDER_GENES = [
  'Male',    // 0
  'Female',  // 1
  'Unknown2', // 2
  'Unknown3', // 3
  'Unknown4', // 4
  'Unknown5', // 5
  'Unknown6', // 6
  'Unknown7', // 7
  'Unknown8', // 8
  'Unknown9', // 9
  'Unknown10', // 10
  'Unknown11', // 11
  'Unknown12', // 12
  'Unknown13', // 13
  'Unknown14', // 14
  'Unknown15'  // 15
];

// Visual genes use numeric values (skin colors, hair styles, etc.)
const NUMERIC_VISUAL = [
  'Value0', 'Value1', 'Value2', 'Value3', 'Value4', 'Value5', 'Value6', 'Value7',
  'Value8', 'Value9', 'Value10', 'Value11', 'Value12', 'Value13', 'Value14', 'Value15'
];

// ============================================================================
// STAT GENES TRAIT DEFINITIONS
// ============================================================================

const STAT_TRAITS = [
  { name: 'class', mapping: CLASS_GENES },
  { name: 'subClass', mapping: CLASS_GENES },
  { name: 'profession', mapping: PROFESSION_GENES },
  { name: 'passive1', mapping: PASSIVE_GENES },
  { name: 'passive2', mapping: PASSIVE_GENES },
  { name: 'active1', mapping: ACTIVE_GENES },
  { name: 'active2', mapping: ACTIVE_GENES },
  { name: 'statBoost1', mapping: STAT_BOOST_GENES },
  { name: 'statBoost2', mapping: STAT_BOOST_GENES },
  { name: 'statsUnknown1', mapping: NUMERIC_VISUAL },
  { name: 'element', mapping: ELEMENT_GENES },
  { name: 'statsUnknown2', mapping: NUMERIC_VISUAL }
];

// ============================================================================
// VISUAL GENES TRAIT DEFINITIONS
// ============================================================================

const VISUAL_TRAITS = [
  { name: 'gender', mapping: GENDER_GENES },
  { name: 'headAppendage', mapping: NUMERIC_VISUAL },
  { name: 'backAppendage', mapping: NUMERIC_VISUAL },
  { name: 'background', mapping: NUMERIC_VISUAL },
  { name: 'hairStyle', mapping: NUMERIC_VISUAL },
  { name: 'hairColor', mapping: NUMERIC_VISUAL },
  { name: 'visualUnknown1', mapping: NUMERIC_VISUAL },
  { name: 'eyeColor', mapping: NUMERIC_VISUAL },
  { name: 'skinColor', mapping: NUMERIC_VISUAL },
  { name: 'appendageColor', mapping: NUMERIC_VISUAL },
  { name: 'backAppendageColor', mapping: NUMERIC_VISUAL },
  { name: 'visualUnknown2', mapping: NUMERIC_VISUAL }
];

// ============================================================================
// DECODING FUNCTIONS
// ============================================================================

/**
 * Extracts a single gene (4 bits) from a genes integer
 * @param {string|BigInt} genesStr - The genes as a string or BigInt
 * @param {number} bitOffset - The bit offset to extract from
 * @returns {number} Gene value (0-15)
 */
function extractGene(genesStr, bitOffset) {
  const genesBigInt = typeof genesStr === 'string' ? BigInt(genesStr) : genesStr;
  const shifted = genesBigInt >> BigInt(bitOffset);
  const masked = shifted & BigInt(0xF);
  return Number(masked);
}

/**
 * Decodes a single trait (4 genes: D, R1, R2, R3) from genes integer
 * @param {string|BigInt} genesStr - The genes as a string or BigInt
 * @param {number} traitIndex - Which trait to decode (0-11)
 * @returns {Object} { d, r1, r2, r3 } with numeric gene values
 */
function decodeTrait(genesStr, traitIndex) {
  const baseOffset = traitIndex * 16;
  
  return {
    d: extractGene(genesStr, baseOffset),
    r1: extractGene(genesStr, baseOffset + 4),
    r2: extractGene(genesStr, baseOffset + 8),
    r3: extractGene(genesStr, baseOffset + 12)
  };
}

/**
 * Decodes all stat genes from statGenes integer
 * @param {string|BigInt} statGenes - The statGenes value
 * @returns {Object} Decoded stat traits with gene names
 */
function decodeStatGenes(statGenes) {
  const decoded = {};
  
  STAT_TRAITS.forEach((trait, index) => {
    const genes = decodeTrait(statGenes, index);
    const mapping = trait.mapping;
    
    decoded[trait.name] = {
      d: { value: genes.d, name: mapping[genes.d] },
      r1: { value: genes.r1, name: mapping[genes.r1] },
      r2: { value: genes.r2, name: mapping[genes.r2] },
      r3: { value: genes.r3, name: mapping[genes.r3] }
    };
  });
  
  return decoded;
}

/**
 * Decodes all visual genes from visualGenes integer
 * @param {string|BigInt} visualGenes - The visualGenes value
 * @returns {Object} Decoded visual traits with gene names
 */
function decodeVisualGenes(visualGenes) {
  const decoded = {};
  
  VISUAL_TRAITS.forEach((trait, index) => {
    const genes = decodeTrait(visualGenes, index);
    const mapping = trait.mapping;
    
    decoded[trait.name] = {
      d: { value: genes.d, name: mapping[genes.d] },
      r1: { value: genes.r1, name: mapping[genes.r1] },
      r2: { value: genes.r2, name: mapping[genes.r2] },
      r3: { value: genes.r3, name: mapping[genes.r3] }
    };
  });
  
  return decoded;
}

/**
 * Decodes both statGenes and visualGenes
 * @param {string|BigInt} statGenes - The statGenes value
 * @param {string|BigInt} visualGenes - The visualGenes value
 * @returns {Object} { statTraits, visualTraits }
 */
function decodeGenes(statGenes, visualGenes) {
  return {
    statTraits: decodeStatGenes(statGenes),
    visualTraits: decodeVisualGenes(visualGenes)
  };
}

/**
 * Checks if a hero has a gardening profession gene (in any position)
 * Used for garden optimization bonus detection
 * @param {Object} statTraits - Decoded stat traits
 * @returns {boolean} True if gardening gene exists in D/R1/R2/R3
 */
function hasGardeningGene(statTraits) {
  const profGenes = statTraits.profession;
  return (
    profGenes.d.name === 'Gardening' ||
    profGenes.r1.name === 'Gardening' ||
    profGenes.r2.name === 'Gardening' ||
    profGenes.r3.name === 'Gardening'
  );
}

/**
 * Gets the dominant profession name
 * @param {Object} statTraits - Decoded stat traits
 * @returns {string} Profession name
 */
function getDominantProfession(statTraits) {
  return statTraits.profession.d.name;
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  decodeGenes,
  decodeStatGenes,
  decodeVisualGenes,
  hasGardeningGene,
  getDominantProfession,
  
  // Export mappings for reference
  CLASS_GENES,
  PROFESSION_GENES,
  STAT_TRAITS,
  VISUAL_TRAITS
};
