import { tableFromIPC, type Table } from "apache-arrow"
import { ApiError } from "@/services"
import type {
  ArrowJobEvent,
  ArrowJobStatus,
  ReportColumn,
  ReportGridRow,
  StockAnalyticsArrowReport,
  StockAnalyticsRequest,
} from "../types/stock-analytics"

const JOB_BASE = "/api/arrow/jobs/stock-analytics"
const ARROW_ACCEPT = "application/vnd.apache.arrow.stream"

const META_FIELDS = new Set(["Id", "ParentId", "Level", "IsGroup"])

const COLUMN_LABELS: Record<string, string> = {
  Name: "Account",
  OpeningDr: "Opening (Dr)",
  OpeningCr: "Opening (Cr)",
  Debit: "Debit",
  Credit: "Credit",
  ClosingDr: "Closing (Dr)",
  ClosingCr: "Closing (Cr)",
}

const currencyLocales: Record<string, { locale: string; currency: string }> = {
  inr: { locale: "en-IN", currency: "INR" },
  try: { locale: "tr-TR", currency: "TRY" },
  usd: { locale: "en-US", currency: "USD" },
}

function toIsoDate(value: Date | string | undefined): string | undefined {
  if (!value) return undefined
  if (typeof value === "string") return value.slice(0, 10)
  const y = value.getFullYear()
  const m = String(value.getMonth() + 1).padStart(2, "0")
  const d = String(value.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

function formatMoney(value: number, currencyCode: string): string {
  const config = currencyLocales[currencyCode] ?? currencyLocales.inr
  return new Intl.NumberFormat(config.locale, {
    style: "currency",
    currency: config.currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

function cellToNumber(value: unknown, scale = 0): number {
  if (value == null) return 0
  if (typeof value === "number") return value
  if (typeof value === "bigint") {
    return scale > 0 ? Number(value) / 10 ** scale : Number(value)
  }
  if (typeof value === "string") {
    const n = Number(value)
    if (!Number.isFinite(n)) return 0
    return scale > 0 ? n / 10 ** scale : n
  }
  // apache-arrow Decimal128 → DecimalBigNum; String() unscaled mantissa döner
  if (typeof value === "object") {
    const raw = String(value)
    const n = Number(raw)
    if (!Number.isFinite(n)) return 0
    return scale > 0 ? n / 10 ** scale : n
  }
  return 0
}

function fieldScale(type: { scale?: number } | null | undefined): number {
  return typeof type?.scale === "number" ? type.scale : 0
}

function humanizeField(name: string): string {
  return COLUMN_LABELS[name] ?? name.replace(/([a-z])([A-Z])/g, "$1 $2")
}

function columnsFromSchema(table: Table): ReportColumn[] {
  const columns: ReportColumn[] = []
  for (const field of table.schema.fields) {
    const name = field.name
    if (META_FIELDS.has(name)) continue
    if (name === "Name") {
      columns.push({
        name,
        label: humanizeField(name),
        type: String(field.type),
        kind: "account",
        align: "left",
      })
      continue
    }
    columns.push({
      name,
      label: humanizeField(name),
      type: String(field.type),
      kind: "money",
      align: "right",
    })
  }
  return columns
}

function rowsFromTable(
  table: Table,
  columns: ReportColumn[],
  currency: string
): ReportGridRow[] {
  const flat: Omit<ReportGridRow, "children">[] = []
  const n = table.numRows

  for (let i = 0; i < n; i += 1) {
    const id = String(table.getChild("Id")?.get(i) ?? i)
    const parentRaw = table.getChild("ParentId")?.get(i)
    const parentId =
      parentRaw == null || parentRaw === "" ? null : String(parentRaw)
    const name = String(table.getChild("Name")?.get(i) ?? "")
    const level = Number(table.getChild("Level")?.get(i) ?? 0)
    const isGroup = Boolean(table.getChild("IsGroup")?.get(i))

    const values: Record<string, string> = { Name: name }
    for (const col of columns) {
      if (col.kind !== "money") continue
      const child = table.getChild(col.name)
      const raw = child?.get(i)
      const scale = fieldScale(child?.type as { scale?: number } | undefined)
      values[col.name] = formatMoney(cellToNumber(raw, scale), currency)
    }

    flat.push({ id, parentId, name, level, isGroup, values })
  }

  return buildTree(flat)
}

function buildTree(
  flat: Omit<ReportGridRow, "children">[]
): ReportGridRow[] {
  const map = new Map<string, ReportGridRow>()
  const roots: ReportGridRow[] = []

  for (const row of flat) {
    map.set(row.id, { ...row, children: [] })
  }

  for (const row of flat) {
    const node = map.get(row.id)!
    if (row.parentId && map.has(row.parentId)) {
      map.get(row.parentId)!.children!.push(node)
    } else {
      roots.push(node)
    }
  }

  const prune = (nodes: ReportGridRow[]) => {
    for (const node of nodes) {
      if (node.children?.length) prune(node.children)
      else delete node.children
    }
  }
  prune(roots)
  return roots
}

async function readSseEvents(
  eventsUrl: string,
  signal: AbortSignal,
  onEvent: (eventName: string, payload: ArrowJobEvent) => void
): Promise<ArrowJobEvent> {
  const response = await fetch(eventsUrl, {
    headers: { Accept: "text/event-stream" },
    signal,
  })

  if (!response.ok || !response.body) {
    throw new ApiError(
      response.statusText || "SSE bağlantısı başarısız",
      response.status
    )
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let eventName = "message"
  let dataLines: string[] = []
  const received: ArrowJobEvent[] = []

  const flush = () => {
    if (dataLines.length === 0) {
      eventName = "message"
      return
    }
    const raw = dataLines.join("\n")
    dataLines = []
    const name = eventName
    eventName = "message"
    try {
      const payload = JSON.parse(raw) as ArrowJobEvent
      received.push(payload)
      onEvent(name, payload)
    } catch {
      // ignore malformed keepalive payloads
    }
  }

  const isTerminal = (status: string | undefined) =>
    status === "Completed" || status === "Failed" || status === "Cancelled"

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split(/\r?\n/)
    buffer = parts.pop() ?? ""

    for (const line of parts) {
      if (line === "") {
        flush()
        continue
      }
      if (line.startsWith(":")) continue
      if (line.startsWith("event:")) {
        eventName = line.slice(6).trim()
        continue
      }
      if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).trimStart())
      }
    }

    const latest = received[received.length - 1]
    if (latest && isTerminal(latest.status)) {
      break
    }
  }

  const terminal = received[received.length - 1]
  if (!terminal) {
    throw new Error("SSE tamamlanmadan kapandı")
  }
  if (terminal.status === "Failed") {
    throw new Error(terminal.error || "Rapor job'ı başarısız")
  }
  if (terminal.status === "Cancelled") {
    throw new Error("Rapor iptal edildi")
  }
  return terminal
}

async function fetchArrowTable(jobUrl: string, signal: AbortSignal): Promise<Table> {
  const response = await fetch(jobUrl, {
    headers: { Accept: ARROW_ACCEPT },
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

export type RunStockAnalyticsOptions = {
  signal?: AbortSignal
  onEvent?: (eventName: string, payload: ArrowJobEvent) => void
}

export const stockAnalyticsService = {
  async runReport(
    request: StockAnalyticsRequest = {},
    options: RunStockAnalyticsOptions = {}
  ): Promise<StockAnalyticsArrowReport> {
    const signal = options.signal

    const createResponse = await fetch(JOB_BASE, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fromDate: toIsoDate(request.fromDate),
        toDate: toIsoDate(request.toDate),
        fiscalYear: request.fiscalYear,
        financeBook: request.financeBook,
        currency: request.currency,
        valuesMode: request.valuesMode,
        showZeroValues: request.showZeroValues ?? false,
        showGroupAccounts: request.showGroupAccounts ?? true,
        batchSize: request.batchSize ?? 12,
      }),
      signal,
    })

    if (!createResponse.ok) {
      let body: unknown
      try {
        body = await createResponse.json()
      } catch {
        body = undefined
      }
      throw new ApiError(
        createResponse.statusText || "Job oluşturulamadı",
        createResponse.status,
        body
      )
    }

    const job = (await createResponse.json()) as ArrowJobStatus
    await readSseEvents(job.eventsUrl, signal ?? new AbortController().signal, (name, payload) => {
      options.onEvent?.(name, payload)
    })

    const table = await fetchArrowTable(job.jobUrl, signal ?? new AbortController().signal)
    const columns = columnsFromSchema(table)
    const currency = request.currency || "inr"
    const rows = rowsFromTable(table, columns, currency)

    return {
      columns,
      rows,
      currency,
      totalRows: table.numRows,
    }
  },

  async cancel(jobId: string): Promise<void> {
    await fetch(`/api/arrow/jobs/${jobId}/cancel`, { method: "POST" })
  },
}
