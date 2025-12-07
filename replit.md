# Hedge Ledger - DeFi Kingdoms Discord Bot

## Overview
Hedge Ledger is a Discord bot designed as an in-character NPC assistant for DeFi Kingdoms players. It leverages AI (GPT-4o-mini) with a specialized game knowledge base and live blockchain data to provide comprehensive in-game navigation, answer questions, analyze heroes, browse marketplace listings, and explain game mechanics. The bot focuses on Crystalvale gameplay, offering free guidance and a premium garden LP yield optimization service. Its primary goal is to be the definitive Crystalvale navigation assistant, enhancing the player experience and offering valuable economic insights.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
The project utilizes a Node.js backend integrating Discord.js for bot functionalities and an Express server for an admin dashboard.

**Core Components:**
*   **Discord Bot Layer**: Manages all Discord interactions, including slash commands and direct messages.
*   **AI Response System**: Integrates OpenAI's GPT-4o-mini, configured with a specific character personality, a comprehensive game knowledge base, and multilingual support.
*   **Blockchain Integration**:
    *   **GraphQL Integration**: Uses `graphql-request` for DeFi Kingdoms GraphQL API access (hero data, marketplace, wallet analysis).
    *   **DFK Chain RPC Interaction**: Employs `ethers.js` for direct interaction with the DFK Chain RPC for Crystalvale garden pool analytics, LP token detection, and smart contract data.
    *   **Pool Analytics Cache**: Background system to cache DeFi Kingdoms pool analytics.
    *   **Wallet LP Token Detection**: Scans user wallets for staked LP tokens.
    *   **Current Quest Decoder** (`garden-pairs.js`): Decodes hero's `currentQuest` bytes to detect gardening status and pool ID. Quest encoding format: `0x[questType][subType][profession][poolId]` where byte2=0x05 (expedition) and byte3=0x0a (gardening profession) indicates active gardening. Used for accurate before/after APR calculations.
    *   **Hero Pool Grouping**: Groups heroes by their current gardening pool using decoded quest data, enabling comparison of current hero assignments vs optimized allocation.
    *   **Hero Pairing Detection** (`hero-pairing.js`): Detects paired heroes in gardening quests using the Expedition API as primary source (getAccountExpeditionsWithAssociatedQuests). This provides accurate hero groupings directly from blockchain quest data. Falls back to QuestCoreV3 getActiveQuests() for non-expedition quests, then to currentQuest decoding as last resort. Queries historical `QuestReward` events to determine JEWEL vs CRYSTAL farmer role per hero based on which token they've earned. Falls back to position heuristic (first hero = JEWEL, second = CRYSTAL) when no reward history is available.
    *   **Quest Reward Fund** (`quest-reward-fund.js`): Fetches CRYSTAL and JEWEL pool balances from the Quest Reward Fund contract (0x1137643FE14b032966a59Acd68EBf3c1271Df316) for use in yield formula calibration. Current balances: CRYSTAL ~7.78M, JEWEL ~600K (ratio ~12.96).
    *   **Rapid Renewal Service** (`rapid-renewal-service.js`): Detects heroes with Rapid Renewal power-up via PowerUpManagerDiamond contract. RR reduces stamina regen by 3 seconds per hero level. Integrated into garden optimizer to show RR heroes with [RR] markers.
    *   **Gravity Feeder Detection**: Checks wallet for Gravity Feeder power-up which feeds all pets during expeditions (300 cJEWEL cost). Currently defaults to true if contract call fails (PowerUpManager contract may be outdated).
    *   **Pet Garden Bonuses** (`pet-data.js`): Fetches pets from PetCore contract via getUserPetsV2, with heroToPet fallback for heroes missing from results. Identifies gardening pets (eggType 2), calculates quest bonus percentages, and annotates heroes with equipped pet data. Debug output shows pet ID, type, bonus percentage, and fed status.
    *   **Yield Formula** (`hero-yield-model.js`, `top-gardeners.js`): Full DFK yield formula: `earnRate = annealingFactor × (rewardPool × poolAllocation × LPowned × heroFactor) / ((300 - 50*geneBonus) × rewardModBase)`. Hero factor: `0.1 + (WIS+VIT)/1222.22 + Grd/244.44`. Constants: annealingFactor=1, rewardModBase=72 (level 10 quest) or 144 (level 0), geneBonus=1 if gardening profession. Uses Quest Reward Fund balances, pool allocation %, and user's LP share for real daily yields.
*   **Web Dashboard**: React-based admin dashboard with Vite, featuring Discord OAuth authentication, user management, expenses tracking, and settings pages, styled with TailwindCSS and shadcn/ui.
*   **Command System**: Implements core slash commands, including `/optimize-gardens`, `/garden-planner`, `/garden-planner-3pair`, `/garden-portfolio-3pair`, and `/garden-portfolio-current`.
    *   **Garden Portfolio Current** (`garden-portfolio-current.js`): Analyzes a wallet's active gardening expeditions and calculates real-time yields. Uses expedition `iterationTime` from contract for accurate runs/day calculations. Fetches RR hero IDs once and normalizes to match expedition IDs. Shows per-pool breakdowns with hero/pet assignments, [RR] markers, stamina, and Quest APR. **See `docs/garden-portfolio-current-design.md` for complete Basis of Design documentation.**
    *   **Garden Portfolio Optimizer** (`garden-portfolio-3pair.js`): Multi-pool garden optimization that scans wallet for all LP positions and globally allocates best heroes/pets to highest-yield pools first. Uses per-pool hero yield scoring (not global rankings) to ensure each pool gets the best available heroes for that specific pool. Supports up to 3 pairs per pool, default stamina 30. Shows per-pool breakdown and portfolio-wide daily/weekly/monthly yield totals.
*   **Hero Genetics System**: Decodes both `statGenes` and `visualGenes` using Kai (base-32) encoding to provide detailed hero genetic information, detect gardening bonuses, and support hero analysis commands.
*   **Breeding Chart System**: Automatically shares relevant official DFK summoning tree charts (visual genetics and hero class summoning) based on user queries.
*   **Hero Summoning Probability Calculator**: A 4x4 Mendelian genetics engine calculating offspring trait probabilities for all genetic combinations, including class, profession, abilities, stats, and visual traits, with mutation tracking and rarity calculation.
*   **Tavern Bargain Finder**: Scans the marketplace for hero pairs with optimal genetics and pricing for target class summoning.
*   **Player User Model System**: Classifies players into archetypes, tiers, and engagement states based on behavior, financial activity, and message content, allowing for personalized bot responses.
*   **Bridge Flow Tracker** (Admin-only): Analyzes cross-chain bridge activity to identify "extractors" - wallets that bridge more value OUT of DFK Chain than IN.
    *   **Bridge Indexer** (`bridge-tracker/bridge-indexer.js`): Scans DFK Chain RPC for bridge events from Synapse Bridge contracts. Supports:
        *   **Historical Sync**: Full blockchain indexing from genesis (block 0) to present with resumable progress tracking
        *   **Maintenance Mode**: Periodic scanning of recent blocks to catch new events
        *   **Progress Tracking**: `bridge_indexer_progress` table stores last indexed block for resume capability
    *   **Price Enrichment** (`bridge-tracker/price-enrichment.js`): Batch job that fills in USD values for bridge events:
        *   Groups events by date/token to minimize CoinGecko API calls
        *   Respects rate limits (6.5s between requests)
        *   Updates `usd_value` and `token_price_usd` columns on bridge_events
    *   **Price History** (`bridge-tracker/price-history.js`): Caches CoinGecko historical prices for JEWEL, CRYSTAL, USDC, ETH, AVAX, BTC, KAIA, FTM, MATIC with rate limiting (6.5s per request).
    *   **Bridge Metrics** (`bridge-tracker/bridge-metrics.js`): Computes per-wallet USD values, net extraction amounts, and extractor scores (0-10 scale).
    *   **Database Tables**: `bridge_events` (raw events with USD values), `wallet_bridge_metrics` (aggregated metrics), `historical_prices` (price cache), `bridge_indexer_progress` (sync state).
    *   **Admin Dashboard**: `/admin/bridge` page shows:
        *   Historical sync progress with start/stop controls
        *   Price enrichment button to add USD values to events
        *   Overview stats, top extractors list, and wallet-specific analysis

**Design Decisions:**
*   **Database**: PostgreSQL with Drizzle ORM for persistent storage of player registrations and payments.
*   **Unified Deployment**: Express server integrated into the main bot application.
*   **UI/UX**: Responsive React admin dashboard with dark/light theme support.
*   **Authentication**: Discord OAuth2 for securing admin endpoints.
*   **Payment Automation**: Blockchain monitoring for automatic JEWEL payment verification for premium services.
*   **Wallet Tracking**: Automated daily snapshots of JEWEL, CRYSTAL, and cJEWEL balances.
*   **cJEWEL Lock Time**: Dashboard displays days remaining on cJEWEL lock by fetching from cJEWEL contract userInfo (index 2 = lockEndTimestamp).
*   **Bulk Expiration**: Admin "Mark All Expired" button to batch-update stale PROCESSING/PENDING optimization jobs to EXPIRED status.
*   **Debug Features**: A debug dashboard for testing functionalities like garden optimization without payments.

## External Dependencies
*   **Discord API**: For bot operations and OAuth2 authentication.
*   **OpenAI API**: For AI-driven conversational responses using GPT-4o-mini.
*   **DeFi Kingdoms GraphQL API**: For game data access.
*   **DFK Chain RPC (Crystalvale)**: For direct blockchain interactions.
*   **NPM Packages**: `discord.js`, `openai`, `graphql-request`, `dotenv`, `graphql`.