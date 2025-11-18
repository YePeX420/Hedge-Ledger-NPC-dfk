/**
 * Garden Optimizer
 * 
 * Optimizes hero-to-pool assignments for maximum yield.
 * Implements greedy algorithm: best heroes → best pools.
 */

import {
  scoreHeroForGardening,
  calculateHeroYield,
  rankPoolsByYieldPotential
} from './garden-analyzer.js';
import { getGardeningPets, getTradingPets } from './pet-data.js';

/**
 * Optimize hero assignments across garden pools
 * 
 * Algorithm:
 * 1. Score all heroes by gardening effectiveness
 * 2. Rank pools by yield potential (emission-dominant first)
 * 3. Assign best heroes to best pools
 * 4. Match gardening pets to emission pools, trading pets to fee pools
 * 
 * @param {Array<Object>} heroes - All heroes owned by user
 * @param {Array<Object>} pets - All pets owned by user
 * @param {Array<Object>} pools - All garden pools with analytics
 * @param {number} maxHeroes - Maximum number of heroes to assign (default: 10)
 * @returns {Object} Optimized assignments
 */
export function optimizeHeroAssignments(heroes, pets, pools, maxHeroes = 10) {
  console.log(`[Optimizer] Optimizing assignments for ${heroes.length} heroes, ${pets.length} pets, ${pools.length} pools`);
  
  // Step 1: Score all heroes
  const scoredHeroes = heroes
    .map(hero => ({
      hero,
      score: scoreHeroForGardening(hero)
    }))
    .filter(h => h.score > 0) // Only heroes with gardening potential
    .sort((a, b) => b.score - a.score); // Best heroes first
  
  console.log(`[Optimizer] ${scoredHeroes.length} heroes scored for gardening`);
  
  // Step 2: Rank pools by yield potential
  const rankedPools = rankPoolsByYieldPotential(pools);
  console.log(`[Optimizer] Ranked ${rankedPools.length} pools by yield`);
  
  // Step 3: Categorize pets
  const gardeningPets = getGardeningPets(pets);
  const tradingPets = getTradingPets(pets);
  console.log(`[Optimizer] ${gardeningPets.length} gardening pets, ${tradingPets.length} trading pets`);
  
  // Step 4: Assign heroes to pools (greedy algorithm)
  const assignments = [];
  const usedPets = new Set();
  
  const heroLimit = Math.min(maxHeroes, scoredHeroes.length, rankedPools.length);
  
  for (let i = 0; i < heroLimit; i++) {
    const { hero, score } = scoredHeroes[i];
    const pool = rankedPools[i];
    
    // Determine pool type (emission-dominant vs fee-dominant)
    const emissionRatio = pool.emissionAPR / (pool.totalAPR || 1);
    const isEmissionDominant = emissionRatio > 0.6;
    
    // Select best pet for this pool type
    let selectedPet = null;
    
    if (isEmissionDominant && gardeningPets.length > 0) {
      // Emission pools: use gardening pets
      for (const pet of gardeningPets) {
        if (!usedPets.has(pet.id)) {
          selectedPet = pet;
          usedPets.add(pet.id);
          break;
        }
      }
    } else if (!isEmissionDominant && tradingPets.length > 0) {
      // Fee pools: use trading pets
      for (const pet of tradingPets) {
        if (!usedPets.has(pet.id)) {
          selectedPet = pet;
          usedPets.add(pet.id);
          break;
        }
      }
    }
    
    // If no pet matched the pool type, try the other type
    if (!selectedPet) {
      const allAvailablePets = [...gardeningPets, ...tradingPets];
      for (const pet of allAvailablePets) {
        if (!usedPets.has(pet.id)) {
          selectedPet = pet;
          usedPets.add(pet.id);
          break;
        }
      }
    }
    
    // Calculate yield with this hero+pet+pool combination
    const heroYield = calculateHeroYield(hero, selectedPet, pool);
    
    assignments.push({
      hero: {
        id: hero.id,
        level: hero.level,
        intelligence: hero.intelligence,
        wisdom: hero.wisdom,
        vitality: hero.vitality,
        gardening: hero.gardening,
        passive1: hero.passive1?.name,
        passive2: hero.passive2?.name,
        score
      },
      pet: selectedPet ? {
        id: selectedPet.id,
        gatheringType: selectedPet.gatheringType,
        gatheringBonusScalar: selectedPet.gatheringBonusScalar,
        shiny: selectedPet.shiny
      } : null,
      pool: {
        pid: pool.pid,
        pair: pool.pair,
        totalAPR: pool.totalAPR,
        emissionAPR: pool.emissionAPR,
        feeAPR: pool.feeAPR,
        emissionRatio
      },
      yield: heroYield
    });
  }
  
  // Calculate total optimized APR
  const totalOptimizedAPR = assignments.reduce((sum, a) => sum + a.yield.totalAPR, 0);
  
  console.log(`[Optimizer] Created ${assignments.length} optimized assignments`);
  console.log(`[Optimizer] Total optimized APR: ${totalOptimizedAPR.toFixed(2)}%`);
  
  return {
    assignments,
    totalOptimizedAPR,
    heroesUsed: assignments.length,
    petsUsed: assignments.filter(a => a.pet).length,
    unassignedHeroes: heroes.length - assignments.length,
    unassignedPets: pets.length - assignments.filter(a => a.pet).length
  };
}

/**
 * Calculate improvement between current and optimized state
 * 
 * @param {Object} currentState - Current assignments analysis
 * @param {Object} optimizedState - Optimized assignments
 * @returns {Object} Improvement metrics
 */
export function calculateImprovement(currentState, optimizedState) {
  const currentAPR = currentState.totalCurrentAPR || 0;
  const optimizedAPR = optimizedState.totalOptimizedAPR || 0;
  
  const absoluteImprovement = optimizedAPR - currentAPR;
  const percentageImprovement = currentAPR > 0 
    ? (absoluteImprovement / currentAPR) * 100 
    : 0;
  
  return {
    currentAPR,
    optimizedAPR,
    absoluteImprovement,
    percentageImprovement: Math.round(percentageImprovement * 10) / 10
  };
}
