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

export async function extractAllData(ctx: WalletContext): Promise<FullExtractResult> {
  console.log(`[ETL:Extract] Starting full extraction for wallet ${ctx.walletAddress}`);
  
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
  
  const summons = await extractSummonData(ctx, heroes);
  
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
};
