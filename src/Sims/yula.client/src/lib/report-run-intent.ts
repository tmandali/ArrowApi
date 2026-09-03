/**
 * Rapor kriter / çalıştırma niyet kapısı — kapalı fiil kümeleri.
 * Eksik niyette (yalnız "geçen hafta" vb.) form doldurma ve job başlatma yasak.
 */

const RUN_INTENT_RE =
  /(?:^|[^\p{L}\p{N}])(?:çalıştır(?:ın|ma|mayı)?|calistir(?:in|ma|mayı)?|run(?:\s+et(?:sin|tir)?)?|execute|job\s+başlat|job\s+baslat)(?:$|[^\p{L}\p{N}])/iu;

const APPLY_INTENT_RE =
  /(?:^|[^\p{L}\p{N}])(?:(?:\d+\.?\s*)?öneriyi\s+uygula|forma\s+doldur|forma\s+yaz|uygula|dünü\s+seç|dunu\s+sec|bugünü\s+seç|bugunu\s+sec|(?:tarih(?:i)?|kriter(?:leri)?|öneri(?:yi)?)\s+seç)(?:$|[^\p{L}\p{N}])/iu;

export const INCOMPLETE_INTENT_HINT =
  "Niyet tamamlanmadı. Formu doldurmadan ve job başlatmadan kullanıcıya 1-2 yula-criteria öneri chip'i sun; onay ('forma doldur' / 'uygula') veya açık çalıştırma fiili ('raporu çalıştır') bekle.";

/** Açık çalıştırma fiili: çalıştır / run / execute / job başlat (çalışan eşleşmez). */
export function hasExplicitReportRunIntent(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  return RUN_INTENT_RE.test(t);
}

/** Açık doldurma/onay fiili: uygula / forma doldur / seç. */
export function hasExplicitCriteriaApplyIntent(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  return APPLY_INTENT_RE.test(t);
}

export type IncompleteIntentBlocked = {
  status: "blocked";
  reason: "incomplete-intent";
  hint: string;
  message: string;
};

export function blockedIncompleteIntent(
  toolName: "run_job" | "run_report" | "apply_criteria",
): IncompleteIntentBlocked {
  const action =
    toolName === "apply_criteria"
      ? "kriter formu doldurulmadı"
      : "job başlatılmadı";
  return {
    status: "blocked",
    reason: "incomplete-intent",
    hint: INCOMPLETE_INTENT_HINT,
    message: `Eksik niyet: ${action}. ${INCOMPLETE_INTENT_HINT}`,
  };
}
