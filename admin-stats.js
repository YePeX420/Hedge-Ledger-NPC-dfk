// admin-stats.js - Helper to fetch admin dashboard statistics
import { db } from './server/db.js';
import { players, jewelBalances, depositRequests, queryCosts } from './shared/schema';
import { sql } from 'drizzle-orm';

/**
 * Fetch admin dashboard statistics
 * Reuses logic from /api/analytics/overview endpoint
 */
export async function getAdminStats() {
  try {
    const [playerStats, depositStats, balanceStats, revenueStats] = await Promise.all([
      // Player stats
      db.select({
        total: sql`COUNT(*)`,
      }).from(players),
      
      // Deposit stats - count of completed deposits (no amount aggregation for now)
      db.select({
        totalJewel: sql`COALESCE(SUM(CASE WHEN "status" = 'completed' THEN CAST("requested_amount_jewel" AS DECIMAL) ELSE 0 END), 0)`,
      }).from(depositRequests),
      
      // Balance stats (Hedge wallet = sum of all player balances)
      db.select({
        totalBalance: sql`COALESCE(SUM(CAST("balance_jewel" AS DECIMAL)), 0)`,
      }).from(jewelBalances),
      
      // Revenue stats from query costs
      db.select({
        totalRevenue: sql`COALESCE(SUM("revenue_usd"), 0)`,
        totalQueries: sql`COUNT(*)`,
        paidQueries: sql`SUM(CASE WHEN NOT "free_tier_used" THEN 1 ELSE 0 END)`,
      }).from(queryCosts)
    ]);
    
    const totalPlayers = playerStats[0]?.total || 0;
    const jewelDeposits = parseFloat(depositStats[0]?.totalJewel || '0');
    const hedgeWalletJewel = parseFloat(balanceStats[0]?.totalBalance || '0');
    const totalRevenue = parseFloat(revenueStats[0]?.totalRevenue || '0');
    const paidQueries = revenueStats[0]?.paidQueries || 0;

    return {
      totalPlayers,
      jewelDeposits,
      hedgeWallet: {
        jewel: hedgeWalletJewel,
        crystal: 0, // Placeholder - can be extended
        cjewel: 0   // Placeholder - can be extended
      },
      totalRevenue,
      totalQueries: paidQueries,
      recentActivity: 'Recent activity feed not implemented yet.'
    };
  } catch (err) {
    console.error('❌ Error fetching admin stats:', err);
    // Return safe fallback values
    return {
      totalPlayers: 0,
      jewelDeposits: 0,
      hedgeWallet: { jewel: 0, crystal: 0, cjewel: 0 },
      totalRevenue: 0,
      totalQueries: 0,
      recentActivity: 'Unable to load activity.'
    };
  }
}
