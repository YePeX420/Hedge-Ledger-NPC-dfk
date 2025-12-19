import type { Request } from "express";
import type { UserTier } from "./entitlements";

export function resolveTier(req: Request): UserTier {
  let tier: UserTier = "free";

  const headerTier = (req.headers["x-hedge-tier"] as string | undefined)?.toLowerCase();
  const env = (process.env.NODE_ENV || "development").toLowerCase();

  if (env !== "production" && headerTier) {
    if (headerTier === "free" || headerTier === "premium" || headerTier === "premium_plus") {
      tier = headerTier;
    }
  }

  return tier;
}
