import * as React from "react"
import { useLocation } from "react-router-dom"
import { RotateCw, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { useDuckReport, type ReportColumnMeta } from "../hooks/use-duck-report"
import { useScreenAgentContext } from "@/hooks/use-screen-agent-context"
import { duckDbClient, buildCombinedWhereClause } from "@/services/duckdb"
import { extractCleanFilterValue, resolveGridColumn } from "@/lib/grid-filter-resolver"
import { deriveColumnKind, isDateLikeValue, isNumericLikeValue } from "../lib/column-type-utils"
import {
  VirtualSpreadsheet,
  cellInputClass,
  cellClass,
  type SpreadsheetColumn,
} from "@/features/stock/item/components/VirtualSpreadsheet"
import { cn } from "@/utils/cn"
import { formatCount } from "@/utils/format"

export type ArrowReportGridProps = {
  title?: string
  jobId: string | null | undefined
  jobUrl: string | null | undefined
  columns?: SpreadsheetColumn[]
  expectedTotalRows?: number | null
  initialRows?: Record<string, unknown>[]
  showFilterRow?: boolean
  onShowFilterRowChange?: (open: boolean) => void
  className?: string
  headerActions?: React.ReactNode
  onError?: (err: string | null) => void
}

/**
 * Uygulama genelinde tüm Arrow raporları için ortak, DuckDB Wasm + OPFS destekli
 * yüksek performanslı sanal spreadsheet bileşeni.
 *
 * Herhangi bir workspace'teki (Stok, Satış, Muhasebe, Üretim vb.) rapor için
 * tek satırla bağlanır; 100k-1M+ satırlık verilerde anında SQL filtreleme sağlar.
 */

/**
 * columnTypes haritası Arrow/DuckDB şemasından türetilir (column-type-utils).
 * Yula'ya şema grounding olarak verilir; filtre değerlerinin kolon tipiyle
 * uyumu hem modele öğretilir hem execution anında jenerik doğrulanır.
 */
const columnTypesHintOf = (types: Record<string, string>): string =>
  Object.entries(types)
    .map(([name, kind]) =>
      kind === "text" ? name : `${name}(${kind === "date" ? "tarih" : kind})`
    )
    .join(", ")

export function ArrowReportGrid({
  title = "Report Result",
  jobId,
  jobUrl,
  columns = [],
  expectedTotalRows,
  initialRows = [],
  showFilterRow = false,
  onShowFilterRowChange,
  className,
  headerActions,
  onError,
}: ArrowReportGridProps) {
  const metaColumns = React.useMemo<ReportColumnMeta[]>(
    () =>
      columns.map((col) => ({
        name: col.name,
        label: col.label,
        align: col.align,
        isNumeric: col.align === "right",
      })),
    [columns]
  )

  const {
    columns: discoveredCols,
    rows,
    totalRows,
    totalFiltered,
    streamedRows,
    progressPercent,
    filters,
    setFilter,
    loadMore,
    hasMore,
    isStreaming,
    isSavingDisk,
    isLoadingQuery,
    refresh,
  } = useDuckReport({
    jobId,
    jobUrl,
    columns: metaColumns,
    expectedTotalRows,
    onError,
  })

  const effectiveColumns = React.useMemo<SpreadsheetColumn[]>(() => {
    if (columns.length > 0) return columns
    return discoveredCols.map((c) => ({
      name: c.name,
      label: c.label ?? c.name,
      align: c.align ?? (c.isNumeric ? "right" : "left"),
    }))
  }, [columns, discoveredCols])

  /**
   * Arrow/DuckDB şemasından türetilmiş kolon tip haritası.
   * Yula'ya (Needle/LLM) şema grounding olarak verilir; filtre değerlerinin
   * kolon tipiyle (tarih/sayı/metin) uyumlu olmasını hem modele öğretir hem
   * execution anında jenerik olarak doğrular.
   */
  const columnTypes = React.useMemo<Record<string, string>>(() => {
    const map: Record<string, string> = {}
    for (const c of metaColumns) map[c.name] = deriveColumnKind(c.duckType, c.isNumeric)
    for (const c of discoveredCols) map[c.name] = deriveColumnKind(c.duckType, c.isNumeric)
    return map
  }, [metaColumns, discoveredCols])

  /** Needle'a tool tanımı içinde giden tipli kolon özeti. */
  const columnTypesHint = React.useMemo(() => columnTypesHintOf(columnTypes), [columnTypes])

  const displayRows = rows.length > 0 ? rows : initialRows

  const sampleRows = React.useMemo(() => {
    return displayRows.slice(0, 3).map((r) => {
      const simplified: Record<string, unknown> = {}
      for (const col of effectiveColumns) {
        if (r[col.name] !== undefined) simplified[col.name] = r[col.name]
      }
      return simplified
    })
  }, [displayRows, effectiveColumns])

  const { pathname } = useLocation()
  const currentWorkspace = pathname.split("/")[1] || undefined

  // Yula AI'ı doğrudan bu açık olan DuckDB sonuç tablosuna ve filtre satırına bağla
  useScreenAgentContext({
    screenId: `report-grid-${jobId || "view"}`,
    screenTitle: `${title} Tablosu`,
    workspaceId: currentWorkspace,
    activeFilters: filters,
    activeDataSummary: {
      isViewingResults: true,
      jobId,
      totalRows,
      totalFiltered,
      columns: effectiveColumns.map((c) => c.name),
      // Arrow/DuckDB şema tipleri — Needle/LLM şema grounding'i
      columnTypes,
      sampleRows,
    },
    tools: [
      {
        name: "filter_active_grid",
        description: `Mevcut ekranda açık olan ${title} tablosunun filtre satırına değer yazar ve tabloyu süzer.${
          columnTypesHint
            ? ` Kolon tipleri (şemadan): ${columnTypesHint}. Tarih kolonlarına yalnız tarih (YYYY-MM-DD), sayı kolonlarına yalnız sayı/aralık yazılır; soru cümleleri asla değer olamaz.`
            : ""
        }`,
        parameters: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Filtrelenecek SKU, kod, ürün adı veya arama terimi (örn: SKU-001, >100, 100..500)",
            },
            value: {
              type: "string",
              description: "Filtre değeri (örn: SKU-001)",
            },
            column: {
              type: "string",
              description: "Filtrenin uygulanacağı kolon adı (örn: ItemCode, Warehouse, Balance)",
            },
            sku: {
              type: "string",
              description: "Filtrelenecek SKU / Item No (örn: SKU-001)",
            },
          },
        },
        execute: (args: Record<string, any>) => {
          let columnHint = args.column || args.col || args.columnName || args.targetColumn;
          let rawVal =
            args.query ||
            args.value ||
            args.val ||
            args.filter ||
            args.filterValue ||
            args.sku ||
            args.code ||
            args.searchTerm ||
            args.text;

          // Eğer doğrudan kolon ismi parametre olarak geçilmişse (örn: { ItemCode: "SKU-001" } veya { Warehouse: "MAIN" })
          if (!rawVal) {
            for (const [k, v] of Object.entries(args)) {
              if (k !== "column" && k !== "col" && v !== undefined && v !== null && String(v).trim()) {
                columnHint = columnHint || k;
                rawVal = String(v).trim();
                break;
              }
            }
          }

          if (!rawVal) return { success: false, message: "Filtre değeri bulunamadı." };

          const cleanResult = extractCleanFilterValue(String(rawVal));
          const val = cleanResult.value || String(rawVal).trim();
          if (!val || val.trim().length === 0) {
            return { success: false, message: "Filtrelenecek geçerli bir değer veya kriter bulunamadı." };
          }

          // Cümle/soru koruması: Doğal dil sorularını filtre kutularına yazmayı engelle
          const isFullSentence = val.includes("?") || (val.split(/\s+/).length >= 4 && !/[><=..|&!]/.test(val));
          if (isFullSentence) {
            return { success: false, message: "Belirtilen ifade bir soru/cümledir; filtrelenecek geçerli bir veri değeri bulunamadı." };
          }

          const targetCol = resolveGridColumn(columnHint || cleanResult.columnHint, effectiveColumns, String(val), sampleRows);

          if (!targetCol) {
            return {
              success: false,
              message: `Tabloda "${columnHint || cleanResult.columnHint || val}" kriteriyle eşleşen bir kolon bulunamadı.`,
            };
          }

          // Şema-tipi doğrulaması (Arrow/DuckDB): değerin fiziksel tipi kolonla uyumlu mu?
          // Kelime listesi tutmak yerine tipten türetilen JENERİK kontrol.
          const colKind = columnTypes[targetCol] || "text";
          if (colKind === "date" && !isDateLikeValue(val)) {
            return {
              success: false,
              message: `"${targetCol}" bir TARİH kolonu; "${val}" geçerli bir tarih değil. Örn: 2025-01-31 veya 2025-01-01..2025-01-31. Kayıt sayısı gibi sorular için KPI özeti isteyin.`,
            };
          }
          if (colKind === "number" && !isNumericLikeValue(val)) {
            return {
              success: false,
              message: `"${targetCol}" bir SAYI kolonu; "${val}" sayısal değil. Örn: 100..500, >1000, <>0. Kayıt sayısı gibi sorular için KPI özeti isteyin.`,
            };
          }

          let finalVal = val;
          const targetColLower = targetCol.toLowerCase();
          const valLower = val.toLowerCase();
          if (targetColLower.includes("passiv") || targetColLower.includes("pasif") || targetColLower.includes("disabled") || targetColLower.includes("blocked")) {
            if (/^(pasif|passive|kapalı|kapali|1|true)/i.test(valLower)) finalVal = "true";
            else if (/^(aktif|active|açık|acik|0|false)/i.test(valLower)) finalVal = "false";
          } else if (targetColLower.includes("activ") || targetColLower.includes("aktif")) {
            if (/^(pasif|passive|kapalı|kapali|0|false)/i.test(valLower)) finalVal = "false";
            else if (/^(aktif|active|açık|acik|1|true)/i.test(valLower)) finalVal = "true";
          }

          console.log("[ArrowReportGrid:filter_active_grid] Filtre uygulanıyor:", {
            rawVal,
            val: finalVal,
            requestedColumn: args.column,
            targetCol,
            columns: effectiveColumns.map((c) => c.name),
          });

          // Önceki yanlış kolonda (örn: Id) filtre kalmışsa temizle
          if (filters["Id"] && targetCol !== "Id") setFilter("Id", "");
          if (filters["id"] && targetCol !== "id") setFilter("id", "");

          setFilter(targetCol, finalVal);
          onShowFilterRowChange?.(true);

          const colLabel = effectiveColumns.find((c) => c.name === targetCol)?.label || targetCol;

          return {
            success: true,
            appliedColumn: targetCol,
            appliedValue: finalVal,
            message: `Tablonun "${colLabel || targetCol}" filtresine "${finalVal}" uygulandı.`,
          };
        },
      },
      {
        name: "clear_grid_filters",
        description: "Tablodaki tüm filtreleri temizler.",
        parameters: {
          type: "object",
          properties: {},
        },
        execute: () => {
          effectiveColumns.forEach((c) => setFilter(c.name, ""));
          return { success: true, message: "Tablo filtreleri temizlendi." };
        },
      },
      {
        name: "analyze_grid_data",
        description: `Açık olan ${title} tablosundaki verileri özetler, en yüksek kayıtları listeler veya pasta/çubuk grafik kartı üretir.`,
        parameters: {
          type: "object",
          properties: {
            chartType: {
              type: "string",
              enum: ["bar", "pie", "kpi"],
              description: "Grafik tipi (bar, pie veya kpi)",
            },
            title: {
              type: "string",
              description: "Grafik veya analiz başlığı",
            },
            groupByColumn: {
              type: "string",
              description: "Gruplanacak kolon (örn: item_code, description, warehouse, city)",
            },
            valueColumn: {
              type: "string",
              description: "Toplanacak sayısal kolon (örn: balance, amount, stock, quantity)",
            },
          },
        },
        execute: async (args) => {
          if (effectiveColumns.length === 0) {
            return { success: false, message: "Analiz edilecek kolon bulunamadı." };
          }

          // 1. Sayısal ve etiket kolonlarını veri tipine göre bul (Type-Driven Discovery)
          let valCol: string | undefined;
          if (args.valueColumn) {
            valCol = resolveGridColumn(args.valueColumn, effectiveColumns, undefined, sampleRows);
          }
          if (!valCol) {
            const numCol = effectiveColumns.find(
              (c) => c.align === "right" || (displayRows[0] && typeof displayRows[0][c.name] === "number")
            );
            valCol = numCol ? numCol.name : effectiveColumns[0]?.name;
          }

          let labelCol: string | undefined;
          if (args.groupByColumn) {
            labelCol = resolveGridColumn(args.groupByColumn, effectiveColumns, undefined, sampleRows);
          }
          if (!labelCol) {
            const descriptiveCol = effectiveColumns.find(
              (c) => !/^(id|row_id|guid)$/i.test(c.name) && c.name !== valCol && c.align !== "right"
            );
            labelCol = descriptiveCol ? descriptiveCol.name : effectiveColumns.find((c) => c.name !== "Id" && c.name !== valCol)?.name || effectiveColumns[0]?.name;
          }

          const valLabel = effectiveColumns.find((c) => c.name === valCol)?.label || valCol || "Değer";
          const tableName = jobId ? `report_${jobId.replace(/[^a-zA-Z0-9_]/g, "_")}` : "current_report";

          // 2. DuckDB WASM üzerinden doğrudan tam veri seti üzerinde SQL aggregasyonu çalıştır
          const numericColsSet = new Set<string>(
            effectiveColumns.filter((c) => c.align === "right" || (displayRows[0] && typeof displayRows[0][c.name] === "number")).map((c) => c.name)
          );

          try {
            const whereClause = buildCombinedWhereClause(filters, numericColsSet);
            const statsSql = `SELECT COUNT(*) as row_count, COALESCE(SUM(TRY_CAST("${valCol}" AS DOUBLE)), 0) as total_sum, COALESCE(AVG(TRY_CAST("${valCol}" AS DOUBLE)), 0) as avg_val FROM "${tableName}" ${whereClause}`;
            console.log("[analyze_grid_data] DuckDB Stats SQL:", statsSql);
            const statsRows = await duckDbClient.executeCustomSql(statsSql);

            const topSql = `SELECT COALESCE(CAST("${labelCol}" AS VARCHAR), 'Diğer') as name, ROUND(SUM(TRY_CAST("${valCol}" AS DOUBLE)), 2) as value FROM "${tableName}" ${whereClause} GROUP BY 1 ORDER BY 2 DESC LIMIT 5`;
            console.log("[analyze_grid_data] DuckDB Top SQL:", topSql);
            const topRows = await duckDbClient.executeCustomSql(topSql);

            if (statsRows && statsRows.length > 0 && Number(statsRows[0].row_count) > 0) {
              const rowCount = Number(statsRows[0].row_count || totalFiltered || totalRows || 0);
              const totalSum = Number(statsRows[0].total_sum || 0);
              const avg = Number(statsRows[0].avg_val || 0);

              const chartData = (topRows || []).map((r) => ({
                name: String(r.name || "Kayıt"),
                value: Number(r.value || 0),
              }));

              const activeFilterEntries = Object.entries(filters).filter(([_, v]) => v && String(v).trim().length > 0);
              const hasActiveFilters = activeFilterEntries.length > 0;
              const activeFiltersSummary = activeFilterEntries
                .map(([col, val]) => {
                  const colLabel = effectiveColumns.find((c) => c.name === col)?.label || col;
                  return `${colLabel}: "${val}"`;
                })
                .join(", ");

              const totalAllRows = totalRows || rowCount;
              const isSubset = hasActiveFilters && totalAllRows > rowCount;

              const cardTitle = args.title || (isSubset ? `${title} — Filtrelenmiş Analiz` : `${title} — Genel Özet & Analiz`);
              const cardSummary = isSubset
                ? `🔍 Aktif Filtre (${activeFiltersSummary}) — ${rowCount.toLocaleString()} / ${totalAllRows.toLocaleString()} kayıt`
                : `Tüm ${rowCount.toLocaleString()} kayıt üzerinden ${valLabel} analizi`;

              const cardMessage = isSubset
                ? `📊 **${title} (Filtreli Görünüm):** Tablodaki aktif filtreler (**${activeFiltersSummary}**) uygulanarak **${rowCount.toLocaleString()}** kayıt (toplam ${totalAllRows.toLocaleString()} içinden) analiz edildi. Filtrelenmiş toplam **${Math.round(totalSum).toLocaleString()} ${valLabel}**.`
                : `📊 **${title}:** Tablodaki tüm **${rowCount.toLocaleString()}** kayıt analiz edildi, genel toplam **${Math.round(totalSum).toLocaleString()} ${valLabel}**.`;

              return {
                success: true,
                customKind: "yula_chart_card",
                title: cardTitle,
                summary: cardSummary,
                chartType: args.chartType || (chartData.length <= 4 ? "pie" : "bar"),
                chartData,
                kpis: [
                  {
                    label: isSubset ? `Filtreli ${valLabel}` : `Toplam ${valLabel}`,
                    value: Math.round(totalSum).toLocaleString(),
                    sublabel: `${rowCount.toLocaleString()} satır toplamı`,
                  },
                  {
                    label: isSubset ? "Filtrelenmiş Satır" : "Toplam Satır",
                    value: rowCount.toLocaleString(),
                    sublabel: isSubset ? `Toplam ${totalAllRows.toLocaleString()} içinden` : "Tüm Kayıtlar",
                  },
                  {
                    label: `Ortalama ${valLabel}`,
                    value: (Math.round(avg * 10) / 10).toLocaleString(),
                    sublabel: "Kayıt Başına",
                  },
                ],
                message: cardMessage,
              };
            }
          } catch (err) {
            console.warn("[analyze_grid_data] DuckDB SQL aggregate fallback to in-memory:", err);
          }

          // In-Memory Fallback (Eğer DuckDB tablosu henüz hazır değilse)
          let totalSum = 0;
          const groupMap: Record<string, number> = {};

          for (const row of displayRows) {
            const rawVal = valCol ? row[valCol] : 1;
            const num = typeof rawVal === "number" ? rawVal : parseFloat(String(rawVal).replace(/[^0-9.-]/g, "")) || 0;
            totalSum += num;

            const lbl = labelCol ? String(row[labelCol] || "Diğer") : "Kayıt";
            groupMap[lbl] = (groupMap[lbl] || 0) + num;
          }

          const sortedItems = Object.entries(groupMap)
            .map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }))
            .sort((a, b) => b.value - a.value);

          const topItems = sortedItems.slice(0, 5);
          const otherSum = sortedItems.slice(5).reduce((acc, curr) => acc + curr.value, 0);
          if (otherSum > 0 && sortedItems.length > 5) {
            topItems.push({ name: "Diğer", value: Math.round(otherSum * 100) / 100 });
          }

          const activeCount = totalFiltered || totalRows || displayRows.length;
          const avg = displayRows.length > 0 ? totalSum / displayRows.length : 0;

          const activeFilterEntries = Object.entries(filters).filter(([_, v]) => v && String(v).trim().length > 0);
          const hasActiveFilters = activeFilterEntries.length > 0;
          const activeFiltersSummary = activeFilterEntries
            .map(([col, val]) => {
              const colLabel = effectiveColumns.find((c) => c.name === col)?.label || col;
              return `${colLabel}: "${val}"`;
            })
            .join(", ");

          const totalAllRows = totalRows || activeCount;
          const isSubset = hasActiveFilters && totalAllRows > activeCount;

          return {
            success: true,
            customKind: "yula_chart_card",
            title: args.title || (isSubset ? `${title} — Filtrelenmiş Analiz` : `${title} — Genel Özet & Analiz`),
            summary: isSubset
              ? `🔍 Aktif Filtre (${activeFiltersSummary}) — ${activeCount.toLocaleString()} / ${totalAllRows.toLocaleString()} kayıt`
              : `Tüm ${activeCount.toLocaleString()} kayıt üzerinden ${valLabel} analizi`,
            chartType: args.chartType || (topItems.length <= 4 ? "pie" : "bar"),
            chartData: topItems,
            kpis: [
              {
                label: isSubset ? `Filtreli ${valLabel}` : `Toplam ${valLabel}`,
                value: Math.round(totalSum).toLocaleString(),
                sublabel: `${activeCount.toLocaleString()} satır toplamı`,
              },
              {
                label: isSubset ? "Filtrelenmiş Satır" : "Toplam Satır",
                value: activeCount.toLocaleString(),
                sublabel: isSubset ? `Toplam ${totalAllRows.toLocaleString()} içinden` : "Tüm Kayıtlar",
              },
              {
                label: `Ortalama ${valLabel}`,
                value: (Math.round(avg * 10) / 10).toLocaleString(),
                sublabel: "Kayıt Başına",
              },
            ],
            message: isSubset
              ? `📊 **${title} (Filtreli Görünüm):** Tablodaki aktif filtreler (**${activeFiltersSummary}**) uygulanarak **${activeCount.toLocaleString()}** kayıt analiz edildi.`
              : `📊 **${title}:** ${activeCount.toLocaleString()} satır analiz edildi, genel toplam ${Math.round(totalSum).toLocaleString()} ${valLabel}.`,
          };
        },
      },
      {
        name: "detect_grid_anomalies",
        description: `Açık olan ${title} tablosunda kritik anomalileri (eksiye düşen stoklar, sıfır bakiyeler, aşırı sapmalar) analiz eder ve uyarı kartı üretir.`,
        parameters: {
          type: "object",
          properties: {
            anomalyType: {
              type: "string",
              enum: ["all", "negative", "zero", "outliers"],
              description: "İncelenecek anomali türü (all, negative, zero, outliers)",
            },
          },
        },
        execute: async (_args) => {
          if (effectiveColumns.length === 0) {
            return { success: false, message: "Analiz edilecek kolon bulunamadı." };
          }

          const numCol = effectiveColumns.find(
            (c) => c.align === "right" || (displayRows[0] && typeof displayRows[0][c.name] === "number")
          );
          const valCol = numCol ? numCol.name : effectiveColumns[0]?.name;
          const valLabel = effectiveColumns.find((c) => c.name === valCol)?.label || valCol || "Değer";

          const descriptiveCol = effectiveColumns.find(
            (c) => !/^(id|row_id|guid)$/i.test(c.name) && c.name !== valCol && c.align !== "right"
          );
          const labelCol = descriptiveCol ? descriptiveCol.name : effectiveColumns.find((c) => c.name !== "Id" && c.name !== valCol)?.name || effectiveColumns[0]?.name;

          const tableName = jobId ? `report_${jobId.replace(/[^a-zA-Z0-9_]/g, "_")}` : "current_report";

          try {
            // 1. Eksi Bakiye ve Sıfır Bakiye Taraması
            const negSql = `SELECT COUNT(*) as neg_count, COALESCE(SUM(TRY_CAST("${valCol}" AS DOUBLE)), 0) as neg_sum FROM "${tableName}" WHERE TRY_CAST("${valCol}" AS DOUBLE) < 0`;
            const zeroSql = `SELECT COUNT(*) as zero_count FROM "${tableName}" WHERE TRY_CAST("${valCol}" AS DOUBLE) = 0`;
            const topNegSql = `SELECT COALESCE(CAST("${labelCol}" AS VARCHAR), 'Kayıt') as name, ROUND(TRY_CAST("${valCol}" AS DOUBLE), 2) as value FROM "${tableName}" WHERE TRY_CAST("${valCol}" AS DOUBLE) < 0 ORDER BY 2 ASC LIMIT 5`;

            const [negRows, zeroRows, topNegRows] = await Promise.all([
              duckDbClient.executeCustomSql(negSql).catch(() => []),
              duckDbClient.executeCustomSql(zeroSql).catch(() => []),
              duckDbClient.executeCustomSql(topNegSql).catch(() => []),
            ]);

            const negCount = Number(negRows?.[0]?.neg_count || 0);
            const negSum = Math.round(Number(negRows?.[0]?.neg_sum || 0) * 100) / 100;
            const zeroCount = Number(zeroRows?.[0]?.zero_count || 0);

            const chartData = (topNegRows || []).map((r) => ({
              name: String(r.name || "Kayıt"),
              value: Math.abs(Number(r.value || 0)),
            }));

            const hasAnomalies = negCount > 0 || zeroCount > 0;

            return {
              success: true,
              customKind: "yula_chart_card",
              title: `🚨 ${title} — Anomali & Risk Analizi`,
              summary: hasAnomalies
                ? `⚠️ ${negCount} adet eksi bakiye (${negSum.toLocaleString()} ${valLabel}) ve ${zeroCount} adet sıfır bakiye tespit edildi.`
                : `✅ Tabloda herhangi bir eksi veya kritik anomali tespit edilmedi.`,
              chartType: "bar",
              chartData: chartData.length > 0 ? chartData : undefined,
              kpis: [
                {
                  label: "Eksi Bakiyeli Kalem",
                  value: negCount.toLocaleString(),
                  sublabel: `${negSum.toLocaleString()} ${valLabel}`,
                },
                {
                  label: "Sıfır Bakiyeli Kalem",
                  value: zeroCount.toLocaleString(),
                  sublabel: "Hareketsiz / Tüketen",
                },
                {
                  label: "Toplam Taranan Satır",
                  value: (totalFiltered || totalRows || displayRows.length).toLocaleString(),
                  sublabel: "Tüm Kayıtlar",
                },
              ],
              message: hasAnomalies
                ? `🚨 **Kritik Anomali Raporu:** Toplam **${negCount}** kalemde eksi bakiye (${negSum.toLocaleString()} ${valLabel}) ve **${zeroCount}** kalemde sıfır bakiye tespit edildi.`
                : `✅ **Anomali Yok:** İncelenen tablodaki tüm kayıtlarda değerler normal aralıkta.`,
            };
          } catch (err) {
            console.warn("[detect_grid_anomalies] DuckDB failed, running in-memory fallback:", err);
            let negCount = 0;
            let negSum = 0;
            let zeroCount = 0;
            const negItems: Array<{ name: string; value: number }> = [];

            for (const row of displayRows) {
              const rawVal = valCol ? row[valCol] : 0;
              const num = typeof rawVal === "number" ? rawVal : parseFloat(String(rawVal).replace(/[^0-9.-]/g, "")) || 0;
              if (num < 0) {
                negCount++;
                negSum += num;
                if (negItems.length < 5) {
                  negItems.push({ name: String(row[labelCol] || "Kayıt"), value: Math.abs(num) });
                }
              } else if (num === 0) {
                zeroCount++;
              }
            }

            return {
              success: true,
              customKind: "yula_chart_card",
              title: `🚨 ${title} — Anomali & Risk Analizi`,
              summary: negCount > 0 ? `⚠️ ${negCount} adet eksi bakiye (${negSum.toLocaleString()} ${valLabel})` : `✅ Temiz veri seti`,
              chartType: "bar",
              chartData: negItems.length > 0 ? negItems : undefined,
              kpis: [
                { label: "Eksi Bakiye", value: negCount.toLocaleString(), sublabel: `${negSum.toLocaleString()} ${valLabel}` },
                { label: "Sıfır Bakiye", value: zeroCount.toLocaleString(), sublabel: "Stoksuz" },
              ],
              message: `🚨 **Anomali Özeti:** ${negCount} eksi bakiye, ${zeroCount} sıfır stok tespit edildi.`,
            };
          }
        },
      },
    ],
  });

  const hasActiveFilters = Object.values(filters).some((q) => q.trim().length > 0)

  const countDisplay =
    hasActiveFilters && totalRows > 0
      ? `${formatCount(totalFiltered)} / ${formatCount(totalRows)} (filtered)`
      : totalRows > 0
        ? `${formatCount(totalRows)} row${totalRows === 1 ? "" : "s"}`
        : `${formatCount(displayRows.length)} row${displayRows.length === 1 ? "" : "s"}`

  const streamingSubtitle = isSavingDisk ? (
    <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground tabular-nums">
      <Spinner className="size-3" />
      <span>Saving report…</span>
    </span>
  ) : isStreaming && displayRows.length > 0 ? (
    <span className="text-[11px] text-muted-foreground tabular-nums">
      Streaming: {formatCount(streamedRows)}
      {expectedTotalRows ? ` / ${formatCount(expectedTotalRows)}` : ""} rows…
      {progressPercent != null ? ` (${progressPercent}%)` : ""}
    </span>
  ) : null

  const subtitle =
    streamingSubtitle ??
    (isStreaming || isSavingDisk || effectiveColumns.length === 0 ? null : countDisplay)

  return (
    <VirtualSpreadsheet
      columns={effectiveColumns}
      items={displayRows}
      title={title}
      subtitle={subtitle}
      className={className}
      loading={isStreaming || isSavingDisk || isLoadingQuery || (effectiveColumns.length === 0 && Boolean(jobId))}
      emptyMessage={isStreaming || isSavingDisk || isLoadingQuery ? "Loading report..." : "No data found"}
      progressValue={progressPercent}
      resetKey={jobId}
      showFilterRow={showFilterRow}
      onToggleFilterRow={onShowFilterRowChange}
      headerActions={
        <>
          {headerActions}
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-7 shrink-0"
            onClick={() => void refresh()}
            disabled={isStreaming || isSavingDisk}
            title="Verileri sunucudan yeniden çek"
            aria-label="Refresh report"
          >
            <RotateCw className={cn("size-3.5", (isStreaming || isSavingDisk) && "animate-spin")} />
          </Button>
        </>
      }
      onNeedMore={loadMore}
      hasMore={hasMore}
      loadingMore={isLoadingQuery}
      renderFilterCell={(col, index) => {
        const val = filters[col.name] ?? ""
        return (
          <div className="group relative flex w-full items-center">
            <Input
              className={cn(
                cellInputClass,
                "shadow-none",
                val && "pr-5",
                col.align === "right" && "text-right"
              )}
              placeholder={index === 0 ? "Filter…" : undefined}
              value={val}
              onChange={(event) => setFilter(col.name, event.target.value)}
            />
            {val ? (
              <button
                type="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setFilter(col.name, "")
                }}
                className="absolute right-1 hidden size-4 items-center justify-center rounded text-muted-foreground/60 hover:bg-muted hover:text-foreground group-hover:flex group-focus-within:flex"
                title="Filtreyi temizle"
                aria-label="Filtreyi temizle"
              >
                <X className="size-3" />
              </button>
            ) : null}
          </div>
        )
      }}
      renderRow={(row, index) => {
        const values = (row.values ?? row) as Record<string, unknown>

        return (
          <tr key={index} className="hover:bg-muted/30">
            {effectiveColumns.map((col) => (
              <td
                key={col.name}
                className={cn(
                  cellClass,
                  col.align === "left" ? "text-left" : "text-right"
                )}
              >
                <div
                  className={cn(
                    "flex h-7 min-w-0 items-center px-2 tabular-nums text-foreground",
                    col.align === "right" && "justify-end"
                  )}
                >
                  {values[col.name] == null ? "" : String(values[col.name])}
                </div>
              </td>
            ))}
          </tr>
        )
      }}
    />
  )
}
