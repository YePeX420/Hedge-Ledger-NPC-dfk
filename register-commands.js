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
    description: 'Get LIVE hero data from blockchain',
    options: [
      { name: 'id', description: 'Hero ID', type: 4, required: true } // INTEGER
    ]
  },
  {
    name: 'market',
    description: 'Analyze marketplace listings (LIVE blockchain data)',
    options: [
      { name: 'class', description: 'Filter by class (e.g., Wizard, Paladin)', type: 3, required: false },
      { name: 'max_price', description: 'Max price in JEWEL/CRYSTAL', type: 10, required: false },
      { name: 'limit', description: 'Number of results (default 10)', type: 4, required: false }
    ]
  },
  {
    name: 'lookup',
    description: 'Search heroes by criteria (LIVE blockchain data)',
    options: [
      { name: 'class', description: 'Hero class', type: 3, required: false },
      { name: 'profession', description: 'Profession (mining, gardening, etc)', type: 3, required: false },
      { name: 'for_sale', description: 'Only show heroes for sale', type: 5, required: false }, // BOOLEAN
      { name: 'min_level', description: 'Minimum level', type: 4, required: false }
    ]
  },
  {
    name: 'wallet',
    description: 'View heroes owned by a wallet address (LIVE data)',
    options: [
      { name: 'address', description: 'Wallet address (0x...)', type: 3, required: true }
    ]
  },
  {
    name: 'garden',
    description: 'Live garden pool APR, fees, and harvestable rewards',
    options: [
      { name: 'pool', description: 'Pool pair (e.g., CRYSTAL-AVAX) or "all"', type: 3, required: false },
      { name: 'wallet', description: 'Wallet address to check harvestable rewards', type: 3, required: false },
      { name: 'realm', description: 'dfk or klaytn (default: dfk)', type: 3, required: false }
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
