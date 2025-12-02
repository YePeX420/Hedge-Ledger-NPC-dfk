/**
 * Intent Router - Agentic Hedge
 * 
 * Uses OpenAI function calling to route user queries to the appropriate engines.
 * GPT analyzes the user's intent and decides which tools to invoke.
 */

const { OpenAI } = require('openai');
const { ALL_TOOLS } = require('./agentic-tools');
const fs = require('fs');
const path = require('path');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

// Load Hedge personality
const HEDGE_PROMPT_PATH =
  process.env.HEDGE_PROMPT_PATH || path.join(__dirname, 'prompt', 'hedge-ledger.md');
const hedgePersonality = fs.readFileSync(HEDGE_PROMPT_PATH, 'utf8');

/**
 * Default tool executor
 *
 * This is used when no custom toolExecutor is provided to routeAndExecute.
 * It wires key tools (especially gardens) to the real backend engines.
 */
async function defaultToolExecutor(name, args) {
  try {
    switch (name) {
      case 'get_wallet_gardens': {
        const { detectWalletLPPositions } = await import('./wallet-lp-detector.js');
        const wallet = args.wallet_address;
        if (!wallet) {
          throw new Error('wallet_address is required for get_wallet_gardens');
        }
        const positions = await detectWalletLPPositions(wallet);
        return {
          wallet,
          positions,
          count: positions.length,
        };
      }

      case 'get_garden_pools_free':
      case 'get_garden_pools_premium': {
        const { getCachedPoolAnalytics } = await import('./pool-cache.js');
        const cache = getCachedPoolAnalytics();
        return cache?.data || [];
      }

      // You can map more tools (hero, FVE, summon) here later as needed.

      default:
        throw new Error(`No default executor implemented for tool: ${name}`);
    }
  } catch (err) {
    console.error(`[defaultToolExecutor] Error executing tool ${name}:`, err.message);
    throw err;
  }
}

/**
 * Route a DM query through OpenAI function calling
 * 
 * @param {string} userMessage - The user's DM message
 * @param {object} context - Additional context (userId, conversationHistory, etc.)
 * @returns {object} - { toolCalls: [], response: string, tokensUsed: number }
 */
async function routeIntent(userMessage, context = {}) {
  const { userId, conversationHistory = [] } = context;

  try {
    // Build messages array for OpenAI
    const messages = [
      {
        role: 'system',
        content: hedgePersonality,
      },
      ...conversationHistory, // Include previous messages if available
      {
        role: 'user',
        content: userMessage,
      },
    ];

    // Call OpenAI with function calling enabled
    const completion = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages,
      tools: ALL_TOOLS,
      tool_choice: 'auto', // Let GPT decide whether to call tools
      temperature: 0.7,
    });

    const responseMessage = completion.choices[0].message;
    const tokensUsed = completion.usage.total_tokens;

    // Check if GPT wants to call any tools
    if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
      return {
        toolCalls: responseMessage.tool_calls.map((tc) => {
          // Safely parse tool arguments with error handling
          let parsedArgs;
          try {
            parsedArgs = JSON.parse(tc.function.arguments);
          } catch (error) {
            console.error(
              `Failed to parse tool arguments for ${tc.function.name}:`,
              error
            );
            parsedArgs = {
              error: 'Invalid tool arguments',
              raw: tc.function.arguments,
            };
          }
          return {
            id: tc.id,
            name: tc.function.name,
            arguments: parsedArgs,
          };
        }),
        response: null, // No direct response yet - need to execute tools first
        tokensUsed,
        assistantMessage: responseMessage, // Save for next round
        userMessage, // Save user message for second round
      };
    } else {
      // No tool calls - GPT answered directly
      return {
        toolCalls: [],
        response: responseMessage.content,
        tokensUsed,
        assistantMessage: responseMessage,
      };
    }
  } catch (error) {
    console.error('Intent router error:', error);
    throw new Error(`Failed to route intent: ${error.message}`);
  }
}

/**
 * Execute tool calls and get final response from Hedge
 * 
 * @param {array} toolCalls - Array of tool calls from routeIntent
 * @param {object} assistantMessage - The assistant message from first round
 * @param {string} userMessage - The original user message
 * @param {array} conversationHistory - Previous messages
 * @param {function} toolExecutor - Function that executes tools and returns results
 * @returns {object} - { response: string, tokensUsed: number }
 */
async function executeToolsAndRespond(
  toolCalls,
  assistantMessage,
  userMessage,
  conversationHistory,
  toolExecutor
) {
  try {
    // Execute all tool calls
    const toolResults = await Promise.all(
      toolCalls.map(async (tc) => {
        try {
          const result = await toolExecutor(tc.name, tc.arguments);
          return {
            tool_call_id: tc.id,
            role: 'tool',
            name: tc.name,
            content: JSON.stringify(result),
          };
        } catch (error) {
          console.error(`Tool execution error (${tc.name}):`, error);
          return {
            tool_call_id: tc.id,
            role: 'tool',
            name: tc.name,
            content: JSON.stringify({ error: error.message }),
          };
        }
      })
    );

    // Build messages for second round (with tool results)
    const messages = [
      {
        role: 'system',
        content: hedgePersonality,
      },
      ...conversationHistory,
      {
        role: 'user',
        content: userMessage, // Include original user question for context
      },
      assistantMessage, // Include the assistant's tool-calling message
      ...toolResults, // Add tool results
    ];

    // Get final response from GPT
    const completion = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages,
      temperature: 0.7,
    });

    return {
      response: completion.choices[0].message.content,
      tokensUsed: completion.usage.total_tokens,
    };
  } catch (error) {
    console.error('Tool execution and response error:', error);
    throw new Error(`Failed to execute tools and respond: ${error.message}`);
  }
}

/**
 * Convenience wrapper: route + execute + respond in one call
 * 
 * @param {string} userMessage - User's DM message
 * @param {object} context - Context (userId, conversationHistory)
 * @param {function} toolExecutor - Function to execute tools (optional; defaults to built-in)
 * @returns {object} - { response: string, toolsUsed: array, totalTokens: number }
 */
async function routeAndExecute(
  userMessage,
  context = {},
  toolExecutor = defaultToolExecutor
) {
  // Step 1: Route intent
  const routeResult = await routeIntent(userMessage, context);

  // Step 2: If no tools needed, return direct response
  if (!routeResult.toolCalls || routeResult.toolCalls.length === 0) {
    return {
      response: routeResult.response,
      toolsUsed: [],
      totalTokens: routeResult.tokensUsed,
    };
  }

  // Step 3: Execute tools and get final response
  const { conversationHistory = [] } = context;
  const finalResult = await executeToolsAndRespond(
    routeResult.toolCalls,
    routeResult.assistantMessage,
    routeResult.userMessage,
    conversationHistory,
    toolExecutor
  );

  return {
    response: finalResult.response,
    toolsUsed: routeResult.toolCalls.map((tc) => tc.name),
    totalTokens: routeResult.tokensUsed + finalResult.tokensUsed,
  };
}

module.exports = {
  routeIntent,
  executeToolsAndRespond,
  routeAndExecute,
};