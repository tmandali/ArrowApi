import type { RagSearchFilter, RagVectorTier } from "@/lib/rag-tier"

export type { RagSearchFilter, RagVectorTier }

export interface RagVectorItem {
  id: string
  scope: string
  content: string
  metadata: Record<string, unknown>
  distance?: number
  tier?: RagVectorTier
  workspace?: string
  version?: number
}

/** RAG vektör store'a yazılacak sohbet özeti. */
export interface ConversationIndexItem {
  id: string
  title: string
  pathname?: string
  jobId?: string
  /** Ayrı ajan oturumu ise ajan id'si; null/undefined = varsayılan Yula. */
  agentId?: string | null
  /** Sohbetin ilk kullanıcı mesajı (bağlam için, kırpılmış). */
  snippet: string
}

/**
 * Korpus sürümü: indekslenen metinler değiştiğinde artırılır. OPFS vektör
 * önbelleği id-bazlı ve kalıcı olduğu için sürüm değişiminde önbellek
 * temizlenip vektörler yeniden üretilir (stale embedding savunması).
 * v3: sohbet metadata'sına `agentId` etiketi (ajan-bazlı ayrım).
 */
export const RAG_CORPUS_VERSION = 3
export const OPFS_CORPUS_VERSION_FILE = "yula_rag_corpus_version.txt"
export const VECTOR_TABLE_NAME = "yula_rag_embeddings"
