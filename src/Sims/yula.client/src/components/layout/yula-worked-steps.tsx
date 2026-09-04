"use client";

import {
  yulaToolPartInfo,
  isFailedToolInfo,
  type YulaToolPartInfo,
} from "@/lib/yula-tool-info";
import type { YulaMessage } from "@/app/api/agent/chat/route";
import { sanitizeAssistantText } from "@/lib/sanitize-assistant-text";
import { resolveYulaSlashCommand } from "@/components/layout/yula-commands";
import { getTurnTrace } from "@/lib/yula-turn-trace";
import type { TurnTraceStep } from "@/lib/yula-turn-trace";

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
): WorkedStepItem[] {
  const steps: WorkedStepItem[] = [];

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
        output: { status: "ok", message: `${cmdName} (${matchedCmd.label}) çalıştırıldı.` },
      },
    });
  }

  if (!message) {
    if (isLiveStreaming && steps.length === 0) {
      steps.push({
        id: "live-initial-planning",
        kind: "thought",
        label: "Thinking & reasoning...",
        subLabel: "Planlama yapılıyor...",
        detailText: "Kullanıcı talebi ve ekran durumu inceleniyor, uygun işlem ve analiz adımları belirleniyor...",
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
              : "Thought (boş / gizlendi)"
          : `Reasoning (${meta})`,
        subLabel: `${approxDuration}s`,
        durationSec: approxDuration,
        detailText: text || raw || "Düşünce metni yok veya sanitizer sildi.",
        isLive: isLiveStreaming,
        isError: !text.trim() && Boolean(raw.trim()),
      });
      return;
    }

    if (part.type === "text") {
      const raw = (part as { text?: string }).text ?? "";
      const text = sanitizeAssistantText(raw);
      if (text.trim()) return;
      pushStep({
        id: `${message.id}-text-hidden-${index}`,
        kind: "thought",
        label: raw.trim() ? "Model text gizlendi (sanitizer)" : "Model text boş",
        subLabel: isLiveStreaming ? "Streaming..." : "no visible bubble",
        detailText: raw.slice(0, 2000) || "(part.text boş)",
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
      case "prepare_report_criteria":
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
            displayExpr = `${field} (boş olanlar)`;
          } else if (op === "notEmpty") {
            displayExpr = `${field} (dolu olanlar)`;
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
                note: "Kullanıcı sorgusu tablo şemasına uyarlandı",
              },
              output: {
                status: "ok",
                correctedSql: sql,
                note: "Serbest dilli sorgu tablo şemasına, kolon isimlerine ve ISO tarihine otomatik uyarlandı.",
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
      case "run_report":
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
            subLabel: "Waiting for confirmation (forma doldur / uygula)",
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
      subLabel: "Planlama yapılıyor...",
      detailText: "Kullanıcı talebi ve ekran durumu inceleniyor, uygun işlem ve analiz adımları belirleniyor...",
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

