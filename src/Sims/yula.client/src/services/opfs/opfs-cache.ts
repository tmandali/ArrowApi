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
   * Belirtilen jobId'ye ait çok parçalı Parquet dosyalarının var olup olmadığını kontrol eder.
   */
  async hasParquetParts(jobId: string): Promise<boolean> {
    try {
      const dir = await this.getParquetDirectory(jobId, false)
      if (!dir) return false
      for await (const [name, handle] of (dir as any).entries()) {
        if (handle.kind === "file" && name.endsWith(".parquet")) {
          const file = await (handle as FileSystemFileHandle).getFile()
          if (file.size > 0) return true
        }
      }
      return false
    } catch {
      return false
    }
  }

  /**
   * Belirtilen jobId'ye ait tüm Parquet part dosya adlarını sıralı döner.
   */
  async getParquetPartFiles(jobId: string): Promise<string[]> {
    try {
      const dir = await this.getParquetDirectory(jobId, false)
      if (!dir) return []
      const parts: string[] = []
      for await (const [name, handle] of (dir as any).entries()) {
        if (handle.kind === "file" && name.endsWith(".parquet")) {
          parts.push(name)
        }
      }
      return parts.sort((a, b) => a.localeCompare(b))
    } catch {
      return []
    }
  }

  /**
   * OPFS diskine yeni bir parquet parçası yazar.
   */
  async writeParquetPart(jobId: string, partIndex: number, data: Uint8Array): Promise<string> {
    const dir = await this.getParquetDirectory(jobId, true)
    if (!dir) throw new Error(`OPFS parquet dizini oluşturulamadı: ${jobId}`)
    const fileName = `sims_part_${String(partIndex).padStart(4, "0")}.parquet`
    const fileHandle = await dir.getFileHandle(fileName, { create: true })
    const writable = await fileHandle.createWritable()
    try {
      await writable.write(data as unknown as BufferSource)
      await writable.close()
      return fileName
    } catch (err) {
      try {
        await writable.abort()
      } catch {
        // ignore
      }
      throw err
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
   * Legacy `.parquet` kalıntıları ve multi-part parquet dizinleri de temizlenir.
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

export const opfsReportCache = new OpfsReportCache()
