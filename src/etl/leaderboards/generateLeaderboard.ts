import { db } from '../../../server/db.js';
import { 
  leaderboardDefs, 
  leaderboardRuns, 
  leaderboardEntries,
  playerChallengeProgress 
} from '../../../shared/schema.js';
import { eq, desc, and, sql } from 'drizzle-orm';

interface GenerateLeaderboardOptions {
  periodStart?: Date;
  periodEnd?: Date;
  maxEntries?: number;
}

interface GenerateLeaderboardResult {
  runId: number;
  rowCount: number;
  status: string;
}

function getTimeWindowDates(timeWindow: string): { periodStart: Date; periodEnd: Date } {
  const now = new Date();
  let periodStart: Date;
  let periodEnd: Date = now;

  switch (timeWindow.toUpperCase()) {
    case 'DAILY':
      periodStart = new Date(now);
      periodStart.setHours(0, 0, 0, 0);
      periodEnd = new Date(now);
      periodEnd.setHours(23, 59, 59, 999);
      break;
    case 'WEEKLY':
      periodStart = new Date(now);
      periodStart.setDate(now.getDate() - now.getDay());
      periodStart.setHours(0, 0, 0, 0);
      periodEnd = new Date(periodStart);
      periodEnd.setDate(periodStart.getDate() + 6);
      periodEnd.setHours(23, 59, 59, 999);
      break;
    case 'MONTHLY':
      periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
      periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
      break;
    case 'SEASON':
    case 'ALL_TIME':
    default:
      periodStart = new Date('2020-01-01');
      periodEnd = now;
      break;
  }

  return { periodStart, periodEnd };
}

export async function generateLeaderboardRun(
  leaderboardKey: string,
  opts: GenerateLeaderboardOptions = {}
): Promise<GenerateLeaderboardResult> {
  const maxEntries = opts.maxEntries || 1000;

  const [leaderboardDef] = await db
    .select()
    .from(leaderboardDefs)
    .where(eq(leaderboardDefs.key, leaderboardKey))
    .limit(1);

  if (!leaderboardDef) {
    throw new Error(`Leaderboard definition not found: ${leaderboardKey}`);
  }

  if (!leaderboardDef.isActive) {
    throw new Error(`Leaderboard is not active: ${leaderboardKey}`);
  }

  const { periodStart, periodEnd } = opts.periodStart && opts.periodEnd
    ? { periodStart: opts.periodStart, periodEnd: opts.periodEnd }
    : getTimeWindowDates(leaderboardDef.timeWindow);

  const [run] = await db
    .insert(leaderboardRuns)
    .values({
      leaderboardKey,
      periodStart,
      periodEnd,
      status: 'PROCESSING',
      rowCount: 0,
    })
    .returning();

  try {
    // Note: For time-windowed leaderboards, we filter by updated_at to include only
    // progress updated within the period. For cumulative metrics, this shows players
    // who were active during the time window. For true delta-based rankings, a separate
    // snapshot/delta tracking system would be needed.
    const progressRows = await db.execute(sql`
      SELECT 
        pcp.cluster_id,
        COALESCE(SUM(pcp.value), 0)::integer as score
      FROM player_challenge_progress pcp
      WHERE pcp.cluster_id IS NOT NULL
        AND pcp.metric_source = ${leaderboardDef.metricSource}
        AND pcp.metric_key = ${leaderboardDef.metricKey}
        AND pcp.updated_at >= ${periodStart}
        AND pcp.updated_at <= ${periodEnd}
      GROUP BY pcp.cluster_id
      HAVING COALESCE(SUM(pcp.value), 0) > 0
      ORDER BY score DESC
      LIMIT ${maxEntries}
    `);

    const entries = (progressRows as any[]).map((row, index) => ({
      runId: run.id,
      clusterId: row.cluster_id,
      rank: index + 1,
      score: parseInt(row.score, 10) || 0,
      tiebreaker: 0,
      payload: JSON.stringify({ metricSource: leaderboardDef.metricSource, metricKey: leaderboardDef.metricKey }),
    }));

    if (entries.length > 0) {
      await db.insert(leaderboardEntries).values(entries);
    }

    await db
      .update(leaderboardRuns)
      .set({ 
        status: 'COMPLETE', 
        rowCount: entries.length,
        updatedAt: new Date(),
      })
      .where(eq(leaderboardRuns.id, run.id));

    return {
      runId: run.id,
      rowCount: entries.length,
      status: 'COMPLETE',
    };
  } catch (error) {
    await db
      .update(leaderboardRuns)
      .set({ 
        status: 'FAILED',
        updatedAt: new Date(),
      })
      .where(eq(leaderboardRuns.id, run.id));

    throw error;
  }
}

export async function getLeaderboardLatestRun(leaderboardKey: string) {
  const [latestRun] = await db
    .select()
    .from(leaderboardRuns)
    .where(and(
      eq(leaderboardRuns.leaderboardKey, leaderboardKey),
      eq(leaderboardRuns.status, 'COMPLETE')
    ))
    .orderBy(desc(leaderboardRuns.createdAt))
    .limit(1);

  return latestRun;
}

export async function getLeaderboardEntries(runId: number, limit: number = 100) {
  const entries = await db
    .select()
    .from(leaderboardEntries)
    .where(eq(leaderboardEntries.runId, runId))
    .orderBy(leaderboardEntries.rank)
    .limit(limit);

  return entries;
}

export async function getAllLeaderboardDefs() {
  return db.select().from(leaderboardDefs).orderBy(leaderboardDefs.key);
}

export async function getLeaderboardDefByKey(key: string) {
  const [def] = await db
    .select()
    .from(leaderboardDefs)
    .where(eq(leaderboardDefs.key, key))
    .limit(1);
  return def;
}

export async function createLeaderboardDef(data: {
  key: string;
  name: string;
  description: string;
  categoryKey: string;
  metricSource: string;
  metricKey: string;
  fallbackMetricKey?: string;
  timeWindow: string;
  isActive?: boolean;
}) {
  const [def] = await db
    .insert(leaderboardDefs)
    .values({
      ...data,
      isActive: data.isActive ?? true,
    })
    .returning();
  return def;
}

export async function updateLeaderboardDef(key: string, data: {
  name?: string;
  description?: string;
  categoryKey?: string;
  metricSource?: string;
  metricKey?: string;
  fallbackMetricKey?: string | null;
  timeWindow?: string;
  isActive?: boolean;
}) {
  const [updated] = await db
    .update(leaderboardDefs)
    .set({
      ...data,
      updatedAt: new Date(),
    })
    .where(eq(leaderboardDefs.key, key))
    .returning();
  return updated;
}
