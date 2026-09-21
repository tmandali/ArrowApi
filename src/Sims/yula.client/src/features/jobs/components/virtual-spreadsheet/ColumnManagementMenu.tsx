"use client";

import * as React from "react"
import { useTranslations } from "next-intl"
import {
  Columns3,
  RotateCcw,
  Search,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import type { SpreadsheetColumn } from "./types"
import {
  ConditionalColorRule,
  ColumnColorRules,
} from "./conditional-rules"
import { ColumnMenuItem } from "./column-menu-item"

export interface ColumnManagementMenuProps {
  columns: readonly SpreadsheetColumn[]
  orderedColumns: SpreadsheetColumn[]
  visibleColumns: SpreadsheetColumn[]
  hiddenSet: Set<string>
  pinnedSet: Set<string>
  toggleColumnVisibility: (columnName: string) => void
  toggleColumnPin: (columnName: string) => void
  onMoveColumn?: (columnName: string, direction: "up" | "down") => void
  onReorderColumn?: (
    draggedName: string,
    targetName: string,
    position?: "before" | "after"
  ) => void
  onResetColumns: () => void
  canReset: boolean
  hiddenColumnsCount: number
  disabled?: boolean
  disableReorder?: boolean
  /** Eşik tabanlı koşullu renk kuralları (kolon adı → kurallar). */
  columnRules?: ColumnColorRules
  onColumnRulesChange?: (column: string, rules: ConditionalColorRule[]) => void
}

export function ColumnManagementMenu({
  columns,
  orderedColumns,
  visibleColumns,
  hiddenSet,
  pinnedSet,
  toggleColumnVisibility,
  toggleColumnPin,
  onMoveColumn,
  onReorderColumn,
  onResetColumns,
  canReset,
  hiddenColumnsCount,
  disabled = false,
  disableReorder = false,
  columnRules,
  onColumnRulesChange,
}: ColumnManagementMenuProps) {
  const t = useTranslations("GridColumns")
  const [columnMenuOpen, setColumnMenuOpen] = React.useState(false)
  const [columnSearch, setColumnSearch] = React.useState("")
  const [focusedColIndex, setFocusedColIndex] = React.useState<number>(-1)
  const [menuDraggedCol, setMenuDraggedCol] = React.useState<string | null>(null)
  const [menuDropTarget, setMenuDropTarget] = React.useState<string | null>(null)
  const [rulesEditorCol, setRulesEditorCol] = React.useState<string | null>(null)
  const searchInputRef = React.useRef<HTMLInputElement>(null)
  const columnItemRefs = React.useRef<(HTMLDivElement | null)[]>([])

  const handleOpenChange = React.useCallback((open: boolean) => {
    setColumnMenuOpen(open)
    setFocusedColIndex(-1)
    setMenuDraggedCol(null)
    setMenuDropTarget(null)
    setRulesEditorCol(null)
    if (!open) {
      setColumnSearch("")
    }
  }, [])

  const filteredMenuColumns = React.useMemo(() => {
    if (!columnSearch.trim()) return orderedColumns
    const query = columnSearch.toLowerCase().trim()
    return orderedColumns.filter(
      (c) =>
        c.label.toLowerCase().includes(query) ||
        c.name.toLowerCase().includes(query)
    )
  }, [orderedColumns, columnSearch])

  const handleColumnSearchChange = React.useCallback((val: string) => {
    setColumnSearch(val)
    setFocusedColIndex(-1)
  }, [])

  const handleMenuKeyDown = React.useCallback(
    (event: React.KeyboardEvent) => {
      const count = filteredMenuColumns.length

      if (event.key === "ArrowDown") {
        if (event.altKey && !disableReorder) {
          event.preventDefault()
          if (focusedColIndex >= 0 && focusedColIndex < count) {
            const col = filteredMenuColumns[focusedColIndex]
            onMoveColumn?.(col.name, "down")
            if (focusedColIndex < count - 1) {
              const next = focusedColIndex + 1
              setFocusedColIndex(next)
              columnItemRefs.current[next]?.scrollIntoView({ block: "nearest" })
            }
          }
          return
        }
        event.preventDefault()
        if (count === 0) return
        setFocusedColIndex((prev) => {
          const next = prev < count - 1 ? prev + 1 : 0
          columnItemRefs.current[next]?.scrollIntoView({ block: "nearest" })
          return next
        })
      } else if (event.key === "ArrowUp") {
        if (event.altKey && !disableReorder) {
          event.preventDefault()
          if (focusedColIndex >= 0 && focusedColIndex < count) {
            const col = filteredMenuColumns[focusedColIndex]
            onMoveColumn?.(col.name, "up")
            if (focusedColIndex > 0) {
              const next = focusedColIndex - 1
              setFocusedColIndex(next)
              columnItemRefs.current[next]?.scrollIntoView({ block: "nearest" })
            }
          }
          return
        }
        event.preventDefault()
        if (count === 0) return
        setFocusedColIndex((prev) => {
          if (prev === -1) {
            const next = count - 1
            columnItemRefs.current[next]?.scrollIntoView({ block: "nearest" })
            return next
          }
          if (prev === 0) {
            searchInputRef.current?.focus()
            return -1
          }
          const next = prev - 1
          columnItemRefs.current[next]?.scrollIntoView({ block: "nearest" })
          return next
        })
      } else if (event.key === "Enter") {
        event.preventDefault()
        if (focusedColIndex >= 0 && focusedColIndex < count) {
          toggleColumnVisibility(filteredMenuColumns[focusedColIndex].name)
        } else if (focusedColIndex === -1 && count > 0) {
          toggleColumnVisibility(filteredMenuColumns[0].name)
        }
      } else if (event.key === " ") {
        if (focusedColIndex >= 0 && focusedColIndex < count) {
          event.preventDefault()
          toggleColumnVisibility(filteredMenuColumns[focusedColIndex].name)
        }
      } else if (event.key === "p" || event.key === "P") {
        if (focusedColIndex >= 0 && focusedColIndex < count) {
          event.preventDefault()
          toggleColumnPin(filteredMenuColumns[focusedColIndex].name)
        }
      } else if (event.key === "Escape") {
        if (columnSearch) {
          event.preventDefault()
          event.stopPropagation()
          setColumnSearch("")
          setFocusedColIndex(-1)
          searchInputRef.current?.focus()
        } else {
          setColumnMenuOpen(false)
        }
      }
    },
    [
      filteredMenuColumns,
      focusedColIndex,
      columnSearch,
      toggleColumnVisibility,
      toggleColumnPin,
      onMoveColumn,
      disableReorder,
    ]
  )

  const handleDragStart = React.useCallback(
    (e: React.DragEvent, colName: string) => {
      if (disableReorder) return
      e.dataTransfer.setData("text/plain", colName)
      e.dataTransfer.effectAllowed = "move"
      setMenuDraggedCol(colName)
    },
    [disableReorder]
  )

  const handleDragOver = React.useCallback(
    (e: React.DragEvent, colName: string) => {
      if (menuDraggedCol && menuDraggedCol !== colName) {
        e.preventDefault()
        e.dataTransfer.dropEffect = "move"
        setMenuDropTarget(colName)
      }
    },
    [menuDraggedCol]
  )

  const handleDragLeave = React.useCallback(
    (colName: string) => {
      if (menuDropTarget === colName) {
        setMenuDropTarget(null)
      }
    },
    [menuDropTarget]
  )

  const handleDrop = React.useCallback(
    (e: React.DragEvent, colName: string) => {
      e.preventDefault()
      if (menuDraggedCol && menuDraggedCol !== colName) {
        onReorderColumn?.(menuDraggedCol, colName, "before")
      }
      setMenuDraggedCol(null)
      setMenuDropTarget(null)
    },
    [menuDraggedCol, onReorderColumn]
  )

  const handleDragEnd = React.useCallback(() => {
    setMenuDraggedCol(null)
    setMenuDropTarget(null)
  }, [])

  const handleToggleRulesEditor = React.useCallback(
    (colName: string) => {
      setRulesEditorCol((prev) => (prev === colName ? null : colName))
    },
    []
  )

  return (
    <Popover open={columnMenuOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="relative size-7 shrink-0"
          disabled={disabled || columns.length === 0}
          title={t("manage_title")}
          aria-label={t("manage_aria")}
        >
          <Columns3 className="size-3.5" />
          {hiddenColumnsCount > 0 ? (
            <span className="absolute -top-1 -right-1 flex size-3.5 items-center justify-center rounded-full bg-primary text-[9px] font-medium text-primary-foreground">
              {hiddenColumnsCount}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={6}
        className="w-80 p-2 shadow-lg flex flex-col gap-1.5"
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          searchInputRef.current?.focus()
          searchInputRef.current?.select()
        }}
        onKeyDown={handleMenuKeyDown}
      >
        <div className="flex items-center justify-between border-b border-border/50 pb-1.5">
          <div className="flex items-center gap-1.5 font-medium text-foreground text-xs">
            <Columns3 className="size-3.5 text-muted-foreground" />
            <span>{t("columns_heading")}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {visibleColumns.length} / {orderedColumns.length}
            </span>
            <button
              type="button"
              disabled={!canReset}
              onClick={onResetColumns}
              className="flex size-5 items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted/70 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
              title={t("reset_default")}
              aria-label={t("reset_default")}
            >
              <RotateCcw className="size-3" />
            </button>
          </div>
        </div>

        {/* Kolon arama */}
        <div className="relative flex items-center">
          <Search className="absolute left-2 size-3 text-muted-foreground pointer-events-none" />
          <Input
            ref={searchInputRef}
            value={columnSearch}
            onChange={(e) => handleColumnSearchChange(e.target.value)}
            placeholder="Kolon ara…"
            className="h-7 pl-7 pr-6 text-xs"
            autoFocus
          />
          {columnSearch ? (
            <button
              type="button"
              onClick={() => {
                setColumnSearch("")
                setFocusedColIndex(-1)
                searchInputRef.current?.focus()
              }}
              className="absolute right-1.5 flex size-4 items-center justify-center rounded text-muted-foreground hover:text-foreground"
            >
              <X className="size-3" />
            </button>
          ) : null}
        </div>

        {/* Kolon Listesi */}
        <div className="max-h-64 overflow-y-auto space-y-0.5 pr-0.5" role="listbox">
          {filteredMenuColumns.map((col, index) => {
            const isVisible = !hiddenSet.has(col.name)
            const isLastVisible = isVisible && visibleColumns.length <= 1
            const isFocused = focusedColIndex === index
            const isPinned = pinnedSet.has(col.name)
            const prevCol = index > 0 ? filteredMenuColumns[index - 1] : null
            const isFirstUnpinned = !isPinned && prevCol !== null && pinnedSet.has(prevCol.name)
            const globalIndex = orderedColumns.findIndex((c) => c.name === col.name)
            const canMoveUp = !disableReorder && globalIndex > 0
            const canMoveDown = !disableReorder && globalIndex < orderedColumns.length - 1
            const isDropTarget = menuDropTarget === col.name

            return (
              <ColumnMenuItem
                key={col.name}
                col={col}
                index={index}
                isVisible={isVisible}
                isLastVisible={isLastVisible}
                isFocused={isFocused}
                isPinned={isPinned}
                isFirstUnpinned={isFirstUnpinned}
                canMoveUp={canMoveUp}
                canMoveDown={canMoveDown}
                isDropTarget={isDropTarget}
                disableReorder={disableReorder}
                hasColorRules={(columnRules?.[col.name] ?? []).length > 0}
                isRulesEditorOpen={rulesEditorCol === col.name}
                rules={columnRules?.[col.name]}
                onColumnRulesChange={onColumnRulesChange}
                onToggleVisible={toggleColumnVisibility}
                onTogglePin={toggleColumnPin}
                onMoveUp={(name) => onMoveColumn?.(name, "up")}
                onMoveDown={(name) => onMoveColumn?.(name, "down")}
                onToggleRulesEditor={handleToggleRulesEditor}
                onFocusItem={setFocusedColIndex}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onDragEnd={handleDragEnd}
                itemRef={(el) => {
                  columnItemRefs.current[index] = el
                }}
              />
            )
          })}
          {filteredMenuColumns.length === 0 ? (
            <div className="py-3 text-center text-xs text-muted-foreground">
              {t("no_columns")}
            </div>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  )
}
