import type { ArrowJobStatus } from "../../types";

export function formatWhen(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(date);
}

export function sameJobId(a: string | null | undefined, b: string | null | undefined) {
  if (!a || !b) return false;
  return a.localeCompare(b, undefined, { sensitivity: "accent" }) === 0;
}

export function prettyJson(value: unknown): string {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return "{\n  \n}";
  }
}

export function displayStatusFor(
  job: ArrowJobStatus | null | undefined,
  activeJobId: string | null | undefined,
  liveStatus?: string
): string {
  if (job && sameJobId(job.id, activeJobId) && liveStatus) return liveStatus;
  return job?.status || "—";
}
