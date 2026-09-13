"use client";

import * as React from "react";
import {
  PHONE_VIEWPORT_MAX_REM,
  resolveGridLayout,
  viewportPx,
  widthsForLayout,
  DEFAULT_COL_WIDTHS,
  type ColWidths,
  type CriteriaGridLayout,
  type ResizableColKey,
} from "./criteria-grid-layout";
import { availableNameValueWidth, MIN_COL_WIDTHS } from "./criteria-grid-layout";

/**
 * Grid yerleşimi: viewport gözetimi + kolon genişlikleri + sürükle-büyüt.
 */
export function useGridLayout(tableRef: React.RefObject<HTMLDivElement | null>) {
  const [colWidths, setColWidths] = React.useState<ColWidths>(DEFAULT_COL_WIDTHS);
  const [layout, setLayout] = React.useState<CriteriaGridLayout>("columns");

  const descriptionColumnVisible = layout === "columns-with-description";
  const stackedLayout = layout === "stacked";
  const layoutRef = React.useRef(layout);
  const colWidthsRef = React.useRef(colWidths);
  // En-güncel-değer ref'leri: yazım effect'te yapılır (render'da ref erişimi
  // yok). Bu effect'ler aşağıdaki layout effect'inden ÖNCE deklare edildiği
  // için aynı commit içinde taze değer garantidir.
  React.useEffect(() => {
    layoutRef.current = layout;
  });
  React.useEffect(() => {
    colWidthsRef.current = colWidths;
  });

  React.useEffect(() => {
    const el = tableRef.current;
    if (!el) return;

    const update = () => {
      const tableWidth = el.clientWidth;
      if (tableWidth <= 0) return;
      const widths = colWidthsRef.current;
      const nextLayout = resolveGridLayout(
        tableWidth,
        widths,
        layoutRef.current
      );
      setLayout((prev) => (prev === nextLayout ? prev : nextLayout));
      setColWidths((prev) => {
        const next = widthsForLayout(nextLayout, tableWidth, prev);
        if (prev.name === next.name && prev.value === next.value) return prev;
        return next;
      });
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    const phoneMedia = window.matchMedia(
      `(max-width: ${viewportPx(PHONE_VIEWPORT_MAX_REM)}px)`
    );
    phoneMedia.addEventListener("change", update);
    return () => {
      observer.disconnect();
      phoneMedia.removeEventListener("change", update);
    };
  }, [tableRef]);

  const resizeColumn = React.useCallback(
    (column: ResizableColKey, deltaX: number) => {
      if (deltaX === 0) return;

      const tableWidth = tableRef.current?.clientWidth ?? 0;
      if (tableWidth <= 0) return;
      if (resolveGridLayout(tableWidth, colWidthsRef.current, layoutRef.current) ===
        "stacked") {
        return;
      }

      const available = availableNameValueWidth(tableWidth);
      const prev = colWidthsRef.current;
      let nextName = prev.name;

      if (column === "name") {
        nextName = prev.name + deltaX;
      } else {
        // Growing Value shrinks Name (Value is the remainder column).
        nextName = prev.name - deltaX;
      }

      nextName = Math.min(
        Math.max(MIN_COL_WIDTHS.name, nextName),
        available - MIN_COL_WIDTHS.value
      );
      setColWidths({ name: nextName, value: available - nextName });
    },
    [tableRef]
  );

  return {
    layout,
    colWidths,
    stackedLayout,
    descriptionColumnVisible,
    resizeColumn,
  };
}
