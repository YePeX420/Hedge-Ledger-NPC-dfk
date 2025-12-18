import { ethers } from 'ethers';
import { getTokenMetadataMap } from '../services/tokenRegistryService.js';
import { getCachedPool } from '../../pool-cache.js';

const DFK_CHAIN_RPC = 'https://subnets.avax.network/defi-kingdoms/dfk-chain/rpc';

const TOKENS = {
  JEWEL: '0xCCb93dABD71c8Dad03Fc4CE5559dC3D89F67a260',
  CRYSTAL: '0x04b9dA42306B023f3572e106B11D82aAd9D32EBb',
  cJEWEL: '0x9ed2c155632C042CB8bC20634571fF1CA26f5742',
  xCRYSTAL: '0x6e7185872bcdf3f7a6cbbe81356e50daffb002d2',
  xJEWEL: '0x77f2656d04E158f915bC22f07B779D94c1DC47Ff',
  AVAX: '0xB57B60DeBDB0b8172bb6316a9164bd3C695F133a',
  USDC: '0x3AD9DFE640E1A9Cc1D9B0948620820D975c3803a',
  ETH: '0xfBDF0E31808d0aa7b9509AA6aBC9754E48C58852',
  BTC_B: '0x7516EB8B8Edfa420f540a162335eACF3ea05a247',
  KLAY: '0x97855Ba65aa7ed2F65Ed832a776537268158B78a',
};

const TOKEN_DECIMALS: Record<string, number> = {
  [TOKENS.JEWEL.toLowerCase()]: 18,
  [TOKENS.CRYSTAL.toLowerCase()]: 18,
  [TOKENS.xJEWEL.toLowerCase()]: 18,
  [TOKENS.AVAX.toLowerCase()]: 18,
  [TOKENS.USDC.toLowerCase()]: 6,
  [TOKENS.ETH.toLowerCase()]: 18,
  [TOKENS.BTC_B.toLowerCase()]: 8,
  [TOKENS.KLAY.toLowerCase()]: 18,
};

const TOKEN_NAMES: Record<string, string> = {
  [TOKENS.JEWEL.toLowerCase()]: 'JEWEL',
  [TOKENS.CRYSTAL.toLowerCase()]: 'CRYSTAL',
  [TOKENS.xJEWEL.toLowerCase()]: 'xJEWEL',
  [TOKENS.AVAX.toLowerCase()]: 'AVAX',
  [TOKENS.USDC.toLowerCase()]: 'USDC',
  [TOKENS.ETH.toLowerCase()]: 'ETH',
  [TOKENS.BTC_B.toLowerCase()]: 'BTC.b',
  [TOKENS.KLAY.toLowerCase()]: 'KLAY',
};

const MASTER_GARDENER_V2 = '0xB04e8D6aED037904B77A9F0b08002592925833b7';

interface LpPoolConfig {
  address: string;
  pid: number;
}

const LP_POOLS: Record<string, LpPoolConfig> = {
  'wJEWEL-xJEWEL': { address: '0x6AC38A4C112F125eac0eBDbaDBed0BC8F4575d0d', pid: 0 },
  'CRYSTAL-AVAX': { address: '0x9f378F48d0c1328fd0C80d7Ae544C6CadB5Ba99E', pid: 1 },
  'CRYSTAL-wJEWEL': { address: '0x48658E69D741024b4686C8f7b236D3F1D291f386', pid: 2 },
  'CRYSTAL-USDC': { address: '0x04Dec678825b8DfD2D0d9bD83B538bE3fbDA2926', pid: 3 },
  'ETH-USDC': { address: '0x7d4daa9eB74264b082A92F3f559ff167224484aC', pid: 4 },
  'wJEWEL-USDC': { address: '0xCF329b34049033dE26e4449aeBCb41f1992724D3', pid: 5 },
  'CRYSTAL-ETH': { address: '0x78C893E262e2681Dbd6B6eBA6CCA2AaD45de19AD', pid: 6 },
  'CRYSTAL-BTC.b': { address: '0x00BD81c9bAc29a3b6aea7ABc92d2C9a3366Bb4dD', pid: 7 },
  'CRYSTAL-KLAY': { address: '0xaFC1fBc3F3fB517EB54Bb2472051A6f0b2105320', pid: 8 },
  'wJEWEL-KLAY': { address: '0x561091E2385C90d41b4c0dAef651A4b33E1a5CfE', pid: 9 },
  'wJEWEL-AVAX': { address: '0xF3EabeD6Bd905e0FcD68FC3dBCd6e3A4aEE55E98', pid: 10 },
  'wJEWEL-BTC.b': { address: '0xfAa8507e822397bd56eFD4480Fb12ADC41ff940B', pid: 11 },
  'wJEWEL-ETH': { address: '0x79724B6996502afc773feB3Ff8Bb3C23ADf2854B', pid: 12 },
  'BTC.b-USDC': { address: '0x59D642B471dd54207Cb1CDe2e7507b0Ce1b1a6a5', pid: 13 },
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

const MASTER_GARDENER_ABI = [
  'function getPoolInfo(uint256 _pid) view returns (tuple(address lpToken, uint256 allocPoint, uint256 lastRewardBlock, uint256 accRewardPerShare, uint256 totalStaked) _poolInfo)',
  'function poolInfo(uint256 _pid) view returns (tuple(address lpToken, uint256 allocPoint, uint256 lastRewardBlock, uint256 accRewardPerShare) _poolInfoLegacy)',
  'function getPoolLength() view returns (uint256 _poolLength)',
];

interface TokenBalance {
  address: string;
  balance: string;
  balanceFormatted: number;
}

interface LpPoolContract {
  name: string;
  address: string;
  pid: number;
  token0Symbol: string;
  token1Symbol: string;
  token0Balance: number;
  token1Balance: number;
  token0ValueUSD: number;
  token1ValueUSD: number;
  totalValueUSD: number;
  v2StakedLP: number;
  v1StakedLP: number;
  totalStakedLP: number;
  totalLPSupply: number;
  stakedRatio: number;
  v2ValueUSD: number;
  v1ValueUSD: number;
  passive24hAPR?: number;
}

interface StandardContract {
  name: string;
  address: string;
  jewelBalance: number;
  crystalBalance: number;
  jewelValueUSD: number;
  crystalValueUSD: number;
  totalValueUSD: number;
}

interface LpPoolsCategory {
  category: 'LP Pools';
  contracts: LpPoolContract[];
  totalValueUSD: number;
}

interface StandardCategory {
  category: string;
  contracts: StandardContract[];
  totalJewel: number;
  totalCrystal: number;
  totalValueUSD: number;
}

type CategoryBreakdown = LpPoolsCategory | StandardCategory;

interface TokenPrice {
  symbol: string;
  price: number;
  source: 'defillama' | 'coingecko' | 'fallback';
}

interface ValueBreakdownResult {
  timestamp: string;
  prices: {
    jewel: number;
    crystal: number;
    jewelSource: 'defillama' | 'coingecko' | 'fallback';
    crystalSource: 'defillama' | 'coingecko' | 'fallback';
  };
  tokenPrices: TokenPrice[];
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

const priceCache: Record<string, PriceResult> = {};
const CACHE_TTL_MS = 60000;

const COINGECKO_IDS: Record<string, string> = {
  'JEWEL': 'defi-kingdoms',
  'CRYSTAL': 'defi-kingdoms-crystal',
  'AVAX': 'avalanche-2',
  'ETH': 'ethereum',
  'BTC.b': 'bitcoin',
  'USDC': 'usd-coin',
  'KLAY': 'klay-token',
  'xJEWEL': 'defi-kingdoms',
};

const FALLBACK_PRICES: Record<string, number> = {
  'JEWEL': 0.0165,
  'CRYSTAL': 0.0044,
  'xJEWEL': 0.0165,
  'AVAX': 45.0,
  'ETH': 3900.0,
  'BTC.b': 100000.0,
  'USDC': 1.0,
  'KLAY': 0.15,
};

async function fetchAllDefiLlamaPrices(): Promise<Record<string, number>> {
  try {
    const tokenAddresses = [
      `dfk:${TOKENS.JEWEL}`,
      `dfk:${TOKENS.CRYSTAL}`,
      `avax:${TOKENS.AVAX}`,
      `dfk:${TOKENS.ETH}`,
      `dfk:${TOKENS.BTC_B}`,
      `dfk:${TOKENS.USDC}`,
      `dfk:${TOKENS.KLAY}`,
    ];
    
    const response = await fetch(
      `https://coins.llama.fi/prices/current/${tokenAddresses.join(',')}`,
      { signal: AbortSignal.timeout(10000) }
    );
    
    if (!response.ok) {
      console.log('[ValueBreakdown] DefiLlama API returned status:', response.status);
      return {};
    }
    
    const data = await response.json();
    const prices: Record<string, number> = {};
    
    for (const [key, value] of Object.entries(data.coins || {})) {
      const price = (value as any)?.price;
      if (price) {
        const addr = key.split(':')[1]?.toLowerCase();
        if (addr) prices[addr] = price;
      }
    }
    
    console.log('[ValueBreakdown] DefiLlama prices fetched:', Object.keys(prices).length, 'tokens');
    return prices;
  } catch (err) {
    console.log('[ValueBreakdown] DefiLlama fetch failed:', err);
    return {};
  }
}

async function fetchCoinGeckoPrices(symbols: string[]): Promise<Record<string, number>> {
  try {
    const ids = symbols.map(s => COINGECKO_IDS[s]).filter(Boolean);
    if (ids.length === 0) return {};
    
    const response = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=usd`,
      { signal: AbortSignal.timeout(10000) }
    );
    
    if (!response.ok) return {};
    
    const data = await response.json();
    const prices: Record<string, number> = {};
    
    for (const symbol of symbols) {
      const geckoId = COINGECKO_IDS[symbol];
      if (geckoId && data[geckoId]?.usd) {
        prices[symbol] = data[geckoId].usd;
      }
    }
    
    return prices;
  } catch {
    return {};
  }
}

let cachedAllPrices: { prices: Record<string, number>; timestamp: number } | null = null;

async function getAllTokenPrices(): Promise<Record<string, number>> {
  if (cachedAllPrices && Date.now() - cachedAllPrices.timestamp < CACHE_TTL_MS) {
    return cachedAllPrices.prices;
  }
  
  const llamaPrices = await fetchAllDefiLlamaPrices();
  
  const addressToSymbol: Record<string, string> = {};
  for (const [name, addr] of Object.entries(TOKENS)) {
    const symbol = name === 'BTC_B' ? 'BTC.b' : name;
    addressToSymbol[addr.toLowerCase()] = symbol;
  }
  
  const prices: Record<string, number> = {};
  for (const [addr, price] of Object.entries(llamaPrices)) {
    const symbol = addressToSymbol[addr];
    if (symbol) prices[symbol] = price;
  }
  
  const missingSymbols = Object.keys(FALLBACK_PRICES).filter(s => !prices[s]);
  if (missingSymbols.length > 0) {
    const geckoPrices = await fetchCoinGeckoPrices(missingSymbols);
    for (const [symbol, price] of Object.entries(geckoPrices)) {
      if (!prices[symbol]) prices[symbol] = price;
    }
  }
  
  for (const [symbol, fallback] of Object.entries(FALLBACK_PRICES)) {
    if (!prices[symbol]) {
      prices[symbol] = fallback;
      console.warn(`[ValueBreakdown] Using fallback price for ${symbol}: $${fallback}`);
    }
  }
  
  cachedAllPrices = { prices, timestamp: Date.now() };
  console.log('[ValueBreakdown] Token prices:', prices);
  return prices;
}

function getTokenPriceFromMap(prices: Record<string, number>, tokenAddr: string): number {
  const symbol = TOKEN_NAMES[tokenAddr.toLowerCase()];
  if (symbol && prices[symbol]) return prices[symbol];
  if (tokenAddr.toLowerCase() === TOKENS.xJEWEL.toLowerCase()) {
    return prices['JEWEL'] || FALLBACK_PRICES['JEWEL'];
  }
  return 0;
}

async function getTokenPrice(token: 'JEWEL' | 'CRYSTAL'): Promise<PriceResult> {
  const prices = await getAllTokenPrices();
  const price = prices[token] || FALLBACK_PRICES[token];
  return { price, source: 'defillama', timestamp: Date.now() };
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
  lpAddress: string,
  tokenDecimalsMap: Record<string, number> = {}
): Promise<{ token0: string; token1: string; reserve0: number; reserve1: number }> {
  try {
    const contract = new ethers.Contract(lpAddress, LP_ABI, provider);
    const [reserves, token0, token1] = await Promise.all([
      contract.getReserves(),
      contract.token0(),
      contract.token1(),
    ]);
    
    const token0Lower = token0.toLowerCase();
    const token1Lower = token1.toLowerCase();
    const decimals0 = tokenDecimalsMap[token0Lower] ?? TOKEN_DECIMALS[token0Lower] ?? 18;
    const decimals1 = tokenDecimalsMap[token1Lower] ?? TOKEN_DECIMALS[token1Lower] ?? 18;
    
    return {
      token0: token0Lower,
      token1: token1Lower,
      reserve0: parseFloat(ethers.formatUnits(reserves[0], decimals0)),
      reserve1: parseFloat(ethers.formatUnits(reserves[1], decimals1)),
    };
  } catch (err) {
    console.error(`[LPReserves] Error for ${lpAddress}:`, (err as Error).message);
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

interface StakedLPInfo {
  v2Staked: number;
  v1Staked: number;
  totalSupply: number;
}

async function getStakedLPAmounts(
  provider: ethers.JsonRpcProvider,
  pid: number,
  lpAddress: string
): Promise<StakedLPInfo> {
  try {
    const gardenerContract = new ethers.Contract(MASTER_GARDENER_V2, MASTER_GARDENER_ABI, provider);
    const lpContract = new ethers.Contract(lpAddress, LP_ABI, provider);
    
    const [v2PoolInfo, totalSupply] = await Promise.all([
      gardenerContract.getPoolInfo(pid).catch((err: Error) => {
        console.error(`[StakedLP] getPoolInfo(${pid}) failed:`, err.message);
        return null;
      }),
      lpContract.totalSupply().catch((err: Error) => {
        console.error(`[StakedLP] totalSupply failed for ${lpAddress}:`, err.message);
        return BigInt(0);
      }),
    ]);
    
    const v2Staked = v2PoolInfo && v2PoolInfo.totalStaked 
      ? parseFloat(ethers.formatEther(v2PoolInfo.totalStaked))
      : 0;
    
    let v1Staked = 0;
    try {
      const legacyGardenerBalance = await lpContract.balanceOf('0x57dec9cc7f492d6583c773e2e7ad66dcdc6940fb');
      v1Staked = parseFloat(ethers.formatEther(legacyGardenerBalance));
    } catch (err) {
      console.error(`[StakedLP] V1 balance check failed:`, (err as Error).message);
      v1Staked = 0;
    }
    
    return {
      v2Staked,
      v1Staked,
      totalSupply: parseFloat(ethers.formatEther(totalSupply)),
    };
  } catch (err) {
    console.error(`[StakedLP] Error for PID ${pid}:`, (err as Error).message);
    return { v2Staked: 0, v1Staked: 0, totalSupply: 0 };
  }
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function getValueBreakdown(): Promise<ValueBreakdownResult> {
  const provider = new ethers.JsonRpcProvider(DFK_CHAIN_RPC);
  
  const [allPrices, tokenMetadataMap] = await Promise.all([
    getAllTokenPrices(),
    getTokenMetadataMap().catch(() => ({} as Record<string, { symbol: string; decimals: number }>)),
  ]);
  
  const tokenNamesFromRegistry = Object.fromEntries(
    Object.entries(tokenMetadataMap).map(([address, metadata]) => [address, metadata.symbol])
  );
  const tokenDecimalsMap = Object.fromEntries(
    Object.entries(tokenMetadataMap).map(([address, metadata]) => [address, metadata.decimals])
  );
  
  const tokenNames = { ...TOKEN_NAMES, ...tokenNamesFromRegistry };
  
  const jewelPrice = allPrices['JEWEL'] || FALLBACK_PRICES['JEWEL'];
  const crystalPrice = allPrices['CRYSTAL'] || FALLBACK_PRICES['CRYSTAL'];

  const categories: CategoryBreakdown[] = [];

  const lpPoolContracts: LpPoolContract[] = [];
  
  for (const [name, config] of Object.entries(LP_POOLS)) {
      const { address, pid } = config;
      
      await delay(100);
      
      const [reserves, stakingInfo] = await Promise.all([
        getLPReserves(provider, address, tokenDecimalsMap),
        getStakedLPAmounts(provider, pid, address),
      ]);
      
      const token0Symbol = tokenNames[reserves.token0] || 'Unknown';
      const token1Symbol = tokenNames[reserves.token1] || 'Unknown';
      
      const token0Price = getTokenPriceFromMap(allPrices, reserves.token0);
      const token1Price = getTokenPriceFromMap(allPrices, reserves.token1);
      
      const totalPoolReserveValue = reserves.reserve0 * token0Price + reserves.reserve1 * token1Price;
      
      const totalStakedLP = stakingInfo.v2Staked + stakingInfo.v1Staked;
      const stakedRatio = stakingInfo.totalSupply > 0 ? totalStakedLP / stakingInfo.totalSupply : 0;
      
      const stakedToken0 = reserves.reserve0 * stakedRatio;
      const stakedToken1 = reserves.reserve1 * stakedRatio;
      const token0ValueUSD = stakedToken0 * token0Price;
      const token1ValueUSD = stakedToken1 * token1Price;
      const totalValueUSD = token0ValueUSD + token1ValueUSD;
      
      const v2Ratio = stakingInfo.totalSupply > 0 ? stakingInfo.v2Staked / stakingInfo.totalSupply : 0;
      const v1Ratio = stakingInfo.totalSupply > 0 ? stakingInfo.v1Staked / stakingInfo.totalSupply : 0;
      const v2ValueUSD = totalPoolReserveValue * v2Ratio;
      const v1ValueUSD = totalPoolReserveValue * v1Ratio;

      let passive24hAPR: number | undefined;
      try {
        const cachedPool = getCachedPool(pid);
        if (cachedPool) {
          const feeAPR = parseFloat((cachedPool.fee24hAPR || '0%').replace('%', '')) || 0;
          const harvestAPR = parseFloat((cachedPool.harvesting24hAPR || '0%').replace('%', '')) || 0;
          passive24hAPR = feeAPR + harvestAPR;
        }
      } catch (err) {
        console.warn(`[ValueBreakdown] Could not get cached pool APR for pid ${pid}:`, err);
      }

      lpPoolContracts.push({
        name,
        address,
        pid,
        token0Symbol,
        token1Symbol,
        token0Balance: stakedToken0,
        token1Balance: stakedToken1,
        token0ValueUSD,
        token1ValueUSD,
        totalValueUSD,
        v2StakedLP: stakingInfo.v2Staked,
        v1StakedLP: stakingInfo.v1Staked,
        totalStakedLP,
        totalLPSupply: stakingInfo.totalSupply,
        stakedRatio,
        v2ValueUSD,
        v1ValueUSD,
        passive24hAPR,
      });
  }

  categories.push({
    category: 'LP Pools',
    contracts: lpPoolContracts,
    totalValueUSD: lpPoolContracts.reduce((sum, c) => sum + c.totalValueUSD, 0),
  } as LpPoolsCategory);

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

  const lpCat = categories.find(c => c.category === 'LP Pools') as LpPoolsCategory | undefined;
  const stakingCat = categories.find(c => c.category === 'Staking/Governance') as StandardCategory | undefined;
  const bridgeCat = categories.find(c => c.category === 'Bridge Contracts') as StandardCategory | undefined;
  const systemCat = categories.find(c => c.category === 'System Contracts') as StandardCategory | undefined;

  const standardCats = [stakingCat, bridgeCat, systemCat].filter(Boolean) as StandardCategory[];
  const totalJewelLocked = standardCats.reduce((sum, c) => sum + c.totalJewel, 0);
  const totalCrystalLocked = standardCats.reduce((sum, c) => sum + c.totalCrystal, 0);

  const tokenPricesList: TokenPrice[] = [
    { symbol: 'JEWEL', price: allPrices['JEWEL'] || 0, source: 'defillama' },
    { symbol: 'CRYSTAL', price: allPrices['CRYSTAL'] || 0, source: 'defillama' },
    { symbol: 'xJEWEL', price: allPrices['xJEWEL'] || allPrices['JEWEL'] || 0, source: 'defillama' },
    { symbol: 'AVAX', price: allPrices['AVAX'] || 0, source: 'defillama' },
    { symbol: 'ETH', price: allPrices['ETH'] || 0, source: 'defillama' },
    { symbol: 'BTC.b', price: allPrices['BTC.b'] || 0, source: 'defillama' },
    { symbol: 'USDC', price: allPrices['USDC'] || 1.0, source: 'defillama' },
    { symbol: 'KLAY', price: allPrices['KLAY'] || 0, source: 'defillama' },
  ];

  return {
    timestamp: new Date().toISOString(),
    prices: {
      jewel: jewelPrice,
      crystal: crystalPrice,
      jewelSource: 'defillama' as const,
      crystalSource: 'defillama' as const,
    },
    tokenPrices: tokenPricesList,
    categories,
    summary: {
      totalJewelLocked,
      totalCrystalLocked,
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
    
    if (category.category === 'LP Pools') {
      const lpCat = category as LpPoolsCategory;
      for (const contract of lpCat.contracts) {
        lines.push(`  ${contract.name}:`);
        lines.push(`    ${contract.token0Symbol}: ${contract.token0Balance.toLocaleString()} ($${contract.token0ValueUSD.toLocaleString()})`);
        lines.push(`    ${contract.token1Symbol}: ${contract.token1Balance.toLocaleString()} ($${contract.token1ValueUSD.toLocaleString()})`);
        lines.push(`    Total: $${contract.totalValueUSD.toLocaleString()}`);
      }
    } else {
      const stdCat = category as StandardCategory;
      for (const contract of stdCat.contracts) {
        lines.push(`  ${contract.name}:`);
        if (contract.jewelBalance > 0) {
          lines.push(`    JEWEL: ${contract.jewelBalance.toLocaleString()} ($${contract.jewelValueUSD.toLocaleString()})`);
        }
        if (contract.crystalBalance > 0) {
          lines.push(`    CRYSTAL: ${contract.crystalBalance.toLocaleString()} ($${contract.crystalValueUSD.toLocaleString()})`);
        }
        lines.push(`    Total: $${contract.totalValueUSD.toLocaleString()}`);
      }
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
