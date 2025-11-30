/**
 * Bargain Finder - Find the cheapest hero pairs on the marketplace
 * with the best chance to summon a specific class
 * 
 * Uses live blockchain data + summoning probability calculator
 */

import { gql, request } from 'graphql-request';
import { calculateSummoningProbabilities } from './summoning-engine.js';
import { decodeHeroGenes } from './hero-genetics.js';

const GRAPHQL_ENDPOINT = 'https://api.defikingdoms.com/graphql';

/**
 * Fetch heroes for sale on the marketplace with their genetics
 * @param {Object} options - Query options
 * @param {number} options.maxPrice - Maximum price in JEWEL (optional)
 * @param {number} options.maxSummons - Maximum summons used (optional)
 * @param {number} options.limit - Max number of heroes to fetch
 * @returns {Promise<Array>} Heroes with genetics data
 */
export async function fetchMarketplaceHeroes({
  maxPrice = null,
  maxSummons = null,
  limit = 100
} = {}) {
  const where = { salePrice_not: null };
  
  if (maxPrice) {
    where.salePrice_lte = (maxPrice * 1e18).toString();
  }
  
  if (maxSummons !== null) {
    where.summons_lte = maxSummons;
  }

  const query = gql`
    query MarketplaceHeroes($where: HeroFilter, $first: Int!) {
      heroes(
        where: $where,
        first: $first,
        orderBy: salePrice,
        orderDirection: asc
      ) {
        id
        normalizedId
        mainClassStr
        subClassStr
        professionStr
        rarity
        level
        generation
        summons
        maxSummons
        salePrice
        statGenes
        visualGenes
        owner {
          name
        }
      }
    }
  `;

  try {
    const data = await request(GRAPHQL_ENDPOINT, query, {
      where,
      first: limit
    });
    
    return data.heroes.map(hero => ({
      ...hero,
      salePriceJewel: parseFloat((BigInt(hero.salePrice) / BigInt(1e18)).toString()) + 
                       parseFloat((BigInt(hero.salePrice) % BigInt(1e18)).toString()) / 1e18
    }));
  } catch (error) {
    console.error('[BargainFinder] Error fetching marketplace heroes:', error);
    throw error;
  }
}

/**
 * Find the cheapest hero pairs with the best chance to summon a target class
 * @param {Object} options
 * @param {string} options.targetClass - Target class to summon (e.g. 'Dreadknight')
 * @param {number} options.minProbability - Minimum probability threshold (0-100)
 * @param {number} options.maxTotalPrice - Maximum total price for the pair in JEWEL
 * @param {number} options.maxSummons - Max summons used for each hero
 * @param {number} options.limit - Number of top results to return
 * @returns {Promise<Array>} Top bargain pairs sorted by price
 */
export async function findBargainPairs({
  targetClass,
  minProbability = 5.0,
  maxTotalPrice = null,
  maxSummons = null,
  limit = 5
} = {}) {
  console.log(`[BargainFinder] Finding bargain pairs for ${targetClass}...`);
  console.log(`[BargainFinder] Min probability: ${minProbability}%`);
  console.log(`[BargainFinder] Max total price: ${maxTotalPrice ? maxTotalPrice + ' JEWEL' : 'unlimited'}`);
  
  // Fetch marketplace heroes
  const fetchLimit = maxTotalPrice ? 200 : 100; // Fetch more if price limited
  const heroes = await fetchMarketplaceHeroes({
    maxPrice: maxTotalPrice ? maxTotalPrice / 2 : null, // Each hero should be <= half max
    maxSummons,
    limit: fetchLimit
  });
  
  console.log(`[BargainFinder] Fetched ${heroes.length} heroes from marketplace`);
  
  if (heroes.length === 0) {
    return [];
  }
  
  // Decode genetics for all heroes
  const heroesWithGenetics = heroes.map(hero => {
    try {
      const genetics = decodeHeroGenes(hero);
      return { hero, genetics };
    } catch (err) {
      console.error(`[BargainFinder] Failed to decode hero ${hero.id}:`, err.message);
      return null;
    }
  }).filter(Boolean);
  
  console.log(`[BargainFinder] Successfully decoded ${heroesWithGenetics.length} heroes`);
  
  // Calculate all possible pairs
  const pairs = [];
  for (let i = 0; i < heroesWithGenetics.length; i++) {
    for (let j = i + 1; j < heroesWithGenetics.length; j++) {
      const parent1 = heroesWithGenetics[i];
      const parent2 = heroesWithGenetics[j];
      
      const totalPrice = parent1.hero.salePriceJewel + parent2.hero.salePriceJewel;
      
      // Skip if over max price
      if (maxTotalPrice && totalPrice > maxTotalPrice) {
        continue;
      }
      
      try {
        // Calculate summoning probabilities
        const probabilities = calculateSummoningProbabilities(
          parent1.genetics,
          parent2.genetics,
          parent1.hero.rarity,
          parent2.hero.rarity
        );
        
        // Get probability for target class
        const targetProb = probabilities.mainClass[targetClass] || 0;
        
        // Skip if below minimum probability
        if (targetProb < minProbability) {
          continue;
        }
        
        pairs.push({
          parent1: {
            id: parent1.hero.id,
            normalizedId: parent1.hero.normalizedId,
            mainClass: parent1.hero.mainClassStr,
            subClass: parent1.hero.subClassStr,
            rarity: parent1.hero.rarity,
            level: parent1.hero.level,
            generation: parent1.hero.generation,
            summons: parent1.hero.summons,
            maxSummons: parent1.hero.maxSummons,
            price: parent1.hero.salePriceJewel
          },
          parent2: {
            id: parent2.hero.id,
            normalizedId: parent2.hero.normalizedId,
            mainClass: parent2.hero.mainClassStr,
            subClass: parent2.hero.subClassStr,
            rarity: parent2.hero.rarity,
            level: parent2.hero.level,
            generation: parent2.hero.generation,
            summons: parent2.hero.summons,
            maxSummons: parent2.hero.maxSummons,
            price: parent2.hero.salePriceJewel
          },
          totalPrice,
          targetClassProbability: targetProb,
          allClassProbabilities: probabilities.mainClass,
          topProfessions: Object.entries(probabilities.profession)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3),
          rarityDistribution: probabilities.rarity
        });
      } catch (err) {
        console.error(`[BargainFinder] Error calculating pair ${parent1.hero.id}+${parent2.hero.id}:`, err.message);
      }
    }
  }
  
  console.log(`[BargainFinder] Found ${pairs.length} pairs above ${minProbability}% threshold`);
  
  // Sort by:
  // 1. Target class probability (descending)
  // 2. Total price (ascending)
  pairs.sort((a, b) => {
    // First priority: higher probability
    if (Math.abs(b.targetClassProbability - a.targetClassProbability) > 0.1) {
      return b.targetClassProbability - a.targetClassProbability;
    }
    // Second priority: lower price
    return a.totalPrice - b.totalPrice;
  });
  
  return pairs.slice(0, limit);
}

/**
 * Find the single cheapest hero pair with decent probability for target class
 * @param {string} targetClass - Target class to summon
 * @param {number} minProbability - Minimum acceptable probability
 * @returns {Promise<Object|null>} Cheapest qualifying pair or null
 */
export async function findCheapestPair(targetClass, minProbability = 5.0) {
  const results = await findBargainPairs({
    targetClass,
    minProbability,
    limit: 1
  });
  
  return results.length > 0 ? results[0] : null;
}

/**
 * Get statistics about marketplace for a target class
 * @param {string} targetClass - Target class
 * @returns {Promise<Object>} Market statistics
 */
export async function getMarketplaceStats(targetClass) {
  const heroes = await fetchMarketplaceHeroes({ limit: 100 });
  
  const classHeroes = heroes.filter(h => h.mainClassStr === targetClass);
  const prices = classHeroes.map(h => h.salePriceJewel).sort((a, b) => a - b);
  
  return {
    totalListings: heroes.length,
    classListings: classHeroes.length,
    cheapestClass: classHeroes.length > 0 ? prices[0] : null,
    medianClass: classHeroes.length > 0 ? prices[Math.floor(prices.length / 2)] : null,
    averageClass: classHeroes.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : null
  };
}

export default {
  fetchMarketplaceHeroes,
  findBargainPairs,
  findCheapestPair,
  getMarketplaceStats
};
