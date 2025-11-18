# Hedge Ledger - Technical Specification Document
**DeFi Kingdoms Discord Bot & Admin Dashboard**

Version: 1.0  
Last Updated: November 18, 2025  
Platform: Node.js + Discord.js + PostgreSQL

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [System Architecture](#system-architecture)
3. [Database Schema](#database-schema)
4. [API Endpoints](#api-endpoints)
5. [Discord Commands](#discord-commands)
6. [Background Services](#background-services)
7. [Blockchain Integration](#blockchain-integration)
8. [Authentication & Security](#authentication--security)
9. [File Structure](#file-structure)
10. [External Dependencies](#external-dependencies)
11. [Environment Variables](#environment-variables)

---

## Project Overview

**Hedge Ledger** is a Discord bot that acts as an in-character NPC assistant for DeFi Kingdoms players. The bot provides AI-powered responses using OpenAI GPT-4o-mini, integrated with live blockchain data from the Crystalvale realm (DFK Chain).

**Core Features:**
- Free NPC navigation assistance for Crystalvale gameplay
- AI-driven conversational interface with game knowledge base
- Live blockchain data queries (heroes, marketplace, wallets)
- Garden pool analytics with APR calculations
- Premium garden optimization service (25 JEWEL)
- Admin dashboard with Discord OAuth2 authentication
- Automated payment verification via blockchain monitoring
- Wallet balance tracking with 7-day change metrics

---

## System Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Discord Platform                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │  Slash Cmds  │  │      DMs     │  │   OAuth2     │     │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘     │
└─────────┼──────────────────┼──────────────────┼─────────────┘
          │                  │                  │
          └──────────────────┼──────────────────┘
                             │
                    ┌────────▼─────────┐
                    │    bot.js        │
                    │ (Main Process)   │
                    └────────┬─────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
┌───────▼────────┐  ┌───────▼────────┐  ┌───────▼────────┐
│  Discord.js    │  │   Express      │  │  OpenAI API    │
│  Client        │  │   Server       │  │  (GPT-4o-mini) │
└───────┬────────┘  └───────┬────────┘  └────────────────┘
        │                    │
        │           ┌────────▼────────┐
        │           │  Auth Endpoints │
        │           │  API Routes     │
        │           │  Static Files   │
        │           └────────┬────────┘
        │                    │
┌───────▼────────────────────▼─────────┐
│         PostgreSQL Database          │
│  (Drizzle ORM + postgres.js driver)  │
└──────────────────────────────────────┘
        │
┌───────▼──────────────────────────────┐
│      DFK Chain RPC Integration       │
│  ┌──────────┐  ┌──────────────────┐ │
│  │ ethers.js│  │ graphql-request  │ │
│  └────┬─────┘  └────┬─────────────┘ │
└───────┼─────────────┼────────────────┘
        │             │
┌───────▼─────────────▼────────────────┐
│   DeFi Kingdoms Blockchain           │
│  - Smart Contracts                   │
│  - GraphQL API                       │
│  - Event Logs                        │
└──────────────────────────────────────┘
```

### Core Components

1. **Discord Bot Layer** (`bot.js`)
   - Handles slash commands, DMs, and user onboarding
   - Intent detection for natural language queries
   - Session management for conversations

2. **AI Response System**
   - OpenAI GPT-4o-mini integration
   - Character personality (`prompt/hedge-ledger.md`)
   - Knowledge base system (`knowledge/` directory)
   - Multilingual support (50+ languages)

3. **Blockchain Integration**
   - GraphQL API for hero/marketplace data
   - Direct RPC calls via ethers.js for gardens
   - Transaction monitoring for payments
   - LP token detection in wallets

4. **Web Dashboard** (Express server)
   - Real-time metrics and analytics
   - User management interface
   - Discord OAuth2 authentication
   - Debugging tools for admins

5. **Background Services**
   - Transaction monitor (payment verification)
   - Optimization processor (garden recommendations)
   - Pool analytics cache (20-minute refresh)
   - Wallet snapshot job (daily at UTC midnight)

---

## Database Schema

### Technology Stack
- **Database**: PostgreSQL
- **ORM**: Drizzle ORM
- **Driver**: postgres.js
- **Schema Location**: `shared/schema.ts`

### Table Overview

| Table Name | Purpose | Key Relationships |
|------------|---------|-------------------|
| `players` | Discord users & wallet addresses | Parent to all user data |
| `jewel_balances` | JEWEL credit system | FK to players |
| `deposit_requests` | JEWEL deposit tracking | FK to players |
| `query_costs` | Query usage & billing | FK to players |
| `garden_optimizations` | Premium service requests | FK to players |
| `wallet_snapshots` | Daily balance tracking | FK to players |
| `interaction_sessions` | Conversation tracking | FK to players |
| `interaction_messages` | Message-level analytics | FK to sessions, players |
| `tavern_sales` | Hero marketplace data | - |
| `hero_snapshots` | Hero trait snapshots | FK to tavern_sales |
| `gene_catalog` | Gene metadata | - |
| `trait_weights` | ML model weights | - |
| `similarity_buckets` | Market comparables | - |
| `trend_data` | Price trends | - |
| `processing_log` | Batch job tracking | - |

---

### Core User Tables

#### `players`
Primary table for Discord users and their engagement data.

```typescript
{
  id: serial PRIMARY KEY,
  discordId: text UNIQUE NOT NULL,
  discordUsername: text NOT NULL,
  firstSeenAt: timestamp DEFAULT CURRENT_TIMESTAMP,
  lastSeenAt: timestamp DEFAULT CURRENT_TIMESTAMP,
  
  // Wallet linking
  wallets: json (string[]), // Array of wallet addresses
  primaryWallet: text, // Main wallet if multiple
  
  // Engagement tracking
  engagementState: text DEFAULT 'visitor',
  // States: visitor, explorer, participant, player, active, committed
  stateLastUpdated: timestamp DEFAULT CURRENT_TIMESTAMP,
  
  // Extractor detection
  extractorScore: numeric(10,2) DEFAULT 0.00,
  extractorClassification: text DEFAULT 'normal',
  // Classifications: normal, extractor_tending, extractor
  extractorLastUpdated: timestamp DEFAULT CURRENT_TIMESTAMP,
  
  // Metrics
  totalSessions: integer DEFAULT 0,
  totalMessages: integer DEFAULT 0,
  totalMilestones: integer DEFAULT 0,
  
  updatedAt: timestamp DEFAULT CURRENT_TIMESTAMP
}
```

**Indexes:**
- `UNIQUE` on `discordId`
- `INDEX` on `primaryWallet`
- `INDEX` on `engagementState`
- `INDEX` on `extractorClassification`

---

#### `jewel_balances`
JEWEL credit system for premium queries.

```typescript
{
  playerId: integer PRIMARY KEY FK(players.id),
  balanceJewel: numeric(30,18) DEFAULT 0,
  lifetimeDepositsJewel: numeric(30,18) DEFAULT 0,
  tier: text DEFAULT 'free',
  // Tiers: free, premium, vip, whale
  
  // Free tier limits (reset daily)
  freeQueriesUsedToday: integer DEFAULT 0,
  freeGardenAprsUsedToday: integer DEFAULT 0,
  freeSummonUsedToday: integer DEFAULT 0,
  lastFreeResetDate: text, // YYYY-MM-DD format
  
  lastQueryAt: timestamp,
  lastDepositAt: timestamp,
  createdAt: timestamp DEFAULT CURRENT_TIMESTAMP,
  updatedAt: timestamp DEFAULT CURRENT_TIMESTAMP
}
```

**Notes:**
- `numeric(30,18)` provides high precision for blockchain token amounts
- Free tier limits reset daily at UTC midnight
- `tier` automatically upgrades based on lifetime deposits

---

#### `deposit_requests`
Tracks JEWEL deposit requests and verification.

```typescript
{
  id: serial PRIMARY KEY,
  playerId: integer FK(players.id),
  status: text DEFAULT 'awaiting_payment',
  // Status flow: awaiting_payment → completed
  
  requestedAt: timestamp DEFAULT CURRENT_TIMESTAMP,
  expiresAt: timestamp NOT NULL, // 2-hour expiry
  requestedAmountJewel: numeric(30,18) NOT NULL,
  fromWallet: text NOT NULL,
  txHash: text, // Populated after verification
  verifiedAt: timestamp,
  completedAt: timestamp
}
```

**Indexes:**
- `INDEX` on `playerId`
- `INDEX` on `status`
- `INDEX` on `requestedAt`

---

#### `query_costs`
Tracks every AI query for billing and analytics.

```typescript
{
  id: serial PRIMARY KEY,
  playerId: integer FK(players.id),
  queryType: text NOT NULL,
  // Types: hero, market, lookup, wallet, garden, summon, genetics, etc.
  
  timestamp: timestamp DEFAULT CURRENT_TIMESTAMP,
  freeTierUsed: boolean DEFAULT false,
  costJewel: numeric(30,18) DEFAULT 0,
  openaiCostUsd: numeric(10,6) DEFAULT 0,
  revenueUsd: numeric(10,6) DEFAULT 0,
  profitUsd: numeric(10,6) DEFAULT 0,
  
  // Metrics
  tokensUsed: integer,
  responseSizeChars: integer,
  latencyMs: integer
}
```

**Indexes:**
- `INDEX` on `playerId`
- `INDEX` on `queryType`
- `INDEX` on `timestamp`

---

### Garden Optimization Service

#### `garden_optimizations`
Premium service for garden LP yield optimization (25 JEWEL).

```typescript
{
  id: serial PRIMARY KEY,
  playerId: integer FK(players.id),
  status: text DEFAULT 'awaiting_payment',
  // Flow: awaiting_payment → payment_verified → processing → completed/failed/expired
  
  requestedAt: timestamp DEFAULT CURRENT_TIMESTAMP,
  expiresAt: timestamp NOT NULL, // 2-hour payment window
  expectedAmountJewel: numeric(30,18) DEFAULT 25.0,
  fromWallet: text NOT NULL,
  txHash: text, // Blockchain transaction hash
  
  // LP snapshot at request time
  lpSnapshot: json, // Array of {poolName, lpAmount, currentApr, ...}
  
  // Optimization results
  reportPayload: json, // Full report with recommendations
  errorMessage: text,
  
  paymentVerifiedAt: timestamp,
  completedAt: timestamp,
  updatedAt: timestamp DEFAULT CURRENT_TIMESTAMP
}
```

**JSON Structure Examples:**

`lpSnapshot`:
```json
[
  {
    "poolName": "CRYSTAL-AVAX",
    "lpAmount": "1234.567",
    "currentApr": "45.23",
    "tvl": "9876543.21"
  }
]
```

`reportPayload`:
```json
{
  "beforeYield": {
    "dailyJewel": "5.23",
    "weeklyJewel": "36.61",
    "monthlyJewel": "156.90"
  },
  "afterYield": {
    "dailyJewel": "7.89",
    "weeklyJewel": "55.23",
    "monthlyJewel": "236.70"
  },
  "recommendations": [
    {
      "poolName": "CRYSTAL-AVAX",
      "assignHero": "Hero #12345",
      "expectedBoost": "50%"
    }
  ]
}
```

**Indexes:**
- `INDEX` on `playerId`
- `INDEX` on `status`
- `INDEX` on `requestedAt`

---

### Wallet Balance Tracking

#### `wallet_snapshots`
Daily snapshots of user wallet balances.

```typescript
{
  id: serial PRIMARY KEY,
  playerId: integer FK(players.id),
  wallet: text NOT NULL,
  asOfDate: timestamp NOT NULL, // UTC midnight
  
  // Token balances (high precision for blockchain)
  jewelBalance: numeric(30,18),
  crystalBalance: numeric(30,18),
  cjewelBalance: numeric(30,18), // Staked JEWEL
  
  // Future: USD prices at snapshot time
  jewelPriceUsd: numeric(15,6),
  crystalPriceUsd: numeric(15,6),
  
  createdAt: timestamp DEFAULT CURRENT_TIMESTAMP
}
```

**Token Addresses (DFK Chain):**
- JEWEL (native): Native gas token
- CRYSTAL (ERC20): `0x04b9dA42306B023f3572e106B11D82aAd9D32EBb`
- cJEWEL (staked): `0x9ed2c155632C042CB8bC20634571fF1CA26f5742`

**Unique Constraint:**
- `UNIQUE(wallet, asOfDate)` - One snapshot per wallet per day

**Indexes:**
- `INDEX` on `playerId`
- `INDEX` on `asOfDate`

---

### Engagement & Conversion Tracking

#### `interaction_sessions`
Tracks conversation sessions with Hedge.

```typescript
{
  id: serial PRIMARY KEY,
  playerId: integer FK(players.id),
  startedAt: timestamp DEFAULT CURRENT_TIMESTAMP,
  endedAt: timestamp,
  
  // Session context
  channelType: text NOT NULL, // 'dm', 'guild_text', 'guild_thread'
  channelId: text,
  guildId: text,
  
  // Metrics
  messageCount: integer DEFAULT 0,
  durationSeconds: integer,
  
  // Content analysis
  topics: json (string[]),
  // e.g., ['onboarding', 'heroes', 'gardens', 'quests', 'summoning']
  commandsUsed: json (string[]),
  blockchainQueriesMade: integer DEFAULT 0,
  
  createdAt: timestamp DEFAULT CURRENT_TIMESTAMP
}
```

**Indexes:**
- `INDEX` on `playerId`
- `INDEX` on `startedAt`

---

#### `interaction_messages`
Individual messages in sessions.

```typescript
{
  id: serial PRIMARY KEY,
  sessionId: integer FK(interaction_sessions.id),
  playerId: integer FK(players.id),
  timestamp: timestamp DEFAULT CURRENT_TIMESTAMP,
  
  // Message analysis
  messageType: text NOT NULL, // 'user_message', 'command', 'bot_response'
  command: text, // e.g., 'hero', 'garden', 'summon'
  topic: text, // Inferred: 'onboarding', 'heroes', 'gardens', etc.
  sentiment: text, // 'positive', 'neutral', 'negative', 'frustrated'
  
  // Blockchain query tracking
  heroIdQueried: bigint,
  walletQueried: text,
  
  // Content stored in DM logs (not in table for privacy)
  content: text, // Not implemented - privacy consideration
  
  createdAt: timestamp DEFAULT CURRENT_TIMESTAMP
}
```

**Indexes:**
- `INDEX` on `sessionId`
- `INDEX` on `playerId`
- `INDEX` on `timestamp`

---

## API Endpoints

### Base URL
- **Development**: `http://localhost:5000`
- **Production**: `https://[your-repl].replit.app`

### Authentication Flow

All admin endpoints require Discord OAuth2 authentication with Administrator permissions in the configured guild.

#### OAuth2 Endpoints

**GET /auth/discord**
- Initiates Discord OAuth2 flow
- Redirects to Discord authorization page
- Scopes: `identify`, `guilds`

**GET /auth/discord/callback**
- OAuth2 callback handler
- Exchanges authorization code for access token
- Verifies user is guild admin
- Creates signed session cookie (7-day expiry)
- Response: Redirects to `/users.html` or `/login.html?error=...`

**GET /auth/logout**
- Clears session cookie
- Response: `{"success": true}`

**GET /auth/status**
- Checks current authentication status
- Response: `{"authenticated": boolean, "user": {...}}`

---

### Public Endpoints

**GET /api/health**
- Health check endpoint
- Response:
```json
{
  "status": "ok",
  "timestamp": "2025-11-18T02:43:21.000Z"
}
```

---

### Analytics Endpoints

**GET /api/analytics/overview**
- Summary of key metrics
- Authentication: None required
- Response:
```json
{
  "players": {
    "total": 150,
    "withBalance": 45
  },
  "deposits": {
    "total": 67,
    "completed": 62,
    "totalJewel": "1543.250000000000000000"
  },
  "balances": {
    "totalBalance": "234.567000000000000000",
    "activeBalances": 23
  },
  "revenue": {
    "totalRevenue": "45.67",
    "totalProfit": "38.92",
    "totalQueries": 1234,
    "paidQueries": 567
  }
}
```

**GET /api/analytics/players**
- List of players with pagination
- Query params: `limit` (default: 50), `offset` (default: 0)
- Response:
```json
[
  {
    "id": 7,
    "discordId": "123456789012345678",
    "discordUsername": "yepex",
    "tier": "free",
    "balance": "0.000000000000000000",
    "firstSeenAt": "2025-11-17T18:56:40.000Z"
  }
]
```

**GET /api/analytics/deposits**
- Recent deposit requests
- Query params: `limit`, `offset`
- Response: Array of deposit request objects

**GET /api/analytics/query-breakdown**
- Query type breakdown with revenue
- Response:
```json
[
  {
    "queryType": "garden",
    "count": 45,
    "totalRevenue": "23.45",
    "freeTier": 12
  }
]
```

---

### Admin Endpoints
All admin endpoints require `requireAuth` + `requireAdmin` middleware.

**GET /api/admin/users**
- Comprehensive user management list
- Returns: Array of user objects with:
  - Basic info (Discord ID, username)
  - Wallet balances (JEWEL, CRYSTAL, cJEWEL)
  - 7-day % change
  - Lifetime deposits
  - Query statistics
  - Recent messages
- Response:
```json
[
  {
    "id": 7,
    "discordId": "123456789012345678",
    "discordUsername": "yepex",
    "walletAddress": "0x1a9f02011c917482345b86f2c879bce988764098",
    "tier": "free",
    "balance": "0.000000000000000000",
    "lifetimeDeposits": "25.000000000000000000",
    "jewelBalance": "24.724618184285414087",
    "crystalBalance": "135.998043584804254008",
    "cjewelBalance": "33145.379001637282259344",
    "sevenDayChangePercent": null,
    "queryStats": {
      "totalQueries": 15,
      "totalCost": "12.34",
      "totalProfit": "10.56",
      "freeQueries": 8
    },
    "recentMessages": [...]
  }
]
```

**PATCH /api/admin/users/:id/tier**
- Manually update user tier
- Body: `{"tier": "premium"}`
- Tiers: `free`, `premium`, `vip`, `whale`
- Response: `{"success": true, "playerId": 7, "newTier": "premium"}`

**DELETE /api/admin/users/:discordId**
- Delete user and all associated data
- Cascades to: balances, deposits, queries, sessions, messages
- Response: `{"success": true, "discordId": "123..."}`

**POST /api/admin/restart-bot**
- Restarts bot process (kills all `tsx bot.js` processes)
- Workflow auto-restarts the service
- Response: `{"success": true, "message": "Bot restart initiated"}`

---

### Debug Endpoints
Admin-only debugging tools.

**POST /api/debug/clear-pool-cache**
- Stops pool analytics cache
- Response: `{"success": true, "message": "Pool cache cleared"}`

**POST /api/debug/refresh-pool-cache**
- Restarts pool analytics cache
- Response: `{"success": true, "message": "Pool cache restart initiated"}`

**POST /api/debug/test-wallet-detection**
- Tests wallet address regex
- Response: Test results for various wallet formats

**POST /api/debug/test-new-user-flow**
- Previews new user onboarding message
- Response: Rendered welcome message

**POST /api/debug/test-intent-parser**
- Tests intent detection
- Body: `{"message": "Show me garden APRs"}`
- Response: Detected intent and parameters

**POST /api/debug/restart-monitor**
- Restarts transaction monitoring service
- Response: `{"success": true}`

**GET /api/debug/system-health**
- Comprehensive health check
- Response:
```json
{
  "timestamp": "2025-11-18T02:43:21.000Z",
  "components": {
    "database": {"status": "connected"},
    "discord": {"status": "connected"},
    "openai": {"status": "configured"},
    "monitor": {"status": "running"}
  }
}
```

**GET /api/debug/recent-errors**
- Placeholder for error log retrieval
- Response: `{"count": 0, "errors": []}`

**GET /api/debug/all-logs**
- Placeholder for all logs
- Response: Simulated log entries

---

## Discord Commands

### Command Registration
All commands are registered via `register-commands.js` using Discord's REST API.

### Command List

| Command | Description | Options | Cost |
|---------|-------------|---------|------|
| `/help` | List Hedge Ledger commands | None | Free |
| `/npc` | Chat with Hedge (free text) | `message` (required) | Free |
| `/hero` | Get LIVE hero data | `id` (required) | Free tier available |
| `/market` | Analyze marketplace listings | `class`, `max_price`, `limit` | Free tier available |
| `/lookup` | Search heroes by criteria | `class`, `profession`, `for_sale`, `min_level` | Free tier available |
| `/wallet` | View wallet's heroes | `address` (required) | Free tier available |
| `/garden` | Live garden pool analytics | `pool`, `wallet`, `realm` | Free tier available |
| `/quest` | Quest recommendations | `goal` (required) | Free |
| `/stats` | Portfolio summary | `wallet` | Free tier available |
| `/walkthrough` | Step-by-step guide | None | Free |
| `/summon` | Calculate summoning outcome | `parent1`, `parent2` | Free tier available |
| `/findparents` | Find optimal breeding pairs | `desired_class`, `desired_stats` | Premium |
| `/genetics` | Analyze genetic potential | `hero_id` | Premium |
| `/deposit` | Deposit JEWEL credits | None | N/A |
| `/balance` | Check JEWEL balance | None | Free |
| `/optimize-gardens` | Garden yield optimization | None | **25 JEWEL** |
| `/analytics` | [ADMIN] View bot analytics | None | Admin only |

---

### Command Flow Example: `/optimize-gardens`

1. **User executes `/optimize-gardens`**
2. **Bot checks prerequisites:**
   - User must have linked wallet
   - User must have LP tokens staked in gardens
3. **Bot creates optimization request:**
   - Status: `awaiting_payment`
   - Expiry: 2 hours from now
   - Captures current LP snapshot
4. **Bot sends DM with payment instructions:**
   - Payment address: Hedge's wallet
   - Amount: 25 JEWEL
   - Expiry time
5. **Transaction monitor detects payment:**
   - Verifies sender matches user's wallet
   - Verifies amount >= 25 JEWEL
   - Checks expiry window
   - Updates status to `payment_verified`
6. **Optimization processor picks up request:**
   - Fetches user's heroes from blockchain
   - Analyzes LP positions
   - Generates recommendations
   - Calculates before/after yield
   - Sends comprehensive DM report
   - Updates status to `completed`

---

## Background Services

### 1. Transaction Monitor
**File**: `transaction-monitor.js`

**Purpose**: Monitor DFK Chain for JEWEL transfers to Hedge's wallet

**Implementation**:
- Polls RPC every 15 seconds for new blocks
- Scans JEWEL token Transfer events
- Matches transfers to pending deposit/optimization requests
- Verifies sender wallet and amount
- Checks expiry windows

**Event Listening**:
```javascript
jewelContract.on("Transfer", (from, to, amount, event) => {
  if (to === HEDGE_WALLET_ADDRESS) {
    // Match to pending requests
    // Verify and credit
  }
});
```

**Critical Bug**: Currently only watches ERC20 Transfer events. Native JEWEL transfers are missed. Fix planned.

---

### 2. Optimization Processor
**File**: `optimization-processor.js`

**Purpose**: Process verified garden optimization requests

**Polling Interval**: 30 seconds

**Workflow**:
1. Query for `status = 'payment_verified'` records
2. Atomically lock record (`status → 'processing'`)
3. Validate LP snapshot structure
4. Fetch user's heroes via GraphQL
5. Generate optimization recommendations
6. Calculate before/after yield projections
7. Send comprehensive DM report
8. Update status to `completed`
9. Create/update `jewelBalances` record (+25 lifetime deposits)

**Error Handling**: Failed optimizations marked `status = 'failed'` with error message

---

### 3. Pool Analytics Cache
**File**: `pool-cache.js`

**Purpose**: Cache Crystalvale garden pool analytics

**Refresh Interval**: 20 minutes

**Data Collected**:
- Pool APRs (with JEWEL/CRYSTAL price from price graph)
- TVL breakdowns
- Token pair prices
- Harvestable rewards (if wallet provided)

**Implementation**:
- Discovers 14 active pools
- Builds price graph from 577 LP pairs
- Analyzes pool stats using smart contract calls
- Stores in-memory cache with graceful fallbacks

**Performance**: Initial load ~6 minutes, subsequent refreshes ~6 minutes

---

### 4. Wallet Snapshot Job
**File**: `wallet-snapshot-job.js`

**Purpose**: Daily snapshots of wallet balances

**Schedule**: UTC midnight (00:00)

**Workflow**:
1. Calculate time until next UTC midnight
2. Schedule snapshot capture
3. Query all players with `primaryWallet`
4. Batch fetch balances (up to 10 wallets per batch)
5. Store snapshots with `asOfDate = today at 00:00 UTC`
6. Schedule next run for tomorrow

**Balance Fetching**:
- Native JEWEL: `provider.getBalance(wallet)`
- CRYSTAL: ERC20 contract `balanceOf(wallet)`
- cJEWEL: ERC20 contract `balanceOf(wallet)`

**Deduplication**: `UNIQUE(wallet, asOfDate)` constraint with `onConflictDoNothing()`

---

## Blockchain Integration

### DFK Chain RPC
- **Network**: DFK Chain (Subnet on Avalanche)
- **RPC URL**: `https://subnets.avax.network/defi-kingdoms/dfk-chain/rpc`
- **Chain ID**: 53935
- **Library**: ethers.js v6

### Smart Contracts

**JEWEL Token (ERC20)**:
- Address: `0x77f2656d04E158f915bC22f07B779D94c1DC47Ff`
- Used for: Transaction monitoring

**CRYSTAL Token (ERC20)**:
- Address: `0x04b9dA42306B023f3572e106B11D82aAd9D32EBb`
- Used for: Balance snapshots, pricing

**cJEWEL Token (Staked JEWEL)**:
- Address: `0x9ed2c155632C042CB8bC20634571fF1CA26f5742`
- Used for: Balance snapshots

**LP Staking Contract**:
- Address: `0xB04e8D6aED037904B77A9F0b08002592925833b7`
- Used for: Detecting staked LP tokens in gardens

---

### GraphQL API
- **Endpoint**: `https://api.defikingdoms.com/graphql`
- **Library**: `graphql-request`

**Queries**:
- Hero data by ID
- Marketplace listings
- Wallet's heroes
- Hero search/lookup

**Example Query**:
```graphql
query GetHero($id: ID!) {
  hero(id: $id) {
    id
    owner
    mainClass
    subClass
    level
    summons
    maxSummons
    statBoost1
    statBoost2
    passive1
    passive2
    active1
    active2
  }
}
```

---

### Wallet LP Token Detection
**File**: `wallet-lp-detector.js`

**Purpose**: Scan wallets for staked LP tokens

**Implementation**:
```javascript
// For each pool (pool ID 0-13)
const userInfo = await lpStakingContract.userInfo(poolId, walletAddress);
if (userInfo.amount > 0) {
  // User has LP tokens staked in this pool
  lpPositions.push({
    poolId,
    poolName,
    lpAmount: userInfo.amount,
    currentApr
  });
}
```

---

## Authentication & Security

### Discord OAuth2 Flow

**Configuration**:
- Client ID: `process.env.DISCORD_CLIENT_ID`
- Client Secret: `process.env.DISCORD_CLIENT_SECRET`
- Redirect URI: `process.env.REDIRECT_URI`
- Required Guild: `process.env.DISCORD_GUILD_ID`

**Authorization Flow**:
1. User visits protected page (`/users.html`)
2. Redirected to `/login.html` if not authenticated
3. User clicks "Login with Discord"
4. Redirected to Discord OAuth with scopes: `identify`, `guilds`
5. User authorizes → Discord redirects to `/auth/discord/callback`
6. Backend:
   - Exchanges code for access token
   - Fetches user info and guilds
   - Verifies user is member of `DISCORD_GUILD_ID`
   - Checks Administrator permissions
   - Creates signed session cookie
7. User redirected to `/users.html`

**Session Management**:
- Lightweight, no external dependencies
- Signed cookies using HMAC-SHA256
- Session data: `{userId, username, expires}`
- Signature: `base64(data).hmac_sha256(data, SESSION_SECRET)`
- Expiry: 7 days

**Security Features**:
- HMAC signature prevents tampering
- Expiry timestamp enforced
- Guild membership required
- Administrator role required
- No session storage (stateless)

---

### API Protection

**Middleware**:
```javascript
function requireAuth(req, res, next) {
  const sessionCookie = parseCookie(req.headers.cookie, 'session');
  const sessionData = verifyCookie(sessionCookie);
  if (!sessionData) {
    return res.status(401).json({
      error: 'Authentication required',
      redirectTo: '/login.html'
    });
  }
  req.session = sessionData;
  next();
}

function requireAdmin(req, res, next) {
  // Guild admin check already performed during OAuth
  // Session existence implies admin status
  next();
}
```

---

## File Structure

```
.
├── bot.js                          # Main application entry point
├── register-commands.js            # Discord slash command registration
│
├── shared/
│   └── schema.ts                   # Database schema (Drizzle ORM)
│
├── Background Services
├── transaction-monitor.js          # Payment verification
├── optimization-processor.js       # Garden optimization processing
├── pool-cache.js                   # Pool analytics caching
├── wallet-snapshot-job.js          # Daily balance snapshots
│
├── Blockchain Integration
├── blockchain-balance-fetcher.js   # Multi-token balance queries
├── wallet-lp-detector.js           # LP token detection
├── garden-analytics.js             # Pool analytics engine
├── onchain-data.js                 # Blockchain data utilities
│
├── Economic System
├── pricing-engine.js               # Query pricing logic
├── balance-credit.js               # JEWEL credit processing
├── balance-middleware.js           # Free tier enforcement
├── deposit-flow.js                 # Deposit request handling
│
├── AI & Intent System
├── intent-parser.js                # Natural language intent detection
├── intent-router.js                # Route DMs to appropriate handlers
├── agentic-tools.js                # AI function calling tools
│
├── Analytics & Tracking
├── player-tracking.js              # Engagement & conversion tracking
├── analytics.js                    # Dashboard analytics
│
├── Utilities
├── quick-data-fetcher.js           # Fast data fetching with cache
├── cache-ready-queue.js            # DM queue for slow requests
│
├── Future Features
├── fve-engine.js                   # Fair value engine (not implemented)
├── genetics-engine.js              # Genetics analysis (not implemented)
├── price-feed.js                   # USD price feed (not implemented)
│
├── AI Configuration
├── prompt/
│   └── hedge-ledger.md             # Character personality prompt
│
├── knowledge/                      # Game knowledge base
│   ├── crystalvale-navigation.md   # Crystalvale UI walkthrough
│   ├── heroes-mechanics.md         # Hero system
│   ├── gardens-mechanics.md        # Garden system
│   ├── questing-mechanics.md       # Quest system
│   └── summoning-mechanics.md      # Summoning system
│
├── public/                         # Static web dashboard
│   ├── index.html                  # Main dashboard
│   ├── users.html                  # User management (admin)
│   ├── login.html                  # Discord OAuth login
│   ├── styles.css                  # Dashboard styles
│   └── script.js                   # Dashboard JavaScript
│
└── Database Utilities
    ├── backfill-snapshot.js        # One-time snapshot backfill
    └── db.js                       # Database connection
```

---

## External Dependencies

### NPM Packages

**Core Framework**:
- `discord.js` - Discord bot client
- `express` - HTTP server

**Database**:
- `drizzle-orm` - TypeScript ORM
- `drizzle-kit` - Schema migrations
- `postgres` - PostgreSQL driver (postgres.js)
- `@types/pg` - TypeScript types

**Blockchain**:
- `ethers` - Ethereum/DFK Chain interaction
- `graphql-request` - GraphQL client

**AI**:
- `openai` - OpenAI API client

**Utilities**:
- `dotenv` - Environment variables
- `nanoid` - Unique ID generation
- `zod` - Schema validation
- `decimal.js` - High-precision math

---

### External APIs

**Discord API**:
- Bot operations (via discord.js)
- OAuth2 authentication
- User management

**OpenAI API**:
- Model: `gpt-4o-mini`
- Streaming responses supported
- Function calling for tool use

**DeFi Kingdoms GraphQL API**:
- Endpoint: `https://api.defikingdoms.com/graphql`
- Hero data, marketplace, wallets

**DFK Chain RPC**:
- Endpoint: `https://subnets.avax.network/defi-kingdoms/dfk-chain/rpc`
- Smart contract calls
- Event log scanning

---

## Environment Variables

### Required Variables

```bash
# Discord Bot
DISCORD_TOKEN=your_bot_token
DISCORD_CLIENT_ID=your_client_id
DISCORD_CLIENT_SECRET=your_client_secret
DISCORD_GUILD_ID=your_guild_id

# OpenAI
OPENAI_API_KEY=your_openai_key

# Database
DATABASE_URL=postgresql://user:pass@host:port/dbname

# Session Management
SESSION_SECRET=random_32_byte_hex_string
REDIRECT_URI=http://localhost:5000/auth/discord/callback

# Blockchain
HEDGE_WALLET_ADDRESS=0x498BC270C4215Ca62D9023a3D97c5CAdCD7c99e1
```

### Optional Variables

```bash
# OpenAI Configuration
OPENAI_MODEL=gpt-4o-mini  # Default

# Server Configuration
PORT=5000  # Default
```

---

## Performance & Scalability

### Current Metrics

**Response Times**:
- Simple queries: <2s
- Blockchain queries: 2-5s
- Garden analytics: 5-10s (cached)
- Pool cache refresh: ~6 minutes

**Database Performance**:
- User query batching prevents N+1 queries
- Indexes on all foreign keys
- Composite indexes on date ranges

**Bottlenecks**:
- Pool analytics initial load (6 minutes)
- GraphQL API rate limits (not documented)
- RPC rate limits (not encountered)

### Scalability Considerations

**Current Limits**:
- Single bot instance (no clustering)
- In-memory pool cache (single server)
- Session storage in memory (ephemeral)

**Future Improvements**:
- Redis for distributed caching
- Database connection pooling
- Horizontal scaling with load balancer
- Persistent session storage

---

## Known Issues & Future Work

### Critical Bugs

1. **Native JEWEL Transfer Detection**
   - Transaction monitor only watches ERC20 Transfer events
   - Native JEWEL transfers are missed
   - **Fix**: Add separate native transfer detection

### Future Features

1. **Fair Value Engine**
   - Schema implemented
   - Hero price prediction model
   - Market comps analysis

2. **USD Price Feed**
   - Real-time token pricing
   - Portfolio valuation
   - Revenue tracking in USD

3. **Enhanced Analytics**
   - Extractor detection algorithms
   - Engagement state transitions
   - Conversion funnel analytics

4. **Testing**
   - Unit tests for critical paths
   - Integration tests for blockchain
   - E2E tests for Discord commands

---

## Glossary

**DFK Chain**: DeFi Kingdoms blockchain (Avalanche subnet)

**Crystalvale**: Realm in DeFi Kingdoms game

**JEWEL**: Native token on DFK Chain

**CRYSTAL**: Governance token for Crystalvale

**cJEWEL**: Staked/locked JEWEL token

**LP Token**: Liquidity Provider token

**Garden**: Liquidity mining pool

**APR**: Annual Percentage Rate (yield)

**Tavern**: Hero marketplace

**Summon**: Hero breeding

**NPC**: Non-Player Character (Hedge Ledger's persona)

**Extractor**: User who extracts value without contributing

---

## Revision History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-11-18 | Initial technical specification |

---

**Document End**
