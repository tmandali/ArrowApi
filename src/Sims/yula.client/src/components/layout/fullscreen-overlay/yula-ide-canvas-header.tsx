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
import {
  useActiveDiagramStore,
  type ActiveDiagram,
} from "@/lib/stores/active-diagram-store";
import {
  panelHeaderClass,
  panelHeaderIconClass,
  panelHeaderTitleClass,
} from "@/components/layout/panel-chrome";
import { cn } from "@/utils/cn";

export interface YulaIdeCanvasHeaderProps {
  activeDiagram: ActiveDiagram;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

export function YulaIdeCanvasHeader({
  activeDiagram,
  containerRef,
}: YulaIdeCanvasHeaderProps) {
  const t = useTranslations("ChatMarkdown");
  const { isMaximized, toggleMaximize, closeDiagram } = useActiveDiagramStore();
  const [copied, setCopied] = React.useState(false);

  const chart = activeDiagram.chart;

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
  }, [containerRef, activeDiagram]);

  return (
    <div className={cn(panelHeaderClass, "bg-card")}>
      {/* Title & Diagram Type Badge */}
      <div className="flex min-w-0 items-center gap-2">
        <Workflow className={panelHeaderIconClass} />
        <span className={cn(panelHeaderTitleClass, "max-w-[200px] sm:max-w-xs")}>
          {activeDiagram.title}
        </span>
        {activeDiagram.diagramType ? (
          <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {activeDiagram.diagramType}
          </span>
        ) : null}
      </div>

      {/* Actions */}
      <div className="flex shrink-0 items-center gap-0.5">
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
          onClick={closeDiagram}
          title={t("close_canvas")}
          aria-label={t("close_canvas")}
          className="size-7 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
        >
          <X className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
