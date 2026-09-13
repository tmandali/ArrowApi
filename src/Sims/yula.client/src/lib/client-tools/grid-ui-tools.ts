import { useYulaGridStore } from "@/lib/stores/grid";
import { ensureGridSpec, resetGridCustomView } from "./dataset";

/**
 * Layer 1: Virtual Spreadsheet UI araçları (View & Focus) —
 * `filter_current_grid`, `set_grid_sort`, `configure_grid_columns`,
 * `pin_grid_columns`, `apply_grid_filters`, `reset_grid_layout`,
 * `export_grid_data`. Davranış `yula-client-tools.ts` ile birebirdir.
 */

/** "qty"/"miktar" gibi takma adları gerçek kolona gevşekçe eşler */
export function resolveFieldLoose(
  field: string,
  columns: string[],
): string | undefined {
  const f = field.toLowerCase().trim();
  if (columns.includes(field)) return field;
  const direct = columns.find((c) => c.toLowerCase() === f);
  if (direct) return direct;
  const partial = columns.filter((c) => c.toLowerCase().includes(f));
  if (partial.length === 1) return partial[0];
  return undefined;
}

export async function applyFilter(
  field: string,
  value: string,
  op: string,
): Promise<unknown> {
  const store = useYulaGridStore.getState();
  let spec = await ensureGridSpec();

  if (field === "*") {
    store.runtimeApi?.clearAll();
    store.setFilters({});
    return {
      status: "ok",
      clearedAll: true,
      message:
        "Tüm filtreler temizlendi; tablo tam veri kümesine döndürülüyor.",
    };
  }

  if (!spec) {
    return { status: "error", error: "Açık tablo yok." };
  }

  let resolved = resolveFieldLoose(field, spec.columns) ?? undefined;
  let viewReset = false;

  // İstenen kolon ÖZEL GÖRÜNÜMDE (gruplama/aggregate) yoksa: görünüme filtre
  // yapıştırmanın anlamı yok (o kolonun hücresi bile görünmez). Temel tabloya
  // dönüp filtrelemek kullanıcının niyetidir (örn. özel özet görünümdeyken
  // "BATCH-007 filtrele" → temel kayıtlar istenir).
  const customActive = !!useYulaGridStore.getState().customQuerySql;
  if ((!resolved || !spec.columns.includes(resolved)) && customActive) {
    await resetGridCustomView();
    spec = (await ensureGridSpec()) ?? spec;
    resolved = resolveFieldLoose(field, spec.columns) ?? undefined;
    viewReset = !!resolved;
  }

  if (!resolved || !spec.columns.includes(resolved)) {
    return {
      status: "error",
      error: `Filtre için geçersiz kolon: ${field}`,
      availableColumns: spec.columns,
    };
  }
  field = resolved;

  let mapped = value.trim();

  // Deterministik boş/dolu op'ları → D365 karşılıkları ("boş olanlar" vaka çözümü):
  //   op:"empty"    → "''"    (NULL veya boş metin)
  //   op:"notEmpty" → "<>''"  (dolu kayıtlar)
  // NOT: value:"" (gerçekten boş string) hâlâ "filtre kaldır" demektir.
  if (op === "empty") mapped = "''";
  else if (op === "notEmpty") mapped = "<>''";

  if (mapped === "") {
    const next = { ...store.filters };
    delete next[resolved];
    store.setFilters(next);
    return {
      status: "ok",
      removedFilter: field,
      message: `${field} filtresi kaldırıldı.`,
    };
  }

  // D365 ifadesi mi? → OLDUĞU GİBİ geç (grid parser tam kuralları bilir)
  const isD365 =
    /[><=|&!*@]/.test(mapped) ||
    mapped.includes("..") ||
    mapped === "''" ||
    mapped === '""' ||
    mapped === "<>''";

  if (!isD365) {
    if (op === "contains") mapped = `%${mapped}%`;
    else if (op === "gt") mapped = `>${mapped}`;
    else if (op === "lt") mapped = `<${mapped}`;
  }

  // 1) Gridin gerçek filtre hücresini güncelle. runtimeApi YOKSA grid bağlı
  //    değildir: mağaza aynasına tek başına yazmak "filtre uygulandı" yalanı
  //    üretir (araç ok der ama hücre/query güncellenmez) → dürüst hata dön.
  const runtimeApi = store.runtimeApi;
  if (!runtimeApi) {
    console.warn(
      "[Yula filter] runtimeApi yok — grid bağlantısı kapalı; filtre uygulanamadı:",
      resolved,
      mapped,
    );
    return {
      status: "error",
      error: "Açık grid bulunamadı; filtre uygulanamadı.",
      hint: "Rapor sonuç ekranı açıkken tekrar deneyin.",
    };
  }
  runtimeApi.applyFilter(resolved, mapped);
  // 2) Mağaza aynası güncel kalsın (bağlam zarfı kaynağı)
  store.setFilters((prev) => ({ ...prev, [resolved]: mapped }));
  return {
    status: "ok",
    appliedFilter: { field: resolved, op, value },
    viewReset,
    message: `"${field}" → ${resolved} kolonuna filtre uygulandı; tablo yenileniyor.${
      viewReset
        ? " (İstenen kolon önceki gruplama görünümünde olmadığı için temel tabloya dönüldü.)"
        : ""
    }`,
  };
}

export async function sortCurrentGrid(
  column: string,
  direction: "asc" | "desc" | "none",
): Promise<unknown> {
  const store = useYulaGridStore.getState();
  const spec = await ensureGridSpec();
  if (!spec) {
    return { status: "error", error: "No active table found." };
  }
  const resolved = resolveFieldLoose(column, spec.columns);
  if (!resolved) {
    return {
      status: "error",
      error: `Invalid column for sorting: ${column}`,
      availableColumns: spec.columns,
    };
  }
  const runtimeApi = store.runtimeApi;
  if (!runtimeApi) {
    return {
      status: "error",
      error: "Active grid not found; could not apply sort.",
      hint: "Try again when report results are open.",
    };
  }
  const dir = direction === "none" ? null : direction;
  runtimeApi.setSort(resolved, dir);
  return {
    status: "ok",
    column: resolved,
    direction,
    message:
      direction === "none"
        ? `Sort cleared for ${resolved}; restored natural order.`
        : `Sorted by ${resolved} in ${direction === "asc" ? "ascending" : "descending"} order.`,
  };
}

export async function configureGridColumns(args: {
  visibleColumns?: string[];
  hiddenColumns?: string[];
  order?: string[];
}): Promise<unknown> {
  const store = useYulaGridStore.getState();
  const spec = await ensureGridSpec();
  if (!spec) {
    return { status: "error", error: "No active table found." };
  }
  const runtimeApi = store.runtimeApi;
  if (!runtimeApi) {
    return {
      status: "error",
      error: "Active grid not found.",
      hint: "Try again when report results are open.",
    };
  }

  // visibleColumns varsa: sadece bu kolonlar açık, diğerleri gizli
  if (Array.isArray(args.visibleColumns) && args.visibleColumns.length > 0) {
    const resolvedVisible = args.visibleColumns
      .map((c) => resolveFieldLoose(c, spec.columns))
      .filter((c): c is string => !!c);
    if (resolvedVisible.length === 0) {
      return {
        status: "error",
        error: "None of the specified columns were found in the table.",
        availableColumns: spec.columns,
      };
    }
    runtimeApi.setVisibleColumns(resolvedVisible);
    return {
      status: "ok",
      visibleColumns: resolvedVisible,
      hiddenCount: spec.columns.length - resolvedVisible.length,
      message: `${resolvedVisible.length} column(s) displayed (${spec.columns.length - resolvedVisible.length} hidden).`,
    };
  }

  // hiddenColumns varsa: bu kolonlar gizlenir
  if (Array.isArray(args.hiddenColumns) && args.hiddenColumns.length > 0) {
    const resolvedHidden = args.hiddenColumns
      .map((c) => resolveFieldLoose(c, spec.columns))
      .filter((c): c is string => !!c);
    runtimeApi.setHiddenColumns(resolvedHidden);
    return {
      status: "ok",
      hiddenColumns: resolvedHidden,
      message: `${resolvedHidden.length} column(s) hidden (${resolvedHidden.join(", ")}).`,
    };
  }

  // order varsa: kolon sırası güncellenir
  if (Array.isArray(args.order) && args.order.length > 0) {
    const resolvedOrder = args.order
      .map((c) => resolveFieldLoose(c, spec.columns))
      .filter((c): c is string => !!c);
    runtimeApi.setColumnOrder(resolvedOrder);
    return {
      status: "ok",
      order: resolvedOrder,
      message: "Column display order updated.",
    };
  }

  return {
    status: "ok",
    message: "No changes made (visibleColumns, hiddenColumns, or order not specified).",
  };
}

export async function pinGridColumns(columns: string[]): Promise<unknown> {
  const store = useYulaGridStore.getState();
  const spec = await ensureGridSpec();
  if (!spec) {
    return { status: "error", error: "No active table found." };
  }
  const runtimeApi = store.runtimeApi;
  if (!runtimeApi) {
    return {
      status: "error",
      error: "Active grid not found.",
      hint: "Try again when report results are open.",
    };
  }
  const resolved = columns
    .map((c) => resolveFieldLoose(c, spec.columns))
    .filter((c): c is string => !!c);
  if (resolved.length === 0) {
    return {
      status: "error",
      error: "Columns to pin were not found in the table.",
      availableColumns: spec.columns,
    };
  }
  runtimeApi.setPinnedColumns(resolved);
  return {
    status: "ok",
    pinnedColumns: resolved,
    message: `Columns pinned to the left: ${resolved.join(", ")}.`,
  };
}

export async function applyGridFiltersMulti(
  filters: Record<string, string>,
  clearOthers = false,
): Promise<unknown> {
  const store = useYulaGridStore.getState();
  const spec = await ensureGridSpec();
  if (!spec) {
    return { status: "error", error: "No active table found." };
  }
  const runtimeApi = store.runtimeApi;
  if (!runtimeApi) {
    return {
      status: "error",
      error: "Active grid not found.",
      hint: "Try again when report results are open.",
    };
  }

  const resolvedFilters: Record<string, string> = {};
  const notFound: string[] = [];

  for (const [col, val] of Object.entries(filters)) {
    const resolved = resolveFieldLoose(col, spec.columns);
    if (resolved) {
      resolvedFilters[resolved] = val;
    } else {
      notFound.push(col);
    }
  }

  if (Object.keys(resolvedFilters).length === 0) {
    return {
      status: "error",
      error: "No valid columns found to apply filters.",
      notFound,
      availableColumns: spec.columns,
    };
  }

  runtimeApi.applyFilters(resolvedFilters, clearOthers);
  store.setFilters((prev) =>
    clearOthers ? resolvedFilters : { ...prev, ...resolvedFilters },
  );

  const appliedList = Object.entries(resolvedFilters)
    .map(([k, v]) => `${k}='${v}'`)
    .join(", ");

  return {
    status: "ok",
    appliedFilters: resolvedFilters,
    notFound: notFound.length > 0 ? notFound : undefined,
    message: `Filters applied: ${appliedList}`,
  };
}

export async function resetGridLayout(options?: {
  resetFilters?: boolean;
  resetSort?: boolean;
  resetColumns?: boolean;
}): Promise<unknown> {
  const store = useYulaGridStore.getState();
  const runtimeApi = store.runtimeApi;
  const opt = options ?? {
    resetFilters: true,
    resetSort: true,
    resetColumns: true,
  };
  if (opt.resetFilters) {
    store.setFilters({});
  }
  if (runtimeApi) {
    runtimeApi.resetLayout({
      filters: opt.resetFilters,
      sort: opt.resetSort,
      columns: opt.resetColumns,
    });
  }
  return {
    status: "ok",
    reset: opt,
    message: "Grid layout and filters reset to default settings.",
  };
}

export async function exportGridData(
  format: "xlsx" | "parquet" | "csv" | "gz",
): Promise<unknown> {
  const store = useYulaGridStore.getState();
  const runtimeApi = store.runtimeApi;
  if (!runtimeApi || !runtimeApi.exportGrid) {
    return {
      status: "error",
      error: "Grid export service is not attached.",
    };
  }
  await runtimeApi.exportGrid(format);
  return {
    status: "ok",
    format,
    message: `File export initiated in ${format.toUpperCase()} format.`,
  };
}
