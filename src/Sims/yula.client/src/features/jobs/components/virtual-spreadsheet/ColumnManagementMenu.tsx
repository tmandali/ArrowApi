"use client";

import * as React from "react"
import { useTranslations } from "next-intl"
import {
  ChevronDown,
  ChevronUp,
  Columns3,
  GripVertical,
  Palette,
  Plus,
  Pin,
  RotateCcw,
  Search,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/utils/cn"
import type { SpreadsheetColumn } from "./types"
import { ColumnTypeBadge } from "./ColumnTypeBadge"
import {
  ConditionalColorRule,
  ColumnColorRules,
  RULE_OPERATORS,
  RULE_COLORS,
  ruleStyleClasses,
  createColorRule,
} from "./conditional-rules"

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
  /** Palet butonu ile açılan eşik renk kuralı editörü (kolon adı). */
  const [rulesEditorCol, setRulesEditorCol] = React.useState<string | null>(null)
  /** Eşik input'ları: kural id → yazı (blur/Enter'da parse edilip commit). */
  const [thresholdDrafts, setThresholdDrafts] = React.useState<Record<string, string>>({})
  const searchInputRef = React.useRef<HTMLInputElement>(null)
  const columnItemRefs = React.useRef<(HTMLDivElement | null)[]>([])

  const setRulesForColumn = React.useCallback(
    (column: string, rules: ConditionalColorRule[]) => {
      onColumnRulesChange?.(column, rules)
    },
    [onColumnRulesChange]
  )

  const updateRule = React.useCallback(
    (column: string, ruleId: string, patch: Partial<Omit<ConditionalColorRule, "id">>) => {
      const current = columnRules?.[column] ?? []
      setRulesForColumn(
        column,
        current.map((r) => (r.id === ruleId ? { ...r, ...patch } : r))
      )
    },
    [columnRules, setRulesForColumn]
  )

  const removeRule = React.useCallback(
    (column: string, ruleId: string) => {
      const current = columnRules?.[column] ?? []
      setRulesForColumn(column, current.filter((r) => r.id !== ruleId))
    },
    [columnRules, setRulesForColumn]
  )

  const addRule = React.useCallback(
    (column: string) => {
      const current = columnRules?.[column] ?? []
      setRulesForColumn(column, [...current, createColorRule()])
    },
    [columnRules, setRulesForColumn]
  )

  const commitThresholdDraft = React.useCallback(
    (column: string, rule: ConditionalColorRule) => {
      const draft = thresholdDrafts[rule.id]
      if (draft == null) return
      const parsed = Number(draft.trim().replace(",", "."))
      updateRule(column, rule.id, { value: Number.isFinite(parsed) ? parsed : 0 })
      setThresholdDrafts((prev) => {
        const next = { ...prev }
        delete next[rule.id]
        return next
      })
    },
    [thresholdDrafts, updateRule]
  )

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
        // Sadece listede bir kolon seçiliyken Space ile aç/kapat (arama kutusunda boşluk yazabilsin)
        if (focusedColIndex >= 0 && focusedColIndex < count) {
          event.preventDefault()
          toggleColumnVisibility(filteredMenuColumns[focusedColIndex].name)
        }
      } else if (event.key === "p" || event.key === "P") {
        // Seçili kolonu sabitle / sabitlemeyi kaldır
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

        {/* Kolon arama (her zaman görünür, menü açıldığında otomatik odaklanır) */}
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

        {/* Kolon Listesi (Klavye Ok Tuşları / Alt+Ok Tuşları / D&D ile sıralanabilir) */}
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
              <React.Fragment key={col.name}>
                {isFirstUnpinned ? (
                  <div
                    className="my-1.5 border-t border-border/60"
                    role="separator"
                    aria-orientation="horizontal"
                  />
                ) : null}
                <div
                  ref={(el) => {
                    columnItemRefs.current[index] = el
                  }}
                  tabIndex={-1}
                  draggable={!disableReorder}
                  onDragStart={(e) => {
                    if (disableReorder) return
                    e.dataTransfer.setData("text/plain", col.name)
                    e.dataTransfer.effectAllowed = "move"
                    setMenuDraggedCol(col.name)
                  }}
                  onDragOver={(e) => {
                    if (menuDraggedCol && menuDraggedCol !== col.name) {
                      e.preventDefault()
                      e.dataTransfer.dropEffect = "move"
                      setMenuDropTarget(col.name)
                    }
                  }}
                  onDragLeave={() => {
                    if (menuDropTarget === col.name) {
                      setMenuDropTarget(null)
                    }
                  }}
                  onDrop={(e) => {
                    e.preventDefault()
                    if (menuDraggedCol && menuDraggedCol !== col.name) {
                      onReorderColumn?.(menuDraggedCol, col.name, "before")
                    }
                    setMenuDraggedCol(null)
                    setMenuDropTarget(null)
                  }}
                  onDragEnd={() => {
                    setMenuDraggedCol(null)
                    setMenuDropTarget(null)
                  }}
                  onClick={() => setFocusedColIndex(index)}
                  onMouseEnter={() => setFocusedColIndex(index)}
                  className={cn(
                    "group flex items-center justify-between gap-1.5 rounded px-1.5 py-1 text-xs transition-colors select-none",
                    isFocused && "bg-accent text-accent-foreground",
                    !isFocused && "hover:bg-muted/60 text-foreground",
                    isDropTarget && "border-t-2 border-primary"
                  )}
                >
                  <div
                    className={cn(
                      "flex min-w-0 flex-1 items-center gap-1.5",
                      isLastVisible
                        ? "opacity-50 cursor-not-allowed"
                        : "cursor-pointer"
                    )}
                    onClick={() => !isLastVisible && toggleColumnVisibility(col.name)}
                    title={isLastVisible ? t("at_least_one_visible") : undefined}
                  >
                    {!disableReorder ? (
                      <GripVertical className="size-3 text-muted-foreground/30 group-hover:text-muted-foreground/80 shrink-0 cursor-grab active:cursor-grabbing" />
                    ) : null}
                    <Checkbox
                      checked={isVisible}
                      disabled={isLastVisible}
                      tabIndex={-1}
                      onCheckedChange={() => toggleColumnVisibility(col.name)}
                    />
                    <span className="truncate flex-1">{col.label}</span>
                  </div>

                  {/* Sağ Slot: Varsayılan Veri Tipi Rozeti <-> Hover / Odak Aksiyonları (Yukarı / Aşağı / Pin) */}
                  <div className="relative flex items-center justify-end shrink-0 min-w-6">
                    {/* Varsayılan: Veri Tipi Rozeti */}
                    <div
                      className={cn(
                        "flex items-center justify-center transition-opacity",
                        isFocused
                          ? "opacity-0 pointer-events-none"
                          : "group-hover:opacity-0 group-hover:pointer-events-none"
                      )}
                    >
                      <ColumnTypeBadge col={col} isPinned={isPinned} />
                    </div>

                    {/* Hover / Klavye Odak: Hızlı Aksiyon Butonları [ ▲ ] [ ▼ ] [ 📌 ] */}
                    <div
                      className={cn(
                        "absolute right-0 flex items-center gap-0.5 transition-all",
                        isFocused
                          ? "opacity-100 scale-100"
                          : "opacity-0 scale-95 pointer-events-none group-hover:opacity-100 group-hover:scale-100 group-hover:pointer-events-auto"
                      )}
                    >
                      {/* Bir Yukarı Taşı (Sola kaydır) */}
                      <button
                        type="button"
                        disabled={!canMoveUp}
                        onClick={(e) => {
                          e.stopPropagation()
                          onMoveColumn?.(col.name, "up")
                        }}
                        className="flex size-5 items-center justify-center rounded text-muted-foreground/70 hover:text-foreground hover:bg-muted disabled:opacity-20 disabled:pointer-events-none transition-colors"
                        title={t("move_up")}
                        aria-label={t("move_up_aria", { label: col.label })}
                      >
                        <ChevronUp className="size-3.5" />
                      </button>

                      {/* Bir Aşağı Taşı (Sağa kaydır) */}
                      <button
                        type="button"
                        disabled={!canMoveDown}
                        onClick={(e) => {
                          e.stopPropagation()
                          onMoveColumn?.(col.name, "down")
                        }}
                        className="flex size-5 items-center justify-center rounded text-muted-foreground/70 hover:text-foreground hover:bg-muted disabled:opacity-20 disabled:pointer-events-none transition-colors"
                        title={t("move_down")}
                        aria-label={t("move_down_aria", { label: col.label })}
                      >
                        <ChevronDown className="size-3.5" />
                      </button>

                      {/* Eşik Renk Kuralları (palet) */}
                      {onColumnRulesChange ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setRulesEditorCol(
                              rulesEditorCol === col.name ? null : col.name
                            )
                          }}
                          className={cn(
                            "flex size-5 items-center justify-center rounded transition-colors",
                            (columnRules?.[col.name] ?? []).length > 0
                              ? "text-primary hover:bg-primary/10"
                              : "text-muted-foreground/70 hover:text-foreground hover:bg-muted"
                          )}
                          title={t("color_rules_open")}
                          aria-label={t("color_rules_open")}
                        >
                          <Palette className="size-3.5" />
                        </button>
                      ) : null}

                      {/* Sola Sabitle / Kaldır */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          toggleColumnPin(col.name)
                        }}
                        disabled={!isVisible}
                        className={cn(
                          "flex size-5 items-center justify-center rounded transition-colors",
                          isPinned
                            ? "text-primary hover:text-primary/80 hover:bg-primary/10"
                            : "text-muted-foreground/70 hover:text-foreground hover:bg-muted",
                          !isVisible && "opacity-20 cursor-not-allowed pointer-events-none"
                        )}
                        title={
                          !isVisible
                            ? t("hidden_column_cannot_pin")
                            : isPinned
                            ? t("unpin")
                            : t("pin")
                        }
                        aria-label={
                          isPinned
                            ? t("unpin_aria", { label: col.label })
                            : t("pin_aria", { label: col.label })
                        }
                      >
                        <Pin
                          className={cn(
                            "size-3 transition-transform",
                            isPinned ? "fill-primary rotate-45" : "-rotate-45"
                          )}
                        />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Eşik Renk Kuralı Editörü (palet ile açılır) */}
                {rulesEditorCol === col.name && onColumnRulesChange ? (
                  <div className="ml-5 space-y-1.5 border-l-2 border-primary/30 py-1 pl-2.5 pr-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {t("color_rules_title")}
                      </span>
                      {(columnRules?.[col.name] ?? []).length > 0 ? (
                        <button
                          type="button"
                          className="text-[10px] text-muted-foreground hover:text-foreground"
                          onClick={() => setRulesForColumn(col.name, [])}
                        >
                          {t("clear_rules")}
                        </button>
                      ) : null}
                    </div>
                    {(columnRules?.[col.name] ?? []).map((rule) => (
                      <div key={rule.id} className="flex items-center gap-1">
                        <select
                          value={rule.op}
                          onChange={(e) =>
                            updateRule(col.name, rule.id, {
                              op: e.target.value as ConditionalColorRule["op"],
                            })
                          }
                          className="h-6 w-10 rounded border border-border/60 bg-background px-0.5 text-[11px]"
                          aria-label={t("operator")}
                        >
                          {RULE_OPERATORS.map((op) => (
                            <option key={op} value={op}>
                              {op}
                            </option>
                          ))}
                        </select>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={thresholdDrafts[rule.id] ?? String(rule.value)}
                          onChange={(e) =>
                            setThresholdDrafts((prev) => ({
                              ...prev,
                              [rule.id]: e.target.value,
                            }))
                          }
                          onBlur={() => commitThresholdDraft(col.name, rule)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") commitThresholdDraft(col.name, rule)
                          }}
                          className="h-6 w-16 rounded border border-border/60 bg-background px-1 text-[11px] tabular-nums"
                          placeholder={t("threshold")}
                          aria-label={t("threshold")}
                        />
                        <div className="flex items-center gap-0.5">
                          {RULE_COLORS.map((color) => (
                            <button
                              key={color}
                              type="button"
                              title={t(`color_${color}`)}
                              aria-label={t(`color_${color}`)}
                              onClick={() =>
                                updateRule(col.name, rule.id, { color })
                              }
                              className={cn(
                                "size-3.5 rounded-full transition-transform",
                                ruleStyleClasses(color).swatch,
                                rule.color === color
                                  ? "ring-2 ring-foreground ring-offset-1 ring-offset-background scale-110"
                                  : "opacity-60 hover:opacity-100"
                              )}
                            />
                          ))}
                        </div>
                        <button
                          type="button"
                          title={t("remove_rule")}
                          aria-label={t("remove_rule")}
                          onClick={() => removeRule(col.name, rule.id)}
                          className="flex size-5 items-center justify-center rounded text-muted-foreground/60 hover:bg-muted hover:text-foreground"
                        >
                          <X className="size-3" />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => addRule(col.name)}
                      className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                    >
                      <Plus className="size-3" />
                      {t("add_rule")}
                    </button>
                  </div>
                ) : null}
              </React.Fragment>
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
