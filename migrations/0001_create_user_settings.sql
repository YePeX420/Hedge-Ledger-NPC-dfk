-- Create user_settings table for admin dashboard notification preferences
CREATE TABLE IF NOT EXISTS "user_settings" (
  "id" serial PRIMARY KEY,
  "player_id" integer NOT NULL REFERENCES "players"("id"),
  "notify_on_apr_drop" boolean NOT NULL DEFAULT false,
  "notify_on_new_optimization" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_settings_player_id_idx" ON "user_settings" ("player_id");
