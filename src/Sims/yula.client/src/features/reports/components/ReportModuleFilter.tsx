"use client";

import * as React from "react"
import { RotateCcw } from "lucide-react"
import { useAgentCriteriaStore } from "@/hooks/use-agent-criteria-bridge"
import {
  SchemaCriteriaFilter,
  type JsonSchemaObject,
  type SchemaCriteriaFilterHandle,
  useSharedCriteriaDraft,
} from "@/features/report-criteria"
import {
  ArrowJobExecutionsPanel,
  ArrowJobResultPanel,
  type ArrowJobExecutionsPanelProps,
} from "@/features/jobs"
import { Button } from "@/components/ui/button"
import { cn } from "@/utils/cn"

const EMPTY_AI_NAMES: string[] = []

export type ReportModuleJobSession = Pick<
  ArrowJobExecutionsPanelProps,
  | "activeJobId"
  | "activeLiveStatus"
  | "activeRequestJson"
  | "activeRunEvents"
  | "activeRunPhase"
  | "onOpenJob"
  | "openJobHref"
  | "onJobSelect"
  | "pendingJobs"
  | "listRefreshToken"
  | "onListError"
  | "viewMode"
  | "onViewModeChange"
  | "onSelectedCompletedChange"
  | "deleteJobTriggerRef"
  | "onCanDeleteChange"
  | "cancelJobTriggerRef"
  | "onCanCancelChange"
  | "onCancellingChange"
> & {
  /** New / empty list → show criteria grid in the Detail column. */
  composing?: boolean
  /** Aktif job çalışıyor → kriter gridi + Run/Clear kilitli. */
  criteriaLocked?: boolean
  onExitCompose?: () => void
  onJobCancelled?: (jobId: string) => void
  onJobDeleted?: (jobId: string) => void
  onListLoaded?: (count: number) => void
}

export type ReportModuleFilterProps = {
  className?: string
  jobsEndpoint: string
  /** Registry / şema scope — draft key, AI highlight, job list name. */
  jobName: string
  /** Result panel & empty-list title (display). */
  title: string
  schema: JsonSchemaObject
  emptyListHint?: string
  jobSession?: ReportModuleJobSession
  onRun?: () => void
  runDisabled?: boolean
}

export const ReportModuleFilter = React.forwardRef<
  SchemaCriteriaFilterHandle,
  ReportModuleFilterProps
>(function ReportModuleFilter(
  {
    schema,
    jobsEndpoint,
    jobName,
    title,
    emptyListHint,
    className,
    jobSession,
    onRun,
    runDisabled = false,
  },
  ref
) {
  const composing = Boolean(jobSession?.composing)
  const criteriaLocked = Boolean(jobSession?.criteriaLocked)
  const filterRef = React.useRef<SchemaCriteriaFilterHandle>(null)
  const aiFilled = useAgentCriteriaStore(
    (state) => state.aiFilledCriteria[jobName]
  )
  const aiFilledNames = aiFilled?.names ?? EMPTY_AI_NAMES

  const { rows, setRows } = useSharedCriteriaDraft(jobName, schema)

  const renderResult = React.useCallback(
    (jobId: string) => (
      <ArrowJobResultPanel
        jobId={jobId}
        title={title}
        className="min-h-0 flex-1"
      />
    ),
    [title]
  )

  React.useImperativeHandle(
    ref,
    () => ({
      submit: () => {
        const handle = filterRef.current
        if (!handle) {
          return {
            valid: false,
            instance: {},
            errors: [{ fieldKey: "", message: "Criteria is not ready" }],
            ajvErrors: [],
          }
        }
        return handle.submit()
      },
      clear: () => filterRef.current?.clear(),
    }),
    []
  )

  return (
    <div
      className={cn(
        "flex min-h-0 min-w-0 w-full flex-1 flex-col overflow-hidden",
        className
      )}
    >
      <ArrowJobExecutionsPanel
        jobsEndpoint={jobsEndpoint}
        jobName={jobName}
        emptyListHint={emptyListHint ?? `Past ${title} jobs`}
        activeJobId={jobSession?.activeJobId}
        activeLiveStatus={jobSession?.activeLiveStatus}
        activeRequestJson={jobSession?.activeRequestJson}
        activeRunEvents={jobSession?.activeRunEvents}
        activeRunPhase={jobSession?.activeRunPhase}
        onOpenJob={jobSession?.onOpenJob}
        openJobHref={jobSession?.openJobHref}
        onJobSelect={(jobId, job) => {
          jobSession?.onExitCompose?.()
          jobSession?.onJobSelect?.(jobId, job)
        }}
        onJobCancelled={jobSession?.onJobCancelled}
        onJobDeleted={jobSession?.onJobDeleted}
        onListLoaded={jobSession?.onListLoaded}
        onListError={jobSession?.onListError}
        pendingJobs={jobSession?.pendingJobs}
        listRefreshToken={jobSession?.listRefreshToken}
        viewMode={jobSession?.viewMode}
        onViewModeChange={jobSession?.onViewModeChange}
        onSelectedCompletedChange={jobSession?.onSelectedCompletedChange}
        deleteJobTriggerRef={jobSession?.deleteJobTriggerRef}
        onCanDeleteChange={jobSession?.onCanDeleteChange}
        cancelJobTriggerRef={jobSession?.cancelJobTriggerRef}
        onCanCancelChange={jobSession?.onCanCancelChange}
        onCancellingChange={jobSession?.onCancellingChange}
        detailSlot={
          <SchemaCriteriaFilter
            key={`${jobName}-criteria`}
            ref={filterRef}
            highlightRowNames={aiFilledNames}
            schema={schema}
            rows={rows}
            onRowsChange={setRows}
            showHeader={false}
            showFooterClear={false}
            className="h-full min-h-0 min-w-0"
          />
        }
        detailSlotActions={
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 shrink-0 gap-1 px-2.5 text-xs"
              disabled={criteriaLocked}
              onClick={() => filterRef.current?.clear()}
            >
              <RotateCcw className="size-3.5" />
              Clear
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-7 shrink-0 px-3 text-xs"
              disabled={runDisabled || criteriaLocked}
              onClick={() => onRun?.()}
            >
              Run
            </Button>
          </>
        }
        criteriaActive={composing}
        criteriaSchema={schema}
        renderResult={renderResult}
        className="min-h-0 flex-1"
      />
    </div>
  )
})
