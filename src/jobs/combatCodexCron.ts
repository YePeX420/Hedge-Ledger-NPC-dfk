import cron from "node-cron";
import { ingestCombatCodex } from "../dfk/combatCodexIngestor";

export function startCombatCodexCron() {
  cron.schedule(
    "0 3 * * *",
    async () => {
      try {
        console.log("[combat-codex] nightly ingest start");
        const r = await ingestCombatCodex({ discover: true, concurrency: 3 });
        console.log("[combat-codex] nightly ingest done", r);
      } catch (e: any) {
        console.error("[combat-codex] nightly ingest failed", e?.message ?? e);
      }
    },
    { timezone: "America/Puerto_Rico" }
  );
  console.log("[combat-codex] Nightly cron scheduled for 03:00 America/Puerto_Rico");
}
