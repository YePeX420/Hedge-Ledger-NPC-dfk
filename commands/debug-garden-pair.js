import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { ethers } from 'ethers';
import { getAllHeroesByOwner } from '../onchain-data.js';
import { fetchPetsForWallet, annotateHeroesWithPets } from '../pet-data.js';
import { groupHeroesByGardenPool, computeGardenScore } from '../garden-pairs.js';
import { computeHeroGardeningFactor, computeStaminaPerDay } from '../hero-yield-model.js';
import { arePetsFedByGravityFeeder } from '../rapid-renewal-service.js';
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
  await interaction.deferReply();
  
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
    
    const [heroes, pets, hasGravityFeeder] = await Promise.all([
      getAllHeroesByOwner(walletAddress),
      fetchPetsForWallet(walletAddress),
      arePetsFedByGravityFeeder(walletAddress).catch(() => false)
    ]);
    
    console.log(`[DebugPair] Found ${heroes.length} heroes, ${pets.length} pets, GF=${hasGravityFeeder}`);
    
    const pairingResult = await detectPairsWithRoles(walletAddress, heroes, true);
    console.log(`[DebugPair] Detected ${pairingResult.pairs.length} pairs total`);
    
    const poolPairs = pairingResult.pools[poolId] || [];
    
    const annotatedHeroes = annotateHeroesWithPets(
      heroes.map(h => ({ hero: h, heroMeta: {} })),
      pets,
      { gravityFeederActive: hasGravityFeeder }
    );
    
    const heroMetaMap = new Map();
    for (const h of annotatedHeroes) {
      const heroId = h.hero?.normalizedId || h.hero?.id;
      if (heroId) heroMetaMap.set(Number(heroId), h);
    }
    
    const gardeningHeroIds = poolPairs.flatMap(p => p.heroIds);
    console.log(`[DebugPair] Checking pets for gardening heroes: ${gardeningHeroIds.join(', ')}`);
    for (const heroId of gardeningHeroIds) {
      const pet = pets.find(p => p.equippedTo === String(heroId));
      if (pet) {
        console.log(`[DebugPair] Hero #${heroId} has Pet #${pet.id} equipped (${pet.gatheringType}, fed=${pet.isFed})`);
      } else {
        console.log(`[DebugPair] Hero #${heroId} has NO pet in fetched list`);
      }
    }
    
    if (poolPairs.length === 0) {
      return interaction.editReply(`No heroes currently gardening pool ${poolId} (${poolInfo.name})`);
    }
    
    const embed = new EmbedBuilder()
      .setColor('#2ecc71')
      .setTitle(`Garden Debug: ${poolInfo.name} (Pool ${poolId})`)
      .setDescription(`Found ${poolPairs.length} pairs gardening this pool`)
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
        
        const petId = heroMeta.petId || null;
        const petBonus = heroMeta.petGardenBonus || {};
        const petGatheringSkill = petBonus.gatheringSkill || 0;
        const petBonusPct = petBonus.questBonusPct || 0;
        const petFed = petBonus.isFed !== false;
        
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
          petId,
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
      const { crystalPerRun, jewelPerRun } = estimatePerRunYield(h1, h2, actualAttempts);
      
      const roleSource = pair.rolesSource?.startsWith('reward_history') ? '(verified)' : '(heuristic)';
      const durationLabel = iterationAnalysis.isActualDuration ? '' : '~';
      const gatingNote = iterationAnalysis.gatingFactor === 'regen' ? ' [regen-gated]' : '';
      
      pairText += `\n**Roles:** JEWEL:#${pair.jewelHeroId} CRYSTAL:#${pair.crystalHeroId} ${roleSource}`;
      pairText += `\n**Per Run:** ~${crystalPerRun.toFixed(1)} CRYSTAL, ~${jewelPerRun.toFixed(1)} JEWEL`;
      pairText += `\n**Iteration:** ${durationLabel}${formatTime(iterationAnalysis.iterationMins)} (${actualAttempts} stam/hero = ${iterationAnalysis.totalStaminaUsed} total)${gatingNote}`;
      pairText += `\n**Regen:** ${iterationAnalysis.staminaRegen.toFixed(1)}/${iterationAnalysis.totalStaminaUsed} stam (${iterationAnalysis.sustainable ? 'sustainable' : 'deficit'})`;
      pairText += `\n**Runs/Day:** ~${iterationAnalysis.runsPerDay.toFixed(1)}`;
      
      embed.addFields({
        name: `Pair ${i + 1}`,
        value: pairText,
        inline: false
      });
    }
    
    embed.addFields({
      name: 'Calibration Constants',
      value: `CRYSTAL base: 2.8/attempt, JEWEL base: 0.2/attempt\n*Compare to your actual returns to validate*`,
      inline: false
    });
    
    embed.addFields({
      name: 'Summary',
      value: `Total Pairs: ${poolPairs.length}\nTotal Garden Score: ${totalGardenScore.toFixed(2)}`,
      inline: false
    });
    
    return interaction.editReply({ embeds: [embed] });
    
  } catch (error) {
    console.error('[DebugPair] Error:', error);
    return interaction.editReply(`Error: ${error.message}`);
  }
}

function formatHeroLine(h) {
  const geneIcon = h.hasGardenGene ? ' [G]' : '';
  const petInfo = h.petId 
    ? ` | Pet #${h.petId} (G${h.petGatheringSkill.toFixed(1)}, +${h.petBonusPct.toFixed(1)}%)${h.petFed ? '' : ' [hungry]'}`
    : ' | No pet';
  
  return `Hero #${h.heroId}${geneIcon} L${h.level} | VIT:${h.vit} WIS:${h.wis} G:${h.gardeningSkill.toFixed(1)}${petInfo}`;
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
  const CRYSTAL_BASE_PER_ATTEMPT = 2.8;
  const JEWEL_BASE_PER_ATTEMPT = 0.2;
  
  const factor1 = h1.factor;
  const petBonus1 = h1.petFed ? h1.petBonusPct : 0;
  
  const factor2 = h2 ? h2.factor : 0;
  const petBonus2 = h2?.petFed ? h2.petBonusPct : 0;
  
  const hero1Crystal = CRYSTAL_BASE_PER_ATTEMPT * attempts * factor1 * (1 + petBonus1 / 100);
  const hero1Jewel = JEWEL_BASE_PER_ATTEMPT * attempts * factor1 * (1 + petBonus1 / 100);
  
  const hero2Crystal = h2 ? CRYSTAL_BASE_PER_ATTEMPT * attempts * factor2 * (1 + petBonus2 / 100) : 0;
  const hero2Jewel = h2 ? JEWEL_BASE_PER_ATTEMPT * attempts * factor2 * (1 + petBonus2 / 100) : 0;
  
  return {
    crystalPerRun: hero1Crystal + hero2Crystal,
    jewelPerRun: hero1Jewel + hero2Jewel,
    breakdown: {
      hero1: { crystal: hero1Crystal, jewel: hero1Jewel },
      hero2: h2 ? { crystal: hero2Crystal, jewel: hero2Jewel } : null
    }
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
