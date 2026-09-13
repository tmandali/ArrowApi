"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { usePersistedPanelLayout } from "@/lib/use-persisted-panel-layout";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { panelResizeHandleClass } from "@/components/layout/panel-chrome";
import {
  cancelArrowJob,
  deleteArrowJob,
} from "@/features/jobs/arrow-job-client";
import { arrowJobEventHub } from "@/features/jobs/services/arrow-job-event-hub";
import {
  formatTotalDuration,
  type RunEventItem,
} from "@/features/jobs/run-events";
import type { JsonSchemaObject } from "@/features/report-criteria";
import type { ArrowJobStatus } from "../../types";
import { isTerminalJobStatus, useActiveJobsStore } from "@/store/slices/active-jobs-store";
import { useYulaGridStore } from "@/lib/stores/grid";
import { cn } from "@/utils/cn";
import { formatCount, formatBytes } from "@/utils/format";
import { ApiError } from "@/services";
import { WorkspaceBanner } from "@/components/layout/workspace-banner";
import { copyToClipboard } from "@/lib/clipboard";
import { formatWhen, sameJobId } from "./execution-helpers";
import { useExecutionsList } from "./use-executions-list";
import { useExecutionHub } from "./use-execution-hub";
import { useExecutionDetail } from "./use-execution-detail";
import { ExecutionsListPane } from "./executions-list-pane";
import { ExecutionDetailPane, type DetailLine } from "./execution-detail-pane";
import { DeleteExecutionDialog } from "./delete-execution-dialog";

export type ArrowJobExecutionsPanelProps = {
  /** List endpoint, e.g. `/api/arrow/jobs/stock-balance`. */
  jobsEndpoint: string;
  /** Placeholder job name when the active run is not yet in the list. */
  jobName?: string;
  /** Builds the report view path for a job id (e.g. `/stock/stock-balance/<id>`). */
  openJobHref?: (jobId: string) => string;
  /** Empty-state subtitle under Executions. */
  emptyListHint?: string;
  /** Currently open job GUID; omit on criteria page. */
  activeJobId?: string | null;
  /** Live job status for the open GUID (overrides list until refresh). */
  activeLiveStatus?: string;
  /** Known request JSON for the currently open job (fallback while /request is loading). */
  activeRequestJson?: string;
  /** Live SSE steps for the currently open job. */
  activeRunEvents?: RunEventItem[];
  /** Parent run lifecycle: drives progress icons + list refresh. */
  activeRunPhase?: "idle" | "running" | "done" | "cancelled";
  className?: string;
  onOpenJob?: (jobId: string) => void;
  /** Fired when the user picks a row in Executions. */
  onJobSelect?: (jobId: string, job?: ArrowJobStatus) => void;
  /** Fired after a job is cancelled from Detail. */
  onJobCancelled?: (jobId: string) => void;
  /** Fired after a job is deleted from Detail. */
  onJobDeleted?: (jobId: string) => void;
  /** Fired when the executions list finishes loading (`count` of rows). */
  onListLoaded?: (count: number) => void;
  /** Fired when list fetch fails / clears; show in page banner, not in the list. */
  onListError?: (message: string | null) => void;
  /** Bump to force a silent list refresh (e.g. after queueing a new job). */
  listRefreshToken?: number;
  /**
   * Extra in-flight jobs not yet returned by the list API (Queued / Running).
   * Merged into Executions so multiple queued runs appear immediately.
   */
  pendingJobs?: Array<{
    id: string;
    status?: string;
    createdAt?: string;
    name?: string;
    totalRows?: number | null;
    batchCount?: number | null;
  }>;
  /**
   * Criteria content for the right column. Pass it unconditionally; the panel
   * shows it in place of Detail whenever nothing is selected in Executions
   * (including compose mode). Executions list stays visible.
   */
  detailSlot?: React.ReactNode;
  /** Title for the detailSlot column header. Default: Criteria. */
  detailSlotTitle?: string;
  /** Actions on the right of the detailSlot header (e.g. Run). */
  detailSlotActions?: React.ReactNode;
  /**
   * Compose mode (New / empty list): drop any selected execution so the
   * criteria slot takes over the Detail column. Ignored without detailSlot.
   */
  criteriaActive?: boolean;
  /**
   * Criteria JSON schema of the report — powers the read-only criteria grid
   * inside the Live panel (falls back to raw request JSON without it).
   */
  criteriaSchema?: JsonSchemaObject;
  /**
   * Renders the embedded result panel for a completed job id. When provided,
   * completed jobs open the result grid in place instead of the Detail view.
   */
  renderResult?: (jobId: string) => React.ReactNode;
  /** Bitmiş raporlarda "result" (grid) veya "detail" kutusu görünümü */
  viewMode?: "result" | "detail";
  onViewModeChange?: (mode: "result" | "detail") => void;
  onSelectedCompletedChange?: (isCompleted: boolean) => void;
  deleteJobTriggerRef?: React.MutableRefObject<(() => void) | null>;
  onCanDeleteChange?: (canDelete: boolean) => void;
  cancelJobTriggerRef?: React.MutableRefObject<(() => void) | null>;
  onCanCancelChange?: (canCancel: boolean) => void;
  onCancellingChange?: (cancelling: boolean) => void;
};

/**
 * Reusable Executions + Detail panel for any Arrow report job list.
 */
export function ArrowJobExecutionsPanel({
  jobsEndpoint,
  jobName = "report",
  openJobHref,
  emptyListHint = "",
  activeJobId = null,
  activeLiveStatus,
  activeRequestJson,
  activeRunEvents = [],
  activeRunPhase = "idle",
  className,
  onOpenJob,
  onJobSelect,
  onJobCancelled,
  onJobDeleted,
  onListLoaded,
  onListError,
  listRefreshToken = 0,
  pendingJobs = [],
  detailSlot,
  detailSlotTitle = "",
  detailSlotActions,
  criteriaActive = false,
  criteriaSchema: _criteriaSchema,
  renderResult,
  viewMode,
  onViewModeChange,
  onSelectedCompletedChange,
  deleteJobTriggerRef,
  onCanDeleteChange,
  cancelJobTriggerRef,
  onCanCancelChange,
  onCancellingChange,
}: ArrowJobExecutionsPanelProps) {
  const t = useTranslations("JobExecutions");
  const showCriteriaSlot = detailSlot != null;
  const isGridMaximized = useYulaGridStore((s) => s.isMaximized);
  const removeTrackedJob = useActiveJobsStore((s) => s.removeJob);
  // Header butonunun (PagePanelTrigger) hedefi — Executions kolonu açık/kapalı.
  // Resize düzenini oturumlar arası koru (localStorage) — criteria/detail oranları.
  const { groupRef, onLayoutChanged } = usePersistedPanelLayout(
    "arrow-jobs-executions"
  );

  const list = useExecutionsList({
    jobsEndpoint,
    listRefreshToken,
    activeRunPhase,
    pendingJobs,
    onListLoaded,
    onListError,
  });
  const { items, setItems, total, loading, refreshing, error, loadList } = list;

  const [selectedId, setSelectedId] = React.useState<string | null>(activeJobId);
  // Seçili job satırlardan türetilir (state değil) — seçim/silme/silinme
  // otomatik yansır.
  const selectedJob = React.useMemo(() => {
    const found = items.find((item) => sameJobId(item.id, selectedId));
    if (found) return found;
    const pending = pendingJobs.find((item) => sameJobId(item.id, selectedId));
    if (pending) {
      return {
        id: pending.id,
        status: pending.status || "Queued",
        name: pending.name || jobName,
        createdAt: pending.createdAt || new Date().toISOString(),
        totalRows: pending.totalRows ?? undefined,
        batchCount: pending.batchCount ?? undefined,
        jobUrl: "",
        eventsUrl: "",
      } as ArrowJobStatus;
    }
    return null;
  }, [items, pendingJobs, selectedId, jobName]);

  const hub = useExecutionHub({
    selectedId,
    selectedJob,
    activeJobId,
    activeLiveStatus,
    activeRunPhase,
    activeRunEvents,
    jobName,
    pendingJobs,
  });
  const {
    hubSnapshot,
    hubEvents,
    hasHubEvents,
    isActiveSelected,
    isRunningPhase,
    isLiveActive,
    selectedDisplayStatus,
    normStatus,
    isTerminal,
    liveCounts,
  } = hub;

  const detail = useExecutionDetail({
    selectedId,
    selectedJob,
    activeJobId,
    activeRequestJson,
    activeRunPhase,
    isLiveActive,
    isTerminal,
    hasHubEvents,
  });
  const {
    inputJson,
    setInputJson,
    detailLoading,
    historyEvents,
    setHistoryEvents,
    historyLoading,
    opfsDetail,
    opfsLoading,
    bumpDetail,
  } = detail;

  const [cancelling, setCancelling] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  /** Execution queued for deletion — set from the toolbar or the list row's
   *  hover mark so deletion never depends on the current selection. */
  const [deleteTargetId, setDeleteTargetId] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);
  const selectedItemRef = React.useRef<HTMLButtonElement | null>(null);

  // Compose modu (New / boş liste): vurgulu execution'ı bırak — render
  // sırasında state ayarlama.
  const composeKey = `${showCriteriaSlot}|${criteriaActive}`;
  const [syncedComposeKey, setSyncedComposeKey] = React.useState(composeKey);
  if (syncedComposeKey !== composeKey) {
    setSyncedComposeKey(composeKey);
    if (showCriteriaSlot && criteriaActive) {
      setSelectedId(null);
    }
  }

  // Aktif (canlı) run seçili kalsın — render sırasında state ayarlama.
  const [syncedLiveJobId, setSyncedLiveJobId] = React.useState(activeJobId);
  if (syncedLiveJobId !== activeJobId) {
    setSyncedLiveJobId(activeJobId);
    if (activeJobId) {
      setSelectedId(activeJobId);
    }
  }

  React.useEffect(() => {
    if (loading || !selectedId) return;
    selectedItemRef.current?.scrollIntoView({ block: "nearest" });
  }, [loading, selectedId, items]);

  // Patch live status + merge pending queued jobs not yet in the API list.
  // TEK KAYNAK (Single Source of Truth):
  // 1. Bitmiş işler (Completed, Cancelled, Failed) için `items` (veritabanı) kesindir.
  // 2. Devam eden işler (Running, Queued) için `pendingJobs` veya aktif SSE akışı günceller.
  // 3. SEÇİLEN İŞ (selectedId) ASLA LİSTEDEKİ SATIR SAYISINI VEYA DURUMUNU EZEMEZ!
  const displayItems = React.useMemo(() => {
    const next = items.map((job) => {
      // Bitmiş işler için sunucu veritabanındaki değerler korunur
      if (isTerminalJobStatus(job.status)) {
        return job;
      }

      // Devam eden iş için canlı EventHub snapshot'ı veya pendingJobs'tan anlık sayaçları al
      const liveSnap = sameJobId(job.id, selectedId)
        ? hubSnapshot
        : arrowJobEventHub.getSnapshot(job.id);
      const pending = pendingJobs.find((p) => sameJobId(p.id, job.id));

      const liveStatus =
        liveSnap?.status ||
        pending?.status ||
        (sameJobId(job.id, activeJobId) ? activeLiveStatus : null) ||
        job.status;

      const liveTotalRows =
        liveSnap?.totalRows ?? pending?.totalRows ?? job.totalRows;
      const liveBatchCount =
        liveSnap?.batchCount ?? pending?.batchCount ?? job.batchCount;

      return {
        ...job,
        status: liveStatus,
        totalRows: liveTotalRows ?? undefined,
        batchCount: liveBatchCount ?? undefined,
      };
    });

    // API listesine henüz girmemiş yeni başlatılan bekleyen işler
    const extras: ArrowJobStatus[] = [];
    for (const pending of pendingJobs) {
      if (next.some((job) => sameJobId(job.id, pending.id))) continue;
      const snap = sameJobId(pending.id, selectedId)
        ? hubSnapshot
        : arrowJobEventHub.getSnapshot(pending.id);
      extras.push({
        id: pending.id,
        status: snap?.status || pending.status || "Queued",
        name: pending.name || jobName,
        jobUrl: "",
        eventsUrl: "",
        createdAt: pending.createdAt || new Date().toISOString(),
        totalRows: snap?.totalRows ?? pending.totalRows ?? undefined,
        batchCount: snap?.batchCount ?? pending.batchCount ?? undefined,
      });
    }

    if (
      activeJobId &&
      !next.some((job) => sameJobId(job.id, activeJobId)) &&
      !extras.some((job) => sameJobId(job.id, activeJobId))
    ) {
      const activeSnap = sameJobId(activeJobId, selectedId)
        ? hubSnapshot
        : arrowJobEventHub.getSnapshot(activeJobId);
      extras.unshift({
        id: activeJobId,
        status: activeLiveStatus || activeSnap?.status || "Queued",
        name: jobName,
        jobUrl: "",
        eventsUrl: "",
        createdAt: new Date().toISOString(),
        totalRows: activeSnap?.totalRows ?? undefined,
        batchCount: activeSnap?.batchCount ?? undefined,
      });
    }

    return extras.length > 0 ? [...extras, ...next] : next;
  }, [items, pendingJobs, activeJobId, activeLiveStatus, jobName, hubSnapshot, selectedId]);

  // Seçili işin gösterilecek adımları:
  // - Bitmiş (terminal) işler için sunucunun event-log'u (historyEvents) esastır.
  // - Canlı akan işler için EventHub (hubEvents) veya activeRunEvents önceliklidir.
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

  // İlerleme adımlarındaki satır sayısını seçili işin authoritative `totalRows` değeriyle eşitle.
  // Yalnızca iş terminal (Completed / Cancelled) ise sunucu sayısına eşitlenir;
  // İş akarken canlı SSE sayaçları olduğu gibi akar.
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
          detail: `${formatCount(targetRows)} ${t("rows_plural", { count: targetRows })}`,
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
  }, [rawProgressEvents, selectedJob, isTerminal, t]);

  const [internalViewMode, setInternalViewMode] = React.useState<"result" | "detail">("result");
  const currentViewMode = viewMode ?? internalViewMode;

  const setEffectiveViewMode = React.useCallback(
    (mode: "result" | "detail") => {
      setInternalViewMode(mode);
      onViewModeChange?.(mode);
    },
    [onViewModeChange]
  );

  const progressPhase =
    hubSnapshot?.phase ??
    (isActiveSelected
      ? activeRunPhase
      : normStatus === "completed" || progressEvents.some((e) => e.eventName === "completed")
        ? "done"
        : normStatus === "cancelled" || normStatus === "canceled" || progressEvents.some((e) => e.eventName === "cancelled")
          ? "cancelled"
          : normStatus === "failed" || progressEvents.some((e) => e.eventName === "failed")
            ? "idle"
            : isRunningPhase
              ? "running"
              : "idle");
  const showProgress = Boolean(selectedId);

  const selectedInFlight =
    !isTerminal &&
    (normStatus === "running" ||
      normStatus === "queued" ||
      isRunningPhase);
  const isSelectedCompleted =
    Boolean(selectedId) && normStatus === "completed";

  const onSelectedCompletedChangeRef = React.useRef(onSelectedCompletedChange);

  React.useEffect(() => {
    onSelectedCompletedChangeRef.current = onSelectedCompletedChange;
  }, [onSelectedCompletedChange]);

  React.useEffect(() => {
    onSelectedCompletedChangeRef.current?.(isSelectedCompleted);
  }, [isSelectedCompleted]);

  const resultMode =
    isSelectedCompleted &&
    renderResult != null &&
    currentViewMode !== "detail";
  const criteriaVisible = showCriteriaSlot && !selectedId;
  const canDeleteSelected =
    Boolean(selectedId) && !criteriaVisible && !selectedInFlight;

  const onCanDeleteChangeRef = React.useRef(onCanDeleteChange);
  React.useEffect(() => {
    onCanDeleteChangeRef.current = onCanDeleteChange;
  }, [onCanDeleteChange]);

  React.useEffect(() => {
    onCanDeleteChangeRef.current?.(canDeleteSelected);
  }, [canDeleteSelected]);

  React.useEffect(() => {
    if (deleteJobTriggerRef) {
      deleteJobTriggerRef.current = () => {
        if (!selectedId || deleting) return;
        setDeleteError(null);
        setDeleteTargetId(selectedId);
        setDeleteOpen(true);
      };
      return () => {
        deleteJobTriggerRef.current = null;
      };
    }
  }, [deleteJobTriggerRef, selectedId, deleting]);

  const canCancelSelected =
    Boolean(selectedId) && !criteriaVisible && selectedInFlight;

  const onCanCancelChangeRef = React.useRef(onCanCancelChange);
  React.useEffect(() => {
    onCanCancelChangeRef.current = onCanCancelChange;
  }, [onCanCancelChange]);

  React.useEffect(() => {
    onCanCancelChangeRef.current?.(canCancelSelected);
  }, [canCancelSelected]);

  const onCancellingChangeRef = React.useRef(onCancellingChange);
  React.useEffect(() => {
    onCancellingChangeRef.current = onCancellingChange;
  }, [onCancellingChange]);

  const handleCancelSelected = React.useCallback(async () => {
    if (!selectedId || cancelling) return;
    setCancelling(true);
    onCancellingChangeRef.current?.(true);
    try {
      const cancelledStatus = await cancelArrowJob(selectedId);
      arrowJobEventHub.cancelJob(selectedId, {
        totalRows: cancelledStatus?.totalRows,
        batchCount: cancelledStatus?.batchCount,
      });
      removeTrackedJob(selectedId);
      setItems((prev) =>
        prev.map((item) =>
          sameJobId(item.id, selectedId)
            ? {
                ...item,
                status: "Cancelled",
                totalRows: cancelledStatus?.totalRows ?? item.totalRows,
                batchCount: cancelledStatus?.batchCount ?? item.batchCount,
              }
            : item
        )
      );
      onJobCancelled?.(selectedId);
      void loadList(undefined, { silent: true });
    } catch (err) {
      console.warn("Cancel job error:", err);
    } finally {
      setCancelling(false);
      onCancellingChangeRef.current?.(false);
    }
  }, [selectedId, cancelling, removeTrackedJob, onJobCancelled, loadList, setItems]);

  React.useEffect(() => {
    if (cancelJobTriggerRef) {
      cancelJobTriggerRef.current = handleCancelSelected;
      return () => {
        cancelJobTriggerRef.current = null;
      };
    }
  }, [cancelJobTriggerRef, handleCancelSelected]);

  const handleCopy = React.useCallback(
    (value: string, mode: "id" | "url") => {
      const text =
        mode === "url" && openJobHref
          ? `${window.location.origin}${openJobHref(value)}`
          : value;
      void copyToClipboard(text);
    },
    [openJobHref]
  );

  const handleConfirmDelete = React.useCallback(
    async (event: React.MouseEvent) => {
      event.preventDefault();
      const targetId = deleteTargetId;
      if (!targetId || deleting) return;
      setDeleting(true);
      setDeleteError(null);
      try {
        await deleteArrowJob(targetId);
        removeTrackedJob(targetId);
        onJobDeleted?.(targetId);
        setDeleteOpen(false);
        setDeleteTargetId(null);
        if (sameJobId(selectedId, targetId)) {
          setSelectedId(null);
          setHistoryEvents([]);
          setInputJson("{\n  \n}");
        }
        await loadList(undefined, { silent: true });
      } catch (err) {
        const message =
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : t("job_delete_failed");
        setDeleteError(message);
      } finally {
        setDeleting(false);
      }
    },
    [deleteTargetId, selectedId, deleting, removeTrackedJob, onJobDeleted, loadList, t, setHistoryEvents, setInputJson]
  );

  const detailLines: DetailLine[] = React.useMemo(() => {
    if (!selectedJob && !isActiveSelected) {
      return [{ label: t("status"), value: "—" }];
    }
    const duration = formatTotalDuration({
      createdAt: selectedJob?.createdAt,
      completedAt: selectedJob?.completedAt,
      status: selectedDisplayStatus,
      steps: progressEvents,
    });
    const lines = [
      { label: t("status"), value: selectedDisplayStatus },
      { label: t("created"), value: formatWhen(selectedJob?.createdAt) },
      { label: t("completed"), value: formatWhen(selectedJob?.completedAt) },
      { label: t("duration"), value: duration ?? "—" },
      {
        label: t("rows"),
        value:
          isTerminal && selectedJob?.totalRows != null
            ? formatCount(selectedJob.totalRows)
            : liveCounts?.totalRows != null
              ? formatCount(liveCounts.totalRows)
              : selectedJob?.totalRows != null
                ? formatCount(selectedJob.totalRows)
                : "—",
      },
      {
        label: t("batches"),
        value:
          isTerminal && selectedJob?.batchCount != null
            ? formatCount(selectedJob.batchCount)
            : liveCounts?.batchCount != null
              ? formatCount(liveCounts.batchCount)
              : selectedJob?.batchCount != null
                ? formatCount(selectedJob.batchCount)
                : "—",
      },
      {
        label: t("opfs_cache"),
        value: opfsDetail?.hasParts
          ? t("opfs_parts", { count: opfsDetail.partCount, size: formatBytes(opfsDetail.totalSizeBytes) })
          : opfsLoading
            ? t("opfs_scanning")
            : t("opfs_none"),
      },
      {
        label: t("opfs_date"),
        value: opfsDetail?.files?.[0]?.lastModified
          ? formatWhen(new Date(opfsDetail.files[0].lastModified).toISOString())
          : "—",
      },
    ];
    if (selectedJob?.error) {
      lines.push({ label: t("error"), value: selectedJob.error });
    }
    return lines;
  }, [
    selectedJob,
    selectedDisplayStatus,
    isTerminal,
    isActiveSelected,
    liveCounts,
    progressEvents,
    opfsDetail,
    opfsLoading,
    t,
  ]);

  const running =
    isRunningPhase &&
    progressPhase !== "done" &&
    progressPhase !== "cancelled";

  const onListLoadedLengthRef = React.useRef(onListLoaded);
  React.useEffect(() => {
    onListLoadedLengthRef.current = onListLoaded;
  }, [onListLoaded]);

  React.useEffect(() => {
    if (loading) return;
    onListLoadedLengthRef.current?.(error ? 0 : displayItems.length);
  }, [loading, error, displayItems.length]);

  const handleRefresh = React.useCallback(async () => {
    bumpDetail();
    await list.handleRefresh();
  }, [bumpDetail, list]);

  const handleSelect = React.useCallback(
    (jobId: string, job: ArrowJobStatus) => {
      setSelectedId(jobId);
      setEffectiveViewMode("result");
      onJobSelect?.(jobId, job);
    },
    [onJobSelect, setEffectiveViewMode]
  );

  const handleDeleteRequest = React.useCallback((jobId: string) => {
    setDeleteError(null);
    setDeleteTargetId(jobId);
    setDeleteOpen(true);
  }, []);

  return (
    <>
      {deleteError && !deleteOpen ? (
        <WorkspaceBanner
          tone="error"
          inset
          className="mx-2 mt-2"
          onDismiss={() => setDeleteError(null)}
        >
          <span title={deleteError}>{deleteError}</span>
        </WorkspaceBanner>
      ) : null}
      <ResizablePanelGroup
        orientation="horizontal"
        groupRef={groupRef}
        onLayoutChanged={onLayoutChanged}
        className={cn("min-h-0 flex-1 overflow-hidden", className)}
      >
        {!isGridMaximized ? (
          <ResizablePanel
            id="executions-criteria"
            defaultSize={360}
            minSize={320}
            maxSize={520}
            groupResizeBehavior="preserve-pixel-size"
            className="min-h-0 min-w-0"
          >
            <ExecutionsListPane
              total={total}
              emptyListHint={emptyListHint}
              loading={loading}
              refreshing={refreshing}
              displayItems={displayItems}
              selectedId={selectedId}
              selectedItemRef={selectedItemRef}
              onSelect={handleSelect}
              onOpenJob={onOpenJob}
              onDeleteRequest={handleDeleteRequest}
              onRefresh={() => void handleRefresh()}
              onCopyId={(jobId) => handleCopy(jobId, "id")}
            />
          </ResizablePanel>
        ) : null}
        {!isGridMaximized ? (
          <ResizableHandle withHandle className={panelResizeHandleClass} />
        ) : null}

        <ResizablePanel
          id="executions-detail"
          minSize={isGridMaximized ? "100%" : "30%"}
          className="min-h-0 min-w-0 flex-1"
        >
          {resultMode && selectedId ? (
            renderResult(selectedId)
          ) : (
            <ExecutionDetailPane
              criteriaVisible={criteriaVisible}
              detailSlot={detailSlot}
              detailSlotTitle={detailSlotTitle}
              detailSlotActions={detailSlotActions}
              selectedId={selectedId}
              selectedDisplayStatus={selectedDisplayStatus}
              detailLoading={detailLoading}
              detailLines={detailLines}
              opfsDetail={opfsDetail}
              showProgress={showProgress}
              progressEvents={progressEvents}
              progressPhase={progressPhase}
              running={running}
              progressLoading={historyLoading && progressEvents.length === 0}
              inputJson={inputJson}
              onCopyUrl={() => selectedId && handleCopy(selectedId, "url")}
              onCopyText={(value) => handleCopy(value, "id")}
            />
          )}
        </ResizablePanel>
      </ResizablePanelGroup>

      <DeleteExecutionDialog
        open={deleteOpen}
        targetId={deleteTargetId}
        deleting={deleting}
        error={deleteError}
        onOpenChange={(open) => {
          setDeleteOpen(open);
          if (!open) {
            setDeleteError(null);
            setDeleteTargetId(null);
          }
        }}
        onConfirm={handleConfirmDelete}
      />
    </>
  );
}
