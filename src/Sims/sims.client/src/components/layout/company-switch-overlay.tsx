import * as React from "react"
import { Building2Icon } from "lucide-react"

import { Spinner } from "@/components/ui/spinner"
import {
  selectSwitchTargetCompany,
  useCompanyStore,
  type CompanySwitchPhase,
} from "@/store/slices/company-store"
import { useActiveJobsStore } from "@/store/slices/active-jobs-store"
import { useNotificationsStore } from "@/store/slices/notifications-store"
import { cn } from "@/utils/cn"

const PHASE_LABEL: Record<CompanySwitchPhase, string> = {
  preparing: "Şirket bağlamı hazırlanıyor…",
  remounting: "Workspace yeniden yükleniyor…",
  loading: "Modüller lazy-load ediliyor…",
  finishing: "Geçiş tamamlanıyor…",
}

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

/**
 * Full-screen company switch gate: progress + target company, then remounts workspace.
 */
export function CompanySwitchOverlay() {
  const transition = useCompanyStore((state) => state.switchTransition)
  const target = useCompanyStore(selectSwitchTargetCompany)
  const applyCompanySwitch = useCompanyStore((state) => state.applyCompanySwitch)
  const setSwitchProgress = useCompanyStore((state) => state.setSwitchProgress)
  const endCompanySwitch = useCompanyStore((state) => state.endCompanySwitch)
  const runIdRef = React.useRef(0)

  React.useEffect(() => {
    if (!transition) return

    const runId = ++runIdRef.current
    let cancelled = false
    let raf = 0

    const animateTo = (from: number, to: number, durationMs: number) =>
      new Promise<void>((resolve) => {
        const start = performance.now()
        const tick = (now: number) => {
          if (cancelled || runId !== runIdRef.current) {
            resolve()
            return
          }
          const t = Math.min(1, (now - start) / durationMs)
          const eased = 1 - (1 - t) ** 3
          const value = from + (to - from) * eased
          const phase = useCompanyStore.getState().switchTransition?.phase
          if (phase) {
            setSwitchProgress(value, phase)
          }
          if (t < 1) {
            raf = requestAnimationFrame(tick)
          } else {
            resolve()
          }
        }
        raf = requestAnimationFrame(tick)
      })

    const run = async () => {
      setSwitchProgress(4, "preparing")
      await animateTo(4, 28, 320)
      if (cancelled || runId !== runIdRef.current) return

      setSwitchProgress(32, "remounting")
      useActiveJobsStore.getState().clear()
      useNotificationsStore.getState().clear()
      applyCompanySwitch()
      await wait(40)
      await animateTo(45, 62, 280)
      if (cancelled || runId !== runIdRef.current) return

      setSwitchProgress(68, "loading")
      await animateTo(68, 88, 520)
      if (cancelled || runId !== runIdRef.current) return

      setSwitchProgress(92, "finishing")
      await animateTo(92, 100, 220)
      if (cancelled || runId !== runIdRef.current) return

      await wait(120)
      endCompanySwitch()
    }

    void run()

    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
    }
  }, [
    transition,
    applyCompanySwitch,
    setSwitchProgress,
    endCompanySwitch,
  ])

  if (!transition || !target) {
    return null
  }

  const progress = Math.round(transition.progress)
  const label = [target.abbr, target.name].filter(Boolean).join(" · ")

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-background/85 backdrop-blur-sm"
      role="alertdialog"
      aria-busy="true"
      aria-live="polite"
      aria-label={`${label} yükleniyor`}
    >
      <div className="mx-4 w-full max-w-sm rounded-xl border bg-card p-6 shadow-lg">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Building2Icon className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Şirket geçişi
            </p>
            <p className="truncate text-base font-semibold text-foreground">
              {label}
            </p>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Spinner className="size-3.5" />
              {PHASE_LABEL[transition.phase]}
            </p>
          </div>
          <span className="tabular-nums text-sm font-medium text-foreground">
            {progress}%
          </span>
        </div>

        <div
          className="mt-5 h-2 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
        >
          <div
            className={cn(
              "h-full rounded-full bg-orange-500 transition-[width] duration-100 ease-out"
            )}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  )
}
