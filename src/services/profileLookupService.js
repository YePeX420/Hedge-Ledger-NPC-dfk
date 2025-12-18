import { ethers } from 'ethers';

const DFK_CHAIN_RPC = 'https://subnets.avax.network/defi-kingdoms/dfk-chain/rpc';

const PROFILE_CONTRACTS = {
  crystalvale: {
    rpc: DFK_CHAIN_RPC,
    address: '0xC4cD8C09D1A90b21Be417be91A81603B03993E81',
  },
  harmony: {
    rpc: 'https://api.harmony.one',
    address: '0x6391F796D56201D279a42fD3141aDa7e26A3B4A5',
  },
  klaytn: {
    rpc: 'https://public-en.node.kaia.io',
    address: '0xe1b8C354BE50357c2ab90A962254526d08aF0D2D',
  },
};

const PROFILES_ABI = [
  {
    inputs: [{ name: '', type: 'address' }],
    name: 'addressToProfile',
    outputs: [
      { name: 'owner', type: 'address' },
      { name: 'name', type: 'string' },
      { name: 'created', type: 'uint64' },
      { name: 'nftId', type: 'uint256' },
      { name: 'collectionId', type: 'uint256' },
      { name: 'picUri', type: 'string' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
];

const profileProviders = new Map();
const profileContracts = new Map();

export function getProfilesContract(realm = 'crystalvale') {
  if (!profileContracts.has(realm)) {
    const config = PROFILE_CONTRACTS[realm];
    if (!config) {
      throw new Error(`Unknown realm: ${realm}`);
    }
    if (!profileProviders.has(realm)) {
      profileProviders.set(realm, new ethers.JsonRpcProvider(config.rpc));
    }
    profileContracts.set(realm, new ethers.Contract(config.address, PROFILES_ABI, profileProviders.get(realm)));
  }
  return profileContracts.get(realm);
}

async function lookupProfileOnRealm(wallet, realm) {
  try {
    const contract = getProfilesContract(realm);
    const profile = await contract.addressToProfile(wallet);
    if (profile.name && profile.owner !== '0x0000000000000000000000000000000000000000') {
      return profile.name;
    }
    return null;
  } catch (err) {
    return null;
  }
}

export async function getSummonerName(wallet) {
  const realms = ['crystalvale', 'harmony', 'klaytn'];
  
  for (const realm of realms) {
    const name = await lookupProfileOnRealm(wallet, realm);
    if (name) {
      return name;
    }
  }
  
  return null;
}

export async function getSummonerNameBatch(wallets, options = {}) {
  const { concurrency = 5, onProgress = null } = options;
  const results = new Map();
  
  for (let i = 0; i < wallets.length; i += concurrency) {
    const batch = wallets.slice(i, i + concurrency);
    const names = await Promise.all(batch.map(wallet => getSummonerName(wallet)));
    
    batch.forEach((wallet, idx) => {
      results.set(wallet.toLowerCase(), names[idx]);
    });
    
    if (onProgress) {
      onProgress(Math.min(i + concurrency, wallets.length), wallets.length);
    }
  }
  
  return results;
}
