// src/etl/services/EtlScheduler.ts
// Schedules ETL jobs

import cron from 'node-cron';
import { etlService } from './EtlService.js';
import { DEFAULT_ETL_CONFIG } from '../types.js';

export class EtlScheduler {
  private incrementalTask: ReturnType<typeof cron.schedule> | null = null;
  private dailySnapshotTask: ReturnType<typeof cron.schedule> | null = null;
  private isStarted: boolean = false;
  
  start(): void {
    if (this.isStarted) {
      console.log(`[EtlScheduler] Already started, skipping`);
      return;
    }
    
    console.log(`[EtlScheduler] Starting ETL scheduler...`);
    
    const incrementalCron = `*/${DEFAULT_ETL_CONFIG.incrementalIntervalMinutes} * * * *`;
    this.incrementalTask = cron.schedule(incrementalCron, async () => {
      console.log(`[EtlScheduler] Running incremental ETL...`);
      try {
        await etlService.runIncremental();
      } catch (err) {
        console.error(`[EtlScheduler] Incremental ETL failed:`, err);
      }
    });
    this.incrementalTask.stop();
    
    this.dailySnapshotTask = cron.schedule(DEFAULT_ETL_CONFIG.fullSnapshotCron, async () => {
      console.log(`[EtlScheduler] Running daily snapshot ETL...`);
      try {
        await etlService.runDailySnapshot();
      } catch (err) {
        console.error(`[EtlScheduler] Daily snapshot ETL failed:`, err);
      }
    });
    this.dailySnapshotTask.stop();
    
    this.incrementalTask.start();
    this.dailySnapshotTask.start();
    
    this.isStarted = true;
    console.log(`[EtlScheduler] ETL scheduler started:`);
    console.log(`  - Incremental: every ${DEFAULT_ETL_CONFIG.incrementalIntervalMinutes} minutes`);
    console.log(`  - Daily snapshot: ${DEFAULT_ETL_CONFIG.fullSnapshotCron}`);
  }
  
  stop(): void {
    if (!this.isStarted) {
      console.log(`[EtlScheduler] Not started, nothing to stop`);
      return;
    }
    
    if (this.incrementalTask) {
      this.incrementalTask.stop();
      this.incrementalTask = null;
    }
    
    if (this.dailySnapshotTask) {
      this.dailySnapshotTask.stop();
      this.dailySnapshotTask = null;
    }
    
    this.isStarted = false;
    console.log(`[EtlScheduler] ETL scheduler stopped`);
  }
  
  getStatus(): { isStarted: boolean } {
    return { isStarted: this.isStarted };
  }
  
  async triggerIncremental(): Promise<void> {
    console.log(`[EtlScheduler] Manually triggering incremental ETL...`);
    await etlService.runIncremental();
  }
  
  async triggerDailySnapshot(): Promise<void> {
    console.log(`[EtlScheduler] Manually triggering daily snapshot ETL...`);
    await etlService.runDailySnapshot();
  }
}

export const etlScheduler = new EtlScheduler();
