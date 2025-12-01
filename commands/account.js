// commands/account.js
import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { getOrCreateUserProfile } from '../user-account-service.js';

export default {
  data: new SlashCommandBuilder()
    .setName('account')
    .setDescription('View and manage your Hedge Ledger account.'),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    try {
      const userId = interaction.user.id;
      const username = interaction.user.username || interaction.user.tag;

      // Get or create user profile
      const profile = await getOrCreateUserProfile(userId, username);

      // Format wallets
      let walletsText = 'No wallets linked yet. Use the buttons below to add and verify a wallet.';
      if (profile.wallets && profile.wallets.length > 0) {
        const displayedWallets = profile.wallets.slice(0, 5).map((w, i) => {
          const shortAddr = `${w.address.slice(0, 6)}…${w.address.slice(-4)}`;
          const verified = w.verified ? '✓ Verified' : '⚠ Not verified';
          return `${i + 1}. ${shortAddr} (${w.chain}) – ${verified}`;
        }).join('\n');
        walletsText = displayedWallets;
        if (profile.wallets.length > 5) {
          walletsText += `\n+ ${profile.wallets.length - 5} more wallets`;
        }
      }

      // Format LP positions
      let lpText = 'No LP positions detected yet. Hedge will show your gardens and LPs here.';
      if (profile.lpPositions && profile.lpPositions.length > 0) {
        lpText = profile.lpPositions.slice(0, 5).map(lp => {
          return `${lp.poolName} (${lp.chain})\n• ${lp.lpAmount} LP\n• 24h APR (with quests): ${lp.apr24h}%`;
        }).join('\n\n');
      }

      // Format profile section
      const createdDate = profile.createdAt ? new Date(profile.createdAt).toISOString().split('T')[0] : 'N/A';
      const profileText = `Discord: <@${profile.discordId}>\nTier: ${profile.tier || 'Unranked'}\nTotal queries: ${profile.totalQueries || 0}\nMember since: ${createdDate}`;

      // Create embed
      const embed = new EmbedBuilder()
        .setColor('#FFD700')
        .setTitle('Your Hedge Ledger Account')
        .setDescription('This is your personal Hedge Ledger dashboard. Here you can manage wallets, LPs, and paid optimizations.')
        .addFields(
          {
            name: 'Profile',
            value: profileText,
            inline: false
          },
          {
            name: 'Wallets',
            value: walletsText,
            inline: false
          },
          {
            name: 'LP Positions',
            value: lpText,
            inline: false
          }
        )
        .setFooter({ text: 'Early Access – features and on-chain automation are still being rolled out.' })
        .setTimestamp();

      // Create buttons
      const linkWalletBtn = new ButtonBuilder()
        .setCustomId('btn_link_wallet')
        .setLabel('Link Wallet')
        .setStyle(ButtonStyle.Primary);

      const verifyWalletBtn = new ButtonBuilder()
        .setCustomId('btn_verify_wallet')
        .setLabel('Verify Wallet')
        .setStyle(ButtonStyle.Secondary);

      const viewGardensBtn = new ButtonBuilder()
        .setCustomId('btn_view_gardens')
        .setLabel('View Gardens')
        .setStyle(ButtonStyle.Secondary);

      const optimizeBtn = new ButtonBuilder()
        .setCustomId('btn_optimize')
        .setLabel('Optimize (5 JEWEL)')
        .setStyle(ButtonStyle.Success);

      const row1 = new ActionRowBuilder().addComponents(linkWalletBtn, verifyWalletBtn);
      const row2 = new ActionRowBuilder().addComponents(viewGardensBtn, optimizeBtn);

      await interaction.editReply({
        embeds: [embed],
        components: [row1, row2],
      });

    } catch (error) {
      console.error('❌ Account command error:', error);
      await interaction.editReply({
        content: '❌ Failed to load your account. Please try again later.',
        ephemeral: true
      });
    }
  },
};
