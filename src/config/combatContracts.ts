// src/config/combatContracts.ts
// Contract addresses and ABIs for Hunting and PvP event indexing
// These are placeholder values - update with actual DFK contract addresses

export const COMBAT_CONTRACTS = {
  dfk: {
    rpcUrl: 'https://subnets.avax.network/defi-kingdoms/dfk-chain/rpc',
    chainId: 53935,
    // Hunting contract - placeholder, update with actual address
    huntingContract: '0x0000000000000000000000000000000000000000',
    // PvP/Arena contract - placeholder, update with actual address
    pvpContract: '0x0000000000000000000000000000000000000000',
  },
  metis: {
    rpcUrl: 'https://andromeda.metis.io/?owner=1088',
    chainId: 1088,
    // METIS PvP contract - placeholder
    pvpContract: '0x0000000000000000000000000000000000000000',
  },
};

// Default start blocks for indexers (approximate deployment blocks)
export const INDEXER_START_BLOCKS = {
  hunting_dfk: 0,
  pvp_dfk: 0,
  pvp_metis: 0,
};

// Batch size for log queries (conservative to avoid RPC limits)
export const BLOCKS_PER_QUERY = 2000;

// Hunting event signatures (placeholder - update with actual event names)
// These would be generated via ethers.id('EventName(arg1Type,arg2Type,...)')
export const HUNTING_EVENTS = {
  // Example: HuntCompleted(address indexed player, uint256 enemyId, bool victory, uint256 survivingHeroes)
  HuntCompleted: '0x0000000000000000000000000000000000000000000000000000000000000000',
};

// PvP event signatures (placeholder - update with actual event names)
export const PVP_EVENTS = {
  // Example: MatchResolved(address indexed player1, address indexed player2, uint8 result, uint256 matchId)
  MatchResolved: '0x0000000000000000000000000000000000000000000000000000000000000000',
};

// Enemy ID mappings
export const ENEMY_NAMES: Record<number, string> = {
  1: 'MOTHERCLUCKER',
  2: 'MAD_BOAR',
  3: 'GOBLIN',
  4: 'SKELETON',
  5: 'WOLF',
  // Add more as discovered
};

export function getEnemyName(id: number): string {
  return ENEMY_NAMES[id] || `ENEMY_${id}`;
}
