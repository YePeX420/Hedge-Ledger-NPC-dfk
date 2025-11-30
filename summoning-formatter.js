/**
 * Discord Summoning Calculator Formatter
 * 
 * Formats summoning probability data into Discord embeds with proper styling and organization.
 */

import { EmbedBuilder } from 'discord.js';

// Rarity colors for embeds
const RARITY_COLORS = {
  Common: 0x808080,      // Gray
  Uncommon: 0x00ff00,    // Green
  Rare: 0x0070dd,        // Blue
  Legendary: 0xff8000,   // Orange
  Mythic: 0xe100ff       // Purple
};

/**
 * Create summary embed showing most important summoning outcomes
 * @param {Object} probabilities - Full probability results
 * @param {Object} parent1Info - { heroId, class, rarity }
 * @param {Object} parent2Info - { heroId, class, rarity }
 * @returns {EmbedBuilder} Discord embed
 */
export function createSummarySummoningEmbed(probabilities, parent1Info, parent2Info) {
  const topClasses = Object.entries(probabilities.class)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  
  const topSubClasses = Object.entries(probabilities.subClass)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  
  const topProfessions = Object.entries(probabilities.profession)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  
  const mostLikelyRarity = Object.entries(probabilities.rarity)
    .sort((a, b) => b[1] - a[1])[0];
  
  const embed = new EmbedBuilder()
    .setTitle('⚗️ Hero Summoning Probabilities')
    .setDescription(
      `**Parents:**\n` +
      `🧬 ${parent1Info.class} (${parent1Info.rarity}) #${parent1Info.heroId || 'Hypothetical'}\n` +
      `🧬 ${parent2Info.class} (${parent2Info.rarity}) #${parent2Info.heroId || 'Hypothetical'}`
    )
    .setColor(RARITY_COLORS[mostLikelyRarity[0]] || 0x5865F2);
  
  // Class probabilities
  embed.addFields({
    name: '⚔️ Main Class Chances',
    value: topClasses.map(([cls, prob]) => `**${cls}**: ${prob}%`).join('\n'),
    inline: true
  });
  
  // Subclass probabilities
  embed.addFields({
    name: '🛡️ Sub Class Chances',
    value: topSubClasses.map(([cls, prob]) => `**${cls}**: ${prob}%`).join('\n'),
    inline: true
  });
  
  // Rarity distribution
  const rarityText = Object.entries(probabilities.rarity)
    .filter(([_, prob]) => prob > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([rarity, prob]) => {
      const emoji = getRarityEmoji(rarity);
      return `${emoji} **${rarity}**: ${prob}%`;
    })
    .join('\n');
  
  embed.addFields({
    name: '💎 Rarity Distribution',
    value: rarityText,
    inline: false
  });
  
  // Profession chances
  embed.addFields({
    name: '⛏️ Profession Chances',
    value: topProfessions.map(([prof, prob]) => `**${prof}**: ${prob}%`).join('\n'),
    inline: false
  });
  
  embed.setFooter({ 
    text: 'Use "show me detailed summoning chances" for full breakdown' 
  });
  
  return embed;
}

/**
 * Create detailed stat genes embed
 * @param {Object} probabilities 
 * @returns {EmbedBuilder} Discord embed
 */
export function createStatGenesEmbed(probabilities) {
  const embed = new EmbedBuilder()
    .setTitle('📊 Stat Genes & Abilities')
    .setColor(0x5865F2);
  
  // Active abilities
  const active1Top = Object.entries(probabilities.active1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  const active2Top = Object.entries(probabilities.active2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  
  embed.addFields({
    name: '⚡ Active 1',
    value: active1Top.map(([ability, prob]) => `${ability}: ${prob}%`).join('\n') || 'None',
    inline: true
  });
  
  embed.addFields({
    name: '⚡ Active 2',
    value: active2Top.map(([ability, prob]) => `${ability}: ${prob}%`).join('\n') || 'None',
    inline: true
  });
  
  embed.addFields({ name: '\u200B', value: '\u200B', inline: false });
  
  // Passive abilities
  const passive1Top = Object.entries(probabilities.passive1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  const passive2Top = Object.entries(probabilities.passive2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  
  embed.addFields({
    name: '🛡️ Passive 1',
    value: passive1Top.map(([ability, prob]) => `${ability}: ${prob}%`).join('\n') || 'None',
    inline: true
  });
  
  embed.addFields({
    name: '🛡️ Passive 2',
    value: passive2Top.map(([ability, prob]) => `${ability}: ${prob}%`).join('\n') || 'None',
    inline: true
  });
  
  embed.addFields({ name: '\u200B', value: '\u200B', inline: false });
  
  // Stat boosts
  const stat1Top = Object.entries(probabilities.statBoost1)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const stat2Top = Object.entries(probabilities.statBoost2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  
  embed.addFields({
    name: '💪 Stat Boost 1',
    value: stat1Top.map(([stat, prob]) => `${stat}: ${prob}%`).join('\n') || 'None',
    inline: true
  });
  
  embed.addFields({
    name: '💪 Stat Boost 2',
    value: stat2Top.map(([stat, prob]) => `${stat}: ${prob}%`).join('\n') || 'None',
    inline: true
  });
  
  // Element
  const elementTop = Object.entries(probabilities.element)
    .sort((a, b) => b[1] - a[1]);
  
  embed.addFields({
    name: '🔥 Element',
    value: elementTop.map(([elem, prob]) => `${elem}: ${prob}%`).join('\n'),
    inline: false
  });
  
  // Background
  const bgTop = Object.entries(probabilities.background)
    .sort((a, b) => b[1] - a[1]);
  
  embed.addFields({
    name: '🌄 Background',
    value: bgTop.map(([bg, prob]) => `${bg}: ${prob}%`).join('\n'),
    inline: false
  });
  
  return embed;
}

/**
 * Create visual genetics embed
 * @param {Object} probabilities 
 * @returns {EmbedBuilder} Discord embed
 */
export function createVisualGenesEmbed(probabilities) {
  const embed = new EmbedBuilder()
    .setTitle('🎨 Visual Genetics')
    .setColor(0xFF1493);
  
  // Hair
  const hairStyleTop = Object.entries(probabilities.hairStyle)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  const hairColorTop = Object.entries(probabilities.hairColor)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  
  embed.addFields({
    name: '💇 Hair Style',
    value: hairStyleTop.map(([style, prob]) => `${style}: ${prob}%`).join('\n'),
    inline: true
  });
  
  embed.addFields({
    name: '🎨 Hair Color',
    value: hairColorTop.map(([color, prob]) => `${color}: ${prob}%`).join('\n'),
    inline: true
  });
  
  embed.addFields({ name: '\u200B', value: '\u200B', inline: false });
  
  // Appendages
  const headAppTop = Object.entries(probabilities.headAppendage)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  const backAppTop = Object.entries(probabilities.backAppendage)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  
  embed.addFields({
    name: '👑 Head Appendage',
    value: headAppTop.map(([app, prob]) => `${app}: ${prob}%`).join('\n'),
    inline: true
  });
  
  embed.addFields({
    name: '🦋 Back Appendage',
    value: backAppTop.map(([app, prob]) => `${app}: ${prob}%`).join('\n'),
    inline: true
  });
  
  embed.addFields({ name: '\u200B', value: '\u200B', inline: false });
  
  // Colors
  const eyeColorTop = Object.entries(probabilities.eyeColor)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const skinColorTop = Object.entries(probabilities.skinColor)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const appColorTop = Object.entries(probabilities.appendageColor)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  
  embed.addFields({
    name: '👁️ Eye Color',
    value: eyeColorTop.map(([color, prob]) => `${color}: ${prob}%`).join('\n'),
    inline: true
  });
  
  embed.addFields({
    name: '👤 Skin Color',
    value: skinColorTop.map(([color, prob]) => `${color}: ${prob}%`).join('\n'),
    inline: true
  });
  
  embed.addFields({
    name: '✨ Appendage Color',
    value: appColorTop.map(([color, prob]) => `${color}: ${prob}%`).join('\n'),
    inline: true
  });
  
  return embed;
}

/**
 * Get rarity emoji
 * @param {string} rarity 
 * @returns {string}
 */
function getRarityEmoji(rarity) {
  const emojis = {
    Common: '⚪',
    Uncommon: '🟢',
    Rare: '🔵',
    Legendary: '🟠',
    Mythic: '🟣'
  };
  return emojis[rarity] || '⚪';
}

/**
 * Create a compact text summary for conversational AI responses
 * @param {Object} probabilities 
 * @returns {string}
 */
export function createTextSummary(probabilities) {
  const topClass = Object.entries(probabilities.class).sort((a, b) => b[1] - a[1])[0];
  const topRarity = Object.entries(probabilities.rarity).sort((a, b) => b[1] - a[1])[0];
  const topProf = Object.entries(probabilities.profession).sort((a, b) => b[1] - a[1])[0];
  
  const hasMythic = probabilities.rarity.Mythic > 0;
  const hasLegendary = probabilities.rarity.Legendary > 0;
  
  let summary = `The offspring will most likely be a **${topClass[0]}** (${topClass[1]}%) with **${topProf[0]}** profession (${topProf[1]}%). `;
  summary += `Rarity: **${topRarity[0]}** (${topRarity[1]}%)`;
  
  if (hasMythic) {
    summary += ` with a ${probabilities.rarity.Mythic}% chance for Mythic! 🟣`;
  } else if (hasLegendary) {
    summary += ` with a ${probabilities.rarity.Legendary}% chance for Legendary! 🟠`;
  }
  
  return summary;
}
