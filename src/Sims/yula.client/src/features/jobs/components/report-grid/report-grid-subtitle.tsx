"use client";

import * as React from "react";
import { Spinner } from "@/components/ui/spinner";
import { TriangleAlert } from "lucide-react";
import { formatCount } from "@/utils/format";

export interface ReportGridSubtitleProps {
  isSavingDisk: boolean;
  isStreaming: boolean;
  isPartial: boolean;
  isFromCache: boolean;
  displayRowsCount: number;
  streamedRows: number;
  expectedTotalRows?: number | null;
  progressPercent?: number | null;
  totalRows: number;
  totalFiltered?: number;
  hasActiveFilters: boolean;
  effectiveColumnsCount: number;
  partialMemoryTitle: string;
}

export function renderReportGridSubtitle({
  isSavingDisk,
  isStreaming,
  isPartial,
  isFromCache,
  displayRowsCount,
  streamedRows,
  expectedTotalRows,
  progressPercent,
  totalRows,
  totalFiltered,
  hasActiveFilters,
  effectiveColumnsCount,
  partialMemoryTitle,
}: ReportGridSubtitleProps): React.ReactNode {
  const countDisplay =
    hasActiveFilters && totalRows > 0 ? (
      <span className="tabular-nums">
        {formatCount(totalFiltered)} / {formatCount(totalRows)} (filtered)
      </span>
    ) : totalRows > 0 ? (
      <span className="tabular-nums">
        {formatCount(totalRows)} row{totalRows === 1 ? "" : "s"}
      </span>
    ) : (
      <span className="tabular-nums">
        {formatCount(displayRowsCount)} row{displayRowsCount === 1 ? "" : "s"}
      </span>
    );

  const streamingSubtitle = isSavingDisk ? (
    <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground tabular-nums">
      <Spinner className="size-3" />
      <span>Saving report…</span>
    </span>
  ) : isStreaming && displayRowsCount > 0 ? (
    <span className="text-[11px] text-muted-foreground tabular-nums">
      {isFromCache ? "Streaming (local cache)" : "Streaming"}: {formatCount(streamedRows)}
      {expectedTotalRows ? ` / ${formatCount(expectedTotalRows)}` : ""} rows…
      {progressPercent != null ? ` (${progressPercent}%)` : ""}
    </span>
  ) : null;

  const partialSubtitle =
    !isStreaming && !isSavingDisk && isPartial ? (
      <span
        className="flex items-center gap-1.5 text-[11px] font-medium text-amber-600 tabular-nums dark:text-amber-400"
        title={partialMemoryTitle}
      >
        <TriangleAlert className="size-3 shrink-0" />
        Partial: {formatCount(totalRows)}
        {expectedTotalRows ? ` / ${formatCount(expectedTotalRows)}` : ""} rows
      </span>
    ) : null;

  return (
    streamingSubtitle ??
    partialSubtitle ??
    (isStreaming || isSavingDisk || effectiveColumnsCount === 0 ? null : countDisplay)
  );
}
