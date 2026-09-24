"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import {
  AlertCircle,
  Check,
  Code,
  Copy,
  Eye,
  Loader2,
  Map,
  RotateCcw,
  Scan,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useTheme } from "@/context/theme-context";
import { cn } from "@/utils/cn";
import { copyToClipboard } from "@/lib/clipboard";
import { MermaidMinimap } from "./mermaid-minimap";
import { DARK_THEME_VARS, LIGHT_THEME_VARS, getSvgDimensions } from "./mermaid-utils";

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
  const [pan, setPan] = React.useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isSpacePressed, setIsSpacePressed] = React.useState(false);
  const [isDragging, setIsDragging] = React.useState(false);
  const [showMinimap, setShowMinimap] = React.useState(fitCanvas);
  const [showCode, setShowCode] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [containerSize, setContainerSize] = React.useState({ width: 600, height: 350 });

  const containerRef = React.useRef<HTMLDivElement>(null);
  const isHoveredRef = React.useRef(false);
  const isSpacePressedRef = React.useRef(false);
  const hasFittedRef = React.useRef(false);
  const zoomRef = React.useRef(zoom);
  const panRef = React.useRef(pan);

  React.useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  React.useEffect(() => {
    panRef.current = pan;
  }, [pan]);

  const dragStartRef = React.useRef<{
    startX: number;
    startY: number;
    panX: number;
    panY: number;
  } | null>(null);

  React.useEffect(() => {
    isSpacePressedRef.current = isSpacePressed;
  }, [isSpacePressed]);

  const cleanChart = React.useMemo(() => chart.trim(), [chart]);
  const cleanSvg = React.useMemo(() => {
    if (!svg) return "";
    return svg.replace(/max-width:\s*[^;"]+;?/i, "");
  }, [svg]);
  const dimensions = React.useMemo(() => getSvgDimensions(cleanSvg), [cleanSvg]);

  // Fit diagram into viewport
  const handleFitView = React.useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const svgW = dimensions.width;
    const svgH = dimensions.height;
    const pad = fitCanvas ? 48 : 24;
    const scaleX = (rect.width - pad) / svgW;
    const scaleY = (rect.height - pad) / svgH;
    const fitZ = Math.min(Math.max(Math.min(scaleX, scaleY), 0.15), 2.5);

    const fitPanX = Math.round((rect.width - svgW * fitZ) / 2);
    const fitPanY = Math.round((rect.height - svgH * fitZ) / 2);

    const nextZ = Number(fitZ.toFixed(2));
    const nextPan = { x: fitPanX, y: fitPanY };
    zoomRef.current = nextZ;
    panRef.current = nextPan;
    setZoom(nextZ);
    setPan(nextPan);
  }, [dimensions, fitCanvas]);

  // Track container dimensions with ResizeObserver and auto-fit on valid size
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry?.contentRect) {
        const w = Math.round(entry.contentRect.width);
        const h = Math.round(entry.contentRect.height);
        if (w > 30 && h > 30) {
          setContainerSize({ width: w, height: h });
          if (!hasFittedRef.current && status === "rendered") {
            hasFittedRef.current = true;
            handleFitView();
          }
        }
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [status, handleFitView]);

  // Global keydown / keyup to track Space key, 'F' (Fit), 'M' (Minimap)
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const active = document.activeElement;
      const isInput =
        active &&
        (active.tagName === "INPUT" ||
          active.tagName === "TEXTAREA" ||
          active.getAttribute("contenteditable") === "true");
      if (isInput) return;

      if (isHoveredRef.current) {
        if (e.code === "KeyF" || e.key === "f" || e.key === "F") {
          e.preventDefault();
          handleFitView();
          return;
        }
        if (e.code === "KeyM" || e.key === "m" || e.key === "M") {
          e.preventDefault();
          setShowMinimap((prev) => !prev);
          return;
        }
      }

      if (e.code === "Space" || e.key === " ") {
        if (isHoveredRef.current) e.preventDefault();
        setIsSpacePressed(true);
      }
    };

    const handleRelease = () => {
      setIsSpacePressed(false);
      setIsDragging(false);
      dragStartRef.current = null;
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.key === " ") handleRelease();
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleRelease);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleRelease);
    };
  }, [handleFitView]);

  // Wheel zoom towards cursor position
  React.useEffect(() => {
    const container = containerRef.current;
    if (!container || !cleanSvg || showCode) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const currentZ = zoomRef.current;
      const currentP = panRef.current;
      const factor = e.deltaY < 0 ? 1.15 : 0.87;
      const nextZ = Math.min(Math.max(Number((currentZ * factor).toFixed(2)), 0.15), 4.0);
      const ratio = nextZ / currentZ;

      const nextPan = {
        x: Math.round(mouseX - (mouseX - currentP.x) * ratio),
        y: Math.round(mouseY - (mouseY - currentP.y) * ratio),
      };

      zoomRef.current = nextZ;
      panRef.current = nextPan;
      setZoom(nextZ);
      setPan(nextPan);
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, [cleanSvg, showCode, status]);

  // Mouse pan: Space + Left Click OR Middle Click (standard CAD / Design tools)
  const handleMouseDown = React.useCallback(
    (e: React.MouseEvent) => {
      const isMiddle = e.button === 1;
      const isSpace = isSpacePressedRef.current && e.button === 0;
      if (!isMiddle && !isSpace) return;
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(true);
      dragStartRef.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y };
    },
    [pan],
  );

  React.useEffect(() => {
    if (!isDragging) return;
    const handleMouseMove = (e: MouseEvent) => {
      if (!dragStartRef.current) return;
      const nextPan = {
        x: Math.round(dragStartRef.current.panX + (e.clientX - dragStartRef.current.startX)),
        y: Math.round(dragStartRef.current.panY + (e.clientY - dragStartRef.current.startY)),
      };
      panRef.current = nextPan;
      setPan(nextPan);
    };
    const handleMouseUp = () => { setIsDragging(false); dragStartRef.current = null; };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging]);

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
          themeVariables: isDark ? DARK_THEME_VARS : LIGHT_THEME_VARS,
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

  // Auto-fit on initial render and after sheet open transition
  React.useEffect(() => {
    if (status === "rendered") {
      hasFittedRef.current = false;
      const t1 = setTimeout(() => handleFitView(), 50);
      const t2 = setTimeout(() => handleFitView(), 200);
      const t3 = setTimeout(() => handleFitView(), 380);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
      };
    }
  }, [status, handleFitView]);

  const handleZoomIn = React.useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setZoom((z) => Math.min(Number((z + 0.2).toFixed(2)), 4.0));
  }, []);

  const handleZoomOut = React.useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setZoom((z) => Math.max(Number((z - 0.2).toFixed(2)), 0.2));
  }, []);

  const handleResetZoom = React.useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    handleFitView();
  }, [handleFitView]);

  const handleMinimapPan = React.useCallback((p: { x: number; y: number }) => {
    panRef.current = p;
    setPan(p);
  }, []);

  const handleCopyCode = React.useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    const ok = await copyToClipboard(chart);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [chart]);

  const handleDoubleClick = React.useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    handleFitView();
  }, [handleFitView]);

  return (
    <div
      className={cn(
        "relative my-1 w-full overflow-hidden rounded-md border border-border/40 bg-muted/15 select-text",
        fitCanvas ? "h-full flex-1 flex flex-col my-0 border-0 rounded-none bg-transparent" : "",
        className,
      )}
    >
      {isSpacePressed && !showCode && (
        <div className="pointer-events-none absolute left-2 top-2 z-10 flex items-center gap-1 rounded bg-background/90 px-2 py-0.5 text-[10px] font-medium text-foreground shadow-xs border border-border/60">
          <span>{isDragging ? "Kaydırılıyor..." : "Space: Tuvali Sürükleyin (Pan)"}</span>
        </div>
      )}

      {showControls && status === "rendered" ? (
        <div className="absolute right-2 top-2 z-10 flex items-center gap-1 rounded-md border border-border/40 bg-background/80 p-0.5 backdrop-blur-xs shadow-xs">
          <button type="button" onClick={() => setShowCode((prev) => !prev)} title={showCode ? "Diyagramı Göster" : "Kodu Göster"} className={cn("rounded p-1 cursor-pointer transition-colors", showCode ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
            {showCode ? <Eye className="size-3.5" /> : <Code className="size-3.5" />}
          </button>
          <button type="button" onClick={handleCopyCode} title="Kodu Kopyala" className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer transition-colors">
            {copied ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
          </button>
          {!showCode && (
            <>
              <button type="button" onClick={handleZoomIn} title="Zoom In" className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer transition-colors">
                <ZoomIn className="size-3.5" />
              </button>
              <button type="button" onClick={handleZoomOut} title="Zoom Out" className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer transition-colors">
                <ZoomOut className="size-3.5" />
              </button>
              <button type="button" onClick={handleFitView} title="Ekrana Sığdır (F / Çift Tık)" className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer transition-colors">
                <Scan className="size-3.5" />
              </button>
              <button type="button" onClick={() => setShowMinimap((prev) => !prev)} title="Mini Harita (M)" className={cn("rounded p-1 cursor-pointer transition-colors", showMinimap ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
                <Map className="size-3.5" />
              </button>
              <button type="button" onClick={handleResetZoom} title="Sıfırla" className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer transition-colors">
                <RotateCcw className="size-3.5" />
              </button>
            </>
          )}
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
            <span className="font-mono text-[10px] text-muted-foreground/60 max-w-sm truncate">{errorMsg}</span>
          ) : null}
        </div>
      ) : null}

      {showCode ? (
        <pre className="w-full h-full min-h-[140px] max-h-[72vh] overflow-auto p-4 bg-muted/20 font-mono text-[11px] select-text whitespace-pre text-foreground">
          <code>{cleanChart}</code>
        </pre>
      ) : cleanSvg ? (
        <div
          ref={containerRef}
          onMouseDown={handleMouseDown}
          onDoubleClick={handleDoubleClick}
          onMouseEnter={() => {
            isHoveredRef.current = true;
          }}
          onMouseLeave={() => {
            isHoveredRef.current = false;
          }}
          className={cn(
            "relative w-full overflow-hidden select-none",
            fitCanvas ? "h-full flex-1 min-h-[300px]" : "h-[320px]",
            isSpacePressed && (isDragging ? "cursor-grabbing" : "cursor-grab"),
          )}
        >
          <div
            className={cn(
              "absolute top-0 left-0",
              isDragging ? "transition-none" : "transition-transform duration-75 ease-out",
              "[&_svg]:w-full [&_svg]:h-full [&_svg]:max-w-none [&_svg]:max-h-none [&_svg]:block",
            )}
            style={{
              width: `${dimensions.width}px`,
              height: `${dimensions.height}px`,
              transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
              transformOrigin: "top left",
            }}
            dangerouslySetInnerHTML={{ __html: cleanSvg }}
          />

          {showMinimap && cleanSvg && status === "rendered" ? (
            <div className="absolute bottom-2 right-2 z-20 animate-in fade-in duration-150">
              <MermaidMinimap
                svgContent={cleanSvg}
                zoom={zoom}
                pan={pan}
                containerWidth={containerSize.width}
                containerHeight={containerSize.height}
                onPanChange={handleMinimapPan}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
