# Hedge Ledger User Dashboard (MVP)

## Purpose
Admin-only dashboard for inspecting a single player's cached profile and toggling per-user Hedge settings. This view is launched from the Users list and avoids live on-chain RPC calls by using stored profile and snapshot data.

## Backend
- **GET `/api/user/summary/:discordId`**
  - Admin-only (reuses `isAdmin`).
  - Aggregates `players.profileData`, latest `wallet_snapshots`, recent `garden_optimizations`, and `user_settings` rows.
  - Returns cached DFK snapshot values (balances, LP totals, hero counts) plus flags/behavior tags and recent optimization metadata. No external RPC is invoked.
- **PATCH `/api/user/settings/:discordId`**
  - Admin-only settings update. Accepts `notifyOnAprDrop` and/or `notifyOnNewOptimization` booleans, upserts into `user_settings`.
- **Schema**
  - New `user_settings` table keyed by `player_id` with notification toggles and timestamps.

## Frontend
- New route `/admin/users/:discordId/dashboard` renders `AdminUserDashboard` using React Query key `["/api/user/summary", discordId]`.
- Dashboard shows Discord + wallet info, cached DFK snapshot metrics, recent optimization history, and Hedge Settings toggles.
- Settings toggles optimistically update UI and call the PATCH endpoint; the user summary query is invalidated on success.
- Users table rows now navigate to the dashboard route for impersonation/inspection.
