/**
 * Rapor çalıştırma otobüsü: kriter ekranı sahibi (örn. ReportCriteriaShell) aktif raporun
 * "Çalıştır" akışını buraya kaydeder; jenerik run_job aracı bunu tetikler.
 * Böylece rapor başına araç yazmak yerine TEK jenerik araç yeterlidir.
 */

import type { ArrowJobStatus } from "@/features/jobs/types"
import { createAiChannel } from "@/lib/ai-channel"

export { reportExecutionHref } from "@/lib/workspace-paths"

const runners = new Map<string, () => void>();

function norm(scope: string): string {
  return String(scope || "").trim().toLowerCase().replace(/-/g, "_");
}

export function registerReportRunner(
  scope: string,
  fn: () => void
): () => void {
  const key = norm(scope);
  runners.set(key, fn);
  return () => {
    const cur = runners.get(key);
    if (cur === fn) runners.delete(key);
  };
}

/** Çalıştırıcı yoksa false döner — aracı hata mesajıyla yanıtlamak için. */
export function triggerReportRun(scope: string): boolean {
  const fn = runners.get(norm(scope));
  if (!fn) return false;
  fn();
  return true;
}

const EXECUTION_FOCUS_EVENT = "yula:select-execution-job"

export type ExecutionJobFocus = {
  scope: string
  job: ArrowJobStatus
  request?: Record<string, unknown>
}

const executionFocusChannel = createAiChannel<ExecutionJobFocus>({
  name: EXECUTION_FOCUS_EVENT,
  scopeOf: (focus) => norm(focus.scope),
})

/** Yeni job'ı execution ekranında seçili/çalışır durumda göstermek için kuyruğa alır. */
export function focusReportExecution(focus: ExecutionJobFocus): void {
  executionFocusChannel.request(focus)
}

export function takePendingExecutionFocus(scope: string): ExecutionJobFocus | null {
  return executionFocusChannel.take(norm(scope))
}

export function subscribeExecutionFocus(
  scope: string,
  handler: (focus: ExecutionJobFocus) => void,
): () => void {
  return executionFocusChannel.subscribe((focus) => {
    if (!focus?.job?.id) return
    if (norm(focus.scope) !== norm(scope)) return
    handler(focus)
  })
}
