// deploy-commands.js
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { REST, Routes } from 'discord.js';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const {
  DISCORD_TOKEN,
  DISCORD_CLIENT_ID,
  DISCORD_GUILD_ID
} = process.env;

if (!DISCORD_TOKEN || !DISCORD_CLIENT_ID || !DISCORD_GUILD_ID) {
  console.error('Missing DISCORD_TOKEN / DISCORD_CLIENT_ID / DISCORD_GUILD_ID in env');
  process.exit(1);
}

// Load all commands from /commands directory
const commands = [];
const commandsPath = path.join(process.cwd(), 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  try {
    const commandModule = await import(`./commands/${file}`);
    const command = commandModule.default || commandModule;
    
    if (command?.data) {
      const commandJson = command.data.toJSON();
      commands.push(commandJson);
      console.log(`✓ Loaded command: ${commandJson.name} (${file})`);
    } else {
      console.warn(`⚠ Skipped ${file}: missing .data property`);
    }
  } catch (err) {
    console.error(`✗ Error loading ${file}:`, err.message);
  }
}

if (commands.length === 0) {
  console.error('No commands found to register!');
  process.exit(1);
}

const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

try {
  console.log(`\nRegistering ${commands.length} commands to guild ${DISCORD_GUILD_ID}…`);
  const result = await rest.put(
    Routes.applicationGuildCommands(DISCORD_CLIENT_ID, DISCORD_GUILD_ID),
    { body: commands }
  );
  console.log(`✅ Successfully registered ${result.length} commands to guild`);
  process.exit(0);
} catch (err) {
  console.error('❌ Command registration failed:', err);
  process.exit(1);
}
