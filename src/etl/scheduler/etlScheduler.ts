import cron from 'node-cron';
import { etlService } from '../services/EtlService.js';

let schedulerStarted = false;
let lastScheduledRunAt: Date | null = null;
let scheduledRunCount = 0;

export function startEtlScheduler(): void {
  if (schedulerStarted) {
    console.log('[ETL Scheduler] Already started, skipping');
    return;
  }
  
  schedulerStarted = true;
  console.log('[ETL Scheduler] Starting ETL scheduler');
  
  cron.schedule('0 */6 * * *', async () => {
    console.log('[ETL Scheduler] Running scheduled incremental ETL (every 6 hours)');
    scheduledRunCount++;
    lastScheduledRunAt = new Date();
    
    try {
      await etlService.runIncremental();
      console.log('[ETL Scheduler] Scheduled incremental ETL complete');
    } catch (err) {
      console.error('[ETL Scheduler] Scheduled ETL failed:', err);
    }
  });
  
  cron.schedule('0 4 * * *', async () => {
    console.log('[ETL Scheduler] Running daily snapshot ETL (04:00 UTC)');
    scheduledRunCount++;
    lastScheduledRunAt = new Date();
    
    try {
      await etlService.runDailySnapshot();
      console.log('[ETL Scheduler] Daily snapshot ETL complete');
    } catch (err) {
      console.error('[ETL Scheduler] Daily snapshot ETL failed:', err);
    }
  });
  
  console.log('[ETL Scheduler] Scheduled tasks:');
  console.log('  - Incremental ETL: every 6 hours (0 */6 * * *)');
  console.log('  - Daily snapshot: 04:00 UTC (0 4 * * *)');
}

export function getSchedulerStatus() {
  return {
    started: schedulerStarted,
    lastScheduledRunAt,
    scheduledRunCount,
    etlStatus: etlService.getStatus(),
  };
}

export async function triggerManualRun(type: 'incremental' | 'full' = 'incremental'): Promise<{
  success: boolean;
  message: string;
  walletsProcessed?: number;
}> {
  const status = etlService.getStatus();
  
  if (status.isRunning) {
    return {
      success: false,
      message: 'ETL is already running',
    };
  }
  
  try {
    if (type === 'full') {
      await etlService.runDailySnapshot();
      return {
        success: true,
        message: 'Full ETL run completed',
      };
    } else {
      await etlService.runIncremental();
      return {
        success: true,
        message: 'Incremental ETL run completed',
      };
    }
  } catch (err) {
    return {
      success: false,
      message: `ETL failed: ${(err as Error).message}`,
    };
  }
}
