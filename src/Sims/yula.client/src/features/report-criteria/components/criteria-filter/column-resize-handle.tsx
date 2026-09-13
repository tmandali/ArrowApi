"use client";

import * as React from "react";
import { cn } from "@/utils/cn";
import { MIN_COL_WIDTHS, type ResizableColKey } from "./criteria-grid-layout";

export function ColumnResizeHandle({
  column,
  onResize,
  onResizeEnd,
}: {
  column: ResizableColKey;
  onResize: (column: ResizableColKey, deltaX: number) => void;
  onResizeEnd?: () => void;
}) {
  const startXRef = React.useRef(0);
  const [dragging, setDragging] = React.useState(false);

  return (
    <span
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize ${column} column`}
      aria-valuemin={MIN_COL_WIDTHS[column]}
      className={cn(
        "absolute inset-y-0 -right-1 z-10 w-2 cursor-col-resize touch-none select-none",
        "after:absolute after:inset-y-0 after:left-1/2 after:w-px after:-translate-x-1/2 after:bg-transparent",
        "hover:after:bg-primary/40 active:after:bg-primary/60",
        dragging && "after:bg-primary/60"
      )}
      onPointerDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
        startXRef.current = event.clientX;
        setDragging(true);
        const target = event.currentTarget;
        target.setPointerCapture(event.pointerId);
        const previousCursor = document.body.style.cursor;
        const previousUserSelect = document.body.style.userSelect;
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";

        const onMove = (moveEvent: PointerEvent) => {
          onResize(column, moveEvent.clientX - startXRef.current);
          startXRef.current = moveEvent.clientX;
        };
        const onUp = (upEvent: PointerEvent) => {
          setDragging(false);
          document.body.style.cursor = previousCursor;
          document.body.style.userSelect = previousUserSelect;
          target.releasePointerCapture(upEvent.pointerId);
          target.removeEventListener("pointermove", onMove);
          target.removeEventListener("pointerup", onUp);
          target.removeEventListener("pointercancel", onUp);
          onResizeEnd?.();
        };
        target.addEventListener("pointermove", onMove);
        target.addEventListener("pointerup", onUp);
        target.addEventListener("pointercancel", onUp);
      }}
    />
  );
}
