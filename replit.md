# Hedge Ledger - DeFi Kingdoms Discord Bot

## Overview
Hedge Ledger is an AI-powered Discord bot for DeFi Kingdoms players in Crystalvale, acting as an in-character NPC assistant. It aims to enhance player experience by providing in-game navigation, answering questions, analyzing heroes, browsing marketplace listings, explaining game mechanics, and offering a premium garden LP yield optimization service. The bot uses AI with a specialized game knowledge base and live blockchain data to improve player engagement and provide valuable insights within the DeFi Kingdoms ecosystem.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
The project is built with a Node.js backend using Discord.js for bot functionalities and an Express server for an admin dashboard.

**Core Components:**
*   **Discord Bot Layer**: Manages Discord interactions and slash commands.
*   **AI Response System**: Integrates OpenAI's GPT-4o-mini for AI-driven responses, character personality, game knowledge, and multilingual support.
*   **Blockchain Integration**: Utilizes DeFi Kingdoms GraphQL API for game data and `ethers.js` for direct DFK Chain RPC interactions.
*   **Web Dashboard**: A React-based admin dashboard with Vite, Discord OAuth, user management, expenses tracking, and multi-wallet support, styled with TailwindCSS and shadcn/ui.
*   **Hero Systems**: Includes Hero Genetics decoding, Breeding Charts, Summoning Probability Calculator, Tavern Bargain Finder, Tavern Heroes Indexer, and Summon Sniper for optimal hero pair identification.
*   **Player & League Systems**: Features Player User Model System for personalized responses, Smurf Detection & League Signup System for competitive leagues, and a Challenge/Achievement System for gamified progression.
*   **Combat & Drop Rate Analysis**: Implements Combat Ingestion via RPC log scanning and a PVE Drop Rate Indexer for multi-chain drop rate calculation and tracking.
*   **Financial & Market Analytics**: Includes Bridge Flow Tracker, Extractor Analysis Dashboard, Bridge Pricing Reconciliation System, Value Allocation/TVL Dashboard, Token Registry System, Unified Pool Indexer, Jeweler Indexer, and Gardening Quest Rewards Indexer.
*   **PvP & Gaming Systems**: Features Battle-Ready Heroes (PVP Tournament Indexer), Level Racer - Class Arena Edition, Leaderboard System, and Season Engine.
*   **Yield Optimization**: Provides a Yield Calculator page with wallet lookup, and a Yield Calculator Optimizer for recommending optimal pool allocations.
*   **Quest Optimizer**: Analyzes wallet heroes to identify optimal quest assignments based on profession, efficiency, and success rate.
*   **AI Consultant with Wallet Analysis**: AI-powered chat interface providing personalized quest recommendations, hero analysis, and game strategy advice based on detected wallet addresses and hero data, including reroll status and transcendence multipliers.
*   **Divine Altar / Hero Score Calculator**: Static score calculator with a live "Transcendence Multiplier" card showing burn multiplier tiers and regen chance.
*   **DFK Tournaments — Multi-Level UI**: A comprehensive tournament browser with five tabs: Tournaments (on-chain bracket data), Open Battles (grouped indexed bouts), Session bracket view, Bout detail, and Tournament Bracket Detail (visual single-elimination bracket, battle inventory, players, and rewards). Includes detailed hero modal with corrected combat stats and equipment information. Persistence of tournament data in `dfk_completed_tournaments` and `dfk_completed_brackets` tables.
*   **Fight History Archive**: Full normalized fight archive stored in `dfk_tournament_bouts` (one row per bracket match) and `dfk_bout_heroes` (one row per hero per bout side). Hero snapshots include complete equipment JSONB, cross-team Leadership/Menacing passive context, and effective DPS multiplier for that specific matchup. Backfill runs at startup to normalize all previously stored brackets. Admin page at `/admin/fight-history` with player/tournament/round filters, pagination, bout detail view with side-by-side team display, and hero detail modal with match context banner.
*   **Shared HeroDetailModal**: `client/src/components/dfk/HeroDetailModal.tsx` is the canonical shared component for displaying detailed hero stats, equipment, and combat profile. Accepts optional `matchContext` prop to show Leadership/Menacing context banner. Used by both the tournament bracket page and the fight history page.
*   **dfk_item_stats table**: Indexes passive equipment stats seen during tournament processing for future stat computation and item name resolution.
*   **DFK Ability Data**: Complete active and passive skill name mappings extracted from the DFK game client, used for skill name resolution and rarity classification in the UI. Includes verified passive skill numeric effects and combat stat formulas.

**Design Decisions:**
*   **Database**: PostgreSQL with Drizzle ORM, hosted on Neon serverless, using `rawPg` for all operations.
*   **Deployment**: Unified Express server integrated with the bot.
*   **UI/UX**: Responsive React admin dashboard with theming and environment indicators.
*   **Authentication**: Discord OAuth2 for admin access; password-based User Access Management for regular dashboard users with granular tab permissions.
*   **Payment Automation**: Blockchain monitoring for JEWEL payment verification.
*   **Wallet Tracking**: Daily snapshots of key token balances.
*   **Environment-Aware Indexers**: Indexers auto-start only in production.
*   **Frontend Build Process**: Utilizes a two-step build process for Replit compatibility.

## External Dependencies
*   **Discord API**: For bot operations and OAuth2 authentication.
*   **OpenAI API**: Utilizes GPT-4o-mini for AI-driven conversational responses.
*   **DeFi Kingdoms GraphQL API**: For accessing in-game data and analytics.
*   **DFK Chain RPC (Crystalvale)**: For direct blockchain interaction and data retrieval.
*   **DFK Internal Tournament API**: Firebase-authenticated endpoint at `api.defikingdoms.com/tournaments/active` for bracket tournament data.