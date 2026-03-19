import {
  buildObservationId,
  createObservationDocument,
  createObservationEdge,
  createObservationFact,
  createObservationGraph,
  createObservationNode,
  createObservationSource,
  ingestObservationBatch,
  normalizeObservationKey,
  type ObservationBatch,
  type ObservationDocument,
  type ObservationEdge,
  type ObservationFact,
  type ObservationGraph,
  type ObservationNode,
  type ObservationProvenanceInput,
  type ObservationSource,
  type ObservationTransportKind,
} from '../shared/observationGraph.ts';

const COMPANION_SCOPE = 'companion-session';

export interface CompanionObservationSummary {
  graphVersion: number;
  sourceCount: number;
  nodeCount: number;
  edgeCount: number;
  factCount: number;
  documentCount: number;
  sourceKinds: Record<string, number>;
  nodeKinds: Record<string, number>;
  edgeKinds: Record<string, number>;
  documentKinds: Record<string, number>;
  latestCapturedAt: number;
  lastSessionId: string | number | null;
  lastHuntId: string | number | null;
  lastHuntSessionId: string | number | null;
  lastChannel: string | null;
  lastSourceId: string | null;
  lastSourceKind: string | null;
  lastSourceLabel: string | null;
  lastTransport: ObservationTransportKind | null;
  lastDocumentId: string | null;
  lastDocumentKind: string | null;
  lastDocumentTitle: string | null;
  lastSummary: string | null;
}

export interface CompanionSessionState {
  clients: Set<unknown>;
  turnEvents: unknown[];
  heroStates: unknown[] | null;
  enemyId: string | null;
  battleBudgetRemaining: number | null;
  consumableQuantities: Record<string, unknown>;
  latestFrame: unknown | null;
  rawFrames: unknown[];
  lastActiveHeroSlot?: number | null;
  observationGraph?: ObservationGraph;
  observationSummary?: CompanionObservationSummary | null;
}

export interface ObservationBatchContext {
  sessionId: string | number | null;
  transport: ObservationTransportKind;
  channel: string;
  huntId?: string | number | null;
  huntSessionId?: string | number | null;
  capturedAt?: number;
  origin?: string | null;
  label?: string;
  metadata?: Record<string, unknown>;
}

export interface ObservationBatchResult {
  batch: ObservationBatch;
  summary: string;
}

export interface TurnEventObservationInput extends ObservationBatchContext {
  turnNumber: number | null;
  actor?: unknown;
  actorSide?: string | null;
  actorSlot?: number | null;
  target?: unknown;
  targets?: unknown;
  ability?: string | null;
  skillId?: string | null;
  damage?: number | null;
  manaDelta?: number | null;
  effects?: unknown;
  rawText?: string | null;
  activeHeroSlot?: number | null;
  battleBudgetRemaining?: number | null;
  consumableQuantities?: Record<string, unknown> | null;
  hpState?: unknown;
  mpState?: unknown;
  legalActions?: unknown;
  combatFrame?: unknown;
}

export interface StateSnapshotObservationInput extends ObservationBatchContext {
  turnNumber?: number | null;
  heroes?: unknown;
  enemies?: unknown;
  fullState?: Record<string, unknown> | null;
  enemyId?: string | null;
  wallet?: string | null;
  activeHeroSlot?: number | null;
  battleBudgetRemaining?: number | null;
  consumableQuantities?: Record<string, unknown> | null;
  combatFrame?: unknown;
}

export interface UnitSnapshotObservationInput extends ObservationBatchContext {
  unitName: string;
  unitSide: string;
  position?: number | null;
  heroId?: string | number | null;
  stats: Record<string, unknown>;
  baseStats?: Record<string, unknown> | null;
  items?: unknown[] | null;
  capturedAtTurn?: number | null;
  snapshotId?: string | number | null;
}

export interface ReconciliationObservationInput extends ObservationBatchContext {
  snapshotId?: string | number | null;
  unitName?: string | null;
  unitSide?: string | null;
  heroId?: string | number | null;
  position?: number | null;
  diffCount: number;
  hasEquipment?: boolean;
  diffs?: Array<{
    field?: string;
    observed?: unknown;
    expected?: unknown;
    delta?: unknown;
    suspectedCause?: string | null;
  }>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function cloneRecord<T extends Record<string, unknown> | null | undefined>(value: T): Record<string, unknown> {
  return isRecord(value) ? { ...value } : {};
}

function lastOf<T>(values: T[] | null | undefined): T | null {
  return values && values.length > 0 ? values[values.length - 1] : null;
}

function toTimestamp(value?: number | string | Date | null): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return Date.now();
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (isRecord(value)) return Object.values(value);
  if (value == null) return [];
  return [value];
}

function describeValue(value: unknown, fallback: string): string {
  if (value == null) return fallback;
  if (typeof value === 'string') return value.trim() || fallback;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return `${value.length} items`;
  if (isRecord(value)) {
    const candidate =
      value.label ??
      value.name ??
      value.unitName ??
      value.heroName ??
      value.enemyName ??
      value.id ??
      value.heroId ??
      value.enemyId ??
      value.unitId ??
      value.slot ??
      value.position;
    return candidate != null ? String(candidate) : fallback;
  }
  return fallback;
}

function resolveEntityLabel(value: unknown, prefix: string, index: number): string {
  if (value == null) return `${prefix} ${index + 1}`;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (isRecord(value)) {
    return String(
      value.label ??
        value.name ??
        value.unitName ??
        value.heroName ??
        value.enemyName ??
        value.id ??
        value.heroId ??
        value.enemyId ??
        value.unitId ??
        value.slot ??
        value.position ??
        `${prefix} ${index + 1}`,
    );
  }
  return `${prefix} ${index + 1}`;
}

function resolveEntityIdentity(value: unknown, prefix: string, index: number): string {
  if (value == null) return `${prefix}:${index}`;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return `${prefix}:${String(value)}`;
  }
  if (isRecord(value)) {
    const candidate =
      value.id ??
      value.heroId ??
      value.unitId ??
      value.enemyId ??
      value.name ??
      value.label ??
      value.unitName ??
      value.heroName ??
      value.enemyName ??
      value.slot ??
      value.position ??
      `${prefix}:${index}`;
    return `${prefix}:${candidate}`;
  }
  return `${prefix}:${index}`;
}

function pickFields(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (!isRecord(value)) return {};
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    if (value[key] !== undefined) {
      result[key] = value[key];
    }
  }
  return result;
}

function pickPrimitiveMap(value: unknown, limit = 12): Record<string, unknown> {
  if (!isRecord(value)) return {};
  const result: Record<string, unknown> = {};
  for (const [key, candidate] of Object.entries(value)) {
    if (Object.keys(result).length >= limit) break;
    if (
      candidate == null ||
      typeof candidate === 'string' ||
      typeof candidate === 'number' ||
      typeof candidate === 'boolean'
    ) {
      result[key] = candidate;
    }
  }
  return result;
}

function readMetadataValue(metadata: Record<string, unknown> | undefined, key: string): unknown {
  return metadata ? metadata[key] : undefined;
}

function readMetadataIdentity(metadata: Record<string, unknown> | undefined, key: string): string | number | null {
  const value = readMetadataValue(metadata, key);
  if (value == null) return null;
  if (typeof value === 'string' || typeof value === 'number') return value;
  return String(value);
}

function collectPrimitiveFacts(
  subjectId: string,
  sourceId: string,
  value: unknown,
  pathPrefix: string,
  confidence = 0.75,
  limit = 16,
): ObservationFact[] {
  if (!isRecord(value)) return [];
  const facts: ObservationFact[] = [];
  for (const [key, candidate] of Object.entries(value)) {
    if (facts.length >= limit) break;
    const path = pathPrefix ? `${pathPrefix}.${key}` : key;
    if (candidate == null) continue;
    if (
      typeof candidate === 'string' ||
      typeof candidate === 'number' ||
      typeof candidate === 'boolean'
    ) {
      facts.push(
        createObservationFact({
          subjectId,
          sourceId,
          key,
          value: candidate,
          path,
          confidence,
          metadata: { pathPrefix },
        }),
      );
      continue;
    }
    if (Array.isArray(candidate)) {
      facts.push(
        createObservationFact({
          subjectId,
          sourceId,
          key: `${key}_count`,
          value: candidate.length,
          path,
          confidence: Math.min(confidence, 0.6),
          metadata: { pathPrefix, valueType: 'array' },
        }),
      );
    }
  }
  return facts;
}

function countBy<T>(values: T[], selector: (value: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) {
    const key = selector(value);
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function summarizeObservationGraph(graph: ObservationGraph): CompanionObservationSummary {
  const timestamps = [
    graph.createdAt,
    ...graph.sources.map((source) => source.capturedAt),
    ...graph.documents.map((document) => document.capturedAt),
  ].filter((value): value is number => typeof value === 'number' && Number.isFinite(value));

  return {
    graphVersion: graph.version,
    sourceCount: graph.sources.length,
    nodeCount: graph.nodes.length,
    edgeCount: graph.edges.length,
    factCount: graph.facts.length,
    documentCount: graph.documents.length,
    sourceKinds: countBy(graph.sources, (source) => source.kind),
    nodeKinds: countBy(graph.nodes, (node) => node.kind),
    edgeKinds: countBy(graph.edges, (edge) => edge.kind),
    documentKinds: countBy(graph.documents, (document) => document.kind),
    latestCapturedAt: timestamps.length > 0 ? Math.max(...timestamps) : graph.createdAt,
    lastSessionId: null,
    lastHuntId: null,
    lastHuntSessionId: null,
    lastChannel: null,
    lastSourceId: null,
    lastSourceKind: null,
    lastSourceLabel: null,
    lastTransport: null,
    lastDocumentId: null,
    lastDocumentKind: null,
    lastDocumentTitle: null,
    lastSummary: null,
  };
}

function ensureGraph(session: CompanionSessionState): ObservationGraph {
  if (!session.observationGraph) {
    session.observationGraph = createObservationGraph({ scope: COMPANION_SCOPE });
  }
  if (!session.observationSummary) {
    session.observationSummary = summarizeObservationGraph(session.observationGraph);
  }
  return session.observationGraph;
}

function createSourceProvenance(source: ObservationSource, path: string, rawLabel?: string | null): ObservationProvenanceInput {
  return {
    sourceId: source.id,
    capturedAt: source.capturedAt,
    confidence: source.confidence,
    path,
    selector: path,
    rawLabel: rawLabel ?? source.label,
    metadata: cloneRecord(source.metadata),
  };
}

function createCompanionSource(input: ObservationBatchContext): ObservationSource {
  const capturedAt = input.capturedAt ?? Date.now();
  const label =
    input.label ||
    (input.transport === 'ws'
      ? `DFK Companion ${input.channel.replace(/_/g, ' ')}`
      : `DFK Telemetry ${input.channel.replace(/_/g, ' ')}`);
  const origin =
    input.origin ||
    (input.transport === 'ws' ? '/ws/companion' : `/api/dfk/${input.channel}`);
  return createObservationSource({
    id: buildObservationId('src', ['companion', input.sessionId ?? 'session', input.transport, input.channel]),
    kind: 'dfk_extension',
    label,
    transport: input.transport,
    origin,
    capturedAt,
    confidence: 0.95,
    metadata: {
      sessionId: input.sessionId ?? null,
      huntId: input.huntId ?? null,
      huntSessionId: input.huntSessionId ?? null,
      channel: input.channel,
      transport: input.transport,
      ...cloneRecord(input.metadata),
    },
  });
}

const ENTITY_PROPERTY_KEYS = [
  'id',
  'heroId',
  'unitId',
  'enemyId',
  'name',
  'label',
  'heroName',
  'unitName',
  'enemyName',
  'side',
  'unitSide',
  'actorSide',
  'targetSide',
  'position',
  'slot',
  'actorSlot',
  'level',
  'hp',
  'mp',
  'maxHp',
  'maxMp',
  'damage',
  'manaDelta',
  'status',
  'state',
  'skillId',
  'ability',
  'huntId',
  'wallet',
  'turnNumber',
  'capturedAtTurn',
] as const;

const STAT_PROPERTY_KEYS = [
  'str',
  'dex',
  'agi',
  'int',
  'wis',
  'vit',
  'end',
  'lck',
  'strength',
  'dexterity',
  'agility',
  'intelligence',
  'wisdom',
  'vitality',
  'endurance',
  'luck',
  'hp',
  'mp',
  'maxHp',
  'maxMp',
] as const;

function buildEntityCollection(
  values: unknown,
  prefix: string,
  source: ObservationSource,
  parentId?: string | null,
  extraProperties: Record<string, unknown> = {},
  edgeLabel?: string | null,
  confidence = 0.75,
): {
  nodes: ObservationNode[];
  edges: ObservationEdge[];
  entries: Array<{ node: ObservationNode; item: unknown; index: number; label: string; properties: Record<string, unknown> }>;
  labels: string[];
} {
  const nodes: ObservationNode[] = [];
  const edges: ObservationEdge[] = [];
  const entries: Array<{ node: ObservationNode; item: unknown; index: number; label: string; properties: Record<string, unknown> }> = [];
  const labels: string[] = [];
  const sourceChannel = String(readMetadataValue(source.metadata, 'channel') ?? prefix);
  const provenance = createSourceProvenance(source, `${sourceChannel}.${prefix}`);

  for (const [index, item] of asArray(values).entries()) {
    if (item == null) continue;
    const identity = resolveEntityIdentity(item, prefix, index);
    const label = resolveEntityLabel(item, prefix, index);
    const properties: Record<string, unknown> = {
      index,
      ...pickFields(item, ENTITY_PROPERTY_KEYS),
      ...extraProperties,
    };
    if (isRecord(item)) {
      const stats = pickFields(item.stats, STAT_PROPERTY_KEYS);
      if (Object.keys(stats).length > 0) properties.stats = stats;
      const baseStats = pickFields(item.baseStats, STAT_PROPERTY_KEYS);
      if (Object.keys(baseStats).length > 0) properties.baseStats = baseStats;
      if (Array.isArray(item.items)) properties.itemCount = item.items.length;
    }

    const node = createObservationNode({
      kind: 'entity',
      key: `${prefix}:${identity}`,
      label,
      confidence,
      provenance: [
        {
          ...provenance,
          path: `${sourceChannel}.${prefix}[${index}]`,
          rawLabel: label,
        },
      ],
      tags: [prefix],
      properties,
      metadata: {
        index,
        prefix,
      },
    });

    nodes.push(node);
    entries.push({ node, item, index, label, properties });
    labels.push(label);

    if (parentId) {
      edges.push(
        createObservationEdge({
          kind: 'contains',
          from: parentId,
          to: node.id,
          label: edgeLabel ?? prefix,
          confidence: Math.min(1, confidence + 0.1),
          provenance: [
            {
              ...provenance,
              path: `${sourceChannel}.${prefix}[${index}]`,
              rawLabel: label,
            },
          ],
        }),
      );
    }
  }

  return { nodes, edges, entries, labels };
}

function turnEventSummary(input: TurnEventObservationInput, actorLabel: string | null, targetLabels: string[]): string {
  const pieces = [`Turn ${input.turnNumber ?? 'unknown'}`];
  if (actorLabel) pieces.push(actorLabel);
  else if (input.actorSide) pieces.push(`(${input.actorSide})`);
  if (input.ability || input.skillId) pieces.push(`used ${input.ability || input.skillId}`);
  if (targetLabels.length > 0) pieces.push(`on ${targetLabels.slice(0, 3).join(', ')}`);
  if (typeof input.damage === 'number') pieces.push(`for ${input.damage} damage`);
  if (typeof input.manaDelta === 'number') pieces.push(`mana ${input.manaDelta >= 0 ? '+' : ''}${input.manaDelta}`);
  return pieces.join(' ');
}

function stateSnapshotSummary(input: StateSnapshotObservationInput, heroLabels: string[], enemyLabels: string[]): string {
  const pieces = [
    input.turnNumber != null ? `Turn ${input.turnNumber}` : 'State snapshot',
    `${heroLabels.length} heroes`,
    `${enemyLabels.length} enemies`,
  ];
  if (enemyLabels.length > 0) pieces.push(`enemy ${enemyLabels[0]}`);
  if (input.huntId != null) pieces.push(`hunt ${input.huntId}`);
  return pieces.join(', ');
}

function unitSnapshotSummary(input: UnitSnapshotObservationInput, factCount: number): string {
  const pieces = [`Unit ${input.unitName}`, `(${input.unitSide})`];
  if (input.position != null) pieces.push(`at position ${input.position}`);
  if (factCount > 0) pieces.push(`with ${factCount} facts`);
  return pieces.join(' ');
}

function reconciliationSummary(input: ReconciliationObservationInput): string {
  const pieces = ['Reconciliation'];
  if (input.unitName) pieces.push(`for ${input.unitName}`);
  if (input.snapshotId != null) pieces.push(`snapshot ${input.snapshotId}`);
  pieces.push(`${input.diffCount} diffs`);
  return pieces.join(' ');
}

function finalizeObservationBatch(
  source: ObservationSource,
  summary: string,
  extra: Partial<ObservationBatch> = {},
  metadata: Record<string, unknown> = {},
): ObservationBatchResult {
  const document = lastOf(extra.documents || null);
  return {
    batch: {
      source,
      nodes: extra.nodes || [],
      edges: extra.edges || [],
      facts: extra.facts || [],
      documents: extra.documents || [],
      metadata: {
        channel: readMetadataValue(source.metadata, 'channel') ?? null,
        sessionId: readMetadataValue(source.metadata, 'sessionId') ?? null,
        huntId: readMetadataValue(source.metadata, 'huntId') ?? null,
        huntSessionId: readMetadataValue(source.metadata, 'huntSessionId') ?? null,
        ...cloneRecord(metadata),
      },
    },
    summary: summary || document?.summary || source.label,
  };
}

export function createCompanionSessionState(initial: Partial<CompanionSessionState> = {}): CompanionSessionState {
  const graph = initial.observationGraph || createObservationGraph({ scope: COMPANION_SCOPE });
  const session: CompanionSessionState = {
    clients: new Set(),
    turnEvents: [],
    heroStates: null,
    enemyId: null,
    battleBudgetRemaining: null,
    consumableQuantities: {},
    latestFrame: null,
    rawFrames: [],
    observationGraph: graph,
    observationSummary: summarizeObservationGraph(graph),
  };

  return {
    ...session,
    ...initial,
    observationGraph: initial.observationGraph || graph,
    observationSummary: initial.observationSummary || summarizeObservationGraph(initial.observationGraph || graph),
  };
}

export function getCompanionObservationSummary(
  session: Pick<CompanionSessionState, 'observationGraph' | 'observationSummary'> | null | undefined,
): CompanionObservationSummary | null {
  if (!session) return null;
  return session.observationSummary || (session.observationGraph ? summarizeObservationGraph(session.observationGraph) : null);
}

export function recordCompanionObservation(
  session: CompanionSessionState,
  batch: ObservationBatch,
  summary?: string,
): CompanionObservationSummary {
  const graph = ensureGraph(session);
  ingestObservationBatch(graph, batch);

  const document = lastOf(batch.documents || null);
  const batchMetadata = batch.metadata || {};
  const batchChannel = readMetadataIdentity(batchMetadata, 'channel');
  const batchSessionId = readMetadataIdentity(batchMetadata, 'sessionId');
  const batchHuntId = readMetadataIdentity(batchMetadata, 'huntId');
  const batchHuntSessionId = readMetadataIdentity(batchMetadata, 'huntSessionId');
  const nextSummary = {
    ...summarizeObservationGraph(graph),
    latestCapturedAt: batch.source.capturedAt,
    lastSessionId: batchSessionId ?? readMetadataIdentity(batch.source.metadata, 'sessionId'),
    lastHuntId: batchHuntId ?? readMetadataIdentity(batch.source.metadata, 'huntId'),
    lastHuntSessionId: batchHuntSessionId ?? readMetadataIdentity(batch.source.metadata, 'huntSessionId'),
    lastChannel: batchChannel != null ? String(batchChannel) : null,
    lastSourceId: batch.source.id,
    lastSourceKind: batch.source.kind,
    lastSourceLabel: batch.source.label,
    lastTransport: batch.source.transport,
    lastDocumentId: document?.id ?? null,
    lastDocumentKind: document?.kind ?? null,
    lastDocumentTitle: document?.title ?? null,
    lastSummary: summary || document?.summary || null,
  };

  session.observationSummary = nextSummary;
  return nextSummary;
}

export function buildTurnEventObservationBatch(input: TurnEventObservationInput): ObservationBatchResult {
  const source = createCompanionSource({
    sessionId: input.sessionId,
    transport: input.transport,
    channel: input.channel,
    huntId: input.huntId ?? null,
    huntSessionId: input.huntSessionId ?? null,
    capturedAt: input.capturedAt,
    origin: input.origin,
    label:
      input.label ||
      (input.transport === 'ws' ? 'DFK Companion Turn Event' : 'DFK Telemetry Turn Event'),
    metadata: cloneRecord(input.metadata),
  });
  const provenance = createSourceProvenance(source, `${input.channel}.turn_event`);
  const turnKey = [
    input.turnNumber ?? 'unknown',
    input.actorSide ?? 'unknown',
    input.actorSlot ?? 'na',
    input.skillId || input.ability || 'action',
    input.rawText ? normalizeObservationKey(input.rawText).slice(0, 48) : describeValue(input.target ?? input.targets, 'target'),
  ];
  const eventNode = createObservationNode({
    kind: 'event',
    key: `turn:${turnKey.map((part) => normalizeObservationKey(part)).join(':')}`,
    label: `Turn ${input.turnNumber ?? 'unknown'}`,
    confidence: 0.92,
    provenance: [{ ...provenance, rawLabel: `turn ${input.turnNumber ?? 'unknown'}` }],
    tags: ['turn_event', input.transport],
    properties: {
      turnNumber: input.turnNumber,
      actorSide: input.actorSide ?? null,
      actorSlot: input.actorSlot ?? null,
      ability: input.ability ?? input.skillId ?? null,
      skillId: input.skillId ?? null,
      damage: input.damage ?? null,
      manaDelta: input.manaDelta ?? null,
      activeHeroSlot: input.activeHeroSlot ?? null,
      battleBudgetRemaining: input.battleBudgetRemaining ?? null,
      targetCount: asArray(input.targets ?? input.target).length,
      effectCount: asArray(input.effects).length,
      hpStateCount: isRecord(input.hpState) ? Object.keys(input.hpState).length : 0,
      mpStateCount: isRecord(input.mpState) ? Object.keys(input.mpState).length : 0,
      legalActionCount: asArray(input.legalActions).length,
      rawText: input.rawText ?? null,
      hasCombatFrame: !!input.combatFrame,
    },
    metadata: {
      channel: input.channel,
      transport: input.transport,
    },
  });

  const nodes: ObservationNode[] = [eventNode];
  const edges: ObservationEdge[] = [];
  const facts: ObservationFact[] = [];

  facts.push(
    ...collectPrimitiveFacts(
      eventNode.id,
      source.id,
      {
        turnNumber: input.turnNumber,
        damage: input.damage,
        manaDelta: input.manaDelta,
        activeHeroSlot: input.activeHeroSlot,
        battleBudgetRemaining: input.battleBudgetRemaining,
      },
      'turn',
      0.85,
      8,
    ),
  );

  const actorCollection = buildEntityCollection(
    input.actor,
    'actor',
    source,
    eventNode.id,
    {
      actorSide: input.actorSide ?? null,
      actorSlot: input.actorSlot ?? null,
      battleBudgetRemaining: input.battleBudgetRemaining ?? null,
    },
    'references',
    0.78,
  );
  nodes.push(...actorCollection.nodes);
  edges.push(...actorCollection.edges);
  for (const entry of actorCollection.entries) {
    facts.push(...collectPrimitiveFacts(entry.node.id, source.id, entry.properties, `actor[${entry.index}]`, 0.72, 8));
  }

  const targetCollection = buildEntityCollection(
    input.targets ?? input.target,
    'target',
    source,
    eventNode.id,
    {
      actorSide: input.actorSide ?? null,
    },
    'references',
    0.72,
  );
  nodes.push(...targetCollection.nodes);
  edges.push(...targetCollection.edges);
  for (const entry of targetCollection.entries) {
    facts.push(...collectPrimitiveFacts(entry.node.id, source.id, entry.properties, `target[${entry.index}]`, 0.7, 8));
  }

  const actorLabel = lastOf(actorCollection.labels) ?? null;
  const targetLabels = targetCollection.labels;
  const summary = turnEventSummary(input, actorLabel, targetLabels);

  const document = createObservationDocument({
    kind: `${input.transport}_turn_event`,
    sourceId: source.id,
    title: `Turn ${input.turnNumber ?? 'unknown'}`,
    summary,
    nodes: nodes.map((node) => node.id),
    edges: edges.map((edge) => edge.id),
    facts: facts.map((fact) => fact.id),
    capturedAt: source.capturedAt,
    confidence: 0.9,
    metadata: {
      ...cloneRecord(input.metadata),
      turnNumber: input.turnNumber ?? null,
      actorSide: input.actorSide ?? null,
      actorSlot: input.actorSlot ?? null,
      targetCount: targetLabels.length,
      effectCount: asArray(input.effects).length,
      rawText: input.rawText ?? null,
      hasCombatFrame: !!input.combatFrame,
    },
  });

  return finalizeObservationBatch(
    source,
    summary,
    { nodes, edges, facts, documents: [document] },
    {
      ...cloneRecord(input.metadata),
      turnNumber: input.turnNumber ?? null,
      actorSide: input.actorSide ?? null,
      actorSlot: input.actorSlot ?? null,
      targetCount: targetLabels.length,
      effectCount: asArray(input.effects).length,
    },
  );
}

export function buildStateSnapshotObservationBatch(input: StateSnapshotObservationInput): ObservationBatchResult {
  const source = createCompanionSource({
    sessionId: input.sessionId,
    transport: input.transport,
    channel: input.channel,
    huntId: input.huntId ?? null,
    huntSessionId: input.huntSessionId ?? null,
    capturedAt: input.capturedAt,
    origin: input.origin,
    label:
      input.label ||
      (input.transport === 'ws' ? 'DFK Companion State Snapshot' : 'DFK Telemetry State Snapshot'),
    metadata: cloneRecord(input.metadata),
  });
  const provenance = createSourceProvenance(source, `${input.channel}.state_snapshot`);
  const state = isRecord(input.fullState)
    ? input.fullState
    : {
        heroes: input.heroes ?? [],
        enemies: input.enemies ?? [],
        enemyId: input.enemyId ?? null,
        wallet: input.wallet ?? null,
        activeHeroSlot: input.activeHeroSlot ?? null,
        battleBudgetRemaining: input.battleBudgetRemaining ?? null,
        consumableQuantities: input.consumableQuantities ?? null,
      };
  const heroes = input.heroes ?? state.heroes ?? [];
  const enemies = input.enemies ?? state.enemies ?? [];
  const heroCollection = buildEntityCollection(
    heroes,
    'hero',
    source,
    null,
    {
      side: 'player',
      huntId: input.huntId ?? null,
      wallet: input.wallet ?? null,
    },
    'contains',
    0.78,
  );
  const enemyCollection = buildEntityCollection(
    enemies,
    'enemy',
    source,
    null,
    {
      side: 'enemy',
      huntId: input.huntId ?? null,
    },
    'contains',
    0.78,
  );

  const snapshotIdentity = normalizeObservationKey(
    [input.sessionId ?? 'session', input.huntId ?? 'hunt', input.turnNumber ?? 'latest', input.channel].join(':'),
  );

  const snapshotNode = createObservationNode({
    kind: 'snapshot',
    key: `state:${snapshotIdentity}`,
    label: input.turnNumber != null ? `Turn ${input.turnNumber} Snapshot` : 'State Snapshot',
    confidence: 0.95,
    provenance: [{ ...provenance, rawLabel: 'state snapshot' }],
    tags: ['state_snapshot', input.transport],
    properties: {
      turnNumber: input.turnNumber ?? null,
      heroCount: heroCollection.labels.length,
      enemyCount: enemyCollection.labels.length,
      enemyId: input.enemyId ?? (isRecord(state) ? (state.enemyId as string | null) ?? null : null),
      wallet: input.wallet ?? (isRecord(state) ? (state.wallet as string | null) ?? null : null),
      activeHeroSlot: input.activeHeroSlot ?? null,
      battleBudgetRemaining: input.battleBudgetRemaining ?? null,
      consumableCount: Object.keys(pickPrimitiveMap(input.consumableQuantities ?? state.consumableQuantities)).length,
      hasCombatFrame: !!input.combatFrame,
      stateKeyCount: isRecord(state) ? Object.keys(state).length : 0,
    },
    metadata: {
      channel: input.channel,
      transport: input.transport,
    },
  });

  const nodes: ObservationNode[] = [snapshotNode, ...heroCollection.nodes, ...enemyCollection.nodes];
  const edges: ObservationEdge[] = [...heroCollection.edges, ...enemyCollection.edges];
  const facts: ObservationFact[] = [];

  facts.push(
    ...collectPrimitiveFacts(
      snapshotNode.id,
      source.id,
      {
        turnNumber: input.turnNumber,
        heroCount: heroCollection.labels.length,
        enemyCount: enemyCollection.labels.length,
        battleBudgetRemaining: input.battleBudgetRemaining,
        activeHeroSlot: input.activeHeroSlot,
      },
      'snapshot',
      0.85,
      8,
    ),
  );

  for (const entry of heroCollection.entries) {
    facts.push(...collectPrimitiveFacts(entry.node.id, source.id, entry.properties, `hero[${entry.index}]`, 0.7, 8));
    if (isRecord(entry.item) && isRecord(entry.item.stats)) {
      facts.push(...collectPrimitiveFacts(entry.node.id, source.id, entry.item.stats, `hero[${entry.index}].stats`, 0.7, 12));
    }
    if (isRecord(entry.item) && isRecord(entry.item.baseStats)) {
      facts.push(...collectPrimitiveFacts(entry.node.id, source.id, entry.item.baseStats, `hero[${entry.index}].baseStats`, 0.7, 12));
    }
  }

  for (const entry of enemyCollection.entries) {
    facts.push(...collectPrimitiveFacts(entry.node.id, source.id, entry.properties, `enemy[${entry.index}]`, 0.7, 8));
    if (isRecord(entry.item) && isRecord(entry.item.stats)) {
      facts.push(...collectPrimitiveFacts(entry.node.id, source.id, entry.item.stats, `enemy[${entry.index}].stats`, 0.7, 12));
    }
  }

  const summary = stateSnapshotSummary(input, heroCollection.labels, enemyCollection.labels);
  const document = createObservationDocument({
    kind: `${input.transport}_state_snapshot`,
    sourceId: source.id,
    title: input.turnNumber != null ? `Turn ${input.turnNumber} Snapshot` : 'State Snapshot',
    summary,
    nodes: nodes.map((node) => node.id),
    edges: edges.map((edge) => edge.id),
    facts: facts.map((fact) => fact.id),
    capturedAt: source.capturedAt,
    confidence: 0.92,
    metadata: {
      ...cloneRecord(input.metadata),
      turnNumber: input.turnNumber ?? null,
      heroCount: heroCollection.labels.length,
      enemyCount: enemyCollection.labels.length,
      enemyId: input.enemyId ?? null,
      wallet: input.wallet ?? null,
      hasCombatFrame: !!input.combatFrame,
    },
  });

  return finalizeObservationBatch(
    source,
    summary,
    { nodes, edges, facts, documents: [document] },
    {
      ...cloneRecord(input.metadata),
      turnNumber: input.turnNumber ?? null,
      heroCount: heroCollection.labels.length,
      enemyCount: enemyCollection.labels.length,
      enemyId: input.enemyId ?? null,
    },
  );
}

export function buildUnitSnapshotObservationBatch(input: UnitSnapshotObservationInput): ObservationBatchResult {
  const source = createCompanionSource({
    sessionId: input.sessionId,
    transport: input.transport,
    channel: input.channel,
    huntId: input.huntId ?? null,
    huntSessionId: input.huntSessionId ?? null,
    capturedAt: input.capturedAt,
    origin: input.origin,
    label:
      input.label ||
      (input.transport === 'ws' ? 'DFK Companion Unit Snapshot' : 'DFK Telemetry Unit Snapshot'),
    metadata: cloneRecord(input.metadata),
  });
  const provenance = createSourceProvenance(source, `${input.channel}.unit_snapshot`);
  const unitIdentity = resolveEntityIdentity(
    {
      name: input.unitName,
      unitName: input.unitName,
      unitSide: input.unitSide,
      heroId: input.heroId ?? null,
      position: input.position ?? null,
      capturedAtTurn: input.capturedAtTurn ?? null,
    },
    'unit',
    0,
  );
  const unitProperties: Record<string, unknown> = {
    unitName: input.unitName,
    unitSide: input.unitSide,
    position: input.position ?? null,
    heroId: input.heroId ?? null,
    capturedAtTurn: input.capturedAtTurn ?? null,
    itemCount: input.items?.length ?? 0,
    stats: pickFields(input.stats, STAT_PROPERTY_KEYS),
    baseStats: pickFields(input.baseStats, STAT_PROPERTY_KEYS),
  };

  const snapshotNode = createObservationNode({
    kind: 'snapshot',
    key: `unit_snapshot:${normalizeObservationKey(unitIdentity)}`,
    label: `${input.unitName} Snapshot`,
    confidence: 0.95,
    provenance: [{ ...provenance, rawLabel: `${input.unitName} snapshot` }],
    tags: ['unit_snapshot', input.unitSide],
    properties: unitProperties,
    metadata: {
      channel: input.channel,
      transport: input.transport,
      snapshotId: input.snapshotId ?? null,
    },
  });

  const unitNode = createObservationNode({
    kind: 'entity',
    key: `unit:${normalizeObservationKey(unitIdentity)}`,
    label: input.unitName,
    confidence: 0.9,
    provenance: [{ ...provenance, rawLabel: input.unitName }],
    tags: ['unit', input.unitSide],
    properties: unitProperties,
    metadata: {
      channel: input.channel,
      transport: input.transport,
      snapshotId: input.snapshotId ?? null,
    },
  });

  const nodes: ObservationNode[] = [snapshotNode, unitNode];
  const edges: ObservationEdge[] = [
    createObservationEdge({
      kind: 'contains',
      from: snapshotNode.id,
      to: unitNode.id,
      label: 'unit',
      confidence: 0.95,
      provenance: [{ ...provenance, rawLabel: input.unitName }],
    }),
  ];
  const facts: ObservationFact[] = [];

  facts.push(
    ...collectPrimitiveFacts(
      unitNode.id,
      source.id,
      {
        unitName: input.unitName,
        unitSide: input.unitSide,
        position: input.position,
        heroId: input.heroId,
        capturedAtTurn: input.capturedAtTurn,
        itemCount: input.items?.length ?? 0,
      },
      'unit',
      0.8,
      10,
    ),
  );
  facts.push(...collectPrimitiveFacts(unitNode.id, source.id, input.stats, 'unit.stats', 0.85, 24));
  if (input.baseStats) {
    facts.push(...collectPrimitiveFacts(unitNode.id, source.id, input.baseStats, 'unit.baseStats', 0.85, 24));
  }

  const summary = unitSnapshotSummary(input, facts.length);
  const document = createObservationDocument({
    kind: `${input.transport}_unit_snapshot`,
    sourceId: source.id,
    title: `${input.unitName} Snapshot`,
    summary,
    nodes: nodes.map((node) => node.id),
    edges: edges.map((edge) => edge.id),
    facts: facts.map((fact) => fact.id),
    capturedAt: source.capturedAt,
    confidence: 0.93,
    metadata: {
      ...cloneRecord(input.metadata),
      snapshotId: input.snapshotId ?? null,
      capturedAtTurn: input.capturedAtTurn ?? null,
      heroId: input.heroId ?? null,
      itemCount: input.items?.length ?? 0,
    },
  });

  return finalizeObservationBatch(
    source,
    summary,
    { nodes, edges, facts, documents: [document] },
    {
      ...cloneRecord(input.metadata),
      snapshotId: input.snapshotId ?? null,
      capturedAtTurn: input.capturedAtTurn ?? null,
      heroId: input.heroId ?? null,
    },
  );
}

export function buildReconciliationObservationBatch(input: ReconciliationObservationInput): ObservationBatchResult {
  const source = createCompanionSource({
    sessionId: input.sessionId,
    transport: input.transport,
    channel: input.channel,
    huntId: input.huntId ?? null,
    huntSessionId: input.huntSessionId ?? null,
    capturedAt: input.capturedAt,
    origin: input.origin,
    label: input.label || 'DFK Reconciliation',
    metadata: cloneRecord(input.metadata),
  });
  const provenance = createSourceProvenance(source, `${input.channel}.reconcile`);
  const reconciliationNode = createObservationNode({
    kind: 'metric',
    key: `reconcile:${normalizeObservationKey([
      input.snapshotId ?? 'snapshot',
      input.unitName ?? 'unit',
      input.unitSide ?? 'side',
    ].join(':'))}`,
    label: input.unitName ? `Reconcile ${input.unitName}` : 'Reconciliation',
    confidence: 0.94,
    provenance: [{ ...provenance, rawLabel: 'reconciliation' }],
    tags: ['reconciliation', input.unitSide ?? 'unknown'],
    properties: {
      snapshotId: input.snapshotId ?? null,
      unitName: input.unitName ?? null,
      unitSide: input.unitSide ?? null,
      heroId: input.heroId ?? null,
      position: input.position ?? null,
      diffCount: input.diffCount,
      hasEquipment: !!input.hasEquipment,
    },
    metadata: {
      channel: input.channel,
      transport: input.transport,
    },
  });

  const nodes: ObservationNode[] = [reconciliationNode];
  const edges: ObservationEdge[] = [];
  const facts: ObservationFact[] = [];

  facts.push(
    ...collectPrimitiveFacts(
      reconciliationNode.id,
      source.id,
      {
        diffCount: input.diffCount,
        heroId: input.heroId,
        position: input.position,
      },
      'reconcile',
      0.85,
      8,
    ),
  );

  for (const [index, diff] of (input.diffs || []).entries()) {
    facts.push(
      createObservationFact({
        subjectId: reconciliationNode.id,
        sourceId: source.id,
        key: diff.field || `diff_${index}`,
        value: {
          observed: diff.observed ?? null,
          expected: diff.expected ?? null,
          delta: diff.delta ?? null,
          suspectedCause: diff.suspectedCause ?? null,
        },
        path: `diffs[${index}]`,
        confidence: 0.9,
        metadata: {
          index,
          field: diff.field ?? null,
        },
      }),
    );
  }

  const summary = reconciliationSummary(input);
  const document = createObservationDocument({
    kind: `${input.transport}_reconciliation`,
    sourceId: source.id,
    title: input.unitName ? `Reconcile ${input.unitName}` : 'Reconciliation',
    summary,
    nodes: nodes.map((node) => node.id),
    edges: edges.map((edge) => edge.id),
    facts: facts.map((fact) => fact.id),
    capturedAt: source.capturedAt,
    confidence: 0.92,
    metadata: {
      ...cloneRecord(input.metadata),
      snapshotId: input.snapshotId ?? null,
      unitName: input.unitName ?? null,
      unitSide: input.unitSide ?? null,
      heroId: input.heroId ?? null,
      diffCount: input.diffCount,
      hasEquipment: !!input.hasEquipment,
    },
  });

  return finalizeObservationBatch(
    source,
    summary,
    { nodes, edges, facts, documents: [document] },
    {
      ...cloneRecord(input.metadata),
      snapshotId: input.snapshotId ?? null,
      unitName: input.unitName ?? null,
      unitSide: input.unitSide ?? null,
      heroId: input.heroId ?? null,
      diffCount: input.diffCount,
      hasEquipment: !!input.hasEquipment,
    },
  );
}
