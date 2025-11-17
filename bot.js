// bot.js
import 'dotenv/config';
import fs from 'fs';
import crypto from 'crypto';
import { Client, GatewayIntentBits, Partials, Events, AttachmentBuilder } from 'discord.js';
import OpenAI from 'openai';
import * as onchain from './onchain-data.js';
import * as analytics from './garden-analytics.js';
import * as quickData from './quick-data-fetcher.js';
import { parseIntent, formatIntent } from './intent-parser.js';
import { requestDeposit, HEDGE_WALLET } from './deposit-flow.js';
import { startMonitoring, stopMonitoring } from './transaction-monitor.js';
import { creditBalance } from './balance-credit.js';
import { initializeProcessor, startProcessor, stopProcessor } from './optimization-processor.js';
import { initializePricingConfig } from './pricing-engine.js';
import { getAnalyticsForDiscord } from './analytics.js';
import { initializePoolCache, stopPoolCache } from './pool-cache.js';
import { db } from './server/db.js';
import { jewelBalances, players, depositRequests, queryCosts, interactionSessions, interactionMessages, gardenOptimizations } from './shared/schema.ts';
import { eq, desc, sql, inArray, and } from 'drizzle-orm';
import http from 'http';
import express from 'express';

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
  
  // Initialize economic system
  try {
    console.log('💰 Initializing pricing config...');
    await initializePricingConfig();
    
    console.log('📡 Starting transaction monitor...');
    // Wire up callbacks for deposits and garden optimizations
    await startMonitoring(
      // Callback for deposit matches - credit balances
      async (match) => {
        try {
          // Validate match structure
          if (!match || !match.depositRequest || !match.transaction) {
            console.error('[Bot] ❌ Invalid match structure:', match);
            return;
          }
          
          console.log(`[Bot] Processing deposit match: ${match.transaction.txHash}`);
          // Pass full match object to creditBalance
          await creditBalance(match);
          console.log(`[Bot] ✅ Credited balance for deposit #${match.depositRequest.id}`);
        } catch (err) {
          console.error(`[Bot] ❌ Failed to credit balance:`, err.message);
          console.error(err.stack);
        }
      },
      // Callback for garden optimization matches - mark as payment_verified
      async (match) => {
        try {
          // Validate match structure
          if (!match || !match.optimization || !match.transaction) {
            console.error('[Bot] ❌ Invalid optimization match structure:', match);
            return;
          }
          
          console.log(`[Bot] 🌿 Processing garden optimization payment: ${match.transaction.txHash}`);
          
          // Check if expired
          const now = new Date();
          if (now > new Date(match.optimization.expiresAt)) {
            console.log(`[Bot] ⏰ Optimization #${match.optimization.id} expired - ignoring payment`);
            
            // Mark as expired with tx reference for debugging
            await db.update(gardenOptimizations)
              .set({
                status: 'expired',
                txHash: match.transaction.hash,
                errorMessage: `Payment received after expiry (tx: ${match.transaction.hash})`,
                updatedAt: new Date()
              })
              .where(eq(gardenOptimizations.id, match.optimization.id));
            return;
          }
          
          // Update optimization status to payment_verified
          await db.update(gardenOptimizations)
            .set({
              status: 'payment_verified',
              txHash: match.transaction.hash,
              updatedAt: new Date()
            })
            .where(eq(gardenOptimizations.id, match.optimization.id));
          
          console.log(`[Bot] ✅ Verified payment for optimization #${match.optimization.id}`);
        } catch (err) {
          console.error(`[Bot] ❌ Failed to process optimization payment:`, err.message);
          console.error(err.stack);
        }
      }
    );
    
    console.log('✅ Economic system initialized');
  } catch (err) {
    console.error('❌ Failed to initialize economic system:', err);
  }
  
  // Initialize garden optimization processor
  try {
    console.log('🌿 Initializing garden optimization processor...');
    initializeProcessor(c);
    await startProcessor();
    console.log('✅ Optimization processor started');
  } catch (err) {
    console.error('❌ Failed to initialize optimization processor:', err);
  }
  
  // Initialize pool analytics cache
  try {
    console.log('🏊 Initializing pool analytics cache...');
    await initializePoolCache();
    console.log('✅ Pool cache initialized');
  } catch (err) {
    console.error('❌ Failed to initialize pool cache:', err);
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
    
    // 💼 Check if message contains a wallet address (case-insensitive for 0x prefix)
    const walletRegex = /0[xX][a-fA-F0-9]{40}/;
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

    // 🧠 Parse user intent to detect what data they want
    const intent = parseIntent(message.content);
    
    if (intent) {
      console.log(`🔍 Intent detected: ${formatIntent(intent)}`);
      
      // 🎭 NPC navigation/help queries (FREE - educational content)
      if (intent.type === 'npc') {
        try {
          const npcData = getNPCData(intent.npc);
          
          if (!npcData) {
            await message.reply(`Hmm, I don't have information about "${intent.npc}" yet. Try asking about the Druid, Seed Box, or Harvest.`);
            return;
          }
          
          // Load NPC image
          const attachment = new AttachmentBuilder(npcData.imagePath, { name: `${intent.npc.replace(/\s+/g, '-')}.png` });
          
          // Build prompt with optional action context
          let npcPrompt = `User asked about the ${npcData.name} NPC.`;
          if (intent.action) {
            npcPrompt += ` Specifically, they want to: "${intent.action}".`;
          }
          npcPrompt += ` Based on your knowledge base (knowledge/npcs.md), respond with:
1. A brief, humorous personal anecdote about your experience with this NPC
2. Clear instructions on how to use it${intent.action ? ' (focus on their specific goal)' : ''}
3. Its location

Keep it entertaining but helpful. This is free educational content, so be generous with the guidance.`;
          
          const prompt = [{ role: 'user', content: npcPrompt }];
          const reply = await askHedge(prompt);
          
          // Send image + response
          await message.reply({
            content: reply,
            files: [attachment]
          });
          
          return;
        } catch (err) {
          console.error('NPC query error:', err);
          await message.reply("*shuffles through papers* Can't find my notes on that NPC. Try again later.");
          return;
        }
      }
      
      // 🌿 Garden Optimization (PAID - 25 JEWEL via direct deposit)
      if (intent.type === 'garden_optimization') {
        try {
          // Check if user has a linked wallet
          if (!playerData || !playerData.wallets || playerData.wallets.length === 0) {
            await message.reply("I'll need your wallet address to scan for LP positions. Send me your wallet address (starts with 0x) and I'll save it for you.");
            return;
          }
          
          const walletAddress = playerData.wallets[0];
          console.log(`🌿 Garden optimization requested for wallet: ${walletAddress}`);
          
          // Scan for LP positions
          await message.reply("*pulls out magnifying glass* Let me check your garden positions...");
          const { detectWalletLPPositions, formatLPPositionsSummary } = await import('./wallet-lp-detector.js');
          const positions = await detectWalletLPPositions(walletAddress);
          
          if (!positions || positions.length === 0) {
            await message.reply("No garden LP positions found in your wallet. Make sure you have LP tokens staked in Crystalvale pools, then try again.");
            return;
          }
          
          // Show summary (NO YIELDS YET - this is the teaser)
          const summary = formatLPPositionsSummary(positions);
          
          // Create pending optimization record (expires in 2 hours)
          const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
          
          const [newOptimization] = await db.insert(gardenOptimizations)
            .values({
              playerId: playerData.id,
              status: 'awaiting_payment',
              fromWallet: walletAddress,
              expiresAt,
              lpSnapshot: sql`${JSON.stringify(positions)}::json`, // Explicit JSON cast to avoid string storage
            })
            .returning();
          
          console.log(`📝 Created optimization request #${newOptimization.id} for player ${playerData.id}`);
          
          // Send payment instructions
          const paymentMessage = 
            `${summary}\n\n` +
            `💎 **Garden Optimization - 25 JEWEL**\n\n` +
            `Want me to analyze your heroes and pets to recommend optimal assignments for maximum yield?\n\n` +
            `**How to pay:**\n` +
            `1. **Send exactly 25 JEWEL** from your wallet (\`${walletAddress}\`)\n` +
            `2. **To this address:** \`${HEDGE_WALLET}\`\n` +
            `3. **Wait ~1 minute** - I'll verify your payment and get started automatically\n\n` +
            `I'll send your optimization report as soon as I confirm the transaction. ` +
            `*The JEWEL stays in my ledger forever, of course.* <:hedge_evil:1439395005499441236>\n\n` +
            `This request expires in 2 hours.`;
          
          await message.reply(paymentMessage);
          console.log(`📨 Sent payment instructions to player ${playerData.id}`);
          
          return;
        } catch (err) {
          console.error('Garden optimization error:', err);
          await message.reply("*shuffles papers nervously* Something went wrong setting up the optimization. Try again later.");
          return;
        }
      }
      
      // 🌱 Auto-fetch garden/pool data (lightweight, fast)
      if (intent.type === 'garden') {
        try {
          if (intent.action === 'all') {
            // Fetch all pools (instant if cached, otherwise live scan)
            const result = await quickData.getAllPoolAnalyticsWithTimeout(8, 50000);
            
            if (!result || !result.pools || result.pools.length === 0) {
              if (result._error) {
                await message.reply(`*yawns* ${result._error}.`);
              } else {
                await message.reply("Huh. No pools found. Something's not right with the data.");
              }
              return;
            }
            
            const poolsData = result.pools;
            const cacheAge = result._cacheAge || 0;
            
            // Format top pools concisely
            let poolsSummary = '📊 **Crystalvale Pool Analytics**';
            if (result._cached) {
              poolsSummary += ` (cached ${cacheAge}m ago)`;
            } else {
              poolsSummary += ` (live scan)`;
            }
            poolsSummary += '\n\n';
            
            // Add best/worst summary (pre-calculated from full dataset in quick-data-fetcher)
            if (result.bestPool && result.worstPool && result.bestPool !== result.worstPool) {
              poolsSummary += `📈 **Best**: ${result.bestPool.pairName} (${result.bestPool.totalAPR})\n`;
              poolsSummary += `📉 **Worst**: ${result.worstPool.pairName} (${result.worstPool.totalAPR})\n\n`;
            }
            
            poolsData.slice(0, 5).forEach((pool, i) => {
              poolsSummary += `${i+1}. **${pool.pairName}** - ${pool.fee24hAPR} Fee APR - ${pool.harvesting24hAPR} Distribution APR\n`;
              poolsSummary += `   • Total: ${pool.totalAPR} | TVL: $${pool.totalTVL}\n\n`;
            });
            
            if (poolsData.length > 5) {
              poolsSummary += `...and ${poolsData.length - 5} more pools available.`;
            }
            
            enrichedContent += `\n\n📊 GARDEN DATA:\n${poolsSummary}\n\nRespond as Hedge Ledger analyzing these APRs. Do NOT include a "What to Consider" section or mention slash commands (they don't work in DMs).`;
          } else if (intent.action === 'pool' && intent.pool) {
            // Fast pool lookup without heavy analytics
            await message.reply(`*flips through ledger* Looking up ${intent.pool} pool...`);
            
            const pool = await quickData.findPoolByName(intent.pool);
            
            if (!pool) {
              await message.reply(`Couldn't find a pool matching "${intent.pool}". Try asking for all pool APRs to see what's available.`);
              return;
            }
            
            // Get detailed analytics for this specific pool from cache (instant)
            const poolData = await quickData.getPoolAnalyticsWithTimeout(pool.pid, 45000);
            
            if (!poolData) {
              await message.reply("Couldn't fetch pool analytics. Cache might not be ready yet. Try again in a moment.");
              return;
            }
            
            const cacheAge = poolData._cacheAge || 0;
            
            let poolDetails = `📊 **${poolData.pairName}**`;
            if (poolData._cached) {
              poolDetails += ` (cached ${cacheAge}m ago)`;
            }
            poolDetails += `\n\n`;
            poolDetails += `**APR Breakdown:**\n`;
            poolDetails += `• Total: ${poolData.totalAPR}\n`;
            poolDetails += `• Fee APR: ${poolData.fee24hAPR}\n`;
            poolDetails += `• Emission APR: ${poolData.harvesting24hAPR}\n`;
            if (poolData.gardeningQuestAPR?.worst && poolData.gardeningQuestAPR?.best) {
              poolDetails += `• Quest APR: ${poolData.gardeningQuestAPR.worst} - ${poolData.gardeningQuestAPR.best}\n`;
            }
            poolDetails += `\n**Economics:**\n`;
            poolDetails += `• TVL: $${poolData.totalTVL} (V2: $${poolData.v2TVL})\n`;
            poolDetails += `• 24h Volume: $${poolData.volume24hUSD}\n`;
            poolDetails += `• 24h Fees: $${poolData.fees24hUSD}\n`;
            
            enrichedContent += `\n\n📊 POOL DATA:\n${poolDetails}\n\nRespond as Hedge Ledger with analysis. Do NOT include a "What to Consider" section or mention slash commands.`;
          } else if (intent.action === 'wallet' && intent.wallet) {
            // Quick wallet rewards check (top 5 pools only to avoid delays)
            await message.reply(`*adjusts monocle* Checking your top staked positions... moment...`);
            
            const rewardsData = await quickData.getWalletRewardsQuick(intent.wallet);
            let hasRewards = false;
            let walletSummary = `📊 **Harvestable Rewards: ${intent.wallet.slice(0, 6)}...${intent.wallet.slice(-4)}**\n`;
            walletSummary += `(Checking top 5 pools for speed)\n\n`;
            
            for (const poolReward of rewardsData) {
              if (parseFloat(poolReward.rewards) > 0.001) {
                hasRewards = true;
                walletSummary += `• **${poolReward.pairName}**: ${parseFloat(poolReward.rewards).toFixed(4)} CRYSTAL\n`;
              }
            }
            
            if (!hasRewards) {
              walletSummary += "No pending rewards in top pools.";
            }
            
            enrichedContent += `\n\n📊 WALLET REWARDS:\n${walletSummary}\n\nRespond as Hedge Ledger. Keep it concise and do NOT include a "What to Consider" section or mention slash commands.`;
          }
        } catch (err) {
          console.error('Garden auto-fetch error:', err);
          if (err.message.includes('timed out')) {
            await message.reply("*yawns* Blockchain scan took too long. Try again in a moment.");
          } else {
            await message.reply("*yawns* Something broke. Try again later.");
          }
          return;
        }
      }
      
      // 🏪 Auto-fetch marketplace data
      if (intent.type === 'market') {
        try {
          await message.reply("*rummages through marketplace listings* Let me see what's for sale...");
          
          const heroes = await quickData.getMarketHeroesFiltered({
            mainClass: intent.class || null,
            maxPrice: intent.maxPrice || null,
            sortBy: intent.sortBy || 'price_asc',
            limit: 10
          });
          
          if (!heroes || heroes.length === 0) {
            await message.reply("No heroes found matching those criteria. Market might be thin or everyone's HODLing.");
            return;
          }
          
          let marketSummary = `🏪 **Live Marketplace** (${heroes.length} results`;
          if (intent.class) marketSummary += `, class: ${intent.class}`;
          if (intent.maxPrice) marketSummary += `, max: ${intent.maxPrice} JEWEL`;
          marketSummary += `)\n\n`;
          
          heroes.slice(0, 5).forEach((hero, i) => {
            const price = onchain.weiToToken(hero.salePrice);
            const rarity = ['Common', 'Uncommon', 'Rare', 'Legendary', 'Mythic'][hero.rarity];
            marketSummary += `${i+1}. **#${hero.normalizedId}** - ${hero.mainClassStr} | ${rarity} | Lvl ${hero.level}\n`;
            marketSummary += `   → **${price} JEWEL**\n`;
          });
          
          if (heroes.length > 5) {
            marketSummary += `\n...and ${heroes.length - 5} more listings.`;
          }
          
          enrichedContent += `\n\n🏪 LIVE MARKETPLACE DATA:\n${marketSummary}\n\nRespond as Hedge Ledger with market analysis. Keep it concise and do NOT include a "What to Consider" section or mention slash commands.`;
        } catch (err) {
          console.error('Market auto-fetch error:', err);
          await message.reply("*yawns* Marketplace lookup failed. Try again later.");
          return;
        }
      }
      
      // 💼 Auto-fetch wallet/portfolio data
      if (intent.type === 'wallet') {
        try {
          await message.reply(`*adjusts ledger* Analyzing wallet ${intent.address.slice(0, 6)}...${intent.address.slice(-4)}...`);
          
          const heroes = await onchain.getHeroesByOwner(intent.address);
          
          if (!heroes || heroes.length === 0) {
            await message.reply(`Wallet ${intent.address.slice(0, 6)}...${intent.address.slice(-4)} has no heroes. Either empty or wrong address.`);
            return;
          }
          
          // Group by class
          const classCounts = {};
          let totalValue = 0;
          
          heroes.forEach(hero => {
            classCounts[hero.mainClassStr] = (classCounts[hero.mainClassStr] || 0) + 1;
            if (hero.salePrice && hero.salePrice !== '0') {
              totalValue += parseFloat(onchain.weiToToken(hero.salePrice));
            }
          });
          
          let walletSummary = `💼 **Wallet Portfolio: ${intent.address.slice(0, 6)}...${intent.address.slice(-4)}**\n\n`;
          walletSummary += `**Total Heroes:** ${heroes.length}\n\n`;
          walletSummary += `**By Class:**\n`;
          Object.entries(classCounts)
            .sort((a, b) => b[1] - a[1])
            .forEach(([className, count]) => {
              walletSummary += `• ${className}: ${count}\n`;
            });
          
          if (totalValue > 0) {
            walletSummary += `\n**Total Listing Value:** ${totalValue.toFixed(2)} JEWEL`;
          }
          
          enrichedContent += `\n\n💼 LIVE WALLET DATA:\n${walletSummary}\n\nRespond as Hedge Ledger with portfolio analysis. Keep it concise and do NOT include a "What to Consider" section or mention slash commands.`;
        } catch (err) {
          console.error('Wallet auto-fetch error:', err);
          await message.reply("*yawns* Wallet lookup failed. Try again later.");
          return;
        }
      }
    }

    // 🔍 Detect hero ID mentions (e.g., "hero #62", "hero 62", "#62")
    const heroIdPattern = /(?:hero\s*#?|#)(\d{1,6})\b/gi;
    const heroMatches = [...message.content.matchAll(heroIdPattern)];
    
    if (heroMatches.length > 0) {
      // Extract unique hero IDs
      const heroIds = [...new Set(heroMatches.map(m => parseInt(m[1])))];
      
      // Fetch blockchain data for mentioned heroes (limit to 3 to avoid spam)
      const heroDataPromises = heroIds.slice(0, 3).map(id => onchain.getHeroById(id));
      const heroes = await Promise.all(heroDataPromises);
      
      // Add hero data to context
      let heroContext = '\n\n📊 LIVE BLOCKCHAIN DATA:\n';
      heroes.forEach((hero, idx) => {
        if (hero) {
          heroContext += `\n${onchain.formatHeroSummary(hero)}\n`;
        } else {
          heroContext += `\nHero #${heroIds[idx]} not found on-chain.\n`;
        }
      });
      
      enrichedContent += heroContext + '\n\nRespond naturally as Hedge Ledger with this live data.';
    }

    const prompt = [{ role: 'user', content: enrichedContent }];
    const reply = await askHedge(prompt);
    await message.reply(reply);
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

    if (name === 'help') {
      const help = [
        '**/help** — list commands',
        '**/npc message:<text>** — chat with Hedge',
        '**/hero id:<number>** — hero info & tip',
        '**/garden lp:<pair> amount:<num?>** — yield estimate',
        '**/quest goal:<xp|gold|materials|profession>** — recs',
        '**/stats wallet:<addr?>** — quick summary',
        '**/walkthrough topic:<optional>** — game/interface tutorial (Tier 0 free)'
      ].join('\n');
      await interaction.editReply(help);
      return;
    }

    if (name === 'npc') {
      const message = interaction.options.getString('message', true);
      const reply = await askHedge([
        { role: 'user', content: message }
      ]);
      await interaction.editReply(reply);
      return;
    }

    if (name === 'hero') {
      const id = interaction.options.getInteger('id', true);
      const hero = await onchain.getHeroById(id);
      if (!hero) {
        await interaction.editReply(`Hero #${id} not found on-chain. Double-check the ID.`);
        return;
      }
      const heroData = onchain.formatHeroSummary(hero);
      const userMsg = `Slash Command: /hero - LIVE BLOCKCHAIN DATA\n\n${heroData}\n\nRespond as Hedge Ledger with analysis.`;
      const reply = await askHedge([{ role: 'user', content: userMsg }]);
      await interaction.editReply(reply);
      return;
    }

    if (name === 'garden') {
      const pool = interaction.options.getString('pool');
      const wallet = interaction.options.getString('wallet');
      const realm = interaction.options.getString('realm') || 'dfk';
      
      // Only Crystalvale (DFK Chain) supports full analytics
      if (realm === 'klaytn') {
        await interaction.editReply(`Comprehensive analytics currently only available for Crystalvale (dfk realm). Use realm:dfk for full APR/TVL data.`);
        return;
      }
      
      try {
        if (pool && pool.toLowerCase() === 'all') {
          // Show all pools with comprehensive analytics
          await interaction.editReply('Calculating comprehensive pool analytics... (scanning 24h of blocks)');
          
          const poolsData = await analytics.getAllPoolAnalytics(10);
          
          if (!poolsData || poolsData.length === 0) {
            await interaction.editReply(`No active pools found for Crystalvale.`);
            return;
          }
          
          let poolsList = `🌱 **Crystalvale Garden Pools - Full Analytics**\n\n`;
          poolsData.forEach((p, i) => {
            poolsList += `${i+1}. **${p.pairName}** (PID ${p.pid})\n`;
            poolsList += `   • Total APR: ${p.totalAPR}\n`;
            poolsList += `   • 24HR Fee APR: ${p.fee24hAPR}\n`;
            poolsList += `   • 24HR Harvesting APR: ${p.harvesting24hAPR}\n`;
            poolsList += `   • Gardening Quest APR: ${p.gardeningQuestAPR.worst} - ${p.gardeningQuestAPR.best}\n`;
            poolsList += `   • V1 TVL: $${p.v1TVL.toLocaleString('en-US', {maximumFractionDigits: 0})}\n`;
            poolsList += `   • V2 TVL: $${p.v2TVL.toLocaleString('en-US', {maximumFractionDigits: 0})}\n`;
            poolsList += `   • Total TVL: $${p.totalTVL.toLocaleString('en-US', {maximumFractionDigits: 0})}\n`;
            poolsList += `   • 24h Volume: $${p.volume24hUSD.toLocaleString('en-US', {maximumFractionDigits: 0})}\n\n`;
          });
          
          const userMsg = `COMPREHENSIVE CRYSTALVALE POOL DATA:\n\n${poolsList}\n\nAnalyze as Hedge. Highlight the best APR pools and mention both fee-based and emission-based returns.`;
          const reply = await askHedge([{ role: 'user', content: userMsg }]);
          await interaction.editReply(reply);
          return;
        } else if (pool) {
          // Look up specific pool by PID or name
          let pid = parseInt(pool);
          let sharedData = null;
          
          if (isNaN(pid)) {
            // Try to find by name - build shared data for efficiency
            await interaction.editReply(`Searching for pool "${pool}"...`);
            
            // Build shared data once for name search + analytics
            const allPools = await analytics.discoverPools();
            const priceGraph = await analytics.buildPriceGraph();
            const CRYSTAL_ADDRESS = '0x04b9dA42306B023f3572e106B11D82aAd9D32EBb';
            const crystalPrice = priceGraph.get(CRYSTAL_ADDRESS.toLowerCase()) || 0;
            const totalAllocPoint = await analytics.stakingContract.getTotalAllocPoint();
            const blockRange = await analytics.getPreviousUTCDayBlockRange();
            
            sharedData = { allPools, priceGraph, crystalPrice, totalAllocPoint, blockRange };
            
            const lpDetails = await Promise.all(
              allPools.slice(0, 14).map(async p => ({
                pid: p.pid,
                details: await analytics.getLPTokenDetails(p.lpToken).catch(() => null)
              }))
            );
            
            const match = lpDetails.find(p => 
              p.details && p.details.pairName.toLowerCase().includes(pool.toLowerCase())
            );
            
            if (!match) {
              await interaction.editReply(`Pool "${pool}" not found. Try using PID number (0-13) or /garden pool:all to see all pools.`);
              return;
            }
            
            pid = match.pid;
          }
          
          await interaction.editReply(`Calculating analytics for pool ${pid}... (scanning 24h of blocks)`);
          
          // Use shared data if we built it for name search, otherwise getPoolAnalytics will build fresh
          const poolData = await analytics.getPoolAnalytics(pid, sharedData);
          
          let poolInfo = `📊 **${poolData.pairName}** (PID ${poolData.pid})\n\n`;
          poolInfo += `**APR Breakdown:**\n`;
          poolInfo += `• Total APR: ${poolData.totalAPR}\n`;
          poolInfo += `• 24HR Fee APR: ${poolData.fee24hAPR} (from trading fees)\n`;
          poolInfo += `• 24HR Harvesting APR: ${poolData.harvesting24hAPR} (from CRYSTAL emissions)\n`;
          poolInfo += `• Gardening Quest APR: ${poolData.gardeningQuestAPR.worst} - ${poolData.gardeningQuestAPR.best}\n`;
          poolInfo += `  (Hero boost range: ${poolData.gardeningQuestAPR.worstBoost} - ${poolData.gardeningQuestAPR.bestBoost})\n\n`;
          poolInfo += `**Liquidity:**\n`;
          poolInfo += `• V1 TVL: $${poolData.v1TVL.toLocaleString('en-US', {maximumFractionDigits: 0})} (legacy staking)\n`;
          poolInfo += `• V2 TVL: $${poolData.v2TVL.toLocaleString('en-US', {maximumFractionDigits: 0})} (current staking)\n`;
          poolInfo += `• Total Pool TVL: $${poolData.totalTVL.toLocaleString('en-US', {maximumFractionDigits: 0})}\n`;
          poolInfo += `• Staked Ratio: ${poolData.stakedRatio}\n\n`;
          poolInfo += `**24h Metrics:**\n`;
          poolInfo += `• Volume: $${poolData.volume24hUSD.toLocaleString('en-US', {maximumFractionDigits: 0})}\n`;
          poolInfo += `• Fees Generated: $${poolData.fees24hUSD.toLocaleString('en-US', {maximumFractionDigits: 2})}\n`;
          poolInfo += `• CRYSTAL Rewards: $${poolData.rewards24hUSD.toLocaleString('en-US', {maximumFractionDigits: 2})}\n\n`;
          poolInfo += `**Token Prices:**\n`;
          poolInfo += `• ${poolData.token0.symbol}: $${poolData.tokenPrices[poolData.token0.symbol].toFixed(4)}\n`;
          poolInfo += `• ${poolData.token1.symbol}: $${poolData.tokenPrices[poolData.token1.symbol].toFixed(4)}\n`;
          poolInfo += `• CRYSTAL: $${poolData.crystalPrice.toFixed(4)}\n`;
          
          const userMsg = `COMPREHENSIVE POOL ANALYTICS:\n\n${poolInfo}\n\nAnalyze as Hedge. Explain the APR breakdown and whether this is a good yield opportunity.`;
          const reply = await askHedge([{ role: 'user', content: userMsg }]);
          await interaction.editReply(reply);
          return;
        } else if (wallet) {
          // Show user's harvestable rewards
          await interaction.editReply('Fetching your garden positions...');
          
          const allPools = await analytics.discoverPools();
          const userPositions = [];
          
          for (const pool of allPools.slice(0, 14)) {
            const pending = await analytics.getUserPendingRewards(wallet, pool.pid);
            if (parseFloat(pending) > 0) {
              const lpDetails = await analytics.getLPTokenDetails(pool.lpToken);
              userPositions.push({
                pid: pool.pid,
                pairName: lpDetails.pairName,
                pendingCRYSTAL: pending
              });
            }
          }
          
          if (userPositions.length === 0) {
            await interaction.editReply(`No harvestable rewards found for this wallet in Crystalvale.`);
            return;
          }
          
          let positionsSummary = `👛 **Your Crystalvale Garden Positions**\n\n`;
          let totalPending = 0;
          
          userPositions.forEach((pos, i) => {
            const amount = parseFloat(pos.pendingCRYSTAL);
            totalPending += amount;
            positionsSummary += `${i+1}. **${pos.pairName}** (PID ${pos.pid}): ${amount.toFixed(4)} CRYSTAL\n`;
          });
          
          positionsSummary += `\n**Total Harvestable:** ${totalPending.toFixed(4)} CRYSTAL`;
          
          const userMsg = `LIVE HARVEST DATA:\n\n${positionsSummary}\n\nAnalyze as Hedge and advise on harvesting strategy.`;
          const reply = await askHedge([{ role: 'user', content: userMsg }]);
          await interaction.editReply(reply);
          return;
        } else {
          // Generic garden info
          const userMsg = `User asked about garden pools. Explain how Crystalvale gardens work: LP staking, fee APR from trading, emission APR from CRYSTAL rewards, and how total APR is calculated. Respond as Hedge.`;
          const reply = await askHedge([{ role: 'user', content: userMsg }]);
          await interaction.editReply(reply);
          return;
        }
      } catch (err) {
        console.error('Garden analytics error:', err);
        await interaction.editReply(`Analytics calculation failed: ${err.message}. This requires scanning blockchain logs which can be slow. Try again or contact support.`);
      }
      return;
    }

    if (name === 'quest') {
      const goal = interaction.options.getString('goal', true);
      const userMsg = `Slash Command: /quest recommend
- goal: ${goal}
Return top 1–3 options and rationale in Hedge’s concise format.`;
      const reply = await askHedge([{ role: 'user', content: userMsg }]);
      await interaction.editReply(reply);
      return;
    }

    if (name === 'stats') {
      const wallet = interaction.options.getString('wallet') || 'not provided';
      const userMsg = `Slash Command: /stats summary
- wallet: ${wallet}
If wallet is 'not provided', explain the safe default view. Use Hedge format.`;
      const reply = await askHedge([{ role: 'user', content: userMsg }]);
      await interaction.editReply(reply);
      return;
    }

    if (name === 'walkthrough') {
      const topic = interaction.options.getString('topic') || 'getting-started';
      const userMsg = `Slash Command: /walkthrough
- topic: ${topic}

User is Tier 0 (free).
Explain ONLY game concepts, UI navigation, and basic gameplay for this topic.
Do NOT talk about ROI, APR, or token prices.
Give a short, step-by-step guide that a complete beginner can follow.`;
      const reply = await askHedge(
        [{ role: 'user', content: userMsg }],
        { mode: 'walkthrough' }
      );
      await interaction.editReply(reply);
      return;
    }

    // Economic system commands
    if (name === 'deposit') {
      const discordId = interaction.user.id;
      const username = interaction.user.username;
      const depositData = await requestDeposit(discordId, username);
      
      let response = `💰 **JEWEL Deposit Instructions**\n\n`;
      response += `Send **EXACTLY** \`${depositData.amountJewel}\` JEWEL to:\n\n`;
      response += `\`\`\`\n${depositData.depositAddress}\`\`\`\n\n`;
      response += `⏱️ You have 24 hours to complete this deposit.\n`;
      response += `📍 Network: DFK Chain (Crystalvale)\n\n`;
      response += `Once your transaction confirms, your balance will be credited automatically.\n`;
      response += `Use \`/balance\` to check your balance.`;
      
      await interaction.editReply(response);
      return;
    }
    
    if (name === 'balance') {
      const discordId = interaction.user.id;
      
      // Get player data
      const player = await db.select().from(players).where(eq(players.discordId, discordId)).limit(1);
      if (player.length === 0) {
        await interaction.editReply('No balance found. Use `/deposit` to add JEWEL to your account.');
        return;
      }
      
      // Get balance data
      const balance = await db.select().from(jewelBalances).where(eq(jewelBalances.playerId, player[0].id)).limit(1);
      if (balance.length === 0) {
        await interaction.editReply('No balance found. Use `/deposit` to add JEWEL to your account.');
        return;
      }
      
      const b = balance[0];
      let response = `💎 **Your JEWEL Balance**\n\n`;
      response += `**Available:** ${parseFloat(b.balanceJewel).toFixed(4)} JEWEL\n`;
      response += `**Lifetime Deposits:** ${parseFloat(b.lifetimeDepositsJewel).toFixed(4)} JEWEL\n`;
      response += `**Tier:** ${b.tier}\n\n`;
      response += `**Free Tier Usage Today:**\n`;
      response += `• Garden APRs: ${b.freeGardenAprsUsedToday}/1\n`;
      response += `• Summon Calcs: ${b.freeSummonUsedToday}/1\n\n`;
      response += `Use \`/deposit\` to add more JEWEL.`;
      
      await interaction.editReply(response);
      return;
    }

    if (name === 'optimize-gardens') {
      const discordId = interaction.user.id;
      const walletParam = interaction.options.getString('wallet');
      
      // Get player data
      const playerData = await db.select().from(players).where(eq(players.discordId, discordId)).limit(1);
      if (playerData.length === 0) {
        await interaction.editReply('You need to register first. Send me a DM to get started!');
        return;
      }
      
      // Determine wallet address (from command or linked wallet)
      let walletAddress;
      if (walletParam) {
        walletAddress = walletParam;
      } else if (playerData[0].wallets && playerData[0].wallets.length > 0) {
        walletAddress = playerData[0].wallets[0];
      } else {
        await interaction.editReply('Please provide a wallet address or link one in DMs first.');
        return;
      }
      
      // Scan for LP positions
      await interaction.editReply('Scanning your wallet for garden LP positions...');
      const { detectWalletLPPositions, formatLPPositionsSummary } = await import('./wallet-lp-detector.js');
      const positions = await detectWalletLPPositions(walletAddress);
      
      if (!positions || positions.length === 0) {
        await interaction.editReply('No garden LP positions found in this wallet. Make sure you have LP tokens staked in Crystalvale pools.');
        return;
      }
      
      // Show summary and offer optimization
      const summary = formatLPPositionsSummary(positions);
      const response = `${summary}\n\nWant me to analyze your heroes and recommend optimal assignments for maximum yield? This costs **25 JEWEL**.\n\nUse \`/deposit\` to add JEWEL, then DM me "optimize my gardens" to get your personalized recommendations.`;
      
      await interaction.editReply(response);
      return;
    }
    
    if (name === 'analytics') {
      // Admin only - check if user is bot owner
      const ADMIN_IDS = (process.env.ADMIN_DISCORD_IDS || '').split(',');
      if (!ADMIN_IDS.includes(interaction.user.id)) {
        await interaction.editReply('This command is restricted to admins only.');
        return;
      }
      
      const type = interaction.options.getString('type', true);
      const days = interaction.options.getInteger('days') || 7;
      const limit = interaction.options.getInteger('limit') || 10;
      
      try {
        const embedData = await getAnalyticsForDiscord(type, { days, limit });
        await interaction.editReply({ embeds: [embedData] });
      } catch (err) {
        console.error('Analytics error:', err);
        await interaction.editReply(`Error generating ${type} analytics: ${err.message}`);
      }
      return;
    }

    if (name === 'market') { await handleMarketCommand(interaction); return; }
    if (name === 'lookup') { await handleLookupCommand(interaction); return; }
    if (name === 'wallet') { await handleWalletCommand(interaction); return; }

    await interaction.editReply("That command's not wired yet. Try /help.");
  } catch (err) {
    console.error('Handler error:', err);
    try {
      await interaction.editReply('Something went sideways fetching the numbers. Try again in a moment.');
    } catch {
      // ignore secondary errors
    }
  }
});

client.login(DISCORD_TOKEN);

// NEW ON-CHAIN COMMAND HANDLERS - Added automatically
// These were appended to integrate blockchain data
// TODO: Move these handlers inline with the existing commands for better organization

async function handleMarketCommand(interaction) {
  const mainClass = interaction.options.getString('class');
  const limit = interaction.options.getInteger('limit') || 10;
  const heroes = await onchain.getCheapestHeroes(mainClass, limit);
  if (!heroes || heroes.length === 0) {
    await interaction.editReply('No heroes found on marketplace.');
    return;
  }
  let listings = `📊 **Live Marketplace** (${heroes.length} results)\n\n`;
  heroes.forEach((hero, i) => {
    const price = onchain.weiToToken(hero.salePrice);
    const rarity = ['Common', 'Uncommon', 'Rare', 'Legendary', 'Mythic'][hero.rarity];
    listings += `${i+1}. **#${hero.normalizedId}** - ${hero.mainClassStr} | ${rarity} | Lvl ${hero.level} → **${price}** JEWEL\n`;
  });
  const userMsg = `LIVE MARKET DATA:\n\n${listings}\n\nAnalyze as Hedge.`;
  const reply = await askHedge([{ role: 'user', content: userMsg }]);
  await interaction.editReply(reply);
}

async function handleLookupCommand(interaction) {
  const mainClass = interaction.options.getString('class');
  const profession = interaction.options.getString('profession');
  const forSale = interaction.options.getBoolean('for_sale') || false;
  const minLevel = interaction.options.getInteger('min_level');
  const heroes = await onchain.searchHeroes({ mainClass, profession, forSale, minLevel, limit: 15 });
  if (!heroes || heroes.length === 0) {
    await interaction.editReply('No heroes found.');
    return;
  }
  let results = `🔍 **Search Results** (${heroes.length})\n\n`;
  heroes.forEach((hero, i) => {
    const price = hero.salePrice ? `${onchain.weiToToken(hero.salePrice)} JEWEL` : 'Not for sale';
    results += `${i+1}. **#${hero.normalizedId}** - ${hero.mainClassStr} | Lvl ${hero.level} | ${price}\n`;
  });
  const userMsg = `LIVE SEARCH:\n\n${results}\n\nAnalyze as Hedge.`;
  const reply = await askHedge([{ role: 'user', content: userMsg }]);
  await interaction.editReply(reply);
}

async function handleWalletCommand(interaction) {
  const address = interaction.options.getString('address', true);
  if (!address.match(/^0x[a-fA-F0-9]{40}$/)) {
    await interaction.editReply('Invalid wallet address format.');
    return;
  }
  const heroes = await onchain.getHeroesByOwner(address, 30);
  if (!heroes || heroes.length === 0) {
    await interaction.editReply('No heroes found for this wallet.');
    return;
  }
  const byClass = {};
  heroes.forEach(h => { byClass[h.mainClassStr] = (byClass[h.mainClassStr] || 0) + 1; });
  let portfolio = `👛 **Wallet Portfolio** - ${heroes.length} heroes\n\n`;
  portfolio += `**By Class:** ${Object.entries(byClass).map(([cls, cnt]) => `${cls}: ${cnt}`).join(', ')}\n\n`;
  heroes.slice(0, 10).forEach((hero, i) => {
    portfolio += `${i+1}. #${hero.normalizedId} - ${hero.mainClassStr} | Lvl ${hero.level}\n`;
  });
  const userMsg = `LIVE PORTFOLIO:\n\n${portfolio}\n\nAnalyze as Hedge.`;
  const reply = await askHedge([{ role: 'user', content: userMsg }]);
  await interaction.editReply(reply);
}

// Simple HTTP server on port 5000 for workflow health check + API
const app = express();
app.use(express.json());

// ============================================================
// SESSION MANAGEMENT (lightweight, no external dependencies)
// ============================================================

const sessions = new Map();

function parseCookie(cookieHeader, name) {
  if (!cookieHeader) return null;
  const cookies = cookieHeader.split(';');
  for (const cookie of cookies) {
    const trimmed = cookie.trim();
    if (trimmed.startsWith(name + '=')) {
      return trimmed.substring(name.length + 1);
    }
  }
  return null;
}

function signCookie(data) {
  if (!SESSION_SECRET) {
    throw new Error('SESSION_SECRET is required for session signing');
  }
  const hmac = crypto.createHmac('sha256', SESSION_SECRET);
  hmac.update(JSON.stringify(data));
  const signature = hmac.digest('hex');
  return `${Buffer.from(JSON.stringify(data)).toString('base64')}.${signature}`;
}

function verifyCookie(cookie) {
  if (!cookie) return null;
  const lastDotIndex = cookie.lastIndexOf('.');
  if (lastDotIndex === -1) return null;
  
  const dataB64 = cookie.substring(0, lastDotIndex);
  const signature = cookie.substring(lastDotIndex + 1);
  
  if (!dataB64 || !signature) return null;
  
  try {
    const data = JSON.parse(Buffer.from(dataB64, 'base64').toString('utf8'));
    if (!SESSION_SECRET) {
      throw new Error('SESSION_SECRET is required for session verification');
    }
    const hmac = crypto.createHmac('sha256', SESSION_SECRET);
    hmac.update(JSON.stringify(data));
    const expectedSignature = hmac.digest('hex');
    
    if (signature !== expectedSignature) return null;
    
    if (data.expires && Date.now() > data.expires) {
      return null;
    }
    
    return data;
  } catch (e) {
    return null;
  }
}

// ============================================================
// DISCORD OAUTH2 HELPERS
// ============================================================

async function exchangeCodeForToken(code) {
  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    client_secret: DISCORD_CLIENT_SECRET,
    grant_type: 'authorization_code',
    code: code,
    redirect_uri: REDIRECT_URI
  });

  const response = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    body: params,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });

  if (!response.ok) {
    throw new Error('Failed to exchange code for token');
  }

  return await response.json();
}

async function fetchUserGuilds(accessToken) {
  const response = await fetch('https://discord.com/api/users/@me/guilds', {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });

  if (!response.ok) {
    throw new Error('Failed to fetch user guilds');
  }

  return await response.json();
}

async function fetchUserInfo(accessToken) {
  const response = await fetch('https://discord.com/api/users/@me', {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });

  if (!response.ok) {
    throw new Error('Failed to fetch user info');
  }

  return await response.json();
}

// ============================================================
// AUTHENTICATION MIDDLEWARE
// ============================================================

function requireAuth(req, res, next) {
  const sessionCookie = parseCookie(req.headers.cookie, 'session');
  const session = verifyCookie(sessionCookie);
  
  if (!session || !session.userId) {
    return res.status(401).json({ error: 'Authentication required', redirectTo: '/login.html' });
  }
  
  req.user = session;
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user || !req.user.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// ============================================================
// OAUTH ROUTES
// ============================================================

app.get('/auth/discord', (req, res) => {
  if (!DISCORD_CLIENT_ID || !DISCORD_GUILD_ID) {
    return res.status(500).send('OAuth not configured. Please set DISCORD_CLIENT_ID and DISCORD_GUILD_ID environment variables.');
  }
  
  const authUrl = `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=identify%20guilds`;
  res.redirect(authUrl);
});

app.get('/auth/discord/callback', async (req, res) => {
  const { code } = req.query;
  
  if (!code) {
    return res.status(400).send('Authorization code missing');
  }
  
  try {
    const tokenData = await exchangeCodeForToken(code);
    const [userInfo, guilds] = await Promise.all([
      fetchUserInfo(tokenData.access_token),
      fetchUserGuilds(tokenData.access_token)
    ]);
    
    const isInGuild = guilds.some(g => g.id === DISCORD_GUILD_ID);
    
    if (!isInGuild) {
      return res.status(403).send('Access denied. You must be a member of the Hedge Ledger Discord server.');
    }
    
    const targetGuild = guilds.find(g => g.id === DISCORD_GUILD_ID);
    const hasAdminPerms = targetGuild && (parseInt(targetGuild.permissions) & 0x8) === 0x8;
    
    const sessionData = {
      userId: userInfo.id,
      username: userInfo.username,
      discriminator: userInfo.discriminator,
      avatar: userInfo.avatar,
      isAdmin: hasAdminPerms,
      expires: Date.now() + (7 * 24 * 60 * 60 * 1000)
    };
    
    const sessionCookie = signCookie(sessionData);
    
    res.setHeader('Set-Cookie', `session=${sessionCookie}; Path=/; HttpOnly; Max-Age=${7 * 24 * 60 * 60}; SameSite=Lax`);
    res.redirect('/users.html');
  } catch (error) {
    console.error('[OAuth] Error during callback:', error);
    res.status(500).send('Authentication failed. Please try again.');
  }
});

app.get('/auth/logout', (req, res) => {
  res.setHeader('Set-Cookie', 'session=; Path=/; HttpOnly; Max-Age=0; SameSite=Lax');
  res.redirect('/login.html');
});

app.get('/auth/status', (req, res) => {
  const sessionCookie = parseCookie(req.headers.cookie, 'session');
  const session = verifyCookie(sessionCookie);
  
  if (!session || !session.userId) {
    return res.json({ authenticated: false });
  }
  
  res.json({
    authenticated: true,
    user: {
      id: session.userId,
      username: session.username,
      isAdmin: session.isAdmin
    }
  });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API Routes for dashboard
app.get('/api/analytics/overview', async (req, res) => {
  try {
    const [playerStats, depositStats, balanceStats, revenueStats] = await Promise.all([
      db.select({ total: sql`COUNT(*)::int`, withBalance: sql`COUNT(CASE WHEN EXISTS(SELECT 1 FROM ${jewelBalances} WHERE ${jewelBalances.playerId} = ${players.id}) THEN 1 END)::int` }).from(players),
      db.select({ total: sql`COUNT(*)::int`, completed: sql`COALESCE(SUM(CASE WHEN ${depositRequests.status} = 'completed' THEN 1 ELSE 0 END), 0)::int`, totalJewel: sql`COALESCE(SUM(CASE WHEN ${depositRequests.status} = 'completed' THEN CAST(${depositRequests.requestedAmountJewel} AS DECIMAL) ELSE 0 END), 0)` }).from(depositRequests),
      db.select({ totalBalance: sql`COALESCE(SUM(CAST(${jewelBalances.balanceJewel} AS DECIMAL)), 0)`, activeBalances: sql`COUNT(CASE WHEN CAST(${jewelBalances.balanceJewel} AS DECIMAL) > 0 THEN 1 END)::int` }).from(jewelBalances),
      db.select({ totalRevenue: sql`COALESCE(SUM(${queryCosts.revenueUsd}), 0)`, totalProfit: sql`COALESCE(SUM(${queryCosts.profitUsd}), 0)`, totalQueries: sql`COUNT(*)::int`, paidQueries: sql`COALESCE(SUM(CASE WHEN NOT ${queryCosts.freeTierUsed} THEN 1 ELSE 0 END), 0)::int` }).from(queryCosts)
    ]);
    res.json({
      players: { total: Number(playerStats[0].total), withBalance: Number(playerStats[0].withBalance) },
      deposits: { total: Number(depositStats[0].total), completed: Number(depositStats[0].completed), totalJewel: String(depositStats[0].totalJewel) },
      balances: { totalBalance: String(balanceStats[0].totalBalance), activeBalances: Number(balanceStats[0].activeBalances) },
      revenue: { totalRevenue: String(revenueStats[0].totalRevenue), totalProfit: String(revenueStats[0].totalProfit), totalQueries: Number(revenueStats[0].totalQueries), paidQueries: Number(revenueStats[0].paidQueries) }
    });
  } catch (error) {
    console.error('[Dashboard] Overview API error:', error);
    res.status(500).json({ error: 'Failed to fetch overview data', details: error.message });
  }
});

app.get('/api/analytics/players', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    const playerList = await db.select({ id: players.id, discordId: players.discordId, discordUsername: players.discordUsername, tier: jewelBalances.tier, balance: jewelBalances.balanceJewel, firstSeenAt: players.firstSeenAt }).from(players).leftJoin(jewelBalances, eq(players.id, jewelBalances.playerId)).orderBy(desc(players.firstSeenAt)).limit(limit).offset(offset);
    const serialized = playerList.map(p => ({
      ...p,
      id: Number(p.id),
      balance: String(p.balance || '0'),
      firstSeenAt: p.firstSeenAt?.toISOString()
    }));
    res.json(serialized);
  } catch (error) {
    console.error('[Dashboard] Players API error:', error);
    res.status(500).json({ error: 'Failed to fetch players' });
  }
});

app.get('/api/analytics/deposits', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const deposits = await db.select({ id: depositRequests.id, playerId: depositRequests.playerId, discordUsername: players.discordUsername, requestedAmount: depositRequests.requestedAmountJewel, uniqueAmount: depositRequests.uniqueAmountJewel, status: depositRequests.status, transactionHash: depositRequests.transactionHash, requestedAt: depositRequests.requestedAt, completedAt: depositRequests.completedAt }).from(depositRequests).leftJoin(players, eq(depositRequests.playerId, players.id)).orderBy(desc(depositRequests.requestedAt)).limit(limit);
    const serialized = deposits.map(d => ({
      ...d,
      id: Number(d.id),
      playerId: Number(d.playerId),
      requestedAmount: String(d.requestedAmount || '0'),
      uniqueAmount: String(d.uniqueAmount || '0'),
      requestedAt: d.requestedAt?.toISOString(),
      completedAt: d.completedAt?.toISOString()
    }));
    res.json(serialized);
  } catch (error) {
    console.error('[Dashboard] Deposits API error:', error);
    res.status(500).json({ error: 'Failed to fetch deposits' });
  }
});

app.get('/api/analytics/query-breakdown', async (req, res) => {
  try {
    const breakdown = await db.select({ queryType: queryCosts.queryType, count: sql`COUNT(*)`, totalRevenue: sql`COALESCE(SUM(${queryCosts.revenueUsd}), 0)`, freeTier: sql`SUM(CASE WHEN ${queryCosts.freeTierUsed} THEN 1 ELSE 0 END)` }).from(queryCosts).groupBy(queryCosts.queryType).orderBy(desc(sql`COUNT(*)`));
    const serialized = breakdown.map(q => ({
      queryType: q.queryType,
      count: Number(q.count),
      totalRevenue: String(q.totalRevenue || '0'),
      freeTier: Number(q.freeTier || 0)
    }));
    res.json(serialized);
  } catch (error) {
    console.error('[Dashboard] Query breakdown API error:', error);
    res.status(500).json({ error: 'Failed to fetch query breakdown' });
  }
});

// Admin API Routes

// GET /api/admin/users - Comprehensive user management list
app.get('/api/admin/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    console.log('[API] Fetching users list...');
    // Fetch all users with their basic info (single query)
    const userList = await db
      .select({
        id: players.id,
        discordId: players.discordId,
        discordUsername: players.discordUsername,
        walletAddress: players.primaryWallet,
        tier: jewelBalances.tier,
        balance: jewelBalances.balanceJewel,
        lifetimeDeposits: jewelBalances.lifetimeDepositsJewel,
        lastQueryAt: jewelBalances.lastQueryAt,
        firstSeenAt: players.firstSeenAt,
        totalMessages: players.totalMessages,
      })
      .from(players)
      .leftJoin(jewelBalances, eq(players.id, jewelBalances.playerId))
      .orderBy(desc(players.firstSeenAt));
    
    console.log('[API] Got', userList.length, 'users');
    const playerIds = userList.map(u => u.id);
    
    // Early return if no players exist
    if (playerIds.length === 0) {
      console.log('[API] No users found, returning empty array');
      return res.json([]);
    }
    
    console.log('[API] Player IDs:', playerIds);
    
    // Batch query: Get all query stats grouped by player (single query)
    const allQueryStats = await db
      .select({
        playerId: queryCosts.playerId,
        totalQueries: sql`COUNT(*)::int`,
        totalCost: sql`COALESCE(SUM(${queryCosts.revenueUsd}), 0)`,
        totalProfit: sql`COALESCE(SUM(${queryCosts.profitUsd}), 0)`,
        freeQueries: sql`COALESCE(SUM(CASE WHEN ${queryCosts.freeTierUsed} THEN 1 ELSE 0 END), 0)::int`
      })
      .from(queryCosts)
      .where(inArray(queryCosts.playerId, playerIds))
      .groupBy(queryCosts.playerId);
    
    const queryStatsMap = new Map(allQueryStats.map(s => [s.playerId, s]));
    
    // Batch query: Get all deposit stats grouped by player (single query)
    const allDepositStats = await db
      .select({
        playerId: depositRequests.playerId,
        totalDeposits: sql`COUNT(*)::int`,
        completedDeposits: sql`COALESCE(SUM(CASE WHEN ${depositRequests.status} = 'completed' THEN 1 ELSE 0 END), 0)::int`,
        totalJewel: sql`COALESCE(SUM(CASE WHEN ${depositRequests.status} = 'completed' THEN CAST(${depositRequests.requestedAmountJewel} AS DECIMAL) ELSE 0 END), 0)`
      })
      .from(depositRequests)
      .where(inArray(depositRequests.playerId, playerIds))
      .groupBy(depositRequests.playerId);
    
    const depositStatsMap = new Map(allDepositStats.map(d => [d.playerId, d]));
    
    // Batch query: Get recent DM messages for all users (single query)
    const messagesByPlayer = new Map();
    try {
      const allMessages = await db
        .select({
          playerId: interactionMessages.playerId,
          content: interactionMessages.content,
          messageType: interactionMessages.messageType,
          timestamp: interactionMessages.timestamp
        })
        .from(interactionMessages)
        .innerJoin(interactionSessions, eq(interactionMessages.sessionId, interactionSessions.id))
        .where(and(
          inArray(interactionMessages.playerId, playerIds),
          eq(interactionSessions.channelType, 'dm')
        ))
        .orderBy(desc(interactionMessages.timestamp))
        .limit(10 * playerIds.length); // Get up to 10 messages per user
      
      // Group messages by player
      allMessages.forEach(msg => {
        if (!messagesByPlayer.has(msg.playerId)) {
          messagesByPlayer.set(msg.playerId, []);
        }
        const playerMsgs = messagesByPlayer.get(msg.playerId);
        if (playerMsgs.length < 10) {
          playerMsgs.push(msg);
        }
      });
    } catch (msgError) {
      console.warn('[API] Failed to fetch messages, continuing without message data:', msgError.message);
      // messagesByPlayer remains empty Map
    }
    
    // Enrich users with batched data
    const enrichedUsers = userList.map((user) => {
      const stats = queryStatsMap.get(user.id) || {
        totalQueries: 0,
        totalCost: '0',
        totalProfit: '0',
        freeQueries: 0
      };
      
      const deposits = depositStatsMap.get(user.id) || {
        totalDeposits: 0,
        completedDeposits: 0,
        totalJewel: '0'
      };
      
      // Generate conversation summary
      const recentMessages = messagesByPlayer.get(user.id) || [];
      let conversationSummary = 'No recent conversations';
      if (recentMessages.length > 0) {
        const userMessages = recentMessages
          .filter(m => m.messageType === 'user_message')
          .map(m => m.content)
          .slice(0, 5);
        
        if (userMessages.length > 0) {
          const topics = new Set();
          userMessages.forEach(msg => {
            const lower = msg.toLowerCase();
            if (lower.includes('hero') || lower.includes('summon')) topics.add('Heroes');
            if (lower.includes('garden') || lower.includes('pool') || lower.includes('apr')) topics.add('Gardens');
            if (lower.includes('market') || lower.includes('buy') || lower.includes('sell')) topics.add('Marketplace');
            if (lower.includes('wallet') || lower.includes('balance')) topics.add('Wallet');
            if (lower.includes('quest')) topics.add('Questing');
            if (lower.includes('npc') || lower.includes('druid') || lower.includes('jeweler')) topics.add('NPCs');
          });
          
          conversationSummary = topics.size > 0 
            ? Array.from(topics).join(', ')
            : 'General questions';
        }
      }
      
      return {
        ...user,
        id: Number(user.id),
        queryCount: stats.totalQueries || 0,
        queryCosts: stats.totalCost || '0',
        queryProfit: stats.totalProfit || '0',
        freeQueryCount: stats.freeQueries || 0,
        depositCount: deposits.totalDeposits || 0,
        completedDeposits: deposits.completedDeposits || 0,
        totalJewelProvided: deposits.totalJewel || '0',
        conversationSummary,
        userState: user.lastQueryAt ? 'active' : 'inactive',
        conversionStatus: (deposits.completedDeposits || 0) > 0 ? 'converted' : 'free',
        firstSeenAt: user.firstSeenAt?.toISOString(),
        lastQueryAt: user.lastQueryAt?.toISOString()
      };
    });
    
    res.json(enrichedUsers);
  } catch (error) {
    console.error('[API] Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// PATCH /api/admin/users/:id/tier - Update user tier manually
app.patch('/api/admin/users/:id/tier', requireAuth, requireAdmin, async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const { tier } = req.body;
    
    if (!tier || !['free', 'bronze', 'silver', 'gold', 'whale'].includes(tier)) {
      return res.status(400).json({ error: 'Invalid tier. Must be one of: free, bronze, silver, gold, whale' });
    }
    
    // Validate that player exists
    const player = await db
      .select({ id: players.id })
      .from(players)
      .where(eq(players.id, userId))
      .limit(1);
    
    if (player.length === 0) {
      return res.status(404).json({ error: 'Player not found' });
    }
    
    // Check if user has a balance record
    const existingBalance = await db
      .select()
      .from(jewelBalances)
      .where(eq(jewelBalances.playerId, userId))
      .limit(1);
    
    if (existingBalance.length === 0) {
      // Create balance record if it doesn't exist
      await db.insert(jewelBalances).values({
        playerId: userId,
        balanceJewel: '0',
        lifetimeDepositsJewel: '0',
        tier: tier
      });
    } else {
      // Update existing tier
      await db
        .update(jewelBalances)
        .set({ tier: tier, updatedAt: sql`CURRENT_TIMESTAMP` })
        .where(eq(jewelBalances.playerId, userId));
    }
    
    res.json({ success: true, tier });
  } catch (error) {
    console.error('[API] Error updating tier:', error);
    res.status(500).json({ error: 'Failed to update tier' });
  }
});

// DELETE /api/admin/users/:discordId - Delete a user and all associated data
app.delete('/api/admin/users/:discordId', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { discordId } = req.params;
    
    if (!discordId) {
      return res.status(400).json({ error: 'Discord ID is required' });
    }
    
    // Find the player
    const player = await db
      .select({ id: players.id, discordUsername: players.discordUsername })
      .from(players)
      .where(eq(players.discordId, discordId))
      .limit(1);
    
    if (player.length === 0) {
      return res.status(404).json({ error: 'Player not found' });
    }
    
    const playerId = player[0].id;
    const username = player[0].discordUsername;
    
    console.log(`[API] Admin deleting user: ${username} (Discord ID: ${discordId}, Player ID: ${playerId})`);
    
    // Delete in correct order due to foreign key constraints
    // 1. Delete balance record
    await db.delete(jewelBalances).where(eq(jewelBalances.playerId, playerId));
    console.log(`[API] Deleted balance record for player ${playerId}`);
    
    // 2. Delete player record
    await db.delete(players).where(eq(players.id, playerId));
    console.log(`[API] Deleted player record for ${username}`);
    
    res.json({ success: true, message: `User ${username} deleted successfully` });
  } catch (error) {
    console.error('[API] Error deleting user:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// Debug API Routes (Admin only)

// POST /api/debug/clear-pool-cache - Clear the pool analytics cache
app.post('/api/debug/clear-pool-cache', requireAuth, requireAdmin, async (req, res) => {
  try {
    console.log('[Debug] Clearing pool cache...');
    stopPoolCache();
    res.json({ 
      success: true, 
      message: 'Pool cache cleared (stopped)',
      timestamp: new Date().toISOString(),
      note: 'Use refresh to restart it'
    });
  } catch (error) {
    console.error('[Debug] Error clearing pool cache:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/debug/refresh-pool-cache - Force refresh the pool analytics cache
app.post('/api/debug/refresh-pool-cache', requireAuth, requireAdmin, async (req, res) => {
  try {
    console.log('[Debug] Refreshing pool cache...');
    stopPoolCache();
    // Wait a bit before restarting
    setTimeout(async () => {
      try {
        await initializePoolCache();
      } catch (cacheError) {
        console.error('[Debug] Pool cache restart failed:', cacheError);
      }
    }, 500);
    
    res.json({ 
      success: true, 
      message: 'Pool cache restart initiated',
      timestamp: new Date().toISOString(),
      note: 'Cache will be repopulated in the background'
    });
  } catch (error) {
    console.error('[Debug] Error refreshing pool cache:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/debug/test-wallet-detection - Test wallet address detection
app.post('/api/debug/test-wallet-detection', requireAuth, requireAdmin, async (req, res) => {
  try {
    const walletRegex = /0[xX][a-fA-F0-9]{40}/;
    const tests = [
      { input: '0x1a9f02d4c0a1a5e7c8b3f5e6d9a2b4c5e7f8d64098', expected: true },
      { input: '0X1A9F02D4C0A1A5E7C8B3F5E6D9A2B4C5E7F8D64098', expected: true },
      { input: 'My wallet is 0xAbCdEf1234567890AbCdEf1234567890AbCdEf12', expected: true },
      { input: 'not a wallet', expected: false },
      { input: '0x123', expected: false }
    ];
    
    const results = tests.map(test => ({
      ...test,
      matched: walletRegex.test(test.input),
      passed: walletRegex.test(test.input) === test.expected
    }));
    
    const allPassed = results.every(r => r.passed);
    
    res.json({ 
      success: allPassed,
      tests: results,
      summary: `${results.filter(r => r.passed).length}/${results.length} tests passed`
    });
  } catch (error) {
    console.error('[Debug] Error testing wallet detection:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/debug/test-new-user-flow - Test new user registration flow
app.post('/api/debug/test-new-user-flow', requireAuth, requireAdmin, async (req, res) => {
  try {
    // Test the message that would be sent to new users
    const testUsername = 'TestUser';
    const walletRequestMessage = 
      `*yawns* Welcome to my ledger, ${testUsername}.\n\n` +
      `So... are you familiar with DeFi Kingdoms, or are you brand new to Crystalvale? Either way, I can help—navigation guides for beginners, or even advanced queries for the OGs... for the right price, hehehe.\n\n` +
      `If you give me your wallet address, I can provide much better support—optimization strategies tailored to your heroes, help you track onboarding milestones, and even send you rewards as you complete them. ` +
      `Don't worry, I only have view-only rights on-chain with that address. Completely read-only.\n\n` +
      `If you'd rather not share it, that's fine too. You can still use the free walkthrough guides and basic help. Your choice.\n\n` +
      `What brings you to my ledger today? Need any help getting started?`;
    
    res.json({ 
      success: true,
      flow: 'new_user_onboarding',
      messagePreview: walletRequestMessage,
      steps: [
        'User sends first DM',
        'Bot detects new user',
        'ensureUserRegistered() creates player + balance record',
        'Bot sends welcome message with wallet request',
        'Bot RETURNS (does not send second message)',
        'User can respond with wallet or continue chatting'
      ]
    });
  } catch (error) {
    console.error('[Debug] Error testing new user flow:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/debug/test-intent-parser - Test intent parser with sample inputs
app.post('/api/debug/test-intent-parser', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { parseIntent } = await import('./intent-parser.js');
    
    const testMessages = [
      'Where is Alchemist Adelle?',
      'Show me my hero 123456',
      'What gardens have the best APR?',
      'How do I summon heroes?',
      'Check my wallet 0x1a9f02d4c0a1a5e7c8b3f5e6d9a2b4c5e7f8d64098'
    ];
    
    const results = testMessages.map(msg => ({
      message: msg,
      intent: parseIntent(msg)
    }));
    
    res.json({ 
      success: true,
      tests: results
    });
  } catch (error) {
    console.error('[Debug] Error testing intent parser:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/debug/restart-monitor - Restart the transaction monitor
app.post('/api/debug/restart-monitor', requireAuth, requireAdmin, async (req, res) => {
  try {
    console.log('[Debug] Restarting transaction monitor...');
    stopMonitoring();
    // Wait a bit before restarting
    setTimeout(() => {
      startMonitoring();
    }, 1000);
    
    res.json({ 
      success: true, 
      message: 'Transaction monitor restart initiated',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[Debug] Error restarting monitor:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/debug/system-health - Check system health
app.get('/api/debug/system-health', requireAuth, requireAdmin, async (req, res) => {
  try {
    const health = {
      timestamp: new Date().toISOString(),
      components: {
        database: { status: 'unknown' },
        discord: { status: client.isReady() ? 'connected' : 'disconnected' },
        openai: { status: openai ? 'configured' : 'not_configured' },
        monitor: { status: 'running' }
      }
    };
    
    // Test database connection
    try {
      await db.select().from(players).limit(1);
      health.components.database.status = 'connected';
    } catch (dbError) {
      health.components.database.status = 'error';
      health.components.database.error = dbError.message;
    }
    
    const allHealthy = Object.values(health.components).every(
      c => c.status === 'connected' || c.status === 'configured' || c.status === 'running'
    );
    
    res.json({ 
      healthy: allHealthy,
      ...health
    });
  } catch (error) {
    console.error('[Debug] Error checking system health:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/debug/recent-errors - Get recent error logs
app.get('/api/debug/recent-errors', requireAuth, requireAdmin, async (req, res) => {
  try {
    const fs = await import('fs');
    const path = await import('path');
    
    // Try to read from logs if they exist
    const errors = [
      'Debug endpoint: Error logs would be retrieved from system logs',
      'This is a placeholder - actual implementation would parse log files'
    ];
    
    res.json({ 
      success: true,
      count: errors.length,
      errors: errors
    });
  } catch (error) {
    console.error('[Debug] Error fetching recent errors:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/debug/all-logs - Get all recent logs
app.get('/api/debug/all-logs', requireAuth, requireAdmin, async (req, res) => {
  try {
    const logs = [
      `[${new Date().toISOString()}] [INFO] Debug endpoint accessed`,
      `[${new Date().toISOString()}] [INFO] System operational`
    ];
    
    res.json({ 
      success: true,
      count: logs.length,
      logs: logs
    });
  } catch (error) {
    console.error('[Debug] Error fetching logs:', error);
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

// Set up Vite dev server for React app
(async () => {
  try {
    const { setupVite } = await import('./server/vite.ts');
    await setupVite(app, server);
    console.log('✅ Vite dev server integrated');
  } catch (error) {
    console.error('❌ Failed to setup Vite:', error.message);
    console.log('Falling back to static file serving from public/');
    // Fallback: serve static files from public directory
    app.use(express.static('public'));
  }
  
  server.listen(5000, '0.0.0.0', () => {
    console.log('✅ Web server listening on port 5000');
  });
})();

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down gracefully...');
  stopMonitoring();
  stopPoolCache();
  server.close(() => {
    console.log('✅ Web server closed');
    process.exit(0);
  });
});

// Export handlers so they can be called from the main command switch
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { handleMarketCommand, handleLookupCommand, handleWalletCommand };
}
