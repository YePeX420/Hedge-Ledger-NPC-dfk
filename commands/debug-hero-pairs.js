/**
 * Debug command to test hero pairing detection
 * Uses QuestCoreV3 to fetch active quest data and detect paired heroes
 */

import { SlashCommandBuilder } from 'discord.js';
import { detectPairsWithRoles, formatPairsForDiscord } from '../hero-pairing.js';
import { getAllHeroesByOwner } from '../onchain-data.js';

export const data = new SlashCommandBuilder()
  .setName('debug-hero-pairs')
  .setDescription('Detect hero pairs in active gardening quests')
  .addStringOption(option =>
    option.setName('wallet')
      .setDescription('Wallet address to check')
      .setRequired(true)
  );

export async function execute(interaction) {
  await interaction.deferReply();
  
  const walletAddress = interaction.options.getString('wallet');
  
  try {
    if (!walletAddress || !walletAddress.startsWith('0x')) {
      await interaction.editReply('❌ Invalid wallet address. Must start with 0x');
      return;
    }
    
    await interaction.editReply('🔍 Fetching heroes and detecting pairs...');
    
    const heroes = await getAllHeroesByOwner(walletAddress);
    console.log(`[debug-hero-pairs] Fetched ${heroes.length} heroes for ${walletAddress}`);
    
    if (heroes.length === 0) {
      await interaction.editReply('❌ No heroes found for this wallet address.');
      return;
    }
    
    const pairingResult = await detectPairsWithRoles(walletAddress, heroes);
    
    const output = formatPairsForDiscord(pairingResult);
    
    if (output.length > 1900) {
      await interaction.editReply(output.slice(0, 1900) + '\n_...truncated_');
    } else {
      await interaction.editReply(output);
    }
    
  } catch (err) {
    console.error('❌ Error in /debug-hero-pairs:', err);
    await interaction.editReply(`❌ Error detecting hero pairs: ${err.message}`);
  }
}

export default { data, execute };
