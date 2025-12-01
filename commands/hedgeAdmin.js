// commands/hedgeAdmin.js
const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle } = require('discord.js');

// Helper function to check if user is admin
function userIsAdmin(interaction) {
  const userId = interaction.user.id;
  const userRoles = interaction.member?.roles?.cache?.map(r => r.id) || [];
  const ownerId = process.env.OWNER_ID;
  const adminRoleId = process.env.ADMIN_ROLE_ID;

  // Check if user is owner
  if (userId === ownerId) return true;

  // Check if user has admin role
  if (adminRoleId && userRoles.includes(adminRoleId)) return true;

  return false;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('hedge-admin')
    .setDescription('Open the Hedge Ledger admin dashboard (admins only).'),

  async execute(interaction) {
    const adminChannelId = process.env.ADMIN_CHANNEL_ID;

    // Check if command is in admin channel
    if (adminChannelId && interaction.channelId !== adminChannelId) {
      return interaction.reply({
        content: `This command is only available in <#${adminChannelId}>.`,
        ephemeral: true,
      });
    }

    // Check if user is admin
    if (!userIsAdmin(interaction)) {
      return interaction.reply({
        content: 'You do not have permission to use this command. Only the owner or admins can access the dashboard.',
        ephemeral: true,
      });
    }

    // Create admin dashboard embed
    const embed = new EmbedBuilder()
      .setColor('#FFD700')
      .setTitle('Hedge Ledger Admin Dashboard')
      .setDescription('Access the admin dashboard to manage bot settings, view analytics, and manage users.')
      .addFields(
        { name: 'Dashboard URL', value: 'Click the button below to open the dashboard', inline: false },
        { name: 'Features', value: '• User management\n• Expense tracking\n• Settings configuration\n• Analytics overview', inline: false }
      )
      .setFooter({ text: 'Admin Only - Access Restricted' })
      .setTimestamp();

    // Create button to open dashboard
    const dashboardUrl = process.env.DASHBOARD_URL || `${process.env.REPLIT_URL || 'http://localhost:5000'}/admin`;
    const button = new ButtonBuilder()
      .setLabel('Open Dashboard')
      .setStyle(ButtonStyle.Link)
      .setURL(dashboardUrl);

    const row = new ActionRowBuilder().addComponents(button);

    await interaction.reply({
      embeds: [embed],
      components: [row],
      ephemeral: true,
    });
  },
};
