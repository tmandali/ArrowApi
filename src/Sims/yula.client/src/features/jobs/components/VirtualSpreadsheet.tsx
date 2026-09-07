"use client";

import * as React from "react"
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Columns3,
  ListFilter,
  RotateCcw,
  Search,
  Table2,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { useVirtualWindow } from "@/hooks/use-virtual-window"
import {
  panelCardClass,
  panelHeaderClass,
  panelHeaderIconClass,
  panelHeaderSubtitleClass,
  panelHeaderTitleClass,
} from "@/components/layout/panel-chrome"
import { formatGridCellValue } from "@/utils/format-cell"
import { cn } from "@/utils/cn"

export const ROW_HEIGHT = 28

const SKELETON_ROWS = 3
const MIN_COL_WIDTH = 64

export const cellInputClass =
  "h-7 w-full min-w-0 rounded-none border border-transparent bg-transparent px-2 py-0 text-xs shadow-none outline-none ring-0 transition-none focus-visible:border-border focus-visible:bg-background focus-visible:ring-0 md:text-xs/relaxed placeholder:text-muted-foreground/70"

export const cellClass =
  "p-0 border-r border-b border-border/60 last:border-r-0 align-middle"
export const headClass =
  "h-7 px-2 py-0 border-r border-b border-border/60 last:border-r-0 text-[11px] font-medium leading-none text-muted-foreground bg-muted/40 align-middle"

let measurementCanvas: HTMLCanvasElement | null = null

/**
 * Canvas 2D context kullanarak verilen metnin piksel genişliğini ölçer (0 ms, reflow yok).
 */
function measureTextWidth(text: string, font = "12px sans-serif"): number {
  if (typeof document === "undefined" || !text) return (text?.length || 0) * 8
  try {
    if (!measurementCanvas) {
      measurementCanvas = document.createElement("canvas")
    }
    const ctx = measurementCanvas.getContext("2d")
    if (!ctx) return text.length * 8
    ctx.font = font
    return ctx.measureText(text).width
  } catch {
    return text.length * 8
  }
}

/**
 * Kolon başlığı ve mevcut satır içeriklerine göre en uygun "tam sığdır" (fit-content) piksel genişliğini hesaplar.
 */
function calculateColumnAutoFitWidth<T>(
  col: SpreadsheetColumn,
  items: readonly T[]
): number {
  const headerWidth =
    measureTextWidth(col.label || col.name || "", "bold 11px sans-serif") + 40

  let maxContentWidth = 0
  const sampleLimit = Math.min(items.length, 120)

  for (let i = 0; i < sampleLimit; i++) {
    const item = items[i] as Record<string, unknown> | null | undefined
    if (!item) continue

    const rowValues =
      item.values && typeof item.values === "object"
        ? (item.values as Record<string, unknown>)
        : null

    const nestedRow =
      item.row && typeof item.row === "object"
        ? (item.row as Record<string, unknown>)
        : null

    const rawVal =
      rowValues?.[col.name] ??
      nestedRow?.[col.name] ??
      item[col.name] ??
      (col.kind === "account" ? (nestedRow?.name as unknown) ?? item.name : undefined)

    if (rawVal == null) continue

    const formattedVal = formatGridCellValue(rawVal, col.align)
    let w = measureTextWidth(formattedVal, "12px sans-serif")

    if (typeof item.depth === "number") {
      w += item.depth * 16 + 24
    }

    if (w > maxContentWidth) {
      maxContentWidth = w
    }
  }

  const contentWidth = maxContentWidth > 0 ? maxContentWidth + 28 : 0
  const fitWidth = Math.round(Math.max(headerWidth, contentWidth))
  return Math.max(MIN_COL_WIDTH, Math.min(520, fitWidth))
}

/**
 * Kolon hizalamasına (align) ve etiket uzunluğuna göre varsayılan piksel genişliği hesaplar.
 * İsim listesi veya kelime tahmini içermez; tamamen yapısal özelliklere dayanır.
 */
function getDefaultColumnWidth(col: SpreadsheetColumn): number {
  const labelLen = (col.label || col.name || "").length;
  // Sayısal (sağa hizalı) kolonlar için kompakt genişlik (80px - 130px)
  if (col.align === "right") {
    return Math.max(80, Math.min(130, labelLen * 7 + 28));
  }
  // Metin / genel (sola hizalı) kolonlar için dengeli genişlik (100px - 220px)
  return Math.max(100, Math.min(220, labelLen * 8 + 32));
}

export type SpreadsheetColumn = {
  name: string
  label: string
  align?: "left" | "right"
  kind?: string
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
  /** Sona yaklaşıldığında yükleme sürüyor mu? (skeleton satırları gösterir) */
  loadingMore?: boolean
}

/**
 * Sanal pencereli spreadsheet iskeleti: sabit header + filtre satırı + spacer'lı
 * sanal body. Stock Balance (flat) ve Stock Analytics (ağaç) grid'leri bu ortak
 * chrome/virtualizasyonu paylaşır; satır renderer'ı grid'e özeldir.
 */
export function VirtualSpreadsheet<T>({
  columns,
  items,
  renderRow,
  rowHeight = ROW_HEIGHT,
  initialColWidths,
  sortColumn,
  sortDirection,
  onSortChange,
  disableSorting = false,
  columnOrder,
  onColumnOrderChange,
  disableColumnReorder = false,
  hiddenColumns,
  onHiddenColumnsChange,
  disableColumnVisibility = false,
  filterRowClassName,
  title,
  subtitle,
  headerActions,
  showFilterRow = false,
  onToggleFilterRow,
  renderFilterCell,
  emptyMessage = "No data found",
  className,
  loading = false,
  progressValue,
  resetKey,
  onNeedMore,
  hasMore = false,
  loadingMore = false,
}: VirtualSpreadsheetProps<T>) {
  // Kolon sıralama düzeni (Sürükle - Bırak)
  const [internalColumnOrder, setInternalColumnOrder] = React.useState<string[] | null>(null)

  React.useEffect(() => {
    setInternalColumnOrder(null)
  }, [resetKey])

  const activeColumnOrder = columnOrder ?? internalColumnOrder

  const orderedColumns = React.useMemo(() => {
    if (!activeColumnOrder || activeColumnOrder.length === 0) return columns
    const colMap = new Map(columns.map((c) => [c.name, c]))
    const result: SpreadsheetColumn[] = []
    for (const name of activeColumnOrder) {
      const col = colMap.get(name)
      if (col) {
        result.push(col)
        colMap.delete(name)
      }
    }
    for (const col of colMap.values()) {
      result.push(col)
    }
    return result
  }, [columns, activeColumnOrder])

  // Kolon gizleme / gösterme durumu
  const [internalHiddenColumns, setInternalHiddenColumns] = React.useState<string[]>([])
  const [columnMenuOpen, setColumnMenuOpen] = React.useState(false)
  const [columnSearch, setColumnSearch] = React.useState("")
  const [focusedColIndex, setFocusedColIndex] = React.useState<number>(-1)
  const searchInputRef = React.useRef<HTMLInputElement>(null)
  const columnItemRefs = React.useRef<(HTMLLabelElement | null)[]>([])

  React.useEffect(() => {
    setInternalHiddenColumns([])
    setColumnSearch("")
    setFocusedColIndex(-1)
  }, [resetKey])

  // Menü açıldığında odağı arama kutusuna taşı
  React.useEffect(() => {
    if (columnMenuOpen) {
      setFocusedColIndex(-1)
      const timer = setTimeout(() => {
        searchInputRef.current?.focus()
        searchInputRef.current?.select()
      }, 30)
      return () => clearTimeout(timer)
    } else {
      setColumnSearch("")
      setFocusedColIndex(-1)
    }
  }, [columnMenuOpen])

  const activeHiddenColumns = hiddenColumns ?? internalHiddenColumns
  const hiddenSet = React.useMemo(
    () => new Set(activeHiddenColumns),
    [activeHiddenColumns]
  )

  const visibleColumns = React.useMemo(() => {
    if (hiddenSet.size === 0) return orderedColumns
    const filtered = orderedColumns.filter((col) => !hiddenSet.has(col.name))
    // En az 1 kolonun görünür kalmasını garanti et
    return filtered.length > 0 ? filtered : orderedColumns
  }, [orderedColumns, hiddenSet])

  const hiddenColumnsCount = hiddenSet.size

  const toggleColumnVisibility = React.useCallback(
    (columnName: string) => {
      let nextHidden: string[]
      if (hiddenSet.has(columnName)) {
        nextHidden = activeHiddenColumns.filter((name) => name !== columnName)
      } else {
        if (visibleColumns.length <= 1) return
        nextHidden = [...activeHiddenColumns, columnName]
      }

      if (onHiddenColumnsChange) {
        onHiddenColumnsChange(nextHidden)
      } else {
        setInternalHiddenColumns(nextHidden)
      }
    },
    [hiddenSet, activeHiddenColumns, visibleColumns.length, onHiddenColumnsChange]
  )


  const filteredMenuColumns = React.useMemo(() => {
    if (!columnSearch.trim()) return orderedColumns
    const query = columnSearch.toLowerCase().trim()
    return orderedColumns.filter(
      (c) =>
        c.label.toLowerCase().includes(query) ||
        c.name.toLowerCase().includes(query)
    )
  }, [orderedColumns, columnSearch])

  const handleColumnSearchChange = React.useCallback((val: string) => {
    setColumnSearch(val)
    setFocusedColIndex(-1)
  }, [])

  const handleMenuKeyDown = React.useCallback(
    (event: React.KeyboardEvent) => {
      const count = filteredMenuColumns.length

      if (event.key === "ArrowDown") {
        event.preventDefault()
        if (count === 0) return
        setFocusedColIndex((prev) => {
          const next = prev < count - 1 ? prev + 1 : 0
          columnItemRefs.current[next]?.scrollIntoView({ block: "nearest" })
          return next
        })
      } else if (event.key === "ArrowUp") {
        event.preventDefault()
        if (count === 0) return
        setFocusedColIndex((prev) => {
          if (prev === -1) {
            const next = count - 1
            columnItemRefs.current[next]?.scrollIntoView({ block: "nearest" })
            return next
          }
          if (prev === 0) {
            searchInputRef.current?.focus()
            return -1
          }
          const next = prev - 1
          columnItemRefs.current[next]?.scrollIntoView({ block: "nearest" })
          return next
        })
      } else if (event.key === "Enter") {
        event.preventDefault()
        if (focusedColIndex >= 0 && focusedColIndex < count) {
          toggleColumnVisibility(filteredMenuColumns[focusedColIndex].name)
        } else if (focusedColIndex === -1 && count > 0) {
          toggleColumnVisibility(filteredMenuColumns[0].name)
        }
      } else if (event.key === " ") {
        // Sadece listede bir kolon seçiliyken Space ile aç/kapat (arama kutusunda boşluk yazabilsin)
        if (focusedColIndex >= 0 && focusedColIndex < count) {
          event.preventDefault()
          toggleColumnVisibility(filteredMenuColumns[focusedColIndex].name)
        }
      } else if (event.key === "Escape") {
        if (columnSearch) {
          event.preventDefault()
          event.stopPropagation()
          setColumnSearch("")
          setFocusedColIndex(-1)
          searchInputRef.current?.focus()
        } else {
          setColumnMenuOpen(false)
        }
      }
    },
    [filteredMenuColumns, focusedColIndex, columnSearch, toggleColumnVisibility]
  )

  // Sürükle - bırak görsel durumları
  const [draggedColName, setDraggedColName] = React.useState<string | null>(null)
  const [dropTarget, setDropTarget] = React.useState<{
    name: string
    position: "before" | "after"
  } | null>(null)
  const isDraggingRef = React.useRef(false)
  const isResizingRef = React.useRef(false)
  const isHoveringSeparatorRef = React.useRef(false)

  const [internalSort, setInternalSort] = React.useState<{
    column: string | null
    direction: "asc" | "desc" | null
  }>({
    column: null,
    direction: null,
  })

  const activeSortColumn = sortColumn !== undefined ? sortColumn : internalSort.column
  const activeSortDirection = sortDirection !== undefined ? sortDirection : internalSort.direction

  const handleHeaderClick = React.useCallback(
    (col: SpreadsheetColumn) => {
      // Sürükleme veya boyutlandırma işlemi yeni bittiyse tıklama (sıralama) tetikleme
      if (isDraggingRef.current || isResizingRef.current || resizeRef.current !== null) return
      if (disableSorting || col.sortable === false) return

      let nextDir: "asc" | "desc" | null = "asc"
      if (activeSortColumn === col.name) {
        if (activeSortDirection === "asc") {
          nextDir = "desc"
        } else if (activeSortDirection === "desc") {
          nextDir = null
        } else {
          nextDir = "asc"
        }
      }

      if (onSortChange) {
        onSortChange(col.name, nextDir)
      } else {
        setInternalSort({
          column: nextDir ? col.name : null,
          direction: nextDir,
        })
      }
    },
    [disableSorting, activeSortColumn, activeSortDirection, onSortChange]
  )

  const handleDragStart = React.useCallback(
    (event: React.DragEvent, col: SpreadsheetColumn) => {
      // Yeniden boyutlandırma sırasında veya ayırıcı çizgiden sürüklemeyi kesinlikle engelle
      if (
        disableColumnReorder ||
        resizeRef.current !== null ||
        isResizingRef.current ||
        isHoveringSeparatorRef.current
      ) {
        event.preventDefault()
        return
      }

      const target = event.target as HTMLElement | null
      if (target?.closest('[role="separator"]')) {
        event.preventDefault()
        return
      }

      isDraggingRef.current = true
      event.dataTransfer.setData("text/plain", col.name)
      event.dataTransfer.effectAllowed = "move"
      setDraggedColName(col.name)
    },
    [disableColumnReorder]
  )

  const handleDragOver = React.useCallback(
    (event: React.DragEvent, col: SpreadsheetColumn) => {
      if (resizeRef.current !== null || isResizingRef.current) return
      if (!draggedColName || draggedColName === col.name) return
      event.preventDefault()
      event.dataTransfer.dropEffect = "move"

      const rect = event.currentTarget.getBoundingClientRect()
      const midpoint = rect.left + rect.width / 2
      const position: "before" | "after" = event.clientX < midpoint ? "before" : "after"

      setDropTarget((prev) => {
        if (prev?.name === col.name && prev?.position === position) return prev
        return { name: col.name, position }
      })
    },
    [draggedColName]
  )

  const handleDragLeave = React.useCallback(
    (event: React.DragEvent, col: SpreadsheetColumn) => {
      const related = event.relatedTarget as HTMLElement | null
      if (!event.currentTarget.contains(related)) {
        setDropTarget((prev) => (prev?.name === col.name ? null : prev))
      }
    },
    []
  )

  const handleDrop = React.useCallback(
    (event: React.DragEvent, col: SpreadsheetColumn) => {
      event.preventDefault()
      if (resizeRef.current !== null || isResizingRef.current) {
        setDraggedColName(null)
        setDropTarget(null)
        return
      }
      if (!draggedColName || draggedColName === col.name) {
        setDraggedColName(null)
        setDropTarget(null)
        setTimeout(() => {
          isDraggingRef.current = false
        }, 50)
        return
      }

      const rect = event.currentTarget.getBoundingClientRect()
      const midpoint = rect.left + rect.width / 2
      const position: "before" | "after" = event.clientX < midpoint ? "before" : "after"

      const currentOrder = orderedColumns.map((c) => c.name)
      const fromIndex = currentOrder.indexOf(draggedColName)
      if (fromIndex !== -1) {
        const nextOrder = [...currentOrder]
        nextOrder.splice(fromIndex, 1)

        let targetIndex = nextOrder.indexOf(col.name)
        if (position === "after") {
          targetIndex += 1
        }
        nextOrder.splice(targetIndex, 0, draggedColName)

        if (onColumnOrderChange) {
          onColumnOrderChange(nextOrder)
        } else {
          setInternalColumnOrder(nextOrder)
        }
      }

      setDraggedColName(null)
      setDropTarget(null)
      setTimeout(() => {
        isDraggingRef.current = false
      }, 50)
    },
    [draggedColName, orderedColumns, onColumnOrderChange]
  )

  const handleDragEnd = React.useCallback(() => {
    setDraggedColName(null)
    setDropTarget(null)
    setTimeout(() => {
      isDraggingRef.current = false
    }, 50)
  }, [])

  const [colWidths, setColWidths] = React.useState<
    Record<string, string | number>
  >({})
  const resizeRef = React.useRef<{
    startX: number
    startWidth: number
    name: string
    moved?: boolean
  } | null>(null)

  // resetKey/başlangıç genişlikleri değişince sütun genişliklerini başa al —
  // render sırasında state ayarlama (içerik anahtarı ile, inline objelerde döngüsüz).
  const initialWidthsKey = React.useMemo(
    () => JSON.stringify(initialColWidths ?? null),
    [initialColWidths]
  )
  const widthsSyncKey = `${String(resetKey)}|${initialWidthsKey}`
  const [syncedWidthsKey, setSyncedWidthsKey] = React.useState(widthsSyncKey)
  if (syncedWidthsKey !== widthsSyncKey) {
    setSyncedWidthsKey(widthsSyncKey)
    setColWidths(initialColWidths ?? {})
  }

  const getColWidth = React.useCallback(
    (col: SpreadsheetColumn): number | string => {
      if (colWidths[col.name] !== undefined) return colWidths[col.name]!
      if (initialColWidths?.[col.name] !== undefined) return initialColWidths[col.name]!
      return getDefaultColumnWidth(col)
    },
    [colWidths, initialColWidths]
  )

  const handleResetColumns = React.useCallback(() => {
    if (onHiddenColumnsChange) {
      onHiddenColumnsChange([])
    } else {
      setInternalHiddenColumns([])
    }
    if (onColumnOrderChange) {
      onColumnOrderChange([])
    } else {
      setInternalColumnOrder(null)
    }
    setColWidths(initialColWidths ?? {})
  }, [onHiddenColumnsChange, onColumnOrderChange, initialColWidths])

  const totalTableWidth = React.useMemo(() => {
    return visibleColumns.reduce((sum, col) => {
      const w = getColWidth(col)
      if (typeof w === "number") return sum + w
      if (typeof w === "string" && w.endsWith("px")) return sum + parseFloat(w)
      if (typeof w === "string" && w.endsWith("%")) return sum + 110
      return sum + 100
    }, 0)
  }, [visibleColumns, getColWidth])

  const handleResizeStart = React.useCallback(
    (event: React.PointerEvent, col: SpreadsheetColumn) => {
      event.preventDefault()
      event.stopPropagation()
      isResizingRef.current = true
      isDraggingRef.current = false
      setDraggedColName(null)
      setDropTarget(null)
      const th = (event.currentTarget as HTMLElement).closest("th")
      const fallbackW = typeof getColWidth(col) === "number" ? (getColWidth(col) as number) : 100
      const startWidth = th?.getBoundingClientRect().width || fallbackW
      resizeRef.current = {
        startX: event.clientX,
        startWidth,
        name: col.name,
        moved: false,
      }
      const target = event.currentTarget as HTMLElement
      if (target.hasPointerCapture(event.pointerId)) return
      target.setPointerCapture(event.pointerId)
    },
    [getColWidth]
  )

  const handleResizeMove = React.useCallback((event: React.PointerEvent) => {
    const ref = resizeRef.current
    if (!ref) return
    const delta = event.clientX - ref.startX
    // 3px altındaki mikro titreşimleri yok say — böylece çift tıkla otomatik sığdırma temiz çalışsın
    if (!ref.moved && Math.abs(delta) < 3) return
    ref.moved = true
    const width = Math.max(MIN_COL_WIDTH, ref.startWidth + delta)
    setColWidths((prev) => ({ ...prev, [ref.name]: Math.round(width) }))
  }, [])

  const handleResizeEnd = React.useCallback((event: React.PointerEvent) => {
    const ref = resizeRef.current
    if (!ref) return
    const target = event.currentTarget as HTMLElement
    if (target.hasPointerCapture(event.pointerId)) {
      target.releasePointerCapture(event.pointerId)
    }
    resizeRef.current = null
    setTimeout(() => {
      isResizingRef.current = false
    }, 150)
  }, [])

  /**
   * Çift tıklamayla kolonu içeriğe ve başlığa göre en uygun genişliğe otomatik sığdırır.
   */
  const handleAutoFit = React.useCallback(
    (event: React.MouseEvent, col: SpreadsheetColumn) => {
      event.preventDefault()
      event.stopPropagation()
      const autoWidth = calculateColumnAutoFitWidth(col, items)
      setColWidths((prev) => ({ ...prev, [col.name]: autoWidth }))
    },
    [items]
  )

  const colGroup = (
    <colgroup>
      {visibleColumns.map((col) => {
        const w = getColWidth(col)
        return (
          <col
            key={col.name}
            style={{ width: typeof w === "number" ? `${w}px` : w }}
          />
        )
      })}
      {/* Sağ taraftaki artan boşluğu emen dolgu kolonu */}
      <col />
    </colgroup>
  )

  const renderVirtualRow = React.useCallback(
    (item: T, rowIndex: number) => {
      const rendered = renderRow(item, rowIndex, visibleColumns)
      if (
        React.isValidElement<{ children?: React.ReactNode }>(rendered) &&
        rendered.type === "tr"
      ) {
        const childrenArray = React.Children.toArray(rendered.props.children)
        // Eğer kolon sırası veya görünürlüğü değiştiyse, <td> çocuklarını key'e göre visibleColumns sırasına diz!
        // Böylece renderRow içinde varsayılan sırayla dönen <td> elemanları da anında yeni sıraya dizilir ve gizlenenler elenir.
        const tdMap = new Map<string, React.ReactNode>()
        for (const child of childrenArray) {
          if (React.isValidElement(child) && child.key != null) {
            // React key formatı '.$colName' veya 'colName' olabilir
            const rawKey = String(child.key).replace(/^\.\$/, "")
            tdMap.set(rawKey, child)
          }
        }

        let sortedChildren: React.ReactNode[]
        if (tdMap.size >= visibleColumns.length && visibleColumns.every((c) => tdMap.has(c.name))) {
          sortedChildren = visibleColumns.map((c) => tdMap.get(c.name) ?? null)
        } else {
          sortedChildren = childrenArray
        }

        return React.cloneElement(
          rendered,
          undefined,
          ...sortedChildren,
          <td key="__col_spacer" className={cn(cellClass, "p-0")} aria-hidden />
        )
      }
      return rendered
    },
    [renderRow, visibleColumns]
  )

  // Kontrolsüz (uncontrolled) modda client-side sıralama uygula
  const displayItems = React.useMemo(() => {
    if (onSortChange || disableSorting || !activeSortColumn || !activeSortDirection) {
      return items
    }
    const col = orderedColumns.find((c) => c.name === activeSortColumn)
    const isNum = col?.align === "right"
    const dir = activeSortDirection === "asc" ? 1 : -1

    return [...items].sort((a, b) => {
      const aObj = a as Record<string, unknown>
      const bObj = b as Record<string, unknown>
      const aVal =
        aObj?.values && typeof aObj.values === "object"
          ? (aObj.values as Record<string, unknown>)[activeSortColumn]
          : aObj?.[activeSortColumn]
      const bVal =
        bObj?.values && typeof bObj.values === "object"
          ? (bObj.values as Record<string, unknown>)[activeSortColumn]
          : bObj?.[activeSortColumn]

      if (aVal == null && bVal == null) return 0
      if (aVal == null) return 1
      if (bVal == null) return -1

      if (isNum || typeof aVal === "number" || typeof bVal === "number") {
        const numA = Number(aVal)
        const numB = Number(bVal)
        if (!Number.isNaN(numA) && !Number.isNaN(numB)) {
          return (numA - numB) * dir
        }
      }

      return String(aVal).localeCompare(String(bVal), "tr", { numeric: true }) * dir
    })
  }, [items, onSortChange, disableSorting, activeSortColumn, activeSortDirection, orderedColumns])

  const headerScrollRef = React.useRef<HTMLDivElement>(null)
  const [scrollbarWidth, setScrollbarWidth] = React.useState(0)

  const {
    scrollRef,
    onScroll,
    reset,
    viewportRows,
    startIndex,
    endIndex,
    visible: windowRows,
  } = useVirtualWindow(displayItems, rowHeight)

  const initialSkeletonCount = Math.min(10, Math.max(6, viewportRows ? viewportRows - 4 : 8))

  React.useEffect(() => {
    reset()
    if (headerScrollRef.current) {
      headerScrollRef.current.scrollLeft = 0
    }
  }, [resetKey, reset, activeSortColumn, activeSortDirection])

  // Dikey scrollbar genişliğini ölç — başlığın sağ ucunu body scrollbar'ı ile tam hizalar
  React.useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const updateScrollbarWidth = () => {
      const sw = el.offsetWidth - el.clientWidth
      setScrollbarWidth((prev) => (prev !== sw ? sw : prev))
    }
    updateScrollbarWidth()
    const observer = new ResizeObserver(updateScrollbarWidth)
    observer.observe(el)
    return () => observer.disconnect()
  }, [scrollRef, displayItems.length, loading])

  const onNeedMoreRef = React.useRef(onNeedMore)
  React.useEffect(() => {
    onNeedMoreRef.current = onNeedMore
  })

  const handleScroll = React.useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      const el = event.currentTarget
      // Yatay kaydırmayı kolon başlıklarına senkronize et
      if (headerScrollRef.current && headerScrollRef.current.scrollLeft !== el.scrollLeft) {
        headerScrollRef.current.scrollLeft = el.scrollLeft
      }
      const sw = el.offsetWidth - el.clientWidth
      if (sw !== scrollbarWidth) {
        setScrollbarWidth(sw)
      }
      onScroll(event)
      if (hasMore && !loadingMore) {
        const remaining = el.scrollHeight - (el.scrollTop + el.clientHeight)
        if (remaining < 300) {
          onNeedMoreRef.current?.()
        }
      }
    },
    [onScroll, hasMore, loadingMore, scrollbarWidth]
  )

  const handleHeaderWheel = React.useCallback(
    (event: React.WheelEvent<HTMLDivElement>) => {
      if (event.deltaX !== 0 && scrollRef.current) {
        scrollRef.current.scrollLeft += event.deltaX
      }
    },
    [scrollRef]
  )

  const handleCopy = React.useCallback((event: React.ClipboardEvent) => {
    const selection = window.getSelection()
    if (!selection || selection.isCollapsed) return
    const rawText = selection.toString()
    if (!rawText) return
    // Tek hücre / tek satır seçiminde tarayıcının eklediği \t ve \n karakterlerini temizle
    const lines = rawText.split(/\r?\n/)
    if (lines.length <= 1) {
      const clean = rawText.trim()
      if (clean) {
        event.clipboardData.setData("text/plain", clean)
        event.preventDefault()
      }
      return
    }
    // Çok satırlı kopyalamalarda da satır başı ve sonundaki gereksiz ayrıcıları temizle
    const cleanLines = lines.map((l) => l.trim()).join("\n").trim()
    if (cleanLines) {
      event.clipboardData.setData("text/plain", cleanLines)
      event.preventDefault()
    }
  }, [])

  return (
    <div className={cn(panelCardClass, "flex-1", className)} onCopy={handleCopy}>
      <div className={panelHeaderClass}>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <Table2 className={panelHeaderIconClass} aria-hidden />
            <span className={panelHeaderTitleClass}>{title}</span>
          </div>
          {subtitle != null ? (
            <span className={panelHeaderSubtitleClass}>{subtitle}</span>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1.5 self-center">
          {headerActions}
          {!disableColumnVisibility && columns.length > 0 ? (
            <Popover open={columnMenuOpen} onOpenChange={setColumnMenuOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant={hiddenColumnsCount > 0 ? "secondary" : "outline"}
                  size="icon"
                  className="relative size-7 shrink-0"
                  disabled={columns.length === 0}
                  title={
                    hiddenColumnsCount > 0
                      ? `${hiddenColumnsCount} kolon gizli — Kolonları Göster / Gizle`
                      : "Kolonları Göster / Gizle"
                  }
                  aria-label="Kolonları Göster / Gizle"
                >
                  <Columns3 className="size-3.5" />
                  {hiddenColumnsCount > 0 ? (
                    <span className="absolute -top-1 -right-1 flex size-3.5 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground shadow-xs">
                      {hiddenColumnsCount}
                    </span>
                  ) : null}
                </Button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                sideOffset={6}
                className="w-64 p-2 shadow-lg flex flex-col gap-1.5"
                onOpenAutoFocus={(e) => {
                  e.preventDefault()
                  searchInputRef.current?.focus()
                }}
                onKeyDown={handleMenuKeyDown}
              >
                <div className="flex items-center justify-between border-b border-border/50 pb-1.5">
                  <div className="flex items-center gap-1.5 font-medium text-foreground text-xs">
                    <Columns3 className="size-3.5 text-muted-foreground" />
                    <span>Kolonlar</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-muted-foreground tabular-nums">
                      {visibleColumns.length} / {orderedColumns.length}
                    </span>
                    <button
                      type="button"
                      disabled={
                        hiddenColumnsCount === 0 &&
                        (!activeColumnOrder || activeColumnOrder.length === 0) &&
                        Object.keys(colWidths).length === 0
                      }
                      onClick={handleResetColumns}
                      className="flex size-5 items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted/70 disabled:opacity-30 disabled:pointer-events-none transition-colors cursor-pointer"
                      title="Varsayılana Sıfırla"
                      aria-label="Varsayılana Sıfırla"
                    >
                      <RotateCcw className="size-3" />
                    </button>
                  </div>
                </div>

                {/* Kolon arama (her zaman görünür, menü açıldığında otomatik odaklanır) */}
                <div className="relative flex items-center">
                  <Search className="absolute left-2 size-3 text-muted-foreground pointer-events-none" />
                  <Input
                    ref={searchInputRef}
                    value={columnSearch}
                    onChange={(e) => handleColumnSearchChange(e.target.value)}
                    placeholder="Kolon ara…"
                    className="h-7 pl-7 pr-6 text-xs"
                    autoFocus
                  />
                  {columnSearch ? (
                    <button
                      type="button"
                      onClick={() => {
                        setColumnSearch("")
                        setFocusedColIndex(-1)
                        searchInputRef.current?.focus()
                      }}
                      className="absolute right-1.5 flex size-4 items-center justify-center rounded text-muted-foreground hover:text-foreground"
                    >
                      <X className="size-3" />
                    </button>
                  ) : null}
                </div>

                {/* Kolon Listesi (Klavye Ok Tuşları ile gezinilebilir, Boşluk/Enter ile seçilebilir) */}
                <div className="max-h-56 overflow-y-auto space-y-0.5 pr-0.5" role="listbox">
                  {filteredMenuColumns.map((col, index) => {
                    const isVisible = !hiddenSet.has(col.name)
                    const isLastVisible = isVisible && visibleColumns.length <= 1
                    const isFocused = focusedColIndex === index

                    return (
                      <label
                        key={col.name}
                        ref={(el) => {
                          columnItemRefs.current[index] = el
                        }}
                        tabIndex={-1}
                        onClick={() => setFocusedColIndex(index)}
                        onMouseEnter={() => setFocusedColIndex(index)}
                        className={cn(
                          "flex items-center gap-2 rounded px-2 py-1.5 text-xs transition-colors select-none",
                          isFocused && "bg-accent text-accent-foreground",
                          !isFocused && "hover:bg-muted/60 text-foreground",
                          isLastVisible
                            ? "opacity-50 cursor-not-allowed bg-muted/20"
                            : "cursor-pointer"
                        )}
                        title={isLastVisible ? "En az bir kolon görünür kalmalıdır" : undefined}
                      >
                        <Checkbox
                          checked={isVisible}
                          disabled={isLastVisible}
                          tabIndex={-1}
                          onCheckedChange={() => toggleColumnVisibility(col.name)}
                        />
                        <span className="truncate flex-1">{col.label}</span>
                        {col.align === "right" ? (
                          <span className="text-[10px] text-muted-foreground/60 font-mono">123</span>
                        ) : null}
                      </label>
                    )
                  })}
                  {filteredMenuColumns.length === 0 ? (
                    <div className="py-3 text-center text-xs text-muted-foreground">
                      Kolon bulunamadı
                    </div>
                  ) : null}
                </div>
              </PopoverContent>
            </Popover>
          ) : null}
          {onToggleFilterRow ? (
            <Button
              type="button"
              variant={showFilterRow ? "secondary" : "outline"}
              size="icon"
              className="size-7 shrink-0"
              disabled={columns.length === 0}
              onClick={() => onToggleFilterRow(!showFilterRow)}
              title={showFilterRow ? "Hide filter row" : "Show filter row"}
              aria-label={
                showFilterRow ? "Hide filter row" : "Show filter row"
              }
            >
              <ListFilter className="size-3.5" />
            </Button>
          ) : null}
        </div>
      </div>

      {loading && progressValue != null && progressValue < 100 ? (
        <Progress value={progressValue} className="h-0.5 w-full shrink-0 rounded-none bg-primary/10" />
      ) : null}

      {columns.length === 0 ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 p-6 text-xs text-muted-foreground">
          {loading ? (
            <>
              <Spinner className="size-5 text-primary" />
              <span>Preparing report...</span>
            </>
          ) : (
            <span>{emptyMessage}</span>
          )}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {/* Sabit Kolon Başlıkları Alanı (Dikey scrollbar dışındadır; dikey scroll tam buradan başlar) */}
          <div className="flex shrink-0 bg-muted/40">
            <div
              ref={headerScrollRef}
              onWheel={handleHeaderWheel}
              className="min-w-0 flex-1 overflow-x-hidden"
            >
              <div style={{ width: totalTableWidth > 0 ? `${totalTableWidth}px` : "100%", minWidth: "100%" }}>
                <table
                  className="w-full table-fixed caption-bottom border-separate border-spacing-0 text-xs"
                  style={{ width: totalTableWidth > 0 ? `${totalTableWidth}px` : "100%", minWidth: "100%" }}
                >
                  {colGroup}
                  <thead>
                    <tr>
                      {visibleColumns.map((col) => {
                        const w = getColWidth(col)
                        const isSorted =
                          activeSortColumn === col.name && activeSortDirection !== null
                        const isAsc = isSorted && activeSortDirection === "asc"
                        const isDesc = isSorted && activeSortDirection === "desc"
                        const canSort = !disableSorting && col.sortable !== false
                        const canDrag = !disableColumnReorder
                        const isBeingDragged = draggedColName === col.name
                        const isDropBefore = dropTarget?.name === col.name && dropTarget.position === "before"
                        const isDropAfter = dropTarget?.name === col.name && dropTarget.position === "after"

                        let sortTooltip = col.label
                        if (canSort) {
                          if (!isSorted) {
                            sortTooltip = `${col.label} — Sıralamak için tıkla (Artan)`
                          } else if (isAsc) {
                            sortTooltip = `${col.label} — Ters sıralamak için tıkla (Azalan)`
                          } else {
                            sortTooltip = `${col.label} — Doğal sıraya dönmek için tıkla`
                          }
                        }
                        if (canDrag) {
                          sortTooltip += " (Sırasını değiştirmek için sürükleyin)"
                        }

                        return (
                          <th
                            key={col.name}
                            draggable={canDrag}
                            onDragStart={(e) => handleDragStart(e, col)}
                            onDragOver={(e) => handleDragOver(e, col)}
                            onDragLeave={(e) => handleDragLeave(e, col)}
                            onDrop={(e) => handleDrop(e, col)}
                            onDragEnd={handleDragEnd}
                            className={cn(
                              headClass,
                              "relative overflow-hidden group/th select-none",
                              canDrag && "cursor-grab active:cursor-grabbing",
                              canSort && "hover:bg-muted/70 transition-colors",
                              col.align === "left" ? "text-left" : "text-right",
                              isBeingDragged && "opacity-40 bg-muted/90",
                              isDropBefore &&
                                "before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-primary before:z-20",
                              isDropAfter &&
                                "after:absolute after:inset-y-0 after:right-0 after:w-1 after:bg-primary after:z-20"
                            )}
                            style={{ width: typeof w === "number" ? `${w}px` : w }}
                            title={sortTooltip}
                            onClick={() => handleHeaderClick(col)}
                          >
                            <div
                              className={cn(
                                "flex h-full w-full items-center min-w-0 pr-2",
                                col.align === "right" && "justify-end"
                              )}
                            >
                              <span className="truncate">{col.label}</span>
                              {canSort ? (
                                <span className="ml-1 inline-flex shrink-0 items-center justify-center">
                                  {isAsc ? (
                                    <ArrowUp
                                      className="size-3 text-primary stroke-[2.5]"
                                      aria-label="Artan sırada"
                                    />
                                  ) : isDesc ? (
                                    <ArrowDown
                                      className="size-3 text-primary stroke-[2.5]"
                                      aria-label="Azalan sırada"
                                    />
                                  ) : (
                                    <ArrowUpDown className="size-3 text-muted-foreground/40 opacity-0 transition-opacity group-hover/th:opacity-100" />
                                  )}
                                </span>
                              ) : null}
                            </div>
                            <span
                              role="separator"
                              aria-orientation="vertical"
                              aria-label={`Resize ${col.label} column (double-click to auto fit)`}
                              title="Genişletmek için sürükleyin, içeriğe tam sığdırmak için çift tıklayın"
                              draggable={false}
                              onMouseEnter={() => {
                                isHoveringSeparatorRef.current = true
                              }}
                              onMouseLeave={() => {
                                isHoveringSeparatorRef.current = false
                              }}
                              onMouseDown={(e) => {
                                // HTML5 dragstart'ın th seviyesinde başlamasını kesinlikle engelle
                                e.stopPropagation()
                              }}
                              onDragStart={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                              }}
                              className="absolute inset-y-0 right-0 z-10 w-4 cursor-col-resize touch-none select-none after:absolute after:inset-y-0 after:right-0 after:w-px after:bg-border after:opacity-0 hover:after:bg-primary/40 hover:after:opacity-100 active:after:bg-primary/60 active:after:opacity-100"
                              onPointerDown={(event) =>
                                handleResizeStart(event, col)
                              }
                              onPointerMove={handleResizeMove}
                              onPointerUp={handleResizeEnd}
                              onPointerCancel={handleResizeEnd}
                              onDoubleClick={(event) =>
                                handleAutoFit(event, col)
                              }
                            />
                          </th>
                        )
                      })}
                      {/* Sağ taraftaki artan boşluğu emen dolgu başlık hücresi */}
                      <th className={cn(headClass, "p-0")} aria-hidden />
                    </tr>
                    {showFilterRow && renderFilterCell ? (
                      <tr className={filterRowClassName}>
                        {visibleColumns.map((col, index) => (
                          <th key={col.name} className={cellClass}>
                            {renderFilterCell(col, index)}
                          </th>
                        ))}
                        <th className={cn(cellClass, "p-0")} aria-hidden />
                      </tr>
                    ) : null}
                  </thead>
                </table>
              </div>
            </div>
            {scrollbarWidth > 0 ? (
              <div
                style={{ width: `${scrollbarWidth}px` }}
                className="shrink-0 bg-muted/40 border-b border-border/60"
                aria-hidden
              />
            ) : null}
          </div>

          {/* Gövde Veri Satırları Alanı (Dikey scrollbar tam buradan başlar) */}
          <div
            className="min-h-0 flex-1 overflow-auto"
            ref={scrollRef}
            onScroll={handleScroll}
          >
            <div style={{ width: totalTableWidth > 0 ? `${totalTableWidth}px` : "100%", minWidth: "100%" }}>
              <table
                className="w-full table-fixed caption-bottom border-separate border-spacing-0 text-xs"
                style={{ width: totalTableWidth > 0 ? `${totalTableWidth}px` : "100%", minWidth: "100%" }}
              >
                {colGroup}
                <tbody>
                {displayItems.length === 0 && loading ? (
                  Array.from({ length: initialSkeletonCount }, (_, skeletonIndex) => (
                    <tr key={`initial-skeleton-${skeletonIndex}`} aria-hidden>
                      {visibleColumns.map((col) => (
                        <td
                          key={col.name}
                          className={cn(
                            cellClass,
                            col.align === "left" ? "text-left" : "text-right"
                          )}
                        >
                          <div
                            className={cn(
                              "flex h-7 min-w-0 items-center px-2",
                              col.align === "right" && "justify-end"
                            )}
                          >
                            <Skeleton
                              className={cn(
                                "h-3.5",
                                col.align === "right" ? "w-16" : "w-24 max-w-[80%]"
                              )}
                            />
                          </div>
                        </td>
                      ))}
                      <td className={cn(cellClass, "p-0")} aria-hidden />
                    </tr>
                  ))
                ) : displayItems.length === 0 ? (
                  <tr>
                    <td
                      colSpan={visibleColumns.length + 1}
                      className="py-8 text-center text-xs text-muted-foreground"
                    >
                      Kayıt bulunamadı
                    </td>
                  </tr>
                ) : (
                  <>
                    {startIndex > 0 ? (
                      <tr
                        aria-hidden
                        className="p-0"
                        style={{ height: startIndex * rowHeight }}
                      >
                        <td colSpan={visibleColumns.length + 1} className="p-0 border-0" />
                      </tr>
                    ) : null}
                    {windowRows.map((row, index) =>
                      renderVirtualRow(row, startIndex + index)
                    )}
                    {loadingMore && hasMore
                      ? Array.from({ length: SKELETON_ROWS }, (_, skeletonIndex) => (
                          <tr key={`skeleton-${skeletonIndex}`} aria-hidden>
                            {visibleColumns.map((col) => (
                              <td
                                key={col.name}
                                className={cn(
                                  cellClass,
                                  col.align === "left" ? "text-left" : "text-right"
                                )}
                              >
                                <div
                                  className={cn(
                                    "flex h-7 min-w-0 items-center px-2",
                                    col.align === "right" && "justify-end"
                                  )}
                                >
                                  <Skeleton
                                    className={cn(
                                      "h-3.5",
                                      col.align === "right" ? "w-16" : "w-24 max-w-[80%]"
                                    )}
                                  />
                                </div>
                              </td>
                            ))}
                            <td className={cn(cellClass, "p-0")} aria-hidden />
                          </tr>
                        ))
                      : null}
                    {endIndex < displayItems.length ? (
                      <tr
                        aria-hidden
                        className="p-0"
                        style={{ height: (displayItems.length - endIndex) * rowHeight }}
                      >
                        <td colSpan={visibleColumns.length + 1} className="p-0 border-0" />
                      </tr>
                    ) : null}
                  </>
                )}
                </tbody>
            </table>
          </div>
        </div>
      </div>
    )}
  </div>
)
}
