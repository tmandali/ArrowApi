import { buildCombinedWhereClause } from "./filter-parser"

type WorkerResponse = {
  id: number
  success: boolean
  rows?: Record<string, unknown>[]
  totalRows?: number
  result?: Record<string, unknown>
  rowCount?: number
  error?: string
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
      }
    }
    return this.worker
  }

  private postMessage<T = WorkerResponse>(
    type: string,
    payload: Record<string, unknown>,
    transfer?: Transferable[]
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
          if (transfer && transfer.length > 0) {
            worker.postMessage({ id, type, payload }, transfer)
          } else {
            worker.postMessage({ id, type, payload })
          }
        })
    )
    this.sendQueue = request.then(
      () => undefined,
      () => undefined
    )
    return request
  }

  /**
   * Arrow IPC buffer'ını DuckDB tablosuna aktarır.
   */
  async ingestArrowBatch(
    tableName: string,
    buffer: Uint8Array | ArrayBuffer,
    append = false,
    rowCount?: number
  ): Promise<number> {
    const res = await this.postMessage<WorkerResponse>("INGEST_ARROW_BATCH", {
      tableName,
      buffer,
      append,
      rowCount,
    })
    return res.rowCount ?? 0
  }

  /**
   * İndirilen tabloyu yerel Parquet dosyasına aktarıp RAM'i boşaltır ve View oluşturur.
   */
  async finalizeParquetView(tableName: string, jobId?: string): Promise<void> {
    await this.postMessage("FINALIZE_PARQUET_VIEW", { tableName, jobId })
  }

  /**
   * OPFS yedeğindeki Parquet buffer'ını DuckDB'ye View olarak bağlar.
   * DİKKAT: buffer DuckDB WASM belleğine kopyalanır — dosya boyutu kadar RAM tutar.
   * Gerçek 0-RAM yol DuckDB'nin kendi OPFS'inden `read_parquet`'tır (`CHECK_TABLE_EXISTS`).
   */
  async registerParquetBuffer(
    tableName: string,
    buffer: Uint8Array
  ): Promise<number> {
    const res = await this.postMessage<{
      id: number
      success: boolean
      rowCount?: number
    }>(
      "REGISTER_PARQUET_BUFFER",
      { tableName, buffer },
      [buffer.buffer]
    )
    return res.rowCount ?? 0
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
    totalFiltered: number
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

    // 1. Filtrelenmiş satır sayısını al
    const countSql = `SELECT COUNT(*) as count FROM ${escapedTable} ${where};`
    const countRes = await this.postMessage<WorkerResponse>("QUERY_SCALAR", {
      sql: countSql,
    })
    const rawCount =
      countRes.result?.count ??
      countRes.result?.["count(*)"] ??
      countRes.result?.["COUNT(*)"] ??
      Object.values(countRes.result ?? {})[0]
    const totalFiltered = Number(rawCount ?? 0)

    // 2. Filtrelenmiş satırları al
    let orderClause = ""
    if (sortBy) {
      const escapedSort = `"${sortBy.replace(/"/g, '""')}"`
      orderClause = `ORDER BY ${escapedSort} ${sortDesc ? "DESC" : "ASC"}`
    }

    const selectSql = `SELECT * FROM ${escapedTable} ${where} ${orderClause} LIMIT ${limit} OFFSET ${offset};`
    const rowsRes = await this.postMessage<WorkerResponse>("QUERY_ROWS", {
      sql: selectSql,
    })

    return {
      rows: rowsRes.rows ?? [],
      totalFiltered,
    }
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
      }[]
    }>("DESCRIBE_TABLE", { tableName })
    return res.columns ?? []
  }

  /**
   * Tablonun DuckDB içinde zaten mevcut olup olmadığını kontrol eder.
   */
  async checkTableExists(
    tableName: string,
    jobId?: string
  ): Promise<{ exists: boolean; rowCount: number }> {
    const res = await this.postMessage<{
      id: number
      success: boolean
      exists?: boolean
      rowCount?: number
    }>("CHECK_TABLE_EXISTS", { tableName, jobId })
    return { exists: Boolean(res?.exists), rowCount: res?.rowCount ?? 0 }
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
    await this.postMessage("RESET_DATABASE", {})
  }
}

export const duckDbClient = new DuckDbClient()
