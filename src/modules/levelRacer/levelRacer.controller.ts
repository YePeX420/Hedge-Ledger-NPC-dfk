import type { Request, Response } from "express";
import * as service from "./levelRacer.service.js";
import type { JoinPoolRequest, XpUpdateRequest, UpdatePoolRequest } from "./levelRacer.types.js";

export async function getActivePools(req: Request, res: Response) {
  try {
    const pools = await service.getActivePools();
    res.json({ pools });
  } catch (error: any) {
    console.error("[LevelRacer] getActivePools error:", error);
    res.status(500).json({
      success: false,
      error: { code: "INTERNAL_ERROR", message: error.message },
    });
  }
}

export async function joinPool(req: Request, res: Response) {
  try {
    const classSlug = req.params.classSlug;
    const body = req.body as JoinPoolRequest;

    if (!body.walletAddress || !body.heroId || !body.heroClassSlug) {
      return res.status(400).json({
        success: false,
        error: { code: "INVALID_REQUEST", message: "Missing required fields" },
      });
    }

    if (body.heroClassSlug !== classSlug) {
      return res.status(400).json({
        success: false,
        error: { code: "CLASS_MISMATCH", message: "Hero class does not match pool class" },
      });
    }

    const result = await service.joinPool(body);
    res.json(result);
  } catch (error: any) {
    console.error("[LevelRacer] joinPool error:", error);
    
    const errorCode = error.message.includes("common") ? "INVALID_RARITY" :
                      error.message.includes("XP") ? "INVALID_XP" :
                      error.message.includes("stone") ? "HAS_STONE" :
                      error.message.includes("level") ? "WRONG_LEVEL" :
                      error.message.includes("full") ? "POOL_FULL" :
                      error.message.includes("not found") ? "CLASS_NOT_FOUND" :
                      "JOIN_ERROR";

    res.status(400).json({
      success: false,
      error: { code: errorCode, message: error.message },
    });
  }
}

export async function getPool(req: Request, res: Response) {
  try {
    const poolId = parseInt(req.params.poolId, 10);
    if (isNaN(poolId)) {
      return res.status(400).json({
        success: false,
        error: { code: "INVALID_POOL_ID", message: "Pool ID must be a number" },
      });
    }

    const pool = await service.getPoolDetails(poolId);
    if (!pool) {
      return res.status(404).json({
        success: false,
        error: { code: "POOL_NOT_FOUND", message: "Pool not found" },
      });
    }

    res.json(pool);
  } catch (error: any) {
    console.error("[LevelRacer] getPool error:", error);
    res.status(500).json({
      success: false,
      error: { code: "INTERNAL_ERROR", message: error.message },
    });
  }
}

export async function getPoolEvents(req: Request, res: Response) {
  try {
    const poolId = parseInt(req.params.poolId, 10);
    if (isNaN(poolId)) {
      return res.status(400).json({
        success: false,
        error: { code: "INVALID_POOL_ID", message: "Pool ID must be a number" },
      });
    }

    const events = await service.getPoolEvents(poolId);
    res.json({ events });
  } catch (error: any) {
    console.error("[LevelRacer] getPoolEvents error:", error);
    res.status(500).json({
      success: false,
      error: { code: "INTERNAL_ERROR", message: error.message },
    });
  }
}

export async function updateXp(req: Request, res: Response) {
  try {
    const poolId = parseInt(req.params.poolId, 10);
    if (isNaN(poolId)) {
      return res.status(400).json({
        success: false,
        error: { code: "INVALID_POOL_ID", message: "Pool ID must be a number" },
      });
    }

    const body = req.body as XpUpdateRequest;
    if (!body.updates || !Array.isArray(body.updates)) {
      return res.status(400).json({
        success: false,
        error: { code: "INVALID_REQUEST", message: "Missing updates array" },
      });
    }

    const result = await service.processXpUpdates(poolId, body.updates);
    res.json(result);
  } catch (error: any) {
    console.error("[LevelRacer] updateXp error:", error);
    res.status(400).json({
      success: false,
      error: { code: "XP_UPDATE_ERROR", message: error.message },
    });
  }
}

export async function simulateTick(req: Request, res: Response) {
  try {
    const poolId = parseInt(req.params.poolId, 10);
    if (isNaN(poolId)) {
      return res.status(400).json({
        success: false,
        error: { code: "INVALID_POOL_ID", message: "Pool ID must be a number" },
      });
    }

    const result = await service.simulateTick(poolId);
    res.json(result);
  } catch (error: any) {
    console.error("[LevelRacer] simulateTick error:", error);
    res.status(400).json({
      success: false,
      error: { code: "SIMULATE_ERROR", message: error.message },
    });
  }
}

export async function getHeroClasses(req: Request, res: Response) {
  try {
    const classes = await service.getAllHeroClasses();
    res.json({ classes });
  } catch (error: any) {
    console.error("[LevelRacer] getHeroClasses error:", error);
    res.status(500).json({
      success: false,
      error: { code: "INTERNAL_ERROR", message: error.message },
    });
  }
}

export async function seedClasses(req: Request, res: Response) {
  try {
    await service.seedHeroClasses();
    res.json({ success: true, message: "Hero classes seeded" });
  } catch (error: any) {
    console.error("[LevelRacer] seedClasses error:", error);
    res.status(500).json({
      success: false,
      error: { code: "SEED_ERROR", message: error.message },
    });
  }
}

export async function getAllPools(req: Request, res: Response) {
  try {
    const pools = await service.getAllPools();
    res.json({ pools });
  } catch (error: any) {
    console.error("[LevelRacer] getAllPools error:", error);
    res.status(500).json({
      success: false,
      error: { code: "INTERNAL_ERROR", message: error.message },
    });
  }
}

export async function adminCreatePool(req: Request, res: Response) {
  try {
    const { 
      classSlug, 
      level, 
      maxEntries, 
      usdEntryFee,
      usdPrize,
      tokenType,
      jewelEntryFee, 
      jewelPrize,
      rarityFilter,
      maxMutations,
      isRecurrent,
    } = req.body;
    
    if (!classSlug) {
      return res.status(400).json({
        success: false,
        error: { code: "INVALID_REQUEST", message: "classSlug is required" },
      });
    }

    const pool = await service.adminCreatePool(classSlug, {
      level,
      maxEntries,
      usdEntryFee,
      usdPrize,
      tokenType,
      jewelEntryFee,
      jewelPrize,
      rarityFilter,
      maxMutations,
      isRecurrent,
    });

    res.json({ 
      success: true, 
      pool,
      message: `Pool created for ${classSlug}`,
    });
  } catch (error: any) {
    console.error("[LevelRacer] adminCreatePool error:", error);
    res.status(400).json({
      success: false,
      error: { code: "CREATE_ERROR", message: error.message },
    });
  }
}

export async function adminUpdatePool(req: Request, res: Response) {
  try {
    const poolId = parseInt(req.params.poolId, 10);
    if (isNaN(poolId)) {
      return res.status(400).json({
        success: false,
        error: { code: "INVALID_POOL_ID", message: "Pool ID must be a number" },
      });
    }

    const updates: UpdatePoolRequest = req.body;
    const pool = await service.adminUpdatePool(poolId, updates);

    res.json({ 
      success: true, 
      pool,
      message: `Pool ${poolId} updated`,
    });
  } catch (error: any) {
    console.error("[LevelRacer] adminUpdatePool error:", error);
    res.status(400).json({
      success: false,
      error: { code: "UPDATE_ERROR", message: error.message },
    });
  }
}
