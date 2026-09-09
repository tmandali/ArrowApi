/**
 * Minimal UI dili sezgisi — istemci chrome/fallback metinleri için.
 * Model çıktısı bu karardan etkilenmez (LLM kullanıcının dilini aynalar);
 * yalnızca bizim yazdığımız sabit arayüz metinleri TR/EN seçilir.
 * Varsayılan "tr" (mevcut davranışı korur).
 */
export type YulaUiLang = "tr" | "en";

const TR_CHARS = /[çÇğĞıİöÖşŞüÜ]/;
const EN_HINT =
  /\b(the|and|for|with|from|report|run|show|what|when|how|please|export|filter|chart|last|first|open|total|average)\b/i;

export function detectUserLanguage(text: string | undefined | null): YulaUiLang {
  if (!text || !text.trim()) return "tr";
  if (TR_CHARS.test(text)) return "tr";
  if (EN_HINT.test(text)) return "en";
  return "tr";
}

export function pickLang<T>(lang: YulaUiLang, tr: T, en: T): T {
  return lang === "tr" ? tr : en;
}
