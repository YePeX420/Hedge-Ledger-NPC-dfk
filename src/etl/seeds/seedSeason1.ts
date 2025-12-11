import { db } from '../../../server/db.js';
import { seasons, seasonChallengeWeights } from '../../../shared/schema.js';
import { eq } from 'drizzle-orm';

const SEASON_1_ID = 'season_1_awakening';

const SEASON_1_CONFIG = {
  id: SEASON_1_ID,
  name: 'Season 1 – The Awakening',
  startsAt: new Date('2025-01-01T00:00:00Z'),
  endsAt: new Date('2025-03-01T23:59:59Z'),
  isActive: true,
};

const SEASON_1_WEIGHTS = [
  { challengeCode: 'hero_riser', weight: 1 },
  { challengeCode: 'house_of_heroes', weight: 1 },
  { challengeCode: 'miner_master', weight: 1 },
  { challengeCode: 'herbalist_master', weight: 1 },
  { challengeCode: 'perfect_pairing', weight: 5 },
  { challengeCode: 'mutagenic_specialist', weight: 5 },
  { challengeCode: 'mythmaker', weight: 4 },
  { challengeCode: 'royal_lineage', weight: 5 },
  { challengeCode: 'summoner_of_legends', weight: 8 },
  { challengeCode: 'hunters_triumph', weight: 2 },
  { challengeCode: 'motherclucker_slayer', weight: 4 },
  { challengeCode: 'mad_boar_slayer', weight: 4 },
  { challengeCode: 'relic_tracker', weight: 3 },
  { challengeCode: 'clucker_miracle', weight: 10 },
  { challengeCode: 'arena_challenger', weight: 1 },
  { challengeCode: 'arena_victor', weight: 3 },
  { challengeCode: 'win_streak', weight: 4 },
  { challengeCode: 'flawless_victory', weight: 8 },
  { challengeCode: 'kingdom_calls', weight: 1 },
  { challengeCode: 'loyal_follower', weight: 1 },
];

export async function seedSeason1() {
  console.log('[SeasonSeed] Starting Season 1 seed...');

  try {
    const existingSeason = await db
      .select()
      .from(seasons)
      .where(eq(seasons.id, SEASON_1_ID))
      .limit(1);

    if (existingSeason.length > 0) {
      console.log('[SeasonSeed] Season 1 already exists, updating...');
      await db
        .update(seasons)
        .set({
          name: SEASON_1_CONFIG.name,
          startsAt: SEASON_1_CONFIG.startsAt,
          endsAt: SEASON_1_CONFIG.endsAt,
          isActive: SEASON_1_CONFIG.isActive,
          updatedAt: new Date(),
        })
        .where(eq(seasons.id, SEASON_1_ID));
    } else {
      console.log('[SeasonSeed] Creating Season 1...');
      await db.insert(seasons).values(SEASON_1_CONFIG);
    }

    console.log('[SeasonSeed] Clearing existing Season 1 weights...');
    await db
      .delete(seasonChallengeWeights)
      .where(eq(seasonChallengeWeights.seasonId, SEASON_1_ID));

    console.log(`[SeasonSeed] Inserting ${SEASON_1_WEIGHTS.length} challenge weights...`);
    await db.insert(seasonChallengeWeights).values(
      SEASON_1_WEIGHTS.map(w => ({
        seasonId: SEASON_1_ID,
        challengeCode: w.challengeCode,
        weight: w.weight,
      }))
    );

    console.log('[SeasonSeed] Season 1 seed complete!');
    
    return {
      seasonId: SEASON_1_ID,
      seasonName: SEASON_1_CONFIG.name,
      startsAt: SEASON_1_CONFIG.startsAt,
      endsAt: SEASON_1_CONFIG.endsAt,
      weightsCount: SEASON_1_WEIGHTS.length,
    };
  } catch (error) {
    console.error('[SeasonSeed] Error seeding Season 1:', error);
    throw error;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seedSeason1()
    .then(result => {
      console.log('[SeasonSeed] Result:', result);
      process.exit(0);
    })
    .catch(err => {
      console.error('[SeasonSeed] Failed:', err);
      process.exit(1);
    });
}
