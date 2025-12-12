# MASTER CHALLENGE SYSTEM DOCUMENT

## Source of Truth

**IMPORTANT:** The canonical source for all challenge definitions is `src/data/challengeConfig.ts`. This document provides architectural context and design philosophy, but does NOT duplicate every tier threshold or configuration detail from the code.

## Overview

This document defines the entire Challenge System for the DeFi Kingdoms (DFK) + METIS multi-chain ecosystem, designed for:

- Player progression
- Behavior modeling
- Engagement tracking
- Competitive classification
- Prestige identity
- Achievement rewarding
- Tournament structuring
- Leaderboard segmentation
- Hedge/NPC personalization
- Data-driven insights
- Onboarding automation

This system organizes all player-visible challenges into **16 ordered categories**, arranged from:

- Beginner → Expert
- Boring → Epic
- Shallow → Deep
- Short-term → Lifetime
- Low emotional impact → High emotional impact

The system is also designed to:

- Support multi-wallet clusters
- Prevent smurf abuse
- Use percentile tiering
- Allow dynamic, configurable tuning
- Scale to future DFK systems
- Align with Hedge's training, engagement, and reward systems

This is the canonical, master-level specification for all current and future Challenge Pass, Leaderboards, and Player Segmentation.

---

## System Philosophy — The Player Journey

The challenge system must tell a story:

1. A new player enters the Kingdom
2. They explore basic loops (quests, eggs, communication)
3. They grow into professions and hunting
4. They acquire heroes, pets, items
5. They begin forging, summoning, crafting
6. They enter PvP
7. They step into METIS — patrols, shells, influence
8. They compete in METIS tournaments
9. They pursue prestige feats
10. They eventually reach mythical, epic achievements
11. They attain global meta mastery across all systems

In this sense, the category order is a narrative progression path, not just a list of features.

A player should FEEL progression while browsing challenge categories — like looking at a skill tree or RPG class path.

---

## Core Structure — 16 Challenge Categories (52 Challenges Total)

Ordered by gameplay depth and emotional weight. **Source of truth:** `src/data/challengeConfig.ts`

| # | Category Key | Display Name | Tier System | # Challenges | Description |
|---|--------------|--------------|-------------|--------------|-------------|
| 1 | `hero_progression` | Hero Progression | RARITY | 3 | Level up, quest, hunt, and grow your roster |
| 2 | `economy_strategy` | Economy & Strategy | GENE | 3 | Optimize gold, DeFi yields, and reinvestment behavior |
| 3 | `profession_specialization` | Profession Specialization | MIXED | 2 | Master mining, gardening, fishing, and foraging |
| 4 | `ownership_collection` | Ownership & Collection | RARITY | 2 | Grow your army of heroes, pets, gear, and Gen0s |
| 5 | `behavior_engagement` | Behavior & Engagement | GENE | 2 | Show your commitment to the Kingdom and to Hedge |
| 6 | `seasonal_events` | Seasonal & Events | MIXED | 1 | Limited-time challenges that rotate with the seasons |
| 7 | `prestige_overall` | Prestige | PRESTIGE | 1 | Ultra-rare account-wide achievements |
| 8 | `summoning_prestige` | Summoning & Bloodlines | PRESTIGE | 5 | Ultra-rare summons, mutations, and bloodlines |
| 9 | `hunting_pve` | Hunting | RARITY | 4 | Boss fights, rare drops, and apex PvE encounters |
| 10 | `pvp_competition` | PvP Competition | GENE | 3 | Ranked battles, streaks, and arena mastery |
| 11 | `metis_pve` | METIS Patrols | RARITY | 2 | Combat progression and elite patrol victories on METIS |
| 12 | `metis_economy` | METIS Economy | MIXED | 4 | Shells, raffles, jackpots, and influence predictions |
| 13 | `metis_tournaments` | METIS Tournaments | GENE | 3 | Structured competitive play within METIS |
| 14 | `defi_participation` | DeFi Participation | RARITY | 6 | Liquidity provision, staking, and Jeweler loyalty |
| 15 | `epic_feats` | Epic Feats | PRESTIGE | 6 | Mythically rare, account-defining achievements |
| 16 | `global_meta_profile` | Global Meta Profile | MIXED | 5 | Aggregated mastery signals across all categories |

This sequence takes a player from:
➡ "I logged in today"
to
➡ "I became the legend the Kingdom will remember."

---

## Tiering Engine

### Tier Systems

The system uses **four tier taxonomies** to match DFK's rarity and gene systems:

#### RARITY Tier System (5 tiers)
For quantity-based achievements that parallel hero rarity.

| Tier | Display | Percentile | Typical Use |
|------|---------|------------|-------------|
| COMMON | Common | Bottom 40% | Entry-level milestones |
| UNCOMMON | Uncommon | 40–60% | Intermediate progress |
| RARE | Rare | 60–80% | Significant achievement |
| LEGENDARY | Legendary | 80–95% | Expert-level |
| MYTHIC | Mythic | Top 5% | Top 1% / Prestige |

#### GENE Tier System (4 tiers)
For efficiency/optimization metrics that parallel hero gene tiers.

| Tier | Display | Percentile | Typical Use |
|------|---------|------------|-------------|
| BASIC | Basic | Bottom 40% | Baseline competence |
| ADVANCED | Advanced | 40–70% | Good optimization |
| ELITE | Elite | 70–90% | Excellent execution |
| EXALTED | Exalted | Top 10% | Perfect mastery |

#### MIXED Tier System
Categories that use both systems depending on challenge type.

#### PRESTIGE Tier System
Ultra-rare achievements with only EXALTED and MYTHIC tiers.

**Percentile-Based Calibration:**
All tiered challenges use percentile-based thresholds ensuring:
- Fairness for all players
- No whale inflation
- Automatic balance
- Adjusts with population growth
- Works across multiple chains

Prestige feats do not use tiers — they unlock once.

---

## Cluster Identity Model — Anti-Smurfing Engine

Players often use multiple wallets. To prevent smurfing:

**ALL challenge scoring occurs at the cluster level, not the wallet level.**

Cluster = all wallets linked to the same user.

Cluster-based scoring ensures:
- Tournament fairness
- Influence accuracy
- PvP ranking integrity
- Behavioral modeling accuracy
- No dilution of achievements
- Prevents challenge abuse

Cluster identity uses:
- PlayerID
- Linked wallets
- Linked Discord ID
- Linked profile login(s)

This also enhances Hedge's personalization layer.

---

## Category Details

### Category 1 — Hero Progression (`hero_progression`)

**Tier System:** RARITY

This category introduces combat and leveling:

| Challenge Key | Name | Description | Metric | Thresholds |
|---------------|------|-------------|--------|------------|
| `hero_riser` | Hero Riser | Accumulate total hero levels across your roster | COUNT: total_levels | 100/300/600/1000/2000 |
| `hunters_triumph` | Hunter's Triumph | Win Hunting encounters across the realms | COUNT: wins | 10/50/250/1000 |
| `arena_challenger` | Arena Challenger | Participate in ranked PvP matches | COUNT: matches_played | 5/25/100/250 |

---

### Category 2 — Economy & Strategy (`economy_strategy`)

**Tier System:** GENE

This category rewards economic optimization:

| Challenge Key | Name | Description | Metric | Thresholds |
|---------------|------|-------------|--------|------------|
| `vendor_tycoon` | Vendor Tycoon | Spend gold at NPC vendors across the realms | COUNT: vendor_spend | 1K/5K/25K/100K |
| `market_maker` | Market Maker | Provide liquidity to DFK pools | COUNT: active_days | 7/30/90/180 |
| `jeweler_loyalty` | Jeweler Loyalty | Maintain continuous staking at the Jeweler | COUNT: stake_duration_days | 7/30/100/365 |

---

### Category 3 — Profession Specialization (`profession_specialization`)

**Tier System:** MIXED

Master the professions:

| Challenge Key | Name | Description | Metric | Thresholds |
|---------------|------|-------------|--------|------------|
| `miner_master` | Master Miner | Complete Mining profession quests | COUNT: mining_quests | 50/200/750/2000 |
| `herbalist_master` | Master Herbalist | Complete Foraging profession quests | COUNT: foraging_quests | 50/200/750/2000 |

---

### Category 4 — Ownership & Collection (`ownership_collection`)

**Tier System:** RARITY

Grow your holdings:

| Challenge Key | Name | Description | Metric | Thresholds |
|---------------|------|-------------|--------|------------|
| `house_of_heroes` | House of Heroes | Grow the total number of heroes you own | COUNT: hero_count | 10/25/50/100/200 |
| `pet_sanctuary` | Pet Sanctuary | Collect pets of increasing rarity | COUNT: rarity_score | 10/25/60/120/200 |

---

### Category 5 — Behavior & Engagement (`behavior_engagement`)

**Tier System:** GENE

Show commitment:

| Challenge Key | Name | Description | Metric | Thresholds |
|---------------|------|-------------|--------|------------|
| `kingdom_calls` | The Kingdom Calls | Log in and play across many days | COUNT: active_days | 7/30/90/365 |
| `loyal_follower` | Loyal Follower | Engage with Hedge and the Discord community | COUNT: discord_engagement_score | 10/40/100/250 |

---

### Category 6 — Seasonal & Events (`seasonal_events`)

**Tier System:** MIXED

Limited-time challenges:

| Challenge Key | Name | Description | Metric | Thresholds |
|---------------|------|-------------|--------|------------|
| `seasonal_voyager` | Seasonal Voyager | Participate in seasonal quests, events, or bosses | COUNT: seasonal_score | 10/30/60/100 |

---

### Category 7 — Prestige (`prestige_overall`)

**Tier System:** PRESTIGE

Account-wide achievements:

| Challenge Key | Name | Description | Metric | Threshold |
|---------------|------|-------------|--------|-----------|
| `long_road_home` | Long Road Home | Remain active in DeFi Kingdoms for many days | COUNT: account_age_days | 365 (MYTHIC) |

---

### Category 8 — Summoning & Bloodlines (`summoning_prestige`)

**Tier System:** PRESTIGE

Ultra-rare summoning achievements:

| Challenge Key | Name | Description | Metric | Thresholds |
|---------------|------|-------------|--------|------------|
| `perfect_pairing` | Perfect Pairing | Summon a hero with at least two upward mutations | BOOLEAN | 1 (MYTHIC) |
| `mutagenic_specialist` | Mutagenic Specialist | Summon heroes with three or more upward mutations | COUNT | 1/3/10/25 |
| `mythmaker` | Mythmaker | Summon Mythic-rarity heroes | COUNT | 1/3/10/25 |
| `royal_lineage` | Royal Lineage | Produce offspring with inherited upward mutations | COUNT | 1/3/10/25 |

---

### Category 9 — Hunting (`hunting_pve`)

**Tier System:** RARITY

Boss fights and PvE encounters:

| Challenge Key | Name | Description | Metric | Thresholds |
|---------------|------|-------------|--------|------------|
| `apex_hunter` | Apex Hunter | Defeat elite bosses in Hunting | COUNT: boss_wins | 1/5/20/50 |
| `relic_hunter` | Relic Hunter | Obtain rare relics from Hunting | COUNT: relics | 1/3/10/25 |
| `flawless_hunter` | Flawless Hunter | Win hunts with no casualties | COUNT: flawless_wins | 5/25/100/250 |
| `hunt_streak` | Hunt Streak | Maintain consecutive hunting victories | STREAK: win_streak | 3/10/25/50 |
| `hunt_diversity` | Hunt Diversity | Hunt with different hero classes | COUNT: class_count | 3/5/8/12 |

---

### Category 10 — PvP Competition (`pvp_competition`)

**Tier System:** GENE

Ranked battles and arena:

| Challenge Key | Name | Description | Metric | Thresholds |
|---------------|------|-------------|--------|------------|
| `pvp_victor` | Arena Victor | Win ranked PvP matches | COUNT: wins | 10/50/200/500 |
| `pvp_streak` | Win Streak | Maintain consecutive PvP victories | STREAK: win_streak | 3/7/15/30 |
| `pvp_flawless` | Flawless Victory | Win PvP matches with all heroes surviving | COUNT: flawless_wins | 1/5/20/50 |
| `pvp_champion` | PvP Champion | Reach top arena rankings | BOOLEAN | 1 (MYTHIC) |

---

### Category 11 — METIS Patrols (`metis_pve`)

**Tier System:** RARITY

Combat on METIS chain:

| Challenge Key | Name | Description | Metric | Thresholds |
|---------------|------|-------------|--------|------------|
| `elite_patroller` | Elite Patroller | Complete patrol encounters on METIS | COUNT: patrols | 10/50/200/500 |
| `metis_boss_slayer` | METIS Boss Slayer | Defeat elite patrol bosses | COUNT: boss_wins | 1/5/20/50 |
| `patrol_streak` | Patrol Streak | Maintain consecutive patrol victories | STREAK: win_streak | 3/10/25/50 |

---

### Category 12 — METIS Economy (`metis_economy`)

**Tier System:** MIXED

Shells, raffles, and influence:

| Challenge Key | Name | Description | Metric | Thresholds |
|---------------|------|-------------|--------|------------|
| `shell_collector` | Shell Collector | Accumulate METIS Shells | COUNT: shells | 100/500/2000/5000 |
| `raffle_king` | Raffle King | Participate in Shell raffles | COUNT: entries | 5/20/75/200 |
| `influence_oracle` | Influence Oracle | Make accurate influence predictions | SCORE: accuracy_pct | 30/50/70/85 |
| `shell_jackpot` | Shell Jackpot | Win a raffle jackpot | BOOLEAN | 1 (MYTHIC) |

---

### Category 13 — METIS Tournaments (`metis_tournaments`)

**Tier System:** GENE

Competitive METIS play:

| Challenge Key | Name | Description | Metric | Thresholds |
|---------------|------|-------------|--------|------------|
| `tournament_challenger` | Tournament Challenger | Enter official METIS tournaments | COUNT: entries | 1/3/10/20 |
| `tournament_victor` | Tournament Victor | Win tournament matches on METIS | COUNT: wins | 1/3/10/25 |
| `metis_champion` | METIS Champion | Finish in the top bracket of any official tournament | BOOLEAN | 1 (MYTHIC) |

---

### Category 14 — DeFi Participation (`defi_participation`)

**Tier System:** RARITY

Liquidity and staking:

| Challenge Key | Name | Description | Metric | Thresholds |
|---------------|------|-------------|--------|------------|
| `lp_depth` | Liquidity Depth | Provide significant USD value to LP pools | COUNT: lp_usd_value | 1K/5K/25K/100K |
| `lp_diversified` | Diversified Provider | Provide liquidity across multiple LP pools | COUNT: pool_count | 2/4/6/10 |
| `yield_harvester` | Yield Harvester | Harvest LP rewards consistently | COUNT: harvest_actions | 5/20/75/200 |
| `diamond_hand_lp` | Diamond-Hand LP | Maintain LP position for extended duration | COUNT: lp_duration_max_days | 7/30/90/180 |
| `jeweler_stakeholder` | Jeweler Stakeholder | Stake tokens at the Jeweler | COUNT: stake_usd_value | 1K/5K/25K/100K |
| `jeweler_whale` | Jeweler Whale | Maintain a high-value JEWEL stake | BOOLEAN | 10K JEWEL (MYTHIC) |

---

### Category 15 — Epic Feats (`epic_feats`)

**Tier System:** PRESTIGE

Mythically rare achievements:

| Challenge Key | Name | Description | Threshold |
|---------------|------|-------------|-----------|
| `vangardian` | Vangardian | Achieve mastery across METIS patrols, economy, influence, and tournaments | MYTHIC |
| `worldforged_summoner` | Worldforged Summoner | Summon a Dreadknight with four or more upward mutations | MYTHIC |
| `grandmaster_geneweaver` | Grandmaster Geneweaver | Create a 3-generation genetic lineage with escalating mutation depth | MYTHIC |
| `eternal_collector` | Eternal Collector | Own Mythic heroes of every class | MYTHIC |
| `crowned_jeweler` | Crowned Jeweler | Maintain a continuous JEWEL lock for 1000 days | MYTHIC |
| `mythic_menagerie` | Mythic Menagerie | Own an Odd or Ultra Odd variant from every pet family | MYTHIC |

---

### Category 16 — Global Meta Profile (`global_meta_profile`)

**Tier System:** MIXED

Aggregated mastery signals across all categories:

| Challenge Key | Name | Description | Metric | Thresholds |
|---------------|------|-------------|--------|------------|
| `prestige_collector` | Prestige Collector | Unlock and accumulate prestige achievements | COUNT: prestige_unlocked_count | 1/3/7/12 |
| `category_master` | Category Master | Achieve Exalted tier in multiple categories | COUNT: exalted_category_count | 1/3/6/10 |
| `summoning_prestige_score` | Summoning Prestige Score | Composite score from summoning achievements | SCORE | 25/75/200/400 |
| `pvp_mastery_score` | PvP Mastery Score | Composite score from PvP achievements | SCORE | 25/80/200/400 |
| `metis_mastery_score` | METIS Mastery Score | Composite score from METIS achievements | SCORE | 25/80/200/400 |

---

## ETL Framework — Extraction, Transformation, Load

The Challenge System relies on a modular ETL pipeline:

### Extract
- Wallet events
- Summon logs
- Hunt results
- Patrol results
- Crafting transactions
- Pet hatches
- Influence bet logs
- Tournament entries & match outcomes
- Resource drops
- Marketplace interactions

### Transform
- Cluster association
- Weighted calculations
- Mutation detection
- Rarity classification
- Variant identification
- PvP team meta evaluation
- Challenge-specific metrics

### Load
- Challenge progress table
- Tier assignments
- Achievement unlocks
- Score snapshots
- Seasonal logs

ETL is domain-driven — each challenge category maps cleanly to specific extractors.

---

## Open Configuration Tables

The Challenge System supports future expansions with configurable open lists:

- **META_COMPOSITION_TABLE** — Tracks meta PvP team compositions
- **CLUCKER_DROP_TABLE** — Motherclucker-exclusive drops
- **BOAR_DROP_TABLE** — Mad Boar-exclusive drops
- **RELIC_DROP_TABLE** — Ultra-rare hunting relics
- **BLACKSMITH_EQUIPMENT_IDS** — Items from Armorsmith/Weaponsmith vendors
- **GEAR_ENHANCEMENT_METHODS** — Equipment enhancement/repair/upgrade actions
- **CRAFTING_RECIPE_GRAPH** — Multi-step crafting pipelines
- **TOURNAMENT_EVENT_IDS** — Official METIS tournaments
- **TOURNAMENT_MATCH_RESULT_IDS** — Match won results
- **TOURNAMENT_CHAMPION_CRITERIA** — Per-event champion placement thresholds

These allow updating the game without rewriting challenge code.

---

## Implementation Files

| File | Purpose |
|------|---------|
| `src/data/challengeConfig.ts` | Canonical challenge definitions - all categories, challenges, tiers |
| `src/etl/loaders/challengeProgressLoader.ts` | Writes computed metrics to `player_challenge_progress` |
| `src/etl/types.ts` | METRIC_REGISTRY mapping challenge keys to extractors |
| `shared/schema.ts` | Database table definitions |
| `docs/CHALLENGES_SPEC.md` | Detailed specification document |

---

## Version History

- **v1.0** — Original 15-category structure (Master Document)
- **v2.0** — Added Category 16 (Global Meta Profile), removed separate Crafting category (merged into professions/economy), aligned category keys with code implementation

---

*Last Updated: December 2024*
