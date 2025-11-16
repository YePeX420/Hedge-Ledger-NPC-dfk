# DeFi Kingdoms - Quests Knowledge Base
## Official Data from DFK Documentation

## Quest Types Overview

DeFi Kingdoms has two main quest categories:
1. **Profession Quests** (Mining, Gardening, Foraging, Fishing)
2. **Training Quests** (8 stat training quests)

## Stamina System

| Attribute | Details |
|-----------|---------|
| **Base Stamina** | 25 per hero |
| **Regeneration** | 1 stamina every 20 minutes |
| **Full Recharge** | 500 minutes (~8.3 hours) |
| **Level Growth** | +1 stamina every even level (2, 4, 6, ...) |
| **Fast Recharge** | Inn (costs JEWEL/CRYSTAL) or stamina potions |

## Profession Quests

### Mining Quest
**Type**: Token unlock + gold earning

**Stamina Cost**: 1 per 10 minutes  
**Duration**: Time-based (send hero for X attempts)  
**Max Heroes**: 1 at a time  
**Required Stats**: STR + END (for gold mining), WIS + VIT (for token mining)  
**Profession Gene Bonus**: Reduced stamina consumption

**Rewards**:
- Unlocks locked JEWEL/CRYSTAL early
- Gold
- Small chance for rare items
- XP

**Best Heroes**: Warrior, Knight, Paladin, Dragoon, DarkKnight

**Strategy**:
- Use high STR/END heroes for gold mining
- Use to unlock locked garden rewards before natural vesting
- Mining is THE primary way to access locked tokens early

### Gardening Quest
**Type**: Boost garden LP yields

**Stamina Cost**: 1 per 10 minutes (12 min total quest, 10 with profession gene)  
**Duration**: Time-based  
**Max Heroes**: Up to 2 per garden  
**Required Stats**: WIS + VIT  
**Profession Gene Bonus**: 10 min instead of 12 min per stamina

**Rewards**:
- Power tokens (JEWEL/CRYSTAL/JADE) - boosted yield for your staked LP
- Plants
- Gaia's Tears
- Shvās runes
- Green pet eggs

**Best Heroes**: Wizard (best), Priest, Sage, Summoner, Paladin

**Strategy**:
- Assign heroes to gardens where you've staked LP tokens
- Hero boosts YOUR personal yield from that garden
- Higher INT/WIS = bigger boost
- Lowest stamina cost of all quests
- Great for passive LP holders

**Yield Boost Formula** (approximate):
```
Boost % = (Hero INT + Hero WIS + Hero Level) × Profession Level × Multipliers
```

### Fishing Quest
**Type**: Instant reward quest

**Stamina Cost**: 5 per attempt (7 without profession gene)  
**Duration**: ~20 seconds per attempt  
**Max Heroes**: Up to 6 heroes per transaction  
**Required Stats**: AGI + LCK  
**Profession Gene Bonus**: 5 stamina instead of 7

**Rewards**:
- Fish (needed for pet care)
- Gaia's Tears
- Rare items
- Blue pet eggs (likely)
- XP

**Best Heroes**: Pirate, Thief, Archer, Ninja, Monk

**Strategy**:
- Essential for pet owners (fish = pet food)
- High LCK heroes = better rare drops
- Can send 6 heroes at once
- Instant results (no wait time)

### Foraging Quest
**Type**: Instant reward quest

**Stamina Cost**: 5 per attempt (7 without profession gene)  
**Duration**: ~20 seconds per attempt  
**Max Heroes**: Up to 6 heroes per transaction  
**Required Stats**: DEX + INT  
**Profession Gene Bonus**: 5 stamina instead of 7

**Rewards**:
- Plants (crafting materials)
- Gaia's Tears
- Shvās runes
- Grey pet eggs
- XP

**Best Heroes**: Thief, Archer, Ninja, Pirate

**Strategy**:
- Gather materials for future crafting systems
- Speed-based quest
- Can send 6 heroes at once
- Instant results

## Training Quests

Training quests are **instant** quests where heroes compete against NPC trainers to improve stats.

### General Training Quest Rules

**Stamina Cost**: 5 per attempt (all training quests, NO profession gene bonus)  
**Duration**: Instant (immediate results)  
**Max Heroes**: Up to 6 per transaction  
**Can Fail**: YES (unlike profession quests)  
**Success Based On**: Hero's corresponding stat + stat growth genes

### The 8 Training Quests

| Quest Name | Trainer | Stat Trained | Best Classes |
|------------|---------|--------------|--------------|
| **Arm Wrestling** | Ice Reaver Zaine | STR | Warrior, Dragoon, Paladin |
| **Darts** | Layla | DEX | Archer, Thief, Ninja |
| **Game of Ball** | Street Kid Carlin | AGI | Thief, Archer, Monk |
| **Dancing** | Isabelle | END | Knight, DarkKnight |
| **Helping the Farm** | Farmer Quill | VIT | Knight, Paladin |
| **Alchemist Assistance** | Arnold | INT | Wizard, Sage, Ninja |
| **Puzzle Solving** | Orvin | WIS | Priest, Sage, Summoner |
| **Card Game** | Lucky Moe | LCK | Pirate, Summoner, Dreadknight |

### Training Quest Rewards (on SUCCESS)

**Guaranteed**:
- Flat gold amount
- XP (more than Level 0 profession quests)

**Random Drops** (chance-based):
- **Shvās Runes**: 1% chance
- **Lesser Attunement Crystals**: 0.5% chance
- **Pages of the Eternal Story**: 0.75% chance (limited-time collectible)

**On FAILURE**: No rewards

### Training Quest Mechanics

- Hero competes against trainer in specific stat
- Success chance based on hero's stat value + stat genes
- Higher stat = higher success rate
- Once hero's stat is too high, they "outgrow" Tier 1 trainers
- Tier 2 training quests available for stronger heroes

## Quest Comparison Table

| Feature | Profession Quests | Training Quests |
|---------|-------------------|-----------------|
| **Equipment** | Not required | Not required |
| **Can Fail** | No | Yes |
| **Stamina** | 5-7 or 1/10min | 5 per attempt (fixed) |
| **Gene Bonus** | Yes (28% less stamina) | No stamina reduction |
| **Results** | Time-based or instant | Instant |
| **Focus** | 2 stats per profession | 1 stat per quest |
| **Group Size** | 1-6 depending on quest | Up to 6 |

## Quest Strategies by Goal

### Goal: Maximum XP
**Recommended**:
1. Training quests (instant, guaranteed XP)
2. Profession quests matching hero's class
3. Run multiple heroes simultaneously

**Strategy**: Spam training quests with 6 heroes at once for fast XP

### Goal: Maximum JEWEL/CRYSTAL (Gold)
**Recommended**:
1. **Mining** (primary token unlock method)
2. **Gardening** (boost LP yields, compound rewards)
3. Fishing/Foraging for sellable rare items

**Strategy**: 
- Focus high STR/END heroes on mining
- Use high INT/WIS heroes in gardens
- Compound garden rewards for exponential growth

### Goal: Crafting Materials
**Recommended**:
1. **Foraging** (plants)
2. **Fishing** (fish + rare items)
3. Mining/Training for rune drops

**Strategy**: High LCK heroes to boost rare drop rates

### Goal: Profession Leveling
**Recommended**:
- Repeatedly run the profession quest you want to level
- Use heroes with matching stat bonuses
- Level hero overall to unlock profession bonuses faster

**Strategy**: Specialize heroes early in one profession for efficiency

### Goal: Stat Growth
**Recommended**:
- Focus on training quests for targeted stat
- Use heroes with high base stat + good growth %
- Training more efficient than waiting for level-ups

**Strategy**: Use training to "fix" heroes with low stats in critical areas

## Quest Cooldowns

- Most quests: NO cooldown
- Heroes can quest as long as they have stamina
- Some special/event quests may have timers

## Quest Rewards Explained

**XP**: All quests grant experience toward next level

**Gold**: Mining, training, some profession quests

**Items**: 
- Profession quests: Profession-specific (fish, plants, eggs)
- Training quests: Runes, crystals, collectibles
- All quests: Rare drops boosted by LCK

**Stats**: Training quests only (chance to increase specific stat)

## Pro Tips

✅ **Match Hero to Profession**: 28% less stamina if profession gene matches  
✅ **Batch Quests**: Send 6 heroes on fishing/foraging/training for efficiency  
✅ **Rotate Heroes**: Stamina recharges while you quest with others  
✅ **Level Matters**: Higher level heroes = better efficiency (more output per stamina)  
✅ **Profession Skill**: Keep questing to build skill (0-100+), unlocks better rewards  
✅ **Training for Guaranteed XP**: Training quests give more XP than Level 0 profession quests  
✅ **Mining Unlocks Tokens**: Only way to access locked garden rewards early  
✅ **Gardening Compounds**: Boost LP yields, reinvest for exponential returns

## Quest Locations

### In-Game Navigation
1. Click **Questing Portal** on main map
2. Choose quest type:
   - **Profession Quests** tab
   - **Training Quests** tab
3. Select heroes
4. Choose number of attempts (limited by stamina)
5. Confirm transaction

### Completing Quests
- Time-based quests (mining/gardening): Wait, then click "Complete"
- Instant quests (fishing/foraging/training): Automatic completion
- Rewards auto-added to wallet on completion
