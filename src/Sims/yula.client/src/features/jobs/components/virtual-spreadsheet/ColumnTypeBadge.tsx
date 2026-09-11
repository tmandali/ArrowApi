"use client";

import * as React from "react"
import { useTranslations } from "next-intl"
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
  const t = useTranslations("GridColumns")
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
  const pinnedSuffix = isPinned ? t("pinned_suffix") : ""
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
        title={t("type_date", { detail: detailedType, pinned: pinnedSuffix })}
      >
        <Calendar className="size-2.5" />
      </span>
    )
  }

  if (kind === "number") {
    return (
      <span
        className={badgeBaseClass}
        title={t("type_number", { detail: detailedType, pinned: pinnedSuffix })}
      >
        123
      </span>
    )
  }

  if (kind === "bool") {
    return (
      <span
        className={badgeBaseClass}
        title={t("type_boolean", { detail: detailedType, pinned: pinnedSuffix })}
      >
        bool
      </span>
    )
  }

  return (
    <span
      className={badgeBaseClass}
      title={t("type_text", { detail: detailedType, pinned: pinnedSuffix })}
    >
      Aa
    </span>
  )
}
