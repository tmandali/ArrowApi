"use client";

import * as React from "react";
import { uiRegistry, uiEventBus, type ComponentSchema } from "@my-agent/core";
import { executeDispatchComponentAction } from "@/lib/client-tools/dispatch-bridge";
import { useYulaGridStore } from "@/lib/stores/grid";

/**
 * Revize karşılığı: eski sidecar scope-kayıt sözleşmesinin yerine
 * açık tablo bilgisini useYulaGridStore'a taşıyan ince bağdaştırıcı.
 * ArrowReportGrid / JobView bileşenleri imzayı korur.
 */
export function useScreenAgentContext(input: {
  /** Eski çağrı noktalarının ekstra alanları için açık kapı */
  [key: string]: unknown;
  screenId?: string;
  screenTitle?: string;
  workspaceId?: string;
  activeFilters?: unknown;
  activeDataSummary?: {
    isViewingResults?: boolean;
    tableName?: string;
    totalFiltered?: number;
    columns?: string[];
    /** Grid'in ek bağlam alanları (jobId, columnTypes, sampleRows...) */
    [key: string]: unknown;
  };
  tools?: unknown[];
}) {
  const summary = input.activeDataSummary;
  // Efekt gövdesinde en güncel input okunur (ref render'da yazılmaz,
  // effect ile tazelenir) — böylece inline quickPrompts/tools dizileri
  // kayıt efektini her render yeniden tetiklemez.
  const latestInputRef = React.useRef(input);
  React.useEffect(() => {
    latestInputRef.current = input;
  });
  // Kolon sayısı 0 → non-zero geçişi kayıt efektini yeniden tetiklesin
  // (kolonlar DESCRIBE/discoveredCols ile sonradan gelir; aksi halde spec
  // hiç dolmaz ve Yula workspace çiplerinde kalır).
  const hasColumns = (summary?.columns?.length ?? 0) > 0;

  React.useEffect(() => {
    if (
      !summary?.isViewingResults ||
      !summary.tableName ||
      !summary.columns ||
      summary.columns.length === 0
    ) {
      return;
    }
    useYulaGridStore.getState().register({
      tableName: summary.tableName,
      title: input.screenTitle ?? "",
      columns: [...summary.columns],
      rowCount: summary.totalFiltered ?? null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary?.isViewingResults, summary?.tableName, input.screenId, hasColumns]);

  React.useEffect(() => {
    const current = latestInputRef.current;
    const currentSummary = current.activeDataSummary;
    const screenId = current.screenId || (current.activeReportScope as string) || "screen";
    const screenTitle = current.screenTitle || "";
    const workspaceId = (current.workspaceId as string) || "stock";
    const reportScope = (current.activeReportScope as string) || (current.screenId as string);
    const isViewingResults = Boolean(currentSummary?.isViewingResults);
    const quickPrompts = (current.quickPrompts as string[]) || [];
    const criteriaDigest = (current.criteriaDigest as Array<Record<string, unknown>>) || [];
    const stateLegend = (current.stateLegend as Record<string, string> | undefined) || undefined;
    const stateExtra = (current.stateExtra as Record<string, unknown> | undefined) || undefined;
    const tools = (current.tools as Array<{ name: string; description?: string }>) || [
      {
        name: "apply_criteria",
        description:
          "Fills the criteria form on screen with the suggested report criteria, honoring the required fields of the report schema.",
      },
      {
        name: "run_job",
        description:
          "Starts the report job honoring the required fields of the report schema and shows the new job selected/running on the execution screen.",
      },
    ];

    useYulaGridStore.getState().registerScreen({
      screenId,
      screenTitle,
      workspaceId,
      reportScope,
      isViewingResults,
      registeredTools: tools,
      quickPrompts,
      criteriaDigest,
      jobId: currentSummary?.jobId as string | undefined,
      ...(stateLegend ? { stateLegend } : {}),
      ...(stateExtra ? { stateExtra } : {}),
    });

    const registeredCompIds: string[] = [];
    const unsubscribes: Array<() => void> = [];

    // Headless UI-Agent (@my-agent/core) Bileşen Kaydı
    if (isViewingResults) {
      const gridCompId = "result_grid:active";
      const gridSchema: ComponentSchema = {
        id: gridCompId,
        meta: {
          tableName: currentSummary?.tableName,
          columns: currentSummary?.columns,
          rowCount: currentSummary?.totalFiltered,
        },
        actions: {
          RUN_SQL: {
            description: "Executes a DuckDB SQL query against the active dataset ({ query }).",
            whenToCall: "When the user requests custom SQL queries, aggregations, or calculations.",
            whenNotToCall: "When the table is not loaded or simple column filtering is sufficient.",
          },
          SQL: {
            description: "Executes a DuckDB SQL query against the active dataset ({ query }).",
            whenToCall: "When the user requests custom SQL queries, aggregations, or calculations.",
            whenNotToCall: "When the table is not loaded or simple column filtering is sufficient.",
          },
          QUERY: {
            description: "Updates the grid view via SQL or opens a derived view ({ query }).",
            whenToCall: "When the user wants derived columns or grouped table views.",
            whenNotToCall: "When only changing simple filters or sorting.",
          },
          FILTER: {
            description: "Filters the grid ({ field, value, op }).",
            whenToCall: "To filter table data by a column value.",
            whenNotToCall: "When filtering is not requested.",
          },
          APPLY_FILTERS: {
            description: "Applies multiple filters to the table simultaneously ({ filters, clearOthers }).",
            whenToCall: "When multiple columns need to be filtered concurrently.",
            whenNotToCall: "When filtering only a single column.",
          },
          SORT: {
            description: "Sorts the grid by column ({ column, direction }).",
            whenToCall: "When sorting is requested.",
            whenNotToCall: "When sorting is not requested.",
          },
          COLUMNS: {
            description: "Shows, hides, or reorders columns ({ visibleColumns, hiddenColumns }).",
            whenToCall: "To adjust column visibility or layout.",
            whenNotToCall: "When column layout should remain untouched.",
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
            description: "Exports data to Excel, CSV, or Parquet ({ format }).",
            whenToCall: "When downloading or exporting grid data is requested.",
            whenNotToCall: "When export is not requested.",
          },
          VISUALIZE: {
            description: "Generates a chart or visual plot ({ type, dimension, metric }).",
            whenToCall: "When a chart or graph visualization is requested.",
            whenNotToCall: "When no visual chart is requested.",
          },
          CHART: {
            description: "Generates a chart or visual plot ({ type, dimension, metric }).",
            whenToCall: "When a chart or graph visualization is requested.",
            whenNotToCall: "When no visual chart is requested.",
          },
          ANALYZE: {
            description: "Generates a statistical summary of the active data.",
            whenToCall: "When statistical summary or data distribution is requested.",
            whenNotToCall: "When summary analysis is not requested.",
          },
          PROFILE: {
            description: "Profiles column data quality, null counts, and distinct values.",
            whenToCall: "When inspecting data quality or anomalies.",
            whenNotToCall: "When profiling is not requested.",
          },
        },
      };
      uiRegistry.register(gridSchema);
      registeredCompIds.push(gridCompId);
      unsubscribes.push(
        uiEventBus.subscribe(gridCompId, (action, payload) =>
          executeDispatchComponentAction({ component_id: gridCompId, action, payload }) as any
        )
      );
    } else if (reportScope) {
      const formCompId = `criteria_form:${reportScope}`;
      const formSchema: ComponentSchema = {
        id: formCompId,
        meta: {
          reportScope,
          screenTitle,
          workspaceId,
        },
        actions: {
          SET_FIELDS: {
            description: "Populates criteria form fields without executing the report ({ criteria }).",
            whenToCall: "When the user specifies store, date, or filter parameters to fill in the form.",
            whenNotToCall: "When the user explicitly wants to run or execute the report (call SUBMIT or RUN).",
          },
          APPLY: {
            description: "Populates criteria form fields and updates the form ({ criteria }).",
            whenToCall: "When the user prepares or updates criteria parameters.",
            whenNotToCall: "When the user commands to run the report directly.",
          },
          SUBMIT: {
            description: "Executes the report and starts the job ({ criteria }).",
            whenToCall: "When the user explicitly asks to run, execute, fetch, or generate the report.",
            whenNotToCall: "When only filling form fields without running.",
          },
          RUN: {
            description: "Executes the report and starts the job ({ criteria }).",
            whenToCall: "When the user explicitly asks to run, execute, fetch, or generate the report.",
            whenNotToCall: "When only filling form fields without running.",
          },
          SCHEMA: {
            description: "Inspects the report criteria schema and parameter definitions.",
            whenToCall: "To discover parameter names, data types, and constraints.",
            whenNotToCall: "When the criteria schema is already known.",
          },
          READ: {
            description: "Reads current draft criteria values from the active form.",
            whenToCall: "To inspect the current values filled in the criteria form.",
            whenNotToCall: "When assigning or overwriting new values.",
          },
          VALIDATE: {
            description: "Validates criteria input parameters against schema rules.",
            whenToCall: "To check parameter constraints before execution.",
            whenNotToCall: "When validation is not needed.",
          },
        },
      };
      uiRegistry.register(formSchema);
      registeredCompIds.push(formCompId);
      unsubscribes.push(
        uiEventBus.subscribe(formCompId, (action, payload) =>
          executeDispatchComponentAction({ component_id: formCompId, action, payload }) as any
        )
      );
    }

    return () => {
      unsubscribes.forEach((unsub) => unsub());
      registeredCompIds.forEach((id) => uiRegistry.unregister(id));
      useYulaGridStore.getState().unregisterScreen();
      useYulaGridStore.getState().unregister();
    };
  }, [
    input.screenId,
    input.screenTitle,
    input.workspaceId,
    input.activeReportScope,
    summary?.isViewingResults,
    summary?.jobId,
  ]);

  // Şema grounding zenginleştirmesi: columnTypes/sampleRows (Arrow/DuckDB
  // şeması + ilk satırlar) store'a aynalanır ki sistem promptu modeli gerçek
  // tipler ve veri dokusuyla beslesin. Veri yüklendikçe/filtre değiştikçe
  // tazelenir; temizlik YAPMAZ — filtre akışı bozulmasın.
  React.useEffect(() => {
    const spec = useYulaGridStore.getState().spec;
    if (!spec || !summary?.tableName || spec.tableName !== summary.tableName) {
      return;
    }
    const columnTypes = summary.columnTypes as Record<string, string> | undefined;
    const sampleRows = summary.sampleRows as
      | Array<Record<string, unknown>>
      | undefined;
    const columnValues = summary.columnValues as
      | Record<string, string[]>
      | undefined;
    const columnDescriptions = summary.columnDescriptions as
      | Record<string, string>
      | undefined;
    const reportScope = summary.reportScope as string | undefined;
    if (
      !columnTypes &&
      !sampleRows &&
      !columnValues &&
      !columnDescriptions &&
      !reportScope
    )
      return;
    useYulaGridStore.getState().register({
      ...spec,
      ...(columnTypes ? { columnTypes: { ...columnTypes } } : null),
      ...(sampleRows?.length ? { sampleRows: sampleRows.slice(0, 3) } : null),
      ...(columnValues ? { columnValues: { ...columnValues } } : null),
      ...(columnDescriptions
        ? { columnDescriptions: { ...columnDescriptions } }
        : null),
      ...(reportScope ? { reportScope } : null),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary?.tableName, summary?.columnTypes, summary?.sampleRows, summary?.columnValues, summary?.columnDescriptions, summary?.reportScope]);

  return {
    unregister: () => {},
    status: "registered-grid-context",
  };
}
