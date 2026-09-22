"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/utils/cn";
import type { YulaMessage } from "@/app/api/agent/chat/route";
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
  timeLabel?: number | string;
  durationSec?: number;
  llmStepCount?: number;
  className?: string;
}

/**
 * Tur Sonu Kompakt Telemetri & Kaynak Özeti
 * Ajan turunun harcadığı tur sayısı, token dağılımı, tahmini maliyet ve bağlam penceresini özetler.
 */
export function YulaExecutionTerminal({
  steps,
  totalTokens,
  inTokens,
  outTokens,
  costFormatted,
  contextUsage,
  llmStepCount,
  className,
}: YulaExecutionTerminalProps) {
  const t = useTranslations("WorkedAccordion");

  const stepIndices = React.useMemo(() => steps.map((s) => s.stepIndex ?? 0), [steps]);
  const maxStepIndex = stepIndices.length > 0 ? Math.max(...stepIndices) : 0;
  const turnCount = Math.max(llmStepCount ?? 1, maxStepIndex + 1);

  return (
    <div
      className={cn(
        "mt-1.5 flex flex-wrap items-center gap-1.5 rounded-md border border-border/30 bg-muted/20 px-2.5 py-1 font-mono text-[11px] text-muted-foreground/80 select-none",
        className
      )}
    >
      <span className="font-semibold text-foreground/90">
        {t("telemetry_turn_count", { count: turnCount })}
      </span>
      {totalTokens > 0 ? (
        <>
          <span className="text-border/60">·</span>
          <span>{formatTokenCount(totalTokens)} tok</span>
          {inTokens > 0 || outTokens > 0 ? (
            <span className="text-muted-foreground/60 text-[10px]">
              ({formatTokenCount(inTokens)}/{formatTokenCount(outTokens)})
            </span>
          ) : null}
        </>
      ) : null}
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
  );
}
