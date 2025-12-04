import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getHeroesByOwner, getUserGardenPositions, getGardenPoolByPid } from '../onchain-data.js';
import { fetchPetsForWallet } from '../pet-data.js';
import { getQuestRewardFundBalances } from '../quest-reward-fund.js';
import { getCachedPoolAnalytics } from '../pool-cache.js';

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
 * Get user's highest-value pool position
 * Uses totalStakedRaw from pool info (not LP totalSupply) for correct LP share
 */
async function getBestPoolPosition(walletAddress) {
  try {
    const positions = await getUserGardenPositions(walletAddress, 'dfk');
    
    if (!positions || positions.length === 0) {
      return null;
    }
    
    // Get pool analytics for TVL data
    const cached = getCachedPoolAnalytics();
    const poolData = cached?.data || [];
    
    let bestPosition = null;
    let bestValue = 0;
    
    for (const pos of positions) {
      if (!pos.stakedAmountRaw || BigInt(pos.stakedAmountRaw) <= 0n) continue;
      
      const poolInfo = GARDEN_POOLS.find(p => p.pid === pos.pid);
      if (!poolInfo) continue;
      
      // Get pool details including totalStaked from contract
      const poolDetails = await getGardenPoolByPid(pos.pid, 'dfk');
      if (!poolDetails) continue;
      
      // Get pool analytics for TVL
      const analytics = poolData.find(p => p.pid === pos.pid);
      const tvl = analytics?.totalTVL || 0;
      
      // Calculate user's share using totalStakedRaw (staked in garden, not LP totalSupply)
      // This is the correct denominator for garden rewards
      const totalStakedRaw = poolDetails.totalStakedRaw;
      if (!totalStakedRaw || BigInt(totalStakedRaw) <= 0n) continue;
      
      const userShare = Number(pos.stakedAmountRaw) / Number(totalStakedRaw);
      const userValue = tvl * userShare;
      
      console.log(`[TopGardeners] Pool ${pos.pid}: staked=${pos.stakedAmount}, totalStaked=${poolDetails.totalStaked}, share=${(userShare*100).toFixed(4)}%`);
      
      if (userValue > bestValue) {
        bestValue = userValue;
        const allocPercent = parseFloat(poolDetails.allocPercent) || 0;
        
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
  );

export async function execute(interaction) {
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply();
  }
  
  try {
    const walletAddress = interaction.options.getString('wallet').toLowerCase();
    
    console.log(`[TopGardeners] Analyzing wallet ${walletAddress}...`);
    
    // Fetch all data in parallel
    const [heroes, pets, rewardFund, bestPool] = await Promise.all([
      getHeroesByOwner(walletAddress),
      fetchPetsForWallet(walletAddress),
      getQuestRewardFundBalances(),
      getBestPoolPosition(walletAddress)
    ]);
    
    if (!heroes || heroes.length === 0) {
      return interaction.editReply('No heroes found for this wallet');
    }
    
    if (!bestPool) {
      return interaction.editReply('No LP positions found. Stake LP tokens in a garden to see yield estimates.');
    }
    
    // Filter for gardening pets
    const gardeningPets = (pets || []).filter(p => p.eggType === 2);
    
    console.log(`[TopGardeners] Found ${heroes.length} heroes, ${gardeningPets.length} gardening pets`);
    console.log(`[TopGardeners] Best pool: ${bestPool.name} (${(bestPool.userShare * 100).toFixed(4)}% share, ${bestPool.allocPercent}% alloc)`);
    console.log(`[TopGardeners] Reward Fund: ${rewardFund.crystalPool.toLocaleString()} CRYSTAL, ${rewardFund.jewelPool.toLocaleString()} JEWEL`);
    
    // Score and rank heroes
    const scoredHeroes = heroes
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
      
      // Stamina per day based on hero level
      // Level 20 = 20 min regen = 72 stam/day
      // Lower levels have slower regen, approximate: 72 * (level / 20)
      const heroLevel = hero.level || 1;
      const staminaPerDay = Math.min(72, Math.max(36, 72 * (heroLevel / 20)));
      
      // Calculate daily CRYSTAL yield (primary reward in Crystalvale pools)
      // First hero in pair earns CRYSTAL; second earns JEWEL
      // Here we show CRYSTAL as the primary metric for ranking
      const crystalPerDay = calculateDailyYield({
        heroFactor: bestMatch.heroFactor,
        hasGardeningGene,
        gardeningSkill,
        rewardPool: rewardFund.crystalPool,
        poolAllocation: bestPool.allocDecimal,
        lpOwned: bestPool.userShare,
        staminaPerDay,
        petMultiplier: bestMatch.petMultiplier
      });
      
      // Also calculate JEWEL (for if hero is second in pair)
      const jewelPerDay = calculateDailyYield({
        heroFactor: bestMatch.heroFactor,
        hasGardeningGene,
        gardeningSkill,
        rewardPool: rewardFund.jewelPool,
        poolAllocation: bestPool.allocDecimal,
        lpOwned: bestPool.userShare,
        staminaPerDay,
        petMultiplier: bestMatch.petMultiplier
      });
      
      topPairings.push({
        rank: i + 1,
        hero,
        hasGardeningGene,
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
    const embed = new EmbedBuilder()
      .setColor('#00FF88')
      .setTitle('Top 12 Gardener-Pet Pairings')
      .setDescription([
        `Wallet: \`${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}\``,
        `Heroes: ${heroes.length} | Gardening Pets: ${gardeningPets.length}`,
        ``,
        `**Pool:** ${bestPool.name}`,
        `**Your Share:** ${(bestPool.userShare * 100).toFixed(4)}% | **Alloc:** ${bestPool.allocPercent}%`,
        `**Reward Fund:** ${(rewardFund.crystalPool/1e6).toFixed(2)}M CRYSTAL | ${(rewardFund.jewelPool/1e3).toFixed(0)}K JEWEL`
      ].join('\n'))
      .setTimestamp();
    
    // Format pairings
    const pairingLines = topPairings.map(p => {
      const heroId = p.hero.id;
      const heroLevel = p.hero.level || 1;
      const geneIcon = p.hasGardeningGene ? ' [G]' : '';
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
      
      // Show CRYSTAL as primary (1st hero role), JEWEL as secondary (2nd hero role)
      return `**${p.rank}.** Lv${heroLevel}${geneIcon} #${heroId}\n` +
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
      value: '[G] = Gardening Gene | ⚡ = Power Surge | 🧑‍🌾 = Skilled Greenskeeper',
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
