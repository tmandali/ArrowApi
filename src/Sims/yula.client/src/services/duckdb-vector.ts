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

import { opfsVectorCache } from "@/services/opfs/opfs-vector-cache";

export interface RagVectorItem {
  id: string;
  scope: string;
  content: string;
  metadata: Record<string, unknown>;
  distance?: number;
}

let activeStoreDimension: number | null = null;
const VECTOR_TABLE_NAME = "yula_rag_embeddings";

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

  try {
    if (activeStoreDimension !== null && activeStoreDimension !== dimension) {
      await duckDbClient.executeCustomSql(`DROP TABLE IF EXISTS ${VECTOR_TABLE_NAME};`);
    }

    const sql = `
      CREATE TABLE IF NOT EXISTS ${VECTOR_TABLE_NAME} (
        id VARCHAR PRIMARY KEY,
        scope VARCHAR,
        content VARCHAR,
        metadata JSON,
        embedding FLOAT[${dimension}]
      );
    `;
    await duckDbClient.executeCustomSql(sql);
    activeStoreDimension = dimension;
    console.info(`🤖 [WASM Vector Store] ${VECTOR_TABLE_NAME} ready (FLOAT[${dimension}]).`);
  } catch (err) {
    console.warn("[Vector Store] init error, recreating:", err);
    await duckDbClient.executeCustomSql(`DROP TABLE IF EXISTS ${VECTOR_TABLE_NAME};`).catch(() => {});
    await duckDbClient.executeCustomSql(`
      CREATE TABLE ${VECTOR_TABLE_NAME} (
        id VARCHAR PRIMARY KEY,
        scope VARCHAR,
        content VARCHAR,
        metadata JSON,
        embedding FLOAT[${dimension}]
      );
    `);
    activeStoreDimension = dimension;
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

  // 1. OPFS kalıcı önbelleğini yükle
  const cachedEmbeddings = await opfsVectorCache.getAll();

  // 2. DuckDB'de halihazırda var olan satırları bul
  const duckDbExistingIds = new Set<string>();
  try {
    const rows = await duckDbClient.executeCustomSql(`SELECT id FROM ${VECTOR_TABLE_NAME};`);
    for (const r of rows) {
      if (r.id) duckDbExistingIds.add(String(r.id));
    }
  } catch {
    // ignore
  }

  // 3. OPFS önbelleğinde olmayan (yeni) öğeleri tespit et ve embedding üret
  const missingFromCache = pending.filter((p) => !cachedEmbeddings.has(p.id));
  if (missingFromCache.length > 0) {
    const newVectors = await getEmbeddings(missingFromCache.map((p) => p.content));
    const entriesToSave: { id: string; embedding: number[] }[] = [];
    for (let i = 0; i < missingFromCache.length; i++) {
      const vec = newVectors[i] ?? new Array(VECTOR_DIMENSION).fill(0);
      cachedEmbeddings.set(missingFromCache[i].id, vec);
      entriesToSave.push({ id: missingFromCache[i].id, embedding: vec });
    }
    await opfsVectorCache.setMany(entriesToSave);
    console.info(
      `🤖 [DuckDB WASM Vector Indexer] ${missingFromCache.length} new report schemas generated and saved to OPFS.`
    );
  } else {
    console.info(
      `🤖 [DuckDB WASM Vector Indexer] All ${pending.length} report schemas loaded from persistent OPFS cache (0 token cost).`
    );
  }

  // 4. DuckDB tablosunda eksik olanları önbellekten doldur
  const missingFromDuckDb = pending.filter((p) => !duckDbExistingIds.has(p.id));
  for (const item of missingFromDuckDb) {
    const vec = cachedEmbeddings.get(item.id) ?? new Array(VECTOR_DIMENSION).fill(0);
    await insertOrReplaceVector({ ...item, embedding: vec });
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

  const cachedEmbeddings = await opfsVectorCache.getAll();
  const duckDbExistingIds = new Set<string>();
  try {
    const rows = await duckDbClient.executeCustomSql(`SELECT id FROM ${VECTOR_TABLE_NAME};`);
    for (const r of rows) {
      if (r.id) duckDbExistingIds.add(String(r.id));
    }
  } catch {
    // ignore
  }

  const missingFromCache = pending.filter((p) => !cachedEmbeddings.has(p.id));
  if (missingFromCache.length > 0) {
    const newVectors = await getEmbeddings(missingFromCache.map((p) => p.content));
    const entriesToSave: { id: string; embedding: number[] }[] = [];
    for (let i = 0; i < missingFromCache.length; i++) {
      const vec = newVectors[i] ?? new Array(VECTOR_DIMENSION).fill(0);
      cachedEmbeddings.set(missingFromCache[i].id, vec);
      entriesToSave.push({ id: missingFromCache[i].id, embedding: vec });
    }
    await opfsVectorCache.setMany(entriesToSave);
    console.info(
      `🤖 [WASM Vector Indexer] ${missingFromCache.length} new workspace menu items generated and saved to OPFS.`
    );
  } else {
    console.info(
      `🤖 [WASM Vector Indexer] All ${pending.length} workspace menu items loaded from persistent OPFS cache (0 token cost).`
    );
  }

  const missingFromDuckDb = pending.filter((p) => !duckDbExistingIds.has(p.id));
  for (const item of missingFromDuckDb) {
    const vec = cachedEmbeddings.get(item.id) ?? new Array(VECTOR_DIMENSION).fill(0);
    await insertOrReplaceVector({ ...item, embedding: vec });
  }

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
      const cachedEmbeddings = await opfsVectorCache.getAll();
      const duckDbExistingIds = new Set<string>();
      try {
        const rows = await duckDbClient.executeCustomSql(
          `SELECT id FROM ${VECTOR_TABLE_NAME} WHERE scope = 'chats';`
        );
        for (const r of rows) {
          if (r.id) duckDbExistingIds.add(String(r.id));
        }
      } catch {
        // ignore
      }

      const missingFromCache = pending.filter((p) => !cachedEmbeddings.has(`conv_${p.id}`));
      for (const p of pending) {
        if (cachedEmbeddings.has(`conv_${p.id}`)) {
          conversationIndexedIds.add(p.id);
        }
      }

      if (missingFromCache.length > 0) {
        const texts = missingFromCache.map((p) => `Sohbet: ${p.title}. ${p.snippet}`.trim());
        const newVectors = await getEmbeddings(texts);
        const entriesToSave: { id: string; embedding: number[] }[] = [];
        for (let i = 0; i < missingFromCache.length; i++) {
          const it = missingFromCache[i];
          const vec = newVectors[i] ?? new Array(VECTOR_DIMENSION).fill(0);
          cachedEmbeddings.set(`conv_${it.id}`, vec);
          entriesToSave.push({ id: `conv_${it.id}`, embedding: vec });
        }
        await opfsVectorCache.setMany(entriesToSave);
        console.info(
          `🤖 [WASM Vector Indexer] ${missingFromCache.length} new conversations generated and saved to OPFS.`
        );
      } else {
        console.info(
          `🤖 [WASM Vector Indexer] All ${pending.length} conversations loaded from persistent OPFS cache (0 token cost).`
        );
      }

      const missingFromDuckDb = pending.filter((p) => !duckDbExistingIds.has(`conv_${p.id}`));
      for (const it of missingFromDuckDb) {
        const vec = cachedEmbeddings.get(`conv_${it.id}`) ?? new Array(VECTOR_DIMENSION).fill(0);
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
          },
          embedding: vec,
        });
        conversationIndexedIds.add(it.id);
      }
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
    INSERT OR REPLACE INTO ${VECTOR_TABLE_NAME} (id, scope, content, metadata, embedding)
    VALUES ('${item.id}', '${item.scope}', '${cleanContent}', '${cleanMeta}', ${vecLiteral});
  `;
  try {
    await duckDbClient.executeCustomSql(sql);
  } catch (err) {
    if (String(err).includes("does not exist") || String(err).includes("yula_rag_embeddings")) {
      activeStoreDimension = null;
      await initVectorStore(dim);
      await duckDbClient.executeCustomSql(`
        INSERT OR REPLACE INTO ${VECTOR_TABLE_NAME} (id, scope, content, metadata, embedding)
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
      FROM ${VECTOR_TABLE_NAME}
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
