"use client";

import * as React from "react";
import { parseCriteriaSchema } from "../../lib/parse-criteria-schema";
import { createInitialCriteriaRows } from "../../lib/create-initial-criteria-rows";
import { rowsToCriteriaInstance } from "../../lib/rows-to-criteria-instance";
import { validateCellPatterns } from "../../lib/validate-cell-patterns";
import { validateCriteria } from "../../lib/validate-criteria";
import type {
  CriteriaComboboxOption,
  CriteriaFilterRow,
  CriteriaValidationResult,
  JsonSchemaObject,
} from "../../types";
import { EDITABLE_COL_COUNT, emptyRow, isBlankCriteriaRow } from "./criteria-grid-layout";

/**
 * Kriter satır durumu: şema çözümü, kontrollü/kontrolsüz satırlar,
 * seçenekler, doğrulama, odak + klavye gezintisi ve satır işlemleri.
 */
export function useCriteriaRows(args: {
  schema: JsonSchemaObject;
  initialRows?: CriteriaFilterRow[];
  controlledRows?: CriteriaFilterRow[];
  autoValidate?: boolean;
  highlightRowNames?: string[];
  tableRef: React.RefObject<HTMLDivElement | null>;
  onChange?: (
    rows: CriteriaFilterRow[],
    instance: Record<string, unknown>
  ) => void;
  onRowsChange?: (rows: CriteriaFilterRow[]) => void;
  onValidate?: (result: CriteriaValidationResult) => void;
}) {
  const {
    schema,
    initialRows,
    controlledRows,
    autoValidate = false,
    highlightRowNames,
    tableRef,
    onChange,
    onRowsChange,
    onValidate,
  } = args;

  const parsed = React.useMemo(() => parseCriteriaSchema(schema), [schema]);
  const [internalRows, setInternalRows] = React.useState<CriteriaFilterRow[]>(
    () => {
      if (initialRows) return initialRows;
      return createInitialCriteriaRows(parseCriteriaSchema(schema).fields);
    }
  );
  const isControlled = controlledRows !== undefined;
  const rows = isControlled ? controlledRows : internalRows;
  const [editingIndex, setEditingIndex] = React.useState<number | null>(null);
  const [validation, setValidation] =
    React.useState<CriteriaValidationResult | null>(null);
  const hasValidatedRef = React.useRef(false);
  const rowsRef = React.useRef(rows);
  React.useEffect(() => {
    rowsRef.current = rows;
  });

  const nameOptions = React.useMemo<CriteriaComboboxOption[]>(
    () =>
      parsed.fields.map((field) => ({
        value: field.key,
        label: field.required ? `${field.title} *` : field.title,
      })),
    [parsed.fields]
  );

  const usedNames = React.useMemo(() => {
    const names = new Set<string>();
    for (const row of rows) {
      const name = row.name.trim();
      if (name) names.add(name);
    }
    return names;
  }, [rows]);

  const nameOptionsForRow = React.useCallback(
    (rowName: string) => {
      const current = rowName.trim();
      return nameOptions.filter(
        (option) => option.value === current || !usedNames.has(option.value)
      );
    },
    [nameOptions, usedNames]
  );

  const fieldMap = React.useMemo(
    () => new Map(parsed.fields.map((field) => [field.key, field])),
    [parsed.fields]
  );

  const highlightedNames = React.useMemo(
    () => new Set((highlightRowNames ?? []).map((n) => n.trim()).filter(Boolean)),
    [highlightRowNames]
  );

  const invalidFields = React.useMemo(() => {
    const keys = new Set<string>();
    for (const error of validation?.errors ?? []) {
      if (error.fieldKey) keys.add(error.fieldKey);
    }
    return keys;
  }, [validation]);

  const patternInvalidByRowId = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const row of rows) {
      const field = fieldMap.get(row.name);
      const result = validateCellPatterns(field, row.value);
      if (!result.valid && result.message) {
        map.set(row.id, result.message);
      }
    }
    return map;
  }, [rows, fieldMap]);

  const editingRow =
    editingIndex === null ? null : (rows[editingIndex] ?? null);
  const dialogOpen = editingIndex !== null && editingRow !== null;

  const runValidate = React.useCallback(
    (nextRows: CriteriaFilterRow[]) => {
      hasValidatedRef.current = true;
      const result = validateCriteria(schema, nextRows, parsed.fields);

      const patternErrors = nextRows.flatMap((row) => {
        const field = fieldMap.get(row.name);
        const cell = validateCellPatterns(field, row.value);
        if (cell.valid || !field) return [];
        return [
          {
            fieldKey: field.key,
            message: cell.message ?? `${field.title}: pattern mismatch`,
            keyword: "pattern",
          },
        ];
      });

      const merged = {
        ...result,
        valid: result.valid && patternErrors.length === 0,
        errors: [...result.errors, ...patternErrors],
      };
      setValidation(merged);
      onValidate?.(merged);
      return merged;
    },
    [schema, parsed.fields, onValidate, fieldMap]
  );

  const emitChange = React.useCallback(
    (nextRows: CriteriaFilterRow[]) => {
      const instance = rowsToCriteriaInstance(nextRows, parsed.fields);
      onChange?.(nextRows, instance);
    },
    [onChange, parsed.fields]
  );

  const setRowsAndNotify = React.useCallback(
    (updater: (prev: CriteriaFilterRow[]) => CriteriaFilterRow[]) => {
      const next = updater(isControlled ? controlledRows : internalRows);
      emitChange(next);
      if (isControlled) {
        onRowsChange?.(next);
      } else {
        setInternalRows(next);
      }
    },
    [emitChange, onRowsChange, isControlled, controlledRows, internalRows]
  );

  React.useEffect(() => {
    if (!autoValidate || !hasValidatedRef.current) return;
    const timer = window.setTimeout(() => {
      runValidate(rows);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [rows, autoValidate, runValidate]);

  const focusGridCell = React.useCallback(
    (row: number, col: number) => {
      const cell = tableRef.current?.querySelector<HTMLElement>(
        `[data-grid-cell="${row}-${col}"]`
      );
      cell?.focus();
    },
    [tableRef]
  );

  const pendingFocusRef = React.useRef<{ row: number; col: number } | null>(
    null
  );

  React.useLayoutEffect(() => {
    const pending = pendingFocusRef.current;
    if (!pending) return;
    pendingFocusRef.current = null;
    focusGridCell(pending.row, pending.col);
  }, [rows, focusGridCell]);

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

  const updateRow = (id: string, patch: Partial<CriteriaFilterRow>) => {
    setRowsAndNotify((prev) =>
      prev.map((row) => {
        if (row.id !== id) return row;
        const next = { ...row, ...patch };
        if (patch.name !== undefined && patch.name !== row.name) {
          next.value = "";
        }
        return next;
      })
    );
  };

  const addRow = (atIndex?: number, options?: { focusName?: boolean }) => {
    const existingBlankIndex = rows.findIndex(isBlankCriteriaRow);
    if (existingBlankIndex >= 0) {
      if (options?.focusName !== false) {
        focusGridCell(existingBlankIndex, 0);
      }
      return rows[existingBlankIndex]!;
    }

    const row = emptyRow();
    const focusIndex = atIndex ?? rows.length;
    setRowsAndNotify((prev) => {
      if (atIndex === undefined) return [...prev, row];
      const next = [...prev];
      next.splice(atIndex, 0, row);
      return next;
    });
    if (options?.focusName !== false) {
      pendingFocusRef.current = { row: focusIndex, col: 0 };
    }
    return row;
  };

  const resetToDefault = React.useCallback(() => {
    setEditingIndex(null);
    setValidation(null);
    hasValidatedRef.current = false;
    setRowsAndNotify(() => createInitialCriteriaRows(parsed.fields));
  }, [setRowsAndNotify, parsed.fields]);

  const insertBelow = () => {
    if (editingIndex === null) return;
    addRow(editingIndex + 1, { focusName: false });
    setEditingIndex(editingIndex + 1);
  };

  const insertAbove = () => {
    if (editingIndex === null) return;
    addRow(editingIndex, { focusName: false });
    setEditingIndex(editingIndex + 1);
  };

  const duplicateRow = () => {
    if (editingIndex === null || !editingRow) return;
    const copy: CriteriaFilterRow = {
      ...editingRow,
      id: emptyRow().id,
      selected: false,
    };
    setRowsAndNotify((prev) => {
      const next = [...prev];
      next.splice(editingIndex + 1, 0, copy);
      return next;
    });
    setEditingIndex(editingIndex + 1);
  };

  const deleteRow = () => {
    if (editingIndex === null || !editingRow) return;
    setRowsAndNotify((prev) =>
      prev.filter((row) => row.id !== editingRow.id)
    );
    setEditingIndex(null);
  };

  const moveRow = (direction: "up" | "down") => {
    if (editingIndex === null) return;
    const target = direction === "up" ? editingIndex - 1 : editingIndex + 1;
    if (target < 0 || target >= rows.length) return;
    setRowsAndNotify((prev) => {
      const next = [...prev];
      const [item] = next.splice(editingIndex, 1);
      next.splice(target, 0, item);
      return next;
    });
    setEditingIndex(target);
  };

  return {
    parsed,
    rows,
    rowsRef,
    editingIndex,
    setEditingIndex,
    editingRow,
    dialogOpen,
    validation,
    fieldMap,
    nameOptionsForRow,
    highlightedNames,
    invalidFields,
    patternInvalidByRowId,
    runValidate,
    updateRow,
    addRow,
    resetToDefault,
    insertBelow,
    insertAbove,
    duplicateRow,
    deleteRow,
    moveRow,
    focusGridCell,
    handleGridKeyDown,
  };
}

export type CriteriaRowsApi = ReturnType<typeof useCriteriaRows>;
