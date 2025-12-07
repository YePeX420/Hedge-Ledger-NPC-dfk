import { ethers } from 'ethers';
import { db } from '../server/db.js';
import { bridgeEvents, walletBridgeMetrics } from '../shared/schema.js';
import { BRIDGE_CONTRACTS, TOKEN_ADDRESSES, CHAIN_NAMES } from './contracts.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DFK_CHAIN_ID = 53935;
const BLOCKS_PER_QUERY = 2000;

function loadAbi(filename) {
  const abiPath = path.join(__dirname, filename);
  return JSON.parse(fs.readFileSync(abiPath, 'utf8'));
}

const HERO_BRIDGE_ABI = loadAbi('HeroBridgeUpgradeable.json');
const ITEM_BRIDGE_ABI = loadAbi('ItemBridgeLZDiamond.json');
const EQUIPMENT_BRIDGE_ABI = loadAbi('EquipmentBridgeLZDiamond.json');

const tokenSymbolFromAddress = (address) => {
  const addr = address?.toLowerCase();
  for (const [symbol, tokenAddr] of Object.entries(TOKEN_ADDRESSES.dfkChain)) {
    if (tokenAddr.toLowerCase() === addr) return symbol;
  }
  return 'UNKNOWN';
};

export async function getProvider() {
  return new ethers.JsonRpcProvider(BRIDGE_CONTRACTS.dfkChain.rpcUrl);
}

export async function getLatestBlock() {
  const provider = await getProvider();
  return provider.getBlockNumber();
}

export async function indexHeroBridge(fromBlock, toBlock, options = {}) {
  const { verbose = false } = options;
  const provider = await getProvider();
  const contract = new ethers.Contract(
    BRIDGE_CONTRACTS.dfkChain.heroBridge.address,
    HERO_BRIDGE_ABI,
    provider
  );

  const results = [];

  for (const eventName of ['HeroSent', 'HeroArrived']) {
    try {
      const filter = contract.filters[eventName]?.();
      if (!filter) {
        if (verbose) console.log(`[HeroBridge] No filter for ${eventName}`);
        continue;
      }

      const events = await contract.queryFilter(filter, fromBlock, toBlock);
      if (verbose) console.log(`[HeroBridge] Found ${events.length} ${eventName} events`);

      for (const event of events) {
        const block = await provider.getBlock(event.blockNumber);
        const args = event.args;
        
        const direction = eventName === 'HeroSent' ? 'out' : 'in';
        const wallet = direction === 'out' 
          ? args.player?.toLowerCase() || args.owner?.toLowerCase()
          : args.receiver?.toLowerCase();
        
        if (!wallet) continue;

        const heroId = args.heroId?.toString() || args.id?.toString();
        const srcChainId = direction === 'out' ? DFK_CHAIN_ID : Number(args.srcChainId || args._srcChainId);
        const dstChainId = direction === 'out' ? Number(args.dstChainId || args._dstChainId) : DFK_CHAIN_ID;

        results.push({
          wallet,
          bridgeType: 'hero',
          direction,
          tokenSymbol: 'HERO',
          assetId: heroId ? BigInt(heroId) : null,
          srcChainId,
          dstChainId,
          txHash: event.transactionHash,
          blockNumber: event.blockNumber,
          blockTimestamp: new Date(block.timestamp * 1000),
        });
      }
    } catch (err) {
      console.error(`[HeroBridge] Error querying ${eventName}:`, err.message);
    }
  }

  return results;
}

export async function indexItemBridge(fromBlock, toBlock, options = {}) {
  const { verbose = false } = options;
  const provider = await getProvider();
  const contract = new ethers.Contract(
    BRIDGE_CONTRACTS.dfkChain.itemBridge.address,
    ITEM_BRIDGE_ABI,
    provider
  );

  const results = [];
  const eventMappings = {
    'ItemSent': { direction: 'out', type: 'item' },
    'ItemReceived': { direction: 'in', type: 'item' },
    'ERC1155Sent': { direction: 'out', type: 'item' },
    'ERC1155Received': { direction: 'in', type: 'item' }
  };

  for (const [eventName, config] of Object.entries(eventMappings)) {
    try {
      const filter = contract.filters[eventName]?.();
      if (!filter) {
        if (verbose) console.log(`[ItemBridge] No filter for ${eventName}`);
        continue;
      }

      const events = await contract.queryFilter(filter, fromBlock, toBlock);
      if (verbose) console.log(`[ItemBridge] Found ${events.length} ${eventName} events`);

      for (const event of events) {
        const block = await provider.getBlock(event.blockNumber);
        const args = event.args;

        const wallet = config.direction === 'out'
          ? args.sender?.toLowerCase() || args.from?.toLowerCase()
          : args.receiver?.toLowerCase() || args.to?.toLowerCase();

        if (!wallet) continue;

        const tokenAddress = args.token?.toLowerCase() || args.tokenContract?.toLowerCase();
        const amount = args.amount?.toString() || args.quantity?.toString();

        const srcChainId = config.direction === 'out' ? DFK_CHAIN_ID : Number(args.srcChainId || args._srcChainId || 0);
        const dstChainId = config.direction === 'out' ? Number(args.dstChainId || args._dstChainId || 0) : DFK_CHAIN_ID;

        results.push({
          wallet,
          bridgeType: config.type,
          direction: config.direction,
          tokenAddress,
          tokenSymbol: tokenAddress ? tokenSymbolFromAddress(tokenAddress) : 'ITEM',
          amount: amount ? amount : null,
          srcChainId,
          dstChainId,
          txHash: event.transactionHash,
          blockNumber: event.blockNumber,
          blockTimestamp: new Date(block.timestamp * 1000),
        });
      }
    } catch (err) {
      console.error(`[ItemBridge] Error querying ${eventName}:`, err.message);
    }
  }

  return results;
}

export async function indexEquipmentBridge(fromBlock, toBlock, options = {}) {
  const { verbose = false } = options;
  const provider = await getProvider();
  const contract = new ethers.Contract(
    BRIDGE_CONTRACTS.dfkChain.equipmentBridge.address,
    EQUIPMENT_BRIDGE_ABI,
    provider
  );

  const results = [];
  const eventMappings = {
    'EquipmentSent': { direction: 'out', type: 'equipment' },
    'EquipmentArrived': { direction: 'in', type: 'equipment' },
    'PetSent': { direction: 'out', type: 'pet' },
    'PetArrived': { direction: 'in', type: 'pet' }
  };

  for (const [eventName, config] of Object.entries(eventMappings)) {
    try {
      const filter = contract.filters[eventName]?.();
      if (!filter) {
        if (verbose) console.log(`[EquipmentBridge] No filter for ${eventName}`);
        continue;
      }

      const events = await contract.queryFilter(filter, fromBlock, toBlock);
      if (verbose) console.log(`[EquipmentBridge] Found ${events.length} ${eventName} events`);

      for (const event of events) {
        const block = await provider.getBlock(event.blockNumber);
        const args = event.args;

        const wallet = config.direction === 'out'
          ? args.player?.toLowerCase() || args.owner?.toLowerCase() || args.sender?.toLowerCase()
          : args.receiver?.toLowerCase();

        if (!wallet) continue;

        const assetId = args.id?.toString() || args.equipmentId?.toString() || args.petId?.toString();
        const srcChainId = config.direction === 'out' ? DFK_CHAIN_ID : Number(args.srcChainId || args._srcChainId || 0);
        const dstChainId = config.direction === 'out' ? Number(args.dstChainId || args._dstChainId || 0) : DFK_CHAIN_ID;

        results.push({
          wallet,
          bridgeType: config.type,
          direction: config.direction,
          tokenSymbol: config.type.toUpperCase(),
          assetId: assetId ? BigInt(assetId) : null,
          srcChainId,
          dstChainId,
          txHash: event.transactionHash,
          blockNumber: event.blockNumber,
          blockTimestamp: new Date(block.timestamp * 1000),
        });
      }
    } catch (err) {
      console.error(`[EquipmentBridge] Error querying ${eventName}:`, err.message);
    }
  }

  return results;
}

export async function indexAllBridges(fromBlock, toBlock, options = {}) {
  const { verbose = false } = options;
  
  if (verbose) console.log(`[BridgeIndexer] Scanning blocks ${fromBlock} to ${toBlock}`);

  const [heroEvents, itemEvents, equipmentEvents] = await Promise.all([
    indexHeroBridge(fromBlock, toBlock, options),
    indexItemBridge(fromBlock, toBlock, options),
    indexEquipmentBridge(fromBlock, toBlock, options)
  ]);

  const allEvents = [...heroEvents, ...itemEvents, ...equipmentEvents];
  
  if (verbose) {
    console.log(`[BridgeIndexer] Found ${allEvents.length} total events`);
    console.log(`  - Heroes: ${heroEvents.length}`);
    console.log(`  - Items: ${itemEvents.length}`);
    console.log(`  - Equipment/Pets: ${equipmentEvents.length}`);
  }

  return allEvents;
}

export async function saveBridgeEvents(events) {
  if (!events.length) return { inserted: 0, skipped: 0 };
  
  let inserted = 0;
  let skipped = 0;

  for (const event of events) {
    try {
      await db.insert(bridgeEvents).values({
        wallet: event.wallet,
        bridgeType: event.bridgeType,
        direction: event.direction,
        tokenAddress: event.tokenAddress || null,
        tokenSymbol: event.tokenSymbol || null,
        amount: event.amount || null,
        assetId: event.assetId ? Number(event.assetId) : null,
        srcChainId: event.srcChainId,
        dstChainId: event.dstChainId,
        txHash: event.txHash,
        blockNumber: Number(event.blockNumber),
        blockTimestamp: event.blockTimestamp,
      }).onConflictDoNothing();
      inserted++;
    } catch (err) {
      if (err.code === '23505') {
        skipped++;
      } else {
        console.error(`[BridgeIndexer] Error inserting event:`, err.message);
      }
    }
  }

  return { inserted, skipped };
}

export async function runFullIndex(options = {}) {
  const { 
    startBlock = null, 
    endBlock = null,
    batchSize = BLOCKS_PER_QUERY,
    verbose = false 
  } = options;

  const provider = await getProvider();
  const latestBlock = await provider.getBlockNumber();
  
  const from = startBlock || latestBlock - 100000;
  const to = endBlock || latestBlock;

  console.log(`[BridgeIndexer] Starting full index from block ${from} to ${to}`);
  
  let totalEvents = 0;
  let totalInserted = 0;

  for (let block = from; block < to; block += batchSize) {
    const batchEnd = Math.min(block + batchSize - 1, to);
    
    try {
      const events = await indexAllBridges(block, batchEnd, { verbose });
      const { inserted, skipped } = await saveBridgeEvents(events);
      
      totalEvents += events.length;
      totalInserted += inserted;
      
      if (verbose || events.length > 0) {
        console.log(`[BridgeIndexer] Blocks ${block}-${batchEnd}: ${events.length} events, ${inserted} inserted`);
      }
    } catch (err) {
      console.error(`[BridgeIndexer] Error in batch ${block}-${batchEnd}:`, err.message);
    }

    await new Promise(r => setTimeout(r, 100));
  }

  console.log(`[BridgeIndexer] Complete. Total: ${totalEvents} events, ${totalInserted} inserted`);
  return { totalEvents, totalInserted };
}

export async function indexWallet(wallet, options = {}) {
  const { verbose = false } = options;
  const normalizedWallet = wallet.toLowerCase();
  
  if (verbose) console.log(`[BridgeIndexer] Indexing wallet ${normalizedWallet}`);
  
  const provider = await getProvider();
  const latestBlock = await provider.getBlockNumber();
  const startBlock = latestBlock - 1000000;
  
  const events = await indexAllBridges(startBlock, latestBlock, { verbose });
  
  const walletEvents = events.filter(e => e.wallet === normalizedWallet);
  
  if (walletEvents.length > 0) {
    await saveBridgeEvents(walletEvents);
  }
  
  if (verbose) {
    console.log(`[BridgeIndexer] Found ${walletEvents.length} events for wallet`);
  }
  
  return walletEvents;
}
