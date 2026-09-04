"use client";

import * as React from "react"
import { FilePlus2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { AIChatAssistant } from "@/components/layout/ai-chat-assistant"
import { PagePanelTrigger } from "@/components/layout/page-panel-trigger"
import { PageHeaderTitle } from "@/components/layout/page-header-title"
import {
  pageHeaderCardClass,
  pageHeaderShellClass,
} from "@/components/layout/panel-chrome"
import { WorkspaceAiDock } from "@/components/layout/workspace-ai-dock"
import { WorkspaceBanner } from "@/components/layout/workspace-banner"
import type { ArrowJobStatus } from "@/features/jobs"
import {
  assertSafeApiJobEndpoint,
  type CriteriaValidationResult,
  type JsonSchemaObject,
  type SchemaCriteriaFilterHandle,
} from "@/features/report-criteria"
import { createArrowJob } from "@/features/jobs/arrow-job-client"
import { findActiveJobByPayload } from "@/store/slices/active-jobs-store"
import { ApiError } from "@/services"
import { cn } from "@/utils/cn"
import { useScreenAgentContext } from "@/hooks/use-screen-agent-context"
import { readReportAiMetadata } from "@/lib/report-ai-metadata"
import { buildCriteriaDigest } from "@/features/report-criteria/lib/build-criteria-digest"
import { registerReportRunner } from "@/lib/report-run-bus"

export type ReportCriteriaShellProps = {
  /** Rapor scope'u — registerReportRunner + AI screen context kimliği (ör. "stock-analytics"). */
  mode: string
  title: string
  /** Sahip workspace — AI screen context. */
  workspaceId: string
  /** Raporun JSON kriter şeması — x-job-endpoint + AI criteria digest kaynağı. */
  schema: JsonSchemaObject
  /** Çalışan/aktif job varsa sonuç modu özetinde gösterilir. */
  activeJobId?: string | null
  /** Job oluşturulduğunda (veya aynı kriterli aktif job seçildiğinde) çağrılır. */
  onJobCreated?: (
    job: ArrowJobStatus,
    request: Record<string, unknown>
  ) => void
  /** Header'daki "New" butonu — compose moduna geçiştir. */
  onStartNewReport?: () => void
  /**
   * Criteria + Executions filtresini render eder. Shell, kriter gridi handle'ını
   * toplayan callback ref'i ve Run/onListError yardımcılarını bu callback
   * üzerinden enjekte eder.
   */
  renderFilter: (
    registerFilter: (handle: SchemaCriteriaFilterHandle | null) => void,    helpers: {
      onRun: () => void
      runDisabled: boolean
      onListError: (message: string | null) => void
    }
  ) => React.ReactNode
}

/**
 * Workspace-agnostik rapor kriter ekranı kabuğu: New aksiyonu, banner'lar,
 * job oluşturma (createArrowJob), AI run_report otobüsü ve screen agent
 * context. Filtre bileşeni `renderFilter` ile enjekte edilir.
 */
export function ReportCriteriaShell({
  mode,
  title,
  workspaceId,
  schema,
  activeJobId,
  onJobCreated,
  onStartNewReport,
  renderFilter,
}: ReportCriteriaShellProps) {
  // Kriter gridi handle'ı callback ref olarak toplanır: setter commit fazında
  // React tarafından çağrılır, render sırasında ref erişimi yapılmaz.
  const [criteriaHandle, setCriteriaHandle] =
    React.useState<SchemaCriteriaFilterHandle | null>(null)

  // Aktif rapor şemasının alan sindirimi — Yula "bu rapor ne hakkında"
  // sorularını JSON Schema'daki gerçek kriterlerle yanıtlar.
  const activeCriteriaDigest = React.useMemo(() => {
    if (!schema) return undefined;
    const digest = buildCriteriaDigest(schema);
    // Sözleşme: criteriaDigest = ALAN DİZİSİ (python isinstance(list) kontrolü)
    return digest.fields.length > 0
      ? (digest.fields as unknown as Array<Record<string, unknown>>)
      : undefined;
  }, [schema])

  useScreenAgentContext({
    screenId: mode,
    activeReportScope: mode,
    screenTitle: title,
    workspaceId,
    activeDataSummary: {
      isViewingResults: Boolean(activeJobId),
      jobId: activeJobId,
    },
    quickPrompts: schema
      ? readReportAiMetadata(schema).quickPrompts || []
      : [],
    criteriaDigest: activeCriteriaDigest,
    tools: [
      {
        name: "apply_criteria",
        description: "Şemayı ve zorunlu alanları gözeterek önerilen kriterleri ekrandaki forma doldurur.",
      },
      {
        name: "run_job",
        description: "Stok Bakiye Raporu için şemayı ve zorunlu alanları gözeterek job başlatır ve execution listesinde yeni işi seçili/çalışır gösterir.",
      },
    ],
  })

  const [criteriaBanner, setCriteriaBanner] = React.useState<{
    tone: "error" | "success"
    message: string
    href?: string
  } | null>(null)
  const [listErrorBanner, setListErrorBanner] = React.useState<string | null>(
    null
  )
  const handleListError = React.useCallback((message: string | null) => {
    setListErrorBanner(message)
  }, [])
  const [submittingCriteria, setSubmittingCriteria] = React.useState(false)

  const formatValidationBanner = React.useCallback(
    (result: CriteriaValidationResult) => {
      if (result.valid || result.errors.length === 0) return null
      const first = result.errors[0]?.message ?? "Validation failed"
      const extra =
        result.errors.length > 1 ? ` (+${result.errors.length - 1})` : ""
      return `${first}${extra}`
    },
    []
  )

  const handleCriteriaSubmit = React.useCallback(async () => {
    const result = criteriaHandle?.submit()
    if (!result) return

    if (!result.valid) {
      const message = formatValidationBanner(result)
      setCriteriaBanner(
        message ? { tone: "error", message } : { tone: "error", message: "Validation failed" }
      )
      return
    }

    if (!result.jobEndpoint) {
      setCriteriaBanner({
        tone: "error",
        message: "Schema x-job-endpoint is missing",
      })
      return
    }

    const currentScope = mode || "report"

    // 1. Aynı kriterlerle zaten ÇALIŞMAKTA OLAN aktif bir iş var mı?
    const activeExisting = findActiveJobByPayload(currentScope, result.instance)
    if (activeExisting) {
      const existingJobStatus = {
        id: activeExisting.id,
        status: (activeExisting.status as any) || "Queued",
        eventsUrl: activeExisting.eventsUrl,
        jobUrl: activeExisting.jobUrl,
      }
      onJobCreated?.(existingJobStatus, result.instance)
      setCriteriaBanner(null)
      return
    }

    try {
      setSubmittingCriteria(true)
      const endpoint = assertSafeApiJobEndpoint(result.jobEndpoint)
      const job = await createArrowJob(endpoint, result.instance)
      onJobCreated?.(job, result.instance)
      setCriteriaBanner(null)
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Job create failed"
      setCriteriaBanner({ tone: "error", message })
    } finally {
      setSubmittingCriteria(false)
    }
  }, [
    criteriaHandle,
    formatValidationBanner,
    mode,
    onJobCreated,
  ])

  // Run tuşunun aynısını AI'a aç: jenerik run_report aracı bu otobüsü tetikler.
  // En güncel handleCriteriaSubmit'i görmek için her değişimde yeniden kaydolur.
  React.useEffect(() => {
    return registerReportRunner(mode, () => void handleCriteriaSubmit());
  }, [mode, handleCriteriaSubmit]);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <div className={pageHeaderShellClass}>
      <header
        className={cn(
          pageHeaderCardClass,
          "justify-between gap-1.5 sm:gap-2"
        )}
      >
        <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden sm:gap-2">
          <PagePanelTrigger
            className="-ml-1 shrink-0"
            separatorClassName="mr-1 hidden data-vertical:h-4 data-vertical:self-auto sm:mr-2 sm:block"
          />
          <PageHeaderTitle>{title}</PageHeaderTitle>
        </div>

        <div className="flex min-w-0 shrink-0 items-center gap-1.5 overflow-x-auto overflow-y-hidden overscroll-contain [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden sm:gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 px-2.5 text-xs"
            onClick={() => onStartNewReport?.()}
            title="New report"
            aria-label="New report"
          >
            <FilePlus2 className="size-3.5" />
            New
          </Button>
          <AIChatAssistant />
        </div>
      </header>
      </div>

      {listErrorBanner ? (
        <WorkspaceBanner
          tone="error"
          onDismiss={() => setListErrorBanner(null)}
        >
          <span title={listErrorBanner}>{listErrorBanner}</span>
        </WorkspaceBanner>
      ) : null}

      {criteriaBanner ? (
        <WorkspaceBanner
          tone={criteriaBanner.tone === "error" ? "error" : "success"}
          href={criteriaBanner.href}
          onDismiss={() => setCriteriaBanner(null)}
        >
          <span title={criteriaBanner.message}>{criteriaBanner.message}</span>
        </WorkspaceBanner>
      ) : null}

      <WorkspaceAiDock
        className={cn("overflow-hidden", "max-md:overflow-y-auto")}
      >
        {renderFilter(setCriteriaHandle, {
          onRun: () => void handleCriteriaSubmit(),
          runDisabled: submittingCriteria,
          onListError: handleListError,
        })}
      </WorkspaceAiDock>
    </div>
  )
}
