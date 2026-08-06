import { Loader2 } from "lucide-react"

import {
  selectActiveCompany,
  selectSwitchTargetCompany,
  useCompanyStore,
} from "@/store/slices/company-store"

/** Suspense fallback: shows target/active company when switching or loading. */
export function RouteFallback() {
  const transition = useCompanyStore((state) => state.switchTransition)
  const switchTarget = useCompanyStore(selectSwitchTargetCompany)
  const active = useCompanyStore(selectActiveCompany)
  const company = switchTarget ?? active
  const label = company
    ? [company.abbr, company.name].filter(Boolean).join(" · ")
    : null
  const progress = transition ? Math.round(transition.progress) : null

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-sm text-muted-foreground">
      <div className="flex items-center gap-2">
        <Loader2 className="size-4 animate-spin" />
        {label ? (
          <span>
            <span className="font-medium text-foreground">{label}</span>
            {" "}yükleniyor…
          </span>
        ) : (
          <span>Yükleniyor…</span>
        )}
      </div>
      {progress != null ? (
        <div className="w-48 max-w-full">
          <div className="mb-1 flex justify-between text-[11px] tabular-nums">
            <span>Lazy load</span>
            <span>{progress}%</span>
          </div>
          <div
            className="h-1.5 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
          >
            <div
              className="h-full rounded-full bg-orange-500 transition-[width] duration-100"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      ) : null}
    </div>
  )
}
