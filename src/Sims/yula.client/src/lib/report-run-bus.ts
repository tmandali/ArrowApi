/**
 * Rapor çalıştırma otobüsü: kriter ekranı sahibi (örn. StockModuleShell) aktif raporun
 * "Çalıştır" akışını buraya kaydeder; jenerik run_report aracı bunu tetikler.
 * Böylece rapor başına araç yazmak yerine TEK jenerik araç yeterlidir.
 */

import type { ArrowJobStatus } from "@/features/jobs/types"

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

let pendingExecutionFocus: ExecutionJobFocus | null = null

/** Yeni job'ı execution ekranında seçili/çalışır durumda göstermek için kuyruğa alır. */
export function focusReportExecution(focus: ExecutionJobFocus): void {
  pendingExecutionFocus = focus
  if (typeof window === "undefined") return
  window.dispatchEvent(new CustomEvent(EXECUTION_FOCUS_EVENT, { detail: focus }))
}

export function takePendingExecutionFocus(scope: string): ExecutionJobFocus | null {
  if (!pendingExecutionFocus) return null
  if (norm(pendingExecutionFocus.scope) !== norm(scope)) return null
  const next = pendingExecutionFocus
  pendingExecutionFocus = null
  return next
}

export function subscribeExecutionFocus(
  scope: string,
  handler: (focus: ExecutionJobFocus) => void,
): () => void {
  if (typeof window === "undefined") return () => {}
  const onEvent = (event: Event) => {
    const detail = (event as CustomEvent<ExecutionJobFocus>).detail
    if (!detail?.job?.id) return
    if (norm(detail.scope) !== norm(scope)) return
    pendingExecutionFocus = null
    handler(detail)
  }
  window.addEventListener(EXECUTION_FOCUS_EVENT, onEvent)
  return () => window.removeEventListener(EXECUTION_FOCUS_EVENT, onEvent)
}
