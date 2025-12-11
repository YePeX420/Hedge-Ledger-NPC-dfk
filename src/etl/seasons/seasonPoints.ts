import { db } from '../../../server/db.js';
import { 
  seasons, 
  seasonChallengeWeights, 
  seasonProgress,
  playerChallengeProgress 
} from '../../../shared/schema.js';
import { eq, and, sql, lte, gte } from 'drizzle-orm';

const LEVEL_THRESHOLD = 1000;

export async function getActiveSeason() {
  const now = new Date();
  
  const [activeSeason] = await db
    .select()
    .from(seasons)
    .where(and(
      eq(seasons.isActive, true),
      lte(seasons.startsAt, now),
      gte(seasons.endsAt, now)
    ))
    .limit(1);

  return activeSeason;
}

export async function computeSeasonPointsForCluster(clusterId: string): Promise<{ 
  seasonId: string | null; 
  points: number; 
  level: number;
} | null> {
  const activeSeason = await getActiveSeason();
  
  if (!activeSeason) {
    return null;
  }

  const weights = await db
    .select()
    .from(seasonChallengeWeights)
    .where(eq(seasonChallengeWeights.seasonId, activeSeason.id));

  if (weights.length === 0) {
    return { seasonId: activeSeason.id, points: 0, level: 0 };
  }

  let totalPoints = 0;

  for (const weight of weights) {
    const progressRows = await db.execute(sql`
      SELECT COALESCE(SUM(value), 0)::integer as total_value
      FROM player_challenge_progress
      WHERE cluster_id = ${clusterId}
        AND challenge_key = ${weight.challengeCode}
    `);

    const value = parseInt((progressRows as any)?.[0]?.total_value || '0', 10);
    totalPoints += value * weight.weight;
  }

  const level = Math.floor(totalPoints / LEVEL_THRESHOLD);

  await db
    .insert(seasonProgress)
    .values({
      seasonId: activeSeason.id,
      clusterId,
      points: totalPoints,
      level,
    })
    .onConflictDoUpdate({
      target: [seasonProgress.seasonId, seasonProgress.clusterId],
      set: {
        points: totalPoints,
        level,
        lastUpdatedAt: new Date(),
      },
    });

  return {
    seasonId: activeSeason.id,
    points: totalPoints,
    level,
  };
}

export async function computeSeasonPointsForSeasonId(
  seasonId: string,
  clusterId: string
): Promise<{ 
  seasonId: string; 
  points: number; 
  level: number;
} | null> {
  const [season] = await db
    .select()
    .from(seasons)
    .where(eq(seasons.id, seasonId))
    .limit(1);

  if (!season) {
    return null;
  }

  const weights = await db
    .select()
    .from(seasonChallengeWeights)
    .where(eq(seasonChallengeWeights.seasonId, seasonId));

  if (weights.length === 0) {
    return { seasonId, points: 0, level: 0 };
  }

  let totalPoints = 0;

  for (const weight of weights) {
    const progressRows = await db.execute(sql`
      SELECT COALESCE(SUM(value), 0)::integer as total_value
      FROM player_challenge_progress
      WHERE cluster_id = ${clusterId}
        AND challenge_key = ${weight.challengeCode}
    `);

    const value = parseInt((progressRows as any)?.[0]?.total_value || '0', 10);
    totalPoints += value * weight.weight;
  }

  const level = Math.floor(totalPoints / LEVEL_THRESHOLD);

  await db
    .insert(seasonProgress)
    .values({
      seasonId,
      clusterId,
      points: totalPoints,
      level,
    })
    .onConflictDoUpdate({
      target: [seasonProgress.seasonId, seasonProgress.clusterId],
      set: {
        points: totalPoints,
        level,
        lastUpdatedAt: new Date(),
      },
    });

  return {
    seasonId,
    points: totalPoints,
    level,
  };
}

export async function getSeasonProgress(seasonId: string, clusterId: string) {
  const [progress] = await db
    .select()
    .from(seasonProgress)
    .where(and(
      eq(seasonProgress.seasonId, seasonId),
      eq(seasonProgress.clusterId, clusterId)
    ))
    .limit(1);

  return progress;
}

export async function getSeasonById(seasonId: string) {
  const [season] = await db
    .select()
    .from(seasons)
    .where(eq(seasons.id, seasonId))
    .limit(1);

  return season;
}

export async function getAllSeasons() {
  return db.select().from(seasons).orderBy(seasons.startsAt);
}

export async function createSeason(data: {
  id: string;
  name: string;
  startsAt: Date | string;
  endsAt: Date | string;
  isActive?: boolean;
}) {
  const [season] = await db
    .insert(seasons)
    .values({
      id: data.id,
      name: data.name,
      startsAt: typeof data.startsAt === 'string' ? new Date(data.startsAt) : data.startsAt,
      endsAt: typeof data.endsAt === 'string' ? new Date(data.endsAt) : data.endsAt,
      isActive: data.isActive ?? false,
    })
    .returning();
  return season;
}

export async function updateSeason(id: string, data: {
  name?: string;
  startsAt?: Date | string;
  endsAt?: Date | string;
  isActive?: boolean;
}) {
  const updateData: any = { updatedAt: new Date() };
  if (data.name !== undefined) updateData.name = data.name;
  if (data.isActive !== undefined) updateData.isActive = data.isActive;
  if (data.startsAt !== undefined) {
    updateData.startsAt = typeof data.startsAt === 'string' ? new Date(data.startsAt) : data.startsAt;
  }
  if (data.endsAt !== undefined) {
    updateData.endsAt = typeof data.endsAt === 'string' ? new Date(data.endsAt) : data.endsAt;
  }

  const [updated] = await db
    .update(seasons)
    .set(updateData)
    .where(eq(seasons.id, id))
    .returning();
  return updated;
}

export async function getSeasonWeights(seasonId: string) {
  return db
    .select()
    .from(seasonChallengeWeights)
    .where(eq(seasonChallengeWeights.seasonId, seasonId));
}

export async function setSeasonWeights(seasonId: string, weights: Array<{ challengeCode: string; weight: number }>) {
  await db
    .delete(seasonChallengeWeights)
    .where(eq(seasonChallengeWeights.seasonId, seasonId));

  if (weights.length > 0) {
    await db
      .insert(seasonChallengeWeights)
      .values(weights.map(w => ({
        seasonId,
        challengeCode: w.challengeCode,
        weight: w.weight,
      })));
  }

  return getSeasonWeights(seasonId);
}
