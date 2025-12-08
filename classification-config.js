// classification-config.js
// Configuration thresholds for player classification system
// All values are tunable here for easy adjustment

/**
 * Player Archetypes - Legacy classification (kept for backwards compatibility)
 * @deprecated Use INTENT_ARCHETYPES for new code
 */
export const ARCHETYPES = {
  GUEST: 'GUEST',           // No wallet or zero DFK assets
  ADVENTURER: 'ADVENTURER', // 1-10 heroes, low LP, minor balances
  PLAYER: 'PLAYER',         // >10 heroes OR multiple LP positions OR noticeable activity
  INVESTOR: 'INVESTOR',     // Low hero count but large LP/balances (yield farmers)
  EXTRACTOR: 'EXTRACTOR'    // Farm & dump pattern, zero reinvestment
};

/**
 * Intent-Based Player Archetypes - New primary classification based on player intent/motivation
 * These represent WHY a player engages with DFK, not just WHAT assets they hold
 */
export const INTENT_ARCHETYPES = {
  PROGRESSION_GAMER: 'PROGRESSION_GAMER',   // Focused on hero progression, questing, leveling, summoning
  INVESTOR_GROWTH: 'INVESTOR_GROWTH',       // Yield-focused but reinvests in ecosystem
  INVESTOR_EXTRACTOR: 'INVESTOR_EXTRACTOR', // Extracts value without reinvestment
  SOCIAL_COMMUNITY: 'SOCIAL_COMMUNITY',     // Engaged for community, lore, social aspects
  NEW_EXPLORER: 'NEW_EXPLORER',             // New player learning the ropes
};

/**
 * Mapping from legacy archetypes to intent archetypes for backwards compatibility
 */
export const LEGACY_TO_INTENT_MAP = {
  [ARCHETYPES.GUEST]: INTENT_ARCHETYPES.NEW_EXPLORER,
  [ARCHETYPES.ADVENTURER]: INTENT_ARCHETYPES.PROGRESSION_GAMER,
  [ARCHETYPES.PLAYER]: INTENT_ARCHETYPES.PROGRESSION_GAMER,
  [ARCHETYPES.INVESTOR]: INTENT_ARCHETYPES.INVESTOR_GROWTH,
  [ARCHETYPES.EXTRACTOR]: INTENT_ARCHETYPES.INVESTOR_EXTRACTOR,
};

/**
 * Mapping from intent archetypes back to legacy for compatibility with old code
 */
export const INTENT_TO_LEGACY_MAP = {
  [INTENT_ARCHETYPES.PROGRESSION_GAMER]: ARCHETYPES.PLAYER,
  [INTENT_ARCHETYPES.INVESTOR_GROWTH]: ARCHETYPES.INVESTOR,
  [INTENT_ARCHETYPES.INVESTOR_EXTRACTOR]: ARCHETYPES.EXTRACTOR,
  [INTENT_ARCHETYPES.SOCIAL_COMMUNITY]: ARCHETYPES.PLAYER,
  [INTENT_ARCHETYPES.NEW_EXPLORER]: ARCHETYPES.GUEST,
};

/**
 * Access Tiers (0-4)
 */
export const TIERS = {
  TIER_0: 0, // Guest
  TIER_1: 1, // Basic Adventurer/Player
  TIER_2: 2, // Engaged Player/Investor
  TIER_3: 3, // High engagement + financial (whales, serious users)
  TIER_4: 4  // Council of Hedge - top tier, manually or auto-assigned
};

/**
 * Player States - Current behavioral pattern
 */
export const STATES = {
  CURIOUS: 'CURIOUS',         // Early-stage, basic questions, low KPIs
  OPTIMIZING: 'OPTIMIZING',   // Asks about ROI, yields, better combos
  EXPANDING: 'EXPANDING',     // Growing hero/pet/LP counts
  COMMITTED: 'COMMITTED',     // Consistent activity, strong retention
  EXTRACTING: 'EXTRACTING'    // Extractor flag triggered
};

/**
 * Behavior Tags - Inferred from messages and wallet data
 */
export const BEHAVIOR_TAGS = {
  SCHOLAR: 'SCHOLAR',               // Asks for details, formulas, explanations
  SPEEDRUNNER: 'SPEEDRUNNER',       // Short, direct messages, wants quick answers
  LORE_LOVER: 'LORE_LOVER',         // Mentions story, lore, NPC persona, roleplay
  OPTIMIZER: 'OPTIMIZER',           // Repeatedly asks about APR, min-maxing
  COLLECTOR: 'COLLECTOR',           // Focuses on rare heroes/pets/visual traits
  WHALE: 'WHALE',                   // Large holdings or LP
  MINIMALIST: 'MINIMALIST',         // Few assets, long-term holder
  DATA_SCIENTIST: 'DATA_SCIENTIST', // Asks for data models, tables, formulas
  SOCIAL_PLAYER: 'SOCIAL_PLAYER',   // Chats frequently, active in Discord
  SILENT_FARMER: 'SILENT_FARMER',   // Little chat activity, high on-chain activity
  NEWCOMER: 'NEWCOMER',             // Recently joined, learning basics
  VETERAN: 'VETERAN'                // Long-time player with deep knowledge
};

/**
 * Classification Thresholds - Adjustable parameters
 */
export const CLASSIFICATION_THRESHOLDS = {
  // Archetype thresholds
  archetype: {
    adventurerMaxHeroes: 10,           // <= this = ADVENTURER
    playerMinHeroes: 11,               // >= this = PLAYER (by heroes alone)
    playerMinLPPositions: 2,           // >= this = PLAYER (by LP)
    investorMinLPValue: 5000,          // USD value threshold for INVESTOR
    investorMaxHeroes: 5,              // INVESTOR has few heroes
    investorMinBalance: 1000,          // Minimum JEWEL+CRYSTAL balance for INVESTOR
  },

  // Tier thresholds
  tier: {
    tier1MinEngagement: 5,             // Minimum engagement score for Tier 1
    tier1MinFinancial: 10,             // Minimum financial score for Tier 1
    tier2MinEngagement: 20,            // Minimum engagement score for Tier 2
    tier2MinFinancial: 50,             // Minimum financial score for Tier 2
    tier3MinEngagement: 50,            // High engagement for Tier 3
    tier3MinFinancial: 200,            // High financial for Tier 3
    tier4MinEngagement: 100,           // Top tier engagement
    tier4MinFinancial: 500,            // Top tier financial
    whaleAutoTier3: true,              // Whales automatically get at least Tier 3
  },

  // State thresholds
  state: {
    curiousMaxMessages: 10,            // Under this = CURIOUS
    optimizingMinYieldQuestions: 3,    // Min yield-related questions for OPTIMIZING
    expandingMinGrowthRate: 0.1,       // 10% growth in assets for EXPANDING
    committedMinRetentionDays: 14,     // Days active for COMMITTED
    committedMinRetentionScore: 60,    // Retention score for COMMITTED
  },

  // Behavior tag thresholds
  behaviorTags: {
    scholarMinDetailQuestions: 5,      // Questions with "why", "how", "explain"
    speedrunnerMaxAvgMessageLen: 50,   // Average message length (chars)
    loreLoverMinLoreKeywords: 3,       // Lore-related keyword mentions
    optimizerMinYieldQuestions: 5,     // APR/yield questions
    collectorMinRarityQuestions: 3,    // Questions about rare traits
    whaleMinTotalValue: 10000,         // USD value threshold
    dataScienceMinDataKeywords: 5,     // "formula", "calculate", "data", etc.
    socialPlayerMinMessages7d: 20,     // Messages in last 7 days
    silentFarmerMaxMessages: 5,        // Low chat but high on-chain
    silentFarmerMinOnchainTx: 20,      // Minimum on-chain transactions
    newcomerMaxDays: 14,               // Days since first seen
    veteranMinDays: 90,                // Days since first seen
  },

  // KPI calculation weights
  kpiWeights: {
    // Engagement score components
    messageWeight: 1,
    sessionWeight: 5,
    adviceFollowedWeight: 10,
    recommendationClickWeight: 3,
    commandUsedWeight: 2,

    // Financial score components
    heroValuePerHero: 50,              // Base value per hero
    lpValueMultiplier: 0.1,            // LP value * this = score
    jewelBalanceMultiplier: 0.5,       // JEWEL balance * this = score
    crystalBalanceMultiplier: 0.3,     // CRYSTAL balance * this = score

    // Retention score components
    activeDay7dWeight: 5,              // Per active day in last 7
    activeDay30dWeight: 2,             // Per active day in last 30
    questingStreakWeight: 3,           // Per day of questing streak
    consecutiveWeeksWeight: 10,        // Per consecutive week active
  },

  // Extractor detection thresholds
  extractor: {
    claimSellRatioThreshold: 0.8,      // 80% of claimed rewards sold immediately
    minClaimsForPattern: 5,            // Minimum claims to detect pattern
    floorFlipThreshold: 3,             // Floor heroes flipped in 7 days
    noProgressionThreshold: 10,        // Quests without progression triggers
    extractorScoreThreshold: 60,       // Score >= this = EXTRACTOR
    extractorTendingThreshold: 30,     // Score >= this = tending toward extraction
  },

  // Flag thresholds
  flags: {
    whaleMinValue: 10000,              // USD total value for whale flag
    highPotentialMinEngagement: 30,    // Engagement score for high potential
    highPotentialMaxFinancial: 100,    // Low financial but high engagement = convertable
  },

  // Intent archetype scoring weights (tunable)
  intentWeights: {
    // Progression Gamer score components
    progression: {
      heroQuestsWeight: 0.4,           // Per quest in last 7 days
      summonsWeight: 2.0,              // Per summon in last 30 days
      heroXPDeltaWeight: 0.1,          // Per XP gain in last 30 days
      completedChallengesWeight: 3.0,  // Per completed challenge
      heroCountWeight: 0.5,            // Per hero owned
    },
    
    // Investor Growth score components
    investorGrowth: {
      reinvestRateWeight: 3.0,         // Multiplier for reinvestment ratio (0-1)
      lpValueWeight: 0.02,             // Per USD of LP value
      optimizerRunsWeight: 5.0,        // Per optimizer run in last 30 days
      dumpRatePenalty: 2.0,            // Penalty per dump rate point
    },
    
    // Extractor score components
    extractor: {
      dumpRateWeight: 4.0,             // Per dump rate point
      bridgeOutWeight: 0.02,           // Per USD bridged out in 30 days
      reinvestPenalty: 3.0,            // Penalty per reinvest rate point
      lowLPPenalty: 1.0,               // When LP is low relative to portfolio
    },
    
    // Social/Community score components
    social: {
      messagesWeight: 1.5,             // Per Discord message in 7 days
      loreRequestsWeight: 3.0,         // Per lore-related request in 30 days
      communityChallengesWeight: 2.0,  // Per community challenge completed
    },
    
    // Onboarding/New Explorer score components
    onboarding: {
      newPlayerBonus: 20,              // Bonus if < 14 days since first seen
      helpRequestsWeight: 2.0,         // Per help request in 7 days
    },
  },

  // Intent archetype thresholds
  intentThresholds: {
    extractorOverrideScore: 50,        // If extractor score >= this, force INVESTOR_EXTRACTOR
    bridgeOutHardThreshold: 5000,      // USD bridged out in 30 days = automatic extractor
    newExplorerMaxHeroes: 3,           // Max heroes to qualify as NEW_EXPLORER
    newExplorerMaxDays: 14,            // Max days since first seen for new player bonus
    minScoreDifference: 5,             // Min difference to confidently pick an archetype
    
    // Normalization caps to prevent runaway scores from large values
    bridgeOutNormalizationCap: 10000,  // Cap bridge out USD for scoring purposes
    lpValueNormalizationCap: 50000,    // Cap LP value USD for scoring purposes
    heroCountNormalizationCap: 50,     // Cap hero count for scoring purposes
    questsNormalizationCap: 100,       // Cap quests per 7 days
    summonsNormalizationCap: 20,       // Cap summons per 30 days
    messagesNormalizationCap: 50,      // Cap messages per 7 days
  }
};

/**
 * Message analysis patterns for behavior tag inference
 */
export const MESSAGE_PATTERNS = {
  // Scholar patterns - seeks deep understanding
  scholarKeywords: [
    'explain', 'why', 'how does', 'what is', 'understand',
    'mechanics', 'formula', 'calculation', 'detail', 'specifics',
    'breakdown', 'elaborate', 'clarify', 'meaning'
  ],

  // Lore lover patterns - interested in story/roleplay
  loreKeywords: [
    'story', 'lore', 'character', 'npc', 'gaia', 'world',
    'history', 'realm', 'kingdom', 'adventure', 'quest story',
    'serendale', 'crystalvale', 'backstory', 'legend'
  ],

  // Optimizer patterns - focused on efficiency
  optimizerKeywords: [
    'apr', 'apy', 'yield', 'best', 'optimal', 'maximize',
    'efficiency', 'return', 'profit', 'worth it', 'roi',
    'compare', 'which is better', 'highest', 'most efficient'
  ],

  // Collector patterns - interested in rare/unique items
  collectorKeywords: [
    'rare', 'mythic', 'legendary', 'shiny', 'unique',
    'visual', 'appearance', 'trait', 'gene', 'mutation',
    'collection', 'complete', 'all of', 'every'
  ],

  // Data scientist patterns - wants raw data
  dataKeywords: [
    'data', 'statistics', 'numbers', 'table', 'spreadsheet',
    'export', 'formula', 'calculate', 'probability', 'odds',
    'percentage', 'algorithm', 'model', 'analysis'
  ],

  // Yield-focused patterns (for state detection)
  yieldKeywords: [
    'garden', 'pool', 'lp', 'stake', 'farm', 'apr',
    'yield', 'reward', 'earning', 'passive', 'liquidity'
  ],

  // Summoning patterns
  summoningKeywords: [
    'summon', 'summons', 'offspring', 'child', 'gene',
    'genetics', 'class chance', 'probability', 'parents',
    'mutation', 'recessive', 'dominant'
  ]
};

/**
 * Default empty profile state for new players
 */
export const DEFAULT_PROFILE = {
  archetype: ARCHETYPES.GUEST,
  intentArchetype: INTENT_ARCHETYPES.NEW_EXPLORER,
  tier: TIERS.TIER_0,
  state: STATES.CURIOUS,
  behaviorTags: [BEHAVIOR_TAGS.NEWCOMER],
  kpis: {
    engagementScore: 0,
    financialScore: 0,
    retentionScore: 0,
    messagesLast7d: 0,
    adviceFollowedCount: 0,
    recommendationsClicked: 0
  },
  intentScores: {
    progressionScore: 0,
    investorGrowthScore: 0,
    extractorScore: 0,
    socialScore: 0,
    onboardingScore: 0
  },
  dfkSnapshot: null,
  flags: {
    isExtractor: false,
    isWhale: false,
    isHighPotential: false
  }
};

export default {
  ARCHETYPES,
  INTENT_ARCHETYPES,
  LEGACY_TO_INTENT_MAP,
  INTENT_TO_LEGACY_MAP,
  TIERS,
  STATES,
  BEHAVIOR_TAGS,
  CLASSIFICATION_THRESHOLDS,
  MESSAGE_PATTERNS,
  DEFAULT_PROFILE
};
