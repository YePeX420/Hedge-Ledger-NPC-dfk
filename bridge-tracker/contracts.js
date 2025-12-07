export const BRIDGE_CONTRACTS = {
  dfkChain: {
    chainId: 53935,
    rpcUrl: 'https://subnets.avax.network/defi-kingdoms/dfk-chain/rpc',
    heroBridge: {
      address: '0x739B1666c2956f601f095298132773074c3E184b',
      events: ['HeroSent', 'HeroArrived']
    },
    itemBridge: {
      address: '0x409E6CDE3119584074E162dcCC6C86433251C36f',
      events: ['ItemSent', 'ItemReceived', 'ERC1155Sent', 'ERC1155Received']
    },
    equipmentBridge: {
      address: '0x3f6cc9B0E342386618cDc5785Fd4DF82CfB32CCF',
      events: ['EquipmentSent', 'EquipmentArrived', 'PetSent', 'PetArrived']
    }
  },
  kaia: {
    chainId: 8217,
    heroBridge: '0xEE258eF5F4338B37E9BA9dE6a56382AdB32056E2',
    itemBridge: '0x1679b50950aFF40983716b91862BB49eeE9718b9',
    equipmentBridge: '0xfb065ef4257719A99Ce7f1d03A6C22bd28983b77'
  },
  harmony: {
    chainId: 1666600000,
    heroBridge: '0x573e407Be90a50EAbA28748cbb62Ff9d6038A3e9'
  }
};

export const TOKEN_ADDRESSES = {
  dfkChain: {
    CRYSTAL: '0x04b9dA42306B023f3572e106B11D82aAd9D32EBb',
    JEWEL: '0xCCb93dABD71c8Dad03Fc4CE5559dC3D89F67a260',
    USDC: '0x3AD9DFE640E1A9Cc1D9B0948620820D975c3803a',
    ETH: '0xfBDF0E31808d0aa7b9509Aa6aBC9754E48C58852',
    AVAX: '0xB57B60DeBDB0b8172bb6316a9164bd3C695F133a',
    BTC: '0x6Cab60b0a34BaDC9A66Da75caA6DA30d37Dc8d47',
    KAIA: '0x2b5c4Ac233a6d1F5B8e5eae5A2a3c3e5D0aCe0aB'
  }
};

export const CHAIN_NAMES = {
  53935: 'DFK Chain',
  8217: 'Kaia',
  1666600000: 'Harmony',
  1088: 'Metis'
};
