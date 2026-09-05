/**
 * DuckDB WASM Vector Store Servisi — RAG & Vektör Arama Altyapısı.
 *
 * Rapor şemalarını, kriter alanlarını ve yetkili kolon açıklamalarını
 * all-minilm (384-dim) vektörleriyle DuckDB WASM `FLOAT[384]` sütununda saklar.
 * `array_cosine_distance` ile ~3 ms içinde semantik bağlam araması yürütür.
 */

import { duckDbClient } from "@/services/duckdb";
import { getEmbedding, getEmbeddings, VECTOR_DIMENSION } from "@/lib/yula-embedding";
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
let isPersistentStoreAvailable = false;
let vectorTableName = "yula_rag_embeddings";

/**
 * Oturum düzeyinde indeksleme dedup'ı: DuckDB WASM tablosu sayfa ömrü boyunca
 * yaşadığı için şema/menü indeksi bir kez kurulur. StrictMode çift-effect ve
 * eşzamanlı mount'larda (ChatInstance + StockPageForm) aynı anda ikinci bir
 * indeksleme turu başlamasın diye devam eden promise paylaşılır (in-flight
 * dedup); tamamlanınca bayrak set edilir, hata olursa retry'a izin verilir.
 */
/** Devam eden aynı indeksleme işini paylaşır; bitince bayrağı set eder, hata halinde retry'a açar. */
function dedupeSessionIndex(
  flagRef: { promise: Promise<number> | null },
  run: () => Promise<number>,
): Promise<number> {
  if (!flagRef.promise) {
    flagRef.promise = run()
      .catch((err) => {
        flagRef.promise = null;
        throw err;
      });
  }
  return flagRef.promise;
}

/** DuckDB WASM üzerinde vektör RAG tablosunu istenen boyuta göre (örn: 384 veya 1536) hazırlar. */
export async function initVectorStore(dimension = VECTOR_DIMENSION): Promise<void> {
  if (activeStoreDimension === dimension) return;

  // 1. embed_db kataloğunun bağlı olup olmadığını kontrol et
  try {
    const catalogsRes = await duckDbClient.executeCustomSql(
      "SELECT catalog_name FROM information_schema.schemata WHERE catalog_name = 'embed_db' LIMIT 1;"
    );
    if (catalogsRes.length > 0) {
      isPersistentStoreAvailable = true;
      vectorTableName = "embed_db.yula_rag_embeddings";
    } else {
      isPersistentStoreAvailable = false;
      vectorTableName = "yula_rag_embeddings";
    }
  } catch {
    isPersistentStoreAvailable = false;
    vectorTableName = "yula_rag_embeddings";
  }

  try {
    // Eğer mevcut tablo farklı boyuttaysa düşürüp yeni boyutla kur
    if (activeStoreDimension !== null && activeStoreDimension !== dimension) {
      await duckDbClient.executeCustomSql(`DROP TABLE IF EXISTS ${vectorTableName};`);
    }

    const sql = `
      CREATE TABLE IF NOT EXISTS ${vectorTableName} (
        id VARCHAR PRIMARY KEY,
        scope VARCHAR,
        content VARCHAR,
        metadata JSON,
        embedding FLOAT[${dimension}]
      );
    `;
    await duckDbClient.executeCustomSql(sql);

    // Ana memory kataloğunda kolay erişim için alias view oluştur
    if (isPersistentStoreAvailable) {
      await duckDbClient
        .executeCustomSql(
          `CREATE OR REPLACE VIEW yula_rag_embeddings AS SELECT * FROM ${vectorTableName};`
        )
        .catch(() => {});
    }

    activeStoreDimension = dimension;
    console.info(`🤖 [WASM Vector Store] ${vectorTableName} ready (FLOAT[${dimension}]).`);
  } catch {
    // Tablo şema uyuşmazlığı varsa tabloyu sıfırla
    try {
      await duckDbClient.executeCustomSql(`DROP TABLE IF EXISTS ${vectorTableName};`);
      const fallbackSql = `
        CREATE TABLE ${vectorTableName} (
          id VARCHAR PRIMARY KEY,
          scope VARCHAR,
          content VARCHAR,
          metadata JSON,
          embedding FLOAT[${dimension}]
        );
      `;
      await duckDbClient.executeCustomSql(fallbackSql);
      if (isPersistentStoreAvailable) {
        await duckDbClient
          .executeCustomSql(
            `CREATE OR REPLACE VIEW yula_rag_embeddings AS SELECT * FROM ${vectorTableName};`
          )
          .catch(() => {});
      }
      activeStoreDimension = dimension;
      console.info(`🤖 [WASM Vector Store] Recreated ${vectorTableName} (FLOAT[${dimension}]).`);
    } catch (recreateErr) {
      console.warn("[Vector Store] init error, falling back to memory:", recreateErr);
      vectorTableName = "yula_rag_embeddings";
      isPersistentStoreAvailable = false;
      await duckDbClient
        .executeCustomSql(`
          CREATE TABLE IF NOT EXISTS yula_rag_embeddings (
            id VARCHAR PRIMARY KEY,
            scope VARCHAR,
            content VARCHAR,
            metadata JSON,
            embedding FLOAT[${dimension}]
          );
        `)
        .catch(() => {});
      activeStoreDimension = dimension;
    }
  }
}

const reportSchemaIndexRef: { promise: Promise<number> | null } = { promise: null };
const workspaceMenuIndexRef: { promise: Promise<number> | null } = { promise: null };

/** Sistemdeki tüm rapor şemalarını ve kolon tanımlarını vektörleştirip indeksler (oturum başına bir kez, toplu istekle). */
export function indexReportSchemas(): Promise<number> {
  return dedupeSessionIndex(reportSchemaIndexRef, doIndexReportSchemas);
}

async function doIndexReportSchemas(): Promise<number> {
  await initVectorStore();

  type PendingVector = {
    id: string;
    scope: string;
    content: string;
    metadata: Record<string, unknown>;
  };
  const pending: PendingVector[] = [];

  for (const report of DEMO_REPORTS) {
    const scope = report.scope;
    const title = report.title;

    // 1) Rapor üst seviye özeti
    const summaryText = `Rapor: ${title} (${scope}, workspace: ${report.workspace}). Kapsam ve tanım: Stok bakiyeleri, miktar, tutar ve depo detayları.`;
    pending.push({
      id: `report_${scope}_summary`,
      scope,
      content: summaryText,
      metadata: { type: "report_summary", title, scope, workspace: report.workspace },
    });

    // 2) Kriter alanları özeti
    const criteriaEntries = Object.entries(report.criteriaSchema.properties);
    for (const [key, prop] of criteriaEntries) {
      const fieldTitle = prop.title ?? key;
      const optionsStr = prop.enum ? `, seçenekler: ${prop.enum.join(" | ")}` : "";
      const text = `Rapor Kriter Alanı: ${key} (${fieldTitle}). Rapor: ${title} (${scope}, workspace: ${report.workspace})${optionsStr}.`;
      pending.push({
        id: `report_${scope}_criteria_${key}`,
        scope,
        content: text,
        metadata: { type: "criteria_field", key, title: fieldTitle, scope, workspace: report.workspace },
      });
    }

    // 3) Kolon açıklamaları (x-ai.columnDescriptions)
    const colDescs = (report.fullSchema as unknown as { "x-ai"?: { columnDescriptions?: Record<string, string> } })?.["x-ai"]?.columnDescriptions ?? {};
    for (const [col, desc] of Object.entries(colDescs)) {
      const text = `Kolon Tanımı: ${col} - ${desc}. Rapor: ${title} (${scope}, workspace: ${report.workspace}).`;
      pending.push({
        id: `report_${scope}_col_${col}`,
        scope,
        content: text,
        metadata: { type: "column_description", column: col, scope, workspace: report.workspace },
      });
    }
  }

  // 4) Sistem ve Kişisel Rotaların RAG İndeksine Eklenmesi (/my ve /system)
  pending.push(
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
  );

  // 1. Önce veritabanında zaten kayıtlı olan ID'leri kontrol et (F5 sonrası 0 token harca)
  const existingIds = new Set<string>();
  try {
    const existingRows = await duckDbClient.executeCustomSql(`SELECT id FROM ${vectorTableName};`);
    for (const r of existingRows) {
      if (r.id) existingIds.add(String(r.id));
    }
  } catch {
    // ignore
  }

  const missing = pending.filter((p) => !existingIds.has(p.id));

  if (missing.length === 0) {
    console.info(
      `🤖 [DuckDB WASM Vector Indexer] All ${pending.length} report schemas already exist in persistent OPFS store. Skipping embedding generation (0 token cost).`
    );
  } else {
    // Yalnızca eksik öğeler için embedding isteği yap
    const vectors = await getEmbeddings(missing.map((p) => p.content));
    for (let i = 0; i < missing.length; i++) {
      await insertOrReplaceVector({ ...missing[i], embedding: vectors[i] ?? new Array(VECTOR_DIMENSION).fill(0) });
    }
    if (isPersistentStoreAvailable) {
      await duckDbClient.executeCustomSql("CHECKPOINT embed_db;").catch(() => {});
    }
    console.info(
      `🤖 [DuckDB WASM Vector Indexer] ${missing.length} new report schemas indexed into ${vectorTableName}.`
    );
  }

  // 5) Workspace Menü ve Modül Öğelerinin Vektör İndeksine Eklenmesi
  const menuCount = await indexWorkspaceMenus();
  const total = pending.length + menuCount;

  console.info(`🤖 [DuckDB WASM Vector Indexer] ${total} total vector items ready in DuckDB WASM.`);
  return total;
}

/** Workspace menü öğelerini (Stock vb.) DuckDB WASM RAG tablosuna vektörleştirip kaydeder (oturum başına bir kez, toplu istekle). */
export function indexWorkspaceMenus(): Promise<number> {
  return dedupeSessionIndex(workspaceMenuIndexRef, doIndexWorkspaceMenus);
}

async function doIndexWorkspaceMenus(): Promise<number> {
  await initVectorStore();

  const pending = STOCK_WORKSPACE_MENU_ITEMS.map((item) => ({
    id: `menu_${item.workspace}_${item.id}`,
    scope: item.workspace,
    content: `Modül Menü Öğesi: ${item.title} (${item.titleTr}). Kategori: ${item.category}. Workspace: ${item.workspace}. Açıklama: ${item.description}. Anahtar Kelimeler: ${item.keywords.join(", ")}.`,
    metadata: {
      type: "menu_item",
      title: item.title,
      titleTr: item.titleTr,
      url: item.url,
      category: item.category,
      workspace: item.workspace,
      keywords: item.keywords,
    },
  }));

  // 1. Önce veritabanında zaten kayıtlı olan ID'leri kontrol et
  const existingIds = new Set<string>();
  try {
    const existingRows = await duckDbClient.executeCustomSql(`SELECT id FROM ${vectorTableName};`);
    for (const r of existingRows) {
      if (r.id) existingIds.add(String(r.id));
    }
  } catch {
    // ignore
  }

  const missing = pending.filter((p) => !existingIds.has(p.id));

  if (missing.length === 0) {
    console.info(
      `🤖 [WASM Vector Indexer] All ${pending.length} workspace menu items already exist in persistent OPFS store. Skipping embedding generation (0 token cost).`
    );
    return pending.length;
  }

  const vectors = await getEmbeddings(missing.map((p) => p.content));
  for (let i = 0; i < missing.length; i++) {
    await insertOrReplaceVector({ ...missing[i], embedding: vectors[i] ?? new Array(VECTOR_DIMENSION).fill(0) });
  }
  if (isPersistentStoreAvailable) {
    await duckDbClient.executeCustomSql("CHECKPOINT embed_db;").catch(() => {});
  }

  console.info(`🤖 [WASM Vector Indexer] ${missing.length} workspace menu items indexed into ${vectorTableName}.`);
  return pending.length;
}

/** RAG vektör store'a yazılacak sohbet özeti. */
export interface ConversationIndexItem {
  id: string;
  title: string;
  pathname?: string;
  jobId?: string;
  /** Sohbetin ilk kullanıcı mesajı (bağlam için, kırpılmış). */
  snippet: string;
}

const conversationIndexedIds = new Set<string>();
let conversationIndexInFlight: Promise<number> | null = null;

/**
 * Sohbet geçmişini RAG vektör store'a indeksler (artımlı + in-flight dedup'lı).
 * Daha önce indekslenmiş konuşmalar atlanır; sürerken gelen çağrılar iş bitiminde
 * zincirlenir. Böylece ana sayfa araması menülerle birlikte geçmişi de semantik bulur.
 */
export function indexConversationHistory(items: ConversationIndexItem[]): Promise<number> {
  const pending = items.filter(
    (i) => i.id && i.snippet.trim() && !conversationIndexedIds.has(i.id),
  );
  if (pending.length === 0) return Promise.resolve(0);
  if (conversationIndexInFlight) {
    return conversationIndexInFlight.then(() => indexConversationHistory(items));
  }

  conversationIndexInFlight = (async () => {
    try {
      await initVectorStore();
      const texts = pending.map((p) => `Sohbet: ${p.title}. ${p.snippet}`.trim());
      const vectors = await getEmbeddings(texts);
      for (let i = 0; i < pending.length; i++) {
        const it = pending[i];
        await insertOrReplaceVector({
          id: `conv_${it.id}`,
          scope: "chats",
          content: texts[i],
          metadata: {
            type: "conversation",
            title: it.title,
            pathname: it.pathname,
            jobId: it.jobId,
            conversationId: it.id,
          },
          embedding: vectors[i] ?? new Array(VECTOR_DIMENSION).fill(0),
        });
        conversationIndexedIds.add(it.id);
      }
      if (isPersistentStoreAvailable) {
        await duckDbClient.executeCustomSql("CHECKPOINT embed_db;").catch(() => {});
      }
      console.info(`🤖 [WASM Vector Indexer] ${pending.length} conversations indexed into ${vectorTableName}.`);
      return pending.length;
    } finally {
      conversationIndexInFlight = null;
    }
  })();
  return conversationIndexInFlight;
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
    INSERT OR REPLACE INTO ${vectorTableName} (id, scope, content, metadata, embedding)
    VALUES ('${item.id}', '${item.scope}', '${cleanContent}', '${cleanMeta}', ${vecLiteral});
  `;
  try {
    await duckDbClient.executeCustomSql(sql);
  } catch (err) {
    if (String(err).includes("does not exist") || String(err).includes("yula_rag_embeddings")) {
      activeStoreDimension = null;
      await initVectorStore(dim);
      await duckDbClient.executeCustomSql(`
        INSERT OR REPLACE INTO ${vectorTableName} (id, scope, content, metadata, embedding)
        VALUES ('${item.id}', '${item.scope}', '${cleanContent}', '${cleanMeta}', ${vecLiteral});
      `);
    } else {
      throw err;
    }
  }
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
      FROM ${vectorTableName}
      ORDER BY distance ASC
      LIMIT ${limit};
    `;

    let rows: Record<string, unknown>[] = [];
    try {
      const res = await duckDbClient.executeCustomSql(sql);
      if (Array.isArray(res)) rows = res;
    } catch (err) {
      if (String(err).includes("does not exist") || String(err).includes("yula_rag_embeddings")) {
        activeStoreDimension = null;
        return [];
      }
      throw err;
    }

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
    console.warn("[Vector Store] search error:", err);
    return [];
  }
}
