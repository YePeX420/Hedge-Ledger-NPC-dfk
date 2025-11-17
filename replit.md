# Hedge Ledger - DeFi Kingdoms Discord Bot

## Overview

Hedge Ledger is a Discord bot designed as an in-character NPC assistant for DeFi Kingdoms players. Embodying "Hedge Ledger, the Reluctant Accountant of Serendale," a sarcastic and brilliant character, the bot provides AI-powered responses to help players with game navigation. It integrates OpenAI's GPT-4o-mini with a comprehensive DeFi Kingdoms knowledge base and live blockchain data from the game's GraphQL API. Its primary purpose is to offer an entertaining, character-driven helper that can answer questions, analyze heroes, browse marketplace listings, and explain game mechanics through Discord, with a current focus on Crystalvale gameplay. The project aims to be the definitive Crystalvale navigation assistant, providing free, comprehensive game interface guidance to new players.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

The project is a Node.js backend service leveraging Discord.js for bot functionality and an integrated Express server for a web-based admin dashboard.

**Core Components:**

*   **Discord Bot Layer**: Handles Discord interactions (slash commands, free-form DMs, auto-onboarding) and intelligently detects user intent to fetch and present blockchain data.
*   **AI Response System**: Integrates OpenAI's GPT-4o-mini, configured with a distinct character personality (`prompt/hedge-ledger.md`) and a comprehensive knowledge base (`knowledge/` directory) covering heroes, quests, gardens, and UI navigation, with explicit multilingual support.
*   **Blockchain Integration**:
    *   **GraphQL Integration**: Utilizes `graphql-request` to connect to the public DeFi Kingdoms GraphQL API for hero data, marketplace listings, and wallet analysis.
    *   **Intent Detection**: The `intent-parser.js` module analyzes DM messages for user intent and routes queries.
    *   **Pool Analytics Cache**: A background system (`pool-cache.js`) refreshes DeFi Kingdoms pool analytics every 20 minutes, storing data in-memory and providing graceful fallbacks.
    *   **Quick Data Fetcher**: Provides an instant response layer for DM queries, leveraging cached data with automatic fallbacks and timeout wrappers.
    *   **Garden Analytics**: Directly interacts with the DFK Chain RPC via `ethers.js` for comprehensive Crystalvale garden pool analytics, including APR calculations, TVL breakdowns, and price graph construction from raw smart contract data, using chunked event log queries.
*   **Web Dashboard**: An Express server integrated into `bot.js` hosts a static HTML dashboard displaying real-time metrics and an admin user management system.
*   **Command System**: Ten slash commands are registered with Discord for core functionalities.

**Design Decisions:**

*   **Stateless Bot**: The system currently uses in-memory state only, lacking persistent storage for user preferences, conversation history, or analytics.
*   **No Database**: While Drizzle ORM configuration exists, no database is actively used by the bot's functionality.
*   **Unified Deployment**: The Express server for the dashboard is integrated directly into the main `bot.js` file.
*   **UI/UX**: The admin dashboard uses pure HTML/CSS/JavaScript, no build step required, responsive design with dark theme matching the main dashboard.
*   **Feature Specifications**: Includes a comprehensive NPC navigation system covering all 37 Crystalvale NPCs across 14 locations, multilingual support across 50+ languages, and enhanced garden interaction features such as APR range display and deprecated pool filtering.

## External Dependencies

1.  **Discord API**: Accessed via `discord.js` for bot operations.
2.  **OpenAI API**: Utilizes `openai` with the `GPT-4o-mini` model for AI-driven conversational responses.
3.  **DeFi Kingdoms GraphQL API**: Public endpoint `https://api.defikingdoms.com/graphql`, queried using `graphql-request`.
4.  **DFK Chain RPC (Crystalvale)**: Public endpoint `https://subnets.avax.network/defi-kingdoms/dfk-chain/rpc`, accessed directly via `ethers.js` for smart contract interactions and event log scanning.
5.  **NPM Packages**: Key packages include `discord.js`, `openai`, `graphql-request`, and `dotenv`.