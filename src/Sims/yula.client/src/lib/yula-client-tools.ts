import { useYulaGridStore } from "@/lib/stores/grid"
import { useUserSkillsStore } from "@/lib/stores/user-skills"
import { BUILT_IN_USER_SKILLS } from "@/lib/built-in-skills"
import { buildUserSkillPrompt } from "@/lib/yula-user-skill"
import { findReport } from "@/features/reports/report-registry"
import { readReportAiMetadata, readCriteriaAiMetadata } from "@/lib/report-ai-metadata";
import { guardReadOnlySelect, resolveActiveViewReferences, normalizeQueryForStorage, PORTABLE_TABLE_PLACEHOLDER } from "@/lib/sql-guard";
import { extractJobIdFromHref, isReportResultPath, isReportResultView } from "@/lib/workspace-paths";
import { focusReportExecution, reportExecutionHref } from "@/lib/report-run-bus";
import {
  isCriteriaMatch,
  normalizeCriteria,
  normalizeCriteriaValue,
} from "@/lib/criteria-match";
import {
  buildChartQuery,
  inferChartOrderMode,
  type ChartOrderMode,
} from "@/lib/chart-query";

/**
 * İstemci tarafı araç yürütücüleri — kullanıcının etkileşimiyle ya da
 * modelin dynamic-tool çağrısıyla çalışır, çıktı akışa geri verilir.
 */

function sqlSafeId(id: string): string {
  return `"${id.replace(/"/g, '""')}"`;
}

/** Aktif grid veri kümesi — özel SQL görünümü varsa onu, yoksa temel tabloyu gösterir. */
type ActiveDataset = {
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
async function resolveActiveDataset(): Promise<ActiveDataset | null> {
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

async function ensureGridSpec(): Promise<
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
        store.register({
          tableName,
          title: "Stok Bakiye Raporu",
          columns: cols.map((c) => c.name),
          rowCount: null,
          reportScope: "stock-balance",
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

async function gridStillStreaming(tableName: string): Promise<boolean> {
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

async function analyzeGrid(
  input: Record<string, unknown>,
): Promise<unknown> {
  const ds = await resolveActiveDataset();
  if (!ds) {
    return {
      status: "error",
      error: "Açık tablo yok.",
      hint: "Sonuç tablosu henüz yüklenmedi; birkaç saniye sonra tekrar deneyin.",
    };
  }

  const op = String(input.operation ?? "count");
  const column =
    typeof input.column === "string" ? input.column : undefined;
  const byColumn =
    typeof input.byColumn === "string" ? input.byColumn : undefined;
  const topN = Number(input.topN ?? 5);

  try {
    if (await gridStillStreaming(ds.tableName)) {
      return {
        status: "error",
        error: "Rapor hâlâ DuckDB'ye yükleniyor.",
        hint: "Yükleme bitince 'analiz et'i tekrar gönder.",
      };
    }

    const { duckDbClient } = await import("@/services/duckdb");
    const tableLabel = ds.isCustom ? "(aktif özel görünüm)" : ds.tableName;

    if (op === "count") {
      if (byColumn && ds.columns.includes(byColumn)) {
        const gcol = sqlSafeId(byColumn);
        const limitN = Math.max(1, Math.min(50, topN));
        const rows = await duckDbClient.executeCustomSql(
          `SELECT ${gcol} AS label, COUNT(*) AS value FROM ${ds.from} GROUP BY ${gcol} ORDER BY value DESC LIMIT ${limitN}`,
        );
        return {
          status: "ok",
          operation: "count-by",
          table: tableLabel,
          byColumn,
          items: rows.map((r) => ({
            label: String(r.label ?? ""),
            value: Number(r.value ?? 0),
          })),
        };
      }
      const countExpr =
        column && ds.columns.includes(column)
          ? `COUNT(${sqlSafeId(column)})`
          : "COUNT(*)";
      const rows = await duckDbClient.executeCustomSql(
        `SELECT ${countExpr} AS cnt FROM ${ds.from}`,
      );
      return {
        status: "ok",
        operation: "count",
        table: tableLabel,
        column,
        count: Number(rows[0]?.cnt ?? 0),
      };
    }

    if (!column || !ds.columns.includes(column)) {
      return {
        status: "error",
        error: `Invalid column: ${String(column)}`,
        availableColumns: ds.columns,
        numericColumns: [...ds.numeric],
        hint: "Select a column from availableColumns; numericColumns required for sum/avg.",
      };
    }

    // Sayısal olmayan kolonda top istendiyse: en sık geçen değerlerin sayımı (frekans analizi)
    if (!ds.numeric.has(column)) {
      if (op === "top") {
        const col = sqlSafeId(column);
        const limitN = Math.max(1, Math.min(10, topN));
        const rows = await duckDbClient.executeCustomSql(
          `SELECT ${col} AS label, COUNT(*) AS value FROM ${ds.from} GROUP BY ${col} ORDER BY value DESC LIMIT ${limitN}`,
        );
        return {
          status: "ok",
          operation: "top-count",
          table: tableLabel,
          column,
          items: rows.map((r) => ({
            label: String(r.label ?? ""),
            value: Number(r.value ?? 0),
          })),
        };
      }
      return {
        status: "error",
        error: `"${column}" is not a numeric column; SUM/AVG cannot be applied.`,
        numericColumns: [...ds.numeric],
        hint: "Retry calling this tool with a column from numericColumns.",
      };
    }
    const col = sqlSafeId(column);

    if (op === "sum" || op === "avg" || op === "min" || op === "max") {
      // byColumn verildiyse gruplu döndür (örn. depo bazlı toplam)
      if (byColumn && ds.columns.includes(byColumn)) {
        const gcol = sqlSafeId(byColumn);
        const rows = await duckDbClient.executeCustomSql(
          `SELECT ${gcol} AS label, ROUND(${op.toUpperCase()}(${col}), 2) AS value FROM ${ds.from} GROUP BY ${gcol} ORDER BY value DESC LIMIT ${Math.max(1, Math.min(10, topN))}`,
        );
        return {
          status: "ok",
          operation: `${op}-by`,
          table: tableLabel,
          column,
          byColumn,
          items: rows.map((r) => ({
            label: String(r.label ?? ""),
            value: Number(r.value ?? 0),
          })),
        };
      }

      const rows = await duckDbClient.executeCustomSql(
        `SELECT ${op.toUpperCase()}(${col}) AS value FROM ${ds.from}`,
      );
      return {
        status: "ok",
        operation: op,
        table: tableLabel,
        column,
        value: Number(rows[0]?.value ?? 0),
      };
    }

    // top: grup kolonu metin tercihli; ölçü kolonu zaten sayısal doğrulandı.
    // byColumn verilmediyse kör "ilk metin kolon" yerine kategori kolonu seç:
    // Id gibi benzersiz kimlik kolonları (ilk değerleri düz sayı) asla gruplanmaz.
    const { looksLikeIdentifierValues } = await import("@/lib/grid-column-values")
    const columnValues = useYulaGridStore.getState().spec?.columnValues
    const groupCol =
      byColumn && ds.columns.includes(byColumn)
        ? byColumn
        : ds.columns.find(
            (c) =>
              c !== column &&
              !ds.numeric.has(c) &&
              !looksLikeIdentifierValues(columnValues?.[c]),
          ) ||
          ds.columns.find((c) => c !== column && !ds.numeric.has(c)) ||
          column;
    const gcol = sqlSafeId(groupCol);
    const rows = await duckDbClient.executeCustomSql(
      `SELECT ${gcol} AS label, SUM(${col}) AS value FROM ${ds.from} GROUP BY ${gcol} ORDER BY value DESC LIMIT ${Math.max(1, Math.min(10, topN))}`,
    );
    return {
      status: "ok",
      operation: "top",
      table: tableLabel,
      column,
      byColumn: groupCol,
      items: rows.map((r) => ({
        label: String(r.label ?? ""),
        value: Number(r.value ?? 0),
      })),
    };
  } catch (err) {
    return {
      status: "error",
      error: err instanceof Error ? err.message : String(err),
      availableColumns: ds.columns,
      numericColumns: [...ds.numeric],
      hint: "Fix the query using this column list and retry.",
    };
  }
}

/** duckType + isNumeric kanıtından profil kategori sınıfı türetir (şema-sürümlü). */
type ProfileColumnKind = "numeric" | "text" | "date" | "boolean" | "other"

function classifyDuckType(
  duckType: string | undefined,
  isNumeric: boolean
): ProfileColumnKind {
  const t = (duckType ?? "").toLowerCase()
  if (/bool/.test(t)) return "boolean"
  if (/timestamp|date/.test(t)) return "date"
  if (isNumeric || /int|decimal|double|float|real|numeric|hugeint/.test(t)) {
    return "numeric"
  }
  if (/varchar|char|text|string|enum|uuid/.test(t)) return "text"
  return isNumeric ? "numeric" : "text"
}

function sqlAlias(col: string): string {
  return `__c_${col.replace(/[^a-zA-Z0-9_]/g, "_")}`
}

/**
 * SQL Expert profillemesi — açık tabloyu tek aggregate geçişiyle tarar:
 * satır sayısı, null oranı, kardinalite, sayısal min/max/avg/sum/negatif,
 * metin kolonları için en sık 3 değer. Aktif grid filtreleri WHERE olarak uygulanır.
 */
async function profileGrid(): Promise<unknown> {
  const ds = await resolveActiveDataset()
  if (!ds) {
    return {
      status: "error",
      error: "No active table found.",
      hint: "Results table is not ready yet; please wait a moment and try again.",
    }
  }

  try {
    if (await gridStillStreaming(ds.tableName)) {
      return {
        status: "error",
        error: "Report data is still streaming to DuckDB.",
        hint: "Wait until loading finishes and retry.",
      }
    }

    const { duckDbClient } = await import("@/services/duckdb")
    const { buildCombinedWhereClause } = await import(
      "@/services/duckdb/filter-parser"
    )
    const filters = useYulaGridStore.getState().filters
    const where = buildCombinedWhereClause(filters, ds.numeric)

    // Kolon tipleri: temel tabloda şemasından (tarih/bool dahil),
    // özel görünümde örnek satır tipinden (numeric/text) türetilir.
    const kindOf = (name: string): ProfileColumnKind => {
      const meta = ds.described?.find((c) => c.name === name)
      if (meta) return classifyDuckType(meta.duckType, meta.isNumeric)
      return ds.numeric.has(name) ? "numeric" : "text"
    }

    const aggParts: string[] = ["COUNT(*) AS __row_count"]
    for (const col of ds.columns) {
      const q = sqlSafeId(col)
      const a = sqlAlias(col)
      const kind = kindOf(col)
      aggParts.push(`SUM(CASE WHEN ${q} IS NULL THEN 1 ELSE 0 END) AS ${a}_nulls`)
      // COUNT(DISTINCT) WASM'de geniş tablolarda dakikalar sürebilir; HyperLogLog yeter.
      aggParts.push(`approx_count_distinct(${q}) AS ${a}_distinct`)
      if (kind === "numeric") {
        aggParts.push(
          `MIN(${q}) AS ${a}_min, MAX(${q}) AS ${a}_max, ROUND(AVG(${q}), 4) AS ${a}_avg, ROUND(SUM(${q}), 4) AS ${a}_sum, SUM(CASE WHEN ${q} < 0 THEN 1 ELSE 0 END) AS ${a}_negative`
        )
      } else if (kind === "date") {
        aggParts.push(
          `CAST(MIN(${q}) AS VARCHAR) AS ${a}_min, CAST(MAX(${q}) AS VARCHAR) AS ${a}_max`
        )
      }
    }

    const aggRows = await duckDbClient.executeCustomSql(
      `SELECT ${aggParts.join(", ")} FROM ${ds.from} ${where}`
    )
    const agg = aggRows[0] ?? {}

    // Top değerler — örneklem üzerinden (tam tarama yerine); en fazla 4 metin kolon
    const textCols = ds.columns
      .filter((col) => kindOf(col) === "text")
      .slice(0, 4)
    const topValuesByColumn: Record<string, { value: string; count: number }[]> =
      {}
    for (const col of textCols) {
      const q = sqlSafeId(col)
      try {
        const rows = await duckDbClient.executeCustomSql(
          `SELECT CAST(${q} AS VARCHAR) AS value, COUNT(*) AS cnt FROM (SELECT * FROM (SELECT * FROM ${ds.from} ${where}) AS __yula_profile_filtered USING SAMPLE 10% (bernoulli)) AS __yula_profile_sample GROUP BY 1 ORDER BY cnt DESC LIMIT 3`,
        )
        topValuesByColumn[col] = rows.map((r) => ({
          value: String(r.value ?? ""),
          count: Number(r.cnt ?? 0),
        }))
      } catch (err) {
        console.warn(`[Yula exec] profil top-values hatası (${col}):`, err)
      }
    }

    const columns = ds.columns.map((col) => {
      const a = sqlAlias(col)
      const kind = kindOf(col)
      const entry: Record<string, unknown> = {
        name: col,
        kind,
        nullCount: Number(agg[`${a}_nulls`] ?? 0),
        distinctCount: Number(agg[`${a}_distinct`] ?? 0),
      }
      if (kind === "numeric") {
        entry.numeric = {
          min: agg[`${a}_min`] ?? null,
          max: agg[`${a}_max`] ?? null,
          avg: agg[`${a}_avg`] ?? null,
          sum: agg[`${a}_sum`] ?? null,
          negativeCount: Number(agg[`${a}_negative`] ?? 0),
        }
      } else if (kind === "date") {
        entry.dateRange = {
          min: agg[`${a}_min`] ?? null,
          max: agg[`${a}_max`] ?? null,
        }
      }
      if (topValuesByColumn[col]) {
        entry.topValues = topValuesByColumn[col]
      }
      return entry
    })

    const filterSummary = Object.entries(filters)
      .filter(([, v]) => v && String(v).trim())
      .map(([k, v]) => `${k}=${v}`)

    return {
      status: "ok",
      table: ds.tableName,
      view: ds.isCustom ? "custom" : "base",
      rowCount: Number(agg.__row_count ?? 0),
      filtersApplied: filterSummary,
      columns,
      note: "Table profiling results above (cardinality approximate; top values sampled). Provide a clear and comprehensive summary in the user's language based on these findings. Do not call another tool.",
    }
  } catch (err) {
    return {
      status: "error",
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

/**
 * get_report_schema — aktif raporun JSON şemasını yetkili kaynaktan döndürür
 * (kriter alanları + kolon tanımları + üstveri). Model çıktıyı markdown tablo
 * olarak özetler; kriter alan adları run_job criteria'sında aynen kullanılır.
 */
async function getReportSchema(): Promise<unknown> {
  const storeState = useYulaGridStore.getState()
  const spec = storeState.spec
  const screen = storeState.screen
  const pathname = typeof window !== "undefined" ? window.location.pathname : ""
  const scope =
    spec?.reportScope ||
    screen?.reportScope ||
    (pathname.includes("/stock/stock-balance") ? "stock-balance" : undefined)
  const report = scope ? findReport(scope) : undefined
  if (!report) {
    return {
      status: "error",
      error: "Active report schema not found.",
      hint: "Try again when a report criteria or results screen is open.",
    }
  }

  const isGuidPath = isReportResultPath(pathname) || Boolean(spec?.tableName && spec.tableName.startsWith("report_"))
  const isViewingResults = isReportResultView(pathname, spec)

  const meta = readReportAiMetadata(report.fullSchema)
  const required = new Set(report.fullSchema.required ?? [])
  const criteria = Object.entries(report.fullSchema.properties ?? {}).map(
    ([name, prop]) => {
      const ai = readCriteriaAiMetadata(prop)
      return {
        name,
        title: prop.title ?? name,
        type: Array.isArray(prop.type) ? prop.type.join("|") : prop.type,
        required: required.has(name),
        options: Array.isArray(prop.enum)
          ? prop.enum.map((o) => String(o))
          : undefined,
        description:
          typeof prop.description === "string" ? prop.description : undefined,
        dateBehavior: ai.dateBehavior,
      }
    },
  )

  return {
    status: "ok",
    report: {
      scope: report.scope,
      title: report.title,
      pagePath: report.pagePath,
      mode: isGuidPath ? "view" : "criteria",
      isViewingResults,
    },
    activeGrid: isViewingResults && spec
      ? {
          tableName: spec.tableName,
          title: spec.title,
          columns: spec.columns,
          rowCount: spec.rowCount,
          columnTypes: spec.columnTypes,
          sampleRows: spec.sampleRows ? spec.sampleRows.slice(0, 10) : undefined,
          columnValues: spec.columnValues,
        }
      : undefined,
    criteria,
    columnDescriptions: meta.columnDescriptions,
    aliases: meta.aliases,
    directive: isGuidPath
      ? "User is viewing execution results. When asked about this report, primarily explain the active results table, its columns, row count, and data content. Only mention criteria options if the user asks to run a new report."
      : "User is on the report criteria screen. Summarize the purpose of the report and its configurable criteria fields in a markdown table.",
  }
}

/**
 * SQL Expert sorgu yürütme — modelin yazdığı TEK salt-okunur SELECT'i
 * guard'dan geçirip DuckDB'de çalıştırır; ilk 10 satırı modele döner.
 */
async function runExpertSql(
  input: Record<string, unknown>
): Promise<unknown> {
  const spec = await ensureGridSpec()
  if (!spec || spec.columns.length === 0) {
    return {
      status: "error",
      error: "No active table found.",
      hint: "Results table is not ready yet; please wait a moment and try again.",
    }
  }

  const rawSql = typeof input.sql === "string" ? input.sql : ""
  const guard = guardReadOnlySelect(rawSql)
  if (!guard.ok) {
    return { status: "error", error: guard.error, hint: guard.hint }
  }

  try {
    const { duckDbClient } = await import("@/services/duckdb")
    const rows = await duckDbClient.executeCustomSql(guard.sql)
    const MAX_OUTPUT_ROWS = 10
    // silent = keşif/doğrulama sorgusu: ekrana tablo kartı basılmaz,
    // çıktı yine de MODELE tam döner.
    return {
      status: "ok",
      rowCount: rows.length,
      note: guard.limited
        ? `LIMIT was automatically applied; returning first ${MAX_OUTPUT_ROWS} sample rows to context.`
        : `Returning first ${MAX_OUTPUT_ROWS} sample rows to context.`,
      rows: rows.slice(0, MAX_OUTPUT_ROWS),
    }
  } catch (err) {
    return {
      status: "error",
      error: err instanceof Error ? err.message : String(err),
      hint: `Check SQL syntax and column names. Available columns: ${spec.columns.join(", ")}`,
    }
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

/**
 * set_grid_query — modelin yazdığı salt-okunur SELECT'i guard'dan geçirip
 * DuckDB'de koşar ve gridi bu sonuç kümesiyle yeniler (gruplama/aggregate
 * görünümleri). reset:true → temel tablo görünümüne dönüş.
 */
async function setGridQuery(
  input: Record<string, unknown>
): Promise<unknown> {
  const store = useYulaGridStore.getState();
  const spec = await ensureGridSpec();
  if (!spec || spec.columns.length === 0) {
    return {
      status: "error",
      error: "No active table found.",
      hint: "Results table is not ready yet; please wait a moment and try again.",
    };
  }

  // ÖNCELİK: dolu sql HER ZAMAN kazanç — model "reset + sql"i birlikte
  // gönderirse sql'e uygulanan reset yerine sorgu uygulanır (aksi halde
  // model niyeti gerçekleşmeyince aynı çağrıyı tekrarlamak zorunda kalır).
  // reset:true yalnız sql yokken anlamlıdır.
  const hasSql = typeof input.sql === "string" && input.sql.trim().length > 0;

  if (!hasSql) {
    if (input.reset === true) {
      await resetGridCustomView();
      return {
        status: "ok",
        reset: true,
        message: "Custom query removed; restored base table view.",
      };
    }
    return {
      status: "error",
      error: "SQL query is required for set_grid_query.",
      hint: 'Provide an SQL query for the new view, or {"reset": true} to return to base table.',
    };
  }

  // Grid görünümü TÜM grupları göstermeli: model run_expert_sql alışkanlığıyla
  // LIMIT 50 gibi bir sınır yazarsa soyulur; güvenlik sınırını guard ekler.
  const cleanedSql = (input.sql as string).replace(/\s+LIMIT\s+\d+\s*$/i, "").trim();
  const guard = guardReadOnlySelect(cleanedSql, 0);
  if (!guard.ok) {
    return { status: "error", error: guard.error, hint: guard.hint };
  }

  // Sorgu açık tabloya veya PORTABLE_TABLE_PLACEHOLDER'a referans vermeli
  const referencesTable =
    new RegExp(spec.tableName, "i").test(guard.sql) ||
    new RegExp(`\\b${PORTABLE_TABLE_PLACEHOLDER}\\b`, "i").test(guard.sql);
  if (!referencesTable) {
    return {
      status: "error",
      error: `Query does not reference the open table (${spec.tableName}) or ${PORTABLE_TABLE_PLACEHOLDER}.`,
      hint: `Use ${spec.tableName} or ${PORTABLE_TABLE_PLACEHOLDER} in FROM/JOIN clauses.`,
    };
  }

  try {
    const { duckDbClient } = await import("@/services/duckdb");
    const resolvedSql = resolveActiveViewReferences(guard.sql, spec.tableName);
    const rows = await duckDbClient.executeCustomSql(resolvedSql);
    const first = rows[0] as Record<string, unknown> | undefined;
    const columns = first ? Object.keys(first) : [];
    const title = typeof input.title === "string" && input.title.trim()
      ? input.title.trim()
      : null;
    // Fiziksel tablo adını 'active_view' yer tutucusuyla normalize ederek sakla.
    // Bu sayede aynı sorgu farklı iş ID'leri (farklı tablo adları) ile açıldığında
    // Catalog Error vermeden çalışmaya devam eder.
    const portableSql = normalizeQueryForStorage(guard.sql, spec.tableName);
    store.setCustomQuerySql(portableSql, title);
    // Bağlam zarfı ve sonraki araç çağrıları türetilmiş kolonları görsün
    if (columns.length > 0) {
      store.register({ ...spec, title: title ?? spec.title, columns });
    }
    return {
      status: "ok",
      sql: portableSql,
      title: title ?? spec.title,
      rowCount: rows.length,
      columns,
      message: `Grid view updated to "${title ?? spec.title}" (${rows.length} rows).`,
    };
  } catch (err) {
    return {
      status: "error",
      error: err instanceof Error ? err.message : String(err),
      hint: `Check SQL syntax and column names. Available columns: ${spec.columns.join(", ")}`,
    };
  }
}

/**
 * visualize_grid_data — modelin ürettiği grafik KONFİGÜRASYONUNU deterministik
 * aggregasyonuyla veriye çevirir. Model satır verisi taşımaz; kart
 * dönen gerçek satırlardan çizilir (transkripsiyon hatası imkânsızlaşır).
 */
async function visualizeGrid(
  input: Record<string, unknown>,
): Promise<unknown> {
  const ds = await resolveActiveDataset();
  if (!ds) {
    return {
      status: "error",
      error: "No active table found.",
      hint: "Results table is not ready yet; please wait a moment and try again.",
    };
  }

  const chartType = String(input.chartType ?? "bar");
  if (!["bar", "line", "pie"].includes(chartType)) {
    return {
      status: "error",
      error: `Invalid chart type: ${chartType}`,
      hint: "chartType must be bar | line | pie.",
    };
  }

  // Yeni kontrat: dimensionX/dimensionY. Eski konuşma geçmişi için
  // labelKey/valueKeys toleransı korunur.
  const labelKey = String(input.dimensionX ?? input.labelKey ?? "").trim();
  const valueKeys = (
    Array.isArray(input.dimensionY)
      ? input.dimensionY
      : typeof input.dimensionY === "string"
        ? [input.dimensionY]
        : Array.isArray(input.valueKeys)
          ? input.valueKeys
          : []
  ).map(String);
  const aggregation = (["sum", "avg", "min", "max", "count"] as const).includes(
    input.aggregation as "sum",
  )
    ? (input.aggregation as "sum" | "avg" | "min" | "max" | "count")
    : "sum";

  if (!labelKey || !ds.columns.includes(labelKey)) {
    return {
      status: "error",
      error: `Invalid category column: ${labelKey}`,
      availableColumns: ds.columns,
      hint: "dimensionX must be a text column from availableColumns.",
    };
  }

  const invalid = valueKeys.filter((k) => !ds.columns.includes(k));
  if (aggregation !== "count" && (valueKeys.length === 0 || invalid.length > 0)) {
    return {
      status: "error",
      error:
        invalid.length > 0
          ? `Invalid metric column(s): ${invalid.join(", ")}`
          : "dimensionY cannot be empty.",
      numericColumns: [...ds.numeric],
      hint: "dimensionY must be numeric column(s) from numericColumns.",
    };
  }
  const nonNumeric = valueKeys.filter((k) => !ds.numeric.has(k));
  if (nonNumeric.length > 0) {
    return {
      status: "error",
      error: `Non-numeric metric column(s): ${nonNumeric.join(", ")}`,
      numericColumns: [...ds.numeric],
      hint: "Retry calling this tool with columns from numericColumns.",
    };
  }

  // count → ölçü kolonu gerekmez; kart tek "Kayıt" serisi görür
  const seriesNames =
    aggregation === "count" && valueKeys.length === 0
      ? ["Records"]
      : valueKeys;

  const titleHint =
    typeof input.title === "string" ? input.title : undefined;
  const descriptionHint =
    typeof input.description === "string" ? input.description : undefined;
  const takeawayHint =
    typeof input.takeaway === "string" ? input.takeaway : undefined;
  const orderMode: ChartOrderMode = inferChartOrderMode(
    typeof input.orderMode === "string" ? input.orderMode : undefined,
    {
      title: titleHint,
      description: descriptionHint,
      takeaway: takeawayHint,
    },
  );

  // Aktif grid sırası — "ilk N" (appearance) dilimlerini grid ORDER BY ile hizala.
  // Sıralama yoksa appearanceOrderBy boş bırakılır; ROW_NUMBER kaynak/tarama
  // sırasını (active_view) kullanır — alfabetik dayatma yok.
  let appearanceOrderBy: string | undefined;
  if (orderMode === "appearance") {
    const snap = useYulaGridStore.getState().runtimeApi?.getGridState?.();
    if (snap?.sortBy && ds.columns.includes(snap.sortBy)) {
      appearanceOrderBy = `${sqlSafeId(snap.sortBy)} ${snap.sortDesc ? "DESC" : "ASC"}`;
    }
  }

  // Mümkünse süzülmüş/sıralı active_view üzerinden çiz (ham tablo değil)
  let fromExpr = ds.from;
  const viewName = useYulaGridStore.getState().spec?.activeViewName?.trim();
  if (viewName && !ds.isCustom) {
    fromExpr = sqlSafeId(viewName);
  }

  const sql = buildChartQuery({
    fromExpr,
    labelKey,
    valueKeys: aggregation === "count" ? [] : valueKeys,
    aggregation,
    limit: typeof input.limit === "number" ? input.limit : undefined,
    orderMode,
    appearanceOrderBy,
  });
  if (!sql) {
    return { status: "error", error: "Failed to generate chart query." };
  }

  try {
    const { duckDbClient } = await import("@/services/duckdb");
    let rows: Record<string, unknown>[];
    try {
      rows = await duckDbClient.executeCustomSql(sql);
    } catch (viewErr) {
      // active_view henüz yoksa temel FROM'a düş
      if (fromExpr !== ds.from) {
        const fallbackSql = buildChartQuery({
          fromExpr: ds.from,
          labelKey,
          valueKeys: aggregation === "count" ? [] : valueKeys,
          aggregation,
          limit: typeof input.limit === "number" ? input.limit : undefined,
          orderMode,
          appearanceOrderBy,
        });
        if (!fallbackSql) throw viewErr;
        rows = await duckDbClient.executeCustomSql(fallbackSql);
      } else {
        throw viewErr;
      }
    }
    if (rows.length === 0) {
      return {
        status: "error",
        error: "Query returned empty results; try different columns.",
      };
    }
    return {
      status: "ok",
      sql,
      chart: {
        chartType,
        title:
          typeof input.title === "string" && input.title.trim()
            ? input.title.trim()
            : `${labelKey} chart`,
        description:
          typeof input.description === "string" ? input.description : undefined,
        takeaway:
          typeof input.takeaway === "string" ? input.takeaway : undefined,
        dimensionX: labelKey,
        dimensionY: seriesNames,
        aggregation,
        orderMode,
      },
      rowCount: rows.length,
      rows,
    };
  } catch (err) {
    return {
      status: "error",
      error: err instanceof Error ? err.message : String(err),
      hint: "Check column types; use numeric metric columns.",
    };
  }
}

/** "qty"/"miktar" gibi takma adları gerçek kolona gevşekçe eşler */function resolveFieldLoose(
  field: string,
  columns: string[],
): string | undefined {
  const f = field.toLowerCase().trim();
  if (columns.includes(field)) return field;
  const direct = columns.find((c) => c.toLowerCase() === f);
  if (direct) return direct;
  const partial = columns.filter((c) => c.toLowerCase().includes(f));
  if (partial.length === 1) return partial[0];
  return undefined;
}

async function applyFilter(
  field: string,
  value: string,
  op: string,
): Promise<unknown> {
  const store = useYulaGridStore.getState();
  let spec = await ensureGridSpec();

  if (field === "*") {
    store.runtimeApi?.clearAll();
    store.setFilters({});
    return {
      status: "ok",
      clearedAll: true,
      message:
        "Tüm filtreler temizlendi; tablo tam veri kümesine döndürülüyor.",
    };
  }

  if (!spec) {
    return { status: "error", error: "Açık tablo yok." };
  }

  let resolved = resolveFieldLoose(field, spec.columns) ?? undefined;
  let viewReset = false;

  // İstenen kolon ÖZEL GÖRÜNÜMDE (gruplama/aggregate) yoksa: görünüme filtre
  // yapıştırmanın anlamı yok (o kolonun hücresi bile görünmez). Temel tabloya
  // dönüp filtrelemek kullanıcının niyetidir (örn. özel özet görünümdeyken
  // "BATCH-007 filtrele" → temel kayıtlar istenir).
  const customActive = !!useYulaGridStore.getState().customQuerySql;
  if ((!resolved || !spec.columns.includes(resolved)) && customActive) {
    await resetGridCustomView();
    spec = (await ensureGridSpec()) ?? spec;
    resolved = resolveFieldLoose(field, spec.columns) ?? undefined;
    viewReset = !!resolved;
  }

  if (!resolved || !spec.columns.includes(resolved)) {
    return {
      status: "error",
      error: `Filtre için geçersiz kolon: ${field}`,
      availableColumns: spec.columns,
    };
  }
  field = resolved;

  let mapped = value.trim();

  // Deterministik boş/dolu op'ları → D365 karşılıkları ("boş olanlar" vaka çözümü):
  //   op:"empty"    → "''"    (NULL veya boş metin)
  //   op:"notEmpty" → "<>''"  (dolu kayıtlar)
  // NOT: value:"" (gerçekten boş string) hâlâ "filtre kaldır" demektir.
  if (op === "empty") mapped = "''";
  else if (op === "notEmpty") mapped = "<>''";

  if (mapped === "") {
    const next = { ...store.filters };
    delete next[resolved];
    store.setFilters(next);
    return {
      status: "ok",
      removedFilter: field,
      message: `${field} filtresi kaldırıldı.`,
    };
  }

  // D365 ifadesi mi? → OLDUĞU GİBİ geç (grid parser tam kuralları bilir)
  const isD365 =
    /[><=|&!*@]/.test(mapped) ||
    mapped.includes("..") ||
    mapped === "''" ||
    mapped === '""' ||
    mapped === "<>''";

  if (!isD365) {
    if (op === "contains") mapped = `%${mapped}%`;
    else if (op === "gt") mapped = `>${mapped}`;
    else if (op === "lt") mapped = `<${mapped}`;
  }

  // 1) Gridin gerçek filtre hücresini güncelle. runtimeApi YOKSA grid bağlı
  //    değildir: mağaza aynasına tek başına yazmak "filtre uygulandı" yalanı
  //    üretir (araç ok der ama hücre/query güncellenmez) → dürüst hata dön.
  const runtimeApi = store.runtimeApi;
  if (!runtimeApi) {
    console.warn(
      "[Yula filter] runtimeApi yok — grid bağlantısı kapalı; filtre uygulanamadı:",
      resolved,
      mapped,
    );
    return {
      status: "error",
      error: "Açık grid bulunamadı; filtre uygulanamadı.",
      hint: "Rapor sonuç ekranı açıkken tekrar deneyin.",
    };
  }
  runtimeApi.applyFilter(resolved, mapped);
  // 2) Mağaza aynası güncel kalsın (bağlam zarfı kaynağı)
  store.setFilters((prev) => ({ ...prev, [resolved]: mapped }));
  return {
    status: "ok",
    appliedFilter: { field: resolved, op, value },
    viewReset,
    message: `"${field}" → ${resolved} kolonuna filtre uygulandı; tablo yenileniyor.${
      viewReset
        ? " (İstenen kolon önceki gruplama görünümünde olmadığı için temel tabloya dönüldü.)"
        : ""
    }`,
  };
}

async function sortCurrentGrid(
  column: string,
  direction: "asc" | "desc" | "none",
): Promise<unknown> {
  const store = useYulaGridStore.getState();
  const spec = await ensureGridSpec();
  if (!spec) {
    return { status: "error", error: "No active table found." };
  }
  const resolved = resolveFieldLoose(column, spec.columns);
  if (!resolved) {
    return {
      status: "error",
      error: `Invalid column for sorting: ${column}`,
      availableColumns: spec.columns,
    };
  }
  const runtimeApi = store.runtimeApi;
  if (!runtimeApi) {
    return {
      status: "error",
      error: "Active grid not found; could not apply sort.",
      hint: "Try again when report results are open.",
    };
  }
  const dir = direction === "none" ? null : direction;
  runtimeApi.setSort(resolved, dir);
  return {
    status: "ok",
    column: resolved,
    direction,
    message:
      direction === "none"
        ? `Sort cleared for ${resolved}; restored natural order.`
        : `Sorted by ${resolved} in ${direction === "asc" ? "ascending" : "descending"} order.`,
  };
}

async function configureGridColumns(args: {
  visibleColumns?: string[];
  hiddenColumns?: string[];
  order?: string[];
}): Promise<unknown> {
  const store = useYulaGridStore.getState();
  const spec = await ensureGridSpec();
  if (!spec) {
    return { status: "error", error: "No active table found." };
  }
  const runtimeApi = store.runtimeApi;
  if (!runtimeApi) {
    return {
      status: "error",
      error: "Active grid not found.",
      hint: "Try again when report results are open.",
    };
  }

  // visibleColumns varsa: sadece bu kolonlar açık, diğerleri gizli
  if (Array.isArray(args.visibleColumns) && args.visibleColumns.length > 0) {
    const resolvedVisible = args.visibleColumns
      .map((c) => resolveFieldLoose(c, spec.columns))
      .filter((c): c is string => !!c);
    if (resolvedVisible.length === 0) {
      return {
        status: "error",
        error: "None of the specified columns were found in the table.",
        availableColumns: spec.columns,
      };
    }
    runtimeApi.setVisibleColumns(resolvedVisible);
    return {
      status: "ok",
      visibleColumns: resolvedVisible,
      hiddenCount: spec.columns.length - resolvedVisible.length,
      message: `${resolvedVisible.length} column(s) displayed (${spec.columns.length - resolvedVisible.length} hidden).`,
    };
  }

  // hiddenColumns varsa: bu kolonlar gizlenir
  if (Array.isArray(args.hiddenColumns) && args.hiddenColumns.length > 0) {
    const resolvedHidden = args.hiddenColumns
      .map((c) => resolveFieldLoose(c, spec.columns))
      .filter((c): c is string => !!c);
    runtimeApi.setHiddenColumns(resolvedHidden);
    return {
      status: "ok",
      hiddenColumns: resolvedHidden,
      message: `${resolvedHidden.length} column(s) hidden (${resolvedHidden.join(", ")}).`,
    };
  }

  // order varsa: kolon sırası güncellenir
  if (Array.isArray(args.order) && args.order.length > 0) {
    const resolvedOrder = args.order
      .map((c) => resolveFieldLoose(c, spec.columns))
      .filter((c): c is string => !!c);
    runtimeApi.setColumnOrder(resolvedOrder);
    return {
      status: "ok",
      order: resolvedOrder,
      message: "Column display order updated.",
    };
  }

  return {
    status: "ok",
    message: "No changes made (visibleColumns, hiddenColumns, or order not specified).",
  };
}

async function pinGridColumns(columns: string[]): Promise<unknown> {
  const store = useYulaGridStore.getState();
  const spec = await ensureGridSpec();
  if (!spec) {
    return { status: "error", error: "No active table found." };
  }
  const runtimeApi = store.runtimeApi;
  if (!runtimeApi) {
    return {
      status: "error",
      error: "Active grid not found.",
      hint: "Try again when report results are open.",
    };
  }
  const resolved = columns
    .map((c) => resolveFieldLoose(c, spec.columns))
    .filter((c): c is string => !!c);
  if (resolved.length === 0) {
    return {
      status: "error",
      error: "Columns to pin were not found in the table.",
      availableColumns: spec.columns,
    };
  }
  runtimeApi.setPinnedColumns(resolved);
  return {
    status: "ok",
    pinnedColumns: resolved,
    message: `Columns pinned to the left: ${resolved.join(", ")}.`,
  };
}

async function applyGridFiltersMulti(
  filters: Record<string, string>,
  clearOthers = false,
): Promise<unknown> {
  const store = useYulaGridStore.getState();
  const spec = await ensureGridSpec();
  if (!spec) {
    return { status: "error", error: "No active table found." };
  }
  const runtimeApi = store.runtimeApi;
  if (!runtimeApi) {
    return {
      status: "error",
      error: "Active grid not found.",
      hint: "Try again when report results are open.",
    };
  }

  const resolvedFilters: Record<string, string> = {};
  const notFound: string[] = [];

  for (const [col, val] of Object.entries(filters)) {
    const resolved = resolveFieldLoose(col, spec.columns);
    if (resolved) {
      resolvedFilters[resolved] = val;
    } else {
      notFound.push(col);
    }
  }

  if (Object.keys(resolvedFilters).length === 0) {
    return {
      status: "error",
      error: "No valid columns found to apply filters.",
      notFound,
      availableColumns: spec.columns,
    };
  }

  runtimeApi.applyFilters(resolvedFilters, clearOthers);
  store.setFilters((prev) =>
    clearOthers ? resolvedFilters : { ...prev, ...resolvedFilters },
  );

  const appliedList = Object.entries(resolvedFilters)
    .map(([k, v]) => `${k}='${v}'`)
    .join(", ");

  return {
    status: "ok",
    appliedFilters: resolvedFilters,
    notFound: notFound.length > 0 ? notFound : undefined,
    message: `Filters applied: ${appliedList}`,
  };
}

async function resetGridLayout(options?: {
  resetFilters?: boolean;
  resetSort?: boolean;
  resetColumns?: boolean;
}): Promise<unknown> {
  const store = useYulaGridStore.getState();
  const runtimeApi = store.runtimeApi;
  const opt = options ?? {
    resetFilters: true,
    resetSort: true,
    resetColumns: true,
  };
  if (opt.resetFilters) {
    store.setFilters({});
  }
  if (runtimeApi) {
    runtimeApi.resetLayout({
      filters: opt.resetFilters,
      sort: opt.resetSort,
      columns: opt.resetColumns,
    });
  }
  return {
    status: "ok",
    reset: opt,
    message: "Grid layout and filters reset to default settings.",
  };
}

async function exportGridData(
  format: "xlsx" | "parquet" | "csv" | "gz",
): Promise<unknown> {
  const store = useYulaGridStore.getState();
  const runtimeApi = store.runtimeApi;
  if (!runtimeApi || !runtimeApi.exportGrid) {
    return {
      status: "error",
      error: "Grid export service is not attached.",
    };
  }
  await runtimeApi.exportGrid(format);
  return {
    status: "ok",
    format,
    message: `File export initiated in ${format.toUpperCase()} format.`,
  };
}

export async function executeClientTool(
  toolName: string,
  input: unknown,
): Promise<unknown> {
  const args = (input ?? {}) as Record<string, unknown>;
  switch (toolName) {
    case "run_job": {
      const scope = String(args.report ?? "stock-balance");
      const meta =
        (
          await import("@/features/reports/report-registry")
        ).findReport(scope);
      if (!meta) {
        return { status: "error", error: `Unknown report: ${scope}` };
      }
      try {
        const { applyCriteriaToDraft, resolveRelativeDateString } =
          await import("@/features/report-criteria/lib/apply-criteria-to-draft");
        const { validateCriteria } =
          await import("@/features/report-criteria/lib/validate-criteria");
        const criteriaObj = { ...((args.criteria ?? {}) as Record<string, unknown>) };

        // Relative date synthesizer & default fallback for date criteria.
        // The date field is resolved from the schema (first date/range field),
        // never hardcoded per report.
        const { parseCriteriaSchema } = await import(
          "@/features/report-criteria/lib/parse-criteria-schema"
        );
        const schemaFields = parseCriteriaSchema(meta.fullSchema).fields;
        const dateFieldKey = schemaFields.find(
          (f) =>
            (f as { format?: string }).format === "date" ||
            Boolean((f as { rangeSplit?: string }).rangeSplit),
        )?.key;
        const resolveDate =
          typeof resolveRelativeDateString === "function"
            ? resolveRelativeDateString
            : (val: string) => {
                const v = val.toLowerCase().trim();
                const today = new Date();
                const todayIso = today.toISOString().slice(0, 10);
                if (v === "dün" || v === "dun" || v === "yesterday") {
                  const d = new Date(today);
                  d.setDate(d.getDate() - 1);
                  return d.toISOString().slice(0, 10);
                }
                if (v === "bugün" || v === "bugun" || v === "today") return todayIso;
                return val;
              };

        if (dateFieldKey) {
          if (!criteriaObj[dateFieldKey]) {
            const dun = new Date();
            dun.setDate(dun.getDate() - 1);
            criteriaObj[dateFieldKey] = dun.toISOString().slice(0, 10);
          } else if (typeof criteriaObj[dateFieldKey] === "string") {
            criteriaObj[dateFieldKey] = resolveDate(
              criteriaObj[dateFieldKey] as string,
            );
          }
        }

        // Form taslağına da uygula (ekrandaki kriter tablosu eşzamanlı güncellensin)
        applyCriteriaToDraft(scope, criteriaObj, meta.fullSchema);

        const result = validateCriteria(
          meta.fullSchema,
          criteriaObj,
        );
        if (!result.valid) {
          return {
            status: "validation-error",
            errors: result.errors.map((e) => e.message).slice(0, 5),
            hint: "Correct via criteria form or provide valid criteria fields.",
          };
        }
        if (!result.jobEndpoint) {
          return { status: "error", error: "Missing x-job-endpoint in schema." };
        }
        const { createArrowJob } = await import(
          "@/features/jobs/arrow-job-client"
        );
        const job = await createArrowJob(result.jobEndpoint, result.instance);

        const { useActiveJobsStore } = await import(
          "@/store/slices/active-jobs-store"
        );
        useActiveJobsStore.getState().addJob({
          id: job.id,
          name: scope,
          title: meta.title,
          href: `${meta.pagePath}/${job.id}`,
          status: job.status,
          eventsUrl: job.eventsUrl,
          jobUrl: job.jobUrl,
          createdAt: new Date().toISOString(),
          notificationType: "report",
          workspace: "/stock",
          payload: result.instance,
        });

        focusReportExecution({
          scope,
          job,
          request: result.instance,
        });

        const preset = typeof args.presetTitle === "string" ? args.presetTitle : undefined;
        return {
          status: "executed",
          jobId: job.id,
          jobStatus: job.status,
          navigateTo: reportExecutionHref(meta.pagePath, job.id),
          presetTitle: preset,
          message: preset
            ? `Job accepted and queued (${job.id}) for preset "${preset}". Terminal outcome unknown — track on execution screen.`
            : `Job accepted and queued (${job.id}). Terminal outcome unknown — track on execution screen.`,
        };
      } catch (err) {
        return {
          status: "error",
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }
    case "apply_criteria": {
      const scope = String(args.report ?? "stock-balance");
      const criteriaObj = (args.criteria ?? {}) as Record<string, unknown>;
      try {
        const { applyCriteriaToDraft } = await import(
          "@/features/report-criteria/lib/apply-criteria-to-draft"
        );
        const res = applyCriteriaToDraft(scope, criteriaObj);
        const preset = typeof args.presetTitle === "string" ? args.presetTitle : "";
        // Deterministic completeness check: required schema fields still empty
        // in the draft, so the model asks for them explicitly instead of
        // claiming the report is runnable.
        const schemaRequired = (
          findReport(scope)?.fullSchema as { required?: unknown } | undefined
        )?.required;
        const requiredFields = Array.isArray(schemaRequired)
          ? (schemaRequired as unknown[]).filter(
              (f): f is string => typeof f === "string",
            )
          : [];
        const missingRequired = requiredFields.filter((f) => {
          const row = res.rows.find(
            (r) => r.name === f || r.name.toLowerCase() === f.toLowerCase(),
          );
          return !row || !row.value.trim();
        });
        return {
          status: "ok",
          updatedKeys: res.updatedKeys,
          missingRequired,
          message:
            missingRequired.length > 0
              ? `Criteria applied to the draft form. Still missing required criteria: ${missingRequired.join(", ")}. Ask the user for them explicitly before running.`
              : preset
                ? `"${preset}" criteria applied to the draft form. All required criteria are filled; user can run the report.`
                : "Criteria applied to the draft form. All required criteria are filled; user can run the report.",
        };
      } catch (err) {
        return {
          status: "error",
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }
    case "navigate_to_page": {
      const targetPath = String(args.path ?? "").trim();
      if (!targetPath) {
        return {
          status: "error",
          message: "Target page path was not specified.",
        };
      }
      const currentPath =
        typeof window !== "undefined" ? window.location.pathname : "";
      if (currentPath === targetPath) {
        return {
          status: "already_on_page",
          navigateTo: targetPath,
          message: `Already on ${targetPath}.`,
        };
      }
      const title =
        typeof args.title === "string" ? args.title : targetPath;
      return {
        status: "navigated",
        navigateTo: targetPath,
        message: `Navigating to "${title}".`,
      };
    }
    case "open_last_report": {
      try {
        const { REGISTERED_REPORTS } = await import(
          "@/features/reports/report-registry"
        );
        const scope = typeof args.report === "string" ? args.report.trim().toLowerCase() : "";
        const matched = scope
          ? REGISTERED_REPORTS.filter(
              (r) =>
                r.scope === scope ||
                r.aliases.some((a) => scope.includes(a) || a.includes(scope)),
            )
          : [];
        const targets = matched.length > 0 ? matched : REGISTERED_REPORTS;

        const { listArrowJobs } = await import("@/features/jobs/arrow-job-client");
        type Candidate = { jobId: string; status: string; createdAt: string; title: string; href: string };
        const candidates: Candidate[] = [];

        for (const report of targets) {
          const endpoint = (report.fullSchema as Record<string, unknown>)["x-job-endpoint"];
          if (typeof endpoint !== "string" || !endpoint) continue;
          try {
            const { items } = await listArrowJobs(endpoint, { take: 10 });
            for (const j of items) {
              candidates.push({
                jobId: j.id,
                status: j.status,
                createdAt: j.createdAt ?? "",
                title: report.title,
                href: `${report.pagePath}/${j.id}`,
              });
            }
          } catch {
            // Tek raporun listesi başarısız olsa da diğerlerine bak
          }
        }

        // Liste API'sine henüz düşmemiş in-flight job'ları da dahil et
        const { useActiveJobsStore } = await import(
          "@/store/slices/active-jobs-store"
        );
        for (const job of Object.values(useActiveJobsStore.getState().jobs)) {
          if (scope && (job.name ?? "").toLowerCase() !== scope) continue;
          if (candidates.some((c) => c.jobId === job.id)) continue;
          candidates.push({
            jobId: job.id,
            status: job.status,
            createdAt: job.createdAt ?? "",
            title: job.title || job.name,
            href: job.href ?? `${"/stock/stock-balance"}/${job.id}`,
          });
        }

        candidates.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        const lastJob = candidates[0];
        if (!lastJob) {
          return {
            status: "not_found",
            message:
              "No report execution found. You may suggest running a new report with run_job.",
          };
        }
        return {
          status: "navigated",
          jobId: lastJob.jobId,
          navigateTo: lastJob.href,
          message: `Opened last report: ${lastJob.title} (job ${lastJob.jobId.slice(0, 8)}, ${lastJob.status}).`,
        };
      } catch (err) {
        return { status: "error", error: err instanceof Error ? err.message : String(err) };
      }
    }
    case "analyze_grid_data":
      return analyzeGrid(args);
    case "profile_grid_table":
      return profileGrid();
    case "run_expert_sql":
      return runExpertSql(args);
    case "get_report_schema":
      return getReportSchema();
    case "visualize_grid_data":
      return visualizeGrid(args);
    case "set_grid_query":
      return setGridQuery(args);
    case "request_user_confirmation":
      return {
        confirmed: false,
        message: "Waiting for user confirmation response.",
      };
    case "ask_user_question": {
      const raw = (args as { questions?: unknown }).questions;
      const questions = Array.isArray(raw) ? raw.slice(0, 3) : [];
      return {
        status: "awaiting_user",
        questions,
        message: "Questions presented to the user. Wait for their answers, which arrive as a new user message.",
      };
    }
    case "run_user_skill": {
      const slash = String(
        (args as { skill?: unknown }).skill ?? "",
      ).toLowerCase();
      const skill = [
        ...useUserSkillsStore.getState().skills,
        ...BUILT_IN_USER_SKILLS,
      ].find((s) => s.slash.toLowerCase() === slash);
      if (!skill) {
        return {
          status: "not-found",
          message: `Skill '/${slash}' not found on this device. Use only the USER SKILLS listed in the system prompt.`,
        };
      }
      const prompt = buildUserSkillPrompt(
        skill,
        String((args as { input?: unknown }).input ?? ""),
      );
      const files = (skill.files ?? []).map((f) => ({
        name: f.name,
        chars: f.content.length,
      }));
      return {
        status: "loaded",
        skill: skill.slash,
        prompt,
        ...(files.length > 0 ? { files } : {}),
        message:
          files.length > 0
            ? `Skill '/${skill.slash}' instructions loaded (${files.length} attached file(s): ${files.map((f) => f.name).join(", ")} — read with read_user_file when referenced). Follow them with your tools.`
            : `Skill '/${skill.slash}' instructions loaded. Follow them with your tools.`,
      };
    }
    case "read_user_file": {
      const slash = String(
        (args as { skill?: unknown }).skill ?? "",
      ).toLowerCase();
      const name = String((args as { file?: unknown }).file ?? "").toLowerCase();
      const skill = [
        ...useUserSkillsStore.getState().skills,
        ...BUILT_IN_USER_SKILLS,
      ].find((s) => s.slash.toLowerCase() === slash);
      // Yerleşik paket dosyaları sunucu tarafındadır (read_skill_file);
      // burada yalnızca kullanıcı ekli dosyalar okunur.
      const file = skill?.files?.find((f) => f.name.toLowerCase() === name);
      if (!skill || !file) {
        return {
          status: "not-found",
          message: `File '${(args as { file?: unknown }).file ?? ""}' not found in skill '/${slash}'.`,
        };
      }
      return {
        status: "ok",
        skill: skill.slash,
        file: file.name,
        content: file.content,
        message: `File '${file.name}' loaded (${file.content.length} chars).`,
      };
    }
    case "filter_current_grid": {
      const field = String(args.field ?? "");
      const value = String(args.value ?? "");
      return await applyFilter(field, value, String(args.op ?? "eq"));
    }
    case "set_grid_sort": {
      const column = String(args.column ?? "");
      const direction = String(args.direction ?? "asc") as "asc" | "desc" | "none";
      return await sortCurrentGrid(column, direction);
    }
    case "configure_grid_columns": {
      return await configureGridColumns({
        visibleColumns: Array.isArray(args.visibleColumns)
          ? (args.visibleColumns as string[])
          : undefined,
        hiddenColumns: Array.isArray(args.hiddenColumns)
          ? (args.hiddenColumns as string[])
          : undefined,
        order: Array.isArray(args.order)
          ? (args.order as string[])
          : undefined,
      });
    }
    case "pin_grid_columns": {
      const columns = Array.isArray(args.columns)
        ? (args.columns as string[])
        : [];
      return await pinGridColumns(columns);
    }
    case "apply_grid_filters": {
      const filters = (args.filters ?? {}) as Record<string, string>;
      const clearOthers = Boolean(args.clearOthers);
      return await applyGridFiltersMulti(filters, clearOthers);
    }
    case "reset_grid_layout": {
      return await resetGridLayout({
        resetFilters: args.resetFilters !== false,
        resetSort: args.resetSort !== false,
        resetColumns: args.resetColumns !== false,
      });
    }
    case "export_grid_data": {
      const format = String(args.format ?? "xlsx") as "xlsx" | "parquet" | "csv" | "gz";
      return await exportGridData(format);
    }
    case "validate_criteria_input": {
      const scope = String(args.report ?? "stock-balance");
      const { findReport } = await import("@/features/reports/report-registry");
      const meta = findReport(scope);
      if (!meta) {
        return {
          valid: false,
          scope,
          reportTitle: scope,
          summary: `Unknown report: '${scope}'`,
          errors: [{ field: "report", fieldTitle: "Report", message: `Unknown report: '${scope}'` }],
          warnings: [],
        };
      }
      const { validateCriteriaInput } = await import("@/features/report-criteria");
      const criteriaObj = (args.criteria ?? {}) as Record<string, unknown>;
      const partial = Boolean(args.partial);
      return validateCriteriaInput(meta.fullSchema, criteriaObj, { scope, partial });
    }
    case "get_current_criteria": {
      const scope = String(args.report ?? "stock-balance");
      const { evaluateCurrentDraftCriteria } = await import("@/features/report-criteria");
      try {
        const res = evaluateCurrentDraftCriteria(scope);
        return {
          status: "ok",
          scope: res.scope,
          reportTitle: res.reportTitle,
          valid: res.report.valid,
          summary: res.report.summary,
          instance: res.instance,
          errors: res.report.errors,
          warnings: res.report.warnings,
        };
      } catch (err) {
        return {
          status: "error",
          scope,
          reportTitle: scope,
          valid: false,
          summary: err instanceof Error ? err.message : String(err),
          instance: {},
          errors: [{ field: "form", fieldTitle: "Form", message: String(err) }],
          warnings: [],
        };
      }
    }
    case "find_matching_report": {
      const scope = String(args.report ?? "stock-balance");
      const rawCriteria = { ...((args.criteria ?? {}) as Record<string, unknown>) };
      try {
        const { findReport } = await import("@/features/reports/report-registry");
        const meta = findReport(scope);
        if (!meta) {
          return { status: "error", error: `Unknown report: ${scope}` };
        }
        const { resolveRelativeDateString } = await import(
          "@/features/report-criteria/lib/apply-criteria-to-draft"
        );
        const { validateCriteria } = await import(
          "@/features/report-criteria/lib/validate-criteria"
        );
        const resolveDate =
          typeof resolveRelativeDateString === "function"
            ? resolveRelativeDateString
            : undefined;
        // Resolve relative dates on raw input before validation.
        for (const [k, v] of Object.entries(rawCriteria)) {
          if (typeof v === "string") {
            rawCriteria[k] = normalizeCriteriaValue(v, resolveDate);
          }
        }
        const result = validateCriteria(meta.fullSchema, rawCriteria);
        const required = Array.isArray(
          (meta.fullSchema as { required?: unknown })?.required,
        )
          ? ((meta.fullSchema as { required?: string[] }).required ?? [])
          : [];
        const missing = required.filter((f) => {
          const v = (result.instance as Record<string, unknown>)?.[f];
          return v === undefined || v === null || String(v).trim() === "";
        });
        if (missing.length > 0) {
          return {
            status: "needs_criteria",
            missing,
            hint: "Ask user for missing required criteria before starting a job.",
            message: `Missing required criteria: ${missing.join(", ")}.`,
          };
        }
        const requested = normalizeCriteria(
          result.instance as Record<string, unknown>,
          undefined,
        );
        const endpoint =
          typeof meta?.fullSchema?.["x-job-endpoint"] === "string"
            ? (meta.fullSchema["x-job-endpoint"] as string)
            : "/api/arrow/jobs";
        const { listArrowJobs, fetchJobRequest } = await import(
          "@/features/jobs/arrow-job-client"
        );
        const res = await listArrowJobs(endpoint, { take: 10 });
        const items = (res.items || []).slice(0, 10);
        const withRequests = await Promise.allSettled(
          items.map(async (j) => ({
            job: j,
            request: await fetchJobRequest(j.id),
          })),
        );
        const candidates: Array<{
          jobId: string;
          status: string;
          createdAt: string;
          request: Record<string, unknown>;
        }> = [];
        for (const r of withRequests) {
          if (r.status !== "fulfilled" || !r.value.request) continue;
          candidates.push({
            jobId: r.value.job.id,
            status: r.value.job.status,
            createdAt: r.value.job.createdAt ?? "",
            request: normalizeCriteria(
              r.value.request as Record<string, unknown>,
              undefined,
            ),
          });
        }
        const isActive = (s: string) => s === "Queued" || s === "Running";
        const activeMatch = candidates.find(
          (c) => isActive(c.status) && isCriteriaMatch(requested, c.request),
        );
        if (activeMatch) {
          return {
            status: "running",
            jobId: activeMatch.jobId,
            jobStatus: activeMatch.status,
            navigateTo: reportExecutionHref(meta.pagePath, activeMatch.jobId),
            message: `Matching job is still running (${activeMatch.jobId}).`,
          };
        }
        const completedMatch = candidates
          .filter((c) => c.status === "Completed")
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .find((c) => isCriteriaMatch(requested, c.request));
        if (completedMatch) {
          return {
            status: "matched",
            jobId: completedMatch.jobId,
            jobStatus: completedMatch.status,
            navigateTo: reportExecutionHref(meta.pagePath, completedMatch.jobId),
            message: `Opened matching completed report (job ${completedMatch.jobId}).`,
          };
        }
        return {
          status: "no_match",
          suggestedCriteria: result.instance as Record<string, unknown>,
          hint: "No completed job matches these criteria. Ask for confirmation before calling run_job.",
          message: "No completed job matches these criteria.",
        };
      } catch (err) {
        return {
          status: "error",
          error: err instanceof Error ? err.message : String(err),
        };
      }
    }
    case "list_report_executions": {
      const scope = String(args.report ?? "stock-balance");
      const limit =
        typeof args.limit === "number"
          ? Math.min(10, Math.max(1, args.limit))
          : 10;
      try {
        const { findReport } = await import("@/features/reports/report-registry");
        const meta = findReport(scope);
        const endpoint =
          typeof meta?.fullSchema?.["x-job-endpoint"] === "string"
            ? (meta.fullSchema["x-job-endpoint"] as string)
            : "/api/arrow/jobs";
        const { listArrowJobs } = await import("@/features/jobs/arrow-job-client");
        const res = await listArrowJobs(endpoint, { take: limit });
        const executions = (res.items || []).slice(0, limit).map((j) => ({
          jobId: j.id,
          status: j.status,
          createdAt: j.createdAt,
          rowCount: j.totalRows,
          href: meta ? `${meta.pagePath}/${j.id}` : undefined,
        }));
        return {
          status: "ok",
          executions,
          message: `Listed ${executions.length} report execution(s).`,
        };
      } catch (err) {
        return {
          status: "error",
          executions: [],
          message: err instanceof Error ? err.message : String(err),
        };
      }
    }
    case "cancel_job": {
      const jobId = String(args.jobId ?? "").trim();
      if (!jobId) {
        return { status: "error", jobId: "", message: "Job GUID to cancel was not specified." };
      }
      try {
        const { cancelArrowJob } = await import("@/features/jobs/arrow-job-client");
        await cancelArrowJob(jobId);
        const { useActiveJobsStore } = await import("@/store/slices/active-jobs-store");
        useActiveJobsStore.getState().updateJob(jobId, { status: "Cancelled" });
        return {
          status: "ok",
          jobId,
          message: `Job successfully cancelled (${jobId}).`,
        };
      } catch (err) {
        return {
          status: "error",
          jobId,
          message: err instanceof Error ? err.message : String(err),
        };
      }
    }
    default:
      return { status: "unknown-tool", toolName };
  }
}
