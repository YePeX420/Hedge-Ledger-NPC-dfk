# 🧪 Testing Guide - Hedge Ledger On-Chain Features

## ✅ Bot Status
- **Status:** ✅ Running and connected
- **Login:** Hedge Ledger#1261  
- **Model:** GPT-4o-mini
- **Knowledge Base:** 4/4 files loaded
- **On-Chain Module:** ✅ Integrated

## 🎮 Test Commands

### 1. `/hero` - View Live Hero Data
Fetches real-time blockchain data for any hero by ID.

**Test Example:**
```
/hero id:1
```

**What to Expect:**
- Hero stats (STR, DEX, AGI, VIT, INT, WIS, LCK, END)
- Current level, XP, and rarity
- Main class and subclass
- Generation and summons used
- Profession info (if any)
- Hedge Ledger's analysis and advice

**Try These Heroes:**
- `/hero id:1` (Genesis hero #1)
- `/hero id:12345` (Random hero)
- `/hero id:999999` (Should return "not found")

---

### 2. `/market` - Browse Live Marketplace
Shows cheapest heroes currently for sale on the marketplace.

**Test Example:**
```
/market class:Wizard limit:5
```

**Parameters:**
- `class` (optional): Filter by hero class (Warrior, Knight, Thief, Archer, Priest, Wizard, Monk, Pirate, Berserker, Seer, Legionnaire, Scholar, Paladin, DarkKnight, Summoner, Ninja, Shapeshifter, Bard, Dragoon, Sage, Spellbow, DreadKnight)
- `limit` (optional): How many results (default: 10, max: 20)

**What to Expect:**
- List of heroes for sale with prices in JEWEL
- Hero ID, class, rarity, and level for each
- Hedge's market analysis

**Try These:**
- `/market limit:10` (10 cheapest heroes overall)
- `/market class:Paladin limit:5` (5 cheapest Paladins)
- `/market class:DarkKnight limit:3` (3 cheapest Dark Knights)

---

### 3. `/lookup` - Search Heroes
Advanced hero search with multiple filters.

**Test Example:**
```
/lookup profession:gardening for_sale:true min_level:5
```

**Parameters:**
- `class` (optional): Hero class filter
- `profession` (optional): Filter by profession (mining, gardening, foraging, fishing)
- `for_sale` (optional): Only show heroes listed for sale
- `min_level` (optional): Minimum hero level

**What to Expect:**
- Up to 15 matching heroes
- Hero stats and sale prices (if applicable)
- Hedge's recommendations

**Try These:**
- `/lookup for_sale:true` (All heroes for sale)
- `/lookup profession:gardening` (All gardeners)
- `/lookup class:Wizard min_level:10` (High-level wizards)
- `/lookup profession:mining for_sale:true` (Miners for sale)

---

### 4. `/wallet` - View Wallet Portfolio
Analyzes all heroes owned by a wallet address.

**Test Example:**
```
/wallet address:0x2E7669F61eA77F02445A015FBdcFe2DE47083E02
```

**What to Expect:**
- Total hero count
- Breakdown by class
- Top 10 heroes listed
- Hedge's portfolio analysis

**Try These Wallets:**
- `0x2E7669F61eA77F02445A015FBdcFe2DE47083E02` (Known DFK wallet)
- `0x1234567890123456789012345678901234567890` (Invalid - should error)

**Note:** Get real wallet addresses from:
- DeFi Kingdoms Discord community
- DFK Game UI (your own wallet)
- DFK Marketplace (click any hero to see owner)

---

## 🐛 Expected Behaviors

### Success Cases ✅
- Valid hero IDs return detailed stats
- Market searches return active listings
- Wallet lookups show portfolio breakdown
- Hedge provides context-aware analysis

### Error Cases ⚠️
- Invalid hero ID → "Hero not found on-chain"
- No marketplace results → "No heroes found with those filters"
- Invalid wallet address → "Invalid wallet address format"
- Empty wallet → "No heroes found for this wallet"

---

## 📊 Data Source
All data comes from:
- **API:** `https://api.defikingdoms.com/graphql`
- **Chain:** DFK Chain (Avalanche subnet)
- **Update Frequency:** Real-time on-chain data

---

## 🎯 What Makes This Different

**Before:** Generic AI responses based only on documentation
**Now:** Live blockchain analysis with real numbers

Example:
- **Old /hero:** "Heroes have stats like STR and AGI..."
- **New /hero:** "Hero #12345 is a Level 23 Wizard with 52 INT, currently listed for 127.5 JEWEL..."

---

## 💡 Tips for Testing

1. **Compare Data:** Cross-reference results with the official DFK marketplace
2. **Test Edge Cases:** Try non-existent heroes, empty wallets, etc.
3. **Observe Hedge's Personality:** He should maintain his NPC character while analyzing real data
4. **Performance:** Queries take 2-5 seconds due to blockchain lookups

---

## 📝 Report Issues

If you find bugs:
1. Note which command you used
2. Copy the exact error message
3. Check if the hero/wallet exists on the actual DFK platform
4. Report in the development channel

---

## 🚀 Next Steps

After testing, potential enhancements:
- Garden staking data (`/garden` with APR info)
- Pet marketplace queries
- Quest history lookups
- Price alerts and tracking
- PvP stats integration
