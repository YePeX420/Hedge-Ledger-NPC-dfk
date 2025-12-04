import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { ethers } from 'ethers';
import { getAllHeroesByOwner } from '../onchain-data.js';
import { fetchPetsForWallet, annotateHeroesWithPets } from '../pet-data.js';
import { groupHeroesByGardenPool, computeGardenScore } from '../garden-pairs.js';
import { 
  computeHeroGardeningFactor, 
  computeStaminaPerDay,
  CRYSTAL_BASE_PER_ATTEMPT,
  JEWEL_BASE_PER_ATTEMPT
} from '../hero-yield-model.js';
import { arePetsFedByGravityFeeder, getWalletPowerUpStatus } from '../rapid-renewal-service.js';
import { detectPairsWithRoles } from '../hero-pairing.js';

const GARDEN_POOLS = [
  { pid: 0, name: 'wJEWEL-xJEWEL' },
  { pid: 1, name: 'CRYSTAL-AVAX' },
  { pid: 2, name: 'CRYSTAL-wJEWEL' },
  { pid: 3, name: 'CRYSTAL-USDC' },
  { pid: 4, name: 'ETH-USDC' },
  { pid: 5, name: 'wJEWEL-USDC' },
  { pid: 6, name: 'CRYSTAL-ETH' },
  { pid: 7, name: 'CRYSTAL-BTC.b' },
  { pid: 8, name: 'CRYSTAL-KLAY' },
  { pid: 9, name: 'wJEWEL-KLAY' },
  { pid: 10, name: 'wJEWEL-AVAX' },
  { pid: 11, name: 'wJEWEL-BTC.b' },
  { pid: 12, name: 'wJEWEL-ETH' },
  { pid: 13, name: 'BTC.b-USDC' }
];

export const data = new SlashCommandBuilder()
  .setName('debug-garden-pair')
  .setDescription('Debug gardening pair yields - show hero stats, pets, and per-run output')
  .addStringOption(option =>
    option.setName('wallet')
      .setDescription('Wallet address')
      .setRequired(true)
  )
  .addStringOption(option =>
    option.setName('pool')
      .setDescription('Garden pool')
      .setRequired(true)
      .addChoices(
        ...GARDEN_POOLS.map(p => ({ name: p.name, value: String(p.pid) }))
      )
  );

export async function execute(interaction) {
  // Note: deferReply is now called in bot.js before execute()
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply();
  }
  
  try {
    const walletAddress = interaction.options.getString('wallet').toLowerCase();
    const poolId = parseInt(interaction.options.getString('pool'), 10);
    
    if (!ethers.isAddress(walletAddress)) {
      return interaction.editReply('Invalid wallet address format');
    }
    
    const poolInfo = GARDEN_POOLS.find(p => p.pid === poolId);
    if (!poolInfo) {
      return interaction.editReply(`Invalid pool ID: ${poolId}`);
    }
    
    console.log(`[DebugPair] Fetching heroes for wallet ${walletAddress}...`);
    
    const [heroes, pets, powerUpStatus] = await Promise.all([
      getAllHeroesByOwner(walletAddress),
      fetchPetsForWallet(walletAddress),
      getWalletPowerUpStatus(walletAddress)
    ]);
    
    // Wild Unknown = access to Expeditions (required for gardening expeditions)
    // Gravity Feeder = auto-feeds pets during expeditions
    const hasWildUnknown = powerUpStatus.wildUnknown.active;
    const hasGravityFeeder = powerUpStatus.gravityFeeder.active;
    
    console.log(`[DebugPair] Found ${heroes.length} heroes, ${pets.length} pets, GF=${hasGravityFeeder}`);
    
    const pairingResult = await detectPairsWithRoles(walletAddress, heroes, true);
    console.log(`[DebugPair] Detected ${pairingResult.pairs.length} pairs total`);
    
    const poolPairs = pairingResult.pools[poolId] || [];
    
    // Get gardening hero IDs for targeted pet fallback lookup
    const gardeningHeroIds = poolPairs.flatMap(p => p.heroIds);
    console.log(`[DebugPair] Checking pets for gardening heroes: ${gardeningHeroIds.join(', ')}`);
    
    // Use heroToPet fallback for gardening heroes that are missing from getUserPetsV2
    const annotatedHeroes = await annotateHeroesWithPets(
      heroes.map(h => ({ hero: h, heroMeta: {} })),
      pets,
      { 
        gravityFeederActive: hasGravityFeeder,
        targetHeroIds: gardeningHeroIds.map(String)  // Priority lookup for gardening heroes
      }
    );
    
    const heroMetaMap = new Map();
    for (const h of annotatedHeroes) {
      const heroId = h.hero?.normalizedId || h.hero?.id;
      if (heroId) heroMetaMap.set(Number(heroId), h);
    }
    
    // Log final pet status for gardening heroes
    for (const heroId of gardeningHeroIds) {
      const annotated = heroMetaMap.get(heroId);
      if (annotated?.heroMeta?.pet) {
        const pet = annotated.heroMeta.pet;
        console.log(`[DebugPair] Hero #${heroId} has Pet #${pet.id} equipped (${pet.gatheringType}, fed=${annotated.heroMeta.petIsFed})`);
      } else {
        console.log(`[DebugPair] Hero #${heroId} has NO pet equipped (confirmed via heroToPet)`);
      }
    }
    
    if (poolPairs.length === 0) {
      return interaction.editReply(`No heroes currently gardening pool ${poolId} (${poolInfo.name})`);
    }
    
    const detectionSource = pairingResult.source === 'expedition_api' 
      ? 'Expedition API (accurate)' 
      : pairingResult.source === 'active_quests'
        ? 'Active Quests (contract)'
        : 'CurrentQuest (fallback)';
    
    // Build power-up status summary
    const powerUpInfo = [];
    if (hasWildUnknown) {
      powerUpInfo.push(`Wild Unknown: ✅ (${powerUpStatus.wildUnknown.heroSlots} slots)`);
    } else {
      powerUpInfo.push(`Wild Unknown: ❌ (no expeditions)`);
    }
    if (hasGravityFeeder) {
      powerUpInfo.push(`Gravity Feeder: ✅ (pets auto-fed)`);
    } else {
      powerUpInfo.push(`Gravity Feeder: ❌ (pets need manual feeding)`);
    }
    
    const embed = new EmbedBuilder()
      .setColor('#2ecc71')
      .setTitle(`Garden Debug: ${poolInfo.name} (Pool ${poolId})`)
      .setDescription(`Found ${poolPairs.length} pairs gardening this pool\nPairing Source: ${detectionSource}\n${powerUpInfo.join(' | ')}`)
      .setTimestamp();
    
    let totalGardenScore = 0;
    
    for (let i = 0; i < poolPairs.length; i++) {
      const pair = poolPairs[i];
      const actualAttempts = pair.attempts || 25;
      
      const heroDetails = [];
      for (const heroId of pair.heroIds) {
        const annotated = heroMetaMap.get(heroId);
        if (!annotated) continue;
        
        const hero = annotated.hero || annotated;
        const heroMeta = annotated.heroMeta || {};
        
        const vit = hero.vitality || 0;
        const wis = hero.wisdom || 0;
        const gardeningRaw = hero.gardening || 0;
        const gardeningSkill = gardeningRaw / 10;
        const hasGardenGene = hero.professionStr?.toLowerCase() === 'gardening' || hero.hasGardeningGene;
        const level = hero.level || 1;
        
        const pet = heroMeta.pet || null;
        const petBonus = heroMeta.petGardenBonus || {};
        const petGatheringSkill = pet?.gatheringBonusScalar || 0; // From pet object directly
        const petBonusPct = petBonus.questBonusPct || 0;
        const petFed = heroMeta.petIsFed !== false; // From heroMeta, not petBonus
        
        const stamPerDay = computeStaminaPerDay(hero, { hasRapidRenewal: heroMeta?.hasRapidRenewal });
        const factor = computeHeroGardeningFactor(hero);
        const { score: gardenScore } = computeGardenScore(hero, heroMeta);
        totalGardenScore += gardenScore;
        
        heroDetails.push({
          heroId,
          level,
          vit,
          wis,
          gardeningSkill,
          hasGardenGene,
          hasRapidRenewal: heroMeta?.hasRapidRenewal || false,
          stamPerDay,
          pet,
          petGatheringSkill,
          petBonusPct,
          petFed,
          factor,
          gardenScore,
          hero,
          role: heroId === pair.jewelHeroId ? 'JEWEL' : 'CRYSTAL'
        });
      }
      
      const h1 = heroDetails[0];
      const h2 = heroDetails[1];
      
      let pairText = formatHeroLine(h1);
      if (h2) {
        pairText += '\n' + formatHeroLine(h2);
      }
      
      const iterationAnalysis = calculateActualIteration(h1, h2, actualAttempts, pair);
      const yieldResult = estimatePerRunYield(h1, h2, actualAttempts);
      const { crystalPerRun, jewelPerRun } = yieldResult;
      
      const roleSource = pair.rolesSource?.startsWith('reward_history') ? '(verified)' : '(heuristic)';
      const durationLabel = iterationAnalysis.isActualDuration ? '' : '~';
      const gatingNote = iterationAnalysis.gatingFactor === 'regen' ? ' [regen-gated]' : '';
      
      pairText += `\n**Roles:** JEWEL:#${pair.jewelHeroId} CRYSTAL:#${pair.crystalHeroId} ${roleSource}`;
      pairText += `\n**Per Run:** ~${crystalPerRun.toFixed(1)} CRYSTAL, ~${jewelPerRun.toFixed(1)} JEWEL`;
      
      if (pair.iterationTimeStr) {
        pairText += `\n**Iteration:** ${pair.iterationTimeStr} (${actualAttempts} stam/hero = ${iterationAnalysis.totalStaminaUsed} total)`;
      } else {
        pairText += `\n**Iteration:** ${durationLabel}${formatTime(iterationAnalysis.iterationMins)} (${actualAttempts} stam/hero = ${iterationAnalysis.totalStaminaUsed} total)${gatingNote}`;
      }
      
      pairText += `\n**Regen:** ${iterationAnalysis.staminaRegen.toFixed(1)}/${iterationAnalysis.totalStaminaUsed} stam (${iterationAnalysis.sustainable ? 'sustainable' : 'deficit'})`;
      pairText += `\n**Runs/Day:** ~${iterationAnalysis.runsPerDay.toFixed(1)}`;
      
      embed.addFields({
        name: `Pair ${i + 1}`,
        value: pairText,
        inline: false
      });
    }
    
    embed.addFields({
      name: 'Summary',
      value: `Total Pairs: ${poolPairs.length}\nTotal Garden Score: ${totalGardenScore.toFixed(2)}`,
      inline: false
    });
    
    embed.setFooter({ 
      text: 'Factor: 0.1 + (WIS+VIT)/1222.22 + Grd/244.44 | Yields are relative (compare heroes)' 
    });
    
    return interaction.editReply({ embeds: [embed] });
    
  } catch (error) {
    console.error('[DebugPair] Error:', error);
    return interaction.editReply(`Error: ${error.message}`);
  }
}

function formatHeroLine(h) {
  const geneIcon = h.hasGardenGene ? ' [G]' : '';
  const rrIcon = h.hasRapidRenewal ? ' [RR]' : '';
  const petInfo = h.pet 
    ? ` | Pet #${h.pet.id} (${h.pet.gatheringType}, +${h.petBonusPct.toFixed(1)}%)${h.petFed ? '' : ' [hungry]'}`
    : ' | No pet';
  
  // Show gardening skill and calculated factor
  return `Hero #${h.heroId}${geneIcon}${rrIcon} L${h.level} | VIT:${h.vit} WIS:${h.wis} Grd:${h.gardeningSkill.toFixed(0)} F:${h.factor.toFixed(2)}${petInfo}`;
}

function findOptimalAttemptsForPair(h1, h2, hero1, hero2) {
  let best = { attempts: 25, iterationMins: 0, runsPerDay: 0, dailyYield: 0 };
  
  const stamPerDay1 = computeStaminaPerDay(hero1, { hasRapidRenewal: h1.hasRapidRenewal });
  const stamPerDay2 = hero2 ? computeStaminaPerDay(hero2, { hasRapidRenewal: h2?.hasRapidRenewal }) : stamPerDay1;
  const avgStamPerDay = (stamPerDay1 + stamPerDay2) / 2;
  
  for (let attempts = 10; attempts <= 35; attempts++) {
    const hasGardenGene = h1.hasGardenGene || h2?.hasGardenGene;
    const questDurationPerStam = hasGardenGene ? 10 : 12;
    const iterationMins = calculateIterationTime(attempts, questDurationPerStam, avgStamPerDay);
    const runsPerDay = (24 * 60) / iterationMins;
    
    const { crystalPerRun, jewelPerRun } = estimatePerRunYield(h1, h2, attempts);
    const dailyYield = (crystalPerRun + jewelPerRun) * runsPerDay;
    
    if (dailyYield > best.dailyYield) {
      best = { attempts, iterationMins, runsPerDay, stamPerDay: avgStamPerDay, dailyYield };
    }
  }
  
  return best;
}

function calculateIterationTime(attempts, questDurationPerStam, stamPerDay) {
  const questDurationMins = attempts * questDurationPerStam;
  
  const regenMins = (attempts / stamPerDay) * 1440;
  
  return questDurationMins + regenMins;
}

/**
 * Calculate actual iteration time and stamina analysis based on quest data
 * 
 * DFK Gardening stamina mechanics:
 * - quest.attempts = stamina per hero per iteration (e.g., 25)
 * - Each hero in the quest uses `attempts` stamina per iteration
 * - For a 2-hero quest at 25 attempts: each hero uses 25 stamina = 50 total
 * 
 * Iteration timing:
 * - Gardening iteration = max(questDuration, regenTime) 
 * - Quest runs for X minutes (10-12 min per stamina depending on gene)
 * - Regen happens in parallel
 * - Next iteration starts when BOTH quest completes AND stamina is ready
 * 
 * @param {Object} h1 - First hero details
 * @param {Object} h2 - Second hero details (optional)
 * @param {number} attempts - Stamina per hero per iteration from quest.attempts
 * @param {Object} pair - Pair data with timing info
 * @returns {Object} Iteration analysis with time, stamina usage, and runs per day
 */
function calculateActualIteration(h1, h2, attempts, pair = null) {
  const numHeroes = h2 ? 2 : 1;
  
  const stamPerDay1 = h1?.stamPerDay || 72;
  const stamPerDay2 = h2?.stamPerDay || stamPerDay1;
  const totalStamPerDay = stamPerDay1 + (h2 ? stamPerDay2 : 0);
  
  let questDurationMins;
  let isActualDuration = false;
  
  if (pair && pair.startTime && pair.completeAtTime && pair.completeAtTime > pair.startTime) {
    questDurationMins = (pair.completeAtTime - pair.startTime) / 60;
    isActualDuration = true;
  } else {
    const hero1HasGene = h1?.hasGardenGene;
    const hero2HasGene = h2?.hasGardenGene;
    const bothHaveGene = hero1HasGene && (h2 ? hero2HasGene : true);
    const questDurationPerStam = bothHaveGene ? 10 : 12;
    questDurationMins = attempts * questDurationPerStam;
  }
  
  const totalStaminaUsed = attempts * numHeroes;
  
  const regenMins = (totalStaminaUsed / totalStamPerDay) * 1440;
  
  const iterationMins = Math.max(questDurationMins, regenMins);
  const runsPerDay = (24 * 60) / iterationMins;
  
  const staminaRegenDuringIteration = (iterationMins / 1440) * totalStamPerDay;
  
  return {
    iterationMins,
    questDurationMins,
    regenMins,
    runsPerDay,
    staminaPerHero: attempts,
    totalStaminaUsed,
    staminaRegen: staminaRegenDuringIteration,
    totalStamPerDay,
    numHeroes,
    isActualDuration,
    gatingFactor: questDurationMins >= regenMins ? 'quest' : 'regen',
    sustainable: staminaRegenDuringIteration >= totalStaminaUsed,
  };
}

function estimatePerRunYield(h1, h2, attempts) {
  let crystalPerRun, jewelPerRun;
  
  if (h2 && (h1.role || h2.role)) {
    const crystalFarmer = h1.role === 'CRYSTAL' ? h1 : h2;
    const jewelFarmer = h1.role === 'JEWEL' ? h1 : h2;
    
    const cFactor = crystalFarmer.factor;
    const cPetBonus = crystalFarmer.petFed ? crystalFarmer.petBonusPct : 0;
    const jFactor = jewelFarmer.factor;
    const jPetBonus = jewelFarmer.petFed ? jewelFarmer.petBonusPct : 0;
    
    crystalPerRun = CRYSTAL_BASE_PER_ATTEMPT * attempts * cFactor * (1 + cPetBonus / 100);
    jewelPerRun = JEWEL_BASE_PER_ATTEMPT * attempts * jFactor * (1 + jPetBonus / 100);
  } else {
    const factor1 = h1.factor;
    const petBonus1 = h1.petFed ? h1.petBonusPct : 0;
    crystalPerRun = CRYSTAL_BASE_PER_ATTEMPT * attempts * factor1 * (1 + petBonus1 / 100);
    jewelPerRun = JEWEL_BASE_PER_ATTEMPT * attempts * factor1 * (1 + petBonus1 / 100);
  }
  
  return {
    crystalPerRun,
    jewelPerRun
  };
}

function formatTime(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  if (hours > 0) {
    return `${hours}h ${mins}m`;
  }
  return `${mins}m`;
}
