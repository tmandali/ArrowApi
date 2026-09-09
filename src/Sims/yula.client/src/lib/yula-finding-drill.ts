/**
 * Analiz bulgusu tıklamasını bağlamlı LLM prompt'una dönüştürür — saf modül.
 *
 * Bulgu başlığı tek başına sohbete giderse ("Anonim müşteri yoğunluğu")
 * model tıklamanın neye ait olduğunu anlayamaz; bu fonksiyon başlık +
 * açıklamayı (sayılar, kolon adları) taşıyan bir tıklama-bağlamı üretir.
 */
import { detectUserLanguage, pickLang } from "./yula-lang";

export const FINDING_CLICK_MARK_TR = "[Analiz bulgusuna tıklandı]";
export const FINDING_CLICK_MARK_EN = "[Analysis finding clicked]";

/** Tıklanan bulguyu tespit eden sorguyu ürettiren istemci-tarafı prompt. */
/** Tıklanan bulguyu tespit eden sorguyu ürettiren istemci-tarafı prompt. */
export function buildFindingDrillPrompt(
  finding: string,
  sourceTable?: string | null,
): string {
  const clean = finding.replace(/\s+/g, " ").trim().slice(0, 500);
  return pickLang(
    detectUserLanguage(finding),
    `${FINDING_CLICK_MARK_TR} "${clean}" — Bu bulguyu tespit eden SQL sorgusunu üret ve run_expert_sql ile çalıştır; sonucu kısaca açıkla.` +
      (sourceTable
        ? ` Bu bulgu "${sourceTable}" tablosundan üretildi; tespit sorgusunda FROM "${sourceTable}" kullan (active_view değil).`
        : ""),
    `${FINDING_CLICK_MARK_EN} "${clean}" — Produce the SQL query that detected this finding and run it with run_expert_sql; briefly explain the result.` +
      (sourceTable
        ? ` This finding came from the "${sourceTable}" table; use FROM "${sourceTable}" in the detecting query (not active_view).`
        : ""),
  );
}
