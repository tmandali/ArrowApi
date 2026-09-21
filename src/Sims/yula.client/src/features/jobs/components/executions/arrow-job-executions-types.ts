import type * as React from "react";
import type { RunEventItem } from "@/features/jobs/run-events";
import type { JsonSchemaObject } from "@/features/report-criteria";
import type { ArrowJobStatus } from "../../types";

export type PendingJobItem = {
  id: string;
  status?: string;
  createdAt?: string;
  name?: string;
  totalRows?: number | null;
  batchCount?: number | null;
};

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
  pendingJobs?: PendingJobItem[];
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
  onSelectedCompletedChange?: (isCompleted: boolean) => void;
  deleteJobTriggerRef?: React.MutableRefObject<(() => void) | null>;
  onCanDeleteChange?: (canDelete: boolean) => void;
  cancelJobTriggerRef?: React.MutableRefObject<(() => void) | null>;
  onCanCancelChange?: (canCancel: boolean) => void;
  onCancellingChange?: (cancelling: boolean) => void;
};
