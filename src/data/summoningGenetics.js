// DFK Summoning Genetics Data and Calculation Module
// Based on official DFK documentation and community research

// Gene inheritance probabilities (for each parent)
export const GENE_PROBABILITIES = {
  D: 0.75,    // Dominant gene: 75%
  R1: 0.1875, // Recessive 1: 18.75%
  R2: 0.055,  // Recessive 2: 5.5%
  R3: 0.0075  // Recessive 3: 0.75%
};

// Class IDs and names
export const CLASSES = {
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
  16: 'Paladin',
  17: 'DarkKnight',
  18: 'Summoner',
  19: 'Ninja',
  20: 'Shapeshifter',
  21: 'Bard',
  24: 'Dragoon',
  25: 'Sage',
  26: 'Spellbow',
  28: 'DreadKnight'
};

export const CLASS_ID_BY_NAME = Object.fromEntries(
  Object.entries(CLASSES).map(([id, name]) => [name.toLowerCase(), parseInt(id)])
);

// Basic classes (0-11) and Advanced/Elite/Exalted classes
export const BASIC_CLASSES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
export const ADVANCED_CLASSES = [16, 17, 18, 19, 20, 21];
export const ELITE_CLASSES = [24, 25, 26];
export const EXALTED_CLASSES = [28];

// Class mutation combinations (which basic classes combine to form advanced)
export const CLASS_MUTATIONS = {
  // Advanced classes (from 2 basic classes)
  16: { name: 'Paladin', requires: [0, 1] },      // Warrior + Knight
  17: { name: 'DarkKnight', requires: [0, 4] },   // Warrior + Priest
  18: { name: 'Summoner', requires: [4, 5] },     // Priest + Wizard
  19: { name: 'Ninja', requires: [2, 6] },        // Thief + Monk  -> Also Pirate + Monk
  20: { name: 'Shapeshifter', requires: [6, 9] }, // Monk + Seer
  21: { name: 'Bard', requires: [3, 7] },         // Archer + Pirate
  // Elite classes (from basic + advanced)
  24: { name: 'Dragoon', requires: [1, 16] },     // Knight + Paladin
  25: { name: 'Sage', requires: [5, 18] },        // Wizard + Summoner
  26: { name: 'Spellbow', requires: [3, 18] },    // Archer + Summoner
  // Exalted
  28: { name: 'DreadKnight', requires: [16, 17] } // Paladin + DarkKnight
};

// Alternative mutation paths (some classes have multiple combos)
export const ALTERNATIVE_MUTATIONS = {
  19: [
    { requires: [2, 6] },  // Thief + Monk
    { requires: [7, 6] }   // Pirate + Monk
  ]
};

// Professions
export const PROFESSIONS = {
  0: 'Mining',
  2: 'Gardening',
  4: 'Fishing',
  6: 'Foraging'
};

export const PROFESSION_ID_BY_NAME = {
  'mining': 0,
  'gardening': 2,
  'fishing': 4,
  'foraging': 6
};

// Stats
export const STATS = {
  0: 'Strength',
  2: 'Agility',
  4: 'Intelligence',
  6: 'Wisdom',
  8: 'Luck',
  10: 'Vitality',
  12: 'Endurance',
  14: 'Dexterity'
};

export const STAT_ID_BY_NAME = {
  'strength': 0,
  'agility': 2,
  'intelligence': 4,
  'wisdom': 6,
  'luck': 8,
  'vitality': 10,
  'endurance': 12,
  'dexterity': 14
};

// Elements
export const ELEMENTS = {
  0: 'Fire',
  2: 'Water',
  4: 'Earth',
  6: 'Wind',
  8: 'Lightning',
  10: 'Ice',
  12: 'Light',
  14: 'Dark'
};

// Rarity levels
export const RARITIES = {
  0: 'Common',
  1: 'Uncommon',
  2: 'Rare',
  3: 'Legendary',
  4: 'Mythic'
};

// Rarity bonuses for offspring probability calculation
// Based on DFK summoning formula
export const RARITY_BASE_CHANCES = {
  0: { common: 0.9997, uncommon: 0.0003, rare: 0, legendary: 0, mythic: 0 },
  1: { common: 0.7200, uncommon: 0.2797, rare: 0.0003, legendary: 0, mythic: 0 },
  2: { common: 0.4915, uncommon: 0.2975, rare: 0.2097, legendary: 0.0013, mythic: 0 },
  3: { common: 0.2500, uncommon: 0.3000, rare: 0.3000, legendary: 0.1497, mythic: 0.0003 },
  4: { common: 0.1000, uncommon: 0.2000, rare: 0.3000, legendary: 0.3000, mythic: 0.1000 }
};

// Ability tiers
export const ABILITY_TIERS = {
  BASIC: 'B',
  ADVANCED: 'A',
  ELITE: 'E',
  EXALTED: 'X',
  TRANSCENDENT: 'T'
};

// Active abilities (0-14 basic, 15+ advanced/elite)
export const ACTIVE_ABILITIES = {
  0: { name: 'Poisoned Blade', tier: 'B', slot: 1 },
  1: { name: 'Blinding Winds', tier: 'B', slot: 2 },
  2: { name: 'Heal', tier: 'B', slot: 3 },
  3: { name: 'Cleanse', tier: 'B', slot: 4 },
  4: { name: 'Iron Skin', tier: 'B', slot: 5 },
  5: { name: 'Speed', tier: 'B', slot: 6 },
  6: { name: 'Slash', tier: 'B', slot: 7 },
  7: { name: 'Bash', tier: 'B', slot: 8 },
  8: { name: 'Daze', tier: 'A', slot: 2 },
  9: { name: 'Exhaust', tier: 'A', slot: 1 },
  10: { name: 'Explosion', tier: 'A', slot: 3 },
  11: { name: 'Barrier', tier: 'A', slot: 4 },
  12: { name: 'Curse', tier: 'E', slot: 1 },
  13: { name: 'Doom', tier: 'E', slot: 2 },
  14: { name: 'Transcendence', tier: 'X', slot: 1 }
};

// Passive abilities (16-29 basic, 30+ advanced/elite)
export const PASSIVE_ABILITIES = {
  16: { name: 'Duelist', tier: 'B', slot: 1 },
  17: { name: 'Clutch', tier: 'B', slot: 2 },
  18: { name: 'Foresight', tier: 'B', slot: 3 },
  19: { name: 'Headstrong', tier: 'B', slot: 4 },
  20: { name: 'Fortitude', tier: 'B', slot: 5 },
  21: { name: 'Fearless', tier: 'B', slot: 6 },
  22: { name: 'Chatterbox', tier: 'B', slot: 7 },
  23: { name: 'Steadfast', tier: 'B', slot: 8 },
  24: { name: 'Leadership', tier: 'A', slot: 1 },
  25: { name: 'Efficient', tier: 'A', slot: 2 },
  26: { name: 'Cunning', tier: 'A', slot: 3 },
  27: { name: 'Resilient', tier: 'A', slot: 4 },
  28: { name: 'Unbreakable', tier: 'E', slot: 1 },
  29: { name: 'Apex Predator', tier: 'E', slot: 2 }
};

// Mutation chance for abilities (basic -> advanced tier)
export const ABILITY_MUTATION_CHANCE = 0.02; // 2% base chance

// Calculate rarity probability based on both parents
export function calculateRarityProbabilities(parent1Rarity, parent2Rarity) {
  // Average the parent rarities and apply bonus
  const avgRarity = (parent1Rarity + parent2Rarity) / 2;
  const bonusRarity = Math.min(4, Math.floor(avgRarity));
  
  // Base probabilities adjusted by parent rarity
  const baseProbs = { ...RARITY_BASE_CHANCES[bonusRarity] };
  
  // Shift probabilities up based on combined rarity
  const rarityBoost = avgRarity * 0.05; // 5% boost per average rarity level
  
  let probs = {
    common: Math.max(0, baseProbs.common - rarityBoost * 2),
    uncommon: baseProbs.uncommon + rarityBoost * 0.5,
    rare: baseProbs.rare + rarityBoost * 0.8,
    legendary: baseProbs.legendary + rarityBoost * 0.5,
    mythic: baseProbs.mythic + rarityBoost * 0.2
  };
  
  // Normalize to sum to 1
  const total = Object.values(probs).reduce((a, b) => a + b, 0);
  Object.keys(probs).forEach(k => probs[k] = probs[k] / total);
  
  return probs;
}

// Gene slots: D (dominant), R1, R2, R3
export function getGeneSlots(statGenes, field) {
  // statGenes is the raw gene value, field determines which bits to extract
  // This is a simplified version - actual implementation needs bit manipulation
  return {
    D: null,  // Will be populated from hero data
    R1: null,
    R2: null,
    R3: null
  };
}

// Calculate probability of each outcome from two parents' gene pools
export function calculateGeneProbabilities(parent1Genes, parent2Genes, valueMap = null) {
  const outcomes = {};
  const geneSlots = ['D', 'R1', 'R2', 'R3'];
  const probs = [GENE_PROBABILITIES.D, GENE_PROBABILITIES.R1, GENE_PROBABILITIES.R2, GENE_PROBABILITIES.R3];
  
  // For each parent, calculate contribution probability
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      const gene1 = parent1Genes[geneSlots[i]];
      const gene2 = parent2Genes[geneSlots[j]];
      
      if (gene1 === null || gene1 === undefined) continue;
      if (gene2 === null || gene2 === undefined) continue;
      
      // Each parent contributes with their gene probability
      const prob1 = probs[i];
      const prob2 = probs[j];
      
      // The offspring gets one gene from each parent with 50% chance each becoming dominant
      const combinedProb = prob1 * prob2;
      
      // Add both genes to outcomes
      const key1 = valueMap ? (valueMap[gene1] || gene1) : gene1;
      const key2 = valueMap ? (valueMap[gene2] || gene2) : gene2;
      
      outcomes[key1] = (outcomes[key1] || 0) + combinedProb * 0.5;
      outcomes[key2] = (outcomes[key2] || 0) + combinedProb * 0.5;
    }
  }
  
  // Normalize probabilities
  const total = Object.values(outcomes).reduce((a, b) => a + b, 0);
  if (total > 0) {
    Object.keys(outcomes).forEach(k => outcomes[k] = outcomes[k] / total);
  }
  
  return outcomes;
}

// Check if class mutation is possible
export function checkClassMutation(class1, class2) {
  const mutations = [];
  
  for (const [mutationId, mutation] of Object.entries(CLASS_MUTATIONS)) {
    const id = parseInt(mutationId);
    const [req1, req2] = mutation.requires;
    
    // Check if both required classes are present in the gene pools
    if ((class1 === req1 && class2 === req2) || (class1 === req2 && class2 === req1)) {
      mutations.push({
        classId: id,
        className: mutation.name,
        chance: 0.02 // 2% base mutation chance
      });
    }
  }
  
  // Check alternative paths
  for (const [mutationId, alternatives] of Object.entries(ALTERNATIVE_MUTATIONS)) {
    for (const alt of alternatives) {
      const [req1, req2] = alt.requires;
      if ((class1 === req1 && class2 === req2) || (class1 === req2 && class2 === req1)) {
        const id = parseInt(mutationId);
        if (!mutations.find(m => m.classId === id)) {
          mutations.push({
            classId: id,
            className: CLASSES[id],
            chance: 0.02
          });
        }
      }
    }
  }
  
  return mutations;
}

// Calculate class probabilities including mutations
export function calculateClassProbabilities(parent1ClassGenes, parent2ClassGenes) {
  // First calculate base inheritance probabilities
  const baseProbs = calculateGeneProbabilities(parent1ClassGenes, parent2ClassGenes, CLASSES);
  
  // Check for possible mutations between all gene combinations
  const mutations = [];
  const geneSlots = ['D', 'R1', 'R2', 'R3'];
  const probs = [GENE_PROBABILITIES.D, GENE_PROBABILITIES.R1, GENE_PROBABILITIES.R2, GENE_PROBABILITIES.R3];
  
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      const class1 = parent1ClassGenes[geneSlots[i]];
      const class2 = parent2ClassGenes[geneSlots[j]];
      
      if (class1 === null || class1 === undefined) continue;
      if (class2 === null || class2 === undefined) continue;
      
      const possibleMutations = checkClassMutation(class1, class2);
      const combinedProb = probs[i] * probs[j];
      
      for (const mutation of possibleMutations) {
        const existingMutation = mutations.find(m => m.classId === mutation.classId);
        if (existingMutation) {
          existingMutation.chance += combinedProb * 0.25; // 25% mutation rate when both classes match
        } else {
          mutations.push({
            ...mutation,
            chance: combinedProb * 0.25
          });
        }
      }
    }
  }
  
  // Add mutations to results
  const result = { ...baseProbs };
  for (const mutation of mutations) {
    result[mutation.className] = (result[mutation.className] || 0) + mutation.chance;
  }
  
  // Normalize
  const total = Object.values(result).reduce((a, b) => a + b, 0);
  if (total > 0) {
    Object.keys(result).forEach(k => result[k] = result[k] / total);
  }
  
  return {
    probabilities: result,
    mutations: mutations
  };
}

// Format ability display string
export function formatAbility(abilityId, isPassive = false) {
  const abilities = isPassive ? PASSIVE_ABILITIES : ACTIVE_ABILITIES;
  const ability = abilities[abilityId];
  if (!ability) return `Unknown (${abilityId})`;
  return `(${ability.tier}${ability.slot}) ${ability.name}`;
}

// Get stat name from gene value
export function getStatName(statId) {
  return STATS[statId] || `Unknown (${statId})`;
}

// Get element name from gene value
export function getElementName(elementId) {
  return ELEMENTS[elementId] || `Unknown (${elementId})`;
}

// Get profession name from gene value
export function getProfessionName(profId) {
  return PROFESSIONS[profId] || `Unknown (${profId})`;
}

// Get class name from gene value
export function getClassName(classId) {
  return CLASSES[classId] || `Unknown (${classId})`;
}

// Get rarity name
export function getRarityName(rarityId) {
  return RARITIES[rarityId] || `Unknown (${rarityId})`;
}

// Parse hero genes from raw statGenes BigInt
// DFK stores genes as a 256-bit number with specific bit positions for each trait
export function parseStatGenes(statGenesRaw) {
  if (!statGenesRaw) return null;
  
  const genes = BigInt(statGenesRaw);
  
  // Gene positions (4 bits each, 4 slots per trait)
  // This is a simplified extraction - actual positions vary by trait
  const extractGene = (position) => {
    const shifted = genes >> BigInt(position * 4);
    return Number(shifted & BigInt(0xF));
  };
  
  return {
    class: {
      D: extractGene(0),
      R1: extractGene(1),
      R2: extractGene(2),
      R3: extractGene(3)
    },
    subClass: {
      D: extractGene(4),
      R1: extractGene(5),
      R2: extractGene(6),
      R3: extractGene(7)
    },
    profession: {
      D: extractGene(8),
      R1: extractGene(9),
      R2: extractGene(10),
      R3: extractGene(11)
    },
    passive1: {
      D: extractGene(12),
      R1: extractGene(13),
      R2: extractGene(14),
      R3: extractGene(15)
    },
    passive2: {
      D: extractGene(16),
      R1: extractGene(17),
      R2: extractGene(18),
      R3: extractGene(19)
    },
    active1: {
      D: extractGene(20),
      R1: extractGene(21),
      R2: extractGene(22),
      R3: extractGene(23)
    },
    active2: {
      D: extractGene(24),
      R1: extractGene(25),
      R2: extractGene(26),
      R3: extractGene(27)
    },
    statBoost1: {
      D: extractGene(28),
      R1: extractGene(29),
      R2: extractGene(30),
      R3: extractGene(31)
    },
    statBoost2: {
      D: extractGene(32),
      R1: extractGene(33),
      R2: extractGene(34),
      R3: extractGene(35)
    },
    element: {
      D: extractGene(36),
      R1: extractGene(37),
      R2: extractGene(38),
      R3: extractGene(39)
    }
  };
}

export default {
  GENE_PROBABILITIES,
  CLASSES,
  CLASS_ID_BY_NAME,
  PROFESSIONS,
  STATS,
  ELEMENTS,
  RARITIES,
  ACTIVE_ABILITIES,
  PASSIVE_ABILITIES,
  calculateRarityProbabilities,
  calculateGeneProbabilities,
  calculateClassProbabilities,
  checkClassMutation,
  formatAbility,
  getStatName,
  getElementName,
  getProfessionName,
  getClassName,
  getRarityName,
  parseStatGenes
};
