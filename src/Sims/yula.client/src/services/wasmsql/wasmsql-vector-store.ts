import { wasmSqlClient } from "./wasm-sql-client"
import { VECTOR_DIMENSION } from "@/lib/yula-embedding"
import { opfsVectorCache } from "@/services/opfs/opfs-vector-cache"
import { devInfo } from "@/lib/dev-log"
import {
  OPFS_CORPUS_VERSION_FILE,
  RAG_CORPUS_VERSION,
  VECTOR_TABLE_NAME,
  type RagVectorTier,
} from "./wasmsql-vector-types"

let activeStoreDimension: number | null = null

export function clearActiveStoreDimension(): void {
  activeStoreDimension = null
}

/** Devam eden aynı indeksleme işini paylaşır; bitince bayrağı set eder, hata halinde retry'a açar. */
export function dedupeSessionIndex(
  flagRef: { promise: Promise<number> | null },
  run: () => Promise<number>
): Promise<number> {
  if (!flagRef.promise) {
    flagRef.promise = run().catch((err) => {
      flagRef.promise = null
      throw err
    })
  }
  return flagRef.promise
}

/** DuckDB WASM üzerinde vektör RAG tablosunu istenen boyuta göre (örn: 384 veya 1536) hazırlar. */
export async function initVectorStore(dimension = VECTOR_DIMENSION): Promise<void> {
  if (activeStoreDimension === dimension) return

  try {
    if (activeStoreDimension !== null && activeStoreDimension !== dimension) {
      await wasmSqlClient.executeCustomSql(`DROP TABLE IF EXISTS ${VECTOR_TABLE_NAME};`)
    }

    const sql = `
      CREATE TABLE IF NOT EXISTS ${VECTOR_TABLE_NAME} (
        id VARCHAR PRIMARY KEY,
        scope VARCHAR,
        content VARCHAR,
        metadata JSON,
        embedding FLOAT[${dimension}],
        tier VARCHAR DEFAULT 'global',
        workspace VARCHAR,
        version INTEGER DEFAULT 1
      );
    `
    await wasmSqlClient.executeCustomSql(sql)
    // Eski şemadan migrasyon: katman kolonları yoksa ekle.
    try {
      const cols = await wasmSqlClient.executeCustomSql(
        `SELECT column_name FROM duckdb_columns() WHERE table_name = '${VECTOR_TABLE_NAME}';`
      )
      const names = new Set(
        (Array.isArray(cols) ? cols : []).map((r) =>
          String((r as Record<string, unknown>).column_name ?? "").toLowerCase()
        )
      )
      if (!names.has("tier")) {
        await wasmSqlClient.executeCustomSql(
          `ALTER TABLE ${VECTOR_TABLE_NAME} ADD COLUMN tier VARCHAR DEFAULT 'global';`
        )
      }
      if (!names.has("workspace")) {
        await wasmSqlClient.executeCustomSql(
          `ALTER TABLE ${VECTOR_TABLE_NAME} ADD COLUMN workspace VARCHAR;`
        )
      }
      if (!names.has("version")) {
        await wasmSqlClient.executeCustomSql(
          `ALTER TABLE ${VECTOR_TABLE_NAME} ADD COLUMN version INTEGER DEFAULT 1;`
        )
      }
    } catch {
      // PRAGMA/detay başarısızsa tablo yine kullanılabilir (kolonlar yok sayılır)
    }
    activeStoreDimension = dimension
    devInfo(`🤖 [WASM Vector Store] ${VECTOR_TABLE_NAME} ready (FLOAT[${dimension}]).`)
  } catch (err) {
    console.warn("[Vector Store] init error, recreating:", err)
    await wasmSqlClient.executeCustomSql(`DROP TABLE IF EXISTS ${VECTOR_TABLE_NAME};`).catch(() => {})
    await wasmSqlClient.executeCustomSql(`
      CREATE TABLE ${VECTOR_TABLE_NAME} (
        id VARCHAR PRIMARY KEY,
        scope VARCHAR,
        content VARCHAR,
        metadata JSON,
        embedding FLOAT[${dimension}],
        tier VARCHAR DEFAULT 'global',
        workspace VARCHAR,
        version INTEGER DEFAULT 1
      );
    `)
    activeStoreDimension = dimension
  }
}

/**
 * Korpus sürümünü OPFS'te saklar; sürüm değişmişse stale vektör önbelleğini
 * temizler ve true döner (indeksleyiciler tam reindex yapar).
 */
export async function ensureRagCorpusVersion(): Promise<boolean> {
  if (
    typeof navigator === "undefined" ||
    typeof navigator.storage?.getDirectory !== "function"
  ) {
    return false
  }
  try {
    const root = await navigator.storage.getDirectory()
    let current = 0
    try {
      const fh = await root.getFileHandle(OPFS_CORPUS_VERSION_FILE, { create: false })
      const text = await (await fh.getFile()).text()
      current = Number(text.trim()) || 0
    } catch {
      current = 0
    }
    if (current === RAG_CORPUS_VERSION) return false
    await opfsVectorCache.clear()
    await wasmSqlClient
      .executeCustomSql(`DROP TABLE IF EXISTS ${VECTOR_TABLE_NAME};`)
      .catch(() => {})
    activeStoreDimension = null
    const fh = await root.getFileHandle(OPFS_CORPUS_VERSION_FILE, { create: true })
    const w = await fh.createWritable()
    await w.write(String(RAG_CORPUS_VERSION))
    await w.close()
    devInfo(
      `🤖 [WASM Vector Indexer] Corpus v${current} → v${RAG_CORPUS_VERSION}: cache cleared, full reindex.`
    )
    return true
  } catch (err) {
    console.warn("[Vector Store] corpus version check failed:", err)
    return false
  }
}

export async function insertOrReplaceVector(item: {
  id: string
  scope: string
  content: string
  metadata: Record<string, unknown>
  embedding: number[]
  tier?: RagVectorTier
  workspace?: string
}): Promise<void> {
  const dim = item.embedding.length || VECTOR_DIMENSION
  await initVectorStore(dim)
  const vecLiteral = `[${item.embedding.join(",")}]::FLOAT[${dim}]`
  const cleanContent = item.content.replace(/'/g, "''")
  const cleanMeta = JSON.stringify(item.metadata).replace(/'/g, "''")
  const tier = item.tier ?? "global"
  const wsLiteral =
    typeof item.workspace === "string" && item.workspace
      ? `'${item.workspace.replace(/'/g, "''")}'`
      : "NULL"

  const sql = `
    INSERT OR REPLACE INTO ${VECTOR_TABLE_NAME} (id, scope, content, metadata, embedding, tier, workspace, version)
    VALUES ('${item.id}', '${item.scope}', '${cleanContent}', '${cleanMeta}', ${vecLiteral}, '${tier}', ${wsLiteral}, ${RAG_CORPUS_VERSION});
  `
  try {
    await wasmSqlClient.executeCustomSql(sql)
  } catch (err) {
    if (String(err).includes("does not exist") || String(err).includes("yula_rag_embeddings")) {
      activeStoreDimension = null
      await initVectorStore(dim)
      await wasmSqlClient.executeCustomSql(sql)
    } else {
      throw err
    }
  }
}
