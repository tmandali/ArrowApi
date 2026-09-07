/**
 * Kolonun bir kod, numara, barkod, kimlik, fiş no veya yıl gibi ayrık bir değer mi
 * yoksa ölçülebilir bir miktar/tutar metriği mi olduğunu belirler.
 */
export function isIdentifierColumn(columnName?: string, align?: "left" | "right"): boolean {
  if (!columnName) return align === "left";
  const name = columnName.toLowerCase().replace(/[\s_-]+/g, "");

  // Açıkça kimlik / kod / numara / barkod / yıl belirten desenler
  const idPatterns = [
    "id", "no", "num", "kod", "code", "barcode", "barkod", "guid",
    "year", "yil", "phone", "tel", "tc", "ref", "key", "seq", "sira",
    "line", "fis", "fatura", "order", "siparis", "account", "hesap",
    "itemno", "itemid", "docno", "batch", "parti", "seri", "serial"
  ];

  if (idPatterns.some((p) => name === p || name.endsWith(p) || name.startsWith(p))) {
    return true;
  }

  // Sola hizalı alanlar miktar/tutar değil, kod veya metindir
  if (align === "left") {
    return true;
  }

  return false;
}

/**
 * Kolonun açıkça miktar veya parasal tutar metriği olup olmadığını belirler.
 */
export function isMetricColumn(columnName?: string): boolean {
  if (!columnName) return false;
  const name = columnName.toLowerCase().replace(/[\s_-]+/g, "");
  const metricPatterns = [
    "qty", "quantity", "miktar", "adet", "amount", "tutar", "fiyat",
    "price", "cost", "maliyet", "total", "toplam", "bakiye", "balance",
    "net", "brut", "gross", "rate", "oran", "iskonto", "discount", "kdv", "vat"
  ];
  return metricPatterns.some((p) => name.includes(p));
}

/**
 * Yula Grid Tablosu Hücre Biçimlendiricisi — DuckDB WASM ham sayısal ve tutar
 * çıktılarını Türkçe yerel ayarlarına (tr-TR) göre biçimlendirir.
 * Kod, ID, Barkod, Fiş No veya genel int alanlarına gereksiz binlik noktası koymaz.
 */
export function formatGridCellValue(
  val: unknown,
  align?: "left" | "right",
  columnType?: string,
  columnName?: string
): string {
  if (val === null || val === undefined || val === "") return "";

  if (val instanceof Date) {
    if (isNaN(val.getTime())) return "";
    return val.toISOString().slice(0, 10);
  }

  // 1. Kolon tipi "date" olarak biliniyorsa (veya adı Date/Tarih içeriyorsa)
  const isDateColumn = columnType === "date" || (columnName ? /date|tarih/i.test(columnName) : false);

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

    // Tamsayı (int) alanlar: Kod, Barkod, ID, Fiş No, Yıl vb. binlik nokta almaz
    if (Number.isInteger(num)) {
      if (isIdentifierColumn(columnName, align) || !isMetricColumn(columnName)) {
        return String(val);
      }
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
        if (isIdentifierColumn(columnName, align) || !isMetricColumn(columnName)) {
          return val;
        }
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
