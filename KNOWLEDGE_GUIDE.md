# DeFi Kingdoms Knowledge Base - Setup Guide

## ✅ What's Been Done

Your Hedge Ledger bot now has **comprehensive DeFi Kingdoms knowledge** loaded into its system prompt!

### Knowledge Base Files Created

1. **knowledge/heroes.md**
   - All 15 hero classes (Warrior, Knight, Thief, Archer, Priest, Wizard, Monk, Pirate, Paladin, DarkKnight, Summoner, Ninja, Dragoon, Sage, Dreadknight)
   - Hero stats explained (STR, AGI, INT, WIS, LCK, VIT, END, DEX)
   - Best professions for each class
   - Rarity tiers and impacts
   - Leveling tips

2. **knowledge/quests.md**
   - All profession quests (Mining, Gardening, Fishing, Foraging)
   - All training quests (STR, AGI, INT, WIS, END, DEX, VIT, LCK)
   - Quest strategies by goal (XP, gold, materials, profession leveling)
   - Stamina management
   - Reward structures

3. **knowledge/gardens.md**
   - How gardens (liquidity pools) work
   - Popular LP pairs (JEWEL-ONE, CRYSTAL-USDC, etc.)
   - APR calculation formulas
   - Impermanent loss explained
   - Gardening quests with heroes
   - Step-by-step guides for beginners
   - Risk factors and tips

4. **knowledge/ui-navigation.md**
   - Complete UI walkthrough
   - All main locations (Tavern, Gardens, Questing Portal, Trader, Bank)
   - Step-by-step instructions for every action
   - Hero management
   - Common beginner mistakes
   - Pro tips

## 🧠 How It Works

When your bot starts, it:

1. Loads the character prompt from `prompt/hedge-ledger.md`
2. Loads all knowledge files from the `knowledge/` directory
3. Concatenates them into one master system prompt
4. Sends this to OpenAI with every request

This means Hedge can now:
- ✅ Give accurate hero recommendations
- ✅ Explain quest mechanics precisely
- ✅ Calculate garden yields with formulas
- ✅ Guide users through the UI step-by-step
- ✅ Stay in-character while being technically accurate

## 📝 How to Add More Knowledge

### Option 1: Edit Existing Files

Open any file in `knowledge/` and add/update information:

```bash
# Example: Add new hero class info
vim knowledge/heroes.md

# Example: Add new quest type
vim knowledge/quests.md
```

After editing, **restart the bot** (it loads knowledge on startup).

### Option 2: Create New Knowledge Files

1. Create a new `.md` file in `knowledge/` directory:
   ```bash
   touch knowledge/pets.md
   touch knowledge/professions.md
   touch knowledge/tokens.md
   ```

2. Add your content in markdown format

3. Update `bot.js` to include the new file:
   ```javascript
   const KNOWLEDGE_FILES = [
     'knowledge/heroes.md',
     'knowledge/quests.md',
     'knowledge/gardens.md',
     'knowledge/ui-navigation.md',
     'knowledge/pets.md',        // NEW
     'knowledge/professions.md', // NEW
     'knowledge/tokens.md'       // NEW
   ];
   ```

4. Restart the bot

### Option 3: Add Live Data Integration

For real-time data like current APRs, hero marketplace prices, etc., you could:

1. Create API helper functions in `bot.js`
2. Fetch live data from DFK subgraph or APIs
3. Inject that data into the user message before sending to OpenAI

Example:
```javascript
// In bot.js, add a helper
async function getLiveAPR(poolSymbol) {
  // Call DFK API/subgraph
  // Return current APR
}

// Then in /garden command:
const currentAPR = await getLiveAPR(lp);
const userMsg = `Slash Command: /garden yield
- lp_symbol: ${lp}
- amount: ${amount}
- current_apr: ${currentAPR}%  // <-- live data!
...`;
```

## 🧪 Testing the Bot

### Test Hero Knowledge
In your Discord server, try:
```
/hero id:12345
/npc message: What's the best class for mining?
/npc message: Should I use a Wizard or a Warrior for gardening?
```

### Test Quest Knowledge
```
/quest goal:gold
/quest goal:xp
/npc message: What quests give the most JEWEL?
```

### Test Garden Knowledge
```
/garden lp:CRYSTAL-USDC amount:1000
/npc message: Explain impermanent loss
/npc message: How do I add liquidity to gardens?
```

### Test UI Navigation
```
/walkthrough topic:getting-started
/walkthrough topic:gardens
/walkthrough topic:quests
/npc message: How do I send a hero on a quest?
```

## 📊 Knowledge Base Stats

Current knowledge loaded:
- **4 files**
- **~700+ lines** of DeFi Kingdoms information
- **15 hero classes** documented
- **12 quest types** explained
- **Dozens of UI steps** detailed
- **Garden mechanics** fully covered

## 🔄 Updating Knowledge

### When to Update
- New DFK features release
- Game mechanics change
- New realms added
- Community discovers new strategies
- APR formulas adjust

### Best Practices
1. **Keep it accurate**: Verify info with official DFK docs/Discord
2. **Stay concise**: Hedge prefers bullet points, not essays
3. **Use examples**: "e.g., Warrior with STR 50 is ideal for mining"
4. **Update incrementally**: Small, frequent updates > massive rewrites
5. **Test after changes**: Restart bot, test commands

## 🚨 Troubleshooting

### Bot says incorrect information
- Check which knowledge file covers that topic
- Update/fix the content
- Restart bot

### Knowledge not loading
- Check logs: `📚 Loaded X/4 knowledge base files`
- If X < 4, check file paths and permissions
- Make sure files are in `knowledge/` directory

### Bot still gives generic answers
- Knowledge is loaded, but maybe too vague
- Add more specific examples and data points
- Consider adding more files for granular topics

## 🎯 Next Steps

You can now:

1. **Test extensively** in your Discord server
2. **Gather feedback** from users about accuracy
3. **Add more knowledge** as needed (pets, professions, realms, etc.)
4. **Connect live data** for dynamic APRs and prices
5. **Fine-tune** Hedge's personality in `prompt/hedge-ledger.md`

Your bot is now a **DeFi Kingdoms expert NPC**! 🎮✨
