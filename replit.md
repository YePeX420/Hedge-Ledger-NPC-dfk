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
    *   **Hero Pairing Detection** (`hero-pairing.js`): Detects paired heroes in gardening quests using QuestCoreV3 contract. Heroes in the same quest struct are paired together. Uses `getQuestById()` to get `questType` (pool ID) directly from quest data, with fallback to `currentQuest` decoding. Queries historical `QuestReward` events to determine JEWEL vs CRYSTAL farmer role per hero based on which token they've earned. Falls back to position heuristic (first hero = JEWEL, second = CRYSTAL) when no reward history is available.
    *   **Rapid Renewal Service** (`rapid-renewal-service.js`): Detects heroes with Rapid Renewal power-up via PowerUpManagerDiamond contract. RR reduces stamina regen by 3 seconds per hero level. Integrated into garden optimizer to show RR heroes with [RR] markers.
    *   **Pet Garden Bonuses** (`pet-data.js`): Fetches pets from PetCore contract, identifies gardening pets (eggType 2), calculates quest bonus percentages, and annotates heroes with equipped pet data for yield calculations.
*   **Web Dashboard**: React-based admin dashboard with Vite, featuring Discord OAuth authentication, user management, expenses tracking, and settings pages, styled with TailwindCSS and shadcn/ui.
*   **Command System**: Implements core slash commands, including `/optimize-gardens`.
*   **Hero Genetics System**: Decodes both `statGenes` and `visualGenes` using Kai (base-32) encoding to provide detailed hero genetic information, detect gardening bonuses, and support hero analysis commands.
*   **Breeding Chart System**: Automatically shares relevant official DFK summoning tree charts (visual genetics and hero class summoning) based on user queries.
*   **Hero Summoning Probability Calculator**: A 4x4 Mendelian genetics engine calculating offspring trait probabilities for all genetic combinations, including class, profession, abilities, stats, and visual traits, with mutation tracking and rarity calculation.
*   **Tavern Bargain Finder**: Scans the marketplace for hero pairs with optimal genetics and pricing for target class summoning.
*   **Player User Model System**: Classifies players into archetypes, tiers, and engagement states based on behavior, financial activity, and message content, allowing for personalized bot responses.

**Design Decisions:**
*   **Database**: PostgreSQL with Drizzle ORM for persistent storage of player registrations and payments.
*   **Unified Deployment**: Express server integrated into the main bot application.
*   **UI/UX**: Responsive React admin dashboard with dark/light theme support.
*   **Authentication**: Discord OAuth2 for securing admin endpoints.
*   **Payment Automation**: Blockchain monitoring for automatic JEWEL payment verification for premium services.
*   **Wallet Tracking**: Automated daily snapshots of JEWEL, CRYSTAL, and cJEWEL balances.
*   **Debug Features**: A debug dashboard for testing functionalities like garden optimization without payments.

## External Dependencies
*   **Discord API**: For bot operations and OAuth2 authentication.
*   **OpenAI API**: For AI-driven conversational responses using GPT-4o-mini.
*   **DeFi Kingdoms GraphQL API**: For game data access.
*   **DFK Chain RPC (Crystalvale)**: For direct blockchain interactions.
*   **NPM Packages**: `discord.js`, `openai`, `graphql-request`, `dotenv`, `graphql`.