import { opfsReportCache } from "@/services/opfs/opfs-cache"
import { duckDbClient } from "@/services/duckdb/duckdb-client"
import initParquetWasm, {
  readParquet,
  Table as ParquetWasmTable,
  transformParquetStream,
  WriterPropertiesBuilder,
  Compression,
} from "parquet-wasm/esm"

let wasmInitPromise: Promise<void> | null = null

/**
 * parquet-wasm motorunu public/parquet dizinindeki WASM ikilisi ile ilklendirir.
 */
export async function ensureParquetWasm(): Promise<void> {
  if (!wasmInitPromise) {
    wasmInitPromise = (async () => {
      await initParquetWasm({ module_or_path: "/parquet/parquet_wasm_bg.wasm" })
      console.log("[OpfsParquetMerge] parquet-wasm initialized successfully")
    })()
  }
  await wasmInitPromise
}

function triggerDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = fileName.endsWith(".parquet") ? fileName : `${fileName}.parquet`
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

/**
 * Belirtilen jobId'ye ait OPFS üzerinde parçalı saklanan Parquet dosyalarını
 * (`sims_part_XXXX.parquet`) sıralı akış (lazy pull-stream) ile birleştirip
 * tek bir Apache Parquet dosyası olarak tarayıcıda doğrudan indirme başlatır.
 *
 * Bu işlem DuckDB-WASM'ın 32-bit kısıtlı bellek alanını (OOM) tamamen baypas eder
 * ve parçaları diskten tek tek okuduğu için bellek tüketimini minimumda tutar.
 */
export async function exportOpfsMergedParquet(options: {
  jobId: string
  fileName?: string
}): Promise<{
  format: "parquet"
  fileName: string
  sizeBytes: number
  totalRows: number
}> {
  const { jobId, fileName = `rapor_${jobId}` } = options

  const hasParts = await opfsReportCache.hasParquetParts(jobId)
  if (!hasParts) {
    throw new Error(`OPFS üzerinde ${jobId} için geçerli Parquet parçaları bulunamadı.`)
  }

  const jobDir = await opfsReportCache.getParquetDirectory(jobId, false)
  if (!jobDir) {
    throw new Error(`OPFS dizinine erişilemedi: ${jobId}`)
  }

  const partFiles = await opfsReportCache.getParquetPartFiles(jobId)
  if (partFiles.length === 0) {
    throw new Error(`İndirilecek Parquet parçası bulunamadı.`)
  }

  const finalFileName = fileName.endsWith(".parquet") ? fileName : `${fileName}.parquet`

  // DURUM 1: Tek parça varsa birleştirmeye gerek kalmadan doğrudan diski oku ve indir (0ms / Sıfır bellek yükü)
  if (partFiles.length === 1) {
    const fileHandle = await jobDir.getFileHandle(partFiles[0])
    const file = await fileHandle.getFile()
    const buffer = await file.arrayBuffer()
    const blob = new Blob([buffer], { type: "application/vnd.apache.parquet" })

    let rowCount = 0
    try {
      await ensureParquetWasm()
      const wasmTable = readParquet(new Uint8Array(buffer))
      const batches = wasmTable.recordBatches()
      for (const b of batches) {
        rowCount += b.numRows
      }
    } catch {
      // Satır sayısı okunamasa da dosya geçerlidir
    }

    triggerDownload(blob, finalFileName)
    return {
      format: "parquet",
      fileName: finalFileName,
      sizeBytes: blob.size,
      totalRows: rowCount,
    }
  }

  // DURUM 2: Birden fazla parça varsa lazy streaming ile birleştir
  await ensureParquetWasm()

  const writerProps = new WriterPropertiesBuilder()
    .setCompression(Compression.SNAPPY)
    .build()

  let currentPartIndex = 0
  let totalRowCount = 0

  const lazyRecordBatchStream = new ReadableStream({
    async pull(controller) {
      if (currentPartIndex >= partFiles.length) {
        controller.close()
        return
      }

      const partFileName = partFiles[currentPartIndex++]
      try {
        const fileHandle = await jobDir.getFileHandle(partFileName)
        const file = await fileHandle.getFile()
        const arrayBuffer = await file.arrayBuffer()
        const wasmTable = readParquet(new Uint8Array(arrayBuffer))
        const batches = wasmTable.recordBatches()
        for (const batch of batches) {
          totalRowCount += batch.numRows
          controller.enqueue(batch)
        }
      } catch (err) {
        controller.error(err)
      }
    },
  })

  const parquetOutputStream = await transformParquetStream(lazyRecordBatchStream, writerProps)
  const reader = parquetOutputStream.getReader()
  const outputChunks: BlobPart[] = []

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) {
      outputChunks.push(value as unknown as BlobPart)
    }
  }

  const mergedBlob = new Blob(outputChunks, { type: "application/vnd.apache.parquet" })
  triggerDownload(mergedBlob, finalFileName)

  return {
    format: "parquet",
    fileName: finalFileName,
    sizeBytes: mergedBlob.size,
    totalRows: totalRowCount,
  }
}

/**
 * DuckDB'deki özel SQL sorgusu veya filtrelenmiş tabloyu,
 * DuckDB WASM'ın 32-bit bellek sınırını (OOM) tamamen baypas edecek şekilde
 * 50.000 satırlık kontrollü Arrow IPC chunk'ları ve parquet-wasm lazy stream
 * mimarisiyle tek bir Apache Parquet dosyası olarak tarayıcıda doğrudan indirir.
 */
export async function exportQueryToParquetStream(options: {
  tableName: string
  customSql?: string
  columns?: string[]
  filters?: Record<string, string>
  numericColumns?: Set<string>
  sortBy?: string | null
  sortDesc?: boolean
  sortConfigs?: { column: string; desc: boolean }[]
  fileName?: string
  chunkSize?: number
  onProgress?: (processed: number, total: number) => void
}): Promise<{
  format: "parquet"
  fileName: string
  sizeBytes: number
  totalRows: number
}> {
  const {
    tableName,
    customSql,
    columns,
    filters = {},
    numericColumns = new Set(),
    sortBy,
    sortDesc = false,
    sortConfigs,
    fileName = "rapor",
    chunkSize = 50_000,
    onProgress,
  } = options

  const finalFileName = fileName.endsWith(".parquet") ? fileName : `${fileName}.parquet`

  // 1. Toplam satır sayısını al
  const totalRows = await duckDbClient.getQueryRowCount({
    tableName,
    customSql,
    filters,
    numericColumns,
  })

  if (totalRows === 0) {
    throw new Error("Dışa aktarılacak satır bulunamadı.")
  }

  // 2. parquet-wasm motorunu hazırla
  await ensureParquetWasm()

  const writerProps = new WriterPropertiesBuilder()
    .setCompression(Compression.SNAPPY)
    .build()

  let currentOffset = 0
  let totalProcessed = 0

  // 3. DuckDB'den parça parça çekip parquet-wasm'a akıtan lazy stream
  const lazyRecordBatchStream = new ReadableStream({
    async pull(controller) {
      if (currentOffset >= totalRows) {
        controller.close()
        return
      }

      const limit = Math.min(chunkSize, totalRows - currentOffset)
      try {
        const { ipcBytes, rowCount } = await duckDbClient.fetchArrowIpcChunk({
          tableName,
          customSql,
          columns,
          filters,
          numericColumns,
          sortBy,
          sortDesc,
          sortConfigs,
          limit,
          offset: currentOffset,
        })

        if (rowCount === 0 || ipcBytes.byteLength === 0) {
          controller.close()
          return
        }

        currentOffset += rowCount
        totalProcessed += rowCount
        onProgress?.(totalProcessed, totalRows)

        const wasmTable = ParquetWasmTable.fromIPCStream(ipcBytes)
        const batches = wasmTable.recordBatches()
        for (const batch of batches) {
          controller.enqueue(batch)
        }
        // WASM belleğini temizle
        try {
          wasmTable.free()
        } catch {
          // ignore
        }
      } catch (err) {
        controller.error(err)
      }
    },
  })

  // 4. RecordBatch akışını Snappy Parquet bayt akışına dönüştür
  const parquetOutputStream = await transformParquetStream(lazyRecordBatchStream, writerProps)
  const reader = parquetOutputStream.getReader()
  const outputChunks: BlobPart[] = []

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) {
      outputChunks.push(value as unknown as BlobPart)
    }
  }

  const mergedBlob = new Blob(outputChunks, { type: "application/vnd.apache.parquet" })
  triggerDownload(mergedBlob, finalFileName)

  return {
    format: "parquet",
    fileName: finalFileName,
    sizeBytes: mergedBlob.size,
    totalRows: totalProcessed,
  }
}

