import { ethers } from 'ethers';

const DFK_CHAIN_RPC = 'https://subnets.avax.network/defi-kingdoms/dfk-chain/rpc';

const TOKENS = {
  JEWEL: '0xCCb93dABD71c8Dad03Fc4CE5559dC3D89F67a260',
  CRYSTAL: '0x04b9dA42306B023f3572e106B11D82aAd9D32EBb',
  cJEWEL: '0x9ed2c155632C042CB8bC20634571fF1CA26f5742',
  xCRYSTAL: '0x6e7185872bcdf3f7a6cbbe81356e50daffb002d2',
  xJEWEL_LEGACY: '0xA9cE83507D872C5e1273E745aBcfDa849DAA654F',
};

const LP_POOLS = {
  'wJEWEL-xJEWEL': '0x6AC38A4C112F125eac0eBDbaDBed0BC8F4575d0d',
  'CRYSTAL-AVAX': '0x9f378F48d0c1328fd0C80d7Ae544C6CadB5Ba99E',
  'CRYSTAL-wJEWEL': '0x48658E69D741024b4686C8f7b236D3F1D291f386',
  'CRYSTAL-USDC': '0x04Dec678825b8DfD2D0d9bD83B538bE3fbDA2926',
  'ETH-USDC': '0x7d4daa9eB74264b082A92F3f559ff167224484aC',
  'wJEWEL-USDC': '0xCF329b34049033dE26e4449aeBCb41f1992724D3',
  'CRYSTAL-ETH': '0x78C893E262e2681Dbd6B6eBA6CCA2AaD45de19AD',
  'CRYSTAL-BTC.b': '0x00BD81c9bAc29a3b6aea7ABc92d2C9a3366Bb4dD',
  'CRYSTAL-KLAY': '0xaFC1fBc3F3fB517EB54Bb2472051A6f0b2105320',
  'wJEWEL-KLAY': '0x561091E2385C90d41b4c0dAef651A4b33E1a5CfE',
  'wJEWEL-AVAX': '0xF3EabeD6Bd905e0FcD68FC3dBCd6e3A4aEE55E98',
  'wJEWEL-BTC.b': '0xfAa8507e822397bd56eFD4480Fb12ADC41ff940B',
  'wJEWEL-ETH': '0x79724B6996502afc773feB3Ff8Bb3C23ADf2854B',
  'BTC.b-USDC': '0x59D642B471dd54207Cb1CDe2e7507b0Ce1b1a6a5',
};

const SYSTEM_CONTRACTS = {
  'LP Staking (Master Gardener)': '0xB04e8D6aED037904B77A9F0b08002592925833b7',
  'Validator Fees': '0xED6dC9FD092190C08e4afF8611496774Ded19D54',
  'Quest Reward Fund': '0x5F46f22F3de3e5aB6D8B8D2c1893b9dF3F63D0A2',
};

const BRIDGE_CONTRACTS = {
  'Synapse Bridge': '0xE05c976d3f045D0E6E7A6f61083d98A15603cF6A',
  'Synapse Router': '0x7E7A0e201FD38d3ADAA9523Da6C109a07118C96a',
  'Bridge Zap': '0x230a1ac45690b9ae1176389434610b9526d2f21b',
};

const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function totalSupply() view returns (uint256)',
  'function decimals() view returns (uint8)',
];

const LP_ABI = [
  ...ERC20_ABI,
  'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
  'function token0() view returns (address)',
  'function token1() view returns (address)',
];

interface TokenBalance {
  address: string;
  balance: string;
  balanceFormatted: number;
}

interface CategoryBreakdown {
  category: string;
  contracts: {
    name: string;
    address: string;
    jewelBalance: number;
    crystalBalance: number;
    jewelValueUSD: number;
    crystalValueUSD: number;
    totalValueUSD: number;
  }[];
  totalJewel: number;
  totalCrystal: number;
  totalValueUSD: number;
}

interface ValueBreakdownResult {
  timestamp: string;
  prices: {
    jewel: number;
    crystal: number;
    jewelSource: 'defillama' | 'coingecko' | 'fallback';
    crystalSource: 'defillama' | 'coingecko' | 'fallback';
  };
  categories: CategoryBreakdown[];
  summary: {
    totalJewelLocked: number;
    totalCrystalLocked: number;
    totalValueUSD: number;
    lpPoolsValue: number;
    stakingValue: number;
    bridgeValue: number;
    systemValue: number;
  };
}

interface PriceResult {
  price: number;
  source: 'defillama' | 'coingecko' | 'fallback';
  timestamp: number;
}

const priceCache: { jewel?: PriceResult; crystal?: PriceResult } = {};
const CACHE_TTL_MS = 60000;

async function fetchDefiLlamaPrices(): Promise<{ jewel: number | null; crystal: number | null }> {
  try {
    const jewelAddress = 'dfk:0xCCb93dABD71c8Dad03Fc4CE5559dC3D89F67a260';
    const crystalAddress = 'dfk:0x04b9dA42306B023f3572e106B11D82aAd9D32EBb';
    
    const response = await fetch(
      `https://coins.llama.fi/prices/current/${jewelAddress},${crystalAddress}`,
      { signal: AbortSignal.timeout(10000) }
    );
    
    if (!response.ok) {
      console.log('[ValueBreakdown] DefiLlama API returned status:', response.status);
      return { jewel: null, crystal: null };
    }
    
    const data = await response.json();
    const jewelData = data.coins?.[jewelAddress];
    const crystalData = data.coins?.[crystalAddress];
    
    console.log('[ValueBreakdown] DefiLlama response:', JSON.stringify(data.coins || {}, null, 2));
    
    return {
      jewel: jewelData?.price || null,
      crystal: crystalData?.price || null,
    };
  } catch (err) {
    console.log('[ValueBreakdown] DefiLlama fetch failed:', err);
    return { jewel: null, crystal: null };
  }
}

async function fetchCoinGeckoPrice(token: 'JEWEL' | 'CRYSTAL'): Promise<number | null> {
  try {
    const id = token === 'JEWEL' ? 'defi-kingdoms' : 'defi-kingdoms-crystal';
    const response = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`,
      { signal: AbortSignal.timeout(10000) }
    );
    
    if (!response.ok) return null;
    
    const data = await response.json();
    return data[id]?.usd || null;
  } catch {
    return null;
  }
}

async function getTokenPrice(token: 'JEWEL' | 'CRYSTAL'): Promise<PriceResult> {
  const cacheKey = token.toLowerCase() as 'jewel' | 'crystal';
  const cached = priceCache[cacheKey];
  
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached;
  }
  
  const llamaPrices = await fetchDefiLlamaPrices();
  const llamaPrice = token === 'JEWEL' ? llamaPrices.jewel : llamaPrices.crystal;
  
  if (llamaPrice && llamaPrice > 0) {
    const result: PriceResult = { price: llamaPrice, source: 'defillama', timestamp: Date.now() };
    priceCache[cacheKey] = result;
    console.log(`[ValueBreakdown] ${token} price from DefiLlama: $${llamaPrice}`);
    return result;
  }
  
  const geckoPrice = await fetchCoinGeckoPrice(token);
  if (geckoPrice && geckoPrice > 0) {
    const result: PriceResult = { price: geckoPrice, source: 'coingecko', timestamp: Date.now() };
    priceCache[cacheKey] = result;
    console.log(`[ValueBreakdown] ${token} price from CoinGecko: $${geckoPrice}`);
    return result;
  }
  
  const fallbackPrice = token === 'JEWEL' ? 0.15 : 0.02;
  console.warn(`[ValueBreakdown] Using fallback price for ${token}: $${fallbackPrice}`);
  return { price: fallbackPrice, source: 'fallback', timestamp: Date.now() };
}

async function getTokenBalance(
  provider: ethers.JsonRpcProvider,
  tokenAddress: string,
  holderAddress: string
): Promise<number> {
  try {
    const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
    const balance = await contract.balanceOf(holderAddress);
    return parseFloat(ethers.formatEther(balance));
  } catch {
    return 0;
  }
}

async function getLPReserves(
  provider: ethers.JsonRpcProvider,
  lpAddress: string
): Promise<{ token0: string; token1: string; reserve0: number; reserve1: number }> {
  try {
    const contract = new ethers.Contract(lpAddress, LP_ABI, provider);
    const [reserves, token0, token1] = await Promise.all([
      contract.getReserves(),
      contract.token0(),
      contract.token1(),
    ]);
    return {
      token0: token0.toLowerCase(),
      token1: token1.toLowerCase(),
      reserve0: parseFloat(ethers.formatEther(reserves[0])),
      reserve1: parseFloat(ethers.formatEther(reserves[1])),
    };
  } catch {
    return { token0: '', token1: '', reserve0: 0, reserve1: 0 };
  }
}

async function getStakedTokenSupply(
  provider: ethers.JsonRpcProvider,
  stakedTokenAddress: string
): Promise<number> {
  try {
    const contract = new ethers.Contract(stakedTokenAddress, ERC20_ABI, provider);
    const supply = await contract.totalSupply();
    return parseFloat(ethers.formatEther(supply));
  } catch {
    return 0;
  }
}

export async function getValueBreakdown(): Promise<ValueBreakdownResult> {
  const provider = new ethers.JsonRpcProvider(DFK_CHAIN_RPC);
  
  const [jewelPriceResult, crystalPriceResult] = await Promise.all([
    getTokenPrice('JEWEL'),
    getTokenPrice('CRYSTAL'),
  ]);
  
  const jewelPrice = jewelPriceResult.price;
  const crystalPrice = crystalPriceResult.price;

  const categories: CategoryBreakdown[] = [];

  const lpPoolContracts = await Promise.all(
    Object.entries(LP_POOLS).map(async ([name, address]) => {
      const reserves = await getLPReserves(provider, address);
      let jewelBalance = 0;
      let crystalBalance = 0;

      const jewelAddr = TOKENS.JEWEL.toLowerCase();
      const crystalAddr = TOKENS.CRYSTAL.toLowerCase();

      if (reserves.token0 === jewelAddr) jewelBalance = reserves.reserve0;
      if (reserves.token1 === jewelAddr) jewelBalance = reserves.reserve1;
      if (reserves.token0 === crystalAddr) crystalBalance = reserves.reserve0;
      if (reserves.token1 === crystalAddr) crystalBalance = reserves.reserve1;

      const jewelValueUSD = jewelBalance * jewelPrice;
      const crystalValueUSD = crystalBalance * crystalPrice;

      return {
        name,
        address,
        jewelBalance,
        crystalBalance,
        jewelValueUSD,
        crystalValueUSD,
        totalValueUSD: jewelValueUSD + crystalValueUSD,
      };
    })
  );

  categories.push({
    category: 'LP Pools',
    contracts: lpPoolContracts,
    totalJewel: lpPoolContracts.reduce((sum, c) => sum + c.jewelBalance, 0),
    totalCrystal: lpPoolContracts.reduce((sum, c) => sum + c.crystalBalance, 0),
    totalValueUSD: lpPoolContracts.reduce((sum, c) => sum + c.totalValueUSD, 0),
  });

  const [cJewelSupply, xCrystalSupply] = await Promise.all([
    getStakedTokenSupply(provider, TOKENS.cJEWEL),
    getStakedTokenSupply(provider, TOKENS.xCRYSTAL),
  ]);

  const stakingContracts = [
    {
      name: 'cJEWEL (Locked JEWEL)',
      address: TOKENS.cJEWEL,
      jewelBalance: cJewelSupply,
      crystalBalance: 0,
      jewelValueUSD: cJewelSupply * jewelPrice,
      crystalValueUSD: 0,
      totalValueUSD: cJewelSupply * jewelPrice,
    },
    {
      name: 'xCRYSTAL (Locked CRYSTAL)',
      address: TOKENS.xCRYSTAL,
      jewelBalance: 0,
      crystalBalance: xCrystalSupply,
      jewelValueUSD: 0,
      crystalValueUSD: xCrystalSupply * crystalPrice,
      totalValueUSD: xCrystalSupply * crystalPrice,
    },
  ];

  categories.push({
    category: 'Staking/Governance',
    contracts: stakingContracts,
    totalJewel: stakingContracts.reduce((sum, c) => sum + c.jewelBalance, 0),
    totalCrystal: stakingContracts.reduce((sum, c) => sum + c.crystalBalance, 0),
    totalValueUSD: stakingContracts.reduce((sum, c) => sum + c.totalValueUSD, 0),
  });

  const bridgeContracts = await Promise.all(
    Object.entries(BRIDGE_CONTRACTS).map(async ([name, address]) => {
      const [jewelBalance, crystalBalance] = await Promise.all([
        getTokenBalance(provider, TOKENS.JEWEL, address),
        getTokenBalance(provider, TOKENS.CRYSTAL, address),
      ]);

      return {
        name,
        address,
        jewelBalance,
        crystalBalance,
        jewelValueUSD: jewelBalance * jewelPrice,
        crystalValueUSD: crystalBalance * crystalPrice,
        totalValueUSD: jewelBalance * jewelPrice + crystalBalance * crystalPrice,
      };
    })
  );

  categories.push({
    category: 'Bridge Contracts',
    contracts: bridgeContracts,
    totalJewel: bridgeContracts.reduce((sum, c) => sum + c.jewelBalance, 0),
    totalCrystal: bridgeContracts.reduce((sum, c) => sum + c.crystalBalance, 0),
    totalValueUSD: bridgeContracts.reduce((sum, c) => sum + c.totalValueUSD, 0),
  });

  const systemContracts = await Promise.all(
    Object.entries(SYSTEM_CONTRACTS).map(async ([name, address]) => {
      const [jewelBalance, crystalBalance] = await Promise.all([
        getTokenBalance(provider, TOKENS.JEWEL, address),
        getTokenBalance(provider, TOKENS.CRYSTAL, address),
      ]);

      return {
        name,
        address,
        jewelBalance,
        crystalBalance,
        jewelValueUSD: jewelBalance * jewelPrice,
        crystalValueUSD: crystalBalance * crystalPrice,
        totalValueUSD: jewelBalance * jewelPrice + crystalBalance * crystalPrice,
      };
    })
  );

  categories.push({
    category: 'System Contracts',
    contracts: systemContracts,
    totalJewel: systemContracts.reduce((sum, c) => sum + c.jewelBalance, 0),
    totalCrystal: systemContracts.reduce((sum, c) => sum + c.crystalBalance, 0),
    totalValueUSD: systemContracts.reduce((sum, c) => sum + c.totalValueUSD, 0),
  });

  const lpCat = categories.find(c => c.category === 'LP Pools');
  const stakingCat = categories.find(c => c.category === 'Staking/Governance');
  const bridgeCat = categories.find(c => c.category === 'Bridge Contracts');
  const systemCat = categories.find(c => c.category === 'System Contracts');

  return {
    timestamp: new Date().toISOString(),
    prices: {
      jewel: jewelPrice,
      crystal: crystalPrice,
      jewelSource: jewelPriceResult.source,
      crystalSource: crystalPriceResult.source,
    },
    categories,
    summary: {
      totalJewelLocked: categories.reduce((sum, c) => sum + c.totalJewel, 0),
      totalCrystalLocked: categories.reduce((sum, c) => sum + c.totalCrystal, 0),
      totalValueUSD: categories.reduce((sum, c) => sum + c.totalValueUSD, 0),
      lpPoolsValue: lpCat?.totalValueUSD || 0,
      stakingValue: stakingCat?.totalValueUSD || 0,
      bridgeValue: bridgeCat?.totalValueUSD || 0,
      systemValue: systemCat?.totalValueUSD || 0,
    },
  };
}

export function formatValueBreakdown(data: ValueBreakdownResult): string {
  const lines: string[] = [];
  lines.push(`=== DFK Chain Value Breakdown ===`);
  lines.push(`Timestamp: ${data.timestamp}`);
  lines.push(`Prices: JEWEL $${data.prices.jewel.toFixed(4)} (${data.prices.jewelSource}) | CRYSTAL $${data.prices.crystal.toFixed(4)} (${data.prices.crystalSource})`);
  lines.push('');

  for (const category of data.categories) {
    lines.push(`--- ${category.category} ---`);
    for (const contract of category.contracts) {
      lines.push(`  ${contract.name}:`);
      if (contract.jewelBalance > 0) {
        lines.push(`    JEWEL: ${contract.jewelBalance.toLocaleString()} ($${contract.jewelValueUSD.toLocaleString()})`);
      }
      if (contract.crystalBalance > 0) {
        lines.push(`    CRYSTAL: ${contract.crystalBalance.toLocaleString()} ($${contract.crystalValueUSD.toLocaleString()})`);
      }
      lines.push(`    Total: $${contract.totalValueUSD.toLocaleString()}`);
    }
    lines.push(`  Category Total: $${category.totalValueUSD.toLocaleString()}`);
    lines.push('');
  }

  lines.push('=== SUMMARY ===');
  lines.push(`Total JEWEL Locked: ${data.summary.totalJewelLocked.toLocaleString()}`);
  lines.push(`Total CRYSTAL Locked: ${data.summary.totalCrystalLocked.toLocaleString()}`);
  lines.push(`Total Value: $${data.summary.totalValueUSD.toLocaleString()}`);
  lines.push('');
  lines.push(`LP Pools: $${data.summary.lpPoolsValue.toLocaleString()}`);
  lines.push(`Staking: $${data.summary.stakingValue.toLocaleString()}`);
  lines.push(`Bridges: $${data.summary.bridgeValue.toLocaleString()}`);
  lines.push(`System: $${data.summary.systemValue.toLocaleString()}`);

  return lines.join('\n');
}
