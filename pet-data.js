/**
 * Pet Data Layer
 * 
 * Fetches pet data from DFK Chain PetCore contract and metadata API.
 * Provides functions to get pet ownership, stats, and hero assignments.
 */

import { ethers } from 'ethers';

// DFK Chain configuration
const DFK_CHAIN_RPC = 'https://subnets.avax.network/defi-kingdoms/dfk-chain/rpc';
const PETCORE_ADDRESS = '0x1990F87d6BC9D9385917E3EDa0A7674411C3Cd7F';
const PET_METADATA_BASE = 'https://pets.defikingdoms.com';

// Initialize provider
const provider = new ethers.JsonRpcProvider(DFK_CHAIN_RPC);

// PetCore ABI (minimal interface)
const petCoreABI = [
  'function getUserPetsV2(address owner) view returns (tuple(uint256 id, uint256 originId, uint256 season, uint8 eggType, uint8 rarity, uint8 element, uint8 bonusCount, uint8 profBonus, uint16 profBonusScalar, uint8 craftBonus, uint16 craftBonusScalar, uint8 combatBonus, uint16 combatBonusScalar, uint8 appearance, uint8 background, uint8 shiny, uint256 statBoost1, uint256 statBoost2, uint256 equippedTo, uint256 hatchedDate, uint256 fedDate, uint256 equippedDate)[])',
  'function getPetV2(uint256 petId) view returns (tuple(uint256 id, uint256 originId, uint256 season, uint8 eggType, uint8 rarity, uint8 element, uint8 bonusCount, uint8 profBonus, uint16 profBonusScalar, uint8 craftBonus, uint16 craftBonusScalar, uint8 combatBonus, uint16 combatBonusScalar, uint8 appearance, uint8 background, uint8 shiny, uint256 statBoost1, uint256 statBoost2, uint256 equippedTo, uint256 hatchedDate, uint256 fedDate, uint256 equippedDate))'
];

const petContract = new ethers.Contract(PETCORE_ADDRESS, petCoreABI, provider);

// Pet egg type to gathering type mapping
const EGG_TYPE_TO_GATHERING = {
  0: 'Fishing',
  1: 'Foraging',
  2: 'Gardening',
  3: 'Mining'
};

// Combat bonus ID to name mapping (from your script)
const COMBAT_BONUS_NAMES = {
  1: 'Unused',
  2: 'Stone Hide',
  3: 'Arcane Shell',
  4: 'Recuperate',
  5: 'Magical Shell',
  6: 'Heavy Hide',
  7: 'Vorpal Soul',
  8: 'Sharpened Claws',
  9: 'Attuned',
  10: 'Hard Head',
  11: 'Harder Head',
  12: 'Graceful',
  13: 'Diamond Hands',
  14: 'Impenetrable',
  15: 'Resilient',
  16: 'Relentless',
  17: 'Outspoken',
  18: 'Lucid',
  19: 'Brave',
  20: 'Confident'
};

/**
 * Parse raw pet tuple into friendly object
 */
function parsePetData(petTuple) {
  return {
    id: petTuple.id.toString(),
    season: Number(petTuple.season),
    eggType: Number(petTuple.eggType),
    rarity: Number(petTuple.rarity),
    element: Number(petTuple.element),
    gatheringType: EGG_TYPE_TO_GATHERING[Number(petTuple.eggType)] || 'Unknown',
    gatheringBonus: Number(petTuple.profBonus),
    gatheringBonusScalar: Number(petTuple.profBonusScalar) / 100, // Convert to percentage
    combatBonus: Number(petTuple.combatBonus),
    combatBonusName: COMBAT_BONUS_NAMES[Number(petTuple.combatBonus)] || 'Unknown',
    combatBonusScalar: Number(petTuple.combatBonusScalar) / 100, // Convert to percentage
    shiny: Number(petTuple.shiny) === 1,
    equippedTo: petTuple.equippedTo.toString() === '0' ? null : petTuple.equippedTo.toString(),
    hatchedDate: Number(petTuple.hatchedDate),
    equippedDate: Number(petTuple.equippedDate)
  };
}

/**
 * Fetch all pets owned by a wallet address
 * @param {string} walletAddress - Ethereum wallet address
 * @returns {Promise<Array>} Array of pet objects
 */
export async function fetchPetsForWallet(walletAddress) {
  try {
    console.log(`[PetData] Fetching pets for wallet ${walletAddress}...`);
    
    const petTuples = await petContract.getUserPetsV2(walletAddress);
    const pets = petTuples.map(parsePetData);
    
    console.log(`[PetData] Found ${pets.length} pets for wallet ${walletAddress}`);
    return pets;
    
  } catch (error) {
    console.error(`[PetData] Error fetching pets for wallet ${walletAddress}:`, error.message);
    return [];
  }
}

/**
 * Fetch a single pet by ID
 * @param {number|string} petId - Pet ID
 * @returns {Promise<Object|null>} Pet object or null
 */
export async function fetchPetById(petId) {
  try {
    console.log(`[PetData] Fetching pet #${petId}...`);
    
    const petTuple = await petContract.getPetV2(petId);
    const pet = parsePetData(petTuple);
    
    console.log(`[PetData] Fetched pet #${petId}: ${pet.gatheringType} pet, ${pet.gatheringBonusScalar}% bonus`);
    return pet;
    
  } catch (error) {
    console.error(`[PetData] Error fetching pet #${petId}:`, error.message);
    return null;
  }
}

/**
 * Fetch pet metadata (name, image, detailed attributes) from API
 * @param {number|string} petId - Pet ID
 * @returns {Promise<Object|null>} Metadata object or null
 */
export async function fetchPetMetadata(petId) {
  try {
    const url = `${PET_METADATA_BASE}/token/${petId}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      console.warn(`[PetData] Metadata not found for pet #${petId}`);
      return null;
    }
    
    const data = await response.json();
    const attributes = data.attributes || [];
    
    // Extract key attributes
    const getAttribute = (traitType) => {
      const attr = attributes.find(a => 
        a.trait_type.toLowerCase() === traitType.toLowerCase()
      );
      return attr ? attr.value : null;
    };
    
    return {
      name: data.name || `Pet #${petId}`,
      description: data.description || '',
      image: data.image || '',
      eggType: getAttribute('Egg Type'),
      rarity: getAttribute('Rarity'),
      element: getAttribute('Element'),
      gatheringBonusName: getAttribute('Gathering Bonus') || getAttribute('Profession Bonus'),
      combatBonusName: getAttribute('Combat Bonus'),
      shiny: getAttribute('Shiny') === 'true',
      season: getAttribute('Season')
    };
    
  } catch (error) {
    console.error(`[PetData] Error fetching metadata for pet #${petId}:`, error.message);
    return null;
  }
}

/**
 * Get pets equipped to specific heroes
 * @param {Array<string>} heroIds - Array of hero IDs
 * @param {Array<Object>} allPets - All pets from wallet
 * @returns {Map<string, Object>} Map of heroId -> pet object
 */
export function mapPetsToHeroes(heroIds, allPets) {
  const heroToPet = new Map();
  
  for (const pet of allPets) {
    if (pet.equippedTo && heroIds.includes(pet.equippedTo)) {
      heroToPet.set(pet.equippedTo, pet);
    }
  }
  
  return heroToPet;
}

/**
 * Get gardening-specific pets (best for emission-dominant pools)
 * @param {Array<Object>} pets - Array of pet objects
 * @returns {Array<Object>} Filtered gardening pets sorted by bonus
 */
export function getGardeningPets(pets) {
  return pets
    .filter(p => p.gatheringType === 'Gardening')
    .sort((a, b) => b.gatheringBonusScalar - a.gatheringBonusScalar);
}

/**
 * Get trading/fishing pets (best for fee-dominant pools)
 * @param {Array<Object>} pets - Array of pet objects
 * @returns {Array<Object>} Filtered trading/fishing pets sorted by bonus
 */
export function getTradingPets(pets) {
  return pets
    .filter(p => p.gatheringType === 'Fishing') // Fishing pets boost trading
    .sort((a, b) => b.gatheringBonusScalar - a.gatheringBonusScalar);
}

/**
 * Format pet summary for display
 * @param {Object} pet - Pet object
 * @returns {string} Formatted string
 */
export function formatPetSummary(pet) {
  if (!pet) return 'No pet';
  
  const shinyIcon = pet.shiny ? '✨' : '';
  const bonusStr = pet.gatheringBonusScalar > 0 
    ? `+${pet.gatheringBonusScalar}% ${pet.gatheringType}` 
    : '';
  
  return `Pet #${pet.id} ${shinyIcon}(${bonusStr})`;
}

/**
 * Calculate garden-specific bonuses from a pet
 * 
 * Gardening pets (eggType 2) provide:
 * - Gathering bonus that increases quest rewards
 * 
 * @param {Object} pet - Pet object from parsePetData or fetchPetById
 * @returns {Object} Garden bonus breakdown
 */
export function calculatePetGardenBonus(pet) {
  if (!pet) {
    return {
      questBonusPct: 0,
      staminaReductionPct: 0,
      isGardeningPet: false,
      petId: null,
      description: null
    };
  }
  
  const isGardeningPet = pet.gatheringType === 'Gardening' || pet.eggType === 2;
  
  if (!isGardeningPet) {
    return {
      questBonusPct: 0,
      staminaReductionPct: 0,
      isGardeningPet: false,
      petId: pet.id,
      description: `${pet.gatheringType} pet (no garden bonus)`
    };
  }
  
  const bonusPct = pet.gatheringBonusScalar || 0;
  
  return {
    questBonusPct: bonusPct,
    staminaReductionPct: 0,
    isGardeningPet: true,
    petId: pet.id,
    description: `+${bonusPct}% gardening quest rewards`
  };
}

/**
 * Get pet equipped to a specific hero from the pets array
 * @param {number|string} heroId - Hero ID
 * @param {Array} allPets - All pets from wallet
 * @returns {Object|null} Pet object or null
 */
export function getPetForHero(heroId, allPets) {
  if (!allPets || !heroId) return null;
  
  const heroIdStr = String(heroId);
  return allPets.find(p => p.equippedTo === heroIdStr) || null;
}

/**
 * Build hero-to-pet mapping with garden bonuses
 * @param {Array} heroes - Array of hero objects  
 * @param {Array} allPets - All pets from wallet
 * @returns {Map<string, Object>} Map of heroId -> { pet, gardenBonus }
 */
export function buildHeroPetBonusMap(heroes, allPets) {
  const map = new Map();
  
  if (!heroes || !allPets) return map;
  
  for (const h of heroes) {
    const hero = h.hero || h;
    const heroId = String(hero.normalizedId || hero.id);
    const pet = getPetForHero(heroId, allPets);
    const gardenBonus = calculatePetGardenBonus(pet);
    
    map.set(heroId, {
      pet,
      gardenBonus,
      petId: pet?.id || null,
      questBonusPct: gardenBonus.questBonusPct
    });
  }
  
  return map;
}

/**
 * Annotate heroes array with pet data and garden bonuses
 * @param {Array} heroes - Array of hero objects
 * @param {Array} allPets - All pets from wallet
 * @returns {Array} Heroes with heroMeta.petId and heroMeta.petGardenBonus set
 */
export function annotateHeroesWithPets(heroes, allPets) {
  if (!heroes) return [];
  if (!allPets || allPets.length === 0) return heroes;
  
  return heroes.map(h => {
    const hero = h.hero || h;
    const heroId = String(hero.normalizedId || hero.id);
    const pet = getPetForHero(heroId, allPets);
    const gardenBonus = calculatePetGardenBonus(pet);
    
    return {
      ...h,
      hero: h.hero || hero,
      heroMeta: {
        ...(h.heroMeta || {}),
        petId: pet?.id || null,
        pet: pet || null,
        petGardenBonus: gardenBonus
      }
    };
  });
}

/**
 * Format pet bonus for DM output
 * @param {Object} pet - Pet object
 * @returns {string} Short formatted string
 */
export function formatPetBonusShort(pet) {
  if (!pet) return '';
  
  const bonus = calculatePetGardenBonus(pet);
  if (!bonus.isGardeningPet || bonus.questBonusPct === 0) {
    return '';
  }
  
  return `+${bonus.questBonusPct}%`;
}
