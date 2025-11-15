// register-commands.js
import 'dotenv/config';
import { REST, Routes } from 'discord.js';

const {
  DISCORD_TOKEN,
  DISCORD_CLIENT_ID,
  DISCORD_GUILD_ID
} = process.env;

if (!DISCORD_TOKEN || !DISCORD_CLIENT_ID || !DISCORD_GUILD_ID) {
  console.error('Missing DISCORD_TOKEN / DISCORD_CLIENT_ID / DISCORD_GUILD_ID in env');
  process.exit(1);
}

const commands = [
  {
    name: 'help',
    description: 'List Hedge Ledger NPC commands'
  },
  {
    name: 'npc',
    description: 'Chat with Hedge Ledger (free text)',
    options: [
      {
        name: 'message',
        description: 'What do you want to ask?',
        type: 3, // STRING
        required: true
      }
    ]
  },
  {
    name: 'hero',
    description: 'Get hero info in Hedge’s voice',
    options: [
      { name: 'id', description: 'Hero ID', type: 4, required: true } // INTEGER
    ]
  },
  {
    name: 'garden',
    description: 'Yield estimates for an LP',
    options: [
      { name: 'lp', description: 'LP symbol (e.g., CRYSTAL-AVAX)', type: 3, required: true },
      { name: 'amount', description: 'Amount in LP or USD (e.g., 1000)', type: 10, required: false } // NUMBER
    ]
  },
  {
    name: 'quest',
    description: 'Quest recommendation',
    options: [
      { name: 'goal', description: 'xp | gold | materials | profession', type: 3, required: true }
    ]
  },
  {
    name: 'stats',
    description: 'Portfolio / stats summary (high level)',
    options: [
      { name: 'wallet', description: 'Wallet (optional)', type: 3, required: false }
    ]
  },
  {
    name: 'walkthrough',
    description: 'Step-by-step game/interface walkthrough (free)',
    options: [
      {
        name: 'topic',
        description: 'gardens, quests, pets, summoning, interface, getting-started, etc.',
        type: 3,
        required: false
      }
    ]
  }
];

const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

try {
  console.log('Registering guild commands…');
  await rest.put(
    Routes.applicationGuildCommands(DISCORD_CLIENT_ID, DISCORD_GUILD_ID),
    { body: commands }
  );
  console.log('✅ Commands registered to guild:', DISCORD_GUILD_ID);
} catch (err) {
  console.error('Command registration failed:', err);
  process.exit(1);
}
