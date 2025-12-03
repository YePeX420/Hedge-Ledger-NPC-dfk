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
const POWERUP_MANAGER_ADDRESS = '0x5d23Af0548452c6AAe80a7e49a6faf4Ed534cfCc';

let provider = null;
let powerUpContract = null;
let rapidRenewalId = null;

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
    powerUpContract = new ethers.Contract(POWERUP_MANAGER_ADDRESS, abi, getProvider());
  }
  return powerUpContract;
}

/**
 * Find the Rapid Renewal power-up ID by scanning active power-ups
 * Caches result in memory for subsequent calls
 */
export async function getRapidRenewalPowerUpId() {
  if (rapidRenewalId !== null) {
    return rapidRenewalId;
  }

  try {
    const contract = getPowerUpContract();
    const powerUps = await contract.getActivePowerUps();
    
    for (const pu of powerUps) {
      const name = pu.name?.toLowerCase() || '';
      if (name.includes('rapid renewal') || name.includes('rapidrenewal')) {
        rapidRenewalId = Number(pu.id);
        console.log(`[RapidRenewal] Found Rapid Renewal power-up ID: ${rapidRenewalId}`);
        return rapidRenewalId;
      }
    }
    
    rapidRenewalId = 1;
    console.log(`[RapidRenewal] Rapid Renewal not found by name, using default ID: ${rapidRenewalId}`);
    return rapidRenewalId;
    
  } catch (error) {
    console.error('[RapidRenewal] Error fetching power-ups:', error.message);
    rapidRenewalId = 1;
    return rapidRenewalId;
  }
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
    
    const heroIdsBigInt = await contract.getAssignedHeroIds(walletAddress, rrId);
    const heroIds = new Set(heroIdsBigInt.map(id => Number(id)));
    
    console.log(`[RapidRenewal] Wallet ${walletAddress.slice(0, 8)}... has ${heroIds.size} heroes with RR`);
    return heroIds;
    
  } catch (error) {
    console.error(`[RapidRenewal] Error fetching RR heroes for ${walletAddress}:`, error.message);
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

export default {
  getRapidRenewalPowerUpId,
  getRapidRenewalHeroIds,
  getRapidRenewalStatus,
  isHeroRapidRenewalActive,
  annotateHeroesWithRapidRenewal,
  formatRapidRenewalSummary
};
