import type { ReportColumn, ReportGridRow } from "@/features/jobs"

export type StockAnalyticsRequest = {
  fromDate?: Date | string
  toDate?: Date | string
  fiscalYear?: string
  financeBook?: string
  currency?: string
  valuesMode?: string
  showZeroValues?: boolean
  showGroupAccounts?: boolean
  batchSize?: number
}

export type StockAnalyticsArrowReport = {
  columns: ReportColumn[]
  rows: ReportGridRow[]
  currency: string
  totalRows: number
}
