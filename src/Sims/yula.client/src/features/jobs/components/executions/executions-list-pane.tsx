"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { Copy, History, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  panelCardClass,
  panelHeaderClass,
  panelHeaderIconClass,
  panelHeaderSubtitleClass,
  panelHeaderTitleClass,
} from "@/components/layout/panel-chrome";
import { formatTotalDuration } from "@/features/jobs/run-events";
import type { ArrowJobStatus } from "../../types";
import { cn } from "@/utils/cn";
import { formatCount } from "@/utils/format";
import { formatWhen, sameJobId } from "./execution-helpers";
import { ExecutionStatusMark } from "./execution-status-mark";

/** Sol kolon: executions listesi (başlık + yenile + satırlar). */
export function ExecutionsListPane({
  total,
  emptyListHint,
  loading,
  refreshing,
  displayItems,
  selectedId,
  selectedItemRef,
  onSelect,
  onOpenJob,
  onDeleteRequest,
  onRefresh,
  onCopyId,
}: {
  total: number;
  emptyListHint: string;
  loading: boolean;
  refreshing: boolean;
  displayItems: ArrowJobStatus[];
  selectedId: string | null;
  selectedItemRef: React.RefObject<HTMLButtonElement | null>;
  onSelect: (jobId: string, job: ArrowJobStatus) => void;
  onOpenJob?: (jobId: string) => void;
  onDeleteRequest: (jobId: string) => void;
  onRefresh: () => void;
  onCopyId: (jobId: string) => void;
}) {
  const t = useTranslations("JobExecutions");

  return (
    <section className={cn(panelCardClass, "h-full")}>
      <div className={panelHeaderClass}>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <History className={panelHeaderIconClass} aria-hidden />
            <span className={panelHeaderTitleClass}>{t("executions")}</span>
          </div>
          <span className={panelHeaderSubtitleClass}>
            {total > 0
              ? `${formatCount(total)} ${t("run_plural", { count: total })}`
              : emptyListHint}
          </span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 shrink-0"
          disabled={loading || refreshing}
          onClick={onRefresh}
          title={t("refresh")}
          aria-label={t("refresh")}
        >
          <RefreshCw className={cn("size-3.5", (loading || refreshing) && "animate-spin")} />
        </Button>
      </div>

      <ScrollArea className="h-0 min-h-0 w-full flex-1">
        {loading && displayItems.length === 0 ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin text-primary/60" />
            Loading…
          </div>
        ) : displayItems.length === 0 ? (
          <div className="flex h-full min-h-[12rem] items-center justify-center p-4">
            <Empty className="border-0 p-4">
              <EmptyHeader>
                <EmptyMedia
                  variant="icon"
                  className="bg-orange-500/10 text-orange-600 dark:text-orange-400"
                >
                  <History className="size-4" />
                </EmptyMedia>
                <EmptyTitle>{t("no_executions_yet")}</EmptyTitle>
                <EmptyDescription>
                  {t("run_a_report_to_see_here")}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </div>
        ) : (
          <ul className="divide-y divide-border/60 border-b border-border/60">
            {displayItems.map((job) => {
              const selected = sameJobId(selectedId, job.id);
              return (
                <li key={job.id} className="group w-full">
                  <button
                    ref={selected ? selectedItemRef : undefined}
                    type="button"
                    aria-current={selected ? "true" : undefined}
                    onClick={() => {
                      onSelect(job.id, job);
                    }}
                    onDoubleClick={() => onOpenJob?.(job.id)}
                    className={cn(
                      "flex w-full flex-col gap-1 px-4 py-2.5 text-left transition-colors hover:bg-muted/80",
                      selected && "bg-primary/[0.07] hover:bg-primary/10 dark:bg-primary/15"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-1">
                        <span
                          className="min-w-0 truncate font-mono text-xs"
                          title={job.id}
                        >
                          {job.id}
                        </span>
                        <span
                          role="button"
                          tabIndex={-1}
                          title={t("copy_guid")}
                          aria-label={t("copy_guid")}
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            onCopyId(job.id);
                          }}
                          className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-muted hover:text-foreground focus-visible:opacity-100"
                        >
                          <Copy className="size-3" />
                        </span>
                      </div>
                      <span
                        className="flex size-5 shrink-0 items-center justify-center"
                        title={
                          {
                            Running: t("status_running"),
                            Queued: t("status_queued"),
                            Completed: t("status_completed"),
                            Failed: t("status_failed"),
                            Cancelled: t("status_cancelled"),
                            Canceled: t("status_cancelled"),
                          }[job.status] ?? job.status
                        }
                      >
                        <ExecutionStatusMark
                          status={job.status}
                          t={t}
                          onDelete={() => onDeleteRequest(job.id)}
                        />
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span className="min-w-0 truncate">
                          {formatWhen(job.createdAt)}
                        </span>
                        <span className="opacity-50">·</span>
                        <span
                          className="shrink-0 tabular-nums"
                          title={t("duration")}
                        >
                          {formatTotalDuration({
                            createdAt: job.createdAt,
                            completedAt: job.completedAt,
                            status: job.status,
                          }) ?? "—"}
                        </span>
                      </div>
                      <span className="shrink-0">
                        {job.totalRows != null
                          ? `${formatCount(job.totalRows)} ${t("rows_plural", { count: job.totalRows })}`
                          : "—"}
                      </span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </ScrollArea>
    </section>
  );
}
