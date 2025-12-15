// src/etl/ingestion/index.ts
// Orchestrates all blockchain data indexers for hunting and PvP data

import { runHuntingIndexer, getHuntingIndexerStatus } from './huntingIndexer.js';
import { runPvpIndexer, getPvpIndexerStatus } from './pvpIndexer.js';

export interface IngestionResult {
  hunting: {
    processed: number;
    inserted: number;
    fromBlock: number;
    toBlock: number;
  };
  pvp: {
    dfk: { processed: number; inserted: number; fromBlock: number; toBlock: number };
    klaytn: { processed: number; inserted: number; fromBlock: number; toBlock: number };
  };
  completedAt: Date;
}

/**
 * Run all indexers in a single pass
 * This should be called periodically (e.g., every 5-10 minutes)
 */
export async function runAllIngestion(): Promise<IngestionResult> {
  console.log('[Ingestion] Starting full ingestion run...');
  const startTime = Date.now();
  
  const [huntingResult, pvpResult] = await Promise.all([
    runHuntingIndexer(),
    runPvpIndexer(),
  ]);
  
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`[Ingestion] Completed in ${elapsed}s`);
  console.log(`[Ingestion] Hunting: ${huntingResult.inserted} new encounters`);
  console.log(`[Ingestion] PvP DFK: ${pvpResult.dfk.inserted} new matches`);
  console.log(`[Ingestion] PvP Klaytn: ${pvpResult.klaytn.inserted} new matches`);
  
  return {
    hunting: huntingResult,
    pvp: pvpResult,
    completedAt: new Date(),
  };
}

/**
 * Get status of all indexers
 */
export async function getIngestionStatus(): Promise<{
  hunting: { key: string; lastBlock: number; currentBlock: number; blocksRemaining: number };
  pvp: {
    dfk: { key: string; lastBlock: number; currentBlock: number; blocksRemaining: number; contractConfigured: boolean };
    klaytn: { key: string; lastBlock: number; currentBlock: number; blocksRemaining: number; contractConfigured: boolean };
  };
}> {
  const [huntingStatus, pvpStatus] = await Promise.all([
    getHuntingIndexerStatus(),
    getPvpIndexerStatus(),
  ]);
  
  return {
    hunting: huntingStatus,
    pvp: pvpStatus,
  };
}

// Re-export individual indexers for granular control
export { runHuntingIndexer, getHuntingIndexerStatus } from './huntingIndexer.js';
export { runPvpIndexer, getPvpIndexerStatus } from './pvpIndexer.js';

// Pool event indexers for APR calculations
export * from './poolSwapIndexer.js';
export * from './poolRewardIndexer.js';
