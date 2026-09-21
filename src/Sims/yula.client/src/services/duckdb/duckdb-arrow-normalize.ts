import {
  formatTimeOfDayValue,
  isArrowBigNum,
  isTimeOnlyType,
  isUuidBinaryType,
  normalizeArrowCellValue,
  readDecimalScale,
  type ArrowTypeLike,
} from "../../utils/arrow-decimal"

export function isDateOnlyArrowType(
  fieldType?: { toString?: () => string; typeId?: number } | string | null
): boolean {
  if (fieldType == null) return false
  const t = String(
    typeof fieldType === "object" ? (fieldType.toString?.() ?? fieldType) : fieldType
  ).toLowerCase()
  if (t.includes("time")) return false
  return (
    t === "date" ||
    t.includes("date32") ||
    t.includes("date64") ||
    (t.includes("date") && !t.includes("timestamp"))
  )
}

export function normalizeArrowValue(
  val: unknown,
  fieldType?: { scale?: number; toString?: () => string } | string | null
): unknown {
  if (val === null || val === undefined) return null

  // 1. Date / Timestamp nesneleri
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return ""
    const utcMidnight =
      val.getUTCHours() === 0 &&
      val.getUTCMinutes() === 0 &&
      val.getUTCSeconds() === 0 &&
      val.getUTCMilliseconds() === 0
    if (isDateOnlyArrowType(fieldType) || utcMidnight) {
      return val.toISOString().slice(0, 10)
    }
    return val.toISOString().slice(0, 19)
  }

  // 1b. TIME / Time64 — gün içi saat (tarih epoch yoluna düşmesin)
  if (isTimeOnlyType(fieldType)) {
    const time = formatTimeOfDayValue(val)
    if (time != null) return time
  }

  // 2. BigInt (JS Number'a çevir — Web Worker transfer & JSON serialize için)
  if (typeof val === "bigint") {
    const scale = readDecimalScale(fieldType)
    if (scale > 0) {
      return normalizeArrowCellValue(val, fieldType)
    }
    const num = Number(val)
    return Number.isSafeInteger(num) ? num : val.toString()
  }

  // 3. Arrow Decimal128 / DecimalBigNum — Uint32Array alt sınıfı; GUID yolundan ÖNCE yakala.
  if (isArrowBigNum(val)) {
    return normalizeArrowCellValue(val, fieldType)
  }

  // 4. Uint8Array / Buffer / Binary
  if (val instanceof Uint8Array || (typeof Buffer !== "undefined" && Buffer.isBuffer?.(val))) {
    try {
      const u8 = val instanceof Uint8Array ? val : new Uint8Array(val as ArrayBuffer)
      const hex = Array.from(u8, (b) => b.toString(16).padStart(2, "0")).join("")
      if (u8.length === 16 && isUuidBinaryType(fieldType)) {
        return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
      }
      return hex
    } catch {
      return ""
    }
  }

  // 5. Custom Arrow Struct / Object / Map / HugeInt (Int128)
  if (typeof val === "object" && val !== null) {
    if ("low" in (val as any) && "high" in (val as any)) {
      const low = BigInt((val as any).low >>> 0)
      const high = BigInt((val as any).high)
      const big = (high << 64n) + low
      const num = Number(big)
      return Number.isSafeInteger(num) ? num : big.toString()
    }
    if (typeof (val as any).toJSON === "function") {
      return (val as any).toJSON()
    }
    if (Array.isArray(val)) {
      return val.map((item) => normalizeArrowValue(item, fieldType))
    }
  }

  return normalizeArrowCellValue(val, fieldType)
}

export function arrowTableToObjects(table: any): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = []
  const schema = table?.schema
  const numRows = table?.numRows ?? 0
  if (!schema || numRows === 0) return rows

  const schemaFields: { name: string; type?: ArrowTypeLike | string }[] = schema.fields.map(
    (f: { name: string; type?: unknown }) => ({
      name: f.name,
      type:
        typeof f.type === "string" ||
        (typeof f.type === "object" && f.type !== null)
          ? (f.type as ArrowTypeLike)
          : undefined,
    })
  )
  const fields = schemaFields.map((f) => f.name)
  const columns = fields.map((name, index) =>
    typeof table.getChildAt === "function"
      ? table.getChildAt(index)
      : table.getChild(name)
  )

  for (let i = 0; i < numRows; i++) {
    const row: Record<string, unknown> = {}
    for (let j = 0; j < fields.length; j++) {
      const val = columns[j]?.get(i)
      row[fields[j]] = normalizeArrowValue(val, schemaFields[j]?.type)
    }
    rows.push(row)
  }
  return rows
}
