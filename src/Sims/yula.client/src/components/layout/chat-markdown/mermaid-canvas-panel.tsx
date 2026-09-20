"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import {
  Check,
  Copy,
  Download,
  Maximize2,
  Minimize2,
  Workflow,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { copyToClipboard } from "@/lib/clipboard";
import { useActiveDiagramStore } from "@/lib/stores/active-diagram-store";
import { MermaidBlock } from "./mermaid-block";

export function MermaidCanvasPanel() {
  const t = useTranslations("ChatMarkdown");
  const { activeDiagram, isMaximized, closeDiagram, toggleMaximize } =
    useActiveDiagramStore();
  const [copied, setCopied] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const chart = activeDiagram?.chart;

  const handleCopyCode = React.useCallback(async () => {
    if (!chart) return;
    const ok = await copyToClipboard(chart);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [chart]);

  const handleDownloadSvg = React.useCallback(() => {
    if (!containerRef.current || !activeDiagram) return;
    const svgEl = containerRef.current.querySelector("svg");
    if (!svgEl) return;

    const svgData = new XMLSerializer().serializeToString(svgEl);
    const blob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    const safeTitle = (activeDiagram.title || "diagram")
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, "-");
    link.download = `${safeTitle}.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [activeDiagram]);

  if (!activeDiagram) return null;

  return (
    <div className="flex h-full w-full flex-col overflow-hidden border-l border-border/50 bg-background/50 backdrop-blur-xs">
      <div className="flex h-11 items-center justify-between border-b border-border/50 px-4">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-orange-500/10 text-orange-600 dark:text-orange-400">
            <Workflow className="size-3.5" />
          </div>
          <span className="truncate text-xs font-semibold text-foreground">
            {activeDiagram.title}
          </span>
          <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-wider text-muted-foreground">
            {activeDiagram.diagramType}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={toggleMaximize}
            title={isMaximized ? t("restore_canvas") : t("maximize_canvas")}
            className="h-7 gap-1 px-2 text-[11px] font-normal cursor-pointer text-muted-foreground hover:text-foreground"
          >
            {isMaximized ? (
              <Minimize2 className="size-3.5" />
            ) : (
              <Maximize2 className="size-3.5" />
            )}
            <span className="hidden sm:inline">
              {isMaximized ? t("restore_canvas") : t("maximize_canvas")}
            </span>
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleDownloadSvg}
            title={t("download_svg")}
            className="h-7 gap-1 px-2 text-[11px] font-normal cursor-pointer text-muted-foreground hover:text-foreground"
          >
            <Download className="size-3.5" />
            <span className="hidden sm:inline">{t("download_svg")}</span>
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleCopyCode}
            title={t("copy_diagram_code")}
            className="h-7 gap-1 px-2 text-[11px] font-normal cursor-pointer text-muted-foreground hover:text-foreground"
          >
            {copied ? (
              <Check className="size-3.5 text-emerald-500" />
            ) : (
              <Copy className="size-3.5" />
            )}
            <span className="hidden sm:inline">{t("copy_diagram_code")}</span>
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={closeDiagram}
            title={t("close_canvas")}
            className="size-7 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
          >
            <X className="size-4" />
          </Button>
        </div>
      </div>

      <div
        ref={containerRef}
        className="flex-1 overflow-auto p-4 flex items-center justify-center bg-muted/10 min-h-0"
      >
        <MermaidBlock
          chart={activeDiagram.chart}
          fitCanvas
          className="w-full h-full border-0 rounded-none my-0 bg-transparent flex flex-col items-center justify-center"
        />
      </div>
    </div>
  );
}
