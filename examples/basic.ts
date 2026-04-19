/**
 * Nexus Basic Usage Examples
 */

import { createNexus } from '../src/index.js';

async function main() {
  console.log('🚀 Starting Nexus Examples...\n');

  // Create Nexus instance
  const nexus = await createNexus({
    nodeId: 'examples',
    inference: {
      enabled: true,
      maxIterations: 10,
      confidenceThreshold: 0.5,
    },
  });

  // ==========================================================================
  // Example 1: Basic Entity Operations
  // ==========================================================================
  console.log('📝 Example 1: Basic Entity Operations\n');

  const alice = nexus.addEntity('person', 'Alice Johnson', {
    role: 'Research Scientist',
    department: 'AI Research',
    email: 'alice@nexus.dev',
    yearsAtCompany: 5,
  }, undefined, { tags: ['team', 'research', 'ai'] });

  const bob = nexus.addEntity('person', 'Bob Chen', {
    role: 'Senior Engineer',
    department: 'Platform',
    email: 'bob@nexus.dev',
    yearsAtCompany: 3,
  }, undefined, { tags: ['team', 'platform'] });

  const carol = nexus.addEntity('person', 'Carol Davis', {
    role: 'Product Designer',
    department: 'Design',
    email: 'carol@nexus.dev',
  }, undefined, { tags: ['team', 'design'] });

  console.log(`Created entities:`);
  console.log(`  - ${alice.label} (${alice.type})`);
  console.log(`  - ${bob.label} (${bob.type})`);
  console.log(`  - ${carol.label} (${carol.type})\n`);

  // ==========================================================================
  // Example 2: Concept Entities
  // ==========================================================================
  console.log('🧠 Example 2: Concept Entities\n');

  const nexusCore = nexus.addEntity('concept', 'Nexus Core', {
    description: 'The core knowledge graph engine',
    version: '1.0.0',
    language: 'TypeScript',
  }, undefined, { tags: ['core', 'product'] });

  const knowledgeGraph = nexus.addEntity('concept', 'Knowledge Graph', {
    description: 'Graph-based knowledge representation structure',
    type: 'data-structure',
  }, undefined, { tags: ['concept', 'data'] });

  const crdt = nexus.addEntity('concept', 'CRDT', {
    description: 'Conflict-free Replicated Data Types',
    type: 'distributed-systems',
  }, undefined, { tags: ['concept', 'distributed', 'sync'] });

  const queryEngine = nexus.addEntity('concept', 'Query Engine', {
    description: 'Hybrid graph traversal and vector search',
  }, undefined, { tags: ['concept', 'query'] });

  const inferenceEngine = nexus.addEntity('concept', 'Inference Engine', {
    description: 'Rule-based reasoning system',
  }, undefined, { tags: ['concept', 'ai'] });

  console.log(`Created concepts:`);
  console.log(`  - ${nexusCore.label}`);
  console.log(`  - ${knowledgeGraph.label}`);
  console.log(`  - ${crdt.label}`);
  console.log(`  - ${queryEngine.label}`);
  console.log(`  - ${inferenceEngine.label}\n`);

  // ==========================================================================
  // Example 3: Organization and Location Entities
  // ==========================================================================
  console.log('🏢 Example 3: Organization and Location Entities\n');

  const company = nexus.addEntity('organization', 'Nexus Technologies', {
    founded: 2024,
    headquarters: 'San Francisco',
    employees: 50,
    type: 'Technology',
  }, undefined, { tags: ['company'] });

  const lab = nexus.addEntity('location', 'AI Research Lab', {
    address: '123 Innovation Drive',
    city: 'San Francisco',
    state: 'CA',
    capacity: 20,
  }, undefined, { tags: ['office', 'research'] });

  const hq = nexus.addEntity('location', 'Main Headquarters', {
    address: '456 Tech Boulevard',
    city: 'San Francisco',
    state: 'CA',
  });

  console.log(`Created organizations/locations:`);
  console.log(`  - ${company.label}`);
  console.log(`  - ${lab.label}`);
  console.log(`  - ${hq.label}\n`);

  // ==========================================================================
  // Example 4: Relation Operations
  // ==========================================================================
  console.log('🔗 Example 4: Relation Operations\n');

  // Person to Organization relations
  nexus.addRelation(alice.id, company.id, 'works_at', { since: 2019 });
  nexus.addRelation(bob.id, company.id, 'works_at', { since: 2021 });
  nexus.addRelation(carol.id, company.id, 'works_at', { since: 2020 });

  // Person to Person relations
  nexus.addRelation(alice.id, bob.id, 'manages', { since: 2022 });
  nexus.addRelation(bob.id, carol.id, 'collaborates_with', { projects: 3 });
  nexus.addRelation(alice.id, carol.id, 'collaborates_with', { projects: 2 });

  // Concept relations (implements, uses, depends_on)
  nexus.addRelation(nexusCore.id, knowledgeGraph.id, 'implements', { priority: 'high' });
  nexus.addRelation(nexusCore.id, crdt.id, 'uses', { version: '1.0' });
  nexus.addRelation(nexusCore.id, queryEngine.id, 'includes');
  nexus.addRelation(nexusCore.id, inferenceEngine.id, 'includes');
  nexus.addRelation(queryEngine.id, knowledgeGraph.id, 'depends_on');
  nexus.addRelation(inferenceEngine.id, knowledgeGraph.id, 'depends_on');

  // Organization to Location relations
  nexus.addRelation(company.id, hq.id, 'located_in');
  nexus.addRelation(company.id, lab.id, 'has_facility');

  // Transitive relations
  nexus.addRelation(alice.id, lab.id, 'works_in');
  nexus.addRelation(bob.id, hq.id, 'works_in');

  console.log('Created relations between entities\n');

  // ==========================================================================
  // Example 5: Query the Graph
  // ==========================================================================
  console.log('🔍 Example 5: Query the Graph\n');

  // Get statistics
  const stats = nexus.getStats();
  console.log('Graph Statistics:');
  console.log(`  Total Entities: ${stats.entityCount}`);
  console.log(`  Total Relations: ${stats.relationCount}`);
  console.log('\nEntity Counts by Type:');
  for (const [type, count] of Object.entries(stats.entityCounts)) {
    console.log(`  ${type}: ${count}`);
  }
  console.log('\nRelation Counts by Type:');
  for (const [type, count] of Object.entries(stats.relationCounts)) {
    console.log(`  ${type}: ${count}`);
  }

  // ==========================================================================
  // Example 6: Traversal
  // ==========================================================================
  console.log('\n📊 Example 6: Graph Traversal\n');

  // Traverse from Alice
  const aliceTraversal = nexus.traverse([alice.id], 2, {
    directions: ['outbound'],
  });

  console.log(`Traversing from ${alice.label} (depth=2):`);
  console.log(`  Nodes found: ${aliceTraversal.nodes.length}`);
  console.log('  Connected entities:');
  for (const node of aliceTraversal.nodes.slice(0, 5)) {
    console.log(`    - ${node.label} (${node.type})`);
  }

  // Traverse from Nexus Core
  const coreTraversal = nexus.traverse([nexusCore.id], 3, {
    directions: ['outbound'],
  });

  console.log(`\nTraversing from ${nexusCore.label} (depth=3):`);
  console.log(`  Nodes found: ${coreTraversal.nodes.length}`);
  for (const node of coreTraversal.nodes) {
    console.log(`    - ${node.label}`);
  }

  // ==========================================================================
  // Example 7: Entity Lookup
  // ==========================================================================
  console.log('\n👤 Example 7: Entity Lookup\n');

  const lookupEntity = nexus.getEntity(alice.id);
  if (lookupEntity) {
    console.log(`Entity Details for ${lookupEntity.label}:`);
    console.log(`  ID: ${lookupEntity.id}`);
    console.log(`  Type: ${lookupEntity.type}`);
    console.log(`  Version: ${lookupEntity.metadata.version}`);
    console.log(`  Tags: ${lookupEntity.metadata.tags.join(', ')}`);
    console.log('  Properties:');
    for (const [key, value] of Object.entries(lookupEntity.properties)) {
      console.log(`    ${key}: ${value}`);
    }
  }

  // Get relations for Alice
  const aliceRelations = nexus.getRelations(alice.id);
  console.log(`\n${alice.label} has ${aliceRelations.length} relations:`);
  for (const rel of aliceRelations) {
    const target = nexus.getEntity(rel.targetId);
    console.log(`  -> ${rel.type} -> ${target?.label}`);
  }

  // ==========================================================================
  // Example 8: Run Inference
  // ==========================================================================
  console.log('\n🧮 Example 8: Inference Engine\n');

  // Add a custom inference rule
  nexus.addRule({
    id: 'works-in-same-org',
    name: 'Works in Same Organization',
    description: 'If A works at X and B works at X, they are colleagues',
    antecedent: {
      entities: [
        { id: 'a', variable: 'A', type: 'person' },
        { id: 'b', variable: 'B', type: 'person' },
        { id: 'o', variable: 'O', type: 'organization' },
      ],
      relations: [
        { source: 'A', target: 'O', type: 'works_at' },
        { source: 'B', target: 'O', type: 'works_at' },
      ],
    },
    consequent: {
      source: 'A',
      target: 'B',
      relationType: 'colleague',
      confidence: 0.85,
    },
    confidence: 0.85,
    metadata: {
      domain: ['organization'],
      createdBy: 'examples',
    },
  });

  // Run inference
  const inferenceResult = nexus.runInference({
    confidenceThreshold: 0.5,
  });

  console.log('Inference Results:');
  console.log(`  Duration: ${inferenceResult.metadata.duration}ms`);
  console.log(`  Entities processed: ${inferenceResult.metadata.entitiesProcessed}`);
  console.log(`  Relations derived: ${inferenceResult.metadata.relationsDerived}`);
  console.log('\n  Applied rules:');
  for (const rule of inferenceResult.appliedRules) {
    console.log(`    - ${rule.ruleName} (applied ${rule.timesApplied} times)`);
  }

  // Apply the derived relations
  const applied = nexus.applyInferences(inferenceResult);
  console.log(`\n  Applied ${applied} new relations to graph`);

  // Show updated stats
  const newStats = nexus.getStats();
  console.log(`  Total relations now: ${newStats.relationCount}`);

  // ==========================================================================
  // Example 9: Export Graph
  // ==========================================================================
  console.log('\n💾 Example 9: Export Graph\n');

  const exported = nexus.export();
  console.log('Exported graph structure:');
  console.log(`  Graph ID: ${(exported as { id: string }).id}`);
  console.log(`  Entities: ${(exported as { entities: unknown[] }).entities.length}`);
  console.log(`  Relations: ${(exported as { relations: unknown[] }).relations.length}`);

  // ==========================================================================
  // Final Statistics
  // ==========================================================================
  console.log('\n📈 Final Graph Statistics:\n');

  const finalStats = nexus.getStats();
  console.log(`  Total Entities: ${finalStats.entityCount}`);
  console.log(`  Total Relations: ${finalStats.relationCount}`);
  console.log(`  Vector Clock:`, finalStats.vectorClock);

  console.log('\n✅ All examples completed!\n');
}

// Run examples
main().catch(console.error);
