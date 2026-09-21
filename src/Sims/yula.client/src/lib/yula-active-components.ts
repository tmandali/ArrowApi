/**
 * Yula agent active UI components resolver & filter.
 * Resolves mounted client components and Zod action contracts for the Headless React Agent.
 */
import { z } from "zod";
import type { ComponentSchema } from "@my-agent/core";
import { REGISTERED_REPORTS, findReport } from "@/features/reports/report-registry";
import type { YulaScreenContext } from "./yula-agent-prompt";
import {
  JOB_OPEN_LAST_ACTION_CONTRACT,
  JOB_DETAIL_ACTION_CONTRACT,
  JOB_LIST_ACTION_CONTRACT,
  JOB_FIND_ACTION_CONTRACT,
  JOB_CANCEL_ACTION_CONTRACT,
} from "./client-tools/job-history-contracts";
import { APP_ROUTER_NAVIGATE_CONTRACT } from "./client-tools/app-router-contracts";
import {
  GRID_RUN_SQL_CONTRACT,
  GRID_QUERY_CONTRACT,
  GRID_FILTER_CONTRACT,
  GRID_APPLY_FILTERS_CONTRACT,
  GRID_SORT_CONTRACT,
  GRID_COLUMNS_CONTRACT,
  GRID_PIN_CONTRACT,
  GRID_RESET_LAYOUT_CONTRACT,
  GRID_EXPORT_CONTRACT,
  GRID_PROFILE_CONTRACT,
  GRID_ANALYZE_CONTRACT,
  GRID_VISUALIZE_CONTRACT,
} from "./client-tools/result-grid-contracts";
import {
  CRITERIA_SET_FIELDS_CONTRACT,
  CRITERIA_APPLY_CONTRACT,
  CRITERIA_SUBMIT_CONTRACT,
  CRITERIA_RUN_CONTRACT,
  CRITERIA_VALIDATE_CONTRACT,
  CRITERIA_READ_CONTRACT,
  CRITERIA_SCHEMA_CONTRACT,
} from "./client-tools/criteria-form-contracts";

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
      NAVIGATE: APP_ROUTER_NAVIGATE_CONTRACT,
    },
  });

  comps.push({
    id: "job_history",
    capabilities: ["OPEN_LAST", "GET_DETAIL", "LIST", "FIND", "CANCEL"],
    meta: { description: "Report Execution History and Job Tracker" },
    actions: {
      OPEN_LAST: JOB_OPEN_LAST_ACTION_CONTRACT,
      GET_DETAIL: JOB_DETAIL_ACTION_CONTRACT,
      LIST: JOB_LIST_ACTION_CONTRACT,
      FIND: JOB_FIND_ACTION_CONTRACT,
      CANCEL: JOB_CANCEL_ACTION_CONTRACT,
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
        RUN_SQL: GRID_RUN_SQL_CONTRACT,
        QUERY: GRID_QUERY_CONTRACT,
        FILTER: GRID_FILTER_CONTRACT,
        APPLY_FILTERS: GRID_APPLY_FILTERS_CONTRACT,
        SORT: GRID_SORT_CONTRACT,
        COLUMNS: GRID_COLUMNS_CONTRACT,
        PIN: GRID_PIN_CONTRACT,
        RESET_LAYOUT: GRID_RESET_LAYOUT_CONTRACT,
        EXPORT: GRID_EXPORT_CONTRACT,
        PROFILE: GRID_PROFILE_CONTRACT,
        ANALYZE: GRID_ANALYZE_CONTRACT,
        VISUALIZE: GRID_VISUALIZE_CONTRACT,
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
          SET_FIELDS: CRITERIA_SET_FIELDS_CONTRACT,
          APPLY: CRITERIA_APPLY_CONTRACT,
          SUBMIT: CRITERIA_SUBMIT_CONTRACT,
          RUN: CRITERIA_RUN_CONTRACT,
          SCHEMA: CRITERIA_SCHEMA_CONTRACT,
          VALIDATE: CRITERIA_VALIDATE_CONTRACT,
          READ: CRITERIA_READ_CONTRACT,
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
