import * as React from "react"
import { useNavigate } from "react-router-dom"
import { ExternalLink, Play, Loader2, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  SchemaCriteriaFilter,
  useSharedCriteriaDraft,
  parseCriteriaSchema,
  rowsToCriteriaInstance,
  assertSafeApiJobEndpoint,
} from "@/features/report-criteria"
import { createArrowJob } from "@/features/jobs/arrow-job-client"
import { useAgentBridgeStore } from "@/hooks/useAgentBridge"
import { useActiveJobsStore } from "@/store/slices/active-jobs-store"
import { useNotificationsStore } from "@/store/slices/notifications-store"
import type { YulaReportCardConfig } from "./yula-components-data"

export function YulaReportCriteriaCard({
  config,
}: {
  config: YulaReportCardConfig
}) {
  const navigate = useNavigate()
  const { rows, setRows } = useSharedCriteriaDraft(config.scope, config.schema)
  const sendPrompt = useAgentBridgeStore((s) => s.sendPrompt)
  const [isRunning, setIsRunning] = React.useState(false)
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null)

  const quickPrompts: string[] = (config.schema as any)["x-ai-quick-prompts"] || []

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
        })

        // Doğrudan çalışan execution panelinde bu job'ı seçili açmak için state ile yönlendir
        navigate(config.pagePath, {
          state: {
            focusJobId: job.id,
            composing: false,
          },
        })
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

  return (
    <div className="w-full max-w-[95%] overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <div className="min-w-0">
          <div className="text-xs font-semibold leading-none text-foreground">
            {config.title}
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
        className="max-h-64"
      />
      {quickPrompts.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5 border-t bg-muted/20 px-3 py-2">
          <span className="text-[10px] font-medium text-muted-foreground">Öneriler:</span>
          {quickPrompts.map((qp, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => void sendPrompt(qp)}
              className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-background px-2.5 py-0.5 text-[11px] font-medium text-foreground transition-all hover:border-primary/50 hover:bg-primary/5 hover:text-primary active:scale-95 cursor-pointer"
            >
              <Sparkles className="size-2.5 text-primary" />
              {qp}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
