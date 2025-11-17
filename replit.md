# Hedge Ledger - DeFi Kingdoms Discord Bot

## Overview

Hedge Ledger is a Discord bot designed as an in-character NPC assistant for DeFi Kingdoms players. Embodying "Hedge Ledger, the Reluctant Accountant of Serendale," a sarcastic and brilliant character, the bot provides AI-powered responses to help players with game navigation. It integrates OpenAI's GPT-4o-mini with a comprehensive DeFi Kingdoms knowledge base and live blockchain data from the game's GraphQL API. Its primary purpose is to offer an entertaining, character-driven helper that can answer questions, analyze heroes, browse marketplace listings, and explain game mechanics through Discord.

## Recent Changes

**November 17, 2025 - DM Response Formatting Improvements**
- **Pool Display Format**: Removed PID numbers from all pool listings and details. Pool entries now show clean inline format: "CRYSTAL-WJEWEL - 2.50% Fee APR - 5.21% Distribution APR" for improved readability.
- **AI Response Quality**: Updated all DM response prompts (garden summary, pool detail, wallet rewards, marketplace, wallet portfolio) to explicitly forbid "What to Consider" sections and slash command references, which don't work in DMs. This ensures concise, actionable responses without confusing suggestions.
- **Intent Parser**: Fixed bug where "show me pool garden APRs" was incorrectly parsed as searching for a pool named "garden APRs". Added generic keyword filtering to prevent common words (garden, apr, yields, etc.) from being misidentified as pool names.
- **Field Name Mismatches**: Fixed critical data structure mismatch where bot code was accessing wrong field names from cached pool analytics (lpTokenSymbol→pairName, feeAPR→fee24hAPR, emissionAPR→harvesting24hAPR, tvlUSD→totalTVL). This was causing "undefined" values in DM responses.
- **Pool Name Search**: Enhanced pool search with fuzzy matching to handle token name variations. "Crystal-Jewel" now correctly finds "CRYSTAL-WJEWEL" pool by normalizing JEWEL/WJEWEL as equivalent.
- **Wallet Rewards**: Fixed fallback path to fetch real LP token names via getLPTokenDetails instead of showing "Pool <pid>" when cache unavailable.
- **Quest APR Rendering**: Fixed potential "undefined - undefined" display by checking for valid worst/best values before rendering quest APR line.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

The project is a Node.js backend service leveraging Discord.js for bot functionality and an integrated Express server for a web-based admin dashboard.

**Core Components:**

1.  **Discord Bot Layer**: Handles Discord interactions, including slash commands, free-form DM conversations, and an auto-onboarding system. It intelligently detects user intent to proactively fetch and present blockchain data for various queries (Gardens, Marketplace, Wallet, Hero IDs).
2.  **AI Response System**: Integrates OpenAI's GPT-4o-mini, configured with a distinct character personality (`prompt/hedge-ledger.md`) and a comprehensive knowledge base (`knowledge/` directory) covering heroes, quests, gardens, and UI navigation.
3.  **Blockchain Integration**:
    *   **GraphQL Integration**: Utilizes `graphql-request` to connect to the public DeFi Kingdoms GraphQL API for querying hero data, marketplace listings, and wallet analysis.
    *   **Intent Detection**: The `intent-parser.js` module analyzes DM messages to determine user intent, parse parameters, and route queries to appropriate data handlers.
    *   **Pool Analytics Cache**: A background system (`pool-cache.js`) refreshes DeFi Kingdoms pool analytics every 20 minutes, storing data in-memory for instant responses and graceful fallback to live scans. Includes comprehensive progress tracking with 5-stage initialization, pool-by-pool progress indicators, historical timing data (rolling 10-refresh average), and performance alerts for slow refreshes (>50% regression).
    *   **Quick Data Fetcher**: Provides an instant response layer for DM queries, leveraging cached data with automatic fallbacks and timeout wrappers for efficiency.
    *   **Garden Analytics**: Directly interacts with the DFK Chain RPC via `ethers.js` to provide comprehensive Crystalvale garden pool analytics, including detailed APR calculations (fee, emission, hero boost), TVL breakdowns, and price graph construction from raw smart contract data. Uses chunked event log queries (2048-block segments) to respect RPC provider limits when scanning large block ranges.
4.  **Web Dashboard**: An Express server integrated into `bot.js` hosts a static HTML dashboard displaying real-time metrics such as total players, JEWEL deposits, revenue, and query usage via several API endpoints.
5.  **Command System**: Ten slash commands are registered with Discord for core functionalities like `/hero`, `/market`, `/wallet`, and `/garden`.

**Design Decisions:**

*   **Stateless Bot**: The system currently uses in-memory state only, lacking persistent storage for user preferences, conversation history, or analytics. Each interaction is independent.
*   **No Database**: While Drizzle ORM configuration exists, no database is actively used by the bot's functionality.
*   **Unified Deployment**: The Express server for the dashboard is integrated directly into the main `bot.js` file.

## External Dependencies

1.  **Discord API**: Accessed via `discord.js` (v14.17.3) for bot operations.
2.  **OpenAI API**: Utilizes `openai` (v4.56.0) with the `GPT-4o-mini` model for AI-driven conversational responses.
3.  **DeFi Kingdoms GraphQL API**: Public endpoint `https://api.defikingdoms.com/graphql`, queried using `graphql-request` (v7.3.3).
4.  **DFK Chain RPC (Crystalvale)**: Public endpoint `https://subnets.avax.network/defi-kingdoms/dfk-chain/rpc`, accessed directly via `ethers.js` (v6.x) for smart contract interactions and event log scanning.
5.  **NPM Packages**: Key packages include `discord.js`, `openai`, `graphql-request`, and `dotenv`.

## Infrastructure Setup (Future Reference)

### Self-Hosted RPC Node

The bot currently uses the public DFK Chain RPC endpoint. For improved performance, reliability, and higher rate limits, a dedicated RPC node can be set up using the following resources:

**Setup Resources:**
- **Avalanche Node Installation**: [https://build.avax.network/docs/nodes/using-install-script/installing-avalanche-go](https://build.avax.network/docs/nodes/using-install-script/installing-avalanche-go)
- **DFK Subnet Specification**: [https://raw.githubusercontent.com/pokt-foundation/avalanche-subnets/master/dfk.pdf](https://raw.githubusercontent.com/pokt-foundation/avalanche-subnets/master/dfk.pdf)

**Benefits of Self-Hosted RPC:**
- Lower latency for blockchain queries
- No rate limiting from public endpoints
- More reliable uptime and performance
- Better control over caching and optimization

**Current Status:** Using public RPC endpoint `https://subnets.avax.network/defi-kingdoms/dfk-chain/rpc` with chunked event log queries to respect provider limits.