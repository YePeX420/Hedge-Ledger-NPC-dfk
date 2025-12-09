import { Router } from "express";
import * as controller from "./levelRacer.controller.js";

const router = Router();

router.get("/classes", controller.getHeroClasses);
router.get("/pools/active", controller.getActivePools);
router.post("/pools/:classSlug/join", controller.joinPool);
router.get("/pools/:poolId", controller.getPool);
router.get("/pools/:poolId/events", controller.getPoolEvents);
router.post("/pools/:poolId/xp-update", controller.updateXp);
router.post("/dev/pools/:poolId/simulate-tick", controller.simulateTick);
router.post("/dev/seed-classes", controller.seedClasses);

export default router;
