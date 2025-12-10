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

    // Master categories aligned with the Master Challenge System document
    export const HEDGE_CHALLENGE_CONFIG: HedgeChallengeConfig = {
      categories: [
        // 1 – Hero Progression (levels, generic PvE)
        {
          key: "hero_progression",
          name: "Hero Progression",
          description: "Level up, quest, hunt, and grow your roster.",
          tierSystem: "RARITY",
          sortOrder: 1,
        },

        // 2 – Economy & Strategy (gold, LP, staking, reinvestment)
        {
          key: "economy_strategy",
          name: "Economy & Strategy",
          description: "Optimize gold, DeFi yields, and reinvestment behavior.",
          tierSystem: "GENE",
          sortOrder: 2,
        },

        // 3 – Profession Specialization
        {
          key: "profession_specialization",
          name: "Profession Specialization",
          description: "Master mining, gardening, fishing, and foraging.",
          tierSystem: "MIXED",
          sortOrder: 3,
        },

        // 4 – Ownership & Collection (heroes, pets, items)
        {
          key: "ownership_collection",
          name: "Ownership & Collection",
          description: "Grow your army of heroes, pets, gear, and Gen0s.",
          tierSystem: "RARITY",
          sortOrder: 4,
        },

        // 5 – Behavior & Engagement
        {
          key: "behavior_engagement",
          name: "Behavior & Engagement",
          description: "Show your commitment to the Kingdom and to Hedge.",
          tierSystem: "GENE",
          sortOrder: 5,
        },

        // 6 – Seasonal & Events
        {
          key: "seasonal_events",
          name: "Seasonal & Events",
          description: "Limited-time challenges that rotate with the seasons.",
          tierSystem: "MIXED",
          sortOrder: 6,
        },

        // 7 – Prestige (overall account feats)
        {
          key: "prestige_overall",
          name: "Prestige",
          description: "Ultra-rare account-wide achievements.",
          tierSystem: "PRESTIGE",
          sortOrder: 7,
        },

        // 8 – Summoning & Bloodlines (summoning prestige)
        {
          key: "summoning_prestige",
          name: "Summoning & Bloodlines",
          description: "Ultra-rare summons, mutations, and bloodlines.",
          tierSystem: "PRESTIGE",
          sortOrder: 8,
        },

        // 9 – Hunting PvE (bosses, relics, miracles)
        {
          key: "hunting_pve",
          name: "Hunting",
          description: "Boss fights, rare drops, and apex PvE encounters.",
          tierSystem: "RARITY",
          sortOrder: 9,
        },

        // 10 – PvP Competition (arena, ranks, streaks)
        {
          key: "pvp_competition",
          name: "PvP Competition",
          description: "Ranked battles, streaks, and arena mastery.",
          tierSystem: "GENE",
          sortOrder: 10,
        },

        // 11 – METIS PvE (patrols)
        {
          key: "metis_pve",
          name: "METIS Patrols",
          description: "Combat progression and elite patrol victories on METIS.",
          tierSystem: "RARITY",
          sortOrder: 11,
        },

        // 12 – METIS Economy (shells, raffles, influence)
        {
          key: "metis_economy",
          name: "METIS Economy",
          description: "Shells, raffles, jackpots, and influence predictions.",
          tierSystem: "MIXED",
          sortOrder: 12,
        },

        // 13 – METIS Tournaments
        {
          key: "metis_tournaments",
          name: "METIS Tournaments",
          description: "Structured competitive play within METIS.",
          tierSystem: "GENE",
          sortOrder: 13,
        },

        // 14 – DeFi Participation (LP + Jeweler)
        {
          key: "defi_participation",
          name: "DeFi Participation",
          description: "Liquidity provision, staking, and Jeweler loyalty.",
          tierSystem: "RARITY",
          sortOrder: 14,
        },
        // 15 – Epic Feats (Prestige)
          {
            key: "epic_feats",
            name: "Epic Feats",
            description: "Mythically rare, account-defining achievements.",
            tierSystem: "PRESTIGE",
            sortOrder: 15,
          },

          // 16 – Global Meta Profile (Aggregated Mastery)
          {
            key: "global_meta_profile",
            name: "Global Meta Profile",
            description: "Aggregated mastery signals across all categories.",
            tierSystem: "MIXED",
            sortOrder: 16,
          },
      ],

      challenges: [
        // ============================================
        // CATEGORY 1 — HERO PROGRESSION
        // ============================================
        {
          key: "hero_riser",
          categoryKey: "hero_progression",
          name: "Hero Riser",
          description: "Accumulate total hero levels across your roster.",
          metricType: "COUNT",
          metricSource: "onchain_heroes",
          metricKey: "total_levels",
          isActive: true,
          sortOrder: 1,
          meta: { icon: "sprout", tags: ["levels", "progression"] },
          tiers: [
            { tierCode: "COMMON", displayName: "Common", thresholdValue: 100, sortOrder: 1 },
            { tierCode: "UNCOMMON", displayName: "Uncommon", thresholdValue: 300, sortOrder: 2 },
            { tierCode: "RARE", displayName: "Rare", thresholdValue: 600, sortOrder: 3 },
            { tierCode: "LEGENDARY", displayName: "Legendary", thresholdValue: 1000, sortOrder: 4 },
            { tierCode: "MYTHIC", displayName: "Mythic", thresholdValue: 2000, sortOrder: 5, isPrestige: true },
          ],
        },

        {
          key: "hunters_triumph",
          categoryKey: "hero_progression",
          name: "Hunter’s Triumph",
          description: "Win Hunting encounters across the realms.",
          metricType: "COUNT",
          metricSource: "onchain_hunting",
          metricKey: "wins",
          isActive: true,
          sortOrder: 2,
          meta: { icon: "swords", tags: ["hunting", "combat"] },
          tiers: [
            { tierCode: "BASIC", displayName: "Basic", thresholdValue: 10, sortOrder: 1 },
            { tierCode: "ADVANCED", displayName: "Advanced", thresholdValue: 50, sortOrder: 2 },
            { tierCode: "ELITE", displayName: "Elite", thresholdValue: 250, sortOrder: 3 },
            { tierCode: "EXALTED", displayName: "Exalted", thresholdValue: 1000, sortOrder: 4 },
          ],
        },

        {
          key: "arena_challenger",
          categoryKey: "hero_progression",
          name: "Arena Challenger",
          description: "Participate in ranked PvP matches.",
          metricType: "COUNT",
          metricSource: "onchain_pvp",
          metricKey: "matches_played",
          isActive: true,
          sortOrder: 3,
          meta: { icon: "swords-cross", tags: ["pvp", "competition"] },
          tiers: [
            { tierCode: "BASIC", displayName: "Basic", thresholdValue: 5, sortOrder: 1 },
            { tierCode: "ADVANCED", displayName: "Advanced", thresholdValue: 25, sortOrder: 2 },
            { tierCode: "ELITE", displayName: "Elite", thresholdValue: 100, sortOrder: 3 },
            { tierCode: "EXALTED", displayName: "Exalted", thresholdValue: 250, sortOrder: 4 },
          ],
        },

        // ============================================
        // CATEGORY 2 — ECONOMY & STRATEGY
        // ============================================
        {
          key: "vendor_tycoon",
          categoryKey: "economy_strategy",
          name: "Vendor Tycoon",
          description: "Spend gold at NPC vendors across the realms.",
          metricType: "COUNT",
          metricSource: "onchain_gold",
          metricKey: "vendor_spend",
          isActive: true,
          sortOrder: 1,
          meta: { icon: "coins", tags: ["gold", "vendors"] },
          tiers: [
            { tierCode: "BASIC", displayName: "Basic", thresholdValue: 1000, sortOrder: 1 },
            { tierCode: "ADVANCED", displayName: "Advanced", thresholdValue: 5000, sortOrder: 2 },
            { tierCode: "ELITE", displayName: "Elite", thresholdValue: 25000, sortOrder: 3 },
            { tierCode: "EXALTED", displayName: "Exalted", thresholdValue: 100000, sortOrder: 4 },
          ],
        },

        {
          key: "market_maker",
          categoryKey: "economy_strategy",
          name: "Market Maker",
          description: "Provide liquidity to DFK pools across the DeFi ecosystem.",
          metricType: "COUNT",
          metricSource: "onchain_lp",
          metricKey: "active_days",
          isActive: true,
          sortOrder: 2,
          meta: { icon: "waves", tags: ["defi", "lp"] },
          tiers: [
            { tierCode: "BASIC", displayName: "Basic", thresholdValue: 7, sortOrder: 1 },
            { tierCode: "ADVANCED", displayName: "Advanced", thresholdValue: 30, sortOrder: 2 },
            { tierCode: "ELITE", displayName: "Elite", thresholdValue: 90, sortOrder: 3 },
            { tierCode: "EXALTED", displayName: "Exalted", thresholdValue: 180, sortOrder: 4 },
          ],
        },

        {
          key: "jeweler_loyalty",
          categoryKey: "economy_strategy",
          name: "Jeweler Loyalty",
          description: "Maintain continuous staking at the Jeweler.",
          metricType: "COUNT",
          metricSource: "onchain_staking",
          metricKey: "stake_duration_days",
          isActive: true,
          sortOrder: 3,
          meta: { icon: "gem", tags: ["staking", "jewel"] },
          tiers: [
            { tierCode: "BASIC", displayName: "Basic", thresholdValue: 7, sortOrder: 1 },
            { tierCode: "ADVANCED", displayName: "Advanced", thresholdValue: 30, sortOrder: 2 },
            { tierCode: "ELITE", displayName: "Elite", thresholdValue: 100, sortOrder: 3 },
            { tierCode: "EXALTED", displayName: "Exalted", thresholdValue: 365, sortOrder: 4 },
          ],
        },

       
        // ============================================
        // CATEGORY 3 — PROFESSION SPECIALIZATION
        // ============================================
        {
          key: "miner_master",
          categoryKey: "profession_specialization",
          name: "Master Miner",
          description: "Complete Mining profession quests.",
          metricType: "COUNT",
          metricSource: "onchain_quests",
          metricKey: "mining_quests",
          isActive: true,
          sortOrder: 1,
          meta: { icon: "pickaxe", tags: ["professions"] },
          tiers: [
            { tierCode: "BASIC", displayName: "Basic", thresholdValue: 50, sortOrder: 1 },
            { tierCode: "ADVANCED", displayName: "Advanced", thresholdValue: 200, sortOrder: 2 },
            { tierCode: "ELITE", displayName: "Elite", thresholdValue: 750, sortOrder: 3 },
            { tierCode: "EXALTED", displayName: "Exalted", thresholdValue: 2000, sortOrder: 4 },
          ],
        },

        {
          key: "herbalist_master",
          categoryKey: "profession_specialization",
          name: "Master Herbalist",
          description: "Complete Foraging profession quests.",
          metricType: "COUNT",
          metricSource: "onchain_quests",
          metricKey: "foraging_quests",
          isActive: true,
          sortOrder: 2,
          meta: { icon: "leaf", tags: ["professions"] },
          tiers: [
            { tierCode: "BASIC", displayName: "Basic", thresholdValue: 50, sortOrder: 1 },
            { tierCode: "ADVANCED", displayName: "Advanced", thresholdValue: 200, sortOrder: 2 },
            { tierCode: "ELITE", displayName: "Elite", thresholdValue: 750, sortOrder: 3 },
            { tierCode: "EXALTED", displayName: "Exalted", thresholdValue: 2000, sortOrder: 4 },
          ],
        },

        // ============================================
        // CATEGORY 4 — OWNERSHIP & COLLECTION
        // ============================================
        {
          key: "house_of_heroes",
          categoryKey: "ownership_collection",
          name: "House of Heroes",
          description: "Grow the total number of heroes you own.",
          metricType: "COUNT",
          metricSource: "onchain_heroes",
          metricKey: "hero_count",
          isActive: true,
          sortOrder: 1,
          meta: { icon: "castle", tags: ["collection"] },
          tiers: [
            { tierCode: "COMMON", displayName: "Common", thresholdValue: 10, sortOrder: 1 },
            {
              tierCode: "UNCOMMON",
              displayName: "Uncommon",
              thresholdValue: 25,
              sortOrder: 2,
            },
            { tierCode: "RARE", displayName: "Rare", thresholdValue: 50, sortOrder: 3 },
            {
              tierCode: "LEGENDARY",
              displayName: "Legendary",
              thresholdValue: 100,
              sortOrder: 4,
            },
            {
              tierCode: "MYTHIC",
              displayName: "Mythic",
              thresholdValue: 200,
              sortOrder: 5,
              isPrestige: true,
            },
          ],
        },

        {
          key: "pet_sanctuary",
          categoryKey: "ownership_collection",
          name: "Pet Sanctuary",
          description: "Collect pets of increasing rarity.",
          metricType: "COUNT",
          metricSource: "onchain_pets",
          metricKey: "rarity_score",
          isActive: true,
          sortOrder: 2,
          meta: { icon: "paw", tags: ["pets"] },
          tiers: [
            { tierCode: "COMMON", displayName: "Common", thresholdValue: 10, sortOrder: 1 },
            { tierCode: "UNCOMMON", displayName: "Uncommon", thresholdValue: 25, sortOrder: 2 },
            { tierCode: "RARE", displayName: "Rare", thresholdValue: 60, sortOrder: 3 },
            {
              tierCode: "LEGENDARY",
              displayName: "Legendary",
              thresholdValue: 120,
              sortOrder: 4,
            },
            {
              tierCode: "MYTHIC",
              displayName: "Mythic",
              thresholdValue: 200,
              sortOrder: 5,
              isPrestige: true,
            },
          ],
        },

        // ============================================
        // CATEGORY 5 — BEHAVIOR & ENGAGEMENT
        // ============================================
        {
          key: "kingdom_calls",
          categoryKey: "behavior_engagement",
          name: "The Kingdom Calls",
          description: "Log in and play across many days.",
          metricType: "COUNT",
          metricSource: "behavior_events",
          metricKey: "active_days",
          isActive: true,
          sortOrder: 1,
          meta: { icon: "calendar", tags: ["engagement"] },
          tiers: [
            { tierCode: "BASIC", displayName: "Basic", thresholdValue: 7, sortOrder: 1 },
            { tierCode: "ADVANCED", displayName: "Advanced", thresholdValue: 30, sortOrder: 2 },
            { tierCode: "ELITE", displayName: "Elite", thresholdValue: 90, sortOrder: 3 },
            { tierCode: "EXALTED", displayName: "Exalted", thresholdValue: 365, sortOrder: 4 },
          ],
        },

        {
          key: "loyal_follower",
          categoryKey: "behavior_engagement",
          name: "Loyal Follower",
          description: "Engage with Hedge and the Discord community.",
          metricType: "COUNT",
          metricSource: "behavior_events",
          metricKey: "discord_engagement_score",
          isActive: true,
          sortOrder: 2,
          meta: { icon: "message-circle", tags: ["engagement", "discord"] },
          tiers: [
            { tierCode: "BASIC", displayName: "Basic", thresholdValue: 10, sortOrder: 1 },
            { tierCode: "ADVANCED", displayName: "Advanced", thresholdValue: 40, sortOrder: 2 },
            { tierCode: "ELITE", displayName: "Elite", thresholdValue: 100, sortOrder: 3 },
            { tierCode: "EXALTED", displayName: "Exalted", thresholdValue: 250, sortOrder: 4 },
          ],
        },

        // ============================================
        // CATEGORY 6 — SEASONAL
        // ============================================
        {
          key: "seasonal_voyager",
          categoryKey: "seasonal_events",
          name: "Seasonal Voyager",
          description: "Participate in seasonal quests, events, or bosses.",
          metricType: "COUNT",
          metricSource: "seasonal_events",
          metricKey: "seasonal_score",
          isActive: true,
          sortOrder: 1,
          meta: { icon: "calendar-star", tags: ["seasonal"] },
          tiers: [
            { tierCode: "BASIC", displayName: "Basic", thresholdValue: 10, sortOrder: 1 },
            { tierCode: "ADVANCED", displayName: "Advanced", thresholdValue: 30, sortOrder: 2 },
            { tierCode: "ELITE", displayName: "Elite", thresholdValue: 60, sortOrder: 3 },
            { tierCode: "EXALTED", displayName: "Exalted", thresholdValue: 100, sortOrder: 4 },
          ],
        },

        // ============================================
        // CATEGORY 7 — PRESTIGE (OVERALL)
        // ============================================
        {
          key: "long_road_home",
          categoryKey: "prestige_overall",
          name: "Long Road Home",
          description: "Remain active in DeFi Kingdoms for many days.",
          metricType: "COUNT",
          metricSource: "behavior_events",
          metricKey: "account_age_days",
          isActive: true,
          sortOrder: 1,
          meta: { icon: "clock", tags: ["prestige", "age"] },
          tiers: [
            {
              tierCode: "MYTHIC",
              displayName: "Mythic",
              thresholdValue: 365,
              sortOrder: 1,
              isPrestige: true,
              meta: { description: "One full year in the Kingdom." },
            },
          ],
        },

        // ============================================
        // CATEGORY 8 — SUMMONING PRESTIGE
        // ============================================
        {
          key: "perfect_pairing",
          categoryKey: "summoning_prestige",
          name: "Perfect Pairing",
          description: "Summon a hero with at least two upward mutations in distinct domains.",
          metricType: "BOOLEAN",
          metricSource: "onchain_summoning",
          metricKey: "perfect_pairing_unlocked",
          isActive: true,
          sortOrder: 1,
          meta: { icon: "dna", tags: ["summoning", "mutations", "prestige"] },
          tiers: [
            {
              tierCode: "MYTHIC",
              displayName: "Unlocked",
              thresholdValue: 1,
              sortOrder: 1,
              isPrestige: true,
            },
          ],
        },

        {
          key: "mutagenic_specialist",
          categoryKey: "summoning_prestige",
          name: "Mutagenic Specialist",
          description: "Summon heroes with three or more upward mutations.",
          metricType: "COUNT",
          metricSource: "onchain_summoning",
          metricKey: "mutagenic_specialist_count",
          isActive: true,
          sortOrder: 2,
          meta: { icon: "flask", tags: ["summoning", "mutations"] },
          tiers: [
            { tierCode: "BASIC", displayName: "Basic", thresholdValue: 1, sortOrder: 1 },
            { tierCode: "ADVANCED", displayName: "Advanced", thresholdValue: 3, sortOrder: 2 },
            { tierCode: "ELITE", displayName: "Elite", thresholdValue: 10, sortOrder: 3 },
            {
              tierCode: "EXALTED",
              displayName: "Exalted",
              thresholdValue: 25,
              sortOrder: 4,
              isPrestige: true,
            },
          ],
        },

        {
          key: "mythmaker",
          categoryKey: "summoning_prestige",
          name: "Mythmaker",
          description: "Summon Mythic-rarity heroes.",
          metricType: "COUNT",
          metricSource: "onchain_summoning",
          metricKey: "mythmaker_count",
          isActive: true,
          sortOrder: 3,
          meta: { icon: "star", tags: ["summoning", "rarity"] },
          tiers: [
            { tierCode: "BASIC", displayName: "Basic", thresholdValue: 1, sortOrder: 1 },
            { tierCode: "ADVANCED", displayName: "Advanced", thresholdValue: 3, sortOrder: 2 },
            { tierCode: "ELITE", displayName: "Elite", thresholdValue: 10, sortOrder: 3 },
            {
              tierCode: "EXALTED",
              displayName: "Exalted",
              thresholdValue: 25,
              sortOrder: 4,
              isPrestige: true,
            },
          ],
        },

        {
          key: "royal_lineage",
          categoryKey: "summoning_prestige",
          name: "Royal Lineage",
          description: "Produce offspring from heavily mutated parents that inherit upward mutations.",
          metricType: "COUNT",
          metricSource: "onchain_summoning",
          metricKey: "royal_lineage_count",
          isActive: true,
          sortOrder: 4,
          meta: { icon: "crown", tags: ["summoning", "lineage"] },
          tiers: [
            { tierCode: "BASIC", displayName: "Basic", thresholdValue: 1, sortOrder: 1 },
            { tierCode: "ADVANCED", displayName: "Advanced", thresholdValue: 3, sortOrder: 2 },
            { tierCode: "ELITE", displayName: "Elite", thresholdValue: 10, sortOrder: 3 },
            {
              tierCode: "EXALTED",
              displayName: "Exalted",
              thresholdValue: 25,
              sortOrder: 4,
              isPrestige: true,
            },
          ],
        },

        {
          key: "summoner_of_legends",
          categoryKey: "summoning_prestige",
          name: "Summoner of Legends",
          description: "Summon Dragoon, Sage, Spellbow, and Dreadknight.",
          metricType: "COMPOSITE",
          metricSource: "onchain_summoning",
          metricKey: "legendary_class_flags",
          isActive: true,
          sortOrder: 5,
          meta: { icon: "laurel", tags: ["elite_classes", "prestige"] },
          tiers: [
            {
              tierCode: "MYTHIC",
              displayName: "Unlocked",
              thresholdValue: 1,
              sortOrder: 1,
              isPrestige: true,
            },
          ],
        },


// ============================================
// CATEGORY 9 — HUNTING PvE
// ============================================

{
  key: "motherclucker_slayer",
  categoryKey: "hunting_pve",
  name: "Motherclucker Slayer",
  description: "Defeat the Motherclucker boss in Hunting.",
  metricType: "COUNT",
  metricSource: "onchain_hunting",
  metricKey: "motherclucker_kills",
  isActive: true,
  sortOrder: 1,
  meta: { icon: "chicken", tags: ["hunting", "boss"] },
  tiers: [
    { tierCode: "BASIC", displayName: "Basic", thresholdValue: 1, sortOrder: 1 },
    { tierCode: "ADVANCED", displayName: "Advanced", thresholdValue: 5, sortOrder: 2 },
    { tierCode: "ELITE", displayName: "Elite", thresholdValue: 25, sortOrder: 3 },
    {
      tierCode: "EXALTED",
      displayName: "Exalted",
      thresholdValue: 100,
      sortOrder: 4,
      isPrestige: true,
    },
  ],
},

{
  key: "mad_boar_slayer",
  categoryKey: "hunting_pve",
  name: "Mad Boar Slayer",
  description: "Defeat the Mad Boar boss in Hunting.",
  metricType: "COUNT",
  metricSource: "onchain_hunting",
  metricKey: "mad_boar_kills",
  isActive: true,
  sortOrder: 2,
  meta: { icon: "boar", tags: ["hunting", "boss"] },
  tiers: [
    { tierCode: "BASIC", displayName: "Basic", thresholdValue: 1, sortOrder: 1 },
    { tierCode: "ADVANCED", displayName: "Advanced", thresholdValue: 5, sortOrder: 2 },
    { tierCode: "ELITE", displayName: "Elite", thresholdValue: 25, sortOrder: 3 },
    {
      tierCode: "EXALTED",
      displayName: "Exalted",
      thresholdValue: 100,
      sortOrder: 4,
      isPrestige: true,
    },
  ],
},

{
  key: "relic_tracker",
  categoryKey: "hunting_pve",
  name: "Relic Tracker",
  description: "Collect ultra-rare relics discovered in Hunting encounters.",
  metricType: "COUNT",
  metricSource: "onchain_hunting",
  metricKey: "relics_found",
  isActive: true,
  sortOrder: 3,
  meta: { icon: "sparkle", tags: ["relics", "rare_drops"] },
  tiers: [
    { tierCode: "BASIC", displayName: "Basic", thresholdValue: 1, sortOrder: 1 },
    { tierCode: "ADVANCED", displayName: "Advanced", thresholdValue: 3, sortOrder: 2 },
    { tierCode: "ELITE", displayName: "Elite", thresholdValue: 10, sortOrder: 3 },
    {
      tierCode: "EXALTED",
      displayName: "Exalted",
      thresholdValue: 25,
      sortOrder: 4,
      isPrestige: true,
    },
  ],
},

{
  key: "clucker_miracle",
  categoryKey: "hunting_pve",
  name: "Clucker Miracle",
  description: "Defeat Motherclucker with exactly one surviving hero at 1 HP.",
  metricType: "BOOLEAN",
  metricSource: "onchain_hunting",
  metricKey: "clucker_miracle",
  isActive: true,
  sortOrder: 4,
  meta: { icon: "heart-crack", tags: ["prestige", "hunting"] },
  tiers: [
    {
      tierCode: "MYTHIC",
      displayName: "Unlocked",
      thresholdValue: 1,
      sortOrder: 1,
      isPrestige: true,
    },
  ],
},

// ============================================
// CATEGORY 10 — PvP COMPETITION
// ============================================

{
  key: "arena_victor",
  categoryKey: "pvp_competition",
  name: "Arena Victor",
  description: "Win ranked PvP matches.",
  metricType: "COUNT",
  metricSource: "onchain_pvp",
  metricKey: "wins",
  isActive: true,
  sortOrder: 1,
  meta: { icon: "crossed-swords", tags: ["pvp", "combat"] },
  tiers: [
    { tierCode: "BASIC", displayName: "Basic", thresholdValue: 3, sortOrder: 1 },
    { tierCode: "ADVANCED", displayName: "Advanced", thresholdValue: 15, sortOrder: 2 },
    { tierCode: "ELITE", displayName: "Elite", thresholdValue: 50, sortOrder: 3 },
    {
      tierCode: "EXALTED",
      displayName: "Exalted",
      thresholdValue: 150,
      sortOrder: 4,
      isPrestige: true,
    },
  ],
},

{
  key: "win_streak",
  categoryKey: "pvp_competition",
  name: "Win Streak",
  description: "Achieve a consecutive streak of PvP victories.",
  metricType: "STREAK",
  metricSource: "onchain_pvp",
  metricKey: "best_win_streak",
  isActive: true,
  sortOrder: 2,
  meta: { icon: "flame", tags: ["pvp", "streak"] },
  tiers: [
    { tierCode: "BASIC", displayName: "Basic", thresholdValue: 2, sortOrder: 1 },
    { tierCode: "ADVANCED", displayName: "Advanced", thresholdValue: 5, sortOrder: 2 },
    { tierCode: "ELITE", displayName: "Elite", thresholdValue: 10, sortOrder: 3 },
    {
      tierCode: "EXALTED",
      displayName: "Exalted",
      thresholdValue: 20,
      sortOrder: 4,
      isPrestige: true,
    },
  ],
},

{
  key: "flawless_victory",
  categoryKey: "pvp_competition",
  name: "Flawless Victory",
  description: "Win a ranked PvP match with zero hero deaths.",
  metricType: "BOOLEAN",
  metricSource: "onchain_pvp",
  metricKey: "flawless_victory",
  isActive: true,
  sortOrder: 3,
  meta: { icon: "shield-check", tags: ["pvp", "prestige"] },
  tiers: [
    {
      tierCode: "MYTHIC",
      displayName: "Unlocked",
      thresholdValue: 1,
      sortOrder: 1,
      isPrestige: true,
    },
  ],
},

// ============================================
// CATEGORY 11 — METIS PVE (PATROLS)
// ============================================

{
  key: "patrol_warden",
  categoryKey: "metis_pve",
  name: "Patrol Warden",
  description: "Win METIS patrol encounters across any difficulty.",
  metricType: "COUNT",
  metricSource: "onchain_metis_patrol",
  metricKey: "wins",
  isActive: true,
  sortOrder: 1,
  meta: { icon: "shield-halved", tags: ["metis", "pve"] },
  tiers: [
    { tierCode: "BASIC", displayName: "Basic", thresholdValue: 5, sortOrder: 1 },
    { tierCode: "ADVANCED", displayName: "Advanced", thresholdValue: 25, sortOrder: 2 },
    { tierCode: "ELITE", displayName: "Elite", thresholdValue: 100, sortOrder: 3 },
    {
      tierCode: "EXALTED",
      displayName: "Exalted",
      thresholdValue: 300,
      sortOrder: 4,
      isPrestige: true,
    },
  ],
},

{
  key: "elite_patroller",
  categoryKey: "metis_pve",
  name: "Elite Patroller",
  description: "Win elite-tier METIS patrol encounters.",
  metricType: "COUNT",
  metricSource: "onchain_metis_patrol",
  metricKey: "elite_wins",
  isActive: true,
  sortOrder: 2,
  meta: { icon: "skull", tags: ["metis", "pve", "elite"] },
  tiers: [
    { tierCode: "BASIC", displayName: "Basic", thresholdValue: 1, sortOrder: 1 },
    { tierCode: "ADVANCED", displayName: "Advanced", thresholdValue: 5, sortOrder: 2 },
    { tierCode: "ELITE", displayName: "Elite", thresholdValue: 20, sortOrder: 3 },
    {
      tierCode: "EXALTED",
      displayName: "Exalted",
      thresholdValue: 50,
      sortOrder: 4,
      isPrestige: true,
    },
  ],
},

// ============================================
// CATEGORY 12 — METIS ECONOMY
// ============================================

{
  key: "shell_collector",
  categoryKey: "metis_economy",
  name: "Shell Collector",
  description: "Accumulate METIS shells from patrols and events.",
  metricType: "COUNT",
  metricSource: "onchain_shells",
  metricKey: "shells_collected",
  isActive: true,
  sortOrder: 1,
  meta: { icon: "shell", tags: ["metis", "economy"] },
  tiers: [
    { tierCode: "BASIC", displayName: "Basic", thresholdValue: 10, sortOrder: 1 },
    { tierCode: "ADVANCED", displayName: "Advanced", thresholdValue: 50, sortOrder: 2 },
    { tierCode: "ELITE", displayName: "Elite", thresholdValue: 200, sortOrder: 3 },
    {
      tierCode: "EXALTED",
      displayName: "Exalted",
      thresholdValue: 1000,
      sortOrder: 4,
      isPrestige: true,
    },
  ],
},

{
  key: "shell_gambler",
  categoryKey: "metis_economy",
  name: "Shell Gambler",
  description: "Enter METIS shell raffles.",
  metricType: "COUNT",
  metricSource: "onchain_shells",
  metricKey: "raffle_entries",
  isActive: true,
  sortOrder: 2,
  meta: { icon: "ticket", tags: ["metis", "raffles"] },
  tiers: [
    { tierCode: "BASIC", displayName: "Basic", thresholdValue: 5, sortOrder: 1 },
    { tierCode: "ADVANCED", displayName: "Advanced", thresholdValue: 25, sortOrder: 2 },
    { tierCode: "ELITE", displayName: "Elite", thresholdValue: 100, sortOrder: 3 },
    {
      tierCode: "EXALTED",
      displayName: "Exalted",
      thresholdValue: 250,
      sortOrder: 4,
      isPrestige: true,
    },
  ],
},

{
  key: "shell_jackpot",
  categoryKey: "metis_economy",
  name: "Shell Jackpot",
  description: "Win a METIS shell raffle.",
  metricType: "BOOLEAN",
  metricSource: "onchain_shells",
  metricKey: "raffle_win",
  isActive: true,
  sortOrder: 3,
  meta: { icon: "sparkles", tags: ["metis", "jackpot"] },
  tiers: [
    {
      tierCode: "MYTHIC",
      displayName: "Unlocked",
      thresholdValue: 1,
      sortOrder: 1,
      isPrestige: true,
    },
  ],
},

{
  key: "influence_strategist",
  categoryKey: "metis_economy",
  name: "Influence Strategist",
  description: "Win METIS Influence predictions.",
  metricType: "COUNT",
  metricSource: "onchain_influence",
  metricKey: "bets_won",
  isActive: true,
  sortOrder: 4,
  meta: { icon: "lightbulb", tags: ["influence", "strategy"] },
  tiers: [
    { tierCode: "BASIC", displayName: "Basic", thresholdValue: 1, sortOrder: 1 },
    { tierCode: "ADVANCED", displayName: "Advanced", thresholdValue: 5, sortOrder: 2 },
    { tierCode: "ELITE", displayName: "Elite", thresholdValue: 20, sortOrder: 3 },
    {
      tierCode: "EXALTED",
      displayName: "Exalted",
      thresholdValue: 50,
      sortOrder: 4,
      isPrestige: true,
    },
  ],
},

// ============================================
// CATEGORY 13 — METIS TOURNAMENTS
// ============================================

{
  key: "tournament_challenger",
  categoryKey: "metis_tournaments",
  name: "Tournament Challenger",
  description: "Enter official METIS tournaments.",
  metricType: "COUNT",
  metricSource: "onchain_tournaments",
  metricKey: "entries",
  isActive: true,
  sortOrder: 1,
  meta: { icon: "trophy", tags: ["tournaments", "metis"] },
  tiers: [
    { tierCode: "BASIC", displayName: "Basic", thresholdValue: 1, sortOrder: 1 },
    { tierCode: "ADVANCED", displayName: "Advanced", thresholdValue: 3, sortOrder: 2 },
    { tierCode: "ELITE", displayName: "Elite", thresholdValue: 10, sortOrder: 3 },
    {
      tierCode: "EXALTED",
      displayName: "Exalted",
      thresholdValue: 20,
      sortOrder: 4,
      isPrestige: true,
    },
  ],
},

{
  key: "tournament_victor",
  categoryKey: "metis_tournaments",
  name: "Tournament Victor",
  description: "Win tournament matches on METIS.",
  metricType: "COUNT",
  metricSource: "onchain_tournaments",
  metricKey: "wins",
  isActive: true,
  sortOrder: 2,
  meta: { icon: "sword-shield", tags: ["tournaments", "metis"] },
  tiers: [
    { tierCode: "BASIC", displayName: "Basic", thresholdValue: 1, sortOrder: 1 },
    { tierCode: "ADVANCED", displayName: "Advanced", thresholdValue: 3, sortOrder: 2 },
    { tierCode: "ELITE", displayName: "Elite", thresholdValue: 10, sortOrder: 3 },
    {
      tierCode: "EXALTED",
      displayName: "Exalted",
      thresholdValue: 25,
      sortOrder: 4,
      isPrestige: true,
    },
  ],
},

{
  key: "metis_champion",
  categoryKey: "metis_tournaments",
  name: "METIS Champion",
  description: "Finish in the top bracket of any official METIS tournament.",
  metricType: "BOOLEAN",
  metricSource: "onchain_tournaments",
  metricKey: "top_finish",
  isActive: true,
  sortOrder: 3,
  meta: { icon: "crown", tags: ["prestige", "tournaments"] },
  tiers: [
    {
      tierCode: "MYTHIC",
      displayName: "Champion",
      thresholdValue: 1,
      sortOrder: 1,
      isPrestige: true,
    },
  ],
},

// ============================================
// CATEGORY 14 — DEFI PARTICIPATION
// ============================================

{
  key: "lp_depth",
  categoryKey: "defi_participation",
  name: "Liquidity Depth",
  description: "Provide significant USD value to LP pools.",
  metricType: "COUNT",
  metricSource: "onchain_lp",
  metricKey: "lp_usd_value",
  isActive: true,
  sortOrder: 1,
  meta: { icon: "waves", tags: ["lp", "defi"] },
  tiers: [
    { tierCode: "BASIC", displayName: "Basic", thresholdValue: 1000, sortOrder: 1 },
    { tierCode: "ADVANCED", displayName: "Advanced", thresholdValue: 5000, sortOrder: 2 },
    { tierCode: "ELITE", displayName: "Elite", thresholdValue: 25000, sortOrder: 3 },
    {
      tierCode: "EXALTED",
      displayName: "Exalted",
      thresholdValue: 100000,
      sortOrder: 4,
      isPrestige: true,
    },
  ],
},

{
  key: "lp_diversified",
  categoryKey: "defi_participation",
  name: "Diversified Provider",
  description: "Provide liquidity across multiple LP pools.",
  metricType: "COUNT",
  metricSource: "onchain_lp",
  metricKey: "pool_count",
  isActive: true,
  sortOrder: 2,
  meta: { icon: "layers", tags: ["lp", "defi"] },
  tiers: [
    { tierCode: "BASIC", displayName: "Basic", thresholdValue: 2, sortOrder: 1 },
    { tierCode: "ADVANCED", displayName: "Advanced", thresholdValue: 4, sortOrder: 2 },
    { tierCode: "ELITE", displayName: "Elite", thresholdValue: 6, sortOrder: 3 },
    {
      tierCode: "EXALTED",
      displayName: "Exalted",
      thresholdValue: 10,
      sortOrder: 4,
      isPrestige: true,
    },
  ],
},

{
  key: "yield_harvester",
  categoryKey: "defi_participation",
  name: "Yield Harvester",
  description: "Harvest LP rewards consistently over time.",
  metricType: "COUNT",
  metricSource: "onchain_lp",
  metricKey: "harvest_actions",
  isActive: true,
  sortOrder: 3,
  meta: { icon: "harvest", tags: ["lp", "rewards"] },
  tiers: [
    { tierCode: "BASIC", displayName: "Basic", thresholdValue: 5, sortOrder: 1 },
    { tierCode: "ADVANCED", displayName: "Advanced", thresholdValue: 20, sortOrder: 2 },
    { tierCode: "ELITE", displayName: "Elite", thresholdValue: 75, sortOrder: 3 },
    {
      tierCode: "EXALTED",
      displayName: "Exalted",
      thresholdValue: 200,
      sortOrder: 4,
      isPrestige: true,
    },
  ],
},

{
  key: "diamond_hand_lp",
  categoryKey: "defi_participation",
  name: "Diamond-Hand LP",
  description: "Maintain a position in an LP pool for an extended duration.",
  metricType: "COUNT",
  metricSource: "onchain_lp",
  metricKey: "lp_duration_max_days",
  isActive: true,
  sortOrder: 4,
  meta: { icon: "hourglass", tags: ["lp", "loyalty"] },
  tiers: [
    { tierCode: "BASIC", displayName: "Basic", thresholdValue: 7, sortOrder: 1 },
    { tierCode: "ADVANCED", displayName: "Advanced", thresholdValue: 30, sortOrder: 2 },
    { tierCode: "ELITE", displayName: "Elite", thresholdValue: 90, sortOrder: 3 },
    {
      tierCode: "EXALTED",
      displayName: "Exalted",
      thresholdValue: 180,
      sortOrder: 4,
      isPrestige: true,
    },
  ],
},

{
  key: "jeweler_stakeholder",
  categoryKey: "defi_participation",
  name: "Jeweler Stakeholder",
  description: "Stake tokens at the Jeweler to support the Kingdom economy.",
  metricType: "COUNT",
  metricSource: "onchain_staking",
  metricKey: "stake_usd_value",
  isActive: true,
  sortOrder: 5,
  meta: { icon: "gem", tags: ["staking"] },
  tiers: [
    { tierCode: "BASIC", displayName: "Basic", thresholdValue: 1000, sortOrder: 1 },
    { tierCode: "ADVANCED", displayName: "Advanced", thresholdValue: 5000, sortOrder: 2 },
    { tierCode: "ELITE", displayName: "Elite", thresholdValue: 25000, sortOrder: 3 },
    {
      tierCode: "EXALTED",
      displayName: "Exalted",
      thresholdValue: 100000,
      sortOrder: 4,
      isPrestige: true,
    },
  ],
},

{
  key: "jeweler_whale",
  categoryKey: "defi_participation",
  name: "Jeweler Whale",
  description: "Maintain a high-value JEWEL stake at the Jeweler.",
  metricType: "BOOLEAN",
  metricSource: "onchain_staking",
  metricKey: "jewel_stake_amount",
  isActive: true,
  sortOrder: 6,
  meta: { icon: "diamond", tags: ["jewel", "prestige"] },
  tiers: [
    {
      tierCode: "MYTHIC",
      displayName: "JEWEL Whale",
      thresholdValue: 10000, // raw JEWEL amount
      sortOrder: 1,
      isPrestige: true,
    },
  ],
},
        // ============================================
        // CATEGORY 15 — EPIC FEATS (PRESTIGE)
        // ============================================
        {
          key: "vangardian",
          categoryKey: "epic_feats",
          name: "Vangardian",
          description: "Achieve mastery across METIS patrols, economy, influence, and tournaments.",
          metricType: "BOOLEAN",
          metricSource: "epic_feats",
          metricKey: "vangardian_unlocked",
          isActive: true,
          sortOrder: 1,
          meta: { icon: "star-shooting", tags: ["metis", "prestige", "epic"] },
          tiers: [
            {
              tierCode: "MYTHIC",
              displayName: "Unlocked",
              thresholdValue: 1,
              isPrestige: true,
              sortOrder: 1
            }
          ],
        },
        {
          key: "worldforged_summoner",
          categoryKey: "epic_feats",
          name: "Worldforged Summoner",
          description: "Summon a Dreadknight with four or more upward mutations.",
          metricType: "BOOLEAN",
          metricSource: "epic_feats",
          metricKey: "worldforged_summoner_unlocked",
          isActive: true,
          sortOrder: 2,
          meta: { icon: "sword", tags: ["summoning", "prestige", "epic"] },
          tiers: [
            {
              tierCode: "MYTHIC",
              displayName: "Unlocked",
              thresholdValue: 1,
              isPrestige: true,
              sortOrder: 1
            }
          ],
        },
        {
          key: "grandmaster_geneweaver",
          categoryKey: "epic_feats",
          name: "Grandmaster Geneweaver",
          description: "Create a 3-generation genetic lineage with escalating mutation depth.",
          metricType: "BOOLEAN",
          metricSource: "epic_feats",
          metricKey: "grandmaster_geneweaver_unlocked",
          isActive: true,
          sortOrder: 3,
          meta: { icon: "dna", tags: ["lineage", "prestige", "epic"] },
          tiers: [
            {
              tierCode: "MYTHIC",
              displayName: "Unlocked",
              thresholdValue: 1,
              isPrestige: true,
              sortOrder: 1
            }
          ],
        },
        {
          key: "eternal_collector",
          categoryKey: "epic_feats",
          name: "Eternal Collector",
          description: "Own Mythic heroes of every class.",
          metricType: "BOOLEAN",
          metricSource: "epic_feats",
          metricKey: "eternal_collector_unlocked",
          isActive: true,
          sortOrder: 4,
          meta: { icon: "grid", tags: ["collection", "prestige", "epic"] },
          tiers: [
            {
              tierCode: "MYTHIC",
              displayName: "Unlocked",
              thresholdValue: 1,
              isPrestige: true,
              sortOrder: 1
            }
          ],
        },
        {
          key: "crowned_jeweler",
          categoryKey: "epic_feats",
          name: "Crowned Jeweler",
          description: "Maintain a continuous JEWEL lock for 1000 days.",
          metricType: "BOOLEAN",
          metricSource: "epic_feats",
          metricKey: "crowned_jeweler_unlocked",
          isActive: true,
          sortOrder: 5,
          meta: { icon: "gem", tags: ["jewel", "prestige", "epic"] },
          tiers: [
            {
              tierCode: "MYTHIC",
              displayName: "Unlocked",
              thresholdValue: 1,
              isPrestige: true,
              sortOrder: 1
            }
          ],
        },
        {
          key: "mythic_menagerie",
          categoryKey: "epic_feats",
          name: "Mythic Menagerie",
          description: "Own an Odd or Ultra Odd variant from every pet family.",
          metricType: "BOOLEAN",
          metricSource: "epic_feats",
          metricKey: "mythic_menagerie_unlocked",
          isActive: true,
          sortOrder: 6,
          meta: { icon: "paw", tags: ["pets", "prestige", "epic"] },
          tiers: [
            {
              tierCode: "MYTHIC",
              displayName: "Unlocked",
              thresholdValue: 1,
              isPrestige: true,
              sortOrder: 1
            }
          ],
        },

        // ============================================
        // CATEGORY 16 — GLOBAL META PROFILE (AGGREGATED MASTERY)
        // ============================================
        {
          key: "prestige_collector",
          categoryKey: "global_meta_profile",
          name: "Prestige Collector",
          description: "Unlock and accumulate prestige achievements across the account.",
          metricType: "COUNT",
          metricSource: "meta_profile",
          metricKey: "prestige_unlocked_count",
          isActive: true,
          sortOrder: 1,
          meta: { icon: "trophy", tags: ["meta", "prestige", "profile"] },
          tiers: [
            { tierCode: "BASIC", displayName: "Basic", thresholdValue: 1, sortOrder: 1 },
            { tierCode: "ADVANCED", displayName: "Advanced", thresholdValue: 3, sortOrder: 2 },
            { tierCode: "ELITE", displayName: "Elite", thresholdValue: 7, sortOrder: 3 },
            { tierCode: "EXALTED", displayName: "Exalted", thresholdValue: 12, sortOrder: 4, isPrestige: true }
          ],
        },
        {
          key: "category_master",
          categoryKey: "global_meta_profile",
          name: "Category Master",
          description: "Achieve Exalted tier in multiple categories.",
          metricType: "COUNT",
          metricSource: "meta_profile",
          metricKey: "exalted_category_count",
          isActive: true,
          sortOrder: 2,
          meta: { icon: "layers", tags: ["meta", "exalted", "profile"] },
          tiers: [
            { tierCode: "BASIC", displayName: "Basic", thresholdValue: 1, sortOrder: 1 },
            { tierCode: "ADVANCED", displayName: "Advanced", thresholdValue: 3, sortOrder: 2 },
            { tierCode: "ELITE", displayName: "Elite", thresholdValue: 6, sortOrder: 3 },
            { tierCode: "EXALTED", displayName: "Exalted", thresholdValue: 10, sortOrder: 4, isPrestige: true }
          ],
        },
        {
          key: "summoning_prestige_score",
          categoryKey: "global_meta_profile",
          name: "Summoning Prestige Score",
          description: "Composite score from Mythmaker, Mutagenic Specialist, Royal Lineage, and Summoner of Legends.",
          metricType: "SCORE",
          metricSource: "meta_profile",
          metricKey: "summoning_prestige_score",
          isActive: true,
          sortOrder: 3,
          meta: { icon: "dna", tags: ["summoning", "meta", "score"] },
          tiers: [
            { tierCode: "BASIC", displayName: "Basic", thresholdValue: 25, sortOrder: 1 },
            { tierCode: "ADVANCED", displayName: "Advanced", thresholdValue: 75, sortOrder: 2 },
            { tierCode: "ELITE", displayName: "Elite", thresholdValue: 200, sortOrder: 3 },
            { tierCode: "EXALTED", displayName: "Exalted", thresholdValue: 400, sortOrder: 4, isPrestige: true }
          ],
        },
        {
          key: "pvp_mastery_score",
          categoryKey: "global_meta_profile",
          name: "PvP Mastery Score",
          description: "Composite score from Arena Victor, Win Streak, Flawless Victory, and PvP Champion.",
          metricType: "SCORE",
          metricSource: "meta_profile",
          metricKey: "pvp_mastery_score",
          isActive: true,
          sortOrder: 4,
          meta: { icon: "crossed-swords", tags: ["pvp", "meta", "score"] },
          tiers: [
            { tierCode: "BASIC", displayName: "Basic", thresholdValue: 25, sortOrder: 1 },
            { tierCode: "ADVANCED", displayName: "Advanced", thresholdValue: 80, sortOrder: 2 },
            { tierCode: "ELITE", displayName: "Elite", thresholdValue: 200, sortOrder: 3 },
            { tierCode: "EXALTED", displayName: "Exalted", thresholdValue: 400, sortOrder: 4, isPrestige: true }
          ],
        },
        {
          key: "metis_mastery_score",
          categoryKey: "global_meta_profile",
          name: "METIS Mastery Score",
          description: "Composite score from Elite Patroller, Shell Collector, Influence Oracle, Shell Jackpot, and METIS Champion.",
          metricType: "SCORE",
          metricSource: "meta_profile",
          metricKey: "metis_mastery_score",
          isActive: true,
          sortOrder: 5,
          meta: { icon: "hexagon", tags: ["metis", "meta", "score"] },
          tiers: [
            { tierCode: "BASIC", displayName: "Basic", thresholdValue: 25, sortOrder: 1 },
            { tierCode: "ADVANCED", displayName: "Advanced", thresholdValue: 80, sortOrder: 2 },
            { tierCode: "ELITE", displayName: "Elite", thresholdValue: 200, sortOrder: 3 },
            { tierCode: "EXALTED", displayName: "Exalted", thresholdValue: 400, sortOrder: 4, isPrestige: true }
          ],
        },

], // end challenges
};
