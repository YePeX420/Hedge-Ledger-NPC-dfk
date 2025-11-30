// bot.js
import 'dotenv/config';
import fs from 'fs';
import crypto from 'crypto';
import { exec } from 'child_process';
import { promisify } from 'util';
import { Client, GatewayIntentBits, Partials, Events, AttachmentBuilder, EmbedBuilder } from 'discord.js';
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
import { initializePricingConfig } from './pricing-engine.js';
import { getAnalyticsForDiscord } from './analytics.js';
import { initializePoolCache, stopPoolCache, getCachedPoolAnalytics } from './pool-cache.js';
import { generateOptimizationMessages } from './report-formatter.js';
import { db } from './server/db.js';
import { jewelBalances, players, depositRequests, queryCosts, interactionSessions, interactionMessages, gardenOptimizations, walletSnapshots } from './shared/schema.ts';
import { eq, desc, sql, inArray, and, gt } from 'drizzle-orm';
import http from 'http';
import express from 'express';
import { isPaymentBypassEnabled, getDebugSettings, setDebugSettings } from './debug-settings.js';

const execAsync = promisify(exec);

// --- Runtime status flags for health checks ---
let paymentMonitorStarted = false;
let poolCacheInitialized = false;
let optimizationProcessorStarted = false;
let snapshotJobStarted = false;
let cacheQueueInitialized = false;

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

client.once(Events.ClientReady, async (c) => {
  console.log(`🤖 Logged in as ${c.user.tag}`);
  console.log(`🧠 Model: ${OPENAI_MODEL}`);

  // 🔧 Register debug slash commands (/ping, /logtest, /health) on the guild
  try {
      if (!DISCORD_GUILD_ID) {
        console.warn('⚠️ DISCORD_GUILD_ID not set; skipping debug command registration.');
      } else if (c.application) {
        console.log('🛠 Setting debug slash commands (/ping, /logtest, /health)…');

        const debugCommands = [
          {
            name: 'ping',
            description: 'Check if Hedge is online and measure latency.'
          },
          {
            name: 'logtest',
            description: 'Write a test line into Hedge debug log.'
          },
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
          }
        ];

        const guild = await c.guilds.fetch(DISCORD_GUILD_ID);
        await guild.commands.set(debugCommands);
        console.log(`✅ Debug commands registered: ${debugCommands.map(cmd => cmd.name).join(', ')}`);
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

    try {
      const response = await askHedge([
        { role: 'user', content: message.content }
      ]);

      // 🎨 Check if we should attach hairstyle charts
      const hairstyleKeywords = [
        'hairstyle', 'hair style', 'hair mutation', 'hairstyle mutation',
        'hair breeding', 'hair genetic', 'summoning tree',
        'hair gene', 'visual trait', 'visual gene'
      ];
      
      const userContent = message.content.toLowerCase();
      const aiResponse = response.toLowerCase();
      const shouldAttachCharts = hairstyleKeywords.some(keyword => 
        userContent.includes(keyword) || aiResponse.includes(keyword)
      );

      if (shouldAttachCharts) {
        console.log(`🎨 Detected hairstyle question - attaching charts`);
        
        const femaleChart = new AttachmentBuilder('knowledge/female-hairstyle-chart.png');
        const maleChart = new AttachmentBuilder('knowledge/male-hairstyle-chart.png');
        
        await message.reply({
          content: response,
          files: [femaleChart, maleChart]
        });
        console.log(`✅ Sent AI response with hairstyle charts to ${username}`);
      } else {
        await message.reply(response);
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

// Slash command handler

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (!interaction.isChatInputCommand()) return;

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

    // Other slash commands (help, npc, hero, garden, etc.) were not included
    // in this truncated version of the file. Add them back here later as needed.

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
  console.log('Falling back to static file serving from public/');
}

server.listen(5000, () => {
  console.log('✅ Web server listening on port 5000');
});

// === Login to Discord ===
client.login(DISCORD_TOKEN);
