import * as React from "react"
import { Columns3, Pin, RotateCcw, Search, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/utils/cn"
import type { SpreadsheetColumn } from "./types"
import { ColumnTypeBadge } from "./ColumnTypeBadge"

export interface ColumnManagementMenuProps {
  columns: readonly SpreadsheetColumn[]
  orderedColumns: SpreadsheetColumn[]
  visibleColumns: SpreadsheetColumn[]
  hiddenSet: Set<string>
  pinnedSet: Set<string>
  toggleColumnVisibility: (columnName: string) => void
  toggleColumnPin: (columnName: string) => void
  onResetColumns: () => void
  canReset: boolean
  hiddenColumnsCount: number
  disabled?: boolean
}

export function ColumnManagementMenu({
  columns,
  orderedColumns,
  visibleColumns,
  hiddenSet,
  pinnedSet,
  toggleColumnVisibility,
  toggleColumnPin,
  onResetColumns,
  canReset,
  hiddenColumnsCount,
  disabled = false,
}: ColumnManagementMenuProps) {
  const [columnMenuOpen, setColumnMenuOpen] = React.useState(false)
  const [columnSearch, setColumnSearch] = React.useState("")
  const [focusedColIndex, setFocusedColIndex] = React.useState<number>(-1)
  const searchInputRef = React.useRef<HTMLInputElement>(null)
  const columnItemRefs = React.useRef<(HTMLDivElement | null)[]>([])

  const handleOpenChange = React.useCallback((open: boolean) => {
    setColumnMenuOpen(open)
    setFocusedColIndex(-1)
    if (!open) {
      setColumnSearch("")
    }
  }, [])

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
      } else if (event.key === "p" || event.key === "P") {
        // Seçili kolonu sabitle / sabitlemeyi kaldır
        if (focusedColIndex >= 0 && focusedColIndex < count) {
          event.preventDefault()
          toggleColumnPin(filteredMenuColumns[focusedColIndex].name)
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
    [filteredMenuColumns, focusedColIndex, columnSearch, toggleColumnVisibility, toggleColumnPin]
  )

  return (
    <Popover open={columnMenuOpen} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="relative size-7 shrink-0"
          disabled={disabled || columns.length === 0}
          title="Kolonları Yönet (Görünürlük, Sıralama, Sabitleme)"
          aria-label="Kolonları Yönet"
        >
          <Columns3 className="size-3.5" />
          {hiddenColumnsCount > 0 ? (
            <span className="absolute -top-1 -right-1 flex size-3.5 items-center justify-center rounded-full bg-primary text-[9px] font-medium text-primary-foreground">
              {hiddenColumnsCount}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={6}
        className="w-72 p-2 shadow-lg flex flex-col gap-1.5"
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          searchInputRef.current?.focus()
          searchInputRef.current?.select()
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
              disabled={!canReset}
              onClick={onResetColumns}
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
            const isPinned = pinnedSet.has(col.name)
            const prevCol = index > 0 ? filteredMenuColumns[index - 1] : null
            const isFirstUnpinned = !isPinned && prevCol !== null && pinnedSet.has(prevCol.name)

            return (
              <React.Fragment key={col.name}>
                {isFirstUnpinned ? (
                  <div
                    className="my-1.5 border-t border-border/60"
                    role="separator"
                    aria-orientation="horizontal"
                  />
                ) : null}
                <div
                  ref={(el) => {
                    columnItemRefs.current[index] = el
                  }}
                  tabIndex={-1}
                  onClick={() => setFocusedColIndex(index)}
                  onMouseEnter={() => setFocusedColIndex(index)}
                  className={cn(
                    "group flex items-center justify-between gap-1.5 rounded px-2 py-1 text-xs transition-colors select-none",
                    isFocused && "bg-accent text-accent-foreground",
                    !isFocused && "hover:bg-muted/60 text-foreground"
                  )}
                >
                  <div
                    className={cn(
                      "flex min-w-0 flex-1 items-center gap-2",
                      isLastVisible
                        ? "opacity-50 cursor-not-allowed"
                        : "cursor-pointer"
                    )}
                    onClick={() => !isLastVisible && toggleColumnVisibility(col.name)}
                    title={isLastVisible ? "En az bir kolon görünür kalmalıdır" : undefined}
                  >
                    <Checkbox
                      checked={isVisible}
                      disabled={isLastVisible}
                      tabIndex={-1}
                      onCheckedChange={() => toggleColumnVisibility(col.name)}
                    />
                    <span className="truncate flex-1">{col.label}</span>
                  </div>

                  {/* Sağ Slot: Varsayılan Veri Tipi Rozeti <-> Hover / Klavye Odak Pin/Unpin Butonu */}
                  <div className="relative flex size-6 shrink-0 items-center justify-center">
                    {/* Varsayılan: Veri Tipi Rozeti (Hover ve Klavye Odak durumunda yerini Pin/Unpin butonuna bırakır) */}
                    <div
                      className={cn(
                        "flex items-center justify-center transition-opacity",
                        isFocused
                          ? "opacity-0 pointer-events-none"
                          : "group-hover:opacity-0 group-hover:pointer-events-none"
                      )}
                    >
                      <ColumnTypeBadge col={col} isPinned={isPinned} />
                    </div>

                    {/* Hover / Klavye Odak: Pin / Unpin Butonu */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        toggleColumnPin(col.name)
                      }}
                      disabled={!isVisible}
                      className={cn(
                        "absolute inset-0 flex items-center justify-center rounded transition-all",
                        isFocused
                          ? "opacity-100 scale-100"
                          : "opacity-0 scale-90 group-hover:opacity-100 group-hover:scale-100 focus:opacity-100",
                        isPinned
                          ? "text-primary hover:text-primary/80 hover:bg-primary/10"
                          : "text-muted-foreground/60 hover:text-foreground hover:bg-muted",
                        !isVisible && "opacity-20 cursor-not-allowed pointer-events-none"
                      )}
                      title={
                        !isVisible
                          ? "Gizli kolon sabitlenemez"
                          : isPinned
                          ? "Sabitlemeyi kaldır (P)"
                          : "Sola sabitle (P)"
                      }
                      aria-label={
                        isPinned
                          ? `${col.label} sabitlemesini kaldır`
                          : `${col.label} sola sabitle`
                      }
                    >
                      <Pin
                        className={cn(
                          "size-3.5 transition-transform",
                          isPinned ? "fill-primary rotate-45" : "-rotate-45"
                        )}
                      />
                    </button>
                  </div>
                </div>
              </React.Fragment>
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
  )
}
