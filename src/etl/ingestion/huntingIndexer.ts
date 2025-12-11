// src/etl/ingestion/huntingIndexer.ts
// Indexes hunting encounter events from DFK Chain into hunting_encounters table
// Uses direct RPC log scanning for full control without subgraph dependencies

import { ethers } from 'ethers';
import { db } from '../../../server/db.js';
import { huntingEncounters, ingestionState, walletLinks } from '../../../shared/schema.js';
import { eq, sql } from 'drizzle-orm';
import {
  COMBAT_CONTRACTS,
  INDEXER_START_BLOCKS,
  BLOCKS_PER_QUERY,
  HUNTING_EVENTS,
  getEnemyName,
} from '../../config/combatContracts.js';

const INDEXER_KEY = 'hunting_dfk';

let providerInstance: ethers.JsonRpcProvider | null = null;

function getProvider(): ethers.JsonRpcProvider {
  if (!providerInstance) {
    providerInstance = new ethers.JsonRpcProvider(COMBAT_CONTRACTS.dfk.rpcUrl);
  }
  return providerInstance;
}

async function getLastProcessedBlock(): Promise<number> {
  const result = await db
    .select()
    .from(ingestionState)
    .where(eq(ingestionState.key, INDEXER_KEY))
    .limit(1);

  if (result.length === 0) {
    return INDEXER_START_BLOCKS.hunting_dfk;
  }
  return result[0].lastBlock;
}

async function updateLastProcessedBlock(block: number): Promise<void> {
  await db
    .insert(ingestionState)
    .values({ key: INDEXER_KEY, lastBlock: block })
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

interface ParsedHuntEvent {
  txHash: string;
  blockNumber: number;
  walletAddress: string;
  enemyId: string;
  result: 'WIN' | 'LOSS' | 'FLEE';
  survivingHeroCount: number;
  survivingHeroHp: number | null;
  encounteredAt: Date;
  drops: Array<{ itemId: string; quantity: number }>;
}

function parseHuntingEvent(log: ethers.Log, block: ethers.Block): ParsedHuntEvent | null {
  try {
    // Decode based on event signature
    // This is a placeholder implementation - update with actual event structure
    
    // Example decoding (adjust based on actual ABI):
    // topics[0] = event signature
    // topics[1] = indexed player address
    // data = encoded (enemyId, result, survivingHeroes, survivingHp, drops)
    
    const walletAddress = '0x' + log.topics[1]?.slice(26).toLowerCase();
    
    // Decode data - this is placeholder logic
    // In reality, you'd use ethers.AbiCoder to decode the data based on ABI
    const abiCoder = ethers.AbiCoder.defaultAbiCoder();
    
    // Placeholder: extract minimal data
    // When you have the real ABI, decode properly
    const enemyIdRaw = parseInt(log.data.slice(2, 66), 16) || 1;
    const resultRaw = parseInt(log.data.slice(66, 130), 16) || 0;
    const survivingHeroes = parseInt(log.data.slice(130, 194), 16) || 0;
    const survivingHp = parseInt(log.data.slice(194, 258), 16) || 0;
    
    const result = resultRaw === 1 ? 'WIN' : resultRaw === 2 ? 'FLEE' : 'LOSS';
    
    return {
      txHash: log.transactionHash,
      blockNumber: log.blockNumber,
      walletAddress,
      enemyId: getEnemyName(enemyIdRaw),
      result,
      survivingHeroCount: survivingHeroes,
      survivingHeroHp: survivingHp > 0 ? survivingHp : null,
      encounteredAt: new Date(Number(block.timestamp) * 1000),
      drops: [], // Would parse from additional data or separate events
    };
  } catch (err) {
    console.error('[HuntingIndexer] Failed to parse event:', err);
    return null;
  }
}

export async function runHuntingIndexer(): Promise<{
  processed: number;
  inserted: number;
  fromBlock: number;
  toBlock: number;
}> {
  console.log('[HuntingIndexer] Starting hunting indexer run...');
  
  const provider = getProvider();
  const currentBlock = await provider.getBlockNumber();
  const lastBlock = await getLastProcessedBlock();
  
  const fromBlock = lastBlock + 1;
  const toBlock = Math.min(fromBlock + BLOCKS_PER_QUERY - 1, currentBlock);
  
  if (fromBlock > currentBlock) {
    console.log('[HuntingIndexer] Already up to date');
    return { processed: 0, inserted: 0, fromBlock: lastBlock, toBlock: lastBlock };
  }
  
  console.log(`[HuntingIndexer] Scanning blocks ${fromBlock} to ${toBlock}`);
  
  // Check if contract address is configured
  if (COMBAT_CONTRACTS.dfk.huntingContract === '0x0000000000000000000000000000000000000000') {
    console.warn('[HuntingIndexer] Hunting contract address not configured, skipping (no checkpoint advance)');
    // DO NOT advance checkpoint when contract not configured - prevents skipping historical data
    return { processed: 0, inserted: 0, fromBlock: lastBlock, toBlock: lastBlock };
  }
  
  try {
    // Fetch logs for hunting events
    const logs = await provider.getLogs({
      address: COMBAT_CONTRACTS.dfk.huntingContract,
      topics: [HUNTING_EVENTS.HuntCompleted],
      fromBlock,
      toBlock,
    });
    
    console.log(`[HuntingIndexer] Found ${logs.length} hunting events`);
    
    let inserted = 0;
    
    for (const log of logs) {
      const block = await provider.getBlock(log.blockNumber);
      if (!block) continue;
      
      const parsed = parseHuntingEvent(log, block);
      if (!parsed) continue;
      
      // Get cluster key for wallet
      const clusterKey = await getClusterKey(parsed.walletAddress);
      
      // Insert with conflict handling (idempotent)
      try {
        await db
          .insert(huntingEncounters)
          .values({
            walletAddress: parsed.walletAddress,
            clusterKey,
            txHash: parsed.txHash,
            realm: 'dfk',
            enemyId: parsed.enemyId,
            result: parsed.result,
            survivingHeroCount: parsed.survivingHeroCount,
            survivingHeroHp: parsed.survivingHeroHp,
            drops: parsed.drops,
            encounteredAt: parsed.encounteredAt,
          })
          .onConflictDoNothing();
        inserted++;
      } catch (err: any) {
        if (!err.message?.includes('duplicate')) {
          console.error('[HuntingIndexer] Insert error:', err);
        }
      }
    }
    
    await updateLastProcessedBlock(toBlock);
    
    console.log(`[HuntingIndexer] Processed ${logs.length} events, inserted ${inserted} new encounters`);
    
    return { processed: logs.length, inserted, fromBlock, toBlock };
  } catch (err) {
    console.error('[HuntingIndexer] Error scanning blocks:', err);
    throw err;
  }
}

export async function getHuntingIndexerStatus(): Promise<{
  key: string;
  lastBlock: number;
  currentBlock: number;
  blocksRemaining: number;
}> {
  const provider = getProvider();
  const currentBlock = await provider.getBlockNumber();
  const lastBlock = await getLastProcessedBlock();
  
  return {
    key: INDEXER_KEY,
    lastBlock,
    currentBlock,
    blocksRemaining: Math.max(0, currentBlock - lastBlock),
  };
}
