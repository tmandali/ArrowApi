import {
  RecordBatchReader,
  Table,
  tableToIPC,
  type RecordBatch,
} from "apache-arrow"
import initParquetWasm, {
  Table as ParquetWasmTable,
  WriterPropertiesBuilder,
  Compression,
  writeParquet,
} from "parquet-wasm/esm"

export const DEFAULT_CHUNK_THRESHOLD_BYTES = 64 * 1024 * 1024 // 64 MB (50 MB - 75 MB aralığı)
const OPFS_PARQUET_ROOT = "sims_parquet_reports"

let wasmInitPromise: Promise<void> | null = null

async function ensureParquetWasm(): Promise<void> {
  if (!wasmInitPromise) {
    wasmInitPromise = (async () => {
      // public/parquet/parquet_wasm_bg.wasm dosyasından nesne parametresiyle yükle
      await initParquetWasm({ module_or_path: "/parquet/parquet_wasm_bg.wasm" })
      console.log("[ArrowParquetWorker] parquet-wasm initialized successfully")
    })()
  }
  await wasmInitPromise
}

export type StreamWorkerProgress = {
  type: "PROGRESS"
  jobId: string
  streamedRows: number
  partIndex: number
  partFileName: string
  partSizeBytes: number
  totalBytesProcessed: number
  partFiles: string[]
}

export type StreamWorkerComplete = {
  type: "COMPLETE"
  jobId: string
  totalRows: number
  partFiles: string[]
  totalBytesProcessed: number
}

export type StreamWorkerError = {
  type: "ERROR"
  jobId: string
  error: string
  isOom: boolean
  isAborted: boolean
  rolledBack: boolean
}

type ActiveStreamSession = {
  jobId: string
  abortController: AbortController
  writtenPartFiles: string[]
  jobDir: FileSystemDirectoryHandle | null
  parquetRootDir: FileSystemDirectoryHandle | null
}

const activeSessions = new Map<string, ActiveStreamSession>()

/**
 * RecordBatch'in bellek boyutunu (byte) hesaplar.
 */
function calculateBatchByteLength(batch: RecordBatch): number {
  let bytes = 0
  if (batch.data?.children && batch.data.children.length > 0) {
    for (const child of batch.data.children) {
      if (child.buffers) {
        for (const buf of Object.values(child.buffers)) {
          if (buf && typeof (buf as Uint8Array).byteLength === "number") {
            bytes += (buf as Uint8Array).byteLength
          }
        }
      }
    }
  }
  if (bytes === 0 && batch.data?.byteLength) {
    bytes = batch.data.byteLength
  }
  // Eğer buffer boyutları doğrudan okunamıyorsa ortalama 64 byte/satır varsayımı
  return bytes > 0 ? bytes : batch.numRows * 64
}

/**
 * Biriken Arrow RecordBatch grubunu parquet-wasm ile tek bir Parquet parçasına derler,
 * WASM belleğini anında tahliye eder ve OPFS'e yazar.
 */
async function flushBatchToParquet(options: {
  batches: RecordBatch[]
  partIndex: number
  jobDir: FileSystemDirectoryHandle
}): Promise<{ fileName: string; sizeBytes: number; rowCount: number }> {
  const { batches, partIndex, jobDir } = options
  const rowCount = batches.reduce((sum, b) => sum + b.numRows, 0)
  const fileName = `sims_part_${String(partIndex).padStart(4, "0")}.parquet`

  // 1. Arrow JS tablosu oluştur ve IPC Stream byte dizisine çevir
  const table = new Table(batches)
  const ipcStreamBytes = tableToIPC(table, "stream")

  let wasmTable: ParquetWasmTable | null = null
  let parquetBytes: Uint8Array

  try {
    // 2. Parquet-WASM Table nesnesine yükle
    wasmTable = ParquetWasmTable.fromIPCStream(ipcStreamBytes)

    // 3. Snappy sıkıştırma ile Parquet formatına derle
    const writerProperties = new WriterPropertiesBuilder()
      .setCompression(Compression.SNAPPY)
      .build()

    parquetBytes = writeParquet(wasmTable, writerProperties)
    if (!parquetBytes || parquetBytes.byteLength < 12) {
      throw new Error(`Geçersiz parquet çıktısı: ${parquetBytes?.byteLength ?? 0} byte`)
    }
  } finally {
    // 4. KRİTİK BELLEK TEMİZLİĞİ:
    // writeParquet, Rust tarafında wasmTable'ın sahipliğini (__destroy_into_raw) devralıp serbest bırakır.
    // Sadece writeParquet öncesinde bir hata fırlatıldıysa pointer hala geçerlidir; o durumda free() çağrılır.
    if (wasmTable && (wasmTable as any).__wbg_ptr !== 0) {
      try {
        wasmTable.free()
      } catch {
        // ignore
      }
    }
    wasmTable = null
  }

  // 5. OPFS diskine sıralı yazım (Sequential OPFS Write)
  const fileHandle = await jobDir.getFileHandle(fileName, { create: true })
  const writable = await fileHandle.createWritable()
  try {
    await writable.write(parquetBytes as unknown as BufferSource)
    await writable.close()
  } catch (writeErr) {
    try {
      await writable.abort().catch(() => {})
      await jobDir.removeEntry(fileName).catch(() => {})
    } catch {
      // abort yoksay
    }
    throw writeErr
  }

  const writtenFile = await fileHandle.getFile()
  if (writtenFile.size < 12) {
    await jobDir.removeEntry(fileName).catch(() => {})
    throw new Error(`Yazılan parquet parçası eksik/bozuk: ${fileName} (${writtenFile.size} byte)`)
  }

  return {
    fileName,
    sizeBytes: writtenFile.size,
    rowCount,
  }
}

/**
 * Hata veya iptal anında OPFS'te oluşturulan geçici part'ları geri alır (Rollback).
 */
async function rollbackSession(session: ActiveStreamSession): Promise<void> {
  const { jobId, jobDir, parquetRootDir, writtenPartFiles } = session
  console.warn(`[ArrowParquetWorker] Rollback başlatılıyor (${jobId}) — ${writtenPartFiles.length} parça silinecek`)

  try {
    if (jobDir) {
      for (const fileName of writtenPartFiles) {
        await jobDir.removeEntry(fileName).catch(() => {})
      }
    }
    if (parquetRootDir) {
      await parquetRootDir.removeEntry(jobId, { recursive: true }).catch(() => {})
    }
  } catch (rollbackErr) {
    console.error("[ArrowParquetWorker] Rollback temizleme hatası:", rollbackErr)
  }
}

/**
 * Ana akış yöneticisi: API'den Arrow IPC akışını okur, 50-75 MB eşiğiyle böler,
 * Parquet olarak OPFS'e yazar ve tamamlandığında part listesini döner.
 */
async function processArrowStream(payload: {
  id: number
  jobId: string
  jobUrl: string
  headers?: Record<string, string>
  thresholdBytes?: number
}): Promise<void> {
  const { id, jobId, jobUrl, headers = {}, thresholdBytes = DEFAULT_CHUNK_THRESHOLD_BYTES } = payload

  // Eğer önceki akış varsa sonlandır
  const existing = activeSessions.get(jobId)
  if (existing) {
    existing.abortController.abort()
    activeSessions.delete(jobId)
  }

  const abortController = new AbortController()
  const session: ActiveStreamSession = {
    jobId,
    abortController,
    writtenPartFiles: [],
    jobDir: null,
    parquetRootDir: null,
  }
  activeSessions.set(jobId, session)

  let totalRows = 0
  let totalBytesProcessed = 0

  try {
    // 1. WASM modülünü ve OPFS dizinlerini hazırla
    await ensureParquetWasm()

    const root = await navigator.storage.getDirectory()
    const parquetRoot = await root.getDirectoryHandle(OPFS_PARQUET_ROOT, { create: true })
    const jobDir = await parquetRoot.getDirectoryHandle(jobId, { create: true })

    session.parquetRootDir = parquetRoot
    session.jobDir = jobDir

    // 2. API'den Arrow IPC stream'i başlat
    const res = await fetch(jobUrl, {
      signal: abortController.signal,
      headers: {
        Accept: "application/vnd.apache.arrow.stream, application/octet-stream",
        ...headers,
      },
    })

    if (!res.ok || !res.body) {
      throw new Error(`API veri akışı başlatılamadı: HTTP ${res.status}`)
    }

    // 3. Arrow IPC RecordBatchReader ile akışı tüket
    const reader = await RecordBatchReader.from(res.body)

    let batchBuffer: RecordBatch[] = []
    let currentBufferBytes = 0
    let partIndex = 1

    for await (const batch of reader) {
      if (abortController.signal.aborted) {
        throw new DOMException("Stream aborted by user", "AbortError")
      }

      batchBuffer.push(batch)
      totalRows += batch.numRows

      const batchBytes = calculateBatchByteLength(batch)
      currentBufferBytes += batchBytes
      totalBytesProcessed += batchBytes

      // Eşik (50 MB - 75 MB) aşıldığında Parquet dosyasına yaz ve WASM belleğini boşalt
      if (currentBufferBytes >= thresholdBytes) {
        const { fileName, sizeBytes } = await flushBatchToParquet({
          batches: batchBuffer,
          partIndex,
          jobDir,
        })

        session.writtenPartFiles.push(fileName)

        // Belleği anında sıfırla
        batchBuffer = []
        currentBufferBytes = 0
        partIndex++

        // Main thread'e ilerleme bildir
        self.postMessage({
          id,
          type: "PROGRESS",
          jobId,
          streamedRows: totalRows,
          partIndex: partIndex - 1,
          partFileName: fileName,
          partSizeBytes: sizeBytes,
          totalBytesProcessed,
          partFiles: [...session.writtenPartFiles],
        } satisfies StreamWorkerProgress & { id: number })
      }
    }

    // 4. Kalan son batch grubunu yaz
    if (batchBuffer.length > 0 && !abortController.signal.aborted) {
      const { fileName, sizeBytes } = await flushBatchToParquet({
        batches: batchBuffer,
        partIndex,
        jobDir,
      })

      session.writtenPartFiles.push(fileName)
      batchBuffer = []
      currentBufferBytes = 0

      self.postMessage({
        id,
        type: "PROGRESS",
        jobId,
        streamedRows: totalRows,
        partIndex,
        partFileName: fileName,
        partSizeBytes: sizeBytes,
        totalBytesProcessed,
        partFiles: [...session.writtenPartFiles],
      } satisfies StreamWorkerProgress & { id: number })
    }

    // 5. Akış başarıyla tamamlandı: '_complete' onay dosyasını yaz
    try {
      const completeHandle = await jobDir.getFileHandle("_complete", { create: true })
      const completeWritable = await completeHandle.createWritable()
      await completeWritable.write(
        new TextEncoder().encode(
          JSON.stringify({
            jobId,
            totalRows,
            partFiles: session.writtenPartFiles,
            completedAt: Date.now(),
          })
        )
      )
      await completeWritable.close()
    } catch (manifestErr) {
      console.warn("[ArrowParquetWorker] _complete dosyası yazılamadı:", manifestErr)
    }

    self.postMessage({
      id,
      type: "COMPLETE",
      jobId,
      totalRows,
      partFiles: [...session.writtenPartFiles],
      totalBytesProcessed,
    } satisfies StreamWorkerComplete & { id: number })

    activeSessions.delete(jobId)
  } catch (err) {
    const isAborted =
      abortController.signal.aborted ||
      (err as Error)?.name === "AbortError" ||
      String(err).includes("aborted")

    const rawMsg = (err as Error)?.message || String(err)
    const isOom =
      rawMsg.includes("Out of Memory") ||
      rawMsg.includes("Allocation failure") ||
      rawMsg.includes("could not allocate block")

    // Hata durumunda rollback yap
    await rollbackSession(session)
    activeSessions.delete(jobId)

    self.postMessage({
      id,
      type: "ERROR",
      jobId,
      error: rawMsg,
      isOom,
      isAborted,
      rolledBack: true,
    } satisfies StreamWorkerError & { id: number })
  }
}

// Web Worker mesaj dinleyicisi
self.onmessage = async (e: MessageEvent) => {
  const { type, id, payload } = e.data ?? {}

  if (type === "START_STREAM") {
    void processArrowStream({ id, ...payload })
  } else if (type === "CANCEL_STREAM") {
    const { jobId } = payload ?? {}
    const session = activeSessions.get(jobId)
    if (session) {
      session.abortController.abort()
      await rollbackSession(session)
      activeSessions.delete(jobId)
    }
    self.postMessage({ id, type: "CANCELLED", jobId })
  }
}
