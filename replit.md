# Hedge Ledger - DeFi Kingdoms Discord Bot

## Overview
Hedge Ledger is an AI-powered Discord bot designed as an in-character NPC assistant for DeFi Kingdoms players in Crystalvale. Its primary purpose is to enhance player experience by providing assistance with in-game navigation, answering questions, analyzing heroes, browsing marketplace listings, explaining game mechanics, and offering a premium garden LP yield optimization service. The bot leverages AI with a specialized game knowledge base and live blockchain data to improve player engagement and provide valuable insights within the DeFi Kingdoms ecosystem.

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
*   **Quest Optimizer**: Analyzes wallet heroes to identify optimal quest assignments. Categorizes heroes into Profession Questers (high 2-stat combos for mining, gardening, fishing, foraging) and Training Questers (stat 40-50 with 61-68% success rate). Shows profession gene matching, XP/stamina efficiency, and success rate calculations.
*   **AI Consultant with Wallet Analysis**: AI-powered chat interface that detects wallet addresses and fetches ALL heroes (paginated, including `isReroll` field) to provide personalized quest recommendations, hero analysis, and game strategy advice. Context includes reroll status per hero (`[REROLLED]` tag), reroll summary count, and live transcendence multiplier tiers fetched from the DFK API for the top class/rarity combos in the wallet.
*   **Divine Altar / Hero Score Calculator**: Static score calculator enhanced with a live "Transcendence Multiplier" card that proxies `POST https://api.defikingdoms.com/divine_essence_multiplier` to show current burn multiplier tier range, average regen chance, and last burn date for the selected class/rarity combo. Backend proxy at `POST /api/admin/divine-altar/multiplier` maps the DFK API's unkeyed array response to named fields.
*   **Tournament Bracket Tracker**: Admin-managed community PvP tournament system. Admins create events, register participants (with live hero stat snapshots from DFK GraphQL + manual fallback), generate single-elimination brackets (padded to power-of-2 with BYEs), record match results with optional on-chain tx hash (auto-advances winner to next round), and view matchup odds powered by combat formulas. Tables: `hedge_tournaments`, `hedge_tournament_entries`, `hedge_tournament_matches`. Frontend at `/admin/tournament` (list) and `/admin/tournament/:id` (detail with bracket visualization and odds sheet). Backend routes at `GET/POST /api/admin/hedge-tournaments`, `GET/PATCH/DELETE /api/admin/hedge-tournaments/:id`, `POST /api/admin/hedge-tournaments/:id/entries`, `POST /api/admin/hedge-tournaments/:id/generate-bracket`, `PATCH /api/admin/hedge-tournaments/:id/matches/:matchId/result`, `GET /api/admin/hedge-tournaments/:id/matches/:matchId/odds`.

**Design Decisions:**
*   **Database**: PostgreSQL with Drizzle ORM, hosted on Neon serverless. All application database operations must consistently use `rawPg` (pooler connection) for both reads and writes to ensure data persistence and visibility.
*   **Deployment**: Unified Express server integrated with the bot.
*   **UI/UX**: Responsive React admin dashboard with theming and environment indicators.
*   **Authentication**: Discord OAuth2 for admin access, plus password-based User Access Management for regular dashboard users.
*   **User Access Management**: Admins can create dashboard user accounts with username/password credentials, set expiration dates, and grant granular tab permissions (quest-optimizer, ai-consultant, yield-calculator, yield-optimizer, summon-sniper, tavern-sniper, gardening-calculator). Users log in at /user/login and see only their permitted tools at /user/dashboard.
*   **Payment Automation**: Blockchain monitoring for JEWEL payment verification.
*   **Wallet Tracking**: Daily snapshots of key token balances.
*   **Environment-Aware Indexers**: Indexers auto-start only in production, with manual trigger in development.
*   **Frontend Build Process**: Utilizes a two-step build process for Replit compatibility.

## External Dependencies
*   **Discord API**: For bot operations and OAuth2 authentication.
*   **OpenAI API**: Utilizes GPT-4o-mini for AI-driven conversational responses.
*   **DeFi Kingdoms GraphQL API**: For accessing in-game data and analytics.
*   **DFK Chain RPC (Crystalvale)**: For direct blockchain interaction and data retrieval.