/**
 * Per-message screen snapshot + diff (deterministic, no LLM, no regex).
 * The client sends a compact snapshot with every request; the server injects
 * it into the prompt so the model always grounds on live screen state.
 */

export interface ScreenSnapshotJob {
  id: string;
  status: string;
}

export interface ScreenSnapshot {
  scope?: string;
  criteria?: Record<string, string>;
  focusedJob?: ScreenSnapshotJob | null;
  executions?: ScreenSnapshotJob[];
  gridFilters?: Record<string, string>;
  /** Ekran-tanımlı ek değerler (jenerik, rapor/job dışı ekranlar için). */
  custom?: Record<string, string>;
  phase?: string;
  pathname?: string;
}

export interface ScreenSnapshotInput {
  scope?: string;
  draftRows?: Array<{ name: string; value: string }>;
  focusedJobId?: string;
  focusedJobStatus?: string;
  trackedJobs?: Array<{ id: string; status: string; createdAt?: string }>;
  gridFilters?: Record<string, string>;
  /** Ekranın state'e düşürdüğü ek değerler (ham, stringify edilir). */
  extra?: Record<string, unknown>;
  phase?: string;
  pathname?: string;
}

const MAX_EXECUTIONS = 10;
const MAX_DIFF_LINES = 10;

function shortId(id: string): string {
  return id.length > 8 ? id.slice(0, 8) : id;
}

/** Build a compact snapshot from plain store data (pure, testable). */
export function snapshotScreenState(input: ScreenSnapshotInput): ScreenSnapshot {
  const criteria: Record<string, string> = {};
  for (const row of input.draftRows ?? []) {
    const v = (row.value ?? "").trim();
    if (row.name && v) criteria[row.name] = v;
  }
  const executions = (input.trackedJobs ?? [])
    .slice()
    .sort((a, b) => String(b.createdAt ?? "").localeCompare(String(a.createdAt ?? "")))
    .slice(0, MAX_EXECUTIONS)
    .map((j) => ({ id: shortId(j.id), status: j.status }));
  const snap: ScreenSnapshot = {};
  if (input.scope) snap.scope = input.scope;
  if (Object.keys(criteria).length > 0) snap.criteria = criteria;
  if (input.focusedJobId) {
    snap.focusedJob = { id: shortId(input.focusedJobId), status: input.focusedJobStatus ?? "unknown" };
  }
  if (executions.length > 0) snap.executions = executions;
  if (input.gridFilters && Object.keys(input.gridFilters).length > 0) {
    snap.gridFilters = { ...input.gridFilters };
  }
  if (input.extra && typeof input.extra === "object") {
    const custom: Record<string, string> = {};
    for (const [k, v] of Object.entries(input.extra)) {
      if (v === undefined || v === null) continue;
      const s = typeof v === "string" ? v : JSON.stringify(v);
      if (s.trim()) custom[k] = s.length > 200 ? `${s.slice(0, 197)}...` : s;
    }
    if (Object.keys(custom).length > 0) snap.custom = custom;
  }
  if (input.phase) snap.phase = input.phase;
  if (input.pathname) snap.pathname = input.pathname;
  return snap;
}

function criteriaDiff(
  prev: Record<string, string> | undefined,
  curr: Record<string, string> | undefined,
  lines: string[],
): void {
  const p = prev ?? {};
  const c = curr ?? {};
  const keys = [...new Set([...Object.keys(p), ...Object.keys(c)])].sort();
  for (const k of keys) {
    if (lines.length >= MAX_DIFF_LINES) return;
    const before = p[k] ?? "";
    const after = c[k] ?? "";
    if (before === after) continue;
    if (!before) lines.push(`Criteria "${k}" set to "${after}".`);
    else if (!after) lines.push(`Criteria "${k}" cleared (was "${before}").`);
    else lines.push(`Criteria "${k}" changed from "${before}" to "${after}".`);
  }
}

/**
 * Structural diff vs the previously sent snapshot.
 * First turn (prev null) returns [] — the state block itself grounds the model.
 */
export function diffScreenSnapshots(
  prev: ScreenSnapshot | null,
  curr: ScreenSnapshot,
): string[] {
  if (!prev) return [];
  const lines: string[] = [];

  if ((prev.scope ?? "") !== (curr.scope ?? "") && curr.scope) {
    lines.push(`Active report changed to "${curr.scope}".`);
  }
  if ((prev.phase ?? "") !== (curr.phase ?? "") && curr.phase) {
    lines.push(`Screen phase changed to "${curr.phase}".`);
  }
  criteriaDiff(prev.criteria, curr.criteria, lines);

  const pf = prev.focusedJob;
  const cf = curr.focusedJob;
  if ((pf?.id ?? "") !== (cf?.id ?? "") && cf) {
    lines.push(`Focused job is now ${cf.id} (${cf.status}).`);
  } else if (cf && pf && pf.status !== cf.status) {
    lines.push(`Focused job ${cf.id}: ${pf.status} → ${cf.status}.`);
  }

  const prevExec = new Map((prev.executions ?? []).map((e) => [e.id, e.status]));
  for (const e of curr.executions ?? []) {
    if (lines.length >= MAX_DIFF_LINES) break;
    const oldStatus = prevExec.get(e.id);
    if (oldStatus === undefined) lines.push(`New job ${e.id} (${e.status}).`);
    else if (oldStatus !== e.status) lines.push(`Job ${e.id}: ${oldStatus} → ${e.status}.`);
  }

  const pg = prev.gridFilters ?? {};
  const cg = curr.gridFilters ?? {};
  for (const k of [...new Set([...Object.keys(pg), ...Object.keys(cg)])].sort()) {
    if (lines.length >= MAX_DIFF_LINES) break;
    if ((pg[k] ?? "") !== (cg[k] ?? "")) {
      lines.push(
        cg[k] ? `Grid filter "${k}" set to "${cg[k]}".` : `Grid filter "${k}" cleared.`,
      );
    }
  }

  const pc = prev.custom ?? {};
  const cc = curr.custom ?? {};
  for (const k of [...new Set([...Object.keys(pc), ...Object.keys(cc)])].sort()) {
    if (lines.length >= MAX_DIFF_LINES) break;
    if ((pc[k] ?? "") !== (cc[k] ?? "")) {
      lines.push(
        cc[k] ? `Screen value "${k}" is now "${cc[k]}".` : `Screen value "${k}" cleared.`,
      );
    }
  }
  return lines;
}
