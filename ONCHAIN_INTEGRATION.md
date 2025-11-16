# 🔗 On-Chain Data Integration - STATUS

## ✅ Completed

1. **GraphQL Client Installed** ✅
   - Package: `graphql-request` (already installed)
   - No auth required (public DFK GraphQL API)

2. **On-Chain Data Module Created** ✅  
   - File: `onchain-data.js`
   - Functions:
     - `getHeroById()` - Fetch hero data by ID
     - `searchHeroes()` - Search by class/profession/price
     - `getCheapestHeroes()` - Marketplace listings
     - `getHeroesByOwner()` - Wallet portfolio
     - `getMarketStats()` - Market analytics
     - `formatHeroSummary()` - Display formatting
     - Helper utils (weiToToken, normalizeHeroId)

3. **New Slash Commands Registered** ✅
   - `/market` - Browse marketplace
   - `/lookup` - Search heroes
   - `/wallet` - View portfolio
   - Updated `/hero` description to mention LIVE data

## 🔨 Remaining Work

### bot.js Integration

The bot.js file needs manual updates to integrate on-chain data:

**Line 5:** Import module
```javascript
import * as onchain from './onchain-data.js';
```

**Lines 197-205:** Replace `/hero` handler
```javascript
if (name === 'hero') {
  const id = interaction.options.getInteger('id', true);
  const hero = await onchain.getHeroById(id);
  if (!hero) {
    await interaction.editReply(`Hero #${id} not found on-chain.`);
    return;
  }
  const heroData = onchain.formatHeroSummary(hero);
  const userMsg = `LIVE DATA:\n\n${heroData}\n\nRespond as Hedge.`;
  const reply = await askHedge([{ role: 'user', content: userMsg }]);
  await interaction.editReply(reply);
  return;
}
```

**Before line 265** ("That command's not wired yet"), add:

```javascript
if (name === 'market') {
  const mainClass = interaction.options.getString('class');
  const limit = interaction.options.getInteger('limit') || 10;
  const heroes = await onchain.getCheapestHeroes(mainClass, limit);
  if (!heroes || heroes.length === 0) {
    await interaction.editReply('No heroes found with those filters.');
    return;
  }
  let listings = `📊 **Live Marketplace** (${heroes.length} results)\n\n`;
  heroes.forEach((hero, i) => {
    const price = onchain.weiToToken(hero.salePrice);
    const rarity = ['Common', 'Uncommon', 'Rare', 'Legendary', 'Mythic'][hero.rarity];
    listings += `${i+1}. **#${hero.normalizedId}** - ${hero.mainClassStr} | ${rarity} | Lvl ${hero.level} → **${price}** JEWEL\n`;
  });
  const userMsg = `LIVE MARKET:\n\n${listings}\n\nAnalyze as Hedge.`;
  const reply = await askHedge([{ role: 'user', content: userMsg }]);
  await interaction.editReply(reply);
  return;
}

if (name === 'lookup') {
  const mainClass = interaction.options.getString('class');
  const profession = interaction.options.getString('profession');
  const forSale = interaction.options.getBoolean('for_sale') || false;
  const minLevel = interaction.options.getInteger('min_level');
  const heroes = await onchain.searchHeroes({ mainClass, profession, forSale, minLevel, limit: 15 });
  if (!heroes || heroes.length === 0) {
    await interaction.editReply('No heroes found.');
    return;
  }
  let results = `🔍 **Search Results** (${heroes.length})\n\n`;
  heroes.forEach((hero, i) => {
    const price = hero.salePrice ? `${onchain.weiToToken(hero.salePrice)} JEWEL` : 'Not for sale';
    results += `${i+1}. **#${hero.normalizedId}** - ${hero.mainClassStr} | Lvl ${hero.level} | ${price}\n`;
  });
  const userMsg = `LIVE SEARCH:\n\n${results}\n\nAnalyze as Hedge.`;
  const reply = await askHedge([{ role: 'user', content: userMsg }]);
  await interaction.editReply(reply);
  return;
}

if (name === 'wallet') {
  const address = interaction.options.getString('address', true);
  if (!address.match(/^0x[a-fA-F0-9]{40}$/)) {
    await interaction.editReply('Invalid wallet address.');
    return;
  }
  const heroes = await onchain.getHeroesByOwner(address, 30);
  if (!heroes || heroes.length === 0) {
    await interaction.editReply('No heroes found for this wallet.');
    return;
  }
  const byClass = {};
  heroes.forEach(h => { byClass[h.mainClassStr] = (byClass[h.mainClassStr] || 0) + 1; });
  let portfolio = `👛 **Portfolio** - ${heroes.length} heroes\n\n`;
  portfolio += `**By Class:** ${Object.entries(byClass).map(([cls, cnt]) => `${cls}: ${cnt}`).join(', ')}\n\n`;
  heroes.slice(0, 10).forEach((hero, i) => {
    portfolio += `${i+1}. #${hero.normalizedId} - ${hero.mainClassStr} | Lvl ${hero.level}\n`;
  });
  const userMsg = `LIVE PORTFOLIO:\n\n${portfolio}\n\nAnalyze as Hedge.`;
  const reply = await askHedge([{ role: 'user', content: userMsg }]);
  await interaction.editReply(reply);
  return;
}
```

## 🎯 Summary

**What's Working:**
- On-chain data module fully functional
- GraphQL queries ready to use
- Discord commands registered

**Next Step:**
Manual code integration into bot.js (3 edits needed):
1. Import onchain module (line 5)
2. Update /hero handler (lines 197-205)
3. Add new command handlers (before line 265)

Once integrated, users can:
- `/hero 12345` → See LIVE blockchain hero data
- `/market class:Wizard` → Browse live marketplace
- `/lookup profession:gardening for_sale:true` → Search heroes
- `/wallet 0x...` → View wallet portfolio

**Test Commands After Integration:**
```
/hero 1
/market class:Paladin limit:5
/lookup for_sale:true min_level:5
/wallet 0x2E7669F61eA77F02445A015FBdcFe2DE47083E02
```
