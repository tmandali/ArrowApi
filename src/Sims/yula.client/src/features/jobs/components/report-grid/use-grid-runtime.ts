"use client";

import * as React from "react";
import { useYulaGridStore } from "@/lib/stores/grid";
import type { SpreadsheetColumn } from "@/components/virtual-spreadsheet";

/**
 * AI & kontrollü grid düzeni: kolon gizleme/sabitleme/sıra + filtre satırı +
 * Yula runtimeApi köprüsü + mağaza filtre aynası.
 */
export function useGridRuntime(args: {
  setFilter: (column: string, value: string) => void;
  applyFilters: (filters: Record<string, string>, clearOthers?: boolean) => void;
  clearFilters: () => void;
  setSorting: (column: string | null, desc: boolean) => void;
  effectiveColumns: SpreadsheetColumn[];
  filters: Record<string, string>;
  totalFiltered: number;
  sortBy: string | null;
  sortDesc: boolean;
  sortConfigs: Record<string, "asc" | "desc">;
  showFilterRow: boolean;
  onShowFilterRowChange?: (open: boolean) => void;
  requestExport: (format?: "xlsx" | "parquet" | "csv" | "gz") => void;
}) {
  const {
    setFilter,
    applyFilters,
    clearFilters,
    setSorting,
    effectiveColumns,
    filters,
    totalFiltered,
    sortBy,
    sortDesc,
    sortConfigs,
    showFilterRow,
    onShowFilterRowChange,
    requestExport,
  } = args;

  // Parent callback bağlı değilse (örn. Yula içine gömülü grid) AI filtre
  // satırını kendisi açabilsin diye dahil yedek durum.
  const [internalShowFilterRow, setInternalShowFilterRow] = React.useState(false);
  const effectiveShowFilterRow = onShowFilterRowChange ? showFilterRow : (showFilterRow || internalShowFilterRow);
  const revealFilterRow = React.useCallback(() => {
    if (onShowFilterRowChange) onShowFilterRowChange(true);
    else setInternalShowFilterRow(true);
  }, [onShowFilterRowChange]);

  const [hiddenColumns, setHiddenColumns] = React.useState<string[] | undefined>(undefined);
  const [pinnedColumns, setPinnedColumns] = React.useState<string[] | undefined>(undefined);
  const [columnOrder, setColumnOrder] = React.useState<string[] | undefined>(undefined);

  // Anlık snapshot referansı (her render'da güncellenir, runtimeApi'yi yeniden tetiklemez)
  const latestGridStateRef = React.useRef({
    sortBy,
    sortDesc,
    sortConfigs,
    hiddenColumns: hiddenColumns ?? [],
    pinnedColumns: pinnedColumns ?? [],
    columnOrder: columnOrder ?? [],
    filters,
    rowCount: totalFiltered,
    effectiveColumns,
  });
  React.useEffect(() => {
    latestGridStateRef.current = {
      sortBy,
      sortDesc,
      sortConfigs,
      hiddenColumns: hiddenColumns ?? [],
      pinnedColumns: pinnedColumns ?? [],
      columnOrder: columnOrder ?? [],
      filters,
      rowCount: totalFiltered,
      effectiveColumns,
    };
  });

  // Yula aracının çağrılarını doğrudan grid ve DuckDB motoruna bağla
  React.useEffect(() => {
    const store = useYulaGridStore.getState();
    store.setRuntimeApi({
      applyFilter: (column, value) => {
        setFilter(column, value);
        revealFilterRow();
      },
      applyFilters: (newFilters, clearOthers) => {
        applyFilters(newFilters, clearOthers);
        revealFilterRow();
      },
      clearAll: () => {
        clearFilters();
      },
      setSort: (column, direction) => {
        if (!column || direction === null) {
          setSorting(null, false);
        } else {
          setSorting(column, direction === "desc");
        }
      },
      setVisibleColumns: (visibleCols) => {
        const visibleSet = new Set(visibleCols);
        const toHide = effectiveColumns
          .map((c) => c.name)
          .filter((name) => !visibleSet.has(name));
        setHiddenColumns(toHide);
      },
      setHiddenColumns: (toHide) => {
        setHiddenColumns(toHide);
      },
      setPinnedColumns: (pinned) => {
        setPinnedColumns(pinned);
      },
      setColumnOrder: (order) => {
        setColumnOrder(order);
      },
      resetLayout: (options) => {
        const opt = options ?? { filters: true, sort: true, columns: true };
        if (opt.filters) clearFilters();
        if (opt.sort) setSorting(null, false);
        if (opt.columns) {
          setHiddenColumns([]);
          setPinnedColumns(undefined);
          setColumnOrder(undefined);
        }
      },
      exportGrid: async (format) => {
        requestExport(format);
      },
      getGridState: () => {
        const s = latestGridStateRef.current;
        return {
          sortBy: s.sortBy,
          sortDesc: s.sortDesc,
          sortConfigs: s.sortConfigs,
          hiddenColumns: s.hiddenColumns,
          pinnedColumns: s.pinnedColumns,
          columnOrder:
            s.columnOrder.length > 0
              ? s.columnOrder
              : s.effectiveColumns.map((c) => c.name),
          filters: s.filters,
          rowCount: s.rowCount,
        };
      },
    });
    return () => {
      useYulaGridStore.getState().setRuntimeApi(null);
    };
  }, [
    setFilter,
    applyFilters,
    clearFilters,
    setSorting,
    effectiveColumns,
    revealFilterRow,
    requestExport,
  ]);

  // Bağlam aynası senkronu: gridin GERÇEK filtre state'i tek doğruluk kaynağıdır.
  // Kullanıcı filtre hücrelerinden temizlerken mağaza aynası bayat kalıyordu →
  // Yula var olmayan filtrelerle analize devam ediyordu.
  React.useEffect(() => {
    useYulaGridStore.getState().setFilters(filters);
  }, [filters]);

  return {
    hiddenColumns,
    setHiddenColumns,
    pinnedColumns,
    setPinnedColumns,
    columnOrder,
    setColumnOrder,
    effectiveShowFilterRow,
    revealFilterRow,
  };
}
