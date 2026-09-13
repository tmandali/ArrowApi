import { useYulaGridStore } from "@/lib/stores/grid";
import { extractJobIdFromHref } from "@/lib/workspace-paths";
import { resolveActiveViewReferences } from "@/lib/sql-guard";

/**
 * Paylaşılan grid veri-kümesi altyapısı — tüm istemci araç katmanlarının
 * ortak zemini (Aktif tablo çözümü, self-heal, streaming kontrolü,
 * özel görünüm sıfırlama). Davranış `yula-client-tools.ts` ile birebirdir.
 */

export function sqlSafeId(id: string): string {
  return `"${id.replace(/"/g, '""')}"`;
}

/** Aktif grid veri kümesi — özel SQL görünümü varsa onu, yoksa temel tabloyu gösterir. */
export type ActiveDataset = {
  /** Analiz sorgularında FROM'a yazılacak ifade (subquery veya tablo) */
  from: string;
  /** Aktif görünümün kolon adları */
  columns: string[];
  /** Sayısal kolonlar (özel görünümde örnek satır tipinden saptanır) */
  numeric: Set<string>;
  isCustom: boolean;
  tableName: string;
  /** Yalnız temel tablo: şema metası (duckType/tarih tespiti için) */
  described?: Awaited<
    ReturnType<typeof import("@/services/duckdb")["duckDbClient"]["describeTable"]>
  >;
};

/**
 * set_grid_query sonrası "açık tablo" gruplanmış görünüm olduğundan analiz
 * araçları temel tabloyu değil BU kümesini ölçüt almalı; aksi halde
 * SUM("Warehouse") gibi tip uyumsuz sorgular üretilir.
 */
export async function resolveActiveDataset(): Promise<ActiveDataset | null> {
  const spec = await ensureGridSpec();
  if (!spec || spec.columns.length === 0) return null;

  const { duckDbClient } = await import("@/services/duckdb");
  const customSql = useYulaGridStore.getState().customQuerySql;
  if (!customSql) {
    const described = await duckDbClient.describeTable(spec.tableName);
    return {
      from: sqlSafeId(spec.tableName),
      columns: spec.columns,
      numeric: new Set(described.filter((c) => c.isNumeric).map((c) => c.name)),
      isCustom: false,
      tableName: spec.tableName,
      described,
    };
  }

  const resolvedCustomSql = resolveActiveViewReferences(customSql, spec.tableName);
  const from = `(${resolvedCustomSql}) AS __yula_active_view`;
  let numeric = new Set<string>();
  try {
    const probe = await duckDbClient.executeCustomSql(
      `SELECT * FROM ${from} LIMIT 1`
    );
    const row = probe[0];
    if (row) {
      numeric = new Set(
        Object.entries(row)
          .filter(([, v]) => {
            if (typeof v === "number" || typeof v === "bigint") return true;
            return (
              typeof v === "string" &&
              v.trim() !== "" &&
              /^-?\d+(\.\d+)?$/.test(v.trim())
            );
          })
          .map(([k]) => k)
      );
    }
  } catch {
    // Tip saptanamadıysa kolon adından tahmin (total_qty, avg_price vb.)
    numeric = new Set(
      spec.columns.filter((c) =>
        /qty|total|sum|avg|count|amount|price|balance|miktar|tutar|bakiye/i.test(c),
      )
    );
  }
  return { from, columns: spec.columns, numeric, isCustom: true, tableName: spec.tableName };
}

export async function ensureGridSpec(): Promise<
  ReturnType<typeof useYulaGridStore.getState>["spec"]
> {
  const store = useYulaGridStore.getState();
  const href =
    typeof window !== "undefined"
      ? `${window.location.pathname}${window.location.search}`
      : "";
  const jobIdSeg = extractJobIdFromHref(href) ?? "";
  const tableName = jobIdSeg
    ? `report_${jobIdSeg.replace(/[^a-zA-Z0-9_]/g, "_")}`
    : "";

  if (
    store.spec &&
    store.spec.columns.length > 0 &&
    (!tableName || store.spec.tableName === tableName)
  ) {
    return store.spec;
  }

  if (!tableName) return store.spec;

  // Ingest penceresi yarışı: tablo worker'a birkaç yüz ms sonra düşebilir;
  // kısa retry ile o pencereyi kapat.
  const sleep = (ms: number) =>
    new Promise((r) => setTimeout(r, ms));

  try {
    const { duckDbClient } = await import("@/services/duckdb");
    for (let attempt = 0; attempt < 5; attempt++) {
      const cols = await duckDbClient.describeTable(tableName);
      if (cols.length > 0) {
        // Self-heal kaydı ekrandan türetir; rapor varsayımı yazılmaz.
        const { REGISTERED_REPORTS } = await import(
          "@/features/reports/report-registry"
        );
        const pathOnly = href.split("?")[0] || "";
        const regHit = REGISTERED_REPORTS.find((r) =>
          pathOnly.startsWith(r.pagePath),
        );
        store.register({
          tableName,
          title: regHit?.title ?? "Report",
          columns: cols.map((c) => c.name),
          rowCount: null,
          reportScope:
            store.screen?.reportScope ?? regHit?.scope ?? "unknown",
        });
        return useYulaGridStore.getState().spec;
      }
      await sleep(600);
    }
  } catch (err) {
    console.warn("[Yula exec] ensureGridSpec self-heal başarısız:", err);
  }
  return store.spec;
}

export async function gridStillStreaming(tableName: string): Promise<boolean> {
  try {
    const { duckStreamManager } = await import(
      "@/features/jobs/services/duck-stream-manager"
    )
    const jobId = tableName.startsWith("report_")
      ? tableName
          .slice("report_".length)
          .replace(
            /([0-9a-f]{8})_([0-9a-f]{4})_([0-9a-f]{4})_([0-9a-f]{4})_([0-9a-f]{12})/i,
            "$1-$2-$3-$4-$5",
          )
      : tableName
    const state = duckStreamManager.getState(jobId)
    return Boolean(state?.isStreaming || state?.isSavingDisk)
  } catch {
    return false
  }
}

/**
 * Özel SQL görünümünü kaldırıp temel tabloya döner (şema geri yükleme dahil).
 * set_grid_query{reset:true}, gridin "normal görünüme dön" butonu ve
 * "Yeni Sohbet" birlikte kullanır. SADECE customQuerySql'i sıfırlamak
 * YETERLİ DEĞİLDİR: set_grid_query spec.columns'u türetilmiş kolonlarla
 * ezmişti; describeTable ile temel şema + tipler geri yüklenmezse Yula
 * eski (türetilmiş) kolonlara habersizce devam eder.
 */
export async function resetGridCustomView(): Promise<void> {
  const store = useYulaGridStore.getState();
  store.setCustomQuerySql(null);
  store.setFilters({});
  store.runtimeApi?.setSort(null, null);
  store.runtimeApi?.clearAll();
  const spec = store.spec;
  if (!spec) return;
  try {
    const { duckDbClient } = await import("@/services/duckdb");
    const { deriveColumnKind } = await import(
      "@/features/jobs/lib/column-type-utils"
    );
    const base = await duckDbClient.describeTable(spec.tableName);
    if (base.length > 0) {
      store.register({
        ...spec,
        columns: base.map((c) => c.name),
        // Tipler DESCRIBE'dan (yetkili kaynak); örnek veriler/sözlük temizlenir
        columnTypes: Object.fromEntries(
          base.map((c) => [
            c.name,
            deriveColumnKind(c.duckType, c.isNumeric),
          ]),
        ),
        sampleRows: undefined,
        columnValues: undefined,
      });
    }
  } catch {
    // şema geri yükleme başarısız olsa da görünüm zaten sıfırlandı
  }
}
