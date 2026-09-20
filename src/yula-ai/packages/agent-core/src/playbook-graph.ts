/**
 * @file playbook-graph.ts
 * Pure Directed Acyclic Graph (DAG) Engine for Procedural Workflows.
 * Provides cycle detection, topological sort, and step graph validation
 * for LLM procedural memory and executable workflow recipes.
 */

export type WorkflowStepType = 'action' | 'condition' | 'hitl' | 'subagent' | 'terminal';

export interface WorkflowNode {
  id: string;
  type: WorkflowStepType;
  label: string;
  action?: string;
  description?: string;
  metadata?: Record<string, unknown>;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  condition?: string;
  label?: string;
}

export interface WorkflowGraphData {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

export interface GraphValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Lightweight, zero-dependency Directed Acyclic Graph (DAG) container.
 */
export class PlaybookDAG {
  private nodes: Map<string, WorkflowNode> = new Map();
  private edges: Map<string, WorkflowEdge> = new Map();

  constructor(initialData?: WorkflowGraphData) {
    if (initialData) {
      for (const n of initialData.nodes || []) {
        this.addNode(n);
      }
      for (const e of initialData.edges || []) {
        this.addEdge(e);
      }
    }
  }

  addNode(node: WorkflowNode): this {
    this.nodes.set(node.id, { ...node });
    return this;
  }

  removeNode(id: string): boolean {
    if (!this.nodes.has(id)) return false;
    this.nodes.delete(id);
    for (const [edgeId, edge] of this.edges.entries()) {
      if (edge.source === id || edge.target === id) {
        this.edges.delete(edgeId);
      }
    }
    return true;
  }

  getNode(id: string): WorkflowNode | undefined {
    return this.nodes.get(id);
  }

  getAllNodes(): WorkflowNode[] {
    return Array.from(this.nodes.values());
  }

  addEdge(edge: WorkflowEdge): this {
    const id = edge.id || `e_${edge.source}_${edge.target}`;
    this.edges.set(id, { ...edge, id });
    return this;
  }

  removeEdge(id: string): boolean {
    return this.edges.delete(id);
  }

  getAllEdges(): WorkflowEdge[] {
    return Array.from(this.edges.values());
  }

  getInboundEdges(nodeId: string): WorkflowEdge[] {
    const res: WorkflowEdge[] = [];
    for (const edge of this.edges.values()) {
      if (edge.target === nodeId) res.push(edge);
    }
    return res;
  }

  getOutboundEdges(nodeId: string): WorkflowEdge[] {
    const res: WorkflowEdge[] = [];
    for (const edge of this.edges.values()) {
      if (edge.source === nodeId) res.push(edge);
    }
    return res;
  }

  getPredecessors(nodeId: string): WorkflowNode[] {
    const nodes: WorkflowNode[] = [];
    for (const edge of this.getInboundEdges(nodeId)) {
      const parent = this.nodes.get(edge.source);
      if (parent) nodes.push(parent);
    }
    return nodes;
  }

  getSuccessors(nodeId: string): WorkflowNode[] {
    const nodes: WorkflowNode[] = [];
    for (const edge of this.getOutboundEdges(nodeId)) {
      const child = this.nodes.get(edge.target);
      if (child) nodes.push(child);
    }
    return nodes;
  }

  /**
   * Detects cycles in the directed graph using 3-color DFS.
   */
  hasCycle(): boolean {
    const visited = new Map<string, number>(); // 0: unvisited, 1: visiting, 2: visited

    const visit = (nodeId: string): boolean => {
      visited.set(nodeId, 1);
      const outEdges = this.getOutboundEdges(nodeId);
      for (const edge of outEdges) {
        const state = visited.get(edge.target) || 0;
        if (state === 1) return true; // Found back-edge (cycle)
        if (state === 0 && visit(edge.target)) return true;
      }
      visited.set(nodeId, 2);
      return false;
    };

    for (const nodeId of this.nodes.keys()) {
      if ((visited.get(nodeId) || 0) === 0) {
        if (visit(nodeId)) return true;
      }
    }
    return false;
  }

  /**
   * Topological sorting using Kahn's in-degree algorithm.
   * Returns ordered list of nodes for deterministic step-by-step execution.
   */
  topologicalSort(): WorkflowNode[] {
    if (this.hasCycle()) {
      throw new Error('Cannot perform topological sort on a graph with cycles.');
    }

    const inDegree = new Map<string, number>();
    for (const nodeId of this.nodes.keys()) {
      inDegree.set(nodeId, 0);
    }
    for (const edge of this.edges.values()) {
      if (inDegree.has(edge.target)) {
        inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
      }
    }

    const queue: string[] = [];
    for (const [nodeId, deg] of inDegree.entries()) {
      if (deg === 0) queue.push(nodeId);
    }

    const result: WorkflowNode[] = [];
    while (queue.length > 0) {
      const currentId = queue.shift()!;
      const node = this.nodes.get(currentId);
      if (node) result.push(node);

      for (const edge of this.getOutboundEdges(currentId)) {
        const nextTarget = edge.target;
        const curDeg = inDegree.get(nextTarget);
        if (curDeg !== undefined) {
          const nextDeg = curDeg - 1;
          inDegree.set(nextTarget, nextDeg);
          if (nextDeg === 0) {
            queue.push(nextTarget);
          }
        }
      }
    }

    return result;
  }

  /**
   * Validates graph integrity against Karpathy procedural memory constraints.
   */
  validate(): GraphValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 1. Missing edge endpoint checks
    for (const edge of this.edges.values()) {
      if (!this.nodes.has(edge.source)) {
        errors.push(`Edge "${edge.id}" references missing source node: "${edge.source}".`);
      }
      if (!this.nodes.has(edge.target)) {
        errors.push(`Edge "${edge.id}" references missing target node: "${edge.target}".`);
      }
    }

    // 2. Cycle detection
    if (this.hasCycle()) {
      errors.push('Circular dependency detected in workflow graph.');
    }

    // 3. Isolated / Orphan node warnings
    if (this.nodes.size > 1) {
      for (const [id, node] of this.nodes.entries()) {
        const inDeg = this.getInboundEdges(id).length;
        const outDeg = this.getOutboundEdges(id).length;
        if (inDeg === 0 && outDeg === 0) {
          warnings.push(`Node "${node.label}" (${id}) is isolated and has no connections.`);
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  toJSON(): WorkflowGraphData {
    return {
      nodes: this.getAllNodes(),
      edges: this.getAllEdges(),
    };
  }

  static fromJSON(data: WorkflowGraphData): PlaybookDAG {
    return new PlaybookDAG(data);
  }

  /**
   * Parses human-readable Markdown steps or lists into a structured DAG.
   * Format example:
   * 1. [step_init] (action) Navigasyon -> navigate:/stock/stock-balance
   * 2. [step_form] (action) Kriterleri Seç (dependsOn: step_init) -> criteria_form:SET_FIELDS
   * 3. [step_approve] (hitl) Yönetici Onayı (dependsOn: step_form)
   */
  static fromMarkdownSteps(markdown: string): PlaybookDAG {
    const dag = new PlaybookDAG();
    const lines = markdown.split('\n');
    let prevNodeId: string | null = null;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      // Extract step pattern: (number. or -) [id] (type) Label (dependsOn: p1, p2) -> action: ...
      const stepMatch = trimmed.match(
        /^(?:\d+\.|\*|-)?\s*(?:\[([\w-]+)\])?\s*(?:\((action|condition|hitl|subagent|terminal)\))?\s*([^->(]+?)(?:\s*\((?:dependsOn|after):\s*([\w-,\s]+)\))?(?:\s*->\s*(.*))?$/i
      );

      if (stepMatch) {
        const rawId = stepMatch[1];
        const stepType = (stepMatch[2]?.toLowerCase() || 'action') as WorkflowStepType;
        const label = stepMatch[3]?.trim() || 'Step';
        const dependsOnRaw = stepMatch[4];
        const actionStr = stepMatch[5]?.trim();

        const id = rawId || `step_${dag.getAllNodes().length + 1}`;
        dag.addNode({
          id,
          type: stepType,
          label,
          action: actionStr,
        });

        if (dependsOnRaw) {
          const parents = dependsOnRaw.split(',').map((p) => p.trim()).filter(Boolean);
          for (const parent of parents) {
            dag.addEdge({
              id: `e_${parent}_${id}`,
              source: parent,
              target: id,
            });
          }
        } else if (prevNodeId && !rawId) {
          // If no explicit dependencies, connect sequentially
          dag.addEdge({
            id: `e_${prevNodeId}_${id}`,
            source: prevNodeId,
            target: id,
          });
        }
        prevNodeId = id;
      }
    }

    return dag;
  }

  /**
   * Serializes the DAG back to Markdown steps for storage and human review.
   */
  toMarkdownSteps(): string {
    const nodes = this.topologicalSort();
    const lines: string[] = [];

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const preds = this.getPredecessors(node.id).map((p) => p.id);
      const depStr = preds.length > 0 ? ` (dependsOn: ${preds.join(', ')})` : '';
      const actionStr = node.action ? ` -> ${node.action}` : '';
      lines.push(`${i + 1}. [${node.id}] (${node.type}) ${node.label}${depStr}${actionStr}`);
    }

    return lines.join('\n');
  }
}
