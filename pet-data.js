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
  'function heroToPet(uint256 heroId) view returns (uint256)',
  'function isPetHungry(uint256 petId) view returns (bool)',
  'function isHeroPetHungry(uint256 heroId) view returns (bool)',
  'function getPetFedState(uint256 petId) view returns (bool)'
];

const petContract = new ethers.Contract(PETCORE_ADDRESS, petCoreABI, provider);

// Pet egg type to gathering type mapping
const EGG_TYPE_TO_GATHERING = {
  0: 'Fishing',
  1: 'Foraging',
  2: 'Gardening',
  3: 'Mining'
};

// Rarity ID to name mapping
const RARITY_NAMES = {
  0: 'Common',
  1: 'Uncommon',
  2: 'Rare',
  3: 'Legendary',
  4: 'Mythic'
};

// Element ID to name mapping
const ELEMENT_NAMES = {
  0: 'Fire',
  1: 'Water',
  2: 'Earth',
  3: 'Wind',
  4: 'Lightning',
  5: 'Ice',
  6: 'Light',
  7: 'Dark'
};

// Season ID to name mapping
const SEASON_NAMES = {
  0: 'Genesis',
  1: 'Season 1',
  2: 'Season 2',
  3: 'Season 3',
  4: 'Season 4'
};

// Variant names based on appearance ranges
const VARIANT_NAMES = {
  0: 'Normal',
  1: 'Normal',
  2: 'Shiny'
};

// Gathering skill names by egg type and bonus ID
// Format: { eggType: { bonusId: 'Skill Name' } }
const GATHERING_SKILL_NAMES = {
  0: { // Fishing (Blue Egg)
    1: 'Unrevealed', 2: 'Efficient Angler', 3: 'Bountiful Catch', 4: 'Keen Eye',
    5: 'Fortune Seeker', 6: 'Clutch Collector', 7: 'Runic Discoveries',
    8: 'Skilled Angler', 9: 'Astute Angler', 10: 'Bonus Bounty', 11: "Gaia's Chosen",
    80: 'Unrevealed', 81: 'Efficient Angler', 82: 'Bountiful Catch', 83: 'Keen Eye',
    84: 'Fortune Seeker', 85: 'Clutch Collector', 86: 'Runic Discoveries',
    87: 'Skilled Angler', 88: 'Astute Angler', 89: 'Bonus Bounty', 90: "Gaia's Chosen",
    160: 'Unrevealed', 161: 'Efficient Angler', 162: 'Bountiful Catch', 163: 'Keen Eye',
    164: 'Fortune Seeker', 165: 'Clutch Collector', 166: 'Runic Discoveries',
    167: 'Skilled Angler', 168: 'Astute Angler', 169: 'Bonus Bounty', 170: "Gaia's Chosen",
    171: 'Innate Angler'
  },
  1: { // Foraging (Grey Egg)
    1: 'Unrevealed', 2: 'Efficient Scavenger', 3: 'Bountiful Haul', 4: 'Keen Eye',
    5: 'Fortune Seeker', 6: 'Clutch Collector', 7: 'Runic Discoveries',
    8: 'Skilled Scavenger', 9: 'Astute Scavenger', 10: 'Bonus Bounty', 11: "Gaia's Chosen",
    80: 'Unrevealed', 81: 'Efficient Scavenger', 82: 'Bountiful Haul', 83: 'Keen Eye',
    84: 'Fortune Seeker', 85: 'Clutch Collector', 86: 'Runic Discoveries',
    87: 'Skilled Scavenger', 88: 'Astute Scavenger', 89: 'Bonus Bounty', 90: "Gaia's Chosen",
    160: 'Unrevealed', 161: 'Efficient Scavenger', 162: 'Bountiful Haul', 163: 'Keen Eye',
    164: 'Fortune Seeker', 165: 'Clutch Collector', 166: 'Runic Discoveries',
    167: 'Skilled Scavenger', 168: 'Astute Scavenger', 169: 'Bonus Bounty', 170: "Gaia's Chosen",
    171: 'Innate Scavenger'
  },
  2: { // Gardening (Green Egg)
    1: 'Unrevealed', 2: 'Efficient Greenskeeper', 3: 'Bountiful Harvest', 4: 'Second Chance',
    5: 'Clutch Collector', 6: 'Runic Discoveries', 7: 'Skilled Greenskeeper',
    8: 'Astute Greenskeeper', 9: 'Bonus Bounty', 10: "Gaia's Chosen",
    80: 'Unrevealed', 81: 'Efficient Greenskeeper', 82: 'Bountiful Harvest', 83: 'Second Chance',
    84: 'Clutch Collector', 85: 'Runic Discoveries', 86: 'Skilled Greenskeeper',
    87: 'Astute Greenskeeper', 88: 'Bonus Bounty', 89: "Gaia's Chosen", 90: 'Power Surge',
    160: 'Unrevealed', 161: 'Efficient Greenskeeper', 162: 'Bountiful Harvest', 163: 'Second Chance',
    164: 'Clutch Collector', 165: 'Runic Discoveries', 166: 'Skilled Greenskeeper',
    167: 'Astute Greenskeeper', 168: 'Bonus Bounty', 169: "Gaia's Chosen", 170: 'Power Surge',
    171: 'Innate Greenskeeper'
  }
};

// Gathering skill description templates by skill name
// {bonus} is replaced with the actual bonus percentage
// Format follows DFK official: "[Skill Name]: {bonus}% gathering effect"
const GATHERING_SKILL_DESCRIPTIONS = {
  'Fortune Seeker': 'Fortune Seeker: {bonus}% gathering effect',
  'Clutch Collector': 'Clutch Collector: {bonus}% gathering effect',
  'Bountiful Catch': 'Bountiful Catch: {bonus}% gathering effect',
  'Skilled Angler': 'Skilled Angler: {bonus}% gathering effect',
  'Keen Eye': 'Keen Eye: {bonus}% gathering effect',
  'Power Surge': 'Increase Power Token or JEWEL rewards from gardening by {bonus}%',
  'Astute Angler': 'Astute Angler: {bonus}% gathering effect',
  'Efficient Scavenger': 'Efficient Scavenger: {bonus}% gathering effect',
  'Runic Discoveries': 'Runic Discoveries: {bonus}% gathering effect',
  'Bonus Bounty': 'Bonus Bounty: {bonus}% gathering effect',
  "Gaia's Chosen": "Gaia's Chosen: {bonus}% gathering effect",
  'Efficient Angler': 'Efficient Angler: {bonus}% gathering effect',
  'Bountiful Haul': 'Bountiful Haul: {bonus}% gathering effect',
  'Innate Angler': 'Innate Angler: {bonus}% gathering effect',
  'Astute Scavenger': 'Astute Scavenger: {bonus}% gathering effect',
  'Skilled Scavenger': 'Skilled Scavenger: {bonus}% gathering effect',
  'Bountiful Harvest': 'Bountiful Harvest: {bonus}% gathering effect',
  'Efficient Greenskeeper': 'Efficient Greenskeeper: {bonus}% gathering effect',
  'Skilled Greenskeeper': 'Skilled Greenskeeper: {bonus}% gathering effect',
  'Astute Greenskeeper': 'Astute Greenskeeper: {bonus}% gathering effect',
  'Innate Scavenger': 'Innate Scavenger: {bonus}% gathering effect',
  'Innate Greenskeeper': 'Innate Greenskeeper: {bonus}% gathering effect',
  'Second Chance': 'Second Chance: {bonus}% gathering effect',
  'Unrevealed': 'Skill not yet revealed'
};

// Combat skill base names (IDs repeat at +79 for Rare and +159 for Mythic tiers)
// Common tier: 1-24, Rare tier adds: 25-59 (at offset 80), Mythic tier adds: more skills (at offset 160)
const COMBAT_SKILL_BASE_NAMES = {
  0: 'None',
  1: '[Unused]',
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
  20: 'Confident',
  21: 'Inner Lids',
  22: 'Insulated',
  23: 'Moist',
  24: 'Studious',
  // Rare tier additional skills (base IDs 25-59, appear at offset 80)
  25: 'Slippery',
  26: 'Blur',
  27: 'Divine Intervention',
  28: 'Rune Sniffer',
  29: 'Threaten',
  30: 'Hobble',
  31: 'Shock',
  32: 'Bop',
  33: 'Hush',
  34: 'Befuddle',
  35: 'Petrify',
  36: 'Tug',
  37: 'Gash',
  38: 'Infect',
  39: 'Gouge',
  40: 'Bruise',
  41: 'Expose',
  42: 'Flash',
  43: 'Mystify',
  44: 'Freeze',
  45: 'Char',
  46: 'Good Eye',
  47: 'Third Eye',
  48: 'Omni Shell',
  49: 'Hardy Constitution',
  50: 'Vampiric',
  51: 'Meat Shield',
  52: 'Super Meat Shield',
  53: 'Flow State',
  54: 'Cleansing Aura',
  55: 'Lick Wounds',
  56: 'Rescuer',
  57: 'Amplify',
  58: 'Intercept',
  59: 'Conservative'
};

// Get combat skill name handling rarity tier offsets
// Common: 0-79, Rare: 80-159 (base+79), Mythic: 160+ (base+159)
function getCombatSkillName(rawId) {
  if (rawId >= 160) {
    const baseId = rawId - 159;
    return COMBAT_SKILL_BASE_NAMES[baseId] || `Unknown (${rawId})`;
  } else if (rawId >= 80) {
    const baseId = rawId - 79;
    return COMBAT_SKILL_BASE_NAMES[baseId] || `Unknown (${rawId})`;
  }
  return COMBAT_SKILL_BASE_NAMES[rawId] || `Unknown (${rawId})`;
}

// Legacy alias for backwards compatibility
const COMBAT_SKILL_NAMES = COMBAT_SKILL_BASE_NAMES;

// Combat skill description templates
// Format: Skill description with {bonus}% replaced by actual percentage
const COMBAT_SKILL_DESCRIPTIONS = {
  // Common tier (1-24)
  '[Unused]': 'Unused skill slot',
  'Stone Hide': 'Increase Physical Block by +{bonus}%',
  'Arcane Shell': 'Increase Spell Block by +{bonus}%',
  'Recuperate': 'Restore {bonus}% HP at end of each turn',
  'Magical Shell': 'Reduce magic damage taken by {bonus}%',
  'Heavy Hide': 'Reduce physical damage taken by {bonus}%',
  'Vorpal Soul': 'Increase critical hit damage by {bonus}%',
  'Sharpened Claws': 'Increase physical attack by {bonus}%',
  'Attuned': 'Increase magic attack by {bonus}%',
  'Hard Head': 'Reduce stun duration by {bonus}%',
  'Harder Head': 'Immune to stun {bonus}% of the time',
  'Graceful': 'Increase evasion by {bonus}%',
  'Diamond Hands': 'Reduce fumble chance by {bonus}%',
  'Impenetrable': 'Reduce critical hits received by {bonus}%',
  'Resilient': 'Reduce debuff duration by {bonus}%',
  'Relentless': 'Increase attack speed by {bonus}%',
  'Outspoken': 'Increase taunt effectiveness by {bonus}%',
  'Lucid': 'Reduce confusion duration by {bonus}%',
  'Brave': 'Reduce fear effects by {bonus}%',
  'Confident': 'Increase hit chance by {bonus}%',
  'Inner Lids': 'Reduce blind duration by {bonus}%',
  'Insulated': 'Reduce lightning damage taken by {bonus}%',
  'Moist': 'Reduce fire damage taken by {bonus}%',
  'Studious': 'Increase XP gained by {bonus}%',
  // Rare tier additional skills (25-59)
  'Slippery': 'Chance to avoid status effects by {bonus}%',
  'Blur': 'Increase dodge chance by {bonus}%',
  'Divine Intervention': '{bonus}% chance to survive fatal blow',
  'Rune Sniffer': 'Increase rune discovery by {bonus}%',
  'Threaten': 'Reduce enemy attack by {bonus}%',
  'Hobble': 'Reduce enemy speed by {bonus}%',
  'Shock': '{bonus}% chance to stun on hit',
  'Bop': '{bonus}% chance to daze on hit',
  'Hush': '{bonus}% chance to silence on hit',
  'Befuddle': '{bonus}% chance to confuse on hit',
  'Petrify': '{bonus}% chance to petrify on hit',
  'Tug': '{bonus}% chance to pull target on hit',
  'Gash': '{bonus}% chance to bleed on hit',
  'Infect': '{bonus}% chance to poison on hit',
  'Gouge': '{bonus}% chance to blind on hit',
  'Bruise': '{bonus}% chance to weaken on hit',
  'Expose': '{bonus}% chance to reduce armor on hit',
  'Flash': '{bonus}% chance to flash on hit',
  'Mystify': '{bonus}% chance to mystify on hit',
  'Freeze': '{bonus}% chance to freeze on hit',
  'Char': '{bonus}% chance to burn on hit',
  'Good Eye': 'Increase accuracy by {bonus}%',
  'Third Eye': 'Increase magic accuracy by {bonus}%',
  'Omni Shell': 'Increase all damage resistance by {bonus}%',
  'Hardy Constitution': 'Increase max HP by {bonus}%',
  'Vampiric': 'Heal {bonus}% of damage dealt',
  'Meat Shield': 'Redirect {bonus}% of ally damage to self',
  'Super Meat Shield': 'Redirect {bonus}% of all ally damage to self',
  'Flow State': 'Increase energy regeneration by {bonus}%',
  'Cleansing Aura': '{bonus}% chance to remove debuffs each turn',
  'Lick Wounds': 'Heal {bonus}% HP when below 25% HP',
  'Rescuer': '{bonus}% chance to protect low HP allies',
  'Amplify': 'Increase buff effectiveness by {bonus}%',
  'Intercept': '{bonus}% chance to intercept attacks on allies',
  'Conservative': 'Reduce ability costs by {bonus}%',
  'None': 'No combat skill'
};

// Crafting bonus ID to name mapping
const CRAFT_BONUS_NAMES = {
  0: 'None',
  1: 'Blacksmith',
  2: 'Jeweler',
  3: 'Alchemist',
  4: 'Leatherworker',
  5: 'Tailor',
  6: 'Enchanter',
  7: 'Stone Mason',
  8: 'Woodworker'
};

// Legacy profession bonus names (fallback)
const PROF_BONUS_NAMES = {
  0: 'None', 1: 'Fisher', 2: 'Expert Angler', 3: 'Bait Maker',
  4: 'Net Caster', 5: 'Deep Sea Fisher', 6: 'Forager', 7: 'Expert Forager',
  8: 'Herbalist', 9: 'Tracker', 10: "Nature's Ally", 11: 'Gardener',
  12: 'Expert Gardener', 13: 'Soil Specialist', 14: 'Harvest Master', 15: 'Green Thumb',
  16: 'Miner', 17: 'Expert Miner', 18: 'Gemologist', 19: 'Ore Finder', 20: 'Deep Delver'
};

// Combat bonus ID to name mapping (legacy)
const COMBAT_BONUS_NAMES = COMBAT_SKILL_NAMES;

// Food type ID to name mapping
const FOOD_TYPE_NAMES = {
  0: 'None',
  1: 'Pet Treats',
  2: 'Premium Treats',
  3: 'Gourmet Treats'
};

// Get gathering skill name based on egg type and bonus ID
function getGatheringSkillName(eggType, bonusId) {
  const skills = GATHERING_SKILL_NAMES[eggType];
  if (skills && skills[bonusId]) {
    return skills[bonusId];
  }
  return PROF_BONUS_NAMES[bonusId] || 'Unknown';
}

// Get gathering skill description with bonus value filled in
function getGatheringSkillDescription(skillName, bonusScalar, profession) {
  const template = GATHERING_SKILL_DESCRIPTIONS[skillName];
  if (!template) return null;
  return template
    .replace('{bonus}', bonusScalar.toFixed(0))
    .replace('{profession}', profession?.toLowerCase() || 'questing');
}

// Get combat skill description with bonus value filled in
function getCombatSkillDescription(skillName, bonusScalar) {
  const template = COMBAT_SKILL_DESCRIPTIONS[skillName];
  if (!template) return null;
  return template.replace('{bonus}', bonusScalar.toFixed(0));
}

// Bonus scalar to star rating (for display)
// Based on DFK bonus rarity: 1-79 = Common (1 star), 80-159 = Rare (2 stars), 160+ = Mythic (3 stars)
function getBonusStars(rawScalar) {
  if (rawScalar >= 160) return 3;
  if (rawScalar >= 80) return 2;
  if (rawScalar >= 1) return 1;
  return 0;
}

// Format stars as emoji string
function formatBonusStars(stars) {
  if (stars === 0) return '';
  return '⭐'.repeat(stars);
}

// Legacy bonus rarity function (for backwards compatibility)
function getBonusRarity(scalar) {
  if (scalar >= 8) return 'Mythic';
  if (scalar >= 6) return 'Legendary';
  if (scalar >= 4) return 'Rare';
  if (scalar >= 2) return 'Uncommon';
  if (scalar > 0) return 'Common';
  return 'None';
}

/**
 * Parse raw pet tuple into friendly object with ALL attributes
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
  
  // Calculate time until hungry (for fed display)
  let hungryInHours = null;
  if (hungryAt && isFed) {
    hungryInHours = Math.round((hungryAt.getTime() - Date.now()) / (1000 * 60 * 60) * 10) / 10;
  }
  
  // Bonus IDs encode skill type + rarity tier (0-79 Common, 80-159 Rare, 160+ Mythic)
  // Scalars are uint8 (0-255) and represent the whole percentage bonus directly (NOT divided by 10)
  const profBonusRaw = Number(petTuple.profBonus);
  const profBonusScalar = Number(petTuple.profBonusScalar);  // Already whole percentage (e.g., 44 = 44%)
  const craftBonusRaw = Number(petTuple.craftBonus);
  const craftBonusScalar = Number(petTuple.craftBonusScalar);  // Already whole percentage
  const combatBonusRaw = Number(petTuple.combatBonus);
  const combatBonusScalar = Number(petTuple.combatBonusScalar);  // Already whole percentage (e.g., 2 = 2%)
  
  // Extract raw values
  const rarityRaw = Number(petTuple.rarity);
  const elementRaw = Number(petTuple.element);
  const seasonRaw = Number(petTuple.season);
  const eggTypeRaw = Number(petTuple.eggType);
  const foodTypeRaw = Number(petTuple.foodType);
  const bonusCount = Number(petTuple.bonusCount);
  const originId = Number(petTuple.originId);
  const appearance = Number(petTuple.appearance);
  const background = Number(petTuple.background);
  const shinyRaw = Number(petTuple.shiny);
  
  // Calculate equipped at timestamp
  const equippableAtUnix = Number(petTuple.equippableAt);
  const equippableAt = equippableAtUnix > 0 ? new Date(equippableAtUnix * 1000) : null;
  
  // Get proper skill names and descriptions
  const gatheringSkillName = getGatheringSkillName(eggTypeRaw, profBonusRaw);
  const gatheringType = EGG_TYPE_TO_GATHERING[eggTypeRaw] || 'Unknown';
  const gatheringSkillDesc = getGatheringSkillDescription(gatheringSkillName, profBonusScalar, gatheringType);
  
  // Use tier-aware combat skill name lookup
  const combatSkillName = getCombatSkillName(combatBonusRaw);
  const combatSkillDesc = getCombatSkillDescription(combatSkillName, combatBonusScalar);
  
  // Stars based on bonus IDs which encode rarity tier (0-79=1★, 80-159=2★, 160+=3★)
  // NOT based on scalar values - the IDs encode the tier
  const gatheringStars = getBonusStars(profBonusRaw);
  const combatStars = getBonusStars(combatBonusRaw);
  const craftStars = getBonusStars(craftBonusRaw);
  
  // Variant based on shiny status
  const variant = shinyRaw === 1 ? 'Shiny' : 'Normal';
  
  return {
    // Basic Info
    id: String(Number(petTuple.id)),
    name: petTuple.name || '',
    originId,
    
    // Rarity & Classification
    rarity: rarityRaw,
    rarityName: RARITY_NAMES[rarityRaw] || 'Unknown',
    element: elementRaw,
    elementName: ELEMENT_NAMES[elementRaw] || 'Unknown',
    season: seasonRaw,
    seasonName: SEASON_NAMES[seasonRaw] || 'Unknown',
    eggType: eggTypeRaw,
    bonusCount,
    stars: bonusCount, // Stars shown on pet card = bonusCount
    
    // Visual
    appearance,
    background,
    shiny: shinyRaw === 1,
    variant, // Normal or Shiny
    
    // Gathering (Profession) Stats
    gatheringType,
    profession: gatheringType, // Alias for convenience
    gatheringBonus: profBonusRaw,
    gatheringBonusName: gatheringSkillName,
    gatheringBonusScalar: profBonusScalar,
    gatheringBonusRarity: getBonusRarity(profBonusScalar),
    gatheringSkillName,
    gatheringSkillDescription: gatheringSkillDesc,
    gatheringStars,
    gatheringStarsDisplay: formatBonusStars(gatheringStars),
    
    // Crafting Stats
    craftBonus: craftBonusRaw,
    craftBonusName: CRAFT_BONUS_NAMES[craftBonusRaw] || 'Unknown',
    craftBonusScalar: craftBonusScalar,
    craftBonusRarity: getBonusRarity(craftBonusScalar),
    craftStars,
    craftStarsDisplay: formatBonusStars(craftStars),
    
    // Combat Stats
    combatBonus: combatBonusRaw,
    combatBonusName: combatSkillName,
    combatBonusScalar: combatBonusScalar,
    combatBonusRarity: getBonusRarity(combatBonusScalar),
    combatSkillName,
    combatSkillDescription: combatSkillDesc,
    combatStars,
    combatStarsDisplay: formatBonusStars(combatStars),
    
    // Equipment Status
    equippedTo,
    equippableAt,
    
    // Feeding Status
    hungryAt,
    isFed,
    hungryInHours,
    fedBy: petTuple.fedBy || null,
    foodType: foodTypeRaw,
    foodTypeName: FOOD_TYPE_NAMES[foodTypeRaw] || 'Unknown'
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
