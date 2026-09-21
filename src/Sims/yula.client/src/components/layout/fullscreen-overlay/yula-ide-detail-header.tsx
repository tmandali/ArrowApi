"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import {
  Activity,
  Check,
  Copy,
  Download,
  Maximize2,
  Minimize2,
  Workflow,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { copyToClipboard } from "@/lib/clipboard";
import {
  useActiveDiagramStore,
  type ActiveDiagram,
} from "@/lib/stores/active-diagram-store";
import { panelHeaderClass } from "@/components/layout/panel-chrome";
import { cn } from "@/utils/cn";

export interface YulaIdeDetailHeaderProps {
  activeView: "diagram" | "telemetry";
  onViewChange: (view: "diagram" | "telemetry") => void;
  activeDiagram?: ActiveDiagram | null;
  containerRef?: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
}

export function YulaIdeDetailHeader({
  activeView,
  onViewChange,
  activeDiagram,
  containerRef,
  onClose,
}: YulaIdeDetailHeaderProps) {
  const t = useTranslations("ChatMarkdown");
  const { isMaximized, toggleMaximize } = useActiveDiagramStore();
  const closeDiagram = useActiveDiagramStore((s) => s.closeDiagram);
  const [copied, setCopied] = React.useState(false);

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
    if (!containerRef?.current || !activeDiagram) return;
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
  }, [containerRef, activeDiagram]);

  const handleCloseDiagram = (e: React.MouseEvent) => {
    e.stopPropagation();
    closeDiagram();
    onViewChange("telemetry");
  };

  return (
    <div className={cn(panelHeaderClass, "bg-card")}>
      {/* 1. Detail View Tabs (Sleek button appearance) */}
      <div className="flex items-center gap-1 min-w-0 overflow-x-auto no-scrollbar">
        {/* Tab 1: Telemetry (Permanent tool tab) */}
        <button
          type="button"
          onClick={() => onViewChange("telemetry")}
          className={cn(
            "flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors cursor-pointer shrink-0 select-none",
            activeView === "telemetry"
              ? "bg-muted text-foreground font-semibold shadow-2xs"
              : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
          )}
          title="Telemetri & Canlı Olay Radarı"
        >
          <Activity className="size-3.5 text-blue-500 shrink-0" />
          <span>Telemetri</span>
        </button>

        {/* Tab 2: Diagram (Rendered only when a diagram is active/opened) */}
        {activeDiagram && (
          <button
            type="button"
            onClick={() => onViewChange("diagram")}
            className={cn(
              "group flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors cursor-pointer shrink-0 select-none max-w-[200px]",
              activeView === "diagram"
                ? "bg-muted text-foreground font-semibold shadow-2xs"
                : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
            )}
            title={activeDiagram.title || "Diyagram"}
          >
            <Workflow className="size-3.5 text-orange-500 shrink-0" />
            <span className="truncate">
              {activeDiagram.title || "Diyagram"}
            </span>

            {activeDiagram.diagramType && (
              <Badge
                variant="outline"
                className="h-3.5 px-1 text-[8px] uppercase font-mono tracking-wider text-muted-foreground/70 border-border/50 bg-muted/20 shrink-0"
              >
                {activeDiagram.diagramType}
              </Badge>
            )}

            <span
              role="button"
              tabIndex={0}
              onClick={handleCloseDiagram}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  handleCloseDiagram(e as unknown as React.MouseEvent);
                }
              }}
              title="Diyagram Sekmesini Kapat"
              className="ml-0.5 size-3.5 rounded flex items-center justify-center text-muted-foreground/60 hover:bg-muted-foreground/15 hover:text-foreground shrink-0 transition-colors"
            >
              <X className="size-2.5" />
            </span>
          </button>
        )}
      </div>

      {/* 2. Right Actions Strip (Contextual Tools + Maximize + Panel Close) */}
      <div className="flex shrink-0 items-center gap-0.5">
        {activeView === "diagram" && activeDiagram && (
          <>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={handleDownloadSvg}
              title={t("download_svg")}
              aria-label={t("download_svg")}
              className="size-7 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
            >
              <Download className="size-3.5" />
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={handleCopyCode}
              title={t("copy_diagram_code")}
              aria-label={t("copy_diagram_code")}
              className="size-7 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
            >
              {copied ? (
                <Check className="size-3.5 text-emerald-500" />
              ) : (
                <Copy className="size-3.5" />
              )}
            </Button>
          </>
        )}

        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={toggleMaximize}
          title={isMaximized ? t("restore_canvas") : t("maximize_canvas")}
          aria-label={isMaximized ? t("restore_canvas") : t("maximize_canvas")}
          className="size-7 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
        >
          {isMaximized ? (
            <Minimize2 className="size-3.5" />
          ) : (
            <Maximize2 className="size-3.5" />
          )}
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onClose}
          title={t("close_canvas")}
          aria-label={t("close_canvas")}
          className="size-7 rounded-md text-muted-foreground hover:bg-muted hover:text-destructive cursor-pointer"
        >
          <X className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
