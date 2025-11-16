# Hedge Ledger - DeFi Kingdoms Discord NPC Bot

A Discord bot that acts as an in-character NPC helper for DeFi Kingdoms players. Meet **Hedge Ledger**, the Reluctant Accountant of Serendale - a lazy genius who helps players navigate the game while staying entertaining.

## 🎮 Features

### Character-Driven AI Responses
- Powered by OpenAI GPT-4o-mini
- Deep DeFi Kingdoms knowledge base
- Sarcastic, witty, lazy accountant personality
- Meta-aware (knows it's a bot, jokes about APIs)

### Discord Integration
- **Auto-onboarding**: DMs new members when they join
- **DM conversations**: Chat freely with Hedge in private messages
- **7 slash commands** for structured interactions

### Slash Commands

| Command | Description | Example |
|---------|-------------|---------|
| `/help` | List all commands | `/help` |
| `/npc` | Free-form chat with Hedge | `/npc message: What should a new player do?` |
| `/hero` | Get hero info and tips | `/hero id:12345` |
| `/garden` | Yield calculations for LP tokens | `/garden lp:CRYSTAL-USDC amount:1000` |
| `/quest` | Quest recommendations | `/quest goal:gold` |
| `/stats` | Portfolio summary | `/stats wallet:0x123...` |
| `/walkthrough` | Free beginner tutorials | `/walkthrough topic:getting-started` |

## 📚 Knowledge Base

Hedge has comprehensive knowledge about:
- ✅ **Heroes**: All 15 classes, stats, professions, best uses
- ✅ **Quests**: Mining, Gardening, Fishing, Foraging, Training
- ✅ **Gardens**: LP pairs, APR formulas, impermanent loss, staking
- ✅ **UI Navigation**: Step-by-step guides for every game action

See [`KNOWLEDGE_GUIDE.md`](KNOWLEDGE_GUIDE.md) for details on the knowledge system.

## 🚀 Setup

### Prerequisites
- Node.js 20+
- Discord Bot Token
- OpenAI API Key

### Environment Variables

Create a `.env` file:

```env
# Required
DISCORD_TOKEN=your_discord_bot_token
DISCORD_CLIENT_ID=your_discord_client_id
DISCORD_GUILD_ID=your_server_id
OPENAI_API_KEY=your_openai_api_key

# Optional
OPENAI_MODEL=gpt-4o-mini
HEDGE_PROMPT_PATH=prompt/hedge-ledger.md
```

### Installation

```bash
# Dependencies already installed via Replit
npm install

# Register slash commands (run once, or when commands change)
node register-commands.js

# Start the bot
node bot.js
```

### Discord Bot Setup

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. Go to **Bot** tab, create a bot
4. Copy the bot token → add to `.env` as `DISCORD_TOKEN`
5. Enable these **Privileged Gateway Intents**:
   - ✅ Server Members Intent
   - ✅ Message Content Intent
6. Go to **OAuth2** → **URL Generator**
7. Select scopes:
   - ✅ `bot`
   - ✅ `applications.commands`
8. Select bot permissions:
   - ✅ Send Messages
   - ✅ Read Messages/View Channels
   - ✅ Use Slash Commands
   - ✅ Send Messages in Threads
9. Copy the generated URL and invite the bot to your server

## 📁 Project Structure

```
.
├── bot.js                    # Main bot entry point
├── register-commands.js      # Slash command registration
├── prompt/
│   └── hedge-ledger.md       # Character personality & behavior rules
├── knowledge/
│   ├── heroes.md             # Hero classes, stats, professions
│   ├── quests.md             # Quest types, strategies
│   ├── gardens.md            # LP pools, yields, formulas
│   └── ui-navigation.md      # UI guides, step-by-step walkthroughs
├── .env                      # Environment variables (create this)
├── package.json              # Dependencies
├── README.md                 # This file
└── KNOWLEDGE_GUIDE.md        # Knowledge base documentation
```

## 🧪 Testing

Once the bot is running and invited to your server:

```
# Test hero knowledge
/hero id:12345
/npc message: What's the best class for gardening?

# Test quest recommendations
/quest goal:gold
/npc message: What quests give JEWEL?

# Test garden calculations
/garden lp:CRYSTAL-USDC amount:1000

# Test walkthrough (free beginner content)
/walkthrough topic:getting-started
/walkthrough topic:gardens

# Test DM mode
Send a direct message to the bot: "Hey Hedge, how do I start playing DFK?"
```

## 🎭 Character: Hedge Ledger

**Personality**: Lazy genius, DeFi savant, sarcastic NPC accountant

**Key Traits**:
- Never sells JEWEL/CRYSTAL (hoards them forever)
- Prefers delegation over work
- Witty one-liners before answers
- Uses math formulas in responses
- Self-aware about being a bot
- Helpful despite the sarcasm

**Example Response Style**:
```
User: Is CRYSTAL profitable?

Hedge: I would never sell it. In fact, any CRYSTAL you send my way 
I will never sell and you can hold me to that. <:hedge_evil:1439395005499441236>

I can't promise profit or give financial advice, but I can help you 
strategize how to grow your yields in the gardens while you play. 
You tell me your risk level; I'll crunch the boring bits.
```

## 🔧 Customization

### Modify Personality
Edit `prompt/hedge-ledger.md` to adjust:
- Tone and voice
- Response structure
- Command behaviors
- Safety rules

### Add Knowledge
See [`KNOWLEDGE_GUIDE.md`](KNOWLEDGE_GUIDE.md) for:
- Adding new knowledge files
- Updating existing information
- Integrating live data (APIs)

### Add Commands
1. Edit `register-commands.js` - add command definition
2. Edit `bot.js` - add command handler
3. Run `node register-commands.js`
4. Restart bot

## 🐛 Troubleshooting

### Bot doesn't respond to commands
- Check bot has proper permissions in Discord
- Verify commands are registered: `node register-commands.js`
- Check logs for errors

### Bot gives incorrect information
- Update knowledge files in `knowledge/`
- Restart bot to reload knowledge

### Bot won't start
- Check `.env` has all required variables
- Verify Discord token is valid
- Check OpenAI API key has credits

### "Missing DISCORD_TOKEN" error
- Make sure `.env` file exists
- Check variable names match exactly

## 📊 Dependencies

- **discord.js** v14 - Discord API wrapper
- **openai** - OpenAI API client
- **dotenv** - Environment variable management

## 📝 License

MIT

## 🙏 Credits

Built for the DeFi Kingdoms community.

Hedge Ledger character concept and personality by the project creator.

DeFi Kingdoms is developed by the DFK team.

---

*"I don't chase yield — yield chases me."* - Hedge Ledger
