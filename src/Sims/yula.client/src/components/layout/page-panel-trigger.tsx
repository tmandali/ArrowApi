"use client";

import * as React from "react"
import { PanelLeftIcon } from "lucide-react"

import { Separator } from "@/components/ui/separator"
import {
  usePagePanelContext,
} from "@/context/page-panel-context"
import { useTranslations } from "next-intl"
import { cn } from "@/utils/cn"

type PagePanelTriggerProps = {
  className?: string
  /** Classes for the vertical separator rendered after the button. */
  separatorClassName?: string
}

/**
 * Sayfa header'ındaki BAĞIMSIZ pane toggle'ı — yalnız register edilmiş
 * sayfa pane'i hedeflenir (ModuleNavPane + paneContent). Pane register
 * edilmemiş sayfalarda render edilmez; ana nav menüyle (AppHeader
 * başlığı) hiçbir bağlantısı yoktur.
 */
export function PagePanelTrigger({
  className,
  separatorClassName,
}: PagePanelTriggerProps) {
  const { registered, hasRegisteredPane, openById, setOpen } = usePagePanelContext()
  const t = useTranslations("PagePanelTrigger")

  // Bağımsız pane yoksa trigger da yok — sayfa header'i başlıkla başlar.
  if (!hasRegisteredPane || !registered) return null

  const panel = registered
  const open = openById[panel.id] ?? panel.defaultOpen
  const label = open
    ? t("close_panel", { title: panel.title })
    : t("open_panel", { title: panel.title })

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
