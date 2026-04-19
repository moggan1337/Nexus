/**
 * CRDT-based Federation Protocol
 * Implements Conflict-free Replicated Data Types for distributed sync
 */

import {
  VectorClock,
  CRDTOperation,
  EntityAddOperation,
  EntityUpdateOperation,
  EntityDeleteOperation,
  RelationAddOperation,
  RelationUpdateOperation,
  RelationDeleteOperation,
  MergedState,
  Conflict,
  ConflictType,
  MergeConfig,
  MergeStrategy,
  MergeContext,
  Tombstone,
  SyncState,
  SyncMessage,
  NexusGraph,
  Entity,
  Relation,
} from '../core/types.js';
import { ulid } from 'ulid';
import { EventEmitter } from 'events';

// ============================================================================
// Vector Clock Operations
// ============================================================================

/**
 * Compare two vector clocks
 * Returns: -1 if a < b, 0 if a == b, 1 if a > b, null if concurrent
 */
export function compareClocks(a: VectorClock, b: VectorClock): -1 | 0 | 1 | null {
  let aGreater = false;
  let bGreater = false;

  const allKeys = new Set([...Object.keys(a), ...Object.keys(b)]);

  for (const key of allKeys) {
    const aVal = a[key] || 0;
    const bVal = b[key] || 0;

    if (aVal > bVal) aGreater = true;
    if (bVal > aVal) bGreater = true;
  }

  if (aGreater && !bGreater) return 1;
  if (bGreater && !aGreater) return -1;
  if (!aGreater && !bGreater) return 0;
  return null; // Concurrent
}

/**
 * Check if clock a happens-before clock b
 */
export function happensBefore(a: VectorClock, b: VectorClock): boolean {
  const comparison = compareClocks(a, b);
  return comparison === -1;
}

/**
 * Merge two vector clocks (take max of each component)
 */
export function mergeClocks(a: VectorClock, b: VectorClock): VectorClock {
  const result: VectorClock = { ...a };
  for (const [key, val] of Object.entries(b)) {
    result[key] = Math.max(result[key] || 0, val);
  }
  return result;
}

/**
 * Increment a vector clock for a specific node
 */
export function incrementClock(clock: VectorClock, nodeId: string): VectorClock {
  return {
    ...clock,
    [nodeId]: (clock[nodeId] || 0) + 1,
  };
}

// ============================================================================
// CRDT Operations
// ============================================================================

/**
 * Create an entity add operation
 */
export function createEntityAdd(
  entity: Entity,
  nodeId: string,
  clock: VectorClock
): EntityAddOperation {
  return {
    id: ulid(),
    type: 'entity_add',
    nodeId,
    timestamp: clock,
    causallyReady: true,
    entity,
  };
}

/**
 * Create an entity update operation
 */
export function createEntityUpdate(
  entityId: string,
  patches: { op: string; path: string; value?: unknown }[],
  priorVersion: number,
  newVersion: number,
  nodeId: string,
  clock: VectorClock
): EntityUpdateOperation {
  return {
    id: ulid(),
    type: 'entity_update',
    nodeId,
    timestamp: clock,
    causallyReady: true,
    entityId,
    patches,
    priorVersion,
    newVersion,
  };
}

/**
 * Create an entity delete operation (tombstone)
 */
export function createEntityDelete(
  entityId: string,
  nodeId: string,
  clock: VectorClock,
  gcAfterMs: number = 30 * 24 * 60 * 60 * 1000 // 30 days default
): EntityDeleteOperation {
  return {
    id: ulid(),
    type: 'entity_delete',
    nodeId,
    timestamp: clock,
    causallyReady: true,
    entityId,
    tombstone: {
      id: entityId,
      deletedAt: Date.now(),
      deletedBy: nodeId,
      gcAfter: Date.now() + gcAfterMs,
    },
  };
}

/**
 * Create a relation add operation
 */
export function createRelationAdd(
  relation: Relation,
  nodeId: string,
  clock: VectorClock
): RelationAddOperation {
  return {
    id: ulid(),
    type: 'relation_add',
    nodeId,
    timestamp: clock,
    causallyReady: true,
    relation,
  };
}

/**
 * Create a relation update operation
 */
export function createRelationUpdate(
  relationId: string,
  patches: { op: string; path: string; value?: unknown }[],
  priorVersion: number,
  newVersion: number,
  nodeId: string,
  clock: VectorClock
): RelationUpdateOperation {
  return {
    id: ulid(),
    type: 'relation_update',
    nodeId,
    timestamp: clock,
    causallyReady: true,
    relationId,
    patches,
    priorVersion,
    newVersion,
  };
}

/**
 * Create a relation delete operation
 */
export function createRelationDelete(
  relationId: string,
  nodeId: string,
  clock: VectorClock
): RelationDeleteOperation {
  return {
    id: ulid(),
    type: 'relation_delete',
    nodeId,
    timestamp: clock,
    causallyReady: true,
    relationId,
    tombstone: {
      id: relationId,
      deletedAt: Date.now(),
      deletedBy: nodeId,
      gcAfter: Date.now() + 30 * 24 * 60 * 60 * 1000,
    },
  };
}

// ============================================================================
// Operation History (LWW-Register per Entity)
// ============================================================================

/**
 * CRDT state for a single entity's history
 */
interface EntityCRDT {
  entity: Entity | null;
  deleted: boolean;
  tombstone?: Tombstone;
  clock: VectorClock;
  updateHistory: EntityUpdateOperation[];
}

/**
 * Manage CRDT state for entities
 */
export class EntityCRDTState {
  private states: Map<string, EntityCRDT> = new Map();

  /**
   * Apply an operation to update CRDT state
   */
  applyOperation(op: CRDTOperation): void {
    switch (op.type) {
      case 'entity_add':
        this.applyAdd(op);
        break;
      case 'entity_update':
        this.applyUpdate(op);
        break;
      case 'entity_delete':
        this.applyDelete(op);
        break;
    }
  }

  private applyAdd(op: EntityAddOperation): void {
    const existing = this.states.get(op.entity.id);

    if (!existing) {
      // New entity
      this.states.set(op.entity.id, {
        entity: op.entity,
        deleted: false,
        clock: op.timestamp,
        updateHistory: [],
      });
    } else {
      // Entity already exists - use LWW based on vector clock
      const comparison = compareClocks(existing.clock, op.timestamp);

      if (comparison === null || comparison === -1) {
        // Remote is newer or concurrent - apply merge
        existing.entity = op.entity;
        existing.clock = mergeClocks(existing.clock, op.timestamp);
      }
      // If local is newer, keep local
    }
  }

  private applyUpdate(op: EntityUpdateOperation): void {
    const state = this.states.get(op.entityId);
    if (!state || state.deleted) return;

    const comparison = compareClocks(state.clock, op.timestamp);

    if (comparison === null || comparison === -1) {
      // Apply patches
      state.entity = applyPatches(state.entity!, op.patches);
      state.clock = mergeClocks(state.clock, op.timestamp);
      state.updateHistory.push(op);
    }
  }

  private applyDelete(op: EntityDeleteOperation): void {
    const state = this.states.get(op.entityId);
    if (!state) {
      // Create new tombstone
      this.states.set(op.entityId, {
        entity: null,
        deleted: true,
        tombstone: op.tombstone,
        clock: op.timestamp,
        updateHistory: [],
      });
    } else {
      const comparison = compareClocks(state.clock, op.timestamp);

      if (comparison === null || comparison === -1) {
        state.deleted = true;
        state.tombstone = op.tombstone;
        state.entity = null;
        state.clock = mergeClocks(state.clock, op.timestamp);
      }
    }
  }

  /**
   * Get the current state of an entity
   */
  getState(entityId: string): EntityCRDT | undefined {
    return this.states.get(entityId);
  }

  /**
   * Get all active (non-deleted) entities
   */
  getActiveEntities(): Entity[] {
    return Array.from(this.states.values())
      .filter((s) => !s.deleted && s.entity)
      .map((s) => s.entity!);
  }

  /**
   * Check if entity was deleted
   */
  isDeleted(entityId: string): boolean {
    return this.states.get(entityId)?.deleted ?? false;
  }
}

// ============================================================================
// Patch Application
// ============================================================================

/**
 * Apply JSON patches to an entity
 */
function applyPatches(
  entity: Entity,
  patches: { op: string; path: string; value?: unknown }[]
): Entity {
  const result = { ...entity };

  for (const patch of patches) {
    const pathParts = patch.path.split('/').filter((p) => p !== '');

    switch (patch.op) {
      case 'replace':
        if (pathParts.length === 1) {
          (result as Record<string, unknown>)[pathParts[0]] = patch.value;
        }
        break;
      case 'add':
        if (pathParts.length === 1) {
          (result as Record<string, unknown>)[pathParts[0]] = patch.value;
        }
        break;
      case 'remove':
        if (pathParts.length === 1) {
          delete (result as Record<string, unknown>)[pathParts[0]];
        }
        break;
    }
  }

  return result;
}

// ============================================================================
// Gossip Protocol Implementation
// ============================================================================

/**
 * Gossip message for disseminating operations
 */
interface GossipMessage {
  id: string;
  sourceNode: string;
  targetNode?: string;
  operation: CRDTOperation;
  vectorClock: VectorClock;
  timestamp: number;
}

/**
 * Gossip-based dissemination protocol
 */
export class GossipProtocol extends EventEmitter {
  private nodeId: string;
  private peers: Set<string> = new Set();
  private knownMessages: Set<string> = new Set();
  private fanout: number;
  private interval: number;
  private timer?: NodeJS.Timeout;

  constructor(config: { nodeId: string; fanout?: number; interval?: number }) {
    super();
    this.nodeId = config.nodeId;
    this.fanout = config.fanout || 3;
    this.interval = config.interval || 1000;
  }

  /**
   * Add a peer to gossip with
   */
  addPeer(peerId: string): void {
    this.peers.add(peerId);
  }

  /**
   * Remove a peer
   */
  removePeer(peerId: string): void {
    this.peers.delete(peerId);
  }

  /**
   * Start gossiping
   */
  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => this.gossipRound(), this.interval);
  }

  /**
   * Stop gossiping
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  /**
   * Broadcast an operation to peers
   */
  broadcast(operation: CRDTOperation, clock: VectorClock): void {
    const message: GossipMessage = {
      id: ulid(),
      sourceNode: this.nodeId,
      operation,
      vectorClock: clock,
      timestamp: Date.now(),
    };

    this.knownMessages.add(message.id);

    // Select random peers to send to
    const selectedPeers = this.selectRandomPeers(this.fanout);
    for (const peer of selectedPeers) {
      this.emit('message', { ...message, targetNode: peer });
    }

    this.emit('broadcast', message);
  }

  /**
   * Receive a message and check if we should process it
   */
  receive(message: GossipMessage): boolean {
    if (this.knownMessages.has(message.id)) {
      return false;
    }

    // Check if message is causally ready
    if (!message.operation.causallyReady) {
      return false;
    }

    this.knownMessages.add(message.id);
    this.emit('receive', message);

    return true;
  }

  private selectRandomPeers(count: number): string[] {
    const peerArray = Array.from(this.peers);
    const shuffled = peerArray.sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(count, peerArray.length));
  }
}

// ============================================================================
// Sync Manager
// ============================================================================

/**
 * Manages synchronization state with remote nodes
 */
export class SyncManager extends EventEmitter {
  private nodeId: string;
  private peers: Map<string, PeerSyncState> = new Map();
  private crdtState: EntityCRDTState;
  private pendingOperations: CRDTOperation[] = [];

  constructor(nodeId: string, crdtState: EntityCRDTState) {
    super();
    this.nodeId = nodeId;
    this.crdtState = crdtState;
  }

  /**
   * Add a peer for synchronization
   */
  addPeer(
    peerId: string,
    endpoint: string,
    config?: { priority?: number; syncInterval?: number }
  ): void {
    this.peers.set(peerId, {
      peerId,
      endpoint,
      syncState: {
        nodeId: peerId,
        clock: {},
        pendingOps: [],
        syncedOps: [],
        lastSync: new Date(),
        status: 'idle',
      },
      priority: config?.priority || 1,
      syncInterval: config?.syncInterval || 5000,
    });
  }

  /**
   * Queue an operation for synchronization
   */
  queueOperation(operation: CRDTOperation): void {
    this.pendingOperations.push(operation);
    this.emit('operation:queued', operation);
  }

  /**
   * Get operations to send to a peer
   */
  getOperationsForPeer(peerId: string): CRDTOperation[] {
    const peerState = this.peers.get(peerId);
    if (!peerState) return [];

    // Return operations that the peer hasn't seen yet
    const peerClock = peerState.syncState.clock;
    return this.pendingOperations.filter((op) => {
      const comparison = compareClocks(op.timestamp, peerClock);
      return comparison === 1 || comparison === null;
    });
  }

  /**
   * Process incoming operations from a peer
   */
  processOperations(operations: CRDTOperation[]): void {
    for (const op of operations) {
      this.crdtState.applyOperation(op);
      this.emit('operation:applied', op);
    }
  }

  /**
   * Update sync state after successful sync
   */
  updateSyncState(peerId: string, clock: VectorClock): void {
    const peerState = this.peers.get(peerId);
    if (!peerState) return;

    peerState.syncState.clock = mergeClocks(peerState.syncState.clock, clock);
    peerState.syncState.lastSync = new Date();
    peerState.syncState.status = 'idle';
  }

  /**
   * Get sync state for all peers
   */
  getSyncStates(): SyncState[] {
    return Array.from(this.peers.values()).map((p) => p.syncState);
  }
}

interface PeerSyncState {
  peerId: string;
  endpoint: string;
  syncState: SyncState;
  priority: number;
  syncInterval: number;
}

// ============================================================================
// Export
// ============================================================================

export {
  EntityCRDTState,
  GossipProtocol,
  SyncManager,
  GossipMessage,
};
