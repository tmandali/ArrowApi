"use client";

/**
 * my-agent Pi köprüsü — yeni yapı (`@my-agent/react` `useAgentChat` /
 * `onToolCall` deseni) ile Yula adım-gösteriminin (`YulaWorkedAccordion` +
 * `yula-turn-trace`) bağlandığı tek nokta.
 *
 * - `piEventStream`'e bir kez abone olur; `tool_execution_start/end`
 *   olaylarını `upsertTurnTrace` satırlarına çevirir. Görünüm katmanı
 *   (`yula-worked-accordion`, faz gruplama, tooltip, JSON detay) aynen kalır.
 * - `dispatch_component_action` (standart tool) girdisini (`component_id` +
 *   `action`) mevcut Yula adım etiketlerine çözer; böylece yeni yapıdaki
 *   çağrılar eski Yula tool isimleriyle aynı satırları üretir.
 */

import { piEventStream, type AgentEvent } from "@my-agent/core";
import { getTurnTrace, upsertTurnTrace } from "@/lib/yula-turn-trace";
import type { WorkedStepItem } from "@/components/layout/yula-worked-steps";

export const PI_TRACE_ID_PREFIX = "pi:";

export function piTraceId(toolCallId: string): string {
  return `${PI_TRACE_ID_PREFIX}${toolCallId}`;
}

type DispatchInput = {
  component_id?: string;
  action?: string;
} & Record<string, unknown>;

/** `dispatch_component_action` girdisini mevcut adım diline çevirir. */
export function describeDispatchAction(input: unknown): {
  kind: WorkedStepItem["kind"];
  label: string;
  subLabel?: string;
} {
  const { component_id: comp = "", action = "" } = (input ?? {}) as DispatchInput;
  const [family] = comp.split(":");
  if (family === "criteria_form") {
    switch (action) {
      case "SET_FIELDS":
      case "APPLY":
        return { kind: "edited", label: "Applied criteria to form", subLabel: "Criteria updated" };
      case "SUBMIT":
      case "RUN":
        return { kind: "ran", label: `Ran Job: ${comp.slice("criteria_form:".length) || "Report"}`, subLabel: "Report execution" };
      case "VALIDATE":
        return { kind: "explored", label: "Validated criteria input", subLabel: "Schema check" };
      case "READ":
        return { kind: "explored", label: "Read current criteria draft", subLabel: "Form draft" };
      default:
        return { kind: "edited", label: `Criteria form: ${action || "update"}`, subLabel: comp };
    }
  }
  if (family === "result_grid") {
    switch (action) {
      case "QUERY":
        return { kind: "edited", label: "Updated grid view query", subLabel: "Refreshing grid view table..." };
      case "SORT":
        return { kind: "edited", label: "Sorted grid", subLabel: "Sorting" };
      case "FILTER":
        return { kind: "edited", label: "Filtered grid", subLabel: "Applying grid column filters..." };
      case "COLUMNS":
        return { kind: "edited", label: "Configured grid columns", subLabel: undefined };
      case "PIN":
        return { kind: "edited", label: "Pinned grid columns", subLabel: "Sticky" };
      case "RESET_LAYOUT":
        return { kind: "edited", label: "Reset grid layout", subLabel: "Default" };
      case "EXPORT":
        return { kind: "edited", label: "Exported grid", subLabel: "Exporting file…" };
      case "ANALYZE":
        return { kind: "explored", label: "Explored 1 table, RAG schema", subLabel: "Data profile" };
      case "PROFILE":
        return { kind: "explored", label: "Explored 1 table, RAG schema", subLabel: "Profiling table & analyzing RAG schema..." };
      case "RUN_SQL":
        return { kind: "ran", label: "Ran SQL: query", subLabel: "query" };
      case "VISUALIZE":
        return { kind: "ran", label: "Ran Chart: Visualization", subLabel: "Chart visualization" };
      default:
        return { kind: "ran", label: `Ran tool: ${action || "grid action"}`, subLabel: comp };
    }
  }
  if (family === "app_router" || comp === "app_router") {
    return { kind: "explored", label: "Navigated: Page navigation", subLabel: "Page opened" };
  }
  if (family === "job_history") {
    return { kind: "explored", label: `Job history: ${action || "query"}`, subLabel: undefined };
  }
  return { kind: "ran", label: `Ran tool: ${action || comp || "dispatch"}`, subLabel: comp || undefined };
}

/** Pi tool olayını trace satırına indirger (canlı bayrak korunur). */
function toolEventToTrace(event: AgentEvent): {
  id: string;
  label: string;
  subLabel?: string;
  input?: unknown;
  output?: unknown;
  isError?: boolean;
  isLive?: boolean;
  toolName?: string;
} | null {
  if (event.type === "tool_execution_start") {
    const resolved =
      event.toolName === "dispatch_component_action"
        ? describeDispatchAction(event.args)
        : {
            kind: "ran" as WorkedStepItem["kind"],
            label: `Ran tool: ${event.toolName}`,
            subLabel: "Executing operation...",
          };
    return {
      id: piTraceId(event.toolCallId),
      toolName: event.toolName,
      label: resolved.label,
      subLabel: resolved.subLabel,
      isLive: true,
      input: event.args,
    };
  }
  if (event.type === "tool_execution_end") {
    return {
      id: piTraceId(event.toolCallId),
      toolName: event.toolName,
      label: event.toolName, // upsert mevcut satırla birleşir; etiket aşağıda korunur
      isLive: false,
      isError: event.isError === true,
      output: event.result,
    };
  }
  return null;
}

let installed = false;

/**
 * Köprüyü kurar (idempotent). `getConversationId` her olayda aktif
 * konuşmayı verir (`chat-shared` döngüsünü lib'e sokmamak için callback).
 */
export function installPiTraceBridge(getConversationId: () => string): void {
  if (installed) return;
  installed = true;
  piEventStream.subscribe((event) => {
    try {
      const step = toolEventToTrace(event);
      if (!step) return;
      const conversationId = getConversationId();
      if (!conversationId) return;
      if (event.type === "tool_execution_end") {
        // Bitiş olayı: mevcut satırı çıktı/hata ile güncelle, etiket + girdi korunur.
        const prev = getTurnTrace(conversationId).find((s) => s.id === step.id);
        upsertTurnTrace(conversationId, {
          id: step.id,
          toolName: step.toolName,
          label: prev?.label || step.label,
          subLabel: prev?.subLabel,
          detailText: prev?.detailText,
          isLive: false,
          isError: step.isError,
          input: prev?.input,
          output: step.output,
        });
        return;
      }
      upsertTurnTrace(conversationId, {
        id: step.id,
        toolName: step.toolName,
        label: step.label,
        subLabel: step.subLabel,
        isLive: true,
        input: step.input,
      });
    } catch {
      // İzleme best-effort: sohbet akışını asla kırmaz.
    }
  });
}
