"use client";

import * as React from "react";
import { cn } from "@/utils/cn";
import { getSvgDimensions } from "./mermaid-utils";

export interface MermaidMinimapProps {
  svgContent: string;
  zoom: number;
  pan: { x: number; y: number };
  containerWidth: number;
  containerHeight: number;
  onPanChange: (pan: { x: number; y: number }) => void;
  className?: string;
}

const MINIMAP_WIDTH = 130;
const MINIMAP_HEIGHT = 80;

/**
 * Interactive MiniMap overview for Mermaid diagrams.
 * Renders a scaled preview and a draggable viewport indicator box.
 */
export function MermaidMinimap({
  svgContent,
  zoom,
  pan,
  containerWidth,
  containerHeight,
  onPanChange,
  className,
}: MermaidMinimapProps) {
  const mapRef = React.useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = React.useState(false);

  const dimensions = React.useMemo(() => getSvgDimensions(svgContent), [svgContent]);

  // Compute scale to fit entire SVG inside Minimap
  const scale = React.useMemo(() => {
    const scaleX = MINIMAP_WIDTH / dimensions.width;
    const scaleY = MINIMAP_HEIGHT / dimensions.height;
    return Math.min(scaleX, scaleY, 0.25);
  }, [dimensions]);

  const mapW = dimensions.width * scale;
  const mapH = dimensions.height * scale;

  // Viewport box in canvas space:
  // x: -pan.x / zoom, y: -pan.y / zoom, w: containerWidth / zoom, h: containerHeight / zoom
  const vpBox = React.useMemo(() => {
    if (zoom <= 0) return { x: 0, y: 0, w: mapW, h: mapH };
    const cvsX = -pan.x / zoom;
    const cvsY = -pan.y / zoom;
    const cvsW = containerWidth / zoom;
    const cvsH = containerHeight / zoom;

    const x = Math.max(0, Math.min(cvsX * scale, mapW));
    const y = Math.max(0, Math.min(cvsY * scale, mapH));
    const w = Math.min(Math.max(cvsW * scale, 12), mapW);
    const h = Math.min(Math.max(cvsH * scale, 12), mapH);

    return { x, y, w, h };
  }, [pan, zoom, containerWidth, containerHeight, scale, mapW, mapH]);

  // Navigate on click/drag
  const handleNav = React.useCallback(
    (clientX: number, clientY: number) => {
      if (!mapRef.current) return;
      const rect = mapRef.current.getBoundingClientRect();
      const clickX = clientX - rect.left;
      const clickY = clientY - rect.top;

      // Invert back to canvas coordinate
      const cvsX = clickX / scale;
      const cvsY = clickY / scale;

      // Center the viewport on clicked canvas point
      const newPanX = Math.round(containerWidth / 2 - cvsX * zoom);
      const newPanY = Math.round(containerHeight / 2 - cvsY * zoom);
      onPanChange({ x: newPanX, y: newPanY });
    },
    [scale, containerWidth, containerHeight, zoom, onPanChange],
  );

  const handleMouseDown = React.useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(true);
      handleNav(e.clientX, e.clientY);
    },
    [handleNav],
  );

  React.useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      handleNav(e.clientX, e.clientY);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, handleNav]);

  return (
    <div
      ref={mapRef}
      onMouseDown={handleMouseDown}
      title="Mini Harita (Tıklayın veya Sürükleyin)"
      className={cn(
        "relative rounded-md border border-border/70 bg-card/90 shadow-md backdrop-blur-xs select-none cursor-crosshair overflow-hidden",
        className,
      )}
      style={{ width: MINIMAP_WIDTH, height: MINIMAP_HEIGHT }}
    >
      {/* Scaled Background Preview of the SVG */}
      <div
        className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-30 dark:opacity-40"
        style={{
          transform: `scale(${scale})`,
          transformOrigin: "top left",
          width: dimensions.width,
          height: dimensions.height,
        }}
        dangerouslySetInnerHTML={{ __html: svgContent }}
      />

      {/* Viewport Box Indicator */}
      <div
        className={cn(
          "absolute pointer-events-none rounded-xs border-2 border-orange-500 bg-orange-500/20 transition-all",
          isDragging ? "duration-0" : "duration-75",
        )}
        style={{
          left: `${vpBox.x}px`,
          top: `${vpBox.y}px`,
          width: `${vpBox.w}px`,
          height: `${vpBox.h}px`,
        }}
      />
    </div>
  );
}
