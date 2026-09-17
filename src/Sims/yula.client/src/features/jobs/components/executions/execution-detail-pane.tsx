"use client";

import { useTranslations } from "next-intl";
import * as React from "react";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  FileText,
  Filter,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CodeBlock } from "@/components/ui/code-block";
import {
  Collapsible,
  CollapsibleContent,
} from "@/components/ui/collapsible";
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

export type DetailLine = { label: string; value: string };

/**
 * Detay kolonu — 4 collapsible bölüme ayrıldı:
 *  1. Özet (summary)
 *  2. İlerleme (progress)
 *  3. Dosyalar (opfs)
 *  4. İstek Girdisi (request input)
 *
 * Kullanıcı her bölümü bağımsız açabilir/kapatır; durum mount'ta
 * `defaultOpen` ile başlar, sonraki render'larda değişmez (Collapsible).
 */

function Section({
  title,
  icon,
  badge,
  defaultOpen = true,
  empty,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  defaultOpen?: boolean;
  /** Bölüm içeriği boşsa gösterilecek fallback (header gizlenir). */
  empty?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(defaultOpen);

  if (empty) return null;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      {/* Bölüm arası çizgiyi container'ın divide-y'si çizer —
          header'ın kendisinde border yok (üst üste binme / kaybolma yok). */}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "flex w-full items-center gap-1.5 bg-muted/10 px-3 py-2 text-left text-[11px] font-medium text-foreground transition-colors hover:bg-muted/40",
        )}
      >
        {open ? (
          <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-3 shrink-0 text-muted-foreground" />
        )}
        {icon}
        <span className="truncate">{title}</span>
        {badge ? <span className="ml-auto shrink-0">{badge}</span> : null}
      </button>
      {open ? (
        <CollapsibleContent>
          <div className="px-3 py-2">{children}</div>
        </CollapsibleContent>
      ) : null}
    </Collapsible>
  );
}

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
              <span className={panelHeaderTitleClass}>
                {detailSlotTitle || t("criteria")}
              </span>
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

  // Hata satırı özet bölümüne ayrı bir renk ile ayrılır
  const summaryLines = detailLines.filter(
    (line) => line.label !== t("error"),
  );
  const errorLine = detailLines.find((line) => line.label === t("error"));

  const hasOpfsFiles = Boolean(opfsDetail && opfsDetail.files.length > 0);
  const progressStepCount = progressEvents.length;

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
                selectedId && "font-mono text-[11px]",
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
        <div className="divide-y divide-border/60 min-h-0 flex-1 overflow-y-auto">
          {/* ── Bölüm 1: Özet ─────────────────────────────────────── */}
          <Section
            title={t("summary")}
            defaultOpen={true}
            empty={summaryLines.length === 0 && !errorLine}
          >
            <dl className="grid gap-x-4 gap-y-2 text-xs sm:grid-cols-2">
              {summaryLines.map((line) => (
                <div key={line.label} className="group grid min-w-0 gap-0.5">
                  <dt className="text-[11px] text-muted-foreground">
                    {line.label}
                  </dt>
                  <dd className="text-foreground" title={line.value}>
                    {line.value}
                  </dd>
                </div>
              ))}
            </dl>
            {errorLine ? (
              <div className="mt-2 rounded border border-destructive/30 bg-destructive/5 p-2 text-xs">
                <div className="group flex min-w-0 items-start gap-1.5">
                  <dt className="shrink-0 text-[11px] font-medium text-destructive">
                    {errorLine.label}
                  </dt>
                  <dd
                    className="min-w-0 break-all text-foreground"
                    title={errorLine.value}
                  >
                    {errorLine.value}
                  </dd>
                  <button
                    type="button"
                    onClick={() => onCopyText(errorLine.value)}
                    className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
                    aria-label={t("copy_error")}
                    title={t("copy_to_clipboard")}
                  >
                    <Copy className="size-3" />
                  </button>
                </div>
              </div>
            ) : null}
          </Section>

          {/* ── Bölüm 2: İlerleme ──────────────────────────────────── */}
          {showProgress ? (
            <Section
              title={t("progress")}
              defaultOpen={running}
              badge={
                progressStepCount > 0 ? (
                  <Badge
                    variant="outline"
                    className="h-4 px-1 text-[10px] tabular-nums"
                  >
                    {progressStepCount}
                  </Badge>
                ) : undefined
              }
            >
              {progressLoading ? (
                <p className="text-[11px] text-muted-foreground">
                  {t("loading_progress")}
                </p>
              ) : (
                <RunProgressSteps
                  events={progressEvents}
                  phase={progressPhase}
                  running={running}
                  loading={progressLoading}
                />
              )}
            </Section>
          ) : null}

          {/* ── Bölüm 3: Dosyalar ──────────────────────────────────── */}
          {hasOpfsFiles ? (
            <Section
              title={t("opfs_files", { count: opfsDetail!.files.length })}
              defaultOpen={false}
              badge={
                <Badge
                  variant="outline"
                  className="h-4 px-1 text-[10px] tabular-nums text-muted-foreground"
                >
                  {formatBytes(
                    opfsDetail!.files.reduce((sum, f) => sum + f.sizeBytes, 0),
                  )}
                </Badge>
              }
            >
              <div className="flex flex-col gap-0.5 rounded border border-border/40 bg-muted/20 p-2 font-mono text-[11px]">
                  {opfsDetail!.files.map((file) => (
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
                            [{new Date(file.lastModified).toLocaleString()}]
                          </span>
                        ) : null}
                      </div>
                      <span className="shrink-0 text-muted-foreground tabular-nums">
                        {formatBytes(file.sizeBytes)}
                      </span>
                    </div>
                  ))}
                </div>
            </Section>
          ) : null}

          {/* ── Bölüm 4: İstek Girdisi ────────────────────────────── */}
          <Section
            title={t("request_input")}
            defaultOpen={false}
            empty={!inputJson || inputJson.trim() === "" || inputJson === "{\n  \n}"}
          >
            <CodeBlock
              value={inputJson}
              language="json"
              className="max-h-[min(24rem,50vh)] min-h-32 rounded-none border-0"
            />
          </Section>
        </div>
      </div>
    </section>
  );
}
