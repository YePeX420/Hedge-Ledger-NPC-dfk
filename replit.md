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
*   **Challenge/Achievement System**: A gamified progression system with 16 categories and 52 challenges, utilizing an ETL subsystem for metric extraction and progress computation. Categories span Hero Progression, Economy, Professions, Ownership, Behavior, Seasonal, Prestige, Summoning, Hunting, PvP, METIS (Patrols/Economy/Tournaments), DeFi Participation, Epic Feats, and Global Meta Profile.
    - ETL Scheduler (`src/etl/scheduler/etlScheduler.ts`): Runs automatically every 6 hours for incremental updates and daily at 04:00 UTC for full snapshots
    - Admin refresh button on `/admin/challenges` page for manual ETL triggers
    - API endpoints: `GET /api/admin/etl/status`, `POST /api/admin/etl/trigger`
    - **Tier Calibration Panel** (`/admin/challenges/:id/edit` -> Calibration tab): Data-driven tier threshold tuning:
        - Cohort selector: ALL, NONZERO, ACTIVE_30D for flexible player filtering
        - Editable percentile targets: Basic (p40), Advanced (p70), Elite (p90), Exalted (p97)
        - Real-time statistics: cluster count, nonzero count, percentile distribution
        - Warning badges: zero-inflated, whale-skew, low-sample indicators
        - Suggested thresholds computed from player distribution data
        - Simulation preview: compare current vs suggested tier distributions
        - Database: `challenge_metric_stats` table caches percentile stats per challenge/cohort
        - API endpoints: `GET/POST /api/admin/challenges/:key/calibration`, `/calibration/refresh`, `/calibration/simulate`, `/calibration/apply`
*   **Phase 3 Combat Ingestion**: Direct RPC log scanning for hunting encounters and PvP matches:
    - `src/etl/ingestion/huntingIndexer.ts`: Indexes hunting events from DFK Chain
    - `src/etl/ingestion/pvpIndexer.ts`: Indexes PvP matches from DFK and METIS chains
    - `src/config/combatContracts.ts`: Contract addresses and event signatures (requires configuration)
    - Tables: `hunting_encounters`, `pvp_matches`, `ingestion_state` for checkpoint tracking
    - Challenge extractors wired: 5 hunting challenges, 4 PvP challenges
*   **Bridge Flow Tracker (Admin-only)**: Analyzes cross-chain bridge activity to identify "extractors" via indexed bridge events and wallet scoring.
*   **Extractor Analysis Dashboard** (`/admin/extractors`): Identifies wallets extracting more value than they contribute:
    - Summary cards: Bridged In ($2.45B), Bridged Out ($1.79B), Net Flow (+$660M), Extractor Count (21,980)
    - Bulk SQL computation via `bulkComputeAllMetrics()` in `bridge-tracker/bridge-metrics.js`
    - Wallet metrics table: `wallet_bridge_metrics` with totals, flags (`heavy_extractor`, `net_extractor`)
    - Top extractors table with wallet links to DFK profile and extracted amounts
    - Time-based filtering: 1W, 1M, 3M, 1Y, 2Y, All buttons filter by lastBridgeAt timestamp
    - 8-column table: Wallet, Summoner, Bridged In, Bridged Out, Net Extracted, Last Bridge Amt, Flags, Last Bridge
    - Summoner name lookup via DFK Profiles contract (`0xC4cD8C09D1A90b21Be417be91A81603B03993E81`)
    - Shows "*" for extractors without registered DFK profiles
    - API endpoints: `GET /api/admin/bridge/extractors`, `POST /api/admin/bridge/bulk-compute-metrics`, `POST /api/admin/bridge/update-summoner-names`
*   **Bridge Pricing Reconciliation System** (`bridge-tracker/`): Ensures all bridge events have accurate USD values:
    - `unpriced-analyzer.js`: Discovers unpriced tokens, checks DEX liquidity and external price availability
    - `pricing-reconciliation.js`: Multi-step pipeline: mark deprecated tokens (usdValue=0), flag DEX-derivable tokens for manual review, verify pricing completeness
    - `run-reconciliation.js`: Standalone script to run the full pipeline
    - Tables: `unpriced_tokens` (analysis cache), `pricing_source` column in `bridge_events` tracks: DEFI_LLAMA, COINGECKO, DEX_DERIVED, DEPRECATED_TOKEN, LEGACY_ENRICHMENT
    - Current coverage: 99.9997% (only 2 of 593K events unpriced)
    - Net Flow: $660.6M (IN: $2.45B, OUT: $1.79B)
*   **Value Allocation/TVL Dashboard** (`src/analytics/valueBreakdown.ts`): Calculates accurate TVL by:
    - Querying staked LP amounts from Master Gardener V2 (`getPoolInfo`) and V1 (legacy gardener `balanceOf`)
    - Computing LP value as: `(stakedLP / totalSupply) × poolReserveValue` 
    - Using DefiLlama prices for token valuation with fallback prices
    - Sequential RPC requests with 100ms throttling to avoid rate limiting
*   **Token Registry System** (`src/services/tokenRegistryService.ts`): Automatic token metadata management:
    - Database table `token_registry` stores address, symbol, name, decimals, chain
    - Syncs known DFK tokens on demand, with optional RouteScan scraping for discovery
    - Used by valueBreakdown.ts for dynamic token symbol resolution
    - Admin UI at `/admin/tokens` with sync buttons and token list display
    - API endpoints: `GET /api/admin/tokens`, `POST /api/admin/tokens/sync`, `GET /api/admin/tokens/map`
*   **Unified Pool Indexer System**: Tracks LP staking positions across both V1 and V2 Master Gardener contracts:
    - V2 Indexer (`src/etl/ingestion/poolUnifiedIndexer.js`): Targets current Master Gardener V2 (`0xB04e8D6aED037904B77A9F0b08002592925833b7`)
    - V1 Indexer (`src/etl/ingestion/poolUnifiedIndexerV1.js`): Targets legacy Master Gardener (`0x57dec9cc7f492d6583c773e2e7ad66dcdc6940fb`)
    - Dynamic parallel workers: 5 workers per pool (70 total for 14 pools), with RPC failsafe auto-reduction on rate limits
    - Work-stealing: When a worker completes its range, it automatically steals half the remaining blocks from the slowest worker in the same pool, preventing idle workers while others are still busy
    - Race condition protection: Donor reservation system prevents multiple workers from stealing from the same donor simultaneously
    - Tables: `pool_stakers`, `pool_swap_events`, `pool_reward_events`, `pool_event_indexer_progress` (separate V1 versions with `_v1` suffix)
    - Admin UI: `/admin/pool-indexer` (V2) and `/admin/pool-indexer-v1` (V1) with start/stop controls per pool
    - TVL calculation: `garden-analytics.js` combines V1 + V2 staked amounts for accurate total TVL
    - Cache: `pool-cache.js` exposes `totalTVL`, `v1TVL`, `v2TVL` fields for each pool
    - API endpoints: `GET /api/admin/pool-indexer/unified/status`, `POST /api/admin/pool-indexer/unified/trigger`, etc. (V1 uses `/pool-indexer-v1/` prefix)
*   **Jeweler Indexer System**: Tracks cJEWEL staking positions with leaderboard and APR calculations:
    - Indexer (`src/etl/ingestion/jewelerIndexer.js`): Targets cJEWEL contract (`0x9ed2c155632C042CB8bC20634571fF1CA26f5742`)
    - Tracks mint/burn events (deposits/withdrawals) via Transfer events to/from zero address
    - Derives JEWEL value dynamically using on-chain ratio: `JEWEL_locked / cJEWEL_supply`
    - APR calculation from ratio history snapshots (7d, 30d, overall)
    - DFK summoner name lookup via Profiles contract
    - Tables: `jeweler_stakers`, `jeweler_events`, `jeweler_ratio_history`, `jeweler_indexer_progress`
    - Admin UI: `/admin/jeweler` with stats cards (JEWEL locked, stakers, ratio, APR), indexer controls, and top holders leaderboard
    - API endpoints: `GET /api/admin/jeweler/status`, `POST /api/admin/jeweler/trigger`, `POST /api/admin/jeweler/auto-run`, `GET /api/admin/jeweler/leaderboard`, `GET /api/admin/jeweler/apr`
*   **Gardening Quest Rewards Indexer**: Tracks actual CRYSTAL/JEWEL earned per hero from gardening quests:
    - Indexer (`src/etl/ingestion/gardeningQuestIndexer.js`): Scans QuestCoreV3 (`0x530fff22987E137e7C8D2aDcC4c15eb45b4FA752`) RewardMinted events
    - Extracts hero ID, player wallet, pool ID, reward token, and reward amount per quest completion
    - Pool ID derived from questType (0-13 corresponds to LP pools)
    - Auto-creates tables on first use via ensureTablesExist()
    - Tables: `gardening_quest_rewards`, `gardening_quest_indexer_progress`
    - Admin UI: `/admin/gardening-quest` with stats dashboard, hero search, and reward history
    - API endpoints in bot.js: `GET /api/admin/gardening-quest/status`, `POST /trigger`, `POST /auto-run`, `GET /hero/:heroId`, `GET /player/:player`, `GET /pool/:poolId`
*   **Level Racer - Class Arena Edition**: A competitive hero leveling game with configurable rules, entry fees, prizes, and a state machine for managing races.
*   **Leaderboard System**: Provides snapshot-based rankings with historical tracking across various time windows, scoring players based on defined metrics.
*   **Season Engine**: Manages challenge passes with weighted scoring and seasonal progression, calculating player points and levels.

**Design Decisions:**
*   **Database**: PostgreSQL with Drizzle ORM, hosted on Neon serverless.
*   **Deployment**: Unified Express server integrated with the bot.
*   **UI/UX**: Responsive React admin dashboard with dark/light theme, environment badge (DEV/PROD) in sidebar.
*   **Authentication**: Discord OAuth2.
*   **Payment Automation**: Blockchain monitoring for JEWEL payment verification.
*   **Wallet Tracking**: Daily snapshots of JEWEL, CRYSTAL, and cJEWEL balances.
*   **Debug Features**: Includes a debug dashboard for testing, with an OAuth bypass for development (never enabled in production).
*   **Environment-Aware Indexers**: All indexers (Pool V1/V2, Jeweler, Gardening Quest, Bridge) auto-start only in production (`REPLIT_DEPLOYMENT` or `NODE_ENV=production`). In development, indexers require manual triggering from admin panel to avoid conflicts and unnecessary RPC usage.

## Database Configuration
The application uses **Neon serverless PostgreSQL** for cost optimization.

**Connection Priority** (in `server/db.js`):
1. `NEON_DATABASE_URL` - Primary (Neon pooled connection)
2. `DATABASE_URL` - Fallback (legacy Replit PostgreSQL)

**Neon Details:**
- Host: `ep-solitary-bonus-afr5hsr8-pooler.c-2.us-west-2.aws.neon.tech`
- Uses pooled connection for better serverless performance
- Auto-cleans connection strings that have `psql '` prefix artifacts

**Migration History:**
- December 2025: Migrated from Replit PostgreSQL to Neon
- Data migrated: 2.4 GB (4,571 jeweler stakers, 3.25M pool swaps, 952K bridge events)
- Cost savings: ~$25-35/month ($40 Replit → $6-15 Neon)

## External Dependencies
*   **Discord API**: For bot operations and OAuth2.
*   **OpenAI API**: Specifically GPT-4o-mini for AI-driven conversational responses.
*   **DeFi Kingdoms GraphQL API**: For accessing in-game data.
*   **DFK Chain RPC (Crystalvale)**: For direct blockchain interactions.
*   **NPM Packages**: `discord.js`, `openai`, `graphql-request`, `dotenv`, `graphql`, `ethers.js`.