"use client";

import * as React from "react";
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
    const screenId = input.screenId || (input.activeReportScope as string) || "screen";
    const screenTitle = input.screenTitle || "";
    const workspaceId = (input.workspaceId as string) || "stock";
    const reportScope = (input.activeReportScope as string) || (input.screenId as string);
    const isViewingResults = Boolean(summary?.isViewingResults);
    const quickPrompts = (input.quickPrompts as string[]) || [];
    const criteriaDigest = (input.criteriaDigest as Array<Record<string, unknown>>) || [];
    const tools = (input.tools as Array<{ name: string; description?: string }>) || [
      {
        name: "apply_criteria",
        description: "Rapor şemasına göre zorunlu alanları gözeterek önerilen kriterleri ekrandaki kriter formuna doldurur.",
      },
      {
        name: "run_job",
        description: "Rapor şemasına göre zorunlu alanları gözeterek rapor job'ını başlatır ve execution ekranında yeni işi seçili/çalışır gösterir.",
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
      jobId: summary?.jobId as string | undefined,
    });

    return () => {
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
