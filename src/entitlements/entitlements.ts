import { db } from "../../server/db";
import { entitlementRules } from "@shared/schema";
import { and, eq } from "drizzle-orm";

export type UserTier = "free" | "premium" | "premium_plus";

export type EntitlementResult = {
  tier: UserTier;
  allowFields: Set<string>;
  flags: Record<string, boolean>;
};

export async function getEntitlements(
  domain: string,
  resource: string,
  tier: UserTier
): Promise<EntitlementResult> {
  const rows = await db
    .select({
      mode: entitlementRules.mode,
      rule: entitlementRules.rule,
    })
    .from(entitlementRules)
    .where(
      and(
        eq(entitlementRules.domain, domain),
        eq(entitlementRules.resource, resource),
        eq(entitlementRules.tierId, tier)
      )
    );

  const allowFields = new Set<string>();
  const flags: Record<string, boolean> = {};

  for (const r of rows) {
    if (r.mode === "fields_allowlist") {
      const ruleObj = r.rule as { fields?: string[] };
      const fields = ruleObj?.fields;
      if (Array.isArray(fields)) {
        fields.forEach((f: string) => allowFields.add(f));
      }
    }
    if (r.mode === "feature_flags") {
      const ruleObj = r.rule as { flags?: Record<string, boolean> };
      const f = ruleObj?.flags;
      if (f && typeof f === "object") {
        for (const [k, v] of Object.entries(f)) {
          flags[k] = !!v;
        }
      }
    }
  }

  return { tier, allowFields, flags };
}

export function shapeObjectByAllowlist(
  obj: Record<string, unknown>,
  allowFields: Set<string>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of allowFields) {
    if (obj[k] !== undefined) {
      out[k] = obj[k];
    }
  }
  return out;
}
