// src/etl/extractors/epicFeatsExtractor.ts
// Extracts derived epic feats data for ETL pipeline
// Computes boolean unlocks for rare, account-defining achievements

import type { ExtractedEpicFeatsData, WalletContext, FullExtractResult } from '../types.js';
import { db } from '../../../server/db.js';
import { sql } from 'drizzle-orm';

// All DFK hero classes for eternal collector check
const ALL_HERO_CLASSES = [
  'warrior', 'knight', 'thief', 'archer', 'priest', 'wizard', 'monk', 'pirate',
  'berserker', 'seer', 'legionnaire', 'scholar', 'paladin', 'darkKnight', 'summoner', 'ninja',
  'shapeshifter', 'bard', 'dragoon', 'sage', 'spellbow', 'dreadKnight'
];

// All pet families for mythic menagerie check
const ALL_PET_FAMILIES = [
  'dreadAnt', 'bat', 'cat', 'dog', 'frog', 'phoenix', 'spider', 'turtle'
];

// Minimum stake duration for crowned jeweler (1000 days)
const CROWNED_JEWELER_DAYS = 1000;

// Minimum upward mutations for worldforged summoner
const WORLDFORGED_MUTATIONS = 4;

export async function extractEpicFeatsData(
  ctx: WalletContext, 
  fullData?: FullExtractResult
): Promise<ExtractedEpicFeatsData> {
  const wallet = ctx.walletAddress.toLowerCase();
  const clusterKey = ctx.clusterKey;
  
  try {
    // 1. Vangardian: Check if METIS mastery is complete (all METIS categories at exalted)
    let vangardianUnlocked = false;
    if (fullData) {
      // Need patrol wins, elite wins, shells, influence, and tournament participation
      const hasPatrol = fullData.metisPatrol.wins >= 100;
      const hasElite = fullData.metisPatrol.eliteWins >= 25;
      const hasShells = fullData.shells.shellsCollected >= 500;
      const hasInfluence = fullData.influence.betsWon >= 50;
      const hasTournament = fullData.tournaments.entries >= 10 && fullData.tournaments.topFinish;
      
      vangardianUnlocked = hasPatrol && hasElite && hasShells && hasInfluence && hasTournament;
    }
    
    // 2. Worldforged Summoner: Check for DK with 4+ upward mutations
    // Uses fullData.summons which is already cluster-aggregated
    let worldforgedSummonerUnlocked = false;
    if (fullData && fullData.summons) {
      // Heuristic: Player has summoned DreadKnights + achieved mythic rarity summons
      // DreadKnight summons require significant upward mutations, mythic rarity confirms high-tier outcomes
      worldforgedSummonerUnlocked = fullData.summons.summonsDreadknight >= 1 && fullData.summons.summonsMythicRarity >= 1;
    }
    
    // 3. Grandmaster Geneweaver: Check for 3-generation mutation chain
    // Uses fullData.summons which is already cluster-aggregated
    let grandmasterGeneweaverUnlocked = false;
    if (fullData && fullData.summons) {
      // Heuristic: Player has achieved multiple high-tier gene summons + has trifecta ultra-rare
      // This indicates successful multi-generation breeding programs
      grandmasterGeneweaverUnlocked = fullData.summons.summonsHighTierGenes >= 10 && fullData.summons.hasTrifectaUltraRare;
    }
    
    // 4. Eternal Collector: Check for mythic hero of every class
    let eternalCollectorUnlocked = false;
    if (fullData && fullData.heroes.heroes.length > 0) {
      const RARITY_MYTHIC = 4;
      const mythicClasses = new Set<string>();
      
      for (const hero of fullData.heroes.heroes) {
        if (hero.rarity === RARITY_MYTHIC) {
          mythicClasses.add(hero.mainClass.toLowerCase());
        }
      }
      
      // Check if all classes are represented
      eternalCollectorUnlocked = ALL_HERO_CLASSES.every(cls => mythicClasses.has(cls.toLowerCase()));
    }
    
    // 5. Crowned Jeweler: Check for 1000+ days continuous stake
    let crownedJewelerUnlocked = false;
    if (fullData && fullData.staking.stakeDurationDays >= CROWNED_JEWELER_DAYS) {
      crownedJewelerUnlocked = true;
    }
    
    // 6. Mythic Menagerie: Check for Odd/Ultra-Odd pet from every family
    // Uses fullData.pets.oddPetFamilies which is cluster-aggregated by petExtractor
    let mythicMenagerieUnlocked = false;
    if (fullData && fullData.pets && fullData.pets.oddPetFamilies) {
      const oddFamilies = new Set(fullData.pets.oddPetFamilies.map((f: string) => f.toLowerCase()));
      // Check if all known pet families are represented with odd variants
      mythicMenagerieUnlocked = ALL_PET_FAMILIES.every(
        fam => oddFamilies.has(fam.toLowerCase())
      );
    }
    
    return {
      vangardianUnlocked,
      worldforgedSummonerUnlocked,
      grandmasterGeneweaverUnlocked,
      eternalCollectorUnlocked,
      crownedJewelerUnlocked,
      mythicMenagerieUnlocked,
    };
  } catch (err) {
    console.warn(`[EpicFeatsExtractor] Error extracting epic feats data:`, err);
    return {
      vangardianUnlocked: false,
      worldforgedSummonerUnlocked: false,
      grandmasterGeneweaverUnlocked: false,
      eternalCollectorUnlocked: false,
      crownedJewelerUnlocked: false,
      mythicMenagerieUnlocked: false,
    };
  }
}
