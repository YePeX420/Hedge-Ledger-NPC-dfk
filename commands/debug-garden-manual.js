import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getHeroById } from '../onchain-data.js';
import { fetchPetById } from '../pet-data.js';
import { computeGardenScore } from '../garden-pairs.js';
import { computeHeroGardeningFactor, computeStaminaPerDay } from '../hero-yield-model.js';
import { getPoolCalibration } from '../pool-calibration.js';

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
  .setName('debug-garden-manual')
  .setDescription('Debug gardening yields for specific hero/pet IDs')
  .addIntegerOption(option =>
    option.setName('hero1')
      .setDescription('First hero ID')
      .setRequired(true)
  )
  .addIntegerOption(option =>
    option.setName('pet1')
      .setDescription('Pet ID for first hero (0 for none)')
      .setRequired(true)
  )
  .addStringOption(option =>
    option.setName('pool')
      .setDescription('Garden pool')
      .setRequired(true)
      .addChoices(
        ...GARDEN_POOLS.map(p => ({ name: p.name, value: String(p.pid) }))
      )
  )
  .addIntegerOption(option =>
    option.setName('hero2')
      .setDescription('Second hero ID (optional)')
      .setRequired(false)
  )
  .addIntegerOption(option =>
    option.setName('pet2')
      .setDescription('Pet ID for second hero (0 for none)')
      .setRequired(false)
  );

export async function execute(interaction) {
  // Note: deferReply is now called in bot.js before execute()
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply();
  }
  
  try {
    const hero1Id = interaction.options.getInteger('hero1');
    const pet1Id = interaction.options.getInteger('pet1');
    const hero2Id = interaction.options.getInteger('hero2');
    const pet2Id = interaction.options.getInteger('pet2');
    const poolId = parseInt(interaction.options.getString('pool'), 10);
    
    const poolInfo = GARDEN_POOLS.find(p => p.pid === poolId);
    if (!poolInfo) {
      return interaction.editReply(`Invalid pool ID: ${poolId}`);
    }
    
    console.log(`[DebugManual] Pool: ${poolInfo.name}, Hero1 #${hero1Id}, Pet1 #${pet1Id}, Hero2 #${hero2Id || 'none'}, Pet2 #${pet2Id || 'none'}`);
    
    const [hero1, pet1, hero2, pet2] = await Promise.all([
      getHeroById(hero1Id),
      pet1Id > 0 ? fetchPetById(pet1Id) : null,
      hero2Id ? getHeroById(hero2Id) : null,
      pet2Id && pet2Id > 0 ? fetchPetById(pet2Id) : null
    ]);
    
    if (!hero1) {
      return interaction.editReply(`Hero #${hero1Id} not found`);
    }
    
    if (hero2Id && !hero2) {
      return interaction.editReply(`Hero #${hero2Id} not found`);
    }
    
    const embed = new EmbedBuilder()
      .setColor('#9b59b6')
      .setTitle(`Garden Manual Debug: ${poolInfo.name}`)
      .setDescription('Manual hero/pet pairing analysis')
      .setTimestamp();
    
    const h1Details = buildHeroDetails(hero1, pet1);
    const h2Details = hero2 ? buildHeroDetails(hero2, pet2) : null;
    
    h1Details.role = 'CRYSTAL';
    if (h2Details) {
      h2Details.role = 'JEWEL';
    }
    
    let pairText = formatHeroLine(h1Details);
    if (h2Details) {
      pairText += '\n' + formatHeroLine(h2Details);
    }
    
    const optimalAttempts = findOptimalAttemptsForPair(h1Details, h2Details, hero1, hero2, poolId);
    const { crystalPerRun, jewelPerRun } = estimatePerRunYield(h1Details, h2Details, optimalAttempts.attempts, poolId);
    
    if (h2Details) {
      pairText += `\n\n**Roles (assumed):** Hero1=CRYSTAL, Hero2=JEWEL`;
    }
    pairText += `\n\n**Per Run Yield:**`;
    pairText += `\n~${crystalPerRun.toFixed(1)} CRYSTAL, ~${jewelPerRun.toFixed(1)} JEWEL`;
    pairText += `\n\n**Timing:**`;
    pairText += `\nIteration: ${formatTime(optimalAttempts.iterationMins)} (${optimalAttempts.attempts} stam)`;
    pairText += `\nRuns/Day: ~${optimalAttempts.runsPerDay.toFixed(1)}`;
    
    embed.addFields({
      name: 'Hero Pair',
      value: pairText,
      inline: false
    });
    
    const dailyCrystal = crystalPerRun * optimalAttempts.runsPerDay;
    const dailyJewel = jewelPerRun * optimalAttempts.runsPerDay;
    
    embed.addFields({
      name: 'Daily Estimates',
      value: `~${dailyCrystal.toFixed(1)} CRYSTAL/day\n~${dailyJewel.toFixed(1)} JEWEL/day`,
      inline: true
    });
    
    const poolCalibration = getPoolCalibration(poolId);
    const calibratedNote = poolCalibration.isDefault 
      ? '(default estimate)' 
      : `(calibrated)`;
    embed.addFields({
      name: 'Calibration',
      value: `CRYSTAL: ${poolCalibration.crystalBase.toFixed(4)}/attempt\nJEWEL: ${poolCalibration.jewelBase.toFixed(4)}/attempt\n${calibratedNote}`,
      inline: true
    });
    
    return interaction.editReply({ embeds: [embed] });
    
  } catch (error) {
    console.error('[DebugManual] Error:', error);
    return interaction.editReply(`Error: ${error.message}`);
  }
}

function buildHeroDetails(hero, pet) {
  const heroId = hero.normalizedId || hero.id;
  const vit = hero.vitality || 0;
  const wis = hero.wisdom || 0;
  const gardeningRaw = hero.gardening || 0;
  const gardeningSkill = gardeningRaw / 10;
  const hasGardenGene = hero.professionStr?.toLowerCase() === 'gardening';
  const level = hero.level || 1;
  
  let petId = null;
  let petGatheringSkill = 0;
  let petBonusPct = 0;
  let petFed = false;
  
  if (pet) {
    petId = pet.id;
    if (pet.gatheringType === 'Gardening') {
      petGatheringSkill = pet.gatheringBonus || 0;
      petBonusPct = pet.gatheringBonusScalar || 0;
    }
    petFed = pet.isFed;
  }
  
  const stamPerDay = computeStaminaPerDay(hero, { hasRapidRenewal: false });
  const factor = computeHeroGardeningFactor(hero);
  const { score: gardenScore } = computeGardenScore(hero, { petGardenBonus: { questBonusPct: petBonusPct } });
  
  return {
    heroId,
    level,
    vit,
    wis,
    gardeningSkill,
    hasGardenGene,
    hasRapidRenewal: false,
    stamPerDay,
    petId,
    petGatheringSkill,
    petBonusPct,
    petFed,
    factor,
    gardenScore,
    hero
  };
}

function formatHeroLine(h) {
  const geneIcon = h.hasGardenGene ? ' [G]' : '';
  const petInfo = h.petId 
    ? ` | Pet #${h.petId} (G${h.petGatheringSkill.toFixed(1)}, +${h.petBonusPct.toFixed(1)}%)${h.petFed ? '' : ' [hungry]'}`
    : ' | No pet';
  
  return `Hero #${h.heroId}${geneIcon} L${h.level} | VIT:${h.vit} WIS:${h.wis} G:${h.gardeningSkill.toFixed(1)}${petInfo}`;
}

function findOptimalAttemptsForPair(h1, h2, hero1, hero2, poolId = null) {
  let best = { attempts: 25, iterationMins: 0, runsPerDay: 0, dailyYield: 0 };
  
  const stamPerDay1 = computeStaminaPerDay(hero1, { hasRapidRenewal: h1.hasRapidRenewal });
  const stamPerDay2 = hero2 ? computeStaminaPerDay(hero2, { hasRapidRenewal: h2?.hasRapidRenewal }) : stamPerDay1;
  const avgStamPerDay = (stamPerDay1 + stamPerDay2) / 2;
  
  for (let attempts = 10; attempts <= 35; attempts++) {
    const hasGardenGene = h1.hasGardenGene || h2?.hasGardenGene;
    const questDurationPerStam = hasGardenGene ? 10 : 12;
    const iterationMins = calculateIterationTime(attempts, questDurationPerStam, avgStamPerDay);
    const runsPerDay = (24 * 60) / iterationMins;
    
    const { crystalPerRun, jewelPerRun } = estimatePerRunYield(h1, h2, attempts, poolId);
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

function estimatePerRunYield(h1, h2, attempts, poolId = null) {
  const calibration = getPoolCalibration(poolId);
  const CRYSTAL_BASE = calibration.crystalBase;
  const JEWEL_BASE = calibration.jewelBase;
  
  let crystalPerRun, jewelPerRun;
  
  if (h2 && (h1.role || h2.role)) {
    const crystalFarmer = h1.role === 'CRYSTAL' ? h1 : h2;
    const jewelFarmer = h1.role === 'JEWEL' ? h1 : h2;
    
    const cFactor = crystalFarmer.factor;
    const cPetBonus = crystalFarmer.petFed ? crystalFarmer.petBonusPct : 0;
    const jFactor = jewelFarmer.factor;
    const jPetBonus = jewelFarmer.petFed ? jewelFarmer.petBonusPct : 0;
    
    crystalPerRun = CRYSTAL_BASE * attempts * cFactor * (1 + cPetBonus / 100);
    jewelPerRun = JEWEL_BASE * attempts * jFactor * (1 + jPetBonus / 100);
  } else {
    const factor1 = h1.factor;
    const petBonus1 = h1.petFed ? h1.petBonusPct : 0;
    crystalPerRun = CRYSTAL_BASE * attempts * factor1 * (1 + petBonus1 / 100);
    jewelPerRun = JEWEL_BASE * attempts * factor1 * (1 + petBonus1 / 100);
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

export default { data, execute };
