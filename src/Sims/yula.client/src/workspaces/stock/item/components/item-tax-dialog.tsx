import * as React from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ChevronDown,
  Copy,
  Keyboard,
  Trash2,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { GridCellCombobox } from "./GridCellCombobox";
import {
  type TaxRow,
  itemTaxTemplateOptions,
  taxCategoryOptions,
} from "./item-tax-types";

export interface ItemTaxDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingRow: TaxRow | null;
  editingIndex: number | null;
  updateRow: (id: string, patch: Partial<TaxRow>) => void;
  deleteRow: () => void;
  insertBelow: () => void;
  insertAbove: () => void;
  duplicateRow: () => void;
  moveRow: (direction: "up" | "down") => void;
}

export function ItemTaxDialog({
  open,
  onOpenChange,
  editingRow,
  editingIndex,
  updateRow,
  deleteRow,
  insertBelow,
  insertAbove,
  duplicateRow,
  moveRow,
}: ItemTaxDialogProps) {
  const t = useTranslations("Stock");

  if (!editingRow || editingIndex === null) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-xl gap-0 p-0 overflow-hidden"
      >
        <DialogHeader className="flex flex-row items-center justify-between gap-3 space-y-0 border-b px-4 py-3">
          <DialogTitle className="text-sm font-semibold">
            {t("tax_editing_row", { row: editingIndex + 1 })}
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
              {t("tax_insert_below")}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-7 text-xs"
              onClick={insertAbove}
            >
              {t("tax_insert_above")}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={duplicateRow}
            >
              <Copy className="size-3" />
              {t("btn_duplicate")}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-7 text-xs gap-1"
                >
                  {t("tax_move")}
                  <ChevronDown className="size-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => moveRow("up")}>
                  {t("tax_move_up")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => moveRow("down")}>
                  {t("tax_move_down")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </DialogHeader>

        <div className="space-y-4 px-4 py-4">
          <Field>
            <FieldLabel className="text-xs text-muted-foreground">
              {t("tax_col_template")} <span className="text-red-500">*</span>
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
              {t("tax_category")}
            </FieldLabel>
            <GridCellCombobox
              value={editingRow.taxCategory}
              onChange={(value) =>
                updateRow(editingRow.id, { taxCategory: value })
              }
              options={taxCategoryOptions}
              placeholder={t("tax_category")}
              className="h-9 text-xs bg-muted/30"
            />
          </Field>
          <Field>
            <FieldLabel className="text-xs text-muted-foreground">
              {t("tax_valid_from")}
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
              {t("tax_col_min_rate")}
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
              {t("tax_col_max_rate")}
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
            <span>{t("tax_shortcuts")}</span>
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
            {t("tax_insert_below")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
