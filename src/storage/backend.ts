/**
 * Storage Backend
 * Persistent storage adapters for Nexus
 */

import {
  Entity,
  Relation,
  NexusGraph,
  KnowledgeGraph,
} from '../core/types.js';
import { ulid } from 'ulid';

// ============================================================================
// Storage Interface
// ============================================================================

/**
 * Abstract storage backend interface
 */
export interface StorageBackend {
  /**
   * Initialize the storage
   */
  initialize(): Promise<void>;

  /**
   * Close the storage
   */
  close(): Promise<void>;

  /**
   * Save an entity
   */
  saveEntity(entity: Entity): Promise<void>;

  /**
   * Get an entity by ID
   */
  getEntity(id: string): Promise<Entity | null>;

  /**
   * Delete an entity
   */
  deleteEntity(id: string): Promise<void>;

  /**
   * Save a relation
   */
  saveRelation(relation: Relation): Promise<void>;

  /**
   * Get a relation by ID
   */
  getRelation(id: string): Promise<Relation | null>;

  /**
   * Delete a relation
   */
  deleteRelation(id: string): Promise<void>;

  /**
   * Get all entities
   */
  getAllEntities(): Promise<Entity[]>;

  /**
   * Get all relations
   */
  getAllRelations(): Promise<Relation[]>;

  /**
   * Query entities by type
   */
  queryEntitiesByType(type: string): Promise<Entity[]>;

  /**
   * Query relations by type
   */
  queryRelationsByType(type: string): Promise<Relation[]>;

  /**
   * Get statistics
   */
  getStats(): Promise<StorageStats>;

  /**
   * Export all data
   */
  exportAll(): Promise<ExportedData>;

  /**
   * Import data
   */
  importAll(data: ExportedData): Promise<void>;
}

export interface StorageStats {
  entityCount: number;
  relationCount: number;
  storageSize: number;
  lastModified: Date;
}

export interface ExportedData {
  version: string;
  exportedAt: Date;
  entities: Entity[];
  relations: Relation[];
}

// ============================================================================
// In-Memory Storage
// ============================================================================

/**
 * In-memory storage implementation (for testing/small datasets)
 */
export class MemoryStorage implements StorageBackend {
  private entities: Map<string, Entity> = new Map();
  private relations: Map<string, Relation> = new Map();
  private entityIndex: Map<string, Set<string>> = new Map();
  private relationIndex: Map<string, Set<string>> = new Map();

  async initialize(): Promise<void> {
    // No-op for memory storage
  }

  async close(): Promise<void> {
    this.entities.clear();
    this.relations.clear();
    this.entityIndex.clear();
    this.relationIndex.clear();
  }

  async saveEntity(entity: Entity): Promise<void> {
    this.entities.set(entity.id, entity);

    // Update index
    if (!this.entityIndex.has(entity.type)) {
      this.entityIndex.set(entity.type, new Set());
    }
    this.entityIndex.get(entity.type)!.add(entity.id);
  }

  async getEntity(id: string): Promise<Entity | null> {
    return this.entities.get(id) || null;
  }

  async deleteEntity(id: string): Promise<void> {
    const entity = this.entities.get(id);
    if (entity) {
      this.entities.delete(id);
      this.entityIndex.get(entity.type)?.delete(id);
    }
  }

  async saveRelation(relation: Relation): Promise<void> {
    this.relations.set(relation.id, relation);

    // Update index
    if (!this.relationIndex.has(relation.type)) {
      this.relationIndex.set(relation.type, new Set());
    }
    this.relationIndex.get(relation.type)!.add(relation.id);
  }

  async getRelation(id: string): Promise<Relation | null> {
    return this.relations.get(id) || null;
  }

  async deleteRelation(id: string): Promise<void> {
    const relation = this.relations.get(id);
    if (relation) {
      this.relations.delete(id);
      this.relationIndex.get(relation.type)?.delete(id);
    }
  }

  async getAllEntities(): Promise<Entity[]> {
    return Array.from(this.entities.values());
  }

  async getAllRelations(): Promise<Relation[]> {
    return Array.from(this.relations.values());
  }

  async queryEntitiesByType(type: string): Promise<Entity[]> {
    const ids = this.entityIndex.get(type);
    if (!ids) return [];
    return Array.from(ids)
      .map((id) => this.entities.get(id))
      .filter((e): e is Entity => e !== undefined);
  }

  async queryRelationsByType(type: string): Promise<Relation[]> {
    const ids = this.relationIndex.get(type);
    if (!ids) return [];
    return Array.from(ids)
      .map((id) => this.relations.get(id))
      .filter((r): r is Relation => r !== undefined);
  }

  async getStats(): Promise<StorageStats> {
    return {
      entityCount: this.entities.size,
      relationCount: this.relations.size,
      storageSize: JSON.stringify(Array.from(this.entities.values())).length +
                   JSON.stringify(Array.from(this.relations.values())).length,
      lastModified: new Date(),
    };
  }

  async exportAll(): Promise<ExportedData> {
    return {
      version: '1.0.0',
      exportedAt: new Date(),
      entities: Array.from(this.entities.values()),
      relations: Array.from(this.relations.values()),
    };
  }

  async importAll(data: ExportedData): Promise<void> {
    for (const entity of data.entities) {
      await this.saveEntity(entity);
    }
    for (const relation of data.relations) {
      await this.saveRelation(relation);
    }
  }
}

// ============================================================================
// LevelDB Storage
// ============================================================================

/**
 * LevelDB-based storage for persistence
 */
export class LevelDBStorage implements StorageBackend {
  private db: unknown;
  private path: string;
  private initialized: boolean = false;

  constructor(path: string) {
    this.path = path;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Dynamic import for optional dependency
      const { Level } = await import('level');
      this.db = new Level(this.path, { valueEncoding: 'json' });
      await this.db.open();
      this.initialized = true;
    } catch (error) {
      console.warn('LevelDB not available, falling back to memory storage');
      throw error;
    }
  }

  async close(): Promise<void> {
    if (this.db && typeof (this.db as { close?: () => Promise<void> }).close === 'function') {
      await (this.db as { close: () => Promise<void> }).close();
    }
    this.initialized = false;
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  async saveEntity(entity: Entity): Promise<void> {
    await this.ensureInitialized();
    await (this.db as { put: (key: string, value: Entity) => Promise<void> }).put(
      `entity:${entity.id}`,
      entity
    );
  }

  async getEntity(id: string): Promise<Entity | null> {
    await this.ensureInitialized();
    try {
      return await (this.db as { get: (key: string) => Promise<Entity> }).get(
        `entity:${id}`
      );
    } catch {
      return null;
    }
  }

  async deleteEntity(id: string): Promise<void> {
    await this.ensureInitialized();
    try {
      await (this.db as { del: (key: string) => Promise<void> }).del(`entity:${id}`);
    } catch {
      // Ignore if not found
    }
  }

  async saveRelation(relation: Relation): Promise<void> {
    await this.ensureInitialized();
    await (this.db as { put: (key: string, value: Relation) => Promise<void> }).put(
      `relation:${relation.id}`,
      relation
    );
  }

  async getRelation(id: string): Promise<Relation | null> {
    await this.ensureInitialized();
    try {
      return await (this.db as { get: (key: string) => Promise<Relation> }).get(
        `relation:${id}`
      );
    } catch {
      return null;
    }
  }

  async deleteRelation(id: string): Promise<void> {
    await this.ensureInitialized();
    try {
      await (this.db as { del: (key: string) => Promise<void> }).del(`relation:${id}`);
    } catch {
      // Ignore if not found
    }
  }

  async getAllEntities(): Promise<Entity[]> {
    await this.ensureInitialized();
    const entities: Entity[] = [];

    // @ts-ignore - LevelDB iterator
    for await (const [key, value] of this.db.iterator()) {
      if (key.startsWith('entity:')) {
        entities.push(value as Entity);
      }
    }

    return entities;
  }

  async getAllRelations(): Promise<Relation[]> {
    await this.ensureInitialized();
    const relations: Relation[] = [];

    // @ts-ignore - LevelDB iterator
    for await (const [key, value] of this.db.iterator()) {
      if (key.startsWith('relation:')) {
        relations.push(value as Relation);
      }
    }

    return relations;
  }

  async queryEntitiesByType(type: string): Promise<Entity[]> {
    const all = await this.getAllEntities();
    return all.filter((e) => e.type === type);
  }

  async queryRelationsByType(type: string): Promise<Relation[]> {
    const all = await this.getAllRelations();
    return all.filter((r) => r.type === type);
  }

  async getStats(): Promise<StorageStats> {
    const entities = await this.getAllEntities();
    const relations = await this.getAllRelations();

    return {
      entityCount: entities.length,
      relationCount: relations.length,
      storageSize: 0, // Would need fs operations
      lastModified: new Date(),
    };
  }

  async exportAll(): Promise<ExportedData> {
    return {
      version: '1.0.0',
      exportedAt: new Date(),
      entities: await this.getAllEntities(),
      relations: await this.getAllRelations(),
    };
  }

  async importAll(data: ExportedData): Promise<void> {
    await this.ensureInitialized();
    for (const entity of data.entities) {
      await this.saveEntity(entity);
    }
    for (const relation of data.relations) {
      await this.saveRelation(relation);
    }
  }
}

// ============================================================================
// Storage Manager
// ============================================================================

/**
 * Manages storage backends and provides a unified interface
 */
export class StorageManager {
  private backend: StorageBackend;
  private nodeId: string;

  constructor(backend: StorageBackend, nodeId: string) {
    this.backend = backend;
    this.nodeId = nodeId;
  }

  /**
   * Create a storage manager with the specified type
   */
  static async create(
    type: 'memory' | 'leveldb',
    options: { path?: string; nodeId: string }
  ): Promise<StorageManager> {
    let backend: StorageBackend;

    if (type === 'leveldb' && options.path) {
      backend = new LevelDBStorage(options.path);
    } else {
      backend = new MemoryStorage();
    }

    await backend.initialize();
    return new StorageManager(backend, options.nodeId);
  }

  /**
   * Get the underlying backend
   */
  getBackend(): StorageBackend {
    return this.backend;
  }

  /**
   * Close the storage
   */
  async close(): Promise<void> {
    await this.backend.close();
  }

  /**
   * Sync graph to storage
   */
  async syncFromGraph(graph: NexusGraph): Promise<void> {
    for (const entity of graph.entities.values()) {
      await this.backend.saveEntity(entity);
    }
    for (const relation of graph.relations.values()) {
      await this.backend.saveRelation(relation);
    }
  }

  /**
   * Load graph from storage
   */
  async loadGraph(name: string): Promise<NexusGraph> {
    const entities = await this.backend.getAllEntities();
    const relations = await this.backend.getAllRelations();

    const graph = new NexusGraph({
      name,
      nodeId: this.nodeId,
    });

    for (const entity of entities) {
      graph.entities.set(entity.id, entity);
    }
    for (const relation of relations) {
      graph.relations.set(relation.id, relation);
    }

    return graph;
  }
}

// ============================================================================
// Export
// ============================================================================

export {
  StorageBackend,
  MemoryStorage,
  LevelDBStorage,
  StorageManager,
  StorageStats,
  ExportedData,
};
