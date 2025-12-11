// src/etl/extractors/stakingExtractor.ts
// Extracts Jeweler staking data for ETL pipeline
// Cluster-aware aggregation using staking_snapshots table and live balance fetcher

import type { ExtractedStakingData, WalletContext } from '../types.js';
import { db } from '../../../server/db.js';
import { stakingSnapshots, walletLinks } from '../../../shared/schema.js';
import { eq, sql, inArray, desc } from 'drizzle-orm';

const MIN_STAKE_USD_THRESHOLD_CENTS = 100; // $1 minimum to count as "staked"

/**
 * Get all wallet addresses in a cluster
 */
async function getClusterWallets(clusterKey: string): Promise<string[]> {
  try {
    const links = await db
      .select({ address: walletLinks.address })
      .from(walletLinks)
      .where(eq(walletLinks.clusterKey, clusterKey));
    return links.map((l: { address: string }) => l.address.toLowerCase());
  } catch {
    return [];
  }
}

/**
 * Fetch cJEWEL balance from live balance fetcher for a single wallet
 */
async function fetchLiveCJewelBalance(wallet: string): Promise<number> {
  try {
    const balanceFetcher = await import('../../../blockchain-balance-fetcher.js');
    if (balanceFetcher.fetchWalletBalances) {
      const balances = await balanceFetcher.fetchWalletBalances(wallet);
      return parseFloat(balances?.cjewel || '0');
    }
  } catch {
    // Balance fetcher not available
  }
  return 0;
}

/**
 * Get JEWEL price from price oracle (fallback to constant if unavailable)
 */
async function getJewelPrice(): Promise<number> {
  try {
    // Try to import price helper if available
    const priceHelper = await import('../../../src/utils/price-helper.js');
    if (priceHelper.getTokenPrice) {
      const price = await priceHelper.getTokenPrice('JEWEL');
      if (price && price > 0) return price;
    }
  } catch {
    // Price helper not available
  }
  
  // Fallback to approximate price
  return 0.05;
}

export async function extractStakingData(ctx: WalletContext): Promise<ExtractedStakingData> {
  const wallet = ctx.walletAddress.toLowerCase();
  const clusterKey = ctx.clusterKey;
  
  try {
    // 1. Get all wallets in cluster for aggregation
    let walletsToAggregate = [wallet];
    if (clusterKey) {
      const clusterWallets = await getClusterWallets(clusterKey);
      if (clusterWallets.length > 0) {
        walletsToAggregate = Array.from(new Set([...clusterWallets, wallet]));
      }
    }
    
    // 2. Aggregate cJEWEL (staked JEWEL) across all cluster wallets (with per-wallet snapshot fallback)
    let jewelStakeAmount = 0;
    const walletsWithLiveData = new Set<string>();
    
    for (const w of walletsToAggregate) {
      const cjewel = await fetchLiveCJewelBalance(w);
      if (cjewel > 0) {
        walletsWithLiveData.add(w);
        jewelStakeAmount += cjewel;
      }
    }
    
    // Snapshot fallback: For any wallets that failed live fetch, use their snapshots
    const walletsNeedingFallback = walletsToAggregate.filter(w => !walletsWithLiveData.has(w));
    
    if (walletsNeedingFallback.length > 0 || jewelStakeAmount === 0) {
      try {
        // Get latest snapshot per wallet for wallets without live data
        let latestSnapshots: Array<{ walletAddress: string; stakedAmount: string }> = [];
        
        if (walletsNeedingFallback.length > 0) {
          const walletsArray = walletsNeedingFallback.map(w => `'${w}'`).join(',');
          latestSnapshots = await db.execute(sql.raw(`
            SELECT DISTINCT ON (wallet_address) 
              wallet_address as "walletAddress", 
              staked_amount as "stakedAmount"
            FROM staking_snapshots
            WHERE wallet_address IN (${walletsArray})
            ORDER BY wallet_address, snapshot_date DESC
          `)) as any;
        } else if (jewelStakeAmount === 0 && clusterKey) {
          // All wallets failed - try cluster-level fallback
          latestSnapshots = await db.execute(sql`
            SELECT DISTINCT ON (wallet_address) 
              wallet_address as "walletAddress", 
              staked_amount as "stakedAmount"
            FROM staking_snapshots
            WHERE cluster_key = ${clusterKey}
            ORDER BY wallet_address, snapshot_date DESC
          `) as any;
        }
        
        // Add snapshot amounts to live amounts
        for (const snap of latestSnapshots) {
          jewelStakeAmount += parseFloat(snap.stakedAmount || '0');
        }
      } catch (err) {
        console.warn(`[StakingExtractor] Snapshot fallback error:`, err);
      }
    }
    
    // 3. Calculate USD value using price oracle
    const jewelPrice = await getJewelPrice();
    let stakeUsdValue = jewelStakeAmount * jewelPrice;
    
    // 4. Calculate staking duration (longest continuous stake)
    let stakeDurationDays = 0;
    try {
      let snapshots: Array<{ snapshotDate: Date; stakedAmount: string; usdValue: number }> = [];
      
      if (clusterKey) {
        snapshots = await db
          .select({
            snapshotDate: stakingSnapshots.snapshotDate,
            stakedAmount: stakingSnapshots.stakedAmount,
            usdValue: stakingSnapshots.usdValue,
          })
          .from(stakingSnapshots)
          .where(eq(stakingSnapshots.clusterKey, clusterKey))
          .orderBy(stakingSnapshots.snapshotDate);
      } else if (walletsToAggregate.length > 0) {
        // For multi-wallet without cluster, aggregate by date
        snapshots = await db
          .select({
            snapshotDate: stakingSnapshots.snapshotDate,
            stakedAmount: stakingSnapshots.stakedAmount,
            usdValue: stakingSnapshots.usdValue,
          })
          .from(stakingSnapshots)
          .where(inArray(stakingSnapshots.walletAddress, walletsToAggregate))
          .orderBy(stakingSnapshots.snapshotDate);
      }
      
      if (snapshots.length > 0) {
        // Aggregate by date for cluster-level view
        const dailyTotals: Record<string, { amount: number; usdValue: number }> = {};
        for (const snap of snapshots) {
          const dateKey = new Date(snap.snapshotDate).toISOString().split('T')[0];
          if (!dailyTotals[dateKey]) {
            dailyTotals[dateKey] = { amount: 0, usdValue: 0 };
          }
          dailyTotals[dateKey].amount += parseFloat(snap.stakedAmount || '0');
          dailyTotals[dateKey].usdValue += snap.usdValue || 0;
        }
        
        // Compute max continuous staking duration
        const sortedDates = Object.keys(dailyTotals).sort();
        let streakStart: string | null = null;
        let lastActiveDate: string | null = null;
        let maxDuration = 0;
        
        for (let i = 0; i < sortedDates.length; i++) {
          const dateKey = sortedDates[i];
          const data = dailyTotals[dateKey];
          const isStaked = data.amount > 0 || data.usdValue >= MIN_STAKE_USD_THRESHOLD_CENTS;
          
          if (isStaked) {
            if (!streakStart) {
              streakStart = dateKey;
            }
            lastActiveDate = dateKey;
            
            // Check for gap
            if (i > 0) {
              const prevDate = new Date(sortedDates[i - 1]);
              const currDate = new Date(dateKey);
              const daysDiff = Math.floor((currDate.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24));
              if (daysDiff > 1) {
                // Gap detected - finalize previous streak
                if (streakStart && lastActiveDate) {
                  const start = new Date(streakStart);
                  const end = new Date(lastActiveDate);
                  const days = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
                  maxDuration = Math.max(maxDuration, days);
                }
                streakStart = dateKey;
              }
            }
          } else {
            // Staking dropped
            if (streakStart && lastActiveDate) {
              const start = new Date(streakStart);
              const end = new Date(lastActiveDate);
              const days = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
              maxDuration = Math.max(maxDuration, days);
            }
            streakStart = null;
            lastActiveDate = null;
          }
        }
        
        // Finalize last streak
        if (streakStart && lastActiveDate) {
          const start = new Date(streakStart);
          const end = new Date(lastActiveDate);
          const days = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
          maxDuration = Math.max(maxDuration, days);
        }
        
        stakeDurationDays = maxDuration;
      }
    } catch (err) {
      console.warn(`[StakingExtractor] Error computing staking duration:`, err);
    }
    
    return {
      stakeUsdValue,
      stakeDurationDays,
      jewelStakeAmount,
    };
  } catch (err) {
    console.error(`[StakingExtractor] Error extracting staking data for ${wallet}:`, err);
    return {
      stakeUsdValue: 0,
      stakeDurationDays: 0,
      jewelStakeAmount: 0,
    };
  }
}
