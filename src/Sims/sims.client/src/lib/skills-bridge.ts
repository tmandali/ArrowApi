import { toolRegistry, type ToolDefinition, type ToolParameter } from "@/lib/tool-registry";
import { duckDbClient } from "@/services/duckdb";
import { useAgentBridgeStore } from "@/hooks/useAgentBridge";
import type { SkillFunctionInfo } from "@/hooks/yula/types";

/**
 * Yula Skill Köprüsü (bridged skills).
 *
 * Sidecar'daki needs_session_data=true skill'ler için toolRegistry'ye gerçek araç
 * kaydeder. Yürütme: aktif DuckDB tablosundan satırlar çekilir → sidecar'a
 * `bridge_call` ile akıtılır → sonuç (örn. dosya yolu) file_link kartı olarak döner.
 *
 * Güvenlik modeli: skill fonksiyonu asla kendi başına tetiklenmez; veri her seferinde
 * frontend executor'ından onaylı geçer.
 */

const MAX_EXPORT_ROWS = 100_000;

type BridgeWaiter = (res: { ok: boolean; result?: Record<string, any>; error?: string }) => void;
type UnregisterFn = () => void;

/** requestId → bekleyen çözücü ("bridge_result" event'i burayı besler) */
const bridgeWaiters = new Map<string, BridgeWaiter>();
/** Kayıtlı skill araçlarının unregister kapanışları */
const skillUnregisters = new Map<string, UnregisterFn>();

export function resolveBridgeWaiter(
  requestId: string | undefined,
  payload: { ok: boolean; result?: Record<string, any>; error?: string }
): void {
  if (!requestId) return;
  const waiter = bridgeWaiters.get(requestId);
  if (waiter) {
    bridgeWaiters.delete(requestId);
    waiter(payload);
  }
}

function callBridge(
  tool: string,
  rows: Record<string, unknown>[] | null,
  args: Record<string, any>
): Promise<{ ok: boolean; result?: Record<string, any>; error?: string }> {
  return new Promise((resolve) => {
    const { writeToSidecar } = useAgentBridgeStore.getState();
    if (!writeToSidecar?.call(null, "")) {
      // Yan etki olarak yazma denemesi yapılmadan bağlantı yoksa erken çık
      resolve({ ok: false, error: "Skill köprüsü yalnızca masaüstü modunda kullanılabilir." });
      return;
    }
    const requestId = `bridge-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const timeout = window.setTimeout(() => {
      bridgeWaiters.delete(requestId);
      resolve({ ok: false, error: "Skill zaman aşımına uğradı." });
    }, 120_000);
    bridgeWaiters.set(requestId, (res) => {
      window.clearTimeout(timeout);
      resolve(res);
    });
    writeToSidecar(JSON.stringify({ action: "bridge_call", requestId, tool, rows, args }));
  });
}

async function resolveActiveTable(argsTable?: string): Promise<string | null> {
  if (argsTable) return argsTable;
  const ctx = useAgentBridgeStore.getState().screenContext;
  const fromCtx = (ctx?.activeDataSummary as Record<string, any>)?.tableName;
  if (fromCtx) return String(fromCtx);
  // Aktif ekran yoksa DuckDB'deki rapor tablolarına düş (Yula ana ekranı senaryosu)
  try {
    const tables = await duckDbClient.executeCustomSql(
      `SELECT table_name FROM information_schema.tables WHERE table_name = 'current_report' OR table_name LIKE 'report%' ORDER BY table_name DESC`
    );
    return (tables[0]?.table_name as string) || null;
  } catch {
    return null;
  }
}

async function executeBridgedSkill(fn: SkillFunctionInfo, args: Record<string, any>) {
  const table = await resolveActiveTable(args?.table);
  if (!table) {
    return { status: "error", message: "Aktif rapor tablosu bulunamadı. Önce bir rapor açın." };
  }

  let rows: Record<string, unknown>[];
  try {
    const escaped = `"${String(table).replace(/"/g, '""')}"`;
    rows = await duckDbClient.executeCustomSql(`SELECT * FROM ${escaped} LIMIT ${MAX_EXPORT_ROWS}`);
  } catch (err: any) {
    return { status: "error", message: `Tablo okunamadı (${table}): ${err?.message || err}` };
  }
  if (!rows || rows.length === 0) {
    return { status: "error", message: `"${table}" tablosunda aktarıacak satır bulunamadı.` };
  }

  const { table: _ignored, ...skillArgs } = args || {};
  const outcome = await callBridge(fn.name, rows, skillArgs);
  if (!outcome.ok) {
    return { status: "error", message: outcome.error || "Skill yürütmesi başarısız oldu." };
  }

  const res = outcome.result || {};
  if (res.error) {
    return { status: "error", message: String(res.error) };
  }
  if (res.file_path) {
    return {
      success: true,
      // Kart sözleşmesi: customKind = skill adı → src/skills/<ad>/<ad>.card.tsx
      // Bilinçli olarak `message` YOK: kart tek gösterimdir (çift baloncuk olmasın).
      customKind: fn.name,
      title: res.file_name || "Dışa aktarılan dosya",
      file_path: res.file_path,
      file_name: res.file_name,
      rows_written: res.rows_written ?? rows.length,
      format: res.format,
      warning: res.warning,
    };
  }
  return { success: true, raw: res, message: "Skill tamamlandı." };
}

/**
 * Header-buton gibi LLM'siz doğrudan tetiklemeler için.
 * needs_session_data=true ise aktif tablo satırları otomatik eklenir.
 * Dönüş: ham skill sonucu (örn. {file_path, ...}) veya hata.
 */
export async function invokeSkillDirect(
  fnName: string,
  args: Record<string, any> = {}
): Promise<{ ok: boolean; result?: Record<string, any>; error?: string }> {
  const skills = useAgentBridgeStore.getState().skills;
  let needsSession = false;
  let found = false;
  for (const s of skills) {
    const f = s.functions.find((x) => x.name === fnName);
    if (f) {
      found = true;
      needsSession = f.needs_session_data;
      break;
    }
  }
  if (!found) {
    return { ok: false, error: `Skill fonksiyonu bulunamadı: ${fnName}` };
  }

  if (!needsSession) {
    return await callBridge(fnName, null, args);
  }

  const table = await resolveActiveTable(args?.table);
  if (!table) {
    return { ok: false, error: "Aktif rapor tablosu bulunamadı." };
  }
  let rows: Record<string, unknown>[];
  try {
    const escaped = `"${String(table).replace(/"/g, '""')}"`;
    rows = await duckDbClient.executeCustomSql(`SELECT * FROM ${escaped} LIMIT ${MAX_EXPORT_ROWS}`);
  } catch (err: any) {
    return { ok: false, error: `Tablo okunamadı (${table}): ${err?.message || err}` };
  }
  if (!rows.length) {
    return { ok: false, error: `"${table}" tablosu boş.` };
  }

  const { table: _ignored, ...skillArgs } = args;
  return await callBridge(fnName, rows, skillArgs);
}

function toToolParameters(fn: SkillFunctionInfo): ToolDefinition["parameters"] {
  // Sidecar TOOL.parameters JSON-Schema'dır; ToolParameter'a çevir
  const schema = (fn as any).parameters || {};
  const props = schema.properties || {};
  const required: string[] = Array.isArray(schema.required) ? schema.required : [];
  const properties: Record<string, ToolParameter> = {};
  for (const [key, raw] of Object.entries(props) as [string, any]) {
    const t = ["string", "number", "boolean", "object", "array"].includes(raw?.type)
      ? (raw.type === "boolean" ? "boolean" : raw.type === "object" ? "object" : raw.type === "array" ? "array" : raw.type === "number" ? "number" : "string")
      : "string";
    properties[key] = {
      type: t as ToolParameter["type"],
      description: raw?.description || "",
      ...(Array.isArray(raw?.enum) ? { enum: raw.enum } : {}),
      ...(required.includes(key) ? { required: true } : {}),
    };
  }
  return { type: "object", properties };
}

/** skills_list event'inde bridged skill'leri toolRegistry ile senkronlar. */
export function syncSkillsTools(
  skills: Array<{ folder: string; functions: SkillFunctionInfo[] }>
): void {
  skillUnregisters.forEach((unregister) => unregister());
  skillUnregisters.clear();

  for (const skill of skills) {
    for (const fn of skill.functions) {
      if (!fn.needs_session_data) continue; // internal skill'ler agent içinde çalışıyor
      const def: ToolDefinition = {
        name: fn.name,
        description:
          fn.description +
          " (Aktif raporun satırları otomatik alınır ve skill'e gönderilir.)",
        parameters: toToolParameters(fn),
        scope: { type: "global" },
        // Sonuç grid'i açıkken bile export vb. skill'ler filter_active_grid'e ezilmez
        skill: true,
        ai: { aliases: [skill.folder.replace(/_/g, " ")] },
        execute: (args: Record<string, any>) => executeBridgedSkill(fn, args),
      };
      skillUnregisters.set(fn.name, toolRegistry.register(def));
    }
  }
}
