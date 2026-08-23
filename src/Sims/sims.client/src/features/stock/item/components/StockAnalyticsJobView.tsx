import * as React from "react"
import { Link } from "react-router-dom"
import { Printer } from "lucide-react"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { AIChatAssistant } from "@/components/layout/ai-chat-assistant"
import { WorkspaceAiDock } from "@/components/layout/workspace-ai-dock"
import { WorkspaceBanner } from "@/components/layout/workspace-banner"
import { WorkspacePageHeader } from "@/components/layout/workspace-page-header"
import { useJobSync } from "@/context/job-sync-context"
import { fetchJobRequest, fetchJobStatus } from "@/features/jobs/arrow-job-client"
import { useScreenAgentContext } from "@/hooks/use-screen-agent-context"
import { extractCleanFilterValue, resolveGridColumn } from "@/lib/grid-filter-resolver"
import { ApiError } from "@/services"
import { isTerminalJobStatus } from "@/store/slices/active-jobs-store"
import { stockAnalyticsService } from "../services/stock-analytics-service"
import type {
  ReportColumn,
  ReportGridRow,
  StockAnalyticsRequest,
} from "../types/stock-analytics"
import { printStockAnalyticsReport } from "./printStockAnalyticsReport"
import {
  StockAnalyticsResultGrid,
  type StockAnalyticsResultGridHandle,
} from "./StockAnalyticsResultGrid"

const STOCK_ANALYTICS_PATH = "/stock/stock-analytics"
const DEFAULT_REPORT_TITLE = "Stock Analytics"

function formatReportTitle(name?: string | null): string {
  const raw = name?.trim()
  if (!raw) return DEFAULT_REPORT_TITLE
  if (raw.toLowerCase() === "stock-analytics") return DEFAULT_REPORT_TITLE
  return raw
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    if (
      typeof error.body === "object" &&
      error.body &&
      "error" in error.body
    ) {
      const bodyError = (error.body as { error?: unknown }).error
      if (typeof bodyError === "string" && bodyError.trim()) return bodyError
    }
    return error.message || fallback
  }
  if (error instanceof Error && error.message) return error.message
  return fallback
}

type StockAnalyticsJobViewProps = {
  jobId: string
}

/**
 * Dedicated Stock Analytics result page (`/stock/stock-analytics/{guid}`).
 * Tree grid only — Criteria lives on the entry page.
 */
export function StockAnalyticsJobView({ jobId }: StockAnalyticsJobViewProps) {
  const { waitUntilTerminal } = useJobSync()
  const gridRef = React.useRef<StockAnalyticsResultGridHandle>(null)

  const [columns, setColumns] = React.useState<ReportColumn[]>([])
  const [rows, setRows] = React.useState<ReportGridRow[]>([])
  const [reportTitle, setReportTitle] = React.useState(DEFAULT_REPORT_TITLE)
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [showFilterRow, setShowFilterRow] = React.useState(true)
  const [isPrinting, setIsPrinting] = React.useState(false)

  const runIdRef = React.useRef(0)
  const abortRef = React.useRef<AbortController | null>(null)

  React.useEffect(() => {
    const runId = ++runIdRef.current
    abortRef.current?.abort()
    const abort = new AbortController()
    abortRef.current = abort

    setLoading(true)
    setError(null)
    setColumns([])
    setRows([])
    setReportTitle(DEFAULT_REPORT_TITLE)

    const loadReport = async (
      jobUrl: string,
      request: StockAnalyticsRequest
    ) => {
      const report = await stockAnalyticsService.fetchReport(
        jobUrl,
        request,
        abort.signal
      )
      if (runIdRef.current !== runId) return
      setColumns(report.columns)
      setRows(report.rows)
      setLoading(false)
    }

    const load = async () => {
      try {
        const job = await fetchJobStatus(jobId, abort.signal)
        if (runIdRef.current !== runId) return

        if (job?.name) setReportTitle(formatReportTitle(job.name))

        if (!job?.jobUrl) {
          setError("Job bulunamadı")
          setLoading(false)
          return
        }

        const requestBody =
          ((await fetchJobRequest(jobId, abort.signal)) as
            | StockAnalyticsRequest
            | null) ?? {}
        if (runIdRef.current !== runId) return

        const jobStatus = job.status || ""

        if (jobStatus === "Failed") {
          setError(job.error || "Job failed")
          setLoading(false)
          return
        }
        if (jobStatus === "Cancelled") {
          setError("Job cancelled")
          setLoading(false)
          return
        }

        if (jobStatus === "Completed") {
          await loadReport(job.jobUrl, requestBody)
          return
        }

        if (!isTerminalJobStatus(jobStatus)) {
          const terminal = await waitUntilTerminal(jobId, {
            signal: abort.signal,
          })
          if (runIdRef.current !== runId) return

          if (terminal.name) setReportTitle(formatReportTitle(terminal.name))

          if (terminal.status === "Completed") {
            const fresh = await fetchJobStatus(jobId, abort.signal)
            if (runIdRef.current !== runId) return
            if (fresh?.name) setReportTitle(formatReportTitle(fresh.name))
            if (!fresh?.jobUrl) {
              setError("Job sonucu bulunamadı")
              setLoading(false)
              return
            }
            await loadReport(fresh.jobUrl, requestBody)
            return
          }

          if (terminal.status === "Cancelled") {
            setError("Job cancelled")
            setLoading(false)
            return
          }

          setError(terminal.error || "Job failed")
          setLoading(false)
          return
        }

        setError(`Unexpected status: ${jobStatus || "unknown"}`)
        setLoading(false)
      } catch (err) {
        if (runIdRef.current !== runId) return
        if (abort.signal.aborted) return
        console.error("StockAnalyticsJobView load error:", err)
        setError(errorMessage(err, "Sonuç yüklenemedi"))
        setLoading(false)
      }
    }

    void load()
    return () => {
      abort.abort()
    }
  }, [jobId, waitUntilTerminal])

  const [filters, setFilters] = React.useState<Record<string, string>>({})

  const sampleRows = React.useMemo(() => {
    return rows.slice(0, 5).map((r) => ({
      Name: r.name,
      ...(r.values || {}),
    }))
  }, [rows])

  useScreenAgentContext({
    screenId: `stock-analytics-${jobId}`,
    screenTitle: `${reportTitle} Tablosu`,
    workspaceId: "stock",
    activeFilters: filters,
    activeDataSummary: {
      isViewingResults: true,
      jobId,
      totalRows: rows.length,
      totalFiltered: rows.length,
      columns: ["Name", ...columns.map((c) => c.name)],
      sampleRows,
    },
    tools: [
      {
        name: "filter_active_grid",
        description: `Mevcut ekranda açık olan ${reportTitle} tablosunun filtre satırına değer yazar ve tabloyu süzer.`,
        parameters: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Filtrelenecek metin, SKU veya arama terimi",
            },
            column: {
              type: "string",
              description: "Filtrenin uygulanacağı kolon adı",
            },
          },
        },
        execute: (args) => {
          const rawVal = args.query || args.sku
          if (!rawVal) return { success: false, message: "Filtre değeri bulunamadı." }

          const cleanResult = extractCleanFilterValue(String(rawVal))
          const val = cleanResult.value || String(rawVal).trim()
          if (!val) return { success: false, message: "Geçerli bir değer bulunamadı." }

          // Cümle/soru koruması: Doğal dil sorularını filtre kutularına yazmayı engelle
          const isFullSentence = val.includes("?") || (val.split(/\s+/).length >= 4 && !/[><=..|&!]/.test(val))
          if (isFullSentence) {
            return { success: false, message: "Belirtilen ifade bir soru/cümledir; filtrelenecek geçerli bir veri değeri bulunamadı." }
          }

          const targetCol =
            resolveGridColumn(
              args.column || cleanResult.columnHint,
              [{ name: "Name", label: "Name" }, ...columns.map((c) => ({ name: c.name, label: c.label }))],
              String(val),
              sampleRows
            ) || "Name"

          setFilters((prev) => ({ ...prev, [targetCol]: String(val) }))
          setShowFilterRow(true)

          return {
            success: true,
            message: `"${targetCol}" kolonu için "${val}" filtresi uygulandı.`,
          }
        },
      },
      {
        name: "clear_grid_filters",
        description: `Açık olan ${reportTitle} tablosundaki tüm filtreleri temizler.`,
        parameters: {
          type: "object",
          properties: {},
        },
        execute: () => {
          setFilters({})
          return {
            success: true,
            message: "Tablodaki tüm filtreler temizlendi.",
          }
        },
      },
      {
        name: "analyze_grid_data",
        description: `Açık olan ${reportTitle} tablosundaki verileri özetler, en yüksek kayıtları listeler veya pasta/çubuk grafik kartı üretir.`,
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
            valueColumn: {
              type: "string",
              description: "Özetlenecek özel kolon (örn: ClosingDr, Debit, Credit, OpeningDr)",
            },
          },
        },
        execute: async (args: any) => {
          if (rows.length === 0) {
            return { success: false, message: "Analiz edilecek veri bulunamadı." }
          }

          // Hücre sayı ayrıştırıcı
          const parseCell = (raw: unknown): number => {
            if (raw == null) return 0
            if (typeof raw === "number") return isNaN(raw) ? 0 : raw
            const str = String(raw).trim()
            if (!str) return 0
            const cleaned = str.replace(/[^0-9.,-]/g, "")
            if (!cleaned) return 0
            if (cleaned.includes(",") && cleaned.includes(".")) {
              if (cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".")) {
                return parseFloat(cleaned.replace(/\./g, "").replace(",", ".")) || 0
              } else {
                return parseFloat(cleaned.replace(/,/g, "")) || 0
              }
            }
            if (cleaned.includes(",")) return parseFloat(cleaned.replace(",", ".")) || 0
            return parseFloat(cleaned) || 0
          }

          // Tüm hiyerarşik satırları topla
          const allItemRows: ReportGridRow[] = []
          const collectRows = (nodes: ReportGridRow[]) => {
            for (const n of nodes) {
              allItemRows.push(n)
              if (n.children && n.children.length > 0) {
                collectRows(n.children)
              }
            }
          }
          collectRows(rows)

          // İlgili kolonların toplamlarını hesapla
          const colTotals: Record<string, number> = {}
          const numericColumns = columns.filter((c) => c.align === "right" || c.kind === "money" || c.name !== "Name")

          for (const col of numericColumns) {
            let colSum = 0
            for (const row of allItemRows) {
              const val = parseCell(row.values?.[col.name] || row.values?.[col.label])
              colSum += val
            }
            colTotals[col.name] = colSum
          }

          // Öncelikli / Anlamlı Kolonu Seç
          // 1. Kullanıcı spesifik istedi mi?
          let targetColName: string | undefined
          if (args?.valueColumn) {
            targetColName = resolveGridColumn(
              args.valueColumn,
              columns.map((c) => ({ name: c.name, label: c.label })),
              undefined,
              sampleRows
            )
          }

          // 2. Kullanıcı belirtmediyse anlamlı kolon sırası: ClosingDr > Debit > Credit > En yüksek toplamlı kolon
          if (!targetColName) {
            if (colTotals["ClosingDr"] !== undefined && Math.abs(colTotals["ClosingDr"]) > 0) {
              targetColName = "ClosingDr"
            } else if (colTotals["Debit"] !== undefined && Math.abs(colTotals["Debit"]) > 0) {
              targetColName = "Debit"
            } else if (colTotals["Credit"] !== undefined && Math.abs(colTotals["Credit"]) > 0) {
              targetColName = "Credit"
            } else {
              // En yüksek toplama sahip sayısal kolonu seç
              const sortedCols = Object.entries(colTotals).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
              targetColName = sortedCols[0]?.[0] || numericColumns[0]?.name || "ClosingDr"
            }
          }

          const targetColDef = columns.find((c) => c.name === targetColName)
          const targetColLabel = targetColDef?.label || targetColName

          // Kalem bazlı sıralama (Top 5)
          const itemAmounts: Array<{ name: string; value: number }> = []
          for (const row of allItemRows) {
            if (row.name && row.name !== "Total") {
              const val = parseCell(row.values?.[targetColName] || row.values?.[targetColLabel])
              if (Math.abs(val) > 0) {
                itemAmounts.push({ name: row.name, value: Math.round(val * 100) / 100 })
              }
            }
          }

          itemAmounts.sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
          const top5 = itemAmounts.slice(0, 5)

          const rowCount = allItemRows.length
          const closingSum = colTotals["ClosingDr"] ?? colTotals["ClosingCr"] ?? 0
          const debitSum = colTotals["Debit"] ?? 0
          const creditSum = colTotals["Credit"] ?? 0
          const openingSum = colTotals["OpeningDr"] ?? colTotals["OpeningCr"] ?? 0

          const cardTitle = args?.title || `${reportTitle} — Finansal & Stok Özeti`
          const cardSummary = `Tüm ${rowCount.toLocaleString()} kalem üzerinden ${targetColLabel} ve hareket analizi`

          const cardMessage = `📊 **${reportTitle} Analiz Özeti:**
• **Toplam Kalem Sayısı:** ${rowCount.toLocaleString()}
• **Dönem İçi Giriş (Debit):** ${debitSum.toLocaleString()}
• **Dönem İçi Çıkış (Credit):** ${creditSum.toLocaleString()}
• **Kapanış Bakiyesi (Closing):** ${closingSum.toLocaleString()}
• **Açılış Bakiyesi (Opening):** ${openingSum.toLocaleString()}

En yüksek **${targetColLabel}** değerine sahip ilk ${top5.length} kalem grafikte listelenmiştir.`

          return {
            success: true,
            customKind: "yula_chart_card",
            title: cardTitle,
            summary: cardSummary,
            chartType: args?.chartType || (top5.length <= 4 ? "pie" : "bar"),
            chartData: top5.length > 0 ? top5 : [{ name: "Kayıtlar", value: colTotals[targetColName] || 0 }],
            kpis: [
              {
                label: "Kapanış Bakiyesi (Closing)",
                value: Math.round(closingSum).toLocaleString(),
                sublabel: `${rowCount.toLocaleString()} kalem kapanış toplamı`,
              },
              {
                label: "Dönem Giriş (Debit)",
                value: Math.round(debitSum).toLocaleString(),
                sublabel: "Dönem içi artışlar",
              },
              {
                label: "Dönem Çıkış (Credit)",
                value: Math.round(creditSum).toLocaleString(),
                sublabel: "Dönem içi azalışlar",
              },
              {
                label: "Toplam Kalem",
                value: rowCount.toLocaleString(),
                sublabel: "Tüm Satırlar",
              },
            ],
            message: cardMessage,
          }
        },
      },
      {
        name: "detect_grid_anomalies",
        description: `Açık olan ${reportTitle} tablosunda kritik anomalileri (eksi bakiye, sıfır hareket, aşırı sapmalar) inceler ve uyarı kartı üretir.`,
        parameters: {
          type: "object",
          properties: {
            anomalyType: {
              type: "string",
              enum: ["all", "negative", "zero", "outliers"],
              description: "İncelenecek anomali türü",
            },
          },
        },
        execute: async () => {
          if (rows.length === 0) {
            return { success: false, message: "Analiz edilecek veri bulunamadı." };
          }

          const parseCell = (raw: unknown): number => {
            if (raw == null) return 0;
            if (typeof raw === "number") return isNaN(raw) ? 0 : raw;
            const str = String(raw).trim();
            if (!str) return 0;
            const cleaned = str.replace(/[^0-9.,-]/g, "");
            if (!cleaned) return 0;
            if (cleaned.includes(",") && cleaned.includes(".")) {
              if (cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".")) {
                return parseFloat(cleaned.replace(/\./g, "").replace(",", ".")) || 0;
              } else {
                return parseFloat(cleaned.replace(/,/g, "")) || 0;
              }
            }
            if (cleaned.includes(",")) return parseFloat(cleaned.replace(",", ".")) || 0;
            return parseFloat(cleaned) || 0;
          };

          const allItemRows: ReportGridRow[] = [];
          const collectRows = (nodes: ReportGridRow[]) => {
            for (const n of nodes) {
              allItemRows.push(n);
              if (n.children && n.children.length > 0) collectRows(n.children);
            }
          };
          collectRows(rows);

          let negCount = 0;
          let negSum = 0;
          let zeroCount = 0;
          const negItems: Array<{ name: string; value: number }> = [];

          for (const row of allItemRows) {
            if (row.name && row.name !== "Total") {
              const val = parseCell(row.values?.["ClosingDr"] || row.values?.["ClosingCr"] || row.values?.["Closing"]);
              if (val < 0) {
                negCount++;
                negSum += val;
                if (negItems.length < 5) {
                  negItems.push({ name: row.name, value: Math.abs(Math.round(val * 100) / 100) });
                }
              } else if (val === 0) {
                zeroCount++;
              }
            }
          }

          const hasAnomalies = negCount > 0 || zeroCount > 0;

          return {
            success: true,
            customKind: "yula_chart_card",
            title: `🚨 ${reportTitle} — Anomali & Risk Analizi`,
            summary: hasAnomalies
              ? `⚠️ ${negCount} adet eksi bakiye (${Math.round(negSum).toLocaleString()}) ve ${zeroCount} adet sıfır bakiye tespit edildi.`
              : `✅ Tabloda herhangi bir eksi veya kritik anomali tespit edilmedi.`,
            chartType: "bar",
            chartData: negItems.length > 0 ? negItems : undefined,
            kpis: [
              { label: "Eksi Bakiyeli Kalem", value: negCount.toLocaleString(), sublabel: `${Math.round(negSum).toLocaleString()}` },
              { label: "Sıfır Bakiye", value: zeroCount.toLocaleString(), sublabel: "Hareketsiz" },
              { label: "Toplam Taranan", value: allItemRows.length.toLocaleString(), sublabel: "Tüm Satırlar" },
            ],
            message: hasAnomalies
              ? `🚨 **Kritik Anomali Raporu:** Toplam **${negCount}** kalemde eksi bakiye ve **${zeroCount}** kalemde sıfır bakiye tespit edildi.`
              : `✅ **Anomali Yok:** İncelenen tablodaki tüm kayıtlarda kapanış bakiyeleri normal aralıkta.`,
          };
        },
      },
    ],
  })

  const reportReady = columns.length > 0 && !loading && !error
  const shortId = jobId.slice(0, 8)

  const handlePrint = React.useCallback(async () => {
    if (isPrinting) return
    setIsPrinting(true)
    try {
      await printStockAnalyticsReport()
    } finally {
      setIsPrinting(false)
    }
  }, [isPrinting])

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <WorkspacePageHeader
        showSearch={false}
        actions={
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="hidden h-7 text-xs gap-1.5 px-2.5 lg:inline-flex"
              disabled={!reportReady || isPrinting}
              onClick={() => {
                void handlePrint()
              }}
            >
              <Printer className="size-3.5" />
              {isPrinting ? "Preparing…" : "Print"}
            </Button>

            <AIChatAssistant />
          </div>
        }
      >
        <Breadcrumb className="min-w-0 overflow-hidden">
          <BreadcrumbList className="flex-nowrap text-xs">
            <BreadcrumbItem className="hidden md:inline-flex">
              <BreadcrumbLink asChild>
                <Link to="/stock" state={{ yulaClosed: true }}>Stock</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator className="hidden md:block" />
            <BreadcrumbItem className="hidden md:inline-flex">
              <BreadcrumbPage className="text-foreground">Reports</BreadcrumbPage>
            </BreadcrumbItem>
            <BreadcrumbSeparator className="hidden md:block" />
            <BreadcrumbItem className="hidden sm:inline-flex">
              <BreadcrumbLink asChild>
                <Link to={STOCK_ANALYTICS_PATH}>Stock Analytics</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator className="hidden sm:block" />
            <BreadcrumbItem className="min-w-0">
              <BreadcrumbPage className="block truncate font-semibold text-foreground">
                {shortId}…
              </BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </WorkspacePageHeader>

      {error ? (
        <WorkspaceBanner tone="error">
          <div className="flex items-center justify-between w-full">
            <span title={error}>{error}</span>
            <Link
              to={STOCK_ANALYTICS_PATH}
              className="underline text-xs font-semibold ml-4 hover:opacity-80"
            >
              Yeni Rapor Başlat →
            </Link>
          </div>
        </WorkspaceBanner>
      ) : null}

      <WorkspaceAiDock className="overflow-hidden">
        <div className="flex h-full min-h-0 flex-col gap-2 overflow-hidden px-2 pb-2 pt-0">
          {loading && columns.length === 0 ? (
            <div className="flex min-h-0 flex-1 items-center justify-center gap-2 text-xs text-muted-foreground">
              <Spinner className="size-4" />
              Loading result…
            </div>
          ) : (
            <StockAnalyticsResultGrid
              ref={gridRef}
              columns={columns}
              rows={rows}
              title={reportTitle}
              reportId={jobId}
              showFilterRow={showFilterRow}
              onShowFilterRowChange={setShowFilterRow}
              filters={filters}
              onFilterChange={(columnName, value) =>
                setFilters((prev) => ({ ...prev, [columnName]: value }))
              }
              className="min-h-0 flex-1"
            />
          )}
        </div>
      </WorkspaceAiDock>
    </div>
  )
}
