import * as React from "react";
import { formatTotalDuration, type RunEventItem } from "@/features/jobs/run-events";
import { formatCount } from "@/utils/format";
import type { ArrowJobStatus } from "../../types";
import { formatWhen } from "./execution-helpers";
import type { DetailLine } from "./execution-detail-pane";

export interface ExecutionLabels {
  status: string;
  owner: string;
  created: string;
  completed: string;
  duration: string;
  results: string;
  error: string;
  rowsPlural: string;
}

export interface UseExecutionDetailLinesOptions {
  selectedJob: ArrowJobStatus | null;
  isActiveSelected: boolean;
  selectedDisplayStatus?: string;
  isTerminal: boolean;
  historyEvents: RunEventItem[];
  hasHubEvents: boolean;
  hubEvents: RunEventItem[];
  activeRunEvents: RunEventItem[];
  liveCounts?: { totalRows?: number | null; batchCount?: number | null } | null;
  ownerLabel: string;
  labels: ExecutionLabels;
}

export function useExecutionDetailLines({
  selectedJob,
  isActiveSelected,
  selectedDisplayStatus,
  isTerminal,
  historyEvents,
  hasHubEvents,
  hubEvents,
  activeRunEvents,
  liveCounts,
  ownerLabel,
  labels,
}: UseExecutionDetailLinesOptions) {
  const rawProgressEvents = React.useMemo(
    () =>
      isTerminal && historyEvents.length > 0
        ? historyEvents
        : hasHubEvents
          ? hubEvents
          : isActiveSelected && activeRunEvents.length > 0
            ? activeRunEvents
            : historyEvents,
    [isTerminal, historyEvents, hasHubEvents, hubEvents, isActiveSelected, activeRunEvents]
  );

  const progressEvents = React.useMemo(() => {
    if (
      !isTerminal ||
      !selectedJob ||
      typeof selectedJob.totalRows !== "number" ||
      selectedJob.totalRows <= 0
    ) {
      return rawProgressEvents;
    }
    const targetRows = selectedJob.totalRows;
    const hasProgress = rawProgressEvents.some((e) => e.eventName === "progress");
    if (!hasProgress) return rawProgressEvents;

    return rawProgressEvents.map((e) => {
      if (
        e.eventName === "progress" &&
        (e.totalRows == null || e.totalRows < targetRows)
      ) {
        return {
          ...e,
          detail: `${formatCount(targetRows)} ${labels.rowsPlural}`,
          totalRows: targetRows,
          batchCount: selectedJob.batchCount ?? e.batchCount,
        };
      }
      if (
        e.eventName === "cancelled" &&
        (e.totalRows == null || e.totalRows < targetRows)
      ) {
        return {
          ...e,
          detail: `${formatCount(targetRows)} rows · stopped`,
          totalRows: targetRows,
          batchCount: selectedJob.batchCount ?? e.batchCount,
        };
      }
      if (
        e.eventName === "completed" &&
        (e.totalRows == null || e.totalRows < targetRows)
      ) {
        return {
          ...e,
          detail: `${formatCount(targetRows)} rows ready`,
          totalRows: targetRows,
          batchCount: selectedJob.batchCount ?? e.batchCount,
        };
      }
      return e;
    });
  }, [rawProgressEvents, selectedJob, isTerminal, labels.rowsPlural]);

  const detailLines: DetailLine[] = React.useMemo(() => {
    if (!selectedJob && !isActiveSelected) {
      return [{ label: labels.status, value: "—" }];
    }
    const duration = formatTotalDuration({
      createdAt: selectedJob?.createdAt,
      completedAt: selectedJob?.completedAt,
      status: selectedDisplayStatus,
      steps: progressEvents,
    });
    const lines: DetailLine[] = [
      { label: labels.status, value: selectedDisplayStatus ?? "—" },
      { label: labels.owner, value: ownerLabel },
      { label: labels.created, value: formatWhen(selectedJob?.createdAt) },
      { label: labels.completed, value: formatWhen(selectedJob?.completedAt) },
      { label: labels.duration, value: duration ?? "—" },
      {
        label: labels.results,
        value: (() => {
          const batches =
            isTerminal && selectedJob?.batchCount != null
              ? selectedJob.batchCount
              : liveCounts?.batchCount != null
                ? liveCounts.batchCount
                : selectedJob?.batchCount ?? null;
          const rows =
            isTerminal && selectedJob?.totalRows != null
              ? selectedJob.totalRows
              : liveCounts?.totalRows != null
                ? liveCounts.totalRows
                : selectedJob?.totalRows ?? null;
          if (batches == null && rows == null) return "—";
          return `${batches != null ? formatCount(batches) : "?"}/${rows != null ? formatCount(rows) : "?"}`;
        })(),
      },
    ];
    if (selectedJob?.error) {
      lines.push({ label: labels.error, value: selectedJob.error });
    }
    return lines;
  }, [
    selectedJob,
    ownerLabel,
    selectedDisplayStatus,
    isTerminal,
    isActiveSelected,
    liveCounts,
    progressEvents,
    labels,
  ]);

  return {
    progressEvents,
    detailLines,
  };
}
