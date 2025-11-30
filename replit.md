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
    *   **Visual Gene Decoder** (`visual-gene-decoder.js`): Decodes `visualGenes` using identical Kai (base-32) conversion. Provides hex color codes for hair/eyes/skin, gender-specific hairstyle names (16 female and 16 male styles from official DFK summoning trees), named appendages (Cat Ears, Dragon Wings, Royal Crown), and labeled backgrounds (City, Forest, Mountains). Full D/R1/R2/R3 support for all 12 visual traits.
    *   **Integration Layer** (`hero-genetics.js`): Combines both decoders into unified hero genetics output. Used by garden optimizer to detect gardening gene bonuses (40% stamina reduction) across all 4 gene positions. Powers `/debug-hero-genetics` Discord command showing complete genetic breakdown. Verified accurate against official DFK hero data (tested with hero #283911).
    *   **Breeding Chart System**: Comprehensive automatic chart sharing in DMs covering both visual genetics and hero summoning mechanics. The bot intelligently detects question context and attaches relevant official DFK summoning tree charts:
        *   **Visual Genetics Charts (6)**:
            *   Female Hairstyle Chart (`knowledge/female-hairstyle-chart.png`)
            *   Male Hairstyle Chart (`knowledge/male-hairstyle-chart.png`)
            *   Head Appendage Chart (`knowledge/head-appendage-chart.png`)
            *   Back Appendage Chart (`knowledge/back-appendage-chart.png`)
            *   Hair Color Chart (`knowledge/hair-color-chart.png`)
            *   Appendage Color Chart (`knowledge/appendage-color-chart.png`)
        *   **Hero Summoning Chart (1)**:
            *   Hero Class Summoning Chart showing class mutation trees, costs, cooldowns, and rarity chances (`knowledge/hero-class-summoning-chart.png`)
        *   **Intelligent Detection**: Bot analyzes keywords to attach appropriate chart combinations:
            *   Specific traits (e.g., "blue hair") → Single relevant chart
            *   Multiple traits (e.g., "hairstyle and color") → Multiple charts
            *   General questions (e.g., "visual genetics") → All 6 visual charts
            *   Broad summoning questions (e.g., "what can I summon?") → All 7 charts
    *   **Hero Summoning Probability Calculator**: Complete 4×4 Mendelian genetics engine calculating offspring trait probabilities for all genetic combinations:
        *   **Core Engine** (`summoning-engine.js`): Implements proper Mendelian genetics where each parent contributes one of their 4 genes (D, R1, R2, R3) randomly. Creates 16 possible combinations per trait (4×4 grid). Calculates probability distributions for ALL traits: classes, subclasses, professions, passive/active abilities, stat boosts, elements, visual genetics (hair style/color, appendages, eye/skin colors), and backgrounds. **Mutation Tracking**: Identifies which trait values come from recessive genes (R1/R2/R3) not present in either parent's dominant position, enabling visual highlighting of genetic surprises.
        *   **Rarity Calculator** (`rarity-calculator.js`): Based on official DeFi Kingdoms Hero Summoning Rarity Chances chart. Contains exact percentage distributions for all 15 parent rarity combinations (Common+Common → 58.5% Common; Mythic+Mythic → 40% Common with 4% Mythic chance, etc.).
        *   **Discord Formatter** (`summoning-formatter.js`): Formats probability data into three embeds: Summary (top classes, professions, rarity distribution), Stat Genes (abilities, stat boosts, element), and Visual Genes (hairstyles, colors, appendages). Uses color-coded rarity embeds and percentage-sorted trait lists. **Mutation Highlighting**: Displays 🧬 emoji prefix for traits that are mutations (from recessive genes not in either parent's dominant trait), with explanatory footer on each embed.
        *   **Color Names** (`color-names.js`): Converts hex color codes to readable names (e.g., #ff0000 → "Bright Red") for hair, eye, skin, and appendage colors, making genetic probabilities more user-friendly.
        *   **Command** (`/summoning-calc`): Debug command taking two hero IDs, fetching their genetics from blockchain, and displaying complete summoning probabilities matching the official DeFi Kingdoms summoning calculator format.
        *   **Future**: Conversational DM integration planned for flexible input (hero IDs, class descriptions, hypothetical scenarios).
    *   **Tavern Bargain Finder**: Smart marketplace scanner finding cheapest hero pairs with best odds for target class summoning:
        *   **Core Engine** (`bargain-finder.js`): Fetches heroes for sale with genetics, calculates summoning probabilities for all possible pairs, filters by target class probability threshold, sorts by total price.
        *   **Command** (`/find-bargain`): Takes target class (e.g., 'Dreadknight'), minimum probability (default 5%), and optional max price. Returns top 5 cheapest pairs with detailed stats including parent rarities, generations, summon counts, individual prices, and complete probability breakdowns for classes/professions.
        *   **Future**: Conversational DM integration for natural language requests like "find me the cheapest pair for summoning a Sage".

## External Dependencies
*   **Discord API**: Used for bot operations and OAuth2 authentication via `discord.js`.
*   **OpenAI API**: For AI-driven conversational responses using the `GPT-4o-mini` model.
*   **DeFi Kingdoms GraphQL API**: Accessed via `graphql-request` for game data.
*   **DFK Chain RPC (Crystalvale)**: Directly accessed using `ethers.js` for blockchain interactions.
*   **NPM Packages**: `discord.js`, `openai`, `graphql-request`, `dotenv`.