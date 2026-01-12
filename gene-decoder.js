/**
 * DeFi Kingdoms Hero Gene Decoder
 * 
 * Decodes statGenes and visualGenes into individual traits
 * with dominant (D) and recessive (R1, R2, R3) values.
 * 
 * Each hero has 24 genetic traits (12 stat + 12 visual), stored as two large integers.
 * Each trait consists of 4 genes (D, R1, R2, R3).
 * 
 * Encoding: Both statGenes and visualGenes use Kai (base-32) encoding.
 * The alphabet is '123456789abcdefghijkmnopqrstuvwx' (32 characters).
 * Each BigInt converts to a 48-character Kai string (12 traits × 4 genes).
 * Gene order in Kai string: R3, R2, R1, D (right to left: most recent to dominant)
 */

// ============================================================================
// TRAIT MAPPINGS
// ============================================================================

// Official gene-to-class mapping from degenking library
// Note: There are gaps in the mapping (12-15, 22-23, 27, 29-31 undefined)
const CLASS_GENES = [
  'Warrior',       // 0
  'Knight',        // 1
  'Thief',         // 2
  'Archer',        // 3
  'Priest',        // 4
  'Wizard',        // 5
  'Monk',          // 6
  'Pirate',        // 7
  'Berserker',     // 8
  'Seer',          // 9
  'Legionnaire',   // 10
  'Scholar',       // 11
  'Unknown12',     // 12 - Undefined in official mapping
  'Unknown13',     // 13 - Undefined in official mapping
  'Unknown14',     // 14 - Undefined in official mapping
  'Unknown15',     // 15 - Undefined in official mapping
  'Paladin',       // 16
  'DarkKnight',    // 17
  'Summoner',      // 18
  'Ninja',         // 19
  'Shapeshifter',  // 20
  'Bard',          // 21
  'Unknown22',     // 22 - Undefined in official mapping
  'Unknown23',     // 23 - Undefined in official mapping
  'Dragoon',       // 24
  'Sage',          // 25
  'Spellbow',      // 26
  'Unknown27',     // 27 - Undefined in official mapping
  'DreadKnight',   // 28
  'Unknown29',     // 29 - Undefined in official mapping
  'Unknown30',     // 30 - Undefined in official mapping
  'Unknown31'      // 31 (max Kai value)
];

// Official gene-to-profession mapping from degenking library
// Note: Uses even-spaced values (0, 2, 4, 6) like some visual traits
const PROFESSION_GENES = [
  'Mining',      // 0
  'Unknown1',    // 1 - Undefined in official mapping
  'Gardening',   // 2
  'Unknown3',    // 3 - Undefined in official mapping
  'Fishing',     // 4
  'Unknown5',    // 5 - Undefined in official mapping
  'Foraging',    // 6
  'Unknown7',    // 7
  'Unknown8',    // 8
  'Unknown9',    // 9
  'Unknown10',   // 10
  'Unknown11',   // 11
  'Unknown12',   // 12
  'Unknown13',   // 13
  'Unknown14',   // 14
  'Unknown15',   // 15
  'Unknown16',   // 16
  'Unknown17',   // 17
  'Unknown18',   // 18
  'Unknown19',   // 19
  'Unknown20',   // 20
  'Unknown21',   // 21
  'Unknown22',   // 22
  'Unknown23',   // 23
  'Unknown24',   // 24
  'Unknown25',   // 25
  'Unknown26',   // 26
  'Unknown27',   // 27
  'Unknown28',   // 28
  'Unknown29',   // 29
  'Unknown30',   // 30
  'Unknown31'    // 31 (max Kai value)
];

// Passive skill genes - SPARSE MAPPING matching degenking library
// Basic: 0-7, Advanced: 16-19, Elite: 24-25, Exalted: 28
const PASSIVE_GENES = {
  0: 'Duelist',       // Basic1: +2.5% Block/Spell Block, +20% damage 1v1
  1: 'Clutch',        // Basic2: +20% damage when below 25% HP
  2: 'Foresight',     // Basic3: +3% Evasion
  3: 'Headstrong',    // Basic4: +32.5% Daze resistance, +2.5% Status Effect Resistance
  4: 'Clear Vision',  // Basic5: +32.5% Blind resistance, +2.5% Status Effect Resistance
  5: 'Fearless',      // Basic6: +32.5% Fear resistance, +2.5% Status Effect Resistance
  6: 'Chatterbox',    // Basic7: +32.5% Silence resistance, +2.5% Status Effect Resistance
  7: 'Stalwart',      // Basic8: +32.5% Poison resistance, +2.5% Status Effect Resistance
  16: 'Leadership',   // Advanced1: Allies deal +5% damage (max 15%)
  17: 'Efficient',    // Advanced2: -10% Mana consumption
  18: 'Intimidation', // Advanced3: Enemies deal -5% damage (max 15%)
  19: 'Toxic',        // Advanced4: 3% chance to apply Poison per hit
  24: 'Giant Slayer', // Elite1: +10%/+20% damage vs higher HP targets
  25: 'Last Stand',   // Elite2: Survive with 10% HP once per battle
  28: 'Second Life',  // Exalted1: Revive with 35% HP once per battle
};

// Active skill genes - SPARSE MAPPING matching degenking library
// Basic: 0-7, Advanced: 16-19, Elite: 24-25, Exalted: 28
const ACTIVE_GENES = {
  0: 'Poisoned Blade',  // Basic1: Deal 1.0*POWER damage, 80% Poison
  1: 'Blinding Winds',  // Basic2: Deal 1.0*POWER damage, 80% Blind
  2: 'Heal',            // Basic3: Heal 35% max HP
  3: 'Cleanse',         // Basic4: Cleanse target, 50% double cleanse
  4: 'Iron Skin',       // Basic5: -15% Physical damage for 80 ticks
  5: 'Speed',           // Basic6: +20% Haste for 30 ticks, +500 Initiative
  6: 'Critical Aim',    // Basic7: Deal 1.0*POWER damage, +35% CSC this attack, +20% CSC for 2 turns
  7: 'Deathmark',       // Basic8: Deal 1.2*POWER damage, 80% +15% damage taken for 40 ticks
  16: 'Exhaust',        // Advanced1: Deal 1.2*POWER damage, 50% Exhaust
  17: 'Daze',           // Advanced2: Deal 1.2*POWER damage, 70% Daze
  18: 'Explosion',      // Advanced3: Channel, Deal 1.5*POWER AOE, 75% Pierce
  19: 'Hardened Shield',// Advanced4: -30% damage taken for 40 ticks
  24: 'Stun',           // Elite1: Deal 1.4*POWER damage, 70% Stun
  25: 'Second Wind',    // Elite2: Restore 50% missing HP, allies heal 50% of that
  28: 'Resurrection',   // Exalted1: Revive ally with 35% HP
};

// Official gene-to-stat boost mapping from degenking library
// Note: Uses even-spaced values (0, 2, 4, 6, 8, 10, 12, 14)
const STAT_BOOST_GENES = [
  'STR',       // 0 - Strength
  'Unknown1',  // 1 - Undefined
  'AGI',       // 2 - Agility
  'Unknown3',  // 3 - Undefined
  'INT',       // 4 - Intelligence
  'Unknown5',  // 5 - Undefined
  'WIS',       // 6 - Wisdom
  'Unknown7',  // 7 - Undefined
  'LCK',       // 8 - Luck
  'Unknown9',  // 9 - Undefined
  'VIT',       // 10 - Vitality
  'Unknown11', // 11 - Undefined
  'END',       // 12 - Endurance
  'Unknown13', // 13 - Undefined
  'DEX',       // 14 - Dexterity
  'Unknown15', // 15 - Undefined
  'Unknown16', // 16
  'Unknown17', // 17
  'Unknown18', // 18
  'Unknown19', // 19
  'Unknown20', // 20
  'Unknown21', // 21
  'Unknown22', // 22
  'Unknown23', // 23
  'Unknown24', // 24
  'Unknown25', // 25
  'Unknown26', // 26
  'Unknown27', // 27
  'Unknown28', // 28
  'Unknown29', // 29
  'Unknown30', // 30
  'Unknown31'  // 31 (max Kai value)
];

// Official gene-to-element mapping from degenking library
// Note: Uses even-spaced values (0, 2, 4, 6, 8, 10, 12, 14)
const ELEMENT_GENES = [
  'Fire',      // 0
  'Unknown1',  // 1 - Undefined
  'Water',     // 2
  'Unknown3',  // 3 - Undefined
  'Earth',     // 4
  'Unknown5',  // 5 - Undefined
  'Wind',      // 6
  'Unknown7',  // 7 - Undefined
  'Lightning', // 8
  'Unknown9',  // 9 - Undefined
  'Ice',       // 10
  'Unknown11', // 11 - Undefined
  'Light',     // 12
  'Unknown13', // 13 - Undefined
  'Dark',      // 14
  'Unknown15', // 15 - Undefined
  'Unknown16', // 16
  'Unknown17', // 17
  'Unknown18', // 18
  'Unknown19', // 19
  'Unknown20', // 20
  'Unknown21', // 21
  'Unknown22', // 22
  'Unknown23', // 23
  'Unknown24', // 24
  'Unknown25', // 25
  'Unknown26', // 26
  'Unknown27', // 27
  'Unknown28', // 28
  'Unknown29', // 29
  'Unknown30', // 30
  'Unknown31'  // 31 (max Kai value)
];

const GENDER_GENES = [
  'None',    // 0 - Unused (even numbers)
  'Male',    // 1
  'None',    // 2
  'Female',  // 3
  'None',    // 4
  'None',    // 5
  'None',    // 6
  'None',    // 7
  'None',    // 8
  'None',    // 9
  'None',    // 10
  'None',    // 11
  'None',    // 12
  'None',    // 13
  'None',    // 14
  'None'     // 15
];

// Crafting profession genes (revealed via Gene Reroll, formerly statsUnknown1/2)
// Uses EVEN gene values like profession genes: 0, 2, 4, 6, 8, 10, 12, 14
const CRAFTING_GENES = [
  'Blacksmithing',   // 0
  'Unknown1',        // 1 - not used
  'Goldsmithing',    // 2
  'Unknown3',        // 3 - not used
  'Armorsmithing',   // 4
  'Unknown5',        // 5 - not used
  'Woodworking',     // 6
  'Unknown7',        // 7 - not used
  'Leatherworking',  // 8
  'Unknown9',        // 9 - not used
  'Tailoring',       // 10
  'Unknown11',       // 11 - not used
  'Enchanting',      // 12
  'Unknown13',       // 13 - not used
  'Alchemy',         // 14
  'Unknown15'        // 15 - not used
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
  { name: 'crafting1', mapping: CRAFTING_GENES },
  { name: 'element', mapping: ELEMENT_GENES },
  { name: 'crafting2', mapping: CRAFTING_GENES }
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
 * Converts BigInt genes to Kai (base-32) representation
 * @param {BigInt} genes - The genes as BigInt
 * @returns {string} Kai representation (48 characters for 12 traits)
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
  
  if (genes > 0) {
    buf = ALPHABET[Number(genes)] + buf;
  }
  
  // Pad to 48 characters (12 traits × 4 genes)
  while (buf.length < 48) {
    buf = '1' + buf;
  }
  
  return buf;
}

/**
 * Converts Kai character to decimal value (0-31)
 * @param {string} kai - Single Kai character
 * @returns {number} Decimal value (0-31)
 */
function kai2dec(kai) {
  const ALPHABET = '123456789abcdefghijkmnopqrstuvwx';
  return ALPHABET.indexOf(kai);
}

/**
 * Decodes all stat genes from statGenes integer using Kai encoding
 * @param {string|BigInt} statGenes - The statGenes value
 * @returns {Object} Decoded stat traits with gene names
 */
function decodeStatGenes(statGenes) {
  const genesBigInt = typeof statGenes === 'string' ? BigInt(statGenes) : statGenes;
  const kaiString = genesToKai(genesBigInt);
  
  const decoded = {};
  
  // Process 48 Kai characters (12 traits × 4 genes each)
  for (let traitIndex = 0; traitIndex < STAT_TRAITS.length; traitIndex++) {
    const trait = STAT_TRAITS[traitIndex];
    const startIdx = traitIndex * 4;
    
    // Extract 4 Kai characters for this trait (R3, R2, R1, D order in Kai string)
    const r3Val = kai2dec(kaiString[startIdx]);
    const r2Val = kai2dec(kaiString[startIdx + 1]);
    const r1Val = kai2dec(kaiString[startIdx + 2]);
    const dVal = kai2dec(kaiString[startIdx + 3]);
    
    const mapping = trait.mapping;
    
    // For sparse object mappings (ACTIVE_GENES, PASSIVE_GENES), directly use
    // the raw Kai value as key. These use sparse indices: 0-7 (basic), 
    // 16-19 (advanced), 24-25 (elite), 28 (exalted).
    // For array mappings (CLASS_GENES, etc.), direct index access works.
    const isArrayMapping = Array.isArray(mapping);
    const lookupValue = (val) => {
      if (isArrayMapping) {
        return mapping[val] || `Unknown${val}`;
      } else {
        return mapping[val] || `Unknown${val}`;
      }
    };
    
    decoded[trait.name] = {
      d: { value: dVal, name: lookupValue(dVal) },
      r1: { value: r1Val, name: lookupValue(r1Val) },
      r2: { value: r2Val, name: lookupValue(r2Val) },
      r3: { value: r3Val, name: lookupValue(r3Val) }
    };
  }
  
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

export {
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

export default {
  decodeGenes,
  decodeStatGenes,
  decodeVisualGenes,
  hasGardeningGene,
  getDominantProfession,
  CLASS_GENES,
  PROFESSION_GENES,
  STAT_TRAITS,
  VISUAL_TRAITS
};
