# DeFi Kingdoms - UI Navigation Guide
## Official Data from DFK Documentation

## Main Realms

DeFi Kingdoms spans multiple blockchain realms:
- **Serendale (Harmony)**: Original realm, JEWEL token
- **Crystalvale (DFK Chain)**: Second realm, CRYSTAL token  
- **Serendale 2.0 (Klaytn)**: Third realm, JADE token

Each realm has similar UI but different tokens and features.

## Main Map Locations

### 🏛️ Tavern (The Inn)
**Purpose**: Hero management, summoning, marketplace, stamina recovery

**How to Access**: Click tavern building on main map

**What You Can Do**:
- **Summon Heroes**: Create new heroes by combining two heroes
- **Hero Marketplace**: Buy/sell heroes
- **Hire Heroes**: Rent heroes for summoning
- **Stamina Recovery**: Pay JEWEL/CRYSTAL to speed up stamina regen
- **View Collection**: Browse your owned heroes

**Summoning Process**:
1. Click "Summon Hero"
2. Select your summoner hero
3. Select assistant (yours or rent from marketplace)
4. Optional: Use enhancement stones for better genes
5. Pay summoning cost (JEWEL/CRYSTAL + tear fees)
6. Confirm transaction
7. Receive new hero with randomized stats/genetics

**Hero Marketplace**:
- Filter by class, stats, level, profession, price
- Sort by various attributes
- Make offers or buy instantly
- Heroes display full stat card before purchase

### 🌳 Gardens (The Druid / Ice Gardens)
**Purpose**: Liquidity pools, staking, yield farming

**How to Access**: Click gardens/druid area on map

**What You Can Do**:
- View all LP pools and their APRs
- Stake LP tokens to earn JEWEL/CRYSTAL/JADE
- Claim rewards
- View your staked positions
- Check current epoch and emissions

**Navigation**:
- **Main View**: Shows all pools with APRs, TVL, allocations
- **Seed Box**: Current epoch, emission schedule, pool allocations
- **Your Gardens**: Your staked positions only
- **Pending Rewards**: Claimable tokens (locked + unlocked)

### ⚔️ Professions (Quest Portal)
**Purpose**: Send heroes on quests

**How to Access**: Click quest portal/professions building

**Quest Types Available**:

**Profession Quests Tab**:
- **Mining**: Unlock locked tokens, earn gold
- **Gardening**: Boost garden yields
- **Foraging**: Gather plants, runes
- **Fishing**: Catch fish, rare items

**Training Quests Tab**:
- Arm Wrestling (STR)
- Darts (DEX)  
- Game of Ball (AGI)
- Dancing (END)
- Helping the Farm (VIT)
- Alchemist Assistance (INT)
- Puzzle Solving (WIS)
- Card Game (LCK)

**Starting a Quest**:
1. Click quest type
2. Select hero(es) - check stamina first
3. Choose number of attempts (limited by stamina)
4. Confirm transaction
5. Wait for time-based quests or see instant results

**Active Quests**:
- View in "Active Quests" tab
- See time remaining
- Complete when ready (time-based quests only)

**Completing Quests**:
1. Return to Professions
2. Click "Complete Quest"
3. Confirm transaction
4. Rewards auto-added to wallet + hero XP applied

### 💰 The Trader (DEX)
**Purpose**: Token swapping, liquidity provision

**How to Access**: Click marketplace/trader building

**What You Can Do**:

**Swap Tab**:
1. Select "From" token
2. Select "To" token
3. Enter amount
4. Check exchange rate + slippage
5. Approve token (first time)
6. Confirm swap
7. Tokens exchanged instantly

**Liquidity Tab**:

**Add Liquidity**:
1. Select token pair (e.g., CRYSTAL-USDC)
2. Enter amount of one token
3. Other token auto-calculates to equal USD value
4. Approve both tokens (first time)
5. Click "Add Liquidity"
6. Confirm transaction
7. Receive LP tokens

**Remove Liquidity**:
1. Select LP pool
2. Enter amount or percentage to remove
3. Confirm transaction
4. Receive both underlying tokens

**Features**:
- Real-time price charts
- Price impact warnings
- Slippage settings
- Transaction history

### 🏦 The Bank
**Purpose**: View and claim locked tokens

**How to Access**: Click bank building

**What You Can Do**:
- View locked token balance
- View vesting schedule
- Claim unlocked tokens (after Epoch 51+)
- See remaining lock time
- Track locked rewards from gardens

**Important**: Before Epoch 51, use Mining quests to unlock early. After Epoch 51, tokens unlock ratably over 52 weeks.

### 👤 Profile (Top Right Corner)
**Purpose**: Wallet management, settings

**What You Can Do**:
- Connect/disconnect wallet
- View wallet address
- Check total balances (locked + unlocked)
- See your profile stats
- Manage account settings

## Detailed Workflows

### Starting a Mining Quest

1. Go to **Professions** → **Profession Quests**
2. Click **Mining**
3. Choose quest type:
   - **Gold Mining** (earn gold, uses STR+END)
   - **Token Mining** (unlock locked JEWEL/CRYSTAL, uses WIS+VIT)
4. Select 1 hero (only 1 allowed)
5. Choose attempts (each = 10 min of mining time)
6. Check hero has enough stamina (1 per 10 min)
7. Confirm transaction
8. Quest runs for (attempts × 10 minutes)
9. Return to complete when ready
10. Claim rewards

### Starting a Gardening Quest

**Prerequisites**: Must have LP tokens staked in a garden

1. Go to **Professions** → **Profession Quests**
2. Click **Gardening**
3. Select the garden you've staked LP in
4. Click "Assign Heroes"
5. Choose up to 2 heroes with high INT/WIS
6. Set duration (stamina = minutes / 10)
7. Confirm transaction
8. Heroes boost your garden yield while questing
9. Complete quest to claim additional rewards

**Tip**: Keep heroes gardening as long as possible for maximum boost

### Starting a Fishing/Foraging Quest

1. Go to **Professions** → **Profession Quests**
2. Click **Fishing** or **Foraging**
3. Select up to 6 heroes
4. Choose attempts per hero (5 stamina each, or 7 without profession gene)
5. All heroes must be able to do same number of attempts
6. Confirm transaction
7. Quest completes instantly (~20 sec)
8. Rewards auto-appear in wallet

### Starting a Training Quest

1. Go to **Professions** → **Training Quests**
2. Select quest matching stat you want to train
3. Choose up to 6 heroes
4. Set attempts (5 stamina each)
5. All heroes must do same attempts
6. Confirm transaction
7. Results appear instantly
8. Check success/failure for each hero
9. Successful attempts grant gold, XP, rare item chances

### Adding Liquidity & Staking

1. **Acquire Tokens**: Buy on Trader or bridge
2. **Add Liquidity**:
   - Trader → Liquidity → Add
   - Select pair, enter amount
   - Approve + confirm
   - Receive LP tokens
3. **Stake LP Tokens**:
   - Gardens → Select pool
   - Click "Deposit"
   - Enter LP amount
   - Confirm
4. **Assign Heroes** (optional):
   - Professions → Gardening
   - Select pool, assign heroes
5. **Earn Rewards**: Automatic
6. **Claim**: Gardens → "Claim Rewards"
7. **Compound**: Use rewards to add more liquidity

### Buying a Hero

1. Go to **Tavern**
2. Click **Hero Marketplace**
3. **Filter Options**:
   - Class (Warrior, Wizard, etc.)
   - Rarity (Common → Mythic)
   - Level range
   - Profession
   - Price range
   - Stats (STR, INT, etc.)
   - Generation
   - Summons remaining
4. **Sort By**: Price, level, stats, rarity
5. Click hero card to view full details:
   - All 8 stats
   - Stat growth %
   - Profession skill levels
   - Summon history
   - Equipment slots
6. Click "Buy Now" if instant price
7. Or "Make Offer" if negotiable
8. Confirm transaction
9. Hero appears in your collection

### Summoning a Hero

1. Go to **Tavern** → **Summon**
2. Select **Summoner** (must be yours)
3. Select **Assistant**:
   - Use your own hero (free)
   - OR rent from marketplace (costs fees)
4. **Optional Enhancements**:
   - Gaia's Tears (base)
   - Enhancement Stones (better stats/genes)
5. View summon cost breakdown
6. Confirm transaction
7. Wait for transaction
8. New hero appears with:
   - Randomized stats (influenced by parents)
   - Randomized class (based on parent classes)
   - Level 1, 0 XP
9. Both summoner & assistant summon count increases

## Wallet Connection

### First-Time Setup

1. Click **Connect Wallet** (top right)
2. Choose provider:
   - **MetaMask** (most common)
   - **WalletConnect** (mobile)
   - Other web3 wallets
3. Approve connection in wallet popup
4. Select account
5. Connected = see your address displayed

### Network Requirements

Make sure wallet is on correct network:
- **DFK Chain (Crystalvale)**: Custom RPC
- **Harmony (Serendale)**: Harmony Mainnet
- **Klaytn (Serendale 2.0)**: Klaytn Mainnet

**Add Network**: Click network switcher in wallet, add custom RPC

**DFK Chain RPC Details** (for Crystalvale):
- Network Name: DFK Chain
- RPC URL: `https://subnets.avax.network/defi-kingdoms/dfk-chain/rpc`
- Chain ID: 53935
- Symbol: JEWEL
- Explorer: `https://subnets.avax.network/defi-kingdoms/`

## Tips for New Players

### First 30 Minutes Checklist

1. ✅ **Connect Wallet** on correct network
2. ✅ **Acquire small amount of power token** (JEWEL/CRYSTAL/JADE) for gas
3. ✅ **Buy 1-2 cheap heroes** from Tavern marketplace
4. ✅ **Try a training quest** (arm wrestling or darts) to learn mechanics
5. ✅ **Try a fishing/foraging quest** (instant, low stakes)
6. ✅ **Check gardens** to understand APRs and pools

### Common Beginner Mistakes

❌ Not having gas token (JEWEL/CRYSTAL/JADE) for transactions  
❌ Sending hero on quest without enough stamina  
❌ Withdrawing from gardens within 24 hours (4-25% fee!)  
❌ Not understanding impermanent loss before adding liquidity  
❌ Claiming locked garden rewards and expecting to trade them  
❌ Buying heroes without checking stat growth %  
❌ Forgetting to complete quests and claim rewards  

### Pro Navigation Tips

✅ **Bookmark the game URL** - URLs can change  
✅ **Join official Discord** for real-time updates  
✅ **Check announcements** in-game for events/changes  
✅ **Use GraphQL API** for advanced hero data: `https://api.defikingdoms.com/graphql`  
✅ **Multiple heroes questing**: Rotate to always have someone ready  
✅ **Gardens for passive income** while learning other mechanics  
✅ **Start small** - Don't invest heavily until you understand all systems  
✅ **Stamina management** - Quest with some heroes while others recharge  
✅ **Read tooltips** - Most UI elements have helpful hover info  

## Keyboard Shortcuts & Quick Access

**General**:
- **ESC**: Close current modal/dialog
- **Click hero portrait**: Quick access to hero details
- **Hover over stats**: Tooltips explain what they do

**Quest Management**:
- Filter heroes by stamina availability
- Sort heroes by profession skill
- "Quest with Best" auto-selects optimal heroes

**Gardens**:
- "Max" button: Stake all LP tokens
- "Harvest All": Claim from all pools at once

## Mobile Access

- DFK works on mobile browsers with web3 wallet
- Install **MetaMask Mobile** or **Trust Wallet**
- Use in-app browser to access game
- All features available (may require landscape mode)
- Touch controls work for all interactions

## Getting Help

**In-Game**:
- Hover tooltips
- Help icons (?)
- Tutorial pop-ups for first-time actions

**External**:
- Official Discord: Real-time community support
- Documentation: `https://docs.defikingdoms.com`
- Developer Docs: `https://devs.defikingdoms.com`
- GraphQL API Playground: `https://api.defikingdoms.com/graphql`

## Advanced: Using the GraphQL API

For hero research before buying:

1. Visit `https://api.defikingdoms.com/graphql`
2. Use GraphiQL interface (GUI)
3. Query hero data

**Example - Find top fishing heroes for sale**:
```graphql
{
  heroes(
    first: 10,
    orderBy: fishing,
    orderDirection: desc,
    where: {
      salePrice_not: null,
      profession: "fishing"
    }
  ) {
    id
    mainClassStr
    level
    fishing
    luck
    agility
    salePrice
  }
}
```

This returns the top 10 fishing-focused heroes currently for sale, sorted by fishing skill.
