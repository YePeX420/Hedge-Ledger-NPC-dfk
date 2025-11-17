// intent-parser.js
// Intelligent question analysis to determine what data to auto-fetch

/**
 * Parse garden/pool/APR questions
 * Examples:
 * - "What are current garden APRs?" → { type: 'garden', action: 'all' }
 * - "How's the CRYSTAL pool doing?" → { type: 'garden', action: 'pool', pool: 'CRYSTAL' }
 * - "What's the APR on JEWEL-USDC?" → { type: 'garden', action: 'pool', pool: 'JEWEL-USDC' }
 * - "My pending rewards 0x123..." → { type: 'garden', action: 'wallet', wallet: '0x123...' }
 */
export function parseGardenIntent(message) {
  const lowerMsg = message.toLowerCase();
  
  // Check for wallet-specific GARDEN/REWARDS queries first
  // These are garden queries even without general pool keywords
  const walletMatch = message.match(/\b(0x[a-fA-F0-9]{40})\b/);
  const isGardenWallet = /\b(reward|rewards|harvest|harvesting|pending|staked|staking)\b/i.test(message);
  
  if (walletMatch && isGardenWallet) {
    return {
      type: 'garden',
      action: 'wallet',
      wallet: walletMatch[1]
    };
  }
  
  // Keywords that indicate general garden/pool questions
  const gardenKeywords = /\b(pool|pools|apr|aprs|garden|gardens|yield|liquidity|tvl|lp|emission|fee)\b/gi;
  if (!gardenKeywords.test(message)) {
    return null;
  }
  
  // Check for specific pool names
  // Common pool patterns: "CRYSTAL-USDC", "JEWEL CRYSTAL", "CRYSTAL pool", etc.
  const poolPatterns = [
    /\b(CRYSTAL[-\s]USDC|CRYSTAL[-\s]JEWEL|JEWEL[-\s]CRYSTAL|AVAX[-\s]CRYSTAL|JEWEL[-\s]USDC|JEWEL[-\s]AVAX)\b/i,
    /\b(CRYSTAL|JEWEL|AVAX|USDC)(?:\s+pool|\s+pair|-USDC|-JEWEL|-AVAX|-CRYSTAL)/i,
    /\bpool[:\s]+([A-Z]+(?:[-\s][A-Z]+)?)/i
  ];
  
  // Generic keywords that should NOT be treated as pool names
  const genericKeywords = /\b(garden|gardens|apr|aprs|yield|yields|rate|rates|pool|pools|all|current|latest|top)\b/i;
  
  for (const pattern of poolPatterns) {
    const match = message.match(pattern);
    if (match) {
      // Extract and normalize pool name
      let poolName = match[1] || match[0];
      poolName = poolName.replace(/\s+pool$/i, '').replace(/\s+pair$/i, '').trim();
      
      // Skip if this is a generic keyword, not an actual pool name
      if (genericKeywords.test(poolName)) {
        continue;
      }
      
      return {
        type: 'garden',
        action: 'pool',
        pool: poolName
      };
    }
  }
  
  // Check for "all pools" or general APR questions
  if (/\b(all|every|current|latest|top)\b.*\b(pool|apr|garden)/i.test(message) ||
      /\bwhat.*apr/i.test(message) ||
      /\bhow.*(?:pool|garden).*doing/i.test(message)) {
    return {
      type: 'garden',
      action: 'all'
    };
  }
  
  // Default: if garden keywords present but no specific action detected, show all pools
  return {
    type: 'garden',
    action: 'all'
  };
}

/**
 * Parse marketplace questions
 * Examples:
 * - "What wizards are for sale?" → { type: 'market', class: 'wizard' }
 * - "Show me cheap priests" → { type: 'market', class: 'priest' }
 * - "What's on the market?" → { type: 'market' }
 * - "Heroes for sale under 100 JEWEL" → { type: 'market', maxPrice: 100 }
 */
export function parseMarketIntent(message) {
  const lowerMsg = message.toLowerCase();
  
  // Keywords that indicate market questions
  const marketKeywords = /\b(market|marketplace|for sale|buying|purchase|buy|cheap|expensive|price|listing)\b/i;
  if (!marketKeywords.test(message)) {
    return null;
  }
  
  const intent = { type: 'market' };
  
  // Check for hero classes
  const classes = [
    'warrior', 'knight', 'thief', 'archer', 'priest', 'wizard', 'monk',
    'pirate', 'paladin', 'darknight', 'summoner', 'ninja', 'dragoon',
    'sage', 'dreadknight'
  ];
  
  for (const heroClass of classes) {
    if (new RegExp(`\\b${heroClass}s?\\b`, 'i').test(message)) {
      intent.class = heroClass;
      break;
    }
  }
  
  // Check for price constraints
  const priceMatch = message.match(/(?:under|below|less than|max|maximum)\s*(\d+)\s*(?:jewel|crystal)?/i);
  if (priceMatch) {
    intent.maxPrice = parseInt(priceMatch[1]);
  }
  
  // Check for "cheap" or "expensive"
  if (/\bcheap(?:est)?\b/i.test(message)) {
    intent.sortBy = 'price_asc';
  }
  
  return intent;
}

/**
 * Parse NPC/navigation questions
 * Examples:
 * - "Where is the druid?" → { type: 'npc', npc: 'druid' }
 * - "How do I use the harvest?" → { type: 'npc', npc: 'harvest' }
 * - "What does the seed box do?" → { type: 'npc', npc: 'seed box' }
 * - "How do I add liquidity?" → { type: 'npc', action: 'add liquidity' }
 * - "How do I harvest rewards?" → { type: 'npc', action: 'harvest rewards' }
 */
export function parseNPCIntent(message) {
  const lowerMsg = message.toLowerCase();
  
  // Direct NPC name mentions
  const npcNames = {
    'druid': ['druid'],
    'seed box': ['seed box', 'seedbox', 'seed-box'],
    'harvest': ['harvest station', 'harvest']
  };
  
  // Check for direct NPC questions
  const npcQuestionPatterns = [
    /(?:where is|find|locate|show me|tell me about|who is|what is|what does|how do i use|how to use)\s+(?:the\s+)?([^?]+)/i,
    /\b(druid|seed\s*box|harvest(?:\s+station)?)\b/i
  ];
  
  for (const pattern of npcQuestionPatterns) {
    const match = message.match(pattern);
    if (match) {
      const query = match[1] ? match[1].toLowerCase().trim() : match[0].toLowerCase().trim();
      
      // Check if query matches any NPC
      for (const [npcKey, aliases] of Object.entries(npcNames)) {
        for (const alias of aliases) {
          if (query.includes(alias)) {
            return {
              type: 'npc',
              npc: npcKey
            };
          }
        }
      }
    }
  }
  
  // Action-based mapping (user asking how to do something)
  const actionMappings = {
    'druid': [
      /\b(?:add|deposit|provide|give)\s+(?:liquidity|lp|tokens?)\b/i,
      /\b(?:remove|withdraw|take out)\s+(?:liquidity|lp|tokens?)\b/i,
      /\bmanage\s+(?:liquidity|pool|lp)\b/i,
      /\bview\s+(?:pool|pools|garden)\s+(?:stats?|data|info)\b/i
    ],
    'seed box': [
      /\bcheck\s+(?:pool|garden)\s+(?:data|stats?|apr)\b/i,
      /\bview\s+(?:all\s+)?(?:pools?|gardens?)\b/i,
      /\bbrowse\s+(?:pools?|gardens?)\b/i
    ],
    'harvest': [
      /\b(?:harvest|claim|collect)\s+(?:rewards?|distribution|emissions?)\b/i,
      /\bget\s+(?:my\s+)?(?:rewards?|jewel|crystal)\b/i
    ]
  };
  
  for (const [npcKey, patterns] of Object.entries(actionMappings)) {
    for (const pattern of patterns) {
      if (pattern.test(message)) {
        return {
          type: 'npc',
          npc: npcKey,
          action: message.match(pattern)[0]
        };
      }
    }
  }
  
  return null;
}

/**
 * Parse wallet/portfolio questions
 * Examples:
 * - "What's in wallet 0x123...?" → { type: 'wallet', address: '0x123...' }
 * - "Show my portfolio 0x456..." → { type: 'wallet', address: '0x456...' }
 * - "Analyze 0x789..." → { type: 'wallet', address: '0x789...' }
 * - "What heroes does 0x... own?" → { type: 'wallet', address: '0x...' }
 */
export function parseWalletIntent(message) {
  // Look for wallet addresses (0x + 40 hex chars)
  const walletMatch = message.match(/\b(0x[a-fA-F0-9]{40})\b/);
  if (!walletMatch) {
    return null;
  }
  
  // Keywords that indicate wallet/portfolio questions (not garden-specific)
  const walletKeywords = /\b(wallet|portfolio|address|holdings?|owns?|owned|analyze|check|heroes?|inventory)\b/i;
  // Exclude garden-specific contexts
  const isGardenContext = /\b(reward|rewards|harvest|pending|staked|staking|apr|pool|yield)\b/i.test(message);
  
  if (walletKeywords.test(message) && !isGardenContext) {
    return {
      type: 'wallet',
      address: walletMatch[1]
    };
  }
  
  return null;
}

/**
 * Master intent parser - tries all parsers in order
 * Priority: Data queries first (wallet/garden/market), then NPC help
 */
export function parseIntent(message) {
  // Try wallet first (most specific - requires address + non-garden keywords)
  const walletIntent = parseWalletIntent(message);
  if (walletIntent) return walletIntent;
  
  // Then garden (includes garden-specific wallet queries like "harvest rewards 0x...")
  const gardenIntent = parseGardenIntent(message);
  if (gardenIntent) return gardenIntent;
  
  // Then market
  const marketIntent = parseMarketIntent(message);
  if (marketIntent) return marketIntent;
  
  // Finally NPC queries (navigation/help questions)
  // This runs last to avoid catching "harvest rewards" when user wants wallet data
  const npcIntent = parseNPCIntent(message);
  if (npcIntent) return npcIntent;
  
  // No specific intent detected
  return null;
}

/**
 * Format intent for logging/debugging
 */
export function formatIntent(intent) {
  if (!intent) return 'No intent detected';
  
  switch (intent.type) {
    case 'npc':
      if (intent.action) {
        return `NPC: ${intent.npc} (action: ${intent.action})`;
      }
      return `NPC: ${intent.npc}`;
    case 'garden':
      if (intent.action === 'all') return 'Garden: Show all pools';
      if (intent.action === 'pool') return `Garden: Pool ${intent.pool}`;
      if (intent.action === 'wallet') return `Garden: Wallet ${intent.wallet}`;
      break;
    case 'market':
      const parts = ['Market:'];
      if (intent.class) parts.push(`class=${intent.class}`);
      if (intent.maxPrice) parts.push(`maxPrice=${intent.maxPrice}`);
      if (intent.sortBy) parts.push(`sortBy=${intent.sortBy}`);
      return parts.join(' ');
    case 'wallet':
      return `Wallet: ${intent.address}`;
  }
  
  return JSON.stringify(intent);
}
