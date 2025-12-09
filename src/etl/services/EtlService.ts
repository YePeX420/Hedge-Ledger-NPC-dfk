// src/etl/services/EtlService.ts
// Main ETL orchestration service

import { db } from '../../../server/db.js';
import { players, leagueSignups, walletLinks, walletClusters } from '../../../shared/schema.js';
import { eq, sql, or } from 'drizzle-orm';
import { extractAllData } from '../extractors/index.js';
import { transformData } from '../transformers/index.js';
import { loadAllData, type LoadOptions } from '../loaders/index.js';
import type { WalletContext, EtlResult } from '../types.js';

let tierServiceModule: typeof import('../../services/classification/TierService.js') | null = null;

async function getTierService(): Promise<typeof import('../../services/classification/TierService.js') | null> {
  if (!tierServiceModule) {
    try {
      tierServiceModule = await import('../../services/classification/TierService.js');
    } catch {
      console.warn('[EtlService] TierService not available');
    }
  }
  return tierServiceModule;
}

export class EtlService {
  private isRunning: boolean = false;
  private lastRunAt: Date | null = null;
  
  async runForWallet(wallet: string, options: LoadOptions = {}): Promise<EtlResult> {
    const startTime = Date.now();
    console.log(`[EtlService] Starting ETL for wallet ${wallet}`);
    
    try {
      const ctx = await this.buildContext(wallet);
      
      const extractResult = await extractAllData(ctx);
      
      const transformResult = transformData(extractResult);
      
      const loadResult = await loadAllData(ctx, extractResult, transformResult, options);
      
      if (ctx.clusterKey) {
        await this.triggerTierRecompute(ctx.clusterKey);
      }
      
      const duration = Date.now() - startTime;
      console.log(`[EtlService] ETL complete for ${wallet} in ${duration}ms`);
      
      return {
        success: true,
        wallet,
        extractedAt: extractResult.extractedAt,
        metrics: {
          heroCount: extractResult.heroes.heroCount,
          totalLevels: extractResult.heroes.totalLevels,
          questsTotal: extractResult.quests.professionQuestsTotal + extractResult.quests.trainingQuestsTotal,
          lpValue: extractResult.gardens.totalLPValue,
          challengeProgressUpdated: loadResult.playerChallengeProgress,
        },
      };
    } catch (err) {
      console.error(`[EtlService] ETL failed for ${wallet}:`, err);
      return {
        success: false,
        wallet,
        extractedAt: new Date(),
        metrics: {},
        errors: [(err as Error).message],
      };
    }
  }
  
  async runForCluster(clusterKey: string): Promise<EtlResult[]> {
    console.log(`[EtlService] Starting ETL for cluster ${clusterKey}`);
    
    try {
      // First try wallet_links (primary source for linked wallets)
      const links = await db
        .select({
          address: walletLinks.address,
        })
        .from(walletLinks)
        .where(eq(walletLinks.clusterKey, clusterKey));
      
      // Fall back to leagueSignups if no wallet_links found
      let walletAddresses: string[] = links.map((l: { address: string }) => l.address);
      
      if (walletAddresses.length === 0) {
        const signups = await db
          .select({
            walletAddress: leagueSignups.walletAddress,
          })
          .from(leagueSignups)
          .where(eq(leagueSignups.clusterKey, clusterKey));
        
        walletAddresses = signups.map((s: { walletAddress: string }) => s.walletAddress);
      }
      
      if (walletAddresses.length === 0) {
        console.log(`[EtlService] No wallets found for cluster ${clusterKey}`);
        return [];
      }
      
      console.log(`[EtlService] Found ${walletAddresses.length} wallet(s) for cluster ${clusterKey}`);
      
      const results: EtlResult[] = [];
      
      for (const walletAddress of walletAddresses) {
        const result = await this.runForWallet(walletAddress, {
          includeSnapshots: true,
          includeTransfers: true,
        });
        results.push(result);
      }
      
      console.log(`[EtlService] Cluster ETL complete for ${clusterKey}: ${results.length} wallets processed`);
      return results;
    } catch (err) {
      console.error(`[EtlService] Cluster ETL failed for ${clusterKey}:`, err);
      return [];
    }
  }
  
  async warmupWallet(wallet: string): Promise<EtlResult> {
    console.log(`[EtlService] Warmup ETL for wallet ${wallet}`);
    
    return this.runForWallet(wallet, {
      includeSnapshots: true,
      includeTransfers: true,
    });
  }
  
  async runIncremental(): Promise<void> {
    if (this.isRunning) {
      console.log(`[EtlService] Incremental run already in progress, skipping`);
      return;
    }
    
    this.isRunning = true;
    const startTime = Date.now();
    console.log(`[EtlService] Starting incremental ETL run`);
    
    try {
      const activeWallets = await this.getActiveWallets();
      
      let processed = 0;
      let errors = 0;
      
      for (const wallet of activeWallets) {
        try {
          await this.runForWallet(wallet);
          processed++;
        } catch (err) {
          console.error(`[EtlService] Error processing wallet ${wallet}:`, err);
          errors++;
        }
      }
      
      const duration = Date.now() - startTime;
      console.log(`[EtlService] Incremental ETL complete: ${processed} processed, ${errors} errors, ${duration}ms`);
      
      this.lastRunAt = new Date();
    } finally {
      this.isRunning = false;
    }
  }
  
  async runDailySnapshot(): Promise<void> {
    if (this.isRunning) {
      console.log(`[EtlService] Daily snapshot already in progress, skipping`);
      return;
    }
    
    this.isRunning = true;
    const startTime = Date.now();
    console.log(`[EtlService] Starting daily snapshot ETL run`);
    
    try {
      const allWallets = await this.getAllWallets();
      
      let processed = 0;
      let errors = 0;
      
      for (const wallet of allWallets) {
        try {
          await this.runForWallet(wallet, {
            includeSnapshots: true,
            includeTransfers: true,
          });
          processed++;
        } catch (err) {
          console.error(`[EtlService] Error processing wallet ${wallet}:`, err);
          errors++;
        }
      }
      
      const duration = Date.now() - startTime;
      console.log(`[EtlService] Daily snapshot ETL complete: ${processed} processed, ${errors} errors, ${duration}ms`);
    } finally {
      this.isRunning = false;
    }
  }
  
  private async buildContext(wallet: string): Promise<WalletContext> {
    const lowerWallet = wallet.toLowerCase();
    
    const playerRecords = await db
      .select()
      .from(players)
      .where(eq(players.primaryWallet, lowerWallet))
      .limit(1);
    
    const player = playerRecords[0];
    
    let clusterKey: string | undefined;
    let userId: string | undefined = player?.discordId;
    
    try {
      const links = await db
        .select()
        .from(walletLinks)
        .where(eq(walletLinks.address, lowerWallet))
        .limit(1);
      
      if (links[0]) {
        clusterKey = links[0].clusterKey;
      }
    } catch {
    }
    
    if (!clusterKey) {
      try {
        const signups = await db
          .select()
          .from(leagueSignups)
          .where(eq(leagueSignups.walletAddress, lowerWallet))
          .limit(1);
        
        if (signups[0]) {
          clusterKey = signups[0].clusterKey;
          userId = userId || signups[0].userId;
        }
      } catch {
      }
    }
    
    return {
      walletAddress: lowerWallet,
      userId,
      playerId: player?.id,
      clusterKey,
    };
  }
  
  private async getActiveWallets(): Promise<string[]> {
    const result = await db
      .select({ wallet: players.primaryWallet })
      .from(players)
      .where(sql`${players.primaryWallet} IS NOT NULL`)
      .limit(100);
    
    return result.map((r: { wallet: string | null }) => r.wallet).filter(Boolean) as string[];
  }
  
  private async getAllWallets(): Promise<string[]> {
    const result = await db
      .select({ wallet: players.primaryWallet })
      .from(players)
      .where(sql`${players.primaryWallet} IS NOT NULL`);
    
    return result.map((r: { wallet: string | null }) => r.wallet).filter(Boolean) as string[];
  }
  
  getStatus(): { isRunning: boolean; lastRunAt: Date | null } {
    return {
      isRunning: this.isRunning,
      lastRunAt: this.lastRunAt,
    };
  }
  
  private async triggerTierRecompute(clusterKey: string): Promise<void> {
    try {
      const tierService = await getTierService();
      if (tierService?.computeBaseTierForCluster) {
        console.log(`[EtlService] Triggering tier recompute for cluster ${clusterKey}`);
        await tierService.computeBaseTierForCluster(clusterKey);
      }
    } catch (err) {
      console.warn(`[EtlService] Failed to trigger tier recompute:`, err);
    }
  }
}

export const etlService = new EtlService();
