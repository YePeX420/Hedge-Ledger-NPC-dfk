// src/etl/extractors/petExtractor.ts
// Extracts pet data for ETL pipeline

import type { ExtractedPetData, WalletContext } from '../types.js';

export async function extractPetData(ctx: WalletContext): Promise<ExtractedPetData> {
  const wallet = ctx.walletAddress.toLowerCase();
  
  try {
    let pets: any[] = [];
    
    try {
      const petFetcher = await import('../../../pet-fetcher.js');
      if (petFetcher.getPetsByOwner) {
        pets = await petFetcher.getPetsByOwner(wallet);
      }
    } catch {
      console.warn(`[PetExtractor] pet-fetcher.js not available`);
    }
    
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
