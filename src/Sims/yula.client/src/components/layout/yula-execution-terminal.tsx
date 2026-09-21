"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import {
  Terminal,
  Play,
  Brain,
  Cpu,
  Check,
  X,
  CheckCircle2,
  Copy,
  ChevronRight,
  Activity,
  type LucideIcon,
} from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { copyToClipboard } from "@/lib/clipboard";
import { cn } from "@/utils/cn";
import type { YulaMessage } from "@/app/api/agent/chat/route";
import { getMessageText } from "@my-agent/core";
import type { WorkedStepItem } from "./yula-worked-steps";
import { formatTokenCount } from "./yula-chat-turn-helpers";

export interface YulaExecutionTerminalProps {
  userMessage?: YulaMessage;
  steps: WorkedStepItem[];
  totalTokens: number;
  inTokens: number;
  outTokens: number;
  costFormatted: string | null;
  contextUsage?: { percent: number; tokens: number; contextWindow: number };
  timeLabel: number | string;
  durationSec?: number;
  llmStepCount?: number;
  className?: string;
}

interface TerminalRow {
  icon: LucideIcon;
  iconColor: string;
  label: string;
  labelColor?: string;
  detail?: string;
  rawText: string;
}

export function YulaExecutionTerminal({
  userMessage,
  steps,
  totalTokens,
  inTokens,
  outTokens,
  costFormatted,
  contextUsage,
  timeLabel,
  llmStepCount,
  className,
}: YulaExecutionTerminalProps) {
  const t = useTranslations("WorkedAccordion");
  const ws = useTranslations("WorkedSteps");
  const [open, setOpen] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  const stepIndices = React.useMemo(() => steps.map((s) => s.stepIndex ?? 0), [steps]);
  const maxStepIndex = stepIndices.length > 0 ? Math.max(...stepIndices) : 0;
  const turnCount = Math.max(llmStepCount ?? 1, maxStepIndex + 1);

  const rows = React.useMemo<TerminalRow[]>(() => {
    const list: TerminalRow[] = [];
    const userText = getMessageText(userMessage);

    if (userText) {
      const snippet = userText.length > 80 ? `${userText.slice(0, 80)}…` : userText;
      const reqLabel = t("log_request");
      list.push({
        icon: Play,
        iconColor: "text-sky-600 dark:text-sky-400",
        label: reqLabel,
        labelColor: "text-sky-600 dark:text-sky-400 font-medium",
        detail: `"${snippet}"`,
        rawText: `[${reqLabel}] "${snippet}"`,
      });
    }

    let lastTurn = 1;
    steps.forEach((step) => {
      const currentTurn = (step.stepIndex ?? 0) + 1;
      if (turnCount > 1 && currentTurn > lastTurn) {
        list.push({
          icon: Activity,
          iconColor: "text-primary/70",
          label: `${t("log_turn")} ${currentTurn}`,
          labelColor: "text-primary font-semibold text-[11px]",
          rawText: `--- ${t("log_turn")} ${currentTurn} ---`,
        });
      }
      lastTurn = currentTurn;

      if (step.kind === "thought") {
        const thoughtLabel = t("log_thought");
        list.push({
          icon: Brain,
          iconColor: "text-muted-foreground/70",
          label: thoughtLabel,
          detail: step.label,
          rawText: `[${thoughtLabel}] ${step.label}`,
        });
      } else {
        const toolName = step.info?.toolName || step.label;
        const sub = step.subLabel ? `(${step.subLabel})` : "";
        const execLabel = t("log_exec");
        list.push({
          icon: Cpu,
          iconColor: "text-amber-600 dark:text-amber-400",
          label: `${execLabel}: ${toolName}`,
          labelColor: "text-foreground/90 font-medium",
          detail: sub,
          rawText: `[${execLabel}] ${toolName} ${sub}`.trim(),
        });

        if (step.info?.output) {
          const outStr =
            typeof step.info.output === "object"
              ? JSON.stringify(step.info.output).slice(0, 100)
              : String(step.info.output).slice(0, 100);

          const outLabel = step.isError ? t("log_error") : t("log_output");
          list.push({
            icon: step.isError ? X : Check,
            iconColor: step.isError
              ? "text-destructive"
              : "text-emerald-600 dark:text-emerald-400",
            label: outLabel,
            labelColor: step.isError
              ? "text-destructive font-medium"
              : "text-emerald-600 dark:text-emerald-400 font-medium",
            detail: outStr,
            rawText: `[${outLabel}] ${outStr}`,
          });
        }
      }
    });

    const doneLabel = t("log_done");
    const doneDetail = `${turnCount > 1 ? `${t("telemetry_turn_count", { count: turnCount })} · ` : ""}${timeLabel}s`;
    list.push({
      icon: CheckCircle2,
      iconColor: "text-emerald-600 dark:text-emerald-400",
      label: doneLabel,
      labelColor: "text-emerald-600 dark:text-emerald-400 font-medium",
      detail: doneDetail,
      rawText: `[${doneLabel}] ${doneDetail}`,
    });

    return list;
  }, [userMessage, steps, timeLabel, turnCount, t]);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const logText = rows.map((r) => r.rawText).join("\n");
    const success = await copyToClipboard(logText);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className={cn(
        "mt-2 w-full select-none overflow-hidden rounded-lg border border-border/40 bg-muted/20 dark:bg-muted/15 shadow-xs transition-colors",
        className
      )}
    >
      {/* Sadeleştirilmiş Tek Başlık: Tur Sayısı + Kompakt Metrikler + Terminal Toggle */}
      <CollapsibleTrigger asChild>
        <div className="group/telemetry flex items-center justify-between cursor-pointer bg-muted/30 px-2.5 py-1.5 font-mono text-[11px] text-muted-foreground/80 hover:bg-muted/50 transition-colors">
          {/* Sol: Tur + Token + Girdi/Çıktı + Maliyet + Bağlam */}
          <div className="flex flex-wrap items-center gap-1.5 min-w-0">
            <span className="font-semibold text-foreground/90">
              {t("telemetry_turn_count", { count: turnCount })}
            </span>
            <span className="text-border/60">·</span>
            <span>
              {formatTokenCount(totalTokens)} tok
            </span>
            <span className="text-muted-foreground/60 text-[10px]">
              ({formatTokenCount(inTokens)}/{formatTokenCount(outTokens)})
            </span>
            {costFormatted ? (
              <>
                <span className="text-border/60">·</span>
                <span className="text-foreground/80">{costFormatted}</span>
              </>
            ) : null}
            {contextUsage?.percent !== undefined ? (
              <>
                <span className="text-border/60">·</span>
                <span
                  className={cn(
                    "font-medium",
                    contextUsage.percent > 90
                      ? "text-destructive font-semibold"
                      : contextUsage.percent > 70
                        ? "text-amber-600 dark:text-amber-400 font-semibold"
                        : "text-muted-foreground"
                  )}
                >
                  %{contextUsage.percent.toFixed(0)} {t("telemetry_context_short")}
                </span>
              </>
            ) : null}
          </div>

          {/* Sağ: Kopyala Butonu + Terminal Etiketi & İkonu */}
          <div className="flex items-center gap-1.5 pl-2 shrink-0 font-sans text-[10.5px]">
            {open ? (
              <button
                type="button"
                onClick={handleCopy}
                title={copied ? ws("tour_copy_done") : t("copy_terminal")}
                className="inline-flex items-center justify-center size-6 rounded p-0.5 text-muted-foreground/70 hover:bg-muted hover:text-foreground transition-colors cursor-pointer border-0 bg-transparent select-none"
              >
                {copied ? (
                  <Check className="size-3.5 text-emerald-500" />
                ) : (
                  <Copy className="size-3.5" />
                )}
              </button>
            ) : null}

            <div className="flex items-center gap-1 text-muted-foreground/80 group-hover/telemetry:text-foreground/90 font-medium">
              <Terminal className="size-3 text-primary shrink-0" />
              <span>{t("telemetry_terminal")}</span>
            </div>

            <ChevronRight
              className={cn(
                "size-3 text-muted-foreground/60 transition-transform duration-200 group-hover/telemetry:text-foreground/80",
                open && "rotate-90"
              )}
            />
          </div>
        </div>
      </CollapsibleTrigger>

      {/* Sadeleştirilmiş Terminal Satırları */}
      <CollapsibleContent>
        <div className="border-t border-border/30 max-h-52 overflow-y-auto p-2 space-y-0.5 font-mono text-[11px] select-text">
          {rows.map((row, idx) => {
            const Icon = row.icon;
            return (
              <div
                key={idx}
                className="group/line flex items-start gap-2 py-0.5 rounded px-1.5 -mx-1 hover:bg-muted/40 transition-colors"
              >
                <span className={cn("shrink-0 mt-0.5", row.iconColor)}>
                  <Icon className="size-3" />
                </span>
                <div className="flex flex-wrap items-baseline gap-1.5 min-w-0 flex-1 leading-snug">
                  <span
                    className={cn(
                      "shrink-0 font-medium text-[11px]",
                      row.labelColor ?? "text-foreground/90"
                    )}
                  >
                    {row.label}
                  </span>
                  {row.detail ? (
                    <span className="text-muted-foreground break-all text-[11px]">
                      {row.detail}
                    </span>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
