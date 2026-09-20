"use client";

import * as React from "react";
import { uiRegistry, uiEventBus, type ComponentSchema } from "@my-agent/core";
import { executeDispatchComponentAction } from "@/lib/client-tools/dispatch-bridge";
import { useYulaGridStore } from "@/lib/stores/grid";
import { REGISTERED_REPORTS } from "@/features/reports/report-registry";

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
    const rawScope = (current.activeReportScope as string) || (current.screenId as string);
    const registeredReport = REGISTERED_REPORTS.find(
      (r) => r.scope === rawScope || (r.pagePath && current.screenId && current.screenId.includes(r.scope))
    );
    const reportScope = registeredReport?.scope || (current.activeReportScope as string) || undefined;
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
      reportScope: reportScope || screenId,
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
    // Note: 'result_grid:active' is natively registered by ArrowReportGrid via useAgentComponent.
    // Note: Only register criteria_form if this is truly a registered report.
    if (!isViewingResults && registeredReport && reportScope) {
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
