"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
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
import { ChevronDown, Copy, Keyboard, Trash2 } from "lucide-react";
import { CriteriaSimpleCombobox } from "../CriteriaSimpleCombobox";
import { CriteriaValueCell } from "../CriteriaValueCell";
import type { CriteriaRowsApi } from "./use-criteria-rows";

/** Satır düzenleme diyaloğu: taşı/kopyala/ekle/sil + klavye kısayolları. */
export function RowEditDialog({
  grid,
  onClose,
}: {
  grid: Pick<
    CriteriaRowsApi,
    | "editingRow"
    | "editingIndex"
    | "dialogOpen"
    | "fieldMap"
    | "invalidFields"
    | "patternInvalidByRowId"
    | "nameOptionsForRow"
    | "updateRow"
    | "insertBelow"
    | "insertAbove"
    | "duplicateRow"
    | "deleteRow"
    | "moveRow"
    | "setEditingIndex"
  >;
  onClose: () => void;
}) {
  const {
    editingRow,
    editingIndex,
    dialogOpen,
    fieldMap,
    invalidFields,
    patternInvalidByRowId,
    nameOptionsForRow,
    updateRow,
    insertBelow,
    insertAbove,
    duplicateRow,
    deleteRow,
    moveRow,
    setEditingIndex,
  } = grid;

  const moveRowRef = React.useRef(moveRow);
  React.useEffect(() => {
    moveRowRef.current = moveRow;
  });

  React.useEffect(() => {
    if (!dialogOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setEditingIndex(null);
        return;
      }
      if (event.ctrlKey && event.key === "ArrowUp") {
        event.preventDefault();
        moveRowRef.current("up");
      }
      if (event.ctrlKey && event.key === "ArrowDown") {
        event.preventDefault();
        moveRowRef.current("down");
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dialogOpen, setEditingIndex]);

  return (
    <Dialog
      open={dialogOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
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
  );
}
