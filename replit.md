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
*   **Deployment**: Unified Express server integrated with the bot.
*   **UI/UX**: Responsive React admin dashboard with theming and environment indicators.
*   **Authentication**: Discord OAuth2.
*   **Payment Automation**: Blockchain monitoring for JEWEL payment verification.
*   **Wallet Tracking**: Daily snapshots of key token balances.
*   **Environment-Aware Indexers**: Indexers auto-start only in production, requiring manual trigger in development.
*   **Frontend Build Process**: Utilizes a two-step build process to accommodate Replit's file sync behavior, building to `/tmp` and copying to `static-build/`.

## Recent Changes (January 2026)
*   **Elite/Exalted Chance Filtering**: Added Elite Chance and Exalted Chance filters to Summon Sniper and Bargain Hunter pages. Elite Chance is P(at least one tier-2 skill: Stun, Second Wind, Giant Slayer, Last Stand). Exalted Chance is P(at least one tier-3 skill: Resurrection, Second Life). Both use the formula P(at least 1) = 1 - product(1 - P(tier in slot)) across all 4 skill slots (active1, active2, passive1, passive2). Displayed as badges on pair cards.
*   **Bargain Hunter Cache System**: Implemented background caching for Bargain Hunter pages to eliminate slow load times. Cache computes TTS (Total Tier Score) efficiency for hero pairs from indexed tavern data. The `bargain_hunter_cache` table stores pre-scored top 1000 pairs per summon type. Cache auto-creates if missing, refreshes after tavern indexer completes, and can be manually triggered via POST `/api/admin/bargain-cache/refresh`. Optimization limits scoring to 600 cheapest heroes (~180k pairs) for fast computation (~45 seconds).
*   **Market Intel Hero Price Tool**: Added a hero price recommendation tool to the Market Intel tab. Users can select hero attributes (class, rarity, level range, profession, realm) and get buy/sell price recommendations based on recent market sales data. Shows market median, price range, and confidence level based on sample size and price variation.
*   **Market Intel Sale Detection**: Implemented hourly tavern listing snapshots with delta comparison to detect hero sales. Records sale prices with full hero trait snapshots for market analysis.
*   **Bargain Hunter Tabs**: Added dedicated "Bargain Hunter" and "Dark Bargain Hunter" pages to the admin panel sidebar. These auto-load results sorted by TTS efficiency (highest skill tier score for lowest cost). Regular Bargain Hunter uses standard summoning; Dark Bargain Hunter uses dark summoning (1/4 token cost).
*   **Pair Scoring Limit Removed**: Summon Sniper now scores ALL candidate pairs instead of limiting to 2,200. With indexed gene data (no API calls needed), full coverage is fast.
*   **ACTIVE_GENE_MAP Fix**: Corrected skill indices in bot.js to match gene-decoder.js (elite skills 24=Stun, 25=Second Wind, 28=Resurrection; advanced skills 17=Daze, 18=Explosion, 19=Hardened Shield).
*   **TTS Filter UX Improvement**: Added TTS metadata to Summon Sniper API response (`ttsMetadata: { maxExpectedTTS, maxCumulativeByTarget, requestedTarget, requestedMinProb }`). Frontend now displays helpful guidance when TTS filter is unattainable, showing max available probabilities and suggesting lower thresholds (1-2).
*   **TTS Reality Check**: Most DFK heroes have tier 0 skills. Expected TTS ranges 0.04-0.64 across pairs. TTS ≥6 with 3% chance is mathematically impossible - this is correct behavior, not a bug.
*   **Skill Tier Warnings Suppressed**: Unknown skills (Backstab, Silence, Inner Calm) now default to tier 0 silently without console spam.
*   **Gene Decoding Fix**: Fixed critical bug in `gene-decoder.js` where active/passive skill genes were returning undefined values. Raw Kai-decoded values for 16-element lookup tables (ACTIVE_GENES, PASSIVE_GENES) now use `value % 16` normalization to extract skill IDs correctly.
*   **Hero ID Format Fix**: Updated `getHeroById` in `onchain-data.js` to try multiple ID formats (raw, CV prefix 1T+, SD prefix 2T+) when fetching heroes from the DFK GraphQL API.
*   **Elite Skill Mutations**: Summoning Calculator now correctly displays elite/exalted skill probabilities (Stun, Second Wind, Resurrection) in offspring predictions.

## External Dependencies
*   **Discord API**: For bot operations and OAuth2 authentication.
*   **OpenAI API**: Utilizes GPT-4o-mini for AI-driven conversational responses.
*   **DeFi Kingdoms GraphQL API**: For accessing in-game data and analytics.
*   **DFK Chain RPC (Crystalvale)**: For direct blockchain interaction and data retrieval.