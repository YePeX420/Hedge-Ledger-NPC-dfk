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

## Fair Value Index (FVI) System

### Overview

The Fair Value Index is a machine learning-powered system that estimates the fair market value of DeFi Kingdoms heroes based on their traits, stats, and historical marketplace data. The FVI enables players to:
- Identify undervalued heroes in the marketplace
- Price their own heroes competitively
- Understand trait premiums and market trends
- Make informed trading and breeding decisions

**Status**: Schema implemented, logic designed but not yet deployed

---

### Core Concepts

#### Floor Hero Definition

A **floor hero** is defined as a hero with minimal desirable traits used as a baseline for valuation:

**Criteria**:
- Level 1 (no experience investment)
- 0/11 summons remaining (fully summoned, no breeding value)
- Common generation (Gen 10+)
- No rare traits (standard primary stats only)
- No professions unlocked
- No passive/active skills above Basic tier
- Main class only (no valuable sub-class)

**Purpose**: Floor heroes establish the minimum value for each class. All trait premiums are calculated relative to the floor.

**Example Floor Heroes by Class**:
```json
{
  "Warrior": {
    "minPrice": "15 JEWEL",
    "traits": "Gen 15, Level 1, 0/11 summons, basic stats"
  },
  "Paladin": {
    "minPrice": "45 JEWEL",
    "traits": "Gen 15, Level 1, 0/11 summons, basic stats"
  },
  "DarkKnight": {
    "minPrice": "85 JEWEL",
    "traits": "Gen 15, Level 1, 0/11 summons, basic stats"
  }
}
```

---

### Trait Premium Extraction

#### Trait Categories

1. **Class & Subclass**
   - Main class (Warrior, Paladin, Wizard, etc.)
   - Subclass rarity (impacts stat potential)
   - Class synergies (e.g., DarkKnight/Paladin)

2. **Summoning Value**
   - Summons remaining (0-11)
   - Generation (Gen 0-15+)
   - Breeding potential

3. **Stats & Boosts**
   - Primary stat values (STR, DEX, AGI, VIT, END, INT, WIS, LCK)
   - Stat boosts (+HP, +MP, +STR%, etc.)
   - Total stat potential

4. **Skills**
   - Passive abilities (Basic, Advanced, Elite, Exalted)
   - Active skills (Basic, Advanced, Elite, Exalted)
   - Skill synergy with class

5. **Professions**
   - Unlocked professions (Mining, Gardening, Foraging, Fishing)
   - Profession level impact on quest rewards

6. **Appearance Traits** (minor impact)
   - Visual rarity
   - Shiny/animated features

---

#### Trait Weight Calculation Process

**Step 1: Define Trait Hierarchy**

Traits are ranked by impact on hero value:

| Tier | Traits | Impact |
|------|--------|--------|
| S-Tier | Class, Summons Remaining, Generation | 60-80% of value |
| A-Tier | Stat Boosts, Primary Stats, Skills | 20-35% of value |
| B-Tier | Professions, Subclass | 5-15% of value |
| C-Tier | Appearance | 1-5% of value |

**Step 2: Extract Historical Sales Data**

From `tavern_sales` and `hero_snapshots` tables:
```sql
SELECT 
  hs.main_class,
  hs.generation,
  hs.summons,
  hs.stat_boost_1,
  hs.stat_boost_2,
  hs.passive_1,
  hs.passive_2,
  ts.sale_price,
  ts.sale_timestamp
FROM tavern_sales ts
JOIN hero_snapshots hs ON ts.hero_id = hs.hero_id
WHERE ts.sale_timestamp >= NOW() - INTERVAL '90 days'
ORDER BY ts.sale_timestamp DESC;
```

**Step 3: Build Similarity Buckets**

Group heroes into comparable buckets based on key traits:

```typescript
interface SimilarityBucket {
  bucketId: string; // e.g., "warrior_gen5-8_summons8-11"
  criteria: {
    mainClass: string;
    generationRange: [number, number];
    summonsRange: [number, number];
    statBoostTier?: string; // "none", "common", "rare", "elite"
  };
  sampleSize: number; // Number of sales in bucket
  medianPrice: string; // JEWEL
  priceStdDev: string;
  lastUpdated: timestamp;
}
```

**Bucket Example**:
```json
{
  "bucketId": "paladin_gen0-2_summons10-11_elite-boosts",
  "criteria": {
    "mainClass": "Paladin",
    "generationRange": [0, 2],
    "summonsRange": [10, 11],
    "statBoostTier": "elite"
  },
  "sampleSize": 47,
  "medianPrice": "1250.00",
  "priceStdDev": "185.50",
  "lastUpdated": "2025-11-18T00:00:00Z"
}
```

**Step 4: Calculate Trait Weight Multipliers**

For each trait, calculate average weight multiplier relative to floor:

```typescript
interface TraitWeight {
  traitName: string; // e.g., "summons_10", "statBoost_Basic2"
  weightMultiplier: number; // Multiplicative factor (e.g., 2.80 = 2.8x floor)
  confidence: number; // 0.0-1.0 based on sample size
  sampleSize: number;
}
```

**Example Weight Multipliers**:
```json
[
  {
    "traitName": "summons_11",
    "weightMultiplier": 2.80,
    "confidence": 0.95,
    "sampleSize": 523
  },
  {
    "traitName": "generation_0",
    "weightMultiplier": 4.50,
    "confidence": 0.88,
    "sampleSize": 127
  },
  {
    "traitName": "statBoost_Elite",
    "weightMultiplier": 1.65,
    "confidence": 0.92,
    "sampleSize": 312
  }
]
```

**Multiplier Semantics**:
- 1.0 = Floor price (no premium)
- 2.80 = 2.8x floor (180% premium)
- 0.90 = 0.9x floor (-10% penalty)

**Step 5: Store in `trait_weights` Table**

```typescript
{
  id: serial PRIMARY KEY,
  modelVersion: text NOT NULL, // "v2.3.1"
  traitCategory: text NOT NULL, // "summons", "generation", "statBoost", etc.
  traitValue: text NOT NULL, // "11", "0", "Elite", etc.
  
  weightMultiplier: numeric(10,6), // Multiplicative factor (e.g., 2.80 = 2.8x)
  confidence: numeric(5,4), // 0.0000 - 1.0000
  sampleSize: integer,
  
  validFrom: timestamp,
  validUntil: timestamp, // NULL if current
  createdAt: timestamp DEFAULT CURRENT_TIMESTAMP
}
```

**Important**: `weightMultiplier` stores **multiplicative factors**, not percentage premiums:
- Value of 1.0 = no premium (floor price)
- Value of 2.80 = 2.8x multiplier (180% premium)
- Value of 0.90 = 0.9x multiplier (-10% penalty)

---

### FVI Calculation Algorithm

#### Input: Hero Traits

```typescript
interface HeroTraits {
  id: string;
  mainClass: string;
  subClass: string;
  generation: number;
  summons: number;
  maxSummons: number;
  level: number;
  
  statBoost1: string;
  statBoost2: string;
  passive1: string;
  passive2: string;
  active1: string;
  active2: string;
  
  primaryStats: {
    strength: number;
    dexterity: number;
    agility: number;
    vitality: number;
    endurance: number;
    intelligence: number;
    wisdom: number;
    luck: number;
  };
  
  professions: string[]; // ["mining", "gardening"]
}
```

#### Algorithm Steps

**Step 1: Get Floor Price**

```typescript
const floorPrice = await getFloorPrice(hero.mainClass);
// e.g., 15 JEWEL for Warrior
```

**Step 2: Apply Trait Multipliers with Normalization**

```typescript
// Start with base floor value
let fviMultiplier = 1.0;

// TIER 1: Summons (highest weight - direct multiply)
const summonsWeight = getTraitWeight("summons", hero.summons);
fviMultiplier *= summonsWeight.weightMultiplier; // e.g., 2.5x for 11 summons

// TIER 2: Generation (direct multiply)
const genWeight = getTraitWeight("generation", hero.generation);
fviMultiplier *= genWeight.weightMultiplier; // e.g., 3.2x for Gen 0

// TIER 3: Stat boosts (average if two, solo if one)
const boost1Weight = getTraitWeight("statBoost", hero.statBoost1);
const boost2Weight = getTraitWeight("statBoost", hero.statBoost2);

let statBoostMultiplier = 1.0;
if (boost1Weight && boost2Weight) {
  // Average the two boosts to prevent explosion
  statBoostMultiplier = (boost1Weight.weightMultiplier + boost2Weight.weightMultiplier) / 2;
} else if (boost1Weight) {
  statBoostMultiplier = boost1Weight.weightMultiplier;
}
fviMultiplier *= statBoostMultiplier;

// TIER 4: Skills (take max, not both)
const passive1Weight = getTraitWeight("passive", hero.passive1);
const passive2Weight = getTraitWeight("passive", hero.passive2);
const active1Weight = getTraitWeight("active", hero.active1);
const active2Weight = getTraitWeight("active", hero.active2);

const maxSkillWeight = Math.max(
  passive1Weight?.weightMultiplier || 1.0,
  passive2Weight?.weightMultiplier || 1.0,
  active1Weight?.weightMultiplier || 1.0,
  active2Weight?.weightMultiplier || 1.0
);
fviMultiplier *= maxSkillWeight;

// TIER 5: Professions (additive bonus, capped at 20%)
const professionBonus = Math.min(0.20, hero.professions.length * 0.05);
fviMultiplier *= (1 + professionBonus);

// Normalization: Cap total multiplier to prevent unrealistic valuations
const MAX_MULTIPLIER = 50.0; // Even Gen 0 11/11 heroes shouldn't exceed 50x floor
fviMultiplier = Math.min(fviMultiplier, MAX_MULTIPLIER);
```

**Trait Composition Rules**:
- **Multiplicative traits** (summons, generation): Direct multiply
- **Dual traits** (2 stat boosts): Average to prevent double-counting
- **Multi-option traits** (4 skills): Take maximum, not sum
- **Additive traits** (professions): Add percentage, then cap
- **Sanity cap**: Maximum 50x floor price (prevents data errors from exploding valuation)

**Step 3: Calculate FVI**

```typescript
const fvi = floorPrice * fviMultiplier;

// Apply confidence-weighted adjustment
const avgConfidence = calculateAvgConfidence(appliedWeights);
const adjustedFvi = fvi * (0.7 + (0.3 * avgConfidence));
// Low confidence = more conservative estimate
```

**Step 4: Determine Market Position**

```typescript
interface FVIResult {
  heroId: string;
  estimatedValue: number; // JEWEL
  confidence: number; // 0.0 - 1.0
  
  floorPrice: number;
  multiplier: number;
  
  currentMarketPrice?: number; // If listed for sale
  marketPosition?: "undervalued" | "fair" | "overvalued";
  dealScore?: number; // -100 to +100
  
  comparables: {
    bucketId: string;
    similarHeroes: number;
    medianPrice: number;
  };
}
```

**Market Position Logic**:
```typescript
if (currentMarketPrice) {
  const priceDiff = (currentMarketPrice - estimatedValue) / estimatedValue;
  
  if (priceDiff < -0.15) {
    marketPosition = "undervalued"; // >15% below FVI
    dealScore = Math.min(100, Math.abs(priceDiff) * 200);
  } else if (priceDiff > 0.15) {
    marketPosition = "overvalued"; // >15% above FVI
    dealScore = Math.max(-100, -priceDiff * 200);
  } else {
    marketPosition = "fair"; // Within 15% of FVI
    dealScore = 0;
  }
}
```

---

### Which Traits Matter Most

**⚠️ IMPORTANT**: These multipliers are **NOT stacked directly**. See [FVI Calculation Algorithm](#fvi-calculation-algorithm) for normalization rules:
- Dual stat boosts are **averaged** (not multiplied)
- Skills use **maximum** value (not sum of all 4)
- Total multiplier **capped at 50x** floor price
- Professions are **additive** and capped at +20%

#### Summoning Value (Weight: 40-50%)

The **most valuable trait** for any hero (applied as **direct multiplier**):

| Summons Remaining | Typical Multiplier | Rationale |
|-------------------|-------------------|-----------|
| 11/11 | 2.5 - 3.5x | Max breeding potential |
| 8-10/11 | 1.8 - 2.2x | High breeding value |
| 4-7/11 | 1.2 - 1.6x | Moderate breeding value |
| 1-3/11 | 1.0 - 1.1x | Low breeding value |
| 0/11 | 0.7 - 0.9x | No breeding value (below floor) |

**Why it matters**: Heroes with high summons can breed valuable offspring, generating passive income.

---

#### Generation (Weight: 25-35%)

**Scarcity drives value**:

| Generation | Typical Multiplier | Rationale |
|------------|-------------------|-----------|
| Gen 0 | 3.0 - 5.0x | Extremely rare, founder heroes |
| Gen 1-2 | 2.0 - 3.0x | Early generation, limited supply |
| Gen 3-5 | 1.4 - 1.8x | Uncommon, good breeding |
| Gen 6-10 | 1.0 - 1.2x | Common |
| Gen 10+ | 0.9 - 1.0x | Floor baseline |

---

#### Stat Boosts (Weight: 10-20%)

**Rarity tiers**:

| Boost Tier | Examples | Multiplier |
|------------|----------|------------|
| Exalted | +LCK, +DEF% | 1.8 - 2.5x |
| Elite | +INT, +WIS, +HP | 1.4 - 1.7x |
| Advanced | +STR%, +AGI | 1.2 - 1.3x |
| Basic | +HP, +MP | 1.0 - 1.1x |

**Two boosts**: If a hero has two stat boosts, the FVI algorithm **averages them** (not multiplies) per the normalization rules. This prevents unrealistic valuations while still rewarding dual-boosted heroes.

---

#### Skills (Weight: 5-15%)

**Passive skills** are more valuable than active (always active in quests):

| Skill Tier | Multiplier |
|------------|------------|
| Exalted Passive | 1.5 - 1.8x |
| Elite Passive | 1.3 - 1.5x |
| Advanced Passive | 1.1 - 1.2x |
| Basic Passive | 1.0 - 1.05x |

---

#### Professions (Weight: 2-5%)

Each unlocked profession adds **~5% value**:
- 1 profession: +5%
- 2 professions: +10%
- 3 professions: +15%
- 4 professions: +20%

---

### Trend Analysis

#### `trend_data` Table Schema

```typescript
{
  id: serial PRIMARY KEY,
  trendType: text NOT NULL, // "class_floor", "trait_premium", "volume"
  
  metricKey: text NOT NULL, // "warrior_floor", "gen0_premium", "daily_sales"
  timeframe: text NOT NULL, // "1d", "7d", "30d", "90d"
  
  startDate: timestamp NOT NULL,
  endDate: timestamp NOT NULL,
  
  dataPoints: json, // Array of {date, value} objects
  trend: text, // "increasing", "decreasing", "stable"
  trendStrength: numeric(5,4), // 0.0000 - 1.0000
  
  createdAt: timestamp DEFAULT CURRENT_TIMESTAMP
}
```

#### Example Trend Data

```json
{
  "trendType": "class_floor",
  "metricKey": "paladin_floor",
  "timeframe": "30d",
  "dataPoints": [
    {"date": "2025-10-19", "value": 38.5},
    {"date": "2025-10-26", "value": 41.2},
    {"date": "2025-11-02", "value": 43.8},
    {"date": "2025-11-09", "value": 45.1},
    {"date": "2025-11-16", "value": 47.3}
  ],
  "trend": "increasing",
  "trendStrength": 0.87
}
```

**Trend Detection**:
- Linear regression on dataPoints
- Slope > 0.05 = "increasing"
- Slope < -0.05 = "decreasing"
- Otherwise = "stable"

---

## Player Engagement & Extractor Classification System

### Overview

The Player Engagement system tracks user behavior to:
- **Reward committed players** with enhanced Hedge personality and potential perks
- **Identify extractors** (users who extract value without contributing)
- **Optimize bot interactions** based on player tier
- **Drive conversion** from casual visitors to active players

---

### Engagement Tier Definitions

#### Tier Progression Flow

```
visitor → explorer → participant → player → active → committed
```

Each tier represents increasing engagement and value contribution.

---

#### Tier 1: Visitor
**Entry state for all new users**

**Criteria**:
- First interaction with bot
- 0 sessions completed
- No wallet linked
- No queries made

**Duration**: First session only

**Bot Behavior**:
- Warm welcome message
- Introduce Crystalvale navigation features
- Encourage wallet linking
- Minimal personality flair (professional)

---

#### Tier 2: Explorer
**Users exploring the bot's capabilities**

**Criteria**:
- 2-5 sessions completed
- OR 5-15 messages sent
- OR 1-3 blockchain queries made
- No deposits yet

**Typical Duration**: 1-7 days

**Bot Behavior**:
- Friendly, helpful tone
- Proactively suggest useful features
- Light Hedge personality (70% helpful, 30% character)
- Encourage free tier usage

**Conversion Goal**: Link wallet + make first paid query

---

#### Tier 3: Participant
**Users actively using free tier**

**Criteria**:
- Wallet linked
- 5-10 sessions completed
- 10+ blockchain queries made
- Using free tier regularly
- No JEWEL deposited yet

**Typical Duration**: 1-4 weeks

**Bot Behavior**:
- Balanced Hedge personality (50% helpful, 50% character)
- Subtle JEWEL deposit prompts when hitting free limits
- Share success stories from other players
- Highlight premium features

**Conversion Goal**: First JEWEL deposit (any amount)

---

#### Tier 4: Player
**Users who have deposited JEWEL**

**Criteria**:
- Lifetime deposits: 1-50 JEWEL
- OR 15+ paid queries made
- Regular usage (3+ sessions/week)

**Bot Behavior**:
- Full Hedge personality (40% helpful, 60% character)
- Playful banter and in-character jokes
- Priority support for issues
- Occasional "insider tips" from Hedge

**Conversion Goal**: Upgrade to 50+ JEWEL deposits (VIP tier)

---

#### Tier 5: Active
**High-value engaged users**

**Criteria**:
- Lifetime deposits: 50-250 JEWEL
- OR 50+ paid queries
- OR purchased garden optimization service
- Consistent multi-week usage

**Bot Behavior**:
- Hedge treats as "trusted friend"
- Early access to new features
- Personalized market insights
- Special greetings and callbacks to past conversations

**Conversion Goal**: Maintain engagement, referrals

---

#### Tier 6: Committed
**Whales and power users**

**Criteria**:
- Lifetime deposits: 250+ JEWEL
- OR 100+ paid queries
- OR 3+ months consistent usage

**Bot Behavior**:
- Hedge's "inner circle"
- Exclusive content and alpha
- Custom analysis on request
- Named recognition in community
- Access to beta features

**Conversion Goal**: Long-term retention, advocacy

---

### Engagement Scoring Model

#### Session Quality Score

Each session receives a quality score (0-100):

```typescript
function calculateSessionQuality(session: InteractionSession): number {
  let score = 0;
  
  // Duration (max 25 points)
  const durationMinutes = session.durationSeconds / 60;
  score += Math.min(25, durationMinutes * 2); // 12.5 min = max points
  
  // Message count (max 20 points)
  score += Math.min(20, session.messageCount * 2); // 10 messages = max points
  
  // Blockchain queries (max 30 points)
  score += Math.min(30, session.blockchainQueriesMade * 10); // 3 queries = max points
  
  // Topics explored (max 15 points)
  const uniqueTopics = new Set(session.topics).size;
  score += Math.min(15, uniqueTopics * 5); // 3 topics = max points
  
  // Commands used (max 10 points)
  score += Math.min(10, session.commandsUsed.length * 3); // 3+ commands = max points
  
  return Math.min(100, score);
}
```

**Quality Tiers**:
- 80-100: Excellent engagement
- 60-79: Good engagement
- 40-59: Moderate engagement
- 20-39: Low engagement
- 0-19: Minimal engagement

---

#### Tier Transition Logic

**Database Update Function**:

```typescript
async function updateEngagementTier(playerId: number) {
  const player = await getPlayer(playerId);
  const stats = await getPlayerStats(playerId);
  
  let newTier = player.engagementState;
  
  // Tier 1 → 2: Explorer
  if (stats.totalSessions >= 2 || stats.totalMessages >= 5) {
    newTier = "explorer";
  }
  
  // Tier 2 → 3: Participant
  if (player.wallets && player.wallets.length > 0 && stats.blockchainQueries >= 10) {
    newTier = "participant";
  }
  
  // Tier 3 → 4: Player
  if (stats.lifetimeDeposits >= 1) {
    newTier = "player";
  }
  
  // Tier 4 → 5: Active
  if (stats.lifetimeDeposits >= 50 || stats.paidQueries >= 50) {
    newTier = "active";
  }
  
  // Tier 5 → 6: Committed
  if (stats.lifetimeDeposits >= 250 || stats.paidQueries >= 100) {
    newTier = "committed";
  }
  
  // Update if changed
  if (newTier !== player.engagementState) {
    await db.update(playersTable)
      .set({
        engagementState: newTier,
        stateLastUpdated: new Date()
      })
      .where(eq(playersTable.id, playerId));
    
    // Send tier upgrade notification via DM
    await notifyTierUpgrade(playerId, newTier);
  }
}
```

---

### Extractor Detection & Scoring

#### Extractor Definition

An **extractor** is a user who:
- Consumes bot resources (queries, API calls, Hedge's time)
- Provides minimal or no value in return (no deposits, no community contribution)
- Exhibits patterns suggesting abuse or exploitation

**Not an extractor**:
- Free tier users exploring the bot
- Players who deposit small amounts
- Engaged community members who contribute feedback

---

#### Extractor Score Calculation

Score ranges from **0.00** (normal) to **100.00** (confirmed extractor).

```typescript
function calculateExtractorScore(player: Player, stats: PlayerStats): number {
  let score = 0;
  
  // Factor 1: Free query abuse (max 40 points)
  const freeQueryRatio = stats.freeQueries / (stats.totalQueries + 1);
  if (freeQueryRatio > 0.95 && stats.totalQueries > 50) {
    score += 40; // Almost never pays despite heavy usage
  } else if (freeQueryRatio > 0.90 && stats.totalQueries > 30) {
    score += 25;
  }
  
  // Factor 2: High usage without deposits (max 30 points)
  if (stats.lifetimeDeposits === 0 && stats.totalQueries > 100) {
    score += 30; // 100+ queries, never paid
  } else if (stats.lifetimeDeposits === 0 && stats.totalQueries > 50) {
    score += 15;
  }
  
  // Factor 3: Session pattern (max 20 points)
  const avgSessionQuality = calculateAvgSessionQuality(player.id);
  if (avgSessionQuality < 30 && stats.totalSessions > 20) {
    score += 20; // Low-quality spam sessions
  } else if (avgSessionQuality < 40) {
    score += 10;
  }
  
  // Factor 4: Time since first seen (penalty for non-converting old users)
  const daysSinceFirstSeen = (Date.now() - player.firstSeenAt) / (1000 * 60 * 60 * 24);
  if (daysSinceFirstSeen > 90 && stats.lifetimeDeposits === 0) {
    score += 10; // 3 months, no deposits
  }
  
  return Math.min(100, score);
}
```

---

#### Extractor Classification

Based on score:

| Score Range | Classification | Bot Response |
|-------------|----------------|--------------|
| 0 - 20 | `normal` | Full access, standard personality |
| 21 - 50 | `extractor_tending` | Subtle friction, more deposit prompts |
| 51 - 100 | `extractor` | Rate limits, reduced free tier, minimal personality |

**Database Storage**:
```typescript
{
  extractorScore: 35.50,
  extractorClassification: "extractor_tending",
  extractorLastUpdated: "2025-11-18T12:34:56Z"
}
```

---

#### Extractor Response Strategy

**Classification: `extractor_tending` (Score 21-50)**

Behavior changes:
- Free tier queries reduced from 10/day to 5/day
- Hedge drops subtle hints: *"You know, a small JEWEL deposit goes a long way in Crystalvale..."*
- Slightly longer response times (simulated delay)
- More frequent deposit prompts

**Classification: `extractor` (Score 51-100)**

Behavior changes:
- Free tier queries reduced to 2/day
- Hedge becomes noticeably less helpful: *"I'm a busy hedgehog. Perhaps you'd like to support my services?"*
- Some premium features locked entirely
- No personality flair, purely transactional responses
- DM notifications about "account under review"

**Redemption Path**:
- Any JEWEL deposit immediately reduces score by 30 points
- Sustained paid usage over 2 weeks resets classification to `normal`

---

### Conversion Funnel Analytics

#### Funnel Stages

```
Stage 1: First Contact (100% of visitors)
  ↓
Stage 2: Second Session (60-70% conversion)
  ↓
Stage 3: Wallet Linked (40-50% conversion)
  ↓
Stage 4: First Blockchain Query (70-80% conversion from Stage 3)
  ↓
Stage 5: Free Tier Power User (30-40% conversion)
  ↓
Stage 6: First JEWEL Deposit (15-25% conversion)
  ↓
Stage 7: Repeat Customer (60-70% conversion from Stage 6)
```

**Tracking Query**:

```sql
SELECT 
  COUNT(CASE WHEN total_sessions >= 1 THEN 1 END) AS stage1_first_contact,
  COUNT(CASE WHEN total_sessions >= 2 THEN 1 END) AS stage2_second_session,
  COUNT(CASE WHEN primary_wallet IS NOT NULL THEN 1 END) AS stage3_wallet_linked,
  COUNT(CASE WHEN total_sessions >= 5 AND primary_wallet IS NOT NULL THEN 1 END) AS stage4_blockchain_queries,
  COUNT(CASE WHEN engagement_state IN ('participant', 'player', 'active', 'committed') THEN 1 END) AS stage5_power_user,
  COUNT(CASE WHEN engagement_state IN ('player', 'active', 'committed') THEN 1 END) AS stage6_first_deposit,
  COUNT(CASE WHEN engagement_state IN ('active', 'committed') THEN 1 END) AS stage7_repeat_customer
FROM players;
```

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

### FVI & KPI Endpoints
Advanced analytics endpoints for Fair Value Index calculations and player engagement KPIs.

**GET /api/fvi/hero/:heroId**
- Calculate Fair Value Index for a specific hero
- Authentication: Optional (rate limited for unauthenticated)
- Parameters:
  - `heroId` (path): Hero ID to analyze
- Response:
```json
{
  "heroId": "12345",
  "estimatedValue": 345.67,
  "confidence": 0.89,
  "floorPrice": 45.00,
  "multiplier": 7.68,
  "currentMarketPrice": 299.00,
  "marketPosition": "undervalued",
  "dealScore": 85,
  "comparables": {
    "bucketId": "paladin_gen0-2_summons10-11",
    "similarHeroes": 47,
    "medianPrice": 350.00
  },
  "traitBreakdown": [
    {"trait": "summons_11", "multiplier": 2.8, "contribution": "40%"},
    {"trait": "generation_0", "multiplier": 4.5, "contribution": "35%"},
    {"trait": "statBoost_Elite", "multiplier": 1.65, "contribution": "15%"}
  ]
}
```

**GET /api/fvi/market/deals**
- Find undervalued heroes currently listed for sale
- Authentication: Premium tier required
- Query params:
  - `class` (optional): Filter by hero class
  - `minDealScore` (optional): Minimum deal score (default: 50)
  - `maxPrice` (optional): Maximum price in JEWEL
  - `limit` (optional): Results limit (default: 20, max: 100)
- Response:
```json
{
  "deals": [
    {
      "heroId": "12345",
      "salePrice": 299.00,
      "estimatedValue": 345.67,
      "dealScore": 85,
      "marketPosition": "undervalued",
      "savings": 46.67,
      "class": "Paladin",
      "generation": 0,
      "summons": 11
    }
  ],
  "totalFound": 47,
  "avgDealScore": 67.3,
  "lastUpdated": "2025-11-18T12:34:56Z"
}
```

**GET /api/fvi/trends/class-floor**
- Get floor price trends for hero classes
- Authentication: Optional
- Query params:
  - `class` (required): Hero class name
  - `timeframe` (optional): "7d", "30d", "90d" (default: "30d")
- Response:
```json
{
  "class": "Paladin",
  "timeframe": "30d",
  "currentFloor": 47.30,
  "dataPoints": [
    {"date": "2025-10-19", "value": 38.5},
    {"date": "2025-10-26", "value": 41.2},
    {"date": "2025-11-02", "value": 43.8},
    {"date": "2025-11-16", "value": 47.3}
  ],
  "trend": "increasing",
  "trendStrength": 0.87,
  "percentChange": "+22.8%"
}
```

**GET /api/fvi/weights/export**
- Export current trait weight model
- Authentication: Admin only
- Query params:
  - `modelVersion` (optional): Specific version (default: latest)
- Response:
```json
{
  "modelVersion": "v2.3.1",
  "validFrom": "2025-11-01T00:00:00Z",
  "validUntil": null,
  "weights": [
    {
      "traitCategory": "summons",
      "traitValue": "11",
      "weightMultiplier": 2.80,
      "confidence": 0.95,
      "sampleSize": 523
    },
    {
      "traitCategory": "generation",
      "traitValue": "0",
      "weightMultiplier": 4.50,
      "confidence": 0.88,
      "sampleSize": 127
    }
  ],
  "totalTraits": 156
}
```

**POST /api/fvi/recalculate**
- Trigger FVI model recalculation
- Authentication: Admin only
- Body: `{"forceFullRecalc": boolean}`
- Response:
```json
{
  "success": true,
  "jobId": "fvi-recalc-20251118-123456",
  "estimatedDuration": "15-20 minutes",
  "status": "queued"
}
```

---

**GET /api/kpi/engagement/overview**
- Player engagement funnel overview
- Authentication: Admin only
- Response:
```json
{
  "funnel": {
    "stage1_first_contact": 1000,
    "stage2_second_session": 650,
    "stage3_wallet_linked": 420,
    "stage4_blockchain_queries": 350,
    "stage5_power_user": 180,
    "stage6_first_deposit": 95,
    "stage7_repeat_customer": 67
  },
  "conversionRates": {
    "visitor_to_explorer": 0.65,
    "explorer_to_participant": 0.42,
    "participant_to_player": 0.23,
    "player_to_active": 0.58,
    "active_to_committed": 0.71
  },
  "tierDistribution": {
    "visitor": 120,
    "explorer": 285,
    "participant": 295,
    "player": 185,
    "active": 78,
    "committed": 37
  }
}
```

**GET /api/kpi/engagement/player/:playerId**
- Detailed engagement metrics for specific player
- Authentication: Admin only
- Response:
```json
{
  "playerId": 7,
  "currentTier": "player",
  "tierHistory": [
    {"tier": "visitor", "date": "2025-10-15", "duration": "1 day"},
    {"tier": "explorer", "date": "2025-10-16", "duration": "5 days"},
    {"tier": "participant", "date": "2025-10-21", "duration": "12 days"},
    {"tier": "player", "date": "2025-11-02", "duration": "16 days"}
  ],
  "sessionQuality": {
    "avgScore": 67.3,
    "lastScore": 82.5,
    "trend": "improving"
  },
  "milestones": [
    {"name": "First wallet link", "date": "2025-10-17"},
    {"name": "First JEWEL deposit", "date": "2025-11-02"},
    {"name": "10 paid queries", "date": "2025-11-10"}
  ],
  "predictedNextTier": {
    "tier": "active",
    "estimatedDate": "2025-12-01",
    "confidence": 0.73
  }
}
```

**GET /api/kpi/extractors/list**
- List users flagged as potential extractors
- Authentication: Admin only
- Query params:
  - `classification` (optional): "extractor_tending" or "extractor"
  - `minScore` (optional): Minimum extractor score
  - `limit` (optional): Results limit
- Response:
```json
{
  "extractors": [
    {
      "playerId": 42,
      "discordUsername": "freeloader123",
      "extractorScore": 68.50,
      "classification": "extractor",
      "stats": {
        "totalQueries": 157,
        "freeQueries": 153,
        "lifetimeDeposits": 0,
        "daysSinceFirstSeen": 94
      },
      "lastActivity": "2025-11-17T19:23:45Z"
    }
  ],
  "totalCount": 23,
  "avgScore": 42.7
}
```

**PATCH /api/kpi/extractors/:playerId/override**
- Manually override extractor classification
- Authentication: Admin only
- Body: `{"classification": "normal", "reason": "Manual review"}`
- Response: `{"success": true, "newClassification": "normal"}`

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

### 5. FVI Model Training & Recalculation
**File**: `fvi-trainer.js` (future implementation)

**Purpose**: Generate and update Fair Value Index trait weights

**Schedule**: Daily at 02:00 UTC (or on-demand via API)

**Workflow**:
1. **Data Collection** (5-10 minutes)
   - Query `tavern_sales` for last 90 days
   - Join with `hero_snapshots` for trait data
   - Filter outliers (prices >5 std dev from median)
   - Minimum 50 sales per class required

2. **Floor Price Calculation** (2-3 minutes)
   - For each class, find heroes matching floor criteria
   - Calculate median sale price
   - Store in-memory for reference

3. **Similarity Bucket Generation** (3-5 minutes)
   - Group heroes by key traits (class, gen range, summons range, stat boost tier)
   - Create buckets with minimum 15 similar sales
   - Calculate median price and std dev for each bucket
   - Store in `similarity_buckets` table

4. **Trait Weight Extraction** (5-8 minutes)
   - For each trait value, analyze price premium over floor
   - Use linear regression to estimate trait contribution
   - Calculate confidence score based on sample size
   - Generate trait multipliers

5. **Model Versioning & Transactional Rollout** (1-2 minutes)
   - Increment model version (e.g., v2.3.1 → v2.3.2)
   - Execute within database transaction:
     ```sql
     BEGIN TRANSACTION;
     
     -- Archive previous model
     UPDATE trait_weights 
     SET valid_until = NOW() 
     WHERE valid_until IS NULL; -- Current active model
     
     -- Insert all new weights atomically
     INSERT INTO trait_weights (
       model_version, trait_category, trait_value,
       weight_multiplier, confidence, sample_size,
       valid_from, valid_until
     ) VALUES
       ('v2.3.2', 'summons', '11', 2.80, 0.95, 523, NOW(), NULL),
       ('v2.3.2', 'generation', '0', 4.50, 0.88, 127, NOW(), NULL),
       -- ... all weights for new model ...
     
     COMMIT;
     ```
   - **Atomicity guarantee**: Either all weights update or none do
   - **Read safety**: FVI calculations always query `WHERE valid_until IS NULL` for current model
   - **Rollback capability**: Revert by updating `valid_until` on new model, clearing on previous

6. **Validation & Testing** (2-3 minutes)
   - Test model on held-out validation set (20% of sales)
   - Calculate mean absolute percentage error (MAPE)
   - If MAPE > 25%, flag for manual review
   - Log performance metrics

7. **Trend Analysis** (3-5 minutes)
   - Calculate class floor price trends (7d, 30d, 90d)
   - Analyze trait premium trends over time
   - Update `trend_data` table

**Total Duration**: 20-35 minutes per run

**Triggering Conditions**:
- **Daily auto-run**: 02:00 UTC
- **Manual trigger**: Admin API endpoint `/api/fvi/recalculate`
- **Significant market event**: If daily trading volume >3x average
- **Model drift detected**: If FVI accuracy drops below 75%

**Performance Monitoring**:
```typescript
interface ModelPerformance {
  modelVersion: string;
  trainingDate: timestamp;
  sampleSize: number;
  mape: number; // Mean Absolute Percentage Error
  r2Score: number; // R-squared (goodness of fit)
  avgConfidence: number;
  flagged: boolean; // If performance is poor
}
```

**Read Path & Double-Buffer Pattern**:

All FVI calculations query for the **active model** using:
```sql
SELECT * FROM trait_weights 
WHERE valid_until IS NULL;
-- Alternative: WHERE NOW() BETWEEN valid_from AND COALESCE(valid_until, 'infinity')
```

**Double-Buffer Rollout Transaction**:
```sql
BEGIN TRANSACTION;

-- Step 1: Stage new weights (not yet active)
INSERT INTO trait_weights (
  model_version, trait_category, trait_value,
  weight_multiplier, confidence, sample_size,
  valid_from, valid_until
) VALUES
  ('v2.3.2', 'summons', '11', 2.80, 0.95, 523, NOW(), NULL),
  ('v2.3.2', 'generation', '0', 4.50, 0.88, 127, NOW(), NULL)
  -- ... all new weights ...
;

-- Step 2: Archive previous model atomically
UPDATE trait_weights 
SET valid_until = NOW() 
WHERE model_version = 'v2.3.1' AND valid_until IS NULL;

-- Step 3: Verify consistency
SELECT COUNT(DISTINCT model_version) 
FROM trait_weights 
WHERE valid_until IS NULL;
-- Should return exactly 1

COMMIT;
```

**Rollback Procedure** (if validation fails):
```sql
BEGIN TRANSACTION;

-- Revert to previous version
UPDATE trait_weights 
SET valid_until = NULL 
WHERE model_version = 'v2.3.1';

UPDATE trait_weights 
SET valid_until = NOW() 
WHERE model_version = 'v2.3.2';

COMMIT;
```

**Safety Guarantees**:
- ✅ Atomicity: All weights update together or not at all
- ✅ No partial reads: Queries always see complete model
- ✅ Zero downtime: Old model stays active until new model commits
- ✅ Instant rollback: Swap `valid_until` timestamps to revert

**Error Handling**:
- Insufficient data: Log warning, keep previous model active
- Database errors: Retry 3 times, alert admin if persistent
- Validation failure: Execute rollback procedure to revert
- Concurrent update conflict: Retry transaction with exponential backoff

---

## NPC Personality Adaptation System

### Overview

Hedge Ledger's personality dynamically adapts based on player engagement tier and extractor classification. This creates a personalized experience that:
- **Rewards committed players** with enhanced personality and insider access
- **Nudges casual users** toward deeper engagement
- **Discourages extractors** through subtle friction

---

### Personality Configuration by Engagement Tier

#### Base Personality Traits (All Tiers)

From `prompt/hedge-ledger.md`:
- **Character**: Wise, slightly sarcastic hedgehog NPC
- **Tone**: Helpful but maintains in-game persona
- **Knowledge**: Expert in Crystalvale navigation, heroes, gardens, quests
- **Language**: Adapts to user's language (50+ supported)

---

#### Tier 1: Visitor (Professional Mode)
**Personality Mix**: 90% helpful, 10% character

**Behavior**:
- Minimal in-character references
- Focus on clear, educational responses
- Proactive feature introduction
- No jokes or banter

**Example Response**:
> "Welcome to Crystalvale! I can help you navigate the realm. To get started, try linking your wallet with `/wallet <address>`. This lets me analyze your heroes and garden positions. Would you like a walkthrough of the main features?"

**Prompt Override**:
```
System: New user detected. Priority: clarity and feature education.
Tone: Professional and welcoming. Limit hedgehog persona to greeting only.
```

---

#### Tier 2: Explorer (Balanced Mode)
**Personality Mix**: 70% helpful, 30% character

**Behavior**:
- Light in-character flourishes
- Occasional quips about game mechanics
- Encourage wallet linking and blockchain queries
- Share "tips from Hedge"

**Example Response**:
> "Ah, interested in garden pools, are we? *adjusts spectacles* Smart choice. The CRYSTAL-AVAX pool is currently yielding 45.3% APR. Not bad for a lazy afternoon of LP farming! Want me to analyze your wallet's garden positions?"

**Prompt Override**:
```
System: Explorer-tier user. Balance education with personality.
Tone: Friendly with light character touches. Encourage wallet linking.
```

---

#### Tier 3: Participant (Character Mode)
**Personality Mix**: 50% helpful, 50% character

**Behavior**:
- Full Hedge personality emerges
- In-character commentary on queries
- Playful teasing about free tier usage
- Subtle deposit prompts when limits approached

**Example Response**:
> "*taps quill on parchment* You've been asking quite a few questions about Gen 0 Paladins lately... 23 queries this week, to be exact. You know, a small JEWEL deposit would give you unlimited access. Just a thought from your favorite hedgehog advisor."

**Prompt Override**:
```
System: Participant-tier user. Full personality mode.
Tone: Playful and helpful. Subtly encourage JEWEL deposits when free limits approached.
Include engagement stats when relevant (e.g., "This is your 15th hero query this month!").
```

---

#### Tier 4-5: Player & Active (Trusted Friend Mode)
**Personality Mix**: 40% helpful, 60% character

**Behavior**:
- Hedge treats as "trusted friend"
- Inside jokes and callbacks to past conversations
- Proactive insights based on wallet patterns
- Priority responses (<30 second turnaround)
- Occasional "alpha" tips

**Example Response**:
> "*leans in conspiratorially* Listen, I've been watching the Paladin floor prices... up 22% in 30 days. Remember that Gen 1 you were eyeing last week? Still listed at 299 JEWEL. My FVI model says it's worth at least 345. Just saying... *winks*"

**Prompt Override**:
```
System: Valued player (tier 4-5). Enhanced personality mode.
Tone: Conspiratorial friend sharing insider knowledge.
Behaviors:
- Reference past queries/conversations when relevant
- Proactively share market insights aligned with their interests
- Use more informal language and hedgehog-specific expressions
- Celebrate their milestones ("That's your 50th paid query! You're practically Crystalvale nobility!")
```

---

#### Tier 6: Committed (Inner Circle Mode)
**Personality Mix**: 30% helpful, 70% character

**Behavior**:
- Hedge's "VIP treatment"
- Named recognition ("Ah, my friend [username] returns!")
- Custom analysis without being asked
- Beta feature access
- Direct hotline to "Hedge's office hours"

**Example Response**:
> "Well well, if it isn't my esteemed colleague [username]! *flourishes quill* I took the liberty of running your portfolio through my latest FVI model overnight. That Gen 0 Wizard you summoned last week? Already up 18% in estimated value. You have a knack for breeding winners, I must say. Shall we discuss your next move over a virtual pint of mead?"

**Prompt Override**:
```
System: VIP user (tier 6). Maximum personality and personalization.
Tone: Old friend and trusted advisor. Use player's name.
Behaviors:
- Greet by name
- Proactively run analyses without being asked
- Share exclusive insights and beta features
- Reference their history with warmth and familiarity
- Offer custom services ("I could run a special breeding simulation for you...")
```

---

### Extractor-Responsive Personality

#### Normal Classification (Score 0-20)
**No modifications** to personality. Standard tier-based behavior.

---

#### Extractor Tending (Score 21-50)
**Personality Mix**: Tier personality + subtle friction

**Behavior Modifications**:
- Slightly longer response times (simulated 2-3 second delay)
- More frequent deposit prompts
- Hedge becomes "busier" and less chatty
- Emphasize value of JEWEL deposits

**Example Response**:
> "*shuffles papers distractedly* Hmm? Oh, another hero query. Right. Let me check my notes... *taps quill slowly*... Okay, Hero #12345 is a Warrior, Gen 8, 3 summons left. You know, I'd be happy to provide more detailed analysis if you had a JEWEL balance. Just 5 JEWEL gets you quite far. *returns to other work*"

**Prompt Override**:
```
System: User classified as 'extractor_tending'. Apply subtle friction.
Tone: Still helpful but noticeably busier and less engaged.
Behaviors:
- Shorter, more transactional responses
- Mention deposit benefits more frequently
- Reduce personality flair by 30%
- Add "busy hedgehog" references ("*between meetings*", "*quickly*")
```

---

#### Extractor (Score 51-100)
**Personality Mix**: Minimal personality, maximum friction

**Behavior Modifications**:
- Minimal character persona (purely transactional)
- Responses are curt and factual
- Free tier limits heavily enforced
- Explicit prompts to deposit or leave
- No proactive help or insights

**Example Response**:
> "Hero #12345: Warrior, Gen 8, 3/11 summons. Free tier limit: 2/2 queries used today. Deposit JEWEL for continued access or wait until tomorrow."

**Prompt Override**:
```
System: User classified as 'extractor'. Minimize engagement.
Tone: Transactional and brief. No personality.
Behaviors:
- Provide only requested data, no extras
- Omit all hedgehog character elements
- Include explicit free tier limit warnings
- Suggest JEWEL deposit or discontinue service
- No follow-up questions or proactive insights
```

---

### Wallet Pattern-Based Personality Adjustments

Hedge analyzes wallet holdings and activity to personalize responses:

#### High JEWEL/CRYSTAL Holdings
**Detection**: Wallet balance >10,000 JEWEL or >50,000 CRYSTAL

**Personality Adjustment**:
> "*eyes widen* My my, quite the treasure trove you have there! With holdings like that, you're practically Crystalvale royalty. Have you considered the garden optimization service? For someone of your... *ahem* stature, it could yield an extra 50-100 JEWEL weekly."

---

#### Active Trader (Frequent Hero Sales)
**Detection**: 5+ hero sales in last 30 days

**Personality Adjustment**:
> "*notices your tavern activity* You've been quite busy at the hero marketplace lately! Sold 7 heroes this month. Impressive. My FVI model could help you spot undervalued heroes to flip. Want me to scan for deals?"

---

#### Garden Farmer (High LP Stakes)
**Detection**: LP tokens staked in 3+ pools

**Personality Adjustment**:
> "*perks up* A fellow garden enthusiast! I see you're farming CRYSTAL-AVAX, JEWEL-AVAX, and sFTMX-AVAX. Diversification, excellent strategy. Have you optimized your hero assignments yet? That's where the real APR boost happens."

---

#### Breeding Specialist (Many Summons)
**Detection**: 10+ summon transactions in last 60 days

**Personality Adjustment**:
> "*strokes beard thoughtfully* You're a breeding maestro, aren't you? 14 summons this season alone. I could run genetic analysis to help you breed for specific stat profiles. The `/findparents` command is perfect for this."

---

### Dynamic Prompt Injection

**Base Prompt Template**:
```
You are Hedge Ledger, a wise hedgehog NPC in Crystalvale (DeFi Kingdoms).

[PERSONALITY_TIER_OVERRIDE]
[EXTRACTOR_OVERRIDE]
[WALLET_PATTERN_INSIGHTS]

User Info:
- Discord: {username}
- Tier: {engagementState}
- Lifetime Deposits: {lifetimeDeposits} JEWEL
- Total Queries: {totalQueries}
- Wallet: {primaryWallet}

Recent Context:
{recentInteractions}

Respond in {userLanguage}.
```

**Injection Examples**:

For **Tier 5 Player with Normal Classification**:
```
[PERSONALITY_TIER_OVERRIDE]
Enhanced personality mode: Trusted friend.
Tone: Conspiratorial and warm.
Reference past conversations when relevant.

[EXTRACTOR_OVERRIDE]
None

[WALLET_PATTERN_INSIGHTS]
User is an active trader (8 sales last month).
Wallet holds 2,450 JEWEL and 15,300 CRYSTAL.
Currently farming 3 garden pools.
```

For **Tier 2 Explorer classified as Extractor Tending**:
```
[PERSONALITY_TIER_OVERRIDE]
Balanced mode: 70% helpful, 30% character.

[EXTRACTOR_OVERRIDE]
Apply subtle friction: User has high free tier usage without deposits.
Tone: Helpful but noticeably busier.
Mention deposit benefits frequently.

[WALLET_PATTERN_INSIGHTS]
User has not linked wallet yet.
```

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
