"use client";

import {
  yulaToolPartInfo,
  isFailedToolInfo,
  isDedupeSkipOutput,
  type YulaToolPartInfo,
} from "@/lib/yula-tool-info";
import type { useTranslations } from "next-intl";
import type { YulaMessage } from "@/app/api/agent/chat/route";
import { sanitizeAssistantText } from "@/lib/sanitize-assistant-text";
import { resolveYulaSlashCommand } from "@/components/layout/yula-commands";
import { getTurnTrace } from "@/lib/yula-turn-trace";
import type { TurnTraceStep } from "@/lib/yula-turn-trace";

/** Modül-seviyesi adım üreticileri hook kullanamadığından, bileşen tarafı
 * `useTranslations("WorkedSteps")`'ı buraya taşır. */
export type WorkedStepsT = ReturnType<typeof useTranslations>;

export interface WorkedStepItem {
  id: string;
  kind: "explored" | "edited" | "thought" | "ran" | "confirmation";
  label: string;
  subLabel?: string;
  diffBadge?: { added: number; removed: number };
  durationSec?: number;
  isLive?: boolean;
  isError?: boolean;
  detailText?: string;
  info?: YulaToolPartInfo;
  /** Ait olduğu LLM adımının sırası (step-start sayacı) — Worked görünümünde girinti */
  stepIndex?: number;
}

export interface WorkedStepPhase {
  phaseIndex: number;
  label: string;
  steps: WorkedStepItem[];
  hasError: boolean;
  isLive: boolean;
}

const PHASE_LABEL_BY_KIND: Record<WorkedStepItem["kind"], string> = {
  explored: "Exploration",
  edited: "Updates",
  ran: "Execution",
  confirmation: "Confirmation",
  thought: "Thinking",
};

/** Düz adım listesini stepIndex (step-start sınırı) bazında fazlara böler.
 *  Faz etiketi, fazdaki ilk düşünce-dışı adımın türünden türetilir (İngilizce). */
export function groupStepsByPhase(steps: WorkedStepItem[]): WorkedStepPhase[] {
  const buckets = new Map<number, WorkedStepItem[]>();
  for (const step of steps) {
    const key = step.stepIndex ?? 0;
    const list = buckets.get(key);
    if (list) list.push(step);
    else buckets.set(key, [step]);
  }
  return [...buckets.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([phaseIndex, phaseSteps]) => {
      const anchor = phaseSteps.find((s) => s.kind !== "thought") ?? phaseSteps[0];
      return {
        phaseIndex,
        label: anchor ? PHASE_LABEL_BY_KIND[anchor.kind] : "Thinking",
        steps: phaseSteps,
        hasError: phaseSteps.some((s) => s.isError),
        isLive: phaseSteps.some((s) => s.isLive),
      };
    });
}

function traceToWorkedStep(step: TurnTraceStep): WorkedStepItem {
  const pending = Boolean(step.isLive);
  return {
    id: step.id,
    kind: step.isError ? "ran" : "explored",
    label: step.label,
    subLabel: step.subLabel,
    detailText: step.detailText,
    isLive: pending,
    isError: step.isError,
    info: {
      toolCallId: step.id,
      toolName: step.toolName ?? "worker",
      state: pending
        ? "input-available"
        : step.isError
          ? "output-error"
          : "output-available",
      input: step.input,
      output: step.output,
      errorText: step.isError ? step.detailText : undefined,
    },
  };
}

/** Statik ve dinamik parçalardan işlem, düşünme ve gizlenen worker adımlarını çıkarır */
export function extractWorkedSteps(
  message?: YulaMessage,
  isLiveStreaming?: boolean,
  userMessage?: YulaMessage,
  conversationId?: string,
  t?: WorkedStepsT,
): WorkedStepItem[] {
  const steps: WorkedStepItem[] = [];
  const L = (key: Parameters<WorkedStepsT>[0], values?: Parameters<WorkedStepsT>[1]) =>
    t ? t(key, values) : "";

  if (conversationId) {
    // Tüm aşama izleri görünür: İstek alındı, Phase, RAG, Araç seti, HTTP, hatalar
    for (const trace of getTurnTrace(conversationId)) {
      steps.push(traceToWorkedStep(trace));
    }
  }

  const userText = userMessage?.parts
    ?.filter((p) => p.type === "text")
    ?.map((p) => (p as { text: string }).text)
    ?.join("\n")
    ?.trim();

  const matchedCmd = userText ? resolveYulaSlashCommand(userText) : null;
  if (matchedCmd) {
    const cmdName = `/${matchedCmd.slash}`;
    steps.push({
      id: `${message?.id ?? "cmd"}-command-execution`,
      kind: "explored",
      label: `Command: ${cmdName}`,
      subLabel: isLiveStreaming ? `Executing ${cmdName} command workflow...` : "Command execution workflow",
      isLive: isLiveStreaming && !message?.parts.some((p) => p.type !== "text"),
      info: {
        toolCallId: `${message?.id ?? "cmd"}-command`,
        toolName: "slash_command",
        state: "output-available",
        input: { command: cmdName, prompt: userText },
        output: { status: "ok", message: L("cmd_executed", { cmd: cmdName, label: matchedCmd.label }) },
      },
    });
  }

  if (!message) {
    if (isLiveStreaming && steps.length === 0) {
      steps.push({
        id: "live-initial-planning",
        kind: "thought",
        label: "Thinking & reasoning...",
        subLabel: L("planning_sub"),
        detailText: L("planning_detail"),
        isLive: true,
      });
    }
    return steps;
  }

  // step-start işaretine göre güncel LLM adımı; parçalar bu adıma bağlanır
  let currentStep = -1;

  const pushStep = (s: WorkedStepItem) =>
    steps.push({ ...s, stepIndex: currentStep < 0 ? 0 : currentStep });

  message.parts.forEach((part, index) => {
    if (part.type === "reasoning") {
      const raw = part.text ?? "";
      // Boş reasoning part'ı gürültü adımı üretmez (bazı sağlayıcılar
      // düşünce metni olmadan reasoning çerçevesi akıtır).
      if (!raw.trim()) return;
      const text = sanitizeAssistantText(raw);
      const meta = (part as { meta?: string }).meta;
      const isThinking = !meta || meta === "thinking";
      const approxDuration = Math.max(1, Math.round((text || raw).length / 60));

      pushStep({
        id: `${message.id}-reasoning-${index}`,
        kind: "thought",
        label: isThinking
          ? isLiveStreaming
            ? "Thinking & reasoning..."
            : text.trim()
              ? `Thought for ${approxDuration}s`
              : "Thought (empty / hidden)"
          : `Reasoning (${meta})`,
        subLabel: `${approxDuration}s`,
        durationSec: approxDuration,
        detailText: text || raw || L("thought_no_text"),
        isLive: isLiveStreaming,
        isError: !text.trim() && Boolean(raw.trim()),
      });
      return;
    }

    if (part.type === "text") {
      const raw = (part as { text?: string }).text ?? "";
      // Salt-boşluk metin (araç çağrıları arası model formatlaması) satır
      // üretmez — normal akış gürültüsüdür. Yalnız sanitizer'ın GERÇEK
      // içeriği yediği durum raporlanır (sızıntı/çöp sinyali).
      if (!raw.trim()) return;
      const text = sanitizeAssistantText(raw);
      if (text.trim()) return;
      pushStep({
        id: `${message.id}-text-hidden-${index}`,
        kind: "thought",
        label: raw.trim() ? L("model_text_hidden") : L("model_text_empty"),
        subLabel: isLiveStreaming ? "Streaming..." : "no visible bubble",
        detailText: raw.slice(0, 2000) || L("part_text_empty"),
        isLive: isLiveStreaming,
        isError: Boolean(raw.trim()),
        info: {
          toolCallId: `${message.id}-text-hidden-${index}`,
          toolName: "model_text",
          state: "output-available",
          input: { chars: raw.length },
          output: { sanitizedEmpty: true, preview: raw.slice(0, 400) },
        },
      });
      return;
    }

    if (part.type === "step-start") {
      // step-start bir satır değil, adım sınırıdır: sonraki parçalar
      // yeni adıma girintili bağlanır
      currentStep += 1;
      return;
    }

    const info = yulaToolPartInfo(part);
    if (!info) {
      pushStep({
        id: `${message.id}-part-${index}`,
        kind: "explored",
        label: `Part: ${part.type ?? "unknown"}`,
        subLabel: isLiveStreaming ? "Incoming part..." : "unparsed",
        isLive: isLiveStreaming,
        info: {
          toolCallId: `${message.id}-part-${index}`,
          toolName: String(part.type ?? "unknown_part"),
          state: "output-available",
          input: part,
          output: null,
        },
      });
      return;
    }

    const isError = isFailedToolInfo(info);
    const isPending = info.state !== "output-available" && info.state !== "output-error";

    const inputObj =
      typeof info.input === "object" && info.input !== null
        ? (info.input as Record<string, unknown>)
        : {};

    switch (info.toolName) {
      case "get_report_schema": {
        pushStep({
          id: info.toolCallId,
          kind: "explored",
          label: "Explored report criteria & JSON schema",
          subLabel: isPending ? "Fetching report schema & criteria..." : "Schema prep",
          isLive: isPending,
          isError,
          info,
        });
        break;
      }
      case "profile_grid_table":
      case "analyze_grid_data": {
        pushStep({
          id: info.toolCallId,
          kind: "explored",
          label: "Explored 1 table, RAG schema",
          subLabel: isPending
            ? "Profiling table & analyzing RAG schema..."
            : typeof inputObj.operation === "string"
            ? inputObj.operation
            : "Data profile",
          isLive: isPending,
          isError,
          info,
        });
        break;
      }
      case "run_expert_sql": {
        const sql = typeof inputObj.sql === "string" ? inputObj.sql.replace(/\s+/g, " ").trim() : "";
        const shortSql = sql.length > 40 ? `${sql.slice(0, 40)}…` : sql;
        pushStep({
          id: info.toolCallId,
          kind: "ran",
          label: `Ran SQL: ${shortSql || "query"}`,
          subLabel: isPending ? "Executing SQL query..." : "query",
          isLive: isPending,
          isError,
          info,
        });
        break;
      }
      case "filter_current_grid": {
        const field = typeof inputObj.field === "string" ? inputObj.field : "";
        const val = typeof inputObj.value === "string" ? inputObj.value.trim() : "";
        const op = typeof inputObj.op === "string" ? inputObj.op : "";
        const isReset = field === "*" || inputObj.reset === true;

        let displayExpr = "";
        if (!isReset) {
          if (op === "empty") {
            displayExpr = L("filter_empty_values", { field });
          } else if (op === "notEmpty") {
            displayExpr = L("filter_filled_values", { field });
          } else if (op === "gt" || val.startsWith(">")) {
            const cleanVal = val.replace(/^>/, "").trim();
            displayExpr = `${field} > ${cleanVal}`;
          } else if (op === "lt" || val.startsWith("<")) {
            const cleanVal = val.replace(/^</, "").trim();
            displayExpr = `${field} < ${cleanVal}`;
          } else if (op === "contains") {
            displayExpr = `${field} ~ ${val}`;
          } else if (val) {
            displayExpr = `${field}${/^[<>=!]/.test(val) ? ` ${val}` : ` = ${val}`}`;
          } else {
            displayExpr = field;
          }
        }

        pushStep({
          id: info.toolCallId,
          kind: "edited",
          label: isReset ? "Cleared grid filters" : `Filtered ${displayExpr}`,
          subLabel: isPending
            ? "Applying grid column filters..."
            : isReset
            ? "Reset filters"
            : val || undefined,
          isLive: isPending,
          isError,
          info,
        });
        break;
      }
      case "set_grid_sort": {
        const col = typeof inputObj.column === "string" ? inputObj.column : "";
        const dir = typeof inputObj.direction === "string" ? inputObj.direction : "asc";
        const dirText = dir === "none" ? L("sort_natural") : dir === "asc" ? L("sort_asc") : L("sort_desc");
        pushStep({
          id: info.toolCallId,
          kind: "edited",
          label: dir === "none" ? L("sort_removed", { col }) : L("sort_applied", { col, dir: dirText }),
          subLabel: isPending ? L("sorting") : dirText,
          isLive: isPending,
          isError,
          info,
        });
        break;
      }
      case "configure_grid_columns": {
        const visible = Array.isArray(inputObj.visibleColumns) ? inputObj.visibleColumns : null;
        const hidden = Array.isArray(inputObj.hiddenColumns) ? inputObj.hiddenColumns : null;
        let label = L("cols_edited");
        if (visible) label = L("cols_shown", { count: visible.length });
        else if (hidden) label = L("cols_hidden", { count: hidden.length });
        pushStep({
          id: info.toolCallId,
          kind: "edited",
          label,
          subLabel: isPending ? L("cols_setting") : undefined,
          isLive: isPending,
          isError,
          info,
        });
        break;
      }
      case "pin_grid_columns": {
        const cols = Array.isArray(inputObj.columns) ? inputObj.columns : [];
        pushStep({
          id: info.toolCallId,
          kind: "edited",
          label: L("cols_pinned", { cols: cols.join(", ") }),
          subLabel: isPending ? L("cols_pinning") : "Sticky",
          isLive: isPending,
          isError,
          info,
        });
        break;
      }
      case "apply_grid_filters": {
        const filters = (inputObj.filters ?? {}) as Record<string, string>;
        const count = Object.keys(filters).length;
        pushStep({
          id: info.toolCallId,
          kind: "edited",
          label: L("filters_applied", { count }),
          subLabel: isPending
            ? L("filters_applying")
            : Object.entries(filters)
                .map(([k, v]) => `${k}:${v}`)
                .join(", "),
          isLive: isPending,
          isError,
          info,
        });
        break;
      }
      case "reset_grid_layout": {
        pushStep({
          id: info.toolCallId,
          kind: "edited",
          label: L("grid_reset"),
          subLabel: isPending ? L("grid_resetting") : L("default"),
          isLive: isPending,
          isError,
          info,
        });
        break;
      }
      case "export_grid_data": {
        const fmt = String(inputObj.format ?? "xlsx").toUpperCase();
        pushStep({
          id: info.toolCallId,
          kind: "edited",
          label: L("exported", { fmt }),
          subLabel: isPending ? L("exporting") : L("exported_fmt", { fmt }),
          isLive: isPending,
          isError,
          info,
        });
        break;
      }
      case "set_grid_query": {
        const title = typeof inputObj.title === "string" ? inputObj.title.trim() : "";
        const sql = typeof inputObj.sql === "string" ? inputObj.sql.replace(/\s+/g, " ").trim() : "";
        const hasSql = Boolean(sql);
        const isReset = inputObj.reset === true && !hasSql;

        if (hasSql) {
          // LLM Tarafında SQL Otomatik Düzeltme & Şema Eşleme Adımı (Canlı yükleme spinner'ı destekli)
          pushStep({
            id: `${info.toolCallId}-autocorrect`,
            kind: "explored",
            label: "Auto-corrected SQL query & grounded schema",
            subLabel: isPending
              ? "Correcting SQL & expanding dates..."
              : "Column mapping & relative date expansion",
            isLive: isPending,
            isError: false,
            info: {
              toolCallId: `${info.toolCallId}-autocorrect`,
              toolName: "sql_autocorrect",
              state: isPending ? "input-available" : "output-available",
              input: {
                note: L("sql_note"),
              },
              output: {
                status: "ok",
                correctedSql: sql,
                note: L("sql_note_detail"),
              },
            },
          });
        }

        pushStep({
          id: info.toolCallId,
          kind: "edited",
          label: isReset ? "Reset grid view" : `Updated grid view query${title ? ` (${title})` : ""}`,
          subLabel: isPending
            ? "Refreshing grid view table..."
            : isReset
            ? "Base Table"
            : title || undefined,
          isLive: isPending,
          isError,
          info,
        });
        break;
      }
      case "visualize_grid_data": {
        const title = typeof inputObj.title === "string" ? inputObj.title.trim() : "";
        pushStep({
          id: info.toolCallId,
          kind: "ran",
          label: `Ran Chart: ${title || "Visualization"}`,
          subLabel: isPending ? "Generating chart visualization..." : "Chart visualization",
          isLive: isPending,
          isError,
          info,
        });
        break;
      }
      case "run_job": {
        const report = typeof inputObj.report === "string" ? inputObj.report : "Stock Balance";
        const preset = typeof inputObj.presetTitle === "string" ? inputObj.presetTitle : "";
        const outStatus =
          info.output && typeof info.output === "object"
            ? (info.output as { status?: string }).status
            : undefined;
        if (outStatus === "blocked") {
          pushStep({
            id: info.toolCallId,
            kind: "explored",
            label: "Skipped job: incomplete intent",
            subLabel: "Waiting for explicit run or criteria confirmation",
            isLive: isPending,
            isError,
            info,
          });
          break;
        }
        pushStep({
          id: info.toolCallId,
          kind: "ran",
          label: preset ? `Ran Job: ${preset}` : `Ran Job: ${report}`,
          subLabel: isPending ? "Executing background report job..." : "Report execution",
          isLive: isPending,
          isError,
          info,
        });
        break;
      }
      case "apply_criteria": {
        const preset = typeof inputObj.presetTitle === "string" ? inputObj.presetTitle : "";
        const outStatus =
          info.output && typeof info.output === "object"
            ? (info.output as { status?: string }).status
            : undefined;
        if (outStatus === "blocked") {
          pushStep({
            id: info.toolCallId,
            kind: "explored",
            label: "Skipped criteria apply: incomplete intent",
            subLabel: L("confirm_waiting"),
            isLive: isPending,
            isError,
            info,
          });
          break;
        }
        pushStep({
          id: info.toolCallId,
          kind: "edited",
          label: preset ? `Applied: ${preset}` : "Applied criteria to form",
          subLabel: isPending ? "Updating criteria grid..." : "Criteria updated",
          isLive: isPending,
          isError,
          info,
        });
        break;
      }
      case "navigate_to_page": {
        const title = typeof inputObj.title === "string" ? inputObj.title : (typeof inputObj.path === "string" ? inputObj.path : "Page navigation");
        pushStep({
          id: info.toolCallId,
          kind: "explored",
          label: `Navigated: ${title}`,
          subLabel: isPending ? "Opening page..." : "Page opened",
          isLive: isPending,
          isError,
          info,
        });
        break;
      }
      case "open_last_report": {
        pushStep({
          id: info.toolCallId,
          kind: "explored",
          label: "Opened last report job",
          subLabel: isPending ? "Finding last report job..." : "Last report opened",
          isLive: isPending,
          isError,
          info,
        });
        break;
      }
      case "find_matching_report": {
        pushStep({
          id: info.toolCallId,
          kind: "explored",
          label: "Checked for matching report",
          subLabel: isPending ? "Comparing criteria with past executions..." : "Matching check done",
          isLive: isPending,
          isError,
          info,
        });
        break;
      }
      case "request_user_confirmation": {
        const title = typeof inputObj.title === "string" ? inputObj.title : "User approval";
        pushStep({
          id: info.toolCallId,
          kind: "confirmation",
          label: `Confirmation: ${title}`,
          subLabel: isPending ? "Waiting for user confirmation..." : "User confirmation",
          isLive: isPending,
          isError,
          info,
        });
        break;
      }
      case "ask_user_question": {
        const raw = (inputObj as { questions?: unknown }).questions;
        const first =
          Array.isArray(raw) && raw.length > 0
            ? (raw[0] as { prompt?: unknown }).prompt
            : undefined;
        const count = Array.isArray(raw) ? raw.length : 0;
        // Aynı adımdaki yinelenen soru bastırıldıysa dürüst etiketle
        // (kırmızı "hata" değil, kasıtlı eleme).
        if (isDedupeSkipOutput(info)) {
          pushStep({
            id: info.toolCallId,
            kind: "confirmation",
            label: "Duplicate question suppressed",
            subLabel: "same-step repeat — first question set kept",
            isLive: false,
            isError: false,
            info,
          });
          break;
        }
        pushStep({
          id: info.toolCallId,
          kind: "confirmation",
          label:
            typeof first === "string" && first
              ? `Asked user: ${first}`
              : "Asked user questions",
          subLabel: isPending
            ? "Waiting for user answers..."
            : count > 1
              ? `${count} questions answered`
              : "User answers",
          isLive: isPending,
          isError,
          info,
        });
        break;
      }
      case "suggest_next_steps": {
        const raw = (inputObj as { suggestions?: unknown }).suggestions;
        const items = Array.isArray(raw) ? raw : [];
        const first =
          items.length > 0
            ? (items[0] as { title?: unknown }).title
            : undefined;
        pushStep({
          id: info.toolCallId,
          kind: "confirmation",
          label:
            typeof first === "string" && first
              ? `Suggested: ${first}`
              : "Suggested next steps",
          subLabel: isPending
            ? "Preparing suggestions..."
            : items.length > 1
              ? `${items.length} suggestions presented`
              : "Suggestion presented",
          isLive: isPending,
          isError,
          info,
        });
        break;
      }
      case "run_user_skill": {
        const slash =
          typeof inputObj.skill === "string" && inputObj.skill
            ? inputObj.skill
            : "skill";
        const loaded =
          info.output && typeof info.output === "object"
            ? (info.output as { status?: string }).status === "loaded"
            : false;
        pushStep({
          id: info.toolCallId,
          kind: "explored",
          label: `Loaded skill: /${slash}`,
          subLabel: isPending
            ? "Loading skill instructions..."
            : loaded
              ? "Skill instructions"
              : "Skill not found",
          isLive: isPending,
          isError,
          info,
        });
        break;
      }
      case "run_skill_script": {
        const script =
          typeof inputObj.script === "string" && inputObj.script
            ? inputObj.script.split("/").pop()
            : "script";
        pushStep({
          id: info.toolCallId,
          kind: "ran",
          label: `Ran script: ${script}`,
          subLabel: isPending ? "Executing skill script..." : "Script output",
          isLive: isPending,
          isError,
          info,
        });
        break;
      }
      case "read_skill_file": {
        const file =
          typeof inputObj.path === "string" && inputObj.path
            ? inputObj.path.split("/").pop()
            : "file";
        pushStep({
          id: info.toolCallId,
          kind: "explored",
          label: `Read skill file: ${file}`,
          subLabel: isPending ? "Reading bundled reference..." : "Reference loaded",
          isLive: isPending,
          isError,
          info,
        });
        break;
      }
      case "read_user_file": {
        const file =
          typeof inputObj.file === "string" && inputObj.file
            ? inputObj.file
            : "file";
        pushStep({
          id: info.toolCallId,
          kind: "explored",
          label: `Read user file: ${file}`,
          subLabel: isPending ? "Reading attached reference..." : "Reference loaded",
          isLive: isPending,
          isError,
          info,
        });
        break;
      }
      default: {
        pushStep({
          id: info.toolCallId,
          kind: "ran",
          label: `Ran tool: ${info.toolName}`,
          subLabel: isPending ? "Executing operation..." : "Completed",
          isLive: isPending,
          isError,
          info,
        });
      }
    }
  });

  if (isLiveStreaming && steps.length === 0) {
    steps.push({
      id: `${message?.id ?? "live"}-initial-planning`,
      kind: "thought",
      label: "Thinking & reasoning...",
      subLabel: L("planning_sub"),
      detailText: L("planning_detail"),
      isLive: true,
    });
  }

  // step-start artık satır üretmediği için yalnız metinden oluşan yanıtlarda
  // (thinking kapalıyken tipik durum) adım listesi boş kalır: tek satırlık özet ekle
  if (!isLiveStreaming && steps.length === 0 && message) {
    const hasText = message.parts.some(
      (p) => p.type === "text" && ((p as { text?: string }).text ?? "").trim().length > 0,
    );
    if (hasText) {
      steps.push({
        id: `${message.id}-direct-answer`,
        kind: "ran",
        label: "Composed answer",
        subLabel: "Direct response",
      });
    }
  }

  return steps;
}

