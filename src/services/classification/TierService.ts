/**
 * TierService - Base Tier Assignment Formula (v1.0)
 * 
 * This file implements the Base Tier Assignment Formula for DFK Challenge Leagues.
 * 
 * Input: Cluster-level KPIs (all wallets linked to a single user)
 * Output: TierCode = COMMON | UNCOMMON | RARE | LEGENDARY | MYTHIC
 * 
 * The computeBaseTierFromMetrics() function is PURE and easy to test.
 * A higher-level computeBaseTierForCluster() can call it after
 * aggregating metrics from DB / on-chain ETL.
 */

import type { TierCode } from "../../api/contracts/leagues";

/* ---------------------------------------------
 *  Metric Input Types
 * --------------------------------------------- */

export interface HeroPowerMetrics {
  commonHeroes: number;
  uncommonHeroes: number;
  rareHeroes: number;
  legendaryHeroes: number;
  mythicHeroes: number;
  totalHeroLevels: number;
}

export interface WalletValueMetrics {
  totalNetWorthUsd: number;
}

export interface ActivityMetrics30d {
  professionQuests30d: number;
  summons30d: number;
  staminaUtilizationRate: number;
  daysActive30d: number;
}

export interface AccountAgeMetrics {
  accountAgeDays: number;
}

export interface BehaviorHealthMetrics30d {
  reinvestRatio30d: number;
  netHeroDelta30d: number;
  heavySellActivityFlag: 0 | 1;
}

export interface ClusterKpiSnapshot {
  heroPower: HeroPowerMetrics;
  walletValue: WalletValueMetrics;
  activity30d: ActivityMetrics30d;
  accountAge: AccountAgeMetrics;
  behavior30d: BehaviorHealthMetrics30d;
}

export interface TierComputationDebug {
  HPS: number;
  WVS: number;
  AS: number;
  AAS: number;
  BHS: number;
  HPS_normalized: number;
  WVS_normalized: number;
  AS_normalized: number;
  AAS_normalized: number;
  BHS_normalized: number;
  CPS: number;
}

export interface TierComputationResult {
  tier: TierCode;
  cps: number;
  debug: TierComputationDebug;
}

/* ---------------------------------------------
 *  Internal Helper Functions
 * --------------------------------------------- */

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function safeLog10Plus1(x: number): number {
  const v = Math.max(0, x);
  return Math.log10(1 + v);
}

/* ---------------------------------------------
 *  COMPONENT CALCULATIONS
 * --------------------------------------------- */

/**
 * Hero Power Score (HPS)
 * 
 * HPS =
 *   (1 × Common heroes)
 * + (2 × Uncommon heroes)
 * + (4 × Rare heroes)
 * + (8 × Legendary heroes)
 * + (12 × Mythic heroes)
 * + (0.1 × total hero levels)
 */
function computeHPS(hero: HeroPowerMetrics): number {
  const {
    commonHeroes,
    uncommonHeroes,
    rareHeroes,
    legendaryHeroes,
    mythicHeroes,
    totalHeroLevels,
  } = hero;

  return (
    1 * commonHeroes +
    2 * uncommonHeroes +
    4 * rareHeroes +
    8 * legendaryHeroes +
    12 * mythicHeroes +
    0.1 * totalHeroLevels
  );
}

/**
 * Wallet Value Score (WVS)
 * 
 * WVS = log10(1 + total_networth_usd)
 */
function computeWVS(wallet: WalletValueMetrics): number {
  return safeLog10Plus1(wallet.totalNetWorthUsd);
}

/**
 * Activity Score (AS)
 * 
 * AS =
 *   (0.03 × total profession quests 30d)
 * + (0.1 × summons 30d)
 * + (0.02 × staminaUtilizationRate × 100)
 * + (0.5 × days_active_last_30d)
 */
function computeAS(activity: ActivityMetrics30d): number {
  const { professionQuests30d, summons30d, staminaUtilizationRate, daysActive30d } = activity;

  return (
    0.03 * professionQuests30d +
    0.1 * summons30d +
    0.02 * staminaUtilizationRate * 100 +
    0.5 * daysActive30d
  );
}

/**
 * Account Age Score (AAS)
 * 
 * AAS =
 *  if age_days < 30: 0
 *  if 30 ≤ age_days < 90: 1
 *  if 90 ≤ age_days < 180: 2
 *  if 180 ≤ age_days < 365: 3
 *  if age_days ≥ 365: 4
 */
function computeAAS(age: AccountAgeMetrics): number {
  const d = age.accountAgeDays;

  if (d < 30) return 0;
  if (d < 90) return 1;
  if (d < 180) return 2;
  if (d < 365) return 3;
  return 4;
}

/**
 * Behavior Health Score (BHS)
 * 
 * BHS =
 *   2 × reinvest_ratio_30d
 * + 1 × positive_delta_heroes
 * - 2 × heavy_sell_activity_flag
 * 
 * positive_delta_heroes is a 0/1 flag derived from netHeroDelta30d > 0.
 */
function computeBHS(behavior: BehaviorHealthMetrics30d): number {
  const { reinvestRatio30d, netHeroDelta30d, heavySellActivityFlag } = behavior;

  const safeReinvestRatio = clamp(reinvestRatio30d, 0, 1);
  const positiveDeltaHeroes = netHeroDelta30d > 0 ? 1 : 0;

  return (
    2 * safeReinvestRatio +
    1 * positiveDeltaHeroes -
    2 * heavySellActivityFlag
  );
}

/* ---------------------------------------------
 *  NORMALIZATION
 * --------------------------------------------- */

function normalizeHPS(HPS: number): number {
  return clamp((HPS / 2500) * 100, 0, 100);
}

function normalizeWVS(WVS: number): number {
  return clamp((WVS / 5.0) * 100, 0, 100);
}

function normalizeAS(AS: number): number {
  return clamp((AS / 300) * 100, 0, 100);
}

function normalizeAAS(AAS: number): number {
  return clamp((AAS / 4) * 100, 0, 100);
}

function normalizeBHS(BHS: number): number {
  return clamp(((BHS + 2) / 5) * 100, 0, 100);
}

/* ---------------------------------------------
 *  CPS + TIER MAPPING
 * --------------------------------------------- */

/**
 * Composite Power Score (CPS)
 * 
 * CPS =
 *   (0.40 × HPS_normalized)
 * + (0.25 × WVS_normalized)
 * + (0.20 × AS_normalized)
 * + (0.10 × AAS_normalized)
 * + (0.05 × BHS_normalized)
 */
function computeCPS(
  HPS_norm: number,
  WVS_norm: number,
  AS_norm: number,
  AAS_norm: number,
  BHS_norm: number
): number {
  const CPS =
    0.4 * HPS_norm +
    0.25 * WVS_norm +
    0.2 * AS_norm +
    0.1 * AAS_norm +
    0.05 * BHS_norm;

  return clamp(CPS, 0, 100);
}

/**
 * Map CPS to TierCode:
 * 
 * if CPS < 20:      COMMON
 * else if < 40:     UNCOMMON
 * else if < 60:     RARE
 * else if < 80:     LEGENDARY
 * else:             MYTHIC
 */
function mapCpsToTierCode(CPS: number): TierCode {
  if (CPS < 20) return "COMMON";
  if (CPS < 40) return "UNCOMMON";
  if (CPS < 60) return "RARE";
  if (CPS < 80) return "LEGENDARY";
  return "MYTHIC";
}

/* ---------------------------------------------
 *  PUBLIC API
 * --------------------------------------------- */

/**
 * PURE function: given a cluster KPI snapshot (already aggregated across
 * all wallets belonging to the same user), compute the base league tier.
 */
export function computeBaseTierFromMetrics(
  snapshot: ClusterKpiSnapshot
): TierComputationResult {
  const HPS = computeHPS(snapshot.heroPower);
  const WVS = computeWVS(snapshot.walletValue);
  const AS = computeAS(snapshot.activity30d);
  const AAS = computeAAS(snapshot.accountAge);
  const BHS = computeBHS(snapshot.behavior30d);

  const HPS_normalized = normalizeHPS(HPS);
  const WVS_normalized = normalizeWVS(WVS);
  const AS_normalized = normalizeAS(AS);
  const AAS_normalized = normalizeAAS(AAS);
  const BHS_normalized = normalizeBHS(BHS);

  const CPS = computeCPS(
    HPS_normalized,
    WVS_normalized,
    AS_normalized,
    AAS_normalized,
    BHS_normalized
  );

  const tier = mapCpsToTierCode(CPS);

  const debug: TierComputationDebug = {
    HPS,
    WVS,
    AS,
    AAS,
    BHS,
    HPS_normalized,
    WVS_normalized,
    AS_normalized,
    AAS_normalized,
    BHS_normalized,
    CPS,
  };

  return {
    tier,
    cps: CPS,
    debug,
  };
}

/**
 * Create a default/empty ClusterKpiSnapshot for cases where data is missing.
 */
export function createEmptySnapshot(): ClusterKpiSnapshot {
  return {
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
}

/**
 * Higher-level helper (optional):
 *  - Resolve clusterKey for a user
 *  - Aggregate metrics from DB / ETL
 *  - Then call computeBaseTierFromMetrics()
 * 
 * NOTE: This is a stub - backend should implement the actual DB calls.
 */
export async function computeBaseTierForCluster(
  clusterKey: string
): Promise<TierComputationResult> {
  // TODO: Replace with real data source.
  // This is just a placeholder shape to guide implementation.
  const placeholderSnapshot = createEmptySnapshot();

  // In production, build the snapshot from your existing challenge/KPI engine.
  return computeBaseTierFromMetrics(placeholderSnapshot);
}
