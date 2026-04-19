/**
 * Conflict Resolution Engine
 * Implements various merge strategies for CRDT conflict resolution
 */

import {
  Conflict,
  ConflictType,
  MergeStrategy,
  MergeConfig,
  MergeContext,
  PropertyValue,
  Resolution,
  VectorClock,
  Entity,
  Relation,
  EntityUpdateOperation,
  RelationUpdateOperation,
  NexusGraph,
} from '../core/types.js';
import { compareClocks, mergeClocks } from './crdt.js';

// ============================================================================
// Conflict Detection
// ============================================================================

/**
 * Detect conflicts between concurrent operations
 */
export function detectConflicts(
  localOp: EntityUpdateOperation | RelationUpdateOperation,
  remoteOp: EntityUpdateOperation | RelationUpdateOperation
): Conflict | null {
  // Same entity/relation being modified
  if (localOp.entityId !== remoteOp.entityId) return null;
  if (localOp.relationId !== remoteOp.relationId) return null;

  // Check if operations are concurrent
  const comparison = compareClocks(localOp.timestamp, remoteOp.timestamp);
  if (comparison !== null) {
    // Not concurrent - no conflict
    return null;
  }

  // Extract conflicting paths
  const localPaths = new Set(localOp.patches.map((p) => p.path));
  const remotePaths = new Set(remoteOp.patches.map((p) => p.path));

  // Find overlapping paths
  const conflictingPaths: string[] = [];
  for (const path of localPaths) {
    if (remotePaths.has(path)) {
      conflictingPaths.push(path);
    }
  }

  if (conflictingPaths.length === 0) {
    return null; // No actual conflict - different fields modified
  }

  // Determine conflict type
  let conflictType: ConflictType = 'update_update';
  if (localOp.type === 'entity_update' && remoteOp.type === 'entity_update') {
    conflictType = 'update_update';
  }

  return {
    id: `conflict-${localOp.id}-${remoteOp.id}`,
    type: conflictType,
    path: conflictingPaths[0], // Primary conflicting path
    values: [], // Would need actual values to populate
    resolutions: [],
    resolved: false,
  };
}

// ============================================================================
// Merge Strategy Implementations
// ============================================================================

/**
 * Last-Write-Wins (LWW) merge strategy
 * Selects the value with the highest timestamp
 */
export function lastWriteWins(
  localValue: PropertyValue,
  localClock: VectorClock,
  remoteValue: PropertyValue,
  remoteClock: VectorClock,
  localNodeId: string,
  remoteNodeId: string
): PropertyValue {
  const comparison = compareClocks(localClock, remoteClock);

  if (comparison === 1) return localValue;
  if (comparison === -1) return remoteValue;

  // Concurrent - use node ID as tiebreaker
  return localNodeId > remoteNodeId ? localValue : remoteValue;
}

/**
 * First-Write-Wins merge strategy
 * Keeps the first value written
 */
export function firstWriteWins(
  localValue: PropertyValue,
  localClock: VectorClock,
  remoteValue: PropertyValue,
  remoteClock: VectorClock,
  _localNodeId: string,
  _remoteNodeId: string
): PropertyValue {
  const comparison = compareClocks(localClock, remoteClock);

  if (comparison === 1) return remoteValue; // Local is newer, remote was first
  if (comparison === -1) return localValue; // Remote is newer, local was first

  // Concurrent - use smaller node ID as "first"
  return localValue; // Simplified: always keep local in true concurrency
}

/**
 * Multi-Value (OR-Set style) merge strategy
 * Preserves all values, marking them with sources
 */
export function multiValue(
  localValue: PropertyValue,
  localClock: VectorClock,
  remoteValue: PropertyValue,
  remoteClock: VectorClock,
  localNodeId: string,
  remoteNodeId: string
): PropertyValue {
  return {
    __multiValue: true,
    values: [
      { value: localValue, clock: localClock, source: localNodeId },
      { value: remoteValue, clock: remoteClock, source: remoteNodeId },
    ],
  };
}

/**
 * Source Priority merge strategy
 * Respects configured priority of source nodes
 */
export function sourcePriority(
  localValue: PropertyValue,
  localClock: VectorClock,
  remoteValue: PropertyValue,
  remoteClock: VectorClock,
  localNodeId: string,
  remoteNodeId: string,
  localPriority: number,
  remotePriority: number
): PropertyValue {
  if (localPriority !== remotePriority) {
    return localPriority > remotePriority ? localValue : remoteValue;
  }

  // Equal priority - fall back to LWW
  return lastWriteWins(
    localValue,
    localClock,
    remoteValue,
    remoteClock,
    localNodeId,
    remoteNodeId
  );
}

// ============================================================================
// Conflict Resolver
// ============================================================================

/**
 * Main conflict resolver that applies configured strategies
 */
export class ConflictResolver {
  private config: MergeConfig;
  private context: MergeContext;

  constructor(config: MergeConfig, context: MergeContext) {
    this.config = config;
    this.context = context;
  }

  /**
   * Resolve a conflict using the configured strategy
   */
  resolve(conflict: Conflict): Resolution {
    const strategy = this.selectStrategy(conflict);

    let selectedValue: PropertyValue;

    switch (strategy) {
      case 'last_write_wins':
        selectedValue = this.resolveWithLWW(conflict);
        break;
      case 'first_write_wins':
        selectedValue = this.resolveWithFWW(conflict);
        break;
      case 'multi_value':
        selectedValue = this.resolveWithMultiValue(conflict);
        break;
      case 'source_priority':
        selectedValue = this.resolveWithSourcePriority(conflict);
        break;
      case 'custom':
        selectedValue = this.resolveWithCustom(conflict);
        break;
      default:
        selectedValue = this.resolveWithLWW(conflict);
    }

    return {
      strategy,
      selectedValue,
      resolvedAt: Date.now(),
    };
  }

  /**
   * Select the appropriate strategy for a conflict
   */
  private selectStrategy(conflict: Conflict): MergeStrategy {
    // Check for type-specific strategy
    const typeKey = this.getTypeKey(conflict.path);
    const typeStrategy = this.config.typeSpecificStrategies.get(typeKey);
    if (typeStrategy) return typeStrategy;

    return this.config.defaultStrategy;
  }

  /**
   * Get type key from path (e.g., 'person:name' from 'properties.name')
   */
  private getTypeKey(path: string): string {
    const parts = path.split('/').filter((p) => p);
    if (parts.length >= 2 && parts[0] === 'properties') {
      return `*:${parts[1]}`;
    }
    return path;
  }

  private resolveWithLWW(conflict: Conflict): PropertyValue {
    // Simplified - would need actual clock info
    return conflict.values[0];
  }

  private resolveWithFWW(conflict: Conflict): PropertyValue {
    return conflict.values[0];
  }

  private resolveWithMultiValue(conflict: Conflict): PropertyValue {
    return {
      __type: 'multi_value',
      values: conflict.values,
    };
  }

  private resolveWithSourcePriority(conflict: Conflict): PropertyValue {
    // Would need source info from context
    return conflict.values[0];
  }

  private resolveWithCustom(conflict: Conflict): PropertyValue {
    const typeKey = this.getTypeKey(conflict.path);
    const customResolver = this.config.customResolvers.get(typeKey);

    if (customResolver) {
      return customResolver(conflict, this.context);
    }

    // Fall back to default
    return this.resolveWithLWW(conflict);
  }
}

// ============================================================================
// Graph Merge Operations
// ============================================================================

/**
 * Merge two graphs with conflict resolution
 */
export function mergeGraphs(
  local: NexusGraph,
  remote: NexusGraph,
  config: MergeConfig
): NexusGraph {
  const merged = new NexusGraph({
    name: local.name,
    description: `Merged graph from ${local.id} and ${remote.id}`,
    nodeId: local.id,
  });

  const resolver = new ConflictResolver(config, {
    graph: merged,
    operationHistory: [],
    nodePolicies: new Map(),
  });

  // Merge entities
  const allEntityIds = new Set([
    ...Array.from(local.entities.keys()),
    ...Array.from(remote.entities.keys()),
  ]);

  for (const entityId of allEntityIds) {
    const localEntity = local.entities.get(entityId);
    const remoteEntity = remote.entities.get(entityId);

    if (localEntity && !remoteEntity) {
      merged.entities.set(entityId, localEntity);
    } else if (remoteEntity && !localEntity) {
      merged.entities.set(entityId, remoteEntity);
    } else if (localEntity && remoteEntity) {
      // Both exist - merge with resolution
      const mergedEntity = mergeEntities(localEntity, remoteEntity, resolver);
      merged.entities.set(entityId, mergedEntity);
    }
  }

  // Merge relations
  const allRelationIds = new Set([
    ...Array.from(local.relations.keys()),
    ...Array.from(remote.relations.keys()),
  ]);

  for (const relationId of allRelationIds) {
    const localRelation = local.relations.get(relationId);
    const remoteRelation = remote.relations.get(relationId);

    if (localRelation && !remoteRelation) {
      merged.relations.set(relationId, localRelation);
    } else if (remoteRelation && !localRelation) {
      merged.relations.set(relationId, remoteRelation);
    } else if (localRelation && remoteRelation) {
      // Both exist - use newer
      const localClock = localRelation.timestamps.updatedAt;
      const remoteClock = remoteRelation.timestamps.updatedAt;
      const selected = localClock > remoteClock ? localRelation : remoteRelation;
      merged.relations.set(relationId, selected);
    }
  }

  return merged;
}

/**
 * Merge two entities
 */
function mergeEntities(
  local: Entity,
  remote: Entity,
  resolver: ConflictResolver
): Entity {
  // Use the entity with the higher version or later timestamp
  const localVersion = local.metadata.version;
  const remoteVersion = remote.metadata.version;

  if (localVersion > remoteVersion) {
    return local;
  } else if (remoteVersion > localVersion) {
    return remote;
  }

  // Equal version - merge properties
  const mergedProperties = { ...local.properties };

  for (const [key, remoteValue] of Object.entries(remote.properties)) {
    if (!(key in mergedProperties)) {
      mergedProperties[key] = remoteValue;
    }
    // If key exists in both, use local (would trigger conflict resolution)
  }

  return {
    ...local,
    properties: mergedProperties,
    metadata: {
      ...local.metadata,
      version: Math.max(localVersion, remoteVersion) + 1,
    },
  };
}

/**
 * Auto-resolve simple conflicts
 */
export function autoResolve(
  conflicts: Conflict[],
  config: MergeConfig
): Conflict[] {
  const resolver = new ConflictResolver(config, {
    graph: {} as NexusGraph,
    operationHistory: [],
    nodePolicies: new Map(),
  });

  return conflicts.map((conflict) => {
    if (conflict.resolved) return conflict;

    const resolution = resolver.resolve(conflict);
    return {
      ...conflict,
      resolutions: [resolution],
      resolved: true,
    };
  });
}

// ============================================================================
// Three-Way Merge
// ============================================================================

/**
 * Three-way merge for text-like properties
 */
export function threeWayMerge(
  base: Record<string, PropertyValue>,
  local: Record<string, PropertyValue>,
  remote: Record<string, PropertyValue>
): { result: Record<string, PropertyValue>; conflicts: Conflict[] } {
  const result: Record<string, PropertyValue> = { ...base };
  const conflicts: Conflict[] = [];

  // Process all keys from all versions
  const allKeys = new Set([
    ...Object.keys(base),
    ...Object.keys(local),
    ...Object.keys(remote),
  ]);

  for (const key of allKeys) {
    const baseVal = base[key];
    const localVal = local[key];
    const remoteVal = remote[key];

    if (localVal === remoteVal) {
      // Both made same change
      result[key] = localVal;
    } else if (localVal === baseVal) {
      // Only remote changed
      result[key] = remoteVal;
    } else if (remoteVal === baseVal) {
      // Only local changed
      result[key] = localVal;
    } else {
      // Both changed differently - conflict
      conflicts.push({
        id: `conflict-${key}-${Date.now()}`,
        type: 'concurrent_modify',
        path: key,
        values: [localVal, remoteVal],
        resolutions: [],
        resolved: false,
      });

      // Default: keep local value
      result[key] = localVal;
    }
  }

  return { result, conflicts };
}

// ============================================================================
// Export
// ============================================================================

export {
  ConflictResolver,
  detectConflicts,
  lastWriteWins,
  firstWriteWins,
  multiValue,
  sourcePriority,
  mergeGraphs,
  threeWayMerge,
  autoResolve,
};
