/**
 * Blockchain Balance Fetcher
 * 
 * Fetches token balances from DFK Chain for wallet tracking:
 * - JEWEL (native gas token)
 * - CRYSTAL (ERC20 token)
 * - cJEWEL (staked JEWEL governance token)
 */

import { ethers } from 'ethers';

// DFK Chain RPC endpoint
const DFK_RPC = 'https://subnets.avax.network/defi-kingdoms/dfk-chain/rpc';

// Token contract addresses on DFK Chain
const TOKEN_ADDRESSES = {
  CRYSTAL: '0x04b9dA42306B023f3572e106B11D82aAd9D32EBb',
  CJEWEL: '0x9ed2c155632C042CB8bC20634571fF1CA26f5742'
};

// Minimal ERC20 ABI with just balanceOf function
const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)"
];

// cJEWEL contract ABI including userInfo for lock time
// Returns: [depositedJewel, cJewelBalance, lockEndTimestamp, rewardDebt]
const CJEWEL_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function userInfo(address user) view returns (uint256, uint256, uint256, uint256)"
];

// Initialize provider
const provider = new ethers.JsonRpcProvider(DFK_RPC);

// Initialize token contracts
const crystalContract = new ethers.Contract(TOKEN_ADDRESSES.CRYSTAL, ERC20_ABI, provider);
const cjewelContract = new ethers.Contract(TOKEN_ADDRESSES.CJEWEL, CJEWEL_ABI, provider);

/**
 * Fetch all token balances for a wallet
 * @param {string} walletAddress - Wallet address to query
 * @returns {Promise<{jewel: string, crystal: string, cjewel: string}>} Token balances in human-readable format
 */
export async function fetchWalletBalances(walletAddress) {
  try {
    console.log(`[BalanceFetcher] Fetching balances for wallet ${walletAddress}`);
    
    // Query all balances in parallel
    const [nativeBalance, crystalBalance, cjewelBalance] = await Promise.all([
      // Native JEWEL balance (gas token)
      provider.getBalance(walletAddress),
      // CRYSTAL ERC20 token balance
      crystalContract.balanceOf(walletAddress),
      // cJEWEL (staked JEWEL) balance
      cjewelContract.balanceOf(walletAddress)
    ]);
    
    // Convert from wei to human-readable format (18 decimals)
    const jewel = ethers.formatEther(nativeBalance);
    const crystal = ethers.formatEther(crystalBalance);
    const cjewel = ethers.formatEther(cjewelBalance);
    
    console.log(`[BalanceFetcher] ✅ ${walletAddress}:`, {
      JEWEL: jewel,
      CRYSTAL: crystal,
      cJEWEL: cjewel
    });
    
    return {
      jewel,
      crystal,
      cjewel
    };
  } catch (err) {
    console.error(`[BalanceFetcher] ❌ Error fetching balances for ${walletAddress}:`, err.message);
    throw err;
  }
}

/**
 * Batch fetch balances for multiple wallets
 * @param {string[]} walletAddresses - Array of wallet addresses
 * @returns {Promise<Map<string, {jewel: string, crystal: string, cjewel: string}>>} Map of wallet -> balances
 */
export async function batchFetchWalletBalances(walletAddresses) {
  console.log(`[BalanceFetcher] Batch fetching balances for ${walletAddresses.length} wallet(s)`);
  
  const results = new Map();
  
  // Process in batches of 10 to avoid rate limiting
  const BATCH_SIZE = 10;
  for (let i = 0; i < walletAddresses.length; i += BATCH_SIZE) {
    const batch = walletAddresses.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.allSettled(
      batch.map(wallet => fetchWalletBalances(wallet))
    );
    
    batchResults.forEach((result, index) => {
      const wallet = batch[index];
      if (result.status === 'fulfilled') {
        results.set(wallet, result.value);
      } else {
        console.error(`[BalanceFetcher] Failed to fetch balances for ${wallet}:`, result.reason?.message);
        // Store zeros on failure
        results.set(wallet, { jewel: '0', crystal: '0', cjewel: '0' });
      }
    });
    
    // Small delay between batches to avoid rate limiting
    if (i + BATCH_SIZE < walletAddresses.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  console.log(`[BalanceFetcher] ✅ Batch fetch complete: ${results.size}/${walletAddresses.length} successful`);
  return results;
}

/**
 * Fetch cJEWEL lock time remaining for a wallet
 * @param {string} walletAddress - Wallet address to query
 * @returns {Promise<{lockEndTimestamp: number, lockDaysRemaining: number} | null>} Lock info or null if no lock
 */
export async function fetchCJewelLockTime(walletAddress) {
  try {
    const userInfo = await cjewelContract.userInfo(walletAddress);
    // userInfo returns: [depositedJewel, cJewelBalance, lockEndTimestamp, rewardDebt]
    const lockEndTimestamp = Number(userInfo[2]);
    
    if (lockEndTimestamp === 0) {
      return null; // No lock
    }
    
    const now = Math.floor(Date.now() / 1000);
    const secondsRemaining = Math.max(0, lockEndTimestamp - now);
    const daysRemaining = Math.ceil(secondsRemaining / (60 * 60 * 24));
    
    return {
      lockEndTimestamp,
      lockDaysRemaining: daysRemaining
    };
  } catch (err) {
    console.error(`[BalanceFetcher] ❌ Error fetching cJEWEL lock time for ${walletAddress}:`, err.message);
    return null;
  }
}
