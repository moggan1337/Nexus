/**
 * Core Types for Nexus Knowledge Graph
 * Defines the fundamental data structures for the federated knowledge graph
 */

// ============================================================================
// Entity Types
// ============================================================================

/**
 * Unique identifier for entities using ULID for sortability
 */
export type EntityId = string;

/**
 * Entity representing a node in the knowledge graph
 */
export interface Entity {
  id: EntityId;
  type: EntityType;
  label: string;
  properties: Record<string, PropertyValue>;
  embeddings: Embeddings;
  metadata: EntityMetadata;
  timestamps: Timestamps;
}

export type EntityType = 
  | 'concept'
  | 'person'
  | 'organization'
  | 'location'
  | 'event'
  | 'document'
  | 'resource'
  | 'custom';

/**
 * Property value types supported in the knowledge graph
 */
export type PropertyValue = 
  | string
  | number
  | boolean
  | null
  | string[]
  | number[]
  | Date
  | PropertyValue
  | Record<string, PropertyValue>;

/**
 * Vector embeddings for semantic search
 */
export interface Embeddings {
  dense: number[];
  sparse?: Record<number, number>;
  metadata?: {
    model: string;
    dimensions: number;
    generatedAt: Date;
  };
}

/**
 * Metadata for entity tracking
 */
export interface EntityMetadata {
  createdBy: string;
  lastModifiedBy: string;
  version: number;
  tags: string[];
  aliases: string[];
  confidence: number;
  source?: string;
  language?: string;
}

/**
 * Timestamps for CRDT operations
 */
export interface Timestamps {
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
}

// ============================================================================
// Relation Types
// ============================================================================

/**
 * Unique identifier for relations
 */
export type RelationId = string;

/**
 * Relation (edge) between entities in the knowledge graph
 */
export interface Relation {
  id: RelationId;
  sourceId: EntityId;
  targetId: EntityId;
  type: RelationType;
  properties: Record<string, PropertyValue>;
  weight: number;
  metadata: RelationMetadata;
  timestamps: Timestamps;
}

export type RelationType =
  | 'owns'
  | 'manages'
  | 'part_of'
  | 'located_in'
  | 'created_by'
  | 'related_to'
  | 'depends_on'
  | 'implements'
  | 'extends'
  | 'references'
  | 'causes'
  | 'precedes'
  | 'custom';

/**
 * Metadata for relations
 */
export interface RelationMetadata {
  bidirectional: boolean;
  confidence: number;
  source?: string;
  evidence?: string[];
  provenance?: string;
}

// ============================================================================
// Graph Types
// ============================================================================

/**
 * Complete knowledge graph structure
 */
export interface KnowledgeGraph {
  id: string;
  name: string;
  description: string;
  entities: Map<EntityId, Entity>;
  relations: Map<RelationId, Relation>;
  index: GraphIndex;
  metadata: GraphMetadata;
}

/**
 * Metadata for the entire graph
 */
export interface GraphMetadata {
  version: string;
  createdAt: Date;
  updatedAt: Date;
  nodeCount: number;
  edgeCount: number;
  partitions: string[];
}

/**
 * Index structures for efficient querying
 */
export interface GraphIndex {
  byType: Map<EntityType, Set<EntityId>>;
  byRelationType: Map<RelationType, Set<RelationId>>;
  byProperty: Map<string, Map<PropertyValue, Set<EntityId>>>;
  byTag: Map<string, Set<EntityId>>;
  spatial?: SpatialIndex;
}

/**
 * Spatial index for geo-queries
 */
export interface SpatialIndex {
  bounds: BoundingBox;
  quadtree: QuadTree;
}

// ============================================================================
// CRDT Types
// ============================================================================

/**
 * CRDT operation types for distributed sync
 */
export type CRDTOperation =
  | EntityAddOperation
  | EntityUpdateOperation
  | EntityDeleteOperation
  | RelationAddOperation
  | RelationUpdateOperation
  | RelationDeleteOperation;

/**
 * Base CRDT operation interface
 */
export interface CRDTOperationBase {
  id: string;
  type: string;
  nodeId: string;
  timestamp: VectorClock;
  causallyReady: boolean;
}

/**
 * Add entity operation
 */
export interface EntityAddOperation extends CRDTOperationBase {
  type: 'entity_add';
  entity: Entity;
}

/**
 * Update entity operation
 */
export interface EntityUpdateOperation extends CRDTOperationBase {
  type: 'entity_update';
  entityId: EntityId;
  patches: JsonPatch[];
  priorVersion: number;
  newVersion: number;
}

/**
 * Delete entity operation (tombstone)
 */
export interface EntityDeleteOperation extends CRDTOperationBase {
  type: 'entity_delete';
  entityId: EntityId;
  tombstone: Tombstone;
}

/**
 * Add relation operation
 */
export interface RelationAddOperation extends CRDTOperationBase {
  type: 'relation_add';
  relation: Relation;
}

/**
 * Update relation operation
 */
export interface RelationUpdateOperation extends CRDTOperationBase {
  type: 'relation_update';
  relationId: RelationId;
  patches: JsonPatch[];
  priorVersion: number;
  newVersion: number;
}

/**
 * Delete relation operation
 */
export interface RelationDeleteOperation extends CRDTOperationBase {
  type: 'relation_delete';
  relationId: RelationId;
  tombstone: Tombstone;
}

/**
 * JSON Patch format for updates
 */
export interface JsonPatch {
  op: 'add' | 'remove' | 'replace' | 'move' | 'copy' | 'test';
  path: string;
  value?: PropertyValue;
  from?: string;
}

/**
 * Tombstone for deleted items
 */
export interface Tombstone {
  id: string;
  deletedAt: number;
  deletedBy: string;
  gcAfter: number;
}

/**
 * Vector clock for causality tracking
 */
export interface VectorClock {
  [nodeId: string]: number;
}

/**
 * Merged state with CRDT metadata
 */
export interface MergedState<T> {
  value: T;
  vectorClock: VectorClock;
  sources: string[];
  conflicts: Conflict[];
}

/**
 * Conflict information
 */
export interface Conflict {
  id: string;
  type: ConflictType;
  path: string;
  values: PropertyValue[];
  resolutions: Resolution[];
  resolved: boolean;
}

export type ConflictType = 
  | 'update_update'
  | 'update_delete'
  | 'concurrent_modify';

/**
 * Resolution options for conflicts
 */
export interface Resolution {
  strategy: MergeStrategy;
  selectedValue?: PropertyValue;
  mergedValue?: PropertyValue;
  resolvedBy?: string;
  resolvedAt?: number;
}

// ============================================================================
// Merge Strategy Types
// ============================================================================

/**
 * Merge strategies for conflict resolution
 */
export type MergeStrategy =
  | 'last_write_wins'
  | 'first_write_wins'
  | 'multi_value'
  | 'source_priority'
  | 'custom';

/**
 * Configuration for merge strategies
 */
export interface MergeConfig {
  defaultStrategy: MergeStrategy;
  typeSpecificStrategies: Map<string, MergeStrategy>;
  customResolvers: Map<string, CustomResolver>;
  maxMergeDepth: number;
  autoResolveThreshold: number;
}

/**
 * Custom merge resolver function
 */
export type CustomResolver = (
  conflict: Conflict,
  context: MergeContext
) => PropertyValue;

/**
 * Context for merge operations
 */
export interface MergeContext {
  graph: KnowledgeGraph;
  operationHistory: CRDTOperation[];
  nodePolicies: Map<string, NodePolicy>;
}

/**
 * Policy for a specific node
 */
export interface NodePolicy {
  priority: number;
  trustLevel: number;
  mergeStrategy: MergeStrategy;
  autoAccept: boolean;
}

// ============================================================================
// Query Types
// ============================================================================

/**
 * Graph query interface
 */
export interface GraphQuery {
  id: string;
  type: QueryType;
  filters: QueryFilter[];
  traversal?: TraversalSpec;
  vector?: VectorQuery;
  aggregations?: Aggregation[];
  options: QueryOptions;
}

export type QueryType = 
  | 'traversal'
  | 'vector'
  | 'hybrid'
  | 'pattern'
  | 'aggregation';

export interface QueryFilter {
  field: string;
  operator: FilterOperator;
  value: PropertyValue;
}

export type FilterOperator =
  | 'eq'
  | 'neq'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'in'
  | 'nin'
  | 'contains'
  | 'startsWith'
  | 'endsWith'
  | 'regex';

/**
 * Traversal specification for graph queries
 */
export interface TraversalSpec {
  startNodes: EntityId[];
  directions: ('outbound' | 'inbound' | 'both')[];
  relationTypes?: RelationType[];
  maxDepth: number;
  edgeFilters?: QueryFilter[];
  nodeFilters?: QueryFilter[];
  pathFormat: 'tree' | 'list' | 'graph';
  includeProperties: boolean;
}

/**
 * Vector query for semantic search
 */
export interface VectorQuery {
  embedding: number[];
  metric: 'cosine' | 'euclidean' | 'dotproduct';
  k: number;
  threshold?: number;
  filters?: QueryFilter[];
  hybrid?: HybridConfig;
}

/**
 * Hybrid search configuration
 */
export interface HybridConfig {
  vectorWeight: number;
  keywordWeight: number;
  fusion: 'rrf' | 'weighted' | 'additive';
  rrfK?: number;
}

/**
 * Aggregation specification
 */
export interface Aggregation {
  type: AggregationType;
  field: string;
  name: string;
  groupBy?: string[];
}

export type AggregationType =
  | 'count'
  | 'sum'
  | 'avg'
  | 'min'
  | 'max'
  | 'percentiles'
  | 'histogram'
  | 'cardinality';

/**
 * Query execution options
 */
export interface QueryOptions {
  limit?: number;
  offset?: number;
  timeout?: number;
  includeDeleted?: boolean;
  consistency?: ConsistencyLevel;
  explain?: boolean;
}

export type ConsistencyLevel =
  | 'strong'
  | 'eventual'
  | 'bounded'
  | 'read_my_writes';

/**
 * Query result
 */
export interface QueryResult<T = unknown> {
  data: T;
  metadata: QueryMetadata;
  executionTime: number;
}

export interface QueryMetadata {
  queryId: string;
  totalHits: number;
  returnedHits: number;
  indicesUsed: string[];
  cached: boolean;
  consistencyLevel: ConsistencyLevel;
}

// ============================================================================
// Inference Types
// ============================================================================

/**
 * Inference rule definition
 */
export interface InferenceRule {
  id: string;
  name: string;
  description: string;
  antecedent: Pattern;
  consequent: Derivation;
  confidence: number;
  metadata: RuleMetadata;
}

export interface Pattern {
  entities: PatternEntity[];
  relations: PatternRelation[];
  constraints?: PatternConstraint[];
}

export interface PatternEntity {
  id: string;
  type?: EntityType;
  variable: string;
  label?: string;
}

export interface PatternRelation {
  source: string;
  target: string;
  type: RelationType;
  variable?: string;
}

export interface PatternConstraint {
  entity: string;
  property: string;
  operator: FilterOperator;
  value: PropertyValue;
}

export interface Derivation {
  source: string;
  target: string;
  relationType: RelationType;
  properties?: Record<string, PropertyValue>;
  confidence: number;
}

export interface RuleMetadata {
  domain: string[];
  createdBy: string;
  source?: string;
  examples?: string[];
  statistics?: RuleStatistics;
}

export interface RuleStatistics {
  timesApplied: number;
  successRate: number;
  lastApplied?: Date;
}

/**
 * Inference result
 */
export interface InferenceResult {
  derivedRelations: DerivedRelation[];
  appliedRules: AppliedRule[];
  metadata: InferenceMetadata;
}

export interface DerivedRelation {
  sourceId: EntityId;
  targetId: EntityId;
  relationType: RelationType;
  inferredBy: string;
  confidence: number;
  derivationPath: DerivationStep[];
}

export interface DerivationStep {
  rule: string;
  matchedPattern: Pattern;
  entities: EntityId[];
}

export interface AppliedRule {
  ruleId: string;
  timesApplied: number;
  confidence: number;
}

export interface InferenceMetadata {
  inferenceId: string;
  timestamp: Date;
  duration: number;
  entitiesProcessed: number;
  relationsDerived: number;
}

// ============================================================================
// Federation Types
// ============================================================================

/**
 * Federation node configuration
 */
export interface FederationNode {
  id: string;
  name: string;
  endpoint: string;
  type: NodeType;
  capabilities: NodeCapability[];
  status: NodeStatus;
  metadata: NodeMetadata;
}

export type NodeType =
  | 'primary'
  | 'replica'
  | 'read_replica'
  | 'compute'
  | 'storage';

export interface NodeCapability {
  name: string;
  version: string;
  enabled: boolean;
}

export interface NodeStatus {
  state: 'online' | 'offline' | 'syncing' | 'degraded';
  lastSeen: Date;
  latency?: number;
  errorRate?: number;
}

export interface NodeMetadata {
  region?: string;
  datacenter?: string;
  tags: Record<string, string>;
}

/**
 * Sync state for federation
 */
export interface SyncState {
  nodeId: string;
  clock: VectorClock;
  pendingOps: CRDTOperation[];
  syncedOps: CRDTOperation[];
  lastSync: Date;
  status: SyncStatus;
}

export type SyncStatus =
  | 'idle'
  | 'syncing'
  | 'error'
  | 'paused';

/**
 * Sync message format
 */
export interface SyncMessage {
  id: string;
  type: SyncMessageType;
  source: string;
  target: string;
  payload: unknown;
  timestamp: VectorClock;
}

export type SyncMessageType =
  | 'sync_request'
  | 'sync_response'
  | 'operation'
  | 'acknowledgment'
  | 'conflict_report'
  | 'heartbeat';

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Bounding box for spatial queries
 */
export interface BoundingBox {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

/**
 * QuadTree node for spatial indexing
 */
export interface QuadTree {
  bounds: BoundingBox;
  entities: EntityId[];
  children?: [QuadTree, QuadTree, QuadTree, QuadTree];
}

/**
 * Graph export format
 */
export interface GraphExport {
  version: string;
  exportedAt: Date;
  graph: {
    id: string;
    name: string;
    entities: Entity[];
    relations: Relation[];
  };
  metadata: {
    exportedBy: string;
    filters?: QueryFilter[];
    format: ExportFormat;
  };
}

export type ExportFormat =
  | 'json'
  | 'graphml'
  | 'rdf'
  | 'csv'
  | 'parquet';

/**
 * Configuration for Nexus
 */
export interface NexusConfig {
  nodeId: string;
  storage: StorageConfig;
  federation: FederationConfig;
  inference: InferenceConfig;
  query: QueryConfig;
  server?: ServerConfig;
}

export interface StorageConfig {
  type: 'memory' | 'leveldb' | 'rocksdb';
  path: string;
  options?: Record<string, unknown>;
}

export interface FederationConfig {
  enabled: boolean;
  peers: string[];
  syncInterval: number;
  conflictResolution: MergeConfig;
  gossip?: GossipConfig;
}

export interface GossipConfig {
  interval: number;
  fanout: number;
  seedNodes: string[];
}

export interface InferenceConfig {
  enabled: boolean;
  rules: InferenceRule[];
  maxIterations: number;
  confidenceThreshold: number;
  parallelExecution: boolean;
}

export interface QueryConfig {
  defaultLimit: number;
  maxLimit: number;
  timeout: number;
  cacheEnabled: boolean;
  cacheSize: number;
}

export interface ServerConfig {
  port: number;
  host: string;
  cors: boolean;
  auth?: AuthConfig;
}

export interface AuthConfig {
  type: 'none' | 'basic' | 'jwt';
  users?: Map<string, string>;
  jwtSecret?: string;
}
