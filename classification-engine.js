// classification-engine.js
// Classification Engine for Player User Model
// Turns raw signals into archetypes, tiers, states, behavior tags, and KPIs

import { 
  ARCHETYPES,
  INTENT_ARCHETYPES,
  INTENT_TO_LEGACY_MAP,
  TIERS, 
  STATES, 
  BEHAVIOR_TAGS,
  CLASSIFICATION_THRESHOLDS,
  MESSAGE_PATTERNS,
  DEFAULT_PROFILE
} from './classification-config.js';

const T = CLASSIFICATION_THRESHOLDS;
const P = MESSAGE_PATTERNS;
const IW = T.intentWeights;
const IT = T.intentThresholds;

/**
 * Classification Event types
 * @typedef {Object} ClassificationEvent
 * @property {string} type - Event type
 * @property {Object} payload - Event-specific data
 * @property {Date} [timestamp] - When event occurred
 */

/**
 * DFK Snapshot data from wallet scan
 * @typedef {Object} DFKSnapshot
 * @property {number} heroCount
 * @property {number} petCount
 * @property {number} lpPositionsCount
 * @property {number} totalLPValue - USD value
 * @property {number} jewelBalance
 * @property {number} crystalBalance
 * @property {number} questingStreakDays
 */

/**
 * Main classification function - processes a profile and returns updated classification
 * @param {Object} profile - PlayerProfile object
 * @returns {Object} Updated profile with new classification
 */
export function classifyProfile(profile) {
  const classified = { ...profile };
  
  // Step 1: Calculate flags first (needed for tier and intent)
  classified.flags = determineFlags(profile);
  
  // Step 2: Build classification context for intent scoring
  const context = buildClassificationContext(profile);
  
  // Step 3: Compute intent scores
  const intentScores = computeIntentScores(context);
  classified.intentScores = intentScores;
  
  // Step 4: Determine intent archetype (new primary classification)
  classified.intentArchetype = determineIntentArchetype(intentScores, context);
  
  // Step 5: Map to legacy archetype for backwards compatibility
  // Use the intent-based mapping, but fall back to old logic if needed
  classified.archetype = mapIntentToLegacyArchetype(classified.intentArchetype);
  
  // Step 6: Determine tier based on KPIs and flags
  classified.tier = determineTier(profile, classified.flags);
  
  // Step 7: Determine state based on behavior
  classified.state = determineState(profile, classified.flags);
  
  // Step 8: Infer behavior tags from message patterns and data
  classified.behaviorTags = determineBehaviorTags(profile);
  
  // Update timestamp
  classified.updatedAt = new Date();
  
  return classified;
}

/**
 * Update KPIs from a classification event
 * @param {Object} profile - Current profile
 * @param {ClassificationEvent} event - Event to process
 * @returns {Object} Updated profile with new KPIs
 */
export function updateKpisFromEvent(profile, event) {
  const updated = { ...profile };
  const kpis = { ...profile.kpis };
  const W = T.kpiWeights;
  
  switch (event.type) {
    case 'WALLET_SCAN': {
      // Update DFK snapshot
      updated.dfkSnapshot = event.payload;
      
      // Recalculate financial score
      const snapshot = event.payload;
      kpis.financialScore = calculateFinancialScore(snapshot);
      break;
    }
    
    case 'DISCORD_MESSAGE': {
      // Increment message count
      kpis.messagesLast7d = (kpis.messagesLast7d || 0) + 1;
      
      // Add engagement points
      kpis.engagementScore = (kpis.engagementScore || 0) + W.messageWeight;
      
      // Store message content for behavior analysis
      if (!updated.recentMessages) {
        updated.recentMessages = [];
      }
      updated.recentMessages.push({
        content: event.payload.messageContent,
        timestamp: event.timestamp || new Date()
      });
      
      // Keep only last 50 messages for analysis
      if (updated.recentMessages.length > 50) {
        updated.recentMessages = updated.recentMessages.slice(-50);
      }
      break;
    }
    
    case 'SESSION_START': {
      // Add session engagement points
      kpis.engagementScore = (kpis.engagementScore || 0) + W.sessionWeight;
      break;
    }
    
    case 'ADVICE_FOLLOWED': {
      // User followed a recommendation
      kpis.adviceFollowedCount = (kpis.adviceFollowedCount || 0) + 1;
      kpis.engagementScore = (kpis.engagementScore || 0) + W.adviceFollowedWeight;
      break;
    }
    
    case 'RECOMMENDATION_CLICKED': {
      // User clicked a link/recommendation
      kpis.recommendationsClicked = (kpis.recommendationsClicked || 0) + 1;
      kpis.engagementScore = (kpis.engagementScore || 0) + W.recommendationClickWeight;
      break;
    }
    
    case 'COMMAND_USED': {
      // User used a bot command
      kpis.engagementScore = (kpis.engagementScore || 0) + W.commandUsedWeight;
      break;
    }
    
    case 'SUBSCRIPTION_UPGRADE': {
      // Manual tier override from subscription
      if (event.payload.newTier !== undefined) {
        updated.tierOverride = event.payload.newTier;
      }
      break;
    }
    
    case 'RETENTION_UPDATE': {
      // Update retention score
      kpis.retentionScore = calculateRetentionScore(event.payload);
      break;
    }
    
    default:
      console.warn(`[ClassificationEngine] Unknown event type: ${event.type}`);
  }
  
  // Update lastSeenAt
  kpis.lastSeenAt = event.timestamp || new Date();
  
  updated.kpis = kpis;
  return updated;
}

/**
 * Process an event and reclassify the profile
 * @param {Object} profile - Current profile
 * @param {ClassificationEvent} event - Event to process
 * @returns {Object} Fully updated and reclassified profile
 */
export function processEventAndReclassify(profile, event) {
  // First update KPIs from the event
  const updatedProfile = updateKpisFromEvent(profile, event);
  
  // Then run full classification
  return classifyProfile(updatedProfile);
}

// ============================================================================
// ARCHETYPE DETERMINATION
// ============================================================================

/**
 * Determine archetype based on wallet data and behavior
 */
function determineArchetype(profile) {
  const snapshot = profile.dfkSnapshot;
  const A = T.archetype;
  
  // No wallet data = GUEST
  if (!snapshot) {
    return ARCHETYPES.GUEST;
  }
  
  const { heroCount, lpPositionsCount, totalLPValue, jewelBalance, crystalBalance } = snapshot;
  const totalBalance = (jewelBalance || 0) + (crystalBalance || 0);
  
  // Check for EXTRACTOR first (based on flags/extractor score)
  if (profile.extractorScore >= T.extractor.extractorScoreThreshold) {
    return ARCHETYPES.EXTRACTOR;
  }
  
  // Zero assets = GUEST
  if (heroCount === 0 && lpPositionsCount === 0 && totalBalance < 10) {
    return ARCHETYPES.GUEST;
  }
  
  // INVESTOR: Few heroes but large LP/balances
  if (heroCount <= A.investorMaxHeroes && 
      (totalLPValue >= A.investorMinLPValue || totalBalance >= A.investorMinBalance)) {
    return ARCHETYPES.INVESTOR;
  }
  
  // PLAYER: Many heroes OR multiple LP positions
  if (heroCount >= A.playerMinHeroes || lpPositionsCount >= A.playerMinLPPositions) {
    return ARCHETYPES.PLAYER;
  }
  
  // ADVENTURER: 1-10 heroes with some activity
  if (heroCount >= 1 && heroCount <= A.adventurerMaxHeroes) {
    return ARCHETYPES.ADVENTURER;
  }
  
  // Has LP but few heroes
  if (lpPositionsCount >= 1) {
    return ARCHETYPES.ADVENTURER;
  }
  
  // Default to GUEST if nothing matches
  return ARCHETYPES.GUEST;
}

// ============================================================================
// TIER DETERMINATION
// ============================================================================

/**
 * Determine access tier based on KPIs and flags
 */
function determineTier(profile, flags) {
  const kpis = profile.kpis || {};
  const Tier = T.tier;
  
  // Manual override takes precedence
  if (profile.tierOverride !== undefined && profile.tierOverride !== null) {
    return profile.tierOverride;
  }
  
  const engagement = kpis.engagementScore || 0;
  const financial = kpis.financialScore || 0;
  
  // TIER 4: Top tier (Council of Hedge)
  if (engagement >= Tier.tier4MinEngagement && financial >= Tier.tier4MinFinancial) {
    return TIERS.TIER_4;
  }
  
  // TIER 3: High engagement + high financial (or whale)
  if ((engagement >= Tier.tier3MinEngagement && financial >= Tier.tier3MinFinancial) ||
      (Tier.whaleAutoTier3 && flags.isWhale)) {
    return TIERS.TIER_3;
  }
  
  // TIER 2: More engaged Player/Investor
  if (engagement >= Tier.tier2MinEngagement && financial >= Tier.tier2MinFinancial) {
    return TIERS.TIER_2;
  }
  
  // TIER 1: Any Adventurer/Player with minimal engagement
  if (engagement >= Tier.tier1MinEngagement || financial >= Tier.tier1MinFinancial) {
    return TIERS.TIER_1;
  }
  
  // TIER 0: Guest/minimal activity
  return TIERS.TIER_0;
}

// ============================================================================
// STATE DETERMINATION
// ============================================================================

/**
 * Determine player state based on behavior patterns
 */
function determineState(profile, flags) {
  const kpis = profile.kpis || {};
  const S = T.state;
  
  // EXTRACTING: If extractor flag is set
  if (flags.isExtractor) {
    return STATES.EXTRACTING;
  }
  
  // Analyze message patterns
  const recentMessages = profile.recentMessages || [];
  const yieldQuestionCount = countPatternMatches(recentMessages, P.yieldKeywords);
  
  // COMMITTED: Strong retention and consistent activity
  if (kpis.retentionScore >= S.committedMinRetentionScore) {
    return STATES.COMMITTED;
  }
  
  // EXPANDING: Growing assets (would need historical data comparison)
  // For now, check if they have moderate assets and are active
  const snapshot = profile.dfkSnapshot;
  if (snapshot && (snapshot.heroCount > 5 || snapshot.lpPositionsCount > 2)) {
    // Check if they're actively engaging
    if ((kpis.messagesLast7d || 0) >= 5) {
      return STATES.EXPANDING;
    }
  }
  
  // OPTIMIZING: Frequently asks about yields/optimization
  if (yieldQuestionCount >= S.optimizingMinYieldQuestions) {
    return STATES.OPTIMIZING;
  }
  
  // CURIOUS: Default for new/low-activity players
  return STATES.CURIOUS;
}

// ============================================================================
// BEHAVIOR TAG DETERMINATION
// ============================================================================

/**
 * Determine behavior tags from message patterns and data
 */
function determineBehaviorTags(profile) {
  const tags = [];
  const BT = T.behaviorTags;
  const kpis = profile.kpis || {};
  const snapshot = profile.dfkSnapshot;
  const recentMessages = profile.recentMessages || [];
  
  // Calculate days since first seen
  const daysSinceFirstSeen = profile.firstSeenAt 
    ? Math.floor((Date.now() - new Date(profile.firstSeenAt).getTime()) / (1000 * 60 * 60 * 24))
    : 0;
  
  // NEWCOMER: Recently joined
  if (daysSinceFirstSeen <= BT.newcomerMaxDays) {
    tags.push(BEHAVIOR_TAGS.NEWCOMER);
  }
  
  // VETERAN: Long-time player
  if (daysSinceFirstSeen >= BT.veteranMinDays) {
    tags.push(BEHAVIOR_TAGS.VETERAN);
  }
  
  // WHALE: Large holdings
  if (snapshot) {
    const totalValue = (snapshot.totalLPValue || 0) + 
                       (snapshot.jewelBalance || 0) * 0.5 + // Rough USD conversion
                       (snapshot.crystalBalance || 0) * 0.3;
    if (totalValue >= BT.whaleMinValue) {
      tags.push(BEHAVIOR_TAGS.WHALE);
    }
  }
  
  // Message pattern-based tags
  if (recentMessages.length > 0) {
    // SCHOLAR: Asks detailed questions
    const scholarMatches = countPatternMatches(recentMessages, P.scholarKeywords);
    if (scholarMatches >= BT.scholarMinDetailQuestions) {
      tags.push(BEHAVIOR_TAGS.SCHOLAR);
    }
    
    // LORE_LOVER: Interested in story
    const loreMatches = countPatternMatches(recentMessages, P.loreKeywords);
    if (loreMatches >= BT.loreLoverMinLoreKeywords) {
      tags.push(BEHAVIOR_TAGS.LORE_LOVER);
    }
    
    // OPTIMIZER: Focused on efficiency
    const optimizerMatches = countPatternMatches(recentMessages, P.optimizerKeywords);
    if (optimizerMatches >= BT.optimizerMinYieldQuestions) {
      tags.push(BEHAVIOR_TAGS.OPTIMIZER);
    }
    
    // COLLECTOR: Interested in rare items
    const collectorMatches = countPatternMatches(recentMessages, P.collectorKeywords);
    if (collectorMatches >= BT.collectorMinRarityQuestions) {
      tags.push(BEHAVIOR_TAGS.COLLECTOR);
    }
    
    // DATA_SCIENTIST: Wants raw data
    const dataMatches = countPatternMatches(recentMessages, P.dataKeywords);
    if (dataMatches >= BT.dataScienceMinDataKeywords) {
      tags.push(BEHAVIOR_TAGS.DATA_SCIENTIST);
    }
    
    // SPEEDRUNNER: Short messages, wants quick answers
    const avgMessageLength = recentMessages.reduce((sum, m) => sum + (m.content?.length || 0), 0) / recentMessages.length;
    if (avgMessageLength <= BT.speedrunnerMaxAvgMessageLen && recentMessages.length >= 5) {
      tags.push(BEHAVIOR_TAGS.SPEEDRUNNER);
    }
  }
  
  // SOCIAL_PLAYER: Lots of recent messages
  if ((kpis.messagesLast7d || 0) >= BT.socialPlayerMinMessages7d) {
    tags.push(BEHAVIOR_TAGS.SOCIAL_PLAYER);
  }
  
  // SILENT_FARMER: Low chat but high on-chain activity
  // Would need wallet activity data to properly assess
  // Placeholder: low messages but has assets
  if ((kpis.messagesLast7d || 0) <= BT.silentFarmerMaxMessages && 
      snapshot && snapshot.heroCount > 0) {
    tags.push(BEHAVIOR_TAGS.SILENT_FARMER);
  }
  
  // MINIMALIST: Few assets, but long-term holder
  if (snapshot && snapshot.heroCount <= 3 && snapshot.heroCount >= 1 && 
      daysSinceFirstSeen >= 30) {
    tags.push(BEHAVIOR_TAGS.MINIMALIST);
  }
  
  // If no tags assigned, give a default
  if (tags.length === 0) {
    tags.push(BEHAVIOR_TAGS.NEWCOMER);
  }
  
  return [...new Set(tags)]; // Remove duplicates
}

// ============================================================================
// FLAG DETERMINATION
// ============================================================================

/**
 * Determine special flags
 */
function determineFlags(profile) {
  const F = T.flags;
  const kpis = profile.kpis || {};
  const snapshot = profile.dfkSnapshot;
  
  const flags = {
    isExtractor: false,
    isWhale: false,
    isHighPotential: false
  };
  
  // Extractor flag
  if (profile.extractorScore >= T.extractor.extractorScoreThreshold) {
    flags.isExtractor = true;
  }
  
  // Whale flag
  if (snapshot) {
    const totalValue = (snapshot.totalLPValue || 0) + 
                       (snapshot.jewelBalance || 0) * 0.5 + 
                       (snapshot.crystalBalance || 0) * 0.3;
    if (totalValue >= F.whaleMinValue) {
      flags.isWhale = true;
    }
  }
  
  // High potential flag (engaged but not yet financial)
  if ((kpis.engagementScore || 0) >= F.highPotentialMinEngagement &&
      (kpis.financialScore || 0) < F.highPotentialMaxFinancial) {
    flags.isHighPotential = true;
  }
  
  return flags;
}

// ============================================================================
// INTENT ARCHETYPE SYSTEM
// ============================================================================

/**
 * Player Classification Context - aggregates all data needed for intent scoring
 * @typedef {Object} PlayerClassificationContext
 * @property {number} heroCount - Total heroes owned
 * @property {number} heroQuestsLast7d - Quests completed in last 7 days (TODO: wire to quest tracking)
 * @property {number} summonsLast30d - Summons completed in last 30 days (TODO: wire to summon tracking)
 * @property {number} heroXPDelta30d - Total XP gained in last 30 days (TODO: wire to hero tracking)
 * @property {number} completedChallenges - Challenge milestones completed
 * @property {number} reinvestRate - Ratio of rewards reinvested (0-1)
 * @property {number} totalLPValueUsd - Total USD value of LP positions
 * @property {number} optimizerRunsLast30d - Garden optimizer uses in last 30 days
 * @property {number} dumpRate - Ratio of rewards sold immediately (0-1)
 * @property {number} bridgeOutVolumeUsd30d - USD bridged out in last 30 days
 * @property {number} lpToPortfolioRatio - LP value relative to total portfolio
 * @property {number} discordMessages7d - Discord messages in last 7 days
 * @property {number} loreRequestsLast30d - Lore-related requests in last 30 days
 * @property {number} communityChallengesCompleted - Community challenges done
 * @property {number} daysSinceFirstSeen - Days since first interaction
 * @property {number} helpRequestsLast7d - Help requests in last 7 days
 */

/**
 * Build classification context from a player profile
 * Maps existing data to the context structure for intent scoring
 * @param {Object} profile - Player profile
 * @returns {PlayerClassificationContext} Context for scoring
 */
function buildClassificationContext(profile) {
  const snapshot = profile.dfkSnapshot || {};
  const kpis = profile.kpis || {};
  const recentMessages = profile.recentMessages || [];
  
  // Calculate days since first seen
  const daysSinceFirstSeen = profile.firstSeenAt 
    ? Math.floor((Date.now() - new Date(profile.firstSeenAt).getTime()) / (1000 * 60 * 60 * 24))
    : 0;
  
  // Count lore-related messages (reuse existing pattern matching)
  const loreRequestsLast30d = countPatternMatches(recentMessages, P.loreKeywords);
  
  // Count optimizer-related messages as proxy for optimizer runs
  const optimizerMentions = countPatternMatches(recentMessages, P.optimizerKeywords);
  
  // Count help/beginner questions as proxy for help requests
  const helpPatterns = ['help', 'how do i', 'what should', 'beginner', 'new player', 'started', 'confused'];
  const helpRequestsLast7d = countPatternMatches(recentMessages, helpPatterns);
  
  // Derive reinvest rate from extractor score (inverse relationship)
  // extractorScore 0 = reinvest rate 1.0, extractorScore 100 = reinvest rate 0.0
  const extractorScore = profile.extractorScore || 0;
  const reinvestRate = Math.max(0, 1 - (extractorScore / 100));
  const dumpRate = extractorScore / 100;
  
  // LP to portfolio ratio (crude estimate)
  const totalLPValue = snapshot.totalLPValue || 0;
  const heroValue = (snapshot.heroCount || 0) * 100; // Rough hero value estimate
  const tokenValue = ((snapshot.jewelBalance || 0) * 0.5) + ((snapshot.crystalBalance || 0) * 0.3);
  const portfolioValue = totalLPValue + heroValue + tokenValue;
  const lpToPortfolioRatio = portfolioValue > 0 ? totalLPValue / portfolioValue : 0;
  
  return {
    // Hero/progression metrics
    heroCount: snapshot.heroCount || 0,
    heroQuestsLast7d: snapshot.questingStreakDays || 0, // TODO: Replace with actual quest count when available
    summonsLast30d: 0, // TODO: Wire to summon tracking system
    heroXPDelta30d: 0, // TODO: Wire to hero XP tracking
    completedChallenges: 0, // TODO: Wire to challenge tracking
    
    // Investment metrics
    reinvestRate,
    totalLPValueUsd: totalLPValue,
    optimizerRunsLast30d: optimizerMentions, // Proxy: optimizer keyword mentions
    dumpRate,
    bridgeOutVolumeUsd30d: profile.bridgeOutVolume30d || 0, // TODO: Wire to bridge tracker
    lpToPortfolioRatio,
    
    // Social metrics
    discordMessages7d: kpis.messagesLast7d || 0,
    loreRequestsLast30d,
    communityChallengesCompleted: 0, // TODO: Wire to community challenge tracking
    
    // Onboarding metrics
    daysSinceFirstSeen,
    helpRequestsLast7d,
    
    // Additional context
    extractorScore,
    engagementScore: kpis.engagementScore || 0,
  };
}

/**
 * Normalize a value using a cap to prevent runaway scores
 * @param {number} value - Raw value to normalize
 * @param {number} cap - Maximum value cap
 * @returns {number} Normalized value (0 to cap)
 */
function normalizeWithCap(value, cap) {
  return Math.min(value ?? 0, cap);
}

/**
 * Compute intent scores for a player
 * @param {PlayerClassificationContext} context - Classification context
 * @returns {{progressionScore: number, investorGrowthScore: number, extractorScore: number, socialScore: number, onboardingScore: number}}
 */
export function computeIntentScores(context) {
  const prog = IW.progression;
  const inv = IW.investorGrowth;
  const ext = IW.extractor;
  const soc = IW.social;
  const onb = IW.onboarding;
  
  // Normalize inputs to prevent USD/count values from dominating scores
  const normHeroCount = normalizeWithCap(context.heroCount, IT.heroCountNormalizationCap ?? 50);
  const normQuests = normalizeWithCap(context.heroQuestsLast7d, IT.questsNormalizationCap ?? 100);
  const normSummons = normalizeWithCap(context.summonsLast30d, IT.summonsNormalizationCap ?? 20);
  const normLPValue = normalizeWithCap(context.totalLPValueUsd, IT.lpValueNormalizationCap ?? 50000);
  const normBridgeOut = normalizeWithCap(context.bridgeOutVolumeUsd30d, IT.bridgeOutNormalizationCap ?? 10000);
  const normMessages = normalizeWithCap(context.discordMessages7d, IT.messagesNormalizationCap ?? 50);
  
  // Progression Gamer Score
  // Focuses on questing, summoning, hero development, and collection
  const progressionScore = 
    normQuests * prog.heroQuestsWeight +
    normSummons * prog.summonsWeight +
    (context.heroXPDelta30d ?? 0) * prog.heroXPDeltaWeight +
    (context.completedChallenges ?? 0) * prog.completedChallengesWeight +
    normHeroCount * prog.heroCountWeight;
  
  // Investor Growth Score
  // Reinvests in ecosystem, uses optimizer, has LP positions
  const investorGrowthScore = 
    (context.reinvestRate ?? 0) * inv.reinvestRateWeight +
    normLPValue * inv.lpValueWeight +
    (context.optimizerRunsLast30d ?? 0) * inv.optimizerRunsWeight -
    (context.dumpRate ?? 0) * inv.dumpRatePenalty;
  
  // Extractor Score
  // Dumps rewards, bridges out, doesn't reinvest
  const lpPenalty = (1 - (context.lpToPortfolioRatio ?? 0)) * ext.lowLPPenalty;
  const extractorScore = 
    (context.dumpRate ?? 0) * ext.dumpRateWeight +
    normBridgeOut * ext.bridgeOutWeight -
    (context.reinvestRate ?? 0) * ext.reinvestPenalty +
    lpPenalty;
  
  // Social/Community Score
  // Active in Discord, interested in lore, participates in community
  const socialScore = 
    normMessages * soc.messagesWeight +
    (context.loreRequestsLast30d ?? 0) * soc.loreRequestsWeight +
    (context.communityChallengesCompleted ?? 0) * soc.communityChallengesWeight;
  
  // Onboarding/New Explorer Score
  // New player, asking for help, learning the ropes
  const newPlayerBonus = (context.daysSinceFirstSeen !== undefined && context.daysSinceFirstSeen < IT.newExplorerMaxDays)
    ? onb.newPlayerBonus
    : 0;
  const onboardingScore = 
    newPlayerBonus +
    (context.helpRequestsLast7d ?? 0) * onb.helpRequestsWeight;
  
  return {
    progressionScore: Math.max(0, progressionScore),
    investorGrowthScore: Math.max(0, investorGrowthScore),
    extractorScore: Math.max(0, extractorScore),
    socialScore: Math.max(0, socialScore),
    onboardingScore: Math.max(0, onboardingScore),
  };
}

/**
 * Determine the primary intent archetype from computed scores
 * @param {{progressionScore: number, investorGrowthScore: number, extractorScore: number, socialScore: number, onboardingScore: number}} scores
 * @param {PlayerClassificationContext} context - Additional context for hard overrides
 * @returns {string} Intent archetype value
 */
export function determineIntentArchetype(scores, context) {
  // HARD OVERRIDE 1: Existing extractor flag from bridge tracker forces INVESTOR_EXTRACTOR
  // This is independent of scores - if flagged as extractor, they ARE an extractor
  if (context.extractorScore >= T.extractor.extractorScoreThreshold) {
    return INTENT_ARCHETYPES.INVESTOR_EXTRACTOR;
  }
  
  // HARD OVERRIDE 2: High bridge out volume forces INVESTOR_EXTRACTOR
  // Bridge extractors bridging out more than threshold = automatic extractor
  const bridgeOutThreshold = IT.bridgeOutHardThreshold ?? 5000; // $5k USD default
  if ((context.bridgeOutVolumeUsd30d ?? 0) >= bridgeOutThreshold) {
    return INTENT_ARCHETYPES.INVESTOR_EXTRACTOR;
  }
  
  // HARD OVERRIDE 3: High extractor score forces INVESTOR_EXTRACTOR
  if (scores.extractorScore >= IT.extractorOverrideScore) {
    return INTENT_ARCHETYPES.INVESTOR_EXTRACTOR;
  }
  
  // HARD OVERRIDE 4: New player with few heroes = NEW_EXPLORER
  if (scores.onboardingScore > 0 && (context.heroCount ?? 0) < IT.newExplorerMaxHeroes) {
    // Check if onboarding is the dominant score
    const allScores = [
      scores.progressionScore,
      scores.investorGrowthScore,
      scores.extractorScore,
      scores.socialScore,
      scores.onboardingScore
    ];
    const maxScore = Math.max(...allScores);
    if (scores.onboardingScore >= maxScore - IT.minScoreDifference) {
      return INTENT_ARCHETYPES.NEW_EXPLORER;
    }
  }
  
  // Find the maximum score
  const scoreMap = [
    { archetype: INTENT_ARCHETYPES.PROGRESSION_GAMER, score: scores.progressionScore },
    { archetype: INTENT_ARCHETYPES.INVESTOR_GROWTH, score: scores.investorGrowthScore },
    { archetype: INTENT_ARCHETYPES.INVESTOR_EXTRACTOR, score: scores.extractorScore },
    { archetype: INTENT_ARCHETYPES.SOCIAL_COMMUNITY, score: scores.socialScore },
    { archetype: INTENT_ARCHETYPES.NEW_EXPLORER, score: scores.onboardingScore },
  ];
  
  // Sort by score descending, with deterministic tie-breaking by archetype order
  scoreMap.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // Tie-breaking priority: PROGRESSION_GAMER > INVESTOR_GROWTH > SOCIAL_COMMUNITY > NEW_EXPLORER > INVESTOR_EXTRACTOR
    const priority = {
      [INTENT_ARCHETYPES.PROGRESSION_GAMER]: 0,
      [INTENT_ARCHETYPES.INVESTOR_GROWTH]: 1,
      [INTENT_ARCHETYPES.SOCIAL_COMMUNITY]: 2,
      [INTENT_ARCHETYPES.NEW_EXPLORER]: 3,
      [INTENT_ARCHETYPES.INVESTOR_EXTRACTOR]: 4,
    };
    return priority[a.archetype] - priority[b.archetype];
  });
  
  const topArchetype = scoreMap[0];
  
  // Additional validation: If top score is very low, default to NEW_EXPLORER
  if (topArchetype.score < 1) {
    return INTENT_ARCHETYPES.NEW_EXPLORER;
  }
  
  return topArchetype.archetype;
}

/**
 * Map intent archetype to legacy archetype for backwards compatibility
 * @param {string} intentArchetype - New intent archetype
 * @returns {string} Legacy archetype value
 */
export function mapIntentToLegacyArchetype(intentArchetype) {
  return INTENT_TO_LEGACY_MAP[intentArchetype] || ARCHETYPES.GUEST;
}

// ============================================================================
// SCORE CALCULATIONS
// ============================================================================

/**
 * Calculate financial score from DFK snapshot
 */
function calculateFinancialScore(snapshot) {
  if (!snapshot) return 0;
  
  const W = T.kpiWeights;
  
  const heroScore = (snapshot.heroCount || 0) * W.heroValuePerHero;
  const lpScore = (snapshot.totalLPValue || 0) * W.lpValueMultiplier;
  const jewelScore = (snapshot.jewelBalance || 0) * W.jewelBalanceMultiplier;
  const crystalScore = (snapshot.crystalBalance || 0) * W.crystalBalanceMultiplier;
  
  return Math.round(heroScore + lpScore + jewelScore + crystalScore);
}

/**
 * Calculate retention score from retention data
 */
function calculateRetentionScore(retentionData) {
  if (!retentionData) return 0;
  
  const W = T.kpiWeights;
  
  const activeDays7d = retentionData.activeDays7d || 0;
  const activeDays30d = retentionData.activeDays30d || 0;
  const questingStreak = retentionData.questingStreakDays || 0;
  const consecutiveWeeks = retentionData.consecutiveWeeksActive || 0;
  
  return (activeDays7d * W.activeDay7dWeight) +
         (activeDays30d * W.activeDay30dWeight) +
         (questingStreak * W.questingStreakWeight) +
         (consecutiveWeeks * W.consecutiveWeeksWeight);
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Count how many messages match any of the given keywords
 */
function countPatternMatches(messages, keywords) {
  let count = 0;
  
  for (const message of messages) {
    const content = (message.content || '').toLowerCase();
    for (const keyword of keywords) {
      if (content.includes(keyword.toLowerCase())) {
        count++;
        break; // Count each message only once
      }
    }
  }
  
  return count;
}

/**
 * Get a human-readable profile summary
 */
export function getProfileSummary(profile) {
  const archetype = profile.archetype || ARCHETYPES.GUEST;
  const intentArchetype = profile.intentArchetype || INTENT_ARCHETYPES.NEW_EXPLORER;
  const tier = profile.tier ?? TIERS.TIER_0;
  const state = profile.state || STATES.CURIOUS;
  const tags = profile.behaviorTags || [];
  const flags = profile.flags || {};
  const kpis = profile.kpis || {};
  const intentScores = profile.intentScores || {};
  
  return {
    archetype,
    intentArchetype,
    intentArchetypeName: getIntentArchetypeName(intentArchetype),
    tier,
    tierName: getTierName(tier),
    state,
    tags,
    isWhale: flags.isWhale || false,
    isExtractor: flags.isExtractor || false,
    isHighPotential: flags.isHighPotential || false,
    engagementScore: kpis.engagementScore || 0,
    financialScore: kpis.financialScore || 0,
    retentionScore: kpis.retentionScore || 0,
    intentScores
  };
}

/**
 * Get human-readable intent archetype name
 */
function getIntentArchetypeName(intentArchetype) {
  const names = {
    [INTENT_ARCHETYPES.PROGRESSION_GAMER]: 'Progression Gamer',
    [INTENT_ARCHETYPES.INVESTOR_GROWTH]: 'Growth Investor',
    [INTENT_ARCHETYPES.INVESTOR_EXTRACTOR]: 'Extractor',
    [INTENT_ARCHETYPES.SOCIAL_COMMUNITY]: 'Community Member',
    [INTENT_ARCHETYPES.NEW_EXPLORER]: 'New Explorer',
  };
  return names[intentArchetype] || 'Unknown';
}

/**
 * Get human-readable tier name
 */
function getTierName(tier) {
  const names = {
    0: 'Guest',
    1: 'Bronze',
    2: 'Silver', 
    3: 'Gold',
    4: 'Council of Hedge'
  };
  return names[tier] || 'Unknown';
}

export default {
  classifyProfile,
  updateKpisFromEvent,
  processEventAndReclassify,
  getProfileSummary,
  computeIntentScores,
  determineIntentArchetype,
  mapIntentToLegacyArchetype
};
