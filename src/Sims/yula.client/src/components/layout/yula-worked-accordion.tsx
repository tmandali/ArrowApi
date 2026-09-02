"use client";

import * as React from "react";
import { copyToClipboard } from "@/lib/clipboard";
import {
  ChevronRight,
  Loader2,
  Copy,
  Check,
} from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { CodeBlock } from "@/components/ui/code-block";
import { cn } from "@/utils/cn";
import {
  yulaToolPartInfo,
  isFailedToolInfo,
  type YulaToolPartInfo,
} from "@/hooks/use-yula-chat";
import type { YulaMessage } from "@/app/api/agent/chat/route";
import { sanitizeAssistantText } from "@/lib/sanitize-assistant-text";
import { resolveYulaSlashCommand } from "@/components/layout/yula-commands";
import { getTurnTrace, subscribeTurnTrace } from "@/lib/yula-turn-trace";
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

interface YulaWorkedAccordionProps {
  userMessage?: YulaMessage;
  message?: YulaMessage;
  isLive?: boolean;
  durationSec?: number;
  llmStepCount?: number;
  conversationId?: string;
  className?: string;
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
          label: `Ran SQL: ${shortSql || "DuckDB query"}`,
          subLabel: isPending ? "Executing DuckDB SQL query..." : "DuckDB query",
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

export function YulaWorkedAccordion({
  userMessage,
  message,
  isLive = false,
  durationSec,
  conversationId,
  className,
}: YulaWorkedAccordionProps) {
  const [open, setOpen] = React.useState(isLive);
  const [userToggled, setUserToggled] = React.useState(false);
  const [liveTimer, setLiveTimer] = React.useState(0);
  const [expandedStepId, setExpandedStepId] = React.useState<string | null>(null);
  const [copiedAnswer, setCopiedAnswer] = React.useState(false);

  /** Adım detay bloğu — ekrandaki CodeBlock ile aynı alanlar (sql/display çıkarılmış) */
  const stepPayload = (step: WorkedStepItem): string | null => {
    if (!step.info) return null;
    const out = (() => {
      if (!step.info?.output || typeof step.info.output !== "object") return step.info?.output ?? null;
      const cleaned = { ...(step.info.output as Record<string, unknown>) };
      if (step.info.input && typeof step.info.input === "object" && "sql" in step.info.input) {
        delete cleaned.sql;
        delete cleaned.display;
      }
      return cleaned;
    })();
    const body: Record<string, unknown> = { tool: step.info.toolName, input: step.info.input };
    // Sınır işaretlerinde output hiç üretilmez: null alanı basmak yerine atla
    if (out !== null && out !== undefined) body.output = out;
    return JSON.stringify(body, null, 2);
  };

  /** "Worked for" başlığı + tüm adım detayları + nihai cevap metni */
  const buildFullCopyText = (): string => {
    const sections: string[] = [];
    sections.push(`Worked for ${timeLabel}s`);

    steps.forEach((step, index) => {
      const lines = [`${index + 1}. ${step.label}${step.subLabel ? ` (${step.subLabel})` : ""}`];
      if (step.detailText) lines.push(`   ${step.detailText}`);
      const payload = stepPayload(step);
      if (payload) lines.push(payload);
      sections.push(lines.join("\n"));
    });

    if (message) {
      const fullText = message.parts
        .map((p) => {
          if (p.type === "text") return (p as { text: string }).text;
          if (p.type === "reasoning" && (p as { text?: string }).text) {
            return `[Düşünme / Reasoning]\n${(p as { text: string }).text}`;
          }
          return "";
        })
        .filter(Boolean)
        .join("\n\n");
      if (fullText.trim()) sections.push(`———\n${fullText}`);
    }

    return sections.join("\n\n");
  };

  const handleCopyAnswer = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!message) return;
    const fullText = buildFullCopyText();
    if (!fullText.trim()) return;
    const success = await copyToClipboard(fullText);
    if (success) {
      setCopiedAnswer(true);
      setTimeout(() => setCopiedAnswer(false), 2000);
    }
  };

  // Canlı akış zamanlayıcısı (Live streaming ticker) — Tur boyunca (tüm araçlar/turlar bitene kadar) kesintisiz sayar
  const startTimeRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    if (!isLive) {
      startTimeRef.current = null;
      setLiveTimer(0);
      return;
    }
    if (startTimeRef.current === null) {
      startTimeRef.current = Date.now();
    }
    const start = startTimeRef.current;
    const updateTimer = () => {
      setLiveTimer(Math.max(1, Math.floor((Date.now() - start) / 1000)));
    };
    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [isLive]);

  // Nihai cevap metni tamamlandığında (akış bittiğinde) akordeon otomatik katlanır
  const hasTextContent = React.useMemo(() => {
    if (!message) return false;
    return message.parts.some(
      (p) => p.type === "text" && (p.text ?? "").trim().length > 0
    );
  }, [message]);

  const [traceRev, bumpTrace] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => subscribeTurnTrace(() => bumpTrace()), []);

  const steps = React.useMemo(
    () => extractWorkedSteps(message, isLive, userMessage, conversationId),
    [message, isLive, userMessage, conversationId, traceRev],
  );

  React.useEffect(() => {
    if (userToggled) return;
    // Yanıt bitince (canlı akış yok, cevap metni var, hata yok) akordeon
    // kendini kapatır; isLive tüm tur (araç yürütmeleri dahil) süresince açık tutar.
    const keepOpen = isLive || !hasTextContent || steps.some((s) => s.isError);
    setOpen(keepOpen);
  }, [isLive, hasTextContent, userToggled, steps]);

  const lastLiveTimerRef = React.useRef<number>(0);

  React.useEffect(() => {
    if (liveTimer > 0) {
      lastLiveTimerRef.current = liveTimer;
    }
  }, [liveTimer]);

  const totalTime =
    durationSec ??
    (isLive
      ? liveTimer
      : lastLiveTimerRef.current > 0
      ? lastLiveTimerRef.current
      : steps.length > 0
      ? Math.max(1, steps.reduce((acc, s) => acc + (s.durationSec || 1), 0))
      : 1);

  const timeLabel = typeof totalTime === "number" ? Math.max(1, Math.round(totalTime)) : totalTime;

  // Worker her zaman: asistan, canlı akış, süre veya görünür adım varsa
  if (!message && !isLive && !durationSec && steps.length === 0) return null;

  const hasExpandableContent = steps.length > 0;

  return (
    <Collapsible
      open={open && hasExpandableContent}
      onOpenChange={(val) => {
        if (!hasExpandableContent) return;
        setUserToggled(true);
        setOpen(val);
      }}
      className={cn("my-1 w-full select-none font-sans", className)}
    >
      <div className="group/worked flex w-full items-center justify-between py-0.5">
        <CollapsibleTrigger
          disabled={!hasExpandableContent}
          className={cn(
            "flex items-center gap-1.5 text-[12.5px] font-medium text-muted-foreground/90 transition-colors",
            hasExpandableContent ? "hover:text-foreground cursor-pointer" : "cursor-default"
          )}
        >
          <span className="font-sans text-foreground/90 font-medium flex items-center gap-1">
            <span>Worked for {timeLabel}s</span>
          </span>

          <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/70 transition-transform duration-200 group-data-[state=open]/worked:rotate-90" />
        </CollapsibleTrigger>

        {/* Worked For Satırının En Sağındaki Çerçevesiz Transparan Hover Kopyalama Butonu */}
        {!isLive && hasTextContent ? (
          <button
            type="button"
            onClick={handleCopyAnswer}
            title={copiedAnswer ? "Cevap Kopyalandı" : "Tüm Cevap Metnini Kopyala"}
            className="ml-auto flex items-center justify-center p-0.5 rounded-md border-0 bg-transparent text-muted-foreground/60 hover:text-foreground opacity-0 group-hover/worked:opacity-100 transition-opacity cursor-pointer select-none"
          >
            {copiedAnswer ? (
              <Check className="size-3.5 text-emerald-500" />
            ) : (
              <Copy className="size-3.5" />
            )}
          </button>
        ) : null}
      </div>

      {/* Gemini Stili Adım Adım Çalıştırma ve Düşünme Çizelgesi */}
      {hasExpandableContent ? (
        <CollapsibleContent className="mt-1.5 space-y-1.5 pl-1">
          <div className="flex flex-col gap-1.5 text-[12.5px] font-sans text-muted-foreground/90">
            {steps.map((step) => {
              // Düşünme adımları varsayılan olarak açık başlar (Gemini stili)
              const isThought = step.kind === "thought";
              const autoOpen = isThought || Boolean(step.isError);
              const isManuallyToggled = expandedStepId === step.id;
              const isExpanded = autoOpen
                ? expandedStepId === null || expandedStepId === step.id
                : isManuallyToggled;

              const hasDetails = Boolean(step.detailText || step.info?.input || step.info?.output);
              const outputObj = (step.info?.output as Record<string, unknown> | null) ?? {};
              // step-start sonrası parçalar kendi adım seviyesinde girintili görünür
              const indent = step.stepIndex == null ? 0 : 16;

              return (
                <div
                  key={step.id}
                  style={indent ? { marginLeft: indent } : undefined}
                  className="flex flex-col gap-1"
                >
                  {/* Adım Başlığı Satırı */}
                  <div
                    onClick={() => {
                      if (hasDetails) {
                        setExpandedStepId(isExpanded ? `closed-${step.id}` : step.id);
                      }
                    }}
                    className={cn(
                      "group/step flex items-center gap-1.5 py-0.5 text-foreground/90 transition-colors select-none",
                      hasDetails ? "cursor-pointer hover:text-foreground" : "cursor-default"
                    )}
                  >
                    <span
                      className={cn(
                        "font-sans font-normal text-[12.5px]",
                        step.isError
                          ? "text-red-600 dark:text-red-400"
                          : "text-foreground/85",
                      )}
                    >
                      {step.label}
                    </span>
                    {step.subLabel ? (
                      <span className="truncate font-mono text-[10.5px] text-muted-foreground/70">
                        {step.subLabel}
                      </span>
                    ) : null}

                    {step.diffBadge ? (
                      <span className="inline-flex items-center gap-1 font-mono text-[10.5px]">
                        <span className="text-emerald-500 dark:text-emerald-400 font-medium">
                          +{step.diffBadge.added}
                        </span>
                        <span className="text-red-500 dark:text-red-400 font-medium">
                          -{step.diffBadge.removed}
                        </span>
                      </span>
                    ) : null}

                    {step.isLive ? (
                      <span className="ml-1 inline-flex items-center gap-1 text-[11px] text-orange-500 animate-pulse">
                        <Loader2 className="size-3 animate-spin" />
                      </span>
                    ) : hasDetails ? (
                      <ChevronRight
                        className={cn(
                          "size-3.5 text-muted-foreground/50 transition-transform duration-200 group-hover/step:text-foreground/70",
                          isExpanded && "rotate-90 text-foreground/70"
                        )}
                      />
                    ) : null}
                  </div>

                  {/* Gemini Stili Doğrudan İçe Girintili Düşünme / Detay Metni */}
                  {isExpanded && hasDetails ? (
                    isThought && step.detailText ? (
                      <div className="pl-4 py-0.5 text-[12px] leading-relaxed text-muted-foreground/80 font-sans whitespace-pre-wrap select-text">
                        {step.detailText}
                      </div>
                    ) : (
                      <div className="ml-4 mt-1 overflow-hidden rounded-lg border border-border/30 bg-muted/20 p-2 space-y-1.5 font-mono text-[11px] backdrop-blur-xs select-none">
                        {step.detailText ? (
                          <div className="text-muted-foreground leading-snug px-0.5">{step.detailText}</div>
                        ) : null}

                        {/* Araç Adı, Giden Parametreler (Input) ve Gelen Çıktı (Output) ile Tek Renkli JSON Bloğu */}
                        {step.info ? (
                          <CodeBlock
                            value={(() => {
                              const out = (() => {
                                if (!step.info?.output || typeof step.info.output !== "object") return step.info?.output ?? null;
                                const cleaned = { ...(step.info.output as Record<string, unknown>) };
                                if (step.info.input && typeof step.info.input === "object" && "sql" in step.info.input) {
                                  delete cleaned.sql;
                                  delete cleaned.display;
                                }
                                return cleaned;
                              })();
                              const body: Record<string, unknown> = {
                                tool: step.info.toolName,
                                input: step.info.input,
                              };
                              if (out !== null && out !== undefined) body.output = out;
                              return JSON.stringify(body, null, 2);
                            })()}
                            language="json"
                            className="max-h-52 border border-border/20 rounded-md p-1.5 text-[10.5px] font-mono leading-tight shadow-none"
                          />
                        ) : outputObj.error ? (
                          <div className="text-[10.5px] text-red-500 font-medium px-0.5">
                            Hata: {String(outputObj.error)}
                          </div>
                        ) : null}
                      </div>
                    )
                  ) : null}
                </div>
              );
            })}
          </div>
        </CollapsibleContent>
      ) : null}
    </Collapsible>
  );
}
