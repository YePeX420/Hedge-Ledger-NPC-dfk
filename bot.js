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
import { requestDeposit, HEDGE_WALLET } from './deposit-flow.js';
import { startMonitoring, stopMonitoring, initializeExistingJobs, verifyTransactionHash } from './transaction-monitor-v2.js';
import { registerJob } from './payment-jobs.js';
import { ethers } from 'ethers';
import { creditBalance } from './balance-credit.js';
import { initializeProcessor, startProcessor, stopProcessor } from './optimization-processor.js';
import { startSnapshotJob, stopSnapshotJob } from './wallet-snapshot-job.js';
import { fetchWalletBalances, fetchCJewelLockTime } from './blockchain-balance-fetcher.js';
import { initializePricingConfig } from './pricing-engine.js';
import { getAnalyticsForDiscord } from './analytics.js';
import { initializePoolCache, stopPoolCache, getCachedPoolAnalytics } from './pool-cache.js';
import { generateOptimizationMessages } from './report-formatter.js';
import { calculateSummoningProbabilities, calculateTTSProbabilities } from './summoning-engine.js';
import { createSummarySummoningEmbed, createStatGenesEmbed, createVisualGenesEmbed } from './summoning-formatter.js';
import { decodeHeroGenes } from './hero-genetics.js';
import { getCrystalPrice, getJewelPrice } from './price-feed.js';
import { buildFocusedPriceGraph } from './garden-analytics.js';
import { db } from './server/db.js';
import { jewelBalances, players, depositRequests, queryCosts, interactionSessions, interactionMessages, gardenOptimizations, walletSnapshots, adminSessions, userSettings, leagueSeasons, leagueSignups, seasonTierLocks, walletClusters, walletLinks, smurfIncidents, walletPowerSnapshots, poolSwapEvents, poolRewardEvents, combatKeywords, combatClassMeta, combatSkills, combatSources, syncRuns, syncRunItems } from './shared/schema.ts';
import { runPreSeasonChecks, runInSeasonChecks, getOrCreateCluster, linkWalletToCluster } from './smurf-detection-service.js';
import { eq, desc, asc, sql, inArray, and, gt, lt } from 'drizzle-orm';
import http from 'http';
import express from 'express';
import cors from 'cors';
import { getDebugSettings, setDebugSettings, isVerboseLoggingEnabled, isPaymentBypassEnabled, isOAuthBypassEnabled, isOAuthBypassAllowed } from './debug-settings.js';
import { handleGardenOptimizationDM } from './garden-optimization-handler.js';

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
import { getWalletSummary as getBridgeSummary, getTopExtractors, refreshWalletMetrics, refreshAllMetrics } from './bridge-tracker/bridge-metrics.js';
import { 
  indexWallet as indexBridgeWallet, 
  runFullIndex as runBridgeFullIndex, 
  getLatestBlock as getBridgeLatestBlock,
  runHistoricalSync,
  isHistoricalSyncRunning,
  abortHistoricalSync,
  getIndexerProgress,
  initIndexerProgress,
  startMaintenanceScheduler,
  runMaintenanceSync,
  runIncrementalBatch,
  isIncrementalBatchRunning,
  getCurrentBatchProgress,
  runWorkerBatch,
  getAllWorkerProgress,
  getWorkerIndexerName
} from './bridge-tracker/bridge-indexer.js';
import {
  runPriceEnrichment,
  isEnrichmentRunning,
  getUnpricedEventCount,
  startEnrichmentScheduler,
  runParallelPriceEnrichment,
  isParallelEnrichmentRunning,
  getParallelEnrichmentStatus,
  stopParallelEnrichment
} from './bridge-tracker/price-enrichment.js';
import { fetchCurrentPrices as fetchBridgePrices } from './bridge-tracker/price-history.js';
import { getValueBreakdown } from './src/analytics/valueBreakdown.ts';
import { getCexLiquidity } from './src/analytics/cexLiquidity.ts';
import { syncTokenRegistry, getAllTokens, getTokenAddressMap } from './src/services/tokenRegistryService.ts';
import { bridgeEvents, walletBridgeMetrics, challengeCategories, challenges, challengeTiers, playerChallengeProgress, challengeProgressWindowed, challengeValidation, challengeAuditLog, challengeMetricStats, CHALLENGE_STATES, CHALLENGE_TYPES, METRIC_AGGREGATIONS, TIERING_MODES } from './shared/schema.ts';
import { computeBaseTierFromMetrics, createEmptySnapshot } from './src/services/classification/TierService.ts';
import { TIER_CODE_TO_LEAGUE } from './src/api/contracts/leagues.ts';
import levelRacerRoutes from './src/modules/levelRacer/levelRacer.routes.ts';
import leaderboardRoutes from './src/modules/leaderboards/leaderboard.routes.ts';
import publicLeaderboardRoutes from './src/modules/leaderboards/public.routes.ts';
import seasonRoutes from './src/modules/seasons/season.routes.ts';
import { seedHeroClasses, ensurePoolsForAllClasses } from './src/modules/levelRacer/levelRacer.service.ts';
import * as poolStakerIndexer from './src/etl/ingestion/poolStakerIndexer.js';
import { 
  getPVEIndexerStatus, 
  getPVEIndexerLiveProgress,
  runPVEIndexerBatch, 
  startPVEIndexerAutoRun, 
  stopPVEIndexerAutoRun, 
  startPVEWorkersAutoRun,
  stopPVEWorkersAutoRun,
  resetPVEIndexer,
  calculateDropStats,
  backfillItemNames
} from './src/etl/ingestion/huntsPatrolIndexer.js';

import { requirePublicApiKey, requireAdminApiKey } from './server/middleware/hedgeAuth.ts';
import { hedgeCors } from './server/middleware/hedgeCors.ts';
import { rateLimiter } from './server/middleware/rateLimit.ts';
import { registerHedgePublicRoutes } from './server/routes/hedgePublic.ts';
import { registerHedgeAdminRoutes } from './server/routes/hedgeAdmin.ts';
import { publicCombatRouter } from './server/routes/hedgePublicCombat.ts';

const execAsync = promisify(exec);

// Environment detection - production vs development
// Check multiple indicators: REPLIT_DEPLOYMENT (any truthy value), NODE_ENV
const isProduction = () => {
  const replitDeployment = process.env.REPLIT_DEPLOYMENT;
  const nodeEnv = process.env.NODE_ENV;
  return !!(replitDeployment && replitDeployment !== '0' && replitDeployment !== 'false') || 
         nodeEnv === 'production';
};
const getEnvironmentName = () => isProduction() ? 'production' : 'development';

// ============================================================
// STARTUP DIAGNOSTICS - Log everything for production debugging
// ============================================================
console.log('='.repeat(60));
console.log('🚀 BOT.JS STARTUP - ' + new Date().toISOString());
console.log('='.repeat(60));
console.log('📦 Node version:', process.version);
console.log('🖥️  Platform:', process.platform, process.arch);
console.log('📁 Working directory:', process.cwd());
console.log('💾 Memory:', Math.round(process.memoryUsage().heapUsed / 1024 / 1024), 'MB used');

// Process-level error handlers - catch uncaught errors
process.on('uncaughtException', (error) => {
  console.error('💥 UNCAUGHT EXCEPTION:', error.message);
  console.error('Stack:', error.stack);
  // Don't exit - let the server keep running if possible
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 UNHANDLED REJECTION at:', promise);
  console.error('Reason:', reason);
});

// Environment variable validation
const ENV_CHECKS = {
  // Required for Discord bot
  DISCORD_TOKEN: process.env.DISCORD_TOKEN,
  DISCORD_CLIENT_ID: process.env.DISCORD_CLIENT_ID,
  DISCORD_GUILD_ID: process.env.DISCORD_GUILD_ID,
  DISCORD_CLIENT_SECRET: process.env.DISCORD_CLIENT_SECRET,
  
  // Required for database
  DATABASE_URL: process.env.DATABASE_URL,
  
  // Required for OpenAI
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  
  // OAuth callback
  OAUTH_CALLBACK_URL: process.env.OAUTH_CALLBACK_URL,
  REDIRECT_URI: process.env.REDIRECT_URI,
  
  // Optional but important
  COOKIE_DOMAIN: process.env.COOKIE_DOMAIN,
  ADMIN_USER_IDS: process.env.ADMIN_USER_IDS,
  ALLOW_OAUTH_BYPASS: process.env.ALLOW_OAUTH_BYPASS,
};

console.log('\n📋 ENVIRONMENT VARIABLES STATUS:');
console.log('-'.repeat(40));
let missingRequired = [];
for (const [key, value] of Object.entries(ENV_CHECKS)) {
  const status = value ? '✅' : '❌';
  const displayValue = value ? `(${value.substring(0, 8)}...)` : '(MISSING)';
  console.log(`${status} ${key}: ${displayValue}`);
  
  // Track critical missing vars
  if (!value && ['DISCORD_TOKEN', 'DATABASE_URL', 'DISCORD_CLIENT_ID'].includes(key)) {
    missingRequired.push(key);
  }
}

if (missingRequired.length > 0) {
  console.error('\n⚠️  CRITICAL: Missing required environment variables:', missingRequired.join(', '));
  console.error('The server may fail to start properly without these.');
}
console.log('-'.repeat(40));
console.log('');

// --- Runtime status flags for health checks ---
let paymentMonitorStarted = false;
let poolCacheInitialized = false;
let optimizationProcessorStarted = false;
let snapshotJobStarted = false;
let cacheQueueInitialized = false;

// --- DM State Machine ---
// States: idle | pending_optimization | awaiting_payment | running_optimization
const DM_STATES = {
  IDLE: 'idle',
  PENDING_OPTIMIZATION: 'pending_optimization',
  AWAITING_PAYMENT: 'awaiting_payment',
  RUNNING_OPTIMIZATION: 'running_optimization'
};

// DM context map: userId -> { state, wallet, positions, createdAt, lastHeroId, lastHeroData, heroTimestamp }
const dmContext = new Map();

// State machine TTL: 30 minutes for optimization flow
const DM_STATE_TTL_MS = 30 * 60 * 1000;

function getDmState(userId) {
  const ctx = dmContext.get(userId);
  if (!ctx) return { state: DM_STATES.IDLE };
  
  // Check TTL - reset to idle if expired
  if (ctx.createdAt && Date.now() - ctx.createdAt > DM_STATE_TTL_MS) {
    console.log(`[DM State] TTL expired for ${userId}, resetting to idle`);
    dmContext.set(userId, { state: DM_STATES.IDLE });
    return { state: DM_STATES.IDLE };
  }
  
  return ctx;
}

function setDmState(userId, newState, extraData = {}) {
  const current = dmContext.get(userId) || {};
  const updated = {
    ...current,
    ...extraData,
    state: newState,
    createdAt: extraData.resetTimer ? Date.now() : (current.createdAt || Date.now())
  };
  dmContext.set(userId, updated);
  console.log(`[DM State] ${userId} -> ${newState}`);
  return updated;
}

function clearDmState(userId) {
  // Keep hero context but clear optimization state
  const current = dmContext.get(userId) || {};
  dmContext.set(userId, { 
    state: DM_STATES.IDLE,
    lastHeroId: current.lastHeroId,
    lastHeroData: current.lastHeroData,
    heroTimestamp: current.heroTimestamp
  });
  console.log(`[DM State] ${userId} -> idle (cleared)`);
}

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

  // Initialize ETL scheduler for challenge progress updates
  try {
    console.log('🔄 Starting ETL scheduler...');
    const { startEtlScheduler } = await import('./src/etl/scheduler/etlScheduler.ts');
    startEtlScheduler();
    console.log('✅ ETL scheduler started');
  } catch (err) {
    console.error('❌ Failed to start ETL scheduler:', err);
  }

  // Initialize Combat Codex nightly sync cron (production only)
  if (isProduction()) {
    try {
      console.log('⚔️ Starting Combat Codex sync cron...');
      const { startCombatCodexCron } = await import('./src/jobs/combatCodexCron.ts');
      startCombatCodexCron();
      console.log('✅ Combat Codex cron started');
    } catch (err) {
      console.error('❌ Failed to start Combat Codex cron:', err);
    }
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

          // ============================================
          // 🎛️ DM STATE MACHINE ROUTING
          // ============================================
          const dmState = getDmState(discordId);
          const lowerContent = message.content.toLowerCase();
          const bypass = isPaymentBypassEnabled?.() ?? false;
          
          console.log(`[DM State] Current state for ${username}: ${dmState.state}, bypass=${bypass}`);

          // --- Regex patterns ---
          const txPrefixRegex = /tx:\s*0[xX][a-fA-F0-9]{64}/i;
          const txPrefixMatch = message.content.match(txPrefixRegex);
          const walletRegex = /0[xX][a-fA-F0-9]{40}(?![a-fA-F0-9])/;
          const walletMatch = message.content.match(walletRegex);
          const confirmPhrases = ['proceed', 'go ahead', 'yes', 'confirm', 'do it', 'lets go', "let's go", 'start', 'run it', 'continue'];
          const isConfirmation = confirmPhrases.some(phrase => lowerContent.includes(phrase));
          const isCancelRequest = lowerContent.includes('cancel') || lowerContent.includes('nevermind') || lowerContent.includes('stop');
          const isOptimizeRequest = lowerContent.includes('optimize my gardens') || /\boptimi[sz]e\b.*\bgarden/.test(lowerContent);

          // --- STATE: pending_optimization or awaiting_payment ---
          // Hard gate: only allow proceed/tx/cancel during optimization flow
          if (dmState.state === DM_STATES.PENDING_OPTIMIZATION || dmState.state === DM_STATES.AWAITING_PAYMENT) {
            
            // Cancel request
            if (isCancelRequest) {
              clearDmState(discordId);
              await message.reply("Alright, I've cancelled the optimization request. Let me know if you need anything else!");
              return;
            }
            
            // tx: hash submitted
            if (txPrefixMatch && playerData) {
              const txHash = txPrefixMatch[0].replace(/tx:\s*/i, '').trim();
              console.log(`[DM State] tx: hash received in ${dmState.state}: ${txHash}`);
              
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
                  setDmState(discordId, DM_STATES.RUNNING_OPTIMIZATION);

                  const result = await verifyTransactionHash(txHash, pendingOpt[0].id);

                  if (result.success) {
                    await message.reply(
                      `✅ **Payment Verified!**\n\n` +
                      `**Amount:** ${result.payment.amount} JEWEL\n` +
                      `**Block:** ${result.payment.blockNumber}\n\n` +
                      `Your optimization is now being processed. You'll receive your personalized recommendations shortly!`
                    );
                    // Optimization processor will handle the actual work
                    clearDmState(discordId);
                  } else {
                    // Stay in awaiting_payment state
                    setDmState(discordId, DM_STATES.AWAITING_PAYMENT);
                    await message.reply(
                      `❌ I couldn't verify that transaction. Double-check the hash and make sure it was sent to the correct Hedge wallet.\n\n` +
                      `Hedge Wallet: \`0x498BC270C4215Ca62D9023a3D97c5CAdCD7c99e1\``
                    );
                  }
                } else {
                  clearDmState(discordId);
                  await message.reply(
                    `I don't see any pending optimizations in the database. Let's start fresh - say "optimize my gardens" to begin!`
                  );
                }
              } catch (txError) {
                console.error(`[DM State] tx verification error:`, txError);
                await message.reply(`Hmm, I had trouble verifying that transaction. Try again?`);
              }
              return;
            }
            
            // "Proceed" confirmation with bypass enabled
            if (isConfirmation && bypass) {
              console.log(`[DM State] Proceed + bypass in ${dmState.state} - running optimization`);
              setDmState(discordId, DM_STATES.RUNNING_OPTIMIZATION);
              await message.reply('🧪 Payment bypass is enabled. Running your garden optimization now...');
              
              try {
                await handleGardenOptimizationDM(message, playerData, { runOptimization: true });
                clearDmState(discordId);
              } catch (err) {
                console.error('[DM State] Optimization error:', err);
                clearDmState(discordId);
              }
              return;
            }
            
            // "Proceed" confirmation without bypass - remind about payment
            if (isConfirmation && !bypass) {
              setDmState(discordId, DM_STATES.AWAITING_PAYMENT);
              await message.reply(
                "I'm ready to optimize once I receive payment! Send **25 JEWEL** to my wallet and paste the transaction hash here.\n\n" +
                "Hedge Wallet: `0x498BC270C4215Ca62D9023a3D97c5CAdCD7c99e1`\n\n" +
                "Format: `tx:0x...your_transaction_hash`"
              );
              return;
            }
            
            // Block wallet detection during optimization flow
            if (walletMatch) {
              await message.reply(
                "I see a wallet address, but you're in the middle of an optimization request. " +
                "Say **proceed** to continue, paste a **tx:hash** after payment, or say **cancel** to start over."
              );
              return;
            }
            
            // Block everything else during optimization flow - don't fall through to GPT
            await message.reply(
              "You have a pending optimization request. Your options:\n" +
              "• Say **proceed** or **go ahead** to continue\n" +
              "• Paste **tx:0x...** after sending payment\n" +
              "• Say **cancel** to abort\n\n" +
              "I won't respond to other questions until you complete or cancel the optimization."
            );
            return;
          }

          // --- STATE: running_optimization ---
          // Block everything while optimization is running
          if (dmState.state === DM_STATES.RUNNING_OPTIMIZATION) {
            await message.reply(
              "I'm currently running your garden optimization. Please wait for it to complete!"
            );
            return;
          }

          // ============================================
          // STATE: idle - Normal routing
          // ============================================

          // 🔐 tx: hash when idle - no pending optimization
          if (txPrefixMatch) {
            await message.reply(
              "You don't have any active optimization requests. Say **optimize my gardens** first, then submit payment."
            );
            return;
          }

          // 💼 Wallet address detection (only in idle state)
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
              return;
            } catch (walletError) {
              console.error(`❌ Failed to save wallet:`, walletError);
              await message.reply(`Hmm, I had trouble saving that wallet address. Try again?`);
              return;
            }
          }

          // 🌿 "Optimize gardens" request (only in idle state)
          if (isOptimizeRequest) {
            console.log(`[DM State] Optimize request, bypass=${bypass}`);
            setDmState(discordId, DM_STATES.PENDING_OPTIMIZATION, { 
              wallet: playerData?.primaryWallet,
              resetTimer: true 
            });
            await handleGardenOptimizationDM(message, playerData, { runOptimization: false });
            return;
          }

          // 🌿 "Proceed" when idle - no pending optimization
          if (isConfirmation) {
            // Fall through to GPT - not in optimization flow
            console.log(`[DM State] Confirmation phrase but idle - passing to GPT`);
          }

          // ============================================
          // Normal conversation - hero lookup + GPT fallback
          // ============================================
          let enrichedContent = `DM from ${message.author.username}: ${message.content}`;

          console.log(`💬 Processing DM from ${username}: ${message.content}`);
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
                // Save to DM context for follow-up questions
                setDmState(discordId, DM_STATES.IDLE, {
                  lastHeroId: heroId,
                  lastHeroData: heroData,
                  heroTimestamp: Date.now()
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

                const heroInfo = lines.join('\n');
                await message.reply(heroInfo);
                return;
              } else {
                await message.reply(`I couldn't find that hero on-chain. Double-check the ID and try again.`);
                return;
              }
            } catch (heroError) {
              console.error(`❌ Error fetching hero data:`, heroError);
              await message.reply(`I had trouble pulling that hero from the chain. Try again in a bit.`);
              return;
            }
          }

          // Fallback: send to OpenAI (askHedge)
          try {
            const aiMessages = [
              { role: 'user', content: enrichedContent }
            ];

            const finalResponse = await askHedge(aiMessages, { mode: 'dm' });

            await message.reply(finalResponse);
            console.log(`✅ Sent AI response to ${username}`);
          } catch (aiError) {
            console.error("❌ OpenAI error in DM:", aiError);
            await message.reply("*yawns* My ledger seems stuck... give me a moment and try again.");
          }

        } catch (err) {
          console.error("DM error:", err);
          try {
            await message.reply("*yawns* Something went wrong. Try again later.");
          } catch {
            // swallow reply error
          }
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
          // Immediately defer reply to prevent Discord timeout (3 second limit)
          // This must happen before ANY async work to avoid "Unknown interaction" errors
          // Skip for commands that need ephemeral replies - they handle their own defer
          const EPHEMERAL_COMMANDS = ['account'];
          if (!EPHEMERAL_COMMANDS.includes(interaction.commandName)) {
            await interaction.deferReply();
          }
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
      
      // Fetch pet and quest data for follow-up messages
      try {
        // Get owner wallet for expedition/power-up lookup
        const ownerWallet = hero.owner?.id;
        
        if (ownerWallet) {
          // Import required functions dynamically
          const { fetchPetForHero } = await import('./pet-data.js');
          const { getAllExpeditions } = await import('./hero-pairing.js');
          const { getWalletPowerUpStatus } = await import('./rapid-renewal-service.js');
          
          // Fetch pet and quest info in parallel
          const [pet, expeditions, powerUpStatus] = await Promise.all([
            fetchPetForHero(hero.normalizedId || numericId),
            getAllExpeditions(ownerWallet).catch(() => null),
            getWalletPowerUpStatus(ownerWallet).catch(() => null)
          ]);
          
          // === PET INFO FOLLOW-UP ===
          const petLines = [];
          petLines.push('🐾 **Equipped Pet**');
          petLines.push('');
          
          if (pet) {
            const hasGF = powerUpStatus?.gravityFeeder?.active || false;
            const petFed = pet.isFed || hasGF;
            const fedReason = pet.isFed 
              ? `Fed (${pet.hungryInHours}h remaining)` 
              : (hasGF ? 'Fed (Gravity Feeder)' : 'Hungry');
            
            // Header with shiny status
            const shinyText = pet.shiny ? '✨ Shiny' : 'Non-Shiny';
            petLines.push(`**Pet #${pet.id}** ${shinyText}`);
            petLines.push(`Variant: ${pet.variant || 'Normal'}`);
            petLines.push(`• Profession: ${pet.profession || pet.gatheringType}`);
            petLines.push(`• Stars: ${pet.stars || pet.bonusCount || 0}`);
            petLines.push(`• Rarity: ${pet.rarityName} | Element: ${pet.elementName}`);
            petLines.push(`• Season: ${pet.seasonName}`);
            petLines.push('');
            
            // Gathering Stats with skill description and star rating
            petLines.push('**Gathering Stats:**');
            petLines.push(`• Skill: ${pet.gatheringSkillName || pet.gatheringBonusName}`);
            if (pet.gatheringSkillDescription) {
              petLines.push(`• Description: ${pet.gatheringSkillDescription}`);
            }
            petLines.push(`• Bonus: +${pet.gatheringBonusScalar}%`);
            petLines.push(`• Bonus Rarity: ${pet.gatheringStarsDisplay || '⭐'} (${pet.gatheringStars || 1} stars)`);
            petLines.push('');
            
            // Combat Stats with skill description and star rating
            petLines.push('**Combat Stats:**');
            petLines.push(`• Skill: ${pet.combatSkillName || pet.combatBonusName}`);
            if (pet.combatSkillDescription) {
              petLines.push(`• Description: ${pet.combatSkillDescription}`);
            }
            petLines.push(`• Bonus: +${pet.combatBonusScalar}%`);
            petLines.push(`• Bonus Rarity: ${pet.combatStarsDisplay || '⭐'} (${pet.combatStars || 1} stars)`);
            petLines.push('');
            
            petLines.push(`**Status:** ${fedReason}`);
          } else {
            petLines.push('*No pet equipped to this hero*');
          }
          
          await interaction.followUp(petLines.join('\n').slice(0, 1900));
          
          // === QUEST INFO FOLLOW-UP ===
          const questLines = [];
          questLines.push('⚔️ **Current Quest**');
          questLines.push('');
          
          if (expeditions?.heroToQuest) {
            const questData = expeditions.heroToQuest.get(hero.normalizedId) || 
                             expeditions.heroToQuest.get(Number(numericId));
            
            if (questData) {
              questLines.push(`**${questData.name}**`);
              questLines.push(`• Type: ${questData.type}`);
              if (questData.poolId) questLines.push(`• Pool: ${questData.poolId}`);
              questLines.push(`• Heroes: ${questData.heroIds.join(', ')}`);
              questLines.push(`• Iteration: ${questData.iterationTimeStr}`);
              questLines.push(`• Remaining: ${questData.remainingIterations} iterations`);
            } else {
              questLines.push('*Not on any expedition*');
            }
          } else {
            questLines.push('*Unable to fetch expedition data*');
          }
          
          questLines.push('');
          questLines.push('⚡ **Power-ups**');
          questLines.push('');
          
          if (powerUpStatus) {
            const hasRR = powerUpStatus.rapidRenewal?.heroIds?.includes(hero.normalizedId) ||
                         powerUpStatus.rapidRenewal?.heroIds?.includes(Number(numericId)) || false;
            
            // Show all power-ups with status
            questLines.push(`• Wild Unknown: ${powerUpStatus.wildUnknown?.active ? '✅' : '❌'}`);
            questLines.push(`• Quick Study: ${powerUpStatus.quickStudy?.active ? '✅' : '❌'}`);
            questLines.push(`• Rapid Renewal: ${hasRR ? '✅ (this hero)' : '❌'}`);
            questLines.push(`• Gravity Feeder: ${powerUpStatus.gravityFeeder?.active ? '✅' : '❌'}`);
            questLines.push(`• Premium Provisions: ${powerUpStatus.premiumProvisions?.active ? '✅' : '❌'}`);
            questLines.push(`• Thrifty: ${powerUpStatus.thrifty?.active ? '✅' : '❌'}`);
            questLines.push(`• Perpetual Potion: ${powerUpStatus.perpetualPotion?.active ? '✅' : '❌'}`);
            questLines.push(`• Unscathed: ${powerUpStatus.unscathed?.active ? '✅' : '❌'}`);
            questLines.push(`• Backstage Pass: ${powerUpStatus.backstagePass?.active ? '✅' : '❌'}`);
            questLines.push(`• Master Merchant: ${powerUpStatus.masterMerchant?.active ? '✅' : '❌'}`);
          } else {
            questLines.push('*Unable to fetch power-up status*');
          }
          
          await interaction.followUp(questLines.join('\n').slice(0, 1900));
        }
      } catch (err) {
        console.error('[DebugHeroId] Error fetching pet/quest data:', err);
        // Don't fail the command, just skip follow-up
      }
      
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
        
        // Query using only valid gene fields (statGenes, visualGenes) + quest data
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
              
              # Owner info for pet lookup
              owner {
                id
                name
              }
              
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
              staminaFullAt
              
              # Profession skills
              mining
              gardening
              foraging
              fishing
              
              # Summons
              summons
              maxSummons
              
              # Valid gene fields (confirmed by API)
              statGenes
              visualGenes
              
              # Quest data
              currentQuest
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
        
        // Send first message (genetics) with character limit guard
        if (output.length > 1900) {
          await interaction.editReply(output.slice(0, 1900) + '\n_...truncated_');
        } else {
          await interaction.editReply(output);
        }
        
        // Build second message with stats, skills, quest data
        const lines2 = [];
        lines2.push(`**📊 Stats & Skills for Hero ${hero.normalizedId || hero.id}**`);
        lines2.push('');
        
        // Base Stats
        lines2.push('**💪 Base Stats:**');
        lines2.push(`STR: ${hero.strength || 0} | INT: ${hero.intelligence || 0} | WIS: ${hero.wisdom || 0} | LCK: ${hero.luck || 0}`);
        lines2.push(`AGI: ${hero.agility || 0} | VIT: ${hero.vitality || 0} | END: ${hero.endurance || 0} | DEX: ${hero.dexterity || 0}`);
        lines2.push(`HP: ${hero.hp || 0} | MP: ${hero.mp || 0}`);
        lines2.push('');
        
        // Profession Skills (stored as x10 in API) - Bold the one matching D-gene
        lines2.push('**🛠️ Profession Skills:**');
        const gardeningSkill = (hero.gardening || 0) / 10;
        const miningSkill = (hero.mining || 0) / 10;
        const foragingSkill = (hero.foraging || 0) / 10;
        const fishingSkill = (hero.fishing || 0) / 10;
        const profDGene = decoded.profession.dominant;
        
        // Format each skill, bolding the one that matches D-gene profession
        const formatSkill = (name, value) => {
          const formatted = `${name}: ${value.toFixed(1)}`;
          return profDGene === name ? `**${formatted}**` : formatted;
        };
        
        lines2.push(`${formatSkill('Gardening', gardeningSkill)} | ${formatSkill('Mining', miningSkill)} | ${formatSkill('Foraging', foragingSkill)} | ${formatSkill('Fishing', fishingSkill)}`);
        lines2.push('');
        
        // Summons - show as "X/Y available" format
        lines2.push('**🔮 Summons:**');
        const summons = hero.summons ?? 0;
        const maxSummons = hero.maxSummons ?? 0;
        const remaining = maxSummons - summons;
        lines2.push(`${remaining}/${maxSummons} available`);
        lines2.push('');
        
        // Stamina info - show as current/max format (e.g., 9/34 means 9 remaining out of 34 max)
        // Calculate max stamina from staminaFullAt if available, otherwise from level formula
        const currentStamina = hero.stamina ?? 0;
        let maxStamina;
        
        if (hero.staminaFullAt) {
          const fullAt = hero.staminaFullAt;
          const now = Math.floor(Date.now() / 1000);
          
          if (fullAt > now) {
            // Stamina regens at 1 per 20 minutes (1200 seconds)
            // staminaToRegen = timeRemaining / 1200
            const secondsRemaining = fullAt - now;
            const staminaToRegen = Math.ceil(secondsRemaining / 1200);
            maxStamina = currentStamina + staminaToRegen;
          } else {
            // staminaFullAt is in the past, hero is at full
            maxStamina = currentStamina;
          }
        } else {
          // No staminaFullAt means hero is at full stamina
          maxStamina = currentStamina;
        }
        
        // Ensure maxStamina is at least the level-based minimum (25 + floor(level/5))
        const heroLevel = hero.level || 0;
        const calculatedMinMax = 25 + Math.floor(heroLevel / 5);
        maxStamina = Math.max(maxStamina, calculatedMinMax);
        
        lines2.push('**🔋 Stamina:**');
        lines2.push(`**Current:** ${currentStamina}/${maxStamina}`);
        if (hero.staminaFullAt) {
          const fullAt = new Date(hero.staminaFullAt * 1000);
          const now = new Date();
          if (fullAt > now) {
            const minsLeft = Math.round((fullAt - now) / 60000);
            lines2.push(`**Full in:** ${minsLeft} minutes`);
          } else {
            lines2.push(`**Status:** Full`);
          }
        }
        lines2.push('');
        
        // Quest Data Section - decode the quest hex into meaningful info
        lines2.push('**⚔️ Quest Data:**');
        const questHex = hero.currentQuest || '0x0000000000000000000000000000000000000000';
        
        if (questHex && questHex !== '0x0000000000000000000000000000000000000000') {
          const hex = questHex.toLowerCase().replace('0x', '');
          
          // Decode quest bytes
          const byte0 = parseInt(hex.substring(0, 2), 16);  // Quest instance ID
          const byte1 = parseInt(hex.substring(2, 4), 16);  // Pool ID / Type
          const byte2 = parseInt(hex.substring(4, 6), 16);  // Sub-type
          const byte3 = parseInt(hex.substring(6, 8), 16);  // Quest type
          
          // Quest instance ID mapping
          const questInstances = {
            1: 'Fishing', 2: 'Foraging', 3: 'Gold Mining',
            4: 'Token Mining', 5: 'Gardening', 6: 'Training'
          };
          
          const questType = questInstances[byte0] || `Unknown (${byte0})`;
          lines2.push(`**Quest Type:** ${questType}`);
          
          if (byte0 === 5) {
            // Gardening quest - byte1 is pool ID
            lines2.push(`**Garden Pool:** ${byte1}`);
          } else if (byte0 === 6) {
            // Training quest
            const trainingTypes = { 0: 'Strength', 1: 'Intelligence', 2: 'Wisdom', 3: 'Luck',
                                   4: 'Agility', 5: 'Vitality', 6: 'Endurance', 7: 'Dexterity' };
            lines2.push(`**Training:** ${trainingTypes[byte1] || `Stat ${byte1}`}`);
          }
          
          // Check if it's an expedition (byte2 = 0x05)
          if (byte2 === 5) {
            lines2.push(`**Mode:** Expedition`);
          }
          
          lines2.push(`**Status:** Active`);
        } else {
          lines2.push('**Status:** Idle (not on any quest)');
        }
        
        // Send second message as followUp with character limit guard
        const output2 = lines2.join('\n');
        if (output2.length > 1900) {
          await interaction.followUp(output2.slice(0, 1900) + '\n_...truncated_');
        } else {
          await interaction.followUp(output2);
        }
        
        // === PET INFO FOLLOW-UP (Third message) ===
        const ownerWallet = hero.owner?.id;
        
        if (ownerWallet) {
          try {
            const { fetchPetForHero } = await import('./pet-data.js');
            const { getAllExpeditions } = await import('./onchain-data.js');
            const { getWalletPowerUpStatus } = await import('./rapid-renewal-service.js');
            
            // Use the full hero ID for pet lookup (not normalizedId) since the PetCore contract uses full IDs
            const fullHeroId = hero.id || heroId;
            const [pet, powerUpStatus] = await Promise.all([
              fetchPetForHero(fullHeroId),
              getWalletPowerUpStatus(ownerWallet).catch(() => null)
            ]);
            
            const petLines = [];
            petLines.push('🐾 **Equipped Pet**');
            petLines.push('');
            
            if (pet) {
              const hasGF = powerUpStatus?.gravityFeeder?.active || false;
              const fedReason = pet.isFed 
                ? `Fed (${pet.hungryInHours}h remaining)` 
                : (hasGF ? 'Fed (Gravity Feeder)' : 'Hungry');
              
              const shinyText = pet.shiny ? '✨ Shiny' : 'Non-Shiny';
              petLines.push(`**Pet #${pet.id}** ${shinyText}`);
              petLines.push(`Variant: ${pet.variant || 'Normal'}`);
              petLines.push(`• Profession: ${pet.profession || pet.gatheringType}`);
              petLines.push(`• Stars: ${pet.stars || pet.bonusCount || 0}`);
              petLines.push(`• Rarity: ${pet.rarityName} | Element: ${pet.elementName}`);
              petLines.push(`• Season: ${pet.seasonName}`);
              petLines.push('');
              
              petLines.push('**Gathering Stats:**');
              petLines.push(`• Skill: ${pet.gatheringSkillName || pet.gatheringBonusName}`);
              if (pet.gatheringSkillDescription) {
                petLines.push(`• Description: ${pet.gatheringSkillDescription}`);
              }
              petLines.push(`• Bonus: +${pet.gatheringBonusScalar}%`);
              petLines.push(`• Bonus Rarity: ${pet.gatheringStarsDisplay || '⭐'} (${pet.gatheringStars || 1} stars)`);
              petLines.push('');
              
              petLines.push('**Combat Stats:**');
              petLines.push(`• Skill: ${pet.combatSkillName || pet.combatBonusName}`);
              if (pet.combatSkillDescription) {
                petLines.push(`• Description: ${pet.combatSkillDescription}`);
              }
              petLines.push(`• Bonus: +${pet.combatBonusScalar}%`);
              petLines.push(`• Bonus Rarity: ${pet.combatStarsDisplay || '⭐'} (${pet.combatStars || 1} stars)`);
              petLines.push('');
              
              petLines.push(`**Status:** ${fedReason}`);
            } else {
              petLines.push('*No pet equipped to this hero*');
            }
            
            await interaction.followUp(petLines.join('\n').slice(0, 1900));
            
            // === POWER-UPS FOLLOW-UP (Fourth message) ===
            const powerLines = [];
            powerLines.push('⚡ **Power-ups**');
            powerLines.push('');
            
            if (powerUpStatus) {
              const hasRR = powerUpStatus.rapidRenewal?.heroIds?.includes(hero.normalizedId) ||
                           powerUpStatus.rapidRenewal?.heroIds?.includes(Number(heroId)) || false;
              
              // Show all power-ups with status
              powerLines.push(`• Wild Unknown: ${powerUpStatus.wildUnknown?.active ? '✅' : '❌'}`);
              powerLines.push(`• Quick Study: ${powerUpStatus.quickStudy?.active ? '✅' : '❌'}`);
              powerLines.push(`• Rapid Renewal: ${hasRR ? '✅ (this hero)' : '❌'}`);
              powerLines.push(`• Gravity Feeder: ${powerUpStatus.gravityFeeder?.active ? '✅' : '❌'}`);
              powerLines.push(`• Premium Provisions: ${powerUpStatus.premiumProvisions?.active ? '✅' : '❌'}`);
              powerLines.push(`• Thrifty: ${powerUpStatus.thrifty?.active ? '✅' : '❌'}`);
              powerLines.push(`• Perpetual Potion: ${powerUpStatus.perpetualPotion?.active ? '✅' : '❌'}`);
              powerLines.push(`• Unscathed: ${powerUpStatus.unscathed?.active ? '✅' : '❌'}`);
              powerLines.push(`• Backstage Pass: ${powerUpStatus.backstagePass?.active ? '✅' : '❌'}`);
              powerLines.push(`• Master Merchant: ${powerUpStatus.masterMerchant?.active ? '✅' : '❌'}`);
            } else {
              powerLines.push('*Unable to fetch power-up status*');
            }
            
            await interaction.followUp(powerLines.join('\n').slice(0, 1900));
          } catch (petErr) {
            console.error('[debug-hero-genetics] Pet fetch error:', petErr.message);
          }
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
async function initializeEconomicSystem() {
  console.log('💰 Initializing pricing config...');
  await initializePricingConfig();
  
  // Seed hero classes for Level Racer
  console.log('🏁 Seeding Level Racer hero classes...');
  try {
    await seedHeroClasses();
    console.log('✅ Level Racer hero classes seeded');
    
    // Ensure each class has at least one open pool
    console.log('🏁 Ensuring Level Racer pools for all classes...');
    await ensurePoolsForAllClasses();
    console.log('✅ Level Racer pools initialized');
  } catch (err) {
    console.warn('⚠️ Level Racer initialization skipped:', err.message);
  }

  console.log('📡 Starting payment monitor (V2: Per-job fast scanner)...');
  await initializeExistingJobs();
  await startMonitoring();
  paymentMonitorStarted = true;
  console.log('✅ Economic system initialized');
}

// === Create Express App and HTTP Server ===
async function startAdminWebServer() {
  const app = express();
  app.use(express.json());
  
  // CORS for cross-origin frontend
  const allowedOrigins = [
    'https://hedgeledger.ai',
    'https://www.hedgeledger.ai',
    'https://9734175a-4359-4feb-bbd8-48688d3217dd-00-22lw70hk2l6gm.kirk.replit.dev'
  ];
  app.use(cors({
    origin: function(origin, callback) {
      // Allow requests with no origin (like mobile apps or curl)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: true
  }));

  // Request logging middleware - log ALL incoming requests
  app.use((req, res, next) => {
    console.log(`[HTTP] ${req.method} ${req.path}`);
    next();
  });

  // Health check endpoint - detailed startup diagnostics
  app.get('/health', (req, res) => {
    const health = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
      },
      env: {
        DISCORD_TOKEN: !!process.env.DISCORD_TOKEN,
        DISCORD_CLIENT_ID: !!process.env.DISCORD_CLIENT_ID,
        DISCORD_GUILD_ID: !!process.env.DISCORD_GUILD_ID,
        DISCORD_CLIENT_SECRET: !!process.env.DISCORD_CLIENT_SECRET,
        DATABASE_URL: !!process.env.DATABASE_URL,
        OPENAI_API_KEY: !!process.env.OPENAI_API_KEY,
        OAUTH_CALLBACK_URL: process.env.OAUTH_CALLBACK_URL || 'NOT SET',
        COOKIE_DOMAIN: process.env.COOKIE_DOMAIN || 'NOT SET',
      },
      services: {
        paymentMonitor: paymentMonitorStarted,
        poolCache: poolCacheInitialized,
        optimizationProcessor: optimizationProcessorStarted,
        snapshotJob: snapshotJobStarted,
      }
    };
    res.json(health);
  });

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
      const cookieParts = [`${name}=${encodeURIComponent(value)}`];
      if (options.httpOnly) cookieParts.push('HttpOnly');
      if (options.secure) cookieParts.push('Secure');
      if (options.sameSite) cookieParts.push(`SameSite=${options.sameSite}`);
      if (options.maxAge !== undefined) cookieParts.push(`Max-Age=${options.maxAge}`);
      if (options.domain) cookieParts.push(`Domain=${options.domain}`);
      // Always include Path - defaults to '/' for site-wide cookies
      cookieParts.push(`Path=${options.path || '/'}`);
      res.setHeader('Set-Cookie', cookieParts.join('; '));
    };

    next();
  });

  // Admin list
  const ADMIN_USER_IDS = ['426019696916168714']; // yepex

  // Admin middleware - database-backed sessions
  async function isAdmin(req, res, next) {
    try {
      // Check for OAuth bypass mode (for testing)
      if (isOAuthBypassEnabled()) {
        console.log('[AdminAuth] OAuth bypass enabled - granting admin access');
        req.user = {
          userId: 'bypass-admin',
          username: 'Bypass Admin',
          avatar: null,
        };
        return next();
      }

      const sessionToken = req.cookies.session_token;
      console.log(
        `[AdminAuth] Checking session. Cookie: ${
          sessionToken ? sessionToken.substring(0, 16) + '...' : 'NONE'
        }`
      );

      if (!sessionToken) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      // Fetch session from database
      const sessions = await db
        .select()
        .from(adminSessions)
        .where(eq(adminSessions.sessionToken, sessionToken));
      console.log(`[AdminAuth] Found ${sessions.length} session(s) in DB`);

      if (!sessions || sessions.length === 0) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const session = sessions[0];
      console.log(
        `[AdminAuth] Session found: discordId=${session.discordId}, expires=${session.expiresAt}`
      );

      // Check expiration
      if (new Date(session.expiresAt) < new Date()) {
        await db
          .delete(adminSessions)
          .where(eq(adminSessions.sessionToken, sessionToken));
        return res.status(401).json({ error: 'Session expired' });
      }

      console.log(
        `🔍 Admin check - userId: ${session.discordId}, admins: [${ADMIN_USER_IDS.join(
          ', '
        )}], match: ${ADMIN_USER_IDS.includes(session.discordId)}`
      );
      if (!ADMIN_USER_IDS.includes(session.discordId)) {
        return res
          .status(403)
          .json({ error: 'Access denied: Administrator only' });
      }

      req.user = {
        userId: session.discordId,
        username: session.username,
        avatar: session.avatar,
      };
      next();
    } catch (err) {
      console.error('❌ Admin middleware error:', err);
      res.status(500).json({ error: 'Authentication check failed' });
    }
  }

  // User authentication middleware (any logged-in user)
  async function isUser(req, res, next) {
    try {
      const sessionToken = req.cookies.session_token;
      
      if (!sessionToken) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      // Fetch session from database
      const sessions = await db
        .select()
        .from(adminSessions)
        .where(eq(adminSessions.sessionToken, sessionToken));

      if (!sessions || sessions.length === 0) {
        return res.status(401).json({ error: 'Not authenticated' });
      }

      const session = sessions[0];

      // Check expiration
      if (new Date(session.expiresAt) < new Date()) {
        await db
          .delete(adminSessions)
          .where(eq(adminSessions.sessionToken, sessionToken));
        return res.status(401).json({ error: 'Session expired' });
      }

      req.user = {
        userId: session.discordId,
        username: session.username,
        avatar: session.avatar,
      };
      next();
    } catch (err) {
      console.error('❌ User middleware error:', err);
      res.status(500).json({ error: 'Authentication check failed' });
    }
  }

  // Helper function to get wallets for a user with auto-backfill from legacy primaryWallet
  // Returns { wallets, clusterKey, wasBackfilled } to allow triggering ETL on first wallet link
  async function getWalletsForUser(discordId) {
    // 1) Find player by discordId
    const player = await db.select().from(players).where(eq(players.discordId, discordId)).limit(1);
    if (!player || player.length === 0) return { wallets: [], clusterKey: null, wasBackfilled: false };
    
    // 2) Resolve or create cluster for this user
    let cluster = await db.select().from(walletClusters).where(eq(walletClusters.userId, discordId)).limit(1);
    
    if (!cluster || cluster.length === 0) {
      const inserted = await db
        .insert(walletClusters)
        .values({
          userId: discordId,
          clusterKey: `cluster-${discordId}`,
        })
        .returning();
      cluster = inserted;
    }
    
    const clusterKey = cluster[0].clusterKey;
    
    // 3) Load existing ACTIVE wallet_links for this cluster
    let links = await db.select().from(walletLinks)
      .where(and(
        eq(walletLinks.clusterKey, clusterKey),
        eq(walletLinks.isActive, true)
      ));
    
    // 4) Auto-backfill from players.primaryWallet if no active links yet
    let wasBackfilled = false;
    if ((!links || links.length === 0) && player[0].primaryWallet) {
      // Normalize address to lowercase to avoid duplicates
      const normalizedAddress = player[0].primaryWallet.toLowerCase();
      const inserted = await db
        .insert(walletLinks)
        .values({
          clusterKey: clusterKey,
          chain: 'DFKCHAIN',
          address: normalizedAddress,
          isPrimary: true,
          isActive: true,
        })
        .returning();
      links = inserted;
      wasBackfilled = true;
      console.log(`[Wallets] Auto-backfilled wallet ${normalizedAddress} for user ${discordId}`);
    }
    
    // 5) Map to API shape
    const wallets = links.map((wl) => ({
      address: wl.address,
      chain: wl.chain,
      isPrimary: wl.isPrimary,
      isActive: wl.isActive,
      isVerified: wl.isVerified ?? false,
      verifiedAt: wl.verifiedAt ?? null,
      verificationTxHash: wl.verificationTxHash ?? null,
    }));
    
    return { wallets, clusterKey, wasBackfilled };
  }
  
  // Fire-and-forget ETL trigger for cluster (async, non-blocking)
  async function triggerEtlForCluster(clusterKey) {
    try {
      const { etlService } = await import('./src/etl/services/EtlService.js');
      console.log(`[ETL] Triggering async ETL run for cluster ${clusterKey}`);
      etlService.runForCluster(clusterKey).catch(err => {
        console.error(`[ETL] runForCluster failed for ${clusterKey}:`, err);
      });
    } catch (err) {
      console.error(`[ETL] Failed to import EtlService:`, err);
    }
  }

  // ============================================================================
  // USER WALLET API ROUTES
  // ============================================================================

  // GET /api/me/wallets - Get user's linked wallets with auto-backfill from legacy primaryWallet
  app.get('/api/me/wallets', isUser, async (req, res) => {
    try {
      const discordId = req.user.userId;
      console.log(`[API] GET /api/me/wallets for user ${discordId}`);
      const { wallets, clusterKey, wasBackfilled } = await getWalletsForUser(discordId);
      console.log(`[API] Returning ${wallets.length} wallet(s) for user ${discordId}:`, JSON.stringify(wallets));
      
      // If this was the first wallet link (via auto-backfill), trigger ETL in background
      if (wasBackfilled && clusterKey) {
        console.log(`[API] First wallet backfilled for ${discordId}, triggering ETL for cluster ${clusterKey}`);
        triggerEtlForCluster(clusterKey);
      }
      
      res.json({ wallets });
    } catch (error) {
      console.error('[API] Error fetching user wallets:', error);
      res.status(500).json({ error: 'Failed to fetch wallets' });
    }
  });

  // POST /api/me/wallets - Add a new wallet
  app.post('/api/me/wallets', isUser, async (req, res) => {
    try {
      const discordId = req.user.userId;
      const { address, chain = 'DFKCHAIN' } = req.body;
      
      if (!address || typeof address !== 'string') {
        return res.status(400).json({ error: 'Wallet address is required' });
      }
      
      // Normalize address
      const normalizedAddress = address.toLowerCase();
      
      // Validate address format (basic ETH-style address check)
      if (!/^0x[a-fA-F0-9]{40}$/.test(normalizedAddress)) {
        return res.status(400).json({ error: 'Invalid wallet address format' });
      }
      
      // Get or create cluster for user
      let cluster = await db.select().from(walletClusters).where(eq(walletClusters.userId, discordId)).limit(1);
      
      if (!cluster || cluster.length === 0) {
        const inserted = await db
          .insert(walletClusters)
          .values({
            userId: discordId,
            clusterKey: `cluster-${discordId}`,
          })
          .returning();
        cluster = inserted;
      }
      
      const clusterKey = cluster[0].clusterKey;
      
      // Check if wallet already exists
      const existing = await db.select().from(walletLinks)
        .where(and(
          eq(walletLinks.clusterKey, clusterKey),
          eq(walletLinks.address, normalizedAddress)
        )).limit(1);
      
      // Check how many ACTIVE wallets user already has
      const activeLinks = await db.select().from(walletLinks)
        .where(and(
          eq(walletLinks.clusterKey, clusterKey),
          eq(walletLinks.isActive, true)
        ));
      const shouldBePrimary = activeLinks.length === 0; // First active wallet is primary
      
      let inserted;
      
      if (existing && existing.length > 0) {
        // Wallet exists - check if it's inactive (soft-deleted)
        if (existing[0].isActive) {
          return res.status(409).json({ error: 'Wallet already linked' });
        }
        
        // Re-activate the soft-deleted wallet
        console.log(`[API] Re-activating soft-deleted wallet ${normalizedAddress} for user ${discordId}`);
        inserted = await db
          .update(walletLinks)
          .set({
            isActive: true,
            isPrimary: shouldBePrimary,
            chain,
          })
          .where(eq(walletLinks.id, existing[0].id))
          .returning();
      } else {
        // Insert new wallet
        inserted = await db
          .insert(walletLinks)
          .values({
            clusterKey,
            chain,
            address: normalizedAddress,
            isPrimary: shouldBePrimary,
            isActive: true,
          })
          .returning();
      }
      
      console.log(`[API] Added wallet ${normalizedAddress} for user ${discordId}`);
      
      // If this is the first active wallet for the cluster, trigger ETL in background
      if (shouldBePrimary) {
        console.log(`[API] First wallet added for ${discordId}, triggering ETL for cluster ${clusterKey}`);
        triggerEtlForCluster(clusterKey);
      }
      
      res.json({
        success: true,
        wallet: {
          address: inserted[0].address,
          chain: inserted[0].chain,
          isPrimary: inserted[0].isPrimary,
          isActive: inserted[0].isActive,
        },
      });
    } catch (error) {
      console.error('[API] Error adding wallet:', error);
      res.status(500).json({ error: 'Failed to add wallet' });
    }
  });

  // DELETE /api/me/wallets/:address - Soft-delete a wallet (safe delete with tier lock)
  app.delete('/api/me/wallets/:address', isUser, async (req, res) => {
    try {
      const discordId = req.user.userId;
      const { address } = req.params;
      
      if (!address) {
        return res.status(400).json({ error: 'Wallet address is required' });
      }
      
      const normalizedAddress = address.toLowerCase();
      console.log(`[API] DELETE /api/me/wallets/${normalizedAddress} for user ${discordId}`);
      
      // 1) Find player
      const player = await db.select().from(players).where(eq(players.discordId, discordId)).limit(1);
      if (!player || player.length === 0) {
        return res.status(404).json({ error: 'Player not found' });
      }
      
      // 2) Resolve cluster
      const cluster = await db.select().from(walletClusters).where(eq(walletClusters.userId, discordId)).limit(1);
      if (!cluster || cluster.length === 0) {
        return res.status(404).json({ error: 'No wallet cluster for this user' });
      }
      
      const clusterKey = cluster[0].clusterKey;
      
      // 3) Find the wallet_link row for this address
      const walletRows = await db.select().from(walletLinks)
        .where(and(
          eq(walletLinks.clusterKey, clusterKey),
          eq(walletLinks.address, normalizedAddress)
        )).limit(1);
      
      if (!walletRows || walletRows.length === 0) {
        return res.status(404).json({ error: 'Wallet not found' });
      }
      
      const wallet = walletRows[0];
      
      // Already inactive = not found
      if (!wallet.isActive) {
        return res.status(404).json({ error: 'Wallet not found' });
      }
      
      // 4) Prevent deleting verified wallets (tier lock protection)
      if (wallet.isVerified) {
        return res.status(400).json({
          error: 'Verified wallets cannot be removed. Contact support if needed.',
        });
      }
      
      // 5) Soft delete: deactivate this wallet
      await db
        .update(walletLinks)
        .set({ isActive: false, isPrimary: false })
        .where(eq(walletLinks.id, wallet.id));
      
      console.log(`[API] Soft-deleted wallet ${normalizedAddress} for user ${discordId}`);
      
      // 6) If it was primary, adjust players.primaryWallet and promote another wallet
      if (wallet.isPrimary) {
        // Find another active wallet to promote
        const otherActiveRows = await db.select().from(walletLinks)
          .where(and(
            eq(walletLinks.clusterKey, clusterKey),
            eq(walletLinks.isActive, true)
          )).limit(1);
        
        if (otherActiveRows && otherActiveRows.length > 0) {
          const otherActive = otherActiveRows[0];
          // Promote otherActive to primary
          await db
            .update(walletLinks)
            .set({ isPrimary: true })
            .where(eq(walletLinks.id, otherActive.id));
          
          await db
            .update(players)
            .set({ primaryWallet: otherActive.address })
            .where(eq(players.id, player[0].id));
          
          console.log(`[API] Promoted wallet ${otherActive.address} as new primary for user ${discordId}`);
        } else {
          // No active wallets left; clear primaryWallet
          await db
            .update(players)
            .set({ primaryWallet: null })
            .where(eq(players.id, player[0].id));
          
          console.log(`[API] No active wallets remain for user ${discordId}, cleared primaryWallet`);
        }
      }
      
      // 7) Return updated wallet list
      const remainingLinks = await db.select().from(walletLinks)
        .where(and(
          eq(walletLinks.clusterKey, clusterKey),
          eq(walletLinks.isActive, true)
        ));
      
      res.json({
        wallets: remainingLinks.map((wl) => ({
          address: wl.address,
          chain: wl.chain,
          isPrimary: wl.isPrimary,
          isActive: wl.isActive,
          isVerified: wl.isVerified ?? false,
          verifiedAt: wl.verifiedAt,
        })),
      });
    } catch (error) {
      console.error('[API] Error removing wallet:', error);
      res.status(500).json({ error: 'Failed to remove wallet' });
    }
  });

  // GET /api/debug/cluster - Debug endpoint to verify cluster/wallet/ETL state
  app.get('/api/debug/cluster', isUser, async (req, res) => {
    try {
      const discordId = req.user.userId;
      console.log(`[API] GET /api/debug/cluster for user ${discordId}`);
      
      // 1) Find player
      const player = await db.select().from(players).where(eq(players.discordId, discordId)).limit(1);
      if (!player || player.length === 0) {
        return res.status(404).json({ error: 'Player not found' });
      }
      
      // 2) Resolve cluster
      const cluster = await db.select().from(walletClusters).where(eq(walletClusters.userId, discordId)).limit(1);
      if (!cluster || cluster.length === 0) {
        return res.json({
          discordId,
          playerId: player[0].id,
          clusterKey: null,
          wallets: [],
          latestPowerSnapshots: [],
        });
      }
      
      const clusterKey = cluster[0].clusterKey;
      
      // 3) Load wallet links
      const links = await db.select().from(walletLinks).where(eq(walletLinks.clusterKey, clusterKey));
      
      // 4) Latest ETL power snapshots
      const snapshots = await db
        .select()
        .from(walletPowerSnapshots)
        .where(eq(walletPowerSnapshots.clusterKey, clusterKey))
        .orderBy(desc(walletPowerSnapshots.takenAt))
        .limit(3);
      
      res.json({
        discordId,
        playerId: player[0].id,
        clusterKey,
        wallets: links.map((wl) => ({
          address: wl.address,
          chain: wl.chain,
          isPrimary: wl.isPrimary,
          isActive: wl.isActive,
          isVerified: false,
          verifiedAt: null,
        })),
        latestPowerSnapshots: snapshots,
      });
    } catch (error) {
      console.error('[API] Error in debug/cluster:', error);
      res.status(500).json({ error: 'Failed to get cluster debug info' });
    }
  });

  // POST /api/debug/trigger-etl - Manually trigger ETL for testing
  app.post('/api/debug/trigger-etl', isUser, async (req, res) => {
    try {
      const discordId = req.user.userId;
      console.log(`[API] POST /api/debug/trigger-etl for user ${discordId}`);
      
      // Get cluster for user
      const cluster = await db.select().from(walletClusters).where(eq(walletClusters.userId, discordId)).limit(1);
      if (!cluster || cluster.length === 0) {
        return res.status(404).json({ error: 'No cluster found for user' });
      }
      
      const clusterKey = cluster[0].clusterKey;
      
      // Trigger ETL in background
      console.log(`[API] Manually triggering ETL for cluster ${clusterKey}`);
      triggerEtlForCluster(clusterKey);
      
      res.json({ 
        success: true, 
        message: `ETL triggered for cluster ${clusterKey}`,
        clusterKey 
      });
    } catch (error) {
      console.error('[API] Error triggering ETL:', error);
      res.status(500).json({ error: 'Failed to trigger ETL' });
    }
  });

  // Level Racer routes (no auth for public endpoints)
  app.use('/api/level-racer', levelRacerRoutes);

  // Public leaderboard routes (no auth required)
  app.use('/api/leaderboards', publicLeaderboardRoutes);

  // Leaderboard routes (admin only - auth handled in middleware below)
  app.use('/api/admin/leaderboards', isAdmin, leaderboardRoutes);

  // Season routes (admin only - auth handled in middleware below)
  app.use('/api/admin/seasons', isAdmin, seasonRoutes);

  // ============================================================================
  // HEDGE API ROUTES
  // Public and Admin APIs for combat codex and entitlements
  // ============================================================================
  
  // Public Combat API (rate-limited, requires public API key) - MUST be before generic /api/public
  app.use('/api/public/combat', hedgeCors, rateLimiter, requirePublicApiKey, publicCombatRouter);
  
  // Public API routes (rate-limited, requires public API key)
  const hedgePublicRouter = express.Router();
  registerHedgePublicRoutes(hedgePublicRouter);
  app.use('/api/public', hedgeCors, rateLimiter, requirePublicApiKey, hedgePublicRouter);
  
  // Admin API routes (requires admin API key)
  const hedgeAdminRouter = express.Router();
  registerHedgeAdminRoutes(hedgeAdminRouter);
  app.use('/api/hedge/admin', hedgeCors, requireAdminApiKey, hedgeAdminRouter);

  // Seed routes - admin only
  app.post('/api/admin/seeds/season-1', isAdmin, async (req, res) => {
    try {
      const { seedSeason1 } = await import('./src/etl/seeds/seedSeason1.ts');
      const result = await seedSeason1();
      res.json(result);
    } catch (error) {
      console.error('[API] Error seeding Season 1:', error);
      res.status(500).json({ error: 'Failed to seed Season 1', details: error.message });
    }
  });

  app.post('/api/admin/seeds/leaderboards', isAdmin, async (req, res) => {
    try {
      const { seedLeaderboards } = await import('./src/etl/seeds/seedLeaderboards.ts');
      const result = await seedLeaderboards();
      res.json(result);
    } catch (error) {
      console.error('[API] Error seeding leaderboards:', error);
      res.status(500).json({ error: 'Failed to seed leaderboards', details: error.message });
    }
  });

  app.post('/api/admin/seeds/all', isAdmin, async (req, res) => {
    try {
      const { seedSeason1 } = await import('./src/etl/seeds/seedSeason1.ts');
      const { seedLeaderboards } = await import('./src/etl/seeds/seedLeaderboards.ts');
      
      const season1Result = await seedSeason1();
      const leaderboardsResult = await seedLeaderboards();
      
      res.json({
        season1: season1Result,
        leaderboards: leaderboardsResult,
      });
    } catch (error) {
      console.error('[API] Error seeding all:', error);
      res.status(500).json({ error: 'Failed to seed all', details: error.message });
    }
  });

  // Debug endpoint - no auth required
  app.get('/api/admin/debug-status', async (req, res) => {
    try {
      const sessionToken = req.cookies.session_token;
      console.log(
        `[Debug] Session token from cookie: ${
          sessionToken ? sessionToken.substring(0, 16) + '...' : 'NONE'
        }`
      );

      const debug = {
        timestamp: new Date().toISOString(),
        hasCookie: !!sessionToken,
        cookiePreview: sessionToken
          ? sessionToken.substring(0, 32) + '...'
          : null,
        adminIds: ADMIN_USER_IDS,
        dbConnected: true,
      };

      if (sessionToken) {
        const sessions = await db
          .select()
          .from(adminSessions)
          .where(eq(adminSessions.sessionToken, sessionToken));
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
  });

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
          cjewel: balances.cjewel,
        },
      });
    } catch (err) {
      console.error('[API] Error fetching hedge wallet balance:', err);
      res.status(500).json({ error: 'Failed to fetch wallet balance' });
    }
  });

  // ============================================================================
  // COMBAT SYNC ROUTES
  // ============================================================================

  // GET /api/admin/hedge/combat/sync/summary - Combat codex sync summary
  app.get('/api/admin/hedge/combat/sync/summary', isAdmin, async (req, res) => {
    try {
      const [keywordCount] = await db.select({ count: sql`count(*)::int` }).from(combatKeywords);
      const [classCount] = await db.select({ count: sql`count(*)::int` }).from(combatClassMeta);
      const [skillCount] = await db.select({ count: sql`count(*)::int` }).from(combatSkills);

      const lastSuccessResults = await db.select({
        id: syncRuns.id,
        started_at: syncRuns.startedAt,
        finished_at: syncRuns.finishedAt,
        discovered_urls: syncRuns.discoveredUrls,
        classes_ingested: syncRuns.classesIngested,
        skills_upserted: syncRuns.skillsUpserted,
      })
        .from(syncRuns)
        .where(and(eq(syncRuns.domain, 'combat_codex'), eq(syncRuns.status, 'success')))
        .orderBy(desc(syncRuns.startedAt))
        .limit(1);

      const lastRunResults = await db.select({
        id: syncRuns.id,
        started_at: syncRuns.startedAt,
        finished_at: syncRuns.finishedAt,
        status: syncRuns.status,
        error: syncRuns.error,
      })
        .from(syncRuns)
        .where(eq(syncRuns.domain, 'combat_codex'))
        .orderBy(desc(syncRuns.startedAt))
        .limit(1);

      const runningRunResults = await db.select({
        id: syncRuns.id,
        started_at: syncRuns.startedAt,
      })
        .from(syncRuns)
        .where(and(eq(syncRuns.domain, 'combat_codex'), eq(syncRuns.status, 'running')))
        .orderBy(desc(syncRuns.startedAt))
        .limit(1);

      res.json({
        ok: true,
        counts: {
          keywords: keywordCount?.count ?? 0,
          classes: classCount?.count ?? 0,
          skills: skillCount?.count ?? 0,
        },
        lastSuccess: lastSuccessResults[0] ?? null,
        lastRun: lastRunResults[0] ?? null,
        runningRun: runningRunResults[0] ?? null,
      });
    } catch (error) {
      console.error('[HedgeProxy] Error fetching sync summary:', error);
      res.status(500).json({ ok: false, error: error?.message ?? String(error) });
    }
  });

  // GET /api/admin/hedge/combat/sync/runs - List sync runs
  app.get('/api/admin/hedge/combat/sync/runs', isAdmin, async (req, res) => {
    try {
      const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 25)));

      const runs = await db.select({
        id: syncRuns.id,
        domain: syncRuns.domain,
        startedAt: syncRuns.startedAt,
        finishedAt: syncRuns.finishedAt,
        status: syncRuns.status,
        discoveredUrls: syncRuns.discoveredUrls,
        keywordsUpserted: syncRuns.keywordsUpserted,
        classesAttempted: syncRuns.classesAttempted,
        classesIngested: syncRuns.classesIngested,
        skillsUpserted: syncRuns.skillsUpserted,
        ragDocsUpserted: syncRuns.ragDocsUpserted,
        error: syncRuns.error,
      })
        .from(syncRuns)
        .where(eq(syncRuns.domain, 'combat_codex'))
        .orderBy(desc(syncRuns.startedAt))
        .limit(limit);

      res.json({ ok: true, count: runs.length, results: runs });
    } catch (error) {
      console.error('[HedgeProxy] Error fetching sync runs:', error);
      res.status(500).json({ ok: false, error: error?.message ?? String(error) });
    }
  });

  // GET /api/admin/hedge/combat/sync/runs/:id - Get run detail
  app.get('/api/admin/hedge/combat/sync/runs/:id', isAdmin, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id)) {
        return res.status(400).json({ ok: false, error: 'Invalid id' });
      }

      const [run] = await db.select()
        .from(syncRuns)
        .where(and(eq(syncRuns.id, id), eq(syncRuns.domain, 'combat_codex')));

      if (!run) {
        return res.status(404).json({ ok: false, error: 'Run not found' });
      }

      const items = await db.select()
        .from(syncRunItems)
        .where(eq(syncRunItems.syncRunId, id));

      res.json({ ok: true, run, items });
    } catch (error) {
      console.error('[HedgeProxy] Error fetching run detail:', error);
      res.status(500).json({ ok: false, error: error?.message ?? String(error) });
    }
  });

  // GET /api/admin/hedge/combat/sources - List combat sources
  app.get('/api/admin/hedge/combat/sources', isAdmin, async (req, res) => {
    try {
      const sources = await db.select().from(combatSources).orderBy(combatSources.kind, combatSources.url);
      res.json({ ok: true, results: sources });
    } catch (error) {
      console.error('[HedgeProxy] Error fetching sources:', error);
      res.status(500).json({ ok: false, error: error?.message ?? String(error) });
    }
  });

  // PATCH /api/admin/hedge/combat/sources - Toggle source enabled
  app.patch('/api/admin/hedge/combat/sources', isAdmin, async (req, res) => {
    try {
      const { url, enabled } = req.body;
      if (typeof url !== 'string' || typeof enabled !== 'boolean') {
        return res.status(400).json({ ok: false, error: 'Invalid request body' });
      }

      const [updated] = await db.update(combatSources)
        .set({ enabled })
        .where(eq(combatSources.url, url))
        .returning();

      if (!updated) {
        return res.status(404).json({ ok: false, error: 'Source not found' });
      }

      res.json({ ok: true, source: updated });
    } catch (error) {
      console.error('[HedgeProxy] Error updating source:', error);
      res.status(500).json({ ok: false, error: error?.message ?? String(error) });
    }
  });

  // POST /api/admin/hedge/combat/refresh - Trigger combat codex sync
  app.post('/api/admin/hedge/combat/refresh', isAdmin, async (req, res) => {
    try {
      const { discover = true, concurrency = 3 } = req.body || {};
      const { ingestCombatCodex } = await import('./src/dfk/combatCodexIngestor.js');
      const result = await ingestCombatCodex({ discover, concurrency });
      res.json({ ok: true, ...result });
    } catch (error) {
      console.error('[HedgeProxy] Error refreshing combat codex:', error);
      res.status(500).json({ ok: false, error: error?.message ?? String(error) });
    }
  });

  // GET /api/admin/hedge/combat/classes-summary - Get all classes with skills for class summary page
  app.get('/api/admin/hedge/combat/classes-summary', isAdmin, async (req, res) => {
    try {
      const classes = await db.select().from(combatClassMeta).orderBy(combatClassMeta.class);
      
      const skills = await db.select({
        class: combatSkills.class,
        tier: combatSkills.tier,
        ability: combatSkills.ability,
        discipline: combatSkills.discipline,
        descriptionRaw: combatSkills.descriptionRaw,
        range: combatSkills.range,
        manaCost: combatSkills.manaCost,
        tags: combatSkills.tags,
      }).from(combatSkills).orderBy(combatSkills.class, combatSkills.tier, combatSkills.ability);
      
      const skillCounts = await db.select({
        class: combatSkills.class,
        count: sql`count(*)::int`.as('count'),
      }).from(combatSkills).groupBy(combatSkills.class);
      
      const countMap = {};
      for (const sc of skillCounts) {
        countMap[sc.class] = sc.count;
      }
      
      const skillsByClass = {};
      for (const skill of skills) {
        if (!skillsByClass[skill.class]) skillsByClass[skill.class] = [];
        skillsByClass[skill.class].push(skill);
      }
      
      const enrichedClasses = classes.map(c => ({
        ...c,
        skillCount: countMap[c.class] || 0,
        skills: skillsByClass[c.class] || [],
      }));
      
      res.json({ ok: true, classes: enrichedClasses });
    } catch (error) {
      console.error('[HedgeProxy] Error fetching classes summary:', error);
      res.status(500).json({ ok: false, error: error?.message ?? String(error) });
    }
  });

  // PATCH /api/admin/hedge/combat/classes/:className/validate - Toggle class validation status
  app.patch('/api/admin/hedge/combat/classes/:className/validate', isAdmin, async (req, res) => {
    try {
      const { className } = req.params;
      const { validated } = req.body;
      
      if (typeof validated !== 'boolean') {
        return res.status(400).json({ ok: false, error: 'validated must be a boolean' });
      }
      
      const [updated] = await db.update(combatClassMeta)
        .set({ validated })
        .where(eq(combatClassMeta.class, className))
        .returning();
      
      if (!updated) {
        return res.status(404).json({ ok: false, error: 'Class not found' });
      }
      
      res.json({ ok: true, class: updated });
    } catch (error) {
      console.error('[HedgeProxy] Error updating class validation:', error);
      res.status(500).json({ ok: false, error: error?.message ?? String(error) });
    }
  });

  // /api/admin/users – lightweight list for admin Users table (no live on-chain calls)
  // /api/admin/users/:userId/profile – detailed admin view for a single player
  // /api/user/summary/:discordId – user-facing summary used by UserDashboard (admin impersonation for now)
  // /api/user/settings/:discordId – per-user Hedge settings (admin-only for now)

  // GET /api/admin/users - Fast paginated list using cached dfkSnapshot only
  app.get("/api/admin/users", isAdmin, async (req, res) => {
    try {
      const page = Math.max(parseInt(req.query.page) || 1, 1);
      const pageSize = Math.min(Math.max(parseInt(req.query.pageSize) || 25, 1), 100);
      const offset = (page - 1) * pageSize;

      // Total count
      const countResult = await db
        .select({ count: sql`count(*)`.mapWith(Number) })
        .from(players);
      const count = countResult[0]?.count || 0;

      // Page of players
      const playerRows = await db
        .select()
        .from(players)
        .orderBy(desc(players.firstSeenAt))
        .limit(pageSize)
        .offset(offset);

      const users = playerRows.map((player) => {
        let profileData = null;
        try {
          if (player.profileData) {
            profileData =
              typeof player.profileData === "string"
                ? JSON.parse(player.profileData)
                : player.profileData;
          }
        } catch (err) {
          console.warn(
            `[API] Failed to parse profileData for player ${player.id}:`,
            err.message
          );
        }

        const tierNum =
          typeof profileData?.tier === "string"
            ? parseInt(profileData.tier, 10)
            : profileData?.tier || 0;

        return {
          id: player.id,
          discordId: player.discordId,
          discordUsername: player.discordUsername,
          walletAddress: player.primaryWallet,
          archetype: profileData?.archetype || "GUEST",
          intentArchetype: profileData?.intentArchetype || null,
          intentScores: profileData?.intentScores || null,
          tier: tierNum,
          state: profileData?.state || "CURIOUS",
          behaviorTags: profileData?.behaviorTags || [],
          kpis: profileData?.kpis || {},
          dfkSnapshot: profileData?.dfkSnapshot || null,
          flags: profileData?.flags || {},
        };
      });

      res.json({
        success: true,
        users,
        page,
        pageSize,
        total: count,
        totalPages: Math.ceil(count / pageSize),
      });
    } catch (err) {
      console.error("❌ Error fetching users:", err);
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  // POST /api/admin/users/:id/refresh-snapshot - On-demand snapshot refresh for a single user
  // This is the foundation for charging 1 CRYSTAL / JEWEL later.
  app.post("/api/admin/users/:id/refresh-snapshot", isAdmin, async (req, res) => {
    try {
      const { id } = req.params;

      const playerRows = await db
        .select()
        .from(players)
        .where(eq(players.id, parseInt(id, 10)))
        .limit(1);

      if (!playerRows || playerRows.length === 0) {
        return res.status(404).json({ error: "User not found" });
      }

      const player = playerRows[0];

      if (!player.primaryWallet) {
        return res
          .status(400)
          .json({ error: "Player has no primary wallet configured" });
      }

      const wallet = player.primaryWallet.toLowerCase();

      // TODO: hook into your payment system here.
      // Example: create a depositRequest for 1 CRYSTAL and verify tx before allowing this.
      // For now, we just run it for free.

      console.log(`[API] Refreshing snapshot for user ${player.id} / ${wallet}`);
      const snapshot = await (await import("./snapshot-service.js")).buildPlayerSnapshot(wallet);

      let profileData = {};
      try {
        if (player.profileData) {
          profileData =
            typeof player.profileData === "string"
              ? JSON.parse(player.profileData)
              : player.profileData;
        }
      } catch (err) {
        console.warn(
          `[API] Failed to parse profileData for player ${player.id}:`,
          err.message
        );
        profileData = {};
      }

      profileData.dfkSnapshot = snapshot;
      profileData.dfkSnapshotUpdatedAt = snapshot.updatedAt;

      await db
        .update(players)
        .set({ profileData: JSON.stringify(profileData) })
        .where(eq(players.id, player.id));

      res.json({ success: true, snapshot });
    } catch (err) {
      console.error("❌ Error refreshing snapshot:", err);
      res.status(500).json({ error: "Failed to refresh snapshot" });
    }
  });

  // POST /api/admin/users/:id/reclassify - Trigger intent classification for a user
  app.post("/api/admin/users/:id/reclassify", isAdmin, async (req, res) => {
    try {
      const { id } = req.params;

      const playerRows = await db
        .select()
        .from(players)
        .where(eq(players.id, parseInt(id, 10)))
        .limit(1);

      if (!playerRows || playerRows.length === 0) {
        return res.status(404).json({ error: "User not found" });
      }

      const player = playerRows[0];
      const discordId = player.discordId;

      console.log(`[API] Reclassifying user ${player.id} / ${discordId}`);
      
      // Use forceReclassify from player-profile-service
      const reclassifiedProfile = await forceReclassify(discordId);

      res.json({ 
        success: true, 
        intentArchetype: reclassifiedProfile.intentArchetype,
        intentScores: reclassifiedProfile.intentScores,
        archetype: reclassifiedProfile.archetype,
        tier: reclassifiedProfile.tier,
        state: reclassifiedProfile.state
      });
    } catch (err) {
      console.error("❌ Error reclassifying user:", err);
      res.status(500).json({ error: "Failed to reclassify user" });
    }
  });

  // PATCH /api/admin/users/:id/tier - Update user tier
  app.patch('/api/admin/users/:id/tier', isAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { tier } = req.body;

      if (typeof tier !== 'number' || tier < 0 || tier > 4) {
        return res
          .status(400)
          .json({ error: 'Tier must be a number between 0-4' });
      }

      const player = await db
        .select()
        .from(players)
        .where(eq(players.id, parseInt(id)));

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
        profile: updatedProfile,
      });
    } catch (err) {
      console.error('❌ Error updating tier:', err);
      res.status(500).json({ error: 'Failed to update tier' });
    }
  });

  app.get('/api/user/summary/:discordId', isAdmin, async (req, res) => {
    try {
      const { discordId } = req.params;

      const playerRows = await db
        .select()
        .from(players)
        .where(eq(players.discordId, discordId))
        .limit(1);

      if (!playerRows || playerRows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      const player = playerRows[0];

      // Fetch all linked wallets using the shared helper (includes auto-backfill logic)
      const { wallets: linkedWallets } = await getWalletsForUser(discordId);

      let profileData = null;
      try {
        if (player.profileData) {
          profileData =
            typeof player.profileData === 'string'
              ? JSON.parse(player.profileData)
              : player.profileData;
        }
      } catch (err) {
        console.warn(`[API] Failed to parse profileData for player ${player.id}:`, err.message);
      }

      const tierNum =
        typeof profileData?.tier === 'string'
          ? parseInt(profileData.tier, 10)
          : profileData?.tier || 0;

      const latestSnapshot = await db
        .select()
        .from(walletSnapshots)
        .where(eq(walletSnapshots.playerId, player.id))
        .orderBy(desc(walletSnapshots.asOfDate))
        .limit(1);

      const walletSnapshot = latestSnapshot?.[0] || null;

      const dfkSnapshot = profileData?.dfkSnapshot ? { ...profileData.dfkSnapshot } : {};

      // Only use walletSnapshot as fallback when dfkSnapshot doesn't have balance data
      if (walletSnapshot) {
        if (dfkSnapshot.jewelBalance === undefined) {
          dfkSnapshot.jewelBalance = parseFloat(walletSnapshot.jewelBalance || '0');
        }
        if (dfkSnapshot.crystalBalance === undefined) {
          dfkSnapshot.crystalBalance = parseFloat(walletSnapshot.crystalBalance || '0');
        }
        if (dfkSnapshot.cJewelBalance === undefined) {
          dfkSnapshot.cJewelBalance = parseFloat(walletSnapshot.cJewelBalance || '0');
        }
      }

      if (player.firstDfkTxTimestamp) {
        const firstTx = new Date(player.firstDfkTxTimestamp);
        const ageDays = Math.floor((Date.now() - firstTx.getTime()) / (1000 * 60 * 60 * 24));
        dfkSnapshot.dfkAgeDays = ageDays;
        dfkSnapshot.firstTxAt = firstTx.toISOString();
      }

      // Fetch cJEWEL lock time in real-time (changes daily)
      if (player.primaryWallet) {
        try {
          const lockInfo = await fetchCJewelLockTime(player.primaryWallet);
          if (lockInfo) {
            dfkSnapshot.cJewelLockDaysRemaining = lockInfo.lockDaysRemaining;
          }
        } catch (err) {
          console.warn(`[API] Failed to fetch cJEWEL lock time:`, err.message);
        }
      }

      const recentOptimizations = await db
        .select()
        .from(gardenOptimizations)
        .where(eq(gardenOptimizations.playerId, player.id))
        .orderBy(desc(gardenOptimizations.createdAt))
        .limit(5);

      const optimizations = recentOptimizations.map((opt) => {
        const poolCount = Array.isArray(opt.lpSnapshot?.pools)
          ? opt.lpSnapshot.pools.length
          : Array.isArray(opt.lpSnapshot?.positions)
          ? opt.lpSnapshot.positions.length
          : undefined;

        return {
          id: opt.id,
          createdAt: opt.createdAt || opt.requestedAt,
          status: opt.status,
          service: opt.reportPayload?.service || opt.reportPayload?.serviceName || 'garden_optimization',
          paymentJewel: parseFloat(opt.expectedAmountJewel || '0'),
          poolCount,
        };
      });

      const settingsRows = await db
        .select()
        .from(userSettings)
        .where(eq(userSettings.playerId, player.id))
        .limit(1);

      const settings = settingsRows[0] || null;

      const userSettingsData = {
        notifyOnAprDrop: settings?.notifyOnAprDrop ?? false,
        notifyOnNewOptimization: settings?.notifyOnNewOptimization ?? true,
      };

      // Fetch bridge activity for this user's wallet
      let bridgeActivity = null;
      if (player.primaryWallet) {
        try {
          const bridgeSummary = await getBridgeSummary(player.primaryWallet);
          if (bridgeSummary) {
            bridgeActivity = {
              totalBridgedInUsd: parseFloat(bridgeSummary.totalBridgedInUsd || '0'),
              totalBridgedOutUsd: parseFloat(bridgeSummary.totalBridgedOutUsd || '0'),
              netExtractedUsd: parseFloat(bridgeSummary.netExtractedUsd || '0'),
              heroesIn: bridgeSummary.heroesIn || 0,
              heroesOut: bridgeSummary.heroesOut || 0,
              extractorScore: parseFloat(bridgeSummary.extractorScore || '0'),
              extractorFlags: bridgeSummary.extractorFlags || [],
              lastBridgeAt: bridgeSummary.lastBridgeAt,
            };
          }
        } catch (err) {
          console.warn(`[API] Failed to fetch bridge summary for ${player.primaryWallet}:`, err.message);
        }
      }

      const timestamps = [
        player.updatedAt ? new Date(player.updatedAt).getTime() : null,
        walletSnapshot?.asOfDate ? new Date(walletSnapshot.asOfDate).getTime() : null,
        profileData?.dfkSnapshot?.updatedAt ? new Date(profileData.dfkSnapshot.updatedAt).getTime() : null,
      ].filter((t) => t !== null);

      const lastUpdatedAt = timestamps.length > 0 ? new Date(Math.max(...timestamps)).toISOString() : null;

      const snapshotPayload = Object.keys(dfkSnapshot).length > 0 ? dfkSnapshot : null;

      res.json({
        success: true,
        user: {
          id: player.id,
          discordId: player.discordId,
          discordUsername: player.discordUsername,
          walletAddress: player.primaryWallet,
          linkedWallets,
          tier: tierNum,
          archetype: profileData?.archetype || 'GUEST',
          intentArchetype: profileData?.intentArchetype || null,
          intentScores: profileData?.intentScores || null,
          state: profileData?.state || 'CURIOUS',
          flags: profileData?.flags || {},
          behaviorTags: profileData?.behaviorTags || [],
          dfkSnapshot: snapshotPayload,
          recentOptimizations: optimizations,
          userSettings: userSettingsData,
          bridgeActivity,
          lastUpdatedAt,
        },
      });
    } catch (err) {
      console.error('[API] Error building user summary:', err);
      res.status(500).json({ error: 'Failed to load user summary' });
    }
  });

  app.patch('/api/user/settings/:discordId', isAdmin, async (req, res) => {
    try {
      const { discordId } = req.params;
      const { notifyOnAprDrop, notifyOnNewOptimization } = req.body || {};

      const updates = {};

      if (typeof notifyOnAprDrop !== 'undefined') {
        if (typeof notifyOnAprDrop !== 'boolean') {
          return res.status(400).json({ error: 'notifyOnAprDrop must be a boolean' });
        }
        updates.notifyOnAprDrop = notifyOnAprDrop;
      }

      if (typeof notifyOnNewOptimization !== 'undefined') {
        if (typeof notifyOnNewOptimization !== 'boolean') {
          return res.status(400).json({ error: 'notifyOnNewOptimization must be a boolean' });
        }
        updates.notifyOnNewOptimization = notifyOnNewOptimization;
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ error: 'No valid settings provided' });
      }

      const playerRows = await db
        .select()
        .from(players)
        .where(eq(players.discordId, discordId))
        .limit(1);

      if (!playerRows || playerRows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      const player = playerRows[0];

      const existing = await db
        .select()
        .from(userSettings)
        .where(eq(userSettings.playerId, player.id))
        .limit(1);

      const nextSettings = {
        notifyOnAprDrop: updates.notifyOnAprDrop ?? existing[0]?.notifyOnAprDrop ?? false,
        notifyOnNewOptimization: updates.notifyOnNewOptimization ?? existing[0]?.notifyOnNewOptimization ?? true,
      };

      let saved;

      if (existing.length > 0) {
        [saved] = await db
          .update(userSettings)
          .set({
            ...nextSettings,
            updatedAt: new Date(),
          })
          .where(eq(userSettings.playerId, player.id))
          .returning();
      } else {
        [saved] = await db
          .insert(userSettings)
          .values({
            playerId: player.id,
            ...nextSettings,
          })
          .returning();
      }

      res.json({
        success: true,
        userSettings: {
          notifyOnAprDrop: saved.notifyOnAprDrop,
          notifyOnNewOptimization: saved.notifyOnNewOptimization,
        },
      });
    } catch (err) {
      console.error('[API] Error updating user settings:', err);
      res.status(500).json({ error: 'Failed to update user settings' });
    }
  });

  // POST /api/user/:discordId/expire-optimizations - Mark all processing optimizations as expired
  app.post('/api/user/:discordId/expire-optimizations', isAdmin, async (req, res) => {
    try {
      const { discordId } = req.params;

      const playerRows = await db
        .select()
        .from(players)
        .where(eq(players.discordId, discordId))
        .limit(1);

      if (!playerRows || playerRows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      const player = playerRows[0];

      // Update all PROCESSING or PENDING optimizations to EXPIRED
      const result = await db
        .update(gardenOptimizations)
        .set({ status: 'EXPIRED' })
        .where(
          and(
            eq(gardenOptimizations.playerId, player.id),
            sql`${gardenOptimizations.status} IN ('PROCESSING', 'PENDING', 'processing', 'pending')`
          )
        );

      console.log(`[API] Marked optimizations as EXPIRED for player ${player.id}`);

      res.json({
        success: true,
        message: 'All processing optimizations marked as expired',
      });
    } catch (err) {
      console.error('[API] Error expiring optimizations:', err);
      res.status(500).json({ error: 'Failed to expire optimizations' });
    }
  });

  // GET /api/admin/lp-positions/:wallet - Fetch LP positions for a wallet
  app.get('/api/admin/lp-positions/:wallet', isAdmin, async (req, res) => {
    try {
      const { wallet } = req.params;

      if (!wallet || !/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
        return res.status(400).json({ error: 'Invalid wallet address' });
      }

      console.log(`[API] Fetching LP positions for wallet: ${wallet}`);
      const { detectWalletLPPositions } = await import('./wallet-lp-detector.js');
      const positions = await detectWalletLPPositions(wallet);

      res.json({
        success: true,
        wallet,
        positions: positions || [],
        totalPositions: positions?.length || 0,
        totalValue: (positions || [])
          .reduce((sum, p) => sum + parseFloat(p.userTVL || '0'), 0)
          .toFixed(2),
      });
    } catch (error) {
      console.error('[API] Error fetching LP positions:', error);
      res.status(500).json({ error: 'Failed to fetch LP positions' });
    }
  });

  // GET /api/admin/debug-settings - Get debug settings
  app.get('/api/admin/debug-settings', async (req, res) => {
    try {
      const settings = getDebugSettings();
      res.json({
        ...settings,
        oauthBypassAllowed: isOAuthBypassAllowed(),
      });
    } catch (error) {
      console.error('[API] Error fetching debug settings:', error);
      res.status(500).json({ error: 'Failed to fetch debug settings' });
    }
  });

  // POST /api/admin/debug-settings - Update debug settings
  // Security: Only allow changes from localhost or authenticated admins
  app.post('/api/admin/debug-settings', async (req, res) => {
    try {
      // Check if request is from localhost
      const clientIP = req.ip || req.connection?.remoteAddress || '';
      const isLocalhost = ['127.0.0.1', '::1', '::ffff:127.0.0.1', 'localhost'].some(
        local => clientIP.includes(local)
      );
      
      // Check if user is authenticated admin
      const isAuthenticated = req.session?.user?.isAdmin === true;
      
      // Require either localhost or authenticated admin
      if (!isLocalhost && !isAuthenticated) {
        return res.status(403).json({ 
          error: 'Debug settings can only be modified from localhost or by authenticated admins' 
        });
      }
      
      const { paymentBypass, verboseLogging, oauthBypass } = req.body;

      const partial = {};

      if (typeof paymentBypass !== 'undefined') {
        if (typeof paymentBypass !== 'boolean') {
          return res.status(400).json({ error: 'paymentBypass must be a boolean' });
        }
        partial.paymentBypass = paymentBypass;
      }

      if (typeof verboseLogging !== 'undefined') {
        if (typeof verboseLogging !== 'boolean') {
          return res.status(400).json({ error: 'verboseLogging must be a boolean' });
        }
        partial.verboseLogging = verboseLogging;
      }

      if (typeof oauthBypass !== 'undefined') {
        if (typeof oauthBypass !== 'boolean') {
          return res.status(400).json({ error: 'oauthBypass must be a boolean' });
        }
        // Only allow oauthBypass to be set if ALLOW_OAUTH_BYPASS env var is set
        if (!isOAuthBypassAllowed()) {
          return res.status(403).json({ error: 'OAuth bypass is not allowed in this environment' });
        }
        partial.oauthBypass = oauthBypass;
      }

      if (Object.keys(partial).length === 0) {
        return res.status(400).json({ error: 'No valid debug settings provided' });
      }

      setDebugSettings(partial);

      res.json({ success: true, settings: getDebugSettings() });
    } catch (error) {
      console.error('[API] Error updating debug settings:', error);
      res.status(500).json({ error: 'Failed to update debug settings' });
    }
  });

  // GET /api/admin/environment - Get current environment info
  app.get('/api/admin/environment', async (req, res) => {
    try {
      res.json({
        environment: getEnvironmentName(),
        isProduction: isProduction(),
        autoStartIndexers: isProduction(),
      });
    } catch (error) {
      console.error('[API] Error fetching environment:', error);
      res.status(500).json({ error: 'Failed to fetch environment info' });
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
          .filter((f) => f.startsWith('Start_application_'))
          .sort()
          .reverse()
          .slice(0, 3);

        for (const logFile of workflowLogs) {
          const logPath = path.join(logDir, logFile);
          const content = await readFile(logPath, 'utf-8');
          const lines = content.split('\n');

          for (const line of lines) {
            if (
              line.match(
                /❌|ERROR|Error:|Failed|Exception|CRITICAL|WARNING/i
              )
            ) {
              errors.push({
                timestamp: new Date().toISOString(),
                message: line.trim(),
                file: logFile,
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
        errors: recentErrors,
      });
    } catch (error) {
      console.error('[Debug] Error fetching recent errors:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // ============================================
  // Bridge Analytics API Routes
  // ============================================
  let bridgeIndexerRunning = false;

  // GET /api/admin/bridge/overview - Bridge analytics overview
  app.get('/api/admin/bridge/overview', isAdmin, async (req, res) => {
    try {
      const [eventStats, metricsStats, latestBlock] = await Promise.all([
        db.select({
          totalEvents: sql`COUNT(*)`,
          inEvents: sql`SUM(CASE WHEN direction = 'in' THEN 1 ELSE 0 END)`,
          outEvents: sql`SUM(CASE WHEN direction = 'out' THEN 1 ELSE 0 END)`,
          heroEvents: sql`SUM(CASE WHEN bridge_type = 'hero' THEN 1 ELSE 0 END)`,
          itemEvents: sql`SUM(CASE WHEN bridge_type = 'item' THEN 1 ELSE 0 END)`,
          totalUsdIn: sql`COALESCE(SUM(CASE WHEN direction = 'in' THEN CAST(usd_value AS DECIMAL) ELSE 0 END), 0)`,
          totalUsdOut: sql`COALESCE(SUM(CASE WHEN direction = 'out' THEN CAST(usd_value AS DECIMAL) ELSE 0 END), 0)`
        }).from(bridgeEvents),
        
        db.select({
          trackedWallets: sql`COUNT(*)`,
          totalExtracted: sql`COALESCE(SUM(CASE WHEN CAST(net_extracted_usd AS DECIMAL) > 0 THEN CAST(net_extracted_usd AS DECIMAL) ELSE 0 END), 0)`,
          extractors: sql`SUM(CASE WHEN CAST(net_extracted_usd AS DECIMAL) > 100 THEN 1 ELSE 0 END)`
        }).from(walletBridgeMetrics),
        
        getBridgeLatestBlock().catch(() => 0)
      ]);

      res.json({
        events: {
          total: parseInt(eventStats[0]?.totalEvents) || 0,
          in: parseInt(eventStats[0]?.inEvents) || 0,
          out: parseInt(eventStats[0]?.outEvents) || 0,
          heroes: parseInt(eventStats[0]?.heroEvents) || 0,
          items: parseInt(eventStats[0]?.itemEvents) || 0,
          totalUsdIn: parseFloat(eventStats[0]?.totalUsdIn) || 0,
          totalUsdOut: parseFloat(eventStats[0]?.totalUsdOut) || 0
        },
        metrics: {
          trackedWallets: parseInt(metricsStats[0]?.trackedWallets) || 0,
          totalExtracted: parseFloat(metricsStats[0]?.totalExtracted) || 0,
          extractorCount: parseInt(metricsStats[0]?.extractors) || 0
        },
        chain: {
          latestBlock
        }
      });
    } catch (error) {
      console.error('[API] Error fetching bridge overview:', error);
      res.status(500).json({ error: 'Failed to fetch bridge overview' });
    }
  });

  // GET /api/admin/bridge/extractors - Get top extractors
  app.get('/api/admin/bridge/extractors', isAdmin, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 50;
      const extractors = await getTopExtractors(limit);
      res.json(extractors);
    } catch (error) {
      console.error('[API] Error fetching extractors:', error);
      res.status(500).json({ error: 'Failed to fetch extractors' });
    }
  });

  // GET /api/admin/bridge/events - Recent bridge events
  app.get('/api/admin/bridge/events', isAdmin, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 100;
      const events = await db.select()
        .from(bridgeEvents)
        .orderBy(desc(bridgeEvents.blockTimestamp))
        .limit(limit);
      res.json(events);
    } catch (error) {
      console.error('[API] Error fetching bridge events:', error);
      res.status(500).json({ error: 'Failed to fetch bridge events' });
    }
  });

  // GET /api/admin/bridge/wallet/:wallet - Wallet bridge details
  app.get('/api/admin/bridge/wallet/:wallet', isAdmin, async (req, res) => {
    try {
      const { wallet } = req.params;
      const [summary, events] = await Promise.all([
        getBridgeSummary(wallet),
        db.select()
          .from(bridgeEvents)
          .where(eq(bridgeEvents.wallet, wallet.toLowerCase()))
          .orderBy(desc(bridgeEvents.blockTimestamp))
          .limit(100)
      ]);
      res.json({ summary, events });
    } catch (error) {
      console.error('[API] Error fetching wallet bridge data:', error);
      res.status(500).json({ error: 'Failed to fetch wallet bridge data' });
    }
  });

  // POST /api/admin/bridge/index-wallet - Index a specific wallet
  app.post('/api/admin/bridge/index-wallet', isAdmin, async (req, res) => {
    try {
      const { wallet } = req.body;
      if (!wallet) {
        return res.status(400).json({ error: 'Wallet address required' });
      }
      const result = await indexBridgeWallet(wallet);
      res.json({ success: true, result });
    } catch (error) {
      console.error('[API] Error indexing wallet:', error);
      res.status(500).json({ error: 'Failed to index wallet' });
    }
  });

  // POST /api/admin/bridge/run-indexer - Run full bridge indexer
  app.post('/api/admin/bridge/run-indexer', isAdmin, async (req, res) => {
    console.log('[API] === RUN-INDEXER ENDPOINT HIT ===');
    console.log('[API] bridgeIndexerRunning:', bridgeIndexerRunning);
    console.log('[API] runBridgeFullIndex type:', typeof runBridgeFullIndex);
    
    try {
      if (bridgeIndexerRunning) {
        console.log('[API] Indexer already running, returning 409');
        return res.status(409).json({ error: 'Indexer already running' });
      }

      bridgeIndexerRunning = true;
      console.log('[API] Set bridgeIndexerRunning=true, sending response...');
      res.json({ success: true, message: 'Started indexing last 100k blocks' });
      console.log('[API] Response sent, now calling runBridgeFullIndex...');

      // Run in background
      runBridgeFullIndex({ verbose: true })
        .then(result => {
          console.log('[API] Bridge indexer completed:', result);
          bridgeIndexerRunning = false;
        })
        .catch(err => {
          console.error('[API] Bridge indexer failed:', err);
          console.error('[API] Bridge indexer error stack:', err?.stack);
          bridgeIndexerRunning = false;
        });
    } catch (error) {
      bridgeIndexerRunning = false;
      console.error('[API] Error starting bridge indexer:', error);
      console.error('[API] Error stack:', error?.stack);
      res.status(500).json({ error: 'Failed to start indexer' });
    }
  });

  // GET /api/admin/bridge/indexer-status - Check if indexer is running
  app.get('/api/admin/bridge/indexer-status', isAdmin, async (req, res) => {
    res.json({ running: bridgeIndexerRunning });
  });

  // POST /api/admin/bridge/refresh-metrics - Refresh all wallet metrics
  app.post('/api/admin/bridge/refresh-metrics', isAdmin, async (req, res) => {
    try {
      await refreshAllMetrics();
      res.json({ success: true });
    } catch (error) {
      console.error('[API] Error refreshing metrics:', error);
      res.status(500).json({ error: 'Failed to refresh metrics' });
    }
  });

  // GET /api/admin/bridge/prices - Get current token prices
  app.get('/api/admin/bridge/prices', isAdmin, async (req, res) => {
    try {
      const prices = await fetchBridgePrices();
      res.json(prices);
    } catch (error) {
      console.error('[API] Error fetching prices:', error);
      res.status(500).json({ error: 'Failed to fetch prices' });
    }
  });

  // GET /api/admin/bridge/value-breakdown - Get DFK Chain value distribution
  app.get('/api/admin/bridge/value-breakdown', isAdmin, async (req, res) => {
    try {
      console.log('[API] Fetching DFK Chain value breakdown...');
      const breakdown = await getValueBreakdown();
      console.log('[API] Value breakdown complete, total:', breakdown.summary.totalValueUSD);
      res.json(breakdown);
    } catch (error) {
      console.error('[API] Error fetching value breakdown:', error);
      res.status(500).json({ error: 'Failed to fetch value breakdown' });
    }
  });

  // GET /api/admin/bridge/cex-liquidity - Get CEX order book liquidity for JEWEL
  app.get('/api/admin/bridge/cex-liquidity', isAdmin, async (req, res) => {
    try {
      let bandPercent = parseInt(req.query.band) || 2;
      // Validate band is reasonable (1-10%)
      if (isNaN(bandPercent) || bandPercent < 1 || bandPercent > 10) {
        bandPercent = 2;
      }
      console.log(`[API] Fetching CEX liquidity (±${bandPercent}% depth band)...`);
      const liquidity = await getCexLiquidity(bandPercent);
      console.log(`[API] CEX liquidity complete, total: $${liquidity.totalLiquidityUSD.toFixed(2)}`);
      res.json(liquidity);
    } catch (error) {
      console.error('[API] Error fetching CEX liquidity:', error);
      res.status(500).json({ error: 'Failed to fetch CEX liquidity' });
    }
  });

  // ============================================================================
  // TOKEN REGISTRY ENDPOINTS
  // ============================================================================

  // GET /api/admin/tokens - List all tokens in registry
  app.get('/api/admin/tokens', isAdmin, async (req, res) => {
    try {
      const tokens = await getAllTokens();
      res.json({ tokens, count: tokens.length });
    } catch (error) {
      console.error('[API] Error fetching tokens:', error);
      res.status(500).json({ error: 'Failed to fetch tokens' });
    }
  });

  // POST /api/admin/tokens/sync - Sync tokens from RouteScan
  app.post('/api/admin/tokens/sync', isAdmin, async (req, res) => {
    try {
      const fullSync = req.body?.fullSync === true;
      console.log(`[API] Starting token sync (fullSync: ${fullSync})...`);
      const result = await syncTokenRegistry(fullSync);
      res.json({ success: true, ...result });
    } catch (error) {
      console.error('[API] Error syncing tokens:', error);
      res.status(500).json({ error: 'Failed to sync tokens' });
    }
  });

  // GET /api/admin/tokens/map - Get address -> symbol mapping
  app.get('/api/admin/tokens/map', isAdmin, async (req, res) => {
    try {
      const map = await getTokenAddressMap();
      res.json(map);
    } catch (error) {
      console.error('[API] Error fetching token map:', error);
      res.status(500).json({ error: 'Failed to fetch token map' });
    }
  });

  // =====================================================
  // PUBLIC PVE DROP RATE API (no auth required)
  // =====================================================
  
  // GET /api/pve/status - Get PVE indexer status for both chains
  app.get("/api/pve/status", async (req, res) => {
    try {
      const status = await getPVEIndexerStatus();
      res.json({ ok: true, ...status });
    } catch (error) {
      console.error('[PVE API] Error fetching status:', error);
      res.status(500).json({ ok: false, error: error?.message ?? String(error) });
    }
  });

  // GET /api/pve/hunts - Get all hunt activities with drop stats
  app.get("/api/pve/hunts", async (req, res) => {
    try {
      const activities = await db.execute(sql`
        SELECT a.*, 
          (SELECT COUNT(*) FROM pve_completions c WHERE c.activity_id = a.id) as total_completions,
          (SELECT COUNT(*) FROM pve_reward_events r WHERE r.activity_id = a.id) as total_rewards
        FROM pve_activities a
        WHERE a.activity_type = 'hunt'
        ORDER BY a.activity_id
      `);
      res.json({ ok: true, hunts: activities });
    } catch (error) {
      console.error('[PVE API] Error fetching hunts:', error);
      res.status(500).json({ ok: false, error: error?.message ?? String(error) });
    }
  });

  // GET /api/pve/patrols - Get all patrol activities with drop stats
  app.get("/api/pve/patrols", async (req, res) => {
    try {
      const activities = await db.execute(sql`
        SELECT a.*, 
          (SELECT COUNT(*) FROM pve_completions c WHERE c.activity_id = a.id) as total_completions,
          (SELECT COUNT(*) FROM pve_reward_events r WHERE r.activity_id = a.id) as total_rewards
        FROM pve_activities a
        WHERE a.activity_type = 'patrol'
        ORDER BY a.activity_id
      `);
      res.json({ ok: true, patrols: activities });
    } catch (error) {
      console.error('[PVE API] Error fetching patrols:', error);
      res.status(500).json({ ok: false, error: error?.message ?? String(error) });
    }
  });

  // GET /api/pve/loot/:activityId - Get loot drops for a specific activity
  app.get("/api/pve/loot/:activityId", async (req, res) => {
    try {
      const { activityId } = req.params;
      const loot = await db.execute(sql`
        SELECT 
          l.id as item_id,
          l.item_address,
          l.name as item_name,
          l.item_type,
          l.rarity,
          COUNT(r.id) as drop_count,
          AVG(r.party_luck) as avg_party_luck,
          (SELECT COUNT(*) FROM pve_completions c WHERE c.activity_id = ${parseInt(activityId)}) as total_completions,
          CASE 
            WHEN (SELECT COUNT(*) FROM pve_completions c WHERE c.activity_id = ${parseInt(activityId)}) > 0 
            THEN COUNT(r.id)::decimal / (SELECT COUNT(*) FROM pve_completions c WHERE c.activity_id = ${parseInt(activityId)})
            ELSE 0 
          END as observed_rate
        FROM pve_reward_events r
        JOIN pve_loot_items l ON r.item_id = l.id
        WHERE r.activity_id = ${parseInt(activityId)}
        GROUP BY l.id, l.item_address, l.name, l.item_type, l.rarity
        ORDER BY drop_count DESC
      `);
      res.json({ ok: true, activityId: parseInt(activityId), loot: loot });
    } catch (error) {
      console.error('[PVE API] Error fetching loot:', error);
      res.status(500).json({ ok: false, error: error?.message ?? String(error) });
    }
  });

  // GET /api/pve/loot-hierarchical/:activityId - Get hierarchical loot with equipment variants
  app.get("/api/pve/loot-hierarchical/:activityId", async (req, res) => {
    try {
      const { activityId } = req.params;
      const activityIdInt = parseInt(activityId);
      
      // Get total completions for this activity
      const completionsResult = await db.execute(sql`
        SELECT COUNT(*) as count FROM pve_completions WHERE activity_id = ${activityIdInt}
      `);
      const totalCompletions = parseInt(completionsResult[0]?.count || 0);
      
      // Get non-equipment loot (consumables, materials, currency) - excludes seasonal
      // Include items where is_equipment is FALSE/NULL, OR where item_type is explicitly NOT 'equipment'
      // Explicitly exclude seasonal items (they go in their own section)
      const regularLoot = await db.execute(sql`
        SELECT 
          l.id as item_id,
          l.item_address,
          l.name as item_name,
          l.item_type,
          l.rarity,
          COUNT(r.id) as drop_count,
          AVG(r.party_luck) as avg_party_luck,
          FALSE as is_equipment
        FROM pve_reward_events r
        JOIN pve_loot_items l ON r.item_id = l.id
        WHERE r.activity_id = ${activityIdInt} 
          AND (
            (r.is_equipment IS NULL OR r.is_equipment = FALSE)
            OR l.item_type IN ('consumable', 'currency', 'material', 'rune')
          )
          AND (l.item_type IS NULL OR l.item_type != 'seasonal')
        GROUP BY l.id, l.item_address, l.name, l.item_type, l.rarity
        ORDER BY drop_count DESC
      `);
      
      // Get seasonal event drops separately
      const seasonalLootQuery = await db.execute(sql`
        SELECT 
          l.id as item_id,
          l.item_address,
          l.name as item_name,
          l.item_type,
          l.rarity,
          COUNT(r.id) as drop_count,
          AVG(r.party_luck) as avg_party_luck,
          FALSE as is_equipment
        FROM pve_reward_events r
        JOIN pve_loot_items l ON r.item_id = l.id
        WHERE r.activity_id = ${activityIdInt} 
          AND l.item_type = 'seasonal'
        GROUP BY l.id, l.item_address, l.name, l.item_type, l.rarity
        ORDER BY drop_count DESC
      `);
      
      // Get equipment parent categories (grouped by item_address/contract)
      // Only include items where is_equipment = TRUE AND item_type is 'equipment' or NULL (unknown contracts)
      const equipmentParents = await db.execute(sql`
        SELECT 
          l.id as item_id,
          l.item_address,
          l.name as item_name,
          l.item_type,
          COUNT(DISTINCT r.id) as drop_count,
          COUNT(DISTINCT r.display_id) as variant_count,
          TRUE as is_equipment
        FROM pve_reward_events r
        JOIN pve_loot_items l ON r.item_id = l.id
        WHERE r.activity_id = ${activityIdInt} 
          AND r.is_equipment = TRUE
          AND (l.item_type = 'equipment' OR l.item_type IS NULL)
        GROUP BY l.id, l.item_address, l.name, l.item_type
        ORDER BY drop_count DESC
      `);
      
      // Get equipment variants (grouped by display_id + rarity_tier)
      const equipmentVariants = await db.execute(sql`
        SELECT 
          l.id as item_id,
          l.item_address,
          r.display_id,
          r.rarity_tier,
          r.equipment_type,
          COUNT(r.id) as drop_count,
          AVG(r.party_luck) as avg_party_luck
        FROM pve_reward_events r
        JOIN pve_loot_items l ON r.item_id = l.id
        WHERE r.activity_id = ${activityIdInt} 
          AND r.is_equipment = TRUE
          AND (l.item_type = 'equipment' OR l.item_type IS NULL)
        GROUP BY l.id, l.item_address, r.display_id, r.rarity_tier, r.equipment_type
        ORDER BY l.item_address, r.rarity_tier DESC, drop_count DESC
      `);
      
      // Map rarity tiers to names
      const rarityNames = ['Common', 'Uncommon', 'Rare', 'Legendary', 'Mythic'];
      const equipmentTypeNames = { 0: 'Weapon', 1: 'Armor', 2: 'Shield', 3: 'Accessory' };
      
      // Build hierarchical structure
      const hierarchicalEquipment = equipmentParents.map(parent => {
        const variants = equipmentVariants
          .filter(v => v.item_address === parent.item_address)
          .map(v => ({
            displayId: v.display_id,
            rarityTier: v.rarity_tier,
            rarityName: rarityNames[v.rarity_tier] || 'Unknown',
            equipmentType: v.equipment_type,
            equipmentTypeName: equipmentTypeNames[v.equipment_type] || 'Unknown',
            dropCount: parseInt(v.drop_count),
            observedRate: totalCompletions > 0 ? parseInt(v.drop_count) / totalCompletions : 0,
            avgPartyLuck: parseFloat(v.avg_party_luck) || 0,
          }));
        
        // Compute aggregate avgPartyLuck from variants
        const totalVariantDrops = variants.reduce((sum, v) => sum + v.dropCount, 0);
        const avgPartyLuck = totalVariantDrops > 0 
          ? variants.reduce((sum, v) => sum + (v.avgPartyLuck * v.dropCount), 0) / totalVariantDrops
          : 0;
        
        return {
          ...parent,
          dropCount: parseInt(parent.drop_count),
          variantCount: parseInt(parent.variant_count),
          observedRate: totalCompletions > 0 ? parseInt(parent.drop_count) / totalCompletions : 0,
          avgPartyLuck,
          variants,
          // Stats summary
          rarityDistribution: variants.reduce((acc, v) => {
            acc[v.rarityName] = (acc[v.rarityName] || 0) + v.dropCount;
            return acc;
          }, {}),
        };
      });
      
      // Format regular loot with total completions for sample size display
      const formattedRegularLoot = regularLoot.map(item => ({
        ...item,
        dropCount: parseInt(item.drop_count),
        totalCompletions,
        observedRate: totalCompletions > 0 ? parseInt(item.drop_count) / totalCompletions : 0,
        avgPartyLuck: parseFloat(item.avg_party_luck) || 0,
      }));
      
      // Format seasonal loot
      const formattedSeasonalLoot = seasonalLootQuery.map(item => ({
        ...item,
        dropCount: parseInt(item.drop_count),
        totalCompletions,
        observedRate: totalCompletions > 0 ? parseInt(item.drop_count) / totalCompletions : 0,
        avgPartyLuck: parseFloat(item.avg_party_luck) || 0,
      }));
      
      res.json({
        ok: true,
        activityId: activityIdInt,
        totalCompletions,
        regularLoot: formattedRegularLoot,
        seasonalLoot: formattedSeasonalLoot,
        equipment: hierarchicalEquipment,
      });
    } catch (error) {
      console.error('[PVE API] Error fetching hierarchical loot:', error);
      res.status(500).json({ ok: false, error: error?.message ?? String(error) });
    }
  });

  // GET /api/pve/estimate - Estimate drop rate for an item
  app.get("/api/pve/estimate", async (req, res) => {
    try {
      const { activityId, itemId, petBonusTier } = req.query;
      if (!activityId || !itemId) {
        return res.status(400).json({ ok: false, error: 'activityId and itemId required' });
      }
      
      const stats = await calculateDropStats(
        parseInt(activityId), 
        parseInt(itemId), 
        petBonusTier !== undefined ? parseInt(petBonusTier) : null
      );
      
      if (!stats) {
        return res.status(404).json({ ok: false, error: 'Not enough data for estimation' });
      }
      
      res.json({ ok: true, ...stats });
    } catch (error) {
      console.error('[PVE API] Error estimating drop rate:', error);
      res.status(500).json({ ok: false, error: error?.message ?? String(error) });
    }
  });

  // =====================================================
  // ADMIN PVE INDEXER CONTROL
  // =====================================================

  // GET /api/admin/pve/status - Get detailed PVE indexer status (admin)
  app.get("/api/admin/pve/status", isAdmin, async (req, res) => {
    try {
      const status = await getPVEIndexerStatus();
      const liveProgress = getPVEIndexerLiveProgress();
      res.json({ ok: true, ...status, liveProgress });
    } catch (error) {
      console.error('[PVE Admin] Error fetching status:', error);
      res.status(500).json({ ok: false, error: error?.message ?? String(error) });
    }
  });

  // GET /api/admin/pve/items - Debug endpoint to review item classifications
  app.get("/api/admin/pve/items", isAdmin, async (req, res) => {
    try {
      // Get all loot items with their classification and drop counts
      const items = await db.execute(sql`
        SELECT 
          l.id,
          l.item_address,
          l.name,
          l.item_type,
          l.rarity,
          l.chain_id,
          COUNT(r.id) as total_drops,
          SUM(CASE WHEN r.is_equipment = TRUE THEN 1 ELSE 0 END) as equipment_drops,
          SUM(CASE WHEN r.is_equipment IS NULL OR r.is_equipment = FALSE THEN 1 ELSE 0 END) as regular_drops
        FROM pve_loot_items l
        LEFT JOIN pve_reward_events r ON l.id = r.item_id
        GROUP BY l.id, l.item_address, l.name, l.item_type, l.rarity, l.chain_id
        ORDER BY total_drops DESC
      `);
      
      // Flag misclassified items (items with is_equipment=TRUE but item_type not 'equipment')
      const flagged = items.filter(item => {
        const eqDrops = parseInt(item.equipment_drops) || 0;
        const isNonEquipmentType = item.item_type && item.item_type !== 'equipment';
        return eqDrops > 0 && isNonEquipmentType;
      });
      
      res.json({
        ok: true,
        totalItems: items.length,
        flaggedCount: flagged.length,
        flagged: flagged.map(f => ({
          id: f.id,
          address: f.item_address,
          name: f.name,
          item_type: f.item_type,
          equipment_drops: parseInt(f.equipment_drops),
          regular_drops: parseInt(f.regular_drops),
          issue: `Item type '${f.item_type}' but has ${f.equipment_drops} equipment events`
        })),
        allItems: items.map(i => ({
          id: i.id,
          address: i.item_address,
          name: i.name,
          item_type: i.item_type,
          chain_id: i.chain_id,
          total_drops: parseInt(i.total_drops),
          equipment_drops: parseInt(i.equipment_drops),
          regular_drops: parseInt(i.regular_drops)
        }))
      });
    } catch (error) {
      console.error('[PVE Admin] Error fetching items:', error);
      res.status(500).json({ ok: false, error: error?.message ?? String(error) });
    }
  });

  // POST /api/admin/pve/run/:chain - Trigger a single indexer batch
  app.post("/api/admin/pve/run/:chain", isAdmin, async (req, res) => {
    try {
      const { chain } = req.params;
      if (chain !== 'dfk' && chain !== 'metis') {
        return res.status(400).json({ ok: false, error: 'chain must be dfk or metis' });
      }
      const result = await runPVEIndexerBatch(chain);
      res.json({ ok: true, ...result });
    } catch (error) {
      console.error('[PVE Admin] Error running batch:', error);
      res.status(500).json({ ok: false, error: error?.message ?? String(error) });
    }
  });

  // POST /api/admin/pve/start/:chain - Start auto-run for a chain
  app.post("/api/admin/pve/start/:chain", isAdmin, async (req, res) => {
    try {
      const { chain } = req.params;
      if (chain !== 'dfk' && chain !== 'metis') {
        return res.status(400).json({ ok: false, error: 'chain must be dfk or metis' });
      }
      const result = startPVEIndexerAutoRun(chain);
      res.json({ ok: true, ...result });
    } catch (error) {
      console.error('[PVE Admin] Error starting auto-run:', error);
      res.status(500).json({ ok: false, error: error?.message ?? String(error) });
    }
  });

  // POST /api/admin/pve/stop/:chain - Stop auto-run for a chain
  app.post("/api/admin/pve/stop/:chain", isAdmin, async (req, res) => {
    try {
      const { chain } = req.params;
      if (chain !== 'dfk' && chain !== 'metis') {
        return res.status(400).json({ ok: false, error: 'chain must be dfk or metis' });
      }
      const result = stopPVEIndexerAutoRun(chain);
      res.json({ ok: true, ...result });
    } catch (error) {
      console.error('[PVE Admin] Error stopping auto-run:', error);
      res.status(500).json({ ok: false, error: error?.message ?? String(error) });
    }
  });

  // POST /api/admin/pve/reset/:chain - Reset indexer to a specific block
  app.post("/api/admin/pve/reset/:chain", isAdmin, async (req, res) => {
    try {
      const { chain } = req.params;
      const { toBlock } = req.body;
      if (chain !== 'dfk' && chain !== 'metis') {
        return res.status(400).json({ ok: false, error: 'chain must be dfk or metis' });
      }
      if (typeof toBlock !== 'number') {
        return res.status(400).json({ ok: false, error: 'toBlock must be a number' });
      }
      const result = await resetPVEIndexer(chain, toBlock);
      res.json({ ok: true, ...result });
    } catch (error) {
      console.error('[PVE Admin] Error resetting indexer:', error);
      res.status(500).json({ ok: false, error: error?.message ?? String(error) });
    }
  });

  // POST /api/admin/pve/backfill-names - Backfill known item names
  app.post("/api/admin/pve/backfill-names", isAdmin, async (req, res) => {
    try {
      const result = await backfillItemNames();
      res.json({ ok: true, ...result });
    } catch (error) {
      console.error('[PVE Admin] Error backfilling names:', error);
      res.status(500).json({ ok: false, error: error?.message ?? String(error) });
    }
  });

  // POST /api/admin/pve/start-workers/:chain - Start parallel workers for fast historical indexing
  app.post("/api/admin/pve/start-workers/:chain", isAdmin, async (req, res) => {
    try {
      const { chain } = req.params;
      if (chain !== 'dfk' && chain !== 'metis') {
        return res.status(400).json({ ok: false, error: 'chain must be dfk or metis' });
      }
      const result = await startPVEWorkersAutoRun(chain);
      res.json({ ok: true, ...result });
    } catch (error) {
      console.error('[PVE Admin] Error starting workers:', error);
      res.status(500).json({ ok: false, error: error?.message ?? String(error) });
    }
  });

  // POST /api/admin/pve/stop-workers/:chain - Stop parallel workers
  app.post("/api/admin/pve/stop-workers/:chain", isAdmin, async (req, res) => {
    try {
      const { chain } = req.params;
      if (chain !== 'dfk' && chain !== 'metis') {
        return res.status(400).json({ ok: false, error: 'chain must be dfk or metis' });
      }
      const result = stopPVEWorkersAutoRun(chain);
      res.json({ ok: true, ...result });
    } catch (error) {
      console.error('[PVE Admin] Error stopping workers:', error);
      res.status(500).json({ ok: false, error: error?.message ?? String(error) });
    }
  });

  // GET /api/admin/bridge/sync-progress - Get historical sync progress
  app.get('/api/admin/bridge/sync-progress', isAdmin, async (req, res) => {
    try {
      const progress = await getIndexerProgress();
      const latestBlock = await getBridgeLatestBlock();
      const unpricedCount = await getUnpricedEventCount();
      
      res.json({
        progress: progress || { status: 'not_started', lastIndexedBlock: 0 },
        latestBlock,
        unpricedCount,
        historicalSyncRunning: isHistoricalSyncRunning(),
        enrichmentRunning: isEnrichmentRunning(),
      });
    } catch (error) {
      console.error('[API] Error getting sync progress:', error);
      res.status(500).json({ error: 'Failed to get sync progress' });
    }
  });

  // POST /api/admin/bridge/start-historical-sync - Start full historical sync from genesis
  app.post('/api/admin/bridge/start-historical-sync', isAdmin, async (req, res) => {
    if (isHistoricalSyncRunning()) {
      return res.status(409).json({ error: 'Historical sync already running' });
    }

    res.json({ message: 'Historical sync started. This will index from genesis and may take hours.' });

    runHistoricalSync({ verbose: true })
      .then((result) => {
        console.log('[API] Historical sync completed:', result);
      })
      .catch((err) => {
        console.error('[API] Historical sync error:', err);
      });
  });

  // POST /api/admin/bridge/stop-historical-sync - Stop historical sync
  app.post('/api/admin/bridge/stop-historical-sync', isAdmin, async (req, res) => {
    if (!isHistoricalSyncRunning()) {
      return res.status(400).json({ error: 'No historical sync running' });
    }
    abortHistoricalSync();
    res.json({ message: 'Historical sync stop requested' });
  });

  // POST /api/admin/bridge/run-incremental-batch - Index next 10K blocks
  app.post('/api/admin/bridge/run-incremental-batch', isAdmin, async (req, res) => {
    if (isIncrementalBatchRunning()) {
      return res.status(409).json({ error: 'Incremental batch already running' });
    }

    try {
      const result = await runIncrementalBatch();
      res.json(result);
    } catch (error) {
      console.error('[API] Incremental batch error:', error);
      res.status(500).json({ error: 'Failed to run incremental batch', details: error.message });
    }
  });

  // GET /api/admin/bridge/batch-progress - Get live progress of current batch
  app.get('/api/admin/bridge/batch-progress', isAdmin, async (req, res) => {
    try {
      const progress = getCurrentBatchProgress();
      res.json(progress);
    } catch (error) {
      console.error('[API] Batch progress error:', error);
      res.status(500).json({ error: 'Failed to get batch progress', details: error.message });
    }
  });

  // POST /api/admin/bridge/run-price-enrichment - Enrich events with USD prices
  app.post('/api/admin/bridge/run-price-enrichment', isAdmin, async (req, res) => {
    if (isEnrichmentRunning()) {
      return res.status(409).json({ error: 'Price enrichment already running' });
    }

    res.json({ message: 'Price enrichment started. This may take a while due to API rate limits.' });

    runPriceEnrichment({ verbose: true })
      .then((result) => {
        console.log('[API] Price enrichment completed:', result);
      })
      .catch((err) => {
        console.error('[API] Price enrichment error:', err);
      });
  });

  // GET /api/admin/bridge/price-enrichment/status - Get parallel price enrichment status
  app.get('/api/admin/bridge/price-enrichment/status', isAdmin, async (req, res) => {
    try {
      const unpricedCount = await getUnpricedEventCount();
      const status = getParallelEnrichmentStatus();
      res.json({
        ...status,
        unpricedCount,
      });
    } catch (error) {
      console.error('[API] Error getting price enrichment status:', error);
      res.status(500).json({ error: 'Failed to get status', details: error.message });
    }
  });

  // POST /api/admin/bridge/price-enrichment/start - Start parallel price enrichment
  app.post('/api/admin/bridge/price-enrichment/start', isAdmin, async (req, res) => {
    try {
      // Check if already running
      if (isParallelEnrichmentRunning()) {
        const status = getParallelEnrichmentStatus();
        return res.status(409).json({ 
          error: 'Already running', 
          status: 'already_running',
          ...status 
        });
      }
      
      const workersTotal = parseInt(req.body?.workers) || 8;
      
      const result = await runParallelPriceEnrichment({
        workersTotal,
        verbose: true,
      });
      
      res.json({
        success: result.status === 'started',
        ...result,
      });
    } catch (error) {
      console.error('[API] Error starting parallel price enrichment:', error);
      res.status(500).json({ error: 'Failed to start', details: error.message });
    }
  });

  // POST /api/admin/bridge/price-enrichment/stop - Stop parallel price enrichment
  app.post('/api/admin/bridge/price-enrichment/stop', isAdmin, async (req, res) => {
    try {
      const wasRunning = isParallelEnrichmentRunning();
      const stopped = stopParallelEnrichment();
      const status = getParallelEnrichmentStatus();
      
      res.json({ 
        success: stopped, 
        wasRunning,
        message: stopped ? 'Stopping workers...' : 'Not running',
        ...status,
      });
    } catch (error) {
      console.error('[API] Error stopping price enrichment:', error);
      res.status(500).json({ error: 'Failed to stop' });
    }
  });

  // ============================================================================
  // PARALLEL BRIDGE SYNC API (In-process workers)
  // ============================================================================
  
  // Track running in-process parallel workers
  const parallelSyncState = {
    running: false,
    workersTotal: 0,
    workers: new Map(),
    startedAt: null,
  };

  // GET /api/admin/bridge/parallel-sync/status - Get parallel sync status
  app.get('/api/admin/bridge/parallel-sync/status', isAdmin, async (req, res) => {
    try {
      const latestBlock = await getBridgeLatestBlock();
      const mainProgress = await getIndexerProgress('bridge_sync');
      
      // Get all worker progress if parallel sync has been run
      const workerProgress = parallelSyncState.workersTotal > 0 
        ? await getAllWorkerProgress(parallelSyncState.workersTotal)
        : [];
      
      // Calculate combined progress from worker ranges
      let totalBlocksProcessed = 0;
      let totalBlocksToProcess = 0;
      let allComplete = workerProgress.length > 0;
      
      for (const worker of workerProgress) {
        // Use the stored genesis block as the worker's range start
        const workerStart = worker.genesisBlock || 0;
        const blocksPerWorker = Math.ceil(latestBlock / (parallelSyncState.workersTotal || workerProgress.length || 1));
        const workerEnd = Math.min(workerStart + blocksPerWorker, latestBlock);
        
        const workerTotal = workerEnd - workerStart;
        const processed = Math.max(0, worker.lastIndexedBlock - workerStart);
        
        totalBlocksToProcess += workerTotal;
        totalBlocksProcessed += Math.min(processed, workerTotal);
        
        if (worker.status !== 'complete' && worker.lastIndexedBlock < workerEnd) {
          allComplete = false;
        }
      }
      
      const combinedProgress = totalBlocksToProcess > 0 
        ? Math.round((totalBlocksProcessed / totalBlocksToProcess) * 100) 
        : 0;
      
      res.json({
        running: parallelSyncState.running,
        workersTotal: parallelSyncState.workersTotal,
        startedAt: parallelSyncState.startedAt,
        latestBlock,
        mainIndexer: mainProgress ? {
          lastIndexedBlock: mainProgress.lastIndexedBlock,
          totalEventsIndexed: mainProgress.totalEventsIndexed,
          status: mainProgress.status,
        } : null,
        workers: workerProgress.map(w => {
          const workerStart = w.genesisBlock || 0;
          const blocksPerWorker = Math.ceil(latestBlock / (parallelSyncState.workersTotal || workerProgress.length || 1));
          const workerEnd = Math.min(workerStart + blocksPerWorker, latestBlock);
          const workerProgressPct = Math.max(0, Math.min(100, ((w.lastIndexedBlock - workerStart) / (workerEnd - workerStart)) * 100));
          
          return {
            workerId: w.workerId,
            lastIndexedBlock: w.lastIndexedBlock,
            rangeStart: workerStart,
            rangeEnd: workerEnd,
            progress: Math.round(workerProgressPct),
            totalEventsIndexed: w.totalEventsIndexed,
            status: w.status,
            totalBatchCount: w.totalBatchCount,
          };
        }),
        combinedProgress,
        allComplete: workerProgress.length > 0 && allComplete,
      });
    } catch (error) {
      console.error('[API] Error getting parallel sync status:', error);
      res.status(500).json({ error: 'Failed to get status', details: error.message });
    }
  });

  // POST /api/admin/bridge/parallel-sync/start - Start parallel sync workers
  app.post('/api/admin/bridge/parallel-sync/start', isAdmin, async (req, res) => {
    console.log('[ParallelSync] POST /start received, body:', req.body);
    try {
      if (parallelSyncState.running) {
        return res.status(409).json({ error: 'Parallel sync already running' });
      }
      
      const workersTotal = parseInt(req.body.workers) || 8;
      const batchSize = parseInt(req.body.batchSize) || 10000;
      const maxBatchesPerWorker = parseInt(req.body.maxBatches) || 50;
      
      if (workersTotal < 1 || workersTotal > 8) {
        return res.status(400).json({ error: 'Workers must be between 1 and 8' });
      }
      
      console.log(`[ParallelSync] Starting ${workersTotal} workers with batch size ${batchSize}`);
      
      parallelSyncState.running = true;
      parallelSyncState.workersTotal = workersTotal;
      parallelSyncState.startedAt = new Date();
      parallelSyncState.workers.clear();
      
      res.json({ 
        success: true, 
        message: `Started ${workersTotal} parallel workers`,
        workersTotal,
        batchSize,
        maxBatchesPerWorker,
      });
      
      // Get latest block for range calculation
      const latestBlock = await getBridgeLatestBlock();
      const blocksPerWorker = Math.ceil(latestBlock / workersTotal);
      
      // Run workers in parallel (in-process)
      const workerPromises = [];
      
      for (let workerId = 1; workerId <= workersTotal; workerId++) {
        const rangeStart = (workerId - 1) * blocksPerWorker;
        const rangeEnd = Math.min(workerId * blocksPerWorker, latestBlock);
        const indexerName = getWorkerIndexerName(workerId, workersTotal);
        
        console.log(`[ParallelSync] Worker ${workerId}: blocks ${rangeStart} → ${rangeEnd}`);
        
        // Initialize worker progress
        await initIndexerProgress(indexerName, rangeStart);
        
        parallelSyncState.workers.set(workerId, {
          running: true,
          lastUpdate: new Date(),
          progress: { rangeStart, rangeEnd },
        });
        
        // Create worker loop
        const workerLoop = async () => {
          let batchCount = 0;
          while (batchCount < maxBatchesPerWorker && parallelSyncState.running) {
            const result = await runWorkerBatch({
              batchSize,
              indexerName,
              rangeEnd,
            });
            
            batchCount++;
            parallelSyncState.workers.set(workerId, {
              running: true,
              lastUpdate: new Date(),
              progress: result,
            });
            
            if (result.status === 'complete') {
              console.log(`[ParallelSync] Worker ${workerId} completed its range`);
              break;
            }
            
            if (result.status === 'error') {
              console.error(`[ParallelSync] Worker ${workerId} error:`, result.error);
              await new Promise(r => setTimeout(r, 5000)); // Wait before retry
            }
            
            // Brief delay between batches to avoid RPC overload
            await new Promise(r => setTimeout(r, 500));
          }
          
          parallelSyncState.workers.set(workerId, {
            running: false,
            lastUpdate: new Date(),
            progress: { complete: true },
          });
        };
        
        workerPromises.push(workerLoop());
      }
      
      // Wait for all workers to complete (in background)
      Promise.all(workerPromises)
        .then(() => {
          console.log('[ParallelSync] All workers completed');
          parallelSyncState.running = false;
        })
        .catch((error) => {
          console.error('[ParallelSync] Worker error:', error);
          parallelSyncState.running = false;
        });
        
    } catch (error) {
      console.error('[API] Error starting parallel sync:', error);
      parallelSyncState.running = false;
      res.status(500).json({ error: 'Failed to start parallel sync', details: error.message });
    }
  });

  // POST /api/admin/bridge/parallel-sync/stop - Stop parallel sync workers
  app.post('/api/admin/bridge/parallel-sync/stop', isAdmin, async (req, res) => {
    try {
      if (!parallelSyncState.running) {
        return res.status(400).json({ error: 'Parallel sync not running' });
      }
      
      console.log('[ParallelSync] Stopping workers...');
      parallelSyncState.running = false;
      
      res.json({ success: true, message: 'Parallel sync stopping after current batches complete' });
    } catch (error) {
      console.error('[API] Error stopping parallel sync:', error);
      res.status(500).json({ error: 'Failed to stop parallel sync' });
    }
  });

  // ============================================================================
  // LAYERZERO BRIDGE INDEXER (Heroes, Pets, Equipment NFTs)
  // ============================================================================
  // Indexes NFT bridge events via LayerZero V2 protocol between DFK Chain, Metis, and Kaia
  
  let layerZeroIndexerRunning = false;
  
  // GET /api/admin/bridge/layerzero/status - Get LayerZero indexer status
  app.get('/api/admin/bridge/layerzero/status', isAdmin, async (req, res) => {
    try {
      const { getLayerZeroStats } = await import('./bridge-tracker/indexLayerZeroEvents.js');
      const stats = await getLayerZeroStats();
      
      res.json({
        running: layerZeroIndexerRunning,
        stats,
        supported: {
          chains: ['DFK Chain', 'Metis', 'Kaia'],
          bridgeTypes: ['hero', 'equipment', 'pet']
        }
      });
    } catch (error) {
      console.error('[API] Error getting LayerZero status:', error);
      res.status(500).json({ error: 'Failed to get LayerZero status', details: error.message });
    }
  });
  
  // POST /api/admin/bridge/layerzero/run - Run LayerZero bridge indexer
  app.post('/api/admin/bridge/layerzero/run', isAdmin, async (req, res) => {
    try {
      if (layerZeroIndexerRunning) {
        return res.status(400).json({ error: 'LayerZero indexer already running' });
      }
      
      layerZeroIndexerRunning = true;
      const { fullResync = false, blocksBack = 100000 } = req.body;
      
      res.json({ success: true, message: 'LayerZero indexer started', options: { fullResync, blocksBack } });
      
      // Run in background
      const { indexLayerZeroBridges } = await import('./bridge-tracker/indexLayerZeroEvents.js');
      indexLayerZeroBridges({ fullResync, blocksBack })
        .then(count => {
          console.log(`[LayerZero] Indexing complete, saved ${count} events`);
          layerZeroIndexerRunning = false;
        })
        .catch(err => {
          console.error('[LayerZero] Indexer error:', err);
          layerZeroIndexerRunning = false;
        });
        
    } catch (error) {
      layerZeroIndexerRunning = false;
      console.error('[API] Error running LayerZero indexer:', error);
      res.status(500).json({ error: 'Failed to run LayerZero indexer', details: error.message });
    }
  });

  // ============================================================================
  // TVL RECONCILIATION API
  // ============================================================================

  app.get('/api/admin/bridge/tvl-reconciliation', isAdmin, async (req, res) => {
    try {
      const flowByChain = await db.execute(sql`
        SELECT 
          CASE 
            WHEN direction = 'in' THEN dst_chain_id 
            ELSE src_chain_id 
          END as chain_id,
          bridge_type,
          direction,
          COUNT(*) as event_count,
          COALESCE(SUM(usd_value), 0) as total_usd
        FROM bridge_events
        GROUP BY 1, 2, 3
        ORDER BY chain_id, bridge_type, direction
      `);

      const pricingCoverage = await db.execute(sql`
        SELECT 
          token_symbol,
          COUNT(*) as total_events,
          SUM(CASE WHEN usd_value IS NOT NULL AND usd_value > 0 THEN 1 ELSE 0 END) as priced_events,
          COALESCE(SUM(usd_value), 0) as total_usd
        FROM bridge_events
        WHERE bridge_type = 'token'
        GROUP BY token_symbol
        ORDER BY COUNT(*) DESC
        LIMIT 15
      `);

      const chainFlows = {};
      for (const row of flowByChain) {
        const chainId = row.chain_id;
        if (!chainFlows[chainId]) {
          chainFlows[chainId] = { 
            chainId, 
            tokenIn: 0, tokenOut: 0, netToken: 0,
            heroIn: 0, heroOut: 0, netHeroes: 0,
            equipmentIn: 0, equipmentOut: 0, netEquipment: 0,
            petIn: 0, petOut: 0, netPets: 0
          };
        }
        const flow = chainFlows[chainId];
        const usd = parseFloat(row.total_usd) || 0;
        const count = parseInt(row.event_count) || 0;
        
        if (row.bridge_type === 'token') {
          if (row.direction === 'in') flow.tokenIn = usd;
          else flow.tokenOut = usd;
        } else if (row.bridge_type === 'hero') {
          if (row.direction === 'in') flow.heroIn = count;
          else flow.heroOut = count;
        } else if (row.bridge_type === 'equipment') {
          if (row.direction === 'in') flow.equipmentIn = count;
          else flow.equipmentOut = count;
        } else if (row.bridge_type === 'pet') {
          if (row.direction === 'in') flow.petIn = count;
          else flow.petOut = count;
        }
      }

      for (const chain of Object.values(chainFlows)) {
        chain.netToken = chain.tokenIn - chain.tokenOut;
        chain.netHeroes = chain.heroIn - chain.heroOut;
        chain.netEquipment = chain.equipmentIn - chain.equipmentOut;
        chain.netPets = chain.petIn - chain.petOut;
      }

      const chainNames = { 53935: 'DFK Chain', 1088: 'Metis', 8217: 'Kaia' };
      const knownTVL = {
        53935: { name: 'DFK Chain', tvl: 1360000, jewelPrice: 0.016 },
        1088: { name: 'Metis', tvl: null, jewelPrice: null },
        8217: { name: 'Kaia', tvl: null, jewelPrice: null }
      };

      const reconciliation = Object.values(chainFlows).map(flow => ({
        ...flow,
        chainName: chainNames[flow.chainId] || `Chain ${flow.chainId}`,
        currentTVL: knownTVL[flow.chainId]?.tvl || null,
        jewelPrice: knownTVL[flow.chainId]?.jewelPrice || null,
        discrepancy: knownTVL[flow.chainId]?.tvl ? flow.netToken - knownTVL[flow.chainId].tvl : null,
        discrepancyReason: 'Token price collapse (JEWEL: $20+ → $0.016 = 99.9% drop). Historical bridge values at tx time.'
      }));

      const totalEvents = pricingCoverage.reduce((sum, r) => sum + parseInt(r.total_events), 0);
      const pricedEvents = pricingCoverage.reduce((sum, r) => sum + parseInt(r.priced_events), 0);

      res.json({
        chains: reconciliation,
        pricingCoverage: pricingCoverage.map(r => ({
          token: r.token_symbol,
          totalEvents: parseInt(r.total_events),
          pricedEvents: parseInt(r.priced_events),
          coverage: parseInt(r.total_events) > 0 ? (parseInt(r.priced_events) / parseInt(r.total_events) * 100).toFixed(1) : '0',
          totalUsd: parseFloat(r.total_usd) || 0
        })),
        summary: {
          overallCoverage: totalEvents > 0 ? (pricedEvents / totalEvents * 100).toFixed(1) : 0,
          totalEvents,
          pricedEvents,
          note: 'Historical bridge values use prices at time of transaction. Current TVL reflects token price changes.'
        }
      });
    } catch (error) {
      console.error('[API] Error getting TVL reconciliation:', error);
      res.status(500).json({ error: 'Failed to get TVL reconciliation', details: error.message });
    }
  });

  // ============================================================================
  // PHASE 3 COMBAT INGESTION API (Hunting + PvP Indexers)
  // ============================================================================
  // Indexes combat events from DFK Chain and Klaytn:
  // - HuntsDiamond (0xEaC69796Cff468ED1694A6FfAc4cbC23bbe33aFa) for Void Hunts
  // - DFK Duel S6 (0xb7F679d69FA55b762F7f48432Da77D096d749540) for PvP on DFK Chain
  // - DFK Duel S6 (0x1207b51994c7A21cC0C78Ad1B12f2A3E203afC85) for PvP on Klaytn
  // ============================================================================

  // GET /api/admin/combat/status - Get combat indexer status
  app.get('/api/admin/combat/status', isAdmin, async (req, res) => {
    try {
      const { getHuntingIndexerStatus } = await import('./src/etl/ingestion/huntingIndexer.js');
      const { getPvpIndexerStatus } = await import('./src/etl/ingestion/pvpIndexer.js');
      
      const [huntingStatus, pvpStatus] = await Promise.all([
        getHuntingIndexerStatus(),
        getPvpIndexerStatus(),
      ]);
      
      res.json({
        hunting: huntingStatus,
        pvp: pvpStatus,
      });
    } catch (error) {
      console.error('[API] Error getting combat indexer status:', error);
      res.status(500).json({ error: 'Failed to get status', details: error.message });
    }
  });

  // POST /api/admin/combat/hunting/run - Run hunting indexer batch
  app.post('/api/admin/combat/hunting/run', isAdmin, async (req, res) => {
    try {
      const { runHuntingIndexer } = await import('./src/etl/ingestion/huntingIndexer.js');
      const result = await runHuntingIndexer();
      res.json(result);
    } catch (error) {
      console.error('[API] Error running hunting indexer:', error);
      res.status(500).json({ error: 'Failed to run hunting indexer', details: error.message });
    }
  });

  // POST /api/admin/combat/pvp/run - Run PvP indexer batch
  app.post('/api/admin/combat/pvp/run', isAdmin, async (req, res) => {
    try {
      const { runPvpIndexer } = await import('./src/etl/ingestion/pvpIndexer.js');
      const result = await runPvpIndexer();
      res.json(result);
    } catch (error) {
      console.error('[API] Error running PvP indexer:', error);
      res.status(500).json({ error: 'Failed to run PvP indexer', details: error.message });
    }
  });

  // POST /api/admin/combat/run-all - Run both indexers
  app.post('/api/admin/combat/run-all', isAdmin, async (req, res) => {
    try {
      const { runHuntingIndexer } = await import('./src/etl/ingestion/huntingIndexer.js');
      const { runPvpIndexer } = await import('./src/etl/ingestion/pvpIndexer.js');
      
      const [huntingResult, pvpResult] = await Promise.all([
        runHuntingIndexer(),
        runPvpIndexer(),
      ]);
      
      res.json({
        hunting: huntingResult,
        pvp: pvpResult,
      });
    } catch (error) {
      console.error('[API] Error running combat indexers:', error);
      res.status(500).json({ error: 'Failed to run combat indexers', details: error.message });
    }
  });

  // GET /api/admin/combat/stats - Get combat data statistics
  app.get('/api/admin/combat/stats', isAdmin, async (req, res) => {
    try {
      const huntingCountResult = await db.execute(sql`SELECT COUNT(*) as count FROM hunting_encounters`);
      const pvpCountResult = await db.execute(sql`SELECT COUNT(*) as count FROM pvp_matches`);
      
      const huntingCount = parseInt(huntingCountResult[0]?.count || '0');
      const pvpCount = parseInt(pvpCountResult[0]?.count || '0');
      
      res.json({
        hunting: { totalEncounters: huntingCount },
        pvp: { totalMatches: pvpCount },
      });
    } catch (error) {
      console.error('[API] Error getting combat stats:', error);
      res.status(500).json({ error: 'Failed to get stats', details: error.message });
    }
  });

  // ============================================================================
  // LP POOLS API (Garden Pools with APR Analytics)
  // ============================================================================
  
  // GET /api/admin/pools - Get all pools with basic APR data
  app.get('/api/admin/pools', isAdmin, async (req, res) => {
    try {
      const cached = getCachedPoolAnalytics();
      
      if (!cached || !cached.data || cached.data.length === 0) {
        return res.status(503).json({ 
          error: 'Pool cache not ready', 
          message: 'Pool analytics are still loading. Please try again in a few minutes.' 
        });
      }
      
      // Helper to parse APR strings like "1.23%" to decimal 0.0123
      const parseAprToDecimal = (aprStr) => {
        if (!aprStr) return 0;
        const match = String(aprStr).match(/^([\d.]+)/);
        return match ? parseFloat(match[1]) / 100 : 0;
      };
      
      const pools = cached.data.map(pool => {
        // Parse APR strings to decimals for frontend calculations
        const feeAPR = parseAprToDecimal(pool.fee24hAPR);
        const harvestAPR = parseAprToDecimal(pool.harvesting24hAPR);
        const gardenWorst = parseAprToDecimal(pool.gardeningQuestAPR?.worst);
        const gardenBest = parseAprToDecimal(pool.gardeningQuestAPR?.best);
        
        // Passive APR = fee + harvest
        const passiveAPR = feeAPR + harvestAPR;
        // Active APR = gardening quest range
        const activeAPRMin = gardenWorst;
        const activeAPRMax = gardenBest;
        // Total APR = passive + active
        const totalAPRMin = passiveAPR + activeAPRMin;
        const totalAPRMax = passiveAPR + activeAPRMax;
        
        return {
          pid: pool.pid,
          pairName: pool.pairName,
          lpToken: pool.lpToken,
          tokens: [
            { symbol: pool.token0 || '', address: '' },
            { symbol: pool.token1 || '', address: '' }
          ],
          tvl: pool.totalTVL || 0,
          v1TVL: pool.v1TVL || 0,
          v2TVL: pool.v2TVL || 0,
          passiveAPR,
          activeAPRMin,
          activeAPRMax,
          totalAPRMin,
          totalAPRMax
        };
      });
      
      // Sort by TVL descending
      pools.sort((a, b) => (b.tvl || 0) - (a.tvl || 0));
      
      res.json({
        pools,
        lastUpdated: cached.lastUpdated,
        count: pools.length,
      });
    } catch (error) {
      console.error('[API] Error getting pools:', error);
      res.status(500).json({ error: 'Failed to get pools', details: error.message });
    }
  });
  
  // GET /api/admin/pools/:pid/all-stakers - Get ALL wallets staked in a pool from indexed DB
  // NOTE: This route MUST be registered before /api/admin/pools/:pid to avoid route conflicts
  app.get('/api/admin/pools/:pid/all-stakers', isAdmin, async (req, res) => {
    try {
      const pid = parseInt(req.params.pid);
      console.log(`[HTTP] GET /api/admin/pools/${pid}/all-stakers`);
      
      if (isNaN(pid) || pid < 0) {
        return res.status(400).json({ error: 'Invalid pool ID' });
      }
      
      const cached = getCachedPoolAnalytics();
      if (!cached || !cached.data || cached.data.length === 0) {
        return res.status(503).json({ 
          error: 'Pool cache not ready', 
          message: 'Pool analytics are still loading. Please try again in a few minutes.' 
        });
      }
      
      const pool = cached.data.find(p => p.pid === pid);
      if (!pool) {
        return res.status(404).json({ error: 'Pool not found', pid });
      }
      
      // Try to get stakers from indexed DB first
      let stakers = await poolStakerIndexer.getActivePoolStakersFromDB(pid, 500);
      let source = 'indexed';
      
      // If DB is empty, fall back to on-chain scan
      if (!stakers || stakers.length === 0) {
        console.log(`[HTTP] No indexed stakers for pool ${pid}, falling back to onchain scan...`);
        stakers = await analytics.getAllPoolStakers(pid);
        source = 'onchain';
      }
      
      // Lookup missing summoner names in background
      const stakersWithMissingNames = stakers.filter(s => !s.summonerName);
      if (stakersWithMissingNames.length > 0) {
        // Import the profile lookup service
        const { getSummonerName } = await import('./src/services/profileLookupService.js');
        const pLimit = (await import('p-limit')).default;
        const limit = pLimit(10); // Limit concurrent lookups
        
        // Create a map for quick updates
        const nameMap = new Map();
        
        // Lookup names in parallel with limit
        await Promise.all(
          stakersWithMissingNames.slice(0, 50).map(staker => 
            limit(async () => {
              try {
                const name = await getSummonerName(staker.wallet);
                if (name) {
                  nameMap.set(staker.wallet.toLowerCase(), name);
                  // Update DB in background (don't await)
                  db.update(poolStakers)
                    .set({ summonerName: name })
                    .where(and(
                      eq(poolStakers.wallet, staker.wallet.toLowerCase()),
                      eq(poolStakers.pid, pid)
                    ))
                    .catch(err => console.error('[AllStakers] DB update error:', err.message));
                }
              } catch (err) {
                // Ignore lookup errors
              }
            })
          )
        );
        
        // Apply names to stakers
        for (const staker of stakers) {
          if (!staker.summonerName) {
            staker.summonerName = nameMap.get(staker.wallet.toLowerCase()) || null;
          }
        }
      }
      
      // Use ACTUAL pool total from cache (not just discovered stakers)
      // pool.totalStaked is the real on-chain total from getPoolInfo()
      const actualPoolTotalLP = parseFloat(pool.totalStaked || '0');
      const discoveredStakersLP = stakers.reduce((sum, s) => sum + parseFloat(s.stakedLP || '0'), 0);
      
      // Use v2TVL for value calculations
      const poolTVL = pool.v2TVL || pool.totalTVL || 0;
      
      const enrichedStakers = stakers.map((staker) => {
        const stakedLP = parseFloat(staker.stakedLP || '0');
        // Use actual pool total for accurate share calculation
        const poolShare = actualPoolTotalLP > 0 ? stakedLP / actualPoolTotalLP : 0;
        const stakedValue = poolShare * poolTVL;
        
        // Handle both DB format and onchain format for lastActivity
        const lastActivity = staker.lastActivity || (staker.lastActivityType ? {
          type: staker.lastActivityType,
          amount: staker.lastActivityAmount || '0',
          blockNumber: staker.lastActivityBlock || 0,
          txHash: staker.lastActivityTxHash || ''
        } : { type: 'Unknown', amount: '0', blockNumber: 0, txHash: '' });
        
        return {
          wallet: staker.wallet,
          summonerName: staker.summonerName || null,
          stakedLP: staker.stakedLP,
          stakedValue: stakedValue.toFixed(2),
          poolShare: (poolShare * 100).toFixed(4),
          lastActivity
        };
      });
      
      res.json({
        stakers: enrichedStakers,
        count: enrichedStakers.length,
        poolTVL: poolTVL,
        totalPoolLP: actualPoolTotalLP.toFixed(6),
        discoveredStakersLP: discoveredStakersLP.toFixed(6),
        source
      });
    } catch (error) {
      console.error('[API] Error fetching all stakers:', error);
      res.status(500).json({ error: 'Failed to fetch all stakers', details: error.message });
    }
  });
  
  // ============================================================================
  // POOL INDEXER ADMIN ROUTES
  // ============================================================================
  
  // GET /api/admin/pool-indexer/status - Get all indexer progress
  app.get('/api/admin/pool-indexer/status', isAdmin, async (req, res) => {
    try {
      const { getAllSwapIndexerProgress, getAllSwapLiveProgress, getSwapAutoRunStatus } = await import('./src/etl/ingestion/poolSwapIndexer.js');
      const { getAllRewardIndexerProgress, getAllRewardLiveProgress, getRewardAutoRunStatus } = await import('./src/etl/ingestion/poolRewardIndexer.js');
      const { getAllUnifiedIndexerProgress, getAllUnifiedLiveProgress, getUnifiedAutoRunStatus, getAllV2StakedTotals } = await import('./src/etl/ingestion/poolUnifiedIndexer.js');
      const { getAllLatestAggregates } = await import('./src/etl/aggregation/poolDailyAggregator.js');
      
      const [swapProgress, rewardProgress, unifiedProgress, latestAggregatesRaw, stakerCounts, swapEventCounts, rewardEventCounts] = await Promise.all([
        getAllSwapIndexerProgress(),
        getAllRewardIndexerProgress(),
        getAllUnifiedIndexerProgress(),
        getAllLatestAggregates(),
        getAllV2StakedTotals(),
        db.select({ pid: poolSwapEvents.pid, eventCount: sql`COUNT(*)::int` })
          .from(poolSwapEvents)
          .groupBy(poolSwapEvents.pid),
        db.select({ pid: poolRewardEvents.pid, eventCount: sql`COUNT(*)::int` })
          .from(poolRewardEvents)
          .groupBy(poolRewardEvents.pid),
      ]);
      
      const swapLiveProgress = getAllSwapLiveProgress();
      const rewardLiveProgress = getAllRewardLiveProgress();
      const unifiedLiveProgress = getAllUnifiedLiveProgress();
      const swapAutoRuns = getSwapAutoRunStatus();
      const rewardAutoRuns = getRewardAutoRunStatus();
      const unifiedAutoRuns = getUnifiedAutoRunStatus();
      
      const aggregates = (latestAggregatesRaw || [])
        .map((row) => row.pool_daily_aggregates || row.poolDailyAggregates || row)
        .filter((agg) => agg && agg.pid !== undefined);
      
      // Filter to main pool entries only (not worker entries like unified_pool_0_w1)
      const mainPoolProgress = unifiedProgress.filter(p => !p.indexerName.includes('_w'));
      
      // Sum up total events from all workers for each pool
      const eventsByPool = new Map();
      for (const progress of unifiedProgress) {
        const currentTotal = eventsByPool.get(progress.pid) || 0;
        eventsByPool.set(progress.pid, currentTotal + (progress.totalEventsIndexed || 0));
      }
      
      // Create staker count lookup map
      const stakerCountMap = new Map();
      for (const sc of stakerCounts) {
        stakerCountMap.set(sc.pid, { count: Number(sc.stakerCount), totalStaked: sc.totalStaked });
      }

      const swapEventCountMap = new Map();
      for (const row of swapEventCounts) {
        swapEventCountMap.set(row.pid, Number(row.eventCount) || 0);
      }

      const rewardEventCountMap = new Map();
      for (const row of rewardEventCounts) {
        rewardEventCountMap.set(row.pid, Number(row.eventCount) || 0);
      }
      const totalSwapEventCount = Array.from(swapEventCountMap.values()).reduce((sum, count) => sum + count, 0);
      const totalRewardEventCount = Array.from(rewardEventCountMap.values()).reduce((sum, count) => sum + count, 0);
      
      // Build unified indexers with merged data
      const unifiedIndexers = mainPoolProgress.map((p) => {
        const livePoolProgress = unifiedLiveProgress.find(l => l.pid === p.pid);
        const stakerInfo = stakerCountMap.get(p.pid) || { count: 0, totalStaked: '0' };
        const swapEventCount = swapEventCountMap.get(p.pid) || 0;
        const rewardEventCount = rewardEventCountMap.get(p.pid) || 0;
        
        return {
          ...p,
          totalEventsIndexed: eventsByPool.get(p.pid) || p.totalEventsIndexed,
          v2StakerCount: stakerInfo.count,
          v2TotalStaked: stakerInfo.totalStaked,
          swapEventCount,
          rewardEventCount,
          live: livePoolProgress || null,
          liveWorkers: livePoolProgress?.workers || [],
          autoRun: unifiedAutoRuns.find((a) => a.pid === p.pid) || null,
        };
      });
      
      res.json({
        swapIndexers: swapProgress.map((p) => ({
          ...p,
          swapEventCount: swapEventCountMap.get(p.pid) || 0,
          live: swapLiveProgress.find((l) => l.pid === p.pid) || null,
          autoRun: swapAutoRuns.find((a) => a.pid === p.pid) || null,
        })),
        rewardIndexers: rewardProgress.map((p) => ({
          ...p,
          rewardEventCount: rewardEventCountMap.get(p.pid) || 0,
          live: rewardLiveProgress.find((l) => l.pid === p.pid) || null,
          autoRun: rewardAutoRuns.find((a) => a.pid === p.pid) || null,
        })),
        unifiedIndexers,
        poolsIndexed: mainPoolProgress.length,
        totalPools: 14,
        aggregates,
        totalSwapEventCount,
        totalRewardEventCount,
      });
    } catch (error) {
      console.error('[API] Error fetching pool indexer status:', error);
      res.status(500).json({ error: 'Failed to fetch pool indexer status', details: error.message });
    }
  });
  
  // POST /api/admin/pool-indexer/swap/trigger - Trigger swap indexer batch
  app.post('/api/admin/pool-indexer/swap/trigger', isAdmin, async (req, res) => {
    try {
      const { pid } = req.body;
      if (pid === undefined) {
        return res.status(400).json({ error: 'pid is required' });
      }
      const { runSwapIncrementalBatch } = await import('./src/etl/ingestion/poolSwapIndexer.js');
      const result = await runSwapIncrementalBatch(parseInt(pid));
      res.json({ success: true, result });
    } catch (error) {
      console.error('[API] Error triggering swap indexer:', error);
      res.status(500).json({ error: 'Failed to trigger swap indexer', details: error.message });
    }
  });
  
  // POST /api/admin/pool-indexer/swap/auto-run - Start/stop swap auto-run
  app.post('/api/admin/pool-indexer/swap/auto-run', isAdmin, async (req, res) => {
    try {
      const { pid, action, intervalMs } = req.body;
      if (pid === undefined || !action) {
        return res.status(400).json({ error: 'pid and action are required' });
      }
      const { startSwapAutoRun, stopSwapAutoRun } = await import('./src/etl/ingestion/poolSwapIndexer.js');
      let result;
      if (action === 'start') {
        result = startSwapAutoRun(parseInt(pid), intervalMs || 5 * 60 * 1000);
      } else if (action === 'stop') {
        result = stopSwapAutoRun(parseInt(pid));
      } else {
        return res.status(400).json({ error: 'Invalid action. Use "start" or "stop"' });
      }
      res.json({ success: true, result });
    } catch (error) {
      console.error('[API] Error with swap auto-run:', error);
      res.status(500).json({ error: 'Failed to manage swap auto-run', details: error.message });
    }
  });
  
  // POST /api/admin/pool-indexer/reward/trigger - Trigger reward indexer batch
  app.post('/api/admin/pool-indexer/reward/trigger', isAdmin, async (req, res) => {
    try {
      const { pid } = req.body;
      if (pid === undefined) {
        return res.status(400).json({ error: 'pid is required' });
      }
      const { runRewardIncrementalBatch } = await import('./src/etl/ingestion/poolRewardIndexer.js');
      const result = await runRewardIncrementalBatch(parseInt(pid));
      res.json({ success: true, result });
    } catch (error) {
      console.error('[API] Error triggering reward indexer:', error);
      res.status(500).json({ error: 'Failed to trigger reward indexer', details: error.message });
    }
  });
  
  // POST /api/admin/pool-indexer/reward/auto-run - Start/stop reward auto-run
  app.post('/api/admin/pool-indexer/reward/auto-run', isAdmin, async (req, res) => {
    try {
      const { pid, action, intervalMs } = req.body;
      if (pid === undefined || !action) {
        return res.status(400).json({ error: 'pid and action are required' });
      }
      const { startRewardAutoRun, stopRewardAutoRun } = await import('./src/etl/ingestion/poolRewardIndexer.js');
      let result;
      if (action === 'start') {
        result = startRewardAutoRun(parseInt(pid), intervalMs || 5 * 60 * 1000);
      } else if (action === 'stop') {
        result = stopRewardAutoRun(parseInt(pid));
      } else {
        return res.status(400).json({ error: 'Invalid action. Use "start" or "stop"' });
      }
      res.json({ success: true, result });
    } catch (error) {
      console.error('[API] Error with reward auto-run:', error);
      res.status(500).json({ error: 'Failed to manage reward auto-run', details: error.message });
    }
  });
  
  // POST /api/admin/pool-indexer/aggregate/trigger - Trigger aggregation for all pools
  app.post('/api/admin/pool-indexer/aggregate/trigger', isAdmin, async (req, res) => {
    try {
      const { computeAllPoolAggregates } = await import('./src/etl/aggregation/poolDailyAggregator.js');
      const result = await computeAllPoolAggregates();
      res.json({ success: true, result });
    } catch (error) {
      console.error('[API] Error triggering aggregation:', error);
      res.status(500).json({ error: 'Failed to trigger aggregation', details: error.message });
    }
  });
  
  // POST /api/admin/pool-indexer/unified/trigger - Trigger unified indexer batch
  app.post('/api/admin/pool-indexer/unified/trigger', isAdmin, async (req, res) => {
    try {
      const { pid } = req.body;
      if (pid === undefined) {
        return res.status(400).json({ error: 'pid is required' });
      }
      const { runUnifiedIncrementalBatch } = await import('./src/etl/ingestion/poolUnifiedIndexer.js');
      const result = await runUnifiedIncrementalBatch(parseInt(pid));
      res.json({ success: true, result });
    } catch (error) {
      console.error('[API] Error triggering unified indexer:', error);
      res.status(500).json({ error: 'Failed to trigger unified indexer', details: error.message });
    }
  });
  
  // POST /api/admin/pool-indexer/unified/auto-run - Start/stop unified auto-run
  app.post('/api/admin/pool-indexer/unified/auto-run', isAdmin, async (req, res) => {
    try {
      const { pid, action, intervalMs } = req.body;
      if (pid === undefined || !action) {
        return res.status(400).json({ error: 'pid and action are required' });
      }
      const { startUnifiedAutoRun, stopUnifiedAutoRun } = await import('./src/etl/ingestion/poolUnifiedIndexer.js');
      let result;
      if (action === 'start') {
        result = startUnifiedAutoRun(parseInt(pid), intervalMs || 5 * 60 * 1000);
      } else if (action === 'stop') {
        result = stopUnifiedAutoRun(parseInt(pid));
      } else {
        return res.status(400).json({ error: 'Invalid action. Use "start" or "stop"' });
      }
      res.json({ success: true, result });
    } catch (error) {
      console.error('[API] Error with unified auto-run:', error);
      res.status(500).json({ error: 'Failed to manage unified auto-run', details: error.message });
    }
  });
  
  // POST /api/admin/pool-indexer/unified/reset - Reset unified indexer for a pool
  app.post('/api/admin/pool-indexer/unified/reset', isAdmin, async (req, res) => {
    try {
      const { pid } = req.body;
      if (pid === undefined) {
        return res.status(400).json({ error: 'pid is required' });
      }
      const { resetUnifiedIndexerProgress } = await import('./src/etl/ingestion/poolUnifiedIndexer.js');
      const result = await resetUnifiedIndexerProgress(parseInt(pid));
      res.json({ success: true, result });
    } catch (error) {
      console.error('[API] Error resetting unified indexer:', error);
      res.status(500).json({ error: 'Failed to reset unified indexer', details: error.message });
    }
  });
  
  // GET /api/admin/pool-indexer/unified/status - Get unified indexer worker status
  app.get('/api/admin/pool-indexer/unified/status', isAdmin, async (req, res) => {
    try {
      const { 
        getUnifiedAutoRunStatus, 
        WORKERS_PER_POOL, 
        MIN_WORKERS_PER_POOL,
        getPoolWorkerCountSummary 
      } = await import('./src/etl/ingestion/poolUnifiedIndexer.js');
      const workers = getUnifiedAutoRunStatus();
      const workerSummary = getPoolWorkerCountSummary();
      res.json({
        activeWorkers: workers.length,
        maxWorkersPerPool: WORKERS_PER_POOL,
        minWorkersPerPool: MIN_WORKERS_PER_POOL,
        workersPerPool: WORKERS_PER_POOL, // backward compat
        workerSummary,
        pools: workers,
      });
    } catch (error) {
      console.error('[API] Error getting unified indexer status:', error);
      res.status(500).json({ error: 'Failed to get unified indexer status', details: error.message });
    }
  });

  // GET /api/admin/pool-indexer/unified/stakers/:pid - Get stakers for a pool
  app.get('/api/admin/pool-indexer/unified/stakers/:pid', isAdmin, async (req, res) => {
    try {
      const pid = parseInt(req.params.pid);
      if (isNaN(pid) || pid < 0) {
        return res.status(400).json({ error: 'Invalid pool ID' });
      }
      const { getActivePoolStakersFromDB } = await import('./src/etl/ingestion/poolStakerIndexer.js');
      const stakers = await getActivePoolStakersFromDB(pid, 500);
      res.json({ stakers, count: stakers.length });
    } catch (error) {
      console.error('[API] Error fetching pool stakers:', error);
      res.status(500).json({ error: 'Failed to fetch pool stakers', details: error.message });
    }
  });

  // ============================================================================
  // V1 POOL INDEXER API (Legacy Master Gardener)
  // ============================================================================

  // GET /api/admin/pool-indexer-v1/status - Get V1 indexer status
  app.get('/api/admin/pool-indexer-v1/status', isAdmin, async (req, res) => {
    try {
      const {
        getAllUnifiedIndexerProgressV1,
        getAllUnifiedLiveProgressV1,
        getUnifiedAutoRunStatusV1,
        WORKERS_PER_POOL_V1,
        MIN_WORKERS_PER_POOL_V1,
        getPoolWorkerCountSummaryV1,
        getAllV1StakedTotals,
      } = await import('./src/etl/ingestion/poolUnifiedIndexerV1.js');
      
      const dbProgress = await getAllUnifiedIndexerProgressV1();
      const liveProgress = getAllUnifiedLiveProgressV1();
      const autoRunStatus = getUnifiedAutoRunStatusV1();
      const workerSummary = getPoolWorkerCountSummaryV1();
      const stakerCounts = await getAllV1StakedTotals();
      
      // Group DB progress by PID - only main pool entries (not worker entries)
      const mainPoolProgress = dbProgress.filter(p => !p.indexerName.includes('_w'));
      
      // Sum up total events from all workers for each pool
      const eventsByPool = new Map();
      for (const progress of dbProgress) {
        const currentTotal = eventsByPool.get(progress.pid) || 0;
        eventsByPool.set(progress.pid, currentTotal + (progress.totalEventsIndexed || 0));
      }
      
      // Create staker count lookup map
      const stakerCountMap = new Map();
      for (const sc of stakerCounts) {
        stakerCountMap.set(sc.pid, { count: Number(sc.stakerCount), totalStaked: sc.totalStaked });
      }
      
      // Merge live progress into main pool progress
      const indexers = [];
      const seenPids = new Set();
      
      for (const progress of mainPoolProgress) {
        const live = liveProgress.find(l => l.pid === progress.pid);
        const autoRun = autoRunStatus.filter(a => a.pid === progress.pid);
        const stakerData = stakerCountMap.get(progress.pid) || { count: 0, totalStaked: '0' };
        seenPids.add(progress.pid);
        indexers.push({
          ...progress,
          totalEventsIndexed: eventsByPool.get(progress.pid) || progress.totalEventsIndexed,
          v1StakerCount: stakerData.count,
          v1TotalStaked: stakerData.totalStaked,
          live: live || null,
          autoRun: autoRun.length > 0 ? autoRun[0] : null,
        });
      }
      
      // Add pools that have live progress but no DB entry yet
      for (const live of liveProgress) {
        if (!seenPids.has(live.pid)) {
          const stakerData = stakerCountMap.get(live.pid) || { count: 0, totalStaked: '0' };
          indexers.push({
            id: null,
            indexerName: `unified_v1_pool_${live.pid}`,
            indexerType: 'unified_v1',
            pid: live.pid,
            lpToken: null,
            lastIndexedBlock: live.currentBlock,
            genesisBlock: live.genesisBlock,
            status: live.isRunning ? 'running' : 'idle',
            totalEventsIndexed: 0,
            v1StakerCount: stakerData.count,
            v1TotalStaked: stakerData.totalStaked,
            lastError: null,
            updatedAt: new Date().toISOString(),
            live,
            autoRun: autoRunStatus.find(a => a.pid === live.pid) || null,
          });
        }
      }
      
      // Sort by PID
      indexers.sort((a, b) => a.pid - b.pid);
      
      // Count unique pools indexed (status complete or has progress)
      const poolsIndexed = indexers.filter(i => 
        i.status === 'complete' || (i.live?.percentComplete || 0) > 0 || i.totalEventsIndexed > 0
      ).length;
      
      res.json({
        indexers,
        poolsIndexed,
        totalPools: 14,
        workerStatus: {
          activeWorkers: autoRunStatus.length,
          maxWorkersPerPool: WORKERS_PER_POOL_V1,
          minWorkersPerPool: MIN_WORKERS_PER_POOL_V1,
          workersPerPool: WORKERS_PER_POOL_V1,
          workerSummary,
          pools: autoRunStatus,
        },
      });
    } catch (error) {
      console.error('[API] Error getting V1 indexer status:', error);
      res.status(500).json({ error: 'Failed to get V1 indexer status', details: error.message });
    }
  });

  // POST /api/admin/pool-indexer-v1/trigger - Trigger V1 indexer batch
  app.post('/api/admin/pool-indexer-v1/trigger', isAdmin, async (req, res) => {
    try {
      const { pid } = req.body;
      if (pid === undefined || pid < 0) {
        return res.status(400).json({ error: 'Invalid pool ID' });
      }
      const { runUnifiedIncrementalBatchV1 } = await import('./src/etl/ingestion/poolUnifiedIndexerV1.js');
      const result = await runUnifiedIncrementalBatchV1(pid);
      res.json(result);
    } catch (error) {
      console.error('[API] Error triggering V1 indexer:', error);
      res.status(500).json({ error: 'Failed to trigger V1 indexer', details: error.message });
    }
  });

  // POST /api/admin/pool-indexer-v1/auto-run - Start/stop V1 auto-run
  app.post('/api/admin/pool-indexer-v1/auto-run', isAdmin, async (req, res) => {
    try {
      const { pid, action } = req.body;
      if (pid === undefined || pid < 0) {
        return res.status(400).json({ error: 'Invalid pool ID' });
      }
      if (action !== 'start' && action !== 'stop') {
        return res.status(400).json({ error: 'Invalid action (must be start or stop)' });
      }
      
      const { startPoolWorkersAutoRunV1, stopUnifiedAutoRunV1 } = await import('./src/etl/ingestion/poolUnifiedIndexerV1.js');
      
      if (action === 'start') {
        const result = await startPoolWorkersAutoRunV1(pid);
        res.json(result);
      } else {
        const result = stopUnifiedAutoRunV1(pid);
        res.json(result);
      }
    } catch (error) {
      console.error('[API] Error toggling V1 auto-run:', error);
      res.status(500).json({ error: 'Failed to toggle V1 auto-run', details: error.message });
    }
  });

  // POST /api/admin/pool-indexer-v1/start-all - Start all V1 indexers
  app.post('/api/admin/pool-indexer-v1/start-all', isAdmin, async (req, res) => {
    try {
      const { startAllUnifiedAutoRunV1 } = await import('./src/etl/ingestion/poolUnifiedIndexerV1.js');
      const result = await startAllUnifiedAutoRunV1();
      res.json(result);
    } catch (error) {
      console.error('[API] Error starting all V1 indexers:', error);
      res.status(500).json({ error: 'Failed to start all V1 indexers', details: error.message });
    }
  });

  // POST /api/admin/pool-indexer-v1/stop-all - Stop all V1 indexers
  app.post('/api/admin/pool-indexer-v1/stop-all', isAdmin, async (req, res) => {
    try {
      const { stopAllUnifiedAutoRunsV1 } = await import('./src/etl/ingestion/poolUnifiedIndexerV1.js');
      const result = stopAllUnifiedAutoRunsV1();
      res.json(result);
    } catch (error) {
      console.error('[API] Error stopping all V1 indexers:', error);
      res.status(500).json({ error: 'Failed to stop all V1 indexers', details: error.message });
    }
  });

  // GET /api/admin/pool-indexer-v1/stakers/:pid - Get V1 stakers for a pool
  app.get('/api/admin/pool-indexer-v1/stakers/:pid', isAdmin, async (req, res) => {
    try {
      const pid = parseInt(req.params.pid);
      if (isNaN(pid) || pid < 0) {
        return res.status(400).json({ error: 'Invalid pool ID' });
      }
      const { getActivePoolStakersFromDBV1 } = await import('./src/etl/ingestion/poolUnifiedIndexerV1.js');
      const stakers = await getActivePoolStakersFromDBV1(pid, 500);
      res.json({ stakers, count: stakers.length });
    } catch (error) {
      console.error('[API] Error fetching V1 pool stakers:', error);
      res.status(500).json({ error: 'Failed to fetch V1 pool stakers', details: error.message });
    }
  });

  // GET /api/admin/pool-indexer-v1/totals - Get V1 staked totals for all pools
  app.get('/api/admin/pool-indexer-v1/totals', isAdmin, async (req, res) => {
    try {
      const { getAllV1StakedTotals } = await import('./src/etl/ingestion/poolUnifiedIndexerV1.js');
      const totals = await getAllV1StakedTotals();
      res.json({ totals });
    } catch (error) {
      console.error('[API] Error fetching V1 totals:', error);
      res.status(500).json({ error: 'Failed to fetch V1 totals', details: error.message });
    }
  });

  // ============================================================================
  // HARMONY POOL INDEXER ROUTES
  // ============================================================================

  // GET /api/admin/pool-indexer-harmony/status - Get Harmony indexer status
  app.get('/api/admin/pool-indexer-harmony/status', isAdmin, async (req, res) => {
    try {
      const { 
        getHarmonyPoolStats, 
        getAllUnifiedLiveProgressHarmony,
        getAllUnifiedIndexerProgressHarmony,
        getLatestBlockHarmony,
        getPoolLengthHarmony,
      } = await import('./src/etl/ingestion/poolHarmonyIndexer.js');
      
      const [poolStats, liveProgress, dbProgress, latestBlock, poolLength] = await Promise.all([
        getHarmonyPoolStats(),
        getAllUnifiedLiveProgressHarmony(),
        getAllUnifiedIndexerProgressHarmony(),
        getLatestBlockHarmony(),
        getPoolLengthHarmony(),
      ]);
      
      const liveProgressMap = new Map(liveProgress.map(p => [p.pid, p]));
      
      const pools = poolStats.map(pool => {
        const livePoolProgress = liveProgressMap.get(pool.pid);
        return {
          ...pool,
          liveWorkers: livePoolProgress?.workers || [],
        };
      });
      
      res.json({
        latestBlock,
        poolLength,
        pools,
        dbProgress,
      });
    } catch (error) {
      console.error('[API] Error fetching Harmony indexer status:', error);
      res.status(500).json({ error: 'Failed to fetch Harmony indexer status', details: error.message });
    }
  });

  // POST /api/admin/pool-indexer-harmony/trigger - Trigger Harmony indexer batch
  app.post('/api/admin/pool-indexer-harmony/trigger', isAdmin, async (req, res) => {
    try {
      const { pid } = req.body;
      if (pid === undefined || pid === null) {
        return res.status(400).json({ error: 'pid is required' });
      }
      
      const { runUnifiedIncrementalBatchHarmony } = await import('./src/etl/ingestion/poolHarmonyIndexer.js');
      runUnifiedIncrementalBatchHarmony(pid).catch(err => console.error('[HarmonyIndexer] Background error:', err));
      res.json({ success: true, message: `Harmony indexer triggered for pool ${pid}` });
    } catch (error) {
      console.error('[API] Error triggering Harmony indexer:', error);
      res.status(500).json({ error: 'Failed to trigger Harmony indexer', details: error.message });
    }
  });

  // POST /api/admin/pool-indexer-harmony/auto-run - Start/stop Harmony auto-run
  app.post('/api/admin/pool-indexer-harmony/auto-run', isAdmin, async (req, res) => {
    try {
      const { pid, action, workerCount } = req.body;
      if (pid === undefined || pid === null) {
        return res.status(400).json({ error: 'pid is required' });
      }
      if (!action || !['start', 'stop'].includes(action)) {
        return res.status(400).json({ error: 'action must be start or stop' });
      }
      
      const { startAutoRunHarmony, stopAutoRunHarmony } = await import('./src/etl/ingestion/poolHarmonyIndexer.js');
      
      let result;
      if (action === 'start') {
        result = startAutoRunHarmony(pid, { workerCount: workerCount || 5 });
      } else {
        result = stopAutoRunHarmony(pid);
      }
      
      res.json({ success: true, result });
    } catch (error) {
      console.error('[API] Error managing Harmony auto-run:', error);
      res.status(500).json({ error: 'Failed to manage Harmony auto-run', details: error.message });
    }
  });

  // POST /api/admin/pool-indexer-harmony/start-all - Start all Harmony indexers
  app.post('/api/admin/pool-indexer-harmony/start-all', isAdmin, async (req, res) => {
    try {
      const { getPoolLengthHarmony, startAutoRunHarmony } = await import('./src/etl/ingestion/poolHarmonyIndexer.js');
      const poolLength = await getPoolLengthHarmony();
      const started = [];
      for (let pid = 0; pid < Math.min(poolLength, 20); pid++) {
        startAutoRunHarmony(pid);
        started.push(pid);
      }
      res.json({ success: true, started });
    } catch (error) {
      console.error('[API] Error starting all Harmony indexers:', error);
      res.status(500).json({ error: 'Failed to start all Harmony indexers', details: error.message });
    }
  });

  // POST /api/admin/pool-indexer-harmony/stop-all - Stop all Harmony indexers
  app.post('/api/admin/pool-indexer-harmony/stop-all', isAdmin, async (req, res) => {
    try {
      const { getPoolLengthHarmony, stopAutoRunHarmony } = await import('./src/etl/ingestion/poolHarmonyIndexer.js');
      const poolLength = await getPoolLengthHarmony();
      const stopped = [];
      for (let pid = 0; pid < Math.min(poolLength, 20); pid++) {
        stopAutoRunHarmony(pid);
        stopped.push(pid);
      }
      res.json({ success: true, stopped });
    } catch (error) {
      console.error('[API] Error stopping all Harmony indexers:', error);
      res.status(500).json({ error: 'Failed to stop all Harmony indexers', details: error.message });
    }
  });

  // GET /api/admin/pool-indexer-harmony/stakers/:pid - Get Harmony stakers for a pool
  app.get('/api/admin/pool-indexer-harmony/stakers/:pid', isAdmin, async (req, res) => {
    try {
      const pid = parseInt(req.params.pid);
      if (isNaN(pid) || pid < 0) {
        return res.status(400).json({ error: 'Invalid pool ID' });
      }
      const { getPoolStakersHarmony } = await import('./src/etl/ingestion/poolHarmonyIndexer.js');
      const stakers = await getPoolStakersHarmony(pid);
      res.json({ stakers: stakers.slice(0, 500), count: stakers.length });
    } catch (error) {
      console.error('[API] Error fetching Harmony pool stakers:', error);
      res.status(500).json({ error: 'Failed to fetch Harmony pool stakers', details: error.message });
    }
  });

  // POST /api/admin/pool-indexer-harmony/reset/:pid - Reset Harmony pool progress
  app.post('/api/admin/pool-indexer-harmony/reset/:pid', isAdmin, async (req, res) => {
    try {
      const pid = parseInt(req.params.pid);
      if (isNaN(pid) || pid < 0) {
        return res.status(400).json({ error: 'Invalid pool ID' });
      }
      const { resetPoolProgressHarmony } = await import('./src/etl/ingestion/poolHarmonyIndexer.js');
      const result = await resetPoolProgressHarmony(pid);
      res.json(result);
    } catch (error) {
      console.error('[API] Error resetting Harmony pool progress:', error);
      res.status(500).json({ error: 'Failed to reset Harmony pool progress', details: error.message });
    }
  });

  // ============================================================================
  // JEWELER INDEXER ROUTES
  // ============================================================================

  // GET /api/admin/jeweler/status - Get Jeweler indexer status and stats
  app.get('/api/admin/jeweler/status', isAdmin, async (req, res) => {
    try {
      const { getJewelerStats } = await import('./src/etl/ingestion/jewelerIndexer.js');
      const stats = await getJewelerStats();
      res.json(stats);
    } catch (error) {
      console.error('[API] Error fetching jeweler status:', error);
      res.status(500).json({ error: 'Failed to fetch jeweler status', details: error.message });
    }
  });

  // POST /api/admin/jeweler/trigger - Trigger Jeweler indexer run
  app.post('/api/admin/jeweler/trigger', isAdmin, async (req, res) => {
    try {
      const { runJewelerIndexer } = await import('./src/etl/ingestion/jewelerIndexer.js');
      runJewelerIndexer().catch(err => console.error('[JewelerIndexer] Background error:', err));
      res.json({ success: true, message: 'Jeweler indexer triggered' });
    } catch (error) {
      console.error('[API] Error triggering jeweler indexer:', error);
      res.status(500).json({ error: 'Failed to trigger jeweler indexer', details: error.message });
    }
  });

  // POST /api/admin/jeweler/auto-run - Start/stop Jeweler auto-run
  app.post('/api/admin/jeweler/auto-run', isAdmin, async (req, res) => {
    try {
      const { action } = req.body;
      if (!action || !['start', 'stop'].includes(action)) {
        return res.status(400).json({ error: 'action must be start or stop' });
      }
      
      const { startJewelerAutoRun, stopJewelerAutoRun } = await import('./src/etl/ingestion/jewelerIndexer.js');
      
      let result;
      if (action === 'start') {
        result = startJewelerAutoRun();
      } else {
        result = stopJewelerAutoRun();
      }
      
      res.json({ success: true, result });
    } catch (error) {
      console.error('[API] Error managing jeweler auto-run:', error);
      res.status(500).json({ error: 'Failed to manage jeweler auto-run', details: error.message });
    }
  });

  // GET /api/admin/jeweler/leaderboard - Get top cJEWEL stakers
  app.get('/api/admin/jeweler/leaderboard', isAdmin, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 50;
      const { getJewelerLeaderboard } = await import('./src/etl/ingestion/jewelerIndexer.js');
      const stakers = await getJewelerLeaderboard(limit);
      res.json({ stakers, count: stakers.length });
    } catch (error) {
      console.error('[API] Error fetching jeweler leaderboard:', error);
      res.status(500).json({ error: 'Failed to fetch jeweler leaderboard', details: error.message });
    }
  });

  // GET /api/admin/jeweler/apr - Get Jeweler APR data
  app.get('/api/admin/jeweler/apr', isAdmin, async (req, res) => {
    try {
      const { getJewelerAPR, getJewelerRatio } = await import('./src/etl/ingestion/jewelerIndexer.js');
      const [aprData, ratioData] = await Promise.all([getJewelerAPR(), getJewelerRatio()]);
      res.json({ ...aprData, ...ratioData });
    } catch (error) {
      console.error('[API] Error fetching jeweler APR:', error);
      res.status(500).json({ error: 'Failed to fetch jeweler APR', details: error.message });
    }
  });

  // POST /api/admin/jeweler/refresh-balances - Refresh all staker balances
  app.post('/api/admin/jeweler/refresh-balances', isAdmin, async (req, res) => {
    try {
      const { refreshAllStakerBalances } = await import('./src/etl/ingestion/jewelerIndexer.js');
      refreshAllStakerBalances().catch(err => console.error('[JewelerIndexer] Background refresh error:', err));
      res.json({ success: true, message: 'Balance refresh started in background' });
    } catch (error) {
      console.error('[API] Error starting balance refresh:', error);
      res.status(500).json({ error: 'Failed to start balance refresh', details: error.message });
    }
  });

  // =========================================================================
  // GARDENING QUEST REWARDS INDEXER ROUTES
  // =========================================================================

  // GET /api/admin/gardening-quest/status - Get indexer status and stats
  app.get('/api/admin/gardening-quest/status', isAdmin, async (req, res) => {
    try {
      const { getGardeningQuestStatus } = await import('./src/etl/ingestion/gardeningQuestIndexer.js');
      const status = await getGardeningQuestStatus();
      res.json(status);
    } catch (error) {
      console.error('[API] Error fetching gardening quest status:', error);
      res.status(500).json({ error: 'Failed to fetch gardening quest status', details: error.message });
    }
  });

  // POST /api/admin/gardening-quest/trigger - Trigger indexer run
  app.post('/api/admin/gardening-quest/trigger', isAdmin, async (req, res) => {
    try {
      const { runGardeningQuestIndexer } = await import('./src/etl/ingestion/gardeningQuestIndexer.js');
      runGardeningQuestIndexer().catch(err => console.error('[GardeningQuest] Background error:', err));
      res.json({ status: 'triggered', message: 'Gardening quest indexer started in background' });
    } catch (error) {
      console.error('[API] Error triggering gardening quest indexer:', error);
      res.status(500).json({ error: 'Failed to trigger gardening quest indexer', details: error.message });
    }
  });

  // POST /api/admin/gardening-quest/auto-run - Start/stop auto-run
  app.post('/api/admin/gardening-quest/auto-run', isAdmin, async (req, res) => {
    try {
      const { action } = req.body;
      if (!action || !['start', 'stop'].includes(action)) {
        return res.status(400).json({ error: 'Invalid action. Use "start" or "stop"' });
      }
      
      const { startGardeningQuestAutoRun, stopGardeningQuestAutoRun } = 
        await import('./src/etl/ingestion/gardeningQuestIndexer.js');
      
      if (action === 'start') {
        const result = startGardeningQuestAutoRun();
        res.json({ status: 'started', ...result });
      } else {
        const result = stopGardeningQuestAutoRun();
        res.json({ status: 'stopped', ...result });
      }
    } catch (error) {
      console.error('[API] Error managing gardening quest auto-run:', error);
      res.status(500).json({ error: 'Failed to manage gardening quest auto-run', details: error.message });
    }
  });

  // GET /api/admin/gardening-quest/hero/:heroId - Get rewards for a specific hero
  app.get('/api/admin/gardening-quest/hero/:heroId', isAdmin, async (req, res) => {
    try {
      const heroId = parseInt(req.params.heroId);
      const limit = parseInt(req.query.limit) || 100;
      const { getHeroRewards, getHeroStats } = await import('./src/etl/ingestion/gardeningQuestIndexer.js');
      const [rewards, stats] = await Promise.all([
        getHeroRewards(heroId, limit),
        getHeroStats(heroId),
      ]);
      res.json({ rewards, stats });
    } catch (error) {
      console.error('[API] Error fetching hero rewards:', error);
      res.status(500).json({ error: 'Failed to fetch hero rewards', details: error.message });
    }
  });

  // GET /api/admin/gardening-quest/player/:player - Get rewards for a specific player
  app.get('/api/admin/gardening-quest/player/:player', isAdmin, async (req, res) => {
    try {
      const player = req.params.player;
      const limit = parseInt(req.query.limit) || 100;
      const { getPlayerRewards } = await import('./src/etl/ingestion/gardeningQuestIndexer.js');
      const rewards = await getPlayerRewards(player, limit);
      res.json({ rewards, count: rewards.length });
    } catch (error) {
      console.error('[API] Error fetching player rewards:', error);
      res.status(500).json({ error: 'Failed to fetch player rewards', details: error.message });
    }
  });

  // GET /api/admin/gardening-quest/pool/:poolId - Get rewards for a specific pool
  app.get('/api/admin/gardening-quest/pool/:poolId', isAdmin, async (req, res) => {
    try {
      const poolId = parseInt(req.params.poolId);
      const limit = parseInt(req.query.limit) || 100;
      const { getRewardsByPool } = await import('./src/etl/ingestion/gardeningQuestIndexer.js');
      const rewards = await getRewardsByPool(poolId, limit);
      res.json({ rewards, count: rewards.length });
    } catch (error) {
      console.error('[API] Error fetching pool rewards:', error);
      res.status(500).json({ error: 'Failed to fetch pool rewards', details: error.message });
    }
  });

  // POST /api/admin/gardening-quest/reset - Reset indexer progress to rescan from scratch
  app.post('/api/admin/gardening-quest/reset', isAdmin, async (req, res) => {
    try {
      const { clearRewards = true } = req.body;
      const { resetGardeningQuestIndexer } = await import('./src/etl/ingestion/gardeningQuestIndexer.js');
      const result = await resetGardeningQuestIndexer(clearRewards);
      res.json(result);
    } catch (error) {
      console.error('[API] Error resetting gardening quest indexer:', error);
      res.status(500).json({ error: 'Failed to reset indexer', details: error.message });
    }
  });
  
  // POST /api/admin/gardening-quest/reset-to-block - Reset indexer to start from a specific block
  app.post('/api/admin/gardening-quest/reset-to-block', isAdmin, async (req, res) => {
    try {
      const { startBlock, clearRewards = true } = req.body;
      // Validate startBlock is a finite positive number
      if (typeof startBlock !== 'number' || !Number.isFinite(startBlock) || startBlock < 0) {
        return res.status(400).json({ error: 'startBlock is required and must be a non-negative finite number' });
      }
      const { resetGardeningQuestToBlock } = await import('./src/etl/ingestion/gardeningQuestIndexer.js');
      const result = await resetGardeningQuestToBlock(Math.floor(startBlock), clearRewards);
      res.json(result);
    } catch (error) {
      console.error('[API] Error resetting gardening quest indexer to block:', error);
      res.status(500).json({ error: 'Failed to reset indexer to block', details: error.message });
    }
  });
  
  // GET /api/admin/gardening-quest/expedition-zero-hero-stats - Check for expedition records with hero_id=0 that need reprocessing
  app.get('/api/admin/gardening-quest/expedition-zero-hero-stats', isAdmin, async (req, res) => {
    try {
      const { getExpeditionZeroHeroRecords, getEarliestExpeditionZeroHeroBlock } = await import('./src/etl/ingestion/gardeningQuestIndexer.js');
      const records = await getExpeditionZeroHeroRecords();
      const earliestBlock = await getEarliestExpeditionZeroHeroBlock();
      res.json({ 
        zeroHeroRecordsCount: records.length, 
        earliestBlock,
        sampleRecords: records.slice(0, 10),
        message: records.length > 0 
          ? `Found ${records.length} expedition records with hero_id=0 that need reprocessing. Earliest block: ${earliestBlock}`
          : 'No expedition records with hero_id=0 found - all rewards properly attributed.'
      });
    } catch (error) {
      console.error('[API] Error checking expedition zero-hero records:', error);
      res.status(500).json({ error: 'Failed to check expedition records', details: error.message });
    }
  });
  
  // POST /api/admin/gardening-quest/backfill-expeditions - Delete hero_id=0 expedition records and reindex from earliest block
  app.post('/api/admin/gardening-quest/backfill-expeditions', isAdmin, async (req, res) => {
    try {
      const { 
        deleteExpeditionZeroHeroRecords, 
        getEarliestExpeditionZeroHeroBlock,
        resetGardeningQuestToBlock,
        startGardeningWorkersAutoRun
      } = await import('./src/etl/ingestion/gardeningQuestIndexer.js');
      
      const earliestBlock = await getEarliestExpeditionZeroHeroBlock();
      if (!earliestBlock) {
        return res.json({ 
          success: true, 
          message: 'No expedition records with hero_id=0 found - no backfill needed',
          deletedRecords: 0
        });
      }
      
      // Delete the bad records first
      await deleteExpeditionZeroHeroRecords();
      console.log(`[GardeningQuest] Deleted expedition records with hero_id=0`);
      
      // Reset indexer to earliest block without clearing all rewards
      const result = await resetGardeningQuestToBlock(earliestBlock, false);
      console.log(`[GardeningQuest] Reset to block ${earliestBlock} for backfill`);
      
      // Start auto-run to reindex
      await startGardeningWorkersAutoRun();
      console.log(`[GardeningQuest] Started workers for backfill`);
      
      res.json({ 
        success: true, 
        message: `Deleted hero_id=0 expedition records and started reindexing from block ${earliestBlock}`,
        earliestBlock,
        ...result
      });
    } catch (error) {
      console.error('[API] Error backfilling expeditions:', error);
      res.status(500).json({ error: 'Failed to backfill expeditions', details: error.message });
    }
  });
  
  // ===========================================
  // GARDENING YIELD CALCULATOR & VALIDATOR ROUTES
  // ===========================================

  // POST /api/admin/gardening-calc/calculate - Calculate expected gardening rewards (single hero)
  app.post('/api/admin/gardening-calc/calculate', isAdmin, async (req, res) => {
    try {
      const { calculateGardeningRewards } = await import('./src/services/gardeningCalculator.js');
      const result = await calculateGardeningRewards(req.body);
      res.json({ ok: true, ...result });
    } catch (error) {
      console.error('[GardeningCalc] Calculate error:', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // POST /api/admin/gardening-calc/calculate-dual - Calculate rewards for two heroes (JEWEL + CRYSTAL)
  app.post('/api/admin/gardening-calc/calculate-dual', isAdmin, async (req, res) => {
    try {
      const { calculateDualHeroRewards } = await import('./src/services/gardeningCalculator.js');
      const result = await calculateDualHeroRewards(req.body);
      res.json({ ok: true, ...result });
    } catch (error) {
      console.error('[GardeningCalc] Dual calculate error:', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // GET /api/admin/gardening-calc/reward-fund - Get current Quest Reward Fund balances
  app.get('/api/admin/gardening-calc/reward-fund', isAdmin, async (req, res) => {
    try {
      const { getQuestRewardFundBalances } = await import('./src/services/gardeningCalculator.js');
      const balances = await getQuestRewardFundBalances(true);
      res.json({ ok: true, ...balances });
    } catch (error) {
      console.error('[GardeningCalc] Reward fund error:', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // GET /api/admin/gardening-calc/pool-allocation/:poolId - Get pool allocation percentage
  app.get('/api/admin/gardening-calc/pool-allocation/:poolId', isAdmin, async (req, res) => {
    try {
      const { getPoolAllocation, POOL_NAMES } = await import('./src/services/gardeningCalculator.js');
      const poolId = parseInt(req.params.poolId);
      const allocation = await getPoolAllocation(poolId);
      res.json({ 
        ok: true, 
        poolId, 
        poolName: POOL_NAMES[poolId] || `Pool ${poolId}`,
        allocation,
        allocationPct: (allocation * 100).toFixed(2) + '%'
      });
    } catch (error) {
      console.error('[GardeningCalc] Pool allocation error:', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // GET /api/admin/gardening-validate/summary - Get validation data summary
  app.get('/api/admin/gardening-validate/summary', isAdmin, async (req, res) => {
    try {
      const { getValidationSummary } = await import('./src/services/gardeningValidator.js');
      const summary = await getValidationSummary();
      res.json({ ok: true, ...summary });
    } catch (error) {
      console.error('[GardeningValidator] Summary error:', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // POST /api/admin/gardening-validate/accuracy - Validate formula accuracy against indexed data
  app.post('/api/admin/gardening-validate/accuracy', isAdmin, async (req, res) => {
    try {
      const { validateFormulaAccuracy } = await import('./src/services/gardeningValidator.js');
      const result = await validateFormulaAccuracy(req.body);
      res.json(result);
    } catch (error) {
      console.error('[GardeningValidator] Accuracy error:', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // GET /api/admin/gardening-validate/hero/:heroId - Get reward history for a hero
  app.get('/api/admin/gardening-validate/hero/:heroId', isAdmin, async (req, res) => {
    try {
      const { getHeroRewardHistory } = await import('./src/services/gardeningValidator.js');
      const heroId = parseInt(req.params.heroId);
      const history = await getHeroRewardHistory(heroId);
      res.json({ ok: true, heroId, rewards: history });
    } catch (error) {
      console.error('[GardeningValidator] Hero history error:', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // GET /api/admin/gardening-validate/pool/:poolId - Get pool statistics from indexed data
  app.get('/api/admin/gardening-validate/pool/:poolId', isAdmin, async (req, res) => {
    try {
      const { getPoolStatistics } = await import('./src/services/gardeningValidator.js');
      const poolId = parseInt(req.params.poolId);
      const stats = await getPoolStatistics(poolId);
      res.json({ ok: true, ...stats });
    } catch (error) {
      console.error('[GardeningValidator] Pool stats error:', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // GET /api/admin/gardening-validate/indexed-rewards - Get indexed rewards with snapshots
  app.get('/api/admin/gardening-validate/indexed-rewards', isAdmin, async (req, res) => {
    try {
      const { getIndexedRewardsWithSnapshots } = await import('./src/services/gardeningValidator.js');
      const { limit = 50, poolId, heroId } = req.query;
      const rewards = await getIndexedRewardsWithSnapshots({
        limit: parseInt(limit),
        poolId: poolId ? parseInt(poolId) : null,
        heroId: heroId ? parseInt(heroId) : null,
      });
      res.json({ ok: true, count: rewards.length, rewards });
    } catch (error) {
      console.error('[GardeningValidator] Indexed rewards error:', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // GET /api/admin/gardening-calc/hero/:heroId - Fetch hero stats by ID
  app.get('/api/admin/gardening-calc/hero/:heroId', isAdmin, async (req, res) => {
    try {
      const { getHeroStatsById } = await import('./src/services/gardeningCalculator.js');
      const result = await getHeroStatsById(req.params.heroId);
      res.json(result);
    } catch (error) {
      console.error('[GardeningCalc] Hero lookup error:', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // GET /api/admin/gardening-calc/pet/:petId - Fetch pet bonuses by ID
  app.get('/api/admin/gardening-calc/pet/:petId', isAdmin, async (req, res) => {
    try {
      const { getPetBonusesById } = await import('./src/services/gardeningCalculator.js');
      const result = await getPetBonusesById(req.params.petId);
      res.json(result);
    } catch (error) {
      console.error('[GardeningCalc] Pet lookup error:', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // GET /api/admin/gardening-calc/wallet/:address/positions - Get all LP positions for a wallet
  app.get('/api/admin/gardening-calc/wallet/:address/positions', isAdmin, async (req, res) => {
    try {
      const { getUserPoolPositions } = await import('./src/services/gardeningCalculator.js');
      const result = await getUserPoolPositions(req.params.address);
      res.json(result);
    } catch (error) {
      console.error('[GardeningCalc] Wallet positions error:', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });

  // ===========================================
  // TOURNAMENT/BATTLE-READY HEROES ADMIN ROUTES
  // ===========================================

  // GET /api/admin/tournament/status - Get tournament indexer status with live worker data
  app.get("/api/admin/tournament/status", isAdmin, async (req, res) => {
    try {
      const { getTournamentIndexerStatus, getLiveIndexerState } = await import("./src/etl/ingestion/tournamentIndexer.js");
      const status = await getTournamentIndexerStatus();
      const liveState = getLiveIndexerState();
      res.json({ ok: true, ...status, live: liveState });
    } catch (error) {
      console.error('[Tournament Admin] Error getting status:', error);
      res.status(500).json({ ok: false, error: error?.message ?? String(error) });
    }
  });

  // GET /api/admin/tournament/dbcheck - Debug endpoint to check DB counts
  app.get("/api/admin/tournament/dbcheck", isAdmin, async (req, res) => {
    try {
      const { sql } = await import('drizzle-orm');
      
      const [tournamentCount] = await db.execute(sql`SELECT COUNT(*) as count FROM pvp_tournaments`);
      const [placementCount] = await db.execute(sql`SELECT COUNT(*) as count FROM tournament_placements`);
      const [snapshotCount] = await db.execute(sql`SELECT COUNT(*) as count FROM hero_tournament_snapshots`);
      const [dbName] = await db.execute(sql`SELECT current_database() as name`);
      
      res.json({
        ok: true,
        database: dbName?.name,
        counts: {
          tournaments: parseInt(tournamentCount?.count || '0'),
          placements: parseInt(placementCount?.count || '0'),
          snapshots: parseInt(snapshotCount?.count || '0'),
        }
      });
    } catch (error) {
      console.error('[Tournament Debug] Error:', error);
      res.status(500).json({ ok: false, error: error?.message ?? String(error) });
    }
  });

  // POST /api/admin/tournament/trigger - Trigger battle indexing (non-blocking)
  // realm: 'cv' = Crystalvale Tavern, 'sd' = Serendale/Sundered Isles Barkeep
  app.post("/api/admin/tournament/trigger", isAdmin, async (req, res) => {
    try {
      const body = req.body || {};
      const { maxBattles = 100, realm = 'cv' } = body;
      const { runTournamentIndexer, getLiveIndexerState, REALM_DISPLAY_NAMES } = await import("./src/etl/ingestion/tournamentIndexer.js");
      
      const realmName = REALM_DISPLAY_NAMES?.[realm] || realm;
      console.log(`[Tournament Admin] Starting indexer for ${realmName} with ${maxBattles} battles`);
      
      // Start indexer in background (don't await)
      runTournamentIndexer(maxBattles, realm).catch((err) => 
        console.error(`[Tournament Admin] Background indexer error (${realm}):`, err)
      );
      
      // Return immediate response with initial state
      const liveState = getLiveIndexerState();
      res.json({ ok: true, message: `Indexer started for ${realmName}`, realm, live: liveState });
    } catch (error) {
      console.error('[Tournament Admin] Error triggering indexer:', error);
      res.status(500).json({ ok: false, error: error?.message ?? String(error) });
    }
  });

  // POST /api/admin/tournament/stop - Stop the indexer
  app.post("/api/admin/tournament/stop", isAdmin, async (req, res) => {
    try {
      const { stopTournamentIndexer } = await import("./src/etl/ingestion/tournamentIndexer.js");
      const result = stopTournamentIndexer();
      res.json({ ok: true, ...result });
    } catch (error) {
      console.error('[Tournament Admin] Error stopping indexer:', error);
      res.status(500).json({ ok: false, error: error?.message ?? String(error) });
    }
  });

  // POST /api/admin/tournament/reset - Reset tournament indexer (clear all data)
  app.post("/api/admin/tournament/reset", isAdmin, async (req, res) => {
    try {
      const { stopTournamentIndexer, stopAutoRun } = await import("./src/etl/ingestion/tournamentIndexer.js");
      
      // Stop indexer and auto-run first if running
      stopAutoRun();
      stopTournamentIndexer();
      
      // Clear all tournament data using TRUNCATE (keeps tables, resets sequences)
      await db.execute(sql`TRUNCATE TABLE hero_tournament_snapshots, tournament_placements, pvp_tournaments RESTART IDENTITY CASCADE`);
      
      console.log('[Tournament Admin] Reset complete - all tournament data cleared');
      res.json({ 
        ok: true, 
        message: 'Tournament data reset. All tournaments, placements, and hero snapshots cleared.',
        tablesCleared: ['pvp_tournaments', 'tournament_placements', 'hero_tournament_snapshots']
      });
    } catch (error) {
      console.error('[Tournament Admin] Error resetting tournament data:', error);
      res.status(500).json({ ok: false, error: error?.message ?? String(error) });
    }
  });

  // POST /api/admin/tournament/autorun/start - Start auto-run
  // realm: 'cv', 'sd', or undefined (alternates both realms)
  app.post("/api/admin/tournament/autorun/start", isAdmin, async (req, res) => {
    try {
      const body = req.body || {};
      const { maxBattlesPerRun = 200, realm } = body;
      const { startAutoRun, REALM_DISPLAY_NAMES } = await import("./src/etl/ingestion/tournamentIndexer.js");
      const result = startAutoRun({ maxBattlesPerRun, realm });
      const realmInfo = realm ? REALM_DISPLAY_NAMES?.[realm] : 'both realms (alternating)';
      res.json({ ok: true, ...result, message: `Auto-run started for ${realmInfo}` });
    } catch (error) {
      console.error('[Tournament Admin] Error starting auto-run:', error);
      res.status(500).json({ ok: false, error: error?.message ?? String(error) });
    }
  });

  // POST /api/admin/tournament/autorun/stop - Stop auto-run
  app.post("/api/admin/tournament/autorun/stop", isAdmin, async (req, res) => {
    try {
      const { stopAutoRun } = await import("./src/etl/ingestion/tournamentIndexer.js");
      const result = stopAutoRun();
      res.json({ ok: true, ...result });
    } catch (error) {
      console.error('[Tournament Admin] Error stopping auto-run:', error);
      res.status(500).json({ ok: false, error: error?.message ?? String(error) });
    }
  });

  // GET /api/admin/tournament/recent - Get recent indexed battles/tournaments
  app.get("/api/admin/tournament/recent", isAdmin, async (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 20;
      const { getRecentTournaments } = await import("./src/etl/ingestion/tournamentIndexer.js");
      const tournaments = await getRecentTournaments(limit);
      res.json({ ok: true, tournaments });
    } catch (error) {
      console.error('[Tournament Admin] Error getting recent tournaments:', error);
      res.status(500).json({ ok: false, error: error?.message ?? String(error) });
    }
  });

  // GET /api/admin/similarity/config - Get similarity scoring config
  app.get("/api/admin/similarity/config", isAdmin, async (req, res) => {
    try {
      const { getSimilarityConfig } = await import("./src/services/similarityScoring.js");
      const config = await getSimilarityConfig('default');
      res.json({ ok: true, config });
    } catch (error) {
      console.error('[Similarity Admin] Error getting config:', error);
      res.status(500).json({ ok: false, error: error?.message ?? String(error) });
    }
  });

  // PUT /api/admin/similarity/config - Update similarity scoring config
  app.put("/api/admin/similarity/config", isAdmin, async (req, res) => {
    try {
      const updates = req.body;
      const { updateSimilarityConfig } = await import("./src/services/similarityScoring.js");
      const config = await updateSimilarityConfig('default', updates);
      res.json({ ok: true, config });
    } catch (error) {
      console.error('[Similarity Admin] Error updating config:', error);
      res.status(500).json({ ok: false, error: error?.message ?? String(error) });
    }
  });

  // GET /api/admin/battle-ready/recommendations - Get battle-ready hero recommendations
  app.get("/api/admin/battle-ready/recommendations", isAdmin, async (req, res) => {
    try {
      const mainClass = req.query.mainClass;
      const levelMin = req.query.levelMin ? parseInt(req.query.levelMin) : undefined;
      const levelMax = req.query.levelMax ? parseInt(req.query.levelMax) : undefined;
      const rarityMin = req.query.rarityMin ? parseInt(req.query.rarityMin) : undefined;
      const limit = req.query.limit ? parseInt(req.query.limit) : 50;
      
      const { getWinnerSnapshots } = await import("./src/etl/ingestion/tournamentIndexer.js");
      const recommendations = await getWinnerSnapshots({
        mainClass,
        levelMin,
        levelMax,
        rarityMin,
        limit,
      });
      
      res.json({ ok: true, recommendations, totalWinners: recommendations.length });
    } catch (error) {
      console.error('[Battle-Ready Admin] Error getting recommendations:', error);
      res.status(500).json({ ok: false, error: error?.message ?? String(error) });
    }
  });

  // GET /api/admin/battle-ready/class-profiles - Get all class stat profiles based on winning heroes
  app.get("/api/admin/battle-ready/class-profiles", isAdmin, async (req, res) => {
    try {
      const { getAllClassStatProfiles } = await import("./src/etl/ingestion/tournamentIndexer.js");
      const profiles = await getAllClassStatProfiles();
      res.json({ ok: true, profiles });
    } catch (error) {
      console.error('[Battle-Ready Admin] Error getting class profiles:', error);
      res.status(500).json({ ok: false, error: error?.message ?? String(error) });
    }
  });

  // GET /api/admin/battle-ready/class-profile/:class - Get stat profile for a specific class
  app.get("/api/admin/battle-ready/class-profile/:class", isAdmin, async (req, res) => {
    try {
      const mainClass = req.params.class;
      const limit = req.query.limit ? parseInt(req.query.limit) : 50;
      
      const { getClassStatProfile } = await import("./src/etl/ingestion/tournamentIndexer.js");
      const profile = await getClassStatProfile(mainClass, limit);
      
      res.json({ ok: true, ...profile });
    } catch (error) {
      console.error('[Battle-Ready Admin] Error getting class profile:', error);
      res.status(500).json({ ok: false, error: error?.message ?? String(error) });
    }
  });

  // POST /api/admin/battle-ready/find-similar - Find similar winning heroes based on a target hero's stats
  app.post("/api/admin/battle-ready/find-similar", isAdmin, async (req, res) => {
    try {
      const { targetClass, targetStats, levelMin, levelMax, rarityMin, rarityMax, minSimilarity, limit } = req.body;
      
      if (!targetClass || !targetStats) {
        return res.status(400).json({ ok: false, error: 'targetClass and targetStats are required' });
      }
      
      const { findSimilarWinners } = await import("./src/etl/ingestion/tournamentIndexer.js");
      const results = await findSimilarWinners(targetClass, targetStats, {
        levelMin,
        levelMax,
        rarityMin,
        rarityMax,
        minSimilarity: minSimilarity ?? 0.5,
        limit: limit ?? 20,
      });
      
      res.json({ ok: true, matches: results, totalMatches: results.length });
    } catch (error) {
      console.error('[Battle-Ready Admin] Error finding similar heroes:', error);
      res.status(500).json({ ok: false, error: error?.message ?? String(error) });
    }
  });

  // GET /api/admin/tournament/restrictions - Get tournament restriction stats for dashboard
  app.get("/api/admin/tournament/restrictions", isAdmin, async (req, res) => {
    try {
      const { getTournamentRestrictionStats } = await import("./src/etl/ingestion/tournamentIndexer.js");
      const stats = await getTournamentRestrictionStats();
      res.json({ ok: true, ...stats });
    } catch (error) {
      console.error('[Tournament Admin] Error getting restriction stats:', error);
      res.status(500).json({ ok: false, error: error?.message ?? String(error) });
    }
  });

  // GET /api/admin/tournament/signatures - Get tournament type signatures for grouping
  app.get("/api/admin/tournament/signatures", isAdmin, async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit) : 50;
      const { getTournamentSignatures } = await import("./src/etl/ingestion/tournamentIndexer.js");
      const signatures = await getTournamentSignatures(limit);
      res.json({ ok: true, signatures });
    } catch (error) {
      console.error('[Tournament Admin] Error getting signatures:', error);
      res.status(500).json({ ok: false, error: error?.message ?? String(error) });
    }
  });

  // =====================================================
  // TOURNAMENT TYPES - Pattern Detection & Labeling
  // (Must be defined BEFORE the :id route to prevent matching)
  // =====================================================
  
  // Ensure pvp_tournament_types table exists
  async function ensureTournamentTypesTableEarly() {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS pvp_tournament_types (
        id SERIAL PRIMARY KEY,
        signature TEXT UNIQUE,
        name_pattern TEXT,
        label TEXT NOT NULL,
        description TEXT,
        category TEXT DEFAULT 'general',
        color TEXT DEFAULT '#6366f1',
        occurrence_count INTEGER DEFAULT 0,
        last_seen_at TIMESTAMP WITH TIME ZONE,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
  }
  
  // GET /api/admin/tournament/patterns - Get discovered tournament patterns
  app.get("/api/admin/tournament/patterns", isAdmin, async (req, res) => {
    try {
      await ensureTournamentTypesTableEarly();
      
      // Get all restriction columns from actual tournament data, including entry fees and rewards
      const patterns = await db.execute(sql`
        SELECT 
          COALESCE(tournament_type_signature, 'no_signature') as signature,
          name as tournament_name,
          level_min,
          level_max,
          rarity_min,
          rarity_max,
          party_size,
          all_unique_classes,
          no_triple_classes,
          must_include_class,
          included_class_id,
          excluded_classes,
          excluded_consumables,
          battle_inventory,
          battle_budget,
          min_hero_stat_score,
          max_hero_stat_score,
          min_team_stat_score,
          max_team_stat_score,
          shot_clock_duration,
          COALESCE(min_glories, 0) as min_glories,
          COALESCE(MAX(sponsor_count), 0) as max_sponsor_count,
          COUNT(*) as occurrence_count,
          MAX(end_time) as last_seen_at
        FROM pvp_tournaments
        WHERE status = 'completed'
        GROUP BY 
          tournament_type_signature, name, level_min, level_max, rarity_min, rarity_max,
          party_size, all_unique_classes, no_triple_classes, must_include_class, included_class_id,
          excluded_classes, excluded_consumables, battle_inventory, battle_budget,
          min_hero_stat_score, max_hero_stat_score, min_team_stat_score, max_team_stat_score,
          shot_clock_duration, min_glories
        ORDER BY occurrence_count DESC
        LIMIT 100
      `);
      
      const labels = await db.execute(sql`
        SELECT * FROM pvp_tournament_types WHERE is_active = true
      `);
      
      const labelMap = new Map(labels.map(l => [l.signature || l.name_pattern, l]));
      const enrichedPatterns = patterns.map(p => ({
        ...p,
        label: labelMap.get(p.signature)?.label || labelMap.get(p.tournament_name)?.label || null,
        labelInfo: labelMap.get(p.signature) || labelMap.get(p.tournament_name) || null,
      }));
      
      res.json({ ok: true, patterns: enrichedPatterns, totalLabels: labels.length });
    } catch (error) {
      console.error('[Tournament Types] Error getting patterns:', error);
      res.status(500).json({ ok: false, error: error?.message ?? String(error) });
    }
  });
  
  // GET /api/admin/tournament/types - Get all tournament type labels
  app.get("/api/admin/tournament/types", isAdmin, async (req, res) => {
    try {
      await ensureTournamentTypesTableEarly();
      
      const types = await db.execute(sql`
        SELECT * FROM pvp_tournament_types 
        WHERE is_active = true 
        ORDER BY occurrence_count DESC
      `);
      
      res.json({ ok: true, types });
    } catch (error) {
      console.error('[Tournament Types] Error getting types:', error);
      res.status(500).json({ ok: false, error: error?.message ?? String(error) });
    }
  });
  
  // POST /api/admin/tournament/types - Create or update a tournament type label
  app.post("/api/admin/tournament/types", isAdmin, async (req, res) => {
    try {
      await ensureTournamentTypesTableEarly();
      
      const { signature, namePattern, label, description, category, color } = req.body;
      
      if (!label) {
        return res.status(400).json({ ok: false, error: 'Label is required' });
      }
      if (!signature && !namePattern) {
        return res.status(400).json({ ok: false, error: 'Either signature or namePattern is required' });
      }
      
      let occurrenceCount = 0;
      let lastSeenAt = null;
      
      if (signature) {
        const countResult = await db.execute(sql`
          SELECT COUNT(*) as count, MAX(end_time) as last_seen 
          FROM pvp_tournaments 
          WHERE tournament_type_signature = ${signature}
        `);
        occurrenceCount = parseInt(countResult[0]?.count || 0);
        lastSeenAt = countResult[0]?.last_seen;
      } else if (namePattern) {
        const countResult = await db.execute(sql`
          SELECT COUNT(*) as count, MAX(end_time) as last_seen 
          FROM pvp_tournaments 
          WHERE name ILIKE ${'%' + namePattern + '%'}
        `);
        occurrenceCount = parseInt(countResult[0]?.count || 0);
        lastSeenAt = countResult[0]?.last_seen;
      }
      
      let result;
      
      if (signature) {
        // Upsert by signature (unique constraint handles conflict)
        result = await db.execute(sql`
          INSERT INTO pvp_tournament_types (signature, name_pattern, label, description, category, color, occurrence_count, last_seen_at, updated_at)
          VALUES (${signature}, ${namePattern || null}, ${label}, ${description || null}, ${category || 'general'}, ${color || '#6366f1'}, ${occurrenceCount}, ${lastSeenAt}, NOW())
          ON CONFLICT (signature) 
          DO UPDATE SET 
            label = EXCLUDED.label,
            description = EXCLUDED.description,
            category = EXCLUDED.category,
            color = EXCLUDED.color,
            occurrence_count = EXCLUDED.occurrence_count,
            last_seen_at = EXCLUDED.last_seen_at,
            updated_at = NOW()
          RETURNING *
        `);
      } else {
        // For name-pattern-only labels, check if one already exists and update it, or insert new
        const existing = await db.execute(sql`
          SELECT id FROM pvp_tournament_types 
          WHERE name_pattern = ${namePattern} AND signature IS NULL AND is_active = true
          LIMIT 1
        `);
        
        if (existing[0]?.id) {
          // Update existing name-pattern label
          result = await db.execute(sql`
            UPDATE pvp_tournament_types 
            SET label = ${label}, 
                description = ${description || null}, 
                category = ${category || 'general'}, 
                color = ${color || '#6366f1'}, 
                occurrence_count = ${occurrenceCount}, 
                last_seen_at = ${lastSeenAt},
                updated_at = NOW()
            WHERE id = ${existing[0].id}
            RETURNING *
          `);
        } else {
          // Insert new name-pattern label
          result = await db.execute(sql`
            INSERT INTO pvp_tournament_types (signature, name_pattern, label, description, category, color, occurrence_count, last_seen_at, updated_at)
            VALUES (NULL, ${namePattern}, ${label}, ${description || null}, ${category || 'general'}, ${color || '#6366f1'}, ${occurrenceCount}, ${lastSeenAt}, NOW())
            RETURNING *
          `);
        }
      }
      
      res.json({ ok: true, type: result[0] });
    } catch (error) {
      console.error('[Tournament Types] Error creating/updating type:', error);
      res.status(500).json({ ok: false, error: error?.message ?? String(error) });
    }
  });
  
  // DELETE /api/admin/tournament/types/:id - Soft delete a tournament type
  app.delete("/api/admin/tournament/types/:id", isAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      
      await db.execute(sql`
        UPDATE pvp_tournament_types SET is_active = false, updated_at = NOW() WHERE id = ${id}
      `);
      
      res.json({ ok: true, deleted: id });
    } catch (error) {
      console.error('[Tournament Types] Error deleting type:', error);
      res.status(500).json({ ok: false, error: error?.message ?? String(error) });
    }
  });
  
  // GET /api/admin/tournament/types/:id/heroes - Get winning heroes for a tournament type
  app.get("/api/admin/tournament/types/:id/heroes", isAdmin, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const limit = req.query.limit ? parseInt(req.query.limit) : 50;
      
      const typeResult = await db.execute(sql`
        SELECT * FROM pvp_tournament_types WHERE id = ${id}
      `);
      
      if (!typeResult[0]) {
        return res.status(404).json({ ok: false, error: 'Tournament type not found' });
      }
      
      const type = typeResult[0];
      
      let heroes;
      if (type.signature) {
        heroes = await db.execute(sql`
          SELECT 
            s.*,
            p.placement,
            p.placement_rank,
            t.name as tournament_name,
            t.tournament_id
          FROM hero_tournament_snapshots s
          JOIN tournament_placements p ON s.placement_id = p.id
          JOIN pvp_tournaments t ON s.tournament_id = t.tournament_id
          WHERE t.tournament_type_signature = ${type.signature}
            AND p.placement = 'winner'
          ORDER BY s.created_at DESC
          LIMIT ${limit}
        `);
      } else if (type.name_pattern) {
        heroes = await db.execute(sql`
          SELECT 
            s.*,
            p.placement,
            p.placement_rank,
            t.name as tournament_name,
            t.tournament_id
          FROM hero_tournament_snapshots s
          JOIN tournament_placements p ON s.placement_id = p.id
          JOIN pvp_tournaments t ON s.tournament_id = t.tournament_id
          WHERE t.name ILIKE ${'%' + type.name_pattern + '%'}
            AND p.placement = 'winner'
          ORDER BY s.created_at DESC
          LIMIT ${limit}
        `);
      } else {
        heroes = [];
      }
      
      res.json({ ok: true, type, heroes });
    } catch (error) {
      console.error('[Tournament Types] Error getting heroes for type:', error);
      res.status(500).json({ ok: false, error: error?.message ?? String(error) });
    }
  });

  // GET /api/admin/tournament/:id - Get full tournament details with restrictions
  app.get("/api/admin/tournament/:id", isAdmin, async (req, res) => {
    try {
      const tournamentId = parseInt(req.params.id);
      if (isNaN(tournamentId)) {
        return res.status(400).json({ ok: false, error: 'Invalid tournament ID' });
      }
      
      const { getTournamentDetails } = await import("./src/etl/ingestion/tournamentIndexer.js");
      const details = await getTournamentDetails(tournamentId);
      
      if (!details) {
        return res.status(404).json({ ok: false, error: 'Tournament not found' });
      }
      
      res.json({ ok: true, ...details });
    } catch (error) {
      console.error('[Tournament Admin] Error getting tournament details:', error);
      res.status(500).json({ ok: false, error: error?.message ?? String(error) });
    }
  });

  // GET /api/admin/tournament/by-signature/:signature - Get tournaments by signature
  app.get("/api/admin/tournament/by-signature/:signature", isAdmin, async (req, res) => {
    try {
      const signature = decodeURIComponent(req.params.signature);
      const limit = req.query.limit ? parseInt(req.query.limit) : 50;
      
      const { getTournamentsBySignature } = await import("./src/etl/ingestion/tournamentIndexer.js");
      const tournaments = await getTournamentsBySignature(signature, limit);
      
      res.json({ ok: true, signature, tournaments });
    } catch (error) {
      console.error('[Tournament Admin] Error getting tournaments by signature:', error);
      res.status(500).json({ ok: false, error: error?.message ?? String(error) });
    }
  });

  // GET /api/admin/tavern-listings - Fetch heroes from indexed database (fast)
  // Falls back to live DFK API if no indexed data available
  // Supports tournament-ready filtering: rarity, combat power, level, TTS
  app.get("/api/admin/tavern-listings", isAdmin, async (req, res) => {
    try {
      console.log('[Tavern] Starting tavern-listings request...');
      
      // Parse all filter parameters
      const limit = req.query.limit ? parseInt(req.query.limit) : 50;
      const maxTts = req.query.maxTts ? parseInt(req.query.maxTts) : undefined;
      const minTts = req.query.minTts ? parseInt(req.query.minTts) : undefined;
      const minRarity = req.query.minRarity ? parseInt(req.query.minRarity) : undefined;
      const maxRarity = req.query.maxRarity ? parseInt(req.query.maxRarity) : undefined;
      const minCombatPower = req.query.minCombatPower ? parseInt(req.query.minCombatPower) : undefined;
      const maxCombatPower = req.query.maxCombatPower ? parseInt(req.query.maxCombatPower) : undefined;
      const minLevel = req.query.minLevel ? parseInt(req.query.minLevel) : undefined;
      const maxLevel = req.query.maxLevel ? parseInt(req.query.maxLevel) : undefined;
      const mainClass = req.query.mainClass || undefined;
      const sortBy = req.query.sortBy || 'price'; // price, combat_power, value, level, tts
      const sortOrder = req.query.sortOrder || 'asc';
      const realm = req.query.realm || undefined; // cv, sd, or undefined for both
      
      // Try to get from indexed database first
      try {
        const { getTavernHeroes, getIndexerProgress } = await import("./src/etl/ingestion/tavernIndexer.js");
        const progress = await getIndexerProgress();
        
        // Check if we have recent indexed data (any heroes indexed)
        const totalIndexed = progress.reduce((sum, p) => sum + (p.heroes_indexed || 0), 0);
        
        if (totalIndexed > 0) {
          console.log('[Tavern] Serving from indexed database with filters:', { 
            minRarity, minCombatPower, minLevel, sortBy 
          });
          
          // Build filter options
          const filterOptions = { 
            maxTts, minTts, minRarity, maxRarity, 
            minCombatPower, maxCombatPower, 
            minLevel, maxLevel, mainClass,
            sortBy, sortOrder, limit 
          };
          
          // Get heroes from both realms (or specific realm if requested)
          let cvHeroes = [];
          let sdHeroes = [];
          
          if (!realm || realm === 'cv') {
            cvHeroes = await getTavernHeroes({ ...filterOptions, realm: 'cv' });
          }
          if (!realm || realm === 'sd') {
            sdHeroes = await getTavernHeroes({ ...filterOptions, realm: 'sd' });
          }
          
          // Transform to match expected format
          const transformHero = (h) => ({
            id: h.hero_id,
            normalizedId: Number(h.normalized_id),
            mainClassStr: h.main_class,
            subClassStr: h.sub_class || '',
            professionStr: h.profession || '',
            rarity: h.rarity || 0,
            level: h.level || 1,
            generation: h.generation || 0,
            summons: h.summons || 0,
            maxSummons: h.max_summons || 0,
            salePrice: h.sale_price || '0',
            strength: h.strength || 0,
            agility: h.agility || 0,
            intelligence: h.intelligence || 0,
            wisdom: h.wisdom || 0,
            luck: h.luck || 0,
            dexterity: h.dexterity || 0,
            vitality: h.vitality || 0,
            endurance: h.endurance || 0,
            hp: h.hp || 0,
            mp: h.mp || 0,
            stamina: h.stamina || 25,
            active1: h.active1,
            active2: h.active2,
            passive1: h.passive1,
            passive2: h.passive2,
            tavern: h.realm,
            nativeToken: h.native_token,
            priceNative: parseFloat(h.price_native) || 0,
            priceUSD: null,
            traitScore: h.trait_score || 0,
            combatPower: h.combat_power || 0,
            summonStone: h.summon_stone || null,
            stoneTier: h.stone_tier || null,
            stoneType: h.stone_type || null
          });
          
          const crystalvale = cvHeroes.map(transformHero);
          const serendale = sdHeroes.map(transformHero);
          
          // Get last indexed time from progress
          const lastIndexed = progress.find(p => p.last_success_at)?.last_success_at || null;
          
          return res.json({
            ok: true,
            source: 'indexed',
            lastIndexed,
            prices: { crystal: 0, jewel: 0 },
            crystalvale,
            serendale,
            totalListings: crystalvale.length + serendale.length
          });
        }
      } catch (indexerError) {
        console.log('[Tavern] Indexer not available, falling back to live API:', indexerError.message);
      }
      
      // Fallback to live DFK API
      console.log('[Tavern] Fetching from live DFK API...');
      const DFK_TAVERN_API = 'https://api.defikingdoms.com/communityAllPublicHeroSaleAuctions';
      
      const apiResponse = await fetch(DFK_TAVERN_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: limit * 2, offset: 0 })
      }).then(async r => {
        if (!r.ok) throw new Error(`DFK API error: ${r.status}`);
        const data = await r.json();
        console.log('[Tavern] DFK API returned', data?.length || 0, 'heroes');
        return data;
      });
      
      const crystalPrice = 0;
      const jewelPrice = 0;
      
      // Helper to convert wei to token amount
      const weiToToken = (weiStr) => {
        if (!weiStr) return 0;
        const wei = BigInt(weiStr);
        const whole = wei / BigInt(1e18);
        const frac = Number(wei % BigInt(1e18)) / 1e18;
        return Number(whole) + frac;
      };
      
      const allHeroes = Array.isArray(apiResponse) ? apiResponse : [];
      
      // Class ID to name mapping (DFK returns numeric IDs)
      const CLASS_NAMES = {
        0: 'Warrior', 1: 'Knight', 2: 'Thief', 3: 'Archer', 4: 'Priest', 5: 'Wizard',
        6: 'Monk', 7: 'Pirate', 8: 'Berserker', 9: 'Seer', 10: 'Legionnaire', 11: 'Scholar',
        16: 'Paladin', 17: 'DarkKnight', 18: 'Summoner', 19: 'Ninja', 20: 'Shapeshifter',
        21: 'Bard', 24: 'Dragoon', 25: 'Sage', 26: 'SpellBow', 28: 'DreadKnight'
      };
      const PROFESSION_NAMES = {
        0: 'mining', 2: 'gardening', 4: 'fishing', 6: 'foraging'
      };
      const getClassName = (id) => CLASS_NAMES[parseInt(id)] || `Class${id}`;
      const getProfessionName = (id) => PROFESSION_NAMES[parseInt(id)] || `profession${id}`;
      
      // Hero ID ranges determine realm/tavern location:
      // - IDs >= 1,000,000,000,000 and < 2,000,000,000,000 = Crystalvale (DFK Chain) - CRYSTAL prices
      // - IDs >= 2,000,000,000,000 = Serendale/Sundered Isles (Klaytn) - JEWEL prices
      // - IDs < 1,000,000,000,000 = Legacy Serendale (Harmony) - skip
      const CV_ID_MIN = BigInt("1000000000000");
      const CV_ID_MAX = BigInt("2000000000000");
      
      const crystalvaleHeroes = [];
      const serendaleHeroes = [];
      
      for (const hero of allHeroes) {
        // DFK API uses 'startingPrice' or 'salePrice' field
        const priceField = hero.startingPrice || hero.salePrice || hero.price;
        const priceInToken = weiToToken(priceField);
        const heroId = BigInt(hero.id || hero.heroId);
        
        // Build normalized hero object with class names resolved
        const mainClassRaw = hero.mainClass ?? hero.mainClassStr;
        const subClassRaw = hero.subClass ?? hero.subClassStr;
        const professionRaw = hero.profession ?? hero.professionStr;
        
        // normalizedId should be a number (hero ID without the realm prefix)
        const normalizedIdNum = Number(heroId % BigInt(1000000000000));
        
        const normalizedHero = {
          id: String(heroId),
          normalizedId: hero.normalizedId ? Number(hero.normalizedId) : normalizedIdNum,
          mainClassStr: getClassName(mainClassRaw),
          subClassStr: subClassRaw != null ? getClassName(subClassRaw) : '',
          professionStr: getProfessionName(professionRaw),
          rarity: hero.rarity ?? 0,
          level: hero.level ?? 1,
          generation: hero.generation ?? 0,
          summons: hero.summons ?? 0,
          maxSummons: hero.maxSummons ?? 0,
          salePrice: priceField || '0',
          strength: hero.strength ?? 0,
          agility: hero.agility ?? 0,
          intelligence: hero.intelligence ?? 0,
          wisdom: hero.wisdom ?? 0,
          luck: hero.luck ?? 0,
          dexterity: hero.dexterity ?? 0,
          vitality: hero.vitality ?? 0,
          endurance: hero.endurance ?? 0,
          hp: hero.hp ?? 0,
          mp: hero.mp ?? 0,
          stamina: hero.stamina ?? 25,
          // Ability data for trait score calculation (TTS)
          active1: hero.active1 != null ? `ability_${hero.active1}` : null,
          active2: hero.active2 != null ? `ability_${hero.active2}` : null,
          passive1: hero.passive1 != null ? `ability_${hero.passive1}` : null,
          passive2: hero.passive2 != null ? `ability_${hero.passive2}` : null
        };
        
        if (heroId >= CV_ID_MIN && heroId < CV_ID_MAX) {
          // Crystalvale - prices in CRYSTAL
          crystalvaleHeroes.push({
            ...normalizedHero,
            tavern: 'cv',
            nativeToken: 'CRYSTAL',
            priceNative: priceInToken,
            priceUSD: crystalPrice > 0 ? priceInToken * crystalPrice : null
          });
        } else if (heroId >= CV_ID_MAX) {
          // Klaytn/Sundered Isles - prices in JEWEL
          serendaleHeroes.push({
            ...normalizedHero,
            tavern: 'sd',
            nativeToken: 'JEWEL',
            priceNative: priceInToken,
            priceUSD: jewelPrice > 0 ? priceInToken * jewelPrice : null
          });
        }
        // Skip heroes with IDs < 1 trillion (legacy Harmony Serendale, deprecated)
      }
      
      console.log('[Tavern] Categorized:', crystalvaleHeroes.length, 'CV heroes,', serendaleHeroes.length, 'SD heroes');
      
      // Sort by price ascending
      crystalvaleHeroes.sort((a, b) => a.priceNative - b.priceNative);
      serendaleHeroes.sort((a, b) => a.priceNative - b.priceNative);
      
      // Limit each list to requested limit
      const cvLimited = crystalvaleHeroes.slice(0, limit);
      const sdLimited = serendaleHeroes.slice(0, limit);
      
      res.json({
        ok: true,
        prices: {
          crystal: crystalPrice,
          jewel: jewelPrice
        },
        crystalvale: cvLimited,
        serendale: sdLimited,
        totalListings: cvLimited.length + sdLimited.length
      });
    } catch (error) {
      console.error('[Tavern Listings] Error fetching listings:', error);
      res.status(500).json({ ok: false, error: error?.message ?? String(error) });
    }
  });

  // ============================================================================
  // TAVERN INDEXER ADMIN ENDPOINTS
  // ============================================================================

  // GET /api/admin/tavern-indexer/hero/:heroId - Look up a specific hero
  app.get("/api/admin/tavern-indexer/hero/:heroId", isAdmin, async (req, res) => {
    try {
      const { rawPg } = await import('./server/db.js');
      const heroId = req.params.heroId;
      
      const result = await rawPg`
        SELECT * FROM tavern_heroes WHERE hero_id = ${heroId}
      `;
      
      if (result.length === 0) {
        return res.json({ ok: false, error: 'Hero not found in tavern index' });
      }
      
      res.json({ ok: true, hero: result[0] });
    } catch (error) {
      console.error('[Tavern Indexer] Hero lookup error:', error);
      res.status(500).json({ ok: false, error: error?.message ?? String(error) });
    }
  });

  // GET /api/admin/tavern-indexer/status - Get indexer status
  app.get("/api/admin/tavern-indexer/status", isAdmin, async (req, res) => {
    try {
      const { getIndexerStatus, getIndexerProgress, getTavernStats } = await import("./src/etl/ingestion/tavernIndexer.js");
      
      const status = getIndexerStatus();
      const progress = await getIndexerProgress();
      const stats = await getTavernStats();
      
      res.json({ ok: true, status, progress, stats });
    } catch (error) {
      console.error('[Tavern Indexer] Status error:', error);
      res.status(500).json({ ok: false, error: error?.message ?? String(error) });
    }
  });

  // POST /api/admin/tavern-indexer/trigger - Manually trigger indexing
  app.post("/api/admin/tavern-indexer/trigger", isAdmin, async (req, res) => {
    try {
      const { triggerTavernIndex, getIndexerStatus } = await import("./src/etl/ingestion/tavernIndexer.js");
      
      console.log('[Tavern Indexer] Manual trigger requested');
      
      // Start indexer in background (don't await)
      triggerTavernIndex().catch((err) => {
        console.error('[Tavern Indexer] Background run error:', err);
      });
      
      // Return immediately with current status
      const status = getIndexerStatus();
      res.json({ ok: true, message: 'Indexing started', status });
    } catch (error) {
      console.error('[Tavern Indexer] Trigger error:', error);
      res.status(500).json({ ok: false, error: error?.message ?? String(error) });
    }
  });

  // POST /api/admin/tavern-indexer/reset - Reset all indexed heroes
  app.post("/api/admin/tavern-indexer/reset", isAdmin, async (req, res) => {
    try {
      const { resetTavernIndex, getIndexerStatus } = await import("./src/etl/ingestion/tavernIndexer.js");
      
      // Block reset during active indexing
      const currentStatus = getIndexerStatus();
      if (currentStatus.isRunning) {
        return res.status(409).json({ ok: false, error: 'Cannot reset while indexer is running' });
      }
      
      console.log('[Tavern Indexer] Reset requested - clearing all heroes');
      
      const result = await resetTavernIndex();
      const status = getIndexerStatus();
      
      res.json({ ok: true, message: 'Tavern index reset', status });
    } catch (error) {
      console.error('[Tavern Indexer] Reset error:', error);
      res.status(500).json({ ok: false, error: error?.message ?? String(error) });
    }
  });

  // POST /api/admin/tavern-indexer/start - Start auto-run scheduler
  app.post("/api/admin/tavern-indexer/start", isAdmin, async (req, res) => {
    try {
      const intervalMs = req.body?.intervalMs || 30 * 60 * 1000; // Default 30 minutes
      const { startAutoRun, getIndexerStatus } = await import("./src/etl/ingestion/tavernIndexer.js");
      
      console.log(`[Tavern Indexer] Starting auto-run (interval: ${intervalMs / 1000}s)`);
      
      const result = startAutoRun(intervalMs);
      const status = getIndexerStatus();
      
      res.json({ ok: true, ...result, status });
    } catch (error) {
      console.error('[Tavern Indexer] Start error:', error);
      res.status(500).json({ ok: false, error: error?.message ?? String(error) });
    }
  });

  // POST /api/admin/tavern-indexer/stop - Stop auto-run scheduler
  app.post("/api/admin/tavern-indexer/stop", isAdmin, async (req, res) => {
    try {
      const { stopAutoRun, getIndexerStatus } = await import("./src/etl/ingestion/tavernIndexer.js");
      
      console.log('[Tavern Indexer] Stopping auto-run');
      
      const result = stopAutoRun();
      const status = getIndexerStatus();
      
      res.json({ ok: true, ...result, status });
    } catch (error) {
      console.error('[Tavern Indexer] Stop error:', error);
      res.status(500).json({ ok: false, error: error?.message ?? String(error) });
    }
  });

  // POST /api/admin/tavern-indexer/force-stop - Force stop indexer and reset state
  app.post("/api/admin/tavern-indexer/force-stop", isAdmin, async (req, res) => {
    try {
      const { forceStopIndexer, getIndexerStatus } = await import("./src/etl/ingestion/tavernIndexer.js");
      
      console.log('[Tavern Indexer] Force stop requested');
      
      const result = await forceStopIndexer();
      const status = getIndexerStatus();
      
      res.json({ ok: true, ...result, status });
    } catch (error) {
      console.error('[Tavern Indexer] Force stop error:', error);
      res.status(500).json({ ok: false, error: error?.message ?? String(error) });
    }
  });

  // GET /api/admin/tavern-indexer/heroes - Get indexed heroes with filters
  app.get("/api/admin/tavern-indexer/heroes", isAdmin, async (req, res) => {
    try {
      const { getTavernHeroes } = await import("./src/etl/ingestion/tavernIndexer.js");
      
      const options = {
        realm: req.query.realm,
        maxTts: req.query.maxTts ? parseInt(req.query.maxTts) : undefined,
        mainClass: req.query.mainClass,
        minPrice: req.query.minPrice ? parseFloat(req.query.minPrice) : undefined,
        maxPrice: req.query.maxPrice ? parseFloat(req.query.maxPrice) : undefined,
        limit: req.query.limit ? parseInt(req.query.limit) : 100,
        offset: req.query.offset ? parseInt(req.query.offset) : 0
      };
      
      const heroes = await getTavernHeroes(options);
      
      res.json({ ok: true, heroes, count: heroes.length });
    } catch (error) {
      console.error('[Tavern Indexer] Heroes query error:', error);
      res.status(500).json({ ok: false, error: error?.message ?? String(error) });
    }
  });

  // POST /api/admin/tavern-indexer/backfill-genes - Trigger gene backfill from GraphQL
  app.post("/api/admin/tavern-indexer/backfill-genes", isAdmin, async (req, res) => {
    try {
      const { runGeneBackfill, getGeneBackfillStatus, getGenesStats } = await import("./src/etl/ingestion/tavernIndexer.js");
      
      const maxHeroes = parseInt(req.body?.maxHeroes || req.query?.maxHeroes) || 500;
      const concurrency = parseInt(req.body?.concurrency || req.query?.concurrency) || 6;
      console.log(`[Gene Backfill] Trigger requested (max: ${maxHeroes}, concurrency: ${concurrency})`);
      
      runGeneBackfill(maxHeroes, concurrency).catch((err) => {
        console.error('[Gene Backfill] Background run error:', err);
      });
      
      const status = getGeneBackfillStatus();
      const stats = await getGenesStats();
      
      res.json({ ok: true, message: 'Gene backfill started', status, stats });
    } catch (error) {
      console.error('[Gene Backfill] Trigger error:', error);
      res.status(500).json({ ok: false, error: error?.message ?? String(error) });
    }
  });

  // GET /api/admin/tavern-indexer/genes-status - Get gene backfill status
  app.get("/api/admin/tavern-indexer/genes-status", isAdmin, async (req, res) => {
    try {
      const { getGeneBackfillStatus, getGenesStats } = await import("./src/etl/ingestion/tavernIndexer.js");
      
      const status = getGeneBackfillStatus();
      const rawStats = await getGenesStats();
      
      // Transform raw SQL result into the format expected by frontend
      // rawStats is array like [{ genes_status: 'complete', count: '500' }, { genes_status: 'pending', count: '200' }]
      let complete = 0;
      let incomplete = 0;
      
      for (const row of rawStats) {
        const count = parseInt(row.count) || 0;
        if (row.genes_status === 'complete') {
          complete = count;
        } else {
          incomplete += count;
        }
      }
      
      const total = complete + incomplete;
      const percentage = total > 0 ? (complete / total) * 100 : 0;
      
      const stats = { complete, incomplete, total, percentage };
      
      res.json({ ok: true, status, stats });
    } catch (error) {
      console.error('[Gene Backfill] Status error:', error);
      res.status(500).json({ ok: false, error: error?.message ?? String(error) });
    }
  });

  // POST /api/admin/tavern-indexer/reset-broken-genes - Reset genes_status for heroes with NULL stat_genes
  app.post("/api/admin/tavern-indexer/reset-broken-genes", isAdmin, async (req, res) => {
    try {
      const { resetBrokenGeneStatus } = await import("./src/etl/ingestion/tavernIndexer.js");
      
      console.log('[Gene Backfill] Reset broken genes requested');
      const result = await resetBrokenGeneStatus();
      
      res.json(result);
    } catch (error) {
      console.error('[Gene Backfill] Reset broken genes error:', error);
      res.status(500).json({ ok: false, error: error?.message ?? String(error) });
    }
  });

  // ============================================================================
  // MARKET INTEL & SALE INGESTION ENDPOINTS
  // ============================================================================

  // GET /api/admin/market-intel/status - Get sale ingestion status
  app.get("/api/admin/market-intel/status", isAdmin, async (req, res) => {
    try {
      const { getSaleIngestionStatus, getSalesStats } = await import("./src/etl/ingestion/saleIngestionService.js");
      
      const status = getSaleIngestionStatus();
      const stats = await getSalesStats(null, 30);
      
      res.json({ ok: true, status, stats });
    } catch (error) {
      console.error('[Market Intel] Status error:', error);
      res.status(500).json({ ok: false, error: error?.message ?? String(error) });
    }
  });

  // POST /api/admin/market-intel/snapshot - Take a listing snapshot
  app.post("/api/admin/market-intel/snapshot", isAdmin, async (req, res) => {
    try {
      const { takeListingSnapshot } = await import("./src/etl/ingestion/saleIngestionService.js");
      
      console.log('[Market Intel] Manual snapshot triggered');
      const result = await takeListingSnapshot();
      
      res.json({ ok: true, ...result });
    } catch (error) {
      console.error('[Market Intel] Snapshot error:', error);
      res.status(500).json({ ok: false, error: error?.message ?? String(error) });
    }
  });

  // POST /api/admin/market-intel/reconcile - Run sale reconciliation
  app.post("/api/admin/market-intel/reconcile", isAdmin, async (req, res) => {
    try {
      const { reconcileSales } = await import("./src/etl/ingestion/saleIngestionService.js");
      
      console.log('[Market Intel] Manual reconciliation triggered');
      const result = await reconcileSales();
      
      res.json({ ok: true, ...result });
    } catch (error) {
      console.error('[Market Intel] Reconcile error:', error);
      res.status(500).json({ ok: false, error: error?.message ?? String(error) });
    }
  });

  // POST /api/admin/market-intel/full-cycle - Run full ingestion cycle
  app.post("/api/admin/market-intel/full-cycle", isAdmin, async (req, res) => {
    try {
      const { runFullIngestionCycle } = await import("./src/etl/ingestion/saleIngestionService.js");
      
      console.log('[Market Intel] Full ingestion cycle triggered');
      const result = await runFullIngestionCycle();
      
      res.json({ ok: true, ...result });
    } catch (error) {
      console.error('[Market Intel] Full cycle error:', error);
      res.status(500).json({ ok: false, error: error?.message ?? String(error) });
    }
  });

  // POST /api/admin/market-intel/start-auto - Start auto ingestion
  app.post("/api/admin/market-intel/start-auto", isAdmin, async (req, res) => {
    try {
      const { startAutoIngestion, getSaleIngestionStatus } = await import("./src/etl/ingestion/saleIngestionService.js");
      
      const intervalMs = req.body?.intervalMs || 60 * 60 * 1000; // Default 1 hour
      console.log(`[Market Intel] Starting auto ingestion (interval: ${intervalMs / 60000} min)`);
      
      startAutoIngestion(intervalMs);
      const status = getSaleIngestionStatus();
      
      res.json({ ok: true, message: 'Auto ingestion started', status });
    } catch (error) {
      console.error('[Market Intel] Start auto error:', error);
      res.status(500).json({ ok: false, error: error?.message ?? String(error) });
    }
  });

  // POST /api/admin/market-intel/stop-auto - Stop auto ingestion
  app.post("/api/admin/market-intel/stop-auto", isAdmin, async (req, res) => {
    try {
      const { stopAutoIngestion, getSaleIngestionStatus } = await import("./src/etl/ingestion/saleIngestionService.js");
      
      console.log('[Market Intel] Stopping auto ingestion');
      stopAutoIngestion();
      const status = getSaleIngestionStatus();
      
      res.json({ ok: true, message: 'Auto ingestion stopped', status });
    } catch (error) {
      console.error('[Market Intel] Stop auto error:', error);
      res.status(500).json({ ok: false, error: error?.message ?? String(error) });
    }
  });

  // GET /api/admin/market-intel/recent-sales - Get recent sales with hero data
  app.get("/api/admin/market-intel/recent-sales", isAdmin, async (req, res) => {
    try {
      const { getRecentSales } = await import("./src/etl/ingestion/saleIngestionService.js");
      
      const limit = req.query.limit ? parseInt(req.query.limit) : 50;
      const realm = req.query.realm || null;
      
      const sales = await getRecentSales(limit, realm);
      
      res.json({ ok: true, sales, count: sales.length });
    } catch (error) {
      console.error('[Market Intel] Recent sales error:', error);
      res.status(500).json({ ok: false, error: error?.message ?? String(error) });
    }
  });

  // GET /api/admin/market-intel/demand-metrics - Get demand metrics by cohort
  app.get("/api/admin/market-intel/demand-metrics", isAdmin, async (req, res) => {
    try {
      const realm = req.query.realm || null;
      const mainClass = req.query.mainClass || null;
      
      let query;
      if (realm && mainClass) {
        query = sql`
          SELECT * FROM tavern_demand_metrics 
          WHERE realm = ${realm} AND main_class = ${mainClass}
          ORDER BY as_of_date DESC, demand_score DESC
          LIMIT 100
        `;
      } else if (realm) {
        query = sql`
          SELECT * FROM tavern_demand_metrics 
          WHERE realm = ${realm}
          ORDER BY as_of_date DESC, demand_score DESC
          LIMIT 100
        `;
      } else {
        query = sql`
          SELECT * FROM tavern_demand_metrics 
          ORDER BY as_of_date DESC, demand_score DESC
          LIMIT 100
        `;
      }
      
      const result = await db.execute(query);
      const metrics = Array.isArray(result) ? result : (result.rows || []);
      
      res.json({ ok: true, metrics, count: metrics.length });
    } catch (error) {
      console.error('[Market Intel] Demand metrics error:', error);
      res.status(500).json({ ok: false, error: error?.message ?? String(error) });
    }
  });

  // ============================================================================
  // SUMMON PROFIT TRACKER ENDPOINTS
  // ============================================================================

  // GET /api/admin/profit-tracker/sessions - Get summon sessions
  app.get("/api/admin/profit-tracker/sessions", isAdmin, async (req, res) => {
    try {
      const wallet = req.query.wallet || null;
      const status = req.query.status || null;
      const limit = parseInt(req.query.limit) || 50;
      
      let query;
      if (wallet && status) {
        query = sql`
          SELECT * FROM summon_sessions 
          WHERE wallet_address = ${wallet} AND status = ${status}
          ORDER BY created_at DESC
          LIMIT ${limit}
        `;
      } else if (wallet) {
        query = sql`
          SELECT * FROM summon_sessions 
          WHERE wallet_address = ${wallet}
          ORDER BY created_at DESC
          LIMIT ${limit}
        `;
      } else if (status) {
        query = sql`
          SELECT * FROM summon_sessions 
          WHERE status = ${status}
          ORDER BY created_at DESC
          LIMIT ${limit}
        `;
      } else {
        query = sql`
          SELECT * FROM summon_sessions 
          ORDER BY created_at DESC
          LIMIT ${limit}
        `;
      }
      
      const result = await db.execute(query);
      const sessions = Array.isArray(result) ? result : (result.rows || []);
      
      res.json({ ok: true, sessions, count: sessions.length });
    } catch (error) {
      console.error('[Profit Tracker] Sessions error:', error);
      res.status(500).json({ ok: false, error: error?.message ?? String(error) });
    }
  });

  // POST /api/admin/profit-tracker/sessions - Create a new summon session
  app.post("/api/admin/profit-tracker/sessions", isAdmin, async (req, res) => {
    try {
      const { 
        realm, walletAddress, parent1HeroId, parent2HeroId,
        parent1CostNative, parent2CostNative, summonFeeNative,
        enhancementStonesUsed, enhancementStoneCostNative,
        nativeToken, targetTraits
      } = req.body;
      
      if (!realm || !walletAddress || !parent1HeroId || !parent2HeroId || !nativeToken) {
        return res.status(400).json({ ok: false, error: 'Missing required fields' });
      }
      
      // Safely parse numeric fields, defaulting to 0 for NaN values
      const parseCost = (val) => {
        if (val === '' || val === null || val === undefined) return null;
        const num = Number(val);
        return isNaN(num) ? null : num;
      };
      
      const p1Cost = parseCost(parent1CostNative);
      const p2Cost = parseCost(parent2CostNative);
      const summonFee = parseCost(summonFeeNative);
      const stoneCost = parseCost(enhancementStoneCostNative);
      const stonesUsed = parseInt(enhancementStonesUsed) || 0;
      
      const totalCost = (p1Cost || 0) + (p2Cost || 0) + (summonFee || 0) + (stoneCost || 0);
      
      // Safely handle targetTraits - only stringify if defined
      const targetTraitsJson = targetTraits != null ? JSON.stringify(targetTraits) : null;
      
      await db.execute(sql`
        INSERT INTO summon_sessions (
          realm, wallet_address, parent1_hero_id, parent2_hero_id,
          parent1_cost_native, parent2_cost_native, summon_fee_native,
          enhancement_stones_used, enhancement_stone_cost_native,
          total_cost_native, native_token, target_traits, status
        ) VALUES (
          ${realm}, ${walletAddress}, ${parent1HeroId}, ${parent2HeroId},
          ${p1Cost}, ${p2Cost}, ${summonFee},
          ${stonesUsed}, ${stoneCost},
          ${totalCost}, ${nativeToken}, ${targetTraitsJson}, 'pending'
        )
      `);
      
      res.json({ ok: true, message: 'Session created' });
    } catch (error) {
      console.error('[Profit Tracker] Create session error:', error);
      res.status(500).json({ ok: false, error: error?.message ?? String(error) });
    }
  });

  // GET /api/admin/profit-tracker/conversion-metrics - Get conversion metrics
  app.get("/api/admin/profit-tracker/conversion-metrics", isAdmin, async (req, res) => {
    try {
      const realm = req.query.realm || null;
      
      let query;
      if (realm) {
        query = sql`
          SELECT * FROM summon_conversion_metrics 
          WHERE realm = ${realm}
          ORDER BY as_of_date DESC, conversion_rate DESC
          LIMIT 100
        `;
      } else {
        query = sql`
          SELECT * FROM summon_conversion_metrics 
          ORDER BY as_of_date DESC, conversion_rate DESC
          LIMIT 100
        `;
      }
      
      const result = await db.execute(query);
      const metrics = Array.isArray(result) ? result : (result.rows || []);
      
      res.json({ ok: true, metrics, count: metrics.length });
    } catch (error) {
      console.error('[Profit Tracker] Conversion metrics error:', error);
      res.status(500).json({ ok: false, error: error?.message ?? String(error) });
    }
  });

  // GET /api/admin/profit-tracker/roi-summary - Get ROI summary
  app.get("/api/admin/profit-tracker/roi-summary", isAdmin, async (req, res) => {
    try {
      const wallet = req.query.wallet || null;
      
      let baseQuery;
      if (wallet) {
        baseQuery = sql`
          SELECT 
            COUNT(*) as total_sessions,
            COUNT(CASE WHEN status = 'sold' THEN 1 END) as sold_count,
            SUM(total_cost_native) as total_invested,
            (SELECT SUM(sale_price_native) FROM summon_sales_outcomes sso 
             JOIN summon_sessions ss ON sso.session_id = ss.id 
             WHERE ss.wallet_address = ${wallet}) as total_revenue,
            (SELECT SUM(profit_native) FROM summon_sales_outcomes sso 
             JOIN summon_sessions ss ON sso.session_id = ss.id 
             WHERE ss.wallet_address = ${wallet}) as total_profit
          FROM summon_sessions
          WHERE wallet_address = ${wallet}
        `;
      } else {
        baseQuery = sql`
          SELECT 
            COUNT(*) as total_sessions,
            COUNT(CASE WHEN status = 'sold' THEN 1 END) as sold_count,
            SUM(total_cost_native) as total_invested,
            (SELECT SUM(sale_price_native) FROM summon_sales_outcomes) as total_revenue,
            (SELECT SUM(profit_native) FROM summon_sales_outcomes) as total_profit
          FROM summon_sessions
        `;
      }
      
      const result = await db.execute(baseQuery);
      const summary = Array.isArray(result) ? result[0] : (result.rows?.[0] || {});
      
      res.json({ ok: true, summary });
    } catch (error) {
      console.error('[Profit Tracker] ROI summary error:', error);
      res.status(500).json({ ok: false, error: error?.message ?? String(error) });
    }
  });

  // ============================================================================
  // SUMMONING CALCULATOR ENDPOINTS
  // ============================================================================

  // GET /api/admin/summoning/hero/:id - Get hero with decoded genetics
  app.get("/api/admin/summoning/hero/:id", isAdmin, async (req, res) => {
    try {
      const heroId = req.params.id;
      
      if (!heroId) {
        return res.status(400).json({ ok: false, error: 'Hero ID required' });
      }
      
      // Fetch hero from DFK GraphQL API
      const hero = await onchain.getHeroById(heroId);
      
      if (!hero) {
        return res.status(404).json({ ok: false, error: 'Hero not found' });
      }
      
      // Decode full genetics (D/R1/R2/R3)
      let genetics = null;
      try {
        genetics = decodeHeroGenes(hero);
      } catch (decodeError) {
        console.warn('[Summoning] Gene decode warning:', decodeError.message);
      }
      
      res.json({
        ok: true,
        hero: {
          id: hero.id,
          normalizedId: hero.normalizedId,
          mainClass: hero.mainClassStr,
          subClass: hero.subClassStr,
          profession: hero.professionStr,
          rarity: hero.rarity,
          rarityName: ['Common', 'Uncommon', 'Rare', 'Legendary', 'Mythic'][hero.rarity] || 'Unknown',
          level: hero.level,
          generation: hero.generation,
          summons: hero.summons,
          maxSummons: hero.maxSummons,
          summonsRemaining: hero.summonsRemaining,
          strength: hero.strength,
          agility: hero.agility,
          intelligence: hero.intelligence,
          wisdom: hero.wisdom,
          luck: hero.luck,
          dexterity: hero.dexterity,
          vitality: hero.vitality,
          endurance: hero.endurance,
          hp: hero.hp,
          mp: hero.mp,
          statGenes: hero.statGenes,
          visualGenes: hero.visualGenes,
          owner: hero.owner?.name || hero.owner?.id || 'Unknown'
        },
        genetics
      });
    } catch (error) {
      console.error('[Summoning] Hero fetch error:', error);
      res.status(500).json({ ok: false, error: error?.message ?? String(error) });
    }
  });

  // POST /api/admin/summoning/calculate - Calculate summoning probabilities
  app.post("/api/admin/summoning/calculate", isAdmin, async (req, res) => {
    try {
      const { hero1Id, hero2Id } = req.body;
      
      if (!hero1Id || !hero2Id) {
        return res.status(400).json({ ok: false, error: 'Both hero IDs required' });
      }
      
      // Fetch both heroes
      const [hero1, hero2] = await Promise.all([
        onchain.getHeroById(hero1Id),
        onchain.getHeroById(hero2Id)
      ]);
      
      if (!hero1) {
        return res.status(404).json({ ok: false, error: `Hero ${hero1Id} not found` });
      }
      if (!hero2) {
        return res.status(404).json({ ok: false, error: `Hero ${hero2Id} not found` });
      }
      
      // Decode genetics
      let genetics1, genetics2;
      try {
        genetics1 = decodeHeroGenes(hero1);
        genetics2 = decodeHeroGenes(hero2);
      } catch (decodeError) {
        return res.status(400).json({ ok: false, error: 'Could not decode hero genetics: ' + decodeError.message });
      }
      
      // Get rarity names
      const rarityNames = ['Common', 'Uncommon', 'Rare', 'Legendary', 'Mythic'];
      const rarity1 = rarityNames[hero1.rarity] || 'Common';
      const rarity2 = rarityNames[hero2.rarity] || 'Common';
      
      // Calculate probabilities
      const probabilities = calculateSummoningProbabilities(genetics1, genetics2, rarity1, rarity2);
      
      // Calculate offspring generation
      const offspringGeneration = Math.max(hero1.generation, hero2.generation) + 1;
      
      res.json({
        ok: true,
        parent1: {
          id: hero1.id,
          normalizedId: hero1.normalizedId,
          mainClass: hero1.mainClassStr,
          subClass: hero1.subClassStr,
          rarity: hero1.rarity,
          rarityName: rarity1,
          level: hero1.level,
          generation: hero1.generation,
          summonsRemaining: hero1.summonsRemaining
        },
        parent2: {
          id: hero2.id,
          normalizedId: hero2.normalizedId,
          mainClass: hero2.mainClassStr,
          subClass: hero2.subClassStr,
          rarity: hero2.rarity,
          rarityName: rarity2,
          level: hero2.level,
          generation: hero2.generation,
          summonsRemaining: hero2.summonsRemaining
        },
        genetics1,
        genetics2,
        probabilities,
        offspringGeneration
      });
    } catch (error) {
      console.error('[Summoning] Calculate error:', error);
      res.status(500).json({ ok: false, error: error?.message ?? String(error) });
    }
  });

  // ============================================================================
  // SUMMON SNIPER - Find optimal hero pairs from tavern
  // ============================================================================

  // GET /api/admin/sniper/filters - Get available filter options
  app.get("/api/admin/sniper/filters", isAdmin, async (req, res) => {
    try {
      const { rawPg } = await import('./server/db.js');
      
      // Get distinct values from tavern_heroes
      const [classesResult, professionsResult, realmsResult, priceRangeResult, levelRangeResult, ttsRangeResult] = await Promise.all([
        rawPg`SELECT DISTINCT main_class FROM tavern_heroes WHERE main_class IS NOT NULL ORDER BY main_class`,
        rawPg`SELECT DISTINCT profession FROM tavern_heroes WHERE profession IS NOT NULL ORDER BY profession`,
        rawPg`SELECT DISTINCT realm FROM tavern_heroes ORDER BY realm`,
        rawPg`SELECT MIN(price_native) as min_price, MAX(price_native) as max_price FROM tavern_heroes WHERE price_native > 0`,
        rawPg`SELECT MIN(level) as min_level, MAX(level) as max_level FROM tavern_heroes`,
        rawPg`SELECT MIN(trait_score) as min_tts, MAX(trait_score) as max_tts FROM tavern_heroes`
      ]);

      const classes = classesResult.map(r => r.main_class);
      const professions = professionsResult.map(r => r.profession);
      const realms = realmsResult.map(r => r.realm);
      const priceRange = priceRangeResult[0] || { min_price: 0, max_price: 10000 };
      const levelRange = levelRangeResult[0] || { min_level: 1, max_level: 100 };
      const ttsRange = ttsRangeResult[0] || { min_tts: 0, max_tts: 100 };

      // Static ability lists (active and passive skills from DFK)
      const activeSkills = [
        // Basic
        'Poisoned Blade', 'Blinding Winds', 'Heal', 'Cleanse', 'Iron Skin', 'Speed', 'Critical Aim', 'Deathmark',
        // Advanced
        'Exhaust', 'Daze', 'Explosion', 'Hardened Shield',
        // Elite
        'Stun', 'Second Wind',
        // Transcendant
        'Resurrection'
      ];
      const passiveSkills = [
        // Basic
        'Duelist', 'Clutch', 'Foresight', 'Headstrong', 'Clear Vision', 'Fearless', 'Chatterbox', 'Stalwart',
        // Advanced
        'Leadership', 'Efficient', 'Intimidation', 'Toxic',
        // Elite
        'Giant Slayer', 'Last Stand',
        // Transcendant
        'Second Life'
      ];

      res.json({
        ok: true,
        filters: {
          classes,
          professions,
          realms,
          activeSkills,
          passiveSkills,
          priceRange: {
            min: parseFloat(priceRange.min_price) || 0,
            max: parseFloat(priceRange.max_price) || 10000
          },
          levelRange: {
            min: parseInt(levelRange.min_level) || 1,
            max: parseInt(levelRange.max_level) || 100
          },
          ttsRange: {
            min: parseFloat(ttsRange.min_tts) || 0,
            max: parseFloat(ttsRange.max_tts) || 100
          },
          rarities: [
            { id: 0, name: 'Common' },
            { id: 1, name: 'Uncommon' },
            { id: 2, name: 'Rare' },
            { id: 3, name: 'Legendary' },
            { id: 4, name: 'Mythic' }
          ]
        }
      });
    } catch (error) {
      console.error('[Sniper] Filters error:', error);
      res.status(500).json({ ok: false, error: error?.message ?? String(error) });
    }
  });

  // POST /api/admin/sniper/search - Find optimal hero pairs
  app.post("/api/admin/sniper/search", isAdmin, async (req, res) => {
    try {
      const { rawPg } = await import('./server/db.js');
      const { getHeroById } = await import('./onchain-data.js');
      
      // Check if minSummonsRemaining was explicitly provided
      const minSummonsExplicit = req.body.minSummonsRemaining !== undefined;
      
      const {
        targetClasses = [],
        targetProfessions = [],
        targetActiveSkills = [],
        targetPassiveSkills = [],
        realms = ['cv', 'sd'],
        minSummonsRemaining = 0,
        maxSummonsRemaining = undefined,  // Optional filter for max summons remaining
        minRarity = 0,
        maxGeneration = 10,
        minLevel = 1,
        maxTTS = null,
        tearPrice = 0.05,
        summonType = 'regular',  // 'regular' or 'dark'
        searchMode = 'tavern',   // 'tavern' or 'myHero'
        myHeroId = null,         // Hero ID for 'myHero' mode
        bridgeFeeUsd = 0.50,     // Estimated bridging fee per hero in USD (Metis heroes need bridging to CV)
        minOffspringSkillScore = null,  // Minimum expected offspring skill score (TTS) - null means no filter
        targetTTSValue = null,   // Target TTS value for cumulative probability filter (e.g., 8 means "TTS >= 8")
        minTTSProbability = null, // Minimum probability % of achieving targetTTSValue (e.g., 20 means ">= 20% chance")
        sortBy = 'efficiency',   // 'efficiency', 'chance', 'price', or 'skillScore'
        limit = 20
      } = req.body;

      // Normalize inputs to arrays
      const classArray = Array.isArray(targetClasses) ? targetClasses : (targetClasses ? [targetClasses] : []);
      const professionArray = Array.isArray(targetProfessions) ? targetProfessions : (targetProfessions ? [targetProfessions] : []);
      const activeSkillArray = Array.isArray(targetActiveSkills) ? targetActiveSkills : (targetActiveSkills ? [targetActiveSkills] : []);
      const passiveSkillArray = Array.isArray(targetPassiveSkills) ? targetPassiveSkills : (targetPassiveSkills ? [targetPassiveSkills] : []);

      if (classArray.length === 0 && professionArray.length === 0 && activeSkillArray.length === 0 && passiveSkillArray.length === 0) {
        return res.status(400).json({ 
          ok: false, 
          error: 'At least one class, profession, or ability must be selected' 
        });
      }

      // Fetch current USD prices for tokens using fast focused price graph
      let crystalPriceUsd = 0;
      let jewelPriceUsd = 0;
      const CRYSTAL_ADDRESS = '0x04b9dA42306B023f3572e106B11D82aAd9D32EBb'.toLowerCase();
      const JEWEL_ADDRESS = '0xCCb93dABD71c8Dad03Fc4CE5559dC3D89F67a260'.toLowerCase();
      try {
        // Use focused price graph (fast, ~1-2 seconds) instead of full graph (~2-5 min)
        const priceGraph = await buildFocusedPriceGraph([]);
        crystalPriceUsd = priceGraph.get(CRYSTAL_ADDRESS) || 0;
        jewelPriceUsd = priceGraph.get(JEWEL_ADDRESS) || 0;
        console.log(`[Sniper] Token prices: CRYSTAL=$${crystalPriceUsd.toFixed(4)}, JEWEL=$${jewelPriceUsd.toFixed(4)}`);
      } catch (priceErr) {
        console.warn('[Sniper] Could not fetch token prices (proceeding without USD):', priceErr?.message);
      }

      const isDarkSummon = summonType === 'dark';
      const isMyHeroMode = searchMode === 'myHero' && myHeroId;
      
      // For regular summons, default to requiring at least 1 summon remaining
      // Only apply this default if minSummonsRemaining was NOT explicitly set by the client
      const effectiveMinSummons = (!minSummonsExplicit && !isDarkSummon && minSummonsRemaining === 0) 
        ? 1 
        : minSummonsRemaining;
      
      console.log('[Sniper] Search request:', { 
        targetClasses: classArray, targetProfessions: professionArray, 
        realms, minSummonsRemaining: effectiveMinSummons, maxSummonsRemaining, minRarity, minLevel, maxTTS, tearPrice,
        summonType, searchMode, myHeroId: isMyHeroMode ? myHeroId : null
      });

      // Validate realm filter - only allow known realms
      const validRealms = ['cv', 'sd'];
      const filteredRealms = Array.isArray(realms) 
        ? realms.filter(r => validRealms.includes(r))
        : validRealms;

      // Class tier definitions for tear cost calculation
      const basicClasses = ['Warrior', 'Knight', 'Thief', 'Archer', 'Priest', 'Wizard', 'Monk', 'Pirate', 'Berserker', 'Seer', 'Legionnaire', 'Scholar'];
      const advancedClasses = ['Paladin', 'DarkKnight', 'Summoner', 'Ninja', 'Shapeshifter', 'Bard'];
      const eliteClasses = ['Dragoon', 'Sage', 'Spellbow'];
      const exaltedClasses = ['DreadKnight'];
      
      function getClassTier(className) {
        const normalized = className?.toLowerCase() || '';
        if (exaltedClasses.some(c => c.toLowerCase() === normalized)) return 'exalted';
        if (eliteClasses.some(c => c.toLowerCase() === normalized)) return 'elite';
        if (advancedClasses.some(c => c.toLowerCase() === normalized)) return 'advanced';
        return 'basic';
      }
      
      function getMinTears(tier) {
        const tearsByTier = { basic: 10, advanced: 40, elite: 70, exalted: 100 };
        return tearsByTier[tier] || 10;
      }
      
      function calculateSummonTokenCost(generation, totalSummoned, useDarkSummon = false) {
        const baseCost = 6;
        const perChildIncrease = 2;
        const generationIncrease = 10;
        let cost = baseCost + (perChildIncrease * totalSummoned) + (generationIncrease * generation);
        if (generation === 0 && cost > 30) cost = 30;
        // Dark summon costs 1/4 of regular summon
        if (useDarkSummon) cost = cost / 4;
        return cost;
      }
      
      // TTS (Trait Score) calculation: sum of tier indices for active1, active2, passive1, passive2
      // Skill value ranges map to tiers: 0-15=Basic(0), 16-23=Advanced(1), 24-27=Elite(2), 28-31=Transcendent(3)
      function getSkillTier(skillValue) {
        if (skillValue == null) return 0;
        const val = parseInt(skillValue);
        if (val >= 28) return 3; // Transcendent
        if (val >= 24) return 2; // Elite
        if (val >= 16) return 1; // Advanced
        return 0; // Basic (0-15)
      }
      
      function calculateTTS(active1, active2, passive1, passive2) {
        return getSkillTier(active1) + getSkillTier(active2) + getSkillTier(passive1) + getSkillTier(passive2);
      }

      // Fetch heroes from INDEXED DATABASE (heroes with complete gene data)
      const safeTTS = maxTTS !== null ? parseFloat(maxTTS) : null;
      const safeMinLevel = parseInt(minLevel) || 1;
      
      console.log('[Sniper] Fetching heroes from indexed database (genes_status = complete)...');
      
      // Query indexed tavern heroes with complete gene data (no limit - search all)
      const indexedResult = await rawPg`
        SELECT * FROM tavern_heroes 
        WHERE genes_status = 'complete'
        ORDER BY price_native ASC NULLS LAST
      `;
      
      const apiResponse = indexedResult || [];
      console.log('[Sniper] Indexed database returned', apiResponse.length, 'heroes with complete genes');
      
      
      // Helper to convert wei to token amount
      const weiToToken = (weiStr) => {
        if (!weiStr) return 0;
        const wei = BigInt(weiStr);
        const whole = wei / BigInt(1e18);
        const frac = Number(wei % BigInt(1e18)) / 1e18;
        return Number(whole) + frac;
      };
      
      // Class ID to name mapping (DFK API returns numeric IDs)
      const CLASS_NAMES = {
        0: 'Warrior', 1: 'Knight', 2: 'Thief', 3: 'Archer', 4: 'Priest', 5: 'Wizard',
        6: 'Monk', 7: 'Pirate', 8: 'Berserker', 9: 'Seer', 10: 'Legionnaire', 11: 'Scholar',
        16: 'Paladin', 17: 'DarkKnight', 18: 'Summoner', 19: 'Ninja', 20: 'Shapeshifter',
        21: 'Bard', 24: 'Dragoon', 25: 'Sage', 26: 'SpellBow', 28: 'DreadKnight'
      };
      const getClassName = (id) => CLASS_NAMES[parseInt(id)] || `Class${id}`;
      
      // Profession ID to name mapping
      const PROFESSION_NAMES = {
        0: 'mining', 2: 'gardening', 4: 'fishing', 6: 'foraging'
      };
      const getProfessionName = (id) => PROFESSION_NAMES[parseInt(id)] || `profession${id}`;
      
      // Network values from DFK API determine realm
      // 'dfk' = DFK Chain (Crystalvale), 'met' = Metis (Sundered Isles)
      const NETWORK_TO_REALM = {
        'dfk': { realm: 'cv', token: 'CRYSTAL' },
        'met': { realm: 'sd', token: 'JEWEL' }
      };
      
      const allApiHeroes = Array.isArray(apiResponse) ? apiResponse : [];
      
      // Transform and filter heroes from indexed database
      // Indexed data has snake_case fields: hero_id, main_class, stat_genes, etc.
      let heroes = [];
      for (const hero of allApiHeroes) {
        // Handle indexed data format (already has hero_id, main_class, stat_genes)
        const heroId = hero.hero_id;
        const realm = hero.realm;
        const nativeToken = hero.native_token || (realm === 'cv' ? 'CRYSTAL' : 'JEWEL');
        
        // Apply realm filter
        if (!filteredRealms.includes(realm)) continue;
        
        const mainClass = hero.main_class;
        const subClass = hero.sub_class;
        const professionName = hero.profession;
        const rarity = parseInt(hero.rarity) || 0;
        const level = parseInt(hero.level) || 1;
        const generation = parseInt(hero.generation) || 0;
        const summons = parseInt(hero.summons) || 0;
        const maxSummons = parseInt(hero.max_summons) || 0;
        const summonsRemaining = maxSummons - summons;
        const priceInToken = parseFloat(hero.price_native) || 0;
        
        // Use pre-calculated TTS from index
        const heroTTS = parseInt(hero.trait_score) || 0;
        
        // Apply filters
        // Dark Summon can use heroes with 0 regular summons remaining, so skip this filter for dark summon
        if (!isDarkSummon && summonsRemaining < effectiveMinSummons) continue;
        if (!isDarkSummon && maxSummonsRemaining !== undefined && summonsRemaining > maxSummonsRemaining) continue;
        if (rarity < minRarity) continue;
        if (generation > maxGeneration) continue;
        if (level < safeMinLevel) continue;
        if (safeTTS !== null && heroTTS > safeTTS) continue;
        
        heroes.push({
          hero_id: String(heroId),
          normalized_id: parseInt(hero.normalized_id) || 0,
          realm,
          main_class: mainClass,
          sub_class: subClass,
          profession: professionName,
          rarity,
          level,
          generation,
          summons,
          max_summons: maxSummons,
          price_native: priceInToken,
          native_token: nativeToken,
          trait_score: heroTTS,
          combat_power: parseInt(hero.combat_power) || 0,
          stat_genes: hero.stat_genes,
          visual_genes: hero.visual_genes,
          genes_status: hero.genes_status,
          main_class_r1: hero.main_class_r1,
          main_class_r2: hero.main_class_r2,
          main_class_r3: hero.main_class_r3,
          sub_class_r1: hero.sub_class_r1,
          sub_class_r2: hero.sub_class_r2,
          sub_class_r3: hero.sub_class_r3,
          active1: hero.active1,
          active2: hero.active2,
          passive1: hero.passive1,
          passive2: hero.passive2,
          active1_r1: hero.active1_r1,
          active1_r2: hero.active1_r2,
          active1_r3: hero.active1_r3,
          active2_r1: hero.active2_r1,
          active2_r2: hero.active2_r2,
          active2_r3: hero.active2_r3,
          passive1_r1: hero.passive1_r1,
          passive1_r2: hero.passive1_r2,
          passive1_r3: hero.passive1_r3,
          passive2_r1: hero.passive2_r1,
          passive2_r2: hero.passive2_r2,
          passive2_r3: hero.passive2_r3
        });
      }
      
      console.log(`[Sniper] After filtering: ${heroes.length} eligible heroes`);
      
      // Now filter/select heroes for pairing
      // Prioritize heroes matching target classes AND/OR target professions
      const targetClassHeroes = classArray.length > 0 
        ? heroes.filter(h => classArray.includes(h.main_class))
        : [];
      const targetProfessionHeroes = professionArray.length > 0
        ? heroes.filter(h => professionArray.includes(h.profession))
        : [];
      
      console.log(`[Sniper] Found ${targetClassHeroes.length} heroes matching target classes`);
      console.log(`[Sniper] Found ${targetProfessionHeroes.length} heroes matching target professions`);
      
      // Sort all by price and take cheapest for pairing pool
      heroes.sort((a, b) => a.price_native - b.price_native);
      const cheapestHeroes = heroes.slice(0, 200);
      
      // Combine target class heroes + target profession heroes + cheapest, deduplicate
      const seenIds = new Set();
      const combinedHeroes = [];
      for (const h of [...targetClassHeroes, ...targetProfessionHeroes, ...cheapestHeroes]) {
        if (!seenIds.has(h.hero_id)) {
          combinedHeroes.push(h);
          seenIds.add(h.hero_id);
        }
      }
      heroes = combinedHeroes;
      
      console.log(`[Sniper] Found ${heroes.length} total eligible heroes (after dedup)`);

      // ============================================================
      // MY HERO MODE: Fetch user's hero and pair with tavern heroes
      // ============================================================
      let userHero = null;
      if (isMyHeroMode) {
        console.log(`[Sniper] MyHero mode - fetching hero ${myHeroId}...`);
        try {
          const heroData = await getHeroById(myHeroId);
          if (!heroData) {
            return res.status(404).json({ 
              ok: false, 
              error: `Hero ${myHeroId} not found` 
            });
          }
          
          // For user's own hero, determine realm from which chain it was fetched on
          // getHeroById queries DFK Chain by default, so those heroes use CRYSTAL
          // If heroData includes network/chain info, use that; otherwise default to DFK Chain
          const heroIdBig = BigInt(myHeroId);
          let userRealm = null;
          let userToken = null;
          
          // Check if heroData has network info from the RPC response
          if (heroData.network === 'met' || heroData.chainId === 1088) {
            userRealm = 'sd';
            userToken = 'JEWEL';
          } else {
            // Default to Crystalvale (DFK Chain) since that's where getHeroById queries
            userRealm = 'cv';
            userToken = 'CRYSTAL';
          }
          
          const userMainClass = getClassName(heroData.mainClass);
          const userSubClass = getClassName(heroData.subClass);
          const userProfession = getProfessionName(heroData.profession ?? 0);
          const userSummonsRemaining = (heroData.maxSummons ?? 0) - (heroData.summons ?? 0);
          
          // Dark summon can use any hero with summons remaining
          // More summons available = higher rarity chance
          
          userHero = {
            hero_id: String(myHeroId),
            normalized_id: Number(heroIdBig % BigInt(1000000000000)),
            realm: userRealm,
            main_class: userMainClass,
            sub_class: userSubClass,
            profession: userProfession,
            rarity: heroData.rarity ?? 0,
            level: heroData.level ?? 1,
            generation: heroData.generation ?? 0,
            summons: heroData.summons ?? 0,
            max_summons: heroData.maxSummons ?? 0,
            price_native: 0, // User already owns this hero
            native_token: userToken,
            is_user_hero: true,
            statGenes: heroData.statGenes,
            visualGenes: heroData.visualGenes
          };
          
          console.log(`[Sniper] User hero: ${userMainClass} (${userRealm}), ${userSummonsRemaining} summons remaining`);
          
          // Filter tavern heroes to same realm as user's hero
          heroes = heroes.filter(h => h.realm === userRealm);
          console.log(`[Sniper] Filtered to ${heroes.length} heroes in ${userRealm} realm`);
        } catch (err) {
          console.error('[Sniper] Error fetching user hero:', err);
          return res.status(500).json({ 
            ok: false, 
            error: `Failed to fetch hero: ${err.message}` 
          });
        }
      }

      const minHeroesRequired = isMyHeroMode ? 1 : 2;
      if (heroes.length < minHeroesRequired) {
        return res.json({
          ok: true,
          message: isMyHeroMode 
            ? 'No eligible tavern heroes found to pair with your hero'
            : 'Not enough eligible heroes found',
          pairs: [],
          totalHeroes: heroes.length,
          userHero: userHero ? {
            id: userHero.hero_id,
            mainClass: userHero.main_class,
            realm: userHero.realm
          } : null
        });
      }

      // Group heroes by realm for same-realm pairing (cheaper summoning)
      const byRealm = { cv: [], sd: [] };
      for (const h of heroes) {
        if (byRealm[h.realm]) byRealm[h.realm].push(h);
      }

      // Calculate full cost for a hero pair (purchase + summon token cost + tears + bridging)
      function calculatePairFullCost(hero1, hero2, tearPriceValue, useDarkSummon = false, bridgeFeePerHeroUsd = 0) {
        const purchaseCost = parseFloat(hero1.price_native) + parseFloat(hero2.price_native);
        
        // Summon token cost - uses the lower generation hero as summoner
        // Dark summon uses 1/4 of the regular cost
        const summonCost1 = calculateSummonTokenCost(hero1.generation, hero1.summons, useDarkSummon);
        const summonCost2 = calculateSummonTokenCost(hero2.generation, hero2.summons, useDarkSummon);
        const summonTokenCost = Math.min(summonCost1, summonCost2);
        
        // Tear cost - based on higher tier class between the two heroes
        // Dark summons don't require tears for the basic summon (only for optional rarity boost)
        const tier1 = getClassTier(hero1.main_class);
        const tier2 = getClassTier(hero2.main_class);
        const tierOrder = { basic: 0, advanced: 1, elite: 2, exalted: 3 };
        const higherTier = tierOrder[tier1] >= tierOrder[tier2] ? tier1 : tier2;
        const tearCount = useDarkSummon ? 0 : getMinTears(higherTier);  // No tears for dark summon
        const tearCost = tearCount * (tearPriceValue || 0.05);
        
        // Bridging cost - Metis heroes need to be bridged to CV for summoning
        // Count heroes that need bridging (realm = 'sd' = Metis)
        let heroesNeedingBridge = 0;
        if (hero1.realm === 'sd' && !hero1.is_user_hero) heroesNeedingBridge++;
        if (hero2.realm === 'sd' && !hero2.is_user_hero) heroesNeedingBridge++;
        const bridgeCostUsd = heroesNeedingBridge * bridgeFeePerHeroUsd;
        
        return {
          purchaseCost,
          summonTokenCost,
          tearCost,
          tearCount,
          bridgeCostUsd,
          heroesNeedingBridge,
          totalCost: purchaseCost + summonTokenCost + tearCost,
          isDarkSummon: useDarkSummon
        };
      }

      // Generate candidate pairs from all heroes
      // Strategy: Generate pairs where at least one hero is a target class/profession hero
      // This ensures we find the best pairs for summoning the target class/profession
      const candidatePairs = [];
      
      // Track which heroes match target criteria
      const targetClassSet = new Set(classArray.map(c => c.toLowerCase()));
      const targetProfessionSet = new Set(professionArray.map(p => p.toLowerCase()));
      const isTargetClass = (h) => targetClassSet.has((h.main_class || '').toLowerCase());
      const isTargetProfession = (h) => targetProfessionSet.has((h.profession || '').toLowerCase());
      const isTargetHero = (h) => isTargetClass(h) || isTargetProfession(h);
      
      if (isMyHeroMode && userHero) {
        // ============================================================
        // MY HERO MODE: Pair user's hero with each tavern hero
        // ============================================================
        console.log(`[Sniper] MyHero mode - generating pairs with user's hero...`);
        
        // Sort tavern heroes by price and take cheapest
        heroes.sort((a, b) => a.price_native - b.price_native);
        const tavernHeroesToPair = heroes.slice(0, 200);
        
        for (const tavernHero of tavernHeroesToPair) {
          const costs = calculatePairFullCost(userHero, tavernHero, tearPrice, isDarkSummon, bridgeFeeUsd);
          candidatePairs.push({ 
            hero1: userHero, 
            hero2: tavernHero, 
            realm: userHero.realm, 
            isMyHeroPair: true,
            ...costs 
          });
        }
        
        console.log(`[Sniper] Generated ${candidatePairs.length} pairs with user's hero`);
      } else {
        // ============================================================
        // TAVERN MODE: Pair tavern heroes with each other
        // ============================================================
        for (const realm of Object.keys(byRealm)) {
          const realmHeroes = byRealm[realm];
          if (realmHeroes.length < 2) continue;
          
          // Separate target class/profession heroes from others
          let targetHeroes = realmHeroes.filter(isTargetHero);
          const otherHeroes = realmHeroes.filter(h => !isTargetHero(h));
          
          // Sort others by price and limit to 100 cheapest
          otherHeroes.sort((a, b) => a.price_native - b.price_native);
          const cheapOthers = otherHeroes.slice(0, 100);
          
          // CRITICAL: Limit target heroes to prevent OOM when many classes are selected
          // With 20k+ target heroes, nested loop generates 200M+ pairs causing memory crash
          // Sort by price and limit to 500 cheapest targets per realm for pair generation
          if (targetHeroes.length > 500) {
            targetHeroes.sort((a, b) => a.price_native - b.price_native);
            targetHeroes = targetHeroes.slice(0, 500);
          }
          
          // Generate pairs:
          // 1. Target hero + Target hero (for best class probability)
          for (let i = 0; i < targetHeroes.length; i++) {
            for (let j = i + 1; j < targetHeroes.length; j++) {
              const hero1 = targetHeroes[i];
              const hero2 = targetHeroes[j];
              const costs = calculatePairFullCost(hero1, hero2, tearPrice, isDarkSummon, bridgeFeeUsd);
              candidatePairs.push({ hero1, hero2, realm, ...costs });
            }
          }
          
          // 2. Target hero + Cheap other hero
          for (const targetHero of targetHeroes) {
            for (const otherHero of cheapOthers) {
              const costs = calculatePairFullCost(targetHero, otherHero, tearPrice, isDarkSummon, bridgeFeeUsd);
              candidatePairs.push({ hero1: targetHero, hero2: otherHero, realm, ...costs });
            }
          }
          
          // 3. Cheap other + Cheap other (if no targets found, these can still produce target class)
          // Limit to top 30 cheapest to avoid explosion
          const cheapLimit = Math.min(cheapOthers.length, 30);
          for (let i = 0; i < cheapLimit; i++) {
            for (let j = i + 1; j < cheapLimit; j++) {
              const hero1 = cheapOthers[i];
              const hero2 = cheapOthers[j];
              const costs = calculatePairFullCost(hero1, hero2, tearPrice, isDarkSummon, bridgeFeeUsd);
              candidatePairs.push({ hero1, hero2, realm, ...costs });
            }
          }
        }
      }

      // Prioritize pairs containing target class/profession heroes when selecting pairs to score
      // This ensures we score pairs that are most likely to produce the target class/profession
      const pairsWithTarget = candidatePairs.filter(p => 
        isTargetHero(p.hero1) || isTargetHero(p.hero2)
      );
      const pairsWithoutTarget = candidatePairs.filter(p => 
        !isTargetHero(p.hero1) && !isTargetHero(p.hero2)
      );
      
      // Sort each group by cost
      pairsWithTarget.sort((a, b) => a.totalCost - b.totalCost);
      pairsWithoutTarget.sort((a, b) => a.totalCost - b.totalCost);
      
      // Score more pairs for better coverage - with indexed gene data this is fast
      // Sample from different price ranges to avoid missing expensive but good pairs
      const targetLimit = isMyHeroMode ? 2000 : 2000;
      const otherLimit = isMyHeroMode ? 200 : 200;
      const pairsToScore = [
        ...pairsWithTarget.slice(0, targetLimit),
        ...pairsWithoutTarget.slice(0, otherLimit)
      ];
      
      console.log(`[Sniper] Generated ${candidatePairs.length} candidate pairs (${pairsWithTarget.length} with target class), scoring ${pairsToScore.length}`);

      // Class gene ID to name mapping
      const CLASS_GENE_MAP = [
        'Warrior', 'Knight', 'Thief', 'Archer', 'Priest', 'Wizard', 'Monk', 'Pirate',
        'Berserker', 'Seer', 'Legionnaire', 'Scholar', 'Unknown12', 'Unknown13', 'Unknown14', 'Unknown15',
        'Paladin', 'DarkKnight', 'Summoner', 'Ninja', 'Shapeshifter', 'Bard', 'Unknown22', 'Unknown23',
        'Dragoon', 'Sage', 'Spellbow', 'Unknown27', 'DreadKnight', 'Unknown29', 'Unknown30', 'Unknown31'
      ];
      
      // Skill gene ID to name mapping (sparse) - matches gene-decoder.js ACTIVE_GENES
      // Basic: 0-7, Advanced: 16-19, Elite: 24-25, Exalted: 28
      const ACTIVE_GENE_MAP = {
        0: 'Poisoned Blade', 1: 'Blinding Winds', 2: 'Heal', 3: 'Cleanse',
        4: 'Iron Skin', 5: 'Speed', 6: 'Critical Aim', 7: 'Deathmark',
        16: 'Exhaust', 17: 'Daze', 18: 'Explosion', 19: 'Hardened Shield',
        24: 'Stun', 25: 'Second Wind', 28: 'Resurrection'
      };
      
      const PASSIVE_GENE_MAP = {
        0: 'Duelist', 1: 'Clutch', 2: 'Foresight', 3: 'Headstrong',
        4: 'Clear Vision', 5: 'Fearless', 6: 'Chatterbox', 7: 'Stalwart',
        16: 'Leadership', 17: 'Efficient', 18: 'Intimidation', 19: 'Toxic',
        24: 'Giant Slayer', 25: 'Last Stand', 28: 'Second Life'
      };

      // Build genetics object from indexed hero component columns
      function buildGeneticsFromIndex(hero) {
        const getClassName = (geneId) => CLASS_GENE_MAP[parseInt(geneId)] || `Unknown${geneId}`;
        const getActiveName = (geneId) => ACTIVE_GENE_MAP[parseInt(geneId)] || `Unknown`;
        const getPassiveName = (geneId) => PASSIVE_GENE_MAP[parseInt(geneId)] || `Unknown`;
        
        // Parse skill ID from "ability_X" format (e.g., "ability_7" -> 7)
        const parseSkillId = (skillStr) => {
          if (!skillStr) return null;
          const match = skillStr.match(/ability_(\d+)/);
          return match ? parseInt(match[1]) : null;
        };
        
        // Get dominant active/passive skill names from the "ability_X" format columns
        const getDominantActive = (skillStr) => {
          const id = parseSkillId(skillStr);
          return id !== null ? getActiveName(id) : 'Unknown';
        };
        const getDominantPassive = (skillStr) => {
          const id = parseSkillId(skillStr);
          return id !== null ? getPassiveName(id) : 'Unknown';
        };
        
        // Profession mapping (database stores lowercase)
        const PROFESSION_MAP = {
          'mining': 'Mining',
          'gardening': 'Gardening',
          'fishing': 'Fishing',
          'foraging': 'Foraging'
        };
        
        return {
          id: hero.hero_id,
          mainClass: {
            dominant: hero.main_class || 'Unknown',
            R1: getClassName(hero.main_class_r1),
            R2: getClassName(hero.main_class_r2),
            R3: getClassName(hero.main_class_r3)
          },
          subClass: {
            dominant: hero.sub_class || 'Unknown',
            R1: getClassName(hero.sub_class_r1),
            R2: getClassName(hero.sub_class_r2),
            R3: getClassName(hero.sub_class_r3)
          },
          profession: {
            dominant: PROFESSION_MAP[hero.profession] || 'Unknown',
            R1: 'Unknown', R2: 'Unknown', R3: 'Unknown'
          },
          passive1: {
            dominant: getDominantPassive(hero.passive1),
            R1: getPassiveName(hero.passive1_r1),
            R2: getPassiveName(hero.passive1_r2),
            R3: getPassiveName(hero.passive1_r3)
          },
          passive2: {
            dominant: getDominantPassive(hero.passive2),
            R1: getPassiveName(hero.passive2_r1),
            R2: getPassiveName(hero.passive2_r2),
            R3: getPassiveName(hero.passive2_r3)
          },
          active1: {
            dominant: getDominantActive(hero.active1),
            R1: getActiveName(hero.active1_r1),
            R2: getActiveName(hero.active1_r2),
            R3: getActiveName(hero.active1_r3)
          },
          active2: {
            dominant: getDominantActive(hero.active2),
            R1: getActiveName(hero.active2_r1),
            R2: getActiveName(hero.active2_r2),
            R3: getActiveName(hero.active2_r3)
          },
          statBoost1: { dominant: 'Unknown', R1: 'Unknown', R2: 'Unknown', R3: 'Unknown' },
          statBoost2: { dominant: 'Unknown', R1: 'Unknown', R2: 'Unknown', R3: 'Unknown' },
          element: { dominant: 'Unknown', R1: 'Unknown', R2: 'Unknown', R3: 'Unknown' },
          visual: {
            gender: { dominant: 'Unknown', R1: 'Unknown', R2: 'Unknown', R3: 'Unknown' },
            headAppendage: { dominant: 'Unknown', R1: 'Unknown', R2: 'Unknown', R3: 'Unknown', dominantValue: 0, R1Value: 0, R2Value: 0, R3Value: 0 },
            backAppendage: { dominant: 'Unknown', R1: 'Unknown', R2: 'Unknown', R3: 'Unknown', dominantValue: 0, R1Value: 0, R2Value: 0, R3Value: 0 },
            background: { dominant: 'Unknown', R1: 'Unknown', R2: 'Unknown', R3: 'Unknown', dominantValue: 0, R1Value: 0, R2Value: 0, R3Value: 0 },
            hairStyle: { dominant: 'Unknown', R1: 'Unknown', R2: 'Unknown', R3: 'Unknown' },
            hairColor: { dominant: 'Unknown', R1: 'Unknown', R2: 'Unknown', R3: 'Unknown' },
            eyeColor: { dominant: 'Unknown', R1: 'Unknown', R2: 'Unknown', R3: 'Unknown' },
            skinColor: { dominant: 'Unknown', R1: 'Unknown', R2: 'Unknown', R3: 'Unknown' },
            appendageColor: { dominant: 'Unknown', R1: 'Unknown', R2: 'Unknown', R3: 'Unknown' },
            backAppendageColor: { dominant: 'Unknown', R1: 'Unknown', R2: 'Unknown', R3: 'Unknown' }
          }
        };
      }

      // Cache for hero genetics - pre-populated from indexed database using component columns
      const geneticsCache = new Map();
      
      // Pre-populate cache from indexed heroes using component columns
      for (const h of heroes) {
        if (h.genes_status === 'complete' && h.main_class_r1 !== null) {
          geneticsCache.set(h.hero_id, buildGeneticsFromIndex(h));
        }
      }
      console.log(`[Sniper] Pre-cached ${geneticsCache.size} hero genetics from component columns`);
      
      // Pre-populate cache with user's hero genes if available (uses raw gene decoding)
      if (userHero && userHero.statGenes) {
        geneticsCache.set(userHero.hero_id, decodeHeroGenes(userHero));
        console.log(`[Sniper] Pre-cached user hero genetics for ${userHero.hero_id}`);
      }
      
      function getHeroGenetics(heroId) {
        if (geneticsCache.has(heroId)) {
          return geneticsCache.get(heroId);
        }
        console.log(`[Sniper] Warning: No genetics found for hero ${heroId} (not in index)`);
        return null;
      }

      // Score pairs with actual probability calculations
      const pairs = [];
      
      // Track TTS metadata for user guidance (max probabilities seen across all pairs)
      let ttsMetadata = { maxExpectedTTS: 0, maxCumulativeByTarget: {} };
      for (let t = 0; t <= 12; t++) ttsMetadata.maxCumulativeByTarget[t] = 0;
      
      for (const { hero1, hero2, realm, purchaseCost, summonTokenCost, tearCost, tearCount, bridgeCostUsd, heroesNeedingBridge, totalCost } of pairsToScore) {
        try {
          // Get pre-decoded genetics from cache
          const genetics1 = getHeroGenetics(hero1.hero_id);
          const genetics2 = getHeroGenetics(hero2.hero_id);
          
          if (!genetics1 || !genetics2) continue;

          const rarity1 = ['Common', 'Uncommon', 'Rare', 'Legendary', 'Mythic'][hero1.rarity] || 'Common';
          const rarity2 = ['Common', 'Uncommon', 'Rare', 'Legendary', 'Mythic'][hero2.rarity] || 'Common';

          const probs = calculateSummoningProbabilities(genetics1, genetics2, rarity1, rarity2);

          // Calculate JOINT probability of target traits
          // For multiple classes/professions: use OR logic (sum probabilities)
          // Between categories (class AND profession): use AND logic (multiply)
          let jointProbability = 1.0;
          let hasAnyTarget = false;
          
          // Multiple target classes: OR logic (sum their probabilities, cap at 1)
          if (classArray.length > 0 && probs.class) {
            let classSum = 0;
            for (const targetClass of classArray) {
              const classProb = Object.entries(probs.class).find(([name]) => 
                name.toLowerCase() === targetClass.toLowerCase()
              );
              if (classProb) {
                classSum += parseFloat(classProb[1]) / 100;
              }
            }
            if (classSum > 0) {
              jointProbability *= Math.min(classSum, 1.0);
              hasAnyTarget = true;
            } else {
              jointProbability = 0;
            }
          }

          // Multiple target professions: OR logic (sum their probabilities, cap at 1)
          if (professionArray.length > 0 && probs.profession) {
            let profSum = 0;
            for (const targetProfession of professionArray) {
              const profProb = Object.entries(probs.profession).find(([name]) => 
                name.toLowerCase().includes(targetProfession.toLowerCase())
              );
              if (profProb) {
                profSum += parseFloat(profProb[1]) / 100;
              }
            }
            if (profSum > 0) {
              jointProbability *= Math.min(profSum, 1.0);
              hasAnyTarget = true;
            } else {
              jointProbability = 0;
            }
          }

          // Multiple target active skills: OR logic (sum their probabilities, cap at 1)
          if (activeSkillArray.length > 0 && probs.active1) {
            let activeSum = 0;
            for (const targetSkill of activeSkillArray) {
              const skillProb = Object.entries(probs.active1).find(([name]) => 
                name.toLowerCase() === targetSkill.toLowerCase()
              );
              if (skillProb) {
                activeSum += parseFloat(skillProb[1]) / 100;
              }
            }
            if (activeSum > 0) {
              jointProbability *= Math.min(activeSum, 1.0);
              hasAnyTarget = true;
            } else {
              jointProbability = 0;
            }
          }

          // Multiple target passive skills: OR logic (sum their probabilities, cap at 1)
          if (passiveSkillArray.length > 0 && probs.passive1) {
            let passiveSum = 0;
            for (const targetSkill of passiveSkillArray) {
              const skillProb = Object.entries(probs.passive1).find(([name]) => 
                name.toLowerCase() === targetSkill.toLowerCase()
              );
              if (skillProb) {
                passiveSum += parseFloat(skillProb[1]) / 100;
              }
            }
            if (passiveSum > 0) {
              jointProbability *= Math.min(passiveSum, 1.0);
              hasAnyTarget = true;
            } else {
              jointProbability = 0;
            }
          }

          // Calculate offspring TTS probabilities FIRST (before any filtering)
          // This allows tracking of max TTS values across ALL pairs for user guidance
          const ttsData = calculateTTSProbabilities(probs);
          
          // Track max TTS values seen across all pairs (for user guidance when TTS filter is too strict)
          if (ttsData?.expectedTTS > ttsMetadata.maxExpectedTTS) {
            ttsMetadata.maxExpectedTTS = ttsData.expectedTTS;
          }
          if (ttsData?.cumulativeProbs) {
            for (let t = 0; t <= 12; t++) {
              const prob = ttsData.cumulativeProbs[t] ?? 0;
              if (prob > ttsMetadata.maxCumulativeByTarget[t]) {
                ttsMetadata.maxCumulativeByTarget[t] = prob;
              }
            }
          }
          
          const targetProb = hasAnyTarget ? jointProbability * 100 : 0;
          if (targetProb === 0) continue;
          
          // Filter by minimum offspring skill score (only if threshold is set)
          if (minOffspringSkillScore !== null && minOffspringSkillScore !== undefined) {
            const expectedTTS = ttsData?.expectedTTS ?? 0;
            if (expectedTTS < minOffspringSkillScore) {
              continue;
            }
          }
          
          // Filter by target TTS cumulative probability (only if both values are set)
          // cumulativeProbs uses numeric keys (0-12) and percentage values (0-100)
          if (targetTTSValue !== null && targetTTSValue !== undefined && 
              minTTSProbability !== null && minTTSProbability !== undefined) {
            const targetKey = Math.floor(Number(targetTTSValue));
            const minProb = Number(minTTSProbability);
            // Validate bounds: TTS must be 0-12, probability must be 0-100
            if (!isNaN(targetKey) && targetKey >= 0 && targetKey <= 12 && 
                !isNaN(minProb) && minProb >= 0 && minProb <= 100) {
              // Access with both numeric and string key for safety
              const cumulativeProb = ttsData?.cumulativeProbs?.[targetKey] ?? ttsData?.cumulativeProbs?.[String(targetKey)] ?? 0;
              if (cumulativeProb < minProb) {
                continue;
              }
            }
          }

          // Calculate USD total cost (including bridging fees)
          const tokenPriceUsd = realm === 'cv' ? crystalPriceUsd : jewelPriceUsd;
          const tokenCostUsd = totalCost * tokenPriceUsd;
          const totalCostUsd = tokenCostUsd + (bridgeCostUsd || 0);  // Add bridging cost to total USD
          
          // Use USD for efficiency if available, otherwise use native token
          const efficiency = totalCostUsd > 0 ? targetProb / totalCostUsd : targetProb / totalCost;

          pairs.push({
            hero1: {
              id: hero1.hero_id,
              normalizedId: hero1.normalized_id,
              mainClass: hero1.main_class,
              subClass: hero1.sub_class,
              profession: hero1.profession,
              rarity: hero1.rarity,
              level: hero1.level,
              generation: hero1.generation,
              summonsRemaining: hero1.max_summons - hero1.summons,
              summons: hero1.summons,
              price: parseFloat(hero1.price_native),
              token: hero1.native_token,
              realm: hero1.realm
            },
            hero2: {
              id: hero2.hero_id,
              normalizedId: hero2.normalized_id,
              mainClass: hero2.main_class,
              subClass: hero2.sub_class,
              profession: hero2.profession,
              rarity: hero2.rarity,
              level: hero2.level,
              generation: hero2.generation,
              summonsRemaining: hero2.max_summons - hero2.summons,
              summons: hero2.summons,
              price: parseFloat(hero2.price_native),
              token: hero2.native_token,
              realm: hero2.realm
            },
            realm,
            targetProbability: targetProb,
            costs: {
              purchaseCost: Math.round(purchaseCost * 100) / 100,
              summonTokenCost,
              tearCost: Math.round(tearCost * 100) / 100,
              tearCount,
              bridgeCostUsd: Math.round((bridgeCostUsd || 0) * 100) / 100,
              heroesNeedingBridge: heroesNeedingBridge || 0,
              totalCost: Math.round(totalCost * 100) / 100,
              totalCostUsd: Math.round(totalCostUsd * 100) / 100,
              tokenPriceUsd: Math.round(tokenPriceUsd * 10000) / 10000
            },
            totalCost: Math.round(totalCost * 100) / 100,
            totalCostUsd: Math.round(totalCostUsd * 100) / 100,
            efficiency,
            probabilities: {
              class: probs.class,
              subClass: probs.subClass,
              profession: probs.profession,
              active1: probs.active1 || {},
              active2: probs.active2 || {},
              passive1: probs.passive1 || {},
              passive2: probs.passive2 || {}
            },
            tts: {
              distribution: ttsData.ttsProbabilities,
              cumulative: ttsData.cumulativeProbs,
              expected: ttsData.expectedTTS,
              slotTiers: ttsData.slotTierProbs
            }
          });

        } catch (err) {
          console.log(`[Sniper] Skipping pair due to error:`, err.message);
        }
      }

      console.log(`[Sniper] Scored ${pairs.length} pairs with non-zero probability`);

      // Sort by selected criteria
      switch (sortBy) {
        case 'chance':
          pairs.sort((a, b) => b.targetProbability - a.targetProbability);
          break;
        case 'price':
          pairs.sort((a, b) => a.totalCostUsd - b.totalCostUsd);
          break;
        case 'skillScore':
          pairs.sort((a, b) => (b.tts?.expected ?? 0) - (a.tts?.expected ?? 0));
          break;
        case 'efficiency':
        default:
          pairs.sort((a, b) => b.efficiency - a.efficiency);
          break;
      }

      // Return top results
      const topPairs = pairs.slice(0, limit);

      res.json({
        ok: true,
        pairs: topPairs,
        totalHeroes: heroes.length,
        totalPairsScored: pairs.length,
        tokenPrices: {
          CRYSTAL: crystalPriceUsd,
          JEWEL: jewelPriceUsd
        },
        ttsMetadata: {
          maxExpectedTTS: Math.round(ttsMetadata.maxExpectedTTS * 100) / 100,
          maxCumulativeByTarget: ttsMetadata.maxCumulativeByTarget,
          requestedTarget: targetTTSValue ?? null,
          requestedMinProb: minTTSProbability ?? null
        },
        searchParams: {
          targetClasses: classArray,
          targetProfessions: professionArray,
          targetActiveSkills: activeSkillArray,
          targetPassiveSkills: passiveSkillArray,
          realms: filteredRealms,
          minSummonsRemaining,
          minRarity,
          summonType,
          searchMode
        },
        userHero: userHero ? {
          id: userHero.hero_id,
          mainClass: userHero.main_class,
          subClass: userHero.sub_class,
          profession: userHero.profession,
          rarity: userHero.rarity,
          level: userHero.level,
          generation: userHero.generation,
          summonsRemaining: userHero.max_summons - userHero.summons,
          realm: userHero.realm,
          token: userHero.native_token
        } : null
      });

    } catch (error) {
      console.error('[Sniper] Search error:', error);
      res.status(500).json({ ok: false, error: error?.message ?? String(error) });
    }
  });
  
  // GET /api/admin/pools/:pid - Get detailed pool data with APR breakdown
  app.get('/api/admin/pools/:pid', isAdmin, async (req, res) => {
    try {
      const pid = parseInt(req.params.pid);
      
      if (isNaN(pid) || pid < 0) {
        return res.status(400).json({ error: 'Invalid pool ID' });
      }
      
      const cached = getCachedPoolAnalytics();
      
      if (!cached || !cached.data || cached.data.length === 0) {
        return res.status(503).json({ 
          error: 'Pool cache not ready', 
          message: 'Pool analytics are still loading. Please try again in a few minutes.' 
        });
      }
      
      const pool = cached.data.find(p => p.pid === pid);
      
      if (!pool) {
        return res.status(404).json({ error: 'Pool not found', pid });
      }
      
      // Parse APR percentages for detailed breakdown
      const parseAprPercent = (aprStr) => {
        if (!aprStr) return 0;
        const match = String(aprStr).match(/[\d.]+/);
        return match ? parseFloat(match[0]) : 0;
      };
      
      const feeAprValue = parseAprPercent(pool.fee24hAPR);
      const harvestAprValue = parseAprPercent(pool.harvesting24hAPR);
      const questAprWorst = parseAprPercent(pool.gardeningQuestAPR?.worst);
      const questAprBest = parseAprPercent(pool.gardeningQuestAPR?.best);
      
      res.json({
        pool: {
          pid: pool.pid,
          pairName: pool.pairName,
          lpToken: pool.lpToken,
          token0: pool.token0,
          token1: pool.token1,
          totalTVL: pool.totalTVL,
          v2TVL: pool.v2TVL,
          volume24hUSD: pool.volume24hUSD,
          fees24hUSD: pool.fees24hUSD,
        },
        aprBreakdown: {
          passive: {
            feeAPR: pool.fee24hAPR,
            feeAprValue,
            harvestingAPR: pool.harvesting24hAPR,
            harvestAprValue,
            totalPassive: feeAprValue + harvestAprValue,
            description: 'Earned passively from swap fees and CRYSTAL emissions',
          },
          active: {
            gardeningQuestAPR: pool.gardeningQuestAPR,
            questAprWorst,
            questAprBest,
            description: 'Hero-dependent: requires heroes with Gardening profession to quest',
          },
          total: {
            worst: feeAprValue + harvestAprValue + questAprWorst,
            best: feeAprValue + harvestAprValue + questAprBest,
            displayed: pool.totalAPR,
          },
        },
        lastUpdated: cached.lastUpdated,
      });
    } catch (error) {
      console.error('[API] Error getting pool detail:', error);
      res.status(500).json({ error: 'Failed to get pool details', details: error.message });
    }
  });
  
  // GET /api/admin/pools/:pid/providers - Get top LP providers for a pool
  app.get('/api/admin/pools/:pid/providers', isAdmin, async (req, res) => {
    try {
      const pid = parseInt(req.params.pid);
      const limit = parseInt(req.query.limit) || 20;
      
      if (isNaN(pid) || pid < 0) {
        return res.status(400).json({ error: 'Invalid pool ID' });
      }
      
      // Get registered wallets from players table
      const playersWithWallets = await db.select({
        discordId: players.discordId,
        discordUsername: players.discordUsername,
        primaryWallet: players.primaryWallet,
        wallets: players.wallets,
      }).from(players).where(sql`${players.wallets} IS NOT NULL AND json_array_length(${players.wallets}) > 0`);
      
      if (playersWithWallets.length === 0) {
        return res.json({ providers: [], poolId: pid, message: 'No registered wallets found' });
      }
      
      // Import getUserGardenPositions
      const { getUserGardenPositions } = await import('./onchain-data.js');
      
      const providers = [];
      
      // Check each wallet's position in this pool (limit concurrent requests)
      for (const player of playersWithWallets.slice(0, 50)) {
        const wallets = player.wallets || [];
        for (const wallet of wallets) {
          try {
            const positions = await getUserGardenPositions(wallet, 'dfk');
            const poolPosition = positions.find(p => p.pid === pid);
            
            if (poolPosition && parseFloat(poolPosition.stakedAmount) > 0) {
              providers.push({
                wallet,
                discordUsername: player.discordUsername,
                stakedAmount: poolPosition.stakedAmount,
                stakedAmountRaw: poolPosition.stakedAmountRaw?.toString(),
              });
            }
          } catch (err) {
            console.warn(`[Pools API] Error checking wallet ${wallet}:`, err.message);
          }
        }
      }
      
      // Sort by staked amount descending
      providers.sort((a, b) => parseFloat(b.stakedAmount) - parseFloat(a.stakedAmount));
      
      res.json({
        providers: providers.slice(0, limit),
        poolId: pid,
        totalProviders: providers.length,
        note: 'Based on registered player wallets only',
      });
    } catch (error) {
      console.error('[API] Error getting pool providers:', error);
      res.status(500).json({ error: 'Failed to get pool providers', details: error.message });
    }
  });

  // POST /api/admin/etl/run-all - Run ETL for all wallet clusters
  app.post('/api/admin/etl/run-all', isAdmin, async (req, res) => {
    try {
      const { etlService } = await import('./src/etl/services/EtlService.js');
      
      const clusterRecords = await db.select().from(walletClusters);
      
      if (clusterRecords.length === 0) {
        return res.json({ message: 'No clusters found', results: [] });
      }
      
      const results = [];
      for (const cluster of clusterRecords) {
        try {
          const etlResults = await etlService.runForCluster(cluster.clusterKey);
          results.push({
            clusterKey: cluster.clusterKey,
            userId: cluster.userId,
            success: true,
            walletsProcessed: etlResults.length,
          });
        } catch (err) {
          results.push({
            clusterKey: cluster.clusterKey,
            userId: cluster.userId,
            success: false,
            error: err.message,
          });
        }
      }
      
      res.json({
        message: `ETL complete for ${clusterRecords.length} clusters`,
        results,
      });
    } catch (error) {
      console.error('[API] Error running ETL:', error);
      res.status(500).json({ error: 'Failed to run ETL', details: error.message });
    }
  });

  // POST /api/admin/etl/run-cluster/:clusterKey - Run ETL for specific cluster
  app.post('/api/admin/etl/run-cluster/:clusterKey', isAdmin, async (req, res) => {
    try {
      const { etlService } = await import('./src/etl/services/EtlService.js');
      const clusterKey = req.params.clusterKey;
      
      const etlResults = await etlService.runForCluster(clusterKey);
      
      res.json({
        clusterKey,
        walletsProcessed: etlResults.length,
        results: etlResults,
      });
    } catch (error) {
      console.error('[API] Error running ETL for cluster:', error);
      res.status(500).json({ error: 'Failed to run ETL', details: error.message });
    }
  });

  // GET /api/admin/etl/status - Get ETL scheduler status
  app.get('/api/admin/etl/status', isAdmin, async (req, res) => {
    try {
      const { getSchedulerStatus } = await import('./src/etl/scheduler/etlScheduler.ts');
      const status = getSchedulerStatus();
      res.json(status);
    } catch (error) {
      console.error('[API] Error getting ETL status:', error);
      res.status(500).json({ error: 'Failed to get ETL status' });
    }
  });

  // POST /api/admin/etl/trigger - Manually trigger ETL run
  app.post('/api/admin/etl/trigger', isAdmin, async (req, res) => {
    try {
      const { triggerManualRun } = await import('./src/etl/scheduler/etlScheduler.ts');
      const type = req.body.type || 'incremental';
      
      console.log(`[API] Manual ETL trigger requested: ${type}`);
      const result = await triggerManualRun(type);
      
      res.json(result);
    } catch (error) {
      console.error('[API] Error triggering ETL:', error);
      res.status(500).json({ error: 'Failed to trigger ETL', details: error.message });
    }
  });

  // ============================================================================
  // CHALLENGE SYSTEM API
  // ============================================================================
  // Challenge/Achievement system endpoints
  // ============================================================================

  // GET /api/challenges - Get all challenge categories with their challenges
  // Query params:
  //   type: 'challenges' (default) = tiered/seasonal, 'feats' = prestige type, 'all' = everything
  app.get('/api/challenges', async (req, res) => {
    try {
      const typeFilter = req.query.type || 'challenges';
      
      const [categories, allChallenges, allTiers] = await Promise.all([
        db.select().from(challengeCategories).orderBy(challengeCategories.sortOrder),
        db.select().from(challenges).where(eq(challenges.isActive, true)).orderBy(challenges.sortOrder),
        db.select().from(challengeTiers).orderBy(challengeTiers.sortOrder),
      ]);

      // Filter challenges based on type parameter
      // 'challenges' = tiered + seasonal (regular rolling challenges)
      // 'feats' = prestige type (binary lifetime accomplishments)
      // 'all' = everything
      let filteredChallenges = allChallenges;
      if (typeFilter === 'challenges') {
        filteredChallenges = allChallenges.filter(c => c.challengeType !== 'prestige');
      } else if (typeFilter === 'feats') {
        filteredChallenges = allChallenges.filter(c => c.challengeType === 'prestige');
      }
      // 'all' returns everything

      // Group challenges by category and attach tiers
      const result = categories.map(cat => ({
        ...cat,
        challenges: filteredChallenges
          .filter(c => c.categoryKey === cat.key)
          .map(challenge => ({
            ...challenge,
            tiers: allTiers.filter(t => t.challengeKey === challenge.key),
          })),
      })).filter(cat => cat.challenges.length > 0); // Only include categories that have challenges after filtering

      res.json({ 
        categories: result,
        totalChallenges: filteredChallenges.length,
        totalTiers: allTiers.filter(t => filteredChallenges.some(c => c.key === t.challengeKey)).length,
        filter: typeFilter
      });
    } catch (err) {
      console.error('[API] Failed to get challenges:', err);
      res.status(500).json({ error: 'Failed to get challenges' });
    }
  });
  
  // GET /api/feats - Dedicated endpoint for Feats (binary lifetime accomplishments)
  // Returns a flat list of all feats with locked/unlocked status for a user
  app.get('/api/feats', async (req, res) => {
    try {
      const userId = req.query.userId;
      
      // Get all prestige-type challenges (Feats)
      const [allFeats, allTiers] = await Promise.all([
        db.select().from(challenges)
          .where(and(eq(challenges.isActive, true), eq(challenges.challengeType, 'prestige')))
          .orderBy(challenges.sortOrder),
        db.select().from(challengeTiers).orderBy(challengeTiers.sortOrder),
      ]);
      
      // Get user progress if userId provided
      let userProgress = {};
      if (userId) {
        const progress = await db
          .select()
          .from(playerChallengeProgress)
          .where(eq(playerChallengeProgress.userId, userId));
        for (const p of progress) {
          userProgress[p.challengeKey] = p;
        }
      }
      
      // Map feats with unlock status
      const featsWithStatus = allFeats.map(feat => {
        const tiers = allTiers.filter(t => t.challengeKey === feat.key);
        const progress = userProgress[feat.key];
        
        // A feat is "unlocked" if user has any tier achieved, or specifically the prestige tier
        const isUnlocked = progress?.highestTierAchieved != null;
        const unlockedAt = progress?.achievedAt;
        
        return {
          key: feat.key,
          name: feat.name,
          description: feat.description,
          descriptionLong: feat.descriptionLong,
          categoryKey: feat.categoryKey,
          meta: feat.meta,
          tiers,
          isUnlocked,
          unlockedAt,
          currentValue: progress?.currentValue || 0,
        };
      });
      
      res.json({
        feats: featsWithStatus,
        totalFeats: allFeats.length,
        unlockedCount: featsWithStatus.filter(f => f.isUnlocked).length,
        userId: userId || null,
      });
    } catch (err) {
      console.error('[API] Failed to get feats:', err);
      res.status(500).json({ error: 'Failed to get feats' });
    }
  });

  // GET /api/challenges/progress/:userId - Get player progress on all challenges
  app.get('/api/challenges/progress/:userId', async (req, res) => {
    try {
      const { userId } = req.params;

      // Get lifetime progress
      const progress = await db
        .select()
        .from(playerChallengeProgress)
        .where(eq(playerChallengeProgress.userId, userId));

      // Find user's cluster for windowed progress lookup
      let clusterKey = null;
      const cluster = await db
        .select()
        .from(walletClusters)
        .where(eq(walletClusters.userId, userId))
        .limit(1);
      
      if (cluster.length > 0) {
        clusterKey = cluster[0].clusterKey;
      }

      // Get windowed (180d rolling) progress if cluster exists
      let windowedProgressMap = {};
      if (clusterKey) {
        const windowed = await db
          .select()
          .from(challengeProgressWindowed)
          .where(
            and(
              eq(challengeProgressWindowed.clusterId, clusterKey),
              eq(challengeProgressWindowed.windowKey, '180d')
            )
          );
        
        for (const w of windowed) {
          windowedProgressMap[w.challengeKey] = {
            value_180d: Number(w.value),
            tier_code_180d: w.tierCode,
            computed_at: w.computedAt,
          };
        }
      }

      // Group by challenge key and merge windowed data
      const progressMap = {};
      for (const p of progress) {
        const windowed = windowedProgressMap[p.challengeKey] || {};
        progressMap[p.challengeKey] = {
          ...p,
          // Windowed (rolling 180d) values
          value_180d: windowed.value_180d ?? null,
          tier_code_180d: windowed.tier_code_180d ?? null,
          windowed_computed_at: windowed.computed_at ?? null,
          // Founder's Mark (already in p but explicitly include for clarity)
          founders_mark: p.foundersMarkAchieved || false,
          founders_mark_at: p.foundersMarkAt || null,
        };
      }

      res.json({ userId, clusterKey, progress: progressMap });
    } catch (err) {
      console.error('[API] Failed to get challenge progress:', err);
      res.status(500).json({ error: 'Failed to get challenge progress' });
    }
  });

  // POST /api/challenges/progress - Update player progress on a challenge
  app.post('/api/challenges/progress', async (req, res) => {
    try {
      const { userId, challengeKey, currentValue, walletAddress } = req.body;

      if (!userId || !challengeKey || currentValue === undefined) {
        return res.status(400).json({ 
          error: 'Missing required fields: userId, challengeKey, currentValue' 
        });
      }

      const numericValue = Number(currentValue);
      if (isNaN(numericValue)) {
        return res.status(400).json({ error: 'currentValue must be a number' });
      }

      // Verify challenge exists and is active
      const [challenge] = await db
        .select()
        .from(challenges)
        .where(eq(challenges.key, challengeKey))
        .limit(1);

      if (!challenge) {
        return res.status(404).json({ error: 'Challenge not found' });
      }

      if (!challenge.isActive) {
        return res.status(400).json({ error: 'Challenge is not active' });
      }

      // Get challenge tiers to determine highest achieved
      const tiers = await db
        .select()
        .from(challengeTiers)
        .where(eq(challengeTiers.challengeKey, challengeKey))
        .orderBy(desc(challengeTiers.thresholdValue));

      // Find highest tier achieved (use Number() for safety)
      let highestTier = null;
      let isTopTierAchieved = false;
      for (const tier of tiers) {
        if (numericValue >= Number(tier.thresholdValue)) {
          highestTier = tier.tierCode;
          // Check if this tier is the top tier (isPrestige=true means top of ladder)
          if (tier.isPrestige) {
            isTopTierAchieved = true;
          }
          break;
        }
      }

      // Upsert progress - preserve highest tier if current value drops
      const existing = await db
        .select()
        .from(playerChallengeProgress)
        .where(
          sql`${playerChallengeProgress.userId} = ${userId} AND ${playerChallengeProgress.challengeKey} = ${challengeKey}`
        )
        .limit(1);

      if (existing.length > 0) {
        // Preserve highest tier if new tier is lower or null
        const existingTier = existing[0].highestTierAchieved;
        const existingAchievedAt = existing[0].achievedAt;
        const finalTier = highestTier || existingTier;
        const finalAchievedAt = highestTier && !existingTier ? new Date() : existingAchievedAt;
        
        // Founder's Mark: once achieved, never removed (track if ever reached top tier)
        const existingFoundersMark = existing[0].foundersMarkAchieved;
        const existingFoundersMarkAt = existing[0].foundersMarkAt;
        const finalFoundersMark = existingFoundersMark || isTopTierAchieved;
        const finalFoundersMarkAt = existingFoundersMark ? existingFoundersMarkAt : (isTopTierAchieved ? new Date() : null);

        await db
          .update(playerChallengeProgress)
          .set({
            currentValue: numericValue,
            highestTierAchieved: finalTier,
            achievedAt: finalAchievedAt,
            foundersMarkAchieved: finalFoundersMark,
            foundersMarkAt: finalFoundersMarkAt,
            lastUpdated: new Date(),
            walletAddress: walletAddress || existing[0].walletAddress,
          })
          .where(eq(playerChallengeProgress.id, existing[0].id));
      } else {
        await db.insert(playerChallengeProgress).values({
          userId,
          challengeKey,
          currentValue: numericValue,
          highestTierAchieved: highestTier,
          achievedAt: highestTier ? new Date() : null,
          foundersMarkAchieved: isTopTierAchieved,
          foundersMarkAt: isTopTierAchieved ? new Date() : null,
          lastUpdated: new Date(),
          walletAddress: walletAddress || null,
        });
      }

      res.json({ 
        success: true, 
        userId, 
        challengeKey, 
        currentValue: numericValue, 
        highestTierAchieved: highestTier,
        foundersMarkAchieved: existing.length > 0 ? (existing[0].foundersMarkAchieved || isTopTierAchieved) : isTopTierAchieved,
        foundersMarkAt: existing.length > 0 ? (existing[0].foundersMarkAt || (isTopTierAchieved ? new Date() : null)) : (isTopTierAchieved ? new Date() : null)
      });
    } catch (err) {
      console.error('[API] Failed to update challenge progress:', err);
      res.status(500).json({ error: 'Failed to update challenge progress' });
    }
  });

  // GET /api/challenges/leaderboard/:challengeKey - Get leaderboard for a specific challenge
  app.get('/api/challenges/leaderboard/:challengeKey', async (req, res) => {
    try {
      const { challengeKey } = req.params;
      const limit = Math.min(parseInt(req.query.limit) || 20, 100); // Cap at 100

      // Verify challenge exists
      const [challenge] = await db
        .select()
        .from(challenges)
        .where(eq(challenges.key, challengeKey))
        .limit(1);

      if (!challenge) {
        return res.status(404).json({ error: 'Challenge not found' });
      }

      const leaderboard = await db
        .select({
          userId: playerChallengeProgress.userId,
          walletAddress: playerChallengeProgress.walletAddress,
          currentValue: playerChallengeProgress.currentValue,
          highestTierAchieved: playerChallengeProgress.highestTierAchieved,
          achievedAt: playerChallengeProgress.achievedAt,
          foundersMarkAchieved: playerChallengeProgress.foundersMarkAchieved,
          foundersMarkAt: playerChallengeProgress.foundersMarkAt,
        })
        .from(playerChallengeProgress)
        .where(eq(playerChallengeProgress.challengeKey, challengeKey))
        .orderBy(desc(playerChallengeProgress.currentValue))
        .limit(limit);

      res.json({ 
        challengeKey, 
        challengeName: challenge.name,
        leaderboard: leaderboard.map((entry, index) => ({
          rank: index + 1,
          ...entry,
        }))
      });
    } catch (err) {
      console.error('[API] Failed to get challenge leaderboard:', err);
      res.status(500).json({ error: 'Failed to get challenge leaderboard' });
    }
  });

  // ============================================================================
  // HEDGE CHAT API (Webchat Integration)
  // ============================================================================
  // Exposes the Hedge AI personality for external frontend applications
  // ============================================================================

  // POST /api/chat - Send a message to Hedge and get an AI response
  app.post('/api/chat', async (req, res) => {
    try {
      const { message, conversationHistory, mode } = req.body;

      if (!message || typeof message !== 'string') {
        return res.status(400).json({ error: 'Missing or invalid "message" field' });
      }

      // Build user messages array - support conversation history for multi-turn chats
      const userMessages = [];
      
      // Add previous conversation history if provided (for multi-turn support)
      if (Array.isArray(conversationHistory)) {
        for (const turn of conversationHistory) {
          if (turn.role && turn.content) {
            userMessages.push({ role: turn.role, content: turn.content });
          }
        }
      }
      
      // Add the current user message
      userMessages.push({ role: 'user', content: message });

      // Call the existing askHedge function
      const reply = await askHedge(userMessages, { mode: mode || undefined });

      res.json({ 
        reply,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      console.error('[API] /api/chat error:', err);
      res.status(500).json({ error: 'Failed to generate response from Hedge' });
    }
  });

  // GET /api/chat/health - Health check for chat endpoint
  app.get('/api/chat/health', (req, res) => {
    res.json({ 
      status: 'ok', 
      service: 'Hedge Chat API',
      model: OPENAI_MODEL,
      modes: ['default', 'walkthrough'],
    });
  });

  // ============================================================================
  // LEAGUE SIGNUP API
  // ============================================================================
  // Challenge league signup endpoints with smurf detection integration
  // ============================================================================

  // GET /api/leagues/active - Get all active/upcoming league seasons
  app.get('/api/leagues/active', async (req, res) => {
    try {
      const now = new Date();
      const seasons = await db
        .select()
        .from(leagueSeasons)
        .where(
          sql`${leagueSeasons.status} IN ('UPCOMING', 'REGISTRATION', 'ACTIVE')`
        )
        .orderBy(leagueSeasons.registrationStart);

      const result = seasons.map(s => ({
        id: s.id,
        name: s.name,
        description: s.description,
        status: s.status,
        registrationStart: s.registrationStart?.toISOString(),
        registrationEnd: s.registrationEnd?.toISOString(),
        seasonStart: s.seasonStart?.toISOString(),
        seasonEnd: s.seasonEnd?.toISOString(),
        entryFee: s.entryFeeAmount ? {
          amount: s.entryFeeAmount,
          token: s.entryFeeToken,
          payToAddress: s.entryFeeAddress,
        } : null,
        config: s.config,
      }));

      res.json({ seasons: result });
    } catch (err) {
      console.error('[API] Failed to get active leagues:', err);
      res.status(500).json({ error: 'Failed to get active leagues' });
    }
  });

  // POST /api/leagues/:seasonId/signup - Sign up for a league season
  app.post('/api/leagues/:seasonId/signup', async (req, res) => {
    try {
      const { seasonId } = req.params;
      const { userId, walletAddress } = req.body;

      if (!userId || !walletAddress) {
        return res.status(400).json({ 
          error: 'Missing required fields: userId, walletAddress' 
        });
      }

      // Validate season exists and is in registration
      const [season] = await db
        .select()
        .from(leagueSeasons)
        .where(eq(leagueSeasons.id, parseInt(seasonId)))
        .limit(1);

      if (!season) {
        return res.status(404).json({ error: 'Season not found' });
      }

      if (season.status !== 'REGISTRATION') {
        return res.status(400).json({ 
          error: `Season is not accepting registrations (status: ${season.status})` 
        });
      }

      // Check if already signed up
      const existingSignup = await db
        .select()
        .from(leagueSignups)
        .where(
          and(
            eq(leagueSignups.seasonId, parseInt(seasonId)),
            eq(leagueSignups.userId, userId)
          )
        )
        .limit(1);

      if (existingSignup.length > 0) {
        return res.status(409).json({ 
          error: 'Already signed up for this season',
          signup: existingSignup[0],
        });
      }

      // Get or create wallet cluster for user
      const clusterKey = await getOrCreateCluster(userId);
      
      // Link wallet to cluster
      await linkWalletToCluster(clusterKey, 'DFKCHAIN', walletAddress, true);

      // Compute base tier using TierService CPS formula
      // Build ClusterKpiSnapshot from available wallet/player data
      const snapshot = createEmptySnapshot();
      
      // Try to get tier from player profile if exists
      const [existingPlayer] = await db
        .select()
        .from(players)
        .where(eq(players.walletAddress, walletAddress.toLowerCase()))
        .limit(1);

      // Populate snapshot with available metrics from wallet power snapshots
      const [latestSnapshot] = await db
        .select()
        .from(walletSnapshots)
        .where(eq(walletSnapshots.walletAddress, walletAddress.toLowerCase()))
        .orderBy(desc(walletSnapshots.snapshotDate))
        .limit(1);

      if (latestSnapshot) {
        // Populate wallet value from snapshot balances
        const jewelUsd = parseFloat(latestSnapshot.jewelBalance || '0') * 0.03;
        const crystalUsd = parseFloat(latestSnapshot.crystalBalance || '0') * 0.02;
        const cjewelUsd = parseFloat(latestSnapshot.cjewelBalance || '0') * 0.03;
        snapshot.walletValue.totalNetWorthUsd = jewelUsd + crystalUsd + cjewelUsd;
      }

      if (existingPlayer) {
        // Populate hero power metrics if available
        if (existingPlayer.heroCount) {
          snapshot.heroPower.commonHeroes = existingPlayer.heroCount;
        }
        // Account age estimation (days since first seen)
        if (existingPlayer.createdAt) {
          const ageMs = Date.now() - new Date(existingPlayer.createdAt).getTime();
          snapshot.accountAge.accountAgeDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
        }
      }

      // Compute tier using CPS formula
      const tierResult = computeBaseTierFromMetrics(snapshot);
      const baseTierCode = TIER_CODE_TO_LEAGUE[tierResult.tier] || 'BRONZE';
      
      console.log(`[Leagues] Tier computation for ${walletAddress}: CPS=${tierResult.cps.toFixed(2)}, tier=${tierResult.tier} -> ${baseTierCode}`);

      // Run smurf detection checks
      const smurfResult = await runPreSeasonChecks({
        userId,
        clusterKey,
        seasonId: parseInt(seasonId),
        walletAddress,
      });

      // Determine final tier
      let lockedTierCode = baseTierCode;
      let tierAdjusted = false;

      if (smurfResult.finalAction === 'ESCALATE_TIER' && smurfResult.adjustedTierCode) {
        lockedTierCode = smurfResult.adjustedTierCode;
        tierAdjusted = true;
      }

      // Check for disqualification
      if (smurfResult.disqualified) {
        return res.status(403).json({
          success: false,
          disqualified: true,
          disqualificationReason: smurfResult.disqualificationReason,
          smurfIncidents: smurfResult.incidents,
        });
      }

      // Create or update tier lock
      await db
        .insert(seasonTierLocks)
        .values({
          seasonId: parseInt(seasonId),
          clusterKey,
          lockedTierCode,
          upwardOnly: true,
        })
        .onConflictDoUpdate({
          target: [seasonTierLocks.seasonId, seasonTierLocks.clusterKey],
          set: {
            lockedTierCode,
            lockedAt: new Date(),
          },
        });

      // Create signup record
      const [signup] = await db
        .insert(leagueSignups)
        .values({
          seasonId: parseInt(seasonId),
          userId,
          clusterKey,
          walletAddress: walletAddress.toLowerCase(),
          baseTierCode,
          lockedTierCode,
          tierAdjusted,
          disqualified: false,
          status: 'PENDING',
        })
        .returning();

      console.log(`[Leagues] User ${userId} signed up for season ${seasonId} as ${lockedTierCode}`);

      res.json({
        success: true,
        signupId: signup.id,
        baseTierCode,
        lockedTierCode,
        tierAdjusted,
        disqualified: false,
        smurfIncidents: smurfResult.incidents,
        entryFee: season.entryFeeAmount ? {
          amount: season.entryFeeAmount,
          token: season.entryFeeToken,
          payToAddress: season.entryFeeAddress,
        } : null,
      });
    } catch (err) {
      console.error('[API] League signup error:', err);
      res.status(500).json({ error: 'Failed to process signup' });
    }
  });

  // GET /api/leagues/:seasonId/signup-status - Get signup status for a user
  app.get('/api/leagues/:seasonId/signup-status', async (req, res) => {
    try {
      const { seasonId } = req.params;
      const { userId } = req.query;

      if (!userId) {
        return res.status(400).json({ error: 'Missing userId query parameter' });
      }

      const [signup] = await db
        .select()
        .from(leagueSignups)
        .where(
          and(
            eq(leagueSignups.seasonId, parseInt(seasonId)),
            eq(leagueSignups.userId, userId)
          )
        )
        .limit(1);

      if (!signup) {
        return res.json({ 
          registered: false,
          seasonId: parseInt(seasonId),
          userId,
        });
      }

      // Get any incidents for this signup
      const incidents = await db
        .select()
        .from(smurfIncidents)
        .where(
          and(
            eq(smurfIncidents.clusterKey, signup.clusterKey),
            eq(smurfIncidents.seasonId, parseInt(seasonId))
          )
        )
        .orderBy(desc(smurfIncidents.createdAt));

      res.json({
        registered: true,
        signupId: signup.id,
        seasonId: parseInt(seasonId),
        userId: signup.userId,
        walletAddress: signup.walletAddress,
        baseTierCode: signup.baseTierCode,
        lockedTierCode: signup.lockedTierCode,
        tierAdjusted: signup.tierAdjusted,
        disqualified: signup.disqualified,
        disqualificationReason: signup.disqualificationReason,
        status: signup.status,
        signedUpAt: signup.createdAt?.toISOString(),
        smurfIncidents: incidents.map(i => ({
          id: i.id,
          ruleKey: i.ruleKey,
          severity: i.severity,
          actionTaken: i.actionTaken,
          reason: i.reason,
          details: i.details,
          createdAt: i.createdAt?.toISOString(),
        })),
      });
    } catch (err) {
      console.error('[API] Signup status error:', err);
      res.status(500).json({ error: 'Failed to get signup status' });
    }
  });

  // Admin: GET /api/admin/leagues/:seasonId/signups - List all signups for a season
  app.get('/api/admin/leagues/:seasonId/signups', isAdmin, async (req, res) => {
    try {
      const { seasonId } = req.params;
      
      const signups = await db
        .select()
        .from(leagueSignups)
        .where(eq(leagueSignups.seasonId, parseInt(seasonId)))
        .orderBy(leagueSignups.lockedTierCode, leagueSignups.createdAt);

      res.json({
        seasonId: parseInt(seasonId),
        count: signups.length,
        signups: signups.map(s => ({
          id: s.id,
          userId: s.userId,
          walletAddress: s.walletAddress,
          baseTierCode: s.baseTierCode,
          lockedTierCode: s.lockedTierCode,
          tierAdjusted: s.tierAdjusted,
          disqualified: s.disqualified,
          status: s.status,
          entryFeePaid: s.entryFeePaid,
          createdAt: s.createdAt?.toISOString(),
        })),
      });
    } catch (err) {
      console.error('[API] Admin signups list error:', err);
      res.status(500).json({ error: 'Failed to get signups' });
    }
  });

  // Admin: POST /api/admin/leagues - Create a new league season
  app.post('/api/admin/leagues', isAdmin, async (req, res) => {
    try {
      const { 
        name, 
        description, 
        registrationStart, 
        registrationEnd, 
        seasonStart, 
        seasonEnd,
        entryFeeAmount,
        entryFeeToken,
        entryFeeAddress,
        config,
      } = req.body;

      if (!name || !registrationStart || !registrationEnd || !seasonStart || !seasonEnd) {
        return res.status(400).json({ 
          error: 'Missing required fields: name, registrationStart, registrationEnd, seasonStart, seasonEnd' 
        });
      }

      const [season] = await db
        .insert(leagueSeasons)
        .values({
          name,
          description,
          status: 'UPCOMING',
          registrationStart: new Date(registrationStart),
          registrationEnd: new Date(registrationEnd),
          seasonStart: new Date(seasonStart),
          seasonEnd: new Date(seasonEnd),
          entryFeeAmount,
          entryFeeToken,
          entryFeeAddress,
          config,
        })
        .returning();

      console.log(`[Leagues] Admin created season: ${season.id} - ${name}`);

      res.json({
        success: true,
        season: {
          id: season.id,
          name: season.name,
          status: season.status,
        },
      });
    } catch (err) {
      console.error('[API] Create league error:', err);
      res.status(500).json({ error: 'Failed to create league season' });
    }
  });

  // Admin: PATCH /api/admin/leagues/:seasonId/status - Update season status
  app.patch('/api/admin/leagues/:seasonId/status', isAdmin, async (req, res) => {
    try {
      const { seasonId } = req.params;
      const { status } = req.body;

      const validStatuses = ['UPCOMING', 'REGISTRATION', 'ACTIVE', 'COMPLETED'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ 
          error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` 
        });
      }

      await db
        .update(leagueSeasons)
        .set({ status, updatedAt: new Date() })
        .where(eq(leagueSeasons.id, parseInt(seasonId)));

      console.log(`[Leagues] Admin updated season ${seasonId} status to ${status}`);

      res.json({ success: true, seasonId: parseInt(seasonId), status });
    } catch (err) {
      console.error('[API] Update season status error:', err);
      res.status(500).json({ error: 'Failed to update season status' });
    }
  });

  // ============================================================================
  // CHALLENGE ADMIN API
  // ============================================================================
  
  // Valid state transitions for the challenge lifecycle
  const VALID_STATE_TRANSITIONS = {
    draft: ['validated'],
    validated: ['deployed', 'draft'], // can rollback to draft
    deployed: ['deprecated', 'validated'], // can hotfix back to validated
    deprecated: [],
  };

  // Known metric sources for validation
  const KNOWN_METRIC_SOURCES = [
    'onchain_heroes', 'onchain_quests', 'onchain_summons', 'onchain_pets',
    'onchain_meditation', 'onchain_gardens', 'onchain_portfolio',
    'behavior_model', 'discord_interactions', 'payment_events', 'event_progress'
  ];

  // Helper: Run auto-validation checks on a challenge
  function runAutoValidation(challenge) {
    return {
      hasMetricSource: KNOWN_METRIC_SOURCES.includes(challenge.metricSource),
      fieldValid: !!challenge.metricKey && challenge.metricKey.length > 0,
      hasTierConfig: challenge.tieringMode === 'none' || (challenge.tierConfig && Object.keys(challenge.tierConfig).length > 0),
      codeUnique: true, // Will be checked separately
    };
  }

  // Helper: Check if all validation requirements are met
  function canPromote(challenge, validation, targetState) {
    if (targetState === 'validated') {
      const auto = validation?.autoChecks || {};
      return auto.hasMetricSource && auto.fieldValid && auto.hasTierConfig;
    }
    if (targetState === 'deployed') {
      const manual = validation?.manualChecks || {};
      return manual.etlOutputVerified && manual.copyApproved;
    }
    return true;
  }

  // GET /api/admin/challenges - List challenges with filters
  app.get('/api/admin/challenges', isAdmin, async (req, res) => {
    try {
      const { state, category, type, search } = req.query;
      
      let query = db.select().from(challenges);
      const conditions = [];
      
      if (state) {
        conditions.push(eq(challenges.state, state));
      }
      if (category) {
        conditions.push(eq(challenges.categoryKey, category));
      }
      if (type) {
        conditions.push(eq(challenges.challengeType, type));
      }
      
      if (conditions.length > 0) {
        query = query.where(and(...conditions));
      }
      
      let results = await query.orderBy(challenges.sortOrder);
      
      // Apply search filter in memory (for name and key)
      if (search) {
        const searchLower = search.toLowerCase();
        results = results.filter(c => 
          c.key.toLowerCase().includes(searchLower) || 
          c.name.toLowerCase().includes(searchLower)
        );
      }
      
      res.json(results.map(c => ({
        id: c.id,
        code: c.key,
        name: c.name,
        category: c.categoryKey,
        type: c.challengeType,
        state: c.state,
        descriptionShort: c.description,
        isVisibleFe: c.isVisibleFe,
        isTestOnly: c.isTestOnly,
        createdAt: c.createdAt?.toISOString(),
        updatedAt: c.updatedAt?.toISOString(),
        createdBy: c.createdBy,
        updatedBy: c.updatedBy,
      })));
    } catch (err) {
      console.error('[API] Admin challenges list error:', err);
      res.status(500).json({ error: 'Failed to get challenges' });
    }
  });

  // GET /api/admin/challenges/:id - Get single challenge detail
  app.get('/api/admin/challenges/:id', isAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      
      const [challenge] = await db
        .select()
        .from(challenges)
        .where(eq(challenges.id, parseInt(id)));
      
      if (!challenge) {
        return res.status(404).json({ error: 'Challenge not found' });
      }
      
      // Get validation status
      const [validation] = await db
        .select()
        .from(challengeValidation)
        .where(eq(challengeValidation.challengeId, parseInt(id)));
      
      // Get tiers for this challenge
      const tiers = await db
        .select()
        .from(challengeTiers)
        .where(eq(challengeTiers.challengeKey, challenge.key))
        .orderBy(challengeTiers.sortOrder);
      
      res.json({
        id: challenge.id,
        code: challenge.key,
        name: challenge.name,
        category: challenge.categoryKey,
        type: challenge.challengeType,
        state: challenge.state,
        descriptionShort: challenge.description,
        descriptionLong: challenge.descriptionLong,
        metricType: challenge.metricType,
        metricSource: challenge.metricSource,
        metricKey: challenge.metricKey,
        metricAggregation: challenge.metricAggregation,
        metricFilters: challenge.metricFilters || {},
        tierSystemOverride: challenge.tierSystemOverride,
        tieringMode: challenge.tieringMode,
        tierConfig: challenge.tierConfig || {},
        isClusterBased: challenge.isClusterBased,
        isTestOnly: challenge.isTestOnly,
        isVisibleFe: challenge.isVisibleFe,
        isActive: challenge.isActive,
        sortOrder: challenge.sortOrder,
        meta: challenge.meta,
        createdAt: challenge.createdAt?.toISOString(),
        updatedAt: challenge.updatedAt?.toISOString(),
        createdBy: challenge.createdBy,
        updatedBy: challenge.updatedBy,
        tiers: tiers.map(t => ({
          id: t.id,
          tierCode: t.tierCode,
          displayName: t.displayName,
          thresholdValue: t.thresholdValue,
          isPrestige: t.isPrestige,
          sortOrder: t.sortOrder,
        })),
        validation: validation ? {
          autoChecks: validation.autoChecks || {},
          manualChecks: validation.manualChecks || {},
          lastRunAt: validation.lastRunAt?.toISOString(),
          lastRunBy: validation.lastRunBy,
        } : null,
      });
    } catch (err) {
      console.error('[API] Admin challenge detail error:', err);
      res.status(500).json({ error: 'Failed to get challenge' });
    }
  });

  // POST /api/admin/challenges - Create new challenge (draft state)
  app.post('/api/admin/challenges', isAdmin, async (req, res) => {
    try {
      const adminId = req.adminUser?.discordId || 'unknown';
      const {
        code, name, category, type, descriptionShort, descriptionLong,
        metricType, metricSource, metricKey, metricAggregation,
        metricFilters, tierSystemOverride, tieringMode, tierConfig,
        isClusterBased, isTestOnly, isVisibleFe, tiers
      } = req.body;
      
      // Validate required fields
      if (!code || !name || !metricType || !metricSource || !metricKey) {
        return res.status(400).json({ 
          error: 'Missing required fields: code, name, metricType, metricSource, metricKey' 
        });
      }
      
      // Check code uniqueness
      const [existing] = await db
        .select({ id: challenges.id })
        .from(challenges)
        .where(eq(challenges.key, code));
      
      if (existing) {
        return res.status(400).json({ error: 'Challenge code already exists' });
      }
      
      // Create challenge
      const [challenge] = await db
        .insert(challenges)
        .values({
          key: code,
          categoryKey: category || 'hero_progression',
          name,
          description: descriptionShort,
          descriptionLong,
          challengeType: type || 'tiered',
          state: 'draft',
          metricType,
          metricSource,
          metricKey,
          metricAggregation: metricAggregation || 'count',
          metricFilters: metricFilters || {},
          tierSystemOverride,
          tieringMode: tieringMode || 'threshold',
          tierConfig: tierConfig || {},
          isClusterBased: isClusterBased !== false,
          isTestOnly: isTestOnly === true,
          isVisibleFe: isVisibleFe !== false,
          isActive: true,
          createdBy: adminId,
          updatedBy: adminId,
        })
        .returning();
      
      // Run auto-validation and create validation record
      const autoChecks = runAutoValidation(challenge);
      await db.insert(challengeValidation).values({
        challengeId: challenge.id,
        autoChecks,
        manualChecks: {},
      });
      
      // Create tiers if provided
      if (tiers && Array.isArray(tiers) && tiers.length > 0) {
        await db.insert(challengeTiers).values(
          tiers.map((t, idx) => ({
            challengeKey: code,
            tierCode: t.tierCode,
            displayName: t.displayName || t.tierCode,
            thresholdValue: t.thresholdValue,
            isPrestige: t.isPrestige || false,
            sortOrder: t.sortOrder || idx + 1,
          }))
        );
      }
      
      // Log the creation
      await db.insert(challengeAuditLog).values({
        challengeId: challenge.id,
        actor: adminId,
        action: 'create',
        toState: 'draft',
        payloadDiff: { created: req.body },
      });
      
      console.log(`[ChallengeAdmin] Created challenge ${code} by ${adminId}`);
      
      res.status(201).json({ id: challenge.id, state: 'draft' });
    } catch (err) {
      console.error('[API] Admin create challenge error:', err);
      res.status(500).json({ error: 'Failed to create challenge' });
    }
  });

  // PUT /api/admin/challenges/:id - Update challenge (only draft/validated)
  app.put('/api/admin/challenges/:id', isAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const adminId = req.adminUser?.discordId || 'unknown';
      
      // Get existing challenge
      const [existing] = await db
        .select()
        .from(challenges)
        .where(eq(challenges.id, parseInt(id)));
      
      if (!existing) {
        return res.status(404).json({ error: 'Challenge not found' });
      }
      
      if (existing.state === 'deployed') {
        return res.status(400).json({ error: 'Cannot edit deployed challenges. Deprecate first or use state transition.' });
      }
      
      const {
        name, category, type, descriptionShort, descriptionLong,
        metricType, metricSource, metricKey, metricAggregation,
        metricFilters, tierSystemOverride, tieringMode, tierConfig,
        isClusterBased, isTestOnly, isVisibleFe, sortOrder, meta, tiers
      } = req.body;
      
      // Build update object
      const updates = {
        updatedAt: new Date(),
        updatedBy: adminId,
      };
      
      if (name !== undefined) updates.name = name;
      if (category !== undefined) updates.categoryKey = category;
      if (type !== undefined) updates.challengeType = type;
      if (descriptionShort !== undefined) updates.description = descriptionShort;
      if (descriptionLong !== undefined) updates.descriptionLong = descriptionLong;
      if (metricType !== undefined) updates.metricType = metricType;
      if (metricSource !== undefined) updates.metricSource = metricSource;
      if (metricKey !== undefined) updates.metricKey = metricKey;
      if (metricAggregation !== undefined) updates.metricAggregation = metricAggregation;
      if (metricFilters !== undefined) updates.metricFilters = metricFilters;
      if (tierSystemOverride !== undefined) updates.tierSystemOverride = tierSystemOverride;
      if (tieringMode !== undefined) updates.tieringMode = tieringMode;
      if (tierConfig !== undefined) updates.tierConfig = tierConfig;
      if (isClusterBased !== undefined) updates.isClusterBased = isClusterBased;
      if (isTestOnly !== undefined) updates.isTestOnly = isTestOnly;
      if (isVisibleFe !== undefined) updates.isVisibleFe = isVisibleFe;
      if (sortOrder !== undefined) updates.sortOrder = sortOrder;
      if (meta !== undefined) updates.meta = meta;
      
      const [updated] = await db
        .update(challenges)
        .set(updates)
        .where(eq(challenges.id, parseInt(id)))
        .returning();
      
      // Update tiers if provided
      if (tiers && Array.isArray(tiers)) {
        // Delete existing tiers and recreate
        await db.delete(challengeTiers).where(eq(challengeTiers.challengeKey, existing.key));
        
        if (tiers.length > 0) {
          await db.insert(challengeTiers).values(
            tiers.map((t, idx) => ({
              challengeKey: existing.key,
              tierCode: t.tierCode,
              displayName: t.displayName || t.tierCode,
              thresholdValue: t.thresholdValue,
              isPrestige: t.isPrestige || false,
              sortOrder: t.sortOrder || idx + 1,
            }))
          );
        }
      }
      
      // Re-run auto-validation
      const autoChecks = runAutoValidation(updated);
      await db
        .insert(challengeValidation)
        .values({ challengeId: parseInt(id), autoChecks })
        .onConflictDoUpdate({
          target: challengeValidation.challengeId,
          set: { autoChecks },
        });
      
      // Log the update
      await db.insert(challengeAuditLog).values({
        challengeId: parseInt(id),
        actor: adminId,
        action: 'update',
        payloadDiff: { before: existing, after: updated },
      });
      
      console.log(`[ChallengeAdmin] Updated challenge ${existing.key} by ${adminId}`);
      
      res.json(updated);
    } catch (err) {
      console.error('[API] Admin update challenge error:', err);
      res.status(500).json({ error: 'Failed to update challenge' });
    }
  });

  // POST /api/admin/challenges/:id/validate - Run validation
  app.post('/api/admin/challenges/:id/validate', isAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const adminId = req.adminUser?.discordId || 'unknown';
      const { manualChecks } = req.body;
      
      // Get challenge
      const [challenge] = await db
        .select()
        .from(challenges)
        .where(eq(challenges.id, parseInt(id)));
      
      if (!challenge) {
        return res.status(404).json({ error: 'Challenge not found' });
      }
      
      // Run auto-validation
      const autoChecks = runAutoValidation(challenge);
      
      // Update or create validation record
      const validationUpdate = {
        autoChecks,
        lastRunAt: new Date(),
        lastRunBy: adminId,
      };
      
      if (manualChecks) {
        validationUpdate.manualChecks = manualChecks;
      }
      
      await db
        .insert(challengeValidation)
        .values({ challengeId: parseInt(id), ...validationUpdate, manualChecks: manualChecks || {} })
        .onConflictDoUpdate({
          target: challengeValidation.challengeId,
          set: validationUpdate,
        });
      
      // Get current validation
      const [validation] = await db
        .select()
        .from(challengeValidation)
        .where(eq(challengeValidation.challengeId, parseInt(id)));
      
      const canPromoteToValidated = canPromote(challenge, validation, 'validated');
      const canPromoteToDeployed = canPromote(challenge, validation, 'deployed');
      
      res.json({
        status: 'ok',
        autoChecks,
        manualChecks: validation?.manualChecks || manualChecks || {},
        canPromoteToValidated,
        canPromoteToDeployed,
      });
    } catch (err) {
      console.error('[API] Admin validate challenge error:', err);
      res.status(500).json({ error: 'Failed to validate challenge' });
    }
  });

  // POST /api/admin/challenges/:id/state - Transition state
  app.post('/api/admin/challenges/:id/state', isAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const adminId = req.adminUser?.discordId || 'unknown';
      const { targetState } = req.body;
      
      if (!targetState || !CHALLENGE_STATES.includes(targetState)) {
        return res.status(400).json({ 
          error: `Invalid target state. Must be one of: ${CHALLENGE_STATES.join(', ')}` 
        });
      }
      
      // Get challenge
      const [challenge] = await db
        .select()
        .from(challenges)
        .where(eq(challenges.id, parseInt(id)));
      
      if (!challenge) {
        return res.status(404).json({ error: 'Challenge not found' });
      }
      
      // Check if transition is valid
      const validTransitions = VALID_STATE_TRANSITIONS[challenge.state] || [];
      if (!validTransitions.includes(targetState)) {
        return res.status(400).json({ 
          error: `Invalid transition from ${challenge.state} to ${targetState}. Valid: ${validTransitions.join(', ') || 'none'}` 
        });
      }
      
      // Get validation for promotion checks
      const [validation] = await db
        .select()
        .from(challengeValidation)
        .where(eq(challengeValidation.challengeId, parseInt(id)));
      
      if (!canPromote(challenge, validation, targetState)) {
        return res.status(400).json({ 
          error: `Validation requirements not met for ${targetState} state` 
        });
      }
      
      // Update state
      await db
        .update(challenges)
        .set({ 
          state: targetState, 
          updatedAt: new Date(),
          updatedBy: adminId,
        })
        .where(eq(challenges.id, parseInt(id)));
      
      // Log the transition
      await db.insert(challengeAuditLog).values({
        challengeId: parseInt(id),
        actor: adminId,
        action: 'state_change',
        fromState: challenge.state,
        toState: targetState,
      });
      
      console.log(`[ChallengeAdmin] State change ${challenge.key}: ${challenge.state} -> ${targetState} by ${adminId}`);
      
      res.json({
        id: parseInt(id),
        previousState: challenge.state,
        newState: targetState,
      });
    } catch (err) {
      console.error('[API] Admin state transition error:', err);
      res.status(500).json({ error: 'Failed to transition state' });
    }
  });

  // DELETE /api/admin/challenges/:id - Soft delete (deprecate)
  app.delete('/api/admin/challenges/:id', isAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const adminId = req.adminUser?.discordId || 'unknown';
      
      // Get challenge
      const [challenge] = await db
        .select()
        .from(challenges)
        .where(eq(challenges.id, parseInt(id)));
      
      if (!challenge) {
        return res.status(404).json({ error: 'Challenge not found' });
      }
      
      const previousState = challenge.state;
      
      // Soft delete: set state to deprecated and hide from FE
      await db
        .update(challenges)
        .set({ 
          state: 'deprecated', 
          isVisibleFe: false,
          isActive: false,
          updatedAt: new Date(),
          updatedBy: adminId,
        })
        .where(eq(challenges.id, parseInt(id)));
      
      // Log the deletion
      await db.insert(challengeAuditLog).values({
        challengeId: parseInt(id),
        actor: adminId,
        action: 'delete',
        fromState: previousState,
        toState: 'deprecated',
      });
      
      console.log(`[ChallengeAdmin] Deprecated challenge ${challenge.key} by ${adminId}`);
      
      res.json({ success: true, message: 'Challenge deprecated' });
    } catch (err) {
      console.error('[API] Admin delete challenge error:', err);
      res.status(500).json({ error: 'Failed to delete challenge' });
    }
  });

  // GET /api/admin/challenges/:id/audit - Get audit log for a challenge
  app.get('/api/admin/challenges/:id/audit', isAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      
      const logs = await db
        .select()
        .from(challengeAuditLog)
        .where(eq(challengeAuditLog.challengeId, parseInt(id)))
        .orderBy(desc(challengeAuditLog.createdAt))
        .limit(50);
      
      res.json(logs.map(l => ({
        id: l.id,
        actor: l.actor,
        action: l.action,
        fromState: l.fromState,
        toState: l.toState,
        createdAt: l.createdAt?.toISOString(),
      })));
    } catch (err) {
      console.error('[API] Admin audit log error:', err);
      res.status(500).json({ error: 'Failed to get audit log' });
    }
  });

  // ============================================================================
  // CALIBRATION ENDPOINTS - Tier threshold calibration based on challenge_progress
  // ============================================================================

  /**
   * Resolves effective tier system for a challenge:
   * 1) If challenge has tierSystemOverride set, use it
   * 2) Else inherit from category's tierSystem
   * 3) Default to RARITY if neither available
   * 
   * Returns: { tierSystem, tierLadder, suggestableTiers, isPrestige }
   * - tierLadder: All tiers from DB in sortOrder
   * - suggestableTiers: Tiers eligible for threshold suggestions (excludes baseline for RARITY)
   */
  async function resolveTierLadder(challengeKey) {
    // Get challenge with its category
    const [challenge] = await db
      .select({
        id: challenges.id,
        key: challenges.key,
        categoryKey: challenges.categoryKey,
        tierSystemOverride: challenges.tierSystemOverride,
      })
      .from(challenges)
      .where(eq(challenges.key, challengeKey));
    
    if (!challenge) {
      return { tierSystem: 'RARITY', tierLadder: [], suggestableTiers: [], isPrestige: false, error: 'Challenge not found' };
    }
    
    // Get category's tier system
    let categoryTierSystem = 'RARITY';
    if (challenge.categoryKey) {
      const [category] = await db
        .select({ tierSystem: challengeCategories.tierSystem })
        .from(challengeCategories)
        .where(eq(challengeCategories.key, challenge.categoryKey));
      if (category) {
        categoryTierSystem = category.tierSystem;
      }
    }
    
    // Resolve effective tier system: override > category > default
    const effectiveTierSystem = challenge.tierSystemOverride || categoryTierSystem || 'RARITY';
    const isPrestige = effectiveTierSystem === 'PRESTIGE';
    
    // Load tier ladder from DB (ordered by sortOrder)
    const tierLadder = await db
      .select({
        tierCode: challengeTiers.tierCode,
        displayName: challengeTiers.displayName,
        thresholdValue: challengeTiers.thresholdValue,
        isPrestige: challengeTiers.isPrestige,
        sortOrder: challengeTiers.sortOrder,
      })
      .from(challengeTiers)
      .where(eq(challengeTiers.challengeKey, challengeKey))
      .orderBy(asc(challengeTiers.sortOrder));
    
    // Compute suggestableTiers (tiers that get percentile-based suggestions)
    // - For RARITY: skip first tier (COMMON as baseline), all remaining tiers get suggestions
    // - For GENE/MIXED/other: all tiers in ladder get suggestions
    // - For PRESTIGE: no suggestions (returns empty array)
    let suggestableTiers = [];
    if (!isPrestige && tierLadder.length > 0) {
      if (effectiveTierSystem === 'RARITY') {
        // RARITY-style: Skip baseline tier 1 (COMMON), suggest for all remaining tiers
        suggestableTiers = tierLadder.slice(1);
      } else {
        // GENE/MIXED/other systems: All tiers get suggestions
        suggestableTiers = tierLadder.slice();
      }
    }
    
    return { 
      tierSystem: effectiveTierSystem, 
      tierLadder, 
      suggestableTiers,
      isPrestige,
      challengeId: challenge.id,
    };
  }

  /**
   * Maps percentile targets to suggestable tier codes
   * Input: suggestableTiers array (already filtered for ladder type)
   * Output: { tierCode: percentileValue, ... }
   */
  function mapPercentilestoTiers(suggestableTiers, percentileValues) {
    if (!suggestableTiers || suggestableTiers.length === 0) {
      return {};
    }
    
    const suggested = {};
    const pValues = [
      percentileValues.p40,
      percentileValues.p70,
      percentileValues.p90,
      percentileValues.p97,
    ];
    
    // Map percentile values to suggestable tiers in order
    for (let i = 0; i < Math.min(suggestableTiers.length, pValues.length); i++) {
      suggested[suggestableTiers[i].tierCode] = pValues[i] || 0;
    }
    
    return suggested;
  }

  // GET /api/admin/challenges/:challengeKey/calibration - Get cached calibration stats
  app.get('/api/admin/challenges/:challengeKey/calibration', isAdmin, async (req, res) => {
    try {
      const { challengeKey } = req.params;
      const cohortKey = req.query.cohortKey || 'ALL';
      
      // Resolve tier ladder for this challenge
      const { tierSystem, tierLadder, suggestableTiers, isPrestige } = await resolveTierLadder(challengeKey);
      
      // Look for cached stats
      const [cached] = await db
        .select()
        .from(challengeMetricStats)
        .where(and(
          eq(challengeMetricStats.challengeKey, challengeKey),
          eq(challengeMetricStats.cohortKey, cohortKey)
        ));
      
      if (!cached) {
        return res.json({ 
          cached: false, 
          message: 'No cached stats. Use POST /refresh to compute.',
          tierSystem,
          tierLadder,
          suggestableTiers,
          isPrestige,
        });
      }
      
      // Get percentile values for mapping
      const percentileValues = {
        p40: parseFloat(cached.suggestedBasic) || 0,
        p70: parseFloat(cached.suggestedAdvanced) || 0,
        p90: parseFloat(cached.suggestedElite) || 0,
        p97: parseFloat(cached.suggestedExalted) || 0,
      };
      
      // Map suggested thresholds to actual tier codes (using pre-filtered suggestableTiers)
      const suggestedByTier = mapPercentilestoTiers(suggestableTiers, percentileValues);
      
      res.json({
        cached: true,
        challengeKey: cached.challengeKey,
        cohortKey: cached.cohortKey,
        computedAt: cached.computedAt?.toISOString(),
        clusterCount: cached.clusterCount,
        nonzeroCount: cached.nonzeroCount,
        tierSystem,
        tierLadder,
        suggestableTiers,
        isPrestige,
        percentiles: {
          min: parseFloat(cached.minValue) || 0,
          p10: parseFloat(cached.p10) || 0,
          p25: parseFloat(cached.p25) || 0,
          p40: parseFloat(cached.p40) || 0,
          p50: parseFloat(cached.p50) || 0,
          p70: parseFloat(cached.p70) || 0,
          p75: parseFloat(cached.p75) || 0,
          p90: parseFloat(cached.p90) || 0,
          p95: parseFloat(cached.p95) || 0,
          p97: parseFloat(cached.p97) || 0,
          p99: parseFloat(cached.p99) || 0,
          max: parseFloat(cached.maxValue) || 0,
          mean: parseFloat(cached.meanValue) || 0,
        },
        targets: {
          pct1: parseFloat(cached.targetBasicPct) || 0.40,
          pct2: parseFloat(cached.targetAdvancedPct) || 0.70,
          pct3: parseFloat(cached.targetElitePct) || 0.90,
          pct4: parseFloat(cached.targetExaltedPct) || 0.97,
        },
        suggestedByTier,
        warnings: cached.meta?.warnings || [],
        zeroInflated: cached.meta?.zeroInflated || false,
        whaleSkew: cached.meta?.whaleSkew || false,
        lowSample: cached.meta?.lowSample || false,
      });
    } catch (err) {
      console.error('[API] Calibration get error:', err);
      res.status(500).json({ error: 'Failed to get calibration stats' });
    }
  });

  // POST /api/admin/challenges/:challengeKey/calibration/refresh - Compute/refresh calibration stats
  app.post('/api/admin/challenges/:challengeKey/calibration/refresh', isAdmin, async (req, res) => {
    try {
      const { challengeKey } = req.params;
      const cohortKey = req.body.cohortKey || 'ALL';
      const targets = req.body.targets || {};
      
      // Resolve tier ladder for this challenge
      const { tierSystem, tierLadder, suggestableTiers, isPrestige } = await resolveTierLadder(challengeKey);
      
      // Use generic percentile targets (pct1-4) instead of hardcoded names
      const pct1 = targets.pct1 ?? targets.basicPct ?? 0.40;
      const pct2 = targets.pct2 ?? targets.advancedPct ?? 0.70;
      const pct3 = targets.pct3 ?? targets.elitePct ?? 0.90;
      const pct4 = targets.pct4 ?? targets.exaltedPct ?? 0.97;
      
      // Build cohort filter for the SQL query (using windowed table columns)
      let cohortFilter = sql`1=1`;
      if (cohortKey === 'NONZERO') {
        cohortFilter = sql`${challengeProgressWindowed.value}::numeric > 0`;
      } else if (cohortKey === 'ACTIVE_30D') {
        cohortFilter = sql`${challengeProgressWindowed.computedAt} > NOW() - INTERVAL '30 days'`;
      }
      
      // Compute percentile stats from challenge_progress_windowed (180d rolling window)
      const statsResult = await db.execute(sql`
        WITH progress_data AS (
          SELECT value::numeric as value
          FROM challenge_progress_windowed
          WHERE challenge_key = ${challengeKey}
            AND window_key = '180d'
            AND ${cohortFilter}
        )
        SELECT
          COUNT(*)::int as cluster_count,
          COUNT(CASE WHEN value > 0 THEN 1 END)::int as nonzero_count,
          MIN(value) as min_value,
          PERCENTILE_CONT(0.10) WITHIN GROUP (ORDER BY value) as p10,
          PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY value) as p25,
          PERCENTILE_CONT(0.40) WITHIN GROUP (ORDER BY value) as p40,
          PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY value) as p50,
          PERCENTILE_CONT(0.70) WITHIN GROUP (ORDER BY value) as p70,
          PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY value) as p75,
          PERCENTILE_CONT(0.90) WITHIN GROUP (ORDER BY value) as p90,
          PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY value) as p95,
          PERCENTILE_CONT(0.97) WITHIN GROUP (ORDER BY value) as p97,
          PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY value) as p99,
          MAX(value) as max_value,
          AVG(value) as mean_value,
          PERCENTILE_CONT(${pct1}) WITHIN GROUP (ORDER BY value) as suggested_pct1,
          PERCENTILE_CONT(${pct2}) WITHIN GROUP (ORDER BY value) as suggested_pct2,
          PERCENTILE_CONT(${pct3}) WITHIN GROUP (ORDER BY value) as suggested_pct3,
          PERCENTILE_CONT(${pct4}) WITHIN GROUP (ORDER BY value) as suggested_pct4
        FROM progress_data
      `);
      
      const stats = statsResult.rows?.[0] || statsResult[0] || {};
      
      // Compute warnings
      const warnings = [];
      const clusterCount = parseInt(stats.cluster_count) || 0;
      const nonzeroCount = parseInt(stats.nonzero_count) || 0;
      const maxVal = parseFloat(stats.max_value) || 0;
      const p95Val = parseFloat(stats.p95) || 0;
      
      const zeroInflated = clusterCount > 0 && (nonzeroCount / clusterCount) < 0.30;
      const whaleSkew = p95Val > 0 && (maxVal / p95Val) >= 20;
      const lowSample = clusterCount < 25;
      
      if (zeroInflated) warnings.push('zeroInflated: >70% have zero progress');
      if (whaleSkew) warnings.push('whaleSkew: max/p95 >= 20x');
      if (lowSample) warnings.push('lowSample: fewer than 25 clusters');
      
      // Upsert into challenge_metric_stats (using old column names for DB compatibility)
      const upsertData = {
        challengeKey,
        cohortKey,
        clusterCount,
        nonzeroCount,
        minValue: stats.min_value?.toString(),
        p10: stats.p10?.toString(),
        p25: stats.p25?.toString(),
        p40: stats.p40?.toString(),
        p50: stats.p50?.toString(),
        p70: stats.p70?.toString(),
        p75: stats.p75?.toString(),
        p90: stats.p90?.toString(),
        p95: stats.p95?.toString(),
        p97: stats.p97?.toString(),
        p99: stats.p99?.toString(),
        maxValue: stats.max_value?.toString(),
        meanValue: stats.mean_value?.toString(),
        targetBasicPct: pct1.toString(),
        targetAdvancedPct: pct2.toString(),
        targetElitePct: pct3.toString(),
        targetExaltedPct: pct4.toString(),
        suggestedBasic: stats.suggested_pct1?.toString(),
        suggestedAdvanced: stats.suggested_pct2?.toString(),
        suggestedElite: stats.suggested_pct3?.toString(),
        suggestedExalted: stats.suggested_pct4?.toString(),
        meta: { warnings, zeroInflated, whaleSkew, lowSample },
        computedAt: new Date(),
      };
      
      await db
        .insert(challengeMetricStats)
        .values(upsertData)
        .onConflictDoUpdate({
          target: [challengeMetricStats.challengeKey, challengeMetricStats.cohortKey],
          set: upsertData,
        });
      
      console.log(`[Calibration] Refreshed stats for ${challengeKey}/${cohortKey}: ${clusterCount} clusters, ${nonzeroCount} nonzero`);
      
      // Map suggested thresholds to actual tier codes
      const percentileValues = {
        p40: parseFloat(stats.suggested_pct1) || 0,
        p70: parseFloat(stats.suggested_pct2) || 0,
        p90: parseFloat(stats.suggested_pct3) || 0,
        p97: parseFloat(stats.suggested_pct4) || 0,
      };
      const suggestedByTier = mapPercentilestoTiers(suggestableTiers, percentileValues);
      
      res.json({
        success: true,
        challengeKey,
        cohortKey,
        clusterCount,
        nonzeroCount,
        tierSystem,
        tierLadder,
        suggestableTiers,
        isPrestige,
        percentiles: {
          min: parseFloat(stats.min_value) || 0,
          p10: parseFloat(stats.p10) || 0,
          p25: parseFloat(stats.p25) || 0,
          p40: parseFloat(stats.p40) || 0,
          p50: parseFloat(stats.p50) || 0,
          p70: parseFloat(stats.p70) || 0,
          p75: parseFloat(stats.p75) || 0,
          p90: parseFloat(stats.p90) || 0,
          p95: parseFloat(stats.p95) || 0,
          p97: parseFloat(stats.p97) || 0,
          p99: parseFloat(stats.p99) || 0,
          max: parseFloat(stats.max_value) || 0,
          mean: parseFloat(stats.mean_value) || 0,
        },
        targets: { pct1, pct2, pct3, pct4 },
        suggestedByTier,
        warnings,
        zeroInflated,
        whaleSkew,
        lowSample,
      });
    } catch (err) {
      console.error('[API] Calibration refresh error:', err);
      res.status(500).json({ error: 'Failed to refresh calibration stats' });
    }
  });

  // POST /api/admin/challenges/:challengeKey/calibration/apply - Apply thresholds to challenge tiers
  app.post('/api/admin/challenges/:challengeKey/calibration/apply', isAdmin, async (req, res) => {
    try {
      const { challengeKey } = req.params;
      const adminId = req.adminUser?.discordId || 'unknown';
      const { thresholds } = req.body;
      
      // thresholds should be an object keyed by tierCode: { UNCOMMON: 10, RARE: 50, ... }
      if (!thresholds || typeof thresholds !== 'object') {
        return res.status(400).json({ error: 'thresholds object required, keyed by tierCode (e.g., { UNCOMMON: 10, RARE: 50 })' });
      }
      
      // Resolve tier ladder for this challenge
      const { tierSystem, tierLadder, suggestableTiers, isPrestige, challengeId } = await resolveTierLadder(challengeKey);
      
      if (isPrestige) {
        return res.status(400).json({ error: 'PRESTIGE challenges do not support threshold calibration' });
      }
      
      // Get the challenge to check state
      const [challenge] = await db
        .select()
        .from(challenges)
        .where(eq(challenges.key, challengeKey));
      
      if (!challenge) {
        return res.status(404).json({ error: 'Challenge not found' });
      }
      
      if (challenge.state !== 'draft' && challenge.state !== 'validated') {
        return res.status(400).json({ error: 'Can only apply thresholds to draft or validated challenges' });
      }
      
      // Update existing tiers by tierCode match (don't delete/recreate)
      const updatedTiers = [];
      for (const tier of tierLadder) {
        const newValue = thresholds[tier.tierCode];
        if (newValue !== undefined && newValue !== null) {
          await db
            .update(challengeTiers)
            .set({ thresholdValue: Math.round(newValue) })
            .where(and(
              eq(challengeTiers.challengeKey, challengeKey),
              eq(challengeTiers.tierCode, tier.tierCode)
            ));
          updatedTiers.push({ tierCode: tier.tierCode, thresholdValue: Math.round(newValue) });
        }
      }
      
      // Update challenge timestamp
      await db
        .update(challenges)
        .set({ updatedAt: new Date() })
        .where(eq(challenges.key, challengeKey));
      
      // Log the change
      await db.insert(challengeAuditLog).values({
        challengeId: challenge.id,
        actor: adminId,
        action: 'calibration_apply',
        payloadDiff: { appliedThresholds: thresholds, tierSystem },
      });
      
      console.log(`[Calibration] Applied thresholds to ${challengeKey} (${tierSystem}) by ${adminId}: ${updatedTiers.length} tiers updated`);
      
      res.json({ success: true, tierSystem, updatedTiers, appliedThresholds: thresholds });
    } catch (err) {
      console.error('[API] Calibration apply error:', err);
      res.status(500).json({ error: 'Failed to apply thresholds' });
    }
  });

  // POST /api/admin/challenges/:challengeKey/calibration/simulate - Simulate tier distribution
  app.post('/api/admin/challenges/:challengeKey/calibration/simulate', isAdmin, async (req, res) => {
    try {
      const { challengeKey } = req.params;
      const cohortKey = req.body.cohortKey || 'ALL';
      const { thresholds } = req.body;
      
      // thresholds should be an object keyed by tierCode: { UNCOMMON: 10, RARE: 50, ... }
      if (!thresholds || typeof thresholds !== 'object') {
        return res.status(400).json({ error: 'thresholds object required, keyed by tierCode' });
      }
      
      // Resolve tier ladder for this challenge
      const { tierSystem, tierLadder, suggestableTiers, isPrestige } = await resolveTierLadder(challengeKey);
      
      // Handle PRESTIGE challenges separately
      if (isPrestige) {
        // Build cohort filter
        let cohortWhere = '';
        if (cohortKey === 'NONZERO') cohortWhere = 'AND current_value > 0';
        else if (cohortKey === 'ACTIVE_30D') cohortWhere = "AND last_updated > NOW() - INTERVAL '30 days'";
        
        const presResult = await db.execute(sql.raw(`
          SELECT
            COUNT(*)::int as total,
            COUNT(CASE WHEN current_value > 0 THEN 1 END)::int as unlocked
          FROM player_challenge_progress
          WHERE challenge_key = '${challengeKey}'
          ${cohortWhere}
        `));
        
        const pres = presResult.rows?.[0] || presResult[0] || {};
        const total = parseInt(pres.total) || 0;
        const unlocked = parseInt(pres.unlocked) || 0;
        const locked = total - unlocked;
        
        return res.json({
          challengeKey,
          cohortKey,
          tierSystem,
          isPrestige: true,
          total,
          distribution: {
            UNLOCKED: { count: unlocked, pct: total > 0 ? Math.round((unlocked / total) * 10000) / 100 : 0 },
            LOCKED: { count: locked, pct: total > 0 ? Math.round((locked / total) * 10000) / 100 : 0 },
          },
        });
      }
      
      // Build cohort filter for windowed table (180d rolling window)
      let cohortWhere = '';
      if (cohortKey === 'NONZERO') cohortWhere = 'AND value::numeric > 0';
      else if (cohortKey === 'ACTIVE_30D') cohortWhere = "AND computed_at > NOW() - INTERVAL '30 days'";
      
      // Get ordered threshold values from the suggestable tiers (excludes baseline for RARITY)
      // This ensures we only count tiers that have thresholds set by the calibration system
      const orderedThresholds = suggestableTiers
        .map(t => ({ tierCode: t.tierCode, displayName: t.displayName, threshold: thresholds[t.tierCode] ?? t.thresholdValue ?? 0 }))
        .sort((a, b) => a.threshold - b.threshold);
      
      // Build dynamic CASE statements for tier buckets
      let caseClauses = [`COUNT(*)::int as total`];
      
      // Below first tier
      if (orderedThresholds.length > 0) {
        caseClauses.push(`COUNT(CASE WHEN value::numeric < ${orderedThresholds[0].threshold} THEN 1 END)::int as below_first`);
      }
      
      // Each tier bucket
      for (let i = 0; i < orderedThresholds.length; i++) {
        const tierCode = orderedThresholds[i].tierCode.toLowerCase();
        const thisThresh = orderedThresholds[i].threshold;
        const nextThresh = orderedThresholds[i + 1]?.threshold;
        
        if (nextThresh !== undefined) {
          caseClauses.push(`COUNT(CASE WHEN value::numeric >= ${thisThresh} AND value::numeric < ${nextThresh} THEN 1 END)::int as tier_${tierCode}`);
        } else {
          // Last tier: >= threshold
          caseClauses.push(`COUNT(CASE WHEN value::numeric >= ${thisThresh} THEN 1 END)::int as tier_${tierCode}`);
        }
      }
      
      // Use challenge_progress_windowed for 180d rolling window (per-wallet)
      const simQuery = `
        SELECT ${caseClauses.join(',\n')}
        FROM challenge_progress_windowed
        WHERE challenge_key = '${challengeKey}'
          AND window_key = '180d'
        ${cohortWhere}
      `;
      
      const simResult = await db.execute(sql.raw(simQuery));
      const sim = simResult.rows?.[0] || simResult[0] || {};
      const total = parseInt(sim.total) || 0;
      
      // Build distribution by tier
      const distribution = {};
      
      // Below first tier
      if (orderedThresholds.length > 0) {
        const belowCount = parseInt(sim.below_first) || 0;
        distribution['_BELOW_TIER1'] = { 
          count: belowCount, 
          pct: total > 0 ? Math.round((belowCount / total) * 10000) / 100 : 0,
        };
      }
      
      // Each tier
      for (const t of orderedThresholds) {
        const key = `tier_${t.tierCode.toLowerCase()}`;
        const count = parseInt(sim[key]) || 0;
        distribution[t.tierCode] = { 
          count, 
          pct: total > 0 ? Math.round((count / total) * 10000) / 100 : 0,
        };
      }
      
      res.json({
        challengeKey,
        cohortKey,
        tierSystem,
        suggestableTiers: suggestableTiers.map(t => t.tierCode),
        thresholds,
        total,
        distribution,
      });
    } catch (err) {
      console.error('[API] Calibration simulate error:', err);
      res.status(500).json({ error: 'Failed to simulate distribution' });
    }
  });

  // GET /api/admin/challenge-categories - Get all categories for dropdown
  app.get('/api/admin/challenge-categories', isAdmin, async (req, res) => {
    try {
      const categories = await db
        .select()
        .from(challengeCategories)
        .orderBy(challengeCategories.sortOrder);
      
      res.json(categories.map(c => ({
        key: c.key,
        name: c.name,
        description: c.description,
        tierSystem: c.tierSystem,
      })));
    } catch (err) {
      console.error('[API] Admin categories error:', err);
      res.status(500).json({ error: 'Failed to get categories' });
    }
  });

  // ============================================================================
  // HEDGE VISION MODE - STUB ENDPOINT
  // ============================================================================
  // This is a placeholder for future "Hedge Vision Mode" functionality.
  // 
  // In the future, this endpoint will:
  //   1. Accept screenshots from the client (as base64 or data URL)
  //   2. Call a vision-capable AI model (e.g., GPT-4 with vision)
  //   3. Return a structured interpretation of the current game screen
  //      (e.g., detect heroes, quests, UI elements, suggest actions)
  //
  // For now, this endpoint does NOT call any AI and exists only so the
  // frontend has a stable endpoint to point at for future integration.
  // ============================================================================
  app.post('/api/hedge/analyze-screen', async (req, res) => {
    try {
      const { image } = req.body || {};

      // Validate that image field is present
      if (!image) {
        return res.status(400).json({
          status: 'error',
          message: "Missing 'image' field in request body."
        });
      }

      // Stub response - no AI call yet
      return res.json({
        status: 'not_implemented',
        message: 'Vision Mode is not implemented yet. This endpoint is a stub for future use.',
        echo: { hasImage: true }
      });
    } catch (err) {
      console.error('[API] Hedge Vision Mode error:', err);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  });

  // Discord OAuth Routes
  app.get('/auth/discord', (req, res) => {
    if (!DISCORD_CLIENT_ID) {
      return res
        .status(400)
        .json({ error: 'Discord OAuth not configured' });
    }

    const state = crypto.randomBytes(16).toString('hex');
    const scopes = 'identify guilds';
    const authorizeUrl = `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(
      REDIRECT_URI
    )}&response_type=code&scope=${encodeURIComponent(
      scopes
    )}&state=${state}`;

    res.setCookie('oauth_state', state, { maxAge: 600 }); // 10 minutes
    res.redirect(authorizeUrl);
  });

  app.get('/auth/discord/callback', async (req, res) => {
    try {
      if (!DISCORD_CLIENT_ID || !DISCORD_CLIENT_SECRET) {
        return res
          .status(400)
          .json({ error: 'Discord OAuth not configured' });
      }

      const { code, state } = req.query;

      if (!code || !state) {
        return res.status(400).json({ error: 'Missing code or state' });
      }

      if (state !== req.cookies.oauth_state) {
        return res
          .status(403)
          .json({ error: 'State mismatch - potential CSRF attack' });
      }

      // Exchange code for token
      const tokenResponse = await fetch(
        'https://discord.com/api/oauth2/token',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: DISCORD_CLIENT_ID,
            client_secret: DISCORD_CLIENT_SECRET,
            code,
            grant_type: 'authorization_code',
            redirect_uri: REDIRECT_URI,
          }),
        }
      );

      if (!tokenResponse.ok) {
        const error = await tokenResponse.text();
        console.error('❌ Discord token exchange failed:', error);
        return res
          .status(401)
          .json({ error: 'Failed to exchange code for token' });
      }

      const tokenData = await tokenResponse.json();

      // Get user info
      const userResponse = await fetch(
        'https://discord.com/api/users/@me',
        {
          headers: { Authorization: `Bearer ${tokenData.access_token}` },
        }
      );

      if (!userResponse.ok) {
        return res
          .status(401)
          .json({ error: 'Failed to fetch user info' });
      }

      const user = await userResponse.json();
      console.log(
        `🔐 OAuth Success - Discord User ID: ${user.id}, Username: ${user.username}`
      );

      // Create session token
      const sessionToken = crypto
        .createHmac('sha256', SESSION_SECRET)
        .update(`${user.id}:${Date.now()}`)
        .digest('hex');

      // Store session in database (30-day expiration for "remember me")
      const expiresAt = new Date(
        Date.now() + 30 * 24 * 60 * 60 * 1000
      );
      await db.insert(adminSessions).values({
        sessionToken,
        discordId: user.id,
        username: user.username,
        avatar: user.avatar,
        accessToken: tokenData.access_token,
        expiresAt,
      });

      // Determine cookie domain for cross-subdomain auth
      const cookieDomain = process.env.COOKIE_DOMAIN || undefined;
      res.setCookie('session_token', sessionToken, {
        maxAge: 30 * 24 * 60 * 60, // 30 days for "remember me"
        httpOnly: true,
        secure: true,
        sameSite: 'None', // Required for cross-site cookies
        path: '/',
        domain: cookieDomain,
      });

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
      // Check for OAuth bypass mode (for testing)
      if (isOAuthBypassEnabled()) {
        return res.json({
          authenticated: true,
          user: {
            discordId: 'bypass-admin',
            username: 'Bypass Admin',
            avatar: null,
            isAdmin: true,
          },
        });
      }

      const sessionToken = req.cookies.session_token;

      if (!sessionToken) {
        return res.json({ authenticated: false });
      }

      // Fetch from database
      const sessions = await db
        .select()
        .from(adminSessions)
        .where(eq(adminSessions.sessionToken, sessionToken));

      if (!sessions || sessions.length === 0) {
        return res.json({ authenticated: false });
      }

      const session = sessions[0];

      if (new Date(session.expiresAt) < new Date()) {
        await db
          .delete(adminSessions)
          .where(eq(adminSessions.sessionToken, sessionToken));
        return res.json({ authenticated: false });
      }

      const isAdmin = ADMIN_USER_IDS.includes(session.discordId);

      res.json({
        authenticated: true,
        user: {
          discordId: session.discordId,
          username: session.username,
          avatar: session.avatar,
          isAdmin,
        },
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
        await db
          .delete(adminSessions)
          .where(eq(adminSessions.sessionToken, sessionToken));
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
        await db
          .delete(adminSessions)
          .where(eq(adminSessions.sessionToken, sessionToken));
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
    console.log('Falling back to static file serving...');

    const staticBuildPath = path.resolve(import.meta.dirname, 'static-build');
    const distPublicPath = path.resolve(import.meta.dirname, 'dist', 'public');
    const staticBuildIndex = path.resolve(staticBuildPath, 'index.html');
    const distPublicIndex = path.resolve(distPublicPath, 'index.html');
    
    // Check if we have any built frontend files
    const hasStaticBuild = fs.existsSync(staticBuildIndex);
    const hasDistPublic = fs.existsSync(distPublicIndex);
    
    // If no frontend build exists at all, run vite build at startup
    // This handles Replit deployments where build artifacts don't persist to run phase
    if (!hasStaticBuild && !hasDistPublic) {
      console.log('🔨 No frontend build found - running vite build at startup...');
      try {
        const { execSync } = await import('child_process');
        // Build directly into static-build to avoid sync issues
        execSync('npx vite build --outDir static-build', { 
          stdio: 'inherit',
          cwd: import.meta.dirname,
          timeout: 300000 // 5 minute timeout
        });
        console.log('✅ Frontend build completed to static-build/');
      } catch (buildErr) {
        console.error('❌ CRITICAL: Failed to build frontend:', buildErr.message);
        console.error('❌ Server will not be able to serve the web interface.');
        // Don't abort - API endpoints should still work even if frontend fails
      }
    }
    
    // After potential build, sync dist/public to static-build if it exists (for builds that went to dist/public)
    if (fs.existsSync(distPublicIndex) && !fs.existsSync(staticBuildIndex)) {
      console.log('📦 Syncing dist/public to static-build for runtime serving...');
      try {
        // Clear existing static-build to avoid stale files
        if (fs.existsSync(staticBuildPath)) {
          fs.rmSync(staticBuildPath, { recursive: true, force: true });
        }
        fs.mkdirSync(staticBuildPath, { recursive: true });
        
        // Copy all files from dist/public to static-build
        const copyRecursive = (src, dest) => {
          const entries = fs.readdirSync(src, { withFileTypes: true });
          for (const entry of entries) {
            const srcPath = path.join(src, entry.name);
            const destPath = path.join(dest, entry.name);
            if (entry.isDirectory()) {
              fs.mkdirSync(destPath, { recursive: true });
              copyRecursive(srcPath, destPath);
            } else {
              fs.copyFileSync(srcPath, destPath);
            }
          }
        };
        copyRecursive(distPublicPath, staticBuildPath);
        console.log('✅ Synced build files to static-build/');
      } catch (copyErr) {
        console.error('❌ Failed to sync build files:', copyErr.message);
      }
    }

    // Check multiple possible build output directories
    // - static-build/: Primary location (synced from dist/public)
    // - dist/public/: Vite build output
    // - dist/: Alternative location
    const possiblePaths = [
      staticBuildPath,
      distPublicPath,
      path.resolve(import.meta.dirname, 'dist')
    ];
    
    let distPath = null;
    for (const p of possiblePaths) {
      if (fs.existsSync(p) && fs.existsSync(path.resolve(p, 'index.html'))) {
        distPath = p;
        break;
      }
    }
    
    if (distPath) {
      app.use(express.static(distPath));
      // SPA fallback - serve index.html for all non-API routes
      app.use((req, res, next) => {
        // Skip API and auth routes
        if (req.path.startsWith('/api') || req.path.startsWith('/auth')) {
          return next();
        }
        // Skip requests for static files
        if (req.path.includes('.')) {
          return next();
        }
        res.sendFile(path.resolve(distPath, 'index.html'));
      });
      console.log(`✅ Serving React app from ${distPath}`);
    } else {
      console.log('⚠️ No built frontend found. Checked locations:');
      possiblePaths.forEach(p => console.log(`   - ${p}`));
      console.log('Run "npm run build" or "npx vite build --outDir static-build" to build the client');
    }
  }

  // Global error handler - must be added last, after all routes
  app.use((err, req, res, next) => {
    console.error('[Express Error Handler] Unhandled error:', {
      method: req.method,
      path: req.path,
      error: err.message,
      stack: err.stack
    });
    res.status(500).json({ 
      error: 'Internal Server Error',
      message: isProduction() ? 'An unexpected error occurred' : err.message
    });
  });

  server.listen(5000, async () => {
    console.log('✅ Web server listening on port 5000');
    console.log(`📍 Environment: ${getEnvironmentName().toUpperCase()}`);
    
    // Only auto-start indexers in production
    if (isProduction()) {
      console.log('[AutoStart] Production environment detected - auto-starting all indexers...');
      
      // Auto-start parallel sync if not running and indexing is incomplete
      await autoStartParallelSync();
      
      // Auto-start unified pool indexer for all pools (V2)
      await autoStartUnifiedPoolIndexer();
      
      // Auto-start unified pool indexer V1 (legacy)
      await autoStartUnifiedPoolIndexerV1();
      
      // Auto-start Jeweler indexer
      await autoStartJewelerIndexer();
      
      // Auto-start Gardening Quest indexer
      await autoStartGardeningQuestIndexer();
      
      // Auto-start Tournament/Battle indexer
      await autoStartTournamentIndexer();
      
      // Auto-start Tavern indexer (marketplace heroes)
      await autoStartTavernIndexer();
    } else {
      console.log('[AutoStart] Development environment - indexers will only run when manually triggered from admin panel');
    }
  });
  
  // Auto-start unified pool indexer V2 on server startup
  async function autoStartUnifiedPoolIndexer() {
    try {
      // Wait a bit for database connections to stabilize
      await new Promise(r => setTimeout(r, 5000));
      
      console.log('[UnifiedIndexer] Auto-starting unified pool indexers...');
      const { startAllUnifiedAutoRun, getUnifiedAutoRunStatus } = await import('./src/etl/ingestion/poolUnifiedIndexer.js');
      
      // Check if any are already running
      const currentStatus = getUnifiedAutoRunStatus();
      if (currentStatus.length > 0) {
        console.log(`[UnifiedIndexer] ${currentStatus.length} workers already running, skipping auto-start`);
        return;
      }
      
      // Start all pool indexers with 3 workers per pool (42 total workers)
      const result = await startAllUnifiedAutoRun();
      console.log(`[UnifiedIndexer] Auto-start complete: ${result.started} workers across ${result.totalPools} pools`);
    } catch (err) {
      console.error('[UnifiedIndexer] Auto-start error:', err.message);
    }
  }
  
  // Auto-start unified pool indexer V1 (legacy) on server startup
  async function autoStartUnifiedPoolIndexerV1() {
    try {
      // Wait a bit after V2 starts to stagger RPC load
      await new Promise(r => setTimeout(r, 8000));
      
      console.log('[UnifiedIndexerV1] Auto-starting V1 pool indexers (legacy)...');
      const { startAllUnifiedAutoRunV1, getUnifiedAutoRunStatusV1 } = await import('./src/etl/ingestion/poolUnifiedIndexerV1.js');
      
      // Check if any are already running
      const currentStatus = getUnifiedAutoRunStatusV1();
      if (currentStatus.length > 0) {
        console.log(`[UnifiedIndexerV1] ${currentStatus.length} workers already running, skipping auto-start`);
        return;
      }
      
      // Start all V1 pool indexers
      const result = await startAllUnifiedAutoRunV1();
      console.log(`[UnifiedIndexerV1] Auto-start complete: ${result.started} workers across ${result.totalPools} pools`);
    } catch (err) {
      console.error('[UnifiedIndexerV1] Auto-start error:', err.message);
    }
  }
  
  // Auto-start Jeweler indexer on server startup (production only)
  async function autoStartJewelerIndexer() {
    try {
      // Wait a bit after pool indexers to stagger RPC load
      await new Promise(r => setTimeout(r, 12000));
      
      console.log('[JewelerIndexer] Auto-starting Jeweler indexer...');
      const { startJewelerAutoRun, isJewelerAutoRunning } = await import('./src/etl/ingestion/jewelerIndexer.js');
      
      if (isJewelerAutoRunning()) {
        console.log('[JewelerIndexer] Already running, skipping auto-start');
        return;
      }
      
      const result = startJewelerAutoRun();
      console.log(`[JewelerIndexer] Auto-start complete: ${result.workersStarted || 1} workers started`);
    } catch (err) {
      console.error('[JewelerIndexer] Auto-start error:', err.message);
    }
  }
  
  // Auto-start Gardening Quest indexer on server startup (production only)
  async function autoStartGardeningQuestIndexer() {
    try {
      // Wait a bit after Jeweler indexer to stagger RPC load
      await new Promise(r => setTimeout(r, 15000));
      
      console.log('[GardeningQuestIndexer] Auto-starting Gardening Quest indexer...');
      const { startGardeningQuestAutoRun, isGardeningQuestAutoRunning } = await import('./src/etl/ingestion/gardeningQuestIndexer.js');
      
      if (isGardeningQuestAutoRunning()) {
        console.log('[GardeningQuestIndexer] Already running, skipping auto-start');
        return;
      }
      
      const result = startGardeningQuestAutoRun();
      console.log(`[GardeningQuestIndexer] Auto-start complete: ${result.workersStarted || 1} workers started`);
    } catch (err) {
      console.error('[GardeningQuestIndexer] Auto-start error:', err.message);
    }
  }
  
  // Auto-start Tournament/Battle indexer on server startup (production only)
  async function autoStartTournamentIndexer() {
    try {
      // Wait a bit after Gardening Quest indexer to stagger load
      await new Promise(r => setTimeout(r, 20000));
      
      console.log('[TournamentIndexer] Auto-starting Tournament/Battle indexer...');
      const { startAutoRun, isAutoRunActive } = await import('./src/etl/ingestion/tournamentIndexer.ts');
      
      if (isAutoRunActive()) {
        console.log('[TournamentIndexer] Already running, skipping auto-start');
        return;
      }
      
      const result = startAutoRun({ maxBattlesPerRun: 200 });
      console.log(`[TournamentIndexer] Auto-start complete: ${result.status}`);
    } catch (err) {
      console.error('[TournamentIndexer] Auto-start error:', err.message);
    }
  }
  
  // Auto-start Tavern indexer on server startup (production only)
  async function autoStartTavernIndexer() {
    try {
      // Wait a bit after Tournament indexer to stagger load
      await new Promise(r => setTimeout(r, 25000));
      
      console.log('[TavernIndexer] Auto-starting Tavern marketplace indexer...');
      const { startAutoRun, getIndexerStatus, runFullIndex } = await import('./src/etl/ingestion/tavernIndexer.js');
      
      const status = getIndexerStatus();
      if (status.isRunning || status.autoRunActive) {
        console.log('[TavernIndexer] Already running, skipping auto-start');
        return;
      }
      
      // Run initial index then start auto-refresh
      console.log('[TavernIndexer] Running initial index...');
      runFullIndex().then(() => {
        console.log('[TavernIndexer] Initial index complete, starting auto-refresh...');
        startAutoRun();
      }).catch(err => {
        console.error('[TavernIndexer] Initial index error:', err.message);
        // Still try to start auto-run even if initial fails
        startAutoRun();
      });
      
      console.log('[TavernIndexer] Auto-start initiated');
    } catch (err) {
      console.error('[TavernIndexer] Auto-start error:', err.message);
    }
  }
  
  // Auto-start parallel sync on server startup
  async function autoStartParallelSync() {
    try {
      // Wait a bit for other services to initialize
      await new Promise(r => setTimeout(r, 3000));
      
      if (parallelSyncState.running) {
        console.log('[ParallelSync] Already running, skipping auto-start');
        return;
      }
      
      const latestBlock = await getBridgeLatestBlock();
      const workerProgress = await getAllWorkerProgress(8); // Check for 8-worker setup
      
      if (workerProgress.length === 0) {
        console.log('[ParallelSync] No previous worker progress found, auto-starting...');
      } else {
        // Calculate combined progress
        let totalBlocksProcessed = 0;
        let totalBlocksToProcess = 0;
        const blocksPerWorker = Math.ceil(latestBlock / workerProgress.length);
        
        for (const worker of workerProgress) {
          const workerStart = worker.genesisBlock || 0;
          const workerEnd = Math.min(workerStart + blocksPerWorker, latestBlock);
          const workerTotal = workerEnd - workerStart;
          const processed = Math.max(0, worker.lastIndexedBlock - workerStart);
          
          totalBlocksToProcess += workerTotal;
          totalBlocksProcessed += Math.min(processed, workerTotal);
        }
        
        const combinedProgress = totalBlocksToProcess > 0 
          ? Math.round((totalBlocksProcessed / totalBlocksToProcess) * 100) 
          : 0;
        
        if (combinedProgress >= 100) {
          console.log(`[ParallelSync] Indexing complete (${combinedProgress}%), skipping auto-start`);
          return;
        }
        
        console.log(`[ParallelSync] Indexing at ${combinedProgress}%, auto-starting to continue...`);
      }
      
      // Auto-start with default settings
      const workersTotal = 8;
      const batchSize = 10000;
      const maxBatchesPerWorker = 100;
      
      console.log(`[ParallelSync] Auto-starting ${workersTotal} workers with batch size ${batchSize}`);
      
      parallelSyncState.running = true;
      parallelSyncState.workersTotal = workersTotal;
      parallelSyncState.startedAt = new Date();
      parallelSyncState.workers.clear();
      
      const blocksPerWorker = Math.ceil(latestBlock / workersTotal);
      const workerPromises = [];
      
      for (let workerId = 1; workerId <= workersTotal; workerId++) {
        const rangeStart = (workerId - 1) * blocksPerWorker;
        const rangeEnd = Math.min(workerId * blocksPerWorker, latestBlock);
        const indexerName = getWorkerIndexerName(workerId, workersTotal);
        
        console.log(`[ParallelSync] Worker ${workerId}: blocks ${rangeStart} → ${rangeEnd}`);
        
        // Initialize worker progress (resumes from last position)
        await initIndexerProgress(indexerName, rangeStart);
        
        parallelSyncState.workers.set(workerId, {
          running: true,
          lastUpdate: new Date(),
          progress: { rangeStart, rangeEnd },
        });
        
        const workerLoop = async () => {
          let batchCount = 0;
          while (batchCount < maxBatchesPerWorker && parallelSyncState.running) {
            const result = await runWorkerBatch({
              batchSize,
              indexerName,
              rangeEnd,
            });
            
            batchCount++;
            parallelSyncState.workers.set(workerId, {
              running: true,
              lastUpdate: new Date(),
              progress: result,
            });
            
            if (result.status === 'complete') {
              console.log(`[ParallelSync] Worker ${workerId} completed its range`);
              break;
            }
            
            if (result.status === 'error') {
              console.error(`[ParallelSync] Worker ${workerId} error:`, result.error);
              await new Promise(r => setTimeout(r, 5000));
            }
            
            await new Promise(r => setTimeout(r, 500));
          }
          
          parallelSyncState.workers.set(workerId, {
            running: false,
            lastUpdate: new Date(),
            progress: { complete: true },
          });
        };
        
        workerPromises.push(workerLoop());
      }
      
      Promise.all(workerPromises)
        .then(() => {
          console.log('[ParallelSync] Auto-start: All workers completed');
          parallelSyncState.running = false;
        })
        .catch((error) => {
          console.error('[ParallelSync] Auto-start worker error:', error);
          parallelSyncState.running = false;
        });
      
      // Start periodic price enrichment checks (runs in background)
      startPriceEnrichmentChecker();
        
    } catch (error) {
      console.error('[ParallelSync] Auto-start error:', error);
    }
  }
  
  // Periodic price enrichment checker - starts workers when events need pricing
  let priceEnrichmentCheckerId = null;
  
  function startPriceEnrichmentChecker() {
    if (priceEnrichmentCheckerId) {
      console.log('[PriceEnrichmentChecker] Already running');
      return;
    }
    
    console.log('[PriceEnrichmentChecker] Starting periodic checker (60s interval)');
    
    // Run first check immediately
    checkAndStartPriceEnrichment();
    
    // Then check every 60 seconds
    priceEnrichmentCheckerId = setInterval(checkAndStartPriceEnrichment, 60000);
  }
  
  async function checkAndStartPriceEnrichment() {
    try {
      if (isParallelEnrichmentRunning()) {
        return; // Already running, skip silently
      }
      
      const unpricedCount = await getUnpricedEventCount();
      
      if (unpricedCount === 0) {
        return; // No work needed, skip silently
      }
      
      // Check if there are actually priceable groups (excludes HERO/PET/EQUIPMENT)
      const status = getParallelEnrichmentStatus();
      
      console.log(`[ParallelEnrichment] ${unpricedCount} events need USD prices, auto-starting...`);
      
      await runParallelPriceEnrichment({
        workersTotal: 8,
        verbose: true,
      });
      
    } catch (error) {
      console.error('[ParallelEnrichment] Auto-start error:', error);
    }
  }
}

// === Login to Discord / Main startup ===
async function startDiscordBot() {
  await client.login(DISCORD_TOKEN);
}

async function main() {
  await initializeEconomicSystem();
  await startAdminWebServer();
  await startDiscordBot();
}

main().catch((err) => {
  console.error('❌ Fatal startup error:', err);
  process.exit(1);
});
