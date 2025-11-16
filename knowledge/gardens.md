# DeFi Kingdoms - Gardens (Liquidity Pools) Knowledge Base
## Official Data from DFK Documentation

## What Are Gardens?

Gardens in DeFi Kingdoms are **liquidity pool (LP) staking pools** where players:
- Provide liquidity (deposit paired tokens)
- Earn trading fees from swaps
- Earn Power Token emissions (JEWEL, CRYSTAL, or JADE)
- Use heroes to boost yields via Gardening quests

Each realm has its own gardens:
- **Serendale (Klaytn)**: JADE Gardens - earn JADE emissions
- **Crystalvale (DFK Chain)**: Ice Gardens - earn CRYSTAL emissions
- **Serendale (Harmony)**: Original JEWEL Gardens

## How Gardens Work

### 1. Providing Liquidity

1. Acquire both tokens in the pair (e.g., CRYSTAL + USDC)
2. Go to **The Trader** (DEX)
3. Select "Add Liquidity"
4. Enter amount of one token (other auto-balances to equal USD value)
5. Approve tokens (first time only)
6. Confirm "Add Liquidity" transaction
7. Receive LP tokens representing your pool share

### 2. Staking LP Tokens

1. Go to **Gardens** (or Druid in some realms)
2. Select the pool matching your LP tokens
3. Click "Stake" or "Deposit"
4. Enter amount of LP tokens
5. Confirm transaction
6. Start earning power token emissions immediately

**NO DEPOSIT FEES** - Free to stake

### 3. Assigning Heroes (Optional)

1. Navigate to **Professions** → **Gardening**
2. Select your staked garden
3. Click "Assign Heroes"
4. Choose heroes with high INT/WIS
5. Confirm transaction
6. Heroes boost YOUR personal yield from that pool

**Max Heroes per Garden**: 2

## Epochs and Emissions

### What Are Epochs?

- **Duration**: Exactly 1 week each
- **Purpose**: Govern emission rates of power tokens
- **Start**: Epoch 1 has highest emissions
- **Progression**: Emission rates change (usually decrease) with each epoch

### Emission Schedule

Each power token has its own emission schedule:
- **Generally**: Highest emissions at launch
- **Over Time**: Emissions decrease (not linear)
- **Current Epoch**: Determines tokens minted per minute/block
- **Check**: Each realm's Gardens page for current epoch + emission rate

### Important Note

Emissions are **timestamp-based**, not block-based, for consistency.

## Pool Allocations

### How Allocations Work

Total emissions per epoch are divided among pools based on **allocation points**:

1. Each pool (LP pair) has an allocation %
2. View in **Seed Box** on realm's Gardens page
3. Pool receives that % of total emissions
4. Emissions distributed to stakers proportional to their LP share

**Example**:
- Epoch emits 1000 CRYSTAL/minute total
- CRYSTAL-USDC pool has 20% allocation
- Pool receives 200 CRYSTAL/minute
- If you own 5% of pool's LP tokens, you earn 10 CRYSTAL/minute

### Project Allocations

When you claim rewards, additional tokens mint to project wallets:
- **Development Fund**: 45% locked
- **Marketing Fund**: 45% locked  
- **Jeweler**: 45% locked (stakers earn from this)
- **Founders Fund**: 95% locked

These mints:
- Do NOT reduce your rewards
- Count toward total token supply
- Fund long-term development
- Provide sustained Jeweler rewards

## Locking Model

### How Locking Works

To balance high early emissions and provide price stability, gardens rewards are partially locked:

**Unlocked Tokens**: Transfer to wallet immediately, fully usable  
**Locked Tokens**: Allocated but can't be traded, usable only in-game (e.g., mining quests)

### Locking Schedule by Epoch

| Epoch | Unlocked % | Locked % |
|-------|-----------|----------|
| 1 | 5% | 95% |
| 2 | 7% | 93% |
| 3 | 9% | 91% |
| ... | +2% each epoch | -2% each epoch |
| 51+ | 100% | 0% |

**After Epoch 51**: All new rewards fully unlocked immediately

### Locked Token Unlocking

**Natural Unlock**:
- Locked tokens remain locked until end of Epoch 51
- Then unlock ratably over next 52 epochs (1.92% per epoch)

**Early Unlock via Mining Quests**:
- Send heroes on **Mining Quests**
- Unlock locked tokens before natural vesting
- Mining power depends on hero STR/END stats
- Best way to access locked rewards early

### Key Locking Rules

✅ Locking % based on **claim epoch**, not earn epoch  
✅ Unclaimed rewards can gain higher unlock % by waiting  
✅ Once claimed, locked portion stays locked until Epoch 51+  
✅ Mining quests = only early unlock method  

**Example**: You earn 100 tokens in Epoch 1 but claim in Epoch 10:
- Unlock: 21% = 21 tokens (immediately usable)
- Locked: 79% = 79 tokens (locked until Epoch 51+ or mine them)

## Withdrawal Fees

To protect against flash loans and price manipulation:

| Timing | Fee |
|--------|-----|
| **Same block** | 25% slashing fee |
| **Under 1 hour** | 8% fee |
| **Under 24 hours** | 4% fee |
| **After 24 hours** | 0% fee |

**Important**: Each new deposit resets the fee timer

## APR Calculation

### Basic Formula

```
APR = (Annual Rewards / LP Value) × 100

Daily Yield = LP Amount × (APR / 100) / 365
Weekly Yield = Daily × 7
Monthly Yield = Daily × 30
Yearly Yield = LP Amount × (APR / 100)
```

### APR Components

**Base APR**: From power token emissions to pool  
**Trading Fee APR**: From swap fees (usually ~0.25-0.3% per swap)  
**Hero Boost**: Additional % from gardening heroes (your personal bonus)

### APR is Dynamic

APRs change based on:
- **Total liquidity** in pool (more LP = lower APR per person)
- **Token emission schedule** (decreases over epochs)
- **Trading volume** (more swaps = more fee APR)
- **Pool allocation** (can be adjusted by governance)

**Historical APR ≠ Future APR**

Always check current APR before depositing.

## Hero Gardening Boost

### How It Works

When you assign heroes to a garden you've staked in:
- Heroes boost YOUR personal yield (not the whole pool)
- Higher INT/WIS = bigger boost
- Higher hero level = bigger boost
- Higher gardening profession skill = bigger boost

### Approximate Boost Formula

```
Boost % = (Hero INT + Hero WIS + Hero Level) × Gardening Skill × Multipliers
```

**Best Heroes for Gardening**:
1. **Wizard** - Highest INT
2. **Priest** - High WIS
3. **Sage** - INT + LCK combo
4. **Summoner** - WIS + LCK
5. **Paladin** - Balanced (can also mine)

### Gardening Quest Details

**Stamina**: 1 per 10 minutes (12 min total, 10 with gardening profession gene)  
**Rewards**: Additional power tokens, plants, runes, green pet eggs  
**Max Heroes**: 2 per garden

## Impermanent Loss (IL)

### What Is It?

Loss compared to just holding both tokens when their price ratio changes.

### When It Happens

If one token in your pair changes significantly in price vs the other.

**Example**:
- Deposit CRYSTAL-USDC when CRYSTAL = $1
- CRYSTAL goes to $5
- You'd have made more just holding CRYSTAL than providing LP
- The "loss" is the difference (not a real loss until you withdraw)

### How to Calculate IL

IL depends on price ratio change. Common scenarios:

| Price Change | Impermanent Loss |
|--------------|------------------|
| 1.25x | -0.6% |
| 1.50x | -2.0% |
| 1.75x | -3.8% |
| 2x | -5.7% |
| 3x | -13.4% |
| 4x | -20.0% |
| 5x | -25.5% |

### Mitigating IL

✅ **Choose correlated pairs**: Tokens that move together (e.g., CRYSTAL-JADE)  
✅ **Stablecoin pairs**: One stable token reduces IL (e.g., USDC-DAI)  
✅ **High APR**: Earn enough to offset potential IL  
✅ **Long-term hold**: IL temporary if prices revert  
✅ **Understand risk**: Know your tolerance before committing

**Best for Beginners**: Stablecoin pairs or same-category tokens

## Popular LP Pairs by Realm

### Crystalvale (DFK Chain)
- **CRYSTAL-JADE**: Dual power tokens, correlated movement
- **CRYSTAL-USDC**: Power token + stablecoin
- **CRYSTAL-AVAX**: Power token + major chain token
- **CRYSTAL-WETH**: Power token + wrapped ETH

### Serendale (Klaytn - JADE Gardens)
- **JADE-USDC**: Power token + stablecoin
- **JADE-WKLAY**: Power token + native chain token

### Serendale (Harmony - Original)
- **JEWEL-ONE**: Power token + native chain token
- **JEWEL-USDC**: Power token + stablecoin
- **JEWEL-ETH**: Power token + wrapped ETH

## Getting Started Guide

### Step 1: Choose a Pool

**Beginner**: Stablecoin pairs (lowest IL risk)  
**Moderate**: Power token + stablecoin (CRYSTAL-USDC)  
**Advanced**: Dual volatile (CRYSTAL-JADE, CRYSTAL-AVAX)

### Step 2: Acquire Tokens

- Buy on in-game **Trader** (DEX)
- Bridge from other chains
- Earn via quests

### Step 3: Add Liquidity

1. Go to **Trader** → "Liquidity"
2. Select pair
3. Enter amount (auto-balances to 50/50 USD value)
4. Approve + confirm
5. Receive LP tokens

### Step 4: Stake LP Tokens

1. Go to **Gardens**
2. Find your pool
3. Click "Deposit" or "Stake"
4. Enter LP amount
5. Confirm
6. Start earning immediately

### Step 5: Assign Heroes (Optional)

1. **Professions** → **Gardening**
2. Select your pool
3. Assign up to 2 heroes with high INT/WIS
4. Boost your personal yield

### Step 6: Claim Rewards

- View "Pending Rewards" in garden interface
- Click "Claim" to harvest
- Unlocked portion → wallet immediately
- Locked portion → locked balance (unlock via mining or wait)

### Step 7: Compound (Recommended)

- Claim rewards periodically
- Use unlocked tokens to buy more LP
- Restake for compound growth
- Heroes keep boosting

## Withdrawing from Gardens

### Process

1. **Unstake LP tokens** (mind the 24hr fee timer!)
2. Go to **Trader** → "Liquidity"
3. Click "Remove Liquidity"
4. Select pool + amount
5. Confirm transaction
6. Receive both tokens based on current pool ratio

### Important Notes

- You may not get the **exact** amounts of each token you deposited (due to IL)
- You **will** have earned fees + emissions during staking
- Calculate total return including IL to see real profit/loss
- Wait 24+ hours after last deposit to avoid withdrawal fee

## Risk Factors

1. **Impermanent Loss**: Price divergence between tokens
2. **Smart Contract Risk**: Always a possibility in DeFi
3. **Token Volatility**: JEWEL/CRYSTAL/JADE prices can swing heavily
4. **APR Fluctuation**: Emissions decrease over time
5. **Withdrawal Fees**: Early withdrawal = up to 25% fee
6. **Locking**: Most rewards locked until Epoch 51+

## Tips for Success

✅ **Start Small**: Learn mechanics with small amounts first  
✅ **Diversify**: Spread across multiple pools if possible  
✅ **Use High-INT Heroes**: Maximize gardening boost  
✅ **Monitor APRs**: They change frequently, rebalance as needed  
✅ **Understand IL**: Critical before committing large amounts  
✅ **Compound Rewards**: Reinvest for exponential growth  
✅ **Long-Term Mindset**: Gardens work best over months, not days  
✅ **24-Hour Rule**: Always wait 24hrs to avoid withdrawal fees  
✅ **Mining Heroes**: Keep STR/END heroes for unlocking locked rewards

## Advanced: Calculating Exact Yields

If you have APR data:

```
Given:
- LP Amount: $1000
- APR: 50%
- Hero Boost: +10%
- Your Unlock %: 15% (Epoch 6)

Total APR: 50% + 10% = 60%
Yearly Yield: $1000 × 0.60 = $600/year
Daily Yield: $600 / 365 = $1.64/day

On Claim:
- Unlocked (15%): $1.64 × 0.15 = $0.25/day (liquid)
- Locked (85%): $1.64 × 0.85 = $1.39/day (mine or wait)
```

**Remember**: Actual yields vary based on pool activity and emissions!
