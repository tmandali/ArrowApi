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
            description: "DuckDB SQL sorgusu çalıştırır ({ query }).",
            whenToCall: "Kullanıcı SQL veya özel hesaplama istediğinde.",
            whenNotToCall: "Tablo henüz ekranda değilken veya basit filtre yeterliyken.",
          },
          SQL: {
            description: "DuckDB SQL sorgusu çalıştırır ({ query }).",
            whenToCall: "Kullanıcı SQL veya özel hesaplama istediğinde.",
            whenNotToCall: "Tablo henüz ekranda değilken veya basit filtre yeterliyken.",
          },
          QUERY: {
            description: "Grid görünümünü SQL ile günceller / türetilmiş görünüm açar ({ query }).",
            whenToCall: "Kullanıcı türetilmiş kolonlar veya gruplanmış tablo görünümü istediğinde.",
            whenNotToCall: "Sadece filtre veya sıralama değiştirilirken.",
          },
          FILTER: {
            description: "Gridi filtreler ({ field, value, op }).",
            whenToCall: "Tablo verisini süzmek için.",
            whenNotToCall: "Kullanıcı filtreleme istemediğinde.",
          },
          APPLY_FILTERS: {
            description: "Çoklu filtreleri tabloya uygular ({ filters, clearOthers }).",
            whenToCall: "Birden fazla kolonda eş zamanlı filtreleme gerektiğinde.",
            whenNotToCall: "Tek bir kolon filtrelenirken.",
          },
          SORT: {
            description: "Kolona göre sıralar ({ column, direction }).",
            whenToCall: "Sıralama istendiğinde.",
            whenNotToCall: "Sıralama istenmediğinde.",
          },
          COLUMNS: {
            description: "Sütunları gösterir/gizler/sıralar ({ visibleColumns, hiddenColumns }).",
            whenToCall: "Sütun görünürlüğü için.",
            whenNotToCall: "Sütun düzeni değiştirilmek istenmediğinde.",
          },
          PIN: {
            description: "Sütunları sabitler ({ columns }).",
            whenToCall: "Sütun dondurma istendiğinde.",
            whenNotToCall: "Sabitleme istenmediğinde.",
          },
          RESET_LAYOUT: {
            description: "Varsayılan ızgara yerleşimine döner.",
            whenToCall: "Yerleşimi sıfırlamak istendiğinde.",
            whenNotToCall: "Mevcut düzen korunmak istendiğinde.",
          },
          EXPORT: {
            description: "Veriyi dışa aktarır ({ format }).",
            whenToCall: "Excel/CSV/Parquet indirme istendiğinde.",
            whenNotToCall: "Dışa aktarma istenmediğinde.",
          },
          VISUALIZE: {
            description: "Grafik oluşturur ({ type, dimension, metric }).",
            whenToCall: "Görsel grafik istendiğinde.",
            whenNotToCall: "Grafik istenmediğinde.",
          },
          CHART: {
            description: "Grafik oluşturur ({ type, dimension, metric }).",
            whenToCall: "Görsel grafik veya çizelge istendiğinde.",
            whenNotToCall: "Grafik istenmediğinde.",
          },
          ANALYZE: {
            description: "Veri analiz özeti çıkarır.",
            whenToCall: "İstatistiki özet istendiğinde.",
            whenNotToCall: "Özet analiz istenmediğinde.",
          },
          PROFILE: {
            description: "Sütun veri kalitesi profili çıkarır.",
            whenToCall: "Veri kalitesi incelenirken.",
            whenNotToCall: "Profilleme istenmediğinde.",
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
            description: "Kriter formu alanlarını doldurur/günceller ({ criteria }).",
            whenToCall: "Kullanıcı mağaza, tarih veya filtre kriteri belirtip doldurmak istediğinde.",
            whenNotToCall: "Kullanıcı doğrudan raporu çalıştırmak istediğinde (SUBMIT/RUN çağrılmalı).",
          },
          APPLY: {
            description: "Kriter formu alanlarını doldurur/günceller ({ criteria }).",
            whenToCall: "Kullanıcı kriter belirlediğinde veya hazırlık istendiğinde.",
            whenNotToCall: "Kullanıcı çalıştırma emri verdiğinde.",
          },
          SUBMIT: {
            description: "Raporu çalıştırır ({ criteria }).",
            whenToCall: "Kullanıcı açıkça 'çalıştır', 'getir', 'koştur', 'al' dediğinde.",
            whenNotToCall: "Sadece alan doldurma istendiğinde.",
          },
          RUN: {
            description: "Raporu çalıştırır ({ criteria }).",
            whenToCall: "Kullanıcı açıkça 'çalıştır', 'getir', 'koştur' dediğinde.",
            whenNotToCall: "Sadece alan doldurma istendiğinde.",
          },
          SCHEMA: {
            description: "Rapor kriter şemasını inceler.",
            whenToCall: "Raporun hangi alanları aldığını öğrenmek için.",
            whenNotToCall: "Şema zaten biliniyorken.",
          },
          READ: {
            description: "Formdaki mevcut değerleri okur.",
            whenToCall: "Kullanıcının yazdığı mevcut kriterleri öğrenmek için.",
            whenNotToCall: "Yeni değerler atanırken.",
          },
          VALIDATE: {
            description: "Kriterlerin geçerliliğini doğrular.",
            whenToCall: "Çalıştırmadan önce zorunlu alanları doğrulamak için.",
            whenNotToCall: "Doğrulama istenmediğinde.",
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
