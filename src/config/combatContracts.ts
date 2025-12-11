// src/config/combatContracts.ts
// Contract addresses and ABIs for Hunting and PvP event indexing
// 
// Sources:
// - Void Hunts: https://devs.defikingdoms.com/contracts/void-hunts
// - DFK Duel: https://devs.defikingdoms.com/contracts/dfk-duel

import { ethers } from 'ethers';

export const COMBAT_CONTRACTS = {
  dfk: {
    rpcUrl: 'https://subnets.avax.network/defi-kingdoms/dfk-chain/rpc',
    chainId: 53935,
    // HuntsDiamond - Void Hunts contract on DFK Chain
    huntingContract: '0xEaC69796Cff468ED1694A6FfAc4cbC23bbe33aFa',
    // DFK Duel S6 - PvP combat contract on DFK Chain
    pvpContract: '0xb7F679d69FA55b762F7f48432Da77D096d749540',
  },
  klaytn: {
    rpcUrl: 'https://klaytn.drpc.org',
    chainId: 8217,
    // DFK Duel S6 - PvP combat contract on Klaytn (Serendale)
    pvpContract: '0x1207b51994c7A21cC0C78Ad1B12f2A3E203afC85',
  },
};

// Start blocks for limited backfill (recent data only to avoid excessive RPC calls)
// DFK Chain is at ~56M blocks as of Dec 2024, Klaytn is at ~203M blocks
export const INDEXER_START_BLOCKS = {
  hunting_dfk: 56000000,  // Start hunting indexing from recent blocks (approx 1 week ago)
  pvp_dfk: 56000000,      // Start PvP indexing from recent blocks
  pvp_klaytn: 203000000,  // Klaytn recent blocks (approx 1 week ago)
};

// Batch size for log queries (conservative to avoid RPC limits)
export const BLOCKS_PER_QUERY = 2000;

// Hunting event signatures from HuntsDiamond interface
// event HuntCompleted(uint256 huntId, tuple hunt, bool huntWon, uint256[] heroIds)
// The actual event has a complex tuple structure, we compute the signature
export const HUNTING_EVENTS = {
  // HuntCompleted - main event when a hunt finishes
  // Simplified topic for matching
  HuntCompleted: ethers.id('HuntCompleted(uint256,(uint256,uint256,uint256,uint256[],address,uint8,uint256,uint256[],uint256,uint256,(address,uint16,uint16)[]),bool,uint256[])'),
};

// PvP event signatures from DFK Duel S6 interface
// event DuelCompleted(uint256 indexed duelId, address indexed player1, address indexed player2, tuple duel)
export const PVP_EVENTS = {
  // DuelCompleted - main event when a duel finishes
  DuelCompleted: ethers.id('DuelCompleted(uint256,address,address,(uint256,address,address,uint256,uint256,address,uint256[],uint256[],uint256,uint8,uint8,(uint256,uint16,uint32,uint16,uint32,uint64,uint64)))'),
};

// Hunt ID to enemy name mappings (from DFK docs)
export const ENEMY_NAMES: Record<number, string> = {
  1: 'MAD_BOAR',
  2: 'BAD_MOTHERCLUCKER',
};

export function getEnemyName(id: number): string {
  return ENEMY_NAMES[id] || `ENEMY_${id}`;
}

// Duel type mappings
export const DUEL_TYPES: Record<number, string> = {
  0: 'SOLO',      // 1v1
  1: 'SQUAD',     // 3v3
  2: 'WAR',       // 9v9
  3: 'PRIVATE',   // No rewards
  4: 'PRACTICE',  // AI opponent
  5: 'PACK',      // 5v5
};

export function getDuelTypeName(type: number): string {
  return DUEL_TYPES[type] || `TYPE_${type}`;
}
