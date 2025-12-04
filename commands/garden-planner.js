import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getHeroesByOwner, getGardenPoolByPid } from '../onchain-data.js';
import { fetchPetsForWallet } from '../pet-data.js';
import { getQuestRewardFundBalances } from '../quest-reward-fund.js';
import { getCachedPoolAnalytics } from '../pool-cache.js';
import { getCrystalPrice, getJewelPrice, getBatchPrices, TOKEN_ADDRESSES } from '../price-feed.js';
import { getLPTokenDetails } from '../garden-analytics.js';

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
 * Additional token addresses not in price-feed.js
 * These will be discovered from LP token details at runtime
 */
const ADDITIONAL_TOKEN_SYMBOLS = ['BTC', 'KAIA', 'xJEWEL'];

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
 * 
 * earnRate = annealingFactor × (rewardPool × poolAllocation × LPowned × heroFactor) / divisor
 * divisor = (300 - 50*geneBonus) × rewardModBase
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
  
  // Gardening skill from API is 0-100, formula uses 0-10
  const grdSkillForFormula = gardeningSkill / 10;
  
  // rewardModBase: 72 for level 10+ gardening quests, 144 for lower
  const rewardModBase = grdSkillForFormula >= 10 ? 72 : 144;
  
  // Divisor: (300 - 50*geneBonus) × rewardModBase
  const divisor = (300 - (50 * geneBonus)) * rewardModBase;
  
  // Earn rate per stamina
  const earnRatePerStam = annealingFactor * (rewardPool * poolAllocation * lpOwned * heroFactor) / divisor;
  
  // Apply pet multiplier
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
 * Find best pet for hero and calculate multipliers
 */
function findBestPetForHero(hero, gardeningPets, usedPetIds) {
  const baseHeroFactor = calculateHeroFactor(hero);
  
  let bestPairing = {
    pet: null,
    heroFactor: baseHeroFactor,
    petMultiplier: 1.0,
    skillType: 'none',
    bonus: 0
  };
  
  for (const pet of gardeningPets) {
    if (usedPetIds.has(pet.id)) continue;
    
    const skillInfo = getPetGardenSkillType(pet);
    if (!skillInfo) continue;
    
    let heroFactor = baseHeroFactor;
    let petMultiplier = 1.0;
    
    if (skillInfo.type === 'power_surge') {
      petMultiplier = 1 + skillInfo.bonus / 100;
    } else if (skillInfo.type === 'skilled_greenskeeper') {
      heroFactor = calculateHeroFactor(hero, skillInfo.bonus / 10);
    }
    
    const effectiveYield = heroFactor * petMultiplier;
    const bestEffective = bestPairing.heroFactor * bestPairing.petMultiplier;
    
    if (effectiveYield > bestEffective) {
      bestPairing = {
        pet,
        heroFactor,
        petMultiplier,
        skillType: skillInfo.type,
        bonus: skillInfo.bonus,
        skillName: pet.gatheringSkillName
      };
    }
  }
  
  return bestPairing;
}

/**
 * Score hero for initial ranking
 */
function scoreHeroForGardening(hero) {
  const baseYield = calculateHeroFactor(hero);
  const level = hero.level || 1;
  return baseYield * Math.sqrt(level);
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
      
      // Get cached analytics for TVL
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
      console.error(`[GardenPlanner] Error getting pool ${poolInfo.pid}:`, err.message);
    }
  }
  
  return pools;
}

/**
 * Get token prices from price-feed module
 * Fetches core prices and discovers additional token prices from LP details
 */
async function getTokenPrices() {
  try {
    // Get core token prices from price-feed (uses cached price graph)
    const [crystalPrice, jewelPrice] = await Promise.all([
      getCrystalPrice(),
      getJewelPrice()
    ]);
    
    // Get additional prices via batch (ETH, AVAX, USDC from known addresses)
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
    
    // Discover BTC price from BTC.b-USDC pool (pid 13)
    try {
      const btcUsdcLP = '0x59D642B471dd54207Cb1CDe2e7507b0Ce1b1a6a5';
      const btcDetails = await getLPTokenDetails(btcUsdcLP);
      if (btcDetails) {
        const dec0 = Number(btcDetails.token0.decimals);
        const dec1 = Number(btcDetails.token1.decimals);
        const r0 = parseFloat(btcDetails.reserve0.toString()) / Math.pow(10, dec0);
        const r1 = parseFloat(btcDetails.reserve1.toString()) / Math.pow(10, dec1);
        
        // One token is USDC ($1), so BTC price = USDC_reserve / BTC_reserve
        if (btcDetails.token0.symbol.includes('USDC')) {
          prices.BTC = r0 / r1;
        } else {
          prices.BTC = r1 / r0;
        }
      }
    } catch (e) {
      console.warn('[GardenPlanner] Could not get BTC price from LP:', e.message);
    }
    
    // Discover KAIA price from CRYSTAL-KLAY pool (pid 8)
    try {
      const crystalKaiaLP = '0xaFC1fBc3F3fB517EB54Bb2472051A6f0b2105320';
      const kaiaDetails = await getLPTokenDetails(crystalKaiaLP);
      if (kaiaDetails && prices.CRYSTAL > 0) {
        const dec0 = Number(kaiaDetails.token0.decimals);
        const dec1 = Number(kaiaDetails.token1.decimals);
        const r0 = parseFloat(kaiaDetails.reserve0.toString()) / Math.pow(10, dec0);
        const r1 = parseFloat(kaiaDetails.reserve1.toString()) / Math.pow(10, dec1);
        
        // price = CRYSTAL_price * (CRYSTAL_reserve / KAIA_reserve)
        const sym0 = kaiaDetails.token0.symbol.toUpperCase();
        if (sym0.includes('CRYSTAL')) {
          prices.KAIA = prices.CRYSTAL * (r0 / r1);
        } else {
          prices.KAIA = prices.CRYSTAL * (r1 / r0);
        }
      }
    } catch (e) {
      console.warn('[GardenPlanner] Could not get KAIA price from LP:', e.message);
    }
    
    // Discover xJEWEL price from wJEWEL-xJEWEL pool (pid 0)
    // xJEWEL is staked JEWEL and typically trades at ~1:1 with JEWEL
    try {
      const jewelXjewelLP = '0x6AC38A4C112F125eac0eBDbaDBed0BC8F4575d0d';
      const xjDetails = await getLPTokenDetails(jewelXjewelLP);
      if (xjDetails && prices.JEWEL > 0) {
        const dec0 = Number(xjDetails.token0.decimals);
        const dec1 = Number(xjDetails.token1.decimals);
        const r0 = parseFloat(xjDetails.reserve0.toString()) / Math.pow(10, dec0);
        const r1 = parseFloat(xjDetails.reserve1.toString()) / Math.pow(10, dec1);
        
        // price = JEWEL_price * (JEWEL_reserve / xJEWEL_reserve)
        const sym0 = xjDetails.token0.symbol.toUpperCase();
        if (sym0.includes('JEWEL') && !sym0.includes('XJEWEL')) {
          prices.xJEWEL = prices.JEWEL * (r0 / r1);
        } else {
          prices.xJEWEL = prices.JEWEL * (r1 / r0);
        }
      }
    } catch (e) {
      console.warn('[GardenPlanner] Could not get xJEWEL price from LP:', e.message);
      // Fallback: xJEWEL ≈ JEWEL
      prices.xJEWEL = prices.JEWEL;
    }
    
    console.log(`[GardenPlanner] Prices: CRYSTAL=$${prices.CRYSTAL.toFixed(4)}, JEWEL=$${prices.JEWEL.toFixed(4)}, BTC=$${prices.BTC.toFixed(0)}, KAIA=$${prices.KAIA.toFixed(4)}, xJEWEL=$${prices.xJEWEL.toFixed(4)}`);
    
    return prices;
  } catch (err) {
    console.error('[GardenPlanner] Error getting prices:', err.message);
    // Fallback to reasonable defaults
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
  .setName('garden-planner')
  .setDescription('Compare all garden pools for a given deposit amount')
  .addStringOption(option =>
    option.setName('wallet')
      .setDescription('Wallet address (to identify best hero-pet pair)')
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
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply();
  }
  
  try {
    const walletAddress = interaction.options.getString('wallet').toLowerCase();
    const depositUSD = interaction.options.getNumber('deposit_usd');
    const stamina = interaction.options.getInteger('stamina') || 25;
    
    console.log(`[GardenPlanner] Analyzing wallet ${walletAddress}, deposit=$${depositUSD}, stamina=${stamina}...`);
    
    // Fetch heroes, pets, pools, prices, and reward fund in parallel
    const [heroes, pets, pools, prices, rewardFund] = await Promise.all([
      getHeroesByOwner(walletAddress),
      fetchPetsForWallet(walletAddress),
      getAllPoolsData(),
      getTokenPrices(),
      getQuestRewardFundBalances()
    ]);
    
    if (!heroes || heroes.length === 0) {
      return interaction.editReply('No heroes found for this wallet. A wallet with heroes is required to calculate yields.');
    }
    
    if (!pools || pools.length === 0) {
      return interaction.editReply('Could not fetch pool data. Please try again later.');
    }
    
    // Filter for gardening pets
    const gardeningPets = (pets || []).filter(p => p.eggType === 2);
    
    // Find best hero-pet pair
    const scoredHeroes = heroes
      .map(hero => ({ hero, score: scoreHeroForGardening(hero) }))
      .sort((a, b) => b.score - a.score);
    
    const bestHero = scoredHeroes[0].hero;
    const usedPetIds = new Set();
    const bestPairing = findBestPetForHero(bestHero, gardeningPets, usedPetIds);
    
    const hasGardeningGene = bestHero.professionStr === 'Gardening';
    const gardeningSkill = bestHero.gardening || 0;
    
    console.log(`[GardenPlanner] Best hero: #${bestHero.id} (Lv${bestHero.level}, Grd:${Math.floor(gardeningSkill/10)}, Gene:${hasGardeningGene})`);
    console.log(`[GardenPlanner] Best pet: ${bestPairing.pet ? `#${normalizePetId(bestPairing.pet.id)} (+${bestPairing.bonus}%)` : 'None'}`);
    console.log(`[GardenPlanner] Reward Fund: ${Number(rewardFund.crystalPool).toLocaleString()} CRYSTAL, ${Number(rewardFund.jewelPool).toLocaleString()} JEWEL`);
    
    // Calculate yields for each pool
    const poolResults = [];
    
    for (const pool of pools) {
      // Calculate LP share after deposit
      // If TVL is 0 or very small, assume deposit would be significant portion
      const currentTVL = pool.tvl || 0;
      const afterTVL = currentTVL + depositUSD;
      const lpShare = afterTVL > 0 ? depositUSD / afterTVL : 0;
      
      // Calculate CRYSTAL yield per run (without pet)
      const crystalPerRunBase = calculateYieldPerStamina({
        heroFactor: calculateHeroFactor(bestHero),
        hasGardeningGene,
        gardeningSkill,
        rewardPool: rewardFund.crystalPool,
        poolAllocation: pool.allocDecimal,
        lpOwned: lpShare,
        petMultiplier: 1.0
      }) * stamina;
      
      // Calculate JEWEL yield per run (without pet)
      const jewelPerRunBase = calculateYieldPerStamina({
        heroFactor: calculateHeroFactor(bestHero),
        hasGardeningGene,
        gardeningSkill,
        rewardPool: rewardFund.jewelPool,
        poolAllocation: pool.allocDecimal,
        lpOwned: lpShare,
        petMultiplier: 1.0
      }) * stamina;
      
      // Calculate with pet bonus
      const crystalPerRunPet = calculateYieldPerStamina({
        heroFactor: bestPairing.heroFactor,
        hasGardeningGene,
        gardeningSkill,
        rewardPool: rewardFund.crystalPool,
        poolAllocation: pool.allocDecimal,
        lpOwned: lpShare,
        petMultiplier: bestPairing.petMultiplier
      }) * stamina;
      
      const jewelPerRunPet = calculateYieldPerStamina({
        heroFactor: bestPairing.heroFactor,
        hasGardeningGene,
        gardeningSkill,
        rewardPool: rewardFund.jewelPool,
        poolAllocation: pool.allocDecimal,
        lpOwned: lpShare,
        petMultiplier: bestPairing.petMultiplier
      }) * stamina;
      
      poolResults.push({
        pid: pool.pid,
        name: pool.name,
        tvl: currentTVL,
        afterTVL,
        allocPercent: pool.allocPercent,
        lpShare,
        crystalPerRun: crystalPerRunBase,
        jewelPerRun: jewelPerRunBase,
        crystalPerRunPet: crystalPerRunPet,
        jewelPerRunPet: jewelPerRunPet
      });
    }
    
    // Calculate APR for each pool (assume ~3 runs per day with pet feeding)
    const runsPerDay = 3;
    poolResults.forEach(p => {
      const dailyYield = (p.crystalPerRunPet * prices.CRYSTAL + p.jewelPerRunPet * prices.JEWEL) * runsPerDay;
      p.apr = (dailyYield * 365) / depositUSD * 100;
    });
    
    // Sort by total yield (Crystal + Jewel value with pet) descending
    poolResults.sort((a, b) => {
      const aValue = a.crystalPerRunPet * prices.CRYSTAL + a.jewelPerRunPet * prices.JEWEL;
      const bValue = b.crystalPerRunPet * prices.CRYSTAL + b.jewelPerRunPet * prices.JEWEL;
      return bValue - aValue;
    });
    
    // Build main embed with comparison table
    const embed = new EmbedBuilder()
      .setColor('#00FF88')
      .setTitle('Garden Investment Planner')
      .setTimestamp();
    
    // Build table rows - 5 columns: Pool | Alloc | Base C/J | +Pet C/J | APR
    const tableRows = poolResults.map(p => {
      const poolStr = `${p.name}`.padEnd(14).slice(0, 14);
      const allocStr = `${p.allocPercent.toFixed(1)}%`.padStart(5);
      const baseStr = `${p.crystalPerRun.toFixed(2)}C ${p.jewelPerRun.toFixed(3)}J`.padStart(14);
      const petStr = `${p.crystalPerRunPet.toFixed(2)}C ${p.jewelPerRunPet.toFixed(3)}J`.padStart(14);
      const aprStr = `${p.apr.toFixed(1)}%`.padStart(6);
      
      return `${poolStr}│${allocStr}│${baseStr}│${petStr}│${aprStr}`;
    }).join('\n');
    
    // Update description with cleaner table
    embed.setDescription([
      `**Deposit:** $${depositUSD.toLocaleString()} | **Stamina/Run:** ${stamina}`,
      `**Best Pair:** Hero #${bestHero.id} (Lv${bestHero.level}${hasGardeningGene ? ' [G]' : ''}) + ${bestPairing.pet ? `Pet #${normalizePetId(bestPairing.pet.id)} (+${bestPairing.bonus}%)` : 'No Pet'}`,
      ``,
      `\`\`\``,
      `Pool          │Alloc│   Base C/J   │   +Pet C/J   │  APR`,
      `──────────────┼─────┼──────────────┼──────────────┼──────`,
      tableRows,
      `\`\`\``
    ].join('\n'));
    
    // Build second embed with token prices and TVLs
    // Convert rewardFund to Number safely (in case they're BigInt)
    const crystalPoolNum = Number(rewardFund.crystalPool);
    const jewelPoolNum = Number(rewardFund.jewelPool);
    
    const pricesEmbed = new EmbedBuilder()
      .setColor('#FFD700')
      .setTitle('Token Prices & Pool TVLs (for validation)')
      .setDescription([
        `**Token Prices:**`,
        `CRYSTAL: $${prices.CRYSTAL.toFixed(4)} | JEWEL: $${prices.JEWEL.toFixed(4)} | USDC: $${prices.USDC.toFixed(2)}`,
        `ETH: $${prices.ETH.toFixed(2)} | AVAX: $${prices.AVAX.toFixed(2)} | BTC: $${prices.BTC.toFixed(0)}`,
        `KAIA: $${prices.KAIA.toFixed(4)} | xJEWEL: $${prices.xJEWEL.toFixed(4)}`,
        ``,
        `**Pool TVLs (Current → After Deposit):**`,
        poolResults.map(p => `PID ${p.pid} ${p.name}: $${p.tvl.toLocaleString(undefined, {maximumFractionDigits: 0})} → $${p.afterTVL.toLocaleString(undefined, {maximumFractionDigits: 0})} (${p.allocPercent}% alloc)`).join('\n'),
        ``,
        `**Reward Fund:** ${(crystalPoolNum/1e6).toFixed(2)}M CRYSTAL | ${(jewelPoolNum/1e3).toFixed(0)}K JEWEL`
      ].join('\n'))
      .setFooter({ 
        text: `Formula: rewardPool × poolAlloc × LPshare × heroFactor × stamina / ((300-50g) × modBase)` 
      });
    
    console.log(`[GardenPlanner] Generated comparison for ${poolResults.length} pools`);
    
    return interaction.editReply({ embeds: [embed, pricesEmbed] });
    
  } catch (error) {
    console.error('[GardenPlanner] Error:', error);
    return interaction.editReply(`Error analyzing gardens: ${error.message}`);
  }
}
