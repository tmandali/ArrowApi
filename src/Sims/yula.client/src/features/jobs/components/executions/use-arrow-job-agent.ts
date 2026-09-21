"use client";

import * as React from "react";
import { z } from "zod";
import { useAgentComponent } from "@my-agent/react";
import { uiEventBus } from "@my-agent/core";
import { executeDispatchComponentAction } from "@/lib/client-tools/dispatch-bridge";
import {
  ARROW_JOB_CANCEL_ACTION_CONTRACT,
  ARROW_JOB_STATUS_ACTION_CONTRACT,
  ARROW_JOB_SUMMARY_ACTION_CONTRACT,
  normalizeJobState,
  type ArrowJobLifecycleState,
} from "../../ai";
import { cancelArrowJob } from "@/features/jobs/arrow-job-client";
import type { ArrowJobStatus } from "../../types";
import type { RunEventItem } from "@/features/jobs/run-events";

export interface UseArrowJobAgentOptions {
  jobName: string;
  activeJobId?: string | null;
  selectedJob?: ArrowJobStatus | {
    id: string;
    status: string;
    name?: string;
    createdAt?: string;
    completedAt?: string | null;
    totalRows?: number;
    batchCount?: number;
    error?: string | null;
  } | null;
  selectedDisplayStatus?: string;
  progressPhase?: string;
  progressEvents?: RunEventItem[];
}

/**
 * Headless UI-Agent binding for the focused Arrow Job execution (`id: "arrow_job"`).
 * Models the live state machine (queued, running, completed, failed, cancelled).
 */
export function useArrowJobAgent({
  jobName,
  activeJobId,
  selectedJob,
  selectedDisplayStatus,
  progressPhase = "",
  progressEvents = [],
}: UseArrowJobAgentOptions) {
  const currentJobId = activeJobId || selectedJob?.id || null;
  const currentStatus: ArrowJobLifecycleState = normalizeJobState(
    selectedJob?.status || selectedDisplayStatus || (progressPhase === "running" ? "Running" : "Idle")
  );
  const lastEvent = progressEvents[progressEvents.length - 1];

  const durationMs =
    selectedJob?.createdAt && selectedJob?.completedAt
      ? new Date(selectedJob.completedAt).getTime() - new Date(selectedJob.createdAt).getTime()
      : undefined;

  const { emit } = useAgentComponent({
    id: "arrow_job",
    meta: {
      description: `Focused Arrow Job (${currentJobId ?? "none"}) - Status: ${currentStatus}`,
      reportScope: jobName,
      jobId: currentJobId,
      status: currentStatus,
      phase: progressPhase,
      currentStep: lastEvent?.title || lastEvent?.eventName,
      totalRows: selectedJob?.totalRows,
      durationMs,
      error: selectedJob?.error ?? undefined,
    },
    events: {
      job_started: {
        description: "Triggered when a report job execution begins on the backend",
        schema: z.object({ jobId: z.string(), reportScope: z.string() }),
      },
      job_progress: {
        description: "Triggered periodically as backend execution steps stream via SSE",
        schema: z.object({
          jobId: z.string(),
          phase: z.string(),
          step: z.string().optional(),
          eventCount: z.number().optional(),
        }),
      },
      job_completed: {
        description: "Triggered when a report job successfully finishes execution",
        schema: z.object({
          jobId: z.string(),
          reportScope: z.string().optional(),
          rowCount: z.number().optional(),
          durationMs: z.number().optional(),
        }),
      },
      job_failed: {
        description: "Triggered when a report job execution encounters an error",
        schema: z.object({ jobId: z.string(), error: z.string().optional() }),
      },
      job_cancelled: {
        description: "Triggered when a report job execution is cancelled",
        schema: z.object({ jobId: z.string() }),
      },
    },
    actions: {
      CANCEL: ARROW_JOB_CANCEL_ACTION_CONTRACT,
      GET_STATUS: ARROW_JOB_STATUS_ACTION_CONTRACT,
      GET_SUMMARY: ARROW_JOB_SUMMARY_ACTION_CONTRACT,
    },
    handlers: {
      CANCEL: async (payload) => {
        const targetId = String(payload?.jobId || currentJobId || "");
        if (targetId) {
          await cancelArrowJob(targetId);
          return { status: "ok", jobId: targetId, message: `Cancelled job ${targetId}` };
        }
        return executeDispatchComponentAction({ component_id: "arrow_job", action: "CANCEL", payload });
      },
      GET_STATUS: async () => {
        return {
          status: "ok",
          jobId: currentJobId,
          jobStatus: currentStatus,
          phase: progressPhase,
          currentStep: lastEvent?.title || lastEvent?.eventName,
          totalRows: selectedJob?.totalRows,
          durationMs,
          error: selectedJob?.error ?? undefined,
          eventCount: progressEvents.length,
        };
      },
      GET_SUMMARY: async () => {
        return {
          status: "ok",
          jobId: currentJobId,
          report: jobName,
          statusText: currentStatus,
          totalRows: selectedJob?.totalRows ?? 0,
          batchCount: selectedJob?.batchCount ?? 0,
          durationMs,
        };
      },
    },
    onAction: async (action, payload) => {
      return executeDispatchComponentAction({ component_id: "arrow_job", action, payload });
    },
  });

  const prevJobPhaseRef = React.useRef<string | null>(null);
  const prevEventsLenRef = React.useRef<number>(0);

  React.useEffect(() => {
    if (!currentJobId) return;
    const norm = currentStatus.toLowerCase();
    const phaseKey = `${currentJobId}:${norm}:${progressPhase}`;

    if (prevJobPhaseRef.current !== phaseKey) {
      prevJobPhaseRef.current = phaseKey;
      if (norm === "running" || progressPhase === "running") {
        emit("job_started", { jobId: currentJobId, reportScope: jobName });
        try {
          uiEventBus.recordTelemetry(
            { topic: "jobs", source: "arrow_job", type: "JOB_STARTED", payload: { jobId: currentJobId, reportScope: jobName } },
            { coalesceKey: `job:${currentJobId}:started`, correlationId: currentJobId }
          );
        } catch {}
      } else if (norm === "completed" || progressPhase === "done") {
        emit("job_completed", { jobId: currentJobId, reportScope: jobName, rowCount: selectedJob?.totalRows, durationMs });
        try {
          uiEventBus.recordTelemetry(
            { topic: "jobs", source: "arrow_job", type: "JOB_COMPLETED", payload: { jobId: currentJobId, reportScope: jobName, rowCount: selectedJob?.totalRows } },
            { coalesceKey: `job:${currentJobId}:completed`, correlationId: currentJobId }
          );
        } catch {}
      } else if (norm === "failed") {
        emit("job_failed", { jobId: currentJobId, error: selectedJob?.error ?? undefined });
        try {
          uiEventBus.recordTelemetry(
            { topic: "jobs", source: "arrow_job", type: "JOB_FAILED", payload: { jobId: currentJobId } },
            { coalesceKey: `job:${currentJobId}:failed`, correlationId: currentJobId }
          );
        } catch {}
      } else if (norm === "cancelled" || norm === "canceled") {
        emit("job_cancelled", { jobId: currentJobId });
        try {
          uiEventBus.recordTelemetry(
            { topic: "jobs", source: "arrow_job", type: "JOB_CANCELLED", payload: { jobId: currentJobId } },
            { coalesceKey: `job:${currentJobId}:cancelled`, correlationId: currentJobId }
          );
        } catch {}
      }
    }

    if (progressEvents.length > prevEventsLenRef.current && (norm === "running" || progressPhase === "running")) {
      prevEventsLenRef.current = progressEvents.length;
      emit("job_progress", {
        jobId: currentJobId,
        phase: progressPhase,
        step: lastEvent?.title || lastEvent?.eventName,
        eventCount: progressEvents.length,
      });
    }
  }, [currentJobId, currentStatus, progressPhase, progressEvents, lastEvent, jobName, selectedJob, durationMs, emit]);
}
