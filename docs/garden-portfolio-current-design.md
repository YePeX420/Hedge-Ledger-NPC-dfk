# Garden Portfolio Current - Basis of Design Document

## 1. Purpose & Overview

### 1.1 What It Does
The `/garden-portfolio-current` command provides a real-time snapshot of a wallet's current DeFi Kingdoms gardening operations. It analyzes active gardening expeditions, calculates expected yields, and presents the data in a Discord embed format.

### 1.2 Role in Hedge Ledger
This tool serves as the primary "what am I currently earning?" view for DFK players. Unlike optimization tools that suggest changes, this command reports the actual current state of gardening operations with accurate yield projections based on live blockchain data.

### 1.3 Key Features
- Detects all active gardening expeditions across multiple pools
- Shows per-pool position values, LP share, and daily yields
- Displays hero assignments with Rapid Renewal [RR] markers
- Uses actual expedition cycle times for accurate runs/day calculations
- Aggregates portfolio-wide totals (daily/weekly/monthly in tokens and USD)

---

## 2. Input Parameters

### 2.1 Command Options

| Option | Type | Required | Default | Description |
|--------|------|----------|---------|-------------|
| `wallet` | String | Yes | - | Wallet address (0x format or checksum) |
| `stamina` | Integer | No | 25 | Fallback stamina value when expedition data lacks attempts |

### 2.2 Chain Configuration
- Fixed to DFK Chain (Crystalvale)
- RPC: `https://subnets.avax.network/defi-kingdoms/dfk-chain/rpc`

---

## 3. Data Flow

### 3.1 High-Level Process

```
Command Invoked
      │
      ▼
┌─────────────────────────────────────────────────────────────┐
│  PARALLEL DATA FETCHING                                      │
│  ├── Fetch wallet heroes (GraphQL + RPC)                    │
│  ├── Fetch wallet pets (PetCore contract)                   │
│  ├── Fetch expedition pairs (QuestCoreV3)                   │
│  ├── Fetch Rapid Renewal hero IDs (PowerUpManager)          │
│  ├── Fetch Quest Reward Fund balances (ERC20)               │
│  ├── Fetch token prices (Price Graph)                       │
│  └── Fetch pool analytics (Pool Cache)                      │
└─────────────────────────────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────────────────────────────┐
│  DATA PROCESSING                                             │
│  ├── Build hero lookup map (handles ID normalization)       │
│  ├── Build pet lookup map                                   │
│  ├── Normalize RR hero IDs and build RR map                 │
│  └── Match gardening heroes to expedition pairs             │
└─────────────────────────────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────────────────────────────┐
│  YIELD CALCULATIONS (per pool)                               │
│  ├── Calculate LP share (user staked / total staked)        │
│  ├── For each pair:                                         │
│  │   ├── Build hero data (heroFactor, pet bonus, RR)        │
│  │   ├── Calculate runsPerDay from iterationTime            │
│  │   ├── Calculate per-run yields (CRYSTAL + JEWEL)         │
│  │   └── Calculate daily yields (per-run × runsPerDay)      │
│  ├── Sum pool totals                                        │
│  └── Calculate Quest APR                                    │
└─────────────────────────────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────────────────────────────┐
│  OUTPUT GENERATION                                           │
│  ├── Build Discord Embed with pool summaries                │
│  ├── Add hero/pet assignment details                        │
│  └── Add portfolio totals                                   │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 Step-by-Step Process

1. **Command Invocation**: User runs `/garden-portfolio-current wallet:<address>`
2. **Price Fetching**: Build price graph for CRYSTAL, JEWEL, and LP tokens
3. **Reward Fund Query**: Fetch live CRYSTAL and JEWEL balances from Quest Reward Fund contract
4. **Hero Fetching**: Query all heroes owned by wallet via GraphQL API
5. **Pet Fetching**: Query all pets via PetCore contract's `getUserPetsV2()`
6. **Expedition Detection**: Fetch active expeditions via `getExpeditionPairs()` which:
   - Calls `getAccountExpeditionsWithAssociatedQuests()` on QuestCoreV3
   - Filters for gardening expeditions (questType 3-12 with 2 heroes)
   - Extracts poolId, heroIds, attempts, iterationTime
7. **RR Detection**: Fetch all RR hero IDs via `getRapidRenewalHeroIds()` and normalize
8. **LP Position Fetching**: Query user's staked LP amounts per pool
9. **Pool Data Fetching**: Get TVL, allocation %, and total staked from pool cache
10. **Yield Calculation**: For each pool with gardening pairs, calculate yields
11. **Embed Generation**: Format results into Discord embed

---

## 4. External Data Sources

### 4.1 Blockchain Contracts

| Contract | Address | Purpose |
|----------|---------|---------|
| QuestCoreV3 | `0x530fff22987E137e7C8D2aDcC4c15eb45b4FA752` | Expedition/quest data |
| PowerUpManagerDiamond | `0xc20a268bc7c4dB28f1f6e1703676513Db06C1B93` | Rapid Renewal detection |
| Quest Reward Fund | `0x1137643FE14b032966a59Acd68EBf3c1271Df316` | CRYSTAL/JEWEL reward pools |
| PetCore | `0x6362b205b539afb5FC369277365441c1dC6fAa28` | Pet data |
| MasterGardener | `0x57Dec9cC7f492d6583c773e2E7ad66dcDc6940Fb` | Garden pool staking data |

### 4.2 APIs

| Source | Endpoint | Data Retrieved |
|--------|----------|----------------|
| DFK GraphQL | `https://api.defikingdoms.com/graphql` | Hero attributes, wallet ownership |
| DFK RPC | `https://subnets.avax.network/defi-kingdoms/dfk-chain/rpc` | Contract calls |

### 4.3 Internal Services

| Service | File | Purpose |
|---------|------|---------|
| Pool Cache | `pool-cache.js` | Cached pool analytics (TVL, alloc %) |
| Price Feed | `price-feed.js` | Token prices from on-chain LP pairs |
| Hero Pairing | `hero-pairing.js` | Expedition detection and pair grouping |
| Rapid Renewal | `rapid-renewal-service.js` | RR power-up detection |
| Pet Data | `pet-data.js` | Pet attributes and bonuses |
| Quest Reward Fund | `quest-reward-fund.js` | Live reward pool balances |

---

## 5. Key Calculations

### 5.1 Hero Factor Formula

The hero factor determines a hero's gardening effectiveness:

```
heroFactor = 0.1 + (WIS + VIT) / 1222.22 + GrdSkl / 244.44
```

Where:
- `WIS` = Hero's Wisdom stat
- `VIT` = Hero's Vitality stat
- `GrdSkl` = Gardening skill / 10 (raw skill value divided by 10)

**Example**: Hero with WIS=50, VIT=60, Gardening=150
```
heroFactor = 0.1 + (50 + 60) / 1222.22 + (150/10) / 244.44
           = 0.1 + 0.09 + 0.061
           = 0.251
```

### 5.2 Pet Bonus Mechanics

Pets with eggType=2 (gardening pets) provide bonuses:

#### Power Surge (bonusIds: 90, 170)
- Multiplies final yield by `(1 + scalar/100)`
- Applied as `petMultiplier` after heroFactor calculation

```javascript
petMultiplier = 1 + (pet.gatheringBonusScalar / 100)
```

#### Skilled Greenskeeper (bonusIds: 7, 86, 166)
- Adds to gardening skill before heroFactor calculation
- Applied as additional gardening skill

```javascript
additionalGrdSkill = pet.gatheringBonusScalar / 10
heroFactor = 0.1 + (WIS + VIT) / 1222.22 + (GrdSkl + additionalGrdSkill) / 244.44
```

### 5.3 Divisor Calculation

The divisor depends on gardening gene and skill level:

```javascript
geneBonus = hasGardeningGene ? 1 : 0
rewardModBase = (gardeningSkill / 10) >= 10 ? 72 : 144
divisor = (300 - (50 * geneBonus)) * rewardModBase
```

| Gardening Gene | Skill >= 100 | Divisor |
|----------------|--------------|---------|
| Yes | Yes | 250 × 72 = 18,000 |
| Yes | No | 250 × 144 = 36,000 |
| No | Yes | 300 × 72 = 21,600 |
| No | No | 300 × 144 = 43,200 |

### 5.4 Per-Run Yield Formula

```javascript
crystalPerRun = (rewardFund.crystalPool × pool.allocDecimal × lpShare × heroFactor × petMultiplier × stamina) / divisor

jewelPerRun = (rewardFund.jewelPool × pool.allocDecimal × lpShare × heroFactor × petMultiplier × stamina) / divisor
```

Where:
- `rewardFund.crystalPool` = ~7.8M CRYSTAL (live from contract)
- `rewardFund.jewelPool` = ~600K JEWEL (live from contract)
- `pool.allocDecimal` = Pool's allocation % as decimal (e.g., 0.06 for 6%)
- `lpShare` = User's staked LP / Total pool staked LP
- `stamina` = Attempts per quest (from expedition data)

### 5.5 Runs Per Day Calculation

#### Primary Method: Use Expedition iterationTime (Preferred)

When expedition data includes `iterationTime` (in seconds):

```javascript
cycleMinutes = iterationTime / 60
runsPerDay = 1440 / cycleMinutes  // 1440 = minutes per day
```

**Example**: iterationTime = 19200 seconds (5.33 hours)
```
cycleMinutes = 19200 / 60 = 320 minutes
runsPerDay = 1440 / 320 = 4.5 runs/day
```

#### Fallback Method: Modeled Formula

When iterationTime is unavailable:

```javascript
questMinPerStam = hasGardeningGene ? 10 : 12
regenMinPerStam = hasRR ? Math.max(5, (1200 - heroLevel × 3) / 60) : 20
cycleMinutes = stamina × (questMinPerStam + regenMinPerStam)
runsPerDay = 1440 / cycleMinutes
```

**Why iterationTime is preferred**: The modeled formula estimates cycle time based on stamina and regen rates. However, the actual expedition `iterationTime` from the contract reflects the true cycle duration including all factors. Using this directly provides accurate runs/day calculations.

### 5.6 Pair Runs Per Day

For a hero pair, the limiting factor is the slower hero:

```javascript
pairRunsPerDay = Math.min(hero1.runsPerDay, hero2.runsPerDay)
```

With iterationTime, both heroes share the same cycle, so this is straightforward.

### 5.7 Daily Yield per Pair

```javascript
pairDailyCrystal = (hero1.crystalPerRun + hero2.crystalPerRun) × pairRunsPerDay
pairDailyJewel = (hero1.jewelPerRun + hero2.jewelPerRun) × pairRunsPerDay
```

### 5.8 Quest APR Calculation

```javascript
dailyUSD = dailyCrystal × crystalPrice + dailyJewel × jewelPrice
questAPR = (dailyUSD × 365 / positionUSD) × 100
```

Note: This is labeled "Quest APR" because it only accounts for gardening quest rewards, not LP farming rewards or impermanent loss.

---

## 6. Hero ID Normalization

### 6.1 The Problem

DFK uses different hero ID formats across systems:
- **Raw On-Chain IDs**: Include chain prefix (e.g., `2000000133347` for Crystalvale)
- **Normalized IDs**: Without prefix (e.g., `133347`)
- **String vs Number**: IDs may be strings or numbers depending on source

### 6.2 Chain Prefixes

| Chain | Prefix | Range |
|-------|--------|-------|
| Serendale (Harmony) | 1,000,000,000,000 | 1e12 |
| Crystalvale (DFK Chain) | 2,000,000,000,000 | 2e12 |

### 6.3 Normalization Function

```javascript
function normalizeHeroId(id) {
  const num = Number(id);
  if (num >= 2_000_000_000_000) return num - 2_000_000_000_000;
  if (num >= 1_000_000_000_000) return num - 1_000_000_000_000;
  return num;
}
```

### 6.4 Hero Map Strategy

The hero map stores each hero under multiple keys to ensure lookups work regardless of format:

```javascript
heroMap.set(normalizedIdNum, hero);      // 133347 (number)
heroMap.set(String(normalizedIdNum), hero); // "133347" (string)
heroMap.set(rawIdNum, hero);             // 2000000133347 (number)
heroMap.set(String(rawIdNum), hero);     // "2000000133347" (string)
heroMap.set(rawId, hero);                // Original format
```

### 6.5 Lookup Function

```javascript
function lookupHero(id) {
  return heroMap.get(id) || 
         heroMap.get(Number(id)) || 
         heroMap.get(String(id));
}
```

---

## 7. Rapid Renewal Detection

### 7.1 The Challenge

Rapid Renewal detection must match hero IDs correctly:
- PowerUpManagerDiamond returns **raw on-chain IDs** (with chain prefix)
- Expedition data provides **normalized IDs** (without prefix)
- Direct ID comparison fails due to format mismatch

### 7.2 Solution: Prefetch and Normalize

```javascript
// 1. Fetch all RR hero IDs from contract (returns raw IDs)
const rawRRHeroIds = await getRapidRenewalHeroIds(walletAddress);

// 2. Normalize all returned IDs
const normalizedRRSet = new Set();
for (const rawId of rawRRHeroIds) {
  const numId = Number(rawId);
  const normalizedId = numId >= 2_000_000_000_000 ? numId - 2_000_000_000_000 :
                       numId >= 1_000_000_000_000 ? numId - 1_000_000_000_000 : numId;
  normalizedRRSet.add(normalizedId);
  normalizedRRSet.add(String(normalizedId));
}

// 3. Check expedition hero IDs against normalized set
const hasRR = normalizedRRSet.has(Number(heroId)) || 
              normalizedRRSet.has(String(heroId));
```

### 7.3 Why This Works

- Single contract call (efficient)
- Normalizes contract-returned IDs to match expedition format
- Doesn't affect other ID handling in the system
- Robust matching with both number and string checks

### 7.4 RR Effect on Calculations

When a hero has RR:
- Stamina regen time is reduced: `regenSeconds = max(300, 1200 - heroLevel × 3)`
- This only affects the fallback modeled formula
- When using iterationTime, RR effect is already baked into the cycle time

---

## 8. Pool Processing Logic

### 8.1 Pool Detection

Gardening pools are identified by PID:

| PID | Pool Name | LP Token |
|-----|-----------|----------|
| 0 | xJEWEL-JEWEL | (excluded - staking, not gardening) |
| 1 | CRYSTAL-AVAX | 0x... |
| 2 | CRYSTAL-JEWEL | 0x... |
| 3 | CRYSTAL-USDC | 0x... |
| 5 | JEWEL-USDC | 0x... |
| 12 | JEWEL-ETH | 0x... |
| ... | ... | ... |

### 8.2 Processing Flow

```javascript
for (const [poolId, poolPairs] of Object.entries(gardeningPools)) {
  // 1. Get pool metadata
  const pool = pools.find(p => p.pid === poolId);
  
  // 2. Get user's LP position
  const userLPRaw = BigInt(position.stakedAmountRaw);
  const totalStakedRaw = BigInt(pool.totalStakedRaw);
  const lpShare = Number(userLPRaw) / Number(totalStakedRaw);
  
  // 3. Calculate position value
  const positionUSD = lpShare * pool.tvl;
  
  // 4. Process each pair
  for (const pairData of poolPairs) {
    // Get heroes, check RR, calculate yields
  }
  
  // 5. Aggregate pool totals
  poolResults.push({ pool, pairs, positionUSD, dailyCrystal, dailyJewel, apr });
}
```

### 8.3 Handling Pairs Without LP

If a pool has gardening pairs but no LP staked:
- Pairs are still shown in output (for visibility)
- Marked with "[NO LP STAKED]"
- Yields are not calculated (lpShare = 0)

---

## 9. Output Format

### 9.1 Discord Embed Structure

```
┌─────────────────────────────────────────────────────────────┐
│ Current Garden Portfolio                                     │
├─────────────────────────────────────────────────────────────┤
│ Wallet: 0x1a9f...4098                                       │
│ Heroes Gardening: 24 | Pairs: 12                            │
│                                                             │
│ CRYSTAL-JEWEL (PID 2)                                       │
│ Position: $16236 | Share: 15.38%                            │
│ Daily: 457.28 C + 35.23 J = $2.68                           │
│ Quest APR: 6.0% | Runs/day: 12.83                           │
│                                                             │
│ JEWEL-USDC (PID 5)                                          │
│ Position: $11956 | Share: 10.59%                            │
│ Daily: 308.29 C + 23.76 J = $1.81                           │
│ Quest APR: 5.5% | Runs/day: 10.95                           │
│                                                             │
│ ... (more pools)                                            │
│                                                             │
│ ---                                                         │
│ Portfolio Totals:                                           │
│ Daily: 1172.27 CRYSTAL + 90.33 JEWEL                        │
│ Daily USD: $6.87 | Weekly: $48.12 | Monthly: $206.23        │
├─────────────────────────────────────────────────────────────┤
│ Current Hero/Pet Assignments                                │
├─────────────────────────────────────────────────────────────┤
│ CRYSTAL-JEWEL (PID 2):                                      │
│   P1: #133347[RR] + #161286[RR] (10 stam, 4.65 runs/day)   │
│   P2: #184641 + #182639 (11 stam, 4.09 runs/day)           │
│   P3: #41746 + #85023[RR] (11 stam, 4.09 runs/day)         │
│                                                             │
│ ... (more pools)                                            │
└─────────────────────────────────────────────────────────────┘
```

### 9.2 Field Descriptions

| Field | Description |
|-------|-------------|
| Position | User's LP value in USD |
| Share | User's LP as % of total pool |
| Daily C/J | Daily CRYSTAL and JEWEL yield |
| Quest APR | Annualized gardening yield % |
| Runs/day | Total quest completions per day |
| [RR] | Hero has Rapid Renewal active |
| stam | Stamina (attempts) per quest |

---

## 10. Design Decisions & Rationale

### 10.1 Using iterationTime Over Modeled Formula

**Decision**: Prefer expedition `iterationTime` for runsPerDay calculations.

**Rationale**:
- The modeled formula estimates cycle time based on stamina and regen rates
- However, actual expedition cycles include additional factors not captured in the model
- iterationTime comes directly from the contract and reflects the true cycle duration
- Using iterationTime eliminates the inflated yields caused by underestimating cycle times

**Fallback**: When iterationTime is unavailable (rare edge cases), use the modeled formula.

### 10.2 Prefetching RR Set and Normalizing

**Decision**: Fetch all RR hero IDs once via `getRapidRenewalHeroIds()` and normalize them.

**Rationale**:
- Individual `isHeroRapidRenewalActive()` calls were failing due to ID format mismatch
- PowerUpManager expects raw on-chain IDs, but expedition data provides normalized IDs
- Prefetching once reduces RPC calls from N (per hero) to 1
- Normalizing the returned set allows matching against expedition hero IDs

**Preserves**: Other ID handling (hero lookups, pet lookups) remains unchanged.

### 10.3 Showing Pairs Without LP

**Decision**: Display gardening pairs even when no LP is staked in that pool.

**Rationale**:
- Provides visibility into all active gardening operations
- Helps users identify potential issues (e.g., heroes gardening but forgot to stake LP)
- Marked clearly with "[NO LP STAKED]" to avoid confusion

### 10.4 Quest APR vs Total APR

**Decision**: Label the APR as "Quest APR" explicitly.

**Rationale**:
- This APR only reflects gardening quest rewards
- Does not include LP farming rewards from MasterGardener
- Does not account for impermanent loss
- Clear labeling prevents user confusion about total returns

### 10.5 Default Stamina Fallback

**Decision**: Use stamina=25 as fallback when expedition data lacks attempts.

**Rationale**:
- Most gardening expeditions use 10-25 stamina
- 25 is a reasonable middle ground
- User can override via command parameter if needed

### 10.6 Excluding PID 0

**Decision**: Exclude PID 0 (xJEWEL-JEWEL) from gardening pools.

**Rationale**:
- PID 0 is for staking xJEWEL, not gardening
- Gardening is not possible on PID 0
- Including it would cause incorrect data

---

## 11. Testing Checklist

When validating this command, verify:

- [ ] All gardening heroes show in output
- [ ] All heroes with RR show [RR] marker
- [ ] iterationTime is used (check logs for "Using expedition iterationTime")
- [ ] Runs/day values are reasonable (typically 1-5 for 10-25 stamina)
- [ ] Yields decrease when using 10 stamina vs 25 stamina
- [ ] Pool positions match actual staked amounts
- [ ] Prices are current (not stale cache)
- [ ] Quest APR calculation is correct: (dailyUSD × 365 / positionUSD) × 100

---

## 12. Related Files

| File | Purpose |
|------|---------|
| `commands/garden-portfolio-current.js` | Main command implementation |
| `hero-pairing.js` | Expedition detection and pair grouping |
| `rapid-renewal-service.js` | RR power-up detection |
| `hero-yield-model.js` | Yield formulas (reference, not used directly) |
| `pool-cache.js` | Pool analytics caching |
| `quest-reward-fund.js` | Reward pool balance fetching |
| `price-feed.js` | Token price graph |
| `pet-data.js` | Pet attribute fetching |
| `garden-pairs.js` | Pool ID decoding from quest data |
| `onchain-data.js` | Hero and LP position fetching |

---

## 13. Version History

| Date | Change |
|------|--------|
| 2025-12-05 | Fixed RR detection using normalized ID matching |
| 2025-12-05 | Fixed runsPerDay to use expedition iterationTime |
| 2025-12-05 | Added per-pair stamina and runs/day display |
| 2025-12-05 | Renamed APR to Quest APR |
| 2025-12-05 | Initial design document created |
