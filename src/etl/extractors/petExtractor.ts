// src/etl/extractors/petExtractor.ts
// Extracts pet data for ETL pipeline

import type { ExtractedPetData, WalletContext } from '../types.js';

export async function extractPetData(ctx: WalletContext): Promise<ExtractedPetData> {
  const wallet = ctx.walletAddress.toLowerCase();
  
  try {
    const { getPetsByOwner } = await import('../../../pet-fetcher.js');
    
    const pets = await getPetsByOwner(wallet);
    
    const petCount = pets?.length || 0;
    const gardeningPetCount = pets?.filter((p: any) => 
      p.element?.toLowerCase() === 'earth' || 
      p.profession?.toLowerCase() === 'gardening'
    ).length || 0;
    
    return {
      petCount,
      gardeningPetCount,
    };
  } catch (err) {
    console.warn(`[PetExtractor] Error extracting pet data for ${wallet}:`, err);
    return {
      petCount: 0,
      gardeningPetCount: 0,
    };
  }
}
