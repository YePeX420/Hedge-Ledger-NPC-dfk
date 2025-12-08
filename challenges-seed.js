/**
 * Challenge System Seed Script
 * 
 * Reads challengeConfig.ts and upserts all categories, challenges, and tiers to the database.
 * Run with: npx tsx challenges-seed.js
 */

import { db } from './server/db.js';
import { challengeCategories, challenges, challengeTiers } from './shared/schema.ts';
import { eq } from 'drizzle-orm';
import { HEDGE_CHALLENGE_CONFIG } from './src/data/challengeConfig.ts';

async function seedCategories() {
  console.log('[Seed] Seeding challenge categories...');
  
  for (const category of HEDGE_CHALLENGE_CONFIG.categories) {
    try {
      const existing = await db
        .select()
        .from(challengeCategories)
        .where(eq(challengeCategories.key, category.key))
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(challengeCategories)
          .set({
            name: category.name,
            description: category.description,
            tierSystem: category.tierSystem,
            sortOrder: category.sortOrder,
            updatedAt: new Date(),
          })
          .where(eq(challengeCategories.key, category.key));
        console.log(`  Updated category: ${category.key}`);
      } else {
        await db.insert(challengeCategories).values({
          key: category.key,
          name: category.name,
          description: category.description,
          tierSystem: category.tierSystem,
          sortOrder: category.sortOrder,
          isActive: true,
        });
        console.log(`  Inserted category: ${category.key}`);
      }
    } catch (err) {
      console.error(`  Error seeding category ${category.key}:`, err.message);
    }
  }
}

async function seedChallenges() {
  console.log('[Seed] Seeding challenges...');
  
  for (const challenge of HEDGE_CHALLENGE_CONFIG.challenges) {
    try {
      const existing = await db
        .select()
        .from(challenges)
        .where(eq(challenges.key, challenge.key))
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(challenges)
          .set({
            categoryKey: challenge.categoryKey,
            name: challenge.name,
            description: challenge.description,
            metricType: challenge.metricType,
            metricSource: challenge.metricSource,
            metricKey: challenge.metricKey,
            tierSystemOverride: challenge.tierSystemOverride || null,
            isActive: challenge.isActive,
            sortOrder: challenge.sortOrder,
            meta: challenge.meta || null,
            updatedAt: new Date(),
          })
          .where(eq(challenges.key, challenge.key));
        console.log(`  Updated challenge: ${challenge.key}`);
      } else {
        await db.insert(challenges).values({
          key: challenge.key,
          categoryKey: challenge.categoryKey,
          name: challenge.name,
          description: challenge.description,
          metricType: challenge.metricType,
          metricSource: challenge.metricSource,
          metricKey: challenge.metricKey,
          tierSystemOverride: challenge.tierSystemOverride || null,
          isActive: challenge.isActive,
          sortOrder: challenge.sortOrder,
          meta: challenge.meta || null,
        });
        console.log(`  Inserted challenge: ${challenge.key}`);
      }
    } catch (err) {
      console.error(`  Error seeding challenge ${challenge.key}:`, err.message);
    }
  }
}

async function seedTiers() {
  console.log('[Seed] Seeding challenge tiers...');
  
  for (const challenge of HEDGE_CHALLENGE_CONFIG.challenges) {
    for (const tier of challenge.tiers) {
      try {
        const existing = await db
          .select()
          .from(challengeTiers)
          .where(eq(challengeTiers.challengeKey, challenge.key))
          .limit(100);
        
        const existingTier = existing.find(t => t.tierCode === tier.tierCode);

        if (existingTier) {
          await db
            .update(challengeTiers)
            .set({
              displayName: tier.displayName,
              thresholdValue: tier.thresholdValue,
              isPrestige: tier.isPrestige || false,
              sortOrder: tier.sortOrder,
              meta: tier.meta || null,
            })
            .where(eq(challengeTiers.id, existingTier.id));
        } else {
          await db.insert(challengeTiers).values({
            challengeKey: challenge.key,
            tierCode: tier.tierCode,
            displayName: tier.displayName,
            thresholdValue: tier.thresholdValue,
            isPrestige: tier.isPrestige || false,
            sortOrder: tier.sortOrder,
            meta: tier.meta || null,
          });
        }
      } catch (err) {
        console.error(`  Error seeding tier ${challenge.key}/${tier.tierCode}:`, err.message);
      }
    }
    console.log(`  Seeded tiers for: ${challenge.key}`);
  }
}

async function main() {
  console.log('[Seed] Starting challenge system seed...');
  
  await seedCategories();
  await seedChallenges();
  await seedTiers();
  
  console.log('[Seed] Challenge system seed complete!');
  console.log(`  Categories: ${HEDGE_CHALLENGE_CONFIG.categories.length}`);
  console.log(`  Challenges: ${HEDGE_CHALLENGE_CONFIG.challenges.length}`);
  
  const totalTiers = HEDGE_CHALLENGE_CONFIG.challenges.reduce((sum, c) => sum + c.tiers.length, 0);
  console.log(`  Tiers: ${totalTiers}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[Seed] Fatal error:', err);
    process.exit(1);
  });
