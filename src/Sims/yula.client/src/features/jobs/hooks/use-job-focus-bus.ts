import * as React from "react"
import { fetchJobStatus } from "@/features/jobs/arrow-job-client"
import { useActiveJobsStore } from "@/store/slices/active-jobs-store"
import type { ArrowJobStatus } from "@/features/jobs/types"
import {
  subscribeExecutionFocus,
  takePendingExecutionFocus,
} from "@/lib/report-run-bus"
import { sameJobId } from "./arrow-job-runner-types"

export type UseJobFocusBusOptions = {
  jobName: string
  queryJobIdParam: string | null
  focusJobIdRef: React.RefObject<string | null>
  applyExecutionFocus: (job: ArrowJobStatus, request?: Record<string, unknown>) => void
}

export function useJobFocusBus({
  jobName,
  queryJobIdParam,
  focusJobIdRef,
  applyExecutionFocus,
}: UseJobFocusBusOptions) {
  const applyExecutionFocusRef = React.useRef(applyExecutionFocus)
  React.useEffect(() => {
    applyExecutionFocusRef.current = applyExecutionFocus
  })

  const focusJobIdFromQuery = React.useCallback((queryJobId: string) => {
    const tracked = useActiveJobsStore.getState().jobs[queryJobId]
    if (tracked?.status) {
      applyExecutionFocusRef.current(
        {
          id: queryJobId,
          status: tracked.status,
          eventsUrl: tracked.eventsUrl ?? "",
          jobUrl: tracked.jobUrl ?? "",
          createdAt: tracked.createdAt,
          name: tracked.name,
        },
        tracked.payload,
      )
    } else {
      // Sayfa ilk defa URL query param ile açıldığında işin durumu henüz bilinmiyor.
      // "Completed" varsaymak yerine önce boş geçilir; fetchJobStatus ile gerçek durum öğrenilir.
      applyExecutionFocusRef.current({
        id: queryJobId,
        status: "",
        jobUrl: "",
        eventsUrl: "",
      })
      void fetchJobStatus(queryJobId).then((st) => {
        if (st) {
          applyExecutionFocusRef.current({
            id: queryJobId,
            status: st.status,
            jobUrl: st.jobUrl,
            eventsUrl: st.eventsUrl,
            createdAt: st.createdAt,
            name: st.name,
            totalRows: st.totalRows ?? undefined,
            batchCount: st.batchCount ?? undefined,
          })
        }
      })
    }
  }, [])

  React.useEffect(() => {
    const pending = takePendingExecutionFocus(jobName)
    if (pending) {
      applyExecutionFocusRef.current(pending.job, pending.request)
    } else if (queryJobIdParam) {
      // Aynı job zaten odaktaysa tekrar dokunma (gereksiz fetch/odak sıfırlama yok).
      if (!sameJobId(focusJobIdRef.current, queryJobIdParam)) {
        focusJobIdFromQuery(queryJobIdParam)
      }
    }
    return subscribeExecutionFocus(jobName, (focus) => {
      applyExecutionFocusRef.current(focus.job, focus.request)
    })
  }, [jobName, queryJobIdParam, focusJobIdFromQuery, focusJobIdRef])
}
