/**
 * Yula Grid Tablosu Hücre Biçimlendiricisi — DuckDB WASM ham sayısal ve tutar
 * çıktılarını Türkçe yerel ayarlarına (tr-TR) göre binlik ayraçlı (1.250.000,50)
 * olarak biçimlendirir.
 */
export function formatGridCellValue(
  val: unknown,
  align?: "left" | "right",
  columnType?: string
): string {
  if (val === null || val === undefined || val === "") return "";

  if (val instanceof Date) {
    if (isNaN(val.getTime())) return "";
    return val.toISOString().slice(0, 10);
  }

  // 1. Kolon tipi "date" olarak biliniyorsa (veya adı Date/Tarih içeriyorsa)
  const isDateColumn = columnType === "date";

  if (typeof val === "number" || typeof val === "bigint") {
    const num = Number(val);
    if (!Number.isFinite(num)) return String(val);

    // Eğer tarih kolonuysa ve epoch ms (veya gün sayısı) geldiyse
    if (isDateColumn) {
      // Epoch ms (örn: 1786752000000 -> 2026-08-16)
      if (num > 100000000000) {
        const d = new Date(num);
        if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
      }
      // Epoch seconds (örn: 1786752000)
      if (num > 1000000000) {
        const d = new Date(num * 1000);
        if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
      }
      // Epoch days (Date32: 0-100000 gün, 2026 yılı ~ 20681)
      if (num > 0 && num < 100000) {
        const d = new Date(num * 86400000);
        if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
      }
    }

    // Tarih kolonu değilse veya eşleşmediyse ama çok büyük bir epoch ms timestamp'iyse (1.7 trilyon)
    if (!isDateColumn && num >= 1000000000000 && num <= 2500000000000 && Number.isInteger(num)) {
      const d = new Date(num);
      if (!isNaN(d.getTime()) && d.getFullYear() >= 2000 && d.getFullYear() <= 2100) {
        return d.toISOString().slice(0, 10);
      }
    }

    if (Number.isInteger(num)) {
      return new Intl.NumberFormat("tr-TR").format(num);
    }
    return new Intl.NumberFormat("tr-TR", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
  }

  // ISO veya tarih-zaman formatındaki stringleri (örn: "2026-08-16T00:00:00.000Z") temiz "YYYY-MM-DD" yap
  if (typeof val === "string") {
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(val)) {
      return val.slice(0, 10);
    }

    // Sayısal string olarak epoch ms geldiyse ("1786752000000")
    if (isDateColumn || /^\d{12,14}$/.test(val.trim())) {
      const num = Number(val.trim());
      if (num >= 1000000000000 && num <= 2500000000000) {
        const d = new Date(num);
        if (!isNaN(d.getTime()) && d.getFullYear() >= 2000 && d.getFullYear() <= 2100) {
          return d.toISOString().slice(0, 10);
        }
      }
    }
  }

  // 2. Boolean tipleri (true/false)
  if (typeof val === "boolean") {
    return val ? "Evet" : "Hayır";
  }

  // 3. Array ve Nesne (JSON / Struct / List) tipleri
  if (typeof val === "object") {
    if (Array.isArray(val)) {
      return val.map((v) => (typeof v === "object" ? JSON.stringify(v) : String(v))).join(", ");
    }
    return JSON.stringify(val);
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
