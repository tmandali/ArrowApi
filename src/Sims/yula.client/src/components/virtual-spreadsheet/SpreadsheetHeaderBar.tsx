"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import {
  Copy,
  ListFilter,
  Maximize2,
  Minimize2,
  Sigma,
  Table2,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  panelHeaderClass,
  panelHeaderIconClass,
  panelHeaderSubtitleClass,
  panelHeaderTitleClass,
} from "@/components/layout/panel-chrome"
import { cn } from "@/utils/cn"
import { AIChatAssistant } from "@/components/layout/ai-chat/ai-chat-assistant"
import { ColumnManagementMenu } from "./ColumnManagementMenu"
import { AiViewDropdown } from "./AiViewDropdown"
import type {
  SpreadsheetColumn,
  AiSqlView,
} from "./types"
import type { ConditionalColorRule } from "./conditional-rules"

export interface SpreadsheetHeaderBarProps {
  isMaximized: boolean
  title?: string
  subtitle?: React.ReactNode
  aiViews?: readonly AiSqlView[]
  activeAiViewId?: string | null
  currentQuerySql?: string | null
  currentQueryTitle?: string | null
  onSelectAiView?: (viewId: string | null) => void
  onSaveCurrentAiView?: (title: string) => void
  onRenameAiView?: (viewId: string, nextTitle: string) => void
  onDeleteAiView?: (viewId: string) => void
  isViewLoading?: boolean
  headerActions?: React.ReactNode
  disableColumnVisibility?: boolean
  columnRules?: Record<string, ConditionalColorRule[]>
  onColumnRulesChange?: (column: string, rules: ConditionalColorRule[]) => void
  columns: readonly SpreadsheetColumn[]
  orderedColumns: SpreadsheetColumn[]
  visibleColumns: SpreadsheetColumn[]
  hiddenSet: Set<string>
  pinnedSet: Set<string>
  toggleColumnVisibility: (columnName: string) => void
  toggleColumnPin: (columnName: string) => void
  moveColumn: (columnName: string, direction: "up" | "down") => void
  executeColumnReorder: (draggedName: string, targetName: string, position?: "before" | "after") => void
  handleResetColumns: () => void
  canResetColumns: boolean
  hiddenColumnsCount: number
  disableColumnReorder?: boolean
  showFilterRow?: boolean
  onToggleFilterRow?: (show: boolean) => void
  showFooterRow?: boolean
  onToggleFooterRow?: (show: boolean) => void
  cellLocator?: boolean
  nameBoxDraft: string | null
  selectionRefLabel: string | null
  setNameBoxDraft: (val: string | null) => void
  commitNameBox: () => void
  clearSelection: () => void
  selectionSize: { rows: number; cols: number; cells: number } | null
  selection: unknown
  handleCopyTsv: () => void
  handleToggleMaximize: () => void
}

export function SpreadsheetHeaderBar({
  isMaximized,
  title,
  subtitle,
  aiViews,
  activeAiViewId,
  currentQuerySql,
  currentQueryTitle,
  onSelectAiView,
  onSaveCurrentAiView,
  onRenameAiView,
  onDeleteAiView,
  isViewLoading,
  headerActions,
  disableColumnVisibility = false,
  columnRules,
  onColumnRulesChange,
  columns,
  orderedColumns,
  visibleColumns,
  hiddenSet,
  pinnedSet,
  toggleColumnVisibility,
  toggleColumnPin,
  moveColumn,
  executeColumnReorder,
  handleResetColumns,
  canResetColumns,
  hiddenColumnsCount,
  disableColumnReorder = false,
  showFilterRow = false,
  onToggleFilterRow,
  showFooterRow = false,
  onToggleFooterRow,
  cellLocator = true,
  nameBoxDraft,
  selectionRefLabel,
  setNameBoxDraft,
  commitNameBox,
  clearSelection,
  selectionSize,
  selection,
  handleCopyTsv,
  handleToggleMaximize,
}: SpreadsheetHeaderBarProps) {
  const t = useTranslations("ReportGrid")

  return (
    <div className={cn(panelHeaderClass, isMaximized && "px-1")}>
      <div
        className={cn(
          "flex min-w-0 flex-1 items-center gap-2 overflow-hidden mr-2",
          isMaximized && "mr-0"
        )}
      >
        {aiViews !== undefined || activeAiViewId != null || Boolean(currentQuerySql) ? (
          <AiViewDropdown
            reportTitle={title}
            aiViews={aiViews}
            activeAiViewId={activeAiViewId}
            currentQuerySql={currentQuerySql}
            currentQueryTitle={currentQueryTitle}
            onSelectAiView={onSelectAiView}
            onSaveCurrentAiView={onSaveCurrentAiView}
            onRenameAiView={onRenameAiView}
            onDeleteAiView={onDeleteAiView}
            isViewLoading={isViewLoading}
          />
        ) : (
          <div className="flex min-w-0 max-w-[200px] sm:max-w-[320px] items-center gap-1.5 shrink">
            <Table2 className={panelHeaderIconClass} aria-hidden />
            <span className={panelHeaderTitleClass}>{title}</span>
          </div>
        )}
        {subtitle != null ? (
          <span className={cn(panelHeaderSubtitleClass, "min-w-0 shrink truncate")}>
            {subtitle}
          </span>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1.5 self-center ml-auto">
        {headerActions}
        {headerActions ? (
          <span className="h-4 w-px shrink-0 bg-border/60" aria-hidden />
        ) : null}
        {!disableColumnVisibility ? (
          <ColumnManagementMenu
            columnRules={columnRules}
            onColumnRulesChange={onColumnRulesChange}
            columns={columns}
            orderedColumns={orderedColumns}
            visibleColumns={visibleColumns}
            hiddenSet={hiddenSet}
            pinnedSet={pinnedSet}
            toggleColumnVisibility={toggleColumnVisibility}
            toggleColumnPin={toggleColumnPin}
            onMoveColumn={moveColumn}
            onReorderColumn={executeColumnReorder}
            onResetColumns={handleResetColumns}
            canReset={canResetColumns}
            hiddenColumnsCount={hiddenColumnsCount}
            disabled={columns.length === 0}
            disableReorder={disableColumnReorder}
          />
        ) : null}
        {onToggleFilterRow ? (
          <Button
            type="button"
            variant={showFilterRow ? "secondary" : "outline"}
            size="icon"
            className="size-7 shrink-0"
            disabled={columns.length === 0}
            onClick={() => onToggleFilterRow(!showFilterRow)}
            title={showFilterRow ? "Hide filter row" : "Show filter row"}
            aria-label={showFilterRow ? "Hide filter row" : "Show filter row"}
          >
            <ListFilter className="size-3.5" />
          </Button>
        ) : null}
        {onToggleFooterRow ? (
          <Button
            type="button"
            variant={showFooterRow ? "secondary" : "outline"}
            size="icon"
            className="size-7 shrink-0"
            disabled={columns.length === 0}
            onClick={() => onToggleFooterRow(!showFooterRow)}
            title={showFooterRow ? t("footer_toggle_hide") : t("footer_toggle_show")}
            aria-label={showFooterRow ? t("footer_toggle_hide") : t("footer_toggle_show")}
          >
            <Sigma className="size-3.5" />
          </Button>
        ) : null}
        {cellLocator ? (
          <>
            <span className="h-4 w-px shrink-0 bg-border/60" aria-hidden />
            <div className="group/namebox relative h-7 shrink-0">
              <input
                className="h-7 w-24 rounded-md border border-border/60 bg-background px-1.5 font-mono text-[11px] tabular-nums text-foreground shadow-none outline-none focus-visible:border-border disabled:opacity-50"
                value={nameBoxDraft ?? selectionRefLabel ?? ""}
                placeholder="A1"
                disabled={columns.length === 0}
                onChange={(e) => setNameBoxDraft(e.target.value)}
                onBlur={commitNameBox}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitNameBox()
                  if (e.key === "Escape") {
                    e.stopPropagation()
                    clearSelection()
                  }
                }}
                spellCheck={false}
                title={
                  selectionSize
                    ? `${selectionRefLabel ?? ""} — ${selectionSize.rows} × ${selectionSize.cols} · ${selectionSize.cells} hücre`
                    : "Hücre aralığı (A1 formatı, örn. B5 veya B5:D10)"
                }
                aria-label="Hücre aralığı (A1 formatı, örn. B5 veya B5:D10)"
              />
              {selection ? (
                <div className="absolute right-0 top-0 flex h-full items-center gap-0.5 rounded-r-md bg-background pl-1 opacity-0 transition-opacity group-hover/namebox:opacity-100">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-6 shrink-0"
                    onClick={handleCopyTsv}
                    title="Seçili aralığı TSV olarak kopyala (Ctrl/Cmd+C)"
                    aria-label="Seçili aralığı kopyala"
                  >
                    <Copy className="size-3" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-6 shrink-0"
                    onClick={() => {
                      clearSelection()
                      setNameBoxDraft(null)
                    }}
                    title="Seçimi temizle (Esc)"
                    aria-label="Seçimi temizle"
                  >
                    <X className="size-3" />
                  </Button>
                </div>
              ) : null}
            </div>
            <span className="h-4 w-px shrink-0 bg-border/60" aria-hidden />
          </>
        ) : null}
        <Button
          type="button"
          variant={isMaximized ? "secondary" : "outline"}
          size="icon"
          className="size-7 shrink-0"
          onClick={handleToggleMaximize}
          title={isMaximized ? t("unmaximize_title") : t("maximize_title")}
          aria-label={isMaximized ? t("unmaximize_title") : t("maximize_title")}
        >
          {isMaximized ? (
            <Minimize2 className="size-3.5" />
          ) : (
            <Maximize2 className="size-3.5" />
          )}
        </Button>
        {isMaximized ? <AIChatAssistant separator={false} /> : null}
      </div>
    </div>
  )
}
