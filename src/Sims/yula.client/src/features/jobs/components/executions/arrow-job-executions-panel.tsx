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
import type { ArrowJobStatus } from "../../types";
import { useJobOwner } from "@/features/jobs/hooks/use-job-owners";
import { useSession } from "next-auth/react";
import { useYulaGridStore } from "@/lib/stores/grid";
import { useJobExecutionsAgent } from "./use-job-executions-agent";
import { cn } from "@/utils/cn";
import { WorkspaceBanner } from "@/components/layout/workspace-banner";
import { copyToClipboard } from "@/lib/clipboard";
import { sameJobId } from "./execution-helpers";
import { useExecutionsList } from "./use-executions-list";
import { useExecutionHub } from "./use-execution-hub";
import { useExecutionDetail } from "./use-execution-detail";
import { ExecutionsListPane } from "./executions-list-pane";
import { ExecutionDetailPane } from "./execution-detail-pane";
import { DeleteExecutionDialog } from "./delete-execution-dialog";
import { useDisplayExecutions } from "./use-display-executions";
import { useExecutionActions } from "./use-execution-actions";
import { useExecutionDetailLines } from "./use-execution-detail-lines";
import type { ArrowJobExecutionsPanelProps } from "./arrow-job-executions-types";

export type { ArrowJobExecutionsPanelProps } from "./arrow-job-executions-types";

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

  const { groupRef, onLayoutChanged } = usePersistedPanelLayout("arrow-jobs-executions");

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
    bumpDetail,
  } = detail;

  const selectedItemRef = React.useRef<HTMLButtonElement | null>(null);

  // Compose modu: kriter aktifken seçimi sıfırla
  const composeKey = `${showCriteriaSlot}|${criteriaActive}`;
  const [syncedComposeKey, setSyncedComposeKey] = React.useState(composeKey);
  if (syncedComposeKey !== composeKey) {
    setSyncedComposeKey(composeKey);
    if (showCriteriaSlot && criteriaActive) {
      setSelectedId(null);
    }
  }

  // Aktif (canlı) run seçili kalsın
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

  const displayItems = useDisplayExecutions({
    items,
    pendingJobs,
    activeJobId,
    activeLiveStatus,
    jobName,
    hubSnapshot,
    selectedId,
  });

  const { data: session } = useSession();
  const myOwnerId = (session?.user as { id?: string } | undefined)?.id;
  const myOwnerName = (session?.user as { name?: string | null } | undefined)?.name;
  const { label: ownerLabel } = useJobOwner(selectedJob?.ownerId, myOwnerId, myOwnerName);

  const labels = React.useMemo(
    () => ({
      status: t("status"),
      owner: t("owner"),
      created: t("created"),
      completed: t("completed"),
      duration: t("duration"),
      results: t("results"),
      error: t("error"),
      rowsPlural: t("rows_plural", { count: selectedJob?.totalRows ?? 0 }),
    }),
    [t, selectedJob?.totalRows]
  );

  const { progressEvents, detailLines } = useExecutionDetailLines({
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
  });

  const currentViewMode = viewMode ?? "result";

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

  // Headless React UI-Agent (@my-agent/react)
  useJobExecutionsAgent({
    jobName,
    items,
    total,
    selectedId,
    activeJobId,
    selectedJob,
    selectedDisplayStatus,
    inputJson,
    progressPhase,
    progressEvents,
    openJobHref,
    loadList,
    setSelectedId,
    onOpenJob,
  });

  const selectedInFlight =
    !isTerminal && (normStatus === "running" || normStatus === "queued" || isRunningPhase);
  const isSelectedCompleted = Boolean(selectedId) && normStatus === "completed";

  const onSelectedCompletedChangeRef = React.useRef(onSelectedCompletedChange);
  React.useEffect(() => {
    onSelectedCompletedChangeRef.current = onSelectedCompletedChange;
  }, [onSelectedCompletedChange]);

  React.useEffect(() => {
    onSelectedCompletedChangeRef.current?.(isSelectedCompleted);
  }, [isSelectedCompleted]);

  const resultMode =
    isSelectedCompleted && renderResult != null && currentViewMode !== "detail";
  const criteriaVisible = showCriteriaSlot && !selectedId;

  const {
    deleteOpen,
    setDeleteOpen,
    deleteTargetId,
    setDeleteTargetId,
    deleting,
    deleteError,
    setDeleteError,
    handleConfirmDelete,
    handleDeleteRequest,
  } = useExecutionActions({
    selectedId,
    criteriaVisible,
    selectedInFlight,
    setItems,
    setSelectedId,
    setHistoryEvents,
    setInputJson,
    loadList,
    onJobCancelled,
    onJobDeleted,
    onCanDeleteChange,
    deleteJobTriggerRef,
    onCanCancelChange,
    onCancellingChange,
    cancelJobTriggerRef,
    fallbackDeleteErrorMessage: t("job_delete_failed"),
  });

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

  const running =
    isRunningPhase && progressPhase !== "done" && progressPhase !== "cancelled";

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
      onJobSelect?.(jobId, job);
    },
    [onJobSelect]
  );

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
              showProgress={Boolean(selectedId)}
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
