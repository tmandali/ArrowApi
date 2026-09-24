/**
 * Arrow Jobs Execution Engine State Types & Context Resolver.
 * Pure TypeScript (Server-safe, zero React/DOM imports).
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
 * Resolves focused Arrow Job context from active components and screen parameters.
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
