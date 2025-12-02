/**
 * OpenAI Function Calling Schema for Agentic Hedge
 * 
 * Defines all engines as callable tools that GPT can invoke based on user intent.
 * Each tool corresponds to a backend engine (Hero, Garden, FVE, Summon).
 */

/**
 * Hero Engine Tools
 */
const HERO_TOOLS = [
  {
    type: "function",
    function: {
      name: "get_hero_info",
      description: "Get detailed information about a specific DeFi Kingdoms hero including stats, class, professions, level, and recommendations for best use cases (questing, gardening, summoning).",
      parameters: {
        type: "object",
        properties: {
          hero_id: {
            type: "integer",
            description: "The hero ID number (e.g., 12345)"
          }
        },
        required: ["hero_id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "compare_heroes",
      description: "Compare multiple heroes side-by-side to help user decide which to buy, use for quests, or breed. Shows stats, professions, and strategic differences.",
      parameters: {
        type: "object",
        properties: {
          hero_ids: {
            type: "array",
            items: { type: "integer" },
            description: "Array of 2-5 hero IDs to compare (e.g., [123, 456, 789])"
          }
        },
        required: ["hero_ids"]
      }
    }
  }
];

/**
 * Garden Engine Tools
 */
const GARDEN_TOOLS = [
  {
    type: "function",
    function: {
      name: "get_garden_pools_free",
      description: "Get basic analytics for Crystalvale garden pools including fee APR, emission APR, and TVL. Free tier - does NOT include hero boost optimization for gardening quests.",
      parameters: {
        type: "object",
        properties: {
          pool_id: {
            type: "integer",
            description: "Specific pool ID (0-based index). Omit to return all pools."
          }
        },
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_garden_pools_premium",
      description: "Get comprehensive garden pool analytics INCLUDING hero boost optimization for gardening quests (APR ranges, best hero recommendations, Rapid Renewal calculations). Paid feature.",
      parameters: {
        type: "object",
        properties: {
          pool_id: {
            type: "integer",
            description: "Specific pool ID (0-based index). Omit to return all pools."
          }
        },
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_wallet_gardens",
      description: "Return REAL Crystalvale garden LP positions directly from the staking contract for a given wallet. Use this whenever a user asks about *their* gardens or LPs. Do NOT guess pool names.",
      parameters: {
        type: "object",
        properties: {
          wallet_address: {
            type: "string",
            description: "Ethereum wallet address (0x...) of the user whose gardens should be analyzed"
          }
        },
        required: ["wallet_address"]
      }
    }
  }
];

/**
 * Fair Value Engine Tools
 */
const FVE_TOOLS = [
  {
    type: "function",
    function: {
      name: "get_hero_fair_value",
      description: "Calculate fair market value for a hero based on recent Tavern sales, trait weights, and market trends. Uses machine learning to estimate realistic price range. Paid feature only.",
      parameters: {
        type: "object",
        properties: {
          hero_id: {
            type: "integer",
            description: "Hero ID to value"
          }
        },
        required: ["hero_id"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_market_trends",
      description: "Get 7d/30d/90d price trends for hero market, including floor prices by class/rarity and market velocity. Paid feature only.",
      parameters: {
        type: "object",
        properties: {
          timeframe: {
            type: "string",
            enum: ["7d", "30d", "90d"],
            description: "Lookback period for trend analysis",
            default: "30d"
          }
        },
        required: []
      }
    }
  }
];

/**
 * Summon Engine Tools
 */
const SUMMON_TOOLS = [
  {
    type: "function",
    function: {
      name: "get_summon_odds",
      description: "Calculate summon (breeding) probabilities for offspring class, stat ranges, and gene inheritance when pairing two heroes. Includes cost analysis and expected value. Paid feature only.",
      parameters: {
        type: "object",
        properties: {
          parent_a_id: {
            type: "integer",
            description: "First parent hero ID"
          },
          parent_b_id: {
            type: "integer",
            description: "Second parent hero ID"
          }
        },
        required: ["parent_a_id", "parent_b_id"]
      }
    }
  }
];

/**
 * Knowledge Base Tools (Always Free)
 */
const KNOWLEDGE_TOOLS = [
  {
    type: "function",
    function: {
      name: "get_walkthrough",
      description: "Get step-by-step beginner tutorials for DeFi Kingdoms UI navigation, quest mechanics, or game concepts. Always free.",
      parameters: {
        type: "object",
        properties: {
          topic: {
            type: "string",
            enum: ["getting-started", "quests", "gardens", "summoning", "pets", "interface", "heroes"],
            description: "Tutorial topic"
          }
        },
        required: ["topic"]
      }
    }
  }
];

/**
 * All Available Tools
 */
const ALL_TOOLS = [
  ...HERO_TOOLS,
  ...GARDEN_TOOLS,
  ...FVE_TOOLS,
  ...SUMMON_TOOLS,
  ...KNOWLEDGE_TOOLS
];

/**
 * Free Tier Tools (no balance check required)
 */
const FREE_TIER_TOOLS = [
  "get_walkthrough",
  "get_hero_info",              // Basic hero lookup is free
  "get_garden_pools_free"       // Basic APRs are free (without optimization)
];

/**
 * Tool Pricing (in JEWEL)
 */
const TOOL_BASE_PRICES = {
  // Hero Engine
  get_hero_info: 0.0,                // Free
  compare_heroes: 0.15,

  // Garden Engine
  get_garden_pools_free: 0.0,        // Free for basic APRs
  get_garden_pools_premium: 0.15,    // Paid for optimization
  get_wallet_gardens: 0.20,

  // Fair Value Engine
  get_hero_fair_value: 0.30,
  get_market_trends: 0.25,

  // Summon Engine
  get_summon_odds: 0.25,

  // Knowledge Base
  get_walkthrough: 0.0               // Always free
};

module.exports = {
  ALL_TOOLS,
  FREE_TIER_TOOLS,
  TOOL_BASE_PRICES,
  HERO_TOOLS,
  GARDEN_TOOLS,
  FVE_TOOLS,
  SUMMON_TOOLS,
  KNOWLEDGE_TOOLS
};