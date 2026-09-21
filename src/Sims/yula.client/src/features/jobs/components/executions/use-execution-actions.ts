import * as React from "react";
import { cancelArrowJob, deleteArrowJob } from "@/features/jobs/arrow-job-client";
import { arrowJobEventHub } from "@/features/jobs/services/arrow-job-event-hub";
import { useActiveJobsStore } from "@/store/slices/active-jobs-store";
import { ApiError } from "@/services";
import type { RunEventItem } from "@/features/jobs/run-events";
import type { ArrowJobStatus } from "../../types";
import { sameJobId } from "./execution-helpers";

export interface UseExecutionActionsOptions {
  selectedId: string | null;
  criteriaVisible: boolean;
  selectedInFlight: boolean;
  setItems: React.Dispatch<React.SetStateAction<ArrowJobStatus[]>>;
  setSelectedId: (id: string | null) => void;
  setHistoryEvents: (events: RunEventItem[]) => void;
  setInputJson: (json: string) => void;
  loadList: (signal?: AbortSignal, opts?: { silent?: boolean }) => Promise<void>;
  onJobCancelled?: (jobId: string) => void;
  onJobDeleted?: (jobId: string) => void;
  onCanDeleteChange?: (canDelete: boolean) => void;
  deleteJobTriggerRef?: React.MutableRefObject<(() => void) | null>;
  onCanCancelChange?: (canCancel: boolean) => void;
  onCancellingChange?: (cancelling: boolean) => void;
  cancelJobTriggerRef?: React.MutableRefObject<(() => void) | null>;
  fallbackDeleteErrorMessage?: string;
}

export function useExecutionActions({
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
  fallbackDeleteErrorMessage = "İş silinemedi.",
}: UseExecutionActionsOptions) {
  const removeTrackedJob = useActiveJobsStore((s) => s.removeJob);

  const [cancelling, setCancelling] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [deleteTargetId, setDeleteTargetId] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const [deleteError, setDeleteError] = React.useState<string | null>(null);

  const canDeleteSelected = Boolean(selectedId) && !criteriaVisible && !selectedInFlight;

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

  const canCancelSelected = Boolean(selectedId) && !criteriaVisible && selectedInFlight;

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
              : fallbackDeleteErrorMessage;
        setDeleteError(message);
      } finally {
        setDeleting(false);
      }
    },
    [
      deleteTargetId,
      selectedId,
      deleting,
      removeTrackedJob,
      onJobDeleted,
      loadList,
      fallbackDeleteErrorMessage,
      setHistoryEvents,
      setInputJson,
      setSelectedId,
    ]
  );

  const handleDeleteRequest = React.useCallback((jobId: string) => {
    setDeleteError(null);
    setDeleteTargetId(jobId);
    setDeleteOpen(true);
  }, []);

  return {
    cancelling,
    deleteOpen,
    setDeleteOpen,
    deleteTargetId,
    setDeleteTargetId,
    deleting,
    deleteError,
    setDeleteError,
    canDeleteSelected,
    canCancelSelected,
    handleCancelSelected,
    handleConfirmDelete,
    handleDeleteRequest,
  };
}
