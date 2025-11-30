/**
 * Hero Summoning Rarity Calculator
 * 
 * Calculates offspring rarity distribution based on parent rarity combinations.
 * Based on official DeFi Kingdoms Hero Summoning Rarity Chances chart.
 */

const RARITY_LEVELS = ['Common', 'Uncommon', 'Rare', 'Legendary', 'Mythic'];

const RARITY_CHART = {
  'Common+Common': {
    Common: 58.5,
    Uncommon: 27.0,
    Rare: 12.5,
    Legendary: 2.0,
    Mythic: 0.0
  },
  'Uncommon+Common': {
    Common: 58.0,
    Uncommon: 27.60,
    Rare: 11.1,
    Legendary: 2.68,
    Mythic: 0.62
  },
  'Uncommon+Uncommon': {
    Common: 53.75,
    Uncommon: 28.13,
    Rare: 15.73,
    Legendary: 2.27,
    Mythic: 0.12
  },
  'Rare+Common': {
    Common: 51.44,
    Uncommon: 29.06,
    Rare: 14.37,
    Legendary: 3.69,
    Mythic: 1.44
  },
  'Rare+Uncommon': {
    Common: 49.1,
    Uncommon: 29.73,
    Rare: 17.0,
    Legendary: 3.12,
    Mythic: 1.05
  },
  'Rare+Rare': {
    Common: 43.61,
    Uncommon: 29.73,
    Rare: 20.35,
    Legendary: 4.83,
    Mythic: 1.48
  },
  'Legendary+Common': {
    Common: 40.86,
    Uncommon: 29.43,
    Rare: 16.82,
    Legendary: 9.33,
    Mythic: 3.56
  },
  'Legendary+Uncommon': {
    Common: 44.57,
    Uncommon: 31.13,
    Rare: 16.35,
    Legendary: 5.33,
    Mythic: 2.62
  },
  'Legendary+Rare': {
    Common: 42.25,
    Uncommon: 30.18,
    Rare: 18.97,
    Legendary: 5.84,
    Mythic: 2.76
  },
  'Legendary+Legendary': {
    Common: 40.0,
    Uncommon: 30.0,
    Rare: 17.0,
    Legendary: 9.0,
    Mythic: 4.0
  },
  'Mythic+Common': {
    Common: 58.97,
    Uncommon: 24.64,
    Rare: 9.38,
    Legendary: 4.83,
    Mythic: 2.18
  },
  'Mythic+Uncommon': {
    Common: 54.0,
    Uncommon: 28.2,
    Rare: 10.35,
    Legendary: 5.05,
    Mythic: 2.4
  },
  'Mythic+Rare': {
    Common: 62.25,
    Uncommon: 20.18,
    Rare: 8.6,
    Legendary: 5.84,
    Mythic: 3.13
  },
  'Mythic+Legendary': {
    Common: 40.0,
    Uncommon: 30.0,
    Rare: 17.0,
    Legendary: 9.0,
    Mythic: 4.0
  },
  'Mythic+Mythic': {
    Common: 40.0,
    Uncommon: 30.0,
    Rare: 17.0,
    Legendary: 9.0,
    Mythic: 4.0
  }
};

/**
 * Calculate rarity distribution for offspring based on parent rarities
 * @param {string} parent1Rarity - Rarity of first parent ('Common', 'Uncommon', 'Rare', 'Legendary', or 'Mythic')
 * @param {string} parent2Rarity - Rarity of second parent
 * @returns {Object} Probability distribution for each rarity level
 */
export function calculateRarityDistribution(parent1Rarity, parent2Rarity) {
  // Normalize input
  const r1 = normalizeRarity(parent1Rarity);
  const r2 = normalizeRarity(parent2Rarity);
  
  if (!r1 || !r2) {
    throw new Error(`Invalid rarity values: ${parent1Rarity}, ${parent2Rarity}`);
  }
  
  // Try both orderings (chart is symmetric)
  const key1 = `${r1}+${r2}`;
  const key2 = `${r2}+${r1}`;
  
  const distribution = RARITY_CHART[key1] || RARITY_CHART[key2];
  
  if (!distribution) {
    throw new Error(`No rarity data found for combination: ${r1} + ${r2}`);
  }
  
  return distribution;
}

/**
 * Get the most likely rarity outcome
 * @param {string} parent1Rarity 
 * @param {string} parent2Rarity 
 * @returns {Object} { rarity: string, probability: number }
 */
export function getMostLikelyRarity(parent1Rarity, parent2Rarity) {
  const distribution = calculateRarityDistribution(parent1Rarity, parent2Rarity);
  
  let maxRarity = 'Common';
  let maxProb = 0;
  
  for (const [rarity, prob] of Object.entries(distribution)) {
    if (prob > maxProb) {
      maxProb = prob;
      maxRarity = rarity;
    }
  }
  
  return { rarity: maxRarity, probability: maxProb };
}

/**
 * Format rarity distribution for display
 * @param {Object} distribution 
 * @returns {string} Formatted string
 */
export function formatRarityDistribution(distribution) {
  return RARITY_LEVELS
    .filter(rarity => distribution[rarity] > 0)
    .map(rarity => `${rarity}: ${distribution[rarity]}%`)
    .join(', ');
}

/**
 * Normalize rarity string to standard format
 * @param {string} rarity 
 * @returns {string|null}
 */
function normalizeRarity(rarity) {
  if (!rarity) return null;
  
  const normalized = rarity.charAt(0).toUpperCase() + rarity.slice(1).toLowerCase();
  
  return RARITY_LEVELS.includes(normalized) ? normalized : null;
}

/**
 * Get rarity tier index (0=Common, 4=Mythic)
 * @param {string} rarity 
 * @returns {number}
 */
export function getRarityTier(rarity) {
  const normalized = normalizeRarity(rarity);
  return RARITY_LEVELS.indexOf(normalized);
}
