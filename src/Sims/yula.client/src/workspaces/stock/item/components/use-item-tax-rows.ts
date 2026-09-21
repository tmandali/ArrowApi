import * as React from "react";
import {
  type TaxRow,
  initialRows,
  emptyRow,
  EDITABLE_COL_COUNT,
} from "./item-tax-types";

export function useItemTaxRows() {
  const [rows, setRows] = React.useState<TaxRow[]>(initialRows);
  const [editingIndex, setEditingIndex] = React.useState<number | null>(null);
  const tableRef = React.useRef<HTMLDivElement>(null);

  const editingRow =
    editingIndex === null ? null : (rows[editingIndex] ?? null);
  const dialogOpen = editingIndex !== null && editingRow !== null;

  const focusGridCell = React.useCallback((row: number, col: number) => {
    const cell = tableRef.current?.querySelector<HTMLElement>(
      `[data-grid-cell="${row}-${col}"]`
    );
    cell?.focus();
  }, []);

  const handleGridKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Tab") return;

    const target = event.target as HTMLElement | null;
    const cell = target?.closest<HTMLElement>("[data-grid-cell]");
    if (!cell) return;

    const [rowText, colText] = (cell.dataset.gridCell ?? "").split("-");
    const row = Number(rowText);
    const col = Number(colText);
    if (Number.isNaN(row) || Number.isNaN(col)) return;

    let nextRow = row;
    let nextCol = col + (event.shiftKey ? -1 : 1);

    if (nextCol >= EDITABLE_COL_COUNT) {
      nextRow += 1;
      nextCol = 0;
    } else if (nextCol < 0) {
      nextRow -= 1;
      nextCol = EDITABLE_COL_COUNT - 1;
    }

    if (nextRow < 0 || nextRow >= rows.length) return;

    event.preventDefault();
    focusGridCell(nextRow, nextCol);
  };

  const updateRow = (id: string, patch: Partial<TaxRow>) => {
    setRows((prev) =>
      prev.map((row) => (row.id === id ? { ...row, ...patch } : row))
    );
  };

  const addRow = (atIndex?: number) => {
    const row = emptyRow();
    setRows((prev) => {
      if (atIndex === undefined) {
        return [...prev, row];
      }
      const next = [...prev];
      next.splice(atIndex, 0, row);
      return next;
    });
    return row;
  };

  const insertBelow = () => {
    if (editingIndex === null) return;
    const row = addRow(editingIndex + 1);
    setEditingIndex(editingIndex + 1);
    void row;
  };

  const insertAbove = () => {
    if (editingIndex === null) return;
    addRow(editingIndex);
    setEditingIndex(editingIndex + 1);
  };

  const duplicateRow = () => {
    if (editingIndex === null || !editingRow) return;
    const copy: TaxRow = {
      ...editingRow,
      id: emptyRow().id,
      selected: false,
    };
    setRows((prev) => {
      const next = [...prev];
      next.splice(editingIndex + 1, 0, copy);
      return next;
    });
    setEditingIndex(editingIndex + 1);
  };

  const deleteRow = () => {
    if (editingIndex === null || !editingRow) return;
    setRows((prev) => prev.filter((row) => row.id !== editingRow.id));
    setEditingIndex(null);
  };

  const moveRow = (direction: "up" | "down") => {
    if (editingIndex === null) return;
    const target = direction === "up" ? editingIndex - 1 : editingIndex + 1;
    if (target < 0 || target >= rows.length) return;
    setRows((prev) => {
      const next = [...prev];
      const [item] = next.splice(editingIndex, 1);
      next.splice(target, 0, item);
      return next;
    });
    setEditingIndex(target);
  };

  const moveRowRef = React.useRef(moveRow);
  React.useEffect(() => {
    moveRowRef.current = moveRow;
  });

  const allSelected = rows.length > 0 && rows.every((row) => row.selected);

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
  }, [dialogOpen]);

  return {
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
  };
}
