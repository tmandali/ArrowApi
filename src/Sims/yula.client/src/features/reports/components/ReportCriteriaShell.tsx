"use client";

import * as React from "react"
import { useTranslations } from "next-intl"
import { FilePlus2, Loader2, Play, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { AIChatAssistant } from "@/components/layout/ai-chat-assistant"
import { PageHeaderTitle } from "@/components/layout/page-header-title"
import { RecordModeChip, type RecordMode } from "@/components/layout/record-mode-chip"
import { WorkspacePageHeader } from "@/components/layout/workspace-page-header"
import { WorkspaceAiDock } from "@/components/layout/workspace-ai-dock"
import { ModuleNavPane } from "@/components/layout/module-nav-pane"
import { WorkspaceBanner } from "@/components/layout/workspace-banner"
import { useWorkspaceSearch } from "@/context/workspace-search-context"
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
import { useYulaGridStore } from "@/lib/stores/grid"
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
  /** Sayfa modu — başlık yanında rozet (agent/skill deseni: new/edit/view). */
  recordMode?: RecordMode | null
  /** Rozet metinleri — verilmezse kayıt dili (Yeni/Düzenleme/Salt okunur). */
  recordModeLabels?: Partial<Record<RecordMode, string>>
  /** Job oluşturulduğunda (veya aynı kriterli aktif job seçildiğinde) çağrılır. */
  onJobCreated?: (
    job: ArrowJobStatus,
    request: Record<string, unknown>
  ) => void
  /** Header'daki "New" butonu — compose moduna geçiştir. */
  onStartNewReport?: () => void
  /** Yeni modda header'daki "Vazgeç" butonu — compose'dan önceki seçime döner. */
  onCancelNewReport?: () => void
  /** Compose'da bırakılan önceki seçim varsa New, Vazgeç'e döner (skill/agent deseni). */
  isNewMode?: boolean
  /** Aktif job çalışıyor → header'daki Run kilitli. */
  criteriaLocked?: boolean
  /** Header sağ aksiyonlarına eklenecek özel butonlar (örn. Detail / Grid geçiş butonu). */
  headerActions?: React.ReactNode
  /**
   * Criteria + Executions filtresini render eder. Shell, kriter gridi handle'ını
   * toplayan callback ref'i ve onListError yardımcısını bu callback
   * üzerinden enjekte eder. Run header'dadır (sayfa aksiyonu).
   */
  renderFilter: (
    registerFilter: (handle: SchemaCriteriaFilterHandle | null) => void,
    helpers: {
      onListError: (message: string | null) => void
    }
  ) => React.ReactNode
}

/**
 * Rapor master-detail sayfa şablonu (workspace-agnostik): `MasterDetailPage`
 * ile aynı kabuk (`WorkspacePageHeader` + `WorkspaceAiDock` + `ModuleNavPane`).
 * Sol kolon `ArrowJobExecutionsPanel` listesi, sağ kolon criteria / detay /
 * sonuç grid'idir. Workspace Form dosyaları yalnızca ince wrapper olur —
 * orkestrasyon (`ReportModuleForm`) + kriter ekranı (`ReportCriteriaShell`)
 * + filtre (`ReportModuleFilter`) içindedir.
 */
export function ReportCriteriaShell({
  mode,
  title,
  workspaceId,
  schema,
  activeJobId,
  recordMode = null,
  recordModeLabels,
  onJobCreated,
  onStartNewReport,
  onCancelNewReport,
  isNewMode = false,
  criteriaLocked = false,
  headerActions,
  renderFilter,
}: ReportCriteriaShellProps) {
  const t = useTranslations("ReportCriteria")
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
        name: "find_matching_report",
        description: "Aynı normalize kriterde tamamlanmış/çalışan iş var mı kontrol eder; job başlatmaz.",
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
  // Workspace search açıkken floating header gizlenir — arama görünümü
  // AppHeader altındaki tüm alanı kaplar (ana ekran davranışı).
  const { open: searchOpen } = useWorkspaceSearch()
  const handleListError = React.useCallback((message: string | null) => {
    setListErrorBanner((prev) => (prev !== message ? message : prev))
  }, [])
  const [submittingCriteria, setSubmittingCriteria] = React.useState(false)

  const formatValidationBanner = React.useCallback(
    (result: CriteriaValidationResult) => {
      if (result.valid || result.errors.length === 0) return null
      const first = result.errors[0]?.message ?? t("validation_failed")
      const extra =
        result.errors.length > 1 ? ` (+${result.errors.length - 1})` : ""
      return `${first}${extra}`
    },
    [t]
  )

  const handleCriteriaSubmit = React.useCallback(async () => {
    const result = criteriaHandle?.submit()
    if (!result) return

    if (!result.valid) {
      const message = formatValidationBanner(result)
      setCriteriaBanner(
        message ? { tone: "error", message } : { tone: "error", message: t("validation_failed") }
      )
      return
    }

    if (!result.jobEndpoint) {
      setCriteriaBanner({
        tone: "error",
        message: t("schema_missing_endpoint"),
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
            : t("job_create_failed")
      setCriteriaBanner({ tone: "error", message })
    } finally {
      setSubmittingCriteria(false)
    }
  }, [
    criteriaHandle,
    formatValidationBanner,
    mode,
    onJobCreated,
    t,
  ])

  // Run tuşunun aynısını AI'a aç: jenerik run_job aracı bu otobüsü tetikler.
  // En güncel handleCriteriaSubmit'i görmek için her değişimde yeniden kaydolur.
  React.useEffect(() => {
    return registerReportRunner(mode, () => void handleCriteriaSubmit());
  }, [mode, handleCriteriaSubmit]);

  const isGridMaximized = useYulaGridStore((s) => s.isMaximized)

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      {isGridMaximized ? null : (
        <WorkspacePageHeader
          showSearch={false}
          startExtra={
            recordMode != null ? (
              <RecordModeChip mode={recordMode} labels={recordModeLabels} />
            ) : null
          }
          actions={
            <div className="flex min-w-0 shrink-0 items-center gap-1.5 overflow-x-auto overflow-y-hidden overscroll-contain [scrollbar-width:none] [-ms-overflow-style:none] sm:gap-2 [&::-webkit-scrollbar]:hidden">
              {headerActions}
              <Button
                type="button"
                variant={isNewMode ? "ghost" : "outline"}
                size="sm"
                className={
                  isNewMode
                    ? "h-7 shrink-0 gap-1.5 px-2.5 text-xs text-muted-foreground hover:text-foreground"
                    : "h-7 shrink-0 gap-1.5 px-2.5 text-xs"
                }
                onClick={() =>
                  isNewMode ? onCancelNewReport?.() : onStartNewReport?.()
                }
                title={isNewMode ? t("cancel") : t("new_report")}
                aria-label={isNewMode ? t("cancel") : t("new_report")}
              >
                {isNewMode ? (
                  <X className="size-3.5" />
                ) : (
                  <FilePlus2 className="size-3.5" />
                )}
                {isNewMode ? t("cancel") : t("new")}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 shrink-0 gap-1.5 border-primary/40 px-2.5 text-xs text-primary hover:bg-primary/10 hover:text-primary"
                disabled={submittingCriteria || criteriaLocked}
                onClick={() => void handleCriteriaSubmit()}
                title={t("run_report")}
                aria-label={t("run_report")}
              >
                {submittingCriteria ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Play className="size-3.5" />
                )}
                {t("run")}
              </Button>
              <AIChatAssistant />
            </div>
          }
        >
          <PageHeaderTitle>{title}</PageHeaderTitle>
        </WorkspacePageHeader>
      )}

      {!searchOpen && !isGridMaximized && listErrorBanner ? (
        <WorkspaceBanner
          tone="error"
          onDismiss={() => setListErrorBanner(null)}
        >
          <span title={listErrorBanner}>{listErrorBanner}</span>
        </WorkspaceBanner>
      ) : null}

      {!searchOpen && !isGridMaximized && criteriaBanner ? (
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
        <ModuleNavPane>
          {renderFilter(setCriteriaHandle, {
            onListError: handleListError,
          })}
        </ModuleNavPane>
      </WorkspaceAiDock>
    </div>
  )
}
