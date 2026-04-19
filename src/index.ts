/**
 * Nexus - Federated Knowledge Graph Engine
 * Main entry point
 */

// Core exports
export * from './core/types.js';
export * from './core/graph.js';

// Protocol exports
export * from './protocol/crdt.js';
export * from './protocol/conflict.js';

// Query exports
export * from './query/engine.js';

// Inference exports
export * from './inference/engine.js';

// Storage exports
export * from './storage/index.js';

// Visualization exports
export * from './visualization/renderer.js';

import { NexusGraph, createGraph, NexusConfig } from './core/graph.js';
import { createQueryEngine } from './query/engine.js';
import { createInferenceEngine, builtInRules } from './inference/engine.js';
import { StorageManager, MemoryStorage } from './storage/backend.js';
import { GossipProtocol, SyncManager, EntityCRDTState, incrementClock, mergeClocks } from './protocol/crdt.js';
import { ConflictResolver, mergeGraphs, MergeConfig, MergeStrategy } from './protocol/conflict.js';

/**
 * Main Nexus client class
 */
export class Nexus {
  private graph: NexusGraph;
  private queryEngine: ReturnType<typeof createQueryEngine>;
  private inferenceEngine: ReturnType<typeof createInferenceEngine>;
  private storage: StorageManager | null = null;
  private gossip: GossipProtocol | null = null;
  private syncManager: SyncManager | null = null;
  private crdtState: EntityCRDTState;
  private config: NexusConfig;

  constructor(config: Partial<NexusConfig> = {}) {
    this.config = {
      nodeId: config.nodeId || 'node-1',
      storage: config.storage || { type: 'memory', path: '' },
      federation: config.federation || { enabled: false, peers: [], syncInterval: 5000, conflictResolution: getDefaultMergeConfig() },
      inference: config.inference || { enabled: true, rules: builtInRules, maxIterations: 10, confidenceThreshold: 0.5, parallelExecution: true },
      query: config.query || { defaultLimit: 100, maxLimit: 10000, timeout: 30000, cacheEnabled: true, cacheSize: 1000 },
    };

    this.graph = new NexusGraph({
      name: 'Nexus Knowledge Graph',
      nodeId: this.config.nodeId,
    });

    this.queryEngine = createQueryEngine(this.graph);
    this.inferenceEngine = createInferenceEngine(this.graph, {
      rules: this.config.inference.rules,
      maxIterations: this.config.inference.maxIterations,
      confidenceThreshold: this.config.inference.confidenceThreshold,
    });
    this.crdtState = new EntityCRDTState();
  }

  /**
   * Initialize the Nexus instance
   */
  async initialize(): Promise<void> {
    // Initialize storage
    if (this.config.storage) {
      this.storage = await StorageManager.create(
        this.config.storage.type,
        {
          path: this.config.storage.path,
          nodeId: this.config.nodeId,
        }
      );
    }

    // Initialize federation
    if (this.config.federation.enabled) {
      this.initializeFederation();
    }

    // Load existing data
    if (this.storage) {
      const existingGraph = await this.storage.loadGraph('nexus');
      // Merge existing data
    }
  }

  /**
   * Initialize federation components
   */
  private initializeFederation(): void {
    const { federation } = this.config;

    // Initialize gossip protocol
    this.gossip = new GossipProtocol({
      nodeId: this.config.nodeId,
      fanout: federation.gossip?.fanout || 3,
      interval: federation.gossip?.interval || 1000,
    });

    // Initialize sync manager
    this.syncManager = new SyncManager(this.config.nodeId, this.crdtState);

    // Add peers
    for (const peer of federation.peers) {
      this.gossip.addPeer(peer);
      this.syncManager.addPeer(peer, peer);
    }

    // Start gossip
    this.gossip.start();

    // Handle incoming messages
    this.gossip.on('message', (msg: unknown) => {
      const message = msg as { operation: Parameters<typeof this.crdtState.applyOperation>[0] };
      if (this.crdtState && message.operation) {
        this.crdtState.applyOperation(message.operation);
      }
    });
  }

  // ==========================================================================
  // Entity Operations
  // ==========================================================================

  /**
   * Add an entity to the graph
   */
  addEntity(
    type: Parameters<typeof this.graph.addEntity>[0],
    label: Parameters<typeof this.graph.addEntity>[1],
    properties?: Record<string, unknown>,
    embeddings?: Parameters<typeof this.graph.addEntity>[3],
    metadata?: Parameters<typeof this.graph.addEntity>[4]
  ) {
    const entity = this.graph.addEntity(type, label, properties, embeddings, metadata);

    // Sync to CRDT state
    if (this.crdtState) {
      this.crdtState.applyOperation({
        id: `op-${Date.now()}`,
        type: 'entity_add',
        nodeId: this.config.nodeId,
        timestamp: this.graph.getVectorClock(),
        causallyReady: true,
        entity,
      });
    }

    // Broadcast to peers
    if (this.gossip) {
      this.gossip.broadcast({
        id: `op-${Date.now()}`,
        type: 'entity_add',
        nodeId: this.config.nodeId,
        timestamp: this.graph.getVectorClock(),
        causallyReady: true,
        entity,
      }, this.graph.getVectorClock());
    }

    return entity;
  }

  /**
   * Update an entity
   */
  updateEntity(
    entityId: string,
    updates: Partial<Pick<import('./core/types.js').Entity, 'label' | 'properties' | 'type'>>
  ) {
    return this.graph.updateEntity(entityId, updates);
  }

  /**
   * Delete an entity
   */
  deleteEntity(entityId: string): boolean {
    return this.graph.deleteEntity(entityId);
  }

  /**
   * Get an entity by ID
   */
  getEntity(entityId: string) {
    return this.graph.getEntity(entityId);
  }

  // ==========================================================================
  // Relation Operations
  // ==========================================================================

  /**
   * Add a relation between entities
   */
  addRelation(
    sourceId: string,
    targetId: string,
    type: Parameters<typeof this.graph.addRelation>[2],
    properties?: Record<string, unknown>,
    weight?: number
  ) {
    return this.graph.addRelation(sourceId, targetId, type, properties, weight);
  }

  /**
   * Delete a relation
   */
  deleteRelation(relationId: string): boolean {
    return this.graph.deleteRelation(relationId);
  }

  /**
   * Get relations for an entity
   */
  getRelations(entityId: string) {
    return this.graph.getRelations(entityId);
  }

  // ==========================================================================
  // Query Operations
  // ==========================================================================

  /**
   * Execute a graph query
   */
  async query(query: Parameters<typeof this.queryEngine.execute>[0]) {
    return this.queryEngine.execute(query);
  }

  /**
   * Traverse the graph
   */
  traverse(
    startIds: string[],
    maxDepth?: number,
    options?: Parameters<typeof this.graph.traverse>[2]
  ) {
    return this.graph.traverse(startIds, maxDepth, options);
  }

  /**
   * Vector similarity search
   */
  async searchByVector(
    embedding: number[],
    k?: number,
    threshold?: number
  ) {
    return this.queryEngine.execute({
      id: `query-${Date.now()}`,
      type: 'vector',
      filters: [],
      vector: {
        embedding,
        metric: 'cosine',
        k: k || 10,
        threshold,
      },
      options: {},
    });
  }

  /**
   * Hybrid search (traversal + vector)
   */
  async hybridSearch(
    startIds: string[],
    embedding: number[],
    options?: { maxDepth?: number; k?: number }
  ) {
    return this.queryEngine.execute({
      id: `query-${Date.now()}`,
      type: 'hybrid',
      filters: [],
      traversal: {
        startNodes: startIds,
        directions: ['outbound'],
        maxDepth: options?.maxDepth || 3,
        pathFormat: 'tree',
        includeProperties: true,
      },
      vector: {
        embedding,
        metric: 'cosine',
        k: options?.k || 10,
      },
      options: {},
    });
  }

  // ==========================================================================
  // Inference Operations
  // ==========================================================================

  /**
   * Run inference engine
   */
  runInference(options?: Parameters<typeof this.inferenceEngine.run>[0]) {
    return this.inferenceEngine.run(options);
  }

  /**
   * Apply inference results to graph
   */
  applyInferences(result: ReturnType<typeof this.inferenceEngine.run>) {
    return this.inferenceEngine.applyResults(result);
  }

  /**
   * Add a custom inference rule
   */
  addRule(rule: Parameters<typeof this.inferenceEngine.addRule>[0]) {
    this.inferenceEngine.addRule(rule);
  }

  // ==========================================================================
  // Federation Operations
  // ==========================================================================

  /**
   * Sync with a peer node
   */
  async syncWithPeer(peerId: string): Promise<void> {
    if (!this.syncManager) return;

    const operations = this.syncManager.getOperationsForPeer(peerId);
    // Send operations to peer (would need actual network call)

    this.syncManager.updateSyncState(peerId, this.graph.getVectorClock());
  }

  /**
   * Merge data from another graph
   */
  mergeGraph(other: NexusGraph) {
    const merged = mergeGraphs(
      this.graph,
      other,
      this.config.federation.conflictResolution
    );

    // Update local graph
    for (const [id, entity] of merged.entities) {
      this.graph.entities.set(id, entity);
    }
    for (const [id, relation] of merged.relations) {
      this.graph.relations.set(id, relation);
    }
  }

  /**
   * Get federation status
   */
  getFederationStatus() {
    return {
      nodeId: this.config.nodeId,
      peers: this.config.federation.peers,
      syncStates: this.syncManager?.getSyncStates() || [],
      vectorClock: this.graph.getVectorClock(),
    };
  }

  // ==========================================================================
  // Persistence Operations
  // ==========================================================================

  /**
   * Save graph to storage
   */
  async save(): Promise<void> {
    if (this.storage) {
      await this.storage.syncFromGraph(this.graph);
    }
  }

  /**
   * Export graph to JSON
   */
  export() {
    return this.graph.toJSON();
  }

  /**
   * Import graph from JSON
   */
  import(data: { name?: string; entities: import('./core/types.js').Entity[]; relations: import('./core/types.js').Relation[] }) {
    const imported = NexusGraph.fromJSON(
      data,
      this.config.nodeId
    );

    this.mergeGraph(imported);
  }

  // ==========================================================================
  // Statistics
  // ==========================================================================

  /**
   * Get graph statistics
   */
  getStats() {
    return this.graph.getStats();
  }

  /**
   * Get query cache statistics
   */
  getQueryStats() {
    return this.queryEngine.getCacheStats();
  }

  /**
   * Get inference rule statistics
   */
  getInferenceStats() {
    return this.inferenceEngine.getRuleStats();
  }
}

// ============================================================================
// Default Configuration
// ============================================================================

function getDefaultMergeConfig(): MergeConfig {
  return {
    defaultStrategy: 'last_write_wins',
    typeSpecificStrategies: new Map(),
    customResolvers: new Map(),
    maxMergeDepth: 10,
    autoResolveThreshold: 0.8,
  };
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new Nexus instance
 */
export function createNexus(config?: Partial<NexusConfig>): Nexus {
  return new Nexus(config);
}

// ============================================================================
// CLI Support
// ============================================================================

export { NexusGraph, createGraph, createQueryEngine, createInferenceEngine };
