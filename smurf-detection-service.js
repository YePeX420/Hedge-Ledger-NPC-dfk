/**
 * Smurf Detection Service
 * 
 * Detects potential smurf accounts in league signups by analyzing:
 * - Power score history and sudden spikes
 * - Transfer patterns (heroes/tokens coming in before signup)
 * - Multi-wallet clusters with high-tier wallets
 * - Tier manipulation attempts
 */

import { db } from './server/db.js';
import {
  smurfDetectionRules,
  smurfIncidents,
  walletPowerSnapshots,
  walletTransferAggregates,
  walletClusters,
  walletLinks,
  seasonTierLocks,
} from './shared/schema.js';
import { eq, and, gte, lte, desc } from 'drizzle-orm';

// Tier hierarchy for escalation logic
const TIER_ORDER = ['COMMON', 'UNCOMMON', 'RARE', 'LEGENDARY', 'MYTHIC'];

/**
 * @typedef {'NONE' | 'ESCALATE_TIER' | 'DISQUALIFY' | 'FLAG_REVIEW'} SmurfAction
 */

/**
 * @typedef {'INFO' | 'WARN' | 'CRITICAL'} Severity
 */

/**
 * @typedef {Object} SmurfIncidentDTO
 * @property {number} [id]
 * @property {string} ruleKey
 * @property {Severity} severity
 * @property {SmurfAction} actionTaken
 * @property {string} reason
 * @property {Object} [details]
 * @property {string} [createdAt]
 */

/**
 * @typedef {Object} SmurfCheckResult
 * @property {SmurfAction} finalAction
 * @property {SmurfIncidentDTO[]} incidents
 * @property {string} [adjustedTierCode]
 * @property {boolean} [disqualified]
 * @property {string} [disqualificationReason]
 */

/**
 * Get tier index for comparison
 * @param {string} tierCode 
 * @returns {number}
 */
function getTierIndex(tierCode) {
  const idx = TIER_ORDER.indexOf(tierCode?.toUpperCase());
  return idx >= 0 ? idx : 0;
}

/**
 * Get the next higher tier
 * @param {string} currentTier 
 * @returns {string}
 */
function escalateTier(currentTier) {
  const idx = getTierIndex(currentTier);
  const nextIdx = Math.min(idx + 1, TIER_ORDER.length - 1);
  return TIER_ORDER[nextIdx];
}

/**
 * Load all enabled smurf detection rules
 * @returns {Promise<Array>}
 */
async function loadActiveRules() {
  const rules = await db
    .select()
    .from(smurfDetectionRules)
    .where(eq(smurfDetectionRules.enabled, true));
  return rules;
}

/**
 * Get recent power snapshots for a cluster
 * @param {string} clusterKey 
 * @param {number} windowDays 
 * @returns {Promise<Array>}
 */
async function getRecentPowerSnapshots(clusterKey, windowDays = 30) {
  const windowStart = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  return db
    .select()
    .from(walletPowerSnapshots)
    .where(
      and(
        eq(walletPowerSnapshots.clusterKey, clusterKey),
        gte(walletPowerSnapshots.takenAt, windowStart)
      )
    )
    .orderBy(desc(walletPowerSnapshots.takenAt));
}

/**
 * Get recent transfer aggregates for a wallet
 * @param {string} address 
 * @param {number} windowDays 
 * @returns {Promise<Array>}
 */
async function getRecentTransfers(address, windowDays = 14) {
  const windowStart = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  return db
    .select()
    .from(walletTransferAggregates)
    .where(
      and(
        eq(walletTransferAggregates.address, address.toLowerCase()),
        gte(walletTransferAggregates.windowEnd, windowStart)
      )
    );
}

/**
 * Get all wallet links in a cluster
 * @param {string} clusterKey 
 * @returns {Promise<Array>}
 */
async function getClusterWallets(clusterKey) {
  return db
    .select()
    .from(walletLinks)
    .where(
      and(
        eq(walletLinks.clusterKey, clusterKey),
        eq(walletLinks.isActive, true)
      )
    );
}

/**
 * Record a smurf incident in the database
 * @param {Object} incident 
 * @returns {Promise<Object>}
 */
async function recordIncident(incident) {
  const [inserted] = await db
    .insert(smurfIncidents)
    .values({
      clusterKey: incident.clusterKey,
      seasonId: incident.seasonId,
      walletAddress: incident.walletAddress,
      ruleKey: incident.ruleKey,
      severity: incident.severity,
      actionTaken: incident.actionTaken,
      reason: incident.reason,
      details: incident.details,
    })
    .returning();
  return inserted;
}

/**
 * Evaluate a single rule against player data
 * @param {Object} rule 
 * @param {Object} context 
 * @returns {Promise<SmurfIncidentDTO | null>}
 */
async function evaluateRule(rule, context) {
  const { clusterKey, walletAddress, seasonId, powerSnapshots, transfers, clusterWallets } = context;
  const config = rule.config || {};

  switch (rule.key) {
    case 'INBOUND_POWER_SPIKE': {
      // Check for sudden power increase before signup
      const threshold = config.threshold || 500;
      const totalInbound = transfers.reduce((sum, t) => sum + (t.inboundPowerDelta || 0), 0);
      
      if (totalInbound >= threshold) {
        return {
          ruleKey: rule.key,
          severity: rule.severity,
          actionTaken: rule.defaultAction,
          reason: `Inbound power spike of ${totalInbound} detected (threshold: ${threshold})`,
          details: { powerDelta: totalInbound, threshold },
        };
      }
      break;
    }

    case 'POWER_JUMP_AFTER_TIER_LOCK': {
      // Check if power increased significantly after tier was locked
      if (powerSnapshots.length < 2) return null;
      
      const newest = powerSnapshots[0];
      const oldest = powerSnapshots[powerSnapshots.length - 1];
      const powerJump = newest.powerScore - oldest.powerScore;
      const threshold = config.threshold || 300;
      
      if (powerJump >= threshold) {
        return {
          ruleKey: rule.key,
          severity: rule.severity,
          actionTaken: rule.defaultAction,
          reason: `Power jumped by ${powerJump} since tier lock (threshold: ${threshold})`,
          details: {
            oldPower: oldest.powerScore,
            newPower: newest.powerScore,
            powerDelta: powerJump,
            oldTier: oldest.tierCode,
            newTier: newest.tierCode,
          },
        };
      }
      break;
    }

    case 'MULTI_WALLET_CLUSTER_SMURF': {
      // Check if cluster has other high-tier wallets
      const tierThreshold = config.tierThreshold || 'LEGENDARY';
      const thresholdIdx = getTierIndex(tierThreshold);
      
      // Get power snapshots for all wallets in cluster
      const highTierWallets = [];
      for (const wallet of clusterWallets) {
        const snapshots = await db
          .select()
          .from(walletPowerSnapshots)
          .where(eq(walletPowerSnapshots.address, wallet.address.toLowerCase()))
          .orderBy(desc(walletPowerSnapshots.takenAt))
          .limit(1);
        
        if (snapshots.length > 0 && getTierIndex(snapshots[0].tierCode) >= thresholdIdx) {
          highTierWallets.push({
            address: wallet.address,
            tier: snapshots[0].tierCode,
          });
        }
      }

      if (highTierWallets.length > 0 && !highTierWallets.some(w => w.address.toLowerCase() === walletAddress.toLowerCase())) {
        return {
          ruleKey: rule.key,
          severity: rule.severity,
          actionTaken: rule.defaultAction,
          reason: `Cluster contains ${highTierWallets.length} wallet(s) at ${tierThreshold}+ tier`,
          details: { highTierWallets },
        };
      }
      break;
    }

    case 'DISQUALIFY_ON_INBOUND_DURING_FREEZE': {
      // Disqualify if significant inbound transfers during freeze window
      const threshold = config.threshold || 200;
      const freezeWindowDays = config.freezeWindowDays || 7;
      
      // Get transfers in freeze window only
      const freezeStart = new Date(Date.now() - freezeWindowDays * 24 * 60 * 60 * 1000);
      const freezeTransfers = transfers.filter(t => new Date(t.windowEnd) >= freezeStart);
      const totalInbound = freezeTransfers.reduce((sum, t) => sum + (t.inboundPowerDelta || 0), 0);

      if (totalInbound >= threshold) {
        return {
          ruleKey: rule.key,
          severity: 'CRITICAL',
          actionTaken: 'DISQUALIFY',
          reason: `Inbound power of ${totalInbound} during freeze window (${freezeWindowDays} days before signup)`,
          details: { powerDelta: totalInbound, threshold, freezeWindowDays },
        };
      }
      break;
    }

    default:
      console.log(`[SmurfDetection] Unknown rule key: ${rule.key}`);
  }

  return null;
}

/**
 * Run pre-season smurf checks before allowing signup
 * 
 * @param {Object} options
 * @param {string} options.userId - Discord user ID
 * @param {string} options.clusterKey - Wallet cluster key
 * @param {number} options.seasonId - Season ID
 * @param {string} options.walletAddress - Wallet address being registered
 * @returns {Promise<SmurfCheckResult>}
 */
export async function runPreSeasonChecks({ userId, clusterKey, seasonId, walletAddress }) {
  console.log(`[SmurfDetection] Running pre-season checks for cluster=${clusterKey}, wallet=${walletAddress}`);
  
  const rules = await loadActiveRules();
  const powerSnapshots = await getRecentPowerSnapshots(clusterKey, 30);
  const transfers = await getRecentTransfers(walletAddress, 14);
  const clusterWallets = await getClusterWallets(clusterKey);

  const context = {
    userId,
    clusterKey,
    seasonId,
    walletAddress: walletAddress.toLowerCase(),
    powerSnapshots,
    transfers,
    clusterWallets,
  };

  /** @type {SmurfIncidentDTO[]} */
  const incidents = [];
  let finalAction = 'NONE';
  let adjustedTierCode = null;
  let disqualified = false;
  let disqualificationReason = null;

  // Evaluate each rule
  for (const rule of rules) {
    try {
      const incident = await evaluateRule(rule, context);
      if (incident) {
        // Record in database
        const recorded = await recordIncident({
          ...incident,
          clusterKey,
          seasonId,
          walletAddress: walletAddress.toLowerCase(),
        });
        
        incidents.push({
          id: recorded.id,
          ...incident,
          createdAt: recorded.createdAt?.toISOString(),
        });

        // Update final action based on priority
        if (incident.actionTaken === 'DISQUALIFY') {
          finalAction = 'DISQUALIFY';
          disqualified = true;
          disqualificationReason = incident.reason;
        } else if (incident.actionTaken === 'ESCALATE_TIER' && finalAction !== 'DISQUALIFY') {
          finalAction = 'ESCALATE_TIER';
        } else if (incident.actionTaken === 'FLAG_REVIEW' && finalAction === 'NONE') {
          finalAction = 'FLAG_REVIEW';
        }
      }
    } catch (err) {
      console.error(`[SmurfDetection] Error evaluating rule ${rule.key}:`, err);
    }
  }

  // If escalating, determine new tier
  if (finalAction === 'ESCALATE_TIER' && powerSnapshots.length > 0) {
    const currentTier = powerSnapshots[0].tierCode;
    adjustedTierCode = escalateTier(currentTier);
    console.log(`[SmurfDetection] Escalating tier: ${currentTier} -> ${adjustedTierCode}`);
  }

  console.log(`[SmurfDetection] Pre-season check complete: action=${finalAction}, incidents=${incidents.length}`);

  return {
    finalAction,
    incidents,
    adjustedTierCode,
    disqualified,
    disqualificationReason,
  };
}

/**
 * Run in-season checks for ongoing monitoring
 * 
 * @param {Object} options
 * @param {string} options.clusterKey - Wallet cluster key
 * @param {number} options.seasonId - Season ID
 * @returns {Promise<SmurfCheckResult>}
 */
export async function runInSeasonChecks({ clusterKey, seasonId }) {
  console.log(`[SmurfDetection] Running in-season checks for cluster=${clusterKey}, season=${seasonId}`);
  
  // For in-season, we focus on power jumps after tier lock
  const rules = await loadActiveRules();
  const inSeasonRules = rules.filter(r => 
    r.key === 'POWER_JUMP_AFTER_TIER_LOCK' || 
    r.key === 'DISQUALIFY_ON_INBOUND_DURING_FREEZE'
  );

  const powerSnapshots = await getRecentPowerSnapshots(clusterKey, 30);
  const clusterWallets = await getClusterWallets(clusterKey);

  // Get transfers for all cluster wallets
  const allTransfers = [];
  for (const wallet of clusterWallets) {
    const transfers = await getRecentTransfers(wallet.address, 14);
    allTransfers.push(...transfers);
  }

  const context = {
    clusterKey,
    seasonId,
    walletAddress: clusterWallets[0]?.address || '',
    powerSnapshots,
    transfers: allTransfers,
    clusterWallets,
  };

  /** @type {SmurfIncidentDTO[]} */
  const incidents = [];
  let finalAction = 'NONE';
  let disqualified = false;
  let disqualificationReason = null;

  for (const rule of inSeasonRules) {
    try {
      const incident = await evaluateRule(rule, context);
      if (incident) {
        const recorded = await recordIncident({
          ...incident,
          clusterKey,
          seasonId,
          walletAddress: context.walletAddress,
        });
        
        incidents.push({
          id: recorded.id,
          ...incident,
          createdAt: recorded.createdAt?.toISOString(),
        });

        if (incident.actionTaken === 'DISQUALIFY') {
          finalAction = 'DISQUALIFY';
          disqualified = true;
          disqualificationReason = incident.reason;
        }
      }
    } catch (err) {
      console.error(`[SmurfDetection] Error evaluating rule ${rule.key}:`, err);
    }
  }

  return {
    finalAction,
    incidents,
    disqualified,
    disqualificationReason,
  };
}

/**
 * Get or create a wallet cluster for a user
 * 
 * @param {string} userId - Discord user ID
 * @returns {Promise<string>} - Cluster key
 */
export async function getOrCreateCluster(userId) {
  // Check if user already has a cluster
  const existing = await db
    .select()
    .from(walletClusters)
    .where(eq(walletClusters.userId, userId))
    .limit(1);

  if (existing.length > 0) {
    return existing[0].clusterKey;
  }

  // Create new cluster with UUID-like key
  const clusterKey = `cluster_${userId}_${Date.now().toString(36)}`;
  await db.insert(walletClusters).values({
    userId,
    clusterKey,
  });

  console.log(`[SmurfDetection] Created new cluster: ${clusterKey} for user ${userId}`);
  return clusterKey;
}

/**
 * Link a wallet address to a cluster
 * 
 * @param {string} clusterKey 
 * @param {string} chain 
 * @param {string} address 
 * @param {boolean} isPrimary 
 */
export async function linkWalletToCluster(clusterKey, chain, address, isPrimary = false) {
  const normalizedAddress = address.toLowerCase();
  
  // Check if already linked
  const existing = await db
    .select()
    .from(walletLinks)
    .where(
      and(
        eq(walletLinks.chain, chain),
        eq(walletLinks.address, normalizedAddress)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    // Update cluster if different
    if (existing[0].clusterKey !== clusterKey) {
      console.log(`[SmurfDetection] Warning: Wallet ${address} already linked to different cluster`);
    }
    return existing[0];
  }

  // Create new link
  const [inserted] = await db
    .insert(walletLinks)
    .values({
      clusterKey,
      chain,
      address: normalizedAddress,
      isPrimary,
      isActive: true,
    })
    .returning();

  console.log(`[SmurfDetection] Linked wallet ${address} to cluster ${clusterKey}`);
  return inserted;
}

export default {
  runPreSeasonChecks,
  runInSeasonChecks,
  getOrCreateCluster,
  linkWalletToCluster,
  TIER_ORDER,
  getTierIndex,
  escalateTier,
};
