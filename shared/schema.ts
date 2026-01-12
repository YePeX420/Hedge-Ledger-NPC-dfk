import { sql } from "drizzle-orm";
import { pgTable, text, varchar, serial, bigint, numeric, timestamp, integer, boolean, json, index, uniqueIndex, primaryKey } from "drizzle-orm/pg-core";
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
  pricingSource: text("pricing_source"), // 'DEFI_LLAMA', 'COINGECKO', 'DEX_DERIVED', 'DEPRECATED_TOKEN'
  
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
  lastBridgeAmountUsd: numeric("last_bridge_amount_usd", { precision: 15, scale: 2 }),
  lastProcessedBlock: bigint("last_processed_block", { mode: "number" }).notNull().default(0),
  totalTransactions: integer("total_transactions").notNull().default(0),
  
  // DFK profile info
  summonerName: text("summoner_name"), // From DFK GraphQL profile lookup
  
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
 * Unpriced tokens - tracks tokens that appear in bridge events but cannot be priced
 * Used to identify deprecated/dead tokens and tokens needing DEX price derivation
 */
export const unpricedTokens = pgTable("unpriced_tokens", {
  id: serial("id").primaryKey(),
  tokenAddress: text("token_address").notNull().unique(),
  tokenSymbol: text("token_symbol"),
  firstSeenTimestamp: timestamp("first_seen_timestamp", { withTimezone: true }),
  lastSeenTimestamp: timestamp("last_seen_timestamp", { withTimezone: true }),
  totalEvents: integer("total_events").notNull().default(0),
  hasDexLiquidity: boolean("has_dex_liquidity").notNull().default(false),
  hasExternalPrice: boolean("has_external_price").notNull().default(false),
  pricingStatus: text("pricing_status").notNull().default('unknown'), // 'unknown', 'deprecated', 'dex_derivable', 'priced'
  lpPairAddress: text("lp_pair_address"), // deepest LP pair if exists
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  tokenAddressIdx: uniqueIndex("unpriced_tokens_address_idx").on(table.tokenAddress),
  statusIdx: index("unpriced_tokens_status_idx").on(table.pricingStatus),
}));

export const insertUnpricedTokenSchema = createInsertSchema(unpricedTokens).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUnpricedToken = z.infer<typeof insertUnpricedTokenSchema>;
export type UnpricedToken = typeof unpricedTokens.$inferSelect;

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

// ============================================================================
// CHALLENGE SYSTEM TABLES
// ============================================================================

/**
 * Challenge categories - groups challenges by theme
 * Tier systems: RARITY (Common→Mythic), GENE (Basic→Exalted), MIXED, PRESTIGE
 */
export const challengeCategories = pgTable("challenge_categories", {
  id: serial("id").primaryKey(),
  key: varchar("key", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 128 }).notNull(),
  description: text("description"),
  tierSystem: varchar("tier_system", { length: 32 }).notNull(), // RARITY, GENE, MIXED, PRESTIGE
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  keyIdx: uniqueIndex("challenge_categories_key_idx").on(table.key),
  sortOrderIdx: index("challenge_categories_sort_order_idx").on(table.sortOrder),
}));

export const insertChallengeCategorySchema = createInsertSchema(challengeCategories).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertChallengeCategory = z.infer<typeof insertChallengeCategorySchema>;
export type ChallengeCategory = typeof challengeCategories.$inferSelect;

/**
 * Challenges - individual challenge definitions
 * State lifecycle: draft → validated → deployed → deprecated
 */
export const CHALLENGE_STATES = ["draft", "validated", "deployed", "deprecated"] as const;
export type ChallengeState = typeof CHALLENGE_STATES[number];

export const CHALLENGE_TYPES = ["tiered", "prestige", "seasonal"] as const;
export type ChallengeType = typeof CHALLENGE_TYPES[number];

export const METRIC_AGGREGATIONS = ["sum", "count", "max", "distinct_count"] as const;
export type MetricAggregation = typeof METRIC_AGGREGATIONS[number];

export const TIERING_MODES = ["percentile", "threshold", "none"] as const;
export type TieringMode = typeof TIERING_MODES[number];

export const challenges = pgTable("challenges", {
  id: serial("id").primaryKey(),
  key: varchar("key", { length: 64 }).notNull().unique(),
  categoryKey: varchar("category_key", { length: 64 }).notNull(),
  name: varchar("name", { length: 128 }).notNull(),
  description: text("description"), // Short description for list views
  descriptionLong: text("description_long"), // Detailed description for editor/detail views
  
  // Challenge type and lifecycle state
  challengeType: varchar("challenge_type", { length: 32 }).notNull().default("tiered"), // tiered, prestige, seasonal
  state: varchar("state", { length: 32 }).notNull().default("draft"), // draft, validated, deployed, deprecated
  
  // Metric configuration
  metricType: varchar("metric_type", { length: 32 }).notNull(), // COUNT, STREAK, SCORE, BOOLEAN, COMPOSITE
  metricSource: varchar("metric_source", { length: 64 }).notNull(), // onchain_heroes, behavior_model, etc.
  metricKey: varchar("metric_key", { length: 64 }).notNull(), // The specific metric to track
  metricAggregation: varchar("metric_aggregation", { length: 32 }).notNull().default("count"), // sum, count, max, distinct_count
  metricFilters: json("metric_filters").$type<Record<string, unknown>>().default({}), // Filter clauses like { enemyId: "MOTHERCLUCKER" }
  
  // Tiering configuration
  tierSystemOverride: varchar("tier_system_override", { length: 32 }), // Override category's tier system
  tieringMode: varchar("tiering_mode", { length: 32 }).notNull().default("threshold"), // percentile, threshold, none
  tierConfig: json("tier_config").$type<{
    mode?: string;
    basic?: number;
    advanced?: number;
    elite?: number;
    exalted?: number;
    common?: number;
    uncommon?: number;
    rare?: number;
    legendary?: number;
    mythic?: number;
  }>().default({}), // Percentile breakpoints or threshold overrides
  
  // Behavior flags
  isClusterBased: boolean("is_cluster_based").notNull().default(true), // Track by wallet cluster
  isTestOnly: boolean("is_test_only").notNull().default(false), // Only compute for test users
  isVisibleFe: boolean("is_visible_fe").notNull().default(true), // Show in frontend
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  
  // Admin metadata
  createdBy: varchar("created_by", { length: 128 }), // Admin who created
  updatedBy: varchar("updated_by", { length: 128 }), // Admin who last updated
  
  meta: json("meta").$type<{
    icon?: string;
    tags?: string[];
    tooltip?: string;
  }>(),
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  keyIdx: uniqueIndex("challenges_key_idx").on(table.key),
  categoryKeyIdx: index("challenges_category_key_idx").on(table.categoryKey),
  sortOrderIdx: index("challenges_sort_order_idx").on(table.sortOrder),
  isActiveIdx: index("challenges_is_active_idx").on(table.isActive),
  stateIdx: index("challenges_state_idx").on(table.state),
}));

export const insertChallengeSchema = createInsertSchema(challenges).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertChallenge = z.infer<typeof insertChallengeSchema>;
export type Challenge = typeof challenges.$inferSelect;

/**
 * Challenge validation - tracks auto and manual validation status per challenge
 */
export const challengeValidation = pgTable("challenge_validation", {
  challengeId: integer("challenge_id").primaryKey().references(() => challenges.id, { onDelete: "cascade" }),
  autoChecks: json("auto_checks").$type<{
    hasMetricSource?: boolean;
    fieldValid?: boolean;
    hasTierConfig?: boolean;
    codeUnique?: boolean;
  }>().default({}),
  manualChecks: json("manual_checks").$type<{
    etlOutputVerified?: boolean;
    fePreviewChecked?: boolean;
    copyApproved?: boolean;
    noCategoryConflicts?: boolean;
  }>().default({}),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  lastRunBy: varchar("last_run_by", { length: 128 }),
});

export const insertChallengeValidationSchema = createInsertSchema(challengeValidation);
export type InsertChallengeValidation = z.infer<typeof insertChallengeValidationSchema>;
export type ChallengeValidation = typeof challengeValidation.$inferSelect;

/**
 * Challenge audit log - tracks all changes to challenges for accountability
 */
export const challengeAuditLog = pgTable("challenge_audit_log", {
  id: serial("id").primaryKey(),
  challengeId: integer("challenge_id").references(() => challenges.id, { onDelete: "cascade" }),
  actor: varchar("actor", { length: 128 }).notNull(), // Admin who made the change
  action: varchar("action", { length: 32 }).notNull(), // create, update, state_change, delete
  fromState: varchar("from_state", { length: 32 }),
  toState: varchar("to_state", { length: 32 }),
  payloadDiff: json("payload_diff").$type<Record<string, unknown>>(), // Before/after snapshot or patch
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  challengeIdIdx: index("challenge_audit_log_challenge_id_idx").on(table.challengeId),
  actorIdx: index("challenge_audit_log_actor_idx").on(table.actor),
  actionIdx: index("challenge_audit_log_action_idx").on(table.action),
  createdAtIdx: index("challenge_audit_log_created_at_idx").on(table.createdAt),
}));

export const insertChallengeAuditLogSchema = createInsertSchema(challengeAuditLog).omit({ id: true, createdAt: true });
export type InsertChallengeAuditLog = z.infer<typeof insertChallengeAuditLogSchema>;
export type ChallengeAuditLog = typeof challengeAuditLog.$inferSelect;

/**
 * Challenge tiers - threshold definitions for each challenge
 * Tier codes: COMMON, UNCOMMON, RARE, LEGENDARY, MYTHIC (RARITY)
 *             BASIC, ADVANCED, ELITE, EXALTED (GENE)
 */
export const challengeTiers = pgTable("challenge_tiers", {
  id: serial("id").primaryKey(),
  challengeKey: varchar("challenge_key", { length: 64 }).notNull(),
  tierCode: varchar("tier_code", { length: 32 }).notNull(), // COMMON, UNCOMMON, RARE, etc.
  displayName: varchar("display_name", { length: 64 }).notNull(),
  thresholdValue: integer("threshold_value").notNull(), // The value needed to achieve this tier
  isPrestige: boolean("is_prestige").notNull().default(false), // Ultra-rare tier
  sortOrder: integer("sort_order").notNull().default(0),
  meta: json("meta").$type<{
    description?: string;
  }>(),
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  challengeTierIdx: uniqueIndex("challenge_tiers_challenge_tier_idx").on(table.challengeKey, table.tierCode),
  challengeKeyIdx: index("challenge_tiers_challenge_key_idx").on(table.challengeKey),
  sortOrderIdx: index("challenge_tiers_sort_order_idx").on(table.sortOrder),
}));

export const insertChallengeTierSchema = createInsertSchema(challengeTiers).omit({ id: true, createdAt: true });
export type InsertChallengeTier = z.infer<typeof insertChallengeTierSchema>;
export type ChallengeTier = typeof challengeTiers.$inferSelect;

/**
 * Challenge metric stats - cached calibration statistics for tier tuning
 * Stores percentile distributions and suggested thresholds from challenge_progress data
 */
export const challengeMetricStats = pgTable("challenge_metric_stats", {
  id: serial("id").primaryKey(),
  challengeKey: varchar("challenge_key", { length: 64 }).notNull(),
  cohortKey: varchar("cohort_key", { length: 32 }).notNull().default("ALL"), // ALL, NONZERO, ACTIVE_30D, SEASON_CURRENT
  computedAt: timestamp("computed_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  
  // Population counts
  clusterCount: integer("cluster_count").notNull().default(0),
  nonzeroCount: integer("nonzero_count").notNull().default(0),
  
  // Standard percentiles for display
  minValue: numeric("min_value", { precision: 20, scale: 4 }),
  p10: numeric("p10", { precision: 20, scale: 4 }),
  p25: numeric("p25", { precision: 20, scale: 4 }),
  p40: numeric("p40", { precision: 20, scale: 4 }),
  p50: numeric("p50", { precision: 20, scale: 4 }),
  p70: numeric("p70", { precision: 20, scale: 4 }),
  p75: numeric("p75", { precision: 20, scale: 4 }),
  p90: numeric("p90", { precision: 20, scale: 4 }),
  p95: numeric("p95", { precision: 20, scale: 4 }),
  p97: numeric("p97", { precision: 20, scale: 4 }),
  p99: numeric("p99", { precision: 20, scale: 4 }),
  maxValue: numeric("max_value", { precision: 20, scale: 4 }),
  meanValue: numeric("mean_value", { precision: 20, scale: 4 }),
  
  // Configurable target percentiles (defaults: 0.40, 0.70, 0.90, 0.97)
  targetBasicPct: numeric("target_basic_pct", { precision: 5, scale: 4 }).default("0.4000"),
  targetAdvancedPct: numeric("target_advanced_pct", { precision: 5, scale: 4 }).default("0.7000"),
  targetElitePct: numeric("target_elite_pct", { precision: 5, scale: 4 }).default("0.9000"),
  targetExaltedPct: numeric("target_exalted_pct", { precision: 5, scale: 4 }).default("0.9700"),
  
  // Computed suggested thresholds based on target percentiles
  suggestedBasic: numeric("suggested_basic", { precision: 20, scale: 4 }),
  suggestedAdvanced: numeric("suggested_advanced", { precision: 20, scale: 4 }),
  suggestedElite: numeric("suggested_elite", { precision: 20, scale: 4 }),
  suggestedExalted: numeric("suggested_exalted", { precision: 20, scale: 4 }),
  
  // Metadata and warnings
  meta: json("meta").$type<{
    warnings?: string[];
    zeroInflated?: boolean;
    whaleSkew?: boolean;
    lowSample?: boolean;
  }>(),
}, (table) => ({
  challengeCohortIdx: uniqueIndex("challenge_metric_stats_challenge_cohort_idx").on(table.challengeKey, table.cohortKey),
  challengeKeyIdx: index("challenge_metric_stats_challenge_key_idx").on(table.challengeKey),
  computedAtIdx: index("challenge_metric_stats_computed_at_idx").on(table.computedAt),
}));

export const insertChallengeMetricStatsSchema = createInsertSchema(challengeMetricStats).omit({ id: true, computedAt: true });
export type InsertChallengeMetricStats = z.infer<typeof insertChallengeMetricStatsSchema>;
export type ChallengeMetricStats = typeof challengeMetricStats.$inferSelect;

// ============================================================================
// HUNTING & PVP DATA WAREHOUSE
// ETL source tables for combat challenges (onchain_hunting, onchain_pvp)
// ============================================================================

/**
 * Hunting encounters - indexed hunting results for challenge progress
 * Supports cluster-aware aggregation for multi-wallet players
 */
export const huntingEncounters = pgTable("hunting_encounters", {
  id: serial("id").primaryKey(),
  walletAddress: varchar("wallet_address", { length: 64 }).notNull(),
  clusterKey: varchar("cluster_key", { length: 64 }), // For cluster aggregation
  txHash: varchar("tx_hash", { length: 128 }).notNull().unique(),
  realm: varchar("realm", { length: 32 }).notNull().default("dfk"), // dfk, klaytn
  enemyId: varchar("enemy_id", { length: 64 }).notNull(), // MOTHERCLUCKER, MAD_BOAR, etc.
  result: varchar("result", { length: 16 }).notNull(), // WIN, LOSS, FLEE
  survivingHeroCount: integer("surviving_hero_count").notNull().default(0),
  survivingHeroHp: integer("surviving_hero_hp"), // For miracle detection (exactly 1 HP)
  drops: json("drops").$type<Array<{ itemId: string; quantity: number }>>().default(sql`'[]'::json`),
  encounteredAt: timestamp("encountered_at", { withTimezone: true }).notNull(),
  indexedAt: timestamp("indexed_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  walletIdx: index("hunting_encounters_wallet_idx").on(table.walletAddress),
  clusterKeyIdx: index("hunting_encounters_cluster_key_idx").on(table.clusterKey),
  enemyIdIdx: index("hunting_encounters_enemy_id_idx").on(table.enemyId),
  resultIdx: index("hunting_encounters_result_idx").on(table.result),
  encounteredAtIdx: index("hunting_encounters_encountered_at_idx").on(table.encounteredAt),
}));

export const insertHuntingEncounterSchema = createInsertSchema(huntingEncounters).omit({ id: true, indexedAt: true });
export type InsertHuntingEncounter = z.infer<typeof insertHuntingEncounterSchema>;
export type HuntingEncounter = typeof huntingEncounters.$inferSelect;

/**
 * PvP matches - indexed ranked PvP match results for challenge progress
 * Supports streak calculation and flawless victory detection
 */
export const pvpMatches = pgTable("pvp_matches", {
  id: serial("id").primaryKey(),
  walletAddress: varchar("wallet_address", { length: 64 }).notNull(),
  clusterKey: varchar("cluster_key", { length: 64 }), // For cluster aggregation
  matchId: varchar("match_id", { length: 128 }).notNull().unique(),
  realm: varchar("realm", { length: 32 }).notNull().default("metis"), // metis, dfk
  isRanked: boolean("is_ranked").notNull().default(true),
  outcome: varchar("outcome", { length: 16 }).notNull(), // WIN, LOSS, DRAW
  heroDeaths: integer("hero_deaths").notNull().default(0), // For flawless victory (0 deaths)
  streakGroup: integer("streak_group"), // Computed field for consecutive wins
  matchedAt: timestamp("matched_at", { withTimezone: true }).notNull(),
  indexedAt: timestamp("indexed_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  meta: json("meta").$type<{
    opponentWallet?: string;
    teamSize?: number;
    influenceGained?: number;
  }>(),
}, (table) => ({
  walletIdx: index("pvp_matches_wallet_idx").on(table.walletAddress),
  clusterKeyIdx: index("pvp_matches_cluster_key_idx").on(table.clusterKey),
  outcomeIdx: index("pvp_matches_outcome_idx").on(table.outcome),
  isRankedIdx: index("pvp_matches_is_ranked_idx").on(table.isRanked),
  matchedAtIdx: index("pvp_matches_matched_at_idx").on(table.matchedAt),
}));

export const insertPvpMatchSchema = createInsertSchema(pvpMatches).omit({ id: true, indexedAt: true });
export type InsertPvpMatch = z.infer<typeof insertPvpMatchSchema>;
export type PvpMatch = typeof pvpMatches.$inferSelect;

// ============================================================================
// LP & STAKING DATA WAREHOUSE
// ETL source tables for DeFi participation challenges (onchain_lp, onchain_staking)
// ============================================================================

/**
 * LP position snapshots - daily snapshots of LP positions for duration tracking
 * Used to compute lp_duration_max_days (longest continuous hold) and pool_count
 */
export const lpPositionSnapshots = pgTable("lp_position_snapshots", {
  id: serial("id").primaryKey(),
  walletAddress: varchar("wallet_address", { length: 64 }).notNull(),
  clusterKey: varchar("cluster_key", { length: 64 }),
  poolId: integer("pool_id").notNull(), // PID in gardens
  poolName: varchar("pool_name", { length: 128 }),
  lpAmountWei: varchar("lp_amount_wei", { length: 78 }), // Raw LP token amount
  usdValue: integer("usd_value").notNull().default(0), // Value in cents
  snapshotDate: timestamp("snapshot_date", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  walletIdx: index("lp_position_snapshots_wallet_idx").on(table.walletAddress),
  clusterKeyIdx: index("lp_position_snapshots_cluster_key_idx").on(table.clusterKey),
  poolIdIdx: index("lp_position_snapshots_pool_id_idx").on(table.poolId),
  snapshotDateIdx: index("lp_position_snapshots_snapshot_date_idx").on(table.snapshotDate),
  walletPoolDateIdx: uniqueIndex("lp_position_snapshots_wallet_pool_date_idx").on(table.walletAddress, table.poolId, table.snapshotDate),
}));

export const insertLpPositionSnapshotSchema = createInsertSchema(lpPositionSnapshots).omit({ id: true, createdAt: true });
export type InsertLpPositionSnapshot = z.infer<typeof insertLpPositionSnapshotSchema>;
export type LpPositionSnapshot = typeof lpPositionSnapshots.$inferSelect;

/**
 * LP harvest events - tracks reward harvests for yield_harvester challenge
 */
export const lpHarvestEvents = pgTable("lp_harvest_events", {
  id: serial("id").primaryKey(),
  walletAddress: varchar("wallet_address", { length: 64 }).notNull(),
  clusterKey: varchar("cluster_key", { length: 64 }),
  txHash: varchar("tx_hash", { length: 128 }).notNull().unique(),
  poolId: integer("pool_id").notNull(),
  rewardAmount: varchar("reward_amount", { length: 78 }), // Harvested token amount
  rewardToken: varchar("reward_token", { length: 32 }).default("CRYSTAL"),
  harvestedAt: timestamp("harvested_at", { withTimezone: true }).notNull(),
  indexedAt: timestamp("indexed_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  walletIdx: index("lp_harvest_events_wallet_idx").on(table.walletAddress),
  clusterKeyIdx: index("lp_harvest_events_cluster_key_idx").on(table.clusterKey),
  harvestedAtIdx: index("lp_harvest_events_harvested_at_idx").on(table.harvestedAt),
}));

export const insertLpHarvestEventSchema = createInsertSchema(lpHarvestEvents).omit({ id: true, indexedAt: true });
export type InsertLpHarvestEvent = z.infer<typeof insertLpHarvestEventSchema>;
export type LpHarvestEvent = typeof lpHarvestEvents.$inferSelect;

/**
 * Staking snapshots - tracks Jeweler staking positions over time
 * Used for stake_duration_days (longest continuous stake) and stake amounts
 */
export const stakingSnapshots = pgTable("staking_snapshots", {
  id: serial("id").primaryKey(),
  walletAddress: varchar("wallet_address", { length: 64 }).notNull(),
  clusterKey: varchar("cluster_key", { length: 64 }),
  token: varchar("token", { length: 32 }).notNull().default("JEWEL"), // JEWEL, CRYSTAL, etc.
  stakedAmount: varchar("staked_amount", { length: 78 }).notNull(), // Raw token amount
  usdValue: integer("usd_value").notNull().default(0), // Value in cents
  snapshotDate: timestamp("snapshot_date", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  walletIdx: index("staking_snapshots_wallet_idx").on(table.walletAddress),
  clusterKeyIdx: index("staking_snapshots_cluster_key_idx").on(table.clusterKey),
  tokenIdx: index("staking_snapshots_token_idx").on(table.token),
  snapshotDateIdx: index("staking_snapshots_snapshot_date_idx").on(table.snapshotDate),
  walletTokenDateIdx: uniqueIndex("staking_snapshots_wallet_token_date_idx").on(table.walletAddress, table.token, table.snapshotDate),
}));

export const insertStakingSnapshotSchema = createInsertSchema(stakingSnapshots).omit({ id: true, createdAt: true });
export type InsertStakingSnapshot = z.infer<typeof insertStakingSnapshotSchema>;
export type StakingSnapshot = typeof stakingSnapshots.$inferSelect;

/**
 * Relic drop table config - defines which itemIds count as relics
 * Used by hunting ETL to compute relics_found metric
 */
export const RELIC_DROP_TABLE = [
  "ANCIENT_RELIC",
  "MYSTIC_RELIC",
  "DIVINE_RELIC",
  "CRYSTAL_RELIC",
  "GOLDEN_RELIC",
] as const;
export type RelicItemId = typeof RELIC_DROP_TABLE[number];

/**
 * Player challenge progress - tracks individual player progress on challenges
 */
export const playerChallengeProgress = pgTable("player_challenge_progress", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id", { length: 128 }).notNull(), // Discord user ID
  walletAddress: varchar("wallet_address", { length: 64 }), // Optional wallet for on-chain challenges
  clusterId: varchar("cluster_id", { length: 128 }), // Cluster key for cluster-based aggregation
  challengeKey: varchar("challenge_key", { length: 64 }).notNull(),
  currentValue: integer("current_value").notNull().default(0), // Current progress value (renamed to 'value' in queries)
  highestTierAchieved: varchar("highest_tier_achieved", { length: 32 }), // Tier code of highest tier achieved
  achievedAt: timestamp("achieved_at", { withTimezone: true }), // When the highest tier was achieved
  foundersMarkAchieved: boolean("founders_mark_achieved").notNull().default(false), // True if ever reached top tier (isPrestige=true tier)
  foundersMarkAt: timestamp("founders_mark_at", { withTimezone: true }), // When founder's mark was earned
  lastUpdated: timestamp("last_updated", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(), // For time-windowed leaderboards
  meta: json("meta").$type<{
    streakStart?: string;
    streakEnd?: string;
    history?: { value: number; date: string }[];
  }>(),
}, (table) => ({
  userChallengeIdx: uniqueIndex("player_challenge_progress_user_challenge_idx").on(table.userId, table.challengeKey),
  userIdIdx: index("player_challenge_progress_user_id_idx").on(table.userId),
  challengeKeyIdx: index("player_challenge_progress_challenge_key_idx").on(table.challengeKey),
  walletIdx: index("player_challenge_progress_wallet_idx").on(table.walletAddress),
  clusterIdx: index("player_challenge_progress_cluster_idx").on(table.clusterId),
  updatedAtIdx: index("player_challenge_progress_updated_at_idx").on(table.updatedAt),
}));

export const insertPlayerChallengeProgressSchema = createInsertSchema(playerChallengeProgress).omit({ id: true });
export type InsertPlayerChallengeProgress = z.infer<typeof insertPlayerChallengeProgressSchema>;
export type PlayerChallengeProgress = typeof playerChallengeProgress.$inferSelect;

/**
 * Challenge progress windowed - rolling 180-day challenge values and tiers
 * Represents the current competitive state of a challenge within a time window
 * Primary key is (wallet_address, challenge_key, window_key) for per-wallet tracking
 */
export const challengeProgressWindowed = pgTable("challenge_progress_windowed", {
  walletAddress: text("wallet_address").notNull(), // Primary key - individual wallet
  clusterId: varchar("cluster_id", { length: 128 }), // Nullable - linked cluster if known
  challengeKey: varchar("challenge_key", { length: 64 }).notNull(),
  windowKey: varchar("window_key", { length: 16 }).notNull().default('180d'), // Start with '180d'
  value: numeric("value", { precision: 20, scale: 4 }).notNull().default('0'),
  tierCode: varchar("tier_code", { length: 32 }), // Computed tier based on value
  computedAt: timestamp("computed_at", { withTimezone: true }).notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => ({
  pk: primaryKey({ columns: [table.walletAddress, table.challengeKey, table.windowKey] }),
  challengeWindowIdx: index("cpw_challenge_window_idx").on(table.challengeKey, table.windowKey),
  walletWindowIdx: index("cpw_wallet_window_idx").on(table.walletAddress, table.windowKey),
  clusterWindowIdx: index("cpw_cluster_window_idx").on(table.clusterId, table.windowKey),
}));

export const insertChallengeProgressWindowedSchema = createInsertSchema(challengeProgressWindowed);
export type InsertChallengeProgressWindowed = z.infer<typeof insertChallengeProgressWindowedSchema>;
export type ChallengeProgressWindowed = typeof challengeProgressWindowed.$inferSelect;

// ============================================================================
// LEVEL RACER - CLASS ARENA EDITION
// ============================================================================

// Quest professions for Level Racer pools
export const QUEST_PROFESSIONS = ["gardening", "mining", "fishing", "foraging"] as const;
export type QuestProfession = typeof QUEST_PROFESSIONS[number];

/**
 * Hero classes - catalog of available hero classes for arena pools
 */
export const heroClasses = pgTable("hero_classes", {
  id: serial("id").primaryKey(),
  slug: varchar("slug", { length: 64 }).notNull().unique(),
  displayName: varchar("display_name", { length: 128 }).notNull(),
  isEnabled: boolean("is_enabled").notNull().default(true),
  isBasic: boolean("is_basic").notNull().default(true), // Basic classes only for Level Racer (not advanced like Paladin, Sage, etc.)
}, (table) => ({
  slugIdx: uniqueIndex("hero_classes_slug_idx").on(table.slug),
}));

export const insertHeroClassSchema = createInsertSchema(heroClasses).omit({ id: true });
export type InsertHeroClass = z.infer<typeof insertHeroClassSchema>;
export type HeroClass = typeof heroClasses.$inferSelect;

/**
 * Class pools - arena pool per hero class per profession
 * Only one non-FINISHED pool per (heroClassId, profession) combo at a time
 */
export const classPools = pgTable("class_pools", {
  id: serial("id").primaryKey(),
  heroClassId: integer("hero_class_id").notNull().references(() => heroClasses.id),
  profession: varchar("profession", { length: 32 }).notNull().default("gardening"), // Quest profession: gardening, mining, fishing, foraging
  level: integer("level").notNull().default(1),
  state: varchar("state", { length: 16 }).notNull().default("OPEN"), // OPEN, FILLING, RACING, FINISHED
  maxEntries: integer("max_entries").notNull().default(6),
  
  // USD-based pricing (admin sets in USD, converted to token at join time)
  usdEntryFee: numeric("usd_entry_fee", { precision: 10, scale: 2 }).notNull().default("5.00"),
  usdPrize: numeric("usd_prize", { precision: 10, scale: 2 }).notNull().default("40.00"),
  tokenType: varchar("token_type", { length: 16 }).notNull().default("JEWEL"), // JEWEL, CRYSTAL, USDC
  
  // Legacy token fields (calculated from USD at join time, for display/tracking)
  jewelEntryFee: integer("jewel_entry_fee").notNull().default(25),
  jewelPrize: integer("jewel_prize").notNull().default(200),
  totalFeesCollected: integer("total_fees_collected").notNull().default(0), // Tracks fees collected as heroes join
  totalFeesCollectedUsd: numeric("total_fees_collected_usd", { precision: 10, scale: 2 }).notNull().default("0.00"),
  
  // Special race filters
  rarityFilter: varchar("rarity_filter", { length: 16 }).notNull().default("common"), // Max rarity allowed: common, uncommon, rare, legendary, mythic
  maxMutations: integer("max_mutations"), // null = no limit, 0 = no mutations allowed
  
  // Pool lifecycle
  isRecurrent: boolean("is_recurrent").notNull().default(true), // Auto-reopen identical pool when race ends
  prizeAwarded: boolean("prize_awarded").notNull().default(false), // Set true when winner receives prize
  winnerEntryId: integer("winner_entry_id"),
  
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
}, (table) => ({
  heroClassIdIdx: index("class_pools_hero_class_id_idx").on(table.heroClassId),
  stateIdx: index("class_pools_state_idx").on(table.state),
  heroClassStateIdx: index("class_pools_hero_class_state_idx").on(table.heroClassId, table.state),
}));

export const insertClassPoolSchema = createInsertSchema(classPools).omit({ id: true, createdAt: true });
export type InsertClassPool = z.infer<typeof insertClassPoolSchema>;
export type ClassPool = typeof classPools.$inferSelect;

/**
 * Pool entries - hero entries into a pool
 */
export const poolEntries = pgTable("pool_entries", {
  id: serial("id").primaryKey(),
  classPoolId: integer("class_pool_id").notNull().references(() => classPools.id),
  walletAddress: varchar("wallet_address", { length: 64 }).notNull(),
  heroId: varchar("hero_id", { length: 64 }).notNull(),
  heroClassSlug: varchar("hero_class_slug", { length: 64 }).notNull(),
  heroLevel: integer("hero_level").notNull(),
  heroRarity: varchar("hero_rarity", { length: 16 }).notNull(), // common, uncommon, rare, legendary, mythic
  heroHasStone: boolean("hero_has_stone").notNull().default(false),
  heroInitialXp: integer("hero_initial_xp").notNull().default(0),
  heroCurrentXp: integer("hero_current_xp").notNull().default(0),
  heroReadyToLevel: boolean("hero_ready_to_level").notNull().default(false),
  joinedAt: timestamp("joined_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  isWinner: boolean("is_winner").notNull().default(false),
  claimedExtraHeroId: varchar("claimed_extra_hero_id", { length: 64 }),
}, (table) => ({
  classPoolIdIdx: index("pool_entries_class_pool_id_idx").on(table.classPoolId),
  walletAddressIdx: index("pool_entries_wallet_address_idx").on(table.walletAddress),
  heroIdIdx: index("pool_entries_hero_id_idx").on(table.heroId),
}));

export const insertPoolEntrySchema = createInsertSchema(poolEntries).omit({ id: true, joinedAt: true });
export type InsertPoolEntry = z.infer<typeof insertPoolEntrySchema>;
export type PoolEntry = typeof poolEntries.$inferSelect;

/**
 * Race events - commentary + internal event log
 */
export const raceEvents = pgTable("race_events", {
  id: serial("id").primaryKey(),
  classPoolId: integer("class_pool_id").notNull().references(() => classPools.id),
  poolEntryId: integer("pool_entry_id"),
  eventType: varchar("event_type", { length: 32 }).notNull(), // POOL_CREATED, HERO_JOINED, RACE_STARTED, XP_GAINED, CLOSE_TO_LEVEL, WINNER_DECLARED
  payload: json("payload").$type<Record<string, any>>(),
  commentary: text("commentary").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  classPoolIdCreatedAtIdx: index("race_events_class_pool_id_created_at_idx").on(table.classPoolId, table.createdAt),
  eventTypeIdx: index("race_events_event_type_idx").on(table.eventType),
}));

export const insertRaceEventSchema = createInsertSchema(raceEvents).omit({ id: true, createdAt: true });
export type InsertRaceEvent = z.infer<typeof insertRaceEventSchema>;
export type RaceEvent = typeof raceEvents.$inferSelect;

// ============================================================================
// LEADERBOARD SYSTEM SCHEMA
// ============================================================================

/**
 * Leaderboard definitions - configurable leaderboard types
 */
export const leaderboardDefs = pgTable("leaderboard_defs", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  categoryKey: text("category_key").notNull(),
  metricSource: text("metric_source").notNull(),
  metricKey: text("metric_key").notNull(),
  fallbackMetricKey: text("fallback_metric_key"),
  timeWindow: text("time_window").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  keyIdx: uniqueIndex("leaderboard_defs_key_idx").on(table.key),
  categoryKeyIdx: index("leaderboard_defs_category_key_idx").on(table.categoryKey),
}));

export const insertLeaderboardDefSchema = createInsertSchema(leaderboardDefs).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertLeaderboardDef = z.infer<typeof insertLeaderboardDefSchema>;
export type LeaderboardDef = typeof leaderboardDefs.$inferSelect;

/**
 * Leaderboard runs - one run of a leaderboard for a specific time window
 */
export const leaderboardRuns = pgTable("leaderboard_runs", {
  id: serial("id").primaryKey(),
  leaderboardKey: text("leaderboard_key").notNull(),
  periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
  periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
  status: text("status").notNull().default("PENDING"),
  rowCount: integer("row_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  leaderboardKeyIdx: index("leaderboard_runs_key_idx").on(table.leaderboardKey),
  statusIdx: index("leaderboard_runs_status_idx").on(table.status),
  periodStartIdx: index("leaderboard_runs_period_start_idx").on(table.periodStart),
}));

export const insertLeaderboardRunSchema = createInsertSchema(leaderboardRuns).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertLeaderboardRun = z.infer<typeof insertLeaderboardRunSchema>;
export type LeaderboardRun = typeof leaderboardRuns.$inferSelect;

/**
 * Leaderboard entries - snapshot entries for a run
 */
export const leaderboardEntries = pgTable("leaderboard_entries", {
  id: serial("id").primaryKey(),
  runId: integer("run_id").notNull().references(() => leaderboardRuns.id, { onDelete: "cascade" }),
  clusterId: text("cluster_id").notNull(),
  rank: integer("rank").notNull(),
  score: integer("score").notNull(),
  tiebreaker: integer("tiebreaker").default(0),
  payload: text("payload").notNull().default("{}"),
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  runIdIdx: index("leaderboard_entries_run_id_idx").on(table.runId),
  runIdRankIdx: index("leaderboard_entries_run_id_rank_idx").on(table.runId, table.rank),
  clusterIdIdx: index("leaderboard_entries_cluster_id_idx").on(table.clusterId),
}));

export const insertLeaderboardEntrySchema = createInsertSchema(leaderboardEntries).omit({ id: true, createdAt: true });
export type InsertLeaderboardEntry = z.infer<typeof insertLeaderboardEntrySchema>;
export type LeaderboardEntry = typeof leaderboardEntries.$inferSelect;

// ============================================================================
// SEASON ENGINE SCHEMA (Challenge Pass)
// ============================================================================

/**
 * Seasons - seasonal challenge pass definitions
 */
export const seasons = pgTable("seasons", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  isActive: boolean("is_active").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertSeasonSchema = createInsertSchema(seasons).omit({ createdAt: true, updatedAt: true });
export type InsertSeason = z.infer<typeof insertSeasonSchema>;
export type Season = typeof seasons.$inferSelect;

/**
 * Season challenge weights - weight per challenge in a season
 */
export const seasonChallengeWeights = pgTable("season_challenge_weights", {
  id: serial("id").primaryKey(),
  seasonId: text("season_id").notNull().references(() => seasons.id, { onDelete: "cascade" }),
  challengeCode: text("challenge_code").notNull(),
  weight: integer("weight").notNull(),
}, (table) => ({
  seasonIdIdx: index("season_challenge_weights_season_id_idx").on(table.seasonId),
  seasonChallengeIdx: uniqueIndex("season_challenge_weights_season_challenge_idx").on(table.seasonId, table.challengeCode),
}));

export const insertSeasonChallengeWeightSchema = createInsertSchema(seasonChallengeWeights).omit({ id: true });
export type InsertSeasonChallengeWeight = z.infer<typeof insertSeasonChallengeWeightSchema>;
export type SeasonChallengeWeight = typeof seasonChallengeWeights.$inferSelect;

/**
 * Season progress - player/cluster progress per season
 */
export const seasonProgress = pgTable("season_progress", {
  id: serial("id").primaryKey(),
  seasonId: text("season_id").notNull().references(() => seasons.id, { onDelete: "cascade" }),
  clusterId: text("cluster_id").notNull(),
  points: integer("points").notNull().default(0),
  level: integer("level").notNull().default(0),
  lastUpdatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  seasonIdIdx: index("season_progress_season_id_idx").on(table.seasonId),
  clusterIdIdx: index("season_progress_cluster_id_idx").on(table.clusterId),
  seasonClusterIdx: uniqueIndex("season_progress_season_cluster_idx").on(table.seasonId, table.clusterId),
}));

export const insertSeasonProgressSchema = createInsertSchema(seasonProgress).omit({ id: true, lastUpdatedAt: true });
export type InsertSeasonProgress = z.infer<typeof insertSeasonProgressSchema>;
export type SeasonProgress = typeof seasonProgress.$inferSelect;

/**
 * Season rewards - defines level thresholds and rewards for each season
 */
export const seasonRewards = pgTable("season_rewards", {
  id: serial("id").primaryKey(),
  seasonId: text("season_id").notNull().references(() => seasons.id, { onDelete: "cascade" }),
  level: integer("level").notNull(),
  pointsRequired: integer("points_required").notNull(),
  rewardType: text("reward_type").notNull(), // BADGE, DISCORD_ROLE, TOKEN, COSMETIC, ACCESS, HALL_OF_FAME
  rewardKey: text("reward_key").notNull(), // e.g., "hedge_recruit", "season1_veteran"
  rewardName: text("reward_name").notNull(),
  rewardDescription: text("reward_description").notNull(),
  rewardMeta: text("reward_meta").default("{}"), // JSON for extra config (role ID, token amount, etc.)
}, (table) => ({
  seasonIdIdx: index("season_rewards_season_id_idx").on(table.seasonId),
  seasonLevelIdx: uniqueIndex("season_rewards_season_level_idx").on(table.seasonId, table.level),
}));

export const insertSeasonRewardSchema = createInsertSchema(seasonRewards).omit({ id: true });
export type InsertSeasonReward = z.infer<typeof insertSeasonRewardSchema>;
export type SeasonReward = typeof seasonRewards.$inferSelect;

/**
 * Season bonus rewards - special feat-based rewards within a season
 */
export const seasonBonusRewards = pgTable("season_bonus_rewards", {
  id: serial("id").primaryKey(),
  seasonId: text("season_id").notNull().references(() => seasons.id, { onDelete: "cascade" }),
  bonusKey: text("bonus_key").notNull(), // e.g., "clucker_miracle", "summoner_of_legends", "top_10"
  bonusName: text("bonus_name").notNull(),
  bonusDescription: text("bonus_description").notNull(),
  triggerType: text("trigger_type").notNull(), // CHALLENGE_UNLOCK, LEADERBOARD_RANK, CUSTOM
  triggerValue: text("trigger_value").notNull(), // challenge_key or rank threshold
  rewardType: text("reward_type").notNull(),
  rewardKey: text("reward_key").notNull(),
  rewardMeta: text("reward_meta").default("{}"),
}, (table) => ({
  seasonIdIdx: index("season_bonus_rewards_season_id_idx").on(table.seasonId),
  seasonBonusIdx: uniqueIndex("season_bonus_rewards_season_bonus_idx").on(table.seasonId, table.bonusKey),
}));

export const insertSeasonBonusRewardSchema = createInsertSchema(seasonBonusRewards).omit({ id: true });
export type InsertSeasonBonusReward = z.infer<typeof insertSeasonBonusRewardSchema>;
export type SeasonBonusReward = typeof seasonBonusRewards.$inferSelect;

/**
 * Player reward claims - tracks which rewards have been claimed
 */
export const playerRewardClaims = pgTable("player_reward_claims", {
  id: serial("id").primaryKey(),
  clusterId: text("cluster_id").notNull(),
  seasonId: text("season_id").notNull().references(() => seasons.id, { onDelete: "cascade" }),
  rewardType: text("reward_type").notNull(), // LEVEL or BONUS
  rewardId: integer("reward_id").notNull(), // FK to season_rewards or season_bonus_rewards
  claimedAt: timestamp("claimed_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  claimStatus: text("claim_status").notNull().default("PENDING"), // PENDING, FULFILLED, FAILED
  fulfillmentMeta: text("fulfillment_meta").default("{}"), // JSON for tracking fulfillment details
}, (table) => ({
  clusterIdIdx: index("player_reward_claims_cluster_id_idx").on(table.clusterId),
  seasonIdIdx: index("player_reward_claims_season_id_idx").on(table.seasonId),
  clusterSeasonRewardIdx: uniqueIndex("player_reward_claims_cluster_season_reward_idx").on(table.clusterId, table.seasonId, table.rewardType, table.rewardId),
}));

export const insertPlayerRewardClaimSchema = createInsertSchema(playerRewardClaims).omit({ id: true, claimedAt: true });
export type InsertPlayerRewardClaim = z.infer<typeof insertPlayerRewardClaimSchema>;
export type PlayerRewardClaim = typeof playerRewardClaims.$inferSelect;

// ============================================================================
// INGESTION STATE
// Tracks last processed block per indexer for incremental blockchain scanning
// ============================================================================

/**
 * Ingestion state - tracks last processed block per indexer
 * Used by hunting, pvp, and other on-chain event indexers
 */
export const ingestionState = pgTable("ingestion_state", {
  key: varchar("key", { length: 64 }).primaryKey(), // 'hunting', 'pvp', etc.
  lastBlock: bigint("last_block", { mode: "number" }).notNull(),
  lastUpdatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertIngestionStateSchema = createInsertSchema(ingestionState).omit({ lastUpdatedAt: true });
export type InsertIngestionState = z.infer<typeof insertIngestionStateSchema>;
export type IngestionState = typeof ingestionState.$inferSelect;

// ============================================================================
// TOKEN REGISTRY
// Stores DFK Chain token information from RouteScan for symbol resolution
// ============================================================================

/**
 * Token registry - caches token metadata from RouteScan
 * Used for resolving token addresses to symbols across the app
 */
export const tokenRegistry = pgTable("token_registry", {
  id: serial("id").primaryKey(),
  address: text("address").notNull().unique(), // lowercase token contract address
  symbol: text("symbol").notNull(),
  name: text("name").notNull(),
  decimals: integer("decimals").notNull().default(18),
  holders: integer("holders"), // number of holders (nullable, may not be available)
  priceUsd: numeric("price_usd", { precision: 30, scale: 18 }), // optional price data
  chain: text("chain").notNull().default("dfk"), // dfk, klaytn, metis
  lastUpdatedAt: timestamp("last_updated_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  addressIdx: uniqueIndex("token_registry_address_idx").on(table.address),
  symbolIdx: index("token_registry_symbol_idx").on(table.symbol),
  chainIdx: index("token_registry_chain_idx").on(table.chain),
}));

export const insertTokenRegistrySchema = createInsertSchema(tokenRegistry).omit({ id: true, createdAt: true, lastUpdatedAt: true });
export type InsertTokenRegistry = z.infer<typeof insertTokenRegistrySchema>;
export type TokenRegistry = typeof tokenRegistry.$inferSelect;

// ============================================================================
// POOL STAKERS INDEX
// Indexed staker positions from Deposit/Withdraw events for fast queries
// ============================================================================

/**
 * Pool stakers - stores current staker positions indexed from blockchain events
 * Updated by the pool staker indexer, consumed by the admin dashboard
 */
export const poolStakers = pgTable("pool_stakers", {
  id: serial("id").primaryKey(),
  wallet: text("wallet").notNull(), // lowercase wallet address
  pid: integer("pid").notNull(), // pool ID
  stakedLP: numeric("staked_lp", { precision: 38, scale: 18 }).notNull().default("0"), // current staked LP tokens
  summonerName: text("summoner_name"), // DFK profile name (nullable if not registered)
  lastActivityType: text("last_activity_type"), // 'Deposit' or 'Withdraw'
  lastActivityAmount: numeric("last_activity_amount", { precision: 38, scale: 18 }), // last activity LP amount
  lastActivityBlock: bigint("last_activity_block", { mode: "number" }), // block number of last activity
  lastActivityTxHash: text("last_activity_tx_hash"), // tx hash of last activity
  lastUpdatedAt: timestamp("last_updated_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  walletPidIdx: uniqueIndex("pool_stakers_wallet_pid_idx").on(table.wallet, table.pid),
  pidIdx: index("pool_stakers_pid_idx").on(table.pid),
  stakedLpIdx: index("pool_stakers_staked_lp_idx").on(table.stakedLP),
}));

export const insertPoolStakerSchema = createInsertSchema(poolStakers).omit({ id: true, createdAt: true, lastUpdatedAt: true });
export type InsertPoolStaker = z.infer<typeof insertPoolStakerSchema>;
export type PoolStaker = typeof poolStakers.$inferSelect;

/**
 * Pool staker indexer progress - tracks indexing progress per pool
 * Allows resumable indexing and worker-based parallel processing
 */
export const poolStakerIndexerProgress = pgTable("pool_staker_indexer_progress", {
  id: serial("id").primaryKey(),
  indexerName: text("indexer_name").notNull().unique(), // 'pool_0', 'pool_1', etc. or 'pool_0_worker_1_of_4'
  pid: integer("pid").notNull(), // pool ID this indexer is for
  lastIndexedBlock: bigint("last_indexed_block", { mode: "number" }).notNull(),
  genesisBlock: bigint("genesis_block", { mode: "number" }).notNull(), // starting block for this pool
  status: text("status").notNull().default("idle"), // 'idle', 'running', 'complete', 'error'
  totalEventsIndexed: integer("total_events_indexed").notNull().default(0),
  totalStakersFound: integer("total_stakers_found").notNull().default(0),
  lastError: text("last_error"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  pidIdx: index("pool_staker_indexer_progress_pid_idx").on(table.pid),
}));

export const insertPoolStakerIndexerProgressSchema = createInsertSchema(poolStakerIndexerProgress).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPoolStakerIndexerProgress = z.infer<typeof insertPoolStakerIndexerProgressSchema>;
export type PoolStakerIndexerProgress = typeof poolStakerIndexerProgress.$inferSelect;

// ============================================================================
// POOL SWAP & REWARD EVENTS FOR APR CALCULATIONS
// Indexed swap and reward events from LP pairs and MasterGardener
// ============================================================================

/**
 * Pool swap events - Swap events from LP pair contracts for volume/fee APR
 * Used to calculate trading fees earned by LPs
 */
export const poolSwapEvents = pgTable("pool_swap_events", {
  id: serial("id").primaryKey(),
  pid: integer("pid").notNull(), // pool ID (maps to lpToken)
  lpToken: text("lp_token").notNull(), // LP token contract address
  blockNumber: bigint("block_number", { mode: "number" }).notNull(),
  txHash: text("tx_hash").notNull(),
  logIndex: integer("log_index").notNull(), // to ensure uniqueness within a tx
  sender: text("sender").notNull(),
  recipient: text("recipient").notNull(), // "to" address
  amount0In: numeric("amount0_in", { precision: 38, scale: 18 }).notNull(),
  amount1In: numeric("amount1_in", { precision: 38, scale: 18 }).notNull(),
  amount0Out: numeric("amount0_out", { precision: 38, scale: 18 }).notNull(),
  amount1Out: numeric("amount1_out", { precision: 38, scale: 18 }).notNull(),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  pidIdx: index("pool_swap_events_pid_idx").on(table.pid),
  blockNumberIdx: index("pool_swap_events_block_idx").on(table.blockNumber),
  timestampIdx: index("pool_swap_events_timestamp_idx").on(table.timestamp),
  uniqueEventIdx: uniqueIndex("pool_swap_events_unique_idx").on(table.txHash, table.logIndex),
}));

export const insertPoolSwapEventSchema = createInsertSchema(poolSwapEvents).omit({ id: true, createdAt: true });
export type InsertPoolSwapEvent = z.infer<typeof insertPoolSwapEventSchema>;
export type PoolSwapEvent = typeof poolSwapEvents.$inferSelect;

/**
 * Pool reward events - CRYSTAL reward distributions from MasterGardener
 * Used to calculate harvest APR
 */
export const poolRewardEvents = pgTable("pool_reward_events", {
  id: serial("id").primaryKey(),
  pid: integer("pid").notNull(),
  blockNumber: bigint("block_number", { mode: "number" }).notNull(),
  txHash: text("tx_hash").notNull(),
  logIndex: integer("log_index").notNull(),
  user: text("user").notNull(), // address receiving rewards
  rewardAmount: numeric("reward_amount", { precision: 38, scale: 18 }).notNull(), // CRYSTAL amount
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  pidIdx: index("pool_reward_events_pid_idx").on(table.pid),
  blockNumberIdx: index("pool_reward_events_block_idx").on(table.blockNumber),
  timestampIdx: index("pool_reward_events_timestamp_idx").on(table.timestamp),
  uniqueEventIdx: uniqueIndex("pool_reward_events_unique_idx").on(table.txHash, table.logIndex),
}));

export const insertPoolRewardEventSchema = createInsertSchema(poolRewardEvents).omit({ id: true, createdAt: true });
export type InsertPoolRewardEvent = z.infer<typeof insertPoolRewardEventSchema>;
export type PoolRewardEvent = typeof poolRewardEvents.$inferSelect;

/**
 * Pool daily aggregates - Pre-computed daily APR data
 * Cutoff at 8 PM ET (00:00/01:00 UTC depending on DST)
 */
export const poolDailyAggregates = pgTable("pool_daily_aggregates", {
  id: serial("id").primaryKey(),
  pid: integer("pid").notNull(),
  date: text("date").notNull(), // YYYY-MM-DD format (8 PM ET cutoff day)
  
  // Volume and fees (in USD)
  volume24h: numeric("volume_24h", { precision: 30, scale: 2 }).default("0"),
  fees24h: numeric("fees_24h", { precision: 30, scale: 2 }).default("0"), // typically 0.3% of volume
  
  // Rewards (CRYSTAL amount and USD value)
  rewards24h: numeric("rewards_24h", { precision: 38, scale: 18 }).default("0"), // raw CRYSTAL
  rewardsUsd24h: numeric("rewards_usd_24h", { precision: 30, scale: 2 }).default("0"),
  
  // TVL at snapshot time
  tvl: numeric("tvl", { precision: 30, scale: 2 }).default("0"),
  stakedLp: numeric("staked_lp", { precision: 38, scale: 18 }).default("0"),
  
  // Computed APRs (annualized percentages)
  feeApr: numeric("fee_apr", { precision: 10, scale: 4 }).default("0"), // trading fee APR
  harvestApr: numeric("harvest_apr", { precision: 10, scale: 4 }).default("0"), // CRYSTAL reward APR
  totalApr: numeric("total_apr", { precision: 10, scale: 4 }).default("0"), // fee + harvest
  
  // Metadata
  swapCount24h: integer("swap_count_24h").default(0),
  rewardEventCount24h: integer("reward_event_count_24h").default(0),
  
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  pidDateIdx: uniqueIndex("pool_daily_aggregates_pid_date_idx").on(table.pid, table.date),
  dateIdx: index("pool_daily_aggregates_date_idx").on(table.date),
}));

export const insertPoolDailyAggregateSchema = createInsertSchema(poolDailyAggregates).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPoolDailyAggregate = z.infer<typeof insertPoolDailyAggregateSchema>;
export type PoolDailyAggregate = typeof poolDailyAggregates.$inferSelect;

/**
 * Pool indexer progress (swap/reward) - tracks indexing progress for swap and reward events
 * Separate from staker indexer to allow independent operation
 */
export const poolEventIndexerProgress = pgTable("pool_event_indexer_progress", {
  id: serial("id").primaryKey(),
  indexerName: text("indexer_name").notNull().unique(), // 'swaps_pool_0', 'unified_pool_0_w1', etc.
  indexerType: text("indexer_type").notNull(), // 'swaps', 'rewards', or 'unified'
  pid: integer("pid").notNull(),
  lpToken: text("lp_token"), // LP token address for swap indexers
  lastIndexedBlock: bigint("last_indexed_block", { mode: "number" }).notNull(),
  genesisBlock: bigint("genesis_block", { mode: "number" }).notNull(),
  rangeEnd: bigint("range_end", { mode: "number" }), // Worker's assigned end block (null = track to latest)
  status: text("status").notNull().default("idle"), // 'idle', 'running', 'complete', 'error'
  totalEventsIndexed: integer("total_events_indexed").notNull().default(0),
  lastError: text("last_error"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  pidIdx: index("pool_event_indexer_progress_pid_idx").on(table.pid),
  typeIdx: index("pool_event_indexer_progress_type_idx").on(table.indexerType),
}));

export const insertPoolEventIndexerProgressSchema = createInsertSchema(poolEventIndexerProgress).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPoolEventIndexerProgress = z.infer<typeof insertPoolEventIndexerProgressSchema>;
export type PoolEventIndexerProgress = typeof poolEventIndexerProgress.$inferSelect;

// ============================================================================
// V1 POOL STAKERS INDEX (LEGACY MASTER GARDENER)
// Same structure as V2 but for deprecated V1 gardener contract
// ============================================================================

/**
 * V1 Pool stakers - stores current staker positions from legacy Master Gardener V1
 */
export const poolStakersV1 = pgTable("pool_stakers_v1", {
  id: serial("id").primaryKey(),
  wallet: text("wallet").notNull(),
  pid: integer("pid").notNull(),
  stakedLP: numeric("staked_lp", { precision: 38, scale: 18 }).notNull().default("0"),
  summonerName: text("summoner_name"),
  lastActivityType: text("last_activity_type"),
  lastActivityAmount: numeric("last_activity_amount", { precision: 38, scale: 18 }),
  lastActivityBlock: bigint("last_activity_block", { mode: "number" }),
  lastActivityTxHash: text("last_activity_tx_hash"),
  lastUpdatedAt: timestamp("last_updated_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  walletPidIdx: uniqueIndex("pool_stakers_v1_wallet_pid_idx").on(table.wallet, table.pid),
  pidIdx: index("pool_stakers_v1_pid_idx").on(table.pid),
  stakedLpIdx: index("pool_stakers_v1_staked_lp_idx").on(table.stakedLP),
}));

export const insertPoolStakerV1Schema = createInsertSchema(poolStakersV1).omit({ id: true, createdAt: true, lastUpdatedAt: true });
export type InsertPoolStakerV1 = z.infer<typeof insertPoolStakerV1Schema>;
export type PoolStakerV1 = typeof poolStakersV1.$inferSelect;

/**
 * V1 Pool reward events - JEWEL/CRYSTAL rewards from legacy MasterGardener V1
 */
export const poolRewardEventsV1 = pgTable("pool_reward_events_v1", {
  id: serial("id").primaryKey(),
  pid: integer("pid").notNull(),
  blockNumber: bigint("block_number", { mode: "number" }).notNull(),
  txHash: text("tx_hash").notNull(),
  logIndex: integer("log_index").notNull(),
  user: text("user").notNull(),
  rewardAmount: numeric("reward_amount", { precision: 38, scale: 18 }).notNull(),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  pidIdx: index("pool_reward_events_v1_pid_idx").on(table.pid),
  blockNumberIdx: index("pool_reward_events_v1_block_idx").on(table.blockNumber),
  timestampIdx: index("pool_reward_events_v1_timestamp_idx").on(table.timestamp),
  uniqueEventIdx: uniqueIndex("pool_reward_events_v1_unique_idx").on(table.txHash, table.logIndex),
}));

export const insertPoolRewardEventV1Schema = createInsertSchema(poolRewardEventsV1).omit({ id: true, createdAt: true });
export type InsertPoolRewardEventV1 = z.infer<typeof insertPoolRewardEventV1Schema>;
export type PoolRewardEventV1 = typeof poolRewardEventsV1.$inferSelect;

/**
 * V1 Pool indexer progress - tracks indexing progress for V1 Master Gardener
 */
export const poolEventIndexerProgressV1 = pgTable("pool_event_indexer_progress_v1", {
  id: serial("id").primaryKey(),
  indexerName: text("indexer_name").notNull().unique(),
  indexerType: text("indexer_type").notNull(),
  pid: integer("pid").notNull(),
  lpToken: text("lp_token"),
  lastIndexedBlock: bigint("last_indexed_block", { mode: "number" }).notNull(),
  genesisBlock: bigint("genesis_block", { mode: "number" }).notNull(),
  rangeEnd: bigint("range_end", { mode: "number" }),
  status: text("status").notNull().default("idle"),
  totalEventsIndexed: integer("total_events_indexed").notNull().default(0),
  lastError: text("last_error"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  pidIdx: index("pool_event_indexer_progress_v1_pid_idx").on(table.pid),
  typeIdx: index("pool_event_indexer_progress_v1_type_idx").on(table.indexerType),
}));

export const insertPoolEventIndexerProgressV1Schema = createInsertSchema(poolEventIndexerProgressV1).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPoolEventIndexerProgressV1 = z.infer<typeof insertPoolEventIndexerProgressV1Schema>;
export type PoolEventIndexerProgressV1 = typeof poolEventIndexerProgressV1.$inferSelect;

// ============================================================================
// HARMONY POOL STAKING INDEX (Legacy Serendale)
// Tracks LP staking positions in Serendale Master Gardener on Harmony
// ============================================================================

/**
 * Harmony Pool stakers - stores current staker positions in Serendale Master Gardener (Harmony)
 */
export const poolStakersHarmony = pgTable("pool_stakers_harmony", {
  id: serial("id").primaryKey(),
  wallet: text("wallet").notNull(),
  pid: integer("pid").notNull(),
  stakedLP: numeric("staked_lp", { precision: 38, scale: 18 }).notNull().default("0"),
  summonerName: text("summoner_name"),
  lastActivityType: text("last_activity_type"),
  lastActivityAmount: numeric("last_activity_amount", { precision: 38, scale: 18 }),
  lastActivityBlock: bigint("last_activity_block", { mode: "number" }),
  lastActivityTxHash: text("last_activity_tx_hash"),
  lastUpdatedAt: timestamp("last_updated_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  walletPidIdx: uniqueIndex("pool_stakers_harmony_wallet_pid_idx").on(table.wallet, table.pid),
  pidIdx: index("pool_stakers_harmony_pid_idx").on(table.pid),
  stakedLpIdx: index("pool_stakers_harmony_staked_lp_idx").on(table.stakedLP),
}));

export const insertPoolStakerHarmonySchema = createInsertSchema(poolStakersHarmony).omit({ id: true, createdAt: true, lastUpdatedAt: true });
export type InsertPoolStakerHarmony = z.infer<typeof insertPoolStakerHarmonySchema>;
export type PoolStakerHarmony = typeof poolStakersHarmony.$inferSelect;

/**
 * Harmony Pool indexer progress - tracks indexing progress for Serendale Master Gardener
 */
export const poolEventIndexerProgressHarmony = pgTable("pool_event_indexer_progress_harmony", {
  id: serial("id").primaryKey(),
  indexerName: text("indexer_name").notNull().unique(),
  indexerType: text("indexer_type").notNull(),
  pid: integer("pid").notNull(),
  lpToken: text("lp_token"),
  lastIndexedBlock: bigint("last_indexed_block", { mode: "number" }).notNull(),
  genesisBlock: bigint("genesis_block", { mode: "number" }).notNull(),
  rangeEnd: bigint("range_end", { mode: "number" }),
  status: text("status").notNull().default("idle"),
  totalEventsIndexed: integer("total_events_indexed").notNull().default(0),
  lastError: text("last_error"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  pidIdx: index("pool_event_indexer_progress_harmony_pid_idx").on(table.pid),
  typeIdx: index("pool_event_indexer_progress_harmony_type_idx").on(table.indexerType),
}));

export const insertPoolEventIndexerProgressHarmonySchema = createInsertSchema(poolEventIndexerProgressHarmony).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPoolEventIndexerProgressHarmony = z.infer<typeof insertPoolEventIndexerProgressHarmonySchema>;
export type PoolEventIndexerProgressHarmony = typeof poolEventIndexerProgressHarmony.$inferSelect;

// ============================================================================
// JEWELER STAKING INDEX (cJEWEL)
// Tracks JEWEL staking in the Jeweler for cJEWEL tokens
// ============================================================================

/**
 * Jeweler stakers - stores current staker positions in the Jeweler
 */
export const jewelerStakers = pgTable("jeweler_stakers", {
  id: serial("id").primaryKey(),
  wallet: text("wallet").notNull().unique(),
  stakedJewel: numeric("staked_jewel", { precision: 38, scale: 18 }).notNull().default("0"),
  cjewelBalance: numeric("cjewel_balance", { precision: 38, scale: 18 }).notNull().default("0"),
  lockEnd: timestamp("lock_end", { withTimezone: true }),
  summonerName: text("summoner_name"),
  lastActivityType: text("last_activity_type"),
  lastActivityAmount: numeric("last_activity_amount", { precision: 38, scale: 18 }),
  lastActivityBlock: bigint("last_activity_block", { mode: "number" }),
  lastActivityTxHash: text("last_activity_tx_hash"),
  lastUpdatedAt: timestamp("last_updated_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  walletIdx: uniqueIndex("jeweler_stakers_wallet_idx").on(table.wallet),
  cjewelBalanceIdx: index("jeweler_stakers_cjewel_balance_idx").on(table.cjewelBalance),
  lockEndIdx: index("jeweler_stakers_lock_end_idx").on(table.lockEnd),
}));

export const insertJewelerStakerSchema = createInsertSchema(jewelerStakers).omit({ id: true, createdAt: true, lastUpdatedAt: true });
export type InsertJewelerStaker = z.infer<typeof insertJewelerStakerSchema>;
export type JewelerStaker = typeof jewelerStakers.$inferSelect;

/**
 * Jeweler events - raw deposit/withdraw events from the Jeweler contract
 */
export const jewelerEvents = pgTable("jeweler_events", {
  id: serial("id").primaryKey(),
  blockNumber: bigint("block_number", { mode: "number" }).notNull(),
  txHash: text("tx_hash").notNull(),
  logIndex: integer("log_index").notNull(),
  eventType: text("event_type").notNull(),
  user: text("user").notNull(),
  jewelAmount: numeric("jewel_amount", { precision: 38, scale: 18 }).notNull(),
  cjewelAmount: numeric("cjewel_amount", { precision: 38, scale: 18 }).notNull(),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  blockNumberIdx: index("jeweler_events_block_idx").on(table.blockNumber),
  userIdx: index("jeweler_events_user_idx").on(table.user),
  timestampIdx: index("jeweler_events_timestamp_idx").on(table.timestamp),
  uniqueEventIdx: uniqueIndex("jeweler_events_unique_idx").on(table.txHash, table.logIndex),
}));

export const insertJewelerEventSchema = createInsertSchema(jewelerEvents).omit({ id: true, createdAt: true });
export type InsertJewelerEvent = z.infer<typeof insertJewelerEventSchema>;
export type JewelerEvent = typeof jewelerEvents.$inferSelect;

/**
 * Jeweler ratio history - tracks cJEWEL/JEWEL ratio over time for APR calculation
 */
export const jewelerRatioHistory = pgTable("jeweler_ratio_history", {
  id: serial("id").primaryKey(),
  blockNumber: bigint("block_number", { mode: "number" }).notNull(),
  ratio: numeric("ratio", { precision: 38, scale: 18 }).notNull(),
  totalJewelLocked: numeric("total_jewel_locked", { precision: 38, scale: 18 }).notNull(),
  totalCjewelSupply: numeric("total_cjewel_supply", { precision: 38, scale: 18 }).notNull(),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  blockNumberIdx: uniqueIndex("jeweler_ratio_history_block_idx").on(table.blockNumber),
  timestampIdx: index("jeweler_ratio_history_timestamp_idx").on(table.timestamp),
}));

export const insertJewelerRatioHistorySchema = createInsertSchema(jewelerRatioHistory).omit({ id: true, createdAt: true });
export type InsertJewelerRatioHistory = z.infer<typeof insertJewelerRatioHistorySchema>;
export type JewelerRatioHistory = typeof jewelerRatioHistory.$inferSelect;

/**
 * Jeweler indexer progress - tracks indexing progress for Jeweler
 */
export const jewelerIndexerProgress = pgTable("jeweler_indexer_progress", {
  id: serial("id").primaryKey(),
  indexerName: text("indexer_name").notNull().unique(),
  lastIndexedBlock: bigint("last_indexed_block", { mode: "number" }).notNull(),
  genesisBlock: bigint("genesis_block", { mode: "number" }).notNull(),
  rangeStart: bigint("range_start", { mode: "number" }),
  rangeEnd: bigint("range_end", { mode: "number" }),
  status: text("status").notNull().default("idle"),
  totalEventsIndexed: integer("total_events_indexed").notNull().default(0),
  totalStakersFound: integer("total_stakers_found").notNull().default(0),
  lastError: text("last_error"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertJewelerIndexerProgressSchema = createInsertSchema(jewelerIndexerProgress).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertJewelerIndexerProgress = z.infer<typeof insertJewelerIndexerProgressSchema>;
export type JewelerIndexerProgress = typeof jewelerIndexerProgress.$inferSelect;

// ============================================================================
// GARDENING QUEST REWARDS INDEX
// Tracks actual CRYSTAL/JEWEL rewards per hero from gardening quests
// ============================================================================

/**
 * Gardening quest rewards - individual rewards per hero from RewardMinted events
 * Used to validate yield predictions against actual on-chain data
 */
export const gardeningQuestRewards = pgTable("gardening_quest_rewards", {
  id: serial("id").primaryKey(),
  questId: bigint("quest_id", { mode: "number" }).notNull(),
  heroId: bigint("hero_id", { mode: "number" }).notNull(),
  player: text("player").notNull(),
  poolId: integer("pool_id").notNull(), // Garden pool ID (0-13)
  rewardToken: text("reward_token").notNull(), // Token address (CRYSTAL, JEWEL, or item)
  rewardSymbol: text("reward_symbol"), // Human-readable: CRYSTAL, JEWEL, etc.
  rewardAmount: numeric("reward_amount", { precision: 38, scale: 18 }).notNull(),
  source: text("source").default("manual_quest"), // 'manual_quest' or 'expedition'
  expeditionId: bigint("expedition_id", { mode: "number" }), // Only set for expeditions
  // Pool value snapshot at reward block (for yield validation)
  heroLpStake: numeric("hero_lp_stake", { precision: 38, scale: 18 }), // Hero's LP amount staked
  poolTotalLp: numeric("pool_total_lp", { precision: 38, scale: 18 }), // Pool's total staked LP
  lpTokenPrice: numeric("lp_token_price", { precision: 20, scale: 8 }), // USD value per LP token
  // Quest Reward Fund snapshot at reward block (for yield formula validation)
  crystalFundBalance: numeric("crystal_fund_balance", { precision: 38, scale: 18 }), // CRYSTAL pool balance at quest time
  jewelFundBalance: numeric("jewel_fund_balance", { precision: 38, scale: 18 }), // wJEWEL pool balance at quest time
  blockNumber: bigint("block_number", { mode: "number" }).notNull(),
  txHash: text("tx_hash").notNull(),
  logIndex: integer("log_index").notNull(),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  heroIdIdx: index("gardening_quest_rewards_hero_idx").on(table.heroId),
  playerIdx: index("gardening_quest_rewards_player_idx").on(table.player),
  poolIdIdx: index("gardening_quest_rewards_pool_idx").on(table.poolId),
  rewardTokenIdx: index("gardening_quest_rewards_token_idx").on(table.rewardToken),
  sourceIdx: index("gardening_quest_rewards_source_idx").on(table.source),
  timestampIdx: index("gardening_quest_rewards_timestamp_idx").on(table.timestamp),
  blockNumberIdx: index("gardening_quest_rewards_block_idx").on(table.blockNumber),
  uniqueEventIdx: uniqueIndex("gardening_quest_rewards_unique_idx").on(table.txHash, table.logIndex),
}));

export const insertGardeningQuestRewardSchema = createInsertSchema(gardeningQuestRewards).omit({ id: true, createdAt: true });
export type InsertGardeningQuestReward = z.infer<typeof insertGardeningQuestRewardSchema>;
export type GardeningQuestReward = typeof gardeningQuestRewards.$inferSelect;

/**
 * Gardening quest indexer progress - tracks indexing progress
 */
export const gardeningQuestIndexerProgress = pgTable("gardening_quest_indexer_progress", {
  id: serial("id").primaryKey(),
  indexerName: text("indexer_name").notNull().unique(),
  lastIndexedBlock: bigint("last_indexed_block", { mode: "number" }).notNull(),
  genesisBlock: bigint("genesis_block", { mode: "number" }).notNull(),
  rangeStart: bigint("range_start", { mode: "number" }),
  rangeEnd: bigint("range_end", { mode: "number" }),
  status: text("status").notNull().default("idle"),
  totalEventsIndexed: integer("total_events_indexed").notNull().default(0),
  lastError: text("last_error"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertGardeningQuestIndexerProgressSchema = createInsertSchema(gardeningQuestIndexerProgress).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertGardeningQuestIndexerProgress = z.infer<typeof insertGardeningQuestIndexerProgressSchema>;
export type GardeningQuestIndexerProgress = typeof gardeningQuestIndexerProgress.$inferSelect;

// ============================================================================
// COMBAT CODEX TABLES
// Knowledge base for DFK combat mechanics, skills, and class information
// ============================================================================

/**
 * Combat keywords - game terminology definitions
 */
export const combatKeywords = pgTable("combat_keywords", {
  keyword: text("keyword").primaryKey(),
  definition: text("definition").notNull(),
  sourceUrl: text("source_url").notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertCombatKeywordSchema = createInsertSchema(combatKeywords);
export type InsertCombatKeyword = z.infer<typeof insertCombatKeywordSchema>;
export type CombatKeyword = typeof combatKeywords.$inferSelect;

/**
 * Combat class metadata - overview info for each class
 */
export const combatClassMeta = pgTable("combat_class_meta", {
  class: text("class").primaryKey(),
  sourceUrl: text("source_url").notNull(),
  lastUpdateNote: text("last_update_note"),
  maturity: text("maturity").notNull(), // e.g., 'stable', 'beta', 'alpha'
  disciplines: text("disciplines").array().notNull().default(sql`'{}'::text[]`),
  summary: text("summary"),
  validated: boolean("validated").notNull().default(false), // true = admin verified, Hedge can discuss this class
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertCombatClassMetaSchema = createInsertSchema(combatClassMeta);
export type InsertCombatClassMeta = z.infer<typeof insertCombatClassMetaSchema>;
export type CombatClassMeta = typeof combatClassMeta.$inferSelect;

/**
 * Combat skills - individual abilities and talents
 */
export const combatSkills = pgTable("combat_skills", {
  id: serial("id").primaryKey(),
  class: text("class").notNull(),
  tier: integer("tier").notNull(),
  skillPoints: integer("skill_points"),
  discipline: text("discipline"),
  ability: text("ability").notNull(),
  descriptionRaw: text("description_raw"),
  range: integer("range"),
  manaCost: numeric("mana_cost", { precision: 10, scale: 2 }),
  manaGrowth: numeric("mana_growth", { precision: 10, scale: 4 }),
  dod: numeric("dod", { precision: 10, scale: 4 }),
  tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
  sourceUrl: text("source_url").notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  classIdx: index("combat_skills_class_idx").on(table.class),
  classTierIdx: index("combat_skills_class_tier_idx").on(table.class, table.tier),
}));

export const insertCombatSkillSchema = createInsertSchema(combatSkills).omit({ id: true });
export type InsertCombatSkill = z.infer<typeof insertCombatSkillSchema>;
export type CombatSkill = typeof combatSkills.$inferSelect;

/**
 * Combat sources - tracked source URLs for auto-discovery
 */
export const combatSources = pgTable("combat_sources", {
  url: text("url").primaryKey(),
  kind: text("kind").notNull(), // 'combat_overview' or 'combat_class'
  enabled: boolean("enabled").notNull().default(true),
  discoveredFrom: text("discovered_from"),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertCombatSourceSchema = createInsertSchema(combatSources);
export type InsertCombatSource = z.infer<typeof insertCombatSourceSchema>;
export type CombatSource = typeof combatSources.$inferSelect;

// ============================================================================
// ENTITLEMENT SYSTEM
// Tier-based access control for API features
// ============================================================================

/**
 * Entitlement tiers - subscription/access levels
 */
export const entitlementTiers = pgTable("entitlement_tiers", {
  tierId: text("tier_id").primaryKey(),
  displayName: text("display_name").notNull(),
  description: text("description"),
  priceMonthly: numeric("price_monthly", { precision: 10, scale: 2 }),
  enabled: boolean("enabled").notNull().default(true),
  sortOrder: integer("sort_order").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertEntitlementTierSchema = createInsertSchema(entitlementTiers);
export type InsertEntitlementTier = z.infer<typeof insertEntitlementTierSchema>;
export type EntitlementTier = typeof entitlementTiers.$inferSelect;

/**
 * Entitlement rules - what each tier can access
 */
export const entitlementRules = pgTable("entitlement_rules", {
  id: serial("id").primaryKey(),
  domain: text("domain").notNull(), // e.g., 'combat', 'portfolio'
  resource: text("resource").notNull(), // e.g., 'skills', 'keywords'
  tierId: text("tier_id").notNull().references(() => entitlementTiers.tierId),
  mode: text("mode").notNull(), // 'fields_allowlist' or 'feature_flags'
  rule: json("rule").notNull(), // JSON defining allowed fields or feature flags
  updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  tierIdIdx: index("entitlement_rules_tier_idx").on(table.tierId),
  domainResourceIdx: index("entitlement_rules_domain_resource_idx").on(table.domain, table.resource),
}));

export const insertEntitlementRuleSchema = createInsertSchema(entitlementRules).omit({ id: true });
export type InsertEntitlementRule = z.infer<typeof insertEntitlementRuleSchema>;
export type EntitlementRule = typeof entitlementRules.$inferSelect;

// ============================================================================
// SYNC STATUS TRACKING
// Tracks ingestion runs and per-item results
// ============================================================================

/**
 * Sync runs - tracks each ingest run summary
 */
export const syncRuns = pgTable("sync_runs", {
  id: serial("id").primaryKey(),
  domain: text("domain").notNull(), // e.g. 'combat_codex'
  startedAt: timestamp("started_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  status: text("status").notNull(), // 'running', 'success', 'failed'
  discoveredUrls: integer("discovered_urls").notNull().default(0),
  keywordsUpserted: integer("keywords_upserted").notNull().default(0),
  classesAttempted: integer("classes_attempted").notNull().default(0),
  classesIngested: integer("classes_ingested").notNull().default(0),
  skillsUpserted: integer("skills_upserted").notNull().default(0),
  ragDocsUpserted: integer("rag_docs_upserted").notNull().default(0),
  error: text("error"),
  log: json("log"),
}, (table) => ({
  domainStartedIdx: index("ix_sync_runs_domain_started").on(table.domain, table.startedAt),
}));

export const insertSyncRunSchema = createInsertSchema(syncRuns).omit({ id: true });
export type InsertSyncRun = z.infer<typeof insertSyncRunSchema>;
export type SyncRun = typeof syncRuns.$inferSelect;

/**
 * Sync run items - tracks per-class results (success/skipped/failed)
 */
export const syncRunItems = pgTable("sync_run_items", {
  id: serial("id").primaryKey(),
  syncRunId: integer("sync_run_id").notNull().references(() => syncRuns.id, { onDelete: 'cascade' }),
  itemType: text("item_type").notNull(), // 'class_url' | 'keywords'
  itemKey: text("item_key").notNull(), // url or identifier
  status: text("status").notNull(), // 'success', 'skipped', 'failed'
  detail: text("detail"),
  skillsCount: integer("skills_count"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  syncRunIdIdx: index("ix_sync_run_items_run").on(table.syncRunId),
}));

export const insertSyncRunItemSchema = createInsertSchema(syncRunItems).omit({ id: true });
export type InsertSyncRunItem = z.infer<typeof insertSyncRunItemSchema>;
export type SyncRunItem = typeof syncRunItems.$inferSelect;

// ============================================================================
// PVE DROP RATE TRACKING
// Tracks Hunts (DFK Chain) and Patrols (Metis) drop events for rate analysis
// ============================================================================

/**
 * PVE drop events - raw reward/equipment minted events from Hunts & Patrols
 * Used to calculate base drop rates adjusted for party luck
 */
export const pveDropEvents = pgTable("pve_drop_events", {
  id: serial("id").primaryKey(),
  
  // Event identification
  chain: text("chain").notNull(), // 'dfk' (Hunts) or 'metis' (Patrols)
  eventType: text("event_type").notNull(), // 'hunt_reward', 'hunt_equipment', 'patrol_reward', 'patrol_equipment'
  encounterIdOrPatrolId: bigint("encounter_id", { mode: "number" }).notNull(),
  blockNumber: bigint("block_number", { mode: "number" }).notNull(),
  transactionHash: text("transaction_hash").notNull(),
  logIndex: integer("log_index").notNull(),
  
  // Player and hero info
  player: text("player").notNull(), // wallet address
  heroIds: json("hero_ids").$type<number[]>().notNull(), // heroes in party (for luck calculation)
  partyLuck: integer("party_luck"), // sum of party luck stats at event block (nullable if lookup fails)
  partySize: integer("party_size"), // number of heroes in party
  
  // Drop details
  itemAddress: text("item_address").notNull(), // token contract address
  itemSymbol: text("item_symbol"), // resolved symbol if known
  amount: numeric("amount", { precision: 30, scale: 0 }), // amount for fungible rewards
  
  // Equipment-specific fields
  equipmentType: integer("equipment_type"), // for equipment drops
  displayId: integer("display_id"),
  rarity: integer("rarity"), // 0=common, 1=uncommon, 2=rare, 3=legendary, 4=mythic
  nftId: bigint("nft_id", { mode: "number" }),
  
  // Encounter context
  enemyId: integer("enemy_id"), // hunt enemy type (1=Mad Boar, etc.)
  fightLevel: integer("fight_level"), // patrol level tier (1-3, 4-6, 7-9)
  won: boolean("won"), // whether the encounter was won
  
  // Timestamps
  blockTimestamp: timestamp("block_timestamp", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  chainEventIdx: index("pve_drop_events_chain_event_idx").on(table.chain, table.eventType),
  playerIdx: index("pve_drop_events_player_idx").on(table.player),
  itemIdx: index("pve_drop_events_item_idx").on(table.itemAddress),
  blockIdx: index("pve_drop_events_block_idx").on(table.chain, table.blockNumber),
  uniqueEvent: uniqueIndex("pve_drop_events_unique").on(table.transactionHash, table.logIndex),
}));

export const insertPveDropEventSchema = createInsertSchema(pveDropEvents).omit({ id: true, createdAt: true });
export type InsertPveDropEvent = z.infer<typeof insertPveDropEventSchema>;
export type PveDropEvent = typeof pveDropEvents.$inferSelect;

/**
 * PVE drop statistics - aggregated drop rates with luck adjustment
 * Computed periodically to derive base drop rates
 */
export const pveDropStats = pgTable("pve_drop_stats", {
  id: serial("id").primaryKey(),
  
  // Grouping dimensions
  chain: text("chain").notNull(), // 'dfk' or 'metis'
  eventType: text("event_type").notNull(), // 'hunt_reward', 'hunt_equipment', etc.
  itemAddress: text("item_address").notNull(),
  itemSymbol: text("item_symbol"),
  rarity: integer("rarity"), // for equipment - nullable for fungible rewards
  enemyIdOrLevel: integer("enemy_id_or_level"), // enemy ID for hunts, level tier for patrols
  
  // Aggregated statistics
  sampleCount: integer("sample_count").notNull(), // total drops observed
  encounterCount: integer("encounter_count").notNull(), // total encounters analyzed
  observedDropRate: numeric("observed_drop_rate", { precision: 15, scale: 8 }).notNull(), // drops / encounters
  avgPartyLuck: numeric("avg_party_luck", { precision: 10, scale: 2 }), // average party luck in sample
  
  // Luck-adjusted base rate: baseRate = observedRate - (0.0002 × avgPartyLuck)
  baseDropRate: numeric("base_drop_rate", { precision: 15, scale: 8 }), // computed base rate
  luckCoefficient: numeric("luck_coefficient", { precision: 15, scale: 8 }).default('0.0002'), // luck multiplier
  
  // Confidence metrics
  stdDevLuck: numeric("std_dev_luck", { precision: 10, scale: 2 }), // std dev of party luck
  confidenceIntervalLow: numeric("ci_low", { precision: 15, scale: 8 }), // 95% CI lower bound
  confidenceIntervalHigh: numeric("ci_high", { precision: 15, scale: 8 }), // 95% CI upper bound
  
  // Time range covered
  periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
  periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
  
  // Metadata
  computedAt: timestamp("computed_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  chainEventIdx: index("pve_drop_stats_chain_event_idx").on(table.chain, table.eventType),
  itemIdx: index("pve_drop_stats_item_idx").on(table.itemAddress),
  uniqueStats: uniqueIndex("pve_drop_stats_unique").on(
    table.chain, table.eventType, table.itemAddress, table.rarity, table.enemyIdOrLevel
  ),
}));

export const insertPveDropStatSchema = createInsertSchema(pveDropStats).omit({ id: true, createdAt: true, computedAt: true });
export type InsertPveDropStat = z.infer<typeof insertPveDropStatSchema>;
export type PveDropStat = typeof pveDropStats.$inferSelect;

/**
 * PVE indexer progress - multi-chain checkpoint tracking for Hunts/Patrols
 */
export const pveIndexerProgress = pgTable("pve_indexer_progress", {
  id: serial("id").primaryKey(),
  chain: text("chain").notNull().unique(), // 'dfk' or 'metis'
  lastProcessedBlock: bigint("last_processed_block", { mode: "number" }).notNull(),
  eventsProcessed: bigint("events_processed", { mode: "number" }).notNull().default(0),
  encountersProcessed: bigint("encounters_processed", { mode: "number" }).notNull().default(0),
  lastEventTimestamp: timestamp("last_event_timestamp", { withTimezone: true }),
  status: text("status").notNull().default('idle'), // 'idle', 'running', 'error'
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  chainIdx: uniqueIndex("pve_indexer_progress_chain_idx").on(table.chain),
}));

export const insertPveIndexerProgressSchema = createInsertSchema(pveIndexerProgress).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPveIndexerProgress = z.infer<typeof insertPveIndexerProgressSchema>;
export type PveIndexerProgress = typeof pveIndexerProgress.$inferSelect;

// ============================================================================
// PVP TOURNAMENT WINNER TRACKING SYSTEM
// ============================================================================

/**
 * PVP Tournaments - Core tournament metadata
 */
export const pvpTournaments = pgTable("pvp_tournaments", {
  id: serial("id").primaryKey(),
  tournamentId: bigint("tournament_id", { mode: "number" }).notNull().unique(),
  realm: text("realm").notNull().default('cv'), // 'cv', 'sd', 'metis'
  
  // Tournament info
  name: text("name"),
  format: text("format").notNull(), // '1v1', '3v3', '6v6'
  status: text("status").notNull(), // 'upcoming', 'in_progress', 'completed', 'cancelled'
  
  // Timing
  startTime: timestamp("start_time", { withTimezone: true }),
  endTime: timestamp("end_time", { withTimezone: true }),
  
  // Requirements (denormalized for quick access)
  levelMin: integer("level_min"),
  levelMax: integer("level_max"),
  rarityMin: integer("rarity_min"), // 0=common, 4=mythic
  rarityMax: integer("rarity_max"),
  partySize: integer("party_size").notNull(), // 1, 3, or 6
  
  // Tournament restrictions (DFK bitmasks and flags)
  excludedClasses: integer("excluded_classes").default(0), // bitmask of excluded class IDs
  excludedConsumables: integer("excluded_consumables").default(0), // bitmask of excluded consumable IDs
  excludedOrigin: integer("excluded_origin").default(0), // bitmask of excluded equipment origins
  allUniqueClasses: boolean("all_unique_classes").default(false), // "All Unique Classes" requirement
  noTripleClasses: boolean("no_triple_classes").default(false), // "No Triple Classes" requirement
  mustIncludeClass: boolean("must_include_class").default(false), // Must include specific class
  includedClassId: integer("included_class_id"), // Required class ID if mustIncludeClass
  battleInventory: integer("battle_inventory"), // Equipment rules bitmask
  battleBudget: integer("battle_budget"), // Combat budget
  minHeroStatScore: integer("min_hero_stat_score").default(0),
  maxHeroStatScore: integer("max_hero_stat_score").default(3000),
  minTeamStatScore: integer("min_team_stat_score").default(0),
  maxTeamStatScore: integer("max_team_stat_score").default(9000),
  shotClockDuration: integer("shot_clock_duration").default(45), // Turn timer in seconds
  privateBattle: boolean("private_battle").default(false),
  mapId: integer("map_id"),
  gloryBout: boolean("glory_bout").default(false),
  
  // Tournament type signature for grouping similar tournaments
  tournamentTypeSignature: text("tournament_type_signature"),
  
  // Entry fee and rewards
  minGlories: integer("min_glories").default(0), // Entry fee in glories
  hostGlories: integer("host_glories").default(0), // Glories staked by host
  opponentGlories: integer("opponent_glories").default(0), // Glories staked by opponent
  sponsorCount: integer("sponsor_count").default(0), // Number of sponsors
  rewardsJson: json("rewards_json"), // Array of reward tokens/amounts
  sponsorsJson: json("sponsors_json"), // Array of sponsor rewards
  
  // Player info
  hostPlayer: text("host_player"),
  opponentPlayer: text("opponent_player"),
  winnerPlayer: text("winner_player"),
  
  // Stats
  totalEntrants: integer("total_entrants").default(0),
  totalRounds: integer("total_rounds").default(0),
  
  // Raw battle data for future use
  rawBattleData: json("raw_battle_data"),
  
  // Indexing metadata
  lastIndexedAt: timestamp("last_indexed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  tournamentIdIdx: uniqueIndex("pvp_tournaments_tournament_id_idx").on(table.tournamentId),
  statusIdx: index("pvp_tournaments_status_idx").on(table.status),
  realmIdx: index("pvp_tournaments_realm_idx").on(table.realm),
  formatIdx: index("pvp_tournaments_format_idx").on(table.format),
  signatureIdx: index("pvp_tournaments_signature_idx").on(table.tournamentTypeSignature),
  levelBracketIdx: index("pvp_tournaments_level_bracket_idx").on(table.levelMin, table.levelMax),
}));

export const insertPvpTournamentSchema = createInsertSchema(pvpTournaments).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPvpTournament = z.infer<typeof insertPvpTournamentSchema>;
export type PvpTournament = typeof pvpTournaments.$inferSelect;

/**
 * Tournament Placements - Track which heroes placed in tournaments
 */
export const tournamentPlacements = pgTable("tournament_placements", {
  id: serial("id").primaryKey(),
  tournamentId: bigint("tournament_id", { mode: "number" }).notNull(),
  heroId: bigint("hero_id", { mode: "number" }).notNull(),
  playerAddress: text("player_address").notNull(),
  
  // Placement info
  placement: text("placement").notNull(), // 'winner', 'finalist', 'semifinalist', 'quarterfinalist'
  placementRank: integer("placement_rank"), // 1, 2, 3-4, 5-8, etc.
  
  // Team context (for team tournaments)
  teamIndex: integer("team_index"), // which team slot (0-5)
  teamId: text("team_id"), // group heroes from same team
  
  // Match stats (aggregated from tournament)
  matchesWon: integer("matches_won").default(0),
  matchesLost: integer("matches_lost").default(0),
  totalDamageDealt: bigint("total_damage_dealt", { mode: "number" }).default(0),
  totalDamageTaken: bigint("total_damage_taken", { mode: "number" }).default(0),
  
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  tournamentHeroIdx: uniqueIndex("tournament_placements_tournament_hero_idx").on(table.tournamentId, table.heroId),
  heroIdx: index("tournament_placements_hero_idx").on(table.heroId),
  playerIdx: index("tournament_placements_player_idx").on(table.playerAddress),
  placementIdx: index("tournament_placements_placement_idx").on(table.placement),
}));

export const insertTournamentPlacementSchema = createInsertSchema(tournamentPlacements).omit({ id: true, createdAt: true });
export type InsertTournamentPlacement = z.infer<typeof insertTournamentPlacementSchema>;
export type TournamentPlacement = typeof tournamentPlacements.$inferSelect;

/**
 * Hero Tournament Snapshots - Full hero data at time of tournament participation
 */
export const heroTournamentSnapshots = pgTable("hero_tournament_snapshots", {
  id: serial("id").primaryKey(),
  placementId: integer("placement_id").notNull().references(() => tournamentPlacements.id),
  heroId: bigint("hero_id", { mode: "number" }).notNull(),
  tournamentId: bigint("tournament_id", { mode: "number" }).notNull(),
  realm: text("realm").notNull().default('cv'), // 'cv' = Crystalvale Tavern, 'sd' = Serendale/Sundered Isles Barkeep
  
  // Core hero info
  rarity: integer("rarity").notNull(), // 0=common, 1=uncommon, 2=rare, 3=legendary, 4=mythic
  mainClass: text("main_class").notNull(),
  subClass: text("sub_class").notNull(),
  level: integer("level").notNull(),
  generation: integer("generation"),
  
  // All 8 primary stats at tournament time
  strength: integer("strength").notNull(),
  agility: integer("agility").notNull(),
  dexterity: integer("dexterity").notNull(),
  vitality: integer("vitality").notNull(),
  endurance: integer("endurance").notNull(),
  intelligence: integer("intelligence").notNull(),
  wisdom: integer("wisdom").notNull(),
  luck: integer("luck").notNull(),
  
  // Secondary/derived stats
  hp: integer("hp"),
  mp: integer("mp"),
  stamina: integer("stamina"),
  
  // Abilities at tournament time
  active1: text("active1"), // ability name/id
  active2: text("active2"),
  passive1: text("passive1"),
  passive2: text("passive2"),
  
  // Full genetics JSON for detailed comparison
  statGenes: json("stat_genes").$type<{
    class: string;
    subClass: string;
    profession: string;
    passive1: string;
    passive2: string;
    active1: string;
    active2: string;
    statBoost1: string;
    statBoost2: string;
    element: string;
    background: string;
  }>(),
  
  // Gene quality counts
  basicGeneCount: integer("basic_gene_count").default(0),
  advancedGeneCount: integer("advanced_gene_count").default(0),
  eliteGeneCount: integer("elite_gene_count").default(0),
  exaltedGeneCount: integer("exalted_gene_count").default(0),
  
  // Equipment at tournament time (JSON array)
  equipment: json("equipment").$type<Array<{
    slot: string;
    itemId: number;
    name: string;
    rarity: number;
    stats: Record<string, number>;
  }>>(),
  
  // Summoning info
  summonsRemaining: integer("summons_remaining"),
  maxSummons: integer("max_summons"),
  
  // Computed combat power score for quick filtering
  combatPowerScore: integer("combat_power_score"),
  
  // Raw hero data for future use
  rawHeroData: json("raw_hero_data"),
  
  snapshotAt: timestamp("snapshot_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  placementIdx: index("hero_tournament_snapshots_placement_idx").on(table.placementId),
  heroIdx: index("hero_tournament_snapshots_hero_idx").on(table.heroId),
  tournamentIdx: index("hero_tournament_snapshots_tournament_idx").on(table.tournamentId),
  classIdx: index("hero_tournament_snapshots_class_idx").on(table.mainClass),
  levelRarityIdx: index("hero_tournament_snapshots_level_rarity_idx").on(table.level, table.rarity),
}));

export const insertHeroTournamentSnapshotSchema = createInsertSchema(heroTournamentSnapshots).omit({ id: true, createdAt: true, snapshotAt: true });
export type InsertHeroTournamentSnapshot = z.infer<typeof insertHeroTournamentSnapshotSchema>;
export type HeroTournamentSnapshot = typeof heroTournamentSnapshots.$inferSelect;

/**
 * PVP Similarity Config - Configurable weights for hero matching
 */
export const pvpSimilarityConfig = pgTable("pvp_similarity_config", {
  id: serial("id").primaryKey(),
  configName: text("config_name").notNull().unique().default('default'),
  
  // Weight categories (should sum to 1.0 or 100%)
  statsWeight: numeric("stats_weight", { precision: 5, scale: 4 }).notNull().default('0.40'), // 40%
  activeAbilitiesWeight: numeric("active_abilities_weight", { precision: 5, scale: 4 }).notNull().default('0.25'), // 25%
  passiveAbilitiesWeight: numeric("passive_abilities_weight", { precision: 5, scale: 4 }).notNull().default('0.15'), // 15%
  classMatchWeight: numeric("class_match_weight", { precision: 5, scale: 4 }).notNull().default('0.10'), // 10%
  rarityMatchWeight: numeric("rarity_match_weight", { precision: 5, scale: 4 }).notNull().default('0.05'), // 5%
  geneQualityWeight: numeric("gene_quality_weight", { precision: 5, scale: 4 }).notNull().default('0.05'), // 5%
  
  // Individual stat weights within statsWeight (JSON for flexibility)
  statWeights: json("stat_weights").$type<{
    strength: number;
    agility: number;
    dexterity: number;
    vitality: number;
    endurance: number;
    intelligence: number;
    wisdom: number;
    luck: number;
  }>().default({
    strength: 0.15,
    agility: 0.15,
    dexterity: 0.10,
    vitality: 0.15,
    endurance: 0.10,
    intelligence: 0.15,
    wisdom: 0.10,
    luck: 0.10,
  }),
  
  // Minimum thresholds
  minSimilarityScore: numeric("min_similarity_score", { precision: 5, scale: 4 }).default('0.60'), // 60% minimum to recommend
  maxPriceDifferencePercent: numeric("max_price_difference_percent", { precision: 5, scale: 2 }).default('50.00'), // max 50% over average winner price
  
  // Filter settings
  includeSemifinalists: boolean("include_semifinalists").default(true),
  includeFinalists: boolean("include_finalists").default(true),
  includeWinners: boolean("include_winners").default(true),
  lookbackTournaments: integer("lookback_tournaments").default(20), // how many past tournaments to consider
  
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  configNameIdx: uniqueIndex("pvp_similarity_config_name_idx").on(table.configName),
  activeIdx: index("pvp_similarity_config_active_idx").on(table.isActive),
}));

export const insertPvpSimilarityConfigSchema = createInsertSchema(pvpSimilarityConfig).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPvpSimilarityConfig = z.infer<typeof insertPvpSimilarityConfigSchema>;
export type PvpSimilarityConfig = typeof pvpSimilarityConfig.$inferSelect;

/**
 * Tournament Indexer Progress - Track indexing state
 */
export const tournamentIndexerProgress = pgTable("tournament_indexer_progress", {
  id: serial("id").primaryKey(),
  realm: text("realm").notNull().unique().default('cv'),
  lastTournamentId: bigint("last_tournament_id", { mode: "number" }).default(0),
  tournamentsIndexed: integer("tournaments_indexed").default(0),
  placementsIndexed: integer("placements_indexed").default(0),
  snapshotsIndexed: integer("snapshots_indexed").default(0),
  status: text("status").notNull().default('idle'), // 'idle', 'running', 'error'
  lastError: text("last_error"),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertTournamentIndexerProgressSchema = createInsertSchema(tournamentIndexerProgress).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTournamentIndexerProgress = z.infer<typeof insertTournamentIndexerProgressSchema>;
export type TournamentIndexerProgress = typeof tournamentIndexerProgress.$inferSelect;

/**
 * Tournament Types - Label and group recurring tournament restriction patterns
 * Maps tournament signatures or names to human-readable labels
 */
export const pvpTournamentTypes = pgTable("pvp_tournament_types", {
  id: serial("id").primaryKey(),
  
  // Pattern identification (one of these should be set)
  signature: text("signature").unique(), // technical signature like "lv6-9_r0-4_p3_unique"
  namePattern: text("name_pattern"), // regex or exact match on tournament name
  
  // Human-readable label
  label: text("label").notNull(), // e.g., "Low Level Unique Budget"
  description: text("description"), // longer explanation of the restrictions
  
  // Category for grouping (e.g., "beginner", "veteran", "specialty")
  category: text("category").default('general'),
  
  // Color for UI display
  color: text("color").default('#6366f1'), // hex color for badges
  
  // Statistics (auto-updated)
  occurrenceCount: integer("occurrence_count").default(0), // how many tournaments match
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  
  // Meta
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  signatureIdx: index("pvp_tournament_types_signature_idx").on(table.signature),
  labelIdx: index("pvp_tournament_types_label_idx").on(table.label),
  categoryIdx: index("pvp_tournament_types_category_idx").on(table.category),
}));

export const insertPvpTournamentTypeSchema = createInsertSchema(pvpTournamentTypes).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPvpTournamentType = z.infer<typeof insertPvpTournamentTypeSchema>;
export type PvpTournamentType = typeof pvpTournamentTypes.$inferSelect;

// ============================================================================
// TAVERN HEROES INDEXER - Cached marketplace listings with TTS
// ============================================================================

/**
 * Tavern Heroes - Cached hero listings from DFK marketplace
 * Indexed every 30 minutes with parallel workers
 */
export const tavernHeroes = pgTable("tavern_heroes", {
  id: serial("id").primaryKey(),
  heroId: text("hero_id").notNull(), // Full hero ID as string (can be > JS number max)
  normalizedId: bigint("normalized_id", { mode: "number" }).notNull(),
  realm: text("realm").notNull(), // 'cv' (Crystalvale) or 'sd' (Sundered Isles)
  
  // Class and profession
  mainClass: text("main_class").notNull(),
  subClass: text("sub_class"),
  profession: text("profession"),
  
  // Hero attributes
  rarity: integer("rarity").notNull().default(0),
  level: integer("level").notNull().default(1),
  generation: integer("generation").notNull().default(0),
  summons: integer("summons").notNull().default(0),
  maxSummons: integer("max_summons").notNull().default(0),
  
  // Stats
  strength: integer("strength").default(0),
  agility: integer("agility").default(0),
  intelligence: integer("intelligence").default(0),
  wisdom: integer("wisdom").default(0),
  luck: integer("luck").default(0),
  dexterity: integer("dexterity").default(0),
  vitality: integer("vitality").default(0),
  endurance: integer("endurance").default(0),
  hp: integer("hp").default(0),
  mp: integer("mp").default(0),
  stamina: integer("stamina").default(25),
  
  // Abilities for TTS calculation
  active1: text("active1"), // "ability_X" format
  active2: text("active2"),
  passive1: text("passive1"),
  passive2: text("passive2"),
  
  // Pre-computed Team Trait Score (0-12 range)
  traitScore: integer("trait_score").notNull().default(0),
  
  // Pricing
  salePrice: text("sale_price"), // Raw price in wei
  priceNative: numeric("price_native", { precision: 30, scale: 8 }), // Price in native token
  nativeToken: text("native_token"), // 'CRYSTAL' or 'JEWEL'
  
  // Indexing metadata
  indexedAt: timestamp("indexed_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  batchId: text("batch_id"), // Links heroes indexed in same batch
}, (table) => ({
  heroIdIdx: uniqueIndex("tavern_heroes_hero_id_idx").on(table.heroId),
  realmIdx: index("tavern_heroes_realm_idx").on(table.realm),
  mainClassIdx: index("tavern_heroes_main_class_idx").on(table.mainClass),
  traitScoreIdx: index("tavern_heroes_trait_score_idx").on(table.traitScore),
  priceNativeIdx: index("tavern_heroes_price_native_idx").on(table.priceNative),
  batchIdIdx: index("tavern_heroes_batch_id_idx").on(table.batchId),
}));

export const insertTavernHeroSchema = createInsertSchema(tavernHeroes).omit({ id: true, indexedAt: true });
export type InsertTavernHero = z.infer<typeof insertTavernHeroSchema>;
export type TavernHero = typeof tavernHeroes.$inferSelect;

/**
 * Tavern Indexer Progress - Track indexing state
 */
export const tavernIndexerProgress = pgTable("tavern_indexer_progress", {
  id: serial("id").primaryKey(),
  realm: text("realm").notNull().unique(), // 'cv' or 'sd'
  
  // Indexing stats
  heroesIndexed: integer("heroes_indexed").default(0),
  lastBatchId: text("last_batch_id"),
  
  // Status tracking
  status: text("status").notNull().default('idle'), // 'idle', 'running', 'error'
  lastError: text("last_error"),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
  
  // Timing
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
});

export const insertTavernIndexerProgressSchema = createInsertSchema(tavernIndexerProgress).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTavernIndexerProgress = z.infer<typeof insertTavernIndexerProgressSchema>;
export type TavernIndexerProgress = typeof tavernIndexerProgress.$inferSelect;

// ============================================================================
// MARKET INTEL - Listing History and Demand Metrics
// ============================================================================

/**
 * Tavern Listing History - Hourly snapshots for delta comparison (detect sales)
 */
export const tavernListingHistory = pgTable("tavern_listing_history", {
  id: serial("id").primaryKey(),
  heroId: text("hero_id").notNull(),
  realm: text("realm").notNull(),
  
  // Snapshot data
  snapshotAt: timestamp("snapshot_at", { withTimezone: true }).notNull(),
  priceNative: numeric("price_native", { precision: 30, scale: 8 }),
  nativeToken: text("native_token"),
  
  // Hero traits at snapshot time (denormalized for historical accuracy)
  mainClass: text("main_class"),
  subClass: text("sub_class"),
  profession: text("profession"),
  rarity: integer("rarity"),
  level: integer("level"),
  generation: integer("generation"),
  summons: integer("summons"),
  maxSummons: integer("max_summons"),
  traitScore: integer("trait_score"),
  
  // Status: 'listed', 'sold', 'delisted' (computed by delta comparison)
  status: text("status").notNull().default('listed'),
  statusChangedAt: timestamp("status_changed_at", { withTimezone: true }),
  
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  heroIdSnapshotIdx: index("tavern_listing_history_hero_snapshot_idx").on(table.heroId, table.snapshotAt),
  realmSnapshotIdx: index("tavern_listing_history_realm_snapshot_idx").on(table.realm, table.snapshotAt),
  statusIdx: index("tavern_listing_history_status_idx").on(table.status),
}));

export const insertTavernListingHistorySchema = createInsertSchema(tavernListingHistory).omit({ id: true, createdAt: true });
export type InsertTavernListingHistory = z.infer<typeof insertTavernListingHistorySchema>;
export type TavernListingHistory = typeof tavernListingHistory.$inferSelect;

/**
 * Tavern Demand Metrics - Pre-computed demand scores per cohort
 */
export const tavernDemandMetrics = pgTable("tavern_demand_metrics", {
  id: serial("id").primaryKey(),
  realm: text("realm").notNull(),
  asOfDate: timestamp("as_of_date", { withTimezone: true }).notNull(),
  
  // Cohort definition
  mainClass: text("main_class").notNull(),
  subClass: text("sub_class"),
  profession: text("profession"),
  rarity: integer("rarity"),
  levelBand: text("level_band"), // '1-5', '6-10', '11-15', etc.
  
  // Demand signals
  salesCount7d: integer("sales_count_7d").default(0),
  salesCount30d: integer("sales_count_30d").default(0),
  avgTimeOnMarketHours: numeric("avg_time_on_market_hours", { precision: 10, scale: 2 }),
  medianPriceNative: numeric("median_price_native", { precision: 30, scale: 8 }),
  priceVelocity7d: numeric("price_velocity_7d", { precision: 10, scale: 4 }), // % change
  
  // Computed scores (0-100)
  demandScore: integer("demand_score").default(50),
  velocityScore: integer("velocity_score").default(50),
  liquidityScore: integer("liquidity_score").default(50),
  
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  realmDateIdx: index("tavern_demand_metrics_realm_date_idx").on(table.realm, table.asOfDate),
  cohortIdx: index("tavern_demand_metrics_cohort_idx").on(table.realm, table.mainClass, table.rarity),
}));

export const insertTavernDemandMetricsSchema = createInsertSchema(tavernDemandMetrics).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTavernDemandMetrics = z.infer<typeof insertTavernDemandMetricsSchema>;
export type TavernDemandMetrics = typeof tavernDemandMetrics.$inferSelect;

// ============================================================================
// SUMMON PROFIT TRACKER - Sessions, Outcomes, and Conversion Metrics
// ============================================================================

/**
 * Summon Sessions - Track individual summoning attempts with full cost breakdown
 */
export const summonSessions = pgTable("summon_sessions", {
  id: serial("id").primaryKey(),
  realm: text("realm").notNull(), // 'cv' or 'sd'
  walletAddress: text("wallet_address").notNull(),
  
  // Parent heroes
  parent1HeroId: text("parent1_hero_id").notNull(),
  parent2HeroId: text("parent2_hero_id").notNull(),
  
  // Parent acquisition costs (if purchased from tavern)
  parent1CostNative: numeric("parent1_cost_native", { precision: 30, scale: 8 }),
  parent2CostNative: numeric("parent2_cost_native", { precision: 30, scale: 8 }),
  parent1CostUsd: numeric("parent1_cost_usd", { precision: 15, scale: 2 }),
  parent2CostUsd: numeric("parent2_cost_usd", { precision: 15, scale: 2 }),
  
  // Summoning costs
  summonFeeNative: numeric("summon_fee_native", { precision: 30, scale: 8 }),
  summonFeeUsd: numeric("summon_fee_usd", { precision: 15, scale: 2 }),
  enhancementStonesUsed: integer("enhancement_stones_used").default(0),
  enhancementStoneCostNative: numeric("enhancement_stone_cost_native", { precision: 30, scale: 8 }),
  enhancementStoneCostUsd: numeric("enhancement_stone_cost_usd", { precision: 15, scale: 2 }),
  gasCostNative: numeric("gas_cost_native", { precision: 30, scale: 8 }),
  gasCostUsd: numeric("gas_cost_usd", { precision: 15, scale: 2 }),
  
  // Total costs
  totalCostNative: numeric("total_cost_native", { precision: 30, scale: 8 }),
  totalCostUsd: numeric("total_cost_usd", { precision: 15, scale: 2 }),
  nativeToken: text("native_token").notNull(), // 'CRYSTAL' or 'JEWEL'
  
  // Expected outcome (from Summon Sniper prediction)
  expectedOffspringValue: numeric("expected_offspring_value", { precision: 30, scale: 8 }),
  expectedProfitNative: numeric("expected_profit_native", { precision: 30, scale: 8 }),
  targetTraits: json("target_traits").$type<{
    mainClass?: string;
    subClass?: string;
    profession?: string;
    statBoosts?: string[];
  }>(),
  
  // Summon result
  offspringHeroId: text("offspring_hero_id"),
  summonedAt: timestamp("summoned_at", { withTimezone: true }),
  summonTxHash: text("summon_tx_hash"),
  
  // Session state: 'pending', 'summoned', 'listed', 'sold', 'failed'
  status: text("status").notNull().default('pending'),
  
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  walletIdx: index("summon_sessions_wallet_idx").on(table.walletAddress),
  realmIdx: index("summon_sessions_realm_idx").on(table.realm),
  statusIdx: index("summon_sessions_status_idx").on(table.status),
  summonedAtIdx: index("summon_sessions_summoned_at_idx").on(table.summonedAt),
}));

export const insertSummonSessionSchema = createInsertSchema(summonSessions).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSummonSession = z.infer<typeof insertSummonSessionSchema>;
export type SummonSession = typeof summonSessions.$inferSelect;

/**
 * Summon Offspring - Actual traits of summoned hero (compared to expected)
 */
export const summonOffspring = pgTable("summon_offspring", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull().references(() => summonSessions.id),
  heroId: text("hero_id").notNull(),
  
  // Actual traits
  mainClass: text("main_class").notNull(),
  subClass: text("sub_class"),
  profession: text("profession"),
  rarity: integer("rarity").notNull(),
  generation: integer("generation").notNull(),
  
  // Stats
  strength: integer("strength"),
  agility: integer("agility"),
  intelligence: integer("intelligence"),
  wisdom: integer("wisdom"),
  luck: integer("luck"),
  dexterity: integer("dexterity"),
  vitality: integer("vitality"),
  endurance: integer("endurance"),
  
  // Abilities
  active1: text("active1"),
  active2: text("active2"),
  passive1: text("passive1"),
  passive2: text("passive2"),
  traitScore: integer("trait_score"),
  
  // Demand match score (how well it matches high-demand traits)
  demandMatchScore: integer("demand_match_score").default(0),
  matchedTargetTraits: boolean("matched_target_traits").default(false),
  
  // Valuation
  estimatedValueNative: numeric("estimated_value_native", { precision: 30, scale: 8 }),
  estimatedValueUsd: numeric("estimated_value_usd", { precision: 15, scale: 2 }),
  
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  sessionIdIdx: index("summon_offspring_session_id_idx").on(table.sessionId),
  heroIdIdx: uniqueIndex("summon_offspring_hero_id_idx").on(table.heroId),
  mainClassIdx: index("summon_offspring_main_class_idx").on(table.mainClass),
}));

export const insertSummonOffspringSchema = createInsertSchema(summonOffspring).omit({ id: true, createdAt: true });
export type InsertSummonOffspring = z.infer<typeof insertSummonOffspringSchema>;
export type SummonOffspring = typeof summonOffspring.$inferSelect;

/**
 * Summon Sales Outcomes - Track whether offspring sold and at what profit/loss
 */
export const summonSalesOutcomes = pgTable("summon_sales_outcomes", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull().references(() => summonSessions.id),
  offspringId: integer("offspring_id").notNull().references(() => summonOffspring.id),
  
  // Listing info
  listedAt: timestamp("listed_at", { withTimezone: true }),
  listPriceNative: numeric("list_price_native", { precision: 30, scale: 8 }),
  
  // Sale result
  soldAt: timestamp("sold_at", { withTimezone: true }),
  salePriceNative: numeric("sale_price_native", { precision: 30, scale: 8 }),
  salePriceUsd: numeric("sale_price_usd", { precision: 15, scale: 2 }),
  buyerAddress: text("buyer_address"),
  saleTxHash: text("sale_tx_hash"),
  
  // Time metrics
  timeOnMarketHours: numeric("time_on_market_hours", { precision: 10, scale: 2 }),
  
  // Profit/Loss calculation
  profitNative: numeric("profit_native", { precision: 30, scale: 8 }),
  profitUsd: numeric("profit_usd", { precision: 15, scale: 2 }),
  profitMarginPercent: numeric("profit_margin_percent", { precision: 10, scale: 2 }),
  
  // Outcome status: 'listed', 'sold', 'expired', 'delisted', 'burned'
  outcome: text("outcome").notNull().default('listed'),
  lossReason: text("loss_reason"), // If outcome is not 'sold'
  
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  sessionIdIdx: index("summon_sales_outcomes_session_id_idx").on(table.sessionId),
  outcomeIdx: index("summon_sales_outcomes_outcome_idx").on(table.outcome),
  soldAtIdx: index("summon_sales_outcomes_sold_at_idx").on(table.soldAt),
}));

export const insertSummonSalesOutcomeSchema = createInsertSchema(summonSalesOutcomes).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSummonSalesOutcome = z.infer<typeof insertSummonSalesOutcomeSchema>;
export type SummonSalesOutcome = typeof summonSalesOutcomes.$inferSelect;

/**
 * Summon Conversion Metrics - Per-cohort conversion rates and profit stats
 */
export const summonConversionMetrics = pgTable("summon_conversion_metrics", {
  id: serial("id").primaryKey(),
  realm: text("realm").notNull(),
  asOfDate: timestamp("as_of_date", { withTimezone: true }).notNull(),
  
  // Cohort definition (offspring characteristics)
  mainClass: text("main_class").notNull(),
  subClass: text("sub_class"),
  profession: text("profession"),
  rarity: integer("rarity"),
  traitScoreBand: text("trait_score_band"), // '0-3', '4-6', '7-9', '10-12'
  
  // Conversion metrics
  totalSummons: integer("total_summons").default(0),
  listedCount: integer("listed_count").default(0),
  soldCount: integer("sold_count").default(0),
  conversionRate: numeric("conversion_rate", { precision: 5, scale: 4 }), // 0.0000 - 1.0000
  
  // Time metrics
  avgTimeToSaleHours: numeric("avg_time_to_sale_hours", { precision: 10, scale: 2 }),
  medianTimeToSaleHours: numeric("median_time_to_sale_hours", { precision: 10, scale: 2 }),
  
  // Profit metrics
  avgProfitNative: numeric("avg_profit_native", { precision: 30, scale: 8 }),
  avgProfitUsd: numeric("avg_profit_usd", { precision: 15, scale: 2 }),
  avgLossNative: numeric("avg_loss_native", { precision: 30, scale: 8 }), // Average loss on non-converters
  avgLossUsd: numeric("avg_loss_usd", { precision: 15, scale: 2 }),
  
  // Risk-adjusted profit formula components
  expectedValueNative: numeric("expected_value_native", { precision: 30, scale: 8 }),
  riskAdjustedProfitNative: numeric("risk_adjusted_profit_native", { precision: 30, scale: 8 }),
  
  // Confidence
  sampleSize: integer("sample_size").default(0),
  confidenceLevel: text("confidence_level").default('low'), // 'low', 'medium', 'high' based on sample size
  
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).default(sql`CURRENT_TIMESTAMP`).notNull(),
}, (table) => ({
  realmDateIdx: index("summon_conversion_metrics_realm_date_idx").on(table.realm, table.asOfDate),
  cohortIdx: index("summon_conversion_metrics_cohort_idx").on(table.realm, table.mainClass, table.rarity),
  conversionRateIdx: index("summon_conversion_metrics_conv_rate_idx").on(table.conversionRate),
}))

export const insertSummonConversionMetricsSchema = createInsertSchema(summonConversionMetrics).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSummonConversionMetrics = z.infer<typeof insertSummonConversionMetricsSchema>;
export type SummonConversionMetrics = typeof summonConversionMetrics.$inferSelect;
