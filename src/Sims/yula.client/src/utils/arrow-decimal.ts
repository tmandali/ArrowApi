/**
 * apache-arrow Decimal128/256 → JS number.
 *
 * DecimalBigNum.toString() / toJSON() ölçeklenmemiş mantissa döner
 * (104.01 → "10401" / `"10401"`). Doğru okuma: valueOf(scale).
 */

const IS_ARROW_BIGNUM = Symbol.for("isArrowBigNum")

export type ArrowTypeLike = {
  scale?: number
  toString?: () => string
} | null | undefined

function typeText(typeOrDuckType?: ArrowTypeLike | string | null): string {
  if (typeOrDuckType == null) return ""
  if (typeof typeOrDuckType === "object") {
    return typeOrDuckType.toString?.() ?? String(typeOrDuckType)
  }
  return String(typeOrDuckType)
}

/** DuckDB/Arrow TIME (gün içi saat) — TIMESTAMP/DATE değil. */
export function isTimeOnlyType(
  typeOrDuckType?: ArrowTypeLike | string | null
): boolean {
  const t = typeText(typeOrDuckType).toUpperCase()
  if (!t) return false
  if (t.includes("TIMESTAMP") || t.includes("DATETIME") || t.includes("DATE")) {
    return false
  }
  return (
    t === "TIME" ||
    t.startsWith("TIME ") ||
    t.includes("TIME64") ||
    t.includes("TIME32") ||
    /\bTIME\b/.test(t)
  )
}

/** uniqueidentifier / FixedSizeBinary[16] — düz binary değil. */
export function isUuidBinaryType(
  typeOrDuckType?: ArrowTypeLike | string | null
): boolean {
  const t = typeText(typeOrDuckType).toLowerCase()
  if (!t) return false
  return (
    t.includes("uuid") ||
    t.includes("uniqueidentifier") ||
    t.includes("fixedsizebinary") ||
    t.includes("fixed_size_binary")
  )
}

/**
 * TIME64/TIME32 sayısal değer → HH:mm:ss.
 * Birim: <86400 sn, <8.64e7 ms, <8.64e10 µs, aksi ns (Arrow Time64 default).
 */
export function formatTimeOfDayValue(value: unknown): string | null {
  if (value == null) return null

  if (typeof value === "string") {
    const trimmed = value.trim()
    const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?$/.exec(trimmed)
    if (!m) return null
    const hh = m[1]!.padStart(2, "0")
    const mm = m[2]!
    const ss = (m[3] ?? "00").padStart(2, "0")
    return `${hh}:${mm}:${ss}`
  }

  if (typeof value !== "number" && typeof value !== "bigint") return null
  let n = Number(value)
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

/** Arrow BN / DecimalBigNum (TypedArray + valueOf(scale)). */
export function isArrowBigNum(
  value: unknown
): value is { valueOf: (scale?: number) => number; toString: () => string } {
  if (typeof value !== "object" || value === null) return false
  if ((value as Record<symbol, unknown>)[IS_ARROW_BIGNUM] === true) return true
  // GUID vb. Uint8Array'i ayır: Arrow BN yalnızca Int32/Uint32 word buffer kullanır.
  return (
    (value instanceof Int32Array || value instanceof Uint32Array) &&
    typeof (value as { valueOf?: unknown }).valueOf === "function" &&
    (value.byteLength === 16 || value.byteLength === 32)
  )
}

/**
 * Arrow tipinden veya DuckDB `DECIMAL(p,s)` / `Decimal[pe+s]` metninden scale.
 */
export function readDecimalScale(
  typeOrDuckType?: ArrowTypeLike | string | null
): number {
  if (typeOrDuckType == null) return 0
  if (typeof typeOrDuckType === "object") {
    if (typeof typeOrDuckType.scale === "number" && typeOrDuckType.scale >= 0) {
      return typeOrDuckType.scale
    }
    typeOrDuckType = typeOrDuckType.toString?.() ?? String(typeOrDuckType)
  }
  const text = String(typeOrDuckType)
  const duck = /DECIMAL\s*\(\s*\d+\s*,\s*(\d+)\s*\)/i.exec(text)
  if (duck) return Number(duck[1])
  // money / smallmoney Arrow Decimal128(19,4)
  if (/money/i.test(text)) return 4
  const arrow = /Decimal\[\d+e([+-]?\d+)\]/i.exec(text)
  if (arrow) {
    const scale = Number(arrow[1])
    return Number.isFinite(scale) && scale > 0 ? scale : 0
  }
  return 0
}

/**
 * DecimalBigNum / bigint / sayısal string → number.
 * Scale yoksa unscaled mantissa döner (geriye dönük uyum).
 */
export function arrowDecimalToNumber(
  value: unknown,
  scale = 0
): number | null {
  if (value == null) return null

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null
  }

  if (typeof value === "bigint") {
    const n = scale > 0 ? Number(value) / 10 ** scale : Number(value)
    return Number.isFinite(n) ? n : null
  }

  if (isArrowBigNum(value)) {
    try {
      const n = value.valueOf(scale > 0 ? scale : undefined)
      return Number.isFinite(n) ? n : null
    } catch {
      // fall through
    }
  }

  if (typeof value === "string") {
    // BigNum.toJSON artifact: `"10401"` (tırnak karakterleri string içinde)
    const trimmed = value.trim()
    const quoted = /^"(-?\d+(?:\.\d+)?)"$/.exec(trimmed)
    const raw = quoted ? quoted[1]! : trimmed
    if (raw === "" || Number.isNaN(Number(raw))) return null
    const n = scale > 0 ? Number(raw) / 10 ** scale : Number(raw)
    return Number.isFinite(n) ? n : null
  }

  if (typeof value === "object") {
    const raw = String(value)
    if (raw === "" || Number.isNaN(Number(raw))) return null
    const n = scale > 0 ? Number(raw) / 10 ** scale : Number(raw)
    return Number.isFinite(n) ? n : null
  }

  return null
}

/**
 * Arrow hücre değerini JSON/UI-safe primitive'e çevir.
 * Decimal → number (scale uygulanmış); diğer BigNum → number/string.
 */
export function normalizeArrowCellValue(
  value: unknown,
  fieldType?: ArrowTypeLike | string | null
): unknown {
  if (value == null) return null

  if (isArrowBigNum(value) || typeof value === "bigint") {
    const scale = readDecimalScale(fieldType)
    const n = arrowDecimalToNumber(value, scale)
    if (n != null) return n
  }

  // toJSON zaten çalışmış olabilir: `"10401"`
  if (typeof value === "string") {
    const quoted = /^"(-?\d+)"$/.exec(value.trim())
    if (quoted) {
      const scale = readDecimalScale(fieldType)
      const n = arrowDecimalToNumber(quoted[1], scale)
      if (n != null) return n
    }
  }

  return value
}
