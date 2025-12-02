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
  // Contains: archetype, tier, state, behaviorTags, kpis, dfkSnapshot, flags, recentMessages
  profileData: json("profile_data").$type<{
    archetype: string;
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
