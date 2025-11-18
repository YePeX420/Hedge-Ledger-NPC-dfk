# GARDEN ENGINE — FULL SPECIFICATION (v3.2 FINAL)

**Last Updated:** 2025-11  
Authoritative source for all garden-related logic in Hedge Ledger.  
Includes free features, premium tiers, menu routing, expeditions, stamina modeling, yield formulas, and optimizer logic.

---

# 0. Overview

The Garden Engine powers all gardening interactions in Hedge:

- Free educational & APR features  
- Premium Tier 1 (2 JEWEL) Garden Insights  
- Premium Tier 2 (25 JEWEL) Full Optimization  
- Garden Menu user interface  
- Natural-language detection for DM mode  
- Expedition modeling (3 slots × 2 gardeners)  
- JEWEL + CRYSTAL yield formulas  
- Stamina-cycle optimization  
- Rapid Renewal simulation  
- Output formatting  
- Intent mapping  
- Payment integration  

---

# 1. Garden Menu (Entry Point)

Triggered when the user mentions general gardening terms without explicitly requesting optimization.

🌿 I can help you with your Gardens! Choose an option:

1 — Gardens Walkthrough (Free Unlimited)
2 — Understand Impermanent Loss (Free Unlimited)
3 — View Crystalvale APRs (Free once per day, then 1 JEWEL per additional use)
4 — Show Your Pools & Current Yield (Premium Tier 1 — 2 JEWEL)
5 — Optimize Your Gardens (Premium Tier 2 — 25 JEWEL)

### Trigger Keywords
garden, gardens, expedition, yield, gardening help, explain gardens, lp yield,  
what am I earning, best pools, show my gardens, farming jewel, farming crystal

### Immediate Routing Exceptions  
If user says:
- optimize, maximize, best setup, fix my gardeners → direct Tier 2  
- APRs?, rates today?, garden aprs → direct Option 3  

---

# 2. Intent Mapping

| Option | Intent Name | Cost | Description |
|--------|-------------|-------|-------------|
| 1 | garden_walkthrough | Free | Gardens tutorial |
| 2 | garden_IL | Free | Impermanent loss explanation |
| 3 | garden_aprs | Free once/day +1 JEWEL afterwards | Shows feeAPR + distributionAPR |
| 4 | garden_insights_tier1 | 2 JEWEL | "Before State" only |
| 5 | garden_optimization_tier2 | 25 JEWEL | Full optimization logic |

---

# 3. Pricing & Entitlements

## Option 1 — Gardens Walkthrough  
Free unlimited.

## Option 2 — Impermanent Loss  
Free unlimited.

## Option 3 — View Crystalvale APRs  
- FREE once per UTC day  
- After free use: cost = 1 JEWEL  
- Track last use date in DB  

## Option 4 — Show Your Pools & Current Yield (Tier 1)  
Cost: 2 JEWEL  
Includes:  
- LP detection  
- feeAPR + distributionAPR  
- expedition detection  
- questAPR_before  
- JEWEL/week + CRYSTAL/week  
- hero/pet contributions  
- stamina inefficiency warnings  

Excludes: optimization, future predictions.

## Option 5 — Optimize Your Gardens (Tier 2)  
Cost: 25 JEWEL  
Includes everything in Tier 1 + full optimization.

---

# 4. Pool Model

Each pool includes:
- feeAPR  
- distributionAPR  
- rewardPoolJEWEL  
- rewardPoolCRYSTAL  
- lpUSDValue  
- lpShare (LPowned)  
- allocationWeights  

Reward Fund Address (Crystalvale):  
0x1137643FE14b032966a59Acd68EBf3c1271Df316

---

# 5. DFK Gardening Formula (Official)

earnRate = 
 (rewardPoolBalance * poolAllocation * LPowned *
   (0.1 + (WIS+VIT)/1222.22 + GrdSkl/244.44))
 / ( (300 - (50*geneBonus)) * rewardModBase )

Where:
- WIS, VIT = hero stats  
- GrdSkl = gardening skill  
- geneBonus = 1 if gardening gene  
- rewardModBase = 144 (Skill0) or 72 (Skill10)  
- Minimum yield = 0.0002 tokens/stamina  
- Jackpot EV applies  

JEWEL and CRYSTAL computed separately.

---

# 6. Stamina Optimization (v2.4)

Universal rule:
IdealStaminaThreshold = 5 stamina

Used for:
- questAPR_after  
- expedition modeling  
- stamina recommendation tables  

Tier 1 uses stamina only to detect inefficiency.

---

# 7. Expedition Model

Each pool supports:  
- 3 Expedition Slots  
- Each slot = 2 gardeners (JEWEL + CRYSTAL)  
- Each slot = 1 optional pet  

Max per pool:
- 6 heroes  
- 3 pets  

Expeditions simulate continuous 5-stamina cycles.

---

# 8. Optimization Flow (Tier 2)

Step 1 — Gather heroes and compute:  
- WIS, VIT, gardening gene, GrdSkl  
- jackpot EV  
- stamina regen  
- JEWEL & CRYSTAL yield per stamina  

Step 2 — Build matrices:  
HeroPoolMatrix[hero][pool][token], PetHeroMatrix[pet][hero]

Step 3 — Rank pools  
Step 4 — Fill slots: best JEWEL farmer, best CRYSTAL farmer, best pet  
Step 5 — After State: questAPR_after  
Step 6 — Rapid Renewal simulation  

---

# 9. Rapid Renewal Simulation (Tier 2)

effectiveYield_RR = yield_after * (1 + RR%)  
paybackDays = costUSD / extraDailyYieldUSD  

Report includes:
- yield_before  
- yield_after  
- yield_with_RR  
- cost and payback time  

---

# 10. Output Formats

## Tier 1 (2 JEWEL)
- LP list  
- feeAPR + distributionAPR  
- questAPR_before  
- JEWEL/week + CRYSTAL/week  
- hero/pet table  
- inefficiency warnings  

## Tier 2 (25 JEWEL)
Includes Tier 1 +:  
- expedition assignments  
- JEWEL/week_after + CRYSTAL/week_after  
- stamina sweetspot table  
- RR simulation  
- action steps  

---

# 11. Intent Parser Integration

New intents:  
garden_menu  
garden_walkthrough  
garden_IL  
garden_aprs  
garden_insights_tier1  
garden_optimization_tier2

---

# 12. Router Mapping

| Intent | Module |
|--------|---------|
| garden_menu | Show menu |
| garden_walkthrough | knowledge/gardens.md |
| garden_IL | knowledge/impermanent_loss.md |
| garden_aprs | pool-cache |
| garden_insights_tier1 | insights-processor.js |
| garden_optimization_tier2 | optimization-processor.js |

---

# 13. Payment Logic

Tier 1 = 2 JEWEL  
Tier 2 = 25 JEWEL  

Option 3 free daily:  
If lastGardenAPRCheckDate != today → free  
Else → 1 JEWEL  

---

# END OF GARDEN ENGINE v3.2 FINAL
