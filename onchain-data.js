// onchain-data.js
// DeFi Kingdoms GraphQL API integration for real-time blockchain data
// Includes garden pool APR and harvest data via blockchain RPC

import { GraphQLClient, gql } from 'graphql-request';
import { ethers } from 'ethers';
import { readFileSync } from 'fs';

const DFK_GRAPHQL_ENDPOINT = 'https://api.defikingdoms.com/graphql';
const client = new GraphQLClient(DFK_GRAPHQL_ENDPOINT);

// ========== GARDEN POOLS CONFIGURATION ==========

// RPC Providers
const RPC_ENDPOINTS = {
  dfk: 'https://subnets.avax.network/defi-kingdoms/dfk-chain/rpc',
  klaytn: 'https://public-en.node.kaia.io'
};

// LP Staking Contract Addresses
const LP_STAKING_ADDRESSES = {
  dfk: '0xB04e8D6aED037904B77A9F0b08002592925833b7',
  klaytn: '0xcce557DF36a6E774694D5071FC1baF19B9b07Fdc'
};

// Load LP Staking ABI
let LP_STAKING_ABI;
try {
  LP_STAKING_ABI = JSON.parse(readFileSync('LPStakingDiamond.json', 'utf-8'));
} catch (err) {
  console.warn('Could not load LP Staking ABI:', err.message);
  LP_STAKING_ABI = []; // Fallback
}

// Initialize providers
const providers = {
  dfk: new ethers.JsonRpcProvider(RPC_ENDPOINTS.dfk),
  klaytn: new ethers.JsonRpcProvider(RPC_ENDPOINTS.klaytn)
};

// Initialize contracts
const lpStakingContracts = {
  dfk: new ethers.Contract(LP_STAKING_ADDRESSES.dfk, LP_STAKING_ABI, providers.dfk),
  klaytn: new ethers.Contract(LP_STAKING_ADDRESSES.klaytn, LP_STAKING_ABI, providers.klaytn)
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
    { pid: 7, pair: 'CRYSTAL-BTC.b', lpToken: '0x00BD81c9bAC29a3b6aea7ABc92d2C9a3366Bb4dD', archived: false },
    { pid: 8, pair: 'CRYSTAL-KLAY', lpToken: '0xaFC1fBc3F3fB517EB54Bb2472051A6f0b2105320', archived: false },
    { pid: 9, pair: 'wJEWEL-KLAY', lpToken: '0x561091E2385C90d41b4c0dAef651A4b33E1a5CfE', archived: false },
    { pid: 10, pair: 'wJEWEL-AVAX', lpToken: '0xF3EabeD6Bd905e0FcD68FC3dBCd6e3A4aEE55E98', archived: false },
    { pid: 11, pair: 'wJEWEL-BTC.b', lpToken: '0xfAa8507e822397bd56eFD4480Fb12ADC41ff940B', archived: false },
    { pid: 12, pair: 'wJEWEL-ETH', lpToken: '0x79724B6996502afc773feB3Ff8Bb3C23ADf2854B', archived: false },
    { pid: 13, pair: 'BTC.b-USDC', lpToken: '0x59D642B471dd54207Cb1CDe2e7507b0Ce1b1a6a5', archived: false }
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
    { pid: 10, pair: 'JEWEL-oETH', lpToken: '0xd3e2Fd9dB41Acea03f0E0c22d85D3076186f4f24', archived: false }
  ]
};

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
        
        # Gene data
        advancedGenes
        eliteGenes
        exaltedGenes
        passive1 {
          id
          name
          tier
        }
        passive2 {
          id
          name
          tier
        }
        active1 {
          id
          name
          tier
        }
        active2 {
          id
          name
          tier
        }
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

// ========== GARDEN POOLS FUNCTIONS ==========

/**
 * Get all garden pools for a specific realm
 * @param {string} realm - 'dfk' or 'klaytn'
 * @param {number} limit - Max pools to return (default: all)
 * @returns {Array} Pool data with APR, TVL, and allocation
 */
export async function getGardenPools(realm = 'dfk', limit = null) {
  try {
    const contract = lpStakingContracts[realm];
    const poolMeta = GARDEN_POOLS[realm];
    
    if (!contract || !poolMeta) {
      throw new Error(`Invalid realm: ${realm}`);
    }

    const poolLength = await contract.getPoolLength();
    const totalAllocPoint = await contract.getTotalAllocPoint();
    
    const poolsToFetch = limit ? Math.min(limit, poolLength) : poolLength;
    const pools = [];

    for (let pid = 0; pid < poolsToFetch; pid++) {
      try {
        const poolInfo = await contract.getPoolInfo(pid);
        const meta = poolMeta[pid];
        
        if (!meta || meta.archived) continue;

        // Extract pool data
        const allocPoint = poolInfo.allocPoint || poolInfo[1];
        const totalStaked = poolInfo.totalStaked || poolInfo[4];
        
        // Calculate allocation percentage
        const allocPercent = (Number(allocPoint) / Number(totalAllocPoint) * 100).toFixed(2);
        
        // Format total staked
        const totalStakedFormatted = ethers.formatEther(totalStaked || '0');

        pools.push({
          pid,
          pair: meta.pair,
          lpToken: meta.lpToken,
          allocPoint: Number(allocPoint),
          allocPercent: `${allocPercent}%`,
          totalStaked: totalStakedFormatted,
          totalStakedRaw: totalStaked,
          realm
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

/**
 * Get pending rewards for a user across all pools or specific pool
 * @param {string} walletAddress - User's wallet address
 * @param {string} realm - 'dfk' or 'klaytn'
 * @param {number|null} pid - Specific pool ID (null for all pools)
 * @returns {Object} Pending rewards data
 */
export async function getPendingRewards(walletAddress, realm = 'dfk', pid = null) {
  try {
    const contract = lpStakingContracts[realm];
    
    if (!contract) {
      throw new Error(`Invalid realm: ${realm}`);
    }

    if (pid !== null) {
      // Get rewards for specific pool
      const pending = await contract.getPendingRewards(pid, walletAddress);
      return {
        pid,
        pending: ethers.formatEther(pending),
        pendingRaw: pending,
        realm
      };
    } else {
      // Get total rewards across all pools
      const allPending = await contract.getAllPendingRewards(walletAddress);
      return {
        totalPending: ethers.formatEther(allPending),
        totalPendingRaw: allPending,
        realm
      };
    }
  } catch (error) {
    console.error('Error fetching pending rewards:', error);
    return null;
  }
}

/**
 * Get user's staked positions in garden pools
 * @param {string} walletAddress - User's wallet address
 * @param {string} realm - 'dfk' or 'klaytn'
 * @returns {Array} User's staking positions
 */
export async function getUserGardenPositions(walletAddress, realm = 'dfk') {
  try {
    const contract = lpStakingContracts[realm];
    const poolMeta = GARDEN_POOLS[realm];
    
    if (!contract || !poolMeta) {
      throw new Error(`Invalid realm: ${realm}`);
    }

    const poolLength = await contract.getPoolLength();
    const positions = [];

    for (let pid = 0; pid < poolLength; pid++) {
      try {
        const userInfo = await contract.getUserInfo(pid, walletAddress);
        const amount = userInfo.amount || userInfo[0];
        
        if (amount && Number(amount) > 0) {
          const pending = await contract.getPendingRewards(pid, walletAddress);
          const meta = poolMeta[pid];
          
          positions.push({
            pid,
            pair: meta?.pair || `Pool ${pid}`,
            stakedAmount: ethers.formatEther(amount),
            stakedAmountRaw: amount,
            pendingRewards: ethers.formatEther(pending),
            pendingRewardsRaw: pending,
            lastDeposit: userInfo.lastDepositTimestamp || userInfo[2],
            realm
          });
        }
      } catch (err) {
        // Skip pools with no position
      }
    }

    return positions;
  } catch (error) {
    console.error('Error fetching user positions:', error);
    return [];
  }
}

/**
 * Get pool info by pool ID
 * @param {number} pid - Pool ID
 * @param {string} realm - 'dfk' or 'klaytn'
 * @returns {Object} Pool information
 */
export async function getGardenPoolByPid(pid, realm = 'dfk') {
  try {
    const contract = lpStakingContracts[realm];
    const poolMeta = GARDEN_POOLS[realm];
    
    if (!contract || !poolMeta || !poolMeta[pid]) {
      return null;
    }

    const poolInfo = await contract.getPoolInfo(pid);
    const totalAllocPoint = await contract.getTotalAllocPoint();
    const meta = poolMeta[pid];
    
    const allocPoint = poolInfo.allocPoint || poolInfo[1];
    const totalStaked = poolInfo.totalStaked || poolInfo[4];
    const allocPercent = (Number(allocPoint) / Number(totalAllocPoint) * 100).toFixed(2);

    return {
      pid,
      pair: meta.pair,
      lpToken: meta.lpToken,
      allocPoint: Number(allocPoint),
      allocPercent: `${allocPercent}%`,
      totalStaked: ethers.formatEther(totalStaked || '0'),
      totalStakedRaw: totalStaked,
      archived: meta.archived,
      realm
    };
  } catch (error) {
    console.error(`Error fetching pool ${pid}:`, error);
    return null;
  }
}

/**
 * Format garden pool summary for Discord display
 * @param {Object} pool - Pool data
 * @param {Object} rewards - Pending rewards (optional)
 * @returns {string} Formatted summary
 */
export function formatGardenSummary(pool, rewards = null) {
  let summary = `**${pool.pair}** (Pool #${pool.pid}) - ${pool.realm.toUpperCase()}\n`;
  summary += `Allocation: ${pool.allocPercent} of emissions\n`;
  summary += `Total Staked: ${parseFloat(pool.totalStaked).toFixed(2)} LP tokens\n`;
  
  if (rewards) {
    summary += `Harvestable: ${parseFloat(rewards.pending || rewards.totalPending).toFixed(4)} ${pool.realm === 'dfk' ? 'CRYSTAL' : 'JADE'}`;
  }
  
  return summary;
}
