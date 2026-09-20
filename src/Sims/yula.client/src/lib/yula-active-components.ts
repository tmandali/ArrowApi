/**
 * Yula agent active UI components resolver & filter.
 * Resolves mounted client components and Zod action contracts for the Headless React Agent.
 */
import { z } from "zod";
import type { ComponentSchema } from "@my-agent/core";
import { REGISTERED_REPORTS, findReport } from "@/features/reports/report-registry";
import type { YulaScreenContext } from "./yula-agent-prompt";

/**
 * Ekranda mount edilmiş bileşenleri ve Zod aksiyon sözleşmelerini çözer.
 */
export function resolveActiveComponents(context?: YulaScreenContext): ComponentSchema[] {
  const comps: ComponentSchema[] = [];
  const href = context?.pathname || context?.uiContext?.route || "/";
  const pathname = href.split("?")[0] || "/";
  const phase = context?.phase ?? "workspace";

  // 1. Evrensel Yönlendirici ve İş Geçmişi Bileşenleri
  comps.push({
    id: "app_router",
    capabilities: ["NAVIGATE"],
    meta: { description: "Page and Route Navigator" },
    actions: {
      NAVIGATE: {
        description: "Navigates the user to a target page or report ({ path }).",
        whenToCall: "When the user wants to navigate to another report, workspace, or page.",
        whenNotToCall: "When the user is already on the target screen.",
      },
    },
  });

  comps.push({
    id: "job_history",
    capabilities: ["OPEN_LAST", "LIST", "FIND", "CANCEL"],
    meta: { description: "Report Execution History and Job Tracker" },
    actions: {
      OPEN_LAST: {
        description: "Opens the most recently completed report result on the screen ({ report?: string }). Defaults to active report if omitted.",
        whenToCall: "When the user asks to 'open last report', 'show latest result', etc.",
        whenNotToCall: "When the user intends to execute a new report.",
      },
      LIST: {
        description: "Lists past execution jobs ({ report?: string, limit?: number }). If report is omitted, defaults to the active screen's report, or lists recent runs across all reports if not on a report screen.",
        whenToCall: "When the user asks 'how many reports ran' ('kaç rapor çalışmış'), 'which reports ran', 'show history', 'list past jobs', etc.",
        whenNotToCall: "When the user wants to execute a new report run (use SUBMIT or RUN).",
      },
      FIND: {
        description: "Searches past report executions or matching jobs ({ query, report?: string }). Defaults to active report if omitted.",
        whenToCall: "When the user wants to find a specific job, execution, or report run.",
        whenNotToCall: "When requesting the entire list or running a new report.",
      },
      CANCEL: {
        description: "Cancels an active or running job ({ jobId }).",
        whenToCall: "When the user explicitly asks to 'stop', 'abort', or 'cancel' an execution.",
        whenNotToCall: "When the job is already finished or terminated.",
      },
    },
  });

  // 2. RESULTS Evresi: Sonuç Tablosu Ekranda Mount Durumda
  if (phase === "results" && context?.grid) {
    comps.push({
      id: "result_grid:active",
      meta: {
        description: `Active Result Grid (${context.grid.tableName || "active_view"}) - ${context.grid.rowCount ?? "?"} rows, Columns: ${(context.grid.columns || []).join(", ")}`,
        tableName: context.grid.tableName,
        columns: context.grid.columns,
        filters: context.grid.filters,
      },
      events: {
        filter_changed: {
          description: "Triggered when active grid filter is changed",
          schema: z.object({ filters: z.record(z.string(), z.any()) }),
        },
      },
      actions: {
        RUN_SQL: {
          description: "Executes a read-only DuckDB SQL query against 'active_view' ({ query }).",
          inputSchema: z.object({ query: z.string() }),
          outputSchema: z.object({ rows: z.array(z.any()).optional(), rowCount: z.number().optional(), error: z.string().optional() }),
          when: { phase: "results" },
          whenToCall: "When the user requests calculations, top N, aggregations, or custom SQL analysis on active table data.",
          whenNotToCall: "For simple column filtering or sorting (use FILTER or SORT instead).",
        },
        QUERY: {
          description: "Updates the grid view via SQL or opens a derived view ({ query }).",
          inputSchema: z.object({ query: z.string() }),
          outputSchema: z.object({ success: z.boolean() }),
          when: { phase: "results" },
          whenToCall: "When the user wants derived columns or grouped table views.",
          whenNotToCall: "When only changing simple filters or sorting.",
        },
        FILTER: {
          description: "Applies a filter to a single column ({ field, value, op }).",
          inputSchema: z.object({ field: z.string(), value: z.any(), op: z.string().optional() }),
          outputSchema: z.object({ success: z.boolean(), totalFiltered: z.number().optional() }),
          when: { phase: "results" },
          whenToCall: "When the user wants to filter records by a single column value.",
          whenNotToCall: "When applying multiple filters simultaneously (use APPLY_FILTERS instead).",
        },
        APPLY_FILTERS: {
          description: "Applies multiple filters to the table simultaneously ({ filters, clearOthers }).",
          inputSchema: z.object({ filters: z.record(z.string(), z.any()), clearOthers: z.boolean().optional() }),
          outputSchema: z.object({ success: z.boolean() }),
          when: { phase: "results" },
          whenToCall: "When multiple columns need to be filtered concurrently.",
          whenNotToCall: "When filtering only a single column.",
        },
        SORT: {
          description: "Sorts the column in ascending or descending order ({ column, direction }).",
          inputSchema: z.object({ column: z.string(), direction: z.enum(["asc", "desc"]) }),
          outputSchema: z.object({ success: z.boolean(), sortedColumn: z.string().optional() }),
          when: { phase: "results" },
          whenToCall: "When sorting is requested.",
          whenNotToCall: "When sorting is not requested.",
        },
        COLUMNS: {
          description: "Shows, hides, or reorders columns ({ visibleColumns, hiddenColumns, order }).",
          whenToCall: "When adjusting column visibility or display order.",
          whenNotToCall: "When filtering table data.",
        },
        PIN: {
          description: "Pins columns to the left or right ({ columns }).",
          whenToCall: "When column freezing or pinning is requested.",
          whenNotToCall: "When pinning is not requested.",
        },
        RESET_LAYOUT: {
          description: "Resets the grid to default layout and visibility.",
          whenToCall: "When the user wants to reset custom column arrangements.",
          whenNotToCall: "When keeping the current layout.",
        },
        EXPORT: {
          description: "Exports the table to file ({ format: 'xlsx'|'parquet'|'csv'|'gz' }).",
          whenToCall: "When the user requests exporting or downloading data to Excel, CSV, or Parquet.",
          whenNotToCall: "When only viewing data on screen.",
        },
        PROFILE: {
          description: "Analyzes column null counts, cardinality, and data quality anomalies.",
          whenToCall: "When the user requests data profiling or inspecting data quality anomalies.",
          whenNotToCall: "When the user is searching for specific rows.",
        },
        ANALYZE: {
          description: "Generates a statistical analysis summary of active data.",
          whenToCall: "When statistical summary or distribution analysis is requested.",
          whenNotToCall: "When statistical summary is not requested.",
        },
        VISUALIZE: {
          description: "Generates a visual chart or plot from table data ({ type, dimension, metric }).",
          whenToCall: "When the user requests a chart, plot, or graph visualization.",
          whenNotToCall: "When there are no numeric metrics in the table.",
        },
      },
    });
  }

  // 3. WORKSPACE Evresi: Kriter Formu Ekranda Mount Durumda (Yalnızca geçerli bir rapor ekranındayken)
  if (phase === "workspace") {
    const activeReport =
      REGISTERED_REPORTS.find((r) => pathname.startsWith(r.pagePath)) ||
      (context?.screen?.reportScope ? findReport(context.screen.reportScope) : undefined);

    if (activeReport || context?.screen?.reportScope) {
      const scope = activeReport?.scope ?? (context?.screen?.reportScope || "report");
      const reportTitle = activeReport?.title ?? "Report";

      comps.push({
        id: `criteria_form:${scope}`,
        meta: {
          description: `${reportTitle} Criteria Form`,
          scope,
          criteriaDraft: (context as any)?.screenState?.criteria ?? (context?.uiContext as any)?.criteria,
        },
        events: {
          field_change: {
            description: `Triggered when criteria fields for ${reportTitle} are updated`,
            schema: z.object({ field: z.string(), value: z.any() }),
          },
          job_queued: {
            description: `Triggered when ${reportTitle} report execution starts`,
            schema: z.object({ jobId: z.string(), report: z.string() }),
          },
        },
        actions: {
          SET_FIELDS: {
            description: "Primary action to mutate criteria form fields without executing the report ({ criteria }).",
            outputSchema: z.object({ success: z.boolean(), updatedFields: z.array(z.string()).optional() }),
            whenToCall: "When the user specifies store, date, or filter parameters to fill in the form.",
            whenNotToCall: "When the user explicitly wants to run the report (call SUBMIT).",
          },
          SUBMIT: {
            description: "Primary action to submit criteria and execute the report job ({ criteria, report }).",
            outputSchema: z.object({ success: z.boolean(), jobId: z.string().optional(), queued: z.boolean().optional() }),
            whenToCall: "When the user explicitly asks to run, start, fetch, or execute the report.",
            whenNotToCall: "When required fields are missing or user is only drafting parameters.",
          },
          APPLY: {
            description: "Alias for SET_FIELDS: Populates criteria form fields ({ criteria }).",
            outputSchema: z.object({ success: z.boolean(), navigatedTo: z.string().optional() }),
            whenToCall: "When the user prepares or updates criteria parameters.",
            whenNotToCall: "When the user commands to run the report directly.",
          },
          RUN: {
            description: "Alias for SUBMIT: Submits criteria and executes the report ({ criteria, report }).",
            outputSchema: z.object({ success: z.boolean(), jobId: z.string().optional(), navigatedTo: z.string().optional() }),
            whenToCall: "When the user explicitly asks to run, start, fetch, or execute the report.",
            whenNotToCall: "When required fields are missing or user is only drafting parameters.",
          },
          SCHEMA: {
            description: "Inspects report criteria schema and accepted parameter definitions.",
            whenToCall: "To discover parameter names, data types, and accepted formats.",
            whenNotToCall: "When the criteria schema is already known.",
          },
          VALIDATE: {
            description: "Validates criteria parameters against schema rules ({ criteria }).",
            outputSchema: z.object({ valid: z.boolean(), errors: z.array(z.string()).optional() }),
            whenToCall: "When checking whether parameters satisfy schema constraints.",
            whenNotToCall: "When the user directly commands execution.",
          },
          READ: {
            description: "Reads current draft criteria values from the active form.",
            outputSchema: z.object({ criteria: z.record(z.string(), z.any()) }),
            whenToCall: "To inspect current form state or merge values.",
            whenNotToCall: "When assigning or overwriting new values.",
          },
        },
      });
    }
  }

  return comps;
}

/**
 * Aktif ekranın kapsamına ve fazına göre bileşenleri filtreler.
 * Özellikle bir rapor sayfasındayken diğer inaktif raporların criteria_form
 * bileşenlerini çıkararak LLM context bloat ve token israfını engeller.
 */
export function filterRelevantComponents(
  comps: ComponentSchema[],
  context?: YulaScreenContext,
): ComponentSchema[] {
  const href = context?.pathname || context?.uiContext?.route || "/";
  const pathname = href.split("?")[0] || "/";
  const phase = context?.phase ?? "workspace";

  const activeReport =
    REGISTERED_REPORTS.find((r) => pathname.startsWith(r.pagePath)) ||
    (context?.screen?.reportScope ? findReport(context.screen.reportScope) : undefined);

  const activeScope = activeReport?.scope || context?.screen?.reportScope;

  return comps.filter((comp) => {
    // 1. Evrensel bileşenler her zaman kalır
    if (comp.id === "app_router" || comp.id === "job_history") {
      return true;
    }

    // 2. Sonuç Izgarası
    if (comp.id.startsWith("result_grid:")) {
      return phase === "results" || Boolean(context?.grid);
    }

    // 3. Kriter Formları: Aktif ekranda bir rapor varsa sadece onun formu kalır, ekran dışındaysa elenir
    if (comp.id.startsWith("criteria_form:")) {
      const scope = comp.id.replace("criteria_form:", "");
      if (activeScope) {
        return scope === activeScope;
      }
      return false;
    }

    // 4. Diğer bileşenler (entity_form, plugin vb.)
    return true;
  });
}
