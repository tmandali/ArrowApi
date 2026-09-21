"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Pencil, Plus, Settings2 } from "lucide-react";
import { cn } from "@/utils/cn";
import { useTranslations } from "next-intl";
import { GridCellCombobox } from "./GridCellCombobox";
import {
  cellInputClass,
  cellClass,
  headClass,
  itemTaxTemplateOptions,
  taxCategoryOptions,
} from "./item-tax-types";
import { useItemTaxRows } from "./use-item-tax-rows";
import { ItemTaxDialog } from "./item-tax-dialog";

export function ItemTaxTab() {
  const t = useTranslations("Stock");
  const {
    rows,
    setRows,
    editingIndex,
    setEditingIndex,
    editingRow,
    dialogOpen,
    allSelected,
    tableRef,
    handleGridKeyDown,
    updateRow,
    addRow,
    insertBelow,
    insertAbove,
    duplicateRow,
    deleteRow,
    moveRow,
  } = useItemTaxRows();

  return (
    <div className="space-y-4 p-6">
      <div>
        <h3 className="text-sm font-semibold">{t("tax_title")}</h3>
        <p className="text-xs text-muted-foreground">
          {t("tax_applies_variants")}
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
              <TableHead className={cn(headClass, "w-12")}>{t("tax_no")}</TableHead>
              <TableHead className={headClass}>
                {t("tax_col_template")} <span className="text-red-500">*</span>
              </TableHead>
              <TableHead className={headClass}>{t("tax_category")}</TableHead>
              <TableHead className={headClass}>{t("tax_valid_from")}</TableHead>
              <TableHead className={cn(headClass, "text-right")}>
                {t("tax_col_min_rate")}
              </TableHead>
              <TableHead className={cn(headClass, "text-right")}>
                {t("tax_col_max_rate")}
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
                    placeholder={t("tax_category")}
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
                    placeholder={t("tax_valid_from")}
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
                    placeholder={t("tax_col_min_rate")}
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
                    placeholder={t("tax_col_max_rate")}
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
            {t("tax_add_row")}
          </Button>
        </div>
      </div>

      <ItemTaxDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) setEditingIndex(null);
        }}
        editingRow={editingRow}
        editingIndex={editingIndex}
        updateRow={updateRow}
        deleteRow={deleteRow}
        insertBelow={insertBelow}
        insertAbove={insertAbove}
        duplicateRow={duplicateRow}
        moveRow={moveRow}
      />
    </div>
  );
}
