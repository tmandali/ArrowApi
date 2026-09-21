"use client";

import { useAgentComponent } from "@my-agent/react";
import { executeDispatchComponentAction } from "@/lib/client-tools/dispatch-bridge";
import {
  JOB_LIST_ACTION_CONTRACT,
  JOB_SELECT_ACTION_CONTRACT,
  JOB_REFRESH_ACTION_CONTRACT,
  JOB_CANCEL_ACTION_CONTRACT,
  JOB_DETAIL_ACTION_CONTRACT,
} from "@/lib/client-tools/job-history-contracts";
import { cancelArrowJob } from "@/features/jobs/arrow-job-client";
import type { ArrowJobStatus } from "../../types";
import type { RunEventItem } from "@/features/jobs/run-events";

function sameJobId(a?: string | null, b?: string | null) {
  if (!a || !b) return false;
  return a.toLowerCase() === b.toLowerCase();
}

export interface UseJobExecutionsAgentOptions {
  jobName: string;
  items: ArrowJobStatus[];
  total: number;
  selectedId: string | null;
  activeJobId?: string | null;
  selectedJob?: ArrowJobStatus | {
    id: string;
    status: string;
    name: string;
    createdAt: string;
    completedAt?: string | null;
    totalRows?: number;
    batchCount?: number;
  } | null;
  selectedDisplayStatus?: string;
  inputJson?: string;
  progressPhase?: string;
  progressEvents?: RunEventItem[];
  openJobHref?: (jobId: string) => string;
  loadList: () => Promise<void>;
  setSelectedId: (id: string | null) => void;
  onOpenJob?: (jobId: string) => void;
}

/**
 * Headless UI-Agent binding for report execution history panel (`id: "job_history"`).
 */
export function useJobExecutionsAgent({
  jobName,
  items,
  total,
  selectedId,
  activeJobId,
  selectedJob,
  selectedDisplayStatus,
  inputJson,
  progressPhase = "",
  progressEvents = [],
  openJobHref,
  loadList,
  setSelectedId,
  onOpenJob,
}: UseJobExecutionsAgentOptions) {
  useAgentComponent({
    id: "job_history",
    meta: {
      description: `Execution History Panel (${jobName})`,
      reportScope: jobName,
      executionCount: items.length,
      totalExecutions: total,
      selectedJobId: selectedId,
      recentExecutions: items.slice(0, 5).map((j) => ({
        jobId: j.id,
        status: j.status,
        createdAt: j.createdAt,
        rowCount: j.totalRows,
      })),
    },
    actions: {
      LIST: JOB_LIST_ACTION_CONTRACT,
      SELECT: JOB_SELECT_ACTION_CONTRACT,
      REFRESH: JOB_REFRESH_ACTION_CONTRACT,
      CANCEL: JOB_CANCEL_ACTION_CONTRACT,
      GET_DETAIL: JOB_DETAIL_ACTION_CONTRACT,
    },
    handlers: {
      GET_DETAIL: async (payload) => {
        const targetId = String(payload?.jobId || selectedId || activeJobId || "");
        if (targetId && sameJobId(targetId, selectedId)) {
          let parsedRequest: Record<string, unknown> = {};
          try {
            if (inputJson && inputJson.trim()) {
              parsedRequest = JSON.parse(inputJson);
            }
          } catch {}
          return {
            status: "ok",
            jobId: targetId,
            summary: {
              status: selectedJob?.status || selectedDisplayStatus || "Unknown",
              owner: "Sistem",
              createdAt: selectedJob?.createdAt || "",
              completedAt: selectedJob?.completedAt || null,
              durationMs:
                selectedJob?.createdAt && selectedJob?.completedAt
                  ? new Date(selectedJob.completedAt).getTime() - new Date(selectedJob.createdAt).getTime()
                  : undefined,
              totalRows: selectedJob?.totalRows ?? 0,
              batchCount: selectedJob?.batchCount ?? 0,
            },
            progress: {
              phase: progressPhase,
              totalEvents: progressEvents.length,
              events: progressEvents.map((e, idx) => ({
                phase: e.title || e.eventName || `step-${idx + 1}`,
                message: e.detail || "",
                elapsedMs:
                  e.at && selectedJob?.createdAt
                    ? Math.max(0, new Date(e.at).getTime() - new Date(selectedJob.createdAt).getTime())
                    : 0,
              })),
            },
            requestInput: parsedRequest,
            message: `Execution detail retrieved from active panel for job ${targetId}.`,
          };
        }
        return executeDispatchComponentAction({ component_id: "job_history", action: "GET_DETAIL", payload });
      },
      LIST: async (payload) => {
        const limit = typeof payload?.limit === "number" ? Math.min(10, Math.max(1, payload.limit)) : 10;
        const slice = items.slice(0, limit).map((j) => ({
          jobId: j.id,
          report: jobName,
          status: j.status,
          createdAt: j.createdAt,
          rowCount: j.totalRows,
          href: openJobHref ? openJobHref(j.id) : undefined,
        }));
        return {
          status: "ok",
          report: jobName,
          total,
          loadedCount: items.length,
          executions: slice,
          message: `Panel has ${items.length} execution(s) loaded (total: ${total}) for ${jobName}.`,
        };
      },
      REFRESH: async () => {
        await loadList();
        return { status: "ok", message: `Refreshed execution list for ${jobName}.` };
      },
      SELECT: async (payload) => {
        const targetId = String(payload.jobId);
        setSelectedId(targetId);
        onOpenJob?.(targetId);
        return { status: "ok", selectedJobId: targetId };
      },
      CANCEL: async (payload) => {
        const targetId = String(payload?.jobId || activeJobId || "");
        if (targetId) {
          await cancelArrowJob(targetId);
          return { status: "ok", jobId: targetId, message: `Cancelled job ${targetId}` };
        }
        return executeDispatchComponentAction({ component_id: "job_history", action: "CANCEL", payload });
      },
    },
    onAction: async (action, payload) => {
      return executeDispatchComponentAction({ component_id: "job_history", action, payload });
    },
  });
}
