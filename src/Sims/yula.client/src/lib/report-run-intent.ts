/**
 * Rapor kriter / çalıştırma niyet kapısı — kapalı fiil kümeleri.
 * Eksik niyette (yalnız "geçen hafta" vb.) form doldurma ve job başlatma yasak.
 */

const RUN_INTENT_RE =
  /(?:^|[^\p{L}\p{N}])(?:çalıştır(?:ın|ma|mayı)?|calistir(?:in|ma|mayı)?|run(?:\s+et(?:sin|tir)?)?|execute|start(?:\s+the)?\s+(?:job|report)?|launch(?:\s+the)?\s+(?:job|report)?|job\s+başlat|job\s+baslat)(?:$|[^\p{L}\p{N}])/iu;

export const INCOMPLETE_INTENT_HINT =
  "Intent incomplete. Do not start a background report job. Present 1-2 criteria suggestion chips to the user in their active language and wait for explicit confirmation or a run verb (e.g. 'run', 'execute', 'çalıştır').";

/** Açık çalıştırma fiili: çalıştır / run / execute / start / launch / job başlat. */
export function hasExplicitReportRunIntent(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  return RUN_INTENT_RE.test(t);
}

export type IncompleteIntentBlocked = {
  status: "blocked";
  reason: "incomplete-intent";
  hint: string;
  message: string;
};

export function blockedIncompleteIntent(
  toolName: "run_job" | "run_report",
): IncompleteIntentBlocked {
  const target = toolName === "run_job" ? "Job" : "Report";
  return {
    status: "blocked",
    reason: "incomplete-intent",
    hint: INCOMPLETE_INTENT_HINT,
    message: `Incomplete intent: ${target} was not started. ${INCOMPLETE_INTENT_HINT}`,
  };
}
