"use client";

import { useTranslations } from "next-intl";
import { ChevronRight, Copy, FileText, Filter } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CodeBlock } from "@/components/ui/code-block";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Marker, MarkerContent } from "@/components/ui/marker";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  panelCardClass,
  panelHeaderClass,
  panelHeaderIconClass,
  panelHeaderSubtitleClass,
  panelHeaderTitleClass,
} from "@/components/layout/panel-chrome";
import { statusTone } from "@/features/jobs/lib/status-tone";
import type { RunEventItem } from "@/features/jobs/run-events";
import type { OpfsJobParquetDetail } from "@/services/opfs/opfs-cache";
import { RunProgressSteps } from "../RunProgressSteps";
import { cn } from "@/utils/cn";
import { formatBytes } from "@/utils/format";
import { formatWhen } from "./execution-helpers";

export type DetailLine = { label: string; value: string };

/** Sağ kolon: criteria slot / detay görünümü. */
export function ExecutionDetailPane({
  criteriaVisible,
  detailSlot,
  detailSlotTitle,
  detailSlotActions,
  selectedId,
  selectedDisplayStatus,
  detailLoading,
  detailLines,
  opfsDetail,
  showProgress,
  progressEvents,
  progressPhase,
  running,
  progressLoading,
  inputJson,
  onCopyUrl,
  onCopyText,
}: {
  criteriaVisible: boolean;
  detailSlot?: React.ReactNode;
  detailSlotTitle: string;
  detailSlotActions?: React.ReactNode;
  selectedId: string | null;
  selectedDisplayStatus: string;
  detailLoading: boolean;
  detailLines: DetailLine[];
  opfsDetail: OpfsJobParquetDetail | null;
  showProgress: boolean;
  progressEvents: RunEventItem[];
  progressPhase: "idle" | "running" | "done" | "cancelled";
  running: boolean;
  progressLoading: boolean;
  inputJson: string;
  onCopyUrl: () => void;
  onCopyText: (value: string) => void;
}) {
  const t = useTranslations("JobExecutions");

  const statusLabels: Record<string, string> = {
    Running: t("status_running"),
    Queued: t("status_queued"),
    Completed: t("status_completed"),
    Failed: t("status_failed"),
    Cancelled: t("status_cancelled"),
    Canceled: t("status_cancelled"),
  };

  if (criteriaVisible) {
    return (
      <section className={cn(panelCardClass, "h-full min-w-0")}>
        <div className={panelHeaderClass}>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div className="flex min-w-0 items-center gap-1.5">
              <Filter className={panelHeaderIconClass} aria-hidden />
              <span className={panelHeaderTitleClass}>{detailSlotTitle || t("criteria")}</span>
            </div>
          </div>
          {detailSlotActions ? (
            <div className="flex shrink-0 items-center gap-1.5 self-center">
              {detailSlotActions}
            </div>
          ) : null}
        </div>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          {detailSlot}
        </div>
      </section>
    );
  }

  return (
    <section className={cn(panelCardClass, "h-full")}>
      <div className={panelHeaderClass}>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <FileText className={panelHeaderIconClass} aria-hidden />
            <span className={panelHeaderTitleClass}>{t("detail")}</span>
          </div>
          {selectedDisplayStatus ? (
            <Badge
              variant={statusTone(selectedDisplayStatus)}
              className="h-5 shrink-0 px-1.5 text-[10px]"
            >
              {statusLabels[selectedDisplayStatus] ?? selectedDisplayStatus}
            </Badge>
          ) : null}
          <div className="flex min-w-0 items-center gap-1">
            <span
              className={cn(
                panelHeaderSubtitleClass,
                selectedId && "font-mono text-[11px]"
              )}
              title={selectedId ?? undefined}
            >
              {detailLoading
                ? t("loading_request")
                : selectedId
                  ? selectedId
                  : t("status_meta_request")}
            </span>
            {selectedId ? (
              <button
                type="button"
                onClick={onCopyUrl}
                className="shrink-0 rounded p-0.5 text-muted-foreground transition-opacity hover:bg-muted hover:text-foreground"
                aria-label={t("copy_report_url")}
                title={t("copy_report_url")}
              >
                <Copy className="size-3" />
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <ScrollArea className="h-0 min-h-0 w-full flex-1">
          <div className="px-4 py-3">
            <dl className="grid gap-x-4 gap-y-2 text-xs sm:grid-cols-2">
              {detailLines.map((line) => (
                <div
                  key={line.label}
                  className="group grid min-w-0 gap-0.5"
                >
                  <dt className="text-[11px] text-muted-foreground">
                    {line.label}
                  </dt>
                  <dd
                    className={cn(
                      "text-foreground",
                      line.label === t("error") &&
                        "whitespace-normal break-all"
                    )}
                    title={line.value}
                  >
                    {line.label === t("error") ? (
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="min-w-0 truncate">
                          {line.value}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            onCopyText(line.value)
                          }
                          className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
                          aria-label={t("copy_error")}
                          title={t("copy_to_clipboard")}
                        >
                          <Copy className="size-3" />
                        </button>
                      </span>
                    ) : (
                      line.value
                    )}
                  </dd>
                </div>
              ))}
              {opfsDetail && opfsDetail.files.length > 0 ? (
                <div className="sm:col-span-2 pt-1">
                  <Collapsible defaultOpen={false}>
                    <CollapsibleTrigger asChild>
                      <button
                        type="button"
                        className="group/trigger flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                      >
                        <ChevronRight className="size-3 shrink-0 transition-transform duration-200 group-data-[state=open]/trigger:rotate-90" />
                        <dt className="cursor-pointer font-medium">
                          {t("opfs_files", { count: opfsDetail.files.length })}
                        </dt>
                      </button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <dd className="mt-1 flex flex-col gap-0.5 rounded border border-border/40 bg-muted/20 p-2 font-mono text-[11px]">
                        {opfsDetail.files.map((file) => (
                          <div
                            key={file.name}
                            className="flex items-center justify-between gap-2 border-b border-border/20 py-0.5 last:border-0 last:pb-0"
                          >
                            <div className="flex items-center gap-2 truncate">
                              <span className="truncate font-medium text-foreground">
                                {file.name}
                              </span>
                              {file.lastModified ? (
                                <span className="text-[10px] text-muted-foreground/80">
                                  [{formatWhen(new Date(file.lastModified).toISOString())}]
                                </span>
                              ) : null}
                            </div>
                            <span className="shrink-0 text-muted-foreground tabular-nums">
                              {formatBytes(file.sizeBytes)}
                            </span>
                          </div>
                        ))}
                      </dd>
                    </CollapsibleContent>
                  </Collapsible>
                </div>
              ) : null}
            </dl>

            {showProgress ? (
              <RunProgressSteps
                events={progressEvents}
                phase={progressPhase}
                running={running}
                loading={progressLoading}
              />
            ) : null}

            <div className="mt-3 flex min-h-0 flex-col space-y-3">
              <Marker variant="separator">
                <MarkerContent className="text-[11px] text-muted-foreground">
                  {t("request_input")}
                </MarkerContent>
              </Marker>
              <CodeBlock
                value={inputJson}
                language="json"
                className="max-h-[min(24rem,50vh)] min-h-32 rounded-none border-0"
              />
            </div>
          </div>
        </ScrollArea>
      </div>
    </section>
  );
}
