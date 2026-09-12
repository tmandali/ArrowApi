import type {
  AggregationType,
  ColumnAggregationConfig,
  ColumnAggregationValues,
  SpreadsheetColumn,
} from "./types"
import { formatGridCellValue } from "@/utils/format-cell"

export const AGGREGATION_LABELS: Record<AggregationType, string> = {
  sum: "Σ  SUM",
  avg: "x̄  AVG",
  min: "↓  MIN",
  max: "↑  MAX",
  count: "#  COUNT",
  distinct: "⊛  DISTINCT",
  none: "—  None",
}

export const AGGREGATION_SHORT_LABELS: Record<AggregationType, string> = {
  sum: "Σ",
  avg: "x̄",
  min: "↓",
  max: "↑",
  count: "#",
  distinct: "⊛",
  none: "",
}

export function isColumnNumeric(col: SpreadsheetColumn): boolean {
  if (col.align === "right") return true
  const kind = (col.kind ?? "").toLowerCase()
  if (kind === "number" || kind === "integer" || kind === "decimal" || kind === "float" || kind === "money") {
    return true
  }
  const duckType = (col.duckType ?? "").toUpperCase()
  return (
    duckType.includes("INT") ||
    duckType.includes("DECIMAL") ||
    duckType.includes("FLOAT") ||
    duckType.includes("DOUBLE") ||
    duckType.includes("NUMERIC") ||
    duckType.includes("REAL") ||
    duckType.includes("HUGEINT")
  )
}

/**
 * Kolon için varsayılan özet türünü belirler.
 */
export function getDefaultAggregationForColumn(col: SpreadsheetColumn): AggregationType {
  if (col.defaultAggregation) return col.defaultAggregation

  const name = col.name.toLowerCase()
  // Kimlik/kod kolonları toplanmaz, sayı sayılır
  if (name === "id" || name.endsWith("_id") || name.endsWith("id") || name.endsWith("kod") || name.endsWith("kodu") || name.endsWith("code")) {
    return "none"
  }

  if (isColumnNumeric(col)) {
    return "sum"
  }

  return "none"
}

/**
 * Bir kolon için uygulanabilecek geçerli özet seçeneklerini döner.
 */
export function getAvailableAggregations(col: SpreadsheetColumn): AggregationType[] {
  if (isColumnNumeric(col)) {
    return ["sum", "avg", "min", "max", "count", "distinct", "none"]
  }
  return ["count", "distinct", "min", "max", "none"]
}

/**
 * Değeri formatlar (Türkçe binlik/ondalık veya tam sayı).
 */
export function formatAggregatedValue(
  type: AggregationType,
  value: number | string | null | undefined,
  col: SpreadsheetColumn
): string {
  if (value === null || value === undefined || (typeof value === "number" && isNaN(value))) {
    return "-"
  }

  if (type === "count" || type === "distinct") {
    const num = Number(value)
    return Number.isFinite(num) ? num.toLocaleString("tr-TR") : String(value)
  }

  if (typeof value === "number") {
    if (type === "avg") {
      // Ortalama için 2 ondalık basamak
      return value.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    }
    return formatGridCellValue(value, col.align, col.duckType)
  }

  return String(value)
}

/**
 * Bellek içi (in-memory) satırlar üzerinden alt toplam hesaplar.
 */
export function computeInMemoryAggregations<T extends Record<string, unknown>>(
  items: readonly T[],
  columns: readonly SpreadsheetColumn[],
  configs: ColumnAggregationConfig
): ColumnAggregationValues {
  const result: ColumnAggregationValues = {}

  for (const col of columns) {
    const type = configs[col.name] || "none"
    if (type === "none") continue

    const field = col.name
    let computedVal: number | string | null = null

    switch (type) {
      case "count": {
        let count = 0
        for (const item of items) {
          const v = item[field]
          if (v !== null && v !== undefined && v !== "") count++
        }
        computedVal = count
        break
      }
      case "distinct": {
        const set = new Set<unknown>()
        for (const item of items) {
          const v = item[field]
          if (v !== null && v !== undefined && v !== "") set.add(v)
        }
        computedVal = set.size
        break
      }
      case "sum": {
        let sum = 0
        let hasAny = false
        for (const item of items) {
          const v = Number(item[field])
          if (!isNaN(v)) {
            sum += v
            hasAny = true
          }
        }
        computedVal = hasAny ? sum : 0
        break
      }
      case "avg": {
        let sum = 0
        let count = 0
        for (const item of items) {
          const v = Number(item[field])
          if (!isNaN(v)) {
            sum += v
            count++
          }
        }
        computedVal = count > 0 ? sum / count : 0
        break
      }
      case "min": {
        let min: number | string | null = null
        for (const item of items) {
          const v = item[field]
          if (v === null || v === undefined || v === "") continue
          if (typeof v === "number") {
            if (min === null || v < (min as number)) min = v
          } else {
            const str = String(v)
            if (min === null || str < (min as string)) min = str
          }
        }
        computedVal = min
        break
      }
      case "max": {
        let max: number | string | null = null
        for (const item of items) {
          const v = item[field]
          if (v === null || v === undefined || v === "") continue
          if (typeof v === "number") {
            if (max === null || v > (max as number)) max = v
          } else {
            const str = String(v)
            if (max === null || str > (max as string)) max = str
          }
        }
        computedVal = max
        break
      }
    }

    result[col.name] = {
      type,
      value: computedVal,
      formatted: formatAggregatedValue(type, computedVal, col),
      label: AGGREGATION_SHORT_LABELS[type],
    }
  }

  return result
}

/**
 * DuckDB WASM üzerinde tek sorguda alt toplamları hesaplayacak SQL ifadesini üretir.
 */
export function buildDuckDbAggregationSql(
  tableName: string,
  whereClause: string,
  columns: readonly SpreadsheetColumn[],
  configs: ColumnAggregationConfig
): { sql: string; activeColumns: Array<{ name: string; type: AggregationType; alias: string }> } | null {
  const activeColumns: Array<{ name: string; type: AggregationType; alias: string }> = []
  const selectParts: string[] = []

  for (const col of columns) {
    const type = configs[col.name]
    if (!type || type === "none") continue

    const safeCol = `"${col.name.replace(/"/g, '""')}"`
    const alias = `agg_${type}_${col.name.replace(/[^a-zA-Z0-9_]/g, "_")}`
    activeColumns.push({ name: col.name, type, alias })

    switch (type) {
      case "sum":
        selectParts.push(`SUM(${safeCol}) AS "${alias}"`)
        break
      case "avg":
        selectParts.push(`AVG(${safeCol}) AS "${alias}"`)
        break
      case "min":
        selectParts.push(`MIN(${safeCol}) AS "${alias}"`)
        break
      case "max":
        selectParts.push(`MAX(${safeCol}) AS "${alias}"`)
        break
      case "count":
        selectParts.push(`COUNT(${safeCol})::BIGINT AS "${alias}"`)
        break
      case "distinct":
        selectParts.push(`COUNT(DISTINCT ${safeCol})::BIGINT AS "${alias}"`)
        break
    }
  }

  if (selectParts.length === 0) return null

  const escapedTable = `"${tableName.replace(/"/g, '""')}"`
  const sql = `SELECT ${selectParts.join(", ")} FROM ${escapedTable} ${whereClause};`
  return { sql, activeColumns }
}
