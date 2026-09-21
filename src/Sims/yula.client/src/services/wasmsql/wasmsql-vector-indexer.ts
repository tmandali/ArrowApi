import { getEmbeddings, VECTOR_DIMENSION } from "@/lib/yula-embedding"
import { REGISTERED_REPORTS } from "@/features/reports/report-registry"
import { STOCK_WORKSPACE_MENU_ITEMS } from "@/lib/workspace-search-catalog"
import { opfsVectorCache } from "@/services/opfs/opfs-vector-cache"
import { devInfo } from "@/lib/dev-log"
import { wasmSqlClient } from "./wasm-sql-client"
import {
  VECTOR_TABLE_NAME,
  type RagVectorTier,
} from "./wasmsql-vector-types"
import {
  initVectorStore,
  ensureRagCorpusVersion,
  insertOrReplaceVector,
  dedupeSessionIndex,
} from "./wasmsql-vector-store"

const reportSchemaIndexRef: { promise: Promise<number> | null } = { promise: null }
const workspaceMenuIndexRef: { promise: Promise<number> | null } = { promise: null }
const workspaceRouterIndexRef: { promise: Promise<number> | null } = { promise: null }

/** Sistemdeki tüm rapor şemalarını ve kolon tanımlarını vektörleştirip indeksler (oturum başına bir kez, toplu istekle). */
export function indexReportSchemas(): Promise<number> {
  return dedupeSessionIndex(reportSchemaIndexRef, doIndexReportSchemas)
}

async function doIndexReportSchemas(): Promise<number> {
  await ensureRagCorpusVersion()
  await initVectorStore()

  type PendingVector = {
    id: string
    scope: string
    content: string
    metadata: Record<string, unknown>
    tier: RagVectorTier
    workspace?: string
  }
  const pending: PendingVector[] = []

  for (const report of REGISTERED_REPORTS) {
    const scope = report.scope
    const title = report.title
    const ws = report.workspace

    // 1) Rapor üst seviye özeti
    const summaryText = `Rapor: ${title} (${scope}, workspace: ${ws}). Kapsam ve tanım: Stok bakiyeleri, miktar, tutar ve depo detayları.`
    pending.push({
      id: `report_${scope}_summary`,
      scope,
      content: summaryText,
      metadata: { type: "report_summary", title, scope, workspace: ws },
      tier: "workspace",
      workspace: ws,
    })

    // 2) Kriter alanları özeti
    const criteriaEntries = Object.entries(report.criteriaSchema.properties)
    for (const [key, prop] of criteriaEntries) {
      const fieldTitle = prop.title ?? key
      const optionsStr = prop.enum ? `, seçenekler: ${prop.enum.join(" | ")}` : ""
      const text = `Rapor Kriter Alanı: ${key} (${fieldTitle}). Rapor: ${title} (${scope}, workspace: ${ws})${optionsStr}.`
      pending.push({
        id: `report_${scope}_criteria_${key}`,
        scope,
        content: text,
        metadata: { type: "criteria_field", key, title: fieldTitle, scope, workspace: ws },
        tier: "workspace",
        workspace: ws,
      })
    }

    // 3) Kolon açıklamaları (x-ai.columnDescriptions)
    const colDescs = (
      report.fullSchema as unknown as {
        "x-ai"?: { columnDescriptions?: Record<string, string> }
      }
    )?.["x-ai"]?.columnDescriptions ?? {}
    for (const [col, desc] of Object.entries(colDescs)) {
      const text = `Kolon Tanımı: ${col} - ${desc}. Rapor: ${title} (${scope}, workspace: ${ws}).`
      pending.push({
        id: `report_${scope}_col_${col}`,
        scope,
        content: text,
        metadata: { type: "column_description", column: col, scope, workspace: ws },
        tier: "workspace",
        workspace: ws,
      })
    }
  }

  // 4) Sistem ve Kişisel Rotaların RAG İndeksine Eklenmesi (/my ve /system)
  pending.push(
    {
      id: "system_my_settings",
      scope: "my",
      content:
        "Kullanıcı Profili ve AI Ayarları (/my/settings): Giriş yapmış kullanıcının şifre, dil, saat dilimi, yerel Ollama/Gemini/Azure LLM seçimi, API key ve Yula sistem hafıza bilgileri (System Facts) burada yönetilir.",
      metadata: { type: "system_route", path: "/my/settings" },
      tier: "global",
    },
    {
      id: "system_admin_users",
      scope: "system",
      content:
        "Sistem Kullanıcı Dizin Kataloğu (/system/users): Şirket genelindeki tüm kayıtlı kullanıcılar, rolleri, erişim yetkileri ve aktif oturum durumları bu ekranda yönetilir.",
      metadata: { type: "system_route", path: "/system/users" },
      tier: "global",
    },
    {
      id: "my_skills",
      scope: "my",
      content:
        "Beceriler & Komutlar (/my/skills): Kullanıcı tanımlı slash komutları ve becerileri (skills) yönetilir.",
      metadata: { type: "system_route", path: "/my/skills" },
      tier: "global",
    },
    {
      id: "my_agents",
      scope: "my",
      content:
        "Personalar & Ajanlar (/my/agents): Kullanıcı tanımlı alt ajanlar ve sistem personalları yapılandırılır ve yönetilir.",
      metadata: { type: "system_route", path: "/my/agents" },
      tier: "global",
    },
    {
      id: "my_plugins",
      scope: "my",
      content:
        "Kurumsal Eklentiler (/my/plugins): Sisteme entegre edilen Python AI sidecar, DuckDB ve ileri analitik araç eklentileri listelenir.",
      metadata: { type: "system_route", path: "/my/plugins" },
      tier: "global",
    },
    {
      id: "my_memory",
      scope: "my",
      content:
        "Kalıcı Bellek & Tercihler (/my/memory): Yula AI kalıcı hafızası (agent memory) ve kullanıcı tercihleri yönetilir.",
      metadata: { type: "system_route", path: "/my/memory" },
      tier: "global",
    }
  )

  // 1. OPFS kalıcı önbelleğini yükle
  const cachedEmbeddings = await opfsVectorCache.getAll()

  // 2. DuckDB'de halihazırda var olan satırları bul
  const duckDbExistingIds = new Set<string>()
  try {
    const rows = await wasmSqlClient.executeCustomSql(`SELECT id FROM ${VECTOR_TABLE_NAME};`)
    for (const r of rows) {
      if (r.id) duckDbExistingIds.add(String(r.id))
    }
  } catch {
    // ignore
  }

  // 3. OPFS önbelleğinde olmayan (yeni) öğeleri tespit et ve embedding üret
  const missingFromCache = pending.filter((p) => !cachedEmbeddings.has(p.id))
  if (missingFromCache.length > 0) {
    const newVectors = await getEmbeddings(missingFromCache.map((p) => p.content))
    const entriesToSave: { id: string; embedding: number[] }[] = []
    for (let i = 0; i < missingFromCache.length; i++) {
      const vec = newVectors[i] ?? new Array(VECTOR_DIMENSION).fill(0)
      cachedEmbeddings.set(missingFromCache[i].id, vec)
      entriesToSave.push({ id: missingFromCache[i].id, embedding: vec })
    }
    await opfsVectorCache.setMany(entriesToSave)
    devInfo(
      `🤖 [DuckDB WASM Vector Indexer] ${missingFromCache.length} new report schemas generated and saved to OPFS.`
    )
  } else {
    devInfo(
      `🤖 [DuckDB WASM Vector Indexer] All ${pending.length} report schemas loaded from persistent OPFS cache (0 token cost).`
    )
  }

  // 4. DuckDB tablosunda eksik olanları önbellekten doldur
  const missingFromDuckDb = pending.filter((p) => !duckDbExistingIds.has(p.id))
  for (const item of missingFromDuckDb) {
    const vec = cachedEmbeddings.get(item.id) ?? new Array(VECTOR_DIMENSION).fill(0)
    await insertOrReplaceVector({ ...item, embedding: vec })
  }

  // 5) Workspace Menü ve Modül Öğelerinin Vektör İndeksine Eklenmesi
  const menuCount = await indexWorkspaceMenus()
  // 6) Rapor yönlendirici korpusu (hangi soru → hangi rapor)
  const routerCount = await indexWorkspaceRouter()
  const total = pending.length + menuCount + routerCount

  devInfo(`🤖 [DuckDB WASM Vector Indexer] ${total} total vector items ready in DuckDB WASM.`)
  return total
}

/**
 * Rapor yönlendirici korpusu: registry'den türetilir, el yazısı gerekmez.
 * Her rapor için "bu rapor hangi sorulara cevap verir" metni `ws:<workspace>`
 * katmanında indekslenir; cross-workspace yönlendirme buradan çözülür.
 */
export function indexWorkspaceRouter(): Promise<number> {
  return dedupeSessionIndex(workspaceRouterIndexRef, doIndexWorkspaceRouter)
}

async function doIndexWorkspaceRouter(): Promise<number> {
  await initVectorStore()
  const pending: Array<{
    id: string
    scope: string
    content: string
    metadata: Record<string, unknown>
    tier: RagVectorTier
    workspace?: string
  }> = []

  for (const report of REGISTERED_REPORTS) {
    const ai = (
      report.fullSchema as unknown as {
        "x-ai"?: {
          aliases?: string[]
          columnDescriptions?: Record<string, string>
        }
      }
    )?.["x-ai"]
    const aliases = (ai?.aliases ?? []).join(", ")
    const columns = Object.keys(ai?.columnDescriptions ?? {}).join(", ")
    const criteriaKeys = Object.keys(report.criteriaSchema.properties).join(", ")
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
    })
  }

  const cachedEmbeddings = await opfsVectorCache.getAll()
  const duckDbExistingIds = new Set<string>()
  try {
    const rows = await wasmSqlClient.executeCustomSql(`SELECT id FROM ${VECTOR_TABLE_NAME};`)
    for (const r of rows) {
      if (r.id) duckDbExistingIds.add(String(r.id))
    }
  } catch {
    // ignore
  }

  const missingFromCache = pending.filter((p) => !cachedEmbeddings.has(p.id))
  if (missingFromCache.length > 0) {
    const newVectors = await getEmbeddings(missingFromCache.map((p) => p.content))
    const entriesToSave: { id: string; embedding: number[] }[] = [];
    for (let i = 0; i < missingFromCache.length; i++) {
      const vec = newVectors[i] ?? new Array(VECTOR_DIMENSION).fill(0)
      cachedEmbeddings.set(missingFromCache[i].id, vec)
      entriesToSave.push({ id: missingFromCache[i].id, embedding: vec })
    }
    await opfsVectorCache.setMany(entriesToSave)
  }
  const missingFromDuckDb = pending.filter((p) => !duckDbExistingIds.has(p.id))
  for (const item of missingFromDuckDb) {
    const vec = cachedEmbeddings.get(item.id) ?? new Array(VECTOR_DIMENSION).fill(0)
    await insertOrReplaceVector({ ...item, embedding: vec })
  }
  return pending.length
}

/** Workspace menü öğelerini (Stock vb.) DuckDB WASM RAG tablosuna vektörleştirip kaydeder (oturum başına bir kez, toplu istekle). */
export function indexWorkspaceMenus(): Promise<number> {
  return dedupeSessionIndex(workspaceMenuIndexRef, doIndexWorkspaceMenus)
}

async function doIndexWorkspaceMenus(): Promise<number> {
  await initVectorStore()

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
  }))

  const cachedEmbeddings = await opfsVectorCache.getAll()
  const duckDbExistingIds = new Set<string>()
  try {
    const rows = await wasmSqlClient.executeCustomSql(`SELECT id FROM ${VECTOR_TABLE_NAME};`)
    for (const r of rows) {
      if (r.id) duckDbExistingIds.add(String(r.id))
    }
  } catch {
    // ignore
  }

  const missingFromCache = pending.filter((p) => !cachedEmbeddings.has(p.id))
  if (missingFromCache.length > 0) {
    const newVectors = await getEmbeddings(missingFromCache.map((p) => p.content))
    const entriesToSave: { id: string; embedding: number[] }[] = []
    for (let i = 0; i < missingFromCache.length; i++) {
      const vec = newVectors[i] ?? new Array(VECTOR_DIMENSION).fill(0)
      cachedEmbeddings.set(missingFromCache[i].id, vec)
      entriesToSave.push({ id: missingFromCache[i].id, embedding: vec })
    }
    await opfsVectorCache.setMany(entriesToSave)
    devInfo(
      `🤖 [WASM Vector Indexer] ${missingFromCache.length} new workspace menu items generated and saved to OPFS.`
    )
  } else {
    devInfo(
      `🤖 [WASM Vector Indexer] All ${pending.length} workspace menu items loaded from persistent OPFS cache (0 token cost).`
    )
  }

  const missingFromDuckDb = pending.filter((p) => !duckDbExistingIds.has(p.id))
  for (const item of missingFromDuckDb) {
    const vec = cachedEmbeddings.get(item.id) ?? new Array(VECTOR_DIMENSION).fill(0)
    await insertOrReplaceVector({ ...item, embedding: vec })
  }

  return pending.length
}
