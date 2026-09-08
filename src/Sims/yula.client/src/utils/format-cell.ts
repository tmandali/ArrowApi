/**
 * Yula Grid Tablosu Hücre Biçimlendiricisi — Şemadan gelen fiziksel kolon tipine
 * (DuckDB / Arrow schema) göre hücre değerini biçimlendirir.
 * Kelime listesi YOKTUR; kontrol doğrudan kolonun fiziksel tipinden gelir.
 *
 * - INT / INTEGER / BIGINT vb. tamsayı kolonlar ham değer olarak gösterilir (44577625).
 * - DECIMAL / NUMERIC / FLOAT / DOUBLE tutar alanları Türkçe yerel ayarlarına göre (1.250,50) biçimlendirilir.
 * - DATE alanları DD.MM.YYYY, TIMESTAMP alanları saat bilgisiyle DD.MM.YYYY HH:mm:ss olarak gösterilir.
 *
 * Arrow Decimal128 notu: DecimalBigNum.toJSON() tırnaklı unscaled mantissa (`"10401"`) üretir.
 * Scale `DECIMAL(p,s)` kolon tipinden okunur; tam çözüm `utils/arrow-decimal.ts`.
 */

const IS_ARROW_BIGNUM = Symbol.for("isArrowBigNum")

function isArrowBigNum(
  value: unknown
): value is { valueOf: (scale?: number) => number } {
  if (typeof value !== "object" || value === null) return false
  if ((value as Record<symbol, unknown>)[IS_ARROW_BIGNUM] === true) return true
  return (
    (value instanceof Int32Array || value instanceof Uint32Array) &&
    typeof (value as { valueOf?: unknown }).valueOf === "function" &&
    (value.byteLength === 16 || value.byteLength === 32)
  )
}

function readDecimalScale(columnType?: string): number {
  if (!columnType) return 0
  const duck = /DECIMAL\s*\(\s*\d+\s*,\s*(\d+)\s*\)/i.exec(columnType)
  if (duck) return Number(duck[1])
  const arrow = /Decimal\[\d+e([+-]?\d+)\]/i.exec(columnType)
  if (arrow) {
    const scale = Number(arrow[1])
    return Number.isFinite(scale) && scale > 0 ? scale : 0
  }
  return 0
}

/** DecimalBigNum / toJSON artifact → number (scale uygulanmış). */
function coerceArrowDecimal(val: unknown, columnType?: string): unknown {
  const scale = readDecimalScale(columnType)
  if (isArrowBigNum(val)) {
    try {
      const n = val.valueOf(scale > 0 ? scale : undefined)
      return Number.isFinite(n) ? n : val
    } catch {
      return val
    }
  }
  if (typeof val === "string") {
    const quoted = /^"(-?\d+)"$/.exec(val.trim())
    if (quoted) {
      const raw = Number(quoted[1])
      if (!Number.isFinite(raw)) return val
      return scale > 0 ? raw / 10 ** scale : raw
    }
  }
  return val
}

function formatTimestampOrDate(d: Date, forceDateOnly = false): string {
  const utcMidnight =
    d.getUTCHours() === 0 &&
    d.getUTCMinutes() === 0 &&
    d.getUTCSeconds() === 0 &&
    d.getUTCMilliseconds() === 0
  const localMidnight =
    d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0

  // DATE / UTC gece yarısı: TR (UTC+3) yerel saatte 03:00 görünmesin.
  // Takvim gününü UTC bileşenlerinden al (Date32 / SQL DATE semantiği).
  if (forceDateOnly || utcMidnight) {
    const y = utcMidnight ? d.getUTCFullYear() : d.getFullYear()
    const m = String((utcMidnight ? d.getUTCMonth() : d.getMonth()) + 1).padStart(2, "0")
    const day = String(utcMidnight ? d.getUTCDate() : d.getDate()).padStart(2, "0")
    return `${day}.${m}.${y}`
  }

  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  const dateStr = `${day}.${m}.${y}`

  if (localMidnight) return dateStr

  const hh = d.getHours()
  const mm = d.getMinutes()
  const ss = d.getSeconds()

  return `${dateStr} ${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`
}

/** DuckDB/Arrow DATE (saat yok) — TIMESTAMP değil. */
function isDateOnlyColumnType(columnType?: string): boolean {
  const t = (columnType || "").toUpperCase().trim()
  if (!t) return false
  if (t.includes("TIME")) return false
  return t === "DATE" || t.startsWith("DATE") || /\bDATE32\b|\bDATE64\b/.test(t)
}

/** TIME (gün içi) — TIMESTAMP/DATE değil. */
function isTimeOnlyColumnType(columnType?: string): boolean {
  const t = (columnType || "").toUpperCase().trim()
  if (!t) return false
  if (t.includes("TIMESTAMP") || t.includes("DATETIME") || t.includes("DATE")) {
    return false
  }
  return t === "TIME" || t.startsWith("TIME") || t.includes("TIME64") || t.includes("TIME32")
}

function formatTimeOfDay(val: unknown): string | null {
  if (val == null) return null
  if (typeof val === "string") {
    const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?$/.exec(val.trim())
    if (!m) return null
    return `${m[1]!.padStart(2, "0")}:${m[2]}:${(m[3] ?? "00").padStart(2, "0")}`
  }
  if (typeof val !== "number" && typeof val !== "bigint") return null
  let n = Number(val)
  if (!Number.isFinite(n) || n < 0) return null
  let totalSeconds: number
  if (n < 86_400) totalSeconds = Math.floor(n)
  else if (n < 86_400_000) totalSeconds = Math.floor(n / 1_000)
  else if (n < 86_400_000_000) totalSeconds = Math.floor(n / 1_000_000)
  else totalSeconds = Math.floor(n / 1_000_000_000)
  totalSeconds = ((totalSeconds % 86_400) + 86_400) % 86_400
  const hh = Math.floor(totalSeconds / 3600)
  const mm = Math.floor((totalSeconds % 3600) / 60)
  const ss = totalSeconds % 60
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`
}

function parseAndFormatDateString(val: string): string | null {
  const trimmed = val.trim();
  // Zaten "DD.MM.YYYY" veya "DD.MM.YYYY HH:mm:ss" formatındaysa koru
  if (/^\d{2}\.\d{2}\.\d{4}(?:\s\d{2}:\d{2}(?::\d{2})?)?$/.test(trimmed)) {
    return trimmed;
  }

  // ISO / SQL DateTime: "2026-09-01T20:18:57", "2026-09-01 20:18:57", "2026-09-01T20:18:57.000Z"
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!match) return null;

  const [, y, m, d, hh, mm, ss] = match;
  const dateStr = `${d}.${m}.${y}`;

  if (!hh || (hh === "00" && mm === "00" && (!ss || ss === "00"))) {
    return dateStr;
  }

  const sec = ss !== undefined ? `:${ss}` : ":00";
  return `${dateStr} ${hh}:${mm}${sec}`;
}

/**
 * Yula Grid Tablosu Hücre Biçimlendiricisi — Şemadan gelen fiziksel kolon tipine
 * (DuckDB / Arrow schema) göre hücre değerini biçimlendirir.
 * Kelime listesi YOKTUR; kontrol doğrudan kolonun şema tipinden gelir.
 *
 * - INT / INTEGER / BIGINT vb. tamsayı kolonlar ham değer olarak gösterilir (44577625).
 * - DECIMAL / NUMERIC / FLOAT / DOUBLE tutar alanları Türkçe yerel ayarlarına göre (1.250,50) biçimlendirilir.
 * - DATE alanları DD.MM.YYYY, TIMESTAMP alanları saat bilgisiyle DD.MM.YYYY HH:mm:ss olarak gösterilir.
 */
export function formatGridCellValue(
  val: unknown,
  align?: "left" | "right",
  columnType?: string
): string {
  if (val === null || val === undefined || val === "") return "";

  val = coerceArrowDecimal(val, columnType);

  // 1. Boolean tipleri (true/false)
  if (typeof val === "boolean") {
    return val ? "Evet" : "Hayır";
  }

  const rawType = (columnType || "").toUpperCase();
  const isBoolColumn =
    rawType === "BOOLEAN" ||
    rawType === "BOOL" ||
    rawType === "BIT" ||
    rawType.includes("BOOL");

  // Kolon tipi şemada BOOL/BIT ise 1 ve 0 değerlerini de standart 'Evet' / 'Hayır' yap
  if (isBoolColumn) {
    if (val === 1 || val === "1" || val === true || String(val).toLowerCase() === "true") {
      return "Evet";
    }
    if (val === 0 || val === "0" || val === false || String(val).toLowerCase() === "false") {
      return "Hayır";
    }
  }

  // String olarak "true" / "false" geldiyse
  if (typeof val === "string") {
    const sLower = val.trim().toLowerCase();
    if (sLower === "true") return "Evet";
    if (sLower === "false") return "Hayır";
  }

  if (val instanceof Date) {
    if (isNaN(val.getTime())) return "";
    return formatTimestampOrDate(val, isDateOnlyColumnType(columnType));
  }

  // TIME kolonu — tarih epoch sanılmasın
  if (isTimeOnlyColumnType(rawType)) {
    const time = formatTimeOfDay(val);
    if (time != null) return time;
  }

  const isDateOnlyColumn = isDateOnlyColumnType(rawType);
  const isTimestampColumn =
    rawType.includes("TIMESTAMP") || rawType.includes("DATETIME");
  const isDateColumn =
    isDateOnlyColumn ||
    isTimestampColumn ||
    (rawType.includes("DATE") && !isTimeOnlyColumnType(rawType));
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
        if (!isNaN(d.getTime())) return formatTimestampOrDate(d, isDateOnlyColumn);
      }
      // Epoch seconds (örn: 1786752000)
      if (num > 1000000000) {
        const d = new Date(num * 1000);
        if (!isNaN(d.getTime())) return formatTimestampOrDate(d, isDateOnlyColumn);
      }
      // Epoch days (Date32: 0-100000 gün, 2026 yılı ~ 20681)
      if (num > 0 && num < 100000) {
        const d = new Date(num * 86400000);
        if (!isNaN(d.getTime())) return formatTimestampOrDate(d, true);
      }
    }

    // Tarih kolonu değilse ama epoch ms timestamp ise
    if (!isDateColumn && num >= 1000000000000 && num <= 2500000000000 && Number.isInteger(num)) {
      const d = new Date(num);
      if (!isNaN(d.getTime()) && d.getFullYear() >= 2000 && d.getFullYear() <= 2100) {
        return formatTimestampOrDate(d);
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
    const scale = readDecimalScale(columnType);
    const fractionDigits =
      scale > 0 ? Math.min(scale, 10) : isDecimalType ? 2 : 2;
    return new Intl.NumberFormat("tr-TR", {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(num);
  }

  // ISO veya tarih-zaman formatındaki stringleri formatla
  if (typeof val === "string") {
    const formatted = parseAndFormatDateString(val);
    if (formatted) {
      return formatted;
    }

    // Sayısal string olarak epoch ms geldiyse ("1786752000000")
    if (isDateColumn || /^\d{12,14}$/.test(val.trim())) {
      const num = Number(val.trim());
      if (num >= 1000000000000 && num <= 2500000000000) {
        const d = new Date(num);
        if (!isNaN(d.getTime()) && d.getFullYear() >= 2000 && d.getFullYear() <= 2100) {
          return formatTimestampOrDate(d);
        }
      }
    }
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
      const scale = readDecimalScale(columnType);
      const fractionDigits = scale > 0 ? Math.min(scale, 10) : 2;
      return new Intl.NumberFormat("tr-TR", {
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits,
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
