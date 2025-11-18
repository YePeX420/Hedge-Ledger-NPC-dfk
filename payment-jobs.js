/**
 * Payment Jobs Service
 * 
 * In-memory registry of active payment jobs for per-job fast scanning.
 * Prevents global historical backlog from blocking 2-hour payment windows.
 * 
 * Architecture:
 * - Each job tracks its own startBlock and lastScannedBlock
 * - Scanner checks ONLY blocks from job.startBlock → latestBlock
 * - Jobs auto-expire after 2 hours if payment not received
 * - Manual trigger available for fast-track verification
 */

import { db } from './server/db.js';
import { gardenOptimizations } from './shared/schema.js';
import { eq } from 'drizzle-orm';

// Active jobs registry: Map<jobId, jobData>
const activeJobs = new Map();

/**
 * Job data structure:
 * {
 *   jobId: number,
 *   playerId: number,
 *   fromWallet: string,
 *   expectedAmount: string,
 *   startBlock: number,
 *   lastScannedBlock: number,
 *   expiresAt: Date,
 *   createdAt: Date
 * }
 */

/**
 * Load active payment jobs from database on startup
 * Loads all 'awaiting_payment' jobs
 */
export async function loadActiveJobs() {
  try {
    const pending = await db
      .select()
      .from(gardenOptimizations)
      .where(eq(gardenOptimizations.status, 'awaiting_payment'));
    
    let loaded = 0;
    const now = new Date();
    
    for (const job of pending) {
      // Skip expired jobs
      if (new Date(job.expiresAt) < now) {
        console.log(`[PaymentJobs] Skipping expired job #${job.id}`);
        continue;
      }
      
      // Register active job
      activeJobs.set(job.id, {
        jobId: job.id,
        playerId: job.playerId,
        fromWallet: job.fromWallet.toLowerCase(),
        expectedAmount: job.expectedAmountJewel,
        startBlock: job.startBlock || 0,
        lastScannedBlock: job.lastScannedBlock || (job.startBlock - 1) || 0,
        expiresAt: new Date(job.expiresAt),
        createdAt: new Date(job.requestedAt)
      });
      
      loaded++;
    }
    
    console.log(`[PaymentJobs] Loaded ${loaded} active payment jobs`);
    return loaded;
  } catch (err) {
    console.error('[PaymentJobs] Error loading active jobs:', err.message);
    return 0;
  }
}

/**
 * Register a new payment job
 * Called when user creates a garden optimization request
 * 
 * @param {object} jobData - Job data from database
 * @returns {void}
 */
export function registerJob(jobData) {
  const job = {
    jobId: jobData.id,
    playerId: jobData.playerId,
    fromWallet: jobData.fromWallet.toLowerCase(),
    expectedAmount: jobData.expectedAmountJewel,
    startBlock: jobData.startBlock || 0,
    lastScannedBlock: jobData.lastScannedBlock || (jobData.startBlock - 1) || 0,
    expiresAt: new Date(jobData.expiresAt),
    createdAt: new Date(jobData.requestedAt)
  };
  
  activeJobs.set(job.jobId, job);
  console.log(`[PaymentJobs] Registered job #${job.jobId} (expires: ${job.expiresAt.toISOString()})`);
}

/**
 * Cancel/remove a job from active registry
 * Called when payment verified or job expired
 * 
 * @param {number} jobId - Job ID to cancel
 * @returns {boolean} - True if job was removed
 */
export function cancelJob(jobId) {
  const removed = activeJobs.delete(jobId);
  if (removed) {
    console.log(`[PaymentJobs] Cancelled job #${jobId}`);
  }
  return removed;
}

/**
 * Get all active jobs
 * @returns {Array} - Array of active job objects
 */
export function getActiveJobs() {
  return Array.from(activeJobs.values());
}

/**
 * Get specific job by ID
 * @param {number} jobId - Job ID
 * @returns {object|null} - Job data or null
 */
export function getJob(jobId) {
  return activeJobs.get(jobId) || null;
}

/**
 * Update job's lastScannedBlock
 * @param {number} jobId - Job ID
 * @param {number} blockNumber - New lastScannedBlock value
 */
export function updateLastScannedBlock(jobId, blockNumber) {
  const job = activeJobs.get(jobId);
  if (job) {
    job.lastScannedBlock = blockNumber;
  }
}

/**
 * Get count of active jobs
 * @returns {number} - Number of active jobs
 */
export function getActiveJobCount() {
  return activeJobs.size;
}

/**
 * Remove expired jobs from registry
 * @returns {number} - Number of jobs removed
 */
export function cleanupExpiredJobs() {
  const now = new Date();
  let removed = 0;
  
  for (const [jobId, job] of activeJobs.entries()) {
    if (job.expiresAt < now) {
      activeJobs.delete(jobId);
      removed++;
      console.log(`[PaymentJobs] Cleaned up expired job #${jobId}`);
    }
  }
  
  return removed;
}
