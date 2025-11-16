# 🌱 Garden Pools - Current Capabilities

## ✅ What Works Now

Hedge can analyze:

### 1. Pool Allocation Percentages
Shows each pool's share of total emissions (correlates to relative APR).
```
/garden pool:all realm:dfk
```
→ Lists all pools with allocation % and TVL

### 2. Specific Pool Lookup
```
/garden pool:CRYSTAL-AVAX realm:dfk
```
→ Shows allocation %, total staked, and metadata for that specific pool

### 3. Harvestable Rewards
```
/garden wallet:0x... realm:dfk
```
→ Shows your staked positions + exact CRYSTAL/JADE ready to harvest

## ⚠️ Current Limitations

### What We DON'T Calculate Yet

**24hr Fee APR** - Not available because it requires:
- DEX swap volume data (not exposed by GraphQL or LP Staking contract)
- Token price feeds (CRYSTAL, JEWEL, AVAX, etc.)
- Fee collection metrics per pool

**Emission-based APR %** - Not calculated because it requires:
- Block reward emission rates
- Token prices to convert rewards to USD
- Real-time price data for LP tokens

### What We DO Show Instead

✅ **Allocation Percentage** - Each pool's % of total emissions
- Higher allocation % = more rewards relative to other pools
- E.g., "CRYSTAL-AVAX: 15.2%" means it gets 15.2% of all CRYSTAL emissions

✅ **Total Value Locked** - LP tokens staked in each pool
- Helps gauge pool size and competition for rewards

✅ **Exact Harvestable Amounts** - Pending rewards in CRYSTAL/JADE
- Direct from blockchain - 100% accurate
- Shows how much you can claim right now

## 📊 Data Sources

**Currently Using:**
- LP Staking smart contracts (DFK Chain + Klaytn)
- Pool allocation points
- User staking positions
- Pending reward calculations

**NOT Using (limitations):**
- DEX swap volume/fees
- Token price oracles
- Historical APR data
- Emission schedule contracts

## 🎯 Practical Use Cases

### What You CAN Do

✅ **Find highest allocation pools**
```
/garden pool:all realm:dfk
```
Sort by allocation % to find pools with most emissions

✅ **Check harvest readiness**
```
/garden wallet:0x... realm:dfk
```
See exactly how much you can claim

✅ **Compare pool sizes**
```
/garden pool:CRYSTAL-AVAX
```
See total LP staked to gauge competition

✅ **Cross-realm comparison**
```
/garden pool:all realm:klaytn
```
Compare DFK Chain vs. Klaytn allocations

### What You CANNOT Do (Yet)

❌ Calculate exact APR % for a pool
❌ See 24hr fee earnings per pool
❌ Compare fee APR vs. emission APR
❌ Get historical APR trends
❌ Calculate impermanent loss

## 🔮 Future Enhancements

To add full APR calculation, we'd need:

**Option 1: On-Chain DEX Queries**
- Query Uniswap V2 Router contracts
- Calculate 24hr volume and fees
- Requires additional RPC calls + ABIs

**Option 2: Third-Party APIs**
- Use DexScreener or DefiLlama APIs
- Get pre-calculated APRs
- Easier but depends on external services

**Option 3: Emission Rate Calculation**
- Query reward token contracts for emission schedules
- Calculate emission APR only (not fee APR)
- Requires token price feeds

## 💡 How to Interpret Current Data

**Allocation % = Relative Rewards**
- 20% allocation = 2x rewards vs. 10% allocation pool
- Ignores pool size (TVL matters too!)
- Best metric for comparing pools

**Harvestable Rewards = Actual Earnings**
- Real CRYSTAL/JADE you've earned
- Claim anytime via game UI
- Most useful for active stakers

**Total Staked = Competition Level**
- Higher TVL = more people sharing rewards
- Lower TVL might mean better APR (if allocation is decent)
- Consider both allocation % AND TVL

## 📝 Honest Documentation

**Command Description Updated:**
```
/garden - Live garden pool data: allocation %, TVL, and harvestable rewards
```

**What Hedge Will Say:**
- "CRYSTAL-AVAX has 15.2% allocation - that's a solid share of emissions"
- "You have 12.5 CRYSTAL ready to harvest across 3 pools"
- "Pool has 1,234 LP staked - decent competition for rewards"

**What Hedge WON'T Say:**
- "This pool has 45% APR" (we don't calculate that)
- "24hr fees earned $1,234" (no access to fee data)
- "Better APR than yesterday" (no historical tracking)

## ✅ Bottom Line

**What Works:**
- ✅ Real-time allocation percentages from blockchain
- ✅ Exact harvestable rewards for your wallet
- ✅ Pool TVL and metadata
- ✅ Multi-realm support (DFK + Klaytn)

**What's Missing:**
- ❌ Calculated APR percentages
- ❌ 24hr fee data
- ❌ Historical trends
- ❌ Impermanent loss tracking

**Recommendation:**
Use `/garden` for allocation comparison and harvest tracking. For exact APR %, check the in-game UI or community tools like DFK Watch.

---

**Hedge's Take:** "I can tell you which pools get the biggest slice of emissions and how much you've earned. Want the exact APR? Check the game itself - I'm a ledger, not an oracle!" 📊
