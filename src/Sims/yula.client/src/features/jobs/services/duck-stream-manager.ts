import {
  type RecordBatch,
  RecordBatchReader,
  tableToIPC,
  Table,
} from "apache-arrow"
import { duckDbClient } from "@/services/duckdb"
import { opfsReportCache } from "@/services/opfs/opfs-cache"
import { getCompanyHeaders } from "@/lib/company-headers"

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
        isPartial: false,
        error: null,
        abortController,
        listeners: new Set(),
        cleanupTimer: null,
      }
      this.sessions.set(jobId, session)
      session.listeners.add(listener)
      this.cancelCleanup(session)

      // Arka plan indirme sürecini başlat
      void this.startBackgroundStream(session, onError)
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
      void duckDbClient.dropTable(session.tableName).catch(() => {})
      void opfsReportCache.remove(jobId).catch(() => {})
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
    }

    await opfsReportCache.remove(jobId).catch(() => {})
    await duckDbClient.dropTable(tableName).catch(() => {})

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
      session.isPartial = false
      session.error = null
      session.cleanupTimer = null
    }

    this.notify(session)
    void this.startBackgroundStream(session, onError)
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
    onError?: (err: string | null) => void
  ): Promise<void> {
    const { jobId, jobUrl, tableName, abortController } = session

    try {
      // 1. Tablo DuckDB'de zaten mevcut mu kontrol et (0ms)
      const check = await duckDbClient.checkTableExists(tableName)
      if (check.exists && check.rowCount > 0) {
        session.streamedRows = check.rowCount
        session.isStreaming = false
        session.isSavingDisk = false
        session.isFromCache = true
        session.isComplete = true
        this.notify(session)
        this.scheduleCleanup(session)
        return
      }

      // Tablo henüz DuckDB'de yok, akışı başlat
      session.isStreaming = true
      this.notify(session)

      // 2. RAM'de yoksa yerel OPFS diskindeki Arrow akışını kontrol et (0 internet)
      let stream: ReadableStream<Uint8Array> | null = null

      const opfsStream = await opfsReportCache.getStream(jobId)
      if (opfsStream) {
        stream = opfsStream
        session.isFromCache = true
      } else {
        // 3. OPFS'te de yoksa sunucudan indir
        const res = await fetch(jobUrl, {
          signal: abortController.signal,
          headers: {
            Accept: "application/vnd.apache.arrow.stream, application/octet-stream",
            ...getCompanyHeaders(),
          },
        })

        if (!res.ok || !res.body) {
          throw new Error(`Veri akışı hatası (${res.status})`)
        }

        const opfsWritable = await opfsReportCache.createWritable(jobId).catch(() => null)
        if (opfsWritable) {
          const [streamForReader, streamForOpfs] = res.body.tee()
          stream = streamForReader
          // Arka planda sunucudan gelen saf Arrow binary akışını birebir diske kaydet
          void streamForOpfs
            .pipeTo(opfsWritable, { signal: abortController.signal })
            .catch(() => {})
        } else {
          stream = res.body
        }
      }

      const reader = await RecordBatchReader.from(stream)
      let totalCount = 0
      let batchGroup: RecordBatch[] = []
      let groupRowCount = 0
      let isFirst = true
      const chunkSize = 50_000

      for await (const batch of reader) {
        if (abortController.signal.aborted) return
        batchGroup.push(batch)
        groupRowCount += batch.numRows

        if (groupRowCount >= chunkSize) {
          const table = new Table(batchGroup)
          const bytes = tableToIPC(table, "stream")

          totalCount = await duckDbClient.ingestArrowBatch(
            tableName,
            bytes,
            !isFirst,
            groupRowCount
          )
          if (abortController.signal.aborted) return
          batchGroup = []
          groupRowCount = 0
          isFirst = false

          session.streamedRows = totalCount
          this.notify(session)
        }
      }

      // Kalan son paketleri aktar
      if (batchGroup.length > 0 && !abortController.signal.aborted) {
        const table = new Table(batchGroup)
        const bytes = tableToIPC(table, "stream")

        totalCount = await duckDbClient.ingestArrowBatch(
          tableName,
          bytes,
          !isFirst,
          groupRowCount
        )
        if (abortController.signal.aborted) return
        session.streamedRows = totalCount
      }

      // İndirme/ingest tamamlandı. Kalıcılık: ham Arrow IPC cache
      // (sims_arrow_reports/<jobId>.arrow) — indirme sırasında tee ile zaten
      // OPFS'e yazıldı; F5 sonrası getStream ile yeniden ingest edilir (0 internet).
      // Parquet dönüşümü kaldırıldı: COPY + copyFileToBuffer, WASM heap'inde
      // tablo boyutunda spike üretiyordu ve büyük raporlarda sessizce OOM'luyordu.
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

        const isTruncated =
          rawMsg.includes("Expected to read") ||
          parsedMessage.includes("Expected to read")

        if ((isOom || isTruncated) && session.streamedRows > 0) {
          // Bellek sınırına veya akış sonu kesintisine ulaşıldı, ancak şimdiye
          // kadar inen satırları koru. Beklenen/yönetilen durum: warn yeterli,
          // console.error Next dev overlay'de sahte Console Error üretir.
          console.warn(
            isOom
              ? "WASM bellek tavanına ulaşıldı. Mevcut satırlarla devam ediliyor:"
              : "Akış kesildi ancak inen satırlarla devam ediliyor:",
            session.streamedRows
          )
          session.isStreaming = false
          session.isSavingDisk = false
          session.isComplete = true
          session.isPartial = true
          session.error = null
          this.notify(session)
          this.scheduleCleanup(session)
        } else {
          console.error("DuckStreamManager stream error:", err)
          const userFriendlyMsg = isOom
            ? "Rapor boyutu tarayıcı WebAssembly bellek sınırını (~3 GB) aştı."
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
}

export const duckStreamManager = new DuckStreamManager()

