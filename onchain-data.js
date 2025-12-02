// onchain-data.js
// DeFi Kingdoms GraphQL API + RPC integration for real-time blockchain and garden data

import { GraphQLClient, gql } from 'graphql-request';
import { ethers } from 'ethers';
import { readFileSync } from 'fs';
import { decodeHeroGenes } from './hero-genetics.js';

// ------------------------------
// GraphQL client
// ------------------------------
const DFK_GRAPHQL_ENDPOINT = 'https://api.defikingdoms.com/graphql';
const client = new GraphQLClient(DFK_GRAPHQL_ENDPOINT);

// ------------------------------
// RPC endpoints & providers
// ------------------------------
const RPC_ENDPOINTS = {
  dfk: [
    'https://subnets.avax.network/defi-kingdoms/dfk-chain/rpc',
    // Potential future fallbacks (kept commented to avoid accidental breakage)
    // 'https://dfk-chain.rpc.thirdparty.io',
  ],
  klaytn: [
    'https://public-en.node.kaia.io',
  ],
};

function createProvider(endpoints) {
  // Keep behavior simple: use first endpoint, but in the future we can add real fallback logic
  const url = Array.isArray(endpoints) ? endpoints[0] : endpoints;
  return new ethers.JsonRpcProvider(url);
}

const providers = {
  dfk: createProvider(RPC_ENDPOINTS.dfk),
  klaytn: createProvider(RPC_ENDPOINTS.klaytn),
};

// Simple safety wrapper so one bad call doesn’t crash everything
async function safeContractCall(contract, method, args = [], fallback = null) {
  try {
    if (!contract || !contract[method]) return fallback;
    const result = await contract[method](...args);
    return result ?? fallback;
  } catch (err) {
    console.warn(`[safeContractCall] ${method} failed:`, err.message);
    return fallback;
  }
}

// ------------------------------
// LP staking contracts & metadata
// ------------------------------
const LP_STAKING_ADDRESSES = {
  dfk: '0xB04e8D6aED037904B77A9F0b08002592925833b7',
  klaytn: '0xcce557DF36a6E774694D5071FC1baF19B9b07Fdc',
};

let LP_STAKING_ABI;
try {
  LP_STAKING_ABI = JSON.parse(readFileSync('LPStakingDiamond.json', 'utf-8'));
} catch (err) {
  console.warn('Could not load LP Staking ABI:', err.message);
  LP_STAKING_ABI = [];
}

const lpStakingContracts = {
  dfk: new ethers.Contract(LP_STAKING_ADDRESSES.dfk, LP_STAKING_ABI, providers.dfk),
  klaytn: new ethers.Contract(LP_STAKING_ADDRESSES.klaytn, LP_STAKING_ABI, providers.klaytn),
};

// Garden pool metadata (from devs.defikingdoms.com)
const GARDEN_POOLS = {
  dfk: [
    { pid: 0, pair: 'wJEWEL-xJEWEL', lpToken: '0x6AC38A4C112F125eac0eBDbaDBed0BC8F4575d0d', archived: false },
    { pid: 1, pair: 'CRYSTAL-AVAX', lpToken: '0x9f378F48d0c1328fd0C80d7Ae544c6CadB5Ba99E', archived: false },
    { pid: 2, pair: 'CRYSTAL-wJEWEL', lpToken: '0x48658E69D741024b4686C8f7b236D3F1D291f386', archived: false },
    { pid: 3, pair: 'CRYSTAL-USDC', lpToken: '0x04Dec678825b8DfD2D0d9bD83B538bE3fbDA2926', archived: false },
    { pid: 4, pair: 'ETH-USDC', lpToken: '0x7d4daa9eB74264b082A92F3f559ff167224484aC', archived: false },
    { pid: 5, pair: 'wJEWEL-USDC', lpToken: '0xCF329b34049033dE26e4449aeBCb41f1992724D3', archived: false },
    { pid: 6, pair: 'CRYSTAL-ETH', lpToken: '0x78C893E262e2681Dbd6B6eBA6CCA2AaD45de19AD', archived: false },
    { pid: 7, pair: 'CRYSTAL-BTC.b', lpToken: '0x00BD81c9bAc29a3b6aea7ABc92d2C9a3366Bb4dD', archived: false },
    { pid: 8, pair: 'CRYSTAL-KLAY', lpToken: '0xaFC1fBc3F3fB517EB54Bb2472051A6f0b2105320', archived: false },
    { pid: 9, pair: 'wJEWEL-KLAY', lpToken: '0x561091E2385C90d41b4c0dAef651A4b33E1a5CfE', archived: false },
    { pid: 10, pair: 'wJEWEL-AVAX', lpToken: '0xF3EabeD6Bd905e0FcD68FC3dBCd6e3A4aEE55E98', archived: false },
    { pid: 11, pair: 'wJEWEL-BTC.b', lpToken: '0xfAa8507e822397bd56eFD4480Fb12ADC41ff940B', archived: false },
    { pid: 12, pair: 'wJEWEL-ETH', lpToken: '0x79724B6996502afc773feB3Ff8Bb3C23ADf2854B', archived: false },
    { pid: 13, pair: 'BTC.b-USDC', lpToken: '0x59D642B471dd54207Cb1CDe2e7507b0Ce1b1a6a5', archived: false },
  ],
  klaytn: [
    { pid: 0, pair: 'JADE-JEWEL', lpToken: '0x85DB3CC4BCDB8bffA073A3307D48Ed97C78Af0AE', archived: false },
    { pid: 1, pair: 'JADE-wKLAY', lpToken: '0xd08A937a67eb5613ccC8729C01605E0320f1B216', archived: false },
    { pid: 2, pair: 'JADE-AVAX', lpToken: '0x63b67d4a0f553D436B0a511836A7A4bDF8Af376A', archived: false },
    { pid: 3, pair: 'JADE-oUSDT', lpToken: '0x509d49AC90EF180363269E35b363E10b95c983AF', archived: false },
    { pid: 4, pair: 'JADE-oWBTC', lpToken: '0x50943e1E500D7D62cc4c6904FBB3957fAfaEbEd5', archived: false },
    { pid: 5, pair: 'JADE-oETH', lpToken: '0x6fc625D907b524475887524b11DE833feF460698', archived: false },
    { pid: 6, pair: 'JEWEL-wKLAY', lpToken: '0x0d9d200720021F9de5C8413244f81087ecB4AdcC', archived: false },
    { pid: 7, pair: 'JEWEL-AVAX', lpToken: '0x6CE5bb25A4E7aBF7214309F7b8D7cceCEF60867E', archived: false },
    { pid: 8, pair: 'JEWEL-oUSDT', lpToken: '0xB32839faF3826158995aF72d7824802840187f19', archived: false },
    { pid: 9, pair: 'JEWEL-oWBTC', lpToken: '0x7828926761e7a6E1f9532914A282bf6631EA3C81', archived: false },
    { pid: 10, pair: 'JEWEL-oETH', lpToken: '0xd3e2Fd9dB41Acea03f0E0c22d85D3076186f4f24', archived: false },
  ],
};

// ------------------------------
// Helpers
// ------------------------------
export function weiToToken(wei) {
  if (!wei) return '0';
  try {
    const n = typeof wei === 'bigint' ? Number(wei) : parseFloat(wei);
    if (!isFinite(n)) return '0';
    return (n / 1e18).toFixed(4);
  } catch {
    return '0';
  }
}

// Helper to format hero ID based on realm offsets
export function normalizeHeroId(id) {
  const heroId = BigInt(id);
  if (heroId >= 2000000000000n) {
    return (heroId - 2000000000000n).toString();
  } else if (heroId >= 1000000000000n) {
    return (heroId - 1000000000000n).toString();
  }
  return heroId.toString();
}

// ------------------------------
// HERO FUNCTIONS
// ------------------------------
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
        statGenes
        visualGenes
        advancedGenes
        eliteGenes
        exaltedGenes
        passive1 { id name tier }
        passive2 { id name tier }
        active1 { id name tier }
        active2 { id name tier }
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

export async function searchHeroes({
  mainClass,
  profession,
  forSale = false,
  maxPrice,
  minLevel,
  maxLevel,
  limit = 20,
  orderBy = 'id',
  orderDirection = 'desc',
}) {
  const where = {};

  if (mainClass) where.mainClassStr = mainClass;
  if (profession) where.professionStr = profession;
  if (forSale) where.salePrice_not = null;
  if (maxPrice) where.salePrice_lte = (maxPrice * 1e18).toString();
  if (minLevel) where.level_gte = minLevel;
  if (maxLevel) where.level_lte = maxLevel;

  const query = gql`
    query SearchHeroes(
      $where: HeroFilter
      $first: Int!
      $orderBy: HeroOrderBy!
      $orderDirection: OrderDirection!
    ) {
      heroes(
        where: $where
        first: $first
        orderBy: $orderBy
        orderDirection: $orderDirection
      ) {
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
      orderDirection,
    });
    return data.heroes;
  } catch (error) {
    console.error('Error searching heroes:', error);
    return [];
  }
}

export async function getCheapestHeroes(mainClass = null, limit = 10) {
  const where = { salePrice_not: null, endedAt: null, winner: null };
  if (mainClass) where.mainClassStr = mainClass;

  const query = gql`
    query CheapestHeroes($where: HeroFilter, $first: Int!) {
      heroes(
        where: $where
        first: $first
        orderBy: salePrice
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

export async function getActiveSales(limit = 20, minPrice = null, maxPrice = null) {
  const where = { endedAt: null, winner: null };
  if (minPrice) where.startingPrice_gte = (minPrice * 1e18).toString();
  if (maxPrice) where.startingPrice_lte = (maxPrice * 1e18).toString();

  const query = gql`
    query ActiveSales($where: AuctionFilter, $first: Int!) {
      saleAuctions(
        where: $where
        first: $first
        orderBy: startingPrice
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

export async function getHeroesByOwner(ownerAddress, limit = 50) {
  const query = gql`
    query HeroesByOwner($owner: String!, $first: Int!) {
      heroes(
        where: { owner: $owner }
        first: $first
        orderBy: level
        orderDirection: desc
      ) {
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
        vitality
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
    const data = await client.request(query, {
      owner: ownerAddress.toLowerCase(),
      first: limit,
    });
    return data.heroes;
  } catch (error) {
    console.error('Error fetching heroes by owner:', error);
    return [];
  }
}

/**
 * Get ALL heroes owned by a specific address across all realms (paginated)
 */
export async function getAllHeroesByOwner(ownerAddress) {
  const PAGE_SIZE = 200;
  let allHeroes = [];
  let fetched = 0;
  let keepGoing = true;
  const lower = ownerAddress.toLowerCase();

  const ownerVariants = [lower, ownerAddress, ownerAddress.toUpperCase()];

  const query = gql`
    query HeroesByOwnerPaginated(
      $owners: [String!]!
      $first: Int!
      $skip: Int!
    ) {
      heroes(
        where: { owner_in: $owners }
        first: $first
        skip: $skip
        orderBy: level
        orderDirection: desc
      ) {
        id
        normalizedId
        network
        originRealm
        mainClassStr
        subClassStr
        professionStr
        rarity
        level
        generation
        strength
        intelligence
        wisdom
        vitality
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
    while (keepGoing) {
      console.log(
        `[getAllHeroesByOwner] Fetching heroes ${fetched}-${fetched + PAGE_SIZE}...`
      );

      const data = await client.request(query, {
        owners: ownerVariants,
        first: PAGE_SIZE,
        skip: fetched,
      });

      const batch = data.heroes || [];
      allHeroes.push(...batch);

      console.log(
        `[getAllHeroesByOwner] Got ${batch.length} heroes in this batch`
      );

      if (batch.length < PAGE_SIZE) keepGoing = false;
      fetched += batch.length;
    }

    const dedupMap = new Map();
    for (const hero of allHeroes) {
      if (!dedupMap.has(hero.id)) dedupMap.set(hero.id, hero);
    }

    const dedupedHeroes = Array.from(dedupMap.values());
    console.log(
      `[getAllHeroesByOwner] Total heroes after dedup: ${dedupedHeroes.length}`
    );

    return dedupedHeroes;
  } catch (error) {
    console.error('[getAllHeroesByOwner] Error fetching all heroes:', error);
    return [];
  }
}

export async function getTopProfessionHeroes(profession, limit = 10) {
  const professionField = profession.toLowerCase(); // mining, gardening, foraging, fishing

  const query = gql`
    query TopProfessionHeroes($first: Int!) {
      heroes(
        first: $first
        orderBy: ${professionField}
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

export async function getHeroSaleHistory(heroId) {
  const query = gql`
    query HeroSaleHistory($heroId: Int!) {
      saleAuctions(
        where: { tokenId: $heroId }
        orderBy: endedAt
        orderDirection: desc
      ) {
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
    const data = await client.request(query, {
      heroId: parseInt(normalizedId, 10),
    });
    return data.saleAuctions;
  } catch (error) {
    console.error('Error fetching hero sale history:', error);
    return [];
  }
}

export async function getMarketStats() {
  const query = gql`
    query MarketStats {
      saleAuctions(
        first: 1000
        where: { endedAt: null, winner: null }
        orderBy: startingPrice
        orderDirection: asc
      ) {
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

    const prices = auctions
      .map((a) => parseInt(a.startingPrice, 10) / 1e18)
      .filter((p) => p > 0);

    const avgPrice =
      prices.length > 0
        ? prices.reduce((a, b) => a + b, 0) / prices.length
        : 0;
    const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
    const maxPrice = prices.length > 0 ? Math.max(...prices) : 0;

    const byClass = {};
    auctions.forEach((a) => {
      const cls = a.tokenId.mainClassStr;
      byClass[cls] = (byClass[cls] || 0) + 1;
    });

    return {
      totalListings: auctions.length,
      avgPrice: avgPrice.toFixed(2),
      minPrice: minPrice.toFixed(2),
      maxPrice: maxPrice.toFixed(2),
      byClass,
    };
  } catch (error) {
    console.error('Error fetching market stats:', error);
    return null;
  }
}

// ------------------------------
// Formatting helpers
// ------------------------------
export function formatHeroSummary(hero) {
  if (!hero) return 'Hero not found';

  const rarityLabel =
    ['Common', 'Uncommon', 'Rare', 'Legendary', 'Mythic'][hero.rarity] ??
    hero.rarity;

  const lines = [
    `**Hero #${hero.normalizedId || hero.id}**`,
    `**Class:** ${hero.mainClassStr}${
      hero.subClassStr ? ` / ${hero.subClassStr}` : ''
    }`,
    `**Profession:** ${hero.professionStr || 'Unknown'}`,
    `**Rarity:** ${rarityLabel}`,
    `**Level:** ${hero.level} | **Gen:** ${hero.generation}`,
    `**Stats:** STR ${hero.strength} | INT ${hero.intelligence} | WIS ${hero.wisdom} | LCK ${hero.luck}`,
    `**Profession Skills:** ⛏️ ${(
      hero.mining / 10
    ).toFixed(1)} | 🌱 ${(hero.gardening / 10).toFixed(1)} | 🌿 ${(
      hero.foraging / 10
    ).toFixed(1)} | 🎣 ${(hero.fishing / 10).toFixed(1)}`,
    `**Summons:** ${
      hero.summonsRemaining ?? hero.maxSummons - hero.summons
    }/${hero.maxSummons}`,
  ];

  if (hero.salePrice) {
    lines.push(`**💰 For Sale:** ${weiToToken(hero.salePrice)} JEWEL/CRYSTAL`);
  }

  if (hero.owner) {
    lines.push(`**Owner:** ${hero.owner.name || hero.owner.id}`);
  }

  return lines.join('\n');
}

export function formatMarketListing(auction) {
  const hero = auction.tokenId;
  const price = weiToToken(auction.startingPrice);
  const rarity =
    ['Common', 'Uncommon', 'Rare', 'Legendary', 'Mythic'][hero.rarity] ??
    hero.rarity;

  return `**#${hero.normalizedId || hero.id}** - ${hero.mainClassStr} | ${rarity} | Lvl ${hero.level} | Gen ${hero.generation} → **${price}** JEWEL`;
}

// ------------------------------
// HERO INDEX BUILDER
// ------------------------------
export async function buildHeroIndexForWallet(ownerAddress) {
  console.log(
    `[HeroIndex] Building genetics-aware index for ${ownerAddress}...`
  );

  try {
    const allHeroes = await getAllHeroesByOwner(ownerAddress);
    console.log(`[HeroIndex] Found ${allHeroes.length} total heroes`);

    if (allHeroes.length === 0) {
      return {
        wallet: ownerAddress.toLowerCase(),
        realms: {
          dfk: { heroes: [], totalsByClass: {} },
          met: { heroes: [], totalsByClass: {} },
          kla: { heroes: [], totalsByClass: {} },
        },
        totals: {
          dfk: 0,
          met: 0,
          kla: 0,
          all: 0,
        },
        missingHeroes: [],
      };
    }

    const decodedHeroes = [];
    const missingHeroes = [];

    for (const hero of allHeroes) {
      try {
        const decoded = decodeHeroGenes(hero);
        decodedHeroes.push(decoded);
      } catch (err) {
        console.error(
          `[HeroIndex] Failed to decode hero ${hero.id}:`,
          err.message
        );
        missingHeroes.push(hero.id);
      }
    }

    console.log(
      `[HeroIndex] Successfully decoded ${decodedHeroes.length}/${allHeroes.length} heroes`
    );

    const heroesByRealm = {
      dfk: decodedHeroes.filter((h) => h.realm === 'dfk'),
      met: decodedHeroes.filter((h) => h.realm === 'met'),
      kla: decodedHeroes.filter((h) => h.realm === 'kla'),
    };

    function buildClassTotals(heroes) {
      const totals = {};
      for (const hero of heroes) {
        const mainClass = hero.mainClass.dominant;
        totals[mainClass] = (totals[mainClass] || 0) + 1;
      }
      return totals;
    }

    const index = {
      wallet: ownerAddress.toLowerCase(),
      realms: {
        dfk: {
          heroes: heroesByRealm.dfk,
          totalsByClass: buildClassTotals(heroesByRealm.dfk),
        },
        met: {
          heroes: heroesByRealm.met,
          totalsByClass: buildClassTotals(heroesByRealm.met),
        },
        kla: {
          heroes: heroesByRealm.kla,
          totalsByClass: buildClassTotals(heroesByRealm.kla),
        },
      },
      totals: {
        dfk: heroesByRealm.dfk.length,
        met: heroesByRealm.met.length,
        kla: heroesByRealm.kla.length,
        all: decodedHeroes.length,
      },
      missingHeroes,
    };

    console.log(
      `[HeroIndex] Index complete - DFK: ${index.totals.dfk}, MET: ${index.totals.met}, KLA: ${index.totals.kla}`
    );

    return index;
  } catch (err) {
    console.error('[HeroIndex] Error building hero index:', err);
    throw err;
  }
}

// ------------------------------
// GARDEN POOLS FUNCTIONS
// ------------------------------
export async function getGardenPools(realm = 'dfk', limit = null) {
  try {
    const contract = lpStakingContracts[realm];
    const poolMeta = GARDEN_POOLS[realm];

    if (!contract || !poolMeta) {
      throw new Error(`Invalid realm: ${realm}`);
    }

    const poolLength = await safeContractCall(
      contract,
      'getPoolLength',
      [],
      0n
    );
    const totalAllocPoint = await safeContractCall(
      contract,
      'getTotalAllocPoint',
      [],
      0n
    );

    const poolsToFetch = limit ? Math.min(Number(poolLength), limit) : Number(poolLength);
    const pools = [];

    for (let pid = 0; pid < poolsToFetch; pid++) {
      try {
        const poolInfo = await safeContractCall(contract, 'getPoolInfo', [pid]);
        if (!poolInfo) continue;

        const meta = poolMeta[pid];
        if (!meta || meta.archived) continue;

        const allocPoint = poolInfo.allocPoint ?? poolInfo[1];
        const totalStaked = poolInfo.totalStaked ?? poolInfo[4];

        const allocPercent =
          Number(totalAllocPoint) > 0
            ? ((Number(allocPoint) / Number(totalAllocPoint)) * 100).toFixed(2)
            : '0.00';

        const totalStakedFormatted = ethers.formatEther(totalStaked ?? '0');

        pools.push({
          pid,
          pair: meta.pair,
          lpToken: meta.lpToken,
          allocPoint: Number(allocPoint),
          allocPercent: `${allocPercent}%`,
          totalStaked: totalStakedFormatted,
          totalStakedRaw: totalStaked,
          realm,
        });
      } catch (err) {
        console.warn(`Error fetching pool ${pid}:`, err.message);
      }
    }

    return pools;
  } catch (error) {
    console.error('Error fetching garden pools:', error);
    return [];
  }
}

export async function getPendingRewards(walletAddress, realm = 'dfk', pid = null) {
  try {
    const contract = lpStakingContracts[realm];
    if (!contract) throw new Error(`Invalid realm: ${realm}`);

    if (pid !== null) {
      const pending = await safeContractCall(
        contract,
        'getPendingRewards',
        [pid, walletAddress],
        0n
      );
      return {
        pid,
        pending: ethers.formatEther(pending ?? 0n),
        pendingRaw: pending ?? 0n,
        realm,
      };
    } else {
      const allPending = await safeContractCall(
        contract,
        'getAllPendingRewards',
        [walletAddress],
        0n
      );
      return {
        totalPending: ethers.formatEther(allPending ?? 0n),
        totalPendingRaw: allPending ?? 0n,
        realm,
      };
    }
  } catch (error) {
    console.error('Error fetching pending rewards:', error);
    return null;
  }
}

export async function getUserGardenPositions(walletAddress, realm = 'dfk') {
  try {
    const contract = lpStakingContracts[realm];
    const poolMeta = GARDEN_POOLS[realm];

    if (!contract || !poolMeta) {
      throw new Error(`Invalid realm: ${realm}`);
    }

    const poolLength = await safeContractCall(
      contract,
      'getPoolLength',
      [],
      0n
    );
    const positions = [];

    for (let pid = 0; pid < Number(poolLength); pid++) {
      try {
        const userInfo = await safeContractCall(
          contract,
          'getUserInfo',
          [pid, walletAddress],
          null
        );
        if (!userInfo) continue;

        const amount = userInfo.amount ?? userInfo[0];
        if (!amount || Number(amount) <= 0) continue;

        const pending = await safeContractCall(
          contract,
          'getPendingRewards',
          [pid, walletAddress],
          0n
        );
        const meta = poolMeta[pid];

        positions.push({
          pid,
          pair: meta?.pair || `Pool ${pid}`,
          stakedAmount: ethers.formatEther(amount),
          stakedAmountRaw: amount,
          pendingRewards: ethers.formatEther(pending ?? 0n),
          pendingRewardsRaw: pending ?? 0n,
          lastDeposit: userInfo.lastDepositTimestamp ?? userInfo[2],
          realm,
        });
      } catch {
        // skip pools that fail
      }
    }

    return positions;
  } catch (error) {
    console.error('Error fetching user positions:', error);
    return [];
  }
}

export async function getGardenPoolByPid(pid, realm = 'dfk') {
  try {
    const contract = lpStakingContracts[realm];
    const poolMeta = GARDEN_POOLS[realm];

    if (!contract || !poolMeta || !poolMeta[pid]) {
      return null;
    }

    const poolInfo = await safeContractCall(contract, 'getPoolInfo', [pid]);
    const totalAllocPoint = await safeContractCall(
      contract,
      'getTotalAllocPoint',
      [],
      0n
    );
    if (!poolInfo) return null;

    const meta = poolMeta[pid];

    const allocPoint = poolInfo.allocPoint ?? poolInfo[1];
    const totalStaked = poolInfo.totalStaked ?? poolInfo[4];
    const allocPercent =
      Number(totalAllocPoint) > 0
        ? ((Number(allocPoint) / Number(totalAllocPoint)) * 100).toFixed(2)
        : '0.00';

    return {
      pid,
      pair: meta.pair,
      lpToken: meta.lpToken,
      allocPoint: Number(allocPoint),
      allocPercent: `${allocPercent}%`,
      totalStaked: ethers.formatEther(totalStaked ?? '0'),
      totalStakedRaw: totalStaked,
      archived: meta.archived,
      realm,
    };
  } catch (error) {
    console.error(`Error fetching pool ${pid}:`, error);
    return null;
  }
}

// ------------------------------
// INFLUENCE (Metis)
// ------------------------------
export async function getPlayerInfluence(playerAddress) {
  try {
    const metisRpcEndpoints = [
      'https://metis-mainnet.public.blastapi.io',
      'https://andromeda.metis.io',
      'https://rpc.metis.io',
    ];

    let metisProvider = null;
    for (const endpoint of metisRpcEndpoints) {
      try {
        const prov = new ethers.JsonRpcProvider(endpoint);
        await prov.getNetwork();
        metisProvider = prov;
        console.log(`[getPlayerInfluence] Using Metis RPC: ${endpoint}`);
        break;
      } catch (e) {
        console.warn(
          `[getPlayerInfluence] Failed to connect to ${endpoint}: ${e.message}`
        );
      }
    }

    if (!metisProvider) {
      console.warn(
        `[getPlayerInfluence] No working Metis RPC endpoint available`
      );
      return 0;
    }

    const PVP_DIAMOND_ADDRESS = '0xc7681698B14a2381d9f1eD69FC3D27F33965b53B';
    const abi = [
      'function getPlayerInfluenceData(address _player) view returns (tuple(uint256 totalInfluence, uint256 availableInfluence, uint256 resetWeekNumber, uint256 spectatingBattleId))',
    ];

    const contract = new ethers.Contract(
      PVP_DIAMOND_ADDRESS,
      abi,
      metisProvider
    );
    const influenceData = await contract.getPlayerInfluenceData(playerAddress);
    const influence = Number(influenceData.totalInfluence || 0);
    console.log(
      `[getPlayerInfluence] ${playerAddress.slice(
        0,
        6
      )}...${playerAddress.slice(-4)}: ${influence} INFLUENCE`
    );
    return influence;
  } catch (err) {
    console.warn(
      `[getPlayerInfluence] Error fetching influence for ${playerAddress}:`,
      err.message
    );
    return 0;
  }
}

// ------------------------------
// HERO METRICS & DFK AGE
// ------------------------------
export function calculateHeroMetrics(heroes) {
  if (!heroes || heroes.length === 0) {
    return { gen0Count: 0, heroAge: 0 };
  }

  const gen0Count = heroes.filter(
    (h) => h.generation === 0 || h.generation === '0'
  ).length;

  const oldestHero = heroes.reduce((max, h) => {
    const heroLevel = Number(h.level || 0);
    const maxLevel = Number(max.level || 0);
    return heroLevel > maxLevel ? h : max;
  }, heroes[0]);

  const heroAge = Math.floor((Number(oldestHero.level || 1) - 1) / 2.5);

  return { gen0Count, heroAge };
}

export async function getFirstDfkTxTimestamp(walletAddress) {
  try {
    if (!walletAddress) return null;

    const dfkProvider = providers.dfk;

    const latestBlockNum = await dfkProvider.getBlockNumber();
    console.log(`[DfkAge] Latest DFK block: ${latestBlockNum}`);

    let searchStart = Math.max(0, latestBlockNum - 50000);
    let searchEnd = latestBlockNum;
    let firstTxBlock = null;

    console.log(
      `[DfkAge] Searching blocks ${searchStart} to ${searchEnd} for ${walletAddress.slice(
        0,
        6
      )}...${walletAddress.slice(-4)}`
    );

    for (let blockNum = searchEnd; blockNum >= searchStart; blockNum--) {
      try {
        const block = await dfkProvider.getBlock(blockNum);
        if (!block || !block.transactions?.length) continue;

        for (const txHash of block.transactions) {
          const tx = await dfkProvider.getTransaction(txHash);
          if (
            tx &&
            (tx.from?.toLowerCase() === walletAddress.toLowerCase() ||
              tx.to?.toLowerCase() === walletAddress.toLowerCase())
          ) {
            firstTxBlock = block;
            console.log(
              `[DfkAge] Found transaction in block ${blockNum} from wallet`
            );
            break;
          }
        }

        if (firstTxBlock) break;
        if ((searchEnd - blockNum) % 1000 === 0) {
          console.log(
            `[DfkAge] Searched back ${searchEnd - blockNum} blocks...`
          );
        }
      } catch {
        continue;
      }
    }

    if (!firstTxBlock) {
      console.warn(
        `[DfkAge] No transactions found for ${walletAddress} in recent blocks`
      );
      return null;
    }

    const timestampMs =
      (firstTxBlock.timestamp || Math.floor(Date.now() / 1000)) * 1000;
    console.log(
      `[DfkAge] Found first tx for ${walletAddress.slice(
        0,
        6
      )}...${walletAddress.slice(-4)}: ${new Date(
        timestampMs
      ).toISOString()}`
    );

    return timestampMs;
  } catch (err) {
    console.warn(
      `[getFirstDfkTxTimestamp] Error fetching first tx for ${walletAddress}:`,
      err.message
    );
    return null;
  }
}

export function calculateDfkAgeDays(firstTxTimestampMs) {
  if (!firstTxTimestampMs) return null;
  const ageMs = Date.now() - firstTxTimestampMs;
  return Math.floor(ageMs / (1000 * 60 * 60 * 24));
}

// ------------------------------
// Garden summary formatting
// ------------------------------
export function formatGardenSummary(pool, rewards = null) {
  let summary = `**${pool.pair}** (Pool #${pool.pid}) - ${pool.realm.toUpperCase()}\n`;
  summary += `Allocation: ${pool.allocPercent} of emissions\n`;
  summary += `Total Staked: ${parseFloat(pool.totalStaked).toFixed(
    2
  )} LP tokens\n`;

  if (rewards) {
    const pending = rewards.pending ?? rewards.totalPending ?? '0';
    summary += `Harvestable: ${parseFloat(pending).toFixed(4)} ${
      pool.realm === 'dfk' ? 'CRYSTAL' : 'JADE'
    }`;
  }

  return summary;
}

// ------------------------------
// Default export (backwards compat)
// ------------------------------
export default {
  getHeroById,
  searchHeroes,
  getCheapestHeroes,
  getActiveSales,
  getHeroesByOwner,
  getAllHeroesByOwner,
  getTopProfessionHeroes,
  getHeroSaleHistory,
  getMarketStats,
  formatHeroSummary,
  formatMarketListing,
  buildHeroIndexForWallet,
  weiToToken,
  normalizeHeroId,
  getGardenPools,
  getPendingRewards,
  getUserGardenPositions,
  getGardenPoolByPid,
  getPlayerInfluence,
  calculateHeroMetrics,
  getFirstDfkTxTimestamp,
  calculateDfkAgeDays,
  formatGardenSummary,
};