import type { AgentStepFrame } from "@my-agent/core";
import { useActiveDiagramStore } from "@/lib/stores/active-diagram-store";

/**
 * Sanitizes text to be safe inside Mermaid node labels.
 */
function cleanMermaidText(str: string): string {
  return str
    .replace(/["#\\]/g, "")
    .replace(/[[\]{}()]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Generates a clean, colored Mermaid flowchart (DAG)
 * from a sequence of AgentStepFrame items.
 */
export function generateDecisionTreeMermaid(
  steps: AgentStepFrame[],
  title?: string,
): string {
  if (!steps || steps.length === 0) {
    return `flowchart TD\n  Empty["Henüz karar ağacı adımı yok"]`;
  }

  const lines: string[] = [
    "flowchart TD",
    "  %% Class Styles",
    "  classDef success fill:#10b98115,stroke:#10b981,stroke-width:1.5px;",
    "  classDef error fill:#ef444415,stroke:#ef4444,stroke-width:1.5px;",
    "  classDef recovery fill:#f59e0b15,stroke:#f59e0b,stroke-width:1.5px;",
    "  classDef running fill:#3b82f615,stroke:#3b82f6,stroke-width:1.5px,stroke-dasharray: 5 5;",
    "",
    `  Start(["🚀 ${cleanMermaidText(title || "Ajan Karar Akışı")}"])`,
  ];

  const stepMap = new Map<string, AgentStepFrame>();
  for (const step of steps) {
    stepMap.set(step.id, step);
  }

  // Node declarations
  for (const step of steps) {
    const isError = step.isError || step.status === "error";
    const isRecovery = step.status === "recovered" || (step.transitionReason && step.transitionReason.includes("Kurtarma"));
    const isRunning = step.status === "running";
    const cssClass = isRunning
      ? "running"
      : isError
        ? "error"
        : isRecovery
          ? "recovery"
          : "success";

    const toolName = cleanMermaidText(step.actionTool || "Action");
    const rawThought = step.thought ? cleanMermaidText(step.thought) : "";
    const shortThought = rawThought.length > 45 ? `${rawThought.slice(0, 45)}…` : rawThought;

    let nodeContent = `<b>Adım ${step.stepIndex + 1}: ${toolName}</b>`;
    if (shortThought) {
      nodeContent += `<br/><i>💡 ${shortThought}</i>`;
    }
    if (isError && step.errorMessage) {
      const err = cleanMermaidText(step.errorMessage);
      const shortErr = err.length > 40 ? `${err.slice(0, 40)}…` : err;
      nodeContent += `<br/><b>❌ ${shortErr}</b>`;
    }

    const nodeId = `Step_${step.stepIndex + 1}`;
    lines.push(`  ${nodeId}["${nodeContent}"]:::${cssClass}`);
  }

  lines.push("");

  // Edge connections
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const nodeId = `Step_${step.stepIndex + 1}`;

    if (i === 0) {
      lines.push(`  Start --> ${nodeId}`);
      continue;
    }

    const parentStep = step.parentStepId ? stepMap.get(step.parentStepId) : steps[i - 1];
    const parentNodeId = parentStep ? `Step_${parentStep.stepIndex + 1}` : `Step_${steps[i - 1].stepIndex + 1}`;

    const prevHadError = parentStep?.isError || parentStep?.status === "error";
    if (prevHadError) {
      const errSummary = parentStep?.errorMessage ? cleanMermaidText(parentStep.errorMessage).slice(0, 25) : "Hata";
      lines.push(`  ${parentNodeId} -- "❌ ${errSummary} (Kurtarma)" --> ${nodeId}`);
    } else if (step.transitionReason) {
      const reason = cleanMermaidText(step.transitionReason).slice(0, 25);
      lines.push(`  ${parentNodeId} -- "${reason}" --> ${nodeId}`);
    } else {
      lines.push(`  ${parentNodeId} --> ${nodeId}`);
    }
  }

  return lines.join("\n");
}

/**
 * Opens the Decision Tree diagram directly in the MermaidCanvasPanel.
 */
export function openDecisionTreeDiagram(
  steps: AgentStepFrame[],
  title?: string,
): void {
  const chart = generateDecisionTreeMermaid(steps, title);
  useActiveDiagramStore.getState().openDiagram({
    id: `decision-tree-${Date.now()}`,
    title: title ? `Karar Ağacı: ${title}` : "Ajan Karar Ağacı",
    chart,
    diagramType: "flowchart",
  });
}
