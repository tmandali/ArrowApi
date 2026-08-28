import * as React from "react"
import { duckDbClient } from "@/services/duckdb"
import { duckStreamManager } from "../services/duck-stream-manager"

export type ReportColumnMeta = {
  name: string
  label?: string
  align?: "left" | "right"
  isNumeric?: boolean
  /** Ham DuckDB tipi (DATE, TIMESTAMP, VARCHAR, DECIMAL...) — AI şema grounding'i için. */
  duckType?: string
}

export type UseDuckReportOptions = {
  jobId: string | null | undefined
  jobUrl: string | null | undefined
  columns?: ReportColumnMeta[]
  expectedTotalRows?: number | null
  pageSize?: number
  onError?: (err: string | null) => void
}

export function useDuckReport<T extends Record<string, unknown> = Record<string, unknown>>({
  jobId,
  jobUrl,
  columns: initialColumns = [],
  expectedTotalRows,
  pageSize = 500,
  onError,
}: UseDuckReportOptions) {
  const [columns, setColumns] = React.useState<ReportColumnMeta[]>(initialColumns)
  const [rows, setRows] = React.useState<T[]>([])
  const [totalRows, setTotalRows] = React.useState<number>(0)
  const [totalFiltered, setTotalFiltered] = React.useState<number>(0)
  const [streamedRows, setStreamedRows] = React.useState<number>(0)
  const [filters, setFilters] = React.useState<Record<string, string>>({})
  const [isStreaming, setIsStreaming] = React.useState(false)
  const [isSavingDisk, setIsSavingDisk] = React.useState(false)
  const [isFromCache, setIsFromCache] = React.useState(false)
  const [isLoadingQuery, setIsLoadingQuery] = React.useState(false)
  const [sortBy, setSortBy] = React.useState<string | null>(null)
  const [sortDesc, setSortDesc] = React.useState<boolean>(false)
  const [page, setPage] = React.useState(0)

  React.useEffect(() => {
    if (initialColumns.length > 0) {
      setColumns(initialColumns)
    }
  }, [initialColumns])

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
  const tableReadyRef = React.useRef(false)
  const querySeqRef = React.useRef(0)
  const filtersRef = React.useRef(filters)
  filtersRef.current = filters
  const sortByRef = React.useRef(sortBy)
  sortByRef.current = sortBy
  const sortDescRef = React.useRef(sortDesc)
  sortDescRef.current = sortDesc

  // SQL Sorgusunu çalıştırır (Filtreleme, sıralama, sayfalama)
  const executeQuery = React.useCallback(
    async (
      activeFilters = filtersRef.current,
      activeSort = sortByRef.current,
      activeSortDesc = sortDescRef.current,
      activePage = 0
    ) => {
      if (!tableReadyRef.current) return
      const seq = ++querySeqRef.current
      setIsLoadingQuery(true)
      try {
        const result = await duckDbClient.queryReportRows({
          tableName,
          filters: activeFilters,
          numericColumns,
          sortBy: activeSort,
          sortDesc: activeSortDesc,
          limit: pageSize,
          offset: activePage * pageSize,
        })

        // Eski (geçersiz) sorgu sonucu ise uygulama
        if (seq !== querySeqRef.current) return

        const normalizedRows = (result.rows as T[]) ?? []
        setRows(
          activePage === 0
            ? normalizedRows
            : (prev) => [...prev, ...normalizedRows]
        )
        setTotalFiltered(result.totalFiltered)
      } catch (err) {
        console.error("DuckDB Query error:", err)
      } finally {
        if (seq === querySeqRef.current) setIsLoadingQuery(false)
      }
    },
    [tableName, numericColumns, pageSize]
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

      if (queryTimeoutRef.current) clearTimeout(queryTimeoutRef.current)
      queryTimeoutRef.current = setTimeout(() => {
        void executeQueryRef.current(nextFilters, sortByRef.current, sortDescRef.current, 0)
      }, 250)
    },
    []
  )

  const clearFilters = React.useCallback(() => {
    filtersRef.current = {}
    setFilters({})
    setPage(0)
    if (queryTimeoutRef.current) clearTimeout(queryTimeoutRef.current)
    void executeQueryRef.current({}, sortByRef.current, sortDescRef.current, 0)
  }, [])

  // Arka plan akış yöneticisine abone ol (Kullanıcı sayfa değiştirse dahi akış kesilmez)
  React.useEffect(() => {
    if (!jobId || !jobUrl) {
      setRows([])
      setTotalRows(0)
      setTotalFiltered(0)
      setStreamedRows(0)
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

        if (state.streamedRows > 0 || state.isComplete) {
          setTotalRows(state.streamedRows)
          setTotalFiltered(state.streamedRows)

          const shouldQuery = !tableReadyRef.current
          if (shouldQuery) {
            tableReadyRef.current = true
            void duckDbClient.describeTable(tableName).then((discovered) => {
              if (discovered.length > 0) {
                setColumns(discovered)
              }
              void executeQueryRef.current({}, null, false, 0)
            })
          }
        }
      }
    )

    return () => {
      unsubscribe()
      if (queryTimeoutRef.current) clearTimeout(queryTimeoutRef.current)
    }
  }, [jobId, jobUrl, tableName, expectedTotalRows, onError])

  const refresh = React.useCallback(async () => {
    if (!jobId || !jobUrl || !tableName) return
    try {
      querySeqRef.current++
      if (queryTimeoutRef.current) clearTimeout(queryTimeoutRef.current)
      setIsStreaming(true)
      setIsSavingDisk(false)
      setIsFromCache(false)
      tableReadyRef.current = false
      setRows([])
      setTotalRows(0)
      setTotalFiltered(0)
      setStreamedRows(0)
      setPage(0)
      await duckStreamManager.restart({
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
  }, [jobId, jobUrl, tableName, expectedTotalRows, onError])

  const progressPercent = React.useMemo(() => {
    if (!expectedTotalRows || expectedTotalRows <= 0) return null
    if (streamedRows <= 0) return 0
    return Math.min(100, Math.round((streamedRows / expectedTotalRows) * 100))
  }, [streamedRows, expectedTotalRows])

  const hasMore = tableReadyRef.current && totalFiltered > 0 && rows.length < totalFiltered
  const loadingMoreRef = React.useRef(false)

  const loadMore = React.useCallback(() => {
    if (isLoadingQuery || !hasMore || loadingMoreRef.current) return
    loadingMoreRef.current = true
    const nextPage = page + 1
    setPage(nextPage)
    void executeQuery(filters, sortBy, sortDesc, nextPage).finally(() => {
      loadingMoreRef.current = false
    })
  }, [isLoadingQuery, hasMore, page, filters, sortBy, sortDesc, executeQuery])

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
    isLoadingQuery,
    sortBy,
    sortDesc,
    setSortBy,
    setSortDesc,
    loadMore,
    hasMore,
    refresh,
  }
}
