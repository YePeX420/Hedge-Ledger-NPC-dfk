# Hedge Ledger - DeFi Kingdoms Discord Bot

## Overview
Hedge Ledger is an AI-powered Discord bot designed for DeFi Kingdoms players in Crystalvale. It functions as an in-character NPC assistant, aiming to enrich the player experience by providing in-game navigation, answering questions, analyzing heroes, browsing marketplace listings, explaining game mechanics, and offering a premium garden LP yield optimization service. The bot leverages AI, a specialized game knowledge base, and live blockchain data to deliver valuable insights and boost player engagement within the DeFi Kingdoms ecosystem. The project envisions becoming an indispensable tool for DFK players, enhancing their strategic decisions and overall enjoyment of the game.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture
The project employs a Node.js backend utilizing Discord.js for bot functionalities and an Express server for an administrative dashboard.

**Core Architectural Decisions:**
*   **Discord Bot Layer**: Handles all Discord interactions and slash commands.
*   **AI Response System**: Integrates OpenAI's GPT-4o-mini for AI-driven conversational responses, maintaining character personality, leveraging game knowledge, and supporting multiple languages.
*   **Blockchain Integration**: Connects to the DeFi Kingdoms GraphQL API for comprehensive game data and uses `ethers.js` for direct interactions with the DFK Chain RPC.
*   **Web Dashboard**: A React-based admin dashboard, built with Vite, TailwindCSS, and shadcn/ui, providing user management, expense tracking, multi-wallet support, and Discord OAuth authentication.
*   **Hero Systems**: Includes advanced tools for hero genetics decoding, breeding charts, summoning probability, marketplace bargain finding, and optimal hero pairing.
*   **Player & League Systems**: Features a personalized player user model, competitive league sign-up with smurf detection, and a gamified challenge/achievement system.
*   **Combat & Drop Rate Analysis**: Processes combat data via RPC log scanning and indexes PVE drop rates across multiple chains.
*   **Financial & Market Analytics**: Provides dashboards and indexers for bridge flow, extractor analysis, bridge pricing reconciliation, TVL, token registry, unified pools, jeweler data, and gardening quest rewards.
*   **PvP & Gaming Systems**: Incorporates a PVP tournament indexer, level racer for class arenas, leaderboards, and a seasonal engine.
*   **Yield Optimization**: Offers a yield calculator with wallet lookup and an optimizer for recommending ideal liquidity pool allocations.
*   **Quest Optimizer**: Analyzes wallet heroes to suggest optimal quest assignments based on various performance metrics.
*   **AI Consultant with Wallet Analysis**: An AI chat interface that provides personalized quest recommendations, hero analysis, and strategic advice based on linked wallet addresses and hero data, including reroll status and transcendence multipliers.
*   **PVE Hunt Companion**: A real-time battle advisor accessible via a Chrome Extension. It uses a WebSocket server to receive battle state snapshots, runs a deterministic scoring engine against an enemy catalog, and broadcasts ranked action recommendations.
*   **DFK Telemetry Backend**: Provides an HTTP fallback for the Chrome Extension, collecting battle log events, unit snapshots, and turn snapshots for reconciliation and analysis.
*   **DFK Tournaments UI**: A multi-level tournament browser displaying on-chain bracket data, open battles, session views, bout details, and visual single-elimination brackets with hero and reward information.
*   **Database**: PostgreSQL with Drizzle ORM, hosted on Neon serverless.
*   **Deployment**: Unified Express server integrating bot and web functionalities.
*   **UI/UX**: Responsive React dashboard with theming and environment indicators.
*   **Authentication**: Discord OAuth2 for admin and password-based user management for dashboard access with granular permissions.
*   **Payment Automation**: Monitors blockchain for JEWEL payment verification.
*   **Wallet Tracking**: Daily snapshots of token balances.
*   **Environment-Aware Indexers**: Indexers are configured to auto-start only in production environments.

## External Dependencies
*   **Discord API**: For bot operations, user interactions, and OAuth2 authentication.
*   **OpenAI API**: Specifically GPT-4o-mini, for AI-driven conversational capabilities.
*   **DeFi Kingdoms GraphQL API**: For comprehensive in-game data, hero details, and marketplace information.
*   **DFK Chain RPC (Crystalvale)**: For direct, low-level blockchain interactions and real-time data retrieval.
*   **DFK Internal Tournament API**: An internal Firebase-authenticated endpoint used for accessing bracket tournament data.