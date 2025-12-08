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
// ADMIN SESSIONS TABLE (for Discord OAuth authentication persistence)
// ============================================================================

export const adminSessions = pgTable("admin_sessions", {
  id: serial("id").primaryKey(),
  sessionToken: varchar("session_token").notNull().unique(),
  discordId: text("discord_id").notNull(),
  username: text("username").notNull(),
  avatar: text("avatar"),
  accessToken: text("access_token"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  sessionTokenIdx: uniqueIndex("admin_sessions_token_idx").on(table.sessionToken),
  discordIdIdx: index("admin_sessions_discord_id_idx").on(table.discordId),
  expiresAtIdx: index("admin_sessions_expires_at_idx").on(table.expiresAt),
}));

export const insertAdminSessionSchema = createInsertSchema(adminSessions).omit({ id: true, createdAt: true });
export type InsertAdminSession = z.infer<typeof insertAdminSessionSchema>;
export type AdminSession = typeof adminSessions.$inferSelect;

// ============================================================================
// PRICING CONFIGURATION TABLE
// ============================================================================

export const pricingConfig = pgTable("pricing_config", {
  id: serial("id").primaryKey(),
  configKey: text("config_key").notNull().unique(), // 'base_rates', 'modifiers'
  configValue: json("config_value").notNull(), // Store config as JSON
  updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  configKeyIdx: uniqueIndex("pricing_config_key_idx").on(table.configKey),
}));

export const insertPricingConfigSchema = createInsertSchema(pricingConfig).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPricingConfig = z.infer<typeof insertPricingConfigSchema>;
export type PricingConfig = typeof pricingConfig.$inferSelect;

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

// ============================================================================
// PLAYER ENGAGEMENT & CONVERSION TRACKING SCHEMA
// ============================================================================

/**
 * Players - Discord users and their linked wallet addresses
 */
export const players = pgTable("players", {
  id: serial("id").primaryKey(),
  discordId: text("discord_id").notNull().unique(), // Discord user ID
  discordUsername: text("discord_username").notNull(),
  firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  
  // Linked wallets (JSON array of wallet addresses)
  wallets: json("wallets").$type<string[]>().default(sql`'[]'::json`),
  primaryWallet: text("primary_wallet"), // Main wallet if user has multiple
  
  // Current engagement state
  engagementState: text("engagement_state").notNull().default('visitor'), // visitor, explorer, participant, player, active, committed
  stateLastUpdated: timestamp("state_last_updated", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  
  // Extractor classification
  extractorScore: numeric("extractor_score", { precision: 10, scale: 2 }).default('0.00').notNull(),
  extractorClassification: text("extractor_classification").default('normal').notNull(), // normal, extractor_tending, extractor
  extractorLastUpdated: timestamp("extractor_last_updated", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  
  // Engagement metrics
  totalSessions: integer("total_sessions").default(0).notNull(),
  totalMessages: integer("total_messages").default(0).notNull(),
  totalMilestones: integer("total_milestones").default(0).notNull(),
  
  // Garden Engine - APR check tracking (Option 3: free once per day)
  lastGardenAPRCheckDate: text("last_garden_apr_check_date"), // Format: YYYY-MM-DD
  
  // DFK Age Cache - First transaction timestamp on DFK chain (computed once and cached)
  firstDfkTxTimestamp: timestamp("first_dfk_tx_timestamp", { withTimezone: true }), // Cached on first computation
  
  // Enhanced Player Profile Data (JSON blob for classification system)
  // Contains: archetype, intentArchetype, tier, state, behaviorTags, kpis, dfkSnapshot, flags, recentMessages
  profileData: json("profile_data").$type<{
    archetype: string;
    intentArchetype?: string; // NEW: Intent-based archetype (PROGRESSION_GAMER, INVESTOR_GROWTH, etc.)
    intentScores?: { // NEW: Raw intent dimension scores (0-100)
      progression: number;
      investmentGrowth: number;
      investmentExtraction: number;
      social: number;
      exploration: number;
    };
    tier: number;
    tierOverride?: number;
    state: string;
    behaviorTags: string[];
    kpis: {
      engagementScore: number;
      financialScore: number;
      retentionScore: number;
      messagesLast7d: number;
      adviceFollowedCount: number;
      recommendationsClicked: number;
      lastSeenAt?: Date;
    };
    dfkSnapshot: {
      heroCount: number;
      petCount: number;
      lpPositionsCount: number;
      totalLPValue: number;
      jewelBalance: number;
      crystalBalance: number;
      questingStreakDays: number;
    } | null;
    flags: {
      isExtractor: boolean;
      isWhale: boolean;
      isHighPotential: boolean;
    };
    recentMessages: Array<{ content: string; timestamp: Date }>;
  }>(),
  
  updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  discordIdIdx: uniqueIndex("players_discord_id_idx").on(table.discordId),
  primaryWalletIdx: index("players_primary_wallet_idx").on(table.primaryWallet),
  engagementStateIdx: index("players_engagement_state_idx").on(table.engagementState),
  extractorClassIdx: index("players_extractor_class_idx").on(table.extractorClassification),
}));

export const userSettings = pgTable("user_settings", {
  id: serial("id").primaryKey(),
  playerId: integer("player_id").notNull().references(() => players.id),
  notifyOnAprDrop: boolean("notify_on_apr_drop").default(false).notNull(),
  notifyOnNewOptimization: boolean("notify_on_new_optimization").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  playerIdIdx: uniqueIndex("user_settings_player_id_idx").on(table.playerId),
}));

/**
 * Interaction sessions - Track conversation sessions with Hedge
 */
export const interactionSessions = pgTable("interaction_sessions", {
  id: serial("id").primaryKey(),
  playerId: integer("player_id").notNull().references(() => players.id),
  startedAt: timestamp("started_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  
  // Session metadata
  channelType: text("channel_type").notNull(), // 'dm', 'guild_text', 'guild_thread'
  channelId: text("channel_id"),
  guildId: text("guild_id"),
  
  // Session metrics
  messageCount: integer("message_count").default(0).notNull(),
  durationSeconds: integer("duration_seconds"),
  
  // Topics discussed (JSON array of topic tags)
  topics: json("topics").$type<string[]>().default(sql`'[]'::json`),
  // e.g., ['onboarding', 'heroes', 'gardens', 'quests', 'summoning', 'marketplace', 'yield', 'lore']
  
  // Quality indicators
  commandsUsed: json("commands_used").$type<string[]>().default(sql`'[]'::json`), // ['hero', 'garden', 'market']
  blockchainQueriesMade: integer("blockchain_queries_made").default(0).notNull(),
  
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  playerIdIdx: index("interaction_sessions_player_id_idx").on(table.playerId),
  startedAtIdx: index("interaction_sessions_started_at_idx").on(table.startedAt),
}));

/**
 * Interaction messages - Individual messages in sessions
 */
export const interactionMessages = pgTable("interaction_messages", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull().references(() => interactionSessions.id),
  playerId: integer("player_id").notNull().references(() => players.id),
  timestamp: timestamp("timestamp", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  
  // Message content analysis
  messageType: text("message_type").notNull(), // 'user_message', 'command', 'bot_response'
  command: text("command"), // e.g., 'hero', 'garden', 'summon'
  topic: text("topic"), // Inferred topic: 'onboarding', 'heroes', 'gardens', etc.
  sentiment: text("sentiment"), // 'positive', 'neutral', 'negative', 'frustrated'
  
  // For blockchain queries
  heroIdQueried: bigint("hero_id_queried", { mode: "number" }),
  walletQueried: text("wallet_queried"),
  
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  sessionIdIdx: index("interaction_messages_session_id_idx").on(table.sessionId),
  playerIdIdx: index("interaction_messages_player_id_idx").on(table.playerId),
  timestampIdx: index("interaction_messages_timestamp_idx").on(table.timestamp),
}));

/**
 * Conversion milestones - Track when users complete key actions
 */
export const conversionMilestones = pgTable("conversion_milestones", {
  id: serial("id").primaryKey(),
  playerId: integer("player_id").notNull().references(() => players.id),
  wallet: text("wallet").notNull(),
  
  // Milestone details
  milestoneType: text("milestone_type").notNull(),
  // e.g., 'wallet_connected', 'first_quest', 'first_hero_purchase', 'first_summon', 
  // 'first_garden_deposit', 'first_pet_link', 'first_bridge', 'first_level_up'
  
  completedAt: timestamp("completed_at", { withTimezone: true }).notNull(),
  
  // Context about the milestone
  realm: text("realm"), // 'cv', 'sd', 'metis'
  heroId: bigint("hero_id", { mode: "number" }),
  transactionHash: text("transaction_hash"),
  value: numeric("value", { precision: 30, scale: 18 }), // Transaction value if applicable
  
  // Attribution to Hedge
  daysSinceFirstInteraction: integer("days_since_first_interaction"),
  relatedSessionId: integer("related_session_id").references(() => interactionSessions.id),
  hedgeGuidanceProvided: boolean("hedge_guidance_provided").default(false), // Did Hedge explain this feature?
  
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  playerIdIdx: index("conversion_milestones_player_id_idx").on(table.playerId),
  walletIdx: index("conversion_milestones_wallet_idx").on(table.wallet),
  milestoneTypeIdx: index("conversion_milestones_type_idx").on(table.milestoneType),
  completedAtIdx: index("conversion_milestones_completed_at_idx").on(table.completedAt),
}));

/**
 * Wallet activity tracking - On-chain behavior for extractor detection
 */
export const walletActivity = pgTable("wallet_activity", {
  id: serial("id").primaryKey(),
  playerId: integer("player_id").notNull().references(() => players.id),
  wallet: text("wallet").notNull(),
  asOfDate: timestamp("as_of_date", { withTimezone: true }).notNull(), // UTC day
  
  // Quest activity
  questsCompleted7d: integer("quests_completed_7d").default(0).notNull(),
  questsCompleted30d: integer("quests_completed_30d").default(0).notNull(),
  questsCompleted90d: integer("quests_completed_90d").default(0).notNull(),
  
  // Hero activity
  heroesLeveled7d: integer("heroes_leveled_7d").default(0).notNull(),
  heroesLeveled30d: integer("heroes_leveled_30d").default(0).notNull(),
  summonsMade7d: integer("summons_made_7d").default(0).notNull(),
  summonsMade30d: integer("summons_made_30d").default(0).notNull(),
  
  // Marketplace activity
  heroesPurchased7d: integer("heroes_purchased_7d").default(0).notNull(),
  heroesPurchased30d: integer("heroes_purchased_30d").default(0).notNull(),
  heroesSold7d: integer("heroes_sold_7d").default(0).notNull(),
  heroesSold30d: integer("heroes_sold_30d").default(0).notNull(),
  floorHeroesBought7d: integer("floor_heroes_bought_7d").default(0).notNull(),
  floorHeroesFlipped7d: integer("floor_heroes_flipped_7d").default(0).notNull(),
  
  // Garden activity
  gardenDeposits7d: integer("garden_deposits_7d").default(0).notNull(),
  gardenDeposits30d: integer("garden_deposits_30d").default(0).notNull(),
  gardenWithdrawals7d: integer("garden_withdrawals_7d").default(0).notNull(),
  gardenWithdrawals30d: integer("garden_withdrawals_30d").default(0).notNull(),
  rewardsClaimed7d: integer("rewards_claimed_7d").default(0).notNull(),
  rewardsSoldImmediately7d: integer("rewards_sold_immediately_7d").default(0).notNull(), // Within 1 hour
  
  // Cross-realm activity
  bridgeTransactions7d: integer("bridge_transactions_7d").default(0).notNull(),
  bridgeTransactions30d: integer("bridge_transactions_30d").default(0).notNull(),
  activeRealms: json("active_realms").$type<string[]>().default(sql`'[]'::json`), // ['cv', 'sd', 'metis']
  
  // Progression indicators
  totalHeroLevel: integer("total_hero_level").default(0).notNull(), // Sum of all hero levels
  totalHeroCount: integer("total_hero_count").default(0).notNull(),
  petsOwned: integer("pets_owned").default(0).notNull(),
  petsLinked: integer("pets_linked").default(0).notNull(),
  
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  walletAsOfDateIdx: uniqueIndex("wallet_activity_wallet_as_of_date_idx").on(table.wallet, table.asOfDate),
  playerIdIdx: index("wallet_activity_player_id_idx").on(table.playerId),
  asOfDateIdx: index("wallet_activity_as_of_date_idx").on(table.asOfDate),
}));

/**
 * Daily player snapshots - For trending and KPI calculations
 */
export const dailyPlayerSnapshots = pgTable("daily_player_snapshots", {
  id: serial("id").primaryKey(),
  asOfDate: timestamp("as_of_date", { withTimezone: true }).notNull(),
  playerId: integer("player_id").notNull().references(() => players.id),
  
  // State on this day
  engagementState: text("engagement_state").notNull(),
  extractorClassification: text("extractor_classification").notNull(),
  extractorScore: numeric("extractor_score", { precision: 10, scale: 2 }).notNull(),
  
  // Cumulative counts at this date
  totalSessions: integer("total_sessions").notNull(),
  totalMessages: integer("total_messages").notNull(),
  totalMilestones: integer("total_milestones").notNull(),
  
  // Activity on this day
  sessionsToday: integer("sessions_today").default(0).notNull(),
  messagesToday: integer("messages_today").default(0).notNull(),
  milestonesToday: integer("milestones_today").default(0).notNull(),
  
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  asOfDatePlayerIdx: uniqueIndex("daily_player_snapshots_date_player_idx").on(table.asOfDate, table.playerId),
  asOfDateIdx: index("daily_player_snapshots_as_of_date_idx").on(table.asOfDate),
  engagementStateIdx: index("daily_player_snapshots_engagement_idx").on(table.engagementState),
}));

/**
 * Extractor signals - Track individual extraction behavior patterns
 */
export const extractorSignals = pgTable("extractor_signals", {
  id: serial("id").primaryKey(),
  playerId: integer("player_id").notNull().references(() => players.id),
  wallet: text("wallet").notNull(),
  signalType: text("signal_type").notNull(), // 'floor_hero_flip', 'immediate_reward_sale', 'multi_hero_flip', etc.
  signalStrength: numeric("signal_strength", { precision: 5, scale: 2 }).notNull(), // 0.0 to 10.0
  detectedAt: timestamp("detected_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  relatedTransactionHash: text("related_transaction_hash"),
  relatedHeroId: bigint("related_hero_id", { mode: "number" }),
  
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  playerIdIdx: index("extractor_signals_player_id_idx").on(table.playerId),
  walletIdx: index("extractor_signals_wallet_idx").on(table.wallet),
  signalTypeIdx: index("extractor_signals_type_idx").on(table.signalType),
  detectedAtIdx: index("extractor_signals_detected_at_idx").on(table.detectedAt),
}));

// Additional player tracking schemas
export const jewelBalances = pgTable("jewel_balances", {
  id: serial("id").primaryKey(),
  wallet: text("wallet").notNull().unique(),
  balance: numeric("balance", { precision: 30, scale: 18 }).notNull(),
  lastUpdated: timestamp("last_updated", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const depositRequests = pgTable("deposit_requests", {
  id: serial("id").primaryKey(),
  discordId: text("discord_id").notNull(),
  walletAddress: text("wallet_address").notNull(),
  amount: numeric("amount", { precision: 30, scale: 18 }).notNull(),
  tokenAddress: text("token_address").notNull(),
  status: text("status").notNull().default('pending'), // 'pending', 'confirmed', 'expired', 'errored'
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  confirmationReceivedAt: timestamp("confirmation_received_at", { withTimezone: true }),
  transactionHash: text("transaction_hash"),
  errorReason: text("error_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const queryCosts = pgTable("query_costs", {
  id: serial("id").primaryKey(),
  discordId: text("discord_id").notNull(),
  queryType: text("query_type").notNull(),
  costJewel: numeric("cost_jewel", { precision: 30, scale: 18 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const gardenOptimizations = pgTable("garden_optimizations", {
  id: serial("id").primaryKey(),
  playerId: integer("player_id").notNull().references(() => players.id),
  status: text("status").notNull().default('pending'), // 'pending', 'processing', 'completed', 'failed', 'expired'
  requestedAt: timestamp("requested_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  expectedAmountJewel: numeric("expected_amount_jewel", { precision: 30, scale: 18 }).notNull(),
  fromWallet: text("from_wallet").notNull(),
  txHash: text("tx_hash"),
  lpSnapshot: json("lp_snapshot").$type<any>(),
  reportPayload: json("report_payload").$type<any>(),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  paymentVerifiedAt: timestamp("payment_verified_at", { withTimezone: true }),
  startBlock: bigint("start_block", { mode: "number" }),
  lastScannedBlock: bigint("last_scanned_block", { mode: "number" }),
});

export const walletSnapshots = pgTable("wallet_snapshots", {
  id: serial("id").primaryKey(),
  playerId: integer("player_id").notNull().references(() => players.id),
  wallet: text("wallet").notNull(),
  asOfDate: timestamp("as_of_date", { withTimezone: true }).notNull(),
  jewelBalance: numeric("jewel_balance", { precision: 30, scale: 18 }).notNull(),
  crystalBalance: numeric("crystal_balance", { precision: 30, scale: 18 }).notNull().default('0'),
  cJewelBalance: numeric("c_jewel_balance", { precision: 30, scale: 18 }).notNull().default('0'),
  jewelPriceUsd: numeric("jewel_price_usd", { precision: 15, scale: 2 }),
  crystalPriceUsd: numeric("crystal_price_usd", { precision: 15, scale: 2 }),
  lifetimeDeposit: numeric("lifetime_deposit", { precision: 30, scale: 18 }).notNull().default('0'),
  change7d: numeric("change_7d", { precision: 30, scale: 18 }),
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
});

// ============================================================================
// BRIDGE TRACKING TABLES (Admin-only extractor identification)
// ============================================================================

/**
 * Raw bridge events - stores all bridge transactions for a wallet
 * Includes token transfers (ItemBridge), heroes (HeroBridge), equipment/pets (EquipmentBridge)
 */
export const bridgeEvents = pgTable("bridge_events", {
  id: serial("id").primaryKey(),
  wallet: text("wallet").notNull(),
  bridgeType: text("bridge_type").notNull(), // 'item', 'hero', 'equipment', 'pet'
  direction: text("direction").notNull(), // 'in' (to DFK Chain) or 'out' (from DFK Chain)
  
  // Token/asset details
  tokenAddress: text("token_address"), // null for heroes/pets
  tokenSymbol: text("token_symbol"), // JEWEL, CRYSTAL, etc or 'HERO', 'PET'
  amount: numeric("amount", { precision: 30, scale: 18 }), // token amount (null for NFTs)
  assetId: bigint("asset_id", { mode: "number" }), // heroId, petId, equipmentId (null for tokens)
  
  // USD value at time of bridge
  usdValue: numeric("usd_value", { precision: 15, scale: 2 }),
  tokenPriceUsd: numeric("token_price_usd", { precision: 15, scale: 6 }), // price used for calculation
  
  // Chain info
  srcChainId: integer("src_chain_id").notNull(),
  dstChainId: integer("dst_chain_id").notNull(),
  
  // Transaction details
  txHash: text("tx_hash").notNull(),
  blockNumber: bigint("block_number", { mode: "number" }).notNull(),
  blockTimestamp: timestamp("block_timestamp", { withTimezone: true }).notNull(),
  
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  walletIdx: index("bridge_events_wallet_idx").on(table.wallet),
  directionIdx: index("bridge_events_direction_idx").on(table.direction),
  bridgeTypeIdx: index("bridge_events_type_idx").on(table.bridgeType),
  blockTimestampIdx: index("bridge_events_timestamp_idx").on(table.blockTimestamp),
  txHashIdx: uniqueIndex("bridge_events_tx_hash_idx").on(table.txHash, table.wallet, table.bridgeType),
}));

export const insertBridgeEventSchema = createInsertSchema(bridgeEvents).omit({ id: true, createdAt: true });
export type InsertBridgeEvent = z.infer<typeof insertBridgeEventSchema>;
export type BridgeEvent = typeof bridgeEvents.$inferSelect;

/**
 * Wallet bridge metrics - aggregated bridge data per wallet for quick queries
 */
export const walletBridgeMetrics = pgTable("wallet_bridge_metrics", {
  id: serial("id").primaryKey(),
  wallet: text("wallet").notNull().unique(),
  playerId: integer("player_id").references(() => players.id), // optional link to player
  
  // Token bridge totals (USD)
  totalBridgedInUsd: numeric("total_bridged_in_usd", { precision: 15, scale: 2 }).notNull().default('0'),
  totalBridgedOutUsd: numeric("total_bridged_out_usd", { precision: 15, scale: 2 }).notNull().default('0'),
  netExtractedUsd: numeric("net_extracted_usd", { precision: 15, scale: 2 }).notNull().default('0'),
  
  // By token type (JSON breakdown)
  bridgeInByToken: json("bridge_in_by_token").$type<Record<string, number>>(), // {JEWEL: 1000, CRYSTAL: 500}
  bridgeOutByToken: json("bridge_out_by_token").$type<Record<string, number>>(),
  
  // NFT counts
  heroesIn: integer("heroes_in").notNull().default(0),
  heroesOut: integer("heroes_out").notNull().default(0),
  petsIn: integer("pets_in").notNull().default(0),
  petsOut: integer("pets_out").notNull().default(0),
  equipmentIn: integer("equipment_in").notNull().default(0),
  equipmentOut: integer("equipment_out").notNull().default(0),
  
  // Tracking state
  firstBridgeAt: timestamp("first_bridge_at", { withTimezone: true }),
  lastBridgeAt: timestamp("last_bridge_at", { withTimezone: true }),
  lastProcessedBlock: bigint("last_processed_block", { mode: "number" }).notNull().default(0),
  totalTransactions: integer("total_transactions").notNull().default(0),
  
  // Extractor scoring
  extractorScore: numeric("extractor_score", { precision: 5, scale: 2 }), // 0-10 scale
  extractorFlags: json("extractor_flags").$type<string[]>(), // ['net_negative', 'quick_flip', etc]
  
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  walletIdx: uniqueIndex("wallet_bridge_metrics_wallet_idx").on(table.wallet),
  playerIdIdx: index("wallet_bridge_metrics_player_idx").on(table.playerId),
  netExtractedIdx: index("wallet_bridge_metrics_extracted_idx").on(table.netExtractedUsd),
  extractorScoreIdx: index("wallet_bridge_metrics_score_idx").on(table.extractorScore),
}));

export const insertWalletBridgeMetricsSchema = createInsertSchema(walletBridgeMetrics).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertWalletBridgeMetrics = z.infer<typeof insertWalletBridgeMetricsSchema>;
export type WalletBridgeMetrics = typeof walletBridgeMetrics.$inferSelect;

/**
 * Historical token prices cache - stores hourly prices for USD calculations
 */
export const historicalPrices = pgTable("historical_prices", {
  id: serial("id").primaryKey(),
  tokenSymbol: text("token_symbol").notNull(),
  priceUsd: numeric("price_usd", { precision: 15, scale: 6 }).notNull(),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull(), // hourly granularity
  source: text("source").notNull().default('coingecko'), // 'coingecko', 'manual', etc
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  tokenTimestampIdx: uniqueIndex("historical_prices_token_ts_idx").on(table.tokenSymbol, table.timestamp),
  timestampIdx: index("historical_prices_timestamp_idx").on(table.timestamp),
}));

export const insertHistoricalPriceSchema = createInsertSchema(historicalPrices).omit({ id: true, createdAt: true });
export type InsertHistoricalPrice = z.infer<typeof insertHistoricalPriceSchema>;
export type HistoricalPrice = typeof historicalPrices.$inferSelect;

/**
 * Bridge indexer progress - tracks the last indexed block for resumable indexing
 */
export const bridgeIndexerProgress = pgTable("bridge_indexer_progress", {
  id: serial("id").primaryKey(),
  indexerName: text("indexer_name").notNull().unique(), // 'synapse_main', 'synapse_backfill', etc.
  lastIndexedBlock: bigint("last_indexed_block", { mode: "number" }).notNull().default(0),
  genesisBlock: bigint("genesis_block", { mode: "number" }).notNull().default(0), // first block to index from
  targetBlock: bigint("target_block", { mode: "number" }), // optional end block for backfill
  status: text("status").notNull().default('idle'), // 'idle', 'running', 'completed', 'error'
  totalEventsIndexed: integer("total_events_indexed").notNull().default(0),
  eventsNeedingPrices: integer("events_needing_prices").notNull().default(0), // events without USD values
  lastError: text("last_error"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  // Batch runtime tracking for incremental indexing
  lastBatchRuntimeMs: integer("last_batch_runtime_ms"), // Runtime of last 10K block batch in milliseconds
  totalBatchCount: integer("total_batch_count").notNull().default(0), // Number of 10K batches completed
  totalBatchRuntimeMs: bigint("total_batch_runtime_ms", { mode: "number" }).notNull().default(0), // Sum of all batch runtimes for average calculation
});

export type BridgeIndexerProgress = typeof bridgeIndexerProgress.$inferSelect;

// ============================================================================
// SMURF DETECTION & LEAGUE SIGNUP SCHEMA
// ============================================================================

/**
 * Wallet clusters - groups wallets belonging to a single player/user
 * Used for smurf detection and fair tier placement
 */
export const walletClusters = pgTable("wallet_clusters", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id", { length: 128 }).notNull(), // Discord user ID
  clusterKey: varchar("cluster_key", { length: 64 }).notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  userIdIdx: index("wallet_clusters_user_id_idx").on(table.userId),
  clusterKeyIdx: uniqueIndex("wallet_clusters_cluster_key_idx").on(table.clusterKey),
}));

export const insertWalletClusterSchema = createInsertSchema(walletClusters).omit({ id: true, createdAt: true });
export type InsertWalletCluster = z.infer<typeof insertWalletClusterSchema>;
export type WalletCluster = typeof walletClusters.$inferSelect;

/**
 * Wallet links - links chain addresses to wallet clusters
 */
export const walletLinks = pgTable("wallet_links", {
  id: serial("id").primaryKey(),
  clusterKey: varchar("cluster_key", { length: 64 }).notNull(),
  chain: varchar("chain", { length: 32 }).notNull(), // "DFKCHAIN", "KLAYTN", etc.
  address: varchar("address", { length: 64 }).notNull(),
  isPrimary: boolean("is_primary").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  clusterKeyIdx: index("wallet_links_cluster_key_idx").on(table.clusterKey),
  addressIdx: index("wallet_links_address_idx").on(table.address),
  chainAddressIdx: uniqueIndex("wallet_links_chain_address_idx").on(table.chain, table.address),
}));

export const insertWalletLinkSchema = createInsertSchema(walletLinks).omit({ id: true, createdAt: true });
export type InsertWalletLink = z.infer<typeof insertWalletLinkSchema>;
export type WalletLink = typeof walletLinks.$inferSelect;

/**
 * Wallet power snapshots - tracks power score and tier over time
 * Used for detecting sudden power spikes (potential smurfing)
 */
export const walletPowerSnapshots = pgTable("wallet_power_snapshots", {
  id: serial("id").primaryKey(),
  clusterKey: varchar("cluster_key", { length: 64 }).notNull(),
  address: varchar("address", { length: 64 }).notNull(),
  powerScore: integer("power_score").notNull(),
  tierCode: varchar("tier_code", { length: 32 }).notNull(), // COMMON, UNCOMMON, RARE, LEGENDARY, MYTHIC
  takenAt: timestamp("taken_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  meta: json("meta").$type<{
    heroCount?: number;
    totalLevels?: number;
    netWorthUsd?: number;
    accountAgeDays?: number;
  }>(),
}, (table) => ({
  clusterKeyIdx: index("wallet_power_snapshots_cluster_key_idx").on(table.clusterKey),
  addressIdx: index("wallet_power_snapshots_address_idx").on(table.address),
  takenAtIdx: index("wallet_power_snapshots_taken_at_idx").on(table.takenAt),
}));

export const insertWalletPowerSnapshotSchema = createInsertSchema(walletPowerSnapshots).omit({ id: true });
export type InsertWalletPowerSnapshot = z.infer<typeof insertWalletPowerSnapshotSchema>;
export type WalletPowerSnapshot = typeof walletPowerSnapshots.$inferSelect;

/**
 * Wallet transfer aggregates - aggregated inbound/outbound transfers over time windows
 * Used for detecting power transfers before league signups
 */
export const walletTransferAggregates = pgTable("wallet_transfer_aggregates", {
  id: serial("id").primaryKey(),
  address: varchar("address", { length: 64 }).notNull(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  windowEnd: timestamp("window_end", { withTimezone: true }).notNull(),
  inboundPowerDelta: integer("inbound_power_delta").notNull().default(0),
  outboundPowerDelta: integer("outbound_power_delta").notNull().default(0),
  inboundTxCount: integer("inbound_tx_count").notNull().default(0),
  outboundTxCount: integer("outbound_tx_count").notNull().default(0),
  meta: json("meta").$type<{
    heroTransfers?: number;
    tokenTransfersUsd?: number;
  }>(),
}, (table) => ({
  addressIdx: index("wallet_transfer_aggregates_address_idx").on(table.address),
  windowIdx: index("wallet_transfer_aggregates_window_idx").on(table.windowStart, table.windowEnd),
}));

export const insertWalletTransferAggregateSchema = createInsertSchema(walletTransferAggregates).omit({ id: true });
export type InsertWalletTransferAggregate = z.infer<typeof insertWalletTransferAggregateSchema>;
export type WalletTransferAggregate = typeof walletTransferAggregates.$inferSelect;

/**
 * Smurf detection rules - configurable rules for detecting smurfs
 */
export const smurfDetectionRules = pgTable("smurf_detection_rules", {
  id: serial("id").primaryKey(),
  key: varchar("key", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 128 }).notNull(),
  description: varchar("description", { length: 512 }),
  enabled: boolean("enabled").notNull().default(true),
  severity: varchar("severity", { length: 32 }).notNull(), // INFO, WARN, CRITICAL
  defaultAction: varchar("default_action", { length: 32 }).notNull(), // ESCALATE_TIER, DISQUALIFY, FLAG_REVIEW
  config: json("config").$type<{
    threshold?: number;
    windowDays?: number;
    tierThreshold?: string;
    [key: string]: unknown;
  }>(),
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  keyIdx: uniqueIndex("smurf_detection_rules_key_idx").on(table.key),
  enabledIdx: index("smurf_detection_rules_enabled_idx").on(table.enabled),
}));

export const insertSmurfDetectionRuleSchema = createInsertSchema(smurfDetectionRules).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSmurfDetectionRule = z.infer<typeof insertSmurfDetectionRuleSchema>;
export type SmurfDetectionRule = typeof smurfDetectionRules.$inferSelect;

/**
 * Smurf incidents - records of triggered smurf detection rules
 */
export const smurfIncidents = pgTable("smurf_incidents", {
  id: serial("id").primaryKey(),
  clusterKey: varchar("cluster_key", { length: 64 }).notNull(),
  seasonId: integer("season_id"),
  walletAddress: varchar("wallet_address", { length: 64 }),
  ruleKey: varchar("rule_key", { length: 64 }).notNull(),
  severity: varchar("severity", { length: 32 }).notNull(), // INFO, WARN, CRITICAL
  actionTaken: varchar("action_taken", { length: 32 }).notNull(), // NONE, ESCALATE_TIER, DISQUALIFY, FLAG_REVIEW
  reason: varchar("reason", { length: 512 }),
  details: json("details").$type<{
    powerDelta?: number;
    oldTier?: string;
    newTier?: string;
    [key: string]: unknown;
  }>(),
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  clusterKeyIdx: index("smurf_incidents_cluster_key_idx").on(table.clusterKey),
  seasonIdIdx: index("smurf_incidents_season_id_idx").on(table.seasonId),
  ruleKeyIdx: index("smurf_incidents_rule_key_idx").on(table.ruleKey),
  createdAtIdx: index("smurf_incidents_created_at_idx").on(table.createdAt),
}));

export const insertSmurfIncidentSchema = createInsertSchema(smurfIncidents).omit({ id: true, createdAt: true });
export type InsertSmurfIncident = z.infer<typeof insertSmurfIncidentSchema>;
export type SmurfIncident = typeof smurfIncidents.$inferSelect;

/**
 * Season tier locks - locks a player's tier for a specific season
 * Prevents tier manipulation during active seasons
 */
export const seasonTierLocks = pgTable("season_tier_locks", {
  id: serial("id").primaryKey(),
  seasonId: integer("season_id").notNull(),
  clusterKey: varchar("cluster_key", { length: 64 }).notNull(),
  lockedTierCode: varchar("locked_tier_code", { length: 32 }).notNull(), // COMMON, UNCOMMON, RARE, LEGENDARY, MYTHIC
  lockedAt: timestamp("locked_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  upwardOnly: boolean("upward_only").notNull().default(true), // Can only move to higher tiers, not lower
}, (table) => ({
  seasonClusterIdx: uniqueIndex("season_tier_locks_season_cluster_idx").on(table.seasonId, table.clusterKey),
  seasonIdIdx: index("season_tier_locks_season_id_idx").on(table.seasonId),
  clusterKeyIdx: index("season_tier_locks_cluster_key_idx").on(table.clusterKey),
}));

export const insertSeasonTierLockSchema = createInsertSchema(seasonTierLocks).omit({ id: true });
export type InsertSeasonTierLock = z.infer<typeof insertSeasonTierLockSchema>;
export type SeasonTierLock = typeof seasonTierLocks.$inferSelect;

/**
 * League seasons - defines challenge league seasons
 */
export const leagueSeasons = pgTable("league_seasons", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  description: text("description"),
  status: varchar("status", { length: 32 }).notNull().default("UPCOMING"), // UPCOMING, REGISTRATION, ACTIVE, COMPLETED
  registrationStart: timestamp("registration_start", { withTimezone: true }).notNull(),
  registrationEnd: timestamp("registration_end", { withTimezone: true }).notNull(),
  seasonStart: timestamp("season_start", { withTimezone: true }).notNull(),
  seasonEnd: timestamp("season_end", { withTimezone: true }).notNull(),
  entryFeeAmount: numeric("entry_fee_amount", { precision: 30, scale: 18 }),
  entryFeeToken: varchar("entry_fee_token", { length: 32 }), // JEWEL, CRYSTAL
  entryFeeAddress: varchar("entry_fee_address", { length: 64 }), // Address to pay entry fee to
  config: json("config").$type<{
    maxPlayersPerTier?: number;
    prizePool?: { [tier: string]: number };
    [key: string]: unknown;
  }>(),
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  statusIdx: index("league_seasons_status_idx").on(table.status),
  registrationStartIdx: index("league_seasons_reg_start_idx").on(table.registrationStart),
}));

export const insertLeagueSeasonSchema = createInsertSchema(leagueSeasons).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertLeagueSeason = z.infer<typeof insertLeagueSeasonSchema>;
export type LeagueSeason = typeof leagueSeasons.$inferSelect;

/**
 * League signups - records of player signups for league seasons
 */
export const leagueSignups = pgTable("league_signups", {
  id: serial("id").primaryKey(),
  seasonId: integer("season_id").notNull(),
  userId: varchar("user_id", { length: 128 }).notNull(), // Discord user ID
  clusterKey: varchar("cluster_key", { length: 64 }).notNull(),
  walletAddress: varchar("wallet_address", { length: 64 }).notNull(),
  baseTierCode: varchar("base_tier_code", { length: 32 }).notNull(), // Original computed tier
  lockedTierCode: varchar("locked_tier_code", { length: 32 }).notNull(), // Final tier after smurf check
  tierAdjusted: boolean("tier_adjusted").notNull().default(false),
  disqualified: boolean("disqualified").notNull().default(false),
  disqualificationReason: varchar("disqualification_reason", { length: 512 }),
  entryFeePaid: boolean("entry_fee_paid").notNull().default(false),
  entryFeeTxHash: varchar("entry_fee_tx_hash", { length: 128 }),
  status: varchar("status", { length: 32 }).notNull().default("PENDING"), // PENDING, CONFIRMED, DISQUALIFIED
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  seasonUserIdx: uniqueIndex("league_signups_season_user_idx").on(table.seasonId, table.userId),
  seasonIdIdx: index("league_signups_season_id_idx").on(table.seasonId),
  userIdIdx: index("league_signups_user_id_idx").on(table.userId),
  clusterKeyIdx: index("league_signups_cluster_key_idx").on(table.clusterKey),
  statusIdx: index("league_signups_status_idx").on(table.status),
}));

export const insertLeagueSignupSchema = createInsertSchema(leagueSignups).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertLeagueSignup = z.infer<typeof insertLeagueSignupSchema>;
export type LeagueSignup = typeof leagueSignups.$inferSelect;
