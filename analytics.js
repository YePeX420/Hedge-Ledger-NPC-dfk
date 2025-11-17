/**
 * Analytics Module
 * 
 * Provides cost tracking and profit analytics for admin monitoring.
 * Can be used via Discord commands or API endpoints.
 * 
 * Metrics:
 * - Total revenue (JEWEL and USD)
 * - Total profit/margin
 * - Query volume by type
 * - Free tier usage stats
 * - Player spending patterns
 * - Top spenders
 */

import Decimal from 'decimal.js';
import { db } from './server/db.js';
import { queryCosts, players, jewelBalances } from './shared/schema.js';
import { sql, desc, eq, gte, and } from 'drizzle-orm';

/**
 * Get overall revenue and profit summary
 * 
 * @param {object} options - Time range options
 * @returns {object} - Revenue/profit metrics
 */
export async function getRevenueSummary(options = {}) {
  try {
    const { 
      startDate = null,
      endDate = null
    } = options;
    
    // Build time range filter
    const timeFilters = [];
    if (startDate) {
      timeFilters.push(gte(queryCosts.timestamp, startDate));
    }
    if (endDate) {
      timeFilters.push(sql`${queryCosts.timestamp} <= ${endDate}`);
    }
    
    let query = db
      .select({
        totalRevenue: sql`COALESCE(SUM(${queryCosts.revenueUsd}), 0)`,
        totalCost: sql`COALESCE(SUM(${queryCosts.totalCostUsd}), 0)`,
        totalProfit: sql`COALESCE(SUM(${queryCosts.profitUsd}), 0)`,
        totalJewelCharged: sql`COALESCE(SUM(${queryCosts.priceChargedJewel}), 0)`,
        totalQueries: sql`COUNT(*)`,
        freeTierQueries: sql`SUM(CASE WHEN ${queryCosts.freeTierUsed} THEN 1 ELSE 0 END)`,
        paidQueries: sql`SUM(CASE WHEN NOT ${queryCosts.freeTierUsed} THEN 1 ELSE 0 END)`
      })
      .from(queryCosts);
    
    // Apply combined time range filter
    if (timeFilters.length > 0) {
      query = query.where(and(...timeFilters));
    }
    
    const results = await query;
    const data = results[0];
    
    // Calculate average profit margin
    const avgMargin = new Decimal(data.totalCost).isZero()
      ? new Decimal('0')
      : new Decimal(data.totalProfit)
          .dividedBy(data.totalCost)
          .times(100);
    
    return {
      totalRevenue: parseFloat(data.totalRevenue).toFixed(6),
      totalCost: parseFloat(data.totalCost).toFixed(6),
      totalProfit: parseFloat(data.totalProfit).toFixed(6),
      avgProfitMargin: avgMargin.toFixed(2) + '%',
      totalJewelCharged: parseFloat(data.totalJewelCharged).toFixed(6),
      totalQueries: parseInt(data.totalQueries),
      freeTierQueries: parseInt(data.freeTierQueries || 0),
      paidQueries: parseInt(data.paidQueries || 0),
      paidPercentage: data.totalQueries > 0
        ? ((parseInt(data.paidQueries || 0) / parseInt(data.totalQueries)) * 100).toFixed(1) + '%'
        : '0%'
    };
  } catch (err) {
    console.error('[Analytics] Error getting revenue summary:', err);
    throw err;
  }
}

/**
 * Get query volume breakdown by type
 * 
 * @param {object} options - Time range options
 * @returns {Array} - Query type stats
 */
export async function getQueryTypeBreakdown(options = {}) {
  try {
    const { 
      startDate = null,
      endDate = null
    } = options;
    
    // Build time range filter
    const timeFilters = [];
    if (startDate) {
      timeFilters.push(gte(queryCosts.timestamp, startDate));
    }
    if (endDate) {
      timeFilters.push(sql`${queryCosts.timestamp} <= ${endDate}`);
    }
    
    let query = db
      .select({
        queryType: queryCosts.queryType,
        count: sql`COUNT(*)`,
        totalRevenue: sql`COALESCE(SUM(${queryCosts.revenueUsd}), 0)`,
        totalProfit: sql`COALESCE(SUM(${queryCosts.profitUsd}), 0)`,
        avgProfitMargin: sql`COALESCE(AVG(${queryCosts.profitMargin}), 0)`,
        freeTierCount: sql`SUM(CASE WHEN ${queryCosts.freeTierUsed} THEN 1 ELSE 0 END)`
      })
      .from(queryCosts)
      .groupBy(queryCosts.queryType)
      .orderBy(desc(sql`COUNT(*)`));
    
    // Apply combined time range filter
    if (timeFilters.length > 0) {
      query = query.where(and(...timeFilters));
    }
    
    const results = await query;
    
    return results.map(row => ({
      queryType: row.queryType,
      count: parseInt(row.count),
      freeTierCount: parseInt(row.freeTierCount || 0),
      paidCount: parseInt(row.count) - parseInt(row.freeTierCount || 0),
      totalRevenue: parseFloat(row.totalRevenue).toFixed(6),
      totalProfit: parseFloat(row.totalProfit).toFixed(6),
      avgProfitMargin: parseFloat(row.avgProfitMargin).toFixed(2) + '%'
    }));
  } catch (err) {
    console.error('[Analytics] Error getting query type breakdown:', err);
    throw err;
  }
}

/**
 * Get top spending players
 * 
 * @param {number} limit - Number of top players to return
 * @param {object} options - Time range options
 * @returns {Array} - Top player stats
 */
export async function getTopSpenders(limit = 10, options = {}) {
  try {
    const { 
      startDate = null,
      endDate = null
    } = options;
    
    // Build time range filter
    const timeFilters = [];
    if (startDate) {
      timeFilters.push(gte(queryCosts.timestamp, startDate));
    }
    if (endDate) {
      timeFilters.push(sql`${queryCosts.timestamp} <= ${endDate}`);
    }
    
    let query = db
      .select({
        playerId: queryCosts.playerId,
        totalSpent: sql`COALESCE(SUM(${queryCosts.priceChargedJewel}), 0)`,
        totalQueries: sql`COUNT(*)`,
        totalRevenue: sql`COALESCE(SUM(${queryCosts.revenueUsd}), 0)`,
        freeTierQueries: sql`SUM(CASE WHEN ${queryCosts.freeTierUsed} THEN 1 ELSE 0 END)`
      })
      .from(queryCosts)
      .groupBy(queryCosts.playerId)
      .orderBy(desc(sql`SUM(${queryCosts.priceChargedJewel})`))
      .limit(limit);
    
    // Apply combined time range filter
    if (timeFilters.length > 0) {
      query = query.where(and(...timeFilters));
    }
    
    const results = await query;
    
    // Enrich with player data
    const enriched = await Promise.all(
      results.map(async (row) => {
        const player = await db
          .select()
          .from(players)
          .where(eq(players.id, row.playerId))
          .limit(1);
        
        const balance = await db
          .select()
          .from(jewelBalances)
          .where(eq(jewelBalances.playerId, row.playerId))
          .limit(1);
        
        return {
          playerId: row.playerId,
          discordUsername: player[0]?.discordUsername || 'Unknown',
          discordId: player[0]?.discordId || 'Unknown',
          totalSpent: parseFloat(row.totalSpent).toFixed(6) + ' JEWEL',
          totalQueries: parseInt(row.totalQueries),
          freeTierQueries: parseInt(row.freeTierQueries || 0),
          paidQueries: parseInt(row.totalQueries) - parseInt(row.freeTierQueries || 0),
          totalRevenue: parseFloat(row.totalRevenue).toFixed(6) + ' USD',
          currentBalance: balance[0]?.balanceJewel || '0',
          tier: balance[0]?.tier || 'free'
        };
      })
    );
    
    return enriched;
  } catch (err) {
    console.error('[Analytics] Error getting top spenders:', err);
    throw err;
  }
}

/**
 * Get free tier usage statistics
 * 
 * @param {object} options - Time range options
 * @returns {object} - Free tier stats
 */
export async function getFreeTierStats(options = {}) {
  try {
    const { 
      startDate = null,
      endDate = null
    } = options;
    
    // Build time range filter (always include freeTierUsed = true)
    const filters = [eq(queryCosts.freeTierUsed, true)];
    if (startDate) {
      filters.push(gte(queryCosts.timestamp, startDate));
    }
    if (endDate) {
      filters.push(sql`${queryCosts.timestamp} <= ${endDate}`);
    }
    
    // Get free tier query breakdown
    const query = db
      .select({
        queryType: queryCosts.queryType,
        count: sql`COUNT(*)`,
        uniquePlayers: sql`COUNT(DISTINCT ${queryCosts.playerId})`
      })
      .from(queryCosts)
      .where(and(...filters))
      .groupBy(queryCosts.queryType);
    
    const breakdown = await query;
    
    // Get conversion rate (free tier users who became paid) - apply same time filters
    const totalFreeTierPlayers = await db
      .select({
        count: sql`COUNT(DISTINCT ${queryCosts.playerId})`
      })
      .from(queryCosts)
      .where(and(...filters)); // Use same filters as breakdown
    
    // Build time filter clause for SQL subquery
    let timeClause = '';
    if (startDate && endDate) {
      timeClause = ` AND timestamp >= '${startDate.toISOString()}' AND timestamp <= '${endDate.toISOString()}'`;
    } else if (startDate) {
      timeClause = ` AND timestamp >= '${startDate.toISOString()}'`;
    } else if (endDate) {
      timeClause = ` AND timestamp <= '${endDate.toISOString()}'`;
    }
    
    const convertedPlayers = await db
      .select({
        count: sql`COUNT(DISTINCT subq.player_id)`
      })
      .from(
        sql`(
          SELECT DISTINCT player_id 
          FROM query_costs 
          WHERE free_tier_used = true${sql.raw(timeClause)}
          AND player_id IN (
            SELECT DISTINCT player_id 
            FROM query_costs 
            WHERE free_tier_used = false${sql.raw(timeClause)}
          )
        ) AS subq`
      );
    
    const conversionRate = parseInt(totalFreeTierPlayers[0].count) > 0
      ? ((parseInt(convertedPlayers[0].count) / parseInt(totalFreeTierPlayers[0].count)) * 100).toFixed(1)
      : '0';
    
    return {
      totalFreeTierQueries: breakdown.reduce((sum, row) => sum + parseInt(row.count), 0),
      uniqueFreeTierPlayers: parseInt(totalFreeTierPlayers[0].count),
      convertedPlayers: parseInt(convertedPlayers[0].count),
      conversionRate: conversionRate + '%',
      breakdown: breakdown.map(row => ({
        queryType: row.queryType,
        count: parseInt(row.count),
        uniquePlayers: parseInt(row.uniquePlayers)
      }))
    };
  } catch (err) {
    console.error('[Analytics] Error getting free tier stats:', err);
    throw err;
  }
}

/**
 * Get daily revenue trend
 * 
 * @param {number} days - Number of days to retrieve
 * @returns {Array} - Daily revenue data
 */
export async function getDailyRevenueTrend(days = 7) {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    const results = await db
      .select({
        date: sql`DATE(${queryCosts.timestamp})`,
        revenue: sql`COALESCE(SUM(${queryCosts.revenueUsd}), 0)`,
        profit: sql`COALESCE(SUM(${queryCosts.profitUsd}), 0)`,
        queries: sql`COUNT(*)`,
        paidQueries: sql`SUM(CASE WHEN NOT ${queryCosts.freeTierUsed} THEN 1 ELSE 0 END)`,
        jewelCharged: sql`COALESCE(SUM(${queryCosts.priceChargedJewel}), 0)`
      })
      .from(queryCosts)
      .where(gte(queryCosts.timestamp, startDate))
      .groupBy(sql`DATE(${queryCosts.timestamp})`)
      .orderBy(sql`DATE(${queryCosts.timestamp})`);
    
    return results.map(row => ({
      date: row.date,
      revenue: parseFloat(row.revenue).toFixed(6),
      profit: parseFloat(row.profit).toFixed(6),
      queries: parseInt(row.queries),
      paidQueries: parseInt(row.paidQueries || 0),
      jewelCharged: parseFloat(row.jewelCharged).toFixed(6)
    }));
  } catch (err) {
    console.error('[Analytics] Error getting daily revenue trend:', err);
    throw err;
  }
}

/**
 * Format analytics for Discord embed
 * 
 * @param {string} type - Analytics type ('summary', 'breakdown', 'topspenders', 'freetier', 'trend')
 * @param {object} options - Options (timeRange, limit, etc.)
 * @returns {object} - Discord embed data
 */
export async function getAnalyticsForDiscord(type, options = {}) {
  try {
    let title, description, fields = [];
    
    switch (type) {
      case 'summary': {
        const data = await getRevenueSummary(options);
        title = '💰 Revenue Summary';
        description = 'Overall economic performance';
        fields = [
          { name: 'Total Revenue', value: `$${data.totalRevenue}`, inline: true },
          { name: 'Total Profit', value: `$${data.totalProfit}`, inline: true },
          { name: 'Avg Margin', value: data.avgProfitMargin, inline: true },
          { name: 'JEWEL Charged', value: `${data.totalJewelCharged} JEWEL`, inline: true },
          { name: 'Total Queries', value: data.totalQueries.toString(), inline: true },
          { name: 'Paid %', value: data.paidPercentage, inline: true },
          { name: 'Free Tier', value: data.freeTierQueries.toString(), inline: true },
          { name: 'Paid', value: data.paidQueries.toString(), inline: true }
        ];
        break;
      }
      
      case 'breakdown': {
        const data = await getQueryTypeBreakdown(options);
        title = '📊 Query Type Breakdown';
        description = 'Query volume and revenue by type';
        fields = data.slice(0, 10).map(row => ({
          name: row.queryType,
          value: `Count: ${row.count} (${row.freeTierCount} free)\nRevenue: $${row.totalRevenue}\nProfit: $${row.totalProfit} (${row.avgProfitMargin} margin)`,
          inline: false
        }));
        break;
      }
      
      case 'topspenders': {
        const data = await getTopSpenders(options.limit || 10, options);
        title = '🏆 Top Spenders';
        description = 'Players by total JEWEL spent';
        fields = data.map((player, index) => ({
          name: `${index + 1}. ${player.discordUsername}`,
          value: `Spent: ${player.totalSpent}\nQueries: ${player.totalQueries} (${player.paidQueries} paid)\nBalance: ${player.currentBalance} JEWEL\nTier: ${player.tier}`,
          inline: false
        }));
        break;
      }
      
      case 'freetier': {
        const data = await getFreeTierStats(options);
        title = '🎁 Free Tier Statistics';
        description = 'Free tier usage and conversion';
        fields = [
          { name: 'Total Free Queries', value: data.totalFreeTierQueries.toString(), inline: true },
          { name: 'Unique Players', value: data.uniqueFreeTierPlayers.toString(), inline: true },
          { name: 'Conversion Rate', value: data.conversionRate, inline: true },
          { name: 'Converted Players', value: data.convertedPlayers.toString(), inline: true }
        ];
        
        // Add breakdown
        data.breakdown.forEach(row => {
          fields.push({
            name: row.queryType,
            value: `Queries: ${row.count} | Players: ${row.uniquePlayers}`,
            inline: false
          });
        });
        break;
      }
      
      case 'trend': {
        const data = await getDailyRevenueTrend(options.days || 7);
        title = '📈 Daily Revenue Trend';
        description = `Last ${options.days || 7} days`;
        fields = data.map(row => ({
          name: row.date,
          value: `Revenue: $${row.revenue} | Profit: $${row.profit}\nQueries: ${row.queries} (${row.paidQueries} paid) | JEWEL: ${row.jewelCharged}`,
          inline: false
        }));
        break;
      }
      
      default:
        throw new Error(`Unknown analytics type: ${type}`);
    }
    
    return {
      title,
      description,
      fields,
      color: 0x00AE86, // Teal color
      timestamp: new Date().toISOString()
    };
  } catch (err) {
    console.error('[Analytics] Error formatting analytics for Discord:', err);
    throw err;
  }
}
