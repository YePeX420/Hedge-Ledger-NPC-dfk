import { Router, Request, Response } from "express";
import {
  getAllSeasons,
  getSeasonById,
  getActiveSeason,
  createSeason,
  updateSeason,
  getSeasonWeights,
  setSeasonWeights,
  getSeasonProgress,
} from "../../etl/seasons/seasonPoints.js";

const router = Router();

router.get("/", async (req: Request, res: Response) => {
  try {
    const allSeasons = await getAllSeasons();
    res.json(allSeasons);
  } catch (error: any) {
    console.error("[API] Error fetching seasons:", error);
    res.status(500).json({ error: "Failed to fetch seasons", details: error.message });
  }
});

router.get("/active", async (req: Request, res: Response) => {
  try {
    const active = await getActiveSeason();
    if (!active) {
      return res.status(404).json({ error: "No active season" });
    }
    res.json(active);
  } catch (error: any) {
    console.error("[API] Error fetching active season:", error);
    res.status(500).json({ error: "Failed to fetch active season", details: error.message });
  }
});

router.get("/:id", async (req: Request, res: Response) => {
  try {
    const season = await getSeasonById(req.params.id);
    if (!season) {
      return res.status(404).json({ error: "Season not found" });
    }
    res.json(season);
  } catch (error: any) {
    console.error("[API] Error fetching season:", error);
    res.status(500).json({ error: "Failed to fetch season", details: error.message });
  }
});

router.post("/", async (req: Request, res: Response) => {
  try {
    const season = await createSeason(req.body);
    res.json(season);
  } catch (error: any) {
    console.error("[API] Error creating season:", error);
    res.status(500).json({ error: "Failed to create season", details: error.message });
  }
});

router.patch("/:id", async (req: Request, res: Response) => {
  try {
    const updated = await updateSeason(req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({ error: "Season not found" });
    }
    res.json(updated);
  } catch (error: any) {
    console.error("[API] Error updating season:", error);
    res.status(500).json({ error: "Failed to update season", details: error.message });
  }
});

router.get("/:id/weights", async (req: Request, res: Response) => {
  try {
    const weights = await getSeasonWeights(req.params.id);
    res.json(weights);
  } catch (error: any) {
    console.error("[API] Error fetching season weights:", error);
    res.status(500).json({ error: "Failed to fetch weights", details: error.message });
  }
});

router.put("/:id/weights", async (req: Request, res: Response) => {
  try {
    const weights = await setSeasonWeights(req.params.id, req.body.weights || []);
    res.json(weights);
  } catch (error: any) {
    console.error("[API] Error setting season weights:", error);
    res.status(500).json({ error: "Failed to set weights", details: error.message });
  }
});

router.get("/:id/progress/:clusterId", async (req: Request, res: Response) => {
  try {
    const progress = await getSeasonProgress(req.params.id, req.params.clusterId);
    if (!progress) {
      return res.status(404).json({ error: "Progress not found" });
    }
    res.json(progress);
  } catch (error: any) {
    console.error("[API] Error fetching season progress:", error);
    res.status(500).json({ error: "Failed to fetch progress", details: error.message });
  }
});

router.post("/:id/compute-points/:clusterId", async (req: Request, res: Response) => {
  try {
    const { computeSeasonPointsForSeasonId } = await import("../../etl/seasons/seasonPoints.js");
    const result = await computeSeasonPointsForSeasonId(req.params.id, req.params.clusterId);
    if (!result) {
      return res.status(404).json({ error: "Season not found or points could not be computed" });
    }
    res.json(result);
  } catch (error: any) {
    console.error("[API] Error computing season points:", error);
    res.status(500).json({ error: "Failed to compute season points", details: error.message });
  }
});

export default router;
