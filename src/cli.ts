/**
 * Nexus CLI
 * Command-line interface for the knowledge graph
 */

import { createNexus, Nexus } from './index.js';
import * as readline from 'readline';

// ============================================================================
// CLI Setup
// ============================================================================

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

let nexus: Nexus;
let running = true;

// ============================================================================
// Main
// ============================================================================

async function main() {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   ███╗   ██╗███████╗██╗  ██╗██╗   ██╗███████╗             ║
║   ████╗  ██║██╔════╝╚██╗██╔╝██║   ██║██╔════╝             ║
║   ██╔██╗ ██║█████╗   ╚███╔╝ ██║   ██║███████╗             ║
║   ██║╚██╗██║██╔══╝   ██╔██╗ ██║   ██║╚════██║             ║
║   ██║ ╚████║███████╗██╔╝ ██╗╚██████╔╝███████║             ║
║   ╚═╝  ╚═══╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚══════╝             ║
║                                                           ║
║   Federated Knowledge Graph Engine - CLI                 ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
`);

  // Initialize Nexus
  nexus = createNexus({
    nodeId: 'cli-' + Date.now(),
    inference: {
      enabled: true,
      rules: [],
      maxIterations: 10,
      confidenceThreshold: 0.5,
      parallelExecution: true,
    },
  });

  await nexus.initialize();

  // Add sample data
  addSampleData();

  // Show help
  showHelp();

  // Main loop
  while (running) {
    const input = await prompt('nexus> ');
    await processCommand(input);
  }

  rl.close();
}

// ============================================================================
// Commands
// ============================================================================

async function processCommand(input: string): Promise<void> {
  const [command, ...args] = input.trim().split(/\s+/);

  switch (command.toLowerCase()) {
    case 'help':
    case 'h':
      showHelp();
      break;

    case 'exit':
    case 'quit':
    case 'q':
      running = false;
      console.log('Goodbye!');
      break;

    case 'stats':
      showStats();
      break;

    case 'list':
    case 'ls':
      await listEntities(args[0]);
      break;

    case 'listrels':
      await listRelations();
      break;

    case 'add':
      await addEntity(args);
      break;

    case 'addrel':
      await addRelation(args);
      break;

    case 'get':
      await getEntity(args[0]);
      break;

    case 'delete':
      await deleteEntity(args[0]);
      break;

    case 'search':
      await search(args.join(' '));
      break;

    case 'traverse':
      await traverse(args);
      break;

    case 'infer':
      await runInference();
      break;

    case 'export':
      await exportGraph();
      break;

    case 'clear':
      console.clear();
      break;

    default:
      if (command) {
        console.log(`Unknown command: ${command}`);
        console.log('Type "help" for available commands.');
      }
  }
}

function showHelp(): void {
  console.log(`
Available Commands:
  help, h           Show this help message
  exit, quit, q     Exit the CLI
  
  stats             Show graph statistics
  list, ls [type]   List all entities (optionally filter by type)
  listrels          List all relations
  
  add <type> <label> [props]  Add an entity
                            Example: add person "John Doe" {"age": 30}
  addrel <src> <tgt> <type> Add a relation
  get <id>          Get entity by ID
  delete <id>       Delete an entity
  
  search <query>    Search entities by label
  traverse <id> [depth]  Traverse from entity
  infer             Run inference engine
  
  export            Export graph to JSON
  clear             Clear the screen
`);
}

async function showStats(): Promise<void> {
  const stats = nexus.getStats();

  console.log(`
╔═══════════════════════════════════════╗
║           Graph Statistics            ║
╠═══════════════════════════════════════╣
║  Entities: ${stats.entityCount.toString().padEnd(20)}        ║
║  Relations: ${stats.relationCount.toString().padEnd(19)}       ║
╠═══════════════════════════════════════╣
║  Entity Types:                        ║`);

  for (const [type, count] of Object.entries(stats.entityCounts)) {
    console.log(`║    ${type.padEnd(12)}: ${count.toString().padEnd(17)}   ║`);
  }

  console.log(`╠═══════════════════════════════════════╣
║  Relation Types:                      ║`);

  for (const [type, count] of Object.entries(stats.relationCounts)) {
    console.log(`║    ${type.padEnd(12)}: ${count.toString().padEnd(17)}   ║`);
  }

  console.log(`╚═══════════════════════════════════════╝`);
}

async function listEntities(type?: string): Promise<void> {
  const stats = nexus.getStats();
  const entities = Array.from((nexus as unknown as { graph: { entities: Map<string, unknown> } }).graph.entities.values()) as { id: string; label: string; type: string }[];

  console.log(`
┌─────────────────────────────────────────────┐
│ ID                  Label                  Type        │
├─────────────────────────────────────────────┤`);

  for (const entity of entities) {
    if (!type || entity.type === type) {
      console.log(`│ ${entity.id.substring(0, 18).padEnd(18)} ${entity.label.substring(0, 20).padEnd(22)} ${entity.type.padEnd(10)}│`);
    }
  }

  console.log(`└─────────────────────────────────────────────┘`);
}

async function listRelations(): Promise<void> {
  const relations = Array.from((nexus as unknown as { graph: { relations: Map<string, unknown> } }).graph.relations.values()) as { id: string; sourceId: string; targetId: string; type: string }[];

  console.log(`
┌─────────────────────────────────────────────────────────────┐
│ ID                  Source              Target             Type        │
├─────────────────────────────────────────────────────────────┤`);

  for (const rel of relations) {
    console.log(`│ ${rel.id.substring(0, 18).padEnd(18)} ${rel.sourceId.substring(0, 18).padEnd(18)} ${rel.targetId.substring(0, 18).padEnd(18)} ${rel.type.padEnd(10)}│`);
  }

  console.log(`└─────────────────────────────────────────────────────────────┘`);
}

async function addEntity(args: string[]): Promise<void> {
  if (args.length < 2) {
    console.log('Usage: add <type> <label> [properties]');
    return;
  }

  const [type, label, propsJson] = args;
  let properties = {};

  if (propsJson) {
    try {
      properties = JSON.parse(propsJson);
    } catch {
      console.log('Invalid JSON properties');
      return;
    }
  }

  const entity = nexus.addEntity(
    type as Parameters<typeof nexus.addEntity>[0],
    label.replace(/^["']|["']$/g, ''),
    properties
  );

  console.log(`✓ Added entity: ${entity.id}`);
}

async function addRelation(args: string[]): Promise<void> {
  if (args.length < 3) {
    console.log('Usage: addrel <sourceId> <targetId> <type>');
    return;
  }

  const [sourceId, targetId, type] = args;

  const relation = nexus.addRelation(sourceId, targetId, type as Parameters<typeof nexus.addRelation>[2]);

  if (relation) {
    console.log(`✓ Added relation: ${relation.id}`);
  } else {
    console.log('✗ Failed to add relation. Check entity IDs.');
  }
}

async function getEntity(id?: string): Promise<void> {
  if (!id) {
    console.log('Usage: get <entityId>');
    return;
  }

  const entity = nexus.getEntity(id);

  if (!entity) {
    console.log('Entity not found');
    return;
  }

  console.log(`
┌─────────────────────────────────────────────┐
│ Entity: ${entity.label.padEnd(37)}  │
├─────────────────────────────────────────────┤
│ ID:     ${entity.id.substring(0, 40).padEnd(40)}│
│ Type:   ${entity.type.padEnd(40)}│
│ Version: ${entity.metadata.version.toString().padEnd(38)}│
│ Created: ${new Date(entity.timestamps.createdAt).toISOString().padEnd(38)}│
├─────────────────────────────────────────────┤
│ Properties:                                 │`);

  for (const [key, value] of Object.entries(entity.properties)) {
    console.log(`│   ${key}: ${JSON.stringify(value).substring(0, 35).padEnd(36)}│`);
  }

  console.log(`└─────────────────────────────────────────────┘`);
}

async function deleteEntity(id?: string): Promise<void> {
  if (!id) {
    console.log('Usage: delete <entityId>');
    return;
  }

  const deleted = nexus.deleteEntity(id);

  if (deleted) {
    console.log('✓ Entity deleted');
  } else {
    console.log('Entity not found');
  }
}

async function search(query?: string): Promise<void> {
  if (!query) {
    console.log('Usage: search <query>');
    return;
  }

  const entities = Array.from((nexus as unknown as { graph: { entities: Map<string, unknown> } }).graph.entities.values()) as { id: string; label: string; type: string }[];
  const queryLower = query.toLowerCase();

  const results = entities.filter(e =>
    e.label.toLowerCase().includes(queryLower) ||
    e.type.toLowerCase().includes(queryLower)
  );

  if (results.length === 0) {
    console.log('No results found');
    return;
  }

  console.log(`
┌─────────────────────────────────────────────────────────────┐
│ Search Results for "${query}"                               │
├─────────────────────────────────────────────────────────────┤`);

  for (const entity of results) {
    console.log(`│ ${entity.id.substring(0, 18).padEnd(18)} ${entity.label.substring(0, 25).padEnd(27)} ${entity.type.padEnd(10)}│`);
  }

  console.log(`└─────────────────────────────────────────────────────────────┘`);
}

async function traverse(args: string[]): Promise<void> {
  if (args.length < 1) {
    console.log('Usage: traverse <entityId> [maxDepth]');
    return;
  }

  const [entityId, depthStr] = args;
  const maxDepth = parseInt(depthStr) || 3;

  const result = nexus.traverse([entityId], maxDepth);

  console.log(`
┌─────────────────────────────────────────────────────────────┐
│ Traversal Results (depth: ${maxDepth})                         │
├─────────────────────────────────────────────────────────────┤
│ Nodes Found: ${result.nodes.length.toString().padEnd(44)}   │
│ Edges Found: ${result.edges.length.toString().padEnd(45)}   │
├─────────────────────────────────────────────────────────────┤`);

  for (const node of result.nodes.slice(0, 10)) {
    console.log(`│ ${node.label.substring(0, 50).padEnd(52)}│`);
  }

  if (result.nodes.length > 10) {
    console.log(`│ ... and ${result.nodes.length - 10} more nodes                                    │`);
  }

  console.log(`└─────────────────────────────────────────────────────────────┘`);
}

async function runInference(): Promise<void> {
  console.log('Running inference engine...');

  const result = nexus.runInference();

  console.log(`
┌─────────────────────────────────────────────────────────────┐
│ Inference Results                                           │
├─────────────────────────────────────────────────────────────┤
│ Duration: ${result.metadata.duration.toString().padEnd(47)}ms│
│ Entities Processed: ${result.metadata.entitiesProcessed.toString().padEnd(38)}│
│ Relations Derived: ${result.metadata.relationsDerived.toString().padEnd(39)}│
├─────────────────────────────────────────────────────────────┤`);

  if (result.appliedRules.length > 0) {
    console.log(`│ Applied Rules:                                             │`);
    for (const rule of result.appliedRules) {
      console.log(`│   ${rule.ruleName || rule.ruleId} (${rule.timesApplied} times)`.padEnd(62) + `│`);
    }
  }

  if (result.derivedRelations.length > 0) {
    console.log(`├─────────────────────────────────────────────────────────────┤`);
    console.log(`│ Derived Relations:                                          │`);
    for (const rel of result.derivedRelations.slice(0, 5)) {
      console.log(`│   ${rel.relationType} (confidence: ${rel.confidence.toFixed(2)})`.padEnd(62) + `│`);
    }
  }

  console.log(`└─────────────────────────────────────────────────────────────┘`);
}

async function exportGraph(): Promise<void> {
  const data = nexus.export();
  console.log(JSON.stringify(data, null, 2));
}

// ============================================================================
// Utilities
// ============================================================================

function prompt(question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, resolve);
  });
}

// ============================================================================
// Sample Data
// ============================================================================

function addSampleData(): void {
  // Create entities
  const ai = nexus.addEntity('concept', 'Artificial Intelligence', {
    description: 'The simulation of human intelligence processes by machines',
    founded: 1956,
  }, undefined, { tags: ['ai', 'technology', 'research'] });

  const ml = nexus.addEntity('concept', 'Machine Learning', {
    description: 'A subset of AI that enables systems to learn from data',
  }, undefined, { tags: ['ai', 'ml', 'technology'] });

  const dl = nexus.addEntity('concept', 'Deep Learning', {
    description: 'Neural networks with multiple layers',
  }, undefined, { tags: ['ai', 'ml', 'neural-networks'] });

  const nlp = nexus.addEntity('concept', 'Natural Language Processing', {
    description: 'AI branch dealing with understanding human language',
  }, undefined, { tags: ['ai', 'nlp', 'language'] });

  const bert = nexus.addEntity('concept', 'BERT', {
    description: 'Bidirectional Encoder Representations from Transformers',
    year: 2018,
  }, undefined, { tags: ['nlp', 'transformer', 'google'] });

  const gpt = nexus.addEntity('concept', 'GPT', {
    description: 'Generative Pre-trained Transformer',
    year: 2018,
  }, undefined, { tags: ['nlp', 'transformer', 'openai'] });

  const turing = nexus.addEntity('person', 'Alan Turing', {
    born: 1912,
    died: 1954,
    nationality: 'British',
    occupation: 'Mathematician, Computer Scientist',
  }, undefined, { tags: ['computer-science', 'pioneer'] });

  const hinton = nexus.addEntity('person', 'Geoffrey Hinton', {
    born: 1947,
    nationality: 'Canadian-British',
    occupation: 'Computer Scientist',
    knownFor: 'Deep Learning',
  }, undefined, { tags: ['ai', 'researcher', 'godfather-of-ai'] });

  const bengio = nexus.addEntity('person', 'Yoshua Bengio', {
    born: 1964,
    nationality: 'Canadian',
    occupation: 'Computer Scientist',
  }, undefined, { tags: ['ai', 'researcher'] });

  const lecun = nexus.addEntity('person', 'Yann LeCun', {
    born: 1960,
    nationality: 'French-American',
    occupation: 'Computer Scientist',
  }, undefined, { tags: ['ai', 'researcher'] });

  const mit = nexus.addEntity('organization', 'MIT', {
    type: 'University',
    location: 'Cambridge, Massachusetts',
  }, undefined, { tags: ['education', 'research'] });

  const stanford = nexus.addEntity('organization', 'Stanford University', {
    type: 'University',
    location: 'Stanford, California',
  }, undefined, { tags: ['education', 'research'] });

  const google = nexus.addEntity('organization', 'Google', {
    type: 'Technology Company',
    founded: 1998,
    CEO: 'Sundar Pichai',
  }, undefined, { tags: ['tech', 'ai'] });

  const openai = nexus.addEntity('organization', 'OpenAI', {
    type: 'AI Research Lab',
    founded: 2015,
  }, undefined, { tags: ['ai', 'research'] });

  // Create relations
  nexus.addRelation(ml.id, ai.id, 'part_of');
  nexus.addRelation(dl.id, ml.id, 'part_of');
  nexus.addRelation(nlp.id, ai.id, 'part_of');
  nexus.addRelation(nlp.id, ml.id, 'part_of');

  nexus.addRelation(bert.id, nlp.id, 'part_of');
  nexus.addRelation(gpt.id, nlp.id, 'part_of');
  nexus.addRelation(bert.id, dl.id, 'uses');
  nexus.addRelation(gpt.id, dl.id, 'uses');

  nexus.addRelation(turing.id, ai.id, 'created_by');
  nexus.addRelation(hinton.id, dl.id, 'created_by');
  nexus.addRelation(bengio.id, dl.id, 'contributed_to');
  nexus.addRelation(lecun.id, dl.id, 'contributed_to');

  nexus.addRelation(hinton.id, stanford.id, 'affiliated_with');
  nexus.addRelation(bengio.id, mit.id, 'affiliated_with');
  nexus.addRelation(lecun.id, mit.id, 'affiliated_with');

  nexus.addRelation(google.id, bert.id, 'created_by');
  nexus.addRelation(openai.id, gpt.id, 'created_by');

  nexus.addRelation(turing.id, hinton.id, 'influenced');
  nexus.addRelation(hinton.id, bengio.id, 'collaborates_with');
  nexus.addRelation(bengio.id, lecun.id, 'collaborates_with');

  console.log(`\n✓ Loaded sample knowledge graph with ${nexus.getStats().entityCount} entities and ${nexus.getStats().relationCount} relations\n`);
}

// ============================================================================
// Start
// ============================================================================

main().catch(console.error);
