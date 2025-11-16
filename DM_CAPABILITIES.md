# 💬 DM Conversation Enhancements

## ✨ New Feature: Auto-Detect Hero IDs in DMs

Hedge Ledger now automatically detects when you mention hero IDs in DMs and fetches live blockchain data!

### How It Works

**Before:**
```
User: "What class is hero #62?"
Hedge: "I can't pull live data directly, but you can use the GraphQL API..."
```

**Now:**
```
User: "What class is hero #62?"
Hedge: [Fetches blockchain data automatically]
       "Hero #62 is a Paladin with 45 STR and 38 VIT. Not bad for tanking..."
```

### Supported Patterns

The bot automatically detects hero IDs in these formats:
- `hero #62`
- `hero 62`
- `#62`
- `heroes #123 and #456`
- `tell me about hero 789`

### Examples

**Single Hero:**
```
What class is hero #62?
```
→ Hedge fetches Hero #62 data and responds with class, stats, level, etc.

**Multiple Heroes:**
```
Compare hero #100 and hero #200
```
→ Hedge fetches both heroes and provides comparison (up to 3 heroes max)

**Natural Language:**
```
I'm looking at hero 12345 on the marketplace. Is it worth buying?
```
→ Hedge fetches the hero data and provides buying advice based on stats

**Mixed Questions:**
```
What's the best class for fishing? Also, what about hero #5000?
```
→ Hedge answers the general question AND fetches hero #5000 data

### Technical Details

**Regex Pattern:** `/(?:hero\s*#?|#)(\d{1,6})\b/gi`

**Limits:**
- Max 3 heroes per message (prevents spam)
- Hero IDs must be 1-6 digits
- Automatically deduplicates if same ID mentioned twice

**Error Handling:**
- If hero doesn't exist: "Hero #X not found on-chain"
- If API fails: Generic error message with fallback

### Comparison: Slash Commands vs DM

**Slash Commands** (`/hero id:62`)
- ✅ Explicit, structured
- ✅ Auto-complete in Discord
- ✅ Visible to other users (in channels)

**DM Conversations** ("What class is hero #62?")
- ✅ Natural language
- ✅ Can ask follow-up questions
- ✅ Private conversation
- ✅ Automatically detects hero mentions

**Best Practice:** Use whichever feels more natural! Both work identically.

### Code Implementation

Location: `bot.js` lines 146-189

```javascript
// DM handler detects hero IDs
const heroIdPattern = /(?:hero\s*#?|#)(\d{1,6})\b/gi;
const heroMatches = [...message.content.matchAll(heroIdPattern)];

if (heroMatches.length > 0) {
  // Fetch blockchain data for each hero
  const heroIds = [...new Set(heroMatches.map(m => parseInt(m[1])))];
  const heroes = await Promise.all(
    heroIds.slice(0, 3).map(id => onchain.getHeroById(id))
  );
  
  // Inject data into prompt
  enrichedContent += '\n\n📊 LIVE BLOCKCHAIN DATA:\n' + heroSummaries;
}
```

### Benefits

1. **No command syntax required** - Just talk naturally
2. **Context-aware** - Hedge knows when to fetch data
3. **Multi-hero support** - Compare multiple heroes in one message
4. **Maintains personality** - Hedge stays in character while analyzing real data

### Future Enhancements

Possible additions:
- Detect wallet addresses (`0x...`) and auto-fetch portfolio
- Detect marketplace URLs and extract hero IDs
- Detect class names and show marketplace listings
- Detect profession names and show relevant heroes

---

**TL;DR:** You can now ask Hedge about heroes naturally in DMs without using slash commands. Just mention the hero ID and he'll fetch the data automatically! 🎮
