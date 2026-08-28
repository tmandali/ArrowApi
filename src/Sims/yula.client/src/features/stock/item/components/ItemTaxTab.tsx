"use client";

import * as React from "react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
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
  Settings2,
  Trash2,
} from "lucide-react"
import { cn } from "@/utils/cn"
import { GridCellCombobox } from "./GridCellCombobox"

const cellInputClass =
  "h-9 w-full min-w-0 rounded-none border border-transparent bg-transparent px-2 py-0 text-xs shadow-none outline-none ring-0 transition-none focus-visible:border-border focus-visible:bg-background focus-visible:ring-0 md:text-xs/relaxed placeholder:text-muted-foreground/70"

const cellClass = "p-0 border-r border-border/60 last:border-r-0"
const headClass =
  "h-9 px-2 border-r border-border/60 last:border-r-0 text-[11px] font-medium text-muted-foreground bg-muted/30"

const itemTaxTemplateOptions = [
  "UAE Excise 100% - NGH",
  "UAE VAT 5%",
  "UAE Zero Rated",
  "UAE Exempt",
]

const taxCategoryOptions = [
  "In-State",
  "Out-State",
  "Registered Composition",
  "Reverse Charge In-State",
  "Reverse Charge Out State",
]

type TaxRow = {
  id: string
  selected: boolean
  itemTaxTemplate: string
  taxCategory: string
  validFrom: string
  minimumNetRate: string
  maximumNetRate: string
}

const emptyRow = (): TaxRow => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  selected: false,
  itemTaxTemplate: "",
  taxCategory: "",
  validFrom: "",
  minimumNetRate: "0.000",
  maximumNetRate: "0.000",
})

const initialRows: TaxRow[] = [
  {
    id: "1",
    selected: false,
    itemTaxTemplate: "UAE Excise 100% - NGH",
    taxCategory: "",
    validFrom: "",
    minimumNetRate: "",
    maximumNetRate: "",
  },
  {
    id: "2",
    selected: false,
    itemTaxTemplate: "UAE Excise 100% - NGH",
    taxCategory: "",
    validFrom: "",
    minimumNetRate: "0.000",
    maximumNetRate: "0.000",
  },
  {
    id: "3",
    selected: false,
    itemTaxTemplate: "UAE Excise 100% - NGH",
    taxCategory: "",
    validFrom: "",
    minimumNetRate: "0.000",
    maximumNetRate: "0.000",
  },
  {
    id: "4",
    selected: false,
    itemTaxTemplate: "",
    taxCategory: "",
    validFrom: "",
    minimumNetRate: "0.000",
    maximumNetRate: "0.000",
  },
]

const EDITABLE_COL_COUNT = 5

export function ItemTaxTab() {
  const [rows, setRows] = React.useState<TaxRow[]>(initialRows)
  const [editingIndex, setEditingIndex] = React.useState<number | null>(null)
  const tableRef = React.useRef<HTMLDivElement>(null)

  const editingRow =
    editingIndex === null ? null : (rows[editingIndex] ?? null)
  const dialogOpen = editingIndex !== null && editingRow !== null

  const focusGridCell = React.useCallback((row: number, col: number) => {
    const cell = tableRef.current?.querySelector<HTMLElement>(
      `[data-grid-cell="${row}-${col}"]`
    )
    cell?.focus()
  }, [])

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

  const updateRow = (id: string, patch: Partial<TaxRow>) => {
    setRows((prev) =>
      prev.map((row) => (row.id === id ? { ...row, ...patch } : row))
    )
  }

  const addRow = (atIndex?: number) => {
    const row = emptyRow()
    setRows((prev) => {
      if (atIndex === undefined) {
        return [...prev, row]
      }
      const next = [...prev]
      next.splice(atIndex, 0, row)
      return next
    })
    return row
  }

  const insertBelow = () => {
    if (editingIndex === null) return
    const row = addRow(editingIndex + 1)
    setEditingIndex(editingIndex + 1)
    void row
  }

  const insertAbove = () => {
    if (editingIndex === null) return
    addRow(editingIndex)
    setEditingIndex(editingIndex + 1)
  }

  const duplicateRow = () => {
    if (editingIndex === null || !editingRow) return
    const copy: TaxRow = {
      ...editingRow,
      id: emptyRow().id,
      selected: false,
    }
    setRows((prev) => {
      const next = [...prev]
      next.splice(editingIndex + 1, 0, copy)
      return next
    })
    setEditingIndex(editingIndex + 1)
  }

  const deleteRow = () => {
    if (editingIndex === null || !editingRow) return
    setRows((prev) => prev.filter((row) => row.id !== editingRow.id))
    setEditingIndex(null)
  }

  const moveRow = (direction: "up" | "down") => {
    if (editingIndex === null) return
    const target = direction === "up" ? editingIndex - 1 : editingIndex + 1
    if (target < 0 || target >= rows.length) return
    setRows((prev) => {
      const next = [...prev]
      const [item] = next.splice(editingIndex, 1)
      next.splice(target, 0, item)
      return next
    })
    setEditingIndex(target)
  }

  const moveRowRef = React.useRef(moveRow)
  moveRowRef.current = moveRow

  const allSelected = rows.length > 0 && rows.every((row) => row.selected)

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
    <div className="space-y-4 p-6">
      <div>
        <h3 className="text-sm font-semibold">Taxes</h3>
        <p className="text-xs text-muted-foreground">
          Will also apply for variants.
        </p>
      </div>

      <div
        ref={tableRef}
        className="rounded-md border bg-card overflow-hidden"
        onKeyDownCapture={handleGridKeyDown}
      >
        <Table className="border-separate border-spacing-0">
          <TableHeader>
            <TableRow className="hover:bg-transparent border-b">
              <TableHead className={cn(headClass, "w-10 text-center px-0")}>
                <div className="flex h-9 items-center justify-center">
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={(checked) =>
                      setRows((prev) =>
                        prev.map((row) => ({ ...row, selected: !!checked }))
                      )
                    }
                  />
                </div>
              </TableHead>
              <TableHead className={cn(headClass, "w-12")}>No.</TableHead>
              <TableHead className={headClass}>
                Item Tax Template <span className="text-red-500">*</span>
              </TableHead>
              <TableHead className={headClass}>Tax Category</TableHead>
              <TableHead className={headClass}>Valid From</TableHead>
              <TableHead className={cn(headClass, "text-right")}>
                Minimum Net Rate
              </TableHead>
              <TableHead className={cn(headClass, "text-right")}>
                Maximum Net Rate
              </TableHead>
              <TableHead className={cn(headClass, "w-10 text-center px-0")}>
                <div className="flex h-9 items-center justify-center">
                  <Settings2 className="size-3.5 text-muted-foreground" />
                </div>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, index) => (
              <TableRow key={row.id} className="hover:bg-transparent">
                <TableCell className={cn(cellClass, "text-center")}>
                  <div className="flex h-9 items-center justify-center">
                    <Checkbox
                      checked={row.selected}
                      tabIndex={-1}
                      onCheckedChange={(checked) =>
                        updateRow(row.id, { selected: !!checked })
                      }
                    />
                  </div>
                </TableCell>
                <TableCell className={cellClass}>
                  <button
                    type="button"
                    tabIndex={-1}
                    className="flex h-9 w-full items-center px-2 font-medium text-foreground"
                    onClick={() => setEditingIndex(index)}
                  >
                    {index + 1}
                  </button>
                </TableCell>
                <TableCell className={cellClass}>
                  <GridCellCombobox
                    value={row.itemTaxTemplate}
                    onChange={(value) =>
                      updateRow(row.id, { itemTaxTemplate: value })
                    }
                    options={itemTaxTemplateOptions}
                    placeholder="Item Tax Template"
                    data-grid-cell={`${index}-0`}
                    className={cn(
                      cellInputClass,
                      row.itemTaxTemplate && "font-medium"
                    )}
                  />
                </TableCell>
                <TableCell className={cellClass}>
                  <GridCellCombobox
                    value={row.taxCategory}
                    onChange={(value) =>
                      updateRow(row.id, { taxCategory: value })
                    }
                    options={taxCategoryOptions}
                    placeholder="Tax Category"
                    data-grid-cell={`${index}-1`}
                    className={cellInputClass}
                  />
                </TableCell>
                <TableCell className={cellClass}>
                  <Input
                    value={row.validFrom}
                    data-grid-cell={`${index}-2`}
                    onChange={(event) =>
                      updateRow(row.id, { validFrom: event.target.value })
                    }
                    placeholder="Valid From"
                    className={cellInputClass}
                  />
                </TableCell>
                <TableCell className={cellClass}>
                  <Input
                    value={row.minimumNetRate}
                    data-grid-cell={`${index}-3`}
                    onChange={(event) =>
                      updateRow(row.id, {
                        minimumNetRate: event.target.value,
                      })
                    }
                    placeholder="Minimum Net Rate"
                    className={cn(cellInputClass, "text-right")}
                  />
                </TableCell>
                <TableCell className={cellClass}>
                  <Input
                    value={row.maximumNetRate}
                    data-grid-cell={`${index}-4`}
                    onChange={(event) =>
                      updateRow(row.id, {
                        maximumNetRate: event.target.value,
                      })
                    }
                    placeholder="Maximum Net Rate"
                    className={cn(cellInputClass, "text-right")}
                  />
                </TableCell>
                <TableCell className={cellClass}>
                  <div className="flex h-9 items-center justify-center">
                    <Button
                      variant="ghost"
                      size="icon"
                      tabIndex={-1}
                      className="size-7"
                      onClick={() => setEditingIndex(index)}
                    >
                      <Pencil className="size-3.5 text-muted-foreground" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <div className="border-t bg-muted/10 p-2">
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
                    Item Tax Template <span className="text-red-500">*</span>
                  </FieldLabel>
                  <GridCellCombobox
                    value={editingRow.itemTaxTemplate}
                    onChange={(value) =>
                      updateRow(editingRow.id, { itemTaxTemplate: value })
                    }
                    options={itemTaxTemplateOptions}
                    placeholder="Item Tax Template"
                    className="h-9 text-xs bg-muted/30"
                  />
                </Field>
                <Field>
                  <FieldLabel className="text-xs text-muted-foreground">
                    Tax Category
                  </FieldLabel>
                  <GridCellCombobox
                    value={editingRow.taxCategory}
                    onChange={(value) =>
                      updateRow(editingRow.id, { taxCategory: value })
                    }
                    options={taxCategoryOptions}
                    placeholder="Tax Category"
                    className="h-9 text-xs bg-muted/30"
                  />
                </Field>
                <Field>
                  <FieldLabel className="text-xs text-muted-foreground">
                    Valid From
                  </FieldLabel>
                  <Input
                    value={editingRow.validFrom}
                    onChange={(event) =>
                      updateRow(editingRow.id, {
                        validFrom: event.target.value,
                      })
                    }
                    className="h-9 text-xs bg-muted/30"
                  />
                </Field>
                <Field>
                  <FieldLabel className="text-xs text-muted-foreground">
                    Minimum Net Rate
                  </FieldLabel>
                  <Input
                    value={editingRow.minimumNetRate}
                    onChange={(event) =>
                      updateRow(editingRow.id, {
                        minimumNetRate: event.target.value,
                      })
                    }
                    className="h-9 text-xs bg-muted/30"
                  />
                </Field>
                <Field>
                  <FieldLabel className="text-xs text-muted-foreground">
                    Maximum Net Rate
                  </FieldLabel>
                  <Input
                    value={editingRow.maximumNetRate}
                    onChange={(event) =>
                      updateRow(editingRow.id, {
                        maximumNetRate: event.target.value,
                      })
                    }
                    className="h-9 text-xs bg-muted/30"
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
}
