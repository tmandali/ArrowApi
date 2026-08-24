import * as React from "react"
import { useNavigate } from "react-router-dom"
import { ExternalLink, Play, Loader2, TrendingUp, BarChart3, PieChart as PieChartIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/utils/cn"
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  PieChart,
  Pie,
  Cell,
} from "recharts"
import {
  SchemaCriteriaFilter,
  useSharedCriteriaDraft,
  parseCriteriaSchema,
  rowsToCriteriaInstance,
  assertSafeApiJobEndpoint,
} from "@/features/report-criteria"
import { createArrowJob } from "@/features/jobs/arrow-job-client"
import { useAgentBridgeStore } from "@/hooks/useAgentBridge"
import { useActiveJobsStore, findActiveJobByPayload, findCompletedJobByPayload } from "@/store/slices/active-jobs-store"
import { useNotificationsStore } from "@/store/slices/notifications-store"
import type { YulaReportCardConfig } from "./yula-components-data"
import { readReportAiMetadata } from "@/lib/report-ai-metadata"
import { PromptChipsRow } from "./prompt-chips"

export function YulaReportCriteriaCard({
  config,
  details,
}: {
  config: YulaReportCardConfig
  /** AI'nın bu turda doldurduğu kriterler — kartta vurgu çipi olarak gösterilir. */
  details?: Record<string, any>
}) {
  const navigate = useNavigate()
  const { rows, setRows } = useSharedCriteriaDraft(config.scope, config.schema)
  const sendPrompt = useAgentBridgeStore((s) => s.sendPrompt)
  const [isRunning, setIsRunning] = React.useState(false)
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null)

  const quickPrompts = readReportAiMetadata(config.schema).quickPrompts || []

  // AI (tool call) veya Needle'ın doldurduğu kriter alanları — gridde hafif turuncu vurgulanır.
  const [aiFilledNames, setAiFilledNames] = React.useState<string[]>([])
  // details her parent render'da yeni obje olarak gelir; içeriğe göre stabil anahtar kullan.
  const detailsKey = React.useMemo(
    () => JSON.stringify(details ?? {}),
    [details]
  )
  const detailsData = React.useMemo(
    () => (detailsKey === "{}" ? null : (JSON.parse(detailsKey) as Record<string, any>)),
    [detailsKey]
  )
  React.useEffect(() => {
    if (!detailsData) return
    // Jenerik araç sözleşmesi: { report, criteria: {alan:değer} }
    const source =
      detailsData.criteria && typeof detailsData.criteria === "object"
        ? (detailsData.criteria as Record<string, any>)
        : detailsData
    const names = Object.entries(source)
      .filter(([k, v]) => k !== "report" && v !== undefined && v !== null && String(v).trim() !== "")
      .map(([k]) => k.trim())
      .filter(Boolean)
    setAiFilledNames(names)
    // Vurgu kalıcıdır: bir sonraki AI dolumuna ya da bağlam değişimine dek sürer.
  }, [detailsData])

  const handleRun = async () => {
    try {
      setIsRunning(true)
      setErrorMsg(null)
      const parsed = parseCriteriaSchema(config.schema)
      if (!parsed.jobEndpoint) {
        navigate(config.pagePath)
        return
      }

      const instance = rowsToCriteriaInstance(rows, parsed.fields)

      // 1. Aynı kriterlerle zaten ÇALIŞMAKTA OLAN aktif bir iş var mı kontrol et
      const activeExisting = findActiveJobByPayload(config.scope, instance)
      if (activeExisting) {
        useAgentBridgeStore.getState().appendMessage({
          sender: "agent",
          content: `⚡ **${config.title}:** Bu kriterlerle zaten hazırlanmakta olan aktif bir rapor var (${activeExisting.id.slice(0, 8)}...). Mevcut işe bağlanılıyor.`,
          toolResult: {
            scope: config.scope,
            title: config.title,
            jobId: activeExisting.id,
            pagePath: `${config.pagePath}/${activeExisting.id}`,
          },
        })
        navigate(`${config.pagePath}/${activeExisting.id}`)
        return
      }

      // 2. Aynı kriterlerle önceden TAMAMLANMIŞ mevcut bir iş var mı kontrol et
      const completedExisting = findCompletedJobByPayload(config.scope, instance)
      if (completedExisting) {
        useAgentBridgeStore.getState().appendMessage({
          sender: "agent",
          content: `✓ **${config.title}:** Bu kriterlerle hazırlanmış güncel rapor bulundu (${completedExisting.id.slice(0, 8)}...). Rapor sonuçlarına yönlendiriliyorsunuz.`,
          toolResult: {
            scope: config.scope,
            title: config.title,
            jobId: completedExisting.id,
            pagePath: `${config.pagePath}/${completedExisting.id}`,
          },
        })
        navigate(`${config.pagePath}/${completedExisting.id}`)
        return
      }

      const endpoint = assertSafeApiJobEndpoint(parsed.jobEndpoint)
      const job = await createArrowJob(endpoint, instance)

      if (job?.id) {
        const jobPath = `${config.pagePath}/${job.id}`

        const activeWorkspace = (config.pagePath.startsWith("/")
          ? "/" + config.pagePath.split("/")[1]
          : "/stock") as any

        // 1. Global Aktif İş Takipçisine kaydet (Sayfa detay paneli ve SSE canlı senkronizasyonu için)
        useActiveJobsStore.getState().addJob({
          id: job.id,
          name: config.scope,
          title: config.title,
          href: jobPath,
          status: job.status || "Queued",
          eventsUrl: job.eventsUrl,
          jobUrl: job.jobUrl,
          createdAt: new Date().toISOString(),
          notificationType: "report",
          workspace: activeWorkspace,
          successTitle: `${config.title} Ready`,
          successDescription: "Report completed successfully.",
          failureTitle: `${config.title} Error`,
          payload: instance,
        })

        // 2. Global Bildirim Merkezine (Top bar bell / notification) ekle
        useNotificationsStore.getState().pushNotification({
          title: `${config.title} Started`,
          description: `Processing criteria. You can track progress from notifications or the ${config.title} page.`,
          href: jobPath,
          type: "report",
          workspace: activeWorkspace,
        })

        // 3. AI Sohbetine özet bildirim gönder
        useAgentBridgeStore.getState().appendMessage({
          sender: "agent",
          content: `📊 **${config.title} Report Started:** Processing in background. You can track live execution from the details panel.`,
          toolResult: {
            scope: config.scope,
            title: config.title,
            jobId: job.id,
            pagePath: jobPath,
          },
        })

        // Doğrudan çalışan execution ve tablo sonuç ekranına yönlendir
        navigate(jobPath)
      } else {
        navigate(config.pagePath)
      }
    } catch (err: any) {
      console.error("[YulaReportCriteriaCard] Run error:", err)
      setErrorMsg(err?.message || "Rapor çalıştırılamadı")
    } finally {
      setIsRunning(false)
    }
  }

  const workspaceTitles: Record<string, string> = {
    stock: "Stok",
    accounting: "Muhasebe",
    selling: "Satış",
    subcontracting: "Subcontracting",
    manufacturing: "Üretim",
  };
  const wsBadge = config.workspace ? workspaceTitles[config.workspace] || config.workspace : null;

  return (
    <div className="w-full max-w-[95%] overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold leading-none text-foreground">
              {config.title}
            </span>
            {wsBadge && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                {wsBadge}
              </span>
            )}
          </div>
          {config.description ? (
            <div className="mt-0.5 truncate text-[10px] text-muted-foreground">
              {config.description}
            </div>
          ) : null}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            type="button"
            size="sm"
            disabled={isRunning}
            className="h-7 gap-1 px-2.5 text-xs bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={handleRun}
          >
            {isRunning ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Play className="size-3.5 fill-current" />
            )}
            Çalıştır
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isRunning}
            className="h-7 gap-1 px-2.5 text-xs"
            onClick={() => navigate(config.pagePath)}
          >
            <ExternalLink className="size-3.5" />
            Sayfada aç
          </Button>
        </div>
      </div>
      {errorMsg ? (
        <div className="px-3 py-1.5 text-xs text-destructive bg-destructive/10 border-b">
          ⚠️ {errorMsg}
        </div>
      ) : null}
      <SchemaCriteriaFilter
        schema={config.schema}
        rows={rows}
        onRowsChange={setRows}
        showHeader={false}
        showFooterClear={false}
        highlightRowNames={aiFilledNames}
        className="max-h-64"
      />
      {quickPrompts.length > 0 ? (
        <div className="border-t bg-muted/20 px-3 py-2">
          <span className="mr-1 text-[10px] font-medium text-muted-foreground">Öneriler:</span>
          <PromptChipsRow
            items={quickPrompts.map((qp) => ({ label: qp }))}
            onPick={(item) => void sendPrompt(`${config.title}: ${item.label}`)}
            className="inline-flex align-middle"
          />
        </div>
      ) : null}
    </div>
  )
}

const CHART_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ec4899", "#8b5cf6", "#06b6d4"]

export interface YulaAnalyticsCardData {
  title: string
  chartType?: "bar" | "pie" | "kpi"
  chartData?: Array<{ name: string; value: number }>
  kpis?: Array<{ label: string; value: string | number; sublabel?: string }>
  summary?: string
}

export function YulaAnalyticsCard({ data }: { data: YulaAnalyticsCardData }) {
  const [activeTab, setActiveTab] = React.useState<"bar" | "pie">(data.chartType === "pie" ? "pie" : "bar")
  const chartData = data.chartData || []

  return (
    <div className="overflow-hidden rounded-xl border border-primary/20 bg-card text-card-foreground shadow-md transition-all">
      {/* Header */}
      <div className="flex items-center justify-between border-b bg-muted/40 px-3.5 py-2.5">
        <div className="flex items-center gap-2">
          <div className="flex size-6 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <TrendingUp className="size-3.5" />
          </div>
          <div>
            <div className="text-xs font-semibold text-foreground">{data.title}</div>
            {data.summary ? (
              <div className="text-[10px] text-muted-foreground">{data.summary}</div>
            ) : null}
          </div>
        </div>
        {chartData.length > 0 && data.chartType !== "kpi" ? (
          <div className="flex items-center rounded-md border bg-muted/50 p-0.5">
            <button
              type="button"
              onClick={() => setActiveTab("bar")}
              className={cn(
                "rounded px-1.5 py-0.5 text-[10px] font-medium transition-all cursor-pointer",
                activeTab === "bar" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <BarChart3 className="size-3" />
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("pie")}
              className={cn(
                "rounded px-1.5 py-0.5 text-[10px] font-medium transition-all cursor-pointer",
                activeTab === "pie" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <PieChartIcon className="size-3" />
            </button>
          </div>
        ) : null}
      </div>

      {/* KPI Stats Grid */}
      {data.kpis && data.kpis.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 border-b bg-muted/10 p-3">
          {data.kpis.map((kpi, i) => (
            <div key={i} className="rounded-lg border bg-background/80 p-2 shadow-2xs">
              <div className="text-[10px] text-muted-foreground truncate">{kpi.label}</div>
              <div className="text-sm font-bold text-foreground tabular-nums">{kpi.value}</div>
              {kpi.sublabel ? <div className="text-[9px] text-muted-foreground/80 truncate">{kpi.sublabel}</div> : null}
            </div>
          ))}
        </div>
      ) : null}

      {/* Chart Section */}
      {chartData.length > 0 ? (
        <div className="p-3">
          <div className="h-44 w-full min-w-0 min-h-[176px]">
            <ResponsiveContainer width="100%" height={176} minWidth={0} minHeight={176}>
              {activeTab === "pie" ? (
                <PieChart>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={30}
                    outerRadius={60}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {chartData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip
                    formatter={(value: any) => [value?.toLocaleString?.() ?? value, "Değer"]}
                    contentStyle={{ fontSize: "11px", borderRadius: "8px", background: "hsl(var(--popover))", borderColor: "hsl(var(--border))" }}
                  />
                </PieChart>
              ) : (
                <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 9 }}
                    interval={0}
                    angle={-20}
                    textAnchor="end"
                    stroke="hsl(var(--muted-foreground))"
                  />
                  <YAxis tick={{ fontSize: 9 }} stroke="hsl(var(--muted-foreground))" />
                  <RechartsTooltip
                    formatter={(value: any) => [value?.toLocaleString?.() ?? value, "Değer"]}
                    contentStyle={{ fontSize: "11px", borderRadius: "8px", background: "hsl(var(--popover))", borderColor: "hsl(var(--border))" }}
                  />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {chartData.map((_, index) => (
                      <Cell key={`bar-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export interface YulaFileLinkCardData {
  title?: string
  file_path: string
  file_name: string
  rows_written?: number
  format?: string
  warning?: string
}

// Kart bileşeni skill klasorune tasindi:
// src/skills/report_export_xlsx/report_export_xlsx.card.tsx
// (customKind = "report_export_xlsx" → yulaCustomPartComponents proxy'si cozer.)
