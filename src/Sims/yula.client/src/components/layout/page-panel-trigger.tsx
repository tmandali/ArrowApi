"use client";

import * as React from "react"
import { PanelLeftIcon } from "lucide-react"

import { Separator } from "@/components/ui/separator"
import { usePagePanelStore } from "@/lib/stores/page-panel"
import { cn } from "@/utils/cn"

type PagePanelTriggerProps = {
  className?: string
  /** Classes for the vertical separator rendered after the button. */
  separatorClassName?: string
}

/**
 * Header toggle for the page's registered panel (e.g. Executions on criteria
 * pages). Renders nothing — button and separator together — when the current
 * page has no registered panel.
 */
export function PagePanelTrigger({
  className,
  separatorClassName,
}: PagePanelTriggerProps) {
  const registered = usePagePanelStore((s) => s.registered)
  const openById = usePagePanelStore((s) => s.openById)
  const setOpen = usePagePanelStore((s) => s.setOpen)

  if (!registered) return null

  const open = openById[registered.id] ?? registered.defaultOpen
  const label = open
    ? `${registered.title} panelini kapat`
    : `${registered.title} panelini aç`

  return (
    <>
      <button
        type="button"
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-md text-foreground/70 transition-colors hover:text-foreground",
          className
        )}
        title={label}
        aria-label={label}
        aria-pressed={open}
        onClick={() => setOpen(registered.id, !open)}
      >
        <PanelLeftIcon className="size-4" />
        <span className="sr-only">{label}</span>
      </button>
      <Separator
        orientation="vertical"
        className={
          separatorClassName ?? "mr-2 data-vertical:h-4 data-vertical:self-auto"
        }
      />
    </>
  )
}
