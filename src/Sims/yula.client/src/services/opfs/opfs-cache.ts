/**
 * W3C Standard OPFS (Origin Private File System) Kalıcı Rapor Önbelleği
 *
 * İndirilen Apache Arrow rapor akışlarını kullanıcının yerel diskinde (NVMe/SSD)
 * saklar. F5, sekme kapanması veya tarayıcı yeniden başlatılsa bile dosya yerel
 * diskte korunur; sunucuya tekrar gitmeden 0ms/SSD hızında açılır.
 */

const OPFS_REPORTS_DIR = "sims_arrow_reports"
export const OPFS_PARQUET_DIR = "sims_parquet_reports"

class OpfsReportCache {
  private isSupported(): boolean {
    return (
      typeof navigator !== "undefined" &&
      typeof navigator.storage !== "undefined" &&
      typeof navigator.storage.getDirectory === "function"
    )
  }

  private async getDirectory(): Promise<FileSystemDirectoryHandle | null> {
    if (!this.isSupported()) return null
    try {
      const root = await navigator.storage.getDirectory()
      return await root.getDirectoryHandle(OPFS_REPORTS_DIR, { create: true })
    } catch (err) {
      console.warn("OPFS dizinine erişilemedi:", err)
      return null
    }
  }

  /**
   * Belirtilen jobId'ye ait parquet rapor dizin handle'ını döner.
   */
  async getParquetDirectory(jobId: string, create = false): Promise<FileSystemDirectoryHandle | null> {
    if (!this.isSupported()) return null
    try {
      const root = await navigator.storage.getDirectory()
      const parquetRoot = await root.getDirectoryHandle(OPFS_PARQUET_DIR, { create: true })
      return await parquetRoot.getDirectoryHandle(jobId, { create })
    } catch (err) {
      if (create) {
        console.warn("OPFS parquet job dizinine erişilemedi:", err)
      }
      return null
    }
  }

  /**
   * Belirtilen jobId'ye ait tam ve geçerli Parquet önbelleğinin var olup olmadığını kontrol eder.
   * Yalnızca akış 100% tamamlanmışsa ('_complete' dosyası var) ve part boyutları geçerliyse true döner.
   * Yarım kalmış / bozulmuş akış partlarını tespit ederse temizler ve false döner.
   */
  async hasParquetParts(jobId: string): Promise<boolean> {
    try {
      const dir = await this.getParquetDirectory(jobId, false)
      if (!dir) return false

      // 1. _complete onay dosyasını ara
      let isCompleted = false
      try {
        const completeHandle = await dir.getFileHandle("_complete", { create: false })
        const file = await completeHandle.getFile()
        if (file.size > 0) isCompleted = true
      } catch {
        isCompleted = false
      }

      if (!isCompleted) {
        // İndirme yarım kalmış veya kesintiye uğramış; bozuk parçaları temizle
        await this.removeParquetParts(jobId).catch(() => {})
        return false
      }

      // 2. Parquet parçalarını tara; herhangi biri 100 byte'tan küçükse (bozuksa) temizle
      let validPartCount = 0
      for await (const [name, handle] of (dir as any).entries()) {
        if (handle.kind === "file" && name.endsWith(".parquet")) {
          const file = await (handle as FileSystemFileHandle).getFile()
          if (file.size < 100) {
            console.warn(
              `[OpfsReportCache] Bozuk parquet parçası bulundu (${name}, ${file.size} byte), önbellek temizleniyor: ${jobId}`
            )
            await this.removeParquetParts(jobId).catch(() => {})
            return false
          }
          validPartCount++
        }
      }

      return validPartCount > 0
    } catch {
      return false
    }
  }

  /**
   * Belirtilen jobId'ye ait geçerli (boyutu >= 100 byte) tüm Parquet part dosya adlarını sıralı döner.
   */
  async getParquetPartFiles(jobId: string): Promise<string[]> {
    try {
      const dir = await this.getParquetDirectory(jobId, false)
      if (!dir) return []
      const parts: string[] = []
      for await (const [name, handle] of (dir as any).entries()) {
        if (handle.kind === "file" && name.endsWith(".parquet")) {
          const file = await (handle as FileSystemFileHandle).getFile()
          if (file.size >= 100) {
            parts.push(name)
          }
        }
      }
      return parts.sort((a, b) => a.localeCompare(b))
    } catch {
      return []
    }
  }

  /**
   * Belirtilen jobId'ye ait tüm Parquet part dosyalarını ve dizinini siler (Rollback / Silme durumu).
   */
  async removeParquetParts(jobId: string): Promise<void> {
    if (!this.isSupported()) return
    try {
      const root = await navigator.storage.getDirectory()
      const parquetRoot = await root.getDirectoryHandle(OPFS_PARQUET_DIR, { create: false })
      await parquetRoot.removeEntry(jobId, { recursive: true }).catch(() => {})
    } catch {
      // Dizin yoksa sorun yok
    }
  }

  /**
   * OPFS diskindeki rapor dosyasını siler (Yenileme / Refresh durumunda).
   * Legacy kalıntıları ve multi-part parquet dizinleri temizlenir.
   */
  async remove(jobId: string): Promise<void> {
    const dir = await this.getDirectory()
    if (dir) {
      try {
        await dir.removeEntry(`${jobId}.arrow`).catch(() => {})
        await dir.removeEntry(`${jobId}.parquet`).catch(() => {})
      } catch {
        // Dosya zaten yoksa sorun yok
      }
    }
    await this.removeParquetParts(jobId).catch(() => {})
  }

  /**
   * Belirtilen jobId'ye ait OPFS dizinindeki tüm dosyaları (partlar, _complete vb.),
   * boyutlarını ve durumunu döner.
   */
  async getParquetJobDetail(jobId: string): Promise<OpfsJobParquetDetail> {
    const emptyResult: OpfsJobParquetDetail = {
      hasParts: false,
      isComplete: false,
      totalSizeBytes: 0,
      partCount: 0,
      files: [],
    }
    if (!this.isSupported()) return emptyResult

    try {
      const dir = await this.getParquetDirectory(jobId, false)
      if (!dir) return emptyResult

      let isComplete = false
      let totalSizeBytes = 0
      const files: OpfsParquetFileInfo[] = []

      for await (const [name, handle] of (dir as any).entries()) {
        if (handle.kind === "file") {
          const file = await (handle as FileSystemFileHandle).getFile()
          if (name === "_complete" && file.size > 0) {
            isComplete = true
          }
          files.push({
            name,
            sizeBytes: file.size,
            lastModified: file.lastModified,
          })
          totalSizeBytes += file.size
        }
      }

      files.sort((a, b) => a.name.localeCompare(b.name))
      const partCount = files.filter((f) => f.name.endsWith(".parquet")).length

      return {
        hasParts: partCount > 0,
        isComplete,
        totalSizeBytes,
        partCount,
        files,
      }
    } catch {
      return emptyResult
    }
  }

  /**
   * OPFS diskindeki tüm rapor önbelleğini temizler.
   */
  async clearAll(): Promise<void> {
    if (!this.isSupported()) return
    try {
      const root = await navigator.storage.getDirectory()
      await root.removeEntry(OPFS_REPORTS_DIR, { recursive: true }).catch(() => {})
      await root.removeEntry(OPFS_PARQUET_DIR, { recursive: true }).catch(() => {})
    } catch {
      // Ignore
    }
  }
}

export type OpfsParquetFileInfo = {
  name: string
  sizeBytes: number
  lastModified?: number
}

export type OpfsJobParquetDetail = {
  hasParts: boolean
  isComplete: boolean
  totalSizeBytes: number
  partCount: number
  files: OpfsParquetFileInfo[]
}

export const opfsReportCache = new OpfsReportCache()
