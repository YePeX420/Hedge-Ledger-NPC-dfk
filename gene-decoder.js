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
  'Berserker',    // 8
  'Seer',         // 9
  'Legionnaire',  // 10
  'Scholar',      // 11
  'Paladin',      // 12
  'DarkKnight',   // 13
  'Summoner',     // 14
  'Ninja'         // 15
];

const PROFESSION_GENES = [
  'Mining',         // 0
  'Gardening',      // 1
  'Foraging',       // 2
  'Fishing',        // 3
  'Alchemy',        // 4 - Crafting: INT + WIS + Fire
  'Weaponsmithing', // 5 - Crafting: STR + DEX + Fire
  'Armorsmithing',  // 6 - Crafting: STR + END + Earth
  'Jewelcrafting',  // 7 - Crafting: DEX + LCK + Light
  'Tailoring',      // 8 - Crafting: DEX + AGI + Wind
  'Leatherworking', // 9 - Crafting: AGI + VIT + Earth
  'Woodworking',    // 10 - Crafting: STR + AGI + Earth
  'Enchanting',     // 11 - Crafting: INT + LCK + Dark
  'None',           // 12
  'None',           // 13
  'None',           // 14
  'None'            // 15
];

const PASSIVE_GENES = [
  'Duelist',      // 0 - Basic1: +2.5% Block/Spell Block, +20% damage 1v1
  'Clutch',       // 1 - Basic2: +20% damage when below 25% HP
  'Foresight',    // 2 - Basic3: +3% Evasion
  'Headstrong',   // 3 - Basic4: +32.5% Daze resistance, +2.5% Status Effect Resistance
  'Clear Vision', // 4 - Basic5: +32.5% Blind resistance, +2.5% Status Effect Resistance
  'Fearless',     // 5 - Basic6: +32.5% Fear resistance, +2.5% Status Effect Resistance
  'Chatterbox',   // 6 - Basic7: +32.5% Silence resistance, +2.5% Status Effect Resistance
  'Stalwart',     // 7 - Basic8: +32.5% Poison resistance, +2.5% Status Effect Resistance
  'Leadership',   // 8 - Advanced1: Allies deal +5% damage (max 15%)
  'Efficient',    // 9 - Advanced2: -10% Mana consumption
  'Menacing',     // 10 - Advanced3: Enemies deal -5% damage (max 15%)
  'Toxic',        // 11 - Advanced4: 3% chance to apply Poison per hit
  'Giant Slayer', // 12 - Elite1: +10%/+20% damage vs higher HP targets
  'Last Stand',   // 13 - Elite2: Survive with 10% HP once per battle
  'Second Life',  // 14 - Exalted1: Revive with 35% HP once per battle
  'Unknown15'     // 15 - Placeholder
];

const ACTIVE_GENES = [
  'Poisoned Blade',  // 0 - Basic1: Deal 1.0*POWER damage, 80% Poison
  'Blinding Winds',  // 1 - Basic2: Deal 1.0*POWER damage, 80% Blind
  'Heal',            // 2 - Basic3: Heal 35% max HP
  'Cleanse',         // 3 - Basic4: Cleanse target, 50% double cleanse
  'Iron Skin',       // 4 - Basic5: -15% Physical damage for 80 ticks
  'Speed',           // 5 - Basic6: +20% Haste for 30 ticks, +500 Initiative
  'Critical Aim',    // 6 - Basic7: Deal 1.0*POWER damage, +35% CSC this attack, +20% CSC for 2 turns
  'Deathmark',       // 7 - Basic8: Deal 1.2*POWER damage, 80% +15% damage taken for 40 ticks
  'Exhaust',         // 8 - Advanced1: Deal 1.2*POWER damage, 50% Exhaust
  'Daze',            // 9 - Advanced2: Deal 1.2*POWER damage, 70% Daze
  'Explosion',       // 10 - Advanced3: Channel, Deal 1.5*POWER AOE, 75% Pierce
  'Hardened Shield', // 11 - Advanced4: -30% damage taken for 40 ticks
  'Stun',            // 12 - Elite1: Deal 1.4*POWER damage, 70% Stun
  'Second Wind',     // 13 - Elite2: Restore 50% missing HP, allies heal 50% of that
  'Resurrection',    // 14 - Exalted1: Revive ally with 35% HP
  'Unknown15'        // 15 - Placeholder
];

const STAT_BOOST_GENES = [
  'STR',  // 0 - Strength
  'AGI',  // 1 - Agility
  'INT',  // 2 - Intelligence
  'WIS',  // 3 - Wisdom
  'LCK',  // 4 - Luck
  'VIT',  // 5 - Vitality
  'END',  // 6 - Endurance
  'DEX',  // 7 - Dexterity
  'HP',   // 8 - HP
  'MP',   // 9 - MP
  'Unknown10', // 10
  'Unknown11', // 11
  'Unknown12', // 12
  'Unknown13', // 13
  'Unknown14', // 14
  'Unknown15'  // 15
];

const ELEMENT_GENES = [
  'Fire',      // 0
  'None',      // 1 - Unused (odd numbers)
  'Water',     // 2
  'None',      // 3
  'Earth',     // 4
  'None',      // 5
  'Wind',      // 6
  'None',      // 7
  'Lightning', // 8
  'None',      // 9
  'Ice',       // 10
  'None',      // 11
  'Light',     // 12
  'None',      // 13
  'Dark',      // 14
  'None'       // 15
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
