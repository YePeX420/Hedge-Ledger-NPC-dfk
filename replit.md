# Hedge Ledger - DeFi Kingdoms Discord Bot

## Overview
Hedge Ledger is a Discord bot designed as an in-character NPC assistant for DeFi Kingdoms players in Crystalvale. It uses AI (GPT-4o-mini) with a specialized game knowledge base and live blockchain data to assist with in-game navigation, answer questions, analyze heroes, browse marketplace listings, and explain game mechanics. The bot aims to enhance player experience by providing valuable insights and offering a premium garden LP yield optimization service.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
The project utilizes a Node.js backend with Discord.js for bot functionalities and an Express server for an admin dashboard.

**Core Components:**
*   **Discord Bot Layer**: Manages all Discord interactions, including slash commands.
*   **AI Response System**: Integrates OpenAI's GPT-4o-mini with a specific character personality, game knowledge base, and multilingual support.
*   **Blockchain Integration**: Accesses DeFi Kingdoms GraphQL API for game data and uses `ethers.js` for direct DFK Chain RPC interaction for advanced analytics (e.g., garden pool analytics, LP token detection, yield calculations, hero quest status, pet bonuses).
*   **Web Dashboard**: A React-based admin dashboard with Vite, Discord OAuth, user management, expenses tracking, and settings, styled with TailwindCSS and shadcn/ui, supporting multi-wallet management.
*   **Command System**: Implements core slash commands for garden optimization and portfolio analysis (`optimize-gardens`, `garden-planner`, `garden-portfolio`).
*   **Hero Systems**: Includes Hero Genetics System (decoding `statGenes`, `visualGenes`), Breeding Chart System, and Hero Summoning Probability Calculator.
*   **Tavern Bargain Finder**: Scans the marketplace for hero pairs with optimal genetics and pricing for specific class summoning.
*   **Player User Model System**: Classifies players into archetypes for personalized bot responses and smurf detection.
*   **Smurf Detection & League Signup System**: Manages competitive leagues with multi-account detection, power snapshots, and rule-based smurf identification.
*   **Challenge/Achievement System**: A gamified progression system with categories and challenges, utilizing an ETL subsystem for metric extraction and progress computation.
    - ETL Scheduler (`src/etl/scheduler/etlScheduler.ts`): Runs automatically every 6 hours for incremental updates and daily at 04:00 UTC for full snapshots
    - Admin refresh button on `/admin/challenges` page for manual ETL triggers
    - API endpoints: `GET /api/admin/etl/status`, `POST /api/admin/etl/trigger`
*   **Phase 3 Combat Ingestion**: Direct RPC log scanning for hunting encounters and PvP matches:
    - `src/etl/ingestion/huntingIndexer.ts`: Indexes hunting events from DFK Chain
    - `src/etl/ingestion/pvpIndexer.ts`: Indexes PvP matches from DFK and METIS chains
    - `src/config/combatContracts.ts`: Contract addresses and event signatures (requires configuration)
    - Tables: `hunting_encounters`, `pvp_matches`, `ingestion_state` for checkpoint tracking
    - Challenge extractors wired: 5 hunting challenges, 4 PvP challenges
*   **Bridge Flow Tracker (Admin-only)**: Analyzes cross-chain bridge activity to identify "extractors" via indexed bridge events and wallet scoring.
*   **Value Allocation/TVL Dashboard** (`src/analytics/valueBreakdown.ts`): Calculates accurate TVL by:
    - Querying staked LP amounts from Master Gardener V2 (`getPoolInfo`) and V1 (legacy gardener `balanceOf`)
    - Computing LP value as: `(stakedLP / totalSupply) × poolReserveValue` 
    - Using DefiLlama prices for token valuation with fallback prices
    - Sequential RPC requests with 100ms throttling to avoid rate limiting
*   **Level Racer - Class Arena Edition**: A competitive hero leveling game with configurable rules, entry fees, prizes, and a state machine for managing races.
*   **Leaderboard System**: Provides snapshot-based rankings with historical tracking across various time windows, scoring players based on defined metrics.
*   **Season Engine**: Manages challenge passes with weighted scoring and seasonal progression, calculating player points and levels.

**Design Decisions:**
*   **Database**: PostgreSQL with Drizzle ORM.
*   **Deployment**: Unified Express server integrated with the bot.
*   **UI/UX**: Responsive React admin dashboard with dark/light theme.
*   **Authentication**: Discord OAuth2.
*   **Payment Automation**: Blockchain monitoring for JEWEL payment verification.
*   **Wallet Tracking**: Daily snapshots of JEWEL, CRYSTAL, and cJEWEL balances.
*   **Debug Features**: Includes a debug dashboard for testing, with an OAuth bypass for development (never enabled in production).

## External Dependencies
*   **Discord API**: For bot operations and OAuth2.
*   **OpenAI API**: Specifically GPT-4o-mini for AI-driven conversational responses.
*   **DeFi Kingdoms GraphQL API**: For accessing in-game data.
*   **DFK Chain RPC (Crystalvale)**: For direct blockchain interactions.
*   **NPM Packages**: `discord.js`, `openai`, `graphql-request`, `dotenv`, `graphql`, `ethers.js`.