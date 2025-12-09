// src/etl/index.ts
// ETL subsystem main entry point

export * from './types.js';
export * from './extractors/index.js';
export * from './transformers/index.js';
export * from './loaders/index.js';
export { EtlService, etlService } from './services/EtlService.js';
export { EtlScheduler, etlScheduler } from './services/EtlScheduler.js';

import { etlScheduler } from './services/EtlScheduler.js';
import { etlService } from './services/EtlService.js';

export function initializeEtl(): void {
  console.log(`[ETL] Initializing ETL subsystem...`);
  
  if (process.env.ETL_SCHEDULER_ENABLED === 'true') {
    etlScheduler.start();
  } else {
    console.log(`[ETL] Scheduler disabled (set ETL_SCHEDULER_ENABLED=true to enable)`);
  }
}

export async function runEtlForWallet(wallet: string): Promise<void> {
  await etlService.runForWallet(wallet);
}

export async function runEtlForCluster(clusterKey: string): Promise<void> {
  await etlService.runForCluster(clusterKey);
}

export async function warmupWallet(wallet: string): Promise<void> {
  await etlService.warmupWallet(wallet);
}
