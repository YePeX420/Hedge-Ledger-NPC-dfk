# Hedge Ledger - DeFi Kingdoms Discord Bot

## Overview
Hedge Ledger is a Discord bot designed as an in-character NPC assistant for DeFi Kingdoms players, specifically for Crystalvale. It leverages AI (GPT-4o-mini) with a specialized game knowledge base and live blockchain data to provide comprehensive in-game navigation, answer questions, analyze heroes, browse marketplace listings, and explain game mechanics. The bot offers free guidance and a premium garden LP yield optimization service, aiming to be the definitive Crystalvale navigation assistant, enhancing player experience and offering valuable economic insights.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
The project uses a Node.js backend with Discord.js for bot functionalities and an Express server for an admin dashboard.

**Core Components:**
*   **Discord Bot Layer**: Manages Discord interactions, including slash commands.
*   **AI Response System**: Integrates OpenAI's GPT-4o-mini with a specific character personality, game knowledge base, and multilingual support.
*   **Blockchain Integration**:
    *   **GraphQL Integration**: Accesses DeFi Kingdoms GraphQL API for hero, marketplace, and wallet data.
    *   **DFK Chain RPC Interaction**: Uses `ethers.js` for direct interaction with DFK Chain RPC for Crystalvale garden pool analytics, LP token detection, and smart contract data.
    *   **Pool Analytics & Wallet LP Token Detection**: Caches pool analytics and scans user wallets for staked LP tokens.
    *   **Quest Decoders & Hero Grouping**: Decodes hero `currentQuest` data to detect gardening status, groups heroes by active gardening pool, and detects paired heroes using various blockchain sources.
    *   **Yield Formula**: Implements the full DFK yield formula, incorporating Quest Reward Fund balances, pool allocation, and user's LP share for daily yield calculations.
    *   **Power-up Detection**: Detects Rapid Renewal power-ups and Gravity Feeder presence.
    *   **Pet Garden Bonuses**: Fetches pet data, identifies gardening pets, calculates quest bonuses, and annotates heroes with pet data.
*   **Web Dashboard**: React-based admin dashboard with Vite, Discord OAuth, user management, expenses tracking, and settings, styled with TailwindCSS and shadcn/ui.
*   **Command System**: Implements core slash commands for garden optimization and portfolio analysis, including `optimize-gardens`, `garden-planner`, and `garden-portfolio`.
    *   **Garden Portfolio Current**: Analyzes active gardening expeditions and calculates real-time yields.
    *   **Garden Portfolio Optimizer**: Scans wallet LP positions and globally allocates heroes/pets to highest-yield pools for multi-pool optimization.
*   **Hero Genetics System**: Decodes `statGenes` and `visualGenes` for detailed hero genetic information and gardening bonuses.
*   **Breeding Chart System**: Shares official DFK summoning tree charts.
*   **Hero Summoning Probability Calculator**: A 4x4 Mendelian genetics engine for offspring trait probabilities, including mutation and rarity.
*   **Tavern Bargain Finder**: Scans marketplace for hero pairs with optimal genetics and pricing for target class summoning.
*   **Player User Model System**: Classifies players into archetypes based on behavior and financial activity, enabling personalized bot responses, with intent-based classification and hard overrides for extractor detection.
*   **Smurf Detection & League Signup System**: Manages competitive leagues with a 6-tier ladder, wallet clustering for multi-account detection, power snapshots, transfer aggregates, and rule-based smurf detection with configurable rules and actions.
*   **Challenge/Achievement System**: Gamified progression system with 8 categories and 36 challenges, using dual tier systems (RARITY and GENE tiers) and supporting player progress tracking and leaderboards.
*   **Bridge Flow Tracker (Admin-only)**: Analyzes cross-chain bridge activity to identify "extractors" by indexing bridge events, enriching with USD values, and computing per-wallet net extraction and extractor scores.
    *   **Offline Export/Import**: Standalone script (`bridge-tracker/offline-exporter.js`) indexes blockchain events without database, exports to JSON. Import endpoint (`POST /api/admin/bridge/import-events`) loads pre-indexed data.
    *   **Standalone Sync Script**: Run `npx tsx bridge-tracker/standalone-sync.js` in a separate shell to continuously sync bridge events. Progress persists in database, survives server restarts. Use `--batch 10000 --delay 5` for custom settings.
*   **Level Racer - Class Arena Edition**: Competitive hero leveling races with entry fees and prizes.
    *   **Core Mechanics**: Configurable heroes per pool race to level up, first to reach readyToLevel wins and claims an extra hero.
    *   **Validation Rules**: Rarity filter (common/uncommon/rare/legendary/mythic), mutation limits, 0 XP requirement, no leveling stones.
    *   **State Machine**: OPEN → FILLING → RACING → FINISHED (auto-reopen for recurrent pools)
    *   **Multi-Token Support**: Entry fees and prizes in USD, converted to JEWEL/CRYSTAL/USDC based on pool token type.
    *   **Economic Tracking**: USD-based pricing (`usdEntryFee`, `usdPrize`), token amounts tracked via `totalFeesCollected`, prize distribution via `prizeAwarded`.
    *   **Recurrent Pools**: Pools marked as recurrent auto-create a new pool with same settings when race finishes.
    *   **Pool Lifecycle**: On startup, ensures one open pool per enabled hero class. Auto-creates new pools when recurrent races complete.
    *   **Commentary System**: Hedge-style NPC commentary for all race events (pool creation, hero joins, XP gains, winner declaration).
    *   **REST API**: `/api/level-racer/classes`, `/api/level-racer/pools/active`, `/api/level-racer/pools/:slug/join`, `/api/level-racer/pools/:id`, `/api/level-racer/pools/:id/events`, `/api/level-racer/dev/pools/:id/simulate-tick`
    *   **Admin API**: 
        *   `GET /api/level-racer/admin/pools` - List all pools with full details
        *   `POST /api/level-racer/admin/pools` - Create pool with USD pricing, token type, rarity filter, mutation limits, recurrent flag
        *   `PATCH /api/level-racer/admin/pools/:poolId` - Edit OPEN pool settings
    *   **Admin Dashboard**: Pool management panel at `/admin/level-racer` with create/edit/view/track functionality
    *   **Database Tables**: `hero_classes`, `class_pools`, `pool_entries`, `race_events`
    *   **Pool Fields**: `usdEntryFee`, `usdPrize`, `tokenType` (JEWEL/CRYSTAL/USDC), `rarityFilter`, `maxMutations`, `isRecurrent`

**Design Decisions:**
*   **Database**: PostgreSQL with Drizzle ORM.
*   **Deployment**: Unified Express server integrated with the bot.
*   **UI/UX**: Responsive React admin dashboard with dark/light theme.
*   **Authentication**: Discord OAuth2.
*   **Payment Automation**: Blockchain monitoring for JEWEL payment verification.
*   **Wallet Tracking**: Daily snapshots of JEWEL, CRYSTAL, and cJEWEL balances.
*   **Debug Features**: Debug dashboard for testing.

## External Dependencies
*   **Discord API**: Bot operations and OAuth2.
*   **OpenAI API**: AI-driven conversational responses (GPT-4o-mini).
*   **DeFi Kingdoms GraphQL API**: Game data access.
*   **DFK Chain RPC (Crystalvale)**: Direct blockchain interactions.
*   **NPM Packages**: `discord.js`, `openai`, `graphql-request`, `dotenv`, `graphql`, `ethers.js`.