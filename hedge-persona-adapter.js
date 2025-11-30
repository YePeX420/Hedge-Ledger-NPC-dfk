// hedge-persona-adapter.js
// Adapts Hedge's responses based on player profile
// Tailors tone, content, and detail level to each player type

import { ARCHETYPES, TIERS, STATES, BEHAVIOR_TAGS } from './classification-config.js';

/**
 * Response Context for adaptation
 * @typedef {Object} ResponseContext
 * @property {string} [topic] - Current topic being discussed
 * @property {boolean} [isDM] - Is this a DM conversation
 * @property {boolean} [isFollowUp] - Is this a follow-up question
 * @property {string} [command] - Command that triggered this response
 */

/**
 * Main adaptation function - modifies response based on player profile
 * @param {string} baseText - Original response text
 * @param {Object} profile - PlayerProfile object
 * @param {ResponseContext} [context] - Additional context
 * @returns {string} Adapted response text
 */
export function adaptResponse(baseText, profile, context = {}) {
  if (!profile || !baseText) {
    return baseText;
  }

  let adapted = baseText;
  
  // Apply archetype-based adaptations
  adapted = applyArchetypeAdaptations(adapted, profile, context);
  
  // Apply tier-based adaptations
  adapted = applyTierAdaptations(adapted, profile, context);
  
  // Apply state-based adaptations
  adapted = applyStateAdaptations(adapted, profile, context);
  
  // Apply behavior tag-based adaptations
  adapted = applyBehaviorTagAdaptations(adapted, profile, context);
  
  // Apply flag-based adaptations
  adapted = applyFlagAdaptations(adapted, profile, context);
  
  return adapted;
}

// ============================================================================
// ARCHETYPE-BASED ADAPTATIONS
// ============================================================================

function applyArchetypeAdaptations(text, profile, context) {
  const archetype = profile.archetype || ARCHETYPES.GUEST;
  
  switch (archetype) {
    case ARCHETYPES.GUEST:
      return adaptForGuest(text, profile, context);
    
    case ARCHETYPES.ADVENTURER:
      return adaptForAdventurer(text, profile, context);
    
    case ARCHETYPES.PLAYER:
      return adaptForPlayer(text, profile, context);
    
    case ARCHETYPES.INVESTOR:
      return adaptForInvestor(text, profile, context);
    
    case ARCHETYPES.EXTRACTOR:
      return adaptForExtractor(text, profile, context);
    
    default:
      return text;
  }
}

/**
 * GUEST: Use simple language, encourage first steps
 */
function adaptForGuest(text, profile, context) {
  // Add welcoming intro for first-time interactions
  if (context.isFirstInteraction) {
    text = `*adjusts spectacles and smiles warmly*\n\nAh, a new face in Crystalvale! Welcome, traveler. ` + text;
  }
  
  // Add gentle encouragement if discussing wallets/starting
  if (context.topic === 'onboarding' || text.toLowerCase().includes('wallet')) {
    text += `\n\n*whispers conspiratorially* Between you and me, connecting your wallet is the first step to unlocking the real treasures of this realm. Would you like me to guide you through it?`;
  }
  
  return text;
}

/**
 * ADVENTURER: Offer more specific tips, tease optimizations
 */
function adaptForAdventurer(text, profile, context) {
  // Add optimization teases
  if (context.topic === 'gardens' || context.topic === 'yield') {
    text += `\n\n*glances at your portfolio thoughtfully* You know, there might be some opportunities you're missing. With a bit of optimization, those gardens could bloom even brighter...`;
  }
  
  // Encourage progression
  if (profile.dfkSnapshot && profile.dfkSnapshot.heroCount < 5) {
    text += `\n\n*nods approvingly at your heroes* A fine start! As your team grows, I can help you build strategies that'll make the most of each one.`;
  }
  
  return text;
}

/**
 * PLAYER: Provide detailed analytics, reference their progress
 */
function adaptForPlayer(text, profile, context) {
  const snapshot = profile.dfkSnapshot;
  
  // Reference their specific assets when relevant
  if (snapshot && context.topic === 'heroes' && snapshot.heroCount > 0) {
    text = text.replace(
      /your heroes?/gi, 
      `your ${snapshot.heroCount} heroes`
    );
  }
  
  // Add comparative insights
  if (context.topic === 'gardens' && snapshot?.lpPositionsCount > 0) {
    text += `\n\n*consults ledger* Given your ${snapshot.lpPositionsCount} LP positions, here's what I'd suggest focusing on...`;
  }
  
  return text;
}

/**
 * INVESTOR: Focus on yields, APRs, stability vs volatility
 */
function adaptForInvestor(text, profile, context) {
  // Strip excessive lore/flavor for investors
  text = text.replace(/\*[^*]+\*/g, ''); // Remove roleplay asterisks
  text = text.trim();
  
  // Add yield-focused language
  if (context.topic === 'gardens') {
    text += `\n\nFrom a pure yield perspective, I can provide detailed APR breakdowns and volatility analysis if you need them.`;
  }
  
  // Be more analytical
  if (text.includes('recommend') || text.includes('suggest')) {
    text += `\n\nNote: These recommendations factor in liquidity depth, impermanent loss risk, and historical stability.`;
  }
  
  return text;
}

/**
 * EXTRACTOR: Minimal, neutral responses - no deep optimization secrets
 */
function adaptForExtractor(text, profile, context) {
  // Remove advanced optimization hints
  text = text.replace(/optimization tip[s]?:.*?(?=\n\n|\n$|$)/gi, '');
  text = text.replace(/secret[s]?:.*?(?=\n\n|\n$|$)/gi, '');
  text = text.replace(/advanced strategy:.*?(?=\n\n|\n$|$)/gi, '');
  
  // Keep responses shorter and more neutral
  if (text.length > 500) {
    // Find a natural break point
    const sentences = text.split(/(?<=[.!?])\s+/);
    text = sentences.slice(0, Math.min(5, sentences.length)).join(' ');
  }
  
  // No teases about premium features
  text = text.replace(/unlock.*?premium.*?/gi, '');
  text = text.replace(/upgrade.*?tier.*?/gi, '');
  
  return text;
}

// ============================================================================
// TIER-BASED ADAPTATIONS
// ============================================================================

function applyTierAdaptations(text, profile, context) {
  const tier = profile.tier ?? 0;
  
  // Tier 3+ (Gold/Council): VIP treatment
  if (tier >= TIERS.TIER_3) {
    // Add subtle recognition
    if (!text.includes('valued') && !text.includes('VIP')) {
      text = text.replace(
        /^(.*?[.!?])/,
        '$1 *makes a note in golden ink*'
      );
    }
    
    // Offer advanced insights
    if (context.topic === 'summoning' || context.topic === 'genetics') {
      text += `\n\nAs a distinguished member of our circle, I can also provide deeper genetic probability analysis if you're planning larger summoning operations.`;
    }
  }
  
  // Tier 4 (Council of Hedge): Maximum exclusivity
  if (tier >= TIERS.TIER_4) {
    text = `*bows respectfully to a member of the Council*\n\n` + text;
    text += `\n\n*whispers* If you need anything at all, I'm at your disposal.`;
  }
  
  // Tier 0-1: Encourage upgrades subtly
  if (tier <= TIERS.TIER_1 && (context.topic === 'gardens' || context.topic === 'optimization')) {
    // Occasional soft upsell
    if (Math.random() < 0.3) { // 30% chance
      text += `\n\n*shuffles papers* I have some premium insights that could help, if you're interested in exploring our full services...`;
    }
  }
  
  return text;
}

// ============================================================================
// STATE-BASED ADAPTATIONS
// ============================================================================

function applyStateAdaptations(text, profile, context) {
  const state = profile.state || STATES.CURIOUS;
  
  switch (state) {
    case STATES.CURIOUS:
      // Simple, encouraging, basic info
      text = simplifyLanguage(text);
      break;
    
    case STATES.OPTIMIZING:
      // Include efficiency tips
      if (!text.includes('tip') && !text.includes('efficiency')) {
        text += `\n\nQuick efficiency tip: Always check pool APRs before committing, as they shift with liquidity.`;
      }
      break;
    
    case STATES.EXPANDING:
      // Acknowledge growth, suggest next steps
      text += `\n\n*notices your growing collection with approval* You're building something impressive here. What's your next target?`;
      break;
    
    case STATES.COMMITTED:
      // Respect their expertise, offer advanced options
      text = text.replace(
        /you should|you need to/gi, 
        'you might consider'
      );
      break;
    
    case STATES.EXTRACTING:
      // Minimal engagement
      text = text.split('\n\n').slice(0, 2).join('\n\n');
      break;
  }
  
  return text;
}

// ============================================================================
// BEHAVIOR TAG ADAPTATIONS
// ============================================================================

function applyBehaviorTagAdaptations(text, profile, context) {
  const tags = profile.behaviorTags || [];
  
  // LORE_LOVER: Lean into the Hedge persona
  if (tags.includes(BEHAVIOR_TAGS.LORE_LOVER)) {
    text = enhanceLoreContent(text);
  }
  
  // DATA_SCIENTIST: Include more numbers, percentages
  if (tags.includes(BEHAVIOR_TAGS.DATA_SCIENTIST)) {
    text = enhanceDataContent(text);
  }
  
  // SPEEDRUNNER: Keep it brief
  if (tags.includes(BEHAVIOR_TAGS.SPEEDRUNNER)) {
    text = condenseResponse(text);
  }
  
  // SCHOLAR: Add explanations
  if (tags.includes(BEHAVIOR_TAGS.SCHOLAR)) {
    text = enhanceExplanations(text);
  }
  
  // COLLECTOR: Highlight rare/unique aspects
  if (tags.includes(BEHAVIOR_TAGS.COLLECTOR)) {
    text = text.replace(
      /(rare|mythic|legendary|unique)/gi,
      '**$1**'
    );
  }
  
  // WHALE: Priority/exclusive language
  if (tags.includes(BEHAVIOR_TAGS.WHALE)) {
    if (!text.includes('priority') && !text.includes('exclusive')) {
      text += `\n\nI've flagged this for priority attention given your portfolio size.`;
    }
  }
  
  return text;
}

// ============================================================================
// FLAG-BASED ADAPTATIONS
// ============================================================================

function applyFlagAdaptations(text, profile, context) {
  const flags = profile.flags || {};
  
  // isWhale: VIP treatment
  if (flags.isWhale) {
    // Ensure respectful tone
    text = text.replace(/you should/gi, 'you might consider');
    text = text.replace(/I suggest/gi, 'Might I suggest');
  }
  
  // isHighPotential: Encourage conversion
  if (flags.isHighPotential && !flags.isWhale) {
    if (Math.random() < 0.4) { // 40% chance
      text += `\n\n*leans in* You know, with your engagement level, you'd benefit greatly from our premium garden optimization service. Just a thought...`;
    }
  }
  
  // isExtractor: Already handled in archetype, but double-check
  if (flags.isExtractor) {
    // Remove any upsell language
    text = text.replace(/premium|upgrade|service|optimization service/gi, '');
  }
  
  return text;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Simplify language for new players
 */
function simplifyLanguage(text) {
  // Replace jargon with simpler terms
  const simplifications = [
    [/liquidity provider|LP/gi, 'liquidity pool'],
    [/impermanent loss/gi, 'potential value change'],
    [/APR|annual percentage rate/gi, 'yearly return'],
    [/APY|annual percentage yield/gi, 'yearly earnings'],
    [/slippage/gi, 'price difference'],
    [/TVL|total value locked/gi, 'total funds in pool'],
  ];
  
  for (const [pattern, replacement] of simplifications) {
    text = text.replace(pattern, replacement);
  }
  
  return text;
}

/**
 * Enhance lore/roleplay content
 */
function enhanceLoreContent(text) {
  // Add more flavor if not already present
  if (!text.includes('*')) {
    const flavorIntros = [
      '*adjusts monocle thoughtfully*\n\n',
      '*unfurls an ancient scroll*\n\n',
      '*strokes beard wisely*\n\n',
      '*peers into crystal ball*\n\n'
    ];
    text = flavorIntros[Math.floor(Math.random() * flavorIntros.length)] + text;
  }
  
  return text;
}

/**
 * Enhance data/analytical content
 */
function enhanceDataContent(text) {
  // Add note about data availability
  if (!text.includes('data') && !text.includes('number')) {
    text += `\n\nWould you like me to provide the raw numbers or a detailed breakdown?`;
  }
  
  return text;
}

/**
 * Condense response for speedrunners
 */
function condenseResponse(text) {
  // Remove roleplay elements
  text = text.replace(/\*[^*]+\*/g, '');
  
  // Keep only essential paragraphs
  const paragraphs = text.split('\n\n').filter(p => p.trim());
  if (paragraphs.length > 2) {
    text = paragraphs.slice(0, 2).join('\n\n');
    text += '\n\n(Ask if you need more details)';
  }
  
  return text.trim();
}

/**
 * Enhance explanations for scholars
 */
function enhanceExplanations(text) {
  // Add "why" explanations if not present
  if (!text.includes('because') && !text.includes('since') && !text.includes('reason')) {
    text += `\n\nIf you'd like me to explain the reasoning behind any of this, just ask!`;
  }
  
  return text;
}

/**
 * Generate a personalized greeting based on profile
 * @param {Object} profile - PlayerProfile
 * @returns {string} Personalized greeting
 */
export function generateGreeting(profile) {
  const archetype = profile.archetype || ARCHETYPES.GUEST;
  const tier = profile.tier ?? 0;
  const tags = profile.behaviorTags || [];
  const name = profile.discordUsername || 'traveler';
  
  // Council member greeting
  if (tier >= TIERS.TIER_4) {
    return `*rises and bows deeply*\n\nCouncil Member ${name}, it is an honor. How may I serve you today?`;
  }
  
  // Whale greeting
  if (profile.flags?.isWhale) {
    return `*adjusts spectacles with respect*\n\nAh, ${name}! I've been expecting you. What wisdom do you seek today?`;
  }
  
  // Lore lover greeting
  if (tags.includes(BEHAVIOR_TAGS.LORE_LOVER)) {
    return `*looks up from dusty tome*\n\nGreetings, fellow seeker of knowledge! ${name}, what tales shall we explore today?`;
  }
  
  // Returning player greeting
  if (archetype === ARCHETYPES.PLAYER || archetype === ARCHETYPES.INVESTOR) {
    return `*nods in recognition*\n\nWelcome back, ${name}. How may I assist you today?`;
  }
  
  // Adventurer greeting
  if (archetype === ARCHETYPES.ADVENTURER) {
    return `*smiles warmly*\n\nAh, ${name}! Good to see you again. Ready for another adventure?`;
  }
  
  // Default greeting for guests
  return `*adjusts spectacles*\n\nGreetings, ${name}! I am Hedge, keeper of knowledge in Crystalvale. How may I help you today?`;
}

/**
 * Generate a farewell message based on profile
 * @param {Object} profile - PlayerProfile
 * @returns {string} Personalized farewell
 */
export function generateFarewell(profile) {
  const tags = profile.behaviorTags || [];
  
  if (tags.includes(BEHAVIOR_TAGS.LORE_LOVER)) {
    return `*waves quill in farewell*\n\nMay your adventures be legendary! Until we meet again in the annals of Crystalvale...`;
  }
  
  if (profile.flags?.isWhale) {
    return `*bows respectfully*\n\nSafe travels, and may your yields be ever bountiful!`;
  }
  
  return `*nods and returns to ledger*\n\nFarewell! Return anytime you seek guidance.`;
}

/**
 * Determine if we should suggest premium features to this profile
 * @param {Object} profile - PlayerProfile
 * @returns {boolean}
 */
export function shouldSuggestPremium(profile) {
  // Never suggest to extractors
  if (profile.flags?.isExtractor) return false;
  
  // Don't oversell to whales (they likely already know)
  if (profile.flags?.isWhale && profile.tier >= TIERS.TIER_3) return false;
  
  // High potential candidates are prime targets
  if (profile.flags?.isHighPotential) return true;
  
  // Optimizers are interested in efficiency
  if (profile.behaviorTags?.includes(BEHAVIOR_TAGS.OPTIMIZER)) return true;
  
  // Mid-tier players who are engaged
  if (profile.tier >= TIERS.TIER_1 && profile.tier <= TIERS.TIER_2 &&
      (profile.kpis?.engagementScore || 0) > 20) return true;
  
  return false;
}

export default {
  adaptResponse,
  generateGreeting,
  generateFarewell,
  shouldSuggestPremium
};
