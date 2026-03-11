# DFK Combat Stat Formulas
Hero #791530 example: Legendary Priest/Ninja, Lv 10
Stats: STR=10, DEX=12, AGI=25, INT=19, WIS=29, VIT=32, END=19, LCK=17

---

## Core Helper: singleStatScore

Used for: Speed, and the individual "Dynamic Score" per stat.

```
singleStatScore(statVal, level, coeff):
  raw = (A * statVal + B * level + C) / (D * level + E)
  if raw > dim:  raw = dim + (raw - dim) / 3     ← soft cap
  return raw
```

## Core Helper: doubleStatScore

Used for: BLK, SBLK, REC, SER, EVA.  Each uses two stats.

```
doubleStatScore(stat1, stat2, level, coeff):
  part1 = (A * stat1 + B * level + C) / (D * level + E)
  part2 = (F * stat2 + G * level + H) / (I * level + J)
  raw   = part1 + part2
  if raw > dim:  raw = dim + (raw - dim) / 3     ← soft cap
  return raw
```

## Coefficients

### singleStatScore coefficients

| Stat  | A      | B           | C           | D      | E       | dim   |
|-------|--------|-------------|-------------|--------|---------|-------|
| STR   | 0.115  | -0.020675   | -0.281925   | 2.245  | 24.995  | 0.10  |
| DEX   | 0.115  | -0.019425   | -0.428175   | 2.370  | 21.870  | 0.10  |
| AGI   | 0.115  | -0.020050   | -0.312550   | 2.3075 | 21.9325 | 0.10  |
| VIT   | 0.115  | -0.051925   | -0.425675   | 1.995  | 19.245  | 0.10  |
| END   | 0.115  | -0.036300   | -0.431300   | 2.120  | 20.120  | 0.10  |
| INT   | 0.115  | -0.003800   | -0.298800   | 2.495  | 24.745  | 0.10  |
| WIS   | 0.115  | -0.003800   | -0.298800   | 2.495  | 24.745  | 0.10  |
| LCK   | 0.115  | -0.014738   | -0.462738   | 2.120  | 19.1325 | 0.10  |
| Speed | 50.0   | 165.850     | 1523.350    | 2.3075 | 21.9325 | 120.0 |
| Crit  | 0.115  | -0.014738   | -0.462738   | 2.120  | 19.1325 | 0.10  |

### doubleStatScore coefficients (stat1 / stat2)

| Stat       | stat1 (A,B,C,D,E)                              | stat2 (F,G,H,I,J)                              | dim   |
|------------|------------------------------------------------|-------------------------------------------------|-------|
| EVA        | AGI  0.092 / -0.01604 / -0.25004 / 2.3075 / 21.9325 | LCK  0.023 / -0.002948 / -0.092548 / 2.12 / 19.1325 | 0.10 |
| BLK        | DEX  0.092 / -0.01554 / -0.34254 / 2.37 / 21.87     | LCK  0.023 / -0.002948 / -0.092548 / 2.12 / 19.1325 | 0.10 |
| SBLK       | INT  0.092 / -0.00304 / -0.23904 / 2.495 / 24.745   | LCK  0.023 / -0.002948 / -0.092548 / 2.12 / 19.1325 | 0.10 |
| REC        | VIT  0.072 / -0.02904 / -0.23304 / 1.995 / 19.245   | LCK  0.018 / -0.001385 / -0.064110 / 2.12 / 19.1325 | 0.075|
| SER        | END  0.126 / -0.04392 / -0.51192 / 2.12 / 20.12     | LCK  0.014 / -0.002255 / -0.060493 / 2.12 / 19.1325 | 0.12 |

---

## Stat-by-Stat Formulas

### P.DEF
```
pDef = armor.rawPhysDefense
     + min( (armor.physDefScalar / 100) * END,  armor.pDefScalarMax )
```
*Example #791530:* rawPDef=30, physDefScalar=90 (from Feather Duster 90/100 * END=19 = 17.1 → +17.1 → pDef ≈ 47.1 ... target 54.70*

---

### M.DEF
```
mDef = armor.rawMagicDefense
     + min( (armor.magicDefScalar / 100) * WIS,  armor.mDefScalarMax )
```

---

### P.RED  ⚠ KNOWN BUG
```
pRed = pDef / 10        ← CURRENT (wrong)
pRed = pDef / 5         ← CORRECT  (0.2% per pDef point, ceiling 500%)
```
Each point of P.DEF should grant 0.2% damage reduction, so divisor is 5.

---

### M.RED  ⚠ KNOWN BUG
```
mRed = mDef / 10        ← CURRENT (wrong)
mRed = mDef / 5         ← CORRECT  (0.2% per mDef point, ceiling 500%)
```

---

### BLK (Block Chance)
```
base     = doubleStatScore(DEX, LCK, level, Block.coeff)   → result is a fraction
weapon   = weapon.blkChanceScalar / 10_000    ← CURRENT (wrong; should be /1_000)
armor    = armor.blkChanceScalar  / 10_000
accessory= accessory.blkChanceScalar / 10_000
pet      = pet.blkChance                       (already a fraction)
passive  = passive1.blkBonus + passive2.blkBonus

totalBLK = base + weapon + armor + accessory + pet + passive
display  = totalBLK * 100  (show as %)
```

---

### SBLK (Spell Block Chance)
```
base     = doubleStatScore(INT, LCK, level, SpellBlock.coeff)
weapon   = weapon.sblkChanceScalar / 10_000    ← CURRENT (wrong; should be /1_000)
armor    = armor.sblkChanceScalar  / 10_000
accessory= accessory.sblkChanceScalar / 10_000
pet      = pet.sblkChance
passive  = passive1.sblkBonus + passive2.sblkBonus

totalSBLK = base + weapon + armor + accessory + pet + passive
```

---

### REC (Recovery Chance)
```
base      = doubleStatScore(VIT, LCK, level, Recovery.coeff)
weapon    = weapon.recoveryChanceScalar / 10_000    ← possibly wrong (same bug)
armor     = armor.recoveryChanceScalar  / 10_000    (code 41)
accessory = accessory.recoveryChanceScalar / 10_000
pet       = pet.recoveryChance

totalREC = base + weapon + armor + accessory + pet
```

---

### SER (Status Effect Resistance)
```
base    = doubleStatScore(END, LCK, level, SER.coeff)
passive = passive1.serBonus + passive2.serBonus
pet     = pet.statusEffectResistance

baseSER = base + passive + pet

Per-status total (Bleed, Stun, etc.):
  = baseSER + armor.specificResist[statusCode] + passive1.specificResist + passive2.specificResist
```
Passive bonus: passive trait "Headstrong" → +2.5% SER.
Passive trait "Fearless" → traitId 5 (numeric lookup required — not label string lookup).

---

### SPEED
```
profileSpeed = singleStatScore(AGI, level, Speed.coeff)
               (A=50, B=165.85, C=1523.35, D=2.3075, E=21.9325, dim=120)

weaponSpeedMod  = decodeWeaponSpeedModifier(weapon1.speedModifier)
                + decodeWeaponSpeedModifier(weapon2.speedModifier)
  where: raw >= 128 → negative modifier = -(256 - raw); else positive = raw

equipSpeedMod   = equipBonuses.speed - equipBonuses.speedDown
  (from armor/accessory bonus codes; scalar / 10_000 * profileSpeed  OR flat depending on code)

petSpeedMod     = round( pet.speedBonus * profileSpeed )
  (pet speedBonus is a small fraction, e.g. 0.001 for Blur ★★★)

totalSPEED = round(profileSpeed) + weaponSpeedMod + equipSpeedMod + petSpeedMod
```

---

### EVA (Evasion)
```
profileEVA = doubleStatScore(AGI, LCK, level, EVA.coeff)

armorEVA   = armor.evasion / 1_000_000    ← CURRENT (wrong; should be /10_000)
             armor.evasion is stored as integer units of 0.01% (i.e. /10_000 gives %)

weaponEVA  = weapon.evasionScalar / 10_000
accessoryEVA = accessory.evasionScalar / 10_000
petEVA     = pet.evasion
passiveEVA = passive1.evaBonus + passive2.evaBonus
  (e.g. "Foresight" → +3.0% EVA)

totalEVA = profileEVA + armorEVA + weaponEVA + accessoryEVA + petEVA + passiveEVA
```

---

## Weapon Bonus Scalar Divisors (Current vs Correct)

| Source     | Current divisor | Correct divisor | Effect           |
|------------|----------------|----------------|-----------------|
| Weapon     | / 10,000       | / 1,000        | 10x too small   |
| Armor      | / 10,000       | / 10,000       | Correct         |
| Accessory  | / 10,000       | / 10,000       | Correct         |

Weapon bonus codes that use this scalar:
- Code 20 → blkChance
- Code 21 → sblkChance
- Code 41 → recoveryChance (also appears on armor)
- Code 19 → UNKNOWN (Gore Staff uses this; candidate: evasion or recoveryChance)

---

## Passive Skill Lookup  ⚠ KNOWN BUG

In `fight-history.tsx`, passive traits are resolved via:
```js
Number(hero.passive1)   // WRONG if passive1 is a string label like "Fearless"
```
If `hero.passive1` is already a numeric traitId, `Number()` works.
If it's a string name like `"Fearless"`, `Number("Fearless") = NaN` → all passive effects silently break.

Correct lookup: reverse-map the label through `PASSIVE_SKILLS` to get the numeric traitId first.

---

## Known Gaps (Unresolved)

| Stat | Gap vs game    | Suspected cause                          |
|------|---------------|------------------------------------------|
| BLK  | −0.30%        | Weapon bonus code 19 unmapped (Gore Staff scalar=280) |
| REC  | −2.2%         | Weapon code 19 and/or armor code 41 scalar divisor    |
| SPEED| −1.1 pts      | Pet speed scalar formula or accessory speed code      |
