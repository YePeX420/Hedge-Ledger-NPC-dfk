// commands/logtest.js

const { SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('logtest')
    .setDescription('Write a test entry into Hedge log for debugging.'),

  async execute(interaction) {
    const now = new Date();
    const logLine = `[${now.toISOString()}] LOGTEST from ${interaction.user.tag} (${interaction.user.id}) in guild ${interaction.guildId}\n`;

    try {
      const logsDir = path.join(__dirname, '..', 'logs');
      const logFilePath = path.join(logsDir, 'hedge.log');

      if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir);
      }

      fs.appendFileSync(logFilePath, logLine, 'utf8');

      await interaction.reply({
        content: '📝 Log test recorded.',
        ephemeral: true,
      });
    } catch (err) {
      console.error('❌ Error writing log file:', err);
      await interaction.reply({
        content: 'Failed to write to log file.',
        ephemeral: true,
      });
    }
  },
};
