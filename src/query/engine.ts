/**
 * Query Engine
 * Hybrid graph traversal and vector search for Nexus
 */

import {
  NexusGraph,
  GraphQuery,
  QueryType,
  QueryFilter,
  FilterOperator,
  TraversalSpec,
  VectorQuery,
  VectorQuery as VQ,
  Aggregation,
  AggregationType,
  QueryOptions,
  QueryResult,
  QueryMetadata,
  Entity,
  Relation,
  EntityType,
  RelationType,
  PropertyValue,
  ConsistencyLevel,
} from '../core/types.js';
import { compareClocks } from '../protocol/crdt.js';
import { ulid } from 'ulid';

// ============================================================================
// Query Engine Implementation
// ============================================================================

/**
 * Main query engine supporting multiple query types
 */
export class QueryEngine {
  private graph: NexusGraph;
  private cache: Map<string, QueryResult>;
  private cacheSize: number;

  constructor(graph: NexusGraph, cacheSize: number = 1000) {
    this.graph = graph;
    this.cache = new Map();
    this.cacheSize = cacheSize;
  }

  /**
   * Execute a query
   */
  async execute(query: GraphQuery): Promise<QueryResult> {
    const startTime = performance.now();

    // Check cache
    const cacheKey = this.getCacheKey(query);
    const cached = this.cache.get(cacheKey);
    if (cached && !query.options.explain) {
      return { ...cached, metadata: { ...cached.metadata, cached: true } };
    }

    let result: unknown;

    switch (query.type) {
      case 'traversal':
        result = this.executeTraversal(query.traversal!, query.options);
        break;
      case 'vector':
        result = await this.executeVector(query.vector!, query.options);
        break;
      case 'hybrid':
        result = await this.executeHybrid(query, query.options);
        break;
      case 'pattern':
        result = this.executePattern(query);
        break;
      case 'aggregation':
        result = this.executeAggregation(query.aggregations!);
        break;
      default:
        throw new Error(`Unknown query type: ${query.type}`);
    }

    const executionTime = performance.now() - startTime;

    const queryResult: QueryResult = {
      data: result,
      metadata: {
        queryId: query.id || ulid(),
        totalHits: this.countHits(result),
        returnedHits: this.countHits(result),
        indicesUsed: this.getIndicesUsed(query),
        cached: false,
        consistencyLevel: query.options.consistency || 'eventual',
      },
      executionTime,
    };

    // Cache result
    if (this.cache.size >= this.cacheSize) {
      // Evict oldest
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }
    this.cache.set(cacheKey, queryResult);

    return queryResult;
  }

  // ==========================================================================
  // Traversal Queries
  // ==========================================================================

  /**
   * Execute graph traversal query
   */
  private executeTraversal(
    spec: TraversalSpec,
    options: QueryOptions
  ): TraversalResult2 {
    const visited = new Set<string>();
    const results: TraversalResult2 = {
      nodes: [],
      edges: [],
      paths: [],
    };

    const queue: TraversalQueueItem[] = spec.startNodes.map((id) => ({
      entityId: id,
      depth: 0,
      path: [id],
    }));

    while (queue.length > 0) {
      const current = queue.shift()!;

      if (visited.has(current.entityId)) continue;
      visited.add(current.entityId);

      const entity = this.graph.getEntity(current.entityId);
      if (!entity) continue;

      // Apply node filters
      if (spec.nodeFilters && !this.applyFilters(entity, spec.nodeFilters)) {
        continue;
      }

      results.nodes.push(entity);

      if (current.path.length > 1) {
        results.paths.push([...current.path]);
      }

      if (current.depth >= spec.maxDepth) continue;

      // Get adjacent relations based on direction
      const relations = this.getAdjacentRelations(entity.id, spec.directions);

      for (const relation of relations) {
        // Apply edge filters
        if (spec.edgeFilters && !this.applyFilters(relation, spec.edgeFilters)) {
          continue;
        }

        // Filter by relation type
        if (spec.relationTypes && !spec.relationTypes.includes(relation.type)) {
          continue;
        }

        // Determine next node based on direction
        if (spec.directions.includes('outbound') && relation.sourceId === current.entityId) {
          queue.push({
            entityId: relation.targetId,
            depth: current.depth + 1,
            path: [...current.path, relation.targetId],
            relation,
          });
          results.edges.push({ ...relation, direction: 'outbound' });
        }

        if (spec.directions.includes('inbound') && relation.targetId === current.entityId) {
          queue.push({
            entityId: relation.sourceId,
            depth: current.depth + 1,
            path: [...current.path, relation.sourceId],
            relation,
          });
          results.edges.push({ ...relation, direction: 'inbound' });
        }
      }
    }

    // Apply limit/offset
    return this.applyPagination(results, options);
  }

  /**
   * Get adjacent relations based on directions
   */
  private getAdjacentRelations(
    entityId: string,
    directions: ('outbound' | 'inbound' | 'both')[]
  ): Relation[] {
    const relations: Relation[] = [];

    for (const rel of this.graph.getRelations(entityId)) {
      if (directions.includes('outbound') && rel.sourceId === entityId) {
        relations.push(rel);
      }
      if (directions.includes('inbound') && rel.targetId === entityId) {
        relations.push(rel);
      }
    }

    return relations;
  }

  // ==========================================================================
  // Vector Search
  // ==========================================================================

  /**
   * Execute vector similarity search
   */
  private async executeVector(
    query: VectorQuery,
    _options: QueryOptions
  ): Promise<VectorSearchResult> {
    const entities = Array.from(this.graph.entities.values());
    const scores: Array<{ entity: Entity; score: number }> = [];

    for (const entity of entities) {
      if (entity.embeddings.dense.length === 0) continue;

      // Apply pre-filter
      if (query.filters && !this.applyFilters(entity, query.filters)) {
        continue;
      }

      const score = this.computeSimilarity(
        query.embedding,
        entity.embeddings.dense,
        query.metric
      );

      if (query.threshold !== undefined && score < query.threshold) {
        continue;
      }

      scores.push({ entity, score });
    }

    // Sort by score descending
    scores.sort((a, b) => b.score - a.score);

    // Apply limit
    const results = scores.slice(0, query.k);

    return {
      hits: results.map((r) => ({
        entity: r.entity,
        score: r.score,
      })),
      totalHits: scores.length,
    };
  }

  /**
   * Compute similarity between two vectors
   */
  private computeSimilarity(
    a: number[],
    b: number[],
    metric: 'cosine' | 'euclidean' | 'dotproduct'
  ): number {
    if (a.length !== b.length) {
      throw new Error('Vector dimensions must match');
    }

    switch (metric) {
      case 'cosine':
        return this.cosineSimilarity(a, b);
      case 'euclidean':
        return 1 / (1 + this.euclideanDistance(a, b));
      case 'dotproduct':
        return this.dotProduct(a, b);
      default:
        return this.cosineSimilarity(a, b);
    }
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dotProduct / denominator;
  }

  private euclideanDistance(a: number[], b: number[]): number {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      sum += Math.pow(a[i] - b[i], 2);
    }
    return Math.sqrt(sum);
  }

  private dotProduct(a: number[], b: number[]): number {
    return a.reduce((sum, val, i) => sum + val * b[i], 0);
  }

  // ==========================================================================
  // Hybrid Search
  // ==========================================================================

  /**
   * Execute hybrid traversal + vector search
   */
  private async executeHybrid(
    query: GraphQuery,
    options: QueryOptions
  ): Promise<HybridResult> {
    const { traversal, vector } = query;

    if (!traversal || !vector) {
      throw new Error('Hybrid query requires both traversal and vector specs');
    }

    // Execute traversal first
    const traversalResult = this.executeTraversal(traversal, { limit: 1000 });

    // Execute vector search
    const vectorResult = await this.executeVector(vector, { limit: 1000 });

    // Get traversal node IDs
    const traversalIds = new Set(traversalResult.nodes.map((n) => n.id));

    // Filter vector results to traversal nodes
    const vectorHitsInTraversal = vectorResult.hits.filter((h) =>
      traversalIds.has(h.entity.id)
    );

    // Apply hybrid fusion
    const fusionConfig = vector.hybrid || {
      vectorWeight: 0.5,
      keywordWeight: 0.5,
      fusion: 'rrf' as const,
    };

    const fusedResults = this.fuseResults(
      vectorHitsInTraversal,
      traversalResult.nodes.map((n) => ({ entity: n, score: 1 })),
      fusionConfig
    );

    return {
      nodes: fusedResults.slice(0, options.limit || 10),
      traversalStats: {
        nodesVisited: traversalResult.nodes.length,
        edgesTraversed: traversalResult.edges.length,
      },
      vectorStats: {
        totalCandidates: vectorResult.totalHits,
        matchedInTraversal: vectorHitsInTraversal.length,
      },
    };
  }

  /**
   * Fuse results from multiple queries using Reciprocal Rank Fusion
   */
  private fuseResults<T extends { entity: Entity; score: number }>(
    vectorResults: T[],
    traversalResults: T[],
    config: { fusion: 'rrf' | 'weighted' | 'additive'; rrfK?: number }
  ): T[] {
    const scoreMap = new Map<string, number>();
    const k = config.rrfK || 60;

    switch (config.fusion) {
      case 'rrf':
        // Reciprocal Rank Fusion
        vectorResults.forEach((r, i) => {
          const current = scoreMap.get(r.entity.id) || 0;
          scoreMap.set(r.entity.id, current + 1 / (k + i + 1));
        });
        traversalResults.forEach((r, i) => {
          const current = scoreMap.get(r.entity.id) || 0;
          scoreMap.set(r.entity.id, current + 1 / (k + i + 1));
        });
        break;

      case 'weighted':
        vectorResults.forEach((r) => {
          const current = scoreMap.get(r.entity.id) || 0;
          scoreMap.set(r.entity.id, current + r.score * 0.5);
        });
        traversalResults.forEach((r) => {
          const current = scoreMap.get(r.entity.id) || 0;
          scoreMap.set(r.entity.id, current + r.score * 0.5);
        });
        break;

      case 'additive':
        vectorResults.forEach((r) => {
          const current = scoreMap.get(r.entity.id) || 0;
          scoreMap.set(r.entity.id, current + r.score);
        });
        traversalResults.forEach((r) => {
          const current = scoreMap.get(r.entity.id) || 0;
          scoreMap.set(r.entity.id, current + r.score);
        });
        break;
    }

    // Combine and sort
    const allResults = new Map<string, T>();
    for (const r of [...vectorResults, ...traversalResults]) {
      if (!allResults.has(r.entity.id)) {
        allResults.set(r.entity.id, r);
      }
    }

    return Array.from(allResults.values())
      .map((r) => ({
        ...r,
        score: scoreMap.get(r.entity.id) || 0,
      }))
      .sort((a, b) => b.score - a.score);
  }

  // ==========================================================================
  // Pattern Matching
  // ==========================================================================

  /**
   * Execute pattern matching query
   */
  private executePattern(query: GraphQuery): PatternResult[] {
    // Simplified pattern matching - would need more sophisticated implementation
    const filters = query.filters || [];
    const entities = Array.from(this.graph.entities.values());

    return entities
      .filter((e) => this.applyFilters(e, filters))
      .map((e) => ({
        entity: e,
        matchedPattern: true,
      }));
  }

  // ==========================================================================
  // Aggregations
  // ==========================================================================

  /**
   * Execute aggregation queries
   */
  private executeAggregation(aggregations: Aggregation[]): AggregationResult[] {
    const entities = Array.from(this.graph.entities.values());

    return aggregations.map((agg) => {
      const values = entities
        .map((e) => this.getNestedProperty(e, agg.field))
        .filter((v): v is number | string => v !== undefined);

      switch (agg.type) {
        case 'count':
          return { name: agg.name, type: 'count', value: values.length };
        case 'sum':
          return {
            name: agg.name,
            type: 'sum',
            value: values.reduce((a, b) => (a as number) + (b as number), 0),
          };
        case 'avg':
          const sum = values.reduce((a, b) => (a as number) + (b as number), 0);
          return {
            name: agg.name,
            type: 'avg',
            value: values.length > 0 ? sum / values.length : 0,
          };
        case 'min':
          return {
            name: agg.name,
            type: 'min',
            value: Math.min(...(values as number[])),
          };
        case 'max':
          return {
            name: agg.name,
            type: 'max',
            value: Math.max(...(values as number[])),
          };
        case 'cardinality':
          return {
            name: agg.name,
            type: 'cardinality',
            value: new Set(values).size,
          };
        default:
          return { name: agg.name, type: 'count', value: values.length };
      }
    });
  }

  // ==========================================================================
  // Filter Utilities
  // ==========================================================================

  /**
   * Apply filters to an entity or relation
   */
  private applyFilters(
    target: Entity | Relation,
    filters: QueryFilter[]
  ): boolean {
    for (const filter of filters) {
      if (!this.evaluateFilter(target, filter)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Evaluate a single filter
   */
  private evaluateFilter(
    target: Entity | Relation,
    filter: QueryFilter
  ): boolean {
    const value = this.getNestedProperty(target, filter.field);

    switch (filter.operator) {
      case 'eq':
        return value === filter.value;
      case 'neq':
        return value !== filter.value;
      case 'gt':
        return (value as number) > (filter.value as number);
      case 'gte':
        return (value as number) >= (filter.value as number);
      case 'lt':
        return (value as number) < (filter.value as number);
      case 'lte':
        return (value as number) <= (filter.value as number);
      case 'in':
        return Array.isArray(filter.value) && filter.value.includes(value);
      case 'nin':
        return Array.isArray(filter.value) && !filter.value.includes(value);
      case 'contains':
        return String(value).includes(String(filter.value));
      case 'startsWith':
        return String(value).startsWith(String(filter.value));
      case 'endsWith':
        return String(value).endsWith(String(filter.value));
      case 'regex':
        return new RegExp(filter.value as string).test(String(value));
      default:
        return true;
    }
  }

  /**
   * Get nested property using dot notation
   */
  private getNestedProperty(
    obj: Record<string, unknown>,
    path: string
  ): unknown {
    const parts = path.split('.');
    let current: unknown = obj;

    for (const part of parts) {
      if (current === null || current === undefined) return undefined;
      current = (current as Record<string, unknown>)[part];
    }

    return current;
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  private getCacheKey(query: GraphQuery): string {
    return JSON.stringify(query);
  }

  private countHits(result: unknown): number {
    if (Array.isArray(result)) {
      if (result.length > 0 && 'entity' in result[0]) {
        return result.length;
      }
      return result.length;
    }
    if (result && typeof result === 'object') {
      if ('nodes' in result) {
        return (result as TraversalResult2).nodes.length;
      }
      if ('hits' in result) {
        return (result as VectorSearchResult).totalHits;
      }
    }
    return 0;
  }

  private getIndicesUsed(query: GraphQuery): string[] {
    const indices: string[] = [];

    if (query.filters) {
      indices.push('byProperty');
    }
    if (query.traversal) {
      indices.push('byRelationType');
    }
    if (query.vector) {
      indices.push('embeddings');
    }

    return indices;
  }

  private applyPagination(
    result: TraversalResult2,
    options: QueryOptions
  ): TraversalResult2 {
    const offset = options.offset || 0;
    const limit = options.limit || 100;

    return {
      nodes: result.nodes.slice(offset, offset + limit),
      edges: result.edges.slice(offset, offset + limit),
      paths: result.paths.slice(offset, offset + limit),
    };
  }

  /**
   * Clear the query cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; maxSize: number } {
    return {
      size: this.cache.size,
      maxSize: this.cacheSize,
    };
  }
}

// ============================================================================
// Supporting Types
// ============================================================================

interface TraversalQueueItem {
  entityId: string;
  depth: number;
  path: string[];
  relation?: Relation;
}

interface TraversalResult2 {
  nodes: Entity[];
  edges: (Relation & { direction: 'inbound' | 'outbound' })[];
  paths: string[][];
}

interface VectorSearchResult {
  hits: Array<{ entity: Entity; score: number }>;
  totalHits: number;
}

interface HybridResult {
  nodes: Array<{ entity: Entity; score: number }>;
  traversalStats: { nodesVisited: number; edgesTraversed: number };
  vectorStats: { totalCandidates: number; matchedInTraversal: number };
}

interface PatternResult {
  entity: Entity;
  matchedPattern: boolean;
}

interface AggregationResult {
  name: string;
  type: AggregationType;
  value: number;
}

// ============================================================================
// Factory Function
// ============================================================================

export function createQueryEngine(graph: NexusGraph): QueryEngine {
  return new QueryEngine(graph);
}
