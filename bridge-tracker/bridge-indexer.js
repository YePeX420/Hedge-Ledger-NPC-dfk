import { ethers } from 'ethers';
import { db } from '../server/db.js';
import { bridgeEvents } from '../shared/schema.js';
import { DFK_CHAIN_ID, TOKEN_ADDRESSES, TOKEN_DECIMALS, KNOWN_BRIDGE_ADDRESSES } from './contracts.js';
import { eq, desc } from 'drizzle-orm';

const RPC_URL = 'https://subnets.avax.network/defi-kingdoms/dfk-chain/rpc';
const BLOCKS_PER_QUERY = 2000;

const ERC20_TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

const TOKEN_CONFIG = Object.entries(TOKEN_ADDRESSES.dfkChain).map(([symbol, address]) => ({
  symbol,
  address: address.toLowerCase(),
  decimals: TOKEN_DECIMALS[symbol] || 18
}));

function getTokenSymbol(address) {
  const token = TOKEN_CONFIG.find(t => t.address === address.toLowerCase());
  return token?.symbol || 'UNKNOWN';
}

function getTokenDecimals(symbol) {
  return TOKEN_DECIMALS[symbol] || 18;
}

function isBridgeAddress(address) {
  return KNOWN_BRIDGE_ADDRESSES.has(address.toLowerCase());
}

export async function getProvider() {
  return new ethers.JsonRpcProvider(RPC_URL);
}

export async function getLatestBlock() {
  const provider = await getProvider();
  return provider.getBlockNumber();
}

export async function indexTokenTransfers(fromBlock, toBlock, options = {}) {
  const { verbose = false, minAmountUsd = 10 } = options;
  const provider = await getProvider();
  
  const results = [];
  
  for (const token of TOKEN_CONFIG) {
    try {
      const filter = {
        address: token.address,
        topics: [ERC20_TRANSFER_TOPIC],
        fromBlock,
        toBlock
      };
      
      const logs = await provider.getLogs(filter);
      
      if (verbose && logs.length > 0) {
        console.log(`[TokenIndex] ${token.symbol}: ${logs.length} transfers in blocks ${fromBlock}-${toBlock}`);
      }
      
      for (const log of logs) {
        try {
          const from = '0x' + log.topics[1].slice(26).toLowerCase();
          const to = '0x' + log.topics[2].slice(26).toLowerCase();
          const rawValue = log.data;
          
          const fromIsBridge = isBridgeAddress(from);
          const toIsBridge = isBridgeAddress(to);
          
          if (!fromIsBridge && !toIsBridge) continue;
          
          let direction, wallet;
          if (fromIsBridge && !toIsBridge) {
            direction = 'in';
            wallet = to;
          } else if (!fromIsBridge && toIsBridge) {
            direction = 'out';
            wallet = from;
          } else {
            continue;
          }
          
          const block = await provider.getBlock(log.blockNumber);
          
          results.push({
            wallet,
            bridgeType: 'token',
            direction,
            tokenAddress: token.address,
            tokenSymbol: token.symbol,
            amount: rawValue,
            srcChainId: direction === 'in' ? 0 : DFK_CHAIN_ID,
            dstChainId: direction === 'in' ? DFK_CHAIN_ID : 0,
            txHash: log.transactionHash,
            blockNumber: log.blockNumber,
            blockTimestamp: new Date(block.timestamp * 1000),
          });
        } catch (err) {
          if (verbose) console.error(`[TokenIndex] Error processing log:`, err.message);
        }
      }
    } catch (err) {
      console.error(`[TokenIndex] Error querying ${token.symbol}:`, err.message);
    }
  }
  
  return results;
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
        assetId: null,
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

  console.log(`[BridgeIndexer] Starting token index from block ${from} to ${to}`);
  
  let totalEvents = 0;
  let totalInserted = 0;

  for (let block = from; block < to; block += batchSize) {
    const batchEnd = Math.min(block + batchSize - 1, to);
    
    try {
      const events = await indexTokenTransfers(block, batchEnd, { verbose });
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
  const { verbose = false, lookbackBlocks = 500000 } = options;
  const normalizedWallet = wallet.toLowerCase();
  
  if (verbose) console.log(`[BridgeIndexer] Indexing wallet ${normalizedWallet} on-chain`);
  
  const provider = await getProvider();
  const latestBlock = await provider.getBlockNumber();
  const startBlock = latestBlock - lookbackBlocks;
  
  const allEvents = [];
  
  for (const token of TOKEN_CONFIG) {
    try {
      const filter = {
        address: token.address,
        topics: [ERC20_TRANSFER_TOPIC],
        fromBlock: startBlock,
        toBlock: latestBlock
      };
      
      const logs = await provider.getLogs(filter);
      
      for (const log of logs) {
        try {
          const from = '0x' + log.topics[1].slice(26).toLowerCase();
          const to = '0x' + log.topics[2].slice(26).toLowerCase();
          
          if (from !== normalizedWallet && to !== normalizedWallet) continue;
          
          const fromIsBridge = isBridgeAddress(from);
          const toIsBridge = isBridgeAddress(to);
          
          if (!fromIsBridge && !toIsBridge) continue;
          
          let direction, eventWallet;
          if (fromIsBridge && to === normalizedWallet) {
            direction = 'in';
            eventWallet = to;
          } else if (from === normalizedWallet && toIsBridge) {
            direction = 'out';
            eventWallet = from;
          } else {
            continue;
          }
          
          const rawValue = log.data;
          const block = await provider.getBlock(log.blockNumber);
          
          allEvents.push({
            wallet: eventWallet,
            bridgeType: 'token',
            direction,
            tokenAddress: token.address,
            tokenSymbol: token.symbol,
            amount: rawValue,
            srcChainId: direction === 'in' ? 0 : DFK_CHAIN_ID,
            dstChainId: direction === 'in' ? DFK_CHAIN_ID : 0,
            txHash: log.transactionHash,
            blockNumber: log.blockNumber,
            blockTimestamp: new Date(block.timestamp * 1000),
          });
        } catch (err) {
          if (verbose) console.error(`[BridgeIndexer] Error processing log:`, err.message);
        }
      }
      
      if (verbose && allEvents.length > 0) {
        console.log(`[BridgeIndexer] ${token.symbol}: Found ${allEvents.length} bridge events for wallet`);
      }
    } catch (err) {
      console.error(`[BridgeIndexer] Error querying ${token.symbol}:`, err.message);
    }
  }
  
  if (allEvents.length > 0) {
    await saveBridgeEvents(allEvents);
  }
  
  if (verbose) {
    console.log(`[BridgeIndexer] Indexed ${allEvents.length} events for wallet ${normalizedWallet}`);
  }
  
  return allEvents;
}
