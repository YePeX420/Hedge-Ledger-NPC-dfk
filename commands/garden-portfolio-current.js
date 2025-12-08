import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getAllHeroesByOwner, getGardenPoolByPid, getUserGardenPositions } from '../onchain-data.js';
import { fetchPetsForWallet } from '../pet-data.js';
import { getQuestRewardFundBalances } from '../quest-reward-fund.js';
import { getCachedPoolAnalytics } from '../pool-cache.js';
import { getCrystalPrice, getJewelPrice, getBatchPrices, TOKEN_ADDRESSES } from '../price-feed.js';
import { getLPTokenDetails } from '../garden-analytics.js';
import { getRapidRenewalHeroIds } from '../rapid-renewal-service.js';
import { getExpeditionPairs } from '../hero-pairing.js';
import { groupHeroesByGardenPool } from '../garden-pairs.js';

const GARDEN_POOLS = [
  { pid: 0, name: 'wJEWEL-xJEWEL', lpToken: '0x6AC38A4C112F125eac0eBDbaDBed0BC8F4575d0d', tokens: ['JEWEL', 'xJEWEL'] },
  { pid: 1, name: 'CRYSTAL-AVAX', lpToken: '0x9f378F48d0c1328fd0C80d7Ae544C6CadB5Ba99E', tokens: ['CRYSTAL', 'AVAX'] },
  { pid: 2, name: 'CRYSTAL-wJEWEL', lpToken: '0x48658E69D741024b4686C8f7b236D3F1D291f386', tokens: ['CRYSTAL', 'JEWEL'] },
  { pid: 3, name: 'CRYSTAL-USDC', lpToken: '0x04Dec678825b8DfD2D0d9bD83B538bE3fbDA2926', tokens: ['CRYSTAL', 'USDC'] },
  { pid: 4, name: 'ETH-USDC', lpToken: '0x7d4daa9eB74264b082A92F3f559ff167224484aC', tokens: ['ETH', 'USDC'] },
  { pid: 5, name: 'wJEWEL-USDC', lpToken: '0xCF329b34049033dE26e4449aeBCb41f1992724D3', tokens: ['JEWEL', 'USDC'] },
  { pid: 6, name: 'CRYSTAL-ETH', lpToken: '0x78C893E262e2681Dbd6B6eBA6CCA2AaD45de19AD', tokens: ['CRYSTAL', 'ETH'] },
  { pid: 7, name: 'CRYSTAL-BTC.b', lpToken: '0x00BD81c9bAc29a3b6aea7ABc92d2C9a3366Bb4dD', tokens: ['CRYSTAL', 'BTC'] },
  { pid: 8, name: 'CRYSTAL-KLAY', lpToken: '0xaFC1fBc3F3fB517EB54Bb2472051A6f0b2105320', tokens: ['CRYSTAL', 'KAIA'] },
  { pid: 9, name: 'wJEWEL-KLAY', lpToken: '0x561091E2385C90d41b4c0dAef651A4b33E1a5CfE', tokens: ['JEWEL', 'KAIA'] },
  { pid: 10, name: 'wJEWEL-AVAX', lpToken: '0xF3EabeD6Bd905e0FcD68FC3dBCd6e3A4aEE55E98', tokens: ['JEWEL', 'AVAX'] },
  { pid: 11, name: 'wJEWEL-BTC.b', lpToken: '0xfAa8507e822397bd56eFD4480Fb12ADC41ff940B', tokens: ['JEWEL', 'BTC'] },
  { pid: 12, name: 'wJEWEL-ETH', lpToken: '0x79724B6996502afc773feB3Ff8Bb3C23ADf2854B', tokens: ['JEWEL', 'ETH'] },
  { pid: 13, name: 'BTC.b-USDC', lpToken: '0x59D642B471dd54207Cb1CDe2e7507b0Ce1b1a6a5', tokens: ['BTC', 'USDC'] }
];

const POWER_SURGE_IDS = [90, 170];
const SKILLED_GREENSKEEPER_IDS = [7, 86, 166];

function calculateHeroFactor(hero, additionalGrdSkill = 0) {
  const WIS = hero.wisdom || 0;
  const VIT = hero.vitality || 0;
  const rawGrdSkill = (hero.gardening || 0) / 10;
  const GrdSkl = rawGrdSkill + additionalGrdSkill;
  return 0.1 + (WIS + VIT) / 1222.22 + GrdSkl / 244.44;
}

function getPetGardenSkillType(pet) {
  if (!pet || pet.eggType !== 2) return null;
  const bonusId = pet.gatheringBonus;
  if (POWER_SURGE_IDS.includes(bonusId)) {
    return { type: 'power_surge', bonus: pet.gatheringBonusScalar };
  }
  if (SKILLED_GREENSKEEPER_IDS.includes(bonusId)) {
    return { type: 'skilled_greenskeeper', bonus: pet.gatheringBonusScalar };
  }
  return null;
}

function buildHeroData(hero, pet, hasRR, stamina) {
  let heroFactor = calculateHeroFactor(hero);
  let petMultiplier = 1.0;
  let petBonus = 0;
  let skillType = 'none';
  
  if (pet) {
    const skillInfo = getPetGardenSkillType(pet);
    if (skillInfo) {
      if (skillInfo.type === 'power_surge') {
        petMultiplier = 1 + skillInfo.bonus / 100;
      } else if (skillInfo.type === 'skilled_greenskeeper') {
        heroFactor = calculateHeroFactor(hero, skillInfo.bonus / 10);
      }
      petBonus = skillInfo.bonus;
      skillType = skillInfo.type;
    }
  }
  
  const hasGardeningGene = hero.professionStr === 'Gardening';
  const gardeningSkill = hero.gardening || 0;
  const grdSkillForFormula = gardeningSkill / 10;
  const rewardModBase = grdSkillForFormula >= 10 ? 72 : 144;
  const geneBonus = hasGardeningGene ? 1 : 0;
  const divisor = (300 - (50 * geneBonus)) * rewardModBase;
  
  const questMinPerStam = hasGardeningGene ? 10 : 12;
  let regenMinPerStam = 20;
  if (hasRR) {
    const regenSeconds = Math.max(300, 1200 - (hero.level * 3));
    regenMinPerStam = regenSeconds / 60;
  }
  const cycleMinutes = stamina * (questMinPerStam + regenMinPerStam);
  const runsPerDay = 1440 / cycleMinutes;
  
  return {
    hero,
    pet,
    heroFactor,
    petMultiplier,
    petBonus,
    skillType,
    hasGardeningGene,
    gardeningSkill,
    divisor,
    runsPerDay,
    hasRR,
    stamina
  };
}

function scoreHeroForPool(heroData, pool, rewardFund, lpShare, stamina) {
  const crystalPerRun = (rewardFund.crystalPool * pool.allocDecimal * lpShare * heroData.heroFactor * heroData.petMultiplier * stamina) / heroData.divisor;
  const jewelPerRun = (rewardFund.jewelPool * pool.allocDecimal * lpShare * heroData.heroFactor * heroData.petMultiplier * stamina) / heroData.divisor;
  return { crystalPerRun, jewelPerRun };
}

async function getAllPoolsData() {
  const pools = [];
  const cached = getCachedPoolAnalytics();
  const cachedData = cached?.data || [];
  
  for (const poolInfo of GARDEN_POOLS) {
    try {
      const poolDetails = await getGardenPoolByPid(poolInfo.pid, 'dfk');
      if (!poolDetails) continue;
      
      const totalStakedRaw = poolDetails.totalStakedRaw;
      if (!totalStakedRaw || BigInt(totalStakedRaw) <= 0n) continue;
      
      const analytics = cachedData.find(p => p.pid === poolInfo.pid);
      const tvl = analytics?.totalTVL || 0;
      const v2TVL = analytics?.v2TVL || 0; // V2 staked TVL for accurate position calculations
      const allocPercent = parseFloat(poolDetails.allocPercent) || 0;
      
      pools.push({
        pid: poolInfo.pid,
        name: poolInfo.name,
        lpToken: poolInfo.lpToken,
        tokens: poolInfo.tokens,
        totalStakedRaw,
        totalStaked: poolDetails.totalStaked,
        tvl,
        v2TVL, // V2 staked TVL
        allocPercent,
        allocDecimal: allocPercent / 100
      });
    } catch (err) {
      console.error(`[GardenPortfolioCurrent] Error getting pool ${poolInfo.pid}:`, err.message);
    }
  }
  
  return pools;
}

async function getTokenPrices() {
  try {
    const [crystalPrice, jewelPrice] = await Promise.all([
      getCrystalPrice(),
      getJewelPrice()
    ]);
    
    const batchPrices = await getBatchPrices([
      TOKEN_ADDRESSES.USDC,
      TOKEN_ADDRESSES.WETH,
      TOKEN_ADDRESSES.WAVAX
    ]);
    
    const prices = {
      CRYSTAL: crystalPrice || 0,
      JEWEL: jewelPrice || 0,
      USDC: batchPrices.get(TOKEN_ADDRESSES.USDC.toLowerCase()) || 1.0,
      ETH: batchPrices.get(TOKEN_ADDRESSES.WETH.toLowerCase()) || 0,
      AVAX: batchPrices.get(TOKEN_ADDRESSES.WAVAX.toLowerCase()) || 0,
      BTC: 0,
      KAIA: 0,
      xJEWEL: 0
    };
    
    try {
      const btcUsdcLP = '0x59D642B471dd54207Cb1CDe2e7507b0Ce1b1a6a5';
      const btcDetails = await getLPTokenDetails(btcUsdcLP);
      if (btcDetails) {
        const dec0 = Number(btcDetails.token0.decimals);
        const dec1 = Number(btcDetails.token1.decimals);
        const r0 = parseFloat(btcDetails.reserve0.toString()) / Math.pow(10, dec0);
        const r1 = parseFloat(btcDetails.reserve1.toString()) / Math.pow(10, dec1);
        if (btcDetails.token0.symbol.includes('USDC')) {
          prices.BTC = r0 / r1;
        } else {
          prices.BTC = r1 / r0;
        }
      }
    } catch (e) {}
    
    try {
      const crystalKaiaLP = '0xaFC1fBc3F3fB517EB54Bb2472051A6f0b2105320';
      const kaiaDetails = await getLPTokenDetails(crystalKaiaLP);
      if (kaiaDetails && prices.CRYSTAL > 0) {
        const dec0 = Number(kaiaDetails.token0.decimals);
        const dec1 = Number(kaiaDetails.token1.decimals);
        const r0 = parseFloat(kaiaDetails.reserve0.toString()) / Math.pow(10, dec0);
        const r1 = parseFloat(kaiaDetails.reserve1.toString()) / Math.pow(10, dec1);
        const sym0 = kaiaDetails.token0.symbol.toUpperCase();
        if (sym0.includes('CRYSTAL')) {
          prices.KAIA = prices.CRYSTAL * (r0 / r1);
        } else {
          prices.KAIA = prices.CRYSTAL * (r1 / r0);
        }
      }
    } catch (e) {}
    
    prices.xJEWEL = prices.JEWEL;
    return prices;
  } catch (err) {
    console.error('[GardenPortfolioCurrent] Error getting prices:', err.message);
    return {
      CRYSTAL: 0.0045,
      JEWEL: 0.0175,
      USDC: 1.0,
      ETH: 3450,
      AVAX: 42,
      BTC: 97500,
      KAIA: 0.15,
      xJEWEL: 0.0175
    };
  }
}

export const data = new SlashCommandBuilder()
  .setName('garden-portfolio-current')
  .setDescription('Show your current hero gardening positions with yields')
  .addStringOption(option =>
    option.setName('wallet')
      .setDescription('Wallet address')
      .setRequired(true)
  )
  .addIntegerOption(option =>
    option.setName('stamina')
      .setDescription('Stamina per run (default: 30)')
      .setRequired(false)
      .setMinValue(1)
      .setMaxValue(100)
  );

export async function execute(interaction) {
  const startTime = Date.now();
  
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply();
  }
  
  try {
    const walletAddress = interaction.options.getString('wallet').toLowerCase();
    const stamina = interaction.options.getInteger('stamina') || 30;
    
    console.log(`[GardenPortfolioCurrent] Analyzing wallet ${walletAddress}, stamina=${stamina}...`);
    
    const [heroes, pets, allPools, prices, rewardFund, existingPositions, expeditionData] = await Promise.all([
      getAllHeroesByOwner(walletAddress),
      fetchPetsForWallet(walletAddress),
      getAllPoolsData(),
      getTokenPrices(),
      getQuestRewardFundBalances(),
      getUserGardenPositions(walletAddress, 'dfk'),
      getExpeditionPairs(walletAddress)
    ]);
    
    const pools = allPools.filter(p => p.pid !== 0);
    
    if (!heroes || heroes.length === 0) {
      return interaction.editReply('No heroes found for this wallet.');
    }
    
    let gardeningPools = expeditionData?.pools || {};
    let detectionMethod = 'expedition_api';
    
    if (!expeditionData || expeditionData.pairs.length === 0) {
      console.log('[GardenPortfolioCurrent] No expedition data, falling back to currentQuest detection...');
      const poolHeroes = groupHeroesByGardenPool(heroes);
      
      if (poolHeroes.size === 0) {
        return interaction.editReply('No heroes currently gardening. Use `/garden-portfolio-3pair` to see optimal assignments.');
      }
      
      detectionMethod = 'currentQuest';
      gardeningPools = {};
      for (const [poolId, heroList] of poolHeroes.entries()) {
        const poolInfo = GARDEN_POOLS.find(p => p.pid === poolId);
        const pairs = [];
        for (let i = 0; i < heroList.length; i += 2) {
          const h1 = heroList[i];
          const h2 = heroList[i + 1];
          if (h1 && h2) {
            pairs.push({
              poolId,
              poolName: poolInfo?.name || `Pool ${poolId}`,
              heroIds: [Number(h1.normalizedId || h1.id), Number(h2.normalizedId || h2.id)]
            });
          } else if (h1) {
            pairs.push({
              poolId,
              poolName: poolInfo?.name || `Pool ${poolId}`,
              heroIds: [Number(h1.normalizedId || h1.id)]
            });
          }
        }
        if (pairs.length > 0) {
          gardeningPools[poolId] = pairs;
        }
      }
      console.log(`[GardenPortfolioCurrent] Fallback detected ${Object.keys(gardeningPools).length} pools with gardening heroes`);
    }
    
    if (Object.keys(gardeningPools).length === 0) {
      return interaction.editReply('No heroes currently gardening. Use `/garden-portfolio-3pair` to see optimal assignments.');
    }
    
    const poolsWithTVL = pools.filter(p => p.tvl > 0);
    const cacheReady = poolsWithTVL.length > 0;
    
    if (!cacheReady) {
      console.log('[GardenPortfolioCurrent] Warning: Pool cache not ready, TVL data unavailable');
    }
    
    const heroMap = new Map();
    for (const hero of heroes) {
      const rawId = hero.id;
      const rawIdNum = Number(rawId);
      const normalizedIdStr = hero.normalizedId;
      const normalizedIdNum = normalizedIdStr ? Number(normalizedIdStr) : 
        (rawIdNum >= 2_000_000_000_000 ? rawIdNum - 2_000_000_000_000 :
         rawIdNum >= 1_000_000_000_000 ? rawIdNum - 1_000_000_000_000 : rawIdNum);
      
      heroMap.set(normalizedIdNum, hero);
      heroMap.set(String(normalizedIdNum), hero);
      if (normalizedIdStr && normalizedIdStr !== String(normalizedIdNum)) {
        heroMap.set(normalizedIdStr, hero);
      }
      if (normalizedIdNum !== rawIdNum) {
        heroMap.set(rawIdNum, hero);
        heroMap.set(String(rawIdNum), hero);
      }
      heroMap.set(rawId, hero);
    }
    
    const lookupHero = (id) => {
      return heroMap.get(id) || heroMap.get(Number(id)) || heroMap.get(String(id));
    };
    
    console.log(`[GardenPortfolioCurrent] HeroMap has ${heroMap.size} entries for ${heroes.length} heroes`);
    const sampleKeys = [...heroMap.keys()].slice(0, 8);
    console.log(`[GardenPortfolioCurrent] Sample heroMap keys: [${sampleKeys.map(k => `${k}(${typeof k})`).join(', ')}]`);
    const gardeningIds = [...Object.values(gardeningPools).flatMap(p => p.flatMap(pair => pair.heroIds))];
    console.log(`[GardenPortfolioCurrent] Gardening hero IDs from expedition: [${gardeningIds.map(id => `${id}(${typeof id})`).join(', ')}]`);
    
    const petMap = new Map();
    for (const pet of (pets || [])) {
      if (pet.eggType === 2) {
        petMap.set(Number(pet.id), pet);
      }
    }
    
    // Build heroPetMap using pet.equippedTo (pets point to heroes, not heroes to pets)
    const heroPetMap = new Map();
    for (const pet of (pets || [])) {
      if (pet.eggType === 2 && pet.equippedTo) {
        const equippedToNum = Number(pet.equippedTo);
        if (equippedToNum > 0) {
          // Normalize the hero ID (remove chain prefix if present)
          const normalizedHeroId = equippedToNum >= 2_000_000_000_000 ? equippedToNum - 2_000_000_000_000 :
                                   equippedToNum >= 1_000_000_000_000 ? equippedToNum - 1_000_000_000_000 : equippedToNum;
          
          heroPetMap.set(normalizedHeroId, pet);
          heroPetMap.set(String(normalizedHeroId), pet);
          // Also store with raw ID in case expedition uses it
          if (normalizedHeroId !== equippedToNum) {
            heroPetMap.set(equippedToNum, pet);
            heroPetMap.set(String(equippedToNum), pet);
          }
        }
      }
    }
    console.log(`[GardenPortfolioCurrent] Built heroPetMap with ${heroPetMap.size / 2} hero->pet mappings from ${petMap.size} gardening pets`);
    
    const lookupPet = (id) => {
      return heroPetMap.get(id) || heroPetMap.get(Number(id)) || heroPetMap.get(String(id));
    };
    
    const existingByPid = new Map();
    for (const pos of (existingPositions || [])) {
      existingByPid.set(pos.pid, pos);
    }
    
    const gardeningHeroIds = new Set();
    for (const poolPairs of Object.values(gardeningPools)) {
      for (const pair of poolPairs) {
        for (const heroId of pair.heroIds) {
          gardeningHeroIds.add(heroId);
        }
      }
    }
    
    // Fetch all RR hero IDs once from contract and normalize them
    const rawRRHeroIds = await getRapidRenewalHeroIds(walletAddress);
    const normalizedRRSet = new Set();
    for (const rawId of rawRRHeroIds) {
      const numId = Number(rawId);
      // Normalize: remove chain prefix if present (same logic as normalizeHeroId)
      const normalizedId = numId >= 2_000_000_000_000 ? numId - 2_000_000_000_000 :
                           numId >= 1_000_000_000_000 ? numId - 1_000_000_000_000 : numId;
      normalizedRRSet.add(normalizedId);
      normalizedRRSet.add(String(normalizedId));
    }
    console.log(`[GardenPortfolioCurrent] RR detection: ${rawRRHeroIds.size} raw IDs -> ${normalizedRRSet.size / 2} normalized heroes`);
    
    // Build rrMap by checking if expedition heroIds are in the normalized RR set
    const rrMap = new Map();
    for (const heroId of gardeningHeroIds) {
      const numId = Number(heroId);
      const hasRR = normalizedRRSet.has(numId) || normalizedRRSet.has(String(numId));
      rrMap.set(heroId, hasRR);
      if (hasRR) {
        console.log(`[GardenPortfolioCurrent] Hero ${heroId} has RR`);
      }
    }
    
    const poolResults = [];
    const poolsNoLP = [];
    let totalDailyCrystal = 0;
    let totalDailyJewel = 0;
    let totalDailyUSD = 0;
    
    for (const [poolId, poolPairs] of Object.entries(gardeningPools)) {
      const pid = Number(poolId);
      const pool = pools.find(p => p.pid === pid);
      const poolInfo = GARDEN_POOLS.find(p => p.pid === pid);
      const poolName = poolInfo?.name || `Pool ${pid}`;
      
      const pos = existingByPid.get(pid);
      const hasLP = pos && BigInt(pos.stakedAmountRaw || 0) > 0n;
      
      if (!hasLP) {
        console.log(`[GardenPortfolioCurrent] No LP staked in pool ${pid}, still showing heroes`);
        poolsNoLP.push({
          pid,
          poolName,
          pairs: poolPairs,
          heroIds: poolPairs.flatMap(p => p.heroIds)
        });
        continue;
      }
      
      if (!pool) {
        console.log(`[GardenPortfolioCurrent] Pool ${pid} not found in pool data`);
        continue;
      }
      
      const userLPRaw = BigInt(pos.stakedAmountRaw || 0);
      const totalStakedRaw = BigInt(pool.totalStakedRaw);
      
      // V2 share: user's share of LP staked in V2 rewards pool (used for yield calculations)
      const v2Share = totalStakedRaw > 0n ? Number(userLPRaw) / Number(totalStakedRaw) : 0;
      
      // Position USD: user's share of V2 staked TVL (NOT total TVL)
      // v2Share * v2TVL = accurate position value (since v2Share is share of V2 staked LP)
      // Using v2Share * totalTVL would inflate values when not all LP is staked
      const v2TVL = pool.v2TVL || pool.tvl; // Prefer v2TVL, fallback to totalTVL
      let positionUSD = v2Share * v2TVL;
      
      // For display share, calculate user's share of total pool (for consistency with other views)
      let totalPoolShare = v2Share;
      if (poolInfo?.lpToken) {
        try {
          const lpDetails = await getLPTokenDetails(poolInfo.lpToken);
          if (lpDetails?.totalSupply && BigInt(lpDetails.totalSupply) > 0n) {
            const lpTotalSupply = BigInt(lpDetails.totalSupply);
            totalPoolShare = Number(userLPRaw) / Number(lpTotalSupply);
            // Recalculate positionUSD using total pool share * total TVL (more accurate)
            positionUSD = totalPoolShare * pool.tvl;
            console.log(`[GardenPortfolioCurrent] Pool ${pid}: V2 share=${(v2Share*100).toFixed(4)}%, Total pool share=${(totalPoolShare*100).toFixed(4)}%, Position=$${positionUSD.toFixed(0)}`);
          }
        } catch (err) {
          console.warn(`[GardenPortfolioCurrent] Could not get LP total supply for pool ${pid}, using v2Share*v2TVL: ${err.message}`);
        }
      }
      
      let poolDailyCrystal = 0;
      let poolDailyJewel = 0;
      const pairDetails = [];
      
      console.log(`[GardenPortfolioCurrent] Pool ${pid} has ${poolPairs.length} pairs, processing...`);
      
      for (const pairData of poolPairs) {
        const heroId1 = pairData.heroIds[0];
        const heroId2 = pairData.heroIds[1];
        const hero1 = lookupHero(heroId1);
        const hero2 = lookupHero(heroId2);
        
        // Use actual attempts from expedition data, fallback to command stamina
        const pairStamina = pairData.attempts || stamina;
        
        console.log(`[GardenPortfolioCurrent] Looking for heroes ${heroId1}(${typeof heroId1}), ${heroId2}(${typeof heroId2}): found ${!!hero1}, ${!!hero2}, stamina=${pairStamina}`);
        
        if (!hero1 || !hero2) {
          console.log(`[GardenPortfolioCurrent] Missing hero data for pair in pool ${pid}: heroIds=[${heroId1}, ${heroId2}]`);
          continue;
        }
        
        const pet1 = lookupPet(heroId1);
        const pet2 = lookupPet(heroId2);
        const rr1 = rrMap.get(heroId1) || rrMap.get(Number(heroId1)) || rrMap.get(String(heroId1)) || false;
        const rr2 = rrMap.get(heroId2) || rrMap.get(Number(heroId2)) || rrMap.get(String(heroId2)) || false;
        
        const h1Data = buildHeroData(hero1, pet1, rr1, pairStamina);
        const h2Data = buildHeroData(hero2, pet2, rr2, pairStamina);
        
        // Use actual iterationTime from expedition if available, otherwise fall back to modeled formula
        let pairRunsPerDay;
        if (pairData.iterationTime && pairData.iterationTime > 0) {
          // iterationTime is in seconds, convert to runs per day
          const cycleMinutes = pairData.iterationTime / 60;
          pairRunsPerDay = 1440 / cycleMinutes;
          console.log(`[GardenPortfolioCurrent] Using expedition iterationTime: ${pairData.iterationTime}s = ${cycleMinutes.toFixed(1)}min -> ${pairRunsPerDay.toFixed(2)} runs/day`);
        } else {
          // Fallback to modeled formula (min of both heroes)
          pairRunsPerDay = Math.min(h1Data.runsPerDay, h2Data.runsPerDay);
          console.log(`[GardenPortfolioCurrent] Using modeled runsPerDay: ${pairRunsPerDay.toFixed(2)} runs/day`);
        }
        
        const h1Yield = scoreHeroForPool(h1Data, pool, rewardFund, v2Share, pairStamina);
        const h2Yield = scoreHeroForPool(h2Data, pool, rewardFund, v2Share, pairStamina);
        
        const pairCrystal = (h1Yield.crystalPerRun + h2Yield.crystalPerRun) * pairRunsPerDay;
        const pairJewel = (h1Yield.jewelPerRun + h2Yield.jewelPerRun) * pairRunsPerDay;
        
        poolDailyCrystal += pairCrystal;
        poolDailyJewel += pairJewel;
        
        pairDetails.push({
          heroes: [h1Data, h2Data],
          runsPerDay: pairRunsPerDay,
          stamina: pairStamina
        });
      }
      
      const poolDailyUSD = poolDailyCrystal * prices.CRYSTAL + poolDailyJewel * prices.JEWEL;
      const totalRunsPerDay = pairDetails.reduce((sum, p) => sum + p.runsPerDay, 0);
      
      poolResults.push({
        pool,
        pairs: pairDetails,
        positionUSD,
        displayShare: totalPoolShare,  // Total pool share for display (matches position USD)
        v2Share,                        // V2 share for yield calculations
        dailyCrystal: poolDailyCrystal,
        dailyJewel: poolDailyJewel,
        dailyUSD: poolDailyUSD,
        totalRunsPerDay,
        apr: positionUSD > 0 ? (poolDailyUSD * 365 / positionUSD * 100) : 0
      });
      
      totalDailyCrystal += poolDailyCrystal;
      totalDailyJewel += poolDailyJewel;
      totalDailyUSD += poolDailyUSD;
    }
    
    poolResults.sort((a, b) => b.dailyUSD - a.dailyUSD);
    
    const totalGardeningHeroes = gardeningHeroIds.size;
    const totalPairs = poolResults.reduce((sum, p) => sum + p.pairs.length, 0);
    
    const embed = new EmbedBuilder()
      .setColor('#4CAF50')
      .setTitle('Current Garden Portfolio')
      .setTimestamp();
    
    let description = [
      `**Wallet:** \`${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}\``,
      `**Heroes Gardening:** ${totalGardeningHeroes} | **Pairs:** ${totalPairs}`,
      ``
    ];
    
    for (const result of poolResults) {
      const displayName = result.pool.name.replace(/wJEWEL/g, 'JEWEL');
      
      description.push(
        `**${displayName}** (PID ${result.pool.pid})`,
        `Position: $${result.positionUSD.toFixed(0)} | Share: ${(result.displayShare * 100).toFixed(2)}%`,
        `Daily: ${result.dailyCrystal.toFixed(2)} C + ${result.dailyJewel.toFixed(2)} J = $${result.dailyUSD.toFixed(2)}`,
        `Quest APR: ${result.apr.toFixed(1)}% | Runs/day: ${result.totalRunsPerDay.toFixed(2)}`,
        ``
      );
    }
    
    if (poolsNoLP.length > 0) {
      description.push(`---`, `**Pools Without LP Staked:** (no yield calculation)`);
      for (const noLP of poolsNoLP) {
        const displayName = noLP.poolName.replace(/wJEWEL/g, 'JEWEL');
        const heroList = noLP.heroIds.map(id => `#${id}`).join(', ');
        description.push(`${displayName} (PID ${noLP.pid}): Heroes ${heroList}`);
      }
      description.push(``);
    }
    
    description.push(
      `---`,
      `**Portfolio Totals:**`,
      `Daily: ${totalDailyCrystal.toFixed(2)} CRYSTAL + ${totalDailyJewel.toFixed(2)} JEWEL`,
      `**Daily USD: $${totalDailyUSD.toFixed(2)}** | Weekly: $${(totalDailyUSD * 7).toFixed(2)} | Monthly: $${(totalDailyUSD * 30).toFixed(2)}`
    );
    
    if (!cacheReady) {
      description.push(``, `*Note: Pool analytics still loading - yields may be incomplete*`);
    }
    
    embed.setDescription(description.join('\n'));
    
    const assignmentLines = [];
    for (const result of poolResults) {
      const displayName = result.pool.name.replace(/wJEWEL/g, 'JEWEL');
      assignmentLines.push(`**${displayName}** (PID ${result.pool.pid}):`);
      
      for (let i = 0; i < result.pairs.length; i++) {
        const pair = result.pairs[i];
        const h1 = pair.heroes[0];
        const h2 = pair.heroes[1];
        
        const h1Id = h1.hero.normalizedId || h1.hero.id;
        const h2Id = h2.hero.normalizedId || h2.hero.id;
        const h1Markers = `${h1.hasRR ? '[RR]' : ''}`;
        const h2Markers = `${h2.hasRR ? '[RR]' : ''}`;
        const h1Pet = h1.pet ? `[Pet#${h1.pet.id}]` : '';
        const h2Pet = h2.pet ? `[Pet#${h2.pet.id}]` : '';
        
        assignmentLines.push(`  P${i + 1}: #${h1Id}${h1Markers}${h1Pet} + #${h2Id}${h2Markers}${h2Pet} (${pair.stamina} stam, ${pair.runsPerDay.toFixed(2)} runs/day)`);
      }
      assignmentLines.push('');
    }
    
    for (const noLP of poolsNoLP) {
      const displayName = noLP.poolName.replace(/wJEWEL/g, 'JEWEL');
      assignmentLines.push(`**${displayName}** (PID ${noLP.pid}) [NO LP STAKED]:`);
      for (let i = 0; i < noLP.pairs.length; i++) {
        const pair = noLP.pairs[i];
        const heroStr = pair.heroIds.map(id => {
          const hero = heroMap.get(id);
          const pet = heroPetMap.get(id);
          const petStr = pet ? ` + Pet #${pet.id}` : '';
          return `Hero #${id}${petStr}`;
        }).join(' + ');
        assignmentLines.push(`  Pair ${i + 1}: ${heroStr}`);
      }
      assignmentLines.push('');
    }
    
    const assignmentEmbed = new EmbedBuilder()
      .setColor('#2196F3')
      .setTitle('Current Hero/Pet Assignments')
      .setDescription(assignmentLines.join('\n').trim() || 'No assignments');
    
    const totalPoolsWithHeroes = poolResults.length + poolsNoLP.length;
    const pricesEmbed = new EmbedBuilder()
      .setColor('#FFD700')
      .setTitle('Prices & Stats')
      .setDescription([
        `CRYSTAL: $${prices.CRYSTAL.toFixed(4)} | JEWEL: $${prices.JEWEL.toFixed(4)}`,
        ``,
        `**Total Heroes:** ${heroes.length} | **Gardening Pets:** ${[...petMap.values()].length}`,
        `**Pools with Gardening Heroes:** ${totalPoolsWithHeroes} (${poolsNoLP.length} without LP)`,
        `**Detection:** ${detectionMethod === 'expedition_api' ? 'Expedition API' : 'CurrentQuest fallback'}`
      ].join('\n'))
      .setFooter({ 
        text: `Runtime: ${((Date.now() - startTime) / 1000).toFixed(1)}s | Showing current gardening state` 
      });
    
    return interaction.editReply({ embeds: [embed, assignmentEmbed, pricesEmbed] });
    
  } catch (error) {
    console.error('[GardenPortfolioCurrent] Error:', error);
    return interaction.editReply(`Error analyzing current garden portfolio: ${error.message}`);
  }
}
