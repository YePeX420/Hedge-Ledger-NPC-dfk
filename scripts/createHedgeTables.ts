import { db } from '../server/db';
import { sql } from 'drizzle-orm';

async function createHedgeTables() {
  console.log('Creating Hedge tables...');
  
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS combat_keywords (
        keyword TEXT PRIMARY KEY,
        definition TEXT NOT NULL,
        source_url TEXT NOT NULL,
        last_seen_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS combat_class_meta (
        class TEXT PRIMARY KEY,
        source_url TEXT NOT NULL,
        last_update_note TEXT,
        maturity TEXT NOT NULL,
        disciplines TEXT[] NOT NULL DEFAULT '{}',
        summary TEXT,
        last_seen_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS combat_skills (
        id SERIAL PRIMARY KEY,
        class TEXT NOT NULL,
        tier INTEGER NOT NULL,
        skill_points INTEGER,
        discipline TEXT,
        ability TEXT NOT NULL,
        description_raw TEXT,
        range INTEGER,
        mana_cost NUMERIC(10, 2),
        mana_growth NUMERIC(10, 4),
        dod NUMERIC(10, 4),
        tags TEXT[] NOT NULL DEFAULT '{}',
        source_url TEXT NOT NULL,
        last_seen_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS combat_skills_class_idx ON combat_skills(class);
      CREATE INDEX IF NOT EXISTS combat_skills_class_tier_idx ON combat_skills(class, tier);

      CREATE TABLE IF NOT EXISTS combat_sources (
        url TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        discovered_from TEXT,
        last_seen_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS entitlement_tiers (
        tier_id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        description TEXT,
        price_monthly NUMERIC(10, 2),
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        sort_order INTEGER NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS entitlement_rules (
        id SERIAL PRIMARY KEY,
        domain TEXT NOT NULL,
        resource TEXT NOT NULL,
        tier_id TEXT NOT NULL REFERENCES entitlement_tiers(tier_id),
        mode TEXT NOT NULL,
        rule JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS entitlement_rules_tier_idx ON entitlement_rules(tier_id);
      CREATE INDEX IF NOT EXISTS entitlement_rules_domain_resource_idx ON entitlement_rules(domain, resource);
    `);
    
    console.log('Tables created successfully!');
    
    // Seed default tiers
    await db.execute(sql`
      INSERT INTO entitlement_tiers (tier_id, display_name, description, price_monthly, enabled, sort_order) VALUES
      ('free', 'Free', 'Basic access to public combat data', NULL, true, 0),
      ('basic', 'Basic', 'Enhanced access with more detail fields', 4.99, true, 1),
      ('premium', 'Premium', 'Full access to all combat data and features', 14.99, true, 2),
      ('admin', 'Admin', 'Administrative access (internal use)', NULL, false, 99)
      ON CONFLICT (tier_id) DO UPDATE SET 
        display_name = EXCLUDED.display_name,
        description = EXCLUDED.description,
        price_monthly = EXCLUDED.price_monthly,
        enabled = EXCLUDED.enabled,
        sort_order = EXCLUDED.sort_order,
        updated_at = CURRENT_TIMESTAMP;
    `);
    
    console.log('Default tiers seeded successfully!');
    
  } catch (error) {
    console.error('Error creating tables:', error);
    throw error;
  }
}

createHedgeTables()
  .then(() => {
    console.log('Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Failed:', error);
    process.exit(1);
  });
