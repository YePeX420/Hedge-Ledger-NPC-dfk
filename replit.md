# Hedge Ledger - DeFi Kingdoms Discord Bot

## Overview

Hedge Ledger is a Discord bot designed as an in-character NPC assistant for DeFi Kingdoms players. Embodying "Hedge Ledger, the Reluctant Accountant of Serendale," a sarcastic and brilliant character, the bot provides AI-powered responses to help players with game navigation. It integrates OpenAI's GPT-4o-mini with a comprehensive DeFi Kingdoms knowledge base and live blockchain data from the game's GraphQL API. Its primary purpose is to offer an entertaining, character-driven helper that can answer questions, analyze heroes, browse marketplace listings, and explain game mechanics through Discord.

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
    *   **Pool Analytics Cache**: A background system (`pool-cache.js`) refreshes DeFi Kingdoms pool analytics every 20 minutes, storing data in-memory for instant responses and graceful fallback to live scans.
    *   **Quick Data Fetcher**: Provides an instant response layer for DM queries, leveraging cached data with automatic fallbacks and timeout wrappers for efficiency.
    *   **Garden Analytics**: Directly interacts with the DFK Chain RPC via `ethers.js` to provide comprehensive Crystalvale garden pool analytics, including detailed APR calculations (fee, emission, hero boost), TVL breakdowns, and price graph construction from raw smart contract data.
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