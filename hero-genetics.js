/**
 * DeFi Kingdoms Hero Genetics System
 * Decodes raw statGenes and visualGenes into full dominant + recessive traits
 */

const { 
  decodeGenes, 
  hasGardeningGene, 
  getDominantProfession 
} = require('./gene-decoder.js');

/**
 * Decode hero genes from GraphQL hero object
 * Now uses raw statGenes and visualGenes fields for full D/R1/R2/R3 decoding
 * 
 * @param {Object} hero - Hero object from GraphQL with statGenes and visualGenes
 * @returns {Object} Decoded genetics with full recessive data
 */
function decodeHeroGenes(hero) {
  if (!hero) {
    throw new Error('Hero object is required');
  }

  // Check if we have raw gene data
  if (!hero.statGenes || !hero.visualGenes) {
    // Fallback to dominant-only if raw genes not available
    return {
      id: hero.id,
      normalizedId: hero.normalizedId || hero.id,
      realm: hero.network || hero.originRealm || 'unknown',
      
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
      
      _note: 'Raw gene data not available - showing dominant traits only'
    };
  }

  // Decode full genetics from raw gene data
  const { statTraits, visualTraits } = decodeGenes(hero.statGenes, hero.visualGenes);
  
  // Convert to legacy format for compatibility
  return {
    id: hero.id,
    normalizedId: hero.normalizedId || hero.id,
    realm: hero.network || hero.originRealm || 'unknown',
    
    // Stat traits with full D/R1/R2/R3
    mainClass: {
      dominant: statTraits.class.d.name,
      R1: statTraits.class.r1.name,
      R2: statTraits.class.r2.name,
      R3: statTraits.class.r3.name
    },
    subClass: {
      dominant: statTraits.subClass.d.name,
      R1: statTraits.subClass.r1.name,
      R2: statTraits.subClass.r2.name,
      R3: statTraits.subClass.r3.name
    },
    profession: {
      dominant: statTraits.profession.d.name,
      R1: statTraits.profession.r1.name,
      R2: statTraits.profession.r2.name,
      R3: statTraits.profession.r3.name
    },
    passive1: {
      dominant: statTraits.passive1.d.name,
      R1: statTraits.passive1.r1.name,
      R2: statTraits.passive1.r2.name,
      R3: statTraits.passive1.r3.name
    },
    passive2: {
      dominant: statTraits.passive2.d.name,
      R1: statTraits.passive2.r1.name,
      R2: statTraits.passive2.r2.name,
      R3: statTraits.passive2.r3.name
    },
    active1: {
      dominant: statTraits.active1.d.name,
      R1: statTraits.active1.r1.name,
      R2: statTraits.active1.r2.name,
      R3: statTraits.active1.r3.name
    },
    active2: {
      dominant: statTraits.active2.d.name,
      R1: statTraits.active2.r1.name,
      R2: statTraits.active2.r2.name,
      R3: statTraits.active2.r3.name
    },
    statBoost1: {
      dominant: statTraits.statBoost1.d.name,
      R1: statTraits.statBoost1.r1.name,
      R2: statTraits.statBoost1.r2.name,
      R3: statTraits.statBoost1.r3.name
    },
    statBoost2: {
      dominant: statTraits.statBoost2.d.name,
      R1: statTraits.statBoost2.r1.name,
      R2: statTraits.statBoost2.r2.name,
      R3: statTraits.statBoost2.r3.name
    },
    element: {
      dominant: statTraits.element.d.name,
      R1: statTraits.element.r1.name,
      R2: statTraits.element.r2.name,
      R3: statTraits.element.r3.name
    },
    
    // Visual traits
    visual: {
      gender: {
        dominant: visualTraits.gender.d.name,
        R1: visualTraits.gender.r1.name,
        R2: visualTraits.gender.r2.name,
        R3: visualTraits.gender.r3.name
      },
      background: {
        dominant: visualTraits.background.d.name,
        R1: visualTraits.background.r1.name,
        R2: visualTraits.background.r2.name,
        R3: visualTraits.background.r3.name
      },
      hairStyle: {
        dominant: visualTraits.hairStyle.d.name,
        R1: visualTraits.hairStyle.r1.name,
        R2: visualTraits.hairStyle.r2.name,
        R3: visualTraits.hairStyle.r3.name
      },
      hairColor: {
        dominant: visualTraits.hairColor.d.name,
        R1: visualTraits.hairColor.r1.name,
        R2: visualTraits.hairColor.r2.name,
        R3: visualTraits.hairColor.r3.name
      },
      eyeColor: {
        dominant: visualTraits.eyeColor.d.name,
        R1: visualTraits.eyeColor.r1.name,
        R2: visualTraits.eyeColor.r2.name,
        R3: visualTraits.eyeColor.r3.name
      },
      skinColor: {
        dominant: visualTraits.skinColor.d.name,
        R1: visualTraits.skinColor.r1.name,
        R2: visualTraits.skinColor.r2.name,
        R3: visualTraits.skinColor.r3.name
      }
    },
    
    // Raw stat and visual traits for advanced use
    _rawStatTraits: statTraits,
    _rawVisualTraits: visualTraits
  };
}

/**
 * Check if a hero has a specific profession gene (any position: D/R1/R2/R3)
 * Used for garden optimization bonus detection
 * 
 * @param {Object} decodedGenes - Output from decodeHeroGenes()
 * @param {string} professionName - e.g. 'Gardening', 'Mining', 'Fishing'
 * @returns {boolean} True if hero has the profession gene in any position
 */
function hasProfessionGene(decodedGenes, professionName) {
  if (!decodedGenes || !decodedGenes.profession) return false;
  
  const prof = decodedGenes.profession;
  return prof.dominant === professionName ||
         prof.R1 === professionName ||
         prof.R2 === professionName ||
         prof.R3 === professionName;
}

/**
 * Get profession gene bonus (1 if has gene, 0 otherwise)
 * Matches DFK garden formula: geneBonus = 1 if gardening gene exists, else 0
 * 
 * @param {Object} decodedGenes - Output from decodeHeroGenes()
 * @param {string} professionName - e.g. 'Gardening'
 * @returns {number} 1 or 0
 */
function getProfessionGeneBonus(decodedGenes, professionName) {
  return hasProfessionGene(decodedGenes, professionName) ? 1 : 0;
}

/**
 * Batch decode multiple heroes
 * 
 * @param {Array} heroes - Array of hero objects from GraphQL
 * @returns {Array} Array of decoded genetics
 */
function decodeMultipleHeroes(heroes) {
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

module.exports = {
  decodeHeroGenes,
  hasProfessionGene,
  getProfessionGeneBonus,
  decodeMultipleHeroes
};
