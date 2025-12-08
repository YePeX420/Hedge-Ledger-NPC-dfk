// player-profile-service.js
// Service layer for PlayerProfile CRUD operations
// Integrates with existing Drizzle ORM database

import { db } from './server/db.js';
import { players } from './shared/schema.js';
import { eq, sql, and, gte, desc, inArray } from 'drizzle-orm';
import { DEFAULT_PROFILE, ARCHETYPES, TIERS, STATES, BEHAVIOR_TAGS } from './classification-config.js';
import { classifyProfile, processEventAndReclassify, getProfileSummary } from './classification-engine.js';

// Simple in-memory LRU cache for profiles (max 1000 entries, 30min TTL)
const profileCache = new Map();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes
const CACHE_MAX_SIZE = 1000;

function getCachedProfile(key) {
  const entry = profileCache.get(key);
  if (entry && Date.now() - entry.timestamp < CACHE_TTL) {
    return entry.value;
  }
  profileCache.delete(key);
  return null;
}

function setCachedProfile(key, value) {
  if (profileCache.size >= CACHE_MAX_SIZE) {
    const firstKey = profileCache.keys().next().value;
    profileCache.delete(firstKey);
  }
  profileCache.set(key, { value, timestamp: Date.now() });
}

/**
 * PlayerProfile shape with enhanced classification data
 * @typedef {Object} PlayerProfile
 * @property {number} id
 * @property {string} discordId
 * @property {string|null} discordUsername
 * @property {string|null} walletAddress - Primary wallet
 * @property {string[]} wallets - All linked wallets
 * @property {string} archetype - GUEST, ADVENTURER, PLAYER, INVESTOR, EXTRACTOR
 * @property {number} tier - 0-4 access level
 * @property {string} state - CURIOUS, OPTIMIZING, EXPANDING, COMMITTED, EXTRACTING
 * @property {string[]} behaviorTags - Array of behavior tag strings
 * @property {Object} kpis - Key performance indicators
 * @property {Object|null} dfkSnapshot - Latest DFK wallet data
 * @property {Object} flags - Special flags (isExtractor, isWhale, isHighPotential)
 * @property {Object} meta - Metadata (createdAt, updatedAt, notes)
 */

// ============================================================================
// CORE CRUD OPERATIONS
// ============================================================================

/**
 * Get or create a player profile by Discord ID
 * @param {string} discordId - Discord user ID
 * @param {string} [discordUsername] - Discord username (optional)
 * @returns {Promise<PlayerProfile>} Player profile
 */
export async function getOrCreateProfileByDiscordId(discordId, discordUsername = null) {
  // Check cache first
  const cacheKey = `discord:${discordId}`;
  const cached = getCachedProfile(cacheKey);
  if (cached) {
    console.log(`[ProfileService] Cache hit for ${discordId}`);
    return cached;
  }

  // Try to find existing player
  const existing = await db
    .select()
    .from(players)
    .where(eq(players.discordId, discordId))
    .limit(1);

  if (existing.length > 0) {
    const player = existing[0];
    
    // Update last seen and username if provided (async, don't await)
    db.update(players)
      .set({ 
        lastSeenAt: new Date(),
        discordUsername: discordUsername || player.discordUsername,
        updatedAt: new Date()
      })
      .where(eq(players.id, player.id))
      .catch(err => console.error('[ProfileService] Failed to update last seen:', err));
    
    const profile = dbRowToProfile(player);
    setCachedProfile(cacheKey, profile);
    return profile;
  }

  // Create new player with default profile
  const newProfile = {
    discordId,
    discordUsername: discordUsername || `User-${discordId.slice(-6)}`,
    engagementState: 'visitor',
    extractorClassification: 'normal',
    extractorScore: '0.00',
    wallets: [],
    // Store enhanced profile data as JSON in existing fields or extend schema
    profileData: JSON.stringify({
      archetype: DEFAULT_PROFILE.archetype,
      tier: DEFAULT_PROFILE.tier,
      state: DEFAULT_PROFILE.state,
      behaviorTags: DEFAULT_PROFILE.behaviorTags,
      kpis: DEFAULT_PROFILE.kpis,
      dfkSnapshot: null,
      flags: DEFAULT_PROFILE.flags,
      recentMessages: []
    })
  };

  const [newPlayer] = await db
    .insert(players)
    .values(newProfile)
    .returning();

  console.log(`[ProfileService] New profile created: ${discordUsername || discordId}`);
  
  return dbRowToProfile(newPlayer);
}

/**
 * Get or create a player profile by wallet address
 * @param {string} walletAddress - Ethereum wallet address
 * @returns {Promise<PlayerProfile|null>} Player profile or null if no match
 */
export async function getOrCreateProfileByWallet(walletAddress) {
  const normalizedWallet = walletAddress.toLowerCase();
  
  // Find player with this wallet in their wallets array or primary wallet
  const existing = await db
    .select()
    .from(players)
    .where(eq(players.primaryWallet, normalizedWallet))
    .limit(1);

  if (existing.length > 0) {
    return dbRowToProfile(existing[0]);
  }

  // Check if wallet exists in any player's wallets array
  // This is a JSON array search - may need to iterate in memory
  const allPlayers = await db.select().from(players);
  
  for (const player of allPlayers) {
    const wallets = player.wallets || [];
    if (wallets.includes(normalizedWallet)) {
      return dbRowToProfile(player);
    }
  }

  // No existing player with this wallet - return null
  // (Wallet-only profiles require Discord interaction first)
  return null;
}

/**
 * Get profile by player ID
 * @param {number} playerId - Database player ID
 * @returns {Promise<PlayerProfile|null>}
 */
export async function getProfileById(playerId) {
  // Check cache first
  const cacheKey = `id:${playerId}`;
  const cached = getCachedProfile(cacheKey);
  if (cached) return cached;

  const result = await db
    .select()
    .from(players)
    .where(eq(players.id, playerId))
    .limit(1);

  if (result.length > 0) {
    const profile = dbRowToProfile(result[0]);
    setCachedProfile(cacheKey, profile);
    return profile;
  }
  return null;
}

/**
 * Update a player profile
 * @param {PlayerProfile} profile - Updated profile object
 * @returns {Promise<PlayerProfile>} Updated profile
 */
export async function updateProfile(profile) {
  const updateData = {
    updatedAt: new Date(),
    lastSeenAt: new Date(),
    discordUsername: profile.discordUsername,
    primaryWallet: profile.walletAddress,
    wallets: profile.wallets || [],
    // Map profile data back to DB columns
    engagementState: mapStateToEngagementState(profile.state),
    extractorClassification: profile.flags?.isExtractor ? 'extractor' : 
                             (profile.extractorScore >= 30 ? 'extractor_tending' : 'normal'),
    extractorScore: (profile.extractorScore || 0).toFixed(2),
    totalMessages: profile.kpis?.messagesLast7d || 0, // Simplified - would need proper aggregation
    // Store enhanced profile data
    profileData: JSON.stringify({
      archetype: profile.archetype,
      tier: profile.tier,
      state: profile.state,
      behaviorTags: profile.behaviorTags,
      kpis: profile.kpis,
      dfkSnapshot: profile.dfkSnapshot,
      flags: profile.flags,
      recentMessages: profile.recentMessages || [],
      intentArchetype: profile.intentArchetype,
      intentScores: profile.intentScores
    })
  };

  await db
    .update(players)
    .set(updateData)
    .where(eq(players.id, profile.id));

  // Invalidate cache on update
  profileCache.delete(`id:${profile.id}`);
  profileCache.delete(`discord:${profile.discordId}`);

  return profile;
}

/**
 * Link a wallet to a Discord user's profile
 * @param {string} discordId - Discord user ID
 * @param {string} walletAddress - Wallet address to link
 * @returns {Promise<PlayerProfile>} Updated profile
 */
export async function setWalletForDiscord(discordId, walletAddress) {
  const normalizedWallet = walletAddress.toLowerCase();
  
  // Get existing profile
  const profile = await getOrCreateProfileByDiscordId(discordId);
  
  // Add wallet if not already linked
  const currentWallets = profile.wallets || [];
  if (!currentWallets.includes(normalizedWallet)) {
    currentWallets.push(normalizedWallet);
  }
  
  // Set as primary if no primary exists
  if (!profile.walletAddress) {
    profile.walletAddress = normalizedWallet;
  }
  
  profile.wallets = currentWallets;
  
  // Save and return
  return updateProfile(profile);
}

/**
 * List profiles with optional filtering
 * @param {Object} [filter] - Filter criteria
 * @returns {Promise<PlayerProfile[]>} Array of profiles
 */
export async function listProfiles(filter = {}) {
  let query = db.select().from(players);
  
  // Apply filters
  const conditions = [];
  
  if (filter.archetype) {
    // Would need to parse profileData JSON - simplified for now
  }
  
  if (filter.tier !== undefined) {
    // Would need to parse profileData JSON - simplified for now
  }
  
  if (filter.minEngagement) {
    // Would need to parse profileData JSON - simplified for now
  }
  
  // For now, just return all and filter in memory
  const allPlayers = await query.orderBy(desc(players.lastSeenAt)).limit(filter.limit || 100);
  
  const profiles = allPlayers.map(p => dbRowToProfile(p));
  
  // Apply in-memory filters
  let filtered = profiles;
  
  if (filter.archetype) {
    filtered = filtered.filter(p => p.archetype === filter.archetype);
  }
  
  if (filter.tier !== undefined) {
    filtered = filtered.filter(p => p.tier === filter.tier);
  }
  
  if (filter.isWhale) {
    filtered = filtered.filter(p => p.flags?.isWhale);
  }
  
  if (filter.isExtractor) {
    filtered = filtered.filter(p => p.flags?.isExtractor);
  }
  
  return filtered;
}

// ============================================================================
// EVENT PROCESSING
// ============================================================================

/**
 * Process a classification event for a player and save
 * @param {string} discordId - Discord user ID
 * @param {Object} event - Classification event
 * @param {string} [discordUsername] - Username if known
 * @returns {Promise<PlayerProfile>} Updated profile
 */
export async function processEventForPlayer(discordId, event, discordUsername = null) {
  // Get current profile
  const profile = await getOrCreateProfileByDiscordId(discordId, discordUsername);
  
  // Process event through classification engine
  const updatedProfile = processEventAndReclassify(profile, event);
  
  // Save updated profile
  return updateProfile(updatedProfile);
}

/**
 * Trigger a wallet scan event for a player
 * @param {string} discordId - Discord user ID
 * @param {Object} walletData - DFK snapshot data
 * @returns {Promise<PlayerProfile>} Updated profile
 */
export async function triggerWalletScan(discordId, walletData) {
  const event = {
    type: 'WALLET_SCAN',
    payload: {
      heroCount: walletData.heroCount || 0,
      petCount: walletData.petCount || 0,
      lpPositionsCount: walletData.lpPositionsCount || 0,
      totalLPValue: walletData.totalLPValue || 0,
      jewelBalance: walletData.jewelBalance || 0,
      crystalBalance: walletData.crystalBalance || 0,
      questingStreakDays: walletData.questingStreakDays || 0
    },
    timestamp: new Date()
  };
  
  return processEventForPlayer(discordId, event);
}

/**
 * Log a Discord message and update profile
 * @param {string} discordId - Discord user ID
 * @param {string} messageContent - Message content
 * @param {string} [discordUsername] - Username if known
 * @returns {Promise<PlayerProfile>} Updated profile
 */
export async function logDiscordMessage(discordId, messageContent, discordUsername = null) {
  const event = {
    type: 'DISCORD_MESSAGE',
    payload: {
      messageContent
    },
    timestamp: new Date()
  };
  
  return processEventForPlayer(discordId, event, discordUsername);
}

/**
 * Set tier override for a player (admin function)
 * @param {string} discordId - Discord user ID
 * @param {number} tier - New tier (0-4)
 * @returns {Promise<PlayerProfile>} Updated profile
 */
export async function setTierOverride(discordId, tier) {
  const profile = await getOrCreateProfileByDiscordId(discordId);
  profile.tier = tier;
  profile.tierOverride = tier;
  return updateProfile(profile);
}

/**
 * Force reclassification of a player
 * @param {string} discordId - Discord user ID
 * @returns {Promise<PlayerProfile>} Reclassified profile
 */
export async function forceReclassify(discordId) {
  const profile = await getOrCreateProfileByDiscordId(discordId);
  const reclassified = classifyProfile(profile);
  return updateProfile(reclassified);
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Convert database row to PlayerProfile object
 * @param {Object} row - Database row
 * @returns {PlayerProfile}
 */
function dbRowToProfile(row) {
  // Try to parse stored profile data
  let profileData = null;
  try {
    if (row.profileData) {
      profileData = typeof row.profileData === 'string' 
        ? JSON.parse(row.profileData) 
        : row.profileData;
    }
  } catch (e) {
    console.warn(`[ProfileService] Failed to parse profileData for player ${row.id}`);
  }
  
  // Merge stored data with row data
  return {
    id: row.id,
    discordId: row.discordId,
    discordUsername: row.discordUsername,
    walletAddress: row.primaryWallet,
    wallets: row.wallets || [],
    
    // Classification data from profileData or defaults
    archetype: profileData?.archetype || ARCHETYPES.GUEST,
    tier: profileData?.tier ?? TIERS.TIER_0,
    tierOverride: profileData?.tierOverride,
    state: profileData?.state || STATES.CURIOUS,
    behaviorTags: profileData?.behaviorTags || [BEHAVIOR_TAGS.NEWCOMER],
    kpis: profileData?.kpis || { ...DEFAULT_PROFILE.kpis },
    dfkSnapshot: profileData?.dfkSnapshot || null,
    flags: profileData?.flags || { ...DEFAULT_PROFILE.flags },
    recentMessages: profileData?.recentMessages || [],
    intentArchetype: profileData?.intentArchetype || null,
    intentScores: profileData?.intentScores || null,
    
    // Existing DB fields
    extractorScore: parseFloat(row.extractorScore || 0),
    extractorClassification: row.extractorClassification,
    engagementState: row.engagementState,
    totalSessions: row.totalSessions || 0,
    totalMessages: row.totalMessages || 0,
    totalMilestones: row.totalMilestones || 0,
    
    // Metadata
    firstSeenAt: row.firstSeenAt,
    lastSeenAt: row.lastSeenAt,
    updatedAt: row.updatedAt,
    stateLastUpdated: row.stateLastUpdated
  };
}

/**
 * Map profile state to legacy engagement state
 */
function mapStateToEngagementState(state) {
  const mapping = {
    [STATES.CURIOUS]: 'visitor',
    [STATES.OPTIMIZING]: 'explorer',
    [STATES.EXPANDING]: 'player',
    [STATES.COMMITTED]: 'committed',
    [STATES.EXTRACTING]: 'active' // Extractors are still "active" in old system
  };
  return mapping[state] || 'visitor';
}

/**
 * Get a quick profile summary for display
 * @param {string} discordId - Discord user ID
 * @returns {Promise<Object>} Profile summary
 */
export async function getQuickProfileSummary(discordId) {
  const profile = await getOrCreateProfileByDiscordId(discordId);
  return getProfileSummary(profile);
}

export default {
  getOrCreateProfileByDiscordId,
  getOrCreateProfileByWallet,
  getProfileById,
  updateProfile,
  setWalletForDiscord,
  listProfiles,
  processEventForPlayer,
  triggerWalletScan,
  logDiscordMessage,
  setTierOverride,
  forceReclassify,
  getQuickProfileSummary
};
