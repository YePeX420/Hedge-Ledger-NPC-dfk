// index.js
// Hedge Ledger – minimal bot with /ping and /logtest

const fs = require('fs');
const path = require('path');
const {
  Client,
  Collection,
  GatewayIntentBits,
  Events,
  REST,
  Routes,
} = require('discord.js');

// ==== CONFIG FROM ENV (set these in Replit Secrets) ====
// DISCORD_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID
const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const GUILD_ID = process.env.DISCORD_GUILD_ID;

if (!TOKEN || !CLIENT_ID || !GUILD_ID) {
  console.error(
    '❌ Missing DISCORD_TOKEN, DISCORD_CLIENT_ID, or DISCORD_GUILD_ID in environment.'
  );
  process.exit(1);
}

// ==== DISCORD CLIENT ====
const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

// Collection to store commands
client.commands = new Collection();

// ==== LOAD COMMAND FILES ====
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs
  .readdirSync(commandsPath)
  .filter((file) => file.endsWith('.js'));

const slashCommandsForRegistration = [];

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);

  if (!command.data || !command.execute) {
    console.warn(`⚠️ Command at ${filePath} is missing "data" or "execute". Skipping.`);
    continue;
  }

  client.commands.set(command.data.name, command);
  slashCommandsForRegistration.push(command.data.toJSON());
}

// ==== REGISTER SLASH COMMANDS (GUILD-SCOPED) ====
const rest = new REST({ version: '10' }).setToken(TOKEN);

async function registerCommands() {
  try {
    console.log(`🔁 Refreshing ${slashCommandsForRegistration.length} application (/) commands…`);
    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: slashCommandsForRegistration }
    );
    console.log('✅ Successfully registered application (/) commands.');
  } catch (error) {
    console.error('❌ Error registering commands:', error);
  }
}

// ==== EVENT: CLIENT READY ====
client.once(Events.ClientReady, (c) => {
  console.log(`🤖 Logged in as ${c.user.tag}`);
});

// ==== EVENT: INTERACTION HANDLER ====
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);

  if (!command) {
    console.error(`❌ No command matching ${interaction.commandName} found.`);
    return;
  }

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(`❌ Error executing command ${interaction.commandName}:`, error);

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({
        content: 'There was an error while executing this command.',
        ephemeral: true,
      });
    } else {
      await interaction.reply({
        content: 'There was an error while executing this command.',
        ephemeral: true,
      });
    }
  }
});

// ==== STARTUP ====
(async () => {
  await registerCommands();
  await client.login(TOKEN);
})();
