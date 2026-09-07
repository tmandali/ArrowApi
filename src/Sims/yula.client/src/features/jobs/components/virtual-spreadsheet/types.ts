import type * as React from "react"

export const ROW_HEIGHT = 28
export const SKELETON_ROWS = 3
export const MIN_COL_WIDTH = 64

export const cellInputClass =
  "h-7 w-full min-w-0 rounded-none border border-transparent bg-transparent px-2 py-0 text-xs shadow-none outline-none ring-0 transition-none focus-visible:border-border focus-visible:bg-background focus-visible:ring-0 md:text-xs/relaxed placeholder:text-muted-foreground/70"

export const cellClass =
  "p-0 border-r border-b border-border/60 last:border-r-0 align-middle"

export const headClass =
  "h-7 px-2 py-0 border-r border-b border-border/60 last:border-r-0 text-[11px] font-medium leading-none text-muted-foreground bg-muted/40 align-middle"

export type SpreadsheetColumn = {
  name: string
  label: string
  align?: "left" | "right"
  kind?: string
  /** Ham fiziksel DuckDB veri tipi (BIGINT, VARCHAR, DATE, DECIMAL, BOOLEAN...) */
  duckType?: string
  /** Bu kolon için sıralama tıklaması aktif mi? (varsayılan: true) */
  sortable?: boolean
}

export type VirtualSpreadsheetProps<T> = {
  /** Görünen (filtreli) kolonlar. Sıfırsa boş durum gösterilir. */
  columns: readonly SpreadsheetColumn[]
  /** Sanal pencereye alınacak tam (filtreli) satır listesi. */
  items: readonly T[]
  /** Her satır için `<tr>...</tr>` üreten renderer (key'i renderer sağlar). */
  renderRow: (item: T, index: number, columns?: readonly SpreadsheetColumn[]) => React.ReactNode
  rowHeight?: number
  /**
   * Başlangıç kolon genişlikleri (örn. `{ Name: "20%" }`). Kullanıcı handle ile
   * sürükledikçe piksel değerine güncellenir.
   */
  initialColWidths?: Record<string, string | number>
  /** Dışarıdan yönetilen aktif sıralama kolonu. */
  sortColumn?: string | null
  /** Dışarıdan yönetilen aktif sıralama yönü ("asc" | "desc" | null). */
  sortDirection?: "asc" | "desc" | null
  /** Sıralama değiştiğinde çağrılır (veritabanı / DuckDB SQL ORDER BY için). */
  onSortChange?: (columnName: string, nextDirection: "asc" | "desc" | null) => void
  /** Sıralamayı tamamen devre dışı bırakmak için (örn. hiyerarşik ağaç listelerinde). */
  disableSorting?: boolean
  /** Dışarıdan yönetilen kolon sıralaması (kolon isimleri dizisi). */
  columnOrder?: string[]
  /** Kolon sıralaması sürükle-bırak ile değiştiğinde çağrılır. */
  onColumnOrderChange?: (newOrder: string[]) => void
  /** Kolon sürükle-bırak ile sıralamayı devre dışı bırakır (örn. hiyerarşik ağaçlarda). */
  disableColumnReorder?: boolean
  /** Dışarıdan yönetilen gizli kolon isimleri listesi. */
  hiddenColumns?: string[]
  /** Gizli kolon listesi değiştiğinde çağrılır. */
  onHiddenColumnsChange?: (hiddenColumns: string[]) => void
  /** Kolon gizleme / gösterme menüsünü devre dışı bırakır. */
  disableColumnVisibility?: boolean
  /** Filtre satırı `<tr>`'sinin ek class'ı. */
  filterRowClassName?: string
  title?: string
  subtitle?: React.ReactNode
  /** Header sağındaki ekstra aksiyonlar (filtre toggle'dan önce çizilir). */
  headerActions?: React.ReactNode
  showFilterRow?: boolean
  onToggleFilterRow?: (open: boolean) => void
  /** Filtre hücresi renderer'ı (kolon bazlı Input). */
  renderFilterCell?: (column: SpreadsheetColumn, index: number) => React.ReactNode
  emptyMessage?: string
  className?: string
  /** Rapor yükleniyor mu? (ilk açılışta animasyonlu kart gösterir) */
  loading?: boolean
  loadingMessage?: React.ReactNode
  progressValue?: number | null
  /** Değişince scroll 0'a sıfırlanır (yeni rapor). */
  resetKey?: unknown
  /** Listenin sonuna yaklaşılınca çağrılır (infinite scroll / lazy batch). */
  onNeedMore?: () => void
  /** Yüklenecek daha fazla satır var mı? */
  hasMore?: boolean
  /**
   * Kolon sırası, genişlikleri ve gizlilik tercihlerini localStorage'da
   * kalıcı olarak saklamak için benzersiz anahtar (örn. "arrow_grid_stock_balance").
   * Belirtilmezse title'dan otomatik türetilir.
   */
  storageKey?: string
  /**
   * Kalıcı state (localStorage) kullanımını devre dışı bırakır (varsayılan: false).
   */
  disablePersistence?: boolean
  /**
   * Solda sabitlenecek (sticky/pinned) kolon sayısı (varsayılan: 1).
   * 0 verilirse sabitleme devre dışı kalır.
   */
  pinnedColumnCount?: number
  /** Sabitlenmiş kolon isimleri (kontrollü mod) */
  pinnedColumns?: string[]
  /** Sabitlenmiş kolonlar değiştiğinde çağrılır */
  onPinnedColumnsChange?: (pinned: string[]) => void
  /** Sona yaklaşıldığında yükleme sürüyor mu? (skeleton satırları gösterir) */
  loadingMore?: boolean
}
