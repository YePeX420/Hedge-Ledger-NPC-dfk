/**
 * Hero Summoning Rarity Calculator
 * 
 * Calculates offspring rarity distribution based on parent rarity combinations.
 * Based on official DeFi Kingdoms Hero Summoning Rarity Chances chart (January 2025).
 */

const RARITY_LEVELS = ['Common', 'Uncommon', 'Rare', 'Legendary', 'Mythic'];

const RARITY_CHART = {
  'Common+Common': {
    Common: 58.3,
    Uncommon: 27.0,
    Rare: 12.5,
    Legendary: 2.0,
    Mythic: 0.2
  },
  'Uncommon+Common': {
    Common: 56.03,
    Uncommon: 27.69,
    Rare: 13.12,
    Legendary: 2.56,
    Mythic: 0.6
  },
  'Uncommon+Uncommon': {
    Common: 53.73,
    Uncommon: 28.38,
    Rare: 13.75,
    Legendary: 3.12,
    Mythic: 1.02
  },
  'Rare+Common': {
    Common: 51.44,
    Uncommon: 29.06,
    Rare: 14.57,
    Legendary: 3.09,
    Mythic: 1.44
  },
  'Rare+Uncommon': {
    Common: 51.44,
    Uncommon: 29.06,
    Rare: 14.57,
    Legendary: 3.09,
    Mythic: 1.44
  },
  'Rare+Rare': {
    Common: 49.15,
    Uncommon: 29.75,
    Rare: 15.0,
    Legendary: 4.25,
    Mythic: 1.85
  },
  'Legendary+Common': {
    Common: 46.86,
    Uncommon: 30.44,
    Rare: 15.0,
    Legendary: 4.25,
    Mythic: 2.70
  },
  'Legendary+Uncommon': {
    Common: 46.86,
    Uncommon: 30.44,
    Rare: 15.67,
    Legendary: 4.85,
    Mythic: 2.68
  },
  'Legendary+Rare': {
    Common: 44.57,
    Uncommon: 31.13,
    Rare: 16.35,
    Legendary: 5.58,
    Mythic: 2.68
  },
  'Legendary+Legendary': {
    Common: 42.29,
    Uncommon: 30.0,
    Rare: 17.0,
    Legendary: 6.5,
    Mythic: 3.09
  },
  'Mythic+Common': {
    Common: 40.86,
    Uncommon: 29.43,
    Rare: 16.82,
    Legendary: 9.33,
    Mythic: 3.56
  },
  'Mythic+Uncommon': {
    Common: 44.57,
    Uncommon: 31.13,
    Rare: 16.35,
    Legendary: 5.04,
    Mythic: 3.09
  },
  'Mythic+Rare': {
    Common: 42.25,
    Uncommon: 30.18,
    Rare: 16.88,
    Legendary: 5.04,
    Mythic: 3.09
  },
  'Mythic+Legendary': {
    Common: 40.0,
    Uncommon: 32.5,
    Rare: 17.0,
    Legendary: 6.5,
    Mythic: 3.5
  },
  'Mythic+Mythic': {
    Common: 40.0,
    Uncommon: 32.5,
    Rare: 17.0,
    Legendary: 6.5,
    Mythic: 3.5
  }
};

/**
 * Calculate rarity distribution for offspring based on parent rarities
 * @param {string} parent1Rarity - Rarity of first parent ('Common', 'Uncommon', 'Rare', 'Legendary', or 'Mythic')
 * @param {string} parent2Rarity - Rarity of second parent
 * @returns {Object} Probability distribution for each rarity level
 */
export function calculateRarityDistribution(parent1Rarity, parent2Rarity) {
  const r1 = normalizeRarity(parent1Rarity);
  const r2 = normalizeRarity(parent2Rarity);
  
  if (!r1 || !r2) {
    throw new Error(`Invalid rarity values: ${parent1Rarity}, ${parent2Rarity}`);
  }
  
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
