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

export type ArrowJobStatus = {
  id: string
  status: string
  jobUrl: string
  eventsUrl: string
  createdAt?: string
  completedAt?: string | null
  error?: string | null
  batchCount?: number
  totalRows?: number
  name?: string
  rootJobId?: string
}

export type ArrowJobStatusList = {
  items: ArrowJobStatus[]
  total: number
}

export type ArrowJobEvent = {
  id: string
  status: string
  message?: string | null
  error?: string | null
  batchCount?: number
  totalRows?: number
  jobUrl?: string
  eventsUrl?: string
  completedAt?: string | null
  name?: string
}

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
