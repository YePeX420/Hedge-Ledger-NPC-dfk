# Hedge Ledger - DeFi Kingdoms Discord Bot

## Overview
Hedge Ledger is an AI-powered Discord bot designed as an in-character NPC assistant for DeFi Kingdoms players in Crystalvale. Its primary purpose is to enhance player experience by providing assistance with in-game navigation, answering questions, analyzing heroes, browsing marketplace listings, explaining game mechanics, and offering a premium garden LP yield optimization service. The bot leverages AI with a specialized game knowledge base and live blockchain data.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
The project is built with a Node.js backend using Discord.js for bot functionalities and an Express server for an admin dashboard.

**Core Components:**
*   **Discord Bot Layer**: Manages Discord interactions and slash commands.
*   **AI Response System**: Integrates OpenAI's GPT-4o-mini for AI-driven responses, character personality, game knowledge, and multilingual support.
*   **Blockchain Integration**: Utilizes DeFi Kingdoms GraphQL API for game data and `ethers.js` for direct DFK Chain RPC interactions.
*   **Web Dashboard**: A React-based admin dashboard with Vite, Discord OAuth, user management, expenses tracking, and multi-wallet support, styled with TailwindCSS and shadcn/ui.
*   **Command System**: Implements core commands for garden optimization and portfolio analysis.
*   **Hero Systems**: Includes Hero Genetics decoding, Breeding Charts, and Summoning Probability Calculator.
*   **Tavern Bargain Finder**: Scans the marketplace for optimal hero pairs for summoning.
*   **Tavern Heroes Indexer**: Indexes marketplace heroes with full gene data for fast Summon Sniper queries, with a two-phase indexing process and 30-minute auto-refresh.
*   **Summon Sniper**: Finds optimal hero pairs from the tavern marketplace for breeding specific traits, offering different search modes, joint probability calculation, and efficiency ranking.
*   **Player User Model System**: Classifies players for personalized responses and smurf detection.
*   **Smurf Detection & League Signup System**: Manages competitive leagues with multi-account and power snapshot features.
*   **Challenge/Achievement System**: A gamified progression system with an ETL subsystem for metric extraction and progress computation.
*   **Combat Ingestion**: Direct RPC log scanning for hunting encounters and PvP matches from DFK Chain and METIS chains.
*   **PVE Drop Rate Indexer**: Multi-chain indexer for Hunts and Patrols that calculates base drop rates, tracks hierarchical equipment, and estimates drop rates with Wilson score confidence intervals.
*   **Bridge Flow Tracker (Admin-only)**: Analyzes cross-chain bridge activity.
*   **Extractor Analysis Dashboard**: Identifies wallets with net negative value flow.
*   **Bridge Pricing Reconciliation System**: Ensures accurate USD valuation for all bridge events.
*   **Value Allocation/TVL Dashboard**: Calculates accurate Total Value Locked (TVL) using staked LP amounts and DefiLlama prices, including JEWEL tokenomics tracking and CEX liquidity monitoring.
*   **Token Registry System**: Manages token metadata, syncing known DFK tokens and supporting RouteScan scraping.
*   **Unified Pool Indexer System**: Tracks LP staking positions across Master Gardener V1 and V2 contracts.
*   **Jeweler Indexer System**: Tracks cJEWEL staking positions, calculates APR, and provides leaderboards.
*   **Gardening Quest Rewards Indexer**: Tracks CRYSTAL/JEWEL earned per hero from gardening quests with pool value snapshots for yield validation.
*   **Harmony Pool Indexer**: Tracks legacy Serendale JEWEL-ONE LP staking on the Harmony chain.
*   **Battle-Ready Heroes (PVP Tournament Indexer)**: Indexes PvP battles from DFK's Sundered Isles tournaments to identify winning hero builds, capturing full tournament restrictions and offering a tournament type labeling system.
*   **Level Racer - Class Arena Edition**: A competitive hero leveling game with configurable rules.
*   **Leaderboard System**: Provides snapshot-based and historical rankings.
*   **Season Engine**: Manages challenge passes and seasonal progression.

**Design Decisions:**
*   **Database**: PostgreSQL with Drizzle ORM, hosted on Neon serverless.
    *   **CRITICAL Neon Architecture Note**: Neon has separate pooler and direct connection endpoints. The pooler (`ep-xxx-pooler.xxx.neon.tech`) and direct (`ep-xxx.xxx.neon.tech`) endpoints write to different database replicas. All application database operations MUST use `rawPg` (pooler connection) consistently for both reads AND writes to ensure data persistence and visibility. Never use `rawTextPg` (direct connection) for cache mutations as data will not be visible to pooler reads.
*   **Deployment**: Unified Express server integrated with the bot.
*   **UI/UX**: Responsive React admin dashboard with theming and environment indicators.
*   **Authentication**: Discord OAuth2.
*   **Payment Automation**: Blockchain monitoring for JEWEL payment verification.
*   **Wallet Tracking**: Daily snapshots of key token balances.
*   **Environment-Aware Indexers**: Indexers auto-start only in production, requiring manual trigger in development.
*   **Frontend Build Process**: Utilizes a two-step build process to accommodate Replit's file sync behavior, building to `/tmp` and copying to `static-build/`.

## Recent Changes (January 2026)
*   **Elite/Exalted Chance Filtering**: Added Elite Chance and Exalted Chance filters to Summon Sniper and Bargain Hunter pages. Elite Chance is P(at least one tier-2 skill: Stun, Second Wind, Giant Slayer, Last Stand). Exalted Chance is P(at least one tier-3 skill: Resurrection, Second Life). Both use the formula P(at least 1) = 1 - product(1 - P(tier in slot)) across all 4 skill slots (active1, active2, passive1, passive2). Displayed as badges on pair cards.
*   **Bargain Hunter Cache System**: Implemented background caching for Bargain Hunter pages to eliminate slow load times. Cache computes TS (Total Tier Score) efficiency for hero pairs from indexed tavern data. The `bargain_hunter_cache` table stores pre-scored top 1000 pairs per summon type (200 per rarity tier using bounded heaps). Cache auto-creates if missing, refreshes after tavern indexer completes, and can be manually triggered via POST `/api/admin/bargain-cache/refresh`. Hero selection strategy: 50 per rarity, 15 high-level per rarity, 20 per class, 25 per profession, plus elite/exalted skill carriers. Scores ~600k regular and ~700k dark pairs in ~250 seconds.
*   **Market Intel Hero Price Tool**: Added a hero price recommendation tool to the Market Intel tab. Users can select hero attributes (class, rarity, level range, profession, realm) and get buy/sell price recommendations based on recent market sales data. Shows market median, price range, and confidence level based on sample size and price variation.
*   **Market Intel Sale Detection**: Implemented hourly tavern listing snapshots with delta comparison to detect hero sales. Records sale prices with full hero trait snapshots for market analysis.
*   **Bargain Hunter Tabs**: Added dedicated "Bargain Hunter" and "Dark Bargain Hunter" pages to the admin panel sidebar. These auto-load results sorted by TS efficiency (highest skill tier score for lowest cost). Regular Bargain Hunter uses standard summoning; Dark Bargain Hunter uses dark summoning (1/4 token cost).
*   **Pair Scoring Limit Removed**: Summon Sniper now scores ALL candidate pairs instead of limiting to 2,200. With indexed gene data (no API calls needed), full coverage is fast.
*   **ACTIVE_GENE_MAP Fix**: Corrected skill indices in bot.js to match gene-decoder.js (elite skills 24=Stun, 25=Second Wind, 28=Resurrection; advanced skills 17=Daze, 18=Explosion, 19=Hardened Shield).
*   **TS Filter UX Improvement**: Added TS metadata to Summon Sniper API response (`tsMetadata: { maxExpectedTS, maxCumulativeByTarget, requestedTarget, requestedMinProb }`). Frontend now displays helpful guidance when TS filter is unattainable, showing max available probabilities and suggesting lower thresholds (1-2).
*   **TS Reality Check**: Most DFK heroes have tier 0 skills. Expected TS ranges 0.04-0.64 across pairs. TS ≥6 with 3% chance is mathematically impossible - this is correct behavior, not a bug.
*   **Skill Tier Warnings Suppressed**: Unknown skills (Backstab, Silence, Inner Calm) now default to tier 0 silently without console spam.
*   **Gene Decoding Fix**: Fixed critical bug in `gene-decoder.js` where active/passive skill genes were returning undefined values. Raw Kai-decoded values for 16-element lookup tables (ACTIVE_GENES, PASSIVE_GENES) now use `value % 16` normalization to extract skill IDs correctly.
*   **Hero ID Format Fix**: Updated `getHeroById` in `onchain-data.js` to try multiple ID formats (raw, CV prefix 1T+, SD prefix 2T+) when fetching heroes from the DFK GraphQL API.
*   **Elite Skill Mutations**: Summoning Calculator now correctly displays elite/exalted skill probabilities (Stun, Second Wind, Resurrection) in offspring predictions.
*   **Equipment Dimension Tables**: Added dimension tables (`dim_weapon_details`, `dim_armor_details`, `dim_accessory_details`) to map equipment_type + display_id to human-readable item names. Imported 146 items (55 weapons, 40 armors, 51 accessories) from DFK game data CSV files. PVE drop rate display now shows proper item names like "Bronze Spatha" instead of generic "Weapon #3".
*   **Bargain Hunter Efficiency Display Fix**: Fixed display of TS/JEWEL efficiency to use the actual stored efficiency value (×100 for readability) instead of a broken USD-based calculation.
*   **Pool Analytics Cache**: Created `pool_analytics_cache` database table to persist pool TVL/APR data. Pool cache now loads from database on startup (real values immediately available) instead of showing zeros during background refresh. Background analytics refresh saves to database for next startup.
*   **Yield Calculator Page**: Added `/admin/yield-calculator` page to simulate investment returns across all garden pools. Features dollar amount input with preset buttons ($100-$10,000), hero source selector (default: Example Hero #123456 + Pet #789), and sortable table showing projected per-quest CRYSTAL + JEWEL rewards.
*   **Yield Calculator Wallet Lookup**: Added wallet lookup feature to Yield Calculator. Enter a wallet address to see all active questing heroes with expected yields per pool. Shows heroFactor, lpShare%, CRYSTAL/30stam, JEWEL/30stam. Uses official DFK gardening formula. Pet bonuses not yet implemented.
*   **Gardening Calculator APIs**: Added backend endpoints for yield calculations: `/api/admin/gardening-calc/wallet/:address/questing-heroes` (fetch all questing heroes with yields), `/api/admin/gardening-calc/validate/:heroId/:poolId/:wallet` (validate expected yield for specific hero). Uses Quest Reward Fund balances (7.5M CRYSTAL, 560K JEWEL) with pool allocation and LP share.
*   **Pools Page Sorting**: Added sortable columns to Pools page: PID, Pair name, Total TVL, Passive APR, Total APR. Click column headers to toggle sort direction.
*   **Expedition Gardening Formula**: Identified and implemented correct expedition gardening mechanics. Key findings:
    *   Quest ID format: 0x01050aXX where XX encodes pool ID in hex (e.g., 0x02 = Pool 2)
    *   LP Share = User's TOTAL LP across all V2 pools / TOTAL V2 TVL (not individual pool TVL)
    *   Pool Allocation = Weighted average based on user's LP distribution across pools
    *   Expedition Efficiency = 0.78x multiplier (expeditions yield ~78% of manual gardening formula)
    *   Quest type prefixes: 0x01050a (Expedition Gardening), 0x010601 (Training), 0x010300 (Foraging/Fishing), 0x01020a (Mining)

## External Dependencies
*   **Discord API**: For bot operations and OAuth2 authentication.
*   **OpenAI API**: Utilizes GPT-4o-mini for AI-driven conversational responses.
*   **DeFi Kingdoms GraphQL API**: For accessing in-game data and analytics.
*   **DFK Chain RPC (Crystalvale)**: For direct blockchain interaction and data retrieval.