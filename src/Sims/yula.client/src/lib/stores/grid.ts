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
  /** Kolon → tip ("date"|"number"|"bool"|"text") — Arrow/DuckDB şemasından; LLM şema grounding'i */
  columnTypes?: Record<string, string>;
  /** İlk örnek satırlar — modelin veri dokusunu görmesi için; LLM şema grounding'i */
  sampleRows?: Array<Record<string, unknown>>;
  /** Düşük kardinaliteli kolonların gerçek değerleri (DuckDB DISTINCT) — model değeri uydurmasın */
  columnValues?: Record<string, string[]>;
  /** Kolon → yetkili semantik tanım (rapor şeması x-ai.columnDescriptions) */
  columnDescriptions?: Record<string, string>;
  /** Aktif raporun scope'u (örn. "stock-balance") — şema tool'u için kimlik */
  reportScope?: string;
}

interface GridState {
  spec: YulaGridSpec | null;
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
  setFilters: (
    filters:
      | Record<string, string>
      | ((prev: Record<string, string>) => Record<string, string>),
  ) => void;
  setCustomQuerySql: (sql: string | null, title?: string | null) => void;
}

export interface YulaGridRuntimeApi {
  /** Modelin yazdığı değeri gridin filtre hücresine uygular ve satırı açar */
  applyFilter: (column: string, value: string) => void;
  /** Tüm filtre hücrelerini boşaltır */
  clearAll: () => void;
}

export const useYulaGridStore = create<GridState>((set) => ({
  spec: null,
  filters: {},
  customQuerySql: null,
  customQueryTitle: null,
  runtimeApi: null,
  setRuntimeApi: (runtimeApi) => set({ runtimeApi }),
  register: (spec) => set({ spec }),
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
