// agentic-executor.js
// Maps OpenAI tool calls to actual JS functions

import { detectWalletLPPositions } from '../wallet-lp-detector.js';
import { getCachedPoolAnalytics } from '../pool-cache.js';
import { getGardenPools } from '../onchain-data.js';

export async function toolExecutor(name, args) {
  switch (name) {

    case "get_wallet_gardens": {
      const wallet = args.wallet_address;
      if (!wallet) return { error: "Missing wallet_address" };

      const positions = await detectWalletLPPositions(wallet);
      return {
        wallet,
        positions,
        count: positions.length
      };
    }

    case "get_garden_pools_free": {
      const cached = getCachedPoolAnalytics();
      return cached?.data || [];
    }

    case "get_garden_pools_premium": {
      // Same as free for now, but can later include hero-boost APR improvements
      const cached = getCachedPoolAnalytics();
      return cached?.data || [];
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}
