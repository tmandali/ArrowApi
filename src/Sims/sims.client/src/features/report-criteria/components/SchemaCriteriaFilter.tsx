import * as React from "react"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  ChevronDown,
  Copy,
  Keyboard,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react"
import { cn } from "@/utils/cn"
import { parseCriteriaSchema } from "../lib/parse-criteria-schema"
import { createInitialCriteriaRows } from "../lib/create-initial-criteria-rows"
import { rowsToCriteriaInstance } from "../lib/rows-to-criteria-instance"
import { validateCellPatterns } from "../lib/validate-cell-patterns"
import { validateCriteria } from "../lib/validate-criteria"
import type {
  CriteriaComboboxOption,
  CriteriaFilterRow,
  CriteriaValidationResult,
  JsonSchemaObject,
} from "../types"
import { CriteriaSimpleCombobox } from "./CriteriaSimpleCombobox"
import { CriteriaValueCell } from "./CriteriaValueCell"

/** Match Stock Balance / Analytics spreadsheet chrome. */
const cellInputClass =
  "h-7 w-full min-w-0 rounded-none border border-transparent bg-transparent px-2 py-0 text-xs shadow-none outline-none ring-0 transition-none focus-visible:border-border focus-visible:bg-background focus-visible:ring-0 md:text-xs/relaxed placeholder:text-muted-foreground/70"

const cellClass =
  "overflow-hidden p-0 align-middle border-r border-b border-border/60 last:border-r-0"
const headClass =
  "h-7 overflow-hidden px-2 py-0 align-middle border-r border-b border-border/60 last:border-r-0 text-[11px] font-medium leading-none text-muted-foreground bg-muted/40"
const rowIndexClass =
  "bg-muted/40 text-[11px] tabular-nums text-muted-foreground"

const NO_COL_WIDTH = 32
const ACTIONS_COL_WIDTH = 32
/**
 * Layout breakpoints (viewport):
 * - phone  (< 40rem): Name+Value stacked
 * - otherwise: Name | Value (Description stays off)
 */
const PHONE_VIEWPORT_MAX_REM = 40
const DEFAULT_COL_WIDTHS = { name: 224, value: 320 } as const
const DEFAULT_COL_WIDTHS_TABLET = { name: 168, value: 220 } as const
const MIN_COL_WIDTHS = { name: 112, value: 128 } as const

type ResizableColKey = keyof typeof DEFAULT_COL_WIDTHS
type ColWidths = { name: number; value: number }
/** phone → stacked; otherwise → columns (description off) */
type CriteriaGridLayout = "stacked" | "columns" | "columns-with-description"

function rootFontSizePx(): number {
  return (
    Number.parseFloat(getComputedStyle(document.documentElement).fontSize) ||
    16
  )
}

function viewportPx(rem: number): number {
  return rem * rootFontSizePx()
}

function isPhoneViewport(): boolean {
  return window.matchMedia(`(max-width: ${viewportPx(PHONE_VIEWPORT_MAX_REM)}px)`)
    .matches
}

function resolveGridLayout(
  _tableWidth: number,
  _colWidths: ColWidths,
  _previous: CriteriaGridLayout
): CriteriaGridLayout {
  if (isPhoneViewport()) return "stacked"
  // Description column stays off — Name | Value only.
  return "columns"
}

const EDGE_COLS_TOTAL = NO_COL_WIDTH + ACTIONS_COL_WIDTH

/** Space available for Name + Value (No / Actions are fixed). */
function availableNameValueWidth(tableWidth: number): number {
  return Math.max(
    MIN_COL_WIDTHS.name + MIN_COL_WIDTHS.value,
    tableWidth - EDGE_COLS_TOTAL
  )
}

/**
 * Keep Name + Value exactly filling the flexible area so edge columns
 * never absorb leftover width. Prefer the requested Name width.
 */
function clampColWidths(widths: ColWidths, tableWidth: number): ColWidths {
  const available = availableNameValueWidth(tableWidth)
  const name = Math.min(
    Math.max(MIN_COL_WIDTHS.name, widths.name),
    available - MIN_COL_WIDTHS.value
  )
  return { name, value: available - name }
}

function widthsForLayout(
  layout: CriteriaGridLayout,
  tableWidth: number,
  previous: ColWidths
): ColWidths {
  if (layout === "stacked") return previous
  const preferred =
    layout === "columns" ? DEFAULT_COL_WIDTHS_TABLET : DEFAULT_COL_WIDTHS
  // Keep user-resized widths when still in a column layout; seed from preferred on first fit.
  const seed =
    previous.name === DEFAULT_COL_WIDTHS.name &&
    previous.value === DEFAULT_COL_WIDTHS.value &&
    layout === "columns"
      ? preferred
      : previous
  return clampColWidths(seed, tableWidth)
}

/** No / Actions — never share leftover width with resizable columns. */
const fixedEdgeColStyle = (width: number): React.CSSProperties => ({
  width,
  minWidth: width,
  maxWidth: width,
  boxSizing: "border-box",
})

const edgeCellClass = "box-border w-8 min-w-8 max-w-8"

const nameColStyle = (width: number): React.CSSProperties => ({
  width,
  minWidth: width,
  maxWidth: width,
  boxSizing: "border-box",
})

/** Value takes whatever remains after fixed edges + Name. */
const valueColStyle = (nameWidth: number): React.CSSProperties => ({
  width: `calc(100% - ${EDGE_COLS_TOTAL + nameWidth}px)`,
  boxSizing: "border-box",
})

function ColumnResizeHandle({
  column,
  onResize,
  onResizeEnd,
}: {
  column: ResizableColKey
  onResize: (column: ResizableColKey, deltaX: number) => void
  onResizeEnd?: () => void
}) {
  const startXRef = React.useRef(0)
  const [dragging, setDragging] = React.useState(false)

  return (
    <span
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize ${column} column`}
      aria-valuemin={MIN_COL_WIDTHS[column]}
      className={cn(
        "absolute inset-y-0 -right-1 z-10 w-2 cursor-col-resize touch-none select-none",
        "after:absolute after:inset-y-0 after:left-1/2 after:w-px after:-translate-x-1/2 after:bg-transparent",
        "hover:after:bg-primary/40 active:after:bg-primary/60",
        dragging && "after:bg-primary/60"
      )}
      onPointerDown={(event) => {
        event.preventDefault()
        event.stopPropagation()
        startXRef.current = event.clientX
        setDragging(true)
        const target = event.currentTarget
        target.setPointerCapture(event.pointerId)
        const previousCursor = document.body.style.cursor
        const previousUserSelect = document.body.style.userSelect
        document.body.style.cursor = "col-resize"
        document.body.style.userSelect = "none"

        const onMove = (moveEvent: PointerEvent) => {
          onResize(column, moveEvent.clientX - startXRef.current)
          startXRef.current = moveEvent.clientX
        }
        const onUp = (upEvent: PointerEvent) => {
          setDragging(false)
          document.body.style.cursor = previousCursor
          document.body.style.userSelect = previousUserSelect
          target.releasePointerCapture(upEvent.pointerId)
          target.removeEventListener("pointermove", onMove)
          target.removeEventListener("pointerup", onUp)
          target.removeEventListener("pointercancel", onUp)
          onResizeEnd?.()
        }
        target.addEventListener("pointermove", onMove)
        target.addEventListener("pointerup", onUp)
        target.addEventListener("pointercancel", onUp)
      }}
    />
  )
}

const EDITABLE_COL_COUNT = 2

const emptyRow = (): CriteriaFilterRow => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  selected: false,
  name: "",
  value: "",
})

function isBlankCriteriaRow(row: CriteriaFilterRow): boolean {
  return !row.name.trim() && !String(row.value ?? "").trim()
}

export type SchemaCriteriaFilterProps = {
  schema: JsonSchemaObject
  initialRows?: CriteriaFilterRow[]
  /**
   * Controlled rows. When set, the component renders these rows and reports
   * edits through `onRowsChange` instead of owning internal state.
   */
  rows?: CriteriaFilterRow[]
  onRowsChange?: (rows: CriteriaFilterRow[]) => void
  autoValidate?: boolean
  /** Show schema title/description header. Default true. */
  showHeader?: boolean
  /** Show Clear in the grid footer. Default true. */
  showFooterClear?: boolean
  onChange?: (
    rows: CriteriaFilterRow[],
    instance: Record<string, unknown>
  ) => void
  onValidate?: (result: CriteriaValidationResult) => void
  className?: string
}

export type SchemaCriteriaFilterHandle = {
  submit: () => CriteriaValidationResult
  clear: () => void
}

export const SchemaCriteriaFilter = React.forwardRef<
  SchemaCriteriaFilterHandle,
  SchemaCriteriaFilterProps
>(function SchemaCriteriaFilter(
  {
    schema,
    initialRows,
    autoValidate = false,
    showHeader = true,
    showFooterClear = true,
    onChange,
    onRowsChange,
    onValidate,
    className,
    rows: controlledRows,
  },
  ref
) {
  const parsed = React.useMemo(() => parseCriteriaSchema(schema), [schema])
  const [internalRows, setInternalRows] = React.useState<CriteriaFilterRow[]>(
    () => {
      if (initialRows) return initialRows
      return createInitialCriteriaRows(parseCriteriaSchema(schema).fields)
    }
  )
  const isControlled = controlledRows !== undefined
  const rows = isControlled ? controlledRows : internalRows
  const [editingIndex, setEditingIndex] = React.useState<number | null>(null)
  const [validation, setValidation] =
    React.useState<CriteriaValidationResult | null>(null)
  const hasValidatedRef = React.useRef(false)
  const rowsRef = React.useRef(rows)
  rowsRef.current = rows
  const tableRef = React.useRef<HTMLDivElement>(null)
  const [colWidths, setColWidths] = React.useState<ColWidths>(DEFAULT_COL_WIDTHS)
  const [layout, setLayout] = React.useState<CriteriaGridLayout>("columns")

  const descriptionColumnVisible = layout === "columns-with-description"
  const stackedLayout = layout === "stacked"
  const layoutRef = React.useRef(layout)
  layoutRef.current = layout
  const colWidthsRef = React.useRef(colWidths)
  colWidthsRef.current = colWidths

  React.useEffect(() => {
    const el = tableRef.current
    if (!el) return

    const update = () => {
      const tableWidth = el.clientWidth
      const widths = colWidthsRef.current
      const nextLayout = resolveGridLayout(
        tableWidth,
        widths,
        layoutRef.current
      )
      setLayout(nextLayout)
      setColWidths((prev) => widthsForLayout(nextLayout, tableWidth, prev))
    }

    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    const phoneMedia = window.matchMedia(
      `(max-width: ${viewportPx(PHONE_VIEWPORT_MAX_REM)}px)`
    )
    phoneMedia.addEventListener("change", update)
    return () => {
      observer.disconnect()
      phoneMedia.removeEventListener("change", update)
    }
  }, [])

  const resizeColumn = React.useCallback(
    (column: ResizableColKey, deltaX: number) => {
      if (deltaX === 0) return

      const tableWidth = tableRef.current?.clientWidth ?? 0
      if (tableWidth <= 0) return
      if (resolveGridLayout(tableWidth, colWidthsRef.current, layoutRef.current) ===
        "stacked") {
        return
      }

      const available = availableNameValueWidth(tableWidth)
      const prev = colWidthsRef.current
      let nextName = prev.name

      if (column === "name") {
        nextName = prev.name + deltaX
      } else {
        // Growing Value shrinks Name (Value is the remainder column).
        nextName = prev.name - deltaX
      }

      nextName = Math.min(
        Math.max(MIN_COL_WIDTHS.name, nextName),
        available - MIN_COL_WIDTHS.value
      )
      setColWidths({ name: nextName, value: available - nextName })
    },
    []
  )

  const nameOptions = React.useMemo<CriteriaComboboxOption[]>(
    () =>
      parsed.fields.map((field) => ({
        value: field.key,
        label: field.required ? `${field.title} *` : field.title,
      })),
    [parsed.fields]
  )

  const usedNames = React.useMemo(() => {
    const names = new Set<string>()
    for (const row of rows) {
      const name = row.name.trim()
      if (name) names.add(name)
    }
    return names
  }, [rows])

  const nameOptionsForRow = React.useCallback(
    (rowName: string) => {
      const current = rowName.trim()
      return nameOptions.filter(
        (option) => option.value === current || !usedNames.has(option.value)
      )
    },
    [nameOptions, usedNames]
  )

  const fieldMap = React.useMemo(
    () => new Map(parsed.fields.map((field) => [field.key, field])),
    [parsed.fields]
  )

  const invalidFields = React.useMemo(() => {
    const keys = new Set<string>()
    for (const error of validation?.errors ?? []) {
      if (error.fieldKey) keys.add(error.fieldKey)
    }
    return keys
  }, [validation])

  const patternInvalidByRowId = React.useMemo(() => {
    const map = new Map<string, string>()
    for (const row of rows) {
      const field = fieldMap.get(row.name)
      const result = validateCellPatterns(field, row.value)
      if (!result.valid && result.message) {
        map.set(row.id, result.message)
      }
    }
    return map
  }, [rows, fieldMap])

  const editingRow =
    editingIndex === null ? null : (rows[editingIndex] ?? null)
  const dialogOpen = editingIndex !== null && editingRow !== null

  const runValidate = React.useCallback(
    (nextRows: CriteriaFilterRow[]) => {
      hasValidatedRef.current = true
      const result = validateCriteria(schema, nextRows, parsed.fields)

      const patternErrors = nextRows.flatMap((row) => {
        const field = fieldMap.get(row.name)
        const cell = validateCellPatterns(field, row.value)
        if (cell.valid || !field) return []
        return [
          {
            fieldKey: field.key,
            message: cell.message ?? `${field.title}: pattern mismatch`,
            keyword: "pattern",
          },
        ]
      })

      const merged = {
        ...result,
        valid: result.valid && patternErrors.length === 0,
        errors: [...result.errors, ...patternErrors],
      }
      setValidation(merged)
      onValidate?.(merged)
      return merged
    },
    [schema, parsed.fields, onValidate, fieldMap]
  )

  const emitChange = React.useCallback(
    (nextRows: CriteriaFilterRow[]) => {
      const instance = rowsToCriteriaInstance(nextRows, parsed.fields)
      onChange?.(nextRows, instance)
    },
    [onChange, parsed.fields]
  )

  const setRowsAndNotify = React.useCallback(
    (updater: (prev: CriteriaFilterRow[]) => CriteriaFilterRow[]) => {
      const next = updater(isControlled ? controlledRows : internalRows)
      emitChange(next)
      if (isControlled) {
        onRowsChange?.(next)
      } else {
        setInternalRows(next)
      }
    },
    [emitChange, onRowsChange, isControlled, controlledRows, internalRows]
  )

  React.useEffect(() => {
    if (!autoValidate || !hasValidatedRef.current) return
    const timer = window.setTimeout(() => {
      runValidate(rows)
    }, 300)
    return () => window.clearTimeout(timer)
  }, [rows, autoValidate, runValidate])

  const focusGridCell = React.useCallback((row: number, col: number) => {
    const cell = tableRef.current?.querySelector<HTMLElement>(
      `[data-grid-cell="${row}-${col}"]`
    )
    cell?.focus()
  }, [])

  const pendingFocusRef = React.useRef<{ row: number; col: number } | null>(
    null
  )

  React.useLayoutEffect(() => {
    const pending = pendingFocusRef.current
    if (!pending) return
    pendingFocusRef.current = null
    focusGridCell(pending.row, pending.col)
  }, [rows, focusGridCell])

  const handleGridKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab") return

    const target = event.target as HTMLElement | null
    const cell = target?.closest<HTMLElement>("[data-grid-cell]")
    if (!cell) return

    const [rowText, colText] = (cell.dataset.gridCell ?? "").split("-")
    const row = Number(rowText)
    const col = Number(colText)
    if (Number.isNaN(row) || Number.isNaN(col)) return

    let nextRow = row
    let nextCol = col + (event.shiftKey ? -1 : 1)

    if (nextCol >= EDITABLE_COL_COUNT) {
      nextRow += 1
      nextCol = 0
    } else if (nextCol < 0) {
      nextRow -= 1
      nextCol = EDITABLE_COL_COUNT - 1
    }

    if (nextRow < 0 || nextRow >= rows.length) return

    event.preventDefault()
    focusGridCell(nextRow, nextCol)
  }

  const updateRow = (id: string, patch: Partial<CriteriaFilterRow>) => {
    setRowsAndNotify((prev) =>
      prev.map((row) => {
        if (row.id !== id) return row
        const next = { ...row, ...patch }
        if (patch.name !== undefined && patch.name !== row.name) {
          next.value = ""
        }
        return next
      })
    )
  }

  const addRow = (atIndex?: number, options?: { focusName?: boolean }) => {
    const existingBlankIndex = rows.findIndex(isBlankCriteriaRow)
    if (existingBlankIndex >= 0) {
      if (options?.focusName !== false) {
        focusGridCell(existingBlankIndex, 0)
      }
      return rows[existingBlankIndex]!
    }

    const row = emptyRow()
    const focusIndex = atIndex ?? rows.length
    setRowsAndNotify((prev) => {
      if (atIndex === undefined) return [...prev, row]
      const next = [...prev]
      next.splice(atIndex, 0, row)
      return next
    })
    if (options?.focusName !== false) {
      pendingFocusRef.current = { row: focusIndex, col: 0 }
    }
    return row
  }

  const resetToDefault = React.useCallback(() => {
    setEditingIndex(null)
    setValidation(null)
    hasValidatedRef.current = false
    setRowsAndNotify(() => createInitialCriteriaRows(parsed.fields))
  }, [setRowsAndNotify, parsed.fields])

  React.useImperativeHandle(
    ref,
    () => ({
      submit: () => runValidate(rowsRef.current),
      clear: resetToDefault,
    }),
    [runValidate, resetToDefault]
  )

  const insertBelow = () => {
    if (editingIndex === null) return
    addRow(editingIndex + 1, { focusName: false })
    setEditingIndex(editingIndex + 1)
  }

  const insertAbove = () => {
    if (editingIndex === null) return
    addRow(editingIndex, { focusName: false })
    setEditingIndex(editingIndex + 1)
  }

  const duplicateRow = () => {
    if (editingIndex === null || !editingRow) return
    const copy: CriteriaFilterRow = {
      ...editingRow,
      id: emptyRow().id,
      selected: false,
    }
    setRowsAndNotify((prev) => {
      const next = [...prev]
      next.splice(editingIndex + 1, 0, copy)
      return next
    })
    setEditingIndex(editingIndex + 1)
  }

  const deleteRow = () => {
    if (editingIndex === null || !editingRow) return
    setRowsAndNotify((prev) =>
      prev.filter((row) => row.id !== editingRow.id)
    )
    setEditingIndex(null)
  }

  const moveRow = (direction: "up" | "down") => {
    if (editingIndex === null) return
    const target = direction === "up" ? editingIndex - 1 : editingIndex + 1
    if (target < 0 || target >= rows.length) return
    setRowsAndNotify((prev) => {
      const next = [...prev]
      const [item] = next.splice(editingIndex, 1)
      next.splice(target, 0, item)
      return next
    })
    setEditingIndex(target)
  }

  const moveRowRef = React.useRef(moveRow)
  moveRowRef.current = moveRow

  React.useEffect(() => {
    if (!dialogOpen) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setEditingIndex(null)
        return
      }
      if (event.ctrlKey && event.key === "ArrowUp") {
        event.preventDefault()
        moveRowRef.current("up")
      }
      if (event.ctrlKey && event.key === "ArrowDown") {
        event.preventDefault()
        moveRowRef.current("down")
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [dialogOpen])

  return (
    <div
      className={cn(
        "flex min-h-0 min-w-0 w-full flex-col",
        showHeader
          ? "h-full space-y-3 overflow-auto p-3 sm:space-y-4 sm:p-4 md:p-6"
          : "h-full overflow-auto",
        className
      )}
    >
      {showHeader ? (
        <div className="space-y-1">
          <h3 className="text-sm font-semibold leading-none tracking-tight text-primary dark:text-sidebar-primary">
            {parsed.title}
          </h3>
          {parsed.description ? (
            <p className="text-xs text-muted-foreground">{parsed.description}</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Define name / value filter rows from the report schema.
            </p>
          )}
          {validation &&
          !validation.valid &&
          validation.errors.length > 0 ? (
            <p className="truncate text-xs text-destructive">
              {validation.errors[0]?.message}
              {validation.errors.length > 1
                ? ` (+${validation.errors.length - 1})`
                : null}
            </p>
          ) : null}
        </div>
      ) : null}

      <div
        ref={tableRef}
        className={cn(
          "flex w-full flex-col bg-card",
          showHeader ? "overflow-hidden rounded-md border shadow-none" : "rounded-none"
        )}
        onKeyDownCapture={handleGridKeyDown}
      >
        <Table className="w-full table-fixed border-separate border-spacing-0 text-xs">
          <colgroup>
            <col style={fixedEdgeColStyle(NO_COL_WIDTH)} />
            {stackedLayout ? (
              <col
                style={{
                  width: `calc(100% - ${EDGE_COLS_TOTAL}px)`,
                  boxSizing: "border-box",
                }}
              />
            ) : (
              <>
                <col style={nameColStyle(colWidths.name)} />
                <col style={valueColStyle(colWidths.name)} />
                {descriptionColumnVisible ? <col /> : null}
              </>
            )}
            <col style={fixedEdgeColStyle(ACTIONS_COL_WIDTH)} />
          </colgroup>
          <TableHeader className="sticky top-0 z-10 [&_tr]:border-0">
            <TableRow className="hover:bg-transparent border-0">
              <TableHead
                className={cn(
                  headClass,
                  rowIndexClass,
                  edgeCellClass,
                  "text-center px-0"
                )}
                style={fixedEdgeColStyle(NO_COL_WIDTH)}
              >
                <div className="flex h-full items-center justify-center">#</div>
              </TableHead>
              {stackedLayout ? (
                <TableHead className={headClass}>
                  <span className="block truncate">Name / Value</span>
                </TableHead>
              ) : (
                <>
                  <TableHead className={cn(headClass, "relative")}>
                    <span className="block truncate">Name</span>
                    <ColumnResizeHandle
                      column="name"
                      onResize={resizeColumn}
                    />
                  </TableHead>
                  <TableHead className={cn(headClass, "relative min-w-0")}>
                    <span className="block truncate">Value</span>
                    <ColumnResizeHandle
                      column="value"
                      onResize={resizeColumn}
                    />
                  </TableHead>
                  {descriptionColumnVisible ? (
                    <TableHead className={headClass}>
                      <span className="block truncate">Description</span>
                    </TableHead>
                  ) : null}
                </>
              )}
              <TableHead
                className={cn(
                  headClass,
                  rowIndexClass,
                  edgeCellClass,
                  "text-center px-0"
                )}
                style={fixedEdgeColStyle(ACTIONS_COL_WIDTH)}
              >
                <div className="flex h-full items-center justify-center">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    tabIndex={-1}
                    className="size-6"
                    aria-label="Reset to default"
                    onClick={resetToDefault}
                  >
                    <RotateCcw className="size-3.5 text-muted-foreground" />
                  </Button>
                </div>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="[&_tr:last-child]:border-0">
            {rows.map((row, index) => {
              const field = fieldMap.get(row.name)
              const patternMessage = patternInvalidByRowId.get(row.id)
              const rowInvalid = Boolean(
                (row.name && invalidFields.has(row.name)) || patternMessage
              )
              const description = field?.description?.trim() || ""
              return (
                <TableRow
                  key={row.id}
                  className="border-0 hover:bg-muted/30"
                >
                  <TableCell
                    className={cn(
                      cellClass,
                      rowIndexClass,
                      edgeCellClass,
                      "text-center",
                      stackedLayout && "align-middle"
                    )}
                    style={fixedEdgeColStyle(NO_COL_WIDTH)}
                  >
                    <button
                      type="button"
                      tabIndex={-1}
                      className={cn(
                        "flex w-full items-center justify-center font-medium",
                        stackedLayout ? "min-h-[4.5rem]" : "h-7"
                      )}
                      onClick={() => setEditingIndex(index)}
                    >
                      {index + 1}
                    </button>
                  </TableCell>
                  {stackedLayout ? (
                    <TableCell className={cellClass}>
                      <div className="flex min-w-0 flex-col divide-y divide-border/60">
                        <CriteriaSimpleCombobox
                          value={row.name}
                          onChange={(value) =>
                            updateRow(row.id, { name: value })
                          }
                          options={nameOptionsForRow(row.name)}
                          placeholder="Name"
                          data-grid-cell={`${index}-0`}
                          className={cn(
                            cellInputClass,
                            row.name && "font-medium"
                          )}
                          variant="cell"
                          showClear={false}
                        />
                        <CriteriaValueCell
                          field={field}
                          value={row.value}
                          onChange={(value) =>
                            updateRow(row.id, { value })
                          }
                          data-grid-cell={`${index}-1`}
                          invalid={rowInvalid}
                          descriptionAsPlaceholder
                        />
                      </div>
                    </TableCell>
                  ) : (
                    <>
                      <TableCell className={cellClass}>
                        <CriteriaSimpleCombobox
                          value={row.name}
                          onChange={(value) =>
                            updateRow(row.id, { name: value })
                          }
                          options={nameOptionsForRow(row.name)}
                          placeholder="Name"
                          data-grid-cell={`${index}-0`}
                          className={cn(
                            cellInputClass,
                            row.name && "font-medium"
                          )}
                          variant="cell"
                          showClear={false}
                        />
                      </TableCell>
                      <TableCell className={cellClass}>
                        <CriteriaValueCell
                          field={field}
                          value={row.value}
                          onChange={(value) =>
                            updateRow(row.id, { value })
                          }
                          data-grid-cell={`${index}-1`}
                          invalid={rowInvalid}
                          descriptionAsPlaceholder={
                            !descriptionColumnVisible
                          }
                        />
                      </TableCell>
                      {descriptionColumnVisible ? (
                        <TableCell className={cellClass}>
                          <div
                            className="flex h-7 min-w-0 items-center truncate px-2 text-xs text-muted-foreground"
                            title={description || undefined}
                          >
                            {description || null}
                          </div>
                        </TableCell>
                      ) : null}
                    </>
                  )}
                  <TableCell
                    className={cn(
                      cellClass,
                      rowIndexClass,
                      edgeCellClass,
                      stackedLayout && "align-middle"
                    )}
                    style={fixedEdgeColStyle(ACTIONS_COL_WIDTH)}
                  >
                    <div
                      className={cn(
                        "flex items-center justify-center",
                        stackedLayout ? "min-h-[4.5rem]" : "h-7"
                      )}
                    >
                      <Button
                        variant="ghost"
                        size="icon"
                        tabIndex={-1}
                        className="size-6"
                        onClick={() => setEditingIndex(index)}
                      >
                        <Pencil className="size-3.5 text-muted-foreground" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>

        <div className="flex shrink-0 items-center gap-1 border-t border-border/60 bg-muted/10 px-2 py-1.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-muted-foreground"
            onClick={() => addRow()}
          >
            <Plus className="size-3.5 mr-1" />
            Add Row
          </Button>
          {showFooterClear ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-muted-foreground"
              onClick={resetToDefault}
            >
              <RotateCcw className="size-3.5 mr-1" />
              Clear
            </Button>
          ) : null}
        </div>
      </div>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) setEditingIndex(null)
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="sm:max-w-xl gap-0 p-0 overflow-hidden"
        >
          {editingRow && editingIndex !== null ? (
            <>
              <DialogHeader className="flex flex-row items-center justify-between gap-3 space-y-0 border-b px-4 py-3">
                <DialogTitle className="text-sm font-semibold">
                  Editing Row #{editingIndex + 1}
                </DialogTitle>
                <div className="flex items-center gap-1.5">
                  <Button
                    type="button"
                    size="icon"
                    className="size-7 bg-red-600 text-white hover:bg-red-600/90"
                    onClick={deleteRow}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={insertBelow}
                  >
                    Insert Below
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={insertAbove}
                  >
                    Insert Above
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={duplicateRow}
                  >
                    <Copy className="size-3" />
                    Duplicate
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="h-7 text-xs gap-1"
                      >
                        Move
                        <ChevronDown className="size-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => moveRow("up")}>
                        Move Up
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => moveRow("down")}>
                        Move Down
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </DialogHeader>

              <div className="space-y-4 px-4 py-4">
                <Field>
                  <FieldLabel className="text-xs text-muted-foreground">
                    Name
                  </FieldLabel>
                  <CriteriaSimpleCombobox
                    value={editingRow.name}
                    onChange={(value) =>
                      updateRow(editingRow.id, { name: value })
                    }
                    options={nameOptionsForRow(editingRow.name)}
                    placeholder="Name"
                    className="h-9 text-xs bg-muted/30"
                    variant="form"
                    showClear={false}
                  />
                </Field>
                <Field>
                  <FieldLabel className="text-xs text-muted-foreground">
                    Value
                  </FieldLabel>
                  <CriteriaValueCell
                    field={fieldMap.get(editingRow.name)}
                    value={editingRow.value}
                    onChange={(value) =>
                      updateRow(editingRow.id, { value })
                    }
                    variant="form"
                    invalid={Boolean(
                      (editingRow.name &&
                        invalidFields.has(editingRow.name)) ||
                        patternInvalidByRowId.has(editingRow.id)
                    )}
                  />
                </Field>
              </div>

              <DialogFooter className="flex-row items-center justify-between gap-3 border-t px-4 py-3 sm:justify-between">
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <Keyboard className="size-3.5" />
                  <span>Shortcuts:</span>
                  <KbdGroup>
                    <Kbd>Ctrl + Up</Kbd>
                    <Kbd>Ctrl + Down</Kbd>
                    <Kbd>ESC</Kbd>
                  </KbdGroup>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={insertBelow}
                >
                  Insert Below
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
})
