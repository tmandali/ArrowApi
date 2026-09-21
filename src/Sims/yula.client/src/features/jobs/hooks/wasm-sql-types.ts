import { useYulaGridStore } from "@/lib/stores/grid"

export type WasmSqlColumnMeta = {
  name: string
  label?: string
  align?: "left" | "right"
  isNumeric?: boolean
  /** Ham fiziksel tipi (DATE, TIMESTAMP, VARCHAR, DECIMAL...) — AI şema grounding'i için. */
  duckType?: string
}

export type UseWasmSqlReportOptions = {
  jobId: string | null | undefined
  jobUrl: string | null | undefined
  columns?: WasmSqlColumnMeta[]
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
export const isCustomQueryActive = () =>
  useYulaGridStore.getState().customQuerySql !== null

// Backward compatibility aliases
export type ReportColumnMeta = WasmSqlColumnMeta
export type UseDuckReportOptions = UseWasmSqlReportOptions
