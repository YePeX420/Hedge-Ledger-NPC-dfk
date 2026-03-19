export const OBSERVATION_GRAPH_VERSION = 1 as const;

export type ObservationSourceKind =
  | 'dfk_extension'
  | 'react_runtime'
  | 'react_devtools'
  | 'mcp'
  | 'browser_devtools'
  | 'server'
  | 'manual';

export type ObservationTransportKind =
  | 'dom'
  | 'network'
  | 'http'
  | 'ws'
  | 'postMessage'
  | 'jsonrpc'
  | 'devtools'
  | 'filesystem'
  | 'manual'
  | 'unknown';

export type ObservationNodeKind =
  | 'entity'
  | 'event'
  | 'document'
  | 'field'
  | 'component'
  | 'fiber'
  | 'dom'
  | 'request'
  | 'response'
  | 'resource'
  | 'tool_call'
  | 'tool_result'
  | 'trace'
  | 'metric'
  | 'snapshot'
  | 'unknown';

export type ObservationEdgeKind =
  | 'contains'
  | 'derived_from'
  | 'observed_by'
  | 'references'
  | 'same_as'
  | 'precedes'
  | 'correlates_with'
  | 'parent_of'
  | 'child_of'
  | 'calls'
  | 'responds_to'
  | 'emits'
  | 'maps_to'
  | 'unknown';

export interface ObservationContext {
  sessionId?: string | null;
  huntId?: string | null;
  traceId?: string | null;
  graphId?: string | null;
  capturedAt?: number;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface ObservationSourceInput {
  id?: string;
  kind: ObservationSourceKind;
  label: string;
  transport?: ObservationTransportKind;
  origin?: string | null;
  capturedAt?: number;
  confidence?: number;
  metadata?: Record<string, unknown>;
}

export interface ObservationSource {
  id: string;
  kind: ObservationSourceKind;
  label: string;
  transport: ObservationTransportKind;
  origin: string | null;
  capturedAt: number;
  confidence: number;
  metadata: Record<string, unknown>;
}

export interface ObservationProvenanceInput {
  sourceId: string;
  capturedAt?: number;
  confidence?: number;
  path?: string | null;
  selector?: string | null;
  rawLabel?: string | null;
  metadata?: Record<string, unknown>;
}

export interface ObservationProvenance {
  sourceId: string;
  capturedAt: number;
  confidence: number;
  path: string | null;
  selector: string | null;
  rawLabel: string | null;
  metadata: Record<string, unknown>;
}

export interface ObservationNodeInput {
  id?: string;
  kind: ObservationNodeKind;
  key?: string;
  label: string;
  confidence?: number;
  aliases?: string[];
  tags?: string[];
  properties?: Record<string, unknown>;
  provenance?: ObservationProvenanceInput[];
  metadata?: Record<string, unknown>;
}

export interface ObservationNode {
  id: string;
  kind: ObservationNodeKind;
  key: string;
  label: string;
  confidence: number;
  aliases: string[];
  tags: string[];
  properties: Record<string, unknown>;
  provenance: ObservationProvenance[];
  metadata: Record<string, unknown>;
}

export interface ObservationEdgeInput {
  id?: string;
  kind: ObservationEdgeKind;
  from: string;
  to: string;
  label?: string | null;
  weight?: number;
  confidence?: number;
  evidence?: string[];
  provenance?: ObservationProvenanceInput[];
  metadata?: Record<string, unknown>;
}

export interface ObservationEdge {
  id: string;
  kind: ObservationEdgeKind;
  from: string;
  to: string;
  label: string | null;
  weight: number;
  confidence: number;
  evidence: string[];
  provenance: ObservationProvenance[];
  metadata: Record<string, unknown>;
}

export interface ObservationFactInput {
  id?: string;
  subjectId?: string | null;
  key: string;
  value: unknown;
  sourceId: string;
  path?: string | null;
  confidence?: number;
  metadata?: Record<string, unknown>;
}

export interface ObservationFact {
  id: string;
  subjectId: string | null;
  key: string;
  value: unknown;
  sourceId: string;
  path: string | null;
  confidence: number;
  metadata: Record<string, unknown>;
}

export interface ObservationDocumentInput {
  id?: string;
  kind: string;
  sourceId: string;
  title?: string | null;
  summary?: string | null;
  nodes?: string[];
  edges?: string[];
  facts?: string[];
  capturedAt?: number;
  confidence?: number;
  metadata?: Record<string, unknown>;
}

export interface ObservationDocument {
  id: string;
  kind: string;
  sourceId: string;
  title: string | null;
  summary: string | null;
  nodes: string[];
  edges: string[];
  facts: string[];
  capturedAt: number;
  confidence: number;
  metadata: Record<string, unknown>;
}

export interface ObservationBatch {
  source: ObservationSource;
  nodes?: ObservationNode[];
  edges?: ObservationEdge[];
  facts?: ObservationFact[];
  documents?: ObservationDocument[];
  metadata?: Record<string, unknown>;
}

export interface ObservationGraph {
  version: typeof OBSERVATION_GRAPH_VERSION;
  createdAt: number;
  sources: ObservationSource[];
  nodes: ObservationNode[];
  edges: ObservationEdge[];
  facts: ObservationFact[];
  documents: ObservationDocument[];
  metadata: Record<string, unknown>;
}

export interface ObservationGraphIndex {
  sourcesById: Map<string, ObservationSource>;
  nodesById: Map<string, ObservationNode>;
  nodesByKey: Map<string, ObservationNode[]>;
  edgesById: Map<string, ObservationEdge>;
  factsById: Map<string, ObservationFact>;
  documentsById: Map<string, ObservationDocument>;
}

export interface ObservationAdapterResult {
  batch: ObservationBatch;
  summary?: string;
}

export interface ObservationAdapter<TInput = unknown> {
  id: string;
  label: string;
  sourceKind: ObservationSourceKind;
  canHandle?: (input: TInput, context: ObservationContext) => boolean;
  collect: (input: TInput, context: ObservationContext) => ObservationAdapterResult | Promise<ObservationAdapterResult>;
}

function cloneMetadata(value?: Record<string, unknown> | null): Record<string, unknown> {
  return value ? { ...value } : {};
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.map((value) => String(value || '').trim()).filter(Boolean)));
}

function toTimestamp(value?: number | Date | string | null): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return Date.now();
}

export function clampConfidence(value?: number | null, fallback = 0.5): number {
  const candidate = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.max(0, Math.min(1, candidate));
}

export function normalizeObservationKey(value: unknown): string {
  const text = String(value ?? '').trim().toLowerCase();
  return text.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'unknown';
}

export function buildObservationId(prefix: string, parts: Array<unknown>): string {
  const stable = parts
    .map((part) => normalizeObservationKey(part))
    .filter((part) => part && part !== 'unknown')
    .join(':');

  if (stable) return `${prefix}:${stable}`;

  const random =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}:${random}`;
}

function defaultTransportForKind(kind: ObservationSourceKind): ObservationTransportKind {
  switch (kind) {
    case 'dfk_extension':
      return 'dom';
    case 'react_runtime':
      return 'dom';
    case 'react_devtools':
      return 'devtools';
    case 'mcp':
      return 'jsonrpc';
    case 'browser_devtools':
      return 'devtools';
    case 'server':
      return 'http';
    case 'manual':
    default:
      return 'manual';
  }
}

function mergeStringArrays(existing: string[], incoming: string[]): string[] {
  return uniqueStrings([...existing, ...incoming]);
}

function mergeMetadata(
  existing: Record<string, unknown>,
  incoming?: Record<string, unknown> | null,
): Record<string, unknown> {
  return incoming ? { ...existing, ...incoming } : { ...existing };
}

function normalizeProvenance(input: ObservationProvenanceInput[]): ObservationProvenance[] {
  return input.map((item) => ({
    sourceId: String(item.sourceId || '').trim(),
    capturedAt: toTimestamp(item.capturedAt),
    confidence: clampConfidence(item.confidence, 1),
    path: item.path ?? null,
    selector: item.selector ?? null,
    rawLabel: item.rawLabel ?? null,
    metadata: cloneMetadata(item.metadata),
  })).filter((item) => Boolean(item.sourceId));
}

function provenanceSignature(item: ObservationProvenance): string {
  return [
    item.sourceId,
    item.capturedAt,
    item.confidence,
    item.path ?? '',
    item.selector ?? '',
    item.rawLabel ?? '',
    JSON.stringify(item.metadata || {}),
  ].join('|');
}

function mergeProvenance(existing: ObservationProvenance[], incoming: ObservationProvenance[]): ObservationProvenance[] {
  const merged = [...existing];
  const seen = new Set(existing.map(provenanceSignature));

  for (const item of incoming) {
    const sig = provenanceSignature(item);
    if (seen.has(sig)) continue;
    seen.add(sig);
    merged.push(item);
  }

  return merged;
}

function nodeLookupKey(node: Pick<ObservationNode, 'kind' | 'key'>): string {
  return `${node.kind}:${node.key}`;
}

function edgeLookupKey(edge: Pick<ObservationEdge, 'kind' | 'from' | 'to' | 'label'>): string {
  return `${edge.kind}:${edge.from}:${edge.to}:${edge.label ?? ''}`;
}

function factLookupKey(fact: Pick<ObservationFact, 'subjectId' | 'key' | 'sourceId' | 'path'>): string {
  return `${fact.sourceId}:${fact.subjectId ?? ''}:${fact.key}:${fact.path ?? ''}`;
}

function documentLookupKey(doc: Pick<ObservationDocument, 'kind' | 'sourceId' | 'title'>): string {
  return `${doc.sourceId}:${doc.kind}:${doc.title ?? ''}`;
}

export function createObservationGraph(metadata: Record<string, unknown> = {}): ObservationGraph {
  return {
    version: OBSERVATION_GRAPH_VERSION,
    createdAt: Date.now(),
    sources: [],
    nodes: [],
    edges: [],
    facts: [],
    documents: [],
    metadata: cloneMetadata(metadata),
  };
}

export function createObservationSource(input: ObservationSourceInput): ObservationSource {
  const capturedAt = toTimestamp(input.capturedAt);
  return {
    id: input.id || buildObservationId('src', [input.kind, input.label, input.origin, capturedAt]),
    kind: input.kind,
    label: String(input.label || input.kind),
    transport: input.transport || defaultTransportForKind(input.kind),
    origin: input.origin ?? null,
    capturedAt,
    confidence: clampConfidence(input.confidence, 1),
    metadata: cloneMetadata(input.metadata),
  };
}

export function createObservationNode(input: ObservationNodeInput): ObservationNode {
  const label = String(input.label || input.key || input.kind);
  const key = normalizeObservationKey(input.key || label);
  const provenance = normalizeProvenance(input.provenance || []);
  return {
    id: input.id || buildObservationId('node', [input.kind, key, label]),
    kind: input.kind,
    key,
    label,
    confidence: clampConfidence(input.confidence, 0.5),
    aliases: uniqueStrings(input.aliases || []),
    tags: uniqueStrings(input.tags || []),
    properties: cloneMetadata(input.properties),
    provenance,
    metadata: cloneMetadata(input.metadata),
  };
}

export function createObservationEdge(input: ObservationEdgeInput): ObservationEdge {
  const provenance = normalizeProvenance(input.provenance || []);
  return {
    id: input.id || buildObservationId('edge', [input.kind, input.from, input.to, input.label]),
    kind: input.kind,
    from: String(input.from),
    to: String(input.to),
    label: input.label ?? null,
    weight: typeof input.weight === 'number' && Number.isFinite(input.weight) ? input.weight : 1,
    confidence: clampConfidence(input.confidence, 0.5),
    evidence: uniqueStrings(input.evidence || []),
    provenance,
    metadata: cloneMetadata(input.metadata),
  };
}

export function createObservationFact(input: ObservationFactInput): ObservationFact {
  return {
    id: input.id || buildObservationId('fact', [input.sourceId, input.subjectId, input.key, input.path]),
    subjectId: input.subjectId ?? null,
    key: normalizeObservationKey(input.key),
    value: input.value,
    sourceId: String(input.sourceId),
    path: input.path ?? null,
    confidence: clampConfidence(input.confidence, 0.5),
    metadata: cloneMetadata(input.metadata),
  };
}

export function createObservationDocument(input: ObservationDocumentInput): ObservationDocument {
  const capturedAt = toTimestamp(input.capturedAt);
  return {
    id: input.id || buildObservationId('doc', [input.kind, input.sourceId, input.title, capturedAt]),
    kind: String(input.kind || 'document'),
    sourceId: String(input.sourceId),
    title: input.title ?? null,
    summary: input.summary ?? null,
    nodes: uniqueStrings(input.nodes || []),
    edges: uniqueStrings(input.edges || []),
    facts: uniqueStrings(input.facts || []),
    capturedAt,
    confidence: clampConfidence(input.confidence, 0.5),
    metadata: cloneMetadata(input.metadata),
  };
}

export function mergeObservationSources(existing: ObservationSource, incoming: ObservationSource): ObservationSource {
  return {
    ...existing,
    ...incoming,
    id: existing.id,
    kind: existing.kind,
    label: incoming.label || existing.label,
    transport: incoming.transport || existing.transport,
    origin: incoming.origin ?? existing.origin,
    capturedAt: Math.max(existing.capturedAt, incoming.capturedAt),
    confidence: Math.max(existing.confidence, incoming.confidence),
    metadata: mergeMetadata(existing.metadata, incoming.metadata),
  };
}

export function mergeObservationNodes(existing: ObservationNode, incoming: ObservationNode): ObservationNode {
  return {
    ...existing,
    id: existing.id,
    kind: existing.kind,
    key: existing.key,
    label: incoming.label || existing.label,
    confidence: Math.max(existing.confidence, incoming.confidence),
    aliases: mergeStringArrays(existing.aliases, incoming.aliases),
    tags: mergeStringArrays(existing.tags, incoming.tags),
    properties: mergeMetadata(existing.properties, incoming.properties),
    provenance: mergeProvenance(existing.provenance, incoming.provenance),
    metadata: mergeMetadata(existing.metadata, incoming.metadata),
  };
}

export function mergeObservationEdges(existing: ObservationEdge, incoming: ObservationEdge): ObservationEdge {
  return {
    ...existing,
    id: existing.id,
    kind: existing.kind,
    from: existing.from,
    to: existing.to,
    label: incoming.label ?? existing.label,
    weight: incoming.weight ?? existing.weight,
    confidence: Math.max(existing.confidence, incoming.confidence),
    evidence: mergeStringArrays(existing.evidence, incoming.evidence),
    provenance: mergeProvenance(existing.provenance, incoming.provenance),
    metadata: mergeMetadata(existing.metadata, incoming.metadata),
  };
}

export function mergeObservationFacts(existing: ObservationFact, incoming: ObservationFact): ObservationFact {
  return {
    ...existing,
    id: existing.id,
    subjectId: incoming.subjectId ?? existing.subjectId,
    key: existing.key,
    value: incoming.value,
    sourceId: existing.sourceId,
    path: incoming.path ?? existing.path,
    confidence: Math.max(existing.confidence, incoming.confidence),
    metadata: mergeMetadata(existing.metadata, incoming.metadata),
  };
}

export function mergeObservationDocuments(existing: ObservationDocument, incoming: ObservationDocument): ObservationDocument {
  return {
    ...existing,
    id: existing.id,
    kind: existing.kind,
    sourceId: existing.sourceId,
    title: incoming.title ?? existing.title,
    summary: incoming.summary ?? existing.summary,
    nodes: mergeStringArrays(existing.nodes, incoming.nodes),
    edges: mergeStringArrays(existing.edges, incoming.edges),
    facts: mergeStringArrays(existing.facts, incoming.facts),
    capturedAt: Math.max(existing.capturedAt, incoming.capturedAt),
    confidence: Math.max(existing.confidence, incoming.confidence),
    metadata: mergeMetadata(existing.metadata, incoming.metadata),
  };
}

export function ingestObservationBatch(graph: ObservationGraph, batch: ObservationBatch): ObservationGraph {
  const source = createObservationSource(batch.source);
  const sourceIndex = graph.sources.findIndex((item) => item.id === source.id);

  if (sourceIndex >= 0) {
    graph.sources[sourceIndex] = mergeObservationSources(graph.sources[sourceIndex], source);
  } else {
    graph.sources.push(source);
  }

  graph.metadata = mergeMetadata(graph.metadata, batch.metadata);

  for (const node of batch.nodes || []) {
    const nextNode = createObservationNode(node);
    const existing = graph.nodes.find((candidate) => candidate.id === nextNode.id || nodeLookupKey(candidate) === nodeLookupKey(nextNode));
    if (existing) {
      const merged = mergeObservationNodes(existing, nextNode);
      Object.assign(existing, merged);
    } else {
      graph.nodes.push(nextNode);
    }
  }

  for (const edge of batch.edges || []) {
    const nextEdge = createObservationEdge(edge);
    const existing = graph.edges.find((candidate) => candidate.id === nextEdge.id || edgeLookupKey(candidate) === edgeLookupKey(nextEdge));
    if (existing) {
      const merged = mergeObservationEdges(existing, nextEdge);
      Object.assign(existing, merged);
    } else {
      graph.edges.push(nextEdge);
    }
  }

  for (const fact of batch.facts || []) {
    const nextFact = createObservationFact(fact);
    const existing = graph.facts.find((candidate) => candidate.id === nextFact.id || factLookupKey(candidate) === factLookupKey(nextFact));
    if (existing) {
      const merged = mergeObservationFacts(existing, nextFact);
      Object.assign(existing, merged);
    } else {
      graph.facts.push(nextFact);
    }
  }

  for (const document of batch.documents || []) {
    const nextDocument = createObservationDocument(document);
    const existing = graph.documents.find((candidate) => candidate.id === nextDocument.id || documentLookupKey(candidate) === documentLookupKey(nextDocument));
    if (existing) {
      const merged = mergeObservationDocuments(existing, nextDocument);
      Object.assign(existing, merged);
    } else {
      graph.documents.push(nextDocument);
    }
  }

  return graph;
}

export function mergeObservationGraphs(
  target: ObservationGraph,
  ...graphs: Array<ObservationGraph | null | undefined>
): ObservationGraph {
  for (const graph of graphs) {
    if (!graph) continue;
    target.metadata = mergeMetadata(target.metadata, graph.metadata);
    for (const source of graph.sources) {
      ingestObservationBatch(target, { source, metadata: graph.metadata });
    }
    for (const node of graph.nodes) {
      const sourceId = node.provenance[0]?.sourceId || graph.sources[0]?.id || 'unknown';
      ingestObservationBatch(target, {
        source: createObservationSource({
          id: sourceId,
          kind: graph.sources[0]?.kind || 'manual',
          label: graph.sources[0]?.label || 'merged',
          transport: graph.sources[0]?.transport || 'manual',
          origin: graph.sources[0]?.origin || null,
          capturedAt: graph.sources[0]?.capturedAt || graph.createdAt,
          confidence: graph.sources[0]?.confidence || 1,
          metadata: graph.metadata,
        }),
        nodes: [node],
        metadata: graph.metadata,
      });
    }
    for (const edge of graph.edges) {
      const sourceId = edge.provenance[0]?.sourceId || graph.sources[0]?.id || 'unknown';
      ingestObservationBatch(target, {
        source: createObservationSource({
          id: sourceId,
          kind: graph.sources[0]?.kind || 'manual',
          label: graph.sources[0]?.label || 'merged',
          transport: graph.sources[0]?.transport || 'manual',
          origin: graph.sources[0]?.origin || null,
          capturedAt: graph.sources[0]?.capturedAt || graph.createdAt,
          confidence: graph.sources[0]?.confidence || 1,
          metadata: graph.metadata,
        }),
        edges: [edge],
        metadata: graph.metadata,
      });
    }
    for (const fact of graph.facts) {
      ingestObservationBatch(target, {
        source: createObservationSource({
          id: fact.sourceId,
          kind: graph.sources[0]?.kind || 'manual',
          label: graph.sources[0]?.label || 'merged',
          transport: graph.sources[0]?.transport || 'manual',
          origin: graph.sources[0]?.origin || null,
          capturedAt: graph.sources[0]?.capturedAt || graph.createdAt,
          confidence: graph.sources[0]?.confidence || 1,
          metadata: graph.metadata,
        }),
        facts: [fact],
        metadata: graph.metadata,
      });
    }
    for (const document of graph.documents) {
      ingestObservationBatch(target, {
        source: createObservationSource({
          id: document.sourceId,
          kind: graph.sources[0]?.kind || 'manual',
          label: graph.sources[0]?.label || 'merged',
          transport: graph.sources[0]?.transport || 'manual',
          origin: graph.sources[0]?.origin || null,
          capturedAt: graph.sources[0]?.capturedAt || graph.createdAt,
          confidence: graph.sources[0]?.confidence || 1,
          metadata: graph.metadata,
        }),
        documents: [document],
        metadata: graph.metadata,
      });
    }
  }

  return target;
}

export function indexObservationGraph(graph: ObservationGraph): ObservationGraphIndex {
  const sourcesById = new Map<string, ObservationSource>();
  const nodesById = new Map<string, ObservationNode>();
  const nodesByKey = new Map<string, ObservationNode[]>();
  const edgesById = new Map<string, ObservationEdge>();
  const factsById = new Map<string, ObservationFact>();
  const documentsById = new Map<string, ObservationDocument>();

  for (const source of graph.sources) {
    sourcesById.set(source.id, source);
  }

  for (const node of graph.nodes) {
    nodesById.set(node.id, node);
    const key = nodeLookupKey(node);
    const list = nodesByKey.get(key) || [];
    list.push(node);
    nodesByKey.set(key, list);
  }

  for (const edge of graph.edges) {
    edgesById.set(edge.id, edge);
  }

  for (const fact of graph.facts) {
    factsById.set(fact.id, fact);
  }

  for (const document of graph.documents) {
    documentsById.set(document.id, document);
  }

  return {
    sourcesById,
    nodesById,
    nodesByKey,
    edgesById,
    factsById,
    documentsById,
  };
}
