/**
 * DuckDB WASM Vector Store Servisi — RAG & Vektör Arama Altyapısı.
 *
 * Rapor şemalarını, kriter alanlarını ve yetkili kolon açıklamalarını
 * all-minilm (384-dim) vektörleriyle DuckDB WASM `FLOAT[384]` sütununda saklar.
 * `array_cosine_distance` ile ~3 ms içinde semantik bağlam araması yürütür.
 */

import { duckDbClient } from "@/services/duckdb";
import { getEmbedding, getEmbeddings, VECTOR_DIMENSION } from "@/lib/yula-embedding";
import { buildRagWhereClause } from "@/lib/rag-tier";
import type { RagSearchFilter, RagVectorTier } from "@/lib/rag-tier";
import { REGISTERED_REPORTS } from "@/features/reports/report-registry";
import { STOCK_WORKSPACE_MENU_ITEMS } from "@/workspaces/stock/lib/stock-menu-registry";

import { opfsVectorCache } from "@/services/opfs/opfs-vector-cache";

export type { RagSearchFilter, RagVectorTier };

export interface RagVectorItem {
  id: string;
  scope: string;
  content: string;
  metadata: Record<string, unknown>;
  distance?: number;
  tier?: RagVectorTier;
  workspace?: string;
  version?: number;
}

/**
 * Korpus sürümü: indekslenen metinler değiştiğinde artırılır. OPFS vektör
 * önbelleği id-bazlı ve kalıcı olduğu için sürüm değişiminde önbellek
 * temizlenip vektörler yeniden üretilir (stale embedding savunması).
 * v3: sohbet metadata'sına `agentId` etiketi (ajan-bazlı ayrım).
 */
export const RAG_CORPUS_VERSION = 3;
const OPFS_CORPUS_VERSION_FILE = "yula_rag_corpus_version.txt";

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
        embedding FLOAT[${dimension}],
        tier VARCHAR DEFAULT 'global',
        workspace VARCHAR,
        version INTEGER DEFAULT 1
      );
    `;
    await duckDbClient.executeCustomSql(sql);
    // Eski şemadan migrasyon: katman kolonları yoksa ekle.
    try {
      const cols = await duckDbClient.executeCustomSql(
        `SELECT column_name FROM duckdb_columns() WHERE table_name = '${VECTOR_TABLE_NAME}';`,
      );
      const names = new Set(
        (Array.isArray(cols) ? cols : []).map((r) =>
          String((r as Record<string, unknown>).column_name ?? "").toLowerCase(),
        ),
      );
      if (!names.has("tier")) {
        await duckDbClient.executeCustomSql(
          `ALTER TABLE ${VECTOR_TABLE_NAME} ADD COLUMN tier VARCHAR DEFAULT 'global';`,
        );
      }
      if (!names.has("workspace")) {
        await duckDbClient.executeCustomSql(
          `ALTER TABLE ${VECTOR_TABLE_NAME} ADD COLUMN workspace VARCHAR;`,
        );
      }
      if (!names.has("version")) {
        await duckDbClient.executeCustomSql(
          `ALTER TABLE ${VECTOR_TABLE_NAME} ADD COLUMN version INTEGER DEFAULT 1;`,
        );
      }
    } catch {
      // PRAGMA/detay başarısızsa tablo yine kullanılabilir (kolonlar yok sayılır)
    }
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
        embedding FLOAT[${dimension}],
        tier VARCHAR DEFAULT 'global',
        workspace VARCHAR,
        version INTEGER DEFAULT 1
      );
    `);
    activeStoreDimension = dimension;
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
    return false;
  }
  try {
    const root = await navigator.storage.getDirectory();
    let current = 0;
    try {
      const fh = await root.getFileHandle(OPFS_CORPUS_VERSION_FILE, { create: false });
      const text = await (await fh.getFile()).text();
      current = Number(text.trim()) || 0;
    } catch {
      current = 0;
    }
    if (current === RAG_CORPUS_VERSION) return false;
    await opfsVectorCache.clear();
    await duckDbClient
      .executeCustomSql(`DROP TABLE IF EXISTS ${VECTOR_TABLE_NAME};`)
      .catch(() => {});
    activeStoreDimension = null;
    const fh = await root.getFileHandle(OPFS_CORPUS_VERSION_FILE, { create: true });
    const w = await fh.createWritable();
    await w.write(String(RAG_CORPUS_VERSION));
    await w.close();
    console.info(
      `🤖 [WASM Vector Indexer] Corpus v${current} → v${RAG_CORPUS_VERSION}: cache cleared, full reindex.`,
    );
    return true;
  } catch (err) {
    console.warn("[Vector Store] corpus version check failed:", err);
    return false;
  }
}

const reportSchemaIndexRef: { promise: Promise<number> | null } = { promise: null };
const workspaceMenuIndexRef: { promise: Promise<number> | null } = { promise: null };

/** Sistemdeki tüm rapor şemalarını ve kolon tanımlarını vektörleştirip indeksler (oturum başına bir kez, toplu istekle). */
export function indexReportSchemas(): Promise<number> {
  return dedupeSessionIndex(reportSchemaIndexRef, doIndexReportSchemas);
}

async function doIndexReportSchemas(): Promise<number> {
  await ensureRagCorpusVersion();
  await initVectorStore();

  type PendingVector = {
    id: string;
    scope: string;
    content: string;
    metadata: Record<string, unknown>;
    tier: RagVectorTier;
    workspace?: string;
  };
  const pending: PendingVector[] = [];

  for (const report of REGISTERED_REPORTS) {
    const scope = report.scope;
    const title = report.title;
    const ws = report.workspace;

    // 1) Rapor üst seviye özeti
    const summaryText = `Rapor: ${title} (${scope}, workspace: ${ws}). Kapsam ve tanım: Stok bakiyeleri, miktar, tutar ve depo detayları.`;
    pending.push({
      id: `report_${scope}_summary`,
      scope,
      content: summaryText,
      metadata: { type: "report_summary", title, scope, workspace: ws },
      tier: "workspace",
      workspace: ws,
    });

    // 2) Kriter alanları özeti
    const criteriaEntries = Object.entries(report.criteriaSchema.properties);
    for (const [key, prop] of criteriaEntries) {
      const fieldTitle = prop.title ?? key;
      const optionsStr = prop.enum ? `, seçenekler: ${prop.enum.join(" | ")}` : "";
      const text = `Rapor Kriter Alanı: ${key} (${fieldTitle}). Rapor: ${title} (${scope}, workspace: ${ws})${optionsStr}.`;
      pending.push({
        id: `report_${scope}_criteria_${key}`,
        scope,
        content: text,
        metadata: { type: "criteria_field", key, title: fieldTitle, scope, workspace: ws },
        tier: "workspace",
        workspace: ws,
      });
    }

    // 3) Kolon açıklamaları (x-ai.columnDescriptions)
    const colDescs = (report.fullSchema as unknown as { "x-ai"?: { columnDescriptions?: Record<string, string> } })?.["x-ai"]?.columnDescriptions ?? {};
    for (const [col, desc] of Object.entries(colDescs)) {
      const text = `Kolon Tanımı: ${col} - ${desc}. Rapor: ${title} (${scope}, workspace: ${ws}).`;
      pending.push({
        id: `report_${scope}_col_${col}`,
        scope,
        content: text,
        metadata: { type: "column_description", column: col, scope, workspace: ws },
        tier: "workspace",
        workspace: ws,
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
      tier: "global",
    },
    {
      id: "system_admin_users",
      scope: "system",
      content: "Sistem Kullanıcı Dizin Kataloğu (/system/users): Şirket genelindeki tüm kayıtlı kullanıcılar, rolleri, erişim yetkileri ve aktif oturum durumları bu ekranda yönetilir.",
      metadata: { type: "system_route", path: "/system/users" },
      tier: "global",
    },
    {
      id: "system_agents",
      scope: "system",
      content: "Ajan Ayarları (/system/agents): Kullanıcı tanımlı Yula ajan kimlikleri (persona talimatı, araç erişimi, skill seti, model) bu ekranda oluşturulur, düzenlenir, aktifleştirilir ve silinir.",
      metadata: { type: "system_route", path: "/system/agents" },
      tier: "global",
    },
    {
      id: "system_skills",
      scope: "system",
      content: "Skill Ayarları (/system/skills): Kullanıcı tanımlı slash komutları (User sekmesi) ve yerleşik skill'ler (System sekmesi) bu ekranda yönetilir.",
      metadata: { type: "system_route", path: "/system/skills" },
      tier: "global",
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
  // 6) Rapor yönlendirici korpusu (hangi soru → hangi rapor)
  const routerCount = await indexWorkspaceRouter();
  const total = pending.length + menuCount + routerCount;

  console.info(`🤖 [DuckDB WASM Vector Indexer] ${total} total vector items ready in DuckDB WASM.`);
  return total;
}

const workspaceRouterIndexRef: { promise: Promise<number> | null } = { promise: null };

/**
 * Rapor yönlendirici korpusu: registry'den türetilir, el yazısı gerekmez.
 * Her rapor için "bu rapor hangi sorulara cevap verir" metni `ws:<workspace>`
 * katmanında indekslenir; cross-workspace yönlendirme buradan çözülür.
 */
export function indexWorkspaceRouter(): Promise<number> {
  return dedupeSessionIndex(workspaceRouterIndexRef, doIndexWorkspaceRouter);
}

async function doIndexWorkspaceRouter(): Promise<number> {
  await initVectorStore();
  const pending: Array<{
    id: string;
    scope: string;
    content: string;
    metadata: Record<string, unknown>;
    tier: RagVectorTier;
    workspace?: string;
  }> = [];

  for (const report of REGISTERED_REPORTS) {
    const ai = (report.fullSchema as unknown as { "x-ai"?: {
      aliases?: string[];
      columnDescriptions?: Record<string, string>;
    } })?.["x-ai"];
    const aliases = (ai?.aliases ?? []).join(", ");
    const columns = Object.keys(ai?.columnDescriptions ?? {}).join(", ");
    const criteriaKeys = Object.keys(report.criteriaSchema.properties).join(", ");
    pending.push({
      id: `router_${report.scope}`,
      scope: report.scope,
      content: [
        `Rapor Yönlendirme: ${report.title} (${report.scope}, workspace: ${report.workspace}, sayfa: ${report.pagePath}).`,
        aliases ? `Bu rapor şu ifadelerle aranır: ${aliases}.` : "",
        `Kriter alanları: ${criteriaKeys}.`,
        columns ? `Sonuç kolonları: ${columns}.` : "",
      ]
        .filter(Boolean)
        .join(" "),
      metadata: {
        type: "report_router",
        title: report.title,
        scope: report.scope,
        workspace: report.workspace,
        pagePath: report.pagePath,
      },
      tier: "workspace",
      workspace: report.workspace,
    });
  }

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
  }
  const missingFromDuckDb = pending.filter((p) => !duckDbExistingIds.has(p.id));
  for (const item of missingFromDuckDb) {
    const vec = cachedEmbeddings.get(item.id) ?? new Array(VECTOR_DIMENSION).fill(0);
    await insertOrReplaceVector({ ...item, embedding: vec });
  }
  return pending.length;
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
    tier: "workspace" as RagVectorTier,
    workspace: item.workspace,
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
  /** Ayrı ajan oturumu ise ajan id'si; null/undefined = varsayılan Yula. */
  agentId?: string | null;
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
            agentId: it.agentId ?? null,
          },
          // Kullanıcı katmanı: cihaz başına tek kullanıcı varsayımı; çok kullanıcılı
          // cihazda id öneki (user:<id>) gerekir — sonraki adım.
          tier: "user",
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
  const targets = ids.filter(Boolean);
  if (targets.length === 0) return;
  for (const id of targets) conversationIndexedIds.delete(id);
  const vecIds = targets.map((id) => `conv_${id}`);
  try {
    await opfsVectorCache.remove(vecIds);
  } catch (err) {
    console.warn("[Vector Store] OPFS vektör silme başarısız:", err);
  }
  const list = vecIds.map((id) => `'${id.replace(/'/g, "''")}'`).join(", ");
  const deleteSql = `DELETE FROM ${VECTOR_TABLE_NAME} WHERE id IN (${list});`;
  const countSql = `SELECT id FROM ${VECTOR_TABLE_NAME} WHERE id IN (${list});`;
  const isMissingTable = (err: unknown) =>
    String(err).includes("does not exist") ||
    String(err).includes("yula_rag_embeddings");
  try {
    await duckDbClient.executeCustomSql(deleteSql);
  } catch (err) {
    if (isMissingTable(err)) return;
    throw err;
  }
  // Doğrulama: satır kaldıysa bir kez daha dene (WASM yarışına karşı).
  let remaining: string[] = [];
  try {
    const rows = await duckDbClient.executeCustomSql(countSql);
    remaining = (Array.isArray(rows) ? rows : []).map((r) =>
      String((r as Record<string, unknown>).id ?? ""),
    );
  } catch (err) {
    if (isMissingTable(err)) return;
    throw err;
  }
  if (remaining.length > 0) {
    await initVectorStore();
    try {
      await duckDbClient.executeCustomSql(deleteSql);
      const rows = await duckDbClient.executeCustomSql(countSql);
      remaining = (Array.isArray(rows) ? rows : []).map((r) =>
        String((r as Record<string, unknown>).id ?? ""),
      );
    } catch (err) {
      if (!isMissingTable(err)) throw err;
      return;
    }
  }
  if (remaining.length > 0) {
    throw new Error(
      `Vektör silme doğrulanamadı, kalan satırlar: ${remaining.join(", ")}`,
    );
  }
}

/**
 * Tabloda kalıp store'da olmayan sohbet vektörlerini temizler.
 * Silinen id'lerin listesini döndürür (spike teşhisi + tek seferlik tamir).
 */
export async function purgeOrphanConversationVectors(
  existingIds: string[],
): Promise<string[]> {
  const keep = new Set(existingIds);
  let rows: Record<string, unknown>[] = [];
  try {
    const res = await duckDbClient.executeCustomSql(
      `SELECT id FROM ${VECTOR_TABLE_NAME} WHERE scope = 'chats';`,
    );
    if (Array.isArray(res)) rows = res;
  } catch {
    return [];
  }
  const orphans = rows
    .map((r) => String(r.id ?? ""))
    .filter((id) => id.startsWith("conv_") && !keep.has(id.slice(5)));
  if (orphans.length > 0) {
    await removeConversationVectors(orphans.map((o) => o.slice(5)));
  }
  return orphans;
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
  filter?: RagSearchFilter,
): Promise<RagVectorItem[]> {
  const pool = await searchVectorContext(
    queryText,
    Math.max(limit, 10),
    filter ?? {},
  );
  if (pool.length === 0) return [];
  const isConversation = (r: RagVectorItem) => {
    const meta = r.metadata as { type?: string } | null;
    return (
      meta?.type === "conversation" || (r.tier === "user" && r.scope === "chats")
    );
  };
  const isRouter = (r: RagVectorItem) =>
    (r.metadata as { type?: string } | null)?.type === "report_router";
  const routers = pool.filter(isRouter);
  const others = pool.filter((r) => !isRouter(r) && !isConversation(r));
  const convos = pool.filter(isConversation);
  const out: RagVectorItem[] = [];
  for (const r of [...routers, ...others, ...convos.slice(0, 1)]) {
    if (out.length >= limit) break;
    if (!out.some((o) => o.id === r.id)) out.push(r);
  }
  return out;
}

async function insertOrReplaceVector(item: {
  id: string;
  scope: string;
  content: string;
  metadata: Record<string, unknown>;
  embedding: number[];
  tier?: RagVectorTier;
  workspace?: string;
}): Promise<void> {
  const dim = item.embedding.length || VECTOR_DIMENSION;
  await initVectorStore(dim);
  const vecLiteral = `[${item.embedding.join(",")}]::FLOAT[${dim}]`;
  const cleanContent = item.content.replace(/'/g, "''");
  const cleanMeta = JSON.stringify(item.metadata).replace(/'/g, "''");
  const tier = item.tier ?? "global";
  const wsLiteral =
    typeof item.workspace === "string" && item.workspace
      ? `'${item.workspace.replace(/'/g, "''")}'`
      : "NULL";

  const sql = `
    INSERT OR REPLACE INTO ${VECTOR_TABLE_NAME} (id, scope, content, metadata, embedding, tier, workspace, version)
    VALUES ('${item.id}', '${item.scope}', '${cleanContent}', '${cleanMeta}', ${vecLiteral}, '${tier}', ${wsLiteral}, ${RAG_CORPUS_VERSION});
  `;
  try {
    await duckDbClient.executeCustomSql(sql);
  } catch (err) {
    if (String(err).includes("does not exist") || String(err).includes("yula_rag_embeddings")) {
      activeStoreDimension = null;
      await initVectorStore(dim);
      await duckDbClient.executeCustomSql(sql);
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
 * env'leriyle override edilebilir. Üçüncü parametre olarak sayı verilirse
 * (legacy) doğrudan maxDistance sayılır.
 */
export async function searchVectorContext(
  queryText: string,
  limit = 3,
  filter?: RagSearchFilter | number,
): Promise<RagVectorItem[]> {
  const trimmed = queryText.trim();
  if (!trimmed) return [];
  const opts: RagSearchFilter =
    typeof filter === "number" ? { maxDistance: filter } : (filter ?? {});

  const startMs = performance.now();
  try {
    const queryVec = await getEmbedding(trimmed);
    const dim = queryVec.length || VECTOR_DIMENSION;
    await initVectorStore(dim);
    const vecLiteral = `[${queryVec.join(",")}]::FLOAT[${dim}]`;
    const whereClause = buildRagWhereClause(opts);

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
      tier: (r.tier as RagVectorTier | undefined) ?? "global",
      workspace: typeof r.workspace === "string" ? (r.workspace as string) : undefined,
      version: typeof r.version === "number" ? (r.version as number) : Number(r.version ?? 1),
    }));

    // Zayıf (ilişkisiz) eşleşmeleri düşür — dilsel kalıp yok, yalnız mesafe
    const cutoff = opts.maxDistance ?? distanceCutoffFor(trimmed);
    const filtered = results.filter(
      (r) =>
        typeof r.distance !== "number" ||
        !Number.isFinite(r.distance) ||
        r.distance <= cutoff,
    );

    // Ajan ayrımı: kullanıcı katmanı (sohbet geçmişi) kayıtları yalnız
    // istenen ajana aittir. Etiketli çağrılarda uymayan kayıtlar düşer;
    // etiketsiz eski satırlar Yula (null) sayılır.
    const scoped =
      opts.agentId !== undefined
        ? filtered.filter((r) => {
            const meta = r.metadata as {
              type?: string;
              agentId?: string | null;
            } | null;
            const isConversation =
              meta?.type === "conversation" ||
              (r.tier === "user" && r.scope === "chats");
            if (!isConversation) return true;
            return (meta?.agentId ?? null) === (opts.agentId ?? null);
          })
        : filtered;

    if (results.length > 0) {
      console.info(
        `%c🤖 [Yula RAG Telemetry]%c query: "%c${trimmed}%c" · %c${scoped.length}/${results.length} vector context items (cutoff ${cutoff.toFixed(2)})%c (${Math.round(performance.now() - startMs)} ms)`,
        "color: #f59e0b; font-weight: bold;",
        "color: inherit;",
        "color: #3b82f6; font-style: italic;",
        "color: inherit;",
        "color: #10b981; font-weight: bold;",
        "color: #6b7280;",
        scoped,
      );
    }

    return scoped;
  } catch (err) {
    console.warn("[Vector Store] search error:", err);
    return [];
  }
}
