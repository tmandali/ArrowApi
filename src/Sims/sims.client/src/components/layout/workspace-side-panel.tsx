import * as React from "react"
import { Button } from "@/components/ui/button"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import {
  pageInsetGutterClass,
  panelCardClass,
  panelHeaderAccentBorderClass,
  panelHeaderClass,
  panelHeaderTitleClass,
  panelResizeHandleClass,
  panelShellClass,
} from "@/components/layout/panel-chrome"
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
  /** Extra controls in the panel header (before collapse). */
  headerActions?: React.ReactNode
  /** Collapse control aria-label. Defaults from string title when possible. */
  collapseLabel?: string
  defaultSizePercent?: number
  /** Minimum panel width while open. Defaults to defaultSizePercent. */
  minSizePercent?: number
  maxSizePercent?: number
  mainMinSizePercent?: number
  className?: string
  /** Classes for the main (left) content shell. */
  mainClassName?: string
  /** Classes for the panel surface (card / background). */
  panelClassName?: string
  /** Classes for the outer panel shell (gutters around a card). */
  panelShellClassName?: string
  /** Classes for the resize handle between main and panel. */
  handleClassName?: string
  /** Classes for the panel header bar. */
  headerClassName?: string
  /**
   * When false (tablet/phone), an open panel replaces main content instead of
   * docking beside it — same rule as Yula below 1024px.
   */
  sideDockAllowed?: boolean
}

function SidePanelHeader({
  title,
  headerActions,
  collapseLabel,
  onCollapse,
  className,
}: {
  title: React.ReactNode
  headerActions?: React.ReactNode
  collapseLabel: string
  onCollapse: () => void
  className?: string
}) {
  return (
    <div className={cn(panelHeaderClass, "gap-1", className)}>
      <button
        type="button"
        onClick={onCollapse}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-0.5 py-1 text-left transition-colors hover:bg-muted/40"
        aria-label={collapseLabel}
      >
        <span className={cn("flex min-w-0 items-center gap-2", panelHeaderTitleClass)}>
          {title}
        </span>
      </button>
      {headerActions}
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="size-7 shrink-0"
        onClick={onCollapse}
        aria-label={collapseLabel}
      >
        <ChevronRight className="size-4 text-muted-foreground" />
      </Button>
    </div>
  )
}

/**
 * Docked right side surface (Query Criteria pattern):
 * controlled open state, ResizablePanel split, header collapse, resize-to-0 close.
 * Below tablet width, pass sideDockAllowed={false} for full-content panel.
 */
export function WorkspaceSidePanelLayout({
  open,
  onOpenChange,
  title,
  panel,
  children,
  headerActions,
  collapseLabel,
  defaultSizePercent = WORKSPACE_SIDE_PANEL_PERCENT,
  minSizePercent,
  maxSizePercent = 40,
  mainMinSizePercent = 45,
  className,
  mainClassName,
  panelClassName,
  panelShellClassName,
  handleClassName,
  headerClassName,
  sideDockAllowed = true,
}: WorkspaceSidePanelLayoutProps) {
  const mainDefault = 100 - defaultSizePercent
  const panelMinSize = minSizePercent ?? defaultSizePercent
  const resolvedCollapseLabel =
    collapseLabel ??
    (typeof title === "string" ? `Collapse ${title}` : "Collapse panel")

  const resolvedShellClass = panelShellClassName ?? panelShellClass
  const resolvedPanelClass = panelClassName ?? panelCardClass
  const resolvedHeaderClass = headerClassName ?? panelHeaderAccentBorderClass
  const resolvedHandleClass = handleClassName ?? panelResizeHandleClass

  const panelSurface = (
    <>
      <SidePanelHeader
        title={title}
        headerActions={headerActions}
        collapseLabel={resolvedCollapseLabel}
        onCollapse={() => onOpenChange(false)}
        className={resolvedHeaderClass}
      />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {panel}
      </div>
    </>
  )

  if (open && !sideDockAllowed) {
    return (
      <aside
        className={cn(
          "flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
          pageInsetGutterClass,
          className
        )}
      >
        <div className={cn(resolvedPanelClass, "flex-1")}>{panelSurface}</div>
      </aside>
    )
  }

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
        <div
          className={cn(
            "flex h-full min-h-0 min-w-0 flex-col overflow-hidden",
            open && "[&>*]:pr-0!",
            mainClassName
          )}
        >
          {children}
        </div>
      </ResizablePanel>

      {open ? (
        <>
          <ResizableHandle withHandle className={resolvedHandleClass} />
          <ResizablePanel
            defaultSize={String(defaultSizePercent)}
            minSize={String(panelMinSize)}
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
                "flex h-full min-h-0 flex-col overflow-hidden",
                resolvedShellClass
              )}
            >
              <div className={cn(resolvedPanelClass, "flex-1")}>
                {panelSurface}
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
          {!iconOnly && label ? (
            <span className="truncate">{label}</span>
          ) : null}
        </>
      )}
    </Button>
  )
}
