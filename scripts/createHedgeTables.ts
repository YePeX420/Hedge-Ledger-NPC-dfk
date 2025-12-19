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
      
      CREATE UNIQUE INDEX IF NOT EXISTS ux_entitlement_rules_unique ON entitlement_rules(domain, resource, tier_id, mode);

      CREATE TABLE IF NOT EXISTS sync_runs (
        id SERIAL PRIMARY KEY,
        domain TEXT NOT NULL,
        started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        finished_at TIMESTAMPTZ,
        status TEXT NOT NULL,
        discovered_urls INTEGER NOT NULL DEFAULT 0,
        keywords_upserted INTEGER NOT NULL DEFAULT 0,
        classes_attempted INTEGER NOT NULL DEFAULT 0,
        classes_ingested INTEGER NOT NULL DEFAULT 0,
        skills_upserted INTEGER NOT NULL DEFAULT 0,
        rag_docs_upserted INTEGER NOT NULL DEFAULT 0,
        error TEXT,
        log JSONB
      );

      CREATE INDEX IF NOT EXISTS ix_sync_runs_domain_started ON sync_runs(domain, started_at DESC);

      CREATE TABLE IF NOT EXISTS sync_run_items (
        id SERIAL PRIMARY KEY,
        sync_run_id INTEGER NOT NULL REFERENCES sync_runs(id) ON DELETE CASCADE,
        item_type TEXT NOT NULL,
        item_key TEXT NOT NULL,
        status TEXT NOT NULL,
        detail TEXT,
        skills_count INTEGER,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS ix_sync_run_items_run ON sync_run_items(sync_run_id);
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
    
    // Seed premium_plus tier (required for Prompt 4)
    await db.execute(sql`
      INSERT INTO entitlement_tiers (tier_id, display_name, description, price_monthly, enabled, sort_order) VALUES
      ('premium_plus', 'Premium+', 'Ultimate access with advanced analytics and AI features', 29.99, true, 3)
      ON CONFLICT (tier_id) DO UPDATE SET 
        display_name = EXCLUDED.display_name,
        description = EXCLUDED.description,
        price_monthly = EXCLUDED.price_monthly,
        enabled = EXCLUDED.enabled,
        sort_order = EXCLUDED.sort_order,
        updated_at = CURRENT_TIMESTAMP;
    `);
    console.log('Premium+ tier seeded successfully!');
    
    // Seed entitlement rules for combat domain
    console.log('Seeding entitlement rules for combat domain...');
    
    // Free tier: fields_allowlist
    await db.execute(sql`
      INSERT INTO entitlement_rules(domain, resource, tier_id, mode, rule)
      VALUES (
        'combat','skills.search','free','fields_allowlist',
        '{"fields":["class","tier","discipline","ability","tags","summary","source_url","last_seen_at"]}'::jsonb
      )
      ON CONFLICT (domain, resource, tier_id, mode) DO UPDATE SET 
        rule = EXCLUDED.rule,
        updated_at = CURRENT_TIMESTAMP;
    `);
    
    // Premium tier: fields_allowlist
    await db.execute(sql`
      INSERT INTO entitlement_rules(domain, resource, tier_id, mode, rule)
      VALUES (
        'combat','skills.search','premium','fields_allowlist',
        '{"fields":["class","tier","skill_points","discipline","ability","tags","summary","description_raw","range","mana_cost","mana_growth","dod","source_url","last_seen_at"]}'::jsonb
      )
      ON CONFLICT (domain, resource, tier_id, mode) DO UPDATE SET 
        rule = EXCLUDED.rule,
        updated_at = CURRENT_TIMESTAMP;
    `);
    
    // Premium+ tier: fields_allowlist
    await db.execute(sql`
      INSERT INTO entitlement_rules(domain, resource, tier_id, mode, rule)
      VALUES (
        'combat','skills.search','premium_plus','fields_allowlist',
        '{"fields":["class","tier","skill_points","discipline","ability","tags","summary","description_raw","range","mana_cost","mana_growth","dod","codex_score","synergy_notes","recommended_roles","source_url","last_seen_at"]}'::jsonb
      )
      ON CONFLICT (domain, resource, tier_id, mode) DO UPDATE SET 
        rule = EXCLUDED.rule,
        updated_at = CURRENT_TIMESTAMP;
    `);
    
    // Free tier: feature_flags
    await db.execute(sql`
      INSERT INTO entitlement_rules(domain, resource, tier_id, mode, rule)
      VALUES (
        'combat','skills.search','free','feature_flags',
        '{"flags":{"combat.skills.searchByTags":false,"combat.codexScore.enabled":false}}'::jsonb
      )
      ON CONFLICT (domain, resource, tier_id, mode) DO UPDATE SET 
        rule = EXCLUDED.rule,
        updated_at = CURRENT_TIMESTAMP;
    `);
    
    // Premium tier: feature_flags
    await db.execute(sql`
      INSERT INTO entitlement_rules(domain, resource, tier_id, mode, rule)
      VALUES (
        'combat','skills.search','premium','feature_flags',
        '{"flags":{"combat.skills.searchByTags":true,"combat.codexScore.enabled":false}}'::jsonb
      )
      ON CONFLICT (domain, resource, tier_id, mode) DO UPDATE SET 
        rule = EXCLUDED.rule,
        updated_at = CURRENT_TIMESTAMP;
    `);
    
    // Premium+ tier: feature_flags
    await db.execute(sql`
      INSERT INTO entitlement_rules(domain, resource, tier_id, mode, rule)
      VALUES (
        'combat','skills.search','premium_plus','feature_flags',
        '{"flags":{"combat.skills.searchByTags":true,"combat.codexScore.enabled":true}}'::jsonb
      )
      ON CONFLICT (domain, resource, tier_id, mode) DO UPDATE SET 
        rule = EXCLUDED.rule,
        updated_at = CURRENT_TIMESTAMP;
    `);
    
    console.log('Entitlement rules seeded successfully!');
    
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
