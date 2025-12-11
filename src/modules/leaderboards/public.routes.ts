import { Router, Request, Response } from "express";
import { db } from "../../../server/db.js";
import {
  leaderboardDefs,
  leaderboardRuns,
  leaderboardEntries,
  walletClusters,
  walletLinks,
  playerChallengeProgress,
  seasons,
} from "../../../shared/schema.js";
import { eq, desc, and, sql, inArray } from "drizzle-orm";

const router = Router();

interface PublicLeaderboardEntry {
  rank: number;
  clusterId: string;
  displayName: string | null;
  walletPreview: string | null;
  score: number;
  flags: string[];
}

interface PublicLeaderboard {
  key: string;
  name: string;
  description: string;
  timeWindow: string;
  seasonKey?: string;
  runId?: number;
  generatedAt?: string;
  entries: PublicLeaderboardEntry[];
}

async function getClusterDisplayInfo(clusterIds: string[]): Promise<Map<string, { displayName: string | null; walletPreview: string | null }>> {
  if (clusterIds.length === 0) return new Map();

  const clusters = await db
    .select({
      clusterKey: walletClusters.clusterKey,
      userId: walletClusters.userId,
    })
    .from(walletClusters)
    .where(inArray(walletClusters.clusterKey, clusterIds));

  const wallets = await db
    .select({
      clusterKey: walletLinks.clusterKey,
      address: walletLinks.address,
      isPrimary: walletLinks.isPrimary,
    })
    .from(walletLinks)
    .where(and(
      inArray(walletLinks.clusterKey, clusterIds),
      eq(walletLinks.isPrimary, true)
    ));

  const clusterMap = new Map<string, string>(clusters.map((c: { clusterKey: string; userId: string }) => [c.clusterKey, c.userId]));
  const walletMap = new Map<string, string>(wallets.map((w: { clusterKey: string; address: string }) => [w.clusterKey, w.address]));

  const result = new Map<string, { displayName: string | null; walletPreview: string | null }>();
  for (const cid of clusterIds) {
    const wallet = walletMap.get(cid);
    result.set(cid, {
      displayName: clusterMap.get(cid) || null,
      walletPreview: wallet ? `${wallet.slice(0, 6)}...${wallet.slice(-4)}` : null,
    });
  }

  return result;
}

async function getPlayerFlags(clusterIds: string[]): Promise<Map<string, string[]>> {
  if (clusterIds.length === 0) return new Map();

  const priorityFlags = ['summoner_of_legends', 'mythmaker', 'clucker_miracle', 'arena_victor', 'lp_whale'];

  const progressRows = await db
    .select({
      clusterId: playerChallengeProgress.clusterId,
      challengeKey: playerChallengeProgress.challengeKey,
      highestTierAchieved: playerChallengeProgress.highestTierAchieved,
    })
    .from(playerChallengeProgress)
    .where(and(
      inArray(playerChallengeProgress.clusterId, clusterIds),
      inArray(playerChallengeProgress.challengeKey, priorityFlags),
      sql`${playerChallengeProgress.highestTierAchieved} IS NOT NULL`
    ));

  const flagMap = new Map<string, string[]>();

  for (const row of progressRows) {
    const cid = row.clusterId!;
    if (!flagMap.has(cid)) flagMap.set(cid, []);
    flagMap.get(cid)!.push(row.challengeKey);
  }

  return flagMap;
}

router.get("/", async (req: Request, res: Response) => {
  try {
    const defs = await db
      .select({
        key: leaderboardDefs.key,
        name: leaderboardDefs.name,
        description: leaderboardDefs.description,
        categoryKey: leaderboardDefs.categoryKey,
        timeWindow: leaderboardDefs.timeWindow,
      })
      .from(leaderboardDefs)
      .where(eq(leaderboardDefs.isActive, true))
      .orderBy(leaderboardDefs.categoryKey, leaderboardDefs.name);

    res.json(defs);
  } catch (error: any) {
    console.error("[PublicAPI] Error fetching leaderboards:", error);
    res.status(500).json({ error: "Failed to fetch leaderboards" });
  }
});

router.get("/:key", async (req: Request, res: Response) => {
  try {
    const { key } = req.params;
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);

    const [def] = await db
      .select()
      .from(leaderboardDefs)
      .where(and(eq(leaderboardDefs.key, key), eq(leaderboardDefs.isActive, true)))
      .limit(1);

    if (!def) {
      return res.status(404).json({ error: "Leaderboard not found" });
    }

    const [latestRun] = await db
      .select()
      .from(leaderboardRuns)
      .where(and(
        eq(leaderboardRuns.leaderboardKey, key),
        eq(leaderboardRuns.status, "COMPLETED")
      ))
      .orderBy(desc(leaderboardRuns.createdAt))
      .limit(1);

    if (!latestRun) {
      return res.json({
        key: def.key,
        name: def.name,
        description: def.description,
        timeWindow: def.timeWindow,
        entries: [],
      });
    }

    const entries = await db
      .select({
        clusterId: leaderboardEntries.clusterId,
        rank: leaderboardEntries.rank,
        score: leaderboardEntries.score,
        payload: leaderboardEntries.payload,
      })
      .from(leaderboardEntries)
      .where(eq(leaderboardEntries.runId, latestRun.id))
      .orderBy(leaderboardEntries.rank)
      .limit(limit);

    const clusterIds = entries.map(e => e.clusterId);
    const [displayInfo, flagsMap] = await Promise.all([
      getClusterDisplayInfo(clusterIds),
      getPlayerFlags(clusterIds),
    ]);

    const publicEntries: PublicLeaderboardEntry[] = entries.map(e => ({
      rank: e.rank,
      clusterId: e.clusterId,
      displayName: displayInfo.get(e.clusterId)?.displayName || null,
      walletPreview: displayInfo.get(e.clusterId)?.walletPreview || null,
      score: e.score,
      flags: flagsMap.get(e.clusterId) || [],
    }));

    const response: PublicLeaderboard = {
      key: def.key,
      name: def.name,
      description: def.description,
      timeWindow: def.timeWindow,
      runId: latestRun.id,
      generatedAt: latestRun.createdAt.toISOString(),
      entries: publicEntries,
    };

    res.json(response);
  } catch (error: any) {
    console.error("[PublicAPI] Error fetching leaderboard:", error);
    res.status(500).json({ error: "Failed to fetch leaderboard" });
  }
});

router.get("/:key/my-rank", async (req: Request, res: Response) => {
  try {
    const { key } = req.params;
    const { clusterId } = req.query;

    if (!clusterId) {
      return res.status(400).json({ error: "clusterId is required" });
    }

    const [latestRun] = await db
      .select()
      .from(leaderboardRuns)
      .where(and(
        eq(leaderboardRuns.leaderboardKey, key),
        eq(leaderboardRuns.status, "COMPLETED")
      ))
      .orderBy(desc(leaderboardRuns.createdAt))
      .limit(1);

    if (!latestRun) {
      return res.json({ rank: null, score: null, message: "No leaderboard run found" });
    }

    const [entry] = await db
      .select()
      .from(leaderboardEntries)
      .where(and(
        eq(leaderboardEntries.runId, latestRun.id),
        eq(leaderboardEntries.clusterId, clusterId as string)
      ))
      .limit(1);

    if (!entry) {
      return res.json({ rank: null, score: null, message: "Not ranked in this leaderboard" });
    }

    res.json({
      rank: entry.rank,
      score: entry.score,
      totalEntries: latestRun.rowCount,
    });
  } catch (error: any) {
    console.error("[PublicAPI] Error fetching rank:", error);
    res.status(500).json({ error: "Failed to fetch rank" });
  }
});

export default router;
