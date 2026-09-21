import { wasmSqlClient } from "./wasm-sql-client"
import { getEmbeddings, VECTOR_DIMENSION } from "@/lib/yula-embedding"
import { opfsVectorCache } from "@/services/opfs/opfs-vector-cache"
import { devInfo } from "@/lib/dev-log"
import {
  VECTOR_TABLE_NAME,
  type ConversationIndexItem,
} from "./wasmsql-vector-types"
import {
  initVectorStore,
  insertOrReplaceVector,
} from "./wasmsql-vector-store"

const conversationIndexedIds = new Set<string>()
let conversationIndexInFlight: Promise<number> | null = null

/**
 * Sohbet geçmişini RAG vektör store'a indeksler (artımlı + in-flight dedup'lı).
 * Daha önce indekslenmiş konuşmalar atlanır; sürerken gelen çağrılar iş bitiminde
 * zincirlenir. Böylece ana sayfa araması menülerle birlikte geçmişi de semantik bulur.
 */
export function indexConversationHistory(items: ConversationIndexItem[]): Promise<number> {
  const pending = items.filter(
    (i) => i.id && i.snippet.trim() && !conversationIndexedIds.has(i.id)
  )
  if (pending.length === 0) return Promise.resolve(0)
  if (conversationIndexInFlight) {
    return conversationIndexInFlight.then(() => indexConversationHistory(items))
  }

  conversationIndexInFlight = (async () => {
    try {
      await initVectorStore()
      const cachedEmbeddings = await opfsVectorCache.getAll()
      const duckDbExistingIds = new Set<string>()
      try {
        const rows = await wasmSqlClient.executeCustomSql(
          `SELECT id FROM ${VECTOR_TABLE_NAME} WHERE scope = 'chats';`
        )
        for (const r of rows) {
          if (r.id) duckDbExistingIds.add(String(r.id))
        }
      } catch {
        // ignore
      }

      const missingFromCache = pending.filter((p) => !cachedEmbeddings.has(`conv_${p.id}`))
      for (const p of pending) {
        if (cachedEmbeddings.has(`conv_${p.id}`)) {
          conversationIndexedIds.add(p.id)
        }
      }

      if (missingFromCache.length > 0) {
        const texts = missingFromCache.map((p) => `Sohbet: ${p.title}. ${p.snippet}`.trim())
        const newVectors = await getEmbeddings(texts)
        const entriesToSave: { id: string; embedding: number[] }[] = []
        for (let i = 0; i < missingFromCache.length; i++) {
          const it = missingFromCache[i]
          const vec = newVectors[i] ?? new Array(VECTOR_DIMENSION).fill(0)
          cachedEmbeddings.set(`conv_${it.id}`, vec)
          entriesToSave.push({ id: `conv_${it.id}`, embedding: vec })
        }
        await opfsVectorCache.setMany(entriesToSave)
        devInfo(
          `🤖 [WASM Vector Indexer] ${missingFromCache.length} new conversations generated and saved to OPFS.`
        )
      } else {
        devInfo(
          `🤖 [WASM Vector Indexer] All ${pending.length} conversations loaded from persistent OPFS cache (0 token cost).`
        )
      }

      const missingFromDuckDb = pending.filter((p) => !duckDbExistingIds.has(`conv_${p.id}`))
      for (const it of missingFromDuckDb) {
        const vec = cachedEmbeddings.get(`conv_${it.id}`) ?? new Array(VECTOR_DIMENSION).fill(0)
        await insertOrReplaceVector({
          id: `conv_${it.id}`,
          scope: "chats",
          content: `Sohbet: ${it.title}. ${it.snippet}`.trim(),
          metadata: {
            type: "conversation",
            title: it.title,
            pathname: it.pathname,
            jobId: it.jobId,
            conversationId: it.id,
            agentId: it.agentId ?? null,
          },
          // Kullanıcı katmanı: cihaz başına tek kullanıcı varsayımı; çok kullanıcılı
          // cihazda id öneki (user:<id>) gerekir — sonraki adım.
          tier: "user",
          embedding: vec,
        })
        conversationIndexedIds.add(it.id)
      }
      return pending.length
    } finally {
      conversationIndexInFlight = null
    }
  })()
  return conversationIndexInFlight
}

/**
 * Silinen sohbetlerin hayalet vektörlerini düşürür (oturum tablosu +
 * OPFS embedding önbelleği + oturum-içi indeks seti). Sohbet store'undan
 * silme, vektör katmanına yansımıyordu — silinmiş konuşmalar RAG
 * top-K'yu doldurup rapor yönlendirme kayıtlarını dışlıyordu.
 *
 * Silme DOĞRULAMALIDIR: DELETE sonrası satırlar okunur, kalan varsa store
 * yeniden hazırlanıp bir kez daha denenir; hâlâ kalıyorsa hata fırlatılır
 * (çağıran sessize gömmek yerine loglar). Tablo hiç yoksa silinecek bir
 * şey yoktur — başarı sayılır.
 */
export async function removeConversationVectors(ids: string[]): Promise<void> {
  const targets = ids.filter(Boolean)
  if (targets.length === 0) return
  for (const id of targets) conversationIndexedIds.delete(id)
  const vecIds = targets.map((id) => `conv_${id}`)
  try {
    await opfsVectorCache.remove(vecIds)
  } catch (err) {
    console.warn("[Vector Store] OPFS vektör silme başarısız:", err)
  }
  const list = vecIds.map((id) => `'${id.replace(/'/g, "''")}'`).join(", ")
  const deleteSql = `DELETE FROM ${VECTOR_TABLE_NAME} WHERE id IN (${list});`
  const countSql = `SELECT id FROM ${VECTOR_TABLE_NAME} WHERE id IN (${list});`
  const isMissingTable = (err: unknown) =>
    String(err).includes("does not exist") ||
    String(err).includes("yula_rag_embeddings")
  try {
    await wasmSqlClient.executeCustomSql(deleteSql)
  } catch (err) {
    if (isMissingTable(err)) return
    throw err
  }
  // Doğrulama: satır kaldıysa bir kez daha dene (WASM yarışına karşı).
  let remaining: string[] = []
  try {
    const rows = await wasmSqlClient.executeCustomSql(countSql)
    remaining = (Array.isArray(rows) ? rows : []).map((r) =>
      String((r as Record<string, unknown>).id ?? "")
    )
  } catch (err) {
    if (isMissingTable(err)) return
    throw err
  }
  if (remaining.length > 0) {
    await initVectorStore()
    try {
      await wasmSqlClient.executeCustomSql(deleteSql)
      const rows = await wasmSqlClient.executeCustomSql(countSql)
      remaining = (Array.isArray(rows) ? rows : []).map((r) =>
        String((r as Record<string, unknown>).id ?? "")
      )
    } catch (err) {
      if (!isMissingTable(err)) throw err
      return
    }
  }
  if (remaining.length > 0) {
    throw new Error(
      `Vektör silme doğrulanamadı, kalan satırlar: ${remaining.join(", ")}`
    )
  }
}

/**
 * Tabloda kalıp store'da olmayan sohbet vektörlerini temizler.
 * Silinen id'lerin listesini döndürür (spike teşhisi + tek seferlik tamir).
 */
export async function purgeOrphanConversationVectors(
  existingIds: string[]
): Promise<string[]> {
  const keep = new Set(existingIds)
  let rows: Record<string, unknown>[] = []
  try {
    const res = await wasmSqlClient.executeCustomSql(
      `SELECT id FROM ${VECTOR_TABLE_NAME} WHERE scope = 'chats';`
    )
    if (Array.isArray(res)) rows = res
  } catch {
    return []
  }
  const orphans = rows
    .map((r) => String(r.id ?? ""))
    .filter((id) => id.startsWith("conv_") && !keep.has(id.slice(5)))
  if (orphans.length > 0) {
    await removeConversationVectors(orphans.map((o) => o.slice(5)))
  }
  return orphans
}
