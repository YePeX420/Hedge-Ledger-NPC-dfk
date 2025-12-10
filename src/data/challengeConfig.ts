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
