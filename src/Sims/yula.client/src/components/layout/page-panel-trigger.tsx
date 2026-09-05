"use client";

import * as React from "react"
import { PanelLeftIcon } from "lucide-react"

import { Separator } from "@/components/ui/separator"
import {
  DEFAULT_PAGE_PANEL,
  usePagePanelContext,
} from "@/context/page-panel-context"
import { cn } from "@/utils/cn"

type PagePanelTriggerProps = {
  className?: string
  /** Classes for the vertical separator rendered after the button. */
  separatorClassName?: string
}

/**
 * Header toggle for the page's registered panel (e.g. Executions on criteria
 * pages). Renders immediately using DEFAULT_PAGE_PANEL to prevent layout shift on reload.
 */
export function PagePanelTrigger({
  className,
  separatorClassName,
}: PagePanelTriggerProps) {
  const { registered, openById, setOpen } = usePagePanelContext()

  const panel = registered ?? DEFAULT_PAGE_PANEL
  const open = openById[panel.id] ?? panel.defaultOpen
  const label = open
    ? `${panel.title} panelini kapat`
    : `${panel.title} panelini aç`

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
        onClick={() => setOpen(panel.id, !open)}
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
