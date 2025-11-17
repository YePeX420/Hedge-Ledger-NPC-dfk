import type { Express } from "express";
import { createServer, type Server } from "http";
import { db } from "./db";
import { players, jewelBalances, depositRequests, queryCosts } from "@shared/schema";
import { desc, sql, eq } from "drizzle-orm";

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

  const httpServer = createServer(app);

  return httpServer;
}
