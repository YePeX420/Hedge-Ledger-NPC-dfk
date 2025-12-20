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
    // Hero contract for hero stats lookup (archive RPC needed)
    heroContract: '0xEb9B61B145D6489Be575D3603F4a704810e143dF',
  },
  klaytn: {
    rpcUrl: 'https://klaytn.drpc.org',
    chainId: 8217,
    // DFK Duel S6 - PvP combat contract on Klaytn (Serendale)
    pvpContract: '0x1207b51994c7A21cC0C78Ad1B12f2A3E203afC85',
  },
  metis: {
    rpcUrl: 'https://andromeda.metis.io/?owner=1088',
    chainId: 1088,
    // PVPDiamond - Combined contract for PvP, Patrols, and Heroes on Metis
    pvpDiamond: '0xc7681698B14a2381d9f1eD69FC3D27F33965b53B',
  },
};

// Start blocks for limited backfill (recent data only to avoid excessive RPC calls)
// DFK Chain is at ~56M blocks as of Dec 2024, Klaytn is at ~203M blocks, Metis is at ~19M blocks
export const INDEXER_START_BLOCKS = {
  hunting_dfk: 56000000,  // Start hunting indexing from recent blocks (approx 1 week ago)
  pvp_dfk: 56000000,      // Start PvP indexing from recent blocks
  pvp_klaytn: 203000000,  // Klaytn recent blocks (approx 1 week ago)
  hunts_patrol_dfk: 50000000,   // Hunt rewards on DFK Chain (backfill from further back for more data)
  hunts_patrol_metis: 18000000, // Patrol rewards on Metis (backfill from further back)
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

// Hunt reward event signatures from HuntsDiamond on DFK Chain
// event HuntRewardMinted(uint256 indexed huntId, address indexed player, address indexed item, uint256 amount, uint256 data)
// event HuntEquipmentMinted(uint256 indexed huntId, address indexed item, address indexed player, uint8 equipmentType, uint16 displayId, uint8 rarity, uint256 nftId)
// event HuntCompleted(uint256 huntId, HuntEvent hunt, bool huntWon, uint256[] heroIds)
export const HUNT_REWARD_EVENTS = {
  HuntRewardMinted: ethers.id('HuntRewardMinted(uint256,address,address,uint256,uint256)'),
  HuntEquipmentMinted: ethers.id('HuntEquipmentMinted(uint256,address,address,uint8,uint16,uint8,uint256)'),
  HuntCompleted: ethers.id('HuntCompleted(uint256,(uint256,uint256,uint256,uint256[],address,uint8,uint256,uint256[],uint256,uint256,(address,uint16,uint16)[]),bool,uint256[])'),
};

// Patrol reward event signatures from PVPDiamond on Metis
// event PatrolRewardMinted(uint256 indexed patrolId, address indexed player, address indexed item, uint256 amount, uint256 data)
// event PatrolEquipmentMinted(uint256 indexed huntId, address indexed item, address indexed player, uint256 equipmentType, uint256 displayId, uint256 rarity, uint256 nftId)
// event PatrolCompleted(uint256 indexed patrolId, address indexed player, uint256 fightsCompleted, bool patrolWon)
export const PATROL_REWARD_EVENTS = {
  PatrolRewardMinted: ethers.id('PatrolRewardMinted(uint256,address,address,uint256,uint256)'),
  PatrolEquipmentMinted: ethers.id('PatrolEquipmentMinted(uint256,address,address,uint256,uint256,uint256,uint256)'),
  PatrolCompleted: ethers.id('PatrolCompleted(uint256,address,uint256,bool)'),
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
