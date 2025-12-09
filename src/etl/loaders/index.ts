// src/etl/loaders/index.ts
// Main loader orchestrator

import type { WalletContext, FullExtractResult, TransformResult, LoadResult } from '../types.js';
import { loadChallengeProgress } from './challengeProgressLoader.js';
import { loadWalletActivity } from './walletActivityLoader.js';
import { loadWalletSnapshot, loadPowerSnapshot } from './snapshotLoader.js';
import { loadTransferAggregate } from './transferAggregateLoader.js';

export interface LoadOptions {
  includeSnapshots?: boolean;
  includeTransfers?: boolean;
}

export async function loadAllData(
  ctx: WalletContext,
  data: FullExtractResult,
  transform: TransformResult,
  options: LoadOptions = {}
): Promise<LoadResult> {
  console.log(`[ETL:Load] Starting data load for wallet ${ctx.walletAddress}`);
  
  const { includeSnapshots = false, includeTransfers = false } = options;
  
  const [challengeProgress, walletActivityCount] = await Promise.all([
    loadChallengeProgress(ctx, data, transform),
    loadWalletActivity(ctx, data, transform),
  ]);
  
  let walletSnapshotCount = 0;
  let powerSnapshotCount = 0;
  let transferAggregateCount = 0;
  
  if (includeSnapshots) {
    [walletSnapshotCount, powerSnapshotCount] = await Promise.all([
      loadWalletSnapshot(ctx, data),
      loadPowerSnapshot(ctx, data),
    ]);
  }
  
  if (includeTransfers) {
    transferAggregateCount = await loadTransferAggregate(ctx, data);
  }
  
  const result = {
    playerChallengeProgress: challengeProgress,
    walletActivity: walletActivityCount,
    walletSnapshots: walletSnapshotCount,
    walletPowerSnapshots: powerSnapshotCount,
    walletTransferAggregates: transferAggregateCount,
  };
  
  console.log(`[ETL:Load] Load complete for wallet ${ctx.walletAddress}:`, result);
  
  return result;
}

export {
  loadChallengeProgress,
  loadWalletActivity,
  loadWalletSnapshot,
  loadPowerSnapshot,
  loadTransferAggregate,
};
