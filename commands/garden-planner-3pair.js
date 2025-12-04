import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getHeroesByOwner, getGardenPoolByPid, getUserGardenPositions } from '../onchain-data.js';
import { fetchPetsForWallet } from '../pet-data.js';
import { getQuestRewardFundBalances } from '../quest-reward-fund.js';
import { getCachedPoolAnalytics } from '../pool-cache.js';
import { getCrystalPrice, getJewelPrice, getBatchPrices, TOKEN_ADDRESSES } from '../price-feed.js';
import { getLPTokenDetails } from '../garden-analytics.js';
import { isHeroRapidRenewalActive } from '../rapid-renewal-service.js';

/**
 * Official garden pools with LP token addresses and token pair info
 */
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

/**
 * Power Surge skill IDs (gardening pets only, eggType 2)
 */
const POWER_SURGE_IDS = [90, 170]; // Rare, Mythic

/**
 * Skilled Greenskeeper skill IDs (gardening pets only, eggType 2)
 */
const SKILLED_GREENSKEEPER_IDS = [7, 86, 166]; // Common, Rare, Mythic

/**
 * Normalize pet ID by removing realm prefix if present
 */
function normalizePetId(petId) {
  const idStr = String(petId);
  if (idStr.length > 7 && (idStr.startsWith('1000000') || idStr.startsWith('2000000'))) {
    return idStr.slice(7);
  }
  return idStr;
}

/**
 * Calculate hero gardening factor
 * Formula: 0.1 + (WIS+VIT)/1222.22 + GrdSkl/244.44
 */
function calculateHeroFactor(hero, additionalGrdSkill = 0) {
  const WIS = hero.wisdom || 0;
  const VIT = hero.vitality || 0;
  const rawGrdSkill = (hero.gardening || 0) / 10; // API returns 0-100, formula uses 0-10
  const GrdSkl = rawGrdSkill + additionalGrdSkill;
  
  return 0.1 + (WIS + VIT) / 1222.22 + GrdSkl / 244.44;
}

/**
 * Calculate yield per stamina spent using full DFK formula
 */
function calculateYieldPerStamina({ 
  heroFactor, 
  hasGardeningGene, 
  gardeningSkill = 0,
  rewardPool, 
  poolAllocation, 
  lpOwned,
  petMultiplier = 1.0
}) {
  const annealingFactor = 1.0;
  const geneBonus = hasGardeningGene ? 1 : 0;
  
  const grdSkillForFormula = gardeningSkill / 10;
  const rewardModBase = grdSkillForFormula >= 10 ? 72 : 144;
  const divisor = (300 - (50 * geneBonus)) * rewardModBase;
  
  const earnRatePerStam = annealingFactor * (rewardPool * poolAllocation * lpOwned * heroFactor) / divisor;
  
  return earnRatePerStam * petMultiplier;
}

/**
 * Determine pet skill type
 */
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

/**
 * Score a hero-pet pairing for gardening effectiveness
 */
function scoreHeroPetPairing(hero, pet) {
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
  const geneMultiplier = hasGardeningGene ? 1.2 : 1.0; // Gene bonus effect approximation
  const level = hero.level || 1;
  
  // Effective score considers heroFactor, pet multiplier, gene, and level
  const effectiveScore = heroFactor * petMultiplier * geneMultiplier * Math.sqrt(level);
  
  return {
    hero,
    pet,
    heroFactor,
    petMultiplier,
    petBonus,
    skillType,
    effectiveScore,
    hasGardeningGene,
    gardeningSkill: hero.gardening || 0
  };
}

/**
 * Find top 6 unique hero-pet pairings (3 pairs = 6 heroes)
 */
function findTop6HeroPetPairings(heroes, gardeningPets) {
  const pairings = [];
  const usedHeroIds = new Set();
  const usedPetIds = new Set();
  
  // Score all possible hero-pet combinations
  const allCombos = [];
  
  for (const hero of heroes) {
    // Hero without pet
    allCombos.push(scoreHeroPetPairing(hero, null));
    
    // Hero with each available gardening pet
    for (const pet of gardeningPets) {
      const skillInfo = getPetGardenSkillType(pet);
      if (skillInfo) {
        allCombos.push(scoreHeroPetPairing(hero, pet));
      }
    }
  }
  
  // Sort by effectiveness
  allCombos.sort((a, b) => b.effectiveScore - a.effectiveScore);
  
  // Greedily pick top 6 unique heroes with their best pets
  for (const combo of allCombos) {
    if (usedHeroIds.has(combo.hero.id)) continue;
    if (combo.pet && usedPetIds.has(combo.pet.id)) continue;
    
    pairings.push(combo);
    usedHeroIds.add(combo.hero.id);
    if (combo.pet) usedPetIds.add(combo.pet.id);
    
    if (pairings.length >= 6) break;
  }
  
  return pairings;
}

/**
 * Get pool data with TVL and allocation info
 */
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
      const allocPercent = parseFloat(poolDetails.allocPercent) || 0;
      
      pools.push({
        pid: poolInfo.pid,
        name: poolInfo.name,
        lpToken: poolInfo.lpToken,
        tokens: poolInfo.tokens,
        totalStakedRaw,
        totalStaked: poolDetails.totalStaked,
        tvl,
        allocPercent,
        allocDecimal: allocPercent / 100
      });
    } catch (err) {
      console.error(`[GardenPlanner3Pair] Error getting pool ${poolInfo.pid}:`, err.message);
    }
  }
  
  return pools;
}

/**
 * Get token prices from price-feed module
 */
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
    
    // Discover BTC price from BTC.b-USDC pool
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
    } catch (e) {
      console.warn('[GardenPlanner3Pair] Could not get BTC price from LP:', e.message);
    }
    
    // Discover KAIA price from CRYSTAL-KLAY pool
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
    } catch (e) {
      console.warn('[GardenPlanner3Pair] Could not get KAIA price from LP:', e.message);
    }
    
    // xJEWEL ≈ JEWEL
    prices.xJEWEL = prices.JEWEL;
    
    return prices;
  } catch (err) {
    console.error('[GardenPlanner3Pair] Error getting prices:', err.message);
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
  .setName('garden-planner-3pair')
  .setDescription('Compare pools using your 6 best unique hero/pet combos (realistic 3-pair setup)')
  .addStringOption(option =>
    option.setName('wallet')
      .setDescription('Wallet address')
      .setRequired(true)
  )
  .addNumberOption(option =>
    option.setName('deposit_usd')
      .setDescription('USD amount to invest in LP')
      .setRequired(true)
      .setMinValue(1)
  )
  .addIntegerOption(option =>
    option.setName('stamina')
      .setDescription('Stamina per run (default: 25)')
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
    const depositUSD = interaction.options.getNumber('deposit_usd');
    const stamina = interaction.options.getInteger('stamina') || 25;
    
    console.log(`[GardenPlanner3Pair] Analyzing wallet ${walletAddress}, deposit=$${depositUSD}, stamina=${stamina}...`);
    
    // Fetch all data in parallel
    const [heroes, pets, allPools, prices, rewardFund, existingPositions] = await Promise.all([
      getHeroesByOwner(walletAddress),
      fetchPetsForWallet(walletAddress),
      getAllPoolsData(),
      getTokenPrices(),
      getQuestRewardFundBalances(),
      getUserGardenPositions(walletAddress, 'dfk')
    ]);
    
    // Filter out pid 0
    const pools = allPools.filter(p => p.pid !== 0);
    
    // Build map of existing positions
    const existingByPid = new Map();
    for (const pos of (existingPositions || [])) {
      existingByPid.set(pos.pid, pos);
    }
    
    if (!heroes || heroes.length === 0) {
      return interaction.editReply('No heroes found for this wallet. A wallet with heroes is required to calculate yields.');
    }
    
    if (heroes.length < 6) {
      return interaction.editReply(`You need at least 6 heroes to run 3 pairs. Found: ${heroes.length} heroes.`);
    }
    
    if (!pools || pools.length === 0) {
      return interaction.editReply('Could not fetch pool data. Please try again later.');
    }
    
    // Check if cache is ready
    const poolsWithTVL = pools.filter(p => p.tvl > 0);
    if (poolsWithTVL.length === 0) {
      console.log('[GardenPlanner3Pair] Cache not ready - no pools have TVL data yet');
      const runtime = ((Date.now() - startTime) / 1000).toFixed(1);
      return interaction.editReply(
        '**Pool analytics are still loading...**\n\n' +
        'The garden data cache is warming up after a recent restart. ' +
        'Please check back in **2-3 minutes** and try again.\n\n' +
        `*This only happens right after the bot restarts. (${runtime}s)*`
      );
    }
    
    // Filter for gardening pets
    const gardeningPets = (pets || []).filter(p => p.eggType === 2);
    
    // Find top 6 unique hero-pet pairings
    const top6 = findTop6HeroPetPairings(heroes, gardeningPets);
    
    if (top6.length < 6) {
      return interaction.editReply(`Could only find ${top6.length} valid hero-pet pairings. Need 6 for 3 pairs.`);
    }
    
    // Check Rapid Renewal for each hero in parallel
    const rrChecks = await Promise.all(
      top6.map(p => isHeroRapidRenewalActive(walletAddress, p.hero.id))
    );
    top6.forEach((p, i) => { p.hasRR = rrChecks[i]; });
    
    // Group into 3 pairs
    const pairs = [
      { heroes: [top6[0], top6[1]], pairNum: 1 },
      { heroes: [top6[2], top6[3]], pairNum: 2 },
      { heroes: [top6[4], top6[5]], pairNum: 3 }
    ];
    
    // Calculate per-hero stats: runs/day (theoretical), yields per run
    for (const pairing of top6) {
      const hasGene = pairing.hasGardeningGene;
      const questMinPerStam = hasGene ? 10 : 12;
      let regenMinPerStam = 20;
      if (pairing.hasRR) {
        const regenSeconds = Math.max(300, 1200 - (pairing.hero.level * 3));
        regenMinPerStam = regenSeconds / 60;
      }
      const cycleMinutes = stamina * (questMinPerStam + regenMinPerStam);
      pairing.runsPerDay = 1440 / cycleMinutes;
      pairing.cycleMinutes = cycleMinutes;
      
      // Binary gene bonus for divisor calculation
      const geneBonus = hasGene ? 1 : 0;
      const grdSkillForFormula = pairing.gardeningSkill / 10;
      const rewardModBase = grdSkillForFormula >= 10 ? 72 : 144;
      pairing.divisor = (300 - (50 * geneBonus)) * rewardModBase;
    }
    
    // For gardening pairs, both heroes quest together
    // Pair run rate is limited by the SLOWER hero's cycle time
    // Calculate per-pair run rates
    for (const pair of pairs) {
      const h1 = pair.heroes[0];
      const h2 = pair.heroes[1];
      pair.runsPerDay = Math.min(h1.runsPerDay, h2.runsPerDay);
    }
    
    // Total runs/day = sum of 3 pairs' run rates
    const totalRunsPerDay = pairs.reduce((sum, p) => sum + p.runsPerDay, 0);
    
    console.log(`[GardenPlanner3Pair] Top 6 heroes: ${top6.map(p => `#${p.hero.id}`).join(', ')}`);
    console.log(`[GardenPlanner3Pair] Total runs/day: ${totalRunsPerDay.toFixed(2)} (6 heroes)`);
    
    // Count gardening gene heroes for stats
    const gardeningGeneCount = top6.filter(p => p.hasGardeningGene).length;
    
    // Calculate yields for each pool using per-hero stats (summed, not averaged)
    const poolResults = [];
    
    for (const pool of pools) {
      // Calculate existing position value
      const existingPos = existingByPid.get(pool.pid);
      let existingUSD = 0;
      if (existingPos && pool.tvl > 0 && pool.totalStakedRaw > 0n) {
        const userLPRaw = BigInt(existingPos.stakedAmountRaw || 0);
        const totalStakedRaw = BigInt(pool.totalStakedRaw);
        if (totalStakedRaw > 0n) {
          existingUSD = (Number(userLPRaw) / Number(totalStakedRaw)) * pool.tvl;
        }
      }
      
      const currentTVL = pool.tvl || 0;
      const afterTVL = currentTVL + depositUSD;
      const totalPosition = existingUSD + depositUSD;
      const lpShare = afterTVL > 0 ? totalPosition / afterTVL : 0;
      
      // Sum daily yields from all 3 pairs (each pair runs at slower hero's rate)
      // Per run, both heroes in the pair contribute their yields
      let dailyCrystalBase = 0;
      let dailyJewelBase = 0;
      let dailyCrystalPet = 0;
      let dailyJewelPet = 0;
      
      for (const pair of pairs) {
        const h1 = pair.heroes[0];
        const h2 = pair.heroes[1];
        const pairRunsPerDay = pair.runsPerDay;
        
        // Calculate per-run yields for each hero in the pair
        // Hero 1 yields
        const h1BaseHeroFactor = calculateHeroFactor(h1.hero);
        const h1CrystalBase = (rewardFund.crystalPool * pool.allocDecimal * lpShare * h1BaseHeroFactor * stamina) / h1.divisor;
        const h1JewelBase = (rewardFund.jewelPool * pool.allocDecimal * lpShare * h1BaseHeroFactor * stamina) / h1.divisor;
        const h1CrystalPet = (rewardFund.crystalPool * pool.allocDecimal * lpShare * h1.heroFactor * h1.petMultiplier * stamina) / h1.divisor;
        const h1JewelPet = (rewardFund.jewelPool * pool.allocDecimal * lpShare * h1.heroFactor * h1.petMultiplier * stamina) / h1.divisor;
        
        // Hero 2 yields
        const h2BaseHeroFactor = calculateHeroFactor(h2.hero);
        const h2CrystalBase = (rewardFund.crystalPool * pool.allocDecimal * lpShare * h2BaseHeroFactor * stamina) / h2.divisor;
        const h2JewelBase = (rewardFund.jewelPool * pool.allocDecimal * lpShare * h2BaseHeroFactor * stamina) / h2.divisor;
        const h2CrystalPet = (rewardFund.crystalPool * pool.allocDecimal * lpShare * h2.heroFactor * h2.petMultiplier * stamina) / h2.divisor;
        const h2JewelPet = (rewardFund.jewelPool * pool.allocDecimal * lpShare * h2.heroFactor * h2.petMultiplier * stamina) / h2.divisor;
        
        // Per run, pair produces sum of both heroes' yields
        // Daily = pair's yields per run × pair's runs per day
        dailyCrystalBase += (h1CrystalBase + h2CrystalBase) * pairRunsPerDay;
        dailyJewelBase += (h1JewelBase + h2JewelBase) * pairRunsPerDay;
        dailyCrystalPet += (h1CrystalPet + h2CrystalPet) * pairRunsPerDay;
        dailyJewelPet += (h1JewelPet + h2JewelPet) * pairRunsPerDay;
      }
      
      poolResults.push({
        pid: pool.pid,
        name: pool.name,
        tvl: currentTVL,
        afterTVL,
        allocPercent: pool.allocPercent,
        lpShare,
        totalPositionUSD: totalPosition,
        dailyCrystal: dailyCrystalBase,
        dailyJewel: dailyJewelBase,
        dailyCrystalPet: dailyCrystalPet,
        dailyJewelPet: dailyJewelPet
      });
    }
    
    // Calculate APR for each pool using summed daily yields
    poolResults.forEach(p => {
      const dailyYieldUSD = p.dailyCrystalPet * prices.CRYSTAL + p.dailyJewelPet * prices.JEWEL;
      p.apr = (dailyYieldUSD * 365) / p.totalPositionUSD * 100;
      p.dailyYieldUSD = dailyYieldUSD;
    });
    
    // Sort by APR
    poolResults.sort((a, b) => b.apr - a.apr);
    
    // Build hero pairs summary with per-pair run rates
    // Pair run rate = min of the two heroes (limited by slower hero)
    const pairsSummary = pairs.map(pair => {
      const h1 = pair.heroes[0];
      const h2 = pair.heroes[1];
      const h1Label = `#${h1.hero.id} Lv${h1.hero.level}${h1.hasGardeningGene ? '[G]' : ''}${h1.hasRR ? '[RR]' : ''}`;
      const h2Label = `#${h2.hero.id} Lv${h2.hero.level}${h2.hasGardeningGene ? '[G]' : ''}${h2.hasRR ? '[RR]' : ''}`;
      const p1 = h1.pet ? `+Pet(${h1.petBonus}%)` : '';
      const p2 = h2.pet ? `+Pet(${h2.petBonus}%)` : '';
      // Pair run rate is limited by slower hero
      const pairRuns = pair.runsPerDay.toFixed(2);
      return `P${pair.pairNum}: ${h1Label}${p1} + ${h2Label}${p2} = ${pairRuns} runs/day`;
    }).join('\n');
    
    // Build main embed
    const embed = new EmbedBuilder()
      .setColor('#00FF88')
      .setTitle('Garden Investment Planner (3-Pair Mode)')
      .setTimestamp();
    
    // Build table rows with daily yields (summed from all 6 heroes)
    const tableRows = poolResults.map(p => {
      const displayName = p.name.replace(/wJEWEL/g, 'JEWEL');
      const poolStr = displayName.padEnd(13).slice(0, 13);
      const shareStr = `${(p.lpShare * 100).toFixed(2)}%`.padStart(6);
      const baseStr = `${p.dailyCrystal.toFixed(2)}C ${p.dailyJewel.toFixed(2)}J`.padStart(14);
      const petStr = `${p.dailyCrystalPet.toFixed(2)}C ${p.dailyJewelPet.toFixed(2)}J`.padStart(14);
      const aprStr = `${p.apr.toFixed(1)}%`.padStart(6);
      
      return `${poolStr}|${shareStr}|${baseStr}|${petStr}|${aprStr}`;
    }).join('\n');
    
    embed.setDescription([
      `**Deposit:** $${depositUSD.toLocaleString()} | **Stamina:** ${stamina} | **6 Heroes** | **Runs/Day:** ${totalRunsPerDay.toFixed(1)}`,
      ``,
      `**Your Best 3 Pairs (6 unique heroes):**`,
      `\`\`\`${pairsSummary}\`\`\``,
      ``,
      `\`\`\``,
      `Pool         | Share| Daily C/J   | +Pets C/J   |  APR`,
      `-------------|------|-------------|-------------|------`,
      tableRows,
      `\`\`\``
    ].join('\n'));
    
    // Build prices embed
    const crystalPoolNum = Number(rewardFund.crystalPool);
    const jewelPoolNum = Number(rewardFund.jewelPool);
    
    // Best pool daily yield summary
    const bestPool = poolResults[0];
    const bestDailyUSD = bestPool ? `$${bestPool.dailyYieldUSD.toFixed(2)}/day` : 'N/A';
    
    const pricesEmbed = new EmbedBuilder()
      .setColor('#FFD700')
      .setTitle('Token Prices & Yields')
      .setDescription([
        `**Token Prices:**`,
        `CRYSTAL: $${prices.CRYSTAL.toFixed(4)} | JEWEL: $${prices.JEWEL.toFixed(4)}`,
        ``,
        `**Team Stats:** ${gardeningGeneCount}/6 with Gardening Gene`,
        `**Best Pool Daily Yield:** ${bestDailyUSD} (${bestPool?.name.replace(/wJEWEL/g, 'JEWEL') || 'N/A'})`,
        ``,
        `**Reward Fund:** ${(crystalPoolNum/1e6).toFixed(2)}M CRYSTAL | ${(jewelPoolNum/1e3).toFixed(0)}K JEWEL`
      ].join('\n'))
      .setFooter({ 
        text: `Runtime: ${((Date.now() - startTime) / 1000).toFixed(1)}s | Daily yields summed from 6 heroes` 
      });
    
    console.log(`[GardenPlanner3Pair] Generated comparison for ${poolResults.length} pools in ${((Date.now() - startTime) / 1000).toFixed(1)}s`);
    
    return interaction.editReply({ embeds: [embed, pricesEmbed] });
    
  } catch (error) {
    console.error('[GardenPlanner3Pair] Error:', error);
    return interaction.editReply(`Error analyzing gardens: ${error.message}`);
  }
}
