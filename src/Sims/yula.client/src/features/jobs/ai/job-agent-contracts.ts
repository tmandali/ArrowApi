import { z } from "zod";
import type { ActionContract } from "@my-agent/core";

/**
 * Action contract to inspect the current live state of the focused Arrow Job.
 */
export const ARROW_JOB_STATUS_ACTION_CONTRACT = {
  description: "Get current status, execution step, progress phase, or error of the focused Arrow Job",
  inputSchema: z.object({
    jobId: z.string().optional().describe("Optional specific job GUID, defaults to current focused job"),
  }),
  outputSchema: z.object({
    status: z.string(),
    jobId: z.string().nullable().optional(),
    jobStatus: z.string().optional(),
    phase: z.string().optional(),
    currentStep: z.string().optional(),
    totalRows: z.number().optional(),
    durationMs: z.number().optional(),
    error: z.string().optional(),
    eventCount: z.number().optional(),
  }),
  whenToCall: "When checking the live calculation progress or state of the focused Arrow Job.",
  whenNotToCall: "When listing historical jobs or when no job is focused.",
} satisfies ActionContract;

/**
 * Action contract to cancel a running or queued Arrow Job.
 */
export const ARROW_JOB_CANCEL_ACTION_CONTRACT = {
  description: "Cancel a running or queued Arrow Job execution",
  inputSchema: z.object({
    jobId: z.string().optional().describe("Optional specific job GUID, defaults to active job"),
    reason: z.string().optional().describe("Reason for cancellation"),
  }),
  outputSchema: z.object({
    status: z.string(),
    jobId: z.string().optional(),
    message: z.string().optional(),
    error: z.string().optional(),
  }),
  whenToCall: "When the user or agent decides to abort or cancel a running calculation.",
  whenNotToCall: "When the job has already completed or failed.",
} satisfies ActionContract;

/**
 * Action contract to retrieve execution summary for a completed Arrow Job.
 */
export const ARROW_JOB_SUMMARY_ACTION_CONTRACT = {
  description: "Get execution summary, duration, and row metrics for a completed Arrow Job",
  inputSchema: z.object({
    jobId: z.string().optional().describe("Optional specific job GUID, defaults to active job"),
  }),
  outputSchema: z.object({
    status: z.string(),
    jobId: z.string().nullable().optional(),
    report: z.string().optional(),
    statusText: z.string().optional(),
    totalRows: z.number().optional(),
    batchCount: z.number().optional(),
    durationMs: z.number().optional(),
  }),
  whenToCall: "When needing execution metrics for a finished calculation.",
  whenNotToCall: "When the job is still calculating.",
} satisfies ActionContract;

export {
  JOB_OPEN_LAST_ACTION_CONTRACT,
  JOB_LIST_ACTION_CONTRACT,
  JOB_SELECT_ACTION_CONTRACT,
  JOB_REFRESH_ACTION_CONTRACT,
  JOB_CANCEL_ACTION_CONTRACT,
  JOB_FIND_ACTION_CONTRACT,
  JOB_DETAIL_ACTION_CONTRACT,
} from "@/lib/client-tools/job-history-contracts";

