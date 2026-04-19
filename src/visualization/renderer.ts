/**
 * Visualization Renderer
 * Web-based graph visualization for Nexus
 */

import {
  NexusGraph,
  Entity,
  Relation,
  EntityType,
  RelationType,
} from '../core/types.js';

// ============================================================================
// Graph Renderer
// ============================================================================

/**
 * Canvas-based graph renderer
 */
export class GraphRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private graph: NexusGraph | null = null;
  private nodes: Map<string, RenderNode> = new Map();
  private camera: Camera = { x: 0, y: 0, zoom: 1 };
  private selectedNode: string | null = null;
  private hoveredNode: string | null = null;
  private dragging: boolean = false;
  private dragStart: { x: number; y: number } | null = null;
  private onNodeClick?: (entityId: string) => void;
  private onNodeHover?: (entityId: string | null) => void;

  // Layout
  private forceLayout: ForceLayout | null = null;
  private layoutRunning: boolean = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.setupEventListeners();
  }

  /**
   * Set the graph to render
   */
  setGraph(graph: NexusGraph): void {
    this.graph = graph;
    this.computeLayout();
  }

  /**
   * Set callback for node clicks
   */
  setOnNodeClick(callback: (entityId: string) => void): void {
    this.onNodeClick = callback;
  }

  /**
   * Set callback for node hover
   */
  setOnNodeHover(callback: (entityId: string | null) => void): void {
    this.onNodeHover = callback;
  }

  /**
   * Start force-directed layout
   */
  startLayout(): void {
    if (!this.graph || this.layoutRunning) return;
    this.layoutRunning = true;
    this.runLayout();
  }

  /**
   * Stop force-directed layout
   */
  stopLayout(): void {
    this.layoutRunning = false;
  }

  /**
   * Center the view
   */
  centerView(): void {
    this.camera = { x: this.canvas.width / 2, y: this.canvas.height / 2, zoom: 1 };
    this.render();
  }

  /**
   * Fit all nodes in view
   */
  fitToView(): void {
    if (this.nodes.size === 0) return;

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    for (const node of this.nodes.values()) {
      minX = Math.min(minX, node.x);
      maxX = Math.max(maxX, node.x);
      minY = Math.min(minY, node.y);
      maxY = Math.max(maxY, node.y);
    }

    const padding = 50;
    const graphWidth = maxX - minX + padding * 2;
    const graphHeight = maxY - minY + padding * 2;

    const scaleX = this.canvas.width / graphWidth;
    const scaleY = this.canvas.height / graphHeight;
    const scale = Math.min(scaleX, scaleY, 2);

    this.camera.zoom = scale;
    this.camera.x = this.canvas.width / 2 - (minX + (maxX - minX) / 2) * scale;
    this.camera.y = this.canvas.height / 2 - (minY + (maxY - minY) / 2) * scale;

    this.render();
  }

  /**
   * Render the graph
   */
  render(): void {
    const { ctx, canvas } = this;

    // Clear canvas
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (!this.graph) return;

    // Apply camera transform
    ctx.save();
    ctx.translate(this.camera.x, this.camera.y);
    ctx.scale(this.camera.zoom, this.camera.zoom);

    // Draw edges
    this.drawEdges();

    // Draw nodes
    this.drawNodes();

    ctx.restore();

    // Draw legend
    this.drawLegend();

    // Draw info panel
    if (this.selectedNode) {
      this.drawInfoPanel();
    }
  }

  private drawEdges(): void {
    const { ctx } = this;

    for (const relation of this.graph!.relations.values()) {
      const sourceNode = this.nodes.get(relation.sourceId);
      const targetNode = this.nodes.get(relation.targetId);

      if (!sourceNode || !targetNode) continue;

      const isHighlighted =
        this.selectedNode === relation.sourceId ||
        this.selectedNode === relation.targetId;

      ctx.strokeStyle = isHighlighted ? '#ffd700' : 'rgba(255,255,255,0.2)';
      ctx.lineWidth = isHighlighted ? 2 : 1;

      ctx.beginPath();
      ctx.moveTo(sourceNode.x, sourceNode.y);

      // Curved line for bidirectional
      if (relation.metadata.bidirectional) {
        const midX = (sourceNode.x + targetNode.x) / 2;
        const midY = (sourceNode.y + targetNode.y) / 2;
        const dx = targetNode.x - sourceNode.x;
        const dy = targetNode.y - sourceNode.y;
        const perpX = -dy * 0.1;
        const perpY = dx * 0.1;
        ctx.quadraticCurveTo(midX + perpX, midY + perpY, targetNode.x, targetNode.y);
      } else {
        ctx.lineTo(targetNode.x, targetNode.y);
      }

      ctx.stroke();

      // Draw arrow
      if (!relation.metadata.bidirectional) {
        this.drawArrow(sourceNode, targetNode, ctx);
      }
    }
  }

  private drawArrow(source: RenderNode, target: RenderNode, ctx: CanvasRenderingContext2D): void {
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const angle = Math.atan2(dy, dx);
    const targetRadius = this.getNodeRadius(target);

    const arrowX = target.x - Math.cos(angle) * (targetRadius + 5);
    const arrowY = target.y - Math.sin(angle) * (targetRadius + 5);

    ctx.save();
    ctx.translate(arrowX, arrowY);
    ctx.rotate(angle);

    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-8, -4);
    ctx.lineTo(-8, 4);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  private drawNodes(): void {
    const { ctx } = this;

    for (const [id, node] of this.nodes) {
      const isSelected = this.selectedNode === id;
      const isHovered = this.hoveredNode === id;
      const radius = this.getNodeRadius(node);

      // Node shadow
      if (isSelected || isHovered) {
        ctx.shadowColor = '#ffd700';
        ctx.shadowBlur = 20;
      }

      // Node fill
      ctx.fillStyle = this.getNodeColor(node.entity.type);
      ctx.beginPath();
      ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
      ctx.fill();

      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;

      // Node border
      ctx.strokeStyle = isSelected ? '#ffd700' : isHovered ? '#ffffff' : 'rgba(255,255,255,0.5)';
      ctx.lineWidth = isSelected || isHovered ? 3 : 1;
      ctx.stroke();

      // Label
      ctx.fillStyle = '#ffffff';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';

      const label = node.entity.label.length > 15
        ? node.entity.label.substring(0, 15) + '...'
        : node.entity.label;

      ctx.fillText(label, node.x, node.y + radius + 5);
    }
  }

  private drawLegend(): void {
    const { ctx, canvas } = this;
    const padding = 10;
    const x = canvas.width - 150 - padding;
    let y = padding;

    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(x - padding, y - padding, 150, 180);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText('Legend', x, y);
    y += 25;

    const types: EntityType[] = ['concept', 'person', 'organization', 'location', 'event'];

    for (const type of types) {
      ctx.fillStyle = this.getNodeColor(type);
      ctx.beginPath();
      ctx.arc(x + 10, y, 8, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(type, x + 25, y - 4);

      y += 25;
    }
  }

  private drawInfoPanel(): void {
    if (!this.selectedNode) return;

    const entity = this.graph!.getEntity(this.selectedNode);
    if (!entity) return;

    const { ctx, canvas } = this;
    const padding = 15;
    const x = padding;
    const y = padding;
    const width = 280;
    const height = 200;

    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.fillRect(x, y, width, height);

    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, width, height);

    // Title
    ctx.fillStyle = '#ffd700';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(entity.label, x + padding, y + 25);

    // Type
    ctx.fillStyle = '#ffffff';
    ctx.font = '12px sans-serif';
    ctx.fillText(`Type: ${entity.type}`, x + padding, y + 50);

    // ID
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '10px monospace';
    ctx.fillText(`ID: ${entity.id}`, x + padding, y + 70);

    // Properties
    ctx.fillStyle = '#ffffff';
    ctx.font = '11px sans-serif';
    let propY = y + 95;
    const props = Object.entries(entity.properties).slice(0, 4);

    for (const [key, value] of props) {
      const text = `${key}: ${String(value).substring(0, 25)}`;
      ctx.fillText(text, x + padding, propY);
      propY += 18;
    }

    // Relation count
    const relations = this.graph!.getRelations(entity.id);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText(`${relations.length} relations`, x + padding, propY + 10);

    // Close button hint
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '10px sans-serif';
    ctx.fillText('Click elsewhere to close', x + padding, y + height - 10);
  }

  private getNodeColor(type: EntityType): string {
    const colors: Record<EntityType, string> = {
      concept: '#4a90d9',
      person: '#e74c3c',
      organization: '#9b59b6',
      location: '#27ae60',
      event: '#f39c12',
      document: '#3498db',
      resource: '#95a5a6',
      custom: '#1abc9c',
    };
    return colors[type] || colors.custom;
  }

  private getNodeRadius(node: RenderNode): number {
    const baseRadius = 20;
    const relationCount = this.graph!.getRelations(node.entity.id).length;
    return baseRadius + Math.min(relationCount * 2, 15);
  }

  private computeLayout(): void {
    if (!this.graph) return;

    this.nodes.clear();

    const centerX = this.canvas.width / 2;
    const centerY = this.canvas.height / 2;
    const radius = Math.min(this.canvas.width, this.canvas.height) / 3;

    let angle = 0;
    const angleStep = (2 * Math.PI) / this.graph.entities.size;

    for (const entity of this.graph.entities.values()) {
      const x = centerX + Math.cos(angle) * radius;
      const y = centerY + Math.sin(angle) * radius;

      this.nodes.set(entity.id, {
        entity,
        x,
        y,
        vx: 0,
        vy: 0,
      });

      angle += angleStep;
    }

    this.forceLayout = new ForceLayout(this.nodes, this.graph.relations);
  }

  private runLayout(): void {
    if (!this.layoutRunning || !this.forceLayout) return;

    this.forceLayout.step();

    for (const node of this.nodes.values()) {
      node.x += node.vx;
      node.y += node.vy;

      // Keep nodes in bounds
      const padding = 50;
      node.x = Math.max(padding, Math.min(this.canvas.width - padding, node.x));
      node.y = Math.max(padding, Math.min(this.canvas.height - padding, node.y));
    }

    this.render();

    if (this.layoutRunning) {
      requestAnimationFrame(() => this.runLayout());
    }
  }

  private setupEventListeners(): void {
    this.canvas.addEventListener('mousedown', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      // Check if clicking on a node
      const clickedNode = this.findNodeAt(x, y);

      if (clickedNode) {
        this.selectedNode = clickedNode;
        if (this.onNodeClick) {
          this.onNodeClick(clickedNode);
        }
      } else {
        this.selectedNode = null;
        this.dragging = true;
        this.dragStart = { x: e.clientX, y: e.clientY };
      }

      this.render();
    });

    this.canvas.addEventListener('mousemove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      if (this.dragging && this.dragStart) {
        const dx = e.clientX - this.dragStart.x;
        const dy = e.clientY - this.dragStart.y;
        this.camera.x += dx;
        this.camera.y += dy;
        this.dragStart = { x: e.clientX, y: e.clientY };
        this.render();
      } else {
        const hoveredNode = this.findNodeAt(x, y);
        if (hoveredNode !== this.hoveredNode) {
          this.hoveredNode = hoveredNode;
          this.canvas.style.cursor = hoveredNode ? 'pointer' : 'grab';
          if (this.onNodeHover) {
            this.onNodeHover(hoveredNode);
          }
          this.render();
        }
      }
    });

    this.canvas.addEventListener('mouseup', () => {
      this.dragging = false;
      this.dragStart = null;
    });

    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();

      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
      const newZoom = this.camera.zoom * zoomFactor;

      if (newZoom >= 0.1 && newZoom <= 5) {
        this.camera.zoom = newZoom;
        this.render();
      }
    });
  }

  private findNodeAt(canvasX: number, canvasY: number): string | null {
    // Convert canvas coordinates to world coordinates
    const worldX = (canvasX - this.camera.x) / this.camera.zoom;
    const worldY = (canvasY - this.camera.y) / this.camera.zoom;

    for (const [id, node] of this.nodes) {
      const dx = worldX - node.x;
      const dy = worldY - node.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance <= this.getNodeRadius(node) + 5) {
        return id;
      }
    }

    return null;
  }
}

// ============================================================================
// Force Layout
// ============================================================================

interface RenderNode {
  entity: Entity;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

class ForceLayout {
  private nodes: Map<string, RenderNode>;
  private relations: Map<string, Relation>;
  private repulsion: number = 5000;
  private attraction: number = 0.01;
  private damping: number = 0.9;

  constructor(nodes: Map<string, RenderNode>, relations: Map<string, Relation>) {
    this.nodes = nodes;
    this.relations = relations;
  }

  step(): void {
    // Reset forces
    for (const node of this.nodes.values()) {
      node.vx = 0;
      node.vy = 0;
    }

    // Repulsion between all nodes
    const nodeArray = Array.from(this.nodes.values());
    for (let i = 0; i < nodeArray.length; i++) {
      for (let j = i + 1; j < nodeArray.length; j++) {
        this.applyRepulsion(nodeArray[i], nodeArray[j]);
      }
    }

    // Attraction along edges
    for (const relation of this.relations.values()) {
      const source = this.nodes.get(relation.sourceId);
      const target = this.nodes.get(relation.targetId);

      if (source && target) {
        this.applyAttraction(source, target);
      }
    }

    // Apply forces
    for (const node of this.nodes.values()) {
      node.vx *= this.damping;
      node.vy *= this.damping;
    }
  }

  private applyRepulsion(a: RenderNode, b: RenderNode): void {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const distance = Math.sqrt(dx * dx + dy * dy) || 1;

    const force = this.repulsion / (distance * distance);
    const fx = (dx / distance) * force;
    const fy = (dy / distance) * force;

    a.vx -= fx;
    a.vy -= fy;
    b.vx += fx;
    b.vy += fy;
  }

  private applyAttraction(a: RenderNode, b: RenderNode): void {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const distance = Math.sqrt(dx * dx + dy * dy) || 1;

    const force = distance * this.attraction;
    const fx = (dx / distance) * force;
    const fy = (dy / distance) * force;

    a.vx += fx;
    a.vy += fy;
    b.vx -= fx;
    b.vy -= fy;
  }
}

// ============================================================================
// Export
// ============================================================================

export { GraphRenderer };
