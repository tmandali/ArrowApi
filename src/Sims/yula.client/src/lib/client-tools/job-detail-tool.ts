import { z } from "zod";
import {
  fetchJobStatus,
  fetchJobRequest,
  fetchJobEventLog,
} from "@/features/jobs/arrow-job-client";
import { buildRunEventsFromLog } from "@/features/jobs/run-events";
import { useActiveJobsStore } from "@/store/slices/active-jobs-store";
import { useYulaGridStore } from "@/lib/stores/grid";

import type { ActionContract } from "@my-agent/core";

/**
 * Zod/JSON Schema Action Contract for `job_history.actions.GET_DETAIL`.
 */
export const JOB_DETAIL_ACTION_CONTRACT = {
  description:
    "Fetches comprehensive execution details of a report run, including status summary, live/persisted progress events, and request input JSON ({ jobId?: string }). Defaults to the currently selected or active job if omitted.",
  inputSchema: z.object({
    jobId: z
      .string()
      .optional()
      .describe(
        "Job GUID to inspect. When omitted, inspects the currently selected job in the panel or active report job on screen.",
      ),
  }),
  outputSchema: z.object({
    status: z.string(),
    jobId: z.string(),
    summary: z.object({
      status: z.string().describe("Job status (Queued, Running, Completed, Failed, Cancelled)"),
      owner: z.string().describe("Initiator of the report run (e.g. Sistem, user name)"),
      createdAt: z.string().describe("Creation timestamp"),
      completedAt: z.string().nullable().optional().describe("Completion timestamp"),
      durationMs: z.number().optional().describe("Execution duration in milliseconds"),
      totalRows: z.number().optional().describe("Total result rows produced"),
      batchCount: z.number().optional().describe("Total batch count"),
    }),
    progress: z.object({
      phase: z.string().describe("Current phase"),
      totalEvents: z.number().describe("Count of recorded timeline events"),
      events: z.array(
        z.object({
          phase: z.string(),
          message: z.string().describe("Event log message"),
          elapsedMs: z.number().describe("Time offset from start in milliseconds"),
        }),
      ),
    }),
    requestInput: z
      .record(z.string(), z.any())
      .describe("Input parameters and criteria submitted for this execution"),
    message: z.string().optional(),
    error: z.string().optional(),
  }),
  whenToCall:
    "When the user asks for detailed execution metrics, progress timeline, step events, error logs, or the exact criteria parameters used in a report run.",
  whenNotToCall:
    "When the user only asks for a high-level list or count of past runs (use LIST instead).",
} satisfies ActionContract;

export type JobDetailInput = z.infer<typeof JOB_DETAIL_ACTION_CONTRACT.inputSchema>;
export type JobDetailOutput = z.infer<typeof JOB_DETAIL_ACTION_CONTRACT.outputSchema>;


/**
 * Resolves the target jobId from arguments, active jobs store, or current URL.
 */
function resolveTargetJobId(explicitJobId?: unknown): string {
  const explicit = typeof explicitJobId === "string" ? explicitJobId.trim() : "";
  if (explicit) return explicit;

  try {
    const gridState = useYulaGridStore.getState();
    if (gridState.screen?.jobId) return gridState.screen.jobId.trim();
  } catch {}

  try {
    const activeJobs = useActiveJobsStore.getState();
    // Check tracked jobs
    const jobs = Object.values(activeJobs.jobs);
    if (jobs.length > 0) {
      const sorted = [...jobs].sort((a, b) =>
        (b.createdAt || "").localeCompare(a.createdAt || ""),
      );
      if (sorted[0]?.id) return sorted[0].id;
    }
  } catch {}

  if (typeof window !== "undefined") {
    try {
      const url = new URL(window.location.href);
      const qJob = url.searchParams.get("jobId") || url.searchParams.get("job");
      if (qJob) return qJob.trim();

      const segments = url.pathname.split("/").filter(Boolean);
      const lastSegment = segments[segments.length - 1];
      if (
        lastSegment &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          lastSegment,
        )
      ) {
        return lastSegment;
      }
    } catch {}
  }

  return "";
}

/**
 * Executes the `GET_DETAIL` action for a report execution job.
 */
export async function getJobDetailTool(
  args: Record<string, unknown>,
): Promise<unknown> {
  const targetJobId = resolveTargetJobId(args.jobId);
  if (!targetJobId) {
    return {
      status: "error",
      jobId: "",
      message:
        "No job specified or active on screen. Provide a jobId parameter or select an execution first.",
    };
  }

  try {
    // 1. Fetch Job Status & Summary
    const job = await fetchJobStatus(targetJobId);
    if (!job) {
      return {
        status: "not_found",
        jobId: targetJobId,
        message: `Report job with ID ${targetJobId} was not found.`,
      };
    }

    // 2. Fetch Request Input Criteria
    let requestInput: Record<string, unknown> = {};
    try {
      const req = await fetchJobRequest(targetJobId);
      if (req && typeof req === "object") {
        requestInput = req;
      }
    } catch {
      // Keep empty if request criteria cannot be fetched
    }

    // 3. Fetch Event Logs & Progress
    let eventItems: Array<{ phase: string; message: string; elapsedMs: number }> = [];
    try {
      const rawHubMessages = await fetchJobEventLog(targetJobId);
      const parsedEvents = buildRunEventsFromLog(rawHubMessages);
      eventItems = parsedEvents.map((e, idx) => ({
        phase: e.title || e.eventName || `step-${idx + 1}`,
        message: e.detail || "",
        elapsedMs:
          e.at && job?.createdAt
            ? Math.max(0, new Date(e.at).getTime() - new Date(job.createdAt).getTime())
            : 0,
      }));
    } catch {
      // Keep empty if event logs cannot be fetched
    }

    return {
      status: "ok",
      jobId: targetJobId,
      summary: {
        status: job.status,
        owner: (job as any).owner || "Sistem",
        createdAt: job.createdAt || "",
        completedAt: job.completedAt || null,
        durationMs:
          job.createdAt && job.completedAt
            ? new Date(job.completedAt).getTime() - new Date(job.createdAt).getTime()
            : undefined,
        totalRows: job.totalRows ?? 0,
        batchCount: job.batchCount ?? 0,
      },
      progress: {
        phase: job.status,
        totalEvents: eventItems.length,
        events: eventItems,
      },
      requestInput,
      message: `Execution detail retrieved for job ${targetJobId} (${job.status}).`,
    };
  } catch (err) {
    return {
      status: "error",
      jobId: targetJobId,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}
