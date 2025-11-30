# Hedge Ledger - DeFi Kingdoms Discord Bot

## Overview
Hedge Ledger is a Discord bot acting as an in-character NPC assistant for DeFi Kingdoms players. It uses AI (GPT-4o-mini) with a game knowledge base and live blockchain data to provide in-game navigation assistance, answer questions, analyze heroes, browse marketplace listings, and explain game mechanics. The bot focuses on Crystalvale gameplay, offering free comprehensive guidance and premium garden LP yield optimization services for 25 JEWEL. Its goal is to be the definitive Crystalvale navigation assistant.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
The project uses a Node.js backend with Discord.js for bot functionality and an integrated Express server for an admin dashboard.

**Core Components:**
*   **Discord Bot Layer**: Handles all Discord interactions, including slash commands, direct messages, and user onboarding, with intelligent intent detection.
*   **AI Response System**: Integrates OpenAI's GPT-4o-mini, configured with a specific character personality and a comprehensive knowledge base covering various game aspects, supporting multiple languages.
*   **Blockchain Integration**:
    *   **GraphQL Integration**: Uses `graphql-request` for DeFi Kingdoms GraphQL API access (hero data, marketplace, wallet analysis).
    *   **DFK Chain RPC Interaction**: Employs `ethers.js` for direct interaction with the DFK Chain RPC for detailed Crystalvale garden pool analytics, LP token detection, and smart contract data.
    *   **Pool Analytics Cache**: A background system (`pool-cache.js`) periodically refreshes and stores DeFi Kingdoms pool analytics in memory for quick responses.
    *   **Wallet LP Token Detection**: Scans user wallets for staked LP tokens in garden pools to facilitate yield optimization.
*   **Web Dashboard**: An Express server hosts a static HTML dashboard displaying real-time metrics and an admin user management system.
*   **Command System**: Implements eleven core slash commands for Discord functionality, including `/optimize-gardens`.

**Design Decisions:**
*   **Database**: PostgreSQL with Drizzle ORM for persistent storage of player registrations and payment tracking.
*   **Unified Deployment**: Express server is integrated directly into the main bot application.
*   **UI/UX**: Admin dashboard features pure HTML/CSS/JavaScript with a responsive dark theme, requiring no build step.
*   **Feature Specifications**: Includes a comprehensive NPC navigation system for Crystalvale, multilingual support, and enhanced garden interaction features like APR ranges.
*   **Authentication**: Discord OAuth2 protects admin endpoints using lightweight, native Node.js session management with signed cookies.
*   **Payment Automation**: The garden optimization service uses blockchain monitoring to automatically verify JEWEL payments and trigger processing.
*   **Wallet Tracking**: Automated daily snapshots of JEWEL, CRYSTAL, and cJEWEL balances, with 7-day change tracking and lifetime deposit monitoring integrated into the admin dashboard.
*   **Debug Features**: Includes a debug settings dashboard with a payment bypass toggle for testing garden optimization without JEWEL payment, shared between the admin UI and bot via `debug-settings.js`.
*   **Hero Genetics System**: Complete genetics decoding layer with two specialized decoders using official DeFi Kingdoms Kai (base-32) encoding:
    *   **Stat Gene Decoder** (`gene-decoder.js`): Decodes `statGenes` using Kai (base-32) encoding matching the official @thanpolas/degenking library implementation. Each BigInt converts to 48 Kai characters (12 traits × 4 genes). Extracts all 4 gene tiers (D, R1, R2, R3) for classes, professions, passive/active abilities, stat boosts, and elements. Uses official gene mappings with proper gaps (e.g., class values 0-11, 16-21, 24-26, 28; professions at even-spaced values 0, 2, 4, 6). Maps abilities to official DFK combat names (Poisoned Blade, Clutch, Leadership, Heal, Resurrection, etc.).
    *   **Visual Gene Decoder** (`visual-gene-decoder.js`): Decodes `visualGenes` using identical Kai (base-32) conversion. Provides hex color codes for hair/eyes/skin, named appendages (Cat Ears, Dragon Wings, Royal Crown), and labeled backgrounds (City, Forest, Mountains). Full D/R1/R2/R3 support for all 12 visual traits.
    *   **Integration Layer** (`hero-genetics.js`): Combines both decoders into unified hero genetics output. Used by garden optimizer to detect gardening gene bonuses (40% stamina reduction) across all 4 gene positions. Powers `/debug-hero-genetics` Discord command showing complete genetic breakdown. Verified accurate against official DFK hero data (tested with hero #283911).

## External Dependencies
*   **Discord API**: Used for bot operations and OAuth2 authentication via `discord.js`.
*   **OpenAI API**: For AI-driven conversational responses using the `GPT-4o-mini` model.
*   **DeFi Kingdoms GraphQL API**: Accessed via `graphql-request` for game data.
*   **DFK Chain RPC (Crystalvale)**: Directly accessed using `ethers.js` for blockchain interactions.
*   **NPM Packages**: `discord.js`, `openai`, `graphql-request`, `dotenv`.