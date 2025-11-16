// bot.js
import 'dotenv/config';
import fs from 'fs';
import { Client, GatewayIntentBits, Partials, Events } from 'discord.js';
import OpenAI from 'openai';
import * as onchain from './onchain-data.js';
import * as analytics from './garden-analytics.js';

const {
  DISCORD_TOKEN,
  OPENAI_API_KEY,
  OPENAI_MODEL = 'gpt-4o-mini',
  HEDGE_PROMPT_PATH = 'prompt/hedge-ledger.md'
} = process.env;

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
  'knowledge/ui-navigation.md'
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

client.once(Events.ClientReady, (c) => {
  console.log(`🤖 Logged in as ${c.user.tag}`);
  console.log(`🧠 Model: ${OPENAI_MODEL}`);
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
    let enrichedContent = `DM from ${message.author.username}: ${message.content}`;

    // 🌱 Detect garden/pool/APR questions
    const gardenKeywords = /\b(pool|pools|apr|aprs|garden|gardens|yield|liquidity|tvl|staking|lp)\b/gi;
    const isGardenQuestion = gardenKeywords.test(message.content);
    
    if (isGardenQuestion) {
      // Guide user to use slash command for live analytics
      const gardenResponse = [
        "Ah, chasing APRs I see. Smart move.",
        "",
        "I can actually pull **live on-chain analytics** for Crystalvale pools now, including:",
        "• Real 24h fee APR (from Swap events)",
        "• Emission APR (from CRYSTAL rewards)",
        "• TVL and volume data",
        "• Token prices",
        "",
        "But you'll need to use slash commands for that. Here's how:",
        "",
        "**View all pools:**",
        "`/garden pool:all realm:dfk`",
        "",
        "**Specific pool by PID:**",
        "`/garden pool:1 realm:dfk`",
        "",
        "**Search by name:**",
        "`/garden pool:CRYSTAL realm:dfk`",
        "",
        "**Your harvestable rewards:**",
        "`/garden wallet:0xYourAddress realm:dfk`",
        "",
        "The data comes straight from the blockchain - no guesswork, no external APIs. Takes about 20-60 seconds to scan 24h of events, so be patient.",
        "",
        "Go ahead and try it in the server. I'll wait here with my ledger. 📊"
      ].join('\n');
      
      await message.reply(gardenResponse);
      return;
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

// Export handlers so they can be called from the main command switch
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { handleMarketCommand, handleLookupCommand, handleWalletCommand };
}
