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

export type {
  ArrowJobStatus,
  ArrowJobStatusList,
  ArrowJobEvent,
  ArrowJobHubMessage,
} from "@/features/jobs"

export type ReportColumn = {
  name: string
  label: string
  type: string
  kind: "account" | "money" | "meta"
  align: "left" | "right"
}

export type ReportGridRow = {
  id: string
  parentId: string | null
  name: string
  level: number
  isGroup: boolean
  values: Record<string, string>
  children?: ReportGridRow[]
}

export type StockAnalyticsArrowReport = {
  columns: ReportColumn[]
  rows: ReportGridRow[]
  currency: string
  totalRows: number
}
