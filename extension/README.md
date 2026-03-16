# Hedge Ledger — DFK Hunt Companion Extension

A Chrome extension that captures live DeFi Kingdoms hunt combat state and streams it to the Hedge Ledger backend for real-time recommendations, stat debugging, and reconciliation.

---

## Loading the Extension

1. Open Chrome and go to `chrome://extensions`
2. Enable **Developer mode** (toggle in the top-right corner)
3. Click **Load unpacked**
4. Select the `/extension` folder from this repository
5. The extension icon should appear in your Chrome toolbar

---

## Pairing with Hedge Ledger

1. Open the Hedge Ledger dashboard and go to **Hunt Companion** (`/admin/hunt-companion` or `/user/hunt-companion`)
2. Click **Create Session** — this generates a session token
3. Click the Hedge Ledger extension icon in Chrome
4. Paste your session token into the **Session Token** field and click **Save**
5. Set the **Backend Host** to your Hedge Ledger URL (e.g. `https://your-app.replit.app`) and click **Set**
6. The status dot should turn **blue** (Active) once the connection is established

---

## Permissions Explained

| Permission | Why |
|---|---|
| `storage` | Stores your session token, host URL, debug mode flag, and the last 100 captured snapshots locally |
| `tabs` | Used to open the companion page and to forward messages to content scripts |
| `scripting` | Required by Manifest V3 for content script access |
| Host permissions for `game.defikingdoms.com` | Injects the capture content script into DFK game pages |
| Host permissions for your Hedge Ledger domain | Allows the background worker to POST events and reconcile requests |

---

## How It Works

### Normal Mode
- Visit a DFK Void Hunt battle page at `game.defikingdoms.com`
- The extension automatically detects the battle log and begins capturing turn events
- Events stream to the backend via WebSocket (primary) or HTTP POST (fallback if socket is down)
- The companion page on Hedge Ledger updates in real time with turn events and **action recommendations**
- The **Recommendation card** in the popup shows the best move/target, score, reason tags, and a second-best alternative — updated each turn

### HTTP Fallback
- If the WebSocket is unavailable, events are queued locally
- The **Queue** counter in the popup shows how many events are pending
- Events flush automatically when the socket reconnects or via HTTP POST to `/api/dfk/telemetry/event`

---

## Debug Mode

Toggle **Debug Mode** in the popup.

When enabled:
- The popup shows a scrollable list of the last 30 captured events with timestamps and parse confidence scores:
  - **Green** ≥ 80% confidence (extracted from a structured DOM attribute)
  - **Amber** ≥ 50% confidence (extracted via regex from text)
  - **Red** < 50% confidence (low confidence or missing field)
- Parse failures are listed below the event log
- **Export JSON** — downloads the full local snapshot log (last 100 events) as a `.json` file
- **Copy Latest** — copies the most recent snapshot to your clipboard
- **Clear** — clears local snapshot storage

Each event in debug mode also includes `_debug` metadata with the DOM selector and raw matched string used for each field, accessible in the exported JSON.

---

## Reconcile Mode

Toggle **Reconcile Mode** in the popup.

When enabled, a **Reconcile** section appears at the bottom.

1. In the DFK game, open a hero or enemy stat panel (click on a unit)
2. The extension automatically captures the visible stats
3. Click **Reconcile Current Panel** in the popup
4. The extension sends the observed stats to `/api/dfk/reconcile` on the backend
5. The backend computes expected values from its formula logic and returns a diff table:

| Field | Observed | Expected | Delta | Suspected Cause |
|---|---|---|---|---|
| pDef | 101 | 113 | -12 | missing equipment modifier |

- **Green rows** — values match
- **Amber rows** — small delta (< 10)
- **Red rows** — large delta (≥ 10)

---

## Backend API Contract

The extension communicates with these endpoints:

### WebSocket (primary transport)
- **Connect to**: `wss://<host>/ws/companion`
- **Send on connect**: `{ type: "join", sessionToken: "..." }`
- **Send on turn**: `{ type: "turn_event", huntId, turnNumber, actorSide, actorSlot, skillId, targets, hpState, mpState, effects, legalActions, activeHeroSlot }`
- **Send on HP update**: `{ type: "state_snapshot", heroes: [{slot, hp, mp, maxHp, maxMp}], enemyId, huntId }`
- **Receive**: `{ type: "recommendation", recommendations: [{rank, skillName, targetType, targetSlot, totalScore, damageEv, killChance, survivalDelta, debuffValue, manaEfficiency, reasoning}] }`
- **Receive**: `{ type: "turn_state", battleState: { turnNumber, activeHeroSlot, heroes, enemies } }`

### HTTP fallback (when WebSocket unavailable)
- `POST /api/dfk/telemetry/event` — individual battle log events (requires `sessionToken` in body)
- `POST /api/dfk/telemetry/snapshot` — unit or turn snapshots (requires `sessionToken` in body)

### Reconciliation
- `POST /api/dfk/reconcile` — `{ sessionToken, unitSnapshot }` → `{ observed, expected, diffs, notes }`

---

## Supported Pages

The content script runs on all `game.defikingdoms.com` pages. It activates automatically when it detects a battle log container or stat panel in the DOM. No manual activation required.

---

## Test Mode (Mock Data)

To test without a live DFK hunt, open the browser console on any `game.defikingdoms.com` page and run:

```javascript
// Simulate a battle log entry
window.__dfkEmitEvent('battle_log_event', {
  type: 'battle_log_event',
  turn: 1,
  actor: 'Davion Greenlaugh',
  actorSide: 'player',
  actorPosition: 'P1',
  ability: 'Mighty Strike',
  target: 'Baby Boar 1',
  targetSide: 'enemy',
  damage: 217,
  manaDelta: -19,
  effects: [],
  rawText: 'Davion Greenlaugh uses Mighty Strike on Baby Boar 1 for 217 damage.',
  capturedAt: Date.now(),
  parseConfidence: 0.85,
});

// Simulate a unit snapshot (stat panel)
window.__dfkEmitEvent('unit_snapshot', {
  type: 'unit_snapshot',
  unitName: 'Davion Greenlaugh',
  unitSide: 'player',
  level: 22,
  stats: { hp: 1240, maxHp: 1400, mp: 80, maxMp: 120, atk: 88, pDef: 101, mDef: 55, speed: 47 },
  baseStats: { str: 14, dex: 8, agi: 9, int: 5, wis: 6, vit: 12, end: 11, lck: 7 },
  buffs: [], debuffs: [], traits: [], abilities: ['Mighty Strike', 'Iron Will'],
  capturedAt: Date.now(),
  parseConfidence: 0.9,
});
```
