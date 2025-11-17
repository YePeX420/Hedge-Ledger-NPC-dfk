# Hedge Ledger - DeFi Kingdoms Discord Bot

## Overview

Hedge Ledger is a Discord bot designed as an in-character NPC assistant for DeFi Kingdoms players. Embodying "Hedge Ledger, the Reluctant Accountant of Serendale," a sarcastic and brilliant character, the bot provides AI-powered responses to help players with game navigation. It integrates OpenAI's GPT-4o-mini with a comprehensive DeFi Kingdoms knowledge base and live blockchain data from the game's GraphQL API. Its primary purpose is to offer an entertaining, character-driven helper that can answer questions, analyze heroes, browse marketplace listings, and explain game mechanics through Discord, with a current focus on Crystalvale gameplay. The project aims to be the definitive Crystalvale navigation assistant, providing free, comprehensive game interface guidance to new players.

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
*   **Web Dashboard**: An Express server integrated into `bot.js` hosts a static HTML dashboard displaying real-time metrics and an admin user management system.
*   **Command System**: Ten slash commands are registered with Discord for core functionalities.

**Design Decisions:**

*   **Stateless Bot**: The system currently uses in-memory state only, lacking persistent storage for user preferences, conversation history, or analytics.
*   **No Database**: While Drizzle ORM configuration exists, no database is actively used by the bot's functionality.
*   **Unified Deployment**: The Express server for the dashboard is integrated directly into the main `bot.js` file.
*   **UI/UX**: The admin dashboard uses pure HTML/CSS/JavaScript, no build step required, responsive design with dark theme matching the main dashboard.
*   **Feature Specifications**: Includes a comprehensive NPC navigation system covering all 37 Crystalvale NPCs across 14 locations, multilingual support across 50+ languages, and enhanced garden interaction features such as APR range display and deprecated pool filtering.
*   **Authentication**: Discord OAuth2 authentication protects admin endpoints using lightweight session management with signed cookies. No external packages required - built with native Node.js crypto and fetch API. Designed to scale for future client guild dashboards.

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

## External Dependencies

1.  **Discord API**: Accessed via `discord.js` for bot operations and OAuth2 for web dashboard authentication.
2.  **OpenAI API**: Utilizes `openai` with the `GPT-4o-mini` model for AI-driven conversational responses.
3.  **DeFi Kingdoms GraphQL API**: Public endpoint `https://api.defikingdoms.com/graphql`, queried using `graphql-request`.
4.  **DFK Chain RPC (Crystalvale)**: Public endpoint `https://subnets.avax.network/defi-kingdoms/dfk-chain/rpc`, accessed directly via `ethers.js` for smart contract interactions and event log scanning.
5.  **NPM Packages**: Key packages include `discord.js`, `openai`, `graphql-request`, and `dotenv`.