# Nexus - Federated Knowledge Graph Engine

[![CI](https://github.com/moggan1337/Nexus/actions/workflows/ci.yml/badge.svg)](https://github.com/moggan1337/Nexus/actions/workflows/ci.yml)

<div align="center">

![Nexus Logo](https://img.shields.io/badge/Nexus-Knowledge%20Graph-4A90D9?style=for-the-badge)
![TypeScript](https://img.shields.io/badge/TypeScript-5.3-3178C6?style=for-the-badge)
![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=for-the-badge)
![License](https://img.shields.io/badge/License-MIT-F05032?style=for-the-badge)

**A distributed, federated knowledge graph engine with CRDT-based synchronization**

[Nexus Documentation](#architecture) • [Quick Start](#quick-start) • [API Reference](#api-reference) • [Examples](#examples) • [Contributing](#contributing)

</div>

---

## 🎬 Demo
![Nexus Demo](demo.gif)

*Federated knowledge graph with CRDT sync*

## Screenshots
| Component | Preview |
|-----------|---------|
| Graph Explorer | ![explorer](screenshots/graph-explorer.png) |
| Federation Status | ![federation](screenshots/federation.png) |
| Query Builder | ![query](screenshots/query-builder.png) |

## Visual Description
Graph explorer shows entities and relationships with interactive navigation. Federation status displays connected knowledge bases with sync state. Query builder provides visual query construction.

---


## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Core Concepts](#core-concepts)
- [API Reference](#api-reference)
- [Federation Protocol](#federation-protocol)
- [CRDT Synchronization](#crdt-synchronization)
- [Query Engine](#query-engine)
- [Inference Engine](#inference-engine)
- [Visualization](#visualization)
- [Examples](#examples)
- [Configuration](#configuration)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

Nexus is a **federated knowledge graph engine** designed for building distributed, interconnected knowledge bases. It provides:

- **Graph Storage**: Efficient storage and retrieval of entities and relations with embeddings
- **Federation**: Multi-node synchronization using CRDT (Conflict-free Replicated Data Types)
- **Conflict Resolution**: Intelligent merge strategies for distributed updates
- **Query Engine**: Hybrid traversal and vector similarity search
- **Inference Engine**: Rule-based reasoning to derive new knowledge
- **Visualization**: Interactive web-based graph visualization

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              NEXUS ARCHITECTURE                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────────┐     ┌─────────────┐     ┌─────────────┐                   │
│   │   Node A    │◄───►│   Node B    │◄───►│   Node C    │                   │
│   │  ┌───────┐  │     │  ┌───────┐  │     │  ┌───────┐  │                   │
│   │  │ Graph │  │     │  │ Graph │  │     │  │ Graph │  │                   │
│   │  └───────┘  │     │  └───────┘  │     │  └───────┘  │                   │
│   │  ┌───────┐  │     │  ┌───────┐  │     │  ┌───────┐  │                   │
│   │  │ CRDT  │  │     │  │ CRDT  │  │     │  │ CRDT  │  │                   │
│   │  └───────┘  │     │  └───────┘  │     │  └───────┘  │                   │
│   └──────┬──────┘     └──────┬──────┘     └──────┬──────┘                   │
│          │                   │                   │                           │
│          └───────────────────┼───────────────────┘                           │
│                              │                                               │
│                    ┌────────▼────────┐                                      │
│                    │  Gossip Protocol │                                      │
│                    │  (CRDT Sync)     │                                      │
│                    └─────────────────┘                                      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              NEXUS STACK                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────────────────────────────────────────────────────────────┐     │
│   │                        Application Layer                          │     │
│   │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │     │
│   │  │    CLI        │  │   Web UI     │  │   REST API   │          │     │
│   │  │  (Terminal)   │  │ (Visualizer) │  │  (HTTP/JSON) │          │     │
│   │  └──────────────┘  └──────────────┘  └──────────────┘          │     │
│   └─────────────────────────────────────────────────────────────────┘     │
│                                    │                                         │
│   ┌─────────────────────────────────────────────────────────────────┐     │
│   │                        Core Engine                                │     │
│   │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │     │
│   │  │   Query      │  │  Inference   │  │  Storage     │          │     │
│   │  │   Engine     │  │   Engine     │  │   Manager    │          │     │
│   │  └──────────────┘  └──────────────┘  └──────────────┘          │     │
│   └─────────────────────────────────────────────────────────────────┘     │
│                                    │                                         │
│   ┌─────────────────────────────────────────────────────────────────┐     │
│   │                     Graph Layer                                  │     │
│   │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │     │
│   │  │   Entities   │  │  Relations   │  │  Embeddings  │          │     │
│   │  │   (Nodes)    │  │   (Edges)    │  │  (Vectors)   │          │     │
│   │  └──────────────┘  └──────────────┘  └──────────────┘          │     │
│   └─────────────────────────────────────────────────────────────────┘     │
│                                    │                                         │
│   ┌─────────────────────────────────────────────────────────────────┐     │
│   │                   Federation Layer                               │     │
│   │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │     │
│   │  │    CRDT     │  │    Gossip    │  │   Conflict   │          │     │
│   │  │   State     │  │   Protocol   │  │  Resolution  │          │     │
│   │  └──────────────┘  └──────────────┘  └──────────────┘          │     │
│   └─────────────────────────────────────────────────────────────────┘     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Knowledge Graph Structure

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         KNOWLEDGE GRAPH STRUCTURE                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│                              Entity (Node)                                  │
│   ┌─────────────────────────────────────────────────────────────────┐      │
│   │  id: "01HQ..."                    (ULID - sortable identifier)   │      │
│   │  type: "person"                   (EntityType enum)            │      │
│   │  label: "Alice Johnson"                                       │      │
│   │  properties: {                                                  │      │
│   │    "role": "Researcher",                                       │      │
│   │    "department": "AI Lab",                                      │      │
│   │    "skills": ["ML", "NLP"]                                      │      │
│   │  }                                                              │      │
│   │  embeddings: {                                                  │      │
│   │    dense: [0.123, -0.456, ...]    (1536-dimensional vector)     │      │
│   │    metadata: { model: "text-embedding-3", dimensions: 1536 }   │      │
│   │  }                                                              │      │
│   │  metadata: {                                                     │      │
│   │    version: 3,                                                  │      │
│   │    tags: ["team", "ai"],                                        │      │
│   │    confidence: 0.95                                             │      │
│   │  }                                                              │      │
│   └─────────────────────────────────────────────────────────────────┘      │
│                                                                             │
│                              Relation (Edge)                                 │
│   ┌─────────────────────────────────────────────────────────────────┐      │
│   │  id: "01HQ..."                                                      │      │
│   │  sourceId: "01HQ...A"    ─────────┐                              │      │
│   │  targetId: "01HQ...B"    ─────────┼──────►                      │      │
│   │  type: "collaborates_with"        │                             │      │
│   │  weight: 0.85                      │                             │      │
│   │  properties: {                    │                             │      │
│   │    "since": 2023,                  │                             │      │
│   │    "project": "Nexus"             │                             │      │
│   │  }                                │                             │      │
│   │  metadata: {                       │                             │      │
│   │    bidirectional: false,          │                             │      │
│   │    confidence: 0.9                │                             │      │
│   │  }                                │                             │      │
│   └─────────────────────────────────────────────────────────────────┘      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Entity Types

| Type | Description | Example |
|------|-------------|---------|
| `concept` | Abstract concepts and ideas | "Artificial Intelligence" |
| `person` | Human beings | "Alan Turing" |
| `organization` | Companies, institutions | "MIT", "Google" |
| `location` | Geographic places | "San Francisco" |
| `event` | Things that happen | "Conference 2024" |
| `document` | Textual content | "Research Paper" |
| `resource` | Resources and assets | "GPU Cluster" |

### Relation Types

| Type | Description | Bidirectional |
|------|-------------|---------------|
| `owns` | Ownership relationship | No |
| `manages` | Management hierarchy | No |
| `part_of` | Membership/hierarchy | No |
| `located_in` | Geographic containment | No |
| `created_by` | Authorship | No |
| `related_to` | General association | Yes |
| `depends_on` | Dependency | No |
| `implements` | Implementation | No |
| `references` | Citation/link | No |

---

## Features

### 🚀 Core Features

- **In-Memory Graph Store**: Fast, optimized graph operations with O(1) entity lookups
- **Entity Management**: Full CRUD with versioning and soft deletes
- **Relation Management**: Typed edges with weights and properties
- **Embedding Support**: Dense and sparse vector embeddings for semantic search

### 🔗 Federation

- **CRDT-Based Sync**: Conflict-free eventual consistency across nodes
- **Gossip Protocol**: Efficient peer-to-peer state dissemination
- **Vector Clocks**: Causality tracking for distributed operations
- **Multiple Merge Strategies**: LWW, FWW, Multi-Value, Source Priority

### 🔍 Query Engine

- **Graph Traversal**: Configurable depth, direction, and filtering
- **Vector Similarity Search**: Cosine, Euclidean, Dot Product metrics
- **Hybrid Search**: Combine traversal with semantic search
- **Pattern Matching**: Graph pattern queries
- **Aggregations**: Count, sum, average, min, max, cardinality

### 🧠 Inference Engine

- **Rule-Based Reasoning**: Custom inference rules
- **Transitive Closure**: Derive indirect relationships
- **Confidence Scoring**: Probabilistic inference
- **Built-in Rules**: Common knowledge graph inference patterns

### 📊 Visualization

- **Interactive Web UI**: Canvas-based graph renderer
- **Force-Directed Layout**: Automatic node positioning
- **Zoom & Pan**: Navigate large graphs
- **Entity Details**: Click nodes for information

---

## Installation

### Prerequisites

- Node.js >= 18.0.0
- npm or yarn

### Install via npm

```bash
npm install nexus-knowledge-graph
```

### Install from Source

```bash
git clone https://github.com/moggan1337/Nexus.git
cd Nexus
npm install
npm run build
```

### Install Dependencies

```bash
npm install
```

---

## Quick Start

### Using the Library

```typescript
import { createNexus } from 'nexus-knowledge-graph';

// Create a new Nexus instance
const nexus = await createNexus({
  nodeId: 'my-node',
  inference: {
    enabled: true,
    maxIterations: 10,
    confidenceThreshold: 0.5,
  },
});

// Add entities
const alice = nexus.addEntity('person', 'Alice Johnson', {
  role: 'Researcher',
  department: 'AI Lab',
}, undefined, { tags: ['team', 'ai'] });

const bob = nexus.addEntity('person', 'Bob Smith', {
  role: 'Engineer',
  department: 'Platform',
});

// Create relations
nexus.addRelation(alice.id, bob.id, 'manages');
nexus.addRelation(alice.id, bob.id, 'collaborates_with');

// Query the graph
const stats = nexus.getStats();
console.log(`Entities: ${stats.entityCount}, Relations: ${stats.relationCount}`);

// Traverse from Alice
const traversal = nexus.traverse([alice.id], 2, {
  directions: ['outbound'],
  relationTypes: ['manages'],
});

console.log(`Found ${traversal.nodes.length} nodes`);
```

### Using the CLI

```bash
# Start the CLI
npm run dev

# In the CLI, try these commands:
nexus> help
nexus> stats
nexus> add person "John Doe" {"age": 30}
nexus> list
nexus> traverse <entity-id> 2
nexus> infer
nexus> exit
```

### Using the Web UI

```bash
# Start the visualization server
npm run visualize

# Open http://localhost:3000
```

---

## Core Concepts

### Entities

Entities are the nodes in your knowledge graph:

```typescript
const entity = nexus.addEntity(
  'concept',              // Type
  'Machine Learning',     // Label
  {                       // Properties (optional)
    founded: 1959,
    category: 'AI',
  },
  undefined,              // Embeddings (optional)
  {                       // Metadata (optional)
    tags: ['ai', 'ml'],
    confidence: 0.95,
  }
);
```

### Relations

Relations connect entities:

```typescript
const relation = nexus.addRelation(
  'source-entity-id',     // Source entity
  'target-entity-id',     // Target entity
  'related_to',          // Relation type
  { weight: 0.85 },      // Properties (optional)
  0.85                   // Weight (optional)
);
```

### Embeddings

Attach vector embeddings for semantic search:

```typescript
const entity = nexus.addEntity('concept', 'Neural Network', {
  // ... properties
}, {
  dense: [0.123, -0.456, 0.789, ...],  // 1536-dim embedding
  metadata: {
    model: 'text-embedding-3',
    dimensions: 1536,
    generatedAt: new Date(),
  }
});
```

### CRDT State

CRDT (Conflict-free Replicated Data Types) ensures eventual consistency:

```typescript
import { 
  EntityCRDTState,
  createEntityAdd,
  incrementClock,
} from 'nexus-knowledge-graph';

// Create CRDT state
const crdtState = new EntityCRDTState();

// Create an operation
const clock = { 'node-1': 1 };
const entity = { /* ... */ };
const op = createEntityAdd(entity, 'node-1', clock);

// Apply operation
crdtState.applyOperation(op);
```

---

## API Reference

### Nexus Class

#### `createNexus(config?)`
Create a new Nexus instance.

```typescript
const nexus = createNexus({
  nodeId: 'my-node',
  federation: {
    enabled: true,
    peers: ['peer-1', 'peer-2'],
    syncInterval: 5000,
  },
});
```

#### Entity Operations

##### `nexus.addEntity(type, label, properties?, embeddings?, metadata?)`
Add an entity to the graph.

```typescript
const entity = nexus.addEntity('person', 'Alice', { age: 30 });
```

##### `nexus.updateEntity(entityId, updates)`
Update an entity.

```typescript
const updated = nexus.updateEntity(entityId, {
  label: 'Alice Smith',
  properties: { age: 31 },
});
```

##### `nexus.deleteEntity(entityId)`
Delete an entity (soft delete).

```typescript
nexus.deleteEntity(entityId);
```

##### `nexus.getEntity(entityId)`
Get an entity by ID.

```typescript
const entity = nexus.getEntity(entityId);
```

#### Relation Operations

##### `nexus.addRelation(sourceId, targetId, type, properties?, weight?)`
Create a relation between entities.

```typescript
nexus.addRelation(aliceId, bobId, 'collaborates_with', { since: 2023 });
```

##### `nexus.getRelations(entityId)`
Get all relations for an entity.

```typescript
const relations = nexus.getRelations(entityId);
```

#### Query Operations

##### `nexus.query(query)`
Execute a graph query.

```typescript
const result = await nexus.query({
  id: 'my-query',
  type: 'traversal',
  filters: [],
  traversal: {
    startNodes: [entityId],
    directions: ['outbound'],
    maxDepth: 3,
    pathFormat: 'tree',
    includeProperties: true,
  },
  options: { limit: 100 },
});
```

##### `nexus.traverse(startIds, maxDepth?, options?)`
Traverse the graph.

```typescript
const result = nexus.traverse([startId], 3, {
  directions: ['outbound', 'inbound'],
  relationTypes: ['related_to'],
});
```

##### `nexus.searchByVector(embedding, k?, threshold?)`
Search by vector similarity.

```typescript
const results = await nexus.searchByVector(
  [0.123, -0.456, ...],
  10,
  0.7
);
```

##### `nexus.hybridSearch(startIds, embedding, options?)`
Combined traversal and vector search.

```typescript
const results = await nexus.hybridSearch(
  [entityId],
  [0.123, ...],
  { maxDepth: 2, k: 5 }
);
```

#### Inference Operations

##### `nexus.runInference(options?)`
Run the inference engine.

```typescript
const result = nexus.runInference({
  maxIterations: 10,
  confidenceThreshold: 0.5,
  ruleIds: ['transitive-closure'],
});
```

##### `nexus.applyInferences(result)`
Apply derived relations to the graph.

```typescript
const applied = nexus.applyInferences(result);
```

##### `nexus.addRule(rule)`
Add a custom inference rule.

```typescript
nexus.addRule({
  id: 'my-rule',
  name: 'My Custom Rule',
  description: 'Derives X from Y',
  antecedent: { entities: [], relations: [] },
  consequent: { source: 'A', target: 'B', relationType: 'related_to', confidence: 0.8 },
  confidence: 0.8,
  metadata: { domain: ['test'], createdBy: 'user' },
});
```

#### Federation Operations

##### `nexus.syncWithPeer(peerId)`
Sync with a peer node.

```typescript
await nexus.syncWithPeer('peer-node-id');
```

##### `nexus.mergeGraph(other)`
Merge another graph.

```typescript
nexus.mergeGraph(otherGraph);
```

##### `nexus.getFederationStatus()`
Get federation status.

```typescript
const status = nexus.getFederationStatus();
```

#### Persistence Operations

##### `nexus.save()`
Save graph to storage.

```typescript
await nexus.save();
```

##### `nexus.export()`
Export graph to JSON.

```typescript
const json = nexus.export();
```

##### `nexus.import(data)`
Import graph from JSON.

```typescript
nexus.import(jsonData);
```

---

## Federation Protocol

### Overview

Nexus uses a federated architecture where multiple nodes can work on the same knowledge graph independently and synchronize using CRDTs.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         FEDERATION ARCHITECTURE                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   Node 1                         Node 2                         Node 3        │
│   ┌───────────┐                 ┌───────────┐                 ┌───────────┐ │
│   │           │                 │           │                 │           │ │
│   │  ┌─────┐  │                 │  ┌─────┐  │                 │  ┌─────┐  │ │
│   │  │Local│  │                 │  │Local│  │                 │  │Local│  │ │
│   │  │Graph│  │                 │  │Graph│  │                 │  │Graph│  │ │
│   │  └─────┘  │                 │  └─────┘  │                 │  └─────┘  │ │
│   │  ┌─────┐  │                 │  ┌─────┐  │                 │  ┌─────┐  │ │
│   │  │CRDT │  │◄───────┐   ┌───►│  │CRDT │  │◄───────┐   ┌───►│  │CRDT │  │ │
│   │  │State│  │        │   │    │  │State│  │        │   │    │  │State│  │ │
│   │  └─────┘  │        │   │    │  └─────┘  │        │   │    │  └─────┘  │ │
│   └─────┬─────┘        │   │    └─────┬─────┘        │   │    └─────┬─────┘ │
│         │              │   │          │              │   │          │       │
│         └──────────────┼───┼──────────┼──────────────┼───┼──────────┘       │
│                        │   │          │              │   │                    │
│                   ┌────▼───▼────┐     │         ┌───▼───▼────┐              │
│                   │   Gossip    │     │         │   Gossip   │              │
│                   │  Protocol   │◄────┼────────►│  Protocol  │              │
│                   └─────────────┘     │         └────────────┘              │
│                                    ▲   ▲                                    │
│                                    │   │                                    │
│                         ┌──────────┴───┴──────────┐                        │
│                         │   Conflict Resolution   │                        │
│                         │     (CRDT Merge)       │                        │
│                         └─────────────────────────┘                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Vector Clocks

Each node maintains a vector clock to track causality:

```
Node A: { A: 3, B: 1, C: 2 }
Node B: { A: 2, B: 2, C: 2 }
Node C: { A: 2, B: 1, C: 3 }

Comparison:
- A > B?  Yes (A has 3 > 2 for itself)
- B > C?  No  (C has 3 > 2 for itself)
- A || C concurrent?  Yes (A > C for A, C > A for C)
```

### Gossip Protocol

Nodes periodically exchange state updates:

```typescript
const gossip = new GossipProtocol({
  nodeId: 'node-1',
  fanout: 3,        // Number of peers to contact per round
  interval: 1000,    // Milliseconds between gossip rounds
});

// Add peers
gossip.addPeer('node-2');
gossip.addPeer('node-3');

// Handle incoming messages
gossip.on('message', (msg) => {
  // Process incoming CRDT operations
});

// Start gossiping
gossip.start();
```

---

## CRDT Synchronization

### Operation Types

Nexus defines CRDT operations for all graph modifications:

```typescript
// Entity Operations
EntityAddOperation
EntityUpdateOperation  
EntityDeleteOperation  // Tombstone

// Relation Operations
RelationAddOperation
RelationUpdateOperation
RelationDeleteOperation
```

### CRDT State Management

```typescript
const crdtState = new EntityCRDTState();

// Apply an operation
crdtState.applyOperation({
  id: 'op-1',
  type: 'entity_add',
  nodeId: 'node-1',
  timestamp: { 'node-1': 1 },
  causallyReady: true,
  entity: { /* entity data */ },
});

// Check state
const active = crdtState.getActiveEntities();
const isDeleted = crdtState.isDeleted('entity-id');
```

### Conflict Resolution Strategies

| Strategy | Description | Use Case |
|----------|-------------|----------|
| `last_write_wins` | Latest timestamp wins | Simple, high-frequency updates |
| `first_write_wins` | First write wins | Audit trails, immutable data |
| `multi_value` | Preserve all values | Collaborative editing |
| `source_priority` | Configurable node priority | Trusted sources |

```typescript
const config: MergeConfig = {
  defaultStrategy: 'last_write_wins',
  typeSpecificStrategies: new Map([
    ['*:timestamp', 'first_write_wins'],
    ['*:content', 'multi_value'],
  ]),
  customResolvers: new Map([
    ['*:customField', (conflict, context) => customLogic(conflict)],
  ]),
  maxMergeDepth: 10,
  autoResolveThreshold: 0.8,
};
```

---

## Query Engine

### Query Types

#### Traversal Query

```typescript
const result = await nexus.query({
  id: 'my-traversal',
  type: 'traversal',
  filters: [
    { field: 'type', operator: 'eq', value: 'person' },
  ],
  traversal: {
    startNodes: [startEntityId],
    directions: ['outbound', 'inbound'],
    relationTypes: ['knows', 'collaborates_with'],
    maxDepth: 3,
    nodeFilters: [
      { field: 'properties.confidence', operator: 'gte', value: 0.8 },
    ],
    pathFormat: 'tree',
    includeProperties: true,
  },
  options: {
    limit: 100,
    offset: 0,
    timeout: 30000,
  },
});
```

#### Vector Query

```typescript
const result = await nexus.query({
  id: 'my-vector-search',
  type: 'vector',
  filters: [
    { field: 'type', operator: 'eq', value: 'concept' },
  ],
  vector: {
    embedding: [0.123, -0.456, ...],  // Query embedding
    metric: 'cosine',               // cosine | euclidean | dotproduct
    k: 10,                           // Number of results
    threshold: 0.7,                  // Minimum similarity
    hybrid: {
      vectorWeight: 0.6,
      keywordWeight: 0.4,
      fusion: 'rrf',                 // Reciprocal Rank Fusion
      rrfK: 60,
    },
  },
  options: {},
});
```

#### Hybrid Query

Combines traversal and vector search:

```typescript
const result = await nexus.query({
  id: 'my-hybrid',
  type: 'hybrid',
  filters: [],
  traversal: {
    startNodes: [rootId],
    directions: ['outbound'],
    maxDepth: 2,
    pathFormat: 'tree',
    includeProperties: true,
  },
  vector: {
    embedding: queryEmbedding,
    metric: 'cosine',
    k: 5,
    hybrid: {
      vectorWeight: 0.5,
      keywordWeight: 0.5,
      fusion: 'rrf',
    },
  },
  options: {},
});
```

### Filter Operators

| Operator | Description | Example |
|----------|-------------|---------|
| `eq` | Equal | `type: eq: person` |
| `neq` | Not equal | `status: neq: deleted` |
| `gt` | Greater than | `age: gt: 18` |
| `gte` | Greater than or equal | `score: gte: 0.8` |
| `lt` | Less than | `age: lt: 65` |
| `lte` | Less than or equal | `priority: lte: 5` |
| `in` | In array | `type: in: [person, org]` |
| `contains` | String contains | `label: contains: John` |
| `regex` | Regex match | `email: regex: @company\\.com$` |

---

## Inference Engine

### How It Works

The inference engine applies rule-based reasoning to derive new relations:

```typescript
// Built-in rule: Transitive Closure
{
  id: 'transitive-closure',
  name: 'Transitive Closure',
  antecedent: {
    entities: [
      { id: 'a', variable: 'A' },
      { id: 'b', variable: 'B' },
      { id: 'c', variable: 'C' },
    ],
    relations: [
      { source: 'A', target: 'B', type: 'related_to' },
      { source: 'B', target: 'C', type: 'related_to' },
    ],
  },
  consequent: {
    source: 'A',
    target: 'C',
    relationType: 'related_to',
    confidence: 0.7,
  },
  confidence: 0.7,
}
```

### Running Inference

```typescript
// Run inference
const result = nexus.runInference({
  maxIterations: 10,
  confidenceThreshold: 0.5,
});

// Apply derived relations to graph
const applied = nexus.applyInferences(result);

console.log(`Derived ${result.derivedRelations.length} relations`);
console.log(`Applied ${applied} to graph`);
```

### Custom Rules

```typescript
nexus.addRule({
  id: 'sibling-inference',
  name: 'Sibling Inference',
  description: 'If A and B share a parent, they are siblings',
  antecedent: {
    entities: [
      { id: 'a', variable: 'A', type: 'person' },
      { id: 'b', variable: 'B', type: 'person' },
      { id: 'p', variable: 'P' },
    ],
    relations: [
      { source: 'A', target: 'P', type: 'child_of' },
      { source: 'B', target: 'P', type: 'child_of' },
    ],
    constraints: [
      { entity: 'A', property: 'id', operator: 'neq', value: '' }, // A != B
    ],
  },
  consequent: {
    source: 'A',
    target: 'B',
    relationType: 'sibling_of',
    confidence: 0.9,
  },
  confidence: 0.9,
  metadata: {
    domain: ['family'],
    createdBy: 'user',
  },
});
```

---

## Visualization

### Web UI

Start the visualization server:

```bash
npm run visualize
# Server running at http://localhost:3000
```

### Features

- **Interactive Canvas**: Click, drag, zoom, pan
- **Force-Directed Layout**: Automatic node positioning
- **Entity Details Panel**: View properties on click
- **Add Entity/Relation**: Create new graph elements
- **Search**: Find entities by label
- **Export**: Download graph as JSON

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/graph` | GET | Get graph info |
| `/api/entities` | GET | List entities |
| `/api/entities/:id` | GET | Get entity |
| `/api/entities` | POST | Create entity |
| `/api/entities/:id` | PUT | Update entity |
| `/api/entities/:id` | DELETE | Delete entity |
| `/api/relations` | GET/POST | List/create relations |
| `/api/traverse` | POST | Traverse graph |
| `/api/visualize` | GET | Get visualization data |
| `/api/stats` | GET | Get statistics |
| `/api/export` | GET | Export graph |
| `/api/import` | POST | Import graph |

---

## Examples

### Basic Knowledge Graph

```typescript
import { createNexus } from 'nexus-knowledge-graph';

async function main() {
  const nexus = await createNexus({ nodeId: 'example' });

  // Create entities
  const ai = nexus.addEntity('concept', 'Artificial Intelligence');
  const ml = nexus.addEntity('concept', 'Machine Learning');
  const dl = nexus.addEntity('concept', 'Deep Learning');
  const bert = nexus.addEntity('concept', 'BERT');

  // Create relations
  nexus.addRelation(ml.id, ai.id, 'part_of');
  nexus.addRelation(dl.id, ml.id, 'part_of');
  nexus.addRelation(bert.id, dl.id, 'part_of');
  nexus.addRelation(bert.id, ml.id, 'part_of');

  // Query
  const stats = nexus.getStats();
  console.log(stats);

  // Traverse
  const result = nexus.traverse([ai.id], 3);
  console.log(`Found ${result.nodes.length} connected entities`);
}

main();
```

### Semantic Search

```typescript
async function semanticSearch() {
  const nexus = await createNexus({ nodeId: 'search-example' });

  // Add entities with embeddings
  const embeddings = {
    dense: await generateEmbedding('Machine Learning'),
  };

  nexus.addEntity('concept', 'Machine Learning', {}, embeddings);
  nexus.addEntity('concept', 'Deep Learning', {}, {
    dense: await generateEmbedding('Deep Learning'),
  });

  // Search
  const results = await nexus.searchByVector(
    await generateEmbedding('Neural networks and AI'),
    10,
    0.7
  );

  console.log('Top matches:', results.data.hits);
}

async function generateEmbedding(text: string): Promise<number[]> {
  // In production, use OpenAI, Cohere, or local model
  return Array.from({ length: 1536 }, () => Math.random() * 2 - 1);
}
```

### Federated Nodes

```typescript
async function federatedExample() {
  // Node 1
  const node1 = await createNexus({
    nodeId: 'node-1',
    federation: {
      enabled: true,
      peers: ['node-2', 'node-3'],
      syncInterval: 5000,
    },
  });

  // Node 2
  const node2 = await createNexus({
    nodeId: 'node-2',
    federation: {
      enabled: true,
      peers: ['node-1', 'node-3'],
      syncInterval: 5000,
    },
  });

  // Node 1 adds data
  const alice = node1.addEntity('person', 'Alice');

  // Sync
  await node1.syncWithPeer('node-2');

  // Node 2 should now have Alice
  const aliceOnNode2 = node2.getEntity(alice.id);
  console.log('Synced entity:', aliceOnNode2);
}
```

### Custom Inference

```typescript
async function customInference() {
  const nexus = await createNexus({ nodeId: 'inference-example' });

  // Add rule: Colleagues of colleagues are acquaintances
  nexus.addRule({
    id: 'colleague-chain',
    name: 'Colleague Chain',
    antecedent: {
      entities: [
        { id: 'a', variable: 'A' },
        { id: 'b', variable: 'B' },
        { id: 'c', variable: 'C' },
      ],
      relations: [
        { source: 'A', target: 'B', type: 'colleague' },
        { source: 'B', target: 'C', type: 'colleague' },
      ],
    },
    consequent: {
      source: 'A',
      target: 'C',
      relationType: 'acquaintance',
      confidence: 0.6,
    },
    confidence: 0.6,
    metadata: { domain: ['social'], createdBy: 'user' },
  });

  // Add test data
  const alice = nexus.addEntity('person', 'Alice');
  const bob = nexus.addEntity('person', 'Bob');
  const carol = nexus.addEntity('person', 'Carol');

  nexus.addRelation(alice.id, bob.id, 'colleague');
  nexus.addRelation(bob.id, carol.id, 'colleague');

  // Run inference
  const result = nexus.runInference();
  console.log('Inferred relations:', result.derivedRelations);
}
```

---

## Configuration

### Full Configuration Schema

```typescript
const config = {
  nodeId: 'my-node',
  
  storage: {
    type: 'memory',           // 'memory' | 'leveldb'
    path: './data/nexus',     // Path for LevelDB
  },
  
  federation: {
    enabled: true,
    peers: ['peer-1', 'peer-2'],
    syncInterval: 5000,       // ms
    conflictResolution: {
      defaultStrategy: 'last_write_wins',
      typeSpecificStrategies: new Map(),
      customResolvers: new Map(),
      maxMergeDepth: 10,
      autoResolveThreshold: 0.8,
    },
    gossip: {
      interval: 1000,
      fanout: 3,
      seedNodes: [],
    },
  },
  
  inference: {
    enabled: true,
    rules: [],                // Custom rules
    maxIterations: 10,
    confidenceThreshold: 0.5,
    parallelExecution: true,
  },
  
  query: {
    defaultLimit: 100,
    maxLimit: 10000,
    timeout: 30000,
    cacheEnabled: true,
    cacheSize: 1000,
  },
  
  server: {
    port: 3000,
    host: '0.0.0.0',
    cors: true,
  },
};
```

---

## Contributing

Contributions are welcome! Please read our contributing guidelines before submitting PRs.

### Development Setup

```bash
# Clone the repository
git clone https://github.com/moggan1337/Nexus.git
cd Nexus

# Install dependencies
npm install

# Run tests
npm test

# Build
npm run build

# Start CLI
npm run dev
```

### Project Structure

```
Nexus/
├── src/
│   ├── core/           # Core graph implementation
│   ├── protocol/       # CRDT and conflict resolution
│   ├── query/          # Query engine
│   ├── inference/      # Inference engine
│   ├── storage/        # Storage backends
│   ├── visualization/ # Web visualization
│   ├── index.ts        # Main entry point
│   └── cli.ts          # CLI interface
├── tests/             # Test files
├── examples/          # Example code
├── docs/              # Documentation
└── web/               # Web UI assets
```

---

## License

MIT License - see [LICENSE](LICENSE) for details.

---

<div align="center">

**Built with ❤️ by moggan1337**

[Nexus on GitHub](https://github.com/moggan1337/Nexus) • [Report Issue](https://github.com/moggan1337/Nexus/issues)

</div>
