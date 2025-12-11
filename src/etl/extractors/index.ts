// src/etl/extractors/index.ts
// Main extractor orchestrator

import type { WalletContext, FullExtractResult } from '../types.js';
import { extractHeroData } from './heroExtractor.js';
import { extractQuestData } from './questExtractor.js';
import { extractSummonData } from './summonExtractor.js';
import { extractPetData } from './petExtractor.js';
import { extractMeditationData } from './meditationExtractor.js';
import { extractGardenData } from './gardenExtractor.js';
import { extractPortfolioData } from './portfolioExtractor.js';
import { extractDiscordData } from './discordExtractor.js';
import { extractPaymentData } from './paymentExtractor.js';
import { extractHuntingData } from './huntingExtractor.js';
import { extractPvpData } from './pvpExtractor.js';
import { extractLpData } from './lpExtractor.js';
import { extractStakingData } from './stakingExtractor.js';
// Phase 5 - METIS Systems
import { extractMetisPatrolData } from './metisPatrolExtractor.js';
import { extractShellData } from './shellExtractor.js';
import { extractInfluenceData } from './influenceExtractor.js';
import { extractTournamentData } from './tournamentExtractor.js';
// Phase 6 - Derived
import { extractMetaProfileData } from './metaProfileExtractor.js';
import { extractEpicFeatsData } from './epicFeatsExtractor.js';

export async function extractAllData(ctx: WalletContext): Promise<FullExtractResult> {
  console.log(`[ETL:Extract] Starting full extraction for wallet ${ctx.walletAddress}`);
  
  // Phase 1-4: Core extractors
  const [heroes, quests, pets, meditation, gardens, portfolio, discord, payments, hunting, pvp, lp, staking] = await Promise.all([
    extractHeroData(ctx),
    extractQuestData(ctx),
    extractPetData(ctx),
    extractMeditationData(ctx),
    extractGardenData(ctx),
    extractPortfolioData(ctx),
    extractDiscordData(ctx),
    extractPaymentData(ctx),
    extractHuntingData(ctx),
    extractPvpData(ctx),
    extractLpData(ctx),
    extractStakingData(ctx),
  ]);
  
  // Summons need hero data
  const summons = await extractSummonData(ctx, heroes);
  
  // Phase 5: METIS Systems (parallel)
  const [metisPatrol, shells, influence, tournaments] = await Promise.all([
    extractMetisPatrolData(ctx),
    extractShellData(ctx),
    extractInfluenceData(ctx),
    extractTournamentData(ctx),
  ]);
  
  // Build partial result for derived extractors
  const partialResult = {
    heroes, quests, summons, pets, meditation, gardens, portfolio, discord, payments,
    hunting, pvp, lp, staking, metisPatrol, shells, influence, tournaments,
    metaProfile: { prestigeUnlockedCount: 0, exaltedCategoryCount: 0, summoningPrestigeScore: 0, pvpMasteryScore: 0, metisMasteryScore: 0 },
    epicFeats: { vangardianUnlocked: false, worldforgedSummonerUnlocked: false, grandmasterGeneweaverUnlocked: false, eternalCollectorUnlocked: false, crownedJewelerUnlocked: false, mythicMenagerieUnlocked: false },
    extractedAt: new Date(),
  };
  
  // Phase 6: Derived extractors (need previous data)
  const [metaProfile, epicFeats] = await Promise.all([
    extractMetaProfileData(ctx, partialResult),
    extractEpicFeatsData(ctx, partialResult),
  ]);
  
  console.log(`[ETL:Extract] Extraction complete for wallet ${ctx.walletAddress}:`, {
    heroCount: heroes.heroCount,
    questsTotal: quests.professionQuestsTotal + quests.trainingQuestsTotal,
    summons: summons.totalSummons,
    petCount: pets.petCount,
    lpValue: gardens.totalLPValue,
    huntingWins: hunting.wins,
    pvpWins: pvp.wins,
    lpUsdValue: lp.lpUsdValue,
    stakingValue: staking.stakeUsdValue,
    metisPatrolWins: metisPatrol.wins,
    shellsCollected: shells.shellsCollected,
    tournamentEntries: tournaments.entries,
  });
  
  return {
    heroes,
    quests,
    summons,
    pets,
    meditation,
    gardens,
    portfolio,
    discord,
    payments,
    hunting,
    pvp,
    lp,
    staking,
    metisPatrol,
    shells,
    influence,
    tournaments,
    metaProfile,
    epicFeats,
    extractedAt: new Date(),
  };
}

export {
  extractHeroData,
  extractQuestData,
  extractSummonData,
  extractPetData,
  extractMeditationData,
  extractGardenData,
  extractPortfolioData,
  extractDiscordData,
  extractPaymentData,
  extractHuntingData,
  extractPvpData,
  extractLpData,
  extractStakingData,
  // Phase 5
  extractMetisPatrolData,
  extractShellData,
  extractInfluenceData,
  extractTournamentData,
  // Phase 6
  extractMetaProfileData,
  extractEpicFeatsData,
};
