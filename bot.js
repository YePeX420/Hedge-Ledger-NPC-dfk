// bot.js
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { exec } from 'child_process';
import { promisify } from 'util';
import { Client, GatewayIntentBits, Partials, Events, AttachmentBuilder, EmbedBuilder, Collection } from 'discord.js';
import OpenAI from 'openai';
import * as onchain from './onchain-data.js';
import * as analytics from './garden-analytics.js';
import * as quickData from './quick-data-fetcher.js';
import { parseIntent, formatIntent } from './intent-parser.js';
import { requestDeposit, HEDGE_WALLET } from './deposit-flow.js';
import * as gardenMenu from './garden-menu.js';
import { startMonitoring, stopMonitoring, initializeExistingJobs, verifyTransactionHash } from './transaction-monitor-v2.js';
import { registerJob } from './payment-jobs.js';
import { ethers } from 'ethers';
import { creditBalance } from './balance-credit.js';
import { initializeProcessor, startProcessor, stopProcessor } from './optimization-processor.js';
import { startSnapshotJob, stopSnapshotJob } from './wallet-snapshot-job.js';
import { fetchWalletBalances } from './blockchain-balance-fetcher.js';
import { initializePricingConfig } from './pricing-engine.js';
import { getAnalyticsForDiscord } from './analytics.js';
import { initializePoolCache, stopPoolCache, getCachedPoolAnalytics } from './pool-cache.js';
import { generateOptimizationMessages } from './report-formatter.js';
import { calculateSummoningProbabilities } from './summoning-engine.js';
import { createSummarySummoningEmbed, createStatGenesEmbed, createVisualGenesEmbed } from './summoning-formatter.js';
import { decodeHeroGenes } from './hero-genetics.js';
import { db } from './server/db.js';
import { jewelBalances, players, depositRequests, queryCosts, interactionSessions, interactionMessages, gardenOptimizations, walletSnapshots, adminSessions } from './shared/schema.ts';
import { eq, desc, sql, inArray, and, gt, lt } from 'drizzle-orm';
import http from 'http';
import express from 'express';
import { isPaymentBypassEnabled, getDebugSettings, setDebugSettings } from './debug-settings.js';

// Player User Model System imports
import { 
  getOrCreateProfileByDiscordId, 
  logDiscordMessage, 
  getQuickProfileSummary,
  forceReclassify,
  setTierOverride,
  listProfiles
} from './player-profile-service.js';
import { adaptResponse, generateGreeting, shouldSuggestPremium } from './hedge-persona-adapter.js';
import { ARCHETYPES, TIERS, STATES, BEHAVIOR_TAGS } from './classification-config.js';
import { profileCommands } from './commands/profile-commands.js';

const execAsync = promisify(exec);

// --- Runtime status flags for health checks ---
let paymentMonitorStarted = false;
let poolCacheInitialized = false;
let optimizationProcessorStarted = false;
let snapshotJobStarted = false;
let cacheQueueInitialized = false;

// --- DM Conversation Context ---
// Tracks the last hero ID discussed per user for follow-up questions
const dmConversationContext = new Map(); // userId -> { lastHeroId, lastHeroData, timestamp }

// RPC + HTTP helpers for /health
async function checkJsonRpcEndpoint(url) {
  if (!url) return { status: 'NOT_CONFIGURED' };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    const res = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_blockNumber',
        params: []
      })
    });

    clearTimeout(timeout);

    if (!res.ok) {
      return { status: 'ERROR', detail: `HTTP ${res.status}` };
    }

    const data = await res.json();
    const blockHex = data?.result;
    return { status: 'OK', detail: `block ${parseInt(blockHex || '0', 16)}` };
  } catch (err) {
    return { status: 'ERROR', detail: err.message || String(err) };
  }
}

async function checkHttpEndpoint(url) {
  if (!url) return { status: 'NOT_CONFIGURED' };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    const res = await fetch(url, { method: 'GET', signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) {
      return { status: 'ERROR', detail: `HTTP ${res.status}` };
    }
    return { status: 'OK', detail: 'HTTP 200' };
  } catch (err) {
    return { status: 'ERROR', detail: err.message || String(err) };
  }
}


// Helper function to convert BigInt values to strings for JSON serialization
function serializeBigInt(obj) {
  if (obj === null || obj === undefined) return obj;

  if (typeof obj === 'bigint') {
    return obj.toString();
  }

  if (Array.isArray(obj)) {
    return obj.map(item => serializeBigInt(item));
  }

  if (typeof obj === 'object') {
    const serialized = {};
    for (const key in obj) {
      serialized[key] = serializeBigInt(obj[key]);
    }
    return serialized;
  }

  return obj;
}

const {
  DISCORD_TOKEN,
  OPENAI_API_KEY,
  OPENAI_MODEL = 'gpt-4o-mini',
  HEDGE_PROMPT_PATH = 'prompt/hedge-ledger.md',
  DISCORD_CLIENT_ID,
  DISCORD_CLIENT_SECRET,
  DISCORD_GUILD_ID,
  SESSION_SECRET,
  REDIRECT_URI = 'http://localhost:5000/auth/discord/callback'
} = process.env;

// Validate SESSION_SECRET
if (DISCORD_CLIENT_ID && !SESSION_SECRET) {
  throw new Error('SESSION_SECRET environment variable is required for OAuth authentication. Generate one with: openssl rand -hex 32');
}

// Load Hedge Ledger system prompt from file
let HEDGE_PROMPT = '';
try {
  HEDGE_PROMPT = fs.readFileSync(HEDGE_PROMPT_PATH, 'utf8');
  if (!HEDGE_PROMPT || HEDGE_PROMPT.length < 50) {
    console.warn('⚠️ Hedge prompt file looks empty/short. Double-check prompt/hedge-ledger.md');
  }
} catch (e) {
  console.error('❌ Could not read HEDGE_PROMPT_PATH:', HEDGE_PROMPT_PATH, e.message);
  process.exit(1);
}

// Load DeFi Kingdoms knowledge base
const KNOWLEDGE_FILES = [
  'knowledge/heroes.md',
  'knowledge/quests.md',
  'knowledge/gardens.md',
  'knowledge/ui-navigation.md',
  'knowledge/npcs.md'
];

let DFK_KNOWLEDGE = '\n\n---\n\n# DEFI KINGDOMS KNOWLEDGE BASE\n\n';
let loadedKnowledgeCount = 0;

for (const file of KNOWLEDGE_FILES) {
  try {
    const content = fs.readFileSync(file, 'utf8');
    DFK_KNOWLEDGE += content + '\n\n';
    loadedKnowledgeCount++;
  } catch (e) {
    console.warn(`⚠️ Could not load knowledge file ${file}:`, e.message);
  }
}

if (loadedKnowledgeCount > 0) {
  HEDGE_PROMPT += DFK_KNOWLEDGE;
  console.log(`📚 Loaded ${loadedKnowledgeCount}/${KNOWLEDGE_FILES.length} knowledge base files`);
} else {
  console.warn('⚠️ No knowledge base files loaded - bot will rely on GPT general knowledge only');
}

/**
 * Extract NPC data from knowledge base
 * @param {string} npcKey - NPC identifier (e.g., 'druid', 'seed box', 'harvest')
 * @returns {object|null} NPC data or null if not found
 */
function getNPCData(npcKey) {
  const npcMap = {
    'druid': {
      name: 'Druid',
      location: 'The Gardens (Crystalvale)',
      function: 'Manage liquidity pools - add/remove liquidity, view pool statistics',
      imagePath: 'knowledge/npcs/druid.png'
    },
    'seed box': {
      name: 'Seed Box',
      location: 'The Gardens (Crystalvale)',
      function: 'View garden pool data and your LP positions',
      imagePath: 'knowledge/npcs/seed-box.png'
    },
    'harvest': {
      name: 'Harvest',
      location: 'The Gardens (Crystalvale)',
      function: 'Claim your distribution rewards from staked LP tokens',
      imagePath: 'knowledge/npcs/harvest.png'
    }
  };

  return npcMap[npcKey] || null;
}

/**
 * Update a player's wallet addresses
 * First wallet becomes primaryWallet, all wallets added to wallets array
 * @param {string} discordId - Discord user ID
 * @param {string} walletAddress - Ethereum wallet address (0x...)
 * @returns {Promise<object>} Updated player record
 */
async function updatePlayerWallet(discordId, walletAddress) {
  console.log(`[updatePlayerWallet] Adding wallet ${walletAddress} for user ${discordId}`);

  try {
    // Get current player data
    const [player] = await db.select().from(players).where(eq(players.discordId, discordId)).limit(1);

    if (!player) {
      throw new Error(`Player not found: ${discordId}`);
    }

    // Normalize wallet address to lowercase
    const normalizedWallet = walletAddress.toLowerCase();

    // Check if this is their first wallet
    const isFirstWallet = !player.primaryWallet;

    // Get current wallets array, or initialize empty
    const currentWallets = player.wallets || [];

    // Check if wallet already exists
    if (currentWallets.includes(normalizedWallet)) {
      console.log(`[updatePlayerWallet] Wallet already exists for user, skipping`);
      return player;
    }

    // Add wallet to array
    const updatedWallets = [...currentWallets, normalizedWallet];

    // Build update object
    const updateData = {
      wallets: updatedWallets
    };

    // If first wallet, also set as primary
    if (isFirstWallet) {
      updateData.primaryWallet = normalizedWallet;
      console.log(`[updatePlayerWallet] Setting ${normalizedWallet} as primary wallet`);
    }

    // Update player record
    const [updatedPlayer] = await db.update(players)
      .set(updateData)
      .where(eq(players.discordId, discordId))
      .returning();

    console.log(`✅ Wallet added successfully. Total wallets: ${updatedWallets.length}`);
    return updatedPlayer;
  } catch (err) {
    console.error(`❌ [updatePlayerWallet] FAILED:`, err);
    throw err;
  }
}

/**
 * Ensure a user is registered in the database
 * Creates player and balance records if they don't exist
 * @param {string} discordId - Discord user ID
 * @param {string} username - Discord username
 * @returns {Promise<{player: object, isNewUser: boolean}>} Player and registration status
 */
async function ensureUserRegistered(discordId, username) {
  console.log(`[ensureUserRegistered] START - User: ${username}, ID: ${discordId}`);

  try {
    console.log(`[ensureUserRegistered] Checking if user exists...`);
    // Check if player exists
    const existingPlayer = await db.select().from(players).where(eq(players.discordId, discordId)).limit(1);
    console.log(`[ensureUserRegistered] Query result:`, existingPlayer);

    if (existingPlayer.length > 0) {
      console.log(`[ensureUserRegistered] User already exists, skipping registration`);
      // User already registered
      return { player: existingPlayer[0], isNewUser: false };
    }

    // Create new player
    console.log(`📝 Registering new user: ${username} (${discordId})`);

    console.log(`[ensureUserRegistered] Inserting into players table...`);
    const [newPlayer] = await db.insert(players).values({
      discordId,
      discordUsername: username
    }).returning();
    console.log(`[ensureUserRegistered] Player created:`, newPlayer);

    // Create initial balance record with 'free' tier
    console.log(`[ensureUserRegistered] Creating balance record for player ID: ${newPlayer.id}`);
    await db.insert(jewelBalances).values({
      playerId: newPlayer.id,
      balanceJewel: '0',
      lifetimeDepositsJewel: '0',
      tier: 'free',
      freeGardenAprsUsedToday: 0,
      freeSummonUsedToday: 0,
      lastFreeResetDate: new Date().toISOString().split('T')[0]
    });
    console.log(`[ensureUserRegistered] Balance record created`);

    console.log(`✅ User registered: ${username} with free tier`);
    return { player: newPlayer, isNewUser: true };
  } catch (err) {
    console.error(`❌ [ensureUserRegistered] FAILED for ${username}:`, err);
    console.error(`❌ [ensureUserRegistered] Error stack:`, err.stack);
    throw err;
  }
}

if (!DISCORD_TOKEN) throw new Error('Missing DISCORD_TOKEN');
if (!OPENAI_API_KEY) throw new Error('Missing OPENAI_API_KEY');

// OpenAI client
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// Discord client with DM + member intents
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel] // needed for DMs
});

// Initialize commands collection
client.commands = new Collection();

// Load all commands from /commands directory
async function loadCommands() {
  const commandsPath = path.join(process.cwd(), 'commands');
  const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
  
  let loadedCount = 0;
  for (const file of commandFiles) {
    try {
      const commandModule = await import(`./commands/${file}`);
      const command = commandModule.default || commandModule;
      
      if (command?.data && command?.execute) {
        client.commands.set(command.data.name, command);
        console.log(`✓ Loaded command: ${command.data.name} (${file})`);
        loadedCount++;
      } else {
        console.warn(`⚠ Skipped ${file}: missing .data or .execute property`);
      }
    } catch (err) {
      console.error(`✗ Error loading ${file}:`, err.message);
    }
  }
  console.log(`📝 Loaded ${loadedCount} slash commands`);
}

// Load commands on startup
await loadCommands();

// Helper to auto-deploy commands on bot startup
async function deployCommands() {
  try {
    const { REST, Routes } = await import('discord.js');
    const commands = [];
    const commandsPath = path.join(process.cwd(), 'commands');
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

    for (const file of commandFiles) {
      try {
        const commandModule = await import(`./commands/${file}`);
        const command = commandModule.default || commandModule;
        if (command?.data) {
          commands.push(command.data.toJSON());
        }
      } catch (err) {
        console.error(`Error loading ${file}:`, err.message);
      }
    }

    if (commands.length === 0) return;

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    const result = await rest.put(
      Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, process.env.DISCORD_GUILD_ID),
      { body: commands }
    );
    console.log(`✅ Auto-deployed ${result.length} commands on startup`);
  } catch (err) {
    console.error('❌ Command auto-deploy failed:', err.message);
  }
}

client.once(Events.ClientReady, async (c) => {
  console.log(`🤖 Logged in as ${c.user.tag}`);
  console.log(`🧠 Model: ${OPENAI_MODEL}`);

  // 🔧 Register ALL slash commands (commands from /commands folder + debug commands) on the guild
  try {
      if (!DISCORD_GUILD_ID) {
        console.warn('⚠️ DISCORD_GUILD_ID not set; skipping command registration.');
      } else if (c.application) {
        console.log('🛠 Registering all slash commands...');

        // First, load commands from /commands folder
        const folderCommands = [];
        const commandsPath = path.join(process.cwd(), 'commands');
        const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

        for (const file of commandFiles) {
          try {
            const commandModule = await import(`./commands/${file}`);
            const command = commandModule.default || commandModule;
            if (command?.data) {
              folderCommands.push(command.data.toJSON());
              console.log(`✓ Adding command from folder: ${command.data.name}`);
            }
          } catch (err) {
            console.error(`✗ Error loading ${file}:`, err.message);
          }
        }

        // Debug/utility commands defined inline
        // Note: ping and logtest are now in /commands folder, not duplicated here
        const debugCommands = [
          {
            name: 'health',
            description: 'Show Hedge system health (RPC, DB, OpenAI, cache, monitors).'
          },
          {
            name: 'debug-wallet',
            description: 'Raw debug info for a wallet (heroes + basic garden data).',
            options: [
              {
                name: 'address',
                description: 'Wallet address (0x...) to inspect',
                type: 3,           // STRING
                required: true
              }
            ]
          },
          {
            name: 'debug-heroes-by-class',
            description: 'List hero IDs for a given class and realm for debugging.',
            options: [
              {
                name: 'address',
                description: 'Wallet address (0x...) to inspect',
                type: 3,           // STRING
                required: true
              },
              {
                name: 'class',
                description: 'Hero class',
                type: 3,           // STRING
                required: true,
                choices: [
                  { name: 'Warrior', value: 'Warrior' },
                  { name: 'Knight', value: 'Knight' },
                  { name: 'Thief', value: 'Thief' },
                  { name: 'Archer', value: 'Archer' },
                  { name: 'Priest', value: 'Priest' },
                  { name: 'Wizard', value: 'Wizard' },
                  { name: 'Monk', value: 'Monk' },
                  { name: 'Pirate', value: 'Pirate' },
                  { name: 'Paladin', value: 'Paladin' },
                  { name: 'DarkKnight', value: 'DarkKnight' },
                  { name: 'Summoner', value: 'Summoner' },
                  { name: 'Ninja', value: 'Ninja' },
                  { name: 'Shapeshifter', value: 'Shapeshifter' },
                  { name: 'Bard', value: 'Bard' },
                  { name: 'Dragoon', value: 'Dragoon' },
                  { name: 'Sage', value: 'Sage' },
                  { name: 'Spellbow', value: 'Spellbow' }
                ]
              },
              {
                name: 'realm',
                description: 'Realm filter',
                type: 3,           // STRING
                required: false,
                choices: [
                  { name: 'All Realms', value: 'all' },
                  { name: 'Crystalvale (DFK Chain)', value: 'dfk' },
                  { name: 'Sundered Isles (Metis)', value: 'met' }
                ]
              }
            ]
          },
          {
            name: 'debug-hero-id',
            description: 'Debug: show detailed hero info by ID',
            options: [
              {
                name: 'id',
                description: 'Hero ID (e.g. 50161 or 1000000050161)',
                type: 3,           // STRING
                required: true
              }
            ]
          },
          {
            name: 'hedge-wallet',
            description: 'Hedge-style wallet analysis in DMs.',
            options: [
              {
                name: 'address',
                description: 'Wallet address (0x...) - optional if you have a linked wallet',
                type: 3,           // STRING
                required: false
              }
            ]
          },
          {
            name: 'debug-hero-index',
            description: 'Debug: build genetics-aware hero index for a wallet',
            options: [
              {
                name: 'address',
                description: 'Wallet address (0x...)',
                type: 3,           // STRING
                required: true
              }
            ]
          },
          {
            name: 'debug-hero-genetics',
            description: 'Debug: fetch raw genetics data for a specific hero ID',
            options: [
              {
                name: 'id',
                description: 'Hero ID (e.g. 283911)',
                type: 3,           // STRING
                required: true
              }
            ]
          },
          {
            name: 'summoning-calc',
            description: 'Calculate summoning probabilities for two heroes',
            options: [
              {
                name: 'hero1',
                description: 'First hero ID (e.g. 1564)',
                type: 3,           // STRING
                required: true
              },
              {
                name: 'hero2',
                description: 'Second hero ID (e.g. 283911)',
                type: 3,           // STRING
                required: true
              }
            ]
          },
          // Profile Commands (Player User Model System)
          {
            name: 'hedge-profile',
            description: 'View player classification profile',
            options: [
              {
                name: 'user',
                description: 'User to view (admin only, defaults to yourself)',
                type: 6,           // USER
                required: false
              }
            ]
          },
          {
            name: 'hedge-reclassify',
            description: 'Force reclassification of a player (admin only)',
            options: [
              {
                name: 'user',
                description: 'User to reclassify',
                type: 6,           // USER
                required: true
              }
            ]
          },
          {
            name: 'hedge-set-tier',
            description: 'Manually set a player access tier (admin only)',
            options: [
              {
                name: 'user',
                description: 'User to modify',
                type: 6,           // USER
                required: true
              },
              {
                name: 'tier',
                description: 'New tier level (0-4)',
                type: 4,           // INTEGER
                required: true,
                choices: [
                  { name: 'Tier 0 - Guest', value: 0 },
                  { name: 'Tier 1 - Bronze', value: 1 },
                  { name: 'Tier 2 - Silver', value: 2 },
                  { name: 'Tier 3 - Gold', value: 3 },
                  { name: 'Tier 4 - Council of Hedge', value: 4 }
                ]
              }
            ]
          },
          {
            name: 'hedge-profiles-list',
            description: 'List player profiles with filters (admin only)',
            options: [
              {
                name: 'archetype',
                description: 'Filter by archetype',
                type: 3,           // STRING
                required: false,
                choices: [
                  { name: 'Guest', value: 'GUEST' },
                  { name: 'Adventurer', value: 'ADVENTURER' },
                  { name: 'Player', value: 'PLAYER' },
                  { name: 'Investor', value: 'INVESTOR' },
                  { name: 'Extractor', value: 'EXTRACTOR' }
                ]
              },
              {
                name: 'tier',
                description: 'Filter by tier',
                type: 4,           // INTEGER
                required: false,
                choices: [
                  { name: 'Tier 0 - Guest', value: 0 },
                  { name: 'Tier 1 - Bronze', value: 1 },
                  { name: 'Tier 2 - Silver', value: 2 },
                  { name: 'Tier 3 - Gold', value: 3 },
                  { name: 'Tier 4 - Council', value: 4 }
                ]
              },
              {
                name: 'whales',
                description: 'Show only whales',
                type: 5,           // BOOLEAN
                required: false
              },
              {
                name: 'limit',
                description: 'Number of results (default 10)',
                type: 4,           // INTEGER
                required: false
              }
            ]
          },
          {
            name: 'debug-jewel-payments',
            description: 'View all JEWEL payments to Hedge wallet (admin only)',
            options: [
              {
                name: 'limit',
                description: 'Number of recent payments to show (default 20)',
                type: 4,           // INTEGER
                required: false
              }
            ]
          },
          {
            name: 'debug-wallet-payments',
            description: 'View JEWEL payments from a specific wallet (admin only)',
            options: [
              {
                name: 'wallet',
                description: 'Wallet address (0x...)',
                type: 3,           // STRING
                required: true
              },
              {
                name: 'limit',
                description: 'Number of recent payments to show (default 20)',
                type: 4,           // INTEGER
                required: false
              }
            ]
          },
          {
            name: 'debug-transactions',
            description: 'View last 20 JEWEL token transfers to Hedge wallet from blockchain (admin only)',
            options: [
              {
                name: 'blocks',
                description: 'How many blocks back to search (default 50000, ~1 hour)',
                type: 4,           // INTEGER
                required: false
              }
            ]
          }
        ];

        // Merge folder commands with debug commands
        const allCommands = [...folderCommands, ...debugCommands];
        console.log(`📋 Total commands to register: ${allCommands.length}`);
        console.log(`📋 Command names: ${allCommands.map(cmd => cmd.name).join(', ')}`);
        
        // Use REST API directly for more reliable registration with timeout
        const { REST, Routes } = await import('discord.js');
        const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
        
        console.log(`📝 Registering commands via REST API...`);
        
        // Register commands with rate limit handling
        try {
          const result = await rest.put(
            Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, DISCORD_GUILD_ID),
            { body: allCommands }
          );
          console.log(`✅ Registered ${result.length} commands: ${result.map(cmd => cmd.name).join(', ')}`);
        } catch (regError) {
          if (regError.status === 429) {
            const retryAfter = regError.rawError?.retry_after || 300;
            console.warn(`⚠️ Rate limited - Discord limits command creates to 200/day. Retry after ${Math.ceil(retryAfter)}s`);
            console.log('📋 Existing commands will continue to work. New commands will register on next restart after rate limit resets.');
          } else {
            console.error('❌ Command registration error:', regError.message || regError);
          }
        }
      }
  } catch (err) {
    console.error('❌ Failed to register slash commands:', err);
  }

  // Initialize pool analytics cache FIRST (required by optimization processor)
  try {
    console.log('🏊 Initializing pool analytics cache...');
    await initializePoolCache();
    poolCacheInitialized = true;
    console.log('✅ Pool cache initialized');
  } catch (err) {
    console.error('❌ Failed to initialize pool cache:', err);
  }

  // Initialize garden optimization processor (depends on pool cache)
  try {
    console.log('🌿 Initializing garden optimization processor...');
    initializeProcessor(c);
    await startProcessor();
    optimizationProcessorStarted = true;
    console.log('✅ Optimization processor started');
  } catch (err) {
    console.error('❌ Failed to initialize optimization processor:', err);
  }

  // Initialize wallet snapshot job (daily balance tracking)
  try {
    console.log('📸 Starting wallet snapshot job...');
    await startSnapshotJob();
    snapshotJobStarted = true;
    console.log('✅ Wallet snapshot job started');
  } catch (err) {
    console.error('❌ Failed to start wallet snapshot job:', err);
  }

  // Initialize cache-ready queue monitor
  try {
    console.log('⏳ Initializing cache-ready queue monitor...');
    const { initializeCacheQueue } = await import('./cache-ready-queue.js');
    initializeCacheQueue(c);
    cacheQueueInitialized = true;
    console.log('✅ Cache queue monitor started');
  } catch (err) {
    console.error('❌ Failed to initialize cache queue:', err);
  }

  // Initialize DFK Age cache background job
  try {
    console.log('📅 Starting DFK Age cache job...');
    const { startDfkAgeCache } = await import('./dfk-age-cache.js');
    await startDfkAgeCache();
    console.log('✅ DFK Age cache job started');
  } catch (err) {
    console.error('❌ Failed to start DFK Age cache job:', err);
  }
});

// Generic helper to talk to Hedge
async function askHedge(userMessages, { mode } = {}) {
  const messages = [
    { role: 'system', content: HEDGE_PROMPT }
  ];

  if (mode === 'walkthrough') {
    messages.push({
      role: 'system',
      content:
        "You are in WALKTHROUGH MODE. Focus ONLY on explaining DeFi Kingdoms game concepts, UI navigation, and basic gameplay. " +
        "Do NOT discuss ROI, APR, yields, token prices, or financial advice. Assume the user is a beginner. " +
        "Use short, clear, step-by-step instructions. Keep answers compact but friendly."
    });
  }

  messages.push(...userMessages);

  const completion = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    temperature: mode === 'walkthrough' ? 0.2 : 0.4,
    messages
  });

  const text =
    completion.choices?.[0]?.message?.content?.trim() ||
    "…and that’s how we hedge the naps.";

  // Keep under Discord 2000-char limit
  return text.length > 1900 ? `${text.slice(0, 1900)}…` : text;
}

// 🔔 Auto-DM new members with onboarding intro
client.on(Events.GuildMemberAdd, async (member) => {
  // Ignore bots joining
  if (member.user.bot) return;

  const username = member.user.username;

  const welcomeText =
    `📬 **Welcome to the server, ${username}!**\n\n` +
    `I'm **Hedge Ledger**, the Reluctant Accountant of Serendale — a lazy genius who moonlights as your DFK onboarding guide.\n\n` +
    `Here’s how you can use me:\n\n` +
    `**1️⃣ Learn the basics (FREE)**\n` +
    `• In the server, try: \`/walkthrough topic:getting-started\`\n` +
    `• You can also ask for: \`quests\`, \`gardens\`, \`summoning\`, \`pets\`, or \`interface\`\n` +
    `  Example: \`/walkthrough topic:gardens\`\n\n` +
    `**2️⃣ Ask me questions directly**\n` +
    `• In the server, use: \`/npc message:<your question>\`\n` +
    `  e.g. \`/npc message: What should a new player focus on?\`\n\n` +
    `**3️⃣ Get in-character help with DFK systems**\n` +
    `• Heroes, professions, stamina, quests\n` +
    `• Gardens and LP basics\n` +
    `• How to navigate the game UI step-by-step\n\n` +
    `I keep the intro and walkthroughs free so new adventurers don’t get lost.\n` +
    `When you’re ready for deeper analytics and optimization, we can talk about “premium ledger access.” 😉\n\n` +
    `For now, try running **\`/walkthrough topic:getting-started\`** in the server and I’ll walk you through your first steps.`;

  try {
    await member.send(welcomeText);
    console.log(`📨 Sent welcome DM to ${username}`);
  } catch (err) {
    console.error("Could not DM new member:", err?.message || err);
  }
});

// 📨 DM conversation mode (no slash commands in DMs)
client.on('messageCreate', async (message) => {
  // Ignore bots (including Hedge himself)
  if (message.author.bot) return;

  // Only handle DMs (no guild)
  if (message.guild) return;

  try {
    // 📝 Register user in database if first time
    const discordId = message.author.id;
    const username = message.author.username;

    console.log(`[messageCreate] Attempting to register user: ${username} (${discordId})`);
    let isNewUser = false;
    let playerData = null;
    try {
      const result = await ensureUserRegistered(discordId, username);
      isNewUser = result.isNewUser;
      playerData = result.player;
      console.log(`[messageCreate] Registration completed successfully, isNewUser: ${isNewUser}`);

      // 🎁 If this is a new user, send wallet request prompt
      if (isNewUser) {
        const walletRequestMessage =
          `*yawns* Welcome to my ledger, ${username}.\n\n` +
          `So... are you familiar with DeFi Kingdoms, or are you brand new to Crystalvale? Either way, I can help—navigation guides for beginners, or even advanced queries for the OGs... for the right price, hehehe.\n\n` +
          `If you give me your wallet address, I can provide much better support—optimization strategies tailored to your heroes, help you track onboarding milestones, and even send you rewards as you complete them. ` +
          `Don't worry, I only have view-only rights on-chain with that address. Completely read-only.\n\n` +
          `If you'd rather not share it, that's fine too. You can still use the free walkthrough guides and basic help. Your choice.\n\n` +
          `What brings you to my ledger today? Need any help getting started?`;

        await message.reply(walletRequestMessage);
        console.log(`💼 Sent wallet request to new user: ${username}`);
        return; // Don't send a second AI response
      }
    } catch (regError) {
      // Log registration error but don't block bot response
      console.error(`[messageCreate] ⚠️  Registration failed but continuing with response:`, regError);
      console.error(`[messageCreate] Registration error stack:`, regError.stack);
    }

    // 📊 Log message to Player Profile System for classification tracking
    try {
      await logDiscordMessage(discordId, message.content, username);
      console.log(`[ProfileSystem] Logged message for classification: ${username}`);
    } catch (profileError) {
      // Don't block response if profile logging fails
      console.warn(`[ProfileSystem] ⚠️ Failed to log message for profile:`, profileError.message);
    }

    // 🔐 Check for transaction hash with tx: prefix for payment verification
    const txPrefixRegex = /tx:\s*0[xX][a-fA-F0-9]{64}/i;
    const txPrefixMatch = message.content.match(txPrefixRegex);

    if (txPrefixMatch && playerData) {
      const txHash = txPrefixMatch[0].replace(/tx:\s*/i, '').trim();
      console.log(`🔐 Detected transaction hash with tx: prefix: ${txHash}`);

      try {
        const pendingOpt = await db.select()
          .from(gardenOptimizations)
          .where(and(
            eq(gardenOptimizations.playerId, playerData.id),
            eq(gardenOptimizations.status, 'awaiting_payment'),
            gt(gardenOptimizations.expiresAt, new Date())
          ))
          .orderBy(desc(gardenOptimizations.createdAt))
          .limit(1);

        if (pendingOpt && pendingOpt.length > 0) {
          await message.reply(`🔍 Verifying your transaction...`);

          const result = await verifyTransactionHash(txHash, pendingOpt[0].id);

          if (result.success) {
            await message.reply(
              `✅ **Payment Verified!**\n\n` +
              `**Amount:** ${result.payment.amount} JEWEL\n` +
              `**Block:** ${result.payment.blockNumber}\n\n` +
              `Your optimization is now being processed. You'll receive your personalized recommendations in a few minutes! 🌿`
            );
          } else {
            await message.reply(`❌ **Verification Failed**\n\n${result.error}\n\nPlease check your transaction hash and try again.`);
          }
        } else {
          await message.reply(`No pending garden optimization found. Use your wallet's DM to request optimization first!`);
        }
        return;
      } catch (txError) {
        console.error(`❌ Failed to verify transaction:`, txError);
        await message.reply(`Hmm, I had trouble verifying that transaction. Try again or use \`/verify-payment\` command.`);
        return;
      }
    }

    // 💼 Check if message contains a wallet address (42 chars only, not 66-char tx hashes)
    // Using negative lookahead to ensure no more hex chars follow (prevents matching tx hashes)
    const walletRegex = /0[xX][a-fA-F0-9]{40}(?![a-fA-F0-9])/;
    const walletMatch = message.content.match(walletRegex);

    if (walletMatch && playerData) {
      const walletAddress = walletMatch[0];
      console.log(`💼 Detected wallet address in message: ${walletAddress}`);

      try {
        const updatedPlayer = await updatePlayerWallet(discordId, walletAddress);
        const isFirstWallet = updatedPlayer.wallets.length === 1;

        if (isFirstWallet) {
          const confirmMessage =
            `Perfect! I've saved your wallet address: \`${walletAddress}\`\n\n` +
            `Now I can give you personalized hero optimization advice and track your milestones. ` +
            `Feel free to ask me anything about your account, heroes, or how to navigate the game!`;
          await message.reply(confirmMessage);
          console.log(`✅ Confirmed wallet save to user: ${username}`);
        } else {
          await message.reply(`Got it! I've added \`${walletAddress}\` to your account.`);
        }

        // Don't process this message further - wallet was saved
        return;
      } catch (walletError) {
        console.error(`❌ Failed to save wallet:`, walletError);
        await message.reply(`Hmm, I had trouble saving that wallet address. Try again?`);
        return;
      }
    }

    let enrichedContent = `DM from ${message.author.username}: ${message.content}`;

    // Normal conversation - send to OpenAI
    console.log(`💬 Processing DM from ${username}: ${message.content}`);

    // Show typing indicator
    await message.channel.sendTyping();

    // 🦸 HERO DATA LOOKUP - Check if user is asking about a specific hero
    const heroIdRegex = /(?:hero\s*#?|#)(\d+)/i;
    const heroMatch = message.content.match(heroIdRegex);

    if (heroMatch) {
      const heroId = heroMatch[1];
      console.log(`🦸 Detected hero lookup request for hero #${heroId}`);

      try {
        const heroData = await onchain.getHeroById(heroId);
        
        if (heroData) {
          // Save to conversation context for follow-up questions
          dmConversationContext.set(discordId, {
            lastHeroId: heroId,
            lastHeroData: heroData,
            timestamp: Date.now()
          });
          
          // Format hero data for display
          const rarities = ['Common', 'Uncommon', 'Rare', 'Legendary', 'Mythic'];
          const rarity = rarities[heroData.rarity] || 'Unknown';
          
          const lines = [];
          lines.push(`**Hero #${heroData.normalizedId || heroId}** — ${heroData.mainClassStr || 'Unknown'}`);
          lines.push(`Rarity: **${rarity}** | Level: **${heroData.level}** | Generation: **${heroData.generation}**`);
          lines.push('');
          lines.push('**Stats:**');
          lines.push(`STR ${heroData.strength} • INT ${heroData.intelligence} • WIS ${heroData.wisdom} • AGI ${heroData.agility}`);
          lines.push(`VIT ${heroData.vitality} • END ${heroData.endurance} • DEX ${heroData.dexterity} • LCK ${heroData.luck}`);
          
          if (heroData.professionStr) {
            lines.push('');
            lines.push(`**Profession:** ${heroData.professionStr}`);
            lines.push(`Mining: ${heroData.mining} • Gardening: ${heroData.gardening} • Foraging: ${heroData.foraging} • Fishing: ${heroData.fishing}`);
          }
          
          if (heroData.summonsRemaining !== undefined) {
            lines.push('');
            lines.push(`**Breeding:** ${heroData.summonsRemaining}/${heroData.maxSummons} summons remaining`);
          }
          
          if (heroData.passive1 || heroData.active1) {
            lines.push('');
            lines.push('**Abilities:**');
            if (heroData.passive1) lines.push(`Passive 1: ${heroData.passive1.name}`);
            if (heroData.passive2) lines.push(`Passive 2: ${heroData.passive2.name}`);
            if (heroData.active1) lines.push(`Active 1: ${heroData.active1.name}`);
            if (heroData.active2) lines.push(`Active 2: ${heroData.active2.name}`);
          }
          
          // Tier 1: Basic lookup - no payment reminder (free tier)
          
          const heroInfo = lines.join('\n');
          
          // Discord has a 2000 char limit
          if (heroInfo.length <= 1900) {
            await message.reply(heroInfo);
          } else {
            await message.reply(heroInfo.slice(0, 1900) + '\n...');
          }
          
          console.log(`✅ Sent hero data for #${heroId}`);
          return; // Don't send to OpenAI
        } else {
          console.log(`❌ Hero #${heroId} not found`);
          await message.reply(`Hmm, I can't find hero #${heroId} on the blockchain. Sure you got the right ID?`);
          return;
        }
      } catch (heroError) {
        console.error(`❌ Error fetching hero #${heroId}:`, heroError.message);
        await message.reply(`*squints at ledger* Had trouble pulling that hero's data. Try again?`);
        return;
      }
    }

    // 🧬 TIER 2: GENETICS REQUEST - Check if user is asking about genetics
    const geneticsKeywords = ['genetic', 'genes', 'gene', 'genetica', 'recessive', 'dominant', 'r1', 'r2', 'r3', 'breeding trait', 'mutation chance'];
    const userContentLower = message.content.toLowerCase();
    const isGeneticsQuestion = geneticsKeywords.some(k => userContentLower.includes(k));
    
    // Check for hero ID in the genetics request (e.g., "genetics for hero 1569")
    const geneticsHeroMatch = message.content.match(/(?:hero\s*#?|#)(\d+)/i);
    
    // Check if we have a recent hero context (within 30 minutes)
    const context = dmConversationContext.get(discordId);
    const contextAge = context ? (Date.now() - context.timestamp) / 1000 / 60 : Infinity;
    const hasRecentContext = context && contextAge < 30;
    
    // Genetics request can be: 1) Direct with hero ID, or 2) Follow-up with context
    if (isGeneticsQuestion && (geneticsHeroMatch || (hasRecentContext && context.lastHeroData))) {
      let heroData;
      let heroId;
      
      // If hero ID in message, fetch fresh data (direct request)
      if (geneticsHeroMatch) {
        heroId = geneticsHeroMatch[1];
        console.log(`🧬 Detected direct genetics request for hero #${heroId}`);
        
        try {
          heroData = await onchain.getHeroById(heroId);
          if (!heroData) {
            await message.reply(`Hmm, I can't find hero #${heroId} on the blockchain. Sure you got the right ID?`);
            return;
          }
          // Update context for future follow-ups
          dmConversationContext.set(discordId, {
            lastHeroId: heroId,
            lastHeroData: heroData,
            timestamp: Date.now()
          });
        } catch (fetchError) {
          console.error(`❌ Error fetching hero #${heroId}:`, fetchError.message);
          await message.reply(`*squints at ledger* Had trouble pulling that hero's data. Try again?`);
          return;
        }
      } else {
        // Use context from previous conversation
        heroData = context.lastHeroData;
        heroId = context.lastHeroId;
        console.log(`🧬 Detected genetics follow-up for hero #${heroId}`);
      }
      
      try {
        // Decode full genetics
        const genetics = decodeHeroGenes(heroData);
        
        if (genetics._note) {
          // Raw genes not available - explain
          await message.reply(`I'd love to show you the full genetics for Hero #${heroId}, but the raw gene data isn't available right now. Try asking about a different hero?`);
          return;
        }
        
        // Format genetics for display
        const lines = [];
        lines.push(`**🧬 Full Genetics for Hero #${genetics.normalizedId || heroId}**`);
        lines.push('');
        lines.push('**Classes & Profession:**');
        lines.push(`Main Class: **${genetics.mainClass.dominant}** | R1: ${genetics.mainClass.R1} | R2: ${genetics.mainClass.R2} | R3: ${genetics.mainClass.R3}`);
        lines.push(`Sub Class: **${genetics.subClass.dominant}** | R1: ${genetics.subClass.R1} | R2: ${genetics.subClass.R2} | R3: ${genetics.subClass.R3}`);
        lines.push(`Profession: **${genetics.profession.dominant}** | R1: ${genetics.profession.R1} | R2: ${genetics.profession.R2} | R3: ${genetics.profession.R3}`);
        lines.push('');
        lines.push('**Abilities:**');
        lines.push(`Passive 1: **${genetics.passive1.dominant}** | R1: ${genetics.passive1.R1} | R2: ${genetics.passive1.R2} | R3: ${genetics.passive1.R3}`);
        lines.push(`Passive 2: **${genetics.passive2.dominant}** | R1: ${genetics.passive2.R1} | R2: ${genetics.passive2.R2} | R3: ${genetics.passive2.R3}`);
        lines.push(`Active 1: **${genetics.active1.dominant}** | R1: ${genetics.active1.R1} | R2: ${genetics.active1.R2} | R3: ${genetics.active1.R3}`);
        lines.push(`Active 2: **${genetics.active2.dominant}** | R1: ${genetics.active2.R1} | R2: ${genetics.active2.R2} | R3: ${genetics.active2.R3}`);
        lines.push('');
        lines.push('**Stat Boosts & Element:**');
        lines.push(`Stat Boost 1: **${genetics.statBoost1.dominant}** | R1: ${genetics.statBoost1.R1} | R2: ${genetics.statBoost1.R2} | R3: ${genetics.statBoost1.R3}`);
        lines.push(`Stat Boost 2: **${genetics.statBoost2.dominant}** | R1: ${genetics.statBoost2.R1} | R2: ${genetics.statBoost2.R2} | R3: ${genetics.statBoost2.R3}`);
        lines.push(`Element: **${genetics.element.dominant}** | R1: ${genetics.element.R1} | R2: ${genetics.element.R2} | R3: ${genetics.element.R3}`);
        
        // Add visual traits summary if available
        if (genetics.visual) {
          lines.push('');
          lines.push('**Visual Traits:**');
          lines.push(`Gender: **${genetics.visual.gender.dominant}** | Hair: ${genetics.visual.hairStyle.dominant} | Head: ${genetics.visual.headAppendage.dominant} | Back: ${genetics.visual.backAppendage.dominant}`);
        }
        
        // Analyst reminder
        lines.push('');
        lines.push('---');
        lines.push('*Decoding all those recessive genes made my analysts need a coffee break.* **Even 1 JEWEL** covers several more genetic analyses. Keep the data flowing? 😏');
        
        const geneticsInfo = lines.join('\n');
        
        // Discord has a 2000 char limit - may need to split
        if (geneticsInfo.length <= 1900) {
          await message.reply(geneticsInfo);
        } else {
          // Split into two messages
          const splitPoint = geneticsInfo.indexOf('**Stat Boosts');
          if (splitPoint > 0) {
            await message.reply(geneticsInfo.slice(0, splitPoint));
            await message.reply(geneticsInfo.slice(splitPoint));
          } else {
            await message.reply(geneticsInfo.slice(0, 1900) + '\n...');
          }
        }
        
        console.log(`✅ Sent genetics for hero #${heroId}`);
        return;
      } catch (geneticsError) {
        console.error(`❌ Error decoding genetics:`, geneticsError.message);
        // Fall through to OpenAI for a general response
      }
    }

    try {
      const response = await askHedge([
        { role: 'user', content: message.content }
      ]);

      // 💼 Wallet capture nudge system - append prompt if user has no wallet (frequency control: ~30% chance every message)
      let finalResponse = response;
      const hasWallet = playerData?.wallets && playerData.wallets.length > 0;
      const shouldNudge = !hasWallet && Math.random() < 0.3; // ~30% chance to nudge
      
      if (shouldNudge) {
        finalResponse += `\n\n---\n*By the way, if you share your wallet address, I can give you much more personalized advice—analyzing your heroes, checking your garden yields, the whole ledger. Might even set up some rewarded quests for you if you're new around the kingdoms!*`;
      }

      // 🎨 Intelligent chart attachment system
      const userContent = message.content.toLowerCase();
      const aiResponse = response.toLowerCase();
      const combined = userContent + ' ' + aiResponse;
      
      // Visual genetics keyword detection
      const hairstyleKeywords = ['hairstyle', 'hair style', 'hair mutation', 'hair breeding', 'hair genetic', 'hair gene'];
      const headAppendageKeywords = ['head appendage', 'cat ear', 'dragon horn', 'royal crown', 'demon horn', 'elven ear', 'fae chisel'];
      const backAppendageKeywords = ['back appendage', 'wing', 'phoenix wing', 'dragon wing', 'butterfly wing', 'gryphon wing'];
      const hairColorKeywords = ['hair color', 'hair colour'];
      const appendageColorKeywords = ['appendage color', 'appendage colour', 'wing color', 'ear color'];
      
      // Hero summoning keyword detection
      const heroSummoningKeywords = [
        'hero class', 'class breeding', 'class mutation', 'class tree',
        'summoning cost', 'summoning cooldown', 'summoning rarity',
        'hero summoning', 'summon hero', 'what class can i breed'
      ];
      
      // General triggers that attach multiple charts
      const generalVisualKeywords = ['visual trait', 'visual gene', 'visual genetic', 'visual breeding', 'visual mutation'];
      const generalBreedingKeywords = ['breeding chart', 'summoning tree', 'mutation chart', 'what can i breed'];
      
      // Check which categories match
      const matchHairstyle = hairstyleKeywords.some(k => combined.includes(k));
      const matchHeadAppendage = headAppendageKeywords.some(k => combined.includes(k)) || combined.includes('appendage') && !combined.includes('back');
      const matchBackAppendage = backAppendageKeywords.some(k => combined.includes(k));
      const matchHairColor = hairColorKeywords.some(k => combined.includes(k));
      const matchAppendageColor = appendageColorKeywords.some(k => combined.includes(k));
      const matchHeroSummoning = heroSummoningKeywords.some(k => combined.includes(k));
      const matchGeneralVisual = generalVisualKeywords.some(k => combined.includes(k));
      const matchGeneralBreeding = generalBreedingKeywords.some(k => combined.includes(k));
      
      const attachments = [];
      let chartTypes = [];
      
      // Hairstyle charts (gender-specific)
      if (matchHairstyle || matchGeneralVisual || matchGeneralBreeding) {
        attachments.push(new AttachmentBuilder('knowledge/female-hairstyle-chart.png'));
        attachments.push(new AttachmentBuilder('knowledge/male-hairstyle-chart.png'));
        chartTypes.push('hairstyles');
      }
      
      // Head appendage chart
      if (matchHeadAppendage || matchGeneralVisual || matchGeneralBreeding) {
        attachments.push(new AttachmentBuilder('knowledge/head-appendage-chart.png'));
        chartTypes.push('head-appendages');
      }
      
      // Back appendage chart
      if (matchBackAppendage || matchGeneralVisual || matchGeneralBreeding) {
        attachments.push(new AttachmentBuilder('knowledge/back-appendage-chart.png'));
        chartTypes.push('back-appendages');
      }
      
      // Hair color chart
      if (matchHairColor || matchGeneralVisual || matchGeneralBreeding) {
        attachments.push(new AttachmentBuilder('knowledge/hair-color-chart.png'));
        chartTypes.push('hair-colors');
      }
      
      // Appendage color chart
      if (matchAppendageColor || matchGeneralVisual || matchGeneralBreeding) {
        attachments.push(new AttachmentBuilder('knowledge/appendage-color-chart.png'));
        chartTypes.push('appendage-colors');
      }
      
      // Hero class summoning chart
      if (matchHeroSummoning || matchGeneralBreeding) {
        attachments.push(new AttachmentBuilder('knowledge/hero-class-summoning-chart.png'));
        chartTypes.push('hero-summoning');
      }

      if (attachments.length > 0) {
        console.log(`🎨 Detected breeding question - attaching ${attachments.length} chart(s): ${chartTypes.join(', ')}`);
        await message.reply({
          content: finalResponse,
          files: attachments
        });
        console.log(`✅ Sent AI response with ${attachments.length} chart(s) to ${username}`);
      } else {
        await message.reply(finalResponse);
        console.log(`✅ Sent AI response to ${username}`);
      }
    } catch (aiError) {
      console.error("❌ OpenAI error in DM:", aiError);
      await message.reply("*yawns* My ledger seems stuck... give me a moment and try again.");
    }

  } catch (err) {
    console.error("DM error:", err);
    await message.reply("*yawns* Something went wrong. Try again later.");
  }
});

// Helper: Check if user is admin for Discord interactions
function isUserAdmin(interaction) {
  const userId = interaction.user.id;
  const userRoles = interaction.member?.roles?.cache?.map(r => r.id) || [];
  const ownerId = process.env.OWNER_ID;
  const adminRoleId = process.env.ADMIN_ROLE_ID;

  if (userId === ownerId) return true;
  if (adminRoleId && userRoles.includes(adminRoleId)) return true;
  return false;
}

// Slash command handler

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    // Handle button interactions
    if (interaction.isButton()) {
      const customId = interaction.customId;
      
      // Admin button protection
      if (customId.startsWith('admin_')) {
        const adminChannelId = process.env.ADMIN_CHANNEL_ID;
        
        // Check channel
        if (adminChannelId && interaction.channelId !== adminChannelId) {
          return interaction.reply({
            content: `🔒 For security, admin actions can only be used in: <#${adminChannelId}>.`,
            ephemeral: true,
          });
        }
        
        // Check permissions
        if (!isUserAdmin(interaction)) {
          return interaction.reply({
            content: '⛔ This action is only available to Hedge Admins.',
            ephemeral: true,
          });
        }
        
        // Handle admin buttons
        if (customId === 'admin_refresh') {
          await interaction.deferUpdate();
          const { getAdminStats } = await import('./admin-stats.js');
          const stats = await getAdminStats();
          
          const { EmbedBuilder } = await import('discord.js');
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
          
          await interaction.editReply({ embeds: [embed] });
          return;
        }
        
        if (customId === 'admin_users') {
          return interaction.reply({
            content: 'Users management feature coming soon. Use the web dashboard for now.',
            ephemeral: true,
          });
        }
        
        if (customId === 'admin_settings') {
          return interaction.reply({
            content: 'Settings management feature coming soon. Use the web dashboard for now.',
            ephemeral: true,
          });
        }
      }

      // Handle account user buttons (non-admin)
      if (customId.startsWith('account_')) {
        if (customId === 'account_add_wallet') {
          return interaction.reply({
            content: '**Wallet linking coming soon.** Eventually this will let you connect your DFK wallets to Hedge. For now, you can share your address with an admin and we\'ll attach it manually.',
            ephemeral: true,
          });
        }
        
        if (customId === 'account_verify_wallet') {
          return interaction.reply({
            content: '**Wallet verification** will check that you control the wallet (for example by sending a small transaction to a Hedge verification address). This is not fully implemented yet.',
            ephemeral: true,
          });
        }
        
        if (customId === 'account_verify_payment') {
          return interaction.reply({
            content: '**Payment verification** will check the chain for a 5 JEWEL transfer from your verified wallet to the Hedge wallet. Once confirmed, Hedge will run an LP optimization and send it here in Discord. This feature is still being wired up.',
            ephemeral: true,
          });
        }
        
        if (customId === 'account_request_feature') {
          return interaction.reply({
            content: '**Feature request logging coming soon.** For now, please describe your idea in the support channel and tag an admin.',
            ephemeral: true,
          });
        }
      }

      // Handle wallet copy buttons
      if (customId.startsWith('wallet_copy_')) {
        const { getOrCreateUserProfile } = await import('./user-account-service.js');
        try {
          const walletIndex = parseInt(customId.replace('wallet_copy_', ''));
          const profile = await getOrCreateUserProfile(interaction.user.id, interaction.user.username || interaction.user.tag);
          
          if (!profile.wallets || profile.wallets.length <= walletIndex) {
            return interaction.reply({
              content: 'Wallet not found. Please run `/account` again and try the copy button once more.',
              ephemeral: true,
            });
          }
          
          const wallet = profile.wallets[walletIndex];
          return interaction.reply({
            content: `**Wallet address:**\n\`\`\`${wallet.address}\`\`\``,
            ephemeral: true,
          });
        } catch (err) {
          console.error('Error copying wallet:', err);
          return interaction.reply({
            content: 'Error retrieving wallet. Please try again.',
            ephemeral: true,
          });
        }
      }
      
      return;
    }

    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      
      // If command is in the commands collection, execute it
      if (command) {
        try {
          await command.execute(interaction);
          return;
        } catch (err) {
          console.error(`Error executing command ${interaction.commandName}:`, err);
          const reply = { content: 'An error occurred while executing this command.', ephemeral: true };
          if (interaction.deferred || interaction.replied) {
            await interaction.editReply(reply);
          } else {
            await interaction.reply(reply);
          }
          return;
        }
      }

      // Otherwise, handle built-in commands (ping, logtest, health, etc.)
      const name = interaction.commandName;
      await interaction.deferReply();

    // 🔧 Debug commands: /ping, /logtest, /health
    if (name === 'ping') {
      const latency = Date.now() - interaction.createdTimestamp;
      const uptimeMs = client.uptime || 0;
      const uptimeSeconds = Math.floor(uptimeMs / 1000);
      const uptimeMinutes = Math.floor(uptimeSeconds / 60);
      const uptimeHours = Math.floor(uptimeMinutes / 60);

      await interaction.editReply(
        `🟢 Hedge online!
` +
        `Latency: \`${latency} ms\`
` +
        `Uptime: \`${uptimeHours}h ${uptimeMinutes % 60}m ${uptimeSeconds % 60}s\``
      );
      return;
    }

    if (name === 'logtest') {
      try {
        const logsDir = 'logs';
        const logFilePath = `${logsDir}/hedge.log`;
        if (!fs.existsSync(logsDir)) {
          fs.mkdirSync(logsDir);
        }
        const now = new Date();
        const line = `[${now.toISOString()}] LOGTEST from ${interaction.user.tag} (${interaction.user.id}) in guild ${interaction.guildId}
`;
        fs.appendFileSync(logFilePath, line, 'utf8');
        await interaction.editReply('📝 Log test recorded.');
      } catch (err) {
        console.error('❌ Error writing log file for /logtest:', err);
        await interaction.editReply('Failed to write to log file.');
      }
      return;
    }

    if (name === 'health') {
      const startedAt = Date.now();
      const discordReady = client.isReady();
      const uptimeMs = client.uptime || 0;
      const uptimeSeconds = Math.floor(uptimeMs / 1000);
      const uptimeMinutes = Math.floor(uptimeSeconds / 60);
      const uptimeHours = Math.floor(uptimeMinutes / 60);

      const dfkRpcUrl     = process.env.DFK_RPC_URL     || process.env.DFK_RPC;
      const metisRpcUrl   = process.env.METIS_RPC_URL   || process.env.METIS_RPC;
      const cvRpcUrl      = process.env.CV_RPC_URL      || process.env.CV_RPC;
      const dfkGraphqlUrl = process.env.DFK_GRAPHQL_URL || process.env.DFK_GRAPHQL;

      const [
        dfkRpc,
        metisRpc,
        cvRpc,
        dfkGraphql,
        dbStatus,
        openaiStatus,
        fileStatus,
        poolCacheStatus
      ] = await Promise.all([
        checkJsonRpcEndpoint(dfkRpcUrl),
        checkJsonRpcEndpoint(metisRpcUrl),
        checkJsonRpcEndpoint(cvRpcUrl),
        checkHttpEndpoint(dfkGraphqlUrl),
        (async () => {
          try {
            await db.select().from(players).limit(1);
            return { status: 'OK' };
          } catch (err) {
            return { status: 'ERROR', detail: err.message || String(err) };
          }
        })(),
        (async () => {
          try {
            await openai.models.list();
            return { status: 'OK' };
          } catch (err) {
            return { status: 'ERROR', detail: err.message || String(err) };
          }
        })(),
        (async () => {
          try {
            const logsDir = 'logs';
            const logFilePath = `${logsDir}/health.log`;
            if (!fs.existsSync(logsDir)) {
              fs.mkdirSync(logsDir);
            }
            const line = `[${new Date().toISOString()}] /health check by ${interaction.user.tag} (${interaction.user.id})
`;
            fs.appendFileSync(logFilePath, line, 'utf8');
            return { status: 'OK' };
          } catch (err) {
            return { status: 'ERROR', detail: err.message || String(err) };
          }
        })(),
        (async () => {
          try {
            const analyticsData = getCachedPoolAnalytics();
            const count = Array.isArray(analyticsData) ? analyticsData.length : 0;
            if (!poolCacheInitialized) {
              return { status: 'INIT_FAILED', detail: `cached pools: ${count}` };
            }
            return {
              status: count > 0 ? 'READY' : 'WARMING_UP',
              detail: `cached pools: ${count}`
            };
          } catch (err) {
            return { status: 'ERROR', detail: err.message || String(err) };
          }
        })()
      ]);

      const elapsedMs = Date.now() - startedAt;
      const fmt = (name, obj) => {
        if (!obj) return `${name}: UNKNOWN`;
        if (!obj.detail) return `${name}: ${obj.status}`;
        return `${name}: ${obj.status} (${obj.detail})`;
      };

      const lines = [];
      lines.push('🩺 **Hedge System Health**');
      lines.push('');
      lines.push(`Discord: ${discordReady ? 'OK' : 'NOT_READY'} (uptime ${uptimeHours}h ${uptimeMinutes % 60}m ${uptimeSeconds % 60}s)`);
      lines.push('');
      lines.push('**RPC Endpoints**');
      lines.push(fmt('DFK RPC', dfkRpc));
      lines.push(fmt('CV RPC', cvRpc));
      lines.push(fmt('Metis RPC', metisRpc));
      lines.push('');
      lines.push('**GraphQL / APIs**');
      lines.push(fmt('DFK GraphQL', dfkGraphql));
      lines.push('');
      lines.push('**Core Services**');
      lines.push(fmt('Database', dbStatus));
      lines.push(fmt('OpenAI', openaiStatus));
      lines.push(fmt('File logging', fileStatus));
      lines.push(fmt('Pool cache', poolCacheStatus));
      lines.push(`Payment monitor: ${paymentMonitorStarted ? 'STARTED' : 'NOT_STARTED'}`);
      lines.push(`Optimization processor: ${optimizationProcessorStarted ? 'STARTED' : 'NOT_STARTED'}`);
      lines.push(`Snapshot job: ${snapshotJobStarted ? 'STARTED' : 'NOT_STARTED'}`);
      lines.push(`Cache-ready queue: ${cacheQueueInitialized ? 'STARTED' : 'NOT_STARTED'}`);
      lines.push('');
      lines.push(`⏱ Checked in ${elapsedMs} ms`);

      await interaction.editReply(lines.join('\n'));
      return;
    }

    if (name === 'debug-wallet') {
      const walletAddress = interaction.options.getString('address');
      
      if (!walletAddress || !walletAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
        await interaction.editReply('❌ Invalid wallet address. Must be a 40-character hex string starting with 0x.');
        return;
      }

      const lines = [];
      lines.push(`**Debug wallet report for ${walletAddress}**\n`);

      try {
        // Fetch heroes (paginated for large collections like 1000+ heroes, all realms)
        const heroes = await onchain.getAllHeroesByOwner(walletAddress);
        
        if (!heroes || heroes.length === 0) {
          lines.push('**Heroes**');
          lines.push('Total heroes: 0\n');
        } else {
          // Group heroes by realm/network
          const realmMap = {
            'hmy': 'Serendale (Harmony)',
            'kla': 'Serendale (Kaia)',
            'dfk': 'Crystalvale (DFK Chain)',
            'met': 'Sundered Isles (Metis)'
          };
          
          const herosByRealm = {};
          const uniqueNetworks = new Set();
          
          for (const hero of heroes) {
            const network = hero.network || 'unknown';
            uniqueNetworks.add(network);
            if (!herosByRealm[network]) {
              herosByRealm[network] = [];
            }
            herosByRealm[network].push(hero);
          }

          // DEBUG: Log all unique network values we found
          console.log(`[DEBUG] Unique network values found: ${Array.from(uniqueNetworks).join(', ')}`);
          console.log(`[DEBUG] Total heroes fetched: ${heroes.length}`);
          for (const [network, heroList] of Object.entries(herosByRealm)) {
            console.log(`[DEBUG] Network '${network}': ${heroList.length} heroes`);
          }

          lines.push('**Heroes**');
          lines.push(`DEBUG: Found network values: ${Array.from(uniqueNetworks).join(', ')}`);
          lines.push('');
          
          // Display each realm
          let grandTotal = 0;
          for (const [network, realmHeroes] of Object.entries(herosByRealm)) {
            const realmName = realmMap[network] || `Unknown Realm (${network})`;
            
            // Count by class for this realm
            const classCounts = {};
            for (const hero of realmHeroes) {
              const mainClass = hero.mainClassStr || 'Unknown';
              classCounts[mainClass] = (classCounts[mainClass] || 0) + 1;
            }
            
            lines.push(`**${realmName}**: ${realmHeroes.length} heroes`);
            
            const classBreakdown = Object.entries(classCounts)
              .sort((a, b) => b[1] - a[1]) // Sort by count descending
              .map(([cls, count]) => `${cls}: ${count}`)
              .join(', ');
            lines.push(`By class: ${classBreakdown}`);
            lines.push('');
            
            grandTotal += realmHeroes.length;
          }
          
          // Grand total across all realms
          if (Object.keys(herosByRealm).length > 1) {
            lines.push(`**Total across all realms**: ${grandTotal} heroes`);
            lines.push('');
          }
        }

        // Fetch all harvestable pools
        const cached = getCachedPoolAnalytics();
        
        if (!cached || !cached.data || cached.data.length === 0) {
          lines.push('**Gardens (harvestable rewards)**');
          lines.push('⚠️ Pool cache not ready yet. Try again in a minute.\n');
        } else {
          const pools = cached.data;
          const harvestablePoolsData = [];

          // Check pending rewards for each pool
          for (const pool of pools) {
            try {
              const pendingRewardsStr = await analytics.getUserPendingRewards(walletAddress, pool.pid);
              const pendingRewards = parseFloat(pendingRewardsStr);
              
              // Only include pools with rewards > 0.00001
              if (pendingRewards > 0.00001) {
                harvestablePoolsData.push({
                  pairName: pool.pairName,
                  rewards: pendingRewards
                });
              }
            } catch (err) {
              // Silently skip pools with errors
              continue;
            }
          }

          lines.push('**Gardens (harvestable rewards, all pools)**');
          
          if (harvestablePoolsData.length === 0) {
            lines.push('No harvestable rewards found (all pools < 0.00001 CRYSTAL)');
          } else {
            // Sort by rewards descending
            harvestablePoolsData.sort((a, b) => b.rewards - a.rewards);
            
            for (const poolData of harvestablePoolsData) {
              lines.push(`• ${poolData.pairName}: ${poolData.rewards.toFixed(4)} CRYSTAL`);
            }
          }
          lines.push('');
        }

        lines.push('*Raw debug view. Use Hedge persona commands for nicer analysis.*');
        
        await interaction.editReply(lines.join('\n'));

      } catch (err) {
        console.error('❌ Error in /debug-wallet:', err);
        await interaction.editReply(`❌ Error fetching wallet data: ${err.message}`);
      }
      
      return;
    }

    if (name === 'debug-heroes-by-class') {
      const walletAddress = interaction.options.getString('address');
      const targetClass = interaction.options.getString('class');
      const realmFilter = interaction.options.getString('realm') || 'all';
      
      if (!walletAddress || !walletAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
        await interaction.editReply('❌ Invalid wallet address. Must be a 40-character hex string starting with 0x.');
        return;
      }

      // Normalize class name (capitalize first letter)
      const normalizedClass = targetClass.charAt(0).toUpperCase() + targetClass.slice(1).toLowerCase();

      const lines = [];
      const shortAddress = `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;
      lines.push(`🧾 **Hero debug for ${shortAddress}**\n`);

      try {
        // Fetch all heroes
        const allHeroes = await onchain.getAllHeroesByOwner(walletAddress);
        
        if (!allHeroes || allHeroes.length === 0) {
          await interaction.editReply(`No heroes found for wallet ${shortAddress}`);
          return;
        }

        // Filter by realm if specified
        let heroes = allHeroes;
        if (realmFilter !== 'all') {
          heroes = allHeroes.filter(h => h.network === realmFilter);
        }

        // Filter by class
        const classHeroes = heroes.filter(h => h.mainClassStr === normalizedClass);

        // Build realm display
        const realmMap = {
          'dfk': 'Crystalvale (DFK Chain)',
          'met': 'Sundered Isles (Metis)',
          'all': 'All Realms'
        };
        const realmDisplay = realmMap[realmFilter] || realmFilter;

        lines.push(`**Realm**: ${realmDisplay}`);
        lines.push(`**Class**: ${normalizedClass}`);
        lines.push('');
        lines.push(`**Total heroes detected**: ${classHeroes.length}`);
        lines.push('');

        if (classHeroes.length === 0) {
          lines.push(`No ${normalizedClass} heroes found in this realm.`);
        } else {
          // Extract IDs
          const heroIds = classHeroes.map(h => h.id);
          
          // Log to console for offline analysis
          console.log(`[HeroDebug] ${normalizedClass} IDs on ${realmFilter} for ${walletAddress}:`, JSON.stringify(heroIds, null, 2));
          
          // Format IDs for Discord
          lines.push('**IDs**:');
          
          // Build comma-separated ID list
          const idList = heroIds.map(id => `#${id}`).join(', ');
          
          // Check if we'll exceed Discord's 2000 char limit
          const fullMessage = lines.join('\n') + '\n' + idList + '\n\n*(IDs also logged to console as JSON.)*';
          
          if (fullMessage.length > 1900) {
            // Truncate IDs to fit
            const availableSpace = 1900 - lines.join('\n').length - 60; // 60 chars for footer
            const truncatedIds = idList.slice(0, availableSpace) + '...';
            lines.push(truncatedIds);
            lines.push('');
            lines.push('*(+ more IDs truncated to stay under Discord limits)*');
            lines.push('*(Full list logged to console as JSON.)*');
          } else {
            lines.push(idList);
            lines.push('');
            lines.push('*(IDs also logged to console as JSON.)*');
          }
        }
        
        await interaction.editReply(lines.join('\n'));

      } catch (err) {
        console.error('❌ Error in /debug-heroes-by-class:', err);
        await interaction.editReply(`❌ Error fetching hero data: ${err.message}`);
      }
      
      return;
    }

    if (name === 'debug-hero-id') {
      const input = interaction.options.getString('id', true).trim();

      // Normalize ID (allow both raw and normalized forms, strip # if present)
      const numericId = input.replace('#', '');

      let hero;
      try {
        hero = await onchain.getHeroById(numericId);
      } catch (err) {
        console.error('❌ Error in /debug-hero-id:', err);
      }

      if (!hero) {
        await interaction.editReply(`❌ Hero **${numericId}** not found in subgraph.`);
        return;
      }

      // Log full hero object to console for detailed inspection
      console.log('[DebugHeroId] Full hero data:', JSON.stringify(hero, null, 2));

      const lines = [];
      lines.push(`🧾 **Debug hero info for #${numericId}**`);
      lines.push('');

      lines.push(`**ID:** ${hero.id}`);
      lines.push(`**normalizedId:** ${hero.normalizedId || 'N/A'}`);
      lines.push(`**network:** ${hero.network || 'N/A'}`);
      lines.push(`**originRealm:** ${hero.originRealm || 'N/A'}`);
      lines.push(`**mainClass:** ${hero.mainClassStr || 'N/A'}`);
      lines.push('');

      if (hero.owner) {
        lines.push(`**owner.id:** ${hero.owner.id}`);
        lines.push(`**owner.name:** ${hero.owner.name || 'N/A'}`);
      } else {
        lines.push('**owner:** N/A');
      }

      lines.push('');
      lines.push(`**salePrice:** ${hero.salePrice || '0'}`);
      lines.push(`**assistingPrice:** ${hero.assistingPrice || '0'}`);
      lines.push('');
      lines.push('*(Full hero data logged to console as JSON.)*');

      // Build safe reply under 2000 chars
      const output = lines.join('\n').slice(0, 1900);
      await interaction.editReply(output);
      
      return;
    }

    if (name === 'hedge-wallet') {
      const argAddress = interaction.options.getString('address', false);
      let walletAddress = null;
      let shortAddress = null;

      // Resolve wallet address
      if (argAddress) {
        // Validate explicit address
        if (!argAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
          await interaction.editReply('That does not look like a valid 0x wallet address.');
          return;
        }
        walletAddress = argAddress;
      } else {
        // Try to use linked wallet from DB
        try {
          const userId = interaction.user.id;
          const [playerRecord] = await db.select().from(players).where(eq(players.discordUserId, userId)).limit(1);
          
          if (playerRecord && playerRecord.primaryWallet) {
            walletAddress = playerRecord.primaryWallet;
          } else if (playerRecord && playerRecord.wallets && playerRecord.wallets.length > 0) {
            walletAddress = playerRecord.wallets[0];
          }
        } catch (err) {
          console.error('[hedge-wallet] Error looking up linked wallet:', err);
        }

        if (!walletAddress) {
          await interaction.editReply(
            "I don't see a linked wallet for you yet. DM me your wallet address first, or call /hedge-wallet address:<0x...> with an explicit address."
          );
          return;
        }
      }

      shortAddress = `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;

      // Public acknowledgment vs DM delivery
      if (interaction.guildId) {
        await interaction.editReply('📬 Check your DMs — I am sending your Hedge wallet analysis there.');
      } else {
        await interaction.editReply('Working on your wallet analysis...');
      }

      // Gather data
      const lines = [];
      lines.push(`👋 *Hedge cracks open your ledger for* \`${shortAddress}\` …`);
      lines.push('');

      try {
        // Fetch all heroes
        const allHeroes = await onchain.getAllHeroesByOwner(walletAddress);
        
        // Split by realm
        const heroesCV = allHeroes.filter(h => h.network === 'dfk');
        const heroesMet = allHeroes.filter(h => h.network === 'met');
        const countCV = heroesCV.length;
        const countMet = heroesMet.length;
        const totalHeroes = allHeroes.length;

        // Build class distributions
        function buildClassCounts(heroes) {
          const counts = {};
          for (const h of heroes) {
            const cls = h.mainClassStr || 'Unknown';
            counts[cls] = (counts[cls] || 0) + 1;
          }
          return counts;
        }

        const classCountsCV = buildClassCounts(heroesCV);
        const classCountsMet = buildClassCounts(heroesMet);

        // Format top classes per realm
        const topClassesCV = Object.entries(classCountsCV)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([cls, count]) => `${cls}: ${count}`)
          .join(', ');

        const topClassesMet = Object.entries(classCountsMet)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([cls, count]) => `${cls}: ${count}`)
          .join(', ');

        lines.push('**🧙 Hero Profile**');
        lines.push(`• Total heroes: ${totalHeroes}`);
        lines.push(`• Crystalvale: ${countCV} • Sundered Isles: ${countMet}`);
        if (countCV > 0) {
          lines.push(`• CV top classes: ${topClassesCV}`);
        }
        if (countMet > 0) {
          lines.push(`• SIS top classes: ${topClassesMet}`);
        }
        lines.push('');

        // Garden footprint
        const cached = getCachedPoolAnalytics();
        const topPools = [];

        if (cached && cached.data && cached.data.length > 0) {
          const pools = cached.data;
          const harvestablePoolsData = [];

          for (const pool of pools) {
            try {
              const pendingRewardsStr = await analytics.getUserPendingRewards(walletAddress, pool.pid);
              const pendingRewards = parseFloat(pendingRewardsStr);
              
              if (pendingRewards > 0.0001) {
                harvestablePoolsData.push({
                  pairName: pool.pairName,
                  amount: pendingRewards.toFixed(4)
                });
              }
            } catch (err) {
              // Skip pools with errors
              continue;
            }
          }

          // Sort by rewards and take top 5
          harvestablePoolsData.sort((a, b) => parseFloat(b.amount) - parseFloat(a.amount));
          topPools.push(...harvestablePoolsData.slice(0, 5));
        }

        lines.push('**🌿 Garden Footprint (harvestable now)**');
        if (topPools.length === 0) {
          lines.push('• No harvestable rewards detected in tracked CV pools.');
        } else {
          for (const p of topPools) {
            lines.push(`• ${p.pairName}: ${p.amount} CRYSTAL`);
          }
        }
        lines.push('');

        // Simple rule-based insights
        lines.push('**📌 Quick Thoughts**');
        
        if (totalHeroes > 500) {
          lines.push('• You\'re a large roster account; we can do serious optimization.');
        } else if (totalHeroes > 100) {
          lines.push('• Decent-sized roster. Plenty of room for yield optimization.');
        } else if (totalHeroes === 0) {
          lines.push('• No heroes detected. This wallet looks pretty empty to me.');
        }

        if (countCV > 0 && countMet === 0) {
          lines.push('• You are CV-focused; SIS looks untapped.');
        } else if (countMet > 0 && countCV === 0) {
          lines.push('• All-in on Sundered Isles, eh? Risky, but I respect it.');
        } else if (countCV > 0 && countMet > 0) {
          lines.push('• Multi-realm presence detected. Diversification is wise.');
        }

        if (topPools.length === 0 && totalHeroes > 0) {
          lines.push('• No active gardens detected; yields are probably coming from elsewhere.');
        }

        lines.push('');
        lines.push('_This is a high-level view. For raw IDs and exact numbers, /debug-wallet is your friend - I\'m just here to grumble and advise._');

      } catch (err) {
        console.error('[hedge-wallet] Error gathering data:', err);
        lines.push('_Note: data may be incomplete due to an upstream indexer issue._');
      }

      // Send DM
      const dmText = lines.join('\n').slice(0, 1900);
      
      try {
        await interaction.user.send(dmText);
      } catch (dmErr) {
        console.error('[hedge-wallet] Failed to send DM:', dmErr);
        try {
          await interaction.followUp({
            content: '⚠️ I tried to DM you but could not. Please enable DMs from this server and try again.',
            ephemeral: true
          });
        } catch {}
      }

      return;
    }

    if (name === 'debug-hero-index') {
      const address = interaction.options.getString('address', true);
      
      // Validate address
      if (!address.match(/^0x[a-fA-F0-9]{40}$/)) {
        await interaction.editReply('That does not look like a valid 0x wallet address.');
        return;
      }
      
      await interaction.editReply('⏳ Building genetics-aware Hero Index... this may take a moment for large wallets.');
      
      try {
        const index = await onchain.buildHeroIndexForWallet(address);
        
        // Build summary response
        const lines = [];
        lines.push(`🧬 **Genetics-Aware Hero Index**`);
        lines.push(`**Wallet:** \`${address.slice(0, 6)}...${address.slice(-4)}\``);
        lines.push('');
        
        lines.push('**📊 Realm Summary**');
        lines.push(`• Crystalvale (DFK): ${index.totals.dfk} heroes`);
        lines.push(`• Sundered Isles (MET): ${index.totals.met} heroes`);
        lines.push(`• Serendale (KLA): ${index.totals.kla} heroes`);
        lines.push(`• **Total: ${index.totals.all} heroes**`);
        lines.push('');
        
        // Top classes per realm
        if (index.totals.dfk > 0) {
          const topCV = Object.entries(index.realms.dfk.totalsByClass)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([cls, count]) => `${cls}: ${count}`)
            .join(', ');
          lines.push(`**Crystalvale Top Classes:** ${topCV}`);
        }
        
        if (index.totals.met > 0) {
          const topMET = Object.entries(index.realms.met.totalsByClass)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([cls, count]) => `${cls}: ${count}`)
            .join(', ');
          lines.push(`**Sundered Isles Top Classes:** ${topMET}`);
        }
        
        lines.push('');
        lines.push(`✅ **Successfully decoded:** ${index.totals.all - index.missingHeroes.length}/${index.totals.all} heroes`);
        
        if (index.missingHeroes.length > 0) {
          lines.push(`⚠️ **Failed to decode:** ${index.missingHeroes.length} heroes (see console log)`);
        }
        
        lines.push('');
        lines.push('_Full Hero Index with genetics logged to console as JSON._');
        
        // Log full index to console
        console.log('[HeroIndex] Full genetics-aware index:', JSON.stringify(index, null, 2));
        
        await interaction.editReply(lines.join('\n'));
        
      } catch (err) {
        console.error('❌ Error in /debug-hero-index:', err);
        await interaction.editReply(`❌ Error building hero index: ${err.message}`);
      }
      
      return;
    }

    if (name === 'debug-hero-genetics') {
      const heroId = interaction.options.getString('id', true);
      
      await interaction.editReply(`🧬 Fetching raw genetics data for hero ${heroId}...`);
      
      try {
        // Fetch hero with extended query to discover all gene fields
        const { request, gql } = await import('graphql-request');
        const dfkClient = new (await import('graphql-request')).GraphQLClient(
          'https://api.defikingdoms.com/graphql'
        );
        
        // Query using only valid gene fields (statGenes, visualGenes)
        const extendedQuery = gql`
          query GetHeroExtendedGenetics($heroId: ID!) {
            hero(id: $heroId) {
              id
              normalizedId
              network
              originRealm
              mainClassStr
              subClassStr
              professionStr
              rarity
              level
              generation
              
              # Basic stats
              strength
              intelligence
              wisdom
              luck
              agility
              vitality
              endurance
              dexterity
              hp
              mp
              stamina
              
              # Profession skills
              mining
              gardening
              foraging
              fishing
              
              # Valid gene fields (confirmed by API)
              statGenes
              visualGenes
            }
          }
        `;
        
        const rawData = await dfkClient.request(extendedQuery, { heroId: heroId.toString() });
        const hero = rawData.hero;
        
        if (!hero) {
          await interaction.editReply(`❌ Hero ${heroId} not found.`);
          return;
        }
        
        // Decode genetics using hero-genetics module
        const { decodeHeroGenes } = await import('./hero-genetics.js');
        const decoded = decodeHeroGenes(hero);
        
        // Format output
        const lines = [];
        lines.push(`**🧬 Full Genetics for Hero ${hero.id}**`);
        lines.push(`**Normalized ID:** ${hero.normalizedId || 'N/A'}`);
        lines.push(`**Realm:** ${hero.network || hero.originRealm}`);
        lines.push(`**Rarity:** ${['Common', 'Uncommon', 'Rare', 'Legendary', 'Mythic'][hero.rarity] || hero.rarity} | **Gen:** ${hero.generation} | **Level:** ${hero.level}`);
        lines.push('');
        
        // Show key traits with full recessive breakdown
        lines.push('**🎭 Class Genetics:**');
        lines.push(`**Main:** D: ${decoded.mainClass.dominant} | R1: ${decoded.mainClass.R1} | R2: ${decoded.mainClass.R2} | R3: ${decoded.mainClass.R3}`);
        lines.push(`**Sub:** D: ${decoded.subClass.dominant} | R1: ${decoded.subClass.R1} | R2: ${decoded.subClass.R2} | R3: ${decoded.subClass.R3}`);
        lines.push('');
        
        lines.push('**🌿 Profession Genetics:**');
        lines.push(`D: ${decoded.profession.dominant} | R1: ${decoded.profession.R1} | R2: ${decoded.profession.R2} | R3: ${decoded.profession.R3}`);
        const hasGardening = decoded.profession.dominant === 'Gardening' || 
                            decoded.profession.R1 === 'Gardening' || 
                            decoded.profession.R2 === 'Gardening' || 
                            decoded.profession.R3 === 'Gardening';
        if (hasGardening) {
          lines.push('✅ **Has Gardening Gene** - Eligible for 40% stamina reduction bonus');
        }
        lines.push('');
        
        lines.push('**⚡ Abilities:**');
        lines.push(`**Passive1:** D: ${decoded.passive1.dominant} | R1: ${decoded.passive1.R1} | R2: ${decoded.passive1.R2} | R3: ${decoded.passive1.R3}`);
        lines.push(`**Passive2:** D: ${decoded.passive2.dominant} | R1: ${decoded.passive2.R1} | R2: ${decoded.passive2.R2} | R3: ${decoded.passive2.R3}`);
        lines.push(`**Active1:** D: ${decoded.active1.dominant} | R1: ${decoded.active1.R1} | R2: ${decoded.active1.R2} | R3: ${decoded.active1.R3}`);
        lines.push(`**Active2:** D: ${decoded.active2.dominant} | R1: ${decoded.active2.R1} | R2: ${decoded.active2.R2} | R3: ${decoded.active2.R3}`);
        lines.push('');
        
        lines.push('**📈 Stat Boosts:**');
        lines.push(`**Boost1:** D: ${decoded.statBoost1.dominant} | R1: ${decoded.statBoost1.R1} | R2: ${decoded.statBoost1.R2} | R3: ${decoded.statBoost1.R3}`);
        lines.push(`**Boost2:** D: ${decoded.statBoost2.dominant} | R1: ${decoded.statBoost2.R1} | R2: ${decoded.statBoost2.R2} | R3: ${decoded.statBoost2.R3}`);
        lines.push('');
        
        lines.push('**🔥 Element:**');
        lines.push(`D: ${decoded.element.dominant} | R1: ${decoded.element.R1} | R2: ${decoded.element.R2} | R3: ${decoded.element.R3}`);
        lines.push('');
        
        lines.push('**👤 Visual Genetics:**');
        lines.push(`**Gender:** D: ${decoded.visual.gender.dominant} | R1: ${decoded.visual.gender.R1} | R2: ${decoded.visual.gender.R2} | R3: ${decoded.visual.gender.R3}`);
        lines.push(`**Background:** D: ${decoded.visual.background.dominant} | R1: ${decoded.visual.background.R1} | R2: ${decoded.visual.background.R2} | R3: ${decoded.visual.background.R3}`);
        lines.push(`**Hair Style:** D: ${decoded.visual.hairStyle.dominant} | R1: ${decoded.visual.hairStyle.R1} | R2: ${decoded.visual.hairStyle.R2} | R3: ${decoded.visual.hairStyle.R3}`);
        lines.push(`**Hair Color:** D: ${decoded.visual.hairColor.dominant} | R1: ${decoded.visual.hairColor.R1} | R2: ${decoded.visual.hairColor.R2} | R3: ${decoded.visual.hairColor.R3}`);
        lines.push(`**Eye Color:** D: ${decoded.visual.eyeColor.dominant} | R1: ${decoded.visual.eyeColor.R1} | R2: ${decoded.visual.eyeColor.R2} | R3: ${decoded.visual.eyeColor.R3}`);
        lines.push(`**Skin Color:** D: ${decoded.visual.skinColor.dominant} | R1: ${decoded.visual.skinColor.R1} | R2: ${decoded.visual.skinColor.R2} | R3: ${decoded.visual.skinColor.R3}`);
        lines.push(`**Head Appendage:** D: ${decoded.visual.headAppendage.dominant} | R1: ${decoded.visual.headAppendage.R1} | R2: ${decoded.visual.headAppendage.R2} | R3: ${decoded.visual.headAppendage.R3}`);
        lines.push(`**Back Appendage:** D: ${decoded.visual.backAppendage.dominant} | R1: ${decoded.visual.backAppendage.R1} | R2: ${decoded.visual.backAppendage.R2} | R3: ${decoded.visual.backAppendage.R3}`);
        
        const output = lines.join('\n');
        
        // Log full decoded genetics to console
        console.log('[debug-hero-genetics] Full decoded genetics:', JSON.stringify(decoded, null, 2));
        
        // Discord message limit is 2000 chars
        if (output.length > 1900) {
          await interaction.editReply(output.slice(0, 1900) + '\n...\n_See console for full genetics_');
        } else {
          await interaction.editReply(output);
        }
        
      } catch (err) {
        console.error('❌ Error in /debug-hero-genetics:', err);
        await interaction.editReply(`❌ Error fetching genetics: ${err.message}`);
      }
      
      return;
    }

    if (name === 'summoning-calc' || name === 'summon') {
      // Handle both debug command and main command
      const hero1Id = name === 'summon' 
        ? interaction.options.getInteger('parent1', true).toString()
        : interaction.options.getString('hero1', true);
      const hero2Id = name === 'summon'
        ? interaction.options.getInteger('parent2', true).toString()
        : interaction.options.getString('hero2', true);
      
      await interaction.editReply(`⚗️ Calculating summoning probabilities for heroes ${hero1Id} and ${hero2Id}...`);
      
      try {
        // Fetch both heroes from blockchain
        const { request, gql } = await import('graphql-request');
        const dfkClient = new (await import('graphql-request')).GraphQLClient(
          'https://api.defikingdoms.com/graphql'
        );
        
        const heroQuery = gql`
          query GetHero($heroId: ID!) {
            hero(id: $heroId) {
              id
              normalizedId
              mainClassStr
              subClassStr
              professionStr
              rarity
              generation
              statGenes
              visualGenes
            }
          }
        `;
        
        const [hero1Data, hero2Data] = await Promise.all([
          dfkClient.request(heroQuery, { heroId: hero1Id.toString() }),
          dfkClient.request(heroQuery, { heroId: hero2Id.toString() })
        ]);
        
        const hero1 = hero1Data.hero;
        const hero2 = hero2Data.hero;
        
        if (!hero1 || !hero2) {
          await interaction.editReply(`❌ Could not find one or both heroes.`);
          return;
        }
        
        // Decode genetics for both heroes
        const { decodeHeroGenes } = await import('./hero-genetics.js');
        const hero1Genetics = decodeHeroGenes(hero1);
        const hero2Genetics = decodeHeroGenes(hero2);
        
        // Get rarity names
        const rarityNames = ['Common', 'Uncommon', 'Rare', 'Legendary', 'Mythic'];
        const hero1Rarity = rarityNames[hero1.rarity] || 'Common';
        const hero2Rarity = rarityNames[hero2.rarity] || 'Common';
        
        // Calculate summoning probabilities
        const probabilities = calculateSummoningProbabilities(
          hero1Genetics,
          hero2Genetics,
          hero1Rarity,
          hero2Rarity
        );
        
        // Create parent info objects for embeds
        const parent1Info = {
          heroId: hero1.normalizedId || hero1.id,
          class: hero1.mainClassStr,
          rarity: hero1Rarity
        };
        
        const parent2Info = {
          heroId: hero2.normalizedId || hero2.id,
          class: hero2.mainClassStr,
          rarity: hero2Rarity
        };
        
        // Create summary embed
        const summaryEmbed = createSummarySummoningEmbed(probabilities, parent1Info, parent2Info);
        
        // Send summary embed
        await interaction.editReply({ content: '', embeds: [summaryEmbed] });
        
        // Send detailed embeds as follow-up
        const statEmbed = createStatGenesEmbed(probabilities);
        const visualEmbed = await createVisualGenesEmbed(probabilities);
        
        await interaction.followUp({ embeds: [statEmbed] });
        await interaction.followUp({ embeds: [visualEmbed] });
        
      } catch (err) {
        console.error(`❌ Error in /${name}:`, err);
        await interaction.editReply(`❌ Error calculating summoning probabilities: ${err.message}`);
      }
      
      return;
    }

    if (name === 'find-bargain') {
      const targetClass = interaction.options.getString('target_class', true);
      const minProbability = interaction.options.getNumber('min_probability') || 5.0;
      const maxPrice = interaction.options.getNumber('max_price') || null;
      const results = interaction.options.getInteger('results') || 5;
      
      await interaction.editReply(`🔍 Scanning tavern for bargain ${targetClass} pairs...`);
      
      try {
        const { findBargainPairs } = await import('./bargain-finder.js');
        
        const pairs = await findBargainPairs({
          targetClass,
          minProbability,
          maxTotalPrice: maxPrice,
          limit: results
        });
        
        if (pairs.length === 0) {
          await interaction.editReply(
            `❌ No pairs found on the tavern that meet your criteria:\n` +
            `• Target: ${targetClass}\n` +
            `• Min Probability: ${minProbability}%\n` +
            `• Max Price: ${maxPrice ? maxPrice + ' JEWEL' : 'unlimited'}\n\n` +
            `Try lowering the minimum probability or increasing the max price.`
          );
          return;
        }
        
        // Create embeds for each pair
        const embeds = [];
        
        for (let i = 0; i < Math.min(pairs.length, 3); i++) {
          const pair = pairs[i];
          
          const rarityColors = {
            Common: 0x9CA3AF,     // Gray
            Uncommon: 0x10B981,   // Green
            Rare: 0x3B82F6,       // Blue
            Legendary: 0x8B5CF6,  // Purple
            Mythic: 0xF59E0B      // Orange
          };
          
          const color = rarityColors[pair.parent1.rarity] || 0x9CA3AF;
          
          const embed = {
            color,
            title: `${i === 0 ? '🏆 ' : ''}Bargain Pair #${i + 1}`,
            description: `**${pair.targetClassProbability.toFixed(2)}%** chance to summon **${targetClass}**`,
            fields: [
              {
                name: '💰 Total Cost',
                value: `**${pair.totalPrice.toFixed(2)} JEWEL**`,
                inline: true
              },
              {
                name: '📊 Value Rating',
                value: `${pair.targetClassProbability > 20 ? 'Excellent' : pair.targetClassProbability > 10 ? 'Good' : 'Fair'}`,
                inline: true
              },
              {
                name: '\u200B',
                value: '\u200B',
                inline: true
              },
              {
                name: '🦸 Parent 1',
                value: 
                  `Hero #${pair.parent1.normalizedId}\n` +
                  `${pair.parent1.mainClass} (${pair.parent1.rarity})\n` +
                  `Gen ${pair.parent1.generation} • ${pair.parent1.summons}/${pair.parent1.maxSummons} summons\n` +
                  `**${pair.parent1.price.toFixed(2)} JEWEL**`,
                inline: true
              },
              {
                name: '🦸 Parent 2',
                value: 
                  `Hero #${pair.parent2.normalizedId}\n` +
                  `${pair.parent2.mainClass} (${pair.parent2.rarity})\n` +
                  `Gen ${pair.parent2.generation} • ${pair.parent2.summons}/${pair.parent2.maxSummons} summons\n` +
                  `**${pair.parent2.price.toFixed(2)} JEWEL**`,
                inline: true
              },
              {
                name: '\u200B',
                value: '\u200B',
                inline: true
              }
            ],
            footer: {
              text: `Top ${Math.min(results, pairs.length)} results • Probabilities from live blockchain genetics`
            }
          };
          
          // Add top 3 class probabilities
          const topClasses = Object.entries(pair.allClassProbabilities)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3)
            .map(([cls, prob]) => `${cls}: ${prob.toFixed(1)}%`)
            .join(' • ');
          
          if (topClasses) {
            embed.fields.push({
              name: '🎲 Other Class Probabilities',
              value: topClasses,
              inline: false
            });
          }
          
          // Add top professions
          const profStr = pair.topProfessions
            .map(([prof, prob]) => `${prof}: ${prob.toFixed(1)}%`)
            .join(' • ');
          
          if (profStr) {
            embed.fields.push({
              name: '🛠️ Top Professions',
              value: profStr,
              inline: false
            });
          }
          
          embeds.push(embed);
        }
        
        await interaction.editReply({ content: '', embeds });
        
        // If more than 3 results, send the rest as a summary
        if (pairs.length > 3) {
          const summary = pairs.slice(3).map((pair, idx) => 
            `**${idx + 4}.** Heroes #${pair.parent1.normalizedId} + #${pair.parent2.normalizedId} • ` +
            `${pair.targetClassProbability.toFixed(1)}% ${targetClass} • ` +
            `${pair.totalPrice.toFixed(2)} JEWEL`
          ).join('\n');
          
          await interaction.followUp({
            content: `**More Results:**\n${summary}`
          });
        }
        
      } catch (err) {
        console.error('❌ Error in /find-bargain:', err);
        await interaction.editReply(`❌ Error finding bargain pairs: ${err.message}`);
      }
      
      return;
    }

    // ============================================================================
    // PROFILE COMMANDS (Player User Model System)
    // ============================================================================
    
    if (name === 'hedge-profile') {
      try {
        const targetUser = interaction.options.getUser('user') || interaction.user;
        const isAdmin = interaction.member?.permissions?.has('Administrator') || 
                        interaction.user.id === process.env.BOT_OWNER_ID;
        
        // Non-admins can only view their own profile
        if (targetUser.id !== interaction.user.id && !isAdmin) {
          await interaction.editReply('You can only view your own profile.');
          return;
        }
        
        const profile = await getOrCreateProfileByDiscordId(targetUser.id, targetUser.username);
        
        const tierNames = {
          0: 'Guest',
          1: 'Bronze',
          2: 'Silver', 
          3: 'Gold',
          4: 'Council of Hedge'
        };
        
        const tierColors = {
          0: 0x808080,
          1: 0xCD7F32,
          2: 0xC0C0C0,
          3: 0xFFD700,
          4: 0x9932CC
        };
        
        const kpis = profile.kpis || {};
        const flags = profile.flags || {};
        const snapshot = profile.dfkSnapshot;
        
        const embed = {
          color: tierColors[profile.tier] || 0x5865F2,
          title: `Player Profile: ${targetUser.username}`,
          thumbnail: { url: targetUser.displayAvatarURL({ dynamic: true }) },
          fields: [
            { name: 'Archetype', value: profile.archetype || 'GUEST', inline: true },
            { name: 'Tier', value: `${profile.tier ?? 0} - ${tierNames[profile.tier] || 'Guest'}`, inline: true },
            { name: 'State', value: profile.state || 'CURIOUS', inline: true },
            { name: 'Behavior Tags', value: (profile.behaviorTags || []).join(', ') || 'None', inline: false },
            { name: 'Engagement Score', value: String(kpis.engagementScore || 0), inline: true },
            { name: 'Financial Score', value: String(kpis.financialScore || 0), inline: true },
            { name: 'Retention Score', value: String(kpis.retentionScore || 0), inline: true }
          ],
          timestamp: new Date().toISOString()
        };
        
        // Add flags if any
        const activeFlags = [];
        if (flags.isWhale) activeFlags.push('Whale');
        if (flags.isExtractor) activeFlags.push('Extractor');
        if (flags.isHighPotential) activeFlags.push('High Potential');
        if (activeFlags.length > 0) {
          embed.fields.push({ name: 'Flags', value: activeFlags.join(', '), inline: false });
        }
        
        // Add wallet if exists
        if (profile.walletAddress) {
          embed.fields.push({
            name: 'Primary Wallet',
            value: `\`${profile.walletAddress.slice(0, 6)}...${profile.walletAddress.slice(-4)}\``,
            inline: true
          });
        }
        
        // Add DFK snapshot if available
        if (snapshot) {
          embed.fields.push(
            { name: 'Heroes', value: String(snapshot.heroCount || 0), inline: true },
            { name: 'LP Positions', value: String(snapshot.lpPositionsCount || 0), inline: true }
          );
        }
        
        await interaction.editReply({ embeds: [embed] });
        
      } catch (err) {
        console.error('❌ Error in /hedge-profile:', err);
        await interaction.editReply('Failed to load profile. Please try again.');
      }
      return;
    }
    
    if (name === 'hedge-reclassify') {
      try {
        const isAdmin = interaction.member?.permissions?.has('Administrator') || 
                        interaction.user.id === process.env.BOT_OWNER_ID;
        
        if (!isAdmin) {
          await interaction.editReply('This command requires admin permissions.');
          return;
        }
        
        const targetUser = interaction.options.getUser('user', true);
        
        const beforeProfile = await getOrCreateProfileByDiscordId(targetUser.id, targetUser.username);
        const afterProfile = await forceReclassify(targetUser.id);
        
        const changes = [];
        if (beforeProfile.archetype !== afterProfile.archetype) {
          changes.push(`Archetype: ${beforeProfile.archetype} → ${afterProfile.archetype}`);
        }
        if (beforeProfile.tier !== afterProfile.tier) {
          changes.push(`Tier: ${beforeProfile.tier} → ${afterProfile.tier}`);
        }
        if (beforeProfile.state !== afterProfile.state) {
          changes.push(`State: ${beforeProfile.state} → ${afterProfile.state}`);
        }
        
        const embed = {
          color: 0x00FF00,
          title: `Reclassified: ${targetUser.username}`,
          description: changes.length > 0 ? changes.join('\n') : 'No changes detected',
          fields: [
            { name: 'Current Archetype', value: afterProfile.archetype, inline: true },
            { name: 'Current Tier', value: String(afterProfile.tier), inline: true },
            { name: 'Current State', value: afterProfile.state, inline: true }
          ],
          timestamp: new Date().toISOString()
        };
        
        await interaction.editReply({ embeds: [embed] });
        
      } catch (err) {
        console.error('❌ Error in /hedge-reclassify:', err);
        await interaction.editReply('Failed to reclassify. Please try again.');
      }
      return;
    }
    
    if (name === 'hedge-set-tier') {
      try {
        const isAdmin = interaction.member?.permissions?.has('Administrator') || 
                        interaction.user.id === process.env.BOT_OWNER_ID;
        
        if (!isAdmin) {
          await interaction.editReply('This command requires admin permissions.');
          return;
        }
        
        const targetUser = interaction.options.getUser('user', true);
        const newTier = interaction.options.getInteger('tier', true);
        
        const updatedProfile = await setTierOverride(targetUser.id, newTier);
        
        const tierNames = {
          0: 'Guest', 1: 'Bronze', 2: 'Silver', 3: 'Gold', 4: 'Council of Hedge'
        };
        
        const tierColors = {
          0: 0x808080, 1: 0xCD7F32, 2: 0xC0C0C0, 3: 0xFFD700, 4: 0x9932CC
        };
        
        const embed = {
          color: tierColors[newTier] || 0x5865F2,
          title: `Tier Updated: ${targetUser.username}`,
          fields: [
            { name: 'New Tier', value: `${newTier} - ${tierNames[newTier]}`, inline: true },
            { name: 'Override Active', value: 'Yes (manual)', inline: true }
          ],
          footer: { text: 'This tier override persists until manually changed' },
          timestamp: new Date().toISOString()
        };
        
        await interaction.editReply({ embeds: [embed] });
        
      } catch (err) {
        console.error('❌ Error in /hedge-set-tier:', err);
        await interaction.editReply('Failed to update tier. Please try again.');
      }
      return;
    }
    
    if (name === 'hedge-profiles-list') {
      try {
        const isAdmin = interaction.member?.permissions?.has('Administrator') || 
                        interaction.user.id === process.env.BOT_OWNER_ID;
        
        if (!isAdmin) {
          await interaction.editReply('This command requires admin permissions.');
          return;
        }
        
        const filter = {
          archetype: interaction.options.getString('archetype'),
          tier: interaction.options.getInteger('tier'),
          isWhale: interaction.options.getBoolean('whales'),
          limit: interaction.options.getInteger('limit') || 10
        };
        
        // Remove null/undefined values
        Object.keys(filter).forEach(key => {
          if (filter[key] === null || filter[key] === undefined) {
            delete filter[key];
          }
        });
        
        const profiles = await listProfiles(filter);
        
        if (profiles.length === 0) {
          await interaction.editReply('No profiles found matching your criteria.');
          return;
        }
        
        const embed = {
          color: 0x5865F2,
          title: 'Player Profiles',
          description: `Showing ${profiles.length} profiles`,
          fields: [],
          timestamp: new Date().toISOString()
        };
        
        // Add up to 10 profiles as fields
        for (const profile of profiles.slice(0, 10)) {
          const flags = [];
          if (profile.flags?.isWhale) flags.push('Whale');
          if (profile.flags?.isExtractor) flags.push('Extractor');
          if (profile.flags?.isHighPotential) flags.push('High Potential');
          
          embed.fields.push({
            name: profile.discordUsername || `ID: ${profile.discordId}`,
            value: [
              `**Archetype:** ${profile.archetype}`,
              `**Tier:** ${profile.tier}`,
              `**State:** ${profile.state}`,
              `**Tags:** ${(profile.behaviorTags || []).slice(0, 3).join(', ') || 'None'}`,
              flags.length > 0 ? `**Flags:** ${flags.join(', ')}` : ''
            ].filter(Boolean).join('\n'),
            inline: true
          });
        }
        
        await interaction.editReply({ embeds: [embed] });
        
      } catch (err) {
        console.error('❌ Error in /hedge-profiles-list:', err);
        await interaction.editReply('Failed to list profiles. Please try again.');
      }
      return;
    }

    if (name === 'debug-jewel-payments') {
      try {
        const isAdmin = interaction.member?.permissions?.has('Administrator') || 
                        interaction.user.id === process.env.BOT_OWNER_ID;
        
        if (!isAdmin) {
          await interaction.editReply('This command requires admin permissions.');
          return;
        }

        const limit = interaction.options.getInteger('limit') || 20;

        // Query all deposit requests, ordered by most recent
        const allPayments = await db.select().from(depositRequests)
          .orderBy(desc(depositRequests.createdAt))
          .limit(limit);

        const lines = [];
        lines.push(`💰 **JEWEL Payments to Hedge** (Last ${limit})\n`);

        if (allPayments.length === 0) {
          lines.push('No payments recorded yet.');
          await interaction.editReply(lines.join('\n'));
          return;
        }

        // Calculate summary stats
        const verified = allPayments.filter(p => p.status === 'payment_verified' || p.status === 'completed').length;
        const pending = allPayments.filter(p => p.status === 'awaiting_payment').length;
        const failed = allPayments.filter(p => p.status === 'failed').length;

        // Calculate total received
        let totalReceived = 0n;
        for (const payment of allPayments) {
          if (payment.status === 'payment_verified' || payment.status === 'completed') {
            totalReceived += BigInt(payment.expectedAmountJewel || 0);
          }
        }

        lines.push(`**Summary**: ${verified} verified, ${pending} pending, ${failed} failed`);
        lines.push(`**Total Received**: ${(Number(totalReceived) / 1e18).toFixed(2)} JEWEL\n`);

        lines.push('**Recent Payments**:');
        for (let i = 0; i < allPayments.length; i++) {
          const p = allPayments[i];
          const status = p.status === 'payment_verified' || p.status === 'completed' ? '✅' : 
                        p.status === 'awaiting_payment' ? '⏳' : '❌';
          const amount = (Number(p.expectedAmountJewel || 0) / 1e18).toFixed(2);
          const wallet = `${p.wallet.slice(0, 6)}...${p.wallet.slice(-4)}`;
          const date = new Date(p.createdAt).toLocaleDateString();
          lines.push(`${i + 1}. ${status} ${amount} JEWEL from ${wallet} (${date})`);
        }

        await interaction.editReply(lines.join('\n'));

      } catch (err) {
        console.error('❌ Error in /debug-jewel-payments:', err);
        await interaction.editReply(`Failed to fetch payments: ${err.message}`);
      }
      return;
    }

    if (name === 'debug-wallet-payments') {
      try {
        const isAdmin = interaction.member?.permissions?.has('Administrator') || 
                        interaction.user.id === process.env.BOT_OWNER_ID;
        
        if (!isAdmin) {
          await interaction.editReply('This command requires admin permissions.');
          return;
        }

        const walletAddress = interaction.options.getString('wallet', true);
        const limit = interaction.options.getInteger('limit') || 20;

        if (!walletAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
          await interaction.editReply('❌ Invalid wallet address. Must be a 40-character hex string starting with 0x.');
          return;
        }

        const normalizedWallet = walletAddress.toLowerCase();

        // Query payments from this wallet, ordered by most recent
        const walletPayments = await db.select().from(depositRequests)
          .where(eq(depositRequests.wallet, normalizedWallet))
          .orderBy(desc(depositRequests.createdAt))
          .limit(limit);

        const lines = [];
        lines.push(`💰 **JEWEL Payments from ${normalizedWallet.slice(0, 6)}...${normalizedWallet.slice(-4)}**\n`);

        if (walletPayments.length === 0) {
          lines.push('No payments found from this wallet.');
          await interaction.editReply(lines.join('\n'));
          return;
        }

        // Calculate summary stats for this wallet
        const verified = walletPayments.filter(p => p.status === 'payment_verified' || p.status === 'completed').length;
        const pending = walletPayments.filter(p => p.status === 'awaiting_payment').length;
        const failed = walletPayments.filter(p => p.status === 'failed').length;

        // Calculate total received from this wallet
        let totalReceived = 0n;
        for (const payment of walletPayments) {
          if (payment.status === 'payment_verified' || payment.status === 'completed') {
            totalReceived += BigInt(payment.expectedAmountJewel || 0);
          }
        }

        lines.push(`**Summary**: ${verified} verified, ${pending} pending, ${failed} failed`);
        lines.push(`**Total from this Wallet**: ${(Number(totalReceived) / 1e18).toFixed(2)} JEWEL\n`);

        lines.push('**Payment History**:');
        for (let i = 0; i < walletPayments.length; i++) {
          const p = walletPayments[i];
          const status = p.status === 'payment_verified' || p.status === 'completed' ? '✅' : 
                        p.status === 'awaiting_payment' ? '⏳' : '❌';
          const amount = (Number(p.expectedAmountJewel || 0) / 1e18).toFixed(2);
          const date = new Date(p.createdAt).toLocaleDateString();
          const txHash = p.txHash ? `\`${p.txHash.slice(0, 8)}...\`` : 'Pending';
          lines.push(`${i + 1}. ${status} ${amount} JEWEL on ${date} - TX: ${txHash}`);
        }

        await interaction.editReply(lines.join('\n'));

      } catch (err) {
        console.error('❌ Error in /debug-wallet-payments:', err);
        await interaction.editReply(`Failed to fetch payments: ${err.message}`);
      }
      return;
    }

    if (name === 'debug-transactions') {
      try {
        const isAdmin = interaction.member?.permissions?.has('Administrator') || 
                        interaction.user.id === process.env.BOT_OWNER_ID;
        
        if (!isAdmin) {
          await interaction.editReply('This command requires admin permissions.');
          return;
        }

        const lines = [];
        lines.push(`📊 **JEWEL Token Transfers to Hedge (Last 20 Transactions)**\n`);

        try {
          const HEDGE_ADDR = HEDGE_WALLET.toLowerCase();
          
          // Fetch from both DFK Chain (53935) and Metis Andromeda (1088)
          const chains = [
            { id: 53935, name: 'DFK Chain' },
            { id: 1088, name: 'Metis Andromeda' }
          ];
          
          let allTransfers = [];
          
          for (const chain of chains) {
            try {
              // Query transactions endpoint (JEWEL is native token on DFK Chain)
              const url = `https://api.routescan.io/v2/network/mainnet/evm/${chain.id}/address/${HEDGE_ADDR}/transactions`;
              const response = await fetch(url);
              
              if (response.ok) {
                const data = await response.json();
                
                if (data.items && data.items.length > 0) {
                  // Filter for incoming transfers (to = Hedge wallet, value > 0)
                  const incoming = data.items.filter(tx => 
                    tx.to?.toLowerCase() === HEDGE_ADDR && 
                    tx.value && 
                    BigInt(tx.value) > 0n
                  ).map(tx => ({
                    ...tx,
                    chain: chain.name,
                    amount: (Number(BigInt(tx.value)) / 1e18).toFixed(4)
                  }));
                  
                  allTransfers.push(...incoming);
                }
              }
            } catch (err) {
              console.error(`Error fetching ${chain.name}:`, err.message);
            }
          }
          
          if (allTransfers.length === 0) {
            lines.push('No incoming JEWEL transfers found.');
            await interaction.editReply(lines.join('\n'));
            return;
          }

          // Sort by timestamp (most recent first) and get last 20
          allTransfers.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
          const recent = allTransfers.slice(0, 20);
          
          lines.push(`**Found ${allTransfers.length} total incoming transfers, showing last 20:**\n`);
          lines.push('**Transactions**:');
          
          for (let i = 0; i < recent.length; i++) {
            const tx = recent[i];
            const fromWallet = tx.from.slice(0, 6) + '...' + tx.from.slice(-4);
            const txHash = tx.id.slice(0, 8) + '...' + tx.id.slice(-4);
            const date = new Date(tx.timestamp).toLocaleDateString();
            const chainLabel = tx.chain === 'DFK Chain' ? '🏰' : '🌍';
            
            lines.push(`${i + 1}. **${tx.amount} JEWEL** from \`${fromWallet}\` on ${date} - ${chainLabel} ${tx.chain} - TX: \`${txHash}\``);
          }
          
          await interaction.editReply(lines.join('\n'));

        } catch (err) {
          console.error('❌ Error in /debug-transactions:', err);
          await interaction.editReply(`Failed to fetch transactions: ${err.message}`);
        }

      } catch (err) {
        console.error('❌ Error in /debug-transactions:', err);
        await interaction.editReply(`Failed to fetch transactions: ${err.message}`);
      }
      return;
    }

    // Other slash commands (help, npc, hero, garden, etc.) were not included
    // in this truncated version of the file. Add them back here later as needed.

    } // end of if (interaction.isChatInputCommand())
  } catch (err) {
    console.error('Handler error:', err);
    try {
      await interaction.editReply('Something went sideways fetching the numbers. Try again in a moment.');
    } catch {
      // ignore secondary errors
    }
  }
});

// === Initialize Economic System (BEFORE Discord client logs in) ===
console.log('💰 Initializing pricing config...');
await initializePricingConfig();

console.log('📡 Starting payment monitor (V2: Per-job fast scanner)...');
await initializeExistingJobs();
await startMonitoring();
paymentMonitorStarted = true;
console.log('✅ Economic system initialized');

// === Create Express App and HTTP Server ===
const app = express();
app.use(express.json());

// Session management middleware
app.use((req, res, next) => {
  const cookies = (req.headers.cookie || '')
    .split(';')
    .reduce((acc, cookie) => {
      const [key, value] = cookie.trim().split('=');
      if (key && value) acc[key] = decodeURIComponent(value);
      return acc;
    }, {});
  
  req.cookies = cookies;
  
  // Set cookie helper
  res.setCookie = (name, value, options = {}) => {
    const cookieStr = `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax${
      options.maxAge ? `; Max-Age=${options.maxAge}` : ''
    }${options.secure ? '; Secure' : ''}`;
    
    const existing = res.getHeader('Set-Cookie') || [];
    const setCookieArray = Array.isArray(existing) ? existing : [existing].filter(Boolean);
    res.setHeader('Set-Cookie', [...setCookieArray, cookieStr]);
  };
  
  next();
});

// Admin list
const ADMIN_USER_IDS = ['426019696916168714']; // yepex

// Admin middleware - database-backed sessions
async function isAdmin(req, res, next) {
  try {
    const sessionToken = req.cookies.session_token;
    console.log(`[AdminAuth] Checking session. Cookie: ${sessionToken ? sessionToken.substring(0, 16) + '...' : 'NONE'}`);
    
    if (!sessionToken) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    
    // Fetch session from database
    const sessions = await db.select().from(adminSessions).where(eq(adminSessions.sessionToken, sessionToken));
    console.log(`[AdminAuth] Found ${sessions.length} session(s) in DB`);
    
    if (!sessions || sessions.length === 0) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    
    const session = sessions[0];
    console.log(`[AdminAuth] Session found: discordId=${session.discordId}, expires=${session.expiresAt}`);
    
    // Check expiration
    if (new Date(session.expiresAt) < new Date()) {
      await db.delete(adminSessions).where(eq(adminSessions.sessionToken, sessionToken));
      return res.status(401).json({ error: 'Session expired' });
    }
    
    console.log(`🔍 Admin check - userId: ${session.discordId}, admins: [${ADMIN_USER_IDS.join(', ')}], match: ${ADMIN_USER_IDS.includes(session.discordId)}`);
    if (!ADMIN_USER_IDS.includes(session.discordId)) {
      return res.status(403).json({ error: 'Access denied: Administrator only' });
    }
    
    req.user = { userId: session.discordId, username: session.username, avatar: session.avatar };
    next();
  } catch (err) {
    console.error('❌ Admin middleware error:', err);
    res.status(500).json({ error: 'Authentication check failed' });
  }
}

// Debug endpoint - no auth required
app.get('/api/admin/debug-status', async (req, res) => {
  try {
    const sessionToken = req.cookies.session_token;
    console.log(`[Debug] Session token from cookie: ${sessionToken ? sessionToken.substring(0, 16) + '...' : 'NONE'}`);
    
    const debug = {
      timestamp: new Date().toISOString(),
      hasCookie: !!sessionToken,
      cookiePreview: sessionToken ? sessionToken.substring(0, 32) + '...' : null,
      adminIds: ADMIN_USER_IDS,
      dbConnected: true
    };
    
    if (sessionToken) {
      const sessions = await db.select().from(adminSessions).where(eq(adminSessions.sessionToken, sessionToken));
      debug.sessionInDb = sessions.length > 0;
      
      if (sessions.length > 0) {
        const sess = sessions[0];
        debug.discordId = sess.discordId;
        debug.username = sess.username;
        debug.isAdmin = ADMIN_USER_IDS.includes(sess.discordId);
        debug.expiresAt = sess.expiresAt;
        debug.isExpired = new Date(sess.expiresAt) < new Date();
      }
    }
    
    res.json(debug);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
})

// GET /api/admin/hedge-wallet - Get Hedge's wallet balance (admin only)
app.get('/api/admin/hedge-wallet', isAdmin, async (req, res) => {
  try {
    const balances = await fetchWalletBalances(HEDGE_WALLET);
    res.json({
      success: true,
      wallet: HEDGE_WALLET,
      balances: {
        jewel: balances.jewel,
        crystal: balances.crystal,
        cjewel: balances.cjewel
      }
    });
  } catch (err) {
    console.error('[API] Error fetching hedge wallet balance:', err);
    res.status(500).json({ error: 'Failed to fetch wallet balance' });
  }
});

// GET /api/admin/users - List all users with profiles
app.get('/api/admin/users', isAdmin, async (req, res) => {
  try {
    const playerRows = await db.select().from(players);
    console.log(`[API] /api/admin/users fetched ${playerRows.length} players`);
    if (playerRows.length > 0) {
      console.log(`[API] First player raw:`, JSON.stringify(playerRows[0], null, 2));
    }
    
    const usersWithProfiles = await Promise.all(
      playerRows.map(async (player) => {
        try {
          // Parse profile data from the JSON column
          let profileData = null;
          try {
            if (player.profileData) {
              profileData = typeof player.profileData === 'string' 
                ? JSON.parse(player.profileData)
                : player.profileData;
            }
          } catch (e) {
            console.warn(`Failed to parse profileData for player ${player.id}`);
          }
          
          // Fetch blockchain data if wallet exists
          let influence = 0;
          let dfkSnapshot = profileData?.dfkSnapshot || null;
          
          if (player.primaryWallet) {
            try {
              // Fetch influence token
              influence = await onchain.getPlayerInfluence(player.primaryWallet);
              
              // Fetch all heroes and calculate metrics
              const heroes = await onchain.getAllHeroesByOwner(player.primaryWallet);
              const { gen0Count, heroAge } = onchain.calculateHeroMetrics(heroes);
              
              // Fetch wallet balances
              const balances = await fetchWalletBalances(player.primaryWallet);
              
              // Fetch incentivized LP positions (gardens)
              const dfkGardens = await onchain.getUserGardenPositions(player.primaryWallet, 'dfk');
              const klaytnGardens = await onchain.getUserGardenPositions(player.primaryWallet, 'klaytn');
              const allGardens = [...(dfkGardens || []), ...(klaytnGardens || [])];
              const lpPositionsCount = allGardens.length;
              
              // Calculate LP value using JEWEL price (~$0.10) per LP token
              const jewelPrice = 0.10;
              const totalLPValue = allGardens.reduce((sum, pos) => {
                const staked = parseFloat(pos.stakedAmount || '0');
                return sum + (staked * jewelPrice);
              }, 0);
              
              // Calculate questing streak - count heroes with active/recent quests
              const questingHeroes = heroes.filter(h => h.currentQuest !== null && h.currentQuest !== undefined);
              const questingStreakDays = questingHeroes.length > 0 ? 1 : 0;
              
              // Use cached DFK age from database (computed in background)
              let dfkAgeDays = null;
              let firstTxAt = null;
              if (player.firstDfkTxTimestamp) {
                const firstTxTimestampMs = new Date(player.firstDfkTxTimestamp).getTime();
                dfkAgeDays = onchain.calculateDfkAgeDays(firstTxTimestampMs);
                firstTxAt = player.firstDfkTxTimestamp.toISOString();
              }
              
              dfkSnapshot = {
                heroCount: heroes.length,
                gen0Count,
                heroAge,
                petCount: 0,
                lpPositionsCount,
                totalLPValue,
                jewelBalance: parseFloat(balances.jewel || '0'),
                crystalBalance: parseFloat(balances.crystal || '0'),
                cJewelBalance: parseFloat(balances.cjewel || '0'),
                questingStreakDays,
                dfkAgeDays,
                firstTxAt
              };
              
              console.log(`[API] User ${player.discordUsername}: Influence=${influence}, Gen0=${gen0Count}, HeroAge=${heroAge}d, DFKAge=${dfkAgeDays}d, LP=${lpPositionsCount}, LPValue=$${totalLPValue.toFixed(2)}, QuestHeroes=${questingHeroes.length}`);
            } catch (err) {
              console.warn(`[API] Failed to fetch blockchain data for ${player.primaryWallet}:`, err.message);
            }
          }
          
          // Ensure tier is a number, not a string
          const tierNum = typeof profileData?.tier === 'string' ? parseInt(profileData.tier, 10) : (profileData?.tier || 0);
          
          return {
            id: player.id,
            discordId: player.discordId,
            discordUsername: player.discordUsername,
            walletAddress: player.primaryWallet,
            // Profile fields extracted from profileData JSON
            archetype: profileData?.archetype || 'GUEST',
            tier: tierNum,
            state: profileData?.state || 'CURIOUS',
            behaviorTags: profileData?.behaviorTags || [],
            kpis: profileData?.kpis || {},
            dfkSnapshot,
            influence,
            flags: profileData?.flags || {},
            // Legacy profile field for backward compatibility
            profile: {
              archetype: profileData?.archetype || 'GUEST',
              tier: tierNum,
              state: profileData?.state || 'CURIOUS',
              tags: profileData?.behaviorTags || [],
              flags: profileData?.flags || {}
            }
          };
        } catch (err) {
          console.error(`Error fetching profile for ${player.discordId}:`, err);
          return {
            id: player.id,
            discordId: player.discordId,
            discordUsername: player.discordUsername,
            walletAddress: player.primaryWallet,
            archetype: 'ERROR',
            tier: 0,
            state: 'VISITOR',
            behaviorTags: [],
            kpis: {},
            dfkSnapshot: null,
            influence: 0,
            flags: {},
            profile: {
              archetype: 'ERROR',
              tier: 0,
              state: 'VISITOR',
              tags: [],
              flags: {}
            }
          };
        }
      })
    );
    
    res.json({ success: true, users: usersWithProfiles });
  } catch (err) {
    console.error('❌ Error fetching users:', err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// GET /api/admin/users/:userId/profile - Get single user's account profile
app.get('/api/admin/users/:userId/profile', isAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const { getOrCreateUserProfile } = await import('./user-account-service.js');
    
    const player = await db.select().from(players).where(eq(players.id, parseInt(userId))).limit(1);
    
    if (!player || player.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const p = player[0];
    const profile = await getOrCreateUserProfile(p.discordId, p.discordUsername);
    
    res.json({
      success: true,
      id: p.id,
      discordId: p.discordId,
      discordUsername: p.discordUsername,
      tier: profile.tier,
      totalQueries: profile.totalQueries,
      wallets: profile.wallets,
      lpPositions: profile.lpPositions,
      createdAt: profile.createdAt
    });
  } catch (err) {
    console.error('❌ Error fetching user profile:', err);
    res.status(500).json({ error: 'Failed to fetch user profile' });
  }
});

// PATCH /api/admin/users/:id/tier - Update user tier
app.patch('/api/admin/users/:id/tier', isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { tier } = req.body;
    
    if (typeof tier !== 'number' || tier < 0 || tier > 4) {
      return res.status(400).json({ error: 'Tier must be a number between 0-4' });
    }
    
    const player = await db.select().from(players).where(eq(players.id, parseInt(id)));
    
    if (!player || player.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const discordId = player[0].discordId; // Fixed: was player[0].discord_id
    
    // Update tier using the profile service
    await setTierOverride(discordId, tier);
    
    const updatedProfile = await getQuickProfileSummary(discordId);
    
    res.json({ 
      success: true, 
      message: `Tier updated to ${tier}`,
      profile: updatedProfile 
    });
  } catch (err) {
    console.error('❌ Error updating tier:', err);
    res.status(500).json({ error: 'Failed to update tier' });
  }
});

// GET /api/admin/debug-settings - Get debug settings
app.get('/api/admin/debug-settings', async (req, res) => {
  try {
    res.json(getDebugSettings());
  } catch (error) {
    console.error('[API] Error fetching debug settings:', error);
    res.status(500).json({ error: 'Failed to fetch debug settings' });
  }
});

// POST /api/admin/debug-settings - Update debug settings
app.post('/api/admin/debug-settings', async (req, res) => {
  try {
    const { paymentBypass } = req.body;
    
    if (typeof paymentBypass !== 'boolean') {
      return res.status(400).json({ error: 'paymentBypass must be a boolean' });
    }
    
    setDebugSettings({ paymentBypass });
    
    res.json({ success: true, settings: getDebugSettings() });
  } catch (error) {
    console.error('[API] Error updating debug settings:', error);
    res.status(500).json({ error: 'Failed to update debug settings' });
  }
});

// GET /api/debug/recent-errors - Get recent error logs
app.get('/api/debug/recent-errors', async (req, res) => {
  try {
    const fs = await import('fs');
    const path = await import('path');
    const { readdir, readFile } = fs.promises;
    
    const logDir = '/tmp/logs';
    const errors = [];
    
    try {
      const files = await readdir(logDir);
      const workflowLogs = files
        .filter(f => f.startsWith('Start_application_'))
        .sort()
        .reverse()
        .slice(0, 3);
      
      for (const logFile of workflowLogs) {
        const logPath = path.join(logDir, logFile);
        const content = await readFile(logPath, 'utf-8');
        const lines = content.split('\n');
        
        for (const line of lines) {
          if (line.match(/❌|ERROR|Error:|Failed|Exception|CRITICAL|WARNING/i)) {
            errors.push({
              timestamp: new Date().toISOString(),
              message: line.trim(),
              file: logFile
            });
          }
        }
      }
    } catch (err) {
      console.log('[Debug] Could not read log files:', err.message);
    }
    
    const recentErrors = errors.slice(0, 50);
    
    res.json({ 
      success: true,
      count: recentErrors.length,
      errors: recentErrors
    });
  } catch (error) {
    console.error('[Debug] Error fetching recent errors:', error);
    res.status(500).json({ error: error.message });
  }
});

// Discord OAuth Routes
app.get('/auth/discord', (req, res) => {
  if (!DISCORD_CLIENT_ID) {
    return res.status(400).json({ error: 'Discord OAuth not configured' });
  }
  
  const state = crypto.randomBytes(16).toString('hex');
  const scopes = 'identify guilds';
  const authorizeUrl = `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=${encodeURIComponent(scopes)}&state=${state}`;
  
  res.setCookie('oauth_state', state, { maxAge: 600 }); // 10 minutes
  res.redirect(authorizeUrl);
});

app.get('/auth/discord/callback', async (req, res) => {
  try {
    if (!DISCORD_CLIENT_ID || !DISCORD_CLIENT_SECRET) {
      return res.status(400).json({ error: 'Discord OAuth not configured' });
    }
    
    const { code, state } = req.query;
    
    if (!code || !state) {
      return res.status(400).json({ error: 'Missing code or state' });
    }
    
    if (state !== req.cookies.oauth_state) {
      return res.status(403).json({ error: 'State mismatch - potential CSRF attack' });
    }
    
    // Exchange code for token
    const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: DISCORD_CLIENT_ID,
        client_secret: DISCORD_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: REDIRECT_URI
      })
    });
    
    if (!tokenResponse.ok) {
      const error = await tokenResponse.text();
      console.error('❌ Discord token exchange failed:', error);
      return res.status(401).json({ error: 'Failed to exchange code for token' });
    }
    
    const tokenData = await tokenResponse.json();
    
    // Get user info
    const userResponse = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });
    
    if (!userResponse.ok) {
      return res.status(401).json({ error: 'Failed to fetch user info' });
    }
    
    const user = await userResponse.json();
    console.log(`🔐 OAuth Success - Discord User ID: ${user.id}, Username: ${user.username}`);
    
    // Create session token
    const sessionToken = crypto
      .createHmac('sha256', SESSION_SECRET)
      .update(`${user.id}:${Date.now()}`)
      .digest('hex');
    
    // Store session in database (7-day expiration)
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await db.insert(adminSessions).values({
      sessionToken,
      discordId: user.id,
      username: user.username,
      avatar: user.avatar,
      accessToken: tokenData.access_token,
      expiresAt
    });
    
    res.setCookie('session_token', sessionToken, { maxAge: 7 * 24 * 60 * 60 });
    
    // Check if user is an admin
    const isAdmin = ADMIN_USER_IDS.includes(user.id);
    
    // Redirect to admin dashboard or login page with error
    if (isAdmin) {
      res.redirect('/admin');
    } else {
      res.redirect('/admin/login?error=not_admin');
    }
  } catch (err) {
    console.error('❌ OAuth callback error:', err);
    res.redirect('/admin/login?error=auth_failed');
  }
});

app.get('/auth/status', async (req, res) => {
  try {
    const sessionToken = req.cookies.session_token;
    
    if (!sessionToken) {
      return res.json({ authenticated: false });
    }
    
    // Fetch from database
    const sessions = await db.select().from(adminSessions).where(eq(adminSessions.sessionToken, sessionToken));
    
    if (!sessions || sessions.length === 0) {
      return res.json({ authenticated: false });
    }
    
    const session = sessions[0];
    
    if (new Date(session.expiresAt) < new Date()) {
      await db.delete(adminSessions).where(eq(adminSessions.sessionToken, sessionToken));
      return res.json({ authenticated: false });
    }
    
    const isAdmin = ADMIN_USER_IDS.includes(session.discordId);
    
    res.json({
      authenticated: true,
      user: {
        discordId: session.discordId,
        username: session.username,
        avatar: session.avatar,
        isAdmin
      }
    });
  } catch (err) {
    console.error('❌ Auth status check failed:', err);
    res.status(500).json({ error: 'Failed to check auth status' });
  }
});

app.post('/auth/logout', async (req, res) => {
  try {
    const sessionToken = req.cookies.session_token;
    if (sessionToken) {
      await db.delete(adminSessions).where(eq(adminSessions.sessionToken, sessionToken));
    }
    
    res.setCookie('session_token', '', { maxAge: 0 });
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Logout error:', err);
    res.status(500).json({ error: 'Logout failed' });
  }
});

// Also support GET for backward compatibility
app.get('/auth/logout', async (req, res) => {
  try {
    const sessionToken = req.cookies.session_token;
    if (sessionToken) {
      await db.delete(adminSessions).where(eq(adminSessions.sessionToken, sessionToken));
    }
    
    res.setCookie('session_token', '', { maxAge: 0 });
    res.redirect('/admin/login');
  } catch (err) {
    console.error('❌ Logout error:', err);
    res.redirect('/admin/login');
  }
});

const server = http.createServer(app);

server.on('error', (err) => {
  console.error('❌ Web server error:', err.message);
  if (err.code === 'EADDRINUSE') {
    console.log('Port 5000 already in use - web server disabled');
  }
});

// Serve static files AFTER API routes
app.use(express.static('public'));

// Try to set up Vite dev server, fallback to static serving
try {
  const { setupVite } = await import('./server/vite.js');
  await setupVite(app, server);
  console.log('✅ Vite dev server configured');
} catch (err) {
  console.log(`❌ Failed to setup Vite: ${err.message}`);
  console.log('Falling back to static file serving from dist/public/');
  
  // Serve built React app from dist/public
  const distPath = path.resolve(import.meta.dirname, 'dist', 'public');
  if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    // SPA fallback - serve index.html for all non-API routes
    app.get(/^(?!\/api|\/auth).*$/, (req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
    console.log('✅ Serving React app from dist/public/');
  } else {
    console.log('⚠️ dist/public not found - run "npx vite build" to build the client');
  }
}

server.listen(5000, () => {
  console.log('✅ Web server listening on port 5000');
});

// === Login to Discord ===
client.login(DISCORD_TOKEN);
