import { useYulaGridStore } from "@/lib/stores/grid"

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
export const isCustomQueryActive = () =>
  useYulaGridStore.getState().customQuerySql !== null
