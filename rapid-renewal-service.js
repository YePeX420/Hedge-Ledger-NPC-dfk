/**
 * Rapid Renewal Service
 * 
 * Detects which heroes have Rapid Renewal active via PowerUpManagerDiamond contract.
 * Rapid Renewal reduces stamina regen time by 3 seconds per hero level.
 */

import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DFK_CHAIN_RPC = 'https://subnets.avax.network/defi-kingdoms/dfk-chain/rpc';
// Updated PowerUpManager address from official DFK docs (Nov 2024)
const POWERUP_MANAGER_ADDRESS_RAW = '0xc20a268bc7c4dB28f1f6e1703676513Db06C1B93';

let provider = null;
let checksummedAddress = null;

function getPowerUpManagerAddress() {
  if (!checksummedAddress) {
    checksummedAddress = ethers.getAddress(POWERUP_MANAGER_ADDRESS_RAW);
  }
  return checksummedAddress;
}
let powerUpContract = null;

// Power-up IDs from official DFK docs
const POWERUP_IDS = {
  QUICK_STUDY: 1,
  RAPID_RENEWAL: 2,
  THRIFTY: 3,
  WILD_UNKNOWN: 4,      // Grants access to Expedition system
  GRAVITY_FEEDER: 5,    // Auto-feeds pets during expeditions (300 cJEWEL)
  PERPETUAL_POTION: 6,
  PREMEDITATED: 7,
  UNSCATHED: 8,
  PREMIUM_PROVISIONS: 1001,
  BACKSTAGE_PASS: 2001,
  MASTER_MERCHANT: 3001
};

let rapidRenewalId = POWERUP_IDS.RAPID_RENEWAL;
let gravityFeederId = POWERUP_IDS.GRAVITY_FEEDER;
let wildUnknownId = POWERUP_IDS.WILD_UNKNOWN;
let quickStudyId = POWERUP_IDS.QUICK_STUDY;
let premiumProvisionsId = POWERUP_IDS.PREMIUM_PROVISIONS;

function getProvider() {
  if (!provider) {
    provider = new ethers.JsonRpcProvider(DFK_CHAIN_RPC);
  }
  return provider;
}

function getPowerUpContract() {
  if (!powerUpContract) {
    const abiPath = path.join(__dirname, 'abis', 'PowerUpManagerDiamond.json');
    const abi = JSON.parse(fs.readFileSync(abiPath, 'utf-8'));
    powerUpContract = new ethers.Contract(getPowerUpManagerAddress(), abi, getProvider());
  }
  return powerUpContract;
}

/**
 * Get Rapid Renewal power-up ID (known: 2)
 */
export function getRapidRenewalPowerUpId() {
  return POWERUP_IDS.RAPID_RENEWAL;
}

/**
 * Get Gravity Feeder power-up ID (known: 5)
 */
export function getGravityFeederPowerUpId() {
  return POWERUP_IDS.GRAVITY_FEEDER;
}

/**
 * Get Wild Unknown power-up ID (known: 4)
 * Wild Unknown grants access to the Expedition system
 */
export function getWildUnknownPowerUpId() {
  return POWERUP_IDS.WILD_UNKNOWN;
}

/**
 * Get all hero IDs with Rapid Renewal active for a wallet
 * @param {string} walletAddress - User's wallet address
 * @returns {Promise<Set<number>>} Set of hero IDs with Rapid Renewal
 */
export async function getRapidRenewalHeroIds(walletAddress) {
  try {
    const contract = getPowerUpContract();
    const rrId = await getRapidRenewalPowerUpId();
    
    console.log(`[RapidRenewal] Fetching hero IDs for wallet ${walletAddress.slice(0, 8)}... with power-up ID: ${rrId}`);
    
    const heroIdsBigInt = await contract.getAssignedHeroIds(walletAddress, rrId);
    console.log(`[RapidRenewal] Raw hero IDs returned: ${heroIdsBigInt.length} heroes`);
    
    // Use BigInt for comparison since hero IDs can be large
    const heroIds = new Set(heroIdsBigInt.map(id => {
      const numId = Number(id);
      // Log if there's potential overflow
      if (numId > Number.MAX_SAFE_INTEGER) {
        console.warn(`[RapidRenewal] Hero ID ${id.toString()} may overflow Number`);
      }
      return numId;
    }));
    
    if (heroIds.size > 0) {
      const sampleIds = Array.from(heroIds).slice(0, 5);
      console.log(`[RapidRenewal] Sample hero IDs: ${sampleIds.join(', ')}`);
    }
    
    console.log(`[RapidRenewal] Wallet ${walletAddress.slice(0, 8)}... has ${heroIds.size} heroes with RR`);
    return heroIds;
    
  } catch (error) {
    console.error(`[RapidRenewal] Error fetching RR heroes for ${walletAddress}:`, error.message);
    console.error(`[RapidRenewal] Full error:`, error);
    return new Set();
  }
}

/**
 * Get user's Rapid Renewal subscription status
 * @param {string} walletAddress - User's wallet address
 * @returns {Promise<Object|null>} User power-up data or null
 */
export async function getRapidRenewalStatus(walletAddress) {
  try {
    const contract = getPowerUpContract();
    const rrId = await getRapidRenewalPowerUpId();
    
    const userData = await contract.getUserPowerUp(walletAddress, rrId);
    
    return {
      isActivated: userData.isActivated,
      tier: Number(userData.tier),
      openHeroSlots: Number(userData.openHeroSlots),
      totalSlots: Number(userData.tier) * 3,
      usedSlots: (Number(userData.tier) * 3) - Number(userData.openHeroSlots)
    };
    
  } catch (error) {
    console.error(`[RapidRenewal] Error fetching RR status for ${walletAddress}:`, error.message);
    return null;
  }
}

/**
 * Check if a specific hero has Rapid Renewal active
 * @param {string} walletAddress - User's wallet address
 * @param {number} heroId - Hero ID to check
 * @returns {Promise<boolean>} True if hero has RR active
 */
export async function isHeroRapidRenewalActive(walletAddress, heroId) {
  try {
    const contract = getPowerUpContract();
    const rrId = await getRapidRenewalPowerUpId();
    
    return await contract.isHeroPowerUpActive(walletAddress, rrId, heroId);
    
  } catch (error) {
    console.error(`[RapidRenewal] Error checking RR for hero ${heroId}:`, error.message);
    return false;
  }
}

/**
 * Annotate heroes array with hasRapidRenewal flag
 * @param {Array} heroes - Array of hero objects
 * @param {string} walletAddress - Wallet to check RR for
 * @returns {Promise<Array>} Heroes with heroMeta.hasRapidRenewal set
 */
export async function annotateHeroesWithRapidRenewal(heroes, walletAddress) {
  const rrHeroIds = await getRapidRenewalHeroIds(walletAddress);
  
  return heroes.map(h => {
    const hero = h.hero || h;
    const heroId = Number(hero.normalizedId || hero.id);
    const hasRR = rrHeroIds.has(heroId);
    
    return {
      ...h,
      hero: h.hero || hero,
      heroMeta: {
        ...(h.heroMeta || {}),
        hasRapidRenewal: hasRR
      }
    };
  });
}

/**
 * Format Rapid Renewal summary for DM output
 * @param {Object} rrStatus - From getRapidRenewalStatus
 * @param {Set<number>} rrHeroIds - Hero IDs with RR
 * @returns {string} Formatted summary
 */
export function formatRapidRenewalSummary(rrStatus, rrHeroIds) {
  if (!rrStatus || !rrStatus.isActivated) {
    return '**Rapid Renewal:** Not subscribed';
  }
  
  const heroList = Array.from(rrHeroIds).slice(0, 5);
  const moreCount = rrHeroIds.size - 5;
  
  let heroStr = heroList.map(id => `#${id}`).join(', ');
  if (moreCount > 0) {
    heroStr += ` +${moreCount} more`;
  }
  
  return `**Rapid Renewal:** Tier ${rrStatus.tier} (${rrStatus.usedSlots}/${rrStatus.totalSlots} slots used)\n` +
         `- Active on: ${heroStr || 'none'}`;
}

// ============================================
// WILD UNKNOWN & GRAVITY FEEDER POWER-UP FUNCTIONS
// ============================================

/**
 * Check if user has Wild Unknown power-up active (required for Expeditions)
 * @param {string} walletAddress - User's wallet address
 * @returns {Promise<{isActive: boolean}>}
 */
export async function getWildUnknownStatus(walletAddress) {
  try {
    const contract = getPowerUpContract();
    const wuId = getWildUnknownPowerUpId();
    
    const isActive = await contract.isUserPowerUpActive(walletAddress, wuId);
    
    // Get assigned heroes count if active
    let heroSlots = 0;
    if (isActive) {
      try {
        const heroIds = await contract.getAssignedHeroIds(walletAddress, wuId);
        heroSlots = heroIds.length;
      } catch (e) {
        heroSlots = -1; // Unknown
      }
    }
    
    console.log(`[WildUnknown] Wallet ${walletAddress.slice(0, 8)}... has Wild Unknown: ${isActive ? `YES (${heroSlots} heroes)` : 'NO'}`);
    
    return {
      isActive,
      heroSlots
    };
  } catch (error) {
    console.error(`[WildUnknown] Error fetching WU status for ${walletAddress}:`, error.message);
    return { isActive: false, heroSlots: 0 };
  }
}

/**
 * Check if user has Gravity Feeder power-up active
 * Gravity Feeder auto-feeds pets during expeditions (costs 300 cJEWEL)
 * @param {string} walletAddress - User's wallet address
 * @returns {Promise<{isActive: boolean}>}
 */
export async function getGravityFeederStatus(walletAddress) {
  try {
    const contract = getPowerUpContract();
    const gfId = getGravityFeederPowerUpId();
    
    const isActive = await contract.isUserPowerUpActive(walletAddress, gfId);
    
    console.log(`[GravityFeeder] Wallet ${walletAddress.slice(0, 8)}... has Gravity Feeder: ${isActive ? 'YES' : 'NO'}`);
    
    return { isActive };
  } catch (error) {
    console.error(`[GravityFeeder] Error fetching GF status for ${walletAddress}:`, error.message);
    return { isActive: false };
  }
}

/**
 * Check if pets should be considered fed for a wallet via Gravity Feeder
 * Returns object with fed status and whether it was confirmed
 * @param {string} walletAddress - User's wallet address
 * @returns {Promise<{isFed: boolean, confirmed: boolean, reason: string}>}
 */
export async function arePetsFedByGravityFeeder(walletAddress) {
  try {
    const status = await getGravityFeederStatus(walletAddress);
    
    if (status.isActive) {
      return { isFed: true, confirmed: true, reason: 'Gravity Feeder active' };
    }
    
    // Contract returned but GF is not active - pets need manual feeding
    return { isFed: false, confirmed: true, reason: 'No Gravity Feeder' };
  } catch (err) {
    // Contract call failed - return unknown status
    console.log(`[GravityFeeder] Contract error. Cannot determine GF status.`);
    return { isFed: false, confirmed: false, reason: 'Contract error' };
  }
}

/**
 * Check if user has Quick Study power-up active
 * Quick Study increases XP gains from training and quests
 * @param {string} walletAddress - User's wallet address
 * @returns {Promise<{isActive: boolean}>}
 */
export async function getQuickStudyStatus(walletAddress) {
  try {
    const contract = getPowerUpContract();
    const qsId = POWERUP_IDS.QUICK_STUDY;
    
    const isActive = await contract.isUserPowerUpActive(walletAddress, qsId);
    
    console.log(`[QuickStudy] Wallet ${walletAddress.slice(0, 8)}... has Quick Study: ${isActive ? 'YES' : 'NO'}`);
    
    return { isActive };
  } catch (error) {
    console.error(`[QuickStudy] Error fetching QS status for ${walletAddress}:`, error.message);
    return { isActive: false };
  }
}

/**
 * Check if user has Premium Provisions power-up active
 * Premium Provisions grants bonus pet food quality
 * @param {string} walletAddress - User's wallet address
 * @returns {Promise<{isActive: boolean}>}
 */
export async function getPremiumProvisionsStatus(walletAddress) {
  try {
    const contract = getPowerUpContract();
    const ppId = POWERUP_IDS.PREMIUM_PROVISIONS;
    
    const isActive = await contract.isUserPowerUpActive(walletAddress, ppId);
    
    console.log(`[PremiumProvisions] Wallet ${walletAddress.slice(0, 8)}... has Premium Provisions: ${isActive ? 'YES' : 'NO'}`);
    
    return { isActive };
  } catch (error) {
    console.error(`[PremiumProvisions] Error fetching PP status for ${walletAddress}:`, error.message);
    return { isActive: false };
  }
}

/**
 * Check if user has Thrifty power-up active
 * Provides a chance to randomly recover used items after combat
 * @param {string} walletAddress - User's wallet address
 * @returns {Promise<{isActive: boolean}>}
 */
export async function getThriftyStatus(walletAddress) {
  try {
    const contract = getPowerUpContract();
    const isActive = await contract.isUserPowerUpActive(walletAddress, POWERUP_IDS.THRIFTY);
    console.log(`[Thrifty] Wallet ${walletAddress.slice(0, 8)}... has Thrifty: ${isActive ? 'YES' : 'NO'}`);
    return { isActive };
  } catch (error) {
    console.error(`[Thrifty] Error:`, error.message);
    return { isActive: false };
  }
}

/**
 * Check if user has Perpetual Potion Machine power-up active
 * Allows the use of Stamina Vials in Expeditions
 * @param {string} walletAddress - User's wallet address
 * @returns {Promise<{isActive: boolean}>}
 */
export async function getPerpetualPotionStatus(walletAddress) {
  try {
    const contract = getPowerUpContract();
    const isActive = await contract.isUserPowerUpActive(walletAddress, POWERUP_IDS.PERPETUAL_POTION);
    console.log(`[PerpetualPotion] Wallet ${walletAddress.slice(0, 8)}... has Perpetual Potion: ${isActive ? 'YES' : 'NO'}`);
    return { isActive };
  } catch (error) {
    console.error(`[PerpetualPotion] Error:`, error.message);
    return { isActive: false };
  }
}

/**
 * Check if user has Unscathed power-up active
 * Reduces the Hero's chance of receiving durability damage by 10% on first roll
 * @param {string} walletAddress - User's wallet address
 * @returns {Promise<{isActive: boolean}>}
 */
export async function getUnscathedStatus(walletAddress) {
  try {
    const contract = getPowerUpContract();
    const isActive = await contract.isUserPowerUpActive(walletAddress, POWERUP_IDS.UNSCATHED);
    console.log(`[Unscathed] Wallet ${walletAddress.slice(0, 8)}... has Unscathed: ${isActive ? 'YES' : 'NO'}`);
    return { isActive };
  } catch (error) {
    console.error(`[Unscathed] Error:`, error.message);
    return { isActive: false };
  }
}

/**
 * Check if user has Backstage Pass power-up active
 * Grants access to the Combat Testing Grounds
 * @param {string} walletAddress - User's wallet address
 * @returns {Promise<{isActive: boolean}>}
 */
export async function getBackstagePassStatus(walletAddress) {
  try {
    const contract = getPowerUpContract();
    const isActive = await contract.isUserPowerUpActive(walletAddress, POWERUP_IDS.BACKSTAGE_PASS);
    console.log(`[BackstagePass] Wallet ${walletAddress.slice(0, 8)}... has Backstage Pass: ${isActive ? 'YES' : 'NO'}`);
    return { isActive };
  } catch (error) {
    console.error(`[BackstagePass] Error:`, error.message);
    return { isActive: false };
  }
}

/**
 * Check if user has Master Merchant power-up active
 * Provides a discount on Bazaar Trading Fees
 * @param {string} walletAddress - User's wallet address
 * @returns {Promise<{isActive: boolean}>}
 */
export async function getMasterMerchantStatus(walletAddress) {
  try {
    const contract = getPowerUpContract();
    const isActive = await contract.isUserPowerUpActive(walletAddress, POWERUP_IDS.MASTER_MERCHANT);
    console.log(`[MasterMerchant] Wallet ${walletAddress.slice(0, 8)}... has Master Merchant: ${isActive ? 'YES' : 'NO'}`);
    return { isActive };
  } catch (error) {
    console.error(`[MasterMerchant] Error:`, error.message);
    return { isActive: false };
  }
}

/**
 * Get comprehensive power-up status for a wallet
 * Returns all power-up statuses
 * @param {string} walletAddress - User's wallet address
 * @returns {Promise<Object>} Power-up status summary
 */
export async function getWalletPowerUpStatus(walletAddress) {
  try {
    const [
      wildUnknown, gravityFeeder, quickStudy, premiumProvisions, rapidRenewalHeroes,
      thrifty, perpetualPotion, unscathed, backstagePass, masterMerchant
    ] = await Promise.all([
      getWildUnknownStatus(walletAddress),
      getGravityFeederStatus(walletAddress),
      getQuickStudyStatus(walletAddress),
      getPremiumProvisionsStatus(walletAddress),
      getRapidRenewalHeroIds(walletAddress),
      getThriftyStatus(walletAddress),
      getPerpetualPotionStatus(walletAddress),
      getUnscathedStatus(walletAddress),
      getBackstagePassStatus(walletAddress),
      getMasterMerchantStatus(walletAddress)
    ]);
    
    return {
      wildUnknown: {
        active: wildUnknown.isActive,
        heroSlots: wildUnknown.heroSlots
      },
      gravityFeeder: { active: gravityFeeder.isActive },
      quickStudy: { active: quickStudy.isActive },
      premiumProvisions: { active: premiumProvisions.isActive },
      rapidRenewal: {
        heroCount: rapidRenewalHeroes.size,
        heroIds: Array.from(rapidRenewalHeroes)
      },
      thrifty: { active: thrifty.isActive },
      perpetualPotion: { active: perpetualPotion.isActive },
      unscathed: { active: unscathed.isActive },
      backstagePass: { active: backstagePass.isActive },
      masterMerchant: { active: masterMerchant.isActive }
    };
  } catch (error) {
    console.error(`[PowerUps] Error fetching power-up status:`, error.message);
    return {
      wildUnknown: { active: false, heroSlots: 0 },
      gravityFeeder: { active: false },
      quickStudy: { active: false },
      premiumProvisions: { active: false },
      rapidRenewal: { heroCount: 0, heroIds: [] },
      thrifty: { active: false },
      perpetualPotion: { active: false },
      unscathed: { active: false },
      backstagePass: { active: false },
      masterMerchant: { active: false }
    };
  }
}

export default {
  POWERUP_IDS,
  getRapidRenewalPowerUpId,
  getRapidRenewalHeroIds,
  getRapidRenewalStatus,
  isHeroRapidRenewalActive,
  annotateHeroesWithRapidRenewal,
  formatRapidRenewalSummary,
  getGravityFeederPowerUpId,
  getGravityFeederStatus,
  arePetsFedByGravityFeeder,
  getWildUnknownPowerUpId,
  getWildUnknownStatus,
  getQuickStudyStatus,
  getPremiumProvisionsStatus,
  getWalletPowerUpStatus
};
