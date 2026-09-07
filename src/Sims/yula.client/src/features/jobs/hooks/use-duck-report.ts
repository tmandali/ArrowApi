import * as React from "react"
import { duckDbClient } from "@/services/duckdb"
import { useYulaGridStore } from "@/lib/stores/grid"
import { duckStreamManager } from "../services/duck-stream-manager"

export type ReportColumnMeta = {
  name: string
  label?: string
  align?: "left" | "right"
  isNumeric?: boolean
  /** Ham tipi (DATE, TIMESTAMP, VARCHAR, DECIMAL...) — AI şema grounding'i için. */
  duckType?: string
}

export type UseDuckReportOptions = {
  jobId: string | null | undefined
  jobUrl: string | null | undefined
  columns?: ReportColumnMeta[]
  expectedTotalRows?: number | null
  pageSize?: number
  onError?: (err: string | null) => void
  /**
   * Setliyken grid temel tablo sorgusu yerine bu salt-okunur SELECT'in
   * sonucunu gösterir (Yula set_grid_query → gruplama/aggregate görünümü).
   */
  customSql?: string | null
}

/** Özel SQL modu sorgusu aktif mi — store'dan canlı okunur (closure-güvenli). */
const isCustomQueryActive = () =>
  useYulaGridStore.getState().customQuerySql !== null

export function useDuckReport<T extends Record<string, unknown> = Record<string, unknown>>({
  jobId,
  jobUrl,
  columns: initialColumns = [],
  expectedTotalRows,
  pageSize = 500,
  onError,
  customSql = null,
}: UseDuckReportOptions) {
  const [columns, setColumns] = React.useState<ReportColumnMeta[]>(initialColumns)
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
  const [sortBy, setSortBy] = React.useState<string | null>(null)
  const [sortDesc, setSortDesc] = React.useState<boolean>(false)
  const [page, setPage] = React.useState(0)

  React.useEffect(() => {
    const syncInitialColumns = () => {
      if (isCustomQueryActive()) return
      if (initialColumns.length > 0) {
        setColumns(initialColumns)
      }
    }
    syncInitialColumns()
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
  const prevCompleteRef = React.useRef(false)
  const markTableReady = React.useCallback((v: boolean) => {
    tableReadyRef.current = v
  }, [])
  // Akış ilerlemesinin en güncel değerleri — callback'ler ref okur
  const latestStreamedRef = React.useRef(streamedRows)
  const latestExpectedRef = React.useRef(expectedTotalRows)
  React.useEffect(() => {
    latestStreamedRef.current = streamedRows
    latestExpectedRef.current = expectedTotalRows
  })
  const querySeqRef = React.useRef(0)
  const baseTotalRowsRef = React.useRef(0)
  const filtersRef = React.useRef(filters)
  const sortByRef = React.useRef(sortBy)
  const sortDescRef = React.useRef(sortDesc)
  React.useEffect(() => {
    filtersRef.current = filters
    sortByRef.current = sortBy
    sortDescRef.current = sortDesc
  })
  // Tablo ingest tamamlandığında özel sorguyu (yeniden) tetiklemek için tık
  const [customQueryTick, setCustomQueryTick] = React.useState(0)

  // SQL Sorgusunu çalıştırır (Filtreleme, sıralama, sayfalama)
  const executeQuery = React.useCallback(
    async (
      activeFilters = filtersRef.current,
      activeSort = sortByRef.current,
      activeSortDesc = sortDescRef.current,
      activePage = 0
    ) => {
      // Özel SQL modu: temel tablo sorgusu sonucu ezmeyesin diye atlanır
      if (!tableReadyRef.current || isCustomQueryActive()) return
      const seq = ++querySeqRef.current
      // Sıralama kolonu geçerlilik kontrolü:
      // Eğer seçili sıralama kolonu bilinen kolonlar arasında yoksa (örneğin özel SQL'den
      // türetilmiş "Kayıt Sayısı" gibi alias'lar temel tabloda bulunmaz), sıralamayı yoksay
      // ve ref/state'i temizle; böylece DuckDB Binder Error vermez.
      let effectiveSort = activeSort
      let effectiveSortDesc = activeSortDesc
      if (
        effectiveSort &&
        columns.length > 0 &&
        !columns.some((c) => c.name === effectiveSort)
      ) {
        console.warn(
          `[useDuckReport] Sıralama kolonu (${effectiveSort}) tabloda bulunamadı; sıralama sıfırlandı.`
        )
        effectiveSort = null
        effectiveSortDesc = false
        sortByRef.current = null
        sortDescRef.current = false
        setSortBy(null)
        setSortDesc(false)
      }

      setIsLoadingQuery(true)
      try {
        const result = await duckDbClient.queryReportRows({
          tableName,
          filters: activeFilters,
          numericColumns,
          sortBy: effectiveSort,
          sortDesc: effectiveSortDesc,
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
        setHasMoreRows(result.hasMore)

        const hasActiveFilters = Object.values(activeFilters).some(
          (val) => typeof val === "string" && val.trim().length > 0
        )

        // Sadece ilk sayfada (activePage === 0) filtrelenmiş satır sayısı güncellenir.
        // Sonsuz kaydırmada (activePage > 0) totalFiltered ve totalRows değerleri korunur.
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
        // Bellek tavanı (kontrollü OOM) beklenen/yönetilen durum: warn bas,
        // dev overlay'e sahte Console Error düşürme.
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
        if (seq === querySeqRef.current) setIsLoadingQuery(false)
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
        // Özel SQL modunda filtre hücreleri sorgu sonucunu yeniden süzer
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

  // Programatik sıralama (AI veya UI kontrolleri için doğrudan ASC/DESC/null ayarı)
  const setSorting = React.useCallback((columnName: string | null, desc = false) => {
    sortByRef.current = columnName
    sortDescRef.current = desc
    setSortBy(columnName)
    setSortDesc(desc)
    setPage(0)
    setIsLoadingQuery(true)

    if (queryTimeoutRef.current) clearTimeout(queryTimeoutRef.current)
    if (isCustomQueryActive()) {
      setCustomQueryTick((t) => t + 1)
      return
    }
    void executeQueryRef.current(filtersRef.current, columnName, desc, 0)
  }, [])

  // Çoklu filtre uygulama (AI veya toplu filtre işlemleri için)
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
        void executeQueryRef.current(nextFilters, sortByRef.current, sortDescRef.current, 0)
      }, 250)
    },
    []
  )

  // 3 aşamalı kolon sıralama döngüsü: ASC -> DESC -> Doğal (None)
  const toggleSort = React.useCallback((columnName: string) => {
    let nextSortBy: string | null = columnName
    let nextSortDesc = false

    if (sortByRef.current === columnName) {
      if (!sortDescRef.current) {
        nextSortDesc = true
      } else {
        nextSortBy = null
        nextSortDesc = false
      }
    }

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
    void executeQueryRef.current(filtersRef.current, nextSortBy, nextSortDesc, 0)
  }, [])

  // Arka plan akış yöneticisine abone ol (Kullanıcı sayfa değiştirse dahi akış kesilmez)
  React.useEffect(() => {
    const resetStreamState = () => {
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
              void executeQueryRef.current({}, null, false, 0)
              // Tablo bu turda hazır olduysa bekleyen özel sorguyu koştur
              if (isCustomQueryActive()) setCustomQueryTick((t) => t + 1)
            })
          } else if (state.isComplete && !prevCompleteRef.current) {
            prevCompleteRef.current = true
            void duckDbClient.describeTable(tableName).then((discovered) => {
              if (discovered.length > 0 && !isCustomQueryActive()) {
                setColumns(discovered)
              }
              void executeQueryRef.current(filtersRef.current, sortByRef.current, sortDescRef.current, 0)
            })
          }
        }
      }
    )

    return () => {
      unsubscribe()
      if (queryTimeoutRef.current) clearTimeout(queryTimeoutRef.current)
    }
  }, [jobId, jobUrl, tableName, expectedTotalRows, onError, markTableReady])

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
  }, [jobId, jobUrl, tableName, expectedTotalRows, onError, markTableReady])

  const progressPercent = React.useMemo(() => {
    if (!expectedTotalRows || expectedTotalRows <= 0) return null
    if (streamedRows <= 0) return 0
    return Math.min(100, Math.round((streamedRows / expectedTotalRows) * 100))
  }, [streamedRows, expectedTotalRows])

  // Özel SQL modu — Yula set_grid_query: guard'dan geçmiş SELECT'i koşturur,
  // kolonları sonuçtan türetir; temel tabloya dönüşte görünümü onarır.
  React.useEffect(() => {
    if (!customSql) {
      if (!tableReadyRef.current) return
      let cancelledRestore = false
      void (async () => {
        // Kolonlar özel sorgu sonucuna göre değişmiş olabilir; şemayı geri yükle
        const discovered = await duckDbClient.describeTable(tableName)
        if (cancelledRestore) return
        if (discovered.length > 0) setColumns(discovered)
        const restoredBase =
          baseTotalRowsRef.current > 0
            ? baseTotalRowsRef.current
            : latestStreamedRef.current > 0
              ? latestStreamedRef.current
              : latestExpectedRef.current ?? 0
        setTotalRows(restoredBase)
        setTotalFiltered(restoredBase)

        // Özel sorgudan kalan türetilmiş sıralama kolonu temel tabloda yoksa temizle
        const discSet = new Set(discovered.map((c) => c.name))
        const sortStillValid = Boolean(
          sortByRef.current && discSet.has(sortByRef.current)
        )
        const nextSort = sortStillValid ? sortByRef.current : null
        const nextDesc = sortStillValid ? sortDescRef.current : false
        if (!sortStillValid && sortByRef.current) {
          sortByRef.current = null
          sortDescRef.current = false
          setSortBy(null)
          setSortDesc(false)
        }

        void executeQueryRef.current(filtersRef.current, nextSort, nextDesc, 0)
      })()
      return () => {
        cancelledRestore = true
      }
    }

    const seq = ++querySeqRef.current
    let cancelled = false
    const runCustomSql = async () => {
      setIsLoadingQuery(true)
      try {
        const result = await duckDbClient.executeCustomSql(customSql)
        if (cancelled || seq !== querySeqRef.current) return
        markTableReady(true)
        let resultRows = (result as T[]) ?? []
        const first = resultRows[0] as Record<string, unknown> | undefined
        const viewCols = new Set(first ? Object.keys(first) : [])

        // Bayat filtre hücreleri: temel tabloya ait (özel görünümde olmayan)
        // kolon filtreleri Binder Error üretir → hücreleri sessizce temizle.
        const staleKeys = Object.keys(filtersRef.current).filter(
          (k) => !viewCols.has(k)
        )
        if (staleKeys.length > 0) {
          const next = { ...filtersRef.current }
          staleKeys.forEach((k) => delete next[k])
          filtersRef.current = next
          setFilters(next)
        }

        // Sıralama kontrolü: görünümde olan kolonlar sıralanabilir
        const activeSort = sortByRef.current
        const activeSortDesc = sortDescRef.current
        const hasValidSort = Boolean(activeSort && viewCols.has(activeSort))
        if (activeSort && !hasValidSort) {
          sortByRef.current = null
          sortDescRef.current = false
          setSortBy(null)
          setSortDesc(false)
        }

        // Aktif filtre veya sıralama özel sorgu SONUÇLARI üzerinde de çalışsın:
        // SELECT * FROM (<özel sorgu>) AS __custom_view [WHERE ...] [ORDER BY ...]
        const activeFilters = filtersRef.current
        const hasActiveFilters = Object.values(activeFilters).some(
          (v) => v && v.trim()
        )
        const orderClause = hasValidSort
          ? `ORDER BY "${activeSort!.replace(/"/g, '""')}" ${activeSortDesc ? "DESC" : "ASC"}`
          : ""

        if (hasActiveFilters || orderClause) {
          let where = ""
          if (hasActiveFilters) {
            const numericSet = new Set<string>(
              Object.entries(first ?? {})
                .filter(([, v]) => typeof v === "number" || typeof v === "bigint")
                .map(([k]) => k)
            )
            const { buildCombinedWhereClause } = await import(
              "@/services/duckdb/filter-parser"
            )
            where = buildCombinedWhereClause(activeFilters, numericSet)
          }

          try {
            const wrappedSql = `SELECT * FROM (${customSql}) AS __custom_view ${where} ${orderClause}`
            const filteredAndSorted = await duckDbClient.executeCustomSql(wrappedSql)
            if (cancelled || seq !== querySeqRef.current) return
            resultRows = (filteredAndSorted as T[]) ?? []
          } catch (filterErr) {
            // Süzülmüş/sıralanmış sorgu patlarsa banner çıkarmadan devam et
            console.warn(
              "[useDuckReport] özel görünüm filtre/sıralama uygulanamadı:",
              filterErr
            )
          }
        }
        const capped = resultRows.slice(0, 5000)
        const derivedCols: ReportColumnMeta[] = first
          ? Object.keys(first).map((name) => {
              const v = first[name]
              const isNumeric =
                typeof v === "number" ||
                typeof v === "bigint" ||
                (typeof v === "string" &&
                  v.trim() !== "" &&
                  Number.isFinite(Number(v)))
              return {
                name,
                label: name,
                isNumeric,
                align: isNumeric ? "right" : "left",
              }
            })
          : []
        if (derivedCols.length > 0) setColumns(derivedCols)
        setRows(capped)
        setTotalRows(capped.length)
        setTotalFiltered(capped.length)
        setHasMoreRows(false)
      } catch (err) {
        // Özel görünüm hataları banner'a düşürülmez: model akışı zaten
        // düzeltir; kullanıcıyı kırmızı banner ile endişelendirmeye gerek yok.
        if (!cancelled) {
          console.warn("custom query error:", err)
        }
      } finally {
        if (!cancelled && seq === querySeqRef.current) setIsLoadingQuery(false)
      }
    }
    void runCustomSql()
    return () => {
      cancelled = true
    }
  }, [customSql, customQueryTick, tableName, onError, markTableReady])

  const hasMore = hasMoreRows && rows.length > 0
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
    isPartial,
    isLoadingQuery,
    sortBy,
    sortDesc,
    setSortBy,
    setSortDesc,
    setSorting,
    applyFilters,
    toggleSort,
    loadMore,
    hasMore,
    refresh,
  }
}
