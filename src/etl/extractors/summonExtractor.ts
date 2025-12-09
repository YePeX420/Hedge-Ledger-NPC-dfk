// src/etl/extractors/summonExtractor.ts
// Extracts summon data for ETL pipeline

import { db } from '../../../server/db.js';
import { walletActivity } from '../../../shared/schema.js';
import { eq, desc } from 'drizzle-orm';
import type { ExtractedSummonData, WalletContext, ExtractedHeroData } from '../types.js';

const ADVANCED_CLASSES = {
  dragoon: 'dragoon',
  dreadknight: 'dreadknight',
  sage: 'sage',
  paladin: 'paladin',
  darkKnight: 'darkknight',
  dark_knight: 'darkknight',
};

export async function extractSummonData(ctx: WalletContext, heroData?: ExtractedHeroData): Promise<ExtractedSummonData> {
  const wallet = ctx.walletAddress.toLowerCase();
  
  try {
    const activities = await db
      .select()
      .from(walletActivity)
      .where(eq(walletActivity.wallet, wallet))
      .orderBy(desc(walletActivity.asOfDate))
      .limit(1);
    
    const latestActivity = activities[0];
    const totalSummons = latestActivity?.summonsMade30d || 0;
    
    let summonsDragoon = 0;
    let summonsDreadknight = 0;
    let summonsSage = 0;
    let summonsPaladin = 0;
    let summonsDarkKnight = 0;
    let summonsHighTierGenes = 0;
    let summonsMythicRarity = 0;
    
    if (heroData?.heroes) {
      for (const hero of heroData.heroes) {
        const mainClass = hero.mainClass?.toLowerCase() || '';
        
        if (mainClass === 'dragoon') summonsDragoon++;
        if (mainClass === 'dreadknight') summonsDreadknight++;
        if (mainClass === 'sage') summonsSage++;
        if (mainClass === 'paladin') summonsPaladin++;
        if (mainClass === 'darkknight' || mainClass === 'dark knight') summonsDarkKnight++;
        
        if (hero.rarity === 4) summonsMythicRarity++;
      }
    }
    
    const hasTrifectaUltraRare = summonsDragoon >= 1 && summonsDreadknight >= 1 && summonsSage >= 1;
    
    return {
      totalSummons,
      summonsDragoon,
      summonsDreadknight,
      summonsSage,
      summonsPaladin,
      summonsDarkKnight,
      summonsHighTierGenes,
      summonsMythicRarity,
      hasTrifectaUltraRare,
    };
  } catch (err) {
    console.error(`[SummonExtractor] Error extracting summon data for ${wallet}:`, err);
    return {
      totalSummons: 0,
      summonsDragoon: 0,
      summonsDreadknight: 0,
      summonsSage: 0,
      summonsPaladin: 0,
      summonsDarkKnight: 0,
      summonsHighTierGenes: 0,
      summonsMythicRarity: 0,
      hasTrifectaUltraRare: false,
    };
  }
}
