// src/services/similarityScoring.ts
// Hero similarity scoring for "Battle-Ready Heroes" recommendations
// Compares marketplace heroes against PVP battle winners using configurable weights

import { db } from '../../server/db';
import { 
  pvpSimilarityConfig, 
  heroTournamentSnapshots,
  tournamentPlacements,
  pvpTournaments,
  PvpSimilarityConfig,
} from '../../shared/schema';
import { eq, desc, and, gte, lte, inArray } from 'drizzle-orm';
import Decimal from 'decimal.js';

// Default weights if no config exists
const DEFAULT_WEIGHTS = {
  statsWeight: 0.40,
  activeAbilitiesWeight: 0.25,
  passiveAbilitiesWeight: 0.15,
  classMatchWeight: 0.10,
  rarityMatchWeight: 0.05,
  geneQualityWeight: 0.05,
  statWeights: {
    strength: 0.15,
    agility: 0.15,
    dexterity: 0.10,
    vitality: 0.15,
    endurance: 0.10,
    intelligence: 0.15,
    wisdom: 0.10,
    luck: 0.10,
  },
};

// Hero data interface for scoring
export interface HeroForScoring {
  heroId?: number;
  rarity: number;
  mainClass: string;
  subClass?: string | null;
  level: number;
  strength: number;
  agility: number;
  dexterity: number;
  vitality: number;
  endurance: number;
  intelligence: number;
  wisdom: number;
  luck: number;
  active1?: string | number | null;
  active2?: string | number | null;
  passive1?: string | number | null;
  passive2?: string | number | null;
  geneQuality?: {
    basicCount?: number;
    advancedCount?: number;
    eliteCount?: number;
    exaltedCount?: number;
  };
}

export interface SimilarityResult {
  heroId: number;
  overallScore: number;
  statScore: number;
  activeAbilityScore: number;
  passiveAbilityScore: number;
  classMatchScore: number;
  rarityMatchScore: number;
  geneQualityScore: number;
  matchedWinners: number;
  bestMatch?: {
    tournamentId: number;
    placement: string;
    heroId: number;
    similarity: number;
  };
}

// Get current similarity config
async function getConfig(): Promise<PvpSimilarityConfig | null> {
  const configs = await db
    .select()
    .from(pvpSimilarityConfig)
    .where(eq(pvpSimilarityConfig.configName, 'default'))
    .limit(1);
  
  return configs[0] || null;
}

// Normalize a value to 0-1 range based on min/max
function normalize(value: number, min: number, max: number): number {
  if (max === min) return 1;
  return Math.max(0, Math.min(1, (value - min) / (max - min)));
}

// Calculate stat similarity between two heroes (0-1)
function calculateStatSimilarity(
  hero: HeroForScoring, 
  winner: typeof heroTournamentSnapshots.$inferSelect,
  statWeights: typeof DEFAULT_WEIGHTS.statWeights
): number {
  const stats = ['strength', 'agility', 'dexterity', 'vitality', 'endurance', 'intelligence', 'wisdom', 'luck'] as const;
  
  let totalWeight = 0;
  let weightedSimilarity = 0;
  
  for (const stat of stats) {
    const heroStat = hero[stat] || 0;
    const winnerStat = winner[stat] || 0;
    const weight = statWeights[stat] || 0.125;
    
    // Use ratio-based similarity (higher of the two as denominator)
    const maxStat = Math.max(heroStat, winnerStat, 1);
    const minStat = Math.min(heroStat, winnerStat);
    const similarity = minStat / maxStat;
    
    weightedSimilarity += similarity * weight;
    totalWeight += weight;
  }
  
  return totalWeight > 0 ? weightedSimilarity / totalWeight : 0;
}

// Calculate active ability similarity (0-1)
function calculateActiveAbilitySimilarity(
  hero: HeroForScoring,
  winner: typeof heroTournamentSnapshots.$inferSelect
): number {
  const heroAbilities = new Set([
    String(hero.active1 || ''),
    String(hero.active2 || ''),
  ].filter(a => a));
  
  const winnerAbilities = new Set([
    String(winner.active1 || ''),
    String(winner.active2 || ''),
  ].filter(a => a));
  
  if (winnerAbilities.size === 0) return 1;
  
  let matches = 0;
  Array.from(heroAbilities).forEach(ability => {
    if (winnerAbilities.has(ability)) matches++;
  });
  
  return matches / winnerAbilities.size;
}

// Calculate passive ability similarity (0-1)
function calculatePassiveAbilitySimilarity(
  hero: HeroForScoring,
  winner: typeof heroTournamentSnapshots.$inferSelect
): number {
  const heroPassives = new Set([
    String(hero.passive1 || ''),
    String(hero.passive2 || ''),
  ].filter(a => a));
  
  const winnerPassives = new Set([
    String(winner.passive1 || ''),
    String(winner.passive2 || ''),
  ].filter(a => a));
  
  if (winnerPassives.size === 0) return 1;
  
  let matches = 0;
  Array.from(heroPassives).forEach(passive => {
    if (winnerPassives.has(passive)) matches++;
  });
  
  return matches / winnerPassives.size;
}

// Calculate class match (0, 0.5, or 1)
function calculateClassMatch(
  hero: HeroForScoring,
  winner: typeof heroTournamentSnapshots.$inferSelect
): number {
  const mainClassMatch = hero.mainClass?.toLowerCase() === winner.mainClass?.toLowerCase();
  const subClassMatch = hero.subClass?.toLowerCase() === winner.subClass?.toLowerCase();
  
  if (mainClassMatch && subClassMatch) return 1;
  if (mainClassMatch || subClassMatch) return 0.5;
  return 0;
}

// Calculate rarity match (0, 0.5, or 1)
function calculateRarityMatch(
  hero: HeroForScoring,
  winner: typeof heroTournamentSnapshots.$inferSelect
): number {
  if (hero.rarity === winner.rarity) return 1;
  if (Math.abs(hero.rarity - (winner.rarity || 0)) === 1) return 0.5;
  return 0;
}

// Calculate gene quality score (placeholder - can be enhanced)
function calculateGeneQualityScore(hero: HeroForScoring): number {
  if (!hero.geneQuality) return 0.5; // Neutral score if no gene data
  
  const { basicCount = 0, advancedCount = 0, eliteCount = 0, exaltedCount = 0 } = hero.geneQuality;
  const totalGenes = basicCount + advancedCount + eliteCount + exaltedCount;
  
  if (totalGenes === 0) return 0.5;
  
  // Weight by gene quality
  const score = (
    basicCount * 0.25 +
    advancedCount * 0.5 +
    eliteCount * 0.75 +
    exaltedCount * 1.0
  ) / totalGenes;
  
  return score;
}

// Calculate overall similarity score for a hero against all battle winners
export async function calculateHeroSimilarity(
  hero: HeroForScoring,
  options: {
    format?: string;
    levelRange?: { min: number; max: number };
    placementFilter?: string[];
    limit?: number;
  } = {}
): Promise<SimilarityResult> {
  const config = await getConfig();
  const weights = {
    statsWeight: config ? new Decimal(config.statsWeight ?? 0.4).toNumber() : DEFAULT_WEIGHTS.statsWeight,
    activeAbilitiesWeight: config ? new Decimal(config.activeAbilitiesWeight ?? 0.25).toNumber() : DEFAULT_WEIGHTS.activeAbilitiesWeight,
    passiveAbilitiesWeight: config ? new Decimal(config.passiveAbilitiesWeight ?? 0.15).toNumber() : DEFAULT_WEIGHTS.passiveAbilitiesWeight,
    classMatchWeight: config ? new Decimal(config.classMatchWeight ?? 0.1).toNumber() : DEFAULT_WEIGHTS.classMatchWeight,
    rarityMatchWeight: config ? new Decimal(config.rarityMatchWeight ?? 0.05).toNumber() : DEFAULT_WEIGHTS.rarityMatchWeight,
    geneQualityWeight: config ? new Decimal(config.geneQualityWeight ?? 0.05).toNumber() : DEFAULT_WEIGHTS.geneQualityWeight,
    statWeights: (config?.statWeights as typeof DEFAULT_WEIGHTS.statWeights) || DEFAULT_WEIGHTS.statWeights,
  };
  
  // Fetch relevant winner snapshots
  const placements = options.placementFilter || ['winner'];
  const limit = options.limit || 100;
  
  const winners = await db
    .select({
      snapshot: heroTournamentSnapshots,
      placement: tournamentPlacements,
      tournament: pvpTournaments,
    })
    .from(heroTournamentSnapshots)
    .innerJoin(tournamentPlacements, eq(heroTournamentSnapshots.placementId, tournamentPlacements.id))
    .innerJoin(pvpTournaments, eq(tournamentPlacements.tournamentId, pvpTournaments.tournamentId))
    .where(inArray(tournamentPlacements.placement, placements))
    .orderBy(desc(pvpTournaments.tournamentId))
    .limit(limit);
  
  if (winners.length === 0) {
    return {
      heroId: hero.heroId || 0,
      overallScore: 0,
      statScore: 0,
      activeAbilityScore: 0,
      passiveAbilityScore: 0,
      classMatchScore: 0,
      rarityMatchScore: 0,
      geneQualityScore: 0,
      matchedWinners: 0,
    };
  }
  
  // Calculate similarity against each winner
  let totalStatScore = 0;
  let totalActiveScore = 0;
  let totalPassiveScore = 0;
  let totalClassScore = 0;
  let totalRarityScore = 0;
  let bestSimilarity = 0;
  let bestMatch: SimilarityResult['bestMatch'] | undefined;
  
  for (const { snapshot, placement, tournament } of winners) {
    const statScore = calculateStatSimilarity(hero, snapshot, weights.statWeights);
    const activeScore = calculateActiveAbilitySimilarity(hero, snapshot);
    const passiveScore = calculatePassiveAbilitySimilarity(hero, snapshot);
    const classScore = calculateClassMatch(hero, snapshot);
    const rarityScore = calculateRarityMatch(hero, snapshot);
    
    totalStatScore += statScore;
    totalActiveScore += activeScore;
    totalPassiveScore += passiveScore;
    totalClassScore += classScore;
    totalRarityScore += rarityScore;
    
    // Calculate overall similarity for this comparison
    const overallSimilarity = (
      statScore * weights.statsWeight +
      activeScore * weights.activeAbilitiesWeight +
      passiveScore * weights.passiveAbilitiesWeight +
      classScore * weights.classMatchWeight +
      rarityScore * weights.rarityMatchWeight
    );
    
    if (overallSimilarity > bestSimilarity) {
      bestSimilarity = overallSimilarity;
      bestMatch = {
        tournamentId: tournament.tournamentId,
        placement: placement.placement,
        heroId: snapshot.heroId,
        similarity: overallSimilarity,
      };
    }
  }
  
  const count = winners.length;
  const avgStatScore = totalStatScore / count;
  const avgActiveScore = totalActiveScore / count;
  const avgPassiveScore = totalPassiveScore / count;
  const avgClassScore = totalClassScore / count;
  const avgRarityScore = totalRarityScore / count;
  const geneScore = calculateGeneQualityScore(hero);
  
  // Calculate final overall score (normalize weights to ensure score is 0-1)
  const totalWeight = 
    weights.statsWeight + 
    weights.activeAbilitiesWeight + 
    weights.passiveAbilitiesWeight + 
    weights.classMatchWeight + 
    weights.rarityMatchWeight + 
    weights.geneQualityWeight;
  
  const normalizedWeights = totalWeight > 0 ? {
    stats: weights.statsWeight / totalWeight,
    active: weights.activeAbilitiesWeight / totalWeight,
    passive: weights.passiveAbilitiesWeight / totalWeight,
    classMatch: weights.classMatchWeight / totalWeight,
    rarity: weights.rarityMatchWeight / totalWeight,
    gene: weights.geneQualityWeight / totalWeight,
  } : {
    stats: 0.4, active: 0.25, passive: 0.15, classMatch: 0.1, rarity: 0.05, gene: 0.05,
  };
  
  const overallScore = (
    avgStatScore * normalizedWeights.stats +
    avgActiveScore * normalizedWeights.active +
    avgPassiveScore * normalizedWeights.passive +
    avgClassScore * normalizedWeights.classMatch +
    avgRarityScore * normalizedWeights.rarity +
    geneScore * normalizedWeights.gene
  );
  
  return {
    heroId: hero.heroId || 0,
    overallScore,
    statScore: avgStatScore,
    activeAbilityScore: avgActiveScore,
    passiveAbilityScore: avgPassiveScore,
    classMatchScore: avgClassScore,
    rarityMatchScore: avgRarityScore,
    geneQualityScore: geneScore,
    matchedWinners: count,
    bestMatch,
  };
}

// Score multiple heroes and return ranked results
export async function scoreMarketplaceHeroes(
  heroes: HeroForScoring[],
  options: {
    format?: string;
    levelRange?: { min: number; max: number };
    placementFilter?: string[];
    minScore?: number;
  } = {}
): Promise<SimilarityResult[]> {
  const results: SimilarityResult[] = [];
  
  for (const hero of heroes) {
    const score = await calculateHeroSimilarity(hero, options);
    if (!options.minScore || score.overallScore >= options.minScore) {
      results.push(score);
    }
  }
  
  // Sort by overall score descending
  results.sort((a, b) => b.overallScore - a.overallScore);
  
  return results;
}

// CRUD operations for similarity config
export async function getSimilarityConfig(configName: string = 'default'): Promise<PvpSimilarityConfig | null> {
  const configs = await db
    .select()
    .from(pvpSimilarityConfig)
    .where(eq(pvpSimilarityConfig.configName, configName))
    .limit(1);
  
  return configs[0] || null;
}

export async function updateSimilarityConfig(
  configName: string = 'default',
  updates: Partial<{
    statsWeight: string;
    activeAbilitiesWeight: string;
    passiveAbilitiesWeight: string;
    classMatchWeight: string;
    rarityMatchWeight: string;
    geneQualityWeight: string;
    statWeights: typeof DEFAULT_WEIGHTS.statWeights;
  }>
): Promise<PvpSimilarityConfig> {
  // Check if config exists
  const existing = await getSimilarityConfig(configName);
  
  if (existing) {
    await db
      .update(pvpSimilarityConfig)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(pvpSimilarityConfig.configName, configName));
  } else {
    await db.insert(pvpSimilarityConfig).values({
      configName,
      ...updates,
    });
  }
  
  return (await getSimilarityConfig(configName))!;
}

// Get battle-ready hero recommendations for a specific class/level range
export async function getBattleReadyRecommendations(options: {
  mainClass?: string;
  levelMin?: number;
  levelMax?: number;
  rarityMin?: number;
  limit?: number;
}): Promise<{
  recommendations: Array<{
    heroId: number;
    mainClass: string;
    level: number;
    rarity: number;
    placement: string;
    tournamentId: number;
    combatPowerScore: number | null;
    stats: {
      strength: number | null;
      agility: number | null;
      dexterity: number | null;
      vitality: number | null;
      endurance: number | null;
      intelligence: number | null;
      wisdom: number | null;
      luck: number | null;
    };
    abilities: {
      active1: string | null;
      active2: string | null;
      passive1: string | null;
      passive2: string | null;
    };
  }>;
  totalWinners: number;
}> {
  const { mainClass, levelMin, levelMax, rarityMin, limit = 50 } = options;
  
  // Get winner snapshots matching criteria
  let query = db
    .select({
      snapshot: heroTournamentSnapshots,
      placement: tournamentPlacements,
    })
    .from(heroTournamentSnapshots)
    .innerJoin(tournamentPlacements, eq(heroTournamentSnapshots.placementId, tournamentPlacements.id))
    .where(eq(tournamentPlacements.placement, 'winner'))
    .orderBy(desc(heroTournamentSnapshots.combatPowerScore))
    .limit(limit);
  
  const results = await query;
  
  // Filter in JS for flexibility
  const filtered = results.filter(({ snapshot }) => {
    if (mainClass && snapshot.mainClass?.toLowerCase() !== mainClass.toLowerCase()) return false;
    if (levelMin && (snapshot.level || 0) < levelMin) return false;
    if (levelMax && (snapshot.level || 0) > levelMax) return false;
    if (rarityMin && (snapshot.rarity || 0) < rarityMin) return false;
    return true;
  });
  
  return {
    recommendations: filtered.map(({ snapshot, placement }) => ({
      heroId: snapshot.heroId,
      mainClass: snapshot.mainClass || '',
      level: snapshot.level || 0,
      rarity: snapshot.rarity || 0,
      placement: placement.placement,
      tournamentId: placement.tournamentId,
      combatPowerScore: snapshot.combatPowerScore,
      stats: {
        strength: snapshot.strength,
        agility: snapshot.agility,
        dexterity: snapshot.dexterity,
        vitality: snapshot.vitality,
        endurance: snapshot.endurance,
        intelligence: snapshot.intelligence,
        wisdom: snapshot.wisdom,
        luck: snapshot.luck,
      },
      abilities: {
        active1: snapshot.active1,
        active2: snapshot.active2,
        passive1: snapshot.passive1,
        passive2: snapshot.passive2,
      },
    })),
    totalWinners: filtered.length,
  };
}
