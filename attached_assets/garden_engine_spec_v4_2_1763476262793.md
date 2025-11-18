# 🌱 GARDEN ENGINE — FULL SPECIFICATION (v4.2 FINAL)

**Last Updated:** 2025-11  
**Authoritative Comprehensive Specification for All Garden Features in Hedge Ledger**

This version updates prior versions by clarifying that:
- Gardening Skill typically falls in the ~0–30 range due to the level cap,
- BUT MUST NEVER BE HARD-CAPPED OR CLAMPED,
- The optimizer must always use the real value from GraphQL/on-chain.

(Everything else remains identical to v4.1 and is fully merged here.)

---

# 0. DESIGN GOAL

The Garden Engine should:
- Help users understand gardens and IL (Free features)
- Show users *their current* yields and weaknesses (Tier 1)
- Optimize their gardens for maximum JEWEL/CRYSTAL (Tier 2)
- Use a friendly, NPC-style DM flow with an explicit menu
- Be deterministic, predictable, and safe
- Integrate cleanly with existing payment & monitoring
- Not interfere with simple APR-only queries

---

# 1. DM GARDEN MENU (ENTRY POINT)

Hedge shows the Garden Menu when the user mentions gardens in general without clearly asking for APRs or optimization:

```text
🌿 I can help you with your Gardens! Choose an option:

1 — Gardens Walkthrough (Free Unlimited)
2 — Understand Impermanent Loss (Free Unlimited)
3 — View Crystalvale APRs (Free once per day, then 1 JEWEL per additional use)
4 — Show Your Pools & Current Yield (Premium Tier 1 — 2 JEWEL)
5 — Optimize Your Gardens (Premium Tier 2 — 25 JEWEL)
```

---

# 2. INTENT MAPPING

| Option | Intent Name                | Cost                                     | Description                             |
|--------|----------------------------|------------------------------------------|-----------------------------------------|
| 1      | garden_walkthrough         | Free                                     | Gardens tutorial                        |
| 2      | garden_IL                  | Free                                     | Impermanent loss explanation            |
| 3      | garden_aprs                | Free once/day, +1 JEWEL afterwards       | Crystalvale APR list                    |
| 4      | garden_insights_tier1      | 2 JEWEL                                  | “Before State” for user’s gardens       |
| 5      | garden_optimization_tier2  | 25 JEWEL                                 | Full optimization (Before/After/Future) |

Additional intents:
```
garden_menu
garden_walkthrough
garden_IL
garden_aprs
garden_insights_tier1
garden_optimization_tier2
```

---

# 3. PRICING & ENTITLEMENTS

(Identical to v4.1, unchanged.)

---

# 4. POOL-CACHE BEHAVIOR (APR DATA FRESHNESS)

(Identical to v4.1, unchanged.)

---

# 5. DATA SOURCES (HEROES, PETS, POOLS)

Gardening Skill Clarification:

### Gardening Skill Range (IMPORTANT UPDATE v4.2)
- Because heroes are capped at **Level 20**, Gardening Skill values typically fall in the **0–30 range**.
- HOWEVER:
  - **The engine must NEVER clamp, cap, or artificially limit Gardening Skill.**
  - If a hero legitimately has `GrdSkl = 31`, they must be treated as strictly better than `GrdSkl = 30`.
  - All comparisons, rankings, sorting, and scoring must use the **raw value** from GraphQL/on-chain.
- The “0–30 typical range” is only for expectation, not for logic.

---

# 6. DFK GARDENING FORMULA (CANONICAL)

(Identical to v4.1. No changes required.)

---

# 7. STAMINA OPTIMIZATION ENGINE (v2.4)

(Identical to v4.1. No changes required.)

---

# 8. EXPEDITION MODEL

(Identical to v4.1. No changes required.)

---

# 9. HERO QUERY LIMITS & PERFORMANCE (UPDATED v4.2)

This section has been updated for Gardening Skill clarification.

## 9.1 Prefiltering Rules

Heroes must be included in garden analysis if ANY of the following are true:

1. Gardening is their main profession.
2. Gardening profession gene present.
3. Gardening Skill (GrdSkl) ≥ **5** (threshold remains).
4. Stat-based potential: `WIS + VIT >= 100`.
5. Pet synergy: hero is linked to or likely to match a gardening pet.

### NEW v4.2 Clarification:
- Gardening Skill is usually in the 0–30 range,
- BUT DO NOT CAP OR CLAMP IT.
- Always use real values in:
  - prefiltering,
  - hero scoring,
  - comparisons,
  - assignments,
  - optimization.

## 9.2 Soft Cap (60 Heroes)

Same logic as v4.1:
- If more than ~60 heroes match prefilters:
  - Compute `gardeningScore = WIS + VIT + (GrdSkl * 10) + (geneBonus * 50)`
  - DO NOT cap GrdSkl in this calculation.
  - Use top 60 heroes.

## 9.3 Timeouts

Same as before:
- Total fetch time should not exceed ~15 seconds before fallback.

---

# 10. TIER 1 (INSIGHTS — 2 JEWEL)

(Identical to v4.1 except for NOT clamping GrdSkl.)

---

# 11. TIER 2 (OPTIMIZATION — 25 JEWEL)

(Identical to v4.1. Optimization uses raw GrdSkl values.)

---

# 12. OPTIMIZATION FLOW

(Identical to v4.1 with the following note added:)

### NEW v4.2 Rule:
In all matrix computations, use:

```text
hero.GrdSkl_raw = valueFromChain
```

NOT:

```text
min(hero.GrdSkl_raw, 30)   # ❌ NEVER DO THIS
```

---

# 13. RAPID RENEWAL SIMULATION

(Identical to v4.1.)

---

# 14. ACTION STEPS & IN-GAME EXECUTION

(Identical to v4.1.)

---

# 15. INEFFICIENCY DETECTION RULES

(Identical to v4.1; unaffected by GrdSkl.)

---

# 16. DATABASE ADDITIONS

(Identical to v4.1.)

---

# 17. ERROR HANDLING

(Identical to v4.1.)

---

# 18. IMPLEMENTATION MODULES

(Identical to v4.1.)

---

# END OF GARDEN ENGINE SPEC v4.2 FINAL
