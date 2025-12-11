import { db } from '../../../server/db.js';
import { leaderboardDefs } from '../../../shared/schema.js';
import { eq } from 'drizzle-orm';

const DEFAULT_LEADERBOARDS = [
  {
    key: 'lb_overall_progression',
    name: 'Overall Progression (All Time)',
    description: 'Top clusters by combined challenge progress across all categories.',
    categoryKey: 'overall',
    metricSource: 'challenge_progress',
    metricKey: 'total_score',
    fallbackMetricKey: null,
    timeWindow: 'ALL_TIME',
    isActive: true,
  },
  {
    key: 'lb_summoning_prestige',
    name: 'Top Summoners',
    description: 'Leaders in Mythmaker, Mutagenic Specialist, Royal Lineage, and Summoner of Legends.',
    categoryKey: 'summoning',
    metricSource: 'meta_profile',
    metricKey: 'summoning_prestige_score',
    fallbackMetricKey: null,
    timeWindow: 'ALL_TIME',
    isActive: true,
  },
  {
    key: 'lb_hunting_pve',
    name: 'Top Hunters',
    description: 'Clusters with the most boss kills and relics gathered in Hunting.',
    categoryKey: 'hunting',
    metricSource: 'onchain_hunting',
    metricKey: 'wins',
    fallbackMetricKey: 'motherclucker_kills',
    timeWindow: 'ALL_TIME',
    isActive: true,
  },
  {
    key: 'lb_pvp_competition',
    name: 'Top PvP Competitors',
    description: 'Highest-performing players across Arena Victor, Win Streak, and Flawless Victory.',
    categoryKey: 'pvp',
    metricSource: 'meta_profile',
    metricKey: 'pvp_mastery_score',
    fallbackMetricKey: null,
    timeWindow: 'ALL_TIME',
    isActive: true,
  },
  {
    key: 'lb_season_1_points',
    name: 'Season 1 – The Awakening',
    description: 'Season standings based on Season 1 point weights.',
    categoryKey: 'season',
    metricSource: 'season_progress',
    metricKey: 'season_1_awakening',
    fallbackMetricKey: null,
    timeWindow: 'SEASON',
    isActive: true,
  },
  {
    key: 'lb_hero_levels',
    name: 'Top Hero Trainers',
    description: 'Clusters with the highest total hero levels.',
    categoryKey: 'heroes',
    metricSource: 'onchain_heroes',
    metricKey: 'total_levels',
    fallbackMetricKey: null,
    timeWindow: 'ALL_TIME',
    isActive: true,
  },
  {
    key: 'lb_defi_participation',
    name: 'Top DeFi Participants',
    description: 'Clusters with the highest LP and staking value combined.',
    categoryKey: 'defi',
    metricSource: 'onchain_lp',
    metricKey: 'lp_usd_value',
    fallbackMetricKey: 'stake_usd_value',
    timeWindow: 'ALL_TIME',
    isActive: true,
  },
];

export async function seedLeaderboards() {
  console.log('[LeaderboardSeed] Starting leaderboard definitions seed...');

  try {
    let inserted = 0;
    let updated = 0;

    for (const lb of DEFAULT_LEADERBOARDS) {
      const existing = await db
        .select()
        .from(leaderboardDefs)
        .where(eq(leaderboardDefs.key, lb.key))
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(leaderboardDefs)
          .set({
            name: lb.name,
            description: lb.description,
            categoryKey: lb.categoryKey,
            metricSource: lb.metricSource,
            metricKey: lb.metricKey,
            fallbackMetricKey: lb.fallbackMetricKey,
            timeWindow: lb.timeWindow,
            isActive: lb.isActive,
            updatedAt: new Date(),
          })
          .where(eq(leaderboardDefs.key, lb.key));
        updated++;
        console.log(`[LeaderboardSeed] Updated: ${lb.key}`);
      } else {
        await db.insert(leaderboardDefs).values(lb);
        inserted++;
        console.log(`[LeaderboardSeed] Inserted: ${lb.key}`);
      }
    }

    console.log(`[LeaderboardSeed] Complete! Inserted: ${inserted}, Updated: ${updated}`);

    return {
      totalLeaderboards: DEFAULT_LEADERBOARDS.length,
      inserted,
      updated,
      leaderboardKeys: DEFAULT_LEADERBOARDS.map(lb => lb.key),
    };
  } catch (error) {
    console.error('[LeaderboardSeed] Error seeding leaderboards:', error);
    throw error;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seedLeaderboards()
    .then(result => {
      console.log('[LeaderboardSeed] Result:', result);
      process.exit(0);
    })
    .catch(err => {
      console.error('[LeaderboardSeed] Failed:', err);
      process.exit(1);
    });
}
