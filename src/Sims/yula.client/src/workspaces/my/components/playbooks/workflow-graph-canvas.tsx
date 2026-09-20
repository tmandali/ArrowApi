"use client";

import * as React from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  MarkerType,
  type Node,
  type Edge,
  type NodeProps,
  useNodesState,
  useEdgesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "@dagrejs/dagre";
import {
  PlaybookDAG,
  type WorkflowGraphData,
  type WorkflowNode,
  type WorkflowStepType,
  type PlaybookEntry,
} from "@my-agent/core";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Play,
  ShieldAlert,
  GitBranch,
  CheckCircle2,
  Cpu,
  RefreshCw,
  ListOrdered,
  Layers,
} from "lucide-react";

const NODE_WIDTH = 250;
const NODE_HEIGHT = 80;

interface WorkflowNodeData extends Record<string, unknown> {
  step: WorkflowNode;
  orderIndex?: number;
}

/**
 * Custom node renderer adhering to Shadcn UI styling.
 */
function StepNodeComponent({ data }: NodeProps<Node<WorkflowNodeData>>) {
  const step = data.step;
  const type = step.type;

  const typeConfig: Record<
    WorkflowStepType,
    { label: string; bg: string; border: string; text: string; icon: React.ReactNode }
  > = {
    action: {
      label: "Eylem",
      bg: "bg-blue-500/10 dark:bg-blue-500/20",
      border: "border-blue-500/40",
      text: "text-blue-600 dark:text-blue-400",
      icon: <Play className="size-3" />,
    },
    hitl: {
      label: "İnsan Onayı (HITL)",
      bg: "bg-fuchsia-500/10 dark:bg-fuchsia-500/20",
      border: "border-fuchsia-500/40",
      text: "text-fuchsia-600 dark:text-fuchsia-400",
      icon: <ShieldAlert className="size-3" />,
    },
    condition: {
      label: "Koşul / Dal",
      bg: "bg-amber-500/10 dark:bg-amber-500/20",
      border: "border-amber-500/40",
      text: "text-amber-600 dark:text-amber-400",
      icon: <GitBranch className="size-3" />,
    },
    subagent: {
      label: "Alt Ajan",
      bg: "bg-purple-500/10 dark:bg-purple-500/20",
      border: "border-purple-500/40",
      text: "text-purple-600 dark:text-purple-400",
      icon: <Cpu className="size-3" />,
    },
    terminal: {
      label: "Bitiş",
      bg: "bg-emerald-500/10 dark:bg-emerald-500/20",
      border: "border-emerald-500/40",
      text: "text-emerald-600 dark:text-emerald-400",
      icon: <CheckCircle2 className="size-3" />,
    },
  };

  const currentCfg = typeConfig[type] || typeConfig.action;

  return (
    <div
      className={`rounded-lg border bg-card p-3 shadow-sm transition-all hover:shadow-md ${currentCfg.border} w-[250px]`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!size-2 !bg-muted-foreground/60 !border-2 !border-background"
      />

      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-1.5">
          {data.orderIndex !== undefined && (
            <span className="flex size-4 items-center justify-center rounded-full bg-muted text-[9px] font-mono font-semibold text-muted-foreground">
              {data.orderIndex}
            </span>
          )}
          <span className="text-xs font-semibold text-foreground truncate max-w-[140px]">
            {step.label}
          </span>
        </div>

        <Badge
          variant="outline"
          className={`h-4 px-1 text-[9px] font-medium gap-1 shrink-0 ${currentCfg.bg} ${currentCfg.text} ${currentCfg.border}`}
        >
          {currentCfg.icon}
          {currentCfg.label}
        </Badge>
      </div>

      {step.action && (
        <div className="mt-1 font-mono text-[10px] text-muted-foreground bg-muted/40 px-1.5 py-0.5 rounded truncate border border-border/40">
          {step.action}
        </div>
      )}

      {step.description && (
        <p className="mt-1 text-[10.5px] text-muted-foreground line-clamp-2 leading-tight">
          {step.description}
        </p>
      )}

      <Handle
        type="source"
        position={Position.Bottom}
        className="!size-2 !bg-muted-foreground/60 !border-2 !border-background"
      />
    </div>
  );
}

const nodeTypes = {
  workflowStep: StepNodeComponent,
};

/**
 * Applies Dagre auto-layout to nodes and edges.
 */
function applyDagreLayout(
  nodes: Node<WorkflowNodeData>[],
  edges: Edge[],
  direction = "TB"
): { nodes: Node<WorkflowNodeData>[]; edges: Edge[] } {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({ rankdir: direction, nodesep: 50, ranksep: 60 });

  for (const node of nodes) {
    dagreGraph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }

  for (const edge of edges) {
    dagreGraph.setEdge(edge.source, edge.target);
  }

  dagre.layout(dagreGraph);

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    return {
      ...node,
      targetPosition: direction === "TB" ? Position.Top : Position.Left,
      sourcePosition: direction === "TB" ? Position.Bottom : Position.Right,
      position: {
        x: nodeWithPosition.x - NODE_WIDTH / 2,
        y: nodeWithPosition.y - NODE_HEIGHT / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
}

export interface WorkflowGraphCanvasProps {
  title?: string;
  recipe?: PlaybookEntry;
  graph?: WorkflowGraphData;
  contentMarkdown?: string;
  className?: string;
}

export function WorkflowGraphCanvas({
  title: passedTitle,
  recipe,
  graph: initialGraph,
  contentMarkdown,
  className = "",
}: WorkflowGraphCanvasProps) {
  const title = passedTitle || recipe?.title || "Workflow Graph";
  const effectiveGraph = initialGraph || recipe?.graph;
  const effectiveMarkdown = contentMarkdown || recipe?.contentMarkdown;
  const [showExecutionOrder, setShowExecutionOrder] = React.useState(false);

  // Compute graph either from passed prop or from markdown steps
  const activeDAG = React.useMemo(() => {
    if (effectiveGraph && effectiveGraph.nodes.length > 0) {
      return new PlaybookDAG(effectiveGraph);
    }
    if (effectiveMarkdown) {
      return PlaybookDAG.fromMarkdownSteps(effectiveMarkdown);
    }
    return new PlaybookDAG();
  }, [effectiveGraph, effectiveMarkdown]);

  // Compute topological order map
  const topologicalOrderMap = React.useMemo(() => {
    try {
      const sorted = activeDAG.topologicalSort();
      const map = new Map<string, number>();
      sorted.forEach((n, idx) => map.set(n.id, idx + 1));
      return map;
    } catch {
      return new Map<string, number>();
    }
  }, [activeDAG]);

  // Prepare initial nodes & edges
  const initialElements = React.useMemo(() => {
    const rawNodes = activeDAG.getAllNodes();
    const rawEdges = activeDAG.getAllEdges();

    const flowNodes: Node<WorkflowNodeData>[] = rawNodes.map((step) => ({
      id: step.id,
      type: "workflowStep",
      position: { x: 0, y: 0 },
      data: {
        step,
        orderIndex: showExecutionOrder ? topologicalOrderMap.get(step.id) : undefined,
      },
    }));

    const flowEdges: Edge[] = rawEdges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.condition || e.label,
      animated: true,
      style: { strokeWidth: 1.5, stroke: "var(--border)" },
      markerEnd: {
        type: MarkerType.ArrowClosed,
        width: 14,
        height: 14,
      },
    }));

    return applyDagreLayout(flowNodes, flowEdges, "TB");
  }, [activeDAG, showExecutionOrder, topologicalOrderMap]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialElements.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialElements.edges);

  // Synchronize when inputs change
  React.useEffect(() => {
    setNodes(initialElements.nodes);
    setEdges(initialElements.edges);
  }, [initialElements, setNodes, setEdges]);

  const handleRelayout = React.useCallback(() => {
    const relayouted = applyDagreLayout(nodes, edges, "TB");
    setNodes([...relayouted.nodes]);
  }, [nodes, edges, setNodes]);

  if (nodes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center rounded-lg border border-dashed border-border/80 bg-muted/10 h-[360px]">
        <Layers className="size-8 text-muted-foreground/40 mb-2" />
        <p className="text-xs font-medium text-foreground">Görsel Graf Verisi Bulunamadı</p>
        <p className="text-[11px] text-muted-foreground mt-1 max-w-sm">
          Bu tarif henüz ayrıştırılabilir adımlara sahip değil. Markdown içeriği kontrol ediniz.
        </p>
      </div>
    );
  }

  return (
    <div className={`relative flex flex-col w-full h-[460px] rounded-lg border border-border bg-card/40 overflow-hidden ${className}`}>
      {/* Top Bar Controls */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/60 bg-muted/30 z-10">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-foreground truncate max-w-[200px]">
            {title}
          </span>
          <Badge variant="secondary" className="h-4 px-1.5 text-[9.5px]">
            {nodes.length} Adım · {edges.length} Bağlantı
          </Badge>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            variant={showExecutionOrder ? "default" : "outline"}
            size="sm"
            className="h-6 px-2 text-[10px] gap-1 cursor-pointer"
            onClick={() => setShowExecutionOrder((prev) => !prev)}
          >
            <ListOrdered className="size-3" />
            İcra Sırası
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[10px] gap-1 text-muted-foreground hover:text-foreground cursor-pointer"
            onClick={handleRelayout}
          >
            <RefreshCw className="size-3" />
            Hizala
          </Button>
        </div>
      </div>

      {/* React Flow Viewport */}
      <div className="flex-1 w-full h-full min-h-0">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.2}
          maxZoom={1.5}
        >
          <Background color="var(--border)" gap={16} size={1} />
          <Controls showInteractive={false} className="!bg-card !border-border !rounded-md" />
          <MiniMap
            zoomable
            pannable
            className="!bg-card/80 !border !border-border !rounded-md !m-2"
            nodeColor="var(--muted-foreground)"
          />
        </ReactFlow>
      </div>
    </div>
  );
}
