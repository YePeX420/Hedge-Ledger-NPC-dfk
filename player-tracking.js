// player-tracking.js
// Player Engagement, Conversion & Extractor KPI Tracking System
// Tracks Discord users through engagement states, detects extractors, measures conversions

import { db } from './server/db.js';
import { 
  players, 
  interactionSessions, 
  interactionMessages,
  conversionMilestones,
  walletActivity,
  dailyPlayerSnapshots,
  extractorSignals 
} from './shared/schema.js';
import { eq, and, gte, lte, desc, sql } from 'drizzle-orm';

// ============================================================================
// PLAYER & SESSION MANAGEMENT
// ============================================================================

/**
 * Get or create player record for Discord user
 * @param {string} discordId - Discord user ID
 * @param {string} discordUsername - Discord username
 * @returns {Promise<Object>} Player record
 */
export async function getOrCreatePlayer(discordId, discordUsername) {
  // Try to find existing player
  const existing = await db
    .select()
    .from(players)
    .where(eq(players.discordId, discordId))
    .limit(1);

  if (existing.length > 0) {
    // Update last seen timestamp
    await db
      .update(players)
      .set({ 
        lastSeenAt: new Date(),
        discordUsername, // Update username in case it changed
      })
      .where(eq(players.id, existing[0].id));
    
    return existing[0];
  }

  // Create new player
  const [newPlayer] = await db
    .insert(players)
    .values({
      discordId,
      discordUsername,
      engagementState: 'visitor',
      extractorClassification: 'normal',
      extractorScore: '0.00',
    })
    .returning();

  console.log(`📊 New player tracked: ${discordUsername} (${discordId})`);
  
  return newPlayer;
}

/**
 * Start a new interaction session
 * @param {number} playerId - Player ID
 * @param {Object} metadata - Session metadata
 * @returns {Promise<Object>} Session record
 */
export async function startSession(playerId, metadata = {}) {
  const { channelType = 'dm', channelId = null, guildId = null } = metadata;

  const [session] = await db
    .insert(interactionSessions)
    .values({
      playerId,
      channelType,
      channelId,
      guildId,
      startedAt: new Date(),
    })
    .returning();

  return session;
}

/**
 * End a session and calculate duration
 * @param {number} sessionId - Session ID
 */
export async function endSession(sessionId) {
  const session = await db
    .select()
    .from(interactionSessions)
    .where(eq(interactionSessions.id, sessionId))
    .limit(1);

  if (session.length === 0) return;

  const startedAt = new Date(session[0].startedAt);
  const endedAt = new Date();
  const durationSeconds = Math.floor((endedAt - startedAt) / 1000);

  await db
    .update(interactionSessions)
    .set({ 
      endedAt,
      durationSeconds,
    })
    .where(eq(interactionSessions.id, sessionId));
}

/**
 * Log an interaction message
 * @param {Object} messageData - Message data
 * @returns {Promise<Object>} Message record
 */
export async function logMessage(messageData) {
  const {
    sessionId,
    playerId,
    messageType, // 'user_message', 'command', 'bot_response'
    command = null,
    topic = null,
    sentiment = null,
    heroIdQueried = null,
    walletQueried = null,
  } = messageData;

  const [message] = await db
    .insert(interactionMessages)
    .values({
      sessionId,
      playerId,
      messageType,
      command,
      topic,
      sentiment,
      heroIdQueried,
      walletQueried,
      timestamp: new Date(),
    })
    .returning();

  // Update session message count
  await db
    .update(interactionSessions)
    .set({ 
      messageCount: sql`${interactionSessions.messageCount} + 1`,
    })
    .where(eq(interactionSessions.id, sessionId));

  // Update player total message count
  await db
    .update(players)
    .set({ 
      totalMessages: sql`${players.totalMessages} + 1`,
    })
    .where(eq(players.id, playerId));

  // Add topic to session topics if not already present
  if (topic) {
    const session = await db
      .select()
      .from(interactionSessions)
      .where(eq(interactionSessions.id, sessionId))
      .limit(1);

    if (session.length > 0) {
      const currentTopics = session[0].topics || [];
      if (!currentTopics.includes(topic)) {
        await db
          .update(interactionSessions)
          .set({ 
            topics: [...currentTopics, topic],
          })
          .where(eq(interactionSessions.id, sessionId));
      }
    }
  }

  // Add command to session commands if applicable
  if (command) {
    const session = await db
      .select()
      .from(interactionSessions)
      .where(eq(interactionSessions.id, sessionId))
      .limit(1);

    if (session.length > 0) {
      const currentCommands = session[0].commandsUsed || [];
      if (!currentCommands.includes(command)) {
        await db
          .update(interactionSessions)
          .set({ 
            commandsUsed: [...currentCommands, command],
          })
          .where(eq(interactionSessions.id, sessionId));
      }
    }
  }

  // Track blockchain query
  if (heroIdQueried || walletQueried) {
    await db
      .update(interactionSessions)
      .set({ 
        blockchainQueriesMade: sql`${interactionSessions.blockchainQueriesMade} + 1`,
      })
      .where(eq(interactionSessions.id, sessionId));
  }

  return message;
}

// ============================================================================
// TOPIC INFERENCE
// ============================================================================

/**
 * Infer topic from user message content
 * @param {string} message - User message
 * @returns {string|null} Topic tag
 */
export function inferTopic(message) {
  const lowerMessage = message.toLowerCase();

  // Onboarding keywords
  if (/\b(start|begin|new|first time|how do i|getting started)\b/i.test(lowerMessage)) {
    return 'onboarding';
  }

  // Heroes/Classes
  if (/\b(hero|heroes|class|classes|warrior|knight|thief|archer|priest|wizard|monk|pirate|paladin|dragoon|ninja|sage)\b/i.test(lowerMessage)) {
    return 'heroes';
  }

  // Gardens/Yield
  if (/\b(garden|gardens|pool|pools|apr|yield|liquidity|lp|staking|farm|farming)\b/i.test(lowerMessage)) {
    return 'gardens';
  }

  // Quests
  if (/\b(quest|quests|mining|fishing|foraging|gardening quest)\b/i.test(lowerMessage)) {
    return 'quests';
  }

  // Summoning
  if (/\b(summon|summoning|breeding|genes|genetics|parents)\b/i.test(lowerMessage)) {
    return 'summoning';
  }

  // Marketplace/Valuation
  if (/\b(market|marketplace|tavern|buy|sell|price|value|valuation|worth)\b/i.test(lowerMessage)) {
    return 'marketplace';
  }

  // Professions
  if (/\b(profession|professions|mining|gardening|fishing|foraging)\b/i.test(lowerMessage)) {
    return 'professions';
  }

  // Lore/Events
  if (/\b(lore|story|event|events|serendale|crystalvale)\b/i.test(lowerMessage)) {
    return 'lore';
  }

  return null;
}

// ============================================================================
// WALLET LINKING
// ============================================================================

/**
 * Link a wallet to a player
 * @param {number} playerId - Player ID
 * @param {string} walletAddress - Wallet address
 */
export async function linkWallet(playerId, walletAddress) {
  const player = await db
    .select()
    .from(players)
    .where(eq(players.id, playerId))
    .limit(1);

  if (player.length === 0) return;

  const currentWallets = player[0].wallets || [];
  
  // Add wallet if not already linked
  if (!currentWallets.includes(walletAddress.toLowerCase())) {
    const updatedWallets = [...currentWallets, walletAddress.toLowerCase()];
    
    await db
      .update(players)
      .set({ 
        wallets: updatedWallets,
        primaryWallet: player[0].primaryWallet || walletAddress.toLowerCase(),
      })
      .where(eq(players.id, playerId));

    console.log(`🔗 Wallet linked: ${walletAddress} to player ${playerId}`);

    // Check if this triggers state transition to Participant
    await updateEngagementState(playerId);

    // Log milestone
    await logMilestone({
      playerId,
      wallet: walletAddress.toLowerCase(),
      milestoneType: 'wallet_connected',
      completedAt: new Date(),
    });
  }
}

// ============================================================================
// MILESTONE TRACKING
// ============================================================================

/**
 * Log a conversion milestone
 * @param {Object} milestoneData - Milestone data
 */
export async function logMilestone(milestoneData) {
  const {
    playerId,
    wallet,
    milestoneType,
    completedAt = new Date(),
    realm = null,
    heroId = null,
    transactionHash = null,
    value = null,
    relatedSessionId = null,
    hedgeGuidanceProvided = false,
  } = milestoneData;

  // Check if milestone already exists
  const existing = await db
    .select()
    .from(conversionMilestones)
    .where(
      and(
        eq(conversionMilestones.playerId, playerId),
        eq(conversionMilestones.milestoneType, milestoneType)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    // Milestone already logged
    return existing[0];
  }

  // Get player first seen date for attribution
  const player = await db
    .select()
    .from(players)
    .where(eq(players.id, playerId))
    .limit(1);

  const daysSinceFirstInteraction = player.length > 0
    ? Math.floor((new Date(completedAt) - new Date(player[0].firstSeenAt)) / (1000 * 60 * 60 * 24))
    : 0;

  const [milestone] = await db
    .insert(conversionMilestones)
    .values({
      playerId,
      wallet,
      milestoneType,
      completedAt,
      realm,
      heroId,
      transactionHash,
      value,
      daysSinceFirstInteraction,
      relatedSessionId,
      hedgeGuidanceProvided,
    })
    .returning();

  // Update player total milestones
  await db
    .update(players)
    .set({ 
      totalMilestones: sql`${players.totalMilestones} + 1`,
    })
    .where(eq(players.id, playerId));

  console.log(`🎯 Milestone logged: ${milestoneType} for player ${playerId}`);

  // Check if this triggers state transition
  await updateEngagementState(playerId);

  return milestone;
}

// ============================================================================
// ENGAGEMENT STATE MACHINE
// ============================================================================

/**
 * Update player engagement state based on behavior
 * @param {number} playerId - Player ID
 */
export async function updateEngagementState(playerId) {
  const player = await db
    .select()
    .from(players)
    .where(eq(players.id, playerId))
    .limit(1);

  if (player.length === 0) return;

  const currentState = player[0].engagementState;
  
  // Get player's milestones
  const milestones = await db
    .select()
    .from(conversionMilestones)
    .where(eq(conversionMilestones.playerId, playerId));

  const milestoneTypes = milestones.map(m => m.milestoneType);

  // Get player's sessions (last 30 days)
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const recentSessions = await db
    .select()
    .from(interactionSessions)
    .where(
      and(
        eq(interactionSessions.playerId, playerId),
        gte(interactionSessions.startedAt, thirtyDaysAgo)
      )
    );

  const totalSessions = recentSessions.length;
  const totalMessages = recentSessions.reduce((sum, s) => sum + s.messageCount, 0);

  // State transition logic
  let newState = currentState;

  if (currentState === 'visitor') {
    // Visitor → Explorer: Multiple sessions or topics
    const topics = [...new Set(recentSessions.flatMap(s => s.topics || []))];
    if (totalSessions >= 2 || topics.length >= 3) {
      newState = 'explorer';
    }
  }

  if (currentState === 'visitor' || currentState === 'explorer') {
    // → Participant: Wallet connected
    if (milestoneTypes.includes('wallet_connected') || (player[0].wallets || []).length > 0) {
      newState = 'participant';
    }
  }

  if (currentState === 'participant' || currentState === 'explorer' || currentState === 'visitor') {
    // → Player: First meaningful in-game action
    const firstActions = ['first_quest', 'first_hero_purchase', 'first_summon', 'first_garden_deposit'];
    const hasFirstAction = milestoneTypes.some(t => firstActions.includes(t));
    if (hasFirstAction) {
      newState = 'player';
    }
  }

  if (currentState === 'player') {
    // → Active: Multiple in-game actions + regular sessions
    const activeActions = milestones.filter(m => 
      ['first_quest', 'first_hero_purchase', 'first_summon', 'first_garden_deposit', 'first_level_up'].includes(m.milestoneType)
    );
    if (activeActions.length >= 3 && totalSessions >= 5) {
      newState = 'active';
    }
  }

  if (currentState === 'active') {
    // → Committed: Strong long-term indicators
    const commitmentIndicators = ['first_summon', 'first_pet_link', 'first_bridge'];
    const hasCommitmentIndicators = milestoneTypes.filter(t => commitmentIndicators.includes(t)).length >= 2;
    const hasMultipleRealms = (player[0].wallets || []).length > 1 || milestoneTypes.includes('first_bridge');
    
    if (hasCommitmentIndicators || (totalSessions >= 10 && hasMultipleRealms)) {
      newState = 'committed';
    }
  }

  // Update state if changed
  if (newState !== currentState) {
    await db
      .update(players)
      .set({ 
        engagementState: newState,
        stateLastUpdated: new Date(),
      })
      .where(eq(players.id, playerId));

    console.log(`📈 Player ${playerId} state transition: ${currentState} → ${newState}`);
  }

  return newState;
}

// ============================================================================
// EXTRACTOR DETECTION
// ============================================================================

/**
 * Calculate extractor score for a player
 * @param {number} playerId - Player ID
 * @returns {Promise<number>} Extractor score (0-100)
 */
export async function calculateExtractorScore(playerId) {
  const player = await db
    .select()
    .from(players)
    .where(eq(players.id, playerId))
    .limit(1);

  if (player.length === 0) return 0;

  const primaryWallet = player[0].primaryWallet;
  if (!primaryWallet) return 0; // Can't assess without wallet

  // Get wallet activity
  const recentActivity = await db
    .select()
    .from(walletActivity)
    .where(eq(walletActivity.wallet, primaryWallet))
    .orderBy(desc(walletActivity.asOfDate))
    .limit(1);

  if (recentActivity.length === 0) return 0; // No on-chain data yet

  const activity = recentActivity[0];
  let score = 0;

  // HIGH WEIGHT SIGNALS (0-50 points)
  
  // Claim-sell pattern: High rewards claimed + immediately sold
  const claimSellRatio = activity.rewardsClaimed7d > 0 
    ? activity.rewardsSoldImmediately7d / activity.rewardsClaimed7d 
    : 0;
  
  if (claimSellRatio > 0.8 && activity.rewardsClaimed7d >= 5) {
    score += 30; // Very strong extractor signal
    await logExtractorSignal({
      playerId,
      wallet: primaryWallet,
      signalType: 'claim_sell_pattern',
      signalWeight: 30,
      evidence: { claimSellRatio, rewardsClaimed7d: activity.rewardsClaimed7d },
    });
  }

  // Floor flipping: Buying floor heroes and reselling quickly
  if (activity.floorHeroesFlipped7d >= 3) {
    score += 20;
    await logExtractorSignal({
      playerId,
      wallet: primaryWallet,
      signalType: 'floor_flip',
      signalWeight: 20,
      evidence: { floorHeroesFlipped7d: activity.floorHeroesFlipped7d },
    });
  }

  // MEDIUM WEIGHT SIGNALS (0-30 points)
  
  // No progression: No leveling, no summoning, no pets
  const hasProgression = activity.heroesLeveled30d > 0 || activity.summonsMade30d > 0 || activity.petsLinked > 0;
  if (!hasProgression && activity.questsCompleted30d > 10) {
    score += 15; // Questing but zero progression
    await logExtractorSignal({
      playerId,
      wallet: primaryWallet,
      signalType: 'no_progression',
      signalWeight: 15,
      evidence: { questsCompleted30d: activity.questsCompleted30d, noProgression: true },
    });
  }

  // Yield-only behavior: Only garden deposits/withdrawals, no other activity
  const onlyYieldFarming = activity.gardenDeposits30d > 0 && 
                          activity.heroesLeveled30d === 0 && 
                          activity.summonsMade30d === 0;
  if (onlyYieldFarming) {
    score += 10;
    await logExtractorSignal({
      playerId,
      wallet: primaryWallet,
      signalType: 'yield_only_behavior',
      signalWeight: 10,
      evidence: { gardenDeposits30d: activity.gardenDeposits30d },
    });
  }

  // WEAK SIGNALS (0-20 points)
  
  // Check interaction patterns from sessions
  const recentSessions = await db
    .select()
    .from(interactionSessions)
    .where(eq(interactionSessions.playerId, playerId))
    .limit(10);

  const topics = [...new Set(recentSessions.flatMap(s => s.topics || []))];
  const onlyAsksAboutYield = topics.length > 0 && topics.every(t => ['gardens', 'yield', 'marketplace'].includes(t));
  
  if (onlyAsksAboutYield && topics.length >= 3) {
    score += 10;
    await logExtractorSignal({
      playerId,
      wallet: primaryWallet,
      signalType: 'yield_only_questions',
      signalWeight: 10,
      evidence: { topics },
    });
  }

  // Short transactional sessions
  const avgSessionDuration = recentSessions.reduce((sum, s) => sum + (s.durationSeconds || 0), 0) / (recentSessions.length || 1);
  if (avgSessionDuration < 60 && recentSessions.length >= 5) {
    score += 5;
  }

  // Cap score at 100
  score = Math.min(score, 100);

  // Update player record
  const classification = score >= 60 ? 'extractor' : score >= 30 ? 'extractor_tending' : 'normal';
  
  await db
    .update(players)
    .set({ 
      extractorScore: score.toFixed(2),
      extractorClassification: classification,
      extractorLastUpdated: new Date(),
    })
    .where(eq(players.id, playerId));

  return score;
}

/**
 * Log an extractor signal
 */
async function logExtractorSignal(signalData) {
  await db.insert(extractorSignals).values({
    ...signalData,
    detectedAt: new Date(),
  });
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get player by Discord ID
 * @param {string} discordId - Discord user ID
 * @returns {Promise<Object|null>} Player record
 */
export async function getPlayerByDiscordId(discordId) {
  const result = await db
    .select()
    .from(players)
    .where(eq(players.discordId, discordId))
    .limit(1);

  return result.length > 0 ? result[0] : null;
}

/**
 * Get player stats
 * @param {number} playerId - Player ID
 * @returns {Promise<Object>} Player statistics
 */
export async function getPlayerStats(playerId) {
  const player = await db
    .select()
    .from(players)
    .where(eq(players.id, playerId))
    .limit(1);

  if (player.length === 0) return null;

  const milestones = await db
    .select()
    .from(conversionMilestones)
    .where(eq(conversionMilestones.playerId, playerId));

  const sessions = await db
    .select()
    .from(interactionSessions)
    .where(eq(interactionSessions.playerId, playerId));

  return {
    player: player[0],
    totalMilestones: milestones.length,
    totalSessions: sessions.length,
    milestones: milestones.map(m => m.milestoneType),
  };
}
