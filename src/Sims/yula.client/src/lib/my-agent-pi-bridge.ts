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
import { extractToolErrorMessage } from "@/lib/yula-tool-info";
import { isJobFamily, parseComponentId } from "./client-tools/dispatch-types";

export const PI_TRACE_ID_PREFIX = "pi:";

export function piTraceId(toolCallId: string): string {
  return `${PI_TRACE_ID_PREFIX}${toolCallId}`;
}

type DispatchInput = {
  component_id?: string;
  action?: string;
  payload?: Record<string, unknown>;
} & Record<string, unknown>;

/** `dispatch_component_action` girdisini mevcut adım diline çevirir. */
export function describeDispatchAction(input: unknown): {
  kind: WorkedStepItem["kind"];
  label: string;
  subLabel?: string;
} {
  const inp = (input ?? {}) as DispatchInput;
  const comp = inp.component_id ?? "";
  const action = inp.action ?? "";
  const payload = (inp.payload && typeof inp.payload === "object" ? inp.payload : inp) as Record<string, unknown>;
  const { family, subId } = parseComponentId(comp);
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
      case "QUERY": {
        const title = typeof payload.title === "string" ? payload.title : "";
        const rawSql = typeof payload.sql === "string" ? payload.sql : "";
        const shortSql = rawSql.replace(/\s+/g, " ").trim().slice(0, 35);
        return {
          kind: "edited",
          label: title ? `Updated grid query: ${title}` : (shortSql ? `Grid query: ${shortSql}…` : "Updated grid view query"),
          subLabel: "Refreshing grid view table...",
        };
      }
      case "SORT": {
        const col = typeof payload.column === "string" ? payload.column : "";
        const dir = typeof payload.direction === "string" ? payload.direction : "asc";
        return {
          kind: "edited",
          label: col ? `Sorted grid: ${col} (${dir})` : "Sorted grid",
          subLabel: dir,
        };
      }
      case "FILTER": {
        const field = typeof payload.field === "string" ? payload.field : "";
        const val = typeof payload.value === "string" ? payload.value : "";
        return {
          kind: "edited",
          label: field ? `Filtered: ${field}${val ? ` = ${val}` : ""}` : "Filtered grid",
          subLabel: "Applying grid column filters...",
        };
      }
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
      case "RUN_SQL": {
        const rawSql =
          typeof payload.query === "string"
            ? payload.query
            : typeof payload.sql === "string"
              ? payload.sql
              : "";
        const cleanSql = rawSql.replace(/\s+/g, " ").trim();
        const shortSql = cleanSql.length > 40 ? `${cleanSql.slice(0, 40)}…` : cleanSql;
        return {
          kind: "ran",
          label: shortSql ? `Ran SQL: ${shortSql}` : "Ran SQL: query",
          subLabel: shortSql || "query",
        };
      }
      case "VISUALIZE":
        return { kind: "ran", label: "Ran Chart: Visualization", subLabel: "Chart visualization" };
      default:
        return { kind: "ran", label: `Ran tool: ${action || "grid action"}`, subLabel: comp };
    }
  }
  if (family === "app_router" || comp === "app_router") {
    return { kind: "explored", label: "Navigated: Page navigation", subLabel: "Page opened" };
  }
  if (isJobFamily(family) || isJobFamily(comp)) {
    if (action === "CANCEL") {
      return { kind: "ran", label: "Cancelled job", subLabel: subId ? `Job ${subId}` : "Arrow Job" };
    }
    const jobLabel = family === "arrow_job" ? "Job execution" : "Job history";
    return { kind: "explored", label: `${jobLabel}: ${action || "query"}`, subLabel: subId };
  }
  if (family === "plugin") {
    const pluginName = comp.slice("plugin:".length) || action || "plugin";
    return { kind: "ran", label: `Ran Plugin: ${pluginName}`, subLabel: action };
  }
  return { kind: "ran", label: `Ran tool: ${action || comp || "dispatch"}`, subLabel: comp || undefined };
}

/** Pi tool olayını trace satırına indirger (canlı bayrak korunur). */
function toolEventToTrace(event: AgentEvent): {
  id: string;
  label: string;
  subLabel?: string;
  detailText?: string;
  input?: unknown;
  output?: unknown;
  isError?: boolean;
  isLive?: boolean;
  toolName?: string;
} | null {
  if (event.type === "tool_execution_start") {
    let resolved: { kind?: WorkedStepItem["kind"]; label: string; subLabel?: string };
    if (event.toolName === "dispatch_component_action") {
      resolved = describeDispatchAction(event.args);
    } else if (event.toolName === "ask_user_choice") {
      resolved = {
        kind: "confirmation" as WorkedStepItem["kind"],
        label: typeof event.args?.question === "string" ? `Asked: ${event.args.question}` : "Asked user choice",
        subLabel: "Waiting for user selection...",
      };
    } else if (event.toolName === "query_playbook") {
      const task = typeof event.args?.task === "string" ? event.args.task : "Rules & workflows";
      const ws = typeof event.args?.workspace === "string" ? event.args.workspace : "stock";
      resolved = {
        kind: "explored" as WorkedStepItem["kind"],
        label: `🤖 Playbook Sub-Agent · Queried Workspace Wiki (${ws}): "${task}"`,
        subLabel: `🤖 Sub-Agent analiz ediyor · Searching Workspace Wiki (${ws})...`,
      };
    } else if (event.toolName === "propose_playbook_update") {
      const title = typeof event.args?.title === "string" ? event.args.title : "Learned Rule";
      const ws = typeof event.args?.workspace === "string" ? event.args.workspace : "stock";
      resolved = {
        kind: "edited" as WorkedStepItem["kind"],
        label: `Updated Workspace Wiki (${ws}): ${title}`,
        subLabel: "Recording to Workspace Wiki...",
      };
    } else {
      resolved = {
        kind: "ran" as WorkedStepItem["kind"],
        label: `Ran tool: ${event.toolName}`,
        subLabel: "Executing operation...",
      };
    }
    const isInteractive =
      event.toolName === "ask_user_choice" ||
      event.toolName === "ask_user_question" ||
      event.toolName === "request_user_confirmation" ||
      event.toolName === "suggest_next_steps";
    return {
      id: piTraceId(event.toolCallId),
      toolName: event.toolName,
      label: resolved.label,
      subLabel: resolved.subLabel,
      isLive: isInteractive ? false : true,
      input: event.args,
    };
  }
  if (event.type === "tool_execution_end") {
    const optionsCount = Array.isArray(event.result?.options) ? event.result.options.length : 0;
    let endSubLabel: string | undefined = undefined;
    let endLabel: string | undefined = undefined;
    let endDetail: string | undefined = undefined;

    if (event.toolName === "ask_user_choice") {
      endSubLabel = optionsCount > 0 ? `${optionsCount} options presented` : "User choice ready";
    } else if (event.toolName === "query_playbook") {
      const res = event.result as any;
      const ws = typeof event.args?.workspace === "string" ? event.args.workspace : "stock";
      const task = typeof event.args?.task === "string" ? event.args.task : "Rules & workflows";
      const rulesFound = Array.isArray(res?.screenRules) ? res.screenRules.length : 0;
      const hasRecipe = Boolean(res?.recipe);
      const confPct = typeof res?.confidence === "number" ? Math.round(res.confidence * 100) : 100;
      endLabel = `🤖 Playbook Sub-Agent · Queried Workspace Wiki (${ws}): "${task}"`;
      if (hasRecipe) {
        endSubLabel = `Workflow recipe found: ${res.recipe.title} (%${confPct} uyum · Sub-Agent verified)`;
        endDetail = `🤖 Playbook Sub-Agent Doğrulaması (%${confPct} Güven):\n${res.recipe.title}\n\n${res.recipe.contentMarkdown || ""}${res.message ? `\n\nNot: ${res.message}` : ""}`;
      } else if (rulesFound > 0) {
        endSubLabel = `${rulesFound} rules found in Workspace Wiki (${ws}) · Sub-Agent verified`;
        endDetail = `🤖 Playbook Sub-Agent Kuralları (${ws}):\n` + res.screenRules.map((r: string) => `• ${r}`).join("\n");
      } else {
        endSubLabel = `Searched Workspace Wiki (${ws}) · Sub-Agent: Kayıtlı reçete yok`;
        endDetail = `Playbook fihristi tarandı (${ws}). Tanımlı kurumsal reçete bulunamadı; genel sistem politikaları devrede.`;
      }
    } else if (event.toolName === "propose_playbook_update") {
      const res = event.result as any;
      const ws = typeof event.args?.workspace === "string" ? event.args.workspace : "stock";
      const title = typeof event.args?.title === "string" ? event.args.title : "Learned Rule";
      const cat = typeof event.args?.category === "string" ? event.args.category : "screen_rule";
      const catLabel = cat === "screen_rule" ? "Screen Rule" : "Workflow Recipe";
      const isSaved = res?.status === "saved";
      endLabel = `Updated Workspace Wiki (${ws}): ${title}`;
      endSubLabel = isSaved ? `Saved to Workspace Wiki (${ws}) · ${catLabel}` : `Proposed ${catLabel}`;
    }

    const detectedError = extractToolErrorMessage(event.result);
    const isError = event.isError === true || Boolean(detectedError);

    return {
      id: piTraceId(event.toolCallId),
      toolName: event.toolName,
      label: endLabel ?? event.toolName,
      subLabel: detectedError ? `Hata: ${detectedError}` : endSubLabel,
      detailText: detectedError || endDetail,
      isLive: false,
      isError,
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
        const resolvedLabel =
          step.label && step.label !== step.toolName ? step.label : (prev?.label || step.label);
        upsertTurnTrace(conversationId, {
          id: step.id,
          toolName: step.toolName,
          label: resolvedLabel,
          subLabel: step.subLabel ?? prev?.subLabel,
          detailText: step.detailText ?? prev?.detailText,
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
        isLive: Boolean(step.isLive),
        input: step.input,
      });
    } catch {
      // İzleme best-effort: sohbet akışını asla kırmaz.
    }
  });
}
