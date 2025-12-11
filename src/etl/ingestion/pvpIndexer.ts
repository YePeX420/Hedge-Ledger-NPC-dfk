// src/etl/ingestion/pvpIndexer.ts
// Indexes PvP match events from DFK/METIS chains into pvp_matches table
// Uses direct RPC log scanning for full control without subgraph dependencies

import { ethers } from 'ethers';
import { db } from '../../../server/db.js';
import { pvpMatches, ingestionState, walletLinks } from '../../../shared/schema.js';
import { eq, sql } from 'drizzle-orm';
import {
  COMBAT_CONTRACTS,
  INDEXER_START_BLOCKS,
  BLOCKS_PER_QUERY,
  PVP_EVENTS,
} from '../../config/combatContracts.js';

const INDEXER_KEY_DFK = 'pvp_dfk';
const INDEXER_KEY_METIS = 'pvp_metis';

const providers: Record<string, ethers.JsonRpcProvider> = {};

function getProvider(realm: 'dfk' | 'metis'): ethers.JsonRpcProvider {
  if (!providers[realm]) {
    const rpcUrl = realm === 'dfk' 
      ? COMBAT_CONTRACTS.dfk.rpcUrl 
      : COMBAT_CONTRACTS.metis.rpcUrl;
    providers[realm] = new ethers.JsonRpcProvider(rpcUrl);
  }
  return providers[realm];
}

async function getLastProcessedBlock(key: string, defaultBlock: number): Promise<number> {
  const result = await db
    .select()
    .from(ingestionState)
    .where(eq(ingestionState.key, key))
    .limit(1);

  if (result.length === 0) {
    return defaultBlock;
  }
  return result[0].lastBlock;
}

async function updateLastProcessedBlock(key: string, block: number): Promise<void> {
  await db
    .insert(ingestionState)
    .values({ key, lastBlock: block })
    .onConflictDoUpdate({
      target: ingestionState.key,
      set: { lastBlock: block, lastUpdatedAt: sql`CURRENT_TIMESTAMP` },
    });
}

async function getClusterKey(walletAddress: string): Promise<string | null> {
  const result = await db
    .select({ clusterKey: walletLinks.clusterKey })
    .from(walletLinks)
    .where(eq(walletLinks.walletAddress, walletAddress.toLowerCase()))
    .limit(1);

  return result.length > 0 ? result[0].clusterKey : null;
}

interface ParsedPvpEvent {
  matchId: string;
  txHash: string;
  blockNumber: number;
  walletAddress: string;
  isRanked: boolean;
  outcome: 'WIN' | 'LOSS' | 'DRAW';
  heroDeaths: number;
  matchedAt: Date;
  meta: {
    opponentWallet?: string;
    teamSize?: number;
    influenceGained?: number;
  };
}

function parsePvpEvent(log: ethers.Log, block: ethers.Block, realm: string): ParsedPvpEvent | null {
  try {
    // Decode based on event signature
    // This is a placeholder implementation - update with actual event structure
    
    const walletAddress = '0x' + log.topics[1]?.slice(26).toLowerCase();
    const opponentWallet = log.topics[2] 
      ? '0x' + log.topics[2].slice(26).toLowerCase() 
      : undefined;
    
    // Decode data - placeholder logic
    // When you have the real ABI, decode properly
    const resultRaw = parseInt(log.data.slice(2, 66), 16) || 0;
    const heroDeaths = parseInt(log.data.slice(66, 130), 16) || 0;
    const isRankedRaw = parseInt(log.data.slice(130, 194), 16) || 1;
    const influenceGained = parseInt(log.data.slice(194, 258), 16) || 0;
    
    const outcome = resultRaw === 1 ? 'WIN' : resultRaw === 2 ? 'DRAW' : 'LOSS';
    
    // Generate unique match ID from tx hash and log index
    const matchId = `${log.transactionHash}-${log.index}`;
    
    return {
      matchId,
      txHash: log.transactionHash,
      blockNumber: log.blockNumber,
      walletAddress,
      isRanked: isRankedRaw === 1,
      outcome,
      heroDeaths,
      matchedAt: new Date(Number(block.timestamp) * 1000),
      meta: {
        opponentWallet,
        influenceGained: influenceGained > 0 ? influenceGained : undefined,
      },
    };
  } catch (err) {
    console.error('[PvpIndexer] Failed to parse event:', err);
    return null;
  }
}

async function runPvpIndexerForRealm(realm: 'dfk' | 'metis'): Promise<{
  processed: number;
  inserted: number;
  fromBlock: number;
  toBlock: number;
}> {
  const indexerKey = realm === 'dfk' ? INDEXER_KEY_DFK : INDEXER_KEY_METIS;
  const startBlock = realm === 'dfk' 
    ? INDEXER_START_BLOCKS.pvp_dfk 
    : INDEXER_START_BLOCKS.pvp_metis;
  const contractAddress = realm === 'dfk'
    ? COMBAT_CONTRACTS.dfk.pvpContract
    : COMBAT_CONTRACTS.metis.pvpContract;
  
  console.log(`[PvpIndexer] Starting ${realm} PvP indexer run...`);
  
  const provider = getProvider(realm);
  const currentBlock = await provider.getBlockNumber();
  const lastBlock = await getLastProcessedBlock(indexerKey, startBlock);
  
  const fromBlock = lastBlock + 1;
  const toBlock = Math.min(fromBlock + BLOCKS_PER_QUERY - 1, currentBlock);
  
  if (fromBlock > currentBlock) {
    console.log(`[PvpIndexer] ${realm} already up to date`);
    return { processed: 0, inserted: 0, fromBlock: lastBlock, toBlock: lastBlock };
  }
  
  console.log(`[PvpIndexer] Scanning ${realm} blocks ${fromBlock} to ${toBlock}`);
  
  // Check if contract address is configured
  if (contractAddress === '0x0000000000000000000000000000000000000000') {
    console.warn(`[PvpIndexer] ${realm} PvP contract address not configured, skipping (no checkpoint advance)`);
    // DO NOT advance checkpoint when contract not configured - prevents skipping historical data
    return { processed: 0, inserted: 0, fromBlock: lastBlock, toBlock: lastBlock };
  }
  
  try {
    // Fetch logs for PvP events
    const logs = await provider.getLogs({
      address: contractAddress,
      topics: [PVP_EVENTS.MatchResolved],
      fromBlock,
      toBlock,
    });
    
    console.log(`[PvpIndexer] Found ${logs.length} PvP events on ${realm}`);
    
    let inserted = 0;
    
    for (const log of logs) {
      const block = await provider.getBlock(log.blockNumber);
      if (!block) continue;
      
      const parsed = parsePvpEvent(log, block, realm);
      if (!parsed) continue;
      
      // Only process ranked matches for challenge tracking
      if (!parsed.isRanked) continue;
      
      // Get cluster key for wallet
      const clusterKey = await getClusterKey(parsed.walletAddress);
      
      // Insert with conflict handling (idempotent)
      try {
        await db
          .insert(pvpMatches)
          .values({
            walletAddress: parsed.walletAddress,
            clusterKey,
            matchId: parsed.matchId,
            realm,
            isRanked: parsed.isRanked,
            outcome: parsed.outcome,
            heroDeaths: parsed.heroDeaths,
            matchedAt: parsed.matchedAt,
            meta: parsed.meta,
          })
          .onConflictDoNothing();
        inserted++;
      } catch (err: any) {
        if (!err.message?.includes('duplicate')) {
          console.error('[PvpIndexer] Insert error:', err);
        }
      }
    }
    
    await updateLastProcessedBlock(indexerKey, toBlock);
    
    console.log(`[PvpIndexer] Processed ${logs.length} ${realm} events, inserted ${inserted} new matches`);
    
    return { processed: logs.length, inserted, fromBlock, toBlock };
  } catch (err) {
    console.error(`[PvpIndexer] Error scanning ${realm} blocks:`, err);
    throw err;
  }
}

export async function runPvpIndexer(): Promise<{
  dfk: { processed: number; inserted: number; fromBlock: number; toBlock: number };
  metis: { processed: number; inserted: number; fromBlock: number; toBlock: number };
}> {
  const [dfkResult, metisResult] = await Promise.all([
    runPvpIndexerForRealm('dfk'),
    runPvpIndexerForRealm('metis'),
  ]);
  
  return {
    dfk: dfkResult,
    metis: metisResult,
  };
}

export async function getPvpIndexerStatus(): Promise<{
  dfk: { key: string; lastBlock: number; currentBlock: number; blocksRemaining: number };
  metis: { key: string; lastBlock: number; currentBlock: number; blocksRemaining: number };
}> {
  const dfkProvider = getProvider('dfk');
  const metisProvider = getProvider('metis');
  
  const [dfkCurrent, metisCurrent, dfkLast, metisLast] = await Promise.all([
    dfkProvider.getBlockNumber(),
    metisProvider.getBlockNumber(),
    getLastProcessedBlock(INDEXER_KEY_DFK, INDEXER_START_BLOCKS.pvp_dfk),
    getLastProcessedBlock(INDEXER_KEY_METIS, INDEXER_START_BLOCKS.pvp_metis),
  ]);
  
  return {
    dfk: {
      key: INDEXER_KEY_DFK,
      lastBlock: dfkLast,
      currentBlock: dfkCurrent,
      blocksRemaining: Math.max(0, dfkCurrent - dfkLast),
    },
    metis: {
      key: INDEXER_KEY_METIS,
      lastBlock: metisLast,
      currentBlock: metisCurrent,
      blocksRemaining: Math.max(0, metisCurrent - metisLast),
    },
  };
}
