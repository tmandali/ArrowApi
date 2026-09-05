import type {
  StreamWorkerProgress,
  StreamWorkerComplete,
  StreamWorkerError,
} from "./arrow-parquet-stream.worker"

export type StreamProgressCallback = (progress: {
  streamedRows: number
  partIndex: number
  partFileName: string
  partSizeBytes: number
  totalBytesProcessed: number
  partFiles: string[]
}) => void | Promise<void>

type PendingRequest = {
  jobId: string
  onProgress?: StreamProgressCallback
  resolve: (result: { totalRows: number; partFiles: string[]; totalBytesProcessed: number }) => void
  reject: (reason: unknown) => void
}

class ArrowStreamClient {
  private worker: Worker | null = null
  private messageSeq = 0
  private pendingRequests = new Map<number, PendingRequest>()

  private getWorker(): Worker {
    if (!this.worker) {
      this.worker = new Worker(
        new URL("./arrow-parquet-stream.worker.ts", import.meta.url),
        { type: "module" }
      )

      this.worker.onmessage = (e: MessageEvent) => {
        const data = e.data as (
          | (StreamWorkerProgress & { id: number })
          | (StreamWorkerComplete & { id: number })
          | (StreamWorkerError & { id: number })
          | { id: number; type: "CANCELLED"; jobId: string }
        )

        const { id, type } = data
        const pending = this.pendingRequests.get(id)
        if (!pending) return

        if (type === "PROGRESS") {
          void pending.onProgress?.({
            streamedRows: data.streamedRows,
            partIndex: data.partIndex,
            partFileName: data.partFileName,
            partSizeBytes: data.partSizeBytes,
            totalBytesProcessed: data.totalBytesProcessed,
            partFiles: data.partFiles ?? [],
          })
        } else if (type === "COMPLETE") {
          this.pendingRequests.delete(id)
          pending.resolve({
            totalRows: data.totalRows,
            partFiles: data.partFiles,
            totalBytesProcessed: data.totalBytesProcessed,
          })
        } else if (type === "ERROR") {
          this.pendingRequests.delete(id)
          pending.reject(new Error(data.error))
        } else if (type === "CANCELLED") {
          this.pendingRequests.delete(id)
          pending.reject(new DOMException("Akış kullanıcı tarafından iptal edildi", "AbortError"))
        }
      }

      this.worker.onerror = (err) => {
        console.error("[ArrowStreamClient] Worker error:", err)
      }
    }
    return this.worker
  }

  /**
   * API'den gelen Arrow IPC akışını başlatır, boyut tabanlı Parquet part'ları olarak OPFS'e yazar.
   */
  startStream(options: {
    jobId: string
    jobUrl: string
    headers?: Record<string, string>
    thresholdBytes?: number
    onProgress?: StreamProgressCallback
  }): Promise<{ totalRows: number; partFiles: string[]; totalBytesProcessed: number }> {
    const { jobId, jobUrl, headers, thresholdBytes, onProgress } = options
    const worker = this.getWorker()
    const id = ++this.messageSeq

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, {
        jobId,
        onProgress,
        resolve,
        reject,
      })

      worker.postMessage({
        id,
        type: "START_STREAM",
        payload: {
          jobId,
          jobUrl,
          headers,
          thresholdBytes,
        },
      })
    })
  }

  /**
   * Devam eden akışı iptal eder ve OPFS'teki geçici dosyaları geri alır (rollback).
   */
  async cancelStream(jobId: string): Promise<void> {
    const worker = this.getWorker()
    const id = ++this.messageSeq

    worker.postMessage({
      id,
      type: "CANCEL_STREAM",
      payload: { jobId },
    })
  }

  /**
   * Worker nesnesini sonlandırır.
   */
  terminate(): void {
    if (this.worker) {
      this.worker.terminate()
      this.worker = null
      this.pendingRequests.clear()
    }
  }
}

export const arrowStreamClient = new ArrowStreamClient()
