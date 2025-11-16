# Hedge Ledger - DeFi Kingdoms Discord Bot

## Overview

Hedge Ledger is a Discord bot that serves as an in-character NPC assistant for DeFi Kingdoms players. The bot embodies "Hedge Ledger, the Reluctant Accountant of Serendale" - a sarcastic, lazy genius who helps players navigate the game using AI-powered responses. The bot integrates OpenAI's GPT-4o-mini model with a comprehensive DeFi Kingdoms knowledge base and live blockchain data from the DeFi Kingdoms GraphQL API.

**Core Purpose**: Provide DeFi Kingdoms players with an entertaining, character-driven helper that can answer questions, analyze heroes, browse marketplace listings, and explain game mechanics through Discord interactions.

## User Preferences

Preferred communication style: Simple, everyday language.

## Recent Changes

**November 16, 2025 - Comprehensive Garden Analytics (Crystalvale)**
- Implemented full on-chain analytics for Crystalvale garden pools
- Automated pool discovery via smart contract queries (no static lists)
- 24h fee APR calculation from Swap event logs
- Emission APR calculation from RewardCollected events
- On-chain USD price graph using BFS propagation from USDC anchor
- TVL calculation from reserves + token prices
- Zero external API dependencies - 100% RPC + smart contract queries
- `/garden pool:all` shows comprehensive APR data for all pools
- `/garden pool:<pid>` shows detailed analytics for specific pool
- `/garden wallet:<address>` shows harvestable CRYSTAL rewards

## System Architecture

### Application Type
Node.js backend service with Discord.js integration. No frontend UI - all interactions happen within Discord's native interface.

### Core Components

**1. Discord Bot Layer** (`bot.js`)
- Discord.js client with gateway intents for DMs and guild messages
- Slash command registration and handling
- Auto-onboarding system (DMs new members on join)
- Free-form DM conversation support with auto-detection of hero ID mentions
- Integrates on-chain data module for live blockchain queries
- Smart DM handler: automatically fetches blockchain data when hero IDs are mentioned (e.g., "What class is hero #62?")

**2. AI Response System**
- OpenAI GPT-4o-mini integration for conversational responses
- Character personality defined in `prompt/hedge-ledger.md`
- Knowledge base injection from 4 markdown files in `knowledge/` directory:
  - `heroes.md` - Hero classes, stats, professions, leveling
  - `quests.md` - Mining, gardening, fishing, foraging, training quests
  - `gardens.md` - Liquidity pools, staking, APR calculations
  - `ui-navigation.md` - Game UI walkthroughs and navigation guides
- System prompt + knowledge base loaded at startup and prepended to all AI requests

**3. Blockchain Integration**

**GraphQL Integration** (`onchain-data.js`):
- GraphQL client connecting to DeFi Kingdoms public API (`api.defikingdoms.com/graphql`)
- No authentication required (public endpoint)
- Functions for querying:
  - Individual hero data by ID
  - Hero search by class/profession/price
  - Marketplace listings
  - Wallet portfolio analysis
  - Market statistics
- Helper utilities for token conversion (wei to JEWEL/CRYSTAL) and hero ID normalization

**Garden Analytics** (`garden-analytics.js`):
- Direct smart contract integration via ethers.js
- Connects to DFK Chain RPC (Crystalvale)
- LP Staking contract: `0xB04e8D6aED037904B77A9F0b08002592925833b7`
- Functions:
  - `discoverPools()` - Auto-discovers pools via `getPoolLength()` / `getPoolInfo()`
  - `getLPTokenDetails()` - Analyzes LP tokens (token0/token1/reserves/totalSupply)
  - `buildPriceGraph()` - BFS price propagation from USDC anchor
  - `calculate24hFeeAPR()` - Scans Swap events for volume/fees
  - `calculateEmissionAPR()` - Scans RewardCollected events for CRYSTAL emissions
  - `calculateTVL()` - Computes total value locked from reserves + prices
  - `getPoolAnalytics()` - Full analytics for single pool
  - `getAllPoolAnalytics()` - Batch analytics (optimized to avoid redundant RPC calls)

**4. Command System** (`register-commands.js`)
Ten slash commands registered to Discord API:
- `/help` - List all commands
- `/npc` - Free-form chat with Hedge
- `/hero` - Get live hero data from blockchain
- `/market` - Browse marketplace listings
- `/lookup` - Advanced hero search
- `/wallet` - Analyze wallet portfolio
- `/garden` - **Comprehensive pool analytics for Crystalvale** (fee APR, emission APR, TVL, 24h volume)
- `/quest` - Quest recommendations (knowledge-based)
- `/stats` - Portfolio summary (legacy)
- `/walkthrough` - Beginner tutorials (knowledge-based)

### Data Flow Architecture

**Slash Commands:**
```
/hero 62 → bot.js → onchain-data.js → GraphQL API → Format → OpenAI → Reply
```

**DM with Hero Mention:**
```
"What class is hero #62?" 
  ↓
DM handler detects regex pattern (/(?:hero\s*#?|#)(\d{1,6})\b/gi)
  ↓
Auto-fetch blockchain data (up to 3 heroes)
  ↓
Enrich AI prompt with live stats
  ↓
OpenAI responds in Hedge's voice with real data
  ↓
Discord message reply
```

**Generic DM (no hero mention):**
```
"What are the best quests?" → askHedge() → OpenAI → Reply
```

### Environment Configuration
Required environment variables:
- `DISCORD_TOKEN` - Bot authentication
- `DISCORD_CLIENT_ID` - Application ID for command registration
- `DISCORD_GUILD_ID` - Server ID for guild-specific commands
- `OPENAI_API_KEY` - OpenAI API authentication
- `OPENAI_MODEL` - AI model selection (defaults to gpt-4o-mini)
- `HEDGE_PROMPT_PATH` - Path to character prompt file

### File Structure Strategy
- Root level: Bot entry point and command registration
- `knowledge/` - Static game data (markdown files)
- `prompt/` - AI character definition
- `client/` - Unused Vite/React scaffolding (legacy from template)
- `server/` - Unused Express backend (legacy from template)
- `shared/` - Unused schema definitions (legacy from template)

### Design Decision: No Database
Currently uses in-memory state only. No persistent storage for:
- User preferences
- Conversation history
- Analytics/metrics

This is a stateless bot design - each interaction is independent. The Drizzle ORM configuration exists in the codebase but is not utilized by the bot functionality.

## External Dependencies

### Third-Party APIs
1. **Discord API** (via discord.js v14.17.3)
   - Provides bot gateway connection, command registration, message handling
   - Uses Partials for DM support
   - Gateway intents: Guilds, GuildMessages, DirectMessages, MessageContent

2. **OpenAI API** (via openai v4.56.0)
   - Model: GPT-4o-mini
   - Handles character-driven AI responses
   - Receives concatenated system prompt + knowledge base + user query

3. **DeFi Kingdoms GraphQL API**
   - Endpoint: `https://api.defikingdoms.com/graphql`
   - Public access (no authentication)
   - Queried via graphql-request v7.3.3
   - Returns live blockchain data for heroes, marketplace, wallets

4. **DFK Chain RPC (Crystalvale)**
   - Endpoint: `https://subnets.avax.network/defi-kingdoms/dfk-chain/rpc`
   - Public access (no authentication)
   - Direct smart contract interaction via ethers.js v6.x
   - Used for garden pool analytics (APR, TVL, volume, fees, emissions)
   - Scans event logs for 24h Swap and RewardCollected events

### Key NPM Packages
- `discord.js` - Discord bot framework
- `openai` - OpenAI API client
- `graphql-request` - Lightweight GraphQL client
- `dotenv` - Environment variable management

### Unused Dependencies
The repository contains a full-stack Vite + React + Express template with Drizzle ORM and shadcn/ui components, but none of these are used by the bot. The actual application is purely a Node.js Discord bot with no web interface, database, or frontend.