// src/etl/extractors/lpExtractor.ts
// Extracts LP position data for ETL pipeline
// Cluster-aware aggregation using lp_position_snapshots, lp_harvest_events tables
// and real-time wallet LP detection

import type { ExtractedLpData, WalletContext } from '../types.js';
import { db } from '../../../server/db.js';
import { lpPositionSnapshots, lpHarvestEvents, walletLinks } from '../../../shared/schema.js';
import { eq, sql, inArray } from 'drizzle-orm';

const MIN_USD_THRESHOLD = 1; // $1 minimum to count a pool

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
 * Fetch LP positions from live detector for a single wallet
 */
async function fetchLivePositions(wallet: string): Promise<Array<{ pid: number; userTVL: string }>> {
  try {
    const lpDetector = await import('../../../wallet-lp-detector.js');
    if (lpDetector.detectWalletLPPositions) {
      const positions = await lpDetector.detectWalletLPPositions(wallet);
      return positions || [];
    }
  } catch {
    // Live detector not available
  }
  return [];
}

export async function extractLpData(ctx: WalletContext): Promise<ExtractedLpData> {
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
    
    // 2. Aggregate LP USD value and pool count across all cluster wallets
    let lpUsdValue = 0;
    const activePoolIds = new Set<number>();
    
    for (const w of walletsToAggregate) {
      const positions = await fetchLivePositions(w);
      for (const pos of positions) {
        const tvl = parseFloat(pos.userTVL || '0');
        lpUsdValue += tvl;
        if (tvl >= MIN_USD_THRESHOLD) {
          activePoolIds.add(pos.pid);
        }
      }
    }
    
    const poolCount = activePoolIds.size;
    
    // 3. Get harvest actions count (cluster-aware from warehouse)
    let harvestActions = 0;
    try {
      if (clusterKey) {
        const result = await db
          .select({ count: sql<number>`count(*)` })
          .from(lpHarvestEvents)
          .where(eq(lpHarvestEvents.clusterKey, clusterKey));
        harvestActions = Number(result[0]?.count || 0);
      } else if (walletsToAggregate.length > 0) {
        const result = await db
          .select({ count: sql<number>`count(*)` })
          .from(lpHarvestEvents)
          .where(inArray(lpHarvestEvents.walletAddress, walletsToAggregate));
        harvestActions = Number(result[0]?.count || 0);
      }
    } catch (err) {
      console.warn(`[LpExtractor] Error fetching harvest events:`, err);
    }
    
    // 4. Calculate LP duration (max days held in any single pool)
    // Uses snapshot warehouse for historical tracking
    let lpDurationMaxDays = 0;
    try {
      let snapshots: Array<{ poolId: number; snapshotDate: Date; usdValue: number }> = [];
      
      if (clusterKey) {
        snapshots = await db
          .select({
            poolId: lpPositionSnapshots.poolId,
            snapshotDate: lpPositionSnapshots.snapshotDate,
            usdValue: lpPositionSnapshots.usdValue,
          })
          .from(lpPositionSnapshots)
          .where(eq(lpPositionSnapshots.clusterKey, clusterKey))
          .orderBy(lpPositionSnapshots.poolId, lpPositionSnapshots.snapshotDate);
      } else if (walletsToAggregate.length > 0) {
        snapshots = await db
          .select({
            poolId: lpPositionSnapshots.poolId,
            snapshotDate: lpPositionSnapshots.snapshotDate,
            usdValue: lpPositionSnapshots.usdValue,
          })
          .from(lpPositionSnapshots)
          .where(inArray(lpPositionSnapshots.walletAddress, walletsToAggregate))
          .orderBy(lpPositionSnapshots.poolId, lpPositionSnapshots.snapshotDate);
      }
      
      if (snapshots.length > 0) {
        // Group snapshots by pool for proper per-pool streak detection
        const poolSnapshots: Record<number, Array<{ date: Date; usdValue: number }>> = {};
        for (const snap of snapshots) {
          if (!poolSnapshots[snap.poolId]) {
            poolSnapshots[snap.poolId] = [];
          }
          poolSnapshots[snap.poolId].push({
            date: new Date(snap.snapshotDate),
            usdValue: snap.usdValue,
          });
        }
        
        // Compute max duration for each pool
        for (const poolId in poolSnapshots) {
          const poolData = poolSnapshots[poolId];
          let maxDuration = 0;
          let streakStart: Date | null = null;
          let lastActiveDate: Date | null = null;
          
          for (let i = 0; i < poolData.length; i++) {
            const snap = poolData[i];
            const isActive = snap.usdValue >= MIN_USD_THRESHOLD * 100; // usdValue stored in cents
            
            if (isActive) {
              if (!streakStart) {
                streakStart = snap.date;
              }
              lastActiveDate = snap.date;
              
              // Check for gap (more than 1 day between snapshots)
              if (i > 0) {
                const prevDate = poolData[i - 1].date;
                const daysDiff = Math.floor((snap.date.getTime() - prevDate.getTime()) / (1000 * 60 * 60 * 24));
                if (daysDiff > 1) {
                  // Gap detected - finalize previous streak
                  if (streakStart && lastActiveDate) {
                    const days = Math.floor((lastActiveDate.getTime() - streakStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
                    maxDuration = Math.max(maxDuration, days);
                  }
                  streakStart = snap.date; // Start new streak
                }
              }
            } else {
              // Position dropped below threshold
              if (streakStart && lastActiveDate) {
                const days = Math.floor((lastActiveDate.getTime() - streakStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
                maxDuration = Math.max(maxDuration, days);
              }
              streakStart = null;
              lastActiveDate = null;
            }
          }
          
          // Finalize last streak for this pool
          if (streakStart && lastActiveDate) {
            const days = Math.floor((lastActiveDate.getTime() - streakStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
            maxDuration = Math.max(maxDuration, days);
          }
          
          lpDurationMaxDays = Math.max(lpDurationMaxDays, maxDuration);
        }
      }
    } catch (err) {
      console.warn(`[LpExtractor] Error computing LP duration:`, err);
    }
    
    return {
      lpUsdValue,
      poolCount,
      harvestActions,
      lpDurationMaxDays,
    };
  } catch (err) {
    console.error(`[LpExtractor] Error extracting LP data for ${wallet}:`, err);
    return {
      lpUsdValue: 0,
      poolCount: 0,
      harvestActions: 0,
      lpDurationMaxDays: 0,
    };
  }
}
