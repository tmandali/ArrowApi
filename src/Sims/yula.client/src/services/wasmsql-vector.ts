/**
 * DuckDB WASM Vector Store Servisi — RAG & Vektör Arama Altyapısı.
 *
 * Rapor şemalarını, kriter alanlarını ve yetkili kolon açıklamalarını
 * all-minilm (384-dim) vektörleriyle DuckDB WASM `FLOAT[384]` sütununda saklar.
 * `array_cosine_distance` ile ~3 ms içinde semantik bağlam araması yürütür.
 */

import { wasmSqlClient } from "@/services/wasmsql"
import { getEmbedding, VECTOR_DIMENSION } from "@/lib/yula-embedding"
import { buildRagWhereClause } from "@/lib/rag-tier"
import type { RagSearchFilter, RagVectorTier } from "@/lib/rag-tier"
import {
  VECTOR_TABLE_NAME,
  type RagVectorItem,
  type ConversationIndexItem,
  RAG_CORPUS_VERSION,
} from "./wasmsql/wasmsql-vector-types"
import {
  initVectorStore,
  ensureRagCorpusVersion,
  clearActiveStoreDimension,
} from "./wasmsql/wasmsql-vector-store"
import {
  indexReportSchemas,
  indexWorkspaceRouter,
  indexWorkspaceMenus,
} from "./wasmsql/wasmsql-vector-indexer"
import {
  indexConversationHistory,
  removeConversationVectors,
  purgeOrphanConversationVectors,
} from "./wasmsql/wasmsql-vector-conversations"

export type { RagSearchFilter, RagVectorTier, RagVectorItem, ConversationIndexItem }
export {
  RAG_CORPUS_VERSION,
  initVectorStore,
  ensureRagCorpusVersion,
  indexReportSchemas,
  indexWorkspaceRouter,
  indexWorkspaceMenus,
  indexConversationHistory,
  removeConversationVectors,
  purgeOrphanConversationVectors,
}

/**
 * Mesafe eşikleri — dilsel kelime listesi YOK, yalnızca yapısal kural:
 * 1-2 kelimelik kısa sorgularda (örn. tek sözcüklik selamlaşma) en iyi eşleşme
 * bile zayıfsa kayıtlar bağlama eklenmez; uzun/doğal dil sorularında daha
 * hoşgörülü eşik uygulanır. Değerler env ile override edilebilir.
 */
const SHORT_QUERY_MAX_DISTANCE = Number(
  process.env.NEXT_PUBLIC_RAG_SHORT_MAX_DISTANCE ?? "0.35"
)
const DEFAULT_QUERY_MAX_DISTANCE = Number(
  process.env.NEXT_PUBLIC_RAG_MAX_DISTANCE ?? "0.75"
)

/** Sorguya uygulanacak mesafe eşiği (kosinüs mesafesi; küçük = güçlü eşleşme). */
function distanceCutoffFor(queryText: string): number {
  const words = queryText.trim().split(/\s+/).filter(Boolean).length
  const fallback = words <= 2 ? SHORT_QUERY_MAX_DISTANCE : DEFAULT_QUERY_MAX_DISTANCE
  const n = Number(fallback)
  return Number.isFinite(n) && n > 0 ? n : 0.75
}

/**
 * Kullanıcı sorusuna en yakın top-K semantik bağlamı DuckDB WASM `array_cosine_distance` ile arar.
 *
 * Mesafe eşiği dilsel değildir: sorgu 1-2 kelimelikse zayıf eşleşmeler
 * (kısa sorgu eşiği), uzun sorularda daha geniş eşik uygulanır; eşik
 * `NEXT_PUBLIC_RAG_SHORT_MAX_DISTANCE` / `NEXT_PUBLIC_RAG_MAX_DISTANCE`
 * env'leriyle override edilebilir. Üçüncü parametre olarak sayı verilirse
 * (legacy) doğrudan maxDistance sayılır.
 */
export async function searchVectorContext(
  queryText: string,
  limit = 3,
  filter?: RagSearchFilter | number
): Promise<RagVectorItem[]> {
  const trimmed = queryText.trim()
  if (!trimmed) return []
  const opts: RagSearchFilter =
    typeof filter === "number" ? { maxDistance: filter } : (filter ?? {})

  const startMs = performance.now()
  try {
    const queryVec = await getEmbedding(trimmed)
    const dim = queryVec.length || VECTOR_DIMENSION
    await initVectorStore(dim)
    const vecLiteral = `[${queryVec.join(",")}]::FLOAT[${dim}]`
    const whereClause = buildRagWhereClause(opts)

    const sql = `
      SELECT
        id,
        scope,
        content,
        metadata,
        tier,
        workspace,
        version,
        array_cosine_distance(embedding, ${vecLiteral}) AS distance
      FROM ${VECTOR_TABLE_NAME}
      ${whereClause}
      ORDER BY distance ASC
      LIMIT ${limit};
    `

    let rows: Record<string, unknown>[] = []
    try {
      const res = await wasmSqlClient.executeCustomSql(sql)
      if (Array.isArray(res)) rows = res
    } catch (err) {
      if (String(err).includes("does not exist") || String(err).includes("yula_rag_embeddings")) {
        clearActiveStoreDimension()
        return []
      }
      throw err
    }

    const results: RagVectorItem[] = rows.map((r) => ({
      id: String(r.id),
      scope: String(r.scope),
      content: String(r.content),
      metadata:
        typeof r.metadata === "string"
          ? JSON.parse(r.metadata)
          : (r.metadata as Record<string, unknown>),
      distance: typeof r.distance === "number" ? r.distance : Number(r.distance),
      tier: (r.tier as RagVectorTier | undefined) ?? "global",
      workspace: typeof r.workspace === "string" ? (r.workspace as string) : undefined,
      version: typeof r.version === "number" ? (r.version as number) : Number(r.version ?? 1),
    }))

    // Zayıf (ilişkisiz) eşleşmeleri düşür — dilsel kalıp yok, yalnız mesafe
    const cutoff = opts.maxDistance ?? distanceCutoffFor(trimmed)
    const filtered = results.filter(
      (r) =>
        typeof r.distance !== "number" ||
        !Number.isFinite(r.distance) ||
        r.distance <= cutoff
    )

    // Ajan ayrımı: kullanıcı katmanı (sohbet geçmişi) kayıtları yalnız
    // istenen ajana aittir. Etiketli çağrılarda uymayan kayıtlar düşer;
    // etiketsiz eski satırlar Yula (null) sayılır.
    const scoped =
      opts.agentId !== undefined
        ? filtered.filter((r) => {
            const meta = r.metadata as {
              type?: string
              agentId?: string | null
            } | null
            const isConversation =
              meta?.type === "conversation" ||
              (r.tier === "user" && r.scope === "chats")
            if (!isConversation) return true
            return (meta?.agentId ?? null) === (opts.agentId ?? null)
          })
        : filtered

    if (results.length > 0) {
      console.info(
        `%c🤖 [Yula RAG Telemetry]%c query: "%c${trimmed}%c" · %c${scoped.length}/${results.length} vector context items (cutoff ${cutoff.toFixed(2)})%c (${Math.round(performance.now() - startMs)} ms)`,
        "color: #f59e0b; font-weight: bold;",
        "color: inherit;",
        "color: #3b82f6; font-style: italic;",
        "color: inherit;",
        "color: #10b981; font-weight: bold;",
        "color: #6b7280;",
        scoped
      )
    }

    return scoped
  } catch (err) {
    console.warn("[Vector Store] search error:", err)
    return []
  }
}

/**
 * Sohbet turu RAG bağlamı — tier-çeşitli seçim. Ham top-K saf distance
 * sıralamasında near-duplicate sohbet geçmişi rapor yönlendirme
 * kayıtlarını dışlayabiliyordu (limit 3'ün tamamı conversation oluyordu).
 * Geniş aday havuzundan katman kotasıyla seçer: önce report_router,
 * sonra diğer workspace/global kayıtlar, en fazla 1 konuşma dolgusu.
 */
export async function searchChatRagContext(
  queryText: string,
  limit = 3,
  filter?: RagSearchFilter
): Promise<RagVectorItem[]> {
  const pool = await searchVectorContext(
    queryText,
    Math.max(limit, 10),
    filter ?? {}
  )
  if (pool.length === 0) return []
  const isConversation = (r: RagVectorItem) => {
    const meta = r.metadata as { type?: string } | null
    return (
      meta?.type === "conversation" || (r.tier === "user" && r.scope === "chats")
    )
  }
  const isRouter = (r: RagVectorItem) =>
    (r.metadata as { type?: string } | null)?.type === "report_router"
  const routers = pool.filter(isRouter)
  const others = pool.filter((r) => !isRouter(r) && !isConversation(r))
  const convos = pool.filter(isConversation)
  const out: RagVectorItem[] = []
  for (const r of [...routers, ...others, ...convos.slice(0, 1)]) {
    if (out.length >= limit) break
    if (!out.some((o) => o.id === r.id)) out.push(r)
  }
  return out
}
