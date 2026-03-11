# DFK Pet Combat Bonus System
GPT reference — how to read, decode, and apply pet combat bonuses.

---

## 1. On-chain fields

Every pet has two relevant fields:

| Field | Type | Meaning |
|-------|------|---------|
| `combatBonus` | uint (integer) | Encodes both the skill type AND the star tier in a single number |
| `combatBonusScalar` | uint (integer) | Magnitude of the bonus; divide by 10,000 to get decimal fraction |

---

## 2. Decoding `combatBonus` (rawId)

The same skill exists in three star tiers. The rawId encodes both:

| rawId range | Star tier | Base code formula |
|-------------|-----------|------------------|
| 1 – 79      | ★ (1-star) | `base = rawId` |
| 80 – 158    | ★★ (2-star) | `base = rawId - 79` |
| 160+        | ★★★ (3-star) | `base = rawId - 159` |

Example: `combatBonus = 185`
- 185 ≥ 160 → 3-star
- base = 185 − 159 = **26** → "Blur" (speed bonus), 3 stars

---

## 3. Decoding `combatBonusScalar`

```
bonusValue = combatBonusScalar / 10,000
```

Example: `combatBonusScalar = 10` → `bonusValue = 0.001` (0.1%)

The display label in-app is `(combatBonusScalar / 100).toFixed(1) + "%"`.
So scalar=10 displays as "+0.1%".

---

## 4. Complete base code → name table (codes 0–78)

| Code | Name | Code | Name | Code | Name |
|------|------|------|------|------|------|
| 0 | None | 27 | Divine Intervention | 54 | Cleansing Aura |
| 2 | Stone Hide | 28 | Rune Sniffer | 55 | Lick Wounds |
| 3 | Arcane Shell | 29 | Threaten | 56 | Rescuer |
| 4 | Recuperate | 30 | Hobble | 57 | Amplify |
| 5 | Magical Shell | 31 | Shock | 58 | Intercept |
| 6 | Heavy Hide | 32 | Bop | 59 | Conservative |
| 7 | Vorpal Soul | 33 | Hush | 60 | Scavenger |
| 8 | Sharpened Claws | 34 | Befuddle | 61 | Ultra Conservative |
| 9 | Attuned | 35 | Petrify | 62 | Reflector |
| 10 | Hard Head | 36 | Tug | 63 | Null Field |
| 11 | Harder Head | 37 | Gash | 64 | Brick Wall |
| 12 | Graceful | 38 | Infect | 65 | Purifying Aura |
| 13 | Diamond Hands | 39 | Gouge | 66 | Swift Cast |
| 14 | Impenetrable | 40 | Bruise | 67 | Total Recall |
| 15 | Resilient | 41 | Expose | 68 | Zoomy |
| 16 | Relentless | 42 | Flash | 69 | Skin of Teeth |
| 17 | Outspoken | 43 | Mystify | 70 | Rebalance |
| 18 | Lucid | 44 | Freeze | 71 | Guardian Shell |
| 19 | Brave | 45 | Char | 72 | Healing Bond |
| 20 | Confident | 46 | Good Eye | 73 | Foil |
| 21 | Inner Lids | 47 | Third Eye | 74 | Quicksand |
| 22 | Insulated | 48 | Omni Shell | 75 | Beastly Roar |
| 23 | Moist | 49 | Hardy Constitution | 76 | Maul |
| 24 | Studious | 50 | Vampiric | 77 | Thwack |
| 25 | Slippery | 51 | Meat Shield | 78 | Protective Coat |
| 26 | Blur | 52 | Super Meat Shield | | |
| | | 53 | Flow State | | |

---

## 5. Which stats each bonus affects

### A. Mapped to a combat stat (bonusValue applied directly)

| Base code | Pet name | Stat field affected | How applied |
|-----------|----------|---------------------|-------------|
| 2 | Stone Hide | `blkChance` | Added to total BLK (fraction) |
| 3 | Arcane Shell | `sblkChance` | Added to total SBLK (fraction) |
| 4 | Recuperate | `recoveryChance` | Added to total REC (fraction) |
| 5 | Magical Shell | `magicDefPct` | Multiplies base M.DEF |
| 6 | Heavy Hide | `physDefPct` | Multiplies base P.DEF |
| 7 | Vorpal Soul | `critStrikeChance` | Added to total CSC (fraction) |
| 8 | Sharpened Claws | `attackPct` | Multiplies physical Attack |
| 9 | Attuned | `spellPct` | Multiplies Spell Attack |
| 25 | Slippery | `evasion` | Added to total EVA (fraction) |
| 26 | Blur | `speed` | `round(bonusValue × profileSpeed)` added to SPEED |
| 27 | Divine Intervention | `critHealChance` | Added to total CHC (fraction) |
| 46 | Good Eye | `physAccuracy` | Additive P.ACC modifier |
| 47 | Third Eye | `magicAccuracy` | Additive M.ACC modifier |
| 48 | Omni Shell | both `physDefPct` + `magicDefPct` | Same bonusValue applied to both P.DEF and M.DEF scaling |
| 49 | Hardy Constitution | `statusEffectResistance` | Added to base SER (fraction) |
| 50 | Vampiric | `lifesteal` | Lifesteal fraction |
| 63 | Null Field | `magicDamageReduction` | M.RED modifier (additive %) |
| 64 | Brick Wall | `physDamageReduction` | P.RED modifier (additive %) |

### B. Display-only (specific status resist debuffs — do NOT affect global SER)

These pets proc a chance to resist a single specific status effect on the target.
They do NOT add to the hero's own SER stat.

| Base code | Pet name | Resist type |
|-----------|----------|-------------|
| 10 | Hard Head | Daze Resist |
| 11 | Harder Head | Stun Resist |
| 12 | Graceful | Push/Pull Resist |
| 13 | Diamond Hands | Disarm Resist |
| 14 | Impenetrable | Bleed Resist |
| 15 | Resilient | Poison Resist |
| 16 | Relentless | Slow Resist |
| 17 | Outspoken | Silence Resist |
| 18 | Lucid | Confuse Resist |
| 19 | Brave | Fear Resist |
| 20 | Confident | Intimidate Resist |
| 21 | Inner Lids | Blind Resist |
| 22 | Insulated | Chill Resist |
| 23 | Moist | Burn Resist |

### C. Non-combat / utility (no effect on combat stat calculations)

| Base code | Pet name | Effect |
|-----------|----------|--------|
| 24 | Studious | XP Bonus |
| 28 | Rune Sniffer | Rune Drop chance |
| 51 | Meat Shield | Barrier (self) |
| 52 | Super Meat Shield | Barrier (party) |
| 60 | Scavenger | Rare Loot chance |

### D. Combat effect pets — no numeric stat bonus (unmapped in current codebase)

These pets proc special combat effects but don't modify any tracked numeric stat.
Their `combatBonusScalar` represents proc chance, not a stat multiplier.

Examples: Threaten (29), Hobble (30), Shock (31), Bop (32), Hush (33),
Befuddle (34), Petrify (35), Tug (36), Gash (37), Infect (38), Gouge (39),
Bruise (40), Expose (41), Flash (42), Mystify (43), Freeze (44), Char (45),
Flow State (53), Cleansing Aura (54), Lick Wounds (55), Rescuer (56),
Amplify (57), Intercept (58), Conservative (59), Ultra Conservative (61),
Reflector (62), Purifying Aura (65), Swift Cast (66), Total Recall (67),
Zoomy (68), Skin of Teeth (69), Rebalance (70), Guardian Shell (71),
Healing Bond (72), Foil (73), Quicksand (74), Beastly Roar (75),
Maul (76), Thwack (77), Protective Coat (78).

---

## 6. Special case: Blur (speed)

Speed is the only bonus that is NOT a direct fractional addition. Formula:

```
petSpeedBonus = round( bonusValue × profileSpeed )
totalSpeed    = round(profileSpeed) + weaponSpeedMod + equipSpeedMod + petSpeedBonus
```

Where `profileSpeed = singleStatScore(AGI, level, Speed.coeff)` (result ~85–110 for typical Lv 10 heroes).

Because `bonusValue` from a ★★★ Blur with scalar=10 is only `0.001`,
`petSpeedBonus = round(0.001 × ~100) = round(0.1) = 0` — effectively zero for small scalars.

---

## 7. Special case: Omni Shell (physDefPct + magicDefPct)

```
bonusValue applied to both physDefPct and magicDefPct:
  effectivePDef += (rawPDef + pDefScaling) × bonusValue
  effectiveMDef += (rawMDef + mDefScaling) × bonusValue
```

---

## 8. Full decode example

```
hero.pet.combatBonus       = 185
hero.pet.combatBonusScalar = 10

step 1: 185 >= 160 → 3-star
step 2: base = 185 - 159 = 26 → "Blur"
step 3: bonusValue = 10 / 10,000 = 0.001
step 4: Blur → speed field
step 5: profileSpeed (AGI=25, Lv10) ≈ 100.71
        petSpeedBonus = round(0.001 × 100.71) = round(0.10071) = 0
        total SPEED contribution from pet = 0
```

---

## 9. Known gaps / open questions

| Issue | Detail |
|-------|--------|
| Codes 29–45, 53–79 (most combat-effect pets) | `combatBonusScalar` for these likely encodes proc % chance, not a stat fraction — mapping unknown |
| Rebalance (70) | Appears in tournament heroes; effect unknown |
| Blur scalar range | Observed values: scalar=0 (★★ +0.0%), scalar=10 (★★★ +0.1%). Is there a higher tier that adds meaningful speed? |
| physDefPct / magicDefPct application | Needs verification: is it `rawDef × (1 + pct)` or `totalDef × (1 + pct)`? |
