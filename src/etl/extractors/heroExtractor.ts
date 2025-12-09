// src/etl/extractors/heroExtractor.ts
// Extracts hero data for ETL pipeline

import type { ExtractedHeroData, WalletContext } from '../types.js';

const RARITY_MYTHIC = 4;
const ADVANCED_CLASSES = ['paladin', 'darkKnight', 'dragoon', 'sage', 'dreadKnight', 'summoner', 'ninja', 'shapeshifter', 'bard', 'spellbow', 'legionnaire', 'scion'];

export async function extractHeroData(ctx: WalletContext): Promise<ExtractedHeroData> {
  const { getAllHeroesByOwner, calculateHeroMetrics } = await import('../../../onchain-data.js');
  const { decodeHeroGenes } = await import('../../../hero-genetics.js');
  
  const wallet = ctx.walletAddress.toLowerCase();
  
  try {
    const rawHeroes = await getAllHeroesByOwner(wallet);
    
    if (!rawHeroes || rawHeroes.length === 0) {
      return {
        heroCount: 0,
        totalLevels: 0,
        gen0Count: 0,
        classesLevel10Plus: 0,
        exaltedGeneHeroCount: 0,
        mythicHeroCount: 0,
        heroes: [],
      };
    }
    
    const { gen0Count } = calculateHeroMetrics(rawHeroes);
    
    const totalLevels = rawHeroes.reduce((sum: number, h: any) => sum + (h.level || 0), 0);
    
    const classLevelMap = new Map<string, number>();
    for (const hero of rawHeroes) {
      const mainClass = hero.mainClassStr?.toLowerCase() || 'unknown';
      const currentMax = classLevelMap.get(mainClass) || 0;
      if (hero.level > currentMax) {
        classLevelMap.set(mainClass, hero.level);
      }
    }
    const classesLevel10Plus = Array.from(classLevelMap.values()).filter(lvl => lvl >= 10).length;
    
    const mythicHeroCount = rawHeroes.filter((h: any) => h.rarity === RARITY_MYTHIC).length;
    
    let exaltedGeneHeroCount = 0;
    const processedHeroes = [];
    
    for (const hero of rawHeroes) {
      try {
        if (hero.statGenes) {
          const decoded = decodeHeroGenes(hero);
          if (decoded && decoded.geneTiers) {
            const hasExalted = decoded.geneTiers.some((tier: string) => 
              tier?.toLowerCase() === 'exalted'
            );
            if (hasExalted) {
              exaltedGeneHeroCount++;
            }
          }
        }
      } catch (err) {
        // Gene decoding failed, skip exalted check for this hero
      }
      
      processedHeroes.push({
        id: hero.id,
        normalizedId: hero.normalizedId,
        mainClass: hero.mainClassStr || 'unknown',
        subClass: hero.subClassStr || '',
        profession: hero.professionStr || 'unknown',
        rarity: hero.rarity || 0,
        level: hero.level || 1,
        generation: hero.generation || 0,
        gardening: hero.gardening || 0,
        mining: hero.mining || 0,
        fishing: hero.fishing || 0,
        foraging: hero.foraging || 0,
        currentQuest: hero.currentQuest || null,
        statGenes: hero.statGenes || null,
        visualGenes: hero.visualGenes || null,
      });
    }
    
    return {
      heroCount: rawHeroes.length,
      totalLevels,
      gen0Count,
      classesLevel10Plus,
      exaltedGeneHeroCount,
      mythicHeroCount,
      heroes: processedHeroes,
    };
  } catch (err) {
    console.error(`[HeroExtractor] Error extracting hero data for ${wallet}:`, err);
    return {
      heroCount: 0,
      totalLevels: 0,
      gen0Count: 0,
      classesLevel10Plus: 0,
      exaltedGeneHeroCount: 0,
      mythicHeroCount: 0,
      heroes: [],
    };
  }
}
