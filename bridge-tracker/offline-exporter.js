#!/usr/bin/env node
/**
 * Offline Bridge Event Exporter
 * 
 * Runs independently to index blockchain bridge events and export to JSON file.
 * Can run on any machine with Node.js - no database required.
 * 
 * Usage:
 *   node bridge-tracker/offline-exporter.js --from 0 --to 1000000 --output bridge-events.json
 *   node bridge-tracker/offline-exporter.js --resume bridge-events.json
 */

import { ethers } from 'ethers';
import * as fs from 'fs';

// ============================================================================
// CONFIGURATION (copied from contracts.js to be standalone)
// ============================================================================

const DFK_CHAIN_ID = 53935;
const RPC_URL = 'https://subnets.avax.network/defi-kingdoms/dfk-chain/rpc';
const SYNAPSE_BRIDGE = '0xE05c976d3f045D0E6E7A6f61083d98A15603cF6A'.toLowerCase();

const TOKEN_ADDRESSES = {
  CRYSTAL: '0x04b9dA42306B023f3572e106B11D82aAd9D32EBb',
  JEWEL: '0xCCb93dABD71c8Dad03Fc4CE5559dC3D89F67a260',
  USDC: '0x3AD9DFE640E1A9Cc1D9B0948620820D975c3803a',
  ETH: '0xfBDF0E31808d0aa7b9509Aa6aBC9754E48C58852',
  AVAX: '0xB57B60DeBDB0b8172bb6316a9164bd3C695F133a',
  BTC: '0x7516EB8B8Edfa420f540a162335eACF3ea05a247',
  KAIA: '0x97855Ba65aa7ed2F65Ed832a776537268158B78a',
  FTM: '0x2Df041186C844F8a2e2b63F16145Bc6Ff7d23E25',
  MATIC: '0xD17a41Cd199edF1093A9Be4404EaDe52Ec19698e'
};

const TOKEN_ADDRESS_TO_SYMBOL = Object.fromEntries(
  Object.entries(TOKEN_ADDRESSES).map(([symbol, addr]) => [addr.toLowerCase(), symbol])
);

const TOKEN_DECIMALS = {
  CRYSTAL: 18, JEWEL: 18, USDC: 18, ETH: 18, AVAX: 18,
  BTC: 8, KAIA: 18, FTM: 18, MATIC: 18
};

const SYNAPSE_EVENTS = {
  TokenDeposit: ethers.id('TokenDeposit(address,uint256,address,uint256)'),
  TokenDepositAndSwap: ethers.id('TokenDepositAndSwap(address,uint256,address,uint256,uint8,uint8,uint256,uint256)'),
  TokenRedeem: ethers.id('TokenRedeem(address,uint256,address,uint256)'),
  TokenRedeemAndSwap: ethers.id('TokenRedeemAndSwap(address,uint256,address,uint256,uint8,uint8,uint256,uint256)'),
  TokenMint: ethers.id('TokenMint(address,address,uint256,uint256,bytes32)'),
  TokenMintAndSwap: ethers.id('TokenMintAndSwap(address,address,uint256,uint256,uint8,uint8,uint256,uint256,bool,bytes32)'),
  TokenWithdraw: ethers.id('TokenWithdraw(address,address,uint256,uint256,bytes32)'),
  TokenWithdrawAndRemove: ethers.id('TokenWithdrawAndRemove(address,address,uint256,uint256,uint8,uint256,uint256,bool,bytes32)')
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function getTokenSymbol(address) {
  return TOKEN_ADDRESS_TO_SYMBOL[address?.toLowerCase()] || 'UNKNOWN';
}

function getTokenDecimals(symbol) {
  return TOKEN_DECIMALS[symbol] || 18;
}

function decodeAddress(topic) {
  if (!topic) return null;
  return '0x' + topic.slice(26).toLowerCase();
}

function decodeUint256(data, offset = 0) {
  const start = 2 + (offset * 64);
  const hex = data.slice(start, start + 64);
  return '0x' + hex;
}

function formatTokenAmount(rawHex, decimals = 18) {
  try {
    const value = BigInt(rawHex);
    const divisor = BigInt(10 ** decimals);
    const wholePart = value / divisor;
    const fractionalPart = value % divisor;
    const fractionalStr = fractionalPart.toString().padStart(decimals, '0').slice(0, 6);
    return `${wholePart}.${fractionalStr}`;
  } catch {
    return '0';
  }
}

// ============================================================================
// INDEXING LOGIC
// ============================================================================

let provider = null;
let blockCache = new Map();

async function getProvider() {
  if (!provider) {
    provider = new ethers.JsonRpcProvider(RPC_URL);
  }
  return provider;
}

async function getBlockTimestamp(blockNumber) {
  if (blockCache.has(blockNumber)) {
    return blockCache.get(blockNumber);
  }
  const p = await getProvider();
  const block = await p.getBlock(blockNumber);
  const timestamp = new Date(block.timestamp * 1000);
  blockCache.set(blockNumber, timestamp);
  
  // Keep cache manageable
  if (blockCache.size > 10000) {
    const keys = [...blockCache.keys()].slice(0, 5000);
    keys.forEach(k => blockCache.delete(k));
  }
  
  return timestamp;
}

async function parseSynapseEvent(log) {
  const topic0 = log.topics[0];
  
  let direction, wallet, tokenAddress, amount, chainId;
  
  try {
    const outboundEvents = [
      SYNAPSE_EVENTS.TokenDeposit, 
      SYNAPSE_EVENTS.TokenDepositAndSwap,
      SYNAPSE_EVENTS.TokenRedeem, 
      SYNAPSE_EVENTS.TokenRedeemAndSwap
    ];
    const inboundEvents = [
      SYNAPSE_EVENTS.TokenMint, 
      SYNAPSE_EVENTS.TokenMintAndSwap,
      SYNAPSE_EVENTS.TokenWithdraw, 
      SYNAPSE_EVENTS.TokenWithdrawAndRemove
    ];
    
    if (outboundEvents.includes(topic0)) {
      direction = 'out';
      wallet = decodeAddress(log.topics[1]);
      const chainIdHex = decodeUint256(log.data, 0);
      chainId = Number(BigInt(chainIdHex));
      tokenAddress = '0x' + log.data.slice(2 + 64 + 24, 2 + 64 + 64).toLowerCase();
      amount = decodeUint256(log.data, 2);
    } else if (inboundEvents.includes(topic0)) {
      direction = 'in';
      wallet = decodeAddress(log.topics[1]);
      tokenAddress = '0x' + log.data.slice(2 + 24, 2 + 64).toLowerCase();
      amount = decodeUint256(log.data, 1);
      chainId = 0;
    } else {
      return null;
    }
    
    const tokenSymbol = getTokenSymbol(tokenAddress);
    const tokenDecimals = getTokenDecimals(tokenSymbol);
    const blockTimestamp = await getBlockTimestamp(log.blockNumber);
    
    return {
      wallet,
      bridgeType: 'token',
      direction,
      tokenAddress,
      tokenSymbol,
      amount: formatTokenAmount(amount, tokenDecimals),
      srcChainId: direction === 'out' ? DFK_CHAIN_ID : chainId || 0,
      dstChainId: direction === 'out' ? chainId || 0 : DFK_CHAIN_ID,
      txHash: log.transactionHash,
      blockNumber: log.blockNumber,
      blockTimestamp: blockTimestamp.toISOString()
    };
  } catch (err) {
    console.error('[SynapseEvent] Parse error:', err.message);
    return null;
  }
}

async function indexBlockRange(fromBlock, toBlock) {
  const p = await getProvider();
  const results = [];
  
  const eventTopics = Object.values(SYNAPSE_EVENTS);
  
  try {
    const filter = {
      address: SYNAPSE_BRIDGE,
      topics: [eventTopics],
      fromBlock,
      toBlock
    };
    
    const logs = await p.getLogs(filter);
    
    for (const log of logs) {
      const event = await parseSynapseEvent(log);
      if (event) {
        results.push(event);
      }
    }
  } catch (err) {
    console.error(`[IndexRange] Error ${fromBlock}-${toBlock}:`, err.message);
  }
  
  return results;
}

// ============================================================================
// FILE I/O
// ============================================================================

function loadExistingExport(filePath) {
  if (!fs.existsSync(filePath)) {
    return { events: [], lastBlock: 0, metadata: {} };
  }
  
  const content = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(content);
}

function saveExport(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// ============================================================================
// MAIN EXPORT FUNCTION
// ============================================================================

async function runExport(options) {
  const {
    fromBlock = 0,
    toBlock = null,
    outputFile = 'bridge-events-export.json',
    batchSize = 2000,
    resume = false
  } = options;
  
  console.log('[OfflineExporter] Starting bridge event export...');
  
  const p = await getProvider();
  const latestBlock = await p.getBlockNumber();
  
  let startBlock = fromBlock;
  let existingEvents = [];
  
  // Handle resume
  if (resume && fs.existsSync(outputFile)) {
    const existing = loadExistingExport(outputFile);
    existingEvents = existing.events || [];
    startBlock = (existing.lastBlock || 0) + 1;
    console.log(`[OfflineExporter] Resuming from block ${startBlock} (${existingEvents.length} events already exported)`);
  }
  
  const endBlock = toBlock || latestBlock;
  const totalBlocks = endBlock - startBlock;
  
  console.log(`[OfflineExporter] Indexing blocks ${startBlock} to ${endBlock} (${totalBlocks.toLocaleString()} blocks)`);
  console.log(`[OfflineExporter] Output file: ${outputFile}`);
  
  let allEvents = [...existingEvents];
  let processedBlocks = 0;
  let lastSaveBlock = startBlock;
  
  const startTime = Date.now();
  
  for (let block = startBlock; block <= endBlock; block += batchSize) {
    const batchEnd = Math.min(block + batchSize - 1, endBlock);
    
    try {
      const events = await indexBlockRange(block, batchEnd);
      allEvents.push(...events);
      
      processedBlocks += (batchEnd - block + 1);
      const progress = ((processedBlocks / totalBlocks) * 100).toFixed(2);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      const blocksPerSec = (processedBlocks / (elapsed || 1)).toFixed(1);
      const eta = ((totalBlocks - processedBlocks) / (blocksPerSec || 1) / 60).toFixed(1);
      
      console.log(`[OfflineExporter] ${progress}% | Block ${batchEnd.toLocaleString()} | ${allEvents.length} events | ${blocksPerSec} b/s | ETA: ${eta}min`);
      
      // Save checkpoint every 50k blocks
      if (batchEnd - lastSaveBlock >= 50000) {
        console.log(`[OfflineExporter] Saving checkpoint at block ${batchEnd}...`);
        saveExport(outputFile, {
          events: allEvents,
          lastBlock: batchEnd,
          metadata: {
            exportedAt: new Date().toISOString(),
            fromBlock: fromBlock,
            toBlock: batchEnd,
            totalEvents: allEvents.length
          }
        });
        lastSaveBlock = batchEnd;
      }
      
    } catch (err) {
      console.error(`[OfflineExporter] Error in batch ${block}-${batchEnd}:`, err.message);
      // Save what we have so far
      saveExport(outputFile, {
        events: allEvents,
        lastBlock: block - 1,
        metadata: {
          exportedAt: new Date().toISOString(),
          fromBlock: fromBlock,
          toBlock: block - 1,
          totalEvents: allEvents.length,
          error: err.message
        }
      });
      throw err;
    }
    
    // Rate limit
    await new Promise(r => setTimeout(r, 50));
  }
  
  // Final save
  const finalData = {
    events: allEvents,
    lastBlock: endBlock,
    metadata: {
      exportedAt: new Date().toISOString(),
      fromBlock: resume ? 0 : fromBlock,
      toBlock: endBlock,
      totalEvents: allEvents.length,
      runtimeSeconds: Math.round((Date.now() - startTime) / 1000)
    }
  };
  
  saveExport(outputFile, finalData);
  
  console.log(`\n[OfflineExporter] Export complete!`);
  console.log(`[OfflineExporter] Total events: ${allEvents.length}`);
  console.log(`[OfflineExporter] Block range: ${fromBlock} - ${endBlock}`);
  console.log(`[OfflineExporter] Output: ${outputFile}`);
  console.log(`[OfflineExporter] Runtime: ${Math.round((Date.now() - startTime) / 1000)}s`);
  
  return finalData;
}

// ============================================================================
// CLI
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  
  const options = {
    fromBlock: 0,
    toBlock: null,
    outputFile: 'bridge-events-export.json',
    batchSize: 2000,
    resume: false
  };
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--from' && args[i + 1]) {
      options.fromBlock = parseInt(args[i + 1]);
      i++;
    } else if (args[i] === '--to' && args[i + 1]) {
      options.toBlock = parseInt(args[i + 1]);
      i++;
    } else if (args[i] === '--output' && args[i + 1]) {
      options.outputFile = args[i + 1];
      i++;
    } else if (args[i] === '--batch' && args[i + 1]) {
      options.batchSize = parseInt(args[i + 1]);
      i++;
    } else if (args[i] === '--resume') {
      options.resume = true;
      if (args[i + 1] && !args[i + 1].startsWith('--')) {
        options.outputFile = args[i + 1];
        i++;
      }
    } else if (args[i] === '--help') {
      console.log(`
Offline Bridge Event Exporter

Usage:
  node bridge-tracker/offline-exporter.js [options]

Options:
  --from <block>    Start block (default: 0)
  --to <block>      End block (default: latest)
  --output <file>   Output JSON file (default: bridge-events-export.json)
  --batch <size>    Blocks per RPC query (default: 2000)
  --resume [file]   Resume from existing export file
  --help            Show this help

Examples:
  # Export all events from genesis to latest
  node bridge-tracker/offline-exporter.js --output full-export.json

  # Export specific block range
  node bridge-tracker/offline-exporter.js --from 0 --to 10000000

  # Resume interrupted export
  node bridge-tracker/offline-exporter.js --resume full-export.json
`);
      process.exit(0);
    }
  }
  
  try {
    await runExport(options);
  } catch (err) {
    console.error('[OfflineExporter] Fatal error:', err);
    process.exit(1);
  }
}

main();
