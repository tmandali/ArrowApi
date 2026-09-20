import type {
  SkillExecutionSnapshot,
  SkillHubEventDetail,
  SkillRunOptions,
  SkillWorkerRequest,
  SkillWorkerResponse,
} from "../types"

const DEFAULT_TIMEOUT_MS = 30_000

/**
 * Singleton EventTarget-based Event Hub for managing client-side Skill executions.
 * Manages the Pyodide Web Worker lifecycle, event streaming (stdout/stderr/progress),
 * execution replay snapshots, and abort/timeout safety.
 */
export class SkillEventHub extends EventTarget {
  private static instance: SkillEventHub | null = null
  private worker: Worker | null = null
  private currentActiveExecutionId: string | null = null
  private sessions = new Map<
    string,
    {
      snapshot: SkillExecutionSnapshot
      timeoutTimer?: ReturnType<typeof setTimeout> | null
    }
  >()

  private constructor() {
    super()
    this.initWorker()
  }

  static getInstance(): SkillEventHub {
    if (!SkillEventHub.instance) {
      SkillEventHub.instance = new SkillEventHub()
    }
    return SkillEventHub.instance
  }

  private initWorker(): void {
    if (typeof window === "undefined") return

    try {
      this.worker = new Worker(
        new URL("../../../services/skills/pyodide.worker.ts", import.meta.url),
        { type: "module" }
      )

      this.worker.onmessage = (event: MessageEvent<SkillWorkerResponse>) => {
        this.handleWorkerMessage(event.data)
      }

      this.worker.onerror = (err) => {
        console.error("[SkillEventHub] Worker error:", err)
        if (this.currentActiveExecutionId) {
          this.emitError(
            this.currentActiveExecutionId,
            `Worker error: ${err.message || "Unknown worker failure"}`
          )
        }
      }

      // Trigger background warmup
      const req: SkillWorkerRequest = { action: "INIT" }
      this.worker.postMessage(req)
    } catch (err) {
      console.warn("[SkillEventHub] Worker initialization deferred/failed:", err)
    }
  }

  /**
   * Resets worker if killed by timeout or abort.
   */
  private resetWorker(): void {
    if (this.worker) {
      this.worker.terminate()
      this.worker = null
    }
    this.currentActiveExecutionId = null
    this.initWorker()
  }

  /**
   * Dispatches a new skill execution.
   * Returns the unique executionId.
   */
  dispatchRun(
    skillName: string,
    code: string,
    options?: SkillRunOptions
  ): string {
    const executionId = crypto.randomUUID()
    const now = new Date().toISOString()

    const snapshot: SkillExecutionSnapshot = {
      executionId,
      skillId: options?.skillId,
      skillName,
      status: "queued",
      logs: [],
      progress: 0,
      startedAt: now,
    }

    const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS
    const timeoutTimer = setTimeout(() => {
      this.handleTimeout(executionId, timeoutMs)
    }, timeoutMs)

    this.sessions.set(executionId, { snapshot, timeoutTimer })
    this.currentActiveExecutionId = executionId

    // Notify queued
    this.emitEvent(executionId, "snapshot", snapshot)

    if (!this.worker) {
      this.initWorker()
    }

    snapshot.status = "running"
    this.emitEvent(executionId, "snapshot", snapshot)

    const req: SkillWorkerRequest = {
      action: "RUN",
      executionId,
      skillName,
      code,
      packages: options?.packages,
      variables: options?.variables,
      arrowBuffer: options?.arrowBuffer,
    }

    if (options?.arrowBuffer) {
      this.worker?.postMessage(req, [options.arrowBuffer.buffer])
    } else {
      this.worker?.postMessage(req)
    }

    return executionId
  }

  /**
   * Aborts an ongoing execution and safely restarts the worker if needed.
   */
  abort(executionId: string): void {
    const session = this.sessions.get(executionId)
    if (!session) return

    if (session.timeoutTimer) {
      clearTimeout(session.timeoutTimer)
      session.timeoutTimer = null
    }

    session.snapshot.status = "cancelled"
    session.snapshot.completedAt = new Date().toISOString()
    session.snapshot.logs.push("[SkillEventHub] Execution cancelled by user.")

    this.emitEvent(executionId, "complete", session.snapshot)

    if (this.currentActiveExecutionId === executionId) {
      // Force terminate and spawn clean worker
      this.resetWorker()
    }
  }

  private handleTimeout(executionId: string, timeoutMs: number): void {
    const session = this.sessions.get(executionId)
    if (!session || session.snapshot.status !== "running") return

    session.snapshot.status = "cancelled"
    session.snapshot.completedAt = new Date().toISOString()
    session.snapshot.error = `Timeout: Execution exceeded limit of ${timeoutMs / 1000}s.`
    session.snapshot.logs.push(`[SkillEventHub] ${session.snapshot.error}`)

    this.emitEvent(executionId, "error", session.snapshot)

    if (this.currentActiveExecutionId === executionId) {
      this.resetWorker()
    }
  }

  private handleWorkerMessage(msg: SkillWorkerResponse): void {
    if (msg.type === "INIT_DONE") {
      return
    }

    const session = this.sessions.get(msg.executionId)
    if (!session) return

    const { snapshot } = session

    switch (msg.type) {
      case "STDOUT": {
        snapshot.logs.push(msg.text)
        this.emitEvent(msg.executionId, "stdout", snapshot, msg.text)
        break
      }
      case "STDERR": {
        snapshot.logs.push(`[stderr] ${msg.text}`)
        this.emitEvent(msg.executionId, "stderr", snapshot, msg.text)
        break
      }
      case "PROGRESS": {
        snapshot.progress = msg.progress
        this.emitEvent(msg.executionId, "progress", snapshot, msg.message)
        break
      }
      case "RESULT": {
        if (session.timeoutTimer) {
          clearTimeout(session.timeoutTimer)
          session.timeoutTimer = null
        }
        snapshot.status = "completed"
        snapshot.result = msg.result
        snapshot.arrowResult = msg.arrowResult
        snapshot.completedAt = new Date().toISOString()
        const start = new Date(snapshot.startedAt).getTime()
        snapshot.durationMs = Date.now() - start

        this.emitEvent(msg.executionId, "complete", snapshot)
        if (this.currentActiveExecutionId === msg.executionId) {
          this.currentActiveExecutionId = null
        }
        break
      }
      case "ERROR": {
        this.emitError(msg.executionId, msg.error)
        break
      }
    }
  }

  private emitError(executionId: string, error: string): void {
    const session = this.sessions.get(executionId)
    if (!session) return

    if (session.timeoutTimer) {
      clearTimeout(session.timeoutTimer)
      session.timeoutTimer = null
    }

    session.snapshot.status = "failed"
    session.snapshot.error = error
    session.snapshot.logs.push(`[Error] ${error}`)
    session.snapshot.completedAt = new Date().toISOString()

    this.emitEvent(executionId, "error", session.snapshot)
    if (this.currentActiveExecutionId === executionId) {
      this.currentActiveExecutionId = null
    }
  }

  private emitEvent(
    executionId: string,
    eventType: SkillHubEventDetail["eventType"],
    snapshot: SkillExecutionSnapshot,
    text?: string
  ): void {
    const detail: SkillHubEventDetail = {
      executionId,
      eventType,
      snapshot: { ...snapshot },
      text,
    }

    // Generic execution event
    this.dispatchEvent(new CustomEvent(`skill:${executionId}`, { detail }))
    // Broad event
    this.dispatchEvent(new CustomEvent("skill:event", { detail }))
  }

  getSnapshot(executionId: string): SkillExecutionSnapshot | undefined {
    return this.sessions.get(executionId)?.snapshot
  }

  getLogs(executionId: string): string[] {
    return this.sessions.get(executionId)?.snapshot.logs ?? []
  }
}

export const skillEventHub = SkillEventHub.getInstance()
