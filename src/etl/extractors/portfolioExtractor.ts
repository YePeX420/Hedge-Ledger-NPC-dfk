// src/etl/extractors/portfolioExtractor.ts
// Extracts portfolio/balance data for ETL pipeline

import type { ExtractedPortfolioData, WalletContext } from '../types.js';

export async function extractPortfolioData(ctx: WalletContext): Promise<ExtractedPortfolioData> {
  const wallet = ctx.walletAddress.toLowerCase();
  
  try {
    const { fetchWalletBalances } = await import('../../../blockchain-balance-fetcher.js');
    
    const balances = await fetchWalletBalances(wallet);
    
    const jewelBalance = parseFloat(balances?.jewel || '0');
    const crystalBalance = parseFloat(balances?.crystal || '0');
    const cJewelBalance = parseFloat(balances?.cjewel || '0');
    
    const jewelEquivalentBalance = jewelBalance + cJewelBalance + (crystalBalance * 0.8);
    
    return {
      jewelBalance,
      crystalBalance,
      cJewelBalance,
      jewelEquivalentBalance,
    };
  } catch (err) {
    console.error(`[PortfolioExtractor] Error extracting portfolio data for ${wallet}:`, err);
    return {
      jewelBalance: 0,
      crystalBalance: 0,
      cJewelBalance: 0,
      jewelEquivalentBalance: 0,
    };
  }
}
