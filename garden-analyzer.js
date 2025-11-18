/**
 * Garden Analyzer
 * 
 * Analyzes current hero-to-pool assignments and calculates actual APR
 * based on hero stats, pet bonuses, and pool characteristics.
 */

import { getHeroesByOwner } from './onchain-data.js';
import { fetchPetsForWallet, mapPetsToHeroes } from './pet-data.js';
import { getPoolCache } from './pool-cache.js';

/**
 * Calculate hero gardening effectiveness score
 * Used for both current state analysis and optimization
 * 
 * @param {Object} hero - Hero object from GraphQL
 * @returns {number} Score (higher is better)
 */
export function scoreHeroForGardening(hero) {
  // Base stats (INT and WIS are most important for gardening)
  const intScore = hero.intelligence || 0;
  const wisScore = hero.wisdom || 0;
  const level = hero.level || 1;
  
  // Gardening skill (already /10 in GraphQL response)
  const gardeningSkill = hero.gardening || 0;
  
  // Rapid Renewal passive bonus (+10% yields)
  const hasRapidRenewal = 
    (hero.passive1?.name === 'Rapid Renewal') || 
    (hero.passive2?.name === 'Rapid Renewal');
  const rapidRenewalBonus = hasRapidRenewal ? 1.1 : 1.0;
  
  // Formula: (INT + WIS) * level * (1 + gardeningSkill/100) * rapidRenewalBonus
  const baseScore = (intScore + wisScore) * level;
  const skillMultiplier = 1 + (gardeningSkill / 100);
  
  const finalScore = baseScore * skillMultiplier * rapidRenewalBonus;
  
  return Math.floor(finalScore);
}

/**
 * Calculate quest yield for a specific hero in a specific pool
 * 
 * @param {Object} hero - Hero object
 * @param {Object} pet - Pet object (optional)
 * @param {Object} poolData - Pool analytics data
 * @returns {Object} { crystalsPerQuest, jewelPerQuest, totalAPR }
 */
export function calculateHeroYield(hero, pet, poolData) {
  if (!hero || !poolData) {
    return { crystalsPerQuest: 0, jewelPerQuest: 0, totalAPR: 0 };
  }
  
  // Extract hero stats
  const INT = hero.intelligence || 0;
  const WIS = hero.wisdom || 0;
  const VIT = hero.vitality || 0;
  const level = hero.level || 1;
  const gardeningSkill = (hero.gardening || 0) / 10; // Convert to 0-100 scale
  
  // Gene bonus (if hero has advanced/elite/exalted genes)
  const totalGenes = (hero.advancedGenes || 0) + (hero.eliteGenes || 0) + (hero.exaltedGenes || 0);
  const geneBonus = Math.min(totalGenes, 3); // Capped at 3
  
  // Rapid Renewal passive (+10%)
  const hasRapidRenewal = 
    (hero.passive1?.name === 'Rapid Renewal') || 
    (hero.passive2?.name === 'Rapid Renewal');
  const rapidRenewalMult = hasRapidRenewal ? 1.1 : 1.0;
  
  // Pet bonus (gardening pets provide % boost)
  const petBonus = (pet && pet.gatheringType === 'Gardening') 
    ? (1 + pet.gatheringBonusScalar / 100) 
    : 1.0;
  
  // Base formula from spec (per stamina)
  // baseYield = (rewardPerBlock * allocPoint / totalAllocPoint) * 
  //             (0.1 + (WIS+VIT)/1222.22 + GrdSkl/244.44)) / rewardModBase
  
  const rewardModBase = gardeningSkill >= 10 ? 72 : 144;
  
  const statComponent = 0.1 + (WIS + VIT) / 1222.22 + gardeningSkill / 244.44;
  
  // Emissions per stamina (CRYSTAL)
  const emissionsPerStamina = poolData.rewardsPerQuest || 0;
  const crystalsPerStamina = emissionsPerStamina * statComponent / rewardModBase;
  
  // Trading fees (JEWEL) - simplified from pool data
  const feesPerStamina = poolData.feesPerQuest || 0;
  
  // Quest uses 5 stamina
  const STAMINA_PER_QUEST = 5;
  
  let crystalsPerQuest = crystalsPerStamina * STAMINA_PER_QUEST;
  let jewelPerQuest = feesPerStamina * STAMINA_PER_QUEST;
  
  // Apply gene bonus, rapid renewal, and pet bonuses
  crystalsPerQuest *= (1 + geneBonus * 0.02) * rapidRenewalMult * petBonus;
  jewelPerQuest *= (1 + geneBonus * 0.02) * rapidRenewalMult * petBonus;
  
  // Calculate total APR if pool has it
  const totalAPR = poolData.totalAPR || 0;
  
  return {
    crystalsPerQuest: Number(crystalsPerQuest.toFixed(4)),
    jewelPerQuest: Number(jewelPerQuest.toFixed(4)),
    totalAPR: Number(totalAPR.toFixed(2))
  };
}

/**
 * Analyze current hero assignments to pools
 * Note: DFK Chain doesn't directly expose hero-to-pool mapping
 * We infer it from currentQuest field in hero data
 * 
 * @param {string} walletAddress - User's wallet address
 * @returns {Promise<Object>} Current assignment analysis
 */
export async function analyzeCurrentAssignments(walletAddress) {
  try {
    console.log(`[GardenAnalyzer] Analyzing current assignments for ${walletAddress}...`);
    
    // Fetch all heroes owned by wallet
    const heroes = await getHeroesByOwner(walletAddress);
    console.log(`[GardenAnalyzer] Found ${heroes.length} heroes`);
    
    // Fetch all pets owned by wallet
    const pets = await fetchPetsForWallet(walletAddress);
    console.log(`[GardenAnalyzer] Found ${pets.length} pets`);
    
    // Map pets to heroes
    const heroIds = heroes.map(h => h.id);
    const heroToPet = mapPetsToHeroes(heroIds, pets);
    
    // Get pool analytics data
    const poolCache = getPoolCache();
    
    // Analyze current assignments
    const assignments = [];
    const gardeningHeroes = heroes.filter(h => {
      // Check if hero is currently on a gardening quest
      // currentQuest format: "0x..." (contract address)
      return h.currentQuest && h.currentQuest !== '0x0000000000000000000000000000000000000000';
    });
    
    console.log(`[GardenAnalyzer] ${gardeningHeroes.length} heroes currently on quests`);
    
    // For each hero on a gardening quest, calculate their yield
    for (const hero of gardeningHeroes) {
      const pet = heroToPet.get(hero.id);
      
      // Try to match hero's quest to a pool
      // This is a best-effort approach - exact pool matching requires more data
      let bestPoolMatch = null;
      let bestYield = { crystalsPerQuest: 0, jewelPerQuest: 0, totalAPR: 0 };
      
      // Calculate potential yield in each pool to infer current assignment
      for (const pool of poolCache) {
        const heroYield = calculateHeroYield(hero, pet, pool);
        if (heroYield.crystalsPerQuest + heroYield.jewelPerQuest > 
            bestYield.crystalsPerQuest + bestYield.jewelPerQuest) {
          bestPoolMatch = pool;
          bestYield = heroYield;
        }
      }
      
      if (bestPoolMatch) {
        assignments.push({
          hero: {
            id: hero.id,
            level: hero.level,
            intelligence: hero.intelligence,
            wisdom: hero.wisdom,
            gardening: hero.gardening,
            passive1: hero.passive1?.name,
            passive2: hero.passive2?.name
          },
          pet: pet || null,
          pool: {
            pid: bestPoolMatch.pid,
            pair: bestPoolMatch.pair,
            totalAPR: bestPoolMatch.totalAPR
          },
          yield: bestYield
        });
      }
    }
    
    // Calculate total current APR
    const totalCurrentAPR = assignments.reduce((sum, a) => sum + a.yield.totalAPR, 0);
    
    return {
      totalHeroes: heroes.length,
      totalPets: pets.length,
      activeGardeningHeroes: gardeningHeroes.length,
      assignments,
      totalCurrentAPR,
      heroes, // Include all heroes for optimization
      pets    // Include all pets for optimization
    };
    
  } catch (error) {
    console.error(`[GardenAnalyzer] Error analyzing current assignments:`, error);
    return {
      totalHeroes: 0,
      totalPets: 0,
      activeGardeningHeroes: 0,
      assignments: [],
      totalCurrentAPR: 0,
      heroes: [],
      pets: []
    };
  }
}

/**
 * Rank pools by yield potential
 * Prioritizes: emission-dominant → balanced → fee-dominant
 * 
 * @param {Array<Object>} pools - Pool analytics data
 * @returns {Array<Object>} Sorted pools (highest yield first)
 */
export function rankPoolsByYieldPotential(pools) {
  return [...pools].sort((a, b) => {
    // Primary: Total APR (higher is better)
    if (Math.abs(a.totalAPR - b.totalAPR) > 0.5) {
      return b.totalAPR - a.totalAPR;
    }
    
    // Secondary: Emission ratio (emission-dominant pools preferred)
    const aEmissionRatio = a.emissionAPR / (a.totalAPR || 1);
    const bEmissionRatio = b.emissionAPR / (b.totalAPR || 1);
    
    return bEmissionRatio - aEmissionRatio;
  });
}
