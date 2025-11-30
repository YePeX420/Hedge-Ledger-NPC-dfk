# Hero Genetics Decoder - Output Comparison Reference

## ✅ Verified Against Hero #283911 (Reference Screenshot)

### Bot Output Format (`/debug-hero-genetics 283911`)
```
🧬 Full Genetics for Hero 283911
Normalized ID: 283911
Realm: dfk
Rarity: Common | Gen: 3 | Level: 20

🎭 Class Genetics:
Main: D: Ninja | R1: Monk | R2: Knight | R3: Berserker
Sub: D: Seer | R1: Berserker | R2: Monk | R3: Archer

🌿 Profession Genetics:
D: Fishing | R1: Gardening | R2: Fishing | R3: Foraging
✅ Has Gardening Gene - Eligible for 40% stamina reduction bonus

⚡ Abilities:
Passive1: D: Clear Vision | R1: Duelist | R2: Chatterbox | R3: Stalwart
Passive2: D: Duelist | R1: Chatterbox | R2: Foresight | R3: Clutch
Active1: D: Heal | R1: Deathmark | R2: Poisoned Blade | R3: Speed
Active2: D: Heal | R1: Deathmark | R2: Cleanse | R3: Iron Skin

📈 Stat Boosts:
Boost1: D: INT | R1: LCK | R2: VIT | R3: AGI
Boost2: D: LCK | R1: END | R2: STR | R3: INT

🔥 Element:
D: Earth | R1: Lightning | R2: Earth | R3: Fire

👤 Visual Traits:
Gender: Female
Hair: Style 1 | Color #D2691E
Eyes: #8B4513 | Skin: #FFB6C1
Background: City
Head Appendage: Fae Circlet
Back Appendage: Demon Wings
```

### Coverage Checklist

#### Stat Genes (All Decoded) ✅
- [x] **Class (Main)**: D/R1/R2/R3 - All 4 genes with official DFK names
- [x] **SubClass**: D/R1/R2/R3 - All 4 genes with official DFK names
- [x] **Profession**: D/R1/R2/R3 - All 4 genes with official DFK names
- [x] **Passive Abilities (2)**: D/R1/R2/R3 each - Official DFK combat names
- [x] **Active Abilities (2)**: D/R1/R2/R3 each - Official DFK combat names
- [x] **Stat Boosts (2)**: D/R1/R2/R3 each - All stat types (STR, AGI, INT, etc.)
- [x] **Element**: D/R1/R2/R3 - All elements (Fire, Water, Earth, Wind, etc.)
- [x] **Gardening Gene Detection**: Checks all 4 profession gene positions

#### Visual Genes (All Decoded) ✅
- [x] **Gender**: Male/Female
- [x] **Hair Style**: Numbered styles
- [x] **Hair Color**: Hex color codes (#D2691E, etc.)
- [x] **Eye Color**: Hex color codes
- [x] **Skin Color**: Hex color codes
- [x] **Background**: Named backgrounds (City, Forest, Mountains, etc.)
- [x] **Head Appendage**: Named appendages (Fae Circlet, Cat Ears, etc.)
- [x] **Back Appendage**: Named appendages (Demon Wings, Dragon Wings, etc.)

## 🧪 Test Results (Multiple Heroes)

### Hero #283911 (Reference)
- Class: Ninja ✅
- SubClass: Seer ✅
- Profession: Fishing ✅
- All genes decoded correctly

### Hero #1 (Genesis)
- Class: Thief ✅
- SubClass: Wizard ✅
- Profession: Gardening ✅
- All genes decoded correctly

### Hero #100
- Class: Knight ✅
- SubClass: Seer ✅
- Profession: Gardening ✅
- All genes decoded correctly

## 📋 Technical Implementation

### Encoding Method
- **Both statGenes and visualGenes use Kai (base-32) encoding**
- Alphabet: `123456789abcdefghijkmnopqrstuvwx` (32 characters)
- Each BigInt → 48 Kai characters (12 traits × 4 genes)
- Gene order in Kai string: R3, R2, R1, D (right to left)

### Official Gene Mappings
- **Classes**: Values 0-11, 16-21, 24-26, 28 (gaps at 12-15, 22-23, 27, 29-31)
- **Professions**: Even-spaced (0=Mining, 2=Gardening, 4=Fishing, 6=Foraging)
- **Stat Boosts**: Even-spaced (0=STR, 2=AGI, 4=INT, 6=WIS, 8=LCK, 10=VIT, 12=END, 14=DEX)
- **Elements**: Even-spaced (0=Fire, 2=Water, 4=Earth, 6=Wind, 8=Lightning, 10=Ice, 12=Light, 14=Dark)

### Source
All mappings verified against official @thanpolas/degenking library (package/src/constants/choices.const.js)

## ✨ Use Cases

1. **Breeding Analysis**: Full D/R1/R2/R3 genetics for breeding decisions
2. **Garden Optimization**: Detects Gardening gene in any position (40% stamina reduction)
3. **Hero Comparison**: Compare genetics across multiple heroes
4. **Visual Customization**: Accurate color codes and appendage names
5. **Combat Planning**: All passive/active abilities with official DFK names
