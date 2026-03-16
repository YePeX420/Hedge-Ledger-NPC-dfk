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
*   **Shared AI Context Builders**: Three shared `async` functions in `bot.js` (`buildTournamentContext`, `buildLiveBattleContext`, `buildFightHistoryContext`) are used by BOTH the Web AI Consultant route and the Discord DM handler. `buildTournamentContext` queries `dfk_completed_brackets` for specific tournament IDs with Firebase HP snapshots. `buildLiveBattleContext` fetches live GraphQL battle data when presence keywords ("live/active/now/happening") are detected. `buildFightHistoryContext` queries `dfk_tournament_bouts`+`dfk_bout_heroes` and scores recent indexed bouts by interestingness (rarity, upsets, class diversity, round depth) for questions like "most interesting fight" or "any upsets today?".
*   **Divine Altar / Hero Score Calculator**: Static score calculator with a live "Transcendence Multiplier" card showing burn multiplier tiers and regen chance.
*   **DFK Tournaments — Multi-Level UI**: A comprehensive tournament browser with five tabs: Tournaments (on-chain bracket data), Open Battles (grouped indexed bouts), Session bracket view, Bout detail, and Tournament Bracket Detail (visual single-elimination bracket, battle inventory, players, and rewards). Includes detailed hero modal with corrected combat stats and equipment information. Persistence of tournament data in `dfk_completed_tournaments` and `dfk_completed_brackets` tables.
*   **Previous Tournaments Page**: Standalone page (`/admin/previous-tournaments`, `/user/previous-tournaments`) showing all completed bracket tournaments in a card grid matching the DFK Tournaments format. Grantable via the `previous-tournaments` tab permission; users with this tab can also navigate into bracket/detail/matchup sub-routes shared with `dfk-tournaments`. `isAdminOrHasTab` middleware accepts multiple tab IDs (OR logic); `UserToolRoute` accepts `tab: string | string[]`.
*   **Fight History Archive**: Full normalized fight archive stored in `dfk_tournament_bouts` (one row per bracket match) and `dfk_bout_heroes` (one row per hero per bout side). Hero snapshots include complete equipment JSONB, cross-team Leadership/Menacing passive context, and effective DPS multiplier for that specific matchup. Backfill runs at startup to normalize all previously stored brackets. Admin page at `/admin/fight-history` with player/tournament/round filters, pagination, bout detail view with side-by-side team display, and hero detail modal with match context banner.
*   **Shared HeroDetailModal**: `client/src/components/dfk/HeroDetailModal.tsx` is the canonical shared component for displaying detailed hero stats, equipment, and combat profile. Accepts optional `matchContext` prop to show Leadership/Menacing context banner. Used by both the tournament bracket page and the fight history page.
*   **dfk_item_stats table**: Indexes passive equipment stats seen during tournament processing for future stat computation and item name resolution.
*   **DFK Ability Data**: Complete active and passive skill name mappings extracted from the DFK game client, used for skill name resolution and rarity classification in the UI. Includes verified passive skill numeric effects and combat stat formulas.
*   **PVE Hunt Companion**: Real-time battle advisor for PVE hunts. WebSocket server at `/ws/companion` accepts Chrome Extension connections, receives battle state snapshots and turn events, runs a deterministic scoring engine (`server/pve-scoring-engine.ts`) against an enemy catalog (`server/pve-enemy-catalog.ts`), and broadcasts ranked action recommendations to all connected dashboard clients. Admin page at `/admin/hunt-companion` (also `/user/hunt-companion` via tab permission). DB tables: `pve_companion_sessions`, `pve_turn_events`. REST endpoints: `GET /api/admin/pve/companion/session` (create), `GET /api/admin/pve/companion/session/:token` (status), `POST /api/admin/pve/companion/explain` (AI explanation). Scoring factors: damage EV, kill chance, survival delta, debuff value, mana efficiency.
*   **DFK Telemetry Backend**: HTTP fallback transport and stat reconciliation engine for the Chrome Extension hunt companion. DB tables: `dfk_hunt_sessions`, `dfk_battle_log_events`, `dfk_unit_snapshots`, `dfk_turn_snapshots`, `dfk_reconciliation_results`. Session-token gated endpoints (no Discord OAuth): `POST /api/dfk/telemetry/session` (create hunt session), `POST /api/dfk/telemetry/event` (persist battle log event), `POST /api/dfk/telemetry/snapshot` (persist unit/turn snapshot), `POST /api/dfk/reconcile` (compare observed stats against expected, return diffs with suspected causes). Rate-limited to 100 req/min per token. Reconciliation engine in `server/dfk-reconcile.ts` supports both hero base stats and enemy catalog lookups. Admin page at `/admin/telemetry` (also `/user/telemetry` via `telemetry` tab permission) under "Data" sidebar section. Ownership verification ensures each write endpoint confirms `huntSessionId` belongs to the authenticated session token.
*   **Chrome Extension — DFK Hunt Companion** (Task #15): Manifest V3 unpacked extension at `/extension/`. Content script injected into `game.defikingdoms.com` runs three parser modules: `parsers/battleLog.js` (MutationObserver on battle log container, extracts actor/ability/damage/effects with confidence scores and debug `_source` metadata), `parsers/statPanel.js` (detects hero/enemy stat panel visibility, extracts all combat stats into `unit_snapshot` shape), `parsers/turnState.js` (synthesizes `turn_snapshot` from HP/MP bars, active unit, legal action buttons). Background service worker (`background.js`) manages a WebSocket to `/ws/companion` with exponential-backoff reconnect, an HTTP POST fallback queue when socket is down, and `chrome.storage.local` for session token, host URL, and last 100 snapshots. Popup (`popup.html` / `popup.js`) shows: connection status dot, hunt ID, turn counter, **live Recommendation card** (best move/target/score/reason-tags/second-best/risky alternative updated from server `recommendation` messages), Debug Mode section (event list with confidence color-coding, parse failure log, Export JSON / Copy Latest / Clear), and Reconcile Mode section (sends captured stat panel to `/api/dfk/reconcile`, renders diff table color-coded by delta severity). Debug mode attaches DOM selector + raw match metadata to each parsed field.
*   **PVE Hunt Tracker**: Admin page at `/admin/pve-hunts` (also `/user/pve-hunts` via tab permission `pve-hunts`) for monitoring active PVE hunt expeditions. Wallet-based lookup fetches on-chain hero data, groups heroes by hunt zone activity, shows party composition with hero detail drill-down, encounter history from `hunting_encounters` table, and AI-powered party analysis. Encounter rows are expandable to show a battle log panel (fetches tx receipt and decodes HuntCompleted event from HuntsDiamond contract) and per-encounter AI analysis. Note: The on-chain HuntCompleted event does not encode turn-by-turn battle data, so the battle log shows a graceful fallback with decoded hunt metadata when available. Backend endpoints: `GET /api/admin/pve/live-hunts`, `GET /api/admin/pve/hunt-encounters`, `POST /api/admin/pve/hunt-ai-analysis`, `GET /api/admin/pve/hunt-battle-log`, `POST /api/admin/pve/hunt-encounter-analysis`.

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

## Battle Inventory / Budget System
- `battleInventory` (bitmask) and `battleBudget` (budget-pts per player per match) are stored in `bracket_json->'tournament'` for all indexed brackets.
- `decodeBattleInventory(mask)` in `bot.js` decodes the bitmask to item names (bits 0–7 = None/Small HP/Medium HP/Large HP/Full HP/Small MP/Medium MP/Large MP Potions).
- `battleInventory=60` (bits 2–5 = Medium HP, Large HP, Full HP, Small MP) and `battleBudget=11` are consistent across tournaments 2004, 2005, 2136.
- **Budget is POINTS not item count**: each item costs its `weight` in pts (2=Minor, 3=Large, 4=Major, 8=Full HP Restore); `totalBattleBudget=11` is the point cap.
- `matchup-history` endpoint returns `battleBudget`, `battleInventory`, `allowedItems` (decoded names).
- The matchup page Fight History section shows a "Battle Budget: N budget-pts per player / Allowed: …" row in the card header.
- `bout-live-coach` and `bout-analysis` AI prompts include HP context (`hpCtx`), inventory context (`inventoryCtx`), and budget-pts framing.
- `extractItemsUsed(turns, playerA, playerB)` in `bot.js` uses `attackConfig.attackId` / `move.attackId` (correct Firebase fields). Self-learning: logs `[PotionMap]` when potion turn detected to build address→name map.

## Firebase Battle Log UX
- `BattleLogViewer` auto-fetches silently on mount when a `BoutCard` opens (no second click required).
- Empty state now shows: `indexedFirebaseId` (the Firebase ID that was tried) or, if not indexed, an amber warning "Tournament not in Firebase index".
- `bout-battle-log` endpoint returns `indexedFirebaseId`, `isIndexed`, `heroHpSnapshot`, and `playerInventory`.
- **heroHpSnapshot**: Per-hero live HP/MP from latest turn's `beforeDeckStates`. Color-coded in UI: green ≥60%, amber 30–59%, red <30% (CRITICAL). Mapped side 1→sideA, -1→sideB, slot 0/1/2.
- **playerInventory**: Per-player consumable inventory from `battle.playersData[side].battleBudget.availableItems` in first turn. Shows item tier labels and pts used/total. Both displayed as panels in the BattleLogViewer when data is loaded.
- Battle log `isIndexed: true` confirmed for tournament 2136 (Firebase ID: `1088-5-tournament-2136`); turn data fetched successfully (live bouts show real-time turn count).