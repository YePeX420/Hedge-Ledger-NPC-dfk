# Observation Bridge

This repo already has source capture for the DFK hunt companion, but the current pipeline is DFK-specific. The next step is to normalize every incoming signal into one shared graph so the extension, backend, React runtime probes, and future MCP or DevTools adapters can compare the same entity with the same IDs and provenance.

## Why a graph

The hunt companion does not just need raw events. It needs:

1. A stable way to name the same combatant, React component, DOM node, or MCP resource across sources.
2. Provenance for every fact so the UI can explain where a value came from.
3. Edges that show how one source derived from another source.
4. Confidence scores so the UI can surface disagreements instead of hiding them.

The shared contract lives in [`shared/observationGraph.ts`](../shared/observationGraph.ts).

## Current inputs in this repo

The repo already emits several capture streams:

| Source | Role today |
|---|---|
| `dfk_extension` | DFK battle log, turn snapshots, unit snapshots, and telemetry |
| `react_runtime` | Fiber-shaped runtime extraction from visible DOM nodes |
| `server` | Companion session storage, telemetry persistence, scoring, reconciliation |
| `browser_devtools` | Not implemented yet, but should become a structured adapter for the React DevTools side |
| `mcp` | Not implemented yet, but should become a Node-side adapter for any MCP server/client feed |

The important point is that each source should emit the same graph primitives, not its own one-off JSON format.

## Canonical graph shape

The shared schema has five main pieces:

1. `sources` - where the data came from
2. `nodes` - stable entities like combatants, components, requests, or documents
3. `edges` - relationships like `same_as`, `derived_from`, or `contains`
4. `facts` - scalar claims like HP, class name, slot index, or tool output
5. `documents` - grouped snapshots such as a turn frame, a React commit, or an MCP trace

The key design rule is that a node has a stable `key` and can carry multiple provenance entries. That lets the graph merge the same hero from DFK telemetry, React runtime state, and DevTools inspection without losing history.

## Adapter contract

Each adapter should follow the same contract:

```ts
import type { ObservationAdapter } from './shared/observationGraph';

const adapter: ObservationAdapter<MyPayload> = {
  id: 'react-devtools-fiber',
  label: 'React DevTools Fiber adapter',
  sourceKind: 'react_devtools',
  collect(payload, context) {
    return {
      source: { ... },
      nodes: [],
      edges: [],
      facts: [],
      documents: [],
    };
  },
};
```

The adapter returns a batch. The bridge layer merges that batch into the graph and keeps the original provenance attached to each node or fact.

## Current implementation status

The first bridge slice is now wired into the server:

1. `bot.js` creates graph-aware companion session state.
2. HTTP telemetry events and snapshots record observation batches into the shared graph.
3. WebSocket `state_snapshot` and `turn_event` messages do the same.
4. Reconciliation writes a graph document so stat diffs are also queryable.
5. Companion session responses now include an `observation_summary` payload with graph counts and the latest capture metadata.

## How the existing DFK pipeline maps

The repo already has useful capture stages:

1. `battle_log_event` becomes an event node plus fact entries for actor, target, ability, damage, and parse confidence.
2. `turn_snapshot` becomes a document with a combat-frame node and turn-order edges.
3. `unit_snapshot` becomes a node for the unit plus facts for stats and runtime combatant details.
4. `window.__dfkReactRuntime` output becomes component or fiber nodes with `derived_from` edges from the DOM source.
5. Network capture becomes request and response nodes with `observed_by` provenance on the same source.

That is enough to make the hunt companion act like a real analyzer instead of a pile of separate parsers.

## What still needs to be built

1. A DFK adapter that converts the current extension messages into graph batches.
2. A React DevTools adapter that reads component/fiber trees and emits the same node keys.
3. An MCP broker on the Node backend so local MCP clients or servers can publish into the graph.
4. A correlation layer that links graph nodes by stable keys and confidence thresholds.
5. A UI panel that can inspect provenance, compare sources, and explain disagreements.

## Recommended next implementation step

Start with the DFK adapter because it is already present in this repo. Once the DFK telemetry is expressed as graph batches, the MCP and DevTools sources can plug into the same merge path without changing the downstream UI.
