import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getHeroesByOwner, getUserGardenPositions, getGardenPoolByPid } from '../onchain-data.js';
import { fetchPetsForWallet } from '../pet-data.js';
import { getQuestRewardFundBalances } from '../quest-reward-fund.js';
import { getCachedPoolAnalytics } from '../pool-cache.js';
import { isHeroRapidRenewalActive } from '../rapid-renewal-service.js';
import { getAllExpeditions } from '../hero-pairing.js';

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
 * Power Surge skill IDs (gardening pets only, eggType 2)
 */
const POWER_SURGE_IDS = [90, 170]; // Rare, Mythic

/**
 * Skilled Greenskeeper skill IDs (gardening pets only, eggType 2)
 */
const SKILLED_GREENSKEEPER_IDS = [7, 86, 166]; // Common, Rare, Mythic

/**
 * Official garden pools with LP token addresses
 */
const GARDEN_POOLS = [
  { pid: 0, name: 'wJEWEL-xJEWEL', lpToken: '0x6AC38A4C112F125eac0eBDbaDBed0BC8F4575d0d' },
  { pid: 1, name: 'CRYSTAL-AVAX', lpToken: '0x9f378F48d0c1328fd0C80d7Ae544C6CadB5Ba99E' },
  { pid: 2, name: 'CRYSTAL-wJEWEL', lpToken: '0x48658E69D741024b4686C8f7b236D3F1D291f386' },
  { pid: 3, name: 'CRYSTAL-USDC', lpToken: '0x04Dec678825b8DfD2D0d9bD83B538bE3fbDA2926' },
  { pid: 4, name: 'ETH-USDC', lpToken: '0x7d4daa9eB74264b082A92F3f559ff167224484aC' },
  { pid: 5, name: 'wJEWEL-USDC', lpToken: '0xCF329b34049033dE26e4449aeBCb41f1992724D3' },
  { pid: 6, name: 'CRYSTAL-ETH', lpToken: '0x78C893E262e2681Dbd6B6eBA6CCA2AaD45de19AD' },
  { pid: 7, name: 'CRYSTAL-BTC.b', lpToken: '0x00BD81c9bAc29a3b6aea7ABc92d2C9a3366Bb4dD' },
  { pid: 8, name: 'CRYSTAL-KLAY', lpToken: '0xaFC1fBc3F3fB517EB54Bb2472051A6f0b2105320' },
  { pid: 9, name: 'wJEWEL-KLAY', lpToken: '0x561091E2385C90d41b4c0dAef651A4b33E1a5CfE' },
  { pid: 10, name: 'wJEWEL-AVAX', lpToken: '0xF3EabeD6Bd905e0FcD68FC3dBCd6e3A4aEE55E98' },
  { pid: 11, name: 'wJEWEL-BTC.b', lpToken: '0xfAa8507e822397bd56eFD4480Fb12ADC41ff940B' },
  { pid: 12, name: 'wJEWEL-ETH', lpToken: '0x79724B6996502afc773feB3Ff8Bb3C23ADf2854B' },
  { pid: 13, name: 'BTC.b-USDC', lpToken: '0x59D642B471dd54207Cb1CDe2e7507b0Ce1b1a6a5' }
];

/**
 * Pool choices for dropdown (auto = detect highest value position)
 */
const POOL_CHOICES = [
  { name: 'Auto-detect best position', value: 'auto' },
  { name: 'wJEWEL-xJEWEL', value: '0' },
  { name: 'CRYSTAL-AVAX', value: '1' },
  { name: 'CRYSTAL-wJEWEL', value: '2' },
  { name: 'CRYSTAL-USDC', value: '3' },
  { name: 'ETH-USDC', value: '4' },
  { name: 'wJEWEL-USDC', value: '5' },
  { name: 'CRYSTAL-ETH', value: '6' },
  { name: 'CRYSTAL-BTC.b', value: '7' },
  { name: 'CRYSTAL-KLAY', value: '8' },
  { name: 'wJEWEL-KLAY', value: '9' },
  { name: 'wJEWEL-AVAX', value: '10' },
  { name: 'wJEWEL-BTC.b', value: '11' },
  { name: 'wJEWEL-ETH', value: '12' },
  { name: 'BTC.b-USDC', value: '13' }
];

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
 * Calculate daily yield using full DFK formula
 * 
 * earnRate = annealingFactor × (rewardPool × poolAllocation × LPowned × heroFactor) / divisor
 * divisor = (300 - 50*geneBonus) × rewardModBase
 * 
 * @param {Object} params
 * @param {number} params.heroFactor - Hero's stat factor
 * @param {boolean} params.hasGardeningGene - Whether hero has gardening profession
 * @param {number} params.gardeningSkill - Hero's gardening skill (0-100 scale from API, /10 for formula)
 * @param {number} params.rewardPool - Quest Reward Fund balance (CRYSTAL or JEWEL)
 * @param {number} params.poolAllocation - Pool's allocation % as decimal (0-1)
 * @param {number} params.lpOwned - User's LP share as decimal (0-1)
 * @param {number} params.staminaPerDay - Stamina generated per day (~72 for level 20)
 * @param {number} params.petMultiplier - Pet Power Surge multiplier (1.0 = no pet, 1.7 = +70%)
 * @returns {number} Daily yield in tokens
 */
function calculateDailyYield({ 
  heroFactor, 
  hasGardeningGene, 
  gardeningSkill = 0,
  rewardPool, 
  poolAllocation, 
  lpOwned, 
  staminaPerDay,
  petMultiplier = 1.0
}) {
  const annealingFactor = 1.0;
  const geneBonus = hasGardeningGene ? 1 : 0;
  
  // Gardening skill from API is 0-100, formula uses 0-10
  const grdSkillForFormula = gardeningSkill / 10;
  
  // rewardModBase: 72 for level 10+ gardening quests, 144 for lower
  // "Level 10 quest" means gardening skill >= 10 (100 in API terms)
  const rewardModBase = grdSkillForFormula >= 10 ? 72 : 144;
  
  // Divisor: (300 - 50*geneBonus) × rewardModBase
  const divisor = (300 - (50 * geneBonus)) * rewardModBase;
  
  // Earn rate per stamina
  const earnRatePerStam = annealingFactor * (rewardPool * poolAllocation * lpOwned * heroFactor) / divisor;
  
  // Apply pet multiplier and calculate daily
  const dailyYield = earnRatePerStam * staminaPerDay * petMultiplier;
  
  return dailyYield;
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
 * Find best pet for hero and calculate yield with it
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
      // Adds to gardening skill before factor calculation
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
 * Get data for a specific pool by pid
 * Returns pool info with user's staked position (if any) or 0 if not staked
 */
async function getPoolByPid(pid, walletAddress) {
  try {
    const poolInfo = GARDEN_POOLS.find(p => p.pid === pid);
    if (!poolInfo) return null;
    
    // Get pool details from contract
    const poolDetails = await getGardenPoolByPid(pid, 'dfk');
    if (!poolDetails) return null;
    
    const totalStakedRaw = poolDetails.totalStakedRaw;
    if (!totalStakedRaw || BigInt(totalStakedRaw) <= 0n) {
      return null;
    }
    
    // Get cached analytics for TVL
    const cached = getCachedPoolAnalytics();
    const poolData = cached?.data || [];
    const analytics = poolData.find(p => p.pid === pid);
    const tvl = analytics?.totalTVL || 0;
    
    // Check if user has a position in this pool
    const positions = await getUserGardenPositions(walletAddress, 'dfk');
    const userPosition = (positions || []).find(p => p.pid === pid);
    
    let stakedAmount = '0';
    let stakedAmountRaw = '0';
    let userShare = 0;
    let userValue = 0;
    
    if (userPosition && userPosition.stakedAmountRaw && BigInt(userPosition.stakedAmountRaw) > 0n) {
      stakedAmount = userPosition.stakedAmount;
      stakedAmountRaw = userPosition.stakedAmountRaw;
      userShare = Number(stakedAmountRaw) / Number(totalStakedRaw);
      userValue = tvl * userShare;
    }
    
    const allocPercent = parseFloat(poolDetails.allocPercent) || 0;
    
    return {
      pid,
      name: poolInfo.name,
      lpToken: poolInfo.lpToken,
      stakedAmount,
      stakedAmountRaw,
      totalStaked: poolDetails.totalStaked,
      totalStakedRaw,
      userShare,
      userValue,
      tvl,
      allocPercent,
      allocDecimal: allocPercent / 100
    };
  } catch (err) {
    console.error(`[TopGardeners] Error getting pool ${pid}:`, err.message);
    return null;
  }
}

/**
 * Get user's highest-value pool position
 * Uses totalStakedRaw from pool info (not LP totalSupply) for correct LP share
 * Falls back to largest staked amount if pool details/analytics are unavailable
 */
async function getBestPoolPosition(walletAddress) {
  try {
    const positions = await getUserGardenPositions(walletAddress, 'dfk');
    
    if (!positions || positions.length === 0) {
      console.log(`[TopGardeners] No positions returned from getUserGardenPositions`);
      return null;
    }
    
    console.log(`[TopGardeners] Found ${positions.length} LP positions from contract`);
    
    // Get pool analytics for TVL data
    const cached = getCachedPoolAnalytics();
    const poolData = cached?.data || [];
    
    let bestPosition = null;
    let bestValue = 0;
    let fallbackPosition = null;
    let fallbackStaked = 0n;
    
    for (const pos of positions) {
      if (!pos.stakedAmountRaw || BigInt(pos.stakedAmountRaw) <= 0n) {
        console.log(`[TopGardeners] Skipping pool ${pos.pid}: no staked amount`);
        continue;
      }
      
      const poolInfo = GARDEN_POOLS.find(p => p.pid === pos.pid);
      if (!poolInfo) {
        console.log(`[TopGardeners] Skipping pool ${pos.pid}: not in GARDEN_POOLS list`);
        continue;
      }
      
      // Track fallback position (largest staked amount) in case pool details fail
      const stakedBigInt = BigInt(pos.stakedAmountRaw);
      if (stakedBigInt > fallbackStaked) {
        fallbackStaked = stakedBigInt;
        fallbackPosition = {
          pid: pos.pid,
          name: poolInfo.name,
          lpToken: poolInfo.lpToken,
          stakedAmount: pos.stakedAmount,
          stakedAmountRaw: pos.stakedAmountRaw,
          totalStaked: '0',
          totalStakedRaw: 0n,
          userShare: 0.0001, // Reference share for theoretical yields
          userValue: 0,
          tvl: 0,
          allocPercent: 10, // Default allocation
          allocDecimal: 0.10
        };
      }
      
      // Get pool details including totalStaked from contract
      const poolDetails = await getGardenPoolByPid(pos.pid, 'dfk');
      if (!poolDetails) {
        console.log(`[TopGardeners] Pool ${pos.pid}: getGardenPoolByPid returned null, using fallback`);
        continue;
      }
      
      // Get pool analytics for TVL
      const analytics = poolData.find(p => p.pid === pos.pid);
      const tvl = analytics?.totalTVL || 0;
      
      // Calculate user's share using totalStakedRaw (staked in garden, not LP totalSupply)
      const totalStakedRaw = poolDetails.totalStakedRaw;
      if (!totalStakedRaw || BigInt(totalStakedRaw) <= 0n) {
        console.log(`[TopGardeners] Pool ${pos.pid}: totalStakedRaw is 0, using fallback`);
        continue;
      }
      
      const userShare = Number(pos.stakedAmountRaw) / Number(totalStakedRaw);
      const userValue = tvl > 0 ? tvl * userShare : Number(pos.stakedAmountRaw); // Use staked amount if no TVL
      
      console.log(`[TopGardeners] Pool ${pos.pid}: staked=${pos.stakedAmount}, totalStaked=${poolDetails.totalStaked}, share=${(userShare*100).toFixed(4)}%`);
      
      if (userValue > bestValue) {
        bestValue = userValue;
        const allocPercent = parseFloat(poolDetails.allocPercent) || 10;
        
        bestPosition = {
          pid: pos.pid,
          name: poolInfo.name,
          lpToken: poolInfo.lpToken,
          stakedAmount: pos.stakedAmount,
          stakedAmountRaw: pos.stakedAmountRaw,
          totalStaked: poolDetails.totalStaked,
          totalStakedRaw,
          userShare,
          userValue,
          tvl,
          allocPercent,
          allocDecimal: allocPercent / 100
        };
      }
    }
    
    // If no fully-resolved position found, use fallback (largest staked amount with default values)
    if (!bestPosition && fallbackPosition) {
      console.log(`[TopGardeners] Using fallback position: pool ${fallbackPosition.pid} with reference share`);
      return fallbackPosition;
    }
    
    return bestPosition;
  } catch (err) {
    console.error('[TopGardeners] Error getting pool positions:', err.message);
    return null;
  }
}

export const data = new SlashCommandBuilder()
  .setName('top-gardeners')
  .setDescription('Show top 12 hero-pet pairings with daily yield estimates')
  .addStringOption(option =>
    option.setName('wallet')
      .setDescription('Wallet address to analyze')
      .setRequired(true)
  )
  .addStringOption(option =>
    option.setName('pool')
      .setDescription('Garden pool to calculate yields for (default: auto-detect best position)')
      .setRequired(false)
      .addChoices(...POOL_CHOICES)
  )
  .addStringOption(option =>
    option.setName('scope')
      .setDescription('Filter heroes by quest status')
      .setRequired(false)
      .addChoices(
        { name: 'All heroes', value: 'all' },
        { name: 'Active (currently questing)', value: 'active' },
        { name: 'Inactive (not questing)', value: 'inactive' }
      )
  );

export async function execute(interaction) {
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply();
  }
  
  try {
    const walletAddress = interaction.options.getString('wallet').toLowerCase();
    const poolSelection = interaction.options.getString('pool') || 'auto';
    const scope = interaction.options.getString('scope') || 'all';
    
    console.log(`[TopGardeners] Analyzing wallet ${walletAddress}, pool=${poolSelection}, scope=${scope}...`);
    
    // Fetch heroes, pets, reward fund, and expeditions in parallel
    const [heroes, pets, rewardFund, expeditionData] = await Promise.all([
      getHeroesByOwner(walletAddress),
      fetchPetsForWallet(walletAddress),
      getQuestRewardFundBalances(),
      getAllExpeditions(walletAddress)
    ]);
    
    if (!heroes || heroes.length === 0) {
      return interaction.editReply('No heroes found for this wallet');
    }
    
    // Build set of active hero IDs from expeditions
    const activeHeroIds = new Set();
    if (expeditionData?.heroToQuest) {
      for (const heroId of expeditionData.heroToQuest.keys()) {
        activeHeroIds.add(String(heroId));
      }
    }
    console.log(`[TopGardeners] Found ${activeHeroIds.size} heroes currently on quests`);
    
    // Filter heroes based on scope
    let filteredHeroes = heroes;
    let scopeLabel = 'All Heroes';
    
    if (scope === 'active') {
      filteredHeroes = heroes.filter(h => activeHeroIds.has(String(h.id)));
      scopeLabel = 'Active (Questing)';
    } else if (scope === 'inactive') {
      filteredHeroes = heroes.filter(h => !activeHeroIds.has(String(h.id)));
      scopeLabel = 'Inactive (Available)';
    }
    
    console.log(`[TopGardeners] Scope ${scope}: ${filteredHeroes.length}/${heroes.length} heroes after filter`);
    
    if (filteredHeroes.length === 0) {
      const scopeMsg = scope === 'active' 
        ? 'No heroes are currently on quests.'
        : 'All heroes are currently on quests.';
      return interaction.editReply(scopeMsg);
    }
    
    // Get pool data based on selection
    let selectedPool;
    if (poolSelection === 'auto') {
      selectedPool = await getBestPoolPosition(walletAddress);
      if (!selectedPool) {
        return interaction.editReply('No LP positions found. Stake LP tokens in a garden to see yield estimates, or select a specific pool to see potential yields.');
      }
    } else {
      const pid = parseInt(poolSelection, 10);
      selectedPool = await getPoolByPid(pid, walletAddress);
      if (!selectedPool) {
        return interaction.editReply(`Could not fetch data for pool ${poolSelection}. Please try again.`);
      }
    }
    
    // If user has no position in manually selected pool, use a reference share for theoretical yields
    const hasPosition = selectedPool.userShare > 0;
    
    // For theoretical yields (no position), use 0.01% reference share
    // This gives meaningful comparison numbers rather than all zeros
    const effectiveLpShare = hasPosition ? selectedPool.userShare : 0.0001;
    
    // Filter for gardening pets (eggType 2)
    const allGardeningPets = (pets || []).filter(p => p.eggType === 2);
    
    // Filter pets based on scope (pets are "on quest" if their equipped hero is questing)
    let gardeningPets = allGardeningPets;
    if (scope === 'active') {
      // Only pets equipped to heroes that are currently questing
      gardeningPets = allGardeningPets.filter(p => {
        const equippedTo = p.equippedTo ? String(p.equippedTo) : null;
        return equippedTo && activeHeroIds.has(equippedTo);
      });
    } else if (scope === 'inactive') {
      // Only pets NOT equipped to questing heroes (available pets)
      gardeningPets = allGardeningPets.filter(p => {
        const equippedTo = p.equippedTo ? String(p.equippedTo) : null;
        // Available if: not equipped to anyone, OR equipped to a non-questing hero
        return !equippedTo || !activeHeroIds.has(equippedTo);
      });
    }
    
    console.log(`[TopGardeners] Found ${filteredHeroes.length}/${heroes.length} heroes (${scopeLabel}), ${gardeningPets.length}/${allGardeningPets.length} gardening pets`);
    console.log(`[TopGardeners] Selected pool: ${selectedPool.name} (${(selectedPool.userShare * 100).toFixed(4)}% share, ${selectedPool.allocPercent}% alloc, hasPosition=${hasPosition})`);
    console.log(`[TopGardeners] Reward Fund: ${rewardFund.crystalPool.toLocaleString()} CRYSTAL, ${rewardFund.jewelPool.toLocaleString()} JEWEL`);
    
    // Score and rank heroes (using filtered set)
    const scoredHeroes = filteredHeroes
      .map(hero => ({
        hero,
        score: scoreHeroForGardening(hero)
      }))
      .sort((a, b) => b.score - a.score);
    
    // Take top 12 and assign best pets
    const usedPetIds = new Set();
    const topPairings = [];
    
    for (let i = 0; i < Math.min(12, scoredHeroes.length); i++) {
      const { hero } = scoredHeroes[i];
      const bestMatch = findBestPetForHero(hero, gardeningPets, usedPetIds);
      
      if (bestMatch.pet) {
        usedPetIds.add(bestMatch.pet.id);
      }
      
      const hasGardeningGene = hero.professionStr === 'Gardening';
      const gardeningSkill = hero.gardening || 0; // Raw 0-100 scale from API
      const heroLevel = hero.level || 1;
      
      // Check if hero has Rapid Renewal power-up
      const hasRR = await isHeroRapidRenewalActive(walletAddress, hero.id);
      
      // Stamina per day calculation:
      // Base regen: 20 min/stam for ALL heroes = 72 stam/day
      // With Rapid Renewal: regenSeconds = max(300, 1200 - level*3)
      let staminaPerDay = 72; // Base: 20 min regen = 72 stam/day
      if (hasRR) {
        const regenSeconds = Math.max(300, 1200 - (heroLevel * 3)); // min 5 min = 300s
        staminaPerDay = 86400 / regenSeconds; // seconds per day / seconds per stamina
      }
      
      // Calculate daily CRYSTAL yield (primary reward in Crystalvale pools)
      // First hero in pair earns CRYSTAL; second earns JEWEL
      // Here we show CRYSTAL as the primary metric for ranking
      const crystalPerDay = calculateDailyYield({
        heroFactor: bestMatch.heroFactor,
        hasGardeningGene,
        gardeningSkill,
        rewardPool: rewardFund.crystalPool,
        poolAllocation: selectedPool.allocDecimal,
        lpOwned: effectiveLpShare,
        staminaPerDay,
        petMultiplier: bestMatch.petMultiplier
      });
      
      // Also calculate JEWEL (for if hero is second in pair)
      const jewelPerDay = calculateDailyYield({
        heroFactor: bestMatch.heroFactor,
        hasGardeningGene,
        gardeningSkill,
        rewardPool: rewardFund.jewelPool,
        poolAllocation: selectedPool.allocDecimal,
        lpOwned: effectiveLpShare,
        staminaPerDay,
        petMultiplier: bestMatch.petMultiplier
      });
      
      topPairings.push({
        rank: i + 1,
        hero,
        hasGardeningGene,
        hasRapidRenewal: hasRR,
        gardeningSkill,
        heroFactor: bestMatch.heroFactor,
        pet: bestMatch.pet,
        petMultiplier: bestMatch.petMultiplier,
        skillType: bestMatch.skillType,
        skillName: bestMatch.skillName,
        bonus: bestMatch.bonus,
        staminaPerDay,
        crystalPerDay,
        jewelPerDay
      });
    }
    
    // Build embed
    const poolMode = poolSelection === 'auto' ? '(auto-detected)' : '(selected)';
    const shareInfo = hasPosition 
      ? `**Your Share:** ${(selectedPool.userShare * 100).toFixed(4)}%` 
      : `**Your Share:** 0.01% reference (theoretical yields)`;
    
    // Scope display for heroes and pets
    const scopeInfo = scope === 'all' 
      ? `Heroes: ${heroes.length}` 
      : `Heroes: ${filteredHeroes.length}/${heroes.length} (${scopeLabel})`;
    
    const petInfo = scope === 'all'
      ? `Pets: ${gardeningPets.length}`
      : `Pets: ${gardeningPets.length}/${allGardeningPets.length}`;
    
    const embed = new EmbedBuilder()
      .setColor('#00FF88')
      .setTitle('Top 12 Gardener-Pet Pairings')
      .setDescription([
        `Wallet: \`${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}\``,
        `${scopeInfo} | ${petInfo}`,
        ``,
        `**Pool:** ${selectedPool.name} ${poolMode}`,
        `${shareInfo} | **Alloc:** ${selectedPool.allocPercent}%`,
        `**Reward Fund:** ${(rewardFund.crystalPool/1e6).toFixed(2)}M CRYSTAL | ${(rewardFund.jewelPool/1e3).toFixed(0)}K JEWEL`
      ].join('\n'))
      .setTimestamp();
    
    // Format pairings
    const pairingLines = topPairings.map(p => {
      const heroId = p.hero.id;
      const heroLevel = p.hero.level || 1;
      const geneIcon = p.hasGardeningGene ? ' [G]' : '';
      const rrIcon = p.hasRapidRenewal ? ' [RR]' : '';
      const WIS = p.hero.wisdom || 0;
      const VIT = p.hero.vitality || 0;
      const grdSkill = Math.floor((p.hero.gardening || 0) / 10);
      const modBase = grdSkill >= 10 ? 72 : 144;
      
      let petInfo = 'No yield pet';
      if (p.pet) {
        const petId = normalizePetId(p.pet.id);
        const skillIcon = p.skillType === 'power_surge' ? '⚡' : '🧑‍🌾';
        petInfo = `Pet #${petId} ${skillIcon}+${p.bonus}%`;
      }
      
      // Show stamina/day info for RR heroes
      const stamInfo = p.hasRapidRenewal ? ` (${p.staminaPerDay.toFixed(0)} stam/day)` : '';
      
      // Show CRYSTAL as primary (1st hero role), JEWEL as secondary (2nd hero role)
      return `**${p.rank}.** Lv${heroLevel}${geneIcon}${rrIcon} #${heroId}${stamInfo}\n` +
             `   WIS:${WIS} VIT:${VIT} Grd:${grdSkill} F:${p.heroFactor.toFixed(2)}\n` +
             `   └ ${petInfo}\n` +
             `   └ **${p.crystalPerDay.toFixed(1)} CRYSTAL**/day (1st) | ${p.jewelPerDay.toFixed(2)} JEWEL/day (2nd)`;
    });
    
    // Split into two fields
    const mid = Math.ceil(pairingLines.length / 2);
    const firstHalf = pairingLines.slice(0, mid).join('\n\n');
    const secondHalf = pairingLines.slice(mid).join('\n\n');
    
    if (firstHalf) {
      embed.addFields({ name: 'Top Gardeners (1-6)', value: firstHalf || 'None', inline: false });
    }
    if (secondHalf) {
      embed.addFields({ name: 'Top Gardeners (7-12)', value: secondHalf || 'None', inline: false });
    }
    
    // Add legend and formula info
    embed.addFields({
      name: 'Legend',
      value: '[G] = Gardening Gene | [RR] = Rapid Renewal | ⚡ = Power Surge | 🧑‍🌾 = Skilled Greenskeeper',
      inline: false
    });
    
    embed.setFooter({ 
      text: `Formula: rewardPool × poolAlloc × LPshare × heroFactor / ((300-50g) × modBase) | modBase=72 (Grd≥10) or 144 (Grd<10)` 
    });
    
    console.log(`[TopGardeners] Generated ${topPairings.length} pairings with daily yields`);
    
    return interaction.editReply({ embeds: [embed] });
    
  } catch (error) {
    console.error('[TopGardeners] Error:', error);
    return interaction.editReply(`Error analyzing gardeners: ${error.message}`);
  }
}
