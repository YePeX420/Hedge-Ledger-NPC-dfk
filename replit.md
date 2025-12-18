# Hedge Ledger - DeFi Kingdoms Discord Bot

## Overview
Hedge Ledger is an AI-powered Discord bot designed as an in-character NPC assistant for DeFi Kingdoms players in Crystalvale. Its primary purpose is to enhance player experience by providing assistance with in-game navigation, answering questions, analyzing heroes, browsing marketplace listings, explaining game mechanics, and offering a premium garden LP yield optimization service. The bot leverages AI (GPT-4o-mini) with a specialized game knowledge base and live blockchain data.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
The project is built with a Node.js backend using Discord.js for bot functionalities and an Express server for an admin dashboard.

**Core Components:**
*   **Discord Bot Layer**: Manages Discord interactions and slash commands.
*   **AI Response System**: Integrates OpenAI's GPT-4o-mini for AI-driven responses, character personality, game knowledge, and multilingual support.
*   **Blockchain Integration**: Utilizes DeFi Kingdoms GraphQL API for game data and `ethers.js` for direct DFK Chain RPC interactions (e.g., garden analytics, hero quest status).
*   **Web Dashboard**: A React-based admin dashboard with Vite, Discord OAuth, user management, expenses tracking, and multi-wallet support, styled with TailwindCSS and shadcn/ui.
*   **Command System**: Implements core commands for garden optimization and portfolio analysis.
*   **Hero Systems**: Includes Hero Genetics decoding, Breeding Charts, and Summoning Probability Calculator.
*   **Tavern Bargain Finder**: Scans the marketplace for optimal hero pairs for summoning.
*   **Player User Model System**: Classifies players for personalized responses and smurf detection.
*   **Smurf Detection & League Signup System**: Manages competitive leagues with multi-account and power snapshot features.
*   **Challenge/Achievement System**: A gamified progression system with an ETL subsystem for metric extraction and progress computation across various categories (e.g., Hero Progression, Economy, Professions). This includes a Tier Calibration Panel for data-driven threshold tuning and ETL schedulers for automatic updates.
*   **Combat Ingestion**: Direct RPC log scanning for hunting encounters and PvP matches from DFK Chain and METIS chains.
*   **Bridge Flow Tracker (Admin-only)**: Analyzes cross-chain bridge activity to identify "extractors."
*   **Extractor Analysis Dashboard**: Identifies wallets with net negative value flow.
*   **Bridge Pricing Reconciliation System**: Ensures accurate USD valuation for all bridge events.
*   **Value Allocation/TVL Dashboard**: Calculates accurate Total Value Locked (TVL) using staked LP amounts and DefiLlama prices.
*   **Token Registry System**: Manages token metadata, syncing known DFK tokens and supporting RouteScan scraping.
*   **Unified Pool Indexer System**: Tracks LP staking positions across Master Gardener V1 and V2 contracts with dynamic parallel workers and work-stealing for efficiency.
*   **Jeweler Indexer System**: Tracks cJEWEL staking positions, calculates APR, and provides leaderboards.
*   **Gardening Quest Rewards Indexer**: Tracks CRYSTAL/JEWEL earned per hero from gardening quests.
*   **Harmony Pool Indexer**: Tracks legacy Serendale JEWEL-ONE LP staking on the Harmony chain.
*   **Level Racer - Class Arena Edition**: A competitive hero leveling game with configurable rules.
*   **Leaderboard System**: Provides snapshot-based and historical rankings.
*   **Season Engine**: Manages challenge passes and seasonal progression.

**Design Decisions:**
*   **Database**: PostgreSQL with Drizzle ORM, hosted on Neon serverless for cost optimization.
*   **Deployment**: Unified Express server integrated with the bot.
*   **UI/UX**: Responsive React admin dashboard with theming and environment indicators.
*   **Authentication**: Discord OAuth2.
*   **Payment Automation**: Blockchain monitoring for JEWEL payment verification.
*   **Wallet Tracking**: Daily snapshots of key token balances.
*   **Environment-Aware Indexers**: Indexers auto-start only in production, requiring manual trigger in development.

## External Dependencies
*   **Discord API**: For bot operations and OAuth2 authentication.
*   **OpenAI API**: Utilizes GPT-4o-mini for AI-driven conversational responses.
*   **DeFi Kingdoms GraphQL API**: For accessing in-game data and analytics.
*   **DFK Chain RPC (Crystalvale)**: For direct blockchain interaction and data retrieval.
*   **NPM Packages**: Key packages include `discord.js`, `openai`, `graphql-request`, `dotenv`, `graphql`, and `ethers.js`.