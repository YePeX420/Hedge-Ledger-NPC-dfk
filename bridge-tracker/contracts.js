export const DFK_CHAIN_ID = 53935;

export const BRIDGE_CONTRACTS = {
  dfkChain: {
    chainId: 53935,
    rpcUrl: 'https://subnets.avax.network/defi-kingdoms/dfk-chain/rpc',
    synapseBridge: '0xE05c976d3f045D0E6E7A6f61083d98A15603cF6A',
    synapseRouter: '0x7E7A0e201FD38d3ADAA9523Da6C109a07118C96a',
    l1BridgeZap: '0x7E7A0e201FD38d3ADAA9523Da6C109a07118C96a',
    l2BridgeZap: '0x7E7A0e201FD38d3ADAA9523Da6C109a07118C96a'
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
    KAIA: '0x97855Ba65aa7ed2F65Ed832a776537268158B78a',
    FTM: '0x2Df041186C844F8a2e2b63F16145Bc6Ff7d23E25',
    MATIC: '0xD17a41Cd199edF1093A9Be4404EaDe52Ec19698e'
  }
};

export const TOKEN_ADDRESS_TO_SYMBOL = Object.fromEntries(
  Object.entries(TOKEN_ADDRESSES.dfkChain).map(([symbol, addr]) => [addr.toLowerCase(), symbol])
);

export const KNOWN_BRIDGE_ADDRESSES = new Set([
  '0xe05c976d3f045d0e6e7a6f61083d98a15603cf6a',
  '0x7e7a0e201fd38d3adaa9523da6c109a07118c96a',
  '0x230a1ac45690b9ae1176389434610b9526d2f21b'
].map(a => a.toLowerCase()));

export const CHAIN_NAMES = {
  53935: 'DFK Chain',
  8217: 'Kaia',
  1666600000: 'Harmony',
  1088: 'Metis',
  43114: 'Avalanche C-Chain',
  1: 'Ethereum',
  137: 'Polygon',
  250: 'Fantom'
};

export const TOKEN_DECIMALS = {
  CRYSTAL: 18,
  JEWEL: 18,
  USDC: 6,
  ETH: 18,
  AVAX: 18,
  BTC: 8,
  KAIA: 18,
  FTM: 18,
  MATIC: 18
};

export const SYNAPSE_BRIDGE_EVENTS = {
  TokenDeposit: '0x03991a62ee09961373f90b2a1cd55682f2f04f90ba19aa9a1c1a40b2c91f1536',
  TokenDepositAndSwap: '0x17a5c65d7c5d8bf3c9e3a24a7ac17e8e89b87f3c3c2d1e0a3b8e2f6b5c4a5d6e',
  TokenRedeem: '0x9d71f6e6e86f8a2a6e8b5c3c2d1f0e9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e',
  TokenMint: '0xbf14b9fde87f6e1c29a7e0787ad1d0d64b4648d8ae63da21524d9fd0f283dd38',
  TokenMintAndSwap: '0xa3e5c46f7c0e1e5a2b7c8d1e6f5a4b3c2d1e0f9a8b7c6d5e4f3a2b1c0d9e8f7a',
  TokenWithdraw: '0x8b2f85c5e23c7d8b9a3c1d2e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a'
};

export const ERC20_TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
