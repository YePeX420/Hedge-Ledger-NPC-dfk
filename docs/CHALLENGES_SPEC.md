# Hedge Ledger Challenge System Specification

## Document Purpose
This is a **summary guide** for the gamified Challenge/Achievement system. Use this to understand the overall structure and architecture.

**IMPORTANT:** The source of truth for all challenge definitions is `src/data/challengeConfig.ts`. This document provides an architectural overview and representative examples, but does NOT duplicate every tier threshold or configuration detail from the code.

**To modify challenges:** Edit `src/data/challengeConfig.ts` directly. This document should be updated to reflect structural changes (new categories, tier system changes) but does not need to mirror every challenge attribute.

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
| `docs/MASTER_CHALLENGE_SYSTEM.md` | Master narrative document |

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

The system uses **four tier taxonomies** to match DFK's rarity and gene systems:

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

### 16 Challenge Categories (52 Total Challenges)

**Note:** `src/data/challengeConfig.ts` is the authoritative source of truth. This document provides an overview.

| # | Key | Name | Tier System | Challenges | Focus Area |
|---|-----|------|-------------|------------|------------|
| 1 | `hero_progression` | Hero Progression | RARITY | 3 | Levels, hunting wins, PvP participation |
| 2 | `economy_strategy` | Economy & Strategy | GENE | 3 | Gold vendors, LP, staking duration |
| 3 | `profession_specialization` | Profession Specialization | MIXED | 2 | Mining, foraging quests |
| 4 | `ownership_collection` | Ownership & Collection | RARITY | 2 | Heroes, pets |
| 5 | `behavior_engagement` | Behavior & Engagement | GENE | 2 | Active days, Discord engagement |
| 6 | `seasonal_events` | Seasonal & Events | MIXED | 1 | Seasonal voyager |
| 7 | `prestige_overall` | Prestige | PRESTIGE | 1 | Account age |
| 8 | `summoning_prestige` | Summoning & Bloodlines | PRESTIGE | 5 | Mutations, mythics, legendary classes |
| 9 | `hunting_pve` | Hunting | RARITY | 4 | Boss kills, relics, miracles |
| 10 | `pvp_competition` | PvP Competition | GENE | 3 | Wins, streaks, flawless |
| 11 | `metis_pve` | METIS Patrols | RARITY | 2 | Patrol wins, elite patrols |
| 12 | `metis_economy` | METIS Economy | MIXED | 4 | Shells, raffles, influence |
| 13 | `metis_tournaments` | METIS Tournaments | GENE | 3 | Entries, wins, champion |
| 14 | `defi_participation` | DeFi Participation | RARITY | 6 | LP depth, pools, harvests, Jeweler |
| 15 | `epic_feats` | Epic Feats | PRESTIGE | 6 | Account-defining mythic achievements |
| 16 | `global_meta_profile` | Global Meta Profile | MIXED | 5 | Aggregated mastery scores |

---

## Complete Challenge Catalog

**Note:** For exact tier thresholds and full challenge details, see `src/data/challengeConfig.ts`. Challenges use GENE tiers (BASIC/ADVANCED/ELITE/EXALTED) or RARITY tiers (COMMON/UNCOMMON/RARE/LEGENDARY/MYTHIC) depending on the category's tier system.

---

### Category 1: Hero Progression (`hero_progression`) - 3 challenges

| Key | Name | Type | Description |
|-----|------|------|-------------|
| `hero_riser` | Hero Riser | COUNT | Accumulate total hero levels (RARITY tiers: 100→2000) |
| `hunters_triumph` | Hunter's Triumph | COUNT | Win Hunting encounters (GENE tiers: 10→1000) |
| `arena_challenger` | Arena Challenger | COUNT | Participate in ranked PvP matches (GENE tiers: 5→250) |

---

### Category 2: Economy & Strategy (`economy_strategy`) - 3 challenges

| Key | Name | Type | Description |
|-----|------|------|-------------|
| `vendor_tycoon` | Vendor Tycoon | COUNT | Spend gold at NPC vendors (GENE tiers: 1K→100K) |
| `market_maker` | Market Maker | COUNT | Provide LP liquidity (GENE tiers: 7→180 days) |
| `jeweler_loyalty` | Jeweler Loyalty | COUNT | Maintain Jeweler staking (GENE tiers: 7→365 days) |

---

### Category 3: Profession Specialization (`profession_specialization`) - 2 challenges

| Key | Name | Type | Description |
|-----|------|------|-------------|
| `miner_master` | Master Miner | COUNT | Complete Mining quests (GENE tiers: 50→2000) |
| `herbalist_master` | Master Herbalist | COUNT | Complete Foraging quests (GENE tiers: 50→2000) |

---

### Category 4: Ownership & Collection (`ownership_collection`) - 2 challenges

| Key | Name | Type | Description |
|-----|------|------|-------------|
| `house_of_heroes` | House of Heroes | COUNT | Own heroes (RARITY tiers: 10→200) |
| `pet_sanctuary` | Pet Sanctuary | COUNT | Collect pets by rarity score (RARITY tiers: 10→200) |

---

### Category 5: Behavior & Engagement (`behavior_engagement`) - 2 challenges

| Key | Name | Type | Description |
|-----|------|------|-------------|
| `kingdom_calls` | The Kingdom Calls | COUNT | Active days in the Kingdom (GENE tiers: 7→365 days) |
| `loyal_follower` | Loyal Follower | COUNT | Discord engagement score (GENE tiers: 10→250) |

---

### Category 6: Seasonal & Events (`seasonal_events`) - 1 challenge

| Key | Name | Type | Description |
|-----|------|------|-------------|
| `seasonal_voyager` | Seasonal Voyager | COUNT | Participate in seasonal events (GENE tiers: 10→100) |

---

### Category 7: Prestige (`prestige_overall`) - 1 challenge

| Key | Name | Type | Description |
|-----|------|------|-------------|
| `long_road_home` | Long Road Home | COUNT | Remain active for 365+ days (MYTHIC only) |

---

### Category 8: Summoning & Bloodlines (`summoning_prestige`) - 5 challenges

| Key | Name | Type | Description |
|-----|------|------|-------------|
| `perfect_pairing` | Perfect Pairing | BOOLEAN | Summon hero with 2+ upward mutations (MYTHIC unlock) |
| `mutagenic_specialist` | Mutagenic Specialist | COUNT | Summon heroes with 3+ mutations (GENE tiers: 1→25) |
| `mythmaker` | Mythmaker | COUNT | Summon Mythic-rarity heroes (GENE tiers: 1→25) |
| `royal_lineage` | Royal Lineage | COUNT | Inherit mutations from mutated parents (GENE tiers: 1→25) |
| `summoner_of_legends` | Summoner of Legends | COMPOSITE | Summon Dragoon, Sage, Spellbow, Dreadknight (MYTHIC unlock) |

---

### Category 9: Hunting (`hunting_pve`) - 4 challenges

| Key | Name | Type | Description |
|-----|------|------|-------------|
| `motherclucker_slayer` | Motherclucker Slayer | COUNT | Defeat Motherclucker boss (GENE tiers: 1→100) |
| `mad_boar_slayer` | Mad Boar Slayer | COUNT | Defeat Mad Boar boss (GENE tiers: 1→100) |
| `relic_tracker` | Relic Tracker | COUNT | Collect ultra-rare relics (GENE tiers: 1→25) |
| `clucker_miracle` | Clucker Miracle | BOOLEAN | Defeat Motherclucker with 1 hero at 1 HP (MYTHIC unlock) |

---

### Category 10: PvP Competition (`pvp_competition`) - 3 challenges

| Key | Name | Type | Description |
|-----|------|------|-------------|
| `arena_victor` | Arena Victor | COUNT | Win ranked PvP matches (GENE tiers: 3→150) |
| `win_streak` | Win Streak | STREAK | Consecutive PvP victories (GENE tiers: 2→20) |
| `flawless_victory` | Flawless Victory | BOOLEAN | Win PvP with zero hero deaths (MYTHIC unlock) |

---

### Category 11: METIS Patrols (`metis_pve`) - 2 challenges

| Key | Name | Type | Description |
|-----|------|------|-------------|
| `patrol_warden` | Patrol Warden | COUNT | Win METIS patrol encounters (GENE tiers: 5→300) |
| `elite_patroller` | Elite Patroller | COUNT | Win elite-tier patrols (GENE tiers: 1→50) |

---

### Category 12: METIS Economy (`metis_economy`) - 4 challenges

| Key | Name | Type | Description |
|-----|------|------|-------------|
| `shell_collector` | Shell Collector | COUNT | Accumulate METIS shells (GENE tiers: 10→1000) |
| `shell_gambler` | Shell Gambler | COUNT | Enter shell raffles (GENE tiers: 5→250) |
| `shell_jackpot` | Shell Jackpot | BOOLEAN | Win a shell raffle (MYTHIC unlock) |
| `influence_strategist` | Influence Strategist | COUNT | Win Influence predictions (GENE tiers: 1→50) |

---

### Category 13: METIS Tournaments (`metis_tournaments`) - 3 challenges

| Key | Name | Type | Description |
|-----|------|------|-------------|
| `tournament_challenger` | Tournament Challenger | COUNT | Enter METIS tournaments (GENE tiers: 1→20) |
| `tournament_victor` | Tournament Victor | COUNT | Win tournament matches (GENE tiers: 1→25) |
| `metis_champion` | METIS Champion | BOOLEAN | Finish in top bracket (MYTHIC unlock) |

---

### Category 14: DeFi Participation (`defi_participation`) - 6 challenges

| Key | Name | Type | Description |
|-----|------|------|-------------|
| `lp_depth` | Liquidity Depth | COUNT | USD value in LP pools (GENE tiers: 1K→100K) |
| `lp_diversified` | Diversified Provider | COUNT | LP across multiple pools (GENE tiers: 2→10) |
| `yield_harvester` | Yield Harvester | COUNT | Harvest LP rewards (GENE tiers: 5→200) |
| `diamond_hand_lp` | Diamond-Hand LP | COUNT | LP position duration (GENE tiers: 7→180 days) |
| `jeweler_stakeholder` | Jeweler Stakeholder | COUNT | Stake USD value at Jeweler (GENE tiers: 1K→100K) |
| `jeweler_whale` | Jeweler Whale | BOOLEAN | 10K+ JEWEL stake (MYTHIC unlock) |

---

### Category 15: Epic Feats (`epic_feats`) - 6 challenges

All Epic Feats are BOOLEAN with MYTHIC unlock only:

| Key | Name | Description |
|-----|------|-------------|
| `vangardian` | Vangardian | Achieve mastery across METIS patrols, economy, influence, and tournaments |
| `worldforged_summoner` | Worldforged Summoner | Summon a Dreadknight with 4+ upward mutations |
| `grandmaster_geneweaver` | Grandmaster Geneweaver | Create 3-generation lineage with escalating mutation depth |
| `eternal_collector` | Eternal Collector | Own Mythic heroes of every class |
| `crowned_jeweler` | Crowned Jeweler | Maintain continuous JEWEL lock for 1000 days |
| `mythic_menagerie` | Mythic Menagerie | Own Odd/Ultra Odd variant from every pet family |

---

### Category 16: Global Meta Profile (`global_meta_profile`) - 5 challenges

| Key | Name | Type | Description |
|-----|------|------|-------------|
| `prestige_collector` | Prestige Collector | COUNT | Unlock prestige achievements (GENE tiers: 1→12) |
| `category_master` | Category Master | COUNT | Achieve EXALTED in categories (GENE tiers: 1→10) |
| `summoning_prestige_score` | Summoning Prestige Score | SCORE | Composite summoning score (25→400) |
| `pvp_mastery_score` | PvP Mastery Score | SCORE | Composite PvP score (25→400) |
| `metis_mastery_score` | METIS Mastery Score | SCORE | Composite METIS score (25→400) |

---

## Data Capture Strategy

### Metric Sources Summary

| metricSource | Description | Data Capture Method |
|--------------|-------------|---------------------|
| `onchain_heroes` | Hero inventory data | GraphQL: getAllHeroesByOwner() |
| `onchain_quests` | Quest completion history | GraphQL: hero quest history + RPC events |
| `onchain_summons` | Summon events | RPC: HeroSummoningUpgradeable events |
| `onchain_pets` | Pet ownership | RPC: Pet contract ownership query |
| `onchain_hunting` | Hunting encounters | RPC: Hunting contract events |
| `onchain_pvp` | PvP match results | RPC: PvP contract events |
| `onchain_lp` | LP positions/yields | RPC: MasterGardener userInfo + balanceOf |
| `onchain_staking` | Jeweler stakes | RPC: Jeweler contract balances |
| `onchain_patrols` | METIS patrol results | RPC: METIS patrol contract events |
| `onchain_tournaments` | Tournament participation | RPC: Tournament contract events |
| `behavior_events` | Computed behavior metrics | Transform phase calculations |
| `seasonal_events` | Seasonal event tracking | Special event-scoped tracking |
| `metis_economy` | METIS economy data | RPC: Shell/raffle/influence contracts |
| `epic_feats` | Epic achievement tracking | Composite calculations |
| `meta_profile` | Aggregated profile data | Cross-challenge calculations |

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

---

## ETL Pipeline

### Trigger Points

1. **First wallet link** → Auto-trigger ETL for cluster
2. **Incremental (every 6 hours)** → Active wallets only
3. **Daily snapshot (04:00 UTC)** → Full snapshot
4. **Manual trigger** → Admin dashboard button

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
| `kingdom_calls` tier | Activity level for engagement |
| `loyal_follower` tier | Discord engagement |
| `house_of_heroes` tier | Portfolio size (whale indicator) |
| `lp_depth` tier | DeFi commitment |
| `jeweler_stakeholder` tier | Staking commitment |
| Multiple prestige tiers | "Power player" archetype |

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

3. **If behavior_model source, add transformer logic**

4. **Run ETL to populate data**

### Adding a New Category

1. **Add category definition:**
```typescript
{
  key: "new_category",
  name: "New Category Name",
  description: "What this category represents.",
  tierSystem: "GENE", // RARITY | GENE | MIXED | PRESTIGE
  sortOrder: 17,
},
```

2. **Add challenges with `categoryKey: "new_category"`**

### Deactivating a Challenge

Set `isActive: false` in the challenge definition. The ETL will skip it but existing progress is preserved.

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | Initial | 8 categories |
| 2.0 | Dec 2024 | 16 categories - added Hunting, PvP, METIS categories, DeFi Participation, Epic Feats, Global Meta Profile |

---

*Last Updated: December 2024*
*Synced with: `src/data/challengeConfig.ts`*
