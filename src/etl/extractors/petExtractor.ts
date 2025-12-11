// src/etl/extractors/petExtractor.ts
// Extracts pet data for ETL pipeline
// Cluster-aware aggregation for multi-wallet players

import type { ExtractedPetData, WalletContext } from '../types.js';
import { db } from '../../../server/db.js';
import { walletLinks } from '../../../shared/schema.js';
import { eq } from 'drizzle-orm';

async function getClusterWallets(clusterKey: string): Promise<string[]> {
  try {
    const links = await db
      .select({ address: walletLinks.address })
      .from(walletLinks)
      .where(eq(walletLinks.clusterKey, clusterKey));
    return links.map((l: { address: string }) => l.address.toLowerCase());
  } catch {
    return [];
  }
}

export async function extractPetData(ctx: WalletContext): Promise<ExtractedPetData> {
  const wallet = ctx.walletAddress.toLowerCase();
  const clusterKey = ctx.clusterKey;
  
  try {
    // Get all wallets to aggregate
    let walletsToAggregate = [wallet];
    if (clusterKey) {
      const clusterWallets = await getClusterWallets(clusterKey);
      if (clusterWallets.length > 0) {
        walletsToAggregate = Array.from(new Set([...clusterWallets, wallet]));
      }
    }
    
    // Aggregate pets across all cluster wallets
    let allPets: any[] = [];
    
    try {
      const petFetcher = await import('../../../pet-fetcher.js');
      if (petFetcher.getPetsByOwner) {
        for (const w of walletsToAggregate) {
          const walletPets = await petFetcher.getPetsByOwner(w);
          if (walletPets && walletPets.length > 0) {
            allPets = allPets.concat(walletPets);
          }
        }
      }
    } catch {
      console.warn(`[PetExtractor] pet-fetcher.js not available`);
    }
    
    const petCount = allPets.length;
    const gardeningPetCount = allPets.filter((p: any) => 
      p.element?.toLowerCase() === 'earth' || 
      p.profession?.toLowerCase() === 'gardening'
    ).length;
    
    // Track families with Odd/Ultra-Odd variants for Mythic Menagerie check
    const oddFamilies = new Set<string>();
    for (const pet of allPets) {
      const variant = (pet.appearance || pet.variant || '').toLowerCase();
      if (variant.includes('odd') || variant.includes('ultra')) {
        const family = (pet.family || pet.eggType || '').toLowerCase();
        if (family) {
          oddFamilies.add(family);
        }
      }
    }
    
    return {
      petCount,
      gardeningPetCount,
      oddPetFamilies: Array.from(oddFamilies),
    };
  } catch (err) {
    console.warn(`[PetExtractor] Error extracting pet data for ${wallet}:`, err);
    return {
      petCount: 0,
      gardeningPetCount: 0,
      oddPetFamilies: [],
    };
  }
}
