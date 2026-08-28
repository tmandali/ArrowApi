/**
 * Arrow/DuckDB şema tiplerinden türetilen jenerik filtre-değeri doğrulaması.
 * Kelime listesi YOKTUR — kontrol tamamen kolonun fiziksel tipinden gelir,
 * böylece yeni rapor/kolon eklendiğinde yeni kural yazmak gerekmez.
 */

export type ColumnKind = "date" | "number" | "bool" | "text"

/** Ham DuckDB tipini (DATE, TIMESTAMP, VARCHAR, DECIMAL...) kaba tipe çevirir. */
export function deriveColumnKind(duckType?: string, isNumeric?: boolean): ColumnKind {
  const t = (duckType || "").toUpperCase()
  if (!t) return isNumeric ? "number" : "text"
  if (t.includes("DATE") || t.includes("TIME")) return "date"
  if (t.includes("BOOL")) return "bool"
  if (
    t.includes("INT") ||
    t.includes("FLOAT") ||
    t.includes("DOUBLE") ||
    t.includes("DECIMAL") ||
    t.includes("NUMERIC") ||
    t.includes("REAL")
  ) {
    return "number"
  }
  return "text"
}

const DATE_LIKE_RE =
  /^\s*(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[./]\d{1,2}([./]\d{2,4})?)\s*(\.\.\s*(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[./]\d{1,2}([./]\d{2,4})?))?\s*$/

/** Tarih kolonuna yazılabilir değer: ISO/DD.MM/YYYY/aralık veya BC göreceli token. */
export function isDateLikeValue(v: string): boolean {
  const s = v.trim()
  if (!s) return false
  if (DATE_LIKE_RE.test(s)) return true
  return /^(today|dün|dun|bugün|bugun|ay|yıl|yil|m|cm|w|q|y)$/i.test(s)
}

/** Sayı kolonuna yazılabilir değer: yalnız rakam + BC operatör/aralık karakterleri. */
export function isNumericLikeValue(v: string): boolean {
  const s = v.trim()
  if (!s) return false
  return /^[\s<>!=|&.,\-+\d*]+$/.test(s) && /\d/.test(s)
}
