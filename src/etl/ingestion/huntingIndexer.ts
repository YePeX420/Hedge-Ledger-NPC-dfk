// src/etl/ingestion/huntingIndexer.ts
// Indexes hunting encounter events from DFK Chain (HuntsDiamond) into hunting_encounters table
// Uses direct RPC log scanning for full control without subgraph dependencies
// Source: https://devs.defikingdoms.com/contracts/void-hunts

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
    .where(eq(walletLinks.address, walletAddress.toLowerCase()))
    .limit(1);

  return result.length > 0 ? result[0].clusterKey : null;
}

interface ParsedHuntEvent {
  huntId: string;
  txHash: string;
  blockNumber: number;
  walletAddress: string;
  enemyId: string;
  result: 'WIN' | 'LOSS' | 'FLEE';
  heroIds: string[];
  encounteredAt: Date;
  drops: Array<{ itemId: string; quantity: number }>;
}

// ABI for HuntCompleted event decoding
const HUNT_COMPLETED_ABI = [
  'event HuntCompleted(uint256 huntId, tuple(uint256 id, uint256 huntDataId, uint256 startBlock, uint256[] heroIds, address player, uint8 status, uint256 resultSubmittedTimestamp, uint256[] petXpBonuses, uint256 startAtTime, uint256 retries, tuple(address item, uint16 submittedAmount, uint16 usedAmount)[] consumableItems) hunt, bool huntWon, uint256[] heroIds)',
];

function parseHuntingEvent(log: ethers.Log, block: ethers.Block): ParsedHuntEvent | null {
  try {
    const iface = new ethers.Interface(HUNT_COMPLETED_ABI);
    const decoded = iface.parseLog({ topics: log.topics as string[], data: log.data });
    
    if (!decoded) {
      console.warn('[HuntingIndexer] Could not decode log');
      return null;
    }
    
    const huntId = decoded.args[0].toString();
    const hunt = decoded.args[1];
    const huntWon = decoded.args[2];
    const heroIds = decoded.args[3].map((h: bigint) => h.toString());
    
    const walletAddress = hunt.player.toLowerCase();
    const enemyId = getEnemyName(Number(hunt.huntDataId));
    
    return {
      huntId,
      txHash: log.transactionHash,
      blockNumber: log.blockNumber,
      walletAddress,
      enemyId,
      result: huntWon ? 'WIN' : 'LOSS',
      heroIds,
      encounteredAt: new Date(Number(block.timestamp) * 1000),
      drops: [], // Drops come from separate RewardMinted events - can enhance later
    };
  } catch (err) {
    // Fallback: try simpler parsing from raw data
    try {
      const abiCoder = ethers.AbiCoder.defaultAbiCoder();
      // Try to extract player address from the hunt tuple structure
      // Position in data varies, so we do best-effort extraction
      const walletAddress = log.topics[1] 
        ? '0x' + log.topics[1].slice(26).toLowerCase()
        : null;
      
      if (!walletAddress || walletAddress === '0x') {
        console.warn('[HuntingIndexer] Could not extract wallet address');
        return null;
      }
      
      // Extract huntId from first 32 bytes
      const huntId = BigInt('0x' + log.data.slice(2, 66)).toString();
      
      return {
        huntId,
        txHash: log.transactionHash,
        blockNumber: log.blockNumber,
        walletAddress,
        enemyId: 'UNKNOWN',
        result: 'WIN', // Default assumption
        heroIds: [],
        encounteredAt: new Date(Number(block.timestamp) * 1000),
        drops: [],
      };
    } catch (fallbackErr) {
      console.error('[HuntingIndexer] Failed to parse event:', err);
      return null;
    }
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
    
    // Cache blocks to reduce RPC calls
    const blockCache: Map<number, ethers.Block> = new Map();
    
    for (const log of logs) {
      let block = blockCache.get(log.blockNumber);
      if (!block) {
        block = await provider.getBlock(log.blockNumber);
        if (block) blockCache.set(log.blockNumber, block);
      }
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
            survivingHeroCount: parsed.heroIds.length,
            survivingHeroHp: null,
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
  contractConfigured: boolean;
}> {
  const provider = getProvider();
  const currentBlock = await provider.getBlockNumber();
  const lastBlock = await getLastProcessedBlock();
  
  return {
    key: INDEXER_KEY,
    lastBlock,
    currentBlock,
    blocksRemaining: Math.max(0, currentBlock - lastBlock),
    contractConfigured: COMBAT_CONTRACTS.dfk.huntingContract !== '0x0000000000000000000000000000000000000000',
  };
}
