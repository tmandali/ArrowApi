"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Plus, RotateCcw } from "lucide-react";
import { cn } from "@/utils/cn";
import type {
  CriteriaFilterRow,
  CriteriaValidationResult,
  JsonSchemaObject,
} from "../../types";
import { CriteriaGridTable } from "./criteria-grid-table";
import { RowEditDialog } from "./row-edit-dialog";
import { useCriteriaRows } from "./use-criteria-rows";
import { useGridLayout } from "./use-grid-layout";

export type SchemaCriteriaFilterProps = {
  schema: JsonSchemaObject;
  initialRows?: CriteriaFilterRow[];
  /**
   * Controlled rows. When set, the component renders these rows and reports
   * edits through `onRowsChange` instead of owning internal state.
   */
  rows?: CriteriaFilterRow[];
  onRowsChange?: (rows: CriteriaFilterRow[]) => void;
  autoValidate?: boolean;
  /**
   * Schema field keys (row.name) to subtly highlight — used to mark criteria
   * that were just filled by the AI agent (Yula). Renders a soft
   * orange tint on those rows; purely visual, no behavior change.
   */
  highlightRowNames?: string[];
  /** Show schema title/description header. Default true. */
  showHeader?: boolean;
  /** Show Clear in the grid footer. Default true. */
  showFooterClear?: boolean;
  /**
   * Display-only grid: hides footer/actions, blocks pointer + keyboard
   * interaction. Used by the Live panel to mirror a running job's criteria.
   */
  readOnly?: boolean;
  onChange?: (
    rows: CriteriaFilterRow[],
    instance: Record<string, unknown>
  ) => void;
  onValidate?: (result: CriteriaValidationResult) => void;
  className?: string;
};

export type SchemaCriteriaFilterHandle = {
  submit: () => CriteriaValidationResult;
  clear: () => void;
};

export const SchemaCriteriaFilter = React.forwardRef<
  SchemaCriteriaFilterHandle,
  SchemaCriteriaFilterProps
>(function SchemaCriteriaFilter(
  {
    schema,
    initialRows,
    autoValidate = false,
    highlightRowNames,
    showHeader = true,
    showFooterClear = true,
    readOnly = false,
    onChange,
    onRowsChange,
    onValidate,
    className,
    rows: controlledRows,
  },
  ref
) {
  const tableRef = React.useRef<HTMLDivElement>(null);
  const grid = useCriteriaRows({
    schema,
    initialRows,
    controlledRows,
    autoValidate,
    highlightRowNames,
    tableRef,
    onChange,
    onRowsChange,
    onValidate,
  });
  const layout = useGridLayout(tableRef);

  React.useImperativeHandle(
    ref,
    () => ({
      submit: () => grid.runValidate(grid.rowsRef.current),
      clear: grid.resetToDefault,
    }),
    [grid]
  );

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
            {grid.parsed.title}
          </h3>
          {grid.parsed.description ? (
            <p className="text-xs text-muted-foreground">{grid.parsed.description}</p>
          ) : (
            <p className="text-xs text-muted-foreground">
              Define name / value filter rows from the report schema.
            </p>
          )}
          {grid.validation &&
          !grid.validation.valid &&
          grid.validation.errors.length > 0 ? (
            <p className="truncate text-xs text-destructive">
              {grid.validation.errors[0]?.message}
              {grid.validation.errors.length > 1
                ? ` (+${grid.validation.errors.length - 1})`
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
        onKeyDownCapture={grid.handleGridKeyDown}
        inert={readOnly || undefined}
      >
        <CriteriaGridTable
          grid={grid}
          readOnly={readOnly}
          stackedLayout={layout.stackedLayout}
          descriptionColumnVisible={layout.descriptionColumnVisible}
          colWidths={layout.colWidths}
          resizeColumn={layout.resizeColumn}
          resetToDefault={grid.resetToDefault}
          setEditingIndex={grid.setEditingIndex}
        />

        {!readOnly ? (
          <div className="flex shrink-0 items-center gap-1 border-t border-border/60 bg-muted/10 px-2 py-1.5">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-muted-foreground"
              onClick={() => grid.addRow()}
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
                onClick={grid.resetToDefault}
              >
                <RotateCcw className="size-3.5 mr-1" />
                Clear
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      <RowEditDialog grid={grid} onClose={() => grid.setEditingIndex(null)} />
    </div>
  );
});
