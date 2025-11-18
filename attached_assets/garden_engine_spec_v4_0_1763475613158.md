# 🌱 GARDEN ENGINE — FULL SPECIFICATION (v4.0 FINAL)

**Last Updated:** 2025-11  
**Authoritative Comprehensive Specification for All Garden Features in Hedge Ledger**

This file consolidates:
- Free features
- Premium Tier 1 (2 JEWEL)
- Premium Tier 2 (25 JEWEL)
- DM Garden Menu system
- Intent parsing & routing
- Natural language triggers
- Expedition engine
- DFK gardening formulas
- Stamina optimization
- Rapid Renewal simulation
- Before/After/Future yield logic
- Inefficiency detection
- Error handling
- DB additions
- Payment flow
- All clarifications from Replit feedback

---

# 0. DESIGN GOAL

The Garden Engine should:
- Help any user understand gardens (Free features)
- Show the user *their* current yields (Premium Tier 1)
- Optimize their gardens for maximum JEWEL/CRYSTAL (Premium Tier 2)
- Provide a guided, NPC-style UX via DM
- Be fully extensible and deterministic
- Integrate with existing payment & tracking systems
- Never interfere with APR-only queries

---

# 1. DM GARDEN MENU (ENTRY POINT)

Hedge shows the Garden Menu when a user references gardens but NOT explicitly optimization:

```
🌿 I can help you with your Gardens! Choose an option:

1 — Gardens Walkthrough (Free Unlimited)
2 — Understand Impermanent Loss (Free Unlimited)
3 — View Crystalvale APRs (Free once per day, then 1 JEWEL per additional use)
4 — Show Your Pools & Current Yield (Premium Tier 1 — 2 JEWEL)
5 — Optimize Your Gardens (Premium Tier 2 — 25 JEWEL)
```

## Trigger Keywords
garden, gardens, expedition, yield, lp yield, gardening help, explain gardens,  
what am I earning, show my gardens, farming jewel, farming crystal

## Routing Exceptions
Skip menu if user says:

### Direct to Optimization (Tier 2)
“optimize”, “best setup”, “maximize”, “fix my gardeners”

### Direct to APR Listing
“APRs?”, “rates today?”, “garden APRs”, “APR now”

---

# 2. INTENT MAPPING

| Option | Intent | Cost | Notes |
|--------|--------|-------|-------|
| 1 | garden_walkthrough | Free | Tutorial |
| 2 | garden_IL | Free | IL explanation |
| 3 | garden_aprs | Free once/day, then 1 JEWEL | Uses pool-cache |
| 4 | garden_insights_tier1 | 2 JEWEL | “Before State” |
| 5 | garden_optimization_tier2 | 25 JEWEL | Full optimization |

New intents added to parser:
```
garden_menu
garden_walkthrough
garden_IL
garden_aprs
garden_insights_tier1
garden_optimization_tier2
```

---

# 3. PAYMENT RULES

## Option 3 — Crystalvale APRs
- First APR lookup **per UTC-day** = FREE
- After that = **1 JEWEL** per lookup  
- DB field needed:
  ```
  players.lastGardenAPRCheckDate (TEXT YYYY-MM-DD)
  ```

## Tier 1 — Garden Insights
- **Cost = 2 JEWEL**
- Uses payment flow identical to other premium services
- Shows Before State only

## Tier 2 — Full Garden Optimization
- **Cost = 25 JEWEL**
- Uses existing optimization-processor flow

Payment window for Tier1/Tier2:
```
expiresIn = 2 hours
```

---

# 4. DATA SOURCES

## Heroes
Pulled from DFK GraphQL:
- Stats (WIS, VIT, AGI, LCK, etc.)
- Gardening skill (profession level)
- Gardening gene
- Stamina max
- Stamina current (for inefficiency)
- Owner wallet

## Pets
From PetCore (CV + SD):
- Profession bonuses
- Boost values (% or flat)
- Gardening compatibility

## Pools (Crystalvale)
From **pool-cache.js**:
- feeAPR
- distributionAPR
- allocation weights
- rewardPool balances (JEWEL + CRYSTAL)
- lpUSDValue
- lpShare

Reward Fund:
```
0x1137643FE14b032966a59Acd68EBf3c1271Df316
```

---

# 5. DFK GARDENING FORMULA (CANONICAL)

For each hero **per stamina**:

```
earnRate =
 (rewardPoolBalance * poolAllocation * LPowned *
   (0.1 + (WIS+VIT)/1222.22 + GrdSkl/244.44))
 / ((300 - (50*geneBonus)) * rewardModBase)
```

Where:
- rewardModBase = 144 (skill0) or 72 (skill10)
- geneBonus = 1 or 0  
- minimum = 0.0002 tokens/stamina (if ≥420k poolBalance)
- jackpot EV:
  - +0.1 tokens @ 9.9%
  - +1 token @ 0.1%
  (halved if no gene, requires ≥950k poolBalance)

Compute separately for:
- **JEWEL earnRate**
- **CRYSTAL earnRate**

---

# 6. STAMINA OPTIMIZATION ENGINE (v2.4)

Universal sweetspot:
```
IdealStaminaThreshold = 5 stamina
```

Justification:
- Gardening cycle = 5 stamina  
- Regen = 3 stamina/hour  
- Waiting wastes regen time  
- Highest yield/hour = shortest cycle frequency  

### Tier 1 Behavior
- Only detect inefficiency
- Flag heroes with >5 stamina frequently

### Tier 2 Behavior
- Model all heroes as if they always quest at 5 stamina
- Compute cycles/day:
  ```
  cyclesPerDay = staminaRegenPerDay / 5
  ```

---

# 7. EXPEDITION MODEL

Each pool supports:
- **3 expedition slots**
- Each slot contains:
  - 1 JEWEL gardener
  - 1 CRYSTAL gardener
  - 1 optional pet  

Max per pool:
- 6 heroes
- 3 pets

Expeditions simulate 5-stamina cycles continuously.

---

# 8. OPTIMIZATION FLOW (TIER 2)

## Step 1 — Collect Hero Data
Compute:
- base yield/stamina JEWEL
- base yield/stamina CRYSTAL
- jackpot EV
- stamina regen
- gardening gene multiplier
- gardening skill

## Step 2 — Matrices
```
HeroPoolMatrix[hero][pool][token]
PetHeroMatrix[pet][hero]
```

## Step 3 — Rank Pools
By:
- lpUSDValue
- rewardPool strength
- allocation weight

## Step 4 — Fill Expedition Slots
For each pool (max 3 slots):

1. Choose best JEWEL gardener  
2. Choose best CRYSTAL gardener  
3. Select best pet for highest boost  
4. Remove assigned heroes/pets from candidate list

## Step 5 — questAPR_after
```
questAPR_after = optimizedTokenYieldUSD / lpUSDValue
```
TotalAPR_after = feeAPR + distributionAPR + questAPR_after

## Step 6 — Rapid Renewal Simulation
If user lacks RR:
```
yield_RR = yield_after * (1 + RR%)
paybackDays = RRcostUSD / extraDailyYieldUSD
```

RR = 50 JEWEL locked for 30 days.

---

# 9. TIER 1 OUTPUT (2 JEWEL)

Tier 1 must show:
- LP pools
- feeAPR + distributionAPR
- user’s **questAPR_before**
- JEWEL/week + CRYSTAL/week
- hero/pet contributions
- stamina inefficiency warnings
- missing gardeners/pets
- misplaced gardeners detection
- empty expedition slot warnings

**No optimization.  
No After State.  
No RR simulation.**

---

# 10. TIER 2 OUTPUT (25 JEWEL)

Shows:

## BEFORE (same as Tier 1)

## AFTER
- Optimized gardener assignment  
- 3 slots × 2 gardeners  
- Pet assignments  
- JEWEL/week_after  
- CRYSTAL/week_after  
- questAPR_after  
- TotalAPR comparison  

## STAMINA TABLE
For each hero:
```
HeroID | MaxStamina | IdealTrigger=5 | Notes
```

## RAPID RENEWAL (if user does not have it)
- futureState JEWEL/week  
- futureState CRYSTAL/week  
- APR_RR  
- RR cost (50 JEWEL)  
- payback time  

## ACTION STEPS
Simple instructions, per slot:
```
Pool 5 Expedition Slot 1:
  JEWEL farmer: Hero ###
  CRYSTAL farmer: Hero ###
  Pet: ###
```

---

# 11. INEFFICIENCY DETECTION (Tier 1)

Trigger if ANY:

### A) Stamina >5 on >50% of gardeners  
### B) Empty expedition slots  
### C) Only JEWEL or only CRYSTAL gardeners in a slot  
### D) No pets assigned even though user owns compatible ones  
### E) High-skill gardeners in low-emission pools  
### F) Low-skill gardeners in high-emission pools  

Warnings formatted:
```
⚠ Inefficiency detected: Hero #12345 regularly quests at 20+ stamina.
```

---

# 12. DATABASE ADDITIONS

### Required:
```
players.lastGardenAPRCheckDate  TEXT
```

### Optional (recommended):
```
garden_insights_cache (
  playerId INT,
  payload JSON,
  calculatedAt TIMESTAMP,
  expiresAt TIMESTAMP
)
```

---

# 13. ERROR HANDLING

### No LP staked:
“You don't have any LP tokens staked in Crystalvale Gardens.”

### No gardening-suitable heroes:
“None of your heroes have meaningful gardening stats.”

### Missing pool-cache:
“APR data unavailable — try again in a few minutes.”

### Payment expired:
“Payment window expired. Ask again if you'd like to retry.”

---

# 14. INTENT PARSER & ROUTER

## Triggers for Option 3 directly:
apr, apr?, aprs, rates today, garden apr, apr now

## Triggers for Tier 2 directly:
optimize, maximize, best setup, fix my gardeners

## Routing Table:

| Intent | Module |
|--------|--------|
| garden_menu | show menu |
| garden_walkthrough | knowledge/gardens.md |
| garden_IL | knowledge/impermanent_loss.md |
| garden_aprs | pool-cache APR list |
| garden_insights_tier1 | insights-processor.js |
| garden_optimization_tier2 | optimization-processor.js |

---

# END OF GARDEN ENGINE SPEC v4.0 FINAL
