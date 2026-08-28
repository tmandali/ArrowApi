import type { ReactNode } from "react"
import { X } from "lucide-react"

import { pageContentGutterClass } from "@/components/layout/panel-chrome"
import { Button } from "@/components/ui/button"
import { cn } from "@/utils/cn"

export type WorkspaceBannerTone = "info" | "success" | "error"

type WorkspaceBannerProps = {
  tone?: WorkspaceBannerTone
  children: ReactNode
  onDismiss?: () => void
  /** When set, children are wrapped in a truncated link. */
  href?: string
  className?: string
  /** Skip outer page gutter (banner already inside padded content). */
  inset?: boolean
}

const toneSurfaceClass: Record<WorkspaceBannerTone, string> = {
  info: "border-sky-500/20 bg-sky-500/10 text-sky-900 dark:text-sky-100",
  success:
    "border-emerald-500/20 bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100",
  error:
    "border-destructive/20 bg-destructive/10 text-destructive dark:bg-red-950 dark:text-red-200",
}

const toneDismissClass: Record<WorkspaceBannerTone, string> = {
  info: "text-sky-900 hover:bg-sky-500/20 dark:text-sky-100",
  success:
    "text-emerald-800 hover:bg-emerald-500/15 hover:text-emerald-900 dark:text-emerald-200 dark:hover:text-emerald-100",
  error:
    "text-destructive hover:bg-destructive/15 hover:text-destructive",
}

/**
 * Inset page banner — same gutter as floating header / content cards.
 * Place between WorkspacePageHeader and WorkspaceAiDock.
 */
export function WorkspaceBanner({
  tone = "info",
  children,
  onDismiss,
  href,
  className,
  inset = true,
}: WorkspaceBannerProps) {
  const body = href ? (
    <a
      href={href}
      className="min-w-0 flex-1 truncate font-medium underline underline-offset-2 hover:opacity-90"
    >
      {children}
    </a>
  ) : (
    <div className="min-w-0 flex-1">{children}</div>
  )

  const surface = (
    <div
      className={cn(
        "flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-xs",
        toneSurfaceClass[tone],
        !inset && className
      )}
    >
      {body}
      {onDismiss ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn("size-6 shrink-0", toneDismissClass[tone])}
          onClick={onDismiss}
          aria-label="Dismiss"
        >
          <X className="size-3.5" />
        </Button>
      ) : null}
    </div>
  )

  if (!inset) return surface

  return (
    <div className={cn(pageContentGutterClass, className)}>{surface}</div>
  )
}
