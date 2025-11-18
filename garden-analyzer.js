/**
 * Garden Analyzer
 * 
 * Analyzes current hero-to-pool assignments and calculates actual APR
 * based on hero stats, pet bonuses, and pool characteristics.
 */

import { getHeroesByOwner } from './onchain-data.js';
import { fetchPetsForWallet, mapPetsToHeroes } from './pet-data.js';
import { getCachedPoolAnalytics } from './pool-cache.js';
import { getHeroGardeningAssignment } from './garden-analytics.js';

/**
 * Calculate hero gardening effectiveness score
 * Used for both current state analysis and optimization
 * 
 * @param {Object} hero - Hero object from GraphQL
 * @returns {number} Score (higher is better)
 */
export function scoreHeroForGardening(hero) {
  // Base stats (VIT and WIS are most important for gardening per official docs)
  const vitScore = hero.vitality || 0;
  const wisScore = hero.wisdom || 0;
  const level = hero.level || 1;
  
  // Gardening skill (already /10 in GraphQL response)
  const gardeningSkill = hero.gardening || 0;
  
  // Gardening profession gene bonus (20% token bonus, reduces time per stamina)
  const hasGardeningGene = hero.professionStr === 'Gardening';
  const geneBonus = hasGardeningGene ? 1.2 : 1.0;
  
  // Formula: (VIT + WIS) * level * (1 + gardeningSkill/100) * geneBonus
  const baseScore = (vitScore + wisScore) * level;
  const skillMultiplier = 1 + (gardeningSkill / 100);
  
  const finalScore = baseScore * skillMultiplier * geneBonus;
  
  return Math.floor(finalScore);
}

/**
 * Calculate quest yield for a specific hero in a specific pool
 * Uses official DeFi Kingdoms formula from docs.defikingdoms.com
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
  const WIS = hero.wisdom || 0;
  const VIT = hero.vitality || 0;
  const GrdSkl = Math.floor((hero.gardening || 0) / 10); // Rounded down as per docs
  
  // Gardening profession gene bonus
  // geneBonus = 1 if hero has Gardening profession, else 0
  const hasGardeningGene = hero.professionStr === 'Gardening';
  const geneBonus = hasGardeningGene ? 1 : 0;
  
  // Reward modifier base (Skill 10+ quests have doubled rewards)
  const rewardModBase = GrdSkl >= 10 ? 72 : 144;
  
  // Annealing factor (fixed at 1.0, past annealing period)
  const annealingFactor = 1.0;
  
  // Official DeFi Kingdoms formula (per stamina):
  // earnRate = annealingFactor * (rewardPool * poolAllocation * LPowned * 
  //            (0.1 + (WIS+VIT)/1222.22 + GrdSkl/244.44)) / 
  //            ((300 - (50 * geneBonus)) * rewardModBase)
  
  const statComponent = 0.1 + (WIS + VIT) / 1222.22 + GrdSkl / 244.44;
  const divisor = (300 - (50 * geneBonus)) * rewardModBase;
  
  // Pool reward data (rewardPool * poolAllocation * LPowned already calculated in poolData)
  const poolRewardFactor = poolData.poolRewardFactor || 0;
  
  // Calculate earn rate per stamina
  const earnRatePerStamina = annealingFactor * poolRewardFactor * statComponent / divisor;
  
  // Minimum reward: 0.0002 per stamina (when Quest Fund >= 420,000 tokens)
  const minRewardPerStamina = 0.0002;
  const finalEarnRate = Math.max(earnRatePerStamina, minRewardPerStamina);
  
  // Quest uses 5 stamina by default
  const STAMINA_PER_QUEST = 5;
  
  // First hero gets CRYSTAL, second gets JEWEL (pool specific)
  let crystalsPerQuest = finalEarnRate * STAMINA_PER_QUEST;
  let jewelPerQuest = 0; // For second hero in pool (not implemented yet)
  
  // Pet bonus (gardening pets provide % boost to yields)
  const petBonus = (pet && pet.gatheringType === 'Gardening') 
    ? (1 + pet.gatheringBonusScalar / 100) 
    : 1.0;
  
  // Apply pet bonus
  crystalsPerQuest *= petBonus;
  jewelPerQuest *= petBonus;
  
  // Calculate total APR if pool has it (ensure it's a number)
  const totalAPR = Number(poolData.totalAPR) || 0;
  
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
 * @param {Array<Object>} pools - Pool analytics data (optional, will fetch from cache if not provided)
 * @returns {Promise<Object>} Current assignment analysis
 */
export async function analyzeCurrentAssignments(walletAddress, pools = null) {
  try {
    console.log(`[GardenAnalyzer] Analyzing current assignments for ${walletAddress}...`);
    
    // Fetch all heroes owned by wallet (increase limit to 2000 to ensure we get all of them)
    const heroes = await getHeroesByOwner(walletAddress, 2000);
    console.log(`[GardenAnalyzer] Found ${heroes.length} heroes`);
    
    // Fetch all pets owned by wallet
    const pets = await fetchPetsForWallet(walletAddress);
    console.log(`[GardenAnalyzer] Found ${pets.length} pets`);
    
    // Map pets to heroes
    const heroIds = heroes.map(h => h.id);
    const heroToPet = mapPetsToHeroes(heroIds, pets);
    
    // Get pool analytics data (from parameter or cache)
    let poolData;
    if (pools) {
      poolData = pools;
    } else {
      const poolCache = getCachedPoolAnalytics();
      if (!poolCache || !poolCache.data) {
        throw new Error('Pool cache not ready - please try again in a moment');
      }
      poolData = poolCache.data;
    }
    
    // Analyze current assignments by checking actual quest data from blockchain
    const assignments = [];
    
    console.log(`[GardenAnalyzer] Checking all ${heroes.length} heroes for gardening assignments...`);
    const heroIdList = heroIds.join(', ');
    console.log(`[GardenAnalyzer] Hero IDs: ${heroIdList}`);
    
    // Check ALL heroes for gardening assignments (not just those with currentQuest set)
    // This is critical for expeditions which may not populate currentQuest in GraphQL
    const gardeningAssignments = [];
    let expeditionCount = 0;
    let regularQuestCount = 0;
    
    for (const hero of heroes) {
      try {
        const assignment = await getHeroGardeningAssignment(hero.id);
        if (assignment) {
          gardeningAssignments.push({
            hero,
            poolId: assignment.poolId,
            questDetails: assignment.questDetails,
            isExpedition: assignment.isExpedition,
            staminaUsed: assignment.staminaUsed
          });
          
          if (assignment.isExpedition) {
            expeditionCount++;
          } else {
            regularQuestCount++;
          }
        }
      } catch (err) {
        console.error(`[GardenAnalyzer] Error checking hero #${hero.id}:`, err.message);
      }
    }
    
    console.log(`[GardenAnalyzer] ✅ GARDENING Detection Summary:`);
    console.log(`  - Total heroes checked: ${heroes.length}`);
    console.log(`  - Gardening expeditions: ${expeditionCount}`);
    console.log(`  - Gardening regular quests: ${regularQuestCount}`);
    console.log(`  - Total gardening heroes: ${gardeningAssignments.length}`);
    
    // Build detailed assignments with pool data and yield calculations
    for (const { hero, poolId, isExpedition, staminaUsed } of gardeningAssignments) {
      const pet = heroToPet.get(hero.id);
      
      // Find the exact pool they're assigned to
      const pool = poolData.find(p => p.pid === poolId);
      
      if (pool) {
        const heroYield = calculateHeroYield(hero, pet, pool);
        
        assignments.push({
          hero: {
            id: hero.id,
            level: hero.level,
            vitality: hero.vitality,
            wisdom: hero.wisdom,
            gardening: hero.gardening,
            professionStr: hero.professionStr
          },
          pet: pet || null,
          pool: {
            pid: pool.pid,
            pair: pool.pair,
            totalAPR: pool.totalAPR
          },
          yield: heroYield,
          staminaUsed: staminaUsed || 5,
          isExpedition: isExpedition || false
        });
      }
    }
    
    // Calculate total current APR
    const totalCurrentAPR = assignments.reduce((sum, a) => sum + a.yield.totalAPR, 0);
    
    return {
      totalHeroes: heroes.length,
      totalPets: pets.length,
      activeGardeningHeroes: gardeningAssignments.length,
      assignments,
      totalCurrentAPR,
      heroes, // Include all heroes for optimization
      pets,   // Include all pets for optimization
      pools: poolData // Include pool data
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
