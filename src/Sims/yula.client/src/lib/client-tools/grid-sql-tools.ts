import { useYulaGridStore } from "@/lib/stores/grid";
import { findReport } from "@/features/reports/report-registry";
import { readReportAiMetadata, readCriteriaAiMetadata } from "@/lib/report-ai-metadata";
import { guardReadOnlySelect, resolveActiveViewReferences, normalizeQueryForStorage, PORTABLE_TABLE_PLACEHOLDER } from "@/lib/sql-guard";
import { isReportResultPath, isReportResultView } from "@/lib/workspace-paths";
import {
  buildChartQuery,
  inferChartOrderMode,
  type ChartOrderMode,
} from "@/lib/chart-query";
import {
  sqlSafeId,
  resolveActiveDataset,
  ensureGridSpec,
  gridStillStreaming,
  resetGridCustomView,
} from "./dataset";

/**
 * Layer 2: DuckDB SQL araçları (Analytics & Compute) —
 * `run_expert_sql`, `profile_grid_table`, `analyze_grid_data`,
 * `visualize_grid_data`, `set_grid_query`, `get_report_schema`.
 * Davranış `yula-client-tools.ts` ile birebirdir.
 */

export async function analyzeGrid(
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
        error: "Rapor hâlâ yükleniyor.",
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
export async function profileGrid(): Promise<unknown> {
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
        error: "Report data is still loading.",
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
export async function getReportSchema(explicitScope?: string): Promise<unknown> {
  const storeState = useYulaGridStore.getState()
  const spec = storeState.spec
  const screen = storeState.screen
  const pathname = typeof window !== "undefined" ? window.location.pathname : ""
  const { REGISTERED_REPORTS: ALL_REPORTS } = await import(
    "@/features/reports/report-registry"
  );
  const explicit = explicitScope?.trim();
  if (explicit && !findReport(explicit)) {
    return {
      status: "error",
      error: `Unknown report: '${explicit}'.`,
      hint: "Pick a scope from the RAG routing context or report catalog.",
    }
  }
  const scope =
    explicit ||
    spec?.reportScope ||
    screen?.reportScope ||
    ALL_REPORTS.find((r) => pathname.startsWith(r.pagePath))?.scope ||
    undefined
  const report = scope ? findReport(scope) : undefined
  if (!report) {
    return {
      status: "error",
      error: "Active report schema not found.",
      hint: "Pass 'report' explicitly with the target scope, or try again when a report criteria or results screen is open.",
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
export async function runExpertSql(
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
 * set_grid_query — modelin yazdığı salt-okunur SELECT'i guard'dan geçirip
 * DuckDB'de koşar ve gridi bu sonuç kümesiyle yeniler (gruplama/aggregate
 * görünümleri). reset:true → temel tablo görünümüne dönüş.
 */
export async function setGridQuery(
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
export async function visualizeGrid(
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
