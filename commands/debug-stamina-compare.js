import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getHeroesByOwner, getGardenPoolByPid, getUserGardenPositions } from '../onchain-data.js';
import { fetchPetsForWallet } from '../pet-data.js';
import { getQuestRewardFundBalances } from '../quest-reward-fund.js';
import { getCachedPoolAnalytics } from '../pool-cache.js';
import { isHeroRapidRenewalActive } from '../rapid-renewal-service.js';

/**
 * Stamina setpoints to compare
 */
const STAMINA_SETPOINTS = [5, 10, 15, 20, 25, 30, 35];

/**
 * Pool choices for dropdown
 */
const POOL_CHOICES = [
  { name: 'CRYSTAL-JEWEL (PID 2)', value: '2' },
  { name: 'CRYSTAL-AVAX (PID 1)', value: '1' },
  { name: 'CRYSTAL-USDC (PID 3)', value: '3' },
  { name: 'ETH-USDC (PID 4)', value: '4' },
  { name: 'JEWEL-USDC (PID 5)', value: '5' },
  { name: 'CRYSTAL-ETH (PID 6)', value: '6' },
  { name: 'CRYSTAL-BTC.b (PID 7)', value: '7' },
  { name: 'CRYSTAL-KLAY (PID 8)', value: '8' },
  { name: 'JEWEL-KLAY (PID 9)', value: '9' },
  { name: 'JEWEL-AVAX (PID 10)', value: '10' },
  { name: 'JEWEL-BTC.b (PID 11)', value: '11' },
  { name: 'JEWEL-ETH (PID 12)', value: '12' },
  { name: 'BTC.b-USDC (PID 13)', value: '13' }
];

/**
 * Power Surge skill IDs (gardening pets only, eggType 2)
 */
const POWER_SURGE_IDS = [90, 170];

/**
 * Skilled Greenskeeper skill IDs (gardening pets only, eggType 2)
 */
const SKILLED_GREENSKEEPER_IDS = [7, 86, 166];

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
 */
function calculateHeroFactor(hero, additionalGrdSkill = 0) {
  const WIS = hero.wisdom || 0;
  const VIT = hero.vitality || 0;
  const rawGrdSkill = (hero.gardening || 0) / 10;
  const GrdSkl = rawGrdSkill + additionalGrdSkill;
  return 0.1 + (WIS + VIT) / 1222.22 + GrdSkl / 244.44;
}

/**
 * Calculate yield per stamina spent
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
 * Find best pet for hero
 */
function findBestPetForHero(hero, gardeningPets) {
  const baseHeroFactor = calculateHeroFactor(hero);
  
  let bestPairing = {
    pet: null,
    heroFactor: baseHeroFactor,
    petMultiplier: 1.0,
    skillType: 'none',
    bonus: 0
  };
  
  for (const pet of gardeningPets) {
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
        bonus: skillInfo.bonus
      };
    }
  }
  
  return bestPairing;
}

/**
 * Score hero for ranking
 */
function scoreHeroForGardening(hero) {
  const baseYield = calculateHeroFactor(hero);
  const level = hero.level || 1;
  return baseYield * Math.sqrt(level);
}

export const data = new SlashCommandBuilder()
  .setName('debug-stamina-compare')
  .setDescription('Compare yields at different stamina setpoints for same hero-pet-pool')
  .addStringOption(option =>
    option.setName('wallet')
      .setDescription('Wallet address')
      .setRequired(true)
  )
  .addStringOption(option =>
    option.setName('pool')
      .setDescription('Garden pool to analyze')
      .setRequired(true)
      .addChoices(...POOL_CHOICES)
  );

export async function execute(interaction) {
  const startTime = Date.now();
  
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply();
  }
  
  try {
    const walletAddress = interaction.options.getString('wallet').toLowerCase();
    const poolPid = parseInt(interaction.options.getString('pool'), 10);
    
    console.log(`[StaminaCompare] Analyzing wallet ${walletAddress}, pool ${poolPid}...`);
    
    // Fetch data in parallel
    const [heroes, pets, poolDetails, rewardFund, existingPositions, cachedAnalytics] = await Promise.all([
      getHeroesByOwner(walletAddress),
      fetchPetsForWallet(walletAddress),
      getGardenPoolByPid(poolPid, 'dfk'),
      getQuestRewardFundBalances(),
      getUserGardenPositions(walletAddress, 'dfk'),
      getCachedPoolAnalytics()
    ]);
    
    if (!heroes || heroes.length === 0) {
      return interaction.editReply('No heroes found for this wallet.');
    }
    
    if (!poolDetails) {
      return interaction.editReply('Could not fetch pool data.');
    }
    
    // Get pool TVL from cache
    const cachedData = cachedAnalytics?.data || [];
    const poolAnalytics = cachedData.find(p => p.pid === poolPid);
    const tvl = poolAnalytics?.totalTVL || 0;
    const allocPercent = parseFloat(poolDetails.allocPercent) || 0;
    const allocDecimal = allocPercent / 100;
    
    // Check if cache is ready
    if (tvl <= 0) {
      console.log('[StaminaCompare] Cache not ready - pool has no TVL data yet');
      return interaction.editReply(
        '📊 **Pool analytics are still loading...**\n\n' +
        'The garden data cache is warming up after a recent restart. ' +
        'Please check back in **2-3 minutes** and try again.\n\n' +
        '*This only happens right after the bot restarts.*'
      );
    }
    
    // Calculate user's LP share
    const existingPos = (existingPositions || []).find(p => p.pid === poolPid);
    let lpShare = 0.0001; // Default reference share
    if (existingPos && tvl > 0 && poolDetails.totalStakedRaw) {
      const userLPRaw = BigInt(existingPos.stakedAmountRaw || 0);
      const totalStakedRaw = BigInt(poolDetails.totalStakedRaw);
      if (totalStakedRaw > 0n) {
        lpShare = Number(userLPRaw) / Number(totalStakedRaw);
      }
    }
    
    // Find best hero
    const gardeningPets = (pets || []).filter(p => p.eggType === 2);
    const scoredHeroes = heroes
      .map(hero => ({ hero, score: scoreHeroForGardening(hero) }))
      .sort((a, b) => b.score - a.score);
    
    const bestHero = scoredHeroes[0].hero;
    const bestPairing = findBestPetForHero(bestHero, gardeningPets);
    
    const hasGardeningGene = bestHero.professionStr === 'Gardening';
    const gardeningSkill = bestHero.gardening || 0;
    
    // Check for Rapid Renewal
    const hasRR = await isHeroRapidRenewalActive(walletAddress, bestHero.id);
    
    // Calculate regen rate
    const questMinPerStam = hasGardeningGene ? 10 : 12;
    let regenMinPerStam = 20; // base
    if (hasRR) {
      const regenSeconds = Math.max(300, 1200 - (bestHero.level * 3));
      regenMinPerStam = regenSeconds / 60;
    }
    
    // Coerce reward fund values to numbers (they may be BigInt or string)
    const crystalPool = Number(rewardFund.crystalPool);
    const jewelPool = Number(rewardFund.jewelPool);
    
    console.log(`[StaminaCompare] Hero #${bestHero.id} (Lv${bestHero.level}, Gene:${hasGardeningGene}, RR:${hasRR})`);
    console.log(`[StaminaCompare] Pool PID ${poolPid}: ${allocPercent}% alloc, ${(lpShare * 100).toFixed(4)}% share`);
    console.log(`[StaminaCompare] Reward Fund: ${crystalPool.toLocaleString()} CRYSTAL, ${jewelPool.toLocaleString()} JEWEL`);
    
    // Calculate yields for each stamina setpoint
    const results = [];
    
    for (const stamina of STAMINA_SETPOINTS) {
      const cycleMinutes = stamina * (questMinPerStam + regenMinPerStam);
      const runsPerDay = 1440 / cycleMinutes;
      
      // Yield per run
      const crystalPerRun = calculateYieldPerStamina({
        heroFactor: bestPairing.heroFactor,
        hasGardeningGene,
        gardeningSkill,
        rewardPool: crystalPool,
        poolAllocation: allocDecimal,
        lpOwned: lpShare,
        petMultiplier: bestPairing.petMultiplier
      }) * stamina;
      
      const jewelPerRun = calculateYieldPerStamina({
        heroFactor: bestPairing.heroFactor,
        hasGardeningGene,
        gardeningSkill,
        rewardPool: jewelPool,
        poolAllocation: allocDecimal,
        lpOwned: lpShare,
        petMultiplier: bestPairing.petMultiplier
      }) * stamina;
      
      // Daily yields
      const crystalPerDay = crystalPerRun * runsPerDay;
      const jewelPerDay = jewelPerRun * runsPerDay;
      
      // Jackpot rolls per day (every 15 stamina = 1 roll)
      const jackpotsPerRun = Math.floor(stamina / 15);
      const jackpotsPerDay = jackpotsPerRun * runsPerDay;
      
      results.push({
        stamina,
        runsPerDay,
        crystalPerRun,
        jewelPerRun,
        crystalPerDay,
        jewelPerDay,
        jackpotsPerRun,
        jackpotsPerDay
      });
    }
    
    // Build embed
    const rrLabel = hasRR ? ' [RR]' : '';
    const geneLabel = hasGardeningGene ? ' [G]' : '';
    const petInfo = bestPairing.pet 
      ? `Pet #${normalizePetId(bestPairing.pet.id)} (+${bestPairing.bonus}%)`
      : 'No Pet';
    
    const poolName = POOL_CHOICES.find(c => c.value === String(poolPid))?.name || `PID ${poolPid}`;
    
    const embed = new EmbedBuilder()
      .setColor('#FF6600')
      .setTitle('Stamina Setpoint Comparison')
      .setDescription([
        `**Hero:** #${bestHero.id} (Lv${bestHero.level}${geneLabel}${rrLabel}) | **Pet:** ${petInfo}`,
        `**Pool:** ${poolName} | **Alloc:** ${allocPercent.toFixed(1)}% | **Share:** ${(lpShare * 100).toFixed(4)}%`,
        `**Quest Time:** ${questMinPerStam} min/stam | **Regen:** ${regenMinPerStam.toFixed(1)} min/stam`,
        `**Reward Fund:** ${(crystalPool/1e6).toFixed(2)}M C | ${(jewelPool/1e3).toFixed(0)}K J`,
        ``
      ].join('\n'))
      .setTimestamp();
    
    // Build comparison table
    const tableHeader = `Stam│Runs/D│  C/Run │  J/Run │  C/Day │  J/Day │JP/D`;
    const tableDivider = `────┼──────┼────────┼────────┼────────┼────────┼────`;
    
    const tableRows = results.map(r => {
      const stamStr = String(r.stamina).padStart(4);
      const runsStr = r.runsPerDay.toFixed(2).padStart(6);
      const cRunStr = r.crystalPerRun.toFixed(2).padStart(8);
      const jRunStr = r.jewelPerRun.toFixed(2).padStart(8);
      const cDayStr = r.crystalPerDay.toFixed(2).padStart(8);
      const jDayStr = r.jewelPerDay.toFixed(2).padStart(8);
      const jpStr = r.jackpotsPerDay.toFixed(1).padStart(4);
      return `${stamStr}│${runsStr}│${cRunStr}│${jRunStr}│${cDayStr}│${jDayStr}│${jpStr}`;
    }).join('\n');
    
    embed.addFields({
      name: 'Yield Comparison by Stamina',
      value: `\`\`\`\n${tableHeader}\n${tableDivider}\n${tableRows}\n\`\`\``,
      inline: false
    });
    
    // Find best for jackpots
    const bestJackpot = results.reduce((best, r) => r.jackpotsPerDay > best.jackpotsPerDay ? r : best, results[0]);
    
    embed.addFields({
      name: 'Analysis',
      value: [
        `**Base C/Day & J/Day are constant** across all stamina setpoints (formula cancels out)`,
        `**Best for Jackpots:** ${bestJackpot.stamina} stamina = ${bestJackpot.jackpotsPerDay.toFixed(1)} jackpot rolls/day`,
        `*Jackpot: 9.9% for +0.1 token, 0.1% for +1 token (halved without [G])*`
      ].join('\n'),
      inline: false
    });
    
    const runtime = ((Date.now() - startTime) / 1000).toFixed(1);
    embed.setFooter({ text: `Runtime: ${runtime}s | JP = Jackpot rolls (every 15 stam)` });
    
    console.log(`[StaminaCompare] Generated comparison in ${runtime}s`);
    
    return interaction.editReply({ embeds: [embed] });
    
  } catch (error) {
    console.error('[StaminaCompare] Error:', error);
    return interaction.editReply(`Error: ${error.message}`);
  }
}
