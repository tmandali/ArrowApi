import * as React from "react"
import { duckDbClient } from "@/services/duckdb"
import { duckStreamManager } from "../services/duck-stream-manager"
import type { ColumnSortConfigs } from "../components/virtual-spreadsheet/types"
import { type ReportColumnMeta, isCustomQueryActive } from "./duck-report-types"

export type UseDuckStreamSubscriptionOptions<T = Record<string, unknown>> = {
  jobId: string | null | undefined
  jobUrl: string | null | undefined
  tableName: string
  expectedTotalRows?: number | null
  onError?: (err: string | null) => void
  markTableReady: (v: boolean) => void
  tableReadyRef: React.RefObject<boolean>
  prevCompleteRef: React.RefObject<boolean>
  baseTotalRowsRef: React.RefObject<number>
  filtersRef: React.RefObject<Record<string, string>>
  sortByRef: React.RefObject<string | null>
  sortDescRef: React.RefObject<boolean>
  sortConfigsRef: React.RefObject<ColumnSortConfigs>
  clearQueryTimeout?: () => void
  executeQueryRef: React.RefObject<
    (
      activeFilters?: Record<string, string>,
      activeSort?: string | null,
      activeSortDesc?: boolean,
      activePage?: number,
      activeSortConfigs?: ColumnSortConfigs,
      orderedColumnNames?: string[]
    ) => Promise<void>
  >
  setStreamedRows: (n: number) => void
  setIsStreaming: (b: boolean) => void
  setIsSavingDisk: (b: boolean) => void
  setIsFromCache: (b: boolean) => void
  setIsPartial: (b: boolean) => void
  setTotalRows: (n: number) => void
  setTotalFiltered: (n: number) => void
  setRows: React.Dispatch<React.SetStateAction<T[]>>
  setHasMoreRows: (b: boolean) => void
  setColumns: (cols: ReportColumnMeta[]) => void
  setCustomQueryTick: React.Dispatch<React.SetStateAction<number>>
}

export function useDuckStreamSubscription<T = Record<string, unknown>>({
  jobId,
  jobUrl,
  tableName,
  expectedTotalRows,
  onError,
  markTableReady,
  tableReadyRef,
  prevCompleteRef,
  baseTotalRowsRef,
  filtersRef,
  sortByRef,
  sortDescRef,
  sortConfigsRef,
  clearQueryTimeout,
  executeQueryRef,
  setStreamedRows,
  setIsStreaming,
  setIsSavingDisk,
  setIsFromCache,
  setIsPartial,
  setTotalRows,
  setTotalFiltered,
  setRows,
  setHasMoreRows,
  setColumns,
  setCustomQueryTick,
}: UseDuckStreamSubscriptionOptions<T>) {
  React.useEffect(() => {
    const resetStreamState = () => {
      markTableReady(false)
      setRows([])
      setTotalRows(0)
      setTotalFiltered(0)
      setHasMoreRows(false)
      setStreamedRows(0)
      setIsPartial(false)
    }
    if (!jobId || !jobUrl) {
      resetStreamState()
      return
    }

    const unsubscribe = duckStreamManager.subscribe(
      {
        jobId,
        jobUrl,
        tableName,
        expectedTotalRows,
        onError,
      },
      (state) => {
        setStreamedRows(state.streamedRows)
        setIsStreaming(state.isStreaming)
        setIsSavingDisk(state.isSavingDisk)
        setIsFromCache(state.isFromCache)
        setIsPartial(state.isPartial)

        if ((state.isTableReady && state.streamedRows > 0) || state.isComplete || state.isFromCache) {
          if (state.streamedRows > 0) baseTotalRowsRef.current = state.streamedRows
          setTotalRows(state.streamedRows)
          const hasActive = Object.values(filtersRef.current).some(
            (val) => typeof val === "string" && val.trim().length > 0
          )
          if (!hasActive) {
            setTotalFiltered(state.streamedRows)
          }

          const shouldQuery = !tableReadyRef.current
          if (shouldQuery) {
            markTableReady(true)
            void duckDbClient.describeTable(tableName).then((discovered) => {
              if (discovered.length > 0 && !isCustomQueryActive()) {
                setColumns(discovered)
              }
              void executeQueryRef.current(
                filtersRef.current,
                sortByRef.current,
                sortDescRef.current,
                0,
                sortConfigsRef.current,
                discovered.length > 0
                  ? discovered.map((c) => c.name)
                  : undefined
              )
              if (isCustomQueryActive()) setCustomQueryTick((t) => t + 1)
            })
          } else if (state.isComplete && !prevCompleteRef.current) {
            prevCompleteRef.current = true
            void duckDbClient.describeTable(tableName).then((discovered) => {
              if (discovered.length > 0 && !isCustomQueryActive()) {
                setColumns(discovered)
              }
              void executeQueryRef.current(
                filtersRef.current,
                sortByRef.current,
                sortDescRef.current,
                0,
                sortConfigsRef.current,
                discovered.length > 0
                  ? discovered.map((c) => c.name)
                  : undefined
              )
            })
          }
        }
      }
    )

    return () => {
      unsubscribe()
      clearQueryTimeout?.()
    }
  }, [
    jobId,
    jobUrl,
    tableName,
    expectedTotalRows,
    onError,
    markTableReady,
    baseTotalRowsRef,
    clearQueryTimeout,
    executeQueryRef,
    filtersRef,
    prevCompleteRef,
    setColumns,
    setCustomQueryTick,
    setHasMoreRows,
    setIsFromCache,
    setIsPartial,
    setIsSavingDisk,
    setIsStreaming,
    setRows,
    setStreamedRows,
    setTotalFiltered,
    setTotalRows,
    sortByRef,
    sortConfigsRef,
    sortDescRef,
    tableReadyRef,
  ])
}
