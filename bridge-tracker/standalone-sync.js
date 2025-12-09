#!/usr/bin/env npx tsx
/**
 * Standalone Bridge Sync Script
 * 
 * Runs independently from the main bot to continuously sync bridge events.
 * Progress is stored in the database so it can resume after any interruption.
 * 
 * Supports parallel workers for faster syncing:
 *   - Each worker processes a non-overlapping block range
 *   - Workers track their own progress independently
 * 
 * Usage:
 *   npx tsx bridge-tracker/standalone-sync.js
 *   npx tsx bridge-tracker/standalone-sync.js --batch 10000 --delay 5
 *   npx tsx bridge-tracker/standalone-sync.js --worker 1 --workers-total 4
 */

import 'dotenv/config';
import { 
  runIncrementalBatch, 
  runWorkerBatch,
  getIndexerProgress, 
  initIndexerProgress,
  MAIN_INDEXER_NAME,
  getWorkerIndexerName,
} from './bridge-indexer.js';
import { ethers } from 'ethers';

const RPC_URL = 'https://subnets.avax.network/defi-kingdoms/dfk-chain/rpc';
const GENESIS_BLOCK = 0;

// Parse CLI arguments
const args = process.argv.slice(2);
let batchSize = 10000;
let delayBetweenBatches = 2; // seconds
let maxBatches = Infinity; // run forever by default
let workerId = null; // 1-indexed worker ID
let workersTotal = null; // total number of workers

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--batch' && args[i + 1]) {
    batchSize = parseInt(args[i + 1]);
    i++;
  } else if (args[i] === '--delay' && args[i + 1]) {
    delayBetweenBatches = parseInt(args[i + 1]);
    i++;
  } else if (args[i] === '--max-batches' && args[i + 1]) {
    maxBatches = parseInt(args[i + 1]);
    i++;
  } else if (args[i] === '--worker' && args[i + 1]) {
    workerId = parseInt(args[i + 1]);
    i++;
  } else if (args[i] === '--workers-total' && args[i + 1]) {
    workersTotal = parseInt(args[i + 1]);
    i++;
  } else if (args[i] === '--help') {
    console.log(`
Standalone Bridge Sync Script

Runs continuously to sync bridge events from DFK Chain to the database.
Progress is stored in the database so it resumes automatically after restart.

Usage:
  npx tsx bridge-tracker/standalone-sync.js [options]

Options:
  --batch <size>          Blocks per batch (default: 10000)
  --delay <seconds>       Delay between batches (default: 2)
  --max-batches <num>     Maximum batches to run, then exit (default: infinite)
  --worker <id>           Worker ID (1-indexed, e.g., 1, 2, 3, 4)
  --workers-total <num>   Total number of parallel workers
  --help                  Show this help

Examples:
  # Run continuously (default, single worker)
  npx tsx bridge-tracker/standalone-sync.js

  # Run with larger batches and longer delay
  npx tsx bridge-tracker/standalone-sync.js --batch 20000 --delay 5

  # Run 10 batches then exit
  npx tsx bridge-tracker/standalone-sync.js --max-batches 10

  # Run as worker 1 of 4 parallel workers
  npx tsx bridge-tracker/standalone-sync.js --worker 1 --workers-total 4

  # Run all 4 workers in parallel (each in separate terminal):
  npx tsx bridge-tracker/standalone-sync.js --worker 1 --workers-total 4 &
  npx tsx bridge-tracker/standalone-sync.js --worker 2 --workers-total 4 &
  npx tsx bridge-tracker/standalone-sync.js --worker 3 --workers-total 4 &
  npx tsx bridge-tracker/standalone-sync.js --worker 4 --workers-total 4 &
`);
    process.exit(0);
  }
}

// Validate worker arguments
if ((workerId !== null && workersTotal === null) || (workerId === null && workersTotal !== null)) {
  console.error('Error: --worker and --workers-total must be used together');
  process.exit(1);
}

if (workerId !== null && (workerId < 1 || workerId > workersTotal)) {
  console.error(`Error: --worker must be between 1 and ${workersTotal}`);
  process.exit(1);
}

const isParallelMode = workerId !== null && workersTotal !== null;

async function getLatestBlock() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  return provider.getBlockNumber();
}

async function formatProgress(progress, latestBlock, rangeEnd = null) {
  const targetBlock = rangeEnd || latestBlock;
  const blocksRemaining = targetBlock - progress.lastIndexedBlock;
  const percentComplete = ((progress.lastIndexedBlock / targetBlock) * 100).toFixed(2);
  const batchesRemaining = Math.ceil(blocksRemaining / batchSize);
  const avgBatchTime = progress.totalBatchCount > 0 
    ? (progress.totalBatchRuntimeMs / progress.totalBatchCount / 1000).toFixed(1)
    : 'N/A';
  const etaMinutes = progress.totalBatchCount > 0
    ? Math.round((batchesRemaining * progress.totalBatchRuntimeMs / progress.totalBatchCount) / 60000)
    : 'N/A';

  return {
    lastBlock: progress.lastIndexedBlock.toLocaleString(),
    targetBlock: targetBlock.toLocaleString(),
    blocksRemaining: blocksRemaining.toLocaleString(),
    percentComplete: `${percentComplete}%`,
    totalEvents: (progress.totalEventsIndexed || 0).toLocaleString(),
    batchesCompleted: progress.totalBatchCount || 0,
    batchesRemaining,
    avgBatchTime: `${avgBatchTime}s`,
    etaMinutes: etaMinutes === 'N/A' ? etaMinutes : `${etaMinutes} min`,
  };
}

async function runWorkerSyncLoop() {
  const latestBlock = await getLatestBlock();
  const totalBlocks = latestBlock - GENESIS_BLOCK;
  const blocksPerWorker = Math.ceil(totalBlocks / workersTotal);
  
  const rangeStart = GENESIS_BLOCK + ((workerId - 1) * blocksPerWorker);
  const rangeEnd = Math.min(GENESIS_BLOCK + (workerId * blocksPerWorker), latestBlock);
  
  const indexerName = getWorkerIndexerName(workerId, workersTotal);
  
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(`             PARALLEL BRIDGE SYNC - WORKER ${workerId}/${workersTotal}              `);
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`Batch size: ${batchSize.toLocaleString()} blocks`);
  console.log(`Delay between batches: ${delayBetweenBatches} seconds`);
  console.log(`Block range: ${rangeStart.toLocaleString()} → ${rangeEnd.toLocaleString()}`);
  console.log(`Blocks to process: ${(rangeEnd - rangeStart).toLocaleString()}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Initialize worker-specific progress tracker
  await initIndexerProgress(indexerName, rangeStart);
  
  let batchCount = 0;
  let consecutiveCompletes = 0;

  while (batchCount < maxBatches) {
    try {
      const progress = await getIndexerProgress(indexerName);
      
      // Check if worker has completed its range
      if (progress.lastIndexedBlock >= rangeEnd) {
        console.log(`\n🏁 Worker ${workerId} complete! Processed blocks ${rangeStart.toLocaleString()} → ${rangeEnd.toLocaleString()}`);
        break;
      }
      
      // Show current progress
      const stats = await formatProgress(progress, latestBlock, rangeEnd);
      console.log(`\n[Worker ${workerId}][Batch ${batchCount + 1}] Starting...`);
      console.log(`  📊 Progress: ${stats.percentComplete} (${stats.lastBlock} / ${stats.targetBlock})`);
      console.log(`  📦 Blocks remaining: ${stats.blocksRemaining}`);
      console.log(`  📝 Total events indexed: ${stats.totalEvents}`);
      console.log(`  ⏱️  Avg batch time: ${stats.avgBatchTime} | ETA: ${stats.etaMinutes}`);

      // Run batch with worker range limits
      const result = await runWorkerBatch({ 
        batchSize, 
        indexerName,
        rangeEnd,
      });
      batchCount++;

      if (result.status === 'complete') {
        consecutiveCompletes++;
        console.log(`\n✅ Worker ${workerId} completed its range!`);
        break;
      } else if (result.status === 'success') {
        consecutiveCompletes = 0;
        console.log(`\n✅ Batch complete: ${result.eventsFound} events found, ${result.eventsInserted} new`);
        console.log(`   Blocks: ${result.startBlock.toLocaleString()} → ${result.endBlock.toLocaleString()}`);
        console.log(`   Runtime: ${(result.runtimeMs / 1000).toFixed(1)}s`);
        console.log(`   Remaining: ${result.blocksRemaining.toLocaleString()} blocks`);
        
        // Brief delay between batches
        await new Promise(r => setTimeout(r, delayBetweenBatches * 1000));
      } else if (result.status === 'error') {
        console.error(`\n❌ Batch error: ${result.error}`);
        console.log(`   Retrying in 30 seconds...`);
        await new Promise(r => setTimeout(r, 30000));
      } else if (result.status === 'already_running') {
        console.log(`\n⚠️ Another batch is already running. Waiting...`);
        await new Promise(r => setTimeout(r, 10000));
      }

    } catch (error) {
      console.error(`\n❌ Unexpected error:`, error.message);
      console.log(`   Retrying in 60 seconds...`);
      await new Promise(r => setTimeout(r, 60000));
    }
  }

  console.log(`\n═══════════════════════════════════════════════════════════════`);
  console.log(`                 WORKER ${workerId} SYNC COMPLETE                        `);
  console.log(`  Completed ${batchCount} batches`);
  console.log(`═══════════════════════════════════════════════════════════════\n`);
}

async function runSyncLoop() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('                 STANDALONE BRIDGE SYNC SCRIPT                  ');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`Batch size: ${batchSize.toLocaleString()} blocks`);
  console.log(`Delay between batches: ${delayBetweenBatches} seconds`);
  console.log(`Max batches: ${maxBatches === Infinity ? 'unlimited' : maxBatches}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Initialize progress tracker
  await initIndexerProgress(MAIN_INDEXER_NAME);
  
  let batchCount = 0;
  let consecutiveCompletes = 0;

  while (batchCount < maxBatches) {
    try {
      const progress = await getIndexerProgress(MAIN_INDEXER_NAME);
      const latestBlock = await getLatestBlock();
      
      // Show current progress
      const stats = await formatProgress(progress, latestBlock);
      console.log(`\n[Batch ${batchCount + 1}] Starting...`);
      console.log(`  📊 Progress: ${stats.percentComplete} (${stats.lastBlock} / ${stats.targetBlock})`);
      console.log(`  📦 Blocks remaining: ${stats.blocksRemaining}`);
      console.log(`  📝 Total events indexed: ${stats.totalEvents}`);
      console.log(`  ⏱️  Avg batch time: ${stats.avgBatchTime} | ETA: ${stats.etaMinutes}`);

      // Run batch
      const result = await runIncrementalBatch({ batchSize });
      batchCount++;

      if (result.status === 'complete') {
        consecutiveCompletes++;
        console.log(`\n✅ Caught up with blockchain! (${result.latestBlock.toLocaleString()} blocks)`);
        
        if (consecutiveCompletes >= 3) {
          console.log(`\n🏁 Fully synced! Waiting ${delayBetweenBatches * 5} seconds for new blocks...`);
          await new Promise(r => setTimeout(r, delayBetweenBatches * 5 * 1000));
        } else {
          await new Promise(r => setTimeout(r, delayBetweenBatches * 1000));
        }
      } else if (result.status === 'success') {
        consecutiveCompletes = 0;
        console.log(`\n✅ Batch complete: ${result.eventsFound} events found, ${result.eventsInserted} new`);
        console.log(`   Blocks: ${result.startBlock.toLocaleString()} → ${result.endBlock.toLocaleString()}`);
        console.log(`   Runtime: ${(result.runtimeMs / 1000).toFixed(1)}s`);
        console.log(`   Remaining: ${result.blocksRemaining.toLocaleString()} blocks`);
        
        // Brief delay between batches
        await new Promise(r => setTimeout(r, delayBetweenBatches * 1000));
      } else if (result.status === 'error') {
        console.error(`\n❌ Batch error: ${result.error}`);
        console.log(`   Retrying in 30 seconds...`);
        await new Promise(r => setTimeout(r, 30000));
      } else if (result.status === 'already_running') {
        console.log(`\n⚠️ Another batch is already running. Waiting...`);
        await new Promise(r => setTimeout(r, 10000));
      }

    } catch (error) {
      console.error(`\n❌ Unexpected error:`, error.message);
      console.log(`   Retrying in 60 seconds...`);
      await new Promise(r => setTimeout(r, 60000));
    }
  }

  console.log(`\n═══════════════════════════════════════════════════════════════`);
  console.log(`                    SYNC COMPLETE                               `);
  console.log(`  Completed ${batchCount} batches`);
  console.log(`═══════════════════════════════════════════════════════════════\n`);
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n🛑 Received SIGINT. Finishing current batch and exiting...');
  maxBatches = 0; // Will exit after current batch
});

process.on('SIGTERM', () => {
  console.log('\n\n🛑 Received SIGTERM. Finishing current batch and exiting...');
  maxBatches = 0;
});

// Start the appropriate sync loop
if (isParallelMode) {
  runWorkerSyncLoop().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
} else {
  runSyncLoop().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
