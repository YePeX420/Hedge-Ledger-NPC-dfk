# Hedge Ledger - DeFi Kingdoms Discord Bot

## Overview
Hedge Ledger is an AI-powered Discord bot designed as an in-character NPC assistant for DeFi Kingdoms players in Crystalvale. Its primary purpose is to enhance player experience by providing assistance with in-game navigation, answering questions, analyzing heroes, browsing marketplace listings, explaining game mechanics, and offering a premium garden LP yield optimization service. The bot leverages AI with a specialized game knowledge base and live blockchain data to improve player engagement and provide valuable insights within the DeFi Kingdoms ecosystem.

## User Preferences
Preferred communication style: Simple, everyday language.

## Admin Nav Structure
The sidebar uses hover flyout groups (FlyoutMenu component in admin-layout.tsx):
- **Top** (always visible): Dashboard, AI Consultant
- **Tavern** — buying heroes & pets: Tavern Sniper, Hero Score Calc, Bargain Hunter, Dark Bargain Hunter, Combat Pets Shop, Hero Price Tool, Wallet Activity, Tavern Indexer
- **Combat** — PvP/PvE tools: Hero Combat Toolkit, PVP Matchup Tool, DFK Tournaments, Battle-Ready Heroes, Combat Pets Shop, PVE Drop Rates, Hedge: Combat Sync
- **Summon** — summoning tools: Summoning Calculator, Summon Sniper
- **Ecosystem** — on-chain economy: Users, Value Allocation, Token Registry, Bridge, Extractors, User Access
- **Gardening** — LP/gardening: Pools, Gardening Quest, Gardening Calculator, Yield Calculator
- **Indexers** — data indexing: Pool Indexers, Jeweler, Patrol Rewards
- **Unfinished** — WIP tools: Quest Optimizer, Battle-Ready Heroes, Market Intel, Profit Tracker, Challenges, Level Racer, Hedge: Plans & Access, Expenses
- **System** (always visible): Settings
Note: Combat Pets Shop appears in both Tavern and Combat. Battle-Ready Heroes appears in both Combat and Unfinished.

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
*   **DFK Tournaments — Three-Level UI**: Five-tab tournament browser. Tab order: **Tournaments** (default, bracket tournaments fetched **on-chain** from PvP Diamond contract `0xc7681698B14a2381d9f1eD69FC3D27F33965b53B` on Metis via ethers.js — calls `getActiveTournamentIds()` then batches `getTournament()` + `getTournamentEntrySettings()` + `getTournamentHostData()` per tournament; 5-min cache; states: 1=upcoming, 2=accepting_entries, 5=in_progress; max entries hardcoded 8 for Off-Season type; service: `src/services/dfkTournamentApi.ts`) | **Open Battles** (formerly "Tournaments" — groups indexed bouts into sessions by `tournament_type_signature` + daily time window, sessionKey = `${signature}_${epochSeconds}`, shows session cards with format/level/rarity/bout count) | (2) **Session bracket view** (`/admin/tournaments/session/:sessionKey`) — fetches all bouts in the session, clusters into rounds by >2h gap, shows ≤4 bouts as grid or ≥5 as columnar bracket with class chips and winner highlights; (3) **Bout detail** (`/admin/tournament/:id`) — 4 tabs: Bout Details, Combat Prediction, Similar Bouts, **Comp Analysis** (new). Comp Analysis fetches `/api/admin/tournament/:id/comp-data` which tries hero_tournament_snapshots first (source:'snapshot') then falls back to DFK GraphQL live fetch (source:'live'). Shows per-hero ability badges with formula tooltips, projected Phys DPS / Mag DPS / Heal / CC scores, team summary comparison table with advantage edges, and collapsible Skill Codex reference for the 8 supported classes. Live tab queries DFK GraphQL directly, auto-refreshes every 30 seconds. Backend: `GET /api/admin/tournament/sessions`, `GET /api/admin/tournament/sessions/:sessionKey/bouts`, `GET /api/admin/tournament/:id/comp-data` (live-fallback), plus existing browse/predict/stats endpoints. Data files at `client/src/data/ability-formulas.ts` (30 abilities with formulaFn) and `client/src/data/skill-codex.ts` (8 classes full catalog). Combat Pets on-chain verification: Multicall3 `isOnAuction` check runs 90 seconds post-startup for CRY and SUN realms, filtering stale subgraph listings.
*   **DFK Ability Data**: Complete active and passive skill name mappings extracted from the DFK game client (`game.defikingdoms.com` JS bundle). Static lookup in `src/data/dfk-abilities.ts` maps numeric `traitId` values (from hero `active1/active2/passive1/passive2` fields) to real skill names with rarity classification (basic/advanced/elite/exalted). Active skills (DSe): Poisoned Blade, Blinding Winds, Heal, Cleanse, Iron Skin, Speed, Critical Aim, Deathmark, Exhaust, Daze, Explosion, Hardened Shield, Stun, Second Wind, Resurrection. Passive skills (O9t): Duelist, Clutch, Foresight, Headstrong, Clear Vision, Fearless, Chatterbox, Stalwart, Leadership, Efficient, Menacing, Toxic, Giant Slayer, Last Stand, Second Life. Tournament detail shows rarity-color-coded skill badges (blue=advanced, purple=elite, amber=exalted).

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
*   **DFK Internal Tournament API**: Firebase-authenticated endpoint at `api.defikingdoms.com/tournaments/active` for bracket tournament data. Firebase token exchange uses `DFK_FIREBASE_REFRESH_TOKEN` env var with project `dfk-user-api`. Services: `src/services/dfkFirebaseAuth.ts` (token cache), `src/services/dfkTournamentApi.ts` (API client). Backend endpoint: `GET /api/admin/tournament/scheduled`.