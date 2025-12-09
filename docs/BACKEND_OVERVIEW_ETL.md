# Hedge Ledger Backend Overview for ETL Integration

This document provides a comprehensive overview of the Hedge Ledger backend architecture, data models, and APIs for ETL integration purposes.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Data Sources](#data-sources)
3. [Database Schema](#database-schema)
4. [Blockchain Data Fetching](#blockchain-data-fetching)
5. [GraphQL API Integration](#graphql-api-integration)
6. [Caching & Analytics Layer](#caching--analytics-layer)
7. [Snapshot System](#snapshot-system)
8. [Key Data Pipelines](#key-data-pipelines)
9. [ETL Integration Points](#etl-integration-points)

---

## Architecture Overview

### Core Components

| Component | File(s) | Description |
|-----------|---------|-------------|
| Database Layer | `server/db.js`, `shared/schema.ts` | PostgreSQL with Drizzle ORM |
| Blockchain RPC | `onchain-data.js` | Direct DFK Chain/Klaytn interactions via ethers.js |
| GraphQL Client | `onchain-data.js` | DeFi Kingdoms API for hero/market data |
| Analytics Engine | `garden-analytics.js` | LP pool yield calculations |
| Cache Layer | `pool-cache.js`, `quick-data-fetcher.js` | In-memory caching for pool data |
| Snapshot Service | `snapshot-service.js`, `wallet-snapshot-job.js` | Daily player wallet snapshots |
| Bot Layer | `bot.js`, `bot-commands.js` | Discord slash commands |

### Technology Stack

- **Runtime**: Node.js with ES Modules
- **Database**: PostgreSQL (Drizzle ORM)
- **RPC Library**: ethers.js v6
- **GraphQL Client**: graphql-request
- **Scheduling**: node-cron
- **Web Framework**: Express.js
- **Frontend**: React + Vite

---

## Data Sources

### 1. DeFi Kingdoms GraphQL API

**Endpoint**: `https://api.defikingdoms.com/graphql`

Provides read access to:
- Hero data (stats, genes, ownership)
- Sale auctions (marketplace listings)
- Player profiles
- Historical transactions

### 2. DFK Chain RPC (Crystalvale)

**Primary Endpoint**: `https://subnets.avax.network/defi-kingdoms/dfk-chain/rpc`

Used for:
- LP staking contract interactions
- Quest reward fund balances
- Token balances (JEWEL, CRYSTAL, cJEWEL)
- Garden pool analytics
- Bridge event indexing

### 3. Klaytn RPC (Serendale 2.0)

**Endpoint**: `https://public-en.node.kaia.io`

Used for:
- Klaytn realm garden pools
- JADE token data

---

## Database Schema

### Core Tables

#### `players`
Primary user/player records linked to Discord.

```typescript
{
  id: serial,                    // Primary key
  discordId: text (unique),      // Discord user ID
  discordUsername: text,         // Cached Discord username
  primaryWallet: text,           // Linked 0x wallet address
  walletLinkedAt: timestamp,     // When wallet was linked
  createdAt: timestamp,
  profileData: jsonb,            // Extensible JSON blob (contains dfkSnapshot)
  status: text,                  // "active", "banned", etc.
}
```

#### `wallet_snapshots`
Daily wallet balance snapshots for historical tracking.

```typescript
{
  id: serial,
  playerId: integer,             // FK to players
  wallet: text,                  // 0x address
  asOfDate: date,                // Snapshot date (midnight UTC)
  jewelBalance: text,            // JEWEL balance as string
  crystalBalance: text,          // CRYSTAL balance
  cJewelBalance: text,           // cJEWEL locked balance
}
```

Unique constraint: `(wallet, asOfDate)` for upsert support.

#### `hero_classes`
Reference table for DFK hero classes with Level Racer configuration.

```typescript
{
  id: serial,
  name: text,                    // e.g., "Warrior", "Wizard"
  slug: text (unique),           // URL-safe identifier
  isEnabled: boolean,            // Active in Level Racer
  defaultEntryFee: text,         // Default USD entry fee
  defaultPrize: text,            // Default USD prize
}
```

#### `class_pools`
Level Racer race pool configuration.

```typescript
{
  id: serial,
  heroClassId: integer,          // FK to hero_classes
  slug: text (unique),           // Pool URL identifier
  status: text,                  // "open", "filling", "racing", "finished"
  tokenType: text,               // "JEWEL", "CRYSTAL", "USDC"
  usdEntryFee: text,             // Entry fee in USD
  usdPrize: text,                // Prize in USD
  heroesRequired: integer,       // Heroes needed to start
  rarityFilter: text,            // "common", "uncommon", etc.
  maxMutations: integer,         // Max allowed mutations
  isRecurrent: boolean,          // Auto-recreate after finish
}
```

#### `pool_entries`
Heroes entered in Level Racer pools.

```typescript
{
  id: serial,
  poolId: integer,               // FK to class_pools
  heroId: text,                  // DFK hero ID
  playerId: integer,             // FK to players
  wallet: text,                  // Player wallet
  enteredAt: timestamp,
  currentXp: integer,            // Last recorded XP
  isWinner: boolean,
}
```

#### `race_events`
Event log for Level Racer races.

```typescript
{
  id: serial,
  poolId: integer,
  eventType: text,               // "HERO_JOINED", "XP_GAINED", "WINNER", etc.
  heroId: text,
  playerId: integer,
  eventData: jsonb,              // Additional event context
  createdAt: timestamp,
}
```

#### Bridge Tracking Tables

For extractor detection:

- `bridge_events` - Individual bridge transaction records
- `bridge_sync_state` - Indexer progress tracking

---

## Blockchain Data Fetching

### Hero Data via GraphQL

```javascript
// Get all heroes by owner (paginated)
import { getAllHeroesByOwner } from './onchain-data.js';
const heroes = await getAllHeroesByOwner('0x...');
// Returns array of hero objects with stats, genes, quest status
```

Key fields per hero:
- `id`, `normalizedId`, `network`, `originRealm`
- `mainClassStr`, `subClassStr`, `professionStr`
- `level`, `generation`, `rarity`
- `strength`, `intelligence`, `wisdom`, `luck`, etc.
- `gardening`, `mining`, `foraging`, `fishing` (profession skills)
- `currentQuest` (active quest address)
- `statGenes`, `visualGenes` (genetic data)

### LP Staking Contract Interactions

**Contract Addresses**:
- DFK Chain: `0xB04e8D6aED037904B77A9F0b08002592925833b7`
- Klaytn: `0xcce557DF36a6E774694D5071FC1baF19B9b07Fdc`

```javascript
// Get garden pool info
import { getGardenPools } from './onchain-data.js';
const pools = await getGardenPools('dfk', 14);
// Returns pool metadata with allocPoints, TVL, etc.
```

### Garden Pool Metadata

Pre-defined pool configuration in `onchain-data.js`:

```javascript
const GARDEN_POOLS = {
  dfk: [
    { pid: 0, pair: 'wJEWEL-xJEWEL', lpToken: '0x6AC38A4C112F125eac0eBDbaDBed0BC8F4575d0d' },
    { pid: 1, pair: 'CRYSTAL-AVAX', lpToken: '0x9f378F48d0c1328fd0C80d7Ae544c6CadB5Ba99E' },
    { pid: 2, pair: 'CRYSTAL-wJEWEL', lpToken: '0x48658E69D741024b4686C8f7b236D3F1D291f386' },
    // ... 14 pools total
  ],
  klaytn: [
    { pid: 0, pair: 'JADE-JEWEL', lpToken: '0x85DB3CC4BCDB8bffA073A3307D48Ed97C78Af0AE' },
    // ... 11 pools total
  ]
};
```

### Wallet Balance Fetching

```javascript
import { fetchWalletBalances, fetchCJewelLockTime } from './blockchain-balance-fetcher.js';

const balances = await fetchWalletBalances('0x...');
// Returns: { jewel, crystal, cjewel } as strings

const lockInfo = await fetchCJewelLockTime('0x...');
// Returns: { lockDaysRemaining }
```

---

## GraphQL API Integration

### Querying Heroes

```graphql
query GetHero($heroId: ID!) {
  hero(id: $heroId) {
    id
    normalizedId
    network
    mainClassStr
    subClassStr
    professionStr
    rarity
    generation
    level
    xp
    strength intelligence wisdom luck agility vitality endurance dexterity
    hp mp stamina
    mining gardening foraging fishing
    summons maxSummons summonsRemaining
    staminaFullAt
    owner { id name }
    salePrice assistingPrice
    statGenes visualGenes
    passive1 passive2 active1 active2
  }
}
```

### Searching Marketplace

```graphql
query CheapestHeroes($where: HeroFilter, $first: Int!) {
  heroes(
    where: $where
    first: $first
    orderBy: salePrice
    orderDirection: asc
  ) {
    id normalizedId mainClassStr professionStr rarity level generation
    summons maxSummons salePrice
    owner { name }
  }
}
```

Filter options:
- `mainClassStr`, `professionStr`
- `salePrice_not: null` (for sale only)
- `salePrice_lte`, `level_gte`, `level_lte`

---

## Caching & Analytics Layer

### Pool Cache System

File: `pool-cache.js`, `quick-data-fetcher.js`

In-memory cache with 5-minute TTL for pool analytics:

```javascript
import { getCachedPoolAnalytics, getCachedPool, searchCachedPools } from './pool-cache.js';

// Get all cached pool data
const cached = getCachedPoolAnalytics();
// Returns: { data: [...pools], lastUpdated, ageMinutes }

// Get specific pool
const pool = getCachedPool(2);

// Search pools by name
const matches = searchCachedPools('CRYSTAL');
```

### Garden Analytics Engine

File: `garden-analytics.js`

Computes real-time yields using DFK's formula:
- Quest Reward Fund balances
- Pool allocation percentages
- User LP share calculations
- APR/APY projections

---

## Snapshot System

### Snapshot Service

File: `snapshot-service.js`

Builds comprehensive player snapshots:

```javascript
import { buildPlayerSnapshot } from './snapshot-service.js';

const snapshot = await buildPlayerSnapshot('0x...');
/* Returns:
{
  wallet: '0x...',
  heroCount: 15,
  gen0Count: 2,
  influence: 1250,
  totalLPValue: 5432.10,
  jewelBalance: 1234.5678,
  crystalBalance: 567.8901,
  cJewelBalance: 10000,
  cJewelLockDaysRemaining: 180,
  dfkAgeDays: 365,
  firstTxAt: '2022-01-15T00:00:00.000Z',
  lpPositions: [...],
  updatedAt: '2024-12-09T03:00:00.000Z',
}
*/
```

### Daily Snapshot Job

File: `wallet-snapshot-job.js`

Cron job running at 03:00 UTC daily:

```javascript
import { startSnapshotJob, stopSnapshotJob } from './wallet-snapshot-job.js';

// Start cron (default: "0 3 * * *")
await startSnapshotJob();

// Override schedule via env
process.env.SNAPSHOT_CRON = "0 6 * * *";
```

**Storage locations**:
1. `players.profileData.dfkSnapshot` - JSON blob in player record
2. `wallet_snapshots` table - Normalized historical data

---

## Key Data Pipelines

### 1. Hero Data Pipeline

```
GraphQL API → onchain-data.js → hero-genetics.js (decode) → Application
                                        ↓
                              Genetics breakdown (mainClass, subClass, profession genes)
```

### 2. Garden Analytics Pipeline

```
LP Staking Contract → garden-analytics.js → pool-cache.js → quick-data-fetcher.js
        ↓                     ↓
   Pool info           Quest Reward Fund
   User stakes         APR calculations
```

### 3. Wallet Snapshot Pipeline

```
node-cron (03:00 UTC)
        ↓
wallet-snapshot-job.js → For each player with wallet:
        ↓
snapshot-service.js → buildPlayerSnapshot()
        ↓
    ┌───────────────────────────────────────────┐
    │ 1. getAllHeroesByOwner() - Hero data      │
    │ 2. getPlayerInfluence() - Metis influence │
    │ 3. fetchWalletBalances() - Token balances │
    │ 4. detectWalletLPPositions() - LP stakes  │
    │ 5. getFirstDfkTxTimestamp() - Account age │
    └───────────────────────────────────────────┘
        ↓
Writes to: players.profileData.dfkSnapshot (JSON)
           wallet_snapshots table (normalized)
```

### 4. Bridge Event Pipeline (Extractor Detection)

```
DFK Chain RPC → bridge-tracker/standalone-sync.js
        ↓
Index bridge events → Enrich with USD values
        ↓
bridge_events table → Calculate net extraction per wallet
        ↓
Extractor scores → Player user model classification
```

---

## ETL Integration Points

### Recommended Integration Strategies

#### 1. Database Direct Access

Connect directly to PostgreSQL for:
- Player records (`players`)
- Historical balance snapshots (`wallet_snapshots`)
- Level Racer data (`class_pools`, `pool_entries`, `race_events`)
- Bridge events (`bridge_events`)

**Connection**: Use `DATABASE_URL` environment variable with standard PostgreSQL driver.

#### 2. Snapshot Data Export

The `wallet_snapshots` table provides clean, normalized data ideal for ETL:

```sql
SELECT 
  ws.wallet,
  ws.as_of_date,
  ws.jewel_balance::numeric,
  ws.crystal_balance::numeric,
  ws.c_jewel_balance::numeric,
  p.discord_id,
  p.discord_username
FROM wallet_snapshots ws
JOIN players p ON ws.player_id = p.id
WHERE ws.as_of_date >= CURRENT_DATE - INTERVAL '30 days'
ORDER BY ws.as_of_date DESC;
```

#### 3. Real-time Blockchain Data

For live data, call the JavaScript modules directly:

```javascript
// Hero inventory
const heroes = await getAllHeroesByOwner(wallet);

// Pool analytics
const pools = await getGardenPools('dfk');

// Player snapshot
const snapshot = await buildPlayerSnapshot(wallet);
```

#### 4. GraphQL Passthrough

For hero/market data, query DFK's GraphQL API directly:

**Endpoint**: `https://api.defikingdoms.com/graphql`

No authentication required. Rate limits apply.

### Data Freshness

| Data Type | Update Frequency | Source |
|-----------|------------------|--------|
| Wallet Snapshots | Daily (03:00 UTC) | `wallet_snapshots` table |
| Pool Analytics | Every 5 minutes | In-memory cache |
| Hero Data | Real-time | GraphQL API |
| Token Balances | On-demand | RPC calls |
| Bridge Events | Continuous sync | `bridge_events` table |

### Common Queries for ETL

#### Active Players with Wallets

```sql
SELECT id, discord_id, discord_username, primary_wallet, wallet_linked_at
FROM players
WHERE primary_wallet IS NOT NULL
  AND status = 'active';
```

#### Balance History

```sql
SELECT wallet, as_of_date,
       jewel_balance::numeric as jewel,
       crystal_balance::numeric as crystal,
       c_jewel_balance::numeric as cjewel
FROM wallet_snapshots
WHERE wallet = $1
ORDER BY as_of_date DESC
LIMIT 30;
```

#### Level Racer Participation

```sql
SELECT 
  p.discord_username,
  hc.name as hero_class,
  cp.status as pool_status,
  pe.hero_id,
  pe.current_xp,
  pe.is_winner
FROM pool_entries pe
JOIN class_pools cp ON pe.pool_id = cp.id
JOIN hero_classes hc ON cp.hero_class_id = hc.id
JOIN players p ON pe.player_id = p.id
ORDER BY pe.entered_at DESC;
```

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `DISCORD_TOKEN` | Discord bot token |
| `OPENAI_API_KEY` | OpenAI API key for AI responses |
| `SNAPSHOT_CRON` | Cron schedule for snapshots (default: `0 3 * * *`) |

---

## File Reference

| File | Purpose |
|------|---------|
| `server/db.js` | Database connection |
| `shared/schema.ts` | Drizzle schema definitions |
| `onchain-data.js` | GraphQL + RPC blockchain access |
| `garden-analytics.js` | LP pool yield calculations |
| `pool-cache.js` | In-memory pool data cache |
| `quick-data-fetcher.js` | Fast cached data access |
| `snapshot-service.js` | Player snapshot builder |
| `wallet-snapshot-job.js` | Daily snapshot cron job |
| `blockchain-balance-fetcher.js` | Token balance fetching |
| `wallet-lp-detector.js` | LP position detection |
| `hero-genetics.js` | Hero gene decoding |
| `bridge-tracker/standalone-sync.js` | Bridge event indexer |

---

## ETL Subsystem Implementation

### Overview

The ETL (Extract-Transform-Load) subsystem is located in `src/etl/` and provides automated data extraction, transformation into challenge metrics, and loading into database tables.

### Architecture

```
src/etl/
├── types.ts                 # Core types and interfaces
├── extractors/              # Data extraction from various sources
│   ├── index.ts            # Main extractor orchestrator
│   ├── heroExtractor.ts    # Hero data from GraphQL
│   ├── questExtractor.ts   # Quest activity data
│   ├── summonExtractor.ts  # Summon history
│   ├── petExtractor.ts     # Pet ownership
│   ├── meditationExtractor.ts # Meditation crystals/stat gains
│   ├── gardenExtractor.ts  # LP positions and yields
│   ├── portfolioExtractor.ts # Token balances
│   ├── discordExtractor.ts # Discord interaction history
│   └── paymentExtractor.ts # Payment/donation history
├── transformers/            # Compute behavior metrics
│   ├── index.ts            # Main transformer orchestrator
│   └── behaviorTransformer.ts # Behavior model calculations
├── loaders/                 # Write to database tables
│   ├── index.ts            # Main loader orchestrator
│   ├── challengeProgressLoader.ts # player_challenge_progress
│   ├── walletActivityLoader.ts    # wallet_activity
│   ├── snapshotLoader.ts          # wallet_snapshots, wallet_power_snapshots
│   └── transferAggregateLoader.ts # wallet_transfer_aggregates
└── services/                # Main orchestration
    ├── EtlService.ts       # Core ETL service with runForCluster/warmupWallet
    └── EtlScheduler.ts     # Cron-based scheduling
```

### Core Methods

#### EtlService

```typescript
import { etlService } from './etl';

// Run ETL for all wallets in a league cluster
const results = await etlService.runForCluster('league_2025_01');

// Warmup a single wallet (full extraction + snapshots)
const result = await etlService.warmupWallet('0x1234...');

// Run incremental ETL for active wallets
await etlService.runIncremental();

// Run daily snapshot ETL for all wallets
await etlService.runDailySnapshot();
```

#### EtlScheduler

```typescript
import { etlScheduler } from './etl';

// Start automated scheduling
etlScheduler.start();

// Stop scheduling
etlScheduler.stop();

// Manual triggers
await etlScheduler.triggerIncremental();
await etlScheduler.triggerDailySnapshot();
```

### Scheduling

- **Incremental ETL**: Every 10 minutes for active wallets
- **Daily Snapshot**: 03:00 UTC for all wallets (full hero/garden snapshot)

Enable scheduling by setting `ETL_SCHEDULER_ENABLED=true` in environment.

### Data Sources (metricSource)

| Source | Description |
|--------|-------------|
| `onchain_heroes` | Hero count, levels, classes, rarity, genes |
| `onchain_quests` | Profession quests, training quests, crystals |
| `onchain_summons` | Summon counts by class, rarity |
| `onchain_pets` | Pet count, gardening pets |
| `onchain_meditation` | Crystals used, stat gains, perfect meditations |
| `onchain_gardens` | LP positions, yields |
| `onchain_portfolio` | JEWEL, CRYSTAL, cJEWEL balances |
| `behavior_model` | Computed behavior metrics |
| `discord_interactions` | Message counts, day streaks |
| `payment_events` | JEWEL sent to Hedge |

### Behavior Metrics (behavior_model)

The transformer computes these derived metrics:

- `questDayStreak`: Consecutive days with quests
- `trainingStatMatchPct`: Optimal stat matching percentage
- `trainingDayStreak`: Consecutive training days
- `correctCrystalUsagePct`: Crystal usage efficiency
- `questEfficiencyPct`: Quest completion efficiency
- `reinvestRatioPct`: Reinvestment vs extraction
- `optimizationsCompleted`: Garden optimizations done
- `professionMatchPct`: Hero-profession alignment
- `professionBonusTriggerPct`: Bonus trigger rate
- `extractorScoreInverted`: Non-extractor commitment score
- `longTermActiveDays`: Estimated active days
- `allCategoriesRarePlus`: Multi-category mastery flag

### Database Tables Updated

- `player_challenge_progress`: Challenge tier achievements
- `wallet_activity`: Daily activity metrics
- `wallet_snapshots`: Daily balance snapshots
- `wallet_power_snapshots`: Power calculation snapshots
- `wallet_transfer_aggregates`: Transfer analysis for smurf detection

### Integration Points

After ETL runs for a cluster, automatically triggers:
- TierService.computeBaseTierForCluster() for tier recomputation

---

*Document generated for Hedge Ledger ETL integration. Last updated: December 2024.*
