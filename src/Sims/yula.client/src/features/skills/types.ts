/**
 * Core type definitions for Client-side Pyodide Skills & Event Hub Architecture.
 */

export type SkillLifecycleStatus = "draft" | "released"

export type SkillExecutionStatus =
  | "queued"
  | "initializing"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"

export interface SkillDefinition {
  id: string
  name: string
  description: string
  instructions: string
  scriptCode?: string
  requiredPackages?: string[]
  status: SkillLifecycleStatus
  version: string
  author?: string
  createdAt: string
  updatedAt: string
}

export interface SkillExecutionSnapshot {
  executionId: string
  skillId?: string
  skillName: string
  status: SkillExecutionStatus
  logs: string[]
  progress?: number
  result?: unknown
  arrowResult?: Uint8Array | null
  error?: string | null
  startedAt: string
  completedAt?: string
  durationMs?: number
}

export interface SkillRunOptions {
  skillId?: string
  packages?: string[]
  timeoutMs?: number
  arrowBuffer?: Uint8Array
  variables?: Record<string, unknown>
}

export type SkillWorkerRequest =
  | { action: "INIT"; basePyodideUrl?: string }
  | {
      action: "RUN"
      executionId: string
      skillName: string
      code: string
      packages?: string[]
      variables?: Record<string, unknown>
      arrowBuffer?: Uint8Array
    }
  | { action: "ABORT"; executionId: string }

export type SkillWorkerResponse =
  | { type: "INIT_DONE"; readyPackages: string[] }
  | { type: "STDOUT"; executionId: string; text: string }
  | { type: "STDERR"; executionId: string; text: string }
  | { type: "PROGRESS"; executionId: string; progress: number; message?: string }
  | {
      type: "RESULT"
      executionId: string
      result: unknown
      arrowResult?: Uint8Array
    }
  | { type: "ERROR"; executionId: string; error: string }

export type SkillHubEventDetail = {
  executionId: string
  eventType: "snapshot" | "stdout" | "stderr" | "progress" | "complete" | "error"
  snapshot: SkillExecutionSnapshot
  text?: string
}
