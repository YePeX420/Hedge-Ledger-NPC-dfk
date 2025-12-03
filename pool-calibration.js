// pool-calibration.js
// Per-pool calibration constants for garden yield calculations
// Calibrated from actual user claim data

const POOL_NAMES = {
  0: 'xJEWEL-wJEWEL',
  1: 'CRYSTAL-AVAX',
  2: 'CRYSTAL-wJEWEL',
  3: 'CRYSTAL-USDC',
  4: 'ETH-USDC',
  5: 'wJEWEL-USDC',
  6: 'CRYSTAL-ETH',
  7: 'CRYSTAL-BTC.b',
  8: 'CRYSTAL-KLAY',
  9: 'wJEWEL-KLAY',
  10: 'wJEWEL-AVAX',
  11: 'wJEWEL-BTC.b',
  12: 'wJEWEL-ETH',
  13: 'BTC.b-USDC'
};

const POOL_CALIBRATION = {
  5: {
    crystalBase: 1.8171,
    jewelBase: 0.1374,
    source: 'user_claim_2025-12-03',
    heroes: [155902, 39025],
    notes: 'Calibrated from JEWEL-USDC pool claim with pet bonuses (6.2%, 6.3%)'
  }
};

const DEFAULT_CALIBRATION = {
  crystalBase: 1.82,
  jewelBase: 0.14,
  source: 'estimated_from_pool5'
};

export function getPoolCalibration(poolId) {
  const pid = Number(poolId);
  if (POOL_CALIBRATION[pid]) {
    return POOL_CALIBRATION[pid];
  }
  return { 
    ...DEFAULT_CALIBRATION,
    poolId: pid,
    isDefault: true 
  };
}

export function getPoolName(poolId) {
  return POOL_NAMES[poolId] || `Pool ${poolId}`;
}

export function getAllPoolNames() {
  return POOL_NAMES;
}

export function estimatePerRunYield(h1, h2, attempts, poolId = null, options = {}) {
  const calibration = getPoolCalibration(poolId);
  const CRYSTAL_BASE = calibration.crystalBase;
  const JEWEL_BASE = calibration.jewelBase;
  
  const factor1 = h1.factor;
  const petBonus1 = h1.petFed ? h1.petBonusPct : 0;
  const factor2 = h2 ? h2.factor : 0;
  const petBonus2 = h2?.petFed ? h2.petBonusPct : 0;
  
  let crystalPerRun, jewelPerRun;
  
  if (options.roleAware && h2) {
    const crystalFarmer = h1.role === 'CRYSTAL' ? h1 : h2;
    const jewelFarmer = h1.role === 'JEWEL' ? h1 : h2;
    
    const cFactor = crystalFarmer === h1 ? factor1 : factor2;
    const cPetBonus = crystalFarmer === h1 ? petBonus1 : petBonus2;
    const jFactor = jewelFarmer === h1 ? factor1 : factor2;
    const jPetBonus = jewelFarmer === h1 ? petBonus1 : petBonus2;
    
    crystalPerRun = CRYSTAL_BASE * attempts * cFactor * (1 + cPetBonus / 100);
    jewelPerRun = JEWEL_BASE * attempts * jFactor * (1 + jPetBonus / 100);
  } else {
    const hero1Crystal = CRYSTAL_BASE * attempts * factor1 * (1 + petBonus1 / 100);
    const hero1Jewel = JEWEL_BASE * attempts * factor1 * (1 + petBonus1 / 100);
    const hero2Crystal = h2 ? CRYSTAL_BASE * attempts * factor2 * (1 + petBonus2 / 100) : 0;
    const hero2Jewel = h2 ? JEWEL_BASE * attempts * factor2 * (1 + petBonus2 / 100) : 0;
    
    crystalPerRun = hero1Crystal + hero2Crystal;
    jewelPerRun = hero1Jewel + hero2Jewel;
  }
  
  return {
    crystalPerRun,
    jewelPerRun,
    calibration: {
      poolId,
      crystalBase: CRYSTAL_BASE,
      jewelBase: JEWEL_BASE,
      isDefault: calibration.isDefault || false
    }
  };
}

export function calibrateFromClaim(poolId, claimData) {
  const { 
    claimedCrystal, 
    claimedJewel, 
    attempts, 
    crystalFarmer, 
    jewelFarmer 
  } = claimData;
  
  const crystalBase = claimedCrystal / (attempts * crystalFarmer.effectiveFactor);
  const jewelBase = claimedJewel / (attempts * jewelFarmer.effectiveFactor);
  
  return {
    poolId,
    crystalBase,
    jewelBase,
    source: `user_calibration_${new Date().toISOString().split('T')[0]}`,
    validation: {
      predictedCrystal: crystalBase * attempts * crystalFarmer.effectiveFactor,
      predictedJewel: jewelBase * attempts * jewelFarmer.effectiveFactor,
      actualCrystal: claimedCrystal,
      actualJewel: claimedJewel
    }
  };
}

export function formatCalibrationInfo(poolId) {
  const cal = getPoolCalibration(poolId);
  const poolName = getPoolName(poolId);
  
  if (cal.isDefault) {
    return `${poolName}: CRYSTAL=${cal.crystalBase.toFixed(2)}, JEWEL=${cal.jewelBase.toFixed(2)} (default estimate)`;
  }
  return `${poolName}: CRYSTAL=${cal.crystalBase.toFixed(4)}, JEWEL=${cal.jewelBase.toFixed(4)} (${cal.source})`;
}
