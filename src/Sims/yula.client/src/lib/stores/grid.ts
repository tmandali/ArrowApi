import { create } from "zustand";

/**
 * Aktif açık tablonun bağlamı — Yula'nın grid-farkındalığı için.
 * Kalıcı DEĞİL: sayfa mount/unmount ile register/unregister edilir.
 */
export interface YulaGridSpec {
  tableName: string;
  title: string;
  columns: string[];
  rowCount: number | null;
  /** Kolon → tip ("date"|"number"|"bool"|"text") — Arrow/şemasından; LLM şema grounding'i */
  columnTypes?: Record<string, string>;
  /** İlk örnek satırlar — modelin veri dokusunu görmesi için; LLM şema grounding'i */
  sampleRows?: Array<Record<string, unknown>>;
  /** Düşük kardinaliteli kolonların gerçek değerleri (DISTINCT) — model değeri uydurmasın */
  columnValues?: Record<string, string[]>;
  /** Kolon → yetkili semantik tanım (rapor şeması x-ai.columnDescriptions) */
  columnDescriptions?: Record<string, string>;
  /** Aktif raporun scope'u (örn. "stock-balance") — şema tool'u için kimlik */
  reportScope?: string;
}

export interface YulaScreenRegistration {
  screenId: string;
  screenTitle: string;
  workspaceId: string;
  reportScope?: string;
  isViewingResults: boolean;
  registeredTools?: Array<{ name: string; description?: string }>;
  quickPrompts?: string[];
  criteriaDigest?: Array<Record<string, unknown>>;
  jobId?: string;
}

interface GridState {
  spec: YulaGridSpec | null;
  screen: YulaScreenRegistration | null;
  filters: Record<string, string>;
  /**
   * Modelin yazdığı salt-okunur SELECT (guard'dan geçmiş). Setliyken grid
   * temel tablo + filtre yerine bu sorgunun sonucunu gösterir (gruplama/
   * aggregate görünümleri); null → temel görünüm.
   */
  customQuerySql: string | null;
  /** Kullanıcı dostu görünüm adı (örn. "Depo Bazlı Qty Toplamı"); yoksa genel ad kullanılır */
  customQueryTitle: string | null;
  runtimeApi: YulaGridRuntimeApi | null;
  setRuntimeApi: (api: YulaGridRuntimeApi | null) => void;
  register: (spec: YulaGridSpec) => void;
  unregister: () => void;
  registerScreen: (screen: YulaScreenRegistration) => void;
  unregisterScreen: () => void;
  setFilters: (
    filters:
      | Record<string, string>
      | ((prev: Record<string, string>) => Record<string, string>),
  ) => void;
  setCustomQuerySql: (sql: string | null, title?: string | null) => void;
}

export interface GridRuntimeSnapshot {
  sortBy: string | null;
  sortDesc: boolean;
  hiddenColumns: string[];
  pinnedColumns: string[];
  columnOrder: string[];
  filters: Record<string, string>;
  rowCount: number | null;
}

export interface YulaGridRuntimeApi {
  /** Modelin yazdığı değeri gridin filtre hücresine uygular ve satırı açar */
  applyFilter: (column: string, value: string) => void;
  /** Birden fazla filtreyi aynı anda uygular */
  applyFilters: (filters: Record<string, string>, clearOthers?: boolean) => void;
  /** Tüm filtre hücrelerini boşaltır */
  clearAll: () => void;
  /** Tablo sıralamasını günceller */
  setSort: (column: string | null, direction: "asc" | "desc" | null) => void;
  /** Görünür kolonları belirler (harici olanlar gizlenir) */
  setVisibleColumns: (columns: string[]) => void;
  /** Belirli kolonları gizler */
  setHiddenColumns: (columns: string[]) => void;
  /** Kolonları sola veya sağa sabitler */
  setPinnedColumns: (columns: string[]) => void;
  /** Kolonların görüntüleme sırasını belirler */
  setColumnOrder: (columns: string[]) => void;
  /** Grid düzenini (sıralama, gizli kolonlar, pinler, filtreler) sıfırlar */
  resetLayout: (options?: {
    filters?: boolean;
    sort?: boolean;
    columns?: boolean;
    resetFilters?: boolean;
    resetSort?: boolean;
    resetColumns?: boolean;
  }) => void;
  /** Grid verisini dışa aktarır (xlsx, csv, parquet, gz) */
  exportGrid?: (format: "xlsx" | "parquet" | "csv" | "gz", filename?: string) => Promise<void> | void;
  /** Anlık grid durumunu döner */
  getGridState?: () => GridRuntimeSnapshot;
}

export const useYulaGridStore = create<GridState>((set) => ({
  spec: null,
  screen: null,
  filters: {},
  customQuerySql: null,
  customQueryTitle: null,
  runtimeApi: null,
  setRuntimeApi: (runtimeApi) => set({ runtimeApi }),
  registerScreen: (screen) =>
    set((s) => {
      if (
        s.screen &&
        s.screen.screenId === screen.screenId &&
        s.screen.reportScope === screen.reportScope &&
        s.screen.isViewingResults === screen.isViewingResults &&
        s.screen.jobId === screen.jobId &&
        JSON.stringify(s.screen.registeredTools) === JSON.stringify(screen.registeredTools)
      ) {
        return s;
      }
      return { screen };
    }),
  unregisterScreen: () => set({ screen: null }),
  register: (spec) =>
    set((s) => {
      if (
        s.spec &&
        s.spec.tableName === spec.tableName &&
        s.spec.title === spec.title &&
        s.spec.rowCount === spec.rowCount &&
        s.spec.reportScope === spec.reportScope &&
        JSON.stringify(s.spec.columns) === JSON.stringify(spec.columns) &&
        JSON.stringify(s.spec.columnTypes) === JSON.stringify(spec.columnTypes) &&
        JSON.stringify(s.spec.sampleRows) === JSON.stringify(spec.sampleRows) &&
        JSON.stringify(s.spec.columnValues) === JSON.stringify(spec.columnValues) &&
        JSON.stringify(s.spec.columnDescriptions) === JSON.stringify(spec.columnDescriptions)
      ) {
        return s;
      }
      return { spec };
    }),
  unregister: () =>
    set({
      spec: null,
      filters: {},
      customQuerySql: null,
      customQueryTitle: null,
      runtimeApi: null,
    }),
  setFilters: (filtersOrFn) =>
    set((s) => ({
      filters:
        typeof filtersOrFn === "function"
          ? filtersOrFn(s.filters)
          : filtersOrFn,
    })),
  setCustomQuerySql: (sql, title) =>
    set({
      customQuerySql: sql,
      customQueryTitle: sql ? title?.trim() || null : null,
    }),
}));
