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
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";
import { copyToClipboard } from "@/lib/clipboard";
import { useActiveDiagramStore } from "@/lib/stores/active-diagram-store";
import { MermaidBlock } from "./mermaid-block";

export function MermaidCanvasSheet() {
  const t = useTranslations("ChatMarkdown");
  const { activeDiagram, isOpen, isMaximized, closeDiagram, toggleMaximize } =
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
    <Sheet open={isOpen} onOpenChange={(open) => !open && closeDiagram()}>
      <SheetContent
        side="right"
        className={cn(
          "flex w-full flex-col p-0 gap-0 z-50 bg-background/95 backdrop-blur-md transition-all duration-300",
          isMaximized
            ? "w-screen sm:max-w-full"
            : "w-full sm:max-w-[94vw] lg:max-w-[90vw] xl:max-w-[88vw]",
        )}
      >
        <SheetHeader className="flex flex-row items-center justify-between border-b border-border/50 px-5 py-3.5 space-y-0">
          <div className="flex items-center gap-2.5 min-w-0 pr-8">
            <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-orange-500/10 text-orange-600 dark:text-orange-400">
              <Workflow className="size-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <SheetTitle className="truncate text-sm font-semibold">
                  {activeDiagram.title}
                </SheetTitle>
                <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  {activeDiagram.diagramType}
                </span>
              </div>
              <SheetDescription className="text-[11px] text-muted-foreground truncate">
                {t("diagram_sheet_title")}
              </SheetDescription>
            </div>
          </div>

          <div className="flex items-center gap-1.5 pr-8">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={toggleMaximize}
              title={isMaximized ? t("restore_canvas") : t("maximize_canvas")}
              className="h-7 gap-1 px-2 text-[11px] font-normal cursor-pointer"
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
              variant="outline"
              size="sm"
              onClick={handleDownloadSvg}
              className="h-7 gap-1 px-2 text-[11px] font-normal cursor-pointer"
            >
              <Download className="size-3.5" />
              <span>{t("download_svg")}</span>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCopyCode}
              className="h-7 gap-1 px-2 text-[11px] font-normal cursor-pointer"
            >
              {copied ? (
                <Check className="size-3.5 text-emerald-500" />
              ) : (
                <Copy className="size-3.5" />
              )}
              <span>{t("copy_diagram_code")}</span>
            </Button>
          </div>
        </SheetHeader>

        <div
          ref={containerRef}
          className="flex-1 overflow-auto p-4 sm:p-6 flex items-center justify-center bg-muted/10 min-h-0"
        >
          <MermaidBlock
            chart={activeDiagram.chart}
            fitCanvas
            className="w-full h-full border-0 rounded-none my-0 bg-transparent flex flex-col items-center justify-center"
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
