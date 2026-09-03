/**
 * W3C Standard OPFS (Origin Private File System) Kalıcı Rapor Önbelleği
 *
 * İndirilen Apache Arrow rapor akışlarını kullanıcının yerel diskinde (NVMe/SSD)
 * saklar. F5, sekme kapanması veya tarayıcı yeniden başlatılsa bile dosya yerel
 * diskte korunur; sunucuya tekrar gitmeden 0ms/SSD hızında açılır.
 */

const OPFS_REPORTS_DIR = "sims_arrow_reports"

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
   * Belirtilen jobId'ye ait rapor dosyasının OPFS diskinde olup olmadığını kontrol eder.
   */
  async has(jobId: string): Promise<boolean> {
    const dir = await this.getDirectory()
    if (!dir) return false
    try {
      const fileHandle = await dir.getFileHandle(`${jobId}.arrow`)
      const file = await fileHandle.getFile()
      return file.size > 0
    } catch {
      return false
    }
  }

  /**
   * OPFS diskindeki rapor dosyasını ReadableStream olarak döner.
   */
  async getStream(jobId: string): Promise<ReadableStream<Uint8Array> | null> {
    const dir = await this.getDirectory()
    if (!dir) return null
    try {
      const fileHandle = await dir.getFileHandle(`${jobId}.arrow`)
      const file = await fileHandle.getFile()
      if (file.size === 0) return null
      return file.stream()
    } catch {
      return null
    }
  }

  /**
   * OPFS diskine yeni bir rapor dosyası yazmak için WritableStream açar.
   */
  async createWritable(jobId: string): Promise<FileSystemWritableFileStream | null> {
    const dir = await this.getDirectory()
    if (!dir) return null
    try {
      const fileHandle = await dir.getFileHandle(`${jobId}.arrow`, { create: true })
      return await fileHandle.createWritable()
    } catch (err) {
      console.warn("OPFS writable oluşturulamadı:", err)
      return null
    }
  }

  /**
   * OPFS diskindeki rapor dosyasını siler (Yenileme / Refresh durumunda).
   * Legacy `.parquet` kalıntıları da temizlenir.
   */
  async remove(jobId: string): Promise<void> {
    const dir = await this.getDirectory()
    if (!dir) return
    try {
      await dir.removeEntry(`${jobId}.arrow`).catch(() => {})
      await dir.removeEntry(`${jobId}.parquet`).catch(() => {})
    } catch {
      // Dosya zaten yoksa sorun yok
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
    } catch {
      // Ignore
    }
  }
}

export const opfsReportCache = new OpfsReportCache()
