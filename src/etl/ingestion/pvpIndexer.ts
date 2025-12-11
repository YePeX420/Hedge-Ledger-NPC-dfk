// src/etl/ingestion/pvpIndexer.ts
// Indexes PvP match events from DFK Duel contracts into pvp_matches table
// Uses direct RPC log scanning for full control without subgraph dependencies
// Source: https://devs.defikingdoms.com/contracts/dfk-duel

import { ethers } from 'ethers';
import { db } from '../../../server/db.js';
import { pvpMatches, ingestionState, walletLinks } from '../../../shared/schema.js';
import { eq, sql } from 'drizzle-orm';
import {
  COMBAT_CONTRACTS,
  INDEXER_START_BLOCKS,
  BLOCKS_PER_QUERY,
  PVP_EVENTS,
  getDuelTypeName,
} from '../../config/combatContracts.js';

const INDEXER_KEY_DFK = 'pvp_dfk';
const INDEXER_KEY_KLAYTN = 'pvp_klaytn';

const providers: Record<string, ethers.JsonRpcProvider> = {};

function getProvider(realm: 'dfk' | 'klaytn'): ethers.JsonRpcProvider {
  if (!providers[realm]) {
    const rpcUrl = realm === 'dfk' 
      ? COMBAT_CONTRACTS.dfk.rpcUrl 
      : COMBAT_CONTRACTS.klaytn.rpcUrl;
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
    .where(eq(walletLinks.address, walletAddress.toLowerCase()))
    .limit(1);

  return result.length > 0 ? result[0].clusterKey : null;
}

interface ParsedPvpEvent {
  duelId: string;
  txHash: string;
  blockNumber: number;
  player1: string;
  player2: string;
  winner: string;
  duelType: string;
  heroIds: string[];
  matchedAt: Date;
  scoreChange: {
    base: number;
    streakBonus: number;
    scoreBefore: number;
    scoreAfter: number;
  } | null;
}

// ABI for DuelCompleted event decoding
const DUEL_COMPLETED_ABI = [
  'event DuelCompleted(uint256 indexed duelId, address indexed player1, address indexed player2, tuple(uint256 id, address player1, address player2, uint256 player1DuelEntry, uint256 player2DuelEntry, address winner, uint256[] player1Heroes, uint256[] player2Heroes, uint256 startBlock, uint8 duelType, uint8 status, tuple(uint256 duelId, uint16 base, uint32 streakBonus, uint16 miscBonus, uint32 diffBonus, uint64 scoreBefore, uint64 scoreAfter) player1ScoreChange) duel)',
];

function parsePvpEvent(log: ethers.Log, block: ethers.Block, realm: string): ParsedPvpEvent | null {
  try {
    const iface = new ethers.Interface(DUEL_COMPLETED_ABI);
    const decoded = iface.parseLog({ topics: log.topics as string[], data: log.data });
    
    if (!decoded) {
      console.warn('[PvpIndexer] Could not decode log');
      return null;
    }
    
    const duelId = decoded.args[0].toString();
    const player1 = decoded.args[1].toLowerCase();
    const player2 = decoded.args[2].toLowerCase();
    const duel = decoded.args[3];
    
    const winner = duel.winner.toLowerCase();
    const duelType = getDuelTypeName(Number(duel.duelType));
    const player1Heroes = duel.player1Heroes.map((h: bigint) => h.toString());
    const player2Heroes = duel.player2Heroes.map((h: bigint) => h.toString());
    
    // Extract score change if available
    let scoreChange = null;
    if (duel.player1ScoreChange) {
      const sc = duel.player1ScoreChange;
      scoreChange = {
        base: Number(sc.base),
        streakBonus: Number(sc.streakBonus),
        scoreBefore: Number(sc.scoreBefore),
        scoreAfter: Number(sc.scoreAfter),
      };
    }
    
    return {
      duelId,
      txHash: log.transactionHash,
      blockNumber: log.blockNumber,
      player1,
      player2,
      winner,
      duelType,
      heroIds: [...player1Heroes, ...player2Heroes],
      matchedAt: new Date(Number(block.timestamp) * 1000),
      scoreChange,
    };
  } catch (err) {
    // Fallback: extract from indexed topics
    try {
      const duelId = log.topics[1] ? BigInt(log.topics[1]).toString() : '0';
      const player1 = log.topics[2] ? '0x' + log.topics[2].slice(26).toLowerCase() : null;
      const player2 = log.topics[3] ? '0x' + log.topics[3].slice(26).toLowerCase() : null;
      
      if (!player1 || !player2) {
        console.warn('[PvpIndexer] Could not extract player addresses');
        return null;
      }
      
      return {
        duelId,
        txHash: log.transactionHash,
        blockNumber: log.blockNumber,
        player1,
        player2,
        winner: player1, // Default to player1, actual winner in data
        duelType: 'UNKNOWN',
        heroIds: [],
        matchedAt: new Date(Number(block.timestamp) * 1000),
        scoreChange: null,
      };
    } catch (fallbackErr) {
      console.error('[PvpIndexer] Failed to parse event:', err);
      return null;
    }
  }
}

async function runPvpIndexerForRealm(realm: 'dfk' | 'klaytn'): Promise<{
  processed: number;
  inserted: number;
  fromBlock: number;
  toBlock: number;
}> {
  const indexerKey = realm === 'dfk' ? INDEXER_KEY_DFK : INDEXER_KEY_KLAYTN;
  const startBlock = realm === 'dfk' 
    ? INDEXER_START_BLOCKS.pvp_dfk 
    : INDEXER_START_BLOCKS.pvp_klaytn;
  const contractAddress = realm === 'dfk'
    ? COMBAT_CONTRACTS.dfk.pvpContract
    : COMBAT_CONTRACTS.klaytn.pvpContract;
  
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
    return { processed: 0, inserted: 0, fromBlock: lastBlock, toBlock: lastBlock };
  }
  
  try {
    // Fetch logs for PvP events
    const logs = await provider.getLogs({
      address: contractAddress,
      topics: [PVP_EVENTS.DuelCompleted],
      fromBlock,
      toBlock,
    });
    
    console.log(`[PvpIndexer] Found ${logs.length} PvP events on ${realm}`);
    
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
      
      const parsed = parsePvpEvent(log, block, realm);
      if (!parsed) continue;
      
      // Insert records for both players
      for (const playerAddress of [parsed.player1, parsed.player2]) {
        const isWinner = playerAddress === parsed.winner;
        const outcome = isWinner ? 'WIN' : 'LOSS';
        
        // Determine if ranked based on duel type
        const isRanked = !['PRIVATE', 'PRACTICE'].includes(parsed.duelType);
        
        // Get cluster key for wallet
        const clusterKey = await getClusterKey(playerAddress);
        
        // Create unique match ID per player
        const matchId = `${parsed.duelId}-${playerAddress}`;
        
        // Insert with conflict handling (idempotent)
        try {
          await db
            .insert(pvpMatches)
            .values({
              walletAddress: playerAddress,
              clusterKey,
              matchId,
              realm,
              isRanked,
              outcome,
              heroDeaths: 0, // Deaths not directly available, could enhance later
              matchedAt: parsed.matchedAt,
              meta: {
                duelId: parsed.duelId,
                opponentWallet: playerAddress === parsed.player1 ? parsed.player2 : parsed.player1,
                duelType: parsed.duelType,
                scoreChange: isWinner && parsed.scoreChange ? parsed.scoreChange : undefined,
              },
            })
            .onConflictDoNothing();
          inserted++;
        } catch (err: any) {
          if (!err.message?.includes('duplicate')) {
            console.error('[PvpIndexer] Insert error:', err);
          }
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
  klaytn: { processed: number; inserted: number; fromBlock: number; toBlock: number };
}> {
  const [dfkResult, klaytnResult] = await Promise.all([
    runPvpIndexerForRealm('dfk'),
    runPvpIndexerForRealm('klaytn'),
  ]);
  
  return {
    dfk: dfkResult,
    klaytn: klaytnResult,
  };
}

export async function getPvpIndexerStatus(): Promise<{
  dfk: { key: string; lastBlock: number; currentBlock: number; blocksRemaining: number; contractConfigured: boolean };
  klaytn: { key: string; lastBlock: number; currentBlock: number; blocksRemaining: number; contractConfigured: boolean };
}> {
  const dfkProvider = getProvider('dfk');
  const klaytnProvider = getProvider('klaytn');
  
  const [dfkCurrent, klaytnCurrent, dfkLast, klaytnLast] = await Promise.all([
    dfkProvider.getBlockNumber(),
    klaytnProvider.getBlockNumber(),
    getLastProcessedBlock(INDEXER_KEY_DFK, INDEXER_START_BLOCKS.pvp_dfk),
    getLastProcessedBlock(INDEXER_KEY_KLAYTN, INDEXER_START_BLOCKS.pvp_klaytn),
  ]);
  
  return {
    dfk: {
      key: INDEXER_KEY_DFK,
      lastBlock: dfkLast,
      currentBlock: dfkCurrent,
      blocksRemaining: Math.max(0, dfkCurrent - dfkLast),
      contractConfigured: COMBAT_CONTRACTS.dfk.pvpContract !== '0x0000000000000000000000000000000000000000',
    },
    klaytn: {
      key: INDEXER_KEY_KLAYTN,
      lastBlock: klaytnLast,
      currentBlock: klaytnCurrent,
      blocksRemaining: Math.max(0, klaytnCurrent - klaytnLast),
      contractConfigured: COMBAT_CONTRACTS.klaytn.pvpContract !== '0x0000000000000000000000000000000000000000',
    },
  };
}
