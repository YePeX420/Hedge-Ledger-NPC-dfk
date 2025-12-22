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
    // Archive RPC using public endpoint (limited historical state but works)
    archiveRpcUrl: 'https://subnets.avax.network/defi-kingdoms/dfk-chain/rpc',
    chainId: 53935,
    // HuntsDiamond - Void Hunts contract on DFK Chain
    huntingContract: '0xEaC69796Cff468ED1694A6FfAc4cbC23bbe33aFa',
    // DFK Duel S6 - PvP combat contract on DFK Chain
    pvpContract: '0xb7F679d69FA55b762F7f48432Da77D096d749540',
    // Hero contract for hero stats lookup (archive RPC needed)
    heroContract: '0xEb9B61B145D6489Be575D3603F4a704810e143dF',
    // Pet contract for pet bonuses
    petContract: '0x1990F87d6BC9D9385917E3EDa0A7674411C3Cd7F',
  },
  klaytn: {
    rpcUrl: 'https://klaytn.drpc.org',
    chainId: 8217,
    // DFK Duel S6 - PvP combat contract on Klaytn (Serendale)
    pvpContract: '0x1207b51994c7A21cC0C78Ad1B12f2A3E203afC85',
  },
  metis: {
    rpcUrl: 'https://andromeda.metis.io/?owner=1088',
    // Ankr archive RPC for historical state queries on Metis
    archiveRpcUrl: 'https://rpc.ankr.com/metis',
    chainId: 1088,
    // PVPDiamond - Combined contract for PvP, Patrols, and Heroes on Metis
    pvpDiamond: '0xc7681698B14a2381d9f1eD69FC3D27F33965b53B',
    // Note: Hero queries on Metis use the PVPDiamond address (Diamond pattern - multiple facets)
    heroContract: '0xc7681698B14a2381d9f1eD69FC3D27F33965b53B',
    // Pet contract on Metis
    petContract: '0x74cE6E7cEF79F5ae6363c6CB1F6c2b528E92D7c7',
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
// event HuntPetBonusReceived(uint256 indexed questId, address indexed player, uint256 heroId, uint256 petId)
export const HUNT_REWARD_EVENTS = {
  HuntRewardMinted: ethers.id('HuntRewardMinted(uint256,address,address,uint256,uint256)'),
  HuntEquipmentMinted: ethers.id('HuntEquipmentMinted(uint256,address,address,uint8,uint16,uint8,uint256)'),
  HuntCompleted: ethers.id('HuntCompleted(uint256,(uint256,uint256,uint256,uint256[],address,uint8,uint256,uint256[],uint256,uint256,(address,uint16,uint16)[]),bool,uint256[])'),
  HuntPetBonusReceived: ethers.id('HuntPetBonusReceived(uint256,address,uint256,uint256)'),
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

// Patrol Trial ID to name mappings (from DFK docs)
export const PATROL_TRIAL_NAMES: Record<number, string> = {
  1: 'Night Raid',
  2: 'Dark Water',
  3: 'Blood Moon Rising',
  4: 'Dark Water',
  5: 'Dark Water',
  6: 'Blood Moon Rising',
  7: 'Blood Moon Rising',
};

export function getPatrolTrialName(trialId: number): string {
  return PATROL_TRIAL_NAMES[trialId] || `Trial ${trialId}`;
}

// Hunt ID to name mappings (from DFK docs)
export const HUNT_NAMES: Record<number, string> = {
  1: 'Mad Boar',
  2: 'Bad Motherclucker',
};

export function getHuntName(huntId: number): string {
  return HUNT_NAMES[huntId] || `Hunt ${huntId}`;
}

// Pet rarity mappings
export const PET_RARITIES: Record<number, string> = {
  0: 'Common',
  1: 'Uncommon',
  2: 'Rare',
  3: 'Legendary',
  4: 'Mythic',
};

// Equipment rarity mappings
export const EQUIPMENT_RARITIES: Record<number, string> = {
  0: 'Common',
  1: 'Uncommon',
  2: 'Rare',
  3: 'Legendary',
  4: 'Mythic',
};

// Minimal ABIs for querying hero and pet data at historical blocks
// HeroCore getHeroV3 - returns full hero data including stats and equipment
export const HERO_CORE_ABI = [
  'function getHeroV3(uint256 _id) view returns (tuple(uint256 id, tuple(uint256 summonedTime, uint256 nextSummonTime, uint256 summonerId, uint256 assistantId, uint32 summons, uint32 maxSummons) summoningInfo, tuple(uint256 statGenes, uint256 visualGenes, uint8 rarity, bool shiny, uint16 generation, uint32 firstName, uint32 lastName, uint8 shinyStyle, uint8 class, uint8 subClass) info, tuple(uint256 staminaFullAt, uint256 hpFullAt, uint256 mpFullAt, uint16 level, uint64 xp, address currentQuest, uint8 sp, uint8 status) state, tuple(uint16 strength, uint16 intelligence, uint16 wisdom, uint16 luck, uint16 agility, uint16 vitality, uint16 endurance, uint16 dexterity, uint16 hp, uint16 mp, uint16 stamina) stats, tuple(uint16 strength, uint16 intelligence, uint16 wisdom, uint16 luck, uint16 agility, uint16 vitality, uint16 endurance, uint16 dexterity, uint16 hpSm, uint16 hpRg, uint16 hpLg, uint16 mpSm, uint16 mpRg, uint16 mpLg) primaryStatGrowth, tuple(uint16 strength, uint16 intelligence, uint16 wisdom, uint16 luck, uint16 agility, uint16 vitality, uint16 endurance, uint16 dexterity, uint16 hpSm, uint16 hpRg, uint16 hpLg, uint16 mpSm, uint16 mpRg, uint16 mpLg) secondaryStatGrowth, tuple(uint16 mining, uint16 gardening, uint16 foraging, uint16 fishing, uint16 craft1, uint16 craft2) professions, tuple(uint256 equippedSlots, uint256 petId, uint128 weapon1Id, uint128 weapon1VisageId, uint128 weapon2Id, uint128 weapon2VisageId, uint128 offhand1Id, uint128 offhand1VisageId, uint128 offhand2Id, uint128 offhand2VisageId, uint128 armorId, uint128 armorVisageId, uint128 accessoryId, uint128 accessoryVisageId) equipment))',
];

// PetCore getPetV2 - returns full pet data including bonuses
export const PET_CORE_ABI = [
  'function getPetV2(uint256 _id) view returns (tuple(uint256 id, uint8 originId, string name, uint8 season, uint8 eggType, uint8 rarity, uint8 element, uint8 bonusCount, uint8 profBonus, uint8 profBonusScalar, uint8 craftBonus, uint8 craftBonusScalar, uint8 combatBonus, uint8 combatBonusScalar, uint16 appearance, uint8 background, uint8 shiny, uint64 hungryAt, uint64 equippableAt, uint256 equippedTo, address fedBy, uint8 foodType))',
  'function getPetsV2(uint256[] _ids) view returns (tuple(uint256 id, uint8 originId, string name, uint8 season, uint8 eggType, uint8 rarity, uint8 element, uint8 bonusCount, uint8 profBonus, uint8 profBonusScalar, uint8 craftBonus, uint8 craftBonusScalar, uint8 combatBonus, uint8 combatBonusScalar, uint16 appearance, uint8 background, uint8 shiny, uint64 hungryAt, uint64 equippableAt, uint256 equippedTo, address fedBy, uint8 foodType)[])',
];

// HuntsDiamond getHunt - returns hunt data with hero IDs
export const HUNTS_DIAMOND_ABI = [
  'function getHunt(uint256 _huntId) view returns (tuple(uint256 id, uint256 huntDataId, uint256 startBlock, uint256[] heroIds, address player, uint8 status, uint256 resultSubmittedTimestamp, uint256[] petXpBonuses, uint256 startAtTime, uint256 retries, tuple(address item, uint16 submittedAmount, uint16 usedAmount)[] consumableItems, uint16[] itemWeights))',
  'event HuntRewardMinted(uint256 indexed huntId, address indexed player, address indexed item, uint256 amount, uint256 data)',
  'event HuntEquipmentMinted(uint256 indexed huntId, address indexed item, address indexed player, uint8 equipmentType, uint16 displayId, uint8 rarity, uint256 nftId)',
  'event HuntCompleted(uint256 huntId, tuple(uint256 id, uint256 huntDataId, uint256 startBlock, uint256[] heroIds, address player, uint8 status, uint256 resultSubmittedTimestamp, uint256[] petXpBonuses, uint256 startAtTime, uint256 retries, tuple(address item, uint16 submittedAmount, uint16 usedAmount)[] consumableItems) hunt, bool huntWon, uint256[] heroIds)',
  'event HuntPetBonusReceived(uint256 indexed questId, address indexed player, uint256 heroId, uint256 petId)',
];

// PVPDiamond getPatrol - returns patrol data with hero IDs
export const PVP_DIAMOND_ABI = [
  'function getPatrol(uint256 _patrolId) view returns (tuple(uint256 patrolId, tuple(address player, uint256 trialId, uint256 stage, uint256 blockNumber, uint8 status, bool patrolWon, uint256 fightsCompleted) patrol, uint256[3] heroIds, uint256 potions))',
  'event PatrolRewardMinted(uint256 indexed patrolId, address indexed player, address indexed item, uint256 amount, uint256 data)',
  'event PatrolEquipmentMinted(uint256 indexed huntId, address indexed item, address indexed player, uint256 equipmentType, uint256 displayId, uint256 rarity, uint256 nftId)',
  'event PatrolCompleted(uint256 indexed patrolId, address indexed player, uint256 fightsCompleted, bool patrolWon)',
];
