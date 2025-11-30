// classification-engine.js
// Classification Engine for Player User Model
// Turns raw signals into archetypes, tiers, states, behavior tags, and KPIs

import { 
  ARCHETYPES, 
  TIERS, 
  STATES, 
  BEHAVIOR_TAGS,
  CLASSIFICATION_THRESHOLDS,
  MESSAGE_PATTERNS,
  DEFAULT_PROFILE
} from './classification-config.js';

const T = CLASSIFICATION_THRESHOLDS;
const P = MESSAGE_PATTERNS;

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
  
  // Step 1: Determine archetype from wallet data
  classified.archetype = determineArchetype(profile);
  
  // Step 2: Calculate flags first (needed for tier)
  classified.flags = determineFlags(profile);
  
  // Step 3: Determine tier based on KPIs and flags
  classified.tier = determineTier(profile, classified.flags);
  
  // Step 4: Determine state based on behavior
  classified.state = determineState(profile, classified.flags);
  
  // Step 5: Infer behavior tags from message patterns and data
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
  const tier = profile.tier ?? TIERS.TIER_0;
  const state = profile.state || STATES.CURIOUS;
  const tags = profile.behaviorTags || [];
  const flags = profile.flags || {};
  const kpis = profile.kpis || {};
  
  return {
    archetype,
    tier,
    tierName: getTierName(tier),
    state,
    tags,
    isWhale: flags.isWhale || false,
    isExtractor: flags.isExtractor || false,
    isHighPotential: flags.isHighPotential || false,
    engagementScore: kpis.engagementScore || 0,
    financialScore: kpis.financialScore || 0,
    retentionScore: kpis.retentionScore || 0
  };
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
  getProfileSummary
};
