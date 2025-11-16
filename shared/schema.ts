import { sql } from "drizzle-orm";
import { pgTable, text, varchar, serial, bigint, numeric, timestamp, integer, boolean, json, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Legacy user table (unused by Discord bot)
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// ============================================================================
// FAIR VALUE ENGINE SCHEMA
// ============================================================================

/**
 * Tavern sales - raw completed sales data from DFK
 */
export const tavernSales = pgTable("tavern_sales", {
  id: serial("id").primaryKey(),
  heroId: bigint("hero_id", { mode: "number" }).notNull(),
  realm: text("realm").notNull(), // 'cv' (Crystalvale), 'sd' (Serendale), 'metis'
  saleTimestamp: timestamp("sale_timestamp", { withTimezone: true }).notNull(),
  tokenAddress: text("token_address").notNull(),
  tokenSymbol: text("token_symbol").notNull(),
  priceAmount: numeric("price_amount", { precision: 30, scale: 18 }).notNull(),
  priceUsd: numeric("price_usd", { precision: 15, scale: 2 }), // nullable until price feed available
  buyerAddress: text("buyer_address"),
  sellerAddress: text("seller_address"),
  isFloorHero: boolean("is_floor_hero").default(false).notNull(),
  floorExclusionReason: text("floor_exclusion_reason"), // why it was marked as floor
  asOfDate: timestamp("as_of_date", { withTimezone: true }).notNull(), // UTC day it was processed
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  heroIdIdx: index("tavern_sales_hero_id_idx").on(table.heroId),
  realmIdx: index("tavern_sales_realm_idx").on(table.realm),
  saleTimestampIdx: index("tavern_sales_sale_timestamp_idx").on(table.saleTimestamp),
  asOfDateIdx: index("tavern_sales_as_of_date_idx").on(table.asOfDate),
  uniqueSale: uniqueIndex("tavern_sales_unique_sale").on(table.heroId, table.saleTimestamp),
}));

/**
 * Hero snapshots - full trait data at time of sale
 */
export const heroSnapshots = pgTable("hero_snapshots", {
  id: serial("id").primaryKey(),
  saleId: integer("sale_id").notNull().references(() => tavernSales.id),
  heroId: bigint("hero_id", { mode: "number" }).notNull(),
  rarity: integer("rarity").notNull(), // 0=common, 1=uncommon, 2=rare, 3=legendary, 4=mythic
  mainClass: text("main_class").notNull(),
  subClass: text("sub_class").notNull(),
  level: integer("level").notNull(),
  profession: text("profession").notNull(),
  summonsRemaining: integer("summons_remaining").notNull(),
  maxSummons: integer("max_summons").notNull(),
  
  // Primary stats
  strength: integer("strength").notNull(),
  agility: integer("agility").notNull(),
  dexterity: integer("dexterity").notNull(),
  vitality: integer("vitality").notNull(),
  intelligence: integer("intelligence").notNull(),
  wisdom: integer("wisdom").notNull(),
  luck: integer("luck").notNull(),
  
  // Gene counts (aggregate)
  advancedGenes: integer("advanced_genes").notNull().default(0),
  eliteGenes: integer("elite_genes").notNull().default(0),
  exaltedGenes: integer("exalted_genes").notNull().default(0),
  
  // Gene details (JSON arrays storing slot info)
  passive1: json("passive1"), // {geneId, name, tier}
  passive2: json("passive2"),
  active1: json("active1"),
  active2: json("active2"),
  
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  saleIdIdx: index("hero_snapshots_sale_id_idx").on(table.saleId),
  heroIdIdx: index("hero_snapshots_hero_id_idx").on(table.heroId),
}));

/**
 * Gene catalog - metadata for all known genes
 */
export const geneCatalog = pgTable("gene_catalog", {
  id: serial("id").primaryKey(),
  geneId: text("gene_id").notNull().unique(),
  name: text("name").notNull(),
  tier: text("tier").notNull(), // 'basic', 'advanced', 'elite', 'exalted'
  tags: json("tags").$type<string[]>(), // ['damage', 'heal', 'aoe', 'support', 'debuff', 'buff', 'pvp', 'pve']
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  geneIdIdx: uniqueIndex("gene_catalog_gene_id_idx").on(table.geneId),
}));

/**
 * Trait weights - learned regression coefficients by date
 */
export const traitWeights = pgTable("trait_weights", {
  id: serial("id").primaryKey(),
  asOfDate: timestamp("as_of_date", { withTimezone: true }).notNull(),
  realm: text("realm").notNull(),
  
  // Model metadata
  modelVersion: text("model_version").notNull().default('v1'),
  trainingSamples: integer("training_samples").notNull(),
  rSquared: numeric("r_squared", { precision: 10, scale: 6 }),
  
  // Learned weights (JSON object with feature -> weight mapping)
  weights: json("weights").notNull(), // {rarity_1: 100.5, mainClass_warrior: 50.2, ...}
  
  // Training window
  trainingStartDate: timestamp("training_start_date", { withTimezone: true }).notNull(),
  trainingEndDate: timestamp("training_end_date", { withTimezone: true }).notNull(),
  
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  asOfDateRealmIdx: uniqueIndex("trait_weights_as_of_date_realm_idx").on(table.asOfDate, table.realm),
}));

/**
 * Similarity buckets - market comps for hero groups
 */
export const similarityBuckets = pgTable("similarity_buckets", {
  id: serial("id").primaryKey(),
  asOfDate: timestamp("as_of_date", { withTimezone: true }).notNull(),
  realm: text("realm").notNull(),
  rarity: integer("rarity").notNull(),
  mainClass: text("main_class").notNull(),
  levelBand: text("level_band").notNull(), // '1-4', '5-9', '10-14', etc
  summonsBand: text("summons_band").notNull(), // '0', '1-3', '4-7', '8+'
  profession: text("profession").notNull(),
  
  // Market fair values (medians)
  median1d: numeric("median_1d", { precision: 15, scale: 2 }),
  median7d: numeric("median_7d", { precision: 15, scale: 2 }),
  median30d: numeric("median_30d", { precision: 15, scale: 2 }),
  median90d: numeric("median_90d", { precision: 15, scale: 2 }),
  
  // Liquidity counts
  sales1d: integer("sales_1d").default(0).notNull(),
  sales7d: integer("sales_7d").default(0).notNull(),
  sales30d: integer("sales_30d").default(0).notNull(),
  sales90d: integer("sales_90d").default(0).notNull(),
  
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  bucketIdx: uniqueIndex("similarity_buckets_unique").on(
    table.asOfDate, 
    table.realm, 
    table.rarity, 
    table.mainClass, 
    table.levelBand, 
    table.summonsBand, 
    table.profession
  ),
}));

/**
 * Trend data - 7d/30d/90d price and liquidity movements
 */
export const trendData = pgTable("trend_data", {
  id: serial("id").primaryKey(),
  asOfDate: timestamp("as_of_date", { withTimezone: true }).notNull(),
  realm: text("realm").notNull(),
  category: text("category").notNull(), // 'class', 'rarity', 'profession', 'gene_tag', 'summons_band'
  categoryValue: text("category_value").notNull(), // e.g. 'warrior', 'legendary', 'damage'
  
  // Price trends (percentage change)
  priceChange7d: numeric("price_change_7d", { precision: 10, scale: 2 }),
  priceChange30d: numeric("price_change_30d", { precision: 10, scale: 2 }),
  priceChange90d: numeric("price_change_90d", { precision: 10, scale: 2 }),
  
  // Average prices
  avgPrice7d: numeric("avg_price_7d", { precision: 15, scale: 2 }),
  avgPrice30d: numeric("avg_price_30d", { precision: 15, scale: 2 }),
  avgPrice90d: numeric("avg_price_90d", { precision: 15, scale: 2 }),
  
  // Liquidity
  sales7d: integer("sales_7d").default(0).notNull(),
  sales30d: integer("sales_30d").default(0).notNull(),
  sales90d: integer("sales_90d").default(0).notNull(),
  
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  trendIdx: uniqueIndex("trend_data_unique").on(
    table.asOfDate,
    table.realm,
    table.category,
    table.categoryValue
  ),
}));

/**
 * Processing log - track daily batch runs
 */
export const processingLog = pgTable("processing_log", {
  id: serial("id").primaryKey(),
  asOfDate: timestamp("as_of_date", { withTimezone: true }).notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  status: text("status").notNull().default('running'), // 'running', 'completed', 'failed'
  errorMessage: text("error_message"),
  
  // Processing stats
  salesIngested: integer("sales_ingested").default(0),
  floorHeroesExcluded: integer("floor_heroes_excluded").default(0),
  trainingSamples: integer("training_samples").default(0),
  bucketsUpdated: integer("buckets_updated").default(0),
  
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  asOfDateIdx: uniqueIndex("processing_log_as_of_date_idx").on(table.asOfDate),
}));

// Insert schemas
export const insertTavernSaleSchema = createInsertSchema(tavernSales).omit({ id: true, createdAt: true });
export const insertHeroSnapshotSchema = createInsertSchema(heroSnapshots).omit({ id: true, createdAt: true });
export const insertGeneCatalogSchema = createInsertSchema(geneCatalog).omit({ id: true, firstSeenAt: true, updatedAt: true });
export const insertTraitWeightsSchema = createInsertSchema(traitWeights).omit({ id: true, createdAt: true });
export const insertSimilarityBucketSchema = createInsertSchema(similarityBuckets).omit({ id: true, createdAt: true });
export const insertTrendDataSchema = createInsertSchema(trendData).omit({ id: true, createdAt: true });
export const insertProcessingLogSchema = createInsertSchema(processingLog).omit({ id: true, createdAt: true });

// Types
export type InsertTavernSale = z.infer<typeof insertTavernSaleSchema>;
export type TavernSale = typeof tavernSales.$inferSelect;
export type InsertHeroSnapshot = z.infer<typeof insertHeroSnapshotSchema>;
export type HeroSnapshot = typeof heroSnapshots.$inferSelect;
export type InsertGeneCatalog = z.infer<typeof insertGeneCatalogSchema>;
export type GeneCatalog = typeof geneCatalog.$inferSelect;
export type InsertTraitWeights = z.infer<typeof insertTraitWeightsSchema>;
export type TraitWeights = typeof traitWeights.$inferSelect;
export type InsertSimilarityBucket = z.infer<typeof insertSimilarityBucketSchema>;
export type SimilarityBucket = typeof similarityBuckets.$inferSelect;
export type InsertTrendData = z.infer<typeof insertTrendDataSchema>;
export type TrendData = typeof trendData.$inferSelect;
export type InsertProcessingLog = z.infer<typeof insertProcessingLogSchema>;
export type ProcessingLog = typeof processingLog.$inferSelect;
