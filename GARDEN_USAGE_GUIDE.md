# 🌱 Garden Pools - User Guide

## Quick Start

### View All Pools
```
/garden pool:all realm:dfk
```
Shows top 10 pools with allocation % and TVL

### Look Up Specific Pool
```
/garden pool:CRYSTAL-AVAX realm:dfk
```
**Important:** Pool name must match exactly (case-insensitive)

Valid examples:
- `CRYSTAL-AVAX` ✅
- `crystal-avax` ✅
- `JEWEL-USDC` ✅

Invalid examples:
- `CRYSTAL` ❌ (incomplete)
- `AVAX` ❌ (partial match may return wrong pool)

### Check Your Rewards
```
/garden wallet:0x2E7669F61eA77F02445A015FBdcFe2DE47083E02 realm:dfk
```
Shows all your positions + harvestable CRYSTAL/JADE

## Available Pool Pairs

### DFK Chain (realm:dfk)
- wJEWEL-xJEWEL
- CRYSTAL-AVAX
- CRYSTAL-wJEWEL
- CRYSTAL-USDC
- ETH-USDC
- wJEWEL-USDC
- CRYSTAL-ETH
- CRYSTAL-BTC.b
- CRYSTAL-KLAY
- wJEWEL-KLAY
- wJEWEL-AVAX
- wJEWEL-BTC.b
- wJEWEL-ETH
- BTC.b-USDC

### Klaytn (realm:klaytn)
- JADE-JEWEL
- JADE-wKLAY
- JADE-AVAX
- JADE-oUSDT
- JADE-oWBTC
- JADE-oETH
- JEWEL-wKLAY
- JEWEL-AVAX
- JEWEL-oUSDT
- JEWEL-oWBTC
- JEWEL-oETH

## Understanding the Output

**Allocation %**
- Shows pool's share of total CRYSTAL/JADE emissions
- Higher % = more rewards relative to other pools
- Example: "15.2%" means pool gets 15.2% of all emissions

**Total Staked**
- LP tokens currently staked in the pool
- Higher = more competition for rewards
- Lower might mean better APR (if allocation is good)

**Harvestable Rewards**
- Exact CRYSTAL/JADE you've earned
- Ready to claim in-game immediately
- 100% accurate from blockchain

## Limitations

❌ **No APR %** - Allocation % shows relative rewards, not exact APR
❌ **No 24hr Fees** - Can't show fee-based earnings
❌ **Exact Pool Names** - Must match pool pair exactly
❌ **Static Pool List** - New pools won't appear until manually added

## Troubleshooting

**"Pool not found"**
→ Check spelling - must match exactly
→ Try `/garden pool:all` to see available pools
→ Verify correct realm (dfk vs. klaytn)

**"No active positions"**
→ Wallet has no staked LP in that realm
→ Try other realm or verify wallet address

**"Garden data unavailable"**
→ Blockchain RPC temporarily unavailable
→ Try again in a few seconds
→ Or use `/garden` (no params) for general info

## Best Practices

✅ Use `/garden pool:all` first to see what's available
✅ Copy pool names exactly from the list
✅ Check both realms if you stake across chains
✅ For APR %, check in-game UI or community tools

---

**Pro Tip:** Allocation % is great for comparing pools. A pool with 20% allocation gets 2x rewards vs. a 10% pool (assuming equal TVL).
