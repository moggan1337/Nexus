/**
 * Core Graph Implementation
 * Main in-memory graph data structure for Nexus
 */

import {
  Entity,
  EntityId,
  EntityType,
  Relation,
  RelationId,
  RelationType,
  KnowledgeGraph,
  GraphIndex,
  GraphMetadata,
  PropertyValue,
  Embeddings,
  VectorClock,
  MergedState,
  VectorClock as VC,
} from './types.js';
import { ulid } from 'ulid';
import { EventEmitter } from 'events';

// ============================================================================
// Graph Implementation
// ============================================================================

/**
 * Core knowledge graph implementation with CRDT support
 */
export class NexusGraph implements KnowledgeGraph {
  id: string;
  name: string;
  description: string;
  entities: Map<EntityId, Entity>;
  relations: Map<RelationId, Relation>;
  index: GraphIndex;
  metadata: GraphMetadata;

  private emitter: EventEmitter;
  private vectorClock: VectorClock;
  private nodeId: string;

  constructor(config: {
    id?: string;
    name: string;
    description?: string;
    nodeId: string;
  }) {
    this.id = config.id || ulid();
    this.name = config.name;
    this.description = config.description || '';
    this.entities = new Map();
    this.relations = new Map();
    this.index = this.createIndex();
    this.metadata = this.createMetadata();
    this.emitter = new EventEmitter();
    this.nodeId = config.nodeId;
    this.vectorClock = { [config.nodeId]: 1 };
  }

  // ==========================================================================
  // Entity Operations
  // ==========================================================================

  /**
   * Add a new entity to the graph
   */
  addEntity(
    type: EntityType,
    label: string,
    properties: Record<string, PropertyValue> = {},
    embeddings?: Embeddings,
    metadata?: Partial<Entity['metadata']>
  ): Entity {
    const now = Date.now();
    const entity: Entity = {
      id: ulid(),
      type,
      label,
      properties,
      embeddings: embeddings || { dense: [], metadata: undefined },
      metadata: {
        createdBy: this.nodeId,
        lastModifiedBy: this.nodeId,
        version: 1,
        tags: [],
        aliases: [],
        confidence: 1.0,
        ...metadata,
      },
      timestamps: {
        createdAt: now,
        updatedAt: now,
      },
    };

    this.entities.set(entity.id, entity);
    this.indexEntity(entity);
    this.incrementClock();
    this.emitter.emit('entity:add', entity);

    return entity;
  }

  /**
   * Update an existing entity
   */
  updateEntity(
    entityId: EntityId,
    updates: Partial<Pick<Entity, 'label' | 'properties' | 'type'>>,
    embeddings?: Partial<Embeddings>
  ): Entity | null {
    const entity = this.entities.get(entityId);
    if (!entity) return null;

    const now = Date.now();
    const updated: Entity = {
      ...entity,
      label: updates.label ?? entity.label,
      type: updates.type ?? entity.type,
      properties: { ...entity.properties, ...updates.properties },
      embeddings: embeddings
        ? { ...entity.embeddings, ...embeddings }
        : entity.embeddings,
      metadata: {
        ...entity.metadata,
        version: entity.metadata.version + 1,
        lastModifiedBy: this.nodeId,
      },
      timestamps: {
        ...entity.timestamps,
        updatedAt: now,
      },
    };

    // Update index
    this.unindexEntity(entity);
    this.entities.set(entityId, updated);
    this.indexEntity(updated);
    this.incrementClock();
    this.emitter.emit('entity:update', { before: entity, after: updated });

    return updated;
  }

  /**
   * Soft delete an entity
   */
  deleteEntity(entityId: EntityId): boolean {
    const entity = this.entities.get(entityId);
    if (!entity) return false;

    entity.timestamps.deletedAt = Date.now();
    this.unindexEntity(entity);
    this.incrementClock();
    this.emitter.emit('entity:delete', entity);

    return true;
  }

  /**
   * Get entity by ID
   */
  getEntity(entityId: EntityId): Entity | undefined {
    return this.entities.get(entityId);
  }

  /**
   * Find entities by type
   */
  findByType(type: EntityType): Entity[] {
    const ids = this.index.byType.get(type);
    if (!ids) return [];
    return Array.from(ids)
      .map((id) => this.entities.get(id))
      .filter((e): e is Entity => e !== undefined);
  }

  /**
   * Find entities by tag
   */
  findByTag(tag: string): Entity[] {
    const ids = this.index.byTag.get(tag);
    if (!ids) return [];
    return Array.from(ids)
      .map((id) => this.entities.get(id))
      .filter((e): e is Entity => e !== undefined);
  }

  // ==========================================================================
  // Relation Operations
  // ==========================================================================

  /**
   * Add a relation between entities
   */
  addRelation(
    sourceId: EntityId,
    targetId: EntityId,
    type: RelationType,
    properties: Record<string, PropertyValue> = {},
    weight: number = 1.0
  ): Relation | null {
    // Verify entities exist
    if (!this.entities.has(sourceId) || !this.entities.has(targetId)) {
      return null;
    }

    const now = Date.now();
    const relation: Relation = {
      id: ulid(),
      sourceId,
      targetId,
      type,
      properties,
      weight,
      metadata: {
        bidirectional: false,
        confidence: 1.0,
      },
      timestamps: {
        createdAt: now,
        updatedAt: now,
      },
    };

    this.relations.set(relation.id, relation);
    this.indexRelation(relation);
    this.incrementClock();
    this.emitter.emit('relation:add', relation);

    return relation;
  }

  /**
   * Update a relation
   */
  updateRelation(
    relationId: RelationId,
    updates: Partial<Pick<Relation, 'properties' | 'weight'>>
  ): Relation | null {
    const relation = this.relations.get(relationId);
    if (!relation) return null;

    const updated: Relation = {
      ...relation,
      properties: { ...relation.properties, ...updates.properties },
      weight: updates.weight ?? relation.weight,
      timestamps: {
        ...relation.timestamps,
        updatedAt: Date.now(),
      },
    };

    this.relations.set(relationId, updated);
    this.incrementClock();
    this.emitter.emit('relation:update', { before: relation, after: updated });

    return updated;
  }

  /**
   * Delete a relation
   */
  deleteRelation(relationId: RelationId): boolean {
    const relation = this.relations.get(relationId);
    if (!relation) return false;

    this.unindexRelation(relation);
    this.relations.delete(relationId);
    this.incrementClock();
    this.emitter.emit('relation:delete', relation);

    return true;
  }

  /**
   * Get relations for an entity
   */
  getRelations(entityId: EntityId): Relation[] {
    return Array.from(this.relations.values()).filter(
      (r) => r.sourceId === entityId || r.targetId === entityId
    );
  }

  /**
   * Get outgoing relations
   */
  getOutgoingRelations(entityId: EntityId): Relation[] {
    return Array.from(this.relations.values()).filter(
      (r) => r.sourceId === entityId
    );
  }

  /**
   * Get incoming relations
   */
  getIncomingRelations(entityId: EntityId): Relation[] {
    return Array.from(this.relations.values()).filter(
      (r) => r.targetId === entityId
    );
  }

  // ==========================================================================
  // Graph Traversal
  // ==========================================================================

  /**
   * Traverse the graph from starting nodes
   */
  traverse(
    startIds: EntityId[],
    maxDepth: number = 3,
    options: {
      directions?: ('outbound' | 'inbound' | 'both')[];
      relationTypes?: RelationType[];
      nodeFilter?: (entity: Entity) => boolean;
      edgeFilter?: (relation: Relation) => boolean;
    } = {}
  ): TraversalResult {
    const {
      directions = ['outbound'],
      relationTypes,
      nodeFilter = () => true,
      edgeFilter = () => true,
    } = options;

    const visited = new Set<EntityId>();
    const result: TraversalResult = {
      nodes: [],
      edges: [],
      paths: [],
    };

    const queue: Array<{
      entityId: EntityId;
      depth: number;
      path: EntityId[];
    }> = startIds.map((id) => ({ entityId: id, depth: 0, path: [id] }));

    while (queue.length > 0) {
      const current = queue.shift()!;

      if (visited.has(current.entityId)) continue;
      visited.add(current.entityId);

      const entity = this.entities.get(current.entityId);
      if (!entity || !nodeFilter(entity)) continue;

      result.nodes.push(entity);
      if (current.path.length > 1) {
        result.paths.push([...current.path]);
      }

      if (current.depth >= maxDepth) continue;

      // Get adjacent relations
      const relations = this.getRelations(current.entityId);

      for (const relation of relations) {
        if (relationTypes && !relationTypes.includes(relation.type)) continue;
        if (!edgeFilter(relation)) continue;

        let targetId: EntityId | null = null;

        if (
          directions.includes('outbound') &&
          relation.sourceId === current.entityId
        ) {
          targetId = relation.targetId;
          result.edges.push({ ...relation, direction: 'outbound' });
        } else if (
          directions.includes('inbound') &&
          relation.targetId === current.entityId
        ) {
          targetId = relation.sourceId;
          result.edges.push({ ...relation, direction: 'inbound' });
        }

        if (
          targetId &&
          !visited.has(targetId) &&
          directions.includes('both')
        ) {
          // For 'both' direction, add bidirectional edges
          if (relation.sourceId === current.entityId) {
            queue.push({
              entityId: relation.targetId,
              depth: current.depth + 1,
              path: [...current.path, relation.targetId],
            });
          }
          if (relation.targetId === current.entityId) {
            queue.push({
              entityId: relation.sourceId,
              depth: current.depth + 1,
              path: [...current.path, relation.sourceId],
            });
          }
        } else if (targetId) {
          queue.push({
            entityId: targetId,
            depth: current.depth + 1,
            path: [...current.path, targetId],
          });
        }
      }
    }

    return result;
  }

  // ==========================================================================
  // Index Management
  // ==========================================================================

  private createIndex(): GraphIndex {
    return {
      byType: new Map(),
      byRelationType: new Map(),
      byProperty: new Map(),
      byTag: new Map(),
    };
  }

  private createMetadata(): GraphMetadata {
    return {
      version: '1.0.0',
      createdAt: new Date(),
      updatedAt: new Date(),
      nodeCount: 0,
      edgeCount: 0,
      partitions: [],
    };
  }

  private indexEntity(entity: Entity): void {
    // Index by type
    if (!this.index.byType.has(entity.type)) {
      this.index.byType.set(entity.type, new Set());
    }
    this.index.byType.get(entity.type)!.add(entity.id);

    // Index by tags
    for (const tag of entity.metadata.tags) {
      if (!this.index.byTag.has(tag)) {
        this.index.byTag.set(tag, new Set());
      }
      this.index.byTag.get(tag)!.add(entity.id);
    }

    // Index by properties
    for (const [key, value] of Object.entries(entity.properties)) {
      const indexKey = `${entity.type}:${key}`;
      if (!this.index.byProperty.has(indexKey)) {
        this.index.byProperty.set(indexKey, new Map());
      }
      const propIndex = this.index.byProperty.get(indexKey)!;
      const valueKey = String(value);
      if (!propIndex.has(valueKey)) {
        propIndex.set(valueKey, new Set());
      }
      propIndex.get(valueKey)!.add(entity.id);
    }

    // Update metadata
    this.metadata.nodeCount = this.entities.size;
    this.metadata.updatedAt = new Date();
  }

  private unindexEntity(entity: Entity): void {
    this.index.byType.get(entity.type)?.delete(entity.id);

    for (const tag of entity.metadata.tags) {
      this.index.byTag.get(tag)?.delete(entity.id);
    }

    this.metadata.nodeCount = this.entities.size;
    this.metadata.updatedAt = new Date();
  }

  private indexRelation(relation: Relation): void {
    if (!this.index.byRelationType.has(relation.type)) {
      this.index.byRelationType.set(relation.type, new Set());
    }
    this.index.byRelationType.get(relation.type)!.add(relation.id);

    this.metadata.edgeCount = this.relations.size;
    this.metadata.updatedAt = new Date();
  }

  private unindexRelation(relation: Relation): void {
    this.index.byRelationType.get(relation.type)?.delete(relation.id);
    this.metadata.edgeCount = this.relations.size;
    this.metadata.updatedAt = new Date();
  }

  // ==========================================================================
  // Vector Clock Operations
  // ==========================================================================

  private incrementClock(): void {
    this.vectorClock[this.nodeId] = (this.vectorClock[this.nodeId] || 0) + 1;
  }

  getVectorClock(): VectorClock {
    return { ...this.vectorClock };
  }

  mergeClock(remote: VectorClock): void {
    for (const [nodeId, timestamp] of Object.entries(remote)) {
      this.vectorClock[nodeId] = Math.max(
        this.vectorClock[nodeId] || 0,
        timestamp
      );
    }
  }

  // ==========================================================================
  // Event Emission
  // ==========================================================================

  on(event: string, listener: (...args: unknown[]) => void): void {
    this.emitter.on(event, listener);
  }

  off(event: string, listener: (...args: unknown[]) => void): void {
    this.emitter.off(event, listener);
  }

  // ==========================================================================
  // Serialization
  // ==========================================================================

  /**
   * Export graph to JSON
   */
  toJSON(): object {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      entities: Array.from(this.entities.values()),
      relations: Array.from(this.relations.values()),
      metadata: this.metadata,
    };
  }

  /**
   * Import graph from JSON
   */
  static fromJSON(
    data: {
      id?: string;
      name: string;
      description?: string;
      entities: Entity[];
      relations: Relation[];
    },
    nodeId: string
  ): NexusGraph {
    const graph = new NexusGraph({
      id: data.id,
      name: data.name,
      description: data.description,
      nodeId,
    });

    for (const entity of data.entities) {
      graph.entities.set(entity.id, entity);
      graph.indexEntity(entity);
    }

    for (const relation of data.relations) {
      graph.relations.set(relation.id, relation);
      graph.indexRelation(relation);
    }

    return graph;
  }

  /**
   * Get graph statistics
   */
  getStats(): GraphStats {
    const relationCounts = new Map<RelationType, number>();
    const entityCounts = new Map<EntityType, number>();

    for (const entity of this.entities.values()) {
      entityCounts.set(
        entity.type,
        (entityCounts.get(entity.type) || 0) + 1
      );
    }

    for (const relation of this.relations.values()) {
      relationCounts.set(
        relation.type,
        (relationCounts.get(relation.type) || 0) + 1
      );
    }

    return {
      entityCount: this.entities.size,
      relationCount: this.relations.size,
      entityCounts: Object.fromEntries(entityCounts),
      relationCounts: Object.fromEntries(relationCounts),
      vectorClock: this.vectorClock,
    };
  }
}

// ============================================================================
// Supporting Types
// ============================================================================

export interface TraversalResult {
  nodes: Entity[];
  edges: (Relation & { direction: 'inbound' | 'outbound' })[];
  paths: EntityId[][];
}

export interface GraphStats {
  entityCount: number;
  relationCount: number;
  entityCounts: Record<EntityType, number>;
  relationCounts: Record<RelationType, number>;
  vectorClock: VectorClock;
}

// ============================================================================
// Factory Function
// ============================================================================

export function createGraph(config: {
  name: string;
  description?: string;
  nodeId?: string;
}): NexusGraph {
  return new NexusGraph({
    name: config.name,
    description: config.description,
    nodeId: config.nodeId || 'node-1',
  });
}
