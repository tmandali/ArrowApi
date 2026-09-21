import * as React from "react"
import { wasmSqlClient, type SortConfig } from "@/services/wasmsql"
import type { ColumnSortConfigs } from "@/components/virtual-spreadsheet"
import {
  type WasmSqlColumnMeta, type UseWasmSqlReportOptions,
  type ReportColumnMeta, type UseDuckReportOptions,
  isCustomQueryActive,
} from "./wasm-sql-types"
import { useWasmStreamSubscription } from "./use-wasm-stream-subscription"
import { useWasmCustomSql } from "./use-wasm-custom-sql"

export type { WasmSqlColumnMeta, UseWasmSqlReportOptions, ReportColumnMeta, UseDuckReportOptions }

export function useWasmSqlReport<T extends Record<string, unknown> = Record<string, unknown>>({
  jobId,
  jobUrl,
  columns: initialColumns = [],
  expectedTotalRows,
  pageSize = 500,
  onError,
  customSql = null,
}: UseWasmSqlReportOptions) {
  const [columns, setColumns] = React.useState<WasmSqlColumnMeta[]>(initialColumns)
  const [rows, setRows] = React.useState<T[]>([])
  const [totalRows, setTotalRows] = React.useState<number>(0)
  const [totalFiltered, setTotalFiltered] = React.useState<number>(0)
  const [hasMoreRows, setHasMoreRows] = React.useState<boolean>(false)
  const [streamedRows, setStreamedRows] = React.useState<number>(0)
  const [filters, setFilters] = React.useState<Record<string, string>>({})
  const [isStreaming, setIsStreaming] = React.useState(false)
  const [isSavingDisk, setIsSavingDisk] = React.useState(false)
  const [isFromCache, setIsFromCache] = React.useState(false)
  const [isPartial, setIsPartial] = React.useState(false)
  const [isLoadingQuery, setIsLoadingQuery] = React.useState(false)
  const [isLoadingMore, setIsLoadingMore] = React.useState(false)
  const [sortBy, setSortBy] = React.useState<string | null>(null)
  const [sortDesc, setSortDesc] = React.useState<boolean>(false)
  const [sortConfigs, setSortConfigs] = React.useState<ColumnSortConfigs>({})
  const [page, setPage] = React.useState(0)

  const [prevInitialColumns, setPrevInitialColumns] = React.useState(initialColumns)
  if (initialColumns !== prevInitialColumns) {
    setPrevInitialColumns(initialColumns)
    if (!isCustomQueryActive() && initialColumns.length > 0) {
      setColumns(initialColumns)
    }
  }

  const tableName = React.useMemo(() => {
    if (!jobId) return "current_report"
    return `report_${jobId.replace(/[^a-zA-Z0-9_]/g, "_")}`
  }, [jobId])

  const numericColumns = React.useMemo(() => {
    const set = new Set<string>()
    for (const col of columns) {
      if (col.isNumeric || col.align === "right") {
        set.add(col.name)
      }
    }
    return set
  }, [columns])

  const queryTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const clearQueryTimeout = React.useCallback(() => {
    if (queryTimeoutRef.current) {
      clearTimeout(queryTimeoutRef.current)
      queryTimeoutRef.current = null
    }
  }, [])
  const tableReadyRef = React.useRef(false)
  const [isTableReady, setIsTableReady] = React.useState(false)
  const prevCompleteRef = React.useRef(false)
  const markTableReady = React.useCallback((v: boolean) => {
    tableReadyRef.current = v
    setIsTableReady(v)
  }, [])
  const latestStreamedRef = React.useRef(streamedRows)
  const latestExpectedRef = React.useRef(expectedTotalRows)
  const querySeqRef = React.useRef(0)
  const baseTotalRowsRef = React.useRef(0)
  const filtersRef = React.useRef(filters)
  const sortByRef = React.useRef(sortBy)
  const sortDescRef = React.useRef(sortDesc)
  const sortConfigsRef = React.useRef(sortConfigs)
  React.useEffect(() => {
    latestStreamedRef.current = streamedRows
    latestExpectedRef.current = expectedTotalRows
    filtersRef.current = filters
    sortByRef.current = sortBy
    sortDescRef.current = sortDesc
    sortConfigsRef.current = sortConfigs
  })
  const [customQueryTick, setCustomQueryTick] = React.useState(0)

  // SQL Sorgusunu çalıştırır (Filtreleme, sıralama, sayfalama)
  const executeQuery = React.useCallback(
    async (
      activeFilters = filtersRef.current,
      activeSort = sortByRef.current,
      activeSortDesc = sortDescRef.current,
      activePage = 0,
      activeSortConfigs = sortConfigsRef.current,
      orderedColumnNames?: string[]
    ) => {
      if (!tableReadyRef.current || isCustomQueryActive()) return
      const seq = ++querySeqRef.current

      const order =
        orderedColumnNames && orderedColumnNames.length > 0
          ? orderedColumnNames
          : columns.map((c) => c.name)

      const knownColSet = new Set(order)
      const sortList: SortConfig[] = []

      for (const colName of order) {
        const dir = activeSortConfigs[colName]
        if (dir && (knownColSet.size === 0 || knownColSet.has(colName))) {
          sortList.push({ column: colName, desc: dir === "desc" })
        }
      }

      if (
        sortList.length === 0 &&
        activeSort &&
        (knownColSet.size === 0 || knownColSet.has(activeSort))
      ) {
        sortList.push({ column: activeSort, desc: activeSortDesc })
      }

      const effectiveSort = sortList.length > 0 ? sortList[0].column : null
      const effectiveSortDesc = sortList.length > 0 ? sortList[0].desc : false

      if (activePage === 0) {
        setIsLoadingQuery(true)
      } else {
        setIsLoadingMore(true)
      }
      try {
        const result = await wasmSqlClient.queryReportRows({
          tableName,
          filters: activeFilters,
          numericColumns,
          sortBy: effectiveSort,
          sortDesc: effectiveSortDesc,
          sortConfigs: sortList,
          limit: pageSize,
          offset: activePage * pageSize,
        })

        if (seq !== querySeqRef.current) return

        const normalizedRows = (result.rows as T[]) ?? []
        setRows(
          activePage === 0
            ? normalizedRows
            : (prev) => [...prev, ...normalizedRows]
        )
        setHasMoreRows(result.hasMore)

        const hasActiveFilters = Object.values(activeFilters).some(
          (val) => typeof val === "string" && val.trim().length > 0
        )

        if (activePage === 0) {
          if (result.totalFiltered !== undefined) {
            setTotalFiltered(result.totalFiltered)
          } else if (!hasActiveFilters) {
            setTotalFiltered(baseTotalRowsRef.current || latestStreamedRef.current || 0)
          }

          if (!isCustomQueryActive()) {
            if (!hasActiveFilters && (result.totalFiltered ?? 0) > 0) {
              baseTotalRowsRef.current = result.totalFiltered!
              setTotalRows(result.totalFiltered!)
            } else if (baseTotalRowsRef.current > 0) {
              setTotalRows(baseTotalRowsRef.current)
            } else if (latestStreamedRef.current > 0) {
              setTotalRows(latestStreamedRef.current)
            }
          }
        }
      } catch (err) {
        const msg = String(err)
        if (
          msg.includes("Out of Memory") ||
          msg.includes("could not allocate block") ||
          msg.includes("Allocation failure")
        ) {
          console.warn("Query hit WASM memory limit (partial data):", err)
        } else {
          console.error("Query error:", err)
        }
      } finally {
        if (seq === querySeqRef.current) {
          if (activePage === 0) {
            setIsLoadingQuery(false)
          } else {
            setIsLoadingMore(false)
          }
        }
      }
    },
    [tableName, numericColumns, pageSize, columns]
  )

  const executeQueryRef = React.useRef(executeQuery)
  React.useEffect(() => {
    executeQueryRef.current = executeQuery
  })

  // Filtre değiştirme (Debounced SQL sorgusu)
  const setFilter = React.useCallback(
    (columnName: string, value: string) => {
      const nextFilters = { ...filtersRef.current }
      if (!value || value.trim() === "") {
        delete nextFilters[columnName]
      } else {
        nextFilters[columnName] = value
      }
      filtersRef.current = nextFilters
      setFilters(nextFilters)
      setPage(0)
      setIsLoadingQuery(true)

      if (queryTimeoutRef.current) clearTimeout(queryTimeoutRef.current)
      queryTimeoutRef.current = setTimeout(() => {
        if (isCustomQueryActive()) {
          setCustomQueryTick((t) => t + 1)
          return
        }
        void executeQueryRef.current(nextFilters, sortByRef.current, sortDescRef.current, 0)
      }, 250)
    },
    []
  )

  const clearFilters = React.useCallback(() => {
    filtersRef.current = {}
    setFilters({})
    setPage(0)
    setIsLoadingQuery(true)
    if (queryTimeoutRef.current) clearTimeout(queryTimeoutRef.current)
    if (isCustomQueryActive()) {
      setCustomQueryTick((t) => t + 1)
      return
    }
    void executeQueryRef.current({}, sortByRef.current, sortDescRef.current, 0)
  }, [])

  // Çoklu sıralama ayarı (kolonlar ve yönleri)
  const setMultiSorting = React.useCallback(
    (configs: ColumnSortConfigs, orderedColumnNames?: string[]) => {
      sortConfigsRef.current = configs
      setSortConfigs(configs)

      const order =
        orderedColumnNames && orderedColumnNames.length > 0
          ? orderedColumnNames
          : columns.map((c) => c.name)

      const firstSorted = order.find((c) => configs[c])
      const nextSortBy = firstSorted ?? null
      const nextSortDesc = firstSorted ? configs[firstSorted] === "desc" : false

      sortByRef.current = nextSortBy
      sortDescRef.current = nextSortDesc
      setSortBy(nextSortBy)
      setSortDesc(nextSortDesc)
      setPage(0)
      setIsLoadingQuery(true)

      if (queryTimeoutRef.current) clearTimeout(queryTimeoutRef.current)
      if (isCustomQueryActive()) {
        setCustomQueryTick((t) => t + 1)
        return
      }
      void executeQueryRef.current(
        filtersRef.current,
        nextSortBy,
        nextSortDesc,
        0,
        configs,
        orderedColumnNames
      )
    },
    [columns]
  )

  const setSorting = React.useCallback(
    (columnName: string | null, desc = false) => {
      const nextConfigs: ColumnSortConfigs = columnName
        ? { [columnName]: desc ? "desc" : "asc" }
        : {}
      setMultiSorting(nextConfigs)
    },
    [setMultiSorting]
  )

  const applyFilters = React.useCallback(
    (newFilters: Record<string, string>, clearOthers = false) => {
      const nextFilters = clearOthers ? {} : { ...filtersRef.current }
      for (const [col, val] of Object.entries(newFilters)) {
        if (!val || val.trim() === "") {
          delete nextFilters[col]
        } else {
          nextFilters[col] = val
        }
      }
      filtersRef.current = nextFilters
      setFilters(nextFilters)
      setPage(0)
      setIsLoadingQuery(true)

      if (queryTimeoutRef.current) clearTimeout(queryTimeoutRef.current)
      queryTimeoutRef.current = setTimeout(() => {
        if (isCustomQueryActive()) {
          setCustomQueryTick((t) => t + 1)
          return
        }
        void executeQueryRef.current(
          nextFilters,
          sortByRef.current,
          sortDescRef.current,
          0,
          sortConfigsRef.current
        )
      }, 250)
    },
    []
  )

  const toggleSort = React.useCallback(
    (columnName: string, orderedColumnNames?: string[]) => {
      const nextConfigs: ColumnSortConfigs = { ...sortConfigsRef.current }
      const currentDir = nextConfigs[columnName]
      if (!currentDir) {
        nextConfigs[columnName] = "asc"
      } else if (currentDir === "asc") {
        nextConfigs[columnName] = "desc"
      } else {
        delete nextConfigs[columnName]
      }

      setMultiSorting(nextConfigs, orderedColumnNames)
    },
    [setMultiSorting]
  )

  useWasmStreamSubscription<T>({
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
  })

  const refresh = React.useCallback(async () => {
    if (!jobId || !jobUrl || !tableName) return
    try {
      querySeqRef.current++
      if (queryTimeoutRef.current) clearTimeout(queryTimeoutRef.current)
      setIsStreaming(true)
      setIsSavingDisk(false)
      setIsFromCache(false)
      setIsPartial(false)
      markTableReady(false)
      prevCompleteRef.current = false
      setRows([])
      setTotalRows(0)
      setTotalFiltered(0)
      setHasMoreRows(false)
      setStreamedRows(0)
      setPage(0)
      const { wasmStreamManager } = await import("../services/wasm-stream-manager")
      await wasmStreamManager.restart({
        jobId,
        jobUrl,
        tableName,
        expectedTotalRows,
        onError,
      })
    } catch (err) {
      onError?.((err as Error)?.message || "Rapor yenilenemedi")
      setIsStreaming(false)
      setIsSavingDisk(false)
    }
  }, [jobId, jobUrl, tableName, expectedTotalRows, onError, markTableReady])

  const progressPercent = React.useMemo(() => {
    if (!expectedTotalRows || expectedTotalRows <= 0) return null
    if (streamedRows <= 0) return 0
    return Math.min(100, Math.round((streamedRows / expectedTotalRows) * 100))
  }, [streamedRows, expectedTotalRows])

  useWasmCustomSql<T>({
    customSql,
    customQueryTick,
    tableName,
    tableReadyRef,
    querySeqRef,
    baseTotalRowsRef,
    latestStreamedRef,
    latestExpectedRef,
    filtersRef,
    sortByRef,
    sortDescRef,
    sortConfigsRef,
    executeQueryRef,
    markTableReady,
    setColumns,
    setRows,
    setTotalRows,
    setTotalFiltered,
    setSortConfigs,
    setSortBy,
    setSortDesc,
    setFilters,
    setHasMoreRows,
    setIsLoadingQuery,
  })

  const hasMore = hasMoreRows && rows.length > 0
  const loadingMoreRef = React.useRef(false)

  const loadMore = React.useCallback(() => {
    if (isLoadingQuery || isLoadingMore || !hasMore || loadingMoreRef.current) return
    loadingMoreRef.current = true
    const nextPage = page + 1
    setPage(nextPage)
    void executeQuery(
      filters,
      sortBy,
      sortDesc,
      nextPage,
      sortConfigsRef.current
    ).finally(() => {
      loadingMoreRef.current = false
    })
  }, [isLoadingQuery, isLoadingMore, hasMore, page, filters, sortBy, sortDesc, executeQuery])

  return {
    columns,
    rows,
    totalRows,
    totalFiltered,
    streamedRows,
    progressPercent,
    filters,
    setFilter,
    clearFilters,
    isStreaming,
    isSavingDisk,
    isFromCache,
    isTableReady,
    isPartial,
    isLoadingQuery,
    isLoadingMore,
    sortBy,
    sortDesc,
    sortConfigs,
    setSortBy,
    setSortDesc,
    setSortConfigs,
    setSorting,
    setMultiSorting,
    applyFilters,
    toggleSort,
    loadMore,
    hasMore,
    refresh,
  }
}

