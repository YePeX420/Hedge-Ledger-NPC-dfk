import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getAllHeroesByOwner, getGardenPoolByPid, getUserGardenPositions } from '../onchain-data.js';
import { fetchPetsForWallet } from '../pet-data.js';
import { getQuestRewardFundBalances } from '../quest-reward-fund.js';
import { getCachedPoolAnalytics } from '../pool-cache.js';
import { getCrystalPrice, getJewelPrice, getBatchPrices, TOKEN_ADDRESSES } from '../price-feed.js';
import { getLPTokenDetails } from '../garden-analytics.js';
import { isHeroRapidRenewalActive } from '../rapid-renewal-service.js';

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
  const geneMultiplier = hasGardeningGene ? 1.2 : 1.0;
  const level = hero.level || 1;
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

function scoreHeroForPool(pairing, pool, rewardFund, lpShare, stamina) {
  const hasGene = pairing.hasGardeningGene;
  const grdSkillForFormula = pairing.gardeningSkill / 10;
  const rewardModBase = grdSkillForFormula >= 10 ? 72 : 144;
  const geneBonus = hasGene ? 1 : 0;
  const divisor = (300 - (50 * geneBonus)) * rewardModBase;
  
  const crystalPerRun = (rewardFund.crystalPool * pool.allocDecimal * lpShare * pairing.heroFactor * pairing.petMultiplier * stamina) / divisor;
  const jewelPerRun = (rewardFund.jewelPool * pool.allocDecimal * lpShare * pairing.heroFactor * pairing.petMultiplier * stamina) / divisor;
  
  return { crystalPerRun, jewelPerRun, divisor };
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
      console.error(`[GardenPortfolio3Pair] Error getting pool ${poolInfo.pid}:`, err.message);
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
    console.error('[GardenPortfolio3Pair] Error getting prices:', err.message);
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
  .setName('garden-portfolio-3pair')
  .setDescription('Optimize hero/pet assignments across ALL your garden LP positions (3-pair per pool)')
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
    
    console.log(`[GardenPortfolio3Pair] Analyzing wallet ${walletAddress}, stamina=${stamina}...`);
    
    const [allHeroes, pets, allPools, prices, rewardFund, existingPositions] = await Promise.all([
      getAllHeroesByOwner(walletAddress),
      fetchPetsForWallet(walletAddress),
      getAllPoolsData(),
      getTokenPrices(),
      getQuestRewardFundBalances(),
      getUserGardenPositions(walletAddress, 'dfk')
    ]);
    
    // Filter to Crystalvale heroes only (network='dfk' or ID with 2e12 prefix)
    const heroes = (allHeroes || []).filter(hero => {
      // Check network field if available
      if (hero.network === 'dfk') return true;
      // Fallback: check ID prefix (2e12 = Crystalvale)
      const heroId = Number(hero.id);
      return heroId >= 2_000_000_000_000 && heroId < 3_000_000_000_000;
    });
    
    console.log(`[GardenPortfolio3Pair] Filtered to ${heroes.length} Crystalvale heroes (from ${allHeroes?.length || 0} total)`);
    
    const pools = allPools.filter(p => p.pid !== 0);
    
    const existingByPid = new Map();
    for (const pos of (existingPositions || [])) {
      existingByPid.set(pos.pid, pos);
    }
    
    const poolsWithLP = pools.filter(pool => {
      const pos = existingByPid.get(pool.pid);
      return pos && BigInt(pos.stakedAmountRaw || 0) > 0n;
    });
    
    if (poolsWithLP.length === 0) {
      return interaction.editReply('No LP positions found in any garden pools. Stake LP tokens first to use this tool.');
    }
    
    if (!heroes || heroes.length === 0) {
      return interaction.editReply('No Crystalvale heroes found for this wallet. This optimizer only works with DFK Chain heroes.');
    }
    
    const poolsWithTVL = pools.filter(p => p.tvl > 0);
    if (poolsWithTVL.length === 0) {
      const runtime = ((Date.now() - startTime) / 1000).toFixed(1);
      return interaction.editReply(
        '**Pool analytics are still loading...**\n\n' +
        'Please check back in **2-3 minutes** and try again.\n\n' +
        `*This only happens right after the bot restarts. (${runtime}s)*`
      );
    }
    
    const gardeningPets = (pets || []).filter(p => p.eggType === 2);
    
    // CRITICAL FIX: Check RR status for ALL heroes BEFORE sorting/selection
    // This ensures RR heroes get prioritized in scoring (RR = 3x more runs/day)
    console.log(`[GardenPortfolio3Pair] Checking RR status for ${heroes.length} heroes...`);
    const rrChecks = await Promise.all(
      heroes.map(hero => isHeroRapidRenewalActive(walletAddress, hero.id))
    );
    const heroRRMap = new Map();
    heroes.forEach((hero, i) => {
      heroRRMap.set(hero.id, rrChecks[i]);
    });
    const rrCount = rrChecks.filter(Boolean).length;
    console.log(`[GardenPortfolio3Pair] Found ${rrCount} heroes with Rapid Renewal active`);
    
    // Helper to calculate runsPerDay for a hero (with RR consideration)
    function calculateRunsPerDay(hero, hasGardeningGene) {
      const hasRR = heroRRMap.get(hero.id) || false;
      const questMinPerStam = hasGardeningGene ? 10 : 12;
      let regenMinPerStam = 20;
      if (hasRR) {
        const regenSeconds = Math.max(300, 1200 - (hero.level * 3));
        regenMinPerStam = regenSeconds / 60;
      }
      const cycleMinutes = stamina * (questMinPerStam + regenMinPerStam);
      return 1440 / cycleMinutes;
    }
    
    const allPairings = [];
    const usedHeroIds = new Set();
    const usedPetIds = new Set();
    
    // Create all hero-pet combos with RR-aware scoring
    const allCombos = [];
    for (const hero of heroes) {
      const noPetCombo = scoreHeroPetPairing(hero, null);
      noPetCombo.hasRR = heroRRMap.get(hero.id) || false;
      noPetCombo.runsPerDay = calculateRunsPerDay(hero, noPetCombo.hasGardeningGene);
      // RR-adjusted score: effectiveScore * runsPerDay (RR heroes run 3x more)
      noPetCombo.adjustedScore = noPetCombo.effectiveScore * noPetCombo.runsPerDay;
      allCombos.push(noPetCombo);
      
      for (const pet of gardeningPets) {
        const skillInfo = getPetGardenSkillType(pet);
        if (skillInfo) {
          const petCombo = scoreHeroPetPairing(hero, pet);
          petCombo.hasRR = heroRRMap.get(hero.id) || false;
          petCombo.runsPerDay = calculateRunsPerDay(hero, petCombo.hasGardeningGene);
          petCombo.adjustedScore = petCombo.effectiveScore * petCombo.runsPerDay;
          allCombos.push(petCombo);
        }
      }
    }
    
    // CRITICAL: Sort by RR-adjusted score (effectiveScore * runsPerDay)
    // This prioritizes RR heroes because they produce 3x more runs/day
    allCombos.sort((a, b) => b.adjustedScore - a.adjustedScore);
    
    for (const combo of allCombos) {
      if (usedHeroIds.has(combo.hero.id)) continue;
      if (combo.pet && usedPetIds.has(combo.pet.id)) continue;
      
      allPairings.push(combo);
      usedHeroIds.add(combo.hero.id);
      if (combo.pet) usedPetIds.add(combo.pet.id);
    }
    
    console.log(`[GardenPortfolio3Pair] Prepared ${allPairings.length} hero-pet pairings (RR-weighted scoring)`);
    
    // Calculate remaining fields for each pairing (runsPerDay already set, but ensure consistency)
    for (const pairing of allPairings) {
      const hasGene = pairing.hasGardeningGene;
      const questMinPerStam = hasGene ? 10 : 12;
      let regenMinPerStam = 20;
      if (pairing.hasRR) {
        const regenSeconds = Math.max(300, 1200 - (pairing.hero.level * 3));
        regenMinPerStam = regenSeconds / 60;
      }
      const cycleMinutes = stamina * (questMinPerStam + regenMinPerStam);
      pairing.cycleMinutes = cycleMinutes;
      // Ensure runsPerDay is set (should already be, but safety check)
      if (!pairing.runsPerDay) {
        pairing.runsPerDay = 1440 / cycleMinutes;
      }
      
      const grdSkillForFormula = pairing.gardeningSkill / 10;
      const rewardModBase = grdSkillForFormula >= 10 ? 72 : 144;
      const geneBonus = hasGene ? 1 : 0;
      pairing.divisor = (300 - (50 * geneBonus)) * rewardModBase;
    }
    
    // Score each hero-pairing for each pool to find per-pool yields
    // This determines which heroes work best in which pools
    const poolYieldPotentials = [];
    for (const pool of poolsWithLP) {
      const pos = existingByPid.get(pool.pid);
      const userLPRaw = BigInt(pos.stakedAmountRaw || 0);
      const totalStakedRaw = BigInt(pool.totalStakedRaw);
      
      // Two-share system: total pool share for position USD, V2 share for yields
      // Fetch LP token total supply for accurate position value
      let lpTotalSupply = 0n;
      try {
        const lpDetails = await getLPTokenDetails(pool.lpToken);
        if (lpDetails?.totalSupply) {
          lpTotalSupply = BigInt(lpDetails.totalSupply);
        }
      } catch (err) {
        console.log(`[GardenPortfolio3Pair] Failed to get LP totalSupply for ${pool.name}, using V2 share for position`);
      }
      
      // V2 share = user LP / V2 total staked (for yield calculations)
      const v2Share = totalStakedRaw > 0n ? Number(userLPRaw) / Number(totalStakedRaw) : 0;
      
      // Total pool share = user LP / LP totalSupply (for position USD display)
      const totalPoolShare = lpTotalSupply > 0n ? Number(userLPRaw) / Number(lpTotalSupply) : v2Share;
      
      // Position USD uses total pool share (your share of total LP)
      const positionUSD = totalPoolShare * pool.tvl;
      
      // Score ALL heroes for THIS specific pool (using V2 share for yield calculations)
      const heroScoresForPool = allPairings.map(pairing => {
        const { crystalPerRun, jewelPerRun } = scoreHeroForPool(pairing, pool, rewardFund, v2Share, stamina);
        const dailyCrystal = crystalPerRun * pairing.runsPerDay;
        const dailyJewel = jewelPerRun * pairing.runsPerDay;
        const dailyUSD = dailyCrystal * prices.CRYSTAL + dailyJewel * prices.JEWEL;
        return {
          pairing,
          dailyUSD,
          dailyCrystal,
          dailyJewel
        };
      });
      
      // Sort by yield in THIS pool (not global effectiveScore)
      heroScoresForPool.sort((a, b) => b.dailyUSD - a.dailyUSD);
      
      // Best hero's yield in this pool determines pool priority
      const bestHeroYieldUSD = heroScoresForPool[0]?.dailyUSD || 0;
      
      poolYieldPotentials.push({
        pool,
        v2Share,              // V2 share for yield calculations
        displayShare: totalPoolShare,  // Total pool share for display (matches position USD)
        positionUSD,
        bestHeroYieldUSD,
        heroScoresForPool,
        assignedPairs: []
      });
    }
    
    // Sort pools by best-hero yield potential (highest first)
    poolYieldPotentials.sort((a, b) => b.bestHeroYieldUSD - a.bestHeroYieldUSD);
    
    console.log(`[GardenPortfolio3Pair] Pool yield potentials (sorted by per-pool best hero):`, 
      poolYieldPotentials.map(p => `${p.pool.name}: $${p.bestHeroYieldUSD.toFixed(4)}/day`).join(', '));
    
    // Greedy allocation: assign best heroes FOR EACH POOL based on per-pool yield scores
    const assignedHeroIds = new Set();
    const PAIRS_PER_POOL = 3;
    const HEROES_PER_POOL = PAIRS_PER_POOL * 2;
    
    for (const poolData of poolYieldPotentials) {
      // Get available heroes sorted by their yield IN THIS POOL (not global)
      const availableForPool = poolData.heroScoresForPool
        .filter(s => !assignedHeroIds.has(s.pairing.hero.id))
        .slice(0, HEROES_PER_POOL);
      
      if (availableForPool.length < 2) {
        console.log(`[GardenPortfolio3Pair] Not enough heroes left for ${poolData.pool.name}`);
        continue;
      }
      
      // Build pairs from best available heroes for this pool
      for (let i = 0; i < availableForPool.length; i += 2) {
        if (i + 1 >= availableForPool.length) break;
        
        const h1 = availableForPool[i].pairing;
        const h2 = availableForPool[i + 1].pairing;
        
        const pairRunsPerDay = Math.min(h1.runsPerDay, h2.runsPerDay);
        
        poolData.assignedPairs.push({
          heroes: [h1, h2],
          runsPerDay: pairRunsPerDay
        });
        
        assignedHeroIds.add(h1.hero.id);
        assignedHeroIds.add(h2.hero.id);
      }
      
      console.log(`[GardenPortfolio3Pair] Assigned ${poolData.assignedPairs.length} pairs to ${poolData.pool.name} (per-pool optimized)`);
    }
    
    const poolResults = [];
    let totalDailyCrystal = 0;
    let totalDailyJewel = 0;
    let totalDailyUSD = 0;
    
    for (const poolData of poolYieldPotentials) {
      if (poolData.assignedPairs.length === 0) continue;
      
      const pool = poolData.pool;
      const v2Share = poolData.v2Share;  // Use V2 share for yield calculations
      
      let poolDailyCrystal = 0;
      let poolDailyJewel = 0;
      
      for (const pair of poolData.assignedPairs) {
        const h1 = pair.heroes[0];
        const h2 = pair.heroes[1];
        const pairRunsPerDay = pair.runsPerDay;
        
        const h1Yield = scoreHeroForPool(h1, pool, rewardFund, v2Share, stamina);
        const h2Yield = scoreHeroForPool(h2, pool, rewardFund, v2Share, stamina);
        
        poolDailyCrystal += (h1Yield.crystalPerRun + h2Yield.crystalPerRun) * pairRunsPerDay;
        poolDailyJewel += (h1Yield.jewelPerRun + h2Yield.jewelPerRun) * pairRunsPerDay;
      }
      
      const poolDailyUSD = poolDailyCrystal * prices.CRYSTAL + poolDailyJewel * prices.JEWEL;
      const totalRunsPerDay = poolData.assignedPairs.reduce((sum, p) => sum + p.runsPerDay, 0);
      
      poolResults.push({
        pool,
        pairs: poolData.assignedPairs,
        positionUSD: poolData.positionUSD,
        displayShare: poolData.displayShare,  // Total pool share for display (matches position USD)
        v2Share,                               // V2 share for yield calculations
        dailyCrystal: poolDailyCrystal,
        dailyJewel: poolDailyJewel,
        dailyUSD: poolDailyUSD,
        totalRunsPerDay,
        apr: poolData.positionUSD > 0 ? (poolDailyUSD * 365 / poolData.positionUSD * 100) : 0
      });
      
      totalDailyCrystal += poolDailyCrystal;
      totalDailyJewel += poolDailyJewel;
      totalDailyUSD += poolDailyUSD;
    }
    
    poolResults.sort((a, b) => b.dailyUSD - a.dailyUSD);
    
    const totalAssignedHeroes = assignedHeroIds.size;
    const totalPairs = poolResults.reduce((sum, p) => sum + p.pairs.length, 0);
    
    const embed = new EmbedBuilder()
      .setColor('#00FFAA')
      .setTitle('Garden Portfolio Optimizer (3-Pair Mode)')
      .setTimestamp();
    
    let description = [
      `**Wallet:** \`${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}\``,
      `**Stamina:** ${stamina} | **Heroes Assigned:** ${totalAssignedHeroes} | **Pairs:** ${totalPairs}`,
      ``
    ];
    
    for (const result of poolResults) {
      const displayName = result.pool.name.replace(/wJEWEL/g, 'JEWEL');
      
      const pairLines = result.pairs.map((pair, idx) => {
        const h1 = pair.heroes[0];
        const h2 = pair.heroes[1];
        const h1Label = `#${h1.hero.id}${h1.hasGardeningGene ? '[G]' : ''}${h1.hasRR ? '[RR]' : ''}`;
        const h2Label = `#${h2.hero.id}${h2.hasGardeningGene ? '[G]' : ''}${h2.hasRR ? '[RR]' : ''}`;
        const p1 = h1.pet ? `+${h1.petBonus}%` : '';
        const p2 = h2.pet ? `+${h2.petBonus}%` : '';
        return `  P${idx + 1}: ${h1Label}${p1} + ${h2Label}${p2} (${pair.runsPerDay.toFixed(2)} runs/day)`;
      }).join('\n');
      
      description.push(
        `**${displayName}** (PID ${result.pool.pid})`,
        `Position: $${result.positionUSD.toFixed(0)} | Share: ${(result.displayShare * 100).toFixed(2)}%`,
        `Daily: ${result.dailyCrystal.toFixed(2)} C + ${result.dailyJewel.toFixed(2)} J = $${result.dailyUSD.toFixed(2)}`,
        `APR: ${result.apr.toFixed(1)}% | Runs/day: ${result.totalRunsPerDay.toFixed(2)}`,
        `\`\`\`${pairLines}\`\`\``,
        ``
      );
    }
    
    description.push(
      `---`,
      `**Portfolio Totals:**`,
      `Daily: ${totalDailyCrystal.toFixed(2)} CRYSTAL + ${totalDailyJewel.toFixed(2)} JEWEL`,
      `**Daily USD: $${totalDailyUSD.toFixed(2)}** | Weekly: $${(totalDailyUSD * 7).toFixed(2)} | Monthly: $${(totalDailyUSD * 30).toFixed(2)}`
    );
    
    embed.setDescription(description.join('\n'));
    
    const assignmentLines = [];
    for (const result of poolResults) {
      const displayName = result.pool.name.replace(/wJEWEL/g, 'JEWEL');
      assignmentLines.push(`**${displayName}** (PID ${result.pool.pid}):`);
      
      for (let i = 0; i < result.pairs.length; i++) {
        const pair = result.pairs[i];
        const h1 = pair.heroes[0];
        const h2 = pair.heroes[1];
        
        const h1Id = h1.hero.id;
        const h2Id = h2.hero.id;
        const h1Pet = h1.pet ? ` + Pet #${h1.pet.id}` : '';
        const h2Pet = h2.pet ? ` + Pet #${h2.pet.id}` : '';
        
        assignmentLines.push(`  Pair ${i + 1}: Hero #${h1Id}${h1Pet} + Hero #${h2Id}${h2Pet}`);
      }
      assignmentLines.push('');
    }
    
    const assignmentEmbed = new EmbedBuilder()
      .setColor('#2196F3')
      .setTitle('Recommended Hero/Pet Assignments')
      .setDescription(assignmentLines.join('\n').trim() || 'No assignments');
    
    const pricesEmbed = new EmbedBuilder()
      .setColor('#FFD700')
      .setTitle('Prices & Stats')
      .setDescription([
        `CRYSTAL: $${prices.CRYSTAL.toFixed(4)} | JEWEL: $${prices.JEWEL.toFixed(4)}`,
        ``,
        `**Available Heroes:** ${heroes.length} total, ${allPairings.filter(p => p.hasGardeningGene).length} with Gardening gene`,
        `**Gardening Pets:** ${gardeningPets.length} available`,
        `**Pools with LP:** ${poolsWithLP.length}`
      ].join('\n'))
      .setFooter({ 
        text: `Runtime: ${((Date.now() - startTime) / 1000).toFixed(1)}s | Best heroes assigned to highest-yield pools first` 
      });
    
    return interaction.editReply({ embeds: [embed, assignmentEmbed, pricesEmbed] });
    
  } catch (error) {
    console.error('[GardenPortfolio3Pair] Error:', error);
    return interaction.editReply(`Error analyzing garden portfolio: ${error.message}`);
  }
}
