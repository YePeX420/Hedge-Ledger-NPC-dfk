# Hedge Ledger - DeFi Kingdoms Discord Bot

## Overview

Hedge Ledger is a Discord bot designed as an in-character NPC assistant for DeFi Kingdoms players. Embodying "Hedge Ledger, the Reluctant Accountant of Serendale," a sarcastic and brilliant character, the bot provides AI-powered responses to help players with game navigation. It integrates OpenAI's GPT-4o-mini with a comprehensive DeFi Kingdoms knowledge base and live blockchain data from the game's GraphQL API and DFK Chain RPC. Its primary purpose is to offer an entertaining, character-driven helper that can answer questions, analyze heroes, browse marketplace listings, explain game mechanics, and **optimize garden LP yield strategies** through Discord, with a current focus on Crystalvale gameplay. The project aims to be the definitive Crystalvale navigation assistant, providing free comprehensive game interface guidance to new players, plus premium garden optimization services for 25 JEWEL.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

The project is a Node.js backend service leveraging Discord.js for bot functionality and an integrated Express server for a web-based admin dashboard.

**Core Components:**

*   **Discord Bot Layer**: Handles Discord interactions (slash commands, free-form DMs, auto-onboarding) and intelligently detects user intent to fetch and present blockchain data.
*   **AI Response System**: Integrates OpenAI's GPT-4o-mini, configured with a distinct character personality (`prompt/hedge-ledger.md`) and a comprehensive knowledge base (`knowledge/` directory) covering heroes, quests, gardens, and UI navigation, with explicit multilingual support.
*   **Blockchain Integration**:
    *   **GraphQL Integration**: Utilizes `graphql-request` to connect to the public DeFi Kingdoms GraphQL API for hero data, marketplace listings, and wallet analysis.
    *   **Intent Detection**: The `intent-parser.js` module analyzes DM messages for user intent and routes queries.
    *   **Pool Analytics Cache**: A background system (`pool-cache.js`) refreshes DeFi Kingdoms pool analytics every 20 minutes, storing data in-memory and providing graceful fallbacks.
    *   **Quick Data Fetcher**: Provides an instant response layer for DM queries, leveraging cached data with automatic fallbacks and timeout wrappers.
    *   **Garden Analytics**: Directly interacts with the DFK Chain RPC via `ethers.js` for comprehensive Crystalvale garden pool analytics, including APR calculations, TVL breakdowns, and price graph construction from raw smart contract data, using chunked event log queries.
    *   **LP Token Detection**: Scans user wallets for LP token holdings using `wallet-lp-detector.js`, matching LP addresses to cached pool data for garden optimization analysis.
*   **Web Dashboard**: An Express server integrated into `bot.js` hosts a static HTML dashboard displaying real-time metrics and an admin user management system.
*   **Command System**: Eleven slash commands are registered with Discord for core functionalities, including the new `/optimize-gardens` command.

**Design Decisions:**

*   **PostgreSQL Database**: Uses Drizzle ORM with PostgreSQL for persistent storage of player registrations and garden optimization payment tracking.
*   **Unified Deployment**: The Express server for the dashboard is integrated directly into the main `bot.js` file.
*   **UI/UX**: The admin dashboard uses pure HTML/CSS/JavaScript, no build step required, responsive design with dark theme matching the main dashboard.
*   **Feature Specifications**: Includes a comprehensive NPC navigation system covering all 37 Crystalvale NPCs across 14 locations, multilingual support across 50+ languages, and enhanced garden interaction features such as APR range display and deprecated pool filtering.
*   **Authentication**: Discord OAuth2 authentication protects admin endpoints using lightweight session management with signed cookies. No external packages required - built with native Node.js crypto and fetch API. Designed to scale for future client guild dashboards.
*   **Payment Automation**: Garden optimization service uses blockchain monitoring to automatically verify JEWEL payments and trigger optimization processing without manual admin intervention.

## Authentication Setup (Discord OAuth2)

The admin dashboard is protected by Discord OAuth2 authentication. Users must be members of the Hedge Ledger Discord server and have Administrator permissions to access the user management interface.

**Required Environment Variables:**

*   `DISCORD_CLIENT_ID` - Your Discord application's Client ID (from Discord Developer Portal)
*   `DISCORD_CLIENT_SECRET` - Your Discord application's Client Secret (from Discord Developer Portal)
*   `DISCORD_GUILD_ID` - The Discord server (guild) ID for Hedge Ledger
*   `SESSION_SECRET` - A random secret string for signing session cookies (generate with: `openssl rand -hex 32`)
*   `REDIRECT_URI` - OAuth callback URL (default: `http://localhost:5000/auth/discord/callback`, update for production deployment)

**Discord Developer Portal Configuration:**

1.  Go to [Discord Developer Portal](https://discord.com/developers/applications)
2.  Select your application (or create a new one)
3.  Navigate to **OAuth2** → **General**
4.  Add the redirect URL to **Redirects**:
    *   Development: `http://localhost:5000/auth/discord/callback`
    *   Production: `https://your-repl-url.replit.app/auth/discord/callback`
5.  Under **OAuth2** → **URL Generator**, select scopes: `identify`, `guilds`
6.  Copy your Client ID and Client Secret to environment variables

**Authentication Flow:**

1.  User visits `/users.html` (user management dashboard)
2.  If not authenticated, redirected to `/login.html`
3.  User clicks "Login with Discord" → redirected to Discord OAuth
4.  User authorizes → Discord redirects to `/auth/discord/callback`
5.  Backend validates:
    *   User is a member of `DISCORD_GUILD_ID`
    *   User has Administrator permissions in that guild
6.  If valid, creates signed session cookie (expires after 7 days)
7.  User redirected to `/users.html` with full access
8.  All admin API endpoints (`/api/admin/*`) require valid authentication

**Future Scalability:**

The current architecture is designed to support future multi-guild dashboards where client guilds can have their own admin panels showing only their server's data. The permission checking logic can be extended to support different access levels based on guild membership.

## Garden Optimization Payment Flow

The bot provides automated garden optimization services with blockchain-based payment verification. Users can request LP yield optimization for 25 JEWEL, and the system automatically processes payments and delivers results.

**Payment Wallet:** `0x498BC270C4215Ca62D9023a3D97c5CAdCD7c99e1`

**Flow Overview:**

1.  **User Request**: User sends DM "optimize my gardens" or similar intent
2.  **LP Detection**: Bot scans user's linked wallet for LP token holdings using `wallet-lp-detector.js`
3.  **Payment Record Created**: Creates `gardenOptimizations` record with status `awaiting_payment`, 2-hour expiry
4.  **Payment Instructions Sent**: Bot DMs payment wallet address and instructions
5.  **Blockchain Monitoring**: `transaction-monitor.js` polls DFK Chain every 15 seconds for incoming transfers
6.  **Payment Verification**: When 25 JEWEL transfer detected:
    *   Validates sender wallet matches user's registered wallet
    *   Checks expiry window (2 hours from request)
    *   **Valid payment**: Updates status to `payment_verified`, stores `txHash`
    *   **Expired payment**: Updates status to `expired`, logs error message
7.  **Automatic Processing**: `optimization-processor.js` polls every 30 seconds for `payment_verified` records:
    *   Atomically locks record (status → `processing`) to prevent race conditions
    *   Validates LP snapshot structure (must be non-empty array)
    *   Fetches user's heroes from GraphQL API
    *   Generates optimization recommendations with before/after yield projections
    *   Sends comprehensive DM report with daily/weekly/monthly JEWEL estimates
    *   Updates status to `completed`, stores full report in `reportPayload`
8.  **Error Handling**: Failed optimizations marked with status `failed` and error message saved

**Database Schema (`gardenOptimizations`):**

*   `id` (serial): Primary key
*   `playerId` (integer): Foreign key to `players` table
*   `status` (varchar): `awaiting_payment` | `payment_verified` | `processing` | `completed` | `failed` | `expired`
*   `requestedAt` (timestamp): Request creation time
*   `expiresAt` (timestamp): 2-hour expiry deadline for payment
*   `expectedAmountJewel` (decimal): Always 25.0
*   `fromWallet` (text): User's wallet address (verified against payment sender)
*   `txHash` (text): Blockchain transaction hash after payment verified
*   `lpSnapshot` (json): Array of LP positions at request time (explicit `::json` cast on insert)
*   `reportPayload` (json): Full optimization results with yield projections (explicit `::json` cast on insert)
*   `errorMessage` (text): Error details if status is `failed`
*   `paymentVerifiedAt` (timestamp): When payment was confirmed
*   `completedAt` (timestamp): When optimization finished

**Critical Implementation Details:**

*   **JSON Serialization**: Drizzle ORM requires explicit SQL casting for JSON columns on PostgreSQL: `sql\`\${JSON.stringify(data)}::json\`` to prevent storing as stringified text
*   **Atomic Status Transitions**: All status updates use `WHERE status = 'expected_current_status'` to prevent race conditions
*   **Expiry Validation**: Transaction monitor checks `expiresAt` before marking payment verified, preventing late payments from being processed
*   **Single Optimization Per User**: System enforces one active optimization request per player
*   **Background Polling**: Both monitor (15s) and processor (30s) run continuously in separate intervals

**Files:**

*   `bot.js`: DM handler creates optimization requests, sends payment instructions
*   `transaction-monitor.js`: Detects JEWEL transfers, verifies sender and expiry
*   `optimization-processor.js`: Background worker processes verified payments
*   `wallet-lp-detector.js`: Scans wallets for LP token holdings
*   `shared/schema.ts`: Database schema definition for `gardenOptimizations` table

## External Dependencies

1.  **Discord API**: Accessed via `discord.js` for bot operations and OAuth2 for web dashboard authentication.
2.  **OpenAI API**: Utilizes `openai` with the `GPT-4o-mini` model for AI-driven conversational responses.
3.  **DeFi Kingdoms GraphQL API**: Public endpoint `https://api.defikingdoms.com/graphql`, queried using `graphql-request`.
4.  **DFK Chain RPC (Crystalvale)**: Public endpoint `https://subnets.avax.network/defi-kingdoms/dfk-chain/rpc`, accessed directly via `ethers.js` for smart contract interactions and event log scanning.
5.  **NPM Packages**: Key packages include `discord.js`, `openai`, `graphql-request`, and `dotenv`.