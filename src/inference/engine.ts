/**
 * Inference Engine
 * Rule-based reasoning and relation derivation for Nexus
 */

import {
  InferenceRule,
  InferenceResult,
  DerivedRelation,
  AppliedRule,
  Pattern,
  PatternEntity,
  PatternRelation,
  PatternConstraint,
  Derivation,
  DerivationStep,
  Entity,
  Relation,
  NexusGraph,
  RelationType,
  PropertyValue,
} from '../core/types.js';

// ============================================================================
// Pattern Matcher
// ============================================================================

/**
 * Match a pattern against the graph
 */
export class PatternMatcher {
  private graph: NexusGraph;

  constructor(graph: NexusGraph) {
    this.graph = graph;
  }

  /**
   * Find all matches for a pattern
   */
  findMatches(pattern: Pattern): PatternMatch[] {
    const matches: PatternMatch[] = [];

    // Get starting entity variable
    const startVariable = pattern.entities[0]?.variable;
    if (!startVariable) return matches;

    // Get entities that could match the start
    const startEntities = this.getCandidateEntities(pattern.entities[0]);

    for (const startEntity of startEntities) {
      const bindings = new Map<string, string>();
      bindings.set(startVariable, startEntity.id);

      const match = this.tryMatch(
        pattern,
        startEntity,
        bindings,
        new Set<string>()
      );

      if (match) {
        matches.push(match);
      }
    }

    return matches;
  }

  /**
   * Get candidate entities for a pattern entity
   */
  private getCandidateEntities(patternEntity: PatternEntity): Entity[] {
    const entities = Array.from(this.graph.entities.values());

    return entities.filter((entity) => {
      // Check type constraint
      if (patternEntity.type && entity.type !== patternEntity.type) {
        return false;
      }

      // Check label constraint
      if (patternEntity.label) {
        const labelLower = patternEntity.label.toLowerCase();
        if (
          !entity.label.toLowerCase().includes(labelLower) &&
          !entity.metadata.aliases.some((a) =>
            a.toLowerCase().includes(labelLower)
          )
        ) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * Try to match a pattern starting from an entity
   */
  private tryMatch(
    pattern: Pattern,
    currentEntity: Entity,
    bindings: Map<string, string>,
    visited: Set<string>
  ): PatternMatch | null {
    // Mark as visited
    visited.add(currentEntity.id);

    // Check entity constraints
    for (const constraint of pattern.constraints || []) {
      if (constraint.entity === pattern.entities[0].variable) {
        if (!this.checkConstraint(currentEntity, constraint)) {
          return null;
        }
      }
    }

    // All entities matched?
    if (bindings.size === pattern.entities.length) {
      return {
        bindings: new Map(bindings),
        entities: Array.from(bindings.entries()).map(([v, id]) => ({
          variable: v,
          entity: this.graph.getEntity(id)!,
        })),
      };
    }

    // Try to match remaining relations
    const unmatchedEntities = pattern.entities.filter(
      (e) => !bindings.has(e.variable)
    );

    for (const relation of pattern.relations) {
      // Check if source is bound
      const sourceId = bindings.get(relation.source);
      if (!sourceId) continue;

      // Find matching relations from source
      const relations = this.graph.getOutgoingRelations(sourceId);

      for (const rel of relations) {
        // Check relation type
        if (rel.type !== relation.type) continue;

        // Check if target could match an unbound entity
        const targetEntity = this.graph.getEntity(rel.targetId);
        if (!targetEntity) continue;

        const targetPatternEntity = unmatchedEntities.find((e) => {
          if (e.type && e.type !== targetEntity.type) return false;
          if (e.label) {
            const labelLower = e.label.toLowerCase();
            if (
              !targetEntity.label.toLowerCase().includes(labelLower) &&
              !targetEntity.metadata.aliases.some((a) =>
                a.toLowerCase().includes(labelLower)
              )
            ) {
              return false;
            }
          }
          return true;
        });

        if (!targetPatternEntity) continue;

        // Try binding the target
        const newBindings = new Map(bindings);
        newBindings.set(targetPatternEntity.variable, rel.targetId);

        // Check constraints for target
        let constraintsSatisfied = true;
        for (const constraint of pattern.constraints || []) {
          if (constraint.entity === targetPatternEntity.variable) {
            if (!this.checkConstraint(targetEntity, constraint)) {
              constraintsSatisfied = false;
              break;
            }
          }
        }

        if (!constraintsSatisfied) continue;

        // Recursively try to match remaining
        const result = this.tryMatch(
          pattern,
          targetEntity,
          newBindings,
          new Set(visited)
        );

        if (result) {
          return result;
        }
      }
    }

    return null;
  }

  /**
   * Check if an entity satisfies a constraint
   */
  private checkConstraint(entity: Entity, constraint: PatternConstraint): boolean {
    let value: unknown;

    if (constraint.property === 'label') {
      value = entity.label;
    } else if (constraint.property === 'type') {
      value = entity.type;
    } else {
      value = entity.properties[constraint.property];
    }

    switch (constraint.operator) {
      case 'eq':
        return value === constraint.value;
      case 'neq':
        return value !== constraint.value;
      case 'gt':
        return (value as number) > (constraint.value as number);
      case 'lt':
        return (value as number) < (constraint.value as number);
      case 'contains':
        return String(value).includes(String(constraint.value));
      case 'regex':
        return new RegExp(constraint.value as string).test(String(value));
      default:
        return true;
    }
  }
}

interface PatternMatch {
  bindings: Map<string, string>;
  entities: Array<{ variable: string; entity: Entity }>;
}

// ============================================================================
// Inference Engine
// ============================================================================

/**
 * Main inference engine for rule-based reasoning
 */
export class InferenceEngine {
  private graph: NexusGraph;
  private matcher: PatternMatcher;
  private rules: InferenceRule[];
  private maxIterations: number;
  private confidenceThreshold: number;

  constructor(config: {
    graph: NexusGraph;
    rules?: InferenceRule[];
    maxIterations?: number;
    confidenceThreshold?: number;
  }) {
    this.graph = config.graph;
    this.matcher = new PatternMatcher(config.graph);
    this.rules = config.rules || [];
    this.maxIterations = config.maxIterations || 10;
    this.confidenceThreshold = config.confidenceThreshold || 0.5;
  }

  /**
   * Add a rule to the engine
   */
  addRule(rule: InferenceRule): void {
    this.rules.push(rule);
  }

  /**
   * Remove a rule
   */
  removeRule(ruleId: string): void {
    const index = this.rules.findIndex((r) => r.id === ruleId);
    if (index !== -1) {
      this.rules.splice(index, 1);
    }
  }

  /**
   * Run inference and derive new relations
   */
  run(options: {
    maxIterations?: number;
    confidenceThreshold?: number;
    ruleIds?: string[];
  } = {}): InferenceResult {
    const maxIterations = options.maxIterations || this.maxIterations;
    const confidenceThreshold = options.confidenceThreshold || this.confidenceThreshold;
    const rulesToApply = options.ruleIds
      ? this.rules.filter((r) => options.ruleIds!.includes(r.id))
      : this.rules;

    const startTime = Date.now();
    const derivedRelations: DerivedRelation[] = [];
    const appliedRules: AppliedRule[] = [];
    const ruleStats = new Map<string, number>();

    // Track existing relations to avoid duplicates
    const existingRelations = new Set(
      Array.from(this.graph.relations.values()).map(
        (r) => `${r.sourceId}:${r.type}:${r.targetId}`
      )
    );

    for (let iteration = 0; iteration < maxIterations; iteration++) {
      let newRelationsDerived = false;

      for (const rule of rulesToApply) {
        const matches = this.matcher.findMatches(rule.antecedent);

        for (const match of matches) {
          const sourceId = match.bindings.get(rule.consequent.source);
          const targetId = match.bindings.get(rule.consequent.target);

          if (!sourceId || !targetId) continue;

          const relationKey = `${sourceId}:${rule.consequent.relationType}:${targetId}`;

          // Skip if relation already exists
          if (existingRelations.has(relationKey)) continue;

          // Calculate confidence
          const confidence = this.calculateConfidence(rule, match);

          if (confidence < confidenceThreshold) continue;

          const derived: DerivedRelation = {
            sourceId,
            targetId,
            relationType: rule.consequent.relationType,
            inferredBy: rule.id,
            confidence,
            derivationPath: [
              {
                rule: rule.id,
                matchedPattern: rule.antecedent,
                entities: Array.from(match.bindings.values()),
              },
            ],
          };

          derivedRelations.push(derived);
          existingRelations.add(relationKey);
          newRelationsDerived = true;

          // Update stats
          ruleStats.set(rule.id, (ruleStats.get(rule.id) || 0) + 1);
        }
      }

      if (!newRelationsDerived) break;
    }

    // Build applied rules summary
    for (const [ruleId, count] of ruleStats) {
      const rule = this.rules.find((r) => r.id === ruleId);
      if (rule) {
        appliedRules.push({
          ruleId,
          timesApplied: count,
          confidence: rule.confidence,
        });
      }
    }

    return {
      derivedRelations,
      appliedRules,
      metadata: {
        inferenceId: `inf-${Date.now()}`,
        timestamp: new Date(),
        duration: Date.now() - startTime,
        entitiesProcessed: this.graph.entities.size,
        relationsDerived: derivedRelations.length,
      },
    };
  }

  /**
   * Calculate confidence for a derived relation
   */
  private calculateConfidence(
    rule: InferenceRule,
    match: PatternMatch
  ): number {
    // Base confidence from rule
    let confidence = rule.confidence;

    // Reduce confidence if not all pattern entities were matched
    const matchRatio = match.entities.length / rule.antecedent.entities.length;
    confidence *= matchRatio;

    // Reduce confidence for each constraint that was checked
    if (rule.antecedent.constraints) {
      const constraintFactor = Math.pow(0.95, rule.antecedent.constraints.length);
      confidence *= constraintFactor;
    }

    return Math.min(1, Math.max(0, confidence));
  }

  /**
   * Apply derived relations to the graph
   */
  applyResults(result: InferenceResult): number {
    let applied = 0;

    for (const derived of result.derivedRelations) {
      const relation = this.graph.addRelation(
        derived.sourceId,
        derived.targetId,
        derived.relationType,
        {
          inferredBy: derived.inferredBy,
          confidence: derived.confidence,
          derivationPath: derived.derivationPath,
        },
        derived.confidence
      );

      if (relation) {
        applied++;
      }
    }

    return applied;
  }

  /**
   * Explain how a relation was derived
   */
  explainRelation(sourceId: string, targetId: string): DerivationStep[] {
    const steps: DerivationStep[] = [];

    const relations = this.graph.getOutgoingRelations(sourceId);
    for (const rel of relations) {
      if (rel.targetId !== targetId) continue;
      if (rel.properties.inferredBy) {
        const rule = this.rules.find((r) => r.id === rel.properties.inferredBy);
        if (rule) {
          steps.push({
            rule: rule.id,
            matchedPattern: rule.antecedent,
            entities: [sourceId, targetId],
          });
        }
      }
    }

    return steps;
  }

  /**
   * Get statistics about rule usage
   */
  getRuleStats(): RuleStats[] {
    return this.rules.map((rule) => ({
      ruleId: rule.id,
      ruleName: rule.name,
      domain: rule.metadata.domain,
      timesApplied: rule.metadata.statistics?.timesApplied || 0,
      successRate: rule.metadata.statistics?.successRate || 0,
    }));
  }
}

// ============================================================================
// Built-in Rules
// ============================================================================

/**
 * Common inference rules for knowledge graphs
 */
export const builtInRules: InferenceRule[] = [
  // Transitive closure: A -> B -> C implies A -> C
  {
    id: 'transitive-closure',
    name: 'Transitive Closure',
    description: 'If A relates to B and B relates to C, then A relates to C',
    antecedent: {
      entities: [
        { id: 'a', variable: 'A' },
        { id: 'b', variable: 'B' },
        { id: 'c', variable: 'C' },
      ],
      relations: [
        { source: 'A', target: 'B', type: 'related_to' as RelationType },
        { source: 'B', target: 'C', type: 'related_to' as RelationType },
      ],
    },
    consequent: {
      source: 'A',
      target: 'C',
      relationType: 'related_to' as RelationType,
      confidence: 0.7,
    },
    confidence: 0.7,
    metadata: {
      domain: ['general'],
      createdBy: 'system',
    },
  },

  // Same-as inference
  {
    id: 'same-as-alias',
    name: 'Alias Equivalence',
    description: 'Entities with matching aliases are the same',
    antecedent: {
      entities: [
        { id: 'a', variable: 'A' },
        { id: 'b', variable: 'B' },
      ],
      relations: [],
      constraints: [
        {
          entity: 'A',
          property: 'aliases',
          operator: 'contains' as const,
          value: '', // Would need actual alias value
        },
      ],
    },
    consequent: {
      source: 'A',
      target: 'B',
      relationType: 'related_to' as RelationType,
      properties: { relationSubtype: 'same_as' },
      confidence: 0.9,
    },
    confidence: 0.9,
    metadata: {
      domain: ['entity-resolution'],
      createdBy: 'system',
    },
  },

  // Hierarchy inference
  {
    id: 'part-of-transitive',
    name: 'Part-Of Hierarchy',
    description: 'Part-of is transitive',
    antecedent: {
      entities: [
        { id: 'a', variable: 'A' },
        { id: 'b', variable: 'B' },
        { id: 'c', variable: 'C' },
      ],
      relations: [
        { source: 'A', target: 'B', type: 'part_of' as RelationType },
        { source: 'B', target: 'C', type: 'part_of' as RelationType },
      ],
    },
    consequent: {
      source: 'A',
      target: 'C',
      relationType: 'part_of' as RelationType,
      confidence: 0.8,
    },
    confidence: 0.8,
    metadata: {
      domain: ['hierarchy', 'ontology'],
      createdBy: 'system',
    },
  },
];

// ============================================================================
// Types
// ============================================================================

interface RuleStats {
  ruleId: string;
  ruleName: string;
  domain: string[];
  timesApplied: number;
  successRate: number;
}

// ============================================================================
// Factory Function
// ============================================================================

export function createInferenceEngine(
  graph: NexusGraph,
  options?: {
    rules?: InferenceRule[];
    maxIterations?: number;
    confidenceThreshold?: number;
  }
): InferenceEngine {
  return new InferenceEngine({
    graph,
    rules: options?.rules || builtInRules,
    maxIterations: options?.maxIterations,
    confidenceThreshold: options?.confidenceThreshold,
  });
}
