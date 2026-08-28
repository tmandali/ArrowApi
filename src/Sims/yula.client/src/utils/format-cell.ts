/**
 * Yula Grid Tablosu Hücre Biçimlendiricisi — DuckDB WASM ham sayısal ve tutar
 * çıktılarını Türkçe yerel ayarlarına (tr-TR) göre binlik ayraçlı (1.250.000,50)
 * olarak biçimlendirir.
 */
export function formatGridCellValue(val: unknown, align?: "left" | "right"): string {
  if (val === null || val === undefined || val === "") return "";

  if (typeof val === "number" || typeof val === "bigint") {
    const num = Number(val);
    if (!Number.isFinite(num)) return String(val);
    if (Number.isInteger(num)) {
      return new Intl.NumberFormat("tr-TR").format(num);
    }
    return new Intl.NumberFormat("tr-TR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
  }

  if (typeof val === "string" && align === "right") {
    const trimmed = val.trim();
    if (trimmed !== "" && !isNaN(Number(trimmed))) {
      const num = Number(trimmed);
      if (Number.isInteger(num)) {
        return new Intl.NumberFormat("tr-TR").format(num);
      }
      return new Intl.NumberFormat("tr-TR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(num);
    }
  }

  return String(val);
}

/**
 * Kolon adını insan dostu Türkçe etiket biçimine dönüştürür (ör: "Toplam_Tutar" → "Toplam Tutar")
 */
export function formatColumnLabel(name: string): string {
  if (!name) return "";
  return name.replace(/_/g, " ").trim();
}
