// commands/ping.js

const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check if Hedge is online and measure latency.'),

  async execute(interaction) {
    const latency = Date.now() - interaction.createdTimestamp;
    const uptimeMs = interaction.client.uptime || 0;
    const uptimeSeconds = Math.floor(uptimeMs / 1000);
    const uptimeMinutes = Math.floor(uptimeSeconds / 60);
    const uptimeHours = Math.floor(uptimeMinutes / 60);

    await interaction.reply(
      `🟢 Hedge online!\n` +
      `Latency: \`${latency} ms\`\n` +
      `Uptime: \`${uptimeHours}h ${uptimeMinutes % 60}m ${uptimeSeconds % 60}s\``
    );
  },
};
