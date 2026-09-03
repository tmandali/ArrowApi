import { type RecordBatch, type Schema } from "apache-arrow"
import { streamArrowRecordBatches } from "@/features/jobs/arrow-job-client"

export type RetailSalesColumn = {
  name: string
  label: string
  align: "left" | "right"
}

export type RetailSalesGridRow = {
  id: string
  values: Record<string, string>
}

export type RetailSalesArrowReport = {
  columns: RetailSalesColumn[]
  rows: RetailSalesGridRow[]
  totalRows: number
}

function humanizeField(name: string): string {
  return name.replace(/([a-z])([A-Z])/g, "$1 $2")
}

function cellToDisplay(value: unknown): string {
  if (value == null) return ""
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return ""
    return value.toISOString().slice(0, 10)
  }
  if (typeof value === "string") return value
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : ""
  }
  if (typeof value === "bigint") return String(value)
  if (typeof value === "boolean") return value ? "true" : "false"
  return String(value)
}

function isNumericField(type: { toString?: () => string } | null | undefined): boolean {
  const text = String(type ?? "").toLowerCase()
  return (
    text.includes("float") ||
    text.includes("int") ||
    text.includes("decimal") ||
    text.includes("double")
  )
}

export function columnsFromSchema(schema: Schema): RetailSalesColumn[] {
  return schema.fields.map((field) => ({
    name: field.name,
    label: humanizeField(field.name),
    align: isNumericField(field.type) ? "right" : "left",
  }))
}

function rowsFromBatch(
  batch: RecordBatch,
  columns: RetailSalesColumn[]
): RetailSalesGridRow[] {
  const rows: RetailSalesGridRow[] = []
  const n = batch.numRows
  const idChild = batch.getChild("Id")

  for (let i = 0; i < n; i += 1) {
    const id = String(idChild?.get(i) ?? i)
    const values: Record<string, string> = {}
    for (const col of columns) {
      values[col.name] = cellToDisplay(batch.getChild(col.name)?.get(i))
    }
    rows.push({ id, values })
  }
  return rows
}

/**
 * Tamamlanmış job sonucunu batch batch okur; her Arrow `RecordBatch` geldikçe
 * satır bloğuyla birlikte yield eder. İlk batch'in şemasından kolonlar üretilir.
 */
export async function* streamRetailSalesRows(
  jobUrl: string,
  signal: AbortSignal
): AsyncGenerator<RetailSalesArrowReport> {
  let columns: RetailSalesColumn[] = []
  let totalRows = 0

  for await (const batch of streamArrowRecordBatches(jobUrl, signal)) {
    if (columns.length === 0) {
      columns = columnsFromSchema(batch.schema)
    }
    const rows = rowsFromBatch(batch, columns)
    totalRows += rows.length
    yield { columns, rows, totalRows }
  }
}

/** Stream'i toplayıp tüm raporu dönen kolaylık sarmalayıcısı. */
export async function fetchRetailSalesArrowReport(
  jobUrl: string,
  signal?: AbortSignal
): Promise<RetailSalesArrowReport> {
  const rows: RetailSalesGridRow[] = []
  let columns: RetailSalesColumn[] = []
  let totalRows = 0

  for await (const chunk of streamRetailSalesRows(
    jobUrl,
    signal ?? new AbortController().signal
  )) {
    if (columns.length === 0) columns = chunk.columns
    rows.push(...chunk.rows)
    totalRows = chunk.totalRows
  }

  return { columns, rows, totalRows }
}
