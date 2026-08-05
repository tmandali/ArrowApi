import * as React from "react"
import { Button } from "@/components/ui/button"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { cn } from "@/utils/cn"
import { ChevronRight } from "lucide-react"

/** Shared dock width — Query Criteria and workspace AI use the same proportion. */
export const WORKSPACE_SIDE_PANEL_PERCENT = 20

type WorkspaceSidePanelLayoutProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: React.ReactNode
  panel: React.ReactNode
  children: React.ReactNode
  /** Collapse control aria-label. Defaults from string title when possible. */
  collapseLabel?: string
  defaultSizePercent?: number
  maxSizePercent?: number
  mainMinSizePercent?: number
  className?: string
  panelClassName?: string
}

/**
 * Docked right side surface (Query Criteria pattern):
 * controlled open state, ResizablePanel split, header collapse, resize-to-0 close.
 */
export function WorkspaceSidePanelLayout({
  open,
  onOpenChange,
  title,
  panel,
  children,
  collapseLabel,
  defaultSizePercent = WORKSPACE_SIDE_PANEL_PERCENT,
  maxSizePercent = 40,
  mainMinSizePercent = 45,
  className,
  panelClassName,
}: WorkspaceSidePanelLayoutProps) {
  const mainDefault = 100 - defaultSizePercent
  const resolvedCollapseLabel =
    collapseLabel ??
    (typeof title === "string" ? `Collapse ${title}` : "Collapse panel")

  return (
    <ResizablePanelGroup
      key={open ? "split" : "full"}
      orientation="horizontal"
      className={cn("h-full min-h-0 w-full", className)}
    >
      <ResizablePanel
        defaultSize={open ? String(mainDefault) : "100"}
        minSize={String(mainMinSizePercent)}
        className="min-h-0"
      >
        <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
          {children}
        </div>
      </ResizablePanel>

      {open ? (
        <>
          <ResizableHandle withHandle />
          <ResizablePanel
            defaultSize={String(defaultSizePercent)}
            minSize={String(defaultSizePercent)}
            maxSize={String(maxSizePercent)}
            collapsible
            collapsedSize={0}
            className="min-h-0"
            onResize={(size) => {
              if (size.asPercentage <= 0 || size.inPixels <= 0) {
                onOpenChange(false)
              }
            }}
          >
            <aside
              className={cn(
                "flex h-full min-h-0 flex-col overflow-hidden bg-muted/10",
                panelClassName
              )}
            >
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="flex w-full shrink-0 items-center justify-between gap-2 border-b px-3 py-2.5 text-left transition-colors hover:bg-muted/40"
                aria-label={resolvedCollapseLabel}
              >
                <span className="flex min-w-0 items-center gap-2 text-sm font-semibold">
                  {title}
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </button>
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                {panel}
              </div>
            </aside>
          </ResizablePanel>
        </>
      ) : null}
    </ResizablePanelGroup>
  )
}

type WorkspaceSidePanelTriggerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  label?: string
  icon?: React.ComponentType<{ className?: string }>
  /** Icon-only toolbar control (AI sparkles). */
  iconOnly?: boolean
  title?: string
  "aria-label"?: string
  className?: string
  children?: React.ReactNode
}

/** Toolbar toggle matching Query Criteria (secondary when open). */
export function WorkspaceSidePanelTrigger({
  open,
  onOpenChange,
  label,
  icon: Icon,
  iconOnly = false,
  title,
  "aria-label": ariaLabel,
  className,
  children,
}: WorkspaceSidePanelTriggerProps) {
  return (
    <Button
      type="button"
      variant={open ? "secondary" : "outline"}
      size={iconOnly ? "icon" : "sm"}
      className={cn(
        iconOnly
          ? "size-7"
          : "h-7 gap-1.5 px-2.5 text-xs",
        className
      )}
      onClick={() => onOpenChange(!open)}
      aria-pressed={open}
      aria-label={ariaLabel ?? label}
      title={title ?? label}
    >
      {children ?? (
        <>
          {Icon ? <Icon className="size-3.5" /> : null}
          {!iconOnly && label ? label : null}
        </>
      )}
    </Button>
  )
}
