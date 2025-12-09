// src/etl/extractors/gardenExtractor.ts
// Extracts garden LP data for ETL pipeline

import type { ExtractedGardenData, WalletContext } from '../types.js';

export async function extractGardenData(ctx: WalletContext): Promise<ExtractedGardenData> {
  const wallet = ctx.walletAddress.toLowerCase();
  
  try {
    let positions: any[] = [];
    
    try {
      const lpDetector = await import('../../../wallet-lp-detector.js');
      if (lpDetector.detectWalletLPPositions) {
        positions = await lpDetector.detectWalletLPPositions(wallet);
      }
    } catch {
      console.warn(`[GardenExtractor] wallet-lp-detector.js not available`);
    }
    
    if (!positions || positions.length === 0) {
      return {
        lpYieldTokenEquivalent: 0,
        lpPositions: [],
        totalLPValue: 0,
      };
    }
    
    const lpPositions = positions.map((p: any) => ({
      pid: p.pid,
      pairName: p.pairName || `Pool ${p.pid}`,
      userShare: p.userShare || '0',
      userTVL: p.userTVL || '0',
    }));
    
    const totalLPValue = lpPositions.reduce(
      (sum: number, p: any) => sum + parseFloat(p.userTVL || '0'),
      0
    );
    
    return {
      lpYieldTokenEquivalent: totalLPValue,
      lpPositions,
      totalLPValue,
    };
  } catch (err) {
    console.error(`[GardenExtractor] Error extracting garden data for ${wallet}:`, err);
    return {
      lpYieldTokenEquivalent: 0,
      lpPositions: [],
      totalLPValue: 0,
    };
  }
}
