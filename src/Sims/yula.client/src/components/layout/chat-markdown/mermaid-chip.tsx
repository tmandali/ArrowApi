"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import {
  Check,
  Copy,
  Eye,
  Maximize2,
  Workflow,
} from "lucide-react";
import { cn } from "@/utils/cn";
import { copyToClipboard } from "@/lib/clipboard";
import { useActiveDiagramStore } from "@/lib/stores/active-diagram-store";
import { MermaidBlock } from "./mermaid-block";
import { detectDiagramMeta } from "./mermaid-meta";

export interface MermaidChipProps {
  chart: string;
  className?: string;
  defaultInline?: boolean;
}

export function MermaidChip({
  chart,
  className,
  defaultInline = false,
}: MermaidChipProps) {
  const t = useTranslations("ChatMarkdown");
  const rawId = React.useId();
  const chipId = React.useMemo(
    () => `diag-${rawId.replace(/[^a-zA-Z0-9_-]/g, "")}`,
    [rawId],
  );

  const { type, title, lineCount } = React.useMemo(
    () => detectDiagramMeta(chart),
    [chart],
  );

  const [showInline, setShowInline] = React.useState(defaultInline);
  const [copied, setCopied] = React.useState(false);

  const openDiagram = useActiveDiagramStore((s) => s.openDiagram);

  const handleOpenCanvas = React.useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      openDiagram({
        id: chipId,
        title,
        chart,
        diagramType: type,
      });
    },
    [openDiagram, chipId, title, chart, type],
  );

  const handleCopy = React.useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      const ok = await copyToClipboard(chart);
      if (ok) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    },
    [chart],
  );

  const [inlineTab, setInlineTab] = React.useState<"diagram" | "code">("diagram");

  return (
    <div
      className={cn(
        "group/mermaid-chip my-2 overflow-hidden rounded-lg border border-border/50 bg-card/60 transition-all hover:border-orange-500/30",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2 px-3 py-2 bg-muted/30">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-orange-500/10 text-orange-600 dark:text-orange-400">
            <Workflow className="size-3.5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-[12px] font-medium text-foreground">
                {title}
              </span>
              <span className="rounded bg-muted px-1.5 py-0.2 font-mono text-[9.5px] uppercase tracking-wider text-muted-foreground">
                {type}
              </span>
            </div>
            <span className="font-mono text-[10px] text-muted-foreground/60">
              {t("line_count", { count: lineCount })}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {/* Tuvalde Aç (Side Canvas / Sheet) */}
          <button
            type="button"
            onClick={handleOpenCanvas}
            title={t("open_in_canvas")}
            className="inline-flex items-center gap-1 rounded-md bg-orange-500/10 px-2 py-1 text-[11px] font-medium text-orange-600 transition-colors hover:bg-orange-500/20 dark:text-orange-400 cursor-pointer"
          >
            <Maximize2 className="size-3" />
            <span>{t("open_in_canvas")}</span>
          </button>

          {/* Inline Önizle Toggle */}
          <button
            type="button"
            onClick={() => setShowInline((prev) => !prev)}
            title={t("preview_inline")}
            className={cn(
              "rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground cursor-pointer",
              showInline && "bg-muted text-foreground",
            )}
          >
            <Eye className="size-3.5" />
          </button>

          {/* Kodu Kopyala */}
          <button
            type="button"
            onClick={handleCopy}
            title={copied ? t("code_copied") : t("copy_code")}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground cursor-pointer"
          >
            {copied ? (
              <Check className="size-3.5 text-emerald-500" />
            ) : (
              <Copy className="size-3.5" />
            )}
          </button>
        </div>
      </div>

      {showInline ? (
        <div className="border-t border-border/40 p-2">
          <div className="mb-2 flex items-center justify-end gap-1">
            <button
              type="button"
              onClick={() => setInlineTab("diagram")}
              className={cn(
                "rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors cursor-pointer",
                inlineTab === "diagram"
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t("view_diagram")}
            </button>
            <button
              type="button"
              onClick={() => setInlineTab("code")}
              className={cn(
                "rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors cursor-pointer",
                inlineTab === "code"
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t("view_code")}
            </button>
          </div>
          {inlineTab === "diagram" ? (
            <MermaidBlock chart={chart} className="border-0 my-0 bg-transparent" />
          ) : (
            <pre className="max-h-64 overflow-auto rounded bg-muted/30 p-2 font-mono text-[11px] leading-snug text-foreground/90">
              {chart}
            </pre>
          )}
        </div>
      ) : null}
    </div>
  );
}
