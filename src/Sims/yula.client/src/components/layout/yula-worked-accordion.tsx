"use client";

import * as React from "react";
import {
  Brain,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Search,
  FileCode,
  Loader2,
  Terminal,
  Sliders,
  Sparkles,
  Database,
  Code,
  CheckCircle2,
  Copy,
  Check,
  Table,
} from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { CodeBlock } from "@/components/ui/code-block";
import { useYulaGridStore } from "@/lib/stores/grid";
import { cn } from "@/utils/cn";
import {
  yulaToolPartInfo,
  isFailedToolInfo,
  type YulaToolPartInfo,
} from "@/hooks/use-yula-chat";
import type { YulaMessage } from "@/app/api/agent/chat/route";

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
}

interface YulaWorkedAccordionProps {
  userMessage?: YulaMessage;
  message?: YulaMessage;
  isLive?: boolean;
  durationSec?: number;
  llmStepCount?: number;
  className?: string;
}

/** Statik ve dinamik parçalardan YALNIZCA GERÇEK işlem ve düşünme adımlarını çıkartır */
export function extractWorkedSteps(
  message?: YulaMessage,
  isLiveStreaming?: boolean,
  userMessage?: YulaMessage,
): WorkedStepItem[] {
  const steps: WorkedStepItem[] = [];

  const userText = userMessage?.parts
    ?.filter((p) => p.type === "text")
    ?.map((p) => (p as { text: string }).text)
    ?.join("\n")
    ?.trim();

  if (userText?.startsWith("/")) {
    const cmdName = userText.split(/\s+/)[0];
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
        output: { status: "ok", message: `${cmdName} özel sistem komutu tetiklendi.` },
      },
    });
  }

  if (!message) {
    return steps;
  }

  message.parts.forEach((part, index) => {
    // 1. Gerçek Düşünme Parçaları (Reasoning / Thinking)
    if (part.type === "reasoning") {
      const text = part.text ?? "";
      if (!text.trim()) return;
      const meta = (part as { meta?: string }).meta;
      const isThinking = !meta || meta === "thinking";
      
      const approxDuration = Math.max(1, Math.round(text.length / 60));

      steps.push({
        id: `${message.id}-reasoning-${index}`,
        kind: "thought",
        label: isThinking ? `Thought for ${approxDuration}s` : `Reasoning (${meta})`,
        subLabel: `${approxDuration}s`,
        durationSec: approxDuration,
        detailText: text,
        isLive: isLiveStreaming,
      });
      return;
    }

    // 2. Gerçek Araç Parçaları (Tools)
    const info = yulaToolPartInfo(part);
    if (!info) return;

    const isError = isFailedToolInfo(info);
    const isPending = info.state !== "output-available" && info.state !== "output-error";

    const inputObj =
      typeof info.input === "object" && info.input !== null
        ? (info.input as Record<string, unknown>)
        : {};

    switch (info.toolName) {
      case "prepare_report_criteria":
      case "get_report_schema": {
        steps.push({
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
        steps.push({
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
        steps.push({
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

        steps.push({
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
          steps.push({
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

        steps.push({
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
        steps.push({
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
      case "run_report": {
        const report = typeof inputObj.report === "string" ? inputObj.report : "";
        steps.push({
          id: info.toolCallId,
          kind: "ran",
          label: `Ran Report: ${report || "Job execution"}`,
          subLabel: isPending ? "Executing background report job..." : "Report execution",
          isLive: isPending,
          isError,
          info,
        });
        break;
      }
      case "request_user_confirmation": {
        const title = typeof inputObj.title === "string" ? inputObj.title : "User approval";
        steps.push({
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
        steps.push({
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
      kind: "explored",
      label: "Reasoning & planning next action",
      subLabel: "Analyzing prompt & selecting tools...",
      isLive: true,
    });
  }

  return steps;
}

export function YulaWorkedAccordion({
  userMessage,
  message,
  isLive = false,
  durationSec,
  llmStepCount,
  className,
}: YulaWorkedAccordionProps) {
  const [open, setOpen] = React.useState(isLive);
  const [userToggled, setUserToggled] = React.useState(false);
  const [liveTimer, setLiveTimer] = React.useState(0);
  const [expandedStepId, setExpandedStepId] = React.useState<string | null>(null);
  const [copiedAnswer, setCopiedAnswer] = React.useState(false);

  const handleCopyAnswer = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!message) return;
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

    if (!fullText.trim()) return;
    void navigator.clipboard.writeText(fullText);
    setCopiedAnswer(true);
    setTimeout(() => setCopiedAnswer(false), 2000);
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

  // Nihai cevap metni yazılmaya başlandığı anda (text token'ları geldiğinde) akordeon otomatik katlanır
  const hasTextContent = React.useMemo(() => {
    if (!message) return false;
    return message.parts.some(
      (p) => p.type === "text" && (p.text ?? "").trim().length > 0
    );
  }, [message]);

  React.useEffect(() => {
    if (hasTextContent && !userToggled) {
      setOpen(false);
    }
  }, [hasTextContent, userToggled]);

  const steps = React.useMemo(
    () => extractWorkedSteps(message, isLive, userMessage),
    [message, isLive, userMessage]
  );

  const totalTime =
    durationSec ??
    (isLive
      ? liveTimer
      : steps.length > 0
      ? Math.max(1, steps.reduce((acc, s) => acc + (s.durationSec || 1), 0))
      : 1);

  const timeLabel = typeof totalTime === "number" ? Math.max(1, Math.round(totalTime)) : totalTime;

  // Mesaj, süre veya canlı akış varsa HER ZAMAN Worked for Xs başlığını ekranda kalıcı tut (asla kaybolmaz)
  if (!message && !isLive && !durationSec) return null;

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

      {/* Gemini Stili Şeffaf Adım Detayları */}
      {hasExpandableContent ? (
        <CollapsibleContent className="mt-1 space-y-1 pl-0.5">
          <div className="flex flex-col gap-1 text-[11.5px] font-sans text-muted-foreground/90">
            {steps.map((step) => {
              const isExpanded = expandedStepId === step.id;
              const hasDetails = Boolean(step.detailText || step.info?.input || step.info?.output);
              const inputObj = (step.info?.input as Record<string, unknown> | null) ?? {};
              const sqlStr = typeof inputObj.sql === "string" ? inputObj.sql.trim() : null;
              const outputObj = (step.info?.output as Record<string, unknown> | null) ?? {};

              return (
                <div key={step.id} className="flex flex-col gap-1">
                  <div
                    onClick={() => {
                      if (hasDetails) {
                        setExpandedStepId(isExpanded ? null : step.id);
                      }
                    }}
                    className={cn(
                      "flex items-center gap-2 hover:text-foreground transition-colors py-0.5 select-none",
                      hasDetails ? "cursor-pointer" : "cursor-default"
                    )}
                  >
                    {step.kind === "edited" ? (
                      <FileCode className="size-3.5 text-sky-400 shrink-0" />
                    ) : null}

                    <span className="font-mono text-foreground/90 font-medium">
                      {step.label}
                    </span>

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
                      <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-orange-500 animate-pulse">
                        <Loader2 className="size-3 animate-spin" />
                      </span>
                    ) : hasDetails ? (
                      <ChevronRight
                        className={cn(
                          "ml-1 size-3 text-muted-foreground/40 shrink-0 transition-transform duration-200",
                          isExpanded && "rotate-90 text-foreground/70"
                        )}
                      />
                    ) : null}
                  </div>

                  {/* Adım Tıklandığında Açılan Şık Detay Kutusu */}
                  {isExpanded && hasDetails ? (
                    <div className="ml-4 mt-1 overflow-hidden rounded-lg border border-border/30 bg-muted/20 p-1.5 space-y-1.5 font-mono text-[11px] backdrop-blur-xs select-none">
                      {step.detailText ? (
                        <div className="text-muted-foreground leading-snug px-0.5">{step.detailText}</div>
                      ) : null}

                      {/* Araç Adı, Giden Parametreler (Input) ve Gelen Çıktı (Output) ile Tek Renkli JSON Bloğu */}
                      {step.info ? (
                        <CodeBlock
                          value={JSON.stringify(
                            {
                              tool: step.info.toolName,
                              input: step.info.input,
                              output: (() => {
                                if (!step.info.output || typeof step.info.output !== "object") return step.info.output ?? null;
                                const out = { ...(step.info.output as Record<string, unknown>) };
                                if (step.info.input && typeof step.info.input === "object" && "sql" in step.info.input) {
                                  delete out.sql;
                                  delete out.display;
                                }
                                return out;
                              })(),
                            },
                            null,
                            2
                          )}
                          language="json"
                          className="max-h-52 border border-border/20 rounded-md p-1.5 text-[10.5px] font-mono leading-tight shadow-none"
                        />
                      ) : outputObj.error ? (
                        <div className="text-[10.5px] text-red-500 font-medium px-0.5">
                          Hata: {String(outputObj.error)}
                        </div>
                      ) : null}
                    </div>
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
