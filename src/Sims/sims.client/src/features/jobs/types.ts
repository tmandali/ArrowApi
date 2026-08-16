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
  createdAt?: string | null
  completedAt?: string | null
  occurredAt?: string | null
  name?: string
}

export type ArrowJobHubMessage = {
  eventName: string
  payload: ArrowJobEvent
}
