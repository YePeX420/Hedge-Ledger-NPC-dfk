export const DFK_CHAIN_ID = 53935;

export const BRIDGE_CONTRACTS = {
  dfkChain: {
    chainId: 53935,
    rpcUrl: 'https://subnets.avax.network/defi-kingdoms/dfk-chain/rpc'
  }
};

export const TOKEN_ADDRESSES = {
  dfkChain: {
    CRYSTAL: '0x04b9dA42306B023f3572e106B11D82aAd9D32EBb',
    JEWEL: '0xCCb93dABD71c8Dad03Fc4CE5559dC3D89F67a260',
    USDC: '0x3AD9DFE640E1A9Cc1D9B0948620820D975c3803a',
    ETH: '0xfBDF0E31808d0aa7b9509Aa6aBC9754E48C58852',
    AVAX: '0xB57B60DeBDB0b8172bb6316a9164bd3C695F133a',
    BTC: '0x7516EB8B8Edfa420f540a162335eACF3ea05a247',
    KAIA: '0x97855Ba65aa7ed2F65Ed832a776537268158B78a'
  }
};

export const KNOWN_BRIDGE_ADDRESSES = new Set([
  '0xe05c976d3f045d0e6e7a6f61083d98a15603cf6a',
  '0x230a1ac45690b9ae1176389434610b9526d2f21b',
  '0x7e7a0e201fd38d3adaa9523da6c109a07118c96a'
].map(a => a.toLowerCase()));

export const CHAIN_NAMES = {
  53935: 'DFK Chain',
  8217: 'Kaia',
  1666600000: 'Harmony',
  1088: 'Metis',
  43114: 'Avalanche C-Chain'
};

export const TOKEN_DECIMALS = {
  CRYSTAL: 18,
  JEWEL: 18,
  USDC: 6,
  ETH: 18,
  AVAX: 18,
  BTC: 8,
  KAIA: 18
};
