import { duckDbClient } from "@/services/duckdb"
import { opfsReportCache } from "@/services/opfs/opfs-cache"
import { getCompanyHeaders } from "@/lib/company-headers"
import { arrowStreamClient } from "@/services/arrow-stream/arrow-stream-client"
import { resolveApiUrl } from "@/lib/api-url"

export type StreamSessionState = {
  jobId: string
  jobUrl: string
  tableName: string
  expectedTotalRows?: number | null
  streamedRows: number
  isStreaming: boolean
  isSavingDisk: boolean
  isFromCache: boolean
  isComplete: boolean
  /** DuckDB VIEW / TABLE oluşturuldu ve sorgulanabilir durumda mı? */
  isTableReady: boolean
  /** WASM bellek tavanı / akış kesintisi: yalnızca inen satırlar mevcut. */
  isPartial: boolean
  error: string | null
}

type StreamSessionInternal = StreamSessionState & {
  abortController: AbortController
  listeners: Set<(state: StreamSessionState) => void>
  /** Terminal durumda, dinleyici kalmayınca 60sn sonra session'ını temizler. */
  cleanupTimer?: ReturnType<typeof setTimeout> | null
}

class DuckStreamManager {
  private sessions = new Map<string, StreamSessionInternal>()
  private activeJobId: string | null = null

  /**
   * Belirtilen jobId için akış durumunu döner.
   */
  getState(jobId: string): StreamSessionState | null {
    const session = this.sessions.get(jobId)
    if (!session) return null
    return this.exportState(session)
  }

  /**
   * Akışı başlatır veya devam eden akışa abone olur.
   * Kullanıcı sayfa değiştirse dahi akış arka planda kesilmeden tamamlanır.
   */
  subscribe(
    options: {
      jobId: string
      jobUrl: string
      tableName: string
      expectedTotalRows?: number | null
      onError?: (err: string | null) => void
    },
    listener: (state: StreamSessionState) => void
  ): () => void {
    const { jobId, jobUrl, tableName, expectedTotalRows, onError } = options

    const isDifferentReport = this.activeJobId !== null && this.activeJobId !== jobId
    if (isDifferentReport) {
      const prevJobId = this.activeJobId!
      const prevSession = this.sessions.get(prevJobId)
      if (prevSession) {
        this.cancelCleanup(prevSession)
        prevSession.abortController.abort()
        void arrowStreamClient.cancelStream(prevJobId).catch(() => {})
        this.sessions.delete(prevJobId)
      }
    }
    this.activeJobId = jobId

    let session = this.sessions.get(jobId)

    if (!session) {
      const abortController = new AbortController()
      session = {
        jobId,
        jobUrl,
        tableName,
        expectedTotalRows,
        streamedRows: 0,
        isStreaming: false,
        isSavingDisk: false,
        isFromCache: false,
        isComplete: false,
        isTableReady: false,
        isPartial: false,
        error: null,
        abortController,
        listeners: new Set(),
        cleanupTimer: null,
      }
      this.sessions.set(jobId, session)
      session.listeners.add(listener)
      this.cancelCleanup(session)

      // Arka plan indirme sürecini başlat (farklı rapora geçildiyse DuckDB motorunu sıfırla)
      void this.startBackgroundStream(session, onError, { resetDatabase: isDifferentReport })
    } else {
      session.listeners.add(listener)
      this.cancelCleanup(session)
      listener(this.exportState(session))
    }

    return () => {
      session?.listeners.delete(listener)
      if (session) this.scheduleCleanup(session)
    }
  }

  /**
   * Akışı iptal eder ve tablosunu siler (kullanıcı açıkça iptal/silme istediğinde).
   */
  cancel(jobId: string): void {
    const session = this.sessions.get(jobId)
    if (session) {
      this.cancelCleanup(session)
      session.abortController.abort()
      void arrowStreamClient.cancelStream(jobId).catch(() => {})
      void duckDbClient.dropTable(session.tableName).catch(() => {})
      void opfsReportCache.remove(jobId).catch(() => {})
      void opfsReportCache.removeParquetParts(jobId).catch(() => {})
      this.sessions.delete(jobId)
    }
  }

  /**
   * Akışı sıfırlayıp sunucudan yeniden indirir.
   */
  async restart(options: {
    jobId: string
    jobUrl: string
    tableName: string
    expectedTotalRows?: number | null
    onError?: (err: string | null) => void
  }): Promise<void> {
    const { jobId, jobUrl, tableName, expectedTotalRows, onError } = options

    let session = this.sessions.get(jobId)
    if (session) {
      session.abortController.abort()
      void arrowStreamClient.cancelStream(jobId).catch(() => {})
    }

    // Disk ve RAM önbelleklerini tamamen temizle
    await opfsReportCache.remove(jobId).catch(() => {})
    await opfsReportCache.removeParquetParts(jobId).catch(() => {})
    await duckDbClient.resetDatabase().catch(() => {})

    const abortController = new AbortController()
    if (!session) {
      session = {
        jobId,
        jobUrl,
        tableName,
        expectedTotalRows,
        streamedRows: 0,
        isStreaming: true,
        isSavingDisk: false,
        isFromCache: false,
        isComplete: false,
        isTableReady: false,
        isPartial: false,
        error: null,
        abortController,
        listeners: new Set(),
        cleanupTimer: null,
      }
      this.sessions.set(jobId, session)
    } else {
      this.cancelCleanup(session)
      session.abortController = abortController
      session.jobUrl = jobUrl
      session.tableName = tableName
      session.expectedTotalRows = expectedTotalRows
      session.streamedRows = 0
      session.isStreaming = true
      session.isSavingDisk = false
      session.isFromCache = false
      session.isComplete = false
      session.isTableReady = false
      session.isPartial = false
      session.error = null
      session.cleanupTimer = null
    }

    this.notify(session)
    // Sunucudan zorla yeniden indirmeyi başlat (forceServerFetch: true)
    void this.startBackgroundStream(session, onError, { forceServerFetch: true })
  }

  private exportState(session: StreamSessionInternal): StreamSessionState {
    return {
      jobId: session.jobId,
      jobUrl: session.jobUrl,
      tableName: session.tableName,
      expectedTotalRows: session.expectedTotalRows,
      streamedRows: session.streamedRows,
      isStreaming: session.isStreaming,
      isSavingDisk: session.isSavingDisk,
      isFromCache: session.isFromCache,
      isComplete: session.isComplete,
      isTableReady: session.isTableReady,
      isPartial: session.isPartial,
      error: session.error,
    }
  }

  private notify(session: StreamSessionInternal): void {
    const state = this.exportState(session)
    for (const listener of session.listeners) {
      try {
        listener(state)
      } catch (err) {
        console.error("DuckStreamManager listener error:", err)
      }
    }
  }

  /**
   * Akış terminal durumda (tamamlandı/hata) ve dinleyici kalmadıysa, bir süre sonra
   * tablosunu/parquet'ini silip session'ı bellekten düşürür.
   * Ana-OPFS önbelleği (yeniden açılış faydası) korunur.
   */
  private scheduleCleanup(session: StreamSessionInternal): void {
    if (session.cleanupTimer) return
    if (session.listeners.size > 0) return
    const terminal = session.isComplete || session.error !== null
    if (!terminal) return

    session.cleanupTimer = setTimeout(() => {
      session.cleanupTimer = null
      if (session.listeners.size > 0) return
      session.abortController.abort()
      void duckDbClient.dropTable(session.tableName).catch(() => {})
      this.sessions.delete(session.jobId)
    }, 60_000)
  }

  private cancelCleanup(session: StreamSessionInternal): void {
    if (session.cleanupTimer) {
      clearTimeout(session.cleanupTimer)
      session.cleanupTimer = null
    }
  }

  private async startBackgroundStream(
    session: StreamSessionInternal,
    onError?: (err: string | null) => void,
    options?: { forceServerFetch?: boolean; resetDatabase?: boolean }
  ): Promise<void> {
    const { jobId, jobUrl, tableName, abortController } = session
    const forceServerFetch = Boolean(options?.forceServerFetch)

    try {
      if (options?.resetDatabase) {
        await duckDbClient.resetDatabase().catch((err) => {
          console.warn("[DuckStreamManager] resetDatabase uyarısı:", err)
        })
      }

      if (!forceServerFetch) {
        // 1. Tablo veya View DuckDB'de zaten mevcut mu kontrol et (0ms)
        const check = await duckDbClient.checkTableExists(tableName)
        if (check.exists && check.rowCount > 0) {
          session.streamedRows = check.rowCount
          session.isStreaming = false
          session.isSavingDisk = false
          session.isFromCache = true
          session.isComplete = true
          session.isTableReady = true
          this.notify(session)
          this.scheduleCleanup(session)
          return
        }

        // 2. RAM'de yoksa yerel OPFS diskindeki çok parçalı Parquet önbelleğini kontrol et (0 internet, 0 RAM yükü)
        const hasParquet = await opfsReportCache.hasParquetParts(jobId)
        if (hasParquet) {
          const partFiles = await opfsReportCache.getParquetPartFiles(jobId)
          if (partFiles.length > 0) {
            const res = await duckDbClient.registerParquetPartsView({
              tableName,
              jobId,
              partFiles,
            })
            session.streamedRows = res.rowCount
            session.isStreaming = false
            session.isSavingDisk = false
            session.isFromCache = true
            session.isComplete = true
            session.isTableReady = true
            this.notify(session)
            this.scheduleCleanup(session)
            return
          }
        }
      }

      // Tablo henüz DuckDB'de yok ve OPFS önbelleğinde bulunamadı (veya sunucudan zorla yenileme istendi), sunucudan akışı başlat
      session.isStreaming = true
      session.isFromCache = false
      this.notify(session)

      // 3. OPFS'te de yoksa: Arka plan Web Worker ile boyuta göre parçalı (50-75MB) Parquet akışını başlat
      const result = await arrowStreamClient.startStream({
        jobId,
        jobUrl: resolveApiUrl(jobUrl),
        headers: getCompanyHeaders(),
        onProgress: async (prog) => {
          if (abortController.signal.aborted) return
          session.streamedRows = prog.streamedRows

          if (prog.partFiles && prog.partFiles.length > 0) {
            try {
              const viewRes = await duckDbClient.registerParquetPartsView({
                tableName,
                jobId,
                partFiles: prog.partFiles,
              })
              session.streamedRows = viewRes.rowCount || prog.streamedRows
              session.isTableReady = true
            } catch (vErr) {
              console.warn("[DuckStreamManager] Kısmi Parquet View oluşturulamadı:", vErr)
            }
          }

          this.notify(session)
        },
      })

      if (abortController.signal.aborted) return

      // 4. Parquet part'ları OPFS'e yazıldı; DuckDB-WASM üzerinde nihai glob VIEW oluştur
      const viewRes = await duckDbClient.registerParquetPartsView({
        tableName,
        jobId,
        partFiles: result.partFiles,
      })

      session.streamedRows = viewRes.rowCount || result.totalRows
      session.isTableReady = true
      session.isStreaming = false
      session.isSavingDisk = false
      session.isComplete = true
      this.notify(session)
      this.scheduleCleanup(session)
    } catch (err) {
      const isAborted =
        abortController.signal.aborted ||
        (err as Error)?.name === "AbortError" ||
        String(err).includes("aborted") ||
        String(err).includes("The operation was aborted") ||
        String(err).includes("The user aborted a request")

      if (!isAborted) {
        const rawMsg = (err as Error)?.message || String(err)
        let parsedMessage = rawMsg
        if (rawMsg.startsWith("{")) {
          try {
            const parsed = JSON.parse(rawMsg)
            parsedMessage = parsed.message || parsed.errorMessage || parsed.error || rawMsg
          } catch {
            parsedMessage = rawMsg
          }
        }

        const isOom =
          rawMsg.includes("Out of Memory") ||
          rawMsg.includes("could not allocate block") ||
          rawMsg.includes("Allocation failure") ||
          parsedMessage.includes("Out of Memory") ||
          parsedMessage.includes("could not allocate block") ||
          parsedMessage.includes("Allocation failure")

        console.error("DuckStreamManager stream error:", err)
        const userFriendlyMsg = isOom
          ? "Rapor boyutu tarayıcı WebAssembly bellek sınırını aştı."
          : `Rapor yüklenirken hata oluştu: ${parsedMessage}`

        session.error = userFriendlyMsg
        session.isStreaming = false
        session.isSavingDisk = false
        this.notify(session)
        onError?.(userFriendlyMsg)
        this.scheduleCleanup(session)
      }
    }
  }
}

export const duckStreamManager = new DuckStreamManager()

