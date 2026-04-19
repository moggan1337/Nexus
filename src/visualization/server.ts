/**
 * Visualization Web Server
 * Express server for the Nexus visualization UI
 */

import express, { Request, Response } from 'express';
import cors from 'cors';
import { NexusGraph } from '../core/graph.js';
import { GraphRenderer } from './renderer.js';
import {
  Entity,
  Relation,
  EntityType,
  RelationType,
} from '../core/types.js';

// ============================================================================
// Server Setup
// ============================================================================

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

// ============================================================================
// Graph State
// ============================================================================

let graph = new NexusGraph({
  name: 'Nexus Knowledge Graph',
  nodeId: 'server',
});

// ============================================================================
// API Routes
// ============================================================================

// Get graph info
app.get('/api/graph', (_req: Request, res: Response) => {
  res.json({
    id: graph.id,
    name: graph.name,
    description: graph.description,
    stats: graph.getStats(),
  });
});

// Get all entities
app.get('/api/entities', (req: Request, res: Response) => {
  const { type, tag, limit, offset } = req.query;

  let entities = Array.from(graph.entities.values());

  if (type) {
    entities = entities.filter((e) => e.type === type);
  }

  if (tag) {
    entities = entities.filter((e) => e.metadata.tags.includes(tag as string));
  }

  const total = entities.length;
  const start = Number(offset) || 0;
  const end = Number(limit) ? start + Number(limit) : undefined;

  res.json({
    entities: entities.slice(start, end),
    total,
    offset: start,
    limit: Number(limit) || total,
  });
});

// Get single entity
app.get('/api/entities/:id', (req: Request, res: Response) => {
  const entity = graph.getEntity(req.params.id);

  if (!entity) {
    return res.status(404).json({ error: 'Entity not found' });
  }

  // Include relations
  const relations = graph.getRelations(entity.id);

  res.json({
    ...entity,
    relations,
  });
});

// Create entity
app.post('/api/entities', (req: Request, res: Response) => {
  const { type, label, properties, embeddings, tags } = req.body;

  if (!type || !label) {
    return res.status(400).json({ error: 'type and label are required' });
  }

  const entity = graph.addEntity(
    type as EntityType,
    label,
    properties || {},
    embeddings,
    { tags: tags || [] }
  );

  res.status(201).json(entity);
});

// Update entity
app.put('/api/entities/:id', (req: Request, res: Response) => {
  const { label, properties, type, embeddings } = req.body;

  const updated = graph.updateEntity(req.params.id, { label, properties, type }, embeddings);

  if (!updated) {
    return res.status(404).json({ error: 'Entity not found' });
  }

  res.json(updated);
});

// Delete entity
app.delete('/api/entities/:id', (req: Request, res: Response) => {
  const deleted = graph.deleteEntity(req.params.id);

  if (!deleted) {
    return res.status(404).json({ error: 'Entity not found' });
  }

  res.status(204).send();
});

// Get all relations
app.get('/api/relations', (req: Request, res: Response) => {
  const { type, sourceId, targetId, limit, offset } = req.query;

  let relations = Array.from(graph.relations.values());

  if (type) {
    relations = relations.filter((r) => r.type === type);
  }

  if (sourceId) {
    relations = relations.filter((r) => r.sourceId === sourceId);
  }

  if (targetId) {
    relations = relations.filter((r) => r.targetId === targetId);
  }

  const total = relations.length;
  const start = Number(offset) || 0;
  const end = Number(limit) ? start + Number(limit) : undefined;

  res.json({
    relations: relations.slice(start, end),
    total,
    offset: start,
    limit: Number(limit) || total,
  });
});

// Create relation
app.post('/api/relations', (req: Request, res: Response) => {
  const { sourceId, targetId, type, properties, weight } = req.body;

  if (!sourceId || !targetId || !type) {
    return res.status(400).json({ error: 'sourceId, targetId, and type are required' });
  }

  const relation = graph.addRelation(
    sourceId,
    targetId,
    type as RelationType,
    properties || {},
    weight
  );

  if (!relation) {
    return res.status(400).json({ error: 'Could not create relation. Entities may not exist.' });
  }

  res.status(201).json(relation);
});

// Delete relation
app.delete('/api/relations/:id', (req: Request, res: Response) => {
  const deleted = graph.deleteRelation(req.params.id);

  if (!deleted) {
    return res.status(404).json({ error: 'Relation not found' });
  }

  res.status(204).send();
});

// Graph traversal
app.post('/api/traverse', (req: Request, res: Response) => {
  const { startIds, maxDepth, directions, relationTypes } = req.body;

  if (!startIds || !Array.isArray(startIds)) {
    return res.status(400).json({ error: 'startIds array is required' });
  }

  const result = graph.traverse(startIds, maxDepth || 3, {
    directions: directions || ['outbound'],
    relationTypes: relationTypes,
  });

  res.json(result);
});

// Export graph
app.get('/api/export', (_req: Request, res: Response) => {
  const data = graph.toJSON();
  res.json(data);
});

// Import graph
app.post('/api/import', (req: Request, res: Response) => {
  const { name, entities, relations } = req.body;

  graph = NexusGraph.fromJSON(
    { name, entities, relations },
    'server'
  );

  res.json({ success: true, stats: graph.getStats() });
});

// Graph visualization data
app.get('/api/visualize', (_req: Request, res: Response) => {
  const entities = Array.from(graph.entities.values()).map((e) => ({
    id: e.id,
    label: e.label,
    type: e.type,
    properties: e.properties,
  }));

  const relations = Array.from(graph.relations.values()).map((r) => ({
    id: r.id,
    source: r.sourceId,
    target: r.targetId,
    type: r.type,
    weight: r.weight,
    bidirectional: r.metadata.bidirectional,
  }));

  res.json({ entities, relations });
});

// Graph statistics
app.get('/api/stats', (_req: Request, res: Response) => {
  res.json(graph.getStats());
});

// ============================================================================
// HTML Page
// ============================================================================

app.get('/', (_req: Request, res: Response) => {
  res.send(getHTML());
});

// ============================================================================
// Server Start
// ============================================================================

app.listen(PORT, () => {
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
║   Federated Knowledge Graph Engine                        ║
║   Server running at http://localhost:${PORT}                ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
  `);

  // Add some sample data
  addSampleData();
});

function addSampleData(): void {
  // Sample entities
  const alice = graph.addEntity('person', 'Alice Johnson', {
    role: 'Researcher',
    department: 'AI Lab',
    email: 'alice@example.com',
  }, undefined, { tags: ['team', 'ai'] });

  const bob = graph.addEntity('person', 'Bob Smith', {
    role: 'Engineer',
    department: 'Platform',
  }, undefined, { tags: ['team', 'platform'] });

  const carol = graph.addEntity('person', 'Carol Williams', {
    role: 'Designer',
    department: 'UX',
  }, undefined, { tags: ['team', 'design'] });

  const nexus = graph.addEntity('concept', 'Nexus', {
    description: 'Federated Knowledge Graph Engine',
    version: '1.0.0',
  }, undefined, { tags: ['project', 'core'] });

  const knowledgeGraph = graph.addEntity('concept', 'Knowledge Graph', {
    description: 'Graph-based knowledge representation',
  }, undefined, { tags: ['concept'] });

  const crdt = graph.addEntity('concept', 'CRDT', {
    description: 'Conflict-free Replicated Data Types',
  }, undefined, { tags: ['concept', 'distributed'] });

  const team = graph.addEntity('organization', 'Nexus Team', {
    size: 10,
    founded: '2024',
  }, undefined, { tags: ['team'] });

  const lab = graph.addEntity('location', 'AI Research Lab', {
    address: '123 Innovation Drive',
  });

  // Sample relations
  graph.addRelation(alice.id, team.id, 'member_of');
  graph.addRelation(bob.id, team.id, 'member_of');
  graph.addRelation(carol.id, team.id, 'member_of');

  graph.addRelation(alice.id, nexus.id, 'created_by');
  graph.addRelation(bob.id, nexus.id, 'contributed_to');
  graph.addRelation(carol.id, nexus.id, 'contributed_to');

  graph.addRelation(nexus.id, knowledgeGraph.id, 'implements');
  graph.addRelation(nexus.id, crdt.id, 'uses');
  graph.addRelation(knowledgeGraph.id, crdt.id, 'depends_on');

  graph.addRelation(team.id, lab.id, 'located_in');
  graph.addRelation(alice.id, bob.id, 'manages');
  graph.addRelation(bob.id, carol.id, 'collaborates_with');

  console.log(`Loaded ${graph.entities.size} entities and ${graph.relations.size} relations`);
}

// ============================================================================
// HTML Template
// ============================================================================

function getHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Nexus - Knowledge Graph Visualizer</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      background: #1a1a2e;
      color: #e0e0e0;
      overflow: hidden;
    }

    .container {
      display: flex;
      height: 100vh;
    }

    .sidebar {
      width: 320px;
      background: #16213e;
      border-right: 1px solid #0f3460;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .sidebar-header {
      padding: 20px;
      background: #0f3460;
      border-bottom: 1px solid #1a4a7a;
    }

    .sidebar-header h1 {
      font-size: 24px;
      color: #ffd700;
      margin-bottom: 5px;
    }

    .sidebar-header p {
      font-size: 12px;
      color: #888;
    }

    .sidebar-content {
      flex: 1;
      overflow-y: auto;
      padding: 15px;
    }

    .stats {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-bottom: 20px;
    }

    .stat-card {
      background: #1a1a2e;
      padding: 15px;
      border-radius: 8px;
      text-align: center;
    }

    .stat-value {
      font-size: 28px;
      font-weight: bold;
      color: #4a90d9;
    }

    .stat-label {
      font-size: 11px;
      color: #888;
      text-transform: uppercase;
    }

    .section {
      margin-bottom: 20px;
    }

    .section-title {
      font-size: 14px;
      color: #ffd700;
      margin-bottom: 10px;
      text-transform: uppercase;
      letter-spacing: 1px;
    }

    .entity-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .entity-item {
      background: #1a1a2e;
      padding: 12px;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.2s;
      border: 1px solid transparent;
    }

    .entity-item:hover {
      background: #252545;
      border-color: #4a90d9;
    }

    .entity-item.selected {
      border-color: #ffd700;
      background: #252545;
    }

    .entity-label {
      font-weight: 600;
      margin-bottom: 4px;
    }

    .entity-type {
      font-size: 11px;
      color: #888;
      text-transform: uppercase;
    }

    .type-badge {
      display: inline-block;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 10px;
      margin-top: 4px;
    }

    .type-concept { background: #4a90d9; }
    .type-person { background: #e74c3c; }
    .type-organization { background: #9b59b6; }
    .type-location { background: #27ae60; }
    .type-event { background: #f39c12; }

    .main-content {
      flex: 1;
      display: flex;
      flex-direction: column;
    }

    .toolbar {
      display: flex;
      gap: 10px;
      padding: 15px;
      background: #16213e;
      border-bottom: 1px solid #0f3460;
    }

    .toolbar button {
      padding: 8px 16px;
      background: #0f3460;
      color: #fff;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 13px;
      transition: all 0.2s;
    }

    .toolbar button:hover {
      background: #1a4a7a;
    }

    .toolbar button.primary {
      background: #ffd700;
      color: #1a1a2e;
    }

    .toolbar button.primary:hover {
      background: #ffed4a;
    }

    .canvas-container {
      flex: 1;
      position: relative;
    }

    #graphCanvas {
      width: 100%;
      height: 100%;
      display: block;
    }

    .controls-hint {
      position: absolute;
      bottom: 20px;
      left: 20px;
      background: rgba(0,0,0,0.7);
      padding: 10px 15px;
      border-radius: 6px;
      font-size: 12px;
      color: #888;
    }

    .controls-hint kbd {
      background: #333;
      padding: 2px 6px;
      border-radius: 3px;
      margin: 0 2px;
    }

    .modal {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0,0,0,0.8);
      justify-content: center;
      align-items: center;
      z-index: 1000;
    }

    .modal.active {
      display: flex;
    }

    .modal-content {
      background: #16213e;
      padding: 30px;
      border-radius: 12px;
      width: 450px;
      max-width: 90%;
    }

    .modal-title {
      font-size: 20px;
      color: #ffd700;
      margin-bottom: 20px;
    }

    .form-group {
      margin-bottom: 15px;
    }

    .form-group label {
      display: block;
      margin-bottom: 5px;
      font-size: 13px;
      color: #888;
    }

    .form-group input,
    .form-group select,
    .form-group textarea {
      width: 100%;
      padding: 10px;
      background: #1a1a2e;
      border: 1px solid #0f3460;
      border-radius: 6px;
      color: #fff;
      font-size: 14px;
    }

    .form-group input:focus,
    .form-group select:focus,
    .form-group textarea:focus {
      outline: none;
      border-color: #4a90d9;
    }

    .form-actions {
      display: flex;
      gap: 10px;
      justify-content: flex-end;
      margin-top: 20px;
    }

    .toast {
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: #27ae60;
      color: #fff;
      padding: 15px 20px;
      border-radius: 8px;
      display: none;
      z-index: 1001;
    }

    .toast.error {
      background: #e74c3c;
    }

    .toast.show {
      display: block;
      animation: slideIn 0.3s ease;
    }

    @keyframes slideIn {
      from {
        transform: translateX(100%);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="sidebar">
      <div class="sidebar-header">
        <h1>🔗 Nexus</h1>
        <p>Federated Knowledge Graph</p>
      </div>
      <div class="sidebar-content">
        <div class="stats">
          <div class="stat-card">
            <div class="stat-value" id="entityCount">0</div>
            <div class="stat-label">Entities</div>
          </div>
          <div class="stat-card">
            <div class="stat-value" id="relationCount">0</div>
            <div class="stat-label">Relations</div>
          </div>
        </div>

        <div class="section">
          <div class="section-title">Entities</div>
          <div class="entity-list" id="entityList">
            <!-- Populated by JS -->
          </div>
        </div>
      </div>
    </div>

    <div class="main-content">
      <div class="toolbar">
        <button class="primary" onclick="openModal('addEntity')">+ Add Entity</button>
        <button onclick="openModal('addRelation')">+ Add Relation</button>
        <button onclick="fitToView()">Fit to View</button>
        <button onclick="startLayout()">Auto Layout</button>
        <button onclick="exportGraph()">Export</button>
      </div>

      <div class="canvas-container">
        <canvas id="graphCanvas"></canvas>
        <div class="controls-hint">
          <kbd>Scroll</kbd> Zoom &nbsp;
          <kbd>Drag</kbd> Pan &nbsp;
          <kbd>Click</kbd> Select
        </div>
      </div>
    </div>
  </div>

  <!-- Add Entity Modal -->
  <div class="modal" id="addEntityModal">
    <div class="modal-content">
      <h2 class="modal-title">Add New Entity</h2>
      <form id="addEntityForm">
        <div class="form-group">
          <label>Label</label>
          <input type="text" name="label" required placeholder="Entity name">
        </div>
        <div class="form-group">
          <label>Type</label>
          <select name="type">
            <option value="concept">Concept</option>
            <option value="person">Person</option>
            <option value="organization">Organization</option>
            <option value="location">Location</option>
            <option value="event">Event</option>
            <option value="document">Document</option>
          </select>
        </div>
        <div class="form-group">
          <label>Properties (JSON)</label>
          <textarea name="properties" rows="3" placeholder='{"key": "value"}'></textarea>
        </div>
        <div class="form-group">
          <label>Tags (comma-separated)</label>
          <input type="text" name="tags" placeholder="tag1, tag2">
        </div>
        <div class="form-actions">
          <button type="button" onclick="closeModal('addEntity')">Cancel</button>
          <button type="submit" class="primary">Create</button>
        </div>
      </form>
    </div>
  </div>

  <!-- Add Relation Modal -->
  <div class="modal" id="addRelationModal">
    <div class="modal-content">
      <h2 class="modal-title">Add New Relation</h2>
      <form id="addRelationForm">
        <div class="form-group">
          <label>Source Entity</label>
          <select name="sourceId" id="sourceSelect"></select>
        </div>
        <div class="form-group">
          <label>Target Entity</label>
          <select name="targetId" id="targetSelect"></select>
        </div>
        <div class="form-group">
          <label>Relation Type</label>
          <select name="type">
            <option value="related_to">Related To</option>
            <option value="part_of">Part Of</option>
            <option value="owns">Owns</option>
            <option value="manages">Manages</option>
            <option value="created_by">Created By</option>
            <option value="located_in">Located In</option>
            <option value="depends_on">Depends On</option>
            <option value="implements">Implements</option>
          </select>
        </div>
        <div class="form-actions">
          <button type="button" onclick="closeModal('addRelation')">Cancel</button>
          <button type="submit" class="primary">Create</button>
        </div>
      </form>
    </div>
  </div>

  <div class="toast" id="toast"></div>

  <script>
    // State
    let entities = [];
    let relations = [];
    let selectedEntity = null;

    // API functions
    async function fetchGraph() {
      const res = await fetch('/api/visualize');
      return res.json();
    }

    async function fetchStats() {
      const res = await fetch('/api/stats');
      return res.json();
    }

    async function createEntity(data) {
      const res = await fetch('/api/entities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      return res.json();
    }

    async function createRelation(data) {
      const res = await fetch('/api/relations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      return res.json();
    }

    async function deleteEntity(id) {
      await fetch('/api/entities/' + id, { method: 'DELETE' });
    }

    // UI functions
    function showToast(message, isError = false) {
      const toast = document.getElementById('toast');
      toast.textContent = message;
      toast.className = 'toast' + (isError ? ' error' : '') + ' show';
      setTimeout(() => toast.className = 'toast', 3000);
    }

    function openModal(type) {
      document.getElementById(type + 'Modal').classList.add('active');
      if (type === 'addRelation') {
        populateEntitySelects();
      }
    }

    function closeModal(type) {
      document.getElementById(type + 'Modal').classList.remove('active');
    }

    function populateEntitySelects() {
      const selects = ['sourceSelect', 'targetSelect'];
      selects.forEach(id => {
        const select = document.getElementById(id);
        select.innerHTML = entities.map(e =>
          '<option value="' + e.id + '">' + e.label + ' (' + e.type + ')</option>'
        ).join('');
      });
    }

    // Canvas setup
    const canvas = document.getElementById('graphCanvas');
    let renderer = null;

    async function initCanvas() {
      const data = await fetchGraph();
      entities = data.entities;
      relations = data.relations;

      // Set canvas size
      const container = canvas.parentElement;
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;

      // Create temporary graph for rendering
      const graph = {
        id: 'temp',
        name: 'temp',
        entities: new Map(entities.map(e => [e.id, { ...e, embeddings: { dense: [] } }])),
        relations: new Map(relations.map(r => [r.id, { ...r, metadata: { bidirectional: false } }])),
        getEntity: (id) => graph.entities.get(id),
        getRelations: (id) => relations.filter(r => r.source === id || r.target === id)
      };

      // Initialize renderer
      renderer = new NexusGraphRenderer(canvas);
      renderer.setGraph(entities, relations);
      renderer.render();
    }

    // Simple graph renderer class
    class NexusGraphRenderer {
      constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.nodes = new Map();
        this.edges = [];
        this.camera = { x: 0, y: 0, zoom: 1 };
        this.selectedNode = null;
        this.setupEvents();
      }

      setGraph(entities, relations) {
        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;
        const radius = Math.min(this.canvas.width, this.canvas.height) / 3;

        entities.forEach((e, i) => {
          const angle = (2 * Math.PI * i) / entities.length;
          this.nodes.set(e.id, {
            ...e,
            x: centerX + Math.cos(angle) * radius,
            y: centerY + Math.sin(angle) * radius,
            vx: 0, vy: 0
          });
        });

        this.edges = relations;
        this.layout();
      }

      layout() {
        const damping = 0.9;
        const repulsion = 5000;
        const attraction = 0.01;

        for (let i = 0; i < 100; i++) {
          // Repulsion
          this.nodes.forEach((a, idA) => {
            this.nodes.forEach((b, idB) => {
              if (idA >= idB) return;
              const dx = b.x - a.x;
              const dy = b.y - a.y;
              const dist = Math.sqrt(dx*dx + dy*dy) || 1;
              const force = repulsion / (dist * dist);
              a.vx -= (dx/dist) * force;
              a.vy -= (dy/dist) * force;
              b.vx += (dx/dist) * force;
              b.vy += (dy/dist) * force;
            });
          });

          // Attraction
          this.edges.forEach(e => {
            const s = this.nodes.get(e.source);
            const t = this.nodes.get(e.target);
            if (!s || !t) return;
            const dx = t.x - s.x;
            const dy = t.y - s.y;
            const dist = Math.sqrt(dx*dx + dy*dy) || 1;
            const force = dist * attraction;
            s.vx += (dx/dist) * force;
            s.vy += (dy/dist) * force;
            t.vx -= (dx/dist) * force;
            t.vy -= (dy/dist) * force;
          });

          // Apply
          this.nodes.forEach(n => {
            n.vx *= damping; n.vy *= damping;
            n.x += n.vx; n.y += n.vy;
          });
        }
      }

      render() {
        const { ctx, canvas } = this;
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.save();
        ctx.translate(this.camera.x, this.camera.y);
        ctx.scale(this.camera.zoom, this.camera.zoom);

        // Draw edges
        ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        ctx.lineWidth = 1;
        this.edges.forEach(e => {
          const s = this.nodes.get(e.source);
          const t = this.nodes.get(e.target);
          if (!s || !t) return;
          ctx.beginPath();
          ctx.moveTo(s.x, s.y);
          ctx.lineTo(t.x, t.y);
          ctx.stroke();
        });

        // Draw nodes
        this.nodes.forEach((n, id) => {
          const isSelected = this.selectedNode === id;
          ctx.fillStyle = this.getNodeColor(n.type);
          ctx.beginPath();
          ctx.arc(n.x, n.y, 25, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = isSelected ? '#ffd700' : 'rgba(255,255,255,0.5)';
          ctx.lineWidth = isSelected ? 3 : 1;
          ctx.stroke();

          ctx.fillStyle = '#fff';
          ctx.font = '11px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(n.label.substring(0, 12), n.x, n.y + 40);
        });

        ctx.restore();
      }

      getNodeColor(type) {
        const colors = {
          concept: '#4a90d9',
          person: '#e74c3c',
          organization: '#9b59b6',
          location: '#27ae60',
          event: '#f39c12'
        };
        return colors[type] || '#95a5a6';
      }

      setupEvents() {
        let dragging = false;
        let startX, startY;

        this.canvas.addEventListener('mousedown', e => {
          const rect = this.canvas.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const y = e.clientY - rect.top;

          const node = this.findNode(x, y);
          if (node) {
            this.selectedNode = node;
            this.render();
          } else {
            dragging = true;
            startX = e.clientX;
            startY = e.clientY;
          }
        });

        this.canvas.addEventListener('mousemove', e => {
          if (dragging) {
            this.camera.x += e.clientX - startX;
            this.camera.y += e.clientY - startY;
            startX = e.clientX;
            startY = e.clientY;
            this.render();
          }
        });

        this.canvas.addEventListener('mouseup', () => dragging = false);

        this.canvas.addEventListener('wheel', e => {
          e.preventDefault();
          const zoom = e.deltaY > 0 ? 0.9 : 1.1;
          this.camera.zoom *= zoom;
          this.camera.zoom = Math.max(0.1, Math.min(5, this.camera.zoom));
          this.render();
        });
      }

      findNode(x, y) {
        for (const [id, n] of this.nodes) {
          const dx = (x - this.camera.x) / this.camera.zoom - n.x;
          const dy = (y - this.camera.y) / this.camera.zoom - n.y;
          if (Math.sqrt(dx*dx + dy*dy) < 30) return id;
        }
        return null;
      }
    }

    // Window resize handler
    window.addEventListener('resize', () => {
      const container = canvas.parentElement;
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
      if (renderer) renderer.render();
    });

    // Form handlers
    document.getElementById('addEntityForm').addEventListener('submit', async e => {
      e.preventDefault();
      const form = e.target;
      const data = {
        label: form.label.value,
        type: form.type.value,
        properties: JSON.parse(form.properties.value || '{}'),
        tags: form.tags.value.split(',').map(t => t.trim()).filter(Boolean)
      };
      try {
        await createEntity(data);
        showToast('Entity created successfully');
        closeModal('addEntity');
        location.reload();
      } catch (err) {
        showToast('Failed to create entity', true);
      }
    });

    document.getElementById('addRelationForm').addEventListener('submit', async e => {
      e.preventDefault();
      const form = e.target;
      const data = {
        sourceId: form.sourceId.value,
        targetId: form.targetId.value,
        type: form.type.value
      };
      try {
        await createRelation(data);
        showToast('Relation created successfully');
        closeModal('addRelation');
        location.reload();
      } catch (err) {
        showToast('Failed to create relation', true);
      }
    });

    // Toolbar functions
    function fitToView() {
      if (renderer) {
        renderer.camera = { x: 0, y: 0, zoom: 1 };
        renderer.render();
      }
    }

    function startLayout() {
      if (renderer) {
        renderer.layout();
        renderer.render();
      }
    }

    async function exportGraph() {
      const res = await fetch('/api/export');
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'nexus-graph.json';
      a.click();
      URL.revokeObjectURL(url);
    }

    // Init
    initCanvas().then(() => {
      // Update stats
      document.getElementById('entityCount').textContent = entities.length;
      document.getElementById('relationCount').textContent = relations.length;

      // Populate entity list
      const list = document.getElementById('entityList');
      list.innerHTML = entities.map(e => \`
        <div class="entity-item" onclick="selectEntity('\${e.id}')">
          <div class="entity-label">\${e.label}</div>
          <span class="type-badge type-\${e.type}">\${e.type}</span>
        </div>
      \`).join('');
    });

    function selectEntity(id) {
      document.querySelectorAll('.entity-item').forEach(el => el.classList.remove('selected'));
      event.currentTarget.classList.add('selected');
      if (renderer) {
        renderer.selectedNode = id;
        renderer.render();
      }
    }
  </script>
</body>
</html>`;
}

// Export for module usage
export { app };
