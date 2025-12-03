import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getHeroesByOwner } from '../onchain-data.js';
import { fetchPetsForWallet } from '../pet-data.js';

/**
 * Power Surge skill IDs (gardening pets only, eggType 2)
 * Multiplies final yield by (1 + bonus%)
 */
const POWER_SURGE_IDS = [90, 170]; // Rare, Mythic

/**
 * Skilled Greenskeeper skill IDs (gardening pets only, eggType 2)
 * Adds bonus to gardening skill directly in formula
 */
const SKILLED_GREENSKEEPER_IDS = [7, 86, 166]; // Common, Rare, Mythic

/**
 * Calculate hero base gardening yield factor
 * Formula: 0.1 + (WIS+VIT)/1222.22 + GrdSkl/244.44
 * GrdSkl = hero.gardening / 10 (API returns 0-100, formula uses 0-10)
 * With 1.2x multiplier if has gardening profession gene
 */
function calculateBaseYieldFactor(hero) {
  const WIS = hero.wisdom || 0;
  const VIT = hero.vitality || 0;
  // API returns gardening as 0-100, divide by 10 for formula (0-10 scale)
  const GrdSkl = (hero.gardening || 0) / 10;
  const hasGardeningGene = hero.professionStr === 'Gardening';
  
  const baseFactor = 0.1 + (WIS + VIT) / 1222.22 + GrdSkl / 244.44;
  const geneMult = hasGardeningGene ? 1.2 : 1.0;
  
  return baseFactor * geneMult;
}

/**
 * Calculate yield with Skilled Greenskeeper pet
 * Adds pet bonus to RAW gardening skill BEFORE dividing by 10
 * Example: hero.gardening=30, petBonus=46 → (30+46)/10=7.6 in formula
 */
function calculateYieldWithSkilledGreenskeeper(hero, petBonus) {
  const WIS = hero.wisdom || 0;
  const VIT = hero.vitality || 0;
  // Add pet bonus to RAW skill (0-100), then divide by 10 for formula
  const rawSkill = hero.gardening || 0;
  const GrdSkl = (rawSkill + petBonus) / 10;
  const hasGardeningGene = hero.professionStr === 'Gardening';
  
  const baseFactor = 0.1 + (WIS + VIT) / 1222.22 + GrdSkl / 244.44;
  const geneMult = hasGardeningGene ? 1.2 : 1.0;
  
  return baseFactor * geneMult;
}

/**
 * Calculate yield with Power Surge pet
 * Multiplies base yield by (1 + bonus%)
 */
function calculateYieldWithPowerSurge(hero, petBonus) {
  const baseYield = calculateBaseYieldFactor(hero);
  // Power Surge multiplies final yield
  return baseYield * (1 + petBonus / 100);
}

/**
 * Determine if pet has Power Surge or Skilled Greenskeeper skill
 */
function getPetGardenSkillType(pet) {
  if (!pet || pet.eggType !== 2) return null; // Must be gardening pet
  
  const bonusId = pet.gatheringBonus;
  
  if (POWER_SURGE_IDS.includes(bonusId)) {
    return { type: 'power_surge', bonus: pet.gatheringBonusScalar };
  }
  if (SKILLED_GREENSKEEPER_IDS.includes(bonusId)) {
    return { type: 'skilled_greenskeeper', bonus: pet.gatheringBonusScalar };
  }
  
  // Other gardening skills still provide general bonus
  return { type: 'other', bonus: pet.gatheringBonusScalar, skillName: pet.gatheringSkillName };
}

/**
 * Calculate best yield for hero with available pets
 * Tries all gardening pets and picks highest yield
 */
function findBestPetForHero(hero, gardeningPets, usedPetIds) {
  let bestPairing = {
    pet: null,
    yield: calculateBaseYieldFactor(hero),
    skillType: 'none',
    bonus: 0
  };
  
  for (const pet of gardeningPets) {
    if (usedPetIds.has(pet.id)) continue; // Skip already assigned pets
    
    const skillInfo = getPetGardenSkillType(pet);
    if (!skillInfo) continue;
    
    let yieldWithPet;
    
    if (skillInfo.type === 'power_surge') {
      yieldWithPet = calculateYieldWithPowerSurge(hero, skillInfo.bonus);
    } else if (skillInfo.type === 'skilled_greenskeeper') {
      yieldWithPet = calculateYieldWithSkilledGreenskeeper(hero, skillInfo.bonus);
    } else {
      // Other skills: apply as general multiplier
      yieldWithPet = calculateBaseYieldFactor(hero) * (1 + skillInfo.bonus / 100);
    }
    
    if (yieldWithPet > bestPairing.yield) {
      bestPairing = {
        pet,
        yield: yieldWithPet,
        skillType: skillInfo.type,
        bonus: skillInfo.bonus,
        skillName: pet.gatheringSkillName
      };
    }
  }
  
  return bestPairing;
}

/**
 * Score hero for gardening (for initial ranking)
 */
function scoreHeroForGardening(hero) {
  const baseYield = calculateBaseYieldFactor(hero);
  const level = hero.level || 1;
  // Weight by level for stamina efficiency
  return baseYield * Math.sqrt(level);
}

export const data = new SlashCommandBuilder()
  .setName('top-gardeners')
  .setDescription('Show top 12 hero-pet pairings optimized for gardening yield')
  .addStringOption(option =>
    option.setName('wallet')
      .setDescription('Wallet address to analyze')
      .setRequired(true)
  );

export async function execute(interaction) {
  await interaction.deferReply();
  
  try {
    const walletAddress = interaction.options.getString('wallet').toLowerCase();
    
    console.log(`[TopGardeners] Analyzing wallet ${walletAddress}...`);
    
    // Fetch heroes and pets in parallel
    const [heroes, pets] = await Promise.all([
      getHeroesByOwner(walletAddress),
      fetchPetsForWallet(walletAddress)  // Returns array directly
    ]);
    
    if (!heroes || heroes.length === 0) {
      return interaction.editReply('❌ No heroes found for this wallet');
    }
    
    // Filter for gardening pets only (eggType 2)
    const gardeningPets = (pets || []).filter(p => p.eggType === 2);
    
    console.log(`[TopGardeners] Found ${heroes.length} heroes, ${gardeningPets.length} gardening pets`);
    
    // Score and rank all heroes by gardening potential
    const scoredHeroes = heroes
      .map(hero => ({
        hero,
        score: scoreHeroForGardening(hero),
        baseYield: calculateBaseYieldFactor(hero)
      }))
      .sort((a, b) => b.score - a.score);
    
    // Take top 12 heroes and assign best available pet to each
    const usedPetIds = new Set();
    const topPairings = [];
    
    for (let i = 0; i < Math.min(12, scoredHeroes.length); i++) {
      const { hero, baseYield } = scoredHeroes[i];
      
      // Find best pet for this hero from remaining pets
      const bestMatch = findBestPetForHero(hero, gardeningPets, usedPetIds);
      
      if (bestMatch.pet) {
        usedPetIds.add(bestMatch.pet.id);
      }
      
      topPairings.push({
        rank: i + 1,
        hero,
        baseYield,
        pet: bestMatch.pet,
        finalYield: bestMatch.yield,
        yieldBoost: bestMatch.pet ? ((bestMatch.yield / baseYield - 1) * 100).toFixed(1) : 0,
        skillType: bestMatch.skillType,
        skillName: bestMatch.skillName,
        bonus: bestMatch.bonus
      });
    }
    
    // Build embed
    const embed = new EmbedBuilder()
      .setColor('#00FF88')
      .setTitle('🌿 Top 12 Gardener-Pet Pairings')
      .setDescription(`Wallet: \`${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}\`\n` +
        `Heroes: ${heroes.length} | Gardening Pets: ${gardeningPets.length}`)
      .setTimestamp();
    
    // Format pairings
    const pairingLines = topPairings.map(p => {
      const heroName = `#${p.hero.id.slice(-4)}`;
      const heroClass = p.hero.mainClass || 'Unknown';
      const heroLevel = p.hero.level || 1;
      const hasGene = p.hero.professionStr === 'Gardening' ? '🌱' : '';
      const WIS = p.hero.wisdom || 0;
      const VIT = p.hero.vitality || 0;
      const grdSkill = Math.floor((p.hero.gardening || 0) / 10);
      
      let petInfo = 'No pet';
      if (p.pet) {
        const petName = `Pet #${p.pet.id.slice(-4)}`;
        const skillIcon = p.skillType === 'power_surge' ? '⚡' : 
                         p.skillType === 'skilled_greenskeeper' ? '🧑‍🌾' : '✨';
        petInfo = `${petName} ${skillIcon}${p.skillName} +${p.bonus}%`;
      }
      
      const yieldDisplay = (p.finalYield * 100).toFixed(2);
      const boostDisplay = p.yieldBoost > 0 ? ` (+${p.yieldBoost}%)` : '';
      
      return `**${p.rank}.** ${heroClass} Lv${heroLevel}${hasGene} ${heroName}\n` +
             `   WIS:${WIS} VIT:${VIT} GRD:${grdSkill} → Yield: ${yieldDisplay}%${boostDisplay}\n` +
             `   └ ${petInfo}`;
    });
    
    // Split into two fields if needed (Discord field limit)
    const mid = Math.ceil(pairingLines.length / 2);
    const firstHalf = pairingLines.slice(0, mid).join('\n\n');
    const secondHalf = pairingLines.slice(mid).join('\n\n');
    
    if (firstHalf) {
      embed.addFields({ name: 'Top Gardeners (1-6)', value: firstHalf || 'None', inline: false });
    }
    if (secondHalf) {
      embed.addFields({ name: 'Top Gardeners (7-12)', value: secondHalf || 'None', inline: false });
    }
    
    // Add legend
    embed.addFields({
      name: 'Legend',
      value: '🌱 = Gardening Gene | ⚡ = Power Surge | 🧑‍🌾 = Skilled Greenskeeper | ✨ = Other Skill',
      inline: false
    });
    
    console.log(`[TopGardeners] Generated ${topPairings.length} pairings`);
    
    return interaction.editReply({ embeds: [embed] });
    
  } catch (error) {
    console.error('[TopGardeners] Error:', error);
    return interaction.editReply(`❌ Error analyzing gardeners: ${error.message}`);
  }
}
