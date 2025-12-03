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