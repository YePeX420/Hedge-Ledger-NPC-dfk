// bot.js
import 'dotenv/config';
import fs from 'fs';
import { Client, GatewayIntentBits, Partials, Events } from 'discord.js';
import OpenAI from 'openai';

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
    const prompt = [
      {
        role: 'user',
        content: `DM from ${message.author.username}: ${message.content}`
      }
    ];

    const reply = await askHedge(prompt);
    await message.reply(reply);
  } catch (err) {
    console.error("DM error:", err);
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
      const userMsg = `Slash Command: /hero info
- hero_id: ${id}
Return in Hedge Ledger’s structure for /hero.`;
      const reply = await askHedge([{ role: 'user', content: userMsg }]);
      await interaction.editReply(reply);
      return;
    }

    if (name === 'garden') {
      const lp = interaction.options.getString('lp', true);
      const amount = interaction.options.getNumber('amount') ?? 1000;
      const userMsg = `Slash Command: /garden yield
- lp_symbol: ${lp}
- amount: ${amount}

For now you DO NOT have live APR data.
If you decide to assume an APR, clearly mark it as an illustrative example (e.g. "If APR were 20%...").
Explain the generic formula for daily/weekly/monthly yield:
- APR_decimal = APR_percent / 100
- daily = amount * APR_decimal / 365
- weekly = daily * 7
- monthly = daily * 30

Prefer to ask the user for the real APR instead of inventing concrete numbers.`;
      const reply = await askHedge([{ role: 'user', content: userMsg }]);
      await interaction.editReply(reply);
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
