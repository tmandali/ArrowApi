import { tableFromIPC, type Table } from "apache-arrow"
import { ApiError } from "@/services"
import { getCompanyHeaders } from "@/lib/company-headers"

const ARROW_ACCEPT = "application/vnd.apache.arrow.stream"

export type StockBalanceColumn = {
  name: string
  label: string
  align: "left" | "right"
}

export type StockBalanceGridRow = {
  id: string
  values: Record<string, string>
}

export type StockBalanceArrowReport = {
  columns: StockBalanceColumn[]
  rows: StockBalanceGridRow[]
  totalRows: number
}

function humanizeField(name: string): string {
  return name.replace(/([a-z])([A-Z])/g, "$1 $2")
}

function cellToDisplay(value: unknown): string {
  if (value == null) return ""
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

function columnsFromSchema(table: Table): StockBalanceColumn[] {
  return table.schema.fields.map((field) => ({
    name: field.name,
    label: humanizeField(field.name),
    align: isNumericField(field.type) ? "right" : "left",
  }))
}

function rowsFromTable(
  table: Table,
  columns: StockBalanceColumn[]
): StockBalanceGridRow[] {
  const rows: StockBalanceGridRow[] = []
  const n = table.numRows
  const idChild = table.getChild("Id")

  for (let i = 0; i < n; i += 1) {
    const id = String(idChild?.get(i) ?? i)
    const values: Record<string, string> = {}
    for (const col of columns) {
      values[col.name] = cellToDisplay(table.getChild(col.name)?.get(i))
    }
    rows.push({ id, values })
  }
  return rows
}

async function fetchArrowTable(
  jobUrl: string,
  signal: AbortSignal
): Promise<Table> {
  const response = await fetch(jobUrl, {
    headers: { Accept: ARROW_ACCEPT, ...getCompanyHeaders() },
    signal,
  })

  if (!response.ok) {
    let body: unknown
    try {
      body = await response.json()
    } catch {
      body = undefined
    }
    throw new ApiError(
      response.statusText || "Arrow IPC alınamadı",
      response.status,
      body
    )
  }

  const buffer = new Uint8Array(await response.arrayBuffer())
  return tableFromIPC(buffer)
}

export async function fetchStockBalanceArrowReport(
  jobUrl: string,
  signal?: AbortSignal
): Promise<StockBalanceArrowReport> {
  const table = await fetchArrowTable(
    jobUrl,
    signal ?? new AbortController().signal
  )
  const columns = columnsFromSchema(table)
  const rows = rowsFromTable(table, columns)
  return {
    columns,
    rows,
    totalRows: table.numRows,
  }
}
