# Player Classification System - Technical Documentation

## Overview

The Player Classification System is a multi-dimensional tagging framework that categorizes DeFi Kingdoms players based on their wallet data, Discord engagement, and behavioral patterns. It powers personalized AI responses, premium feature targeting, and community segmentation.

---

## 1. Archetypes (Primary Classification)

**What they are:** The main player category based on wallet assets and activity patterns.

| Archetype | Description | Detection Criteria |
|-----------|-------------|-------------------|
| **GUEST** | No wallet or zero DFK assets | No snapshot, OR heroCount=0 AND lpPositions=0 AND balance<10 |
| **ADVENTURER** | Early player with 1-10 heroes | 1-10 heroes, low LP, minor balances |
| **PLAYER** | Active player with substantial assets | >10 heroes OR 2+ LP positions |
| **INVESTOR** | Yield farmer with few heroes but large LP | ≤5 heroes AND (LP value ≥$5000 OR balance ≥1000) |
| **EXTRACTOR** | Farm & dump pattern | extractorScore ≥60 (based on sell patterns) |

**Source:** `classification-config.js` lines 8-14, `classification-engine.js` lines 184-228

---

## 2. Tiers (Access Levels)

**What they are:** Access/privilege levels (0-4) based on combined engagement and financial KPIs.

| Tier | Name | Requirements | Features |
|------|------|--------------|----------|
| **Tier 0** | Guest | Default for minimal activity | Basic access |
| **Tier 1** | Bronze | Engagement ≥5 OR Financial ≥10 | Standard responses |
| **Tier 2** | Silver | Engagement ≥20 AND Financial ≥50 | More detailed insights |
| **Tier 3** | Gold | Engagement ≥50 AND Financial ≥200, OR isWhale flag | VIP treatment, advanced analytics |
| **Tier 4** | Council of Hedge | Engagement ≥100 AND Financial ≥500, or manual override | Maximum exclusivity |

**Special:** Whales auto-qualify for Tier 3 (`whaleAutoTier3: true`). Tier can be manually overridden via `tierOverride`.

**Source:** `classification-config.js` lines 19-25, 71-81

---

## 3. States (Current Behavior Pattern)

**What they are:** The player's current behavioral mode, which can change over time.

| State | Description | Detection Criteria |
|-------|-------------|-------------------|
| **CURIOUS** | Early-stage, asking basic questions | Default for low-activity players |
| **OPTIMIZING** | Focused on ROI/yields | ≥3 messages containing yield keywords (garden, pool, apr, stake, etc.) |
| **EXPANDING** | Growing their portfolio | >5 heroes OR >2 LP positions AND ≥5 messages in 7 days |
| **COMMITTED** | Consistent long-term player | retentionScore ≥60 |
| **EXTRACTING** | Extractor flag triggered | isExtractor flag = true |

**Source:** `classification-config.js` lines 30-36, 84-90, `classification-engine.js` lines 282-317

---

## 4. Behavior Tags (Inferred Traits)

**What they are:** Personality/style tags inferred from message content and wallet data. Players can have multiple tags.

| Tag | Description | Detection Method |
|-----|-------------|------------------|
| **NEWCOMER** | Recently joined | ≤14 days since first seen |
| **VETERAN** | Long-time player | ≥90 days since first seen |
| **WHALE** | Large holdings | Total value ≥$10,000 |
| **SCHOLAR** | Asks detailed "why/how" questions | ≥5 messages with: explain, why, how does, mechanics, formula |
| **LORE_LOVER** | Interested in story/roleplay | ≥3 messages with: story, lore, character, npc, gaia, realm |
| **OPTIMIZER** | Focused on efficiency | ≥5 messages with: apr, yield, best, optimal, maximize, roi |
| **COLLECTOR** | Focuses on rare items | ≥3 messages with: rare, mythic, legendary, shiny, mutation |
| **DATA_SCIENTIST** | Wants raw data/formulas | ≥5 messages with: data, statistics, formula, probability |
| **SPEEDRUNNER** | Wants quick answers | Average message length ≤50 chars (with ≥5 messages) |
| **SOCIAL_PLAYER** | Very active in Discord | ≥20 messages in last 7 days |
| **SILENT_FARMER** | Low chat, high on-chain activity | ≤5 messages in 7d but has heroes |
| **MINIMALIST** | Few assets, long-term holder | 1-3 heroes, ≥30 days active |

**Source:** `classification-config.js` lines 41-54, 93-106, `classification-engine.js` lines 326-421

---

## 5. Flags (Boolean Markers)

**What they are:** Special flags for quick identification of key player types.

| Flag | Description | Trigger |
|------|-------------|---------|
| **isWhale** | Large portfolio holder | Total value ≥$10,000 |
| **isExtractor** | Farm & dump behavior | extractorScore ≥60 |
| **isHighPotential** | High engagement but low financial | Engagement ≥30 AND Financial <100 |

**Use case:** `isHighPotential` identifies engaged free users who are prime candidates for premium conversion.

**Source:** `classification-config.js` lines 140-145, `classification-engine.js` lines 431-463

---

## 6. KPIs (Key Performance Indicators)

**What they are:** Numeric scores that drive tier and state calculations.

### Engagement Score
Built from:
- Each Discord message: +1 point
- Each session start: +5 points
- Each advice followed: +10 points
- Each recommendation clicked: +3 points
- Each command used: +2 points

### Financial Score
Calculated from wallet snapshot:
```
heroCount × 50 +
totalLPValue × 0.1 +
jewelBalance × 0.5 +
crystalBalance × 0.3
```

### Retention Score
Calculated from activity patterns:
```
activeDays7d × 5 +
activeDays30d × 2 +
questingStreakDays × 3 +
consecutiveWeeksActive × 10
```

**Source:** `classification-config.js` lines 109-128, `classification-engine.js` lines 473-503

---

## 7. Classification Events

**What they are:** Events that trigger reclassification.

| Event Type | Trigger | Effect |
|------------|---------|--------|
| `WALLET_SCAN` | Wallet registration/update | Updates dfkSnapshot, recalculates financialScore |
| `DISCORD_MESSAGE` | Any message to bot | Increments engagement, stores message for behavior analysis |
| `SESSION_START` | New interaction session | +5 engagement points |
| `ADVICE_FOLLOWED` | User follows recommendation | +10 engagement points |
| `RECOMMENDATION_CLICKED` | User clicks link | +3 engagement points |
| `COMMAND_USED` | Slash command executed | +2 engagement points |
| `SUBSCRIPTION_UPGRADE` | Premium purchase | Sets tierOverride |
| `RETENTION_UPDATE` | Daily retention check | Recalculates retentionScore |

**Source:** `classification-engine.js` lines 73-160

---

## 8. Persona Adaptation

**What it does:** Modifies Hedge's AI responses based on the player's classification.

### By Archetype:
- **GUEST**: Welcoming, simple language, encourages wallet connection
- **ADVENTURER**: Teases optimizations, encourages progression
- **PLAYER**: References their specific assets, provides detailed analytics
- **INVESTOR**: Strips roleplay, focuses on yields/APRs, analytical tone
- **EXTRACTOR**: Minimal responses, no optimization secrets or upsells

### By Tier:
- **Tier 3+**: VIP treatment, advanced insights offered
- **Tier 4**: "Council of Hedge" greeting, maximum exclusivity
- **Tier 0-1**: Occasional soft upsells for premium

### By Behavior Tags:
- **LORE_LOVER**: Enhanced roleplay content (*adjusts monocle*)
- **DATA_SCIENTIST**: Offers raw numbers/breakdowns
- **SPEEDRUNNER**: Condensed responses, removes roleplay
- **SCHOLAR**: Adds explanations, offers to elaborate
- **WHALE**: Priority language, respectful suggestions

**Source:** `hedge-persona-adapter.js`

---

## 9. Data Storage

Player profiles are stored in the `players` PostgreSQL table with fields:
- `archetype`, `tier`, `state` (classifications)
- `behaviorTags` (JSONB array)
- `kpis` (JSONB object with scores)
- `dfkSnapshot` (JSONB object with wallet data)
- `flags` (JSONB object with boolean flags)
- `recentMessages` (JSONB array, last 50 messages)
- `extractorScore` (integer 0-100)
- `tierOverride` (nullable integer for manual tier)

---

## 10. Future Expansion Opportunities

1. **Bridge Extractor Integration**: Connect `isExtractor` flag to bridge flow analysis (wallets extracting more value than contributing)
2. **Progression Tracking**: Compare historical snapshots to detect EXPANDING state more accurately
3. **Guild/Alliance Tags**: Classify by social group membership
4. **Premium Feature Usage**: Track which premium features different segments use most
5. **Churn Prediction**: Use KPI decline patterns to identify at-risk users
6. **Cross-realm Classification**: Track players across Serendale/Crystalvale

---

## Key Source Files

| File | Purpose |
|------|---------|
| `classification-config.js` | All thresholds, enums, and message patterns |
| `classification-engine.js` | Core logic for determining archetypes, tiers, states, tags, flags |
| `hedge-persona-adapter.js` | Adapts AI responses based on classification |
| `player-profile-service.js` | Database CRUD and event processing |

---

This system creates a complete picture of each player and enables highly personalized interactions that feel natural rather than robotic.
