import type { Express } from "express";
import { createServer, type Server } from "http";
import { db } from "./db";
import { players, jewelBalances, depositRequests, queryCosts, interactionSessions, interactionMessages, walletSnapshots, adminSessions, bridgeEvents, walletBridgeMetrics, historicalPrices, walletClusters, walletLinks } from "@shared/schema";
import { desc, sql, eq, inArray, gte, lte } from "drizzle-orm";
import { getDebugSettings, setDebugSettings } from "../debug-settings.js";
import { detectWalletLPPositions } from "../wallet-lp-detector.js";
// buildPlayerSnapshot is imported dynamically in the route handler to avoid import issues
import { indexWallet, runFullIndex, getLatestBlock, getIndexerProgress, initIndexerProgress, runWorkerBatch, getAllWorkerProgress, getWorkerIndexerName, MAIN_INDEXER_NAME } from "../bridge-tracker/bridge-indexer.js";
import { getTopExtractors, refreshWalletMetrics, getWalletSummary, refreshAllMetrics } from "../bridge-tracker/bridge-metrics.js";
import { backfillAllTokens, fetchCurrentPrices } from "../bridge-tracker/price-history.js";

// Debug: Verify bridge indexer imports
console.log('[BridgeIndexer] Import check - runFullIndex type:', typeof runFullIndex);
console.log('[BridgeIndexer] Import check - indexWallet type:', typeof indexWallet);

const ADMIN_USER_IDS = ['426019696916168714']; // yepex

// Admin middleware - database-backed sessions
async function isAdmin(req: any, res: any, next: any) {
  try {
    const sessionToken = req.cookies?.session_token;
    console.log(`[AdminAuth] Checking session. Cookie: ${sessionToken ? sessionToken.substring(0, 16) + '...' : 'NONE'}`);
    
    if (!sessionToken) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    
    // Fetch session from database
    const sessions = await db.select().from(adminSessions).where(eq(adminSessions.sessionToken, sessionToken));
    console.log(`[AdminAuth] Found ${sessions.length} session(s) in DB`);
    
    if (!sessions || sessions.length === 0) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    
    const session = sessions[0];
    console.log(`[AdminAuth] Session found: discordId=${session.discordId}, expires=${session.expiresAt}`);
    
    // Check expiration
    if (new Date(session.expiresAt) < new Date()) {
      await db.delete(adminSessions).where(eq(adminSessions.sessionToken, sessionToken));
      return res.status(401).json({ error: 'Session expired' });
    }
    
    console.log(`🔍 Admin check - userId: ${session.discordId}, admins: [${ADMIN_USER_IDS.join(', ')}], match: ${ADMIN_USER_IDS.includes(session.discordId)}`);
    if (!ADMIN_USER_IDS.includes(session.discordId)) {
      return res.status(403).json({ error: 'Access denied: Administrator only' });
    }
    
    req.user = { userId: session.discordId, username: session.username, avatar: session.avatar };
    next();
  } catch (err) {
    console.error('❌ Admin middleware error:', err);
    res.status(500).json({ error: 'Authentication check failed' });
  }
}

// User middleware - database-backed sessions (any authenticated user)
async function isUser(req: any, res: any, next: any) {
  try {
    const sessionToken = req.cookies?.session_token;
    
    if (!sessionToken) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    
    // Fetch session from database
    const sessions = await db.select().from(adminSessions).where(eq(adminSessions.sessionToken, sessionToken));
    
    if (!sessions || sessions.length === 0) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    
    const session = sessions[0];
    
    // Check expiration
    if (new Date(session.expiresAt) < new Date()) {
      await db.delete(adminSessions).where(eq(adminSessions.sessionToken, sessionToken));
      return res.status(401).json({ error: 'Session expired' });
    }
    
    req.user = { userId: session.discordId, username: session.username, avatar: session.avatar };
    next();
  } catch (err) {
    console.error('❌ User middleware error:', err);
    res.status(500).json({ error: 'Authentication check failed' });
  }
}

// Helper function to get wallets for a user with auto-backfill from legacy primaryWallet
async function getWalletsForUser(discordId: string) {
  // 1) Find player by discordId
  const player = await db.select().from(players).where(eq(players.discordId, discordId)).limit(1);
  if (!player || player.length === 0) return [];
  
  // 2) Resolve or create cluster for this user
  let cluster = await db.select().from(walletClusters).where(eq(walletClusters.userId, discordId)).limit(1);
  
  if (!cluster || cluster.length === 0) {
    const inserted = await db
      .insert(walletClusters)
      .values({
        userId: discordId,
        clusterKey: `cluster-${discordId}`,
      })
      .returning();
    cluster = inserted;
  }
  
  const clusterKey = cluster[0].clusterKey;
  
  // 3) Load existing wallet_links for this cluster
  let links = await db.select().from(walletLinks).where(eq(walletLinks.clusterKey, clusterKey));
  
  // 4) Auto-backfill from players.primaryWallet if no links yet
  if ((!links || links.length === 0) && player[0].primaryWallet) {
    // Normalize address to lowercase to avoid duplicates
    const normalizedAddress = player[0].primaryWallet.toLowerCase();
    const inserted = await db
      .insert(walletLinks)
      .values({
        clusterKey: clusterKey,
        chain: 'DFKCHAIN',
        address: normalizedAddress,
        isPrimary: true,
        isActive: true,
      })
      .returning();
    links = inserted;
  }
  
  // 5) Map to API shape
  return links.map((wl) => ({
    address: wl.address,
    chain: wl.chain,
    isPrimary: wl.isPrimary,
    isActive: wl.isActive,
    isVerified: false, // Future feature
    verifiedAt: null,
    verificationTxHash: null,
  }));
}

export async function registerRoutes(app: Express): Promise<Server> {
  // ============================================================================
  // USER API ROUTES (Authenticated users)
  // ============================================================================
  
  // GET /api/me/wallets - Get user's linked wallets with auto-backfill from legacy primaryWallet
  app.get("/api/me/wallets", isUser, async (req: any, res: any) => {
    try {
      const discordId = req.user.userId;
      const wallets = await getWalletsForUser(discordId);
      res.json({ wallets });
    } catch (error) {
      console.error('[API] Error fetching user wallets:', error);
      res.status(500).json({ error: 'Failed to fetch wallets' });
    }
  });

  // Analytics API Routes
  
  // GET /api/analytics/overview - Dashboard overview metrics
  app.get("/api/analytics/overview", async (req: any, res: any) => {
    try {
      const [playerStats, depositStats, balanceStats, revenueStats] = await Promise.all([
        // Player stats
        db.select({
          total: sql`COUNT(*)`,
          withBalance: sql`COUNT(CASE WHEN EXISTS(SELECT 1 FROM ${jewelBalances} WHERE ${jewelBalances.playerId} = ${players.id}) THEN 1 END)`
        }).from(players),
        
        // Deposit stats
        db.select({
          total: sql`COUNT(*)`,
          completed: sql`SUM(CASE WHEN ${depositRequests.status} = 'completed' THEN 1 ELSE 0 END)`,
          totalJewel: sql`COALESCE(SUM(CASE WHEN ${depositRequests.status} = 'completed' THEN CAST(${depositRequests.requestedAmountJewel} AS DECIMAL) ELSE 0 END), 0)`,
        }).from(depositRequests),
        
        // Balance stats
        db.select({
          totalBalance: sql`COALESCE(SUM(CAST(${jewelBalances.balanceJewel} AS DECIMAL)), 0)`,
          activeBalances: sql`COUNT(CASE WHEN CAST(${jewelBalances.balanceJewel} AS DECIMAL) > 0 THEN 1 END)`
        }).from(jewelBalances),
        
        // Revenue stats from query costs
        db.select({
          totalRevenue: sql`COALESCE(SUM(${queryCosts.revenueUsd}), 0)`,
          totalProfit: sql`COALESCE(SUM(${queryCosts.profitUsd}), 0)`,
          totalQueries: sql`COUNT(*)`,
          paidQueries: sql`SUM(CASE WHEN NOT ${queryCosts.freeTierUsed} THEN 1 ELSE 0 END)`
        }).from(queryCosts)
      ]);
      
      res.json({
        players: {
          total: playerStats[0].total,
          withBalance: playerStats[0].withBalance
        },
        deposits: {
          total: depositStats[0].total,
          completed: depositStats[0].completed || 0,
          totalJewel: depositStats[0].totalJewel
        },
        balances: {
          totalBalance: balanceStats[0].totalBalance,
          activeBalances: balanceStats[0].activeBalances || 0
        },
        revenue: {
          totalRevenue: revenueStats[0].totalRevenue,
          totalProfit: revenueStats[0].totalProfit,
          totalQueries: revenueStats[0].totalQueries,
          paidQueries: revenueStats[0].paidQueries || 0
        }
      });
    } catch (error) {
      console.error('[API] Error fetching overview:', error);
      res.status(500).json({ error: 'Failed to fetch overview data' });
    }
  });
  
  // GET /api/analytics/players - Player list with pagination
  app.get("/api/analytics/players", async (req: any, res: any) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;
      
      const playerList = await db
        .select({
          id: players.id,
          discordId: players.discordId,
          discordUsername: players.discordUsername,
          tier: jewelBalances.tier,
          balance: jewelBalances.balanceJewel,
          firstSeenAt: players.firstSeenAt
        })
        .from(players)
        .leftJoin(jewelBalances, eq(players.id, jewelBalances.playerId))
        .orderBy(desc(players.firstSeenAt))
        .limit(limit)
        .offset(offset);
      
      res.json(playerList);
    } catch (error) {
      console.error('[API] Error fetching players:', error);
      res.status(500).json({ error: 'Failed to fetch players' });
    }
  });
  
  // GET /api/analytics/deposits - Recent deposits
  app.get("/api/analytics/deposits", async (req: any, res: any) => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      
      const deposits = await db
        .select({
          id: depositRequests.id,
          playerId: depositRequests.playerId,
          discordUsername: players.discordUsername,
          requestedAmount: depositRequests.requestedAmountJewel,
          uniqueAmount: depositRequests.uniqueAmountJewel,
          status: depositRequests.status,
          transactionHash: depositRequests.transactionHash,
          requestedAt: depositRequests.requestedAt,
          completedAt: depositRequests.completedAt
        })
        .from(depositRequests)
        .leftJoin(players, eq(depositRequests.playerId, players.id))
        .orderBy(desc(depositRequests.requestedAt))
        .limit(limit);
      
      res.json(deposits);
    } catch (error) {
      console.error('[API] Error fetching deposits:', error);
      res.status(500).json({ error: 'Failed to fetch deposits' });
    }
  });
  
  // GET /api/analytics/query-breakdown - Query type breakdown
  app.get("/api/analytics/query-breakdown", async (req: any, res: any) => {
    try {
      const breakdown = await db
        .select({
          queryType: queryCosts.queryType,
          count: sql`COUNT(*)`,
          totalRevenue: sql`COALESCE(SUM(${queryCosts.revenueUsd}), 0)`,
          freeTier: sql`SUM(CASE WHEN ${queryCosts.freeTierUsed} THEN 1 ELSE 0 END)`
        })
        .from(queryCosts)
        .groupBy(queryCosts.queryType)
        .orderBy(desc(sql`COUNT(*)`));
      
      res.json(breakdown);
    } catch (error) {
      console.error('[API] Error fetching query breakdown:', error);
      res.status(500).json({ error: 'Failed to fetch query breakdown' });
    }
  });

  // Admin API Routes
  
  // GET /api/admin/users/basic - Fast endpoint returning just player table data
  app.get("/api/admin/users/basic", isAdmin, async (req: any, res: any) => {
    try {
      const userList = await db
        .select({
          id: players.id,
          discordId: players.discordId,
          discordUsername: players.discordUsername,
          walletAddress: players.primaryWallet,
          profileData: players.profileData,
          firstSeenAt: players.firstSeenAt,
          totalMessages: players.totalMessages,
        })
        .from(players)
        .orderBy(desc(players.firstSeenAt));
      
      const basicUsers = userList.map((user) => {
        let profileData = null;
        try {
          if (user.profileData) {
            profileData = typeof user.profileData === 'string' 
              ? JSON.parse(user.profileData)
              : user.profileData;
          }
        } catch (e) {
          console.warn(`Failed to parse profileData for user ${user.id}`);
        }

        return {
          id: user.id,
          discordId: user.discordId,
          discordUsername: user.discordUsername,
          walletAddress: user.walletAddress,
          firstSeenAt: user.firstSeenAt,
          totalMessages: user.totalMessages,
          archetype: profileData?.archetype || 'GUEST',
          tier: profileData?.tier ?? 0,
          state: profileData?.state || 'CURIOUS',
          behaviorTags: profileData?.behaviorTags || [],
          kpis: profileData?.kpis || {},
          dfkSnapshot: profileData?.dfkSnapshot || null,
          flags: profileData?.flags || {},
        };
      });
      
      res.json({ success: true, users: basicUsers });
    } catch (error) {
      console.error('[API] Error fetching basic users:', error);
      res.status(500).json({ error: 'Failed to fetch users' });
    }
  });
  
  // GET /api/admin/users - Comprehensive user management list (kept for backward compatibility)
  app.get("/api/admin/users", isAdmin, async (req: any, res: any) => {
    try {
      // Fetch all players first
      const userList = await db
        .select({
          id: players.id,
          discordId: players.discordId,
          discordUsername: players.discordUsername,
          walletAddress: players.primaryWallet,
          profileData: players.profileData,
          firstSeenAt: players.firstSeenAt,
          totalMessages: players.totalMessages,
        })
        .from(players)
        .orderBy(desc(players.firstSeenAt));
      
      console.log(`[API] /api/admin/users fetched ${userList.length} players`);
      if (userList.length > 0) {
        console.log(`[API] First player raw data:`, JSON.stringify(userList[0], null, 2));
      }
      const playerIds = userList.map(u => u.id);
      
      // Early return if no players exist
      if (playerIds.length === 0) {
        return res.json({ success: true, users: [] });
      }
      
      // Fetch balance data for all players
      const balanceMap = new Map<number, any>();
      if (playerIds.length > 0) {
        const balances = await db
          .select({
            playerId: jewelBalances.playerId,
            tier: jewelBalances.tier,
            balance: jewelBalances.balanceJewel,
            lifetimeDeposits: jewelBalances.lifetimeDepositsJewel,
            lastQueryAt: jewelBalances.lastQueryAt,
          })
          .from(jewelBalances)
          .where(inArray(jewelBalances.playerId, playerIds));
        
        balances.forEach(b => balanceMap.set(b.playerId, b));
      }
      
      // Batch query: Get all query stats grouped by player (single query)
      const allQueryStats = await db
        .select({
          playerId: queryCosts.playerId,
          totalQueries: sql`COUNT(*)`,
          totalCost: sql`COALESCE(SUM(${queryCosts.revenueUsd}), 0)`,
          totalProfit: sql`COALESCE(SUM(${queryCosts.profitUsd}), 0)`,
          freeQueries: sql`SUM(CASE WHEN ${queryCosts.freeTierUsed} THEN 1 ELSE 0 END)`
        })
        .from(queryCosts)
        .where(inArray(queryCosts.playerId, playerIds))
        .groupBy(queryCosts.playerId);
      
      const queryStatsMap = new Map(allQueryStats.map(s => [s.playerId, s]));
      
      // Batch query: Get all deposit stats grouped by player (single query)
      const allDepositStats = await db
        .select({
          playerId: depositRequests.playerId,
          totalDeposits: sql`COUNT(*)`,
          completedDeposits: sql`SUM(CASE WHEN ${depositRequests.status} = 'completed' THEN 1 ELSE 0 END)`,
          totalJewel: sql`COALESCE(SUM(CASE WHEN ${depositRequests.status} = 'completed' THEN CAST(${depositRequests.requestedAmountJewel} AS DECIMAL) ELSE 0 END), 0)`,
          totalCrystal: sql`COALESCE(SUM(CASE WHEN ${depositRequests.status} = 'completed' THEN CAST(${depositRequests.requestedAmountCrystal} AS DECIMAL) ELSE 0 END), 0)`
        })
        .from(depositRequests)
        .where(inArray(depositRequests.playerId, playerIds))
        .groupBy(depositRequests.playerId);
      
      const depositStatsMap = new Map(allDepositStats.map(d => [d.playerId, d]));
      
      // Batch query: Get latest wallet snapshots for each player
      const latestSnapshots = await db
        .select({
          playerId: walletSnapshots.playerId,
          jewelBalance: walletSnapshots.jewelBalance,
          crystalBalance: walletSnapshots.crystalBalance,
          cJewelBalance: walletSnapshots.cJewelBalance,
          change7d: walletSnapshots.change7d,
        })
        .from(walletSnapshots)
        .where(inArray(walletSnapshots.playerId, playerIds))
        .orderBy(walletSnapshots.playerId, desc(walletSnapshots.asOfDate))
        .then(rows => {
          const map = new Map<number, typeof rows[0]>();
          rows.forEach(row => {
            if (!map.has(row.playerId)) {
              map.set(row.playerId, row);
            }
          });
          return map;
        });
      
      // Batch query: Get recent DM messages for all users (single query)
      const allMessages = await db
        .select({
          playerId: interactionMessages.playerId,
          content: interactionMessages.content,
          messageType: interactionMessages.messageType,
          timestamp: interactionMessages.timestamp
        })
        .from(interactionMessages)
        .innerJoin(interactionSessions, eq(interactionMessages.sessionId, interactionSessions.id))
        .where(sql`${inArray(interactionMessages.playerId, playerIds)} AND ${interactionSessions.channelType} = 'dm'`)
        .orderBy(desc(interactionMessages.timestamp))
        .limit(10 * playerIds.length); // Get up to 10 messages per user
      
      // Group messages by player
      const messagesByPlayer = new Map<number, typeof allMessages>();
      allMessages.forEach(msg => {
        if (!messagesByPlayer.has(msg.playerId)) {
          messagesByPlayer.set(msg.playerId, []);
        }
        const playerMsgs = messagesByPlayer.get(msg.playerId)!;
        if (playerMsgs.length < 10) {
          playerMsgs.push(msg);
        }
      });
      
      // Enrich users with batched data
      const enrichedUsers = userList.map((user) => {
        const balance = balanceMap.get(user.id) || {
          tier: 'free',
          balance: '0',
          lifetimeDeposits: '0',
          lastQueryAt: null,
        };
        
        const stats = queryStatsMap.get(user.id) || {
          totalQueries: 0,
          totalCost: '0',
          totalProfit: '0',
          freeQueries: 0
        };
        
        const deposits = depositStatsMap.get(user.id) || {
          totalDeposits: 0,
          completedDeposits: 0,
          totalJewel: '0',
          totalCrystal: '0'
        };
        
        // Generate conversation summary
        const recentMessages = messagesByPlayer.get(user.id) || [];
        let conversationSummary = 'No recent conversations';
        if (recentMessages.length > 0) {
          const userMessages = recentMessages
            .filter(m => m.messageType === 'user_message')
            .map(m => m.content)
            .slice(0, 5);
          
          if (userMessages.length > 0) {
            const topics = new Set<string>();
            userMessages.forEach(msg => {
              const lower = msg.toLowerCase();
              if (lower.includes('hero') || lower.includes('summon')) topics.add('Heroes');
              if (lower.includes('garden') || lower.includes('pool') || lower.includes('apr')) topics.add('Gardens');
              if (lower.includes('market') || lower.includes('buy') || lower.includes('sell')) topics.add('Marketplace');
              if (lower.includes('wallet') || lower.includes('balance')) topics.add('Wallet');
              if (lower.includes('quest')) topics.add('Questing');
              if (lower.includes('npc') || lower.includes('druid') || lower.includes('jeweler')) topics.add('NPCs');
            });
            
            conversationSummary = topics.size > 0 
              ? Array.from(topics).join(', ')
              : 'General questions';
          }
        }
        
        // Parse profile data
        let profileData = null;
        try {
          if (user.profileData) {
            profileData = typeof user.profileData === 'string' 
              ? JSON.parse(user.profileData)
              : user.profileData;
          }
        } catch (e) {
          console.warn(`Failed to parse profileData for user ${user.id}`);
        }

        const walletSnapshot = latestSnapshots.get(user.id);
        
        return {
          ...user,
          tier: balance.tier || 'free',
          balance: balance.balance || '0',
          lifetimeDeposits: balance.lifetimeDeposits || '0',
          lastQueryAt: balance.lastQueryAt,
          queryCount: stats.totalQueries || 0,
          queryCosts: stats.totalCost || '0',
          queryProfit: stats.totalProfit || '0',
          freeQueryCount: stats.freeQueries || 0,
          depositCount: deposits.totalDeposits || 0,
          completedDeposits: deposits.completedDeposits || 0,
          totalJewelProvided: deposits.totalJewel || '0',
          totalCrystalProvided: deposits.totalCrystal || '0',
          conversationSummary,
          userState: balance.lastQueryAt ? 'active' : 'inactive',
          conversionStatus: (deposits.completedDeposits || 0) > 0 ? 'converted' : 'free',
          profileData: profileData,
          archetype: profileData?.archetype || 'GUEST',
          state: profileData?.state || 'CURIOUS',
          behaviorTags: profileData?.behaviorTags || [],
          kpis: profileData?.kpis || {},
          dfkSnapshot: profileData?.dfkSnapshot || null,
          flags: profileData?.flags || {},
          walletBalances: walletSnapshot ? {
            jewel: walletSnapshot.jewelBalance,
            crystal: walletSnapshot.crystalBalance,
            cJewel: walletSnapshot.cJewelBalance,
            change7d: walletSnapshot.change7d,
          } : null
        };
      });
      
      res.json({ success: true, users: enrichedUsers });
    } catch (error) {
      console.error('[API] Error fetching users:', error);
      res.status(500).json({ error: 'Failed to fetch users' });
    }
  });
  
  // GET /api/admin/lp-positions/:wallet - Fetch LP positions for a wallet
  app.get("/api/admin/lp-positions/:wallet", isAdmin, async (req: any, res: any) => {
    try {
      const { wallet } = req.params;
      
      if (!wallet || !/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
        return res.status(400).json({ error: 'Invalid wallet address' });
      }
      
      console.log(`[API] Fetching LP positions for wallet: ${wallet}`);
      const positions = await detectWalletLPPositions(wallet);
      
      res.json({ 
        success: true, 
        wallet,
        positions,
        totalPositions: positions.length,
        totalValue: positions.reduce((sum: number, p: any) => sum + parseFloat(p.userTVL || '0'), 0).toFixed(2)
      });
    } catch (error) {
      console.error('[API] Error fetching LP positions:', error);
      res.status(500).json({ error: 'Failed to fetch LP positions' });
    }
  });
  
  // PATCH /api/admin/users/:id/tier - Update user tier manually
  app.patch("/api/admin/users/:id/tier", async (req: any, res: any) => {
    try {
      const userId = parseInt(req.params.id);
      const { tier } = req.body;
      
      if (!tier || !['free', 'bronze', 'silver', 'gold', 'whale'].includes(tier)) {
        return res.status(400).json({ error: 'Invalid tier. Must be one of: free, bronze, silver, gold, whale' });
      }
      
      // Validate that player exists
      const player = await db
        .select({ id: players.id })
        .from(players)
        .where(eq(players.id, userId))
        .limit(1);
      
      if (player.length === 0) {
        return res.status(404).json({ error: 'Player not found' });
      }
      
      // Check if user has a balance record
      const existingBalance = await db
        .select()
        .from(jewelBalances)
        .where(eq(jewelBalances.playerId, userId))
        .limit(1);
      
      if (existingBalance.length === 0) {
        // Create balance record if it doesn't exist
        await db.insert(jewelBalances).values({
          playerId: userId,
          balanceJewel: '0',
          lifetimeDepositsJewel: '0',
          tier: tier
        });
      } else {
        // Update existing tier
        await db
          .update(jewelBalances)
          .set({ tier: tier, updatedAt: sql`CURRENT_TIMESTAMP` })
          .where(eq(jewelBalances.playerId, userId));
      }
      
      res.json({ success: true, tier });
    } catch (error) {
      console.error('[API] Error updating tier:', error);
      res.status(500).json({ error: 'Failed to update tier' });
    }
  });

  // Debug Settings API
  // GET /api/admin/debug-settings - Get debug settings
  app.get("/api/admin/debug-settings", async (req: any, res: any) => {
    try {
      res.json(getDebugSettings());
    } catch (error) {
      console.error('[API] Error fetching debug settings:', error);
      res.status(500).json({ error: 'Failed to fetch debug settings' });
    }
  });

  // POST /api/admin/debug-settings - Update debug settings
  app.post("/api/admin/debug-settings", async (req: any, res: any) => {
    try {
      const { paymentBypass } = req.body;
      
      if (typeof paymentBypass !== 'boolean') {
        return res.status(400).json({ error: 'paymentBypass must be a boolean' });
      }
      
      setDebugSettings({ paymentBypass });
      
      res.json({ success: true, settings: getDebugSettings() });
    } catch (error) {
      console.error('[API] Error updating debug settings:', error);
      res.status(500).json({ error: 'Failed to update debug settings' });
    }
  });

  // ============================================================================
  // BRIDGE ANALYTICS API ROUTES (Admin-only)
  // ============================================================================

  // GET /api/admin/bridge/overview - Bridge analytics overview
  app.get("/api/admin/bridge/overview", isAdmin, async (req: any, res: any) => {
    try {
      const [eventStats, metricsStats, latestBlock] = await Promise.all([
        db.select({
          totalEvents: sql`COUNT(*)`,
          inEvents: sql`SUM(CASE WHEN direction = 'in' THEN 1 ELSE 0 END)`,
          outEvents: sql`SUM(CASE WHEN direction = 'out' THEN 1 ELSE 0 END)`,
          heroEvents: sql`SUM(CASE WHEN bridge_type = 'hero' THEN 1 ELSE 0 END)`,
          itemEvents: sql`SUM(CASE WHEN bridge_type = 'item' THEN 1 ELSE 0 END)`,
          totalUsdIn: sql`COALESCE(SUM(CASE WHEN direction = 'in' THEN CAST(usd_value AS DECIMAL) ELSE 0 END), 0)`,
          totalUsdOut: sql`COALESCE(SUM(CASE WHEN direction = 'out' THEN CAST(usd_value AS DECIMAL) ELSE 0 END), 0)`
        }).from(bridgeEvents),
        
        db.select({
          trackedWallets: sql`COUNT(*)`,
          totalExtracted: sql`COALESCE(SUM(CASE WHEN CAST(net_extracted_usd AS DECIMAL) > 0 THEN CAST(net_extracted_usd AS DECIMAL) ELSE 0 END), 0)`,
          extractors: sql`SUM(CASE WHEN CAST(net_extracted_usd AS DECIMAL) > 100 THEN 1 ELSE 0 END)`
        }).from(walletBridgeMetrics),
        
        getLatestBlock().catch(() => 0)
      ]);

      res.json({
        events: {
          total: eventStats[0]?.totalEvents || 0,
          in: eventStats[0]?.inEvents || 0,
          out: eventStats[0]?.outEvents || 0,
          heroes: eventStats[0]?.heroEvents || 0,
          items: eventStats[0]?.itemEvents || 0,
          totalUsdIn: eventStats[0]?.totalUsdIn || 0,
          totalUsdOut: eventStats[0]?.totalUsdOut || 0
        },
        metrics: {
          trackedWallets: metricsStats[0]?.trackedWallets || 0,
          totalExtracted: metricsStats[0]?.totalExtracted || 0,
          extractorCount: metricsStats[0]?.extractors || 0
        },
        chain: {
          latestBlock
        }
      });
    } catch (error) {
      console.error('[API] Error fetching bridge overview:', error);
      res.status(500).json({ error: 'Failed to fetch bridge overview' });
    }
  });

  // GET /api/admin/bridge/extractors - Top extractors list
  app.get("/api/admin/bridge/extractors", isAdmin, async (req: any, res: any) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const extractors = await getTopExtractors(limit);
      res.json(extractors);
    } catch (error) {
      console.error('[API] Error fetching extractors:', error);
      res.status(500).json({ error: 'Failed to fetch extractors' });
    }
  });

  // GET /api/admin/bridge/wallet/:wallet - Wallet bridge details
  app.get("/api/admin/bridge/wallet/:wallet", isAdmin, async (req: any, res: any) => {
    try {
      const { wallet } = req.params;
      const [summary, events] = await Promise.all([
        getWalletSummary(wallet),
        db.select()
          .from(bridgeEvents)
          .where(eq(bridgeEvents.wallet, wallet.toLowerCase()))
          .orderBy(desc(bridgeEvents.blockTimestamp))
          .limit(100)
      ]);
      
      res.json({ summary, events });
    } catch (error) {
      console.error('[API] Error fetching wallet bridge data:', error);
      res.status(500).json({ error: 'Failed to fetch wallet bridge data' });
    }
  });

  // POST /api/admin/bridge/index-wallet - Index a specific wallet
  app.post("/api/admin/bridge/index-wallet", isAdmin, async (req: any, res: any) => {
    try {
      const { wallet } = req.body;
      if (!wallet) {
        return res.status(400).json({ error: 'Wallet address required' });
      }
      
      const events = await indexWallet(wallet, { verbose: true });
      const metrics = await refreshWalletMetrics(wallet);
      
      res.json({ 
        success: true, 
        eventsFound: events.length,
        metrics 
      });
    } catch (error) {
      console.error('[API] Error indexing wallet:', error);
      res.status(500).json({ error: 'Failed to index wallet' });
    }
  });

  // POST /api/admin/bridge/refresh-metrics - Refresh all wallet metrics
  app.post("/api/admin/bridge/refresh-metrics", isAdmin, async (req: any, res: any) => {
    try {
      const processed = await refreshAllMetrics();
      res.json({ success: true, processed });
    } catch (error) {
      console.error('[API] Error refreshing metrics:', error);
      res.status(500).json({ error: 'Failed to refresh metrics' });
    }
  });

  // POST /api/admin/bridge/backfill-prices - Backfill historical prices
  app.post("/api/admin/bridge/backfill-prices", isAdmin, async (req: any, res: any) => {
    try {
      const days = parseInt(req.body.days) || 365;
      const results = await backfillAllTokens(days);
      res.json({ success: true, results });
    } catch (error) {
      console.error('[API] Error backfilling prices:', error);
      res.status(500).json({ error: 'Failed to backfill prices' });
    }
  });

  // GET /api/admin/bridge/prices - Current token prices
  app.get("/api/admin/bridge/prices", isAdmin, async (req: any, res: any) => {
    try {
      const prices = await fetchCurrentPrices();
      res.json(prices);
    } catch (error) {
      console.error('[API] Error fetching prices:', error);
      res.status(500).json({ error: 'Failed to fetch prices' });
    }
  });

  // GET /api/admin/bridge/events - Recent bridge events
  app.get("/api/admin/bridge/events", isAdmin, async (req: any, res: any) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const direction = req.query.direction as string;
      const bridgeType = req.query.bridgeType as string;
      
      let query = db.select().from(bridgeEvents);
      
      const conditions = [];
      if (direction) conditions.push(eq(bridgeEvents.direction, direction));
      if (bridgeType) conditions.push(eq(bridgeEvents.bridgeType, bridgeType));
      
      const events = await db.select()
        .from(bridgeEvents)
        .orderBy(desc(bridgeEvents.blockTimestamp))
        .limit(limit);
      
      res.json(events);
    } catch (error) {
      console.error('[API] Error fetching bridge events:', error);
      res.status(500).json({ error: 'Failed to fetch bridge events' });
    }
  });

  // POST /api/admin/bridge/run-indexer - Run full bridge indexer
  let indexerRunning = false;
  app.post("/api/admin/bridge/run-indexer", isAdmin, async (req: any, res: any) => {
    console.log('[API] === RUN INDEXER ENDPOINT HIT ===');
    console.log('[API] Request body:', JSON.stringify(req.body));
    console.log('[API] indexerRunning state:', indexerRunning);
    console.log('[API] runFullIndex type:', typeof runFullIndex);
    
    try {
      if (indexerRunning) {
        console.log('[API] Indexer already running, returning 409');
        return res.status(409).json({ error: 'Indexer already running' });
      }
      
      const blocks = parseInt(req.body.blocks) || 100000;
      indexerRunning = true;
      console.log('[API] Set indexerRunning=true, blocks:', blocks);
      
      res.json({ success: true, message: `Started indexing last ${blocks} blocks` });
      console.log('[API] Response sent, now calling runFullIndex...');
      
      // Wrap in immediate try-catch to catch synchronous errors
      try {
        console.log('[API] About to invoke runFullIndex({ verbose: true })');
        const promise = runFullIndex({ verbose: true });
        console.log('[API] runFullIndex invoked, got promise:', typeof promise);
        
        promise
          .then(result => {
            console.log('[API] Bridge indexer completed successfully:', result);
            indexerRunning = false;
          })
          .catch(err => {
            console.error('[API] Bridge indexer promise rejected:', err);
            console.error('[API] Error stack:', err?.stack);
            indexerRunning = false;
          });
      } catch (syncError: any) {
        console.error('[API] Synchronous error invoking runFullIndex:', syncError);
        console.error('[API] Sync error stack:', syncError?.stack);
        indexerRunning = false;
      }
    } catch (error: any) {
      indexerRunning = false;
      console.error('[API] Error in run-indexer handler:', error);
      console.error('[API] Handler error stack:', error?.stack);
      res.status(500).json({ error: 'Failed to start indexer' });
    }
  });

  // GET /api/admin/bridge/indexer-status - Check if indexer is running
  app.get("/api/admin/bridge/indexer-status", isAdmin, async (req: any, res: any) => {
    res.json({ running: indexerRunning });
  });

  // POST /api/admin/bridge/import-events - Import pre-indexed bridge events from JSON
  app.post("/api/admin/bridge/import-events", isAdmin, async (req: any, res: any) => {
    try {
      const { events, lastBlock, skipDuplicates = true } = req.body;
      
      if (!events || !Array.isArray(events)) {
        return res.status(400).json({ error: 'Missing events array in request body' });
      }
      
      console.log(`[API] Importing ${events.length} bridge events (lastBlock: ${lastBlock})`);
      
      let inserted = 0;
      let skipped = 0;
      let errors = 0;
      
      // Process in batches of 100
      const batchSize = 100;
      for (let i = 0; i < events.length; i += batchSize) {
        const batch = events.slice(i, i + batchSize);
        
        for (const event of batch) {
          try {
            await db.insert(bridgeEvents).values({
              wallet: event.wallet?.toLowerCase(),
              bridgeType: event.bridgeType || 'token',
              direction: event.direction,
              tokenAddress: event.tokenAddress || null,
              tokenSymbol: event.tokenSymbol || null,
              amount: event.amount || null,
              assetId: null,
              srcChainId: event.srcChainId || 0,
              dstChainId: event.dstChainId || 0,
              txHash: event.txHash,
              blockNumber: Number(event.blockNumber),
              blockTimestamp: new Date(event.blockTimestamp),
            }).onConflictDoNothing();
            inserted++;
          } catch (err: any) {
            if (err.code === '23505' && skipDuplicates) {
              skipped++;
            } else {
              console.error(`[API] Error inserting event:`, err.message);
              errors++;
            }
          }
        }
        
        // Log progress for large imports
        if (events.length > 1000 && i % 1000 === 0) {
          console.log(`[API] Import progress: ${i}/${events.length} (${inserted} inserted, ${skipped} skipped)`);
        }
      }
      
      console.log(`[API] Import complete: ${inserted} inserted, ${skipped} skipped, ${errors} errors`);
      
      res.json({
        success: true,
        imported: inserted,
        skipped,
        errors,
        lastBlock: lastBlock || null
      });
    } catch (error: any) {
      console.error('[API] Error importing bridge events:', error);
      res.status(500).json({ error: 'Failed to import events', details: error.message });
    }
  });

  // ============================================================================
  // PARALLEL BRIDGE SYNC API (In-process workers)
  // ============================================================================
  
  // Track running in-process parallel workers
  const parallelSyncState = {
    running: false,
    workersTotal: 0,
    workers: new Map<number, { running: boolean; lastUpdate: Date; progress: any }>(),
    startedAt: null as Date | null,
  };
  
  // GET /api/admin/bridge/parallel-sync/status - Get parallel sync status
  app.get("/api/admin/bridge/parallel-sync/status", isAdmin, async (req: any, res: any) => {
    try {
      const latestBlock = await getLatestBlock();
      const mainProgress = await getIndexerProgress(MAIN_INDEXER_NAME);
      
      // Get all worker progress if parallel sync has been run
      const workerProgress = parallelSyncState.workersTotal > 0 
        ? await getAllWorkerProgress(parallelSyncState.workersTotal)
        : [];
      
      // Calculate combined progress from worker ranges
      let totalBlocksProcessed = 0;
      let totalBlocksToProcess = 0;
      let allComplete = workerProgress.length > 0;
      
      for (const worker of workerProgress) {
        // Use the stored genesis block as the worker's range start
        const workerStart = worker.genesisBlock || 0;
        const blocksPerWorker = Math.ceil(latestBlock / (parallelSyncState.workersTotal || workerProgress.length));
        const workerEnd = Math.min(workerStart + blocksPerWorker, latestBlock);
        
        const workerTotal = workerEnd - workerStart;
        const processed = Math.max(0, worker.lastIndexedBlock - workerStart);
        
        totalBlocksToProcess += workerTotal;
        totalBlocksProcessed += Math.min(processed, workerTotal);
        
        if (worker.status !== 'complete' && worker.lastIndexedBlock < workerEnd) {
          allComplete = false;
        }
      }
      
      const combinedProgress = totalBlocksToProcess > 0 
        ? Math.round((totalBlocksProcessed / totalBlocksToProcess) * 100) 
        : 0;
      
      res.json({
        running: parallelSyncState.running,
        workersTotal: parallelSyncState.workersTotal,
        startedAt: parallelSyncState.startedAt,
        latestBlock,
        mainIndexer: mainProgress ? {
          lastIndexedBlock: mainProgress.lastIndexedBlock,
          totalEventsIndexed: mainProgress.totalEventsIndexed,
          status: mainProgress.status,
        } : null,
        workers: workerProgress.map(w => {
          const workerStart = w.genesisBlock || 0;
          const blocksPerWorker = Math.ceil(latestBlock / (parallelSyncState.workersTotal || workerProgress.length));
          const workerEnd = Math.min(workerStart + blocksPerWorker, latestBlock);
          const workerProgress = Math.max(0, Math.min(100, ((w.lastIndexedBlock - workerStart) / (workerEnd - workerStart)) * 100));
          
          return {
            workerId: w.workerId,
            lastIndexedBlock: w.lastIndexedBlock,
            rangeStart: workerStart,
            rangeEnd: workerEnd,
            progress: Math.round(workerProgress),
            totalEventsIndexed: w.totalEventsIndexed,
            status: w.status,
            totalBatchCount: w.totalBatchCount,
          };
        }),
        combinedProgress,
        allComplete: workerProgress.length > 0 && allComplete,
      });
    } catch (error: any) {
      console.error('[API] Error getting parallel sync status:', error);
      res.status(500).json({ error: 'Failed to get status', details: error.message });
    }
  });
  
  // POST /api/admin/bridge/parallel-sync/start - Start parallel sync workers
  app.post("/api/admin/bridge/parallel-sync/start", isAdmin, async (req: any, res: any) => {
    console.log('[ParallelSync] POST /start received, body:', req.body);
    try {
      if (parallelSyncState.running) {
        return res.status(409).json({ error: 'Parallel sync already running' });
      }
      
      const workersTotal = parseInt(req.body.workers) || 4;
      const batchSize = parseInt(req.body.batchSize) || 10000;
      const maxBatchesPerWorker = parseInt(req.body.maxBatches) || 50; // Limit batches per run
      
      if (workersTotal < 1 || workersTotal > 8) {
        return res.status(400).json({ error: 'Workers must be between 1 and 8' });
      }
      
      console.log(`[ParallelSync] Starting ${workersTotal} workers with batch size ${batchSize}`);
      
      parallelSyncState.running = true;
      parallelSyncState.workersTotal = workersTotal;
      parallelSyncState.startedAt = new Date();
      parallelSyncState.workers.clear();
      
      res.json({ 
        success: true, 
        message: `Started ${workersTotal} parallel workers`,
        workersTotal,
        batchSize,
        maxBatchesPerWorker,
      });
      
      // Get latest block for range calculation
      const latestBlock = await getLatestBlock();
      const blocksPerWorker = Math.ceil(latestBlock / workersTotal);
      
      // Run workers in parallel (in-process)
      const workerPromises = [];
      
      for (let workerId = 1; workerId <= workersTotal; workerId++) {
        const rangeStart = (workerId - 1) * blocksPerWorker;
        const rangeEnd = Math.min(workerId * blocksPerWorker, latestBlock);
        const indexerName = getWorkerIndexerName(workerId, workersTotal);
        
        console.log(`[ParallelSync] Worker ${workerId}: blocks ${rangeStart} → ${rangeEnd}`);
        
        // Initialize worker progress
        await initIndexerProgress(indexerName, rangeStart);
        
        parallelSyncState.workers.set(workerId, {
          running: true,
          lastUpdate: new Date(),
          progress: { rangeStart, rangeEnd },
        });
        
        // Create worker loop
        const workerLoop = async () => {
          let batchCount = 0;
          while (batchCount < maxBatchesPerWorker && parallelSyncState.running) {
            const result = await runWorkerBatch({
              batchSize,
              indexerName,
              rangeEnd,
            });
            
            batchCount++;
            parallelSyncState.workers.set(workerId, {
              running: true,
              lastUpdate: new Date(),
              progress: result,
            });
            
            if (result.status === 'complete') {
              console.log(`[ParallelSync] Worker ${workerId} completed its range`);
              break;
            }
            
            if (result.status === 'error') {
              console.error(`[ParallelSync] Worker ${workerId} error:`, result.error);
              await new Promise(r => setTimeout(r, 5000)); // Wait before retry
            }
            
            // Brief delay between batches to avoid RPC overload
            await new Promise(r => setTimeout(r, 500));
          }
          
          parallelSyncState.workers.set(workerId, {
            running: false,
            lastUpdate: new Date(),
            progress: { complete: true },
          });
        };
        
        workerPromises.push(workerLoop());
      }
      
      // Wait for all workers to complete (in background)
      Promise.all(workerPromises)
        .then(() => {
          console.log('[ParallelSync] All workers completed');
          parallelSyncState.running = false;
        })
        .catch(err => {
          console.error('[ParallelSync] Worker error:', err);
          parallelSyncState.running = false;
        });
        
    } catch (error: any) {
      parallelSyncState.running = false;
      console.error('[API] Error starting parallel sync:', error);
      res.status(500).json({ error: 'Failed to start parallel sync', details: error.message });
    }
  });
  
  // POST /api/admin/bridge/parallel-sync/stop - Stop parallel sync
  app.post("/api/admin/bridge/parallel-sync/stop", isAdmin, async (req: any, res: any) => {
    try {
      if (!parallelSyncState.running) {
        return res.status(400).json({ error: 'Parallel sync not running' });
      }
      
      console.log('[ParallelSync] Stopping workers...');
      parallelSyncState.running = false;
      
      res.json({ success: true, message: 'Parallel sync stopping after current batches complete' });
    } catch (error: any) {
      console.error('[API] Error stopping parallel sync:', error);
      res.status(500).json({ error: 'Failed to stop parallel sync' });
    }
  });

  // POST /api/admin/restart-server - Restart the server process
  app.post("/api/admin/restart-server", isAdmin, async (req: any, res: any) => {
    console.log('[API] === SERVER RESTART REQUESTED ===');
    res.json({ success: true, message: 'Server restarting in 1 second...' });
    
    // Give time for the response to be sent before exiting
    setTimeout(() => {
      console.log('[API] Exiting process for restart...');
      process.exit(0);
    }, 1000);
  });

  const httpServer = createServer(app);

  return httpServer;
}
