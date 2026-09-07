/**
 * Yula Grid Tablosu Hücre Biçimlendiricisi — Şemadan gelen fiziksel kolon tipine
 * (DuckDB / Arrow schema) göre hücre değerini biçimlendirir.
 * Kelime listesi YOKTUR; kontrol doğrudan kolonun şema tipinden gelir.
 *
 * - INT / INTEGER / BIGINT vb. tamsayı kolonlar ham değer olarak gösterilir (44577625).
 * - DECIMAL / NUMERIC / FLOAT / DOUBLE tutar alanları Türkçe yerel ayarlarına göre (1.250,50) biçimlendirilir.
 * - DATE / TIMESTAMP alanları YYYY-MM-DD olarak gösterilir.
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

  const rawType = (columnType || "").toUpperCase();
  const isDateColumn = rawType === "DATE" || rawType.includes("DATE") || rawType.includes("TIME");
  const isIntegerType =
    rawType.includes("INT") ||
    rawType === "INTEGER" ||
    rawType === "BIGINT" ||
    rawType === "SMALLINT" ||
    rawType === "TINYINT" ||
    rawType === "HUGEINT";
  const isDecimalType =
    rawType.includes("DECIMAL") ||
    rawType.includes("NUMERIC") ||
    rawType.includes("FLOAT") ||
    rawType.includes("DOUBLE") ||
    rawType.includes("REAL");

  if (typeof val === "number" || typeof val === "bigint") {
    const num = Number(val);
    if (!Number.isFinite(num)) return String(val);

    // 1. Tarih kolonu ise ve epoch ms / gün sayısı geldiyse
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

    // Tarih kolonu değilse ama epoch ms timestamp ise
    if (!isDateColumn && num >= 1000000000000 && num <= 2500000000000 && Number.isInteger(num)) {
      const d = new Date(num);
      if (!isNaN(d.getTime()) && d.getFullYear() >= 2000 && d.getFullYear() <= 2100) {
        return d.toISOString().slice(0, 10);
      }
    }

    // 2. Şemada INT (tamsayı) olarak tanımlı alanlar veya herhangi bir tamsayı:
    // Şema tipi INT ise kesinlikle binlik ayracı almaz, ham değer gösterilir (örn: 44577625)
    if (isIntegerType || Number.isInteger(num)) {
      if (!isDecimalType) {
        return String(val);
      }
    }

    // 3. Şemada DECIMAL / NUMERIC / FLOAT gibi ondalıklı sayılar:
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

  // 4. Boolean tipleri (true/false)
  if (typeof val === "boolean") {
    return val ? "Evet" : "Hayır";
  }

  // 5. Array ve Nesne (JSON / Struct / List) tipleri
  if (typeof val === "object") {
    if (Array.isArray(val)) {
      return val.map((v) => (typeof v === "object" ? JSON.stringify(v) : String(v))).join(", ");
    }
    return JSON.stringify(val);
  }

  // 6. String olarak gelmiş sayısal değerler (yalnızca DECIMAL / FLOAT şema tipinde veya sağa hizalı ondalıklı sayılarda)
  if (typeof val === "string" && (isDecimalType || (align === "right" && !isIntegerType))) {
    const trimmed = val.trim();
    if (trimmed !== "" && !isNaN(Number(trimmed))) {
      const num = Number(trimmed);
      if (Number.isInteger(num) && !isDecimalType) {
        return val;
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
