"use client";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Pencil, RotateCcw } from "lucide-react";
import { cn } from "@/utils/cn";
import type { CriteriaFilterRow } from "../../types";
import { CriteriaSimpleCombobox } from "../CriteriaSimpleCombobox";
import { CriteriaValueCell } from "../CriteriaValueCell";
import {
  ACTIONS_COL_WIDTH,
  EDGE_COLS_TOTAL,
  NO_COL_WIDTH,
  cellClass,
  cellInputClass,
  edgeCellClass,
  fixedEdgeColStyle,
  headClass,
  nameColStyle,
  rowIndexClass,
  valueColStyle,
  type ColWidths,
  type ResizableColKey,
} from "./criteria-grid-layout";
import { ColumnResizeHandle } from "./column-resize-handle";
import type { CriteriaRowsApi } from "./use-criteria-rows";

/** Kriter grid tablosu: başlık + satırlar (stacked/columns düzenleri). */
export function CriteriaGridTable({
  grid,
  readOnly,
  stackedLayout,
  descriptionColumnVisible,
  colWidths,
  resizeColumn,
  resetToDefault,
  setEditingIndex,
}: {
  grid: Pick<
    CriteriaRowsApi,
    | "rows"
    | "fieldMap"
    | "patternInvalidByRowId"
    | "invalidFields"
    | "highlightedNames"
    | "nameOptionsForRow"
    | "updateRow"
  >;
  readOnly: boolean;
  stackedLayout: boolean;
  descriptionColumnVisible: boolean;
  colWidths: ColWidths;
  resizeColumn: (column: ResizableColKey, deltaX: number) => void;
  resetToDefault: () => void;
  setEditingIndex: (index: number | null) => void;
}) {
  const {
    rows,
    fieldMap,
    patternInvalidByRowId,
    invalidFields,
    highlightedNames,
    nameOptionsForRow,
    updateRow,
  } = grid;

  return (
    <Table className="w-full table-fixed border-separate border-spacing-0 text-xs">
      <colgroup>
        <col style={fixedEdgeColStyle(NO_COL_WIDTH)} />
        {stackedLayout ? (
          <col
            style={{
              width: `calc(100% - ${EDGE_COLS_TOTAL - (readOnly ? ACTIONS_COL_WIDTH : 0)}px)`,
              boxSizing: "border-box",
            }}
          />
        ) : (
          <>
            <col style={nameColStyle(colWidths.name)} />
            <col
              style={valueColStyle(
                colWidths.name,
                EDGE_COLS_TOTAL - (readOnly ? ACTIONS_COL_WIDTH : 0)
              )}
            />
            {descriptionColumnVisible ? <col /> : null}
          </>
        )}
        {!readOnly ? (
          <col style={fixedEdgeColStyle(ACTIONS_COL_WIDTH)} />
        ) : null}
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
          {!readOnly ? (
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
          ) : null}
        </TableRow>
      </TableHeader>
      <TableBody className="[&_tr:last-child]:border-0">
        {rows.map((row: CriteriaFilterRow, index: number) => {
          const field = fieldMap.get(row.name);
          const patternMessage = patternInvalidByRowId.get(row.id);
          const rowInvalid = Boolean(
            (row.name && invalidFields.has(row.name)) || patternMessage
          );
          const description = field?.description?.trim() || "";
          // AI doldurulan kriterler: arka plan yerine turuncu YAZI rengi
          // (kalıcıdır; kullanıcı alana dokunana veya yeni dolum olana dek)
          const aiFilled = highlightedNames.has(row.name.trim());
          const aiFilledText = aiFilled ? "text-orange-600 dark:text-orange-300" : undefined;
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
                        row.name && "font-medium",
                        aiFilledText
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
                      className={aiFilledText}
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
                        row.name && "font-medium",
                        aiFilledText
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
                      className={aiFilledText}
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
              {!readOnly ? (
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
              ) : null}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
