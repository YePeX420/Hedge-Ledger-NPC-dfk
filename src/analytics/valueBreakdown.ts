import { ethers } from 'ethers';
import { getTokenMetadataMap } from '../services/tokenRegistryService.js';
import { getCachedPool } from '../../pool-cache.js';

const DFK_CHAIN_RPC = 'https://subnets.avax.network/defi-kingdoms/dfk-chain/rpc';
const HARMONY_RPC = 'https://api.harmony.one';
const KAIA_RPC = 'https://public-en.node.kaia.io';
const METIS_RPC = 'https://andromeda.metis.io/?owner=1088';

// Multi-chain JEWEL token addresses
const JEWEL_TOKENS = {
  DFK_CHAIN: '0xCCb93dABD71c8Dad03Fc4CE5559dC3D89F67a260', // wJEWEL on DFK Chain
  HARMONY: '0x72Cb10C6bfA5624dD07Ef608027E366bd690048F', // JEWEL on Harmony
  KAIA: '0x30c103f8f5a3A732DFe2dCE1Cc9446f545527b43', // JEWEL on Kaia
  METIS: '0x17c09cfC96C865CF546d73f2dF01fb440cA8BAd5', // JEWEL on Metis
};

// Multi-chain bridge contracts holding JEWEL
const MULTI_CHAIN_BRIDGES = {
  HARMONY: {
    'Horizon Bridge (Harmony)': '0x7D12F97e7d7BDA05f6E90b9d27De1E28E33eDa4C',
    'Synapse Bridge (Harmony)': '0xAf41a65F786339e7911F4acDAD6BD49426F2Dc6b',
  },
  KAIA: {
    'DFK Bridge (Kaia)': '0x588F1f7A8d62F988eBC4F8d2e4c8e07a8B9F0468',
    'Synapse Bridge (Kaia)': '0xAf41a65F786339e7911F4acDAD6BD49426F2Dc6b',
  },
  METIS: {
    'Synapse Bridge (Metis)': '0x06Fea8513FF03a0d3f61324da709D4cf06F42A5c',
  },
};

// Harmony LP pools containing JEWEL (Serendale legacy)
const HARMONY_LP_POOLS = {
  'JEWEL-ONE': '0xeb579ddcd49a7beb3f205c9ff6006bb6390f138f',
};

// Wrapped ONE token on Harmony for identifying ONE side of LP
const WONE_ADDRESS = '0xcF664087a5bB0237a0BAd6742852ec6c8d69A27a';

// Known CEX hot wallets for JEWEL (on DFK Chain)
// These are identified exchange deposit/withdrawal wallets
const CEX_WALLETS: Record<string, string> = {
  'KuCoin Hot Wallet': '0x4C6D0E4f8F5e3C8D98A7C5F5C3fA2A6b0C0D3E4F', // Placeholder - needs verification
  // Note: Actual CEX wallet addresses need to be verified from on-chain analysis
  // Gate.io, MEXC, etc. wallet addresses can be added once confirmed
};

const TOKENS = {
  JEWEL: '0xCCb93dABD71c8Dad03Fc4CE5559dC3D89F67a260',
  CRYSTAL: '0x04b9dA42306B023f3572e106B11D82aAd9D32EBb',
  cJEWEL: '0x9ed2c155632C042CB8bC20634571fF1CA26f5742',
  xCRYSTAL: '0x6e7185872bcdf3f7a6cbbe81356e50daffb002d2',
  xJEWEL: '0x77f2656d04E158f915bC22f07B779D94c1DC47Ff',
  wJEWEL: '0xFe6B19286885a4f7F55aDaD09c3cd1f906D23296',
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
  [TOKENS.wJEWEL.toLowerCase()]: 18,
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
  [TOKENS.wJEWEL.toLowerCase()]: 'wJEWEL',
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
  'Quest Reward Fund': '0x1137643FE14b032966a59Acd68EBf3c1271Df316',
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
  totalJewel: number; // Total wJEWEL in LP pools (1:1 with JEWEL) - STAKED portion
  totalJewelFullReserves: number; // Full wJEWEL reserves in all LP pools (staked + unstaked)
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

interface CexExchangeLiquidity {
  exchange: string;
  pair: string;
  midPrice: number;
  bidDepthUSD: number;
  askDepthUSD: number;
  totalDepthUSD: number;
  spread: number;
  spreadPercent: number;
  depthBand: string;
  timestamp: string;
  error?: string;
}

interface CexLiquidityData {
  exchanges: CexExchangeLiquidity[];
  totalLiquidityUSD: number;
  averageSpread: number;
  depthBand: string;
  updatedAt: string;
}

// JEWEL supply metrics from DFK official API
interface JewelSupplyData {
  totalSupply: number;
  circulatingSupply: number;
  lockedSupply: number;
  burnedSupply: number;
  source: string;
  updatedAt: string;
}

// Burn tracking data
interface BurnData {
  totalBurned: number;
  burnAddresses: { address: string; balance: number }[];
  sources: string[];
}

// Multi-chain JEWEL balance tracking
interface ChainBalance {
  chain: string;
  chainId: string;
  rpc: string;
  tokenAddress: string;
  contracts: {
    name: string;
    address: string;
    jewelBalance: number;
  }[];
  totalJewel: number; // Bridge contract totals
  chainTotalSupply: number; // Total JEWEL supply on this chain (all holders)
  status: 'success' | 'error';
  error?: string;
}

// Comprehensive coverage breakdown for near-100% tracking
interface CoverageBreakdown {
  locked: {
    cJewel: number;
    systemContracts: number;
    bridgeContracts: number;
    total: number;
  };
  pooled: {
    lpReservesStaked: number; // wJEWEL in staked LP positions
    lpReservesUnstaked: number; // wJEWEL in unstaked LP positions  
    total: number;
  };
  multiChain: {
    harmonyTotal: number;
    kaiaTotal: number;
    metisTotal: number;
    total: number;
  };
  burned: {
    total: number;
    addresses: { address: string; balance: number }[];
  };
  liquid: {
    estimated: number; // Circulating - (locked + pooled + multiChain + burned)
  };
  totalTracked: number;
  circulatingSupply: number;
  coverageRatio: number;
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
  cexLiquidity?: CexLiquidityData;
  jewelSupply?: JewelSupplyData;
  burnData?: BurnData;
  multiChainBalances?: ChainBalance[];
  coverageBreakdown?: CoverageBreakdown;
  coverageKPI?: {
    trackedJewel: number;
    circulatingSupply: number;
    coverageRatio: number;
    unaccountedJewel: number;
    multiChainTotal?: number;
    lpPooledTotal?: number;
    lockedTotal?: number;
    burnedTotal?: number;
    liquidEstimate?: number;
  };
  summary: {
    totalJewelLocked: number;
    totalCrystalLocked: number;
    totalValueUSD: number;
    lpPoolsValue: number;
    stakingValue: number;
    bridgeValue: number;
    systemValue: number;
    cexLiquidityValue?: number;
    liquidTreasuryValue?: number;
    multiChainJewel?: number;
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
  'wJEWEL': 'defi-kingdoms',
};

const FALLBACK_PRICES: Record<string, number> = {
  'JEWEL': 0.0165,
  'CRYSTAL': 0.0044,
  'xJEWEL': 0.0165,
  'wJEWEL': 0.0165,
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
      `dfk:${TOKENS.wJEWEL}`,
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

  if (prices['JEWEL'] && !prices['wJEWEL']) {
    prices['wJEWEL'] = prices['JEWEL'];
  }
  if (prices['JEWEL'] && !prices['xJEWEL']) {
    prices['xJEWEL'] = prices['JEWEL'];
  }
  
  cachedAllPrices = { prices, timestamp: Date.now() };
  console.log('[ValueBreakdown] Token prices:', prices);
  return prices;
}

function getTokenPriceFromMap(prices: Record<string, number>, tokenAddr: string): number {
  const symbol = TOKEN_NAMES[tokenAddr.toLowerCase()];
  if (symbol && prices[symbol]) return prices[symbol];
  if (tokenAddr.toLowerCase() === TOKENS.xJEWEL.toLowerCase() || tokenAddr.toLowerCase() === TOKENS.wJEWEL.toLowerCase()) {
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
  holderAddress: string,
  tokenName?: string
): Promise<number> {
  try {
    const normalizedToken = ethers.getAddress(tokenAddress.toLowerCase());
    const normalizedHolder = ethers.getAddress(holderAddress.toLowerCase());
    const contract = new ethers.Contract(normalizedToken, ERC20_ABI, provider);
    const balance = await contract.balanceOf(normalizedHolder);
    const parsed = parseFloat(ethers.formatEther(balance));
    return parsed;
  } catch (err) {
    const tokenLabel = tokenName || tokenAddress.slice(0, 10);
    console.error(`[ValueBreakdown] getTokenBalance FAILED for ${tokenLabel} at holder ${holderAddress.slice(0, 10)}...: ${(err as Error).message}`);
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

// Fetch JEWEL balances from contracts on a specific chain AND total supply
async function getChainJewelBalances(
  chainName: string,
  chainId: string,
  rpcUrl: string,
  jewelTokenAddress: string,
  bridgeContracts: Record<string, string>
): Promise<ChainBalance> {
  // Normalize the JEWEL token address to proper checksum format
  const normalizedJewelAddress = ethers.getAddress(jewelTokenAddress.toLowerCase());
  
  const result: ChainBalance = {
    chain: chainName,
    chainId,
    rpc: rpcUrl,
    tokenAddress: normalizedJewelAddress,
    contracts: [],
    totalJewel: 0,
    chainTotalSupply: 0,
    status: 'success',
  };

  try {
    const provider = new ethers.JsonRpcProvider(rpcUrl, undefined, {
      staticNetwork: true,
    });
    
    const timeout = 10000; // 10 seconds
    
    // First, get the total supply of JEWEL on this chain
    try {
      const contract = new ethers.Contract(normalizedJewelAddress, ERC20_ABI, provider);
      const supplyPromise = contract.totalSupply();
      const totalSupply = await Promise.race([
        supplyPromise,
        new Promise<bigint>((_, reject) => 
          setTimeout(() => reject(new Error('Timeout')), timeout)
        )
      ]);
      result.chainTotalSupply = parseFloat(ethers.formatEther(totalSupply));
      console.log(`[MultiChain] ${chainName} total JEWEL supply: ${result.chainTotalSupply.toLocaleString()}`);
    } catch (err) {
      console.warn(`[MultiChain] Failed to get total supply on ${chainName}: ${(err as Error).message}`);
    }
    
    // Then get individual bridge contract balances
    for (const [name, rawAddress] of Object.entries(bridgeContracts)) {
      try {
        // Normalize bridge address to proper checksum format
        const address = ethers.getAddress(rawAddress.toLowerCase());
        const contract = new ethers.Contract(normalizedJewelAddress, ERC20_ABI, provider);
        const balancePromise = contract.balanceOf(address);
        const balance = await Promise.race([
          balancePromise,
          new Promise<bigint>((_, reject) => 
            setTimeout(() => reject(new Error('Timeout')), timeout)
          )
        ]);
        const jewelBalance = parseFloat(ethers.formatEther(balance));
        
        if (jewelBalance > 0) {
          result.contracts.push({ name, address, jewelBalance });
          result.totalJewel += jewelBalance;
          console.log(`[MultiChain] ${chainName} - ${name}: ${jewelBalance.toFixed(2)} JEWEL`);
        }
      } catch (err) {
        console.warn(`[MultiChain] Failed to get balance for ${name} on ${chainName}: ${(err as Error).message}`);
      }
      
      await delay(100); // Rate limiting
    }
  } catch (err) {
    result.status = 'error';
    result.error = (err as Error).message;
    console.error(`[MultiChain] Failed to connect to ${chainName}: ${(err as Error).message}`);
  }

  return result;
}

// Fetch JEWEL reserves from Harmony LP pools (Serendale legacy)
interface HarmonyLPReserves {
  poolName: string;
  lpAddress: string;
  jewelReserves: number;
  oneReserves: number;
  status: 'success' | 'error';
  error?: string;
}

async function getHarmonyLPReserves(): Promise<HarmonyLPReserves[]> {
  const results: HarmonyLPReserves[] = [];
  
  try {
    const provider = new ethers.JsonRpcProvider(HARMONY_RPC, undefined, {
      staticNetwork: true,
    });
    
    const timeout = 10000;
    const jewelTokenLower = JEWEL_TOKENS.HARMONY.toLowerCase();
    
    for (const [poolName, lpAddress] of Object.entries(HARMONY_LP_POOLS)) {
      try {
        const lpContract = new ethers.Contract(lpAddress, LP_ABI, provider);
        
        const [reserves, token0, token1] = await Promise.all([
          Promise.race([
            lpContract.getReserves(),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Timeout')), timeout))
          ]),
          lpContract.token0().catch(() => ''),
          lpContract.token1().catch(() => ''),
        ]);
        
        const token0Lower = token0.toString().toLowerCase();
        const token1Lower = token1.toString().toLowerCase();
        
        let jewelReserves = 0;
        let oneReserves = 0;
        
        if (token0Lower === jewelTokenLower) {
          jewelReserves = parseFloat(ethers.formatEther(reserves[0]));
          oneReserves = parseFloat(ethers.formatEther(reserves[1]));
        } else if (token1Lower === jewelTokenLower) {
          jewelReserves = parseFloat(ethers.formatEther(reserves[1]));
          oneReserves = parseFloat(ethers.formatEther(reserves[0]));
        }
        
        results.push({
          poolName,
          lpAddress,
          jewelReserves,
          oneReserves,
          status: 'success',
        });
        
        console.log(`[HarmonyLP] ${poolName}: ${jewelReserves.toLocaleString()} JEWEL, ${oneReserves.toLocaleString()} ONE`);
      } catch (err) {
        console.warn(`[HarmonyLP] Failed to get reserves for ${poolName}: ${(err as Error).message}`);
        results.push({
          poolName,
          lpAddress,
          jewelReserves: 0,
          oneReserves: 0,
          status: 'error',
          error: (err as Error).message,
        });
      }
    }
  } catch (err) {
    console.error(`[HarmonyLP] Failed to connect to Harmony: ${(err as Error).message}`);
  }
  
  return results;
}

// Fetch JEWEL balances across all chains
async function getMultiChainJewelBalances(): Promise<ChainBalance[]> {
  const results: ChainBalance[] = [];

  // Fetch from each chain in parallel (with error handling per chain)
  const chainPromises = [
    getChainJewelBalances('Harmony', '1666600000', HARMONY_RPC, JEWEL_TOKENS.HARMONY, MULTI_CHAIN_BRIDGES.HARMONY),
    getChainJewelBalances('Kaia', '8217', KAIA_RPC, JEWEL_TOKENS.KAIA, MULTI_CHAIN_BRIDGES.KAIA),
    getChainJewelBalances('Metis', '1088', METIS_RPC, JEWEL_TOKENS.METIS, MULTI_CHAIN_BRIDGES.METIS),
  ];

  const chainResults = await Promise.allSettled(chainPromises);
  
  for (const result of chainResults) {
    if (result.status === 'fulfilled') {
      results.push(result.value);
    }
  }

  const totalMultiChain = results.reduce((sum, r) => sum + r.totalJewel, 0);
  console.log(`[MultiChain] Total JEWEL across chains: ${totalMultiChain.toFixed(2)}`);

  return results;
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

// Common burn addresses where JEWEL is permanently destroyed
const BURN_ADDRESSES = [
  '0x0000000000000000000000000000000000000000', // Zero address
  '0x000000000000000000000000000000000000dEaD', // Common dead address
  '0x0000000000000000000000000000000000000001', // EIP-1559 burn
];

// Fetch JEWEL supply data from DFK official API
async function fetchJewelSupply(): Promise<JewelSupplyData | null> {
  try {
    const [totalRes, circRes] = await Promise.all([
      fetch('https://supply.defikingdoms.com/jewel/totalsupply', { 
        signal: AbortSignal.timeout(10000) 
      }),
      fetch('https://supply.defikingdoms.com/jewel/circulatingsupply', { 
        signal: AbortSignal.timeout(10000) 
      }),
    ]);
    
    if (!totalRes.ok || !circRes.ok) {
      console.warn('[ValueBreakdown] DFK supply API returned error');
      return null;
    }
    
    const totalText = await totalRes.text();
    const circText = await circRes.text();
    
    const totalSupply = parseFloat(totalText);
    const circulatingSupply = parseFloat(circText);
    
    if (isNaN(totalSupply) || isNaN(circulatingSupply)) {
      console.warn('[ValueBreakdown] Invalid supply values from DFK API');
      return null;
    }
    
    const lockedSupply = totalSupply - circulatingSupply;
    
    console.log(`[ValueBreakdown] JEWEL Supply: Total=${totalSupply.toLocaleString()}, Circulating=${circulatingSupply.toLocaleString()}, Locked=${lockedSupply.toLocaleString()}`);
    
    return {
      totalSupply,
      circulatingSupply,
      lockedSupply,
      burnedSupply: 0, // Will be calculated separately from burn addresses
      source: 'supply.defikingdoms.com',
      updatedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.error('[ValueBreakdown] Failed to fetch JEWEL supply:', err);
    return null;
  }
}

// Fetch burned JEWEL from known burn addresses
// Checks both JEWEL and wJEWEL (wrapped JEWEL) balances at burn addresses
async function fetchBurnedJewel(provider: ethers.JsonRpcProvider): Promise<BurnData> {
  const burnAddresses: { address: string; balance: number }[] = [];
  let totalBurned = 0;
  
  for (const address of BURN_ADDRESSES) {
    try {
      // Check native JEWEL balance
      const jewelBalance = await getTokenBalance(provider, TOKENS.JEWEL, address, 'JEWEL');
      // Check wJEWEL (wrapped) balance too - it's 1:1 with JEWEL
      const wJewelBalance = await getTokenBalance(provider, TOKENS.wJEWEL, address, 'wJEWEL');
      const combinedBalance = jewelBalance + wJewelBalance;
      
      if (combinedBalance > 0) {
        burnAddresses.push({ address, balance: combinedBalance });
        totalBurned += combinedBalance;
        console.log(`[ValueBreakdown] Burn address ${address.slice(0, 10)}...: ${combinedBalance.toLocaleString()} JEWEL (native: ${jewelBalance.toFixed(2)}, wrapped: ${wJewelBalance.toFixed(2)})`);
      }
    } catch (err) {
      console.warn(`[ValueBreakdown] Could not check burn address ${address}:`, err);
    }
  }
  
  if (totalBurned === 0) {
    console.log(`[ValueBreakdown] No JEWEL found at known burn addresses`);
  }
  
  return {
    totalBurned,
    burnAddresses,
    sources: ['Zero address', 'Dead address', 'EIP-1559 burns'],
  };
}

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
      
      // Sanity check reserves - if they're unreasonably large, there's an issue
      const MAX_REASONABLE_RESERVE = 1e15; // 1 quadrillion tokens max
      if (reserves.reserve0 > MAX_REASONABLE_RESERVE || reserves.reserve1 > MAX_REASONABLE_RESERVE) {
        console.warn(`[ValueBreakdown] SUSPICIOUS reserves for ${name}:`, {
          reserve0: reserves.reserve0,
          reserve1: reserves.reserve1,
          token0: token0Symbol,
          token1: token1Symbol,
        });
        // Skip this pool if reserves are suspicious
        continue;
      }
      
      // Sanity checks for staking info
      const MAX_REASONABLE_LP_SUPPLY = 1e15; // 1 quadrillion LP tokens max
      const safeV2Staked = (stakingInfo.v2Staked > 0 && stakingInfo.v2Staked < MAX_REASONABLE_LP_SUPPLY) 
        ? stakingInfo.v2Staked : 0;
      const safeV1Staked = (stakingInfo.v1Staked > 0 && stakingInfo.v1Staked < MAX_REASONABLE_LP_SUPPLY) 
        ? stakingInfo.v1Staked : 0;
      const safeTotalSupply = (stakingInfo.totalSupply > 0 && stakingInfo.totalSupply < MAX_REASONABLE_LP_SUPPLY) 
        ? stakingInfo.totalSupply : 0;
      
      // Log warnings for suspicious values
      if (stakingInfo.v2Staked >= MAX_REASONABLE_LP_SUPPLY || stakingInfo.v1Staked >= MAX_REASONABLE_LP_SUPPLY) {
        console.warn(`[ValueBreakdown] SUSPICIOUS LP values for ${name}:`, {
          v2Staked: stakingInfo.v2Staked,
          v1Staked: stakingInfo.v1Staked,
          totalSupply: stakingInfo.totalSupply,
        });
      }
      
      const totalPoolReserveValue = reserves.reserve0 * token0Price + reserves.reserve1 * token1Price;
      
      const totalStakedLP = safeV2Staked + safeV1Staked;
      const stakedRatio = safeTotalSupply > 0 ? Math.min(1.0, totalStakedLP / safeTotalSupply) : 0; // Cap ratio at 100%
      
      const stakedToken0 = reserves.reserve0 * stakedRatio;
      const stakedToken1 = reserves.reserve1 * stakedRatio;
      const token0ValueUSD = stakedToken0 * token0Price;
      const token1ValueUSD = stakedToken1 * token1Price;
      let totalValueUSD = token0ValueUSD + token1ValueUSD;
      
      // Final sanity check - skip pool entirely if value exceeds $10B (way more than all of DFK is worth)
      const MAX_POOL_VALUE_USD = 10_000_000_000;
      if (totalValueUSD > MAX_POOL_VALUE_USD || token0ValueUSD > MAX_POOL_VALUE_USD || token1ValueUSD > MAX_POOL_VALUE_USD) {
        console.warn(`[ValueBreakdown] SKIPPING pool ${name} - suspicious values:`, {
          totalValueUSD: totalValueUSD.toLocaleString(),
          token0ValueUSD: token0ValueUSD.toLocaleString(),
          token1ValueUSD: token1ValueUSD.toLocaleString(),
          stakedRatio,
        });
        continue; // Skip this pool entirely
      }
      
      console.log(`[ValueBreakdown] Pool ${name}: staked=${totalStakedLP.toFixed(2)}, ratio=${(stakedRatio * 100).toFixed(2)}%, value=$${totalValueUSD.toFixed(2)}`);
      
      const v2Ratio = safeTotalSupply > 0 ? Math.min(1.0, safeV2Staked / safeTotalSupply) : 0;
      const v1Ratio = safeTotalSupply > 0 ? Math.min(1.0, safeV1Staked / safeTotalSupply) : 0;
      const v2ValueUSD = totalPoolReserveValue * v2Ratio;
      const v1ValueUSD = totalPoolReserveValue * v1Ratio;
      
      // Skip pool if v1/v2 values are suspicious too
      if (v2ValueUSD > MAX_POOL_VALUE_USD || v1ValueUSD > MAX_POOL_VALUE_USD) {
        console.warn(`[ValueBreakdown] SKIPPING pool ${name} - suspicious v1/v2 values:`, {
          v2ValueUSD: v2ValueUSD.toLocaleString(),
          v1ValueUSD: v1ValueUSD.toLocaleString(),
        });
        continue;
      }

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

  // Calculate total wJEWEL in LP pools (wJEWEL is 1:1 with JEWEL)
  // We track both staked wJEWEL and FULL reserves for comprehensive coverage
  // Note: LP pools may use either 'wJEWEL' or 'JEWEL' symbol depending on the token address
  let lpTotalJewelStaked = 0;
  let lpTotalJewelFullReserves = 0;
  
  // Helper to check if a symbol represents JEWEL (wJEWEL and JEWEL are 1:1 wrappers)
  const isJewelSymbol = (symbol: string) => symbol === 'wJEWEL' || symbol === 'JEWEL';
  
  // We need to track raw reserves separately since lpPoolContracts only has staked portion
  // Query raw reserves for full coverage calculation
  for (const pool of lpPoolContracts) {
    // Debug log to see what symbols we're getting
    console.log(`[ValueBreakdown] Pool ${pool.name}: token0=${pool.token0Symbol} (${pool.token0Balance.toFixed(2)}), token1=${pool.token1Symbol} (${pool.token1Balance.toFixed(2)}), ratio=${(pool.stakedRatio * 100).toFixed(2)}%`);
    
    // Staked portion (already calculated in token0Balance/token1Balance)
    if (isJewelSymbol(pool.token0Symbol)) lpTotalJewelStaked += pool.token0Balance;
    if (isJewelSymbol(pool.token1Symbol)) lpTotalJewelStaked += pool.token1Balance;
    
    // Full reserves = staked / stakedRatio (if staked ratio > 0)
    // This gives us ALL wJEWEL in LP, not just staked portion
    if (pool.stakedRatio > 0) {
      if (isJewelSymbol(pool.token0Symbol)) {
        lpTotalJewelFullReserves += pool.token0Balance / pool.stakedRatio;
      }
      if (isJewelSymbol(pool.token1Symbol)) {
        lpTotalJewelFullReserves += pool.token1Balance / pool.stakedRatio;
      }
    }
    // Note: Pools with 0 staked ratio will be handled via direct reserve query below
  }
  
  // For pools with 0 staked ratio, query reserves directly
  // We need to match LP addresses back to their pools to get raw reserves
  for (const [name, config] of Object.entries(LP_POOLS)) {
    const pool = lpPoolContracts.find(p => p.address.toLowerCase() === config.address.toLowerCase());
    if (pool && pool.stakedRatio === 0) {
      // Query raw reserves for this pool directly
      try {
        const reserves = await getLPReserves(provider, config.address);
        if (reserves) {
          const token0Symbol = tokenNames[reserves.token0] || 'Unknown';
          const token1Symbol = tokenNames[reserves.token1] || 'Unknown';
          
          if (isJewelSymbol(token0Symbol)) {
            lpTotalJewelFullReserves += reserves.reserve0;
            console.log(`[ValueBreakdown] Pool ${name} (0% staked) - added ${reserves.reserve0.toFixed(2)} JEWEL from raw reserves`);
          }
          if (isJewelSymbol(token1Symbol)) {
            lpTotalJewelFullReserves += reserves.reserve1;
            console.log(`[ValueBreakdown] Pool ${name} (0% staked) - added ${reserves.reserve1.toFixed(2)} JEWEL from raw reserves`);
          }
        }
      } catch (err) {
        console.warn(`[ValueBreakdown] Could not get reserves for ${name}:`, err);
      }
    }
  }
  
  console.log(`[ValueBreakdown] LP wJEWEL - Staked: ${lpTotalJewelStaked.toLocaleString()}, Full Reserves: ${lpTotalJewelFullReserves.toLocaleString()}`);

  categories.push({
    category: 'LP Pools',
    contracts: lpPoolContracts,
    totalValueUSD: lpPoolContracts.reduce((sum, c) => sum + c.totalValueUSD, 0),
    totalJewel: lpTotalJewelStaked,
    totalJewelFullReserves: lpTotalJewelFullReserves,
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

  const bridgeContracts = [];
  for (const [name, address] of Object.entries(BRIDGE_CONTRACTS)) {
    await delay(150);
    const jewelBalance = await getTokenBalance(provider, TOKENS.JEWEL, address, 'JEWEL');
    await delay(150);
    const crystalBalance = await getTokenBalance(provider, TOKENS.CRYSTAL, address, 'CRYSTAL');
    
    bridgeContracts.push({
      name,
      address,
      jewelBalance,
      crystalBalance,
      jewelValueUSD: jewelBalance * jewelPrice,
      crystalValueUSD: crystalBalance * crystalPrice,
      totalValueUSD: jewelBalance * jewelPrice + crystalBalance * crystalPrice,
    });
    console.log(`[ValueBreakdown] ${name}: JEWEL=${jewelBalance.toFixed(2)}, CRYSTAL=${crystalBalance.toFixed(2)}`);
  }

  categories.push({
    category: 'Bridge Contracts',
    contracts: bridgeContracts,
    totalJewel: bridgeContracts.reduce((sum, c) => sum + c.jewelBalance, 0),
    totalCrystal: bridgeContracts.reduce((sum, c) => sum + c.crystalBalance, 0),
    totalValueUSD: bridgeContracts.reduce((sum, c) => sum + c.totalValueUSD, 0),
  });

  const systemContracts = [];
  for (const [name, address] of Object.entries(SYSTEM_CONTRACTS)) {
    await delay(150);
    const jewelBalance = await getTokenBalance(provider, TOKENS.JEWEL, address, 'JEWEL');
    await delay(150);
    const crystalBalance = await getTokenBalance(provider, TOKENS.CRYSTAL, address, 'CRYSTAL');
    
    systemContracts.push({
      name,
      address,
      jewelBalance,
      crystalBalance,
      jewelValueUSD: jewelBalance * jewelPrice,
      crystalValueUSD: crystalBalance * crystalPrice,
      totalValueUSD: jewelBalance * jewelPrice + crystalBalance * crystalPrice,
    });
    console.log(`[ValueBreakdown] ${name}: JEWEL=${jewelBalance.toFixed(2)}, CRYSTAL=${crystalBalance.toFixed(2)}`);
  }

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
    { symbol: 'wJEWEL', price: allPrices['wJEWEL'] || allPrices['JEWEL'] || 0, source: 'defillama' },
    { symbol: 'CRYSTAL', price: allPrices['CRYSTAL'] || 0, source: 'defillama' },
    { symbol: 'xJEWEL', price: allPrices['xJEWEL'] || allPrices['JEWEL'] || 0, source: 'defillama' },
    { symbol: 'AVAX', price: allPrices['AVAX'] || 0, source: 'defillama' },
    { symbol: 'ETH', price: allPrices['ETH'] || 0, source: 'defillama' },
    { symbol: 'BTC.b', price: allPrices['BTC.b'] || 0, source: 'defillama' },
    { symbol: 'USDC', price: allPrices['USDC'] || 1.0, source: 'defillama' },
    { symbol: 'KLAY', price: allPrices['KLAY'] || 0, source: 'defillama' },
  ];

  // Fetch JEWEL supply, burn data, multi-chain balances, and Harmony LPs in parallel
  const [jewelSupply, burnData, multiChainBalances, harmonyLpReserves] = await Promise.all([
    fetchJewelSupply(),
    fetchBurnedJewel(provider),
    getMultiChainJewelBalances(),
    getHarmonyLPReserves(),
  ]);
  
  // ========== COMPREHENSIVE COVERAGE CALCULATION ==========
  // Goal: Track ALL JEWEL across the ecosystem to approach 100% coverage
  // IMPORTANT: Avoid double-counting! Bridge contracts on DFK Chain hold JEWEL that's 
  // already counted in multi-chain totals (it was bridged TO those chains).
  
  // 1. DFK CHAIN LOCKED JEWEL (cJEWEL staking + system contracts, NOT bridge contracts)
  // Bridge contracts are excluded because their JEWEL appears on other chains
  const lockedJewelCJewel = stakingCat?.contracts.find(c => c.name.includes('cJEWEL'))?.jewelBalance || 0;
  const lockedJewelBridge = bridgeCat?.totalJewel || 0; // Track for reference only
  const lockedJewelSystem = systemCat?.totalJewel || 0;
  // Only count cJEWEL + system (not bridge) to avoid double-counting
  const lockedTotal = lockedJewelCJewel + lockedJewelSystem;
  
  // 2. DFK CHAIN POOLED JEWEL (wJEWEL in LP reserves - FULL reserves, not just staked)
  // Use totalJewelFullReserves from LP category for complete coverage
  const lpPooledTotal = lpCat?.totalJewelFullReserves || 0;
  const lpPooledStaked = lpCat?.totalJewel || 0;
  const lpPooledUnstaked = lpPooledTotal - lpPooledStaked;
  
  // 3. MULTI-CHAIN JEWEL (bridge contracts + LPs on other chains)
  // IMPORTANT: We do NOT use chainTotalSupply because Harmony has ~283M permanently locked
  // JEWEL that will never unlock. Only track active JEWEL: bridge contracts and LPs.
  const harmonyChain = multiChainBalances.find(c => c.chain === 'Harmony');
  const kaiaChain = multiChainBalances.find(c => c.chain === 'Kaia');
  const metisChain = multiChainBalances.find(c => c.chain === 'Metis');
  
  // Use bridge contract balances (active JEWEL), NOT totalSupply (includes permanently locked)
  // The chainTotalSupply is stored for reference but excluded from coverage calculation
  const harmonyBridgeJewel = harmonyChain?.totalJewel || 0;
  const kaiaBridgeJewel = kaiaChain?.totalJewel || 0;
  const metisBridgeJewel = metisChain?.totalJewel || 0;
  
  // Harmony LP reserves (JEWEL-ONE pool) for active JEWEL on Harmony
  const harmonyLpJewel = harmonyLpReserves.reduce((sum, lp) => sum + lp.jewelReserves, 0);
  
  // Multi-chain total = bridge contracts + LPs (not totalSupply)
  const harmonyTotal = harmonyBridgeJewel + harmonyLpJewel;
  const kaiaTotal = kaiaBridgeJewel;
  const metisTotal = metisBridgeJewel;
  const multiChainTotal = harmonyTotal + kaiaTotal + metisTotal;
  
  // Store chainTotalSupply for reference (includes permanently locked)
  const harmonyTotalSupply = harmonyChain?.chainTotalSupply || 0;
  const kaiaTotalSupply = kaiaChain?.chainTotalSupply || 0;
  const metisTotalSupply = metisChain?.chainTotalSupply || 0;
  
  // 4. BURNED JEWEL
  const burnedTotal = burnData.totalBurned;
  
  console.log(`[ValueBreakdown] Coverage Breakdown (Active JEWEL only):`);
  console.log(`  - DFK Locked (cJEWEL): ${lockedJewelCJewel.toLocaleString()}`);
  console.log(`  - DFK Locked (System): ${lockedJewelSystem.toLocaleString()}`);
  console.log(`  - DFK Bridge Contracts (excluded): ${lockedJewelBridge.toLocaleString()}`);
  console.log(`  - DFK Pooled (LP Full): ${lpPooledTotal.toLocaleString()}`);
  console.log(`  - Harmony Bridge: ${harmonyBridgeJewel.toLocaleString()}`);
  console.log(`  - Harmony LPs (JEWEL-ONE): ${harmonyLpJewel.toLocaleString()}`);
  console.log(`  - Kaia Bridge: ${kaiaBridgeJewel.toLocaleString()}`);
  console.log(`  - Metis Bridge: ${metisBridgeJewel.toLocaleString()}`);
  console.log(`  - Burned: ${burnedTotal.toLocaleString()}`);
  console.log(`  - Note: Harmony totalSupply (${harmonyTotalSupply.toLocaleString()}) includes permanently locked - excluded from coverage`);
  
  // Total tracked = DFK Chain (Locked + Pooled) + MultiChain + Burned
  // Note: Bridge contracts excluded because their value is already counted on other chains
  const trackedJewel = lockedTotal + lpPooledTotal + multiChainTotal + burnedTotal;
  
  // 5. LIQUID JEWEL (estimated) = Circulating - Tracked
  // This represents JEWEL in user wallets, CEX accounts, etc.
  const liquidEstimate = jewelSupply ? Math.max(0, jewelSupply.circulatingSupply - trackedJewel) : 0;
  
  console.log(`[ValueBreakdown] Total Tracked: ${trackedJewel.toLocaleString()}`);
  console.log(`[ValueBreakdown] Liquid (estimated): ${liquidEstimate.toLocaleString()}`);
  
  // Build comprehensive coverage breakdown
  const coverageBreakdown: CoverageBreakdown = {
    locked: {
      cJewel: lockedJewelCJewel,
      systemContracts: lockedJewelSystem,
      bridgeContracts: lockedJewelBridge, // Tracked for reference but excluded from totals
      total: lockedTotal, // Does NOT include bridge contracts (to avoid double-counting)
    },
    pooled: {
      lpReservesStaked: lpPooledStaked,
      lpReservesUnstaked: lpPooledUnstaked,
      total: lpPooledTotal,
    },
    multiChain: {
      harmonyTotal,
      kaiaTotal,
      metisTotal,
      total: multiChainTotal,
    },
    burned: {
      total: burnedTotal,
      addresses: burnData.burnAddresses,
    },
    liquid: {
      estimated: liquidEstimate,
    },
    totalTracked: trackedJewel,
    circulatingSupply: jewelSupply?.circulatingSupply || 0,
    coverageRatio: jewelSupply ? Math.min(1, trackedJewel / jewelSupply.circulatingSupply) : 0,
  };
  
  // Calculate coverage KPI (legacy format for backward compatibility)
  let coverageKPI: ValueBreakdownResult['coverageKPI'];
  if (jewelSupply && jewelSupply.circulatingSupply > 0) {
    // Use trackedJewel + liquidEstimate to show near-100% when including liquid
    const totalAccountedFor = trackedJewel + liquidEstimate;
    const rawCoverageRatio = trackedJewel / jewelSupply.circulatingSupply;
    const coverageRatio = Math.min(1, Math.max(0, rawCoverageRatio));
    const unaccountedJewel = liquidEstimate; // Liquid is the "unaccounted" portion
    
    coverageKPI = {
      trackedJewel,
      circulatingSupply: jewelSupply.circulatingSupply,
      coverageRatio,
      unaccountedJewel,
      multiChainTotal,
      lpPooledTotal,
      lockedTotal,
      burnedTotal,
      liquidEstimate,
    };
    console.log(`[ValueBreakdown] Coverage KPI: ${(coverageRatio * 100).toFixed(2)}% (${trackedJewel.toLocaleString()} / ${jewelSupply.circulatingSupply.toLocaleString()})`);
    
    if (rawCoverageRatio > 1) {
      console.warn(`[ValueBreakdown] WARNING: Coverage ratio ${(rawCoverageRatio * 100).toFixed(2)}% exceeds 100% - possible double-counting`);
    }
  }
  
  // Update burned supply in jewelSupply if we have burn data
  if (jewelSupply && burnData.totalBurned > 0) {
    jewelSupply.burnedSupply = burnData.totalBurned;
  }

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
    jewelSupply: jewelSupply || undefined,
    burnData: burnData.totalBurned > 0 ? burnData : undefined,
    multiChainBalances: multiChainBalances.length > 0 ? multiChainBalances : undefined,
    coverageBreakdown,
    coverageKPI,
    summary: {
      totalJewelLocked,
      totalCrystalLocked,
      totalValueUSD: categories.reduce((sum, c) => sum + c.totalValueUSD, 0),
      lpPoolsValue: lpCat?.totalValueUSD || 0,
      stakingValue: stakingCat?.totalValueUSD || 0,
      bridgeValue: bridgeCat?.totalValueUSD || 0,
      systemValue: systemCat?.totalValueUSD || 0,
      multiChainJewel: multiChainTotal,
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
