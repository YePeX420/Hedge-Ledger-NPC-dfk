// intent-parser.js
// Intelligent question analysis to determine what data to auto-fetch

/**
 * Parse garden menu trigger (general garden help without specific optimization/APR request)
 * Examples:
 * - "Help with gardens" → { type: 'garden_menu' }
 * - "Tell me about my gardens" → { type: 'garden_menu' }
 * - "Garden assistance" → { type: 'garden_menu' }
 */
export function parseGardenMenuIntent(message) {
  const lowerMsg = message.toLowerCase();
  
  // Garden trigger keywords (specific to Crystalvale gardens - NOT generic "yield")
  const gardenTriggers = /\b(garden|gardens|expedition|lp\s+yield|garden\s+yield|gardening.*help|explain.*gardens?|show.*my.*gardens?|farming.*jewel|farming.*crystal)\b/i;
  
  if (!gardenTriggers.test(message)) {
    return null;
  }
  
  // Direct routing exceptions - these should NOT show menu
  
  // Exception 1: Optimization keywords → direct to Tier 2
  if (/\b(optimize|optimise|best.*setup|maximize|maximise|fix.*my.*gardeners?)\b/i.test(message)) {
    return null; // Will be caught by parseGardenOptimizationIntent instead
  }
  
  // Exception 2: APR keywords → direct to Option 3
  if (/\b(aprs?|rates?.*today|garden.*aprs?|apr.*now)\b/i.test(message)) {
    return null; // Will be caught by parseGardenIntent instead
  }
  
  // If garden keywords present and no direct routing exceptions, show menu
  return { type: 'garden_menu' };
}

/**
 * Parse garden optimization requests
 * Examples:
 * - "Optimize my gardens" → { type: 'garden_optimization_tier2' }
 * - "Analyze my LP positions" → { type: 'garden_optimization_tier2' }
 * - "Garden recommendations" → { type: 'garden_optimization_tier2' }
 */
export function parseGardenOptimizationIntent(message) {
  const lowerMsg = message.toLowerCase();
  
  // Keywords that indicate optimization requests
  const optimizationKeywords = /\b(optimize|optimise|optimization|optimisation|maximize|maximise|best.*setup|fix.*gardeners?|hero.*assign|pet.*assign)\b/i;
  const gardenKeywords = /\b(garden|gardens|lp|pool|pools|position|positions)\b/i;
  
  // Must have both optimization keywords AND garden/LP keywords
  if (optimizationKeywords.test(message) && gardenKeywords.test(message)) {
    return { type: 'garden_optimization_tier2' };
  }
  
  // Specific phrases
  const specificPhrases = /\b(garden optimization|lp optimization|pool optimization|optimize.*garden|garden.*recommendation)\b/i;
  if (specificPhrases.test(message)) {
    return { type: 'garden_optimization_tier2' };
  }
  
  return null;
}

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
    // Gardens
    'druid': ['druid'],
    'seed box': ['seed box', 'seedbox', 'seed-box'],
    'harvest': ['harvest station', 'harvest'],
    
    // Marketplace
    'ragna': ['ragna', 'trader'],
    'brina': ['brina', 'stylist'],
    'hatcher cliff': ['hatcher cliff', 'hatcher', 'cliff'],
    'sheldon': ['sheldon'],
    'hunter fior': ['hunter fior', 'hunter', 'fior'],
    'rahim hassan': ['rahim hassan', 'rahim', 'hassan', 'bazaar'],
    'aoisla': ['aoisla'],
    'vendor': ['vendor', 'gold arbitrage'],
    'crier': ['crier', 'news'],
    'arden': ['arden'],
    'regina': ['regina'],
    'olga': ['olga'],
    
    // Portal & Meditation
    'zagreb': ['zagreb', 'portal master'],
    'amba': ['amba', 'crystal infusion'],
    'esoteric wanderer': ['esoteric wanderer', 'wanderer'],
    
    // Tavern
    'treathor': ['treathor leafblade', 'treathor', 'nft agent'],
    'enderdain': ['enderdain barleychaff', 'enderdain', 'barkeep'],
    'mr. b': ['mr. b', 'mr b', 'mister b', 'visage shop'],
    'elmer': ['elmer longbranch', 'elmer'],
    
    // Jeweler
    'jeweler': ['jeweler'],
    'manager dorarulir': ['manager dorarulir', 'dorarulir', 'gemmaster'],
    
    // Training
    'master erik': ['master erik', 'erik'],
    'nimble bjørn': ['nimble bjørn', 'nimble bjorn', 'bjørn', 'bjorn'],
    'lemira': ['lemira'],
    
    // Docks & Onramps
    'veigar': ['veigar', 'dockmaster'],
    'injured sailor': ['injured sailor', 'sailor', 'onramps'],
    
    // Alchemy
    'the burned man': ['the burned man', 'burned man', 'alchemist'],
    'taddius': ['taddius', 'enchanter'],
    
    // Special
    'veiled summoner': ['veiled summoner', 'dark summoner'],
    'high valkyrie': ['high valkyrie', 'valkyrie', 'divine altar'],
    
    // Professions
    'forester ivanna': ['forester ivanna', 'forester', 'ivanna'],
    'pickman khudmire': ['pickman khudmire', 'pickman', 'khudmire'],
    'fisher mark': ['fisher mark', 'fisher', 'mark'],
    'greenskeeper sivia': ['greenskeeper sivia', 'greenskeeper', 'sivia'],
    
    // Expeditions
    'caravan leader': ['caravan leader', 'caravan']
  };
  
  // Check for direct NPC questions with broader verb coverage
  const npcQuestionPatterns = [
    // Common question patterns
    /(?:where is|where can i find|find|locate|show me|tell me about|who is|what is|what does|which npc)\s+(?:the\s+)?([^?]+)/i,
    /(?:how do i|how to|how can i)\s+(?:use|access|find|get to|reach|visit|talk to)\s+(?:the\s+)?([^?]+)/i,
    // Action-based with NPC mentioned
    /(?:how do i|how to|how can i|where do i|where can i)\s+([^?]+?)\s+(?:at|with|using|via|through)\s+(?:the\s+)?([^?]+)/i
  ];
  
  for (const pattern of npcQuestionPatterns) {
    const match = message.match(pattern);
    if (match) {
      // For patterns with 2 capture groups, check the second group (NPC name)
      const queries = match[2] ? [match[2].toLowerCase().trim()] : [match[1].toLowerCase().trim()];
      
      // Also check the first capture group if it exists
      if (match[1] && match[2]) {
        queries.push(match[1].toLowerCase().trim());
      }
      
      // Check if any query matches any NPC
      for (const query of queries) {
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
  }
  
  // Final pass: scan entire message for any NPC alias mention
  // Only for multi-word aliases to avoid false positives with generic single words
  for (const [npcKey, aliases] of Object.entries(npcNames)) {
    for (const alias of aliases) {
      // Determine if this is a single-word alias (potentially generic)
      const isSingleWord = alias.split(/\s+/).length === 1;
      const hasNPCContext = /\b(npc|character|at the|visit the|talk to|speak to|see the|meet the)\b/i.test(message);
      
      // Create a word-boundary regex for this alias
      const aliasRegex = new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (aliasRegex.test(message)) {
        // Only return if this seems like a question about the NPC
        const hasQuestionWord = /\b(where|how|what|who|which|find|use|access|visit|talk|speak|get to|see|meet)\b/i.test(message);
        
        // For single-word aliases, ALWAYS require NPC context to avoid false positives
        // Multi-word aliases only need question word (they're more specific)
        if (hasQuestionWord && (!isSingleWord || hasNPCContext)) {
          return {
            type: 'npc',
            npc: npcKey
          };
        }
      }
    }
  }
  
  // Action-based mapping (user asking how to do something)
  const actionMappings = {
    // Gardens
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
    ],
    
    // Marketplace
    'ragna': [
      /\b(?:buy|sell|trade|purchase)\s+(?:hero|heroes)\b/i,
      /\bhero\s+(?:market|trading|sales?)\b/i
    ],
    'brina': [
      /\b(?:buy|sell)\s+(?:cosmetic|appearance|style|fashion)\b/i,
      /\bcosmetic\s+items?\b/i
    ],
    'hatcher cliff': [
      /\b(?:buy|sell|hatch|get)\s+(?:pet|pets)\b/i,
      /\bpet\s+market\b/i
    ],
    'sheldon': [
      /\b(?:buy|get)\s+(?:pet\s+)?treats?\b/i,
      /\bpet\s+consumables?\b/i
    ],
    'hunter fior': [
      /\b(?:buy|get)\s+(?:endurance|stamina)\s+(?:vial|potion)s?\b/i,
      /\bendurance\s+(?:boost|vial)s?\b/i
    ],
    'rahim hassan': [
      /\bbazaar\b/i,
      /\b(?:buy|sell)\s+(?:material|materials|items?|goods)\b/i
    ],
    'aoisla': [
      /\b(?:buy|get)\s+(?:dexterity|dex)\s+(?:vial|potion)s?\b/i,
      /\bdexterity\s+(?:boost|vial)s?\b/i
    ],
    'vendor': [
      /\b(?:convert|exchange|swap|trade)\s+(?:gold|GOLD)\b/i,
      /\bgold\s+(?:to|for)\s+crystal\b/i
    ],
    'crier': [
      /\b(?:game|marketplace)\s+(?:news|announcement|update)s?\b/i,
      /\bwhat'?s\s+new\b/i
    ],
    'arden': [
      /\b(?:buy|sell)\s+(?:weapon|weapons|sword|bow|staff)\b/i,
      /\bweapon\s+market\b/i
    ],
    'regina': [
      /\b(?:buy|sell)\s+(?:armor|armour|shield|helmet)\b/i,
      /\barmor\s+market\b/i
    ],
    'olga': [
      /\b(?:buy|get)\s+(?:wisdom|intelligence|int)\s+(?:vial|potion)s?\b/i,
      /\bwisdom\s+(?:boost|vial)s?\b/i
    ],
    
    // Portal & Meditation
    'zagreb': [
      /\b(?:summon|breed|create)\s+(?:hero|heroes)\b/i,
      /\bhero\s+summon(?:ing)?\b/i
    ],
    'amba': [
      /\b(?:infuse|infusion|enhance|boost)\s+(?:hero|crystal)\b/i,
      /\bcrystal\s+infusion\b/i
    ],
    'esoteric wanderer': [
      /\b(?:meditate|meditation|reroll|gene)\b/i,
      /\blevel\s+(?:reset|reroll)\b/i,
      /\bgene\s+reroll(?:ing)?\b/i
    ],
    
    // Tavern
    'treathor': [
      /\b(?:rent|hire|rental)\s+(?:hero|heroes)\b/i,
      /\bhero\s+(?:for\s+hire|rental)\b/i
    ],
    'enderdain': [
      /\b(?:hero\s+)?catalog\b/i,
      /\b(?:view|see|check)\s+(?:my\s+)?heroes\b/i,
      /\btransfer\s+hero(?:es)?\b/i
    ],
    'mr. b': [
      /\b(?:buy|equip)\s+visages?\b/i,
      /\bvisage\s+shop\b/i
    ],
    'elmer': [
      /\bvoid\s+hunts?\b/i,
      /\b(?:daily\s+)?raffle\b/i
    ],
    
    // Jeweler
    'jeweler': [
      /\b(?:stake|staking)\s+jewel\b/i,
      /\bcjewel\b/i,
      /\bgovernance\s+(?:voting|vote)\b/i
    ],
    'manager dorarulir': [
      /\btransfer\s+locked\s+crystal\b/i,
      /\blocked\s+(?:crystal|token)s?\b/i
    ],
    
    // Training
    'master erik': [
      /\b(?:strength|str)\s+training\b/i,
      /\btug\s+of\s+war\b/i,
      /\btrain\s+strength\b/i
    ],
    'nimble bjørn': [
      /\b(?:agility|agi)\s+training\b/i,
      /\blog\s+rolling\b/i,
      /\btrain\s+agility\b/i
    ],
    'lemira': [
      /\b(?:intelligence|int)\s+training\b/i,
      /\btafl\s+match\b/i,
      /\btrain\s+intelligence\b/i
    ],
    
    // Docks & Onramps
    'veigar': [
      /\b(?:travel|go|move)\s+(?:to\s+)?(?:serendale|realm|chain)\b/i,
      /\bcross[- ]?realm\s+travel\b/i
    ],
    'injured sailor': [
      /\b(?:buy|purchase)\s+(?:crypto|crystal|jewel)\s+(?:with\s+)?(?:fiat|cash|card|money)\b/i,
      /\bonramp\b/i
    ],
    
    // Alchemy
    'the burned man': [
      /\b(?:craft|brew|make)\s+(?:potion|elixir|consumable)s?\b/i,
      /\balchemy\b/i
    ],
    'taddius': [
      /\b(?:enchant|enchanting|enchantment)\b/i,
      /\benchant\s+(?:weapon|armor|equipment|gear)\b/i
    ],
    
    // Special
    'veiled summoner': [
      /\bdark\s+summon(?:ing)?\b/i,
      /\bdark\s+hero(?:es)?\b/i
    ],
    'high valkyrie': [
      /\b(?:angel|demon)\s+(?:attunement|transformation)\b/i,
      /\bdivine\s+altar\b/i
    ],
    
    // Professions
    'forester ivanna': [
      /\b(?:forage|foraging|gather)\b/i,
      /\bforest\s+quest\b/i
    ],
    'pickman khudmire': [
      /\b(?:mine|mining)\b/i,
      /\bmining\s+quest\b/i
    ],
    'fisher mark': [
      /\b(?:fish|fishing)\b/i,
      /\bfishing\s+quest\b/i
    ],
    'greenskeeper sivia': [
      /\b(?:garden|gardening)\b/i,
      /\bgardening\s+quest\b/i
    ],
    
    // Expeditions
    'caravan leader': [
      /\b(?:expedition|expeditions)\b/i,
      /\bexpedition\s+(?:quest|rewards?)\b/i
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
 * Priority: Wallet → Garden Optimization → Garden Menu → Garden APRs → Market → NPC
 */
export function parseIntent(message) {
  // Try wallet first (most specific - requires address + non-garden keywords)
  const walletIntent = parseWalletIntent(message);
  if (walletIntent) return walletIntent;
  
  // Check for garden optimization before any other garden queries (most specific garden intent)
  const gardenOptIntent = parseGardenOptimizationIntent(message);
  if (gardenOptIntent) return gardenOptIntent;
  
  // Check for garden menu trigger (general garden help) BEFORE specific APR queries
  // This ensures "help with gardens" shows menu instead of going to parseGardenIntent
  const gardenMenuIntent = parseGardenMenuIntent(message);
  if (gardenMenuIntent) return gardenMenuIntent;
  
  // Then garden APRs/pool queries (includes garden-specific wallet queries like "harvest rewards 0x...")
  // This runs AFTER menu check so specific APR requests bypass the menu
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
    case 'garden_menu':
      return 'Garden: Show menu';
    case 'garden_optimization_tier2':
      return 'Garden: Full Optimization (Tier 2 - 25 JEWEL)';
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
