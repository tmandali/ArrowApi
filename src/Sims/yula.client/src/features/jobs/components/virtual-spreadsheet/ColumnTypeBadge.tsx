import * as React from "react"
import { Calendar } from "lucide-react"
import { cn } from "@/utils/cn"
import type { SpreadsheetColumn } from "./types"

export interface ColumnTypeBadgeProps {
  col: SpreadsheetColumn
  isPinned?: boolean
  className?: string
}

/**
 * Kolonun veri tipini (Sayı, Tarih, Mantıksal, Metin) temsil eden kompakt rozet.
 */
export function ColumnTypeBadge({
  col,
  isPinned = false,
  className,
}: ColumnTypeBadgeProps) {
  const duck = (col.duckType || "").toUpperCase()
  let kind = col.kind

  if (!kind) {
    if (duck.includes("DATE") || duck.includes("TIME")) {
      kind = "date"
    } else if (duck.includes("BOOL")) {
      kind = "bool"
    } else if (
      duck.includes("INT") ||
      duck.includes("FLOAT") ||
      duck.includes("DOUBLE") ||
      duck.includes("DECIMAL") ||
      duck.includes("NUMERIC") ||
      duck.includes("REAL") ||
      col.align === "right"
    ) {
      kind = "number"
    } else {
      kind = "text"
    }
  }

  const detailedType = col.duckType ? ` (${col.duckType})` : ""
  const badgeBaseClass = cn(
    "inline-flex items-center justify-center rounded px-1.5 py-0.5 text-[9px] font-mono select-none transition-colors",
    isPinned
      ? "bg-primary/15 text-primary font-semibold border border-primary/30"
      : "bg-muted/80 text-muted-foreground/80 font-medium",
    className
  )

  if (kind === "date") {
    return (
      <span
        className={cn(badgeBaseClass, "gap-0.5")}
        title={`Veri Tipi: Tarih${detailedType}${isPinned ? " (Sabitlendi)" : ""}`}
      >
        <Calendar className="size-2.5" />
      </span>
    )
  }

  if (kind === "number") {
    return (
      <span
        className={badgeBaseClass}
        title={`Veri Tipi: Sayı / Tutar${detailedType}${isPinned ? " (Sabitlendi)" : ""}`}
      >
        123
      </span>
    )
  }

  if (kind === "bool") {
    return (
      <span
        className={badgeBaseClass}
        title={`Veri Tipi: Mantıksal${detailedType}${isPinned ? " (Sabitlendi)" : ""}`}
      >
        bool
      </span>
    )
  }

  return (
    <span
      className={badgeBaseClass}
      title={`Veri Tipi: Metin${detailedType}${isPinned ? " (Sabitlendi)" : ""}`}
    >
      Aa
    </span>
  )
}
