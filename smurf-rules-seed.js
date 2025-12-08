/**
 * Smurf Detection Rules Seed Data
 * 
 * Seeds the smurf_detection_rules table with initial rules.
 * Run with: node smurf-rules-seed.js
 */

import { db } from './server/db.js';
import { smurfDetectionRules } from './shared/schema.js';
import { eq } from 'drizzle-orm';

const SMURF_RULES = [
  {
    key: 'INBOUND_POWER_SPIKE',
    name: 'Inbound Power Spike',
    description: 'Detects sudden increases in account power from inbound transfers (heroes, items, tokens) within the signup window. Suggests potential asset staging from another account.',
    enabled: true,
    severity: 'WARN',
    defaultAction: 'ESCALATE_TIER',
    config: {
      threshold: 500,
      windowDays: 14,
    },
  },
  {
    key: 'POWER_JUMP_AFTER_TIER_LOCK',
    name: 'Power Jump After Tier Lock',
    description: 'Detects significant power increases after a tier has been locked for a season. May indicate late-stage asset transfers to gain competitive advantage.',
    enabled: true,
    severity: 'WARN',
    defaultAction: 'ESCALATE_TIER',
    config: {
      threshold: 300,
      windowDays: 30,
    },
  },
  {
    key: 'MULTI_WALLET_CLUSTER_SMURF',
    name: 'Multi-Wallet Cluster Smurf',
    description: 'Detects when a player with high-tier wallets in their cluster attempts to sign up with a lower-tier wallet. Prevents sandbagging.',
    enabled: true,
    severity: 'WARN',
    defaultAction: 'ESCALATE_TIER',
    config: {
      tierThreshold: 'LEGENDARY',
    },
  },
  {
    key: 'DISQUALIFY_ON_INBOUND_DURING_FREEZE',
    name: 'Disqualify on Freeze Window Violation',
    description: 'Disqualifies players who receive significant power transfers during the freeze window immediately before season start. Hard rule to prevent last-minute manipulation.',
    enabled: true,
    severity: 'CRITICAL',
    defaultAction: 'DISQUALIFY',
    config: {
      threshold: 200,
      freezeWindowDays: 7,
    },
  },
];

/**
 * Upsert smurf detection rules
 */
async function seedSmurfRules() {
  console.log('[Seed] Starting smurf rules seed...');
  
  for (const rule of SMURF_RULES) {
    try {
      // Check if rule exists
      const existing = await db
        .select()
        .from(smurfDetectionRules)
        .where(eq(smurfDetectionRules.key, rule.key))
        .limit(1);

      if (existing.length > 0) {
        // Update existing rule
        await db
          .update(smurfDetectionRules)
          .set({
            name: rule.name,
            description: rule.description,
            enabled: rule.enabled,
            severity: rule.severity,
            defaultAction: rule.defaultAction,
            config: rule.config,
            updatedAt: new Date(),
          })
          .where(eq(smurfDetectionRules.key, rule.key));
        console.log(`[Seed] Updated rule: ${rule.key}`);
      } else {
        // Insert new rule
        await db.insert(smurfDetectionRules).values(rule);
        console.log(`[Seed] Inserted rule: ${rule.key}`);
      }
    } catch (err) {
      console.error(`[Seed] Error seeding rule ${rule.key}:`, err);
    }
  }

  console.log('[Seed] Smurf rules seed complete.');
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seedSmurfRules()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[Seed] Fatal error:', err);
      process.exit(1);
    });
}

export { seedSmurfRules, SMURF_RULES };
