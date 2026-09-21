/**
 * Canonical Arrow Job lifecycle states matching backend ArrowJobState enum.
 */
export type ArrowJobLifecycleState =
  | "Queued"
  | "Running"
  | "Completed"
  | "Failed"
  | "Cancelled"
  | "Idle";

/**
 * Normalizes loose or alternate status strings into a type-safe canonical lifecycle state.
 */
export function normalizeJobState(raw?: unknown): ArrowJobLifecycleState {
  if (typeof raw !== "string" || !raw.trim()) return "Idle";
  const s = raw.trim().toLowerCase();
  switch (s) {
    case "running":
      return "Running";
    case "queued":
      return "Queued";
    case "completed":
    case "done":
      return "Completed";
    case "failed":
    case "error":
      return "Failed";
    case "cancelled":
    case "canceled":
      return "Cancelled";
    case "idle":
      return "Idle";
    default:
      return "Idle";
  }
}

/**
 * Checks if a job has reached an irreversible terminal state.
 */
export function isTerminalJobState(status: ArrowJobLifecycleState): boolean {
  return status === "Completed" || status === "Failed" || status === "Cancelled";
}

/**
 * State snapshot summary of an Arrow Job execution.
 */
export interface ArrowJobSummary {
  jobId: string;
  status: ArrowJobLifecycleState;
  progressPhase?: string;
  currentStep?: string;
  durationMs?: number;
  totalRows?: number;
  error?: string;
}

/**
 * Execution context of an Arrow Job.
 */
export interface ArrowJobContext {
  reportScope?: string;
  activeJobId?: string | null;
  activeJob?: ArrowJobSummary | null;
  executionCount?: number;
}

/** Legacy type aliases for backward compatibility */
export type YulaActiveJobSummary = ArrowJobSummary;
export type YulaJobContext = ArrowJobContext;

export type ArrowJobStatus = {
  id: string
  status: string
  jobUrl: string
  eventsUrl: string
  createdAt?: string
  completedAt?: string | null
  error?: string | null
  batchCount?: number
  totalRows?: number
  name?: string
  rootJobId?: string
  /** Job başlatan kullanıcının OIDC sub kimliği; sistem job'larında null. */
  ownerId?: string | null
}

export type ArrowJobStatusList = {
  items: ArrowJobStatus[]
  total: number
}

export type ArrowJobEvent = {
  id: string
  status: string
  message?: string | null
  error?: string | null
  batchCount?: number
  totalRows?: number
  jobUrl?: string
  eventsUrl?: string
  createdAt?: string | null
  completedAt?: string | null
  occurredAt?: string | null
  name?: string
}

export type ArrowJobHubMessage = {
  eventName: string
  payload: ArrowJobEvent
}

