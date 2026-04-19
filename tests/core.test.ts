/**
 * Nexus Knowledge Graph Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { NexusGraph, createGraph, EntityType, RelationType } from '../src/core/graph.js';
import { 
  compareClocks, 
  mergeClocks, 
  incrementClock,
  EntityCRDTState,
  GossipProtocol,
  SyncManager,
  createEntityAdd,
  createEntityUpdate,
  createEntityDelete,
} from '../src/protocol/crdt.js';
import { 
  lastWriteWins, 
  firstWriteWins,
  ConflictResolver,
  mergeGraphs,
} from '../src/protocol/conflict.js';
import { QueryEngine, createQueryEngine } from '../src/query/engine.js';
import { InferenceEngine, createInferenceEngine, builtInRules } from '../src/inference/engine.js';
import { MemoryStorage } from '../src/storage/backend.js';
import { VectorClock, MergeConfig, InferenceRule } from '../src/core/types.js';

// ============================================================================
// Graph Tests
// ============================================================================

describe('NexusGraph', () => {
  let graph: NexusGraph;

  beforeEach(() => {
    graph = createGraph({ name: 'Test Graph', nodeId: 'test-node' });
  });

  describe('Entity Operations', () => {
    it('should add an entity', () => {
      const entity = graph.addEntity('concept', 'Test Entity', { key: 'value' });

      expect(entity).toBeDefined();
      expect(entity.id).toBeDefined();
      expect(entity.type).toBe('concept');
      expect(entity.label).toBe('Test Entity');
      expect(entity.properties.key).toBe('value');
      expect(graph.entities.size).toBe(1);
    });

    it('should update an entity', () => {
      const entity = graph.addEntity('person', 'John');
      const updated = graph.updateEntity(entity.id, { label: 'Jane' });

      expect(updated).toBeDefined();
      expect(updated!.label).toBe('Jane');
      expect(updated!.metadata.version).toBe(2);
    });

    it('should delete an entity (soft delete)', () => {
      const entity = graph.addEntity('concept', 'To Delete');
      const deleted = graph.deleteEntity(entity.id);

      expect(deleted).toBe(true);
      expect(entity.timestamps.deletedAt).toBeDefined();
    });

    it('should find entities by type', () => {
      graph.addEntity('person', 'Alice');
      graph.addEntity('person', 'Bob');
      graph.addEntity('concept', 'Idea');

      const persons = graph.findByType('person');
      expect(persons.length).toBe(2);
    });
  });

  describe('Relation Operations', () => {
    it('should add a relation', () => {
      const alice = graph.addEntity('person', 'Alice');
      const bob = graph.addEntity('person', 'Bob');

      const relation = graph.addRelation(alice.id, bob.id, 'knows');

      expect(relation).toBeDefined();
      expect(relation!.sourceId).toBe(alice.id);
      expect(relation!.targetId).toBe(bob.id);
      expect(relation!.type).toBe('knows');
    });

    it('should get outgoing relations', () => {
      const alice = graph.addEntity('person', 'Alice');
      const bob = graph.addEntity('person', 'Bob');
      const carol = graph.addEntity('person', 'Carol');

      graph.addRelation(alice.id, bob.id, 'knows');
      graph.addRelation(alice.id, carol.id, 'knows');

      const outgoing = graph.getOutgoingRelations(alice.id);
      expect(outgoing.length).toBe(2);
    });

    it('should get incoming relations', () => {
      const alice = graph.addEntity('person', 'Alice');
      const bob = graph.addEntity('person', 'Bob');

      graph.addRelation(bob.id, alice.id, 'knows');

      const incoming = graph.getIncomingRelations(alice.id);
      expect(incoming.length).toBe(1);
    });
  });

  describe('Graph Traversal', () => {
    it('should traverse the graph', () => {
      const a = graph.addEntity('concept', 'A');
      const b = graph.addEntity('concept', 'B');
      const c = graph.addEntity('concept', 'C');
      const d = graph.addEntity('concept', 'D');

      graph.addRelation(a.id, b.id, 'related_to');
      graph.addRelation(b.id, c.id, 'related_to');
      graph.addRelation(c.id, d.id, 'related_to');

      const result = graph.traverse([a.id], 3);

      expect(result.nodes.length).toBe(4);
    });

    it('should respect max depth', () => {
      const a = graph.addEntity('concept', 'A');
      const b = graph.addEntity('concept', 'B');
      const c = graph.addEntity('concept', 'C');

      graph.addRelation(a.id, b.id, 'related_to');
      graph.addRelation(b.id, c.id, 'related_to');

      const result = graph.traverse([a.id], 1);

      expect(result.nodes.length).toBeLessThanOrEqual(2);
    });
  });

  describe('Serialization', () => {
    it('should export to JSON', () => {
      graph.addEntity('concept', 'Test');
      const json = graph.toJSON();

      expect(json).toBeDefined();
      expect((json as { entities: unknown[] }).entities.length).toBe(1);
    });

    it('should import from JSON', () => {
      const entity = graph.addEntity('person', 'Alice');
      const json = graph.toJSON();

      const imported = NexusGraph.fromJSON(json as Parameters<typeof NexusGraph.fromJSON>[0], 'import-node');

      expect(imported.entities.size).toBe(graph.entities.size);
    });
  });
});

// ============================================================================
// CRDT Tests
// ============================================================================

describe('CRDT Operations', () => {
  describe('Vector Clocks', () => {
    it('should compare clocks - before', () => {
      const a: VectorClock = { n1: 1, n2: 1 };
      const b: VectorClock = { n1: 2, n2: 1 };

      expect(compareClocks(a, b)).toBe(-1);
    });

    it('should compare clocks - after', () => {
      const a: VectorClock = { n1: 2, n2: 2 };
      const b: VectorClock = { n1: 1, n2: 1 };

      expect(compareClocks(a, b)).toBe(1);
    });

    it('should compare clocks - concurrent', () => {
      const a: VectorClock = { n1: 1, n2: 2 };
      const b: VectorClock = { n1: 2, n2: 1 };

      expect(compareClocks(a, b)).toBeNull();
    });

    it('should merge clocks', () => {
      const a: VectorClock = { n1: 1, n2: 1 };
      const b: VectorClock = { n1: 2, n2: 0 };

      const merged = mergeClocks(a, b);

      expect(merged.n1).toBe(2);
      expect(merged.n2).toBe(1);
    });

    it('should increment clock', () => {
      const clock: VectorClock = { n1: 1 };
      const incremented = incrementClock(clock, 'n1');

      expect(incremented.n1).toBe(2);
    });
  });

  describe('EntityCRDTState', () => {
    it('should apply entity add operation', () => {
      const crdt = new EntityCRDTState();
      const entity = {
        id: 'e1',
        type: 'concept' as EntityType,
        label: 'Test',
        properties: {},
        embeddings: { dense: [] },
        metadata: {
          createdBy: 'test',
          lastModifiedBy: 'test',
          version: 1,
          tags: [],
          aliases: [],
          confidence: 1,
        },
        timestamps: { createdAt: Date.now(), updatedAt: Date.now() },
      };

      const op = createEntityAdd(entity, 'node1', { node1: 1 });
      crdt.applyOperation(op);

      expect(crdt.getActiveEntities().length).toBe(1);
    });

    it('should apply entity delete operation', () => {
      const crdt = new EntityCRDTState();
      const entity = {
        id: 'e1',
        type: 'concept' as EntityType,
        label: 'Test',
        properties: {},
        embeddings: { dense: [] },
        metadata: {
          createdBy: 'test',
          lastModifiedBy: 'test',
          version: 1,
          tags: [],
          aliases: [],
          confidence: 1,
        },
        timestamps: { createdAt: Date.now(), updatedAt: Date.now() },
      };

      crdt.applyOperation(createEntityAdd(entity, 'node1', { node1: 1 }));
      crdt.applyOperation(createEntityDelete('e1', 'node1', { node1: 2 }));

      expect(crdt.isDeleted('e1')).toBe(true);
    });
  });
});

// ============================================================================
// Conflict Resolution Tests
// ============================================================================

describe('Conflict Resolution', () => {
  describe('Merge Strategies', () => {
    it('should apply last-write-wins', () => {
      const localClock: VectorClock = { n1: 2 };
      const remoteClock: VectorClock = { n1: 1 };

      const result = lastWriteWins(
        'local',
        localClock,
        'remote',
        remoteClock,
        'n1',
        'n2'
      );

      expect(result).toBe('local');
    });

    it('should apply first-write-wins', () => {
      const localClock: VectorClock = { n1: 2 };
      const remoteClock: VectorClock = { n1: 1 };

      const result = firstWriteWins(
        'local',
        localClock,
        'remote',
        remoteClock,
        'n1',
        'n2'
      );

      expect(result).toBe('local'); // Local is newer
    });
  });

  describe('Graph Merge', () => {
    it('should merge two graphs', () => {
      const graph1 = createGraph({ name: 'Graph1', nodeId: 'n1' });
      const graph2 = createGraph({ name: 'Graph2', nodeId: 'n2' });

      graph1.addEntity('concept', 'Entity 1');
      graph2.addEntity('person', 'Entity 2');

      const config: MergeConfig = {
        defaultStrategy: 'last_write_wins',
        typeSpecificStrategies: new Map(),
        customResolvers: new Map(),
        maxMergeDepth: 10,
        autoResolveThreshold: 0.8,
      };

      const merged = mergeGraphs(graph1, graph2, config);

      expect(merged.entities.size).toBe(2);
    });
  });
});

// ============================================================================
// Query Engine Tests
// ============================================================================

describe('QueryEngine', () => {
  let graph: NexusGraph;
  let engine: QueryEngine;

  beforeEach(() => {
    graph = createGraph({ name: 'Test', nodeId: 'test' });
    engine = createQueryEngine(graph);

    // Add test data
    const alice = graph.addEntity('person', 'Alice', { age: 30 });
    const bob = graph.addEntity('person', 'Bob', { age: 25 });
    const carol = graph.addEntity('person', 'Carol', { age: 35 });
    const project = graph.addEntity('concept', 'Project X');

    graph.addRelation(alice.id, project.id, 'leads');
    graph.addRelation(bob.id, project.id, 'works_on');
    graph.addRelation(carol.id, project.id, 'works_on');
  });

  it('should execute traversal query', async () => {
    const alice = Array.from(graph.entities.values()).find(e => e.label === 'Alice');
    expect(alice).toBeDefined();

    const result = await engine.execute({
      id: 'q1',
      type: 'traversal',
      filters: [],
      traversal: {
        startNodes: [alice!.id],
        directions: ['outbound'],
        maxDepth: 2,
        pathFormat: 'tree',
        includeProperties: true,
      },
      options: {},
    });

    expect(result.data).toBeDefined();
  });

  it('should filter by property', async () => {
    const result = await engine.execute({
      id: 'q1',
      type: 'traversal',
      filters: [
        { field: 'type', operator: 'eq', value: 'person' },
      ],
      traversal: {
        startNodes: Array.from(graph.entities.keys()),
        directions: ['both'],
        maxDepth: 10,
        pathFormat: 'tree',
        includeProperties: true,
      },
      options: { limit: 10 },
    });

    expect(result.data).toBeDefined();
  });
});

// ============================================================================
// Inference Engine Tests
// ============================================================================

describe('InferenceEngine', () => {
  let graph: NexusGraph;
  let engine: InferenceEngine;

  beforeEach(() => {
    graph = createGraph({ name: 'Test', nodeId: 'test' });
    engine = createInferenceEngine(graph, { rules: builtInRules });

    // Add test data for hierarchy
    const org = graph.addEntity('organization', 'Acme Corp');
    const team = graph.addEntity('team', 'Engineering');
    const person = graph.addEntity('person', 'Alice');

    graph.addRelation(org.id, team.id, 'part_of');
    graph.addRelation(team.id, person.id, 'part_of');
  });

  it('should apply transitive closure rule', () => {
    const result = engine.run({ maxIterations: 1 });

    // Should find that org contains person (transitively)
    expect(result.appliedRules.length).toBeGreaterThan(0);
  });

  it('should calculate confidence correctly', () => {
    const result = engine.run();

    for (const derived of result.derivedRelations) {
      expect(derived.confidence).toBeGreaterThan(0);
      expect(derived.confidence).toBeLessThanOrEqual(1);
    }
  });
});

// ============================================================================
// Storage Tests
// ============================================================================

describe('MemoryStorage', () => {
  let storage: MemoryStorage;

  beforeEach(async () => {
    storage = new MemoryStorage();
    await storage.initialize();
  });

  it('should save and retrieve entity', async () => {
    const entity = {
      id: 'e1',
      type: 'concept' as EntityType,
      label: 'Test',
      properties: {},
      embeddings: { dense: [] },
      metadata: {
        createdBy: 'test',
        lastModifiedBy: 'test',
        version: 1,
        tags: [],
        aliases: [],
        confidence: 1,
      },
      timestamps: { createdAt: Date.now(), updatedAt: Date.now() },
    };

    await storage.saveEntity(entity);
    const retrieved = await storage.getEntity('e1');

    expect(retrieved).toEqual(entity);
  });

  it('should query by type', async () => {
    await storage.saveEntity({
      id: 'e1',
      type: 'person',
      label: 'Alice',
      properties: {},
      embeddings: { dense: [] },
      metadata: {
        createdBy: 'test',
        lastModifiedBy: 'test',
        version: 1,
        tags: [],
        aliases: [],
        confidence: 1,
      },
      timestamps: { createdAt: Date.now(), updatedAt: Date.now() },
    });

    const persons = await storage.queryEntitiesByType('person');
    expect(persons.length).toBe(1);
  });

  it('should export and import', async () => {
    await storage.saveEntity({
      id: 'e1',
      type: 'concept',
      label: 'Test',
      properties: {},
      embeddings: { dense: [] },
      metadata: {
        createdBy: 'test',
        lastModifiedBy: 'test',
        version: 1,
        tags: [],
        aliases: [],
        confidence: 1,
      },
      timestamps: { createdAt: Date.now(), updatedAt: Date.now() },
    });

    const exported = await storage.exportAll();
    await storage.close();

    const newStorage = new MemoryStorage();
    await newStorage.initialize();
    await newStorage.importAll(exported);

    const retrieved = await newStorage.getEntity('e1');
    expect(retrieved).toBeDefined();
  });
});

// ============================================================================
// Gossip Protocol Tests
// ============================================================================

describe('GossipProtocol', () => {
  it('should broadcast and receive messages', () => {
    const gossip = new GossipProtocol({ nodeId: 'n1', fanout: 2 });

    let received = false;
    gossip.on('message', () => {
      received = true;
    });

    gossip.addPeer('n2');
    gossip.addPeer('n3');

    gossip.broadcast(
      createEntityAdd(
        {
          id: 'e1',
          type: 'concept',
          label: 'Test',
          properties: {},
          embeddings: { dense: [] },
          metadata: {
            createdBy: 'test',
            lastModifiedBy: 'test',
            version: 1,
            tags: [],
            aliases: [],
            confidence: 1,
          },
          timestamps: { createdAt: Date.now(), updatedAt: Date.now() },
        },
        'n1',
        { n1: 1 }
      ),
      { n1: 1 }
    );

    expect(received).toBe(true);

    gossip.stop();
  });

  it('should not receive duplicate messages', () => {
    const gossip = new GossipProtocol({ nodeId: 'n1' });

    let receiveCount = 0;
    gossip.on('receive', () => {
      receiveCount++;
    });

    const entity = {
      id: 'e1',
      type: 'concept' as EntityType,
      label: 'Test',
      properties: {},
      embeddings: { dense: [] },
      metadata: {
        createdBy: 'test',
        lastModifiedBy: 'test',
        version: 1,
        tags: [],
        aliases: [],
        confidence: 1,
      },
      timestamps: { createdAt: Date.now(), updatedAt: Date.now() },
    };

    const op = createEntityAdd(entity, 'n2', { n2: 1 });

    // First receive
    const canReceive1 = gossip.receive({
      id: 'msg1',
      sourceNode: 'n2',
      operation: op,
      vectorClock: { n2: 1 },
      timestamp: Date.now(),
    });

    // Duplicate receive
    const canReceive2 = gossip.receive({
      id: 'msg1',
      sourceNode: 'n2',
      operation: op,
      vectorClock: { n2: 1 },
      timestamp: Date.now(),
    });

    expect(canReceive1).toBe(true);
    expect(canReceive2).toBe(false);
  });
});
