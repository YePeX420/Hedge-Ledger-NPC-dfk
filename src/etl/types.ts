// src/etl/types.ts
// Core types for the ETL subsystem

export interface WalletContext {
  walletAddress: string;
  userId?: string;
  clusterKey?: string;
  playerId?: number;
}

export interface EtlResult {
  success: boolean;
  wallet: string;
  extractedAt: Date;
  metrics: Record<string, number | string | boolean>;
  errors?: string[];
}

export interface ExtractedHeroData {
  heroCount: number;
  totalLevels: number;
  gen0Count: number;
  classesLevel10Plus: number;
  exaltedGeneHeroCount: number;
  mythicHeroCount: number;
  heroes: Array<{
    id: string;
    normalizedId: string;
    mainClass: string;
    subClass: string;
    profession: string;
    rarity: number;
    level: number;
    generation: number;
    gardening: number;
    mining: number;
    fishing: number;
    foraging: number;
    currentQuest: string | null;
    statGenes: string | null;
    visualGenes: string | null;
  }>;
}

export interface ExtractedQuestData {
  professionQuestsTotal: number;
  trainingQuestsTotal: number;
  trainingCrystalsObtained: number;
  miningQuests: number;
  gardeningQuests: number;
  fishingQuests: number;
  foragingQuests: number;
  questsLast7d: number;
  questsLast30d: number;
}

export interface ExtractedSummonData {
  totalSummons: number;
  summonsDragoon: number;
  summonsDreadknight: number;
  summonsSage: number;
  summonsPaladin: number;
  summonsDarkKnight: number;
  summonsHighTierGenes: number;
  summonsMythicRarity: number;
  hasTrifectaUltraRare: boolean;
}

export interface ExtractedPetData {
  petCount: number;
  gardeningPetCount: number;
}

export interface ExtractedMeditationData {
  crystalsUsedTotal: number;
  totalMeditations: number;
  totalStatGain: number;
  perfectMeditations: number;
}

export interface ExtractedGardenData {
  lpYieldTokenEquivalent: number;
  lpPositions: Array<{
    pid: number;
    pairName: string;
    userShare: string;
    userTVL: string;
  }>;
  totalLPValue: number;
}

export interface ExtractedPortfolioData {
  jewelBalance: number;
  crystalBalance: number;
  cJewelBalance: number;
  jewelEquivalentBalance: number;
}

export interface ExtractedDiscordData {
  messagesToHedge: number;
  hedgeDayStreak: number;
  totalSessions: number;
  accountAgeDays: number;
}

export interface ExtractedPaymentData {
  jewelSentToHedge: number;
}

export interface ExtractedHuntingData {
  wins: number;
  mothercluckerKills: number;
  madBoarKills: number;
  relicsFound: number;
  cluckerMiracle: boolean; // 1 survivor at 1 HP vs Motherclucker
}

export interface ExtractedPvpData {
  matchesPlayed: number;
  wins: number;
  bestWinStreak: number;
  flawlessVictory: boolean; // Win with 0 hero deaths
}

export interface FullExtractResult {
  heroes: ExtractedHeroData;
  quests: ExtractedQuestData;
  summons: ExtractedSummonData;
  pets: ExtractedPetData;
  meditation: ExtractedMeditationData;
  gardens: ExtractedGardenData;
  portfolio: ExtractedPortfolioData;
  discord: ExtractedDiscordData;
  payments: ExtractedPaymentData;
  hunting: ExtractedHuntingData;
  pvp: ExtractedPvpData;
  extractedAt: Date;
}

export interface BehaviorMetrics {
  questDayStreak: number;
  trainingStatMatchPct: number;
  trainingDayStreak: number;
  correctCrystalUsagePct: number;
  questEfficiencyPct: number;
  reinvestRatioPct: number;
  optimizationsCompleted: number;
  professionMatchPct: number;
  professionBonusTriggerPct: number;
  extractorScoreInverted: number;
  longTermActiveDays: number;
  allCategoriesRarePlus: boolean;
}

export interface TransformResult {
  behaviorMetrics: BehaviorMetrics;
  stats30d: {
    questsCompleted: number;
    heroesLeveled: number;
    summonsMade: number;
    lpDeposits: number;
  };
  statsLifetime: {
    totalQuests: number;
    totalSummons: number;
    totalLevelUps: number;
  };
}

export interface LoadResult {
  playerChallengeProgress: number;
  walletActivity: number;
  walletSnapshots: number;
  walletPowerSnapshots: number;
  walletTransferAggregates: number;
}

export interface EtlScheduleConfig {
  incrementalIntervalMinutes: number;
  fullSnapshotCron: string;
}

export const DEFAULT_ETL_CONFIG: EtlScheduleConfig = {
  incrementalIntervalMinutes: 10,
  fullSnapshotCron: '0 3 * * *', // 03:00 UTC daily
};

export type MetricSource = 
  | 'onchain_heroes'
  | 'onchain_quests'
  | 'onchain_summons'
  | 'onchain_summoning'
  | 'onchain_pets'
  | 'onchain_meditation'
  | 'onchain_gardens'
  | 'onchain_portfolio'
  | 'onchain_hunting'
  | 'onchain_pvp'
  | 'onchain_gold'
  | 'onchain_lp'
  | 'onchain_staking'
  | 'behavior_model'
  | 'behavior_events'
  | 'discord_interactions'
  | 'payment_events'
  | 'event_progress'
  | 'seasonal_events'
  | 'meta_profile'
  | 'epic_feats';

export interface MetricDefinition {
  source: MetricSource;
  key: string;
  extractor: (data: FullExtractResult) => number | boolean;
}

export const METRIC_REGISTRY: Record<string, MetricDefinition> = {
  // onchain_heroes metrics
  'onchain_heroes:total_levels': {
    source: 'onchain_heroes',
    key: 'total_levels',
    extractor: (data) => data.heroes.totalLevels,
  },
  'onchain_heroes:classes_level10_plus': {
    source: 'onchain_heroes',
    key: 'classes_level10_plus',
    extractor: (data) => data.heroes.classesLevel10Plus,
  },
  'onchain_heroes:hero_count': {
    source: 'onchain_heroes',
    key: 'hero_count',
    extractor: (data) => data.heroes.heroCount,
  },
  'onchain_heroes:gen0_count': {
    source: 'onchain_heroes',
    key: 'gen0_count',
    extractor: (data) => data.heroes.gen0Count,
  },
  'onchain_heroes:exalted_gene_hero_count': {
    source: 'onchain_heroes',
    key: 'exalted_gene_hero_count',
    extractor: (data) => data.heroes.exaltedGeneHeroCount,
  },
  'onchain_heroes:mythic_hero_count': {
    source: 'onchain_heroes',
    key: 'mythic_hero_count',
    extractor: (data) => data.heroes.mythicHeroCount,
  },

  // onchain_quests metrics
  'onchain_quests:profession_quests_total': {
    source: 'onchain_quests',
    key: 'profession_quests_total',
    extractor: (data) => data.quests.professionQuestsTotal,
  },
  'onchain_quests:training_quests_total': {
    source: 'onchain_quests',
    key: 'training_quests_total',
    extractor: (data) => data.quests.trainingQuestsTotal,
  },
  'onchain_quests:training_crystals_obtained': {
    source: 'onchain_quests',
    key: 'training_crystals_obtained',
    extractor: (data) => data.quests.trainingCrystalsObtained,
  },
  'onchain_quests:mining_quests': {
    source: 'onchain_quests',
    key: 'mining_quests',
    extractor: (data) => data.quests.miningQuests,
  },
  'onchain_quests:gardening_quests': {
    source: 'onchain_quests',
    key: 'gardening_quests',
    extractor: (data) => data.quests.gardeningQuests,
  },
  'onchain_quests:fishing_quests': {
    source: 'onchain_quests',
    key: 'fishing_quests',
    extractor: (data) => data.quests.fishingQuests,
  },
  'onchain_quests:foraging_quests': {
    source: 'onchain_quests',
    key: 'foraging_quests',
    extractor: (data) => data.quests.foragingQuests,
  },

  // onchain_summons metrics
  'onchain_summons:total_summons': {
    source: 'onchain_summons',
    key: 'total_summons',
    extractor: (data) => data.summons.totalSummons,
  },
  'onchain_summons:summons_dragoon': {
    source: 'onchain_summons',
    key: 'summons_dragoon',
    extractor: (data) => data.summons.summonsDragoon,
  },
  'onchain_summons:summons_dreadknight': {
    source: 'onchain_summons',
    key: 'summons_dreadknight',
    extractor: (data) => data.summons.summonsDreadknight,
  },
  'onchain_summons:summons_sage': {
    source: 'onchain_summons',
    key: 'summons_sage',
    extractor: (data) => data.summons.summonsSage,
  },
  'onchain_summons:summons_paladin': {
    source: 'onchain_summons',
    key: 'summons_paladin',
    extractor: (data) => data.summons.summonsPaladin,
  },
  'onchain_summons:summons_dark_knight': {
    source: 'onchain_summons',
    key: 'summons_dark_knight',
    extractor: (data) => data.summons.summonsDarkKnight,
  },
  'onchain_summons:summons_high_tier_genes': {
    source: 'onchain_summons',
    key: 'summons_high_tier_genes',
    extractor: (data) => data.summons.summonsHighTierGenes,
  },
  'onchain_summons:summons_mythic_rarity': {
    source: 'onchain_summons',
    key: 'summons_mythic_rarity',
    extractor: (data) => data.summons.summonsMythicRarity,
  },
  'onchain_summons:has_trifecta_ultra_rare': {
    source: 'onchain_summons',
    key: 'has_trifecta_ultra_rare',
    extractor: (data) => data.summons.hasTrifectaUltraRare,
  },

  // onchain_pets metrics
  'onchain_pets:pet_count': {
    source: 'onchain_pets',
    key: 'pet_count',
    extractor: (data) => data.pets.petCount,
  },

  // onchain_meditation metrics
  'onchain_meditation:crystals_used_total': {
    source: 'onchain_meditation',
    key: 'crystals_used_total',
    extractor: (data) => data.meditation.crystalsUsedTotal,
  },
  'onchain_meditation:total_meditations': {
    source: 'onchain_meditation',
    key: 'total_meditations',
    extractor: (data) => data.meditation.totalMeditations,
  },
  'onchain_meditation:total_stat_gain': {
    source: 'onchain_meditation',
    key: 'total_stat_gain',
    extractor: (data) => data.meditation.totalStatGain,
  },
  'onchain_meditation:perfect_meditations': {
    source: 'onchain_meditation',
    key: 'perfect_meditations',
    extractor: (data) => data.meditation.perfectMeditations,
  },

  // onchain_gardens metrics
  'onchain_gardens:lp_yield_token_equivalent': {
    source: 'onchain_gardens',
    key: 'lp_yield_token_equivalent',
    extractor: (data) => data.gardens.lpYieldTokenEquivalent,
  },

  // onchain_portfolio metrics
  'onchain_portfolio:jewel_equivalent_balance': {
    source: 'onchain_portfolio',
    key: 'jewel_equivalent_balance',
    extractor: (data) => data.portfolio.jewelEquivalentBalance,
  },

  // discord_interactions metrics
  'discord_interactions:messages_to_hedge': {
    source: 'discord_interactions',
    key: 'messages_to_hedge',
    extractor: (data) => data.discord.messagesToHedge,
  },
  'discord_interactions:hedge_day_streak': {
    source: 'discord_interactions',
    key: 'hedge_day_streak',
    extractor: (data) => data.discord.hedgeDayStreak,
  },

  // payment_events metrics
  'payment_events:jewel_sent_to_hedge': {
    source: 'payment_events',
    key: 'jewel_sent_to_hedge',
    extractor: (data) => data.payments.jewelSentToHedge,
  },

  // ============================================
  // BEHAVIOR_EVENTS METRICS (Phase 1 - Implemented)
  // Maps behavior/engagement challenges to discord and wallet activity
  // ============================================
  'behavior_events:active_days': {
    source: 'behavior_events',
    key: 'active_days',
    extractor: (data) => data.discord.totalSessions,
  },
  'behavior_events:discord_engagement_score': {
    source: 'behavior_events',
    key: 'discord_engagement_score',
    extractor: (data) => data.discord.messagesToHedge,
  },
  'behavior_events:account_age_days': {
    source: 'behavior_events',
    key: 'account_age_days',
    extractor: (data) => data.discord.accountAgeDays,
  },

  // ============================================
  // ONCHAIN_SUMMONING METRICS (Phase 4 - Partial)
  // Only metrics with working extractors are registered
  // ============================================
  'onchain_summoning:mutagenic_specialist_count': {
    source: 'onchain_summoning',
    key: 'mutagenic_specialist_count',
    extractor: (data) => data.summons.summonsHighTierGenes,
  },
  'onchain_summoning:mythmaker_count': {
    source: 'onchain_summoning',
    key: 'mythmaker_count',
    extractor: (data) => data.summons.summonsMythicRarity,
  },
  'onchain_summoning:summoner_of_legends_count': {
    source: 'onchain_summoning',
    key: 'summoner_of_legends_count',
    extractor: (data) => data.summons.summonsMythicRarity,
  },
  // NOTE: perfect_pairing_unlocked, royal_lineage_count intentionally NOT added
  // Challenges using them will be skipped until mutation/lineage tracking is built

  // ============================================
  // ONCHAIN_LP METRICS (Phase 8 - Partial)
  // LP/DeFi participation challenges
  // ============================================
  'onchain_lp:total_lp_value': {
    source: 'onchain_lp',
    key: 'total_lp_value',
    extractor: (data) => data.gardens.totalLPValue,
  },
  // NOTE: onchain_lp:active_days intentionally NOT added until LP position tracking is built

  // ============================================
  // ONCHAIN_PETS METRICS (Phase 1 - Implemented)
  // Pet collection challenges
  // ============================================
  'onchain_pets:rarity_score': {
    source: 'onchain_pets',
    key: 'rarity_score',
    extractor: (data) => data.pets.petCount,
  },
  'onchain_pets:gardening_pet_count': {
    source: 'onchain_pets',
    key: 'gardening_pet_count',
    extractor: (data) => data.pets.gardeningPetCount,
  },

  // ============================================
  // ONCHAIN_HUNTING METRICS (Phase 3 - Implemented)
  // Hunting PvE challenge metrics
  // ============================================
  'onchain_hunting:wins': {
    source: 'onchain_hunting',
    key: 'wins',
    extractor: (data) => data.hunting.wins,
  },
  'onchain_hunting:motherclucker_kills': {
    source: 'onchain_hunting',
    key: 'motherclucker_kills',
    extractor: (data) => data.hunting.mothercluckerKills,
  },
  'onchain_hunting:mad_boar_kills': {
    source: 'onchain_hunting',
    key: 'mad_boar_kills',
    extractor: (data) => data.hunting.madBoarKills,
  },
  'onchain_hunting:relics_found': {
    source: 'onchain_hunting',
    key: 'relics_found',
    extractor: (data) => data.hunting.relicsFound,
  },
  'onchain_hunting:clucker_miracle': {
    source: 'onchain_hunting',
    key: 'clucker_miracle',
    extractor: (data) => data.hunting.cluckerMiracle,
  },

  // ============================================
  // ONCHAIN_PVP METRICS (Phase 3 - Implemented)
  // PvP Competition challenge metrics
  // ============================================
  'onchain_pvp:matches_played': {
    source: 'onchain_pvp',
    key: 'matches_played',
    extractor: (data) => data.pvp.matchesPlayed,
  },
  'onchain_pvp:wins': {
    source: 'onchain_pvp',
    key: 'wins',
    extractor: (data) => data.pvp.wins,
  },
  'onchain_pvp:best_win_streak': {
    source: 'onchain_pvp',
    key: 'best_win_streak',
    extractor: (data) => data.pvp.bestWinStreak,
  },
  'onchain_pvp:flawless_victory': {
    source: 'onchain_pvp',
    key: 'flawless_victory',
    extractor: (data) => data.pvp.flawlessVictory,
  },

  // ============================================
  // PHASE 5-9 METRICS - NOT YET REGISTERED
  // The following metrics are NOT in the registry until their indexers are built:
  // - onchain_gold: vendor_spend (Phase 8)
  // - onchain_staking: stake_duration_days (Phase 8)
  // - seasonal_events: seasonal_score (Phase 9)
  // Challenges using these will log "No extractor found" and be skipped
  // ============================================
};
