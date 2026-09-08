/**
 * Rapor kriter / çalıştırma niyet kapısı — kapalı fiil kümeleri.
 * Eksik niyette (yalnız "geçen hafta" vb.) form doldurma ve job başlatma yasak.
 */

const RUN_INTENT_RE =
  /(?:^|[^\p{L}\p{N}])(?:çalıştır(?:ın|ma|mayı)?|calistir(?:in|ma|mayı)?|run(?:\s+et(?:sin|tir)?)?|execute|job\s+başlat|job\s+baslat)(?:$|[^\p{L}\p{N}])/iu;

const APPLY_INTENT_RE =
  /(?:^|[^\p{L}\p{N}])(?:(?:\d+\.?\s*)?öneriyi\s+uygula|forma\s+yaz|doldur(?:un|unuz|ur\s+musun(?:uz)?|abilir\s+misin(?:iz)?)?|uygula(?:yın|yınız|r\s+mısın(?:ız)?|yabilir\s+misin(?:iz)?)?|ayarla(?:yın|yınız|r\s+mısın(?:ız)?|yabilir\s+misin(?:iz)?)?|aktar(?:ın|ınız|ır\s+mısın(?:ız)?|abilir\s+misin(?:iz)?)?|seç(?:in|iniz|er\s+misin(?:iz)?|ebilir\s+misin(?:iz)?)?|sec(?:in|iniz|er\s+misin(?:iz)?|ebilir\s+misin(?:iz)?)?)(?:$|[^\p{L}\p{N}])/iu;

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
