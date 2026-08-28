/**
 * DuckDB WASM Vector Store Servisi — RAG & Vektör Arama Altyapısı.
 *
 * Rapor şemalarını, kriter alanlarını ve yetkili kolon açıklamalarını
 * all-minilm (384-dim) vektörleriyle DuckDB WASM `FLOAT[384]` sütununda saklar.
 * `array_cosine_distance` ile ~3 ms içinde semantik bağlam araması yürütür.
 */

import { duckDbClient } from "@/services/duckdb";
import { getEmbedding, VECTOR_DIMENSION } from "@/lib/yula-embedding";
import { REGISTERED_REPORTS as DEMO_REPORTS } from "@/features/reports/report-registry";

export interface RagVectorItem {
  id: string;
  scope: string;
  content: string;
  metadata: Record<string, unknown>;
  distance?: number;
}

let isStoreInitialized = false;

/** DuckDB WASM üzerinde vektör RAG tablosunu hazırlar. */
export async function initVectorStore(): Promise<void> {
  if (isStoreInitialized) return;
  try {
    const sql = `
      CREATE TABLE IF NOT EXISTS yula_rag_embeddings (
        id VARCHAR PRIMARY KEY,
        scope VARCHAR,
        content VARCHAR,
        metadata JSON,
        embedding FLOAT[${VECTOR_DIMENSION}]
      );
    `;
    await duckDbClient.executeCustomSql(sql);
    isStoreInitialized = true;
    console.info("🤖 [DuckDB WASM Vector Store] yula_rag_embeddings table ready (FLOAT[384]).");
  } catch (err) {
    console.warn("[DuckDB Vector Store] init error:", err);
  }
}

/** Sistemdeki tüm rapor şemalarını ve kolon tanımlarını vektörleştirip indeksler. */
export async function indexReportSchemas(): Promise<number> {
  await initVectorStore();
  let indexedCount = 0;

  for (const report of DEMO_REPORTS) {
    const scope = report.scope;
    const title = report.title;

    // 1) Rapor üst seviye özeti
    const summaryText = `Rapor: ${title} (${scope}, workspace: ${report.workspace}). Kapsam ve tanım: Stok bakiyeleri, miktar, tutar ve depo detayları.`;
    const summaryVec = await getEmbedding(summaryText);
    await insertOrReplaceVector({
      id: `report_${scope}_summary`,
      scope,
      content: summaryText,
      metadata: { type: "report_summary", title, scope, workspace: report.workspace },
      embedding: summaryVec,
    });
    indexedCount++;

    // 2) Kriter alanları özeti
    const criteriaEntries = Object.entries(report.criteriaSchema.properties);
    for (const [key, prop] of criteriaEntries) {
      const fieldTitle = prop.title ?? key;
      const optionsStr = prop.enum ? `, seçenekler: ${prop.enum.join(" | ")}` : "";
      const text = `Rapor Kriter Alanı: ${key} (${fieldTitle}). Rapor: ${title} (${scope}, workspace: ${report.workspace})${optionsStr}.`;
      const vec = await getEmbedding(text);
      await insertOrReplaceVector({
        id: `report_${scope}_criteria_${key}`,
        scope,
        content: text,
        metadata: { type: "criteria_field", key, title: fieldTitle, scope, workspace: report.workspace },
        embedding: vec,
      });
      indexedCount++;
    }

    // 3) Kolon açıklamaları (x-ai.columnDescriptions)
    const colDescs = (report.fullSchema as unknown as { "x-ai"?: { columnDescriptions?: Record<string, string> } })?.["x-ai"]?.columnDescriptions ?? {};
    for (const [col, desc] of Object.entries(colDescs)) {
      const text = `Kolon Tanımı: ${col} - ${desc}. Rapor: ${title} (${scope}, workspace: ${report.workspace}).`;
      const vec = await getEmbedding(text);
      await insertOrReplaceVector({
        id: `report_${scope}_col_${col}`,
        scope,
        content: text,
        metadata: { type: "column_description", column: col, scope, workspace: report.workspace },
        embedding: vec,
      });
      indexedCount++;
    }
  }

  // 4) Sistem ve Kişisel Rotaların RAG İndeksine Eklenmesi (/my ve /system)
  const systemKnowledge = [
    {
      id: "system_my_settings",
      scope: "my",
      content: "Kullanıcı Profili ve AI Ayarları (/my/settings): Giriş yapmış kullanıcının şifre, dil, saat dilimi, yerel Ollama/Gemini/Azure LLM seçimi, API key ve Yula sistem hafıza bilgileri (System Facts) burada yönetilir.",
      metadata: { type: "system_route", path: "/my/settings" },
    },
    {
      id: "system_admin_users",
      scope: "system",
      content: "Sistem Kullanıcı Dizin Kataloğu (/system/users): Şirket genelindeki tüm kayıtlı kullanıcılar, rolleri, erişim yetkileri ve aktif oturum durumları bu ekranda yönetilir.",
      metadata: { type: "system_route", path: "/system/users" },
    },
  ];

  for (const item of systemKnowledge) {
    const vec = await getEmbedding(item.content);
    await insertOrReplaceVector({
      ...item,
      embedding: vec,
    });
    indexedCount++;
  }

  console.info(`🤖 [DuckDB WASM Vector Indexer] ${indexedCount} vector items indexed into DuckDB WASM.`);
  return indexedCount;
}

async function insertOrReplaceVector(item: {
  id: string;
  scope: string;
  content: string;
  metadata: Record<string, unknown>;
  embedding: number[];
}): Promise<void> {
  const vecLiteral = `[${item.embedding.join(",")}]::FLOAT[${VECTOR_DIMENSION}]`;
  const cleanContent = item.content.replace(/'/g, "''");
  const cleanMeta = JSON.stringify(item.metadata).replace(/'/g, "''");

  const sql = `
    INSERT OR REPLACE INTO yula_rag_embeddings (id, scope, content, metadata, embedding)
    VALUES ('${item.id}', '${item.scope}', '${cleanContent}', '${cleanMeta}', ${vecLiteral});
  `;
  await duckDbClient.executeCustomSql(sql);
}

/**
 * Kullanıcı sorusuna en yakın top-K semantik bağlamı DuckDB WASM `array_cosine_distance` ile arar.
 */
export async function searchVectorContext(
  queryText: string,
  limit = 3,
): Promise<RagVectorItem[]> {
  await initVectorStore();
  const trimmed = queryText.trim();
  if (!trimmed) return [];

  const startMs = performance.now();
  try {
    const queryVec = await getEmbedding(trimmed);
    const vecLiteral = `[${queryVec.join(",")}]::FLOAT[${VECTOR_DIMENSION}]`;

    const sql = `
      SELECT 
        id,
        scope,
        content,
        metadata,
        array_cosine_distance(embedding, ${vecLiteral}) AS distance
      FROM yula_rag_embeddings
      ORDER BY distance ASC
      LIMIT ${limit};
    `;

    const rows = await duckDbClient.executeCustomSql(sql);
    if (!Array.isArray(rows)) return [];

    const results: RagVectorItem[] = rows.map((r) => ({
      id: String(r.id),
      scope: String(r.scope),
      content: String(r.content),
      metadata: typeof r.metadata === "string" ? JSON.parse(r.metadata) : (r.metadata as Record<string, unknown>),
      distance: typeof r.distance === "number" ? r.distance : Number(r.distance),
    }));

    if (results.length > 0) {
      console.info(
        `%c🤖 [Yula RAG Telemetry]%c query: "%c${trimmed}%c" · %c${results.length} vector context items retrieved%c (${Math.round(performance.now() - startMs)} ms)`,
        "color: #f59e0b; font-weight: bold;",
        "color: inherit;",
        "color: #3b82f6; font-style: italic;",
        "color: inherit;",
        "color: #10b981; font-weight: bold;",
        "color: #6b7280;",
        results,
      );
    }

    return results;
  } catch (err) {
    console.warn("[DuckDB Vector Store] search error:", err);
    return [];
  }
}
