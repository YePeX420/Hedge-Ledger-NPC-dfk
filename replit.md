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
*   **PVE Drop Rate Indexer**: Multi-chain indexer for Hunts (DFK Chain, chainId 53935) and Patrols (Metis, chainId 1088) that calculates base drop rates using the formula: `baseRate = observedRate - (0.0002 × partyLCK) - scavengerBonus`. Features:
    - Auto-initializing database tables (pve_activities, pve_loot_items, pve_completions, pve_reward_events, pve_indexer_checkpoints)
    - Scavenger pet detection: Combat bonus IDs 60 (common), 139 (rare), 219 (mythic) provide 10-25% loot bonus based on combatBonusScalar
    - Only Scavenger combat bonus affects loot drop rates (other combat bonuses are for PvP combat stats)
    - Wilson score confidence intervals for drop rate estimates
    - Public API: GET /api/pve/status, /hunts, /patrols, /loot/:activityId, /estimate
    - Admin API: POST /api/admin/pve/start/:chain, /stop/:chain, /reset/:chain
*   **Bridge Flow Tracker (Admin-only)**: Analyzes cross-chain bridge activity to identify "extractors."
*   **Extractor Analysis Dashboard**: Identifies wallets with net negative value flow.
*   **Bridge Pricing Reconciliation System**: Ensures accurate USD valuation for all bridge events.
*   **Value Allocation/TVL Dashboard**: Calculates accurate Total Value Locked (TVL) using staked LP amounts and DefiLlama prices. Includes CEX liquidity monitoring with order-book depth analysis from KuCoin, Gate.io, and MEXC (±2% band). Features JEWEL tokenomics tracking with supply metrics from official DFK API (supply.defikingdoms.com). **Coverage KPI** (currently 41.68%) tracks JEWEL across categories:
    - **Locked**: cJEWEL staking + sJEWEL (Kaia) + system contracts (~18M JEWEL)
    - **Pooled**: Full LP reserves across DFK, Harmony, Kaia, Metis chains (~23M JEWEL in 14 pools)
    - **Burned**: Official DFK API burned supply (~5.4M JEWEL)
    - **Team Wallets**: Verified DFK team multisigs and known wallets (Fund Multisigs, Gas Station, Multi-Sigs, Private Wallets)
    - **Multi-Chain Bridges**: Liquid JEWEL in Synapse bridge wallets on Harmony, Kaia, Metis
    - **Note**: Bridge contracts on DFK Chain (~19M in Synapse) tracked for reference but excluded from coverage to avoid double-counting with multi-chain balances.
    - **Liquid**: Remaining ~52% is in player wallets, CEX accounts - expected for circulating supply.
*   **Token Registry System**: Manages token metadata, syncing known DFK tokens and supporting RouteScan scraping.
*   **Unified Pool Indexer System**: Tracks LP staking positions across Master Gardener V1 and V2 contracts with dynamic parallel workers and work-stealing for efficiency.
*   **Jeweler Indexer System**: Tracks cJEWEL staking positions, calculates APR, and provides leaderboards.
*   **Gardening Quest Rewards Indexer**: Tracks CRYSTAL/JEWEL earned per hero from gardening quests with pool value snapshots for yield validation. Features:
    - Pool value snapshot fields (heroLpStake, poolTotalLp, lpTokenPrice) captured at reward time
    - 5 parallel workers with work-stealing for fast historical scanning
    - Reset-to-block functionality for scanning last N blocks (e.g., last 1M blocks)
    - Admin API: GET /api/admin/gardening-quest/status, /hero/:heroId, /player/:player, /pool/:poolId
    - Admin API: POST /api/admin/gardening-quest/trigger, /auto-run, /reset, /reset-to-block
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