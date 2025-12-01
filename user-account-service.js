// user-account-service.js
// Helper service for user account dashboard
// Retrieves and structures user profile data for the /account command

import { db } from './server/db.js';
import { players, walletSnapshots } from './shared/schema.ts';
import { eq, desc } from 'drizzle-orm';

/**
 * Get or create user profile for account dashboard
 * @param {string} discordId - Discord user ID
 * @param {string} username - Discord username
 * @returns {Promise<Object>} User profile object
 */
export async function getOrCreateUserProfile(discordId, username) {
  try {
    // Try to find existing player
    const existing = await db
      .select()
      .from(players)
      .where(eq(players.discordId, discordId))
      .limit(1);

    let player;
    if (existing.length === 0) {
      // Create new player
      const newPlayer = {
        discordId,
        discordUsername: username,
        wallets: [],
        engagementState: 'visitor',
        extractorScore: '0.00',
        extractorClassification: 'normal',
        profileData: JSON.stringify({
          archetype: 'GUEST',
          tier: 0,
          state: 'VISITOR',
          behaviorTags: [],
          kpis: {
            engagementScore: 0,
            financialScore: 0,
            retentionScore: 0,
            messagesLast7d: 0,
            adviceFollowedCount: 0,
            recommendationsClicked: 0
          },
          dfkSnapshot: null,
          flags: {
            isExtractor: false,
            isWhale: false,
            isHighPotential: false
          },
          recentMessages: []
        })
      };

      const [created] = await db.insert(players).values(newPlayer).returning();
      player = created;
      console.log(`[UserAccountService] Created new player: ${username}`);
    } else {
      player = existing[0];
    }

    // Map tier number to readable string
    const tierNames = {
      0: 'Unranked',
      1: 'Bronze',
      2: 'Silver',
      3: 'Gold',
      4: 'Mythic'
    };

    let profileData;
    try {
      profileData = player.profileData ? JSON.parse(player.profileData) : null;
    } catch {
      profileData = null;
    }

    const tier = profileData?.tier || 0;
    const tierName = tierNames[tier] || 'Unranked';

    // Get wallet snapshots for this player
    const snapshots = await db
      .select()
      .from(walletSnapshots)
      .where(eq(walletSnapshots.playerId, player.id))
      .orderBy(desc(walletSnapshots.asOfDate))
      .limit(100);

    // Build wallet objects from player wallets array
    const wallets = (player.wallets || []).map((walletAddr, idx) => ({
      id: idx,
      address: walletAddr,
      chain: 'dfk-chain', // Placeholder - will be enhanced later
      verified: player.primaryWallet === walletAddr // Primary wallet is considered verified
    }));

    // Build LP positions from wallet snapshots (placeholder for now)
    const lpPositions = (snapshots || []).slice(0, 5).map((snapshot, idx) => ({
      id: snapshot.id,
      poolName: 'CRYSTAL-JEWEL', // Placeholder
      chain: 'dfk-chain',
      lpAmount: (parseFloat(snapshot.jewelBalance) || 0).toFixed(2),
      apr24h: (Math.random() * 100).toFixed(1) // Placeholder - will be calculated from DFK data
    }));

    // Calculate total queries (from profileData if available)
    const totalQueries = profileData?.kpis?.messagesLast7d || 0;

    return {
      discordId,
      discordUsername: player.discordUsername,
      tier: tierName,
      totalQueries,
      wallets,
      lpPositions,
      createdAt: player.firstSeenAt
    };

  } catch (error) {
    console.error('[UserAccountService] Error:', error);
    // Return safe fallback
    return {
      discordId,
      discordUsername: username,
      tier: 'Unranked',
      totalQueries: 0,
      wallets: [],
      lpPositions: [],
      createdAt: new Date()
    };
  }
}
