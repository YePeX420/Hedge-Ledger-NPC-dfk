// wallet-snapshot-job.js
// Daily background job to build dfkSnapshot for all players with a wallet.

import cron from "node-cron";
import { db } from "./server/db.js";
import { players } from "./shared/schema.ts";
import { eq } from "drizzle-orm";
import { buildPlayerSnapshot } from "./snapshot-service.js";

let task = null;

/**
 * Start the daily snapshot cron job.
 * Default: run at 03:00 UTC (configurable via SNAPSHOT_CRON env var).
 */
export async function startSnapshotJob() {
  if (task) {
    console.log("[SnapshotJob] Already started.");
    return;
  }

  const cronExpr = process.env.SNAPSHOT_CRON || "0 3 * * *";

  task = cron.schedule(
    cronExpr,
    async () => {
      console.log(`[SnapshotJob] Running daily snapshot job at ${new Date().toISOString()} (cron: ${cronExpr})`);

      try {
        const allPlayers = await db.select().from(players);
        console.log(`[SnapshotJob] Found ${allPlayers.length} players.`);

        for (const p of allPlayers) {
          if (!p.primaryWallet) continue;

          const wallet = p.primaryWallet.toLowerCase();
          console.log(`[SnapshotJob] Building snapshot for ${p.discordUsername || p.discordId} / ${wallet}`);

          try {
            const snapshot = await buildPlayerSnapshot(wallet);

            // Merge into profileData JSON
            let profileData = {};
            try {
              if (p.profileData) {
                profileData =
                  typeof p.profileData === "string"
                    ? JSON.parse(p.profileData)
                    : p.profileData;
              }
            } catch (err) {
              console.warn(
                `[SnapshotJob] Failed to parse profileData for player ${p.id}:`,
                err.message
              );
              profileData = {};
            }

            profileData.dfkSnapshot = snapshot;
            profileData.dfkSnapshotUpdatedAt = snapshot.updatedAt;

            await db
              .update(players)
              .set({ profileData: JSON.stringify(profileData) })
              .where(eq(players.id, p.id));

            console.log(
              `[SnapshotJob] ✅ Snapshot saved for ${p.discordUsername || p.discordId}`
            );
          } catch (err) {
            console.error(
              `[SnapshotJob] ❌ Error building snapshot for player ${p.id}:`,
              err.message
            );
          }
        }

        console.log("[SnapshotJob] Completed daily snapshot job.");
      } catch (err) {
        console.error("[SnapshotJob] Fatal error:", err);
      }
    },
    {
      timezone: "UTC",
    }
  );

  task.start();
  console.log("[SnapshotJob] Started with cron:", cronExpr);
}

/**
 * Stop the daily snapshot cron job.
 */
export async function stopSnapshotJob() {
  if (task) {
    task.stop();
    task = null;
    console.log("[SnapshotJob] Stopped.");
  }
}

