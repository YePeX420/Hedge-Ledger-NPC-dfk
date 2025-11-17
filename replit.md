# Hedge Ledger - DeFi Kingdoms Discord Bot

## Overview

Hedge Ledger is a Discord bot that serves as an in-character NPC assistant for DeFi Kingdoms players. The bot embodies "Hedge Ledger, the Reluctant Accountant of Serendale" - a sarcastic, lazy genius who helps players navigate the game using AI-powered responses. The bot integrates OpenAI's GPT-4o-mini model with a comprehensive DeFi Kingdoms knowledge base and live blockchain data from the DeFi Kingdoms GraphQL API.

**Core Purpose**: Provide DeFi Kingdoms players with an entertaining, character-driven helper that can answer questions, analyze heroes, browse marketplace listings, and explain game mechanics through Discord interactions.

## User Preferences

Preferred communication style: Simple, everyday language.

## Recent Changes

**November 17, 2025 - Smart Intent Detection & Auto-Fetch System**
- Implemented intelligent DM conversation system that proactively fetches blockchain data
- Created intent-parser.js module for analyzing user questions and detecting data needs
- Created quick-data-fetcher.js for lightweight, cached data queries with timeout protection
- DM auto-fetch capabilities:
  - **Garden questions** → Automatically pulls live pool APRs, TVL, volume data
  - **Market questions** → Auto-fetches marketplace listings with price/class filtering
  - **Wallet portfolio** → Auto-fetches hero inventory and holdings
  - **Garden rewards** → Auto-fetches pending LP staking rewards (top 5 pools)
- Performance optimizations:
  - Pool list caching (5-minute TTL)
  - Timeout wrappers (30-50 second limits)
  - Targeted queries instead of full blockchain scans
  - Quick wallet checks (top 5 pools only)
- Intent separation logic:
  - "What heroes does wallet 0x... own?" → Wallet handler (hero inventory)
  - "Pending rewards 0x..." → Garden wallet handler (LP rewards)
  - "What are current APRs?" → Garden all pools handler
  - "Show me cheap wizards" → Market handler with price filtering
- Hedge now responds naturally with live data instead of telling users to use slash commands
- All data fetching wrapped in error handling with graceful fallbacks

**November 17, 2025 - Web Analytics Dashboard**
- Built comprehensive web-based admin dashboard accessible at http://localhost:5000
- Dashboard displays real-time metrics: total players, JEWEL deposits, revenue, query usage
- Four API endpoints for analytics: /api/analytics/overview, /players, /deposits, /query-breakdown
- Simple HTML + vanilla JavaScript frontend (no build step required)
- Auto-refreshes every 30 seconds to show live data
- Integrated Express server directly into bot.js for unified deployment
- Dashboard shows: player tiers, balance details, deposit statuses, query type breakdowns

**November 17, 2025 - Economic System Integration**
- Fixed transaction monitor ABI issue by adding ERC-20 Transfer event to ERC20.json
- Wired up balance credit callback - monitor now calls creditBalance() when deposits are matched
- Enhanced deposit matching with 3-level strategy: exact uniqueAmount, exact requestedAmount, ±1 wei tolerance
- Added HTTP health check server on port 5000 for workflow compliance
- Implemented graceful shutdown handling (SIGINT)
- All economic modules updated to use .ts imports with tsx runtime
- Commands registered: /deposit (unique JEWEL amounts), /balance (tier/usage)
- Transaction monitor operational in polling mode after 48h catch-up scan

**November 16, 2025 - Comprehensive Garden Analytics (Crystalvale) - FINAL**
- Implemented full on-chain analytics for Crystalvale garden pools
- **Factory Enumeration**: ALL LP pairs from UniswapV2Factory (0x794C...) for accurate token pricing
- **UTC Day Timeframe**: APRs calculated from previous UTC day (00:00-23:59 yesterday) for consistency
- **Rapid Renewal**: Best hero APR includes 1.43x frequency multiplier from Rapid Renewal power-up
- 24h fee APR calculation from Swap event logs (denominator: total pool TVL)
- 24h harvesting APR calculation from RewardCollected events (denominator: V2 TVL only)
- Gardening quest APR range: 0% (worst hero) to ~87% (best hero with Rapid Renewal)
- On-chain USD price graph using BFS propagation from USDC anchor across ALL pairs
- V1/V2/Total TVL breakdown (legacy staking vs current staking)
- Zero external API dependencies - 100% RPC + smart contract queries
- `/garden pool:all` shows comprehensive APR data for all pools
- `/garden pool:<pid>` shows detailed analytics with hero boost calculations
- `/garden wallet:<address>` shows harvestable CRYSTAL rewards

## System Architecture

### Application Type
Node.js backend service with Discord.js integration and web-based admin dashboard. User interactions happen within Discord, while admin monitoring happens through the web interface.

### Core Components

**1. Discord Bot Layer** (`bot.js`)
- Discord.js client with gateway intents for DMs and guild messages
- Slash command registration and handling
- Auto-onboarding system (DMs new members on join)
- Free-form DM conversation support with intelligent auto-detection:
  - **Garden/pool questions** - Auto-fetches live pool APRs, TVL, and volume data
  - **Market questions** - Auto-fetches marketplace listings with class/price filtering
  - **Wallet portfolio** - Auto-fetches hero inventory by wallet address
  - **Garden rewards** - Auto-fetches pending LP staking rewards
  - **Hero ID mentions** - Automatically fetches blockchain data when hero IDs are mentioned (e.g., "What class is hero #62?")
- Proactive data fetching using intent-parser.js and quick-data-fetcher.js modules
- Integrates on-chain data module for live blockchain queries

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

**Intent Detection** (`intent-parser.js`):
- Analyzes DM messages to determine user intent and data needs
- Separates garden queries (APRs, pools, rewards) from wallet queries (hero inventory)
- Parses specific parameters like pool names, hero classes, wallet addresses
- Routes questions to appropriate data handlers

**Quick Data Fetcher** (`quick-data-fetcher.js`):
- Lightweight data fetching module for DM responses
- Cached pool list (5-minute TTL) to avoid repeated blockchain queries
- Timeout wrappers for all analytics calls (30-50 second limits)
- Fast pool lookup by name without heavy blockchain scans
- Quick wallet rewards check (top 5 pools only for speed)
- Proper marketplace filtering with price and sort options

**Garden Analytics** (`garden-analytics.js`):
- Direct smart contract integration via ethers.js
- Connects to DFK Chain RPC (Crystalvale)
- LP Staking contract: `0xB04e8D6aED037904B77A9F0b08002592925833b7`
- UniswapV2 Factory: `0x794C07912474351b3134E6D6B3B7b3b4A07cbAAa`
- Functions:
  - `enumerateAllPairs()` - Enumerates ALL LP pairs from factory (not just staked)
  - `discoverPools()` - Auto-discovers staked pools via `getPoolLength()` / `getPoolInfo()`
  - `getLPTokenDetails()` - Analyzes LP tokens (token0/token1/reserves/totalSupply)
  - `buildPriceGraph()` - BFS price propagation from USDC across ALL pairs
  - `getPreviousUTCDayBlockRange()` - Binary search for previous UTC day block range
  - `calculate24hFeeAPR()` - Scans Swap events for volume/fees (previous UTC day)
  - `calculateEmissionAPR()` - Scans RewardCollected events for CRYSTAL emissions (previous UTC day)
  - `calculateGardeningQuestAPR()` - Calculates hero boost APR range with Rapid Renewal
  - `calculateTVL()` - Computes V1/V2/Total TVL from reserves + prices
  - `getPoolAnalytics()` - Full analytics for single pool with shared data optimization
  - `getAllPoolAnalytics()` - Batch analytics (optimized to avoid redundant RPC calls)

**4. Web Dashboard** (`bot.js` + `public/index.html`)
- Express server integrated directly into bot.js on port 5000
- Serves static HTML dashboard at root path (`/`)
- API endpoints for analytics data:
  - `/api/analytics/overview` - High-level metrics (players, deposits, revenue, queries)
  - `/api/analytics/players?limit=N` - Player list with tiers and balances
  - `/api/analytics/deposits?limit=N` - Recent deposits with status
  - `/api/analytics/query-breakdown` - Query types with revenue data
- Dashboard features:
  - Real-time metrics grid (total players, JEWEL deposits, revenue, queries)
  - Player table showing username, tier, and balance
  - Deposit history with status badges (completed/pending)
  - Query breakdown by type with free tier usage and revenue
  - Auto-refresh every 30 seconds
- Simple vanilla JavaScript implementation (no build process)

**5. Command System** (`register-commands.js`)
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