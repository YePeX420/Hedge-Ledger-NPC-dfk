export const CombatSkillFields = [
  "class",
  "tier",
  "skill_points",
  "discipline",
  "ability",
  "description_raw",
  "summary",
  "range",
  "mana_cost",
  "mana_growth",
  "dod",
  "tags",
  "source_url",
  "last_seen_at",
  "codex_score",
  "synergy_notes",
  "recommended_roles",
] as const;

export type CombatSkillField = (typeof CombatSkillFields)[number];
