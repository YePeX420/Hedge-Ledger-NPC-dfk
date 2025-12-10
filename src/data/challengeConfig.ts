// src/data/challengeConfig.ts

export type TierSystem = "RARITY" | "GENE" | "MIXED" | "PRESTIGE";

export type ChallengeTierCode =
  | "COMMON"
  | "UNCOMMON"
  | "RARE"
  | "LEGENDARY"
  | "MYTHIC"
  | "BASIC"
  | "ADVANCED"
  | "ELITE"
  | "EXALTED";

export interface ChallengeTierDef {
  tierCode: ChallengeTierCode;
  displayName: string;
  thresholdValue: number;
  isPrestige?: boolean;
  sortOrder: number;
  meta?: {
    description?: string;
  };
}

export interface ChallengeDef {
  key: string;
  categoryKey: string;
  name: string;
  description: string;
  tierSystemOverride?: TierSystem;
  metricType: "COUNT" | "STREAK" | "SCORE" | "BOOLEAN" | "COMPOSITE";
  metricSource: string;
  metricKey: string;
  isActive: boolean;
  sortOrder: number;
  meta?: {
    icon?: string;
    tags?: string[];
    tooltip?: string;
  };
  tiers: ChallengeTierDef[];
}

export interface ChallengeCategoryDef {
  key: string;
  name: string;
  description: string;
  tierSystem: TierSystem;
  sortOrder: number;
}

export interface HedgeChallengeConfig {
  categories: ChallengeCategoryDef[];
  challenges: ChallengeDef[];
}

export const HEDGE_CHALLENGE_CONFIG: HedgeChallengeConfig = {
  categories: [
    {
      key: "hero_progression",
      name: "Hero Progression",
      description: "Level up, quest, and grow your roster.",
      tierSystem: "RARITY",
      sortOrder: 1,
    },
    {
      key: "economy_strategy",
      name: "Economy & Strategy",
      description: "Optimize your yields, staking, and reinvestment.",
      tierSystem: "GENE",
      sortOrder: 2,
    },
    {
      key: "profession_specialization",
      name: "Profession Specialization",
      description: "Master mining, gardening, fishing, foraging, and hunting.",
      tierSystem: "MIXED",
      sortOrder: 3,
    },
    {
      key: "ownership_collection",
      name: "Ownership & Collection",
      description: "Grow your army of heroes, pets, items, and Gen0s.",
      tierSystem: "RARITY",
      sortOrder: 4,
    },
    {
      key: "behavior_engagement",
      name: "Behavior & Engagement",
      description: "Show your commitment to the Kingdom and to Hedge.",
      tierSystem: "GENE",
      sortOrder: 5,
    },
    {
      key: "seasonal_events",
      name: "Seasonal & Events",
      description: "Limited-time challenges that rotate with the seasons.",
      tierSystem: "MIXED",
      sortOrder: 6,
    },
    {
      key: "prestige_overall",
      name: "Prestige",
      description: "Ultra-rare account-wide achievements.",
      tierSystem: "PRESTIGE",
      sortOrder: 7,
    },
    {
      key: "summoning_prestige",
      name: "Summoning & Lineage",
      description: "Ultra-rare summons, bloodlines, and hero refinement.",
      tierSystem: "PRESTIGE",
      sortOrder: 8,
    },
  ],

  // ===================================================================
  // CHALLENGES
  // ===================================================================
  challenges: [
    // Category: behavior_engagement (Core engagement)
    {
      key: "active_adventurer",
      categoryKey: "behavior_engagement",
      name: "Active Adventurer",
      description: "Log meaningful activity in the Kingdom across multiple days.",
      metricType: "COUNT",
      metricSource: "cluster_activity",
      metricKey: "active_days",
      isActive: true,
      sortOrder: 1,
      meta: {
        icon: "calendar",
        tags: ["engagement", "daily"],
        tooltip: "Counts days with at least one meaningful action on any linked wallet.",
      },
      tiers: [
        { tierCode: "BASIC", displayName: "Basic", thresholdValue: 3, sortOrder: 1 },
        { tierCode: "ADVANCED", displayName: "Advanced", thresholdValue: 10, sortOrder: 2 },
        { tierCode: "ELITE", displayName: "Elite", thresholdValue: 30, sortOrder: 3 },
        { tierCode: "EXALTED", displayName: "Exalted", thresholdValue: 90, sortOrder: 4, isPrestige: true },
      ],
    },
    {
      key: "realm_communicator",
      categoryKey: "behavior_engagement",
      name: "Realm Communicator",
      description: "Engage with Hedge and the community via Discord and bot commands.",
      metricType: "SCORE",
      metricSource: "discord_engagement",
      metricKey: "engagement_score",
      isActive: true,
      sortOrder: 2,
      meta: {
        icon: "messages",
        tags: ["discord", "hedge", "social"],
        tooltip: "Weighted score from Hedge commands, onboarding steps, events, and helpful messages.",
      },
      tiers: [
        { tierCode: "BASIC", displayName: "Basic", thresholdValue: 10, sortOrder: 1 },
        { tierCode: "ADVANCED", displayName: "Advanced", thresholdValue: 50, sortOrder: 2 },
        { tierCode: "ELITE", displayName: "Elite", thresholdValue: 150, sortOrder: 3 },
        { tierCode: "EXALTED", displayName: "Exalted", thresholdValue: 400, sortOrder: 4, isPrestige: true },
      ],
    },

    // Category: profession_specialization (Professions)
    {
      key: "herbalist_master",
      categoryKey: "profession_specialization",
      name: "Herbalist Master",
      description: "Complete Foraging quests and gather herbs from the wilds.",
      metricType: "COUNT",
      metricSource: "onchain_quests",
      metricKey: "foraging_quests_completed",
      isActive: true,
      sortOrder: 1,
      meta: { icon: "leaf", tags: ["profession", "foraging"] },
      tiers: [
        { tierCode: "BASIC", displayName: "Basic", thresholdValue: 25, sortOrder: 1 },
        { tierCode: "ADVANCED", displayName: "Advanced", thresholdValue: 100, sortOrder: 2 },
        { tierCode: "ELITE", displayName: "Elite", thresholdValue: 500, sortOrder: 3 },
        { tierCode: "EXALTED", displayName: "Exalted", thresholdValue: 1500, sortOrder: 4, isPrestige: true },
      ],
    },
    {
      key: "fisher_king",
      categoryKey: "profession_specialization",
      name: "Fisher King",
      description: "Spend time at the docks and master the art of Fishing.",
      metricType: "COUNT",
      metricSource: "onchain_quests",
      metricKey: "fishing_quests_completed",
      isActive: true,
      sortOrder: 2,
      meta: { icon: "fish", tags: ["profession", "fishing"] },
      tiers: [
        { tierCode: "BASIC", displayName: "Basic", thresholdValue: 25, sortOrder: 1 },
        { tierCode: "ADVANCED", displayName: "Advanced", thresholdValue: 100, sortOrder: 2 },
        { tierCode: "ELITE", displayName: "Elite", thresholdValue: 500, sortOrder: 3 },
        { tierCode: "EXALTED", displayName: "Exalted", thresholdValue: 1500, sortOrder: 4, isPrestige: true },
      ],
    },
    {
      key: "ranger_of_the_wilds",
      categoryKey: "profession_specialization",
      name: "Ranger of the Wilds",
      description: "Complete wilderness or woodcutting quests in the wild.",
      metricType: "COUNT",
      metricSource: "onchain_quests",
      metricKey: "wilds_quests_completed",
      isActive: true,
      sortOrder: 3,
      meta: { icon: "trees", tags: ["profession", "wilds"] },
      tiers: [
        { tierCode: "BASIC", displayName: "Basic", thresholdValue: 25, sortOrder: 1 },
        { tierCode: "ADVANCED", displayName: "Advanced", thresholdValue: 100, sortOrder: 2 },
        { tierCode: "ELITE", displayName: "Elite", thresholdValue: 500, sortOrder: 3 },
        { tierCode: "EXALTED", displayName: "Exalted", thresholdValue: 1500, sortOrder: 4, isPrestige: true },
      ],
    },
    {
      key: "miner_lord",
      categoryKey: "profession_specialization",
      name: "Miner Lord",
      description: "Delve into the mines and complete Mining quests.",
      metricType: "COUNT",
      metricSource: "onchain_quests",
      metricKey: "mining_quests_completed",
      isActive: true,
      sortOrder: 4,
      meta: { icon: "pickaxe", tags: ["profession", "mining"] },
      tiers: [
        { tierCode: "BASIC", displayName: "Basic", thresholdValue: 25, sortOrder: 1 },
        { tierCode: "ADVANCED", displayName: "Advanced", thresholdValue: 100, sortOrder: 2 },
        { tierCode: "ELITE", displayName: "Elite", thresholdValue: 500, sortOrder: 3 },
        { tierCode: "EXALTED", displayName: "Exalted", thresholdValue: 1500, sortOrder: 4, isPrestige: true },
      ],
    },
    {
      key: "profession_streak",
      categoryKey: "profession_specialization",
      name: "Master of Professions",
      description: "Maintain a consistent streak of days with profession quests.",
      metricType: "STREAK",
      metricSource: "cluster_activity",
      metricKey: "profession_streak_days",
      isActive: true,
      sortOrder: 5,
      meta: { icon: "wrench", tags: ["streak", "professions"] },
      tiers: [
        { tierCode: "BASIC", displayName: "Basic", thresholdValue: 3, sortOrder: 1 },
        { tierCode: "ADVANCED", displayName: "Advanced", thresholdValue: 7, sortOrder: 2 },
        { tierCode: "ELITE", displayName: "Elite", thresholdValue: 14, sortOrder: 3 },
        { tierCode: "EXALTED", displayName: "Exalted", thresholdValue: 30, sortOrder: 4, isPrestige: true },
      ],
    },

    // === PART 1 END === (continue with PART 2 challenges directly below this line)
    //
    // CATEGORY 4: OWNERSHIP & COLLECTION
    //

    {
      key: "house_of_heroes",
      categoryKey: "ownership_collection",
      name: "House of Heroes",
      description: "Own heroes across all your linked wallets. Measures roster size.",
      metricType: "COUNT",
      metricSource: "onchain_heroes",
      metricKey: "hero_count",
      isActive: true,
      sortOrder: 1,
      meta: { icon: "users", tags: ["heroes", "ownership"] },
      tiers: [
        { tierCode: "COMMON", displayName: "Common", thresholdValue: 10, sortOrder: 1 },
        { tierCode: "UNCOMMON", displayName: "Uncommon", thresholdValue: 25, sortOrder: 2 },
        { tierCode: "RARE", displayName: "Rare", thresholdValue: 50, sortOrder: 3 },
        { tierCode: "LEGENDARY", displayName: "Legendary", thresholdValue: 100, sortOrder: 4 },
        { tierCode: "MYTHIC", displayName: "Mythic", thresholdValue: 200, sortOrder: 5, isPrestige: true },
      ],
    },

    {
      key: "hero_legion",
      categoryKey: "ownership_collection",
      name: "Hero Legion",
      description: "Sum of all levels across your hero roster.",
      metricType: "COUNT",
      metricSource: "onchain_heroes",
      metricKey: "total_levels",
      isActive: true,
      sortOrder: 2,
      meta: { icon: "shield-group", tags: ["heroes", "levels"] },
      tiers: [
        { tierCode: "COMMON", displayName: "Common", thresholdValue: 100, sortOrder: 1 },
        { tierCode: "UNCOMMON", displayName: "Uncommon", thresholdValue: 300, sortOrder: 2 },
        { tierCode: "RARE", displayName: "Rare", thresholdValue: 800, sortOrder: 3 },
        { tierCode: "LEGENDARY", displayName: "Legendary", thresholdValue: 2000, sortOrder: 4 },
        { tierCode: "MYTHIC", displayName: "Mythic", thresholdValue: 5000, sortOrder: 5, isPrestige: true },
      ],
    },

    {
      key: "hero_curator",
      categoryKey: "ownership_collection",
      name: "Hero Curator",
      description: "Own unique classes across Basic, Advanced, Elite, and Exalted tiers.",
      metricType: "COUNT",
      metricSource: "onchain_heroes",
      metricKey: "unique_classes",
      isActive: true,
      sortOrder: 3,
      meta: { icon: "scroll", tags: ["heroes", "collection"] },
      tiers: [
        { tierCode: "COMMON", displayName: "Common", thresholdValue: 4, sortOrder: 1 },
        { tierCode: "UNCOMMON", displayName: "Uncommon", thresholdValue: 8, sortOrder: 2 },
        { tierCode: "RARE", displayName: "Rare", thresholdValue: 12, sortOrder: 3 },
        { tierCode: "LEGENDARY", displayName: "Legendary", thresholdValue: 16, sortOrder: 4 },
        { tierCode: "MYTHIC", displayName: "Mythic", thresholdValue: 20, sortOrder: 5, isPrestige: true },
      ],
    },

    {
      key: "pet_collector",
      categoryKey: "ownership_collection",
      name: "Pet Collector",
      description: "Collect pets across rarities to build your perfect companion compendium.",
      metricType: "COUNT",
      metricSource: "onchain_pets",
      metricKey: "rarity_weighted_count",
      isActive: true,
      sortOrder: 4,
      meta: { icon: "paw", tags: ["pets", "collection"] },
      tiers: [
        { tierCode: "COMMON", displayName: "Common", thresholdValue: 5, sortOrder: 1 },
        { tierCode: "UNCOMMON", displayName: "Uncommon", thresholdValue: 10, sortOrder: 2 },
        { tierCode: "RARE", displayName: "Rare", thresholdValue: 20, sortOrder: 3 },
        { tierCode: "LEGENDARY", displayName: "Legendary", thresholdValue: 40, sortOrder: 4 },
        { tierCode: "MYTHIC", displayName: "Mythic", thresholdValue: 75, sortOrder: 5, isPrestige: true },
      ],
    },

    {
      key: "exalted_collector",
      categoryKey: "ownership_collection",
      name: "Exalted Collector",
      description: "Own heroes with elite/exalted classes or heavy mutation depth.",
      metricType: "COUNT",
      metricSource: "onchain_heroes",
      metricKey: "exalted_qualified",
      isActive: true,
      sortOrder: 5,
      meta: { icon: "sparkles", tags: ["heroes", "rare"] },
      tiers: [
        { tierCode: "BASIC", displayName: "Basic", thresholdValue: 1, sortOrder: 1 },
        { tierCode: "ADVANCED", displayName: "Advanced", thresholdValue: 3, sortOrder: 2 },
        { tierCode: "ELITE", displayName: "Elite", thresholdValue: 7, sortOrder: 3 },
        { tierCode: "EXALTED", displayName: "Exalted", thresholdValue: 12, sortOrder: 4, isPrestige: true },
      ],
    },

    {
      key: "item_collector",
      categoryKey: "ownership_collection",
      name: "Item Collector",
      description: "Accumulate powerful gear across rarity tiers.",
      metricType: "COUNT",
      metricSource: "onchain_items",
      metricKey: "item_weighted_score",
      isActive: true,
      sortOrder: 6,
      meta: { icon: "backpack", tags: ["items", "gear"] },
      tiers: [
        { tierCode: "COMMON", displayName: "Common", thresholdValue: 10, sortOrder: 1 },
        { tierCode: "UNCOMMON", displayName: "Uncommon", thresholdValue: 30, sortOrder: 2 },
        { tierCode: "RARE", displayName: "Rare", thresholdValue: 60, sortOrder: 3 },
        { tierCode: "LEGENDARY", displayName: "Legendary", thresholdValue: 100, sortOrder: 4 },
        { tierCode: "MYTHIC", displayName: "Mythic", thresholdValue: 150, sortOrder: 5, isPrestige: true },
      ],
    },

    //
    // CATEGORY 5: BEHAVIOR, ENGAGEMENT & SEASONAL
    //

    {
      key: "garden_architect",
      categoryKey: "economy_strategy",
      name: "Garden Architect",
      description: "Harvest yield from gardening pools over time.",
      metricType: "COUNT",
      metricSource: "onchain_gardens",
      metricKey: "gardening_harvests",
      isActive: true,
      sortOrder: 7,
      meta: { icon: "shovel", tags: ["gardening", "yield"] },
      tiers: [
        { tierCode: "COMMON", displayName: "Common", thresholdValue: 10, sortOrder: 1 },
        { tierCode: "UNCOMMON", displayName: "Uncommon", thresholdValue: 50, sortOrder: 2 },
        { tierCode: "RARE", displayName: "Rare", thresholdValue: 200, sortOrder: 3 },
        { tierCode: "LEGENDARY", displayName: "Legendary", thresholdValue: 500, sortOrder: 4 },
        { tierCode: "MYTHIC", displayName: "Mythic", thresholdValue: 1000, sortOrder: 5, isPrestige: true },
      ],
    },

    {
      key: "loyal_follower",
      categoryKey: "behavior_engagement",
      name: "Loyal Follower",
      description: "Return to the Kingdom consistently and stay active.",
      metricType: "STREAK",
      metricSource: "cluster_activity",
      metricKey: "login_streak",
      isActive: true,
      sortOrder: 8,
      meta: { icon: "heart", tags: ["engagement", "loyalty"] },
      tiers: [
        { tierCode: "COMMON", displayName: "Common", thresholdValue: 3, sortOrder: 1 },
        { tierCode: "UNCOMMON", displayName: "Uncommon", thresholdValue: 7, sortOrder: 2 },
        { tierCode: "RARE", displayName: "Rare", thresholdValue: 14, sortOrder: 3 },
        { tierCode: "LEGENDARY", displayName: "Legendary", thresholdValue: 30, sortOrder: 4 },
        { tierCode: "MYTHIC", displayName: "Mythic", thresholdValue: 60, sortOrder: 5, isPrestige: true },
      ],
    },

    {
      key: "winters_solstice",
      categoryKey: "seasonal_events",
      name: "Winter's Solstice",
      description: "Complete seasonal event objectives during Winter.",
      metricType: "COUNT",
      metricSource: "seasonal_events",
      metricKey: "winter_objectives",
      isActive: true,
      sortOrder: 9,
      meta: { icon: "snowflake", tags: ["seasonal"] },
      tiers: [
        { tierCode: "COMMON", displayName: "Common", thresholdValue: 3, sortOrder: 1 },
        { tierCode: "UNCOMMON", displayName: "Uncommon", thresholdValue: 6, sortOrder: 2 },
        { tierCode: "RARE", displayName: "Rare", thresholdValue: 10, sortOrder: 3 },
        { tierCode: "LEGENDARY", displayName: "Legendary", thresholdValue: 15, sortOrder: 4 },
        { tierCode: "MYTHIC", displayName: "Mythic", thresholdValue: 20, sortOrder: 5, isPrestige: true },
      ],
    },

    // === PART 2 END ===
