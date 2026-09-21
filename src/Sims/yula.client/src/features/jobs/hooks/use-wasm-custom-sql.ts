import * as React from "react"
import { wasmSqlClient, type SortConfig } from "@/services/wasmsql"
import { resolveActiveViewReferences } from "@/lib/sql-guard"
import type { ColumnSortConfigs } from "@/components/virtual-spreadsheet"
import type { WasmSqlColumnMeta } from "./wasm-sql-types"

export type UseWasmCustomSqlOptions<T = Record<string, unknown>> = {
  customSql: string | null | undefined
  customQueryTick: number
  tableName: string
  tableReadyRef: React.RefObject<boolean>
  querySeqRef: React.RefObject<number>
  baseTotalRowsRef: React.RefObject<number>
  latestStreamedRef: React.RefObject<number>
  latestExpectedRef: React.RefObject<number | null | undefined>
  filtersRef: React.RefObject<Record<string, string>>
  sortByRef: React.RefObject<string | null>
  sortDescRef: React.RefObject<boolean>
  sortConfigsRef: React.RefObject<ColumnSortConfigs>
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
  markTableReady: (v: boolean) => void
  setColumns: (cols: WasmSqlColumnMeta[]) => void
  setRows: React.Dispatch<React.SetStateAction<T[]>>
  setTotalRows: (n: number) => void
  setTotalFiltered: (n: number) => void
  setSortConfigs: (cfgs: ColumnSortConfigs) => void
  setSortBy: (s: string | null) => void
  setSortDesc: (d: boolean) => void
  setFilters: (f: Record<string, string>) => void
  setIsLoadingQuery: (b: boolean) => void
  setHasMoreRows: (b: boolean) => void
}

export type UseDuckCustomSqlOptions<T = Record<string, unknown>> =
  UseWasmCustomSqlOptions<T>

export function useWasmCustomSql<T = Record<string, unknown>>({
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
}: UseWasmCustomSqlOptions<T>) {
  React.useEffect(() => {
    if (!customSql) {
      if (!tableReadyRef.current) return
      let cancelledRestore = false
      void (async () => {
        const discovered = await wasmSqlClient.describeTable(tableName)
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

        const discSet = new Set(discovered.map((c) => c.name))
        const nextConfigs: ColumnSortConfigs = {}
        for (const [col, dir] of Object.entries(sortConfigsRef.current)) {
          if (discSet.has(col)) {
            nextConfigs[col] = dir
          }
        }
        sortConfigsRef.current = nextConfigs
        setSortConfigs(nextConfigs)

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

        void executeQueryRef.current(filtersRef.current, nextSort, nextDesc, 0, nextConfigs)
      })()
      return () => {
        cancelledRestore = true
      }
    }

    if (!tableReadyRef.current) return

    const seq = ++querySeqRef.current
    let cancelled = false
    const runCustomSql = async () => {
      setIsLoadingQuery(true)
      try {
        const resolvedSql = resolveActiveViewReferences(customSql, tableName)
        const result = await wasmSqlClient.executeCustomSql(resolvedSql)
        if (cancelled || seq !== querySeqRef.current) return
        markTableReady(true)
        let resultRows = (result as T[]) ?? []
        const first = resultRows[0] as Record<string, unknown> | undefined
        const viewCols = new Set(first ? Object.keys(first) : [])

        const staleKeys = Object.keys(filtersRef.current).filter(
          (k) => !viewCols.has(k)
        )
        if (staleKeys.length > 0) {
          const next = { ...filtersRef.current }
          staleKeys.forEach((k) => delete next[k])
          filtersRef.current = next
          setFilters(next)
        }

        const validCustomSortList: SortConfig[] = []
        for (const [col, dir] of Object.entries(sortConfigsRef.current)) {
          if (viewCols.has(col)) {
            validCustomSortList.push({ column: col, desc: dir === "desc" })
          }
        }

        const activeSort = sortByRef.current
        const activeSortDesc = sortDescRef.current
        const hasValidSort = Boolean(activeSort && viewCols.has(activeSort))
        if (activeSort && !hasValidSort) {
          sortByRef.current = null
          sortDescRef.current = false
          setSortBy(null)
          setSortDesc(false)
        }

        const activeFilters = filtersRef.current
        const hasActiveFilters = Object.values(activeFilters).some(
          (v) => v && v.trim()
        )
        let orderClause = ""
        if (validCustomSortList.length > 0) {
          orderClause = `ORDER BY ${validCustomSortList
            .map((s) => `"${s.column.replace(/"/g, '""')}" ${s.desc ? "DESC" : "ASC"}`)
            .join(", ")}`
        } else if (hasValidSort) {
          orderClause = `ORDER BY "${activeSort!.replace(/"/g, '""')}" ${activeSortDesc ? "DESC" : "ASC"}`
        }

        if (hasActiveFilters || orderClause) {
          let where = ""
          if (hasActiveFilters) {
            const numericSet = new Set<string>(
              Object.entries(first ?? {})
                .filter(([, v]) => typeof v === "number" || typeof v === "bigint")
                .map(([k]) => k)
            )
            const { buildCombinedWhereClause } = await import(
              "@/services/wasmsql/filter-parser"
            )
            where = buildCombinedWhereClause(activeFilters, numericSet)
          }

          try {
            const cleanResolved = resolvedSql.trim().replace(/;+$/, "")
            const wrappedSql = `SELECT * FROM (${cleanResolved}) AS __custom_view ${where} ${orderClause}`
            const filteredAndSorted = await wasmSqlClient.executeCustomSql(wrappedSql)
            if (cancelled || seq !== querySeqRef.current) return
            resultRows = (filteredAndSorted as T[]) ?? []
          } catch (filterErr) {
            console.warn(
              "[useWasmCustomSql] özel görünüm filtre/sıralama uygulanamadı:",
              filterErr
            )
          }
        }
        const capped = resultRows.slice(0, 5000)
        const derivedCols: WasmSqlColumnMeta[] = first
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
  }, [
    customSql,
    customQueryTick,
    tableName,
    baseTotalRowsRef,
    executeQueryRef,
    filtersRef,
    latestExpectedRef,
    latestStreamedRef,
    markTableReady,
    querySeqRef,
    setColumns,
    setFilters,
    setHasMoreRows,
    setIsLoadingQuery,
    setRows,
    setSortBy,
    setSortConfigs,
    setSortDesc,
    setTotalFiltered,
    setTotalRows,
    sortByRef,
    sortConfigsRef,
    sortDescRef,
    tableReadyRef,
  ])
}

