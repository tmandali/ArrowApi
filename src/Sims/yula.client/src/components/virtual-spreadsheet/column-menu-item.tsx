"use client";

import * as React from "react"
import { useTranslations } from "next-intl"
import {
  ChevronDown,
  ChevronUp,
  GripVertical,
  Palette,
  Pin,
} from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { cn } from "@/utils/cn"
import type { SpreadsheetColumn } from "./types"
import { ColumnTypeBadge } from "./ColumnTypeBadge"
import { ConditionalColorRule } from "./conditional-rules"
import { ColumnRuleEditor } from "./column-rule-editor"

export interface ColumnMenuItemProps {
  col: SpreadsheetColumn
  index: number
  isVisible: boolean
  isLastVisible: boolean
  isFocused: boolean
  isPinned: boolean
  isFirstUnpinned: boolean
  canMoveUp: boolean
  canMoveDown: boolean
  isDropTarget: boolean
  disableReorder: boolean
  hasColorRules: boolean
  isRulesEditorOpen: boolean
  rules?: ConditionalColorRule[]
  onColumnRulesChange?: (column: string, rules: ConditionalColorRule[]) => void
  onToggleVisible: (columnName: string) => void
  onTogglePin: (columnName: string) => void
  onMoveUp: (columnName: string) => void
  onMoveDown: (columnName: string) => void
  onToggleRulesEditor: (columnName: string) => void
  onFocusItem: (index: number) => void
  onDragStart: (e: React.DragEvent, columnName: string) => void
  onDragOver: (e: React.DragEvent, columnName: string) => void
  onDragLeave: (columnName: string) => void
  onDrop: (e: React.DragEvent, columnName: string) => void
  onDragEnd: () => void
  itemRef: (el: HTMLDivElement | null) => void
}

export function ColumnMenuItem({
  col,
  index,
  isVisible,
  isLastVisible,
  isFocused,
  isPinned,
  isFirstUnpinned,
  canMoveUp,
  canMoveDown,
  isDropTarget,
  disableReorder,
  hasColorRules,
  isRulesEditorOpen,
  rules,
  onColumnRulesChange,
  onToggleVisible,
  onTogglePin,
  onMoveUp,
  onMoveDown,
  onToggleRulesEditor,
  onFocusItem,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
  itemRef,
}: ColumnMenuItemProps) {
  const t = useTranslations("GridColumns")

  return (
    <React.Fragment>
      {isFirstUnpinned ? (
        <div
          className="my-1.5 border-t border-border/60"
          role="separator"
          aria-orientation="horizontal"
        />
      ) : null}
      <div
        ref={itemRef}
        tabIndex={-1}
        draggable={!disableReorder}
        onDragStart={(e) => onDragStart(e, col.name)}
        onDragOver={(e) => onDragOver(e, col.name)}
        onDragLeave={() => onDragLeave(col.name)}
        onDrop={(e) => onDrop(e, col.name)}
        onDragEnd={onDragEnd}
        onClick={() => onFocusItem(index)}
        onMouseEnter={() => onFocusItem(index)}
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
            isLastVisible ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
          )}
          onClick={() => !isLastVisible && onToggleVisible(col.name)}
          title={isLastVisible ? t("at_least_one_visible") : undefined}
        >
          {!disableReorder ? (
            <GripVertical className="size-3 text-muted-foreground/30 group-hover:text-muted-foreground/80 shrink-0 cursor-grab active:cursor-grabbing" />
          ) : null}
          <Checkbox
            checked={isVisible}
            disabled={isLastVisible}
            tabIndex={-1}
            onCheckedChange={() => onToggleVisible(col.name)}
          />
          <span className="truncate flex-1">{col.label}</span>
        </div>

        {/* Sağ Slot: Varsayılan Veri Tipi Rozeti <-> Hover / Odak Aksiyonları */}
        <div className="relative flex items-center justify-end shrink-0 min-w-6">
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

          <div
            className={cn(
              "absolute right-0 flex items-center gap-0.5 transition-all",
              isFocused
                ? "opacity-100 scale-100"
                : "opacity-0 scale-95 pointer-events-none group-hover:opacity-100 group-hover:scale-100 group-hover:pointer-events-auto"
            )}
          >
            <button
              type="button"
              disabled={!canMoveUp}
              onClick={(e) => {
                e.stopPropagation()
                onMoveUp(col.name)
              }}
              className="flex size-5 items-center justify-center rounded text-muted-foreground/70 hover:text-foreground hover:bg-muted disabled:opacity-20 disabled:pointer-events-none transition-colors"
              title={t("move_up")}
              aria-label={t("move_up_aria", { label: col.label })}
            >
              <ChevronUp className="size-3.5" />
            </button>

            <button
              type="button"
              disabled={!canMoveDown}
              onClick={(e) => {
                e.stopPropagation()
                onMoveDown(col.name)
              }}
              className="flex size-5 items-center justify-center rounded text-muted-foreground/70 hover:text-foreground hover:bg-muted disabled:opacity-20 disabled:pointer-events-none transition-colors"
              title={t("move_down")}
              aria-label={t("move_down_aria", { label: col.label })}
            >
              <ChevronDown className="size-3.5" />
            </button>

            {onColumnRulesChange ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onToggleRulesEditor(col.name)
                }}
                className={cn(
                  "flex size-5 items-center justify-center rounded transition-colors",
                  hasColorRules
                    ? "text-primary hover:bg-primary/10"
                    : "text-muted-foreground/70 hover:text-foreground hover:bg-muted"
                )}
                title={t("color_rules_open")}
                aria-label={t("color_rules_open")}
              >
                <Palette className="size-3.5" />
              </button>
            ) : null}

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onTogglePin(col.name)
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

      {isRulesEditorOpen && onColumnRulesChange && rules ? (
        <ColumnRuleEditor
          column={col.name}
          rules={rules}
          onChangeRules={onColumnRulesChange}
        />
      ) : null}
    </React.Fragment>
  )
}
