// bot.js
import 'dotenv/config';
import fs from 'fs';
import { Client, GatewayIntentBits, Partials, Events } from 'discord.js';
import OpenAI from 'openai';

const {
  DISCORD_TOKEN,
  OPENAI_API_KEY,
  OPENAI_MODEL = 'gpt-5',
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

if (!DISCORD_TOKEN) throw new Error('Missing DISCORD_TOKEN');
if (!OPENAI_API_KEY) throw new Error('Missing OPENAI_API_KEY');

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
  partials: [Partials.Channel]
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
Return in Hedge Ledger’s structure for /garden. If APR is unknown, state assumptions clearly and show formula.`;
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
