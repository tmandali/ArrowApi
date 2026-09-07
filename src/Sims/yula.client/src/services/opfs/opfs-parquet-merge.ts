import { opfsReportCache } from "@/services/opfs/opfs-cache"
import initParquetWasm, {
  readParquet,
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
