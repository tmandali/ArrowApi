import { type RecordBatch, type Schema } from "apache-arrow"
import { ApiError } from "@/services"
import { getCompanyHeaders } from "@/lib/company-headers"
import { readJobSseEvents, streamArrowRecordBatches } from "@/features/jobs/arrow-job-client"
import type {
  ArrowJobEvent,
  ArrowJobStatus,
  ArrowJobStatusList,
  ReportColumn,
  ReportGridRow,
  StockAnalyticsArrowReport,
  StockAnalyticsRequest,
} from "../types/stock-analytics"

const JOB_BASE = "/api/arrow/jobs/stock-analytics"

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

function columnsFromSchema(schema: Schema): ReportColumn[] {
  const columns: ReportColumn[] = []
  for (const field of schema.fields) {
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

function flatRowsFromBatch(
  batch: RecordBatch,
  columns: ReportColumn[],
  currency: string
): Omit<ReportGridRow, "children">[] {
  const flat: Omit<ReportGridRow, "children">[] = []
  const n = batch.numRows

  for (let i = 0; i < n; i += 1) {
    const id = String(batch.getChild("Id")?.get(i) ?? i)
    const parentRaw = batch.getChild("ParentId")?.get(i)
    const parentId =
      parentRaw == null || parentRaw === "" ? null : String(parentRaw)
    const name = String(batch.getChild("Name")?.get(i) ?? "")
    const level = Number(batch.getChild("Level")?.get(i) ?? 0)
    const isGroup = Boolean(batch.getChild("IsGroup")?.get(i))

    const values: Record<string, string> = { Name: name }
    for (const col of columns) {
      if (col.kind !== "money") continue
      const child = batch.getChild(col.name)
      const raw = child?.get(i)
      const scale = fieldScale(child?.type as { scale?: number } | undefined)
      values[col.name] = formatMoney(cellToNumber(raw, scale), currency)
    }

    flat.push({ id, parentId, name, level, isGroup, values })
  }

  return flat
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

export type RunStockAnalyticsOptions = {
  signal?: AbortSignal
  onEvent?: (eventName: string, payload: ArrowJobEvent) => void
}

export const stockAnalyticsService = {
  async listJobs(
    options: {
      take?: number
      skip?: number
      state?: string
      signal?: AbortSignal
    } = {}
  ): Promise<ArrowJobStatusList> {
    const params = new URLSearchParams()
    if (options.take != null) params.set("take", String(options.take))
    if (options.skip != null) params.set("skip", String(options.skip))
    if (options.state) params.set("state", options.state)

    const query = params.toString()
    const response = await fetch(
      query ? `${JOB_BASE}?${query}` : JOB_BASE,
      {
        headers: { Accept: "application/json", ...getCompanyHeaders() },
        signal: options.signal,
      }
    )

    if (!response.ok) {
      let body: unknown
      try {
        body = await response.json()
      } catch {
        body = undefined
      }
      throw new ApiError(
        response.statusText || "Job listesi alınamadı",
        response.status,
        body
      )
    }

    return (await response.json()) as ArrowJobStatusList
  },

  async createJob(
    request: StockAnalyticsRequest = {},
    signal?: AbortSignal
  ): Promise<ArrowJobStatus> {
    const createResponse = await fetch(JOB_BASE, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...getCompanyHeaders(),
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

    return (await createResponse.json()) as ArrowJobStatus
  },

  async fetchJobRequest(
    jobId: string,
    signal?: AbortSignal
  ): Promise<StockAnalyticsRequest | null> {
    const response = await fetch(`/api/arrow/jobs/${jobId}/request`, {
      headers: { Accept: "application/json", ...getCompanyHeaders() },
      signal,
    })

    if (response.status === 404) {
      return null
    }

    if (!response.ok) {
      let body: unknown
      try {
        body = await response.json()
      } catch {
        body = undefined
      }
      throw new ApiError(
        response.statusText || "Job request alınamadı",
        response.status,
        body
      )
    }

    return (await response.json()) as StockAnalyticsRequest
  },

  async fetchReport(
    jobUrl: string,
    request: StockAnalyticsRequest = {},
    signal?: AbortSignal
  ): Promise<StockAnalyticsArrowReport> {
    const currency = request.currency || "inr"
    let columns: ReportColumn[] = []
    const flat: Omit<ReportGridRow, "children">[] = []

    for await (const batch of streamArrowRecordBatches(
      jobUrl,
      signal ?? new AbortController().signal
    )) {
      if (columns.length === 0) columns = columnsFromSchema(batch.schema)
      flat.push(...flatRowsFromBatch(batch, columns, currency))
    }

    return {
      columns,
      rows: buildTree(flat),
      currency,
      totalRows: flat.length,
    }
  },

  /**
   * Standalone create → SSE → Arrow fetch (JobSync olmadan).
   * Tercihen JobSyncProvider + createJob/fetchReport kullanın.
   */
  async runReport(
    request: StockAnalyticsRequest = {},
    options: RunStockAnalyticsOptions = {}
  ): Promise<StockAnalyticsArrowReport> {
    const signal = options.signal
    const job = await this.createJob(request, signal)
    const terminal = await readJobSseEvents(
      job.eventsUrl,
      signal ?? new AbortController().signal,
      (name, payload) => {
        options.onEvent?.(name, payload)
      }
    )

    if (terminal.status === "Failed") {
      throw new Error(terminal.error || "Rapor job'ı başarısız")
    }
    if (terminal.status === "Cancelled") {
      throw new Error("Rapor iptal edildi")
    }

    return this.fetchReport(job.jobUrl, request, signal)
  },

  async cancel(jobId: string): Promise<void> {
    await fetch(`/api/arrow/jobs/${jobId}/cancel`, {
      method: "POST",
      headers: { ...getCompanyHeaders() },
    })
  },

  async deleteJob(jobId: string, signal?: AbortSignal): Promise<void> {
    const response = await fetch(`/api/arrow/jobs/${jobId}`, {
      method: "DELETE",
      headers: { ...getCompanyHeaders() },
      signal,
    })

    if (response.status === 204 || response.status === 404) {
      return
    }

    if (!response.ok) {
      let body: unknown
      try {
        body = await response.json()
      } catch {
        body = undefined
      }
      throw new ApiError(
        response.status === 409
          ? "Çalışan rapor silinemez"
          : response.statusText || "Job silinemedi",
        response.status,
        body
      )
    }
  },
}
