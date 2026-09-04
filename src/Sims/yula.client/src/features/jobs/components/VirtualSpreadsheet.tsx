"use client";

import * as React from "react"
import { ListFilter, Table2 } from "lucide-react"
import { Button } from "@/components/ui/button"
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

export type SpreadsheetColumn = {
  name: string
  label: string
  align?: "left" | "right"
}

export type VirtualSpreadsheetProps<T> = {
  /** Görünen (filtreli) kolonlar. Sıfırsa boş durum gösterilir. */
  columns: readonly SpreadsheetColumn[]
  /** Sanal pencereye alınacak tam (filtreli) satır listesi. */
  items: readonly T[]
  /** Her satır için `<tr>...</tr>` üreten renderer (key'i renderer sağlar). */
  renderRow: (item: T, index: number) => React.ReactNode
  rowHeight?: number
  /**
   * Başlangıç kolon genişlikleri (örn. `{ Name: "20%" }`). Kullanıcı handle ile
   * sürükledikçe piksel değerine güncellenir.
   */
  initialColWidths?: Record<string, string | number>
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
  const [colWidths, setColWidths] = React.useState<
    Record<string, string | number>
  >({})
  const resizeRef = React.useRef<{
    startX: number
    startWidth: number
    name: string
  } | null>(null)

  React.useEffect(() => {
    setColWidths(initialColWidths ?? {})
  }, [resetKey, initialColWidths])

  const handleResizeStart = React.useCallback(
    (event: React.PointerEvent, col: SpreadsheetColumn) => {
      event.preventDefault()
      event.stopPropagation()
      const th = (event.currentTarget as HTMLElement).closest("th")
      const startWidth = th?.getBoundingClientRect().width ?? 0
      resizeRef.current = { startX: event.clientX, startWidth, name: col.name }
      const target = event.currentTarget as HTMLElement
      if (target.hasPointerCapture(event.pointerId)) return
      target.setPointerCapture(event.pointerId)
    },
    []
  )

  const handleResizeMove = React.useCallback((event: React.PointerEvent) => {
    const ref = resizeRef.current
    if (!ref) return
    const delta = event.clientX - ref.startX
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
  }, [])

  const colGroup = (
    <colgroup>
      {columns.map((col) => (
        <col
          key={col.name}
          style={{ width: colWidths[col.name] ?? undefined }}
        />
      ))}
    </colgroup>
  )

  const {
    scrollRef,
    onScroll,
    reset,
    viewportRows,
    startIndex,
    endIndex,
    visible: windowRows,
  } = useVirtualWindow(items, rowHeight)

  const initialSkeletonCount = Math.min(10, Math.max(6, viewportRows ? viewportRows - 4 : 8))

  React.useEffect(() => {
    reset()
  }, [resetKey, reset])

  const onNeedMoreRef = React.useRef(onNeedMore)
  onNeedMoreRef.current = onNeedMore

  const handleScroll = React.useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      onScroll(event)
      if (hasMore && !loadingMore) {
        const el = event.currentTarget
        const remaining = el.scrollHeight - (el.scrollTop + el.clientHeight)
        if (remaining < 300) {
          onNeedMoreRef.current?.()
        }
      }
    },
    [onScroll, hasMore, loadingMore]
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
        <div
          className="min-h-0 flex-1 overflow-auto"
          ref={scrollRef}
          onScroll={handleScroll}
        >
          <div className="min-w-[42rem]">
            <div className="sticky top-0 z-10 bg-card">
              <table className="w-full table-fixed caption-bottom border-separate border-spacing-0 text-xs">
                {colGroup}
                <thead>
                  <tr>
                    {columns.map((col, colIndex) => (
                      <th
                        key={col.name}
                        className={cn(
                          headClass,
                          "relative",
                          col.align === "left" ? "text-left" : "text-right"
                        )}
                        style={{ width: colWidths[col.name] ?? undefined }}
                      >
                        {col.label}
                        {colIndex < columns.length - 1 ? (
                          <span
                            role="separator"
                            aria-orientation="vertical"
                            aria-label={`Resize ${col.label} column`}
                            className="absolute inset-y-0 right-0 z-10 w-4 cursor-col-resize touch-none select-none after:absolute after:inset-y-0 after:right-0 after:w-px after:bg-border after:opacity-0 hover:after:bg-primary/40 hover:after:opacity-100 active:after:bg-primary/60 active:after:opacity-100"
                            onPointerDown={(event) =>
                              handleResizeStart(event, col)
                            }
                            onPointerMove={handleResizeMove}
                            onPointerUp={handleResizeEnd}
                            onPointerCancel={handleResizeEnd}
                          />
                        ) : null}
                      </th>
                    ))}
                  </tr>
                  {showFilterRow && renderFilterCell ? (
                    <tr className={filterRowClassName}>
                      {columns.map((col, index) => (
                        <th key={col.name} className={cellClass}>
                          {renderFilterCell(col, index)}
                        </th>
                      ))}
                    </tr>
                  ) : null}
                </thead>
              </table>
            </div>

            <table className="w-full table-fixed caption-bottom border-separate border-spacing-0 text-xs">
              {colGroup}
              <tbody>
                {items.length === 0 && loading ? (
                  Array.from({ length: initialSkeletonCount }, (_, skeletonIndex) => (
                    <tr key={`initial-skeleton-${skeletonIndex}`} aria-hidden>
                      {columns.map((col) => (
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
                    </tr>
                  ))
                ) : items.length === 0 ? (
                  <tr>
                    <td
                      colSpan={columns.length}
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
                        <td colSpan={columns.length} className="p-0 border-0" />
                      </tr>
                    ) : null}
                    {windowRows.map((row, index) =>
                      renderRow(row, startIndex + index)
                    )}
                    {loadingMore && hasMore
                      ? Array.from({ length: SKELETON_ROWS }, (_, skeletonIndex) => (
                          <tr key={`skeleton-${skeletonIndex}`} aria-hidden>
                            {columns.map((col) => (
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
                          </tr>
                        ))
                      : null}
                    {endIndex < items.length ? (
                      <tr
                        aria-hidden
                        className="p-0"
                        style={{ height: (items.length - endIndex) * rowHeight }}
                      >
                        <td colSpan={columns.length} className="p-0 border-0" />
                      </tr>
                    ) : null}
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
