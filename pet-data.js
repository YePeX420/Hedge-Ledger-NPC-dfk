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

// PetCore ABI (minimal interface) - matches actual PetV2 struct from contract
// Fields: id, originId, name, season, eggType, rarity, element, bonusCount,
//         profBonus, profBonusScalar, craftBonus, craftBonusScalar, 
//         combatBonus, combatBonusScalar, appearance, background, shiny,
//         hungryAt, equippableAt, equippedTo, fedBy, foodType
const petCoreABI = [
  'function getUserPetsV2(address owner) view returns (tuple(uint256 id, uint8 originId, string name, uint8 season, uint8 eggType, uint8 rarity, uint8 element, uint8 bonusCount, uint8 profBonus, uint8 profBonusScalar, uint8 craftBonus, uint8 craftBonusScalar, uint8 combatBonus, uint8 combatBonusScalar, uint16 appearance, uint8 background, uint8 shiny, uint64 hungryAt, uint64 equippableAt, uint256 equippedTo, address fedBy, uint8 foodType)[])',
  'function getPetV2(uint256 petId) view returns (tuple(uint256 id, uint8 originId, string name, uint8 season, uint8 eggType, uint8 rarity, uint8 element, uint8 bonusCount, uint8 profBonus, uint8 profBonusScalar, uint8 craftBonus, uint8 craftBonusScalar, uint8 combatBonus, uint8 combatBonusScalar, uint16 appearance, uint8 background, uint8 shiny, uint64 hungryAt, uint64 equippableAt, uint256 equippedTo, address fedBy, uint8 foodType))',
  'function heroToPet(uint256 heroId) view returns (uint256)'
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
 * Matches PetV2 struct from contract
 */
function parsePetData(petTuple) {
  // equippedTo is uint256 - convert to Number for hero ID matching
  // Note: Hero IDs are small enough to safely use Number()
  const equippedToRaw = petTuple.equippedTo;
  const equippedToNum = Number(equippedToRaw);
  const equippedTo = equippedToNum === 0 ? null : String(equippedToNum);
  
  // hungryAt is unix timestamp - pet is fed if hungryAt > now
  const hungryAtUnix = Number(petTuple.hungryAt);
  const hungryAt = hungryAtUnix > 0 ? new Date(hungryAtUnix * 1000) : null;
  const isFed = hungryAt ? hungryAt > new Date() : false;
  
  // profBonusScalar is uint8 (0-255), divide by 10 for percentage (matching reference impl)
  const profBonusScalar = Number(petTuple.profBonusScalar) / 10;
  
  return {
    id: String(Number(petTuple.id)),
    name: petTuple.name || '',
    season: Number(petTuple.season),
    eggType: Number(petTuple.eggType),
    rarity: Number(petTuple.rarity),
    element: Number(petTuple.element),
    gatheringType: EGG_TYPE_TO_GATHERING[Number(petTuple.eggType)] || 'Unknown',
    gatheringBonus: Number(petTuple.profBonus),
    gatheringBonusScalar: profBonusScalar,
    combatBonus: Number(petTuple.combatBonus),
    combatBonusName: COMBAT_BONUS_NAMES[Number(petTuple.combatBonus)] || 'Unknown',
    combatBonusScalar: Number(petTuple.combatBonusScalar) / 10,
    shiny: Number(petTuple.shiny) === 1,
    equippedTo,
    hungryAt,
    isFed,
    fedBy: petTuple.fedBy || null,
    foodType: Number(petTuple.foodType)
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
    
    // Debug: Log pets with low IDs (old format) and check equippedTo values
    const lowIdPets = pets.filter(p => Number(p.id) < 500000);
    if (lowIdPets.length > 0) {
      console.log(`[PetData] Found ${lowIdPets.length} old-format pets (ID < 500000):`);
      for (const p of lowIdPets.slice(0, 10)) {
        console.log(`[PetData]   Pet #${p.id} -> equippedTo: ${p.equippedTo} (${p.gatheringType})`);
      }
    }
    
    // Debug: Check for specific pet IDs we expect (user reported #196278)
    const targetPetIds = ['196278', '32478', '12008'];
    for (const targetId of targetPetIds) {
      const found = pets.find(p => p.id === targetId);
      if (found) {
        console.log(`[PetData] ✓ Found target pet #${targetId} -> equippedTo: ${found.equippedTo}`);
      } else {
        console.log(`[PetData] ✗ Target pet #${targetId} NOT in fetched list!`);
      }
    }
    
    // Debug: Check specifically for pets that might belong to gardening heroes
    const gardenHeroIds = ['5732', '94066', '272739', '327244', '489266', '56571'];
    const equippedToGarden = pets.filter(p => gardenHeroIds.includes(p.equippedTo));
    console.log(`[PetData] Pets equipped to target gardening heroes: ${equippedToGarden.length}`);
    for (const p of equippedToGarden) {
      console.log(`[PetData]   Pet #${p.id} equipped to Hero #${p.equippedTo}`);
    }
    
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
 * Fetch the pet equipped to a specific hero using heroToPet mapping
 * This is useful as a fallback when getUserPetsV2 doesn't return certain pets
 * @param {number|string} heroId - Hero ID
 * @returns {Promise<Object|null>} Pet object or null if no pet equipped
 */
export async function fetchPetForHero(heroId) {
  try {
    const petId = await petContract.heroToPet(heroId);
    const petIdNum = Number(petId);
    
    if (petIdNum === 0) {
      // No pet equipped to this hero
      return null;
    }
    
    console.log(`[PetData] Hero #${heroId} has pet #${petIdNum} equipped (via heroToPet)`);
    
    // Fetch the full pet data
    const pet = await fetchPetById(petIdNum);
    if (pet) {
      // Override equippedTo to ensure it's set correctly
      pet.equippedTo = String(heroId);
    }
    return pet;
    
  } catch (error) {
    console.error(`[PetData] Error fetching pet for hero #${heroId}:`, error.message);
    return null;
  }
}

/**
 * Fetch pets for multiple heroes using heroToPet mapping (parallel)
 * Used as a fallback for heroes missing from getUserPetsV2 results
 * @param {Array<string|number>} heroIds - Array of hero IDs
 * @returns {Promise<Array>} Array of pet objects (de-duplicated by pet ID)
 */
export async function fetchPetsForHeroes(heroIds) {
  // Fetch all pets in parallel
  const promises = heroIds.map(async (heroId) => {
    try {
      return await fetchPetForHero(heroId);
    } catch (error) {
      console.error(`[PetData] Error fetching pet for hero #${heroId}:`, error.message);
      return null;
    }
  });
  
  const results = await Promise.all(promises);
  
  // Filter nulls and de-duplicate by pet ID
  const seenPetIds = new Set();
  const uniquePets = [];
  for (const pet of results) {
    if (pet && !seenPetIds.has(pet.id)) {
      seenPetIds.add(pet.id);
      uniquePets.push(pet);
    }
  }
  
  return uniquePets;
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
 * Uses heroToPet fallback for heroes missing from getUserPetsV2 results
 * @param {Array} heroes - Array of hero objects
 * @param {Array} allPets - All pets from wallet
 * @param {Object} options - Options for pet annotation
 * @param {boolean} options.gravityFeederActive - If true, treat all pets as fed (for expeditions)
 * @param {Array<string>} options.targetHeroIds - Optional list of hero IDs to prioritize for pet fallback lookup
 * @returns {Promise<Array>} Heroes with heroMeta.petId and heroMeta.petGardenBonus set
 */
export async function annotateHeroesWithPets(heroes, allPets, options = {}) {
  const { gravityFeederActive = false, targetHeroIds = [] } = options;
  
  if (!heroes) return [];
  
  // Create a mutable copy of pets array that we can add to
  const petsWithFallback = [...(allPets || [])];
  
  if (!allPets || allPets.length === 0) {
    console.log(`[PetData] No pets from getUserPetsV2 (${allPets?.length || 0} pets for ${heroes.length} heroes)`);
  }
  
  // Log equipped pets for debugging
  const equippedPets = petsWithFallback.filter(p => p.equippedTo);
  const fedPets = equippedPets.filter(p => p.isFed || gravityFeederActive);
  console.log(`[PetData] Found ${equippedPets.length} equipped pets out of ${petsWithFallback.length} total`);
  console.log(`[PetData] Fed pets: ${fedPets.length} (gravityFeederActive=${gravityFeederActive})`);
  
  for (const pet of equippedPets.slice(0, 10)) { // Log first 10 to avoid spam
    const fedStatus = pet.isFed ? 'fed' : (gravityFeederActive ? 'fed(GF)' : 'hungry');
    console.log(`[PetData] Pet #${pet.id} -> Hero #${pet.equippedTo}: ${pet.gatheringType} (+${pet.gatheringBonusScalar}%) [${fedStatus}]`);
  }
  if (equippedPets.length > 10) {
    console.log(`[PetData] ... and ${equippedPets.length - 10} more equipped pets`);
  }
  
  // Find heroes that don't have pets in the fetched list and need fallback lookup
  // Priority: check targetHeroIds first (e.g., gardening heroes)
  const heroIdsToCheck = targetHeroIds.length > 0 
    ? targetHeroIds 
    : heroes.map(h => String((h.hero || h).normalizedId || (h.hero || h).id));
  
  const heroesWithoutPets = heroIdsToCheck.filter(heroId => 
    !petsWithFallback.some(p => p.equippedTo === heroId)
  );
  
  if (heroesWithoutPets.length > 0) {
    console.log(`[PetData] Using heroToPet fallback for ${heroesWithoutPets.length} heroes without pets in getUserPetsV2 results`);
    
    // Fetch pets via heroToPet fallback (in parallel for speed)
    const fallbackPromises = heroesWithoutPets.map(async (heroId) => {
      try {
        const pet = await fetchPetForHero(heroId);
        return pet;
      } catch (error) {
        console.error(`[PetData] Fallback error for hero #${heroId}:`, error.message);
        return null;
      }
    });
    
    const fallbackPets = await Promise.all(fallbackPromises);
    const foundPets = fallbackPets.filter(p => p !== null);
    
    if (foundPets.length > 0) {
      console.log(`[PetData] ✓ Found ${foundPets.length} pets via heroToPet fallback:`);
      
      // Build set of existing pet IDs for de-duplication
      const existingPetIds = new Set(petsWithFallback.map(p => p.id));
      
      for (const pet of foundPets) {
        // Only add if not already in the list (de-duplicate by pet ID)
        if (!existingPetIds.has(pet.id)) {
          console.log(`[PetData]   Pet #${pet.id} -> Hero #${pet.equippedTo}: ${pet.gatheringType} (+${pet.gatheringBonusScalar}%)`);
          petsWithFallback.push(pet);
          existingPetIds.add(pet.id);
        } else {
          console.log(`[PetData]   Pet #${pet.id} already in list (skipping duplicate)`);
        }
      }
    }
  }
  
  return heroes.map(h => {
    const hero = h.hero || h;
    const heroId = String(hero.normalizedId || hero.id);
    const pet = getPetForHero(heroId, petsWithFallback);
    
    // Calculate garden bonus - pet must be fed (naturally or via Gravity Feeder) to provide bonus
    const petIsFed = pet ? (pet.isFed || gravityFeederActive) : false;
    const gardenBonus = petIsFed ? calculatePetGardenBonus(pet) : calculatePetGardenBonus(null);
    
    if (pet) {
      const bonusStr = petIsFed ? `${gardenBonus.questBonusPct}%` : '0% (hungry)';
      console.log(`[PetData] Annotating Hero #${heroId} with Pet #${pet.id} (${bonusStr} bonus)`);
    }
    
    return {
      ...h,
      hero: h.hero || hero,
      heroMeta: {
        ...(h.heroMeta || {}),
        petId: pet?.id || null,
        pet: pet || null,
        petIsFed,
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
