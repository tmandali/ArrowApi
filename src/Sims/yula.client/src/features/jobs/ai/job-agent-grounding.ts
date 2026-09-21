/**
 * Arrow Jobs Execution Engine AI Grounding & State Resolver.
 * Pure TypeScript (Server-safe, zero React/DOM imports) for Node.js API prompt generation.
 */
import type { ComponentSchema } from "@my-agent/core";

import {
  type ArrowJobLifecycleState,
  type ArrowJobSummary,
  type ArrowJobContext,
  type YulaActiveJobSummary,
  type YulaJobContext,
  normalizeJobState,
  isTerminalJobState,
} from "../types";

export {
  type ArrowJobLifecycleState,
  type ArrowJobSummary,
  type ArrowJobContext,
  type YulaActiveJobSummary,
  type YulaJobContext,
  normalizeJobState,
  isTerminalJobState,
};

/**
 * Bileşen listesinden ve ekran bağlamından odaklanılmış Arrow Job durumunu çözer.
 */
export function resolveEffectiveJobContext(
  context?: { jobId?: string; pathname?: string },
  activeComps: ComponentSchema[] = []
): ArrowJobContext | undefined {
  // 1. Doğrudan tekil iş bileşenini (arrow_job) ara
  const dedicatedJobComp = activeComps.find(
    (c) => c.id === "arrow_job" || c.id.startsWith("arrow_job:")
  );
  const dedicatedMeta = dedicatedJobComp?.meta as Record<string, unknown> | undefined;

  // 2. Havuz / katalog yöneticisini (arrow_job_manager / job_history) ara
  const managerComp = activeComps.find(
    (c) => c.id === "arrow_job_manager" || c.id === "job_history"
  );
  const managerMeta = managerComp?.meta as Record<string, unknown> | undefined;
  const rawActive = (dedicatedMeta?.jobId ? dedicatedMeta : managerMeta?.activeJob) as Record<string, unknown> | undefined;

  const activeJob: ArrowJobSummary | null = rawActive && typeof rawActive.jobId === "string"
    ? {
        jobId: rawActive.jobId,
        status: normalizeJobState(rawActive.status),
        progressPhase: typeof (rawActive.phase ?? rawActive.progressPhase) === "string"
          ? (rawActive.phase ?? rawActive.progressPhase) as string
          : undefined,
        currentStep: typeof (rawActive.lastEventTitle ?? rawActive.currentStep) === "string"
          ? (rawActive.lastEventTitle ?? rawActive.currentStep) as string
          : undefined,
        durationMs: typeof rawActive.durationMs === "number" ? rawActive.durationMs : undefined,
        totalRows: typeof rawActive.totalRows === "number" ? rawActive.totalRows : undefined,
        error: typeof rawActive.error === "string" ? rawActive.error : undefined,
      }
    : null;

  const activeJobId = activeJob?.jobId || context?.jobId || (typeof managerMeta?.selectedJobId === "string" ? managerMeta.selectedJobId : null);

  if (!activeJobId && !managerMeta && !dedicatedMeta) {
    return undefined;
  }

  return {
    reportScope: (typeof dedicatedMeta?.reportScope === "string" ? dedicatedMeta.reportScope : undefined) ||
                 (typeof managerMeta?.reportScope === "string" ? managerMeta.reportScope : undefined),
    activeJobId,
    activeJob,
    executionCount: typeof managerMeta?.totalExecutions === "number" ? managerMeta.totalExecutions : undefined,
  };
}

/**
 * Arrow Job durumunu ve yaşam döngüsünü durum makinesine (State Machine) uygun formatlar.
 */
export function formatJobEnginePromptGrounding(jobContext?: ArrowJobContext): string | null {
  if (!jobContext?.activeJobId && !jobContext?.activeJob) {
    return null;
  }

  const job = jobContext.activeJob;
  if (!job) {
    return `• Focused Arrow Job: "${jobContext.activeJobId}" (Status: Unknown).`;
  }

  switch (job.status) {
    case "Running":
    case "Queued": {
      const stepInfo = job.currentStep ? `, Step: "${job.currentStep}"` : "";
      const phaseInfo = job.progressPhase ? `, Phase: "${job.progressPhase}"` : "";
      return [
        `• Focused Arrow Job: "${job.jobId}" (Status: ${job.status}${phaseInfo}${stepInfo}).`,
        `  - Calculation is currently streaming over SSE. DO NOT run SQL or filter on 'result_grid:active' until completed.`,
        `  - To cancel: call dispatch_component_action (component_id="arrow_job", action="CANCEL").`,
      ].join("\n");
    }

    case "Completed": {
      const rows = job.totalRows != null ? `, Total Rows: ${job.totalRows}` : "";
      const dur = job.durationMs != null ? `, Duration: ${(job.durationMs / 1000).toFixed(1)}s` : "";
      return `• Focused Arrow Job: "${job.jobId}" (Status: Completed${rows}${dur}). Tabular dataset is loaded in 'result_grid:active'.`;
    }

    case "Failed": {
      const err = job.error ? `: "${job.error}"` : "";
      return `• Focused Arrow Job: "${job.jobId}" (Status: Failed${err}). Execution encountered an error; result grid is not available. Suggest retrying or checking input criteria.`;
    }

    case "Cancelled": {
      return `• Focused Arrow Job: "${job.jobId}" (Status: Cancelled). Execution was aborted.`;
    }

    case "Idle":
    default: {
      return `• Focused Arrow Job: "${job.jobId}" (Status: ${job.status}).`;
    }
  }
}

