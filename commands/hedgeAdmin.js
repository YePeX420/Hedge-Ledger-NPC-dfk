// commands/hedgeAdmin.js
import { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle } from 'discord.js';
import { getAdminStats } from '../admin-stats.js';

// Helper function to check if user is admin
function userIsAdmin(interaction) {
  const userId = interaction.user.id;
  const userRoles = interaction.member?.roles?.cache?.map(r => r.id) || [];
  const ownerId = process.env.OWNER_ID;
  const adminRoleId = process.env.ADMIN_ROLE_ID;

  if (userId === ownerId) return true;
  if (adminRoleId && userRoles.includes(adminRoleId)) return true;
  return false;
}

// Helper function to check if interaction is in admin channel
function isInAdminChannel(interaction) {
  const adminChannelId = process.env.ADMIN_CHANNEL_ID;
  return !adminChannelId || interaction.channelId === adminChannelId;
}

export default {
  data: new SlashCommandBuilder()
    .setName('hedge-admin')
    .setDescription('Open the Hedge Ledger admin dashboard (admins only).'),

  async execute(interaction) {
    // Check channel
    if (!isInAdminChannel(interaction)) {
      return interaction.reply({
        content: `🔒 For security, the admin dashboard can only be used in the private admin channel: <#${process.env.ADMIN_CHANNEL_ID}>.`,
        ephemeral: true,
      });
    }

    // Check permissions
    if (!userIsAdmin(interaction)) {
      return interaction.reply({
        content: '⛔ This command is only available to Hedge Admins.',
        ephemeral: true,
      });
    }

    // Fetch admin stats
    const stats = await getAdminStats();

    // Create admin snapshot embed
    const embed = new EmbedBuilder()
      .setColor('#FFD700')
      .setTitle('Hedge Ledger – Admin Dashboard')
      .setDescription('Internal admin view with live metrics and quick actions.')
      .addFields(
        {
          name: 'Hedge Wallet',
          value: `JEWEL: \`${stats.hedgeWallet.jewel.toFixed(2)}\`\nCRYSTAL: \`${stats.hedgeWallet.crystal.toFixed(2)}\`\ncJEWEL: \`${stats.hedgeWallet.cjewel.toFixed(2)}\``,
          inline: true
        },
        {
          name: 'Total Players',
          value: `\`${stats.totalPlayers}\``,
          inline: true
        },
        {
          name: 'JEWEL Deposits',
          value: `\`${stats.jewelDeposits.toFixed(2)}\``,
          inline: true
        },
        {
          name: 'Total Revenue',
          value: `$\`${stats.totalRevenue.toFixed(2)}\``,
          inline: true
        },
        {
          name: 'Total Queries',
          value: `\`${stats.totalQueries}\``,
          inline: true
        },
        {
          name: 'Recent Activity',
          value: stats.recentActivity,
          inline: false
        }
      )
      .setFooter({ text: 'Admin Only - Access Restricted' })
      .setTimestamp();

    // Create buttons
    const dashboardUrl = process.env.DASHBOARD_URL || `${process.env.REPLIT_URL || 'http://localhost:5000'}/admin`;
    const openButton = new ButtonBuilder()
      .setLabel('Open Dashboard')
      .setStyle(ButtonStyle.Link)
      .setURL(dashboardUrl);

    const refreshButton = new ButtonBuilder()
      .setLabel('Refresh Snapshot')
      .setStyle(ButtonStyle.Primary)
      .setCustomId('admin_refresh');

    const usersButton = new ButtonBuilder()
      .setLabel('Users')
      .setStyle(ButtonStyle.Secondary)
      .setCustomId('admin_users');

    const settingsButton = new ButtonBuilder()
      .setLabel('Settings')
      .setStyle(ButtonStyle.Secondary)
      .setCustomId('admin_settings');

    const row1 = new ActionRowBuilder().addComponents(openButton, refreshButton);
    const row2 = new ActionRowBuilder().addComponents(usersButton, settingsButton);

    await interaction.reply({
      embeds: [embed],
      components: [row1, row2],
      ephemeral: true,
    });
  },
};
