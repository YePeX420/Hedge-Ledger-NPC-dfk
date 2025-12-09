# Hedge Ledger - Challenge System Backend Report
**Generated:** December 9, 2025

This report documents the current state of the Challenge/Achievement System implementation for ETL integration planning.

---

## 1. DATABASE SCHEMA (Drizzle ORM - PostgreSQL)

### 1.1 Challenge Categories Table
```typescript
challengeCategories = pgTable("challenge_categories", {
  id: serial("id").primaryKey(),
  key: varchar("key", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 128 }).notNull(),
  description: text("description"),
  tierSystem: varchar("tier_system", { length: 32 }).notNull(), // RARITY, GENE, MIXED, PRESTIGE
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
});
```

### 1.2 Challenges Table
```typescript
challenges = pgTable("challenges", {
  id: serial("id").primaryKey(),
  key: varchar("key", { length: 64 }).notNull().unique(),
  categoryKey: varchar("category_key", { length: 64 }).notNull(),
  name: varchar("name", { length: 128 }).notNull(),
  description: text("description"),
  metricType: varchar("metric_type", { length: 32 }).notNull(), // COUNT, STREAK, SCORE, BOOLEAN, COMPOSITE
  metricSource: varchar("metric_source", { length: 64 }).notNull(), // onchain_heroes, behavior_model, discord_interactions, etc.
  metricKey: varchar("metric_key", { length: 64 }).notNull(), // The specific metric to track
  tierSystemOverride: varchar("tier_system_override", { length: 32 }), // Override category's tier system
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  meta: json("meta"), // { icon, tags, tooltip }
  createdAt: timestamp("created_at"),
  updatedAt: timestamp("updated_at"),
});
```

### 1.3 Challenge Tiers Table
```typescript
challengeTiers = pgTable("challenge_tiers", {
  id: serial("id").primaryKey(),
  challengeKey: varchar("challenge_key", { length: 64 }).notNull(),
  tierCode: varchar("tier_code", { length: 32 }).notNull(), // COMMON, UNCOMMON, RARE, LEGENDARY, MYTHIC, BASIC, ADVANCED, ELITE, EXALTED
  displayName: varchar("display_name", { length: 64 }).notNull(),
  thresholdValue: integer("threshold_value").notNull(), // Value needed to achieve this tier
  isPrestige: boolean("is_prestige").notNull().default(false), // Ultra-rare tier
  sortOrder: integer("sort_order").notNull().default(0),
  meta: json("meta"), // { description }
  createdAt: timestamp("created_at"),
});
// Unique index on (challengeKey, tierCode)
```

### 1.4 Player Challenge Progress Table
```typescript
playerChallengeProgress = pgTable("player_challenge_progress", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id", { length: 128 }).notNull(), // Discord user ID
  walletAddress: varchar("wallet_address", { length: 64 }), // Optional wallet for on-chain challenges
  challengeKey: varchar("challenge_key", { length: 64 }).notNull(),
  currentValue: integer("current_value").notNull().default(0), // Current progress value
  highestTierAchieved: varchar("highest_tier_achieved", { length: 32 }), // Tier code
  achievedAt: timestamp("achieved_at"), // When highest tier was achieved
  lastUpdated: timestamp("last_updated"),
  meta: json("meta"), // { streakStart, streakEnd, history }
});
// Unique index on (userId, challengeKey)
```

---

## 2. CHALLENGE CONFIGURATION (TypeScript Config)

### 2.1 Type Definitions
```typescript
type TierSystem = "RARITY" | "GENE" | "MIXED" | "PRESTIGE";

type ChallengeTierCode =
  | "COMMON" | "UNCOMMON" | "RARE" | "LEGENDARY" | "MYTHIC"  // RARITY system
  | "BASIC" | "ADVANCED" | "ELITE" | "EXALTED";              // GENE system

type MetricType = "COUNT" | "STREAK" | "SCORE" | "BOOLEAN" | "COMPOSITE";

interface ChallengeDef {
  key: string;
  categoryKey: string;
  name: string;
  description: string;
  tierSystemOverride?: TierSystem;
  metricType: MetricType;
  metricSource: string;   // Data source identifier
  metricKey: string;      // Specific metric within source
  isActive: boolean;
  sortOrder: number;
  meta?: { icon, tags, tooltip };
  tiers: ChallengeTierDef[];
}
```

### 2.2 Categories (8 total)
| Key | Name | Tier System |
|-----|------|-------------|
| hero_progression | Hero Progression | RARITY |
| economy_strategy | Economy & Strategy | GENE |
| profession_specialization | Profession Specialization | MIXED |
| ownership_collection | Ownership & Collection | RARITY |
| behavior_engagement | Behavior & Engagement | GENE |
| seasonal_events | Seasonal Events | MIXED |
| prestige_overall | Prestige | PRESTIGE |
| summoning_prestige | Summoning Prestige | PRESTIGE |

### 2.3 Challenges Summary (36 total)

#### Hero Progression (14 challenges)
| Key | Metric Source | Metric Key | Type |
|-----|---------------|------------|------|
| hero_riser | onchain_heroes | total_levels | COUNT |
| master_of_professions | onchain_quests | profession_quests_total | COUNT |
| eternal_summoner | onchain_summons | total_summons | COUNT |
| class_mastery_trial | onchain_heroes | classes_level10_plus | COUNT |
| great_questor_streak | behavior_model | quest_day_streak | STREAK |
| trainers_path | onchain_quests | training_quests_total | COUNT |
| stat_specialist | behavior_model | training_stat_match_pct | SCORE |
| crystal_seeker | onchain_quests | training_crystals_obtained | COUNT |
| dedicated_trainer | behavior_model | training_day_streak | STREAK |
| crystal_consumer | onchain_meditation | crystals_used_total | COUNT |
| focused_meditation | behavior_model | correct_crystal_usage_pct | SCORE |
| enlightened_one | onchain_meditation | total_meditations | COUNT |
| stat_mastery | onchain_meditation | total_stat_gain | COUNT |
| genetic_enlightenment | onchain_meditation | perfect_meditations | COUNT |

#### Economy & Strategy (5 challenges)
| Key | Metric Source | Metric Key | Type |
|-----|---------------|------------|------|
| yield_strategist | behavior_model | quest_efficiency_pct | SCORE |
| garden_architect | onchain_gardens | lp_yield_token_equivalent | COUNT |
| token_steward | onchain_portfolio | jewel_equivalent_balance | SCORE |
| reinvestment_sage | behavior_model | reinvest_ratio_pct | SCORE |
| optimization_follower | behavior_model | optimizations_completed | COUNT |

#### Profession Specialization (6 challenges)
| Key | Metric Source | Metric Key | Type |
|-----|---------------|------------|------|
| great_miner | onchain_quests | mining_quests | COUNT |
| herbalist | onchain_quests | gardening_quests | COUNT |
| fisher_king | onchain_quests | fishing_quests | COUNT |
| ranger_of_the_wilds | onchain_quests | foraging_quests | COUNT |
| profession_purist | behavior_model | profession_match_pct | SCORE |
| bonus_trigger_master | behavior_model | profession_bonus_trigger_pct | SCORE |

#### Ownership & Collection (3 challenges)
| Key | Metric Source | Metric Key | Type |
|-----|---------------|------------|------|
| house_of_heroes | onchain_heroes | hero_count | COUNT |
| pet_sanctuary | onchain_pets | pet_count | COUNT |
| gen0_monarch | onchain_heroes | gen0_count | COUNT |

#### Behavior & Engagement (4 challenges)
| Key | Metric Source | Metric Key | Type |
|-----|---------------|------------|------|
| kingdom_calls | discord_interactions | messages_to_hedge | COUNT |
| loyal_follower | discord_interactions | hedge_day_streak | STREAK |
| non_extractor | behavior_model | extractor_score_inverted | SCORE |
| hedges_chosen | payment_events | jewel_sent_to_hedge | COUNT |

#### Seasonal Events (1 challenge - inactive)
| Key | Metric Source | Metric Key | Type |
|-----|---------------|------------|------|
| winters_solstice | event_progress | winter_level_ups | COUNT |

#### Prestige (4 challenges)
| Key | Metric Source | Metric Key | Type |
|-----|---------------|------------|------|
| true_exalted_bloodline | onchain_heroes | exalted_gene_hero_count | COUNT |
| mythic_hoarder | onchain_heroes | mythic_hero_count | COUNT |
| eternal_activity | behavior_model | long_term_active_days | STREAK |
| master_of_all_trades | behavior_model | all_categories_rare_plus | BOOLEAN |

#### Summoning Prestige (8 challenges)
| Key | Metric Source | Metric Key | Type |
|-----|---------------|------------|------|
| summon_dragoon | onchain_summons | summons_dragoon | COUNT |
| summon_dreadknight | onchain_summons | summons_dreadknight | COUNT |
| summon_sage | onchain_summons | summons_sage | COUNT |
| summon_paladin | onchain_summons | summons_paladin | COUNT |
| summon_dark_knight | onchain_summons | summons_dark_knight | COUNT |
| summon_high_tier_genes | onchain_summons | summons_high_tier_genes | COUNT |
| summon_mythic_heroes | onchain_summons | summons_mythic_rarity | COUNT |
| summon_trifecta | onchain_summons | has_trifecta_ultra_rare | BOOLEAN |

---

## 3. METRIC SOURCES REQUIRED BY ETL

The challenges reference these metric sources that ETL must provide:

### 3.1 On-Chain Sources
| Source | Description | Required Metrics |
|--------|-------------|------------------|
| `onchain_heroes` | Hero roster data | total_levels, classes_level10_plus, hero_count, gen0_count, exalted_gene_hero_count, mythic_hero_count |
| `onchain_quests` | Quest completion data | profession_quests_total, training_quests_total, training_crystals_obtained, mining_quests, gardening_quests, fishing_quests, foraging_quests |
| `onchain_summons` | Summoning history | total_summons, summons_dragoon, summons_dreadknight, summons_sage, summons_paladin, summons_dark_knight, summons_high_tier_genes, summons_mythic_rarity, has_trifecta_ultra_rare |
| `onchain_meditation` | Meditation events | crystals_used_total, total_meditations, total_stat_gain, perfect_meditations |
| `onchain_gardens` | LP/Garden positions | lp_yield_token_equivalent |
| `onchain_portfolio` | Token balances | jewel_equivalent_balance |
| `onchain_pets` | Pet ownership | pet_count |

### 3.2 Behavior Model Sources (Computed)
| Source | Description | Required Metrics |
|--------|-------------|------------------|
| `behavior_model` | Computed behavioral KPIs | quest_day_streak, training_stat_match_pct, training_day_streak, correct_crystal_usage_pct, quest_efficiency_pct, reinvest_ratio_pct, optimizations_completed, profession_match_pct, profession_bonus_trigger_pct, extractor_score_inverted, long_term_active_days, all_categories_rare_plus |

### 3.3 Discord Interaction Sources
| Source | Description | Required Metrics |
|--------|-------------|------------------|
| `discord_interactions` | Bot interaction tracking | messages_to_hedge, hedge_day_streak |
| `payment_events` | JEWEL payments to Hedge | jewel_sent_to_hedge |

---

## 4. TIER SERVICE (CPS-Based Tier Assignment)

### 4.1 Input Metrics Required
```typescript
interface ClusterKpiSnapshot {
  heroPower: {
    commonHeroes: number;
    uncommonHeroes: number;
    rareHeroes: number;
    legendaryHeroes: number;
    mythicHeroes: number;
    totalHeroLevels: number;
  };
  walletValue: {
    totalNetWorthUsd: number;
  };
  activity30d: {
    professionQuests30d: number;
    summons30d: number;
    staminaUtilizationRate: number; // 0-1
    daysActive30d: number;
  };
  accountAge: {
    accountAgeDays: number;
  };
  behavior30d: {
    reinvestRatio30d: number; // 0-1
    netHeroDelta30d: number;
    heavySellActivityFlag: 0 | 1;
  };
}
```

### 4.2 CPS Formula
```
CPS = 0.40 × HPS_norm + 0.25 × WVS_norm + 0.20 × AS_norm + 0.10 × AAS_norm + 0.05 × BHS_norm

Where:
- HPS = (1×Common) + (2×Uncommon) + (4×Rare) + (8×Legendary) + (12×Mythic) + (0.1×TotalLevels)
- WVS = log10(1 + totalNetWorthUsd)
- AS = (0.03 × quests30d) + (0.1 × summons30d) + (0.02 × staminaRate × 100) + (0.5 × daysActive30d)
- AAS = 0-4 based on account age buckets
- BHS = (2 × reinvestRatio) + (1 × positiveDelta) - (2 × heavySellFlag)

Tier mapping:
- CPS < 20: COMMON
- CPS < 40: UNCOMMON
- CPS < 60: RARE
- CPS < 80: LEGENDARY
- CPS >= 80: MYTHIC
```

### 4.3 Exported Functions
```typescript
export function computeBaseTierFromMetrics(snapshot: ClusterKpiSnapshot): TierComputationResult;
export function createEmptySnapshot(): ClusterKpiSnapshot;
export async function computeBaseTierForCluster(clusterKey: string): Promise<TierComputationResult>;
```

---

## 5. SMURF DETECTION SERVICE

### 5.1 Detection Rules (Configurable)
| Rule Key | Description | Default Action |
|----------|-------------|----------------|
| INBOUND_POWER_SPIKE | Sudden power increase before signup | ESCALATE_TIER |
| POWER_JUMP_AFTER_TIER_LOCK | Power increased after tier was locked | ESCALATE_TIER |
| MULTI_WALLET_CLUSTER_SMURF | Cluster has high-tier wallets | ESCALATE_TIER |
| DISQUALIFY_ON_INBOUND_DURING_FREEZE | Inbound transfers during freeze window | DISQUALIFY |

### 5.2 Database Tables Used
- `smurf_detection_rules` - Rule configurations
- `smurf_incidents` - Triggered incident records
- `wallet_power_snapshots` - Historical power scores
- `wallet_transfer_aggregates` - Transfer summaries
- `wallet_clusters` - User wallet groupings
- `wallet_links` - Individual wallet linkages

### 5.3 Exported Functions
```javascript
export async function runPreSeasonChecks({ userId, clusterKey, seasonId, walletAddress });
export async function runInSeasonChecks({ clusterKey, seasonId });
export async function getOrCreateCluster(userId);
export async function linkWalletToCluster(clusterKey, chain, address, isPrimary);
```

---

## 6. LEAGUE SYSTEM

### 6.1 Database Tables
```typescript
leagueSeasons = pgTable("league_seasons", {
  id, name, description, status, // UPCOMING, REGISTRATION, ACTIVE, COMPLETED, CANCELLED
  registrationStart, registrationEnd, seasonStart, seasonEnd,
  entryFee: json, // { amount, token, payToAddress }
  config: json
});

leagueSignups = pgTable("league_signups", {
  id, seasonId, userId, clusterKey, walletAddress,
  baseTierCode, lockedTierCode, tierAdjusted, disqualified, disqualificationReason,
  entryFeePaid, entryFeeTxHash, status // PENDING, CONFIRMED, DISQUALIFIED
});

seasonTierLocks = pgTable("season_tier_locks", {
  id, seasonId, clusterKey, lockedTierCode, lockedAt
});
```

### 6.2 Tier Mapping
| Player Tier (CPS) | League Tier |
|-------------------|-------------|
| COMMON | BRONZE |
| UNCOMMON | SILVER |
| RARE | GOLD |
| LEGENDARY | PLATINUM |
| MYTHIC | LEGENDARY |

---

## 7. PLAYER CLASSIFICATION ENGINE

### 7.1 Intent-Based Archetypes (Primary)
```typescript
type IntentArchetype =
  | "PROGRESSION_GAMER"
  | "INVESTOR_GROWTH"
  | "INVESTOR_EXTRACTION"
  | "SOCIAL_COMMUNITY"
  | "EXPLORATION_CURIOUS"
  | "HYBRID";
```

### 7.2 Legacy Archetypes (Backwards Compatibility)
```typescript
type Archetype =
  | "GUEST"
  | "MINER"
  | "FISHER"
  | "FORAGER"
  | "GARDENER"
  | "GAMER"
  | "INVESTOR"
  | "EXTRACTOR"
  | "WHALE";
```

### 7.3 Exported Functions
```javascript
export function classifyProfile(profile);
export function updateKpisFromEvent(profile, event);
export function processEventAndReclassify(profile, event);
export function computeIntentScores(context);
export function determineIntentArchetype(scores, context);
export function mapIntentToLegacyArchetype(intentArchetype);
export function getProfileSummary(profile);
```

---

## 8. EXISTING PLAYER DATA TABLES

### 8.1 Players Table
```typescript
players = pgTable("players", {
  id, discordId, discordUsername, firstSeenAt, lastSeenAt,
  wallets: json, // string[]
  primaryWallet,
  engagementState, // visitor, explorer, participant, player, active, committed
  extractorScore, extractorClassification, // normal, extractor_tending, extractor
  totalSessions, totalMessages, totalMilestones,
  profileData: json, // Full classification profile
  firstDfkTxTimestamp // DFK account age cache
});
```

### 8.2 Wallet Activity Table
```typescript
walletActivity = pgTable("wallet_activity", {
  id, playerId, wallet, asOfDate,
  questsCompleted7d, questsCompleted30d, questsCompleted90d,
  heroesLeveled7d, heroesLeveled30d,
  summonsMade7d, summonsMade30d,
  heroesPurchased7d/30d, heroesSold7d/30d,
  floorHeroesBought7d, floorHeroesFlipped7d,
  gardenDeposits7d/30d, gardenWithdrawals7d/30d,
  rewardsClaimed7d, rewardsSoldImmediately7d,
  bridgeTransactions7d/30d, activeRealms,
  totalHeroLevel, totalHeroCount, petsOwned, petsLinked
});
```

### 8.3 Wallet Snapshots Table
```typescript
walletSnapshots = pgTable("wallet_snapshots", {
  id, playerId, wallet, asOfDate,
  jewelBalance, crystalBalance, cJewelBalance,
  jewelPriceUsd, crystalPriceUsd,
  lifetimeDeposit, change7d
});
```

---

## 9. API ROUTES STATUS

### 9.1 Currently Implemented
- **Level Racer API** - Full CRUD for pools, entries, events
- **Admin Dashboard Routes** - Authentication, settings, stats
- **Discord Bot Commands** - Garden optimization, hero analysis

### 9.2 NOT YET IMPLEMENTED
- `GET /api/challenges` - List all challenges with tiers
- `GET /api/challenges/categories` - List categories
- `GET /api/challenges/:userId/progress` - User progress
- `POST /api/challenges/:userId/update` - Update progress
- `GET /api/leagues` - List seasons
- `POST /api/leagues/:seasonId/signup` - League signup

---

## 10. SEED SCRIPT STATUS

**File:** `challenges-seed.js`

**Status:** ✅ Implemented

Reads `src/data/challengeConfig.ts` and upserts:
- 8 categories
- 36 challenges
- ~150 tier thresholds

Run with: `npx tsx challenges-seed.js`

---

## 11. ENVIRONMENT VARIABLES

```
DATABASE_URL, PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE
DISCORD_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID, DISCORD_CLIENT_SECRET
OPENAI_API_KEY, OPENAI_MODEL
SESSION_SECRET, ADMIN_CHANNEL_ID, OWNER_ID, ADMIN_ROLE_ID
```

---

## 12. ETL INTEGRATION REQUIREMENTS

### What ETL Must Write To:
1. `playerChallengeProgress` - currentValue, highestTierAchieved, meta
2. `walletActivity` - Daily activity snapshots
3. `walletSnapshots` - Balance snapshots
4. `walletPowerSnapshots` - For smurf detection
5. `walletTransferAggregates` - For smurf detection

### What ETL Must Read From:
1. DFK GraphQL API - Heroes, quests, summons, gardens
2. DFK RPC - Token balances, LP positions, meditation events
3. Discord activity - Already tracked in `interactionMessages`

### Computed Metrics ETL Must Generate:
1. All `behavior_model` metrics (quest efficiency, reinvest ratio, streaks, etc.)
2. All aggregate counts from on-chain sources
3. CPS inputs for TierService

---

## 13. TESTING CHECKLIST

### Backend Tests Needed:
- [ ] Run seed script: `npx tsx challenges-seed.js`
- [ ] Verify categories in DB: `SELECT * FROM challenge_categories`
- [ ] Verify challenges in DB: `SELECT * FROM challenges`
- [ ] Verify tiers in DB: `SELECT * FROM challenge_tiers`
- [ ] Test TierService with mock data
- [ ] Test SmurfDetectionService with mock clusters

### Frontend Tests Needed (Admin Dashboard):
- [ ] Challenge category list view
- [ ] Challenge detail view with tier thresholds
- [ ] Player progress lookup
- [ ] League management panel

---

**End of Report**
