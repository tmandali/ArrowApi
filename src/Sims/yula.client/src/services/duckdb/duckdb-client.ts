import { buildCombinedWhereClause } from "./filter-parser"

type WorkerResponse = {
  id: number
  success: boolean
  rows?: Record<string, unknown>[]
  totalRows?: number
  result?: Record<string, unknown>
  rowCount?: number
  error?: string
  buffer?: ArrayBuffer
  format?: "xlsx" | "csv"
  fileName?: string
  sheetCount?: number
}

class DuckDbClient {
  private worker: Worker | null = null
  private messageSeq = 0
  private pendingRequests = new Map<
    number,
    {
      resolve: (value: WorkerResponse) => void
      reject: (reason: unknown) => void
    }
  >()
  /**
   * Worker mesajlarını serileştirir: tek bir AsyncDuckDBConnection paylaşıldığı için
   * eşzamanlı `conn.query` / `insertArrowFromIPCStream` çağrıları çakışmasın.
   */
  private sendQueue: Promise<void> = Promise.resolve()

  private getWorker(): Worker {
    if (!this.worker) {
      this.worker = new Worker(
        new URL("./duckdb.worker.ts", import.meta.url),
        { type: "module" }
      )
      this.worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
        const { id, success, error } = e.data
        const pending = this.pendingRequests.get(id)
        if (!pending) return
        this.pendingRequests.delete(id)

        if (success) {
          pending.resolve(e.data)
        } else {
          pending.reject(new Error(error || "DuckDB Worker hatası"))
        }
      }
      this.worker.onerror = (err) => {
        console.error("DuckDB Worker error:", err)
        for (const [, pending] of this.pendingRequests.entries()) {
          pending.reject(new Error(err.message || "DuckDB Worker hatası"))
        }
        this.pendingRequests.clear()
        this.sendQueue = Promise.resolve()
      }
    }
    return this.worker
  }

  private postMessage<T = WorkerResponse>(
    type: string,
    payload: Record<string, unknown>
  ): Promise<T> {
    const worker = this.getWorker()
    const id = ++this.messageSeq

    const request = this.sendQueue.then(
      () =>
        new Promise<T>((resolve, reject) => {
          this.pendingRequests.set(id, {
            resolve: resolve as (value: WorkerResponse) => void,
            reject,
          })
          worker.postMessage({ id, type, payload })
        })
    )
    this.sendQueue = request.then(
      () => undefined,
      () => undefined
    )
    return request
  }

  /**
   * OPFS içindeki çok parçalı Parquet dosyalarını DuckDB üzerinde tek bir VIEW olarak bağlar.
   */
  async registerParquetPartsView(options: {
    tableName: string
    jobId: string
    partFiles?: string[]
  }): Promise<{ rowCount: number }> {
    const res = await this.postMessage<WorkerResponse>("REGISTER_PARQUET_PARTS_VIEW", options)
    return { rowCount: res.rowCount ?? 0 }
  }

  /**
   * Rapor tablosunda filtreleme, sıralama ve sayfalama ile SQL sorgusu çalıştırır.
   */
  async queryReportRows(options: {
    tableName: string
    filters?: Record<string, string>
    numericColumns?: Set<string>
    sortBy?: string | null
    sortDesc?: boolean
    limit?: number
    offset?: number
  }): Promise<{
    rows: Record<string, unknown>[]
    totalFiltered?: number
    hasMore: boolean
    isCapped?: boolean
  }> {
    const {
      tableName,
      filters = {},
      numericColumns = new Set(),
      sortBy,
      sortDesc = false,
      limit = 1000,
      offset = 0,
    } = options

    const where = buildCombinedWhereClause(filters, numericColumns)
    const escapedTable = `"${tableName.replace(/"/g, '""')}"`

    // 1. Önce istenen satırları al (LIMIT + 1 ile, hasMore tespiti için)
    // Parquet filtre pushdown sayesinde 100M satırda dahi DuckDB yalnızca
    // eşleşen ilk blokları tarar ve 10-20 ms içinde anında sonuç döner.
    let orderClause = ""
    if (sortBy) {
      const escapedSort = `"${sortBy.replace(/"/g, '""')}"`
      orderClause = `ORDER BY ${escapedSort} ${sortDesc ? "DESC" : "ASC"}`
    }

    const selectSql = `SELECT * FROM ${escapedTable} ${where} ${orderClause} LIMIT ${limit + 1} OFFSET ${offset};`
    const rowsRes = await this.postMessage<WorkerResponse>("QUERY_ROWS", {
      sql: selectSql,
    })

    const rawRows = rowsRes.rows ?? []
    const hasMore = rawRows.length > limit
    const rows = hasMore ? rawRows.slice(0, limit) : rawRows

    // 2. Filtrelenmiş satır sayısı hesabı:
    // Yalnızca ilk sayfada (offset === 0) hesaplanır.
    // Eğer dönen satır sayısı limit'e ulaşmadıysa ek COUNT sorgusuna gerek yoktur (0 ms).
    // Sayfalama (offset > 0) esnasında COUNT tekrar çalıştırılmaz ve önceki değer korunur.
    let totalFiltered: number | undefined = undefined

    if (offset === 0) {
      if (!hasMore) {
        totalFiltered = rows.length
      } else {
        const countSql = `SELECT COUNT(*)::BIGINT as count FROM ${escapedTable} ${where};`
        try {
          const countRes = await this.postMessage<WorkerResponse>("QUERY_SCALAR", {
            sql: countSql,
          })
          const rawCount =
            countRes.result?.count ??
            countRes.result?.["count(*)"] ??
            countRes.result?.["COUNT(*)"] ??
            Object.values(countRes.result ?? {})[0]
          totalFiltered = Number(rawCount ?? 0)
        } catch {
          totalFiltered = rows.length
        }
      }
    }

    return {
      rows,
      totalFiltered,
      hasMore,
    }
  }

  /**
   * Doğrudan SQL sorgusu çalıştırır ve satırları döner (AI / Text-to-SQL analitiği için).
   */
  async executeCustomSql(sql: string): Promise<Record<string, unknown>[]> {
    const res = await this.postMessage<WorkerResponse>("QUERY_ROWS", { sql })
    return res.rows ?? []
  }

  /**
   * Tablo şemasını ve kolon tiplerini sorgular.
   */
  async describeTable(tableName: string): Promise<
    {
      name: string
      label: string
      align: "left" | "right"
      isNumeric: boolean
      /** Ham DuckDB tipi (DATE, TIMESTAMP, VARCHAR, DECIMAL...) — AI şema grounding'i için. */
      duckType?: string
    }[]
  > {
    const res = await this.postMessage<{
      id: number
      success: boolean
      columns?: {
        name: string
        label: string
        align: "left" | "right"
        isNumeric: boolean
        duckType?: string
      }[]
    }>("DESCRIBE_TABLE", { tableName })
    return res.columns ?? []
  }

  /**
   * Tablonun DuckDB içinde zaten mevcut olup olmadığını kontrol eder.
   */
  async checkTableExists(tableName: string): Promise<{ exists: boolean; rowCount: number }> {
    const res = await this.postMessage<{
      id: number
      success: boolean
      exists?: boolean
      rowCount?: number
    }>("CHECK_TABLE_EXISTS", { tableName })
    return { exists: Boolean(res?.exists), rowCount: res?.rowCount ?? 0 }
  }

  /**
   * Rapor tablosunu DuckDB WASM motoru üzerinden Excel (.xlsx) veya
   * UTF-8 BOM CSV olarak dışa aktarır ve tarayıcıda doğrudan indirme başlatır.
   */
  async exportReportTable(options: {
    tableName: string
    fileName?: string
    filters?: Record<string, string>
    numericColumns?: Set<string>
    sortBy?: string | null
    sortDesc?: boolean
    columns?: string[]
    preferredFormat?: "xlsx" | "csv"
    maxRowsPerSheet?: number
    maxTotalRows?: number
  }): Promise<{
    format: "xlsx" | "csv"
    fileName: string
    sizeBytes: number
    totalRows: number
    sheetCount: number
  }> {
    const {
      tableName,
      fileName = "rapor",
      filters = {},
      numericColumns = new Set(),
      sortBy,
      sortDesc = false,
      columns,
      preferredFormat = "xlsx",
      maxRowsPerSheet = 1_000_000,
      maxTotalRows,
    } = options

    const whereClause = buildCombinedWhereClause(filters, numericColumns)
    let orderClause = ""
    if (sortBy) {
      const escapedSort = `"${sortBy.replace(/"/g, '""')}"`
      orderClause = `ORDER BY ${escapedSort} ${sortDesc ? "DESC" : "ASC"}`
    }

    const res = await this.postMessage<WorkerResponse>("EXPORT_TABLE", {
      tableName,
      columns,
      whereClause,
      orderClause,
      fileName,
      preferredFormat,
      maxRowsPerSheet,
      maxTotalRows,
    })

    if (!res.buffer) {
      throw new Error("Dışa aktarılan dosya tamponu boş döndü.")
    }

    const mimeType =
      res.format === "xlsx"
        ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        : "text/csv;charset=utf-8;"

    const blob = new Blob([res.buffer], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = res.fileName || `${fileName}.${res.format || "csv"}`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    setTimeout(() => URL.revokeObjectURL(url), 60000)

    return {
      format: res.format ?? "csv",
      fileName: link.download,
      sizeBytes: blob.size,
      totalRows: res.totalRows ?? 0,
      sheetCount: res.sheetCount ?? 1,
    }
  }

  /**
   * Tabloyu temizler / kaldırır.
   */
  async dropTable(tableName: string): Promise<void> {
    await this.postMessage("DROP_TABLE", { tableName })
  }

  /**
   * DuckDB motorunu sıfırlayıp belleği tamamen boşaltır.
   */
  async resetDatabase(): Promise<void> {
    // Önceki tablolara ait bekleyen sorguları iptal et
    for (const [, pending] of this.pendingRequests.entries()) {
      pending.reject(new DOMException("Veritabanı sıfırlandı, önceki sorgu iptal edildi", "AbortError"))
    }
    this.pendingRequests.clear()
    this.sendQueue = Promise.resolve()

    await this.postMessage("RESET_DATABASE", {})
  }
}

export const duckDbClient = new DuckDbClient()
