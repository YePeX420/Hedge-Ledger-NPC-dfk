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
    - Auto-initializing database tables (pve_activities, pve_loot_items, pve_completions, pve_reward_events, pve_indexer_checkpoints, pve_equipment_stats)
    - Scavenger pet detection: Combat bonus IDs 60 (common), 139 (rare), 219 (mythic) provide 10-25% loot bonus based on combatBonusScalar
    - Only Scavenger combat bonus affects loot drop rates (other combat bonuses are for PvP combat stats)
    - Wilson score confidence intervals for drop rate estimates
    - **Hierarchical Equipment Tracking**: Equipment drops tracked with parent items (e.g., "Armor", "Weapon") showing aggregate drop rates, with expandable child variants showing specific stat rolls by displayId and rarity tier
      - Equipment columns: is_equipment, nft_id, display_id, equipment_type (0=Weapon, 1=Armor, 2=Shield, 3=Accessory), rarity_tier (0=Common to 4=Mythic)
      - UI: Collapsible equipment sections with rarity distribution badges and variant breakdown tables
    - Public API: GET /api/pve/status, /hunts, /patrols, /loot/:activityId, /loot-hierarchical/:activityId, /estimate
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
    - Quest Reward Fund snapshots (crystalFundBalance, jewelFundBalance) captured at each reward for yield formula validation
    - JEWEL fund includes both wJEWEL (ERC20) and native JEWEL (gas token) balances
    - Block-level caching for fund balance RPC calls to reduce API overhead
    - 2 parallel workers for historical scanning
    - Reset-to-block functionality for scanning last N blocks (e.g., last 1M blocks)
    - Admin API: GET /api/admin/gardening-quest/status, /hero/:heroId, /player/:player, /pool/:poolId
    - Admin API: POST /api/admin/gardening-quest/trigger, /auto-run, /reset, /reset-to-block
*   **Harmony Pool Indexer**: Tracks legacy Serendale JEWEL-ONE LP staking on the Harmony chain.
*   **Battle-Ready Heroes (PVP Tournament Indexer)**: Indexes PvP battles from DFK's Sundered Isles tournaments to identify winning hero builds. Features:
    - Parallel workers (5) with work-stealing for efficient batch processing
    - Indexes placements (winner/finalist) and full hero snapshots at tournament time
    - Realm support: 'cv' (Crystalvale) and 'sd' (Sundered Isles) taverns
    - **Full Tournament Restriction Tracking**: Captures all battle restrictions from DFK GraphQL API:
      - `excludedClasses` / `excludedConsumables` / `excludedOrigin` - bitmask restrictions
      - `allUniqueClasses` / `noTripleClasses` - class composition rules
      - `mustIncludeClass` / `includedClassId` - required class constraints
      - `minHeroStatScore` / `maxHeroStatScore` / `minTeamStatScore` / `maxTeamStatScore` - stat brackets
      - `battleInventory` / `battleBudget` - equipment/budget rules
      - `privateBattle` / `gloryBout` / `mapId` - battle type flags
    - **Tournament Type Signature**: Auto-generated signature (e.g., `lv1-100_r0-4_p3_stat0-3000_team0-9000`) for grouping similar tournament types
    - **Tournament Type Labeling System**: Human-readable labels for recurring tournament patterns
      - Supports signature-based matching (technical) or name pattern matching (regex/exact)
      - Auto-computes occurrence count and last seen timestamp when creating labels
      - Categories: 'open', 'beginner', 'veteran', 'specialty', 'general'
      - Color coding for UI badges
      - Soft deletes with is_active flag
    - **Raw Battle Data**: Full battle JSON stored for future analysis
    - Admin API: 
      - POST /api/admin/tournament/trigger - Start indexing
      - GET /api/admin/tournament/status - Indexer status with live worker data
      - GET /api/admin/tournament/recent - Recent indexed tournaments
      - GET /api/admin/tournament/restrictions - Restriction usage statistics
      - GET /api/admin/tournament/signatures - Tournament type groupings
      - GET /api/admin/tournament/patterns - Discovered patterns with occurrence counts and labels
      - GET /api/admin/tournament/types - All tournament type labels
      - POST /api/admin/tournament/types - Create/update tournament type label
      - DELETE /api/admin/tournament/types/:id - Soft delete a label
      - GET /api/admin/tournament/types/:id/heroes - Winning heroes for a labeled type
      - GET /api/admin/tournament/:id - Full tournament details with heroes
      - GET /api/admin/tournament/by-signature/:sig - Tournaments by type
      - GET /api/admin/battle-ready/recommendations - Winning hero builds
    - Tables: pvp_tournaments, tournament_placements, hero_tournament_snapshots, pvp_similarity_config, pvp_tournament_types
    - Note: GraphQL API doesn't support `winner_not: null` filter - use `battleState === 5` filter in code
    - **Tavern Listings Integration**: Marketplace hero browser with team cost calculator
      - Uses official DFK API: POST https://api.defikingdoms.com/communityAllPublicHeroSaleAuctions
      - Realm detection via hero ID ranges (CV: 1T-2T, SD: ≥2T) - deterministic, not network field
      - Dual price display: native token (CRYSTAL/JEWEL) + USD via price-feed.js
      - Class ID to name mapping for mainClassStr, subClassStr, professionStr
      - Hero selection with checkbox and team cost totals (CRYSTAL + JEWEL + USD)
      - Admin API: GET /api/admin/tavern-listings?limit=50
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