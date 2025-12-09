/**
 * TierService Unit Tests
 * 
 * Tests the Base Tier Assignment Formula with 4 archetype profiles:
 * 1. Fresh Newbie → COMMON
 * 2. Growing Early Player → UNCOMMON
 * 3. Established Mid-Game Player → RARE
 * 4. True OG / Whale → MYTHIC
 */

import { describe, test, expect } from "vitest";
import {
  computeBaseTierFromMetrics,
  type ClusterKpiSnapshot,
} from "./TierService";
import type { TierCode } from "../../api/contracts/leagues";

function expectTier(
  snapshot: ClusterKpiSnapshot,
  expectedTier: TierCode,
  cpsRange?: { min?: number; max?: number }
) {
  const result = computeBaseTierFromMetrics(snapshot);

  expect(result.tier).toBe(expectedTier);

  if (cpsRange?.min !== undefined) {
    expect(result.cps).toBeGreaterThanOrEqual(cpsRange.min);
  }
  if (cpsRange?.max !== undefined) {
    expect(result.cps).toBeLessThan(cpsRange.max);
  }
}

describe("TierService.computeBaseTierFromMetrics", () => {
  test("Profile 1 – Fresh Newbie → COMMON", () => {
    const snapshot: ClusterKpiSnapshot = {
      heroPower: {
        commonHeroes: 1,
        uncommonHeroes: 0,
        rareHeroes: 0,
        legendaryHeroes: 0,
        mythicHeroes: 0,
        totalHeroLevels: 10,
      },
      walletValue: {
        totalNetWorthUsd: 50,
      },
      activity30d: {
        professionQuests30d: 40,
        summons30d: 0,
        staminaUtilizationRate: 0.3,
        daysActive30d: 5,
      },
      accountAge: {
        accountAgeDays: 10,
      },
      behavior30d: {
        reinvestRatio30d: 0.2,
        netHeroDelta30d: 0,
        heavySellActivityFlag: 0,
      },
    };

    expectTier(snapshot, "COMMON", {
      min: 0,
      max: 20,
    });
  });

  test("Profile 2 – Growing Early Player → UNCOMMON", () => {
    const snapshot: ClusterKpiSnapshot = {
      heroPower: {
        commonHeroes: 5,
        uncommonHeroes: 5,
        rareHeroes: 3,
        legendaryHeroes: 1,
        mythicHeroes: 0,
        totalHeroLevels: 150,
      },
      walletValue: {
        totalNetWorthUsd: 500,
      },
      activity30d: {
        professionQuests30d: 300,
        summons30d: 5,
        staminaUtilizationRate: 0.7,
        daysActive30d: 20,
      },
      accountAge: {
        accountAgeDays: 120,
      },
      behavior30d: {
        reinvestRatio30d: 0.6,
        netHeroDelta30d: 2,
        heavySellActivityFlag: 0,
      },
    };

    expectTier(snapshot, "UNCOMMON", {
      min: 20,
      max: 40,
    });
  });

  test("Profile 3 – Established Mid-Game Player → RARE", () => {
    const snapshot: ClusterKpiSnapshot = {
      heroPower: {
        commonHeroes: 20,
        uncommonHeroes: 20,
        rareHeroes: 20,
        legendaryHeroes: 5,
        mythicHeroes: 2,
        totalHeroLevels: 1500,
      },
      walletValue: {
        totalNetWorthUsd: 8000,
      },
      activity30d: {
        professionQuests30d: 3000,
        summons30d: 60,
        staminaUtilizationRate: 0.95,
        daysActive30d: 30,
      },
      accountAge: {
        accountAgeDays: 400,
      },
      behavior30d: {
        reinvestRatio30d: 0.8,
        netHeroDelta30d: 10,
        heavySellActivityFlag: 0,
      },
    };

    expectTier(snapshot, "RARE", {
      min: 40,
      max: 60,
    });
  });

  test("Profile 4 – True OG / Whale → MYTHIC", () => {
    const snapshot: ClusterKpiSnapshot = {
      heroPower: {
        commonHeroes: 80,
        uncommonHeroes: 120,
        rareHeroes: 100,
        legendaryHeroes: 60,
        mythicHeroes: 30,
        totalHeroLevels: 9000,
      },
      walletValue: {
        totalNetWorthUsd: 200_000,
      },
      activity30d: {
        professionQuests30d: 10_000,
        summons30d: 250,
        staminaUtilizationRate: 0.99,
        daysActive30d: 30,
      },
      accountAge: {
        accountAgeDays: 1200,
      },
      behavior30d: {
        reinvestRatio30d: 0.95,
        netHeroDelta30d: 40,
        heavySellActivityFlag: 0,
      },
    };

    expectTier(snapshot, "MYTHIC", {
      min: 80,
      max: 100.0001,
    });
  });

  test("Edge case – Empty snapshot → COMMON", () => {
    const snapshot: ClusterKpiSnapshot = {
      heroPower: {
        commonHeroes: 0,
        uncommonHeroes: 0,
        rareHeroes: 0,
        legendaryHeroes: 0,
        mythicHeroes: 0,
        totalHeroLevels: 0,
      },
      walletValue: {
        totalNetWorthUsd: 0,
      },
      activity30d: {
        professionQuests30d: 0,
        summons30d: 0,
        staminaUtilizationRate: 0,
        daysActive30d: 0,
      },
      accountAge: {
        accountAgeDays: 0,
      },
      behavior30d: {
        reinvestRatio30d: 0,
        netHeroDelta30d: 0,
        heavySellActivityFlag: 0,
      },
    };

    const result = computeBaseTierFromMetrics(snapshot);
    expect(result.tier).toBe("COMMON");
    expect(result.cps).toBe(20); // 40% of 0 + 25% of 0 + ... + 5% of 40 (BHS normalized for +2)
  });

  test("Edge case – Heavy extractor gets penalized", () => {
    const snapshot: ClusterKpiSnapshot = {
      heroPower: {
        commonHeroes: 20,
        uncommonHeroes: 20,
        rareHeroes: 10,
        legendaryHeroes: 5,
        mythicHeroes: 0,
        totalHeroLevels: 800,
      },
      walletValue: {
        totalNetWorthUsd: 5000,
      },
      activity30d: {
        professionQuests30d: 500,
        summons30d: 10,
        staminaUtilizationRate: 0.5,
        daysActive30d: 15,
      },
      accountAge: {
        accountAgeDays: 200,
      },
      behavior30d: {
        reinvestRatio30d: 0.1,
        netHeroDelta30d: -5,
        heavySellActivityFlag: 1,
      },
    };

    const result = computeBaseTierFromMetrics(snapshot);
    expect(result.debug.BHS).toBeLessThan(0);
    expect(result.debug.BHS_normalized).toBeLessThan(40);
  });
});
