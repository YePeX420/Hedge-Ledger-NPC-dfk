# Hedge Ledger Challenge System Specification

## Document Purpose
This is the canonical reference for the gamified Challenge/Achievement system. Use this to understand, expand, or rebuild the challenge infrastructure.

---

## Table of Contents
1. [Big Picture](#big-picture)
2. [Architecture Overview](#architecture-overview)
3. [Tier Systems](#tier-systems)
4. [Category Breakdown](#category-breakdown)
5. [Complete Challenge Catalog](#complete-challenge-catalog)
6. [Data Capture Strategy](#data-capture-strategy)
7. [Database Schema](#database-schema)
8. [ETL Pipeline](#etl-pipeline)
9. [Player Classification Integration](#player-classification-integration)
10. [Expansion Guide](#expansion-guide)

---

## Big Picture

### What Challenges Do
Challenges are the **gamified achievement layer** that:
1. **Tracks player activity** across multiple dimensions (heroes, quests, economy, behavior)
2. **Assigns tiers** based on thresholds (Common → Mythic or Basic → Exalted)
3. **Feeds player classification** by mapping challenge progress to player archetypes
4. **Detects extractors vs builders** through behavioral challenges
5. **Creates engagement loops** with streaks, milestones, and prestige achievements

### Connection to Player Classification
```
┌─────────────────────────────────────────────────────────────┐
│                    PLAYER CLASSIFICATION                     │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  Archetypes: Builder | Extractor | Casual | Whale   │    │
│  └─────────────────────────────────────────────────────┘    │
│                          ▲                                   │
│                          │ Classification Engine            │
│                          │                                   │
│  ┌─────────────────────────────────────────────────────┐    │
│  │           CHALLENGE PROGRESS SIGNALS                 │    │
│  │  • non_extractor tier → Extractor Score              │    │
│  │  • reinvestment_sage tier → Reinvestment Ratio       │    │
│  │  • house_of_heroes tier → Portfolio Size             │    │
│  │  • behavior_engagement challenges → Commitment       │    │
│  └─────────────────────────────────────────────────────┘    │
│                          ▲                                   │
│                          │                                   │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              ETL EXTRACTS & TRANSFORMS               │    │
│  │  onchain_heroes | onchain_quests | behavior_model    │    │
│  │  onchain_summons | onchain_gardens | discord_events  │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

---

## Architecture Overview

### File Locations
| File | Purpose |
|------|---------|
| `src/data/challengeConfig.ts` | **Canonical challenge definitions** - all categories, challenges, tiers |
| `src/etl/loaders/challengeProgressLoader.ts` | Writes computed metrics to `player_challenge_progress` |
| `src/etl/types.ts` | METRIC_REGISTRY mapping challenge keys to extractors |
| `shared/schema.ts` | Database table definitions |
| `docs/BACKEND_OVERVIEW_ETL.md` | ETL architecture documentation |

### Data Flow
```
Blockchain Data (heroes, quests, summons, gardens)
              │
              ▼
┌──────────────────────────────────┐
│         ETL EXTRACTORS           │
│  heroExtractor, questExtractor,  │
│  summonExtractor, etc.           │
└──────────────────────────────────┘
              │
              ▼
┌──────────────────────────────────┐
│      ETL TRANSFORMERS            │
│  behaviorTransformer computes    │
│  derived metrics (streaks, %)    │
└──────────────────────────────────┘
              │
              ▼
┌──────────────────────────────────┐
│  challengeProgressLoader.ts      │
│  - Reads HEDGE_CHALLENGE_CONFIG  │
│  - Computes values from registry │
│  - Upserts player_challenge_     │
│    progress table                │
└──────────────────────────────────┘
              │
              ▼
┌──────────────────────────────────┐
│  player_challenge_progress       │
│  (userId, challengeKey,          │
│   currentValue, highestTier)     │
└──────────────────────────────────┘
```

---

## Tier Systems

The system uses **dual tier taxonomies** to match DFK's rarity and gene systems:

### RARITY Tier System (5 tiers)
For quantity-based achievements that parallel hero rarity.

| Tier | Display | Typical Use |
|------|---------|-------------|
| COMMON | Common | Entry-level milestones |
| UNCOMMON | Uncommon | Intermediate progress |
| RARE | Rare | Significant achievement |
| LEGENDARY | Legendary | Expert-level |
| MYTHIC | Mythic | Top 1% / Prestige |

### GENE Tier System (4 tiers)
For efficiency/optimization metrics that parallel hero gene tiers.

| Tier | Display | Typical Use |
|------|---------|-------------|
| BASIC | Basic | Baseline competence |
| ADVANCED | Advanced | Good optimization |
| ELITE | Elite | Excellent execution |
| EXALTED | Exalted | Perfect mastery |

### MIXED Tier System
Categories that use both systems depending on challenge type.

### PRESTIGE Tier System
Ultra-rare achievements with only EXALTED and MYTHIC tiers.

---

## Category Breakdown

### 8 Challenge Categories

| # | Key | Name | Tier System | Focus Area |
|---|-----|------|-------------|------------|
| 1 | `hero_progression` | Hero Progression | RARITY | Levels, quests, training, meditation |
| 2 | `economy_strategy` | Economy & Strategy | GENE | Yields, reinvestment, optimization |
| 3 | `profession_specialization` | Profession Specialization | MIXED | Mining, gardening, fishing, foraging |
| 4 | `ownership_collection` | Ownership & Collection | RARITY | Heroes, pets, Gen0s |
| 5 | `behavior_engagement` | Behavior & Engagement | GENE | Discord interaction, loyalty, anti-extractor |
| 6 | `seasonal_events` | Seasonal Events | MIXED | Time-limited challenges |
| 7 | `prestige_overall` | Prestige | PRESTIGE | Account-wide ultra-rare achievements |
| 8 | `summoning_prestige` | Summoning Prestige | PRESTIGE | Ultra-rare hero summons |

---

## Complete Challenge Catalog

### Category 1: Hero Progression (14 challenges)

| Key | Name | Metric Type | Source | Metric Key | Thresholds |
|-----|------|-------------|--------|------------|------------|
| `hero_riser` | Hero Riser | COUNT | onchain_heroes | total_levels | 100/300/600/1000/2000 |
| `master_of_professions` | Master of Professions | COUNT | onchain_quests | profession_quests_total | 100/500/2000/5000/10000 |
| `eternal_summoner` | The Eternal Summoner | COUNT | onchain_summons | total_summons | 5/15/30/60/120 |
| `class_mastery_trial` | Class Mastery Trial | COUNT | onchain_heroes | classes_level10_plus | 3/5/7/10/14 |
| `great_questor_streak` | The Great Questor | STREAK | behavior_model | quest_day_streak | 3/7/14/30/60 |
| `trainers_path` | Trainer's Path | COUNT | onchain_quests | training_quests_total | 50/200/500/1500/3000 |
| `stat_specialist` | Stat Specialist | SCORE | behavior_model | training_stat_match_pct | 40/60/80/95 (GENE) |
| `crystal_seeker` | Crystal Seeker | COUNT | onchain_quests | training_crystals_obtained | 5/15/40/100/250 |
| `dedicated_trainer` | The Dedicated Trainer | STREAK | behavior_model | training_day_streak | 3/7/14/30/60 |
| `crystal_consumer` | Crystal Consumer | COUNT | onchain_meditation | crystals_used_total | 5/20/50/150/300 |
| `focused_meditation` | Focused Meditation | SCORE | behavior_model | correct_crystal_usage_pct | 40/60/80/95 (GENE) |
| `enlightened_one` | The Enlightened One | COUNT | onchain_meditation | total_meditations | 10/30/75/200/400 |
| `stat_mastery` | Stat Mastery | COUNT | onchain_meditation | total_stat_gain | 20/60/150/400/800 |
| `genetic_enlightenment` | Genetic Enlightenment | COUNT | onchain_meditation | perfect_meditations | 1/5 (PRESTIGE) |

**Data Capture Plan:**
- `onchain_heroes`: GraphQL query for hero list, compute total_levels, count unique classes at L10+
- `onchain_quests`: GraphQL query hero quest history, count by quest type
- `onchain_summons`: GraphQL query summon events, count totals
- `onchain_meditation`: Query MeditationCircle contract events for crystal usage and stat gains
- `behavior_model`: Compute streaks from daily activity timestamps, efficiency % from training stat matching

---

### Category 2: Economy & Strategy (5 challenges)

| Key | Name | Metric Type | Source | Metric Key | Thresholds |
|-----|------|-------------|--------|------------|------------|
| `yield_strategist` | Yield Strategist | SCORE | behavior_model | quest_efficiency_pct | 50/70/85/95 |
| `garden_architect` | Garden Architect | COUNT | onchain_gardens | lp_yield_token_equivalent | 500/2500/10000/25000 |
| `token_steward` | Token Steward | SCORE | onchain_portfolio | jewel_equivalent_balance | 100/300/1000/5000 |
| `reinvestment_sage` | Reinvestment Sage | SCORE | behavior_model | reinvest_ratio_pct | 30/50/70/85 |
| `optimization_follower` | Optimization Follower | COUNT | behavior_model | optimizations_completed | 1/5/15/40 |

**Data Capture Plan:**
- `onchain_gardens`: LP position detection via MasterGardener contract, yield calculations
- `onchain_portfolio`: Balance fetcher for JEWEL/CRYSTAL/cJEWEL
- `behavior_model`: 
  - quest_efficiency_pct: Compare actual quest completions vs theoretical max
  - reinvest_ratio_pct: (tokens reinvested / tokens earned) * 100
  - optimizations_completed: Count of garden optimization suggestions followed

**Player Classification Signal:**
- `reinvestment_sage` tier directly feeds extractor detection (low reinvestment = extractor signal)
- `yield_strategist` + `garden_architect` tiers indicate "optimizer" archetype

---

### Category 3: Profession Specialization (6 challenges)

| Key | Name | Metric Type | Source | Metric Key | Thresholds |
|-----|------|-------------|--------|------------|------------|
| `great_miner` | The Great Miner | COUNT | onchain_quests | mining_quests | 50/250/1000/3000/6000 |
| `herbalist` | The Herbalist | COUNT | onchain_quests | gardening_quests | 50/250/1000/3000/6000 |
| `fisher_king` | The Fisher King | COUNT | onchain_quests | fishing_quests | 50/250/1000/3000/6000 |
| `ranger_of_the_wilds` | Ranger of the Wilds | COUNT | onchain_quests | foraging_quests | 50/250/1000/3000/6000 |
| `profession_purist` | Profession Purist | SCORE | behavior_model | profession_match_pct | 60/75/85/95 (GENE) |
| `bonus_trigger_master` | Bonus Trigger Master | SCORE | behavior_model | profession_bonus_trigger_pct | 20/35/50/65 (GENE) |

**Data Capture Plan:**
- `onchain_quests`: Filter quest completions by quest contract address (mining/gardening/fishing/foraging)
- `behavior_model`:
  - profession_match_pct: (heroes with matching profession / total questing heroes) * 100
  - profession_bonus_trigger_pct: (bonus triggers / total quest attempts) * 100

---

### Category 4: Ownership & Collection (3 challenges)

| Key | Name | Metric Type | Source | Metric Key | Thresholds |
|-----|------|-------------|--------|------------|------------|
| `house_of_heroes` | House of Heroes | COUNT | onchain_heroes | hero_count | 5/15/30/60/120 |
| `pet_sanctuary` | Pet Sanctuary | COUNT | onchain_pets | pet_count | 2/5/10/20/40 |
| `gen0_monarch` | Gen0 Monarch | COUNT | onchain_heroes | gen0_count | 1/3/5/10/20 |

**Data Capture Plan:**
- `onchain_heroes`: Simple count from hero list, filter for generation=0
- `onchain_pets`: Query Pet contract for owned pets

**Player Classification Signal:**
- `house_of_heroes` tier indicates portfolio size (whale detection)
- `gen0_monarch` indicates long-term investment commitment

---

### Category 5: Behavior & Engagement (4 challenges)

| Key | Name | Metric Type | Source | Metric Key | Thresholds |
|-----|------|-------------|--------|------------|------------|
| `kingdom_calls` | The Kingdom Calls | COUNT | discord_interactions | messages_to_hedge | 10/50/200/1000 |
| `loyal_follower` | Loyal Follower | STREAK | discord_interactions | hedge_day_streak | 3/7/14/30 |
| `non_extractor` | The Non-Extractor | SCORE | behavior_model | extractor_score_inverted | 30/50/70/85 |
| `hedges_chosen` | Hedge's Chosen | COUNT | payment_events | jewel_sent_to_hedge | 1/5/20/50 |

**Data Capture Plan:**
- `discord_interactions`: Query bot interaction logs for message counts per user
- `behavior_model`:
  - extractor_score_inverted: 100 - extractorScore (from bridge tracker)
- `payment_events`: Query payment monitor for JEWEL transfers to Hedge wallet

**Player Classification Signal:**
- `non_extractor` is the **primary extractor detection signal**
  - BASIC (30+) = extractor_score < 70%
  - EXALTED (85+) = extractor_score < 15% (verified builder)
- `hedges_chosen` indicates premium subscriber loyalty

---

### Category 6: Seasonal Events (1 challenge - inactive)

| Key | Name | Metric Type | Source | Metric Key | Thresholds |
|-----|------|-------------|--------|------------|------------|
| `winters_solstice` | Winter's Solstice | COUNT | event_progress | winter_level_ups | 3/5/8/12/20 |

**Status:** `isActive: false` - Activate during winter event windows.

**Data Capture Plan:**
- `event_progress`: Track level-ups during defined event date ranges

---

### Category 7: Prestige (4 challenges)

| Key | Name | Metric Type | Source | Metric Key | Thresholds |
|-----|------|-------------|--------|------------|------------|
| `true_exalted_bloodline` | True Exalted Bloodline | COUNT | onchain_heroes | exalted_gene_hero_count | 10 (EXALTED) |
| `mythic_hoarder` | Mythic Hoarder | COUNT | onchain_heroes | mythic_hero_count | 3 (MYTHIC) |
| `eternal_activity` | Eternal Activity | STREAK | behavior_model | long_term_active_days | 120 (MYTHIC) |
| `master_of_all_trades` | Master of All Trades | BOOLEAN | behavior_model | all_categories_rare_plus | 1 (EXALTED) |

**Data Capture Plan:**
- `onchain_heroes`: Filter for rarity=mythic, decode genes for exalted tier
- `behavior_model`:
  - long_term_active_days: Estimated from first tx date + activity frequency
  - all_categories_rare_plus: Check if player has RARE+ in all main categories

---

### Category 8: Summoning Prestige (8 challenges)

| Key | Name | Metric Type | Source | Metric Key | Thresholds |
|-----|------|-------------|--------|------------|------------|
| `summon_dragoon` | The Dragonborn | COUNT | onchain_summons | summons_dragoon | 1(E)/3(X)/5(M) |
| `summon_dreadknight` | The Dread Summoner | COUNT | onchain_summons | summons_dreadknight | 1(X)/2(M) |
| `summon_sage` | The Ascended Sages | COUNT | onchain_summons | summons_sage | 1(E)/3(X)/5(M) |
| `summon_paladin` | Blade of Light | COUNT | onchain_summons | summons_paladin | 1(A)/3(E)/5(X)/10(M) |
| `summon_dark_knight` | Shadowmaker | COUNT | onchain_summons | summons_dark_knight | 1(A)/3(E)/5(X)/10(M) |
| `summon_high_tier_genes` | Gene Alchemist | COUNT | onchain_summons | summons_high_tier_genes | 1(B)/3(A)/5(E)/10(X) |
| `summon_mythic_heroes` | Mythmaker | COUNT | onchain_summons | summons_mythic_rarity | 1(E)/2(X)/3(M) |
| `summon_trifecta` | Royal Lineage | BOOLEAN | onchain_summons | has_trifecta_ultra_rare | 1(X)/2(M) |

**Data Capture Plan:**
- `onchain_summons`: Query HeroSummoningUpgradeable contract events
  - Filter by summoned hero class for Dragoon/Dreadknight/Sage/Paladin/DarkKnight
  - Decode genes for high-tier gene detection
  - Check rarity for mythic summons
  - Boolean for trifecta (has summoned at least 1 of each ultra-rare)

---

## Data Capture Strategy

### Metric Sources Summary

| metricSource | Description | Data Capture Method |
|--------------|-------------|---------------------|
| `onchain_heroes` | Hero inventory data | GraphQL: getAllHeroesByOwner() |
| `onchain_quests` | Quest completion history | GraphQL: hero quest history + RPC events |
| `onchain_summons` | Summon events | RPC: HeroSummoningUpgradeable events |
| `onchain_pets` | Pet ownership | RPC: Pet contract ownership query |
| `onchain_meditation` | Meditation/crystal usage | RPC: MeditationCircle events |
| `onchain_gardens` | LP positions/yields | RPC: MasterGardener userInfo + balanceOf |
| `onchain_portfolio` | Token balances | RPC: ERC20 balanceOf calls |
| `behavior_model` | Computed behavior metrics | Transform phase calculations |
| `discord_interactions` | Discord bot usage | Database: interaction logs |
| `payment_events` | JEWEL payments to Hedge | Database: payment monitor logs |
| `event_progress` | Seasonal event tracking | Special event-scoped tracking |

### METRIC_REGISTRY Pattern

In `src/etl/types.ts`, register extractors:

```typescript
export const METRIC_REGISTRY: Record<string, MetricExtractor> = {
  // Hero metrics
  'onchain_heroes:total_levels': {
    extractor: (data) => data.heroes.totalLevels,
  },
  'onchain_heroes:hero_count': {
    extractor: (data) => data.heroes.heroCount,
  },
  'onchain_heroes:gen0_count': {
    extractor: (data) => data.heroes.heroes.filter(h => h.generation === 0).length,
  },
  // Quest metrics
  'onchain_quests:profession_quests_total': {
    extractor: (data) => data.quests.professionQuestsTotal,
  },
  // ... more extractors
};
```

---

## Database Schema

### player_challenge_progress Table

```sql
CREATE TABLE player_challenge_progress (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(128) NOT NULL,           -- Discord user ID
  wallet_address VARCHAR(64),               -- Primary wallet (optional)
  challenge_key VARCHAR(64) NOT NULL,       -- Challenge identifier
  current_value INTEGER NOT NULL DEFAULT 0, -- Current metric value
  highest_tier_achieved VARCHAR(32),        -- COMMON/RARE/MYTHIC/etc.
  achieved_at TIMESTAMPTZ,                  -- When highest tier was reached
  last_updated TIMESTAMPTZ DEFAULT NOW(),
  meta JSONB,                               -- Streak tracking, history
  
  UNIQUE(user_id, challenge_key)
);

-- Indexes
CREATE INDEX idx_pcp_user_id ON player_challenge_progress(user_id);
CREATE INDEX idx_pcp_challenge_key ON player_challenge_progress(challenge_key);
CREATE INDEX idx_pcp_wallet ON player_challenge_progress(wallet_address);
```

### Meta Field Structure

For STREAK challenges:
```json
{
  "streakStart": "2024-12-01T00:00:00Z",
  "streakEnd": "2024-12-09T00:00:00Z",
  "history": [
    { "value": 3, "date": "2024-12-01" },
    { "value": 5, "date": "2024-12-05" }
  ]
}
```

---

## ETL Pipeline

### Trigger Points

1. **First wallet link** → Auto-trigger ETL for cluster
2. **Incremental (10 min)** → Active wallets only
3. **Daily snapshot (03:00 UTC)** → All wallets
4. **Manual trigger** → `/api/debug/trigger-etl`

### challengeProgressLoader Flow

```typescript
async function loadChallengeProgress(ctx, data, transform) {
  for (const challenge of HEDGE_CHALLENGE_CONFIG.challenges) {
    if (!challenge.isActive) continue;
    
    // 1. Compute value from METRIC_REGISTRY or behavior_model
    const value = computeChallengeValue(challenge, data, transform);
    
    // 2. Determine highest tier achieved
    const highestTier = computeHighestTier(challenge, value);
    
    // 3. Upsert player_challenge_progress
    await upsertProgress(ctx.userId, challenge.key, value, highestTier);
  }
}
```

---

## Player Classification Integration

### Challenge → Classification Mapping

| Challenge | Classification Signal |
|-----------|----------------------|
| `non_extractor` tier | Direct extractor score input |
| `reinvestment_sage` tier | Reinvestment ratio for builder vs extractor |
| `house_of_heroes` tier | Portfolio size (whale indicator) |
| `hedges_chosen` tier | Premium subscriber loyalty |
| `eternal_activity` tier | Long-term commitment |
| Multiple prestige tiers | "Power player" archetype |

### Example Classification Logic

```typescript
function classifyPlayer(challengeProgress) {
  const nonExtractor = getProgress('non_extractor');
  const reinvestment = getProgress('reinvestment_sage');
  const heroes = getProgress('house_of_heroes');
  
  if (nonExtractor.highestTier < 'BASIC') {
    return 'EXTRACTOR'; // extractor_score > 70%
  }
  
  if (heroes.highestTier >= 'LEGENDARY' && reinvestment.highestTier >= 'ELITE') {
    return 'WHALE_BUILDER';
  }
  
  if (reinvestment.highestTier >= 'ADVANCED') {
    return 'BUILDER';
  }
  
  return 'CASUAL';
}
```

---

## Expansion Guide

### Adding a New Challenge

1. **Add to challengeConfig.ts:**
```typescript
{
  key: "new_challenge_key",
  categoryKey: "hero_progression", // existing category
  name: "New Challenge Name",
  description: "What the player must do.",
  metricType: "COUNT", // COUNT | STREAK | SCORE | BOOLEAN | COMPOSITE
  metricSource: "onchain_heroes", // or behavior_model, etc.
  metricKey: "new_metric_key",
  isActive: true,
  sortOrder: 15,
  meta: { icon: "star", tags: ["tag1", "tag2"] },
  tiers: [
    { tierCode: "COMMON", displayName: "Common", thresholdValue: 10, sortOrder: 1 },
    { tierCode: "RARE", displayName: "Rare", thresholdValue: 50, sortOrder: 2 },
    { tierCode: "MYTHIC", displayName: "Mythic", thresholdValue: 100, sortOrder: 3, isPrestige: true },
  ],
},
```

2. **Add extractor to METRIC_REGISTRY (src/etl/types.ts):**
```typescript
'onchain_heroes:new_metric_key': {
  extractor: (data) => data.heroes.someNewMetric,
},
```

3. **If behavior_model source, add transformer logic:**
```typescript
// In behaviorTransformer.ts
newMetricKey: computeNewMetric(data),
```

4. **Run ETL to populate data:**
```bash
POST /api/debug/trigger-etl
```

### Adding a New Category

1. **Add category definition:**
```typescript
{
  key: "new_category",
  name: "New Category Name",
  description: "What this category represents.",
  tierSystem: "GENE", // RARITY | GENE | MIXED | PRESTIGE
  sortOrder: 9,
},
```

2. **Add challenges with `categoryKey: "new_category"`**

### Deactivating a Challenge

Simply set `isActive: false` in the challenge definition. The ETL will skip it but existing progress is preserved.

---

## Appendix A: Complete Challenge Reference

### Category 1: Hero Progression

#### 1.1 Hero Riser
- **Key:** `hero_riser`
- **Description:** Accumulate total hero levels across your roster.
- **Metric Type:** COUNT
- **Thresholds:**
  - Common: 100 total levels
  - Uncommon: 300 total levels
  - Rare: 600 total levels
  - Legendary: 1,000 total levels
  - Mythic: 2,000 total levels (Prestige)
- **Data Capture Plan:** GraphQL query `getAllHeroesByOwner()`, sum all hero levels from the returned hero array.
- **Player Classification Signal:** None directly; supports overall portfolio assessment.

#### 1.2 Master of Professions
- **Key:** `master_of_professions`
- **Description:** Complete profession quests with any heroes.
- **Metric Type:** COUNT
- **Thresholds:**
  - Common: 100 profession quests
  - Uncommon: 500 profession quests
  - Rare: 2,000 profession quests
  - Legendary: 5,000 profession quests
  - Mythic: 10,000 profession quests (Prestige)
- **Data Capture Plan:** Query hero quest history via GraphQL, filter by profession quest contract addresses (mining, gardening, fishing, foraging), count completions.
- **Player Classification Signal:** High activity indicates active player; supports Builder archetype detection.

#### 1.3 The Eternal Summoner
- **Key:** `eternal_summoner`
- **Description:** Perform hero summons.
- **Metric Type:** COUNT
- **Thresholds:**
  - Common: 5 summons
  - Uncommon: 15 summons
  - Rare: 30 summons
  - Legendary: 60 summons
  - Mythic: 120 summons (Prestige)
- **Data Capture Plan:** Query HeroSummoningUpgradeable contract events for `HeroSummoned` events where the summoner matches the wallet.
- **Player Classification Signal:** High summon count indicates reinvestment behavior; supports Builder detection.

#### 1.4 Class Mastery Trial
- **Key:** `class_mastery_trial`
- **Description:** Level different hero classes to 10+.
- **Metric Type:** COUNT
- **Thresholds:**
  - Common: 3 unique classes at L10+
  - Uncommon: 5 unique classes at L10+
  - Rare: 7 unique classes at L10+
  - Legendary: 10 unique classes at L10+
  - Mythic: 14 unique classes at L10+ (all basic + advanced classes) (Prestige)
- **Data Capture Plan:** From hero list, group by `mainClassStr`, filter for level >= 10, count unique classes.
- **Player Classification Signal:** Diversity indicates strategic player; supports Optimizer archetype.

#### 1.5 The Great Questor
- **Key:** `great_questor_streak`
- **Description:** Maintain a streak of days with at least one quest.
- **Metric Type:** STREAK
- **Thresholds:**
  - Common: 3-day streak
  - Uncommon: 7-day streak
  - Rare: 14-day streak
  - Legendary: 30-day streak
  - Mythic: 60-day streak (Prestige)
- **Data Capture Plan:** Analyze quest completion timestamps, compute consecutive days with activity. Store streak start/end in meta field.
- **Player Classification Signal:** Long streaks indicate committed player; supports Builder and anti-Extractor detection.

#### 1.6 Trainer's Path
- **Key:** `trainers_path`
- **Description:** Complete training quests.
- **Metric Type:** COUNT
- **Thresholds:**
  - Common: 50 training quests
  - Uncommon: 200 training quests
  - Rare: 500 training quests
  - Legendary: 1,500 training quests
  - Mythic: 3,000 training quests (Prestige)
- **Data Capture Plan:** Query quest history, filter by training quest contract addresses, count completions.
- **Player Classification Signal:** Training focus indicates long-term investment mindset.

#### 1.7 Stat Specialist
- **Key:** `stat_specialist`
- **Description:** Complete training quests using the optimal training stat for your heroes.
- **Metric Type:** SCORE (percentage)
- **Tier System:** GENE
- **Thresholds:**
  - Basic: 40% optimal stat match
  - Advanced: 60% optimal stat match
  - Elite: 80% optimal stat match
  - Exalted: 95% optimal stat match (Prestige)
- **Data Capture Plan:** Compare training quest stat selection vs hero's primary growth stat. Calculate (matching quests / total training quests) * 100.
- **Player Classification Signal:** High efficiency indicates Optimizer archetype.

#### 1.8 Crystal Seeker
- **Key:** `crystal_seeker`
- **Description:** Obtain lesser training crystals from training quests.
- **Metric Type:** COUNT
- **Thresholds:**
  - Common: 5 crystals obtained
  - Uncommon: 15 crystals obtained
  - Rare: 40 crystals obtained
  - Legendary: 100 crystals obtained
  - Mythic: 250 crystals obtained (Prestige)
- **Data Capture Plan:** Parse training quest reward events for crystal drops, count by wallet.
- **Player Classification Signal:** None directly; supports training engagement metrics.

#### 1.9 The Dedicated Trainer
- **Key:** `dedicated_trainer`
- **Description:** Maintain a daily streak of training quests.
- **Metric Type:** STREAK
- **Thresholds:**
  - Common: 3-day streak
  - Uncommon: 7-day streak
  - Rare: 14-day streak
  - Legendary: 30-day streak
  - Mythic: 60-day streak (Prestige)
- **Data Capture Plan:** Analyze training quest timestamps for consecutive days. Store streak metadata.
- **Player Classification Signal:** Consistency indicates Builder behavior.

#### 1.10 Crystal Consumer
- **Key:** `crystal_consumer`
- **Description:** Use lesser training crystals during meditation.
- **Metric Type:** COUNT
- **Thresholds:**
  - Common: 5 crystals used
  - Uncommon: 20 crystals used
  - Rare: 50 crystals used
  - Legendary: 150 crystals used
  - Mythic: 300 crystals used (Prestige)
- **Data Capture Plan:** Query MeditationCircle contract for `MeditationCompleted` events, parse crystal parameters.
- **Player Classification Signal:** Crystal usage indicates reinvestment; supports Builder detection.

#### 1.11 Focused Meditation
- **Key:** `focused_meditation`
- **Description:** Use the correct type of crystal for the stats you are targeting.
- **Metric Type:** SCORE (percentage)
- **Tier System:** GENE
- **Thresholds:**
  - Basic: 40% correct crystal usage
  - Advanced: 60% correct crystal usage
  - Elite: 80% correct crystal usage
  - Exalted: 95% correct crystal usage (Prestige)
- **Data Capture Plan:** Compare crystal type used vs stat targeted in meditation. Calculate (correct usage / total meditations) * 100.
- **Player Classification Signal:** Efficiency indicates Optimizer archetype.

#### 1.12 The Enlightened One
- **Key:** `enlightened_one`
- **Description:** Perform meditations to advance your heroes using crystals and runes.
- **Metric Type:** COUNT
- **Thresholds:**
  - Common: 10 meditations
  - Uncommon: 30 meditations
  - Rare: 75 meditations
  - Legendary: 200 meditations
  - Mythic: 400 meditations (Prestige)
- **Data Capture Plan:** Count `MeditationCompleted` events from MeditationCircle contract.
- **Player Classification Signal:** Meditation count indicates hero development investment.

#### 1.13 Stat Mastery
- **Key:** `stat_mastery`
- **Description:** Achieve total stat increases across all meditations.
- **Metric Type:** COUNT
- **Thresholds:**
  - Common: 20 total stat points gained
  - Uncommon: 60 total stat points gained
  - Rare: 150 total stat points gained
  - Legendary: 400 total stat points gained
  - Mythic: 800 total stat points gained (Prestige)
- **Data Capture Plan:** Sum stat gain values from meditation events.
- **Player Classification Signal:** High stat gains indicate long-term hero investment.

#### 1.14 Genetic Enlightenment
- **Key:** `genetic_enlightenment`
- **Description:** Achieve perfect meditations where all selected stats succeed.
- **Metric Type:** COUNT
- **Tier System:** PRESTIGE
- **Thresholds:**
  - Exalted: 1 perfect meditation (Prestige)
  - Mythic: 5 perfect meditations (Prestige)
- **Data Capture Plan:** Parse meditation events for success flags on all attempted stats.
- **Player Classification Signal:** Ultra-rare achievement; indicates Power Player archetype.

---

### Category 2: Economy & Strategy

#### 2.1 Yield Strategist
- **Key:** `yield_strategist`
- **Description:** Optimize questing APR compared to your heroes' theoretical max potential.
- **Metric Type:** SCORE (percentage)
- **Tier System:** GENE
- **Thresholds:**
  - Basic: 50% efficiency
  - Advanced: 70% efficiency
  - Elite: 85% efficiency
  - Exalted: 95% efficiency for 30+ days (Prestige)
- **Data Capture Plan:** Calculate actual quest yields vs theoretical maximum based on hero stats/professions. Compute efficiency ratio.
- **Player Classification Signal:** High efficiency strongly indicates Optimizer archetype.

#### 2.2 Garden Architect
- **Key:** `garden_architect`
- **Description:** Accumulate yield from Gardens and LP positions.
- **Metric Type:** COUNT (token equivalent)
- **Tier System:** GENE
- **Thresholds:**
  - Basic: 500 JEWEL equivalent yield
  - Advanced: 2,500 JEWEL equivalent yield
  - Elite: 10,000 JEWEL equivalent yield
  - Exalted: 25,000 JEWEL equivalent yield (Prestige)
- **Data Capture Plan:** Query MasterGardener for LP positions, calculate yields using garden analytics engine.
- **Player Classification Signal:** LP engagement indicates long-term DeFi commitment; supports Builder detection.

#### 2.3 Token Steward
- **Key:** `token_steward`
- **Description:** Maintain a healthy JEWEL/CRYSTAL/METIS portfolio.
- **Metric Type:** SCORE (token count)
- **Tier System:** GENE
- **Thresholds:**
  - Basic: 100 JEWEL equivalent
  - Advanced: 300 JEWEL equivalent
  - Elite: 1,000 JEWEL equivalent
  - Exalted: 5,000 JEWEL equivalent (Prestige)
- **Data Capture Plan:** Query ERC20 balanceOf for JEWEL, CRYSTAL, cJEWEL. Convert to JEWEL equivalent using price oracle.
- **Player Classification Signal:** Large portfolio indicates Whale archetype.

#### 2.4 Reinvestment Sage
- **Key:** `reinvestment_sage`
- **Description:** Reinvest a healthy percentage of your profits back into the Kingdom.
- **Metric Type:** SCORE (percentage)
- **Tier System:** GENE
- **Thresholds:**
  - Basic: 30% reinvestment ratio
  - Advanced: 50% reinvestment ratio
  - Elite: 70% reinvestment ratio
  - Exalted: 85% reinvestment ratio (Prestige)
- **Data Capture Plan:** Calculate (tokens spent on summons/heroes/LP / tokens earned from quests/sales) * 100.
- **Player Classification Signal:** **PRIMARY BUILDER VS EXTRACTOR SIGNAL.** Low reinvestment = Extractor. High reinvestment = Builder.

#### 2.5 Optimization Follower
- **Key:** `optimization_follower`
- **Description:** Complete optimizations suggested by Hedge.
- **Metric Type:** COUNT
- **Tier System:** GENE
- **Thresholds:**
  - Basic: 1 optimization completed
  - Advanced: 5 optimizations completed
  - Elite: 15 optimizations completed
  - Exalted: 40 optimizations completed (Prestige)
- **Data Capture Plan:** Track user actions following Hedge recommendations (garden rebalances, quest assignments).
- **Player Classification Signal:** Engagement with Hedge indicates premium user; supports Hedge Loyalist archetype.

---

### Category 3: Profession Specialization

#### 3.1 The Great Miner
- **Key:** `great_miner`
- **Description:** Complete mining quests.
- **Metric Type:** COUNT
- **Thresholds:**
  - Common: 50 mining quests
  - Uncommon: 250 mining quests
  - Rare: 1,000 mining quests
  - Legendary: 3,000 mining quests
  - Mythic: 6,000 mining quests (Prestige)
- **Data Capture Plan:** Filter quest completions by mining quest contract address.
- **Player Classification Signal:** Profession focus indicates specialization; supports strategic player detection.

#### 3.2 The Herbalist
- **Key:** `herbalist`
- **Description:** Complete gardening quests.
- **Metric Type:** COUNT
- **Thresholds:**
  - Common: 50 gardening quests
  - Uncommon: 250 gardening quests
  - Rare: 1,000 gardening quests
  - Legendary: 3,000 gardening quests
  - Mythic: 6,000 gardening quests (Prestige)
- **Data Capture Plan:** Filter quest completions by gardening quest contract address.
- **Player Classification Signal:** Gardening focus often correlates with LP engagement.

#### 3.3 The Fisher King
- **Key:** `fisher_king`
- **Description:** Complete fishing quests.
- **Metric Type:** COUNT
- **Thresholds:**
  - Common: 50 fishing quests
  - Uncommon: 250 fishing quests
  - Rare: 1,000 fishing quests
  - Legendary: 3,000 fishing quests
  - Mythic: 6,000 fishing quests (Prestige)
- **Data Capture Plan:** Filter quest completions by fishing quest contract address.
- **Player Classification Signal:** Profession specialization metric.

#### 3.4 Ranger of the Wilds
- **Key:** `ranger_of_the_wilds`
- **Description:** Complete foraging quests.
- **Metric Type:** COUNT
- **Thresholds:**
  - Common: 50 foraging quests
  - Uncommon: 250 foraging quests
  - Rare: 1,000 foraging quests
  - Legendary: 3,000 foraging quests
  - Mythic: 6,000 foraging quests (Prestige)
- **Data Capture Plan:** Filter quest completions by foraging quest contract address.
- **Player Classification Signal:** Profession specialization metric.

#### 3.5 Profession Purist
- **Key:** `profession_purist`
- **Description:** Run profession quests with heroes that match the quest profession.
- **Metric Type:** SCORE (percentage)
- **Tier System:** GENE
- **Thresholds:**
  - Basic: 60% hero-profession match
  - Advanced: 75% hero-profession match
  - Elite: 85% hero-profession match
  - Exalted: 95% hero-profession match (Prestige)
- **Data Capture Plan:** Compare hero's professionStr vs quest type. Calculate (matching / total) * 100.
- **Player Classification Signal:** Efficiency indicates Optimizer archetype.

#### 3.6 Bonus Trigger Master
- **Key:** `bonus_trigger_master`
- **Description:** Trigger profession quest bonuses with high consistency.
- **Metric Type:** SCORE (percentage)
- **Tier System:** GENE
- **Thresholds:**
  - Basic: 20% bonus trigger rate
  - Advanced: 35% bonus trigger rate
  - Elite: 50% bonus trigger rate
  - Exalted: 65% bonus trigger rate (Prestige)
- **Data Capture Plan:** Parse quest reward events for bonus flags. Calculate (bonus triggers / total quests) * 100.
- **Player Classification Signal:** High bonus rate indicates optimized hero selection.

---

### Category 4: Ownership & Collection

#### 4.1 House of Heroes
- **Key:** `house_of_heroes`
- **Description:** Own multiple heroes.
- **Metric Type:** COUNT
- **Thresholds:**
  - Common: 5 heroes
  - Uncommon: 15 heroes
  - Rare: 30 heroes
  - Legendary: 60 heroes
  - Mythic: 120 heroes (Prestige)
- **Data Capture Plan:** Count heroes from `getAllHeroesByOwner()` response.
- **Player Classification Signal:** **PRIMARY PORTFOLIO SIZE INDICATOR.** High count indicates Whale archetype.

#### 4.2 Pet Sanctuary
- **Key:** `pet_sanctuary`
- **Description:** Bond and own pets.
- **Metric Type:** COUNT
- **Thresholds:**
  - Common: 2 pets
  - Uncommon: 5 pets
  - Rare: 10 pets
  - Legendary: 20 pets
  - Mythic: 40 pets (Prestige)
- **Data Capture Plan:** Query Pet contract for owned pets by wallet.
- **Player Classification Signal:** Pet ownership indicates ecosystem engagement.

#### 4.3 Gen0 Monarch
- **Key:** `gen0_monarch`
- **Description:** Own Gen0 heroes.
- **Metric Type:** COUNT
- **Thresholds:**
  - Common: 1 Gen0 hero
  - Uncommon: 3 Gen0 heroes
  - Rare: 5 Gen0 heroes
  - Legendary: 10 Gen0 heroes
  - Mythic: 20 Gen0 heroes (Prestige)
- **Data Capture Plan:** Filter hero list for generation === 0.
- **Player Classification Signal:** Gen0 ownership indicates early adopter / long-term commitment.

---

### Category 5: Behavior & Engagement

#### 5.1 The Kingdom Calls
- **Key:** `kingdom_calls`
- **Description:** Interact with Hedge Ledger.
- **Metric Type:** COUNT
- **Tier System:** GENE
- **Thresholds:**
  - Basic: 10 messages to Hedge
  - Advanced: 50 messages to Hedge
  - Elite: 200 messages to Hedge
  - Exalted: 1,000 messages to Hedge (Prestige)
- **Data Capture Plan:** Query Discord bot interaction logs, count messages per user.
- **Player Classification Signal:** Hedge engagement indicates premium user interest.

#### 5.2 Loyal Follower
- **Key:** `loyal_follower`
- **Description:** Maintain a daily interaction streak with Hedge.
- **Metric Type:** STREAK
- **Tier System:** GENE
- **Thresholds:**
  - Basic: 3-day streak
  - Advanced: 7-day streak
  - Elite: 14-day streak
  - Exalted: 30-day streak (Prestige)
- **Data Capture Plan:** Analyze interaction timestamps for consecutive days.
- **Player Classification Signal:** Consistency indicates committed user.

#### 5.3 The Non-Extractor
- **Key:** `non_extractor`
- **Description:** Maintain a healthy behavioral profile with low extractor score.
- **Metric Type:** SCORE (inverted percentage)
- **Tier System:** GENE
- **Thresholds:**
  - Basic: 30+ (extractor score < 70%)
  - Advanced: 50+ (extractor score < 50%)
  - Elite: 70+ (extractor score < 30%)
  - Exalted: 85+ (extractor score < 15%) (Prestige)
- **Data Capture Plan:** Calculate 100 - extractorScore from bridge tracker data.
- **Player Classification Signal:** **PRIMARY EXTRACTOR DETECTION SIGNAL.**
  - No tier = likely Extractor (score > 70%)
  - Exalted tier = verified Builder (score < 15%)

#### 5.4 Hedge's Chosen
- **Key:** `hedges_chosen`
- **Description:** Send JEWEL to Hedge as a show of faith.
- **Metric Type:** COUNT
- **Tier System:** GENE
- **Thresholds:**
  - Basic: 1 JEWEL sent
  - Advanced: 5 JEWEL sent
  - Elite: 20 JEWEL sent
  - Exalted: 50 JEWEL sent (Prestige)
- **Data Capture Plan:** Query payment monitor for JEWEL transfers to Hedge treasury wallet.
- **Player Classification Signal:** **PREMIUM SUBSCRIBER LOYALTY INDICATOR.** Supports Hedge Loyalist archetype.

---

### Category 6: Seasonal Events

#### 6.1 Winter's Solstice
- **Key:** `winters_solstice`
- **Description:** Level heroes during the winter event window.
- **Metric Type:** COUNT
- **Status:** INACTIVE (activate during winter events)
- **Thresholds:**
  - Common: 3 level-ups during event
  - Uncommon: 5 level-ups during event
  - Rare: 8 level-ups during event
  - Legendary: 12 level-ups during event
  - Mythic: 20 level-ups during event (Prestige)
- **Data Capture Plan:** Track level-up events within defined event date range.
- **Player Classification Signal:** Event participation indicates engaged player.

---

### Category 7: Prestige (Overall)

#### 7.1 True Exalted Bloodline
- **Key:** `true_exalted_bloodline`
- **Description:** Own multiple Exalted-gene heroes.
- **Metric Type:** COUNT
- **Tier System:** PRESTIGE
- **Thresholds:**
  - Exalted: 10 Exalted-gene heroes (Prestige)
- **Data Capture Plan:** Decode hero genes, filter for Exalted tier in any gene slot.
- **Player Classification Signal:** Rare achievement indicates Power Player archetype.

#### 7.2 Mythic Hoarder
- **Key:** `mythic_hoarder`
- **Description:** Own Mythic rarity heroes.
- **Metric Type:** COUNT
- **Tier System:** PRESTIGE
- **Thresholds:**
  - Mythic: 3 Mythic-rarity heroes (Prestige)
- **Data Capture Plan:** Filter hero list for rarity === 'mythic'.
- **Player Classification Signal:** Whale indicator; Mythic heroes are extremely rare/expensive.

#### 7.3 Eternal Activity
- **Key:** `eternal_activity`
- **Description:** Maintain long-term daily activity.
- **Metric Type:** STREAK
- **Tier System:** PRESTIGE
- **Thresholds:**
  - Mythic: 120 days of activity (Prestige)
- **Data Capture Plan:** Estimate from first transaction date + activity frequency metrics.
- **Player Classification Signal:** Long-term commitment; strong Builder indicator.

#### 7.4 Master of All Trades
- **Key:** `master_of_all_trades`
- **Description:** Reach Rare tier or higher in every main challenge category.
- **Metric Type:** BOOLEAN
- **Tier System:** PRESTIGE
- **Thresholds:**
  - Exalted: All main categories at Rare+ (Prestige)
- **Data Capture Plan:** Check player_challenge_progress for RARE+ in categories 1-5.
- **Player Classification Signal:** Meta-achievement; indicates well-rounded Power Player.

---

### Category 8: Summoning Prestige

#### 8.1 The Dragonborn
- **Key:** `summon_dragoon`
- **Description:** Summon Dragoons and shape a draconic bloodline.
- **Metric Type:** COUNT
- **Tier System:** PRESTIGE
- **Thresholds:**
  - Elite: 1 Dragoon summoned
  - Exalted: 3 Dragoons summoned (Prestige)
  - Mythic: 5 Dragoons summoned (Prestige)
- **Data Capture Plan:** Query summon events, filter for mainClass === 'dragoon'.
- **Player Classification Signal:** Ultra-rare summons indicate genetic investment and luck.

#### 8.2 The Dread Summoner
- **Key:** `summon_dreadknight`
- **Description:** Summon a Dreadknight and bind one of the rarest souls in the Kingdom.
- **Metric Type:** COUNT
- **Tier System:** PRESTIGE
- **Thresholds:**
  - Exalted: 1 Dreadknight summoned (Prestige)
  - Mythic: 2 Dreadknights summoned (Prestige)
- **Data Capture Plan:** Query summon events, filter for mainClass === 'dreadKnight'.
- **Player Classification Signal:** Rarest class in game; indicates extreme luck or whale-level breeding.

#### 8.3 The Ascended Sages
- **Key:** `summon_sage`
- **Description:** Summon Sages and guide the wisdom of the realms.
- **Metric Type:** COUNT
- **Tier System:** PRESTIGE
- **Thresholds:**
  - Elite: 1 Sage summoned
  - Exalted: 3 Sages summoned (Prestige)
  - Mythic: 5 Sages summoned (Prestige)
- **Data Capture Plan:** Query summon events, filter for mainClass === 'sage'.
- **Player Classification Signal:** Ultra-rare class achievement.

#### 8.4 Blade of Light
- **Key:** `summon_paladin`
- **Description:** Summon Paladins to stand as shields of the Kingdom.
- **Metric Type:** COUNT
- **Tier System:** PRESTIGE
- **Thresholds:**
  - Advanced: 1 Paladin summoned
  - Elite: 3 Paladins summoned
  - Exalted: 5 Paladins summoned (Prestige)
  - Mythic: 10 Paladins summoned (Prestige)
- **Data Capture Plan:** Query summon events, filter for mainClass === 'paladin'.
- **Player Classification Signal:** Rare advanced class; indicates focused breeding.

#### 8.5 Shadowmaker
- **Key:** `summon_dark_knight`
- **Description:** Summon Dark Knights from the edge of the void.
- **Metric Type:** COUNT
- **Tier System:** PRESTIGE
- **Thresholds:**
  - Advanced: 1 Dark Knight summoned
  - Elite: 3 Dark Knights summoned
  - Exalted: 5 Dark Knights summoned (Prestige)
  - Mythic: 10 Dark Knights summoned (Prestige)
- **Data Capture Plan:** Query summon events, filter for mainClass === 'darkKnight'.
- **Player Classification Signal:** Rare advanced class achievement.

#### 8.6 Gene Alchemist
- **Key:** `summon_high_tier_genes`
- **Description:** Summon heroes with Advanced, Elite, and Exalted genes in their bloodlines.
- **Metric Type:** COUNT
- **Tier System:** MIXED
- **Thresholds:**
  - Basic: 1 hero with Advanced gene
  - Advanced: 3 heroes with Elite genes
  - Elite: 5 heroes with Exalted genes
  - Exalted: 10 high-tier gene heroes (Prestige)
- **Data Capture Plan:** Decode genes from summoned heroes, filter for tier >= Advanced.
- **Player Classification Signal:** Genetic focus indicates breeding specialist.

#### 8.7 Mythmaker
- **Key:** `summon_mythic_heroes`
- **Description:** Summon Mythic rarity heroes.
- **Metric Type:** COUNT
- **Tier System:** PRESTIGE
- **Thresholds:**
  - Elite: 1 Mythic hero summoned
  - Exalted: 2 Mythic heroes summoned (Prestige)
  - Mythic: 3 Mythic heroes summoned (Prestige)
- **Data Capture Plan:** Query summon events, filter for rarity === 'mythic'.
- **Player Classification Signal:** Extreme rarity; indicates whale-level activity or extraordinary luck.

#### 8.8 Royal Lineage
- **Key:** `summon_trifecta`
- **Description:** Summon the trifecta: Dreadknight, Dragoon, and Sage across your account.
- **Metric Type:** BOOLEAN
- **Tier System:** PRESTIGE
- **Thresholds:**
  - Exalted: Has summoned 1 of each ultra-rare (Prestige)
  - Mythic: Has summoned 2+ of each ultra-rare (Prestige)
- **Data Capture Plan:** Check summon history for at least 1 Dreadknight, 1 Dragoon, and 1 Sage.
- **Player Classification Signal:** Ultimate summoning achievement; indicates Power Player whale.

---

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/challenges` | GET | List all active categories and challenges |
| `/api/challenges/progress/:userId` | GET | User's progress across all challenges |
| `/api/challenges/leaderboard/:challengeKey` | GET | Top players for a specific challenge |
| `/api/debug/trigger-etl` | POST | Manual ETL trigger (admin) |

---

## Metric Types Reference

| Type | Description | Example |
|------|-------------|---------|
| `COUNT` | Simple accumulator | hero_count, total_levels |
| `STREAK` | Consecutive day tracking | quest_day_streak |
| `SCORE` | Percentage or efficiency metric | profession_match_pct |
| `BOOLEAN` | True/false achievement | has_trifecta_ultra_rare |
| `COMPOSITE` | Computed from multiple sources | all_categories_rare_plus |

---

## Summary Stats

- **8 Categories**
- **45 Total Challenges** (44 active, 1 seasonal inactive)
- **2 Tier Systems** (RARITY: 5 tiers, GENE: 4 tiers)
- **10 Metric Sources**
- **5 Metric Types**

---

*Document version: 1.0 | Last updated: December 2024*
