"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { AlertCircle, Loader2, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import { useTheme } from "@/context/theme-context";
import { cn } from "@/utils/cn";

export interface MermaidBlockProps {
  chart: string;
  className?: string;
  showControls?: boolean;
  fitCanvas?: boolean;
}

let mermaidPromise: Promise<typeof import("mermaid")["default"]> | null = null;

function getMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import("mermaid").then((m) => {
      m.default.initialize({
        startOnLoad: false,
        securityLevel: "loose",
        fontFamily: "var(--font-sans), system-ui, -apple-system, sans-serif",
      });
      return m.default;
    });
  }
  return mermaidPromise;
}

let renderCounter = 0;

export function MermaidBlock({
  chart,
  className,
  showControls = true,
  fitCanvas = false,
}: MermaidBlockProps) {
  const t = useTranslations("ChatMarkdown");
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const rawId = React.useId();
  const baseId = React.useMemo(
    () => rawId.replace(/[^a-zA-Z0-9_-]/g, ""),
    [rawId],
  );

  const [svg, setSvg] = React.useState<string>("");
  const [status, setStatus] = React.useState<"loading" | "rendered" | "error">(
    "loading",
  );
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [zoom, setZoom] = React.useState<number>(1);

  const cleanChart = React.useMemo(() => chart.trim(), [chart]);

  const cleanSvg = React.useMemo(() => {
    if (!svg) return "";
    if (fitCanvas) {
      return svg.replace(/max-width:\s*[^;"]+;?/i, "");
    }
    return svg;
  }, [svg, fitCanvas]);

  React.useEffect(() => {
    if (!cleanChart) return;
    let cancelled = false;

    const currentRenderId = `mermaid-${baseId}-${++renderCounter}`;

    async function renderChart() {
      try {
        const mermaid = await getMermaid();
        if (cancelled) return;

        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "loose",
          theme: isDark ? "dark" : "neutral",
          themeVariables: isDark
            ? {
                darkMode: true,
                background: "#18181b",
                primaryColor: "#ea580c",
                primaryTextColor: "#f4f4f5",
                primaryBorderColor: "#52525b",
                lineColor: "#a1a1aa",
                secondaryColor: "#27272a",
                tertiaryColor: "#18181b",
              }
            : {
                darkMode: false,
                primaryColor: "#ea580c",
                lineColor: "#71717a",
              },
          fontFamily: "var(--font-sans), system-ui, -apple-system, sans-serif",
        });

        // Parse check first to avoid uncaught exceptions during streaming
        await mermaid.parse(cleanChart);
        if (cancelled) return;

        const { svg: renderedSvg } = await mermaid.render(
          currentRenderId,
          cleanChart,
        );
        if (cancelled) return;

        setSvg(renderedSvg);
        setStatus("rendered");
        setErrorMsg(null);
      } catch (err: unknown) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        // During streaming incomplete tokens are expected; keep previous SVG if exists
        setStatus((prev) => (prev === "rendered" ? "rendered" : "error"));
        setErrorMsg(msg);
      } finally {
        // Clean up any stray element inserted by mermaid error handling
        const stray = document.getElementById(`d${currentRenderId}`);
        if (stray?.parentNode) {
          stray.parentNode.removeChild(stray);
        }
      }
    }

    void renderChart();

    return () => {
      cancelled = true;
    };
  }, [cleanChart, isDark, baseId]);

  const handleZoomIn = React.useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setZoom((z) => Math.min(z + 0.2, 3.5));
    },
    [],
  );

  const handleZoomOut = React.useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setZoom((z) => Math.max(z - 0.2, 0.3));
    },
    [],
  );

  const handleResetZoom = React.useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setZoom(1);
    },
    [],
  );

  return (
    <div
      className={cn(
        "relative my-1 w-full overflow-hidden rounded-md border border-border/40 bg-muted/15 select-text",
        className,
      )}
    >
      {showControls && status === "rendered" ? (
        <div className="absolute right-2 top-2 z-10 flex items-center gap-1 rounded-md border border-border/40 bg-background/80 p-0.5 backdrop-blur-xs shadow-xs">
          <button
            type="button"
            onClick={handleZoomIn}
            title="Zoom In"
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer transition-colors"
          >
            <ZoomIn className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={handleZoomOut}
            title="Zoom Out"
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer transition-colors"
          >
            <ZoomOut className="size-3.5" />
          </button>
          {zoom !== 1 ? (
            <button
              type="button"
              onClick={handleResetZoom}
              title="Reset Zoom"
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer transition-colors"
            >
              <RotateCcw className="size-3.5" />
            </button>
          ) : null}
        </div>
      ) : null}

      {status === "loading" && !svg ? (
        <div className="flex min-h-[140px] items-center justify-center gap-2 p-6 text-[11px] text-muted-foreground">
          <Loader2 className="size-4 animate-spin text-orange-500" />
          <span>{t("diagram_rendering")}</span>
        </div>
      ) : null}

      {status === "error" && !svg ? (
        <div className="flex min-h-[100px] flex-col items-center justify-center gap-1.5 p-4 text-center text-[11px] text-muted-foreground">
          <AlertCircle className="size-4 text-amber-500" />
          <span>{t("diagram_syntax_error")}</span>
          {errorMsg ? (
            <span className="font-mono text-[10px] text-muted-foreground/60 max-w-sm truncate">
              {errorMsg}
            </span>
          ) : null}
        </div>
      ) : null}

      {cleanSvg ? (
        <div
          className={cn(
            "w-full transition-transform duration-150",
            fitCanvas
              ? "h-full flex-1 overflow-auto p-4 flex items-center justify-center"
              : "overflow-x-auto overflow-y-auto p-3",
          )}
          style={{ minHeight: fitCanvas ? 240 : 120 }}
        >
          <div
            className={cn(
              "flex justify-center transition-transform duration-100 ease-out",
              fitCanvas
                ? "w-full max-w-full [&_svg]:max-w-full [&_svg]:max-h-[82vh] [&_svg]:w-auto [&_svg]:h-auto [&_svg]:mx-auto"
                : "[&_svg]:max-w-full [&_svg]:h-auto",
            )}
            style={{
              transform: zoom !== 1 ? `scale(${zoom})` : undefined,
              transformOrigin: fitCanvas ? "center center" : "center top",
            }}
            dangerouslySetInnerHTML={{ __html: cleanSvg }}
          />
        </div>
      ) : null}
    </div>
  );
}
