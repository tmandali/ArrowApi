/**
 * W3C Standard OPFS (Origin Private File System) Kalıcı Vektör Önbelleği
 *
 * LLM API'sinden (OpenAI / Azure / Ollama) alınan 1536 boyutlu embedding vektörlerini
 * kullanıcının yerel diskinde OPFS içinde JSON olarak saklar.
 *
 * DuckDB WASM motoru ister sıfırlansın, ister sayfa yenilensin (F5/Ctrl+F5),
 * ister workspace değişsin; vektörler yerel diskten anında okunur ve
 * LLM API'sine 0 istek atılır (%100 token tasarrufu, 0ms bekleme süresi).
 */

const OPFS_VECTOR_CACHE_FILE = "yula_rag_vectors.json"

export class OpfsVectorCache {
  private memoryCache: Map<string, number[]> | null = null

  private isSupported(): boolean {
    return (
      typeof navigator !== "undefined" &&
      typeof navigator.storage !== "undefined" &&
      typeof navigator.storage.getDirectory === "function"
    )
  }

  async getAll(): Promise<Map<string, number[]>> {
    if (this.memoryCache) return this.memoryCache
    if (!this.isSupported()) {
      this.memoryCache = new Map()
      return this.memoryCache
    }

    try {
      const root = await navigator.storage.getDirectory()
      const fileHandle = await root.getFileHandle(OPFS_VECTOR_CACHE_FILE, { create: false })
      const file = await fileHandle.getFile()
      if (file.size === 0) {
        this.memoryCache = new Map()
        return this.memoryCache
      }
      const text = await file.text()
      const data = JSON.parse(text) as Record<string, number[]>
      this.memoryCache = new Map(Object.entries(data))
      return this.memoryCache
    } catch {
      this.memoryCache = new Map()
      return this.memoryCache
    }
  }

  async setMany(entries: { id: string; embedding: number[] }[]): Promise<void> {
    if (entries.length === 0) return
    const current = await this.getAll()
    for (const { id, embedding } of entries) {
      current.set(id, embedding)
    }

    if (!this.isSupported()) return

    try {
      const root = await navigator.storage.getDirectory()
      const fileHandle = await root.getFileHandle(OPFS_VECTOR_CACHE_FILE, { create: true })
      const writable = await fileHandle.createWritable()
      const obj = Object.fromEntries(current)
      await writable.write(JSON.stringify(obj))
      await writable.close()
    } catch (err) {
      console.warn("[OpfsVectorCache] Vektör önbelleği diske yazılamadı:", err)
    }
  }
}

export const opfsVectorCache = new OpfsVectorCache()
