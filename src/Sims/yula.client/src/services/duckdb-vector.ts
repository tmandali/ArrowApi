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
import { STOCK_WORKSPACE_MENU_ITEMS } from "@/features/stock/lib/stock-menu-registry";

export interface RagVectorItem {
  id: string;
  scope: string;
  content: string;
  metadata: Record<string, unknown>;
  distance?: number;
}

let activeStoreDimension: number | null = null;

/** DuckDB WASM üzerinde vektör RAG tablosunu istenen boyuta göre (örn: 384 veya 1536) hazırlar. */
export async function initVectorStore(dimension = VECTOR_DIMENSION): Promise<void> {
  if (activeStoreDimension === dimension) return;
  try {
    // Eğer mevcut tablo farklı boyuttaysa düşürüp yeni boyutla kur
    if (activeStoreDimension !== null && activeStoreDimension !== dimension) {
      await duckDbClient.executeCustomSql("DROP TABLE IF EXISTS yula_rag_embeddings;");
    }

    const sql = `
      CREATE TABLE IF NOT EXISTS yula_rag_embeddings (
        id VARCHAR PRIMARY KEY,
        scope VARCHAR,
        content VARCHAR,
        metadata JSON,
        embedding FLOAT[${dimension}]
      );
    `;
    await duckDbClient.executeCustomSql(sql);
    activeStoreDimension = dimension;
    console.info(`🤖 [DuckDB WASM Vector Store] yula_rag_embeddings table ready (FLOAT[${dimension}]).`);
  } catch {
    // Tablo şema uyuşmazlığı varsa (örn: eski 384 vs 1536) tabloyu sıfırla
    try {
      await duckDbClient.executeCustomSql("DROP TABLE IF EXISTS yula_rag_embeddings;");
      const fallbackSql = `
        CREATE TABLE yula_rag_embeddings (
          id VARCHAR PRIMARY KEY,
          scope VARCHAR,
          content VARCHAR,
          metadata JSON,
          embedding FLOAT[${dimension}]
        );
      `;
      await duckDbClient.executeCustomSql(fallbackSql);
      activeStoreDimension = dimension;
      console.info(`🤖 [DuckDB WASM Vector Store] Recreated yula_rag_embeddings (FLOAT[${dimension}]).`);
    } catch (recreateErr) {
      console.warn("[DuckDB Vector Store] init error:", recreateErr);
    }
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

  // 5) Workspace Menü ve Modül Öğelerinin Vektör İndeksine Eklenmesi
  const menuCount = await indexWorkspaceMenus();
  indexedCount += menuCount;

  console.info(`🤖 [DuckDB WASM Vector Indexer] ${indexedCount} total vector items indexed into DuckDB WASM.`);
  return indexedCount;
}

/** Workspace menü öğelerini (Stock vb.) DuckDB WASM RAG tablosuna vektörleştirip kaydeder. */
export async function indexWorkspaceMenus(): Promise<number> {
  await initVectorStore();
  let count = 0;

  for (const item of STOCK_WORKSPACE_MENU_ITEMS) {
    const content = `Modül Menü Öğesi: ${item.title} (${item.titleTr}). Kategori: ${item.category}. Workspace: ${item.workspace}. Açıklama: ${item.description}. Anahtar Kelimeler: ${item.keywords.join(", ")}.`;
    const vec = await getEmbedding(content);

    await insertOrReplaceVector({
      id: `menu_${item.workspace}_${item.id}`,
      scope: item.workspace,
      content,
      metadata: {
        type: "menu_item",
        title: item.title,
        titleTr: item.titleTr,
        url: item.url,
        category: item.category,
        workspace: item.workspace,
        keywords: item.keywords,
      },
      embedding: vec,
    });
    count++;
  }

  console.info(`🤖 [DuckDB WASM Vector Indexer] ${count} workspace menu items indexed into RAG store.`);
  return count;
}

async function insertOrReplaceVector(item: {
  id: string;
  scope: string;
  content: string;
  metadata: Record<string, unknown>;
  embedding: number[];
}): Promise<void> {
  const dim = item.embedding.length || VECTOR_DIMENSION;
  await initVectorStore(dim);
  const vecLiteral = `[${item.embedding.join(",")}]::FLOAT[${dim}]`;
  const cleanContent = item.content.replace(/'/g, "''");
  const cleanMeta = JSON.stringify(item.metadata).replace(/'/g, "''");

  const sql = `
    INSERT OR REPLACE INTO yula_rag_embeddings (id, scope, content, metadata, embedding)
    VALUES ('${item.id}', '${item.scope}', '${cleanContent}', '${cleanMeta}', ${vecLiteral});
  `;
  await duckDbClient.executeCustomSql(sql);
}

/**
 * Mesafe eşikleri — dilsel kelime listesi YOK, yalnızca yapısal kural:
 * 1-2 kelimelik kısa sorgularda (örn. tek sözcüklik selamlaşma) en iyi eşleşme
 * bile zayıfsa kayıtlar bağlama eklenmez; uzun/doğal dil sorularında daha
 * hoşgörülü eşik uygulanır. Değerler env ile override edilebilir.
 */
const SHORT_QUERY_MAX_DISTANCE = Number(
  process.env.NEXT_PUBLIC_RAG_SHORT_MAX_DISTANCE ?? "0.35",
);
const DEFAULT_QUERY_MAX_DISTANCE = Number(
  process.env.NEXT_PUBLIC_RAG_MAX_DISTANCE ?? "0.75",
);

/** Sorguya uygulanacak mesafe eşiği (kosinüs mesafesi; küçük = güçlü eşleşme). */
function distanceCutoffFor(queryText: string): number {
  const words = queryText.trim().split(/\s+/).filter(Boolean).length;
  const fallback = words <= 2 ? SHORT_QUERY_MAX_DISTANCE : DEFAULT_QUERY_MAX_DISTANCE;
  const n = Number(fallback);
  return Number.isFinite(n) && n > 0 ? n : 0.75;
}

/**
 * Kullanıcı sorusuna en yakın top-K semantik bağlamı DuckDB WASM `array_cosine_distance` ile arar.
 *
 * Mesafe eşiği dilsel değildir: sorgu 1-2 kelimelikse zayıf eşleşmeler
 * (kısa sorgu eşiği), uzun sorularda daha geniş eşik uygulanır; eşik
 * `NEXT_PUBLIC_RAG_SHORT_MAX_DISTANCE` / `NEXT_PUBLIC_RAG_MAX_DISTANCE`
 * env'leriyle override edilebilir. İsteğe bağlı `maxDistance` parametresi
 * verildiğinde türetim yerine doğrudan o değer kullanılır.
 */
export async function searchVectorContext(
  queryText: string,
  limit = 3,
  maxDistance?: number,
): Promise<RagVectorItem[]> {
  const trimmed = queryText.trim();
  if (!trimmed) return [];

  const startMs = performance.now();
  try {
    const queryVec = await getEmbedding(trimmed);
    const dim = queryVec.length || VECTOR_DIMENSION;
    await initVectorStore(dim);
    const vecLiteral = `[${queryVec.join(",")}]::FLOAT[${dim}]`;

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

    // Zayıf (ilişkisiz) eşleşmeleri düşür — dilsel kalıp yok, yalnız mesafe
    const cutoff = maxDistance ?? distanceCutoffFor(trimmed);
    const filtered = results.filter(
      (r) =>
        typeof r.distance !== "number" ||
        !Number.isFinite(r.distance) ||
        r.distance <= cutoff,
    );

    if (results.length > 0) {
      console.info(
        `%c🤖 [Yula RAG Telemetry]%c query: "%c${trimmed}%c" · %c${filtered.length}/${results.length} vector context items (cutoff ${cutoff.toFixed(2)})%c (${Math.round(performance.now() - startMs)} ms)`,
        "color: #f59e0b; font-weight: bold;",
        "color: inherit;",
        "color: #3b82f6; font-style: italic;",
        "color: inherit;",
        "color: #10b981; font-weight: bold;",
        "color: #6b7280;",
        filtered,
      );
    }

    return filtered;
  } catch (err) {
    console.warn("[DuckDB Vector Store] search error:", err);
    return [];
  }
}
