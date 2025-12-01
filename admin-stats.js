// admin-stats.js - Helper to fetch admin dashboard statistics
import { db } from './server/db.js';
import { players, jewelBalances, depositRequests, queryCosts } from './shared/schema';
import { sql } from 'drizzle-orm';
import { HEDGE_WALLET } from './deposit-flow.js';
import { fetchWalletBalances } from './blockchain-balance-fetcher.js';

/**
 * Fetch admin dashboard statistics
 * Reuses logic from /api/analytics/overview endpoint
 */
export async function getAdminStats() {
  try {
    const [playerStats, depositStats, revenueStats, hedgeBalance] = await Promise.all([
      // Player stats
      db.select({
        total: sql`COUNT(*)`,
      }).from(players),
      
      // Deposit stats - count of completed deposits
      db.select({
        totalJewel: sql`COALESCE(SUM(CASE WHEN "status" = 'completed' THEN CAST("requested_amount_jewel" AS DECIMAL) ELSE 0 END), 0)`,
      }).from(depositRequests),
      
      // Revenue stats from query costs
      db.select({
        totalRevenue: sql`COALESCE(SUM("revenue_usd"), 0)`,
        totalQueries: sql`COUNT(*)`,
        paidQueries: sql`SUM(CASE WHEN NOT "free_tier_used" THEN 1 ELSE 0 END)`,
      }).from(queryCosts),
      
      // Hedge wallet balance (fetched live from blockchain)
      fetchWalletBalances([HEDGE_WALLET])
    ]);
    
    const totalPlayers = playerStats[0]?.total || 0;
    const jewelDeposits = parseFloat(depositStats[0]?.totalJewel || '0');
    const hedgeWalletJewel = parseFloat(hedgeBalance?.[HEDGE_WALLET]?.JEWEL || '0');
    const hedgeWalletCrystal = parseFloat(hedgeBalance?.[HEDGE_WALLET]?.CRYSTAL || '0');
    const hedgeWalletCjewel = parseFloat(hedgeBalance?.[HEDGE_WALLET]?.cJEWEL || '0');
    const totalRevenue = parseFloat(revenueStats[0]?.totalRevenue || '0');
    const paidQueries = revenueStats[0]?.paidQueries || 0;

    return {
      totalPlayers,
      jewelDeposits,
      hedgeWallet: {
        jewel: hedgeWalletJewel,
        crystal: hedgeWalletCrystal,
        cjewel: hedgeWalletCjewel
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
