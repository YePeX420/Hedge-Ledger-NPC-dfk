import { ethers } from 'ethers';
import { db } from '../server/db.js';
import { bridgeEvents } from '../shared/schema.js';
import { eq, and, sql } from 'drizzle-orm';
import { 
  LAYERZERO_BRIDGES, 
  DFK_CHAIN_ID,
  CHAIN_NAMES 
} from './contracts.js';

const DFK_RPC = 'https://subnets.avax.network/defi-kingdoms/dfk-chain/rpc';
const METIS_RPC = 'https://andromeda.metis.io/?owner=1088';
const KAIA_RPC = 'https://public-en.node.kaia.io';

const HERO_BRIDGE_ABI = [
  'event HeroSent(uint256 indexed heroId, uint256 arrivalChainId)',
  'event HeroArrived(uint256 indexed heroId, uint256 arrivalChainId)',
  'event HeroLZBridgeSent(uint32 srcEid, address sender, address receiver, uint256 heroId)',
  'event HeroLZBridgeReceived(uint32 srcEid, address sender, address receiver, uint256 heroId)'
];

const EQUIPMENT_BRIDGE_ABI = [
  'event EquipmentSent(uint256 indexed equipmentId, uint16 indexed equipmentType, uint256 arrivalChainId)',
  'event EquipmentArrived(uint256 indexed equipmentId, uint16 indexed equipmentType, uint256 arrivalChainId)',
  'event PetSent(uint256 indexed petId, uint256 arrivalChainId)',
  'event PetArrived(uint256 indexed petId, uint256 arrivalChainId)'
];

const EQUIPMENT_TYPE_NAMES = {
  1: 'Weapon',
  2: 'Accessory', 
  3: 'Armor',
  4: 'Pet'
};

async function getProvider(chainId) {
  switch (chainId) {
    case 53935: return new ethers.JsonRpcProvider(DFK_RPC);
    case 1088: return new ethers.JsonRpcProvider(METIS_RPC);
    case 8217: return new ethers.JsonRpcProvider(KAIA_RPC);
    default: throw new Error(`Unknown chain ID: ${chainId}`);
  }
}

async function getLastIndexedBlock(chainId, bridgeType) {
  const result = await db.select({ 
    maxBlock: sql`MAX(block_number)` 
  }).from(bridgeEvents)
    .where(and(
      eq(bridgeEvents.srcChainId, chainId),
      eq(bridgeEvents.bridgeType, bridgeType)
    ));
  return result[0]?.maxBlock || 0;
}

const LZ_ENDPOINT_TO_CHAIN = {
  30106: 53935,  // DFK Chain LZ endpoint -> EVM chain ID
  30145: 1088,   // Metis LZ endpoint -> EVM chain ID
  30150: 8217,   // Kaia LZ endpoint -> EVM chain ID
};

async function indexHeroBridge(chainId, contractAddress, fromBlock, toBlock) {
  console.log(`[LayerZero] Indexing Hero Bridge on chain ${chainId} from block ${fromBlock} to ${toBlock}`);
  
  const provider = await getProvider(chainId);
  const contract = new ethers.Contract(contractAddress, HERO_BRIDGE_ABI, provider);
  
  const events = [];
  const batchSize = 2000; // RPC limit is 2048 blocks
  
  for (let start = fromBlock; start <= toBlock; start += batchSize) {
    const end = Math.min(start + batchSize - 1, toBlock);
    
    try {
      const heroLZSentEvents = await contract.queryFilter('HeroLZBridgeSent', start, end);
      const heroLZReceivedEvents = await contract.queryFilter('HeroLZBridgeReceived', start, end);
      
      for (const event of heroLZSentEvents) {
        const block = await event.getBlock();
        const dstChainId = LZ_ENDPOINT_TO_CHAIN[Number(event.args.srcEid)] || Number(event.args.srcEid);
        
        events.push({
          wallet: event.args.sender.toLowerCase(),
          bridgeType: 'hero',
          direction: 'out',
          tokenAddress: null,
          tokenSymbol: 'HERO',
          amount: null,
          assetId: Number(event.args.heroId),
          srcChainId: chainId,
          dstChainId: dstChainId,
          txHash: event.transactionHash,
          blockNumber: event.blockNumber,
          blockTimestamp: new Date(block.timestamp * 1000)
        });
      }
      
      for (const event of heroLZReceivedEvents) {
        const block = await event.getBlock();
        const srcChainId = LZ_ENDPOINT_TO_CHAIN[Number(event.args.srcEid)] || Number(event.args.srcEid);
        
        events.push({
          wallet: event.args.receiver.toLowerCase(),
          bridgeType: 'hero',
          direction: 'in',
          tokenAddress: null,
          tokenSymbol: 'HERO',
          amount: null,
          assetId: Number(event.args.heroId),
          srcChainId: srcChainId,
          dstChainId: chainId,
          txHash: event.transactionHash,
          blockNumber: event.blockNumber,
          blockTimestamp: new Date(block.timestamp * 1000)
        });
      }
      
      console.log(`[LayerZero] Chain ${chainId} blocks ${start}-${end}: Found ${heroLZSentEvents.length} sent, ${heroLZReceivedEvents.length} arrived`);
    } catch (err) {
      console.error(`[LayerZero] Error indexing hero bridge blocks ${start}-${end}:`, err.message);
    }
  }
  
  return events;
}

async function indexEquipmentBridge(chainId, contractAddress, fromBlock, toBlock) {
  console.log(`[LayerZero] Indexing Equipment Bridge on chain ${chainId} from block ${fromBlock} to ${toBlock}`);
  
  const provider = await getProvider(chainId);
  const contract = new ethers.Contract(contractAddress, EQUIPMENT_BRIDGE_ABI, provider);
  
  const events = [];
  const batchSize = 2000; // RPC limit is 2048 blocks
  
  for (let start = fromBlock; start <= toBlock; start += batchSize) {
    const end = Math.min(start + batchSize - 1, toBlock);
    
    try {
      const equipSentEvents = await contract.queryFilter('EquipmentSent', start, end);
      const equipArrivedEvents = await contract.queryFilter('EquipmentArrived', start, end);
      const petSentEvents = await contract.queryFilter('PetSent', start, end);
      const petArrivedEvents = await contract.queryFilter('PetArrived', start, end);
      
      for (const event of equipSentEvents) {
        const block = await event.getBlock();
        const tx = await event.getTransaction();
        const equipType = EQUIPMENT_TYPE_NAMES[Number(event.args.equipmentType)] || 'Equipment';
        
        events.push({
          wallet: tx.from.toLowerCase(),
          bridgeType: 'equipment',
          direction: 'out',
          tokenAddress: null,
          tokenSymbol: equipType.toUpperCase(),
          amount: null,
          assetId: Number(event.args.equipmentId),
          srcChainId: chainId,
          dstChainId: Number(event.args.arrivalChainId),
          txHash: event.transactionHash,
          blockNumber: event.blockNumber,
          blockTimestamp: new Date(block.timestamp * 1000)
        });
      }
      
      for (const event of equipArrivedEvents) {
        const block = await event.getBlock();
        const tx = await event.getTransaction();
        const equipType = EQUIPMENT_TYPE_NAMES[Number(event.args.equipmentType)] || 'Equipment';
        
        events.push({
          wallet: tx.from.toLowerCase(),
          bridgeType: 'equipment',
          direction: 'in',
          tokenAddress: null,
          tokenSymbol: equipType.toUpperCase(),
          amount: null,
          assetId: Number(event.args.equipmentId),
          srcChainId: Number(event.args.arrivalChainId),
          dstChainId: chainId,
          txHash: event.transactionHash,
          blockNumber: event.blockNumber,
          blockTimestamp: new Date(block.timestamp * 1000)
        });
      }
      
      for (const event of petSentEvents) {
        const block = await event.getBlock();
        const tx = await event.getTransaction();
        
        events.push({
          wallet: tx.from.toLowerCase(),
          bridgeType: 'pet',
          direction: 'out',
          tokenAddress: null,
          tokenSymbol: 'PET',
          amount: null,
          assetId: Number(event.args.petId),
          srcChainId: chainId,
          dstChainId: Number(event.args.arrivalChainId),
          txHash: event.transactionHash,
          blockNumber: event.blockNumber,
          blockTimestamp: new Date(block.timestamp * 1000)
        });
      }
      
      for (const event of petArrivedEvents) {
        const block = await event.getBlock();
        const tx = await event.getTransaction();
        
        events.push({
          wallet: tx.from.toLowerCase(),
          bridgeType: 'pet',
          direction: 'in',
          tokenAddress: null,
          tokenSymbol: 'PET',
          amount: null,
          assetId: Number(event.args.petId),
          srcChainId: Number(event.args.arrivalChainId),
          dstChainId: chainId,
          txHash: event.transactionHash,
          blockNumber: event.blockNumber,
          blockTimestamp: new Date(block.timestamp * 1000)
        });
      }
      
      console.log(`[LayerZero] Chain ${chainId} blocks ${start}-${end}: Found ${equipSentEvents.length + petSentEvents.length} sent, ${equipArrivedEvents.length + petArrivedEvents.length} arrived`);
    } catch (err) {
      console.error(`[LayerZero] Error indexing equipment bridge blocks ${start}-${end}:`, err.message);
    }
  }
  
  return events;
}

async function saveEvents(events) {
  if (events.length === 0) return 0;
  
  let saved = 0;
  for (const event of events) {
    try {
      await db.insert(bridgeEvents)
        .values(event)
        .onConflictDoNothing();
      saved++;
    } catch (err) {
      if (!err.message.includes('duplicate')) {
        console.error(`[LayerZero] Error saving event:`, err.message);
      }
    }
  }
  
  return saved;
}

export async function indexLayerZeroBridges(options = {}) {
  const { fullResync = false, blocksBack = 100000 } = options;
  
  console.log('[LayerZero] Starting LayerZero bridge indexing...');
  
  const chains = [
    { id: 53935, name: 'DFK Chain', key: 'dfkChain' },
    { id: 1088, name: 'Metis', key: 'metis' },
    { id: 8217, name: 'Kaia', key: 'kaia' }
  ];
  
  let totalEvents = 0;
  
  for (const chain of chains) {
    try {
      const provider = await getProvider(chain.id);
      const currentBlock = await provider.getBlockNumber();
      
      const heroBridgeAddr = LAYERZERO_BRIDGES.heroBridge[chain.key];
      const equipBridgeAddr = LAYERZERO_BRIDGES.equipmentBridge[chain.key];
      
      if (heroBridgeAddr) {
        const lastHeroBlock = fullResync ? currentBlock - blocksBack : await getLastIndexedBlock(chain.id, 'hero');
        const fromBlock = Math.max(lastHeroBlock + 1, currentBlock - blocksBack);
        
        if (fromBlock < currentBlock) {
          const heroEvents = await indexHeroBridge(chain.id, heroBridgeAddr, fromBlock, currentBlock);
          const saved = await saveEvents(heroEvents);
          console.log(`[LayerZero] ${chain.name} Hero Bridge: Saved ${saved} events`);
          totalEvents += saved;
        }
      }
      
      if (equipBridgeAddr) {
        const lastEquipBlock = fullResync ? currentBlock - blocksBack : await getLastIndexedBlock(chain.id, 'equipment');
        const fromBlock = Math.max(lastEquipBlock + 1, currentBlock - blocksBack);
        
        if (fromBlock < currentBlock) {
          const equipEvents = await indexEquipmentBridge(chain.id, equipBridgeAddr, fromBlock, currentBlock);
          const saved = await saveEvents(equipEvents);
          console.log(`[LayerZero] ${chain.name} Equipment Bridge: Saved ${saved} events`);
          totalEvents += saved;
        }
      }
    } catch (err) {
      console.error(`[LayerZero] Error indexing chain ${chain.name}:`, err.message);
    }
  }
  
  console.log(`[LayerZero] Indexing complete. Total events saved: ${totalEvents}`);
  return totalEvents;
}

export async function getLayerZeroStats() {
  const stats = await db.select({
    bridgeType: bridgeEvents.bridgeType,
    direction: bridgeEvents.direction,
    count: sql`COUNT(*)::int`
  }).from(bridgeEvents)
    .where(sql`${bridgeEvents.bridgeType} IN ('hero', 'equipment', 'pet')`)
    .groupBy(bridgeEvents.bridgeType, bridgeEvents.direction);
  
  return stats;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  indexLayerZeroBridges({ fullResync: true, blocksBack: 500000 })
    .then(() => process.exit(0))
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}
