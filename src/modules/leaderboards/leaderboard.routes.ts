import { Router, Request, Response } from "express";
import {
  getAllLeaderboardDefs,
  getLeaderboardDefByKey,
  createLeaderboardDef,
  updateLeaderboardDef,
  generateLeaderboardRun,
  getLeaderboardLatestRun,
  getLeaderboardEntries,
} from "../../etl/leaderboards/generateLeaderboard.js";

const router = Router();

router.get("/", async (req: Request, res: Response) => {
  try {
    const defs = await getAllLeaderboardDefs();
    res.json(defs);
  } catch (error: any) {
    console.error("[API] Error fetching leaderboards:", error);
    res.status(500).json({ error: "Failed to fetch leaderboards", details: error.message });
  }
});

router.get("/:key", async (req: Request, res: Response) => {
  try {
    const def = await getLeaderboardDefByKey(req.params.key);
    if (!def) {
      return res.status(404).json({ error: "Leaderboard not found" });
    }
    res.json(def);
  } catch (error: any) {
    console.error("[API] Error fetching leaderboard:", error);
    res.status(500).json({ error: "Failed to fetch leaderboard", details: error.message });
  }
});

router.post("/", async (req: Request, res: Response) => {
  try {
    const def = await createLeaderboardDef(req.body);
    res.json(def);
  } catch (error: any) {
    console.error("[API] Error creating leaderboard:", error);
    res.status(500).json({ error: "Failed to create leaderboard", details: error.message });
  }
});

router.patch("/:key", async (req: Request, res: Response) => {
  try {
    const updated = await updateLeaderboardDef(req.params.key, req.body);
    if (!updated) {
      return res.status(404).json({ error: "Leaderboard not found" });
    }
    res.json(updated);
  } catch (error: any) {
    console.error("[API] Error updating leaderboard:", error);
    res.status(500).json({ error: "Failed to update leaderboard", details: error.message });
  }
});

router.post("/:key/generate", async (req: Request, res: Response) => {
  try {
    const result = await generateLeaderboardRun(req.params.key, req.body);
    res.json(result);
  } catch (error: any) {
    console.error("[API] Error generating leaderboard:", error);
    res.status(500).json({ error: "Failed to generate leaderboard", details: error.message });
  }
});

router.get("/:key/latest", async (req: Request, res: Response) => {
  try {
    const run = await getLeaderboardLatestRun(req.params.key);
    if (!run) {
      return res.status(404).json({ error: "No completed runs found" });
    }
    const limit = parseInt(req.query.limit as string) || 100;
    const entries = await getLeaderboardEntries(run.id, limit);
    res.json({ run, entries });
  } catch (error: any) {
    console.error("[API] Error fetching latest leaderboard:", error);
    res.status(500).json({ error: "Failed to fetch leaderboard", details: error.message });
  }
});

export default router;
