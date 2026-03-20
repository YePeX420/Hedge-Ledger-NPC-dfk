// genetics-engine.js
// DeFi Kingdoms Hero Genetics & Summoning Calculator
// Predicts offspring outcomes, finds optimal breeding pairs, and analyzes genetic potential

import { GraphQLClient, gql } from 'graphql-request';

const DFK_GRAPHQL_ENDPOINT = 'https://api.defikingdoms.com/graphql';
const client = new GraphQLClient(DFK_GRAPHQL_ENDPOINT);

// ============================================================================
// GENETIC INHERITANCE MECHANICS
// ============================================================================

/**
 * Gene structure: Each trait has 4 genes (D, R1, R2, R3)
 * D = Dominant (expressed in hero)
 * R1, R2, R3 = Recessive (only matter for summoning)
 */

/**
 * Class genes inherit using weighted rolls across dominant and recessive slots.
 * Weights mirror the in-game probabilities for pulling each recessive gene.
 */
const GENE_WEIGHTS = [
  0.75, // Dominant (D)
  0.1875, // Recessive 1 (R1)
  0.046875, // Recessive 2 (R2)
  0.015625, // Recessive 3 (R3)
];

/**
 * Class mutation chart - which class combinations can produce which offspring
 * Source: DFK official docs
 */
const CLASS_MUTATIONS = {
  // Basic classes
  'Warrior + Warrior': ['Warrior'],
  'Knight + Knight': ['Knight'],
  'Thief + Thief': ['Thief'],
  'Archer + Archer': ['Archer'],
  'Priest + Priest': ['Priest'],
  'Wizard + Wizard': ['Wizard'],
  'Monk + Monk': ['Monk'],
  'Pirate + Pirate': ['Pirate'],
  
  // Advanced mutations (examples - full chart needed)
  'Warrior + Knight': ['Warrior', 'Knight', 'Paladin'],
  'Warrior + Thief': ['Warrior', 'Thief', 'DarkKnight'],
  'Warrior + Priest': ['Warrior', 'Priest', 'Paladin'],
  'Knight + Priest': ['Knight', 'Priest', 'Paladin'],
  'Thief + Archer': ['Thief', 'Archer', 'Ninja'],
  'Wizard + Priest': ['Wizard', 'Priest', 'Summoner'],
  'Archer + Wizard': ['Archer', 'Wizard', 'Sage'],
  'Priest + Wizard': ['Priest', 'Wizard', 'Summoner'],

  // Elite mutations
  'Paladin + Paladin': ['Paladin', 'Dragoon'],
  'DarkKnight + DarkKnight': ['DarkKnight', 'Dragoon'],
  'Ninja + Ninja': ['Ninja', 'Shapeshifter'],
  'Sage + Sage': ['Sage', 'Summoner'],

  // Cross-tier mutations
  'Paladin + DarkKnight': ['Paladin', 'DarkKnight', 'Dragoon'],
  'DarkKnight + Paladin': ['DarkKnight', 'Paladin', 'Dragoon'],
  'Ninja + Summoner': ['Ninja', 'Summoner', 'Sage'],
  'Summoner + Ninja': ['Summoner', 'Ninja', 'Sage'],
  'Dragoon + Sage': ['Dragoon', 'Sage', 'DreadKnight'],
  'Sage + Dragoon': ['Sage', 'Dragoon', 'DreadKnight'],

  // Add more as needed from official docs
};

/**
 * Rarity inheritance probabilities
 * Offspring rarity is influenced by parent rarities
 */
const RARITY_INHERITANCE = {
  // [parent1_rarity, parent2_rarity]: { 0: common%, 1: uncommon%, 2: rare%, 3: legendary%, 4: mythic% }
  'common_common': { 0: 0.70, 1: 0.24, 2: 0.05, 3: 0.01, 4: 0.00 },
  'common_uncommon': { 0: 0.50, 1: 0.35, 2: 0.12, 3: 0.03, 4: 0.00 },
  'uncommon_uncommon': { 0: 0.30, 1: 0.50, 2: 0.15, 3: 0.045, 4: 0.005 },
  'common_rare': { 0: 0.30, 1: 0.40, 2: 0.24, 3: 0.055, 4: 0.005 },
  'uncommon_rare': { 0: 0.15, 1: 0.40, 2: 0.35, 3: 0.09, 4: 0.01 },
  'rare_rare': { 0: 0.05, 1: 0.25, 2: 0.50, 3: 0.18, 4: 0.02 },
  'common_legendary': { 0: 0.10, 1: 0.30, 2: 0.40, 3: 0.18, 4: 0.02 },
  'uncommon_legendary': { 0: 0.05, 1: 0.20, 2: 0.45, 3: 0.27, 4: 0.03 },
  'rare_legendary': { 0: 0.00, 1: 0.10, 2: 0.40, 3: 0.42, 4: 0.08 },
  'legendary_legendary': { 0: 0.00, 1: 0.00, 2: 0.10, 3: 0.70, 4: 0.20 },
  'legendary_mythic': { 0: 0.00, 1: 0.00, 2: 0.05, 3: 0.50, 4: 0.45 },
  'mythic_mythic': { 0: 0.00, 1: 0.00, 2: 0.00, 3: 0.30, 4: 0.70 },
};

/**
 * Stat growth values by class and rarity
 * Higher rarity = better stat growth
 */
const STAT_GROWTH_RANGES = {
  // Format: { min, max } for primary stat growth percentage
  common: { min: 25, max: 50 },
  uncommon: { min: 35, max: 65 },
  rare: { min: 50, max: 75 },
  legendary: { min: 65, max: 85 },
  mythic: { min: 75, max: 100 },
};

// ============================================================================
// CORE SUMMONING CALCULATIONS
// ============================================================================

/**
 * Calculate offspring generation
 * @param {number} parent1Gen - Parent 1 generation
 * @param {number} parent2Gen - Parent 2 generation
 * @returns {number} Offspring generation
 */
export function calculateGeneration(parent1Gen, parent2Gen) {
  return Math.max(parent1Gen, parent2Gen) + 1;
}

/**
 * Calculate offspring summons remaining
 * @param {number} parent1Summons - Parent 1 summons remaining
 * @param {number} parent2Summons - Parent 2 summons remaining
 * @param {number} parent1Gen - Parent 1 generation
 * @param {number} parent2Gen - Parent 2 generation
 * @returns {number} Offspring summons remaining
 */
export function calculateSummonsRemaining(parent1Summons, parent2Summons, parent1Gen, parent2Gen) {
  // Gen 0 heroes have special rules (unlimited summons)
  if (parent1Gen === 0 && parent2Gen === 0) {
    return 10; // Two Gen0s produce Gen1 with 10 summons
  }
  
  // Otherwise: min(parent summons) - 1
  return Math.max(0, Math.min(parent1Summons, parent2Summons) - 1);
}

/**
 * Calculate possible offspring classes
 * @param {string} parent1Class - Parent 1 main class
 * @param {string} parent2Class - Parent 2 main class
 * @param {Array<string>} parent1Recessive - Parent 1 recessive classes (R1, R2, R3)
 * @param {Array<string>} parent2Recessive - Parent 2 recessive classes (R1, R2, R3)
 * @returns {Object} Class probabilities { className: probability }
 */
export function calculateClassProbabilities(parent1Class, parent2Class, parent1Recessive = [], parent2Recessive = []) {
  const parent1Genes = normalizeGeneArray(parent1Class, parent1Recessive);
  const parent2Genes = normalizeGeneArray(parent2Class, parent2Recessive);

  const probabilities = {};

  for (let i = 0; i < parent1Genes.length; i += 1) {
    for (let j = 0; j < parent2Genes.length; j += 1) {
      const geneProbability = GENE_WEIGHTS[i] * GENE_WEIGHTS[j];
      const parentGeneClass = parent1Genes[i];
      const partnerGeneClass = parent2Genes[j];

      const resolvedClasses = resolveClassCombination(parentGeneClass, partnerGeneClass);

      for (const [cls, weight] of Object.entries(resolvedClasses)) {
        probabilities[cls] = (probabilities[cls] || 0) + geneProbability * weight;
      }
    }
  }

  const total = Object.values(probabilities).reduce((sum, p) => sum + p, 0);
  if (total > 0) {
    for (const cls in probabilities) {
      probabilities[cls] /= total;
    }
  }

  return probabilities;
}

function normalizeGeneArray(mainClass, recessiveClasses = []) {
  const genes = [mainClass, ...recessiveClasses.slice(0, 3)];

  while (genes.length < 4) {
    genes.push(mainClass);
  }

  return genes;
}

function resolveClassCombination(parentGeneClass, partnerGeneClass) {
  if (parentGeneClass === partnerGeneClass) {
    return { [parentGeneClass]: 1 };
  }

  const combination = `${parentGeneClass} + ${partnerGeneClass}`;
  const reverseCombination = `${partnerGeneClass} + ${parentGeneClass}`;

  const possibleOutcomes =
    CLASS_MUTATIONS[combination] ||
    CLASS_MUTATIONS[reverseCombination] ||
    [parentGeneClass, partnerGeneClass];

  const uniqueOutcomes = [...new Set(possibleOutcomes)];
  const share = 1 / uniqueOutcomes.length;
  const resolved = {};

  for (const outcome of uniqueOutcomes) {
    resolved[outcome] = share;
  }

  return resolved;
}

/**
 * Calculate rarity probabilities for offspring
 * @param {number} parent1Rarity - Parent 1 rarity (0-4)
 * @param {number} parent2Rarity - Parent 2 rarity (0-4)
 * @returns {Object} Rarity probabilities { rarity: probability }
 */
export function calculateRarityProbabilities(parent1Rarity, parent2Rarity) {
  const rarityNames = ['common', 'uncommon', 'rare', 'legendary', 'mythic'];
  const key = `${rarityNames[parent1Rarity]}_${rarityNames[parent2Rarity]}`;
  const reverseKey = `${rarityNames[parent2Rarity]}_${rarityNames[parent1Rarity]}`;
  
  return RARITY_INHERITANCE[key] || RARITY_INHERITANCE[reverseKey] || RARITY_INHERITANCE['common_common'];
}

/**
 * Estimate stat ranges for offspring
 * @param {Object} parent1Stats - Parent 1 stats
 * @param {Object} parent2Stats - Parent 2 stats
 * @param {number} offspringRarity - Offspring rarity (0-4)
 * @returns {Object} Estimated stat ranges
 */
export function estimateOffspringStats(parent1Stats, parent2Stats, offspringRarity) {
  const rarityNames = ['common', 'uncommon', 'rare', 'legendary', 'mythic'];
  const rarityName = rarityNames[offspringRarity];
  const growthRange = STAT_GROWTH_RANGES[rarityName];
  
  // Stats inherit from parents with some variation
  const statNames = ['strength', 'agility', 'dexterity', 'vitality', 'intelligence', 'wisdom', 'luck'];
  const estimatedStats = {};
  
  for (const stat of statNames) {
    const avgParentStat = (parent1Stats[stat] + parent2Stats[stat]) / 2;
    const variation = avgParentStat * 0.15; // ±15% variation
    
    estimatedStats[stat] = {
      min: Math.floor(avgParentStat - variation),
      max: Math.ceil(avgParentStat + variation),
      avg: Math.floor(avgParentStat),
    };
  }
  
  return {
    stats: estimatedStats,
    growthPotential: growthRange,
  };
}

/**
 * Calculate complete summoning outcome
 * @param {Object} parent1 - Parent 1 hero data
 * @param {Object} parent2 - Parent 2 hero data
 * @returns {Object} Summoning outcome with probabilities
 */
export function calculateSummoningOutcome(parent1, parent2) {
  // Basic calculations
  const generation = calculateGeneration(parent1.generation || 0, parent2.generation || 0);
  const summonsRemaining = calculateSummonsRemaining(
    parent1.summons || parent1.summonsRemaining || 0,
    parent2.summons || parent2.summonsRemaining || 0,
    parent1.generation || 0,
    parent2.generation || 0
  );
  
  // Class probabilities
  const classProbabilities = calculateClassProbabilities(
    parent1.mainClass,
    parent2.mainClass,
    parent1.recessiveClasses || [],
    parent2.recessiveClasses || []
  );
  
  // Rarity probabilities
  const rarityProbabilities = calculateRarityProbabilities(
    parent1.rarity,
    parent2.rarity
  );
  
  // Most likely outcome
  const mostLikelyClass = Object.entries(classProbabilities).sort((a, b) => b[1] - a[1])[0][0];
  const mostLikelyRarity = Object.entries(rarityProbabilities).sort((a, b) => b[1] - a[1])[0][0];
  
  // Stat estimates for most likely rarity
  const statEstimates = estimateOffspringStats(
    parent1.stats || parent1,
    parent2.stats || parent2,
    parseInt(mostLikelyRarity)
  );
  
  return {
    generation,
    summonsRemaining,
    classProbabilities,
    rarityProbabilities,
    mostLikely: {
      class: mostLikelyClass,
      rarity: parseInt(mostLikelyRarity),
      rarityName: ['common', 'uncommon', 'rare', 'legendary', 'mythic'][mostLikelyRarity],
    },
    statEstimates,
    parents: {
      parent1Id: parent1.id,
      parent2Id: parent2.id,
    },
  };
}

// ============================================================================
// TAVERN SEARCH & PAIRING
// ============================================================================

/**
 * Search tavern for heroes that match desired criteria
 * @param {Object} criteria - Search criteria
 * @returns {Promise<Array>} Matching heroes
 */
export async function searchTavernForBreeding(criteria) {
  const {
    desiredClass,
    desiredRarity,
    maxPrice,
    minSummons = 1,
    realm = null,
  } = criteria;
  
  const query = gql`
    query SearchTavern(
      $mainClass: String
      $rarity: Int
      $maxPrice: BigInt
      $minSummons: Int
    ) {
      saleAuctions(
        first: 100
        orderBy: purchasePrice
        orderDirection: asc
        where: {
          open: true
          tokenId_gt: 0
        }
      ) {
        id
        tokenId
        startingPrice
        endingPrice
        seller {
          id
        }
        hero {
          id
          normalizedId
          mainClassStr
          subClassStr
          rarity
          generation
          summons
          maxSummons
          level
          strength
          intelligence
          wisdom
          luck
          agility
          vitality
          dexterity
        }
      }
    }
  `;
  
  try {
    const data = await client.request(query);
    
    // Filter results based on criteria
    let results = data.saleAuctions.map(auction => ({
      ...auction.hero,
      auctionId: auction.id,
      currentPrice: auction.endingPrice,
      summonsRemaining: auction.hero.maxSummons - auction.hero.summons,
    }));
    
    // Apply filters
    if (desiredClass) {
      results = results.filter(h => h.mainClassStr === desiredClass);
    }
    
    if (desiredRarity !== undefined) {
      results = results.filter(h => h.rarity === desiredRarity);
    }
    
    if (minSummons !== undefined) {
      results = results.filter(h => (h.maxSummons - h.summons) >= minSummons);
    }
    
    if (maxPrice) {
      results = results.filter(h => BigInt(h.currentPrice) <= BigInt(maxPrice));
    }
    
    return results;
  } catch (error) {
    console.error('Error searching tavern:', error);
    throw error;
  }
}

/**
 * Find best breeding pair from tavern for desired outcome
 * @param {Object} desiredOutcome - Desired offspring characteristics
 * @param {Object} ownedHero - User's hero (optional)
 * @returns {Promise<Array>} Recommended breeding pairs with probabilities
 */
export async function findOptimalBreedingPair(desiredOutcome, ownedHero = null) {
  const {
    targetClass,
    targetRarity,
    maxBudget,
  } = desiredOutcome;
  
  // Search tavern for candidates
  const candidates = await searchTavernForBreeding({
    maxPrice: maxBudget,
    minSummons: 1,
  });
  
  console.log(`Found ${candidates.length} breeding candidates in tavern`);
  
  const recommendations = [];
  
  if (ownedHero) {
    // Mix owned hero with tavern heroes
    for (const tavernHero of candidates) {
      const outcome = calculateSummoningOutcome(ownedHero, tavernHero);
      
      // Score based on how well it matches desired outcome
      const score = calculateOutcomeScore(outcome, targetClass, targetRarity);
      
      recommendations.push({
        parent1: ownedHero,
        parent2: tavernHero,
        outcome,
        score,
        cost: tavernHero.currentPrice,
      });
    }
  } else {
    // Find pairs from tavern heroes
    for (let i = 0; i < candidates.length; i++) {
      for (let j = i + 1; j < candidates.length && j < i + 20; j++) {
        const outcome = calculateSummoningOutcome(candidates[i], candidates[j]);
        
        const score = calculateOutcomeScore(outcome, targetClass, targetRarity);
        
        const totalCost = BigInt(candidates[i].currentPrice) + BigInt(candidates[j].currentPrice);
        
        recommendations.push({
          parent1: candidates[i],
          parent2: candidates[j],
          outcome,
          score,
          cost: totalCost.toString(),
        });
      }
    }
  }
  
  // Sort by score (best matches first)
  recommendations.sort((a, b) => b.score - a.score);
  
  return recommendations.slice(0, 10); // Return top 10
}

/**
 * Calculate how well an outcome matches desired targets
 * @param {Object} outcome - Calculated outcome
 * @param {string} targetClass - Desired class
 * @param {number} targetRarity - Desired rarity
 * @returns {number} Score (0-100)
 */
function calculateOutcomeScore(outcome, targetClass, targetRarity) {
  let score = 0;
  
  // Class match (0-50 points)
  if (targetClass && outcome.classProbabilities[targetClass]) {
    score += outcome.classProbabilities[targetClass] * 50;
  }
  
  // Rarity match (0-50 points)
  if (targetRarity !== undefined && outcome.rarityProbabilities[targetRarity]) {
    score += outcome.rarityProbabilities[targetRarity] * 50;
  }
  
  return score;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Format summoning outcome for display
 * @param {Object} outcome - Summoning outcome
 * @returns {string} Formatted text
 */
export function formatSummoningOutcome(outcome) {
  const rarityNames = ['Common', 'Uncommon', 'Rare', 'Legendary', 'Mythic'];
  
  let output = `🧬 **Summoning Outcome**\n\n`;
  output += `**Generation:** ${outcome.generation}\n`;
  output += `**Summons Remaining:** ${outcome.summonsRemaining}\n\n`;
  
  output += `**Most Likely Result:**\n`;
  output += `  Class: ${outcome.mostLikely.class}\n`;
  output += `  Rarity: ${outcome.mostLikely.rarityName}\n\n`;
  
  output += `**Class Probabilities:**\n`;
  for (const [cls, prob] of Object.entries(outcome.classProbabilities).sort((a, b) => b[1] - a[1])) {
    output += `  ${cls}: ${(prob * 100).toFixed(1)}%\n`;
  }
  
  output += `\n**Rarity Probabilities:**\n`;
  for (const [rarity, prob] of Object.entries(outcome.rarityProbabilities).sort((a, b) => parseInt(a[0]) - parseInt(b[0]))) {
    output += `  ${rarityNames[rarity]}: ${(prob * 100).toFixed(1)}%\n`;
  }
  
  return output;
}

export { CLASS_MUTATIONS, GENE_WEIGHTS, RARITY_INHERITANCE };
