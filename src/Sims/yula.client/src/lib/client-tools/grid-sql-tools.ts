import { useYulaGridStore } from "@/lib/stores/grid";
import { findReport } from "@/features/reports/report-registry";
import { readReportAiMetadata, readCriteriaAiMetadata } from "@/lib/report-ai-metadata";
import {
  guardReadOnlySelect,
  resolveActiveViewReferences,
  normalizeQueryForStorage,
  PORTABLE_TABLE_PLACEHOLDER,
} from "@/lib/sql-guard";
import { isReportResultPath, isReportResultView } from "@/lib/workspace-paths";
import {
  ensureGridSpec,
  resetGridCustomView,
} from "./dataset";
import { analyzeGrid, profileGrid } from "./grid-profiler-tools";
import { visualizeGrid } from "./grid-visualize-tool";

export { analyzeGrid, profileGrid, visualizeGrid };

/**
 * Layer 2: DuckDB SQL araçları (Analytics & Compute) —
 * `run_expert_sql`, `profile_grid_table`, `analyze_grid_data`,
 * `visualize_grid_data`, `set_grid_query`, `get_report_schema`.
 */

/**
 * get_report_schema — aktif raporun JSON şemasını yetkili kaynaktan döndürür
 * (kriter alanları + kolon tanımları + üstveri). Model çıktıyı markdown tablo
 * olarak özetler; kriter alan adları run_job criteria'sında aynen kullanılır.
 */
export async function getReportSchema(explicitScope?: string): Promise<unknown> {
  const storeState = useYulaGridStore.getState();
  const spec = storeState.spec;
  const screen = storeState.screen;
  const pathname = typeof window !== "undefined" ? window.location.pathname : "";
  const { REGISTERED_REPORTS: ALL_REPORTS } = await import(
    "@/features/reports/report-registry"
  );
  const explicit = explicitScope?.trim();
  if (explicit && !findReport(explicit)) {
    return {
      status: "error",
      error: `Unknown report: '${explicit}'.`,
      hint: "Pick a scope from the RAG routing context or report catalog.",
    };
  }
  const scope =
    explicit ||
    spec?.reportScope ||
    screen?.reportScope ||
    ALL_REPORTS.find((r) => pathname.startsWith(r.pagePath))?.scope ||
    undefined;
  const report = scope ? findReport(scope) : undefined;
  if (!report) {
    return {
      status: "error",
      error: "Active report schema not found.",
      hint: "Pass 'report' explicitly with the target scope, or try again when a report criteria or results screen is open.",
    };
  }

  const isGuidPath = isReportResultPath(pathname) || Boolean(spec?.tableName && spec.tableName.startsWith("report_"));
  const isViewingResults = isReportResultView(pathname, spec);

  const meta = readReportAiMetadata(report.fullSchema);
  const required = new Set(report.fullSchema.required ?? []);
  const criteria = Object.entries(report.fullSchema.properties ?? {}).map(
    ([name, prop]) => {
      const ai = readCriteriaAiMetadata(prop);
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
      };
    },
  );

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
  };
}

/**
 * SQL Expert sorgu yürütme — modelin yazdığı TEK salt-okunur SELECT'i
 * guard'dan geçirip DuckDB'de çalıştırır; ilk 10 satırı modele döner.
 */
export async function runExpertSql(
  input: Record<string, unknown>
): Promise<unknown> {
  const spec = await ensureGridSpec();
  if (!spec || spec.columns.length === 0) {
    return {
      status: "error",
      error: "No active table found.",
      hint: "Results table is not ready yet; please wait a moment and try again.",
    };
  }

  const rawSql =
    typeof input.query === "string" && input.query.trim().length > 0
      ? input.query
      : typeof input.sql === "string"
        ? input.sql
        : "";
  const guard = guardReadOnlySelect(rawSql);
  if (!guard.ok) {
    return { status: "error", error: guard.error, hint: guard.hint };
  }

  try {
    const { wasmSqlClient } = await import("@/services/wasmsql");
    const rows = await wasmSqlClient.executeCustomSql(guard.sql);
    const MAX_OUTPUT_ROWS = 10;
    return {
      status: "ok",
      rowCount: rows.length,
      note: guard.limited
        ? `LIMIT was automatically applied; returning first ${MAX_OUTPUT_ROWS} sample rows to context.`
        : `Returning first ${MAX_OUTPUT_ROWS} sample rows to context.`,
      rows: rows.slice(0, MAX_OUTPUT_ROWS),
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

  const rawSqlCandidate =
    typeof input.query === "string" && input.query.trim().length > 0
      ? input.query
      : typeof input.sql === "string"
        ? input.sql
        : "";
  const hasSql = rawSqlCandidate.trim().length > 0;

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

  // Otomatik guard limiti olan LIMIT 200/500/1000'i temizle; ancak modelin/kullanıcının açıkça belirttiği Top-N (örn: LIMIT 5, LIMIT 10) limitlerini koru
  const cleanedSql = rawSqlCandidate
    .replace(/\s+LIMIT\s+(?:200|500|1000)\s*$/i, "")
    .trim();
  const guard = guardReadOnlySelect(cleanedSql, 0);
  if (!guard.ok) {
    return { status: "error", error: guard.error, hint: guard.hint };
  }

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
    const { wasmSqlClient } = await import("@/services/wasmsql");
    const resolvedSql = resolveActiveViewReferences(guard.sql, spec.tableName);
    const rows = await wasmSqlClient.executeCustomSql(resolvedSql);
    const first = rows[0] as Record<string, unknown> | undefined;
    const columns = first ? Object.keys(first) : [];
    const title = typeof input.title === "string" && input.title.trim()
      ? input.title.trim()
      : null;
    const portableSql = normalizeQueryForStorage(guard.sql, spec.tableName);
    store.setCustomQuerySql(portableSql, title);
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
