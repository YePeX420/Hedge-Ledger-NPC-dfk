import type { Express } from "express";
import { createServer, type Server } from "http";
import { db } from "./db";
import { players, jewelBalances, depositRequests, queryCosts, interactionSessions, interactionMessages, walletSnapshots, adminSessions } from "@shared/schema";
import { desc, sql, eq, inArray } from "drizzle-orm";
import { getDebugSettings, setDebugSettings } from "../debug-settings.js";

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

export async function registerRoutes(app: Express): Promise<Server> {
  // Analytics API Routes
  
  // GET /api/analytics/overview - Dashboard overview metrics
  app.get("/api/analytics/overview", async (req: any, res: any) => {
    try {
      const [playerStats, depositStats, balanceStats, revenueStats] = await Promise.all([
        // Player stats
        db.select({
          total: sql<number>`COUNT(*)`,
          withBalance: sql<number>`COUNT(CASE WHEN EXISTS(SELECT 1 FROM ${jewelBalances} WHERE ${jewelBalances.playerId} = ${players.id}) THEN 1 END)`
        }).from(players),
        
        // Deposit stats
        db.select({
          total: sql<number>`COUNT(*)`,
          completed: sql<number>`SUM(CASE WHEN ${depositRequests.status} = 'completed' THEN 1 ELSE 0 END)`,
          totalJewel: sql<string>`COALESCE(SUM(CASE WHEN ${depositRequests.status} = 'completed' THEN CAST(${depositRequests.requestedAmountJewel} AS DECIMAL) ELSE 0 END), 0)`,
        }).from(depositRequests),
        
        // Balance stats
        db.select({
          totalBalance: sql<string>`COALESCE(SUM(CAST(${jewelBalances.balanceJewel} AS DECIMAL)), 0)`,
          activeBalances: sql<number>`COUNT(CASE WHEN CAST(${jewelBalances.balanceJewel} AS DECIMAL) > 0 THEN 1 END)`
        }).from(jewelBalances),
        
        // Revenue stats from query costs
        db.select({
          totalRevenue: sql<string>`COALESCE(SUM(${queryCosts.revenueUsd}), 0)`,
          totalProfit: sql<string>`COALESCE(SUM(${queryCosts.profitUsd}), 0)`,
          totalQueries: sql<number>`COUNT(*)`,
          paidQueries: sql<number>`SUM(CASE WHEN NOT ${queryCosts.freeTierUsed} THEN 1 ELSE 0 END)`
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
          count: sql<number>`COUNT(*)`,
          totalRevenue: sql<string>`COALESCE(SUM(${queryCosts.revenueUsd}), 0)`,
          freeTier: sql<number>`SUM(CASE WHEN ${queryCosts.freeTierUsed} THEN 1 ELSE 0 END)`
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
  
  // GET /api/admin/users - Comprehensive user management list
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
          totalQueries: sql<number>`COUNT(*)`,
          totalCost: sql<string>`COALESCE(SUM(${queryCosts.revenueUsd}), 0)`,
          totalProfit: sql<string>`COALESCE(SUM(${queryCosts.profitUsd}), 0)`,
          freeQueries: sql<number>`SUM(CASE WHEN ${queryCosts.freeTierUsed} THEN 1 ELSE 0 END)`
        })
        .from(queryCosts)
        .where(inArray(queryCosts.playerId, playerIds))
        .groupBy(queryCosts.playerId);
      
      const queryStatsMap = new Map(allQueryStats.map(s => [s.playerId, s]));
      
      // Batch query: Get all deposit stats grouped by player (single query)
      const allDepositStats = await db
        .select({
          playerId: depositRequests.playerId,
          totalDeposits: sql<number>`COUNT(*)`,
          completedDeposits: sql<number>`SUM(CASE WHEN ${depositRequests.status} = 'completed' THEN 1 ELSE 0 END)`,
          totalJewel: sql<string>`COALESCE(SUM(CASE WHEN ${depositRequests.status} = 'completed' THEN CAST(${depositRequests.requestedAmountJewel} AS DECIMAL) ELSE 0 END), 0)`,
          totalCrystal: sql<string>`COALESCE(SUM(CASE WHEN ${depositRequests.status} = 'completed' THEN CAST(${depositRequests.requestedAmountCrystal} AS DECIMAL) ELSE 0 END), 0)`
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

  const httpServer = createServer(app);

  return httpServer;
}
