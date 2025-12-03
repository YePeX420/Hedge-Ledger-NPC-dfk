import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { ethers } from 'ethers';
import { getCachedPoolAnalytics } from '../pool-cache.js';
import { 
  computeFeeAprWithShare, 
  getHarvestAprPct, 
  computeTotalBaseAprPct
} from '../apr-utils.js';
import { getHeroById } from '../onchain-data.js';
import { fetchPetById, fetchPetForHero, calculatePetGardenBonus } from '../pet-data.js';
import { 
  computeHeroGardeningFactor, 
  simulateGardeningDailyYield,
  computeStaminaPerDay,
  computePerQuestYield,
  CRYSTAL_BASE_PER_ATTEMPT,
  JEWEL_BASE_PER_ATTEMPT
} from '../hero-yield-model.js';
import { getJewelPrice } from '../price-feed.js';
import { getWalletPowerUpStatus, isHeroRapidRenewalActive } from '../rapid-renewal-service.js';

const POOL_CHOICES = [
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
  { name: 'BTC.b-USDC', value: '13' },
];

const LP_TOKEN_ADDRESSES = {
  0: '0x6AC38A4C112F125eac0eBDbaDBed0BC8F4575d0d',
  1: '0x9f378F48d0c1328fd0C80d7Ae544c6CadB5Ba99E',
  2: '0x48658E69D741024b4686C8f7b236D3F1D291f386',
  3: '0x04Dec678825b8DfD2D0d9bD83B538bE3fbDA2926',
  4: '0x7d4daa9eB74264b082A92F3f559ff167224484aC',
  5: '0xCF329b34049033dE26e4449aeBCb41f1992724D3',
  6: '0x78C893E262e2681Dbd6B6eBA6CCA2AaD45de19AD',
  7: '0x00BD81c9bAc29a3b6aea7ABc92d2C9a3366Bb4dD',
  8: '0xaFC1fBc3F3fB517EB54Bb2472051A6f0b2105320',
  9: '0x561091E2385C90d41b4c0dAef651A4b33E1a5CfE',
  10: '0xF3EabeD6Bd905e0FcD68FC3dBCd6e3A4aEE55E98',
  11: '0xfAa8507e822397bd56eFD4480Fb12ADC41ff940B',
  12: '0x79724B6996502afc773feB3Ff8Bb3C23ADf2854B',
  13: '0x59D642B471dd54207Cb1CDe2e7507b0Ce1b1a6a5',
};

const LP_STAKING_ADDRESS = '0xB04e8D6aED037904B77A9F0b08002592925833b7';
const DFK_RPC = 'https://subnets.avax.network/defi-kingdoms/dfk-chain/rpc';
const provider = new ethers.JsonRpcProvider(DFK_RPC);

const LP_STAKING_ABI = [
  'function getUserInfo(uint256 pid, address user) view returns (uint256 amount, int256 rewardDebt, uint256 lastDepositTimestamp)',
  'function getPoolInfo(uint256 pid) view returns (address lpToken, uint256 allocPoint, uint256 lastRewardTime, uint256 accSushiPerShare, uint256 totalStaked)'
];

const lpStakingContract = new ethers.Contract(LP_STAKING_ADDRESS, LP_STAKING_ABI, provider);

export const data = new SlashCommandBuilder()
  .setName('garden-apr-debug')
  .setDescription('Debug APR calculations for a garden pool with transparent math')
  .addStringOption(option =>
    option.setName('pool')
      .setDescription('Garden pool (Token0-Token1)')
      .setRequired(true)
      .addChoices(...POOL_CHOICES)
  )
  .addStringOption(option =>
    option.setName('wallet')
      .setDescription('Your wallet address to check staked LP position')
      .setRequired(false)
  )
  .addStringOption(option =>
    option.setName('hero1')
      .setDescription('First gardening hero ID')
      .setRequired(false)
  )
  .addStringOption(option =>
    option.setName('pet1')
      .setDescription('Pet ID equipped to hero 1 (or leave blank for auto-detect)')
      .setRequired(false)
  )
  .addStringOption(option =>
    option.setName('hero2')
      .setDescription('Second gardening hero ID')
      .setRequired(false)
  )
  .addStringOption(option =>
    option.setName('pet2')
      .setDescription('Pet ID equipped to hero 2 (or leave blank for auto-detect)')
      .setRequired(false)
  );

async function getUserStakedPosition(pid, walletAddress, poolTvlUsd) {
  try {
    console.log(`[GardenAprDebug] Fetching staked position for pid=${pid}, wallet=${walletAddress}`);
    const userInfo = await lpStakingContract.getUserInfo(pid, walletAddress);
    const poolInfo = await lpStakingContract.getPoolInfo(pid);
    
    const stakedAmount = userInfo[0];
    const totalStaked = poolInfo[4];
    
    console.log(`[GardenAprDebug] User staked: ${stakedAmount}, Total staked: ${totalStaked}, Pool TVL: $${poolTvlUsd}`);
    
    if (stakedAmount === 0n || totalStaked === 0n) {
      console.log(`[GardenAprDebug] No staked LP found (stakedAmount=${stakedAmount}, totalStaked=${totalStaked})`);
      return { stakedLp: 0, userTvlUsd: 0, poolShare: 0 };
    }
    
    const stakedLpFormatted = parseFloat(ethers.formatEther(stakedAmount));
    const totalStakedFormatted = parseFloat(ethers.formatEther(totalStaked));
    
    const poolShare = stakedLpFormatted / totalStakedFormatted;
    const userTvlUsd = poolTvlUsd * poolShare;
    
    console.log(`[GardenAprDebug] LP position found: ${stakedLpFormatted} LP, share=${(poolShare*100).toFixed(4)}%, TVL=$${userTvlUsd.toFixed(2)}`);
    
    return { stakedLp: stakedLpFormatted, userTvlUsd, poolShare };
  } catch (error) {
    console.error(`[GardenAprDebug] Error fetching staked position:`, error.message);
    return null;
  }
}

function formatHeroForYield(hero) {
  return {
    id: hero.id,
    wisdom: hero.wisdom || 0,
    vitality: hero.vitality || 0,
    gardening: hero.gardening || 0,
    level: hero.level || 1,
    professionStr: hero.professionStr,
    hasGardeningGene: hero.professionStr?.toLowerCase() === 'gardening',
  };
}

/**
 * Find optimal stamina per quest that maximizes daily yield
 * Tests 10-35 stamina options and picks the best based on:
 * - Quest duration (10s/stam with garden gene, 12s without)
 * - Stamina regeneration time (affected by Rapid Renewal)
 * - Total iteration time = max(quest time, regen time)
 */
function findOptimalAttempts(hero, factor, powerSurgeMultiplier, staminaPerDay, hasGardenGene) {
  let best = { attempts: 25, runsPerDay: 0, dailyYield: 0, iterationMins: 0 };
  
  const questDurationPerStamMins = hasGardenGene ? (10 / 60) : (12 / 60); // seconds to minutes
  
  for (let attempts = 10; attempts <= 35; attempts++) {
    // Quest duration in minutes
    const questDurationMins = attempts * questDurationPerStamMins;
    
    // Regen time in minutes (how long to recover 'attempts' stamina)
    const regenMins = (attempts / staminaPerDay) * 24 * 60;
    
    // Iteration time: quest and regen overlap - whichever takes longer is the bottleneck
    // Can only start next quest when BOTH quest completes AND stamina is ready
    const iterationMins = Math.max(questDurationMins, regenMins);
    
    // Runs per day
    const runsPerDay = (24 * 60) / iterationMins;
    
    // Per-run yield (per-attempt * attempts * power surge)
    const crystalPerRun = CRYSTAL_BASE_PER_ATTEMPT * factor * powerSurgeMultiplier * attempts;
    const jewelPerRun = JEWEL_BASE_PER_ATTEMPT * factor * powerSurgeMultiplier * attempts;
    
    // Daily yield
    const dailyYield = (crystalPerRun + jewelPerRun) * runsPerDay;
    
    if (dailyYield > best.dailyYield) {
      best = { 
        attempts, 
        runsPerDay, 
        dailyYield, 
        iterationMins,
        crystalPerRun,
        jewelPerRun,
        crystalPerDay: crystalPerRun * runsPerDay,
        jewelPerDay: jewelPerRun * runsPerDay
      };
    }
  }
  
  return best;
}

function computeHeroQuestApr(hero, pet, poolMeta, { hasGravityFeeder = false, hasRapidRenewal = false } = {}) {
  const formatted = formatHeroForYield(hero);
  
  let gardeningSkillBase = (hero.gardening || 0) / 10;
  let petBonus = 0;
  let petBonusType = null;
  let petFed = false;
  
  if (pet) {
    const gardenBonus = calculatePetGardenBonus(pet);
    // Pet is fed if manually fed OR if Gravity Feeder is active (auto-feeds during expeditions)
    petFed = pet.isFed || hasGravityFeeder;
    if (gardenBonus.isGardeningPet && gardenBonus.questBonusPct > 0) {
      if (gardenBonus.description?.includes('Skilled Greenskeeper')) {
        gardeningSkillBase += gardenBonus.questBonusPct / 10;
        petBonus = gardenBonus.questBonusPct;
        petBonusType = 'Skilled Greenskeeper';
      } else if (gardenBonus.description?.includes('Power Surge')) {
        petBonus = gardenBonus.questBonusPct;
        petBonusType = 'Power Surge';
      }
    }
  }
  
  const wis = hero.wisdom || 0;
  const vit = hero.vitality || 0;
  const hasGardenGene = formatted.hasGardeningGene;
  
  // Use hero-yield-model for factor calculation (single source of truth)
  // Skilled Greenskeeper adds to gardening skill (affecting factor) - ADDITIVE
  // Power Surge is a multiplicative bonus applied to yields/APR - MULTIPLICATIVE (applied ONCE below)
  const yieldData = computePerQuestYield(hero, {
    petBonusPct: 0, // Don't apply Power Surge here - we'll apply it once below for consistency
    petFed: petFed,
    hasRapidRenewal: hasRapidRenewal,
    skilledGreenskeeperBonus: petBonusType === 'Skilled Greenskeeper' ? petBonus : 0
  });
  
  const factor = yieldData.factor;
  const staminaPerDay = yieldData.staminaPerDay;
  
  // Calculate Power Surge multiplier (applied ONCE to both yields and APR)
  const powerSurgeMultiplier = (petBonusType === 'Power Surge' && petBonus > 0 && petFed) 
    ? (1 + petBonus / 100) 
    : 1;
  
  // Find optimal stamina setting that maximizes daily yield
  const optimal = findOptimalAttempts(hero, factor, powerSurgeMultiplier, staminaPerDay, hasGardenGene);
  
  // Calculate 25-stam values (what users typically expect/compare to)
  // Show BASE (no pet) and WITH PET values for comparison to spreadsheets
  const baseline25Base = {
    crystalPerRun: CRYSTAL_BASE_PER_ATTEMPT * factor * 25,
    jewelPerRun: JEWEL_BASE_PER_ATTEMPT * factor * 25,
  };
  const baseline25WithPet = {
    crystalPerRun: CRYSTAL_BASE_PER_ATTEMPT * factor * powerSurgeMultiplier * 25,
    jewelPerRun: JEWEL_BASE_PER_ATTEMPT * factor * powerSurgeMultiplier * 25,
  };
  // 25-stam runs per day: stamina regen / 25
  const baseline25RunsPerDay = staminaPerDay / 25;
  
  // Use optimal values for display
  const crystalPerQuest = optimal.crystalPerRun;
  const jewelPerQuest = optimal.jewelPerRun;
  
  // Calculate APR scale with Power Surge applied
  // Baseline using spreadsheet formula: 0.1 + (50+50)/1222.22 + 0/244.44 = 0.182
  const baselineFactor = 0.1 + (50 + 50) / 1222.22;
  const scale = (factor / baselineFactor) * powerSurgeMultiplier;
  
  const bestQuestAprStr = poolMeta?.gardeningQuestAPR?.best || '0%';
  const bestQuestApr = parseFloat(bestQuestAprStr.replace('%', ''));
  
  const heroQuestApr = bestQuestApr * scale;
  
  return {
    heroQuestApr,
    factor,
    gardeningSkill: gardeningSkillBase,
    hasGardenGene,
    petBonus,
    petBonusType,
    petFed,
    wis,
    vit,
    crystalPerQuest,
    jewelPerQuest,
    staminaPerDay,
    hasRapidRenewal,
    // Optimal stamina settings
    optimalAttempts: optimal.attempts,
    optimalRunsPerDay: optimal.runsPerDay,
    optimalIterationMins: optimal.iterationMins,
    crystalPerDay: optimal.crystalPerDay,
    jewelPerDay: optimal.jewelPerDay,
    // 25-stam values for comparison (base = no pet, withPet = with Power Surge if applicable)
    baseline25BaseCrystal: baseline25Base.crystalPerRun,
    baseline25BaseJewel: baseline25Base.jewelPerRun,
    baseline25WithPetCrystal: baseline25WithPet.crystalPerRun,
    baseline25WithPetJewel: baseline25WithPet.jewelPerRun,
    baseline25RunsPerDay: baseline25RunsPerDay,
  };
}

export async function execute(interaction) {
  // Note: deferReply is now called in bot.js before execute() to prevent Discord timeout
  // Only defer if not already deferred (for backward compatibility)
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply();
  }
  
  try {
    const poolValue = interaction.options.getString('pool');
    const pid = parseInt(poolValue, 10);
    const walletAddress = interaction.options.getString('wallet');
    const hero1Id = interaction.options.getString('hero1');
    const pet1Id = interaction.options.getString('pet1');
    const hero2Id = interaction.options.getString('hero2');
    const pet2Id = interaction.options.getString('pet2');
    
    console.log(`[GardenAprDebug] Pool=${pid}, Wallet=${walletAddress || 'none'}, Hero1=${hero1Id || 'none'}, Hero2=${hero2Id || 'none'}`);
    
    const cache = getCachedPoolAnalytics();
    
    if (!cache || !cache.data || cache.data.length === 0) {
      return interaction.editReply('Pool cache not available. Please try again in a few minutes.');
    }
    
    const pool = cache.data.find(p => p.pid === pid);
    
    if (!pool) {
      return interaction.editReply(`Pool ${POOL_CHOICES[pid]?.name || pid} not found in cache.`);
    }
    
    const poolName = pool.pairName || POOL_CHOICES[pid]?.name || `Pool ${pid}`;
    const volume24hUsd = pool.volume24hUSD || 0;
    const poolTvlUsd = typeof pool.totalTVL === 'number' ? pool.totalTVL : 0;
    
    const harvestAprRaw = parseFloat(String(pool.harvesting24hAPR || '0').replace('%', ''));
    const harvestAprPct = getHarvestAprPct({ harvestAprPctFromAnalytics: harvestAprRaw });
    
    let userTvlUsd = null;
    let userPosition = null;
    let hasGravityFeeder = false;
    
    if (walletAddress) {
      // Fetch staked position and power-up status in parallel
      const [positionResult, powerUpStatus] = await Promise.all([
        getUserStakedPosition(pid, walletAddress, poolTvlUsd),
        getWalletPowerUpStatus(walletAddress).catch(err => {
          console.warn(`[GardenAprDebug] Failed to fetch power-up status: ${err.message}`);
          return null;
        })
      ]);
      
      userPosition = positionResult;
      if (userPosition && userPosition.userTvlUsd > 0) {
        userTvlUsd = userPosition.userTvlUsd;
      }
      
      // Check if Gravity Feeder is active (auto-feeds pets during expeditions)
      // Note: For this gardening APR command, we assume the hero WILL be gardening,
      // so Gravity Feeder bonus applies since gardening is an expedition quest type.
      hasGravityFeeder = powerUpStatus?.gravityFeeder?.active || false;
      console.log(`[GardenAprDebug] Gravity Feeder: ${hasGravityFeeder ? 'ACTIVE' : 'inactive'}`);
    }
    
    const feeData = computeFeeAprWithShare({ 
      volume24hUsd, 
      poolTvlUsd, 
      userTvlUsd 
    });
    
    const totalBaseApr = computeTotalBaseAprPct({ 
      feeAprPct: feeData.poolAprPct, 
      harvestAprPct 
    });
    
    const cacheAge = cache.lastUpdated ? Math.floor((Date.now() - cache.lastUpdated) / 60000) : '?';
    
    const embed = new EmbedBuilder()
      .setColor('#00AA44')
      .setTitle(`APR Debug: ${poolName}`)
      .setDescription(`Pool ID: ${pid} | Data age: ${cacheAge} min`)
      .setTimestamp();
    
    embed.addFields({
      name: 'Pool Metrics',
      value: [
        `**24h Volume:** $${volume24hUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        `**Pool TVL:** $${poolTvlUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      ].join('\n'),
      inline: false
    });
    
    if (userPosition && userPosition.userTvlUsd > 0) {
      embed.addFields({
        name: 'Your Position',
        value: [
          `**Wallet:** \`${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}\``,
          `**Staked LP:** ${userPosition.stakedLp.toFixed(6)}`,
          `**Your TVL:** $${userPosition.userTvlUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
          `**Pool Share:** ${(userPosition.poolShare * 100).toFixed(6)}%`,
          `**Your Daily Fees:** $${feeData.userFees24hUsd !== undefined ? feeData.userFees24hUsd.toFixed(4) : 'N/A'}`
        ].join('\n'),
        inline: false
      });
    } else if (walletAddress) {
      embed.addFields({
        name: 'Your Position',
        value: `No staked LP found for \`${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}\` in this pool.`,
        inline: false
      });
    }
    
    // Get JEWEL price for daily earnings calculation
    let jewelPrice = 0;
    try {
      jewelPrice = await getJewelPrice();
    } catch (e) {
      console.log(`[GardenAprDebug] Could not fetch JEWEL price: ${e.message}`);
    }
    
    // Calculate daily JEWEL earnings based on user position or pool TVL
    const effectiveTvl = userTvlUsd || poolTvlUsd;
    const feeJewelPerDay = jewelPrice > 0 && effectiveTvl > 0 
      ? (effectiveTvl * (feeData.poolAprPct / 100) / 365) / jewelPrice 
      : 0;
    const harvestJewelPerDay = jewelPrice > 0 && effectiveTvl > 0 
      ? (effectiveTvl * (harvestAprPct / 100) / 365) / jewelPrice 
      : 0;
    
    const feeAprLines = [
      `**Fee APR:** ${feeData.poolAprPct.toFixed(4)}%`
    ];
    if (userTvlUsd && feeJewelPerDay > 0) {
      feeAprLines.push(`**Your Daily Fees:** ~${feeJewelPerDay.toFixed(4)} JEWEL`);
    }
    
    embed.addFields({
      name: 'Fee APR (LP share: 0.20% of swaps)',
      value: feeAprLines.join('\n'),
      inline: false
    });
    
    const harvestAprLines = [
      `**Harvest APR:** ${harvestAprPct.toFixed(4)}%`
    ];
    if (userTvlUsd && harvestJewelPerDay > 0) {
      harvestAprLines.push(`**Your Daily Harvest:** ~${harvestJewelPerDay.toFixed(4)} JEWEL`);
    }
    
    embed.addFields({
      name: 'Harvest APR',
      value: harvestAprLines.join('\n'),
      inline: false
    });
    
    embed.addFields({
      name: 'Total Base APR (passive, no questing)',
      value: [
        `Fee APR: ${feeData.poolAprPct.toFixed(4)}%`,
        `Harvest APR: ${harvestAprPct.toFixed(4)}%`,
        `────────────`,
        `**Total Base APR: ${totalBaseApr.toFixed(4)}%**`
      ].join('\n'),
      inline: false
    });
    
    let questAprTotal = 0;
    const heroResults = [];
    
    if (hero1Id || hero2Id) {
      console.log(`[GardenAprDebug] Processing heroes: hero1Id=${hero1Id}, hero2Id=${hero2Id}`);
      
      const poolMeta = {
        gardeningQuestAPR: pool.gardeningQuestAPR || { worst: '0%', best: '0%' }
      };
      
      const fetchPromises = [];
      
      if (hero1Id) {
        console.log(`[GardenAprDebug] Fetching hero1: ${hero1Id}`);
        fetchPromises.push(
          (async () => {
            try {
              const hero = await getHeroById(hero1Id);
              console.log(`[GardenAprDebug] Hero1 result: ${hero ? `Found (class=${hero.mainClassStr})` : 'null'}`);
              let pet = null;
              let petSource = null;
              if (pet1Id) {
                pet = await fetchPetById(pet1Id);
                petSource = 'manual';
              } else if (hero) {
                pet = await fetchPetForHero(hero1Id);
                petSource = pet ? 'auto' : null;
              }
              return { hero, pet, heroId: hero1Id, petId: pet1Id, petSource, slot: 1 };
            } catch (err) {
              console.error(`[GardenAprDebug] Error fetching hero1:`, err.message);
              return { hero: null, pet: null, heroId: hero1Id, petId: pet1Id, petSource: null, slot: 1 };
            }
          })()
        );
      }
      
      if (hero2Id) {
        console.log(`[GardenAprDebug] Fetching hero2: ${hero2Id}`);
        fetchPromises.push(
          (async () => {
            try {
              const hero = await getHeroById(hero2Id);
              console.log(`[GardenAprDebug] Hero2 result: ${hero ? `Found (class=${hero.mainClassStr})` : 'null'}`);
              let pet = null;
              let petSource = null;
              if (pet2Id) {
                pet = await fetchPetById(pet2Id);
                petSource = 'manual';
              } else if (hero) {
                pet = await fetchPetForHero(hero2Id);
                petSource = pet ? 'auto' : null;
              }
              return { hero, pet, heroId: hero2Id, petId: pet2Id, petSource, slot: 2 };
            } catch (err) {
              console.error(`[GardenAprDebug] Error fetching hero2:`, err.message);
              return { hero: null, pet: null, heroId: hero2Id, petId: pet2Id, petSource: null, slot: 2 };
            }
          })()
        );
      }
      
      const results = await Promise.all(fetchPromises);
      console.log(`[GardenAprDebug] All hero fetches complete. Results count: ${results.length}`);
      
      for (const result of results) {
        if (!result.hero) {
          heroResults.push({ slot: result.slot, error: `Hero #${result.heroId} not found` });
          continue;
        }
        
        // Check if hero has Rapid Renewal active (if wallet provided)
        let hasRapidRenewal = false;
        if (walletAddress) {
          try {
            hasRapidRenewal = await isHeroRapidRenewalActive(walletAddress, result.heroId);
            console.log(`[GardenAprDebug] Hero ${result.heroId} RR status: ${hasRapidRenewal}`);
          } catch (err) {
            console.warn(`[GardenAprDebug] Failed to check RR for hero ${result.heroId}: ${err.message}`);
          }
        }
        
        const questData = computeHeroQuestApr(result.hero, result.pet, poolMeta, { hasGravityFeeder, hasRapidRenewal });
        questAprTotal += questData.heroQuestApr;
        
        const className = result.hero.mainClassStr || result.hero.class || result.hero.heroClass || 'Unknown';
        const rarity = result.hero.rarity || 'Common';
        
        let petInfo = 'None';
        if (result.pet) {
          const rawId = Number(result.pet.id);
          // Normalize pet ID: use modulo 1000000 to strip chain prefix
          // e.g., 1999998066514 -> 66514, 2000000123456 -> 123456
          const petIdNormalized = rawId % 1000000;
          petInfo = `#${petIdNormalized}`;
          if (result.petSource === 'auto') {
            petInfo += ' (auto)';
          }
          if (questData.petBonusType) {
            petInfo += ` [${questData.petBonusType} +${questData.petBonus}%]`;
          }
        } else if (result.petSource === null && !result.petId) {
          petInfo = 'None equipped';
        }
        
        heroResults.push({
          slot: result.slot,
          heroId: result.heroId,
          className,
          rarity,
          level: result.hero.level,
          wis: questData.wis,
          vit: questData.vit,
          gardening: result.hero.gardening,
          hasGardenGene: questData.hasGardenGene,
          hasRapidRenewal: questData.hasRapidRenewal,
          factor: questData.factor,
          staminaPerDay: questData.staminaPerDay,
          questApr: questData.heroQuestApr,
          petInfo,
          petBonus: questData.petBonus,
          petBonusType: questData.petBonusType,
          // Optimal stamina settings
          optimalAttempts: questData.optimalAttempts,
          optimalRunsPerDay: questData.optimalRunsPerDay,
          optimalIterationMins: questData.optimalIterationMins,
          crystalPerQuest: questData.crystalPerQuest,
          jewelPerQuest: questData.jewelPerQuest,
          crystalPerDay: questData.crystalPerDay,
          jewelPerDay: questData.jewelPerDay,
          // 25-stam values for comparison
          baseline25BaseCrystal: questData.baseline25BaseCrystal,
          baseline25BaseJewel: questData.baseline25BaseJewel,
          baseline25WithPetCrystal: questData.baseline25WithPetCrystal,
          baseline25WithPetJewel: questData.baseline25WithPetJewel,
        });
      }
      
      for (const hr of heroResults) {
        if (hr.error) {
          embed.addFields({
            name: `Hero ${hr.slot}`,
            value: hr.error,
            inline: false
          });
        } else {
          const geneIcon = hr.hasGardenGene ? ' [G]' : '';
          const rrIcon = hr.hasRapidRenewal ? ' [RR]' : '';
          
          // Normalize hero ID for display
          const displayHeroId = Number(hr.heroId) % 1000000;
          
          // Build yield lines - show base and with-pet if Power Surge active
          const yieldLines = [];
          yieldLines.push(`**@25 stam (base):** ${hr.baseline25BaseCrystal.toFixed(1)} CRYSTAL | ${hr.baseline25BaseJewel.toFixed(2)} JEWEL`);
          
          // Only show "with pet" line if there's actually a pet bonus
          if (hr.petBonus > 0 && hr.petBonusType === 'Power Surge') {
            yieldLines.push(`**@25 stam (+pet):** ${hr.baseline25WithPetCrystal.toFixed(1)} CRYSTAL | ${hr.baseline25WithPetJewel.toFixed(2)} JEWEL`);
          }
          
          embed.addFields({
            name: `Hero ${hr.slot}: #${displayHeroId}${geneIcon}${rrIcon}`,
            value: [
              `**Class:** ${hr.className} | **Rarity:** ${hr.rarity} | **Lvl:** ${hr.level}`,
              `**Stats:** WIS ${hr.wis} | VIT ${hr.vit} | Grd ${hr.gardening} | Factor: ${hr.factor.toFixed(2)}`,
              `**Pet:** ${hr.petInfo}`,
              ...yieldLines,
              `**Optimal:** ${hr.optimalAttempts} stam | ${hr.optimalRunsPerDay.toFixed(1)} runs/day`,
              `**Daily:** ${hr.crystalPerDay.toFixed(1)} CRYSTAL | ${hr.jewelPerDay.toFixed(2)} JEWEL`,
              `**Quest APR:** ${hr.questApr.toFixed(4)}%`
            ].join('\n'),
            inline: true
          });
        }
      }
      
      if (heroResults.length > 0 && heroResults.some(h => !h.error)) {
        const validHeroes = heroResults.filter(h => !h.error);
        const avgQuestApr = questAprTotal / validHeroes.length;
        
        const grandTotalApr = totalBaseApr + avgQuestApr;
        
        embed.addFields({
          name: 'TOTAL POOL + QUEST APR',
          value: [
            `Base APR: ${totalBaseApr.toFixed(4)}%`,
            `Quest APR: ${avgQuestApr.toFixed(4)}%`,
            `════════════════`,
            `**TOTAL APR: ${grandTotalApr.toFixed(4)}%**`
          ].join('\n'),
          inline: false
        });
        
        embed.setFooter({ 
          text: 'Factor: 0.1 + (WIS+VIT)/1222.22 + Grd/244.44 | Yields are relative (compare heroes)' 
        });
      }
    }
    
    if (!hero1Id && !hero2Id) {
      const bestQuestAprStr = pool.gardeningQuestAPR?.best || '0%';
      const worstQuestAprStr = pool.gardeningQuestAPR?.worst || '0%';
      
      embed.addFields({
        name: 'Quest APR (add heroes to calculate)',
        value: [
          `**Pool Quest APR Range:** ${worstQuestAprStr} - ${bestQuestAprStr}`,
          `Add hero1/hero2 options to calculate your personalized quest APR.`
        ].join('\n'),
        inline: false
      });
    }
    
    console.log(`[GardenAprDebug] Generated APR debug for ${poolName}: Base=${totalBaseApr.toFixed(2)}%, Quest=${questAprTotal.toFixed(2)}%`);
    
    return interaction.editReply({ embeds: [embed] });
    
  } catch (error) {
    console.error('[GardenAprDebug] Error:', error);
    return interaction.editReply(`Error generating APR debug: ${error.message}`);
  }
}
