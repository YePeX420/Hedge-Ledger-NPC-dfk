// onchain-data.js
// DeFi Kingdoms GraphQL API integration for real-time blockchain data

import { GraphQLClient, gql } from 'graphql-request';

const DFK_GRAPHQL_ENDPOINT = 'https://api.defikingdoms.com/graphql';
const client = new GraphQLClient(DFK_GRAPHQL_ENDPOINT);

// Helper to convert wei to JEWEL/CRYSTAL (divide by 10^18)
export function weiToToken(wei) {
  if (!wei) return '0';
  return (parseInt(wei) / 1e18).toFixed(4);
}

// Helper to format hero ID based on realm
export function normalizeHeroId(id) {
  // Crystalvale heroes: +1 trillion
  // Serendale 2.0 (Klaytn): +2 trillion
  // Original Serendale: no offset
  const heroId = BigInt(id);
  if (heroId >= 2000000000000n) {
    return (heroId - 2000000000000n).toString();
  } else if (heroId >= 1000000000000n) {
    return (heroId - 1000000000000n).toString();
  }
  return id.toString();
}

/**
 * Get detailed info about a specific hero by ID
 */
export async function getHeroById(heroId) {
  const query = gql`
    query GetHero($heroId: ID!) {
      hero(id: $heroId) {
        id
        normalizedId
        network
        originRealm
        mainClassStr
        subClassStr
        professionStr
        rarity
        generation
        level
        xp
        strength
        intelligence
        wisdom
        luck
        agility
        vitality
        endurance
        dexterity
        hp
        mp
        stamina
        mining
        gardening
        foraging
        fishing
        summons
        maxSummons
        summonsRemaining
        staminaFullAt
        owner {
          id
          name
        }
        salePrice
        assistingPrice
      }
    }
  `;

  try {
    const data = await client.request(query, { heroId: heroId.toString() });
    return data.hero;
  } catch (error) {
    console.error('Error fetching hero:', error);
    return null;
  }
}

/**
 * Search heroes by criteria (class, profession, for sale, etc.)
 */
export async function searchHeroes({ 
  mainClass, 
  profession, 
  forSale = false, 
  maxPrice,
  minLevel,
  maxLevel,
  limit = 20,
  orderBy = 'id',
  orderDirection = 'desc'
}) {
  const where = {};
  
  if (mainClass) where.mainClassStr = mainClass;
  if (profession) where.professionStr = profession;
  if (forSale) where.salePrice_not = null;
  if (maxPrice) where.salePrice_lte = (maxPrice * 1e18).toString();
  if (minLevel) where.level_gte = minLevel;
  if (maxLevel) where.level_lte = maxLevel;

  const query = gql`
    query SearchHeroes($where: HeroFilter, $first: Int!, $orderBy: HeroOrderBy!, $orderDirection: OrderDirection!) {
      heroes(where: $where, first: $first, orderBy: $orderBy, orderDirection: $orderDirection) {
        id
        normalizedId
        mainClassStr
        subClassStr
        professionStr
        rarity
        level
        generation
        summons
        maxSummons
        strength
        intelligence
        wisdom
        stamina
        mining
        gardening
        foraging
        fishing
        salePrice
        owner {
          name
        }
      }
    }
  `;

  try {
    const data = await client.request(query, {
      where,
      first: limit,
      orderBy,
      orderDirection
    });
    return data.heroes;
  } catch (error) {
    console.error('Error searching heroes:', error);
    return [];
  }
}

/**
 * Get cheapest heroes for sale by class
 */
export async function getCheapestHeroes(mainClass = null, limit = 10) {
  const where = { salePrice_not: null, endedAt: null, winner: null };
  if (mainClass) where.mainClassStr = mainClass;

  const query = gql`
    query CheapestHeroes($where: HeroFilter, $first: Int!) {
      heroes(
        where: $where,
        first: $first,
        orderBy: salePrice,
        orderDirection: asc
      ) {
        id
        normalizedId
        mainClassStr
        professionStr
        rarity
        level
        generation
        summons
        maxSummons
        salePrice
        strength
        intelligence
        wisdom
        stamina
        owner {
          name
        }
      }
    }
  `;

  try {
    const data = await client.request(query, { where, first: limit });
    return data.heroes;
  } catch (error) {
    console.error('Error fetching cheapest heroes:', error);
    return [];
  }
}

/**
 * Get active sale auctions
 */
export async function getActiveSales(limit = 20, minPrice = null, maxPrice = null) {
  const where = { endedAt: null, winner: null };
  if (minPrice) where.startingPrice_gte = (minPrice * 1e18).toString();
  if (maxPrice) where.startingPrice_lte = (maxPrice * 1e18).toString();

  const query = gql`
    query ActiveSales($where: AuctionFilter, $first: Int!) {
      saleAuctions(
        where: $where,
        first: $first,
        orderBy: startingPrice,
        orderDirection: asc
      ) {
        id
        startingPrice
        endingPrice
        startedAt
        tokenId {
          id
          normalizedId
          mainClassStr
          rarity
          level
          generation
        }
        seller {
          name
        }
      }
    }
  `;

  try {
    const data = await client.request(query, { where, first: limit });
    return data.saleAuctions;
  } catch (error) {
    console.error('Error fetching active sales:', error);
    return [];
  }
}

/**
 * Get heroes owned by a specific address
 */
export async function getHeroesByOwner(ownerAddress, limit = 50) {
  const query = gql`
    query HeroesByOwner($owner: String!, $first: Int!) {
      heroes(where: { owner: $owner }, first: $first, orderBy: level, orderDirection: desc) {
        id
        normalizedId
        mainClassStr
        professionStr
        rarity
        level
        generation
        strength
        intelligence
        wisdom
        stamina
        mining
        gardening
        foraging
        fishing
        summons
        maxSummons
        staminaFullAt
        currentQuest
      }
    }
  `;

  try {
    const data = await client.request(query, { owner: ownerAddress.toLowerCase(), first: limit });
    return data.heroes;
  } catch (error) {
    console.error('Error fetching heroes by owner:', error);
    return [];
  }
}

/**
 * Get top heroes by profession skill
 */
export async function getTopProfessionHeroes(profession, limit = 10) {
  const professionField = profession.toLowerCase(); // mining, gardening, foraging, fishing
  
  const query = gql`
    query TopProfessionHeroes($first: Int!) {
      heroes(
        first: $first,
        orderBy: ${professionField},
        orderDirection: desc
      ) {
        id
        normalizedId
        mainClassStr
        professionStr
        level
        ${professionField}
        salePrice
        owner {
          name
        }
      }
    }
  `;

  try {
    const data = await client.request(query, { first: limit });
    return data.heroes;
  } catch (error) {
    console.error('Error fetching top profession heroes:', error);
    return [];
  }
}

/**
 * Get sale history for a specific hero
 */
export async function getHeroSaleHistory(heroId) {
  const query = gql`
    query HeroSaleHistory($heroId: Int!) {
      saleAuctions(where: { tokenId: $heroId }, orderBy: endedAt, orderDirection: desc) {
        id
        startingPrice
        purchasePrice
        startedAt
        endedAt
        seller {
          id
          name
        }
        winner {
          id
          name
        }
      }
    }
  `;

  try {
    const normalizedId = normalizeHeroId(heroId);
    const data = await client.request(query, { heroId: parseInt(normalizedId) });
    return data.saleAuctions;
  } catch (error) {
    console.error('Error fetching hero sale history:', error);
    return [];
  }
}

/**
 * Get marketplace statistics
 */
export async function getMarketStats() {
  const query = gql`
    query MarketStats {
      saleAuctions(first: 1000, where: { endedAt: null, winner: null }, orderBy: startingPrice, orderDirection: asc) {
        startingPrice
        tokenId {
          mainClassStr
          rarity
          level
        }
      }
    }
  `;

  try {
    const data = await client.request(query);
    const auctions = data.saleAuctions;

    // Calculate stats
    const prices = auctions.map(a => parseInt(a.startingPrice) / 1e18).filter(p => p > 0);
    const avgPrice = prices.length > 0 ? prices.reduce((a, b) => a + b, 0) / prices.length : 0;
    const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
    const maxPrice = prices.length > 0 ? Math.max(...prices) : 0;

    // Count by class
    const byClass = {};
    auctions.forEach(a => {
      const cls = a.tokenId.mainClassStr;
      byClass[cls] = (byClass[cls] || 0) + 1;
    });

    return {
      totalListings: auctions.length,
      avgPrice: avgPrice.toFixed(2),
      minPrice: minPrice.toFixed(2),
      maxPrice: maxPrice.toFixed(2),
      byClass
    };
  } catch (error) {
    console.error('Error fetching market stats:', error);
    return null;
  }
}

/**
 * Format hero data for display
 */
export function formatHeroSummary(hero) {
  if (!hero) return 'Hero not found';

  const lines = [
    `**Hero #${hero.normalizedId || hero.id}**`,
    `**Class:** ${hero.mainClassStr}${hero.subClassStr ? ` / ${hero.subClassStr}` : ''}`,
    `**Profession:** ${hero.professionStr || 'Unknown'}`,
    `**Rarity:** ${['Common', 'Uncommon', 'Rare', 'Legendary', 'Mythic'][hero.rarity] || hero.rarity}`,
    `**Level:** ${hero.level} | **Gen:** ${hero.generation}`,
    `**Stats:** STR ${hero.strength} | INT ${hero.intelligence} | WIS ${hero.wisdom} | LCK ${hero.luck}`,
    `**Profession Skills:** ⛏️ ${(hero.mining / 10).toFixed(1)} | 🌱 ${(hero.gardening / 10).toFixed(1)} | 🌿 ${(hero.foraging / 10).toFixed(1)} | 🎣 ${(hero.fishing / 10).toFixed(1)}`,
    `**Summons:** ${hero.summonsRemaining || (hero.maxSummons - hero.summons)}/${hero.maxSummons}`,
  ];

  if (hero.salePrice) {
    lines.push(`**💰 For Sale:** ${weiToToken(hero.salePrice)} JEWEL/CRYSTAL`);
  }

  if (hero.owner) {
    lines.push(`**Owner:** ${hero.owner.name || hero.owner.id}`);
  }

  return lines.join('\n');
}

/**
 * Format market listing for display
 */
export function formatMarketListing(auction) {
  const hero = auction.tokenId;
  const price = weiToToken(auction.startingPrice);
  const rarity = ['Common', 'Uncommon', 'Rare', 'Legendary', 'Mythic'][hero.rarity] || hero.rarity;
  
  return `**#${hero.normalizedId || hero.id}** - ${hero.mainClassStr} | ${rarity} | Lvl ${hero.level} | Gen ${hero.generation} → **${price}** JEWEL`;
}

export default {
  getHeroById,
  searchHeroes,
  getCheapestHeroes,
  getActiveSales,
  getHeroesByOwner,
  getTopProfessionHeroes,
  getHeroSaleHistory,
  getMarketStats,
  formatHeroSummary,
  formatMarketListing,
  weiToToken,
  normalizeHeroId
};
